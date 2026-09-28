/**
 * `QueryClient` de teste com o `queryFn` PADRÃO do app (28/09).
 *
 * `criarQueryClient()` (render.tsx) não define `queryFn`; componentes que
 * consultam só pela chave — `useQuery({ queryKey: ["/api/comments", id] })` —
 * precisam do `getQueryFn` real para bater no `fetch` mockado. Sem retry, sem
 * refetch em foco, cache zerado ao fim do teste (mesmos padrões do render).
 */
import { QueryClient } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

export function criarQueryClientComApi(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: getQueryFn({ on401: "throw" }),
        retry: false,
        refetchOnWindowFocus: false,
        staleTime: 0,
        gcTime: 0,
      },
      mutations: { retry: false },
    },
  });
}
