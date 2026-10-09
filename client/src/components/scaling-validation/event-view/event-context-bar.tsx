/**
 * Barra da tela e linha do evento do Histórico da escala.
 *
 * 07/10 (redesenho premium — irmã da Sugestão, Validação e Aprovação):
 *  - BARRA de 56px grudada no topo: título, os passos do módulo e, à direita,
 *    "Exportar CSV" — a única ação da tela (ela é só consulta). Antes o título
 *    abria a página com um parágrafo, os passos ficavam soltos embaixo e tudo
 *    sumia ao rolar a linha do tempo.
 *  - Linha do EVENTO sem moldura: o seletor à esquerda, os comentários do
 *    evento à direita e, embaixo, alinhada ao texto do seletor, a linha de
 *    fatos (datas, local, última movimentação). Era um cartão com o seletor,
 *    o funil, sete cartões de KPI e a última movimentação disputando espaço.
 *  - O resumo (KPIs + funil) foi para `history-summary.tsx`.
 */
import { forwardRef, type ReactNode } from "react";
import { CalendarDays, History, MapPin, Timer } from "lucide-react";
import EventCombobox from "@/components/ui/event-combobox";
import { formatDateRange } from "@/lib/utils";
import { ScalingModuleNav } from "@/components/scaling-validation/scaling-module-nav";
import { EventCommentsButton } from "@/components/scaling-validation/event-comments-dialog";
import { ALL, CONTORNO, fmtShort, type TlEntry } from "./event-view-shared";
import type { EventHistory } from "./use-event-history";

/** Barra da tela — grudada abaixo da barra do app (`--sticky-top`); uma linha de 56px a partir de xl. */
export function HistoryBar({ eventId, acoes }: { eventId: string; acoes?: ReactNode }) {
  return (
    <header className="sticky top-[var(--sticky-top)] z-30 -mx-[var(--page-gutter)] -mt-[var(--page-gutter)] grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-border bg-card px-[var(--page-gutter)] py-2 xl:flex xl:h-14 xl:gap-x-4 xl:py-0">
      <h1 className="flex min-w-0 items-center gap-2 text-base font-semibold tracking-[-0.01em] text-foreground">
        <History className="h-[18px] w-[18px] shrink-0 text-primary" aria-hidden="true" />
        <span className="truncate">Histórico da escala</span>
      </h1>
      <div className="order-last col-span-2 min-w-0 xl:order-none">
        <ScalingModuleNav current="history" eventId={eventId} />
      </div>
      {/* O subtítulo antigo, em meia linha onde há espaço. */}
      <p className="hidden min-w-0 truncate text-xs text-muted-foreground 2xl:block">
        Cada envio, validação, pedido e decisão — e onde cada vaga está agora.
      </p>
      <div className="flex justify-end xl:ml-auto">{acoes}</div>
    </header>
  );
}

export interface EventContextBarProps {
  h: EventHistory;
  eventId: string;
  setEventId: (id: string) => void;
  lastMovement: TlEntry | null;
}

/** Linha do evento: escolher o evento e, embaixo, os fatos dele. */
export const EventContextBar = forwardRef<HTMLDivElement, EventContextBarProps>(function EventContextBar({ h, eventId, setEventId, lastMovement }, eventPickerRef) {
  const { loadingEvents, activeEvents, selectedEvent, eventsInView, showData } = h;
  return (
    <section aria-label="Evento" className="space-y-2">
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:gap-4">
        {/* Cresce até 440px quando há espaço: nome de evento longo cortado
            deixava a pessoa sem saber em qual evento estava. */}
        <div className="flex min-w-0 items-center gap-2 sm:max-w-[480px] lg:w-[440px] lg:max-w-[60%]">
          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div ref={eventPickerRef} className="min-w-0 flex-1">
            {loadingEvents ? (
              <div className="val-osso h-9" aria-hidden="true" />
            ) : (
              <EventCombobox
                events={activeEvents} value={eventId || ALL} showAllOption
                onValueChange={(v) => setEventId(v === ALL ? "" : v)}
                placeholder="Todos os eventos" testId="scaling-event-view-event"
                className="h-9 font-semibold"
              />
            )}
          </div>
        </div>
        {selectedEvent && (
          <div className="flex flex-wrap gap-2 pl-6 lg:ml-auto lg:justify-end lg:pl-0">
            <EventCommentsButton eventId={selectedEvent.id} eventName={selectedEvent.name} className={CONTORNO} rotuloCurtoNoCelular />
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-6 text-xs text-muted-foreground">
        {selectedEvent ? (
          <>
            <span className="whitespace-nowrap tabular-nums text-slate-700">{formatDateRange(selectedEvent.startDate, selectedEvent.endDate, { withYear: true })}</span>
            {selectedEvent.location && (
              <span className="inline-flex min-w-0 items-center gap-1" title={selectedEvent.location}>
                <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="max-w-[260px] truncate">{selectedEvent.location}</span>
              </span>
            )}
          </>
        ) : (
          <span>
            {eventsInView > 0
              ? `${eventsInView} ${eventsInView === 1 ? "evento" : "eventos"} — com vaga em validação, pedido em aberto ou encerrados há pouco.`
              : "Todos os eventos — escolha um para filtrar."}
          </span>
        )}
        {showData && lastMovement && (
          <>
            <span className="hidden h-3.5 w-px bg-border lg:block" aria-hidden="true" />
            <span className="flex min-w-0 basis-full items-start gap-1.5 lg:basis-auto lg:items-center" data-testid="hes-ultima-movimentacao">
              <Timer className="mt-px h-3.5 w-3.5 shrink-0 lg:mt-0" aria-hidden="true" />
              <span className="min-w-0">
                Última movimentação{" "}
                <span className="tabular-nums text-slate-700">{fmtShort(lastMovement.at)}</span>
                <span className="text-slate-700"> · {lastMovement.title.toLowerCase()}</span>
              </span>
            </span>
          </>
        )}
      </div>
    </section>
  );
});
