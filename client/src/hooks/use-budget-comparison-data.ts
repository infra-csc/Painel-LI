/**
 * Dados derivados do COMPARATIVO — 25/09 (modularização).
 *
 * Extraído de budget-comparison.tsx: base do comparativo (itens enviados ou
 * decididos pelo RH, com filhos de divisão agrupados no pai), filtros/chips de
 * status, ordenação, totais, seleção por id e expansão por id.
 */
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { BudgetActual, BudgetComparison, BudgetPlanned, TeamInclusion } from "@shared/schema";
import { agruparPor, chaveComposta } from "@/lib/indices";
import type { ComparisonRow, StatusFilterKey } from "@/components/budget/comparison-utils";

export interface EntradaDosDadosDoComparativo {
  budgetPlanned: BudgetPlanned[] | undefined;
  budgetActual: BudgetActual[] | undefined;
  comparison: BudgetComparison | null | undefined;
  allTeamInclusions: TeamInclusion[];
  getCollaboratorName: (id?: string | null) => string;
}

export function useBudgetComparisonData(e: EntradaDosDadosDoComparativo) {
  const { budgetPlanned, budgetActual, comparison, allTeamInclusions, getCollaboratorName } = e;

  // Expansão por id do BudgetActual (não por índice): mudar a ordenação com cards
  // abertos expandia outros cards — mesma correção já aplicada na seleção abaixo
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<"difference" | "total">("difference");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterFunction, setFilterFunction] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  // Filtro por status via chips do topo (toggle) — null = sem filtro.
  // "Não enviado" não é filtrável: esses itens não entram na base do comparativo.
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey | null>(null);
  // Seleção por id do BudgetActual (não por índice): filtrar/ordenar deslocava os índices
  // e o RH acabava aprovando itens errados
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // Escalação por evento+colaborador+função (primeira vence, como o `.find` antigo)
  const inclusaoPorChave = useMemo(
    () => agruparPor(allTeamInclusions, t => chaveComposta(t.eventId, t.collaboratorId, t.functionId)),
    [allTeamInclusions],
  );

  const comparisonData = useMemo((): ComparisonRow[] => {
    if (!budgetPlanned || !budgetActual) return [];
    // Base do comparativo: itens enviados OU já decididos pelo RH. O servidor zera
    // sentForReview ao devolver/recusar — sem o segundo critério, devolvidos e
    // recusados sumiam da lista do RH.
    const sentActual = budgetActual.filter(a =>
      a.sentForReview || ["aprovado", "devolvido", "rejeitado"].includes(a.rhStatus || "")
    );

    // Build map: parentId → split children (regardless of sentForReview on children)
    const splitChildrenMap = new Map<string, BudgetActual[]>();
    budgetActual.forEach(a => {
      if (a.splitParentId) {
        const arr = splitChildrenMap.get(a.splitParentId) || [];
        arr.push(a);
        splitChildrenMap.set(a.splitParentId, arr);
      }
    });

    const data: ComparisonRow[] = [];

    // Only process non-child items (parents and standalone items)
    sentActual.filter(a => !a.splitParentId).forEach(a => {
      const matchingPlanned = a.plannedId
        ? budgetPlanned.find(p => p.id === a.plannedId)
        : budgetPlanned.find(p => p.collaboratorId === a.collaboratorId && p.functionId === a.functionId && p.eventId === a.eventId);

      const children = splitChildrenMap.get(a.id) || [];
      const isSplit = children.length > 0;
      // If the planned record is marked as not attended, their values are excluded from totals
      const isNotAttendedPlanned = !!matchingPlanned?.didNotAttend;
      const groupActualTotal = isNotAttendedPlanned ? 0 : (a.totalValue + children.reduce((s, c) => s + c.totalValue, 0));

      data.push({
        collaboratorId: a.collaboratorId,
        collaboratorType: a.collaboratorType,
        functionId: a.functionId,
        planned: matchingPlanned || null,
        actual: a,
        // For split groups: variance is based on the group total vs original full planned; 0 if not attended
        variance: isNotAttendedPlanned ? 0 : (matchingPlanned ? (groupActualTotal - matchingPlanned.totalValue) : groupActualTotal),
        isSplit,
        splitChildren: children,
        groupActualTotal,
      });
    });
    return data;
  }, [budgetPlanned, budgetActual]);

  // Limpa a seleção quando busca/filtro mudam — itens selecionados podem sair da
  // lista visível. Ordenar não muda a visibilidade, então sortBy fica de fora.
  // `useDeferredValue` (23/09): refiltrar a cada tecla travava a digitação
  // nas listas grandes. O input continua controlado por `searchTerm`.
  const buscaAplicada = useDeferredValue(searchTerm);
  useEffect(() => {
    setSelectedItems(new Set());
  }, [buscaAplicada, filterFunction, filterType, statusFilter]);

  const filteredData = useMemo(() => {
    let data = [...comparisonData];
    if (buscaAplicada) {
      const term = buscaAplicada.toLowerCase();
      data = data.filter(r => getCollaboratorName(r.collaboratorId).toLowerCase().includes(term));
    }
    if (filterFunction !== "all") data = data.filter(r => r.functionId === filterFunction);
    if (filterType !== "all") data = data.filter(r => r.collaboratorType === filterType);
    if (statusFilter) {
      data = data.filter(r => {
        const st = r.actual.rhStatus || "pendente";
        if (statusFilter === "para_analise") return r.actual.sentForReview && st === "pendente";
        return st === statusFilter;
      });
    }
    return data;
  }, [comparisonData, buscaAplicada, filterFunction, filterType, statusFilter, getCollaboratorName]);

  const sortedData = useMemo(() => {
    const sorted = [...filteredData];
    if (sortBy === "difference") sorted.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
    else sorted.sort((a, b) => b.groupActualTotal - a.groupActualTotal);
    return sorted;
  }, [filteredData, sortBy]);

  const usedFunctionIds = useMemo(() => {
    const ids = new Set(comparisonData.map(r => r.functionId).filter(Boolean));
    return Array.from(ids);
  }, [comparisonData]);

  const totals = useMemo(() => {
    // Always recompute from grouped data to avoid double-counting split children.
    // "Não participou" fica fora dos DOIS lados: o realizado já é zerado no
    // groupActualTotal e o planejado do ausente também não entra na soma.
    const totalPlanned = comparisonData.reduce(
      (s, r) => s + (r.planned && !r.planned.didNotAttend ? r.planned.totalValue : 0), 0);
    const totalActual = comparisonData.reduce((s, r) => s + r.groupActualTotal, 0);
    return { totalPlanned, totalActual, difference: totalActual - totalPlanned };
  }, [comparisonData]);

  const toggleExpand = (id: string) => {
    setExpandedCards(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  };

  // Totais do conjunto selecionado — exibidos no rodapé de decisão e no modal de confirmação
  const selectedTotals = useMemo(() => {
    const rows = sortedData.filter(r => selectedItems.has(r.actual.id));
    const planned = rows.reduce((s, r) => s + (r.planned?.totalValue || 0), 0);
    const actual = rows.reduce((s, r) => s + r.groupActualTotal, 0);
    return { planned, actual, diff: actual - planned };
  }, [sortedData, selectedItems]);

  const rhComment = comparison?.approvalObservation || comparison?.rejectionReason || comparison?.returnReason;

  // Fechamento do comparativo: só faz sentido quando todas as prestações do
  // evento já foram aprovadas item a item (mesmo critério do passo 4 do stepper).
  const allItemsApproved = useMemo(() => {
    const items = budgetActual || [];
    return items.length > 0 && items.every(i => i.rhStatus === "aprovado");
  }, [budgetActual]);

  // O Realizado mudou DEPOIS da aprovação? O crédito do Flash é uma fotografia
  // do Realizado no momento em que o comparativo foi aprovado; como o RH pode
  // editar valores depois (aqui mesmo, no lápis do card), a foto envelhece.
  // Comparamos `budget_actual.updatedAt` com `comparison.approvedAt` —
  // 1s de tolerância porque a aprovação e a última gravação podem cair no mesmo
  // segundo sem que nada tenha mudado de fato.
  const realizadoChangedAfterApproval = useMemo(() => {
    if (!comparison || comparison.status !== "aprovado" || !comparison.approvedAt) return false;
    const approvedMs = new Date(comparison.approvedAt as unknown as string).getTime();
    if (!Number.isFinite(approvedMs)) return false;
    return (budgetActual || []).some(i => {
      if (!i.updatedAt) return false;
      const ms = new Date(i.updatedAt as unknown as string).getTime();
      return Number.isFinite(ms) && ms > approvedMs + 1000;
    });
  }, [comparison, budgetActual]);

  const limparFiltros = () => { setSearchTerm(""); setFilterFunction("all"); setFilterType("all"); setStatusFilter(null); };
  const temFiltro = !!(searchTerm || filterFunction !== "all" || filterType !== "all" || statusFilter);

  return {
    expandedCards, setExpandedCards, toggleExpand,
    sortBy, setSortBy, searchTerm, setSearchTerm, filterFunction, setFilterFunction, filterType, setFilterType,
    statusFilter, setStatusFilter, selectedItems, setSelectedItems, limparFiltros, temFiltro,
    inclusaoPorChave, comparisonData, filteredData, sortedData, usedFunctionIds, totals, selectedTotals,
    rhComment, allItemsApproved, realizadoChangedAfterApproval,
  };
}

export type DadosDoComparativo = ReturnType<typeof useBudgetComparisonData>;

export default useBudgetComparisonData;
