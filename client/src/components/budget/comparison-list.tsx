/**
 * "Detalhamento por Prestação" do Comparativo — 25/09 (modularização).
 * Toolbar (expandir/selecionar todos), filtros, estados carregando/erro/vazio
 * e a lista de `ComparisonCard`. O estado vem de `useBudgetComparisonData`.
 */
import { AlertCircle, BarChart3, CheckSquare, ChevronDown, ChevronUp, RotateCcw, Search, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { chaveComposta } from "@/lib/indices";
import type { ActivityLog } from "@/components/activity-timeline";
import type { BudgetActual, BudgetNote } from "@shared/schema";
import type { DadosDoComparativo } from "@/hooks/use-budget-comparison-data";
import { ComparisonCard } from "./comparison-card";
import { SELECT_ITEM_CLS, type SplitDetailState } from "./comparison-utils";

export interface ComparisonListProps {
  dados: DadosDoComparativo;
  selectedEventId: string;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
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
  const { dados: d, selectedEventId, isLoading, isError, onRetry, highlightCardId, eventNotes, plannedLogs, isRhOrAdmin, getCollaboratorName, getFunctionName, onEdit, onSplitDetail } = p;
  const { sortedData, expandedCards, setExpandedCards, selectedItems, setSelectedItems } = d;
  const allVisibleExpanded = sortedData.length > 0 && sortedData.every(r => expandedCards.has(r.actual.id));

  const toggleSelect = (id: string, checked: boolean) => {
    const next = new Set(selectedItems);
    if (checked) next.add(id); else next.delete(id);
    setSelectedItems(next);
  };

  return (
    <div>
      <div className="mb-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-black text-foreground">Detalhamento por Prestação</h2>
            <span className="text-2xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{sortedData.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm" variant="ghost"
              className="text-xs h-7 gap-1 rounded-lg text-muted-foreground hover:text-slate-700 hover:bg-muted"
              onClick={() => {
                // Interseção com os ids visíveis: comparar por size acumulado
                // travava o botão quando havia ids expandidos fora do filtro
                if (allVisibleExpanded) setExpandedCards(new Set());
                else setExpandedCards(new Set(sortedData.map(r => r.actual.id)));
              }}
            >
              {allVisibleExpanded ? <ChevronUp className="w-3 h-3" aria-hidden="true" /> : <ChevronDown className="w-3 h-3" aria-hidden="true" />}
              {allVisibleExpanded ? "Recolher todos" : "Expandir todos"}
            </Button>
            {isRhOrAdmin && (
              <Button
                size="sm" variant="ghost"
                className="text-xs h-7 gap-1 rounded-lg text-muted-foreground hover:text-slate-700 hover:bg-muted"
                onClick={() => {
                  const selectableIds = sortedData
                    .filter(row => (row.actual.rhStatus || "pendente") === "pendente")
                    .map(row => row.actual.id);
                  if (selectedItems.size > 0) setSelectedItems(new Set());
                  else setSelectedItems(new Set(selectableIds));
                }}
              >
                {selectedItems.size > 0 ? <><CheckSquare className="w-3 h-3" aria-hidden="true" /> Limpar</> : <><Square className="w-3 h-3" aria-hidden="true" /> Selecionar todos</>}
              </Button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
            <Input placeholder="Buscar por nome…" value={d.searchTerm} onChange={e => d.setSearchTerm(e.target.value)} className="h-8 pl-8 text-xs rounded-xl border-border" />
          </div>
          <Select value={d.filterFunction} onValueChange={d.setFilterFunction}>
            <SelectTrigger className="h-9 text-sm w-auto min-w-[160px] border border-border rounded-lg bg-card text-slate-700 hover:border-primary/40 transition-colors focus:ring-2 focus:ring-primary/25"><SelectValue placeholder="Função" /></SelectTrigger>
            <SelectContent className="bg-card border border-border rounded-xl shadow-2 min-w-[180px]">
              <SelectItem value="all" className={SELECT_ITEM_CLS}>Todas as funções</SelectItem>
              {d.usedFunctionIds.map(fid => <SelectItem key={fid} value={fid!} className={SELECT_ITEM_CLS}>{getFunctionName(fid)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={d.filterType} onValueChange={d.setFilterType}>
            <SelectTrigger className="h-9 text-sm w-28 border border-border rounded-lg bg-card text-slate-700 hover:border-primary/40 transition-colors focus:ring-2 focus:ring-primary/25"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent className="bg-card border border-border rounded-xl shadow-2 min-w-[140px]">
              <SelectItem value="all" className={SELECT_ITEM_CLS}>Todos</SelectItem>
              <SelectItem value="casa" className={SELECT_ITEM_CLS}>Casa</SelectItem>
              <SelectItem value="freela" className={SELECT_ITEM_CLS}>Freela</SelectItem>
            </SelectContent>
          </Select>
          <Select value={d.sortBy} onValueChange={(v: "difference" | "total") => d.setSortBy(v)}>
            <SelectTrigger className="h-9 text-sm w-auto min-w-[160px] border border-border rounded-lg bg-card text-slate-700 hover:border-primary/40 transition-colors focus:ring-2 focus:ring-primary/25"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-card border border-border rounded-xl shadow-2 min-w-[180px]">
              <SelectItem value="difference" className={SELECT_ITEM_CLS}>Maior diferença</SelectItem>
              <SelectItem value="total" className={SELECT_ITEM_CLS}>Maior valor</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Cards */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-8 h-8 border-2 border-success-strong border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Carregando prestações…</p>
        </div>
      ) : isError ? (
        <div className="rounded-xl border-2 border-dashed border-danger/25 bg-danger-soft/50 p-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-danger-soft flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="w-6 h-6 text-danger-strong" aria-hidden="true" />
          </div>
          <p className="font-semibold text-danger">Erro ao carregar as prestações</p>
          <p className="text-sm text-muted-foreground mt-1">Não foi possível carregar os dados do Planejado e do Realizado. Verifique sua conexão e tente novamente.</p>
          <Button
            className="mt-4 h-9 px-5 rounded-xl text-sm font-semibold bg-card border border-danger/25 text-danger hover:bg-danger-soft shadow-none"
            onClick={onRetry}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Tentar novamente
          </Button>
        </div>
      ) : sortedData.length === 0 ? (
        d.temFiltro ? (
          <div className="rounded-xl border-2 border-dashed border-border bg-surface-muted p-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
              <Search className="w-6 h-6 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="font-semibold text-muted-foreground">Nenhuma prestação corresponde aos filtros</p>
            <p className="text-sm text-muted-foreground mt-1">Ajuste a busca ou os filtros para ver outras prestações.</p>
            <Button
              variant="ghost"
              className="mt-3 h-8 px-4 rounded-xl text-xs text-muted-foreground hover:text-slate-700 hover:bg-muted"
              onClick={d.limparFiltros}
            >
              Limpar filtros
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border-2 border-dashed border-border bg-surface-muted p-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
              <BarChart3 className="w-6 h-6 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="font-semibold text-muted-foreground">Nenhuma prestação enviada para revisão</p>
            <p className="text-sm text-muted-foreground mt-1">As prestações aparecerão aqui após serem preenchidas e enviadas no Orçamento Realizado.</p>
          </div>
        )
      ) : (
        <div className="space-y-2">
          {sortedData.map((row) => (
            <ComparisonCard
              key={row.actual.id}
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
          ))}
        </div>
      )}
    </div>
  );
}

export default ComparisonList;
