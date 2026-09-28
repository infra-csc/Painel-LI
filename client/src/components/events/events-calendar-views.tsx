/**
 * Visualizações "Mês" e "Semana" de Eventos (28/09, extraídas de
 * pages/events.tsx sem mudança visual): navegação de período, chip de evento e
 * as duas grades. Recebem só os eventos ativos — não passam pelos filtros da barra.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format,
  isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths, subWeeks,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Event } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { STATUS, getEventStatus } from "@/lib/event-status";
import { NAV_BTN, WEEK_SHORT, eventsOnDay } from "./events-shared";

function EventChip({ ev, onClick }: { ev: Event; onClick: () => void }) {
  const ds = getEventStatus(ev);
  const sc = STATUS[ds] ?? STATUS["planejado"];
  return (
    <button
      onClick={onClick}
      title={`${ev.name} · ${ev.location}`}
      className={cn(
        "block w-full text-left px-[7px] py-[3px] rounded-md border-l-[3px] text-2xs font-semibold leading-4 truncate cursor-pointer",
        sc.tw.bg, sc.tw.text, sc.tw.edge,
      )}
    >
      {ev.name}
    </button>
  );
}

function PeriodNav({ label, onPrev, onNext, onToday, prevLabel, nextLabel, size = "lg" }: {
  label: string; onPrev: () => void; onNext: () => void; onToday: () => void;
  prevLabel: string; nextLabel: string; size?: "lg" | "md";
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-7 py-4 sm:py-5 border-b border-border">
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        {/* `first-letter:uppercase`, não `capitalize` (25/09): "20–26 De Setembro De 2026" virava Title Case. */}
        <h2 className={cn("m-0 font-extrabold text-foreground tracking-tight first-letter:uppercase truncate", size === "lg" ? "text-lg" : "text-base")}>
          {label}
        </h2>
        <div className="flex gap-0.5 shrink-0">
          <button type="button" onClick={onPrev} aria-label={prevLabel} className={NAV_BTN}><ChevronLeft size={16} aria-hidden="true" /></button>
          <button type="button" onClick={onNext} aria-label={nextLabel} className={NAV_BTN}><ChevronRight size={16} aria-hidden="true" /></button>
        </div>
      </div>
      <Button type="button" variant="outline" size="sm" className="h-8 text-xs font-bold hover:border-primary hover:text-primary hover:bg-brand-soft" onClick={onToday}>
        Hoje
      </Button>
    </div>
  );
}

export interface PeriodViewProps {
  events: Event[];
  onEdit: (e: Event) => void;
  currentDate: Date;
  setCurrentDate: (d: Date) => void;
}

export function CalendarView({ events, onEdit, currentDate, setCurrentDate }: PeriodViewProps) {
  const monthStart = startOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });
  const today = new Date();

  return (
    <div className="bg-card rounded-xl overflow-hidden shadow-2 border border-border">
      <PeriodNav
        label={format(currentDate, "MMMM yyyy", { locale: ptBR })}
        onPrev={() => setCurrentDate(subMonths(currentDate, 1))}
        onNext={() => setCurrentDate(addMonths(currentDate, 1))}
        onToday={() => setCurrentDate(new Date())}
        prevLabel="Mês anterior" nextLabel="Próximo mês"
      />

      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-border bg-muted/30">
            {WEEK_SHORT.map((d) => (
              <div key={d} className="py-2.5 text-center text-2xs font-bold text-muted-foreground uppercase tracking-[0.08em]">{d}</div>
            ))}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-7">
            {days.map((day, i) => {
              const inMonth = isSameMonth(day, currentDate);
              const isToday = isSameDay(day, today);
              const chips = eventsOnDay(events, day);
              const MAX = 3;
              return (
                <div
                  key={i}
                  className={cn(
                    "min-h-[120px] p-2 transition-colors",
                    (i + 1) % 7 !== 0 && "border-r border-border",
                    i < days.length - 7 && "border-b border-border",
                    isToday ? "bg-brand-soft/60" : !inMonth ? "bg-muted/10 opacity-45" : "bg-card hover:bg-brand-soft/30",
                  )}
                >
                  {isToday ? (
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full shrink-0 text-xs font-bold bg-primary text-primary-foreground">{format(day, "d")}</span>
                      <span className="text-2xs font-bold text-primary uppercase tracking-[0.08em]">Hoje</span>
                    </div>
                  ) : (
                    <span className={cn("block mb-1.5 text-xs font-medium", inMonth ? "text-muted-foreground" : "text-muted-foreground")}>{format(day, "d")}</span>
                  )}
                  <div className="flex flex-col gap-0.5">
                    {chips.slice(0, MAX).map(ev => <EventChip key={ev.id} ev={ev} onClick={() => onEdit(ev)} />)}
                    {chips.length > MAX && (
                      <span className="text-2xs text-muted-foreground font-bold pl-1">+ {chips.length - MAX} mais</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function WeekView({ events, onEdit, currentDate, setCurrentDate }: PeriodViewProps) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const today = new Date();

  const rangeLabel = weekStart.getMonth() === weekEnd.getMonth()
    ? `${format(weekStart, "d")}–${format(weekEnd, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}`
    : `${format(weekStart, "d MMM", { locale: ptBR })} – ${format(weekEnd, "d MMM yyyy", { locale: ptBR })}`;

  return (
    <div className="bg-card rounded-xl overflow-hidden shadow-2 border border-border">
      <PeriodNav
        label={rangeLabel}
        onPrev={() => setCurrentDate(subWeeks(currentDate, 1))}
        onNext={() => setCurrentDate(addWeeks(currentDate, 1))}
        onToday={() => setCurrentDate(new Date())}
        prevLabel="Semana anterior" nextLabel="Próxima semana"
        size="md"
      />

      <div className="overflow-x-auto">
        <div className="grid grid-cols-7 min-w-[640px]">
          {days.map((day, i) => {
            const isToday = isSameDay(day, today);
            const chips = eventsOnDay(events, day);
            return (
              <div key={i} className={cn("min-h-[180px]", i < 6 && "border-r border-border")}>
                {/* Column header */}
                <div className={cn("py-3 px-2 text-center border-b border-border", isToday ? "bg-brand-soft/60" : "bg-muted/30")}>
                  <div className={cn("text-2xs font-bold uppercase tracking-[0.08em] mb-1.5", isToday ? "text-primary" : "text-muted-foreground")}>
                    {WEEK_SHORT[i]}
                  </div>
                  <div className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-full mx-auto text-sm font-bold",
                    isToday ? "bg-primary text-primary-foreground" : "bg-transparent text-slate-700",
                  )}>{format(day, "d")}</div>
                </div>
                {/* Chips */}
                <div className="py-2 px-1.5 flex flex-col gap-[3px]">
                  {chips.length === 0 && <div className="h-8" />}
                  {chips.map(ev => <EventChip key={ev.id} ev={ev} onClick={() => onEdit(ev)} />)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
