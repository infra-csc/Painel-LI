import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import {
  CalendarDays, ChevronLeft, ChevronRight, X, MapPin, Clock,
  CheckCircle, Play, List, LayoutGrid, ChevronDown,
  Users, Tag, Search,
} from "lucide-react";
import type { Event, TeamInclusion } from "@shared/schema";

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, {
  label: string; bg: string; text: string; border: string;
  bar: string; barText: string; iconText: string;
  panelBg: string; panelBorder: string; topBar: string; icon: any; strikethrough?: boolean;
  dot: string;
}> = {
  concluido: {
    label: "Concluído",
    bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-200",
    bar: "bg-emerald-500", barText: "text-white", iconText: "text-emerald-600",
    panelBg: "bg-emerald-50", panelBorder: "border-emerald-200", topBar: "bg-emerald-500",
    icon: CheckCircle, dot: "bg-emerald-500",
  },
  em_andamento: {
    label: "Em andamento",
    bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-200",
    bar: "bg-amber-400", barText: "text-[#1e293b]", iconText: "text-amber-500",
    panelBg: "bg-amber-50", panelBorder: "border-amber-200", topBar: "bg-amber-400",
    icon: Play, dot: "bg-amber-400",
  },
  planejado: {
    label: "Planejado",
    bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-200",
    bar: "bg-blue-500", barText: "text-white", iconText: "text-blue-500",
    panelBg: "bg-blue-50", panelBorder: "border-blue-200", topBar: "bg-blue-500",
    icon: Clock, dot: "bg-blue-500",
  },
};

// Only these statuses are shown in the calendar
const VISIBLE_STATUSES = new Set(["concluido", "em_andamento", "planejado"]);

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
  const monthName = (d: Date) => d.toLocaleDateString("pt-BR", { month: "long" });
  const year = (d: Date) => d.getFullYear();
  if (isSameDay(s, e)) {
    return `${s.getDate()} de ${monthName(s)} de ${year(s)}`;
  }
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()} a ${e.getDate()} de ${monthName(s)} de ${year(s)}`;
  }
  if (s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()} de ${monthName(s)} a ${e.getDate()} de ${monthName(e)} de ${year(s)}`;
  }
  return `${s.getDate()} de ${monthName(s)} de ${year(s)} a ${e.getDate()} de ${monthName(e)} de ${year(e)}`;
}

function dayCount(startStr: string, endStr: string) {
  const s = parseLocalDate(startStr);
  const e = parseLocalDate(endStr);
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
}

function getEffectiveStatus(event: Event): string {
  const raw = (event.status || "").toLowerCase();
  // Normalize: catch "excluído", "excluido", "excluíd", etc.
  if (raw.startsWith("exclu") || raw === "cancelado" || raw === "inativo") return "excluido";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = parseLocalDate(event.startDate);
  const end = parseLocalDate(event.endDate);
  if (today > end) return "concluido";
  if (today >= start && today <= end) return "em_andamento";
  return "planejado";
}

const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
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

  // Deduplicate by ID before processing
  const seenIds = new Set<string>();
  const overlapping = events.filter(ev => {
    if (seenIds.has(ev.id)) return false;
    seenIds.add(ev.id);
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
  const lanesFreeAfter: Date[] = [];

  for (const ev of overlapping) {
    const s = parseLocalDate(ev.startDate);
    const e = parseLocalDate(ev.endDate);

    const startCol = s < weekStart ? 0 : s.getDay();
    const endCol = e > weekEnd ? 6 : e.getDay();
    const isStart = s >= weekStart;
    const isEnd = e <= weekEnd;

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

type SelectEventFn = (e: Event, pos: { x: number; y: number }) => void;

// Render a single lane row for the event grid
function LaneRow({
  lane, bars, onSelectEvent,
}: {
  lane: number;
  bars: EventBar[];
  onSelectEvent: SelectEventFn;
}) {
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
          "h-[22px] text-[12px] font-semibold transition-opacity hover:opacity-80 flex items-center",
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

// ─── Event detail panel ───────────────────────────────────────────────────────

const PANEL_W = 296;
const PANEL_MARGIN = 14;

function EventPanel({
  event, onClose, clickPos,
}: {
  event: Event;
  onClose: () => void;
  clickPos: { x: number; y: number };
}) {
  const cfg = getCfg(getEffectiveStatus(event));
  const StatusIcon = cfg.icon;
  const days = dayCount(event.startDate, event.endDate);

  const { data: teamInclusions = [] } = useQuery<TeamInclusion[]>({
    queryKey: ["/api/team-inclusions"],
  });

  const eventInclusions = useMemo(() =>
    teamInclusions.filter(ti => ti.eventId === event.id && !ti.deletedAt),
    [teamInclusions, event.id]
  );
  const collaboratorCount = useMemo(() =>
    new Set(eventInclusions.map(ti => ti.collaboratorId).filter(Boolean)).size,
    [eventInclusions]
  );
  const functionCount = useMemo(() =>
    new Set(eventInclusions.map(ti => ti.functionId)).size,
    [eventInclusions]
  );

  const openLeft = clickPos.x > window.innerWidth / 2;
  const rawLeft = openLeft
    ? clickPos.x - PANEL_W - PANEL_MARGIN
    : clickPos.x + PANEL_MARGIN;
  const left = Math.max(PANEL_MARGIN, Math.min(window.innerWidth - PANEL_W - PANEL_MARGIN, rawLeft));

  const PANEL_H_EST = 260;
  const top = Math.max(PANEL_MARGIN, Math.min(window.innerHeight - PANEL_H_EST - PANEL_MARGIN, clickPos.y - PANEL_H_EST / 2));

  return (
    <div className="fixed inset-0 z-[1000]">
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className="absolute bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        style={{
          width: PANEL_W,
          left,
          top,
          boxShadow: "0 12px 48px -4px rgba(0,0,0,0.22), 0 4px 16px -2px rgba(0,0,0,0.12)",
        }}
      >
        <div className={`h-[3px] w-full ${cfg.topBar}`} />
        <div className="px-4 pt-3.5 pb-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <Badge className={`text-[10px] ${cfg.bg} ${cfg.text} border ${cfg.border} hover:${cfg.bg}`}>
              <StatusIcon className="w-2.5 h-2.5 mr-1" />
              {cfg.label}
            </Badge>
            <button
              onClick={onClose}
              className="w-5 h-5 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors shrink-0"
            >
              <X className="w-3 h-3 text-gray-500" />
            </button>
          </div>
          <h2 className={`text-[14px] font-bold text-gray-900 dark:text-gray-100 leading-snug ${cfg.strikethrough ? "line-through text-gray-400" : ""}`}>
            {event.name}
          </h2>
        </div>

        <div className="border-t border-gray-100 dark:border-gray-700 mx-4" />

        <div className="px-4 pt-3.5 pb-4 space-y-3.5">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5">
              <MapPin className={`w-3.5 h-3.5 shrink-0 ${cfg.iconText}`} />
              <span className="text-[12.5px] text-gray-700 dark:text-gray-300">{event.location}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <CalendarDays className={`w-3.5 h-3.5 shrink-0 ${cfg.iconText}`} />
              <span className="text-[12.5px] text-gray-700 dark:text-gray-300">{formatDateRange(event.startDate, event.endDate)}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Clock className={`w-3.5 h-3.5 shrink-0 ${cfg.iconText}`} />
              <span className="text-[12.5px] text-gray-700 dark:text-gray-300">{days} {days === 1 ? "dia" : "dias"}</span>
            </div>
          </div>

          <div className="border-t border-dashed border-gray-200 dark:border-gray-700" />

          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5">
              <Users className={`w-3.5 h-3.5 shrink-0 ${cfg.iconText}`} />
              <span className="text-[12.5px] text-gray-700 dark:text-gray-300">
                <span className="font-semibold text-gray-900 dark:text-gray-100">{collaboratorCount}</span>
                {" "}{collaboratorCount === 1 ? "colaborador escalado" : "colaboradores escalados"}
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <Tag className={`w-3.5 h-3.5 shrink-0 ${cfg.iconText}`} />
              <span className="text-[12.5px] text-gray-700 dark:text-gray-300">
                <span className="font-semibold text-gray-900 dark:text-gray-100">{functionCount}</span>
                {" "}{functionCount === 1 ? "função envolvida" : "funções envolvidas"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Hidden events popover ────────────────────────────────────────────────────

const POPOVER_W = 320;

function HiddenEventsPopover({ dayEvents, title, x, y, onSelectEvent, onClose }: {
  dayEvents: Event[];
  title: string;
  x: number; y: number;
  onSelectEvent: SelectEventFn;
  onClose: () => void;
}) {
  const GAP = 6;
  const EDGE = 8;
  // Hard cap — content scrolls inside
  const MAX_H = 280;
  const HEADER_H = 38;

  // ── Horizontal: prefer right, flip left, clamp ───────────────────────────
  const spaceRight = window.innerWidth - x - GAP;
  const spaceLeft  = x - GAP;
  let left: number;
  if (spaceRight >= POPOVER_W) {
    left = x + GAP;
  } else if (spaceLeft >= POPOVER_W) {
    left = x - POPOVER_W - GAP;
  } else {
    left = spaceRight >= spaceLeft
      ? Math.max(EDGE, window.innerWidth - POPOVER_W - EDGE)
      : EDGE;
  }
  left = Math.max(EDGE, Math.min(window.innerWidth - POPOVER_W - EDGE, left));

  // ── Vertical: prefer below click, flip above if too close to bottom ──────
  const spaceBelow = window.innerHeight - y - GAP;
  const spaceAbove = y - GAP;
  // Estimate actual rendered height (generous: 68px/item for 2-line names)
  const estimatedH = Math.min(dayEvents.length * 68 + HEADER_H, MAX_H);

  let top: number;
  if (spaceBelow >= estimatedH) {
    // Enough room below — open just under click point
    top = y + GAP;
  } else if (spaceAbove >= estimatedH) {
    // Not enough below but enough above — open above click point
    top = y - estimatedH - GAP;
  } else {
    // Tight on both sides — center in viewport
    top = Math.max(EDGE, Math.min(window.innerHeight - estimatedH - EDGE, (window.innerHeight - estimatedH) / 2));
  }
  top = Math.max(EDGE, Math.min(window.innerHeight - EDGE - estimatedH, top));

  // Available height for the scroll container: viewport minus header minus edges
  const maxListH = Math.min(MAX_H - HEADER_H, window.innerHeight - top - HEADER_H - EDGE);

  // Close on ESC key
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[1000]">
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className="absolute bg-white animate-in fade-in zoom-in-95 duration-150 flex flex-col"
        style={{
          width: POPOVER_W,
          left,
          top,
          maxHeight: MAX_H,
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          boxShadow: "0 8px 32px -4px rgba(0,0,0,0.16), 0 2px 8px -1px rgba(0,0,0,0.08)",
          overflow: "hidden",
        }}
      >
        {/* Header — always visible */}
        <div className="px-3 py-2.5 border-b border-gray-100 shrink-0">
          <span className="text-[11px] font-semibold text-gray-400 capitalize">{title}</span>
        </div>

        {/* Scrollable list */}
        <div
          className="overflow-y-auto divide-y divide-gray-50"
          style={{
            maxHeight: maxListH,
            scrollbarWidth: "thin",
            scrollbarColor: "#cbd5e1 transparent",
          }}
        >
          {dayEvents.map(ev => {
            const cfg = getCfg(getEffectiveStatus(ev));
            const StatusIcon = cfg.icon;
            return (
              <button
                key={ev.id}
                onClick={(e) => { e.stopPropagation(); onSelectEvent(ev, { x: e.clientX, y: e.clientY }); onClose(); }}
                className="w-full flex items-start gap-2.5 px-3 py-2.5 hover:bg-[#f8fafc] text-left transition-colors"
              >
                <div className={`w-6 h-6 rounded-lg ${cfg.bg} border ${cfg.border} flex items-center justify-center shrink-0 mt-0.5`}>
                  <StatusIcon className={`w-3 h-3 ${cfg.text}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-[12.5px] font-semibold text-gray-800 leading-snug ${cfg.strikethrough ? "line-through text-gray-400" : ""}`}
                    style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                  >
                    {ev.name}
                  </p>
                  <p className="text-[11px] text-gray-400 truncate leading-tight mt-0.5">{ev.location}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Overflow lane row ────────────────────────────────────────────────────────

const MONTH_NAMES_LOWER = [
  "janeiro","fevereiro","março","abril","maio","junho",
  "julho","agosto","setembro","outubro","novembro","dezembro",
];

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
            className="h-[22px] mx-0.5 rounded-md px-2 text-[11px] font-semibold text-[#374151] bg-[#f1f5f9] hover:bg-[#e2e8f0] transition-colors text-left truncate"
          >
            + {hiddenCount} {hiddenCount === 1 ? "evento" : "eventos"}
          </button>
        );
      })}
    </div>
  );
}

// ─── Month view ───────────────────────────────────────────────────────────────

const MAX_VISIBLE_LANES = 2;

function MonthView({
  year, month, events, onSelectEvent,
}: {
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

  const weeks: Date[][] = [];
  for (let i = 0; i < trimmedDays.length; i += 7) {
    weeks.push(trimmedDays.slice(i, i + 7));
  }

  return (
    <>
      <div className="flex flex-col h-full bg-white dark:bg-gray-800 rounded-[32px] border border-slate-200 dark:border-gray-700 overflow-hidden" style={{ boxShadow: "0 20px 60px -10px rgba(148,163,184,0.3), 0 4px 16px -4px rgba(148,163,184,0.2)" }}>
        {/* Weekday header */}
        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/50 shrink-0">
          {WEEKDAY_LABELS.map((d, i) => (
            <div key={d} className={`py-4 text-center text-[10px] font-black uppercase tracking-[0.2em] ${i === 0 || i === 6 ? "text-slate-400" : "text-slate-400"}`}>
              {d}
            </div>
          ))}
        </div>

        {/* Week rows — minmax ensures minimum height so last row never gets clipped */}
        <div
          className="flex-1 min-h-0"
          style={{ display: "grid", gridTemplateRows: `repeat(${weeks.length}, minmax(90px, 1fr))` }}
        >
          {weeks.map((week, wi) => {
            const bars = computeWeekBars(week, events);
            const maxLane = bars.length > 0 ? Math.max(...bars.map(b => b.lane)) : -1;
            const visibleLanes = Math.min(maxLane + 1, MAX_VISIBLE_LANES);
            const hasOverflow = bars.some(b => b.lane >= MAX_VISIBLE_LANES);

            return (
              <div key={wi} className={`flex flex-col ${wi > 0 ? "border-t border-gray-100 dark:border-gray-700" : ""}`}>
                {/* ── DAY-NUMBER ZONE: exactly 28px, z-[40], never receives bars ── */}
                <div className="relative z-[40] shrink-0 h-7 grid grid-cols-7 divide-x divide-gray-100 dark:divide-gray-700">
                  {week.map((day, di) => {
                    const isCurrentMonth = day.getMonth() === month;
                    const isToday = isSameDay(day, today);
                    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                    return (
                      <div
                        key={di}
                        className={`h-full px-2 flex items-center transition-colors ${
                          !isCurrentMonth ? "bg-slate-50/30 dark:bg-gray-900/30" :
                          isWeekend ? "bg-slate-50/40 dark:bg-gray-850" : "bg-white dark:bg-gray-800"
                        } ${isCurrentMonth ? "hover:bg-blue-50/20" : ""}`}
                      >
                        <div className={`text-[13px] font-bold w-7 h-7 flex items-center justify-center rounded-full shrink-0 transition-colors ${
                          isToday
                            ? "bg-[#0033CC] text-white shadow-md z-[50]"
                            : isCurrentMonth
                              ? "text-slate-800 dark:text-gray-300"
                              : "text-slate-300 dark:text-gray-600"
                        }`}>
                          {day.getDate()}
                        </div>
                        {isToday && !isCurrentMonth && null}
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
                      onOpenPopover={(state) => {
                        // Replace any existing popover — only one at a time
                        setOverflowPopover(state);
                      }}
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

// ─── List view helpers ────────────────────────────────────────────────────────

function formatListDate(startStr: string, endStr: string): string {
  const start = parseLocalDate(startStr);
  const end = parseLocalDate(endStr);
  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString("pt-BR", opts);
  if (isSameDay(start, end)) {
    return fmt(start, { day: "numeric", month: "short" });
  }
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()} a ${fmt(end, { day: "numeric", month: "short" })}`;
  }
  return `${fmt(start, { day: "numeric", month: "short" })} a ${fmt(end, { day: "numeric", month: "short" })}`;
}

// ─── List view ────────────────────────────────────────────────────────────────

function ListView({ events, onSelectEvent }: { events: Event[]; onSelectEvent: SelectEventFn }) {
  const today = new Date();
  const currentMonthNum = today.getFullYear() * 12 + today.getMonth();
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
    return Array.from(map.values())
      .sort((a, b) => a.key.localeCompare(b.key))
      .map(g => ({
        ...g,
        events: [...g.events].sort(
          (a, b) => parseLocalDate(a.startDate).getTime() - parseLocalDate(b.startDate).getTime()
        ),
      }));
  }, [events]);

  const toggleGroup = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  if (grouped.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
          <CalendarDays className="w-6 h-6 text-gray-400" />
        </div>
        <p className="text-sm font-semibold text-gray-500">Nenhum evento encontrado</p>
        <p className="text-xs text-gray-400">Tente remover ou alterar os filtros aplicados</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      {grouped.map((group) => {
        const isOpen = !collapsed.has(group.key);
        const isCurrent = group.key === currentMonthKey;
        const [gy, gm] = group.key.split("-").map(Number);
        const isPast = gy * 12 + gm < currentMonthNum;

        return (
          <div key={group.key} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
            <button
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-gray-750 transition-colors border-b border-gray-100 dark:border-gray-700"
              onClick={() => toggleGroup(group.key)}
              style={isPast ? { opacity: 0.65 } : undefined}
            >
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold ${isCurrent ? "text-blue-700 dark:text-blue-300" : "text-gray-700 dark:text-gray-300"}`}>
                  {group.label}
                </span>
                {isCurrent && (
                  <span className="text-[9px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                    Este mês
                  </span>
                )}
                <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full font-medium">
                  {group.events.length}
                </span>
              </div>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
            </button>

            {isOpen && (
              <div className="divide-y divide-gray-50 dark:divide-gray-700">
                {group.events.map(ev => {
                  const cfg = getCfg(getEffectiveStatus(ev));
                  const StatusIcon = cfg.icon;
                  return (
                    <button
                      key={ev.id}
                      onClick={(e) => onSelectEvent(ev, { x: e.clientX, y: e.clientY })}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#f8fafc] dark:hover:bg-gray-750"
                    >
                      <div className={`w-8 h-8 rounded-xl ${cfg.bg} border ${cfg.border} flex items-center justify-center shrink-0`}>
                        <StatusIcon className={`w-3.5 h-3.5 ${cfg.text}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold text-gray-900 dark:text-gray-100 truncate ${cfg.strikethrough ? "line-through text-gray-400" : ""}`}>
                          {ev.name}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <MapPin className="w-2.5 h-2.5 text-gray-400 shrink-0" />
                          <span className="text-[11px] text-gray-400 truncate">{ev.location}</span>
                          <span className="text-[11px] text-gray-300 shrink-0">·</span>
                          <span className="text-[11px] text-gray-400 shrink-0">
                            {formatListDate(ev.startDate, ev.endDate)}
                          </span>
                        </div>
                      </div>
                      <Badge className={`text-[9px] h-[18px] px-1.5 shrink-0 ${cfg.bg} ${cfg.text} border ${cfg.border} hover:${cfg.bg}`}>
                        {cfg.label}
                      </Badge>
                    </button>
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
  const [clickPos, setClickPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  function handleSelectEvent(e: Event, pos: { x: number; y: number }) {
    setClickPos(pos);
    setSelectedEvent(e);
  }

  const { data: events = [], isLoading } = useQuery<Event[]>({ queryKey: ["/api/events"] });

  // Only show concluido / em_andamento / planejado — never cancelled/deleted/inactive
  const visibleEvents = useMemo(() =>
    events.filter(ev => VISIBLE_STATUSES.has(getEffectiveStatus(ev))),
    [events]
  );

  const filteredEvents = useMemo(() => {
    let result = visibleEvents;
    if (statusFilter !== "all") {
      result = result.filter(ev => getEffectiveStatus(ev) === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(ev =>
        ev.name.toLowerCase().includes(q) || ev.location.toLowerCase().includes(q)
      );
    }
    return result;
  }, [visibleEvents, statusFilter, searchQuery]);

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

  // Counts based on visible events only (excludes cancelled/deleted/inactive)
  const statusCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const ev of visibleEvents) { const s = getEffectiveStatus(ev); map[s] = (map[s] || 0) + 1; }
    return map;
  }, [visibleEvents]);

  const legendItems = [
    { key: "concluido",    ...STATUS_CFG.concluido    },
    { key: "em_andamento", ...STATUS_CFG.em_andamento },
    { key: "planejado",    ...STATUS_CFG.planejado    },
  ];

  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-48px)] lg:h-[calc(100vh-64px)] max-w-6xl mx-auto">

      {/* ── Header + Control bar (single row) ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white px-5 py-3 rounded-2xl shadow-sm border border-slate-100 shrink-0">

        {/* Left: icon + title + month nav */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(0,51,204,0.08)" }}>
              <span className="material-symbols-outlined text-lg" style={{ color: "#0033CC", fontVariationSettings: "'FILL' 1" }}>calendar_today</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 leading-tight">Calendário de Eventos</h1>
              <p className="text-[11px] text-slate-400 leading-tight">
                {visibleEvents.length} {visibleEvents.length === 1 ? "evento" : "eventos"} ativos
              </p>
            </div>
          </div>

          {/* Month nav — only in month view */}
          {view === "month" && (
            <div className="flex items-center gap-1 ml-2 border-l border-slate-100 pl-4">
              <button onClick={prevMonth} className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-500 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-bold text-slate-800 min-w-[140px] text-center">
                {MONTH_NAMES[viewMonth]} {viewYear}
              </span>
              <button onClick={nextMonth} className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-500 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={goToday}
                className={`ml-1 px-3 py-1 border rounded-lg text-xs font-bold transition-all ${
                  isCurrentMonth ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                Hoje
              </button>
            </div>
          )}
        </div>

        {/* Right: search + status filters + view toggle */}
        <div className="flex items-center gap-2 flex-wrap">

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar evento…"
              className="h-8 pl-8 pr-3 text-xs rounded-xl border border-slate-200 bg-slate-50 text-slate-700 placeholder-slate-400 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all w-40"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Status filter pills */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mr-0.5">Filtros:</span>
            {legendItems.map(item => {
              const count = statusCounts[item.key] || 0;
              const isActive = statusFilter === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setStatusFilter(isActive ? "all" : item.key)}
                  className={`flex items-center gap-1.5 text-[11px] font-bold transition-all px-2 py-0.5 rounded-lg ${
                    isActive ? `${item.bg} ${item.text}` : "text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${item.dot}`} />
                  {item.label}
                  <span className={`tabular-nums text-[10px] ${isActive ? "opacity-70" : "text-slate-400"}`}>{count}</span>
                </button>
              );
            })}
            {statusFilter !== "all" && (
              <button onClick={() => setStatusFilter("all")} className="text-[10px] text-slate-400 hover:text-red-500 font-bold ml-1">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setView("month")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                view === "month" ? "text-white shadow-sm" : "text-slate-500 hover:bg-slate-200"
              }`}
              style={view === "month" ? { background: "#0033CC" } : {}}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Mês
            </button>
            <button
              onClick={() => setView("list")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                view === "list" ? "text-white shadow-sm" : "text-slate-500 hover:bg-slate-200"
              }`}
              style={view === "list" ? { background: "#0033CC" } : {}}
            >
              <List className="w-3.5 h-3.5" /> Lista
            </button>
          </div>
        </div>
      </div>

      {/* ── Calendar / List ── */}
      <div className="flex-1 min-h-0">
        {isLoading ? (
          <div className="h-full bg-white rounded-[32px] border border-slate-200 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#0033CC", borderTopColor: "transparent" }} />
          </div>
        ) : view === "month" ? (
          <MonthView
            year={viewYear}
            month={viewMonth}
            events={filteredEvents}
            onSelectEvent={handleSelectEvent}
          />
        ) : (
          <div className="h-full overflow-y-auto">
            <ListView events={filteredEvents} onSelectEvent={handleSelectEvent} />
          </div>
        )}
      </div>

      {/* ── Event detail panel ── */}
      {selectedEvent && (
        <EventPanel event={selectedEvent} onClose={() => setSelectedEvent(null)} clickPos={clickPos} />
      )}
    </div>
  );
}
