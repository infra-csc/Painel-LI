/**
 * Visão Lista do Calendário (25/09 — extraída de pages/calendar.tsx): eventos
 * agrupados por mês, do mês atual em diante e depois os passados (mais recente primeiro).
 */
import { useMemo } from "react";
import { Calendar, CalendarDays, MapPin } from "lucide-react";
import type { Event } from "@shared/schema";
import { MONTH_NAMES, formatListDate, getCfg, getEffectiveStatus, parseLocalDate, type SelectEventFn } from "./calendar-shared";

export function ListView({ events, onSelectEvent, hasFilters }: { events: Event[]; onSelectEvent: SelectEventFn; hasFilters: boolean }) {
  const today = new Date();
  const currentMonthNum = today.getFullYear() * 12 + today.getMonth();
  const currentMonthKey = `${today.getFullYear()}-${today.getMonth()}`;

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; key: string; events: Event[] }>();
    for (const ev of events) {
      const d = parseLocalDate(ev.startDate);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!map.has(key)) {
        map.set(key, { label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`, key, events: [] });
      }
      map.get(key)!.events.push(ev);
    }
    const allGroups = Array.from(map.values()).map(g => ({
      ...g,
      events: [...g.events].sort(
        (a, b) => parseLocalDate(a.startDate).getTime() - parseLocalDate(b.startDate).getTime()
      ),
    }));

    const toMonthNum = (key: string) => {
      const [y, m] = key.split("-").map(Number);
      return y * 12 + m;
    };

    const current = allGroups.filter(g => toMonthNum(g.key) >= currentMonthNum)
      .sort((a, b) => toMonthNum(a.key) - toMonthNum(b.key));

    const past = allGroups.filter(g => toMonthNum(g.key) < currentMonthNum)
      .sort((a, b) => toMonthNum(b.key) - toMonthNum(a.key)); // mais recente primeiro

    return [...current, ...past];
  }, [events, currentMonthNum]);

  if (grouped.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
        <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center">
          <CalendarDays className="w-7 h-7 text-muted-foreground" aria-hidden="true" />
        </div>
        <p className="text-sm font-semibold text-slate-600">Nenhum evento encontrado</p>
        <p className="text-xs text-muted-foreground">
          {hasFilters
            ? "Tente remover ou alterar os filtros aplicados"
            : "Ainda não há eventos cadastrados"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-6">
      {grouped.map((group) => {
        const isCurrent = group.key === currentMonthKey;
        const [gy, gm] = group.key.split("-").map(Number);
        const isPast = gy * 12 + gm < currentMonthNum;

        return (
          <section key={group.key} style={isPast ? { opacity: 0.7 } : undefined}>
            {/* Month section header */}
            <div className="flex items-center gap-4 mb-4">
              <div className="flex items-center gap-2 shrink-0">
                <h3 className={`text-2xs font-black tracking-[0.2em] uppercase ${isCurrent ? "text-primary" : "text-muted-foreground"}`}>
                  {group.label}
                </h3>
                {isCurrent && (
                  <span className="text-2xs font-bold uppercase tracking-wider bg-brand-soft text-primary px-1.5 py-0.5 rounded-full">
                    Este mês
                  </span>
                )}
                <span className="text-2xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full font-semibold tabular-nums">
                  {group.events.length}
                </span>
              </div>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Event cards */}
            <div className="grid gap-3">
              {group.events.map(ev => {
                const cfg = getCfg(getEffectiveStatus(ev));

                return (
                  <button
                    key={ev.id}
                    onClick={(e) => onSelectEvent(ev, { x: e.clientX, y: e.clientY })}
                    className="w-full bg-card p-4 rounded-xl border border-border shadow-1 hover:shadow-2 transition-shadow flex items-center gap-4 group text-left"
                  >
                    {/* Status icon */}
                    <div className={`w-12 h-12 ${cfg.bg} ${cfg.iconText} rounded-xl flex items-center justify-center shrink-0 relative`}>
                      <cfg.icon className="h-6 w-6" aria-hidden="true" />
                      {cfg.pulse && (
                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
                          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${cfg.dot} opacity-75`} />
                          <span className={`relative inline-flex rounded-full h-3 w-3 ${cfg.dot}`} />
                        </span>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-sm group-hover:underline underline-offset-2 truncate text-primary">
                        {ev.name}
                      </h4>
                      <div className="flex items-center gap-4 mt-1 flex-wrap">
                        <div className="flex items-center gap-1 text-muted-foreground text-xs">
                          <MapPin className="h-4 w-4" aria-hidden="true" />
                          <span className="truncate max-w-[200px]">{ev.location}</span>
                        </div>
                        <div className="flex items-center gap-1 text-muted-foreground text-xs">
                          <Calendar className="h-4 w-4" aria-hidden="true" />
                          {formatListDate(ev.startDate, ev.endDate)}
                        </div>
                      </div>
                    </div>

                    {/* Status badge */}
                    <span className={`px-4 py-1.5 rounded-xl ${cfg.bg} ${cfg.text} text-2xs font-bold uppercase tracking-wide shrink-0 hidden sm:block`}>
                      {cfg.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
