/**
 * Painéis (30/10) — a base de dados das telas de painel: as MESMAS consultas
 * da Escalação (mesmas chaves do React Query → o cache é compartilhado; quem
 * vem da Escalação, de Passagens ou de Hospedagem já tem quase tudo) e o
 * MESMO contexto das Análises (use-scaling-recorte.ts):
 *   - vagas: `listaDeVagasQuery(recorteDaListaDeVagas({ user }))` — a chave
 *     global de admin/Compras/Produção;
 *   - sugestões (Validação/Aprovação): `/api/team-inclusions?phase=sugestao`;
 *   - eventos, funções, passagens, hospedagens, prazos (`/api/escala/prazos`),
 *     trocas (`useSwapRequests`) e pedidos de ajuste pendentes (a chave do sino).
 * Recorte: eventos FUTUROS (o "Futuros" da Escalação), sem excluídas, sem
 * evento excluído, sem sugestão negada.
 *
 * Os números vêm de `analisarPorEvento` + `atrasosDosEventos` — a régua do
 * Quadro de prazos.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Accommodation, Event, Function, TeamInclusion, Ticket } from "@shared/schema";
import { isSuggestionInclusion, SUGESTAO_STATUS, CHANGE_REQUEST_STATUS } from "@shared/scaling-validation-rules";
import { vagaComEmpreita } from "@shared/cenotecnica-empreita";
import { useAuth } from "@/hooks/use-auth";
import { useSwapRequests } from "@/hooks/use-swap-requests";
import { listaDeVagasQuery, recorteDaListaDeVagas } from "@/hooks/use-vaga-acoes";
import { fetchJson, isApiError } from "@/lib/queryClient";
import { fixEncoding } from "@/lib/utils";
import { analisarPorEvento, type AnalyticsContext, type EventoAnalisado } from "@/components/scaling/scaling-analytics-data";
import { useDiasDosPrazos } from "@/components/scaling/scaling-analytics-quadro";
import { fazTesteDeRecorte } from "@/components/scaling/scaling-period";
import {
  atrasosDosEventos, resumirPedidos, vagasAtrasadas,
  type EventoComAtraso, type PedidoPendente, type ResumoDosPedidos,
} from "./paineis-dados";
import type { EtapaDoQuadro } from "@/components/scaling/scaling-analytics-data";

/** Chave do sino (use-shell-data.ts) — a mesma lista, uma requisição só. */
export const CHAVE_PEDIDOS_PENDENTES = ["shell", "pending-change-requests"] as const;

/**
 * "Hoje" que vira à meia-noite: a tela fica aberta na mesa de alguém o dia
 * inteiro, e um `new Date()` congelado manteria "vence hoje" no dia seguinte.
 */
export function useHoje(): Date {
  const [hoje, setHoje] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => {
      setHoje((atual) => (atual.toDateString() === new Date().toDateString() ? atual : new Date()));
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  return hoje;
}

/** Relógio de 15 s para o "atualizado há X" andar sozinho. */
export function useAgora(intervaloMs = 15_000): number {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), intervaloMs);
    return () => clearInterval(id);
  }, [intervaloMs]);
  return agora;
}

export interface BaseDosPaineis {
  carregando: boolean;
  /** A lista de vagas falhou (sem ela não há número nenhum). */
  erro: Error | null;
  semPermissao: boolean;
  recarregar: () => void;
  recarregando: boolean;
  /** Quando os dados mais velhos da tela foram buscados (ms). */
  atualizadoEm: number | null;
  hoje: Date;
  eventos: EventoAnalisado[];
  atrasos: EventoComAtraso[];
  atrasadas: Map<string, EtapaDoQuadro>;
  pedidos: ResumoDosPedidos;
  /** Pedidos ainda carregando ou indisponíveis para o papel. */
  pedidosDisponiveis: boolean;
  trocasPendentes: number;
  eventosPorId: Map<string, Event>;
  listaDeEventos: Event[];
}

export function useBaseDosPaineis(): BaseDosPaineis {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const hoje = useHoje();
  const dias = useDiasDosPrazos();

  const vagasQ = useQuery<TeamInclusion[]>({
    ...listaDeVagasQuery(recorteDaListaDeVagas({ user })),
    enabled: !!user,
    // A lista inteira é pesada: 5 min (o padrão da chave) e só com a aba visível.
    refetchInterval: 5 * 60_000,
  });
  const sugestoesQ = useQuery<TeamInclusion[]>({ queryKey: ["/api/team-inclusions?phase=sugestao"], enabled: !!user, staleTime: 60_000, refetchInterval: 2 * 60_000 });
  const eventosQ = useQuery<Event[]>({ queryKey: ["/api/events"], staleTime: 300_000 });
  const funcoesQ = useQuery<Function[]>({ queryKey: ["/api/functions"], staleTime: 300_000 });
  const passagensQ = useQuery<Ticket[]>({ queryKey: ["/api/tickets"], refetchInterval: 2 * 60_000 });
  const hospedagensQ = useQuery<Accommodation[]>({ queryKey: ["/api/accommodations"], refetchInterval: 2 * 60_000 });
  const trocasQ = useSwapRequests({ enabled: !!user });
  const pedidosQ = useQuery<PedidoPendente[]>({
    queryKey: [...CHAVE_PEDIDOS_PENDENTES],
    queryFn: async ({ signal }) => {
      try {
        const data = await fetchJson<unknown>(`/api/scaling-change-requests?status=${CHANGE_REQUEST_STATUS.PENDENTE}`, signal);
        return Array.isArray(data) ? (data as PedidoPendente[]) : [];
      } catch (err) {
        // Papel que não vê a fila de pedidos: o bloco fica sem números, a tela não quebra.
        if (isApiError(err) && err.status === 403) return [];
        throw err;
      }
    },
    enabled: !!user,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const eventosPorId = useMemo(() => {
    const m = new Map<string, Event>();
    for (const e of eventosQ.data ?? []) if (!m.has(e.id)) m.set(e.id, e);
    return m;
  }, [eventosQ.data]);
  const funcoesPorId = useMemo(() => new Map((funcoesQ.data ?? []).map((f) => [f.id, f] as const)), [funcoesQ.data]);
  const passagemComprada = useMemo(() => {
    const s = new Set<string>();
    for (const t of passagensQ.data ?? []) if (t.teamInclusionId && t.purchaseDate !== null && t.purchaseDate !== undefined) s.add(t.teamInclusionId);
    return s;
  }, [passagensQ.data]);
  // A mesma regra das Análises (use-scaling-recorte.ts → vagasComHotel).
  const vagasComHotel = useMemo(() => {
    const s = new Set<string>();
    for (const a of hospedagensQ.data ?? []) if (a.teamInclusionId && a.hotelName?.trim() && a.hotelStatus !== "cancelada") s.add(a.teamInclusionId);
    return s;
  }, [hospedagensQ.data]);
  const trocaPendente = useMemo(() => {
    const s = new Set<string>();
    for (const t of trocasQ.data ?? []) {
      if (t.status !== "pendente") continue;
      if (t.teamInclusionId) s.add(t.teamInclusionId);
      if (t.pairedInclusionId) s.add(t.pairedInclusionId);
    }
    return s;
  }, [trocasQ.data]);
  const pedidoPendente = useMemo(() => new Set((pedidosQ.data ?? []).map((p) => p.teamInclusionId).filter((x): x is string => !!x)), [pedidosQ.data]);

  const ctx = useMemo<AnalyticsContext>(() => ({
    temNome: (i) => !!i.collaboratorId || vagaComEmpreita(i),
    temTroca: (i) => trocaPendente.has(i.id),
    temPedido: (i) => pedidoPendente.has(i.id),
    getEventName: (id) => (id && fixEncoding(eventosPorId.get(id)?.name)) || "Evento não encontrado",
    getFunctionName: (id) => (id && funcoesPorId.get(id)?.name) || "Função não encontrada",
    getCollaboratorName: () => "",
    getEventDates: (id) => (id ? eventosPorId.get(id) : undefined),
    temPassagem: (i) => passagemComprada.has(i.id),
    temHotel: (i) => vagasComHotel.has(i.id),
  }), [trocaPendente, pedidoPendente, eventosPorId, funcoesPorId, passagemComprada, vagasComHotel]);

  const eventos = useMemo(() => {
    const futuros = fazTesteDeRecorte("futuros", hoje);
    const eventoValido = (id: string) => {
      const ev = eventosPorId.get(id);
      return !!ev && ev.status !== "excluído" && ev.status !== "excluido";
    };
    const escalacao = (vagasQ.data ?? []).filter((i) => !isSuggestionInclusion(i) && !i.deletedAt && eventoValido(i.eventId) && futuros(i));
    const sugestoes = (sugestoesQ.data ?? []).filter((i) => !i.deletedAt && i.status !== SUGESTAO_STATUS.NEGADA && eventoValido(i.eventId) && futuros(i));
    return analisarPorEvento([...escalacao, ...sugestoes], ctx, hoje).filter((e) => !e.jaTerminou);
  }, [vagasQ.data, sugestoesQ.data, eventosPorId, ctx, hoje]);

  const atrasos = useMemo(() => atrasosDosEventos(eventos, ctx, dias, hoje), [eventos, ctx, dias, hoje]);
  const atrasadas = useMemo(() => vagasAtrasadas(atrasos), [atrasos]);
  const pedidos = useMemo(() => {
    // Só pedidos de eventos que existem e não foram excluídos.
    const vivos = (pedidosQ.data ?? []).filter((p) => {
      const ev = eventosPorId.get(p.eventId);
      return !ev || (ev.status !== "excluído" && ev.status !== "excluido");
    });
    return resumirPedidos(vivos, hoje);
  }, [pedidosQ.data, eventosPorId, hoje]);
  const trocasPendentes = useMemo(() => (trocasQ.data ?? []).filter((t) => t.status === "pendente").length, [trocasQ.data]);

  const recarregar = useCallback(() => {
    void Promise.all([
      vagasQ.refetch(), sugestoesQ.refetch(), passagensQ.refetch(), hospedagensQ.refetch(), trocasQ.refetch(), pedidosQ.refetch(),
      queryClient.invalidateQueries({ queryKey: ["/api/escala/prazos"] }),
    ]);
  }, [vagasQ, sugestoesQ, passagensQ, hospedagensQ, trocasQ, pedidosQ, queryClient]);

  const atualizadoEm = useMemo(() => {
    const t = [vagasQ.dataUpdatedAt, sugestoesQ.dataUpdatedAt, passagensQ.dataUpdatedAt, hospedagensQ.dataUpdatedAt].filter((x) => x > 0);
    return t.length ? Math.min(...t) : null;
  }, [vagasQ.dataUpdatedAt, sugestoesQ.dataUpdatedAt, passagensQ.dataUpdatedAt, hospedagensQ.dataUpdatedAt]);

  const erro = (vagasQ.error as Error | null) ?? null;
  const listaDeEventos = useMemo(() => Array.from(eventosPorId.values()), [eventosPorId]);

  return {
    carregando: !!user && (vagasQ.isLoading || eventosQ.isLoading),
    erro,
    semPermissao: isApiError(erro) && erro.status === 403,
    recarregar,
    recarregando: vagasQ.isFetching || passagensQ.isFetching || hospedagensQ.isFetching || sugestoesQ.isFetching,
    atualizadoEm,
    hoje,
    eventos,
    atrasos,
    atrasadas,
    pedidos,
    pedidosDisponiveis: pedidosQ.isSuccess,
    trocasPendentes,
    eventosPorId,
    listaDeEventos,
  };
}
