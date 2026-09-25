/**
 * Busca, filtros, ordenação e SELEÇÃO do Planejado — 25/09 (modularização).
 *
 * Extraído de budget-planned.tsx. A seleção mora aqui porque depende do
 * filtro: item selecionado e depois escondido pelo filtro sai da seleção.
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { isCasaType, type CalculatedBudget } from "@/components/budget/types";

export interface FiltrosDoPlanejado {
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  filterFunction: string;
  setFilterFunction: (v: string) => void;
  filterType: string;
  setFilterType: (v: string) => void;
  sortBy: string;
  setSortBy: (v: string) => void;
  /** Funções únicas para o filtro (nomes ordenados). */
  uniqueFunctions: string[];
  filteredBudgets: CalculatedBudget[];
  /** Visíveis que ainda podem ser selecionados (não enviados e não ausentes). */
  selectableFiltered: CalculatedBudget[];

  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  toggleCardSelection: (id: string) => void;
  toggleRowSelection: (sid: string, v: boolean) => void;
  selectAllCards: () => void;
  clearSelection: () => void;
}

export function useBudgetFilters(args: {
  calculatedBudgets: CalculatedBudget[];
  getCollaboratorName: (id?: string | null) => string;
  getFunctionName: (id?: string | null) => string;
  sentToActual: Set<string>;
  notAttendedKeys: Set<string>;
}): FiltrosDoPlanejado {
  const { calculatedBudgets, getCollaboratorName, getFunctionName, sentToActual, notAttendedKeys } = args;
  const [searchTerm, setSearchTerm] = useState("");
  const [filterFunction, setFilterFunction] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  // `useDeferredValue` (23/09): refiltrar a cada tecla travava a digitação nas
  // listas grandes. O input continua controlado por `searchTerm`. A limpeza da
  // seleção mora logo depois de `filteredBudgets` (só tira o que ficou oculto).
  const buscaAplicada = useDeferredValue(searchTerm);
  const [sortBy, setSortBy] = useState<string>("name_asc");
  // Seleção ÚNICA, compartilhada entre a Visão Geral (cards) e a Planilha
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Funções únicas para filtro
  const uniqueFunctions = useMemo(() => {
    const funcs = new Set<string>();
    calculatedBudgets.forEach(b => {
      if (b.inclusion.functionId) {
        const fname = getFunctionName(b.inclusion.functionId);
        if (fname !== "-") funcs.add(fname);
      }
    });
    return Array.from(funcs).sort();
  }, [calculatedBudgets, getFunctionName]);

  // Filtrar e ordenar budgets
  const filteredBudgets = useMemo(() => {
    let result = [...calculatedBudgets];

    // Filtro por busca
    if (buscaAplicada) {
      const term = buscaAplicada.toLowerCase();
      result = result.filter(b =>
        getCollaboratorName(b.inclusion.collaboratorId).toLowerCase().includes(term)
      );
    }

    // Filtro por função
    if (filterFunction !== "all") {
      result = result.filter(b =>
        getFunctionName(b.inclusion.functionId) === filterFunction
      );
    }

    // Filtro por tipo — 'casa' inclui 'local', como no resto da tela
    if (filterType !== "all") {
      result = result.filter(b =>
        (filterType === "casa" && isCasaType(b.collaborator?.type)) ||
        (filterType === "freela" && (b.collaborator?.type === "freela" || !b.collaborator?.type))
      );
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case "name_asc":
          return getCollaboratorName(a.inclusion.collaboratorId).localeCompare(getCollaboratorName(b.inclusion.collaboratorId));
        case "name_desc":
          return getCollaboratorName(b.inclusion.collaboratorId).localeCompare(getCollaboratorName(a.inclusion.collaboratorId));
        case "days_desc":
          return b.qtdDiarias - a.qtdDiarias;
        case "days_asc":
          return a.qtdDiarias - b.qtdDiarias;
        case "function":
          return getFunctionName(a.inclusion.functionId).localeCompare(getFunctionName(b.inclusion.functionId));
        default:
          return getCollaboratorName(a.inclusion.collaboratorId).localeCompare(getCollaboratorName(b.inclusion.collaboratorId));
      }
    });

    return result;
  }, [calculatedBudgets, buscaAplicada, filterFunction, filterType, sortBy, getCollaboratorName, getFunctionName]);

  // Seleção × filtro (23/09): antes CADA tecla na busca zerava a seleção.
  // Agora só saem da seleção os itens que o filtro escondeu — item selecionado
  // e depois oculto não segue no "Enviar Planejamento (N)" sem o usuário ver.
  useEffect(() => {
    setSelectedIds(prev => {
      if (prev.size === 0) return prev;
      const visiveis = new Set(filteredBudgets.map(b => b.inclusion.id));
      const mantidos = new Set(Array.from(prev).filter(id => visiveis.has(id)));
      return mantidos.size === prev.size ? prev : mantidos;
    });
  }, [filteredBudgets]);

  // SELECIONÁVEIS visíveis: respeitam o filtro atual e excluem enviados e
  // "não participou" — base do select-all dos cards E da planilha.
  const selectableFiltered = useMemo(
    () => filteredBudgets.filter(b =>
      !sentToActual.has(b.inclusion.id) &&
      !notAttendedKeys.has(`${b.inclusion.collaboratorId}|${b.inclusion.functionId}`)
    ),
    [filteredBudgets, sentToActual, notAttendedKeys]
  );

  const toggleCardSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const toggleRowSelection = useCallback((sid: string, v: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (v) next.add(sid); else next.delete(sid);
      return next;
    });
  }, []);

  // Seleciona todos os SELECIONÁVEIS visíveis (respeita filtros; exclui
  // enviados e "não participou") — mesma base do checkbox da planilha.
  const selectAllCards = useCallback(() => {
    setSelectedIds(new Set(selectableFiltered.map(b => b.inclusion.id)));
  }, [selectableFiltered]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return {
    searchTerm, setSearchTerm, filterFunction, setFilterFunction, filterType, setFilterType, sortBy, setSortBy,
    uniqueFunctions, filteredBudgets, selectableFiltered,
    selectedIds, setSelectedIds, toggleCardSelection, toggleRowSelection, selectAllCards, clearSelection,
  };
}

export default useBudgetFilters;
