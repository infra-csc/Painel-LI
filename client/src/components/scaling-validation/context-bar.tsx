import { useId, useState } from "react";
import { CalendarDays, ChevronDown, ChevronUp, MessageSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import EventCombobox from "@/components/ui/event-combobox";
import { cn, formatDateRange } from "@/lib/utils";
import type { Event } from "@shared/schema";
import { PERIOD_MARGIN_DAYS } from "./scaling-grid-utils";

export interface ContextBarProps {
  events: Event[];
  eventId: string;
  onEventChange: (id: string) => void;
  selectedEvent: Event | undefined;
  periodStart: string;
  periodEnd: string;
  /** requestPeriod da página (valida, pede confirmação ao encolher etc.). */
  onPeriodChange: (start: string, end: string) => void;
  bounds: { min: string; max: string };
  /** Dias do período APLICADO (0 = período inválido). */
  daysCount: number;
  onEventPeriod: () => void;
  onShrink: () => void;
  canShrink: boolean;
  /** true = há erro de período (o texto fica inline, acima da grade). */
  periodInvalid: boolean;
  disabled?: boolean;
  observations: string;
  onObservationsChange: (v: string) => void;
  /** "HH:MM" do último auto-save do rascunho (null = nada salvo ainda). */
  draftSavedAt: string | null;
  eventTestId?: string;
}

const CHIP_BTN = "inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition-colors hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none";
const PERIOD_HINT = `A grade pode começar até ${PERIOD_MARGIN_DAYS} dias antes e terminar até ${PERIOD_MARGIN_DAYS} dias depois do evento.`;

/**
 * Barra de contexto da Sugestão de Escala (substitui o cartão alto de evento/
 * período/comentários): uma linha com evento · período do evento · inputs da
 * GRADE · chips de atalho — e os comentários gerais num disclosure.
 */
export function ContextBar({
  events, eventId, onEventChange, selectedEvent, periodStart, periodEnd, onPeriodChange, bounds,
  daysCount, onEventPeriod, onShrink, canShrink, periodInvalid, disabled, observations, onObservationsChange,
  draftSavedAt, eventTestId,
}: ContextBarProps) {
  const [showComments, setShowComments] = useState(false);
  const obsId = useId();
  const obsLen = observations.trim().length;
  const periodDisabled = !eventId || disabled;

  return (
    <section aria-label="Evento e período da grade" className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-primary shrink-0" aria-hidden="true">
            <CalendarDays className="w-4 h-4" />
          </span>
          <div className="w-[250px] max-w-full shrink-0">
            <EventCombobox
              events={events} value={eventId} showAllOption={false}
              onValueChange={(v) => onEventChange(v === "all" ? "" : v)}
              placeholder="Selecione um evento" testId={eventTestId}
              className="h-8 font-semibold"
            />
          </div>
          {selectedEvent && (
            <p className="text-xs text-slate-500 truncate max-w-[280px]" title={`Período do evento: ${formatDateRange(selectedEvent.startDate, selectedEvent.endDate, { withYear: true })}`}>
              {selectedEvent.location ? `${selectedEvent.location} · ` : ""}
              <span className="font-mono">{formatDateRange(selectedEvent.startDate, selectedEvent.endDate, { withYear: true })}</span>
            </p>
          )}
        </div>

        <span className="hidden md:block h-6 w-px bg-slate-200" aria-hidden="true" />

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Grade</span>
          <Label htmlFor="sug-period-start" className="sr-only">Início da grade</Label>
          <Input
            id="sug-period-start" type="date" value={periodStart} disabled={periodDisabled}
            min={bounds.min || undefined} max={bounds.max || undefined}
            title={PERIOD_HINT}
            aria-invalid={periodInvalid} aria-describedby={periodInvalid ? "sug-period-error" : undefined}
            onChange={(e) => onPeriodChange(e.target.value, periodEnd)}
            className="h-8 w-[138px] rounded-lg text-xs"
          />
          <span className="text-xs text-slate-400" aria-hidden="true">–</span>
          <Label htmlFor="sug-period-end" className="sr-only">Fim da grade</Label>
          <Input
            id="sug-period-end" type="date" value={periodEnd} disabled={periodDisabled}
            min={periodStart || bounds.min || undefined} max={bounds.max || undefined}
            title={PERIOD_HINT}
            aria-invalid={periodInvalid} aria-describedby={periodInvalid ? "sug-period-error" : undefined}
            onChange={(e) => onPeriodChange(periodStart, e.target.value)}
            className="h-8 w-[138px] rounded-lg text-xs"
          />
          {daysCount > 0 && (
            <span className="inline-flex h-8 items-center rounded-lg bg-brand-soft px-2.5 text-xs font-semibold text-primary tabular-nums">
              {daysCount} {daysCount === 1 ? "dia" : "dias"}
            </span>
          )}
          <button type="button" className={CHIP_BTN} disabled={periodDisabled} onClick={onEventPeriod}
            title="Voltar a grade para o período do evento">
            Período do evento
          </button>
          <button type="button" className={CHIP_BTN} disabled={periodDisabled || !canShrink} onClick={onShrink}
            title="Tirar o último dia da grade">
            Encolher 1 dia
          </button>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {draftSavedAt && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 whitespace-nowrap">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              Rascunho salvo {draftSavedAt}
            </span>
          )}
          <button
            type="button" className={CHIP_BTN} disabled={!eventId}
            aria-expanded={showComments} aria-controls={obsId}
            onClick={() => setShowComments((v) => !v)}
          >
            <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
            Comentários do evento
            {obsLen > 0 && (
              <span className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-semibold text-primary tabular-nums">{obsLen}</span>
            )}
            {showComments
              ? <ChevronUp className="w-3 h-3 text-slate-400" aria-hidden="true" />
              : <ChevronDown className="w-3 h-3 text-slate-400" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {showComments && (
        <div id={obsId} className="mt-2.5 border-t border-slate-100 pt-2.5 space-y-1">
          <Label htmlFor="sug-event-obs" className="sr-only">Comentários gerais do evento</Label>
          <Textarea
            id="sug-event-obs" value={observations} disabled={!eventId || disabled} rows={2} maxLength={2000}
            placeholder="Orientações gerais para as áreas (horários de montagem, ponto de encontro, restrições…)."
            onChange={(e) => onObservationsChange(e.target.value)}
            className={cn("rounded-lg text-sm min-h-0", observations && "bg-brand-soft/40 border-primary/20")}
          />
          <p className="text-[11px] text-slate-500">Salvos nas observações do evento junto com o envio da escala.</p>
        </div>
      )}
    </section>
  );
}

export default ContextBar;
