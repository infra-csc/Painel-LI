import { useState, useMemo, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { listaDeVagasQuery, recorteDaListaDeVagas } from "@/hooks/use-vaga-acoes";
import { isSuggestionInclusion } from "@shared/scaling-validation-rules";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  Plus, Edit, Trash2, X, ChevronUp, ChevronDown, ChevronsUpDown,
  RotateCcw, Search, ChevronLeft, ChevronRight, CalendarDays, CalendarX2, CloudOff, MapPin, FilterX, AlignJustify, List, CalendarRange, Calendar, CalendarCheck, CalendarX,
} from "lucide-react";
import EventModal from "@/components/modals/event-modal";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { StatusBadge as StatusBadgeBase } from "@/components/common/status-badge";
import { PageHeader } from "@/components/common/page-header";
import { PageContainer } from "@/components/common/page-container";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { usePageTitle } from "@/components/common/use-page-title";
import { Button } from "@/components/ui/button";
import type { Event, TeamInclusion } from "@shared/schema";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  startOfWeek, endOfWeek, isSameMonth, isSameDay, isWithinInterval,
  addMonths, subMonths, addWeeks, subWeeks, startOfDay, endOfDay,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { STATUS, getEventStatus, parseLocalDate } from "@/lib/event-status";

// ─── constants ────────────────────────────────────────────────────────────────
const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const WEEK_SHORT = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

/** Classe compartilhada dos <select> nativos da barra de filtros. */
const SELECT_CLASS = "h-8 text-xs px-2 border border-input rounded-md bg-muted/40 text-foreground cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring";
/** Botão-ícone de navegação (mês/semana). */
const NAV_BTN = "flex items-center justify-center w-8 h-8 rounded-full text-foreground hover:bg-brand-soft transition-colors";
/** Botão-ícone de ação nas linhas. */
const ACTION_BTN = "flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

// ─── helpers ──────────────────────────────────────────────────────────────────
// STATUS, getEventStatus e parseLocalDate vivem em @/lib/event-status —
// compartilhados com o Calendário para que status e paleta nunca divirjam.

function formatPeriod(s: string, e: string) {
  const d1 = parseLocalDate(s), d2 = parseLocalDate(e);
  if (!d1 || !d2) return `${s} – ${e}`;
  if (d1.toDateString() === d2.toDateString()) return format(d1, "dd/MM/yy");
  const sm = d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();
  return sm ? `${format(d1, "dd")}–${format(d2, "dd/MM/yy")}` : `${format(d1, "dd/MM")} – ${format(d2, "dd/MM/yy")}`;
}

function eventsOnDay(events: Event[], day: Date) {
  return events.filter(ev => {
    const start = parseLocalDate(ev.startDate);
    const end   = parseLocalDate(ev.endDate);
    if (!start || !end || end < start) return false;
    return isWithinInterval(day, { start: startOfDay(start), end: endOfDay(end) });
  });
}

type SortKey  = "eventNumber" | "name" | "period" | "status";
type SortDir  = "asc" | "desc";
type ViewMode = "table" | "list" | "week" | "calendar";

// ─── StatusBadge ──────────────────────────────────────────────────────────────
// StatusBadge único (23/09): o tom vem de lib/event-status (planejado = info,
// em andamento = primary, concluído = success, excluído = neutral).
function StatusBadge({ ds }: { ds: string }) {
  const sc = STATUS[ds] ?? STATUS["planejado"];
  return (
    <StatusBadgeBase tone={sc.tone} dot pulse={sc.pulse}>
      {sc.label}
    </StatusBadgeBase>
  );
}

// ─── SortBtn ──────────────────────────────────────────────────────────────────
function SortBtn({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown size={10} className="ml-1 inline opacity-20" />;
  return sortDir === "asc"
    ? <ChevronUp   size={10} className="ml-1 inline text-primary" />
    : <ChevronDown size={10} className="ml-1 inline text-primary" />;
}

// ─── EventChip ────────────────────────────────────────────────────────────────
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

// ─── Nav header (mês/semana) ──────────────────────────────────────────────────
function PeriodNav({ label, onPrev, onNext, onToday, prevLabel, nextLabel, size = "lg" }: {
  label: string; onPrev: () => void; onNext: () => void; onToday: () => void;
  prevLabel: string; nextLabel: string; size?: "lg" | "md";
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-7 py-4 sm:py-5 border-b border-border">
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        <h2 className={cn("m-0 font-extrabold text-foreground tracking-tight capitalize truncate", size === "lg" ? "text-lg" : "text-base")}>
          {label}
        </h2>
        <div className="flex gap-0.5 shrink-0">
          <button type="button" onClick={onPrev} aria-label={prevLabel} className={NAV_BTN}><ChevronLeft size={16} /></button>
          <button type="button" onClick={onNext} aria-label={nextLabel} className={NAV_BTN}><ChevronRight size={16} /></button>
        </div>
      </div>
      <Button type="button" variant="outline" size="sm" className="h-8 text-xs font-bold hover:border-primary hover:text-primary hover:bg-brand-soft" onClick={onToday}>
        Hoje
      </Button>
    </div>
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
              const inMonth  = isSameMonth(day, currentDate);
              const isToday  = isSameDay(day, today);
              const chips    = eventsOnDay(events, day);
              const MAX      = 3;
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
            const chips   = eventsOnDay(events, day);
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

// ─── ActionBtns ───────────────────────────────────────────────────────────────
function ActionBtns({ event, onEdit, onDelete, onRestore, busy }: {
  event: Event; onEdit: (e: Event) => void; onDelete?: (e: Event) => void; onRestore: (e: Event) => void; busy?: boolean;
}) {
  const ds = getEventStatus(event);
  if (ds === "excluído") return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" onClick={() => onRestore(event)} disabled={busy} aria-label={`Restaurar evento ${event.name}`}
          className={cn(ACTION_BTN, "hover:bg-success-soft hover:text-success")}><RotateCcw size={13} /></button>
      </TooltipTrigger><TooltipContent>Restaurar</TooltipContent>
    </Tooltip>
  );
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" onClick={() => onEdit(event)} aria-label={`Editar evento ${event.name}`}
            className={cn(ACTION_BTN, "hover:bg-brand-soft hover:text-primary")}><Edit size={13} /></button>
        </TooltipTrigger><TooltipContent>Editar</TooltipContent>
      </Tooltip>
      {/* Excluir: só administrador (18/09). Sem a função, o botão não aparece. */}
      {onDelete && <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" onClick={() => onDelete?.(event)} disabled={busy} aria-label={`Excluir evento ${event.name}`}
            className={cn(ACTION_BTN, "hover:bg-danger-soft hover:text-danger-strong")}><Trash2 size={13} /></button>
        </TooltipTrigger><TooltipContent>Excluir</TooltipContent>
      </Tooltip>}
    </>
  );
}

// ─── Empty (contextual) ───────────────────────────────────────────────────────
function EventsEmpty({ hasFilters, onClear, onNew }: { hasFilters: boolean; onClear: () => void; onNew: () => void }) {
  return hasFilters ? (
    <EmptyState
      variant="filtered"
      icon={CalendarX2}
      title="Nenhum evento encontrado"
      description="Nenhum evento corresponde à busca ou aos filtros aplicados."
      onClearFilters={onClear}
    />
  ) : (
    <EmptyState
      icon={CalendarDays}
      title="Nenhum evento cadastrado"
      description="Crie o primeiro evento para começar a montar o cronograma logístico."
      action={<Button size="sm" onClick={onNew}><Plus className="w-4 h-4" /> Novo Evento</Button>}
    />
  );
}

// ─── ListView ─────────────────────────────────────────────────────────────────
function ListView({ events, onEdit, onDelete, onRestore, escalacoes, busy, empty }: {
  events: Event[]; onEdit: (e: Event) => void; onDelete?: (e: Event) => void;
  onRestore: (e: Event) => void; escalacoes: Record<string, number>; busy?: boolean; empty: React.ReactNode;
}) {
  if (events.length === 0) return <>{empty}</>;
  return (
    <div className="flex flex-col gap-1.5">
      {events.map(ev => {
        const ds  = getEventStatus(ev);
        const sc  = STATUS[ds] ?? STATUS["planejado"];
        const esc = escalacoes[ev.id] ?? 0;
        return (
          <div
            key={ev.id}
            className={cn(
              "group flex items-stretch bg-card rounded-lg overflow-hidden border border-border shadow-1 transition-[box-shadow,transform] hover:shadow-2 hover:-translate-y-px",
              ds === "excluído" && "opacity-60",
            )}
          >
            <div className={cn("w-1 shrink-0", sc.tw.bar)} />
            <div className="flex-1 flex flex-wrap sm:flex-nowrap items-center gap-x-3.5 gap-y-2 min-w-0 px-3.5 py-[11px]">
              <span className="text-2xs font-bold text-muted-foreground shrink-0 tabular-nums">#{ev.eventNumber}</span>
              <div className="flex-1 min-w-0 basis-full sm:basis-auto order-last sm:order-none">
                <div className="flex items-center gap-1.5">
                  {ds === "em andamento" && <span className="animate-pulse w-1.5 h-1.5 rounded-full bg-warning-strong shrink-0" />}
                  <span className="text-sm font-bold text-foreground truncate">{ev.name}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                  <span className="flex items-center gap-[3px] text-2xs text-muted-foreground">
                    <MapPin className="h-3 w-3" aria-hidden="true" />
                    {ev.location}
                  </span>
                  <span className="flex items-center gap-[3px] text-2xs text-muted-foreground">
                    <CalendarDays className="h-3 w-3" aria-hidden="true" />
                    {formatPeriod(ev.startDate, ev.endDate)}
                  </span>
                  {esc > 0 && (
                    <span className="text-2xs text-muted-foreground">
                      <b className="text-slate-700">{esc}</b> escal.
                    </span>
                  )}
                </div>
              </div>
              <StatusBadge ds={ds} />
              <div className="flex gap-px shrink-0 ml-auto sm:ml-0">
                <ActionBtns event={ev} onEdit={onEdit} onDelete={onDelete} onRestore={onRestore} busy={busy} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── TableView ────────────────────────────────────────────────────────────────
type ColDef = { key: SortKey | null; label: string; w: number | null; center?: boolean; right?: boolean; tip?: string };
const COLUMNS: ColDef[] = [
  { key: "eventNumber", label: "Nº",          w: 60,  center: true },
  { key: "name",        label: "Evento",       w: null },
  { key: null,          label: "Localização",  w: 170 },
  { key: "period",      label: "Período",      w: 140 },
  { key: "status",      label: "Status",       w: 135 },
  { key: null,          label: "Escal.",       w: 65,  center: true, tip: "Escalações ativas" },
  { key: null,          label: "",             w: 75,  right: true },
];

function TableView({ events, onEdit, onDelete, onRestore, escalacoes, sortKey, sortDir, handleSort, busy, empty }: {
  events: Event[]; onEdit: (e: Event) => void; onDelete?: (e: Event) => void; onRestore: (e: Event) => void;
  escalacoes: Record<string, number>; sortKey: SortKey; sortDir: SortDir; handleSort: (k: SortKey) => void; busy?: boolean;
  empty: React.ReactNode;
}) {
  if (events.length === 0) return <>{empty}</>;
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden shadow-1">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[720px]">
          <thead>
            <tr className="bg-muted/40 border-b-2 border-border">
              {COLUMNS.map((col, i) => (
                <th key={i}
                  onClick={() => col.key && handleSort(col.key)}
                  onKeyDown={col.key ? (e: ReactKeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSort(col.key!); }
                  } : undefined}
                  role={col.key ? "button" : undefined}
                  tabIndex={col.key ? 0 : undefined}
                  aria-label={col.key ? `Ordenar por ${col.label}` : undefined}
                  aria-sort={col.key ? (col.key === sortKey ? (sortDir === "asc" ? "ascending" : "descending") : "none") : undefined}
                  style={{ width: col.w ?? undefined }}
                  className={cn(
                    "px-3.5 py-2.5 text-2xs font-bold text-muted-foreground uppercase tracking-[0.08em] whitespace-nowrap select-none",
                    col.center ? "text-center" : col.right ? "text-right" : "text-left",
                    col.key ? "cursor-pointer hover:text-primary focus-visible:outline-none focus-visible:text-primary" : "cursor-default",
                  )}>
                  {col.tip
                    ? <Tooltip><TooltipTrigger><span>{col.label} {col.key && <SortBtn col={col.key} sortKey={sortKey} sortDir={sortDir} />}</span></TooltipTrigger><TooltipContent>{col.tip}</TooltipContent></Tooltip>
                    : <>{col.label}{col.key && <SortBtn col={col.key} sortKey={sortKey} sortDir={sortDir} />}</>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => {
              const ds  = getEventStatus(ev);
              const esc = escalacoes[ev.id] ?? 0;
              return (
                <tr key={ev.id} className={cn("group border-t border-border/60 hover:bg-muted/40 transition-colors", ds === "excluído" && "opacity-50")}>
                  <td className="px-3.5 py-3 text-center">
                    <span className="text-2xs font-bold text-muted-foreground tabular-nums">#{ev.eventNumber}</span>
                  </td>
                  <td className="px-3.5 py-3">
                    <div className="flex items-center gap-2">
                      {ds === "em andamento" && <span className="animate-pulse w-[7px] h-[7px] rounded-full bg-warning-strong shrink-0" />}
                      <span className="text-sm font-semibold text-foreground">{ev.name}</span>
                    </div>
                  </td>
                  <td className="px-3.5 py-3">
                    <span className="flex items-center gap-[5px] text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                      {ev.location}
                    </span>
                  </td>
                  <td className="px-3.5 py-3">
                    <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                      {formatPeriod(ev.startDate, ev.endDate)}
                    </span>
                  </td>
                  <td className="px-3.5 py-3"><StatusBadge ds={ds} /></td>
                  <td className="px-3.5 py-3 text-center">
                    {esc > 0
                      ? <span className="text-xs font-bold text-slate-700">{esc}</span>
                      : <span className="text-xs text-slate-200">—</span>}
                  </td>
                  <td className="px-3.5 py-3">
                    <div className="flex items-center justify-end gap-px opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
                      <ActionBtns event={ev} onEdit={onEdit} onDelete={onDelete} onRestore={onRestore} busy={busy} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Events() {
  // Excluir evento: só administrador (dono, 18/09). Os demais só reativam.
  const { user } = useAuth();
  const isAdmin = ["admin", "administrator", "administrador"].includes(String(user?.role ?? ""));
  usePageTitle("Eventos");
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
  const { data: events, isLoading, isError, error, refetch } = useQuery<Event[]>({ queryKey: ["/api/events?includeDeleted=true"] });
  // Contagem de escalações por evento (todos os eventos): admin/produção/
  // compras/RH leem a fila inteira; quem não pode cai em `?phase=all` (24/09)
  // e as sugestões são descontadas abaixo.
  const { data: inclusions }        = useQuery<TeamInclusion[]>(listaDeVagasQuery(recorteDaListaDeVagas({ user })));

  const loadErrorMsg = (err: any) =>
    err?.status === 401 ? "Sua sessão expirou. Entre novamente para ver os eventos."
    : err?.status === 403 ? "Você não tem permissão para ver os eventos."
    : err?.body?.message || "Não foi possível carregar os eventos. Verifique sua conexão e tente novamente.";

  const escalacoes = useMemo(() => {
    const map: Record<string, number> = {};
    (inclusions ?? []).forEach(i => { if (i.eventId && !isSuggestionInclusion(i)) map[i.eventId] = (map[i.eventId] ?? 0) + 1; });
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
    (events ?? []).forEach(e => { const d = parseLocalDate(e.startDate); if (d) yrs.add(d.getFullYear()); });
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
    if (monthFilter !== "all") list = list.filter(e => { const d = parseLocalDate(e.startDate); return !!d && d.getMonth() + 1 === Number(monthFilter); });
    if (yearFilter  !== "all") list = list.filter(e => { const d = parseLocalDate(e.startDate); return !!d && d.getFullYear() === Number(yearFilter); });
    if (defaultSort) {
      const order = ["em andamento","planejado","concluído","excluído"];
      list.sort((a, b) => {
        const d = order.indexOf(getEventStatus(a)) - order.indexOf(getEventStatus(b));
        if (d !== 0) return d;
        return (parseLocalDate(a.startDate)?.getTime() ?? 0) - (parseLocalDate(b.startDate)?.getTime() ?? 0);
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

  const mutationErrorMsg = (err: any, fallback: string) =>
    err?.status === 401 ? "Sua sessão expirou. Entre novamente para continuar."
    : err?.status === 403 ? "Você não tem permissão para esta ação."
    : err?.body?.message || fallback;

  const deleteMutation = useMutation({
    mutationFn: async (ev: Event) => (await apiRequest("PUT", `/api/events/${ev.id}`, { status: "excluído" })).json(),
    onSuccess: async () => { await invalidate(); toast({ title: "Evento marcado como excluído." }); },
    onError: (err: any) => toast({ title: "Erro ao excluir", description: mutationErrorMsg(err, "Tente novamente."), variant: "destructive" }),
  });
  const restoreMutation = useMutation({
    mutationFn: async (ev: Event) => (await apiRequest("PUT", `/api/events/${ev.id}`, { status: "planejado" })).json(),
    onSuccess: async () => { await invalidate(); toast({ title: "Evento restaurado." }); },
    onError: (err: any) => toast({ title: "Erro ao restaurar", description: mutationErrorMsg(err, "Tente novamente."), variant: "destructive" }),
  });
  const isMutating = deleteMutation.isPending || restoreMutation.isPending;

  const openModal    = (ev?: Event) => { setEditingEvent(ev ?? null); setIsModalOpen(true); };
  const closeModal   = () => { setIsModalOpen(false); setEditingEvent(null); };

  const confirmDelete  = (ev: Event) => setConfirmState({ open: true, title: "Excluir evento?", message: `"${ev.name}" será marcado como excluído.`, confirmLabel: "Excluir", variant: "delete", onConfirm: () => { setConfirmState(p => ({ ...p, open: false })); if (!deleteMutation.isPending) deleteMutation.mutate(ev); } });
  const confirmRestore = (ev: Event) => setConfirmState({ open: true, title: "Restaurar evento?", message: `"${ev.name}" voltará ao status Planejado.`, confirmLabel: "Restaurar", variant: "confirm", onConfirm: () => { setConfirmState(p => ({ ...p, open: false })); if (!restoreMutation.isPending) restoreMutation.mutate(ev); } });

  const hasFilters = !!(search || statusFilter !== "default" || monthFilter !== "all" || yearFilter !== "all");
  const clearFilters = () => { setSearch(""); setStatusFilter("default"); setMonthFilter("all"); setYearFilter("all"); setSortKey("eventNumber"); setSortDir("desc"); setDefaultSort(true); };

  const VIEWS = [
    { key: "table"    as ViewMode, icon: AlignJustify,  title: "Tabela"  },
    { key: "list"     as ViewMode, icon: List,          title: "Lista"   },
    { key: "week"     as ViewMode, icon: CalendarRange, title: "Semana"  },
    { key: "calendar" as ViewMode, icon: CalendarDays,  title: "Mês"     },
  ];

  const activeEvents = useMemo(() => (events ?? []).filter(e => e.status !== "excluído"), [events]);
  // Calendário e semana mostram todos os eventos ativos (não passam pelos filtros
  // da barra), então o contador precisa refletir a lista realmente exibida.
  const isCalendarLike = viewMode === "calendar" || viewMode === "week";
  const visibleCount = isCalendarLike ? activeEvents.length : filteredAndSorted.length;

  // Stat cards: cores semânticas por status (não são a cor de marca).
  const STAT_CARDS = [
    { label: "Total",        value: stats.total,       icon: List,          filter: "active",       tw: { text: "text-primary",   border: "border-t-primary",   activeBg: "bg-brand-soft",   ring: "ring-ring/25"   } },
    { label: "Planejados",   value: stats.planejado,   icon: Calendar,      filter: "planejado",    tw: { text: "text-primary", border: "border-t-primary", activeBg: "bg-brand-soft", ring: "ring-ring/25" } },
    { label: "Em andamento", value: stats.emAndamento, icon: CalendarCheck, filter: "em andamento", tw: { text: "text-warning-strong", border: "border-t-warning-strong", activeBg: "bg-warning-soft", ring: "ring-warning-strong/25" } },
    { label: "Concluídos",   value: stats.concluido,   icon: CalendarX,     filter: "concluído",    tw: { text: "text-success-strong",  border: "border-t-success-strong",  activeBg: "bg-success-soft",  ring: "ring-success-strong/25"  } },
  ];

  const emptyNode = <EventsEmpty hasFilters={hasFilters} onClear={clearFilters} onNew={() => openModal()} />;

  return (
    <TooltipProvider>
      <PageContainer fluid>
        <PageHeader
          icon={CalendarDays}
          title="Eventos"
          subtitle="Controle e acompanhamento de cronogramas logísticos"
          actions={
            <Button onClick={() => openModal()} data-testid="button-add-event" className="h-9 text-sm font-semibold shadow-2 hover:bg-primary-hover">
              <Plus size={15} strokeWidth={2.5} /> Novo Evento
            </Button>
          }
        />

        {/* ── Stat cards ── (escondidos em erro: zeros dariam a impressão de "não há eventos") */}
        {!isLoading && !(isError && !events) && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            {STAT_CARDS.map(c => {
              const isActive = statusFilter === c.filter;
              return (
                <button
                  key={c.label}
                  type="button"
                  aria-pressed={isActive}
                  aria-label={`Filtrar por ${c.label}: ${c.value}`}
                  onClick={() => { setStatusFilter(c.filter); setDefaultSort(false); }}
                  className={cn(
                    "w-full text-left rounded-xl overflow-hidden border-t-[3px] px-4 sm:px-5 py-4 flex justify-between items-start transition-all duration-[180ms] hover:-translate-y-0.5",
                    c.tw.border,
                    isActive ? cn(c.tw.activeBg, "ring-2", c.tw.ring, "shadow-2") : "bg-card shadow-1 hover:shadow-2",
                  )}
                >
                  <div>
                    <p className={cn("text-2xs font-bold uppercase tracking-[0.08em] mb-1 transition-colors", isActive ? c.tw.text : "text-muted-foreground")}>{c.label}</p>
                    <p className={cn("text-2xl font-extrabold leading-none tabular-nums", c.tw.text)}>{c.value}</p>
                  </div>
                  <c.icon aria-hidden="true" className={cn("h-8 w-8 transition-opacity", c.tw.text, isActive ? "opacity-60" : "opacity-20")} />
                </button>
              );
            })}
          </div>
        )}

        {/* ── Filter + view bar ── */}
        <div className="bg-card rounded-lg border border-border px-3 py-2.5 shadow-1">
          <div className="flex items-center gap-2 flex-wrap">

            {/* Search */}
            <div className="relative flex-[1_1_180px] min-w-[150px]">
              <Search size={12} className="absolute left-[9px] top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                id="events-search"
                aria-label="Buscar evento ou cidade"
                placeholder="Buscar evento ou cidade..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                data-testid="input-search-event"
                className={cn("w-full h-8 text-xs pl-7 border border-input rounded-md bg-muted/40 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring placeholder:text-muted-foreground", search ? "pr-8" : "pr-2")}
              />
              {/* Alvo de 24px (23/09): o ícone de 11px sozinho era difícil de acertar no toque. */}
              {search && (
                <button type="button" onClick={() => setSearch("")} aria-label="Limpar busca" className="absolute right-1 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X size={12} aria-hidden="true" /></button>
              )}
            </div>

            {/* Selects */}
            {([
              { val: statusFilter, set: (v: string) => { setStatusFilter(v); if (v === "default") { setDefaultSort(true); setSortKey("eventNumber"); setSortDir("desc"); } },
                opts: [["default","Planejado + Em andamento"],["all","Todos os status"],["active","Ativos"],["planejado","Planejado"],["em andamento","Em andamento"],["concluído","Concluído"],["excluído","Excluído"]],
                test: "select-status-filter", label: "Filtrar por status" },
              { val: monthFilter, set: setMonthFilter,
                opts: [["all","Todos os meses"], ...MONTHS.map((m,i) => [String(i+1), m])],
                test: undefined, label: "Filtrar por mês" },
              { val: yearFilter, set: setYearFilter,
                opts: [["all","Todos os anos"], ...availableYears.map(y => [String(y), String(y)])],
                test: undefined, label: "Filtrar por ano" },
            ] as any[]).map((s, i) => (
              <select key={i} value={s.val} onChange={e => s.set(e.target.value)} data-testid={s.test} aria-label={s.label} className={SELECT_CLASS}>
                {s.opts.map(([v, l]: [string, string]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ))}

            {hasFilters && (
              <button type="button" onClick={clearFilters} data-testid="button-clear-filters"
                className="h-8 px-2.5 rounded-md text-primary text-xs font-bold flex items-center gap-1 hover:text-primary-hover hover:bg-brand-soft transition-colors">
                <FilterX className="h-4 w-4" aria-hidden="true" />
                Limpar Filtros
              </button>
            )}

            <span className="text-2xs text-muted-foreground ml-auto whitespace-nowrap" aria-live="polite">
              {visibleCount} evento{visibleCount !== 1 ? "s" : ""}
              {isCalendarLike && " (todos os ativos)"}
            </span>

            <div className="w-px h-[18px] bg-border hidden sm:block" />

            {/* View toggle */}
            <div className="flex bg-muted rounded-md p-0.5 gap-px">
              {VIEWS.map(v => {
                const active = viewMode === v.key;
                return (
                  <Tooltip key={v.key}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setViewMode(v.key)}
                        aria-label={`Visualização: ${v.title}`}
                        aria-pressed={active}
                        className={cn(
                          "flex items-center justify-center w-7 h-7 rounded-md transition-all duration-150",
                          active ? "bg-card text-primary shadow-1" : "bg-transparent text-muted-foreground hover:text-slate-600",
                        )}
                      >
                        <v.icon className="h-4 w-4" aria-hidden="true" />
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
          <LoadingState count={6} label="Carregando eventos…" />
        ) : (isError && !events) ? (
          /* Sem este ramo, uma falha de rede/sessão expirada aparecia como "nenhum evento". */
          <div role="alert" className="bg-card rounded-xl border border-danger/25 px-6 py-12 text-center">
            <CloudOff className="w-8 h-8 text-danger-strong mx-auto mb-2.5" />
            <p className="text-sm font-bold text-foreground mb-1">Não foi possível carregar os eventos</p>
            <p className="text-xs text-muted-foreground mb-4">{loadErrorMsg(error)}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Tentar novamente</Button>
          </div>
        ) : viewMode === "table" ? (
          <TableView events={filteredAndSorted} onEdit={openModal} onDelete={isAdmin ? confirmDelete : undefined} onRestore={confirmRestore}
            escalacoes={escalacoes} sortKey={sortKey} sortDir={sortDir} handleSort={handleSort} busy={isMutating} empty={emptyNode} />
        ) : viewMode === "list" ? (
          <ListView events={filteredAndSorted} onEdit={openModal} onDelete={isAdmin ? confirmDelete : undefined} onRestore={confirmRestore}
            escalacoes={escalacoes} busy={isMutating} empty={emptyNode} />
        ) : viewMode === "calendar" ? (
          <CalendarView events={activeEvents} onEdit={openModal} currentDate={calDate} setCurrentDate={setCalDate} />
        ) : (
          <WeekView events={activeEvents} onEdit={openModal} currentDate={calDate} setCurrentDate={setCalDate} />
        )}
      </PageContainer>

      <EventModal open={isModalOpen} onClose={closeModal} event={editingEvent} />
      <ConfirmDialog
        open={confirmState.open}
        onOpenChange={(o) => { if (!o) setConfirmState(p => ({ ...p, open: false })); }}
        title={confirmState.title} description={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        tone={confirmState.variant === "delete" ? "danger" : "default"}
        onConfirm={confirmState.onConfirm}
      />
    </TooltipProvider>
  );
}
