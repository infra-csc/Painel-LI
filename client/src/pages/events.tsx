import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Plus, Edit, Trash2, X, ChevronUp, ChevronDown, ChevronsUpDown, RotateCcw, Search, LayoutList, CalendarClock, CalendarCheck, CalendarX } from "lucide-react";
import EventModal from "@/components/modals/event-modal";
import ConfirmModal from "@/components/common/confirm-modal";
import type { Event, TeamInclusion } from "@shared/schema";
import { format } from "date-fns";

// ─── helpers ──────────────────────────────────────────────────────────────────

function getEventStatus(event: Event): string {
  if (event.status === "excluído") return "excluído";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end   = new Date(event.endDate);   end.setHours(0, 0, 0, 0);
  const start = new Date(event.startDate); start.setHours(0, 0, 0, 0);
  if (end < today)   return "concluído";
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

const STATUS: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  planejado:      { label: "Planejado",    dot: "#3B82F6", bg: "#EFF6FF", text: "#1D4ED8" },
  "em andamento": { label: "Em andamento", dot: "#F97316", bg: "#FFF7ED", text: "#C2410C" },
  concluído:      { label: "Concluído",    dot: "#22C55E", bg: "#F0FDF4", text: "#15803D" },
  excluído:       { label: "Excluído",     dot: "#94A3B8", bg: "#F8FAFC", text: "#64748B" },
};

type SortKey = "eventNumber" | "name" | "period" | "status";
type SortDir = "asc" | "desc";

function SortBtn({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown size={11} className="ml-1 inline opacity-30" />;
  return sortDir === "asc"
    ? <ChevronUp size={11} className="ml-1 inline text-[#0033CC]" />
    : <ChevronDown size={11} className="ml-1 inline text-[#0033CC]" />;
}

const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const sel: React.CSSProperties = {
  height: 34, fontSize: 12, padding: "0 8px",
  border: "1px solid #E2E8F0", borderRadius: 7,
  background: "white", color: "#374151",
  fontFamily: "inherit", cursor: "pointer", outline: "none",
};

// ─── component ────────────────────────────────────────────────────────────────

export default function Events() {
  const [isModalOpen,   setIsModalOpen]   = useState(false);
  const [editingEvent,  setEditingEvent]  = useState<Event | null>(null);
  const [search,        setSearch]        = useState("");
  const [statusFilter,  setStatusFilter]  = useState("default");
  const [monthFilter,   setMonthFilter]   = useState("all");
  const [yearFilter,    setYearFilter]    = useState("all");
  const [sortKey,       setSortKey]       = useState<SortKey>("eventNumber");
  const [sortDir,       setSortDir]       = useState<SortDir>("desc");
  const [defaultSort,   setDefaultSort]   = useState(true);
  const [confirmState, setConfirmState] = useState<{
    open: boolean; title: string; message: string; confirmLabel: string; variant?: "delete"|"cancel"|"confirm"; onConfirm: () => void;
  }>({ open: false, title: "", message: "", confirmLabel: "", variant: "delete", onConfirm: () => {} });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: events, isLoading } = useQuery<Event[]>({ queryKey: ["/api/events?includeDeleted=true"] });
  const { data: inclusions }        = useQuery<TeamInclusion[]>({ queryKey: ["/api/team-inclusions"] });

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
    events.forEach(e => { years.add(new Date(e.startDate).getFullYear()); years.add(new Date(e.endDate).getFullYear()); });
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
    setDefaultSort(false);
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const handleStatusChange = (val: string) => {
    setStatusFilter(val);
    if (val === "default") { setSortKey("eventNumber"); setSortDir("desc"); setDefaultSort(true); }
  };

  const filteredAndSorted = useMemo(() => {
    if (!events) return [];
    let list = [...events];
    if (search.trim()) {
      const t = search.toLowerCase();
      list = list.filter(e => e.name.toLowerCase().includes(t) || e.location.toLowerCase().includes(t));
    }
    if (statusFilter === "default") list = list.filter(e => ["planejado","em andamento"].includes(getEventStatus(e)));
    else if (statusFilter === "active") list = list.filter(e => e.status !== "excluído");
    else if (statusFilter !== "all") list = list.filter(e => getEventStatus(e) === statusFilter);
    if (monthFilter !== "all" || yearFilter !== "all") {
      list = list.filter(e => {
        const cur = new Date(new Date(e.startDate).getFullYear(), new Date(e.startDate).getMonth(), 1);
        const endM = new Date(new Date(e.endDate).getFullYear(), new Date(e.endDate).getMonth(), 1);
        while (cur <= endM) {
          const mOk = monthFilter === "all" || cur.getMonth() + 1 === Number(monthFilter);
          const yOk = yearFilter === "all" || cur.getFullYear() === Number(yearFilter);
          if (mOk && yOk) return true;
          cur.setMonth(cur.getMonth() + 1);
        }
        return false;
      });
    }
    if (defaultSort && statusFilter === "default") {
      list.sort((a, b) => {
        const p = (getEventStatus(a) === "em andamento" ? 0 : 1) - (getEventStatus(b) === "em andamento" ? 0 : 1);
        return p !== 0 ? p : b.eventNumber - a.eventNumber;
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
  }, [events, search, statusFilter, monthFilter, yearFilter, sortKey, sortDir, defaultSort]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/events?includeDeleted=true"] });
  };

  const deleteMutation = useMutation({
    mutationFn: async (ev: Event) => (await apiRequest("PUT", `/api/events/${ev.id}`, { status: "excluído" })).json(),
    onSuccess: async () => { await invalidate(); toast({ title: "Sucesso", description: "Evento marcado como excluído." }); },
    onError: () => toast({ title: "Erro", description: "Erro ao excluir evento.", variant: "destructive" }),
  });
  const restoreMutation = useMutation({
    mutationFn: async (ev: Event) => (await apiRequest("PUT", `/api/events/${ev.id}`, { status: "planejado" })).json(),
    onSuccess: async () => { await invalidate(); toast({ title: "Sucesso", description: "Evento restaurado." }); },
    onError: () => toast({ title: "Erro", description: "Erro ao restaurar evento.", variant: "destructive" }),
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

  return (
    <TooltipProvider>
      <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── Page header ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "#0033CC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: "white", fontVariationSettings: "'FILL' 1" }}>event</span>
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", margin: 0, lineHeight: 1.2 }}>Eventos</h1>
            <p style={{ fontSize: 12, color: "#94A3B8", margin: 0 }}>Controle e acompanhamento de cronogramas logísticos</p>
          </div>
          <button
            onClick={() => openModal()}
            data-testid="button-add-event"
            style={{
              marginLeft: "auto", height: 36, padding: "0 16px",
              borderRadius: 8, background: "#0033CC", color: "white",
              border: "none", cursor: "pointer", fontFamily: "inherit",
              fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 7,
            }}
          >
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
                  onMouseLeave={e => (e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.05)")}
                >
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

        {/* ── Filter bar ── */}
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #F1F5F9", padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>

            {/* Search */}
            <div style={{ position: "relative", flex: "1 1 200px", minWidth: 160 }}>
              <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#CBD5E1" }} />
              <input
                placeholder="Buscar por nome ou cidade..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                data-testid="input-search-event"
                style={{ ...sel, paddingLeft: 28, paddingRight: search ? 28 : 8, width: "100%", flex: "none" }}
              />
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
                <X size={11} />
                Limpar
              </button>
            )}

            {/* Count */}
            <span style={{ marginLeft: "auto", fontSize: 11, color: "#94A3B8", whiteSpace: "nowrap" }}>
              {filteredAndSorted.length} evento{filteredAndSorted.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* ── Table ── */}
        <div style={{ background: "white", borderRadius: 10, border: "1px solid #F1F5F9", overflow: "hidden" }}>
          {isLoading ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: "#CBD5E1", fontSize: 13 }}>Carregando eventos...</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#FAFBFF", borderBottom: "1px solid #F1F5F9" }}>
                    {([
                      { key: "eventNumber", label: "Nº",             w: 60,  center: true },
                      { key: "name",        label: "Evento",         w: null },
                      { key: null,          label: "Localização",    w: 160 },
                      { key: "period",      label: "Período",        w: 140 },
                      { key: "status",      label: "Status",         w: 130 },
                      { key: null,          label: "Escal.",         w: 70,  center: true, tooltip: "Escalações ativas" },
                      { key: null,          label: "Ações",          w: 80,  right: true },
                    ] as { key: SortKey | null; label: string; w: number | null; center?: boolean; right?: boolean; tooltip?: string }[]).map((col, i) => (
                      <th key={i}
                        onClick={() => col.key && handleSort(col.key)}
                        style={{
                          padding: "10px 14px",
                          fontSize: 10, fontWeight: 700, color: "#94A3B8",
                          textTransform: "uppercase", letterSpacing: "0.07em",
                          textAlign: col.center ? "center" : col.right ? "right" : "left",
                          cursor: col.key ? "pointer" : "default",
                          userSelect: "none",
                          width: col.w ?? undefined,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {col.tooltip
                          ? <Tooltip><TooltipTrigger asChild><span>{col.label} {col.key && <SortBtn col={col.key} sortKey={sortKey} sortDir={sortDir} />}</span></TooltipTrigger><TooltipContent>{col.tooltip}</TooltipContent></Tooltip>
                          : <>{col.label} {col.key && <SortBtn col={col.key} sortKey={sortKey} sortDir={sortDir} />}</>
                        }
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSorted.map((event, idx) => {
                    const ds = getEventStatus(event);
                    const sc = STATUS[ds] ?? STATUS["planejado"];
                    const isDeleted  = ds === "excluído";
                    const isOngoing  = ds === "em andamento";
                    const escalacoes = escalacoesByEvent[event.id] ?? 0;
                    return (
                      <tr key={event.id}
                        style={{
                          borderTop: idx > 0 ? "1px solid #F8FAFC" : "none",
                          background: "white",
                          opacity: isDeleted ? 0.55 : 1,
                          transition: "background 0.1s",
                        }}
                        className="group hover:bg-slate-50/60"
                      >
                        {/* Nº */}
                        <td style={{ padding: "11px 14px", textAlign: "center" }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#CBD5E1", fontVariantNumeric: "tabular-nums" }}>
                            #{event.eventNumber}
                          </span>
                        </td>

                        {/* Nome */}
                        <td style={{ padding: "11px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {isOngoing && (
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#F97316", flexShrink: 0, animation: "pulse 2s infinite" }} />
                            )}
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{event.name}</span>
                          </div>
                        </td>

                        {/* Localização */}
                        <td style={{ padding: "11px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#CBD5E1", fontVariationSettings: "'FILL' 1" }}>location_on</span>
                            <span style={{ fontSize: 12, color: "#64748B" }}>{event.location}</span>
                          </div>
                        </td>

                        {/* Período */}
                        <td style={{ padding: "11px 14px" }}>
                          <span style={{ fontSize: 12, color: "#64748B", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                            {formatPeriod(event.startDate, event.endDate)}
                          </span>
                        </td>

                        {/* Status badge */}
                        <td style={{ padding: "11px 14px" }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 5,
                            padding: "3px 9px", borderRadius: 20,
                            background: sc.bg, color: sc.text,
                            fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
                          }}>
                            <span style={{ width: 5, height: 5, borderRadius: "50%", background: sc.dot, flexShrink: 0 }} />
                            {sc.label}
                          </span>
                        </td>

                        {/* Escalações */}
                        <td style={{ padding: "11px 14px", textAlign: "center" }}>
                          {escalacoes > 0
                            ? <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{escalacoes}</span>
                            : <span style={{ fontSize: 12, color: "#E2E8F0" }}>—</span>}
                        </td>

                        {/* Ações */}
                        <td style={{ padding: "11px 14px", textAlign: "right" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2 }}>
                            {isDeleted ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button onClick={() => confirmRestore(event)} data-testid={`button-restore-event-${event.id}`}
                                    style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8" }}
                                    className="hover:bg-emerald-50 hover:!text-emerald-600 transition-colors">
                                    <RotateCcw size={14} />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Restaurar</TooltipContent>
                              </Tooltip>
                            ) : (
                              <>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button onClick={() => openModal(event)} data-testid={`button-edit-event-${event.id}`}
                                      style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8" }}
                                      className="hover:bg-blue-50 hover:!text-[#0033CC] transition-colors">
                                      <Edit size={13} />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>Editar</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button onClick={() => confirmDelete(event)} data-testid={`button-delete-event-${event.id}`}
                                      style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8" }}
                                      className="hover:bg-red-50 hover:!text-red-500 transition-colors">
                                      <Trash2 size={13} />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>Excluir</TooltipContent>
                                </Tooltip>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredAndSorted.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: "48px 0" }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 32, color: "#E2E8F0", display: "block", marginBottom: 8 }}>event_busy</span>
                        <p style={{ fontSize: 13, color: "#CBD5E1", margin: 0 }}>
                          {statusFilter === "default" && !search && monthFilter === "all" && yearFilter === "all"
                            ? 'Nenhum evento planejado ou em andamento.'
                            : 'Nenhum evento encontrado com os filtros aplicados.'}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      <EventModal
        open={isModalOpen}
        onClose={closeModal}
        event={editingEvent}
      />
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
