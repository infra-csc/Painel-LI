import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Plus, Edit, Trash2, X, ChevronUp, ChevronDown, ChevronsUpDown,
  RotateCcw, Search, ChevronLeft, ChevronRight,
} from "lucide-react";
import EventModal from "@/components/modals/event-modal";
import ConfirmModal from "@/components/common/confirm-modal";
import type { Event, TeamInclusion } from "@shared/schema";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  startOfWeek, endOfWeek, isSameMonth, isSameDay, isWithinInterval,
  addMonths, subMonths, addWeeks, subWeeks, parseISO, startOfDay, endOfDay,
} from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── constants ────────────────────────────────────────────────────────────────
const BLUE = "#0033CC";

const STATUS: Record<string, { label: string; dot: string; bg: string; text: string; bar: string; border: string }> = {
  planejado:      { label: "Planejado",    dot: "#8B5CF6", bg: "#F5F3FF", text: "#6D28D9", bar: "#8B5CF6", border: "#DDD6FE" },
  "em andamento": { label: "Em andamento", dot: "#F97316", bg: "#FFF7ED", text: "#C2410C", bar: "#F97316", border: "#FED7AA" },
  concluído:      { label: "Concluído",    dot: "#22C55E", bg: "#F0FDF4", text: "#15803D", bar: "#22C55E", border: "#BBF7D0" },
  excluído:       { label: "Excluído",     dot: "#94A3B8", bg: "#F8FAFC", text: "#64748B", bar: "#CBD5E1", border: "#E2E8F0" },
};

const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const WEEK_SHORT = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

// ─── helpers ──────────────────────────────────────────────────────────────────
function getEventStatus(ev: Event): string {
  if (ev.status === "excluído") return "excluído";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end   = new Date(ev.endDate);   end.setHours(0, 0, 0, 0);
  const start = new Date(ev.startDate); start.setHours(0, 0, 0, 0);
  if (end < today)    return "concluído";
  if (start <= today) return "em andamento";
  return ev.status;
}

function formatPeriod(s: string, e: string) {
  try {
    const d1 = new Date(s), d2 = new Date(e);
    if (d1.toDateString() === d2.toDateString()) return format(d1, "dd/MM/yy");
    const sm = d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();
    return sm ? `${format(d1, "dd")}–${format(d2, "dd/MM/yy")}` : `${format(d1, "dd/MM")} – ${format(d2, "dd/MM/yy")}`;
  } catch { return `${s} – ${e}`; }
}

function eventsOnDay(events: Event[], day: Date) {
  return events.filter(ev => {
    try {
      return isWithinInterval(day, { start: startOfDay(parseISO(ev.startDate)), end: endOfDay(parseISO(ev.endDate)) });
    } catch { return false; }
  });
}

type SortKey  = "eventNumber" | "name" | "period" | "status";
type SortDir  = "asc" | "desc";
type ViewMode = "table" | "list" | "week" | "calendar";

// ─── StatusBadge ──────────────────────────────────────────────────────────────
function StatusBadge({ ds }: { ds: string }) {
  const sc = STATUS[ds] ?? STATUS["planejado"];
  const isPulsing = ds === "em andamento";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "3px 10px", borderRadius: 20,
      background: sc.bg, color: sc.text,
      border: `1px solid ${sc.border}`,
      fontSize: 10, fontWeight: 700, whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: sc.dot, flexShrink: 0 }}
        className={isPulsing ? "animate-pulse" : ""} />
      {sc.label}
    </span>
  );
}

// ─── SortBtn ──────────────────────────────────────────────────────────────────
function SortBtn({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown size={10} className="ml-1 inline opacity-20" />;
  return sortDir === "asc"
    ? <ChevronUp   size={10} className="ml-1 inline" style={{ color: BLUE }} />
    : <ChevronDown size={10} className="ml-1 inline" style={{ color: BLUE }} />;
}

// ─── NavBtn ───────────────────────────────────────────────────────────────────
function NavBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      width: 30, height: 30, borderRadius: 7, border: "1px solid #E2E8F0",
      background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
      color: "#64748B", transition: "all 0.15s",
    }} className="hover:border-[#0033CC] hover:text-[#0033CC] hover:bg-blue-50 transition-all">
      {children}
    </button>
  );
}

// ─── EventChip ────────────────────────────────────────────────────────────────
function EventChip({ ev, onClick }: { ev: Event; onClick: () => void }) {
  const ds = getEventStatus(ev);
  const sc = STATUS[ds] ?? STATUS["planejado"];
  return (
    <button onClick={onClick} title={`${ev.name} · ${ev.location}`} style={{
      width: "100%", textAlign: "left", padding: "3px 7px",
      borderRadius: 5, background: sc.bg,
      borderLeft: `3px solid ${sc.bar}`,
      fontSize: 10, fontWeight: 600, color: sc.text,
      cursor: "pointer", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
      fontFamily: "inherit", display: "block", lineHeight: "16px",
    }}>{ev.name}</button>
  );
}

// ─── CalendarView ─────────────────────────────────────────────────────────────
function CalendarView({ events, onEdit, currentDate, setCurrentDate }: {
  events: Event[]; onEdit: (e: Event) => void; currentDate: Date; setCurrentDate: (d: Date) => void;
}) {
  const monthStart = startOfMonth(currentDate);
  const calStart   = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd     = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 });
  const days       = eachDayOfInterval({ start: calStart, end: calEnd });
  const today      = new Date();

  return (
    <div style={{ background: "white", borderRadius: 12, border: "1px solid #F1F5F9", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
      {/* Nav */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid #F1F5F9", background: "#FAFBFF" }}>
        <NavBtn onClick={() => setCurrentDate(subMonths(currentDate, 1))}><ChevronLeft size={14} /></NavBtn>
        <span style={{ flex: 1, textAlign: "center", fontSize: 14, fontWeight: 700, color: "#0F172A", textTransform: "capitalize" }}>
          {format(currentDate, "MMMM yyyy", { locale: ptBR })}
        </span>
        <button onClick={() => setCurrentDate(new Date())} style={{
          height: 28, padding: "0 12px", borderRadius: 6, border: "1px solid #E2E8F0",
          background: "white", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#64748B", fontFamily: "inherit",
        }} className="hover:border-[#0033CC] hover:text-[#0033CC] transition-colors">Hoje</button>
        <NavBtn onClick={() => setCurrentDate(addMonths(currentDate, 1))}><ChevronRight size={14} /></NavBtn>
      </div>

      {/* Weekday headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid #F1F5F9" }}>
        {WEEK_SHORT.map((d, i) => (
          <div key={d} style={{
            padding: "8px 0", textAlign: "center",
            fontSize: 10, fontWeight: 700, color: i === 0 ? "#F87171" : "#94A3B8",
            textTransform: "uppercase", letterSpacing: "0.07em",
          }}>{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {days.map((day, i) => {
          const inMonth  = isSameMonth(day, currentDate);
          const isToday  = isSameDay(day, today);
          const isSun    = day.getDay() === 0;
          const chips    = eventsOnDay(events, day);
          const MAX      = 2;
          return (
            <div key={i} style={{
              minHeight: 88, padding: "6px 5px",
              borderRight: (i + 1) % 7 !== 0 ? "1px solid #F8FAFC" : "none",
              borderBottom: i < days.length - 7 ? "1px solid #F8FAFC" : "none",
              background: isToday ? "#F0F4FF" : "white",
              opacity: inMonth ? 1 : 0.3,
            }}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
                <span style={{
                  width: 22, height: 22, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: isToday ? 700 : 400,
                  color: isToday ? "white" : isSun && inMonth ? "#F87171" : inMonth ? "#374151" : "#CBD5E1",
                  background: isToday ? BLUE : "transparent",
                }}>{format(day, "d")}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {chips.slice(0, MAX).map(ev => <EventChip key={ev.id} ev={ev} onClick={() => onEdit(ev)} />)}
                {chips.length > MAX && (
                  <span style={{ fontSize: 9, color: "#94A3B8", fontWeight: 600, paddingLeft: 5 }}>+{chips.length - MAX} mais</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── WeekView ─────────────────────────────────────────────────────────────────
function WeekView({ events, onEdit, currentDate, setCurrentDate }: {
  events: Event[]; onEdit: (e: Event) => void; currentDate: Date; setCurrentDate: (d: Date) => void;
}) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekEnd   = endOfWeek(currentDate,   { weekStartsOn: 0 });
  const days      = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const today     = new Date();

  const rangeLabel = weekStart.getMonth() === weekEnd.getMonth()
    ? `${format(weekStart, "d")}–${format(weekEnd, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}`
    : `${format(weekStart, "d MMM", { locale: ptBR })} – ${format(weekEnd, "d MMM yyyy", { locale: ptBR })}`;

  return (
    <div style={{ background: "white", borderRadius: 12, border: "1px solid #F1F5F9", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
      {/* Nav */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid #F1F5F9", background: "#FAFBFF" }}>
        <NavBtn onClick={() => setCurrentDate(subWeeks(currentDate, 1))}><ChevronLeft size={14} /></NavBtn>
        <span style={{ flex: 1, textAlign: "center", fontSize: 13, fontWeight: 700, color: "#0F172A", textTransform: "capitalize" }}>{rangeLabel}</span>
        <button onClick={() => setCurrentDate(new Date())} style={{
          height: 28, padding: "0 12px", borderRadius: 6, border: "1px solid #E2E8F0",
          background: "white", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#64748B", fontFamily: "inherit",
        }} className="hover:border-[#0033CC] hover:text-[#0033CC] transition-colors">Hoje</button>
        <NavBtn onClick={() => setCurrentDate(addWeeks(currentDate, 1))}><ChevronRight size={14} /></NavBtn>
      </div>

      {/* Columns */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {days.map((day, i) => {
          const isToday = isSameDay(day, today);
          const isSun   = i === 0;
          const chips   = eventsOnDay(events, day);
          return (
            <div key={i} style={{ borderRight: i < 6 ? "1px solid #F1F5F9" : "none", minHeight: 160 }}>
              {/* Column header */}
              <div style={{
                padding: "10px 6px", textAlign: "center",
                borderBottom: "1px solid #F1F5F9",
                background: isToday ? "#F0F4FF" : "#FAFBFF",
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: isToday ? BLUE : isSun ? "#F87171" : "#94A3B8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>
                  {WEEK_SHORT[i]}
                </div>
                <div style={{
                  width: 30, height: 30, borderRadius: "50%", margin: "0 auto",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: isToday ? BLUE : "transparent",
                  fontSize: 14, fontWeight: 700,
                  color: isToday ? "white" : isSun ? "#F87171" : "#374151",
                }}>{format(day, "d")}</div>
              </div>
              {/* Chips */}
              <div style={{ padding: "8px 5px", display: "flex", flexDirection: "column", gap: 3 }}>
                {chips.length === 0 && <div style={{ height: 32 }} />}
                {chips.map(ev => <EventChip key={ev.id} ev={ev} onClick={() => onEdit(ev)} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── ActionBtns ───────────────────────────────────────────────────────────────
function ActionBtns({ event, onEdit, onDelete, onRestore }: {
  event: Event; onEdit: (e: Event) => void; onDelete: (e: Event) => void; onRestore: (e: Event) => void;
}) {
  const ds = getEventStatus(event);
  if (ds === "excluído") return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button onClick={() => onRestore(event)} style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8" }}
          className="hover:bg-emerald-50 hover:!text-emerald-600 transition-colors"><RotateCcw size={13} /></button>
      </TooltipTrigger><TooltipContent>Restaurar</TooltipContent>
    </Tooltip>
  );
  return (
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
  );
}

// ─── ListView ─────────────────────────────────────────────────────────────────
function ListView({ events, onEdit, onDelete, onRestore, escalacoes }: {
  events: Event[]; onEdit: (e: Event) => void; onDelete: (e: Event) => void;
  onRestore: (e: Event) => void; escalacoes: Record<string, number>;
}) {
  if (events.length === 0) return <EmptyState />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {events.map(ev => {
        const ds  = getEventStatus(ev);
        const sc  = STATUS[ds] ?? STATUS["planejado"];
        const esc = escalacoes[ev.id] ?? 0;
        return (
          <div key={ev.id} style={{
            background: "white", borderRadius: 10, overflow: "hidden",
            display: "flex", alignItems: "stretch",
            opacity: ds === "excluído" ? 0.6 : 1,
            boxShadow: "0 1px 4px rgba(0,0,0,0.05), 0 2px 8px rgba(0,0,0,0.03)",
            transition: "box-shadow 0.2s, transform 0.15s",
          }} className="group hover:shadow-md hover:-translate-y-px">
            <div style={{ width: 4, background: sc.bar, flexShrink: 0 }} />
            <div style={{ flex: 1, padding: "11px 14px", display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#D1D5DB", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>#{ev.eventNumber}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {ds === "em andamento" && <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "#F97316", flexShrink: 0 }} />}
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.name}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 2 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "#94A3B8" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 12, fontVariationSettings: "'FILL' 1" }}>location_on</span>
                    {ev.location}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "#94A3B8" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 12, fontVariationSettings: "'FILL' 1" }}>calendar_month</span>
                    {formatPeriod(ev.startDate, ev.endDate)}
                  </span>
                  {esc > 0 && (
                    <span style={{ fontSize: 11, color: "#94A3B8" }}>
                      <b style={{ color: "#374151" }}>{esc}</b> escal.
                    </span>
                  )}
                </div>
              </div>
              <StatusBadge ds={ds} />
              <div style={{ display: "flex", gap: 1, flexShrink: 0 }}>
                <ActionBtns event={ev} onEdit={onEdit} onDelete={onDelete} onRestore={onRestore} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── TableView ────────────────────────────────────────────────────────────────
function TableView({ events, onEdit, onDelete, onRestore, escalacoes, sortKey, sortDir, handleSort }: {
  events: Event[]; onEdit: (e: Event) => void; onDelete: (e: Event) => void; onRestore: (e: Event) => void;
  escalacoes: Record<string, number>; sortKey: SortKey; sortDir: SortDir; handleSort: (k: SortKey) => void;
}) {
  return (
    <div style={{ background: "white", borderRadius: 12, border: "1px solid #F1F5F9", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#FAFBFF", borderBottom: "2px solid #F1F5F9" }}>
              {([
                { key: "eventNumber", label: "Nº",          w: 60,  center: true },
                { key: "name",        label: "Evento",       w: null },
                { key: null,          label: "Localização",  w: 170 },
                { key: "period",      label: "Período",      w: 140 },
                { key: "status",      label: "Status",       w: 135 },
                { key: null,          label: "Escal.",       w: 65,  center: true, tip: "Escalações ativas" },
                { key: null,          label: "",             w: 75,  right: true },
              ] as any[]).map((col, i) => (
                <th key={i} onClick={() => col.key && handleSort(col.key)} style={{
                  padding: "10px 14px", fontSize: 10, fontWeight: 700, color: "#94A3B8",
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  textAlign: col.center ? "center" : col.right ? "right" : "left",
                  cursor: col.key ? "pointer" : "default", userSelect: "none",
                  width: col.w ?? undefined, whiteSpace: "nowrap",
                }}>
                  {col.tip
                    ? <Tooltip><TooltipTrigger><span>{col.label} {col.key && <SortBtn col={col.key} sortKey={sortKey} sortDir={sortDir} />}</span></TooltipTrigger><TooltipContent>{col.tip}</TooltipContent></Tooltip>
                    : <>{col.label}{col.key && <SortBtn col={col.key} sortKey={sortKey} sortDir={sortDir} />}</>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map((ev, idx) => {
              const ds  = getEventStatus(ev);
              const sc  = STATUS[ds] ?? STATUS["planejado"];
              const esc = escalacoes[ev.id] ?? 0;
              return (
                <tr key={ev.id} style={{
                  borderTop: idx > 0 ? "1px solid #F8FAFC" : "none",
                  opacity: ds === "excluído" ? 0.5 : 1, transition: "background 0.1s",
                }} className="group hover:bg-slate-50/70">
                  <td style={{ padding: "12px 14px", textAlign: "center" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#D1D5DB", fontVariantNumeric: "tabular-nums" }}>#{ev.eventNumber}</span>
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {ds === "em andamento" && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#F97316", flexShrink: 0, animation: "pulse 2s infinite" }} />}
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{ev.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#64748B" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#CBD5E1", fontVariationSettings: "'FILL' 1" }}>location_on</span>
                      {ev.location}
                    </span>
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{ fontSize: 12, color: "#64748B", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                      {formatPeriod(ev.startDate, ev.endDate)}
                    </span>
                  </td>
                  <td style={{ padding: "12px 14px" }}><StatusBadge ds={ds} /></td>
                  <td style={{ padding: "12px 14px", textAlign: "center" }}>
                    {esc > 0
                      ? <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{esc}</span>
                      : <span style={{ fontSize: 12, color: "#E2E8F0" }}>—</span>}
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 1 }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                      <ActionBtns event={ev} onEdit={onEdit} onDelete={onDelete} onRestore={onRestore} />
                    </div>
                  </td>
                </tr>
              );
            })}
            {events.length === 0 && (
              <tr><td colSpan={7}><EmptyState /></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ textAlign: "center", padding: "52px 0" }}>
      <span className="material-symbols-outlined" style={{ fontSize: 36, color: "#E2E8F0", display: "block", marginBottom: 10 }}>event_busy</span>
      <p style={{ fontSize: 13, color: "#CBD5E1", margin: 0 }}>Nenhum evento encontrado.</p>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
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
    open: boolean; title: string; message: string; confirmLabel: string;
    variant?: "delete"|"cancel"|"confirm"; onConfirm: () => void;
  }>({ open: false, title: "", message: "", confirmLabel: "", variant: "delete", onConfirm: () => {} });

  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: events, isLoading } = useQuery<Event[]>({ queryKey: ["/api/events?includeDeleted=true"] });
  const { data: inclusions }        = useQuery<TeamInclusion[]>({ queryKey: ["/api/team-inclusions"] });

  const escalacoes = useMemo(() => {
    const map: Record<string, number> = {};
    (inclusions ?? []).forEach(i => { if (i.eventId) map[i.eventId] = (map[i.eventId] ?? 0) + 1; });
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
    (events ?? []).forEach(e => { try { yrs.add(new Date(e.startDate).getFullYear()); } catch {} });
    return Array.from(yrs).sort((a, b) => b - a);
  }, [events]);

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
    if (statusFilter === "default")      list = list.filter(e => ["planejado","em andamento"].includes(getEventStatus(e)));
    else if (statusFilter === "active")  list = list.filter(e => e.status !== "excluído");
    else if (statusFilter !== "all")     list = list.filter(e => getEventStatus(e) === statusFilter);
    if (monthFilter !== "all") list = list.filter(e => { try { return new Date(e.startDate).getMonth() + 1 === Number(monthFilter); } catch { return false; } });
    if (yearFilter  !== "all") list = list.filter(e => { try { return new Date(e.startDate).getFullYear() === Number(yearFilter); } catch { return false; } });
    if (defaultSort) {
      const order = ["em andamento","planejado","concluído","excluído"];
      list.sort((a, b) => {
        const d = order.indexOf(getEventStatus(a)) - order.indexOf(getEventStatus(b));
        return d !== 0 ? d : new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
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
    await qc.invalidateQueries({ queryKey: ["/api/events"] });
    await qc.invalidateQueries({ queryKey: ["/api/events?includeDeleted=true"] });
  };

  const deleteMutation = useMutation({
    mutationFn: async (ev: Event) => (await apiRequest("PUT", `/api/events/${ev.id}`, { status: "excluído" })).json(),
    onSuccess: async () => { await invalidate(); toast({ title: "Evento marcado como excluído." }); },
    onError: () => toast({ title: "Erro ao excluir.", variant: "destructive" }),
  });
  const restoreMutation = useMutation({
    mutationFn: async (ev: Event) => (await apiRequest("PUT", `/api/events/${ev.id}`, { status: "planejado" })).json(),
    onSuccess: async () => { await invalidate(); toast({ title: "Evento restaurado." }); },
    onError: () => toast({ title: "Erro ao restaurar.", variant: "destructive" }),
  });

  const openModal    = (ev?: Event) => { setEditingEvent(ev ?? null); setIsModalOpen(true); };
  const closeModal   = () => { setIsModalOpen(false); setEditingEvent(null); };

  const confirmDelete  = (ev: Event) => setConfirmState({ open: true, title: "Excluir evento?", message: `"${ev.name}" será marcado como excluído.`, confirmLabel: "Excluir", variant: "delete", onConfirm: () => { setConfirmState(p => ({ ...p, open: false })); deleteMutation.mutate(ev); } });
  const confirmRestore = (ev: Event) => setConfirmState({ open: true, title: "Restaurar evento?", message: `"${ev.name}" voltará ao status Planejado.`, confirmLabel: "Restaurar", variant: "confirm", onConfirm: () => { setConfirmState(p => ({ ...p, open: false })); restoreMutation.mutate(ev); } });

  const hasFilters = !!(search || statusFilter !== "default" || monthFilter !== "all" || yearFilter !== "all");
  const clearFilters = () => { setSearch(""); setStatusFilter("default"); setMonthFilter("all"); setYearFilter("all"); setSortKey("eventNumber"); setSortDir("desc"); setDefaultSort(true); };

  const VIEWS = [
    { key: "table"    as ViewMode, icon: <span className="material-symbols-outlined" style={{ fontSize: 16 }}>format_align_justify</span>, title: "Tabela"  },
    { key: "list"     as ViewMode, icon: <span className="material-symbols-outlined" style={{ fontSize: 16 }}>view_list</span>,            title: "Lista"   },
    { key: "week"     as ViewMode, icon: <span className="material-symbols-outlined" style={{ fontSize: 16 }}>calendar_view_week</span>,   title: "Semana"  },
    { key: "calendar" as ViewMode, icon: <span className="material-symbols-outlined" style={{ fontSize: 16 }}>calendar_month</span>,       title: "Mês"     },
  ];

  const activeEvents = (events ?? []).filter(e => e.status !== "excluído");

  return (
    <TooltipProvider>
      <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 20, minHeight: "100%" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: BLUE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 4px 12px rgba(0,51,204,0.25)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: "white", fontVariationSettings: "'FILL' 1" }}>event</span>
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", margin: 0, lineHeight: 1.2, letterSpacing: "-0.3px" }}>Eventos</h1>
            <p style={{ fontSize: 12, color: "#94A3B8", margin: 0 }}>Controle e acompanhamento de cronogramas logísticos</p>
          </div>
          <button onClick={() => openModal()} data-testid="button-add-event" style={{
            marginLeft: "auto", height: 36, padding: "0 16px", borderRadius: 8,
            background: BLUE, color: "white", border: "none", cursor: "pointer",
            fontFamily: "inherit", fontSize: 13, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 7,
            boxShadow: "0 4px 12px rgba(0,51,204,0.25)",
          }}>
            <Plus size={15} strokeWidth={2.5} /> Novo Evento
          </button>
        </div>

        {/* ── Stat cards ── */}
        {!isLoading && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
            {([
              { label: "Total",        value: stats.total,       icon: "view_list",        color: "#3B82F6", filter: "active"       },
              { label: "Planejados",   value: stats.planejado,   icon: "calendar_today",   color: "#8B5CF6", filter: "planejado"    },
              { label: "Em andamento", value: stats.emAndamento, icon: "event_available",  color: "#F97316", filter: "em andamento" },
              { label: "Concluídos",   value: stats.concluido,   icon: "event_busy",       color: "#22C55E", filter: "concluído"    },
            ] as { label: string; value: number; icon: string; color: string; filter: string }[]).map(c => {
              const isActive = statusFilter === c.filter;
              return (
                <button key={c.label} onClick={() => {
                  setStatusFilter(c.filter);
                  setDefaultSort(false);
                }} style={{
                  background: isActive ? `${c.color}0D` : "white",
                  borderRadius: 12, overflow: "hidden",
                  boxShadow: isActive ? `0 0 0 2px ${c.color}40, 0 4px 12px ${c.color}18` : "0 1px 4px rgba(0,0,0,0.06)",
                  borderTop: `3px solid ${c.color}`,
                  padding: "16px 20px",
                  display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                  transition: "all 0.18s",
                  cursor: "pointer", fontFamily: "inherit",
                  border: `none`,
                  borderTopWidth: 3, borderTopStyle: "solid", borderTopColor: c.color,
                  outline: isActive ? `2px solid ${c.color}50` : "none",
                  outlineOffset: -2,
                  width: "100%", textAlign: "left",
                }} className={`hover:-translate-y-0.5 ${isActive ? "" : "hover:shadow-md"}`}>
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 700, color: isActive ? c.color : "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 4px", transition: "color 0.18s" }}>{c.label}</p>
                    <p style={{ fontSize: 26, fontWeight: 800, color: c.color, margin: 0, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{c.value}</p>
                  </div>
                  <span className="material-symbols-outlined" style={{ fontSize: 32, color: isActive ? `${c.color}99` : `${c.color}33`, fontVariationSettings: "'FILL' 1", transition: "color 0.18s" }}>{c.icon}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Filter + view bar ── */}
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #F1F5F9", padding: "10px 12px", boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>

            {/* Search */}
            <div style={{ position: "relative", flex: "1 1 180px", minWidth: 150 }}>
              <Search size={12} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#CBD5E1" }} />
              <input placeholder="Buscar evento ou cidade..." value={search} onChange={e => setSearch(e.target.value)}
                data-testid="input-search-event"
                style={{ height: 32, fontSize: 12, paddingLeft: 28, paddingRight: search ? 28 : 8, border: "1px solid #E2E8F0", borderRadius: 7, background: "#FAFBFF", color: "#374151", fontFamily: "inherit", cursor: "text", outline: "none", width: "100%", boxSizing: "border-box" }} />
              {search && (
                <button onClick={() => setSearch("")} style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#CBD5E1", display: "flex" }}><X size={11} /></button>
              )}
            </div>

            {/* Selects */}
            {([
              { val: statusFilter, set: (v: string) => { setStatusFilter(v); if (v === "default") { setDefaultSort(true); setSortKey("eventNumber"); setSortDir("desc"); } },
                opts: [["default","Planejado + Em andamento"],["all","Todos os status"],["active","Ativos"],["planejado","Planejado"],["em andamento","Em andamento"],["concluído","Concluído"],["excluído","Excluído"]],
                test: "select-status-filter" },
              { val: monthFilter, set: setMonthFilter,
                opts: [["all","Todos os meses"], ...MONTHS.map((m,i) => [String(i+1), m])],
                test: undefined },
              { val: yearFilter, set: setYearFilter,
                opts: [["all","Todos os anos"], ...availableYears.map(y => [String(y), String(y)])],
                test: undefined },
            ] as any[]).map((s, i) => (
              <select key={i} value={s.val} onChange={e => s.set(e.target.value)} data-testid={s.test}
                style={{ height: 32, fontSize: 12, padding: "0 8px", border: "1px solid #E2E8F0", borderRadius: 7, background: "#FAFBFF", color: "#374151", fontFamily: "inherit", cursor: "pointer", outline: "none" }}>
                {s.opts.map(([v, l]: [string, string]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ))}

            {hasFilters && (
              <button onClick={clearFilters} data-testid="button-clear-filters"
                style={{ height: 32, padding: "0 10px", border: "none", borderRadius: 7, background: "transparent", color: "#004ac6", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}
                className="hover:text-blue-800 transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>filter_alt_off</span>
                Limpar Filtros
              </button>
            )}

            <span style={{ fontSize: 11, color: "#CBD5E1", marginLeft: "auto", whiteSpace: "nowrap" }}>
              {filteredAndSorted.length} evento{filteredAndSorted.length !== 1 ? "s" : ""}
            </span>

            <div style={{ width: 1, height: 18, background: "#F1F5F9" }} />

            {/* View toggle */}
            <div style={{ display: "flex", background: "#F1F5F9", borderRadius: 7, padding: 2, gap: 1 }}>
              {VIEWS.map(v => {
                const active = viewMode === v.key;
                return (
                  <Tooltip key={v.key}>
                    <TooltipTrigger asChild>
                      <button onClick={() => setViewMode(v.key)} style={{
                        width: 28, height: 28, borderRadius: 5, border: "none", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: active ? "white" : "transparent",
                        color: active ? BLUE : "#94A3B8",
                        boxShadow: active ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
                        transition: "all 0.15s",
                      }}>{v.icon}</button>
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
          <div style={{ background: "white", borderRadius: 12, border: "1px solid #F1F5F9", padding: "64px 0", textAlign: "center", color: "#CBD5E1", fontSize: 13 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28, display: "block", marginBottom: 10, animation: "pulse 1.5s infinite" }}>sync</span>
            Carregando eventos...
          </div>
        ) : viewMode === "table" ? (
          <TableView events={filteredAndSorted} onEdit={openModal} onDelete={confirmDelete} onRestore={confirmRestore}
            escalacoes={escalacoes} sortKey={sortKey} sortDir={sortDir} handleSort={handleSort} />
        ) : viewMode === "list" ? (
          <ListView events={filteredAndSorted} onEdit={openModal} onDelete={confirmDelete} onRestore={confirmRestore}
            escalacoes={escalacoes} />
        ) : viewMode === "calendar" ? (
          <CalendarView events={activeEvents} onEdit={openModal} currentDate={calDate} setCurrentDate={setCalDate} />
        ) : (
          <WeekView events={activeEvents} onEdit={openModal} currentDate={calDate} setCurrentDate={setCalDate} />
        )}
      </div>

      <EventModal open={isModalOpen} onClose={closeModal} event={editingEvent} />
      <ConfirmModal
        isOpen={confirmState.open}
        onClose={() => setConfirmState(p => ({ ...p, open: false }))}
        title={confirmState.title} message={confirmState.message}
        confirmLabel={confirmState.confirmLabel} variant={confirmState.variant}
        onConfirm={confirmState.onConfirm}
      />
    </TooltipProvider>
  );
}
