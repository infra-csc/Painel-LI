/**
 * Dados da Aprovação de Escala (25/09 — extraídos de pages/scaling-approval.tsx):
 * eventos, funções com responsáveis, quem é aprovador, a fila de pedidos
 * (lista filtrada + pendentes para os contadores) e os mapas de nome.
 */
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDateRange } from "@/lib/dates";
import { apiRequest } from "@/lib/queryClient";
import type { Event, User as UserType } from "@shared/schema";
import { CHANGE_REQUEST_STATUS } from "@shared/scaling-validation-rules";
import type { ApiError, FunctionWithManagers } from "@/components/scaling-validation/types";
import { useEscalaManagers } from "@/components/scaling-validation/use-escala-managers";
import { APPROVAL_QUERY_KEYS, type ChangeRequestItem } from "../types";
import { ALL, type StatusFilter } from "./use-approval-filters";

function requestsUrl(status: string | undefined, eventId: string | undefined): string {
  const qs = new URLSearchParams();
  if (status) qs.set("status", status);
  if (eventId) qs.set("eventId", eventId);
  const s = qs.toString();
  return s ? `${APPROVAL_QUERY_KEYS.requests}?${s}` : APPROVAL_QUERY_KEYS.requests;
}

export function useApprovalData({ canAccess, canDecideByRole, isAdmin, userId, eventId, statusFilter, sanitize }: {
  canAccess: boolean;
  canDecideByRole: boolean;
  isAdmin: boolean;
  userId: string | undefined;
  eventId: string;
  statusFilter: StatusFilter;
  sanitize: (ids: string[]) => void;
}) {
  // Nomes dos responsáveis: o cadastro da Escala guarda ids.
  const { data: usuariosParaNome } = useQuery<UserType[]>({ queryKey: ["/api/users"] });
  const { data: events, isLoading: loadingEvents } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: funcoesCruas } = useQuery<FunctionWithManagers[]>({ queryKey: ["/api/functions"] });
  // `managers` desta tela vem do cadastro PRÓPRIO da Escala (27/08).
  const { functions } = useEscalaManagers(funcoesCruas, usuariosParaNome);
  const activeEvents = useMemo(() => (events ?? []).filter((e) => e.status !== "excluido" && e.status !== "excluído"), [events]);
  useEffect(() => { if (events) sanitize(activeEvents.map((e) => e.id)); }, [events, activeEvents, sanitize]);
  const selectedEvent = activeEvents.find((e) => e.id === eventId) ?? null;
  const functionNameById = useMemo(() => new Map((functions ?? []).map((f) => [f.id, f.name])), [functions]);
  const eventById = useMemo(() => new Map(activeEvents.map((e) => [e.id, e])), [activeEvents]);
  /** Período de cada evento, pronto para a fila e para os diálogos. */
  const eventPeriodById = useMemo(
    () => new Map(activeEvents.map((e) => [e.id, formatDateRange(e.startDate, e.endDate, { withYear: true })] as const)),
    [activeEvents],
  );

  /**
   * userId → nome, montado com os responsáveis das funções: o GET de sugestões
   * traz `validatedBy` (id) mas não o nome de quem validou. Sem match, a coluna
   * mostra só a data (nunca o UUID).
   */
  const userNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of functions ?? []) {
      for (const m of f.managers ?? []) if (m.userId && m.userName) map.set(m.userId, m.userName);
    }
    return map;
  }, [functions]);

  /** Nomes dos aprovadores por função — só informativo, para explicar quem decide nas linhas sem permissão. */
  const approverNamesByFunctionId = useMemo(
    () => new Map((functions ?? []).map((f) => [f.id, (f.managers ?? []).filter((m) => m.role === "aprovador").map((m) => m.userName).filter(Boolean)])),
    [functions],
  );
  /**
   * Admin ou aprovador de alguma função — quem pode DECIDIR (bypass incluído), então
   * é quem vê a aba "Vagas paradas". A decisão por linha vem sempre do servidor
   * (`canDecide`); isto aqui só decide o que aparece na tela.
   */
  const isApprover = useMemo(
    () => isAdmin || (functions ?? []).some((f) => f.managers?.some((m) => m.userId === userId && m.role === "aprovador")),
    [functions, isAdmin, userId],
  );
  /**
   * Modo leitura: não é papel de decisão E não é aprovador de nenhuma função.
   * Esconde as ações GLOBAIS de decisão (contador "Posso decidir", filtro "só os
   * que posso decidir", aba de bypass) — o `canDecide` de cada pedido continua
   * sendo a trava final, inclusive para quem NÃO está em modo leitura.
   * `!!functions`: enquanto a lista de funções carrega não dá para saber se o
   * usuário é aprovador — não piscar o banner à toa.
   */
  const readOnlyMode = !canDecideByRole && !!functions && !isApprover;

  const statusParam = statusFilter === ALL ? undefined : statusFilter;
  const eventParam = eventId || undefined;
  const listQuery = useQuery<ChangeRequestItem[]>({
    queryKey: [APPROVAL_QUERY_KEYS.requests, statusParam ?? ALL, eventParam ?? ALL],
    queryFn: async () => (await apiRequest("GET", requestsUrl(statusParam, eventParam))).json(),
    enabled: canAccess,
    staleTime: 15_000,
  });
  // Contadores sempre sobre os PENDENTES (mesma chave da lista quando o filtro é "pendente" → uma única busca).
  const pendingQuery = useQuery<ChangeRequestItem[]>({
    queryKey: [APPROVAL_QUERY_KEYS.requests, CHANGE_REQUEST_STATUS.PENDENTE, eventParam ?? ALL],
    queryFn: async () => (await apiRequest("GET", requestsUrl(CHANGE_REQUEST_STATUS.PENDENTE, eventParam))).json(),
    enabled: canAccess,
    staleTime: 15_000,
  });
  const items = useMemo(() => listQuery.data ?? [], [listQuery.data]);
  const pendingItems = useMemo(() => pendingQuery.data ?? [], [pendingQuery.data]);

  const loadError = listQuery.error as ApiError | null;
  const forbidden = loadError?.status === 403;
  /**
   * 403 não é falha: é "esta fila não é sua". Tratá-lo como erro fazia a tela
   * dizer "Não foi possível carregar" para quem só queria acompanhar um pedido
   * — e o texto sugeria problema de conexão onde não havia problema nenhum.
   */
  const erroFila = !!loadError && !forbidden;

  return {
    loadingEvents, activeEvents, selectedEvent, functions, functionNameById, eventById, eventPeriodById,
    userNameById, approverNamesByFunctionId, isApprover, readOnlyMode,
    listQuery, pendingQuery, items, pendingItems, loadError, forbidden, erroFila,
  };
}

export type ApprovalData = ReturnType<typeof useApprovalData>;
