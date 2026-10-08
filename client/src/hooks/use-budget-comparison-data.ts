/**
 * Dados derivados do COMPARATIVO — 25/09 (modularização).
 *
 * Extraído de budget-comparison.tsx: base do comparativo (itens enviados ou
 * decididos pelo RH, com filhos de divisão agrupados no pai), filtros/chips de
 * status, ordenação, totais, seleção por id e expansão por id.
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import type { BudgetActual, BudgetComparison, BudgetPlanned, TeamInclusion } from "@shared/schema";
import { agruparPor, chaveComposta } from "@/lib/indices";
import type { ComparisonRow, StatusFilterKey } from "@/components/budget/comparison-utils";
import { isCasaType } from "@/components/budget/types";
import { totaisDoGrupoNoComparativo } from "@shared/comparativo";

export interface EntradaDosDadosDoComparativo {
  budgetPlanned: BudgetPlanned[] | undefined;
  budgetActual: BudgetActual[] | undefined;
  comparison: BudgetComparison | null | undefined;
  allTeamInclusions: TeamInclusion[];
  getCollaboratorName: (id?: string | null) => string;
  /** Busca também pelo nome da função (redesenho 08/10, como no Realizado). */
  getFunctionName?: (id?: string | null) => string;
}

/** Situação de uma linha do comparativo (a base são as enviadas ou já decididas). */
export function situacaoDaLinha(r: ComparisonRow): StatusFilterKey {
  const st = r.actual.rhStatus || "pendente";
  if (st === "aprovado" || st === "rejeitado" || st === "devolvido") return st;
  return "para_analise";
}

export function useBudgetComparisonData(e: EntradaDosDadosDoComparativo) {
  const { budgetPlanned, budgetActual, comparison, allTeamInclusions, getCollaboratorName, getFunctionName } = e;

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
      // "Não participou" no Planejado OU no Realizado (o critério do Realizado,
      // em @shared/comparativo): fica fora do realizado, do planejado e da
      // diferença. Antes só o Planejado contava — marcado só no Realizado, a
      // pessoa aparecia com "economia" negativa e o planejado entrava no total.
      // Divisão: o total do grupo contra o planejado cheio da vaga.
      const t = totaisDoGrupoNoComparativo(a, children, matchingPlanned);

      data.push({
        collaboratorId: a.collaboratorId,
        collaboratorType: a.collaboratorType,
        functionId: a.functionId,
        planned: matchingPlanned || null,
        actual: a,
        variance: t.variacao,
        isSplit,
        splitChildren: children,
        groupActualTotal: t.realizado,
        naoParticipou: t.naoParticipou,
        plannedNosTotais: t.planejado,
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

  // Cada dimensão do filtro como predicado (redesenho 08/10) — para a fila de
  // situações e o filtro de função contarem "quantas sobram" sem a própria
  // dimensão. As regras são as de antes; a busca passou a achar a função também.
  const passaBusca = useCallback((r: ComparisonRow) => {
    if (!buscaAplicada) return true;
    const term = buscaAplicada.toLowerCase();
    return getCollaboratorName(r.collaboratorId).toLowerCase().includes(term)
      || (!!getFunctionName && getFunctionName(r.functionId).toLowerCase().includes(term));
  }, [buscaAplicada, getCollaboratorName, getFunctionName]);
  const passaFuncao = useCallback((r: ComparisonRow) => filterFunction === "all" || r.functionId === filterFunction, [filterFunction]);
  // "local" é da casa (isCasaType, como no Planejado): antes o filtro "Casa" o deixava de fora.
  const passaTipo = useCallback((r: ComparisonRow) => filterType === "all" || (filterType === "casa" ? isCasaType(r.collaboratorType) : r.collaboratorType === filterType), [filterType]);
  const passaStatus = useCallback((r: ComparisonRow) => {
    if (!statusFilter) return true;
    const st = r.actual.rhStatus || "pendente";
    if (statusFilter === "para_analise") return !!r.actual.sentForReview && st === "pendente";
    return st === statusFilter;
  }, [statusFilter]);

  const filteredData = useMemo(
    () => comparisonData.filter(r => passaBusca(r) && passaFuncao(r) && passaTipo(r) && passaStatus(r)),
    [comparisonData, passaBusca, passaFuncao, passaTipo, passaStatus],
  );

  // Fila de situações: quantas e quanto em cada uma, respeitando a busca, a
  // função e o tipo de agora (a situação escolhida não esconde as outras).
  const { contagemPorStatus, valorPorStatus } = useMemo(() => {
    const c: Record<StatusFilterKey, number> = { para_analise: 0, aprovado: 0, devolvido: 0, rejeitado: 0 };
    const v: Record<StatusFilterKey, number> = { para_analise: 0, aprovado: 0, devolvido: 0, rejeitado: 0 };
    comparisonData.forEach(r => {
      if (!passaBusca(r) || !passaFuncao(r) || !passaTipo(r)) return;
      // Mesma regra do filtro: "para análise" é a pendente ENVIADA.
      const s = situacaoDaLinha(r);
      if (s === "para_analise" && !r.actual.sentForReview) return;
      c[s]++; v[s] += r.groupActualTotal;
    });
    return { contagemPorStatus: c, valorPorStatus: v };
  }, [comparisonData, passaBusca, passaFuncao, passaTipo]);

  // Funções que existem no comparativo, com quantas sobram ao escolher cada uma.
  const opcoesDeFuncao = useMemo(() => {
    const n = new Map<string, number>();
    comparisonData.forEach(r => {
      if (!r.functionId) return;
      if (!n.has(r.functionId)) n.set(r.functionId, 0);
      if (passaBusca(r) && passaTipo(r) && passaStatus(r)) n.set(r.functionId, (n.get(r.functionId) ?? 0) + 1);
    });
    return Array.from(n.entries())
      .map(([id, qtd]) => ({ id, nome: getFunctionName ? getFunctionName(id) : id, n: qtd }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
  }, [comparisonData, passaBusca, passaTipo, passaStatus, getFunctionName]);

  // Prestações que o responsável ainda não enviou: ficam fora da base do
  // comparativo (a mesma conta do antigo chip "não enviados").
  const naoEnviadas = useMemo(
    () => (budgetActual || []).filter(a => !a.splitParentId && !a.sentForReview && (a.rhStatus || "pendente") === "pendente").length,
    [budgetActual],
  );

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
    // "Não participou" (Planejado OU Realizado) fica fora dos DOIS lados: o
    // realizado já sai do groupActualTotal e o planejado do ausente também.
    const totalPlanned = comparisonData.reduce((s, r) => s + r.plannedNosTotais, 0);
    const totalActual = comparisonData.reduce((s, r) => s + r.groupActualTotal, 0);
    // Casa × Freela (redesenho 08/10): o mesmo realizado de grupo, separado pelo tipo.
    const casa = comparisonData.filter(r => isCasaType(r.collaboratorType));
    const freela = comparisonData.filter(r => r.collaboratorType === "freela");
    return {
      totalPlanned, totalActual, difference: totalActual - totalPlanned,
      totalCasa: casa.reduce((s, r) => s + r.groupActualTotal, 0),
      totalFreela: freela.reduce((s, r) => s + r.groupActualTotal, 0),
      nCasa: casa.length,
      nFreela: freela.length,
    };
  }, [comparisonData]);

  // Quanto o recorte de agora soma (contagem da lista, quando há filtro).
  const totalDoRecorte = useMemo(() => sortedData.reduce((s, r) => s + r.groupActualTotal, 0), [sortedData]);

  const toggleExpand = (id: string) => {
    setExpandedCards(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  };

  // Totais do conjunto selecionado — exibidos no rodapé de decisão e no modal de confirmação
  const selectedTotals = useMemo(() => {
    const rows = sortedData.filter(r => selectedItems.has(r.actual.id));
    // Mesma regra dos totais: o planejado de quem não participou fica fora.
    const planned = rows.reduce((s, r) => s + r.plannedNosTotais, 0);
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
    contagemPorStatus, valorPorStatus, opcoesDeFuncao, naoEnviadas, totalDoRecorte,
  };
}

export type DadosDoComparativo = ReturnType<typeof useBudgetComparisonData>;

export default useBudgetComparisonData;
