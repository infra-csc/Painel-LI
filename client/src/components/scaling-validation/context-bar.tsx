import { memo, useId, useState, type Ref } from "react";
import { CalendarDays, ChevronDown, MapPin, MessageSquare } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import EventCombobox from "@/components/ui/event-combobox";
import { cn, formatDateRange } from "@/lib/utils";
import type { Event } from "@shared/schema";

export interface ContextBarProps {
  events: Event[];
  eventId: string;
  onEventChange: (id: string) => void;
  selectedEvent: Event | undefined;
  /** Trava a EDIÇÃO (o recado). Sem `eventPickerDisabled`, trava também o seletor. */
  disabled?: boolean;
  /**
   * Trava só o seletor de evento. Ver outro evento é leitura: no modo leitura
   * a página passa `false` aqui (seletor livre) e `true` em `disabled`.
   */
  eventPickerDisabled?: boolean;
  observations: string;
  onObservationsChange: (v: string) => void;
  eventTestId?: string;
  /** Ref do gatilho do seletor de evento (o estado vazio da página o abre por código). */
  eventTriggerRef?: Ref<HTMLButtonElement>;
}

/** Limite do recado (o mesmo `maxLength` de antes). */
const OBS_MAX = 2000;

/**
 * Linha do evento da Sugestão de Escala.
 *
 * 07/10 (redesenho): a mesma linha da Validação e da Aprovação, sem moldura —
 * escolher o evento à esquerda, o que se faz com ele (o recado para as áreas)
 * à direita e, embaixo, alinhada ao texto do seletor, a linha de fatos
 * (datas, local). O período da GRADE saiu daqui para o resumo da grade
 * (`GridSummary`): é propriedade da grade, não do evento, e ficava espremido
 * entre o seletor e o recado num cartão de duas linhas.
 *
 * `memo`: a página re-renderiza a cada tecla na grade e a linha não depende
 * das linhas da grade — sem o memo ela era redesenhada junto, à toa.
 */
export const ContextBar = memo(function ContextBar({
  events, eventId, onEventChange, selectedEvent, disabled, eventPickerDisabled, observations, onObservationsChange,
  eventTestId, eventTriggerRef,
}: ContextBarProps) {
  const [showComments, setShowComments] = useState(false);
  const obsId = useId();
  const obsFilled = observations.trim().length > 0;

  const recadoBtn = (
    <button
      type="button"
      className={cn(
        "sug-alvo inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        showComments ? "border-primary/30 bg-brand-soft text-primary" : "border-border bg-card text-slate-700 hover:border-primary/30 hover:bg-brand-soft/50 hover:text-primary",
      )}
      aria-expanded={showComments} aria-controls={obsId}
      onClick={() => setShowComments((v) => !v)}
    >
      <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
      Recado para as áreas
      {/* Ponto = "tem recado". O número de caracteres não dizia nada a ninguém. */}
      {obsFilled && (
        <>
          <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
          <span className="sr-only">(preenchido)</span>
        </>
      )}
      <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none", showComments && "rotate-180")} aria-hidden="true" />
    </button>
  );

  return (
    <section aria-label="Evento" className="space-y-2">
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:gap-4">
        {/* Cresce até 440px quando há espaço: nome de evento longo cortado
            deixava a pessoa sem saber em qual evento estava. */}
        <div className="flex min-w-0 items-center gap-2 sm:max-w-[480px] lg:w-[440px] lg:max-w-[60%]">
          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            {/* Travado durante o envio: trocar de evento no meio do POST fazia o
                sucesso limpar o rascunho do evento errado. */}
            <EventCombobox
              events={events} value={eventId} showAllOption={false}
              onValueChange={(v) => onEventChange(v === "all" ? "" : v)}
              placeholder="Selecione um evento" testId={eventTestId}
              className="h-9 font-semibold"
              disabled={eventPickerDisabled ?? disabled}
              triggerRef={eventTriggerRef}
            />
          </div>
        </div>
        {/* O recado só existe com evento: é gravado nas observações DELE. A partir
            de lg ele fica à direita do seletor; antes disso, depois da linha de fatos. */}
        {eventId && <div className="ml-auto hidden lg:flex">{recadoBtn}</div>}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-xs text-muted-foreground">
        {selectedEvent ? (
          <>
            <span className="whitespace-nowrap tabular-nums text-slate-700" title="Período do evento">
              {formatDateRange(selectedEvent.startDate, selectedEvent.endDate, { withYear: true })}
            </span>
            {selectedEvent.location && (
              <span className="inline-flex min-w-0 items-center gap-1" title={selectedEvent.location}>
                <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="max-w-[260px] truncate">{selectedEvent.location}</span>
              </span>
            )}
          </>
        ) : (
          <span>Escolha o evento para abrir a grade de função × dia.</span>
        )}
      </div>
      {eventId && <div className="flex pl-6 pt-0.5 lg:hidden">{recadoBtn}</div>}

      {eventId && showComments && (
        <div id={obsId} className="sug-entra ml-6 space-y-1.5 rounded-xl border border-border bg-card px-4 py-3 shadow-[0_1px_2px_hsl(222_47%_11%/0.04)]">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <Label htmlFor="sug-event-obs" className="text-xs font-semibold text-foreground">Recado para as áreas</Label>
            <span className="text-2xs tabular-nums text-muted-foreground" aria-hidden="true">{observations.length}/{OBS_MAX}</span>
          </div>
          <Textarea
            id="sug-event-obs" value={observations} disabled={!eventId || disabled} rows={3} maxLength={OBS_MAX}
            placeholder="Orientações gerais para as áreas (horários de montagem, ponto de encontro, restrições…)."
            onChange={(e) => onObservationsChange(e.target.value)}
            className={cn("min-h-0 w-full resize-y rounded-lg text-sm", observations && "border-primary/20 bg-brand-soft/30")}
          />
          <p className="text-2xs text-muted-foreground">Vai para as observações do evento junto com o envio da escala — as áreas leem como “Nota da logística” na Validação.</p>
        </div>
      )}
    </section>
  );
});

export default ContextBar;
