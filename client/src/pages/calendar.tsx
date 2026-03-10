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
  panelBg: string; panelBorder: string; icon: any; strikethrough?: boolean;
}> = {
  concluido: {
    label: "Concluído",
    bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-200",
    panelBg: "bg-emerald-50", panelBorder: "border-emerald-200",
    icon: CheckCircle,
  },
  em_andamento: {
    label: "Em andamento",
    bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-200",
    panelBg: "bg-amber-50", panelBorder: "border-amber-200",
    icon: Play,
  },
  planejado: {
    label: "Planejado",
    bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-200",
    panelBg: "bg-blue-50", panelBorder: "border-blue-200",
    icon: Clock,
  },
  cancelado: {
    label: "Cancelado",
    bg: "bg-slate-100", text: "text-slate-500", border: "border-slate-200",
    panelBg: "bg-slate-50", panelBorder: "border-slate-200",
    icon: Ban, strikethrough: true,
  },
};

function getCfg(status: string) {
  return STATUS_CFG[status] || STATUS_CFG["planejado"];
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

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

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

// ─── Event pill (calendar cell) ───────────────────────────────────────────────

function EventPill({ event, onClick }: { event: Event; onClick: () => void }) {
  const cfg = getCfg(getEffectiveStatus(event));
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`w-full text-left text-[10px] font-medium px-1.5 py-0.5 rounded truncate border ${cfg.bg} ${cfg.text} ${cfg.border} hover:opacity-80 transition-opacity ${cfg.strikethrough ? "line-through opacity-60" : ""}`}
    >
      {event.name}
    </button>
  );
}

// ─── Month view ───────────────────────────────────────────────────────────────

function MonthView({
  year, month, events, onSelectEvent, selectedEvent,
}: {
  year: number; month: number; events: Event[];
  onSelectEvent: (e: Event | null) => void; selectedEvent: Event | null;
}) {
  const today = new Date();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = firstDay.getDay();
  const totalCells = Math.ceil((startPad + lastDay.getDate()) / 7) * 7;

  const cells: Date[] = [];
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(year, month, 1 - startPad + i);
    cells.push(d);
  }

  const MAX_VISIBLE = 2;

  function eventsForDay(day: Date) {
    return events.filter(ev => {
      const s = parseLocalDate(ev.startDate);
      const e = parseLocalDate(ev.endDate);
      return isInRange(day, s, e);
    });
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
      <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-700">
        {WEEKDAY_LABELS.map(d => (
          <div key={d} className={`py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider ${d === "Dom" || d === "Sáb" ? "text-slate-400" : "text-slate-500"}`}>
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 divide-x divide-gray-100 dark:divide-gray-700">
        {cells.map((day, idx) => {
          const isCurrentMonth = day.getMonth() === month;
          const isToday = isSameDay(day, today);
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;
          const dayEvents = eventsForDay(day);
          const visibleEvents = dayEvents.slice(0, MAX_VISIBLE);
          const overflow = dayEvents.length - MAX_VISIBLE;
          const rowBorder = idx >= 7 ? "border-t border-gray-100 dark:border-gray-700" : "";

          return (
            <div
              key={idx}
              className={`min-h-[96px] p-1.5 flex flex-col gap-0.5 transition-colors group ${rowBorder} ${
                !isCurrentMonth ? "bg-gray-50/60 dark:bg-gray-900/40" :
                isWeekend ? "bg-slate-50/80 dark:bg-gray-850" : "bg-white dark:bg-gray-800"
              } hover:bg-blue-50/30 dark:hover:bg-blue-950/10 cursor-default`}
            >
              <div className={`text-[11px] font-bold w-6 h-6 flex items-center justify-center rounded-full mb-0.5 self-start ${
                isToday
                  ? "bg-blue-600 text-white shadow-sm"
                  : isCurrentMonth
                    ? "text-gray-700 dark:text-gray-300"
                    : "text-gray-300 dark:text-gray-600"
              }`}>
                {day.getDate()}
              </div>
              {visibleEvents.map(ev => (
                <EventPill key={ev.id} event={ev} onClick={() => onSelectEvent(ev)} />
              ))}
              {overflow > 0 && (
                <button className="text-[9px] text-gray-400 hover:text-blue-600 px-1 text-left font-medium transition-colors">
                  +{overflow} mais
                </button>
              )}
            </div>
          );
        })}
      </div>
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
        <div className="flex items-center gap-2.5 flex-wrap">
          {view === "month" && (
            <>
              <Button variant="outline" size="sm" onClick={prevMonth} className="h-8 w-8 p-0 rounded-lg">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="min-w-[140px] text-center">
                <span className="text-sm font-bold text-gray-800 dark:text-gray-200">
                  {MONTH_NAMES[viewMonth]} {viewYear}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={nextMonth} className="h-8 w-8 p-0 rounded-lg">
                <ChevronRight className="w-4 h-4" />
              </Button>
              {!isCurrentMonth && (
                <Button variant="outline" size="sm" onClick={goToday} className="h-8 text-xs px-3">
                  Hoje
                </Button>
              )}
            </>
          )}
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => setView("month")}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${view === "month" ? "bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Mês
            </button>
            <button
              onClick={() => setView("list")}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${view === "list" ? "bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              <List className="w-3.5 h-3.5" /> Lista
            </button>
          </div>
        </div>
      </div>

      {/* ── Status legend / filter ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setStatusFilter("all")}
          className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all ${
            statusFilter === "all"
              ? "bg-gray-800 text-white border-gray-800"
              : "border-gray-200 text-gray-500 hover:border-gray-300 bg-white"
          }`}
        >
          Todos
          <span className="font-bold">{events.length}</span>
        </button>
        {legendItems.map(item => (
          <button
            key={item.key}
            onClick={() => setStatusFilter(statusFilter === item.key ? "all" : item.key)}
            className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all ${
              statusFilter === item.key
                ? `${item.bg} ${item.text} ${item.border} shadow-sm`
                : `border-gray-200 text-gray-500 hover:${item.border} hover:${item.bg} bg-white`
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${item.bg.replace("bg-", "bg-").replace("-100", "-500")}`} />
            {item.label}
            {statusCounts[item.key] ? <span className="font-bold">{statusCounts[item.key]}</span> : null}
          </button>
        ))}
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
          selectedEvent={selectedEvent}
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
