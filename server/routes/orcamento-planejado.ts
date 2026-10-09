/**
 * Orçamento Planejado (budget_planned): reaplicar valores padrão, eventos com
 * planejamento, CRUD do planejado, "não participou" e o rascunho dos ajustes
 * da tela (por evento + usuário, 08/10).
 * Papéis: financeiro (admin/RH) — guardas em _compartilhado.ts.
 */
import type { Express, Request } from "express";
import { storage } from "../storage";
import { db } from "../db";
import {
  budgetPlanned as budgetPlannedTable,
  events as eventsTable,
  collaborators as collaboratorsTable,
  insertBudgetPlannedSchema,
  type Event as Evento,
  type User,
} from "@shared/schema";
import { eq, inArray, sql as drizzleSql } from "drizzle-orm";
import { isEventBlockedForActor } from "../event-guard";
import { isEventPast } from "@shared/event-window";
import { calcularPlanejadoDaVaga, linhaDoPlanejado } from "@shared/budget-engine";
import { createAuditLog, ehViolacaoDeUnicidade, usuarioDaSessao, requireFinanceUser, requireFinSession, requireFinWrite } from "./_compartilhado";
import { z } from "zod";

/** Teto do rascunho do Planejado: ~200 KB cobrem milhares de vagas ajustadas. */
const LIMITE_DO_RASCUNHO = 200 * 1024;
/** `{ overrides }`: um objeto (campos editados) por id de vaga. */
const corpoDoRascunho = z.object({
  overrides: z.record(z.string().min(1).max(100), z.record(z.string(), z.unknown())),
});
const eventoDoRascunho = (v: unknown): string => (typeof v === "string" && v.length > 0 && v.length <= 100 ? v : "");

export function registrarOrcamentoPlanejado(app: Express): void {
  // Budget Planned — Apply system defaults to all pending (not-yet-sent) records

  // NOTA (dívida registrada em 13/08): o servidor NÃO recalcula totalValue
  // porque o schema não persiste a diária de FDS separada — o total usa
  // diáriaÚtil×diasÚteis + diáriaFDS×diasFDS, mas só a diária útil é gravada.
  // Recalcular a partir dos campos corromperia totais legítimos. O caminho
  // definitivo é adicionar colunas daily_value_weekend em planned/actual.

  /**
   * POST /api/budget-planned/apply-defaults?eventId= — reaplica os valores de
   * SISTEMA aos planejados ainda não enviados ao Realizado.
   *
   * 23/09: eventId obrigatório (antes varria TODOS os eventos e carregava as
   * tabelas inteiras), evento encerrado só pelo administrador, e a fórmula é a
   * MESMA da tela (shared/budget-engine.calcularPlanejadoDaVaga) — antes havia
   * uma segunda fórmula aqui, sem atendimento/percurso/empreita/deflação.
   * Tudo numa transação, em lotes de 10 UPDATEs.
   */
  /** Reaplica os valores de sistema aos planejados NÃO enviados de um evento. */
  async function reaplicarPadroesNoEvento(event: Evento, user: User, req: Request): Promise<number> {
    const eventId = event.id;
    const [allPlanned, allActual, inclusions, allFunctionValues, rawSettings, functionsList, tickets] = await Promise.all([
      storage.getBudgetPlanned(eventId),
      storage.getBudgetActual(eventId),
      storage.getTeamInclusions(false, undefined, { eventId }),
      storage.getAllFunctionValues(),
      storage.getSystemSettings(),
      storage.getFunctions(),
      storage.getTickets(eventId),
    ]);
    const collaboratorIds = Array.from(new Set(allPlanned.map((p) => p.collaboratorId).filter((v): v is string => !!v)));
    const collaboratorsById = new Map(
      (await db.select().from(collaboratorsTable).where(collaboratorIds.length > 0 ? inArray(collaboratorsTable.id, collaboratorIds) : drizzleSql`false`))
        .map((c) => [c.id, c]),
    );

    const cfg: Record<string, number> = {};
    for (const st of rawSettings) { const v = parseInt(st.value, 10); if (Number.isFinite(v)) cfg[st.key] = v; }
    const functionNameById = new Map(functionsList.map((f) => [f.id, f.name]));
    const fvByFunction = new Map(allFunctionValues.map((fv) => [fv.functionId, fv]));
    const ticketByInclusion = new Map(tickets.map((t) => [t.teamInclusionId, t]));
    // Já enviado ao Realizado: não mexe (mesma regra de antes)
    const sentKeys = new Set(allActual.map((a) => `${a.eventId}|${a.collaboratorId}|${a.functionId}`));

    const updates: { id: string; patch: ReturnType<typeof linhaDoPlanejado> }[] = [];
    for (const planned of allPlanned) {
      if (sentKeys.has(`${planned.eventId}|${planned.collaboratorId}|${planned.functionId}`)) continue;
      const inc = inclusions.find((i) => i.collaboratorId === planned.collaboratorId && i.functionId === planned.functionId);
      if (!inc) continue; // sem vaga não há período nem regra — fica como está
      const collaborator = planned.collaboratorId ? collaboratorsById.get(planned.collaboratorId) : undefined;
      const resultado = calcularPlanejadoDaVaga({
        vaga: inc,
        functionName: functionNameById.get(inc.functionId) ?? null,
        collaboratorType: collaborator?.type ?? planned.collaboratorType ?? "freela",
        functionValue: fvByFunction.get(inc.functionId) ?? null,
        settings: cfg,
        eventLocation: event.location ?? null,
        ticket: ticketByInclusion.get(inc.id) ?? null,
      });
      updates.push({ id: planned.id, patch: linhaDoPlanejado(resultado) });
    }

    await db.transaction(async (tx) => {
      const agora = new Date();
      for (let i = 0; i < updates.length; i += 10) {
        await Promise.all(updates.slice(i, i + 10).map((u) =>
          tx.update(budgetPlannedTable).set({ ...u.patch, updatedAt: agora, updatedBy: user.id }).where(eq(budgetPlannedTable.id, u.id)),
        ));
      }
    });
    await createAuditLog("update", "budget_planned", eventId, { eventId, acao: "aplicar valores padrão", updated: updates.length }, user.id, user.name, undefined, req);
    return updates.length;
  }

  app.post("/api/budget-planned/apply-defaults", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    try {
      const eventId = typeof req.query.eventId === "string" && req.query.eventId
        ? req.query.eventId
        : (typeof req.body?.eventId === "string" ? req.body.eventId : "");
      if (!eventId) return res.status(400).json({ message: "Informe o evento (eventId) para aplicar os valores padrão." });
      const event = await storage.getEvent(eventId);
      if (!event) return res.status(404).json({ message: "Evento não encontrado" });
      if (isEventBlockedForActor(event, user)) {
        return res.status(403).json({ message: "Evento encerrado — só o administrador reaplica os valores padrão." });
      }
      res.json({ updated: await reaplicarPadroesNoEvento(event, user, req) });
    } catch (error) {
      console.error("Error applying defaults to planned:", error);
      res.status(500).json({ message: "Erro ao atualizar planejamentos" });
    }
  });

  /**
   * POST /api/budget-planned/apply-defaults/pendentes — o mesmo, em todos os
   * eventos AINDA NÃO ENCERRADOS que têm planejamento (Valores padrão, 08/10).
   * A tela chamava a rota acima sem eventId desde 23/09 e recebia 400: salvar
   * os valores nunca atualizava os pendentes. Evento encerrado fica de fora
   * para todos (inclusive o admin, que reaplica nele pelo Planejado do evento).
   * Uma transação por evento, um evento por vez.
   */
  app.post("/api/budget-planned/apply-defaults/pendentes", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    try {
      const rows = await db.selectDistinct({ eventId: budgetPlannedTable.eventId }).from(budgetPlannedTable);
      const ids = rows.map((r) => r.eventId).filter((v): v is string => !!v);
      const eventos = ids.length > 0 ? await db.select().from(eventsTable).where(inArray(eventsTable.id, ids)) : [];
      let updated = 0;
      let eventosAtualizados = 0;
      for (const event of eventos) {
        if (isEventPast(event.endDate ?? null)) continue;
        const n = await reaplicarPadroesNoEvento(event, user, req);
        updated += n;
        if (n > 0) eventosAtualizados++;
      }
      res.json({ updated, eventos: eventosAtualizados });
    } catch (error) {
      console.error("Error applying defaults to pending planned:", error);
      res.status(500).json({ message: "Erro ao atualizar planejamentos" });
    }
  });

  // Retorna apenas os eventos que têm ao menos um budget_planned — evita carregar todos os registros no cliente
  app.get("/api/events-with-planned", async (req, res) => {
    try {
      const rows = await db.selectDistinct({ eventId: budgetPlannedTable.eventId }).from(budgetPlannedTable);
      const ids = rows.map(r => r.eventId).filter(Boolean) as string[];
      if (ids.length === 0) return res.json([]);
      const evts = await db.select().from(eventsTable).where(inArray(eventsTable.id, ids));
      res.json(evts);
    } catch {
      res.status(500).json({ message: "Erro ao buscar eventos com planejamento" });
    }
  });

  // ── Rascunho do Planejado (08/10) ─────────────────────────────────────────
  // Os ajustes manuais da tela (overrides esparsos por vaga) até o envio ao
  // Realizado, por evento + usuário — antes só no localStorage. Mesma regra de
  // quem grava no Planejado (requireFinWrite: admin e Financeiro, 7da26a56) e
  // SEMPRE o usuário da sessão: nenhum id de usuário é lido do corpo ou da URL.
  // Registradas ANTES de "/api/budget-planned/:id" (senão "rascunho" vira id).
  app.get("/api/budget-planned/rascunho", async (req, res) => {
    const userId = await requireFinWrite(req, res);
    if (!userId) return;
    res.set("Cache-Control", "no-store");
    const eventId = eventoDoRascunho(req.query.eventId);
    if (!eventId) return res.status(400).json({ message: "Informe o evento (eventId)." });
    try {
      const rascunho = await storage.getRascunhoDoPlanejado(eventId, userId);
      res.json(rascunho ? { overrides: rascunho.overrides, updatedAt: rascunho.updatedAt } : { overrides: {} });
    } catch (error) {
      console.error("Error fetching planned draft:", error);
      res.status(500).json({ message: "Erro ao buscar o rascunho do planejado" });
    }
  });

  app.put("/api/budget-planned/rascunho", async (req, res) => {
    const userId = await requireFinWrite(req, res);
    if (!userId) return;
    res.set("Cache-Control", "no-store");
    const eventId = eventoDoRascunho(req.query.eventId);
    if (!eventId) return res.status(400).json({ message: "Informe o evento (eventId)." });
    const corpo = corpoDoRascunho.safeParse(req.body);
    if (!corpo.success) return res.status(400).json({ message: "Rascunho inválido: envie { overrides } com um objeto por vaga." });
    if (Buffer.byteLength(JSON.stringify(corpo.data.overrides), "utf8") > LIMITE_DO_RASCUNHO) {
      return res.status(413).json({ message: "Rascunho grande demais (limite de 200 KB). Envie parte dos ajustes ao Realizado e tente de novo." });
    }
    try {
      const event = await storage.getEvent(eventId);
      if (!event) return res.status(404).json({ message: "Evento não encontrado" });
      const salvo = await storage.salvarRascunhoDoPlanejado(eventId, userId, corpo.data.overrides);
      res.json({ overrides: salvo.overrides, updatedAt: salvo.updatedAt });
    } catch (error) {
      console.error("Error saving planned draft:", error);
      res.status(500).json({ message: "Erro ao salvar o rascunho do planejado" });
    }
  });

  app.delete("/api/budget-planned/rascunho", async (req, res) => {
    const userId = await requireFinWrite(req, res);
    if (!userId) return;
    res.set("Cache-Control", "no-store");
    const eventId = eventoDoRascunho(req.query.eventId);
    if (!eventId) return res.status(400).json({ message: "Informe o evento (eventId)." });
    try {
      await storage.apagarRascunhoDoPlanejado(eventId, userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting planned draft:", error);
      res.status(500).json({ message: "Erro ao apagar o rascunho do planejado" });
    }
  });

  // Budget Planned (Planejado)
  app.get("/api/budget-planned", async (req, res) => {
    if (!await requireFinSession(req, res)) return;
    try {
      const { eventId } = req.query;
      if (eventId) {
        const planned = await storage.getBudgetPlanned(eventId as string);
        res.json(planned);
      } else {
        const all = await storage.getAllBudgetPlanned();
        res.json(all);
      }
    } catch (error) {
      console.error("Error fetching budget planned:", error);
      res.status(500).json({ message: "Erro ao buscar planejamento" });
    }
  });

  app.get("/api/budget-planned/:id", async (req, res) => {
    if (!await requireFinSession(req, res)) return;
    try {
      const planned = await storage.getBudgetPlannedById(req.params.id);
      if (!planned) {
        return res.status(404).json({ message: "Planejamento não encontrado" });
      }
      res.json(planned);
    } catch (error) {
      console.error("Error fetching budget planned:", error);
      res.status(500).json({ message: "Erro ao buscar planejamento" });
    }
  });

  app.post("/api/budget-planned", async (req, res) => {
    const actorId = await requireFinWrite(req, res);
    if (!actorId) return;
    try {
      // Campos de workflow não nascem pela API — têm rotas dedicadas
      const { status: _st, didNotAttend: _dna, ...data } = insertBudgetPlannedSchema.parse(req.body);
      const planned = await storage.createBudgetPlanned(data);
      const actor = usuarioDaSessao(req);
      await createAuditLog('create', 'budget_planned', planned.id, planned, actorId, actor?.name || 'Sistema', undefined, req);
      res.status(201).json(planned);
    } catch (error) {
      // 23505 = unique_violation (constraint criada na migração de 13/08):
      // já existe planejado para este colaborador+função neste evento
      if (ehViolacaoDeUnicidade(error)) {
        return res.status(409).json({ message: "Já existe um planejamento para este colaborador e função neste evento." });
      }
      console.error("Error creating budget planned:", error);
      res.status(400).json({ message: "Erro ao criar planejamento" });
    }
  });

  app.patch("/api/budget-planned/:id", async (req, res) => {
    const actorId = await requireFinWrite(req, res);
    if (!actorId) return;
    try {
      const prev = await storage.getBudgetPlannedById(req.params.id);
      if (!prev) return res.status(404).json({ message: "Planejamento não encontrado" });
      // Validação + allowlist: campos de workflow só mudam pelas rotas dedicadas
      const { status: _st, didNotAttend: _dna, didNotAttendReason: _dnr, ...data } = insertBudgetPlannedSchema.partial().parse(req.body);
      const actor = usuarioDaSessao(req);
      const planned = await storage.updateBudgetPlanned(req.params.id, { ...data, updatedBy: actorId });
      await createAuditLog('update', 'budget_planned', req.params.id, planned, actorId, actor?.name || 'Sistema', prev, req);
      res.json(planned);
    } catch (error) {
      console.error("Error updating budget planned:", error);
      res.status(400).json({ message: "Erro ao atualizar planejamento" });
    }
  });

  app.delete("/api/budget-planned/:id", async (req, res) => {
    const actorId = await requireFinWrite(req, res);
    if (!actorId) return;
    try {
      const prev = await storage.getBudgetPlannedById(req.params.id);
      if (!prev) return res.status(404).json({ message: "Planejamento não encontrado" });
      const actor = usuarioDaSessao(req);
      await storage.deleteBudgetPlanned(req.params.id);
      await createAuditLog('delete', 'budget_planned', req.params.id, prev, actorId, actor?.name || 'Sistema', undefined, req);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting budget planned:", error);
      res.status(500).json({ message: "Erro ao excluir planejamento" });
    }
  });

  app.post("/api/budget-planned/:id/toggle-not-attended", async (req, res) => {
    const finUser = await requireFinanceUser(req, res);
    if (!finUser) return;
    try {
      const { reason } = req.body as { reason?: string };
      const item = await storage.getBudgetPlannedById(req.params.id);
      if (!item) return res.status(404).json({ message: "Item não encontrado" });
      const toggled = !item.didNotAttend;
      const updated = await storage.updateBudgetPlanned(req.params.id, {
        didNotAttend: toggled,
        didNotAttendReason: toggled ? (reason || null) : null,
      });
      const actorId = finUser.id;
      const actor = finUser;
      await createAuditLog('update', 'budget_planned', req.params.id, updated, actorId, actor?.name || 'Sistema', item, req);
      res.json(updated);
    } catch (error) {
      console.error("Error toggling not-attended on planned:", error);
      res.status(400).json({ message: "Erro ao atualizar participação" });
    }
  });
}
