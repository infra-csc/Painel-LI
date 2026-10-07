/**
 * Visualizações "Mês" e "Semana" de Eventos (28/09, extraídas de
 * pages/events.tsx): navegação de período, chip de evento e as duas grades.
 * Recebem só os eventos ativos — não passam pelos filtros da barra.
 *
 * 07/10 (redesenho):
 *  - navegação em UM grupo (‹ Hoje ›) ao lado do título e a legenda das cores
 *    à direita — antes as setas boiavam e o "Hoje" ia para o outro canto;
 *  - sábado e domingo levemente tingidos: é quando a maioria das provas
 *    acontece, e a grade fica legível de relance;
 *  - a célula não "acende" mais no hover (não era clicável); o chip sim, com
 *    foco visível e nome falado completo (nome, período, status);
 *  - "+N mais" abre a lista do dia num popover (era um texto morto);
 *  - Semana com chips de verdade: nome, local e período;
 *  - celular: em vez de uma grade de 640px rolando de lado, a agenda do
 *    período — os dias com evento, um embaixo do outro.
 */
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import {
  addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format,
  isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths, subWeeks,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Event } from "@shared/schema";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/use-media-query";
import { STATUS, getEventStatus } from "@/lib/event-status";
import { NAV_BTN, WEEK_SHORT, eventsOnDay, formatPeriod } from "./events-shared";

const nomeFalado = (ev: Event) => `${ev.name}, ${formatPeriod(ev.startDate, ev.endDate)}, ${(STATUS[getEventStatus(ev)] ?? STATUS["planejado"]).label}`;

function EventChip({ ev, onClick, rico = false }: { ev: Event; onClick: () => void; rico?: boolean }) {
  const ds = getEventStatus(ev);
  const sc = STATUS[ds] ?? STATUS["planejado"];
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${ev.name} · ${ev.location}`}
      aria-label={nomeFalado(ev)}
      className={cn(
        "evt-chip block w-full min-w-0 text-left rounded-md border-l-[3px] cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        sc.tw.bg, sc.tw.text, sc.tw.edge,
        rico ? "px-2 py-1.5" : "px-1.5 py-[3px] text-2xs font-semibold leading-4 truncate",
      )}
    >
      {rico ? (
        <>
          <span className="block text-xs font-semibold leading-4 line-clamp-2">{ev.name}</span>
          <span className="mt-1 flex items-center gap-1 text-2xs leading-4 opacity-80 min-w-0">
            <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" /><span className="truncate">{ev.location}</span>
          </span>
          <span className="block text-2xs leading-4 tabular-nums opacity-80">{formatPeriod(ev.startDate, ev.endDate)}</span>
        </>
      ) : ev.name}
    </button>
  );
}

/** Legenda das cores dos chips — só os status que aparecem no calendário. */
function Legenda() {
  return (
    <ul aria-label="Legenda das cores" className="hidden md:flex items-center gap-3 m-0 p-0 list-none text-xs text-muted-foreground">
      {(["planejado", "em andamento", "concluído"] as const).map(k => (
        <li key={k} className="inline-flex items-center gap-1.5">
          <span className={cn("w-2.5 h-2.5 rounded-[3px]", STATUS[k].tw.dot)} aria-hidden="true" />{STATUS[k].label}
        </li>
      ))}
    </ul>
  );
}

function PeriodNav({ label, onPrev, onNext, onToday, prevLabel, nextLabel, ehHoje }: {
  label: string; onPrev: () => void; onNext: () => void; onToday: () => void;
  prevLabel: string; nextLabel: string; ehHoje: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 sm:px-5 py-3 border-b border-border">
      {/* `first-letter:uppercase`, não `capitalize` (25/09): "20–26 De Setembro De 2026" virava Title Case. */}
      <h2 className="m-0 min-w-0 text-base font-semibold text-foreground tracking-tight first-letter:uppercase truncate" aria-live="polite">
        {label}
      </h2>
      <div className="flex items-center gap-0.5 shrink-0 rounded-lg border border-border p-0.5">
        <button type="button" onClick={onPrev} aria-label={prevLabel} className={NAV_BTN}><ChevronLeft className="w-4 h-4" aria-hidden="true" /></button>
        <button
          type="button" onClick={onToday} disabled={ehHoje}
          className="pas-alvo h-8 px-2.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-muted transition-colors disabled:text-muted-foreground disabled:hover:bg-transparent disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Hoje
        </button>
        <button type="button" onClick={onNext} aria-label={nextLabel} className={NAV_BTN}><ChevronRight className="w-4 h-4" aria-hidden="true" /></button>
      </div>
      <div className="ml-auto"><Legenda /></div>
    </div>
  );
}

/** Agenda do período (celular): os dias, um embaixo do outro. */
function Agenda({ dias, events, onEdit, mostrarVazios, vazio }: {
  dias: Date[]; events: Event[]; onEdit: (e: Event) => void; mostrarVazios: boolean; vazio: string;
}) {
  const hoje = new Date();
  const linhas = dias.map(d => ({ d, evs: eventsOnDay(events, d) })).filter(l => mostrarVazios || l.evs.length > 0);
  if (linhas.length === 0) return <p className="m-0 px-4 py-10 text-center text-sm text-muted-foreground">{vazio}</p>;
  return (
    <ol className="m-0 p-0 list-none divide-y divide-border">
      {linhas.map(({ d, evs }) => {
        const eHoje = isSameDay(d, hoje);
        const fds = d.getDay() === 0 || d.getDay() === 6;
        // Dia livre: uma linha curta — a semana não vira uma rolagem de "Sem eventos".
        if (evs.length === 0) return (
          <li key={d.toISOString()} className={cn("flex items-center gap-3 px-4 py-2", eHoje ? "bg-brand-soft/60" : fds && "bg-surface-muted/50")}>
            <span className={cn("w-11 shrink-0 text-center text-xs tabular-nums", eHoje ? "font-semibold text-primary" : "text-muted-foreground")}>
              {WEEK_SHORT[d.getDay()]} {format(d, "d")}
            </span>
            <span className="text-xs text-muted-foreground">{eHoje ? "Hoje · sem eventos" : "Sem eventos"}</span>
          </li>
        );
        return (
          <li key={d.toISOString()} className={cn("flex gap-3 px-4 py-3", eHoje ? "bg-brand-soft/60" : fds && "bg-surface-muted/50")}>
            <div className="w-11 shrink-0 text-center leading-none">
              <span className={cn("block text-2xs font-semibold uppercase tracking-[0.06em]", eHoje ? "text-primary" : "text-muted-foreground")}>{WEEK_SHORT[d.getDay()]}</span>
              <span className={cn("mt-1 mx-auto flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold tabular-nums", eHoje ? "bg-primary text-primary-foreground" : "text-foreground")}>{format(d, "d")}</span>
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-1.5 justify-center">
              {evs.map(ev => <EventChip key={ev.id} ev={ev} rico onClick={() => onEdit(ev)} />)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export interface PeriodViewProps {
  events: Event[];
  onEdit: (e: Event) => void;
  currentDate: Date;
  setCurrentDate: (d: Date) => void;
}

const MOLDURA = "evt-entra bg-card rounded-xl border border-border shadow-1 overflow-hidden";

export function CalendarView({ events, onEdit, currentDate, setCurrentDate }: PeriodViewProps) {
  const isMobile = useIsMobile();
  const monthStart = startOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });
  const today = new Date();
  const MAX = 3;

  return (
    <div className={MOLDURA} data-testid="events-calendar">
      <PeriodNav
        label={format(currentDate, "MMMM 'de' yyyy", { locale: ptBR })}
        onPrev={() => setCurrentDate(subMonths(currentDate, 1))}
        onNext={() => setCurrentDate(addMonths(currentDate, 1))}
        onToday={() => setCurrentDate(new Date())}
        prevLabel="Mês anterior" nextLabel="Próximo mês"
        ehHoje={isSameMonth(currentDate, today)}
      />

      {isMobile ? (
        <Agenda
          dias={eachDayOfInterval({ start: monthStart, end: endOfMonth(currentDate) })}
          events={events} onEdit={onEdit} mostrarVazios={false}
          vazio="Nenhum evento neste mês."
        />
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            {/* Dias da semana */}
            <div className="grid grid-cols-7 border-b border-border bg-surface-muted">
              {WEEK_SHORT.map((d) => (
                <div key={d} className="py-2 text-center text-2xs font-semibold text-muted-foreground uppercase tracking-[0.06em]">{d}</div>
              ))}
            </div>

            {/* Grade */}
            <div className="grid grid-cols-7">
              {days.map((day, i) => {
                const inMonth = isSameMonth(day, currentDate);
                const isToday = isSameDay(day, today);
                const fds = i % 7 === 0 || i % 7 === 6;
                const chips = eventsOnDay(events, day);
                return (
                  <div
                    key={i}
                    className={cn(
                      "min-h-[112px] p-1.5 flex flex-col gap-1",
                      (i + 1) % 7 !== 0 && "border-r border-border",
                      i < days.length - 7 && "border-b border-border",
                      isToday ? "bg-brand-soft/60" : fds ? "bg-surface-muted/50" : "bg-card",
                    )}
                  >
                    <div className="flex items-center justify-between px-0.5 h-6">
                      <span className={cn(
                        "inline-flex items-center justify-center min-w-6 h-6 rounded-full text-xs tabular-nums",
                        isToday ? "px-1.5 bg-primary text-primary-foreground font-semibold" : inMonth ? "text-slate-700 font-medium" : "text-muted-foreground/60",
                      )}>{format(day, "d")}</span>
                      {isToday && <span className="text-2xs font-semibold text-primary uppercase tracking-[0.06em]">Hoje</span>}
                    </div>
                    <div className={cn("flex flex-col gap-0.5 min-w-0", !inMonth && "opacity-55")}>
                      {chips.slice(0, MAX).map(ev => <EventChip key={ev.id} ev={ev} onClick={() => onEdit(ev)} />)}
                      {chips.length > MAX && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button type="button" className="self-start h-5 px-1.5 rounded text-2xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label={`Ver mais ${chips.length - MAX} eventos em ${format(day, "d 'de' MMMM", { locale: ptBR })}`}>
                              + {chips.length - MAX} mais
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-64 p-2 rounded-xl">
                            <p className="m-0 mb-1.5 px-1 text-xs font-semibold text-foreground first-letter:uppercase">{format(day, "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
                            <div className="flex flex-col gap-1">
                              {chips.map(ev => <EventChip key={ev.id} ev={ev} rico onClick={() => onEdit(ev)} />)}
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function WeekView({ events, onEdit, currentDate, setCurrentDate }: PeriodViewProps) {
  const isMobile = useIsMobile();
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const today = new Date();

  const rangeLabel = weekStart.getMonth() === weekEnd.getMonth()
    ? `${format(weekStart, "d")}–${format(weekEnd, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}`
    : `${format(weekStart, "d MMM", { locale: ptBR })} – ${format(weekEnd, "d MMM yyyy", { locale: ptBR })}`;

  return (
    <div className={MOLDURA} data-testid="events-week">
      <PeriodNav
        label={rangeLabel}
        onPrev={() => setCurrentDate(subWeeks(currentDate, 1))}
        onNext={() => setCurrentDate(addWeeks(currentDate, 1))}
        onToday={() => setCurrentDate(new Date())}
        prevLabel="Semana anterior" nextLabel="Próxima semana"
        ehHoje={days.some(d => isSameDay(d, today))}
      />

      {isMobile ? (
        <Agenda dias={days} events={events} onEdit={onEdit} mostrarVazios vazio="Nenhum evento nesta semana." />
      ) : (
        <div className="overflow-x-auto">
          <div className="grid grid-cols-7 min-w-[640px]">
            {days.map((day, i) => {
              const isToday = isSameDay(day, today);
              const fds = i === 0 || i === 6;
              const chips = eventsOnDay(events, day);
              return (
                <div key={i} className={cn("min-h-[220px] flex flex-col", i < 6 && "border-r border-border", isToday ? "bg-brand-soft/40" : fds && "bg-surface-muted/50")}>
                  {/* Cabeçalho do dia */}
                  <div className={cn("flex items-center justify-center gap-2 py-2.5 px-2 border-b border-border", isToday ? "bg-brand-soft/70" : "bg-surface-muted")}>
                    <span className={cn("text-2xs font-semibold uppercase tracking-[0.06em]", isToday ? "text-primary" : "text-muted-foreground")}>
                      {WEEK_SHORT[i]}
                    </span>
                    <span className={cn(
                      "inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-semibold tabular-nums",
                      isToday ? "bg-primary text-primary-foreground" : "text-foreground",
                    )}>{format(day, "d")}</span>
                  </div>
                  {/* Chips */}
                  <div className="flex-1 p-1.5 flex flex-col gap-1">
                    {chips.map(ev => <EventChip key={ev.id} ev={ev} rico onClick={() => onEdit(ev)} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
