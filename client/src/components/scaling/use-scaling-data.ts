/**
 * Consultas, índices memoizados, filtros/ordenação e permissões da Escalação.
 * Extraído de pages/scaling.tsx — regra de negócio preservada.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SortConfig } from "@/components/common/sortable-header";
import { apiRequest } from "@/lib/queryClient";
import { fixEncoding } from "@/lib/utils";
import { hasRoleIn } from "@shared/roles";
import { isAtendimentoFunction } from "@shared/atendimento";
import { isPercursoFunction } from "@shared/calculation-rules";
import { isCenotecnicaFunctionName } from "@shared/scaling-rules";
import type {
  TeamInclusion, Event, Function, Collaborator, Comment, Ticket, Accommodation,
  TeamInclusionLog, SwapRequest, User,
} from "@shared/schema";
import {
  ACTIVE_CONFLICT_STATUSES, ALREADY_HANDLED_SWAP_STATUSES, isEscalated,
  normalizeSwap, type NormalizedSwap,
} from "./scaling-utils";

export interface ScalingFilters {
  eventId: string;
  functionId: string[];
  collaboratorId: string;
  escalationStatus: string;
  ticketStatus: string;
  accommodationStatus: string;
  searchId: string;
  showDeleted: boolean;
}

export const DEFAULT_SCALING_FILTERS: ScalingFilters = {
  eventId: "all",
  functionId: [],
  collaboratorId: "all",
  escalationStatus: "all",
  ticketStatus: "all",
  accommodationStatus: "all",
  searchId: "",
  showDeleted: false,
};

/** User do auth (o schema já expõe canApproveCenotecnica — sem `as any`). */
export type ScalingUser = User | null | undefined;

const ADMIN_ROLES = ["administrador", "admin", "administrator"];

export function useScalingData(opts: {
  filters: ScalingFilters;
  sortConfig: SortConfig | null;
  user: ScalingUser;
}) {
  const { filters, sortConfig, user } = opts;

  const {
    data: teamInclusions,
    isLoading: isLoadingInclusions,
    isError: isErrorInclusions,
    error: inclusionsError,
  } = useQuery<TeamInclusion[]>({
    queryKey: ["/api/team-inclusions", filters.showDeleted],
    queryFn: async () => {
      const suffix = filters.showDeleted ? "?includeDeleted=true" : "";
      const response = await apiRequest("GET", `/api/team-inclusions${suffix}`);
      return response.json();
    },
  });

  const { data: events, isLoading: isLoadingEvents } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: functions, isLoading: isLoadingFunctions } = useQuery<Function[]>({ queryKey: ["/api/functions"] });
  // Managers de todas as funções — uma única requisição
  const { data: allFunctionManagers, isLoading: isLoadingManagers } = useQuery<{ functionId: string; userId: string }[]>({
    queryKey: ["/api/function-managers/all"],
  });
  const { data: collaborators, isLoading: isLoadingCollaborators } = useQuery<Collaborator[]>({ queryKey: ["/api/collaborators"] });
  const { data: accommodations } = useQuery<Accommodation[]>({ queryKey: ["/api/accommodations"] });
  const { data: tickets } = useQuery<Ticket[]>({ queryKey: ["/api/tickets"] });
  // Swap requests globais — badges nas linhas da tabela
  const { data: allSwapRequestsRaw } = useQuery<SwapRequest[]>({
    queryKey: ["/api/swap-requests"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/swap-requests");
      return r.json();
    },
  });

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

  // Trocas normalizadas UMA vez (snake_case → camelCase)
  const allSwapRequests = useMemo<NormalizedSwap[]>(
    () => (allSwapRequestsRaw || []).map(normalizeSwap),
    [allSwapRequestsRaw],
  );

  const pendingSwapByInclusion = useMemo(() => {
    const map = new Map<string, NormalizedSwap>();
    allSwapRequests.filter(s => s.status === "pendente").forEach(s => {
      if (s.teamInclusionId) map.set(s.teamInclusionId, s);
    });
    return map;
  }, [allSwapRequests]);

  const approvedSwapInclusionIds = useMemo(() => {
    const ids = new Set<string>();
    allSwapRequests.filter(s => s.status === "aprovado").forEach(s => {
      if (s.teamInclusionId) ids.add(s.teamInclusionId);
    });
    return ids;
  }, [allSwapRequests]);

  // Primeira troca (qualquer status) da inclusão — usada por markInclusionSwapSeen
  const firstSwapByInclusion = useMemo(() => {
    const m = new Map<string, NormalizedSwap>();
    allSwapRequests.forEach(s => { if (s.teamInclusionId && !m.has(s.teamInclusionId)) m.set(s.teamInclusionId, s); });
    return m;
  }, [allSwapRequests]);

  // ── Permissões ──────────────────────────────────────────────────────────
  const userFunctionIds = useMemo(
    () => new Set((allFunctionManagers || []).filter(m => m.userId === user?.id).map(m => m.functionId)),
    [allFunctionManagers, user?.id],
  );

  const isAdminRole = !!user?.role && ADMIN_ROLES.includes(user.role);
  const isAdminOrPurchasing = hasRoleIn(user?.role, ["admin", "purchasing"]);
  const canApproveProduction = !!user?.canApproveCenotecnica || hasRoleIn(user?.role, ["admin"]);
  // Exportação XLSX carrega CPF/telefone/nascimento — só admin, Compras e RH/Financeiro
  const canExport = hasRoleIn(user?.role, ["admin", "purchasing", "financial"]);

  // Admins and purchasing can manage all functions; else manager of the function
  const canManageFunction = (functionId: string): boolean => {
    if (!user) return false;
    if (isAdminRole || user.role === "purchasing") return true;
    return userFunctionIds.has(functionId);
  };

  const canConfirmEscalation = (inclusion: TeamInclusion): boolean => canManageFunction(inclusion.functionId);

  // Alterar colaborador: admin/function_area/purchasing ou responsável, e só até
  // haver passagem comprada (se needsTicket) ou hospedagem reservada (se needsAccommodation)
  const canEditCollaborator = (inclusion: TeamInclusion): boolean => {
    if (!user) return false;
    const hasRole = isAdminRole || user.role === "function_area" || user.role === "purchasing";
    if (!hasRole && !canManageFunction(inclusion.functionId)) return false;
    const ticketPurchased = inclusion.needsTicket ? purchasedTicketByInclusion.has(inclusion.id) : false;
    const accommodationReserved = inclusion.needsAccommodation ? accommodationByInclusion.has(inclusion.id) : false;
    return !(ticketPurchased || accommodationReserved);
  };

  // ── Nomes ────────────────────────────────────────────────────────────────
  const getEventName = (eventId: string | null) =>
    (eventId && eventById.get(eventId)?.name) || "Evento não encontrado";
  const getFunctionName = (functionId: string | null) =>
    (functionId && functionById.get(functionId)?.name) || "Função não encontrada";
  const getCollaboratorName = (collaboratorId?: string | null) => {
    if (!collaboratorId) return "Não escalado";
    return fixEncoding(collaboratorById.get(collaboratorId)?.fullName) || "Colaborador não encontrado";
  };
  const getCollaboratorCity = (collaboratorId?: string | null) =>
    (collaboratorId && collaboratorById.get(collaboratorId)?.city) || null;
  const getTicket = (inclusionId: string) => ticketByInclusion.get(inclusionId);
  const getPurchasedTicket = (inclusionId: string) => purchasedTicketByInclusion.get(inclusionId);
  const getAccommodation = (inclusionId: string) => accommodationByInclusion.get(inclusionId);
  const isCenotecnicaFunction = (functionId: string | null) => isCenotecnicaFunctionName(getFunctionName(functionId));
  const isAtendimentoInclusion = (inclusion: TeamInclusion) => isAtendimentoFunction(getFunctionName(inclusion.functionId));
  const isPercursoInclusion = (inclusion: TeamInclusion) => isPercursoFunction(getFunctionName(inclusion.functionId));

  // ── Recorte de permissão de visualização ─────────────────────────────────
  const filteredTeamInclusions = useMemo(() => (teamInclusions || []).filter(ti => {
    const linkedEvent = eventById.get(ti.eventId);
    if (!linkedEvent || linkedEvent.status === "excluído") return false;
    if (isAdminRole) return true;
    if (user?.role === "production") return true;
    if (user?.role === "function_area") return true;
    if (user?.role === "purchasing") return true;
    if (user?.role === "financial") return true;
    return userFunctionIds.has(ti.functionId);
  }), [teamInclusions, eventById, isAdminRole, user?.role, userFunctionIds]);

  // ── Filtros + ordenação ─────────────────────────────────────────────────
  const scalingInclusions = useMemo(() => {
    // Busca por ID, colaborador, função, evento ou cidade (normalizada uma vez)
    const q = filters.searchId.replace(/#/g, "").trim().toLowerCase();
    const filtered = filteredTeamInclusions.filter(inclusion => {
      if (filters.eventId !== "all" && inclusion.eventId !== filters.eventId) return false;
      if (filters.functionId.length > 0 && !filters.functionId.includes(inclusion.functionId)) return false;
      if (filters.collaboratorId !== "all" && inclusion.collaboratorId !== filters.collaboratorId) return false;

      if (filters.escalationStatus !== "all") {
        const escalated = isEscalated(inclusion);
        const isCanceled = inclusion.status === "cancelado";
        if (filters.escalationStatus === "pending" && (escalated || isCanceled)) return false;
        if (filters.escalationStatus === "escalated" && (!escalated || isCanceled || inclusion.status === "aguardando_producao")) return false;
        if (filters.escalationStatus === "aguardando_producao" && inclusion.status !== "aguardando_producao") return false;
        if (filters.escalationStatus === "cancelado" && !isCanceled) return false;
      }

      // "Comprada" = passagem com purchaseDate
      if (filters.ticketStatus !== "all") {
        const purchased = purchasedTicketByInclusion.has(inclusion.id);
        if (filters.ticketStatus === "purchased" && !purchased) return false;
        if (filters.ticketStatus === "not-purchased" && purchased) return false;
      }

      if (filters.accommodationStatus !== "all") {
        const hasAccommodation = accommodationByInclusion.has(inclusion.id);
        if (filters.accommodationStatus === "reserved" && !hasAccommodation) return false;
        if (filters.accommodationStatus === "not-reserved" && hasAccommodation) return false;
      }

      if (!q) return true;
      const collaboratorName = inclusion.collaboratorId ? getCollaboratorName(inclusion.collaboratorId).toLowerCase() : "";
      const city = (inclusion.city || getCollaboratorCity(inclusion.collaboratorId) || "").toLowerCase();
      return (
        String(inclusion.inclusionNumber ?? "").toLowerCase().includes(q) ||
        collaboratorName.includes(q) ||
        getFunctionName(inclusion.functionId).toLowerCase().includes(q) ||
        getEventName(inclusion.eventId).toLowerCase().includes(q) ||
        city.includes(q)
      );
    });

    const byPeriod = (a: TeamInclusion, b: TeamInclusion) => {
      if (!a.scheduleStartDate && !b.scheduleStartDate) return 0;
      if (!a.scheduleStartDate) return 1;
      if (!b.scheduleStartDate) return -1;
      return new Date(a.scheduleStartDate).getTime() - new Date(b.scheduleStartDate).getTime();
    };

    if (sortConfig) {
      const { field, direction } = sortConfig;
      const multiplier = direction === "asc" ? 1 : -1;
      return filtered.sort((a, b) => {
        switch (field) {
          case "id": return ((a.inclusionNumber || 0) - (b.inclusionNumber || 0)) * multiplier;
          case "event": return getEventName(a.eventId).localeCompare(getEventName(b.eventId), "pt-BR") * multiplier;
          case "function": return getFunctionName(a.functionId).localeCompare(getFunctionName(b.functionId), "pt-BR") * multiplier;
          case "collaborator": return getCollaboratorName(a.collaboratorId).localeCompare(getCollaboratorName(b.collaboratorId), "pt-BR") * multiplier;
          case "period": return byPeriod(a, b) * multiplier;
          default: return 0;
        }
      });
    }

    // Default: Evento → Função → Data
    return filtered.sort((a, b) => {
      const ev = getEventName(a.eventId).localeCompare(getEventName(b.eventId), "pt-BR");
      if (ev !== 0) return ev;
      const fn = getFunctionName(a.functionId).localeCompare(getFunctionName(b.functionId), "pt-BR");
      if (fn !== 0) return fn;
      return byPeriod(a, b);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredTeamInclusions, filters, sortConfig, eventById, functionById, collaboratorById, purchasedTicketByInclusion, accommodationByInclusion]);

  // Trocas pendentes sobre as quais o usuário PODE agir
  const isActionablePendingSwap = (inclusion: TeamInclusion) => {
    const swap = pendingSwapByInclusion.get(inclusion.id);
    if (!swap) return false;
    if (ALREADY_HANDLED_SWAP_STATUSES.has(inclusion.status ?? "")) return false;
    if (isAdminOrPurchasing) return true;
    return !!user?.id && swap.requestedBy === user.id;
  };

  // Base NÃO filtrada (só o recorte de permissão) — o banner conta o total real
  const pendingSwapInclusionsAll = useMemo(
    () => filteredTeamInclusions.filter(isActionablePendingSwap),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredTeamInclusions, pendingSwapByInclusion, isAdminOrPurchasing, user?.id],
  );
  const pendingSwapInclusionsInView = useMemo(
    () => scalingInclusions.filter(isActionablePendingSwap),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scalingInclusions, pendingSwapByInclusion, isAdminOrPurchasing, user?.id],
  );

  const pendingProductionApprovals = useMemo(
    () => filteredTeamInclusions.filter(i => i.status === "aguardando_producao"),
    [filteredTeamInclusions],
  );
  const pendingProductionApprovalsInView = useMemo(
    () => scalingInclusions.filter(i => i.status === "aguardando_producao"),
    [scalingInclusions],
  );

  // Conflitos de escalação de um colaborador (mesmo evento / datas sobrepostas)
  const getCollaboratorConflicts = (collaboratorId: string, refInclusion: TeamInclusion | null | undefined) => {
    if (!collaboratorId || !teamInclusions) return { sameEvent: [] as TeamInclusion[], dateOverlap: [] as TeamInclusion[] };
    // Prefere a versão fresca da lista (como o find original), cai no objeto passado
    const ref = (refInclusion?.id && teamInclusions.find(ti => ti.id === refInclusion.id)) || refInclusion;
    const others = teamInclusions.filter(ti =>
      ti.collaboratorId === collaboratorId &&
      ti.id !== ref?.id &&
      ACTIVE_CONFLICT_STATUSES.includes(ti.status),
    );
    const sameEvent = others.filter(ti => ref && ti.eventId === ref.eventId);
    const dateOverlap = others.filter(ti => {
      if (!ref?.scheduleStartDate || !ref?.scheduleEndDate) return false;
      if (!ti.scheduleStartDate || !ti.scheduleEndDate) return false;
      return new Date(ti.scheduleStartDate) <= new Date(ref.scheduleEndDate) &&
             new Date(ref.scheduleStartDate) <= new Date(ti.scheduleEndDate);
    });
    return { sameEvent, dateOverlap };
  };

  // O esqueleto espera TODAS as consultas que alimentam a tabela principal.
  const isLoading = isLoadingInclusions || isLoadingEvents || isLoadingFunctions || isLoadingManagers || isLoadingCollaborators;

  const hasActiveFilters =
    filters.eventId !== "all" ||
    filters.functionId.length > 0 ||
    filters.collaboratorId !== "all" ||
    filters.escalationStatus !== "all" ||
    filters.ticketStatus !== "all" ||
    filters.accommodationStatus !== "all" ||
    filters.searchId.trim() !== "";

  return {
    // dados crus
    teamInclusions, events, functions, collaborators, tickets, accommodations,
    isLoading, isErrorInclusions, inclusionsError,
    // índices
    eventById, functionById, collaboratorById, ticketByInclusion, purchasedTicketByInclusion,
    accommodationByInclusion, pendingSwapByInclusion, approvedSwapInclusionIds, firstSwapByInclusion,
    // listas
    filteredTeamInclusions, scalingInclusions,
    pendingSwapInclusionsAll, pendingSwapInclusionsInView,
    pendingProductionApprovals, pendingProductionApprovalsInView,
    hasActiveFilters,
    // permissões
    isAdminRole, isAdminOrPurchasing, canApproveProduction, canExport, userFunctionIds,
    canManageFunction, canConfirmEscalation, canEditCollaborator,
    // helpers
    getEventName, getFunctionName, getCollaboratorName, getCollaboratorCity,
    getTicket, getPurchasedTicket, getAccommodation, isCenotecnicaFunction, isAtendimentoInclusion, isPercursoInclusion,
    getCollaboratorConflicts,
  };
}

export type ScalingData = ReturnType<typeof useScalingData>;

/** Consultas da inclusão selecionada (modal). Todas lazy: só com o modal aberto. */
export function useInclusionDetails(inclusionId: string | undefined) {
  const enabled = !!inclusionId;

  const { data: comments } = useQuery<Comment[]>({
    queryKey: ["/api/comments", inclusionId],
    enabled,
  });

  const { data: inclusionLogs } = useQuery<TeamInclusionLog[]>({
    queryKey: ["/api/team-inclusions", inclusionId, "logs"],
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
  const { data: users, refetch: refetchUsers } = useQuery<any[]>({
    queryKey: ["/api/users"],
    enabled,
  });

  const swapRequests = useMemo<NormalizedSwap[]>(
    () => (swapRequestsRaw || []).map(normalizeSwap),
    [swapRequestsRaw],
  );
  const pendingSwap = swapRequests.find(s => s.status === "pendente");
  const latestSwap = swapRequests[0]; // mais recente (pode ser rejeitado/cancelado)

  return { comments, inclusionLogs, swapRequests, pendingSwap, latestSwap, users, refetchUsers };
}

export type InclusionDetails = ReturnType<typeof useInclusionDetails>;
