import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import {
  AlertCircle, CalendarDays, CalendarRange, ClipboardCheck, Download, ExternalLink, Gavel,
  History, PencilLine, Search, Send, Timer, Trash2,
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
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
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
  SUGESTAO_STATUS, SUGESTAO_STATUS_LABELS, TRANSPORT_MODE_LABELS, CHANGE_REQUEST_STATUS,
  CHANGE_REQUEST_STATUS_LABELS, CHANGE_REQUEST_TYPE_LABELS,
  isSuggestionInclusion, type SugestaoStatus, type TransportMode, type ChangeRequestStatus, type ChangeRequestType,
} from "@shared/scaling-validation-rules";
import { workDaysOf, ymd, type FunctionWithManagers, type SuggestionRow } from "@/components/scaling-validation/types";
import { SuggestionStatusBadge, periodLabel } from "@/components/scaling-validation/suggestions-list";
import { ScheduleBoard } from "@/components/scaling-validation/schedule-board";
import { buildReadDateList } from "@/components/scaling-validation/scaling-grid-utils";
import { ScalingModuleNav } from "@/components/scaling-validation/scaling-module-nav";
import { RequestStatusBadge, RequestTypeBadge, ageLabel } from "@/components/scaling-approval/request-badges";
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
    return <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 whitespace-nowrap line-through decoration-red-300">{originLabel(row)}</span>;
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

function legLabel(mode: string | null | undefined, date: string | Date | null | undefined, time: string | null | undefined): string {
  const parts: string[] = [];
  if (mode) parts.push(TRANSPORT_MODE_LABELS[mode as TransportMode] ?? mode);
  if (date) parts.push(formatDayMonthBr(ymd(date)));
  if (time) parts.push(time);
  return parts.length ? parts.join(" ") : "—";
}
const hhmm = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
function fmtDateTime(v: string | Date | null | undefined): string {
  const d = toDate(v);
  return d ? `${formatDateBr(d)} ${hhmm(d)}` : "—";
}
/** "dd/mm hh:mm" — usado nas colunas compactas (Último movimento, hora da linha do tempo). */
function fmtShort(v: string | Date | null | undefined): string {
  const d = toDate(v);
  return d ? `${formatDayMonthBr(d)} ${hhmm(d)}` : "—";
}
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

/** Colunas anunciadas no diálogo de exportação (o CSV real segue esta ordem). */
const EXPORT_COLS: Record<Tab, [string, string][]> = {
  timeline: [["Quando", "data e hora"], ["Movimento", "tipo, título e descrição"], ["Quem", "autor do movimento"], ["Vagas", "#IDs e contagens envolvidas"], ["Comentário", "texto do pedido ou da decisão"]],
  lista: [["Vaga", "#ID, função, área, observações"], ["Período", "dias de trabalho, diárias"], ["Logística", "ida, volta, passagem, hotel"], ["Situação", "origem/status, pedidos"], ["Último movimento", "o que aconteceu e quando"]],
  escala: [["Função", "nome e área"], ["Vagas", "total por função"], ["Dias", "uma coluna por dia do período"], ["Pessoas-dia", "total por função e por dia"]],
  pedidos: [["Pedido", "tipo, função, vaga, área"], ["Abertura", "solicitante e data"], ["Motivo", "texto do solicitante"], ["Decisão", "status, aprovador, data, comentário"]],
};

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
}

/** Agrupa por minuto: um envio/validação/exclusão em lote vira UM movimento. */
function batchByMinute<T>(items: T[], at: (x: T) => unknown): { at: Date; items: T[] }[] {
  const map = new Map<number, { at: Date; items: T[] }>();
  for (const it of items) {
    const d = toDate(at(it));
    if (!d) continue;
    const k = Math.floor(d.getTime() / 60_000);
    const g = map.get(k);
    if (g) g.items.push(it);
    else map.set(k, { at: d, items: [it] });
  }
  return Array.from(map.values());
}
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
function namesOf(rows: EventViewRow[], nameById: Map<string, string>, max = 4): string {
  const uniq = Array.from(new Set(rows.map((r) => nameById.get(r.functionId) ?? "—")));
  return uniq.length <= max ? uniq.join(", ") : `${uniq.slice(0, max).join(", ")} e mais ${uniq.length - max}`;
}
const idChips = (rows: EventViewRow[], max = 8) =>
  rows.slice(0, max).map((r) => `#${r.inclusionNumber}`).concat(rows.length > max ? [`+${rows.length - max}`] : []);

// ── Estado vazio local ───────────────────────────────────────────────────────

/**
 * Cópia local do EmptyState com uma diferença de a11y: `role="status"` só nos
 * estados de PÁGINA. Dentro das abas, a contagem já é a (única) região
 * aria-live da tela — dois live regions simultâneos se atropelam no leitor.
 */
function ViewEmpty({ icon: Icon, title, description, onClear, live }: {
  icon: LucideIcon; title: string; description?: string; onClear?: () => void; live?: boolean;
}) {
  return (
    <div role={live ? "status" : undefined} className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {description && <p className="mt-1 max-w-md text-xs text-slate-500">{description}</p>}
      {onClear && (
        <Button type="button" variant="outline" size="sm" className="mt-4 rounded-lg" onClick={onClear}>Limpar filtros</Button>
      )}
    </div>
  );
}

const TH = "px-3 py-2 text-left text-[11px] uppercase tracking-widest text-slate-500 font-semibold whitespace-nowrap";
const LABEL = "text-xs text-slate-500";
const CHIP = "inline-flex items-center h-[22px] rounded-full px-2 text-[11px] font-medium";

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
  const { eventId, setEventId, sanitize } = useScalingEvent(BASE_PATH, { extraParams: () => tabParams(tab) });
  const setTab = useCallback((t: Tab) => {
    setLocation(scalingHref(BASE_PATH, eventId, tabParams(t)), { replace: true });
  }, [eventId, setLocation, tabParams]);

  const [search, setSearch] = useState("");
  const [originFilter, setOriginFilter] = useState(ALL);
  const [functionFilter, setFunctionFilter] = useState(ALL);
  /** Filtro de status do quadro (legenda clicável). */
  const [boardFilter, setBoardFilter] = useState(ALL);
  /** Categorias visíveis na linha do tempo. */
  const [tlCats, setTlCats] = useState<TlCat[]>(TL_ORDER);
  const [exportOpen, setExportOpen] = useState(false);

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
  const kpiWouldClear = (key: string) => key === ALL || (tab === "lista" && originFilter === key);
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
    const out: TlEntry[] = [];
    const fnName = (id: string) => functionNameById.get(id) ?? "—";

    for (const g of batchByMinute(rows, (r) => r.suggestionSentAt)) {
      const funcs = new Set(g.items.map((r) => r.functionId)).size;
      const pessoasDia = g.items.reduce((a, r) => a + (workDaysOf(r).length || r.dailyRates || 0), 0);
      out.push({
        id: `envio-${g.at.getTime()}`, cat: "envio", at: g.at,
        title: "Escala sugerida enviada para validação", tag: "Envio",
        text: `${namesOf(g.items, functionNameById)} — a logística mandou as vagas para as áreas conferirem.`,
        chips: [plural(g.items.length, "vaga", "vagas"), plural(funcs, "função", "funções"), `${pessoasDia} pessoas-dia`],
      });
    }
    for (const g of batchByMinute(rows, (r) => r.validatedAt)) {
      out.push({
        id: `val-${g.at.getTime()}`, cat: "validacao", at: g.at,
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
    for (const g of batchByMinute(rows.filter((r) => !isSuggestionInclusion(r) && !isDeleted(r)), (r) => r.updatedAt)) {
      out.push({
        id: `apr-${g.at.getTime()}`, cat: "decisao", at: g.at,
        title: `${plural(g.items.length, "vaga virou", "vagas viraram")} Inclusão de Equipe`, tag: "Aprovação",
        text: `${namesOf(g.items, functionNameById)} — aprovadas pelo aprovador e fora da Validação (data da última alteração da vaga).`,
        chips: idChips(g.items),
      });
    }
    for (const g of batchByMinute(rows, (r) => r.deletedAt)) {
      out.push({
        id: `del-${g.at.getTime()}`, cat: "exclusao", at: g.at,
        title: `${plural(g.items.length, "vaga excluída", "vagas excluídas")}`, tag: "Excluída",
        text: `${namesOf(g.items, functionNameById)} — fora da soma dos indicadores e do quadro.`,
        chips: idChips(g.items),
      });
    }
    for (const r of requests) {
      const tipo = CHANGE_REQUEST_TYPE_LABELS[r.requestType as ChangeRequestType] ?? r.requestType;
      const alvo = r.teamInclusionId ? `vaga #${rowById.get(r.teamInclusionId)?.inclusionNumber ?? "—"}` : "vaga nova";
      const where = `${fnName(r.functionId)} · ${alvo}${r.area ? ` · ${r.area}` : ""}`;
      const href = canOpenApproval ? scalingHref("/scaling-approval", eventId, { request: r.id }) : undefined;
      const created = toDate(r.createdAt);
      if (created) {
        out.push({
          id: `req-${r.id}`, cat: "pedido", at: created,
          title: `Pedido de ${tipo.toLowerCase()} aberto`, tag: tipo,
          text: where, author: r.requestedByName ? `${r.requestedByName} (solicitante)` : undefined,
          quote: r.reason ?? undefined, href, linkLabel: "Abrir na Aprovação",
        });
      }
      const reviewed = toDate(r.reviewedAt);
      if (reviewed) {
        const st = CHANGE_REQUEST_STATUS_LABELS[r.status as ChangeRequestStatus] ?? r.status;
        out.push({
          id: `dec-${r.id}`, cat: "decisao", at: reviewed,
          title: `Pedido de ${tipo.toLowerCase()} — ${st.toLowerCase()}`, tag: st,
          text: where, author: r.reviewedByName ? `${r.reviewedByName} (aprovador)` : undefined,
          quote: r.reviewComment ?? undefined, href, linkLabel: "Abrir na Aprovação",
        });
      }
    }
    return out.sort((a, b) => b.at.getTime() - a.at.getTime());
  }, [rows, requests, rowById, functionNameById, canOpenApproval, eventId]);

  const filteredTimeline = useMemo(() => {
    const q = search.trim().toLowerCase();
    return timeline
      .filter((e) => tlCats.includes(e.cat))
      // Os chips carregam os #IDs das vagas (e as contagens do envio); sem eles o
      // placeholder prometeria "#ID" e buscar "1049" não acharia o cartão.
      .filter((e) => !q || `${e.title} ${e.text} ${e.tag} ${e.author ?? ""} ${e.quote ?? ""} ${(e.chips ?? []).join(" ")}`.toLowerCase().includes(q));
  }, [timeline, tlCats, search]);
  /** Movimentos agrupados por dia (mais recente primeiro). */
  const timelineDays = useMemo(() => {
    const today = formatDateBr(new Date());
    const out: { key: string; label: string; items: TlEntry[] }[] = [];
    for (const e of filteredTimeline) {
      const key = formatDateBr(e.at);
      let g = out.find((x) => x.key === key);
      if (!g) { g = { key, label: key === today ? `${key} · hoje` : key, items: [] }; out.push(g); }
      g.items.push(e);
    }
    return out;
  }, [filteredTimeline]);
  const timelineStart = timeline.length ? formatDateBr(timeline[timeline.length - 1].at) : "";
  const lastMovement = timeline[0] ?? null;

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
    if (awaiting.length) parts.push(`${plural(awaiting.length, "vaga validada espera", "vagas validadas esperam")} decisão do aprovador (a mais antiga ${ageLabel(awaiting.reduce((m, r) => Math.max(m, daysSince(r.validatedAt)), 0))})`);
    if (open.length) parts.push(`${plural(open.length, "pedido em aberto", "pedidos em aberto")} (o mais antigo ${ageLabel(open.reduce((m, r) => Math.max(m, daysSince(r.createdAt)), 0))})`);
    if (never) parts.push(`${plural(never, "vaga ainda não validada", "vagas ainda não validadas")} pela área`);
    return {
      title: awaiting.length || open.length ? "A escala está travada na aprovação" : "A escala está esperando a validação das áreas",
      text: `${parts.join(" · ")}.`,
    };
  }, [liveRows, requests, counts.pendentes]);

  // ── Quadro (Escala): vagas vivas, sem negadas (o board já ignora), com filtro de legenda ──
  const boardRowsAll = useMemo(() => liveRows.filter((r) => originKey(r) !== SUGESTAO_STATUS.NEGADA), [liveRows]);
  const boardLegend = useMemo(() => {
    const keys = new Set(boardRowsAll.map(originKey));
    return ORIGIN_ORDER.filter((k) => keys.has(k)).map((k) => ({ key: k, label: ORIGIN_LABELS[k], n: boardRowsAll.filter((r) => originKey(r) === k).length }));
  }, [boardRowsAll]);
  const boardRows = useMemo(() => (boardFilter === ALL ? boardRowsAll : boardRowsAll.filter((r) => originKey(r) === boardFilter)), [boardRowsAll, boardFilter]);
  useEffect(() => { if (boardFilter !== ALL && !boardLegend.some((l) => l.key === boardFilter)) setBoardFilter(ALL); }, [boardLegend, boardFilter]);

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
    if (!c.length) return { label: "—", at: null };
    return c.reduce((best, x) => (x.at && best.at && x.at.getTime() >= best.at.getTime() ? x : best));
  }, []);

  // ── Export CSV da ABA corrente (BOM + ;) ──
  const exportEnabled = !!eventId && (
    tab === "timeline" ? filteredTimeline.length > 0
      : tab === "lista" ? filteredRows.length > 0
        : tab === "escala" ? boardRows.length > 0
          : requests.length > 0
  );
  const exportFilename = `historico-escala-${slugify(selectedEvent?.name ?? "evento")}-${tab}-${todayIso()}.csv`;
  const exportCsv = () => {
    setExportOpen(false);
    const filename = exportFilename;
    if (tab === "timeline") {
      const header = ["Data", "Hora", "Tipo", "Movimento", "Descrição", "Quem", "Vagas", "Comentário"];
      const lines = filteredTimeline.map((e) => [
        formatDateBr(e.at), hhmm(e.at), TL[e.cat].label, e.title, e.text,
        e.author ?? "", (e.chips ?? []).join(", "), e.quote ?? "",
      ]);
      downloadCsv(filename, header, lines);
      return;
    }
    if (tab === "lista") {
      const header = ["ID", "Função", "Área", "Origem/Status", "Período", "Dias de trabalho", "Diárias", "Ida", "Volta", "Passagem", "Hotel", "Pedidos", "Observações", "Último movimento", "Movimento em"];
      const lines = filteredRows.map((r) => {
        const days = workDaysOf(r);
        const last = lastMoveOf(r);
        return [
          `#${r.inclusionNumber}`, functionNameById.get(r.functionId) ?? "", r.area ?? "", originLabel(r), periodLabel(r),
          days.map((d) => formatDayMonthBr(d)).join(", "), String(days.length || r.dailyRates || 0),
          legLabel(r.transportModeIda, r.flightDepartureDate, r.flightArrivalSuggestedTime),
          legLabel(r.transportModeVolta, r.flightReturnDate, r.flightReturnSuggestedTime),
          r.needsTicket ? "Sim" : "Não", r.needsAccommodation ? "Sim" : "Não", String(r.requests.length), r.observations ?? "",
          last.label, last.at ? fmtDateTime(last.at) : "",
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
      <Link href={scalingHref("/scaling-approval", eventId, { request: r.id })} className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline whitespace-nowrap">
        <ExternalLink className="w-3 h-3" aria-hidden="true" /> Abrir na Aprovação
      </Link>
    ) : null
  );

  const showData = !!eventId && !viewQuery.isLoading && !viewQuery.error && (rows.length > 0 || requests.length > 0);
  const countText =
    tab === "timeline" ? `${filteredTimeline.length} de ${timeline.length} movimento(s)`
      : tab === "lista" ? `${filteredRows.length} de ${rows.length} vaga(s)`
        : tab === "escala" ? "Quadro função × dia (vagas negadas e excluídas não entram)"
          : `${requests.length} pedido(s)`;

  // ── Render ──
  return (
    <PageContainer fluid className="space-y-4">
      <PageHeader
        icon={History}
        title="Histórico da Escala"
        subtitle="Como a escala deste evento andou: cada envio, validação, pedido e decisão, na ordem em que aconteceram — e onde ela está agora."
        actions={
          <>
            <ScalingModuleNav current="history" eventId={eventId} />
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex" tabIndex={exportEnabled ? -1 : 0}>
                  <Button type="button" size="sm" variant="outline" className="rounded-lg" disabled={!exportEnabled} onClick={() => setExportOpen(true)}>
                    <Download className="w-4 h-4 mr-1.5" aria-hidden="true" /> Exportar CSV · {TAB_LABEL[tab]}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{exportEnabled ? `Exporta a aba ${TAB_LABEL[tab]}` : "Nada para exportar nesta aba"}</TooltipContent>
            </Tooltip>
          </>
        }
      />

      {/* ── Barra de contexto: evento · última movimentação · funil · KPIs ── */}
      <section aria-label="Evento" className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-primary shrink-0" aria-hidden="true">
            <CalendarDays className="w-4 h-4" />
          </span>
          <div className="w-[280px] max-w-full shrink-0">
            {loadingEvents ? (
              <div className="h-8 rounded-lg bg-slate-100 animate-pulse" aria-hidden="true" />
            ) : (
              <EventCombobox
                events={activeEvents} value={eventId} showAllOption={false}
                onValueChange={(v) => setEventId(v === ALL ? "" : v)}
                placeholder="Selecione um evento" testId="scaling-event-view-event"
                className="h-8 font-semibold"
              />
            )}
          </div>
          {selectedEvent && (
            <p className={cn(LABEL, "truncate")}>
              <span className="font-mono">{formatDateRange(selectedEvent.startDate, selectedEvent.endDate, { withYear: true })}</span>
              {selectedEvent.location ? ` · ${selectedEvent.location}` : ""}
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
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2" role="group" aria-label="Resumo das vagas (clique para filtrar a Lista)">
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
              <p className={cn("text-[11px] text-slate-400 text-right")}>
                + {deletedCount} vaga(s) excluída(s) — fora da soma e do quadro.{" "}
                <button type="button" className="text-primary underline hover:no-underline" onClick={() => onKpiClick(DELETED)}>
                  {kpiWouldClear(DELETED) ? "Limpar filtro" : "Ver excluídas"}
                </button>
              </p>
            )}
          </div>
        )}
      </section>

      {/* ── Onde a escala está travada (sem role=status: a contagem das abas é a única região live) ── */}
      {showData && stalled && (tab === "timeline" || tab === "lista") && (
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

      {!eventId ? (
        <ViewEmpty
          live
          icon={CalendarRange}
          title="Selecione um evento"
          description="O histórico é por evento: escolha um acima para ver a linha do tempo da escala, a situação de cada vaga e os pedidos."
        />
      ) : viewQuery.isLoading ? (
        <LoadingState count={5} label="Carregando escala do evento…" />
      ) : viewQuery.error ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-white p-6 text-center">
          <AlertCircle className="mx-auto mb-2 h-5 w-5 text-red-500" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-700">Não foi possível carregar a escala</p>
          <p className="mt-1 text-xs text-slate-500">{apiErrorMessage(viewQuery.error, "Verifique sua conexão e tente novamente.")}</p>
          <Button variant="outline" size="sm" className="mt-3 rounded-lg" onClick={() => viewQuery.refetch()}>Tentar novamente</Button>
        </div>
      ) : rows.length === 0 && requests.length === 0 ? (
        <ViewEmpty
          live
          icon={CalendarRange}
          title="Nenhuma vaga passou pela Validação de Escala neste evento"
          description="A logística ainda não enviou a escala sugerida deste evento."
        />
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList className="h-auto rounded-xl bg-slate-100 p-[3px]">
              <TabsTrigger value="timeline" className="h-7 rounded-lg px-3.5 text-[13px]">Linha do tempo</TabsTrigger>
              <TabsTrigger value="lista" className="h-7 rounded-lg px-3.5 text-[13px]">Lista</TabsTrigger>
              <TabsTrigger value="escala" className="h-7 rounded-lg px-3.5 text-[13px]">Escala</TabsTrigger>
              <TabsTrigger value="pedidos" className="h-7 rounded-lg px-3.5 text-[13px]">Pedidos{requests.length ? ` (${requests.length})` : ""}</TabsTrigger>
            </TabsList>
            <p className={LABEL} aria-live="polite">{countText}</p>
          </div>

          {/* ── ABA 1: Linha do tempo ── */}
          <TabsContent value="timeline" className="mt-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Mostrar</span>
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

            {filteredTimeline.length === 0 ? (
              timeline.length === 0 ? (
                <ViewEmpty
                  icon={History}
                  title="Nenhum movimento registrado ainda"
                  description="As vagas deste evento não têm envio, validação, pedido ou decisão com data registrada."
                />
              ) : (
                <ViewEmpty
                  icon={Search}
                  title="Nada encontrado com esses filtros"
                  description="Ajuste a busca ou o tipo de movimento."
                  onClear={tlHasFilters ? clearTlFilters : undefined}
                />
              )
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 pb-4 pt-1">
                {timelineDays.map((g) => (
                  <div key={g.key} className="flex flex-col">
                    <div className="sticky top-0 z-[2] flex items-center gap-2.5 bg-white pb-2 pt-3">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-800">{g.label}</span>
                      <span className="text-[11px] text-slate-400">{plural(g.items.length, "movimento", "movimentos")}</span>
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
                                <span className="ml-auto font-mono text-[11px] text-slate-400">{hhmm(e.at)}</span>
                              </div>
                              {e.text && <p className="text-xs text-slate-600">{e.text}</p>}
                              {e.chips && e.chips.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {e.chips.map((ch, i) => <span key={`${e.id}-${i}`} className={cn(CHIP, "bg-slate-100 text-slate-600")}>{ch}</span>)}
                                </div>
                              )}
                              {e.quote && <p className={cn("border-l-2 pl-2.5 text-xs text-slate-700 whitespace-pre-wrap break-words", c.quote)}>{e.quote}</p>}
                              {(e.author || e.href) && (
                                <div className="flex flex-wrap items-center gap-3">
                                  {e.author && <span className="text-[11px] text-slate-400">{e.author}</span>}
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
                ))}
                {timelineStart && (
                  <p className="mt-4 text-center text-[11px] text-slate-400">Fim do histórico — a escala deste evento começou em {timelineStart}.</p>
                )}
              </div>
            )}
          </TabsContent>

          {/* ── ABA 2: Lista (situação atual de cada vaga) ── */}
          <TabsContent value="lista" className="space-y-3 mt-0">
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
              <ViewEmpty
                icon={Search}
                title="Nada encontrado com esses filtros"
                description="Ajuste a busca, a função ou o filtro de origem/status."
                onClear={listHasFilters ? clearListFilters : undefined}
              />
            ) : (
              <>
                <div className="hidden md:block rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[940px] text-sm">
                      <caption className="sr-only">Vagas do evento na Validação de Escala</caption>
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="w-9 border-b border-slate-200 px-0"><span className="sr-only">Origem</span></th>
                          <th className={TH}>Vaga</th>
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
                          const fnName = functionNameById.get(row.functionId) ?? "—";
                          const chips: { text: string; cls: string }[] = [];
                          if (row.needsTicket) chips.push({ text: "Passagem", cls: "bg-violet-50 text-violet-700" });
                          if (row.needsAccommodation) chips.push({ text: "Hotel", cls: "bg-sky-50 text-sky-700" });
                          if (!chips.length) chips.push({ text: "—", cls: "bg-slate-50 text-slate-400" });
                          // Ida/volta só existem no tooltip: sem `tabIndex` no gatilho, teclado e
                          // leitor de tela nunca chegariam neles. O aria-label repete o conteúdo
                          // inteiro para não depender do tooltip abrir.
                          const ida = legLabel(row.transportModeIda, row.flightDepartureDate, row.flightArrivalSuggestedTime);
                          const volta = legLabel(row.transportModeVolta, row.flightReturnDate, row.flightReturnSuggestedTime);
                          const logisticaLabel = `Logística: ${row.needsTicket ? "passagem" : "sem passagem"}, ${row.needsAccommodation ? "hotel" : "sem hotel"} · Ida: ${ida} · Volta: ${volta}`;
                          return (
                            <tr key={row.id} className={cn("border-b border-slate-100", i % 2 === 1 ? "bg-slate-50/40" : "bg-white")}>
                              <td className="w-9 px-0 py-2">
                                <span className={cn("ml-2 block h-10 w-1 rounded-full", ORIGIN_DOT[originKey(row)])} aria-hidden="true" />
                              </td>
                              <td className="px-3 py-2 max-w-[280px]">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="inline-flex rounded-md bg-brand-soft px-1.5 py-0.5 font-mono text-[11px] font-semibold text-primary tabular-nums">#{row.inclusionNumber}</span>
                                  <div className="min-w-0">
                                    <span className={cn("block truncate text-[13px] font-semibold", dim ? "text-slate-400 line-through" : "text-slate-800")} title={fnName}>{fnName}</span>
                                    <span className="block truncate text-[11px] text-slate-400" title={row.observations ?? undefined}>
                                      {row.area ?? "Sem área"}{row.observations ? ` · ${row.observations}` : ""}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                <span className={cn("font-mono text-xs tabular-nums", dim ? "text-slate-400" : "text-slate-700")}>{periodLabel(row)}</span>
                                <span className="ml-1 text-[11px] text-slate-400">· {formatDiarias(days.length || row.dailyRates || 0)}</span>
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span
                                      tabIndex={0}
                                      aria-label={logisticaLabel}
                                      className="inline-flex gap-1.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                      {chips.map((c) => <span key={c.text} className={cn(CHIP, c.cls)} aria-hidden="true">{c.text}</span>)}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <span className="block">Ida: {ida}</span>
                                    <span className="block">Volta: {volta}</span>
                                  </TooltipContent>
                                </Tooltip>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <OriginBadge row={row} />
                                  {row.requests.length > 0 && <span className="text-[11px] text-slate-500">{row.requests.length} pedido(s)</span>}
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <span className="block text-xs text-slate-600">{last.label}</span>
                                <span className="block font-mono text-[11px] text-slate-400">{last.at ? fmtShort(last.at) : "—"}</span>
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
                    const last = lastMoveOf(row);
                    return (
                      <li key={row.id} className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2">
                        <p className="text-sm font-semibold text-slate-800 truncate">
                          <span className="mr-1.5 font-mono text-xs text-slate-500">#{row.inclusionNumber}</span>
                          {functionNameById.get(row.functionId) ?? "—"}
                        </p>
                        <p className={LABEL}>{row.area ?? "Sem área"}</p>
                        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                          <dt className="text-slate-500">Período</dt><dd className="font-mono text-slate-700">{periodLabel(row)} · {formatDiarias(days.length || row.dailyRates || 0)}</dd>
                          <dt className="text-slate-500">Ida</dt><dd className="text-slate-700">{legLabel(row.transportModeIda, row.flightDepartureDate, row.flightArrivalSuggestedTime)}</dd>
                          <dt className="text-slate-500">Volta</dt><dd className="text-slate-700">{legLabel(row.transportModeVolta, row.flightReturnDate, row.flightReturnSuggestedTime)}</dd>
                          <dt className="text-slate-500">Passagem / hotel</dt><dd className="text-slate-700">{row.needsTicket ? "Passagem" : "—"} / {row.needsAccommodation ? "Hotel" : "—"}</dd>
                          <dt className="text-slate-500">Último movimento</dt><dd className="text-slate-700">{last.label}{last.at ? ` · ${fmtShort(last.at)}` : ""}</dd>
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

          {/* ── ABA 3: Escala (quadro função × dia) ── */}
          <TabsContent value="escala" className="mt-0 space-y-2.5">
            {/* Legenda por origem/status — clicável, filtra as vagas que entram no quadro. */}
            {boardLegend.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Legenda do quadro por origem/status (clique para filtrar)">
                <span className="mr-1 text-[11px] text-slate-400">Legenda:</span>
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
                        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active ? "border-primary/30 bg-brand-soft text-primary" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                      )}
                    >
                      <span className={cn("inline-block w-2 h-2 rounded-full", ORIGIN_DOT[l.key])} aria-hidden="true" />
                      {l.label} <span className="tabular-nums text-slate-400">({l.n})</span>
                    </button>
                  );
                })}
                {boardFilter !== ALL && (
                  <button type="button" className="ml-1 text-[11px] text-primary hover:underline" onClick={() => setBoardFilter(ALL)}>Mostrar todas</button>
                )}
              </div>
            )}
            <ScheduleBoard rows={boardRows} functionNameById={functionNameById} rangeStart={selectedEvent?.startDate} rangeEnd={selectedEvent?.endDate} />
            <p className="text-[11px] text-slate-400">Quadro função × dia — vagas negadas e excluídas não entram na soma.</p>
          </TabsContent>

          {/* ── ABA 4: Pedidos ── */}
          <TabsContent value="pedidos" className="mt-0">
            {requests.length === 0 ? (
              <ViewEmpty icon={PencilLine} title="Nenhum pedido neste evento" description="As áreas não abriram pedidos de ajuste, inclusão ou exclusão." />
            ) : (
              <>
                <div className="hidden md:block rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-sm">
                      <caption className="sr-only">Histórico de pedidos do evento</caption>
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
                        {requests.map((r, i) => (
                          <tr key={r.id} className={cn("border-b border-slate-100 align-top", i % 2 === 1 ? "bg-slate-50/40" : "bg-white")}>
                            <td className="px-3 py-2.5 align-top"><RequestTypeBadge type={r.requestType} /></td>
                            <td className="px-3 py-2.5 align-top max-w-[280px]">
                              <span className="block text-[13px] font-semibold text-slate-800 truncate">{functionNameById.get(r.functionId) ?? "—"}</span>
                              <span className="block font-mono text-[11px] text-slate-400">
                                {r.teamInclusionId ? `vaga #${rowById.get(r.teamInclusionId)?.inclusionNumber ?? "—"}` : "vaga nova"}{r.area ? ` · ${r.area}` : ""}
                              </span>
                              {r.reason && <span className="mt-0.5 block text-xs text-slate-600 line-clamp-2" title={r.reason}>{r.reason}</span>}
                            </td>
                            <td className="px-3 py-2.5 align-top whitespace-nowrap">
                              <span className="block font-mono text-[11px] text-slate-500">{fmtDateTime(r.createdAt)}</span>
                              <span className="block text-[11px] text-slate-400">por {r.requestedByName}</span>
                            </td>
                            <td className="px-3 py-2.5 align-top"><RequestStatusBadge status={r.status} /></td>
                            <td className="px-3 py-2.5 align-top min-w-[300px]">
                              {r.reviewedByName ? (
                                <>
                                  <span className="block text-[11px] text-slate-400">{r.reviewedByName} · {fmtDateTime(r.reviewedAt)}</span>
                                  {r.reviewComment && <span className="block text-xs text-slate-700 whitespace-pre-wrap break-words">{r.reviewComment}</span>}
                                </>
                              ) : <span className="text-xs text-slate-400">Aguardando decisão do aprovador.</span>}
                            </td>
                            {canOpenApproval && <td className="px-3 py-2.5 align-top text-right">{approvalLink(r)}</td>}
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
                        <p className="border-t border-slate-100 pt-2 text-xs text-slate-700">
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

      {/* ── Exportar CSV (aba corrente) ── */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Exportar o histórico em CSV</DialogTitle>
            <DialogDescription>
              O arquivo sai com a aba aberta agora — <strong className="font-semibold text-slate-700">{TAB_LABEL[tab]}</strong> — separado por ponto e vírgula, pronto para o Excel.
            </DialogDescription>
          </DialogHeader>
          <ul className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            {EXPORT_COLS[tab].map(([grupo, cols]) => (
              <li key={grupo} className="border-b border-slate-100 px-3 py-1.5 text-xs text-slate-500 last:border-b-0">
                <span className="font-semibold text-slate-700">{grupo}</span> {cols}
              </li>
            ))}
          </ul>
          <p className="font-mono text-[11px] text-slate-400 break-all">{exportFilename}</p>
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-lg" onClick={() => setExportOpen(false)}>Cancelar</Button>
            <Button type="button" className="rounded-lg" onClick={exportCsv}>Baixar CSV</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
