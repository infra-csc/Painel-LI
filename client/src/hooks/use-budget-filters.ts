/**
 * Busca, filtros, ordenação e SELEÇÃO do Planejado — 25/09 (modularização).
 *
 * Extraído de budget-planned.tsx. A seleção mora aqui porque depende do
 * filtro: item selecionado e depois escondido pelo filtro sai da seleção.
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { isCasaType, type CalculatedBudget } from "@/components/budget/types";

/**
 * Recorte por situação da vaga (redesenho 08/10) — só exibição: as mesmas
 * regras que os cards e a planilha já usam para travar a linha.
 *  - `ausentes`: marcada "não participou" (vale mesmo se já tinha ido);
 *  - `enviadas`: já está no Realizado;
 *  - `pendentes`: o resto — o que ainda precisa ser enviado;
 *  - `ajustadas`: pendentes com valor editado à mão (subconjunto).
 */
export type SituacaoDoPlanejado = "todas" | "pendentes" | "ajustadas" | "enviadas" | "ausentes";

export interface FiltrosDoPlanejado {
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  filterFunction: string;
  setFilterFunction: (v: string) => void;
  filterType: string;
  setFilterType: (v: string) => void;
  sortBy: string;
  setSortBy: (v: string) => void;
  situacao: SituacaoDoPlanejado;
  setSituacao: (v: SituacaoDoPlanejado) => void;
  /** Quantas vagas cada situação tem com a busca, a função e o tipo de agora. */
  contagemPorSituacao: Record<Exclude<SituacaoDoPlanejado, "todas">, number>;
  /** Soma do total planejado (centavos) de cada situação, no mesmo recorte. */
  valorPorSituacao: Record<Exclude<SituacaoDoPlanejado, "todas">, number>;
  /** Funções com quantas vagas sobram ao escolher cada uma (os outros filtros mantidos). */
  opcoesDeFuncao: { id: string; nome: string; n: number }[];
  /** Algum filtro fora do padrão (busca, função, tipo ou situação). A ordem não conta. */
  algumFiltro: boolean;
  limparFiltros: () => void;
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
  const [situacao, setSituacao] = useState<SituacaoDoPlanejado>("todas");
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

  // Situação da vaga — a mesma régua que trava a linha nos cards e na planilha.
  const situacaoDe = useCallback((b: CalculatedBudget): "pendentes" | "enviadas" | "ausentes" => {
    if (notAttendedKeys.has(`${b.inclusion.collaboratorId}|${b.inclusion.functionId}`)) return "ausentes";
    if (sentToActual.has(b.inclusion.id)) return "enviadas";
    return "pendentes";
  }, [sentToActual, notAttendedKeys]);

  // Cada dimensão do filtro como predicado — para contar "quantas sobram se eu
  // escolher isto" sem a própria dimensão (função e situação).
  const passaBusca = useCallback((b: CalculatedBudget) => {
    if (!buscaAplicada) return true;
    return getCollaboratorName(b.inclusion.collaboratorId).toLowerCase().includes(buscaAplicada.toLowerCase());
  }, [buscaAplicada, getCollaboratorName]);
  const passaFuncao = useCallback((b: CalculatedBudget) =>
    filterFunction === "all" || getFunctionName(b.inclusion.functionId) === filterFunction,
  [filterFunction, getFunctionName]);
  // Filtro por tipo — 'casa' inclui 'local', como no resto da tela
  const passaTipo = useCallback((b: CalculatedBudget) =>
    filterType === "all" ||
    (filterType === "casa" && isCasaType(b.collaborator?.type)) ||
    (filterType === "freela" && (b.collaborator?.type === "freela" || !b.collaborator?.type)),
  [filterType]);
  const passaSituacao = useCallback((b: CalculatedBudget) => {
    if (situacao === "todas") return true;
    const s = situacaoDe(b);
    if (situacao === "ajustadas") return s === "pendentes" && b.hasOverride;
    return s === situacao;
  }, [situacao, situacaoDe]);

  const { contagemPorSituacao, valorPorSituacao } = useMemo(() => {
    const c = { pendentes: 0, ajustadas: 0, enviadas: 0, ausentes: 0 };
    const v = { pendentes: 0, ajustadas: 0, enviadas: 0, ausentes: 0 };
    calculatedBudgets.forEach(b => {
      if (!passaBusca(b) || !passaFuncao(b) || !passaTipo(b)) return;
      const s = situacaoDe(b);
      c[s]++; v[s] += b.totalFinal;
      if (s === "pendentes" && b.hasOverride) { c.ajustadas++; v.ajustadas += b.totalFinal; }
    });
    return { contagemPorSituacao: c, valorPorSituacao: v };
  }, [calculatedBudgets, passaBusca, passaFuncao, passaTipo, situacaoDe]);

  const opcoesDeFuncao = useMemo(() => {
    const n = new Map<string, number>();
    calculatedBudgets.forEach(b => {
      if (!passaBusca(b) || !passaTipo(b) || !passaSituacao(b)) return;
      const nome = getFunctionName(b.inclusion.functionId);
      n.set(nome, (n.get(nome) ?? 0) + 1);
    });
    return uniqueFunctions.map(nome => ({ id: nome, nome, n: n.get(nome) ?? 0 }));
  }, [calculatedBudgets, uniqueFunctions, passaBusca, passaTipo, passaSituacao, getFunctionName]);

  // Filtrar e ordenar budgets
  const filteredBudgets = useMemo(() => {
    const result = calculatedBudgets.filter(b => passaBusca(b) && passaFuncao(b) && passaTipo(b) && passaSituacao(b));

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
  }, [calculatedBudgets, passaBusca, passaFuncao, passaTipo, passaSituacao, sortBy, getCollaboratorName, getFunctionName]);

  const algumFiltro = !!searchTerm || filterFunction !== "all" || filterType !== "all" || situacao !== "todas";
  const limparFiltros = useCallback(() => {
    setSearchTerm(""); setFilterFunction("all"); setFilterType("all"); setSituacao("todas");
  }, []);

  // Seleção × filtro (23/09): antes CADA tecla na busca zerava a seleção.
  // Agora só saem da seleção os itens que o filtro escondeu — item selecionado
  // e depois oculto não segue no "Enviar planejamento (N)" sem o usuário ver.
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
    situacao, setSituacao, contagemPorSituacao, valorPorSituacao, opcoesDeFuncao, algumFiltro, limparFiltros,
    uniqueFunctions, filteredBudgets, selectableFiltered,
    selectedIds, setSelectedIds, toggleCardSelection, toggleRowSelection, selectAllCards, clearSelection,
  };
}

export default useBudgetFilters;
