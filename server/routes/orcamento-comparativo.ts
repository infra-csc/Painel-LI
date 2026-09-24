/**
 * Comparativo (budget_comparison): leitura, criação, cálculo a partir do
 * planejado × realizado, edição e decisões (aprovar/recusar/devolver) que
 * sincronizam ou estornam o crédito automático da Conta Corrente Flash.
 * Papéis: financeiro (admin/RH).
 */
import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { budgetComparison as budgetComparisonTable, insertBudgetComparisonSchema } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { safeSyncFlashFromComparison, safeReverseFlashFromComparison, type FlashSyncActor } from "../flash-credit";
import { createAuditLog, usuarioDaSessao, requireFinanceUser, requireFinSession, requireFinWrite } from "./_compartilhado";

export function registrarOrcamentoComparativo(app: Express): void {
  // Ator + trilha de auditoria para o crédito automático no Flash
  // (server/flash-credit.ts). O audit log usa entityType 'financial' — mesmo
  // bucket dos lançamentos manuais da Conta Corrente Flash.
  const flashActorFor = async (req: any): Promise<FlashSyncActor> => {
    const u = usuarioDaSessao(req) ?? undefined;
    return {
      userId: u?.id ?? null,
      userName: u?.name ?? "Sistema",
      audit: (action, entityId, data, oldData) =>
        createAuditLog(action, 'financial', entityId, data, u?.id, u?.name || 'Sistema', oldData, req),
    };
  };

  // Budget Comparison (Comparativo)
  app.get("/api/budget-comparison", async (req, res) => {
    if (!await requireFinSession(req, res)) return;
    try {
      const { eventId } = req.query;
      if (eventId) {
        const comparison = await storage.getBudgetComparison(eventId as string);
        res.json(comparison || null);
      } else {
        const all = await storage.getAllBudgetComparisons();
        res.json(all);
      }
    } catch (error) {
      console.error("Error fetching budget comparison:", error);
      res.status(500).json({ message: "Erro ao buscar comparativo" });
    }
  });

  app.post("/api/budget-comparison", async (req, res) => {
    if (!await requireFinWrite(req, res)) return;
    try {
      const data = insertBudgetComparisonSchema.parse(req.body);
      const comparison = await storage.createBudgetComparison(data);
      res.status(201).json(comparison);
    } catch (error: any) {
      if (error?.code === '23505') {
        return res.status(409).json({ message: "Já existe um comparativo para este evento." });
      }
      console.error("Error creating budget comparison:", error);
      res.status(400).json({ message: "Erro ao criar comparativo" });
    }
  });

  app.post("/api/budget-comparison/calculate/:eventId", async (req, res) => {
    if (!await requireFinWrite(req, res)) return;
    try {
      const { eventId } = req.params;

      // Get planned and actual data
      const planned = await storage.getBudgetPlanned(eventId);
      const allActual = await storage.getBudgetActual(eventId);

      // Espelha EXATAMENTE o cálculo da tela Comparativo (budget-comparison.tsx):
      // processa só os pais enviados; o total do grupo é pai(já reduzido pelo
      // split) + TODOS os filhos; "não participou" (no planejado) zera o grupo.
      // A versão anterior excluía os filhos de split e subcontava o realizado.
      const splitChildren = new Map<string, any[]>();
      for (const a of allActual as any[]) {
        if (a.splitParentId) {
          const arr = splitChildren.get(a.splitParentId) || [];
          arr.push(a);
          splitChildren.set(a.splitParentId, arr);
        }
      }
      const parents = (allActual as any[]).filter(a => a.sentForReview && !a.splitParentId);
      const matchPlanned = (a: any) => a.plannedId
        ? planned.find((pl: any) => pl.id === a.plannedId)
        : planned.find((pl: any) => pl.collaboratorId === a.collaboratorId && pl.functionId === a.functionId && pl.eventId === a.eventId);
      let totalActual = 0;
      let totalPlanned = 0;
      for (const p of parents) {
        const mp: any = matchPlanned(p);
        const notAttended = !!mp?.didNotAttend;
        const kids = splitChildren.get(p.id) || [];
        totalActual += notAttended ? 0 : (p.totalValue || 0) + kids.reduce((s, c) => s + (c.totalValue || 0), 0);
        totalPlanned += mp?.totalValue || 0;
      }
      // Convenção da tela: variância positiva = realizado acima do planejado
      const variance = totalActual - totalPlanned;
      const variancePercent = totalPlanned > 0
        ? ((variance / totalPlanned) * 100).toFixed(2) + '%'
        : '0%';

      // Changes log: só os pais enviados com planejado (filhos de split são
      // frações — comparar cada um contra o planejado cheio seria enganoso)
      const changesLog = parents
        .filter((a: any) => a.plannedId)
        .map((a: any) => {
          const p = planned.find(pl => pl.id === a.plannedId);
          if (!p) return null;

          const changes: string[] = [];
          if (a.dailyQuantity !== p.dailyQuantity) changes.push(`Diárias: ${p.dailyQuantity} → ${a.dailyQuantity}`);
          if (a.dailyValue !== p.dailyValue) changes.push(`Valor diária: ${p.dailyValue} → ${a.dailyValue}`);
          if (a.totalValue !== p.totalValue) changes.push(`Total: ${p.totalValue} → ${a.totalValue}`);

          return changes.length > 0 ? { collaboratorId: a.collaboratorId, changes, reason: a.changeReason } : null;
        })
        .filter(Boolean);

      // Check if comparison exists
      let comparison = await storage.getBudgetComparison(eventId);

      if (comparison) {
        comparison = await storage.updateBudgetComparison(comparison.id, {
          totalPlanned,
          totalActual,
          variance,
          variancePercent,
          changesLog: JSON.stringify(changesLog),
        });
      } else {
        comparison = await storage.createBudgetComparison({
          eventId,
          totalPlanned,
          totalActual,
          variance,
          variancePercent,
          changesLog: JSON.stringify(changesLog),
          status: 'pendente',
        });
      }

      res.json(comparison);
    } catch (error) {
      console.error("Error calculating budget comparison:", error);
      res.status(400).json({ message: "Erro ao calcular comparativo" });
    }
  });

  app.patch("/api/budget-comparison/:id", async (req, res) => {
    const finUser = await requireFinanceUser(req, res);
    if (!finUser) return;
    try {
      // Allowlist: decisão (status/approvedBy/motivos) só pelas rotas dedicadas
      const data: any = insertBudgetComparisonSchema.partial().parse(req.body);
      delete data.status;
      delete data.approvedBy;
      delete data.approvedAt;
      delete data.approvalObservation;
      delete data.rejectionReason;
      delete data.returnReason;
      const comparison = await storage.updateBudgetComparison(req.params.id, data);
      res.json(comparison);
    } catch (error) {
      console.error("Error updating budget comparison:", error);
      res.status(400).json({ message: "Erro ao atualizar comparativo" });
    }
  });

  /**
   * Decisões do comparativo (23/09): UPDATE condicionado ao status atual —
   * aprovar só de pendente/devolvido/rejeitado, devolver/recusar só de
   * pendente/aprovado (0 linhas → 409). Recusar exige motivo. O sync do Flash
   * roda DEPOIS do commit (safeSync/safeReverse já são transacionais).
   */
  const decidirComparativo = async (
    id: string, de: readonly string[], patch: Record<string, unknown>,
  ) => {
    const [row] = await db.update(budgetComparisonTable)
      .set({ ...patch, updatedAt: new Date() } as any)
      .where(and(eq(budgetComparisonTable.id, id), inArray(budgetComparisonTable.status, [...de])))
      .returning();
    return row;
  };

  app.post("/api/budget-comparison/:id/approve", async (req, res) => {
    const finUser = await requireFinanceUser(req, res);
    if (!finUser) return;
    try {
      const { approvalObservation } = req.body;
      const anterior = await storage.getAllBudgetComparisons().then((all) => all.find((c) => c.id === req.params.id));
      if (!anterior) return res.status(404).json({ message: "Comparativo não encontrado" });
      const comparison = await decidirComparativo(req.params.id, ['pendente', 'devolvido', 'rejeitado'], {
        status: 'aprovado',
        approvedBy: finUser.id,
        approvalObservation,
        approvedAt: new Date(),
      });
      if (!comparison) return res.status(409).json({ message: `Este comparativo já está ${anterior.status} — recarregue a tela.` });
      await createAuditLog('approve', 'budget_comparison', req.params.id, comparison, finUser.id, finUser.name, anterior, req);
      // Regra 19/08 (substitui a de 17/08, que creditava no lançamento da OC):
      // aprovar o comparativo credita alimentação + mobilidade de TODAS as
      // prestações do evento na Conta Corrente Flash. Idempotente — reaprovar
      // reconcilia os mesmos lançamentos; é exatamente isso que o botão
      // "Ressincronizar Flash" (tela Comparativo, comparativo já aprovado) faz
      // quando o Realizado muda depois da aprovação. Falha aqui NÃO derruba a aprovação:
      // vira flashCredit.ok=false e o client avisa (ver server/flash-credit.ts).
      const flashCredit = await safeSyncFlashFromComparison(comparison, await flashActorFor(req));
      res.json({ ...comparison, flashCredit });
    } catch (error) {
      console.error("Error approving budget comparison:", error);
      res.status(400).json({ message: "Erro ao aprovar comparativo" });
    }
  });

  app.post("/api/budget-comparison/:id/reject", async (req, res) => {
    const finUser = await requireFinanceUser(req, res);
    if (!finUser) return;
    try {
      const rejectionReason = typeof req.body?.rejectionReason === "string" ? req.body.rejectionReason.trim() : "";
      if (!rejectionReason) return res.status(400).json({ message: "Informe o motivo da recusa do comparativo." });
      const anterior = await storage.getAllBudgetComparisons().then((all) => all.find((c) => c.id === req.params.id));
      if (!anterior) return res.status(404).json({ message: "Comparativo não encontrado" });
      const comparison = await decidirComparativo(req.params.id, ['pendente', 'aprovado', 'devolvido'], {
        status: 'rejeitado',
        approvedBy: finUser.id,
        rejectionReason,
        approvedAt: new Date(),
      });
      if (!comparison) return res.status(409).json({ message: `Este comparativo já está ${anterior.status} — recarregue a tela.` });
      await createAuditLog('reject', 'budget_comparison', req.params.id, comparison, finUser.id, finUser.name, anterior, req);
      // Rejeitar estorna o crédito do Flash: os automáticos do comparativo são
      // APAGADOS (não debitados) — ver server/flash-credit.ts. Reaprovar recria.
      const flashReverse = await safeReverseFlashFromComparison(comparison, await flashActorFor(req));
      res.json({ ...comparison, flashReverse });
    } catch (error) {
      console.error("Error rejecting budget comparison:", error);
      res.status(400).json({ message: "Erro ao rejeitar comparativo" });
    }
  });

  app.post("/api/budget-comparison/:id/return", async (req, res) => {
    const finUser = await requireFinanceUser(req, res);
    if (!finUser) return;
    try {
      const { returnReason } = req.body;
      const anterior = await storage.getAllBudgetComparisons().then((all) => all.find((c) => c.id === req.params.id));
      if (!anterior) return res.status(404).json({ message: "Comparativo não encontrado" });
      const comparison = await decidirComparativo(req.params.id, ['pendente', 'aprovado', 'rejeitado'], {
        status: 'devolvido',
        approvedBy: finUser.id,
        returnReason,
      });
      if (!comparison) return res.status(409).json({ message: `Este comparativo já está ${anterior.status} — recarregue a tela.` });
      await createAuditLog('update', 'budget_comparison', req.params.id, comparison, finUser.id, finUser.name, anterior, req);
      // Devolver para ajuste também estorna: o evento volta a ser editado e o
      // crédito só vale para um comparativo aprovado (regra 19/08). É a rota do
      // botão "Reabrir comparativo (estorna o Flash)" — o ÚNICO caminho de
      // estorno na tela (os botões "Recusar"/"Devolver" do rodapé decidem por
      // PRESTAÇÃO, em /api/budget-actual/rh-action, e não mexem no Flash).
      const flashReverse = await safeReverseFlashFromComparison(comparison, await flashActorFor(req));
      res.json({ ...comparison, flashReverse });
    } catch (error) {
      console.error("Error returning budget comparison:", error);
      res.status(400).json({ message: "Erro ao devolver comparativo" });
    }
  });
}
