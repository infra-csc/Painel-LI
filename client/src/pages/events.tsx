import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Calendar, Plus, Pencil, Trash2, Search, X } from "lucide-react";
import EventModal from "@/components/modals/event-modal";
import type { Event } from "@shared/schema";
import { format, addMonths, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";

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
    const sameDay = s.toDateString() === e.toDateString();
    const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
    if (sameDay) return format(s, "dd MMM yyyy", { locale: ptBR });
    if (sameMonth) return `${format(s, "dd")}–${format(e, "dd MMM yyyy", { locale: ptBR })}`;
    return `${format(s, "dd MMM", { locale: ptBR })} – ${format(e, "dd MMM yyyy", { locale: ptBR })}`;
  } catch { return `${startStr} – ${endStr}`; }
}

function getPeriodRange(p: string) {
  const now = new Date();
  if (p === "this_month")  return { start: startOfMonth(now),           end: endOfMonth(now) };
  if (p === "next_month")  { const nm = addMonths(now, 1); return { start: startOfMonth(nm), end: endOfMonth(nm) }; }
  if (p === "last_month")  { const lm = addMonths(now, -1); return { start: startOfMonth(lm), end: endOfMonth(lm) }; }
  if (p === "this_year")   return { start: startOfYear(now),            end: endOfYear(now) };
  return { start: null, end: null };
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  planejado:      { label: "Planejado",      cls: "bg-blue-50 text-blue-700 ring-1 ring-blue-200/80 dark:bg-blue-950/60 dark:text-blue-300 dark:ring-blue-800" },
  "em andamento": { label: "Em andamento",   cls: "bg-amber-50 text-amber-700 ring-1 ring-amber-200/80 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-800" },
  concluído:      { label: "Concluído",      cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-800" },
  excluído:       { label: "Excluído",       cls: "bg-gray-100 text-gray-400 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-500 dark:ring-gray-700" },
};

export default function Events() {
  const [isModalOpen, setIsModalOpen]   = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [searchTerm, setSearchTerm]     = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: events, isLoading } = useQuery<Event[]>({ queryKey: ["/api/events"] });

  const filtered = useMemo(() => {
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
    return list.sort((a, b) => b.eventNumber - a.eventNumber);
  }, [events, searchTerm, statusFilter, periodFilter]);

  const deleteMutation = useMutation({
    mutationFn: async (ev: Event) => (await apiRequest("PUT", `/api/events/${ev.id}`, { status: "excluído" })).json(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      await queryClient.refetchQueries({ queryKey: ["/api/events"] });
      toast({ title: "Evento excluído", description: "O evento foi marcado como excluído." });
    },
    onError: () => toast({ title: "Erro", description: "Não foi possível excluir o evento.", variant: "destructive" }),
  });

  const openModal  = (ev?: Event) => { setEditingEvent(ev ?? null); setIsModalOpen(true); };
  const closeModal = () => { setIsModalOpen(false); setEditingEvent(null); };
  const handleDelete = (ev: Event) => {
    if (confirm(`Excluir "${ev.name}"? O evento continuará visível como excluído.`)) deleteMutation.mutate(ev);
  };
  const clearFilters = () => { setSearchTerm(""); setStatusFilter("all"); setPeriodFilter("all"); };
  const hasFilters = searchTerm || statusFilter !== "all" || periodFilter !== "all";

  return (
    <>
      <div className="p-6 max-w-5xl mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">Eventos</h1>
            <p className="mt-0.5 text-sm text-gray-400 dark:text-gray-500">Gerencie os eventos do sistema</p>
          </div>
          <Button onClick={() => openModal()} className="gap-2 shadow-sm" data-testid="button-add-event">
            <Plus className="w-4 h-4" />
            Criar Evento
          </Button>
        </div>

        {/* ── Filters ── */}
        <div className="flex flex-wrap gap-2.5 items-center">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Buscar evento ou cidade..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 pr-8 h-9 text-sm"
              data-testid="input-search-event"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 h-9 text-sm" data-testid="select-status-filter">
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
            <SelectTrigger className="w-44 h-9 text-sm">
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

          {hasFilters && (
            <>
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-gray-500 gap-1.5 px-3" data-testid="button-clear-filters">
                <X className="w-3.5 h-3.5" />
                Limpar
              </Button>
              <span className="text-xs text-gray-400 ml-auto">
                {filtered.length} evento{filtered.length !== 1 ? "s" : ""}
              </span>
            </>
          )}
        </div>

        {/* ── List ── */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700/70 rounded-xl overflow-hidden shadow-sm">
          {isLoading ? (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-4">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-52" />
                    <Skeleton className="h-3 w-36" />
                  </div>
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-5 w-20 rounded-full" />
                    <Skeleton className="h-7 w-7 rounded" />
                    <Skeleton className="h-7 w-7 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Calendar className="w-10 h-10 text-gray-300 dark:text-gray-700" />
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {hasFilters ? "Nenhum evento encontrado" : "Nenhum evento cadastrado"}
              </p>
              {!hasFilters && (
                <p className="text-xs text-gray-400 dark:text-gray-500">Clique em "Criar Evento" para começar</p>
              )}
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-gray-500 mt-1">Limpar filtros</Button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map(ev => {
                const status = getEventStatus(ev);
                const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG["planejado"];
                const deleted = status === "excluído";
                return (
                  <li
                    key={ev.id}
                    className={`flex items-center gap-4 px-5 py-3.5 transition-colors ${deleted ? "opacity-50" : "hover:bg-gray-50/80 dark:hover:bg-gray-800/40"}`}
                  >
                    {/* Text block */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium leading-snug truncate ${deleted ? "text-gray-400 dark:text-gray-500" : "text-gray-900 dark:text-gray-100"}`}>
                        {ev.name}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500 truncate">
                        {ev.location}
                        <span className="mx-1.5 text-gray-300 dark:text-gray-700">•</span>
                        {formatPeriod(ev.startDate, ev.endDate)}
                      </p>
                    </div>

                    {/* Status */}
                    <span className={`shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
                      {cfg.label}
                    </span>

                    {/* Actions */}
                    <div className="shrink-0 flex items-center gap-0.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openModal(ev)}
                        disabled={deleted}
                        className="h-8 w-8 p-0 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                        data-testid={`button-edit-event-${ev.id}`}
                        title="Editar"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(ev)}
                        disabled={deleted}
                        className="h-8 w-8 p-0 text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                        data-testid={`button-delete-event-${ev.id}`}
                        title="Excluir"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

      </div>

      <EventModal open={isModalOpen} onClose={closeModal} event={editingEvent} />
    </>
  );
}
