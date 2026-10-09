/**
 * Grade de CARDS da Visão Geral do Planejado — 25/09 (modularização);
 * redesenho 08/10.
 *
 * Estados com a cara da família (Passagens/Hospedagem): esqueleto no formato
 * do card, erro com "Tentar novamente", vazio que explica de onde a lista vem
 * e "sem resultado" com "Limpar filtros". A grade tem 1, 2 ou 3 colunas
 * conforme a LARGURA ÚTIL (o menu lateral muda o espaço sem mudar a janela).
 *
 * A rolagem até o card destacado pela URL vive aqui porque depende do
 * virtualizador (o card pode ainda não estar no DOM).
 */
import { useEffect, useRef } from "react";
import { AlertCircle, ClipboardList, RotateCw, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useCardsVirtuais } from "@/components/common/virtual-rows";
import { useLarguraUtil } from "@/components/common/use-largura-util";
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
  /** Selecionáveis visíveis (pendentes) — base do "selecionar todos". */
  selectableCount?: number;
  allSelected?: boolean;
  onSelectAll?: (v: boolean) => void;
  /** Há busca/filtro ligado: o vazio oferece "Limpar filtros". */
  algumFiltro?: boolean;
  onLimparFiltros?: () => void;
}

/** Colunas pela largura útil da lista: 1 (< 640), 2, 3 (≥ 1380). */
const colunasPara = (largura: number | null) => (largura === null ? 2 : largura >= 1380 ? 3 : largura >= 640 ? 2 : 1);
const GRADE: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3" };

/** Esqueleto no formato do card: cabeçalho, três lançamentos e o rodapé. */
export function EsqueletoDosCards({ n = 4 }: { n?: number }) {
  return (
    <div aria-hidden="true" className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card">
          <div className="flex items-start gap-3 px-4 pt-3.5 pb-3">
            <div className="pas-osso w-4 h-4 rounded" />
            <div className="flex-1 space-y-1.5"><div className="pas-osso h-3.5 w-1/2" /><div className="pas-osso h-2.5 w-1/3" /><div className="pas-osso h-4 w-24 mt-2" /></div>
            <div className="space-y-1.5"><div className="pas-osso h-2.5 w-16 ml-auto" /><div className="pas-osso h-5 w-24" /></div>
          </div>
          {[0, 1, 2].map((k) => (
            <div key={k} className="flex items-center gap-3 px-4 py-2.5 border-t border-border/60">
              <div className="pas-osso h-3 w-20" /><div className="pas-osso h-2.5 flex-1 max-w-[40%]" /><div className="pas-osso h-3 w-16 ml-auto" />
            </div>
          ))}
          <div className="flex justify-end gap-2 px-3 py-2 border-t border-border"><div className="pas-osso h-7 w-16" /><div className="pas-osso h-7 w-16" /></div>
        </div>
      ))}
    </div>
  );
}

export function BudgetCards(p: BudgetCardsProps) {
  const { filteredBudgets, totalCalculated, isLoading, isError, onRetry, highlightCardId } = p;

  // ── Virtualização (23/09): cards da Visão Geral ───────────────────────────
  // Só o que cabe no contêiner de rolagem vai para o DOM; abaixo de 60 itens a
  // lista é renderizada inteira.
  const cardsScrollRef = useRef<HTMLDivElement>(null);
  const { ref: refLargura, largura } = useLarguraUtil<HTMLDivElement>();
  const colunas = colunasPara(largura);
  const cardsVirtuais = useCardsVirtuais(filteredBudgets, {
    scrollRef: cardsScrollRef,
    alturaEstimada: 250,
    colunas,
  });

  // A medição da largura precisa do MESMO elemento em todos os estados (o
  // observador é ligado uma vez, na montagem).
  const casca = (conteudo: React.ReactNode) => <div ref={refLargura} className="min-w-0">{conteudo}</div>;

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
    return casca(
      <div role="status" aria-live="polite" aria-busy="true" aria-label="Carregando colaboradores">
        <span className="sr-only">Carregando colaboradores…</span>
        <EsqueletoDosCards />
      </div>
    );
  }
  if (isError) {
    return casca(
      <div role="alert" className="pas-entra flex flex-col items-center text-center rounded-xl border border-danger/25 bg-card px-6 py-14">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-danger-soft text-danger mb-3" aria-hidden="true">
          <AlertCircle className="w-5 h-5" />
        </span>
        <h3 className="m-0 text-base font-semibold text-foreground">Não foi possível carregar o planejado</h3>
        <p className="m-0 mt-1.5 max-w-[440px] text-sm leading-relaxed text-muted-foreground">
          As escalações, os valores ou os envios deste evento não chegaram. Verifique sua conexão e tente de novo — nada do que você ajustou foi perdido.
        </p>
        <Button variant="outline" className="mt-5 rounded-lg" onClick={onRetry} data-testid="planejado-tentar-novamente">
          <RotateCw className="w-4 h-4 mr-1.5" aria-hidden="true" />Tentar novamente
        </Button>
      </div>
    );
  }
  if (filteredBudgets.length === 0) {
    const semNada = totalCalculated === 0;
    const Icone = semNada ? ClipboardList : SearchX;
    return casca(
      <div className="pas-entra flex flex-col items-center text-center rounded-xl border border-border bg-card px-6 py-14" data-testid="planejado-vazio">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-muted text-muted-foreground mb-3" aria-hidden="true">
          <Icone className="w-5 h-5" />
        </span>
        <h3 className="m-0 text-base font-semibold text-foreground">
          {semNada ? "Nenhuma escalação confirmada" : "Nenhum resultado encontrado"}
        </h3>
        <p className="m-0 mt-1.5 max-w-[440px] text-sm leading-relaxed text-muted-foreground">
          {semNada
            ? "Apenas escalações confirmadas aparecem aqui. Assim que a escala do evento for aprovada, o orçamento é calculado sozinho."
            : "Nenhum colaborador bate com a busca e os filtros de agora. Ajuste ou limpe para ver os demais."}
        </p>
        {!semNada && p.algumFiltro && p.onLimparFiltros && (
          <button
            type="button"
            onClick={p.onLimparFiltros}
            className="mt-4 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-card text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Limpar filtros
          </button>
        )}
      </div>
    );
  }

  return casca(
    <>
      {/* Cabeçalho da lista: selecionar os pendentes visíveis. */}
      {p.onSelectAll && (p.selectableCount ?? 0) > 0 && (
        <label className="pla-selecionar-todos inline-flex items-center gap-2.5 h-8 mb-2 pl-4 pr-2 rounded-lg text-xs font-medium text-slate-600 cursor-pointer hover:text-foreground">
          <Checkbox
            checked={!!p.allSelected}
            onCheckedChange={(v) => p.onSelectAll?.(!!v)}
            aria-label="Selecionar todos os colaboradores pendentes visíveis"
          />
          {p.allSelected
            ? `${p.selectableCount} pendentes selecionados`
            : `Selecionar os ${p.selectableCount} pendentes visíveis`}
        </label>
      )}
      <div
        ref={cardsScrollRef}
        // Lista curta: a página rola como sempre. Só com virtualização (≥ 60)
        // a grade vira uma caixa que rola por dentro, na altura da janela.
        className={cardsVirtuais.ativo ? "pla-cards-rolagem overflow-auto -mx-1 px-1 pb-1" : undefined}
        data-testid="budget-cards-scroll"
      >
        <div className="relative" style={cardsVirtuais.ativo ? { height: cardsVirtuais.alturaTotal } : undefined}>
          {cardsVirtuais.fileiras.map(fileira => (
            <div
              key={fileira.index}
              ref={fileira.medir}
              data-index={fileira.index}
              className={`grid ${GRADE[colunas]} gap-3 items-stretch pb-3`}
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
    </>,
  );
}

export default BudgetCards;
