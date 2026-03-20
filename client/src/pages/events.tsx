import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Plus, Edit, Trash2, X, ChevronUp, ChevronDown, ChevronsUpDown,
  RotateCcw, Search, LayoutList, CalendarClock, CalendarCheck, CalendarX,
  CalendarDays, List, ChevronLeft, ChevronRight,
} from "lucide-react";
import EventModal from "@/components/modals/event-modal";
import ConfirmModal from "@/components/common/confirm-modal";
import type { Event, TeamInclusion } from "@shared/schema";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek,
  endOfWeek, isSameMonth, isSameDay, isWithinInterval, addMonths, subMonths,
  addWeeks, subWeeks, parseISO, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── helpers ──────────────────────────────────────────────────────────────────

function getEventStatus(event: Event): string {
  if (event.status === "excluído") return "excluído";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end   = new Date(event.endDate);   end.setHours(0, 0, 0, 0);
  const start = new Date(event.startDate); start.setHours(0, 0, 0, 0);
  if (end < today)    return "concluído";
  if (start <= today) return "em andamento";
  return event.status;
}

function formatPeriod(s: string, e: string) {
  try {
    const d1 = new Date(s), d2 = new Date(e);
    if (d1.toDateString() === d2.toDateString()) return format(d1, "dd/MM/yy");
    const sameMonth = d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();
    if (sameMonth) return `${format(d1, "dd")}–${format(d2, "dd/MM/yy")}`;
    return `${format(d1, "dd/MM")} – ${format(d2, "dd/MM/yy")}`;
  } catch { return `${s} – ${e}`; }
}

const STATUS: Record<string, { label: string; dot: string; bg: string; text: string; bar: string }> = {
  planejado:      { label: "Planejado",    dot: "#3B82F6", bg: "#EFF6FF", text: "#1D4ED8", bar: "#3B82F6" },
  "em andamento": { label: "Em andamento", dot: "#F97316", bg: "#FFF7ED", text: "#C2410C", bar: "#F97316" },
  concluído:      { label: "Concluído",    dot: "#22C55E", bg: "#F0FDF4", text: "#15803D", bar: "#22C55E" },
  excluído:       { label: "Excluído",     dot: "#94A3B8", bg: "#F8FAFC", text: "#64748B", bar: "#CBD5E1" },
};

type SortKey = "eventNumber" | "name" | "period" | "status";
type SortDir = "asc" | "desc";
type ViewMode = "list" | "calendar" | "week";

function SortBtn({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown size={11} className="ml-1 inline opacity-30" />;
  return sortDir === "asc"
    ? <ChevronUp size={11} className="ml-1 inline text-[#0033CC]" />
    : <ChevronDown size={11} className="ml-1 inline text-[#0033CC]" />;
}

const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const WEEK_DAYS_SHORT = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

const sel: React.CSSProperties = {
  height: 34, fontSize: 12, padding: "0 8px",
  border: "1px solid #E2E8F0", borderRadius: 7,
  background: "white", color: "#374151",
  fontFamily: "inherit", cursor: "pointer", outline: "none",
};

// ─── Event chip (used in calendar/week) ───────────────────────────────────────
function EventChip({ event, onClick }: { event: Event; onClick: () => void }) {
  const ds = getEventStatus(event);
  const sc = STATUS[ds] ?? STATUS["planejado"];
  return (
    <button
      onClick={onClick}
      title={`${event.name} · ${event.location}`}
      style={{
        width: "100%", textAlign: "left", padding: "2px 6px",
        borderRadius: 4, background: sc.bg, border: `1px solid ${sc.bar}30`,
        borderLeft: `3px solid ${sc.bar}`,
        fontSize: 10, fontWeight: 600, color: sc.text,
        cursor: "pointer", overflow: "hidden", whiteSpace: "nowrap",
        textOverflow: "ellipsis", fontFamily: "inherit", display: "block",
      }}
    >
      {event.name}
    </button>
  );
}

// ─── Calendar Month View ───────────────────────────────────────────────────────
function CalendarView({ events, onEdit, currentDate, setCurrentDate }: {
  events: Event[];
  onEdit: (e: Event) => void;
  currentDate: Date;
  setCurrentDate: (d: Date) => void;
}) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd   = endOfMonth(currentDate);
  const calStart   = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd     = endOfWeek(monthEnd,   { weekStartsOn: 0 });
  const days       = eachDayOfInterval({ start: calStart, end: calEnd });

  const eventsOnDay = (day: Date) =>
    events.filter(ev => {
      try {
        const s = startOfDay(parseISO(ev.startDate));
        const e = endOfDay(parseISO(ev.endDate));
        return isWithinInterval(day, { start: s, end: e });
      } catch { return false; }
    });

  const today = new Date();

  return (
    <div style={{ background: "white", borderRadius: 10, border: "1px solid #F1F5F9", overflow: "hidden" }}>
      {/* Nav */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: "1px solid #F1F5F9" }}>
        <button onClick={() => setCurrentDate(subMonths(currentDate, 1))}
          style={{ width: 30, height: 30, borderRadius: 6, border: "1px solid #E2E8F0", background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748B" }}>
          <ChevronLeft size={15} />
        </button>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", flex: 1, textAlign: "center", textTransform: "capitalize" }}>
          {format(currentDate, "MMMM yyyy", { locale: ptBR })}
        </span>
        <button onClick={() => setCurrentDate(new Date())}
          style={{ height: 28, padding: "0 10px", borderRadius: 6, border: "1px solid #E2E8F0", background: "white", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#64748B", fontFamily: "inherit" }}>
          Hoje
        </button>
        <button onClick={() => setCurrentDate(addMonths(currentDate, 1))}
          style={{ width: 30, height: 30, borderRadius: 6, border: "1px solid #E2E8F0", background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748B" }}>
          <ChevronRight size={15} />
        </button>
      </div>

      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid #F1F5F9" }}>
        {WEEK_DAYS_SHORT.map(d => (
          <div key={d} style={{ padding: "8px 0", textAlign: "center", fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em" }}>{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {days.map((day, i) => {
          const inMonth = isSameMonth(day, currentDate);
          const isToday = isSameDay(day, today);
          const dayEvents = eventsOnDay(day);
          const MAX_VISIBLE = 2;
          return (
            <div key={i} style={{
              minHeight: 80, padding: "6px 4px",
              borderRight: (i + 1) % 7 !== 0 ? "1px solid #F8FAFC" : "none",
              borderBottom: i < days.length - 7 ? "1px solid #F8FAFC" : "none",
              background: isToday ? "#EEF2FF" : "white",
              opacity: inMonth ? 1 : 0.35,
            }}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
                <span style={{
                  width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: isToday ? 700 : 500,
                  color: isToday ? "white" : inMonth ? "#374151" : "#CBD5E1",
                  background: isToday ? "#0033CC" : "transparent",
                }}>
                  {format(day, "d")}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {dayEvents.slice(0, MAX_VISIBLE).map(ev => (
                  <EventChip key={ev.id} event={ev} onClick={() => onEdit(ev)} />
                ))}
                {dayEvents.length > MAX_VISIBLE && (
                  <span style={{ fontSize: 9, color: "#94A3B8", fontWeight: 600, paddingLeft: 4 }}>
                    +{dayEvents.length - MAX_VISIBLE} mais
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Week View ─────────────────────────────────────────────────────────────────
function WeekView({ events, onEdit, currentDate, setCurrentDate }: {
  events: Event[];
  onEdit: (e: Event) => void;
  currentDate: Date;
  setCurrentDate: (d: Date) => void;
}) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekEnd   = endOfWeek(currentDate,   { weekStartsOn: 0 });
  const days      = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const today     = new Date();

  const eventsOnDay = (day: Date) =>
    events.filter(ev => {
      try {
        const s = startOfDay(parseISO(ev.startDate));
        const e = endOfDay(parseISO(ev.endDate));
        return isWithinInterval(day, { start: s, end: e });
      } catch { return false; }
    });

  const weekLabel = (() => {
    if (weekStart.getMonth() === weekEnd.getMonth())
      return `${format(weekStart, "d")}–${format(weekEnd, "d 'de' MMMM yyyy", { locale: ptBR })}`;
    return `${format(weekStart, "d MMM", { locale: ptBR })} – ${format(weekEnd, "d MMM yyyy", { locale: ptBR })}`;
  })();

  return (
    <div style={{ background: "white", borderRadius: 10, border: "1px solid #F1F5F9", overflow: "hidden" }}>
      {/* Nav */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: "1px solid #F1F5F9" }}>
        <button onClick={() => setCurrentDate(subWeeks(currentDate, 1))}
          style={{ width: 30, height: 30, borderRadius: 6, border: "1px solid #E2E8F0", background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748B" }}>
          <ChevronLeft size={15} />
        </button>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", flex: 1, textAlign: "center", textTransform: "capitalize" }}>{weekLabel}</span>
        <button onClick={() => setCurrentDate(new Date())}
          style={{ height: 28, padding: "0 10px", borderRadius: 6, border: "1px solid #E2E8F0", background: "white", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#64748B", fontFamily: "inherit" }}>
          Hoje
        </button>
        <button onClick={() => setCurrentDate(addWeeks(currentDate, 1))}
          style={{ width: 30, height: 30, borderRadius: 6, border: "1px solid #E2E8F0", background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748B" }}>
          <ChevronRight size={15} />
        </button>
      </div>

      {/* Columns */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {days.map((day, i) => {
          const isToday    = isSameDay(day, today);
          const dayEvents  = eventsOnDay(day);
          return (
            <div key={i} style={{
              borderRight: i < 6 ? "1px solid #F1F5F9" : "none",
              minHeight: 160,
            }}>
              {/* Header */}
              <div style={{
                padding: "10px 8px 8px",
                textAlign: "center",
                borderBottom: "1px solid #F1F5F9",
                background: isToday ? "#EEF2FF" : "#FAFBFF",
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: isToday ? "#0033CC" : "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                  {WEEK_DAYS_SHORT[i]}
                </div>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%", margin: "0 auto",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: isToday ? "#0033CC" : "transparent",
                  fontSize: 13, fontWeight: 700,
                  color: isToday ? "white" : "#374151",
                }}>
                  {format(day, "d")}
                </div>
              </div>
              {/* Events */}
              <div style={{ padding: "8px 4px", display: "flex", flexDirection: "column", gap: 3 }}>
                {dayEvents.length === 0 && (
                  <div style={{ height: 40 }} />
                )}
                {dayEvents.map(ev => (
                  <EventChip key={ev.id} event={ev} onClick={() => onEdit(ev)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── List / Card View ──────────────────────────────────────────────────────────
function ListView({ events, onEdit, onDelete, onRestore, escalacoesByEvent }: {
  events: Event[];
  onEdit: (e: Event) => void;
  onDelete: (e: Event) => void;
  onRestore: (e: Event) => void;
  escalacoesByEvent: Record<string, number>;
}) {
  if (events.length === 0) {
    return (
      <div style={{ background: "white", borderRadius: 10, border: "1px solid #F1F5F9", textAlign: "center", padding: "56px 0" }}>
        <span className="material-symbols-outlined" style={{ fontSize: 36, color: "#E2E8F0", display: "block", marginBottom: 10 }}>event_busy</span>
        <p style={{ fontSize: 13, color: "#CBD5E1", margin: 0 }}>Nenhum evento encontrado.</p>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {events.map(event => {
        const ds  = getEventStatus(event);
        const sc  = STATUS[ds] ?? STATUS["planejado"];
        const esc = escalacoesByEvent[event.id] ?? 0;
        const isDeleted  = ds === "excluído";
        const isOngoing  = ds === "em andamento";
        return (
          <div key={event.id} style={{
            background: "white", borderRadius: 10, border: "1px solid #F1F5F9",
            overflow: "hidden", display: "flex", alignItems: "stretch",
            opacity: isDeleted ? 0.6 : 1,
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}>
            {/* Color bar */}
            <div style={{ width: 4, background: sc.bar, flexShrink: 0 }} />
            <div style={{ flex: 1, padding: "12px 14px", display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
              {/* Number */}
              <span style={{ fontSize: 11, fontWeight: 700, color: "#CBD5E1", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>#{event.eventNumber}</span>
              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {isOngoing && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#F97316", flexShrink: 0 }} className="animate-pulse" />}
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.name}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 3 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#64748B" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 12, color: "#CBD5E1", fontVariationSettings: "'FILL' 1" }}>location_on</span>
                    {event.location}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#64748B" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 12, color: "#CBD5E1", fontVariationSettings: "'FILL' 1" }}>calendar_month</span>
                    {formatPeriod(event.startDate, event.endDate)}
                  </span>
                  {esc > 0 && (
                    <span style={{ fontSize: 11, color: "#64748B" }}>
                      <span style={{ fontWeight: 700, color: "#374151" }}>{esc}</span> escal.
                    </span>
                  )}
                </div>
              </div>
              {/* Status */}
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0,
                padding: "3px 9px", borderRadius: 20, background: sc.bg, color: sc.text,
                fontSize: 10, fontWeight: 600, whiteSpace: "nowrap",
              }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: sc.dot }} />
                {sc.label}
              </span>
              {/* Actions */}
              <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                {isDeleted ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={() => onRestore(event)} style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8" }}
                        className="hover:bg-emerald-50 hover:!text-emerald-600 transition-colors"><RotateCcw size={13} /></button>
                    </TooltipTrigger><TooltipContent>Restaurar</TooltipContent>
                  </Tooltip>
                ) : (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button onClick={() => onEdit(event)} style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8" }}
                          className="hover:bg-blue-50 hover:!text-[#0033CC] transition-colors"><Edit size={13} /></button>
                      </TooltipTrigger><TooltipContent>Editar</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button onClick={() => onDelete(event)} style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8" }}
                          className="hover:bg-red-50 hover:!text-red-500 transition-colors"><Trash2 size={13} /></button>
                      </TooltipTrigger><TooltipContent>Excluir</TooltipContent>
                    </Tooltip>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Table View ────────────────────────────────────────────────────────────────
function TableView({ events, onEdit, onDelete, onRestore, escalacoesByEvent, sortKey, sortDir, handleSort }: {
  events: Event[];
  onEdit: (e: Event) => void;
  onDelete: (e: Event) => void;
  onRestore: (e: Event) => void;
  escalacoesByEvent: Record<string, number>;
  sortKey: SortKey;
  sortDir: SortDir;
  handleSort: (k: SortKey) => void;
}) {
  return (
    <div style={{ background: "white", borderRadius: 10, border: "1px solid #F1F5F9", overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#FAFBFF", borderBottom: "1px solid #F1F5F9" }}>
              {([
                { key: "eventNumber", label: "Nº",          w: 60,  center: true },
                { key: "name",        label: "Evento",       w: null },
                { key: null,          label: "Localização",  w: 160 },
                { key: "period",      label: "Período",      w: 140 },
                { key: "status",      label: "Status",       w: 130 },
                { key: null,          label: "Escal.",       w: 70,  center: true, tooltip: "Escalações ativas" },
                { key: null,          label: "Ações",        w: 80,  right: true },
              ] as { key: SortKey | null; label: string; w: number | null; center?: boolean; right?: boolean; tooltip?: string }[]).map((col, i) => (
                <th key={i}
                  onClick={() => col.key && handleSort(col.key)}
                  style={{
                    padding: "10px 14px", fontSize: 10, fontWeight: 700, color: "#94A3B8",
                    textTransform: "uppercase", letterSpacing: "0.07em",
                    textAlign: col.center ? "center" : col.right ? "right" : "left",
                    cursor: col.key ? "pointer" : "default",
                    userSelect: "none", width: col.w ?? undefined, whiteSpace: "nowrap",
                  }}>
                  {col.tooltip
                    ? <Tooltip><TooltipTrigger asChild><span>{col.label} {col.key && <SortBtn col={col.key} sortKey={sortKey} sortDir={sortDir} />}</span></TooltipTrigger><TooltipContent>{col.tooltip}</TooltipContent></Tooltip>
                    : <>{col.label} {col.key && <SortBtn col={col.key} sortKey={sortKey} sortDir={sortDir} />}</>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map((event, idx) => {
              const ds = getEventStatus(event);
              const sc = STATUS[ds] ?? STATUS["planejado"];
              const isDeleted = ds === "excluído";
              const isOngoing = ds === "em andamento";
              const escalacoes = escalacoesByEvent[event.id] ?? 0;
              return (
                <tr key={event.id}
                  style={{ borderTop: idx > 0 ? "1px solid #F8FAFC" : "none", background: "white", opacity: isDeleted ? 0.55 : 1, transition: "background 0.1s" }}
                  className="group hover:bg-slate-50/60">
                  <td style={{ padding: "11px 14px", textAlign: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#CBD5E1", fontVariantNumeric: "tabular-nums" }}>#{event.eventNumber}</span>
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {isOngoing && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#F97316", flexShrink: 0, animation: "pulse 2s infinite" }} />}
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{event.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#CBD5E1", fontVariationSettings: "'FILL' 1" }}>location_on</span>
                      <span style={{ fontSize: 12, color: "#64748B" }}>{event.location}</span>
                    </div>
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <span style={{ fontSize: 12, color: "#64748B", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                      {formatPeriod(event.startDate, event.endDate)}
                    </span>
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 20, background: sc.bg, color: sc.text, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: sc.dot, flexShrink: 0 }} />
                      {sc.label}
                    </span>
                  </td>
                  <td style={{ padding: "11px 14px", textAlign: "center" }}>
                    {escalacoes > 0
                      ? <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{escalacoes}</span>
                      : <span style={{ fontSize: 12, color: "#E2E8F0" }}>—</span>}
                  </td>
                  <td style={{ padding: "11px 14px", textAlign: "right" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2 }}>
                      {isDeleted ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button onClick={() => onRestore(event)} style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8" }}
                              className="hover:bg-emerald-50 hover:!text-emerald-600 transition-colors"><RotateCcw size={14} /></button>
                          </TooltipTrigger><TooltipContent>Restaurar</TooltipContent>
                        </Tooltip>
                      ) : (
                        <>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button onClick={() => onEdit(event)} style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8" }}
                                className="hover:bg-blue-50 hover:!text-[#0033CC] transition-colors"><Edit size={13} /></button>
                            </TooltipTrigger><TooltipContent>Editar</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button onClick={() => onDelete(event)} style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8" }}
                                className="hover:bg-red-50 hover:!text-red-500 transition-colors"><Trash2 size={13} /></button>
                            </TooltipTrigger><TooltipContent>Excluir</TooltipContent>
                          </Tooltip>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {events.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "48px 0" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 32, color: "#E2E8F0", display: "block", marginBottom: 8 }}>event_busy</span>
                  <p style={{ fontSize: 13, color: "#CBD5E1", margin: 0 }}>Nenhum evento encontrado.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function Events() {
  const [isModalOpen,  setIsModalOpen]  = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("default");
  const [monthFilter,  setMonthFilter]  = useState("all");
  const [yearFilter,   setYearFilter]   = useState("all");
  const [sortKey,      setSortKey]      = useState<SortKey>("eventNumber");
  const [sortDir,      setSortDir]      = useState<SortDir>("desc");
  const [defaultSort,  setDefaultSort]  = useState(true);
  const [viewMode,     setViewMode]     = useState<ViewMode>("table");
  const [calDate,      setCalDate]      = useState(new Date());
  const [confirmState, setConfirmState] = useState<{
    open: boolean; title: string; message: string; confirmLabel: string; variant?: "delete"|"cancel"|"confirm"; onConfirm: () => void;
  }>({ open: false, title: "", message: "", confirmLabel: "", variant: "delete", onConfirm: () => {} });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: events, isLoading } = useQuery<Event[]>({ queryKey: ["/api/events?includeDeleted=true"] });
  const { data: inclusions }        = useQuery<TeamInclusion[]>({ queryKey: ["/api/team-inclusions"] });

  const escalacoesByEvent = useMemo(() => {
    const map: Record<string, number> = {};
    (inclusions ?? []).forEach(inc => {
      if (!inc.eventId) return;
      map[inc.eventId] = (map[inc.eventId] ?? 0) + 1;
    });
    return map;
  }, [inclusions]);

  const stats = useMemo(() => {
    const list = events ?? [];
    return {
      total:       list.filter(e => e.status !== "excluído").length,
      planejado:   list.filter(e => getEventStatus(e) === "planejado").length,
      emAndamento: list.filter(e => getEventStatus(e) === "em andamento").length,
      concluido:   list.filter(e => getEventStatus(e) === "concluído").length,
    };
  }, [events]);

  const availableYears = useMemo(() => {
    const yrs = new Set<number>();
    (events ?? []).forEach(e => {
      try { yrs.add(new Date(e.startDate).getFullYear()); } catch {}
    });
    return Array.from(yrs).sort((a, b) => b - a);
  }, [events]);

  const handleStatusChange = (v: string) => {
    setStatusFilter(v);
    if (v === "default") { setDefaultSort(true); setSortKey("eventNumber"); setSortDir("desc"); }
  };

  const handleSort = (col: SortKey) => {
    setDefaultSort(false);
    if (sortKey === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(col); setSortDir("asc"); }
  };

  const filteredAndSorted = useMemo(() => {
    if (!events) return [];
    let list = [...events];
    const t = search.toLowerCase().trim();
    if (t) list = list.filter(e => e.name.toLowerCase().includes(t) || e.location.toLowerCase().includes(t));
    if (statusFilter === "default") list = list.filter(e => ["planejado","em andamento"].includes(getEventStatus(e)));
    else if (statusFilter === "active") list = list.filter(e => e.status !== "excluído");
    else if (statusFilter !== "all")   list = list.filter(e => getEventStatus(e) === statusFilter);
    if (monthFilter !== "all") {
      list = list.filter(e => {
        try { return new Date(e.startDate).getMonth() + 1 === Number(monthFilter); } catch { return false; }
      });
    }
    if (yearFilter !== "all") {
      list = list.filter(e => {
        try { return new Date(e.startDate).getFullYear() === Number(yearFilter); } catch { return false; }
      });
    }
    if (defaultSort) {
      const order = ["em andamento", "planejado", "concluído", "excluído"];
      list.sort((a, b) => {
        const sa = getEventStatus(a), sb = getEventStatus(b);
        const d = order.indexOf(sa) - order.indexOf(sb);
        if (d !== 0) return d;
        return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      });
    } else {
      list.sort((a, b) => {
        let va: any, vb: any;
        if (sortKey === "eventNumber") { va = a.eventNumber ?? 0; vb = b.eventNumber ?? 0; }
        else if (sortKey === "name")   { va = a.name;              vb = b.name;             }
        else if (sortKey === "period") { va = a.startDate;         vb = b.startDate;        }
        else                           { va = getEventStatus(a);   vb = getEventStatus(b);  }
        if (va < vb) return sortDir === "asc" ? -1 : 1;
        if (va > vb) return sortDir === "asc" ?  1 : -1;
        return 0;
      });
    }
    return list;
  }, [events, search, statusFilter, monthFilter, yearFilter, sortKey, sortDir, defaultSort]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/events?includeDeleted=true"] });
  };

  const deleteMutation = useMutation({
    mutationFn: async (ev: Event) => (await apiRequest("PUT", `/api/events/${ev.id}`, { status: "excluído" })).json(),
    onSuccess: async () => { await invalidate(); toast({ title: "Evento marcado como excluído." }); },
    onError: () => toast({ title: "Erro ao excluir evento.", variant: "destructive" }),
  });
  const restoreMutation = useMutation({
    mutationFn: async (ev: Event) => (await apiRequest("PUT", `/api/events/${ev.id}`, { status: "planejado" })).json(),
    onSuccess: async () => { await invalidate(); toast({ title: "Evento restaurado." }); },
    onError: () => toast({ title: "Erro ao restaurar evento.", variant: "destructive" }),
  });

  const openModal = (event?: Event) => { setEditingEvent(event ?? null); setIsModalOpen(true); };
  const closeModal = () => { setIsModalOpen(false); setEditingEvent(null); };

  const confirmDelete = (event: Event) => setConfirmState({
    open: true, title: "Excluir evento?",
    message: `O evento "${event.name}" será marcado como excluído.`,
    confirmLabel: "Excluir", variant: "delete",
    onConfirm: () => { setConfirmState(p => ({ ...p, open: false })); deleteMutation.mutate(event); },
  });
  const confirmRestore = (event: Event) => setConfirmState({
    open: true, title: "Restaurar evento?",
    message: `O evento "${event.name}" voltará ao status "Planejado".`,
    confirmLabel: "Restaurar", variant: "confirm",
    onConfirm: () => { setConfirmState(p => ({ ...p, open: false })); restoreMutation.mutate(event); },
  });

  const clearFilters = () => {
    setSearch(""); setStatusFilter("default"); setMonthFilter("all"); setYearFilter("all");
    setSortKey("eventNumber"); setSortDir("desc"); setDefaultSort(true);
  };
  const hasFilters = !!(search || statusFilter !== "default" || monthFilter !== "all" || yearFilter !== "all");

  const VIEWS: { key: ViewMode; icon: React.ElementType; label: string }[] = [
    { key: "table",    icon: LayoutList,   label: "Tabela" },
    { key: "list",     icon: List,         label: "Lista" },
    { key: "week",     icon: CalendarDays, label: "Semana" },
    { key: "calendar", icon: CalendarDays, label: "Mês" },
  ];

  return (
    <TooltipProvider>
      <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 18 }}>

        {/* ── Page header ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "#0033CC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: "white", fontVariationSettings: "'FILL' 1" }}>event</span>
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", margin: 0, lineHeight: 1.2 }}>Eventos</h1>
            <p style={{ fontSize: 12, color: "#94A3B8", margin: 0 }}>Controle e acompanhamento de cronogramas logísticos</p>
          </div>
          <button onClick={() => openModal()} data-testid="button-add-event"
            style={{ marginLeft: "auto", height: 36, padding: "0 16px", borderRadius: 8, background: "#0033CC", color: "white", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}>
            <Plus size={15} strokeWidth={2.5} />
            Novo Evento
          </button>
        </div>

        {/* ── Stat cards ── */}
        {!isLoading && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {([
              { label: "Total de Eventos", value: stats.total,       icon: LayoutList,    color: "#3B82F6" },
              { label: "Planejados",       value: stats.planejado,   icon: CalendarClock, color: "#8B5CF6" },
              { label: "Em andamento",     value: stats.emAndamento, icon: CalendarCheck, color: "#F97316" },
              { label: "Concluídos",       value: stats.concluido,   icon: CalendarX,     color: "#22C55E" },
            ] as { label: string; value: number; icon: React.ElementType; color: string }[]).map(c => {
              const Icon = c.icon;
              return (
                <div key={c.label}
                  className="bg-white rounded-2xl overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-0.5"
                  style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.05)" }}
                  onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.10), 0 8px 24px rgba(0,0,0,0.07)")}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.05)")}>
                  <div className="h-1 w-full" style={{ background: c.color }} />
                  <div className="flex items-center gap-4 px-5 py-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${c.color}18` }}>
                      <Icon style={{ width: 22, height: 22, color: c.color }} />
                    </div>
                    <div>
                      <p className="uppercase text-[11px] font-semibold tracking-widest mb-1" style={{ color: "#6B7280" }}>{c.label}</p>
                      <p className="tabular-nums font-bold leading-none" style={{ fontSize: 28, color: c.color }}>{c.value}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Filter + View toggle bar ── */}
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #F1F5F9", padding: "10px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>

            {/* Search */}
            <div style={{ position: "relative", flex: "1 1 200px", minWidth: 160 }}>
              <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#CBD5E1" }} />
              <input placeholder="Buscar por nome ou cidade..." value={search} onChange={e => setSearch(e.target.value)}
                data-testid="input-search-event"
                style={{ ...sel, paddingLeft: 28, paddingRight: search ? 28 : 8, width: "100%", flex: "none" }} />
              {search && (
                <button onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#CBD5E1", display: "flex" }}>
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Status */}
            <select value={statusFilter} onChange={e => handleStatusChange(e.target.value)} style={sel} data-testid="select-status-filter">
              <option value="default">Planejado + Em andamento</option>
              <option value="all">Todos os status</option>
              <option value="active">Ativos</option>
              <option value="planejado">Planejado</option>
              <option value="em andamento">Em andamento</option>
              <option value="concluído">Concluído</option>
              <option value="excluído">Excluído</option>
            </select>

            {/* Month */}
            <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)} style={sel}>
              <option value="all">Todos os meses</option>
              {MONTHS.map((m, i) => <option key={i + 1} value={String(i + 1)}>{m}</option>)}
            </select>

            {/* Year */}
            <select value={yearFilter} onChange={e => setYearFilter(e.target.value)} style={sel}>
              <option value="all">Todos os anos</option>
              {availableYears.map(y => <option key={y} value={String(y)}>{y}</option>)}
            </select>

            {/* Clear */}
            {hasFilters && (
              <button onClick={clearFilters} data-testid="button-clear-filters"
                style={{ ...sel, display: "flex", alignItems: "center", gap: 5, paddingLeft: 10, paddingRight: 10, color: "#64748B", cursor: "pointer" }}>
                <X size={11} /> Limpar
              </button>
            )}

            {/* Count */}
            <span style={{ fontSize: 11, color: "#94A3B8", whiteSpace: "nowrap" }}>
              {filteredAndSorted.length} evento{filteredAndSorted.length !== 1 ? "s" : ""}
            </span>

            {/* Divider */}
            <div style={{ width: 1, height: 20, background: "#F1F5F9", margin: "0 4px" }} />

            {/* View toggle */}
            <div style={{ display: "flex", gap: 2, background: "#F8FAFC", borderRadius: 7, padding: 2, border: "1px solid #F1F5F9" }}>
              {([
                { key: "table",    icon: LayoutList,   title: "Tabela" },
                { key: "list",     icon: List,         title: "Lista" },
                { key: "week",     icon: CalendarDays, title: "Semana" },
                { key: "calendar", icon: CalendarDays, title: "Mês" },
              ] as { key: ViewMode; icon: React.ElementType; title: string }[]).map(v => {
                const Icon = v.icon;
                const active = viewMode === v.key;
                return (
                  <Tooltip key={v.key}>
                    <TooltipTrigger asChild>
                      <button onClick={() => setViewMode(v.key)}
                        style={{
                          width: 28, height: 28, borderRadius: 5, border: "none", cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: active ? "white" : "transparent",
                          color: active ? "#0033CC" : "#94A3B8",
                          boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                          transition: "all 0.15s",
                        }}>
                        <Icon size={14} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{v.title}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Content ── */}
        {isLoading ? (
          <div style={{ background: "white", borderRadius: 10, border: "1px solid #F1F5F9", textAlign: "center", padding: "56px 0", color: "#CBD5E1", fontSize: 13 }}>
            Carregando eventos...
          </div>
        ) : viewMode === "table" ? (
          <TableView events={filteredAndSorted} onEdit={openModal} onDelete={confirmDelete} onRestore={confirmRestore}
            escalacoesByEvent={escalacoesByEvent} sortKey={sortKey} sortDir={sortDir} handleSort={handleSort} />
        ) : viewMode === "list" ? (
          <ListView events={filteredAndSorted} onEdit={openModal} onDelete={confirmDelete} onRestore={confirmRestore}
            escalacoesByEvent={escalacoesByEvent} />
        ) : viewMode === "calendar" ? (
          <CalendarView events={events?.filter(e => e.status !== "excluído") ?? []} onEdit={openModal} currentDate={calDate} setCurrentDate={setCalDate} />
        ) : (
          <WeekView events={events?.filter(e => e.status !== "excluído") ?? []} onEdit={openModal} currentDate={calDate} setCurrentDate={setCalDate} />
        )}

      </div>

      <EventModal open={isModalOpen} onClose={closeModal} event={editingEvent} />
      <ConfirmModal
        isOpen={confirmState.open}
        onClose={() => setConfirmState(p => ({ ...p, open: false }))}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        variant={confirmState.variant}
        onConfirm={confirmState.onConfirm}
      />
    </TooltipProvider>
  );
}
