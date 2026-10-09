/**
 * Dados da tabela de inclusões (25/09 — extraído da tabela): consultas, índices
 * O(1), filtros/ordenação, totais dos cartões, seleção e trava de evento encerrado.
 */
import { useCallback, useMemo, useState } from "react";
import { useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { TeamInclusion, Event, Function, Collaborator } from "@shared/schema";
import { vagaComEmpreita } from "@shared/cenotecnica-empreita";
import { fixEncoding } from "@/lib/utils";
import { normalizarBusca } from "@/components/scaling/scaling-queue";
import { apiRequest } from "@/lib/queryClient";
import { useSwapRequests } from "@/hooks/use-swap-requests";
import { trocasPendentesPorVaga } from "@/lib/swap-types";
import { useEventLock } from "@/lib/event-lock";
import type { UniversalFilterValues } from "@/components/common/universal-filters";
import type { SortConfig, SortField } from "@/components/common/sortable-header";
import { getDisplayStatus } from "./inclusion-shared";

export type InclusionFilters = UniversalFilterValues & { status: string[] };

/** As dimensões do recorte que a barra de filtros e o resumo controlam. */
export type DimensaoDoRecorte = "eventId" | "functionId" | "collaboratorId" | "status" | "escalationStatus" | "searchId";

/**
 * Status da vaga para o RECORTE (filtro, contadores do filtro e resumo): o
 * MESMO que a lista mostra na pílula (`getDisplayStatus`). Uma vaga
 * "escalado" que precisa de passagem aparece na lista como "Aguardando
 * passagem", mas o resumo e o filtro só contavam `status === "passagem"` —
 * os números de "Passagem" no resumo e na lista divergiam (08/10).
 */
export const statusDoRecorte = (inclusion: TeamInclusion): string => {
  const exibido = getDisplayStatus(inclusion);
  if (exibido === "aguardando_passagem") return "passagem";
  if (exibido === "aguardando_hospedagem") return "hospedagem";
  return exibido;
};

/** "Escalação" de uma vaga, com a MESMA regra do filtro (pendente / escalada / cancelada). */
export const casaComEscalacao = (inclusion: TeamInclusion, v: string) => {
  const isCanceled = inclusion.status === "cancelado";
  return v === "pending" ? (!inclusion.collaboratorId && !vagaComEmpreita(inclusion) && !isCanceled)
    : v === "escalated" ? ((!!inclusion.collaboratorId || vagaComEmpreita(inclusion)) && !isCanceled)
    : v === "cancelado" ? isCanceled
    // "Aguardando gestor" (cenotécnica esperando a aprovação da produção): a
    // opção existia no filtro mas caía no "false" e nunca casava (07/10).
    : v === "aguardando_producao" ? inclusion.status === "aguardando_producao"
    : false;
};

/**
 * A regra do recorte, num lugar só (07/10): a lista, os totais do resumo e os
 * números ao lado de cada opção dos filtros passam por aqui — um contador com
 * cópia própria da regra mentiria na primeira mudança. `ignorar` deixa de fora
 * as dimensões que a conta não deve considerar (a própria opção, no contador;
 * status e escalação, nos totais). O texto é o mesmo de antes, linha por linha.
 */
export function passaNoRecorte(
  inclusion: TeamInclusion, filters: InclusionFilters, ignorar: DimensaoDoRecorte[] = [],
  /** Nome do colaborador da vaga, para a busca "ID ou nome" achar pelo nome (07/10). */
  nomeDoColaborador?: (collaboratorId?: string) => string,
) {
  const usa = (d: DimensaoDoRecorte) => !ignorar.includes(d);
  // Valores marcados no mesmo filtro somam (OU); entre filtros continua E.
  if (usa("eventId") && filters.eventId.length > 0 && !filters.eventId.includes(inclusion.eventId)) return false;
  if (usa("functionId") && filters.functionId.length > 0 && !filters.functionId.includes(inclusion.functionId)) return false;
  if (usa("collaboratorId") && filters.collaboratorId.length > 0 && (!inclusion.collaboratorId || !filters.collaboratorId.includes(inclusion.collaboratorId))) return false;
  if (usa("status") && filters.status.length > 0 && !filters.status.includes(statusDoRecorte(inclusion))) return false;
  if (usa("escalationStatus") && filters.escalationStatus.length > 0) {
    if (!filters.escalationStatus.some((v) => casaComEscalacao(inclusion, v))) return false;
  }
  // Busca "ID ou nome": número da inclusão OU nome do colaborador. Até 07/10
  // só o número era olhado — o nome digitado nunca achava nada.
  if (usa("searchId") && filters.searchId) {
    const q = filters.searchId.replace(/#/g, '').trim().toLowerCase();
    const n = String(inclusion.inclusionNumber ?? '').toLowerCase();
    const nome = inclusion.collaboratorId && nomeDoColaborador
      ? normalizarBusca(nomeDoColaborador(inclusion.collaboratorId))
      : "";
    if (!n.includes(q) && !(nome && nome.includes(normalizarBusca(q)))) return false;
  }
  return true;
}

/** Opções fixas de Status e Escalação — os mesmos valores e rótulos da barra antiga. */
export const OPCOES_DE_STATUS = [
  { id: "planejado", nome: "Aguardando escalação" },
  { id: "escalacao", nome: "Em escalação" },
  { id: "passagem", nome: "Aguardando passagem" },
  { id: "hospedagem", nome: "Aguardando hospedagem" },
  { id: "passagem_comprada", nome: "Passagem comprada" },
  { id: "hospedagem_comprada", nome: "Hospedagem comprada" },
  { id: "hospedagem_passagem_comprada", nome: "Hospedagem e passagem compradas" },
];
export const OPCOES_DE_ESCALACAO = [
  { id: "pending", nome: "Pendentes de escalação" },
  { id: "escalated", nome: "Já escalados" },
  { id: "aguardando_producao", nome: "Aguardando gestor" },
  { id: "cancelado", nome: "Cancelados" },
];

/**
 * Junta as consultas por evento numa lista só, com as mesmas flags de uma
 * consulta. Fica fora do hook (referência estável): o `combine` do
 * `useQueries` só roda de novo quando alguma consulta muda.
 * `data` só existe quando TODAS chegaram (nada de lista parcial no resumo).
 */
export function juntarListasDeVagas(rs: UseQueryResult<TeamInclusion[]>[]) {
  const prontas = rs.length > 0 && rs.every(r => r.data !== undefined);
  return {
    data: prontas ? (rs.length === 1 ? rs[0].data : rs.flatMap(r => r.data ?? [])) : undefined,
    isLoading: rs.some(r => r.isLoading),
    isError: rs.some(r => r.isError),
    error: rs.find(r => r.error)?.error ?? null,
    isFetching: rs.some(r => r.isFetching),
    refetch: () => Promise.all(rs.map(r => r.refetch())),
  };
}

export function useTeamInclusionData({ enabled = true }: { enabled?: boolean } = {}) {
  // Seleção múltipla (28/08): listas; vazia = todos. Também conserta o filtro
  // de Funções, que comparava string com a lista do multi-select e zerava a tela.
  const [filters, setFilters] = useState<InclusionFilters>({
    eventId: [] as string[],
    functionId: [] as string[],
    collaboratorId: [] as string[],
    status: [] as string[],
    escalationStatus: [] as string[],
    searchId: "",
  });
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  // Hook único das trocas (23/09): mesmo cache normalizado da casca e das outras telas.
  const { data: allSwapRequests } = useSwapRequests();
  const approvedSwapInclusionIds = useMemo(() => {
    const ids = new Set<string>();
    allSwapRequests?.filter(s => s.status === 'aprovado').forEach(s => {
      if (s.teamInclusionId) ids.add(s.teamInclusionId);
    });
    return ids;
  }, [allSwapRequests]);
  /** Pedido de troca pendente por vaga (as duas da permuta/transferência) — avisos de excluir/cancelar (09/10). */
  const trocaPendentePorVaga = useMemo(() => trocasPendentesPorVaga(allSwapRequests), [allSwapRequests]);

  // Handle column sorting
  const handleSort = (field: SortField) => {
    setSortConfig(current => {
      if (current?.field === field) {
        return current.direction === 'asc'
          ? { field, direction: 'desc' }
          : null; // Remove sorting on third click
      } else {
        return { field, direction: 'asc' };
      }
    });
  };

  // Com evento(s) marcado(s) no filtro, busca só as vagas DELES (`?eventId=`,
  // contrato 23/09) — uma consulta por evento, com o id na chave para o cache
  // ser por evento e as invalidações por prefixo (`["/api/team-inclusions"]`)
  // continuarem valendo. Até 08/10, com DOIS ou mais eventos marcados a tela
  // baixava as vagas de TODOS os eventos e filtrava no navegador. Sem evento
  // marcado, a lista é a de todos (papéis que o servidor deixa ler tudo).
  const eventosFiltrados = filters.eventId;
  // "Mostrar excluídos" (07/10): o interruptor existia mas a consulta nunca
  // pedia as excluídas — o servidor aceita `includeDeleted=true`.
  const comExcluidas = !!filters.showDeleted;
  const { data: teamInclusions, isLoading, isError, error, refetch, isFetching } = useQueries({
    queries: (eventosFiltrados.length > 0 ? eventosFiltrados : [null]).map((eventoId) => {
      const parametros = [eventoId ? `eventId=${eventoId}` : "", comExcluidas ? "includeDeleted=true" : ""].filter(Boolean).join("&");
      return {
        queryKey: ["/api/team-inclusions", ...(eventoId ? [eventoId] : []), ...(comExcluidas ? ["com-excluidas"] : [])],
        queryFn: (): Promise<TeamInclusion[]> => apiRequest("GET", `/api/team-inclusions${parametros ? `?${parametros}` : ""}`).then(r => r.json()),
        // Sem acesso à tela, nem pede (07/10: os dados subiram para a página, que monta antes da checagem).
        enabled,
      };
    }),
    combine: juntarListasDeVagas,
  });
  const { data: events } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: functions } = useQuery<Function[]>({ queryKey: ["/api/functions"] });
  const { data: collaborators } = useQuery<Collaborator[]>({ queryKey: ["/api/collaborators"] });

  // Índices O(1) — antes cada célula e cada comparação de ordenação varria a
  // lista inteira. O primeiro registro vence, exatamente como o Array.find.
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
  const inclusionById = useMemo(() => {
    const m = new Map<string, TeamInclusion>();
    (teamInclusions || []).forEach(i => { if (!m.has(i.id)) m.set(i.id, i); });
    return m;
  }, [teamInclusions]);

  // Getters memoizados pelo mapa que leem: entram como dependência dos memos
  // sem recriá-los a cada render.
  const getEventName = useCallback((eventId: string) => eventById.get(eventId)?.name || "Evento não encontrado", [eventById]);
  const getEventLocation = useCallback((eventId: string) => eventById.get(eventId)?.location || "", [eventById]);
  const getFunctionName = useCallback((functionId: string) => functionById.get(functionId)?.name || "Função não encontrada", [functionById]);
  const getCollaboratorName = useCallback((collaboratorId?: string) => {
    if (!collaboratorId) return "Não escalado";
    return fixEncoding(collaboratorById.get(collaboratorId)?.fullName) || "Colaborador não encontrado";
  }, [collaboratorById]);

  // Evento encerrado (regra do usuário, 19/08): a partir do dia seguinte ao
  // término, só o administrador mexe. Espelha o 403 do servidor —
  // editar/excluir/cancelar somem e a linha não entra nas ações em lote.
  const eventLock = useEventLock();
  const isEventLocked = (inclusion: TeamInclusion) => eventLock.isLockedInclusion(inclusion);
  // Motivo exato do bloqueio (encerrado x evento fora da lista) para tooltips.
  const eventLockReason = (inclusion: TeamInclusion) => eventLock.lockReason(inclusion.eventId);

  // Filter and sort inclusions based on current filters
  const filteredAndSortedInclusions = useMemo(() => {
    const filtered = teamInclusions?.filter(inclusion => passaNoRecorte(inclusion, filters, [], getCollaboratorName)) || [];

    // Apply custom sorting if configured
    if (sortConfig) {
      const { field, direction } = sortConfig;
      const multiplier = direction === 'asc' ? 1 : -1;

      return filtered.sort((a, b) => {
        switch (field) {
          case 'id':
            return ((a.inclusionNumber || 0) - (b.inclusionNumber || 0)) * multiplier;
          case 'event':
            return getEventName(a.eventId).localeCompare(getEventName(b.eventId), 'pt-BR') * multiplier;
          case 'function':
            return getFunctionName(a.functionId).localeCompare(getFunctionName(b.functionId), 'pt-BR') * multiplier;
          case 'collaborator':
            return getCollaboratorName(a.collaboratorId || undefined).localeCompare(getCollaboratorName(b.collaboratorId || undefined), 'pt-BR') * multiplier;
          case 'status':
            return a.status.localeCompare(b.status, 'pt-BR') * multiplier;
          case 'date':
            if (!a.scheduleStartDate && !b.scheduleStartDate) return 0;
            if (!a.scheduleStartDate) return 1 * multiplier;
            if (!b.scheduleStartDate) return -1 * multiplier;
            return (new Date(a.scheduleStartDate).getTime() - new Date(b.scheduleStartDate).getTime()) * multiplier;
          default:
            return 0;
        }
      });
    }

    // Default sorting: Event → Function → Date
    return filtered.sort((a, b) => {
      const eventComparison = getEventName(a.eventId).localeCompare(getEventName(b.eventId), 'pt-BR');
      if (eventComparison !== 0) return eventComparison;

      const functionComparison = getFunctionName(a.functionId).localeCompare(getFunctionName(b.functionId), 'pt-BR');
      if (functionComparison !== 0) return functionComparison;

      if (!a.scheduleStartDate && !b.scheduleStartDate) return 0;
      if (!a.scheduleStartDate) return 1;
      if (!b.scheduleStartDate) return -1;
      return new Date(a.scheduleStartDate).getTime() - new Date(b.scheduleStartDate).getTime();
    });
  }, [teamInclusions, filters, sortConfig, getCollaboratorName, getEventName, getFunctionName]);

  // Em quantos eventos estão as vagas do recorte (para a barra da tela).
  const eventosNoRecorte = useMemo(
    () => new Set(filteredAndSortedInclusions.map(i => i.eventId)).size,
    [filteredAndSortedInclusions],
  );

  // Totals base: only base filters (event, function, collaborator, searchId)
  // Ignores status AND escalationStatus so card counts never change when a card is clicked
  const totalsBase = useMemo(() => {
    return teamInclusions?.filter(inclusion => passaNoRecorte(inclusion, filters, ["status", "escalationStatus"], getCollaboratorName)) || [];
  }, [teamInclusions, filters, getCollaboratorName]);

  // Opções dos filtros com o número ao lado (07/10): quantas vagas sobram ao
  // escolher cada uma, mantendo o resto do recorte — a mesma regra da lista.
  const opcoesDosFiltros = useMemo(() => {
    const lista = teamInclusions ?? [];
    const contar = (dim: DimensaoDoRecorte, chave: (i: TeamInclusion) => string | null | undefined) => {
      const m = new Map<string, number>();
      for (const i of lista) {
        if (!passaNoRecorte(i, filters, [dim], getCollaboratorName)) continue;
        const k = chave(i);
        if (k) m.set(k, (m.get(k) ?? 0) + 1);
      }
      return m;
    };
    const porEvento = contar("eventId", i => i.eventId);
    const porFuncao = contar("functionId", i => i.functionId);
    const porColaborador = contar("collaboratorId", i => i.collaboratorId);
    const porStatus = contar("status", statusDoRecorte);
    const baseEscalacao = lista.filter(i => passaNoRecorte(i, filters, ["escalationStatus"], getCollaboratorName));
    return {
      eventos: (events ?? [])
        .filter(e => e.status !== 'excluido' && e.status !== 'excluído')
        .map(e => ({ id: e.id, nome: e.name, n: porEvento.get(e.id) ?? 0 })),
      funcoes: (functions ?? []).map(f => ({ id: f.id, nome: f.name, n: porFuncao.get(f.id) ?? 0 })),
      colaboradores: (collaborators ?? []).map(c => ({ id: c.id, nome: fixEncoding(c.fullName) || "Sem nome", n: porColaborador.get(c.id) ?? 0 })),
      status: OPCOES_DE_STATUS.map(o => ({ ...o, n: porStatus.get(o.id) ?? 0 })),
      escalacao: OPCOES_DE_ESCALACAO.map(o => ({ ...o, n: baseEscalacao.filter(i => casaComEscalacao(i, o.id)).length })),
    };
  }, [teamInclusions, filters, events, functions, collaborators, getCollaboratorName]);

  // Calculate real totals from totalsBase (ignores status filter so cards always show correct counts)
  // Cada contador usa EXATAMENTE o mesmo predicado que o clique no card aplica na
  // lista — antes o card "Passagem" também exigia needsTicket e mostrava um número
  // menor do que a quantidade de linhas exibidas ao clicar nele.
  const totals = {
    incluidos: totalsBase.length,
    pendentes: totalsBase.filter(i => !i.collaboratorId && !vagaComEmpreita(i) && i.status !== 'cancelado').length,
    escalados: totalsBase.filter(i => (i.collaboratorId || vagaComEmpreita(i)) && i.status !== 'cancelado').length,
    aguardando_passagem: totalsBase.filter(i => statusDoRecorte(i) === 'passagem').length,
    hospedagem: totalsBase.filter(i => statusDoRecorte(i) === 'hospedagem').length,
    passagem_comprada: totalsBase.filter(i => i.status === 'passagem_comprada').length,
    hospedagem_comprada: totalsBase.filter(i => i.status === 'hospedagem_comprada').length,
    cancelados: totalsBase.filter(i => i.status === 'cancelado').length,
  };

  // ── Seleção ──
  const toggleRowSelection = (inclusionId: string) => {
    setSelectedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(inclusionId)) newSet.delete(inclusionId);
      else newSet.add(inclusionId);
      return newSet;
    });
  };
  const toggleSelectAll = () => {
    // Opera SOMENTE sobre as linhas visíveis: comparar/limpar a seleção inteira
    // descartava silenciosamente itens marcados sob outro filtro — justamente os
    // que a barra anuncia como "fora dos filtros atuais".
    // Linhas de evento encerrado nunca entram na seleção (o servidor recusaria)
    const visibleIds = filteredAndSortedInclusions.filter(i => !isEventLocked(i)).map(i => i.id);
    const todosVisiveisMarcados = visibleIds.length > 0 && visibleIds.every(id => selectedRows.has(id));
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (todosVisiveisMarcados) visibleIds.forEach(id => next.delete(id));
      else visibleIds.forEach(id => next.add(id));
      return next;
    });
  };
  // Quantas das linhas VISÍVEIS estão marcadas. Comparar só os tamanhos deixava o
  // "selecionar tudo" marcado quando a seleção antiga tinha o mesmo total de outra visão.
  const selectedVisibleCount = filteredAndSortedInclusions.reduce(
    (acc, i) => acc + (selectedRows.has(i.id) ? 1 : 0),
    0,
  );
  // Linhas de evento encerrado não são selecionáveis — não podem impedir que o
  // "selecionar tudo" apareça marcado.
  const selectableVisibleCount = filteredAndSortedInclusions.filter(i => !isEventLocked(i)).length;
  const allVisibleSelected = selectableVisibleCount > 0 && selectedVisibleCount === selectableVisibleCount;

  return {
    filters, setFilters, sortConfig, handleSort, selectedRows, setSelectedRows,
    approvedSwapInclusionIds, trocaPendentePorVaga,
    teamInclusions, isLoading, isError, error, functions,
    inclusionById, getEventName, getEventLocation, getFunctionName, getCollaboratorName,
    eventLock, isEventLocked, eventLockReason,
    filteredAndSortedInclusions, totals, opcoesDosFiltros, eventosNoRecorte, refetch, isFetching,
    toggleRowSelection, toggleSelectAll, selectedVisibleCount, allVisibleSelected,
  };
}

export type TeamInclusionData = ReturnType<typeof useTeamInclusionData>;
