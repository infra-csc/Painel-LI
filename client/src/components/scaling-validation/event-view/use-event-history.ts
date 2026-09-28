/**
 * Dados do Histórico da escala (25/09 — extraído da página): consulta, linhas,
 * pedidos, filtros da Lista e dos Pedidos, KPIs/funil, quadro e "onde a escala
 * está travada". A linha do tempo mora em `use-event-timeline.ts`.
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Event, ScalingChangeRequest } from "@shared/schema";
import {
  SUGESTAO_STATUS, CHANGE_REQUEST_STATUS, CHANGE_REQUEST_TYPES, isSuggestionInclusion, type ChangeRequestStatus,
} from "@shared/scaling-validation-rules";
import { apiRequest } from "@/lib/queryClient";
import type { FunctionWithManagers } from "@/components/scaling-validation/types";
import { APPROVAL_QUERY_KEYS } from "@/components/scaling-approval/types";
import {
  ALL, IN_INCLUSION, ORIGIN_LABELS, ORIGIN_ORDER, aggregateByFunction, isDeleted, originKey, plural, toViewRow,
  type EventViewData, type EventViewRow, type Tab,
} from "./event-view-shared";

export interface UseEventHistoryArgs {
  eventId: string;
  sanitize: (ids: string[] | undefined) => void;
  effectiveTab: Tab;
  tab: Tab;
  setTab: (t: Tab) => void;
}

export function useEventHistory({ eventId, sanitize, effectiveTab, tab, setTab }: UseEventHistoryArgs) {
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
  /**
   * Detalhe COMPLETO de uma vaga sem sair do Histórico (28/08): os chips #id da
   * linha do tempo e da Lista abrem o mesmo drawer da Validação, em leitura —
   * é onde mora a história enriquecida (logs, de/para dos reajustes, motivos).
   */
  const [detailId, setDetailId] = useState<string | null>(null);

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

  const showData = !viewQuery.isLoading && !viewQuery.error && (rows.length > 0 || requests.length > 0);

  return {
    // filtros
    search, setSearch, deferredSearch, originFilter, setOriginFilter, functionFilter, setFunctionFilter,
    requestTypeFilter, setRequestTypeFilter, requestStatusFilter, setRequestStatusFilter,
    detailId, setDetailId, detailRow,
    // dados
    events, loadingEvents, functions, loadingFunctions, activeEvents, selectedEvent, functionNameById,
    viewQuery, truncated, eventsInView, eventById, rows, eventNameByRowId, eventNameOf, rowById, idByNumber,
    liveRows, deletedCount, requests, requestTypesInView, requestStatusesInView, functionsInEvent, originsInEvent, filteredRows,
    counts, kpiWouldClear, onKpiClick, funnel,
    filteredRequests, reqHasFilters, clearReqFilters, listHasFilters, clearListFilters,
    stalled, boardRowsAll, boardLegend, boardFilter, boardRows, boardLines, showData,
  };
}

export type EventHistory = ReturnType<typeof useEventHistory>;
export type RequestRow = ScalingChangeRequest;
