/**
 * Validação de Escala: sugestões em lote, cancelamento de envio e pedidos de
 * ajuste (scaling_change_requests) com as transições de vaga que os
 * acompanham — sempre numa única transação.
 *
 * A regra de QUEM entra/sai mora em shared/scaling-validation-rules.ts e em
 * server/scaling-validation.ts; aqui só o SQL.
 */
import { eq, and, or, isNull, desc, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  teamInclusions, teamInclusionLogs, events, scalingChangeRequests,
  type TeamInclusion, type InsertTeamInclusion, type InsertTeamInclusionLog,
  type ScalingChangeRequest,
} from "@shared/schema";
import { VAGA_STATE_CHANGED_MSG } from "@shared/scaling-validation-rules";
import { idsUnicos, SUGESTAO_PHASE_VALUE, PENDING_REQUEST_STATUS } from "./_comum";

/** Linha completa de scaling_change_requests para inserção (identidade já resolvida pelo servidor). */
export type InsertScalingChangeRequestRow = typeof scalingChangeRequests.$inferInsert;

/** Entrada de `cancelScalingSuggestionSend` (quem decide O QUE sai é o chamador, via `statuses`). */
export interface CancelSuggestionSendParams {
  eventId: string;
  /** Status de sugestão que saem (shared: CANCELABLE_SUGESTAO_STATUS). */
  statuses: readonly string[];
  /** Patch do soft delete (deletedAt/deletedBy/updatedBy). */
  patch: Partial<InsertTeamInclusion>;
  /** Log por vaga removida — gravado DENTRO da transação. */
  logFor: (removed: TeamInclusion) => InsertTeamInclusionLog;
  /**
   * Quais pedidos PENDENTES do evento são encerrados junto (shared:
   * `isRequestCanceledByCancelSend`). A regra vem de fora para não existir uma
   * segunda cópia dela em SQL.
   */
  shouldCancelRequest: (request: ScalingChangeRequest, removedInclusionIds: ReadonlySet<string>) => boolean;
  /** Patch dos pedidos encerrados (status/reviewComment/reviewedBy/reviewedByName/reviewedAt). */
  requestPatch: Partial<InsertScalingChangeRequestRow>;
}

export interface CancelSuggestionSendResult {
  removed: TeamInclusion[];
  requestsCanceled: ScalingChangeRequest[];
}

// ── Sugestões ─────────────────────────────────────────────────────────────

// Sugestões em lote + observações do evento numa única transação: ou entra
// tudo, ou nada (mesmo padrão de createTeamInclusionsBatch).
export async function createScalingSuggestionsBatch(
  rows: InsertTeamInclusion[],
  eventUpdate?: { eventId: string; observations: string | null },
  logFor?: (created: TeamInclusion) => InsertTeamInclusionLog,
): Promise<TeamInclusion[]> {
  return await db.transaction(async (tx) => {
    // INSERT multi-linha + logs na MESMA transação (23/09): antes eram N
    // inserts e os logs iam depois, fora dela — uma falha no meio deixava
    // vaga sem registro de criação.
    const created = rows.length > 0 ? await tx.insert(teamInclusions).values(rows).returning() : [];
    if (logFor && created.length > 0) {
      await tx.insert(teamInclusionLogs).values(created.map(logFor));
    }
    if (eventUpdate) {
      await tx.update(events)
        .set({ observations: eventUpdate.observations })
        .where(eq(events.id, eventUpdate.eventId));
    }
    return created;
  });
}

export async function validateScalingSuggestionsBatch(
  ids: string[],
  patch: Partial<InsertTeamInclusion>,
  expected: { phase: string; status: string },
  logFor: (updated: TeamInclusion) => InsertTeamInclusionLog,
): Promise<TeamInclusion[]> {
  const unique = idsUnicos(ids);
  if (unique.length === 0) return [];
  return await db.transaction(async (tx) => {
    // Um único UPDATE guardado pelo estado esperado: vaga que mudou de estado
    // entre a leitura e a gravação simplesmente não volta no RETURNING.
    const updated = await tx.update(teamInclusions)
      .set(patch)
      .where(and(
        inArray(teamInclusions.id, unique),
        isNull(teamInclusions.deletedAt),
        eq(teamInclusions.phase, expected.phase),
        eq(teamInclusions.status, expected.status),
      ))
      .returning();
    if (updated.length > 0) {
      await tx.insert(teamInclusionLogs).values(updated.map((row) => logFor(row)));
    }
    return updated;
  });
}

/**
 * "Cancelar envio" da Sugestão de Escala — desfaz o /bulk de um evento inteiro.
 *
 * UMA transação com três passos: (1) soft delete das vagas do evento em
 * phase 'sugestao' cujo status está em `statuses` e que ainda não foram
 * excluídas; (2) um log por vaga removida; (3) encerramento dos pedidos
 * PENDENTES daquelas vagas — mais os pedidos de INCLUSÃO do evento
 * (team_inclusion_id null), que pedem uma vaga nova num envio que deixou de
 * existir. Ou tudo entra, ou nada: sem a transação, um erro no meio deixaria
 * vagas excluídas com pedidos vivos apontando para elas.
 *
 * A regra de QUEM sai (status / pedidos) mora em
 * shared/scaling-validation-rules.ts — aqui só o SQL.
 */
export async function cancelScalingSuggestionSend(params: CancelSuggestionSendParams): Promise<CancelSuggestionSendResult> {
  const statuses = idsUnicos(params.statuses);
  if (statuses.length === 0) return { removed: [], requestsCanceled: [] };
  return await db.transaction(async (tx) => {
    const removed = await tx.update(teamInclusions)
      .set(params.patch)
      .where(and(
        eq(teamInclusions.eventId, params.eventId),
        eq(teamInclusions.phase, SUGESTAO_PHASE_VALUE),
        inArray(teamInclusions.status, statuses),
        isNull(teamInclusions.deletedAt),
      ))
      .returning();
    // Nada removido: não há pedido a encerrar (o único caso de pedido sem vaga
    // é o de inclusão, e ele só faz sentido com o envio ainda de pé).
    if (removed.length === 0) return { removed, requestsCanceled: [] };

    await tx.insert(teamInclusionLogs).values(removed.map((row) => params.logFor(row)));

    // Os pedidos pendentes do evento são poucos (fila da área) — lê e decide
    // com a regra do shared, em vez de reescrevê-la como um WHERE paralelo.
    const removedIds = new Set(removed.map((r) => r.id));
    const pending = await tx.select().from(scalingChangeRequests).where(and(
      eq(scalingChangeRequests.eventId, params.eventId),
      eq(scalingChangeRequests.status, PENDING_REQUEST_STATUS),
    ));
    const toCancel = pending.filter((r) => params.shouldCancelRequest(r, removedIds));
    if (toCancel.length === 0) return { removed, requestsCanceled: [] };

    const requestsCanceled = await tx.update(scalingChangeRequests)
      .set({ ...params.requestPatch, updatedAt: new Date() })
      .where(inArray(scalingChangeRequests.id, toCancel.map((r) => r.id)))
      .returning();
    return { removed, requestsCanceled };
  });
}

// ── Pedidos de ajuste (scaling_change_requests) ───────────────────────────

export async function getScalingChangeRequests(filters?: {
  status?: string; eventId?: string; eventIds?: string[]; functionIds?: string[];
  /**
   * Quem abriu o pedido também o vê, mesmo sem ser aprovador da função. Sem
   * isto, quem pediu um ajuste não tinha como acompanhar a própria fila —
   * perguntava por fora "e aí, saiu?".
   */
  orRequestedBy?: string;
}): Promise<ScalingChangeRequest[]> {
  const conditions = [];
  if (filters?.status && filters.status !== "all") conditions.push(eq(scalingChangeRequests.status, filters.status));
  if (filters?.eventId && filters.eventId !== "all") conditions.push(eq(scalingChangeRequests.eventId, filters.eventId));
  // Recorte "todos os eventos" da Validação de Escala: o servidor manda o
  // conjunto de eventos que ainda importa — filtro no banco, nunca em JS.
  if (filters?.eventIds) {
    if (filters.eventIds.length === 0) return [];
    conditions.push(inArray(scalingChangeRequests.eventId, filters.eventIds));
  }
  if (filters?.functionIds) {
    const porFuncao = filters.functionIds.length > 0
      ? inArray(scalingChangeRequests.functionId, filters.functionIds)
      : null;
    const meus = filters.orRequestedBy ? eq(scalingChangeRequests.requestedBy, filters.orRequestedBy) : null;
    // Aprovador de algumas funções E autor de pedidos em outras: vê os dois
    // conjuntos, não a interseção.
    if (porFuncao && meus) conditions.push(or(porFuncao, meus)!);
    else if (porFuncao) conditions.push(porFuncao);
    else if (meus) conditions.push(meus);
    else return [];
  }
  const query = db.select().from(scalingChangeRequests).orderBy(desc(scalingChangeRequests.createdAt));
  if (conditions.length === 0) return await query;
  return await query.where(and(...conditions));
}

export async function getScalingChangeRequest(id: string): Promise<ScalingChangeRequest | undefined> {
  const [row] = await db.select().from(scalingChangeRequests).where(eq(scalingChangeRequests.id, id));
  return row;
}

export async function getScalingChangeRequestsByInclusion(teamInclusionId: string): Promise<ScalingChangeRequest[]> {
  return await db.select().from(scalingChangeRequests)
    .where(eq(scalingChangeRequests.teamInclusionId, teamInclusionId))
    .orderBy(desc(scalingChangeRequests.createdAt));
}

export async function createScalingChangeRequest(request: InsertScalingChangeRequestRow): Promise<ScalingChangeRequest> {
  const [row] = await db.insert(scalingChangeRequests).values(request).returning();
  return row;
}

export async function updateScalingChangeRequest(id: string, updates: Partial<InsertScalingChangeRequestRow>): Promise<ScalingChangeRequest | undefined> {
  const [row] = await db.update(scalingChangeRequests)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(scalingChangeRequests.id, id))
    .returning();
  return row;
}

// Abertura de pedido + transição da vaga (pendente → ajuste) na MESMA
// transação: sem isso, um retry podia gravar o pedido e deixar a vaga no
// estado antigo (ou vice-versa). O UPDATE da vaga é GUARDADO pelo estado
// esperado (`newState.expected`): se uma decisão concorrente já tirou a vaga
// de lá, 0 linhas → a transação ABORTA e o pedido NÃO fica criado (senão
// sobraria um pedido pendente preso apontando para uma vaga já decidida).
export async function createScalingChangeRequestWithTransition(
  request: InsertScalingChangeRequestRow,
  inclusionId: string | null,
  newState: {
    phase: string; status: string; updatedBy?: string | null;
    expected: { phase: string; statuses: readonly string[] };
  } | null,
): Promise<{ request: ScalingChangeRequest; inclusion: TeamInclusion | null }> {
  return await db.transaction(async (tx) => {
    const [created] = await tx.insert(scalingChangeRequests).values(request).returning();
    let inclusion: TeamInclusion | null = null;
    if (inclusionId && newState) {
      const [row] = await tx.update(teamInclusions)
        .set({ phase: newState.phase, status: newState.status, updatedBy: newState.updatedBy ?? undefined })
        .where(and(
          eq(teamInclusions.id, inclusionId),
          isNull(teamInclusions.deletedAt),
          eq(teamInclusions.phase, newState.expected.phase),
          inArray(teamInclusions.status, [...newState.expected.statuses]),
        ))
        .returning();
      // Lança DENTRO da transação: o insert do pedido é desfeito junto.
      if (!row) throw new Error(VAGA_STATE_CHANGED_MSG);
      inclusion = row;
    }
    return { request: created, inclusion };
  });
}

// Decisão do aprovador (aprovar / reajustar / negar) numa ÚNICA transação:
// aplica mudanças na(s) vaga(s) e/ou cria vagas novas E marca o pedido como
// decidido. Um retry não duplica vagas nem deixa o pedido preso em 'pendente'.
// Se houver inserts, resolvedInclusionId do pedido = id da primeira vaga criada.
// ATENÇÃO: resolvedInclusionId é UMA coluna e um pedido de inclusão com
// quantity > 1 cria N vagas — as vagas 2..N NÃO ficam apontadas aqui. Quem as
// reconecta ao pedido (para exibir "Vaga criada pelo aprovador — validar" e o
// comentário dele) é `matchesCreatedFromRequest` em server/scaling-validation.ts,
// que casa evento + função + suggestionSentAt == reviewedAt. Por isso o
// chamador DEVE usar o MESMO objeto Date em requestUpdates.reviewedAt e no
// suggestionSentAt das linhas inseridas.
export async function resolveScalingChangeRequest(
  requestId: string,
  requestUpdates: Partial<InsertScalingChangeRequestRow>,
  ops: {
    inclusionUpdate?: {
      id: string; patch: Partial<InsertTeamInclusion>;
      /** Estado que a vaga PRECISA ter para o patch valer (guarda TOCTOU). */
      expected?: { phase: string; statuses: readonly string[] };
    } | null;
    inclusionInserts?: InsertTeamInclusion[];
    /** Registros das vagas criadas, gravados DENTRO da transação (23/09). */
    logsForCreated?: (created: TeamInclusion[]) => InsertTeamInclusionLog[];
  } = {},
): Promise<{ request: ScalingChangeRequest; updatedInclusion: TeamInclusion | null; createdInclusions: TeamInclusion[] }> {
  return await db.transaction(async (tx) => {
    // Trava o pedido: só decide se ainda estiver pendente (evita dupla decisão em retry).
    const [locked] = await tx.update(scalingChangeRequests)
      .set({ updatedAt: new Date() })
      .where(and(eq(scalingChangeRequests.id, requestId), eq(scalingChangeRequests.status, "pendente")))
      .returning();
    if (!locked) throw new Error("Este pedido já foi decidido");

    let updatedInclusion: TeamInclusion | null = null;
    if (ops.inclusionUpdate) {
      // UPDATE guardado pelo estado esperado (quando o chamador o informa):
      // se a vaga já não está mais lá (decisão concorrente), 0 linhas → a
      // transação ABORTA e o pedido volta a 'pendente' intacto.
      const expected = ops.inclusionUpdate.expected;
      const [row] = await tx.update(teamInclusions)
        .set(ops.inclusionUpdate.patch)
        .where(and(
          eq(teamInclusions.id, ops.inclusionUpdate.id),
          ...(expected
            ? [
                isNull(teamInclusions.deletedAt),
                eq(teamInclusions.phase, expected.phase),
                inArray(teamInclusions.status, [...expected.statuses]),
              ]
            : []),
        ))
        .returning();
      if (!row) throw new Error(expected ? VAGA_STATE_CHANGED_MSG : "Vaga do pedido não encontrada");
      updatedInclusion = row;
    }
    // INSERT multi-linha (23/09); o RETURNING preserva a ordem dos VALUES,
    // então createdInclusions[0] continua sendo a primeira vaga pedida.
    const inserts = ops.inclusionInserts ?? [];
    const createdInclusions: TeamInclusion[] = inserts.length > 0
      ? await tx.insert(teamInclusions).values(inserts).returning()
      : [];
    if (ops.logsForCreated && createdInclusions.length > 0) {
      const logs = ops.logsForCreated(createdInclusions);
      if (logs.length > 0) await tx.insert(teamInclusionLogs).values(logs);
    }
    const resolvedInclusionId = requestUpdates.resolvedInclusionId
      ?? createdInclusions[0]?.id
      ?? null;
    const [request] = await tx.update(scalingChangeRequests)
      .set({ ...requestUpdates, resolvedInclusionId, updatedAt: new Date() })
      .where(eq(scalingChangeRequests.id, requestId))
      .returning();
    return { request, updatedInclusion, createdInclusions };
  });
}
