/**
 * Painéis (30/10) — o feed de GET /api/paineis/atividade, paginado por
 * cursor e atualizado sozinho a cada 60 s (o pedido do dono: pegar inclusões
 * e mudanças o quanto antes). A Visão geral usa a primeira página (24 h) para
 * o bloco "Últimas inclusões"; a Atividade recente usa todas.
 */
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/queryClient";
import { urlDaAtividade, type FiltrosDoServidor, type ItemDaAtividade, type RespostaDaAtividade } from "./atividade-tipos";

export const CHAVE_DA_ATIVIDADE = "/api/paineis/atividade";
export const ATUALIZA_A_CADA_MS = 60_000;

export function useAtividade(filtros: FiltrosDoServidor, opcoes: { limite?: number; enabled?: boolean } = {}) {
  const limite = opcoes.limite ?? 50;
  const q = useInfiniteQuery<RespostaDaAtividade, Error, { pages: RespostaDaAtividade[] }, readonly unknown[], string | null>({
    queryKey: [CHAVE_DA_ATIVIDADE, filtros, limite],
    queryFn: ({ pageParam, signal }) => fetchJson<RespostaDaAtividade>(urlDaAtividade(filtros, pageParam, limite), signal),
    initialPageParam: null,
    getNextPageParam: (ultima) => ultima.proximo,
    // Atualizar uma lista infinita rebusca TODAS as páginas abertas — e cada
    // uma remonta a janela inteira no servidor. Com "Carregar mais" aberto, só
    // o botão Atualizar busca de novo.
    refetchInterval: (query) => ((query.state.data?.pages.length ?? 0) > 1 ? false : ATUALIZA_A_CADA_MS),
    // Trocar de filtro mantém a lista anterior na tela até a nova chegar.
    placeholderData: keepPreviousData,
    enabled: opcoes.enabled ?? true,
  });
  const paginas = q.data?.pages ?? [];
  const itens: ItemDaAtividade[] = paginas.flatMap((p) => p.itens);
  const primeira = paginas[0];
  return {
    ...q,
    itens,
    total: primeira?.total ?? 0,
    resumo: primeira?.resumo ?? null,
    cortado: !!primeira?.cortado,
  };
}
