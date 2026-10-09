/**
 * Visualização "Lista" de Eventos e o cartão de evento (28/09, extraídos de
 * pages/events.tsx). O `EventCard` é o MESMO cartão que a tabela usa no
 * celular (`cardRender` do DataTable) — antes a tela trocava a tabela pela
 * Lista abaixo de `md`; agora o DataTable faz a troca e o cartão é um só.
 *
 * 07/10 (redesenho): a Lista deixou de ser a tabela com outra moldura (uma
 * fileira de cartões finos com filete colorido) e virou uma grade de cartões
 * de agenda — a folhinha da data à esquerda, nome e local, as observações
 * (que a tabela não mostra) e um rodapé com o período por extenso ("começa em
 * 2 dias") e as escalações. O cartão inteiro abre o evento; os botões ficam
 * acima do clique. Cartões da mesma fileira têm a mesma altura (rodapé no fundo).
 */
import { CalendarDays, MapPin, StickyNote, Users } from "lucide-react";
import type { Event } from "@shared/schema";
import { cn } from "@/lib/utils";
import { getEventStatus } from "@/lib/event-status";
import { EventRowActions, type EventRowActionsProps } from "./event-row-actions";
import { EventStatusBadge, FolhinhaDeData, formatPeriod, quandoAcontece } from "./events-shared";

export type EventCardProps = Omit<EventRowActionsProps, "event"> & {
  ev: Event;
  /** Escalações ativas do evento (0 esconde o contador). */
  escalacoes: number;
};

export function EventCard({ ev, escalacoes: esc, ...acoes }: EventCardProps) {
  const ds = getEventStatus(ev);
  const excluido = ds === "excluído";
  const quando = quandoAcontece(ev);
  const obs = ev.observations?.trim();
  return (
    <article
      className={cn(
        "evt-cartao relative flex flex-col h-full rounded-xl border border-border bg-card shadow-1",
        excluido ? "bg-surface-muted/60" : "hover:border-primary/30 hover:shadow-2",
      )}
      data-testid={`card-event-${ev.id}`}
    >
      <div className="flex items-start gap-3 px-3.5 pt-3.5 pb-3">
        <FolhinhaDeData ev={ev} ds={ds} className={cn(excluido && "opacity-70")} />
        <div className={cn("min-w-0 flex-1", excluido && "opacity-70")}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-2xs font-semibold text-muted-foreground tabular-nums">#{ev.eventNumber}</span>
            <EventStatusBadge ds={ds} />
          </div>
          <h3 className="m-0 mt-1 text-sm font-semibold leading-5 text-foreground">
            {excluido ? (
              <span className="line-through decoration-muted-foreground/50">{ev.name}</span>
            ) : (
              // O nome é o alvo do clique do cartão inteiro (o ::after cobre o cartão).
              <button type="button" onClick={() => acoes.onEdit(ev)} className="evt-abrir text-left rounded-sm focus-visible:outline-none">
                {ev.name}
              </button>
            )}
          </h3>
          <p className="m-0 mt-0.5 flex items-start gap-1 text-xs leading-[18px] text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0">{ev.location}</span>
          </p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0 -mr-1.5 -mt-1">
          <EventRowActions event={ev} {...acoes} />
        </div>
      </div>

      {obs && (
        <p className={cn("m-0 -mt-1 mx-3.5 mb-3 flex items-start gap-1.5 text-xs leading-[18px] text-slate-600", excluido && "opacity-70")}>
          <StickyNote className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 line-clamp-2" title={obs}><span className="sr-only">Observações: </span>{obs}</span>
        </p>
      )}

      {/* Rodapé em duas colunas que nunca quebram: quando (período + por extenso) | escalações. */}
      <div className={cn("mt-auto flex items-center justify-between gap-3 px-3.5 py-2.5 border-t border-border/70 rounded-b-xl bg-surface-muted/50", excluido && "opacity-70")}>
        <div className="flex items-start gap-2 min-w-0">
          <CalendarDays className="h-3.5 w-3.5 mt-[3px] shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0 leading-5">
            <span className="block text-sm text-foreground tabular-nums">{formatPeriod(ev.startDate, ev.endDate)}</span>
            {quando && <span className={cn("block text-xs leading-4", ds === "em andamento" ? "text-primary font-medium" : "text-muted-foreground")}>{quando}</span>}
          </div>
        </div>
        <div className="flex items-start gap-2 shrink-0 text-right">
          <Users className="h-3.5 w-3.5 mt-[3px] shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="leading-5">
            <span className={cn("block text-sm tabular-nums", esc > 0 ? "font-semibold text-foreground" : "text-muted-foreground")}>{esc > 0 ? esc : "—"}</span>
            <span className="block text-xs leading-4 text-muted-foreground">{esc === 1 ? "escalação" : esc > 0 ? "escalações" : "sem escalação"}</span>
          </div>
        </div>
      </div>
    </article>
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
    <ul role="list" aria-label="Eventos" className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {events.map(ev => (
        <li key={ev.id} className="min-w-0">
          <EventCard ev={ev} escalacoes={escalacoes[ev.id] ?? 0} {...acoes} />
        </li>
      ))}
    </ul>
  );
}

export default EventsList;
