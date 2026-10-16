/**
 * Dados das abas de análise da Busca de passagens (etapa 2, 09/10) — só admin
 * (as rotas recusam os outros papéis). Uma consulta por aba, com o período na
 * chave: trocar de período mantém o resultado anterior (esmaecido) até o novo
 * chegar, como na aba Análises de Passagens.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/queryClient";
import type { CustosOcultos, MelhorMomento, PagoXEncontrado, PrecoPorRota } from "@shared/analise-da-busca";
import type { Orcamento, PrevisaoDaVaga, ResumoDaPrevisao } from "@shared/previsao-da-busca";
import type { PeriodoDaAnalise } from "../filtros-da-busca";

export type RespostaDoMomento = MelhorMomento & { periodo: PeriodoDaAnalise };
export type RespostaDaRota = PrecoPorRota & { periodo: PeriodoDaAnalise };
export type RespostaDoPago = PagoXEncontrado & { periodo: PeriodoDaAnalise };
export interface RespostaDaPrevisao { hoje: string; consultas: number; linhas: PrevisaoDaVaga[]; resumo: ResumoDaPrevisao }
export interface RespostaDoOrcamento { periodo: PeriodoDaAnalise; hoje: string; orcamento: Orcamento; custosOcultos: CustosOcultos }

const BASE = "/api/busca-de-passagens/analises";

function useAnalise<T>(aba: string, periodo: PeriodoDaAnalise | null, ativo = true) {
  // Só as abas de HISTÓRICO (com período) — a previsão olha as pendentes de agora.
  const historico = periodo !== null;
  const url = periodo ? `${BASE}/${aba}?periodo=${periodo}` : `${BASE}/${aba}`;
  return useQuery<T>({
    queryKey: [BASE, aba, periodo ?? "-"],
    queryFn: ({ signal }) => fetchJson<T>(url, signal),
    enabled: ativo,
    // Histórico (16/10): não muda de um minuto para o outro. Com o
    // padrão do app (60 s + refetch ao focar a janela) cada volta à aba ou à
    // janela recalculava tudo no servidor. 5 min, sem refetch ao focar (o F5
    // continua buscando de novo).
    staleTime: historico ? 5 * 60_000 : 60_000,
    refetchOnWindowFocus: !historico,
    placeholderData: keepPreviousData,
  });
}

export const useMelhorMomento = (p: PeriodoDaAnalise) => useAnalise<RespostaDoMomento>("melhor-momento", p);
export const usePrecoPorRota = (p: PeriodoDaAnalise) => useAnalise<RespostaDaRota>("preco-por-rota", p);
export const usePagoXEncontrado = (p: PeriodoDaAnalise) => useAnalise<RespostaDoPago>("pago-x-encontrado", p);
export const useOrcamento = (p: PeriodoDaAnalise) => useAnalise<RespostaDoOrcamento>("orcamento", p);
/** A previsão não tem período: olha as pendentes de hoje e um ano de consultas. */
export const usePrevisao = (ativo = true) => useAnalise<RespostaDaPrevisao>("previsao", null, ativo);
