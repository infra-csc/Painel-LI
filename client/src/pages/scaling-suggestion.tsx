import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertTriangle, CalendarDays, Check, CheckCircle2, ChevronRight, ClipboardPaste, ExternalLink, Eye, FolderInput,
  ListPlus, Plus, Send, Save, Undo2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { ContextBar } from "@/components/scaling-validation/context-bar";
import { StateBanner } from "@/components/scaling-validation/state-banner";
import { ConfirmDialog } from "@/components/scaling-validation/confirm-dialog";
import { CopyEventDialog } from "@/components/scaling-validation/copy-event-dialog";
import {
  buildDateList, countOutsidePeriod, decomposeGridRows, detectPasteFormat, emptyGridRow, expandPeriodForDates,
  functionNameKey, mergePastedRows, parsePastedRows, pasteConflicts, periodBounds, periodProblem, PERIOD_MARGIN_DAYS,
  PERIOD_PROBLEM_MESSAGES, PASTE_FORMAT_LABELS, reframeRows, sanitizeDraftRows, sortFunctionsByOrder, summarizeGrid, summarizePaste,
  validateGridRow,
  type CopyFromEventResult, type PasteFormat, type PeriodExpansion, type RowValidation, type SuggestionGridRow,
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
/** "Copiar de evento" que vai substituir linhas já preenchidas: mesma confirmação da colagem. */
interface PendingCopy { result: CopyFromEventResult; sourceName: string; conflicts: string[] }
/** Dias que a planilha traz preenchidos mas estão fora do período atual da grade. */
interface PendingPasteDates { dates: string[]; expansion: PeriodExpansion }
interface SentInfo { created: number; eventId: string; eventName: string; byFunction: { name: string; count: number }[] }

const DRAFT_TTL_MS = 7 * 24 * 3600_000; // rascunho por evento vale 7 dias
/** Valor sentinela do Select de mapeamento (Radix não aceita SelectItem com value ""). */
const SKIP_FUNCTION = "__descartar__";
const SECTION_TITLE = "text-[11px] font-bold uppercase tracking-wide text-slate-500";
const HINT = "text-xs text-slate-500";
const PILL = "inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 tabular-nums";
const PILL_BRAND = "inline-flex items-center rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-primary tabular-nums";
const BANNER_LINK = "inline-flex items-center gap-1 text-primary hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
const BANNER_DANGER_LINK = "inline-flex items-center gap-1 text-red-700 hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-60";
const EMPTY_PERIOD: Period = { start: "", end: "" };
/** Espera antes de reanalisar a colagem (o resumo ao vivo não roda a cada tecla). */
const PASTE_PREVIEW_DEBOUNCE_MS = 200;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const nowHHMM = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

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
  const [showCopyEvent, setShowCopyEvent] = useState(false);
  const [pasteText, setPasteText] = useState("");
  /** Cópia atrasada de `pasteText`: é o que alimenta o resumo ao vivo. */
  const [pasteTextDebounced, setPasteTextDebounced] = useState("");
  const [pasteFormat, setPasteFormat] = useState<"auto" | PasteFormat>("auto");
  /** "Formatos aceitos" (com o Select de formato) — fechado por padrão. */
  const [showPasteHelp, setShowPasteHelp] = useState(false);
  const [pendingPaste, setPendingPaste] = useState<PendingPaste | null>(null);
  const [pendingCopy, setPendingCopy] = useState<PendingCopy | null>(null);
  const [pendingPasteDates, setPendingPasteDates] = useState<PendingPasteDates | null>(null);
  // Nomes da planilha que o catálogo não reconhece + a função escolhida à mão para cada um.
  const [unknownNames, setUnknownNames] = useState<string[]>([]);
  const [pasteNameMap, setPasteNameMap] = useState<Record<string, string>>({});
  const askedMappingRef = useRef(false); // só interrompe uma vez: no 2º clique, o que não foi mapeado é descartado
  const [confirmSend, setConfirmSend] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  /** ConfirmDialog do "Cancelar envio" (remove todas as vagas já enviadas do evento). */
  const [confirmCancelSend, setConfirmCancelSend] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [sent, setSent] = useState<SentInfo | null>(null);
  /** Prévia das vagas sob demanda (painel colado acima da barra de envio). */
  const [previewOpen, setPreviewOpen] = useState(false);
  /** "HH:MM" do último auto-save do rascunho — o indicador da barra de contexto. */
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
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
    // Chave PRÓPRIA ("de-evento") — a Validação guarda o modo "todos os
    // eventos" em [SUGGESTIONS_QUERY_KEY, ""], e sem este prefixo esta tela lia
    // aquele cache quando ficava sem evento escolhido: o aviso acendia com a
    // contagem do app inteiro e o "Cancelar envio" saía sem eventId.
    queryKey: [SUGGESTIONS_QUERY_KEY, "de-evento", eventId],
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
  const areaByFunctionId = useMemo(
    () => new Map((functions ?? []).map((f) => [f.id, f.responsibleArea ?? ""] as const)),
    [functions],
  );
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
    setPreviewOpen(false);
    setDraftSavedAt(null);

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
      setDraftSavedAt(hasContent ? nowHHMM() : null);
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
  /** Chip "Período do evento": volta a grade para as datas do evento. */
  const applyEventPeriod = useCallback(() => {
    if (!selectedEvent) return;
    requestPeriod(selectedEvent.startDate, selectedEvent.endDate);
  }, [selectedEvent, requestPeriod]);
  /** Chip "Encolher 1 dia": tira o último dia da grade (com a confirmação de sempre se houver gente nele). */
  const shrinkOneDay = useCallback(() => {
    if (dates.length <= 1) return;
    requestPeriod(applied.start, dates[dates.length - 2]);
  }, [dates, applied.start, requestPeriod]);

  // ── Edição da grade ──
  const changeRow = useCallback((rowId: string, patch: Partial<SuggestionGridRow>) => {
    setRows((prev) => prev.map((r) => {
      if (r.rowId !== rowId) return r;
      const next = { ...r, ...patch };
      // Veio dado de VIAGEM? Hotel entra junto (regra do dono, 28/08: "se vier
      // dados de logística já vem com hotel obrigatoriamente"). Só liga quando
      // o dado chega — quem desmarcar depois não é re-marcado ao editar hora.
      const trouxeViagem = (["transportModeIda", "transportModeVolta", "flightDepartureDate", "flightReturnDate", "flightArrivalSuggestedTime", "flightReturnSuggestedTime"] as const)
        .some((k) => k in patch && patch[k]);
      const tinhaViagem = !!(r.transportModeIda || r.transportModeVolta || r.flightDepartureDate || r.flightReturnDate || r.flightArrivalSuggestedTime || r.flightReturnSuggestedTime);
      if (trouxeViagem && !tinhaViagem && !("needsAccommodation" in patch)) next.needsAccommodation = true;
      // Passagem marcada → hotel junto (28/08: "todo mundo que tem passagem
      // tem hospedagem"). Desmarcar continua livre.
      if (patch.needsTicket === true && !("needsAccommodation" in patch)) next.needsAccommodation = true;
      return next;
    }));
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

  // ── Copiar de evento ──
  const commitCopy = useCallback((result: CopyFromEventResult, sourceName: string, replaced: number) => {
    setRows((prev) => mergePastedRows(prev, result.rows));
    setPendingCopy(null);
    toast({
      title: "Grade copiada",
      description: `${plural(result.rows.length, "linha", "linhas")} de ${sourceName} ${result.rows.length === 1 ? "entrou" : "entraram"} na grade${replaced ? `, ${plural(replaced, "função substituída", "funções substituídas")}` : ""} — revise as quantidades e a logística antes de enviar.`,
    });
  }, [toast]);
  const applyCopy = useCallback((result: CopyFromEventResult, sourceName: string) => {
    if (readOnly) return; // modo leitura não monta grade (nem conseguiria limpar depois)
    // Substituir linha já preenchida pede a MESMA confirmação da colagem.
    const conflicts = pasteConflicts(rowsRef.current, result.rows);
    if (conflicts.length > 0) { setPendingCopy({ result, sourceName, conflicts }); return; }
    commitCopy(result, sourceName, 0);
  }, [readOnly, commitCopy]);

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
  const pasteParsed = useMemo(() => {
    if (!showPaste || !pasteTextDebounced.trim()) return null;
    return parsePastedRows(
      pasteTextDebounced, functions ?? [], dates, pasteYear,
      pasteFormat === "auto" ? undefined : pasteFormat, { nameMap: pasteNameMap },
    );
  }, [showPaste, pasteTextDebounced, functions, dates, pasteYear, pasteFormat, pasteNameMap]);
  const pastePreview = useMemo(() => (pasteParsed ? summarizePaste(pasteParsed) : null), [pasteParsed]);
  /** Enquanto o debounce não alcança o texto, o resumo mostra "analisando". */
  const pasteAnalyzing = !!pasteText.trim() && pasteText !== pasteTextDebounced;
  /** Nomes a mapear: o que o resumo ao vivo achou (com o que `runPaste` apontou como reserva). */
  const unknownToMap = pastePreview ? pastePreview.unknownNames : unknownNames;
  const pasteApplyCount = pastePreview?.recognized ?? 0;
  /** "Como vai entrar na grade": quantas linhas substituem funções já na grade × quantas são novas. */
  const pasteImpact = useMemo(() => {
    if (!pasteParsed) return { replaced: 0, added: 0 };
    const replaced = pasteParsed.rows.filter((r) => presentFunctionIds.has(r.functionId)).length;
    return { replaced, added: pasteParsed.rows.length - replaced };
  }, [pasteParsed, presentFunctionIds]);
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
    // "Decidido" = o nome tem entrada no mapa, inclusive quando a escolha foi
    // "Descartar linha" (SKIP_FUNCTION). Só o que continua sem decisão interrompe.
    const undecided = res.unknownNames.filter((n) => !(functionNameKey(n) in nameMap));
    if (undecided.length > 0 && !askedMappingRef.current) {
      askedMappingRef.current = true;
      setUnknownNames(res.unknownNames);
      toast({
        title: `${undecided.length} função(ões) não reconhecida(s)`,
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
  /**
   * Registra a decisão do usuário para um nome não reconhecido. "Descartar linha"
   * também é decisão: fica gravada como SKIP_FUNCTION (nenhuma função tem esse id,
   * então o parser continua ignorando o nome) para o Aplicar não perguntar de novo.
   */
  const mapUnknownName = (name: string, value: string) => {
    const key = functionNameKey(name);
    setPasteNameMap((prev) => ({ ...prev, [key]: value }));
  };

  const clearGrid = () => {
    setRows([]);
    setEventObservations(loadedObsRef.current);
    if (draftKey) localStorage.removeItem(draftKey);
    setDraftSavedAt(null);
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
      // Quebra por função para a faixa pós-envio (calculada antes de limpar a grade).
      const byFunction: SentInfo["byFunction"] = [];
      const byIdx = new Map<string, number>();
      for (const r of records) {
        const i = byIdx.get(r.functionName);
        if (i === undefined) { byIdx.set(r.functionName, byFunction.length); byFunction.push({ name: r.functionName, count: 1 }); }
        else byFunction[i].count++;
      }
      // Comentários já foram gravados no evento: passam a ser a base "carregada".
      loadedObsRef.current = eventObservations;
      if (draftKey) localStorage.removeItem(draftKey);
      setRows([]);
      setPreviewOpen(false);
      setDraftSavedAt(null);
      setConfirmSend(false);
      setSent({ created: data.created, eventId, eventName: selectedEvent?.name ?? "", byFunction });
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
      // Rede de segurança: sem evento o servidor responderia "eventId é
      // obrigatório", e o usuário levaria a culpa por um estado da tela.
      if (!eventId) throw new Error("Escolha o evento antes de cancelar o envio.");
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
  const focusEventPicker = () => {
    document.querySelector<HTMLButtonElement>('[data-testid="scaling-suggestion-event"]')?.click();
  };

  // ── UMA faixa de estado por vez (nunca três empilhadas) ──
  /** Envio somado ao que o evento já tinha: a faixa verde mostra o total real da Validação. */
  const sentTotalExtra = !!sent && sent.eventId === eventId && sentSummary.total > sent.created;
  const banner: "sentCheckFailed" | "functionsError" | "sent" | "jaEnviado" | "leitura" | null =
    sentCheckFailed ? "sentCheckFailed"
      : functionsError ? "functionsError"
        : sent ? "sent"
          // Sem evento escolhido não há o que avisar (nem o que cancelar): o
          // aviso fala de UM evento e a ação de cancelar exige o eventId.
          : (!!eventId && sentSummary.total > 0) ? "jaEnviado"
            : readOnly ? "leitura"
              : null;

  // O rótulo diz por que NÃO dá para enviar (30/08). Antes o botão anunciava
  // "Enviar 0 vagas" com a grade vazia e continuava clicável com o período
  // inválido — duas promessas que a tela não cumpria.
  const sendLabel = readOnly ? "Somente leitura"
    : sendMutation.isPending ? "Enviando…"
      : sentCheckLoading ? "Verificando envios…"
        : periodError ? "Corrija o período"
          : pendencias.errors.length > 0 ? "Revise para enviar"
            : records.length === 0 ? "Nada para enviar"
              : `Enviar ${vagasLabel}`;
  const sendDisabled = readOnly || records.length === 0 || busy || pendencias.errors.length > 0 || sendBlocked || !!periodError;

  /**
   * Por que o envio está travado (ou o que merece um olhar antes dele).
   *
   * Sai da MESMA cadeia de `sendDisabled` e na mesma ordem — um texto com
   * régua própria acabaria dizendo "corrija a grade" enquanto o botão estava
   * bloqueado pelo período.
   */
  const motivoDoBloqueio: { tom: "erro" | "aviso" | "info"; texto: string } | null =
    readOnly ? { tom: "info", texto: "Só Produção e Admin enviam" }
      : sentCheckLoading ? { tom: "info", texto: "Verificando envios deste evento…" }
        : periodError ? { tom: "erro", texto: "O período da grade está inválido" }
          : pendencias.errors.length > 0
            ? { tom: "erro", texto: `${plural(pendencias.errors.length, "linha impede", "linhas impedem")} o envio` }
            : records.length === 0 ? { tom: "info", texto: "Preencha ao menos uma quantidade" }
              : pendencias.warnings.length > 0
                ? { tom: "aviso", texto: `${plural(pendencias.warnings.length, "aviso", "avisos")} — não travam o envio` }
                : null;

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

      {eventsError ? (
        <StateBanner
          tone="red" icon={AlertTriangle} role="alert"
          title="Não foi possível carregar eventos e funções"
          detail={<>{apiErrorMessage(eventsError, "Verifique sua conexão e tente novamente.")} O rascunho local da grade está intacto — nada se perdeu.</>}
          actions={
            <Button variant="outline" size="sm" className="rounded-lg h-8 bg-white" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/events"] })}>
              Tentar novamente
            </Button>
          }
        />
      ) : loadingEvents || loadingFunctions ? (
        <LoadingState count={3} label="Carregando eventos e funções…" />
      ) : (
        <>
          {/* Barra de contexto: evento · período do evento · GRADE · comentários (disclosure) */}
          <ContextBar
            events={activeEvents}
            eventId={eventId}
            onEventChange={setEventId}
            selectedEvent={selectedEvent}
            periodStart={periodStart}
            periodEnd={periodEnd}
            onPeriodChange={requestPeriod}
            bounds={bounds}
            daysCount={dates.length}
            onEventPeriod={applyEventPeriod}
            onShrink={shrinkOneDay}
            canShrink={dates.length > 1}
            periodInvalid={!!periodError}
            disabled={busy}
            observations={eventObservations}
            onObservationsChange={setEventObservations}
            eventTestId="scaling-suggestion-event"
          />

          {/* Uma faixa de estado por vez */}
          {banner === "sentCheckFailed" && (
            <StateBanner
              tone="red" icon={AlertTriangle} role="alert"
              title="Não foi possível verificar se este evento já tem vagas enviadas"
              detail={<>{apiErrorMessage(sentQuery.error as ApiError, "Verifique sua conexão.")} O envio fica bloqueado até essa verificação funcionar — enviar às cegas poderia duplicar a escala. O rascunho local está intacto.</>}
              actions={
                <Button
                  type="button" variant="outline" size="sm" className="rounded-lg h-8 bg-white"
                  disabled={sentQuery.isFetching}
                  onClick={() => sentQuery.refetch()}
                  data-testid="scaling-suggestion-sent-retry"
                >
                  {sentQuery.isFetching ? "Verificando…" : "Tentar novamente"}
                </Button>
              }
            />
          )}
          {banner === "functionsError" && (
            <StateBanner
              tone="red" icon={AlertTriangle} role="alert"
              title="Não foi possível carregar as funções"
              detail={<>{apiErrorMessage(functionsError as ApiError, "Sem a lista de funções, não dá para adicionar linhas nem colar da planilha.")} O rascunho local está intacto.</>}
              actions={
                <Button type="button" variant="outline" size="sm" className="rounded-lg h-8 bg-white" onClick={() => refetchFunctions()}>
                  Tentar novamente
                </Button>
              }
            />
          )}
          {banner === "sent" && sent && (
            <StateBanner
              tone="emerald" icon={CheckCircle2} role="note"
              title={`${sent.created} ${sent.created === 1 ? "vaga enviada" : "vagas enviadas"} — as áreas já veem tudo na Validação`}
              detail={
                sent.byFunction.length > 0 || sentTotalExtra ? (
                  <span className="tabular-nums">
                    {sent.byFunction.map((b) => `${b.name} ×${b.count}`).join(" · ")}
                    {/* O evento já tinha vagas: sem isto, o total real na Validação sumia da tela. */}
                    {sentTotalExtra && `${sent.byFunction.length > 0 ? " · " : ""}${sentSummary.total} no total na Validação`}
                  </span>
                ) : undefined
              }
              actions={
                <>
                  <Link href={scalingHref("/scaling-validation", sent.eventId)} className={BANNER_LINK}>
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /> Ver na Validação
                  </Link>
                  {/* Desfazer aqui mesmo: é neste instante que o usuário percebe o evento/quantidade errados. */}
                  {!readOnly && sentSummary.total > 0 && (
                    <button
                      type="button"
                      onClick={() => setConfirmCancelSend(true)}
                      disabled={cancelSendMutation.isPending}
                      className={BANNER_DANGER_LINK}
                      data-testid="scaling-suggestion-cancel-send-after"
                    >
                      <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
                      {cancelSendMutation.isPending ? "Cancelando…" : "Cancelar envio"}
                    </button>
                  )}
                  <Button type="button" variant="outline" size="sm" className="rounded-lg h-8 bg-white" onClick={() => setSent(null)}>
                    <Plus className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Nova sugestão
                  </Button>
                </>
              }
            />
          )}
          {banner === "jaEnviado" && (
            <StateBanner
              tone="amber" icon={AlertTriangle} role="note"
              title={`Este evento já tem ${sentSummary.total} ${sentSummary.total === 1 ? "vaga" : "vagas"} na Validação — enviar de novo soma às que já estão lá`}
              detail={
                <span className="tabular-nums">
                  {sentSummary.aguardando} aguardando · {sentSummary.validadas} {sentSummary.validadas === 1 ? "validada" : "validadas"} · {sentSummary.comPedido} com pedido. Se a grade subiu errada, cancele o envio e monte de novo.
                </span>
              }
              actions={
                <>
                  <Link href={scalingHref("/scaling-validation", eventId)} className={BANNER_LINK}>
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /> Acompanhar
                  </Link>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => setConfirmCancelSend(true)}
                      disabled={cancelSendMutation.isPending}
                      className={BANNER_DANGER_LINK}
                      data-testid="scaling-suggestion-cancel-send"
                    >
                      <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
                      {cancelSendMutation.isPending ? "Cancelando…" : "Cancelar envio"}
                    </button>
                  )}
                </>
              }
            />
          )}
          {banner === "leitura" && (
            <StateBanner
              tone="slate" icon={Eye} role="note"
              title="Modo leitura — só Produção e Admin montam e enviam"
              detail="Você pode consultar o evento e seguir para as outras telas do módulo."
              actions={
                <Link href={scalingHref("/scaling-validation", eventId)} className={BANNER_LINK}>
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /> Abrir na Validação
                </Link>
              }
            />
          )}

          {/* Grade */}
          <section className="space-y-3" aria-labelledby="sug-grade">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 id="sug-grade" className={SECTION_TITLE}>Grade função × dia</h2>
                {/* Única região aria-live da tela: resume o que muda a cada edição. */}
                <div className="flex flex-wrap items-center gap-1.5" aria-live="polite" aria-atomic="true">
                  {rows.length > 0 && (
                    <>
                      <span className={PILL}>{summary.funcoes} {summary.funcoes === 1 ? "linha" : "linhas"}</span>
                      <span className={PILL}>{summary.pessoasDia} pessoas-dia</span>
                      <span className={PILL_BRAND}>{vagasLabel}</span>
                    </>
                  )}
                </div>
              </div>
              {/*
                Quatro botões do mesmo peso não diziam por onde começar — e
                "Limpar", que apaga a grade inteira, ficava do lado de
                "Adicionar função" com a mesma aparência. Agora colar é o
                caminho principal (é como a produção monta de verdade), copiar
                e adicionar são as alternativas, e limpar virou link discreto do
                outro lado, visível só quando há o que limpar.
              */}
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" className="rounded-lg h-8 bg-primary hover:bg-primary-hover" disabled={!gridReady || busy || !!functionsError} onClick={openPaste}>
                  <ClipboardPaste className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Colar da planilha
                </Button>
                <Button type="button" variant="outline" size="sm" className="rounded-lg h-8" disabled={!gridReady || busy || !!functionsError} onClick={() => setShowCopyEvent(true)}>
                  <FolderInput className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Copiar de outro evento
                </Button>
                <Button type="button" variant="outline" size="sm" className="rounded-lg h-8" disabled={!gridReady || busy || !!functionsError} onClick={openAddFunction}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Adicionar função
                </Button>
                {hasContent && !readOnly && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmClear(true)}
                    className="ml-auto rounded text-[12.5px] font-semibold text-slate-500 transition-colors hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-50"
                    data-testid="scaling-suggestion-clear"
                  >
                    Limpar grade
                  </button>
                )}
              </div>
            </div>

            {/* Erro de período: inline, em vermelho, acima da grade. */}
            {periodError && (
              <p id="sug-period-error" role="alert" className="flex items-start gap-1.5 text-xs text-red-700">
                <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" /> {periodError}
              </p>
            )}

            {/*
              Painel de revisão: erro e aviso deixam de ter o mesmo peso.
              Eram chips do mesmo tamanho embaralhados numa faixa só — o que
              trava o envio e o que apenas merece um olhar liam igual, e o
              texto "Função: problema" cortava dentro da pílula. Agora cada
              item é uma linha inteira, com o ponto de cor, a função em
              destaque, o problema embaixo e a ação nomeada ("Corrigir" para
              erro, "Revisar" para aviso).
            */}
            {gridReady && (pendencias.errors.length > 0 || pendencias.warnings.length > 0) && (() => {
              const temErro = pendencias.errors.length > 0;
              const itens = [
                ...pendencias.errors.map((e) => ({ ...e, tipo: "erro" as const })),
                ...pendencias.warnings.map((w) => ({ ...w, tipo: "aviso" as const })),
              ];
              return (
                <section
                  aria-label="Pontos a revisar antes de enviar"
                  data-testid="scaling-suggestion-revisao"
                  className={cn("overflow-hidden rounded-[14px] border", temErro ? "border-red-200 bg-red-50/60" : "border-amber-200 bg-amber-50/60")}
                >
                  <div className="flex items-start gap-2.5 px-3.5 pt-3 pb-2">
                    <AlertTriangle className={cn("mt-px h-4 w-4 shrink-0", temErro ? "text-red-600" : "text-amber-600")} aria-hidden="true" />
                    <div className="min-w-0">
                      <p className={cn("text-[13.5px] font-bold", temErro ? "text-red-900" : "text-amber-900")}>
                        {temErro
                          ? `${pendencias.errors.length} ${pendencias.errors.length === 1 ? "linha impede" : "linhas impedem"} o envio`
                          : `${pendencias.warnings.length} ${pendencias.warnings.length === 1 ? "ponto para revisar" : "pontos para revisar"}`}
                      </p>
                      <p className={cn("text-[12px]", temErro ? "text-red-700" : "text-amber-800")}>
                        {temErro
                          ? pendencias.warnings.length > 0
                            ? `E mais ${plural(pendencias.warnings.length, "aviso", "avisos")} — avisos não travam o envio.`
                            : "Corrija para liberar o envio."
                          : "Avisos não travam o envio — dá para enviar assim mesmo."}
                      </p>
                    </div>
                  </div>
                  <ul className="divide-y divide-white/70 border-t border-white/70">
                    {itens.map((item, i) => {
                      // O texto vem como "Função: problema" — separar devolve
                      // hierarquia ao nome, que é por onde se acha a linha.
                      const corte = item.text.indexOf(": ");
                      const funcao = corte > 0 ? item.text.slice(0, corte) : item.text;
                      const problema = corte > 0 ? item.text.slice(corte + 2) : "";
                      const erro = item.tipo === "erro";
                      return (
                        <li key={`${item.tipo}-${item.rowId}-${i}`}>
                          <button
                            type="button"
                            onClick={() => focusRow(item.rowId)}
                            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors hover:bg-white/70 focus-visible:outline-none focus-visible:bg-white/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
                          >
                            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", erro ? "bg-red-500" : "bg-amber-500")} aria-hidden="true" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12.5px] font-semibold text-slate-800">{funcao}</span>
                              {problema && <span className="block truncate text-[12px] text-slate-600">{problema}</span>}
                            </span>
                            <span className={cn("shrink-0 text-[12px] font-semibold", erro ? "text-red-700" : "text-amber-800")}>
                              {erro ? "Corrigir" : "Revisar"}
                            </span>
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })()}

            {!eventId ? (
              /* Estado vazio com saída: escolher evento ou copiar de um anterior. */
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
                <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-primary" aria-hidden="true">
                  <CalendarDays className="w-5 h-5" />
                </span>
                <p className="mt-3 text-sm font-semibold text-slate-700">Escolha o evento para abrir a grade</p>
                <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
                  A grade cobre o período do evento (ajustável em até {PERIOD_MARGIN_DAYS} dias para cada lado) e o rascunho fica salvo neste navegador por 7 dias, separado por evento.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Button type="button" size="sm" className="rounded-lg bg-primary hover:bg-primary-hover" onClick={focusEventPicker}>
                    Selecionar evento
                  </Button>
                  <Button
                    type="button" variant="outline" size="sm" className="rounded-lg"
                    disabled={busy || !!functionsError}
                    title={readOnly ? "Modo leitura — só Produção e Admin montam a grade" : undefined}
                    onClick={() => setShowCopyEvent(true)}
                  >
                    <FolderInput className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Copiar de um evento anterior
                  </Button>
                </div>
                {readOnly && (
                  <p className={cn(HINT, "mt-3")}>Em modo leitura dá para consultar a tela, mas não montar nem enviar a grade.</p>
                )}
              </div>
            ) : dates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
                Informe um período válido para a grade.
              </div>
            ) : (
              /* Modo leitura desabilita a grade inteira. */
              <div className={cn(readOnly && "opacity-75 pointer-events-none")} aria-disabled={readOnly || undefined}>
                <SuggestionGrid
                  rows={rows} dates={dates} issuesByRow={issuesByRow} areaByFunctionId={areaByFunctionId}
                  onChangeRow={changeRow} onChangeQty={changeQty}
                  onDuplicateRow={duplicateRow} onRemoveRow={removeRow}
                  onPaste={openPaste} onAddFunction={openAddFunction}
                  disabled={busy}
                />
              </div>
            )}
          </section>

          {/* Barra de envio (sticky) + prévia sob demanda */}
          {gridReady && !sent && (
            <div className="sticky bottom-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pb-3 pt-2 bg-gradient-to-t from-background via-background to-transparent">
              {previewOpen && records.length > 0 && (
                <div role="region" aria-labelledby="sug-previa" className="mb-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
                  <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2">
                    <h2 id="sug-previa" className={SECTION_TITLE}>Prévia das vagas que serão criadas</h2>
                    <button type="button" onClick={() => setPreviewOpen(false)} aria-label="Fechar prévia"
                      className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="max-h-[260px] overflow-y-auto">
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
                                {rec.needsAccommodation && <span className="text-xs font-semibold uppercase text-slate-600 bg-slate-100 rounded px-1.5 py-0.5">Hotel</span>}
                                {rec.needsTicket && <span className="text-xs font-semibold uppercase text-slate-600 bg-slate-100 rounded px-1.5 py-0.5">Passagem</span>}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur px-4 py-3 shadow-lg">
                <div className="min-w-0">
                  <p className="text-sm text-slate-700">
                    <span className="font-semibold text-slate-900 tabular-nums">{vagasLabel}</span>
                    {records.length > 0 && <span className="text-slate-500"> · {summary.pessoasDia} pessoas-dia em {summary.funcoes} {summary.funcoes === 1 ? "linha" : "linhas"}</span>}
                  </p>
                  <p className={cn(HINT, "flex items-center gap-1.5 mt-0.5")}>
                    {draftSavedAt
                      ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                      : <Save className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                    <span>
                      {draftSavedAt ? <>Rascunho salvo <span className="tabular-nums">{draftSavedAt}</span> · </> : "Rascunho salvo "}
                      neste navegador, por evento — 7 dias.
                    </span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button" variant="outline" size="sm" className="rounded-lg h-9"
                    disabled={records.length === 0}
                    aria-expanded={previewOpen} aria-controls="sug-previa"
                    onClick={() => setPreviewOpen((v) => !v)}
                  >
                    <Eye className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                    {previewOpen ? "Fechar prévia" : "Ver prévia das vagas"}
                  </Button>
                  {/*
                    O motivo do bloqueio fica AO LADO do botão, não só dentro
                    do rótulo dele: quem via "Revise para enviar" não sabia o
                    que revisar sem procurar. Clicar leva à primeira linha.
                  */}
                  {motivoDoBloqueio && (
                    <button
                      type="button"
                      onClick={() => { const alvo = pendencias.errors[0] ?? pendencias.warnings[0]; if (alvo) focusRow(alvo.rowId); }}
                      disabled={!pendencias.errors.length && !pendencias.warnings.length}
                      className={cn(
                        "inline-flex h-9 max-w-[280px] items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-default",
                        motivoDoBloqueio.tom === "erro"
                          ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100 focus-visible:ring-red-400"
                          : motivoDoBloqueio.tom === "aviso"
                            ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 focus-visible:ring-amber-400"
                            : "border-slate-200 bg-slate-50 text-slate-600 focus-visible:ring-slate-400",
                      )}
                      data-testid="scaling-suggestion-motivo"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{motivoDoBloqueio.texto}</span>
                    </button>
                  )}
                  <Button
                    type="button" onClick={openConfirmSend}
                    disabled={sendDisabled}
                    title={sentCheckFailed ? "Bloqueado: não foi possível verificar as vagas já enviadas deste evento." : undefined}
                    className="rounded-xl bg-primary hover:bg-primary-hover"
                  >
                    <Send className="w-4 h-4 mr-2" aria-hidden="true" />
                    {sendLabel}
                  </Button>
                </div>
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

      {/* Copiar de outro evento (usa o GET existente do outro evento) */}
      <CopyEventDialog
        open={showCopyEvent}
        onOpenChange={setShowCopyEvent}
        events={activeEvents}
        currentEventId={eventId}
        onSelectDestination={setEventId}
        functions={functions ?? []}
        dates={dates}
        existingRows={rows}
        onApply={applyCopy}
      />

      {/* Colar da planilha: decidir antes de aplicar */}
      <Dialog open={showPaste} onOpenChange={(o) => { if (!o) closePaste(); }}>
        <DialogContent className="max-w-[680px] max-h-[90vh] p-0 gap-0 grid-rows-[auto_minmax(0,1fr)_auto]">
          <DialogHeader className="px-4 sm:px-5 pt-5 pb-3 pr-12">
            <DialogTitle>Colar da planilha</DialogTitle>
            <DialogDescription>Copie as linhas no Excel e cole aqui — o formato é reconhecido sozinho e nada entra na grade antes do "Aplicar".</DialogDescription>
          </DialogHeader>

          {/* Corpo rolável: 1. campo · 2. resumo em chips · 3. nomes a mapear · 4. como vai entrar · 5. formato */}
          <div className="overflow-y-auto px-4 sm:px-5 pb-4 space-y-3">
            <Label htmlFor="sug-paste" className="sr-only">Conteúdo colado</Label>
            {/* Mudou o conteúdo colado → os nomes não reconhecidos são perguntados de novo. */}
            <Textarea
              id="sug-paste" autoFocus value={pasteText} rows={7} placeholder="Cole aqui (Ctrl+V)"
              onChange={(e) => { setPasteText(e.target.value); askedMappingRef.current = false; }}
              className="font-mono text-xs rounded-lg min-h-[150px] placeholder:font-sans placeholder:text-sm placeholder:text-slate-400"
            />

            {/* 2. Resumo ao vivo em chips (nada é aplicado até clicar em "Aplicar"). */}
            {pasteText.trim() !== "" && (
              pasteAnalyzing || !pastePreview ? (
                <p className="text-xs text-slate-500">Analisando o que você colou…</p>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={PILL}>{plural(pastePreview.lines, "linha lida", "linhas lidas")}</span>
                    <span className={cn(pastePreview.recognized > 0 ? "inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 tabular-nums" : PILL)}>
                      {pastePreview.recognized > 0 && <CheckCircle2 className="w-3 h-3 text-emerald-600" aria-hidden="true" />}
                      {plural(pastePreview.recognized, "função reconhecida", "funções reconhecidas")}
                    </span>
                    <span className={PILL}>{plural(pastePreview.mappedDays, "dia mapeado", "dias mapeados")}</span>
                    {pasteWarnings.map((w, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                        <AlertTriangle className="w-3 h-3 text-amber-600" aria-hidden="true" /> {w}
                      </span>
                    ))}
                  </div>
                  {pastePreview.recognized === 0 && (
                    <p className="text-xs text-amber-900">
                      {pastePreview.problem === "cabecalho-nao-encontrado"
                        ? "Não consegui identificar o cabeçalho — no formato da logística é preciso colar também a linha de cabeçalho (ida, chegada, retorno e as colunas de dia)."
                        : pastePreview.unknownNames.length > 0
                          ? "Nenhum dos nomes está no catálogo — aponte a função de cada um abaixo."
                          : "Nenhuma linha reconhecida. Confira se as colunas vieram separadas por TAB (copie direto do Excel)."}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-500">
                    {PASTE_FORMAT_LABELS[pastePreview.format]}{pastePreview.hadHeader ? " · cabeçalho ignorado" : ""}.{" "}
                    <button
                      type="button" onClick={() => setShowPasteHelp(true)}
                      className="underline underline-offset-2 hover:opacity-80 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
                    >
                      {pasteFormat === "auto" ? "Não reconheceu? Escolher o formato" : `Formato definido à mão — trocar`}
                    </button>
                  </p>
                </div>
              )
            )}

            {/* 3. Nomes que o catálogo não reconheceu: apontar a função certa (ou descartar) antes de aplicar */}
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
                            <SelectItem value={SKIP_FUNCTION}>Descartar linha</SelectItem>
                            {sortedFunctions.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* 4. Como vai entrar na grade: prévia por função + substituídas × novas */}
            {!pasteAnalyzing && pasteParsed && pasteParsed.rows.length > 0 && (
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border-b border-slate-200 px-3 py-1.5">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Como vai entrar na grade</p>
                  <p className={cn("text-[11px] tabular-nums", pasteImpact.replaced > 0 ? "font-medium text-amber-800" : "text-slate-500")}>
                    {pasteImpact.replaced > 0
                      ? `${plural(pasteImpact.replaced, "linha substituída", "linhas substituídas")}, ${pasteImpact.added} ${pasteImpact.added === 1 ? "nova" : "novas"}`
                      : plural(pasteImpact.added, "linha nova", "linhas novas")}
                  </p>
                </div>
                <ul className="max-h-[160px] overflow-y-auto divide-y divide-slate-100">
                  {pasteParsed.rows.map((r) => {
                    const days = dates.filter((d) => (r.quantities[d] || 0) > 0);
                    return (
                      <li key={r.rowId} className="flex items-baseline gap-2 px-3 py-1.5 text-xs">
                        <span className="w-[150px] shrink-0 truncate font-semibold text-slate-800" title={r.functionName}>
                          {r.functionName}
                          {presentFunctionIds.has(r.functionId) && <span className="ml-1 font-normal text-amber-700">(substitui)</span>}
                        </span>
                        <span className="min-w-0 truncate font-mono tabular-nums text-slate-600">
                          {days.length > 0 ? days.map((d) => `${formatDayMonthBr(d)}×${r.quantities[d]}`).join(" · ") : "sem quantidades"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* 5. Formato: seletor + explicação curta, recolhidos */}
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

      {/* Confirmações (componente único) */}

      {/* Colagem: substituir funções já na grade */}
      <ConfirmDialog
        open={!!pendingPaste}
        onOpenChange={(o) => { if (!o) setPendingPaste(null); }}
        title={`Substituir ${pendingPaste?.conflicts.length} ${pendingPaste?.conflicts.length === 1 ? "função" : "funções"} já na grade?`}
        cancelLabel="Voltar"
        confirmLabel="Substituir"
        onConfirm={() => pendingPaste && commitPaste(pendingPaste.rows, pendingPaste.skippedNames, pendingPaste.conflicts.length)}
      >
        <p>
          As linhas de <strong>{pendingPaste?.conflicts.join(", ")}</strong> serão substituídas pelas coladas (quantidades e dados de viagem). As demais linhas da grade ficam como estão.
        </p>
      </ConfirmDialog>

      {/* Copiar de evento: substituir funções já na grade (mesma confirmação da colagem) */}
      <ConfirmDialog
        open={!!pendingCopy}
        onOpenChange={(o) => { if (!o) setPendingCopy(null); }}
        title={`Substituir ${pendingCopy?.conflicts.length} ${pendingCopy?.conflicts.length === 1 ? "função" : "funções"} já na grade?`}
        cancelLabel="Voltar"
        confirmLabel="Substituir"
        onConfirm={() => pendingCopy && commitCopy(pendingCopy.result, pendingCopy.sourceName, pendingCopy.conflicts.length)}
      >
        <p>
          As linhas de <strong>{pendingCopy?.conflicts.join(", ")}</strong> serão substituídas pelas de <strong>{pendingCopy?.sourceName}</strong> (quantidades e dados de viagem)
          — inclusive quando a cópia trouxer a função sem quantidade no período atual. As demais linhas da grade ficam como estão.
        </p>
      </ConfirmDialog>

      {/* Colagem: a planilha tem dias fora do período da grade */}
      <ConfirmDialog
        open={!!pendingPasteDates}
        onOpenChange={(o) => { if (!o) setPendingPasteDates(null); }}
        title={`A planilha tem ${pendingPasteDates?.dates.length} ${pendingPasteDates?.dates.length === 1 ? "dia" : "dias"} fora do período da grade`}
        cancelLabel="Manter período e ignorar"
        onCancel={rejectPasteExpansion}
        confirmLabel={pendingPasteDates?.expansion.changed ? "Ajustar o período" : undefined}
        onConfirm={acceptPasteExpansion}
      >
        {pendingPasteDates && (
          <p>
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
          </p>
        )}
      </ConfirmDialog>

      {/* Encolher período com quantidades fora */}
      <ConfirmDialog
        open={!!pendingPeriod}
        onOpenChange={(o) => { if (!o) cancelPendingPeriod(); }}
        title="Descartar quantidades fora do novo período?"
        cancelLabel="Manter período"
        onCancel={cancelPendingPeriod}
        confirmLabel="Descartar e aplicar"
        destructive
        onConfirm={() => pendingPeriod && applyPeriod(pendingPeriod.start, pendingPeriod.end)}
      >
        {pendingPeriod && (
          <p>
            <strong>{pendingPeriod.pessoasDia} pessoas-dia</strong> em <strong>{pendingPeriod.dias} {pendingPeriod.dias === 1 ? "dia" : "dias"}</strong> fora do novo período
            ({formatDateRange(pendingPeriod.start, pendingPeriod.end)}) serão descartados. As demais quantidades continuam na grade.
          </p>
        )}
      </ConfirmDialog>

      {/* Remover linha com quantidades */}
      <ConfirmDialog
        open={!!confirmRemove}
        onOpenChange={(o) => { if (!o) setConfirmRemove(null); }}
        title={`Remover a linha ${rowToRemove?.functionName}?`}
        confirmLabel="Remover"
        destructive
        onConfirm={() => confirmRemove && removeRowNow(confirmRemove)}
      >
        <p>Ela tem quantidades preenchidas — serão descartadas junto com os dados de viagem da linha.</p>
      </ConfirmDialog>

      {/* Enviar */}
      <ConfirmDialog
        open={confirmSend}
        onOpenChange={(o) => { if (!o) setConfirmSend(false); }}
        title="Enviar escala para validação?"
        cancelLabel="Voltar"
        confirmLabel={busy ? "Enviando…" : "Enviar"}
        pending={busy}
        onConfirm={() => sendMutation.mutate()}
      >
        <p>
          Serão criadas <strong>{records.length}</strong> vaga(s) sugerida(s) para <strong>{selectedEvent?.name}</strong> e as áreas responsáveis passam a vê-las na Validação de Escala. A operação é única: ou todas entram, ou nenhuma.
          {pendencias.warnings.length > 0 && <> Há {pendencias.warnings.length} {pendencias.warnings.length === 1 ? "aviso" : "avisos"} na grade (passagem sem datas) — o envio segue mesmo assim.</>}
        </p>
      </ConfirmDialog>

      {/* Cancelar envio (remove TUDO que está na Validação) */}
      <ConfirmDialog
        open={confirmCancelSend}
        onOpenChange={(o) => { if (!o) setConfirmCancelSend(false); }}
        title={`Cancelar o envio e remover ${sentSummary.total} ${sentSummary.total === 1 ? "vaga" : "vagas"} de ${selectedEvent?.name}?`}
        cancelLabel="Voltar"
        confirmLabel={cancelSendMutation.isPending ? "Cancelando…" : "Cancelar envio e remover"}
        destructive
        pending={cancelSendMutation.isPending}
        onConfirm={() => cancelSendMutation.mutate()}
        confirmTestId="scaling-suggestion-cancel-send-confirm"
      >
        <p>
          Serão removidas <strong>todas as {sentSummary.total} {sentSummary.total === 1 ? "vaga" : "vagas"}</strong> deste evento que estão na Validação de Escala —
          {" "}<strong>inclusive as {sentSummary.validadas} que a área já validou</strong> e as {sentSummary.comPedido} com pedido em aberto,
          cujos pedidos pendentes são encerrados na fila do aprovador.
        </p>
        <p>
          As vagas já <strong>aprovadas</strong> (que viraram Inclusão de Equipe) e as já negadas <strong>não</strong> são afetadas.
          As áreas deixam de ver as vagas removidas na hora. Não há como desfazer — para voltar, monte a grade e envie de novo.
        </p>
      </ConfirmDialog>

      {/* Limpar */}
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={(o) => { if (!o) setConfirmClear(false); }}
        title="Limpar a grade?"
        confirmLabel="Limpar"
        destructive
        onConfirm={clearGrid}
      >
        <p>Todas as linhas, os comentários gerais editados e o rascunho local deste evento serão descartados. Nada é apagado no servidor.</p>
      </ConfirmDialog>
    </PageContainer>
  );
}
