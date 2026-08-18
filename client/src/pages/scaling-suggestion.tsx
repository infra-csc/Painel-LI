import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardPaste, ListPlus, Plus, RotateCcw, Send, Save, AlertTriangle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import EventCombobox from "@/components/ui/event-combobox";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { LoadingState } from "@/components/common/loading-state";
import { usePageTitle } from "@/components/common/use-page-title";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage, formatDateRange, formatDiarias, cn } from "@/lib/utils";
import { formatDayMonthBr } from "@/lib/dates";
import type { Event, Function as FunctionType } from "@shared/schema";
import { TRANSPORT_MODE_LABELS } from "@shared/scaling-validation-rules";
import { SuggestionGrid } from "@/components/scaling-validation/suggestion-grid";
import {
  buildDateList, decomposeGridRows, emptyGridRow, parsePastedRows, reframeRows,
  sortFunctionsByOrder, summarizeGrid, validateGridRow, type SuggestionGridRow,
} from "@/components/scaling-validation/scaling-grid-utils";
import { SUGGESTIONS_QUERY_KEY, type ApiError } from "@/components/scaling-validation/types";

interface DraftPayload {
  rows: SuggestionGridRow[];
  periodStart: string;
  periodEnd: string;
  eventObservations: string;
  timestamp: number;
}

const DRAFT_TTL_MS = 7 * 24 * 3600_000; // rascunho por evento vale 7 dias

export default function ScalingSuggestionPage() {
  usePageTitle("Sugestão de Escala");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [eventId, setEventId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [eventObservations, setEventObservations] = useState("");
  const [rows, setRows] = useState<SuggestionGridRow[]>([]);
  const [showAddFunction, setShowAddFunction] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [confirmSend, setConfirmSend] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const draftLoadedFor = useRef<string | null>(null);

  const canAccess = hasPermission(user, "canAccessScalingSuggestion");

  const { data: events, isLoading: loadingEvents, error: eventsError } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: functions, isLoading: loadingFunctions, error: functionsError, refetch: refetchFunctions } = useQuery<FunctionType[]>({ queryKey: ["/api/functions"] });

  const activeEvents = useMemo(
    () => (events ?? []).filter((e) => e.status !== "excluido" && e.status !== "excluído"),
    [events],
  );
  const selectedEvent = useMemo(() => activeEvents.find((e) => e.id === eventId), [activeEvents, eventId]);
  const sortedFunctions = useMemo(() => sortFunctionsByOrder(functions ?? []), [functions]);
  const dates = useMemo(() => buildDateList(periodStart, periodEnd), [periodStart, periodEnd]);

  const draftKey = eventId ? `scaling-suggestion-draft:${user?.id ?? "anon"}:${eventId}` : null;

  // ── Troca de evento: período do evento, comentários gerais e rascunho ──
  useEffect(() => {
    if (!selectedEvent) return;
    if (draftLoadedFor.current === selectedEvent.id) return;
    draftLoadedFor.current = selectedEvent.id;

    let restored = false;
    if (draftKey) {
      try {
        const raw = localStorage.getItem(draftKey);
        if (raw) {
          const d = JSON.parse(raw) as DraftPayload;
          if (d && Array.isArray(d.rows) && Date.now() - (d.timestamp || 0) < DRAFT_TTL_MS) {
            setPeriodStart(d.periodStart || selectedEvent.startDate);
            setPeriodEnd(d.periodEnd || selectedEvent.endDate);
            setEventObservations(d.eventObservations ?? (selectedEvent.observations ?? ""));
            setRows(d.rows);
            restored = true;
            toast({ title: "Rascunho restaurado", description: `Grade de ${selectedEvent.name} recuperada do rascunho local.` });
          } else {
            localStorage.removeItem(draftKey);
          }
        }
      } catch {
        /* rascunho corrompido: ignora */
      }
    }
    if (!restored) {
      setPeriodStart(selectedEvent.startDate);
      setPeriodEnd(selectedEvent.endDate);
      setEventObservations(selectedEvent.observations ?? "");
      setRows([]);
    }
  }, [selectedEvent, draftKey, toast]);

  // Reencaixa as quantidades quando o período muda (dias fora saem, novos entram vazios).
  useEffect(() => {
    setRows((prev) => (prev.length ? reframeRows(prev, dates) : prev));
  }, [dates]);

  // Auto-save do rascunho (por usuário + evento), 1,5s após a última alteração.
  useEffect(() => {
    if (!draftKey || draftLoadedFor.current !== eventId) return;
    const t = setTimeout(() => {
      const hasContent = rows.length > 0 || eventObservations !== (selectedEvent?.observations ?? "");
      // Usuário zerou tudo: o rascunho antigo não pode voltar na próxima visita.
      if (!hasContent) { try { localStorage.removeItem(draftKey); } catch { /* ignore */ } return; }
      const payload: DraftPayload = { rows, periodStart, periodEnd, eventObservations, timestamp: Date.now() };
      try { localStorage.setItem(draftKey, JSON.stringify(payload)); } catch { /* quota */ }
    }, 1500);
    return () => clearTimeout(t);
  }, [rows, periodStart, periodEnd, eventObservations, draftKey, eventId, selectedEvent]);

  // ── Edição da grade ──
  const changeRow = useCallback((rowId: string, patch: Partial<SuggestionGridRow>) => {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  }, []);
  const changeQty = useCallback((rowId: string, date: string, value: number) => {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, quantities: { ...r.quantities, [date]: value } } : r)));
  }, []);
  const duplicateRow = useCallback((rowId: string) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.rowId === rowId);
      if (idx < 0) return prev;
      const src = prev[idx];
      const copy: SuggestionGridRow = { ...src, rowId: `${src.functionId}-copy-${Date.now()}`, quantities: { ...src.quantities } };
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
    });
  }, []);
  const removeRow = useCallback((rowId: string) => setRows((prev) => prev.filter((r) => r.rowId !== rowId)), []);

  const addFunction = (f: FunctionType) => {
    setRows((prev) => [...prev, emptyGridRow(f.id, f.name, dates)]);
    setShowAddFunction(false);
  };
  const addAllFunctions = () => {
    setRows((prev) => {
      const present = new Set(prev.map((r) => r.functionId));
      const news = sortedFunctions.filter((f) => !present.has(f.id)).map((f) => emptyGridRow(f.id, f.name, dates));
      return [...prev, ...news];
    });
    setShowAddFunction(false);
  };

  const applyPaste = () => {
    if (!pasteText.trim()) {
      toast({ title: "Nada para colar", description: "Cole as linhas da planilha primeiro.", variant: "destructive" });
      return;
    }
    const year = (periodStart || selectedEvent?.startDate || String(new Date().getFullYear())).slice(0, 4);
    const { rows: pasted, skippedNames } = parsePastedRows(pasteText, functions ?? [], dates, year);
    if (pasted.length === 0) {
      toast({
        title: "Nenhuma linha reconhecida",
        description: skippedNames.length ? `Funções não encontradas: ${skippedNames.join(", ")}.` : "Verifique o formato (colunas separadas por TAB).",
        variant: "destructive",
      });
      return;
    }
    setRows((prev) => [...prev, ...pasted]);
    setShowPaste(false);
    setPasteText("");
    toast({
      title: "Linhas coladas",
      description: `${pasted.length} linha(s) adicionada(s).${skippedNames.length ? ` Não encontradas: ${skippedNames.join(", ")}.` : ""}`,
      variant: skippedNames.length ? "destructive" : "default",
    });
  };

  const clearGrid = () => {
    setRows([]);
    if (draftKey) localStorage.removeItem(draftKey);
    setConfirmClear(false);
  };

  // ── Prévia / envio ──
  const records = useMemo(() => decomposeGridRows(rows, dates), [rows, dates]);
  const summary = useMemo(() => summarizeGrid(rows, dates), [rows, dates]);
  const rowIssues = useMemo(() => rows.flatMap((r) => validateGridRow(r).map((i) => `${r.functionName}: ${i}`)), [rows]);
  const previewGroups = useMemo(() => {
    const groups: { key: string; functionName: string; records: typeof records }[] = [];
    const idx = new Map<string, number>();
    for (const rec of records) {
      const key = `${rec.functionId}-${rec.rowOrder}`;
      let i = idx.get(key);
      if (i === undefined) { i = groups.length; idx.set(key, i); groups.push({ key, functionName: rec.functionName, records: [] }); }
      groups[i].records.push(rec);
    }
    return groups;
  }, [records]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      // Só envia os comentários se mudaram em relação ao evento carregado (undefined = servidor não mexe).
      const loadedObs = selectedEvent?.observations ?? "";
      const payload = {
        eventId,
        ...(eventObservations !== loadedObs ? { eventObservations } : {}),
        rows: records.map((r) => ({
          functionId: r.functionId,
          workDays: r.workDays,
          dailyRates: r.dailyRates,
          needsTicket: r.needsTicket,
          needsAccommodation: r.needsAccommodation,
          transportModeIda: r.transportModeIda,
          transportModeVolta: r.transportModeVolta,
          flightDepartureDate: r.flightDepartureDate,
          flightArrivalSuggestedTime: r.flightArrivalSuggestedTime,
          flightReturnDate: r.flightReturnDate,
          flightReturnSuggestedTime: r.flightReturnSuggestedTime,
          observations: r.observations,
        })),
      };
      const res = await apiRequest("POST", "/api/scaling-suggestions/bulk", payload);
      return (await res.json()) as { created: number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [SUGGESTIONS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [`${SUGGESTIONS_QUERY_KEY}/event-view`] });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({ title: "Escala enviada para validação", description: `${data.created} vaga(s) criada(s) e enviada(s) às áreas.` });
      if (draftKey) localStorage.removeItem(draftKey);
      setRows([]);
      setConfirmSend(false);
    },
    onError: (err: ApiError) => {
      setConfirmSend(false);
      toast({ title: "Não foi possível enviar", description: apiErrorMessage(err, "Nenhuma vaga foi criada. Revise a grade e tente novamente."), variant: "destructive" });
    },
  });

  const openConfirmSend = () => {
    if (!eventId) { toast({ title: "Selecione o evento", variant: "destructive" }); return; }
    if (records.length === 0) { toast({ title: "Grade vazia", description: "Informe ao menos uma quantidade na grade.", variant: "destructive" }); return; }
    if (rowIssues.length > 0) {
      toast({ title: "Revise a grade", description: rowIssues.slice(0, 3).join(" · ") + (rowIssues.length > 3 ? ` (+${rowIssues.length - 3})` : ""), variant: "destructive" });
      return;
    }
    setConfirmSend(true);
  };

  // ── Render ──
  if (!canAccess) {
    return (
      <PageContainer>
        <div className="bg-card rounded-2xl border border-border p-6">
          <h3 className="text-lg font-semibold text-foreground mb-2">Acesso negado</h3>
          <p className="text-muted-foreground text-sm">Você não tem permissão para sugerir escala.</p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer fluid>
      <PageHeader
        icon={ListPlus}
        title="Nova sugestão de escala"
        subtitle="Monte a escala sugerida por função e dia e envie para as áreas validarem. Cada pessoa vira 1 vaga com seus dias de trabalho."
      />

      {eventsError ? (
        <div className="rounded-2xl border border-red-200 bg-white p-6 text-center">
          <p className="text-sm font-semibold text-slate-700">Não foi possível carregar os eventos</p>
          <p className="text-xs text-slate-400 mt-1">{apiErrorMessage(eventsError, "Verifique sua conexão e tente novamente.")}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/events"] })}>Tentar novamente</Button>
        </div>
      ) : loadingEvents || loadingFunctions ? (
        <LoadingState count={3} label="Carregando eventos e funções…" />
      ) : (
        <>
          {functionsError && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
              <div className="flex items-start gap-2 text-xs text-red-800">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-red-600" aria-hidden="true" />
                <span>
                  <span className="font-semibold">Não foi possível carregar as funções.</span>{" "}
                  {apiErrorMessage(functionsError as ApiError, "Sem a lista de funções, não dá para adicionar linhas nem colar da planilha.")}
                </span>
              </div>
              <Button type="button" variant="outline" size="sm" className="rounded-lg h-8" onClick={() => refetchFunctions()}>Tentar novamente</Button>
            </div>
          )}
          {/* Evento + período + comentários */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4" aria-labelledby="sug-evento">
            <h2 id="sug-evento" className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Evento</h2>
            <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <div className="space-y-1.5">
                <Label htmlFor="sug-event-combobox" className="text-xs text-slate-600">Evento <span className="text-red-400">*</span></Label>
                <div id="sug-event-combobox">
                  <EventCombobox events={activeEvents} value={eventId} onValueChange={(v) => setEventId(v === "all" ? "" : v)} placeholder="Selecione um evento" showAllOption={false} testId="scaling-suggestion-event" />
                </div>
                {selectedEvent && (
                  <p className="text-[11px] text-slate-400">
                    Período do evento: <span className="font-mono">{formatDateRange(selectedEvent.startDate, selectedEvent.endDate, { withYear: true })}</span>
                    {selectedEvent.location ? ` · ${selectedEvent.location}` : ""}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sug-period-start" className="text-xs text-slate-600">Início da grade</Label>
                <Input id="sug-period-start" type="date" value={periodStart} disabled={!eventId} onChange={(e) => setPeriodStart(e.target.value)} className="h-9 rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sug-period-end" className="text-xs text-slate-600">Fim da grade</Label>
                <Input id="sug-period-end" type="date" value={periodEnd} disabled={!eventId} min={periodStart || undefined} onChange={(e) => setPeriodEnd(e.target.value)} className="h-9 rounded-lg" />
                {periodStart && periodEnd && periodEnd < periodStart && (
                  <p className="text-[11px] text-red-500" role="alert">O fim da grade não pode ser antes do início.</p>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sug-event-obs" className="text-xs text-slate-600">Comentários gerais do evento</Label>
              <Textarea id="sug-event-obs" value={eventObservations} disabled={!eventId} rows={3} maxLength={2000}
                placeholder="Orientações gerais para as áreas (horários de montagem, ponto de encontro, restrições…)."
                onChange={(e) => setEventObservations(e.target.value)} className="rounded-lg text-sm" />
              <p className="text-[11px] text-slate-400">Salvo nas observações do evento junto com o envio da escala.</p>
            </div>
          </section>

          {/* Grade */}
          <section className="space-y-3" aria-labelledby="sug-grade">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <h2 id="sug-grade" className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Grade função × dia</h2>
                {rows.length > 0 && (
                  <span className="text-[11px] text-slate-400 tabular-nums" aria-live="polite">
                    {summary.funcoes} {summary.funcoes === 1 ? "linha" : "linhas"} · {summary.pessoasDia} pessoas-dia · {records.length} {records.length === 1 ? "vaga" : "vagas"}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="rounded-lg h-8" disabled={!eventId || dates.length === 0} onClick={() => setShowPaste(true)}>
                  <ClipboardPaste className="w-3.5 h-3.5 mr-1.5" /> Colar da planilha
                </Button>
                <Button type="button" variant="outline" size="sm" className="rounded-lg h-8" disabled={!eventId || dates.length === 0} onClick={() => setShowAddFunction(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> Adicionar função
                </Button>
                <Button type="button" variant="ghost" size="sm" className="rounded-lg h-8 text-slate-500" disabled={rows.length === 0} onClick={() => setConfirmClear(true)}>
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Limpar
                </Button>
              </div>
            </div>

            {!eventId ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-400" role="status">
                Selecione um evento para montar a grade.
              </div>
            ) : dates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-400" role="status">
                Informe um período válido para a grade.
              </div>
            ) : (
              <>
                {rowIssues.length > 0 && (
                  <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
                    <span>{rowIssues.length === 1 ? rowIssues[0] : `${rowIssues.length} pendências na grade — passe o mouse na função para ver.`}</span>
                  </div>
                )}
                <SuggestionGrid
                  rows={rows} dates={dates}
                  onChangeRow={changeRow} onChangeQty={changeQty}
                  onDuplicateRow={duplicateRow} onRemoveRow={removeRow}
                  disabled={sendMutation.isPending}
                />
                <button type="button" onClick={() => setShowAddFunction(true)}
                  className="border-2 border-dashed border-slate-200 text-slate-400 hover:border-primary/40 hover:text-primary hover:bg-brand-soft/60 rounded-2xl w-full py-2.5 text-sm font-medium transition-all flex items-center justify-center gap-2">
                  <Plus className="w-4 h-4" /> Adicionar função à grade
                </button>
              </>
            )}
          </section>

          {/* Prévia */}
          {eventId && dates.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden" aria-labelledby="sug-previa">
              <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                <h2 id="sug-previa" className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Prévia das vagas que serão criadas</h2>
                <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", records.length > 0 ? "bg-brand-soft text-primary" : "bg-slate-100 text-slate-400")} aria-live="polite">
                  {records.length} {records.length === 1 ? "vaga" : "vagas"}
                </span>
              </div>
              {records.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-5 italic">Nenhuma vaga configurada ainda — preencha as quantidades por dia.</p>
              ) : (
                <div className="max-h-[360px] overflow-y-auto">
                  {previewGroups.map((group, gi) => (
                    <div key={group.key} className={gi > 0 ? "border-t border-slate-100" : ""}>
                      <div className="flex items-center justify-between px-4 py-1.5 bg-slate-50/70">
                        <span className="flex items-center gap-2 text-[12px] font-semibold text-slate-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary/40 shrink-0" aria-hidden="true" />
                          {group.functionName}
                        </span>
                        <span className="text-[11px] text-slate-400 tabular-nums">{group.records.length} {group.records.length === 1 ? "vaga" : "vagas"}</span>
                      </div>
                      {group.records.map((rec, i) => (
                        <div key={`${group.key}-${i}`} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 pl-8 pr-4 py-1.5 text-xs", i % 2 === 1 ? "bg-slate-50/40" : "bg-white")}>
                          <span className="text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">{formatDiarias(rec.dailyRates)}</span>
                          <span className="text-slate-500 font-mono tabular-nums">{rec.workDays.map((d) => formatDayMonthBr(d)).join(", ")}</span>
                          <span className="text-slate-400">
                            {rec.transportModeIda ? `Ida ${TRANSPORT_MODE_LABELS[rec.transportModeIda]}${rec.flightDepartureDate ? ` ${formatDayMonthBr(rec.flightDepartureDate)}` : ""}${rec.flightArrivalSuggestedTime ? ` ${rec.flightArrivalSuggestedTime}` : ""}` : ""}
                            {rec.transportModeVolta ? ` · Volta ${TRANSPORT_MODE_LABELS[rec.transportModeVolta]}${rec.flightReturnDate ? ` ${formatDayMonthBr(rec.flightReturnDate)}` : ""}${rec.flightReturnSuggestedTime ? ` ${rec.flightReturnSuggestedTime}` : ""}` : ""}
                          </span>
                          {rec.needsAccommodation && <span className="text-[10px] font-semibold uppercase text-sky-700 bg-sky-50 rounded px-1.5 py-0.5">Hotel</span>}
                          {rec.needsTicket && <span className="text-[10px] font-semibold uppercase text-violet-700 bg-violet-50 rounded px-1.5 py-0.5">Passagem</span>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-slate-200 bg-white">
                <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <Save className="w-3.5 h-3.5" aria-hidden="true" /> Rascunho salvo automaticamente neste navegador (por evento).
                </p>
                <Button type="button" onClick={openConfirmSend} disabled={records.length === 0 || sendMutation.isPending} className="rounded-xl bg-primary hover:bg-primary-hover">
                  <Send className="w-4 h-4 mr-2" />
                  {sendMutation.isPending ? "Enviando…" : `Enviar para validação das áreas (${records.length})`}
                </Button>
              </div>
            </section>
          )}
        </>
      )}

      {/* Adicionar função */}
      <Dialog open={showAddFunction} onOpenChange={setShowAddFunction}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle>Adicionar função à grade</DialogTitle>
            <DialogDescription>A mesma função pode entrar mais de uma vez (ex.: turmas com dias de viagem diferentes).</DialogDescription>
          </DialogHeader>
          <Command className="border-t border-slate-100">
            <CommandInput placeholder="Buscar função…" />
            <CommandList className="max-h-[300px]">
              <CommandEmpty>Nenhuma função encontrada.</CommandEmpty>
              <CommandGroup>
                {sortedFunctions.map((f) => (
                  <CommandItem key={f.id} value={f.name} onSelect={() => addFunction(f)}>
                    <Search className="w-3.5 h-3.5 mr-2 opacity-40" aria-hidden="true" />
                    <span className="flex-1">{f.name}</span>
                    {f.responsibleArea && <span className="text-[11px] text-slate-400">{f.responsibleArea}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
          <DialogFooter className="px-5 py-3 border-t border-slate-100 sm:justify-between">
            <Button type="button" variant="ghost" size="sm" onClick={addAllFunctions}>Adicionar todas as funções</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowAddFunction(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Colar da planilha */}
      <Dialog open={showPaste} onOpenChange={(o) => { setShowPaste(o); if (!o) setPasteText(""); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Colar da planilha</DialogTitle>
            <DialogDescription>
              Copie as linhas da planilha (colunas separadas por TAB) e cole abaixo. Ordem das colunas:
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-[11px] font-mono text-slate-600 overflow-x-auto whitespace-nowrap">
            Função | Modal ida | Data ida | Hora desembarque | Modal volta | Data volta | Hora embarque | Hotel (sim/não) | Passagem (sim/não) | Observação | {dates.slice(0, 3).map((d) => formatDayMonthBr(d)).join(" | ")}{dates.length > 3 ? " | …" : ""}
          </div>
          <Label htmlFor="sug-paste" className="sr-only">Conteúdo colado</Label>
          <Textarea id="sug-paste" value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={10} placeholder={"Kit\tAéreo\t09/09\t10:00\tAéreo\t13/09\t18:00\tsim\tsim\t\t1\t1\t2"} className="font-mono text-xs" />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowPaste(false)}>Cancelar</Button>
            <Button type="button" onClick={applyPaste} className="bg-primary hover:bg-primary-hover">Aplicar na grade</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar envio */}
      <AlertDialog open={confirmSend} onOpenChange={setConfirmSend}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar escala para validação?</AlertDialogTitle>
            <AlertDialogDescription>
              Serão criadas <strong>{records.length}</strong> vaga(s) sugerida(s) para <strong>{selectedEvent?.name}</strong> e as áreas responsáveis passam a vê-las na Validação de Escala. A operação é única: ou todas entram, ou nenhuma.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sendMutation.isPending}>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); sendMutation.mutate(); }} disabled={sendMutation.isPending} className="bg-primary hover:bg-primary-hover">
              {sendMutation.isPending ? "Enviando…" : "Enviar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmar limpar */}
      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar a grade?</AlertDialogTitle>
            <AlertDialogDescription>Todas as linhas e o rascunho local deste evento serão descartados. Nada é apagado no servidor.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={clearGrid} className="bg-destructive hover:bg-destructive/90">Limpar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
