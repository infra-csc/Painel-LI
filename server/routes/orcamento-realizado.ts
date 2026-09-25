/**
 * Orçamento Realizado (budget_actual / prestação de contas): CRUD, duplicar do
 * planejado, duplicar item, dividir vaga, "não participou", envio para revisão
 * e a decisão do RH em lote (aprovar/rejeitar/devolver).
 * Papéis: financeiro (admin/RH).
 */
import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { budgetPlanned as budgetPlannedTable, budgetActual as budgetActualTable, insertBudgetActualSchema, type InsertBudgetActual, type RhAdjustedFields } from "@shared/schema";
import { eq, and, ne, inArray } from "drizzle-orm";
import { isFinanceRole } from "@shared/roles";
import { HttpError } from "../http";
import { podeDecidirPrestacao, podeEnviarParaRevisao, prestacaoEstaTravada } from "@shared/prestacao-rules";
import {
  montarLogDeAuditoria,
  createAuditLog,
  createAuditLogsBatch,
  usuarioDaSessao,
  ehViolacaoDeUnicidade,
  responderErroComStatus,
  requireFinanceUser,
  requireFinSession,
  requireFinWrite,
} from "./_compartilhado";

export function registrarOrcamentoRealizado(app: Express): void {
  // Budget Actual (Realizado)
  app.get("/api/budget-actual", async (req, res) => {
    if (!await requireFinSession(req, res)) return;
    try {
      const { eventId } = req.query;
      if (eventId) {
        const actual = await storage.getBudgetActual(eventId as string);
        res.json(actual);
      } else {
        const all = await storage.getAllBudgetActual();
        res.json(all);
      }
    } catch (error) {
      console.error("Error fetching budget actual:", error);
      res.status(500).json({ message: "Erro ao buscar realizado" });
    }
  });

  app.get("/api/budget-actual/:id", async (req, res) => {
    if (!await requireFinSession(req, res)) return;
    try {
      const actual = await storage.getBudgetActualById(req.params.id);
      if (!actual) {
        return res.status(404).json({ message: "Realizado não encontrado" });
      }
      res.json(actual);
    } catch (error) {
      console.error("Error fetching budget actual:", error);
      res.status(500).json({ message: "Erro ao buscar realizado" });
    }
  });

  app.post("/api/budget-actual", async (req, res) => {
    const actorId = await requireFinWrite(req, res);
    if (!actorId) return;
    try {
      // Campos de workflow não nascem pela API — impedem "nascer aprovado"
      const {
        rhStatus: _rs, sentForReview: _sfr, rhActionBy: _rab, rhActionAt: _raa, rhAdjusted: _ra,
        rhAdjustedFields: _raf, resubmitted: _re, didNotAttend: _dna, didNotAttendReason: _dnr, ...data
      } = insertBudgetActualSchema.parse(req.body);
      const actual = await storage.createBudgetActual({ ...data, createdBy: actorId });
      const actor = usuarioDaSessao(req);
      await createAuditLog('create', 'budget_actual', actual.id, actual, actorId, actor?.name || 'Sistema', undefined, req);
      res.status(201).json(actual);
    } catch (error) {
      console.error("Error creating budget actual:", error);
      res.status(400).json({ message: "Erro ao criar realizado" });
    }
  });

  app.post("/api/budget-actual/duplicate-from-planned/:eventId", async (req, res) => {
    const actorId = await requireFinWrite(req, res);
    if (!actorId) return;
    try {
      const { eventId } = req.params;
      const actor = usuarioDaSessao(req);
      // Idempotência DENTRO da transação (23/09): dois cliques simultâneos
      // passavam pela checagem e duplicavam todas as prestações do evento.
      const duplicated = await db.transaction(async (tx) => {
        const existing = await tx.select({ id: budgetActualTable.id }).from(budgetActualTable).where(eq(budgetActualTable.eventId, eventId)).limit(1);
        if (existing.length > 0) throw new HttpError(409, "Este evento já tem prestações no Realizado — duplicação ignorada.");
        const planned = await tx.select().from(budgetPlannedTable).where(eq(budgetPlannedTable.eventId, eventId));
        if (planned.length === 0) return [];
        return await tx.insert(budgetActualTable).values(planned.map((p) => ({
          plannedId: p.id,
          eventId: p.eventId,
          collaboratorId: p.collaboratorId,
          functionId: p.functionId,
          collaboratorType: p.collaboratorType,
          dailyQuantity: p.dailyQuantity,
          dailyValue: p.dailyValue,
          costAssistance: p.costAssistance,
          weekdayLunch: p.weekdayLunch,
          weekdayDinner: p.weekdayDinner,
          weekendLunch: p.weekendLunch,
          weekendDinner: p.weekendDinner,
          mobility: p.mobility,
          mobilityIda: p.mobilityIda ?? null,
          mobilityVolta: p.mobilityVolta ?? null,
          transport: p.transport,
          totalValue: p.totalValue,
          observations: p.observations,
          createdBy: actorId,
        }))).returning();
      });

      await createAuditLog('create', 'budget_actual', eventId, { eventId, count: duplicated.length }, actorId, actor?.name || 'Sistema', undefined, req);
      res.status(201).json(duplicated);
    } catch (error) {
      if (ehViolacaoDeUnicidade(error)) return res.status(409).json({ message: "Este evento já tem prestações no Realizado — duplicação ignorada." });
      responderErroComStatus(res, error, "Erro ao duplicar do planejado");
    }
  });

  app.post("/api/budget-actual/:id/duplicate", async (req, res) => {
    const dupActorId = await requireFinWrite(req, res);
    if (!dupActorId) return;
    try {
      const original = await storage.getBudgetActualById(req.params.id);
      if (!original) {
        return res.status(404).json({ message: "Item não encontrado" });
      }
      const duplicateData = {
        plannedId: null,
        eventId: original.eventId,
        collaboratorId: original.collaboratorId,
        functionId: original.functionId,
        collaboratorType: original.collaboratorType,
        dailyQuantity: original.dailyQuantity,
        dailyValue: original.dailyValue,
        costAssistance: original.costAssistance,
        weekdayLunch: original.weekdayLunch,
        weekdayDinner: original.weekdayDinner,
        weekendLunch: original.weekendLunch,
        weekendDinner: original.weekendDinner,
        mobility: original.mobility,
        transport: original.transport,
        totalValue: original.totalValue,
        observations: "Duplicado no Realizado",
        createdBy: dupActorId,
      };
      const duplicated = await storage.createBudgetActual(duplicateData);
      const actorId = dupActorId;
      const actor = usuarioDaSessao(req);
      await createAuditLog('create', 'budget_actual', duplicated.id, duplicated, actorId, actor?.name || 'Sistema', undefined, req);
      res.status(201).json(duplicated);
    } catch (error) {
      console.error("Error duplicating budget actual:", error);
      res.status(400).json({ message: "Erro ao duplicar item" });
    }
  });

  // ── Split vacancy endpoint ────────────────────────────────────────────────
  // 23/09: numa transação (filho + pai juntos) e com `totalValue` RECALCULADO
  // no servidor a partir dos valores unitários — o corpo não manda mais o total.
  const totalDaPrestacao = (v: { dailyQuantity: number; dailyValue: number; weekdayLunch: number; weekdayDinner: number; weekendLunch: number; weekendDinner: number; mobility: number }) =>
    v.dailyQuantity * v.dailyValue + v.weekdayLunch + v.weekdayDinner + v.weekendLunch + v.weekendDinner + v.mobility;
  const inteiroOu = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback);

  app.post("/api/budget-actual/:id/split", async (req, res) => {
    const actorId = await requireFinWrite(req, res);
    if (!actorId) return;
    try {
      const parent = await storage.getBudgetActualById(req.params.id);
      if (!parent) return res.status(404).json({ message: "Item não encontrado" });
      // Divisão só faz sentido antes da análise: item em revisão ou aprovado é imutável
      if (prestacaoEstaTravada(parent)) {
        return res.status(400).json({ message: "Não é possível dividir um item enviado para revisão ou já aprovado." });
      }

      const {
        collaboratorId, workedDays, parentWorkedDays, collaboratorType,
        mobility, weekdayLunch, weekdayDinner, weekendLunch, weekendDinner,
        dailyValue, dailyQuantity,
      } = req.body;
      if (!collaboratorId || !Array.isArray(workedDays) || workedDays.length === 0) {
        return res.status(400).json({ message: "collaboratorId e workedDays são obrigatórios" });
      }
      const colaborador = await storage.getCollaborator(String(collaboratorId));
      if (!colaborador) return res.status(404).json({ message: "Colaborador não encontrado" });

      const filho = {
        dailyQuantity: inteiroOu(dailyQuantity, workedDays.length),
        dailyValue: inteiroOu(dailyValue, parent.dailyValue),
        weekdayLunch: inteiroOu(weekdayLunch, 0),
        weekdayDinner: inteiroOu(weekdayDinner, 0),
        weekendLunch: inteiroOu(weekendLunch, 0),
        weekendDinner: inteiroOu(weekendDinner, 0),
        mobility: inteiroOu(mobility, parent.mobility || 0),
      };
      const remainingDays: string[] = Array.isArray(parentWorkedDays) ? parentWorkedDays : [];
      const pv = req.body?.parentValues && typeof req.body.parentValues === "object" ? req.body.parentValues : null;
      const pai = {
        dailyQuantity: inteiroOu(pv?.dailyQuantity, parent.dailyQuantity),
        dailyValue: parent.dailyValue,
        weekdayLunch: inteiroOu(pv?.weekdayLunch, parent.weekdayLunch),
        weekdayDinner: inteiroOu(pv?.weekdayDinner, parent.weekdayDinner),
        weekendLunch: inteiroOu(pv?.weekendLunch, parent.weekendLunch),
        weekendDinner: inteiroOu(pv?.weekendDinner, parent.weekendDinner),
        mobility: inteiroOu(pv?.mobility, parent.mobility),
      };

      const created = await db.transaction(async (tx) => {
        const [row] = await tx.insert(budgetActualTable).values({
          splitParentId: parent.id,
          plannedId: parent.plannedId,
          eventId: parent.eventId,
          collaboratorId: String(collaboratorId),
          functionId: parent.functionId,
          collaboratorType: collaboratorType || parent.collaboratorType,
          ...filho,
          costAssistance: 0,
          transport: 0,
          totalValue: totalDaPrestacao(filho),
          workedDays,
          observations: `Divisão de escalação — colaborador adicional`,
          createdBy: actorId,
        }).returning();
        // Pai: dias restantes + valores recalculados; guardado pelo estado (não
        // pode ter ido para análise no meio).
        const [paiAtualizado] = await tx.update(budgetActualTable)
          .set({ workedDays: remainingDays, ...(pv ? { ...pai, totalValue: totalDaPrestacao(pai) } : {}), updatedAt: new Date(), updatedBy: actorId })
          .where(and(eq(budgetActualTable.id, parent.id), eq(budgetActualTable.rhStatus, parent.rhStatus), eq(budgetActualTable.sentForReview, parent.sentForReview)))
          .returning();
        if (!paiAtualizado) throw new HttpError(409, "O item original mudou de estado enquanto era dividido — recarregue e tente de novo.");
        return row;
      });

      const actor = usuarioDaSessao(req);
      await createAuditLog('create', 'budget_actual', created.id, created, actorId, actor?.name || 'Sistema', undefined, req);
      res.status(201).json(created);
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao dividir vaga");
    }
  });

  app.post("/api/budget-actual/:id/toggle-not-attended", async (req, res) => {
    const finUser = await requireFinanceUser(req, res);
    if (!finUser) return;
    try {
      const { reason } = req.body as { reason?: string };
      const item = await storage.getBudgetActualById(req.params.id);
      if (!item) return res.status(404).json({ message: "Item não encontrado" });
      const toggled = !item.didNotAttend;
      const updated = await storage.updateBudgetActual(req.params.id, {
        didNotAttend: toggled,
        didNotAttendReason: toggled ? (reason || null) : null,
      });
      const actorId = finUser.id;
      const actor = finUser;
      await createAuditLog('update', 'budget_actual', req.params.id, updated, actorId, actor?.name || 'Sistema', item, req);
      res.json(updated);
    } catch (error) {
      console.error("Error toggling not-attended:", error);
      res.status(400).json({ message: "Erro ao atualizar participação" });
    }
  });

  app.patch("/api/budget-actual/:id", async (req, res) => {
    const actorId = await requireFinWrite(req, res);
    if (!actorId) return;
    try {
      const prev = await storage.getBudgetActualById(req.params.id);
      if (!prev) return res.status(404).json({ message: "Realizado não encontrado" });
      const actor = usuarioDaSessao(req);
      const isRhAdmin = isFinanceRole(actor?.role);
      // Item em análise ou aprovado é imutável para quem não é RH/admin
      if (!isRhAdmin && prestacaoEstaTravada(prev)) {
        return res.status(400).json({ message: "Este item está em análise ou aprovado — apenas o RH pode ajustá-lo." });
      }

      // Track which monetary fields the RH changed
      const RH_FIELDS: Record<string, string> = {
        dailyValue: 'Diária',
        dailyQuantity: 'Qtd. Diárias',
        weekdayLunch: 'Almoço (Sem.)',
        weekdayDinner: 'Jantar (Sem.)',
        weekendLunch: 'Almoço (FdS)',
        weekendDinner: 'Jantar (FdS)',
        mobility: 'Mobilidade',
      };

      // Validação + allowlist: workflow muda apenas pelas rotas dedicadas
      // (send-for-review, rh-action, toggle-not-attended)
      const {
        rhStatus: _rs, sentForReview: _sfr, rhActionBy: _rab, rhActionAt: _raa, rhAdjusted: _ra,
        rhAdjustedFields: _raf, resubmitted: _re, didNotAttend: _dna, didNotAttendReason: _dnr, ...parsed
      } = insertBudgetActualSchema.partial().parse(req.body);
      const updatePayload: Partial<InsertBudgetActual> = { ...parsed, updatedBy: actorId };

      if (isRhAdmin && prev) {
        // jsonb (25/09): já vem objeto; cópia para não mutar a linha lida.
        const existingFields: RhAdjustedFields = { ...(prev.rhAdjustedFields ?? {}) };

        let changed = false;
        for (const [field, label] of Object.entries(RH_FIELDS)) {
          const newVal = (parsed as Record<string, unknown>)[field];
          if (newVal === undefined) continue;
          // Colunas inteiras da prestação (RH_FIELDS): o valor gravado é número.
          const prevVal = ((prev as Record<string, unknown>)[field] ?? 0) as number;
          if (Number(newVal) !== Number(prevVal)) {
            existingFields[field] = { from: prevVal, to: Number(newVal), label };
            changed = true;
          }
        }

        if (changed) {
          updatePayload.rhAdjusted = true;
          updatePayload.rhAdjustedFields = existingFields;
        }
      }

      const actual = await storage.updateBudgetActual(req.params.id, updatePayload);
      await createAuditLog('update', 'budget_actual', req.params.id, actual, actorId, actor?.name || 'Sistema', prev, req);
      res.json(actual);
    } catch (error) {
      console.error("Error updating budget actual:", error);
      res.status(400).json({ message: "Erro ao atualizar realizado" });
    }
  });

  app.delete("/api/budget-actual/:id", async (req, res) => {
    const actorId = await requireFinWrite(req, res);
    if (!actorId) return;
    try {
      const prev = await storage.getBudgetActualById(req.params.id);
      if (!prev) return res.status(404).json({ message: "Realizado não encontrado" });
      if (prev.rhStatus === 'aprovado') {
        return res.status(400).json({ message: "Item aprovado não pode ser excluído." });
      }
      // NF vinculada impede a exclusão (senão a nota ficaria sem origem)
      const eventInvoices = await storage.getInvoices(prev.eventId);
      if (eventInvoices.some(inv => inv.budgetActualId === prev.id)) {
        return res.status(400).json({ message: "Há uma nota fiscal vinculada a este item — exclua/trate a NF primeiro." });
      }
      const actor = usuarioDaSessao(req);
      await storage.deleteBudgetActual(req.params.id);
      await createAuditLog('delete', 'budget_actual', req.params.id, prev, actorId, actor?.name || 'Sistema', undefined, req);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting budget actual:", error);
      res.status(500).json({ message: "Erro ao excluir realizado" });
    }
  });

  app.post("/api/budget-actual/send-for-review", async (req, res) => {
    const actorId = await requireFinWrite(req, res);
    if (!actorId) return;
    try {
      const { eventId, itemIds } = req.body;
      if (!eventId) {
        return res.status(400).json({ message: "eventId é obrigatório" });
      }
      const items = await storage.getBudgetActual(eventId);
      // Aprovado é terminal — reenvio só para pendente nunca enviado, devolvido ou rejeitado
      const toUpdate = itemIds?.length
        ? items.filter((i) => itemIds.includes(i.id) && podeEnviarParaRevisao(i))
        : items.filter(podeEnviarParaRevisao);
      const actor = usuarioDaSessao(req);

      // UM UPDATE por grupo (reenvio × primeiro envio) na mesma transação, com
      // guarda de estado: item que já foi aprovado/enviado no meio não entra.
      const reenvio = toUpdate.filter((i) => i.rhStatus === 'rejeitado' || i.rhStatus === 'devolvido').map((i) => i.id);
      const primeiro = toUpdate.filter((i) => !(i.rhStatus === 'rejeitado' || i.rhStatus === 'devolvido')).map((i) => i.id);
      const agora = new Date();
      const updated = await db.transaction(async (tx) => {
        const a = reenvio.length > 0
          ? await tx.update(budgetActualTable)
              .set({ sentForReview: true, rhStatus: 'pendente', resubmitted: true, updatedAt: agora, updatedBy: actorId })
              .where(and(inArray(budgetActualTable.id, reenvio), inArray(budgetActualTable.rhStatus, ['rejeitado', 'devolvido'])))
              .returning()
          : [];
        const b = primeiro.length > 0
          ? await tx.update(budgetActualTable)
              .set({ sentForReview: true, rhStatus: 'pendente', updatedAt: agora, updatedBy: actorId })
              .where(and(inArray(budgetActualTable.id, primeiro), eq(budgetActualTable.sentForReview, false), ne(budgetActualTable.rhStatus, 'aprovado')))
              .returning()
          : [];
        return [...a, ...b];
      });
      const anteriorPorId = new Map(toUpdate.map((i) => [i.id, i]));
      // Auditoria por ITEM (antes só um registro com o evento como entidade).
      await createAuditLogsBatch(updated.map((u) =>
        montarLogDeAuditoria('send_review', 'budget_actual', u.id, u, actorId, actor?.name || 'Sistema', anteriorPorId.get(u.id), req)));
      res.json({ updated: updated.length });
    } catch (error) {
      console.error("Error sending for review:", error);
      res.status(500).json({ message: "Erro ao enviar para revisão" });
    }
  });

  app.post("/api/budget-actual/rh-action", async (req, res) => {
    // Decisão do RH: sessão + papel obrigatórios; o ator vem da sessão
    // (antes qualquer requisição anônima aprovava em nome de qualquer um)
    const finUser = await requireFinanceUser(req, res);
    if (!finUser) return;
    try {
      const { itemIds, action, comment } = req.body;
      if (!Array.isArray(itemIds) || itemIds.length === 0 || !action) {
        return res.status(400).json({ message: "Dados incompletos" });
      }
      if (!['aprovado', 'rejeitado', 'devolvido'].includes(action)) {
        return res.status(400).json({ message: "Ação inválida" });
      }
      const ids: string[] = Array.from(new Set(itemIds.map((v: unknown) => String(v ?? "")).filter(Boolean)));
      if (ids.length > 500) return res.status(400).json({ message: "No máximo 500 itens por vez." });

      // Uma leitura, um UPDATE guardado (só o que está de fato em análise:
      // sentForReview = true e rhStatus = pendente), tudo numa transação.
      const atuais = await db.select().from(budgetActualTable).where(inArray(budgetActualTable.id, ids));
      const decididos = atuais.filter((i) => podeDecidirPrestacao(i).ok).map((i) => i.id);
      const agora = new Date();
      const results = decididos.length > 0
        ? await db.transaction(async (tx) => tx.update(budgetActualTable)
            .set({
              rhStatus: action,
              rhComment: comment || null,
              rhActionBy: finUser.id,
              rhActionAt: agora,
              updatedAt: agora,
              updatedBy: finUser.id,
              ...(action === 'devolvido' || action === 'rejeitado' ? { sentForReview: false } : {}),
            })
            .where(and(inArray(budgetActualTable.id, decididos), eq(budgetActualTable.sentForReview, true), eq(budgetActualTable.rhStatus, 'pendente')))
            .returning())
        : [];
      const feitos = new Set(results.map((r) => r.id));
      const skipped = ids.filter((id) => !feitos.has(id));

      const logAction = action === 'aprovado' ? 'approve' : action === 'rejeitado' ? 'reject' : 'update';
      const anteriorPorId = new Map(atuais.map((i) => [i.id, i]));
      // Auditoria por ITEM (antes só itemIds[0] era registrado).
      await createAuditLogsBatch(results.map((r) =>
        montarLogDeAuditoria(logAction, 'budget_actual', r.id, { ...r, comment: comment || null }, finUser.id, finUser.name || 'Sistema', anteriorPorId.get(r.id), req)));
      res.json({ updated: results.length, items: results, skipped });
    } catch (error) {
      console.error("Error performing RH action:", error);
      res.status(400).json({ message: "Erro ao processar ação do RH" });
    }
  });
}
