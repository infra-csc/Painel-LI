/**
 * Grade de CARDS da Visão Geral do Planejado — 25/09 (modularização).
 *
 * Extraída de budget-planned.tsx: estados carregando/erro/vazio e a grade
 * virtualizada (2 colunas a partir de `md`, mesmo breakpoint do Tailwind).
 * A rolagem até o card destacado pela URL vive aqui porque depende do
 * virtualizador (o card pode ainda não estar no DOM).
 */
import { useEffect, useRef } from "react";
import { RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCardsVirtuais, useMediaQuery } from "@/components/common/virtual-rows";
import type { BudgetActual, BudgetNote, BudgetPlanned as BudgetPlannedRow } from "@shared/schema";
import { BudgetCard } from "./budget-card";
import { collabFuncKey, type CalculatedBudget, type NotAttendedModalState, type RestoreModalState } from "./types";

export interface BudgetCardsProps {
  filteredBudgets: CalculatedBudget[];
  /** Total antes do filtro — decide entre "Nenhuma escalação" e "Nenhum resultado". */
  totalCalculated: number;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  highlightCardId: string;
  sentToActual: Set<string>;
  selectedIds: Set<string>;
  collapsedCards: Set<string>;
  plannedByCollabFunc: Map<string, BudgetPlannedRow>;
  actualsByCollabFunc: Map<string, BudgetActual>;
  eventNotes: BudgetNote[];
  nomeDaVaga: (b: CalculatedBudget) => string;
  getFunctionName: (id?: string | null) => string;
  canEdit: boolean;
  canMarkNotAttended: boolean;
  restorePending: boolean;
  onToggleSelect: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onEdit: (budget: CalculatedBudget, viewMode?: boolean) => void;
  onSend: (id: string) => void;
  onNotAttended: (s: NotAttendedModalState) => void;
  onRestore: (s: RestoreModalState) => void;
}

export function BudgetCards(p: BudgetCardsProps) {
  const { filteredBudgets, totalCalculated, isLoading, isError, onRetry, highlightCardId } = p;

  // ── Virtualização (23/09): cards da Visão Geral ───────────────────────────
  // Só o que cabe no contêiner de rolagem vai para o DOM; abaixo de 60 itens a
  // lista é renderizada inteira. O grid de cards tem 2 colunas a partir de
  // `md` (768px) — mesmo breakpoint das classes Tailwind do grid.
  const cardsScrollRef = useRef<HTMLDivElement>(null);
  const duasColunas = useMediaQuery("(min-width: 768px)");
  const cardsVirtuais = useCardsVirtuais(filteredBudgets, {
    scrollRef: cardsScrollRef,
    alturaEstimada: 360,
    colunas: duasColunas ? 2 : 1,
  });

  // Card destacado pela URL pode estar fora da janela virtualizada: rola a
  // lista até ele antes do `scrollIntoView`.
  const rolarParaCardRef = useRef(cardsVirtuais.rolarPara);
  rolarParaCardRef.current = cardsVirtuais.rolarPara;
  useEffect(() => {
    if (!highlightCardId) return;
    const idx = filteredBudgets.findIndex(b => b.inclusion.id === highlightCardId);
    if (idx >= 0) rolarParaCardRef.current(idx);
    const t = setTimeout(() => {
      document.querySelector(`[data-card-id="${highlightCardId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 350);
    return () => clearTimeout(t);
  }, [highlightCardId, filteredBudgets]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" aria-hidden="true" />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-card rounded-xl border border-border">
        <RefreshCw className="w-16 h-16 text-slate-200 mb-4" aria-hidden="true" />
        <h3 className="text-base font-semibold text-slate-700">Erro ao carregar os dados</h3>
        <p className="text-sm text-muted-foreground mt-1">Não foi possível buscar as escalações deste evento</p>
        <Button
          variant="outline"
          className="mt-4 gap-2"
          onClick={onRetry}
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          Tentar novamente
        </Button>
      </div>
    );
  }
  if (filteredBudgets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-card rounded-xl border border-border">
        <Users className="w-16 h-16 text-slate-200 mb-4" aria-hidden="true" />
        <h3 className="text-base font-semibold text-slate-700">
          {totalCalculated === 0 ? "Nenhuma escalação confirmada" : "Nenhum resultado encontrado"}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          {totalCalculated === 0 ? "Apenas escalações confirmadas aparecem aqui" : "Tente ajustar os filtros"}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={cardsScrollRef}
      className="overflow-auto max-h-[calc(100vh-var(--sticky-top,3.5rem)-12rem)] -mx-1 px-1"
      data-testid="budget-cards-scroll"
    >
    <div className="relative" style={cardsVirtuais.ativo ? { height: cardsVirtuais.alturaTotal } : undefined}>
    {cardsVirtuais.fileiras.map(fileira => (
    <div
      key={fileira.index}
      ref={fileira.medir}
      data-index={fileira.index}
      className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch pb-4"
      style={cardsVirtuais.ativo ? { position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${fileira.inicio}px)` } : undefined}
    >
      {fileira.itens.map((budget) => {
        const key = collabFuncKey(budget.inclusion);
        return (
          <BudgetCard
            key={budget.inclusion.id}
            budget={budget}
            name={p.nomeDaVaga(budget)}
            functionName={p.getFunctionName(budget.inclusion.functionId)}
            isSent={p.sentToActual.has(budget.inclusion.id)}
            isSelected={p.selectedIds.has(budget.inclusion.id)}
            isCollapsed={p.collapsedCards.has(budget.inclusion.id)}
            isHighlighted={highlightCardId === budget.inclusion.id}
            planRecord={p.plannedByCollabFunc.get(key)}
            cardActual={p.actualsByCollabFunc.get(key)}
            eventNotes={p.eventNotes}
            canEdit={p.canEdit}
            canMarkNotAttended={p.canMarkNotAttended}
            restorePending={p.restorePending}
            onToggleSelect={p.onToggleSelect}
            onToggleCollapse={p.onToggleCollapse}
            onEdit={p.onEdit}
            onSend={p.onSend}
            onNotAttended={p.onNotAttended}
            onRestore={p.onRestore}
          />
        );
      })}
    </div>
    ))}
    </div>
    </div>
  );
}

export default BudgetCards;
