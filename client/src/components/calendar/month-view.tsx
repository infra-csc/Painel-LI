/**
 * Visão Mês do Calendário (25/09 — extraída de pages/calendar.tsx): grade de
 * semanas, faixas de barras (LaneRow), linha "+ N eventos" (OverflowRow) e o
 * popover único dos escondidos.
 */
import { useMemo, useState } from "react";
import type { Event } from "@shared/schema";
import { computeWeekBars, type EventBar } from "./week-bars";
import { HiddenEventsPopover } from "./hidden-events-popover";
import {
  CalendarEmptyState, MONTH_NAMES_LOWER, WEEKDAY_LABELS, getCfg, getEffectiveStatus, isInRange, isSameDay, parseLocalDate, type SelectEventFn,
} from "./calendar-shared";

const MAX_VISIBLE_LANES = 2;

// Render a single lane row for the event grid
function LaneRow({ lane, bars, onSelectEvent }: { lane: number; bars: EventBar[]; onSelectEvent: SelectEventFn }) {
  const laneBars = bars.filter(b => b.lane === lane).sort((a, b) => a.startCol - b.startCol);
  const items: React.ReactNode[] = [];
  let col = 0;

  for (const bar of laneBars) {
    if (bar.startCol > col) {
      items.push(
        <div key={`sp-${col}`} style={{ gridColumn: `${col + 1} / ${bar.startCol + 1}` }} className="h-[22px]" />
      );
    }
    const cfg = getCfg(getEffectiveStatus(bar.event));
    // Always show name — either from start or repeating at the first visible column
    items.push(
      <button
        key={bar.event.id}
        onClick={(e) => onSelectEvent(bar.event, { x: e.clientX, y: e.clientY })}
        style={{ gridColumn: `${bar.startCol + 1} / ${bar.endCol + 2}` }}
        title={`${bar.event.name} · ${bar.event.location}`}
        className={[
          "h-[22px] text-xs font-semibold transition-opacity hover:opacity-80 flex items-center",
          cfg.bar, cfg.barText,
          bar.isStart ? "rounded-l-md ml-0.5 pl-2" : "rounded-l-none pl-1.5",
          bar.isEnd   ? "rounded-r-md mr-0.5 pr-2" : "rounded-r-none pr-0",
        ].join(" ")}
      >
        <span className="truncate overflow-hidden block w-full">{bar.event.name}</span>
      </button>
    );
    col = bar.endCol + 1;
  }

  if (col < 7) {
    items.push(<div key="sp-end" style={{ gridColumn: `${col + 1} / 8` }} className="h-[22px]" />);
  }

  return <div className="grid grid-cols-7">{items}</div>;
}

type OverflowPopoverState = { day: Date; dayEvents: Event[]; x: number; y: number };

function OverflowRow({ bars, week, allEvents, onOpenPopover }: {
  bars: EventBar[];
  week: Date[];
  allEvents: Event[];
  onOpenPopover: (state: OverflowPopoverState) => void;
}) {
  const hiddenByCol = useMemo(() => {
    const map: Record<number, number> = {};
    bars.filter(b => b.lane >= MAX_VISIBLE_LANES).forEach(b => {
      for (let c = b.startCol; c <= b.endCol; c++) {
        map[c] = (map[c] || 0) + 1;
      }
    });
    return map;
  }, [bars]);

  const hasAny = Object.keys(hiddenByCol).length > 0;
  if (!hasAny) return null;

  function getDayEvents(day: Date): Event[] {
    return allEvents.filter(ev => {
      const start = parseLocalDate(ev.startDate);
      const end = parseLocalDate(ev.endDate);
      return isInRange(day, start, end);
    });
  }

  return (
    <div className="grid grid-cols-7">
      {Array.from({ length: 7 }).map((_, col) => {
        const hiddenCount = hiddenByCol[col];
        if (!hiddenCount) {
          return <div key={col} className="h-[22px]" />;
        }
        return (
          <button
            key={col}
            onClick={(e) => {
              e.stopPropagation();
              const day = week[col];
              const dayEvents = getDayEvents(day);
              onOpenPopover({ day, dayEvents, x: e.clientX, y: e.clientY });
            }}
            className="h-[22px] mx-0.5 rounded-md px-2 text-2xs font-semibold text-slate-700 bg-muted hover:bg-border transition-colors text-left truncate"
          >
            + {hiddenCount} {hiddenCount === 1 ? "evento" : "eventos"}
          </button>
        );
      })}
    </div>
  );
}

/** Semanas do mês (com os dias de borda), cortando a última linha se for só do mês seguinte e sem eventos. */
function buildWeeks(year: number, month: number, events: Event[]): Date[][] {
  const firstDay = new Date(year, month, 1);
  const startPad = firstDay.getDay();
  const lastDayNum = new Date(year, month + 1, 0).getDate();

  const allDays: Date[] = [];
  for (let i = 0; i < startPad; i++) {
    allDays.push(new Date(year, month, 1 - startPad + i));
  }
  for (let d = 1; d <= lastDayNum; d++) {
    allDays.push(new Date(year, month, d));
  }
  while (allDays.length % 7 !== 0) {
    const prev = allDays[allDays.length - 1];
    allDays.push(new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1));
  }

  // Trim last row if all are next-month days with no events
  const lastRow = allDays.slice(-7);
  const lastRowAllOtherMonth = lastRow.every(d => d.getMonth() !== month);
  const lastRowHasEvents = lastRow.some(day =>
    events.some(ev => isInRange(day, parseLocalDate(ev.startDate), parseLocalDate(ev.endDate)))
  );
  const trimmedDays = (lastRowAllOtherMonth && !lastRowHasEvents)
    ? allDays.slice(0, -7)
    : allDays;

  const out: Date[][] = [];
  for (let i = 0; i < trimmedDays.length; i += 7) {
    out.push(trimmedDays.slice(i, i + 7));
  }
  return out;
}

export function MonthView({ year, month, events, onSelectEvent }: {
  year: number; month: number; events: Event[];
  onSelectEvent: SelectEventFn;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Single overflow popover state — only one can be open at a time
  const [overflowPopover, setOverflowPopover] = useState<OverflowPopoverState | null>(null);

  // Wrap onSelectEvent to close any open overflow popover first
  function handleSelectEvent(ev: Event, pos: { x: number; y: number }) {
    setOverflowPopover(null);
    onSelectEvent(ev, pos);
  }

  function getPopoverTitle(day: Date, count: number) {
    return `${day.getDate()} de ${MONTH_NAMES_LOWER[day.getMonth()]} · ${count} ${count === 1 ? "evento" : "eventos"}`;
  }

  // Grade + barras são caras (ordenação e parse de datas por semana). Sem memo elas
  // eram recalculadas a cada render — inclusive ao abrir/fechar o popover de overflow.
  const weeks = useMemo(() => buildWeeks(year, month, events), [year, month, events]);
  const weekBars = useMemo(() => weeks.map(week => computeWeekBars(week, events)), [weeks, events]);
  const monthHasEvents = weekBars.some(bars => bars.length > 0);

  return (
    <>
      <div className="flex flex-col h-full bg-card rounded-xl border border-border overflow-hidden shadow-3">
        {/* Weekday header */}
        <div className="grid grid-cols-7 border-b border-border bg-surface-muted/50 shrink-0">
          {WEEKDAY_LABELS.map((d, i) => (
            <div key={d} className={`py-4 text-center text-2xs font-black uppercase tracking-[0.2em] ${i === 0 || i === 6 ? "text-muted-foreground" : "text-muted-foreground"}`}>
              <span className="hidden sm:inline">{d}</span>
              <span className="sm:hidden">{d.slice(0, 3)}</span>
            </div>
          ))}
        </div>

        {!monthHasEvents && (
          <div className="shrink-0 border-b border-border">
            <CalendarEmptyState label="neste mês" />
          </div>
        )}

        {/* Week rows — minmax ensures minimum height so last row never gets clipped */}
        <div
          className="flex-1 min-h-0 overflow-y-auto grid"
          style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(112px, 1fr))` }}
        >
          {weeks.map((week, wi) => {
            const bars = weekBars[wi];
            const maxLane = bars.length > 0 ? Math.max(...bars.map(b => b.lane)) : -1;
            const visibleLanes = Math.min(maxLane + 1, MAX_VISIBLE_LANES);
            const hasOverflow = bars.some(b => b.lane >= MAX_VISIBLE_LANES);

            return (
              <div key={wi} className={`flex flex-col ${wi > 0 ? "border-t border-border" : ""}`}>
                {/* ── DAY-NUMBER ZONE: exactly 28px, z-[40], never receives bars ── */}
                <div className="relative z-[40] shrink-0 h-7 grid grid-cols-7 divide-x divide-border">
                  {week.map((day, di) => {
                    const isCurrentMonth = day.getMonth() === month;
                    const isToday = isSameDay(day, today);
                    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                    return (
                      <div
                        key={di}
                        className={`h-full px-2 flex items-center transition-colors ${
                          !isCurrentMonth ? "bg-surface-muted/30" :
                          isWeekend ? "bg-surface-muted/40" : "bg-card"
                        } ${isCurrentMonth ? "hover:bg-brand-soft/20" : ""}`}
                      >
                        <div className={`text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full shrink-0 transition-colors ${
                          isToday
                            ? "bg-primary text-primary-foreground shadow-2 z-[50]"
                            : isCurrentMonth
                              ? "text-foreground"
                              : "text-muted-foreground"
                        }`}>
                          {day.getDate()}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ── EVENT ZONE: z-[20], starts strictly below 28px header ── */}
                <div className="relative z-[20] flex-1 min-h-0 pt-0.5 pb-1 space-y-0.5">
                  {Array.from({ length: visibleLanes }).map((_, lane) => (
                    <LaneRow key={lane} lane={lane} bars={bars} onSelectEvent={handleSelectEvent} />
                  ))}
                  {hasOverflow && (
                    <OverflowRow
                      bars={bars}
                      week={week}
                      allEvents={events}
                      // Replace any existing popover — only one at a time
                      onOpenPopover={setOverflowPopover}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Single overflow popover rendered outside the grid — always on top */}
      {overflowPopover && (
        <HiddenEventsPopover
          dayEvents={overflowPopover.dayEvents}
          title={getPopoverTitle(overflowPopover.day, overflowPopover.dayEvents.length)}
          x={overflowPopover.x}
          y={overflowPopover.y}
          onSelectEvent={(ev, pos) => { handleSelectEvent(ev, pos); setOverflowPopover(null); }}
          onClose={() => setOverflowPopover(null)}
        />
      )}
    </>
  );
}
