import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertTriangle, Check, CheckCircle2, ClipboardPaste, ExternalLink, Eye, History, ListPlus, Plus, RotateCcw, Send, Save, Undo2,
} from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { scalingHref, useScalingEvent } from "@/lib/use-scaling-event";
import type { Event, Function as FunctionType } from "@shared/schema";
import { TRANSPORT_MODE_LABELS, summarizeCancelableSuggestions } from "@shared/scaling-validation-rules";
import { SuggestionGrid, rowDomId } from "@/components/scaling-validation/suggestion-grid";
import { ScalingModuleNav } from "@/components/scaling-validation/scaling-module-nav";
import {
  buildDateList, countOutsidePeriod, decomposeGridRows, detectPasteFormat, emptyGridRow, expandPeriodForDates,
  functionNameKey, mergePastedRows, parsePastedRows, pasteConflicts, periodBounds, periodProblem, PERIOD_MARGIN_DAYS,
  PERIOD_PROBLEM_MESSAGES, PASTE_FORMAT_LABELS, reframeRows, sanitizeDraftRows, sortFunctionsByOrder, summarizeGrid, summarizePaste,
  validateGridRow,
  type PasteFormat, type PeriodExpansion, type RowValidation, type SuggestionGridRow,
} from "@/components/scaling-validation/scaling-grid-utils";
import { SUGGESTIONS_QUERY_KEY, invalidateScalingQueries, type ApiError, type SuggestionRow } from "@/components/scaling-validation/types";

interface DraftPayload {
  rows: SuggestionGridRow[];
  periodStart: string;
  periodEnd: string;
  eventObservations: string;
  timestamp: number;
}

interface Period { start: string; end: string }
interface PendingPeriod extends Period { pessoasDia: number; dias: number }
interface PendingPaste { rows: SuggestionGridRow[]; skippedNames: string[]; conflicts: string[]; format: PasteFormat }
/** Dias que a planilha traz preenchidos mas estão fora do período atual da grade. */
interface PendingPasteDates { dates: string[]; expansion: PeriodExpansion }
interface SentInfo { created: number; eventId: string; eventName: string }

const DRAFT_TTL_MS = 7 * 24 * 3600_000; // rascunho por evento vale 7 dias
/** Valor sentinela do Select de mapeamento (Radix não aceita SelectItem com value ""). */
const SKIP_FUNCTION = "__descartar__";
const SECTION_TITLE = "text-[11px] font-bold uppercase tracking-wide text-slate-500";
const HINT = "text-xs text-slate-500";
const EMPTY_PERIOD: Period = { start: "", end: "" };
/** Espera antes de reanalisar a colagem (o resumo ao vivo não roda a cada tecla). */
const PASTE_PREVIEW_DEBOUNCE_MS = 200;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function writeDraft(key: string, payload: Omit<DraftPayload, "timestamp">, hasContent: boolean) {
  try {
    if (!hasContent) { localStorage.removeItem(key); return; }
    localStorage.setItem(key, JSON.stringify({ ...payload, timestamp: Date.now() } satisfies DraftPayload));
  } catch { /* quota / storage indisponível */ }
}

export default function ScalingSuggestionPage() {
  usePageTitle("Sugestão de Escala");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { eventId, setEventId, sanitize } = useScalingEvent("/scaling-suggestion");
  // Inputs de período (o que o usuário digita) × período APLICADO à grade (sempre válido).
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [applied, setApplied] = useState<Period>(EMPTY_PERIOD);
  const [pendingPeriod, setPendingPeriod] = useState<PendingPeriod | null>(null);
  const [eventObservations, setEventObservations] = useState("");
  const [rows, setRows] = useState<SuggestionGridRow[]>([]);
  const [showAddFunction, setShowAddFunction] = useState(false);
  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(() => new Set());
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  /** Cópia atrasada de `pasteText`: é o que alimenta o resumo ao vivo. */
  const [pasteTextDebounced, setPasteTextDebounced] = useState("");
  const [pasteFormat, setPasteFormat] = useState<"auto" | PasteFormat>("auto");
  /** "Formatos aceitos" (com o Select de formato) — fechado por padrão. */
  const [showPasteHelp, setShowPasteHelp] = useState(false);
  const [pendingPaste, setPendingPaste] = useState<PendingPaste | null>(null);
  const [pendingPasteDates, setPendingPasteDates] = useState<PendingPasteDates | null>(null);
  // Nomes da planilha que o catálogo não reconhece + a função escolhida à mão para cada um.
  const [unknownNames, setUnknownNames] = useState<string[]>([]);
  const [pasteNameMap, setPasteNameMap] = useState<Record<string, string>>({});
  const askedMappingRef = useRef(false); // só interrompe uma vez: no 2º clique, o que não foi mapeado é descartado
  const [confirmSend, setConfirmSend] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  /** AlertDialog do "Cancelar envio" (remove todas as vagas já enviadas do evento). */
  const [confirmCancelSend, setConfirmCancelSend] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [sent, setSent] = useState<SentInfo | null>(null);
  const draftLoadedFor = useRef<string | null>(null);
  const loadedObsRef = useRef("");
  // Espelhos síncronos (callbacks estáveis leem daqui sem depender de `rows`/`applied`).
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const appliedRef = useRef<Period>(EMPTY_PERIOD);

  const canAccess = hasPermission(user, "canAccessScalingSuggestion");
  // Modo leitura: entra na tela (compras/financeiro), mas só Produção/Admin montam e enviam.
  const readOnly = !hasPermission(user, "canEditScalingSuggestion");

  const { data: events, isLoading: loadingEvents, error: eventsError } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  // Vagas que este evento JÁ tem na Validação de Escala. A tela de sugestão não
  // consultava isto: montava a grade do zero mesmo quando o envio anterior
  // estava lá inteiro, e o usuário só descobria o envio duplicado depois.
  const sentQuery = useQuery<SuggestionRow[]>({
    queryKey: [SUGGESTIONS_QUERY_KEY, eventId],
    queryFn: async () => (await apiRequest("GET", `${SUGGESTIONS_QUERY_KEY}?eventId=${encodeURIComponent(eventId)}`)).json(),
    enabled: !!eventId && canAccess,
  });
  const { data: functions, isLoading: loadingFunctions, error: functionsError, refetch: refetchFunctions } = useQuery<FunctionType[]>({ queryKey: ["/api/functions"] });

  const activeEvents = useMemo(
    () => (events ?? []).filter((e) => e.status !== "excluido" && e.status !== "excluído"),
    [events],
  );
  useEffect(() => { if (events) sanitize(activeEvents.map((e) => e.id)); }, [events, activeEvents, sanitize]);
  const selectedEvent = useMemo(() => activeEvents.find((e) => e.id === eventId), [activeEvents, eventId]);
  const sortedFunctions = useMemo(() => sortFunctionsByOrder(functions ?? []), [functions]);
  const dates = useMemo(() => buildDateList(applied.start, applied.end), [applied]);
  const bounds = useMemo(() => periodBounds(selectedEvent?.startDate ?? "", selectedEvent?.endDate ?? ""), [selectedEvent]);
  const periodError = useMemo(() => {
    if (!eventId) return null;
    const p = periodProblem(periodStart, periodEnd);
    if (p) return PERIOD_PROBLEM_MESSAGES[p];
    // O min/max do input não segura data DIGITADA: a margem de ±PERIOD_MARGIN_DAYS
    // em torno do evento é imposta aqui (e em requestPeriod) de verdade.
    if (bounds.min && periodStart < bounds.min) {
      return `O início da grade não pode ser antes de ${formatDayMonthBr(bounds.min)} (${PERIOD_MARGIN_DAYS} dias antes do evento). A grade continua com o período anterior.`;
    }
    if (bounds.max && periodEnd > bounds.max) {
      return `O fim da grade não pode passar de ${formatDayMonthBr(bounds.max)} (${PERIOD_MARGIN_DAYS} dias depois do evento). A grade continua com o período anterior.`;
    }
    return null;
  }, [eventId, periodStart, periodEnd, bounds]);

  const draftKey = eventId ? `scaling-suggestion-draft:${user?.id ?? "anon"}:${eventId}` : null;

  const loadPeriod = useCallback((start: string, end: string) => {
    appliedRef.current = { start, end };
    setPeriodStart(start); setPeriodEnd(end); setApplied({ start, end }); setPendingPeriod(null);
  }, []);

  // ── Troca de evento: período do evento, comentários gerais e rascunho ──
  useEffect(() => {
    if (!selectedEvent) return;
    if (draftLoadedFor.current === selectedEvent.id) return;
    draftLoadedFor.current = selectedEvent.id;
    loadedObsRef.current = selectedEvent.observations ?? "";
    setSent(null);

    let restored = false;
    if (draftKey && !readOnly) {
      try {
        const raw = localStorage.getItem(draftKey);
        if (raw) {
          const d = JSON.parse(raw) as Partial<DraftPayload> | null;
          if (d && typeof d === "object" && Date.now() - (Number(d.timestamp) || 0) < DRAFT_TTL_MS) {
            // Blindagem: o rascunho vem de localStorage (versão antiga, extensão,
            // edição manual) — o shape é reconstruído linha a linha e linha
            // inválida é descartada; um draft corrompido não pode derrubar o render.
            const draftRows = sanitizeDraftRows(d.rows);
            const b = periodBounds(selectedEvent.startDate, selectedEvent.endDate);
            const draftStart = typeof d.periodStart === "string" ? d.periodStart : "";
            const draftEnd = typeof d.periodEnd === "string" ? d.periodEnd : "";
            // Período do rascunho também respeita a margem de ±7 dias do evento.
            const validPeriod = !periodProblem(draftStart, draftEnd)
              && (!b.min || draftStart >= b.min) && (!b.max || draftEnd <= b.max);
            const start = validPeriod ? draftStart : selectedEvent.startDate;
            const end = validPeriod ? draftEnd : selectedEvent.endDate;
            const draftObs = typeof d.eventObservations === "string" ? d.eventObservations : loadedObsRef.current;
            if (draftRows.length > 0 || draftObs !== loadedObsRef.current) {
              loadPeriod(start, end);
              setEventObservations(draftObs);
              setRows(reframeRows(draftRows, buildDateList(start, end)));
              restored = true;
              toast({ title: "Rascunho restaurado", description: `Grade de ${selectedEvent.name} recuperada do rascunho local.` });
            } else {
              localStorage.removeItem(draftKey); // nada aproveitável sobrou do rascunho
            }
          } else {
            localStorage.removeItem(draftKey);
          }
        }
      } catch {
        /* rascunho corrompido: ignora */
      }
    }
    if (!restored) {
      loadPeriod(selectedEvent.startDate, selectedEvent.endDate);
      setEventObservations(loadedObsRef.current);
      setRows([]);
    }
  }, [selectedEvent, draftKey, toast, loadPeriod, readOnly]);

  // Auto-save do rascunho (por usuário + evento), 1,5s após a última alteração.
  // Só grava o período APLICADO (válido) — período inválido nos inputs nunca zera o rascunho.
  const hasContent = rows.length > 0 || eventObservations !== loadedObsRef.current;
  useEffect(() => {
    if (!draftKey || readOnly || draftLoadedFor.current !== eventId) return;
    const t = setTimeout(() => {
      writeDraft(draftKey, { rows, periodStart: applied.start, periodEnd: applied.end, eventObservations }, hasContent);
    }, 1500);
    return () => clearTimeout(t);
  }, [rows, applied, eventObservations, hasContent, draftKey, eventId, readOnly]);

  // Flush do rascunho ao trocar de evento / sair da tela: a última edição não pode se perder no debounce.
  const latestDraft = useRef({ rows, applied, eventObservations, hasContent });
  latestDraft.current = { rows, applied, eventObservations, hasContent };
  useEffect(() => {
    const key = draftKey;
    const forEvent = eventId;
    return () => {
      if (!key || readOnly || draftLoadedFor.current !== forEvent) return;
      const s = latestDraft.current;
      writeDraft(key, { rows: s.rows, periodStart: s.applied.start, periodEnd: s.applied.end, eventObservations: s.eventObservations }, s.hasContent);
    };
  }, [draftKey, eventId, readOnly]);

  // ── Período ──
  const applyPeriod = useCallback((start: string, end: string) => {
    appliedRef.current = { start, end };
    setPeriodStart(start); setPeriodEnd(end); setApplied({ start, end });
    setRows((prev) => (prev.length ? reframeRows(prev, buildDateList(start, end)) : prev));
    setPendingPeriod(null);
  }, []);
  const requestPeriod = useCallback((start: string, end: string) => {
    setPeriodStart(start); setPeriodEnd(end);
    if (periodProblem(start, end)) return; // grade mantém o período anterior; aviso inline explica
    // Margem de ±PERIOD_MARGIN_DAYS imposta também para data digitada (o min/max
    // do input só vale para o seletor): fora dela a grade não muda e o aviso
    // inline (periodError) explica o limite.
    if ((bounds.min && start < bounds.min) || (bounds.max && end > bounds.max)) return;
    const outside = countOutsidePeriod(rowsRef.current, buildDateList(start, end));
    if (outside.pessoasDia > 0) { setPendingPeriod({ start, end, ...outside }); return; }
    applyPeriod(start, end);
  }, [applyPeriod, bounds]);
  /** Volta os inputs ao período aplicado (lê do ref: também é chamado ao fechar o diálogo logo após aplicar). */
  const cancelPendingPeriod = useCallback(() => {
    setPeriodStart(appliedRef.current.start); setPeriodEnd(appliedRef.current.end); setPendingPeriod(null);
  }, []);

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
  const removeRowNow = useCallback((rowId: string) => {
    setRows((prev) => prev.filter((r) => r.rowId !== rowId));
    setConfirmRemove(null);
  }, []);
  const removeRow = useCallback((rowId: string) => {
    const row = rowsRef.current.find((r) => r.rowId === rowId);
    const hasQty = row ? Object.values(row.quantities).some((q) => q > 0) : false;
    if (hasQty) { setConfirmRemove(rowId); return; } // pede confirmação: há quantidades preenchidas
    setRows((prev) => prev.filter((r) => r.rowId !== rowId));
  }, []);
  const rowToRemove = useMemo(() => rows.find((r) => r.rowId === confirmRemove), [rows, confirmRemove]);

  const presentFunctionIds = useMemo(() => new Set(rows.map((r) => r.functionId)), [rows]);
  const toggleToAdd = (id: string) => setSelectedToAdd((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const openAddFunction = () => { setSelectedToAdd(new Set()); setShowAddFunction(true); };
  const addSelectedFunctions = () => {
    const chosen = sortedFunctions.filter((f) => selectedToAdd.has(f.id));
    if (chosen.length === 0) return;
    setRows((prev) => [...prev, ...chosen.map((f) => emptyGridRow(f.id, f.name, dates))]);
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

  // ── Colagem ──
  // Debounce leve: só reanalisa a colagem quando o usuário para de digitar/colar.
  useEffect(() => {
    const t = setTimeout(() => setPasteTextDebounced(pasteText), PASTE_PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [pasteText]);
  const pasteYear = useMemo(
    () => (applied.start || selectedEvent?.startDate || String(new Date().getFullYear())).slice(0, 4),
    [applied.start, selectedEvent],
  );
  const detectedPaste = useMemo(
    () => (pasteTextDebounced.trim() ? detectPasteFormat(pasteTextDebounced, { dayCount: dates.length }) : null),
    [pasteTextDebounced, dates.length],
  );
  /** Resultado da leitura, ao vivo, só para exibição — nada é aplicado na grade aqui. */
  const pastePreview = useMemo(() => {
    if (!showPaste || !pasteTextDebounced.trim()) return null;
    const res = parsePastedRows(
      pasteTextDebounced, functions ?? [], dates, pasteYear,
      pasteFormat === "auto" ? undefined : pasteFormat, { nameMap: pasteNameMap },
    );
    return summarizePaste(res);
  }, [showPaste, pasteTextDebounced, functions, dates, pasteYear, pasteFormat, pasteNameMap]);
  /** Enquanto o debounce não alcança o texto, o resumo mostra "analisando". */
  const pasteAnalyzing = !!pasteText.trim() && pasteText !== pasteTextDebounced;
  /** Nomes a mapear: o que o resumo ao vivo achou (com o que `runPaste` apontou como reserva). */
  const unknownToMap = pastePreview ? pastePreview.unknownNames : unknownNames;
  const pasteApplyCount = pastePreview?.recognized ?? 0;
  /** Avisos do resumo: não impedem aplicar, mas o usuário precisa vê-los antes. */
  const pasteWarnings = useMemo(() => {
    if (!pastePreview) return [];
    const w: string[] = [];
    if (pastePreview.unknownNames.length > 0) w.push(plural(pastePreview.unknownNames.length, "nome não reconhecido", "nomes não reconhecidos"));
    if (pastePreview.outsideDays > 0) w.push(plural(pastePreview.outsideDays, "dia fora do período", "dias fora do período"));
    if (pastePreview.rowsWithoutQty > 0) w.push(plural(pastePreview.rowsWithoutQty, "linha sem quantidade", "linhas sem quantidade"));
    // Avisos do classificador de colunas (ex.: dias alinhados pelo período por
    // falta da linha de datas) — já vêm prontos em pt-BR do parser.
    for (const msg of pastePreview.warnings ?? []) w.push(msg);
    return w;
  }, [pastePreview]);
  // O mapeamento manual de nomes é por usuário (o catálogo é o mesmo em todos os eventos).
  const nameMapKey = `scaling-suggestion-fnmap:${user?.id ?? "anon"}`;
  const readStoredNameMap = useCallback((): Record<string, string> => {
    try {
      const raw = localStorage.getItem(nameMapKey);
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
    } catch { return {}; }
  }, [nameMapKey]);
  const storeNameMap = useCallback((map: Record<string, string>) => {
    try {
      if (Object.keys(map).length === 0) localStorage.removeItem(nameMapKey);
      else localStorage.setItem(nameMapKey, JSON.stringify(map));
    } catch { /* quota / storage indisponível */ }
  }, [nameMapKey]);

  const openPaste = () => {
    setPasteNameMap(readStoredNameMap()); // reaproveita o que o usuário já mapeou antes
    setUnknownNames([]);
    setPasteText(""); setPasteTextDebounced(""); setShowPasteHelp(false);
    askedMappingRef.current = false;
    setShowPaste(true);
  };
  const closePaste = () => {
    setShowPaste(false); setPasteText(""); setPasteTextDebounced(""); setPasteFormat("auto");
    setUnknownNames([]); setPendingPasteDates(null); setShowPasteHelp(false);
    askedMappingRef.current = false;
  };
  const commitPaste = (pasted: SuggestionGridRow[], skippedNames: string[], replaced: number) => {
    setRows((prev) => mergePastedRows(prev, pasted));
    setPendingPaste(null);
    closePaste();
    toast({
      title: "Linhas coladas",
      description: `${pasted.length} linha(s) aplicada(s)${replaced ? `, ${replaced} função(ões) substituída(s)` : ""}.${skippedNames.length ? ` Não encontradas: ${skippedNames.join(", ")}.` : ""}`,
      variant: skippedNames.length ? "destructive" : "default",
    });
  };

  /**
   * Lê a colagem contra um conjunto de dias e aplica — parando antes quando ainda
   * falta uma decisão do usuário: (1) mapear nomes não reconhecidos, (2) decidir o
   * que fazer com os dias fora do período, (3) confirmar a substituição de funções.
   */
  const runPaste = (targetDates: string[], nameMap: Record<string, string>, allowOutside: boolean) => {
    const res = parsePastedRows(pasteText, functions ?? [], targetDates, pasteYear, pasteFormat === "auto" ? undefined : pasteFormat, { nameMap });
    if (res.problem === "cabecalho-nao-encontrado") {
      toast({
        title: "Cabeçalho não encontrado",
        description: "No formato da logística é preciso colar também a linha de cabeçalho (ida, chegada, retorno e as colunas de dia).",
        variant: "destructive",
      });
      return;
    }
    if (res.unknownNames.length > 0 && !askedMappingRef.current) {
      askedMappingRef.current = true;
      setUnknownNames(res.unknownNames);
      toast({
        title: `${res.unknownNames.length} função(ões) não reconhecida(s)`,
        description: "Escolha a função correspondente de cada nome abaixo e aplique de novo. O que ficar sem função é descartado.",
        variant: "destructive",
      });
      return;
    }
    if (!allowOutside && res.datesOutsideGrid.length > 0) {
      setPendingPasteDates({ dates: res.datesOutsideGrid, expansion: expandPeriodForDates(applied, res.datesOutsideGrid, bounds) });
      return;
    }
    if (res.rows.length === 0) {
      toast({
        title: "Nenhuma linha reconhecida",
        description: res.skippedNames.length ? `Funções não encontradas: ${res.skippedNames.join(", ")}.` : "Verifique o formato (colunas separadas por TAB).",
        variant: "destructive",
      });
      return;
    }
    storeNameMap(nameMap); // o mapeamento usado com sucesso vale para as próximas colagens
    const conflicts = pasteConflicts(rowsRef.current, res.rows);
    if (conflicts.length > 0) { setPendingPaste({ rows: res.rows, skippedNames: res.skippedNames, conflicts, format: res.format }); return; }
    commitPaste(res.rows, res.skippedNames, 0);
  };

  const applyPaste = () => {
    if (!pasteText.trim()) {
      toast({ title: "Nada para colar", description: "Cole as linhas da planilha primeiro.", variant: "destructive" });
      return;
    }
    runPaste(dates, pasteNameMap, false);
  };
  /** Amplia a grade para cobrir os dias da planilha e relê a colagem já no novo período. */
  const acceptPasteExpansion = () => {
    const exp = pendingPasteDates?.expansion;
    setPendingPasteDates(null);
    if (!exp || !exp.changed) { runPaste(dates, pasteNameMap, true); return; }
    applyPeriod(exp.start, exp.end);
    runPaste(buildDateList(exp.start, exp.end), pasteNameMap, true);
    if (exp.ignored.length > 0) {
      toast({
        title: "Alguns dias ficaram de fora",
        description: `${exp.ignored.map((d) => formatDayMonthBr(d)).join(", ")} — a grade só pode ir até ${PERIOD_MARGIN_DAYS} dias antes/depois do evento.`,
        variant: "destructive",
      });
    }
  };
  /** Mantém o período e cola assim mesmo: as quantidades dos dias de fora são ignoradas. */
  const rejectPasteExpansion = () => {
    const ignored = pendingPasteDates?.dates ?? [];
    setPendingPasteDates(null);
    runPaste(dates, pasteNameMap, true);
    if (ignored.length > 0) {
      toast({
        title: "Dias ignorados na colagem",
        description: `${ignored.map((d) => formatDayMonthBr(d)).join(", ")} ${ignored.length === 1 ? "ficou" : "ficaram"} fora do período da grade.`,
        variant: "destructive",
      });
    }
  };
  const mapUnknownName = (name: string, value: string) => {
    const key = functionNameKey(name);
    setPasteNameMap((prev) => {
      const next = { ...prev };
      if (value === SKIP_FUNCTION) delete next[key]; else next[key] = value;
      return next;
    });
  };

  const clearGrid = () => {
    setRows([]);
    setEventObservations(loadedObsRef.current);
    if (draftKey) localStorage.removeItem(draftKey);
    setConfirmClear(false);
  };

  // ── Validação / prévia / envio ──
  const issuesByRow = useMemo(() => {
    const m = new Map<string, RowValidation>();
    for (const r of rows) {
      const v = validateGridRow(r);
      if (v.errors.length || v.warnings.length) m.set(r.rowId, v);
    }
    return m;
  }, [rows]);
  const pendencias = useMemo(() => {
    const errors: { rowId: string; text: string }[] = [];
    const warnings: { rowId: string; text: string }[] = [];
    for (const r of rows) {
      const v = issuesByRow.get(r.rowId);
      if (!v) continue;
      for (const e of v.errors) errors.push({ rowId: r.rowId, text: `${r.functionName}: ${e}` });
      for (const w of v.warnings) warnings.push({ rowId: r.rowId, text: `${r.functionName}: ${w}` });
    }
    return { errors, warnings };
  }, [rows, issuesByRow]);
  const focusRow = (rowId: string) => {
    const el = document.getElementById(rowDomId(rowId));
    const input = el?.querySelector<HTMLInputElement>("input[data-qty-cell]");
    (input ?? el)?.scrollIntoView({ block: "center", behavior: "smooth" });
    input?.focus();
  };

  const records = useMemo(() => decomposeGridRows(rows, dates), [rows, dates]);
  const summary = useMemo(() => summarizeGrid(rows, dates), [rows, dates]);
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
      const payload = {
        eventId,
        ...(eventObservations !== loadedObsRef.current ? { eventObservations } : {}),
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
      // Comentários já foram gravados no evento: passam a ser a base "carregada".
      loadedObsRef.current = eventObservations;
      if (draftKey) localStorage.removeItem(draftKey);
      setRows([]);
      setConfirmSend(false);
      setSent({ created: data.created, eventId, eventName: selectedEvent?.name ?? "" });
      toast({ title: "Escala enviada para validação", description: `${data.created} vaga(s) criada(s) e enviada(s) às áreas.` });
    },
    onError: (err: ApiError) => {
      setConfirmSend(false);
      toast({ title: "Não foi possível enviar", description: apiErrorMessage(err, "Nenhuma vaga foi criada. Revise a grade e tente novamente."), variant: "destructive" });
    },
  });
  // ── Cancelar envio ──
  // Resumo do que já está na Validação (a mesma regra do servidor decide o que
  // entra na conta: pendente, validada e com pedido — nunca o que virou
  // Inclusão nem o que foi negado).
  const sentSummary = useMemo(() => summarizeCancelableSuggestions(sentQuery.data ?? []), [sentQuery.data]);
  // O aviso anti-duplicação não pode falhar em silêncio: enquanto não se sabe o
  // que este evento JÁ tem na Validação (consulta falhou ou ainda carregando),
  // o Enviar fica bloqueado — enviar às cegas poderia duplicar a escala inteira.
  const sentCheckFailed = !!eventId && sentQuery.isError;
  const sentCheckLoading = !!eventId && sentQuery.isLoading;
  const sendBlocked = sentCheckFailed || sentCheckLoading;

  const cancelSendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `${SUGGESTIONS_QUERY_KEY}?eventId=${encodeURIComponent(eventId)}`);
      return (await res.json()) as { removed: number; requestsCanceled: number };
    },
    onSuccess: (data) => {
      invalidateScalingQueries(queryClient);
      setConfirmCancelSend(false);
      setSent(null); // libera a barra de ação: a tela volta a permitir montar e enviar
      toast({
        title: data.removed > 0 ? "Envio cancelado" : "Nada para cancelar",
        description: data.removed > 0
          ? `${data.removed} vaga(s) removida(s) da Validação${data.requestsCanceled > 0 ? ` e ${data.requestsCanceled} pedido(s) encerrado(s)` : ""}. Monte a grade de novo e envie quando quiser.`
          : "Este evento não tem mais vagas em validação — a lista já estava vazia.",
      });
    },
    onError: (err: ApiError) => {
      setConfirmCancelSend(false);
      toast({
        title: "Não foi possível cancelar o envio",
        description: apiErrorMessage(err, "Nenhuma vaga foi removida. Tente novamente."),
        variant: "destructive",
      });
    },
  });

  // "busy" trava a edição: enquanto envia OU em modo leitura.
  const busy = sendMutation.isPending || readOnly;

  const openConfirmSend = () => {
    if (!eventId) { toast({ title: "Selecione o evento", variant: "destructive" }); return; }
    if (sendBlocked) {
      toast({
        title: "Não dá para enviar ainda",
        description: sentCheckFailed
          ? "Não foi possível verificar se este evento já tem vagas enviadas. Use “Tentar novamente” no aviso acima antes de enviar."
          : "Verificando se este evento já tem vagas enviadas — aguarde um instante.",
        variant: "destructive",
      });
      return;
    }
    if (records.length === 0) { toast({ title: "Grade vazia", description: "Informe ao menos uma quantidade na grade.", variant: "destructive" }); return; }
    if (pendencias.errors.length > 0) {
      const texts = pendencias.errors.map((e) => e.text);
      toast({ title: "Revise a grade", description: texts.slice(0, 3).join(" · ") + (texts.length > 3 ? ` (+${texts.length - 3})` : ""), variant: "destructive" });
      focusRow(pendencias.errors[0].rowId);
      return;
    }
    setConfirmSend(true);
  };

  const gridReady = !!eventId && dates.length > 0;
  const vagasLabel = `${records.length} ${records.length === 1 ? "vaga" : "vagas"}`;

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
        actions={<ScalingModuleNav current="suggestion" eventId={eventId} />}
      />

      {readOnly && (
        <div role="note" className="flex items-start gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700">
          <Eye className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
          <span><span className="font-semibold">Modo leitura</span> — só Produção/Admin montam e enviam sugestões. Você pode consultar o evento e seguir para as outras telas do módulo.</span>
        </div>
      )}

      {eventsError ? (
        <div className="rounded-2xl border border-red-200 bg-white p-6 text-center">
          <p className="text-sm font-semibold text-slate-700">Não foi possível carregar os eventos</p>
          <p className="text-xs text-slate-500 mt-1">{apiErrorMessage(eventsError, "Verifique sua conexão e tente novamente.")}</p>
          <Button variant="outline" size="sm" className="mt-3 rounded-lg" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/events"] })}>Tentar novamente</Button>
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
            <h2 id="sug-evento" className={SECTION_TITLE}>Evento</h2>
            <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <div className="space-y-1.5">
                <span id="sug-event-label" className={cn(HINT, "block font-medium leading-none")}>Evento <span className="text-red-500" aria-hidden="true">*</span></span>
                <div role="group" aria-labelledby="sug-event-label">
                  <EventCombobox events={activeEvents} value={eventId} onValueChange={(v) => setEventId(v === "all" ? "" : v)} placeholder="Selecione um evento" showAllOption={false} testId="scaling-suggestion-event" />
                </div>
                {selectedEvent && (
                  <p className={HINT}>
                    Período do evento: <span className="font-mono">{formatDateRange(selectedEvent.startDate, selectedEvent.endDate, { withYear: true })}</span>
                    {selectedEvent.location ? ` · ${selectedEvent.location}` : ""}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sug-period-start" className={cn(HINT, "font-medium")}>Início da grade</Label>
                <Input id="sug-period-start" type="date" value={periodStart} disabled={!eventId || busy}
                  min={bounds.min || undefined} max={bounds.max || undefined}
                  aria-invalid={!!periodError} aria-describedby={periodError ? "sug-period-error" : "sug-period-hint"}
                  onChange={(e) => requestPeriod(e.target.value, periodEnd)} className="h-9 rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sug-period-end" className={cn(HINT, "font-medium")}>Fim da grade</Label>
                <Input id="sug-period-end" type="date" value={periodEnd} disabled={!eventId || busy}
                  min={periodStart || bounds.min || undefined} max={bounds.max || undefined}
                  aria-invalid={!!periodError} aria-describedby={periodError ? "sug-period-error" : "sug-period-hint"}
                  onChange={(e) => requestPeriod(periodStart, e.target.value)} className="h-9 rounded-lg" />
              </div>
            </div>
            {periodError ? (
              <p id="sug-period-error" role="alert" className="flex items-start gap-1.5 text-xs text-red-700 -mt-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" /> {periodError}
              </p>
            ) : (
              <p id="sug-period-hint" className={cn(HINT, "-mt-2")}>
                A grade pode começar até {PERIOD_MARGIN_DAYS} dias antes e terminar até {PERIOD_MARGIN_DAYS} dias depois do evento.
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="sug-event-obs" className={cn(HINT, "font-medium")}>Comentários gerais do evento</Label>
              <Textarea id="sug-event-obs" value={eventObservations} disabled={!eventId || busy} rows={3} maxLength={2000}
                placeholder="Orientações gerais para as áreas (horários de montagem, ponto de encontro, restrições…)."
                onChange={(e) => setEventObservations(e.target.value)} className="rounded-lg text-sm" />
              <p className={HINT}>Salvo nas observações do evento junto com o envio da escala.</p>
            </div>
          </section>

          {/* Pós-envio */}
          {sent && (
            <section role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5" aria-labelledby="sug-sent">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" aria-hidden="true" />
                  <div>
                    <h2 id="sug-sent" className="text-sm font-semibold text-emerald-900">
                      {sent.created} {sent.created === 1 ? "vaga enviada" : "vagas enviadas"} para {sent.eventName}
                    </h2>
                    <p className="text-xs text-emerald-800 mt-0.5">As áreas responsáveis já veem as vagas na Validação de Escala.</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs font-medium">
                      <Link href={scalingHref("/scaling-validation", sent.eventId)} className="inline-flex items-center gap-1 text-primary hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /> Ver na Validação
                      </Link>
                      <Link href={scalingHref("/scaling-event-view", sent.eventId)} className="inline-flex items-center gap-1 text-primary hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                        <History className="w-3.5 h-3.5" aria-hidden="true" /> Histórico da Escala
                      </Link>
                      {/* Desfazer aqui mesmo: é neste instante que o usuário percebe o evento/quantidade errados. */}
                      {!readOnly && sentSummary.total > 0 && (
                        <button
                          type="button"
                          onClick={() => setConfirmCancelSend(true)}
                          disabled={cancelSendMutation.isPending}
                          className="inline-flex items-center gap-1 text-red-700 hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-60"
                          data-testid="scaling-suggestion-cancel-send-after"
                        >
                          <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
                          {cancelSendMutation.isPending ? "Cancelando…" : "Cancelar envio"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <Button type="button" variant="outline" size="sm" className="rounded-lg h-8 bg-white" onClick={() => setSent(null)}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Nova sugestão
                </Button>
              </div>
            </section>
          )}

          {/* A verificação anti-duplicação falhou: sem saber o que já foi enviado,
              o Enviar fica bloqueado — o usuário resolve aqui, não descobre depois. */}
          {sentCheckFailed && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
              <div className="flex items-start gap-2 text-xs text-red-800 min-w-0">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-red-600" aria-hidden="true" />
                <span>
                  <span className="font-semibold">Não foi possível verificar se este evento já tem vagas enviadas.</span>{" "}
                  {apiErrorMessage(sentQuery.error as ApiError, "Verifique sua conexão.")}{" "}
                  O envio fica bloqueado até essa verificação funcionar — enviar às cegas poderia duplicar a escala.
                </span>
              </div>
              <Button
                type="button" variant="outline" size="sm" className="rounded-lg h-8 bg-white"
                disabled={sentQuery.isFetching}
                onClick={() => sentQuery.refetch()}
                data-testid="scaling-suggestion-sent-retry"
              >
                {sentQuery.isFetching ? "Verificando…" : "Tentar novamente"}
              </Button>
            </div>
          )}

          {/* Envio já feito para este evento: acompanhar ou desfazer.
              Escondido logo depois de enviar — ali o aviso verde acima já traz
              o mesmo "Cancelar envio" e repetir o bloco só faria ruído. */}
          {sentSummary.total > 0 && !sent && (
            <section role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5" aria-labelledby="sug-ja-enviado">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="min-w-0">
                    <h2 id="sug-ja-enviado" className="text-sm font-semibold text-amber-900">
                      Este evento já tem {sentSummary.total} {sentSummary.total === 1 ? "vaga enviada" : "vagas enviadas"} para validação
                    </h2>
                    <p className="text-xs text-amber-800 mt-0.5 tabular-nums">
                      {[
                        `${sentSummary.aguardando} aguardando validação`,
                        `${sentSummary.validadas} ${sentSummary.validadas === 1 ? "validada" : "validadas"} pela área`,
                        `${sentSummary.comPedido} com pedido em aberto`,
                      ].join(" · ")}
                    </p>
                    <p className="text-xs text-amber-800 mt-1">
                      Enviar de novo <strong>soma</strong> vagas às que já estão lá. Se a grade subiu errada, cancele o envio e monte de novo.
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs font-medium">
                      <Link href={scalingHref("/scaling-validation", eventId)} className="inline-flex items-center gap-1 text-primary hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /> Acompanhar na Validação
                      </Link>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => setConfirmCancelSend(true)}
                          disabled={cancelSendMutation.isPending}
                          className="inline-flex items-center gap-1 text-red-700 hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-60"
                          data-testid="scaling-suggestion-cancel-send"
                        >
                          <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
                          {cancelSendMutation.isPending ? "Cancelando…" : "Cancelar envio"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Grade */}
          <section className="space-y-3" aria-labelledby="sug-grade">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <h2 id="sug-grade" className={SECTION_TITLE}>Grade função × dia</h2>
                {/* Única região aria-live da tela: resume o que muda a cada edição. */}
                <span className="text-xs text-slate-600 tabular-nums" aria-live="polite" aria-atomic="true">
                  {rows.length > 0 && (
                    <>
                      {summary.funcoes} {summary.funcoes === 1 ? "linha" : "linhas"} · {summary.pessoasDia} pessoas-dia · <span className="font-semibold text-slate-800">{vagasLabel}</span>
                    </>
                  )}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="rounded-lg h-8" disabled={!gridReady || busy || !!functionsError} onClick={openPaste}>
                  <ClipboardPaste className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Colar da planilha
                </Button>
                <Button type="button" variant="outline" size="sm" className="rounded-lg h-8" disabled={!gridReady || busy || !!functionsError} onClick={openAddFunction}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Adicionar função
                </Button>
                <Button type="button" variant="ghost" size="sm" className="rounded-lg h-8 text-slate-600" disabled={(!hasContent) || busy} onClick={() => setConfirmClear(true)}>
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Limpar
                </Button>
              </div>
            </div>

            {!eventId ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
                Selecione um evento para montar a grade.
              </div>
            ) : dates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
                Informe um período válido para a grade.
              </div>
            ) : (
              <>
                {(pendencias.errors.length > 0 || pendencias.warnings.length > 0) && (
                  <div className={cn("rounded-xl border px-3 py-2 text-xs", pendencias.errors.length > 0 ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800")}>
                    <div className="flex items-start gap-2">
                      <AlertTriangle className={cn("w-3.5 h-3.5 mt-0.5 shrink-0", pendencias.errors.length > 0 ? "text-red-600" : "text-amber-600")} aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">
                          {pendencias.errors.length > 0
                            ? `${pendencias.errors.length} ${pendencias.errors.length === 1 ? "pendência impede" : "pendências impedem"} o envio`
                            : `${pendencias.warnings.length} ${pendencias.warnings.length === 1 ? "aviso" : "avisos"} (não impedem o envio)`}
                        </p>
                        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                          {[...pendencias.errors, ...pendencias.warnings.map((w) => ({ ...w, warn: true }))].map((p, i) => (
                            <li key={`${p.rowId}-${i}`}>
                              <button type="button" onClick={() => focusRow(p.rowId)}
                                className={cn("underline underline-offset-2 rounded hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current", "warn" in p && pendencias.errors.length > 0 && "text-amber-800")}>
                                {p.text}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
                <SuggestionGrid
                  rows={rows} dates={dates} issuesByRow={issuesByRow}
                  onChangeRow={changeRow} onChangeQty={changeQty}
                  onDuplicateRow={duplicateRow} onRemoveRow={removeRow}
                  disabled={busy}
                />
              </>
            )}
          </section>

          {/* Prévia */}
          {gridReady && !readOnly && (
            <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden" aria-labelledby="sug-previa">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                <h2 id="sug-previa" className={SECTION_TITLE}>Prévia das vagas que serão criadas</h2>
              </div>
              {records.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-5 italic">Nenhuma vaga configurada ainda — preencha as quantidades por dia.</p>
              ) : (
                <div className="max-h-[360px] overflow-y-auto">
                  {previewGroups.map((group, gi) => (
                    <div key={group.key} className={gi > 0 ? "border-t border-slate-100" : ""}>
                      <div className="flex items-center justify-between px-4 py-1.5 bg-slate-50/70">
                        <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary/40 shrink-0" aria-hidden="true" />
                          {group.functionName}
                        </span>
                        <span className="text-xs text-slate-500 tabular-nums">{group.records.length} {group.records.length === 1 ? "vaga" : "vagas"}</span>
                      </div>
                      {group.records.map((rec, i) => {
                        const ida = rec.transportModeIda ? `Ida ${TRANSPORT_MODE_LABELS[rec.transportModeIda]}${rec.flightDepartureDate ? ` ${formatDayMonthBr(rec.flightDepartureDate)}` : ""}${rec.flightArrivalSuggestedTime ? ` ${rec.flightArrivalSuggestedTime}` : ""}` : "";
                        const volta = rec.transportModeVolta ? `Volta ${TRANSPORT_MODE_LABELS[rec.transportModeVolta]}${rec.flightReturnDate ? ` ${formatDayMonthBr(rec.flightReturnDate)}` : ""}${rec.flightReturnSuggestedTime ? ` ${rec.flightReturnSuggestedTime}` : ""}` : "";
                        const logistica = [ida, volta].filter(Boolean).join(" · ");
                        return (
                          <div key={`${group.key}-${i}`} className={cn("grid grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[auto_auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 pl-8 pr-4 py-1.5 text-xs", i % 2 === 1 ? "bg-slate-50/40" : "bg-white")}>
                            <span className="text-slate-700 font-semibold bg-slate-100 rounded-full px-2 py-0.5 whitespace-nowrap">{formatDiarias(rec.dailyRates)}</span>
                            <span className="text-slate-600 font-mono tabular-nums break-words">{rec.workDays.map((d) => formatDayMonthBr(d)).join(", ")}</span>
                            <span className="col-span-2 sm:col-span-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-500 min-w-0">
                              {logistica && <span className="break-words">{logistica}</span>}
                              {rec.needsAccommodation && <span className="text-xs font-semibold uppercase text-sky-800 bg-sky-50 rounded px-1.5 py-0.5">Hotel</span>}
                              {rec.needsTicket && <span className="text-xs font-semibold uppercase text-violet-800 bg-violet-50 rounded px-1.5 py-0.5">Passagem</span>}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Barra de ação (sticky) */}
          {gridReady && !sent && !readOnly && (
            <div className="sticky bottom-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pb-3 pt-2 bg-gradient-to-t from-background via-background to-transparent">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur px-4 py-3 shadow-lg">
                <div className="min-w-0">
                  <p className="text-sm text-slate-700">
                    <span className="font-semibold text-slate-900 tabular-nums">{vagasLabel}</span>
                    {records.length > 0 && <span className="text-slate-500"> · {summary.pessoasDia} pessoas-dia em {summary.funcoes} {summary.funcoes === 1 ? "linha" : "linhas"}</span>}
                    {pendencias.warnings.length > 0 && pendencias.errors.length === 0 && <span className="text-amber-700"> · {pendencias.warnings.length} {pendencias.warnings.length === 1 ? "aviso" : "avisos"}</span>}
                  </p>
                  <p className={cn(HINT, "flex items-center gap-1.5 mt-0.5")}>
                    <Save className="w-3.5 h-3.5" aria-hidden="true" /> Rascunho salvo automaticamente neste navegador (por evento).
                  </p>
                </div>
                <Button
                  type="button" onClick={openConfirmSend}
                  disabled={records.length === 0 || busy || pendencias.errors.length > 0 || sendBlocked}
                  title={sentCheckFailed ? "Bloqueado: não foi possível verificar as vagas já enviadas deste evento." : undefined}
                  className="rounded-xl bg-primary hover:bg-primary-hover"
                >
                  <Send className="w-4 h-4 mr-2" aria-hidden="true" />
                  {busy ? "Enviando…" : sentCheckLoading ? "Verificando envios…" : "Enviar para validação"}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Adicionar função (multi-seleção) */}
      <Dialog open={showAddFunction} onOpenChange={(o) => { if (!o) setShowAddFunction(false); }}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle>Adicionar funções à grade</DialogTitle>
            <DialogDescription>Marque uma ou mais funções. A mesma função pode entrar mais de uma vez (ex.: turmas com dias de viagem diferentes).</DialogDescription>
          </DialogHeader>
          <Command className="border-t border-slate-100">
            <CommandInput placeholder="Buscar função…" />
            <CommandList className="max-h-[300px]">
              <CommandEmpty>Nenhuma função encontrada.</CommandEmpty>
              <CommandGroup>
                {sortedFunctions.map((f) => {
                  const checked = selectedToAdd.has(f.id);
                  return (
                    <CommandItem key={f.id} value={f.name} onSelect={() => toggleToAdd(f.id)} data-checked={checked || undefined} className="gap-2">
                      <span aria-hidden="true" className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", checked ? "bg-primary border-primary text-primary-foreground" : "border-slate-300 bg-white")}>
                        {checked && <Check className="h-3 w-3" />}
                      </span>
                      <span className="flex-1 truncate">{f.name}</span>
                      {presentFunctionIds.has(f.id) && <span className="text-xs text-slate-500 shrink-0">na grade</span>}
                      {f.responsibleArea && <span className="text-xs text-slate-500 shrink-0">{f.responsibleArea}</span>}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
          <DialogFooter className="px-5 py-3 border-t border-slate-100 sm:justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" className="rounded-lg" onClick={addAllFunctions}>Adicionar todas que faltam</Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => setShowAddFunction(false)}>Cancelar</Button>
              <Button type="button" size="sm" className="rounded-lg bg-primary hover:bg-primary-hover" disabled={selectedToAdd.size === 0} onClick={addSelectedFunctions}>
                Adicionar{selectedToAdd.size > 0 ? ` (${selectedToAdd.size})` : ""}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Colar da planilha */}
      <Dialog open={showPaste} onOpenChange={(o) => { if (!o) closePaste(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] p-0 gap-0 grid-rows-[auto_minmax(0,1fr)_auto]">
          <DialogHeader className="px-4 sm:px-5 pt-5 pb-3 pr-12">
            <DialogTitle>Colar da planilha</DialogTitle>
            <DialogDescription>Copie as linhas no Excel e cole aqui — o formato é reconhecido sozinho.</DialogDescription>
          </DialogHeader>

          {/* Corpo rolável: campo primeiro, resumo depois, ajuda no fim (recolhida). */}
          <div className="overflow-y-auto px-4 sm:px-5 pb-4 space-y-3">
            <Label htmlFor="sug-paste" className="sr-only">Conteúdo colado</Label>
            {/* Mudou o conteúdo colado → os nomes não reconhecidos são perguntados de novo. */}
            <Textarea
              id="sug-paste" autoFocus value={pasteText} rows={9} placeholder="Cole aqui (Ctrl+V)"
              onChange={(e) => { setPasteText(e.target.value); askedMappingRef.current = false; }}
              className="font-mono text-xs rounded-lg min-h-[180px] placeholder:font-sans placeholder:text-sm placeholder:text-slate-400"
            />

            {/* Resumo ao vivo da leitura (nada é aplicado até clicar em "Aplicar"). */}
            {pasteText.trim() !== "" && (
              <div
                role="status" aria-live="polite"
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs",
                  pasteAnalyzing || !pastePreview ? "border-slate-200 bg-slate-50 text-slate-600"
                    : pastePreview.recognized > 0 ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-amber-300 bg-amber-50 text-amber-900",
                )}
              >
                {pasteAnalyzing || !pastePreview ? (
                  <span>Analisando o que você colou…</span>
                ) : pastePreview.recognized > 0 ? (
                  <>
                    <p className="flex items-start gap-1.5 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5 mt-px shrink-0 text-emerald-600" aria-hidden="true" />
                      <span>{PASTE_FORMAT_LABELS[pastePreview.format]}{pastePreview.hadHeader ? " · cabeçalho ignorado" : ""}</span>
                    </p>
                    <p className="mt-1 tabular-nums">
                      {plural(pastePreview.lines, "linha lida", "linhas lidas")} · {plural(pastePreview.recognized, "função reconhecida", "funções reconhecidas")} · {plural(pastePreview.mappedDays, "dia mapeado", "dias mapeados")}
                    </p>
                    {pasteWarnings.length > 0 && (
                      <p className="mt-1 flex items-start gap-1.5 text-amber-800">
                        <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0 text-amber-600" aria-hidden="true" />
                        <span>{pasteWarnings.join(" · ")}</span>
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="flex items-start gap-1.5 font-semibold">
                      <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0 text-amber-600" aria-hidden="true" />
                      <span>
                        {pastePreview.problem === "cabecalho-nao-encontrado"
                          ? "Não consegui identificar o cabeçalho — escolha o formato abaixo."
                          : "Nenhuma linha reconhecida."}
                      </span>
                    </p>
                    <p className="mt-1">
                      {pastePreview.problem === "cabecalho-nao-encontrado"
                        ? "No formato da logística é preciso colar também a linha de cabeçalho (ida, chegada, retorno e as colunas de dia)."
                        : pastePreview.unknownNames.length > 0
                          ? "Nenhum dos nomes está no catálogo — aponte a função de cada um abaixo."
                          : "Confira se as colunas vieram separadas por TAB (copie direto do Excel)."}
                    </p>
                  </>
                )}
                {!pasteAnalyzing && pastePreview && (
                  <button
                    type="button" onClick={() => setShowPasteHelp(true)}
                    className="mt-1.5 underline underline-offset-2 hover:opacity-80 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
                  >
                    {pasteFormat === "auto"
                      ? "Não reconheceu? Escolher o formato"
                      : `Formato definido à mão: ${PASTE_FORMAT_LABELS[pasteFormat]} — trocar`}
                  </button>
                )}
              </div>
            )}

            {/* Nomes que o catálogo não reconheceu: o usuário aponta a função certa antes de aplicar */}
            {unknownToMap.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-2">
                <div>
                  <p className="text-xs font-semibold text-amber-900">
                    {plural(unknownToMap.length, "nome não reconhecido", "nomes não reconhecidos")}
                  </p>
                  <p className="text-[11px] text-amber-800 mt-0.5">Escolha a função equivalente ou descarte a linha. As escolhas ficam salvas neste navegador.</p>
                </div>
                <ul className="space-y-1.5 max-h-44 overflow-y-auto">
                  {unknownToMap.map((name) => {
                    const key = functionNameKey(name);
                    return (
                      <li key={key} className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-slate-700 truncate max-w-[180px]" title={name}>{name}</span>
                        <span aria-hidden="true" className="text-amber-700 text-xs">→</span>
                        <Select value={pasteNameMap[key] ?? SKIP_FUNCTION} onValueChange={(v) => mapUnknownName(name, v)}>
                          <SelectTrigger aria-label={`Função para ${name}`} className="h-8 w-[260px] max-w-full text-xs rounded-lg bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SKIP_FUNCTION}>Descartar esta linha</SelectItem>
                            {sortedFunctions.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Ajuda: formatos aceitos + escolha manual do formato (fechado por padrão) */}
            <details
              open={showPasteHelp}
              onToggle={(e) => setShowPasteHelp((e.currentTarget as HTMLDetailsElement).open)}
              className="rounded-lg border border-slate-200 bg-slate-50/70"
            >
              <summary className="cursor-pointer select-none rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 marker:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                Formatos aceitos
              </summary>
              <div className="border-t border-slate-200 px-3 py-2.5 space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Label htmlFor="sug-paste-format" className={cn(HINT, "font-medium")}>Formato</Label>
                  <Select value={pasteFormat} onValueChange={(v) => setPasteFormat(v as "auto" | PasteFormat)}>
                    <SelectTrigger id="sug-paste-format" className="h-8 w-[320px] max-w-full text-xs rounded-lg bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Detectar automaticamente</SelectItem>
                      <SelectItem value="logistica">{PASTE_FORMAT_LABELS.logistica}</SelectItem>
                      <SelectItem value="briefing">{PASTE_FORMAT_LABELS.briefing}</SelectItem>
                      <SelectItem value="grade">{PASTE_FORMAT_LABELS.grade}</SelectItem>
                    </SelectContent>
                  </Select>
                  {pasteFormat === "auto" && detectedPaste && (
                    <span className={HINT}>Detectado: {PASTE_FORMAT_LABELS[detectedPaste.format]}{detectedPaste.hadHeader ? " (com cabeçalho)" : ""}.</span>
                  )}
                </div>

                <div className="space-y-2 text-xs">
                  <div className="rounded-lg bg-white border border-slate-200 px-3 py-2 space-y-1">
                    <p className="font-semibold text-slate-700">Planilha da logística</p>
                    <p className="font-mono text-slate-600 whitespace-nowrap overflow-x-auto">(vazio) | ida | chegada (até…) | retorno | horario do retorno (a partir) | (vazio) | 08/set | 09/set | … | obs</p>
                    <p className="font-mono text-slate-500 whitespace-nowrap overflow-x-auto">ex.: produção → quarta-feira, 9 de setembro de 2026 → 23h → domingo, 13 de setembro de 2026 → 20h+ → … → 1 → 1</p>
                    <p className="text-slate-500">
                      As colunas são lidas pelo <strong>cabeçalho</strong> (colunas vazias no meio não atrapalham) e as quantidades pela <strong>data</strong> de cada coluna de dia.
                      A coluna "chegada (até…)" vira o horário de <strong>desembarque da ida</strong> e "horario do retorno (a partir)" o de <strong>embarque da volta</strong> —
                      em "14-18h" e "20h+" vale a primeira hora. Quem tem data de ida ou de volta já vem com <strong>passagem</strong> marcada (as linhas "local" não);
                      hotel e os modais de ida/volta ficam em branco para você preencher na grade.
                    </p>
                  </div>
                  <div className="rounded-lg bg-white border border-slate-200 px-3 py-2 space-y-1 overflow-x-auto">
                    <p className="font-semibold text-slate-700">Formato do briefing</p>
                    <p className="font-mono text-slate-600 whitespace-nowrap">Função | Modal ida | Data ida | Hora desembarque | Modal volta | Data volta | Hora embarque | Hotel | {dates.slice(0, 3).map((d) => formatDayMonthBr(d)).join(" | ")}{dates.length > 3 ? " | …" : ""}</p>
                    <p className="font-mono text-slate-500 whitespace-nowrap">ex.: Kit → Aéreo → 09/09 → 10:00 → Aéreo → 13/09 → 18:00 → sim → 1 → 1 → 2</p>
                  </div>
                  <div className="rounded-lg bg-white border border-slate-200 px-3 py-2 space-y-1 overflow-x-auto">
                    <p className="font-semibold text-slate-700">Formato completo</p>
                    <p className="font-mono text-slate-600 whitespace-nowrap">Função | Modal ida | Data ida | Hora desembarque | Modal volta | Data volta | Hora embarque | Hotel | Passagem | Observação | {dates.slice(0, 3).map((d) => formatDayMonthBr(d)).join(" | ")}{dates.length > 3 ? " | …" : ""}</p>
                    <p className="font-mono text-slate-500 whitespace-nowrap">ex.: Kit → Aéreo → 09/09 → 10:00 → Aéreo → 13/09 → 18:00 → sim → sim → obs → 1 → 1 → 2</p>
                  </div>
                  <p className={HINT}>Colunas separadas por TAB. Funções já na grade são substituídas pelas coladas (sem duplicar).</p>
                </div>
              </div>
            </details>
          </div>

          <DialogFooter className="px-4 sm:px-5 py-3 border-t border-slate-200 bg-slate-50/60 gap-2">
            <Button type="button" variant="outline" className="rounded-lg" onClick={closePaste}>Cancelar</Button>
            <Button type="button" onClick={applyPaste} disabled={pasteApplyCount === 0} className="rounded-lg bg-primary hover:bg-primary-hover">
              {pasteApplyCount > 0 ? `Aplicar ${plural(pasteApplyCount, "linha", "linhas")}` : "Aplicar na grade"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Colagem: substituir funções já na grade */}
      <AlertDialog open={!!pendingPaste} onOpenChange={(o) => { if (!o) setPendingPaste(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Substituir {pendingPaste?.conflicts.length} {pendingPaste?.conflicts.length === 1 ? "função" : "funções"} já na grade?</AlertDialogTitle>
            <AlertDialogDescription>
              As linhas de <strong>{pendingPaste?.conflicts.join(", ")}</strong> serão substituídas pelas coladas (quantidades e dados de viagem). As demais linhas da grade ficam como estão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingPaste && commitPaste(pendingPaste.rows, pendingPaste.skippedNames, pendingPaste.conflicts.length)} className="bg-primary hover:bg-primary-hover">
              Substituir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Colagem: a planilha tem dias fora do período da grade */}
      <AlertDialog open={!!pendingPasteDates} onOpenChange={(o) => { if (!o) setPendingPasteDates(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              A planilha tem {pendingPasteDates?.dates.length} {pendingPasteDates?.dates.length === 1 ? "dia" : "dias"} fora do período da grade
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingPasteDates && (
                <>
                  A grade cobre {formatDateRange(applied.start, applied.end)} e a planilha traz quantidades em{" "}
                  <strong>{pendingPasteDates.dates.map((d) => formatDayMonthBr(d)).join(", ")}</strong>.{" "}
                  {pendingPasteDates.expansion.changed ? (
                    <>Posso ajustar o período para {formatDateRange(pendingPasteDates.expansion.start, pendingPasteDates.expansion.end)} e colar tudo.{" "}
                      {pendingPasteDates.expansion.ignored.length > 0 && (
                        <>Mesmo assim, {pendingPasteDates.expansion.ignored.map((d) => formatDayMonthBr(d)).join(", ")} continuam de fora
                          (a grade só vai até {PERIOD_MARGIN_DAYS} dias antes/depois do evento).{" "}</>
                      )}
                    </>
                  ) : (
                    <>Não dá para ampliar a grade até esses dias (limite de {PERIOD_MARGIN_DAYS} dias antes/depois do evento). Colando assim, eles são ignorados.{" "}</>
                  )}
                  Mantendo o período, as quantidades desses dias são descartadas.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={rejectPasteExpansion}>Manter período e ignorar</AlertDialogCancel>
            {pendingPasteDates?.expansion.changed && (
              <AlertDialogAction onClick={acceptPasteExpansion} className="bg-primary hover:bg-primary-hover">Ajustar o período</AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Encolher período com quantidades fora */}
      <AlertDialog open={!!pendingPeriod} onOpenChange={(o) => { if (!o) cancelPendingPeriod(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar quantidades fora do novo período?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingPeriod && (
                <>
                  <strong>{pendingPeriod.pessoasDia} pessoas-dia</strong> em <strong>{pendingPeriod.dias} {pendingPeriod.dias === 1 ? "dia" : "dias"}</strong> fora do novo período
                  ({formatDateRange(pendingPeriod.start, pendingPeriod.end)}) serão descartados. As demais quantidades continuam na grade.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelPendingPeriod}>Manter período</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingPeriod && applyPeriod(pendingPeriod.start, pendingPeriod.end)} className="bg-destructive hover:bg-destructive/90">
              Descartar e aplicar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmar remoção de linha com quantidades */}
      <AlertDialog open={!!confirmRemove} onOpenChange={(o) => { if (!o) setConfirmRemove(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover a linha {rowToRemove?.functionName}?</AlertDialogTitle>
            <AlertDialogDescription>Ela tem quantidades preenchidas — serão descartadas junto com os dados de viagem da linha.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmRemove && removeRowNow(confirmRemove)} className="bg-destructive hover:bg-destructive/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmar envio */}
      <AlertDialog open={confirmSend} onOpenChange={setConfirmSend}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar escala para validação?</AlertDialogTitle>
            <AlertDialogDescription>
              Serão criadas <strong>{records.length}</strong> vaga(s) sugerida(s) para <strong>{selectedEvent?.name}</strong> e as áreas responsáveis passam a vê-las na Validação de Escala. A operação é única: ou todas entram, ou nenhuma.
              {pendencias.warnings.length > 0 && <> Há {pendencias.warnings.length} {pendencias.warnings.length === 1 ? "aviso" : "avisos"} na grade (passagem sem datas) — o envio segue mesmo assim.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); sendMutation.mutate(); }} disabled={busy} className="bg-primary hover:bg-primary-hover">
              {busy ? "Enviando…" : "Enviar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmar cancelamento do envio (remove TUDO que está na Validação) */}
      <AlertDialog open={confirmCancelSend} onOpenChange={(o) => { if (!o) setConfirmCancelSend(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Cancelar o envio e remover {sentSummary.total} {sentSummary.total === 1 ? "vaga" : "vagas"} de {selectedEvent?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <span className="block">
                Serão removidas <strong>todas as {sentSummary.total} {sentSummary.total === 1 ? "vaga" : "vagas"}</strong> deste evento que estão na Validação de Escala —
                {" "}<strong>inclusive as {sentSummary.validadas} que a área já validou</strong> e as {sentSummary.comPedido} com pedido em aberto,
                cujos pedidos pendentes são encerrados na fila do aprovador.
              </span>
              <span className="block mt-2">
                As vagas já <strong>aprovadas</strong> (que viraram Inclusão de Equipe) e as já negadas <strong>não</strong> são afetadas.
                As áreas deixam de ver as vagas removidas na hora. Não há como desfazer — para voltar, monte a grade e envie de novo.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelSendMutation.isPending}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); cancelSendMutation.mutate(); }}
              disabled={cancelSendMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="scaling-suggestion-cancel-send-confirm"
            >
              {cancelSendMutation.isPending ? "Cancelando…" : "Cancelar envio e remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmar limpar */}
      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar a grade?</AlertDialogTitle>
            <AlertDialogDescription>Todas as linhas, os comentários gerais editados e o rascunho local deste evento serão descartados. Nada é apagado no servidor.</AlertDialogDescription>
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
