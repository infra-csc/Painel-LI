/**
 * Orçamento Planejado (budget_planned): reaplicar valores padrão, eventos com
 * planejamento, CRUD do planejado e "não participou".
 * Papéis: financeiro (admin/RH) — guardas em _compartilhado.ts.
 */
import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import {
  budgetPlanned as budgetPlannedTable,
  events as eventsTable,
  collaborators as collaboratorsTable,
  insertBudgetPlannedSchema,
} from "@shared/schema";
import { eq, inArray, sql as drizzleSql } from "drizzle-orm";
import { isEventBlockedForActor } from "../event-guard";
import { calcularPlanejadoDaVaga, linhaDoPlanejado } from "@shared/budget-engine";
import { createAuditLog, ehViolacaoDeUnicidade, usuarioDaSessao, requireFinanceUser, requireFinSession, requireFinWrite } from "./_compartilhado";

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
      res.json({ updated: updates.length });
    } catch (error) {
      console.error("Error applying defaults to planned:", error);
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
