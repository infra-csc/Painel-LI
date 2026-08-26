import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { CalendarDays, CheckCircle2, CheckSquare, Clock, EyeOff, Search, ShieldCheck, Square } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToastAction } from "@/components/ui/toast";
import EventCombobox from "@/components/ui/event-combobox";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { usePageTitle } from "@/components/common/use-page-title";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { hasPermission } from "@/lib/role-utils";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage, cn } from "@/lib/utils";
import { scalingHref, useScalingEvent } from "@/lib/use-scaling-event";
import { normalizeRole } from "@shared/roles";
import type { Event } from "@shared/schema";
import {
  ALL_EVENTS_ROW_LIMIT,
  CHANGE_REQUEST_STATUS, CHANGE_REQUEST_STATUS_LABELS, CHANGE_REQUEST_STATUS_VALUES,
  CHANGE_REQUEST_TYPES, CHANGE_REQUEST_TYPE_LABELS, STALLED_DAYS, SUGESTAO_STATUS, daysPending,
  pendingSeverity, type ChangeRequestType,
} from "@shared/scaling-validation-rules";
import { SUGGESTIONS_QUERY_KEY, type ApiError, type FunctionWithManagers } from "@/components/scaling-validation/types";
import { APPROVAL_QUERY_KEYS, type ChangeRequestItem, type ReviewBody, type StalledRow } from "@/components/scaling-approval/types";
import { RequestQueue } from "@/components/scaling-approval/request-queue";
import { RequestDetailSheet } from "@/components/scaling-approval/request-detail-sheet";
import { ApproveRequestDialog, ReviewRequestDialog } from "@/components/scaling-approval/decision-dialogs";
import { StalledSuggestions } from "@/components/scaling-approval/stalled-suggestions";
import { AwaitingApproval, daysAwaiting } from "@/components/scaling-approval/awaiting-approval";
import { ScalingModuleNav } from "@/components/scaling-validation/scaling-module-nav";
import { useDecisionMutations } from "@/components/scaling-approval/use-decisions";

const ALL = "all";
const BASE_PATH = "/scaling-approval";

type StatusFilter = typeof ALL | (typeof CHANGE_REQUEST_STATUS_VALUES)[number];
type TypeFilter = typeof ALL | ChangeRequestType;

function requestsUrl(status: string | undefined, eventId: string | undefined): string {
  const qs = new URLSearchParams();
  if (status) qs.set("status", status);
  if (eventId) qs.set("eventId", eventId);
  const s = qs.toString();
  return s ? `${APPROVAL_QUERY_KEYS.requests}?${s}` : APPROVAL_QUERY_KEYS.requests;
}

// ── Overlay (Sheet + diálogos) — um único estado {id, mode} ──────────────────
type OverlayMode = "closed" | "sheet" | "approve" | "reajustar" | "negar";
interface OverlayState { id: string | null; mode: OverlayMode }
type OverlayAction =
  | { type: "open"; id: string }
  | { type: "mode"; mode: Exclude<OverlayMode, "closed"> }
  | { type: "back" }        // fecha o diálogo, mantém o Sheet
  | { type: "close" };      // fecha tudo (mantém o id para a animação de saída)

function overlayReducer(state: OverlayState, action: OverlayAction): OverlayState {
  switch (action.type) {
    case "open": return { id: action.id, mode: "sheet" };
    case "mode": return state.id ? { ...state, mode: action.mode } : state;
    case "back": return { ...state, mode: state.mode === "closed" ? "closed" : "sheet" };
    case "close": return { ...state, mode: "closed" };
  }
}

/** Filtro rápido ativo a partir dos contadores. */
type QuickFilter = "pendentes" | "ajuste" | "inclusao" | "exclusao";

/**
 * Abas da tela. "aprovacao" (vagas validadas pela área aguardando decisão) é o
 * caminho normal do fluxo desde 19/08 — por isso vem primeiro e vira o padrão
 * quando há itens.
 */
type ApprovalTab = "aprovacao" | "fila" | "paradas";

const TAB_TRIGGER = "h-7 rounded-lg px-3.5 text-[13px] font-medium";

/**
 * Filtro liga/desliga da barra de abas ("Só as minhas funções" / "Só os que
 * posso decidir"). Botão com `aria-pressed` — mesmo estado do checkbox que
 * substituiu, com a caixa do mockup.
 */
function ToggleFilter({ pressed, onPressedChange, label }: { pressed: boolean; onPressedChange: (v: boolean) => void; label: string }) {
  const Icon = pressed ? CheckSquare : Square;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "inline-flex items-center gap-2 h-7 rounded-lg border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        pressed ? "border-primary/30 bg-brand-soft text-primary" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
      )}
    >
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />{label}
    </button>
  );
}

export default function ScalingApprovalPage() {
  usePageTitle("Aprovação de Escala");
  const { user } = useAuth();
  const isAdmin = normalizeRole(user?.role) === "admin";
  const canAccess = hasPermission(user, "canAccessScalingApproval");
  /** Papel de DECISÃO (admin/logística/compras). Quem não tem só acompanha — a não ser que seja aprovador de alguma função (ver `isApprover`). */
  const canDecideByRole = hasPermission(user, "canEditScalingApproval");

  // ── Estado ──
  // A tela ABRE em "Todos os eventos" (regra do dono, 26/08): o combobox é
  // FILTRO. Sem `?eventId=` na URL, nada é pré-selecionado.
  const { eventId, setEventId, sanitize } = useScalingEvent(BASE_PATH, { allEventsDefault: true });
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  /** Deep-link do Histórico: `?request=<id>` → abre o Sheet daquele pedido e limpa o param (capturado no 1º render, antes de o hook de evento reescrever a URL). */
  const [deepLinkId, setDeepLinkId] = useState<string | null>(() => new URLSearchParams(searchString).get("request"));
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(ALL);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(CHANGE_REQUEST_STATUS.PENDENTE);
  const [search, setSearch] = useState("");
  const [lateOnly, setLateOnly] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [tab, setTab] = useState<ApprovalTab>("fila");
  const [overlay, dispatch] = useReducer(overlayReducer, { id: null, mode: "closed" });
  const [onlyMineStalled, setOnlyMineStalled] = useState(true);
  /** "Vagas aguardando aprovação": mostra todas por padrão (as de outros aprovadores ficam com o cadeado). */
  const [onlyMineAwaiting, setOnlyMineAwaiting] = useState(false);
  /**
   * Abriu a aba na mão? Então o padrão automático ("aguardando aprovação"
   * quando há itens) não mexe mais na escolha do usuário.
   */
  const tabPickedByUser = useRef(false);
  /** Evento cujo padrão de aba já foi aplicado — o auto-switch roda uma vez por evento. */
  const autoTabEventId = useRef<string | null>(null);

  // ── Dados ──
  const { data: events, isLoading: loadingEvents } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: functions } = useQuery<FunctionWithManagers[]>({ queryKey: ["/api/functions"] });
  const activeEvents = useMemo(() => (events ?? []).filter((e) => e.status !== "excluido" && e.status !== "excluído"), [events]);
  useEffect(() => { if (events) sanitize(activeEvents.map((e) => e.id)); }, [events, activeEvents, sanitize]);
  const selectedEvent = activeEvents.find((e) => e.id === eventId) ?? null;
  const functionNameById = useMemo(() => new Map((functions ?? []).map((f) => [f.id, f.name])), [functions]);
  const eventById = useMemo(() => new Map(activeEvents.map((e) => [e.id, e])), [activeEvents]);

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
    () => isAdmin || (functions ?? []).some((f) => f.managers?.some((m) => m.userId === user?.id && m.role === "aprovador")),
    [functions, isAdmin, user?.id],
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

  // Sugestões do evento (para "Vagas paradas" e para o formulário editável do ajuste).
  const openId = overlay.id;
  const openRequest = useMemo(() => items.find((r) => r.id === openId) ?? pendingItems.find((r) => r.id === openId) ?? null, [items, pendingItems, openId]);
  /** Evento da vaga que o Sheet aberto precisa (formulário editável do ajuste). */
  const sheetEventId = openRequest?.requestType === "ajuste" && openRequest.teamInclusionId ? openRequest.eventId : "";
  /**
   * Quem DECIDE carrega as vagas SEMPRE — com evento escolhido ou em "Todos os
   * eventos" (aí o servidor devolve as vagas em validação de todos, com teto).
   *
   * Antes a busca dependia de haver evento selecionado, e o contador
   * "Aguardando aprovação" caía para 0 no padrão da tela: o aprovador via
   * "nenhum pedido pendente — bom trabalho" com 15 vagas validadas esperando
   * decisão. A tela MENTIA; é o caso que esta query resolve.
   *
   * Quem não decide continua buscando só o que o Sheet aberto precisa.
   */
  const suggestionsEventId = isApprover ? eventId : sheetEventId;
  const suggestionsEnabled = canAccess && (isApprover || !!sheetEventId);
  const suggestionsQuery = useQuery<StalledRow[]>({
    queryKey: [SUGGESTIONS_QUERY_KEY, suggestionsEventId],
    queryFn: async () =>
      (await apiRequest(
        "GET",
        suggestionsEventId ? `${SUGGESTIONS_QUERY_KEY}?eventId=${encodeURIComponent(suggestionsEventId)}` : SUGGESTIONS_QUERY_KEY,
      )).json(),
    enabled: suggestionsEnabled,
    staleTime: 15_000,
  });
  /**
   * Enquanto as vagas carregam, NENHUM contador pode mostrar 0 — repetir a
   * mentira em outra forma. Os tiles mostram "…" enquanto isto for true.
   */
  const loadingAwaiting = suggestionsEnabled && (suggestionsQuery.isLoading || (isApprover && !suggestionsQuery.data && !suggestionsQuery.error));
  /** O servidor cortou a lista de vagas? (só existe teto no modo "todos"). */
  const suggestionsTruncated = !suggestionsEventId && (suggestionsQuery.data?.length ?? 0) >= ALL_EVENTS_ROW_LIMIT;
  /** Quantos eventos estão representados nas vagas exibidas (modo "todos"). */
  const eventsInSuggestions = useMemo(
    () => new Set((suggestionsQuery.data ?? []).map((r) => r.eventId)).size,
    [suggestionsQuery.data],
  );
  const openInclusion = useMemo(
    () => (openRequest?.teamInclusionId ? (suggestionsQuery.data ?? []).find((s) => s.id === openRequest.teamInclusionId) ?? null : null),
    [suggestionsQuery.data, openRequest?.teamInclusionId],
  );
  const stalledRowsAll = useMemo(
    () => (suggestionsQuery.data ?? [])
      .filter((s) => s.status === SUGESTAO_STATUS.PENDENTE && !s.pendingRequest && s.daysPending >= STALLED_DAYS)
      .sort((a, b) => b.daysPending - a.daysPending || (a.inclusionNumber ?? 0) - (b.inclusionNumber ?? 0)),
    [suggestionsQuery.data],
  );
  // Filtro "Só as minhas funções" (irrelevante para admin, que decide todas).
  const showOnlyMineStalled = !isAdmin;
  const stalledRows = useMemo(
    () => (showOnlyMineStalled && onlyMineStalled ? stalledRowsAll.filter((s) => s.canDecide === true) : stalledRowsAll),
    [stalledRowsAll, showOnlyMineStalled, onlyMineStalled],
  );

  /**
   * Vagas que a área validou e agora aguardam a decisão do aprovador
   * (sugestao_validada). Mais antigas no topo — é a fila que segura a escala.
   */
  const awaitingRowsAll = useMemo(
    () => (suggestionsQuery.data ?? [])
      .filter((s) => s.status === SUGESTAO_STATUS.VALIDADA)
      .sort((a, b) => daysAwaiting(b) - daysAwaiting(a) || (a.inclusionNumber ?? 0) - (b.inclusionNumber ?? 0)),
    [suggestionsQuery.data],
  );
  const awaitingRows = useMemo(
    () => (showOnlyMineStalled && onlyMineAwaiting ? awaitingRowsAll.filter((s) => s.canDecide === true) : awaitingRowsAll),
    [awaitingRowsAll, showOnlyMineStalled, onlyMineAwaiting],
  );
  /**
   * "Parada" não é só das pendentes: desde 19/08 a fila que trava a escala é a
   * das VALIDADAS esperando o aprovador. Mesmo limiar e mesma severidade das
   * "Vagas paradas" (STALLED_DAYS / pendingSeverity), só que contando de
   * `validatedAt` — sem isto uma vaga validada nunca alertava ninguém.
   */
  const stalledAwaiting = useMemo(() => {
    const days = awaitingRowsAll.map(daysAwaiting).filter((d) => d >= STALLED_DAYS);
    const worst = days.length ? Math.max(...days) : 0;
    return { count: days.length, worst, severity: pendingSeverity(worst) };
  }, [awaitingRowsAll]);

  /**
   * Aba padrão: com vagas aguardando aprovação, é ali que o aprovador precisa
   * estar. Roda uma vez por evento e só enquanto o usuário não escolheu aba.
   */
  // Vale também em "Todos os eventos" (chave "__todos__"): é justamente ali que
  // o aprovador precisa cair na fila que trava a escala.
  useEffect(() => {
    if (!isApprover || tabPickedByUser.current) return;
    if (suggestionsQuery.isLoading || !suggestionsQuery.data) return;
    const scope = eventId || "__todos__";
    if (autoTabEventId.current === scope) return;
    autoTabEventId.current = scope;
    setTab(awaitingRowsAll.length > 0 ? "aprovacao" : "fila");
  }, [isApprover, eventId, suggestionsQuery.isLoading, suggestionsQuery.data, awaitingRowsAll.length]);

  // ── Filtros locais ──
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((r) => typeFilter === ALL || r.requestType === typeFilter)
      .filter((r) => !lateOnly || (r.status === CHANGE_REQUEST_STATUS.PENDENTE && daysPending(r.createdAt) >= STALLED_DAYS))
      .filter((r) => !mineOnly || r.canDecide)
      .filter((r) => {
        if (!q) return true;
        return [r.functionName, r.eventName, r.requestedByName, r.reason, r.area, r.inclusionNumber ? `#${r.inclusionNumber}` : "", String(r.inclusionNumber ?? "")]
          .some((v) => (v ?? "").toString().toLowerCase().includes(q));
      })
      .sort((a, b) => {
        // pendentes primeiro (mais antigos no topo); decididos por data desc
        const pa = a.status === CHANGE_REQUEST_STATUS.PENDENTE ? 0 : 1;
        const pb = b.status === CHANGE_REQUEST_STATUS.PENDENTE ? 0 : 1;
        if (pa !== pb) return pa - pb;
        const ta = new Date(a.createdAt ?? 0).getTime();
        const tb = new Date(b.createdAt ?? 0).getTime();
        return pa === 0 ? ta - tb : tb - ta;
      });
  }, [items, typeFilter, search, lateOnly, mineOnly]);
  const hasActiveFilters = search.trim() !== "" || typeFilter !== ALL || statusFilter !== CHANGE_REQUEST_STATUS.PENDENTE || lateOnly || mineOnly;
  const clearFilters = () => { setSearch(""); setTypeFilter(ALL); setStatusFilter(CHANGE_REQUEST_STATUS.PENDENTE); setLateOnly(false); setMineOnly(false); };

  // ── Contadores (pendentes) + quick-filters ──
  const counts = useMemo(() => ({
    pendentes: pendingItems.length,
    ajuste: pendingItems.filter((r) => r.requestType === "ajuste").length,
    inclusao: pendingItems.filter((r) => r.requestType === "inclusao").length,
    exclusao: pendingItems.filter((r) => r.requestType === "exclusao").length,
    atrasados: pendingItems.filter((r) => daysPending(r.createdAt) >= STALLED_DAYS).length,
    meus: pendingItems.filter((r) => r.canDecide).length,
  }), [pendingItems]);
  const activeQuick: QuickFilter | null =
    statusFilter !== CHANGE_REQUEST_STATUS.PENDENTE ? null
      : typeFilter === ALL ? "pendentes"
        : (typeFilter as QuickFilter);
  /** Trocar de aba por ação do usuário (aba ou tile) — congela o padrão automático. */
  const switchTab = (t: ApprovalTab) => { tabPickedByUser.current = true; setTab(t); };
  /**
   * Entrar na Fila pela ABA sempre mostra OS PENDENTES (regra do dono, 26/08:
   * "na aprovação os pendentes têm que vir selecionado"). Sem isso a fila
   * reabria com o recorte da última visita — "Ajuste", "atrasados" — e o
   * aprovador achava que tinha 1 pedido quando tinha 3.
   */
  const openFilaTab = () => {
    switchTab("fila");
    setStatusFilter(CHANGE_REQUEST_STATUS.PENDENTE);
    setTypeFilter(ALL);
    setLateOnly(false);
    setMineOnly(false);
  };
  const applyQuick = (q: QuickFilter) => {
    switchTab("fila");
    if (activeQuick === q && q !== "pendentes") { setTypeFilter(ALL); return; }
    setStatusFilter(CHANGE_REQUEST_STATUS.PENDENTE);
    setTypeFilter(q === "pendentes" ? ALL : q);
  };
  const toggleLate = () => { switchTab("fila"); setStatusFilter(CHANGE_REQUEST_STATUS.PENDENTE); setLateOnly((v) => !v); };
  const toggleMine = () => { switchTab("fila"); setStatusFilter(CHANGE_REQUEST_STATUS.PENDENTE); setMineOnly((v) => !v); };

  // ── Deep-link ?request= ──
  // Link de pedido manda para a Fila: o padrão automático da aba "aguardando
  // aprovação" não pode roubar a tela de quem veio por um link.
  useEffect(() => {
    if (!deepLinkId || !canAccess) return;
    tabPickedByUser.current = true;
    setTab("fila");
  }, [deepLinkId, canAccess]);
  useEffect(() => {
    if (!deepLinkId || !canAccess || pendingQuery.isLoading) return;
    const finish = () => {
      setDeepLinkId(null);
      setLocation(scalingHref(BASE_PATH, eventId), { replace: true });
    };
    if (pendingItems.some((r) => r.id === deepLinkId)) { dispatch({ type: "open", id: deepLinkId }); finish(); return; }
    // Não está pendente: amplia o filtro para "todos os status" e espera a lista.
    if (statusFilter !== ALL) { setStatusFilter(ALL); return; }
    if (listQuery.isLoading) return;
    if (items.some((r) => r.id === deepLinkId)) dispatch({ type: "open", id: deepLinkId });
    else toast({ title: "Pedido não encontrado", description: "O pedido do link não existe mais ou não está neste evento.", variant: "destructive" });
    finish();
  }, [deepLinkId, canAccess, pendingQuery.isLoading, pendingItems, statusFilter, listQuery.isLoading, items, eventId, setLocation, toast]);

  // ── Decisões ──
  const closeAll = () => dispatch({ type: "close" });
  const openDetail = (r: ChangeRequestItem) => dispatch({ type: "open", id: r.id });
  /** Abre o pedido já no diálogo pedido (ações da própria linha da fila). */
  const openDetailWithMode = (r: ChangeRequestItem, mode: Exclude<OverlayMode, "closed">) => {
    dispatch({ type: "open", id: r.id });
    dispatch({ type: "mode", mode });
  };
  /** Próximo pendente da fila (na ordem visível), fora o que acabou de ser decidido. */
  const nextPendingAfter = (id: string | null) =>
    filtered.find((r) => r.id !== id && r.status === CHANGE_REQUEST_STATUS.PENDENTE && r.canDecide)
      ?? filtered.find((r) => r.id !== id && r.status === CHANGE_REQUEST_STATUS.PENDENTE)
      ?? null;
  const { approve, review, approveVagas, decideVaga, bypass } = useDecisionMutations({
    onSettledRequest: closeAll,
    onStale: closeAll,
    successAction: () => {
      const next = nextPendingAfter(overlay.id);
      if (!next) return undefined;
      return (
        <ToastAction altText="Abrir próximo pedido pendente" onClick={() => openDetail(next)}>
          Abrir próximo pendente
        </ToastAction>
      );
    },
  });
  const busy = approve.isPending || review.isPending || bypass.isPending;
  /** As decisões sobre a VAGA têm o próprio "ocupado" — não travam a fila de pedidos. */
  const busyVagas = approveVagas.isPending || decideVaga.isPending;

  const reviewKind = overlay.mode === "reajustar" || overlay.mode === "negar" ? overlay.mode : null;
  const submitReview = (body: ReviewBody) => {
    if (!openRequest || !reviewKind) return;
    review.mutate({ id: openRequest.id, kind: reviewKind, body, requestType: openRequest.requestType });
  };

  // ── Render ──
  if (!canAccess) {
    return (
      <PageContainer>
        <div className="bg-card rounded-2xl border border-border p-6">
          <h3 className="text-lg font-semibold text-foreground mb-2">Acesso negado</h3>
          <p className="text-muted-foreground text-sm">Você não tem permissão para acessar a Aprovação de Escala.</p>
        </div>
      </PageContainer>
    );
  }

  const loadError = listQuery.error as ApiError | null;
  const forbidden = loadError?.status === 403;
  /** "Posso decidir" (contador + filtro) só faz sentido para quem decide alguma coisa. */
  const showMineFilter = !isAdmin && !readOnlyMode;

  const tiles: { key: string; label: string; n: number; cls: string; active: boolean; onClick: () => void; hint: string; loading?: boolean }[] = [
    ...(isApprover ? [{
      key: "aguardando",
      label: "Aguardando aprovação",
      n: awaitingRowsAll.length,
      // Vaga validada parada acende igual à pendente parada (mesma severidade).
      cls: stalledAwaiting.count
        ? (stalledAwaiting.severity === "danger" ? "text-red-600" : "text-amber-700")
        : awaitingRowsAll.length ? "text-sky-700" : "",
      active: tab === "aprovacao",
      onClick: () => switchTab("aprovacao"),
      hint: stalledAwaiting.count
        ? `${stalledAwaiting.count} vaga(s) parada(s) há ${STALLED_DAYS} dias ou mais esperando a sua decisão`
        : eventId
          ? "Vagas validadas pela área que dependem da sua decisão"
          : "Vagas validadas pela área, de todos os eventos, que dependem da sua decisão",
      // Nunca 0 enquanto carrega: o tile mostra "…" (o 0 falso foi o achado do dono).
      loading: loadingAwaiting,
    }] : []),
    { key: "pendentes", label: "Pendentes", n: counts.pendentes, cls: "", active: activeQuick === "pendentes" && !lateOnly && !mineOnly && tab === "fila", onClick: () => { setLateOnly(false); setMineOnly(false); applyQuick("pendentes"); }, hint: "Ver todos os pendentes" },
    { key: "ajuste", label: "Ajustes", n: counts.ajuste, cls: "text-amber-700", active: activeQuick === "ajuste", onClick: () => applyQuick("ajuste"), hint: "Filtrar por ajustes pendentes" },
    { key: "inclusao", label: "Inclusões", n: counts.inclusao, cls: "text-emerald-700", active: activeQuick === "inclusao", onClick: () => applyQuick("inclusao"), hint: "Filtrar por inclusões pendentes" },
    { key: "exclusao", label: "Exclusões", n: counts.exclusao, cls: "text-red-700", active: activeQuick === "exclusao", onClick: () => applyQuick("exclusao"), hint: "Filtrar por exclusões pendentes" },
    { key: "late", label: `Atrasados (≥${STALLED_DAYS}d)`, n: counts.atrasados, cls: counts.atrasados ? "text-red-600" : "", active: lateOnly, onClick: toggleLate, hint: `Só pedidos aguardando há ${STALLED_DAYS} dias ou mais` },
    ...(showMineFilter ? [{ key: "mine", label: "Posso decidir", n: counts.meus, cls: "text-primary", active: mineOnly, onClick: toggleMine, hint: "Só os pedidos em que você é o aprovador" }] : []),
  ];

  return (
    <PageContainer fluid>
      <PageHeader
        icon={ShieldCheck}
        title="Aprovação de Escala"
        subtitle="O aprovador de cada função aprova as vagas já validadas pelas áreas e decide os pedidos de ajuste, inclusão e exclusão abertos na Validação de Escala."
        actions={<ScalingModuleNav current="approval" eventId={eventId} />}
      />

      {/* Barra de contexto + filtros */}
      <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3 space-y-3" aria-labelledby="apr-filtros">
        <h2 id="apr-filtros" className="sr-only">Filtros</h2>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <CalendarDays className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
            {loadingEvents ? (
              <div className="h-8 w-[280px] max-w-full rounded-lg bg-slate-100 animate-pulse" aria-hidden="true" />
            ) : (
              <div className="w-[280px] max-w-full">
                <EventCombobox events={activeEvents} value={eventId || ALL} onValueChange={(v) => setEventId(v === ALL ? "" : v)} placeholder="Todos os eventos" showAllOption testId="scaling-approval-event" className="h-8 rounded-lg font-semibold" />
              </div>
            )}
          </div>
          <Label htmlFor="apr-type" className="sr-only">Tipo</Label>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
            <SelectTrigger id="apr-type" className="h-8 min-w-[150px] w-auto rounded-lg text-[13px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os tipos</SelectItem>
              {CHANGE_REQUEST_TYPES.map((t) => <SelectItem key={t} value={t}>{CHANGE_REQUEST_TYPE_LABELS[t]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Label htmlFor="apr-status" className="sr-only">Status</Label>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger id="apr-status" className="h-8 min-w-[150px] w-auto rounded-lg text-[13px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os status</SelectItem>
              {CHANGE_REQUEST_STATUS_VALUES.map((s) => <SelectItem key={s} value={s}>{CHANGE_REQUEST_STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative flex-1 min-w-[220px]">
            <Label htmlFor="apr-search" className="sr-only">Buscar</Label>
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <Input id="apr-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Função, evento, #ID, solicitante ou motivo" className="h-8 pl-8 rounded-lg bg-slate-50 text-[13px]" />
          </div>
        </div>
        {!eventId && isApprover && eventsInSuggestions > 0 && (
          <p className="-mt-1 text-[11px] text-slate-500">
            Mostrando vagas de {eventsInSuggestions} {eventsInSuggestions === 1 ? "evento" : "eventos"} — escolha um evento acima para filtrar.
            {suggestionsTruncated ? ` Só as ${ALL_EVENTS_ROW_LIMIT} que esperam há mais tempo cabem nesta lista.` : ""}
          </p>
        )}

        {/* Contadores = filtros rápidos (clicar de novo limpa) */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Resumo da fila (filtros rápidos)">
          {tiles.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={t.onClick}
              aria-pressed={t.active}
              title={t.hint}
              className={cn(
                "flex-1 min-w-[132px] rounded-xl border px-2.5 py-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                t.active ? "border-primary bg-brand-soft/60 shadow-sm" : "border-slate-100 bg-slate-50/60 hover:border-slate-300 hover:bg-white",
              )}
            >
              <span className={cn("block text-[10px] font-semibold uppercase tracking-[0.05em]", t.active ? "text-primary" : "text-slate-500")}>{t.label}</span>
              <span className={cn("mt-0.5 block text-lg font-bold tabular-nums text-slate-800", t.cls)}>
                {(t.loading ?? pendingQuery.isLoading) ? "…" : t.n}
              </span>
            </button>
          ))}
        </div>
      </section>

      {readOnlyMode && !forbidden && (
        <div role="status" className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-700">
          <EyeOff className="w-4 h-4 shrink-0 text-slate-500" aria-hidden="true" />
          <span><span className="font-semibold">Modo leitura</span> — você acompanha os pedidos, mas não decide. Quem decide é o aprovador de cada função.</span>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => (v === "fila" ? openFilaTab() : switchTab(v as ApprovalTab))} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList className="h-auto rounded-xl bg-slate-100 p-[3px]">
            {/* Caminho normal do fluxo desde 19/08: validar não aprova — a vaga passa por aqui. */}
            {isApprover && (
              <TabsTrigger value="aprovacao" className={TAB_TRIGGER}>
                Vagas aguardando aprovação{awaitingRowsAll.length > 0 ? ` (${awaitingRowsAll.length})` : ""}
              </TabsTrigger>
            )}
            <TabsTrigger value="fila" className={TAB_TRIGGER}>Fila de pedidos</TabsTrigger>
            {isApprover && <TabsTrigger value="paradas" className={TAB_TRIGGER}>Vagas paradas{stalledRows.length > 0 ? ` (${stalledRows.length})` : ""}</TabsTrigger>}
          </TabsList>
          <div className="flex flex-wrap items-center gap-3">
            {tab === "fila" && showMineFilter && (
              <ToggleFilter
                pressed={mineOnly}
                onPressedChange={setMineOnly}
                label={`Só os que posso decidir${counts.meus ? ` (${counts.meus})` : ""}`}
              />
            )}
            {tab === "aprovacao" && showOnlyMineStalled && awaitingRowsAll.some((s) => s.canDecide !== true) && (
              <ToggleFilter
                pressed={onlyMineAwaiting}
                onPressedChange={setOnlyMineAwaiting}
                label={`Só as minhas funções${onlyMineAwaiting && awaitingRows.length !== awaitingRowsAll.length ? ` (${awaitingRowsAll.length - awaitingRows.length} oculta(s))` : ""}`}
              />
            )}
            {tab === "paradas" && showOnlyMineStalled && stalledRowsAll.length > 0 && (
              <ToggleFilter
                pressed={onlyMineStalled}
                onPressedChange={setOnlyMineStalled}
                label={`Só as minhas funções${onlyMineStalled && stalledRows.length !== stalledRowsAll.length ? ` (${stalledRowsAll.length - stalledRows.length} oculta(s))` : ""}`}
              />
            )}
            {/* Única região aria-live da tela — a contagem da aba aberta. */}
            <p className="text-xs text-slate-500" aria-live="polite">
              {tab === "fila"
                ? `${filtered.length} de ${items.length} pedido(s)`
                : tab === "aprovacao"
                  ? `${awaitingRows.length} vaga(s) validada(s) aguardando a sua decisão${!eventId && eventsInSuggestions > 1 ? ` · ${eventsInSuggestions} eventos` : ""}`
                  : `${stalledRows.length} vaga(s) sem validação da área há ${STALLED_DAYS} dias ou mais`}
            </p>
          </div>
        </div>

        {isApprover && (
          <TabsContent value="aprovacao" className="mt-0 space-y-3">
            {/* Sem evento a aba mostra as vagas de TODOS os eventos — o estado
                vazio só aparece quando está vazio DE VERDADE (regra do dono). */}
            {suggestionsQuery.isLoading ? (
              <LoadingState count={4} label="Carregando vagas…" />
            ) : suggestionsQuery.error ? (
              <ErrorState title="Não foi possível carregar as vagas" description={apiErrorMessage(suggestionsQuery.error, "Tente novamente.")} onRetry={() => suggestionsQuery.refetch()} />
            ) : (
              <>
                {stalledAwaiting.count > 0 && (
                  <p role="status" className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-2 text-xs",
                    stalledAwaiting.severity === "danger"
                      ? "border-red-200 bg-red-50 text-red-800"
                      : "border-amber-200 bg-amber-50 text-amber-800",
                  )}>
                    <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      <span className="font-semibold">{stalledAwaiting.count} vaga(s) validada(s) parada(s)</span> há {STALLED_DAYS} dias ou mais esperando aprovação
                      {stalledAwaiting.worst > 0 ? ` (a mais antiga há ${stalledAwaiting.worst} ${stalledAwaiting.worst === 1 ? "dia" : "dias"})` : ""} — a área já fez a parte dela.
                    </span>
                  </p>
                )}
                {awaitingRows.length === 0 && awaitingRowsAll.length > 0 ? (
                  <EmptyState
                    icon={CheckCircle2}
                    title="Nenhuma vaga aguardando aprovação nas suas funções"
                    description={`Há ${awaitingRowsAll.length} vaga(s) aguardando em funções de outros aprovadores. Desmarque "Só as minhas funções" para vê-las.`}
                  />
                ) : (
                  <AwaitingApproval
                    rows={awaitingRows}
                    functionNameById={functionNameById}
                    userNameById={userNameById}
                    approverNamesFor={(row) => approverNamesByFunctionId.get(row.functionId) ?? []}
                    showEvent={!eventId}
                    busy={busyVagas}
                    onApprove={(selectedRows) => approveVagas.mutate({ ids: selectedRows.map((r) => r.id) })}
                    // mutateAsync: o diálogo de reprovar/devolver só fecha (e só
                    // joga fora o comentário) quando o servidor confirma.
                    onDecide={(row, kind, comment) => decideVaga.mutateAsync({ inclusionId: row.id, kind, comment })}
                  />
                )}
              </>
            )}
          </TabsContent>
        )}

        <TabsContent value="fila" className="mt-0 space-y-3">
          {listQuery.isLoading ? (
            <LoadingState count={6} label="Carregando pedidos…" />
          ) : loadError ? (
            <ErrorState
              // 403 aqui = o perfil não vê a fila por papel E não é aprovador de
              // nenhuma função. Nada de mandar o usuário "virar aprovador": para
              // os perfis de leitura isso seria o oposto da matriz de permissões.
              title={forbidden ? "Sem pedidos para você nesta tela" : "Não foi possível carregar os pedidos"}
              description={forbidden
                ? "Seu perfil não acompanha a fila de pedidos. Se você deveria decidir os pedidos de alguma função, fale com o administrador."
                : apiErrorMessage(loadError, "Verifique sua conexão e tente novamente.")}
              onRetry={forbidden ? undefined : () => listQuery.refetch()}
            />
          ) : filtered.length === 0 ? (
            hasActiveFilters || items.length > 0 ? (
              <EmptyState variant="filtered" title="Nenhum pedido com esses filtros" onClearFilters={clearFilters} />
            ) : (
              <EmptyState icon={CheckCircle2} title="Nenhum pedido pendente" description={eventId ? "Não há pedidos aguardando decisão neste evento." : "Não há pedidos aguardando decisão. Bom trabalho!"} />
            )
          ) : (
            <RequestQueue
              items={filtered}
              onOpen={openDetail}
              showEvent={!eventId}
              busy={busy}
              // Decidir direto da fila: abre o pedido e já vai para o diálogo —
              // "Cancelar"/"Voltar" cai no detalhe, o mesmo caminho do Sheet.
              onApprove={(r) => openDetailWithMode(r, "approve")}
              onReajustar={(r) => openDetailWithMode(r, "reajustar")}
              onNegar={(r) => openDetailWithMode(r, "negar")}
            />
          )}
        </TabsContent>

        {isApprover && (
          <TabsContent value="paradas" className="mt-0 space-y-3">
            {/* Idem: "Vagas paradas" não exige mais escolher um evento. */}
            {suggestionsQuery.isLoading ? (
              <LoadingState count={4} label="Carregando vagas…" />
            ) : suggestionsQuery.error ? (
              <ErrorState title="Não foi possível carregar as vagas" description={apiErrorMessage(suggestionsQuery.error, "Tente novamente.")} onRetry={() => suggestionsQuery.refetch()} />
            ) : (
              <>
                {stalledRows.length === 0 && stalledRowsAll.length > 0 ? (
                  <EmptyState
                    icon={CheckCircle2}
                    title="Nenhuma vaga parada nas suas funções"
                    description={`Há ${stalledRowsAll.length} vaga(s) parada(s) em funções de outros aprovadores. Desmarque "Só as minhas funções" para vê-las.`}
                  />
                ) : (
                  <StalledSuggestions
                    rows={stalledRows}
                    functionNameById={functionNameById}
                    canActOn={(row) => row.canDecide === true}
                    approverNamesFor={(row) => approverNamesByFunctionId.get(row.functionId) ?? []}
                    showEvent={!eventId}
                    busy={busy}
                    onDecide={(row, kind, comment) => bypass.mutate({ inclusionId: row.id, kind, comment })}
                  />
                )}
              </>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* Nível 2 — detalhe */}
      <RequestDetailSheet
        open={overlay.mode !== "closed"}
        onOpenChange={(o) => { if (!o) closeAll(); }}
        request={openRequest}
        busy={busy}
        onApprove={() => dispatch({ type: "mode", mode: "approve" })}
        onReajustar={() => dispatch({ type: "mode", mode: "reajustar" })}
        onNegar={() => dispatch({ type: "mode", mode: "negar" })}
      />
      <ApproveRequestDialog
        open={overlay.mode === "approve"}
        onOpenChange={(o) => { if (!o) dispatch({ type: "back" }); }}
        request={openRequest}
        pending={approve.isPending}
        onConfirm={() => openRequest && approve.mutate({ id: openRequest.id })}
      />
      <ReviewRequestDialog
        open={reviewKind !== null}
        onOpenChange={(o) => { if (!o) dispatch({ type: "back" }); }}
        kind={reviewKind ?? "reajustar"}
        request={openRequest}
        inclusion={openInclusion}
        event={openRequest ? eventById.get(openRequest.eventId) ?? selectedEvent : selectedEvent}
        pending={review.isPending}
        onSubmit={submitReview}
      />
    </PageContainer>
  );
}
