// Dados da tela de Passagens: queries, índices O(1), filtros/dedupe/ordenação
// e KPIs memoizados. Sem JSX — a página e os componentes só consomem.
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fixEncoding } from "@/lib/utils";
import { purchasedValueKpi, isStoredTicketOneWay } from "@/lib/ticket-form";
import type { SortConfig } from "@/components/common/sortable-header";
import type {
  TeamInclusion, Event, Function, Collaborator, Ticket, Accommodation, User, SwapRequest,
} from "@shared/schema";
import type { TicketFilters } from "./types";

/** Linha crua de /api/swap-requests (SQL direto → snake_case junto com o tipo drizzle). */
export type SwapRequestRow = SwapRequest & {
  team_inclusion_id?: string;
  new_collaborator_id?: string | null;
  current_collaborator_id?: string | null;
  requested_by_name?: string;
  created_at?: string;
  new_collaborator_name?: string | null;
  current_collaborator_name?: string | null;
};

export type UserName = Pick<User, "id" | "name">;

const swapInclusionId = (s: SwapRequestRow) => s.team_inclusion_id || s.teamInclusionId;

/** Status que mostram a inclusão mesmo sem colaborador (compra antes do nome). */
const VALID_STATUSES_WITHOUT_COLLABORATOR = [
  "reaberto", "escalado",
  "aguardando_passagem", "aguardando_hospedagem",
  "passagem", "hospedagem", "hospedagem_comprada",
  "aprovado", "passagem_comprada", "hospedagem_passagem_comprada",
];

const STATUS_PRIORITY: Record<string, number> = {
  hospedagem_passagem_comprada: 7,
  aprovado: 6,
  passagem_comprada: 5,
  hospedagem: 4,
  passagem: 3,
  aguardando_passagem: 2,
  cancelado: 1, // menor prioridade: registros ativos vencem os cancelados
};

// "Só ida" NÃO existe no banco — derivado da ausência dos dados de volta (regra em ticket-form.ts).
export const isOneWayTicket = (t: Ticket) => isStoredTicketOneWay(t);

export const toTitleCase = (str: string) => {
  if (!str) return str;
  const lower = str.toLowerCase();
  if (lower === "não escalado") return "Não escalado";
  return lower.replace(/\b\w/g, (c) => c.toUpperCase());
};

// Formata sem passar por new Date(): "YYYY-MM-DD" no construtor é lido como
// UTC e volta um dia atrás em Brasília. O slice(0,10) protege contra valores
// que chegam como ISO completo ("YYYY-MM-DDTHH:mm:ss").
export const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return "N/A";
  const [year, month, day] = String(dateStr).slice(0, 10).split("-");
  if (!year || !month || !day) return String(dateStr);
  return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`;
};

export const formatBrl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const PURCHASING_ROLES = ["admin", "administrator", "administrador", "purchasing"];

interface UseTicketsDataArgs {
  filters: TicketFilters;
  showOnlyPendingSwaps: boolean;
  sortConfig: SortConfig | null;
  user: User | null;
}

export function useTicketsData({ filters, showOnlyPendingSwaps, sortConfig, user }: UseTicketsDataArgs) {
  const queryClient = useQueryClient();

  const { data: teamInclusions, isLoading: isLoadingInclusions, error: inclusionsError } = useQuery<TeamInclusion[]>({
    queryKey: ["/api/team-inclusions"],
  });
  const { data: events, isLoading: isLoadingEvents, error: eventsError } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });
  const { data: functions, isLoading: isLoadingFunctions, error: functionsError } = useQuery<Function[]>({
    queryKey: ["/api/functions"],
  });
  const { data: collaborators, isLoading: isLoadingCollaborators, error: collaboratorsError } = useQuery<Collaborator[]>({
    queryKey: ["/api/collaborators"],
  });
  const { data: tickets, isLoading: isLoadingTickets, error: ticketsError } = useQuery<Ticket[]>({
    queryKey: ["/api/tickets"],
  });
  const { data: accommodations } = useQuery<Accommodation[]>({ queryKey: ["/api/accommodations"] });
  // Só para exibir o nome do autor dos comentários (a API de comentários não o traz).
  const { data: users } = useQuery<UserName[]>({ queryKey: ["/api/users"] });
  // Valores de refeição do Planejado — alimentam a linha "Impacto no Planejado".
  const { data: systemSettings } = useQuery<Record<string, number | string>>({ queryKey: ["/api/system-settings"] });

  // Query global — para badges nas linhas da tabela (sem depender de inclusão selecionada)
  const { data: allSwapRequests } = useQuery<SwapRequestRow[]>({
    queryKey: ["/api/swap-requests"],
    queryFn: async () => {
      const r = await fetch("/api/swap-requests");
      if (!r.ok) return [];
      return r.json();
    },
  });

  // Esqueleto espera o conteúdo principal da tabela — inclusões, evento,
  // função, colaborador e a própria passagem.
  const isLoading = isLoadingInclusions || isLoadingEvents || isLoadingFunctions || isLoadingCollaborators || isLoadingTickets;

  // Falha de carregamento NÃO pode virar "nenhuma passagem encontrada". Só
  // bloqueia a tela quando ainda não há dados: um refetch falho em segundo
  // plano não pode apagar a tela cheia.
  const loadError = (teamInclusions
    ? null
    : (inclusionsError || eventsError || functionsError || collaboratorsError || ticketsError)) as
    | (Error & { status?: number; body?: { message?: string } })
    | null;

  const retryLoad = () => {
    for (const key of ["/api/team-inclusions", "/api/events", "/api/functions", "/api/collaborators", "/api/tickets"]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };

  // ── Índices O(1) — "primeiro registro vence" do .find() é preservado ──
  const ticketByInclusion = useMemo(() => {
    const map = new Map<string, Ticket>();
    tickets?.forEach(t => { if (t.teamInclusionId && !map.has(t.teamInclusionId)) map.set(t.teamInclusionId, t); });
    return map;
  }, [tickets]);

  const eventById = useMemo(() => {
    const map = new Map<string, Event>();
    events?.forEach(e => { if (!map.has(e.id)) map.set(e.id, e); });
    return map;
  }, [events]);

  const functionById = useMemo(() => {
    const map = new Map<string, Function>();
    functions?.forEach(f => { if (!map.has(f.id)) map.set(f.id, f); });
    return map;
  }, [functions]);

  const collaboratorById = useMemo(() => {
    const map = new Map<string, Collaborator>();
    collaborators?.forEach(c => { if (!map.has(c.id)) map.set(c.id, c); });
    return map;
  }, [collaborators]);

  const accommodationByInclusion = useMemo(() => {
    const map = new Map<string, Accommodation>();
    accommodations?.forEach(acc => {
      if (acc?.teamInclusionId && !map.has(acc.teamInclusionId)) map.set(acc.teamInclusionId, acc);
    });
    return map;
  }, [accommodations]);

  const userNameById = useMemo(() => {
    const map = new Map<string, string>();
    users?.forEach(u => { if (u?.id && !map.has(u.id)) map.set(u.id, u.name); });
    return map;
  }, [users]);

  const pendingSwapByInclusion = useMemo(() => {
    const set = new Set<string>();
    allSwapRequests?.filter(s => s.status === "pendente").forEach(s => {
      const id = swapInclusionId(s);
      if (id) set.add(id);
    });
    return set;
  }, [allSwapRequests]);

  const approvedSwapInclusionIds = useMemo(() => {
    const ids = new Set<string>();
    allSwapRequests?.filter(s => s.status === "aprovado").forEach(s => {
      const id = swapInclusionId(s);
      if (id) ids.add(id);
    });
    return ids;
  }, [allSwapRequests]);

  const isPurchasingRole = !!user?.role && PURCHASING_ROLES.includes(user.role);

  // ── Getters ──
  const getTicket = (inclusionId: string): Ticket | undefined => ticketByInclusion.get(inclusionId);
  const getEventName = (eventId: string) => eventById.get(eventId)?.name || "Evento não encontrado";
  const getFunctionName = (functionId: string) => functionById.get(functionId)?.name || "Função não encontrada";
  const getCollaboratorName = (collaboratorId?: string | null) => {
    if (!collaboratorId) return "Não escalado";
    return fixEncoding(collaboratorById.get(collaboratorId)?.fullName) || "Colaborador não encontrado";
  };
  const getCollaborator = (collaboratorId?: string | null) =>
    collaboratorId ? collaboratorById.get(collaboratorId) || null : null;
  const getEventLocation = (eventId: string) => eventById.get(eventId)?.location || "Destino não informado";
  const getUserName = (userId: string) => userNameById.get(userId) || "Usuário";

  // ── Inclusões que precisam de passagem + filtros simples ──
  const ticketInclusions = useMemo(() => teamInclusions?.filter(inclusion => {
    if (!inclusion.needsTicket) return false;
    // Canceladas só somem no filtro "Inclusões ativas".
    if (inclusion.status === "cancelado" && filters.inclusionStatus === "active") return false;
    // Com colaborador aparece independente do status; sem colaborador só nos status previstos.
    if (!inclusion.collaboratorId && !VALID_STATUSES_WITHOUT_COLLABORATOR.includes(inclusion.status)) return false;

    if (filters.eventId !== "all" && inclusion.eventId !== filters.eventId) return false;
    if (filters.functionId.length > 0 && !filters.functionId.includes(inclusion.functionId)) return false;
    if (filters.collaboratorId !== "all" && inclusion.collaboratorId !== filters.collaboratorId) return false;
    if (filters.searchId) {
      const q = filters.searchId.replace(/#/g, "").trim().toLowerCase();
      const colName = (inclusion.collaboratorId ? collaboratorById.get(inclusion.collaboratorId)?.fullName ?? "" : "").toLowerCase();
      if (!(String(inclusion.inclusionNumber ?? "").toLowerCase().includes(q) ||
        inclusion.id.toLowerCase().includes(q) ||
        colName.includes(q))) return false;
    }
    if (filters.inclusionStatus === "cancelado" && inclusion.status !== "cancelado") return false;
    return true;
  }) || [], [teamInclusions, collaboratorById, filters.eventId, filters.functionId, filters.collaboratorId, filters.searchId, filters.inclusionStatus]);

  // ── Dedupe por colaborador (documento normalizado) + evento + função ──
  const deduplicatedInclusions = useMemo(() => {
    const map = new Map<string, TeamInclusion>();
    const normalizeDocument = (doc?: string | null) => (doc ? doc.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() : "");
    const makeKey = (inc: TeamInclusion) => {
      const collaborator = getCollaborator(inc.collaboratorId);
      const businessId = normalizeDocument(collaborator?.officialDocument) || inc.collaboratorId || "";
      if (!businessId) return `${inc.eventId}|${inc.functionId}|unassigned-${inc.id}`;
      return `${inc.eventId}|${inc.functionId}|${businessId}`;
    };
    for (const inclusion of ticketInclusions) {
      const key = makeKey(inclusion);
      const existing = map.get(key);
      if (!existing) { map.set(key, inclusion); continue; }
      const cur = STATUS_PRIORITY[inclusion.status] ?? 0;
      const ex = STATUS_PRIORITY[existing.status] ?? 0;
      let isNewer = cur > ex;
      if (cur === ex) {
        const curN = inclusion.inclusionNumber ?? 0;
        const exN = existing.inclusionNumber ?? 0;
        if (curN !== exN) {
          isNewer = curN > exN;
        } else {
          const curU = inclusion.updatedAt || inclusion.createdAt || inclusion.id;
          const exU = existing.updatedAt || existing.createdAt || existing.id;
          isNewer = curU > exU;
        }
      }
      if (isNewer) map.set(key, inclusion);
    }
    return Array.from(map.values());
  }, [ticketInclusions, collaboratorById]);

  // ── Filtro de status da passagem/transporte + ordenação ──
  const filteredTicketInclusions = useMemo(() => {
    const filtered = deduplicatedInclusions.filter(inclusion => {
      if (showOnlyPendingSwaps && !pendingSwapByInclusion.has(inclusion.id)) return false;
      const t = ticketByInclusion.get(inclusion.id);
      if (filters.ticketStatus !== "all") {
        const hasTicket = !!t;
        if (filters.ticketStatus === "pending" && hasTicket) return false;
        if (filters.ticketStatus === "processed" && !hasTicket) return false;
        // Qualidade: compradas (aéreo/rodoviário) sem horário de chegada.
        if (filters.ticketStatus === "no_arrival" && !(t && t.transportType !== "van" && !t.actualArrivalTime)) return false;
      }
      if (filters.transportType !== "all") {
        if (!t || (t.transportType || "aereo") !== filters.transportType) return false;
      }
      return true;
    });

    if (!sortConfig) return filtered;
    const { field, direction } = sortConfig;
    const multiplier = direction === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      switch (field) {
        case "id":
          return ((a.inclusionNumber || 0) - (b.inclusionNumber || 0)) * multiplier;
        case "event":
          return getEventName(a.eventId).localeCompare(getEventName(b.eventId), "pt-BR") * multiplier;
        case "function":
          return getFunctionName(a.functionId).localeCompare(getFunctionName(b.functionId), "pt-BR") * multiplier;
        case "collaborator":
          return getCollaboratorName(a.collaboratorId).localeCompare(getCollaboratorName(b.collaboratorId), "pt-BR") * multiplier;
        case "diarias":
          if (!a.scheduleStartDate && !b.scheduleStartDate) return 0;
          if (!a.scheduleStartDate) return 1 * multiplier;
          if (!b.scheduleStartDate) return -1 * multiplier;
          return (new Date(a.scheduleStartDate).getTime() - new Date(b.scheduleStartDate).getTime()) * multiplier;
        default:
          return 0;
      }
    });
  }, [deduplicatedInclusions, filters.ticketStatus, filters.transportType, showOnlyPendingSwaps, pendingSwapByInclusion, ticketByInclusion, sortConfig, eventById, functionById, collaboratorById]);

  // Banner: trocas pendentes que aparecem de fato na tabela (mesma lista renderizada).
  const pendingTicketSwapsCount = useMemo(() => {
    if (!isPurchasingRole) return 0;
    if (showOnlyPendingSwaps) return filteredTicketInclusions.length;
    return filteredTicketInclusions.filter(inc => pendingSwapByInclusion.has(inc.id)).length;
  }, [isPurchasingRole, showOnlyPendingSwaps, filteredTicketInclusions, pendingSwapByInclusion]);

  // Linhas que podem entrar no lote: pendentes, não canceladas e visíveis agora.
  const selectableInclusionIds = useMemo(() => {
    const ids = new Set<string>();
    filteredTicketInclusions.forEach(inc => {
      if (!ticketByInclusion.has(inc.id) && inc.status !== "cancelado") ids.add(inc.id);
    });
    return ids;
  }, [filteredTicketInclusions, ticketByInclusion]);

  // ── KPIs do filtro atual ──
  const kpis = useMemo(() => {
    let compradas = 0, aguardando = 0, semChegada = 0;
    const values: Array<number | null | undefined> = [];
    for (const inc of filteredTicketInclusions) {
      const t = ticketByInclusion.get(inc.id);
      if (t) {
        compradas++;
        values.push(t.value);
        if (t.transportType !== "van" && !t.actualArrivalTime) semChegada++;
      } else if (inc.status !== "cancelado") {
        // Inclusão cancelada não é "aguardando".
        aguardando++;
      }
    }
    return { total: filteredTicketInclusions.length, compradas, aguardando, semChegada, valor: purchasedValueKpi(values) };
  }, [filteredTicketInclusions, ticketByInclusion]);

  return {
    // dados crus
    teamInclusions, events, functions, collaborators, tickets, systemSettings,
    isLoading, loadError, retryLoad,
    // índices
    ticketByInclusion, eventById, functionById, collaboratorById, accommodationByInclusion,
    pendingSwapByInclusion, approvedSwapInclusionIds, isPurchasingRole,
    // getters
    getTicket, getEventName, getFunctionName, getCollaboratorName, getCollaborator, getEventLocation, getUserName,
    // listas derivadas
    filteredTicketInclusions, pendingTicketSwapsCount, selectableInclusionIds, kpis,
  };
}

export type TicketsData = ReturnType<typeof useTicketsData>;
