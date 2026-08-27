import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fixEncoding } from "@/lib/utils";
import type { TeamInclusion, Event, Function, Collaborator, Accommodation } from "@shared/schema";
import type { AccommodationFilters, AccSortConfig, AccSortField, ApiError, NormalizedSwap, TicketLite, UserLite } from "./types";
import { fetchSwaps } from "./utils";

// Sem colaborador escalado, a inclusão só aparece nestes status.
const VALID_STATUSES_WITHOUT_COLLABORATOR = [
  "reaberto", "escalado",
  "aguardando_passagem", "aguardando_hospedagem",
  "passagem", "passagem_comprada",
  "hospedagem", "hospedagem_comprada", "hospedagem_passagem_comprada",
  "aprovado", "cancelado",
];

export interface UseAccommodationsDataParams {
  filters: AccommodationFilters;
  sortConfig: AccSortConfig | null;
  showOnlyPendingSwaps: boolean;
  isPurchasingRole: boolean;
}

export interface AccommodationCounts {
  total: number;
  purchased: number;
  pending: number;
}

/**
 * Queries, índices O(1), filtro/ordenação e KPIs da tela de Hospedagens.
 * Não tem estado próprio: recebe filtros/ordenação e devolve dados derivados.
 */
export function useAccommodationsData({ filters, sortConfig, showOnlyPendingSwaps, isPurchasingRole }: UseAccommodationsDataParams) {
  const { data: teamInclusions, isLoading: isLoadingInclusions, error: inclusionsError } = useQuery<TeamInclusion[]>({ queryKey: ["/api/team-inclusions"] });
  const { data: events, isLoading: isLoadingEvents, error: eventsError } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: functions, isLoading: isLoadingFunctions, error: functionsError } = useQuery<Function[]>({ queryKey: ["/api/functions"] });
  const { data: collaborators, isLoading: isLoadingCollaborators, error: collaboratorsError } = useQuery<Collaborator[]>({ queryKey: ["/api/collaborators"] });
  const { data: accommodations, isLoading: isLoadingAccommodations, error: accommodationsError } = useQuery<Accommodation[]>({ queryKey: ["/api/accommodations"] });
  const { data: tickets } = useQuery<TicketLite[]>({ queryKey: ["/api/tickets"] });
  const { data: users } = useQuery<UserLite[]>({ queryKey: ["/api/users"] });

  // Lista global de trocas — alimenta o banner e o selo "Troca pendente" das linhas.
  const { data: allSwapRequests } = useQuery<NormalizedSwap[]>({
    queryKey: ["/api/swap-requests"],
    queryFn: () => fetchSwaps("/api/swap-requests"),
  });

  // Esqueleto espera o conteúdo principal da tabela — inclusões, evento,
  // função, colaborador e a própria hospedagem.
  const isLoading = isLoadingInclusions || isLoadingEvents || isLoadingFunctions || isLoadingCollaborators || isLoadingAccommodations;

  // Falha de carregamento NÃO pode virar "nenhuma inclusão encontrada": uma
  // sessão expirada (401) aparecia como lista vazia. Só bloqueia a tela quando
  // ainda não há dados — um refetch falho em segundo plano não apaga a lista.
  const loadError = (teamInclusions
    ? null
    : (inclusionsError || eventsError || functionsError || collaboratorsError || accommodationsError)) as ApiError | null;

  const pendingSwapByInclusion = useMemo(() => {
    const set = new Set<string>();
    allSwapRequests?.forEach((s) => { if (s.status === "pendente" && s.teamInclusionId) set.add(s.teamInclusionId); });
    return set;
  }, [allSwapRequests]);

  // Inclusões que precisam de hospedagem. Canceladas ficam: quem decide é o
  // filtro "Status Inclusão" (senão a opção "Canceladas" seria sempre vazia).
  const teamInclusionsWithAccommodation = useMemo(() => {
    if (!teamInclusions) return [];
    return teamInclusions.filter((inclusion) => {
      if (inclusion.needsAccommodation !== true) return false;
      // Evento excluído leva junto a escalação dele (regra do dono, 26/08).
      const evento = events?.find((e) => e.id === inclusion.eventId);
      if (!evento || evento.status === "excluído" || evento.status === "excluido") return false;
      // Com colaborador escalado, aparece independente do status (workflow flexível).
      if (inclusion.collaboratorId) return true;
      return VALID_STATUSES_WITHOUT_COLLABORATOR.includes(inclusion.status);
    });
  }, [teamInclusions, events]);

  // Havendo mais de um registro para a mesma inclusão, o ÚLTIMO vence
  // (semântica original; representa a hospedagem mais recente).
  const accommodationMap = useMemo(() => {
    const map = new Map<string, Accommodation>();
    accommodations?.forEach((acc) => { if (acc.teamInclusionId) map.set(acc.teamInclusionId, acc); });
    return map;
  }, [accommodations]);

  const eventById = useMemo(() => {
    const map = new Map<string, Event>();
    events?.forEach((e) => { if (!map.has(e.id)) map.set(e.id, e); });
    return map;
  }, [events]);

  const functionById = useMemo(() => {
    const map = new Map<string, Function>();
    functions?.forEach((f) => { if (!map.has(f.id)) map.set(f.id, f); });
    return map;
  }, [functions]);

  const collaboratorById = useMemo(() => {
    const map = new Map<string, Collaborator>();
    collaborators?.forEach((c) => { if (!map.has(c.id)) map.set(c.id, c); });
    return map;
  }, [collaborators]);

  const filteredData = useMemo(() => {
    const getFieldValue = (inclusion: TeamInclusion, field: AccSortField): string | number | null => {
      const event = eventById.get(inclusion.eventId);
      const func = functionById.get(inclusion.functionId);
      const collaborator = inclusion.collaboratorId ? collaboratorById.get(inclusion.collaboratorId) : undefined;
      const accommodation = accommodationMap.get(inclusion.id);
      switch (field) {
        case "id": return inclusion.inclusionNumber || 0;
        case "event": return event?.name || "";
        case "function": return func?.name || "";
        case "collaborator": return fixEncoding(collaborator?.fullName) || "";
        case "date": return accommodation?.checkInDate || null;
        case "hotelName": return accommodation?.hotelName || "";
        default: return "";
      }
    };

    const q = filters.searchId.replace(/#/g, "").trim().toLowerCase();
    const data = teamInclusionsWithAccommodation.filter((inclusion) => {
      if (showOnlyPendingSwaps && !pendingSwapByInclusion.has(inclusion.id)) return false;
      if (filters.eventId !== "all" && inclusion.eventId !== filters.eventId) return false;
      if (filters.functionId.length > 0 && !filters.functionId.includes(inclusion.functionId)) return false;
      if (filters.collaboratorId !== "all" && inclusion.collaboratorId !== filters.collaboratorId) return false;

      if (q) {
        const colName = (inclusion.collaboratorId ? collaboratorById.get(inclusion.collaboratorId)?.fullName ?? "" : "").toLowerCase();
        if (!String(inclusion.inclusionNumber ?? "").toLowerCase().includes(q) && !colName.includes(q)) return false;
      }

      const accommodationStatus = accommodationMap.get(inclusion.id) ? "processed" : "pending";
      if (filters.accommodationStatus !== "all" && filters.accommodationStatus !== accommodationStatus) return false;

      // "Canceladas" só canceladas; "Todas" mostra tudo; "ativas" esconde as canceladas.
      if (filters.inclusionStatus === "cancelado") return inclusion.status === "cancelado";
      if (filters.inclusionStatus === "active") return inclusion.status !== "cancelado";
      return true;
    });

    if (sortConfig) {
      data.sort((a, b) => {
        const aValue = getFieldValue(a, sortConfig.field);
        const bValue = getFieldValue(b, sortConfig.field);
        // Vazios sempre por último (comparador consistente nos dois sentidos).
        const aEmpty = aValue === null || aValue === undefined || aValue === "";
        const bEmpty = bValue === null || bValue === undefined || bValue === "";
        if (aEmpty && bEmpty) return 0;
        if (aEmpty) return 1;
        if (bEmpty) return -1;
        // Texto em pt-BR: sem localeCompare, nomes acentuados iam para o fim.
        if (typeof aValue === "string" && typeof bValue === "string") {
          const cmp = aValue.localeCompare(bValue, "pt-BR");
          return sortConfig.direction === "asc" ? cmp : -cmp;
        }
        if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return data;
  }, [teamInclusionsWithAccommodation, accommodationMap, eventById, functionById, collaboratorById,
      filters, sortConfig, showOnlyPendingSwaps, pendingSwapByInclusion]);

  // Banner: trocas pendentes que exigem análise de Compras. Derivado da MESMA
  // lista renderizada, então o contador nunca diverge da tabela.
  const pendingSwapsCount = useMemo(() => {
    if (!isPurchasingRole) return 0;
    if (showOnlyPendingSwaps) return filteredData.length;
    return filteredData.filter((inc) => pendingSwapByInclusion.has(inc.id)).length;
  }, [isPurchasingRole, showOnlyPendingSwaps, filteredData, pendingSwapByInclusion]);

  // Linhas elegíveis ao lote: pendentes, não canceladas e visíveis agora.
  const selectableInclusionIds = useMemo(() => {
    const ids = new Set<string>();
    filteredData.forEach((inc) => { if (!accommodationMap.get(inc.id) && inc.status !== "cancelado") ids.add(inc.id); });
    return ids;
  }, [filteredData, accommodationMap]);

  const counts: AccommodationCounts = useMemo(() => {
    let purchased = 0, pending = 0;
    filteredData.forEach((inc) => {
      if (accommodationMap.get(inc.id)) purchased++;
      // Inclusão cancelada não é "pendente" — contá-la inflava a fila de trabalho.
      else if (inc.status !== "cancelado") pending++;
    });
    return { total: filteredData.length, purchased, pending };
  }, [filteredData, accommodationMap]);

  return {
    teamInclusions, events, functions, collaborators, accommodations, tickets, users,
    isLoading, loadError,
    accommodationMap, eventById, functionById, collaboratorById,
    pendingSwapByInclusion, filteredData, pendingSwapsCount, selectableInclusionIds, counts,
  };
}
