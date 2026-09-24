import { useState, useMemo, useEffect, useRef } from "react";
import { apiErrorMessage, apiErrorStatus } from "@/lib/api-error";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import {
  CalendarDays, ChevronLeft, ChevronRight, X, MapPin, Clock,
  CheckCircle, Play, List, LayoutGrid, AlertTriangle,
  Users, Tag, Search, ClipboardList, Table2, Ban, Calendar, Columns3,
} from "lucide-react";
import type { Event, TeamInclusion } from "@shared/schema";
import { STATUS, getEventStatus, statusStyle, parseLocalDate as parseLocalDateOrNull } from "@/lib/event-status";
import { usePageTitle } from "@/components/common/use-page-title";
import { PageHeader } from "@/components/common/page-header";
import { campo, useUrlState } from "@/lib/use-url-state";
import { listaDeVagasQuery } from "@/hooks/use-vaga-acoes";

// ─── Status config ────────────────────────────────────────────────────────────
// Cores/labels e a regra de status vêm de @/lib/event-status — a MESMA fonte da
// tela de Eventos. Aqui só fica o mapeamento de ícone (lucide) por status.

const STATUS_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  "concluído": CheckCircle,
  "em andamento": Play,
  "planejado": Clock,
  "excluído": Ban,
};

// Only these statuses are shown in the calendar
const VISIBLE_STATUSES = new Set(["concluído", "em andamento", "planejado"]);

function getCfg(status: string) {
  const s = statusStyle(status);
  return { ...s.tw, label: s.label, icon: STATUS_ICON[status] ?? Clock, pulse: s.pulse };
}

// ─── Foco de diálogos flutuantes ─────────────────────────────────────────────
// Foca o painel ao abrir e devolve o foco ao elemento que o abriu ao fechar.
function useDialogFocus<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => { opener?.focus?.(); };
  }, []);
  return ref;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

// Datas de evento são obrigatórias no schema; o fallback evita NaN caso venha vazio.
function parseLocalDate(str: string): Date {
  return parseLocalDateOrNull(str) ?? new Date(NaN);
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

// Mesma regra da tela de Eventos (respeita `events.status` manual quando o
// evento ainda não começou; datas decidem "em andamento"/"concluído").
const getEffectiveStatus = getEventStatus;

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

  // Só as vagas DESTE evento (`?eventId=`, 24/09) — antes baixava a fila inteira.
  const { data: teamInclusions = [], isLoading: loadingTeam, isError: teamError } = useQuery<TeamInclusion[]>(
    listaDeVagasQuery({ eventId: event.id }),
  );

  // Close on ESC
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  }, [onClose]);

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

  const panelRef = useDialogFocus<HTMLDivElement>();
  const PANEL_H_EST = 260;
  const top = Math.max(PANEL_MARGIN, Math.min(window.innerHeight - PANEL_H_EST - PANEL_MARGIN, clickPos.y - PANEL_H_EST / 2));

  return (
    <div className="fixed inset-0 z-[1000]">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-panel-title"
        ref={panelRef}
        tabIndex={-1}
        className="absolute bg-card rounded-xl border border-border overflow-hidden animate-in motion-reduce:animate-none fade-in zoom-in-95 duration-150 shadow-3"
        style={{
          width: PANEL_W,
          left,
          top,
        }}
      >
        <div className={`h-[3px] w-full ${cfg.bar}`} />
        <div className="px-4 pt-3.5 pb-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <Badge variant="outline" className={`text-2xs ${cfg.bg} ${cfg.text} border ${cfg.border} hover:bg-inherit`}>
              <StatusIcon className="w-2.5 h-2.5 mr-1" />
              {cfg.label}
            </Badge>
            <button
              onClick={onClose}
              aria-label="Fechar detalhes do evento"
              className="w-7 h-7 rounded-full bg-muted hover:bg-border flex items-center justify-center transition-colors shrink-0"
            >
              <X className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
            </button>
          </div>
          <h2 id="event-panel-title" className="text-sm font-bold text-foreground leading-snug">
            {event.name}
          </h2>
        </div>

        <div className="border-t border-border mx-4" />

        <div className="px-4 pt-3.5 pb-4 space-y-3.5">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5">
              <MapPin className={`w-3.5 h-3.5 shrink-0 ${cfg.iconText}`} aria-hidden="true" />
              <span className="text-xs text-slate-700">{event.location}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <CalendarDays className={`w-3.5 h-3.5 shrink-0 ${cfg.iconText}`} aria-hidden="true" />
              <span className="text-xs text-slate-700">{formatDateRange(event.startDate, event.endDate)}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Clock className={`w-3.5 h-3.5 shrink-0 ${cfg.iconText}`} aria-hidden="true" />
              <span className="text-xs text-slate-700">{days} {days === 1 ? "dia" : "dias"}</span>
            </div>
          </div>

          <div className="border-t border-dashed border-border" />

          <div className="space-y-2.5">
            {/* Nunca mostrar "0 colaboradores" quando na verdade a escala não foi carregada */}
            {loadingTeam ? (
              <p className="text-xs text-muted-foreground">Carregando escala…</p>
            ) : teamError ? (
              <p className="text-xs text-warning">
                Não foi possível carregar a escala deste evento.
              </p>
            ) : (
              <>
                <div className="flex items-center gap-2.5">
                  <Users className={`w-3.5 h-3.5 shrink-0 ${cfg.iconText}`} aria-hidden="true" />
                  <span className="text-xs text-slate-700">
                    <span className="font-semibold text-foreground">{collaboratorCount}</span>
                    {" "}{collaboratorCount === 1 ? "colaborador escalado" : "colaboradores escalados"}
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Tag className={`w-3.5 h-3.5 shrink-0 ${cfg.iconText}`} aria-hidden="true" />
                  <span className="text-xs text-slate-700">
                    <span className="font-semibold text-foreground">{functionCount}</span>
                    {" "}{functionCount === 1 ? "função envolvida" : "funções envolvidas"}
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="border-t border-dashed border-border" />

          {/* Atalhos — Escala não lê query params (abre a tela); o Espelho lê ?eventId= */}
          <div className="flex items-center gap-2">
            <Link
              href="/scaling"
              onClick={onClose}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-lg border border-border text-2xs font-semibold text-slate-700 hover:bg-surface-muted transition-colors"
            >
              <ClipboardList className="w-3.5 h-3.5" aria-hidden="true" /> Ver escala
            </Link>
            <Link
              href={`/operational-mirror?eventId=${encodeURIComponent(event.id)}`}
              onClick={onClose}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-lg border border-border text-2xs font-semibold text-slate-700 hover:bg-surface-muted transition-colors"
            >
              <Table2 className="w-3.5 h-3.5" aria-hidden="true" /> Espelho operacional
            </Link>
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

  const popoverRef = useDialogFocus<HTMLDivElement>();
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
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={popoverRef}
        tabIndex={-1}
        className="absolute bg-card animate-in motion-reduce:animate-none fade-in zoom-in-95 duration-150 flex flex-col rounded-xl border border-border shadow-3 overflow-hidden"
        style={{
          width: POPOVER_W,
          left,
          top,
          maxHeight: MAX_H,
        }}
      >
        {/* Header — always visible */}
        <div className="px-3 py-2.5 border-b border-border shrink-0">
          <span className="text-2xs font-semibold text-muted-foreground capitalize">{title}</span>
        </div>

        {/* Scrollable list */}
        <div
          className="overflow-y-auto divide-y divide-border"
          style={{
            maxHeight: maxListH,
            scrollbarWidth: "thin",
            scrollbarColor: "var(--border) transparent",
          }}
        >
          {dayEvents.map(ev => {
            const cfg = getCfg(getEffectiveStatus(ev));
            const StatusIcon = cfg.icon;
            return (
              <button
                key={ev.id}
                onClick={(e) => { e.stopPropagation(); onSelectEvent(ev, { x: e.clientX, y: e.clientY }); onClose(); }}
                className="w-full flex items-start gap-2.5 px-3 py-2.5 hover:bg-surface-muted text-left transition-colors"
              >
                <div className={`w-6 h-6 rounded-lg ${cfg.bg} border ${cfg.border} flex items-center justify-center shrink-0 mt-0.5`}>
                  <StatusIcon className={`w-3 h-3 ${cfg.text}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-xs font-semibold text-foreground leading-snug overflow-hidden"
                    style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}
                  >
                    {ev.name}
                  </p>
                  <p className="text-2xs text-muted-foreground truncate leading-tight mt-0.5">{ev.location}</p>
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
            className="h-[22px] mx-0.5 rounded-md px-2 text-2xs font-semibold text-slate-700 bg-muted hover:bg-border transition-colors text-left truncate"
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

  // Grade + barras são caras (ordenação e parse de datas por semana). Sem memo elas
  // eram recalculadas a cada render — inclusive ao abrir/fechar o popover de overflow.
  const weeks = useMemo(() => {
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
  }, [year, month, events]);

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

function ListView({ events, onSelectEvent, hasFilters }: { events: Event[]; onSelectEvent: SelectEventFn; hasFilters: boolean }) {
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

// ─── Week helpers ─────────────────────────────────────────────────────────────

// Semana ISO: começa na segunda-feira (getDay(): 0=Dom … 6=Sáb).
function getWeekStart(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  const offset = (copy.getDay() + 6) % 7; // Seg=0 … Dom=6
  copy.setDate(copy.getDate() - offset);
  return copy;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function isoWeekNumber(d: Date): number {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// Segunda → Domingo (semana ISO)
const WEEK_DAY_SHORT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const WEEK_DAY_LONG = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

// ─── Empty state (Mês/Semana) ─────────────────────────────────────────────────

function CalendarEmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center" role="status">
      <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
        <CalendarDays className="w-6 h-6 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-slate-600">Nenhum evento {label}</p>
      <p className="text-xs text-muted-foreground">Use as setas para navegar ou ajuste os filtros.</p>
    </div>
  );
}

// ─── Week view ────────────────────────────────────────────────────────────────

function WeekView({ weekStart, events, onSelectEvent }: {
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  usePageTitle("Calendário");
  const today = new Date();
  // Visão, mês/semana, status e busca na URL (23/09): voltar para o calendário
  // devolve o mesmo mês e o mesmo recorte; o link copiado também.
  const [urlState, setUrlState] = useUrlState({
    visao: campo.opcao<"month" | "week" | "list">("month"),
    mes: campo.texto(""),      // AAAA-MM
    semana: campo.texto(""),   // AAAA-MM-DD (segunda-feira)
    status: campo.texto("all"),
    q: campo.texto(""),
  });
  const view = urlState.visao;
  const setView = (v: "month" | "week" | "list") => setUrlState({ visao: v });
  const { viewYear, viewMonth } = useMemo(() => {
    const m = /^(d{4})-(d{2})$/.exec(urlState.mes);
    return m ? { viewYear: Number(m[1]), viewMonth: Number(m[2]) - 1 } : { viewYear: today.getFullYear(), viewMonth: today.getMonth() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlState.mes]);
  const viewWeekStart = useMemo(() => {
    const m = /^(d{4})-(d{2})-(d{2})$/.exec(urlState.semana);
    return m ? getWeekStart(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : getWeekStart(new Date());
  }, [urlState.semana]);
  const mesNaUrl = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, "0")}`;
  const diaNaUrl = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [clickPos, setClickPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const statusFilter = urlState.status;
  const setStatusFilter = (v: string) => setUrlState({ status: v });
  const searchQuery = urlState.q;
  const setSearchQuery = (v: string) => setUrlState({ q: v });

  function handleSelectEvent(e: Event, pos: { x: number; y: number }) {
    setClickPos(pos);
    setSelectedEvent(e);
  }

  const { data: events = [], isLoading, isError, error } = useQuery<Event[]>({ queryKey: ["/api/events"] });

  // Sem isso, uma sessão expirada ou queda de rede viravam "0 eventos" —
  // um calendário vazio indistinguível de uma agenda realmente vazia.
  const loadErrorMessage = (() => {
    if (!isError) return null;
    if (apiErrorStatus(error) === 401) return "Sua sessão expirou. Entre novamente para ver os eventos.";
    return apiErrorMessage(error, "Não foi possível carregar os eventos. Verifique sua conexão e tente novamente.");
  })();

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
    setUrlState({ mes: viewMonth === 0 ? mesNaUrl(viewYear - 1, 11) : mesNaUrl(viewYear, viewMonth - 1) });
  }
  function nextMonth() {
    setUrlState({ mes: viewMonth === 11 ? mesNaUrl(viewYear + 1, 0) : mesNaUrl(viewYear, viewMonth + 1) });
  }
  function goToday() {
    // Vazio = hoje: a URL fica limpa quando se está no mês/semana corrente.
    setUrlState({ mes: "", semana: "" });
  }
  function prevWeek() { setUrlState({ semana: diaNaUrl(addDays(viewWeekStart, -7)) }); }
  function nextWeek() { setUrlState({ semana: diaNaUrl(addDays(viewWeekStart, 7)) }); }

  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();
  const currentWeekStart = getWeekStart(today);
  const isCurrentWeek = viewWeekStart.getTime() === currentWeekStart.getTime();

  // Counts based on visible events only (excludes cancelled/deleted/inactive)
  const statusCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const ev of visibleEvents) { const s = getEffectiveStatus(ev); map[s] = (map[s] || 0) + 1; }
    return map;
  }, [visibleEvents]);

  const legendItems = (["concluído", "em andamento", "planejado"] as const).map(key => ({
    key, label: STATUS[key].label, ...STATUS[key].tw,
  }));

  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-48px)] lg:h-[calc(100vh-64px)] max-w-6xl mx-auto">

      {/* Cabeçalho padrão (23/09): PageHeader no lugar do h1 manual; navegação de
          mês/semana entra como `context`, busca/filtros/visão como `actions`. */}
      <PageHeader
        icon={CalendarDays}
        title="Calendário"
        subtitle={
          <span aria-live="polite">
            {isLoading
              ? "Carregando eventos…"
              : loadErrorMessage
                ? "Contagem indisponível"
                : `${visibleEvents.length} ${visibleEvents.length === 1 ? "evento" : "eventos"} ativos`}
          </span>
        }
        className="items-center bg-card px-5 py-3 rounded-xl shadow-1 border border-border shrink-0"
        context={<>
          {/* Month nav — only in month view */}
          {view === "month" && (
            <div className="flex items-center gap-1 ml-2 border-l border-border pl-4">
              <button onClick={prevMonth} aria-label="Mês anterior" className="p-1.5 hover:bg-surface-muted rounded-lg text-muted-foreground transition-colors">
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              </button>
              <span className="text-sm font-bold text-foreground min-w-[140px] text-center">
                {MONTH_NAMES[viewMonth]} {viewYear}
              </span>
              <button onClick={nextMonth} aria-label="Próximo mês" className="p-1.5 hover:bg-surface-muted rounded-lg text-muted-foreground transition-colors">
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                onClick={goToday}
                className={`ml-1 px-3 py-1 border rounded-lg text-xs font-bold transition-all ${
                  isCurrentMonth ? "border-primary/25 bg-brand-soft text-primary" : "border-border text-muted-foreground hover:bg-surface-muted"
                }`}
              >
                Hoje
              </button>
            </div>
          )}

          {/* Week nav — only in week view */}
          {view === "week" && (() => {
            const weekEnd = addDays(viewWeekStart, 6);
            const sameMonth = viewWeekStart.getMonth() === weekEnd.getMonth();
            const rangeLabel = sameMonth
              ? `${viewWeekStart.getDate()} – ${weekEnd.getDate()} ${MONTH_NAMES[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`
              : `${viewWeekStart.getDate()} ${MONTH_NAMES[viewWeekStart.getMonth()]} – ${weekEnd.getDate()} ${MONTH_NAMES[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;
            return (
              <div className="flex items-center gap-1 ml-2 border-l border-border pl-4">
                <button onClick={prevWeek} aria-label="Semana anterior" className="p-1.5 hover:bg-surface-muted rounded-lg text-muted-foreground transition-colors">
                  <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                </button>
                <div className="flex items-center gap-2 min-w-[200px] justify-center">
                  <span className="text-sm font-bold text-foreground">{rangeLabel}</span>
                  <span className="px-2 py-0.5 bg-brand-soft text-primary text-2xs font-bold rounded-full uppercase tracking-wider">
                    Sem. {isoWeekNumber(viewWeekStart)}
                  </span>
                </div>
                <button onClick={nextWeek} aria-label="Próxima semana" className="p-1.5 hover:bg-surface-muted rounded-lg text-muted-foreground transition-colors">
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  onClick={goToday}
                  className={`ml-1 px-3 py-1 border rounded-lg text-xs font-bold transition-all ${
                    isCurrentWeek ? "border-primary/25 bg-brand-soft text-primary" : "border-border text-muted-foreground hover:bg-surface-muted"
                  }`}
                >
                  Hoje
                </button>
              </div>
            );
          })()}
        </>}
        actions={<>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" aria-hidden="true" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar evento…"
              aria-label="Buscar evento por nome ou local"
              className="h-8 pl-8 pr-3 text-xs rounded-xl border border-border bg-surface-muted text-slate-700 placeholder:text-muted-foreground outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/25 transition-all w-40"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} aria-label="Limpar busca" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-slate-600">
                <X className="w-3 h-3" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Status filter pills */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-muted rounded-xl border border-border">
            <span className="text-2xs font-black text-muted-foreground uppercase tracking-widest mr-0.5">Filtros:</span>
            {legendItems.map(item => {
              const count = statusCounts[item.key] || 0;
              const isActive = statusFilter === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setStatusFilter(isActive ? "all" : item.key)}
                  aria-pressed={isActive}
                  className={`flex items-center gap-1.5 text-2xs font-bold transition-all px-2 py-0.5 rounded-lg ${
                    isActive ? `${item.bg} ${item.text}` : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${item.dot}`} />
                  {item.label}
                  <span className={`tabular-nums text-2xs ${isActive ? "opacity-70" : "text-muted-foreground"}`}>{count}</span>
                </button>
              );
            })}
            {statusFilter !== "all" && (
              <button onClick={() => setStatusFilter("all")} aria-label="Limpar filtro de status" className="text-2xs text-muted-foreground hover:text-danger-strong font-bold ml-1">
                <X className="w-3 h-3" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-1 bg-muted p-1 rounded-xl">
            <button
              onClick={() => setView("month")}
              aria-pressed={view === "month"}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                view === "month" ? "bg-primary text-primary-foreground shadow-1" : "text-muted-foreground hover:bg-border"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" /> Mês
            </button>
            <button
              onClick={() => setView("week")}
              aria-pressed={view === "week"}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                view === "week" ? "bg-primary text-primary-foreground shadow-1" : "text-muted-foreground hover:bg-border"
              }`}
            >
              <Columns3 className="h-3.5 w-3.5" aria-hidden="true" />
              Semana
            </button>
            <button
              onClick={() => setView("list")}
              aria-pressed={view === "list"}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                view === "list" ? "bg-primary text-primary-foreground shadow-1" : "text-muted-foreground hover:bg-border"
              }`}
            >
              <List className="w-3.5 h-3.5" aria-hidden="true" /> Lista
            </button>
          </div>
        </>}
      />

      {/* ── Calendar / Week / List ── */}
      <div className="flex-1 min-h-0">
        {isLoading ? (
          <div className="h-full bg-card rounded-xl border border-border flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" role="status" aria-label="Carregando calendário" />
          </div>
        ) : loadErrorMessage ? (
          <div
            role="alert"
            className="h-full bg-card rounded-xl border border-warning/25 flex flex-col items-center justify-center gap-3 text-center px-6"
          >
            <div className="w-14 h-14 rounded-xl bg-warning-soft flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-warning-strong" aria-hidden="true" />
            </div>
            <p className="text-sm font-semibold text-slate-700">Não foi possível carregar o calendário</p>
            <p className="text-xs text-muted-foreground max-w-sm">{loadErrorMessage}</p>
          </div>
        ) : view === "month" ? (
          <MonthView
            year={viewYear}
            month={viewMonth}
            events={filteredEvents}
            onSelectEvent={handleSelectEvent}
          />
        ) : view === "week" ? (
          <WeekView
            weekStart={viewWeekStart}
            events={filteredEvents}
            onSelectEvent={handleSelectEvent}
          />
        ) : (
          <div className="h-full overflow-y-auto">
            <ListView
              events={filteredEvents}
              onSelectEvent={handleSelectEvent}
              hasFilters={statusFilter !== "all" || searchQuery.trim() !== ""}
            />
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
