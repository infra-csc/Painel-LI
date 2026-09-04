import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import {
  AlertCircle, CalendarDays, CalendarRange, ChevronRight, ClipboardCheck, Download, ExternalLink, Gavel,
  History, Info, PencilLine, Search, Send, Timer, Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import EventCombobox from "@/components/ui/event-combobox";
import { SuggestionDetailDrawer } from "@/components/scaling-validation/suggestion-detail-drawer";
import { EventCommentsButton } from "@/components/scaling-validation/event-comments-dialog";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { LoadingState } from "@/components/common/loading-state";
import { EmptyState } from "@/components/common/empty-state";
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
  SUGESTAO_STATUS, SUGESTAO_STATUS_LABELS, CHANGE_REQUEST_STATUS, CHANGE_REQUEST_STATUS_LABELS,
  CHANGE_REQUEST_TYPES, CHANGE_REQUEST_TYPE_LABELS,
  isSuggestionInclusion, type SugestaoStatus, type ChangeRequestStatus, type ChangeRequestType,
} from "@shared/scaling-validation-rules";
import { workDaysOf, ymd, type FunctionWithManagers, type SuggestionRow } from "@/components/scaling-validation/types";
import { SuggestionStatusBadge, legLabel, periodLabel } from "@/components/scaling-validation/suggestions-list";
import { LegChip, NeedChips, legValue } from "@/components/scaling-validation/logistics-chips";
import { ScheduleBoard } from "@/components/scaling-validation/schedule-board";
import { buildReadDateList } from "@/components/scaling-validation/scaling-grid-utils";
import { ScalingModuleNav } from "@/components/scaling-validation/scaling-module-nav";
import { RequestStatusBadge, RequestTypeBadge, ageLabel, formatDateTimeBr } from "@/components/scaling-approval/request-badges";
import { APPROVAL_QUERY_KEYS } from "@/components/scaling-approval/types";

const ALL = "all";
const BASE_PATH = "/scaling-event-view";

type ApiViewRow = TeamInclusion & {
  requests: ScalingChangeRequest[];
  /** Evento da vaga — o servidor anexa (necessário no modo "Todos os eventos"). */
  eventName?: string | null;
  eventStartDate?: string | null;
  eventEndDate?: string | null;
};
interface EventViewData {
  suggestions: ApiViewRow[];
  inclusions: ApiViewRow[];
  requests: ScalingChangeRequest[];
  /** Só no modo "Todos os eventos": a consulta bateu no teto de linhas. */
  truncated?: boolean;
  rowLimit?: number | null;
  /** Quantos eventos entraram no recorte do servidor. */
  eventCount?: number;
}
/** Linha da tela: a da API + os campos que os componentes da Validação (lista/quadro) esperam. */
type EventViewRow = ApiViewRow & SuggestionRow;

type Tab = "timeline" | "lista" | "escala" | "pedidos";
/** `timeline` é a aba padrão (sem `?tab=`); as demais viajam na URL. */
const TABS: Tab[] = ["timeline", "lista", "escala", "pedidos"];
const TAB_LABEL: Record<Tab, string> = { timeline: "Linha do tempo", lista: "Lista", escala: "Escala", pedidos: "Pedidos" };

/** Chaves de "origem/status" além dos status de sugestão. */
const IN_INCLUSION = "__inclusao__";
const DELETED = "__excluida__";
const ORIGIN_LABEL_INCLUSAO = "Em Inclusão de Equipe";
const ORIGIN_LABEL_EXCLUIDA = "Excluída";

/**
 * Timestamp da API (ISO com fuso) → Date local. Precisa vir ANTES de
 * `originLabel`: `formatDayMonthBr` de `lib/dates.ts` lê a data crua da string
 * ISO (é feito para datas de calendário, sem fuso), então uma exclusão às 22h
 * de Brasília sairia como o dia seguinte. Convertendo para `Date` primeiro, o
 * badge da Lista e a linha do tempo passam a falar do mesmo dia.
 */
const toDate = (v: unknown): Date | null => {
  if (!v) return null;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d;
};

const isDeleted = (row: { deletedAt?: unknown }) => !!row.deletedAt;
function originKey(row: EventViewRow): string {
  if (isDeleted(row)) return DELETED;
  return isSuggestionInclusion(row) ? row.status : IN_INCLUSION;
}
function originLabel(row: EventViewRow): string {
  const k = originKey(row);
  if (k === DELETED) return `${ORIGIN_LABEL_EXCLUIDA} em ${formatDayMonthBr(toDate(row.deletedAt))}`;
  if (k === IN_INCLUSION) return ORIGIN_LABEL_INCLUSAO;
  return SUGESTAO_STATUS_LABELS[k as SugestaoStatus] ?? k;
}
const ORIGIN_ORDER = [...Object.values(SUGESTAO_STATUS), IN_INCLUSION, DELETED];
const ORIGIN_LABELS: Record<string, string> = { ...SUGESTAO_STATUS_LABELS, [IN_INCLUSION]: ORIGIN_LABEL_INCLUSAO, [DELETED]: ORIGIN_LABEL_EXCLUIDA };

/** Badge da coluna Origem/Status: sugestão (SUGESTAO_STATUS_LABELS), "Em Inclusão de Equipe" ou "Excluída em dd/mm". */
function OriginBadge({ row }: { row: EventViewRow }) {
  if (isDeleted(row)) {
    // Só a palavra fica riscada: a data "em dd/mm" é informação viva (quando foi
    // excluída) e riscada parecia um erro de digitação.
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 whitespace-nowrap">
        <span className="line-through decoration-red-300">{ORIGIN_LABEL_EXCLUIDA}</span> em {formatDayMonthBr(toDate(row.deletedAt))}
      </span>
    );
  }
  if (isSuggestionInclusion(row)) return <SuggestionStatusBadge status={row.status} />;
  return <span className="inline-flex items-center rounded-full border border-primary/30 bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-primary whitespace-nowrap">{ORIGIN_LABEL_INCLUSAO}</span>;
}

/** Cor sutil por origem/status — mesma paleta dos badges (funil, legenda do quadro e KPIs). */
const ORIGIN_DOT: Record<string, string> = {
  [SUGESTAO_STATUS.PENDENTE]: "bg-amber-400",
  [SUGESTAO_STATUS.VALIDADA]: "bg-sky-400",
  [SUGESTAO_STATUS.AJUSTE]: "bg-violet-400",
  [SUGESTAO_STATUS.APROVADA]: "bg-emerald-400",
  [SUGESTAO_STATUS.NEGADA]: "bg-slate-300",
  [IN_INCLUSION]: "bg-primary",
  [DELETED]: "bg-red-300",
};

/**
 * Só a hora ("hh:mm"). Data+hora completa é `formatDateTimeBr` (compartilhado
 * com a Aprovação); este fica porque a linha do tempo e a coluna "Hora" do CSV
 * mostram a hora SEM a data — o dia já está no cabeçalho do grupo.
 */
const hhmm = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
/**
 * "dd/mm hh:mm" — colunas compactas (Último movimento, última movimentação da
 * barra). Sem o ano de propósito: o evento cabe num mês ou dois e a coluna é
 * estreita; a data completa mora no CSV e no drawer da vaga.
 */
function fmtShort(v: string | Date | null | undefined): string {
  const d = toDate(v);
  return d ? `${formatDayMonthBr(d)} ${hhmm(d)}` : "Sem data";
}
/** Alguma perna da viagem tem modal, data ou hora? (Mesmo critério do LegChip: sem nada, ele não desenha.) */
const hasLeg = (mode: string | null | undefined, date: string | Date | null | undefined, time: string | null | undefined) =>
  !!(legValue(mode) || legValue(date) || legValue(time));
const DAY_MS = 86_400_000;
function daysSince(v: unknown): number {
  const d = toDate(v);
  return d ? Math.max(0, Math.floor((Date.now() - d.getTime()) / DAY_MS)) : 0;
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
  const qv = (v: unknown) => {
    let s = String(v ?? "");
    // Anti-injeção de fórmula: célula que começa com = + - @ ganharia vida no Excel
    // ("=cmd|…"). O apóstrofo na frente faz o Excel tratá-la como texto puro.
    if (/^[=+\-@]/.test(s.trimStart())) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const body = [header.map(qv).join(";"), ...lines.map((l) => l.map(qv).join(";"))].join("\r\n");
  const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Colunas anunciadas no diálogo de exportação, NA ORDEM em que saem no CSV
 * (ver `exportCsv`) — quem lê o diálogo e depois abre o arquivo encontra os
 * grupos na mesma sequência. A coluna "Evento" do modo "todos" é anunciada à
 * parte (`EXPORT_EVENT_COL`), porque só existe sem filtro de evento.
 */
const EXPORT_COLS: Record<Tab, [string, string][]> = {
  timeline: [["Quando", "data e hora"], ["Movimento", "tipo, título e descrição"], ["Quem", "autor do movimento"], ["Vagas", "#IDs e contagens envolvidas"], ["Comentário", "texto do pedido ou da decisão"]],
  lista: [["Vaga", "#ID, função, área, origem/status"], ["Período", "período, dias de trabalho, diárias"], ["Logística", "ida, volta, passagem, hotel"], ["Situação", "quantidade de pedidos, observações"], ["Último movimento", "o que aconteceu e quando"]],
  escala: [["Função", "nome e área"], ["Vagas", "total por função"], ["Dias", "uma coluna por dia do período"], ["Pessoas-dia", "total por função, mais a linha Total por dia"]],
  pedidos: [["Pedido", "tipo, função, vaga, área"], ["Abertura", "solicitante e data"], ["Motivo", "texto do solicitante"], ["Decisão", "status, aprovador, data, comentário"]],
};
const EXPORT_EVENT_COL: [string, string] = ["Evento", "de qual evento é cada linha (modo \"Todos os eventos\")"];

/** Linha do quadro função × dia agregada (CSV da Escala e lista mobile). */
interface FunctionAggregate { functionId: string; name: string; area: string; vagas: number; perDay: Record<string, number>; total: number }
/**
 * Mesma agregação do ScheduleBoard: vagas e pessoas-dia por função (soma dos
 * dias de trabalho de todas as áreas), em ordem alfabética. Fica fora do
 * componente para o CSV e a lista mobile lerem os MESMOS números do quadro.
 */
function aggregateByFunction(rows: EventViewRow[], nameById: Map<string, string>): FunctionAggregate[] {
  const byFn = new Map<string, FunctionAggregate>();
  for (const r of rows) {
    let l = byFn.get(r.functionId);
    if (!l) { l = { functionId: r.functionId, name: nameById.get(r.functionId) ?? "Sem função", area: r.area ?? "", vagas: 0, perDay: {}, total: 0 }; byFn.set(r.functionId, l); }
    l.vagas += 1;
    for (const d of workDaysOf(r)) { l.perDay[d] = (l.perDay[d] || 0) + 1; l.total += 1; }
  }
  return Array.from(byFn.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
}

// ── Linha do tempo ───────────────────────────────────────────────────────────

type TlCat = "envio" | "validacao" | "pedido" | "decisao" | "exclusao";
interface TlStyle { label: string; icon: LucideIcon; dot: string; card: string; tag: string; quote: string }
const TL_ORDER: TlCat[] = ["envio", "validacao", "pedido", "decisao", "exclusao"];
const TL: Record<TlCat, TlStyle> = {
  envio:     { label: "Envios",     icon: Send,          dot: "bg-primary",      card: "border-primary/20 bg-brand-soft/50", tag: "bg-brand-soft text-primary",     quote: "border-primary/40" },
  validacao: { label: "Validações", icon: ClipboardCheck, dot: "bg-sky-500",     card: "border-sky-200 bg-sky-50/60",        tag: "bg-sky-50 text-sky-700",         quote: "border-sky-300" },
  pedido:    { label: "Pedidos",    icon: PencilLine,    dot: "bg-violet-500",   card: "border-violet-200 bg-violet-50/60",  tag: "bg-violet-50 text-violet-700",   quote: "border-violet-300" },
  decisao:   { label: "Decisões",   icon: Gavel,         dot: "bg-emerald-500",  card: "border-emerald-200 bg-emerald-50/50", tag: "bg-emerald-50 text-emerald-700", quote: "border-emerald-300" },
  exclusao:  { label: "Exclusões",  icon: Trash2,        dot: "bg-red-500",      card: "border-red-200 bg-red-50/50",        tag: "bg-red-50 text-red-700",         quote: "border-red-300" },
};

interface TlEntry {
  id: string;
  cat: TlCat;
  at: Date;
  title: string;
  tag: string;
  text: string;
  author?: string;
  chips?: string[];
  quote?: string;
  href?: string;
  linkLabel?: string;
  /** Evento do movimento — a linha do tempo agrupa por ele no modo "todos". */
  eventId?: string;
  /**
   * Texto pesquisável já em minúsculas (título, descrição, tag, autor, citação
   * e chips). Pré-computado UMA vez por movimento: a busca re-filtra a cada
   * tecla e montar essa string por cartão a cada vez era o custo dominante.
   */
  haystack: string;
}
/** Movimento antes de ganhar o `haystack` (montado de uma vez no fim). */
type TlDraft = Omit<TlEntry, "haystack">;

/**
 * Agrupa por minuto: um envio/validação/exclusão em lote vira UM movimento.
 * `bucket` separa lotes que caíram no mesmo minuto mas são de EVENTOS
 * diferentes — no modo "Todos os eventos" eles virariam um cartão só, dizendo
 * que uma escala foi enviada para funções de dois eventos ao mesmo tempo.
 */
function batchByMinute<T>(items: T[], at: (x: T) => unknown, bucket?: (x: T) => string): { at: Date; items: T[] }[] {
  const map = new Map<string, { at: Date; items: T[] }>();
  for (const it of items) {
    const d = toDate(at(it));
    if (!d) continue;
    const k = `${Math.floor(d.getTime() / 60_000)}|${bucket?.(it) ?? ""}`;
    const g = map.get(k);
    if (g) g.items.push(it);
    else map.set(k, { at: d, items: [it] });
  }
  return Array.from(map.values());
}
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
function namesOf(rows: EventViewRow[], nameById: Map<string, string>, max = 4): string {
  const uniq = Array.from(new Set(rows.map((r) => nameById.get(r.functionId) ?? "Sem função")));
  return uniq.length <= max ? uniq.join(", ") : `${uniq.slice(0, max).join(", ")} e mais ${uniq.length - max}`;
}
const idChips = (rows: EventViewRow[], max = 8) =>
  rows.slice(0, max).map((r) => `#${r.inclusionNumber}`).concat(rows.length > max ? [`+${rows.length - max}`] : []);

/** Quantos eventos a linha do tempo mostra por vez no modo "Todos os eventos". */
const TIMELINE_EVENTS_STEP = 3;

/** Cabeçalho de tabela — mesmo padrão das outras telas do módulo. */
const TH = "px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap";
/** Título de seção/rótulo de grupo (design system: 11px, bold, caixa alta, slate-500). */
const SECTION = "text-[11px] font-bold uppercase tracking-wide text-slate-500";
const LABEL = "text-xs text-slate-500";
const CHIP = "inline-flex items-center h-[22px] rounded-full px-2 text-[11px] font-medium";
/** Contêiner com rolagem horizontal alcançável pelo teclado (tabIndex + região nomeada). */
const SCROLL_X = "overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";

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
    return (TABS as string[]).includes(t ?? "") ? (t as Tab) : "timeline";
  }, [searchString]);
  const tabParams = useCallback((t: Tab): Record<string, string> => (t === "timeline" ? {} : { tab: t }), []);

  // ── Evento (URL ?eventId= > último usado no módulo) ──
  // Abre em "Todos os eventos" (regra do dono, 26/08) — o combobox é filtro.
  const { eventId, setEventId, sanitize } = useScalingEvent(BASE_PATH, {
    extraParams: () => tabParams(tab),
    allEventsDefault: true,
  });
  const setTab = useCallback((t: Tab) => {
    setLocation(scalingHref(BASE_PATH, eventId, tabParams(t)), { replace: true });
  }, [eventId, setLocation, tabParams]);
  /**
   * Aba EFETIVA: sem evento selecionado o quadro "Escala" não existe (função ×
   * dia de eventos diferentes na mesma coluna não quer dizer nada), então um
   * `?tab=escala` sem evento mostra a Lista — com a aba "Escala" desabilitada
   * e um aviso acima da Lista dizendo o porquê (`escalaSemEvento`), em vez de
   * trocar de aba em silêncio. Tudo que descreve a aba VISÍVEL — contagem,
   * exportação, banner — lê daqui; só a URL continua com `tab`.
   */
  const effectiveTab: Tab = !eventId && tab === "escala" ? "lista" : tab;
  const escalaSemEvento = !eventId && tab === "escala";

  const [search, setSearch] = useState("");
  /**
   * A busca re-filtra três listas (linha do tempo, vagas e pedidos) a cada
   * tecla; o valor adiado deixa o campo responder na hora e as listas correrem
   * atrás — em evento grande a digitação parava de engasgar.
   */
  const deferredSearch = useDeferredValue(search);
  /**
   * Origem/status é UM filtro para a Lista e o quadro (era um estado por aba,
   * e o KPI clicado numa aba não se refletia na outra). A legenda do quadro
   * escreve aqui também.
   */
  const [originFilter, setOriginFilter] = useState(ALL);
  const [functionFilter, setFunctionFilter] = useState(ALL);
  /** Filtros da aba Pedidos (tipo e status) — a busca é a mesma das outras abas. */
  const [requestTypeFilter, setRequestTypeFilter] = useState(ALL);
  const [requestStatusFilter, setRequestStatusFilter] = useState(ALL);
  /** Categorias visíveis na linha do tempo. */
  const [tlCats, setTlCats] = useState<TlCat[]>(TL_ORDER);
  const [exportOpen, setExportOpen] = useState(false);
  /** Quantos eventos a linha do tempo mostra no modo "Todos os eventos". */
  const [visibleEvents, setVisibleEvents] = useState(TIMELINE_EVENTS_STEP);
  /** Envolve o combobox de evento: o aviso "escolha um evento" leva o foco até ele. */
  const eventPickerRef = useRef<HTMLDivElement>(null);
  const focusEventPicker = () => eventPickerRef.current?.querySelector<HTMLButtonElement>("button")?.focus();

  // ── Dados ──
  const { data: events, isLoading: loadingEvents } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: functions, isLoading: loadingFunctions } = useQuery<FunctionWithManagers[]>({ queryKey: ["/api/functions"] });
  const activeEvents = useMemo(() => (events ?? []).filter((e) => e.status !== "excluido" && e.status !== "excluído"), [events]);
  const selectedEvent = activeEvents.find((e) => e.id === eventId);
  const functionNameById = useMemo(() => new Map((functions ?? []).map((f) => [f.id, f.name])), [functions]);
  useEffect(() => { sanitize(events ? activeEvents.map((e) => e.id) : undefined); }, [events, activeEvents, sanitize]);

  // Sem evento: o servidor devolve o histórico de TODOS os eventos que ainda
  // importam (com vaga em validação, pedido em aberto ou encerrados há pouco),
  // com teto de linhas e `truncated` na resposta.
  const viewQuery = useQuery<EventViewData>({
    queryKey: [APPROVAL_QUERY_KEYS.eventView, eventId],
    queryFn: async () =>
      (await apiRequest(
        "GET",
        eventId ? `${APPROVAL_QUERY_KEYS.eventView}?eventId=${encodeURIComponent(eventId)}` : APPROVAL_QUERY_KEYS.eventView,
      )).json(),
    staleTime: 15_000,
  });
  const truncated = !eventId && viewQuery.data?.truncated === true;
  /** Quantos eventos o servidor considerou no recorte "todos os eventos". */
  const eventsInView = viewQuery.data?.eventCount ?? 0;
  const eventById = useMemo(() => new Map(activeEvents.map((e) => [e.id, e])), [activeEvents]);
  const rows = useMemo<EventViewRow[]>(() => [...(viewQuery.data?.suggestions ?? []), ...(viewQuery.data?.inclusions ?? [])].map(toViewRow), [viewQuery.data]);
  /**
   * eventId → nome vindo das PRÓPRIAS linhas. Rede de segurança para o evento
   * que não está mais na lista ativa (excluído): o histórico continua sabendo
   * de que evento a vaga era, sem mostrar um UUID.
   */
  const eventNameByRowId = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) if (r.eventId && r.eventName) map.set(r.eventId, r.eventName);
    return map;
  }, [rows]);
  /** Nome do evento de uma linha (lista/CSV/busca no modo "todos os eventos"). */
  const eventNameOf = useCallback(
    (row: { eventId: string; eventName?: string | null }) =>
      row.eventName ?? eventById.get(row.eventId)?.name ?? eventNameByRowId.get(row.eventId) ?? "Sem evento",
    [eventById, eventNameByRowId],
  );
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  /**
   * Detalhe COMPLETO de uma vaga sem sair do Histórico (28/08): os chips #id da
   * linha do tempo e da Lista abrem o mesmo drawer da Validação, em leitura —
   * é onde mora a história enriquecida (logs, de/para dos reajustes, motivos).
   */
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailRow = detailId ? rowById.get(detailId) ?? null : null;
  const idByNumber = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) if (r.inclusionNumber != null) m.set(`#${r.inclusionNumber}`, r.id);
    return m;
  }, [rows]);
  /** Vagas vivas (sem soft-delete) — base dos KPIs e do quadro. */
  const liveRows = useMemo(() => rows.filter((r) => !isDeleted(r)), [rows]);
  const deletedCount = rows.length - liveRows.length;
  const requests = useMemo(() => [...(viewQuery.data?.requests ?? [])].sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()), [viewQuery.data]);
  /** Tipos e status que EXISTEM nos pedidos carregados — os Selects só oferecem o que dá resultado. */
  const requestTypesInView = useMemo(() => {
    const set = new Set(requests.map((r) => r.requestType));
    return CHANGE_REQUEST_TYPES.filter((t) => set.has(t));
  }, [requests]);
  const requestStatusesInView = useMemo(() => {
    const set = new Set(requests.map((r) => r.status));
    return (Object.values(CHANGE_REQUEST_STATUS) as ChangeRequestStatus[]).filter((s) => set.has(s));
  }, [requests]);

  const functionsInEvent = useMemo(() => {
    const ids = new Set(rows.map((r) => r.functionId));
    return (functions ?? []).filter((f) => ids.has(f.id)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
  }, [rows, functions]);
  const originsInEvent = useMemo(() => {
    const keys = new Set(rows.map(originKey));
    return ORIGIN_ORDER.filter((k) => keys.has(k)).map((k) => ({ key: k, label: ORIGIN_LABELS[k] }));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return rows
      .filter((r) => originFilter === ALL || originKey(r) === originFilter)
      .filter((r) => functionFilter === ALL || r.functionId === functionFilter)
      .filter((r) => {
        if (!q) return true;
        const fn = (functionNameById.get(r.functionId) ?? "").toLowerCase();
        return fn.includes(q) || String(r.inclusionNumber).includes(q) || (r.area ?? "").toLowerCase().includes(q) || (r.observations ?? "").toLowerCase().includes(q);
      })
      .sort((a, b) => (functionNameById.get(a.functionId) ?? "").localeCompare(functionNameById.get(b.functionId) ?? "", "pt-BR") || (a.inclusionNumber ?? 0) - (b.inclusionNumber ?? 0));
  }, [rows, originFilter, functionFilter, deferredSearch, functionNameById]);

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
  /**
   * KPI clicável: aplica o filtro de origem e leva à Lista. O clique só ALTERNA
   * (limpa) quando já se está na Lista vendo o resultado — vindo de outra aba, o
   * usuário está pedindo "me mostre estas vagas", e limpar um filtro invisível
   * ali o levaria para a Lista sem filtro nenhum.
   */
  const kpiWouldClear = (key: string) => key === ALL || (effectiveTab === "lista" && originFilter === key);
  const onKpiClick = (key: string) => {
    setOriginFilter(kpiWouldClear(key) ? ALL : key);
    if (tab !== "lista") setTab("lista");
  };
  /** Funil: uma faixa proporcional por etapa viva (mesmas cores dos KPIs). */
  const funnel = useMemo(
    () => [
      { key: SUGESTAO_STATUS.PENDENTE, label: "Aguardando validação da área", n: counts.pendentes },
      { key: SUGESTAO_STATUS.VALIDADA, label: "Aguardando aprovação", n: counts.validadas },
      { key: SUGESTAO_STATUS.AJUSTE, label: "Com pedido em aberto", n: counts.comPedido },
      { key: SUGESTAO_STATUS.APROVADA, label: "Aprovadas", n: counts.aprovadas },
      { key: IN_INCLUSION, label: "Em Inclusão de Equipe", n: counts.emInclusao },
      { key: SUGESTAO_STATUS.NEGADA, label: "Negadas", n: counts.negadas },
    ].filter((f) => f.n > 0),
    [counts],
  );

  // ── Linha do tempo: cada movimento real do fluxo (envio → validação → pedido → decisão) ──
  const timeline = useMemo<TlEntry[]>(() => {
    if (rows.length === 0 && requests.length === 0) return [];
    const out: TlDraft[] = [];
    const fnName = (id: string) => functionNameById.get(id) ?? "Sem função";

    // `eventOf` separa os lotes por evento (ver `batchByMinute`) e carimba a
    // entrada, para a linha do tempo poder agrupar por evento.
    const eventOf = (r: EventViewRow) => r.eventId ?? "";
    for (const g of batchByMinute(rows, (r) => r.suggestionSentAt, eventOf)) {
      const funcs = new Set(g.items.map((r) => r.functionId)).size;
      const pessoasDia = g.items.reduce((a, r) => a + (workDaysOf(r).length || r.dailyRates || 0), 0);
      out.push({
        id: `envio-${g.items[0].eventId}-${g.at.getTime()}`, cat: "envio", at: g.at, eventId: g.items[0].eventId,
        title: "Escala sugerida enviada para validação", tag: "Envio",
        text: `${namesOf(g.items, functionNameById)} — a logística mandou as vagas para as áreas conferirem.`,
        chips: [plural(g.items.length, "vaga", "vagas"), plural(funcs, "função", "funções"), `${pessoasDia} pessoas-dia`],
      });
    }
    for (const g of batchByMinute(rows, (r) => r.validatedAt, eventOf)) {
      out.push({
        id: `val-${g.items[0].eventId}-${g.at.getTime()}`, cat: "validacao", at: g.at, eventId: g.items[0].eventId,
        title: `Área validou ${plural(g.items.length, "vaga", "vagas")}`, tag: "Validação",
        text: `${namesOf(g.items, functionNameById)} — seguiram para a aprovação.`,
        chips: idChips(g.items),
      });
    }
    // Aprovação: a vaga aprovada sai da fase 'sugestao' e vira Inclusão de Equipe.
    // A API não guarda a data da decisão em si, então usamos `updatedAt` — o MESMO
    // critério da coluna "Último movimento" da Lista (lastMoveOf). Como `updatedAt`
    // é bumpado por qualquer edição posterior (escalação, passagem, hospedagem),
    // o texto é conservador: diz que a vaga está em Inclusão e que a data é a da
    // última alteração, sem afirmar que aquele minuto foi o clique do aprovador.
    for (const g of batchByMinute(rows.filter((r) => !isSuggestionInclusion(r) && !isDeleted(r)), (r) => r.updatedAt, eventOf)) {
      out.push({
        id: `apr-${g.items[0].eventId}-${g.at.getTime()}`, cat: "decisao", at: g.at, eventId: g.items[0].eventId,
        title: `${plural(g.items.length, "vaga virou", "vagas viraram")} Inclusão de Equipe`, tag: "Aprovação",
        text: `${namesOf(g.items, functionNameById)} — aprovadas pelo aprovador e fora da Validação (data da última alteração da vaga).`,
        chips: idChips(g.items),
      });
    }
    for (const g of batchByMinute(rows, (r) => r.deletedAt, eventOf)) {
      out.push({
        id: `del-${g.items[0].eventId}-${g.at.getTime()}`, cat: "exclusao", at: g.at, eventId: g.items[0].eventId,
        title: `${plural(g.items.length, "vaga excluída", "vagas excluídas")}`, tag: "Excluída",
        text: `${namesOf(g.items, functionNameById)} — fora da soma dos indicadores e do quadro.`,
        chips: idChips(g.items),
      });
    }
    for (const r of requests) {
      const tipo = CHANGE_REQUEST_TYPE_LABELS[r.requestType as ChangeRequestType] ?? r.requestType;
      const alvo = r.teamInclusionId ? `vaga #${rowById.get(r.teamInclusionId)?.inclusionNumber ?? "?"}` : "vaga nova";
      const where = `${fnName(r.functionId)} · ${alvo}${r.area ? ` · ${r.area}` : ""}`;
      // O link leva ao evento DO PEDIDO (no modo "todos", `eventId` é vazio).
      const href = canOpenApproval ? scalingHref("/scaling-approval", eventId || r.eventId, { request: r.id }) : undefined;
      const created = toDate(r.createdAt);
      if (created) {
        out.push({
          id: `req-${r.id}`, cat: "pedido", at: created, eventId: r.eventId,
          title: `Pedido de ${tipo.toLowerCase()} aberto`, tag: tipo,
          text: where, author: r.requestedByName ? `${r.requestedByName} (solicitante)` : undefined,
          quote: r.reason ?? undefined, href, linkLabel: "Abrir na Aprovação",
        });
      }
      const reviewed = toDate(r.reviewedAt);
      if (reviewed) {
        const st = CHANGE_REQUEST_STATUS_LABELS[r.status as ChangeRequestStatus] ?? r.status;
        out.push({
          id: `dec-${r.id}`, cat: "decisao", at: reviewed, eventId: r.eventId,
          title: `Pedido de ${tipo.toLowerCase()} — ${st.toLowerCase()}`, tag: st,
          text: where, author: r.reviewedByName ? `${r.reviewedByName} (aprovador)` : undefined,
          quote: r.reviewComment ?? undefined, href, linkLabel: "Abrir na Aprovação",
        });
      }
    }
    // Os chips entram no texto pesquisável: carregam os #IDs das vagas (e as
    // contagens do envio) — sem eles o placeholder prometeria "#ID" e buscar
    // "1049" não acharia o cartão.
    return out
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .map((e) => ({ ...e, haystack: `${e.title} ${e.text} ${e.tag} ${e.author ?? ""} ${e.quote ?? ""} ${(e.chips ?? []).join(" ")}`.toLowerCase() }));
  }, [rows, requests, rowById, functionNameById, canOpenApproval, eventId]);

  const filteredTimeline = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return timeline
      .filter((e) => tlCats.includes(e.cat))
      .filter((e) => !q || e.haystack.includes(q));
  }, [timeline, tlCats, deferredSearch]);
  /** Movimentos agrupados por dia (mais recente primeiro — a ordem de inserção do Map preserva isso). */
  const groupByDay = useCallback((entries: TlEntry[]) => {
    const today = formatDateBr(new Date());
    const groups = new Map<string, { key: string; label: string; items: TlEntry[] }>();
    for (const e of entries) {
      const key = formatDateBr(e.at);
      let g = groups.get(key);
      if (!g) { g = { key, label: key === today ? `${key} · hoje` : key, items: [] }; groups.set(key, g); }
      g.items.push(e);
    }
    return Array.from(groups.values());
  }, []);
  const timelineDays = useMemo(() => groupByDay(filteredTimeline), [groupByDay, filteredTimeline]);

  /**
   * Modo "Todos os eventos": a linha do tempo de todos os eventos de uma vez
   * ficaria interminável e misturaria histórias diferentes. Por isso ela é
   * agrupada POR EVENTO (o de movimento mais recente primeiro) e só os
   * `TIMELINE_EVENTS_STEP` primeiros aparecem — o resto vem no "Ver mais".
   * Dentro de cada evento continua a leitura por dia de sempre.
   */
  const timelineEvents = useMemo(() => {
    if (eventId) return [];
    const groups = new Map<string, { key: string; name: string; period: string; items: TlEntry[] }>();
    for (const e of filteredTimeline) {
      const key = e.eventId ?? "";
      let g = groups.get(key);
      if (!g) {
        const ev = eventById.get(key);
        g = {
          key,
          name: ev?.name ?? eventNameByRowId.get(key) ?? "Evento sem nome",
          period: ev ? formatDateRange(ev.startDate, ev.endDate, { withYear: true }) : "",
          items: [],
        };
        groups.set(key, g);
      }
      g.items.push(e);
    }
    // `filteredTimeline` já vem do mais recente para o mais antigo, então a
    // ordem de inserção no Map já é a ordem certa dos grupos.
    return Array.from(groups.values());
  }, [eventId, filteredTimeline, eventById, eventNameByRowId]);
  const timelineStart = timeline.length ? formatDateBr(timeline[timeline.length - 1].at) : "";
  const lastMovement = timeline[0] ?? null;
  // "Ver mais eventos" volta ao começo quando o recorte muda: o número de
  // eventos abertos era de OUTRA busca/evento e não faz sentido continuar valendo.
  useEffect(() => { setVisibleEvents(TIMELINE_EVENTS_STEP); }, [eventId, deferredSearch, tlCats]);

  // ── Pedidos: busca + tipo + status (mesma busca das outras abas) ──
  const filteredRequests = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return requests
      .filter((r) => requestTypeFilter === ALL || r.requestType === requestTypeFilter)
      .filter((r) => requestStatusFilter === ALL || r.status === requestStatusFilter)
      .filter((r) => {
        if (!q) return true;
        const vaga = r.teamInclusionId ? `#${rowById.get(r.teamInclusionId)?.inclusionNumber ?? ""}` : "vaga nova";
        return [
          functionNameById.get(r.functionId) ?? "", vaga, r.area ?? "", r.reason ?? "", r.reviewComment ?? "",
          r.requestedByName ?? "", r.reviewedByName ?? "", eventId ? "" : eventNameOf(r),
        ].join(" ").toLowerCase().includes(q);
      });
  }, [requests, requestTypeFilter, requestStatusFilter, deferredSearch, rowById, functionNameById, eventId, eventNameOf]);
  const reqHasFilters = search.trim() !== "" || requestTypeFilter !== ALL || requestStatusFilter !== ALL;
  const clearReqFilters = () => { setSearch(""); setRequestTypeFilter(ALL); setRequestStatusFilter(ALL); };

  // Cada aba limpa o que ela mesma mostra: os pills da linha do tempo não
  // aparecem na barra da Lista, então não podem acender o "Limpar filtros" dela
  // (a busca é o único controle compartilhado pelas duas).
  const listHasFilters = search.trim() !== "" || originFilter !== ALL || functionFilter !== ALL;
  const clearListFilters = () => { setSearch(""); setOriginFilter(ALL); setFunctionFilter(ALL); };
  const tlHasFilters = search.trim() !== "" || tlCats.length !== TL_ORDER.length;
  const clearTlFilters = () => { setSearch(""); setTlCats(TL_ORDER); };

  /** Onde a escala está travada — só conta o que depende de alguém agora. */
  const stalled = useMemo(() => {
    const awaiting = liveRows.filter((r) => isSuggestionInclusion(r) && r.status === SUGESTAO_STATUS.VALIDADA);
    const open = requests.filter((r) => r.status === CHANGE_REQUEST_STATUS.PENDENTE);
    const never = counts.pendentes;
    if (!awaiting.length && !open.length && !never) return null;
    const parts: string[] = [];
    // Sem "a mais antiga há N dias" (pedido do dono, 04/09).
    if (awaiting.length) parts.push(`${plural(awaiting.length, "vaga validada espera", "vagas validadas esperam")} decisão do aprovador`);
    if (open.length) parts.push(plural(open.length, "pedido em aberto", "pedidos em aberto"));
    if (never) parts.push(`${plural(never, "vaga ainda não validada", "vagas ainda não validadas")} pela área`);
    return {
      title: awaiting.length || open.length ? "A escala está travada na aprovação" : "A escala está esperando a validação das áreas",
      text: `${parts.join(" · ")}.`,
    };
  }, [liveRows, requests, counts.pendentes]);

  // ── Quadro (Escala): vagas vivas, sem negadas (o board já ignora), com o MESMO filtro de origem da Lista ──
  const boardRowsAll = useMemo(() => liveRows.filter((r) => originKey(r) !== SUGESTAO_STATUS.NEGADA), [liveRows]);
  const boardLegend = useMemo(() => {
    const keys = new Set(boardRowsAll.map(originKey));
    return ORIGIN_ORDER.filter((k) => keys.has(k)).map((k) => ({ key: k, label: ORIGIN_LABELS[k], n: boardRowsAll.filter((r) => originKey(r) === k).length }));
  }, [boardRowsAll]);
  /**
   * Filtro que o quadro consegue honrar. "Negadas" e "Excluídas" nunca entram
   * no quadro, então com o KPI delas ativo o quadro mostra TUDO (e avisa) em
   * vez de ficar vazio — derivado, sem efeito de saneamento de estado.
   */
  const boardFilter = boardLegend.some((l) => l.key === originFilter) ? originFilter : ALL;
  const boardRows = useMemo(() => (boardFilter === ALL ? boardRowsAll : boardRowsAll.filter((r) => originKey(r) === boardFilter)), [boardRowsAll, boardFilter]);
  /** Linhas função × dia do quadro (CSV e lista mobile). */
  const boardLines = useMemo(() => aggregateByFunction(boardRows, functionNameById), [boardRows, functionNameById]);

  /** Último movimento de UMA vaga (para a coluna da Lista e o CSV). */
  const lastMoveOf = useCallback((row: EventViewRow): { label: string; at: Date | null } => {
    const c: { label: string; at: Date | null }[] = [];
    const push = (label: string, v: unknown) => { const d = toDate(v); if (d) c.push({ label, at: d }); };
    push("Vaga criada", row.createdAt);
    push("Enviada para validação", row.suggestionSentAt);
    push("Validada pela área", row.validatedAt);
    for (const r of row.requests) {
      const tipo = (CHANGE_REQUEST_TYPE_LABELS[r.requestType as ChangeRequestType] ?? r.requestType).toLowerCase();
      push(`Pedido de ${tipo} aberto`, r.createdAt);
      push(`Pedido de ${tipo} — ${(CHANGE_REQUEST_STATUS_LABELS[r.status as ChangeRequestStatus] ?? r.status).toLowerCase()}`, r.reviewedAt);
    }
    if (!isSuggestionInclusion(row)) push("Aprovada — virou Inclusão de Equipe", row.updatedAt);
    else if (row.status === SUGESTAO_STATUS.NEGADA) push("Vaga negada", row.updatedAt);
    push("Vaga excluída", row.deletedAt);
    if (!c.length) return { label: "Sem movimento", at: null };
    return c.reduce((best, x) => (x.at && best.at && x.at.getTime() >= best.at.getTime() ? x : best));
  }, []);

  // ── Export CSV da ABA corrente (BOM + ;) ──
  // Exporta o que está na tela — inclusive em "Todos os eventos" (a Lista e os
  // Pedidos saem com a coluna Evento; o quadro "Escala" só existe com filtro).
  const exportEnabled = (
    effectiveTab === "timeline" ? filteredTimeline.length > 0
      : effectiveTab === "lista" ? filteredRows.length > 0
        : effectiveTab === "escala" ? !!eventId && boardRows.length > 0
          : filteredRequests.length > 0
  );
  const exportFilename = `historico-escala-${slugify(selectedEvent?.name ?? (eventId ? "evento" : "todos-os-eventos"))}-${effectiveTab}-${todayIso()}.csv`;
  const exportCsv = () => {
    setExportOpen(false);
    const filename = exportFilename;
    if (effectiveTab === "timeline") {
      const header = [...(eventId ? [] : ["Evento"]), "Data", "Hora", "Tipo", "Movimento", "Descrição", "Quem", "Vagas", "Comentário"];
      const lines = filteredTimeline.map((e) => [
        ...(eventId ? [] : [e.eventId ? eventNameOf({ eventId: e.eventId }) : ""]),
        formatDateBr(e.at), hhmm(e.at), TL[e.cat].label, e.title, e.text,
        e.author ?? "", (e.chips ?? []).join(", "), e.quote ?? "",
      ]);
      downloadCsv(filename, header, lines);
      return;
    }
    if (effectiveTab === "lista") {
      // Em "Todos os eventos" a planilha precisa dizer de que evento é cada
      // linha — sem isso o arquivo mistura eventos sem aviso.
      const header = [...(eventId ? [] : ["Evento"]), "ID", "Função", "Área", "Origem/Status", "Período", "Dias de trabalho", "Diárias", "Ida", "Volta", "Passagem", "Hotel", "Pedidos", "Observações", "Último movimento", "Movimento em"];
      const lines = filteredRows.map((r) => {
        const days = workDaysOf(r);
        const last = lastMoveOf(r);
        return [
          ...(eventId ? [] : [eventNameOf(r)]),
          `#${r.inclusionNumber}`, functionNameById.get(r.functionId) ?? "", r.area ?? "", originLabel(r), periodLabel(r),
          days.map((d) => formatDayMonthBr(d)).join(", "), String(days.length || r.dailyRates || 0),
          legLabel(r.transportModeIda, r.flightDepartureDate, r.flightArrivalSuggestedTime),
          legLabel(r.transportModeVolta, r.flightReturnDate, r.flightReturnSuggestedTime),
          r.needsTicket ? "Sim" : "Não", r.needsAccommodation ? "Sim" : "Não", String(r.requests.length), r.observations ?? "",
          last.label, last.at ? formatDateTimeBr(last.at) : "",
        ];
      });
      downloadCsv(filename, header, lines);
      return;
    }
    if (effectiveTab === "escala") {
      // Mesma agregação do ScheduleBoard (`aggregateByFunction`): função × dia.
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
      const fnLines = boardLines;
      const lines = fnLines.map((l) => [l.name, l.area, String(l.vagas), ...dates.map((d) => String(l.perDay[d] || 0)), String(l.total)]);
      const totalRow = [
        "Total por dia", "", String(fnLines.reduce((a, l) => a + l.vagas, 0)),
        ...dates.map((d) => String(fnLines.reduce((a, l) => a + (l.perDay[d] || 0), 0))),
        String(fnLines.reduce((a, l) => a + l.total, 0)),
      ];
      downloadCsv(filename, ["Função", "Área", "Vagas", ...dates.map((d) => formatDayMonthBr(d)), "Pessoas-dia"], [...lines, totalRow]);
      return;
    }
    // Pedidos: sai o que está na tela (busca, tipo e status aplicados) — igual às outras abas.
    const header = [...(eventId ? [] : ["Evento"]), "Tipo", "Função", "Vaga", "Área", "Solicitante", "Aberto em", "Motivo", "Status", "Revisado por", "Revisado em", "Comentário"];
    const lines = filteredRequests.map((r) => [
      ...(eventId ? [] : [eventNameOf(r)]),
      CHANGE_REQUEST_TYPE_LABELS[r.requestType as ChangeRequestType] ?? r.requestType,
      functionNameById.get(r.functionId) ?? "",
      r.teamInclusionId ? `#${rowById.get(r.teamInclusionId)?.inclusionNumber ?? "?"}` : "vaga nova",
      r.area ?? "", r.requestedByName ?? "", formatDateTimeBr(r.createdAt), r.reason ?? "",
      CHANGE_REQUEST_STATUS_LABELS[r.status as ChangeRequestStatus] ?? r.status,
      r.reviewedByName ?? "", r.reviewedAt ? formatDateTimeBr(r.reviewedAt) : "", r.reviewComment ?? "",
    ]);
    downloadCsv(filename, header, lines);
  };

  const approvalLink = (r: ScalingChangeRequest) => (
    canOpenApproval ? (
      <Link href={scalingHref("/scaling-approval", eventId, { request: r.id })} className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline whitespace-nowrap">
        <ExternalLink className="w-3 h-3" aria-hidden="true" /> Abrir na Aprovação
      </Link>
    ) : null
  );

  const showData = !viewQuery.isLoading && !viewQuery.error && (rows.length > 0 || requests.length > 0);
  /** Contagem da aba visível — "N de M": o filtrado e o total, no mesmo formato nas quatro abas. */
  const countText =
    effectiveTab === "timeline" ? `${filteredTimeline.length} de ${plural(timeline.length, "movimento", "movimentos")}`
      : effectiveTab === "lista" ? `${filteredRows.length} de ${plural(rows.length, "vaga", "vagas")}`
        : effectiveTab === "escala" ? `${boardRows.length} de ${plural(boardRowsAll.length, "vaga", "vagas")} no quadro`
          : `${filteredRequests.length} de ${plural(requests.length, "pedido", "pedidos")}`;

  /**
   * Bloco de dias da linha do tempo — o MESMO markup com evento selecionado e
   * dentro de cada evento no modo "todos" (a leitura não muda de um para outro).
   */
  const renderTimelineDays = (days: { key: string; label: string; items: TlEntry[] }[]) =>
    days.map((g) => (
      <div key={g.key} className="flex flex-col">
        <div className="sticky top-0 z-[2] flex items-center gap-2.5 bg-white pb-2 pt-3">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-800">{g.label}</span>
          <span className="text-[11px] text-slate-500">{plural(g.items.length, "movimento", "movimentos")}</span>
          <span className="h-px flex-1 bg-slate-100" aria-hidden="true" />
        </div>
        <ol className="m-0 flex list-none flex-col gap-3 border-l border-slate-200 pl-6">
          {g.items.map((e) => {
            const c = TL[e.cat];
            return (
              <li key={e.id} className="relative">
                <span className={cn("absolute -left-[33px] top-0.5 inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-white text-white", c.dot)} aria-hidden="true">
                  <c.icon className="h-2.5 w-2.5" />
                </span>
                <div className={cn("flex flex-col gap-1.5 rounded-xl border p-2.5", c.card)}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold text-slate-800">{e.title}</span>
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", c.tag)}>{e.tag}</span>
                    <span className="ml-auto font-mono text-[11px] text-slate-500">{hhmm(e.at)}</span>
                  </div>
                  {e.text && <p className="text-xs text-slate-600">{e.text}</p>}
                  {e.chips && e.chips.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {e.chips.map((ch, i) => {
                        const alvoId = idByNumber.get(ch);
                        return alvoId ? (
                          <button
                            key={`${e.id}-${i}`} type="button" onClick={() => setDetailId(alvoId)}
                            title="Ver o detalhe completo desta vaga"
                            className={cn(CHIP, "bg-brand-soft font-semibold text-primary transition-colors hover:bg-primary hover:text-white")}
                          >
                            {ch}
                          </button>
                        ) : (
                          <span key={`${e.id}-${i}`} className={cn(CHIP, "bg-slate-100 text-slate-600")}>{ch}</span>
                        );
                      })}
                    </div>
                  )}
                  {e.quote && <p className={cn("border-l-2 pl-2.5 text-xs text-slate-700 whitespace-pre-wrap break-words", c.quote)}>{e.quote}</p>}
                  {(e.author || e.href) && (
                    <div className="flex flex-wrap items-center gap-3">
                      {e.author && <span className="text-[11px] text-slate-500">{e.author}</span>}
                      {e.href && (
                        <Link href={e.href} className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />{e.linkLabel}
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    ));

  // ── Render ──
  return (
    <PageContainer fluid className="space-y-4">
      <PageHeader
        icon={History}
        title="Histórico da Escala"
        subtitle="Cada envio, validação, pedido e decisão — e onde cada vaga está agora."
        actions={
          <>
            {selectedEvent && <EventCommentsButton eventId={selectedEvent.id} eventName={selectedEvent.name} />}
            {/* Sem `disabled`: o botão continua na tabulação e o tooltip abre
                também pelo teclado, explicando POR QUE não há o que exportar.
                O clique é guardado; o sr-only repete o motivo para o leitor. */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button" size="sm" variant="outline"
                  aria-disabled={!exportEnabled}
                  className={cn("rounded-lg whitespace-nowrap", !exportEnabled && "cursor-not-allowed opacity-50 hover:bg-background hover:text-foreground")}
                  onClick={() => { if (exportEnabled) setExportOpen(true); }}
                >
                  <Download className="w-4 h-4 mr-1.5" aria-hidden="true" /> Exportar CSV
                  <span className="sr-only">{exportEnabled ? ` — aba ${TAB_LABEL[effectiveTab]}` : " — nada para exportar nesta aba"}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{exportEnabled ? `Exporta a aba ${TAB_LABEL[effectiveTab]} com os filtros aplicados` : "Nada para exportar nesta aba"}</TooltipContent>
            </Tooltip>
          </>
        }
      />
      {/* A fila do módulo (Sugestão → Validação → Aprovação → Histórico) tem
          faixa própria: dividindo a linha com os botões de ação ela parecia
          mais um botão — e espremia "Exportar CSV" em telas médias. */}
      <ScalingModuleNav current="history" eventId={eventId} className="-mt-1" />

      {/* ── Barra de contexto: evento · última movimentação · funil · KPIs ── */}
      <section aria-label="Evento" className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-primary shrink-0" aria-hidden="true">
            <CalendarDays className="w-4 h-4" />
          </span>
          <div ref={eventPickerRef} className="w-[280px] max-w-full shrink-0">
            {loadingEvents ? (
              <div className="h-8 rounded-lg bg-slate-100 animate-pulse" aria-hidden="true" />
            ) : (
              <EventCombobox
                events={activeEvents} value={eventId || ALL} showAllOption
                onValueChange={(v) => setEventId(v === ALL ? "" : v)}
                placeholder="Todos os eventos" testId="scaling-event-view-event"
                className="h-8 font-semibold"
              />
            )}
          </div>
          {selectedEvent ? (
            <p className={cn(LABEL, "truncate")}>
              <span className="font-mono">{formatDateRange(selectedEvent.startDate, selectedEvent.endDate, { withYear: true })}</span>
              {selectedEvent.location ? ` · ${selectedEvent.location}` : ""}
            </p>
          ) : (
            <p className={cn(LABEL, "truncate")}>
              {eventsInView > 0
                ? `${eventsInView} ${eventsInView === 1 ? "evento" : "eventos"} — com vaga em validação, pedido em aberto ou encerrados há pouco.`
                : "Todos os eventos — escolha um para filtrar."}
            </p>
          )}
          {showData && lastMovement && (
            <p className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-600">
              <Timer className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              Última movimentação: <strong className="font-semibold text-slate-800">{fmtShort(lastMovement.at)} — {lastMovement.title.toLowerCase()}</strong>
            </p>
          )}
        </div>

        {showData && rows.length > 0 && (
          <div className="space-y-2">
            {funnel.length > 0 && (
              <div
                className="flex h-3 items-center gap-1.5 overflow-hidden rounded-full bg-slate-100"
                role="img"
                aria-label={`Funil da escala: ${funnel.map((f) => `${f.label} ${f.n}`).join(", ")}`}
              >
                {funnel.map((f) => (
                  <span key={f.key} title={`${f.label}: ${f.n}`} className={cn("h-3", ORIGIN_DOT[f.key])} style={{ flexGrow: f.n, flexBasis: 0 }} />
                ))}
              </div>
            )}
            {/* Uma linha só, colunas de mesma largura (30/08): com quebra, o
                último indicador caía sozinho e esticado, parecendo outra coisa.
                Faltando espaço, a faixa rola em vez de quebrar. */}
            <div
              className="grid auto-cols-[minmax(106px,1fr)] grid-flow-col gap-2 overflow-x-auto pb-1"
              role="group"
              aria-label="Resumo das vagas (clique para filtrar a Lista)"
            >
              {KPIS.map((k) => {
                const active = k.key === ALL ? originFilter === ALL : originFilter === k.key;
                const on = active && k.key !== ALL;
                return (
                  <button
                    key={k.key}
                    type="button"
                    onClick={() => onKpiClick(k.key)}
                    aria-pressed={k.key === ALL ? undefined : active}
                    title={k.key === ALL ? "Limpar filtro de origem/status" : kpiWouldClear(k.key) ? "Clique para limpar o filtro" : k.hint ?? `Filtrar a Lista por "${k.label}"`}
                    className={cn(
                      "rounded-xl border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on ? "border-primary/30 bg-brand-soft" : "border-slate-100 bg-slate-50/70 hover:border-slate-300 hover:bg-white",
                    )}
                  >
                    <span className={cn("flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide leading-tight", on ? "text-primary" : "text-slate-500")}>
                      {k.key !== ALL && <span className={cn("inline-block w-1.5 h-1.5 rounded-full shrink-0", ORIGIN_DOT[k.key])} aria-hidden="true" />}
                      <span className="truncate">{k.label}</span>
                    </span>
                    <span className={cn("mt-0.5 block text-lg font-bold tabular-nums", k.cls)}>{k.n}</span>
                  </button>
                );
              })}
            </div>
            {deletedCount > 0 && (
              <p className="text-[11px] text-slate-500 text-right">
                + {plural(deletedCount, "vaga excluída", "vagas excluídas")} — fora da soma e do quadro.{" "}
                <button type="button" className="text-primary underline hover:no-underline" onClick={() => onKpiClick(DELETED)}>
                  {kpiWouldClear(DELETED) ? "Limpar filtro" : "Ver excluídas"}
                </button>
              </p>
            )}
          </div>
        )}
      </section>

      {/* ── Onde a escala está travada (sem role=status: a contagem das abas é a única região live) ── */}
      {showData && stalled && (effectiveTab === "timeline" || effectiveTab === "lista") && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
          <Timer className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-amber-900">{stalled.title}</p>
            <p className="mt-0.5 text-xs text-amber-800">{stalled.text}</p>
          </div>
          {canOpenApproval && (
            <Link href={scalingHref("/scaling-approval", eventId)} className="ml-auto text-xs font-medium text-primary hover:underline whitespace-nowrap">
              Abrir na Aprovação
            </Link>
          )}
        </div>
      )}

      {/* Teto do modo "todos os eventos" — a consulta histórica é a que mais
          cresce, então quando ela é cortada o filtro é a saída. Tom NEUTRO de
          propósito: não é um problema da escala (esse é o âmbar do "travada"
          acima), é só um aviso de que a página não mostra tudo. */}
      {truncated && (
        <p role="status" className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
          <span>
            <span className="font-semibold text-slate-700">Histórico parcial</span> — são muitos movimentos para mostrar de uma vez
            {viewQuery.data?.rowLimit ? ` (teto de ${viewQuery.data.rowLimit} vagas)` : ""}. Escolha um evento acima para ver o histórico completo dele.
          </span>
        </p>
      )}

      {/* As funções entram no gate (como na Validação): sem elas a tela abriria
          com "Sem função" em toda linha até a segunda consulta responder. */}
      {viewQuery.isLoading || (loadingFunctions && !functions) ? (
        <LoadingState count={5} label={viewQuery.isLoading ? (eventId ? "Carregando escala do evento…" : "Carregando histórico dos eventos…") : "Carregando funções…"} />
      ) : viewQuery.error ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-white p-6 text-center">
          <AlertCircle className="mx-auto mb-2 h-5 w-5 text-red-500" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-700">Não foi possível carregar a escala</p>
          <p className="mt-1 text-xs text-slate-500">{apiErrorMessage(viewQuery.error, "Verifique sua conexão e tente novamente.")}</p>
          <Button variant="outline" size="sm" className="mt-3 rounded-lg" onClick={() => viewQuery.refetch()}>Tentar novamente</Button>
        </div>
      ) : rows.length === 0 && requests.length === 0 ? (
        <EmptyState
          className="rounded-2xl"
          icon={CalendarRange}
          title={eventId ? "Nenhuma vaga passou pela Validação de Escala neste evento" : "Nenhuma vaga passou pela Validação de Escala"}
          description={eventId
            ? "A logística ainda não enviou a escala sugerida deste evento."
            : "Nenhum evento do recorte (com vaga em validação, pedido em aberto ou encerrado há pouco) tem histórico de escala. Escolha um evento acima para consultar o histórico dele."}
        />
      ) : (
        <Tabs value={effectiveTab} onValueChange={(v) => setTab(v as Tab)} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList className="h-auto rounded-xl bg-slate-100 p-[3px]">
              <TabsTrigger value="timeline" className="h-7 rounded-lg px-3.5 text-[13px]">Linha do tempo</TabsTrigger>
              <TabsTrigger value="lista" className="h-7 rounded-lg px-3.5 text-[13px]">Lista</TabsTrigger>
              {/* O quadro é função × dia DE UM evento: sem filtro ele somaria
                  dias de eventos diferentes na mesma coluna. A aba fica
                  visível e desabilitada (com o motivo no title) — sumir com
                  ela fazia a pessoa achar que a tela não tinha quadro. */}
              <TabsTrigger
                value="escala"
                disabled={!eventId}
                title={eventId ? undefined : "Escolha um evento para ver o quadro função × dia"}
                className="h-7 rounded-lg px-3.5 text-[13px] disabled:pointer-events-auto disabled:cursor-not-allowed"
              >
                Escala
              </TabsTrigger>
              <TabsTrigger value="pedidos" className="h-7 rounded-lg px-3.5 text-[13px]">Pedidos{requests.length ? ` (${requests.length})` : ""}</TabsTrigger>
            </TabsList>
            <p className={LABEL} aria-live="polite">{countText}</p>
          </div>

          {/* ── ABA 1: Linha do tempo ── */}
          <TabsContent value="timeline" className="mt-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
              <span className={SECTION}>Mostrar</span>
              {TL_ORDER.map((k) => {
                const c = TL[k];
                const on = tlCats.includes(k);
                const n = timeline.filter((e) => e.cat === k).length;
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setTlCats((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : TL_ORDER.filter((x) => cur.includes(x) || x === k)))}
                    className={cn(
                      "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on ? "border-primary/30 bg-brand-soft text-primary" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                    )}
                  >
                    <span className={cn("inline-block h-1.5 w-1.5 rounded-full", c.dot)} aria-hidden="true" />
                    {c.label} <span className="tabular-nums opacity-70">{n}</span>
                  </button>
                );
              })}
              <div className="relative ml-auto min-w-[220px]">
                <Label htmlFor="ev-tl-search" className="sr-only">Buscar movimento</Label>
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <Input
                  id="ev-tl-search" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Função, #ID, pessoa ou texto" className="h-8 pl-8 rounded-lg text-xs"
                />
              </div>
              {tlHasFilters && (
                <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg text-xs text-primary" onClick={clearTlFilters}>Limpar filtros</Button>
              )}
            </div>

            {/* `live={false}` dentro das abas: a contagem acima já é a (única)
                região aria-live — dois live regions se atropelam no leitor. */}
            {filteredTimeline.length === 0 ? (
              timeline.length === 0 ? (
                <EmptyState
                  live={false}
                  className="rounded-2xl"
                  icon={History}
                  title="Nenhum movimento registrado ainda"
                  description={eventId
                    ? "As vagas deste evento não têm envio, validação, pedido ou decisão com data registrada."
                    : "As vagas dos eventos do recorte não têm envio, validação, pedido ou decisão com data registrada."}
                />
              ) : (
                <EmptyState
                  live={false}
                  className="rounded-2xl"
                  variant="filtered"
                  title="Nada encontrado com esses filtros"
                  description="Ajuste a busca ou o tipo de movimento."
                  onClearFilters={tlHasFilters ? clearTlFilters : undefined}
                />
              )
            ) : !eventId ? (
              /* "Todos os eventos": um bloco por EVENTO (o de movimento mais
                 recente primeiro), N por vez — dentro dele, os dias de sempre. */
              <div className="space-y-3">
                {timelineEvents.slice(0, visibleEvents).map((g) => (
                  <section key={g.key} className="rounded-2xl border border-slate-200 bg-white px-4 pb-4 pt-1" aria-label={`Movimentos de ${g.name}`}>
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-slate-100 pb-2 pt-3">
                      <span className={SECTION}>Evento</span>
                      <span className="text-[13px] font-semibold text-slate-800">{g.name}</span>
                      {g.period && <span className="font-mono text-[11px] text-slate-500">{g.period}</span>}
                      <span className="text-[11px] text-slate-500">· {plural(g.items.length, "movimento", "movimentos")}</span>
                    </div>
                    {renderTimelineDays(groupByDay(g.items))}
                  </section>
                ))}
                {timelineEvents.length > visibleEvents && (
                  <div className="flex justify-center">
                    <Button
                      type="button" variant="outline" size="sm" className="rounded-lg"
                      onClick={() => setVisibleEvents((n) => n + TIMELINE_EVENTS_STEP)}
                    >
                      Ver mais eventos ({timelineEvents.length - visibleEvents} {timelineEvents.length - visibleEvents === 1 ? "restante" : "restantes"})
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 pb-4 pt-1">
                {renderTimelineDays(timelineDays)}
                {timelineStart && (
                  <p className="mt-4 text-center text-[11px] text-slate-500">Fim do histórico — a escala deste evento começou em {timelineStart}.</p>
                )}
              </div>
            )}
          </TabsContent>

          {/* ── ABA 2: Lista (situação atual de cada vaga) ── */}
          <TabsContent value="lista" className="space-y-3 mt-0">
            {/* `?tab=escala` sem evento: em vez de trocar de aba em silêncio, a
                Lista diz o que aconteceu e leva o foco ao seletor de evento. */}
            {escalaSemEvento && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/20 bg-brand-soft px-3.5 py-2.5">
                <Info className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <p className="min-w-0 flex-1 text-xs text-slate-700">
                  <span className="font-semibold text-slate-800">O quadro Escala precisa de um evento.</span>{" "}
                  Ele cruza função × dia de UM evento; enquanto isso, a Lista mostra as vagas de todos.
                </p>
                <Button type="button" variant="outline" size="sm" className="h-7 rounded-lg text-xs" onClick={focusEventPicker}>
                  Escolher evento
                </Button>
              </div>
            )}
            <div className="flex flex-wrap items-end gap-2.5 rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
              <div className="relative min-w-[240px] flex-1 space-y-1">
                <Label htmlFor="ev-search" className="sr-only">Buscar vaga</Label>
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <Input id="ev-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Função, #ID, área ou observação" className="h-8 pl-8 rounded-lg text-xs" />
              </div>
              <div className="min-w-[170px]">
                <Label htmlFor="ev-function" className="sr-only">Função</Label>
                <Select value={functionFilter} onValueChange={setFunctionFilter}>
                  <SelectTrigger id="ev-function" className="h-8 rounded-lg text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Todas as funções</SelectItem>
                    {functionsInEvent.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[190px]">
                <Label htmlFor="ev-origin" className="sr-only">Origem / status</Label>
                <Select value={originFilter} onValueChange={setOriginFilter}>
                  <SelectTrigger id="ev-origin" className="h-8 rounded-lg text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Todas as origens</SelectItem>
                    {originsInEvent.map((o) => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {listHasFilters && (
                <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg text-xs text-primary" onClick={clearListFilters}>Limpar filtros</Button>
              )}
            </div>

            {filteredRows.length === 0 ? (
              <EmptyState
                live={false}
                className="rounded-2xl"
                variant="filtered"
                title="Nada encontrado com esses filtros"
                description="Ajuste a busca, a função ou o filtro de origem/status."
                onClearFilters={listHasFilters ? clearListFilters : undefined}
              />
            ) : (
              <>
                <div className="hidden md:block rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  <div className={SCROLL_X} tabIndex={0} role="region" aria-label="Tabela de vagas (rolagem horizontal)">
                    <table className="w-full min-w-[1040px] text-sm">
                      <caption className="sr-only">{eventId ? "Vagas do evento na Validação de Escala" : "Vagas dos eventos do recorte na Validação de Escala"}</caption>
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="w-9 border-b border-slate-200 px-0"><span className="sr-only">Origem</span></th>
                          <th className={TH}>Vaga</th>
                          {!eventId && <th className={cn(TH, "min-w-[170px]")}>Evento</th>}
                          <th className={TH}>Período / diárias</th>
                          <th className={TH}>Logística</th>
                          <th className={cn(TH, "min-w-[230px]")}>Origem / status</th>
                          <th className={cn(TH, "min-w-[200px]")}>Último movimento</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.map((row, i) => {
                          const days = workDaysOf(row);
                          const dim = isDeleted(row) || (isSuggestionInclusion(row) && row.status === SUGESTAO_STATUS.NEGADA);
                          const last = lastMoveOf(row);
                          const fnName = functionNameById.get(row.functionId) ?? "Sem função";
                          // Logística nos MESMOS chips da Validação (ícone + ida/volta com data):
                          // cada chip carrega o próprio aria-label, então nada fica escondido
                          // num tooltip que só abre no hover.
                          const semLogistica = !row.needsTicket && !row.needsAccommodation
                            && !hasLeg(row.transportModeIda, row.flightDepartureDate, row.flightArrivalSuggestedTime)
                            && !hasLeg(row.transportModeVolta, row.flightReturnDate, row.flightReturnSuggestedTime);
                          return (
                            <tr key={row.id} className={cn("border-b border-slate-100", i % 2 === 1 ? "bg-slate-50/40" : "bg-white")}>
                              <td className="w-9 px-0 py-2">
                                <span className={cn("ml-2 block h-10 w-1 rounded-full", ORIGIN_DOT[originKey(row)])} aria-hidden="true" />
                              </td>
                              <td className="px-3 py-2 max-w-[280px]">
                                <div className="min-w-0">
                                  {/* #ID e nome num botão só: UMA parada de tabulação por
                                      linha (eram duas para a mesma ação), e o alvo de clique
                                      cresce sem o #ID deixar de parecer um chip. */}
                                  <button
                                    type="button" onClick={() => setDetailId(row.id)} title={`Ver o detalhe completo de ${fnName}`}
                                    className="group flex max-w-full items-center gap-2 rounded text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  >
                                    <span className="inline-flex shrink-0 rounded-md bg-brand-soft px-1.5 py-0.5 font-mono text-[11px] font-semibold text-primary tabular-nums transition-colors group-hover:bg-primary group-hover:text-white">#{row.inclusionNumber}</span>
                                    {/* Negada/excluída: riscada e mais clara — mas ainda legível (slate-500, não 400). */}
                                    <span className={cn("truncate text-[13px] font-semibold transition-colors group-hover:text-primary", dim ? "text-slate-500 line-through" : "text-slate-800")}>{fnName}</span>
                                  </button>
                                  <span className="mt-0.5 block truncate text-[11px] text-slate-500" title={row.observations ?? undefined}>
                                    {row.area ?? "Sem área"}{row.observations ? ` · ${row.observations}` : ""}
                                  </span>
                                </div>
                              </td>
                              {!eventId && (
                                <td className="px-3 py-2 max-w-[220px]">
                                  <span className="block truncate text-[13px] font-semibold text-slate-700" title={eventNameOf(row)}>{eventNameOf(row)}</span>
                                  <span className="block font-mono text-[11px] text-slate-500">
                                    {row.eventStartDate ? formatDateRange(ymd(row.eventStartDate), ymd(row.eventEndDate) || ymd(row.eventStartDate), { withYear: true }) : "Sem datas"}
                                  </span>
                                </td>
                              )}
                              <td className="px-3 py-2 whitespace-nowrap">
                                <span className={cn("font-mono text-xs tabular-nums", dim ? "text-slate-500" : "text-slate-700")}>{periodLabel(row)}</span>
                                <span className="ml-1 text-[11px] text-slate-500">· {formatDiarias(days.length || row.dailyRates || 0)}</span>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex min-w-[220px] flex-wrap items-center gap-1">
                                  <NeedChips needsTicket={row.needsTicket} needsAccommodation={row.needsAccommodation} />
                                  <LegChip dir="ida" mode={row.transportModeIda} date={row.flightDepartureDate} time={row.flightArrivalSuggestedTime} />
                                  <LegChip dir="volta" mode={row.transportModeVolta} date={row.flightReturnDate} time={row.flightReturnSuggestedTime} />
                                  {semLogistica && <span className="text-[11px] text-slate-500">Sem logística</span>}
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <OriginBadge row={row} />
                                  {row.requests.length > 0 && <span className="text-[11px] text-slate-500">{plural(row.requests.length, "pedido", "pedidos")}</span>}
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <span className="block text-xs text-slate-600">{last.label}</span>
                                <span className="block font-mono text-[11px] text-slate-500">{fmtShort(last.at)}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <ul className="md:hidden space-y-2" aria-label={eventId ? "Vagas do evento" : "Vagas dos eventos do recorte"}>
                  {filteredRows.map((row) => {
                    const days = workDaysOf(row);
                    const last = lastMoveOf(row);
                    const fnName = functionNameById.get(row.functionId) ?? "Sem função";
                    const semLogistica = !row.needsTicket && !row.needsAccommodation
                      && !hasLeg(row.transportModeIda, row.flightDepartureDate, row.flightArrivalSuggestedTime)
                      && !hasLeg(row.transportModeVolta, row.flightReturnDate, row.flightReturnSuggestedTime);
                    return (
                      /* O cartão inteiro abre o drawer (no desktop o #ID/nome já
                         abriam; no celular não havia como). O botão é só o
                         título e se "estica" pelo cartão via ::after — assim o
                         HTML continua válido (sem <dl> dentro de <button>) e a
                         seta à direita diz que o cartão é clicável. */
                      <li key={row.id} className="relative rounded-2xl border border-slate-200 bg-white p-3 space-y-2 transition-colors focus-within:ring-2 focus-within:ring-ring hover:border-slate-300">
                        <div className="flex items-start gap-2">
                          <button
                            type="button" onClick={() => setDetailId(row.id)} title={`Ver o detalhe completo de ${fnName}`}
                            className="min-w-0 flex-1 text-left focus-visible:outline-none after:absolute after:inset-0 after:rounded-2xl after:content-['']"
                          >
                            <span className="block truncate text-sm font-semibold text-slate-800">
                              <span className="mr-1.5 font-mono text-xs text-slate-500">#{row.inclusionNumber}</span>
                              {fnName}
                            </span>
                          </button>
                          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                        </div>
                        <p className={LABEL}>{row.area ?? "Sem área"}</p>
                        {!eventId && <p className={cn(LABEL, "truncate font-semibold text-slate-600")}>{eventNameOf(row)}</p>}
                        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                          <dt className="text-slate-500">Período</dt><dd className="font-mono text-slate-700">{periodLabel(row)} · {formatDiarias(days.length || row.dailyRates || 0)}</dd>
                          <dt className="text-slate-500">Último movimento</dt><dd className="text-slate-700">{last.label}{last.at ? ` · ${fmtShort(last.at)}` : ""}</dd>
                        </dl>
                        <div className="flex flex-wrap items-center gap-1">
                          <NeedChips needsTicket={row.needsTicket} needsAccommodation={row.needsAccommodation} />
                          <LegChip dir="ida" mode={row.transportModeIda} date={row.flightDepartureDate} time={row.flightArrivalSuggestedTime} />
                          <LegChip dir="volta" mode={row.transportModeVolta} date={row.flightReturnDate} time={row.flightReturnSuggestedTime} />
                          {semLogistica && <span className="text-[11px] text-slate-500">Sem logística</span>}
                        </div>
                        {row.observations && <p className="text-xs text-slate-500 italic">{row.observations}</p>}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <OriginBadge row={row} />
                          {row.requests.length > 0 && <span className="text-xs text-slate-500">{plural(row.requests.length, "pedido", "pedidos")}</span>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </TabsContent>

          {/* ── ABA 3: Escala (quadro função × dia) ── */}
          <TabsContent value="escala" className="mt-0 space-y-2.5">
            {/* Legenda por origem/status — clicável, é o MESMO filtro de origem da Lista/KPIs. */}
            {boardLegend.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Legenda do quadro por origem/status (clique para filtrar)">
                <span className={cn(SECTION, "mr-1")}>Legenda</span>
                {boardLegend.map((l) => {
                  const active = boardFilter === l.key;
                  return (
                    <button
                      key={l.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setOriginFilter(active ? ALL : l.key)}
                      title={active ? "Clique para mostrar todas" : `Mostrar só "${l.label}" no quadro`}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active ? "border-primary/30 bg-brand-soft text-primary" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                      )}
                    >
                      <span className={cn("inline-block w-2 h-2 rounded-full", ORIGIN_DOT[l.key])} aria-hidden="true" />
                      {l.label} <span className="tabular-nums text-slate-500">({l.n})</span>
                    </button>
                  );
                })}
                {boardFilter !== ALL && (
                  <button type="button" className="ml-1 text-[11px] text-primary hover:underline" onClick={() => setOriginFilter(ALL)}>Mostrar todas</button>
                )}
                {/* KPI "Negadas"/"Excluídas" ativo: a Lista está filtrada, o quadro não tem como estar. */}
                {originFilter !== ALL && boardFilter === ALL && (
                  <span className="ml-1 text-[11px] text-slate-500">O filtro "{ORIGIN_LABELS[originFilter] ?? originFilter}" não se aplica ao quadro.</span>
                )}
              </div>
            )}
            {/* No celular o quadro função × dia não cabe (uma coluna por dia); a
                lista traz os totais de cada função com os MESMOS números. */}
            <ul className="md:hidden space-y-2" aria-label="Vagas e pessoas-dia por função">
              {boardLines.length === 0 ? (
                <li className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">Nenhuma vaga com dias de trabalho para montar o quadro.</li>
              ) : boardLines.map((l) => (
                <li key={l.functionId} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{l.name}</p>
                    {l.area && <p className="truncate text-xs text-slate-500">{l.area}</p>}
                  </div>
                  <dl className="flex shrink-0 gap-3 text-right">
                    <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Vagas</dt><dd className="text-sm font-bold tabular-nums text-slate-800">{l.vagas}</dd></div>
                    <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Pessoas-dia</dt><dd className="text-sm font-bold tabular-nums text-primary">{l.total}</dd></div>
                  </dl>
                </li>
              ))}
              {boardLines.length > 0 && (
                <li className="flex items-center justify-between gap-3 px-3 text-xs font-semibold text-slate-700">
                  <span>Total</span>
                  <span className="tabular-nums">{plural(boardLines.reduce((a, l) => a + l.vagas, 0), "vaga", "vagas")} · {boardLines.reduce((a, l) => a + l.total, 0)} pessoas-dia</span>
                </li>
              )}
            </ul>
            <div className="hidden md:block">
              <ScheduleBoard rows={boardRows} functionNameById={functionNameById} rangeStart={selectedEvent?.startDate} rangeEnd={selectedEvent?.endDate} />
            </div>
            <p className="text-[11px] text-slate-500">Quadro função × dia — vagas negadas e excluídas não entram na soma.</p>
          </TabsContent>

          {/* ── ABA 4: Pedidos ── */}
          <TabsContent value="pedidos" className="mt-0 space-y-3">
            {requests.length === 0 ? (
              <EmptyState
                live={false}
                className="rounded-2xl"
                icon={PencilLine}
                title={eventId ? "Nenhum pedido neste evento" : "Nenhum pedido nos eventos do recorte"}
                description="As áreas não abriram pedidos de ajuste, inclusão ou exclusão."
              />
            ) : (
              <>
                {/* Mesma barra da Lista (busca + dois Selects): a aba tinha só a tabela, e
                    com dezenas de pedidos achar um era rolar a tela inteira. */}
                <div className="flex flex-wrap items-end gap-2.5 rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
                  <div className="relative min-w-[240px] flex-1 space-y-1">
                    <Label htmlFor="ev-req-search" className="sr-only">Buscar pedido</Label>
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                    <Input id="ev-req-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Função, #ID, área, pessoa ou texto" className="h-8 pl-8 rounded-lg text-xs" />
                  </div>
                  <div className="min-w-[150px]">
                    <Label htmlFor="ev-req-type" className="sr-only">Tipo do pedido</Label>
                    <Select value={requestTypeFilter} onValueChange={setRequestTypeFilter}>
                      <SelectTrigger id="ev-req-type" className="h-8 rounded-lg text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL}>Todos os tipos</SelectItem>
                        {requestTypesInView.map((t) => <SelectItem key={t} value={t}>{CHANGE_REQUEST_TYPE_LABELS[t]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-[190px]">
                    <Label htmlFor="ev-req-status" className="sr-only">Status do pedido</Label>
                    <Select value={requestStatusFilter} onValueChange={setRequestStatusFilter}>
                      <SelectTrigger id="ev-req-status" className="h-8 rounded-lg text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL}>Todos os status</SelectItem>
                        {requestStatusesInView.map((s) => <SelectItem key={s} value={s}>{CHANGE_REQUEST_STATUS_LABELS[s]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {reqHasFilters && (
                    <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg text-xs text-primary" onClick={clearReqFilters}>Limpar filtros</Button>
                  )}
                </div>

                {filteredRequests.length === 0 ? (
                  <EmptyState
                    live={false}
                    className="rounded-2xl"
                    variant="filtered"
                    title="Nada encontrado com esses filtros"
                    description="Ajuste a busca, o tipo ou o status do pedido."
                    onClearFilters={reqHasFilters ? clearReqFilters : undefined}
                  />
                ) : (
                  <>
                    <div className="hidden md:block rounded-2xl border border-slate-200 bg-white overflow-hidden">
                      <div className={SCROLL_X} tabIndex={0} role="region" aria-label="Tabela de pedidos (rolagem horizontal)">
                        <table className="w-full min-w-[900px] text-sm">
                          <caption className="sr-only">{eventId ? "Histórico de pedidos do evento" : "Histórico de pedidos dos eventos do recorte"}</caption>
                          <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                              <th className={TH}>Tipo</th>
                              <th className={cn(TH, "min-w-[240px]")}>Função / vaga</th>
                              <th className={TH}>Aberto em</th>
                              <th className={TH}>Status</th>
                              <th className={cn(TH, "min-w-[300px]")}>Decisão / comentário</th>
                              {canOpenApproval && <th className={cn(TH, "text-right")}><span className="sr-only">Ações</span></th>}
                            </tr>
                          </thead>
                          <tbody>
                            {filteredRequests.map((r, i) => (
                              <tr key={r.id} className={cn("border-b border-slate-100 align-top", i % 2 === 1 ? "bg-slate-50/40" : "bg-white")}>
                                <td className="px-3 py-2.5 align-top"><RequestTypeBadge type={r.requestType} /></td>
                                <td className="px-3 py-2.5 align-top max-w-[280px]">
                                  <span className="block text-[13px] font-semibold text-slate-800 truncate">{functionNameById.get(r.functionId) ?? "Sem função"}</span>
                                  {/* Sem filtro de evento, o pedido precisa dizer de qual ele é. */}
                                  {!eventId && <span className="block truncate text-[11px] font-semibold text-slate-500" title={eventNameOf(r)}>{eventNameOf(r)}</span>}
                                  <span className="block font-mono text-[11px] text-slate-500">
                                    {r.teamInclusionId ? `vaga #${rowById.get(r.teamInclusionId)?.inclusionNumber ?? "?"}` : "vaga nova"}{r.area ? ` · ${r.area}` : ""}
                                  </span>
                                  {r.reason && <span className="mt-0.5 block text-xs text-slate-600 line-clamp-2" title={r.reason}>{r.reason}</span>}
                                </td>
                                <td className="px-3 py-2.5 align-top whitespace-nowrap">
                                  <span className="block font-mono text-[11px] text-slate-500">{formatDateTimeBr(r.createdAt)}</span>
                                  <span className="block text-[11px] text-slate-500">por {r.requestedByName}</span>
                                </td>
                                <td className="px-3 py-2.5 align-top"><RequestStatusBadge status={r.status} /></td>
                                <td className="px-3 py-2.5 align-top min-w-[300px]">
                                  {r.reviewedByName ? (
                                    <>
                                      <span className="block text-[11px] text-slate-500">{r.reviewedByName} · {formatDateTimeBr(r.reviewedAt)}</span>
                                      {r.reviewComment && <span className="block text-xs text-slate-700 whitespace-pre-wrap break-words">{r.reviewComment}</span>}
                                    </>
                                  ) : <span className="text-xs text-slate-500">Aguardando decisão do aprovador.</span>}
                                </td>
                                {canOpenApproval && <td className="px-3 py-2.5 align-top text-right">{approvalLink(r)}</td>}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <ul className="md:hidden space-y-2" aria-label={eventId ? "Pedidos do evento" : "Pedidos dos eventos do recorte"}>
                      {filteredRequests.map((r) => (
                        <li key={r.id} className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2">
                          <div className="flex flex-wrap items-start gap-1.5">
                            <RequestTypeBadge type={r.requestType} />
                            <RequestStatusBadge status={r.status} />
                          </div>
                          <p className="text-sm font-semibold text-slate-800">
                            {functionNameById.get(r.functionId) ?? "Sem função"}
                            <span className="ml-1.5 font-mono text-xs font-normal text-slate-500">{r.teamInclusionId ? `vaga #${rowById.get(r.teamInclusionId)?.inclusionNumber ?? "?"}` : "vaga nova"}</span>
                          </p>
                          {!eventId && <p className={cn(LABEL, "truncate font-semibold text-slate-600")}>{eventNameOf(r)}</p>}
                          <p className={LABEL}>por {r.requestedByName} · {formatDateTimeBr(r.createdAt)}</p>
                          {r.reason && <p className="text-xs text-slate-600">{r.reason}</p>}
                          {r.reviewedByName && (
                            <p className="border-t border-slate-100 pt-2 text-xs text-slate-700">
                              <span className="block text-xs text-slate-500">{CHANGE_REQUEST_STATUS_LABELS[r.status as ChangeRequestStatus] ?? r.status} · {r.reviewedByName} · {formatDateTimeBr(r.reviewedAt)}</span>
                              {r.reviewComment}
                            </p>
                          )}
                          {approvalLink(r)}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* ── Exportar CSV (aba corrente) ── */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Exportar o histórico em CSV</DialogTitle>
            <DialogDescription>
              O arquivo sai com a aba aberta agora — <strong className="font-semibold text-slate-700">{TAB_LABEL[effectiveTab]}</strong> — com os filtros aplicados agora, separado por ponto e vírgula, pronto para o Excel.
            </DialogDescription>
          </DialogHeader>
          <ul className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            {/* "Evento" é a primeira coluna no modo "todos" (o quadro Escala só existe com evento). */}
            {[...(!eventId && effectiveTab !== "escala" ? [EXPORT_EVENT_COL] : []), ...EXPORT_COLS[effectiveTab]].map(([grupo, cols]) => (
              <li key={grupo} className="border-b border-slate-100 px-3 py-1.5 text-xs text-slate-500 last:border-b-0">
                <span className="font-semibold text-slate-700">{grupo}</span> {cols}
              </li>
            ))}
          </ul>
          <p className="font-mono text-[11px] text-slate-500 break-all">{exportFilename}</p>
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-lg" onClick={() => setExportOpen(false)}>Cancelar</Button>
            <Button type="button" className="rounded-lg" onClick={exportCsv}>Baixar CSV</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Leitura pura: sem callbacks de ação, o rodapé de validar/ajustar não aparece. */}
      <SuggestionDetailDrawer
        open={!!detailRow}
        onOpenChange={(o) => { if (!o) setDetailId(null); }}
        row={detailRow}
        functionName={detailRow ? functionNameById.get(detailRow.functionId) : undefined}
        event={detailRow ? activeEvents.find((e) => e.id === detailRow.eventId) : undefined}
        // Só o Histórico oferece o "abrir onde ela está": nas outras telas o
        // link apontaria para a própria tela.
        mostrarOndeEsta
      />
    </PageContainer>
  );
}
