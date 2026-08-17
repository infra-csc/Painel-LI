/**
 * Crédito automático no Flash a partir do lançamento da OC (17/08).
 *
 * Regra do usuário: "após lançamento da OC, mobilidade e alimentação entram
 * no Flash — apenas a diária não". Quando o colaborador lança/reenvia a NF
 * com número de OC (POST/PATCH /api/invoices), o servidor credita na Conta
 * Corrente Flash dele os valores de ALIMENTAÇÃO e MOBILIDADE gravados no
 * Realizado (budget_actual) daquele evento — dois lançamentos separados,
 * um por categoria. Diária/ajuda de custo/translado ficam de fora.
 *
 * Contrato do flash_movements:
 *   sourceType = 'oc'          → lançamento automático (somente leitura)
 *   sourceRef  = invoices.id   → NF que originou
 *   (sourceType, sourceRef, category) é a chave lógica → sync idempotente:
 *   reenvio/edição da NF atualiza o mesmo lançamento em vez de duplicar.
 *
 * Estorno (NF recusada): os automáticos daquela NF são APAGADOS, não
 * debitados. Motivo: o crédito nunca deveria ter existido (a NF foi
 * recusada), e um par crédito/débito só sujaria o extrato e o CSV sem
 * mudar o saldo. A exclusão fica no audit log ('delete' em 'financial').
 *
 * Falha aqui NUNCA derruba o lançamento da NF: as rotas chamam dentro de
 * try/catch e devolvem `flashSync: { ok: false }` para o client avisar.
 */
import { storage } from "./storage";
import type { BudgetActual, FlashMovement, Invoice } from "@shared/schema";
import {
  flashAmountsFromBudgetActual, flashMovementsToSync, flashOcDescription, type FlashCategory,
} from "@shared/flash-rules";

export interface FlashSyncActor {
  userId?: string | null;
  userName?: string | null;
  /** Trilha de auditoria (routes.ts injeta createAuditLog com o req). */
  audit?: (action: string, entityId: string, data: any, oldData?: any) => Promise<void>;
}

export interface FlashSyncResult {
  ok: boolean;
  alimentacaoCents: number;
  mobilidadeCents: number;
  /** ids dos lançamentos automáticos vigentes após o sync */
  movementIds: string[];
  /** motivo quando ok=false (log/toast) */
  error?: string;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Localiza o Realizado da NF: por budgetActualId; se nulo (NF antiga sem
 * vínculo), pela dupla evento+colaborador (prefere o registro enviado ao RH).
 */
async function resolveBudgetActual(inv: Invoice): Promise<BudgetActual | undefined> {
  if (inv.budgetActualId) {
    const byId = await storage.getBudgetActualById(inv.budgetActualId);
    if (byId) return byId;
  }
  // Colaborador pode ter 2 funções no mesmo evento — a NF é por função (NOT NULL),
  // então filtra também por functionId para não creditar a prestação errada.
  const candidates = (await storage.getBudgetActual(inv.eventId))
    .filter(a =>
      a.collaboratorId === inv.collaboratorId &&
      (!inv.functionId || a.functionId === inv.functionId) &&
      !a.didNotAttend);
  if (candidates.length === 0) return undefined;
  return candidates.find(a => a.sentForReview || a.rhStatus === "aprovado") ?? candidates[0];
}

/**
 * Sincroniza os lançamentos automáticos de uma NF com o Realizado atual.
 * Idempotente: cria/atualiza/remove por (oc, invoiceId, category).
 */
export async function syncFlashFromInvoice(invoiceId: string, actor: FlashSyncActor): Promise<FlashSyncResult> {
  const inv = await storage.getInvoice(invoiceId);
  if (!inv) throw new Error("Nota fiscal não encontrada para sincronizar o Flash");

  const actual = await resolveBudgetActual(inv);
  const amounts = flashAmountsFromBudgetActual(actual);
  const wanted = flashMovementsToSync(amounts);
  const event = await storage.getEvent(inv.eventId);
  const description = flashOcDescription(inv.oc, event?.name);

  const existing = await storage.getFlashMovementsBySource("oc", invoiceId);
  const byCategory = new Map<string, FlashMovement>();
  for (const m of existing) byCategory.set(m.category, m);

  const movementIds: string[] = [];
  const handled = new Set<FlashCategory>();

  // Janela reenvio × recusa: se a NF foi recusada entre a leitura e a gravação,
  // não recriar créditos que a recusa acabou de estornar.
  const fresh = await storage.getInvoice(invoiceId);
  if (!fresh || fresh.status === "recusada") {
    for (const m of existing) await storage.deleteFlashMovement(m.id);
    return { ok: true, alimentacaoCents: 0, mobilidadeCents: 0, movementIds: [] };
  }

  for (const w of wanted) {
    handled.add(w.category);
    const prev = byCategory.get(w.category);
    if (prev) {
      const changed =
        prev.amountCents !== w.amountCents ||
        prev.eventId !== inv.eventId ||
        prev.collaboratorId !== inv.collaboratorId ||
        (prev.description || "") !== description;
      if (changed) {
        const updated = await storage.updateFlashMovement(prev.id, {
          amountCents: w.amountCents,
          eventId: inv.eventId,
          collaboratorId: inv.collaboratorId,
          description,
        });
        if (updated) await actor.audit?.("update", updated.id, updated, prev);
        movementIds.push(updated?.id ?? prev.id);
      } else {
        movementIds.push(prev.id);
      }
    } else {
      const created = await storage.createFlashMovement({
        collaboratorId: inv.collaboratorId,
        eventId: inv.eventId,
        category: w.category,
        type: "credito",
        amountCents: w.amountCents,
        movementDate: todayISO(),
        description,
        createdBy: actor.userId ?? null,
        createdByName: actor.userName ?? "Sistema",
        sourceType: "oc",
        sourceRef: invoiceId,
      });
      await actor.audit?.("create", created.id, created);
      movementIds.push(created.id);
    }
  }

  // Categoria que zerou (ex.: RH ajustou o Realizado para 0) → remove o automático
  for (const m of existing) {
    if (!handled.has(m.category as FlashCategory)) {
      await storage.deleteFlashMovement(m.id);
      await actor.audit?.("delete", m.id, m);
    }
  }

  return { ok: true, alimentacaoCents: amounts.alimentacaoCents, mobilidadeCents: amounts.mobilidadeCents, movementIds };
}

/**
 * Estorno: apaga os lançamentos automáticos da NF (usado na recusa).
 * Devolve quantos foram removidos.
 */
export async function reverseFlashFromInvoice(invoiceId: string, actor: FlashSyncActor): Promise<{ removed: number }> {
  const existing = await storage.getFlashMovementsBySource("oc", invoiceId);
  for (const m of existing) {
    await storage.deleteFlashMovement(m.id);
    await actor.audit?.("delete", m.id, m);
  }
  return { removed: existing.length };
}

/** Versão "nunca falha" para as rotas: erro vira ok=false + log. */
export async function safeSyncFlashFromInvoice(invoiceId: string, actor: FlashSyncActor): Promise<FlashSyncResult> {
  try {
    return await syncFlashFromInvoice(invoiceId, actor);
  } catch (error: any) {
    console.error("[flash-oc] falha ao sincronizar Flash da NF", invoiceId, error);
    return { ok: false, alimentacaoCents: 0, mobilidadeCents: 0, movementIds: [], error: error?.message || "Falha ao creditar o Flash" };
  }
}

export async function safeReverseFlashFromInvoice(invoiceId: string, actor: FlashSyncActor): Promise<{ ok: boolean; removed: number }> {
  try {
    const r = await reverseFlashFromInvoice(invoiceId, actor);
    return { ok: true, ...r };
  } catch (error) {
    console.error("[flash-oc] falha ao estornar Flash da NF", invoiceId, error);
    return { ok: false, removed: 0 };
  }
}
