/**
 * Consulta ÚNICA de GET /api/swap-requests (23/09).
 *
 * Antes, cinco lugares (casca, Hospedagem, Passagens, Escalação, Inclusão de
 * Equipe) usavam a mesma chave ["/api/swap-requests"] com `queryFn` e
 * formatos diferentes (cru snake_case, normalizado, `[]` em erro...). O
 * React Query guarda UM valor por chave: o formato dependia de quem buscou
 * por último e os badges do menu zeravam ao abrir Hospedagem.
 *
 * Aqui a resposta é normalizada UMA vez (camelCase, `NormalizedSwap`) e todo
 * consumidor lê o mesmo cache. Erro de rede/sessão segue o padrão do
 * queryClient (ApiError + retry) em vez de virar lista vazia em silêncio.
 */
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/queryClient";
import { normalizeSwaps, type NormalizedSwap } from "@/lib/swap-types";

export const SWAP_REQUESTS_QUERY_KEY = ["/api/swap-requests"] as const;

export interface UseSwapRequestsOptions<T = NormalizedSwap[]> {
  /** Só a casca pede o refetch periódico (30s); as telas leem o mesmo cache. */
  refetchInterval?: number | false;
  enabled?: boolean;
  /** Recorte derivado (memoizado pelo React Query). */
  select?: (swaps: NormalizedSwap[]) => T;
}

export function useSwapRequests<T = NormalizedSwap[]>(options: UseSwapRequestsOptions<T> = {}) {
  const { refetchInterval, enabled, select } = options;
  return useQuery<NormalizedSwap[], Error, T>({
    queryKey: SWAP_REQUESTS_QUERY_KEY,
    queryFn: async ({ signal }) => normalizeSwaps(await fetchJson<unknown>("/api/swap-requests", signal)),
    ...(refetchInterval !== undefined ? { refetchInterval } : {}),
    ...(enabled !== undefined ? { enabled } : {}),
    ...(select ? { select } : {}),
  });
}
