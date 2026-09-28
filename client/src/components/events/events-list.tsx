/**
 * Visualização "Lista" de Eventos e o cartão de evento (28/09, extraídos de
 * pages/events.tsx). O `EventCard` é o MESMO cartão que a tabela usa no
 * celular (`cardRender` do DataTable) — antes a tela trocava a tabela pela
 * Lista abaixo de `md`; agora o DataTable faz a troca e o cartão é um só.
 */
import { CalendarDays, MapPin } from "lucide-react";
import type { Event } from "@shared/schema";
import { cn } from "@/lib/utils";
import { STATUS, getEventStatus } from "@/lib/event-status";
import { EventRowActions, type EventRowActionsProps } from "./event-row-actions";
import { EventStatusBadge, formatPeriod } from "./events-shared";

export type EventCardProps = Omit<EventRowActionsProps, "event"> & {
  ev: Event;
  /** Escalações ativas do evento (0 esconde o contador). */
  escalacoes: number;
};

export function EventCard({ ev, escalacoes: esc, ...acoes }: EventCardProps) {
  const ds = getEventStatus(ev);
  const sc = STATUS[ds] ?? STATUS["planejado"];
  return (
    <div
      className={cn(
        "group flex items-stretch bg-card rounded-lg overflow-hidden border border-border shadow-1 transition-[box-shadow,transform] hover:shadow-2 hover:-translate-y-px",
        ds === "excluído" && "opacity-60",
      )}
    >
      <div className={cn("w-1 shrink-0", sc.tw.bar)} />
      <div className="flex-1 flex flex-wrap sm:flex-nowrap items-center gap-x-3.5 gap-y-2 min-w-0 px-3.5 py-[11px]">
        <span className="text-2xs font-bold text-muted-foreground shrink-0 tabular-nums">#{ev.eventNumber}</span>
        <div className="flex-1 min-w-0 basis-full sm:basis-auto order-last sm:order-none">
          <div className="flex items-center gap-1.5">
            {ds === "em andamento" && <span className="animate-pulse motion-reduce:animate-none w-1.5 h-1.5 rounded-full bg-warning-strong shrink-0" />}
            <span className="text-sm font-bold text-foreground truncate">{ev.name}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
            <span className="flex items-center gap-[3px] text-2xs text-muted-foreground">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {ev.location}
            </span>
            <span className="flex items-center gap-[3px] text-2xs text-muted-foreground">
              <CalendarDays className="h-3 w-3" aria-hidden="true" />
              {formatPeriod(ev.startDate, ev.endDate)}
            </span>
            {esc > 0 && (
              <span className="text-2xs text-muted-foreground">
                <b className="text-slate-700">{esc}</b> escal.
              </span>
            )}
          </div>
        </div>
        <EventStatusBadge ds={ds} />
        <div className="flex gap-px shrink-0 ml-auto sm:ml-0">
          <EventRowActions event={ev} {...acoes} />
        </div>
      </div>
    </div>
  );
}

export interface EventsListProps extends Omit<EventRowActionsProps, "event"> {
  events: Event[];
  escalacoes: Record<string, number>;
  empty: React.ReactNode;
}

export function EventsList({ events, escalacoes, empty, ...acoes }: EventsListProps) {
  if (events.length === 0) return <>{empty}</>;
  return (
    <div className="flex flex-col gap-1.5">
      {events.map(ev => <EventCard key={ev.id} ev={ev} escalacoes={escalacoes[ev.id] ?? 0} {...acoes} />)}
    </div>
  );
}

export default EventsList;
