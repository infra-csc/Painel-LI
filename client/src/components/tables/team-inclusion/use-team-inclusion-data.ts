/**
 * Dados da tabela de inclusões (25/09 — extraído da tabela): consultas, índices
 * O(1), filtros/ordenação, totais dos cartões, seleção e trava de evento encerrado.
 */
import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { TeamInclusion, Event, Function, Collaborator } from "@shared/schema";
import { vagaComEmpreita } from "@shared/cenotecnica-empreita";
import { fixEncoding } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useSwapRequests } from "@/hooks/use-swap-requests";
import { useEventLock } from "@/lib/event-lock";
import type { UniversalFilterValues } from "@/components/common/universal-filters";
import type { SortConfig, SortField } from "@/components/common/sortable-header";

export type InclusionFilters = UniversalFilterValues & { status: string[] };

export function useTeamInclusionData() {
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

  // Com UM evento marcado no filtro, busca só as vagas dele (`?eventId=`,
  // contrato 23/09) — a chave leva o id para o cache ser por evento e as
  // invalidações por prefixo (`["/api/team-inclusions"]`) continuarem valendo.
  const eventoFiltrado = filters.eventId.length === 1 ? filters.eventId[0] : null;
  const { data: teamInclusions, isLoading, isError, error } = useQuery<TeamInclusion[]>({
    queryKey: eventoFiltrado ? ["/api/team-inclusions", eventoFiltrado] : ["/api/team-inclusions"],
    queryFn: () => apiRequest("GET", eventoFiltrado ? `/api/team-inclusions?eventId=${eventoFiltrado}` : "/api/team-inclusions").then(r => r.json()),
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
    const filtered = teamInclusions?.filter(inclusion => {
      // Valores marcados no mesmo filtro somam (OU); entre filtros continua E.
      if (filters.eventId.length > 0 && !filters.eventId.includes(inclusion.eventId)) return false;
      if (filters.functionId.length > 0 && !filters.functionId.includes(inclusion.functionId)) return false;
      if (filters.collaboratorId.length > 0 && (!inclusion.collaboratorId || !filters.collaboratorId.includes(inclusion.collaboratorId))) return false;
      if (filters.status.length > 0 && !filters.status.includes(inclusion.status)) return false;
      if (filters.escalationStatus.length > 0) {
        const isCanceled = inclusion.status === "cancelado";
        const matches = filters.escalationStatus.some((v) =>
          v === "pending" ? (!inclusion.collaboratorId && !vagaComEmpreita(inclusion) && !isCanceled)
          : v === "escalated" ? ((!!inclusion.collaboratorId || vagaComEmpreita(inclusion)) && !isCanceled)
          : v === "cancelado" ? isCanceled
          : false,
        );
        if (!matches) return false;
      }
      // Busca exata por ID (número de inclusão)
      if (filters.searchId) {
        const q = filters.searchId.replace(/#/g, '').trim().toLowerCase();
        const n = String(inclusion.inclusionNumber ?? '').toLowerCase();
        if (!n.includes(q)) return false;
      }
      return true;
    }) || [];

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

  // Totals base: only base filters (event, function, collaborator, searchId)
  // Ignores status AND escalationStatus so card counts never change when a card is clicked
  const totalsBase = useMemo(() => {
    return teamInclusions?.filter(inclusion => {
      if (filters.eventId.length > 0 && !filters.eventId.includes(inclusion.eventId)) return false;
      if (filters.functionId.length > 0 && !filters.functionId.includes(inclusion.functionId)) return false;
      if (filters.collaboratorId.length > 0 && (!inclusion.collaboratorId || !filters.collaboratorId.includes(inclusion.collaboratorId))) return false;
      if (filters.searchId) {
        const q = filters.searchId.replace(/#/g, '').trim().toLowerCase();
        const n = String(inclusion.inclusionNumber ?? '').toLowerCase();
        if (!n.includes(q)) return false;
      }
      return true;
    }) || [];
  }, [teamInclusions, filters.eventId, filters.functionId, filters.collaboratorId, filters.searchId]);

  // Calculate real totals from totalsBase (ignores status filter so cards always show correct counts)
  // Cada contador usa EXATAMENTE o mesmo predicado que o clique no card aplica na
  // lista — antes o card "Passagem" também exigia needsTicket e mostrava um número
  // menor do que a quantidade de linhas exibidas ao clicar nele.
  const totals = {
    incluidos: totalsBase.length,
    pendentes: totalsBase.filter(i => !i.collaboratorId && !vagaComEmpreita(i) && i.status !== 'cancelado').length,
    escalados: totalsBase.filter(i => (i.collaboratorId || vagaComEmpreita(i)) && i.status !== 'cancelado').length,
    aguardando_passagem: totalsBase.filter(i => i.status === 'passagem').length,
    hospedagem: totalsBase.filter(i => i.status === 'hospedagem').length,
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
    approvedSwapInclusionIds,
    teamInclusions, isLoading, isError, error, functions,
    inclusionById, getEventName, getEventLocation, getFunctionName, getCollaboratorName,
    eventLock, isEventLocked, eventLockReason,
    filteredAndSortedInclusions, totals,
    toggleRowSelection, toggleSelectAll, selectedVisibleCount, allVisibleSelected,
  };
}

export type TeamInclusionData = ReturnType<typeof useTeamInclusionData>;
