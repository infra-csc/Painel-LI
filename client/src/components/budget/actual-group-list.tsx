/**
 * Lista de prestações do Realizado com GRUPOS de divisão — 25/09
 * (modularização); redesenho 08/10.
 *
 * A grade é a do Planejado: 1, 2 ou 3 colunas pela LARGURA ÚTIL (o menu
 * lateral muda o espaço sem mudar a janela), com o "selecionar os pendentes
 * visíveis" no cabeçalho. Uma escalação dividida ocupa a fileira inteira:
 * um quadro discreto com o período original, os cards do titular e de cada
 * divisão lado a lado e, no rodapé, o total do grupo contra o planejado.
 * Filho órfão (pai filtrado/apagado) mantém o contexto de divisão.
 */
import { GitFork, SearchX } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useLarguraUtil } from "@/components/common/use-largura-util";
import type { ActivityLog } from "@/components/activity-timeline";
import type { BudgetActual, BudgetNote } from "@shared/schema";
import type { DadosDoRealizado } from "@/hooks/use-budget-actual-data";
import { cn } from "@/lib/utils";
import { ActualCard } from "./actual-card";
import { diferencaComSinal } from "./actual-overview";
import { fmtDiaMes, type ModalActualTab } from "./actual-utils";
import { formatCurrency } from "./types";

export interface ActualGroupListProps {
  dados: DadosDoRealizado;
  getCollaboratorName: (id?: string | null) => string;
  getFunctionName: (id?: string | null) => string;
  eventNotes: BudgetNote[];
  plannedLogs: ActivityLog[];
  collapsedCards: Set<string>;
  highlightCardId: string;
  isRhOrAdmin: boolean;
  splitPending: boolean;
  onToggleCollapse: (id: string) => void;
  onEdit: (item: BudgetActual, tab?: ModalActualTab) => void;
  onSplit: (item: BudgetActual) => void;
  onDelete: (id: string) => void;
  onClearFilters: () => void;
}

/** Colunas pela largura útil da lista: 1 (< 640), 2, 3 (≥ 1380) — as do Planejado. */
const colunasPara = (largura: number | null) => (largura === null ? 2 : largura >= 1380 ? 3 : largura >= 640 ? 2 : 1);
const GRADE: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3" };

export function ActualGroupList(p: ActualGroupListProps) {
  const { dados, getCollaboratorName, getFunctionName, eventNotes, plannedLogs, collapsedCards, highlightCardId, isRhOrAdmin, splitPending, onToggleCollapse, onEdit, onSplit, onDelete, onClearFilters } = p;
  const { orderedRenderItems, splitGroupsMap, filteredItems, getPlannedRef, hasItemDivergence, getItemDayCounts, getPlannedDaPrestacao, isDidNotAttend, selectedCards, toggleSelect, getGroupOriginalPeriod } = dados;
  const { ref: refLargura, largura } = useLarguraUtil<HTMLDivElement>();
  const colunas = colunasPara(largura);

  const renderSingleCard = (cardItem: BudgetActual, { isGParent = false, isGChild = false }: { isGParent?: boolean; isGChild?: boolean } = {}) => (
    <ActualCard
      key={cardItem.id}
      cardItem={cardItem}
      isGParent={isGParent}
      isGChild={isGChild}
      collabName={getCollaboratorName(cardItem.collaboratorId)}
      functionName={getFunctionName(cardItem.functionId)}
      cardDays={getItemDayCounts(cardItem)}
      // Planejado da prestação: o MESMO cálculo do modal (rateio proporcional
      // aos dias para titular e filhos de divisão, decidido pelo grupo inteiro)
      cardPlanned={getPlannedDaPrestacao(cardItem)}
      diverges={isGChild ? false : hasItemDivergence(cardItem)}
      // "Não participou": fica fora dos totais do resumo — o card sinaliza isso visualmente
      notAttended={isDidNotAttend(cardItem)}
      isCollapsed={collapsedCards.has(cardItem.id)}
      isSelected={selectedCards.has(cardItem.id)}
      isHighlighted={highlightCardId === cardItem.id}
      eventNotes={eventNotes}
      plannedLogs={plannedLogs}
      isRhOrAdmin={isRhOrAdmin}
      splitPending={splitPending}
      onToggleSelect={toggleSelect}
      onToggleCollapse={onToggleCollapse}
      onEdit={onEdit}
      onSplit={onSplit}
      onDelete={onDelete}
    />
  );

  // A medição da largura precisa do MESMO elemento em todos os estados.
  if (orderedRenderItems.length === 0) {
    return (
      <div ref={refLargura} className="min-w-0">
        <div className="pas-entra flex flex-col items-center text-center rounded-xl border border-border bg-card px-6 py-14" data-testid="realizado-sem-resultado">
          <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-muted text-muted-foreground mb-3" aria-hidden="true">
            <SearchX className="w-5 h-5" />
          </span>
          <h3 className="m-0 text-base font-semibold text-foreground">Nenhuma prestação encontrada</h3>
          <p className="m-0 mt-1.5 max-w-[440px] text-sm leading-relaxed text-muted-foreground">
            Nenhuma prestação bate com a busca, a situação e os filtros de agora. Ajuste ou limpe para ver as demais.
          </p>
          <button
            type="button"
            onClick={onClearFilters}
            className="mt-4 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-card text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="realizado-limpar-filtros-vazio"
          >
            Limpar filtros
          </button>
        </div>
      </div>
    );
  }

  const selecionaveis = dados.selectableCount;
  const todasMarcadas = selecionaveis > 0 && selectedCards.size === selecionaveis;

  return (
    <div ref={refLargura} className="min-w-0">
      {/* Cabeçalho da lista: selecionar as pendentes (não enviadas) visíveis. */}
      {dados.hasAnyEditable && selecionaveis > 0 && (
        <label className="pla-selecionar-todos inline-flex items-center gap-2.5 h-8 mb-2 pl-4 pr-2 rounded-lg text-xs font-medium text-slate-600 cursor-pointer hover:text-foreground">
          <Checkbox
            checked={todasMarcadas ? true : selectedCards.size > 0 ? "indeterminate" : false}
            onCheckedChange={() => dados.selectAll()}
            aria-label="Selecionar todas as prestações pendentes visíveis"
          />
          {todasMarcadas
            ? `${selecionaveis} ${selecionaveis === 1 ? "pendente selecionada" : "pendentes selecionadas"}`
            : `Selecionar ${selecionaveis === 1 ? "a pendente visível" : `as ${selecionaveis} pendentes visíveis`}`}
        </label>
      )}

      <div className={cn("grid grid-flow-row-dense gap-3 items-stretch", GRADE[colunas])}>
        {orderedRenderItems.map((item) => {
          const isGroupParent = !item.splitParentId && splitGroupsMap.has(item.id);
          const isGroupChild = !!item.splitParentId;

          if (isGroupChild) {
            // Filho cujo pai está na lista já é renderizado dentro do grupo do pai
            const parentPresent = filteredItems.some(x => !x.splitParentId && x.id === item.splitParentId);
            if (parentPresent) return null;
            // Órfão (pai filtrado/apagado): renderiza com contexto de divisão —
            // isGChild resolve o planejado proporcional via splitParentId e
            // mantém o selo "Divisão", em vez de tratá-lo como card avulso
            return renderSingleCard(item, { isGChild: true });
          }

          if (!isGroupParent) return renderSingleCard(item);

          const groupChildren = splitGroupsMap.get(item.id) || [];
          const groupTotal = item.totalValue + groupChildren.reduce((s, c) => s + c.totalValue, 0);
          const groupPlannedTotal = getPlannedRef(item)?.totalValue;
          const origPeriod = getGroupOriginalPeriod(item, fmtDiaMes);
          const dif = groupPlannedTotal !== undefined ? groupTotal - groupPlannedTotal : 0;
          return (
            <section
              key={item.id}
              aria-label={`Escalação dividida de ${getCollaboratorName(item.collaboratorId)}`}
              className="col-span-full rounded-xl border border-primary/20 bg-brand-soft/30 overflow-hidden"
            >
              <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <GitFork className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden="true" />
                <p className="m-0 flex-1 min-w-0 text-xs font-semibold text-foreground">
                  Escalação dividida
                  <span className="font-normal text-muted-foreground">
                    {" "}· {groupChildren.length + 1} colaboradores{origPeriod && <> · período original {origPeriod}</>}
                  </span>
                </p>
              </header>
              <div className={cn("grid gap-3 items-stretch px-2 pb-2", GRADE[Math.min(colunas, groupChildren.length + 1)])}>
                {renderSingleCard(item, { isGParent: true })}
                {groupChildren.map((child) => renderSingleCard(child, { isGChild: true }))}
              </div>
              {/* Total do grupo contra o planejado da escalação original. */}
              <footer className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5 border-t border-primary/15 bg-card/60">
                <span className="text-xs font-medium text-slate-600">
                  Total da escalação
                  {groupPlannedTotal !== undefined && (
                    <span className="font-normal text-muted-foreground tabular-nums"> · planejado {formatCurrency(groupPlannedTotal)}</span>
                  )}
                </span>
                <span className="flex items-baseline gap-2">
                  {groupPlannedTotal !== undefined && Math.abs(dif) > 1 && (
                    <span className={cn("text-xs font-semibold tabular-nums", dif > 0 ? "text-danger" : "text-success")}>{diferencaComSinal(dif)}</span>
                  )}
                  <span className="text-base font-semibold tabular-nums text-primary">{formatCurrency(groupTotal)}</span>
                </span>
              </footer>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export default ActualGroupList;
