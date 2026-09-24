/**
 * Trocas (swap_requests). As consultas ficam em SQL cru dentro de
 * routes/trocas.ts (SELECT sr.* + joins); o storage só expõe o mapeador da
 * linha bruta.
 */

/**
 * Linha bruta de swap_requests (SELECT sr.* + joins), como o SQL devolve —
 * snake_case. Até 23/09 cada chave saía DUPLICADA (snake + camel), dobrando o
 * payload da lista de trocas; o client unificou a leitura em
 * client/src/lib/swap-types.ts (`normalizeSwap`), que lê snake_case primeiro.
 * Só as chaves snake ficam; nenhum consumidor lia as camel.
 */
export function mapSwapRequestRow(row: Record<string, any>): Record<string, any> {
  return { ...row };
}
