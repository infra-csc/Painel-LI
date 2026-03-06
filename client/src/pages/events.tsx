import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Calendar, Plus, Pencil, Trash2, Search, X } from "lucide-react";
import EventModal from "@/components/modals/event-modal";
import type { Event } from "@shared/schema";
import { format, isThisMonth, isThisYear, startOfMonth, endOfMonth, addMonths, startOfYear, endOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getEventStatus(event: Event): string {
  if (event.status === "excluído") return "excluído";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(event.endDate);
  endDate.setHours(0, 0, 0, 0);
  const startDate = new Date(event.startDate);
  startDate.setHours(0, 0, 0, 0);
  if (endDate < today) return "concluído";
  if (startDate <= today) return "em andamento";
  return event.status;
}

function formatPeriod(startDateStr: string, endDateStr: string): string {
  try {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
    const sameDay = start.toDateString() === end.toDateString();

    if (sameDay) return format(start, "dd MMM yyyy", { locale: ptBR });
    if (sameMonth) {
      return `${format(start, "dd", { locale: ptBR })}–${format(end, "dd MMM yyyy", { locale: ptBR })}`;
    }
    return `${format(start, "dd MMM", { locale: ptBR })} – ${format(end, "dd MMM yyyy", { locale: ptBR })}`;
  } catch {
    return `${startDateStr} – ${endDateStr}`;
  }
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  planejado:      { label: "Planejado",      className: "bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:ring-blue-800" },
  "em andamento": { label: "Em andamento",   className: "bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-800" },
  concluído:      { label: "Concluído",      className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-800" },
  excluído:       { label: "Excluído",       className: "bg-red-50 text-red-600 ring-1 ring-red-200 dark:bg-red-950 dark:text-red-400 dark:ring-red-800" },
};

function getPeriodRange(period: string): { start: Date | null; end: Date | null } {
  const now = new Date();
  if (period === "this_month") return { start: startOfMonth(now), end: endOfMonth(now) };
  if (period === "next_month") { const nm = addMonths(now, 1); return { start: startOfMonth(nm), end: endOfMonth(nm) }; }
  if (period === "last_month") { const lm = addMonths(now, -1); return { start: startOfMonth(lm), end: endOfMonth(lm) }; }
  if (period === "this_year") return { start: startOfYear(now), end: endOfYear(now) };
  return { start: null, end: null };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Events() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: events, isLoading } = useQuery<Event[]>({ queryKey: ["/api/events"] });

  const filteredEvents = useMemo(() => {
    if (!events) return [];
    let list = [...events];

    if (searchTerm.trim()) {
      const t = searchTerm.toLowerCase();
      list = list.filter(e => e.name.toLowerCase().includes(t) || e.location.toLowerCase().includes(t));
    }

    if (statusFilter !== "all") {
      list = list.filter(e => getEventStatus(e) === statusFilter);
    }

    if (periodFilter !== "all") {
      const { start, end } = getPeriodRange(periodFilter);
      if (start && end) {
        list = list.filter(e => {
          const evStart = new Date(e.startDate); evStart.setHours(0, 0, 0, 0);
          const evEnd = new Date(e.endDate); evEnd.setHours(0, 0, 0, 0);
          return evEnd >= start && evStart <= end;
        });
      }
    }

    return list.sort((a, b) => b.eventNumber - a.eventNumber);
  }, [events, searchTerm, statusFilter, periodFilter]);

  const deleteEventMutation = useMutation({
    mutationFn: async (event: Event) => {
      const response = await apiRequest("PUT", `/api/events/${event.id}`, { status: "excluído" });
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      await queryClient.refetchQueries({ queryKey: ["/api/events"] });
      toast({ title: "Evento excluído", description: "O evento foi marcado como excluído." });
    },
    onError: () => {
      toast({ title: "Erro", description: "Não foi possível excluir o evento.", variant: "destructive" });
    },
  });

  const handleOpenModal = (event?: Event) => { setEditingEvent(event ?? null); setIsModalOpen(true); };
  const handleCloseModal = () => { setIsModalOpen(false); setEditingEvent(null); };
  const handleDelete = (event: Event) => {
    if (confirm(`Excluir o evento "${event.name}"? Ele ficará visível na lista como excluído.`)) {
      deleteEventMutation.mutate(event);
    }
  };
  const clearFilters = () => { setSearchTerm(""); setStatusFilter("all"); setPeriodFilter("all"); };
  const hasActiveFilters = searchTerm || statusFilter !== "all" || periodFilter !== "all";

  return (
    <>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">Eventos</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Gerencie os eventos do sistema</p>
          </div>
          <Button
            onClick={() => handleOpenModal()}
            data-testid="button-add-event"
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            Criar Evento
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Buscar evento ou cidade..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
              data-testid="input-search-event"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter} data-testid="select-status-filter">
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Status" />
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
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os períodos</SelectItem>
              <SelectItem value="this_month">Este mês</SelectItem>
              <SelectItem value="next_month">Próximo mês</SelectItem>
              <SelectItem value="last_month">Mês anterior</SelectItem>
              <SelectItem value="this_year">Este ano</SelectItem>
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-gray-500 gap-1.5" data-testid="button-clear-filters">
              <X className="w-3.5 h-3.5" />
              Limpar
            </Button>
          )}

          {hasActiveFilters && (
            <span className="text-sm text-gray-400 ml-auto">
              {filteredEvents.length} evento{filteredEvents.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Table */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900 shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-50 dark:hover:bg-gray-800/60">
                <TableHead className="w-16 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide pl-5">Nº</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Evento</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Cidade</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Período</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-right pr-5">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i} className="border-gray-100 dark:border-gray-800">
                    <TableCell className="pl-5"><Skeleton className="h-4 w-8" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                    <TableCell className="pr-5"><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : filteredEvents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Calendar className="w-9 h-9 text-gray-300 dark:text-gray-600" />
                      <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                        {hasActiveFilters ? "Nenhum evento encontrado com esses filtros" : "Nenhum evento cadastrado ainda"}
                      </p>
                      {!hasActiveFilters && (
                        <p className="text-xs text-gray-400 dark:text-gray-500">Clique em "Criar Evento" para começar</p>
                      )}
                      {hasActiveFilters && (
                        <Button variant="ghost" size="sm" onClick={clearFilters} className="mt-1 text-gray-500">Limpar filtros</Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredEvents.map((event) => {
                  const displayStatus = getEventStatus(event);
                  const statusCfg = STATUS_CONFIG[displayStatus] ?? STATUS_CONFIG["planejado"];
                  const isDeleted = displayStatus === "excluído";

                  return (
                    <TableRow
                      key={event.id}
                      className={`border-gray-100 dark:border-gray-800 transition-colors ${isDeleted ? "opacity-50" : "hover:bg-gray-50/70 dark:hover:bg-gray-800/40"}`}
                    >
                      <TableCell className="pl-5 text-sm text-gray-400 dark:text-gray-500 tabular-nums">
                        {event.eventNumber}
                      </TableCell>
                      <TableCell className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                        {event.name}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600 dark:text-gray-400">
                        {event.location}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {formatPeriod(event.startDate, event.endDate)}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusCfg.className}`}>
                          {statusCfg.label}
                        </span>
                      </TableCell>
                      <TableCell className="pr-5">
                        <div className="flex items-center gap-1.5 justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenModal(event)}
                            disabled={isDeleted}
                            className="h-8 w-8 p-0 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            data-testid={`button-edit-event-${event.id}`}
                            title="Editar evento"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(event)}
                            disabled={isDeleted}
                            className="h-8 w-8 p-0 text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400"
                            data-testid={`button-delete-event-${event.id}`}
                            title="Excluir evento"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

      </div>

      <EventModal open={isModalOpen} onClose={handleCloseModal} event={editingEvent} />
    </>
  );
}
