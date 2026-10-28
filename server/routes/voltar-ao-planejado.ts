/**
 * "Voltar ao Planejado" (28/10, pedido do DP — regra em shared/voltar-ao-planejado.ts):
 *
 *   POST /api/budget-actual/:id/voltar-ao-planejado   { motivo }
 *
 * O DP (papel `financial`) ou o administrador tira a prestação do Realizado —
 * com as divisões dela — e a linha do Planejado volta a pendente de
 * pré-aprovação (fluxo novo) / "não enviada" (evento legado). Numa transação:
 *  1. relê a prestação, as divisões e as NFs; recusa (409) com OC registrada,
 *     pago ou nota fiscal — o pagamento já começou;
 *  2. apaga as divisões e a prestação (presenças, ocorrências e confirmação da
 *     presença vão junto, ON DELETE CASCADE — a cópia vai para a auditoria);
 *     28/10 (revisão S8): a prestação e as divisões são lidas com FOR UPDATE e
 *     o DELETE repete as condições (sem OC, sem pago, sem NF) — dois cliques
 *     ou uma OC registrada no meio não passam;
 *  3. a linha do Planejado volta a `pendente` (sem quem/quando pré-aprovou).
 * Depois do commit:
 *  4. Flash: se o comparativo do evento está APROVADO, o crédito automático
 *     foi dado na aprovação (regra 19/08, server/flash-credit.ts). A prestação
 *     que deixa de existir é tratada como na regra atual do comparativo — o
 *     sync idempotente (o mesmo do "Ressincronizar Flash") remove os
 *     lançamentos dela e mantém os das outras; o comparativo continua
 *     aprovado para as demais. Quando a linha voltar ao Realizado, ela entra
 *     como prestação nova e o aviso "o Realizado mudou depois da aprovação" +
 *     "Ressincronizar Flash" cobrem o crédito dela, como em qualquer ajuste
 *     depois da aprovação. Comparativo não aprovado não tem crédito a desfazer;
 *  5. auditoria: 'delete' em budget_actual com a cópia de TUDO que saiu
 *     (prestação, divisões, presenças) + o motivo, e 'update' na linha do
 *     Planejado. 28/10 (revisão S5): a cópia das presenças vai SEM
 *     localização e sem os ids das selfies;
 *  6. as selfies das presenças apagadas saem do storage (28/10, S5) — antes
 *     ficavam lá sem nenhuma referência, fora do alcance do expurgo.
 * Evento encerrado: só o administrador (a mesma regra da pré-aprovação — o
 * DP não conseguiria pré-aprovar de novo a linha devolvida).
 */
import type { Express, Request } from "express";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import {
  budgetActual as budgetActualTable,
  budgetPlanned as budgetPlannedTable,
  events as eventsTable,
  invoices as invoicesTable,
  presencas as presencasTable,
  presencaOcorrencias as presencaOcorrenciasTable,
  presencaConfirmacoes as presencaConfirmacoesTable,
} from "@shared/schema";
import { STATUS_PENDENTE } from "@shared/pre-aprovacao";
import { ehEventoLegado } from "@shared/legado-honorarios";
import { motivoDoVoltarValido, podeVoltarAoPlanejado, MOTIVO_DO_VOLTAR_MAX, MOTIVO_DO_VOLTAR_MIN } from "@shared/voltar-ao-planejado";
import { isEventBlockedForActor } from "../event-guard";
import { isFinanceRole } from "@shared/roles";
import { HttpError } from "../http";
import { safeSyncFlashFromComparison, type FlashSyncActor } from "../flash-credit";
import { lerDataDeCorteDoBanco } from "./honorarios-fluxo";
import { createAuditLog, requireFinanceUser, responderErroComStatus } from "./_compartilhado";

export function registrarVoltarAoPlanejado(app: Express): void {
  app.post("/api/budget-actual/:id/voltar-ao-planejado", async (req: Request, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    const motivo = motivoDoVoltarValido((req.body ?? {}).motivo);
    if (!motivo) {
      return res.status(400).json({ message: `Escreva o motivo (de ${MOTIVO_DO_VOLTAR_MIN} a ${MOTIVO_DO_VOLTAR_MAX} caracteres) — ele fica na auditoria.` });
    }
    const nome = user.name || user.email || "Sistema";
    try {
      const r = await db.transaction(async (tx) => {
        // 28/10 (revisão S8): trava a prestação e as divisões até o fim.
        const [prestacao] = await tx.select().from(budgetActualTable).where(eq(budgetActualTable.id, req.params.id)).for("update");
        if (!prestacao) throw new HttpError(404, "Prestação não encontrada.");
        const [evento] = await tx.select().from(eventsTable).where(eq(eventsTable.id, prestacao.eventId));
        // O DP corrige honorário depois do evento (28/10): a trava de evento encerrado é da escala.
        if (evento && !isFinanceRole(user.role) && isEventBlockedForActor(evento, user)) {
          throw new HttpError(403, "Evento encerrado — só o administrador volta uma prestação ao Planejado.");
        }
        const divisoes = await tx.select().from(budgetActualTable).where(eq(budgetActualTable.splitParentId, prestacao.id)).for("update");
        const ids = [prestacao.id, ...divisoes.map((d) => d.id)];
        const notas = await tx.select({ id: invoicesTable.id }).from(invoicesTable).where(inArray(invoicesTable.budgetActualId, ids));
        const pode = podeVoltarAoPlanejado(prestacao, divisoes, notas.length > 0);
        if (!pode.ok) throw new HttpError(409, pode.motivo, { codigo: pode.codigo });

        // Cópia do que sai junto (cascade) — só para a auditoria.
        const [presencasCopia, ocorrenciasCopia, confirmacoesCopia] = await Promise.all([
          tx.select().from(presencasTable).where(inArray(presencasTable.actualId, ids)),
          tx.select().from(presencaOcorrenciasTable).where(inArray(presencaOcorrenciasTable.actualId, ids)),
          tx.select().from(presencaConfirmacoesTable).where(inArray(presencaConfirmacoesTable.actualId, ids)),
        ]);

        // As condições do podeVoltarAoPlanejado repetidas no DELETE (S8).
        const semPagamentoComecado = and(
          isNull(budgetActualTable.ocNumero), isNull(budgetActualTable.ocRegistradaEm), isNull(budgetActualTable.pagoEm),
          sql`NOT EXISTS (SELECT 1 FROM invoices WHERE invoices.budget_actual_id = ${budgetActualTable.id})`,
        );
        if (divisoes.length > 0) {
          const filhas = await tx.delete(budgetActualTable)
            .where(and(eq(budgetActualTable.splitParentId, prestacao.id), semPagamentoComecado)).returning({ id: budgetActualTable.id });
          if (filhas.length !== divisoes.length) throw new HttpError(409, "A prestação mudou enquanto você decidia — recarregue a tela.");
        }
        const apagadas = await tx.delete(budgetActualTable)
          .where(and(eq(budgetActualTable.id, prestacao.id), semPagamentoComecado)).returning({ id: budgetActualTable.id });
        if (apagadas.length === 0) throw new HttpError(409, "A prestação mudou enquanto você decidia — recarregue a tela.");

        const [planejadoAntes] = await tx.select().from(budgetPlannedTable).where(eq(budgetPlannedTable.id, prestacao.plannedId as string));
        const [planejadoDepois] = planejadoAntes
          ? await tx.update(budgetPlannedTable)
              .set({ status: STATUS_PENDENTE, approvedBy: null, approvedAt: null, updatedAt: new Date(), updatedBy: user.id })
              .where(eq(budgetPlannedTable.id, planejadoAntes.id)).returning()
          : [];
        return { prestacao, divisoes, evento, planejadoAntes, planejadoDepois, presencasCopia, ocorrenciasCopia, confirmacoesCopia };
      });

      const legado = ehEventoLegado(r.evento?.endDate ?? null, await lerDataDeCorteDoBanco());

      // Selfies das presenças apagadas (28/10, revisão S5): saem do storage.
      const fotos = r.presencasCopia.flatMap((p) => [p.checkinFotoId, p.checkoutFotoId]).filter((v): v is string => !!v);
      let selfiesApagadas = 0;
      if (fotos.length > 0) {
        const { ObjectStorageService } = await import("../objectStorage");
        const servico = new ObjectStorageService();
        for (const id of fotos) if (await servico.apagarAnexo(id)) selfiesApagadas += 1;
        if (selfiesApagadas < fotos.length) console.error(`[voltar-ao-planejado] ${fotos.length - selfiesApagadas} selfie(s) não saíram do storage (prestação ${r.prestacao.id}).`);
      }

      // Flash (regra 19/08): só o comparativo APROVADO tem crédito automático.
      const comparativo = await storage.getBudgetComparison(r.prestacao.eventId);
      let flash: Awaited<ReturnType<typeof safeSyncFlashFromComparison>> | null = null;
      if (comparativo?.status === "aprovado") {
        const actor: FlashSyncActor = {
          userId: user.id,
          userName: nome,
          audit: (action, entityId, data, oldData) => createAuditLog(action, "financial", entityId, data, user.id, nome, oldData, req),
        };
        flash = await safeSyncFlashFromComparison(comparativo, actor);
      }

      await createAuditLog("delete", "budget_actual", r.prestacao.id, {
        acao: "voltar ao Planejado",
        motivo,
        legado,
        prestacao: r.prestacao,
        divisoes: r.divisoes,
        // Sem localização e sem os ids das selfies (28/10, S5): só o fato.
        presencas: r.presencasCopia.map((p) => ({
          id: p.id, actualId: p.actualId, dia: p.dia, checkinEm: p.checkinEm, checkinPor: p.checkinPor, checkoutEm: p.checkoutEm, checkoutPor: p.checkoutPor,
          comSelfie: !!(p.checkinFotoId || p.checkoutFotoId), comLocalizacao: !!(p.checkinLat || p.checkoutLat), observacao: p.observacao,
        })),
        selfiesApagadas,
        ocorrencias: r.ocorrenciasCopia,
        confirmacoes: r.confirmacoesCopia,
        comparativoAprovado: comparativo?.status === "aprovado",
        flashRemovidos: flash?.removed ?? 0,
      }, user.id, nome, r.prestacao, req);
      if (r.planejadoDepois) {
        await createAuditLog("update", "budget_planned", r.planejadoDepois.id, {
          ...r.planejadoDepois, acao: "voltou do Realizado (pré-aprovação desfeita)", motivo,
        }, user.id, nome, r.planejadoAntes, req);
      }

      res.json({
        ok: true,
        plannedId: r.planejadoDepois?.id ?? null,
        legado,
        divisoesRemovidas: r.divisoes.length,
        comparativoAprovado: comparativo?.status === "aprovado",
        flash: flash ? { ok: flash.ok, removidos: flash.removed } : null,
        selfiesApagadas,
      });
    } catch (error) {
      const codigo = error instanceof HttpError ? error.extra?.codigo : undefined;
      if (error instanceof HttpError && codigo) return res.status(error.status).json({ message: error.message, codigo });
      responderErroComStatus(res, error, "Erro ao voltar a prestação ao Planejado", 500);
    }
  });
}
