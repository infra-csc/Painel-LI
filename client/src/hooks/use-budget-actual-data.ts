/**
 * Índices, derivados e FILTROS do Orçamento Realizado — 25/09 (modularização).
 *
 * Extraído de budget-actual.tsx: planejado de referência por item, escalação
 * por colaborador, grupos de divisão, divergência, "não participou", lista
 * filtrada/ordenada (pais seguidos dos filhos), totais e seleção.
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import type { BudgetActual, BudgetPlanned, Event, TeamInclusion } from "@shared/schema";
import { agruparPor, chaveComposta, indexarPorId } from "@/lib/indices";
import { contarDiasUteisEFds } from "@/lib/format";
import { getProportionalPlanned, isUnfilledItem, isWeekendDate, type DayCounts } from "@/components/budget/actual-utils";

/**
 * Situação da prestação (redesenho 08/10) — só exibição, na MESMA ordem de
 * prioridade do selo do card: decisão do RH primeiro (aprovada, devolvida ou
 * recusada), depois "em revisão" (enviada), e entre as não enviadas, as que
 * nunca foram salvas ("a preencher") e as já salvas ("salvas").
 */
export type SituacaoDoRealizado = "todas" | "preencher" | "salvas" | "revisao" | "devolvidas" | "aprovadas";
export type SituacaoDaPrestacao = Exclude<SituacaoDoRealizado, "todas">;

export function situacaoDaPrestacao(i: BudgetActual): SituacaoDaPrestacao {
  if (i.rhStatus === "aprovado") return "aprovadas";
  if (i.rhStatus === "devolvido" || i.rhStatus === "rejeitado") return "devolvidas";
  if (i.sentForReview) return "revisao";
  return isUnfilledItem(i) ? "preencher" : "salvas";
}

/** Somas de uma lista de prestações — as MESMAS regras de antes (só reunidas
 *  numa função para valerem igual no recorte e no evento inteiro). */
function somarTotais(items: BudgetActual[], isDidNotAttend: (i: BudgetActual) => boolean, getPlannedRef: (i: BudgetActual) => BudgetPlanned | undefined) {
  const attendedItems = items.filter(i => !isDidNotAttend(i));
  return {
    totalRealizado: attendedItems.reduce((sum, item) => sum + item.totalValue, 0),
    totalCasa: attendedItems.filter(i => i.collaboratorType === "casa").reduce((s, i) => s + i.totalValue, 0),
    totalFreela: attendedItems.filter(i => i.collaboratorType === "freela").reduce((s, i) => s + i.totalValue, 0),
    totalPlanejado: items
      // "Não participou" fica fora do planejado também — igual ao realizado acima
      .filter(item => !item.splitParentId && !isDidNotAttend(item))
      // Sem planejado correspondente soma 0 — usar item.totalValue inflava o planejado
      .reduce((sum, item) => { const planned = getPlannedRef(item); return sum + (planned ? planned.totalValue : 0); }, 0),
    prestacaoCount: items.filter(item => !item.splitParentId).length,
    pendingCount: items.filter(item => !item.splitParentId && !item.sentForReview).length,
  };
}

export interface EntradaDosDadosDoRealizado {
  selectedEventId: string;
  budgetActual: BudgetActual[] | undefined;
  budgetPlanned: BudgetPlanned[] | undefined;
  teamInclusions: TeamInclusion[] | undefined;
  selectedEvent: Event | undefined;
  getCollaboratorName: (id?: string | null) => string;
  getFunctionName: (id?: string | null) => string;
}

export function useBudgetActualData(e: EntradaDosDadosDoRealizado) {
  const { selectedEventId, budgetActual, budgetPlanned, teamInclusions, selectedEvent, getCollaboratorName, getFunctionName } = e;

  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<string>("adjusted");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterFunction, setFilterFunction] = useState<string>("all");
  const [situacao, setSituacao] = useState<SituacaoDoRealizado>("todas");
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());

  // Índices O(1) (23/09): os `.find` abaixo rodavam por card e por dia do modal.
  // Primeiro registro vence — mesma semântica do Array.find.
  const plannedById = useMemo(() => indexarPorId(budgetPlanned), [budgetPlanned]);
  const plannedPorColabFuncEvento = useMemo(
    () => agruparPor(budgetPlanned, p => chaveComposta(p.collaboratorId, p.functionId, p.eventId)),
    [budgetPlanned],
  );
  const plannedPorColabEvento = useMemo(
    () => agruparPor(budgetPlanned, p => chaveComposta(p.collaboratorId, p.eventId)),
    [budgetPlanned],
  );
  // Escalação por colaborador+evento (primeira vence, como o `.find` antigo)
  const inclusaoPorColabEvento = useMemo(
    () => agruparPor(teamInclusions, ti => chaveComposta(ti.collaboratorId, ti.eventId)),
    [teamInclusions],
  );
  // Grupo de uma divisão de vaga: pai + filhos, indexado pelo id do pai
  const actualsPorGrupo = useMemo(
    () => agruparPor(budgetActual, a => a.splitParentId || a.id),
    [budgetActual],
  );

  const getPlannedRef = useCallback((item: BudgetActual): BudgetPlanned | undefined => {
    if (!budgetPlanned) return undefined;
    if (item.plannedId) {
      const byId = plannedById.get(item.plannedId);
      if (byId) return byId;
    }
    if (item.collaboratorId && item.functionId) {
      return plannedPorColabFuncEvento.get(chaveComposta(item.collaboratorId, item.functionId, item.eventId))?.[0];
    }
    if (item.collaboratorId) {
      return plannedPorColabEvento.get(chaveComposta(item.collaboratorId, item.eventId))?.[0];
    }
    return undefined;
  }, [budgetPlanned, plannedById, plannedPorColabFuncEvento, plannedPorColabEvento]);

  const getItemInclusion = useCallback((item: BudgetActual): TeamInclusion | undefined => {
    if (!item.collaboratorId) return undefined;
    return inclusaoPorColabEvento.get(chaveComposta(item.collaboratorId, item.eventId))?.[0];
  }, [inclusaoPorColabEvento]);

  const getItemDayCounts = useCallback((item: BudgetActual): DayCounts => {
    // When workedDays is set (after a split), derive counts from it for accuracy
    const wd = item.workedDays;
    if (wd && wd.length > 0) {
      const weekdays = wd.filter(d => !isWeekendDate(d)).length;
      const weekends = wd.filter(d => isWeekendDate(d)).length;
      const sorted = [...wd].sort();
      return { weekdays, weekends, startDate: sorted[0] || null, endDate: sorted[sorted.length - 1] || null };
    }
    const inclusion = getItemInclusion(item);
    if (inclusion?.scheduleStartDate && inclusion?.scheduleEndDate) {
      const counts = contarDiasUteisEFds(inclusion.scheduleStartDate, inclusion.scheduleEndDate);
      return { ...counts, startDate: inclusion.scheduleStartDate, endDate: inclusion.scheduleEndDate };
    }
    if (selectedEvent?.startDate && selectedEvent?.endDate) {
      const counts = contarDiasUteisEFds(selectedEvent.startDate, selectedEvent.endDate);
      return { ...counts, startDate: selectedEvent.startDate, endDate: selectedEvent.endDate };
    }
    return { weekdays: 0, weekends: 0, startDate: null, endDate: null };
  }, [getItemInclusion, selectedEvent?.startDate, selectedEvent?.endDate]);

  // Rateio proporcional do planejado para itens de uma escalação dividida (ver actual-utils).
  const proportionalPlanned = useCallback((item: BudgetActual, rawPlan: BudgetPlanned): BudgetPlanned => {
    const parentId = item.splitParentId || item.id;
    return getProportionalPlanned(item, rawPlan, actualsPorGrupo.get(parentId) || [], getFunctionName);
  }, [actualsPorGrupo, getFunctionName]);

  // Planejado de referência de um card: filho de divisão usa o do pai, e
  // itens em grupo recebem o rateio proporcional aos dias.
  const getCardPlanned = useCallback((item: BudgetActual, opts: { isGParent?: boolean; isGChild?: boolean }): BudgetPlanned | undefined => {
    let rawPlan: BudgetPlanned | undefined;
    if (opts.isGChild) {
      const parentItem = budgetActual?.find(a => a.id === item.splitParentId);
      rawPlan = parentItem ? getPlannedRef(parentItem) : undefined;
    } else {
      rawPlan = getPlannedRef(item);
    }
    if (!rawPlan) return undefined;
    if (!opts.isGParent && !opts.isGChild) return rawPlan;
    return proportionalPlanned(item, rawPlan);
  }, [budgetActual, getPlannedRef, proportionalPlanned]);

  // O planejado de UMA prestação — o cartão e o modal usam este mesmo cálculo
  // (08/10: o titular de uma divisão mostrava o proporcional no cartão e o
  // cheio no modal). Titular e filhos de divisão recebem o rateio pelos dias;
  // quem é titular sai do grupo INTEIRO, não do recorte filtrado da lista.
  const getPlannedDaPrestacao = useCallback((item: BudgetActual): BudgetPlanned | undefined => {
    const isGChild = !!item.splitParentId;
    const isGParent = !isGChild && (actualsPorGrupo.get(item.id)?.length ?? 0) > 1;
    return getCardPlanned(item, { isGParent, isGChild });
  }, [actualsPorGrupo, getCardPlanned]);

  // Divergência contra o MESMO planejado que o cartão mostra (08/10: o
  // titular de divisão era comparado com o planejado CHEIO e ficava sempre
  // marcado, mesmo batendo com o proporcional exibido).
  const hasItemDivergence = useCallback((item: BudgetActual): boolean => {
    const planned = getPlannedDaPrestacao(item);
    if (!planned) return false;
    return planned.totalValue !== item.totalValue;
  }, [getPlannedDaPrestacao]);

  // `useDeferredValue` (23/09): a lista é grande e refiltrar a cada tecla
  // travava a digitação. O input continua controlado por `searchTerm`.
  const buscaAplicada = useDeferredValue(searchTerm);
  // Prestações do evento, sem filtro nenhum (base do resumo do evento).
  const eventItems = useMemo(
    () => (budgetActual || []).filter(item => item.eventId === selectedEventId),
    [budgetActual, selectedEventId],
  );
  // Cada dimensão do filtro como predicado — para a fila e o filtro de função
  // contarem "quantas sobram se eu escolher isto" sem a própria dimensão.
  const passaBusca = useCallback((item: BudgetActual) => {
    if (!buscaAplicada) return true;
    const term = buscaAplicada.toLowerCase();
    const name = getCollaboratorName(item.collaboratorId).toLowerCase();
    const fn = getFunctionName(item.functionId).toLowerCase();
    return name.includes(term) || fn.includes(term);
  }, [buscaAplicada, getCollaboratorName, getFunctionName]);
  const passaTipo = useCallback((item: BudgetActual) => filterType === "all" || item.collaboratorType === filterType, [filterType]);
  const passaFuncao = useCallback((item: BudgetActual) => filterFunction === "all" || item.functionId === filterFunction, [filterFunction]);
  const passaSituacao = useCallback((item: BudgetActual) => situacao === "todas" || situacaoDaPrestacao(item) === situacao, [situacao]);

  const filteredItems = useMemo(() => {
    if (!budgetActual) return [];
    const items = eventItems.filter(item => passaBusca(item) && passaTipo(item) && passaFuncao(item) && passaSituacao(item));

    if (sortBy === "adjusted") {
      items.sort((a, b) => {
        const aDiverges = hasItemDivergence(a) ? 1 : 0;
        const bDiverges = hasItemDivergence(b) ? 1 : 0;
        if (aDiverges !== bDiverges) return bDiverges - aDiverges;
        return b.totalValue - a.totalValue;
      });
    } else if (sortBy === "value") {
      items.sort((a, b) => b.totalValue - a.totalValue);
    } else if (sortBy === "name") {
      items.sort((a, b) => getCollaboratorName(a.collaboratorId).localeCompare(getCollaboratorName(b.collaboratorId)));
    }

    return items;
  }, [budgetActual, eventItems, passaBusca, passaTipo, passaFuncao, passaSituacao, sortBy, getCollaboratorName, hasItemDivergence]);

  // Fila de situações: quantas e quanto em cada uma, respeitando a busca, o
  // tipo e a função de agora (a situação escolhida não esconde as outras).
  const { contagemPorSituacao, valorPorSituacao, recusadasNaFila } = useMemo(() => {
    const c: Record<SituacaoDaPrestacao, number> = { preencher: 0, salvas: 0, revisao: 0, devolvidas: 0, aprovadas: 0 };
    const v: Record<SituacaoDaPrestacao, number> = { preencher: 0, salvas: 0, revisao: 0, devolvidas: 0, aprovadas: 0 };
    let r = 0; // recusadas (contam junto das devolvidas)
    eventItems.forEach(i => {
      if (!passaBusca(i) || !passaTipo(i) || !passaFuncao(i)) return;
      const s = situacaoDaPrestacao(i);
      c[s]++; v[s] += i.totalValue;
      if (i.rhStatus === "rejeitado") r++;
    });
    return { contagemPorSituacao: c, valorPorSituacao: v, recusadasNaFila: r };
  }, [eventItems, passaBusca, passaTipo, passaFuncao]);

  // Funções que existem nas prestações do evento, com quantas sobram ao escolher cada uma.
  const opcoesDeFuncao = useMemo(() => {
    const n = new Map<string, number>();
    eventItems.forEach(i => {
      if (!i.functionId) return;
      if (!n.has(i.functionId)) n.set(i.functionId, 0);
      if (passaBusca(i) && passaTipo(i) && passaSituacao(i)) n.set(i.functionId, (n.get(i.functionId) ?? 0) + 1);
    });
    return Array.from(n.entries())
      .map(([id, qtd]) => ({ id, nome: getFunctionName(id), n: qtd }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
  }, [eventItems, passaBusca, passaTipo, passaSituacao, getFunctionName]);

  const algumFiltro = !!searchTerm || filterType !== "all" || filterFunction !== "all" || situacao !== "todas";
  const limparFiltros = useCallback(() => {
    setSearchTerm(""); setFilterType("all"); setFilterFunction("all"); setSituacao("todas");
  }, []);

  // ── Split group computation ─────────────────────────────────────────────
  // Map from parentId → list of split children in the filtered set
  const splitGroupsMap = useMemo(() => {
    const map = new Map<string, BudgetActual[]>();
    for (const item of filteredItems) {
      if (item.splitParentId) {
        const arr = map.get(item.splitParentId) || [];
        arr.push(item);
        map.set(item.splitParentId, arr);
      }
    }
    return map;
  }, [filteredItems]);

  // Ordered render list: parents first, children follow immediately after their parent; standalone items unchanged
  const orderedRenderItems = useMemo(() => {
    const result: BudgetActual[] = [];
    const childrenSeen = new Set<string>();
    for (const item of filteredItems) {
      if (item.splitParentId) continue; // will be inserted after parent
      result.push(item);
      const children = splitGroupsMap.get(item.id) || [];
      for (const child of children) {
        result.push(child);
        childrenSeen.add(child.id);
      }
    }
    // Orphaned children (whose parent isn't in filteredItems) rendered at end
    for (const item of filteredItems) {
      if (item.splitParentId && !childrenSeen.has(item.id)) result.push(item);
    }
    return result;
  }, [filteredItems, splitGroupsMap]);

  // Itens marcados como "não participou" são excluídos das somas do banner (o Comparativo também os zera)
  const isDidNotAttend = useCallback((item: BudgetActual): boolean =>
    !!item.didNotAttend || !!getPlannedRef(item)?.didNotAttend, [getPlannedRef]);
  // Somas do RECORTE (filtros de agora) — as de sempre — e do EVENTO inteiro
  // (o painel de resumo, que não muda com a busca, como no Planejado).
  const totaisDoRecorte = useMemo(() => somarTotais(filteredItems, isDidNotAttend, getPlannedRef), [filteredItems, isDidNotAttend, getPlannedRef]);
  const totaisDoEvento = useMemo(() => somarTotais(eventItems, isDidNotAttend, getPlannedRef), [eventItems, isDidNotAttend, getPlannedRef]);
  const { totalRealizado, totalPlanejado, prestacaoCount, pendingCount } = totaisDoRecorte;
  // Itens que ainda podem ser selecionados/enviados (não travados por sentForReview)
  const pendingFiltered = useMemo(() => filteredItems.filter(i => !i.sentForReview), [filteredItems]);
  const selectableCount = pendingFiltered.length;
  // Limpa a seleção quando busca/filtro mudam — itens selecionados fora da lista
  // visível viravam "seleção fantasma" e entravam no envio em lote sem o usuário ver
  useEffect(() => {
    setSelectedCards(new Set());
  }, [searchTerm, filterType, filterFunction, situacao]);
  const totalDifference = totalRealizado - totalPlanejado;
  const hasAnyEditable = useMemo(() => {
    if (!budgetActual) return true;
    const eventItems = budgetActual.filter(a => a.eventId === selectedEventId);
    return eventItems.some(item => !item.sentForReview);
  }, [budgetActual, selectedEventId]);
  const sentForReview = useMemo(() => {
    if (!budgetActual || budgetActual.length === 0) return false;
    return budgetActual.every(a => a.sentForReview);
  }, [budgetActual]);
  // Itens efetivamente devolvidos pelo RH — o banner deriva daqui, não do status
  // agregado do comparativo (que fica stale quando a devolução é por item)
  const devolvedItems = useMemo(
    () => (budgetActual || []).filter(i => i.eventId === selectedEventId && i.rhStatus === "devolvido"),
    [budgetActual, selectedEventId]
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedCards(prev => {
      const s = new Set(Array.from(prev));
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }, []);

  const selectAll = () => {
    // Só itens ainda não enviados têm checkbox — itens travados ficam fora da seleção em lote
    const selectable = filteredItems.filter(i => !i.sentForReview);
    if (selectable.length > 0 && selectedCards.size === selectable.length) {
      setSelectedCards(new Set());
    } else {
      setSelectedCards(new Set(selectable.map(i => i.id)));
    }
  };

  const getGroupOriginalPeriod = (parentItem: BudgetActual, fmt: (d: string) => string) => {
    const inclusion = getItemInclusion(parentItem);
    const start = inclusion?.scheduleStartDate || selectedEvent?.startDate;
    const end = inclusion?.scheduleEndDate || selectedEvent?.endDate;
    if (!start || !end) return null;
    return `${fmt(start)} a ${fmt(end)}`;
  };

  return {
    searchTerm, setSearchTerm, sortBy, setSortBy, filterType, setFilterType, filterFunction, setFilterFunction, buscaAplicada,
    situacao, setSituacao, contagemPorSituacao, valorPorSituacao, recusadasNaFila, opcoesDeFuncao, algumFiltro, limparFiltros,
    eventItems, totaisDoRecorte, totaisDoEvento,
    selectedCards, setSelectedCards, toggleSelect, selectAll,
    actualsPorGrupo, getPlannedRef, hasItemDivergence, getItemInclusion, getItemDayCounts, proportionalPlanned, getCardPlanned, getPlannedDaPrestacao,
    filteredItems, splitGroupsMap, orderedRenderItems, isDidNotAttend,
    totalRealizado, totalPlanejado, totalDifference, prestacaoCount, pendingCount, pendingFiltered, selectableCount,
    hasAnyEditable, sentForReview, devolvedItems, getGroupOriginalPeriod,
  };
}

export type DadosDoRealizado = ReturnType<typeof useBudgetActualData>;

export default useBudgetActualData;
