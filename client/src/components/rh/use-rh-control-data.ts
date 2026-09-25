// Extraído de rh-control.tsx em 25/09 (modularização): dados do Controle RH.
// Só dados — nenhum JSX. A filtragem pela UI fica em `use-rh-fila-filtrada.ts`.
//
// Endpoint agregado (25/09): até aqui este hook fazia SETE consultas
// (/api/team-inclusions ~4.500 linhas, /api/budget-planned, /api/budget-actual,
// /api/invoices, /api/users, /api/collaborators, /api/functions) e cruzava tudo
// em `useMemo`. O cruzamento virou a função pura `montarControleRh`
// (shared/controle-rh.ts) e roda no servidor: GET /api/rh/controle?eventId=&status=
// devolve as linhas prontas (status, responsável, nomes, NF, isenção) mais os
// contadores dos cards e as funções presentes. Aqui sobra UMA consulta para a
// lista e a de /api/events-with-inclusions para o select de evento.
//
// Evento e status vão na URL do servidor; busca por texto, função, colaborador,
// NF e check-in continuam no client (rápidos sobre a lista já enxuta).
import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/queryClient";
import { useQueriesState, type QueriesState } from "@/components/common/query-state";
import type { Event } from "@shared/schema";
import type { ControleRh, StatusDaPrestacao } from "@shared/controle-rh";
import type { PrestacaoItem, PrestacaoStatus } from "./prestacao-types";
import { CHAVE_CONTROLE_RH, statusParaServidor, urlDoControleRh } from "./prestacao-utils";

export type InvoiceCounts = ControleRh["contadores"]["nf"];

/** Opção do select de evento (vem de /api/events-with-inclusions). */
export interface EventoDoSelect { id: string; name: string }

export interface RhControlData {
  estado: QueriesState;
  isLoading: boolean;
  /** Já há dados na tela e o servidor está devolvendo outro recorte (troca de evento/status). */
  atualizando: boolean;
  /** Linhas do recorte pedido ao servidor (evento + status); os demais filtros são do client. */
  prestacaoItems: PrestacaoItem[];
  /** Contadores sobre TODAS as linhas do recorte de evento (não mudam com o filtro de status). */
  statusCounts: Record<StatusDaPrestacao, number>;
  invoiceCounts: InvoiceCounts;
  rhActionCount: number;
  concludedCount: number;
  totalForProgress: number;
  progressPct: number;
  /** Funções presentes nas linhas (select de filtro), ordenadas por nome pelo servidor. */
  funcoes: { id: string; name: string }[];
  /** Eventos com escalação — as opções do select de evento. */
  eventosDoSelect: EventoDoSelect[];
}

const CONTADORES_VAZIOS: ControleRh["contadores"] = {
  status: {
    planejamento_pendente: 0, aguardando_prestacao: 0, prestacao_recebida: 0,
    devolvida_para_ajuste: 0, aprovada_faturamento: 0, recusada: 0,
  },
  nf: { pending: 0, enviada: 0, devolvida: 0, aprovada: 0, checkinPending: 0, checkinDone: 0 },
  rhAction: 0,
  totalParaProgresso: 0,
};

const SEM_ITENS: PrestacaoItem[] = [];
const SEM_FUNCOES: ControleRh["funcoes"] = [];

/**
 * @param eventoSelecionado id do evento filtrado, ou `null` em "Todos os eventos".
 * @param filterStatus filtro de status da tela ("all" = tudo).
 */
export function useRhControlData(eventoSelecionado: string | null, filterStatus: PrestacaoStatus): RhControlData {
  const statusServidor = statusParaServidor(filterStatus);
  // Chave com objeto (como tickets/hospedagens): `["/api/rh/controle"]` invalida
  // todos os recortes de uma vez. O queryFn padrão faz `join("/")`, por isso a
  // URL é montada à mão com `fetchJson` (mesmo caminho de credenciais/erros).
  const q = useQuery<ControleRh>({
    queryKey: [CHAVE_CONTROLE_RH, { eventId: eventoSelecionado ?? undefined, status: statusServidor }],
    queryFn: ({ signal }) => fetchJson<ControleRh>(urlDoControleRh(eventoSelecionado, statusServidor), signal),
    // Clicar num card ou trocar o evento não zera a tela para um skeleton: a
    // lista anterior fica (esmaecida pela página) até o novo recorte chegar.
    placeholderData: keepPreviousData,
  });
  // Opções do select de evento: independentes do filtro (a lista filtrada por
  // evento esvaziaria o dropdown). Falha aqui não derruba a fila.
  const qEventsWithInclusions = useQuery<Event[]>({ queryKey: ["/api/events-with-inclusions"] });

  // Erro/carregando da consulta que monta a lista (23/09): antes uma falha de
  // rede virava "Todos os itens estão em dia" — o pior vazio possível para o RH.
  const estado = useQueriesState([q]);
  const isLoading = estado.isLoading;
  const atualizando = !isLoading && q.isFetching;

  const dados = q.data;
  const prestacaoItems = (dados?.itens as PrestacaoItem[] | undefined) ?? SEM_ITENS;
  const contadores = dados?.contadores ?? CONTADORES_VAZIOS;
  const funcoes = dados?.funcoes ?? SEM_FUNCOES;

  const eventosDoSelect = useMemo<EventoDoSelect[]>(
    () => (qEventsWithInclusions.data ?? []).map(e => ({ id: e.id, name: e.name })),
    [qEventsWithInclusions.data],
  );

  // "Concluído" = NF aprovada + check-in físico realizado (checkinAt)
  const concludedCount = contadores.nf.checkinDone;

  // Denominador do progresso: o servidor conta sobre TODAS as linhas do recorte
  // de evento (sem o filtro de status) — regra `linhaContaNoProgresso` em
  // shared/controle-rh. Vale também para a tela aberta já filtrada (deep link).
  const totalForProgress = contadores.totalParaProgresso;
  const progressPct = totalForProgress > 0 ? Math.round(concludedCount / totalForProgress * 100) : 0;

  return {
    estado, isLoading, atualizando,
    prestacaoItems,
    statusCounts: contadores.status,
    invoiceCounts: contadores.nf,
    rhActionCount: contadores.rhAction,
    concludedCount, totalForProgress, progressPct,
    funcoes, eventosDoSelect,
  };
}
