/**
 * Painéis de passagens e hospedagem (30/10) — as consultas. Nenhuma rota
 * nova: as MESMAS chaves de cache da Escalação, de Passagens e de Hospedagem
 * (quem vem de uma dessas telas abre o painel com os dados já em memória, e
 * registrar uma passagem/hospedagem lá invalida aqui também).
 *
 *  - vagas: a lista global (`listaDeVagasQuery`, a mesma de Passagens/Hospedagem);
 *  - eventos e funções: `/api/events`, `/api/functions`;
 *  - passagens atuais `/api/tickets` e do histórico de troca (`["/api/tickets", "historico", { eventId: "todos" }]`);
 *  - hospedagens `/api/accommodations`;
 *  - prazos D-N do Quadro: `useDiasDosPrazos` (/api/escala/prazos).
 *
 * "Pegar as atualizações o mais rápido possível" (dono, 30/10): passagens e
 * hospedagens se atualizam sozinhas a cada 2 minutos com a tela aberta (são
 * leves); a lista de vagas — que leva dezenas de segundos em produção — só
 * no botão "Atualizar" ou quando outra tela a invalida.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Accommodation, Event, Function as Funcao, TeamInclusion, Ticket } from "@shared/schema";
import { fetchJson } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { listaDeVagasQuery, recorteDaListaDeVagas } from "@/hooks/use-vaga-acoes";
import { useDiasDosPrazos } from "@/components/scaling/scaling-analytics-quadro";
import type { DiasDosPrazos } from "@shared/prazos-da-escala";

export const INTERVALO_DE_ATUALIZACAO = 120_000;

export interface DadosDosPaineis {
  vagas: TeamInclusion[];
  eventos: Event[];
  funcoes: Funcao[];
  passagens: Ticket[];
  historico: Ticket[];
  hospedagens: Accommodation[];
  dias: DiasDosPrazos;
}

export function useDadosDosPaineis({ passagens: comPassagens, hospedagens: comHospedagens }: { passagens: boolean; hospedagens: boolean }) {
  const { user } = useAuth();
  const vagas = useQuery<TeamInclusion[]>({ ...listaDeVagasQuery(recorteDaListaDeVagas({ user })) });
  const eventos = useQuery<Event[]>({ queryKey: ["/api/events"], queryFn: ({ signal }) => fetchJson<Event[]>("/api/events", signal), staleTime: 300_000 });
  const funcoes = useQuery<Funcao[]>({ queryKey: ["/api/functions"], queryFn: ({ signal }) => fetchJson<Funcao[]>("/api/functions", signal), staleTime: 300_000 });
  const passagens = useQuery<Ticket[]>({
    queryKey: ["/api/tickets"],
    queryFn: ({ signal }) => fetchJson<Ticket[]>("/api/tickets", signal),
    enabled: comPassagens,
    refetchInterval: INTERVALO_DE_ATUALIZACAO,
  });
  const historico = useQuery<Ticket[]>({
    queryKey: ["/api/tickets", "historico", { eventId: "todos" }],
    queryFn: ({ signal }) => fetchJson<Ticket[]>("/api/tickets/historico", signal),
    enabled: comPassagens,
    staleTime: 60_000,
  });
  const hospedagens = useQuery<Accommodation[]>({
    queryKey: ["/api/accommodations"],
    queryFn: ({ signal }) => fetchJson<Accommodation[]>("/api/accommodations", signal),
    enabled: comHospedagens,
    refetchInterval: INTERVALO_DE_ATUALIZACAO,
  });
  const dias = useDiasDosPrazos();

  // O que a tela não sabe desenhar sem: vagas, eventos e a lista da etapa.
  const essenciais = [vagas, eventos, ...(comPassagens ? [passagens] : []), ...(comHospedagens ? [hospedagens] : [])];
  const carregando = essenciais.some((q) => q.isLoading);
  const erro = essenciais.find((q) => q.isError && !q.data)?.error ?? null;
  const atualizando = !carregando && [vagas, eventos, funcoes, passagens, historico, hospedagens].some((q) => q.isFetching);
  // A leitura mais antiga das listas que mudam — é ela que diz "atualizado às".
  const atualizadoEm = Math.min(...essenciais.map((q) => q.dataUpdatedAt || Date.now()));

  const dados = useMemo<DadosDosPaineis | null>(() => {
    if (!vagas.data || !eventos.data) return null;
    if (comPassagens && !passagens.data) return null;
    if (comHospedagens && !hospedagens.data) return null;
    return {
      vagas: vagas.data,
      eventos: eventos.data,
      funcoes: funcoes.data ?? [],
      passagens: passagens.data ?? [],
      historico: historico.data ?? [],
      hospedagens: hospedagens.data ?? [],
      dias,
    };
  }, [vagas.data, eventos.data, funcoes.data, passagens.data, historico.data, hospedagens.data, dias, comPassagens, comHospedagens]);

  const atualizar = () => {
    void vagas.refetch();
    void eventos.refetch();
    void funcoes.refetch();
    if (comPassagens) { void passagens.refetch(); void historico.refetch(); }
    if (comHospedagens) void hospedagens.refetch();
  };

  return { dados, carregando, erro, atualizando, atualizadoEm, atualizar };
}
