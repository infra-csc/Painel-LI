import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { CalendarRange, Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EventCombobox from "@/components/ui/event-combobox";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { usePageTitle } from "@/components/common/use-page-title";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage, cn, formatDateRange, formatDiarias } from "@/lib/utils";
import { formatDateBr, formatDayMonthBr, todayIso } from "@/lib/dates";
import type { Event, ScalingChangeRequest, TeamInclusion } from "@shared/schema";
import {
  SUGESTAO_STATUS, SUGESTAO_STATUS_LABELS, TRANSPORT_MODE_LABELS, CHANGE_REQUEST_STATUS_LABELS,
  isSuggestionInclusion, type SugestaoStatus, type TransportMode, type ChangeRequestStatus,
} from "@shared/scaling-validation-rules";
import type { FunctionWithManagers, SuggestionRow } from "@/components/scaling-validation/types";
import { SuggestionStatusBadge, periodLabel, workDaysOf } from "@/components/scaling-validation/suggestions-list";
import { ScheduleBoard } from "@/components/scaling-validation/schedule-board";
import { RequestStatusBadge, RequestTypeBadge } from "@/components/scaling-approval/request-badges";
import { APPROVAL_QUERY_KEYS } from "@/components/scaling-approval/types";

const ALL = "all";
const LAST_EVENT_KEY = "scaling-event-view:last-event";

type ApiViewRow = TeamInclusion & { requests: ScalingChangeRequest[] };
interface EventViewData {
  suggestions: ApiViewRow[];
  inclusions: ApiViewRow[];
  requests: ScalingChangeRequest[];
}
/** Linha da tela: a da API + os campos que os componentes da Validação (lista/quadro) esperam. */
type EventViewRow = ApiViewRow & SuggestionRow;

const IN_INCLUSION = "__inclusao__";
const ORIGIN_LABEL_INCLUSAO = "Em Inclusão de Equipe";

/** Badge da coluna Origem/Status: sugestão (SUGESTAO_STATUS_LABELS) ou "Em Inclusão de Equipe". */
function OriginBadge({ row }: { row: EventViewRow }) {
  if (isSuggestionInclusion(row)) return <SuggestionStatusBadge status={row.status} />;
  return <span className="inline-flex items-center rounded-full border border-primary/30 bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-primary whitespace-nowrap">{ORIGIN_LABEL_INCLUSAO}</span>;
}
function originKey(row: EventViewRow): string { return isSuggestionInclusion(row) ? row.status : IN_INCLUSION; }
function originLabel(row: EventViewRow): string {
  return isSuggestionInclusion(row) ? (SUGESTAO_STATUS_LABELS[row.status as SugestaoStatus] ?? row.status) : ORIGIN_LABEL_INCLUSAO;
}

const ymd = (v: unknown) => (v ? String(v).slice(0, 10) : "");
function legLabel(mode: string | null | undefined, date: unknown, time: string | null | undefined): string {
  const parts: string[] = [];
  if (mode) parts.push(TRANSPORT_MODE_LABELS[mode as TransportMode] ?? mode);
  if (date) parts.push(formatDayMonthBr(ymd(date)));
  if (time) parts.push(time);
  return parts.length ? parts.join(" ") : "—";
}
function fmtDateTime(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return `${formatDateBr(d)} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}
/** Adapta a linha da API ao formato que SuggestionsList/ScheduleBoard esperam (somente leitura). */
function toViewRow(row: ApiViewRow): EventViewRow {
  return { ...row, canEdit: true, daysPending: 0, pendingRequest: null };
}

const TH = "px-3 py-2 text-left text-[11px] uppercase tracking-widest text-slate-400 font-semibold whitespace-nowrap";

export default function ScalingEventViewPage() {
  usePageTitle("Escala do Evento");
  const { user } = useAuth();
  const canAccess = hasPermission(user, "canAccessScalingEventView");
  const searchString = useSearch();
  const [, setLocation] = useLocation();

  // ── Evento (URL ?eventId= > último usado) ──
  const urlEventId = useMemo(() => new URLSearchParams(searchString).get("eventId") ?? "", [searchString]);
  const [eventId, setEventIdState] = useState(() => urlEventId || (typeof window !== "undefined" ? localStorage.getItem(LAST_EVENT_KEY) ?? "" : ""));
  useEffect(() => { if (urlEventId && urlEventId !== eventId) setEventIdState(urlEventId); }, [urlEventId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (eventId) localStorage.setItem(LAST_EVENT_KEY, eventId); }, [eventId]);
  const setEventId = (id: string) => {
    setEventIdState(id);
    setLocation(id ? `/scaling-event-view?eventId=${encodeURIComponent(id)}` : "/scaling-event-view", { replace: true });
  };

  const [tab, setTab] = useState<"lista" | "escala" | "pedidos">("lista");
  const [search, setSearch] = useState("");
  const [originFilter, setOriginFilter] = useState(ALL);
  const [functionFilter, setFunctionFilter] = useState(ALL);

  // ── Dados ──
  const { data: events, isLoading: loadingEvents } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: functions } = useQuery<FunctionWithManagers[]>({ queryKey: ["/api/functions"] });
  const activeEvents = useMemo(() => (events ?? []).filter((e) => e.status !== "excluido" && e.status !== "excluído"), [events]);
  const selectedEvent = activeEvents.find((e) => e.id === eventId);
  const functionNameById = useMemo(() => new Map((functions ?? []).map((f) => [f.id, f.name])), [functions]);

  const viewQuery = useQuery<EventViewData>({
    queryKey: [APPROVAL_QUERY_KEYS.eventView, eventId],
    queryFn: async () => (await apiRequest("GET", `${APPROVAL_QUERY_KEYS.eventView}?eventId=${encodeURIComponent(eventId)}`)).json(),
    enabled: canAccess && !!eventId,
    staleTime: 15_000,
  });
  const rows = useMemo<EventViewRow[]>(() => [...(viewQuery.data?.suggestions ?? []), ...(viewQuery.data?.inclusions ?? [])].map(toViewRow), [viewQuery.data]);
  const requests = useMemo(() => [...(viewQuery.data?.requests ?? [])].sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()), [viewQuery.data]);

  const functionsInEvent = useMemo(() => {
    const ids = new Set(rows.map((r) => r.functionId));
    return (functions ?? []).filter((f) => ids.has(f.id)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
  }, [rows, functions]);
  const originsInEvent = useMemo(() => {
    const keys = new Set(rows.map(originKey));
    const order = [...Object.values(SUGESTAO_STATUS), IN_INCLUSION];
    return order.filter((k) => keys.has(k)).map((k) => ({ key: k, label: k === IN_INCLUSION ? ORIGIN_LABEL_INCLUSAO : SUGESTAO_STATUS_LABELS[k as SugestaoStatus] }));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => originFilter === ALL || originKey(r) === originFilter)
      .filter((r) => functionFilter === ALL || r.functionId === functionFilter)
      .filter((r) => {
        if (!q) return true;
        const fn = (functionNameById.get(r.functionId) ?? "").toLowerCase();
        return fn.includes(q) || String(r.inclusionNumber).includes(q) || (r.area ?? "").toLowerCase().includes(q) || (r.observations ?? "").toLowerCase().includes(q);
      })
      .sort((a, b) => (functionNameById.get(a.functionId) ?? "").localeCompare(functionNameById.get(b.functionId) ?? "", "pt-BR") || (a.inclusionNumber ?? 0) - (b.inclusionNumber ?? 0));
  }, [rows, originFilter, functionFilter, search, functionNameById]);
  const hasActiveFilters = search.trim() !== "" || originFilter !== ALL || functionFilter !== ALL;
  const clearFilters = () => { setSearch(""); setOriginFilter(ALL); setFunctionFilter(ALL); };

  const counts = useMemo(() => ({
    total: rows.length,
    emInclusao: rows.filter((r) => !isSuggestionInclusion(r)).length,
    aguardando: rows.filter((r) => isSuggestionInclusion(r) && r.status === SUGESTAO_STATUS.PENDENTE).length,
    comPedido: rows.filter((r) => isSuggestionInclusion(r) && r.status === SUGESTAO_STATUS.AJUSTE).length,
    negadas: rows.filter((r) => isSuggestionInclusion(r) && r.status === SUGESTAO_STATUS.NEGADA).length,
    pedidos: requests.length,
  }), [rows, requests]);

  // ── Export CSV (BOM + ;) ──
  const exportCsv = () => {
    const qv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["ID", "Função", "Área", "Origem/Status", "Período", "Dias de trabalho", "Diárias", "Ida", "Volta", "Passagem", "Hotel", "Observações"].join(";");
    const lines = filteredRows.map((r) => {
      const days = workDaysOf(r);
      return [
        qv(`#${r.inclusionNumber}`),
        qv(functionNameById.get(r.functionId) ?? ""),
        qv(r.area ?? ""),
        qv(originLabel(r)),
        qv(periodLabel(r)),
        qv(days.map((d) => formatDayMonthBr(d)).join(", ")),
        qv(days.length || r.dailyRates || 0),
        qv(legLabel(r.transportModeIda, r.flightDepartureDate, r.flightArrivalSuggestedTime)),
        qv(legLabel(r.transportModeVolta, r.flightReturnDate, r.flightReturnSuggestedTime)),
        qv(r.needsTicket ? "Sim" : "Não"),
        qv(r.needsAccommodation ? "Sim" : "Não"),
        qv(r.observations ?? ""),
      ].join(";");
    });
    const blob = new Blob(["﻿" + [header, ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const slug = (selectedEvent?.name ?? "evento").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
    a.download = `escala-${slug}-${todayIso()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ── Render ──
  if (!canAccess) {
    return (
      <PageContainer>
        <div className="bg-card rounded-2xl border border-border p-6">
          <h3 className="text-lg font-semibold text-foreground mb-2">Acesso negado</h3>
          <p className="text-muted-foreground text-sm">Você não tem permissão para acessar a Escala do Evento.</p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer fluid>
      <PageHeader
        icon={CalendarRange}
        title="Escala do Evento"
        subtitle="Consulta somente leitura: todas as vagas que passaram pela Validação de Escala (qualquer status) e o histórico de pedidos."
        actions={
          <Button type="button" size="sm" variant="outline" className="rounded-lg" disabled={!eventId || filteredRows.length === 0} onClick={exportCsv}>
            <Download className="w-4 h-4 mr-1.5" aria-hidden="true" /> Exportar CSV
          </Button>
        }
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3" aria-labelledby="ev-evento">
        <h2 id="ev-evento" className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Evento</h2>
        <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start">
          <div className="space-y-1.5">
            {loadingEvents ? (
              <div className="h-9 rounded-lg bg-slate-100 animate-pulse" aria-hidden="true" />
            ) : (
              <EventCombobox events={activeEvents} value={eventId} onValueChange={(v) => setEventId(v === ALL ? "" : v)} placeholder="Selecione um evento" showAllOption={false} testId="scaling-event-view-event" />
            )}
            {selectedEvent && (
              <p className="text-[11px] text-slate-400">
                Período: <span className="font-mono">{formatDateRange(selectedEvent.startDate, selectedEvent.endDate, { withYear: true })}</span>
                {selectedEvent.location ? ` · ${selectedEvent.location}` : ""}
              </p>
            )}
          </div>
          {eventId && rows.length > 0 && (
            <dl className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
              {[
                ["Vagas", counts.total, ""],
                ["Em Inclusão", counts.emInclusao, "text-primary"],
                ["Aguardando", counts.aguardando, "text-amber-700"],
                ["Com pedido", counts.comPedido, "text-violet-700"],
                ["Negadas", counts.negadas, "text-slate-500"],
                ["Pedidos", counts.pedidos, ""],
              ].map(([label, n, cls]) => (
                <div key={String(label)} className="rounded-xl border border-slate-100 bg-slate-50/60 px-2 py-2">
                  <dt className="text-[10px] uppercase tracking-wide text-slate-400">{label}</dt>
                  <dd className={cn("text-lg font-bold tabular-nums text-slate-800", cls as string)}>{n}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>

      {!eventId ? (
        <EmptyState title="Selecione um evento" description="A escala é consultada por evento. Escolha um acima." />
      ) : viewQuery.isLoading ? (
        <LoadingState count={6} label="Carregando escala do evento…" />
      ) : viewQuery.error ? (
        <div className="rounded-2xl border border-red-200 bg-white p-6 text-center">
          <p className="text-sm font-semibold text-slate-700">Não foi possível carregar a escala</p>
          <p className="text-xs text-slate-400 mt-1">{apiErrorMessage(viewQuery.error, "Verifique sua conexão e tente novamente.")}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => viewQuery.refetch()}>Tentar novamente</Button>
        </div>
      ) : rows.length === 0 && requests.length === 0 ? (
        <EmptyState title="Nenhuma vaga passou pela Validação de Escala neste evento" description="A logística ainda não enviou a escala sugerida deste evento." />
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList className="rounded-xl">
              <TabsTrigger value="lista" className="rounded-lg">Lista</TabsTrigger>
              <TabsTrigger value="escala" className="rounded-lg">Escala</TabsTrigger>
              <TabsTrigger value="pedidos" className="rounded-lg">Pedidos{requests.length ? ` (${requests.length})` : ""}</TabsTrigger>
            </TabsList>
            <p className="text-[11px] text-slate-400" aria-live="polite">
              {tab === "lista" ? `${filteredRows.length} de ${rows.length} vaga(s)` : tab === "escala" ? "Quadro função × dia (vagas negadas não entram)" : `${requests.length} pedido(s)`}
            </p>
          </div>

          <TabsContent value="lista" className="space-y-3 mt-0">
            <div className="rounded-2xl border border-slate-200 bg-white p-3 grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] items-end">
              <div className="space-y-1">
                <Label htmlFor="ev-search" className="text-[11px] text-slate-500">Buscar</Label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <Input id="ev-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Função, #ID, área ou observação" className="h-9 pl-8 rounded-lg" />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="ev-function" className="text-[11px] text-slate-500">Função</Label>
                <Select value={functionFilter} onValueChange={setFunctionFilter}>
                  <SelectTrigger id="ev-function" className="h-9 rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Todas as funções</SelectItem>
                    {functionsInEvent.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="ev-origin" className="text-[11px] text-slate-500">Origem / status</Label>
                <Select value={originFilter} onValueChange={setOriginFilter}>
                  <SelectTrigger id="ev-origin" className="h-9 rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Todos</SelectItem>
                    {originsInEvent.map((o) => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {filteredRows.length === 0 ? (
              <EmptyState variant="filtered" title="Nenhuma vaga com esses filtros" onClearFilters={hasActiveFilters ? clearFilters : undefined} />
            ) : (
              <>
                <div className="hidden md:block rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] text-sm">
                      <caption className="sr-only">Vagas do evento na Validação de Escala</caption>
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className={TH}>ID</th>
                          <th className={TH}>Função</th>
                          <th className={TH}>Área</th>
                          <th className={TH}>Período / diárias</th>
                          <th className={TH}>Ida</th>
                          <th className={TH}>Volta</th>
                          <th className={cn(TH, "text-center")}>Passagem</th>
                          <th className={cn(TH, "text-center")}>Hotel</th>
                          <th className={TH}>Origem / status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.map((row, i) => {
                          const days = workDaysOf(row);
                          const negada = isSuggestionInclusion(row) && row.status === SUGESTAO_STATUS.NEGADA;
                          return (
                            <tr key={row.id} className={cn("border-b border-slate-100", i % 2 === 1 ? "bg-slate-50/40" : "bg-white", negada && "text-slate-400")}>
                              <td className="px-3 py-2 font-mono text-xs text-slate-500 tabular-nums">#{row.inclusionNumber}</td>
                              <td className="px-3 py-2 font-semibold text-slate-800 max-w-[220px]">
                                <span className={cn("block truncate", negada && "line-through text-slate-400")} title={functionNameById.get(row.functionId)}>{functionNameById.get(row.functionId) ?? "—"}</span>
                                {row.observations && <span className="block text-[11px] font-normal text-slate-400 truncate" title={row.observations}>{row.observations}</span>}
                              </td>
                              <td className="px-3 py-2 text-xs text-slate-600">{row.area ?? "—"}</td>
                              <td className="px-3 py-2 text-xs">
                                <span className="font-mono tabular-nums text-slate-700">{periodLabel(row)}</span>
                                <span className="ml-1.5 text-slate-400">· {formatDiarias(days.length || row.dailyRates || 0)}</span>
                              </td>
                              <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{legLabel(row.transportModeIda, row.flightDepartureDate, row.flightArrivalSuggestedTime)}</td>
                              <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{legLabel(row.transportModeVolta, row.flightReturnDate, row.flightReturnSuggestedTime)}</td>
                              <td className="px-3 py-2 text-center text-xs">{row.needsTicket ? <span className="text-violet-700 font-semibold">Sim</span> : <span className="text-slate-300">—</span>}</td>
                              <td className="px-3 py-2 text-center text-xs">{row.needsAccommodation ? <span className="text-sky-700 font-semibold">Sim</span> : <span className="text-slate-300">—</span>}</td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap items-center gap-1">
                                  <OriginBadge row={row} />
                                  {row.requests.length > 0 && <span className="text-[11px] text-slate-400" title="Pedidos sobre esta vaga">{row.requests.length} pedido(s)</span>}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <ul className="md:hidden space-y-2" aria-label="Vagas do evento">
                  {filteredRows.map((row) => {
                    const days = workDaysOf(row);
                    return (
                      <li key={row.id} className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2">
                        <p className="text-sm font-semibold text-slate-800 truncate">
                          <span className="font-mono text-xs text-slate-400 mr-1.5">#{row.inclusionNumber}</span>
                          {functionNameById.get(row.functionId) ?? "—"}
                        </p>
                        <p className="text-[11px] text-slate-400">{row.area ?? "Sem área"}</p>
                        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                          <dt className="text-slate-400">Período</dt><dd className="font-mono text-slate-700">{periodLabel(row)} · {formatDiarias(days.length || row.dailyRates || 0)}</dd>
                          <dt className="text-slate-400">Ida</dt><dd className="text-slate-700">{legLabel(row.transportModeIda, row.flightDepartureDate, row.flightArrivalSuggestedTime)}</dd>
                          <dt className="text-slate-400">Volta</dt><dd className="text-slate-700">{legLabel(row.transportModeVolta, row.flightReturnDate, row.flightReturnSuggestedTime)}</dd>
                          <dt className="text-slate-400">Passagem / hotel</dt><dd className="text-slate-700">{row.needsTicket ? "Passagem" : "—"} / {row.needsAccommodation ? "Hotel" : "—"}</dd>
                        </dl>
                        {row.observations && <p className="text-[11px] text-slate-500 italic">{row.observations}</p>}
                        <OriginBadge row={row} />
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </TabsContent>

          <TabsContent value="escala" className="mt-0">
            <ScheduleBoard rows={rows} functionNameById={functionNameById} rangeStart={selectedEvent?.startDate} rangeEnd={selectedEvent?.endDate} />
          </TabsContent>

          <TabsContent value="pedidos" className="mt-0">
            {requests.length === 0 ? (
              <EmptyState title="Nenhum pedido neste evento" description="As áreas não abriram pedidos de ajuste, inclusão ou exclusão." />
            ) : (
              <>
                <div className="hidden md:block rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-sm">
                      <caption className="sr-only">Histórico de pedidos do evento</caption>
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className={TH}>Tipo</th>
                          <th className={TH}>Função / vaga</th>
                          <th className={TH}>Solicitante</th>
                          <th className={TH}>Aberto em</th>
                          <th className={TH}>Status</th>
                          <th className={TH}>Decisão / comentário</th>
                        </tr>
                      </thead>
                      <tbody>
                        {requests.map((r, i) => (
                          <tr key={r.id} className={cn("border-b border-slate-100 align-top", i % 2 === 1 ? "bg-slate-50/40" : "bg-white")}>
                            <td className="px-3 py-2"><RequestTypeBadge type={r.requestType} /></td>
                            <td className="px-3 py-2 max-w-[260px]">
                              <span className="block font-semibold text-slate-800 truncate">{functionNameById.get(r.functionId) ?? "—"}</span>
                              <span className="block text-[11px] text-slate-400 font-mono">
                                {r.teamInclusionId ? `vaga #${rows.find((x) => x.id === r.teamInclusionId)?.inclusionNumber ?? "—"}` : "vaga nova"}{r.area ? ` · ${r.area}` : ""}
                              </span>
                              {r.reason && <span className="block text-[11px] text-slate-500 mt-0.5 line-clamp-2" title={r.reason}>{r.reason}</span>}
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-700">{r.requestedByName}</td>
                            <td className="px-3 py-2 text-xs font-mono text-slate-500 whitespace-nowrap">{fmtDateTime(r.createdAt)}</td>
                            <td className="px-3 py-2"><RequestStatusBadge status={r.status} /></td>
                            <td className="px-3 py-2 text-xs text-slate-700 max-w-[320px]">
                              {r.reviewedByName ? (
                                <>
                                  <span className="block text-[11px] text-slate-400">{r.reviewedByName} · {fmtDateTime(r.reviewedAt)}</span>
                                  {r.reviewComment && <span className="block whitespace-pre-wrap break-words">{r.reviewComment}</span>}
                                </>
                              ) : <span className="text-slate-300">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <ul className="md:hidden space-y-2" aria-label="Pedidos do evento">
                  {requests.map((r) => (
                    <li key={r.id} className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <RequestTypeBadge type={r.requestType} />
                        <RequestStatusBadge status={r.status} />
                      </div>
                      <p className="text-sm font-semibold text-slate-800">{functionNameById.get(r.functionId) ?? "—"}</p>
                      <p className="text-[11px] text-slate-500">por {r.requestedByName} · {fmtDateTime(r.createdAt)}</p>
                      {r.reason && <p className="text-xs text-slate-600">{r.reason}</p>}
                      {r.reviewedByName && (
                        <p className="text-xs text-slate-700 border-t border-slate-100 pt-2">
                          <span className="block text-[11px] text-slate-400">{CHANGE_REQUEST_STATUS_LABELS[r.status as ChangeRequestStatus] ?? r.status} · {r.reviewedByName} · {fmtDateTime(r.reviewedAt)}</span>
                          {r.reviewComment}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </TabsContent>
        </Tabs>
      )}
    </PageContainer>
  );
}
