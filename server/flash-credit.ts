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
 *
 * ── Como grava (23/09) ─────────────────────────────────────────────────────
 * Antes o sync lia `flash_movements` INTEIRA para filtrar em memória e fazia
 * um create/update/delete por lançamento, fora de transação: duas aprovações
 * quase simultâneas (dois cliques em "Ressincronizar") disputavam a unique
 * (source_ref, category) e uma delas estourava no meio, deixando metade dos
 * lançamentos. Agora: lê só `source_type='comparativo' AND event_id = X`
 * (índice flash_movements_source_event_idx), decide tudo em memória
 * (`planejarSyncFlash`, regra pura) e grava numa transação travada por
 * advisory lock do evento — INSERT multi-linha, DELETE em lote. A trilha de
 * auditoria sai DEPOIS do commit, para não registrar o que foi desfeito.
 */
import { db } from "./db";
import { storage } from "./storage";
import { flashMovements, type FlashMovement } from "@shared/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { hojeISO } from "@shared/hoje-sp";
import {
  FLASH_SOURCE_COMPARATIVO,
  flashComparativoDescription, flashComparisonTotals, flashMovementKey,
  flashMovementsForComparison, type FlashCategory, type FlashComparisonMovement,
} from "@shared/flash-rules";

export interface FlashSyncActor {
  userId?: string | null;
  userName?: string | null;
  /** Trilha de auditoria (routes.ts injeta createAuditLog com o req). */
  audit?: (action: string, entityId: string, data: unknown, oldData?: unknown) => Promise<void>;
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

const SOURCE_COMPARATIVO = FLASH_SOURCE_COMPARATIVO;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Lançamentos automáticos que pertencem ao comparativo do evento — só eles,
 * filtrados no banco. Pega também os órfãos, cujo budget_actual já não existe.
 */
function currentComparisonMovements(exec: Pick<Tx, "select">, eventId: string): Promise<FlashMovement[]> {
  return exec.select().from(flashMovements)
    .where(and(eq(flashMovements.sourceType, SOURCE_COMPARATIVO), eq(flashMovements.eventId, eventId)));
}

// ---------- Plano do sync (regra pura) ----------
export interface AtualizacaoDeLancamento {
  prev: FlashMovement;
  changes: { amountCents: number; collaboratorId: string; eventId: string; description: string };
}

export interface PlanoDeSyncFlash {
  /** a criar, na ordem de `wanted` (ids já gerados: o RETURNING multi-linha não promete ordem) */
  criar: Array<FlashComparisonMovement & { id: string }>;
  atualizar: AtualizacaoDeLancamento[];
  /** automáticos que a regra não quer mais */
  remover: FlashMovement[];
  /** ids vigentes após o sync, na ordem de `wanted` */
  movementIds: string[];
}

/**
 * Compara o que a regra quer com o que existe e decide criar/atualizar/remover
 * por (sourceRef = budget_actual.id, categoria). Sem banco: é o que os testes
 * cobrem.
 */
export function planejarSyncFlash(
  wanted: FlashComparisonMovement[],
  existing: FlashMovement[],
  description: string,
  eventId: string,
  novoId: () => string = randomUUID,
): PlanoDeSyncFlash {
  const byKey = new Map<string, FlashMovement>();
  for (const m of existing) byKey.set(flashMovementKey(m), m);

  const plano: PlanoDeSyncFlash = { criar: [], atualizar: [], remover: [], movementIds: [] };
  const handled = new Set<string>();

  for (const w of wanted) {
    const key = flashMovementKey({ sourceRef: w.actualId, category: w.category });
    if (handled.has(key)) continue; // a mesma prestação/categoria duas vezes só entra uma
    handled.add(key);
    const prev = byKey.get(key);
    if (prev) {
      const changed =
        prev.amountCents !== w.amountCents ||
        prev.collaboratorId !== w.collaboratorId ||
        (prev.description || "") !== description;
      if (changed) {
        plano.atualizar.push({ prev, changes: { amountCents: w.amountCents, collaboratorId: w.collaboratorId, eventId, description } });
      }
      plano.movementIds.push(prev.id);
    } else {
      const id = novoId();
      plano.criar.push({ ...w, id });
      plano.movementIds.push(id);
    }
  }

  // Sobrou automático que a regra não quer mais (prestação apagada, marcada
  // como "não participou", devolvida, ou valor zerado pelo RH) → remove.
  for (const m of existing) {
    if (!handled.has(flashMovementKey(m))) plano.remover.push(m);
  }
  return plano;
}

/** Lote de INSERT: o Postgres aceita até 65.535 parâmetros por comando. */
const TAMANHO_DO_LOTE = 500;

/**
 * Sincroniza os lançamentos automáticos de um comparativo com o Realizado
 * atual do evento. Idempotente: cria/atualiza/remove por
 * (comparativo, budget_actual.id, categoria).
 */
export async function syncFlashFromComparison(
  comparison: FlashComparisonRef,
  actor: FlashSyncActor,
): Promise<FlashComparisonSyncResult> {
  // O planejado entra só por causa do "não participou" marcado lá: é a marca
  // que o cálculo do comparativo usa para zerar o grupo — se o comparativo
  // conta zero, o Flash não credita.
  const [actuals, planned, event] = await Promise.all([
    storage.getBudgetActual(comparison.eventId),
    storage.getBudgetPlanned(comparison.eventId),
    storage.getEvent(comparison.eventId),
  ]);
  const wanted = flashMovementsForComparison(actuals, planned);
  const totals = flashComparisonTotals(wanted);
  const description = flashComparativoDescription(event?.name);
  // Data de negócio em São Paulo — em UTC, das 21h à meia-noite o lançamento
  // ganhava a data do dia seguinte.
  const movementDate = hojeISO();

  type Auditoria = { action: string; id: string; data: unknown; oldData?: unknown };
  const auditorias: Auditoria[] = [];

  const plano = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"flash:" + comparison.eventId}))`);
    const existing = await currentComparisonMovements(tx, comparison.eventId);
    const plano = planejarSyncFlash(wanted, existing, description, comparison.eventId);

    if (plano.criar.length > 0) {
      const linhas = plano.criar.map((w) => ({
        id: w.id,
        collaboratorId: w.collaboratorId,
        eventId: comparison.eventId,
        category: w.category as FlashCategory,
        type: "credito",
        amountCents: w.amountCents,
        movementDate,
        description,
        createdBy: actor.userId ?? null,
        createdByName: actor.userName ?? "Sistema",
        sourceType: SOURCE_COMPARATIVO,
        sourceRef: w.actualId,
      }));
      for (let i = 0; i < linhas.length; i += TAMANHO_DO_LOTE) {
        const criados = await tx.insert(flashMovements).values(linhas.slice(i, i + TAMANHO_DO_LOTE)).returning();
        for (const row of criados) auditorias.push({ action: "create", id: row.id, data: row });
      }
    }

    // Cada atualização tem valores próprios; são poucas por evento.
    for (const { prev, changes } of plano.atualizar) {
      const [row] = await tx.update(flashMovements).set(changes).where(eq(flashMovements.id, prev.id)).returning();
      if (row) auditorias.push({ action: "update", id: row.id, data: row, oldData: prev });
    }

    if (plano.remover.length > 0) {
      await tx.delete(flashMovements).where(inArray(flashMovements.id, plano.remover.map((m) => m.id)));
      for (const m of plano.remover) auditorias.push({ action: "delete", id: m.id, data: m });
    }
    return plano;
  });

  // Só depois do commit: auditoria do que de fato ficou gravado.
  if (actor.audit) {
    for (const a of auditorias) await actor.audit(a.action, a.id, a.data, a.oldData);
  }

  return {
    ok: true,
    movements: plano.movementIds.length,
    created: plano.criar.length,
    updated: plano.atualizar.length,
    removed: plano.remover.length,
    collaborators: new Set(wanted.map(w => w.collaboratorId)).size,
    alimentacaoCents: totals.alimentacaoCents,
    mobilidadeCents: totals.mobilidadeCents,
    movementIds: plano.movementIds,
  };
}

/**
 * Estorno: apaga os lançamentos automáticos do comparativo (recusa/devolução).
 * Devolve quantos foram removidos. Um DELETE só, com RETURNING para a auditoria.
 */
export async function reverseFlashFromComparison(
  comparison: FlashComparisonRef,
  actor: FlashSyncActor,
): Promise<{ removed: number }> {
  const removidos = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"flash:" + comparison.eventId}))`);
    return await tx.delete(flashMovements)
      .where(and(eq(flashMovements.sourceType, SOURCE_COMPARATIVO), eq(flashMovements.eventId, comparison.eventId)))
      .returning();
  });
  if (actor.audit) {
    for (const m of removidos) await actor.audit("delete", m.id, m);
  }
  return { removed: removidos.length };
}

/** Versão "nunca falha" para as rotas: erro vira ok=false + log. */
export async function safeSyncFlashFromComparison(
  comparison: FlashComparisonRef,
  actor: FlashSyncActor,
): Promise<FlashComparisonSyncResult> {
  try {
    return await syncFlashFromComparison(comparison, actor);
  } catch (error) {
    console.error("[flash-credit] falha ao creditar o Flash do comparativo", comparison.id, error);
    return emptyResult((error as { message?: string } | null)?.message || "Falha ao creditar o Flash");
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
