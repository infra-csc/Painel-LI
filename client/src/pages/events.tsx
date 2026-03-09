import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Calendar, Plus, Edit, Trash2, Search, X,
  ChevronUp, ChevronDown, ChevronsUpDown,
  CalendarCheck, CalendarClock, CalendarX, LayoutList, Users
} from "lucide-react";
import EventModal from "@/components/modals/event-modal";
import type { Event, TeamInclusion } from "@shared/schema";
import { format, addMonths, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
    return `${format(s, "dd/MM", { locale: ptBR })} – ${format(e, "dd/MM/yyyy")}`;
  } catch { return `${startStr} – ${endStr}`; }
}

function getPeriodRange(p: string) {
  const now = new Date();
  if (p === "this_month")  return { start: startOfMonth(now), end: endOfMonth(now) };
  if (p === "next_month")  { const nm = addMonths(now, 1); return { start: startOfMonth(nm), end: endOfMonth(nm) }; }
  if (p === "last_month")  { const lm = addMonths(now, -1); return { start: startOfMonth(lm), end: endOfMonth(lm) }; }
  if (p === "this_year")   return { start: startOfYear(now), end: endOfYear(now) };
  return { start: null, end: null };
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  planejado:      { label: "Planejado",      cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300" },
  "em andamento": { label: "Em andamento",   cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300" },
  concluído:      { label: "Concluído",      cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" },
  excluído:       { label: "Excluído",       cls: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400" },
};

type SortKey = "eventNumber" | "name" | "period" | "status";
type SortDir = "asc" | "desc";

// ─── Sort icon ────────────────────────────────────────────────────────────────
function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="w-3.5 h-3.5 opacity-30 ml-1 inline" />;
  return sortDir === "asc"
    ? <ChevronUp className="w-3.5 h-3.5 ml-1 inline text-primary" />
    : <ChevronDown className="w-3.5 h-3.5 ml-1 inline text-primary" />;
}

// ─── Mini stat card ───────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div className={`w-8 h-8 rounded-md flex items-center justify-center ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-xl font-semibold leading-none text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Events() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("eventNumber");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: events, isLoading } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: inclusions } = useQuery<TeamInclusion[]>({ queryKey: ["/api/team-inclusions"] });

  // Count active escalações per event
  const escalacoesByEvent = useMemo(() => {
    if (!inclusions) return {} as Record<string, number>;
    return inclusions.reduce((acc, inc) => {
      if (!inc.deletedAt) acc[inc.eventId] = (acc[inc.eventId] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [inclusions]);

  // Stats from all (unfiltered) events
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
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const filteredAndSortedEvents = useMemo(() => {
    if (!events) return [];
    let list = [...events];

    if (searchTerm.trim()) {
      const t = searchTerm.toLowerCase();
      list = list.filter(e => e.name.toLowerCase().includes(t) || e.location.toLowerCase().includes(t));
    }
    if (statusFilter !== "all") list = list.filter(e => getEventStatus(e) === statusFilter);
    if (periodFilter !== "all") {
      const { start, end } = getPeriodRange(periodFilter);
      if (start && end) list = list.filter(e => {
        const es = new Date(e.startDate); es.setHours(0,0,0,0);
        const ee = new Date(e.endDate);   ee.setHours(0,0,0,0);
        return ee >= start && es <= end;
      });
    }

    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "eventNumber") cmp = a.eventNumber - b.eventNumber;
      else if (sortKey === "name")   cmp = a.name.localeCompare(b.name, "pt-BR");
      else if (sortKey === "period") cmp = new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      else if (sortKey === "status") cmp = getEventStatus(a).localeCompare(getEventStatus(b), "pt-BR");
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [events, searchTerm, statusFilter, periodFilter, sortKey, sortDir]);

  const deleteEventMutation = useMutation({
    mutationFn: async (ev: Event) => (await apiRequest("PUT", `/api/events/${ev.id}`, { status: "excluído" })).json(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      await queryClient.refetchQueries({ queryKey: ["/api/events"] });
      toast({ title: "Sucesso", description: "Evento marcado como excluído com sucesso!" });
    },
    onError: () => toast({ title: "Erro", description: "Erro ao marcar evento como excluído.", variant: "destructive" }),
  });

  const handleOpenModal = (event?: Event) => { setEditingEvent(event ?? null); setIsModalOpen(true); };
  const handleCloseModal = () => { setIsModalOpen(false); setEditingEvent(null); };
  const handleDelete = (event: Event) => {
    if (confirm(`Tem certeza que deseja marcar o evento "${event.name}" como excluído? O evento continuará visível na lista.`))
      deleteEventMutation.mutate(event);
  };
  const clearFilters = () => { setSearchTerm(""); setStatusFilter("all"); setPeriodFilter("all"); };
  const hasActiveFilters = searchTerm || statusFilter !== "all" || periodFilter !== "all";

  return (
    <TooltipProvider>
      <>
        <div className="space-y-5">

          {/* ── Mini stat cards ── */}
          {!isLoading && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Total de eventos"  value={stats.total}       icon={LayoutList}    color="bg-muted text-muted-foreground" />
              <StatCard label="Planejados"         value={stats.planejado}   icon={CalendarClock} color="bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400" />
              <StatCard label="Em andamento"       value={stats.emAndamento} icon={CalendarCheck} color="bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400" />
              <StatCard label="Concluídos"         value={stats.concluido}   icon={CalendarX}     color="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400" />
            </div>
          )}

          {/* ── Main card ── */}
          <Card className="border-border">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    Gerenciamento de Eventos
                    {!isLoading && (
                      <span className="ml-1 text-sm font-normal text-muted-foreground">
                        ({hasActiveFilters ? `${filteredAndSortedEvents.length} de ${events?.filter(e => e.status !== "excluído").length ?? 0}` : stats.total})
                      </span>
                    )}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">Gerencie os eventos do sistema</p>
                </div>
                <Button onClick={() => handleOpenModal()} data-testid="button-add-event">
                  <Plus className="w-4 h-4 mr-2" />
                  Novo Evento
                </Button>
              </div>
            </CardHeader>

            <CardContent>
              {/* ── Filters ── */}
              <div className="mb-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por nome ou cidade..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="pl-9"
                      data-testid="input-search-event"
                    />
                    {searchTerm && (
                      <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger data-testid="select-status-filter">
                      <SelectValue placeholder="Todos os status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os status</SelectItem>
                      <SelectItem value="planejado">Planejado</SelectItem>
                      <SelectItem value="em andamento">Em andamento</SelectItem>
                      <SelectItem value="concluído">Concluído</SelectItem>
                      <SelectItem value="excluído">Excluído</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={periodFilter} onValueChange={setPeriodFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todos os períodos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os períodos</SelectItem>
                      <SelectItem value="this_month">Este mês</SelectItem>
                      <SelectItem value="next_month">Próximo mês</SelectItem>
                      <SelectItem value="last_month">Mês anterior</SelectItem>
                      <SelectItem value="this_year">Este ano</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {hasActiveFilters && (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      {filteredAndSortedEvents.length} evento(s) encontrado(s)
                    </p>
                    <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
                      <X className="w-4 h-4 mr-2" />
                      Limpar filtros
                    </Button>
                  </div>
                )}
              </div>

              {/* ── Table ── */}
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Carregando eventos...</div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead
                          className="cursor-pointer select-none w-16 hover:text-foreground"
                          onClick={() => handleSort("eventNumber")}
                        >
                          Nº <SortIcon col="eventNumber" sortKey={sortKey} sortDir={sortDir} />
                        </TableHead>
                        <TableHead
                          className="cursor-pointer select-none hover:text-foreground"
                          onClick={() => handleSort("name")}
                        >
                          Nome <SortIcon col="name" sortKey={sortKey} sortDir={sortDir} />
                        </TableHead>
                        <TableHead>Cidade</TableHead>
                        <TableHead
                          className="cursor-pointer select-none hover:text-foreground"
                          onClick={() => handleSort("period")}
                        >
                          Período <SortIcon col="period" sortKey={sortKey} sortDir={sortDir} />
                        </TableHead>
                        <TableHead
                          className="cursor-pointer select-none hover:text-foreground"
                          onClick={() => handleSort("status")}
                        >
                          Status <SortIcon col="status" sortKey={sortKey} sortDir={sortDir} />
                        </TableHead>
                        <TableHead className="text-center">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex items-center justify-center gap-1 cursor-default">
                                <Users className="w-3.5 h-3.5" /> Escal.
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Escalações ativas no evento</TooltipContent>
                          </Tooltip>
                        </TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAndSortedEvents.map((event) => {
                        const displayStatus = getEventStatus(event);
                        const statusCfg = STATUS_CONFIG[displayStatus] ?? STATUS_CONFIG["planejado"];
                        const isDeleted = displayStatus === "excluído";
                        const isOngoing = displayStatus === "em andamento";
                        const escalacoes = escalacoesByEvent[event.id] ?? 0;

                        return (
                          <TableRow
                            key={event.id}
                            className={`transition-colors ${isDeleted ? "opacity-60" : "hover:bg-muted/40"}`}
                          >
                            <TableCell className="font-medium text-muted-foreground">{event.eventNumber}</TableCell>
                            <TableCell>
                              <span className="flex items-center gap-2">
                                {isOngoing && (
                                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" title="Em andamento" />
                                )}
                                {event.name}
                              </span>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{event.location}</TableCell>
                            <TableCell className="tabular-nums text-muted-foreground whitespace-nowrap">
                              {formatPeriod(event.startDate, event.endDate)}
                            </TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.cls}`}>
                                {statusCfg.label}
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              {escalacoes > 0 ? (
                                <span className="text-sm font-medium text-foreground">{escalacoes}</span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex gap-1.5 justify-end">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleOpenModal(event)}
                                      disabled={isDeleted}
                                      data-testid={`button-edit-event-${event.id}`}
                                    >
                                      <Edit className="w-3 h-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Editar evento</TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleDelete(event)}
                                      disabled={isDeleted}
                                      className="text-destructive hover:text-destructive"
                                      data-testid={`button-delete-event-${event.id}`}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Excluir evento</TooltipContent>
                                </Tooltip>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {filteredAndSortedEvents.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            {hasActiveFilters
                              ? "Nenhum evento encontrado com os filtros aplicados."
                              : "Nenhum evento cadastrado. Clique em 'Novo Evento' para criar o primeiro."}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <EventModal open={isModalOpen} onClose={handleCloseModal} event={editingEvent} />
      </>
    </TooltipProvider>
  );
}
