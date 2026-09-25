/**
 * Consultas e índices O(1) da Escalação (25/09 — extraídos de use-scaling-data.ts):
 * vagas, eventos, funções, responsáveis, colaboradores, passagens, hospedagens,
 * trocas e pedidos em aberto — e os mapas por id/por vaga que a tela consome.
 */
import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSwapRequests } from "@/hooks/use-swap-requests";
import { listaDeVagasQuery, recorteDaListaDeVagas } from "@/hooks/use-vaga-acoes";
import type { TeamInclusion, Event, Function, Collaborator, Ticket, Accommodation } from "@shared/schema";
import type { NormalizedSwap } from "./scaling-utils";
import type { PendingChangeRequest, ScalingFilters, ScalingUser } from "./scaling-data-types";

export function useScalingQueries({ filters, user }: { filters: ScalingFilters; user: ScalingUser }) {
  const {
    data: teamInclusions,
    isLoading: isLoadingInclusions,
    isFetching: isFetchingInclusions,
    isError: isErrorInclusions,
    error: inclusionsError,
  } = useQuery<TeamInclusion[]>({
    /**
     * Recorte no servidor (24/09): UM evento marcado vira `?eventId=` (chave
     * `["/api/team-inclusions", { eventId }]`, a mesma que as telas por evento
     * usam). Nenhum ou vários eventos: admin/compras/produção/RH leem a fila
     * inteira pela chave global de sempre (compartilhada com Passagens e
     * Hospedagem); a área de função, que o servidor obriga a recortar, pede
     * `?phase=all` e as sugestões são tiradas em `filteredTeamInclusions`.
     *
     * Ligar "Excluídas" entra na chave (`includeDeleted`) — e tem de ser
     * assim: encher o cache global com registros excluídos faria eles
     * aparecerem nas outras telas.
     *
     * A troca de chave custa uma busca nova, que nesta base leva dezenas de
     * segundos (o driver do Neon cobra por coluna trafegada, e a tabela passa
     * de cinquenta). Por isso o `placeholderData`: a lista anterior fica na
     * tela enquanto a nova chega. Sem ele, a tela virava esqueleto e levava
     * junto a barra de filtros — com o próprio toggle dentro dela.
     */
    ...listaDeVagasQuery(recorteDaListaDeVagas({
      eventId: filters.eventId.length === 1 ? filters.eventId[0] : undefined,
      user,
      includeDeleted: filters.showDeleted,
    })),
    placeholderData: keepPreviousData,
  });

  const { data: events, isLoading: isLoadingEvents } = useQuery<Event[]>({ queryKey: ["/api/events"], staleTime: 300_000 });
  const { data: functions, isLoading: isLoadingFunctions } = useQuery<Function[]>({ queryKey: ["/api/functions"], staleTime: 300_000 });
  // Managers de todas as funções — uma única requisição. `userName` (01/09)
  // é o que permite a linha dizer QUEM escala a vaga que você não pode mexer.
  const { data: allFunctionManagers, isLoading: isLoadingManagers } = useQuery<{ functionId: string; userId: string; userName?: string | null }[]>({
    queryKey: ["/api/function-managers/all"],
    staleTime: 300_000,
  });
  // Responsáveis do MÓDULO DE ESCALA (tabela própria; mesma chave da
  // Validação, cache compartilhado). Necessário porque o servidor aceita em
  // PATCH /api/team-inclusions/:id/approve-production quem é 'aprovador'
  // cadastrado da função da vaga (storage.isUserFunctionApprover) — e o client
  // só liberava admin e a flag canApproveCenotecnica (23/09).
  const { data: escalaManagers } = useQuery<{ functionId: string; userId: string; role: "validador" | "aprovador" }[]>({
    queryKey: ["/api/scaling-function-managers"],
    staleTime: 300_000,
    enabled: !!user,
  });

  /**
   * Quantos comentários cada vaga tem. Agregação no banco: sem ela, o ícone da
   * lista é igual em quem tem dez mensagens e em quem nunca recebeu nada, e a
   * pessoa precisa abrir cada registro para descobrir.
   */
  const { data: commentCounts } = useQuery<{ teamInclusionId: string; n: number }[]>({
    queryKey: ["/api/comments/counts"],
    staleTime: 60_000,
    // A rota é nova: numa implantação atrasada o servidor responde o HTML do
    // SPA, e a tela fica sem o contador em vez de quebrar inteira.
    queryFn: async () => {
      const r = await fetch("/api/comments/counts", { credentials: "include" });
      if (!r.ok || !r.headers.get("content-type")?.includes("application/json")) return [];
      return r.json();
    },
  });
  const commentCountByInclusion = useMemo(() => {
    const m = new Map<string, number>();
    (commentCounts || []).forEach((c) => { if (c.teamInclusionId) m.set(c.teamInclusionId, Number(c.n) || 0); });
    return m;
  }, [commentCounts]);
  const { data: collaborators, isLoading: isLoadingCollaborators } = useQuery<Collaborator[]>({ queryKey: ["/api/collaborators"], staleTime: 300_000 });
  const { data: accommodations } = useQuery<Accommodation[]>({ queryKey: ["/api/accommodations"] });
  const { data: tickets } = useQuery<Ticket[]>({ queryKey: ["/api/tickets"] });
  // Swap requests globais — badges nas linhas da tabela. Hook único (23/09):
  // já vem normalizado e é o mesmo cache da casca e das outras telas.
  const { data: allSwapRequestsData } = useSwapRequests();

  // ── Índices O(1) — preservam a semântica de Array.find: o PRIMEIRO vence ──
  const eventById = useMemo(() => {
    const m = new Map<string, Event>();
    (events || []).forEach(e => { if (!m.has(e.id)) m.set(e.id, e); });
    return m;
  }, [events]);

  const functionById = useMemo(() => {
    const m = new Map<string, Function>();
    (functions || []).forEach(f => { if (!m.has(f.id)) m.set(f.id, f); });
    return m;
  }, [functions]);

  const collaboratorById = useMemo(() => {
    const m = new Map<string, Collaborator>();
    (collaborators || []).forEach(c => { if (!m.has(c.id)) m.set(c.id, c); });
    return m;
  }, [collaborators]);

  const ticketByInclusion = useMemo(() => {
    const m = new Map<string, Ticket>();
    (tickets || []).forEach(t => {
      if (t.teamInclusionId && !m.has(t.teamInclusionId)) m.set(t.teamInclusionId, t);
    });
    return m;
  }, [tickets]);

  // Passagem efetivamente comprada (purchaseDate) — a primeira comprada vence
  /**
   * Pedido de ajuste/exclusão EM ABERTO por vaga (regra do dono, 26/08).
   * Uma consulta para a tela inteira: a lista marca a linha e o modal trava
   * todas as ações enquanto o aprovador não decide.
   */
  const { data: pendingChanges } = useQuery<PendingChangeRequest[]>({
    queryKey: ["/api/scaling-change-requests/pending-by-inclusion"],
    staleTime: 30_000,
    queryFn: async () => {
      // Rota enxuta, feita para esta tela. Se o servidor ainda não a tiver
      // (implantação atrasada), ela responde o HTML do SPA — daí a checagem do
      // content-type — e caímos na fila completa de pedidos, que existe desde
      // sempre. Quem não tem permissão nela simplesmente fica sem o selo, em
      // vez de a tela inteira quebrar.
      const enxuta = await fetch("/api/scaling-change-requests/pending-by-inclusion", { credentials: "include" });
      if (enxuta.ok && enxuta.headers.get("content-type")?.includes("application/json")) {
        return (await enxuta.json()) as PendingChangeRequest[];
      }
      const completa = await fetch("/api/scaling-change-requests?status=pendente", { credentials: "include" });
      if (!completa.ok || !completa.headers.get("content-type")?.includes("application/json")) return [];
      const rows = (await completa.json()) as {
        teamInclusionId: string | null; requestType: string; reason: string | null;
        requestedByName: string | null; createdAt: string | null;
      }[];
      return rows
        .filter((r): r is PendingChangeRequest => !!r.teamInclusionId)
        .map((r) => ({
          teamInclusionId: r.teamInclusionId,
          requestType: r.requestType,
          reason: r.reason,
          requestedByName: r.requestedByName,
          createdAt: r.createdAt,
        }));
    },
  });
  const pendingChangeByInclusion = useMemo(() => {
    const m = new Map<string, PendingChangeRequest>();
    (pendingChanges || []).forEach((p) => {
      if (p.teamInclusionId && !m.has(p.teamInclusionId)) m.set(p.teamInclusionId, p);
    });
    return m;
  }, [pendingChanges]);

  const purchasedTicketByInclusion = useMemo(() => {
    const m = new Map<string, Ticket>();
    (tickets || []).forEach(t => {
      if (t.teamInclusionId && t.purchaseDate !== null && t.purchaseDate !== undefined && !m.has(t.teamInclusionId)) {
        m.set(t.teamInclusionId, t);
      }
    });
    return m;
  }, [tickets]);

  const accommodationByInclusion = useMemo(() => {
    const m = new Map<string, Accommodation>();
    (accommodations || []).forEach(a => {
      if (a.teamInclusionId && !m.has(a.teamInclusionId)) m.set(a.teamInclusionId, a);
    });
    return m;
  }, [accommodations]);

  const allSwapRequests = useMemo<NormalizedSwap[]>(() => allSwapRequestsData ?? [], [allSwapRequestsData]);

  const pendingSwapByInclusion = useMemo(() => {
    const map = new Map<string, NormalizedSwap>();
    allSwapRequests.filter(s => s.status === "pendente").forEach(s => {
      if (s.teamInclusionId) map.set(s.teamInclusionId, s);
      // Permuta (14/09): a vaga pareada também fica marcada.
      if (s.pairedInclusionId) map.set(s.pairedInclusionId, s);
    });
    return map;
  }, [allSwapRequests]);

  const approvedSwapInclusionIds = useMemo(() => {
    const ids = new Set<string>();
    allSwapRequests.filter(s => s.status === "aprovado").forEach(s => {
      if (s.teamInclusionId) ids.add(s.teamInclusionId);
      if (s.pairedInclusionId) ids.add(s.pairedInclusionId);
    });
    return ids;
  }, [allSwapRequests]);

  // Primeira troca (qualquer status) da inclusão — usada por markInclusionSwapSeen
  const firstSwapByInclusion = useMemo(() => {
    const m = new Map<string, NormalizedSwap>();
    allSwapRequests.forEach(s => { if (s.teamInclusionId && !m.has(s.teamInclusionId)) m.set(s.teamInclusionId, s); });
    return m;
  }, [allSwapRequests]);

  // O esqueleto espera TODAS as consultas que alimentam a tabela principal.
  const isLoading = isLoadingInclusions || isLoadingEvents || isLoadingFunctions || isLoadingManagers || isLoadingCollaborators;

  return {
    teamInclusions, isLoading, isFetchingInclusions, isErrorInclusions, inclusionsError,
    events, functions, collaborators, tickets, accommodations, allFunctionManagers, escalaManagers,
    commentCountByInclusion, eventById, functionById, collaboratorById, ticketByInclusion,
    pendingChangeByInclusion, purchasedTicketByInclusion, accommodationByInclusion,
    pendingSwapByInclusion, approvedSwapInclusionIds, firstSwapByInclusion,
  };
}

export type ScalingQueries = ReturnType<typeof useScalingQueries>;
