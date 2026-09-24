/**
 * Trocas (swap_requests). As consultas ficam em SQL cru dentro de
 * routes/trocas.ts (SELECT sr.* + joins); o storage só expõe o tipo da linha
 * bruta e o mapeador.
 */

/**
 * Linha bruta de swap_requests (SELECT sr.* + joins), como o SQL devolve —
 * snake_case. Até 23/09 cada chave saía DUPLICADA (snake + camel), dobrando o
 * payload da lista de trocas; o client unificou a leitura em
 * client/src/lib/swap-types.ts (`normalizeSwap`), que lê snake_case primeiro.
 * Só as chaves snake ficam; nenhum consumidor lia as camel.
 *
 * As colunas espelham `swapRequests` (shared/schema.ts). `new_collaborator_id`
 * é obrigatório no POST e nunca fica nulo na prática; a coluna é nula só por
 * legado do schema.
 */
export interface SwapRequestRow {
  id: string;
  team_inclusion_id: string;
  requested_by: string;
  requested_by_name: string;
  current_collaborator_id: string | null;
  new_collaborator_id: string;
  reason: string;
  new_city: string | null;
  swap_kind: string;
  paired_inclusion_id: string | null;
  paired_new_city: string | null;
  status: string;
  review_comment: string | null;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  reviewed_at: Date | string | null;
  created_at: Date | string | null;
  // Joins de SQL_TROCAS_COM_JOINS (routes/trocas.ts) e do histórico da vaga.
  current_collaborator_name?: string | null;
  new_collaborator_name?: string | null;
  inclusion_status?: string | null;
  inclusion_deleted_at?: Date | string | null;
  inclusion_number?: number | null;
  inclusion_event_id?: string | null;
  event_name?: string | null;
  paired_inclusion_number?: number | null;
  paired_event_name?: string | null;
  paired_function_name?: string | null;
}

export function mapSwapRequestRow(row: SwapRequestRow): SwapRequestRow {
  return { ...row };
}
