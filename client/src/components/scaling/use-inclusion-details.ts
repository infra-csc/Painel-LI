/**
 * Consultas da inclusão selecionada (modal). Todas lazy: só com o modal aberto.
 * (25/09 — extraído de use-scaling-data.ts)
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { EntradaDoHistorico } from "@shared/inclusion-timeline";
import type { Comment, SwapRequest, User } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { normalizeSwap, type NormalizedSwap } from "./scaling-utils";

export function useInclusionDetails(inclusionId: string | undefined) {
  const enabled = !!inclusionId;

  const { data: comments, isLoading: isLoadingComments } = useQuery<Comment[]>({
    queryKey: ["/api/comments", inclusionId],
    enabled,
  });

  // Linha do tempo montada no servidor com TODAS as fontes (14/09) — a lista
  // crua de logs deixava de fora passagem, hospedagem, troca e criação.
  const { data: historico, isLoading: isLoadingLogs } = useQuery<EntradaDoHistorico[]>({
    queryKey: ["/api/team-inclusions", inclusionId, "timeline"],
    enabled,
  });

  const { data: swapRequestsRaw } = useQuery<SwapRequest[]>({
    queryKey: ["/api/swap-requests/inclusion", inclusionId],
    queryFn: async () => {
      if (!inclusionId) return [];
      const r = await apiRequest("GET", `/api/swap-requests/inclusion/${inclusionId}`);
      return r.json();
    },
    enabled,
  });

  // /api/users só é necessário para o nome dos autores dos comentários (a rota
  // de comentários não devolve userName) — carrega só com o modal aberto.
  const { data: users, refetch: refetchUsers } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled,
  });

  const swapRequests = useMemo<NormalizedSwap[]>(
    () => (swapRequestsRaw || []).map(normalizeSwap),
    [swapRequestsRaw],
  );
  const pendingSwap = swapRequests.find(s => s.status === "pendente");
  const latestSwap = swapRequests[0]; // mais recente (pode ser rejeitado/cancelado)

  /**
   * O histórico tem esqueleto próprio porque vem de OUTRA consulta: mostrar
   * "nenhum comentário" enquanto ela ainda corre é afirmar uma coisa que não
   * se sabe — e é justamente na aba de histórico que a ausência de conteúdo
   * costuma ser lida como fato.
   */
  const isLoadingHistorico = enabled && (isLoadingComments || isLoadingLogs);

  return { comments, historico, swapRequests, pendingSwap, latestSwap, users, refetchUsers, isLoadingHistorico };
}

export type InclusionDetails = ReturnType<typeof useInclusionDetails>;
