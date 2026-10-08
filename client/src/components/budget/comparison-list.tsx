/**
 * Lista de prestações do Comparativo — 25/09 (modularização); redesenho 08/10.
 *
 * Antes: título "Detalhamento por prestação" com contador, "Expandir todos" e
 * "Selecionar todos" soltos à direita, os filtros embaixo e uma pilha de
 * cartões. Carregando/erro/vazio moravam aqui; agora são estados da PÁGINA
 * (esqueleto no formato real, erro com "Tentar novamente", vazio com saída).
 *
 * Agora é uma tabela que respira: o cabeçalho das colunas gruda abaixo da
 * barra de contexto (Colaborador · Situação · Planejado · Realizado ·
 * Diferença), cada prestação é uma linha que abre o extrato nas mesmas
 * colunas, e "selecionar as pendentes" e "expandir todas" ficam na régua de
 * cima. Na largura útil estreita (menos de 880px — tablet, celular, menu
 * aberto), o cabeçalho some e cada linha vira um cartão (só CSS, cmp-).
 */
import { ChevronsDownUp, ChevronsUpDown, SearchX } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { chaveComposta } from "@/lib/indices";
import type { ActivityLog } from "@/components/activity-timeline";
import type { BudgetActual, BudgetNote } from "@shared/schema";
import type { DadosDoComparativo } from "@/hooks/use-budget-comparison-data";
import { ComparisonCard } from "./comparison-card";
import type { SplitDetailState } from "./comparison-utils";

export interface ComparisonListProps {
  dados: DadosDoComparativo;
  selectedEventId: string;
  highlightCardId: string;
  eventNotes: BudgetNote[];
  plannedLogs: ActivityLog[];
  isRhOrAdmin: boolean;
  getCollaboratorName: (id?: string | null) => string;
  getFunctionName: (id?: string | null) => string;
  onEdit: (a: BudgetActual) => void;
  onSplitDetail: (s: SplitDetailState) => void;
}

export function ComparisonList(p: ComparisonListProps) {
  const { dados: d, selectedEventId, highlightCardId, eventNotes, plannedLogs, isRhOrAdmin, getCollaboratorName, getFunctionName, onEdit, onSplitDetail } = p;
  const { sortedData, expandedCards, setExpandedCards, selectedItems, setSelectedItems } = d;
  const allVisibleExpanded = sortedData.length > 0 && sortedData.every(r => expandedCards.has(r.actual.id));
  const selecionaveis = sortedData.filter(row => (row.actual.rhStatus || "pendente") === "pendente").map(row => row.actual.id);
  const todasMarcadas = selecionaveis.length > 0 && selecionaveis.every(id => selectedItems.has(id));

  const podeMarcar = isRhOrAdmin && selecionaveis.length > 0;
  const estadoMarcar: boolean | "indeterminate" = todasMarcadas ? true : selectedItems.size > 0 ? "indeterminate" : false;
  // Com algo marcado, o clique limpa (como o "Limpar" de antes); sem nada, marca as pendentes visíveis.
  const marcarTodas = () => setSelectedItems(todasMarcadas || selectedItems.size > 0 ? new Set() : new Set(selecionaveis));
  const botaoExpandir = (testid: string) => (
    <button
      type="button"
      className="pas-alvo inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring whitespace-nowrap"
      onClick={() => {
        // Interseção com os ids visíveis: comparar por size acumulado
        // travava o botão quando havia ids expandidos fora do filtro
        if (allVisibleExpanded) setExpandedCards(new Set());
        else setExpandedCards(new Set(sortedData.map(r => r.actual.id)));
      }}
      aria-expanded={allVisibleExpanded}
      data-testid={testid}
    >
      {allVisibleExpanded ? <ChevronsDownUp className="w-3.5 h-3.5" aria-hidden="true" /> : <ChevronsUpDown className="w-3.5 h-3.5" aria-hidden="true" />}
      {allVisibleExpanded ? "Recolher todas" : "Expandir todas"}
    </button>
  );

  const toggleSelect = (id: string, checked: boolean) => {
    const next = new Set(selectedItems);
    if (checked) next.add(id); else next.delete(id);
    setSelectedItems(next);
  };

  if (sortedData.length === 0) {
    return (
      <div className="pas-entra flex flex-col items-center text-center rounded-xl border border-border bg-card px-6 py-14" data-testid="comparativo-sem-resultado">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-muted text-muted-foreground mb-3" aria-hidden="true">
          <SearchX className="w-5 h-5" />
        </span>
        <h3 className="m-0 text-base font-semibold text-foreground">Nenhuma prestação encontrada</h3>
        <p className="m-0 mt-1.5 max-w-[440px] text-sm leading-relaxed text-muted-foreground">
          Nenhuma prestação bate com a busca, a situação e os filtros de agora. Ajuste ou limpe para ver as demais.
        </p>
        <button
          type="button"
          onClick={d.limparFiltros}
          className="mt-4 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-card text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="comparativo-limpar-filtros-vazio"
        >
          Limpar filtros
        </button>
      </div>
    );
  }

  return (
    <div className="cmp-lista">
      {/* Régua da lista (só no modo cartão — na tabela, os dois controles moram no cabeçalho). */}
      <div className="cmp-regua items-center gap-x-3 gap-y-1 mb-2 min-h-8">
        {podeMarcar && (
          <label className="inline-flex items-center gap-2.5 h-8 pl-3 pr-2 rounded-lg text-xs font-medium text-slate-600 cursor-pointer hover:text-foreground" data-testid="comparativo-selecionar-todas-cartao">
            <Checkbox checked={estadoMarcar} onCheckedChange={marcarTodas} aria-label="Selecionar todas as prestações pendentes visíveis" />
            {selectedItems.size > 0
              ? `${selectedItems.size} de ${selecionaveis.length} ${selecionaveis.length === 1 ? "pendente selecionada" : "pendentes selecionadas"}`
              : `Selecionar ${selecionaveis.length === 1 ? "a pendente" : `as ${selecionaveis.length} pendentes`}`}
          </label>
        )}
        <span className="ml-auto">{botaoExpandir("comparativo-expandir-todas-cartao")}</span>
      </div>

      <div className="cmp-tabela" role="list" aria-label="Prestações do comparativo">
        {/* Cabeçalho das colunas: gruda abaixo da barra de contexto; selecionar e expandir todas ficam nele. */}
        <div className="cmp-cabecalho">
          <span className="cmp-c-sel">
            {podeMarcar && (
              <Checkbox
                checked={estadoMarcar}
                onCheckedChange={marcarTodas}
                aria-label={`Selecionar as ${selecionaveis.length} prestações pendentes visíveis`}
                title={selectedItems.size > 0 ? "Limpar a seleção" : `Selecionar as ${selecionaveis.length} pendentes visíveis`}
                data-testid="comparativo-selecionar-todas"
              />
            )}
          </span>
          <span className="cmp-c-colab" aria-hidden="true">Colaborador</span>
          <span className="cmp-c-sit" aria-hidden="true">Situação</span>
          <span className="cmp-c-plan cmp-num" aria-hidden="true">Planejado</span>
          <span className="cmp-c-real cmp-num" aria-hidden="true">Realizado</span>
          <span className="cmp-c-dif cmp-num" aria-hidden="true">Diferença</span>
          <span className="cmp-c-acoes">{botaoExpandir("comparativo-expandir-todas")}</span>
        </div>
        {sortedData.map((row) => (
          <div role="listitem" key={row.actual.id} className="cmp-item-lista">
            <ComparisonCard
              row={row}
              isExpanded={expandedCards.has(row.actual.id)}
              isSelected={selectedItems.has(row.actual.id)}
              isHighlighted={highlightCardId === `${row.collaboratorId}-${row.functionId}`}
              cardTi={d.inclusaoPorChave.get(chaveComposta(selectedEventId, row.collaboratorId, row.functionId))?.[0]}
              eventNotes={eventNotes}
              plannedLogs={plannedLogs}
              rhComment={d.rhComment}
              isRhOrAdmin={isRhOrAdmin}
              getCollaboratorName={getCollaboratorName}
              getFunctionName={getFunctionName}
              onToggleExpand={d.toggleExpand}
              onToggleSelect={toggleSelect}
              onEdit={onEdit}
              onSplitDetail={onSplitDetail}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default ComparisonList;
