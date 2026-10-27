/**
 * Orçamento Realizado (budget_actual / prestação de contas): CRUD, duplicar do
 * planejado, duplicar item, dividir vaga, "não participou", envio para revisão
 * e a decisão do RH em lote (aprovar/rejeitar/devolver).
 * Papéis: financeiro (admin/RH).
 */
import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { budgetPlanned as budgetPlannedTable, budgetActual as budgetActualTable, insertBudgetActualSchema, type BudgetActual, type InsertBudgetActual, type RhAdjustedFields } from "@shared/schema";
import { eq, and, ne, inArray } from "drizzle-orm";
import { isFinanceRole } from "@shared/roles";
import { HttpError } from "../http";
import { podeDecidirPrestacao, podeEnviarParaRevisao, prestacaoEstaTravada } from "@shared/prestacao-rules";
import { CAMPOS_DE_VALOR_DO_PLANEJADO, ROTULO_DO_CAMPO_DE_VALOR, camposDeValorQueMudaram, estaPreAprovado } from "@shared/pre-aprovacao";
import { ehEventoLegado } from "@shared/legado-honorarios";
import { mobilidadeCoerente } from "@shared/comparativo";
import { dataIsoValida, normalizarDiasMeiaExtra } from "@shared/meia-diaria";
import { lerDataDeCorteDoBanco } from "./honorarios-fluxo";
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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * O "Enviar para revisão" do Realizado (o envio ao DP): UM UPDATE por grupo
 * (reenvio × primeiro envio) com guarda de estado — item que já foi
 * aprovado/enviado no meio não entra. Só os itens que `podeEnviarParaRevisao`
 * aceita. Roda dentro da transação de quem chama; devolve as linhas gravadas.
 * 27/10: também é o envio do check-out final da presença (server/routes/presenca.ts).
 */
export async function marcarEnviadosParaRevisao(tx: Tx, itens: readonly BudgetActual[], actorId: string): Promise<BudgetActual[]> {
  const toUpdate = itens.filter(podeEnviarParaRevisao);
  const reenvio = toUpdate.filter((i) => i.rhStatus === 'rejeitado' || i.rhStatus === 'devolvido').map((i) => i.id);
  const primeiro = toUpdate.filter((i) => !(i.rhStatus === 'rejeitado' || i.rhStatus === 'devolvido')).map((i) => i.id);
  const agora = new Date();
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
}

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
        rhAdjustedFields: _raf, resubmitted: _re, didNotAttend: _dna, didNotAttendReason: _dnr,
        // Check-out final da presença (27/10): só POST /api/presenca/:id/checkout-final grava.
        cnpjEmissor: _ce, razaoSocialEmissor: _rse, valorCalculado: _vc, ajusteProdutorPct: _ap, horasExtras: _he,
        valorHorasExtras: _vhe, checkoutFinalEm: _cfe, checkoutFinalPor: _cfp, ...data
      } = insertBudgetActualSchema.parse(req.body);
      // Ata de 22/10 (Honorários, Fase 0): "nenhum registro é liberado para a
      // Produção sem a pré-aprovação do DP". Vindo do Planejado, a linha tem
      // que estar pré-aprovada — e um valor mudado depois da pré-aprovação a
      // devolve a pendente no PATCH que o envio faz logo antes deste POST. O
      // que já está no Realizado não muda; lançamento direto no Realizado (sem
      // plannedId) é o próprio DP e segue como antes.
      if (data.plannedId) {
        const planejado = await storage.getBudgetPlannedById(data.plannedId);
        if (!planejado) return res.status(404).json({ message: "Linha do Planejado não encontrada." });
        // 27/10 (decisão do dono): evento LEGADO (termina antes da data de
        // corte) segue o fluxo antigo — vai sem a pré-aprovação, como antes.
        const evento = await storage.getEvent(planejado.eventId);
        const legado = ehEventoLegado(evento?.endDate ?? null, await lerDataDeCorteDoBanco());
        if (!legado) {
          if (!estaPreAprovado(planejado.status)) {
            return res.status(409).json({
              message: "Esta linha ainda não tem a pré-aprovação do DP (ou o valor mudou depois dela). Pré-aprove no Planejado antes de enviar ao Realizado.",
              codigo: "sem_pre_aprovacao",
            });
          }
          // 27/10: vai ao Realizado o MESMO valor, a MESMA pessoa e função que
          // o DP pré-aprovou. Campo ausente no corpo vale 0 (é o que a coluna
          // do Realizado grava).
          const valoresDoCorpo = Object.fromEntries(CAMPOS_DE_VALOR_DO_PLANEJADO.map((c) => [c, data[c] ?? 0]));
          const mudaram = camposDeValorQueMudaram(planejado, valoresDoCorpo);
          const outraVaga = (data.collaboratorId ?? null) !== (planejado.collaboratorId ?? null)
            || (data.functionId ?? null) !== (planejado.functionId ?? null)
            || data.eventId !== planejado.eventId;
          if (mudaram.length > 0 || outraVaga) {
            const oQue = [
              ...(outraVaga ? ["colaborador/função"] : []),
              ...mudaram.map((c) => ROTULO_DO_CAMPO_DE_VALOR[c]),
            ].join(", ");
            return res.status(409).json({
              message: `O envio não confere com o que o DP pré-aprovou (${oQue}). Atualize a tela e pré-aprove de novo antes de enviar ao Realizado.`,
              codigo: "valor_diferente_do_pre_aprovado",
              campos: mudaram,
            });
          }
        }
      }
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
      // Evento legado (27/10): fluxo antigo, sem exigir a pré-aprovação.
      const evento = await storage.getEvent(eventId);
      const legado = ehEventoLegado(evento?.endDate ?? null, await lerDataDeCorteDoBanco());
      // Idempotência DENTRO da transação (23/09): dois cliques simultâneos
      // passavam pela checagem e duplicavam todas as prestações do evento.
      const duplicated = await db.transaction(async (tx) => {
        const existing = await tx.select({ id: budgetActualTable.id }).from(budgetActualTable).where(eq(budgetActualTable.eventId, eventId)).limit(1);
        if (existing.length > 0) throw new HttpError(409, "Este evento já tem prestações no Realizado — duplicação ignorada.");
        // Só o que o DP pré-aprovou é liberado para a Produção (26/10) — exceto
        // em evento legado (27/10); quem não participou também fica de fora.
        const planned = (await tx.select().from(budgetPlannedTable).where(eq(budgetPlannedTable.eventId, eventId)))
          .filter((p) => (legado || estaPreAprovado(p.status)) && !p.didNotAttend);
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
          // 28/10: o Realizado nasce com os dias de 1,5 diária do Planejado marcados.
          diasMeiaExtra: p.diasMeiaExtra ?? null,
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
        return res.status(400).json({ message: "Este item está em análise ou aprovado — apenas o DP pode ajustá-lo." });
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
        rhAdjustedFields: _raf, resubmitted: _re, didNotAttend: _dna, didNotAttendReason: _dnr,
        // Check-out final da presença (27/10): só POST /api/presenca/:id/checkout-final grava.
        cnpjEmissor: _ce, razaoSocialEmissor: _rse, valorCalculado: _vc, ajusteProdutorPct: _ap, horasExtras: _he,
        valorHorasExtras: _vhe, checkoutFinalEm: _cfe, checkoutFinalPor: _cfp, ...parsed
      } = insertBudgetActualSchema.partial().parse(req.body);
      const updatePayload: Partial<InsertBudgetActual> = { ...parsed, updatedBy: actorId };
      // Mobilidade coerente (28/10 — caso Lucas, NR São Luís): o "Ajustar o
      // realizado" mandava só o total; zerado, ficavam ida/volta = R$ 58,00
      // gravados (e o Flash usa ida + volta quando o total é 0). Agora o total
      // que vier manda e ida/volta fecham com ele; vindo só ida/volta, o total
      // (e o total da prestação) acompanha a soma.
      if (parsed.mobility !== undefined || parsed.mobilityIda != null || parsed.mobilityVolta != null) {
        const mob = mobilidadeCoerente(
          { total: parsed.mobility, ida: parsed.mobilityIda, volta: parsed.mobilityVolta },
          { total: prev.mobility, ida: prev.mobilityIda, volta: prev.mobilityVolta },
        );
        if (parsed.mobility === undefined && mob.total !== prev.mobility) {
          updatePayload.mobility = mob.total;
          if (parsed.totalValue === undefined) updatePayload.totalValue = prev.totalValue - prev.mobility + mob.total;
        }
        updatePayload.mobilityIda = mob.ida;
        updatePayload.mobilityVolta = mob.volta;
      }
      // 1,5 diária (28/10): só dias ativos da prestação, sem repetição.
      if (parsed.diasMeiaExtra !== undefined) {
        const ativos = (parsed.workedDays ?? prev.workedDays ?? []).map((d) => String(d).slice(0, 10));
        updatePayload.diasMeiaExtra = ativos.length > 0
          ? normalizarDiasMeiaExtra(parsed.diasMeiaExtra, ativos)
          : Array.from(new Set((parsed.diasMeiaExtra ?? []).filter(dataIsoValida))).sort();
      }

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
      const updated = await db.transaction((tx) => marcarEnviadosParaRevisao(tx, toUpdate, actorId));
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
      console.error("Error performing DP action:", error);
      res.status(400).json({ message: "Erro ao processar ação do DP" });
    }
  });
}
