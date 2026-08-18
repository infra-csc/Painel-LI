import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EventCombobox from "@/components/ui/event-combobox";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { usePageTitle } from "@/components/common/use-page-title";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage, cn } from "@/lib/utils";
import { normalizeRole } from "@shared/roles";
import type { Event } from "@shared/schema";
import {
  CHANGE_REQUEST_STATUS, CHANGE_REQUEST_STATUS_LABELS, CHANGE_REQUEST_STATUS_VALUES,
  CHANGE_REQUEST_TYPES, CHANGE_REQUEST_TYPE_LABELS, SUGESTAO_STATUS, daysPending,
  type ChangeRequestType,
} from "@shared/scaling-validation-rules";
import { SUGGESTIONS_QUERY_KEY, type ApiError, type FunctionWithManagers, type SuggestionRow } from "@/components/scaling-validation/types";
import { APPROVAL_QUERY_KEYS, type ChangeRequestItem, type ReviewBody } from "@/components/scaling-approval/types";
import { RequestQueue } from "@/components/scaling-approval/request-queue";
import { RequestDetailSheet } from "@/components/scaling-approval/request-detail-sheet";
import { ApproveRequestDialog, ReviewRequestDialog } from "@/components/scaling-approval/decision-dialogs";
import { StalledSuggestions } from "@/components/scaling-approval/stalled-suggestions";
import { useDecisionMutations } from "@/components/scaling-approval/use-decisions";

const ALL = "all";
const LAST_EVENT_KEY = "scaling-approval:last-event";

type StatusFilter = typeof ALL | (typeof CHANGE_REQUEST_STATUS_VALUES)[number];
type TypeFilter = typeof ALL | ChangeRequestType;

function requestsUrl(status: string | undefined, eventId: string | undefined): string {
  const qs = new URLSearchParams();
  if (status) qs.set("status", status);
  if (eventId) qs.set("eventId", eventId);
  const s = qs.toString();
  return s ? `${APPROVAL_QUERY_KEYS.requests}?${s}` : APPROVAL_QUERY_KEYS.requests;
}

export default function ScalingApprovalPage() {
  usePageTitle("Aprovação de Escala");
  const { user } = useAuth();
  const isAdmin = normalizeRole(user?.role) === "admin";
  const canAccess = hasPermission(user, "canAccessScalingApproval");

  // ── Estado ──
  const [eventId, setEventId] = useState(() => (typeof window !== "undefined" ? localStorage.getItem(LAST_EVENT_KEY) ?? "" : ""));
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(ALL);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(CHANGE_REQUEST_STATUS.PENDENTE);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"fila" | "paradas">("fila");
  const [openId, setOpenId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [reviewKind, setReviewKind] = useState<"reajustar" | "negar" | null>(null);

  useEffect(() => { localStorage.setItem(LAST_EVENT_KEY, eventId); }, [eventId]);

  // ── Dados ──
  const { data: events, isLoading: loadingEvents } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: functions } = useQuery<FunctionWithManagers[]>({ queryKey: ["/api/functions"] });
  const activeEvents = useMemo(() => (events ?? []).filter((e) => e.status !== "excluido" && e.status !== "excluído"), [events]);
  const selectedEvent = activeEvents.find((e) => e.id === eventId) ?? null;
  const functionNameById = useMemo(() => new Map((functions ?? []).map((f) => [f.id, f.name])), [functions]);
  const eventById = useMemo(() => new Map(activeEvents.map((e) => [e.id, e])), [activeEvents]);

  /**
   * Funções em que o usuário pode decidir sem validação da área (bypass).
   * O servidor confere `roleFor(functionId, actor)` + canApproveRequest → 403 fora disso.
   * Admin → todas; senão, funções onde ele é "aprovador" nos managers.
   */
  const approverFunctionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const f of functions ?? []) {
      if (isAdmin || f.managers?.some((m) => m.userId === user?.id && m.role === "aprovador")) ids.add(f.id);
    }
    return ids;
  }, [functions, isAdmin, user?.id]);
  /** Nomes dos aprovadores por função (para explicar quem decide nas linhas sem permissão). */
  const approverNamesByFunctionId = useMemo(
    () => new Map((functions ?? []).map((f) => [f.id, (f.managers ?? []).filter((m) => m.role === "aprovador").map((m) => m.userName).filter(Boolean)])),
    [functions],
  );
  /** Admin ou aprovador de alguma função — mostra a aba "Vagas paradas". */
  const isApprover = isAdmin || approverFunctionIds.size > 0;
  const [onlyMine, setOnlyMine] = useState(true);

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
  const openRequest = useMemo(() => items.find((r) => r.id === openId) ?? pendingItems.find((r) => r.id === openId) ?? null, [items, pendingItems, openId]);
  const suggestionsEventId = tab === "paradas" ? eventId : (openRequest?.requestType === "ajuste" && openRequest.teamInclusionId ? openRequest.eventId : "");
  const suggestionsQuery = useQuery<SuggestionRow[]>({
    queryKey: [SUGGESTIONS_QUERY_KEY, suggestionsEventId],
    queryFn: async () => (await apiRequest("GET", `${SUGGESTIONS_QUERY_KEY}?eventId=${encodeURIComponent(suggestionsEventId)}`)).json(),
    enabled: canAccess && !!suggestionsEventId,
    staleTime: 15_000,
  });
  const openInclusion = useMemo(
    () => (openRequest?.teamInclusionId ? (suggestionsQuery.data ?? []).find((s) => s.id === openRequest.teamInclusionId) ?? null : null),
    [suggestionsQuery.data, openRequest?.teamInclusionId],
  );
  const stalledRowsAll = useMemo(
    () => (suggestionsQuery.data ?? [])
      .filter((s) => s.status === SUGESTAO_STATUS.PENDENTE && !s.pendingRequest && s.daysPending >= 3)
      .sort((a, b) => b.daysPending - a.daysPending || (a.inclusionNumber ?? 0) - (b.inclusionNumber ?? 0)),
    [suggestionsQuery.data],
  );
  // Filtro "Só as minhas funções" (irrelevante para admin, que aprova todas).
  const showOnlyMineFilter = !isAdmin;
  const stalledRows = useMemo(
    () => (showOnlyMineFilter && onlyMine ? stalledRowsAll.filter((s) => approverFunctionIds.has(s.functionId)) : stalledRowsAll),
    [stalledRowsAll, showOnlyMineFilter, onlyMine, approverFunctionIds],
  );

  // ── Filtros locais ──
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((r) => typeFilter === ALL || r.requestType === typeFilter)
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
  }, [items, typeFilter, search]);
  const hasActiveFilters = search.trim() !== "" || typeFilter !== ALL || statusFilter !== CHANGE_REQUEST_STATUS.PENDENTE;
  const clearFilters = () => { setSearch(""); setTypeFilter(ALL); setStatusFilter(CHANGE_REQUEST_STATUS.PENDENTE); };

  // ── Contadores (pendentes) ──
  const counts = useMemo(() => ({
    pendentes: pendingItems.length,
    ajuste: pendingItems.filter((r) => r.requestType === "ajuste").length,
    inclusao: pendingItems.filter((r) => r.requestType === "inclusao").length,
    exclusao: pendingItems.filter((r) => r.requestType === "exclusao").length,
    atrasados: pendingItems.filter((r) => daysPending(r.createdAt) >= 3).length,
    meus: pendingItems.filter((r) => r.canDecide).length,
  }), [pendingItems]);

  // ── Decisões ──
  const closeAll = () => { setApproveOpen(false); setReviewKind(null); setSheetOpen(false); };
  const { approve, review, bypass } = useDecisionMutations({ onSettledRequest: closeAll });
  const busy = approve.isPending || review.isPending || bypass.isPending;

  const openDetail = (r: ChangeRequestItem) => { setOpenId(r.id); setSheetOpen(true); };
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

  return (
    <PageContainer fluid>
      <PageHeader
        icon={ShieldCheck}
        title="Aprovação de Escala"
        subtitle="O aprovador de cada função decide os pedidos de ajuste, inclusão e exclusão abertos pelas áreas na Validação de Escala."
      />

      {/* Filtros + contadores */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4" aria-labelledby="apr-filtros">
        <h2 id="apr-filtros" className="sr-only">Filtros</h2>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)] items-end">
          <div className="space-y-1">
            <Label className="text-[11px] text-slate-500">Evento</Label>
            {loadingEvents ? (
              <div className="h-9 rounded-lg bg-slate-100 animate-pulse" aria-hidden="true" />
            ) : (
              <EventCombobox events={activeEvents} value={eventId || ALL} onValueChange={(v) => setEventId(v === ALL ? "" : v)} placeholder="Todos os eventos" showAllOption testId="scaling-approval-event" />
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="apr-type" className="text-[11px] text-slate-500">Tipo</Label>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
              <SelectTrigger id="apr-type" className="h-9 rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os tipos</SelectItem>
                {CHANGE_REQUEST_TYPES.map((t) => <SelectItem key={t} value={t}>{CHANGE_REQUEST_TYPE_LABELS[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="apr-status" className="text-[11px] text-slate-500">Status</Label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger id="apr-status" className="h-9 rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os status</SelectItem>
                {CHANGE_REQUEST_STATUS_VALUES.map((s) => <SelectItem key={s} value={s}>{CHANGE_REQUEST_STATUS_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="apr-search" className="text-[11px] text-slate-500">Buscar</Label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <Input id="apr-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Função, evento, #ID, solicitante ou motivo" className="h-9 pl-8 rounded-lg" />
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
          {[
            ["Pendentes", counts.pendentes, ""],
            ["Ajustes", counts.ajuste, "text-amber-700"],
            ["Inclusões", counts.inclusao, "text-emerald-700"],
            ["Exclusões", counts.exclusao, "text-red-700"],
            ["Atrasados (≥3d)", counts.atrasados, counts.atrasados ? "text-red-600" : ""],
            ["Posso decidir", counts.meus, "text-primary"],
          ].map(([label, n, cls]) => (
            <div key={String(label)} className="rounded-xl border border-slate-100 bg-slate-50/60 px-2 py-2">
              <dt className="text-[10px] uppercase tracking-wide text-slate-400">{label}</dt>
              <dd className={cn("text-lg font-bold tabular-nums text-slate-800", cls as string)}>{pendingQuery.isLoading ? "…" : n}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "fila" | "paradas")} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList className="rounded-xl">
            <TabsTrigger value="fila" className="rounded-lg">Fila de pedidos</TabsTrigger>
            {isApprover && <TabsTrigger value="paradas" className="rounded-lg">Vagas paradas{eventId && stalledRows.length > 0 ? ` (${stalledRows.length})` : ""}</TabsTrigger>}
          </TabsList>
          <p className="text-[11px] text-slate-400" aria-live="polite">
            {tab === "fila" ? `${filtered.length} de ${items.length} pedido(s)` : "Vagas que a área não validou há 3 dias ou mais"}
          </p>
        </div>

        <TabsContent value="fila" className="mt-0 space-y-3">
          {listQuery.isLoading ? (
            <LoadingState count={6} label="Carregando pedidos…" />
          ) : loadError ? (
            <div className="rounded-2xl border border-red-200 bg-white p-6 text-center">
              <p className="text-sm font-semibold text-slate-700">{forbidden ? "Você não é aprovador de nenhuma função" : "Não foi possível carregar os pedidos"}</p>
              <p className="text-xs text-slate-400 mt-1">
                {forbidden ? "Peça ao administrador para cadastrar você como aprovador em Funções." : apiErrorMessage(loadError, "Verifique sua conexão e tente novamente.")}
              </p>
              {!forbidden && <Button variant="outline" size="sm" className="mt-3" onClick={() => listQuery.refetch()}>Tentar novamente</Button>}
            </div>
          ) : filtered.length === 0 ? (
            hasActiveFilters || items.length > 0 ? (
              <EmptyState variant="filtered" title="Nenhum pedido com esses filtros" onClearFilters={clearFilters} />
            ) : (
              <EmptyState icon={CheckCircle2} title="Nenhum pedido pendente" description={eventId ? "Não há pedidos aguardando decisão neste evento." : "Não há pedidos aguardando decisão. Bom trabalho!"} />
            )
          ) : (
            <RequestQueue items={filtered} onOpen={openDetail} showEvent={!eventId} />
          )}
        </TabsContent>

        {isApprover && (
          <TabsContent value="paradas" className="mt-0 space-y-3">
            {!eventId ? (
              <EmptyState icon={ClipboardCheck} title="Selecione um evento" description="As vagas paradas são listadas por evento. Escolha um evento no filtro acima." />
            ) : suggestionsQuery.isLoading ? (
              <LoadingState count={4} label="Carregando vagas…" />
            ) : suggestionsQuery.error ? (
              <div className="rounded-2xl border border-red-200 bg-white p-6 text-center">
                <p className="text-sm font-semibold text-slate-700">Não foi possível carregar as vagas</p>
                <p className="text-xs text-slate-400 mt-1">{apiErrorMessage(suggestionsQuery.error, "Tente novamente.")}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => suggestionsQuery.refetch()}>Tentar novamente</Button>
              </div>
            ) : (
              <>
                {showOnlyMineFilter && stalledRowsAll.length > 0 && (
                  <div className="flex items-center justify-end gap-2 text-xs text-slate-600">
                    <input
                      id="apr-only-mine"
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-slate-300 accent-primary"
                      checked={onlyMine}
                      onChange={(e) => setOnlyMine(e.target.checked)}
                    />
                    <label htmlFor="apr-only-mine" className="cursor-pointer select-none">
                      Só as minhas funções{onlyMine && stalledRows.length !== stalledRowsAll.length ? ` (${stalledRowsAll.length - stalledRows.length} oculta(s))` : ""}
                    </label>
                  </div>
                )}
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
                    canActOn={(row) => isAdmin || approverFunctionIds.has(row.functionId)}
                    approverNamesFor={(row) => approverNamesByFunctionId.get(row.functionId) ?? []}
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
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        request={openRequest}
        busy={busy}
        onApprove={() => setApproveOpen(true)}
        onReajustar={() => setReviewKind("reajustar")}
        onNegar={() => setReviewKind("negar")}
      />
      <ApproveRequestDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        request={openRequest}
        pending={approve.isPending}
        onConfirm={() => openRequest && approve.mutate({ id: openRequest.id })}
      />
      <ReviewRequestDialog
        open={reviewKind !== null}
        onOpenChange={(o) => { if (!o) setReviewKind(null); }}
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
