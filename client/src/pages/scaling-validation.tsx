import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { CheckCheck, ClipboardCheck, History, PencilLine, Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage, cn, formatDateRange } from "@/lib/utils";
import { normalizeRole } from "@shared/roles";
import type { Event } from "@shared/schema";
import { SUGESTAO_STATUS, availableSuggestionActions } from "@shared/scaling-validation-rules";
import { SuggestionsList } from "@/components/scaling-validation/suggestions-list";
import { ScheduleBoard } from "@/components/scaling-validation/schedule-board";
import { AdjustRequestDialog, DeleteRequestDialog, IncludeRequestDialog } from "@/components/scaling-validation/change-request-dialogs";
import {
  SUGGESTIONS_QUERY_KEY, CHANGE_REQUESTS_QUERY_KEY,
  type ApiError, type FunctionWithManagers, type SuggestionRow, type ValidateResult,
} from "@/components/scaling-validation/types";

const ALL = "all";
const LAST_EVENT_KEY = "scaling-validation:last-event";

export default function ScalingValidationPage() {
  usePageTitle("Validação de Escala");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = normalizeRole(user?.role) === "admin";
  const canAccess = hasPermission(user, "canAccessScalingValidation");

  // ── Estado ──
  const [eventId, setEventId] = useState(() => (typeof window !== "undefined" ? localStorage.getItem(LAST_EVENT_KEY) ?? "" : ""));
  const [tab, setTab] = useState<"lista" | "escala">("lista");
  const [search, setSearch] = useState("");
  const [functionFilter, setFunctionFilter] = useState(ALL);
  const [areaFilter, setAreaFilter] = useState(ALL);
  const [onlyMine, setOnlyMine] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmValidate, setConfirmValidate] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [includeOpen, setIncludeOpen] = useState(false);

  useEffect(() => { if (eventId) localStorage.setItem(LAST_EVENT_KEY, eventId); }, [eventId]);
  // Trocou de evento/filtros: limpa a seleção (evita agir em vaga que sumiu da lista).
  useEffect(() => { setSelected(new Set()); }, [eventId]);

  // ── Dados ──
  const { data: events, isLoading: loadingEvents } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: functions } = useQuery<FunctionWithManagers[]>({ queryKey: ["/api/functions"] });
  const suggestionsQuery = useQuery<SuggestionRow[]>({
    queryKey: [SUGGESTIONS_QUERY_KEY, eventId],
    queryFn: async () => (await apiRequest("GET", `${SUGGESTIONS_QUERY_KEY}?eventId=${encodeURIComponent(eventId)}`)).json(),
    enabled: !!eventId,
    staleTime: 15_000,
  });
  const rows = useMemo(() => suggestionsQuery.data ?? [], [suggestionsQuery.data]);

  const activeEvents = useMemo(() => (events ?? []).filter((e) => e.status !== "excluido" && e.status !== "excluído"), [events]);
  const selectedEvent = activeEvents.find((e) => e.id === eventId);
  const functionNameById = useMemo(() => new Map((functions ?? []).map((f) => [f.id, f.name])), [functions]);

  /** Funções em que o usuário é validador (ou todas, se admin) — para "Incluir escalação". */
  const requestableFunctions = useMemo(() => {
    const list = functions ?? [];
    if (isAdmin) return list;
    return list.filter((f) => f.managers?.some((m) => m.userId === user?.id && m.role === "validador"));
  }, [functions, isAdmin, user?.id]);

  // ── Filtros ──
  const areas = useMemo(() => Array.from(new Set(rows.map((r) => r.area).filter((a): a is string => !!a))).sort((a, b) => a.localeCompare(b, "pt-BR")), [rows]);
  const functionsInEvent = useMemo(() => {
    const ids = new Set(rows.map((r) => r.functionId));
    return (functions ?? []).filter((f) => ids.has(f.id)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
  }, [rows, functions]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => functionFilter === ALL || r.functionId === functionFilter)
      .filter((r) => areaFilter === ALL || r.area === areaFilter)
      .filter((r) => !onlyMine || r.canEdit)
      .filter((r) => {
        if (!q) return true;
        const fn = (functionNameById.get(r.functionId) ?? "").toLowerCase();
        return fn.includes(q) || String(r.inclusionNumber).includes(q) || (r.area ?? "").toLowerCase().includes(q) || (r.observations ?? "").toLowerCase().includes(q);
      })
      .sort((a, b) => (functionNameById.get(a.functionId) ?? "").localeCompare(functionNameById.get(b.functionId) ?? "", "pt-BR") || (a.inclusionNumber ?? 0) - (b.inclusionNumber ?? 0));
  }, [rows, functionFilter, areaFilter, onlyMine, search, functionNameById]);

  const hasActiveFilters = search.trim() !== "" || functionFilter !== ALL || areaFilter !== ALL || onlyMine;
  const clearFilters = () => { setSearch(""); setFunctionFilter(ALL); setAreaFilter(ALL); setOnlyMine(false); };

  // ── Seleção ──
  const canActOn = (r: SuggestionRow) => r.canEdit && !r.pendingRequest && availableSuggestionActions({ status: r.status, phase: r.phase }).includes("validar");
  const selectableIds = useMemo(() => new Set(filteredRows.filter(canActOn).map((r) => r.id)), [filteredRows]);
  const effectiveSelected = useMemo(() => Array.from(selected).filter((id) => selectableIds.has(id)), [selected, selectableIds]);
  const selectedRows = useMemo(() => effectiveSelected.map((id) => rows.find((r) => r.id === id)!).filter(Boolean), [effectiveSelected, rows]);
  const singleSelected = selectedRows.length === 1 ? selectedRows[0] : null;
  const anyEditable = rows.some((r) => r.canEdit);

  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => {
    const all = Array.from(selectableIds).every((id) => selected.has(id));
    setSelected(all ? new Set() : new Set(selectableIds));
  };

  // ── Resumo ──
  const counts = useMemo(() => ({
    total: rows.length,
    pendentes: rows.filter((r) => r.status === SUGESTAO_STATUS.PENDENTE).length,
    comPedido: rows.filter((r) => r.status === SUGESTAO_STATUS.AJUSTE).length,
    minhas: rows.filter(canActOn).length,
    atrasadas: rows.filter((r) => r.status === SUGESTAO_STATUS.PENDENTE && r.daysPending >= 3).length,
  }), [rows]);

  // ── Validar em massa ──
  const validateMutation = useMutation({
    mutationFn: async (ids: string[]) => (await apiRequest("POST", "/api/scaling-suggestions/validate", { inclusionIds: ids })).json() as Promise<ValidateResult>,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: [SUGGESTIONS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [`${SUGGESTIONS_QUERY_KEY}/event-view`] });
      queryClient.invalidateQueries({ queryKey: [CHANGE_REQUESTS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
      setSelected(new Set());
      setConfirmValidate(false);
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

  return (
    <PageContainer fluid className="pb-24">
      <PageHeader
        icon={ClipboardCheck}
        title="Validação de escala"
        subtitle="Cada área confere as vagas sugeridas pela logística: valida, pede ajuste ou exclusão, ou inclui vagas novas."
        actions={
          <Button type="button" size="sm" className="rounded-lg bg-primary hover:bg-primary-hover" disabled={!eventId || requestableFunctions.length === 0}
            onClick={() => setIncludeOpen(true)}
            title={!eventId ? "Selecione um evento" : requestableFunctions.length === 0 ? "Você não é validador de nenhuma função" : undefined}>
            <Plus className="w-4 h-4 mr-1.5" /> Incluir escalação
          </Button>
        }
      />

      {/* Evento */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3" aria-labelledby="val-evento">
        <h2 id="val-evento" className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Evento</h2>
        <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start">
          <div className="space-y-1.5">
            {loadingEvents ? (
              <div className="h-9 rounded-lg bg-slate-100 animate-pulse" aria-hidden="true" />
            ) : (
              <EventCombobox events={activeEvents} value={eventId} onValueChange={(v) => setEventId(v === ALL ? "" : v)} placeholder="Selecione um evento" showAllOption={false} testId="scaling-validation-event" />
            )}
            {selectedEvent && (
              <p className="text-[11px] text-slate-400">
                Período: <span className="font-mono">{formatDateRange(selectedEvent.startDate, selectedEvent.endDate, { withYear: true })}</span>
                {selectedEvent.location ? ` · ${selectedEvent.location}` : ""}
              </p>
            )}
            {selectedEvent?.observations && (
              <p className="text-xs text-slate-600 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 whitespace-pre-wrap">
                <span className="font-semibold text-slate-500">Comentários da logística: </span>{selectedEvent.observations}
              </p>
            )}
          </div>
          {eventId && rows.length > 0 && (
            <dl className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
              {[
                ["Vagas", counts.total, ""],
                ["Aguardando", counts.pendentes, "text-amber-700"],
                ["Com pedido", counts.comPedido, "text-violet-700"],
                ["Atrasadas (≥3d)", counts.atrasadas, counts.atrasadas ? "text-red-600" : ""],
                ["Posso validar", counts.minhas, "text-primary"],
              ].map(([label, n, cls]) => (
                <div key={String(label)} className="rounded-xl border border-slate-100 bg-slate-50/60 px-2 py-2">
                  <dt className="text-[10px] uppercase tracking-wide text-slate-400">{label}</dt>
                  <dd className={cn("text-lg font-bold tabular-nums text-slate-800", cls as string)}>{n}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>

      {!eventId ? (
        <EmptyState title="Selecione um evento" description="A escala sugerida é por evento. Escolha um acima para ver as vagas." />
      ) : suggestionsQuery.isLoading ? (
        <LoadingState count={6} label="Carregando escala sugerida…" />
      ) : loadError ? (
        <div className="rounded-2xl border border-red-200 bg-white p-6 text-center">
          <p className="text-sm font-semibold text-slate-700">Não foi possível carregar a escala</p>
          <p className="text-xs text-slate-400 mt-1">{apiErrorMessage(loadError, "Verifique sua conexão e tente novamente.")}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => suggestionsQuery.refetch()}>Tentar novamente</Button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="Nenhuma vaga sugerida neste evento" description="A logística ainda não enviou a escala sugerida deste evento, ou todas as vagas já foram aprovadas e seguiram para a Inclusão de Equipe." />
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as "lista" | "escala")} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList className="rounded-xl">
              <TabsTrigger value="lista" className="rounded-lg">Lista</TabsTrigger>
              <TabsTrigger value="escala" className="rounded-lg">Escala</TabsTrigger>
            </TabsList>
            <p className="text-[11px] text-slate-400" aria-live="polite">
              {tab === "lista" ? `${filteredRows.length} de ${rows.length} vaga(s)` : "Quadro de todas as áreas — somente leitura fora do seu escopo"}
            </p>
          </div>

          <TabsContent value="lista" className="space-y-3 mt-0">
            {/* Filtros */}
            <div className="rounded-2xl border border-slate-200 bg-white p-3 grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-end">
              <div className="space-y-1">
                <Label htmlFor="val-search" className="text-[11px] text-slate-500">Buscar</Label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <Input id="val-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Função, #ID, área ou observação" className="h-9 pl-8 rounded-lg" />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="val-function" className="text-[11px] text-slate-500">Função</Label>
                <Select value={functionFilter} onValueChange={setFunctionFilter}>
                  <SelectTrigger id="val-function" className="h-9 rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Todas as funções</SelectItem>
                    {functionsInEvent.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="val-area" className="text-[11px] text-slate-500">Área</Label>
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
                {/* Aprovadas viram Inclusão e negadas saem desta lista: o histórico completo fica na visão por evento. */}
                <Link href={`/scaling-event-view?eventId=${encodeURIComponent(eventId)}`}
                  className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-primary underline-offset-2 hover:underline whitespace-nowrap">
                  <History className="w-3 h-3" aria-hidden="true" /> Ver histórico completo do evento (visão por evento)
                </Link>
              </div>
            </div>

            {filteredRows.length === 0 ? (
              <EmptyState variant="filtered" title="Nenhuma vaga com esses filtros" onClearFilters={hasActiveFilters ? clearFilters : undefined} />
            ) : (
              <SuggestionsList
                rows={filteredRows}
                functionNameById={functionNameById}
                selectableIds={selectableIds}
                selectedIds={new Set(effectiveSelected)}
                onToggle={toggle}
                onToggleAll={toggleAll}
                showSelection={anyEditable}
              />
            )}
          </TabsContent>

          <TabsContent value="escala" className="mt-0">
            <ScheduleBoard rows={rows} functionNameById={functionNameById} rangeStart={selectedEvent?.startDate} rangeEnd={selectedEvent?.endDate} />
          </TabsContent>
        </Tabs>
      )}

      {/* Barra de ações em massa */}
      {effectiveSelected.length > 0 && (
        <div role="region" aria-label="Ações para as vagas selecionadas"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-xl px-4 py-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-700 mr-auto">
            {effectiveSelected.length} {effectiveSelected.length === 1 ? "vaga selecionada" : "vagas selecionadas"}
          </span>
          <Button type="button" size="sm" className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setConfirmValidate(true)} disabled={validateMutation.isPending}>
            <CheckCheck className="w-4 h-4 mr-1.5" /> Validar ({effectiveSelected.length})
          </Button>
          <Button type="button" size="sm" variant="outline" className="rounded-lg" disabled={!singleSelected} onClick={() => setAdjustOpen(true)}
            title={!singleSelected ? "Selecione apenas uma vaga para pedir ajuste" : undefined}>
            <PencilLine className="w-4 h-4 mr-1.5" /> Pedir ajuste
          </Button>
          <Button type="button" size="sm" variant="outline" className="rounded-lg text-red-700 border-red-200 hover:bg-red-50" disabled={!singleSelected} onClick={() => setDeleteOpen(true)}
            title={!singleSelected ? "Selecione apenas uma vaga para pedir exclusão" : undefined}>
            <Trash2 className="w-4 h-4 mr-1.5" /> Pedir exclusão
          </Button>
          <Button type="button" size="sm" variant="ghost" className="rounded-lg text-slate-500" onClick={() => setSelected(new Set())} aria-label="Limpar seleção">
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Confirmar validação */}
      <AlertDialog open={confirmValidate} onOpenChange={setConfirmValidate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Validar {effectiveSelected.length} {effectiveSelected.length === 1 ? "vaga" : "vagas"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Você confirma que a escala sugerida está correta para {effectiveSelected.length === 1 ? "esta vaga" : "estas vagas"}. Elas viram Inclusão (aguardando escalação) imediatamente e saem desta tela. Para mudar algo, use “Pedir ajuste”.
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

      <AdjustRequestDialog open={adjustOpen} onOpenChange={setAdjustOpen} inclusion={singleSelected} event={selectedEvent} functionName={singleSelected ? functionNameById.get(singleSelected.functionId) : undefined} />
      <DeleteRequestDialog open={deleteOpen} onOpenChange={setDeleteOpen} inclusion={singleSelected} functionName={singleSelected ? functionNameById.get(singleSelected.functionId) : undefined} />
      <IncludeRequestDialog open={includeOpen} onOpenChange={setIncludeOpen} event={selectedEvent} functions={requestableFunctions} />
    </PageContainer>
  );
}
