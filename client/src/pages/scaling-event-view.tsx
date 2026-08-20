import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { CalendarRange, Download, ExternalLink, Search } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { hasPermission } from "@/lib/role-utils";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage, cn, formatDateRange, formatDiarias } from "@/lib/utils";
import { formatDateBr, formatDayMonthBr, todayIso } from "@/lib/dates";
import { scalingHref, useScalingEvent } from "@/lib/use-scaling-event";
import type { Event, ScalingChangeRequest, TeamInclusion } from "@shared/schema";
import {
  SUGESTAO_STATUS, SUGESTAO_STATUS_LABELS, TRANSPORT_MODE_LABELS, CHANGE_REQUEST_STATUS_LABELS, CHANGE_REQUEST_TYPE_LABELS,
  isSuggestionInclusion, type SugestaoStatus, type TransportMode, type ChangeRequestStatus, type ChangeRequestType,
} from "@shared/scaling-validation-rules";
import { workDaysOf, ymd, type FunctionWithManagers, type SuggestionRow } from "@/components/scaling-validation/types";
import { SuggestionStatusBadge, periodLabel } from "@/components/scaling-validation/suggestions-list";
import { ScheduleBoard } from "@/components/scaling-validation/schedule-board";
import { buildReadDateList } from "@/components/scaling-validation/scaling-grid-utils";
import { ScalingModuleNav } from "@/components/scaling-validation/scaling-module-nav";
import { RequestStatusBadge, RequestTypeBadge } from "@/components/scaling-approval/request-badges";
import { APPROVAL_QUERY_KEYS } from "@/components/scaling-approval/types";

const ALL = "all";
const BASE_PATH = "/scaling-event-view";

type ApiViewRow = TeamInclusion & { requests: ScalingChangeRequest[] };
interface EventViewData {
  suggestions: ApiViewRow[];
  inclusions: ApiViewRow[];
  requests: ScalingChangeRequest[];
}
/** Linha da tela: a da API + os campos que os componentes da Validação (lista/quadro) esperam. */
type EventViewRow = ApiViewRow & SuggestionRow;

type Tab = "lista" | "escala" | "pedidos";
const TABS: Tab[] = ["lista", "escala", "pedidos"];
const TAB_LABEL: Record<Tab, string> = { lista: "Lista", escala: "Escala", pedidos: "Pedidos" };

/** Chaves de "origem/status" além dos status de sugestão. */
const IN_INCLUSION = "__inclusao__";
const DELETED = "__excluida__";
const ORIGIN_LABEL_INCLUSAO = "Em Inclusão de Equipe";
const ORIGIN_LABEL_EXCLUIDA = "Excluída";

const isDeleted = (row: { deletedAt?: unknown }) => !!row.deletedAt;
function originKey(row: EventViewRow): string {
  if (isDeleted(row)) return DELETED;
  return isSuggestionInclusion(row) ? row.status : IN_INCLUSION;
}
function originLabel(row: EventViewRow): string {
  const k = originKey(row);
  if (k === DELETED) return `${ORIGIN_LABEL_EXCLUIDA} em ${formatDayMonthBr(row.deletedAt as Date)}`;
  if (k === IN_INCLUSION) return ORIGIN_LABEL_INCLUSAO;
  return SUGESTAO_STATUS_LABELS[k as SugestaoStatus] ?? k;
}
const ORIGIN_ORDER = [...Object.values(SUGESTAO_STATUS), IN_INCLUSION, DELETED];
const ORIGIN_LABELS: Record<string, string> = { ...SUGESTAO_STATUS_LABELS, [IN_INCLUSION]: ORIGIN_LABEL_INCLUSAO, [DELETED]: ORIGIN_LABEL_EXCLUIDA };

/** Badge da coluna Origem/Status: sugestão (SUGESTAO_STATUS_LABELS), "Em Inclusão de Equipe" ou "Excluída em dd/mm". */
function OriginBadge({ row }: { row: EventViewRow }) {
  if (isDeleted(row)) {
    return <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 whitespace-nowrap line-through decoration-red-300">{originLabel(row)}</span>;
  }
  if (isSuggestionInclusion(row)) return <SuggestionStatusBadge status={row.status} />;
  return <span className="inline-flex items-center rounded-full border border-primary/30 bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-primary whitespace-nowrap">{ORIGIN_LABEL_INCLUSAO}</span>;
}

/** Cor sutil por origem/status — mesma paleta dos badges (legenda do quadro e KPIs). */
const ORIGIN_DOT: Record<string, string> = {
  [SUGESTAO_STATUS.PENDENTE]: "bg-amber-400",
  [SUGESTAO_STATUS.VALIDADA]: "bg-sky-400",
  [SUGESTAO_STATUS.AJUSTE]: "bg-violet-400",
  [SUGESTAO_STATUS.APROVADA]: "bg-emerald-400",
  [SUGESTAO_STATUS.NEGADA]: "bg-slate-300",
  [IN_INCLUSION]: "bg-primary",
  [DELETED]: "bg-red-300",
};

function legLabel(mode: string | null | undefined, date: string | Date | null | undefined, time: string | null | undefined): string {
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
/**
 * Adapta a linha da API ao formato que SuggestionsList/ScheduleBoard esperam.
 * `canEdit: true` é proposital: o ScheduleBoard usa `canEdit=false` só para
 * pintar a linha de cinza com "somente leitura" (escopo do usuário na
 * Validação) e não expõe prop `readOnly`; aqui a tela inteira já é consulta,
 * então todas as linhas ficam na cor normal.
 */
function toViewRow(row: ApiViewRow): EventViewRow {
  return { ...row, canEdit: true, canDecide: false, daysPending: 0, pendingRequest: null, lastDecision: null, lastVagaDecision: null };
}

/** Slug ASCII p/ nome de arquivo. */
const slugify = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
function downloadCsv(filename: string, header: string[], lines: string[][]) {
  const qv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const body = [header.map(qv).join(";"), ...lines.map((l) => l.map(qv).join(";"))].join("\r\n");
  const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

const TH = "px-3 py-2 text-left text-[11px] uppercase tracking-widest text-slate-500 font-semibold whitespace-nowrap";
const LABEL = "text-xs text-slate-500";

export default function ScalingEventViewPage() {
  usePageTitle("Histórico da Escala");
  const { user } = useAuth();
  const { toast } = useToast();
  // Acesso à rota já é garantido pelo ProtectedRoute (App.tsx) — sem guard duplicado aqui.
  const canOpenApproval = hasPermission(user, "canAccessScalingApproval");
  const searchString = useSearch();
  const [, setLocation] = useLocation();

  // ── Aba (deep-link ?tab=) — derivada da URL ──
  const tab = useMemo<Tab>(() => {
    const t = new URLSearchParams(searchString).get("tab");
    return (TABS as string[]).includes(t ?? "") ? (t as Tab) : "lista";
  }, [searchString]);
  const tabParams = useCallback((t: Tab): Record<string, string> => (t === "lista" ? {} : { tab: t }), []);

  // ── Evento (URL ?eventId= > último usado no módulo) ──
  const { eventId, setEventId, sanitize } = useScalingEvent(BASE_PATH, { extraParams: () => tabParams(tab) });
  const setTab = useCallback((t: Tab) => {
    setLocation(scalingHref(BASE_PATH, eventId, tabParams(t)), { replace: true });
  }, [eventId, setLocation, tabParams]);

  const [search, setSearch] = useState("");
  const [originFilter, setOriginFilter] = useState(ALL);
  const [functionFilter, setFunctionFilter] = useState(ALL);
  /** Filtro de status do quadro (legenda clicável). */
  const [boardFilter, setBoardFilter] = useState(ALL);

  // ── Dados ──
  const { data: events, isLoading: loadingEvents } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: functions } = useQuery<FunctionWithManagers[]>({ queryKey: ["/api/functions"] });
  const activeEvents = useMemo(() => (events ?? []).filter((e) => e.status !== "excluido" && e.status !== "excluído"), [events]);
  const selectedEvent = activeEvents.find((e) => e.id === eventId);
  const functionNameById = useMemo(() => new Map((functions ?? []).map((f) => [f.id, f.name])), [functions]);
  useEffect(() => { sanitize(events ? activeEvents.map((e) => e.id) : undefined); }, [events, activeEvents, sanitize]);

  const viewQuery = useQuery<EventViewData>({
    queryKey: [APPROVAL_QUERY_KEYS.eventView, eventId],
    queryFn: async () => (await apiRequest("GET", `${APPROVAL_QUERY_KEYS.eventView}?eventId=${encodeURIComponent(eventId)}`)).json(),
    enabled: !!eventId,
    staleTime: 15_000,
  });
  const rows = useMemo<EventViewRow[]>(() => [...(viewQuery.data?.suggestions ?? []), ...(viewQuery.data?.inclusions ?? [])].map(toViewRow), [viewQuery.data]);
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  /** Vagas vivas (sem soft-delete) — base dos KPIs e do quadro. */
  const liveRows = useMemo(() => rows.filter((r) => !isDeleted(r)), [rows]);
  const deletedCount = rows.length - liveRows.length;
  const requests = useMemo(() => [...(viewQuery.data?.requests ?? [])].sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()), [viewQuery.data]);

  const functionsInEvent = useMemo(() => {
    const ids = new Set(rows.map((r) => r.functionId));
    return (functions ?? []).filter((f) => ids.has(f.id)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
  }, [rows, functions]);
  const originsInEvent = useMemo(() => {
    const keys = new Set(rows.map(originKey));
    return ORIGIN_ORDER.filter((k) => keys.has(k)).map((k) => ({ key: k, label: ORIGIN_LABELS[k] }));
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

  // ── KPIs (só vagas vivas; a soma das 6 categorias = Vagas) ──
  const counts = useMemo(() => {
    const by = (k: string) => liveRows.filter((r) => originKey(r) === k).length;
    return {
      total: liveRows.length,
      pendentes: by(SUGESTAO_STATUS.PENDENTE),
      validadas: by(SUGESTAO_STATUS.VALIDADA),
      comPedido: by(SUGESTAO_STATUS.AJUSTE),
      aprovadas: by(SUGESTAO_STATUS.APROVADA),
      negadas: by(SUGESTAO_STATUS.NEGADA),
      emInclusao: by(IN_INCLUSION),
    };
  }, [liveRows]);
  const KPIS: { key: string; label: string; n: number; cls: string; hint?: string }[] = [
    { key: ALL, label: "Vagas", n: counts.total, cls: "text-slate-800" },
    { key: SUGESTAO_STATUS.PENDENTE, label: "Pendentes", n: counts.pendentes, cls: "text-amber-700" },
    // Validar não aprova (regra de 19/08): a vaga validada pela área fica parada
    // aguardando o aprovador — o rótulo mostra o que está travando, não o que já passou.
    {
      key: SUGESTAO_STATUS.VALIDADA,
      label: "Aguardando aprovação",
      n: counts.validadas,
      cls: "text-sky-700",
      hint: "Validadas pela área e aguardando a decisão do aprovador — clique para filtrar a Lista",
    },
    { key: SUGESTAO_STATUS.AJUSTE, label: "Com pedido", n: counts.comPedido, cls: "text-violet-700" },
    { key: SUGESTAO_STATUS.APROVADA, label: "Aprovadas", n: counts.aprovadas, cls: "text-emerald-700" },
    { key: SUGESTAO_STATUS.NEGADA, label: "Negadas", n: counts.negadas, cls: "text-slate-500" },
    { key: IN_INCLUSION, label: "Em Inclusão", n: counts.emInclusao, cls: "text-primary" },
  ];
  /** KPI clicável: aplica o filtro de origem e volta à Lista; clicar de novo limpa. */
  const onKpiClick = (key: string) => {
    setOriginFilter((cur) => (key === ALL || cur === key ? ALL : key));
    if (tab !== "lista") setTab("lista");
  };

  // ── Quadro (Escala): vagas vivas, sem negadas (o board já ignora), com filtro de legenda ──
  const boardRowsAll = useMemo(() => liveRows.filter((r) => originKey(r) !== SUGESTAO_STATUS.NEGADA), [liveRows]);
  const boardLegend = useMemo(() => {
    const keys = new Set(boardRowsAll.map(originKey));
    return ORIGIN_ORDER.filter((k) => keys.has(k)).map((k) => ({ key: k, label: ORIGIN_LABELS[k], n: boardRowsAll.filter((r) => originKey(r) === k).length }));
  }, [boardRowsAll]);
  const boardRows = useMemo(() => (boardFilter === ALL ? boardRowsAll : boardRowsAll.filter((r) => originKey(r) === boardFilter)), [boardRowsAll, boardFilter]);
  useEffect(() => { if (boardFilter !== ALL && !boardLegend.some((l) => l.key === boardFilter)) setBoardFilter(ALL); }, [boardLegend, boardFilter]);

  // ── Export CSV da ABA corrente (BOM + ;) ──
  const exportEnabled = !!eventId && (tab === "lista" ? filteredRows.length > 0 : tab === "escala" ? boardRows.length > 0 : requests.length > 0);
  const exportCsv = () => {
    const slug = slugify(selectedEvent?.name ?? "evento");
    const filename = `historico-escala-${slug}-${tab}-${todayIso()}.csv`;
    if (tab === "lista") {
      const header = ["ID", "Função", "Área", "Origem/Status", "Período", "Dias de trabalho", "Diárias", "Ida", "Volta", "Passagem", "Hotel", "Pedidos", "Observações"];
      const lines = filteredRows.map((r) => {
        const days = workDaysOf(r);
        return [
          `#${r.inclusionNumber}`, functionNameById.get(r.functionId) ?? "", r.area ?? "", originLabel(r), periodLabel(r),
          days.map((d) => formatDayMonthBr(d)).join(", "), String(days.length || r.dailyRates || 0),
          legLabel(r.transportModeIda, r.flightDepartureDate, r.flightArrivalSuggestedTime),
          legLabel(r.transportModeVolta, r.flightReturnDate, r.flightReturnSuggestedTime),
          r.needsTicket ? "Sim" : "Não", r.needsAccommodation ? "Sim" : "Não", String(r.requests.length), r.observations ?? "",
        ];
      });
      downloadCsv(filename, header, lines);
      return;
    }
    if (tab === "escala") {
      // Mesma agregação do ScheduleBoard: função × dia (soma de vagas por dia).
      let min = ymd(selectedEvent?.startDate); let max = ymd(selectedEvent?.endDate);
      for (const r of boardRows) {
        const days = workDaysOf(r);
        if (!days.length) continue;
        if (!min || days[0] < min) min = days[0];
        if (!max || days[days.length - 1] > max) max = days[days.length - 1];
      }
      // Mesmo teto de leitura do quadro: trunca (com aviso) em vez de exportar sem coluna de dia.
      const { dates, totalDays, truncated } = min && max ? buildReadDateList(min, max) : { dates: [] as string[], totalDays: 0, truncated: false };
      if (truncated) {
        toast({
          title: "Período muito longo para o CSV",
          description: `O evento cobre ${totalDays} dias; o arquivo traz os ${dates.length} primeiros.`,
          variant: "destructive",
        });
      }
      const byFn = new Map<string, { name: string; area: string; vagas: number; perDay: Record<string, number>; total: number }>();
      for (const r of boardRows) {
        let l = byFn.get(r.functionId);
        if (!l) { l = { name: functionNameById.get(r.functionId) ?? "—", area: r.area ?? "", vagas: 0, perDay: {}, total: 0 }; byFn.set(r.functionId, l); }
        l.vagas += 1;
        for (const d of workDaysOf(r)) { l.perDay[d] = (l.perDay[d] || 0) + 1; l.total += 1; }
      }
      const fnLines = Array.from(byFn.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
      const lines = fnLines.map((l) => [l.name, l.area, String(l.vagas), ...dates.map((d) => String(l.perDay[d] || 0)), String(l.total)]);
      const totalRow = [
        "Total por dia", "", String(fnLines.reduce((a, l) => a + l.vagas, 0)),
        ...dates.map((d) => String(fnLines.reduce((a, l) => a + (l.perDay[d] || 0), 0))),
        String(fnLines.reduce((a, l) => a + l.total, 0)),
      ];
      downloadCsv(filename, ["Função", "Área", "Vagas", ...dates.map((d) => formatDayMonthBr(d)), "Pessoas-dia"], [...lines, totalRow]);
      return;
    }
    const header = ["Tipo", "Função", "Vaga", "Área", "Solicitante", "Aberto em", "Motivo", "Status", "Revisado por", "Revisado em", "Comentário"];
    const lines = requests.map((r) => [
      CHANGE_REQUEST_TYPE_LABELS[r.requestType as ChangeRequestType] ?? r.requestType,
      functionNameById.get(r.functionId) ?? "",
      r.teamInclusionId ? `#${rowById.get(r.teamInclusionId)?.inclusionNumber ?? "—"}` : "vaga nova",
      r.area ?? "", r.requestedByName ?? "", fmtDateTime(r.createdAt), r.reason ?? "",
      CHANGE_REQUEST_STATUS_LABELS[r.status as ChangeRequestStatus] ?? r.status,
      r.reviewedByName ?? "", r.reviewedAt ? fmtDateTime(r.reviewedAt) : "", r.reviewComment ?? "",
    ]);
    downloadCsv(filename, header, lines);
  };

  const approvalLink = (r: ScalingChangeRequest) => (
    canOpenApproval ? (
      <Link href={scalingHref("/scaling-approval", eventId, { request: r.id })} className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline whitespace-nowrap" title="Abrir este pedido na Aprovação de Escala">
        <ExternalLink className="w-3 h-3" aria-hidden="true" /> Abrir na Aprovação
      </Link>
    ) : null
  );

  // ── Render ──
  return (
    <PageContainer fluid>
      <PageHeader
        icon={CalendarRange}
        title="Histórico da Escala"
        subtitle="Consulta somente leitura: todas as vagas que passaram pela Validação de Escala (qualquer status) e o histórico de pedidos."
        actions={
          <>
            <ScalingModuleNav current="history" eventId={eventId} />
            <Button type="button" size="sm" variant="outline" className="rounded-lg" disabled={!exportEnabled} onClick={exportCsv} title={`Exporta a aba ${TAB_LABEL[tab]}`}>
              <Download className="w-4 h-4 mr-1.5" aria-hidden="true" /> Exportar CSV · {TAB_LABEL[tab]}
            </Button>
          </>
        }
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3" aria-labelledby="ev-evento">
        <h2 id="ev-evento" className="text-xs font-bold uppercase tracking-wide text-slate-500">Evento</h2>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,4fr)] items-start">
          <div className="space-y-1.5">
            {loadingEvents ? (
              <div className="h-9 rounded-lg bg-slate-100 animate-pulse" aria-hidden="true" />
            ) : (
              <EventCombobox events={activeEvents} value={eventId} onValueChange={(v) => setEventId(v === ALL ? "" : v)} placeholder="Selecione um evento" showAllOption={false} testId="scaling-event-view-event" />
            )}
            {selectedEvent && (
              <p className={LABEL}>
                Período: <span className="font-mono">{formatDateRange(selectedEvent.startDate, selectedEvent.endDate, { withYear: true })}</span>
                {selectedEvent.location ? ` · ${selectedEvent.location}` : ""}
              </p>
            )}
          </div>
          {eventId && rows.length > 0 && (
            <div className="space-y-1">
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-center" role="group" aria-label="Resumo das vagas (clique para filtrar a Lista)">
                {KPIS.map((k) => {
                  const active = k.key === ALL ? originFilter === ALL : originFilter === k.key;
                  return (
                    <button
                      key={k.key}
                      type="button"
                      onClick={() => onKpiClick(k.key)}
                      aria-pressed={k.key === ALL ? undefined : active}
                      title={k.key === ALL ? "Limpar filtro de origem/status" : active ? "Clique para limpar o filtro" : k.hint ?? `Filtrar a Lista por "${k.label}"`}
                      className={cn(
                        "rounded-xl border px-2 py-2 text-left sm:text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                        active && k.key !== ALL ? "border-primary/40 bg-brand-soft" : "border-slate-100 bg-slate-50/60 hover:border-slate-300 hover:bg-white",
                      )}
                    >
                      <span className="flex items-center justify-center gap-1 text-xs text-slate-500 leading-tight">
                        {k.key !== ALL && <span className={cn("inline-block w-1.5 h-1.5 rounded-full shrink-0", ORIGIN_DOT[k.key])} aria-hidden="true" />}
                        <span className="truncate">{k.label}</span>
                      </span>
                      <span className={cn("block text-lg font-bold tabular-nums", k.cls)}>{k.n}</span>
                    </button>
                  );
                })}
              </div>
              {deletedCount > 0 && (
                <p className={cn(LABEL, "text-right")}>
                  + {deletedCount} vaga(s) excluída(s) — fora da soma e do quadro.{" "}
                  <button type="button" className="text-primary hover:underline" onClick={() => onKpiClick(DELETED)}>{originFilter === DELETED ? "Limpar filtro" : "Ver excluídas"}</button>
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {!eventId ? (
        <EmptyState icon={CalendarRange} title="Selecione um evento" description="O histórico é consultado por evento. Escolha um acima." />
      ) : viewQuery.isLoading ? (
        <LoadingState count={6} label="Carregando escala do evento…" />
      ) : viewQuery.error ? (
        <div className="rounded-2xl border border-red-200 bg-white p-6 text-center">
          <p className="text-sm font-semibold text-slate-700">Não foi possível carregar a escala</p>
          <p className="text-xs text-slate-500 mt-1">{apiErrorMessage(viewQuery.error, "Verifique sua conexão e tente novamente.")}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => viewQuery.refetch()}>Tentar novamente</Button>
        </div>
      ) : rows.length === 0 && requests.length === 0 ? (
        <EmptyState title="Nenhuma vaga passou pela Validação de Escala neste evento" description="A logística ainda não enviou a escala sugerida deste evento." />
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList className="rounded-xl">
              <TabsTrigger value="lista" className="rounded-lg">Lista</TabsTrigger>
              <TabsTrigger value="escala" className="rounded-lg">Escala</TabsTrigger>
              <TabsTrigger value="pedidos" className="rounded-lg">Pedidos{requests.length ? ` (${requests.length})` : ""}</TabsTrigger>
            </TabsList>
            <p className={LABEL} aria-live="polite">
              {tab === "lista" ? `${filteredRows.length} de ${rows.length} vaga(s)` : tab === "escala" ? "Quadro função × dia (vagas negadas e excluídas não entram)" : `${requests.length} pedido(s)`}
            </p>
          </div>

          <TabsContent value="lista" className="space-y-3 mt-0">
            <div className="rounded-2xl border border-slate-200 bg-white p-3 grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] items-end">
              <div className="space-y-1">
                <Label htmlFor="ev-search" className={LABEL}>Buscar</Label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <Input id="ev-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Função, #ID, área ou observação" className="h-9 pl-8 rounded-lg" />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="ev-function" className={LABEL}>Função</Label>
                <Select value={functionFilter} onValueChange={setFunctionFilter}>
                  <SelectTrigger id="ev-function" className="h-9 rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Todas as funções</SelectItem>
                    {functionsInEvent.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="ev-origin" className={LABEL}>Origem / status</Label>
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
                          const dim = isDeleted(row) || (isSuggestionInclusion(row) && row.status === SUGESTAO_STATUS.NEGADA);
                          return (
                            <tr key={row.id} className={cn("border-b border-slate-100", i % 2 === 1 ? "bg-slate-50/40" : "bg-white", dim && "text-slate-400")}>
                              <td className="px-3 py-2 font-mono text-xs text-slate-500 tabular-nums">#{row.inclusionNumber}</td>
                              <td className="px-3 py-2 font-semibold text-slate-800 max-w-[220px]">
                                <span className={cn("block truncate", dim && "line-through text-slate-400")} title={functionNameById.get(row.functionId)}>{functionNameById.get(row.functionId) ?? "—"}</span>
                                {row.observations && <span className="block text-xs font-normal text-slate-500 truncate" title={row.observations}>{row.observations}</span>}
                              </td>
                              <td className="px-3 py-2 text-xs text-slate-600">{row.area ?? "—"}</td>
                              <td className="px-3 py-2 text-xs">
                                <span className="font-mono tabular-nums text-slate-700">{periodLabel(row)}</span>
                                <span className="ml-1.5 text-slate-500">· {formatDiarias(days.length || row.dailyRates || 0)}</span>
                              </td>
                              <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{legLabel(row.transportModeIda, row.flightDepartureDate, row.flightArrivalSuggestedTime)}</td>
                              <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{legLabel(row.transportModeVolta, row.flightReturnDate, row.flightReturnSuggestedTime)}</td>
                              <td className="px-3 py-2 text-center text-xs">{row.needsTicket ? <span className="text-violet-700 font-semibold">Sim</span> : <span className="text-slate-300">—</span>}</td>
                              <td className="px-3 py-2 text-center text-xs">{row.needsAccommodation ? <span className="text-sky-700 font-semibold">Sim</span> : <span className="text-slate-300">—</span>}</td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <OriginBadge row={row} />
                                  {row.requests.length > 0 && <span className="text-xs text-slate-500" title="Pedidos sobre esta vaga">{row.requests.length} pedido(s)</span>}
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
                          <span className="font-mono text-xs text-slate-500 mr-1.5">#{row.inclusionNumber}</span>
                          {functionNameById.get(row.functionId) ?? "—"}
                        </p>
                        <p className={LABEL}>{row.area ?? "Sem área"}</p>
                        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                          <dt className="text-slate-500">Período</dt><dd className="font-mono text-slate-700">{periodLabel(row)} · {formatDiarias(days.length || row.dailyRates || 0)}</dd>
                          <dt className="text-slate-500">Ida</dt><dd className="text-slate-700">{legLabel(row.transportModeIda, row.flightDepartureDate, row.flightArrivalSuggestedTime)}</dd>
                          <dt className="text-slate-500">Volta</dt><dd className="text-slate-700">{legLabel(row.transportModeVolta, row.flightReturnDate, row.flightReturnSuggestedTime)}</dd>
                          <dt className="text-slate-500">Passagem / hotel</dt><dd className="text-slate-700">{row.needsTicket ? "Passagem" : "—"} / {row.needsAccommodation ? "Hotel" : "—"}</dd>
                        </dl>
                        {row.observations && <p className="text-xs text-slate-500 italic">{row.observations}</p>}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <OriginBadge row={row} />
                          {row.requests.length > 0 && <span className="text-xs text-slate-500">{row.requests.length} pedido(s)</span>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </TabsContent>

          <TabsContent value="escala" className="mt-0 space-y-2">
            {/* Legenda por origem/status — clicável, filtra as vagas que entram no quadro. */}
            {boardLegend.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Legenda do quadro por origem/status (clique para filtrar)">
                <span className={cn(LABEL, "mr-1")}>Legenda:</span>
                {boardLegend.map((l) => {
                  const active = boardFilter === l.key;
                  return (
                    <button
                      key={l.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setBoardFilter(active ? ALL : l.key)}
                      title={active ? "Clique para mostrar todas" : `Mostrar só "${l.label}" no quadro`}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                        active ? "border-primary/40 bg-brand-soft text-primary" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                      )}
                    >
                      <span className={cn("inline-block w-2 h-2 rounded-full", ORIGIN_DOT[l.key])} aria-hidden="true" />
                      {l.label} <span className="tabular-nums text-slate-500">({l.n})</span>
                    </button>
                  );
                })}
                {boardFilter !== ALL && (
                  <button type="button" className="text-[11px] text-primary hover:underline ml-1" onClick={() => setBoardFilter(ALL)}>Mostrar todas</button>
                )}
              </div>
            )}
            <ScheduleBoard rows={boardRows} functionNameById={functionNameById} rangeStart={selectedEvent?.startDate} rangeEnd={selectedEvent?.endDate} />
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
                          {canOpenApproval && <th className={TH}><span className="sr-only">Ações</span></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {requests.map((r, i) => (
                          <tr key={r.id} className={cn("border-b border-slate-100 align-top", i % 2 === 1 ? "bg-slate-50/40" : "bg-white")}>
                            <td className="px-3 py-2 align-top"><RequestTypeBadge type={r.requestType} /></td>
                            <td className="px-3 py-2 max-w-[260px]">
                              <span className="block font-semibold text-slate-800 truncate">{functionNameById.get(r.functionId) ?? "—"}</span>
                              <span className="block text-xs text-slate-500 font-mono">
                                {r.teamInclusionId ? `vaga #${rowById.get(r.teamInclusionId)?.inclusionNumber ?? "—"}` : "vaga nova"}{r.area ? ` · ${r.area}` : ""}
                              </span>
                              {r.reason && <span className="block text-xs text-slate-500 mt-0.5 line-clamp-2" title={r.reason}>{r.reason}</span>}
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-700">{r.requestedByName}</td>
                            <td className="px-3 py-2 text-xs font-mono text-slate-500 whitespace-nowrap">{fmtDateTime(r.createdAt)}</td>
                            <td className="px-3 py-2 align-top"><RequestStatusBadge status={r.status} /></td>
                            <td className="px-3 py-2 text-xs text-slate-700 max-w-[320px]">
                              {r.reviewedByName ? (
                                <>
                                  <span className="block text-xs text-slate-500">{r.reviewedByName} · {fmtDateTime(r.reviewedAt)}</span>
                                  {r.reviewComment && <span className="block whitespace-pre-wrap break-words">{r.reviewComment}</span>}
                                </>
                              ) : <span className="text-slate-300">—</span>}
                            </td>
                            {canOpenApproval && <td className="px-3 py-2 align-top">{approvalLink(r)}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <ul className="md:hidden space-y-2" aria-label="Pedidos do evento">
                  {requests.map((r) => (
                    <li key={r.id} className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2">
                      <div className="flex flex-wrap items-start gap-1.5">
                        <RequestTypeBadge type={r.requestType} />
                        <RequestStatusBadge status={r.status} />
                      </div>
                      <p className="text-sm font-semibold text-slate-800">
                        {functionNameById.get(r.functionId) ?? "—"}
                        <span className="ml-1.5 font-mono text-xs font-normal text-slate-500">{r.teamInclusionId ? `vaga #${rowById.get(r.teamInclusionId)?.inclusionNumber ?? "—"}` : "vaga nova"}</span>
                      </p>
                      <p className={LABEL}>por {r.requestedByName} · {fmtDateTime(r.createdAt)}</p>
                      {r.reason && <p className="text-xs text-slate-600">{r.reason}</p>}
                      {r.reviewedByName && (
                        <p className="text-xs text-slate-700 border-t border-slate-100 pt-2">
                          <span className="block text-xs text-slate-500">{CHANGE_REQUEST_STATUS_LABELS[r.status as ChangeRequestStatus] ?? r.status} · {r.reviewedByName} · {fmtDateTime(r.reviewedAt)}</span>
                          {r.reviewComment}
                        </p>
                      )}
                      {approvalLink(r)}
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
