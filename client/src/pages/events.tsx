import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Calendar, Plus, Edit, Trash2, Search, X,
  ChevronUp, ChevronDown, ChevronsUpDown,
  CalendarCheck, CalendarClock, CalendarX, LayoutList, Users, RotateCcw
} from "lucide-react";
import EventModal from "@/components/modals/event-modal";
import ConfirmModal from "@/components/common/confirm-modal";
import type { Event, TeamInclusion } from "@shared/schema";
import { format } from "date-fns";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getEventStatus(event: Event): string {
  if (event.status === "excluído") return "excluído";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end = new Date(event.endDate); end.setHours(0, 0, 0, 0);
  const start = new Date(event.startDate); start.setHours(0, 0, 0, 0);
  if (end < today) return "concluído";
  if (start <= today) return "em andamento";
  return event.status;
}

function formatPeriod(startStr: string, endStr: string): string {
  try {
    const s = new Date(startStr);
    const e = new Date(endStr);
    if (s.toDateString() === e.toDateString()) return format(s, "dd/MM/yyyy");
    const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
    if (sameMonth) return `${format(s, "dd")}–${format(e, "dd/MM/yyyy")}`;
    return `${format(s, "dd/MM")} – ${format(e, "dd/MM/yyyy")}`;
  } catch { return `${startStr} – ${endStr}`; }
}

const STATUS_CONFIG: Record<string, { label: string; badgeCls: string }> = {
  planejado:      { label: "Planejado",    badgeCls: "bg-blue-50 text-blue-600 ring-1 ring-blue-200" },
  "em andamento": { label: "Em andamento", badgeCls: "bg-amber-50 text-amber-600 ring-1 ring-amber-200" },
  concluído:      { label: "Concluído",    badgeCls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  excluído:       { label: "Excluído",     badgeCls: "bg-gray-100 text-gray-400 ring-1 ring-gray-200" },
};

type SortKey = "eventNumber" | "name" | "period" | "status";
type SortDir = "asc" | "desc";

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="w-3 h-3 opacity-25 ml-1 inline" />;
  return sortDir === "asc"
    ? <ChevronUp className="w-3 h-3 ml-1 inline text-blue-600" />
    : <ChevronDown className="w-3 h-3 ml-1 inline text-blue-600" />;
}

// ─── StatCard ────────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: number;
  icon: React.ElementType;
  numCls: string;
  iconCls: string;
}
function StatCard({ label, value, icon: Icon, numCls, iconCls }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 flex items-center gap-4">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconCls}`}>
        <Icon className="w-4.5 h-4.5" style={{width:'18px',height:'18px'}} />
      </div>
      <div>
        <p className={`text-2xl font-bold leading-none tabular-nums ${numCls}`}>{value}</p>
        <p className="text-xs text-slate-400 mt-1">{label}</p>
      </div>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function Events() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("default");
  const [monthFilter, setMonthFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("eventNumber");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [defaultSortActive, setDefaultSortActive] = useState(true);
  const [confirmState, setConfirmState] = useState<{
    open: boolean; title: string; message: string; confirmLabel: string; variant?: "delete" | "cancel" | "confirm"; onConfirm: () => void;
  }>({ open: false, title: '', message: '', confirmLabel: '', variant: 'delete', onConfirm: () => {} });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: events, isLoading } = useQuery<Event[]>({
    queryKey: ["/api/events?includeDeleted=true"],
  });
  const { data: inclusions } = useQuery<TeamInclusion[]>({ queryKey: ["/api/team-inclusions"] });

  const escalacoesByEvent = useMemo(() => {
    if (!inclusions) return {} as Record<string, number>;
    return inclusions.reduce((acc, inc) => {
      if (!inc.deletedAt) acc[inc.eventId] = (acc[inc.eventId] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [inclusions]);

  const availableYears = useMemo(() => {
    if (!events) return [];
    const years = new Set<number>();
    events.forEach(e => {
      years.add(new Date(e.startDate).getFullYear());
      years.add(new Date(e.endDate).getFullYear());
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [events]);

  const stats = useMemo(() => {
    if (!events) return { total: 0, planejado: 0, emAndamento: 0, concluido: 0 };
    const active = events.filter(e => e.status !== "excluído");
    return {
      total:       active.length,
      planejado:   active.filter(e => getEventStatus(e) === "planejado").length,
      emAndamento: active.filter(e => getEventStatus(e) === "em andamento").length,
      concluido:   active.filter(e => getEventStatus(e) === "concluído").length,
    };
  }, [events]);

  const handleSort = (key: SortKey) => {
    setDefaultSortActive(false);
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const handleStatusFilterChange = (val: string) => {
    setStatusFilter(val);
    if (val === "default") {
      setSortKey("eventNumber");
      setSortDir("desc");
      setDefaultSortActive(true);
    }
  };

  const filteredAndSortedEvents = useMemo(() => {
    if (!events) return [];
    let list = [...events];
    if (searchTerm.trim()) {
      const t = searchTerm.toLowerCase();
      list = list.filter(e => e.name.toLowerCase().includes(t) || e.location.toLowerCase().includes(t));
    }
    if (statusFilter === "default") list = list.filter(e => e.status !== "excluído" && e.status !== "concluído");
    else if (statusFilter === "active") list = list.filter(e => e.status !== "excluído");
    else if (statusFilter !== "all") list = list.filter(e => getEventStatus(e) === statusFilter);
    if (dateFilter) {
      const selected = new Date(dateFilter); selected.setHours(0,0,0,0);
      list = list.filter(e => {
        const es = new Date(e.startDate); es.setHours(0,0,0,0);
        const ee = new Date(e.endDate);   ee.setHours(0,0,0,0);
        return selected >= es && selected <= ee;
      });
    }
    if (monthFilter !== "all" || yearFilter !== "all") {
      list = list.filter(e => {
        const es = new Date(e.startDate);
        const ee = new Date(e.endDate);
        const cur = new Date(es.getFullYear(), es.getMonth(), 1);
        const endMonth = new Date(ee.getFullYear(), ee.getMonth(), 1);
        while (cur <= endMonth) {
          const mMatch = monthFilter === "all" || cur.getMonth() + 1 === Number(monthFilter);
          const yMatch = yearFilter === "all" || cur.getFullYear() === Number(yearFilter);
          if (mMatch && yMatch) return true;
          cur.setMonth(cur.getMonth() + 1);
        }
        return false;
      });
    }
    if (defaultSortActive && statusFilter === "default") {
      const statusPriority = (e: Event) => getEventStatus(e) === "em andamento" || e.status === "em andamento" ? 0 : 1;
      list.sort((a, b) => {
        const p = statusPriority(a) - statusPriority(b);
        if (p !== 0) return p;
        return b.eventNumber - a.eventNumber;
      });
    } else {
      list.sort((a, b) => {
        let cmp = 0;
        if (sortKey === "eventNumber") cmp = a.eventNumber - b.eventNumber;
        else if (sortKey === "name")   cmp = a.name.localeCompare(b.name, "pt-BR");
        else if (sortKey === "period") cmp = new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
        else if (sortKey === "status") cmp = getEventStatus(a).localeCompare(getEventStatus(b), "pt-BR");
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return list;
  }, [events, searchTerm, statusFilter, dateFilter, monthFilter, yearFilter, sortKey, sortDir, defaultSortActive]);

  const invalidateEvents = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/events?includeDeleted=true"] });
  };

  const deleteEventMutation = useMutation({
    mutationFn: async (ev: Event) => (await apiRequest("PUT", `/api/events/${ev.id}`, { status: "excluído" })).json(),
    onSuccess: async () => {
      await invalidateEvents();
      toast({ title: "Sucesso", description: "Evento marcado como excluído com sucesso!" });
    },
    onError: () => toast({ title: "Erro", description: "Erro ao marcar evento como excluído.", variant: "destructive" }),
  });

  const restoreEventMutation = useMutation({
    mutationFn: async (ev: Event) => (await apiRequest("PUT", `/api/events/${ev.id}`, { status: "planejado" })).json(),
    onSuccess: async () => {
      await invalidateEvents();
      toast({ title: "Sucesso", description: "Evento restaurado com sucesso!" });
    },
    onError: () => toast({ title: "Erro", description: "Erro ao restaurar evento.", variant: "destructive" }),
  });

  const handleOpenModal = (event?: Event) => { setEditingEvent(event ?? null); setIsModalOpen(true); };
  const handleCloseModal = () => { setIsModalOpen(false); setEditingEvent(null); };
  const handleDelete = (event: Event) => {
    setConfirmState({
      open: true,
      title: 'Marcar como excluído?',
      message: `O evento "${event.name}" será marcado como excluído, mas continuará visível na lista.`,
      confirmLabel: 'Marcar como excluído',
      onConfirm: () => { setConfirmState(prev => ({ ...prev, open: false })); deleteEventMutation.mutate(event); },
    });
  };
  const handleRestore = (event: Event) => {
    setConfirmState({
      open: true,
      title: 'Restaurar evento?',
      message: `O evento "${event.name}" será restaurado e voltará ao status "Planejado".`,
      confirmLabel: 'Restaurar',
      variant: 'confirm',
      onConfirm: () => { setConfirmState(prev => ({ ...prev, open: false })); restoreEventMutation.mutate(event); },
    });
  };

  const clearFilters = () => {
    setSearchTerm(""); setStatusFilter("default"); setDateFilter(""); setMonthFilter("all"); setYearFilter("all");
    setSortKey("eventNumber"); setSortDir("desc"); setDefaultSortActive(true);
  };
  const hasActiveFilters = !!(searchTerm || statusFilter !== "default" || dateFilter || monthFilter !== "all" || yearFilter !== "all");

  return (
    <TooltipProvider>
      <div className="space-y-5">

        {/* ── Metric cards ── */}
        {!isLoading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Total de eventos"
              value={stats.total}
              icon={LayoutList}
              numCls="text-slate-800"
              iconCls="bg-slate-100 text-slate-500"
            />
            <StatCard
              label="Planejados"
              value={stats.planejado}
              icon={CalendarClock}
              numCls="text-blue-600"
              iconCls="bg-blue-50 text-blue-500"
            />
            <StatCard
              label="Em andamento"
              value={stats.emAndamento}
              icon={CalendarCheck}
              numCls="text-amber-600"
              iconCls="bg-amber-50 text-amber-500"
            />
            <StatCard
              label="Concluídos"
              value={stats.concluido}
              icon={CalendarX}
              numCls="text-emerald-600"
              iconCls="bg-emerald-50 text-emerald-500"
            />
          </div>
        )}

        {/* ── Main panel ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

          {/* Section header */}
          <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                Gerenciamento de Eventos
                {!isLoading && (
                  <span className="text-sm font-normal text-slate-400">
                    ({hasActiveFilters
                      ? `${filteredAndSortedEvents.length} de ${events?.filter(e => e.status !== "excluído").length ?? 0}`
                      : stats.total} ativos)
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Gerencie os eventos do sistema</p>
            </div>
            <button
              onClick={() => handleOpenModal()}
              data-testid="button-add-event"
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm shadow-blue-200 hover:shadow-md hover:shadow-blue-200 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              Novo Evento
            </button>
          </div>

          {/* Filters — single row */}
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="flex flex-wrap gap-2 items-center">
              {/* Search */}
              <div className="relative flex-[2] min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <Input
                  placeholder="Buscar por nome ou cidade..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-9 h-9 text-sm border-gray-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
                  data-testid="input-search-event"
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Status */}
              <div className="flex-1 min-w-[180px]">
                <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
                  <SelectTrigger className="h-9 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 hover:border-blue-300 transition-colors focus:ring-2 focus:ring-blue-200" data-testid="select-status-filter">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-slate-200 rounded-xl shadow-lg min-w-[220px]">
                    <SelectItem value="default"    className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Planejado + Em andamento</SelectItem>
                    <SelectItem value="all"        className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Todos os status</SelectItem>
                    <SelectItem value="planejado"  className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Planejado</SelectItem>
                    <SelectItem value="em andamento" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Em andamento</SelectItem>
                    <SelectItem value="concluído"  className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Concluído</SelectItem>
                    <SelectItem value="excluído"   className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Excluído</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Month */}
              <div className="flex-1 min-w-[120px]">
                <Select value={monthFilter} onValueChange={setMonthFilter}>
                  <SelectTrigger className="h-9 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 hover:border-blue-300 transition-colors focus:ring-2 focus:ring-blue-200">
                    <SelectValue placeholder="Mês" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-slate-200 rounded-xl shadow-lg min-w-[160px]">
                    <SelectItem value="all" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Todos os meses</SelectItem>
                    {["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"].map((m, i) => (
                      <SelectItem key={i+1} value={String(i+1)} className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Year */}
              <div className="w-[96px]">
                <Select value={yearFilter} onValueChange={setYearFilter}>
                  <SelectTrigger className="h-9 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 hover:border-blue-300 transition-colors focus:ring-2 focus:ring-blue-200">
                    <SelectValue placeholder="Ano" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-slate-200 rounded-xl shadow-lg min-w-[120px]">
                    <SelectItem value="all" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Todos</SelectItem>
                    {availableYears.map(y => (
                      <SelectItem key={y} value={String(y)} className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date */}
              <div className="relative w-[140px]">
                <Input
                  type="date"
                  value={dateFilter}
                  onChange={e => setDateFilter(e.target.value)}
                  className="h-9 text-sm border-gray-200 rounded-lg"
                  title="Data específica — mostra eventos que ocorrem neste dia"
                  data-testid="input-date-filter"
                />
                {dateFilter && (
                  <button onClick={() => setDateFilter("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Clear */}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  data-testid="button-clear-filters"
                  className="flex items-center gap-1 h-9 px-3 text-xs text-slate-500 hover:text-slate-700 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                >
                  <X className="w-3 h-3" /> Limpar
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="text-center py-12 text-slate-400 text-sm">Carregando eventos...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th
                      onClick={() => handleSort("eventNumber")}
                      className="text-left px-6 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider cursor-pointer select-none whitespace-nowrap w-16 hover:text-slate-600"
                    >
                      Nº <SortIcon col="eventNumber" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th
                      onClick={() => handleSort("name")}
                      className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider cursor-pointer select-none hover:text-slate-600"
                    >
                      Nome <SortIcon col="name" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                      Cidade
                    </th>
                    <th
                      onClick={() => handleSort("period")}
                      className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider cursor-pointer select-none hover:text-slate-600 whitespace-nowrap"
                    >
                      Período <SortIcon col="period" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th
                      onClick={() => handleSort("status")}
                      className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider cursor-pointer select-none hover:text-slate-600"
                    >
                      Status <SortIcon col="status" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex items-center justify-center gap-1 cursor-default">
                            <Users className="w-3.5 h-3.5" /> Escal.
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Escalações ativas no evento</TooltipContent>
                      </Tooltip>
                    </th>
                    <th className="px-6 py-3 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedEvents.map((event, idx) => {
                    const displayStatus = getEventStatus(event);
                    const statusCfg = STATUS_CONFIG[displayStatus] ?? STATUS_CONFIG["planejado"];
                    const isDeleted = displayStatus === "excluído";
                    const isOngoing = displayStatus === "em andamento";
                    const escalacoes = escalacoesByEvent[event.id] ?? 0;
                    const isEven = idx % 2 === 1;

                    return (
                      <tr
                        key={event.id}
                        className={`border-b border-gray-50 transition-colors group ${
                          isDeleted ? "opacity-60" : ""
                        } ${isEven ? "bg-slate-50/60" : "bg-white"} hover:bg-blue-50/60`}
                      >
                        <td className="px-6 py-3.5 text-xs text-slate-400 font-medium tabular-nums">
                          {event.eventNumber}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="flex items-center gap-2">
                            {isOngoing && (
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                            )}
                            <span className="font-semibold text-slate-800">{event.name}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-slate-500">{event.location}</td>
                        <td className="px-4 py-3.5 text-slate-500 tabular-nums whitespace-nowrap">
                          {formatPeriod(event.startDate, event.endDate)}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${statusCfg.badgeCls}`}>
                            {statusCfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {escalacoes > 0 ? (
                            <span className="text-sm font-semibold text-slate-700">{escalacoes}</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-1 justify-end">
                            {isDeleted ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => handleRestore(event)}
                                    data-testid={`button-restore-event-${event.id}`}
                                    className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Restaurar evento</TooltipContent>
                              </Tooltip>
                            ) : (
                              <>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      onClick={() => handleOpenModal(event)}
                                      data-testid={`button-edit-event-${event.id}`}
                                      className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                    >
                                      <Edit className="w-3.5 h-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>Editar evento</TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      onClick={() => handleDelete(event)}
                                      data-testid={`button-delete-event-${event.id}`}
                                      className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>Excluir evento</TooltipContent>
                                </Tooltip>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredAndSortedEvents.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-slate-400 text-sm">
                        {statusFilter === "default" && !searchTerm && monthFilter === "all" && yearFilter === "all" && !dateFilter
                          ? "Nenhum evento planejado ou em andamento. Selecione \"Todos os status\" para ver eventos concluídos."
                          : hasActiveFilters
                            ? "Nenhum evento encontrado com os filtros aplicados."
                            : "Nenhum evento cadastrado. Clique em 'Novo Evento' para criar o primeiro."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <EventModal open={isModalOpen} onClose={handleCloseModal} event={editingEvent} />

      <ConfirmModal
        open={confirmState.open}
        variant={confirmState.variant ?? "delete"}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(prev => ({ ...prev, open: false }))}
      />
    </TooltipProvider>
  );
}
