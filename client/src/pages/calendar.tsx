import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CalendarDays, ChevronLeft, ChevronRight, X, MapPin, Clock,
  CheckCircle, Play, Ban, List, LayoutGrid, ExternalLink, ChevronDown
} from "lucide-react";
import type { Event } from "@shared/schema";
import { Link } from "wouter";

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, {
  label: string; bg: string; text: string; border: string;
  bar: string; barText: string;
  panelBg: string; panelBorder: string; icon: any; strikethrough?: boolean;
  dot: string;
}> = {
  concluido: {
    label: "Concluído",
    bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-200",
    bar: "bg-emerald-500", barText: "text-white",
    panelBg: "bg-emerald-50", panelBorder: "border-emerald-200",
    icon: CheckCircle, dot: "bg-emerald-500",
  },
  em_andamento: {
    label: "Em andamento",
    bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-200",
    bar: "bg-amber-400", barText: "text-white",
    panelBg: "bg-amber-50", panelBorder: "border-amber-200",
    icon: Play, dot: "bg-amber-400",
  },
  planejado: {
    label: "Planejado",
    bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-200",
    bar: "bg-blue-500", barText: "text-white",
    panelBg: "bg-blue-50", panelBorder: "border-blue-200",
    icon: Clock, dot: "bg-blue-500",
  },
  cancelado: {
    label: "Cancelado",
    bg: "bg-slate-100", text: "text-slate-500", border: "border-slate-200",
    bar: "bg-slate-300", barText: "text-slate-600",
    panelBg: "bg-slate-50", panelBorder: "border-slate-200",
    icon: Ban, strikethrough: true, dot: "bg-slate-400",
  },
};

function getCfg(status: string) {
  return STATUS_CFG[status] || STATUS_CFG["planejado"];
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function parseLocalDate(str: string): Date {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function isInRange(day: Date, start: Date, end: Date) {
  const d = day.getTime();
  return d >= start.getTime() && d <= end.getTime();
}

function formatDateRange(startStr: string, endStr: string) {
  const s = parseLocalDate(startStr);
  const e = parseLocalDate(endStr);
  const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  return isSameDay(s, e) ? fmt(s) : `${fmt(s)} → ${fmt(e)}`;
}

function dayCount(startStr: string, endStr: string) {
  const s = parseLocalDate(startStr);
  const e = parseLocalDate(endStr);
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
}

function getEffectiveStatus(event: Event): string {
  if (event.status === "cancelado") return "cancelado";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = parseLocalDate(event.startDate);
  const end = parseLocalDate(event.endDate);
  if (today > end) return "concluido";
  if (today >= start && today <= end) return "em_andamento";
  return "planejado";
}

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

// ─── Multi-day bar layout ─────────────────────────────────────────────────────

type EventBar = {
  event: Event;
  startCol: number;
  endCol: number;
  lane: number;
  isStart: boolean;
  isEnd: boolean;
};

function computeWeekBars(week: Date[], events: Event[]): EventBar[] {
  const weekStart = new Date(week[0]); weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(week[6]); weekEnd.setHours(23, 59, 59, 999);

  const overlapping = events.filter(ev => {
    const s = parseLocalDate(ev.startDate);
    const e = parseLocalDate(ev.endDate);
    return s <= weekEnd && e >= weekStart;
  });

  overlapping.sort((a, b) => {
    const as = parseLocalDate(a.startDate).getTime();
    const bs = parseLocalDate(b.startDate).getTime();
    if (as !== bs) return as - bs;
    const al = dayCount(a.startDate, a.endDate);
    const bl = dayCount(b.startDate, b.endDate);
    return bl - al;
  });

  const bars: EventBar[] = [];
  // lanes[lane] = the Date after which this lane is free
  const lanesFreeAfter: Date[] = [];

  for (const ev of overlapping) {
    const s = parseLocalDate(ev.startDate);
    const e = parseLocalDate(ev.endDate);

    const startCol = s < weekStart ? 0 : s.getDay();
    const endCol = e > weekEnd ? 6 : e.getDay();
    const isStart = s >= weekStart;
    const isEnd = e <= weekEnd;

    // Find first free lane for this event's column range
    let lane = -1;
    for (let l = 0; l < lanesFreeAfter.length; l++) {
      if (lanesFreeAfter[l] < s || (s <= weekStart && lanesFreeAfter[l] < weekStart)) {
        lane = l;
        break;
      }
    }
    if (lane === -1) lane = lanesFreeAfter.length;
    lanesFreeAfter[lane] = e > weekEnd ? weekEnd : new Date(e.getTime() + 1);

    bars.push({ event: ev, startCol, endCol, lane, isStart, isEnd });
  }

  return bars;
}

// Render a single lane row for the event grid
function LaneRow({
  lane, bars, onSelectEvent,
}: {
  lane: number;
  bars: EventBar[];
  onSelectEvent: (e: Event) => void;
}) {
  const laneBars = bars.filter(b => b.lane === lane).sort((a, b) => a.startCol - b.startCol);
  const items: React.ReactNode[] = [];
  let col = 0;

  for (const bar of laneBars) {
    if (bar.startCol > col) {
      items.push(
        <div key={`sp-${col}`} style={{ gridColumn: `${col + 1} / ${bar.startCol + 1}` }} className="h-5" />
      );
    }
    const cfg = getCfg(getEffectiveStatus(bar.event));
    const span = bar.endCol - bar.startCol + 1;
    items.push(
      <button
        key={bar.event.id}
        onClick={() => onSelectEvent(bar.event)}
        style={{ gridColumn: `${bar.startCol + 1} / ${bar.endCol + 2}` }}
        title={`${bar.event.name} · ${bar.event.location}`}
        className={`h-5 text-[10px] font-semibold truncate transition-opacity hover:opacity-80 ${cfg.bar} ${cfg.barText} ${cfg.strikethrough ? "opacity-50 line-through" : ""} ${bar.isStart ? "rounded-l ml-0.5 pl-1.5" : "pl-0.5"} ${bar.isEnd ? "rounded-r mr-0.5 pr-1" : "pr-0"}`}
      >
        {(bar.isStart || span > 1) ? bar.event.name : ""}
      </button>
    );
    col = bar.endCol + 1;
  }

  if (col < 7) {
    items.push(<div key="sp-end" style={{ gridColumn: `${col + 1} / 8` }} className="h-5" />);
  }

  return <div className="grid grid-cols-7">{items}</div>;
}

// ─── Event detail panel ───────────────────────────────────────────────────────

function EventPanel({ event, onClose }: { event: Event; onClose: () => void }) {
  const cfg = getCfg(getEffectiveStatus(event));
  const StatusIcon = cfg.icon;
  const days = dayCount(event.startDate, event.endDate);

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex">
      <div className="fixed inset-0 bg-black/20 backdrop-blur-[1px]" onClick={onClose} />
      <div className="relative ml-auto w-[320px] h-full bg-white dark:bg-gray-900 shadow-2xl border-l border-gray-200 dark:border-gray-700 flex flex-col animate-in slide-in-from-right duration-200">
        <div className={`${cfg.panelBg} dark:bg-gray-800 border-b ${cfg.panelBorder} px-5 py-4`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <Badge className={`text-[10px] mb-2 ${cfg.bg} ${cfg.text} border ${cfg.border} hover:${cfg.bg}`}>
                <StatusIcon className="w-2.5 h-2.5 mr-1" />
                {cfg.label}
              </Badge>
              <h2 className={`text-base font-bold text-gray-900 dark:text-gray-100 leading-tight ${cfg.strikethrough ? "line-through text-gray-400" : ""}`}>
                {event.name}
              </h2>
            </div>
            <button onClick={onClose} className="shrink-0 w-7 h-7 rounded-full bg-white/80 hover:bg-white flex items-center justify-center shadow-sm border border-gray-200 transition-colors mt-0.5">
              <X className="w-3.5 h-3.5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5 text-sm">
              <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="text-gray-700 dark:text-gray-300">{event.location}</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <CalendarDays className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="text-gray-700 dark:text-gray-300">{formatDateRange(event.startDate, event.endDate)}</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <Clock className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="text-gray-700 dark:text-gray-300">{days} {days === 1 ? "dia" : "dias"}</span>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 dark:border-gray-700 px-5 py-4 space-y-2">
          <Link href="/events">
            <Button className="w-full h-9 text-sm bg-blue-600 hover:bg-blue-700 text-white gap-2">
              <ExternalLink className="w-3.5 h-3.5" /> Ver detalhes
            </Button>
          </Link>
          <Link href="/budget-planned">
            <Button variant="outline" className="w-full h-9 text-sm gap-2">
              <CalendarDays className="w-3.5 h-3.5" /> Ir para Orçamento
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Month view ───────────────────────────────────────────────────────────────

const MAX_VISIBLE_LANES = 3;

function MonthView({
  year, month, events, onSelectEvent,
}: {
  year: number; month: number; events: Event[];
  onSelectEvent: (e: Event | null) => void;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build all day cells
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

  // Split into weeks
  const weeks: Date[][] = [];
  for (let i = 0; i < trimmedDays.length; i += 7) {
    weeks.push(trimmedDays.slice(i, i + 7));
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700 bg-gray-50/70">
        {WEEKDAY_LABELS.map(d => (
          <div key={d} className={`py-2.5 text-center text-[10px] font-bold uppercase tracking-widest ${d === "Dom" || d === "Sáb" ? "text-slate-400" : "text-slate-500"}`}>
            {d}
          </div>
        ))}
      </div>

      {/* Week rows */}
      {weeks.map((week, wi) => {
        const bars = computeWeekBars(week, events);
        const maxLane = bars.length > 0 ? Math.max(...bars.map(b => b.lane)) : -1;
        const visibleLanes = Math.min(maxLane + 1, MAX_VISIBLE_LANES);

        // Count hidden events per day column
        const hiddenByCol: Record<number, number> = {};
        bars.filter(b => b.lane >= MAX_VISIBLE_LANES).forEach(b => {
          for (let c = b.startCol; c <= b.endCol; c++) {
            hiddenByCol[c] = (hiddenByCol[c] || 0) + 1;
          }
        });

        return (
          <div key={wi} className={wi > 0 ? "border-t border-gray-100 dark:border-gray-700" : ""}>
            {/* Day number row */}
            <div className="grid grid-cols-7 divide-x divide-gray-100 dark:divide-gray-700">
              {week.map((day, di) => {
                const isCurrentMonth = day.getMonth() === month;
                const isToday = isSameDay(day, today);
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                return (
                  <div
                    key={di}
                    className={`h-8 px-1.5 flex items-center ${
                      !isCurrentMonth ? "bg-gray-50/70 dark:bg-gray-900/30" :
                      isWeekend ? "bg-slate-50/60 dark:bg-gray-850" : ""
                    }`}
                  >
                    <div className={`text-[11px] font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                      isToday
                        ? "bg-blue-600 text-white shadow-sm"
                        : isCurrentMonth
                          ? "text-gray-700 dark:text-gray-300"
                          : "text-gray-300 dark:text-gray-600"
                    }`}>
                      {day.getDate()}
                    </div>
                    {hiddenByCol[di] > 0 && (
                      <span className="ml-auto text-[9px] text-gray-400 hover:text-blue-600 cursor-pointer font-medium">
                        +{hiddenByCol[di]}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Event bar rows */}
            {visibleLanes > 0 && (
              <div className={`pb-1.5 ${visibleLanes > 0 ? "pt-0.5" : ""}`}>
                {Array.from({ length: visibleLanes }).map((_, lane) => (
                  <div key={lane} className="mt-0.5">
                    <LaneRow lane={lane} bars={bars} onSelectEvent={onSelectEvent} />
                  </div>
                ))}
              </div>
            )}

            {/* Spacer for empty weeks */}
            {visibleLanes === 0 && <div className="h-3" />}
          </div>
        );
      })}
    </div>
  );
}

// ─── List view ────────────────────────────────────────────────────────────────

function ListView({ events, onSelectEvent }: { events: Event[]; onSelectEvent: (e: Event) => void }) {
  const today = new Date();
  const currentMonthKey = `${today.getFullYear()}-${today.getMonth()}`;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [events]);

  const toggleGroup = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {grouped.map(group => {
        const isOpen = !collapsed.has(group.key);
        const isCurrent = group.key === currentMonthKey;
        return (
          <div key={group.key} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
            <button
              className={`w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-gray-750 transition-colors ${isCurrent ? "border-b-2 border-blue-500" : ""}`}
              onClick={() => toggleGroup(group.key)}
            >
              <div className="flex items-center gap-2.5">
                <span className={`text-sm font-bold ${isCurrent ? "text-blue-700 dark:text-blue-300" : "text-gray-700 dark:text-gray-300"}`}>
                  {group.label}
                </span>
                <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full font-medium">
                  {group.events.length}
                </span>
              </div>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && (
              <div className="divide-y divide-gray-50 dark:divide-gray-700">
                {group.events.map(ev => {
                  const cfg = getCfg(getEffectiveStatus(ev));
                  const StatusIcon = cfg.icon;
                  return (
                    <div key={ev.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/70 dark:hover:bg-gray-750 transition-colors">
                      <div className={`w-8 h-8 rounded-xl ${cfg.bg} border ${cfg.border} flex items-center justify-center shrink-0`}>
                        <StatusIcon className={`w-3.5 h-3.5 ${cfg.text}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold text-gray-900 dark:text-gray-100 truncate ${cfg.strikethrough ? "line-through text-gray-400" : ""}`}>
                          {ev.name}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[10px] text-gray-400 flex items-center gap-1">
                            <MapPin className="w-2.5 h-2.5" /> {ev.location}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {parseLocalDate(ev.startDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                            {!isSameDay(parseLocalDate(ev.startDate), parseLocalDate(ev.endDate)) && (
                              <> → {parseLocalDate(ev.endDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</>
                            )}
                          </span>
                        </div>
                      </div>
                      <Badge className={`text-[9px] h-[18px] px-1.5 shrink-0 ${cfg.bg} ${cfg.text} border ${cfg.border} hover:${cfg.bg}`}>
                        {cfg.label}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 rounded-lg hover:bg-blue-50 hover:text-blue-600 shrink-0"
                        onClick={() => onSelectEvent(ev)}
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [view, setView] = useState<"month" | "list">("month");
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: events = [], isLoading } = useQuery<Event[]>({ queryKey: ["/api/events"] });

  const filteredEvents = useMemo(() => {
    if (statusFilter === "all") return events;
    return events.filter(ev => getEffectiveStatus(ev) === statusFilter);
  }, [events, statusFilter]);

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }
  function goToday() {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  }
  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();

  const statusCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const ev of events) { const s = getEffectiveStatus(ev); map[s] = (map[s] || 0) + 1; }
    return map;
  }, [events]);

  const legendItems = [
    { key: "concluido", ...STATUS_CFG.concluido },
    { key: "em_andamento", ...STATUS_CFG.em_andamento },
    { key: "planejado", ...STATUS_CFG.planejado },
    { key: "cancelado", ...STATUS_CFG.cancelado },
  ];

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-4 justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Calendário de Eventos</h1>
            <p className="text-xs text-gray-400 mt-0.5">Visualize todos os eventos por período</p>
          </div>
        </div>

        {/* Month navigation + view toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          {view === "month" && (
            <>
              <button
                onClick={goToday}
                className={`h-8 text-xs px-3 rounded-lg font-semibold border transition-all ${
                  isCurrentMonth
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "bg-white text-gray-500 border-gray-200 hover:border-blue-200 hover:text-blue-600 hover:bg-blue-50"
                }`}
              >
                Hoje
              </button>
              <Button variant="outline" size="sm" onClick={prevMonth} className="h-8 w-8 p-0 rounded-lg">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="min-w-[148px] text-center">
                <span className="text-sm font-bold text-gray-800 dark:text-gray-200">
                  {MONTH_NAMES[viewMonth]} {viewYear}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={nextMonth} className="h-8 w-8 p-0 rounded-lg">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </>
          )}

          {/* View toggle pills */}
          <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setView("month")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-all ${
                view === "month"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-500 hover:bg-gray-50"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Mês
            </button>
            <div className="w-px h-5 bg-gray-200" />
            <button
              onClick={() => setView("list")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-all ${
                view === "list"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-500 hover:bg-gray-50"
              }`}
            >
              <List className="w-3.5 h-3.5" /> Lista
            </button>
          </div>
        </div>
      </div>

      {/* ── Status filter pills ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setStatusFilter("all")}
          className={`flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1 rounded-full border transition-all ${
            statusFilter === "all"
              ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
              : "border-gray-200 text-gray-500 hover:border-indigo-200 hover:text-indigo-700 hover:bg-indigo-50 bg-white"
          }`}
        >
          Todos <span className={statusFilter === "all" ? "text-indigo-200" : "text-gray-400"}>{events.length}</span>
        </button>
        {legendItems.map(item => {
          const count = statusCounts[item.key] || 0;
          const isActive = statusFilter === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setStatusFilter(isActive ? "all" : item.key)}
              className={`flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1 rounded-full border transition-all ${
                isActive
                  ? `${item.bg} ${item.text} ${item.border} shadow-sm`
                  : "border-gray-200 text-gray-500 hover:border-gray-300 bg-white"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${item.dot}`} />
              {item.label}
              <span className={count === 0 ? "text-gray-300" : (isActive ? "opacity-70" : "text-gray-400")}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Calendar / List ── */}
      {isLoading ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-16 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : view === "month" ? (
        <MonthView
          year={viewYear}
          month={viewMonth}
          events={filteredEvents}
          onSelectEvent={setSelectedEvent}
        />
      ) : (
        <ListView events={filteredEvents} onSelectEvent={setSelectedEvent} />
      )}

      {/* ── Event detail panel ── */}
      {selectedEvent && (
        <EventPanel event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </div>
  );
}
