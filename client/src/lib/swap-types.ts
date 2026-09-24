/**
 * Solicitação de troca de colaborador normalizada em camelCase — TIPO ÚNICO
 * do client (23/09).
 *
 * Até então havia dois `NormalizedSwap` (accommodations/types.ts e
 * scaling/scaling-utils.ts) com campos diferentes, e cinco `queryFn` para a
 * MESMA chave ["/api/swap-requests"]: o formato do cache dependia de quem
 * buscou por último e os badges do menu zeravam ao abrir Hospedagem.
 *
 * A rota devolve SQL cru (snake_case) + camelCase por compatibilidade
 * (server/storage.ts `mapSwapRequestRow`); os joins trazem nomes, status da
 * vaga e a vaga pareada da permuta. Aqui aceitamos as duas grafias e
 * devolvemos só camelCase, preservando TODOS os campos que algum consumidor
 * lê (casca, Hospedagem, Passagens, Escalação, Inclusão de Equipe).
 */
import type { SwapRequest } from "@shared/schema";

export interface NormalizedSwap {
  id: string;
  teamInclusionId: string;
  requestedBy: string;
  requestedByName: string | null;
  currentCollaboratorId: string | null;
  newCollaboratorId: string | null;
  /** Nomes dos joins com collaborators. */
  currentCollaboratorName: string | null;
  newCollaboratorName: string | null;
  reason: string;
  /** 'pendente' | 'aprovado' | 'rejeitado' (texto livre no banco). */
  status: string;
  reviewComment: string | null;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string | null;
  /** De onde o novo colaborador sai (14/09); nulo em pedidos antigos. */
  newCity: string | null;
  /** 'substituicao' (troca simples) | 'permuta' (dois escalados trocam de vaga, 14/09) | 'transferencia'. */
  swapKind: string;
  /** Permuta: a outra vaga e de onde sai quem vai para ela. */
  pairedInclusionId: string | null;
  pairedNewCity: string | null;
  /** Número/evento da vaga do pedido e da vaga pareada (joins da API). */
  inclusionNumber: number | null;
  eventName: string | null;
  pairedInclusionNumber: number | null;
  pairedEventName: string | null;
  pairedFunctionName: string | null;
  /**
   * Status atual da VAGA (join com team_inclusions) — a casca separa os
   * badges de Passagens/Hospedagem/Escalação por ele. Nulo quando a vaga
   * não veio no join.
   */
  inclusionStatus: string | null;
  /** Vaga excluída (soft delete): a troca deixa de contar nos badges. */
  inclusionDeletedAt: string | null;
}

type RawSwap = SwapRequest | Record<string, unknown>;

const texto = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));
const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
/** Date do drizzle (rota por ORM) ou string ISO (SQL cru). */
const data = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : texto(v));

export function normalizeSwap(raw: RawSwap): NormalizedSwap {
  const s = raw as Record<string, unknown>;
  const pega = (snake: string, camel: string): unknown => (s[snake] !== undefined && s[snake] !== null ? s[snake] : s[camel]);
  return {
    id: String(s.id ?? ""),
    teamInclusionId: String(pega("team_inclusion_id", "teamInclusionId") ?? ""),
    requestedBy: String(pega("requested_by", "requestedBy") ?? ""),
    requestedByName: texto(pega("requested_by_name", "requestedByName")),
    currentCollaboratorId: texto(pega("current_collaborator_id", "currentCollaboratorId")),
    newCollaboratorId: texto(pega("new_collaborator_id", "newCollaboratorId")),
    currentCollaboratorName: texto(pega("current_collaborator_name", "currentCollaboratorName")),
    newCollaboratorName: texto(pega("new_collaborator_name", "newCollaboratorName")),
    reason: String(s.reason ?? ""),
    status: String(s.status ?? "pendente"),
    reviewComment: texto(pega("review_comment", "reviewComment")),
    reviewedBy: texto(pega("reviewed_by", "reviewedBy")),
    reviewedByName: texto(pega("reviewed_by_name", "reviewedByName")),
    reviewedAt: data(pega("reviewed_at", "reviewedAt")),
    createdAt: data(pega("created_at", "createdAt")),
    newCity: texto(pega("new_city", "newCity")),
    swapKind: String(pega("swap_kind", "swapKind") ?? "substituicao"),
    pairedInclusionId: texto(pega("paired_inclusion_id", "pairedInclusionId")),
    pairedNewCity: texto(pega("paired_new_city", "pairedNewCity")),
    inclusionNumber: numero(pega("inclusion_number", "inclusionNumber")),
    eventName: texto(pega("event_name", "eventName")),
    pairedInclusionNumber: numero(pega("paired_inclusion_number", "pairedInclusionNumber")),
    pairedEventName: texto(pega("paired_event_name", "pairedEventName")),
    pairedFunctionName: texto(pega("paired_function_name", "pairedFunctionName")),
    inclusionStatus: texto(pega("inclusion_status", "inclusionStatus")),
    inclusionDeletedAt: data(pega("inclusion_deleted_at", "inclusionDeletedAt")),
  };
}

export function normalizeSwaps(rows: unknown): NormalizedSwap[] {
  return Array.isArray(rows) ? rows.map((r) => normalizeSwap(r as RawSwap)) : [];
}

/** As vagas de uma troca: a do pedido e, na permuta/transferência, a outra (16/09). */
export function vagasDaTroca(s: Pick<NormalizedSwap, "teamInclusionId" | "pairedInclusionId">): string[] {
  return [s.teamInclusionId, s.pairedInclusionId].filter((id): id is string => !!id);
}

/**
 * Status da vaga da troca para os badges da casca: undefined quando a vaga
 * foi excluída ou não veio no join (sem isso, status indefinido virava badge
 * fantasma, 15/09).
 */
export function statusDaVagaDaTroca(s: Pick<NormalizedSwap, "inclusionStatus" | "inclusionDeletedAt">): string | undefined {
  if (s.inclusionDeletedAt) return undefined;
  return s.inclusionStatus ?? undefined;
}
