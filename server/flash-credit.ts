/**
 * Crédito automático no Flash na APROVAÇÃO DO COMPARATIVO (19/08).
 *
 * ┌─ REGRA VIGENTE (decisão do usuário em 19/08/2026) ───────────────────────┐
 * │ Ao APROVAR o comparativo de um evento, os valores de ALIMENTAÇÃO e       │
 * │ MOBILIDADE de TODAS as prestações do evento entram na Conta Corrente     │
 * │ Flash dos respectivos colaboradores. "A NF/OC depois não mexe mais no    │
 * │ saldo (só documenta)". A diária continua fora do Flash (regra 17/08).    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * SUBSTITUI a regra de 17/08 (crédito no lançamento da OC/NF, que vivia em
 * server/flash-oc.ts). Aquele gatilho foi removido de POST/PATCH
 * /api/invoices e o estorno saiu de /api/invoices/:id/reject — a nota fiscal
 * não altera mais o saldo. Como a Conta Corrente Flash estava VAZIA em
 * produção (0 lançamentos), não houve dado a migrar; lançamentos legados
 * `sourceType='oc'` (só ambientes de teste) ficam congelados e somente leitura.
 *
 * Quem entra: prestação do evento com `didNotAttend = false`, com colaborador,
 * e efetivamente no fluxo — aprovada pelo RH, ou enviada e ainda pendente
 * (mesmo critério da NF, `isNfEligible`). Devolvida/rejeitada ficam de fora até
 * o reenvio; "não participou" marcado no PLANEJADO também exclui, porque é
 * essa marca que zera o grupo no cálculo do comparativo. Quais verbas entram
 * continua em `flashAmountsFromBudgetActual` (alimentação + mobilidade;
 * diária, ajuda de custo e translado não). Valor zero não gera lançamento.
 *
 * Contrato do flash_movements:
 *   sourceType = 'comparativo'    → automático (somente leitura na API/tela)
 *   sourceRef  = budget_actual.id → a prestação que originou o crédito
 *   eventId    = evento do comparativo
 *   (sourceType, sourceRef, category) é a chave lógica → sync idempotente:
 *   reaprovar atualiza os mesmos lançamentos em vez de duplicar.
 *
 * Granularidade por PRESTAÇÃO (e não por comparativo) para o extrato seguir
 * rastreável por pessoa/função. O vínculo com o comparativo NÃO precisou de
 * coluna nova: o comparativo é único por evento (unique em budget_comparison
 * .event_id), então `sourceType='comparativo' AND event_id = <evento>`
 * identifica exatamente o conjunto daquele comparativo — inclusive órfãos de
 * prestações apagadas, que o estorno também remove.
 *
 * Estorno (comparativo rejeitado/devolvido): os automáticos daquele evento são
 * APAGADOS, não debitados — mesma política da regra anterior. Motivo: o
 * crédito nunca deveria ter existido, e um par crédito/débito só sujaria o
 * extrato e o CSV sem mudar o saldo. A exclusão fica no audit log ('delete'
 * em 'financial'). Reaprovar depois recria — idempotente.
 *
 * Como o usuário chega aqui (tela Comparativo, card "Fechamento do comparativo",
 * com o comparativo já APROVADO):
 *   • "Ressincronizar Flash"              → POST /api/budget-comparison/:id/approve
 *     (idempotente; alinha os lançamentos ao Realizado atual quando o RH edita
 *     uma prestação DEPOIS da aprovação — a tela avisa comparando
 *     budget_actual.updatedAt com comparison.approvedAt)
 *   • "Reabrir comparativo (estorna o Flash)" → POST /api/budget-comparison/:id/return
 * Os botões "Recusar"/"Devolver" do RODAPÉ não passam por aqui: decidem por
 * PRESTAÇÃO (/api/budget-actual/rh-action) e não tocam no Flash.
 *
 * Falha aqui NUNCA derruba a decisão do comparativo: a rota chama a versão
 * `safe*` e devolve `flashCredit: { ok: false }` para o client avisar.
 */
import { storage } from "./storage";
import type { FlashMovement } from "@shared/schema";
import {
  FLASH_SOURCE_COMPARATIVO,
  flashComparativoDescription, flashComparisonTotals, flashMovementKey,
  flashMovementsForComparison, type FlashCategory,
} from "@shared/flash-rules";

export interface FlashSyncActor {
  userId?: string | null;
  userName?: string | null;
  /** Trilha de auditoria (routes.ts injeta createAuditLog com o req). */
  audit?: (action: string, entityId: string, data: any, oldData?: any) => Promise<void>;
}

/** O mínimo que o sync precisa saber do comparativo. */
export interface FlashComparisonRef {
  id: string;
  eventId: string;
}

export interface FlashComparisonSyncResult {
  ok: boolean;
  /** lançamentos vigentes após o sync (criados + mantidos/atualizados) */
  movements: number;
  created: number;
  updated: number;
  removed: number;
  /** colaboradores distintos creditados */
  collaborators: number;
  alimentacaoCents: number;
  mobilidadeCents: number;
  movementIds: string[];
  /** motivo quando ok=false (log/toast) */
  error?: string;
}

const emptyResult = (error?: string): FlashComparisonSyncResult => ({
  ok: !error, movements: 0, created: 0, updated: 0, removed: 0, collaborators: 0,
  alimentacaoCents: 0, mobilidadeCents: 0, movementIds: [], ...(error ? { error } : {}),
});

const todayISO = () => new Date().toISOString().slice(0, 10);

const SOURCE_COMPARATIVO = FLASH_SOURCE_COMPARATIVO;

/**
 * Lançamentos automáticos que pertencem ao comparativo do evento.
 * Uma leitura só (a tabela é pequena) em vez de N consultas por prestação —
 * e pega também os órfãos, cujo budget_actual já não existe.
 */
async function currentComparisonMovements(eventId: string): Promise<FlashMovement[]> {
  const all = await storage.getFlashMovements();
  return all.filter(m => m.sourceType === FLASH_SOURCE_COMPARATIVO && m.eventId === eventId);
}

/**
 * Sincroniza os lançamentos automáticos de um comparativo com o Realizado
 * atual do evento. Idempotente: cria/atualiza/remove por
 * (comparativo, budget_actual.id, categoria).
 */
export async function syncFlashFromComparison(
  comparison: FlashComparisonRef,
  actor: FlashSyncActor,
): Promise<FlashComparisonSyncResult> {
  const actuals = await storage.getBudgetActual(comparison.eventId);
  // O planejado entra só por causa do "não participou" marcado lá: é a marca
  // que o cálculo do comparativo usa para zerar o grupo — se o comparativo
  // conta zero, o Flash não credita.
  const planned = await storage.getBudgetPlanned(comparison.eventId);
  const wanted = flashMovementsForComparison(actuals as any, planned as any);
  const totals = flashComparisonTotals(wanted);
  const event = await storage.getEvent(comparison.eventId);
  const description = flashComparativoDescription(event?.name);

  const existing = await currentComparisonMovements(comparison.eventId);
  const byKey = new Map<string, FlashMovement>();
  for (const m of existing) byKey.set(flashMovementKey(m), m);

  const movementIds: string[] = [];
  const handled = new Set<string>();
  let created = 0, updated = 0, removed = 0;

  for (const w of wanted) {
    const key = flashMovementKey({ sourceRef: w.actualId, category: w.category });
    handled.add(key);
    const prev = byKey.get(key);
    if (prev) {
      const changed =
        prev.amountCents !== w.amountCents ||
        prev.collaboratorId !== w.collaboratorId ||
        (prev.description || "") !== description;
      if (changed) {
        const row = await storage.updateFlashMovement(prev.id, {
          amountCents: w.amountCents,
          collaboratorId: w.collaboratorId,
          eventId: comparison.eventId,
          description,
        });
        if (row) await actor.audit?.("update", row.id, row, prev);
        updated += 1;
        movementIds.push(row?.id ?? prev.id);
      } else {
        movementIds.push(prev.id);
      }
    } else {
      const row = await storage.createFlashMovement({
        collaboratorId: w.collaboratorId,
        eventId: comparison.eventId,
        category: w.category as FlashCategory,
        type: "credito",
        amountCents: w.amountCents,
        movementDate: todayISO(),
        description,
        createdBy: actor.userId ?? null,
        createdByName: actor.userName ?? "Sistema",
        sourceType: SOURCE_COMPARATIVO,
        sourceRef: w.actualId,
      });
      await actor.audit?.("create", row.id, row);
      created += 1;
      movementIds.push(row.id);
    }
  }

  // Sobrou automático que a regra não quer mais (prestação apagada, marcada
  // como "não participou", devolvida, ou valor zerado pelo RH) → remove.
  for (const m of existing) {
    if (!handled.has(flashMovementKey(m))) {
      await storage.deleteFlashMovement(m.id);
      await actor.audit?.("delete", m.id, m);
      removed += 1;
    }
  }

  return {
    ok: true,
    movements: movementIds.length,
    created, updated, removed,
    collaborators: new Set(wanted.map(w => w.collaboratorId)).size,
    alimentacaoCents: totals.alimentacaoCents,
    mobilidadeCents: totals.mobilidadeCents,
    movementIds,
  };
}

/**
 * Estorno: apaga os lançamentos automáticos do comparativo (recusa/devolução).
 * Devolve quantos foram removidos.
 */
export async function reverseFlashFromComparison(
  comparison: FlashComparisonRef,
  actor: FlashSyncActor,
): Promise<{ removed: number }> {
  const existing = await currentComparisonMovements(comparison.eventId);
  for (const m of existing) {
    await storage.deleteFlashMovement(m.id);
    await actor.audit?.("delete", m.id, m);
  }
  return { removed: existing.length };
}

/** Versão "nunca falha" para as rotas: erro vira ok=false + log. */
export async function safeSyncFlashFromComparison(
  comparison: FlashComparisonRef,
  actor: FlashSyncActor,
): Promise<FlashComparisonSyncResult> {
  try {
    return await syncFlashFromComparison(comparison, actor);
  } catch (error: any) {
    console.error("[flash-credit] falha ao creditar o Flash do comparativo", comparison.id, error);
    return emptyResult(error?.message || "Falha ao creditar o Flash");
  }
}

export async function safeReverseFlashFromComparison(
  comparison: FlashComparisonRef,
  actor: FlashSyncActor,
): Promise<{ ok: boolean; removed: number }> {
  try {
    const r = await reverseFlashFromComparison(comparison, actor);
    return { ok: true, ...r };
  } catch (error) {
    console.error("[flash-credit] falha ao estornar o Flash do comparativo", comparison.id, error);
    return { ok: false, removed: 0 };
  }
}
