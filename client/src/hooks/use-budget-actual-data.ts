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
import { getProportionalPlanned, isWeekendDate, type DayCounts } from "@/components/budget/actual-utils";

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

  const hasItemDivergence = useCallback((item: BudgetActual): boolean => {
    const planned = getPlannedRef(item);
    if (!planned) return false;
    return planned.totalValue !== item.totalValue;
  }, [getPlannedRef]);

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

  // `useDeferredValue` (23/09): a lista é grande e refiltrar a cada tecla
  // travava a digitação. O input continua controlado por `searchTerm`.
  const buscaAplicada = useDeferredValue(searchTerm);
  const filteredItems = useMemo(() => {
    if (!budgetActual) return [];
    let items = [...budgetActual].filter(item => item.eventId === selectedEventId);

    if (buscaAplicada) {
      const term = buscaAplicada.toLowerCase();
      items = items.filter(item => {
        const name = getCollaboratorName(item.collaboratorId).toLowerCase();
        const fn = getFunctionName(item.functionId).toLowerCase();
        return name.includes(term) || fn.includes(term);
      });
    }

    if (filterType !== "all") {
      items = items.filter(item => item.collaboratorType === filterType);
    }

    if (filterFunction !== "all") {
      items = items.filter(item => item.functionId === filterFunction);
    }

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
  }, [budgetActual, selectedEventId, buscaAplicada, filterType, filterFunction, sortBy, getCollaboratorName, getFunctionName, hasItemDivergence]);

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
  const { totalRealizado } = useMemo(() => {
    const attendedItems = filteredItems.filter(i => !isDidNotAttend(i));
    return {
      totalRealizado: attendedItems.reduce((sum, item) => sum + item.totalValue, 0),
      totalCasa: attendedItems.filter(i => i.collaboratorType === "casa").reduce((s, i) => s + i.totalValue, 0),
      totalFreela: attendedItems.filter(i => i.collaboratorType === "freela").reduce((s, i) => s + i.totalValue, 0),
    };
  }, [filteredItems, isDidNotAttend]);
  const totalPlanejado = useMemo(() => {
    return filteredItems
      // "Não participou" fica fora do planejado também — igual ao realizado acima
      .filter(item => !item.splitParentId && !isDidNotAttend(item))
      .reduce((sum, item) => {
        const planned = getPlannedRef(item);
        // Sem planejado correspondente soma 0 — usar item.totalValue inflava o planejado
        return sum + (planned ? planned.totalValue : 0);
      }, 0);
  }, [filteredItems, getPlannedRef, isDidNotAttend]);
  const { prestacaoCount, pendingCount } = useMemo(() => ({
    prestacaoCount: filteredItems.filter(item => !item.splitParentId).length,
    pendingCount: filteredItems.filter(item => !item.splitParentId && !item.sentForReview).length,
  }), [filteredItems]);
  // Itens que ainda podem ser selecionados/enviados (não travados por sentForReview)
  const pendingFiltered = useMemo(() => filteredItems.filter(i => !i.sentForReview), [filteredItems]);
  const selectableCount = pendingFiltered.length;
  // Limpa a seleção quando busca/filtro mudam — itens selecionados fora da lista
  // visível viravam "seleção fantasma" e entravam no envio em lote sem o usuário ver
  useEffect(() => {
    setSelectedCards(new Set());
  }, [searchTerm, filterType, filterFunction]);
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
    selectedCards, setSelectedCards, toggleSelect, selectAll,
    actualsPorGrupo, getPlannedRef, hasItemDivergence, getItemInclusion, getItemDayCounts, proportionalPlanned, getCardPlanned,
    filteredItems, splitGroupsMap, orderedRenderItems, isDidNotAttend,
    totalRealizado, totalPlanejado, totalDifference, prestacaoCount, pendingCount, pendingFiltered, selectableCount,
    hasAnyEditable, sentForReview, devolvedItems, getGroupOriginalPeriod,
  };
}

export type DadosDoRealizado = ReturnType<typeof useBudgetActualData>;

export default useBudgetActualData;
