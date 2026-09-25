/**
 * Visão Semana do Calendário (25/09 — extraída de pages/calendar.tsx): sete
 * colunas em md+ e lista vertical por dia no celular.
 */
import { useMemo } from "react";
import type { Event } from "@shared/schema";
import { CalendarEmptyState, WEEK_DAY_LONG, WEEK_DAY_SHORT, addDays, getCfg, getEffectiveStatus, type SelectEventFn } from "./calendar-shared";

export function WeekView({ weekStart, events, onSelectEvent }: {
  weekStart: Date;
  events: Event[];
  onSelectEvent: SelectEventFn;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const eventsPerDay = useMemo(() => days.map(day => {
    const dayStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    return events.filter(ev => {
      return ev.startDate <= dayStr && ev.endDate >= dayStr;
    });
  }), [days, events]);

  const weekHasEvents = eventsPerDay.some(list => list.length > 0);

  // Índices Seg=0 … Dom=6 → fim de semana = 5 e 6
  const isWeekend = (i: number) => i === 5 || i === 6;

  return (
    <div className="bg-card rounded-xl border border-border shadow-1 overflow-hidden flex flex-col" style={{ height: "100%" }}>

      {/* Day header row — só em md+; no mobile cada dia tem seu próprio cabeçalho */}
      <div className="hidden md:grid grid-cols-7 border-b border-border shrink-0">
        {days.map((day, i) => {
          const isToday = day.getTime() === today.getTime();
          return (
            <div
              key={i}
              className={`py-4 px-2 text-center border-r border-border last:border-r-0
                ${isWeekend(i) ? "bg-surface-muted/60" : ""}
                ${isToday ? "bg-brand-soft/70" : ""}
              `}
            >
              <p className={`text-2xs font-bold uppercase tracking-widest mb-1 ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                {WEEK_DAY_SHORT[i]}
              </p>
              <p className={`text-2xl font-black leading-none ${isToday ? "text-primary" : "text-foreground"}`}>
                {day.getDate()}
              </p>
              {isToday && <div className="w-1.5 h-1.5 bg-primary rounded-full mx-auto mt-2" />}
            </div>
          );
        })}
      </div>

      {!weekHasEvents && (
        <div className="shrink-0 border-b border-border">
          <CalendarEmptyState label="nesta semana" />
        </div>
      )}

      {/* Corpo: colunas em md+, lista vertical por dia abaixo de md */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="flex flex-col md:grid md:grid-cols-7 md:h-full" style={{ minHeight: "100%" }}>
          {days.map((day, i) => {
            const isToday = day.getTime() === today.getTime();
            const dayEvents = eventsPerDay[i];
            return (
              <div
                key={i}
                className={`border-b md:border-b-0 md:border-r border-border last:border-r-0 last:border-b-0 p-2 flex flex-col gap-2 md:min-h-[260px]
                  ${isWeekend(i) ? "bg-surface-muted/30" : ""}
                  ${isToday ? "bg-brand-soft/20" : ""}
                `}
              >
                {/* Cabeçalho do dia (mobile) */}
                <div className="md:hidden flex items-center gap-2 px-1 pt-1">
                  <span className={`text-lg font-black leading-none ${isToday ? "text-primary" : "text-foreground"}`}>{day.getDate()}</span>
                  <span className={`text-2xs font-bold uppercase tracking-widest ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                    {WEEK_DAY_LONG[i]}
                  </span>
                  {isToday && <span className="ml-auto text-2xs font-bold uppercase tracking-wider bg-brand-soft text-primary px-1.5 py-0.5 rounded-full">Hoje</span>}
                </div>
                {dayEvents.length === 0 && (
                  <span className="text-2xs text-muted-foreground select-none px-1 md:mx-auto md:mt-6">
                    <span className="md:hidden">Sem eventos</span>
                    <span className="hidden md:inline">–</span>
                  </span>
                )}
                {dayEvents.map(ev => {
                  const cfg = getCfg(getEffectiveStatus(ev));
                  return (
                    <button
                      key={ev.id}
                      onClick={(e) => onSelectEvent(ev, { x: e.clientX, y: e.clientY })}
                      className={`w-full text-left rounded-xl p-2.5 border-l-4 shadow-1 hover:shadow-2 transition-shadow ${cfg.panelBg} ${cfg.edge}`}
                    >
                      {cfg.pulse && (
                        <div className="flex items-center gap-1 mb-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} animate-pulse motion-reduce:animate-none shrink-0`} />
                          <p className={`text-2xs font-bold uppercase tracking-tight ${cfg.text}`}>
                            {cfg.label}
                          </p>
                        </div>
                      )}
                      <p className="text-2xs font-black leading-snug text-foreground">
                        {ev.name}
                      </p>
                      {ev.location && (
                        <p className={`text-2xs mt-1 font-medium truncate ${cfg.text} opacity-80`}>
                          {ev.location}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
