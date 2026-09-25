/**
 * Lista de prestações do Realizado com GRUPOS de divisão — 25/09
 * (modularização). Extraída de budget-actual.tsx: pais seguidos dos filhos
 * dentro de um quadro "Escalação dividida" com total do grupo; filho órfão
 * (pai filtrado/apagado) mantém o contexto de divisão.
 */
import { GitFork, Search } from "lucide-react";
import { formatarMoeda } from "@/lib/format";
import { Button } from "@/components/ui/button";
import type { ActivityLog } from "@/components/activity-timeline";
import type { BudgetActual, BudgetNote } from "@shared/schema";
import type { DadosDoRealizado } from "@/hooks/use-budget-actual-data";
import { ActualCard } from "./actual-card";
import { fmtDiaMes, type ModalActualTab } from "./actual-utils";

const formatCurrency = formatarMoeda;

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

export function ActualGroupList(p: ActualGroupListProps) {
  const { dados, getCollaboratorName, getFunctionName, eventNotes, plannedLogs, collapsedCards, highlightCardId, isRhOrAdmin, splitPending, onToggleCollapse, onEdit, onSplit, onDelete, onClearFilters } = p;
  const { orderedRenderItems, splitGroupsMap, filteredItems, getPlannedRef, hasItemDivergence, getItemDayCounts, getCardPlanned, isDidNotAttend, selectedCards, toggleSelect, getGroupOriginalPeriod } = dados;

  const renderSingleCard = (cardItem: BudgetActual, { isGParent = false, isGChild = false }: { isGParent?: boolean; isGChild?: boolean } = {}) => (
    <ActualCard
      cardItem={cardItem}
      isGParent={isGParent}
      isGChild={isGChild}
      collabName={getCollaboratorName(cardItem.collaboratorId)}
      functionName={getFunctionName(cardItem.functionId)}
      cardDays={getItemDayCounts(cardItem)}
      // Proportional planned for split cards using real weekday/weekend counts from the group
      cardPlanned={getCardPlanned(cardItem, { isGParent, isGChild })}
      diverges={isGChild ? false : hasItemDivergence(cardItem)}
      // "Não participou": fica fora dos totais do banner — o card sinaliza isso visualmente
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

  return (
    <div className="space-y-5">
      {orderedRenderItems.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-border bg-surface-muted p-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
            <Search className="w-6 h-6 text-muted-foreground" aria-hidden="true" />
          </div>
          <p className="font-semibold text-muted-foreground">Nenhum resultado para os filtros</p>
          <p className="text-sm text-muted-foreground mt-1">Ajuste a busca ou os filtros para ver outras prestações.</p>
          <Button
            variant="ghost"
            className="mt-3 h-8 px-4 rounded-xl text-xs text-muted-foreground hover:text-slate-700 hover:bg-muted"
            onClick={onClearFilters}
          >
            Limpar filtros
          </Button>
        </div>
      )}
      {orderedRenderItems.map((item) => {
        const isGroupParent = !item.splitParentId && splitGroupsMap.has(item.id);
        const isGroupChild = !!item.splitParentId;
        const groupChildren = splitGroupsMap.get(item.id) || [];
        const groupTotal = isGroupParent
          ? item.totalValue + groupChildren.reduce((s, c) => s + c.totalValue, 0)
          : 0;
        const groupPlannedTotal = isGroupParent ? getPlannedRef(item)?.totalValue : undefined;

        if (isGroupChild) {
          // Filho cujo pai está na lista já é renderizado dentro do grupo do pai
          const parentPresent = filteredItems.some(x => !x.splitParentId && x.id === item.splitParentId);
          if (parentPresent) return null;
          // Órfão (pai filtrado/apagado): renderiza com contexto de divisão —
          // isGChild resolve o planejado proporcional via splitParentId e
          // mantém o badge "Divisão", em vez de tratá-lo como card avulso
          return <div key={item.id}>{renderSingleCard(item, { isGChild: true })}</div>;
        }

        if (!isGroupParent) {
          return <div key={item.id}>{renderSingleCard(item)}</div>;
        }

        const origPeriod = getGroupOriginalPeriod(item, fmtDiaMes);
        return (
          <div key={item.id} className="rounded-xl border-2 border-primary/25 overflow-hidden bg-brand-soft/20">
            {/* Group banner */}
            <div className="bg-primary px-4 py-2.5 flex items-center gap-3">
              <GitFork className="w-3.5 h-3.5 text-white/80 flex-shrink-0" aria-hidden="true" />
              <span className="text-xs font-semibold text-white flex-1">
                Escalação dividida · {groupChildren.length + 1} colaboradores{origPeriod && ` · Período: ${origPeriod}`}
              </span>
              <span className="text-xs font-bold text-white tabular-nums">Total: {formatCurrency(groupTotal)}</span>
            </div>
            {/* Cards */}
            <div className="p-2 space-y-0">
              {renderSingleCard(item, { isGParent: true })}
              {groupChildren.map((child) => (
                <div key={child.id}>
                  <div className="flex justify-center py-1.5">
                    <div className="border-l-2 border-dashed border-primary/40 h-4" />
                  </div>
                  {renderSingleCard(child, { isGChild: true })}
                </div>
              ))}
            </div>
            {/* Group total footer */}
            <div className="mx-2 mb-2 flex items-center justify-between px-3 py-2 bg-brand-soft/60 rounded-xl">
              <div className="flex items-center gap-2">
                <GitFork className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                <span className="text-2xs text-primary font-semibold uppercase tracking-wider">Total da escalação</span>
                {groupPlannedTotal !== undefined && (
                  <span className="text-2xs text-primary/70 tabular-nums">plan: {formatCurrency(groupPlannedTotal)}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {groupPlannedTotal !== undefined && Math.abs(groupTotal - groupPlannedTotal) > 1 && (
                  <span className={`text-2xs font-semibold tabular-nums ${groupTotal - groupPlannedTotal < 0 ? "text-success" : "text-warning"}`}>
                    {groupTotal - groupPlannedTotal > 0 ? "+" : ""}{formatCurrency(groupTotal - groupPlannedTotal)}
                  </span>
                )}
                <span className="text-base font-semibold text-primary tabular-nums">{formatCurrency(groupTotal)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ActualGroupList;
