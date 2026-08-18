import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { CheckCheck, ClipboardCheck, Eye, EyeOff, History, Info, PencilLine, Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import EventCombobox from "@/components/ui/event-combobox";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { usePageTitle } from "@/components/common/use-page-title";
import type { SortConfig } from "@/components/common/sortable-header";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage, cn, formatDateRange } from "@/lib/utils";
import { scalingHref, useScalingEvent } from "@/lib/use-scaling-event";
import { normalizeRole } from "@shared/roles";
import type { Event } from "@shared/schema";
import { SUGESTAO_STATUS, STALLED_DAYS, pendingSeverity } from "@shared/scaling-validation-rules";
import { SuggestionsList, periodLabel, type SuggestionSortField } from "@/components/scaling-validation/suggestions-list";
import { ScheduleBoard } from "@/components/scaling-validation/schedule-board";
import { AdjustRequestDialog, DeleteRequestDialog, IncludeRequestDialog } from "@/components/scaling-validation/change-request-dialogs";
import { SuggestionDetailDrawer } from "@/components/scaling-validation/suggestion-detail-drawer";
import { ScalingModuleNav } from "@/components/scaling-validation/scaling-module-nav";
import {
  SUGGESTIONS_QUERY_KEY, canActOn, invalidateScalingQueries, workDaysOf,
  type ApiError, type FunctionWithManagers, type SuggestionRow, type ValidateResult,
} from "@/components/scaling-validation/types";

const ALL = "all";
const BASE_PATH = "/scaling-validation";
const PULSE_MS = 2000;

export default function ScalingValidationPage() {
  usePageTitle("Validação de Escala");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = normalizeRole(user?.role) === "admin";
  const canAccess = hasPermission(user, "canAccessScalingValidation");
  /** Papel que VALIDA (matriz §7: admin e área responsável). Logística/compras/RH só acompanham. */
  const canValidateByRole = hasPermission(user, "canEditScalingValidation");

  // ── Estado ──
  const { eventId, setEventId, sanitize } = useScalingEvent(BASE_PATH);
  const [tab, setTab] = useState<"lista" | "escala">("lista");
  const [search, setSearch] = useState("");
  const [functionFilter, setFunctionFilter] = useState(ALL);
  const [areaFilter, setAreaFilter] = useState(ALL);
  const [onlyMine, setOnlyMine] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig<SuggestionSortField> | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmValidate, setConfirmValidate] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [includeOpen, setIncludeOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // Trocou de evento: limpa a seleção (evita agir em vaga que sumiu da lista).
  useEffect(() => { setSelected(new Set()); setDetailId(null); }, [eventId]);
  useEffect(() => () => { if (pulseTimer.current) clearTimeout(pulseTimer.current); }, []);

  // ── Dados ──
  const { data: events, isLoading: loadingEvents } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: functions, isLoading: loadingFunctions } = useQuery<FunctionWithManagers[]>({ queryKey: ["/api/functions"] });
  const suggestionsQuery = useQuery<SuggestionRow[]>({
    queryKey: [SUGGESTIONS_QUERY_KEY, eventId],
    queryFn: async () => (await apiRequest("GET", `${SUGGESTIONS_QUERY_KEY}?eventId=${encodeURIComponent(eventId)}`)).json(),
    enabled: !!eventId,
    staleTime: 15_000,
  });
  const rows = useMemo(() => suggestionsQuery.data ?? [], [suggestionsQuery.data]);
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  const activeEvents = useMemo(() => (events ?? []).filter((e) => e.status !== "excluido" && e.status !== "excluído"), [events]);
  useEffect(() => { if (events) sanitize(activeEvents.map((e) => e.id)); }, [events, activeEvents, sanitize]);
  const selectedEvent = activeEvents.find((e) => e.id === eventId);
  const functionNameById = useMemo(() => new Map((functions ?? []).map((f) => [f.id, f.name])), [functions]);

  /** Funções em que o usuário é validador (ou todas, se admin) — para "Incluir escalação". */
  const requestableFunctions = useMemo(() => {
    const list = functions ?? [];
    if (isAdmin) return list;
    return list.filter((f) => f.managers?.some((m) => m.userId === user?.id && m.role === "validador"));
  }, [functions, isAdmin, user?.id]);
  const isValidatorOfAny = isAdmin || requestableFunctions.length > 0;
  /**
   * Modo leitura por DUAS razões, unificadas numa mensagem só (a mais específica
   * vence): o papel não valida (§7) ou o papel valida mas o usuário não é
   * validador de nenhuma função. O servidor barra os dois casos; a tela some com
   * checkboxes, barra de ações e "Incluir escalação" para não prometer o 403.
   * Quem É validador cadastrado de alguma função valida SEMPRE, qualquer que
   * seja o papel (em produção existe validador com papel `purchasing`) — o
   * cadastro em Funções é a fonte de verdade, igual ao servidor.
   */
  const readOnlyMode = !isValidatorOfAny && (!canValidateByRole || !!functions);
  const readOnlyReason = !canValidateByRole
    ? "seu perfil acompanha a validação das áreas, mas não valida vagas nem abre pedidos."
    : "você não é validador de nenhuma função. Dá para consultar a escala, mas não validar nem pedir mudanças.";

  // ── Filtros ──
  const areas = useMemo(() => Array.from(new Set(rows.map((r) => r.area).filter((a): a is string => !!a))).sort((a, b) => a.localeCompare(b, "pt-BR")), [rows]);
  const functionsInEvent = useMemo(() => {
    const ids = new Set(rows.map((r) => r.functionId));
    return (functions ?? []).filter((f) => ids.has(f.id)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
  }, [rows, functions]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const nameOf = (r: SuggestionRow) => functionNameById.get(r.functionId) ?? "";
    const periodKey = (r: SuggestionRow) => workDaysOf(r)[0] ?? String(r.scheduleStartDate ?? "").slice(0, 10) ?? "";
    const list = rows
      .filter((r) => functionFilter === ALL || r.functionId === functionFilter)
      .filter((r) => areaFilter === ALL || r.area === areaFilter)
      .filter((r) => !onlyMine || r.canEdit)
      .filter((r) => {
        if (!q) return true;
        return nameOf(r).toLowerCase().includes(q) || String(r.inclusionNumber).includes(q) || (r.area ?? "").toLowerCase().includes(q) || (r.observations ?? "").toLowerCase().includes(q);
      });
    const byDefault = (a: SuggestionRow, b: SuggestionRow) => nameOf(a).localeCompare(nameOf(b), "pt-BR") || (a.inclusionNumber ?? 0) - (b.inclusionNumber ?? 0);
    if (!sortConfig) return list.sort(byDefault);
    const dir = sortConfig.direction === "asc" ? 1 : -1;
    const cmp: Record<SuggestionSortField, (a: SuggestionRow, b: SuggestionRow) => number> = {
      id: (a, b) => (a.inclusionNumber ?? 0) - (b.inclusionNumber ?? 0),
      function: byDefault,
      period: (a, b) => periodKey(a).localeCompare(periodKey(b)) || byDefault(a, b),
    };
    return list.sort((a, b) => dir * cmp[sortConfig.field](a, b));
  }, [rows, functionFilter, areaFilter, onlyMine, search, functionNameById, sortConfig]);

  const onSort = (field: SuggestionSortField) =>
    setSortConfig((prev) => (prev?.field === field ? (prev.direction === "asc" ? { field, direction: "desc" } : null) : { field, direction: "asc" }));

  const hasActiveFilters = search.trim() !== "" || functionFilter !== ALL || areaFilter !== ALL || onlyMine;
  const clearFilters = () => { setSearch(""); setFunctionFilter(ALL); setAreaFilter(ALL); setOnlyMine(false); };

  // ── Seleção ──
  // Selecionáveis no evento inteiro (a seleção sobrevive ao filtro) e só as visíveis (para o "selecionar todas").
  const selectableAll = useMemo(
    () => new Set<string>(readOnlyMode ? [] : rows.filter(canActOn).map((r) => r.id)),
    [rows, readOnlyMode],
  );
  const visibleIds = useMemo(() => new Set(filteredRows.map((r) => r.id)), [filteredRows]);
  const selectableVisible = useMemo(() => new Set(filteredRows.filter((r) => selectableAll.has(r.id)).map((r) => r.id)), [filteredRows, selectableAll]);
  const effectiveSelected = useMemo(() => Array.from(selected).filter((id) => selectableAll.has(id)), [selected, selectableAll]);
  const selectedRows = useMemo(() => effectiveSelected.map((id) => rowById.get(id)).filter((r): r is SuggestionRow => !!r), [effectiveSelected, rowById]);
  const hiddenSelectedCount = useMemo(() => effectiveSelected.filter((id) => !visibleIds.has(id)).length, [effectiveSelected, visibleIds]);
  const singleSelected = selectedRows.length === 1 ? selectedRows[0] : null;
  // Em modo leitura não há seleção nem barra de ações — nem para o eventual
  // usuário que o servidor deixaria validar: a matriz §7 é quem manda na tela.
  const anyEditable = !readOnlyMode && rows.some((r) => r.canEdit);
  const detailRow = detailId ? rowById.get(detailId) ?? null : null;

  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => {
    const all = Array.from(selectableVisible).every((id) => selected.has(id));
    setSelected((prev) => {
      const n = new Set(prev);
      selectableVisible.forEach((id) => { if (all) n.delete(id); else n.add(id); });
      return n;
    });
  };

  const pulseRow = (id: string | null) => {
    if (!id) return;
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    setPulseId(id);
    pulseTimer.current = setTimeout(() => setPulseId(null), PULSE_MS);
  };
  const onRequestSent = (inclusionId: string | null) => {
    setSelected(new Set());
    pulseRow(inclusionId);
  };

  // ── Resumo ──
  const counts = useMemo(() => ({
    total: rows.length,
    pendentes: rows.filter((r) => r.status === SUGESTAO_STATUS.PENDENTE).length,
    comPedido: rows.filter((r) => r.status === SUGESTAO_STATUS.AJUSTE).length,
    minhas: selectableAll.size,
    atrasadas: rows.filter((r) => r.status === SUGESTAO_STATUS.PENDENTE && pendingSeverity(r.daysPending) !== "ok").length,
  }), [rows, selectableAll]);

  // ── Validar em massa ──
  const validateMutation = useMutation({
    mutationFn: async (ids: string[]) => (await apiRequest("POST", "/api/scaling-suggestions/validate", { inclusionIds: ids })).json() as Promise<ValidateResult>,
    onSuccess: (res) => {
      invalidateScalingQueries(queryClient);
      setSelected(new Set());
      setConfirmValidate(false);
      // Volta ao topo mantendo filtros (a lista encolhe; o usuário vê o resumo atualizado).
      if (topRef.current) topRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      else window.scrollTo({ top: 0, behavior: "smooth" });
      const okN = res.ok?.length ?? 0;
      const skipped = res.skipped ?? [];
      if (okN > 0) {
        toast({ title: `${okN} vaga(s) validada(s)`, description: "Elas viraram Inclusão e seguem para a escalação." });
      }
      if (skipped.length > 0) {
        const reasons = Array.from(new Set(skipped.map((s) => s.reason))).slice(0, 3).join(" · ");
        toast({ title: `${skipped.length} vaga(s) não validada(s)`, description: reasons, variant: "destructive" });
      }
    },
    onError: (err: ApiError) => {
      setConfirmValidate(false);
      toast({ title: "Não foi possível validar", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" });
    },
  });

  // ── Render ──
  if (!canAccess) {
    return (
      <PageContainer>
        <div className="bg-card rounded-2xl border border-border p-6">
          <h3 className="text-lg font-semibold text-foreground mb-2">Acesso negado</h3>
          <p className="text-muted-foreground text-sm">Você não tem permissão para acessar a Validação de Escala.</p>
        </div>
      </PageContainer>
    );
  }

  const loadError = suggestionsQuery.error as ApiError | null;
  const includeDisabledReason = !eventId
    ? "Selecione um evento primeiro"
    : loadingFunctions ? "Carregando funções…"
      : requestableFunctions.length === 0 ? (isAdmin ? "Nenhuma função cadastrada" : "Você não é validador de nenhuma função")
        : null;
  const nSel = effectiveSelected.length;

  const KPI_TOOLTIPS: Record<string, string> = {
    Atrasadas: `Vagas aguardando há ${STALLED_DAYS} dias ou mais.`,
    "Minhas pendentes": "Vagas que você pode validar agora (sem pedido pendente).",
    "Com pedido": "Vagas com pedido de ajuste/exclusão aguardando o aprovador.",
  };

  return (
    <PageContainer fluid className="pb-24">
      <div ref={topRef} aria-hidden="true" />
      <PageHeader
        icon={ClipboardCheck}
        title="Validação de escala"
        subtitle="Cada área confere as vagas sugeridas pela logística: valida, pede ajuste ou exclusão, ou inclui vagas novas."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ScalingModuleNav current="validation" eventId={eventId} />
            {/* Em modo leitura o botão nem aparece — o banner já explica o porquê. */}
            {!readOnlyMode && (
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* span: botão desabilitado não dispara eventos de hover */}
                  <span tabIndex={includeDisabledReason ? 0 : -1} className="inline-flex">
                    <Button type="button" size="sm" className="rounded-lg bg-primary hover:bg-primary-hover" disabled={!!includeDisabledReason} onClick={() => setIncludeOpen(true)}>
                      <Plus className="w-4 h-4 mr-1.5" /> Incluir escalação
                    </Button>
                  </span>
                </TooltipTrigger>
                {includeDisabledReason && <TooltipContent side="bottom" className="text-xs">{includeDisabledReason}</TooltipContent>}
              </Tooltip>
            )}
          </div>
        }
      />

      {readOnlyMode && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <EyeOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span><span className="font-semibold">Modo leitura</span> — {readOnlyReason}</span>
        </div>
      )}

      {/* Evento */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3" aria-labelledby="val-evento">
        <h2 id="val-evento" className="text-xs font-bold uppercase tracking-wide text-slate-500">Evento</h2>
        <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start">
          <div className="space-y-1.5">
            {loadingEvents ? (
              <div className="h-9 rounded-lg bg-slate-100 animate-pulse" aria-hidden="true" />
            ) : (
              <EventCombobox events={activeEvents} value={eventId} onValueChange={(v) => setEventId(v === ALL ? "" : v)} placeholder="Selecione um evento" showAllOption={false} testId="scaling-validation-event" />
            )}
            {selectedEvent && (
              <p className="text-xs text-slate-500">
                Período: <span className="font-mono">{formatDateRange(selectedEvent.startDate, selectedEvent.endDate, { withYear: true })}</span>
                {selectedEvent.location ? ` · ${selectedEvent.location}` : ""}
              </p>
            )}
          </div>
          {selectedEvent?.observations && (
            <p className="text-xs text-slate-600 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 whitespace-pre-wrap">
              <span className="font-semibold text-slate-500">Comentários da logística: </span>{selectedEvent.observations}
            </p>
          )}
        </div>
      </section>

      {/* KPIs */}
      {eventId && rows.length > 0 && (
        <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-center" aria-label="Resumo do evento">
          {[
            ["Vagas", counts.total, ""],
            ["Aguardando", counts.pendentes, "text-amber-700"],
            ["Com pedido", counts.comPedido, "text-violet-700"],
            ["Atrasadas", counts.atrasadas, counts.atrasadas ? "text-red-600" : ""],
            ["Minhas pendentes", counts.minhas, "text-primary"],
          ].map(([label, n, cls]) => {
            const tip = KPI_TOOLTIPS[String(label)];
            const term = (
              <span tabIndex={tip ? 0 : undefined} className={cn("inline-flex items-center justify-center gap-1", tip && "cursor-help")}>
                {label}{tip && <Info className="w-3 h-3 text-slate-400" aria-hidden="true" />}
              </span>
            );
            return (
              <div key={String(label)} className="rounded-xl border border-slate-200 bg-white px-2 py-2">
                <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                  {tip ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{term}</TooltipTrigger>
                      <TooltipContent side="top" className="text-xs max-w-xs">{tip}</TooltipContent>
                    </Tooltip>
                  ) : term}
                </dt>
                <dd className={cn("text-lg font-bold tabular-nums text-slate-800", cls as string)}>{n}</dd>
              </div>
            );
          })}
        </dl>
      )}

      {!eventId ? (
        <EmptyState title="Selecione um evento" description="A escala sugerida é por evento. Escolha um acima para ver as vagas." />
      ) : suggestionsQuery.isLoading || (loadingFunctions && !functions) ? (
        <LoadingState count={6} label={loadingFunctions ? "Carregando funções…" : "Carregando escala sugerida…"} />
      ) : loadError ? (
        <div className="rounded-2xl border border-red-200 bg-white p-6 text-center">
          <p className="text-sm font-semibold text-slate-700">Não foi possível carregar a escala</p>
          <p className="text-xs text-slate-500 mt-1">{apiErrorMessage(loadError, "Verifique sua conexão e tente novamente.")}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => suggestionsQuery.refetch()}>Tentar novamente</Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="space-y-2">
          <EmptyState title="Nenhuma vaga sugerida neste evento" description="A logística ainda não enviou a escala sugerida deste evento, ou todas as vagas já foram aprovadas e seguiram para a Inclusão de Equipe." />
          {hasPermission(user, "canAccessScalingEventView") && (
            <p className="text-center">
              <Link href={scalingHref("/scaling-event-view", eventId)} className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-primary underline-offset-2 hover:underline">
                <History className="w-3 h-3" aria-hidden="true" /> Ver histórico completo do evento
              </Link>
            </p>
          )}
        </div>
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as "lista" | "escala")} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList className="rounded-xl">
              <TabsTrigger value="lista" className="rounded-lg">Lista</TabsTrigger>
              <TabsTrigger value="escala" className="rounded-lg">Escala</TabsTrigger>
            </TabsList>
            <p className="text-xs text-slate-500" aria-live="polite">
              {tab === "lista" ? `${filteredRows.length} de ${rows.length} vaga(s)` : "Quadro de todas as áreas (somente leitura)"}
            </p>
          </div>

          <TabsContent value="lista" className="space-y-3 mt-0">
            {/* Filtros */}
            <div className="rounded-2xl border border-slate-200 bg-white p-3 grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-end">
              <div className="space-y-1">
                <Label htmlFor="val-search" className="text-xs text-slate-600">Buscar</Label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <Input id="val-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Função, #ID, área ou observação" className="h-9 pl-8 rounded-lg" />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="val-function" className="text-xs text-slate-600">Função</Label>
                <Select value={functionFilter} onValueChange={setFunctionFilter}>
                  <SelectTrigger id="val-function" className="h-9 rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Todas as funções</SelectItem>
                    {functionsInEvent.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="val-area" className="text-xs text-slate-600">Área</Label>
                <Select value={areaFilter} onValueChange={setAreaFilter}>
                  <SelectTrigger id="val-area" className="h-9 rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Todas as áreas</SelectItem>
                    {areas.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5 pb-1">
                {anyEditable && (
                  <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer whitespace-nowrap">
                    <Checkbox checked={onlyMine} onCheckedChange={(c) => setOnlyMine(c === true)} /> Só as que posso editar
                  </label>
                )}
                {/* Aprovadas viram Inclusão e negadas saem desta lista: o histórico completo fica na tela "Histórico" (barra do módulo, no topo). */}
              </div>
            </div>

            {hiddenSelectedCount > 0 && (
              <p role="status" className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <Eye className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                {hiddenSelectedCount} {hiddenSelectedCount === 1 ? "vaga selecionada ficou oculta" : "vagas selecionadas ficaram ocultas"} pelo filtro — elas continuam na seleção.
                <button type="button" onClick={clearFilters} className="ml-auto font-semibold underline underline-offset-2 hover:text-amber-900">Limpar filtros</button>
              </p>
            )}

            {filteredRows.length === 0 ? (
              <EmptyState variant="filtered" title="Nenhuma vaga com esses filtros" onClearFilters={hasActiveFilters ? clearFilters : undefined} />
            ) : (
              <SuggestionsList
                rows={filteredRows}
                functionNameById={functionNameById}
                selectableIds={selectableVisible}
                selectedIds={new Set(effectiveSelected)}
                onToggle={toggle}
                onToggleAll={toggleAll}
                showSelection={anyEditable}
                sortConfig={sortConfig}
                onSort={onSort}
                onOpenDetail={(r) => setDetailId(r.id)}
                highlightId={pulseId}
              />
            )}
          </TabsContent>

          <TabsContent value="escala" className="mt-0">
            <ScheduleBoard rows={rows} functionNameById={functionNameById} rangeStart={selectedEvent?.startDate} rangeEnd={selectedEvent?.endDate} />
          </TabsContent>
        </Tabs>
      )}

      {/* Barra de ações em massa */}
      {nSel > 0 && (
        <div role="region" aria-label="Ações para as vagas selecionadas"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-3xl rounded-2xl bg-white shadow-lg ring-1 ring-black/5 px-4 py-3 flex flex-wrap items-center gap-2">
          <div className="mr-auto min-w-0">
            <span className="block text-sm font-semibold text-slate-700">{nSel} {nSel === 1 ? "vaga selecionada" : "vagas selecionadas"}</span>
            {nSel > 1 && <span className="block text-[11px] text-slate-500">Ajuste e exclusão: selecione 1 vaga por vez.</span>}
          </div>
          <Button type="button" size="sm" variant="ghost" className="rounded-lg text-slate-500" onClick={() => setSelected(new Set())} aria-label="Limpar seleção">
            <X className="w-4 h-4" />
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={singleSelected ? -1 : 0} className="inline-flex">
                <Button type="button" size="sm" variant="outline" className="rounded-lg" disabled={!singleSelected} onClick={() => setAdjustOpen(true)}>
                  <PencilLine className="w-4 h-4 mr-1.5" /> Pedir ajuste
                </Button>
              </span>
            </TooltipTrigger>
            {!singleSelected && <TooltipContent side="top" className="text-xs">Selecione apenas uma vaga para pedir ajuste</TooltipContent>}
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={singleSelected ? -1 : 0} className="inline-flex">
                <Button type="button" size="sm" variant="outline" className="rounded-lg text-red-700 border-red-200 hover:bg-red-50" disabled={!singleSelected} onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="w-4 h-4 mr-1.5" /> Pedir exclusão
                </Button>
              </span>
            </TooltipTrigger>
            {!singleSelected && <TooltipContent side="top" className="text-xs">Selecione apenas uma vaga para pedir exclusão</TooltipContent>}
          </Tooltip>
          <Button type="button" size="sm" className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setConfirmValidate(true)} disabled={validateMutation.isPending}>
            <CheckCheck className="w-4 h-4 mr-1.5" /> Validar ({nSel})
          </Button>
        </div>
      )}

      {/* Confirmar validação */}
      <AlertDialog open={confirmValidate} onOpenChange={setConfirmValidate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Validar {nSel} {nSel === 1 ? "vaga" : "vagas"}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Você confirma que a escala sugerida está correta para {nSel === 1 ? "esta vaga" : "estas vagas"}. Elas viram Inclusão (aguardando escalação) imediatamente e saem desta tela. Para mudar algo, use “Pedir ajuste”.</p>
                <ul className="rounded-lg border border-slate-200 bg-slate-50 divide-y divide-slate-100 text-xs text-slate-700">
                  {selectedRows.slice(0, 5).map((r) => (
                    <li key={r.id} className="flex items-center gap-2 px-3 py-1.5">
                      <span className="rounded-md bg-blue-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-blue-800">#{r.inclusionNumber}</span>
                      <span className="truncate font-semibold">{functionNameById.get(r.functionId) ?? "—"}</span>
                      <span className="ml-auto font-mono text-slate-500 whitespace-nowrap">{periodLabel(r)}</span>
                    </li>
                  ))}
                  {selectedRows.length > 5 && <li className="px-3 py-1.5 text-slate-500">… e mais {selectedRows.length - 5} {selectedRows.length - 5 === 1 ? "vaga" : "vagas"}</li>}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={validateMutation.isPending}>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); validateMutation.mutate(effectiveSelected); }} disabled={validateMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
              {validateMutation.isPending ? "Validando…" : "Validar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AdjustRequestDialog open={adjustOpen} onOpenChange={setAdjustOpen} inclusion={singleSelected} event={selectedEvent} functionName={singleSelected ? functionNameById.get(singleSelected.functionId) : undefined} onSent={onRequestSent} />
      <DeleteRequestDialog open={deleteOpen} onOpenChange={setDeleteOpen} inclusion={singleSelected} functionName={singleSelected ? functionNameById.get(singleSelected.functionId) : undefined} onSent={onRequestSent} />
      <IncludeRequestDialog open={includeOpen} onOpenChange={setIncludeOpen} event={selectedEvent} functions={requestableFunctions} onSent={onRequestSent} />
      <SuggestionDetailDrawer open={!!detailRow} onOpenChange={(o) => { if (!o) setDetailId(null); }} row={detailRow} event={selectedEvent} functionName={detailRow ? functionNameById.get(detailRow.functionId) : undefined} />
    </PageContainer>
  );
}
