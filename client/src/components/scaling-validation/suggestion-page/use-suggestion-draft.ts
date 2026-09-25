/**
 * Rascunho e período da Sugestão de escala (25/09 — extraído da página).
 *
 * Dono das linhas da grade, do período aplicado e dos comentários gerais.
 * Restaura o rascunho local ao trocar de evento, salva com debounce e faz o
 * flush ao sair; impõe a margem de ±PERIOD_MARGIN_DAYS em torno do evento.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Event } from "@shared/schema";
import { formatDayMonthBr } from "@/lib/dates";
import {
  addDaysYmd, buildDateList, countOutsidePeriod, MAX_GRID_DAYS, periodBounds, periodProblem, PERIOD_MARGIN_DAYS,
  PERIOD_PROBLEM_MESSAGES, reframeRows, sanitizeDraftRows,
  type SuggestionGridRow,
} from "@/components/scaling-validation/scaling-grid-utils";
import { DRAFT_TTL_MS, EMPTY_PERIOD, nowHHMM, writeDraft, type DraftPayload, type PendingPeriod, type Period } from "./suggestion-shared";

export interface UseSuggestionDraftArgs {
  eventId: string;
  selectedEvent: Event | undefined;
  userId: string | undefined;
  readOnly: boolean;
  toast: (t: { title: string; description?: string }) => void;
  /** Chamado quando um evento (novo) termina de carregar — a página zera o que é dela (envio, prévia, painel aberto). */
  onEventLoaded: () => void;
}

export function useSuggestionDraft({ eventId, selectedEvent, userId, readOnly, toast, onEventLoaded }: UseSuggestionDraftArgs) {
  // Inputs de período (o que o usuário digita) × período APLICADO à grade (sempre válido).
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [applied, setApplied] = useState<Period>(EMPTY_PERIOD);
  const [pendingPeriod, setPendingPeriod] = useState<PendingPeriod | null>(null);
  const [eventObservations, setEventObservations] = useState("");
  const [rows, setRows] = useState<SuggestionGridRow[]>([]);
  /** "HH:MM" do último auto-save do rascunho — o indicador da barra de contexto. */
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const draftLoadedFor = useRef<string | null>(null);
  const loadedObsRef = useRef("");
  // Espelhos síncronos (callbacks estáveis leem daqui sem depender de `rows`/`applied`).
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const appliedRef = useRef<Period>(EMPTY_PERIOD);
  const onEventLoadedRef = useRef(onEventLoaded);
  onEventLoadedRef.current = onEventLoaded;
  const toastRef = useRef(toast);
  toastRef.current = toast;

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

  const draftKey = eventId ? `scaling-suggestion-draft:${userId ?? "anon"}:${eventId}` : null;
  // Espelho do evento atual para o onSuccess do envio comparar com o evento
  // que foi ENVIADO (o combobox fica travado durante o POST, mas a URL não).
  const eventIdRef = useRef(eventId);
  eventIdRef.current = eventId;

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
    onEventLoadedRef.current();
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
              toastRef.current({ title: "Rascunho restaurado", description: `Grade de ${selectedEvent.name} recuperada do rascunho local.` });
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
  }, [selectedEvent, draftKey, loadPeriod, readOnly]);

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
    const flush = () => {
      if (!key || readOnly || draftLoadedFor.current !== forEvent) return;
      const s = latestDraft.current;
      writeDraft(key, { rows: s.rows, periodStart: s.applied.start, periodEnd: s.applied.end, eventObservations: s.eventObservations }, s.hasContent);
    };
    // Fechar a aba / F5 no meio do debounce de 1,5s perdia a última edição:
    // o unmount do React não roda nesse caso, só o beforeunload.
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
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
  /** Chip "−1 dia": tira o último dia da grade (com a confirmação de sempre se houver gente nele). */
  const shrinkOneDay = useCallback(() => {
    if (dates.length <= 1) return;
    requestPeriod(applied.start, dates[dates.length - 2]);
  }, [dates, applied.start, requestPeriod]);
  /** Chip "+1 dia": acrescenta um dia ao FIM da grade — só até a margem do evento e o teto de dias. */
  const nextDay = dates.length > 0 ? addDaysYmd(applied.end, 1) : "";
  const canGrow = !!nextDay && dates.length < MAX_GRID_DAYS && (!bounds.max || nextDay <= bounds.max);
  const growOneDay = useCallback(() => {
    if (!canGrow) return;
    requestPeriod(applied.start, nextDay);
  }, [canGrow, applied.start, nextDay, requestPeriod]);

  /** Descarta linhas, comentários editados e o rascunho local deste evento. Nada é apagado no servidor. */
  const clearGrid = useCallback(() => {
    setRows([]);
    setEventObservations(loadedObsRef.current);
    if (draftKey) localStorage.removeItem(draftKey);
    setDraftSavedAt(null);
  }, [draftKey]);

  return {
    rows, setRows, rowsRef,
    periodStart, periodEnd, applied, dates, bounds, periodError, pendingPeriod,
    eventObservations, setEventObservations, loadedObsRef,
    draftKey, draftLoadedFor, eventIdRef, draftSavedAt, setDraftSavedAt, hasContent,
    applyPeriod, requestPeriod, cancelPendingPeriod, applyEventPeriod, shrinkOneDay, growOneDay, canGrow,
    clearGrid,
  };
}

export type SuggestionDraft = ReturnType<typeof useSuggestionDraft>;
