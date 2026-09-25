/**
 * Filtros e "Selecionar todas" do Orçamento Realizado — 25/09 (modularização).
 * Só apresentação: o estado vem de `useBudgetActualData`.
 */
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Function } from "@shared/schema";
import type { DadosDoRealizado } from "@/hooks/use-budget-actual-data";

const ITEM_CLS = "rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-brand-soft data-[highlighted]:text-primary data-[highlighted]:border-l-primary focus:bg-brand-soft focus:text-primary-hover";

export interface ActualFiltersProps {
  dados: DadosDoRealizado;
  functions: Function[] | undefined;
}

export function ActualFilters({ dados: d, functions }: ActualFiltersProps) {
  return (
    <>
      {/* ── Filtros ── */}
      <div className="flex flex-wrap items-center gap-3 px-0">
        {/* Busca */}
        <div className="relative w-full sm:w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" aria-hidden="true" />
          <input
            type="text"
            placeholder="Buscar colaborador…"
            value={d.searchTerm}
            onChange={e => d.setSearchTerm(e.target.value)}
            className={cn("w-full pr-3 pl-[26px] bg-surface-muted border-0 border-b-[1.5px] rounded-t-md text-xs text-slate-700 outline-none transition-colors focus:border-b-primary", d.searchTerm ? "border-b-primary" : "border-b-border")}
            style={{ height: 34 }}
          />
        </div>

        {/* Função */}
        <Select value={d.filterFunction} onValueChange={d.setFilterFunction}>
          <SelectTrigger className="w-auto min-w-[150px] h-[34px] text-xs shrink-0 bg-surface-muted border-0 border-b border-border rounded-none rounded-t-md text-slate-600 shadow-none focus:ring-0">
            <SelectValue placeholder="Função" />
          </SelectTrigger>
          <SelectContent className="rounded-xl shadow-3 border border-border min-w-[180px] p-1.5 backdrop-blur-md bg-card/96">
            <SelectItem value="all" className={ITEM_CLS}>Todas as funções</SelectItem>
            {[...(functions ?? [])].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })).map(f => (
              <SelectItem key={f.id} value={f.id} className={ITEM_CLS}>{f.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Tipo */}
        <Select value={d.filterType} onValueChange={d.setFilterType}>
          <SelectTrigger className="w-28 h-[34px] text-xs shrink-0 bg-surface-muted border-0 border-b border-border rounded-none rounded-t-md text-slate-600 shadow-none focus:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-xl shadow-3 border border-border min-w-[130px] p-1.5 backdrop-blur-md bg-card/96">
            <SelectItem value="all" className={ITEM_CLS}>Todos</SelectItem>
            <SelectItem value="casa" className={ITEM_CLS}>Casa</SelectItem>
            <SelectItem value="freela" className={ITEM_CLS}>Freela</SelectItem>
          </SelectContent>
        </Select>

        {/* Ordenação */}
        <Select value={d.sortBy} onValueChange={d.setSortBy}>
          <SelectTrigger className="w-auto min-w-[150px] h-[34px] text-xs shrink-0 bg-surface-muted border-0 border-b border-border rounded-none rounded-t-md text-slate-600 shadow-none focus:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-xl shadow-3 border border-border min-w-[160px] p-1.5 backdrop-blur-md bg-card/96">
            <SelectItem value="adjusted" className={ITEM_CLS}>Ajustadas primeiro</SelectItem>
            <SelectItem value="value" className={ITEM_CLS}>Maior valor</SelectItem>
            <SelectItem value="name" className={ITEM_CLS}>Nome A-Z</SelectItem>
          </SelectContent>
        </Select>

        {/* Contador */}
        <div className="flex-1" />
        <span className="text-2xs text-muted-foreground font-semibold bg-surface-muted rounded-lg py-1 px-2.5" aria-live="polite">
          {d.filteredItems.length} {d.filteredItems.length === 1 ? "item" : "itens"}
        </span>
      </div>

      {d.hasAnyEditable && d.filteredItems.length > 1 && (
        <div className="flex items-center gap-2">
          <button
            onClick={d.selectAll}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-slate-700 transition-colors"
          >
            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
              d.selectedCards.size === d.selectableCount && d.selectedCards.size > 0
                ? "bg-primary border-primary"
                : d.selectedCards.size > 0
                  ? "bg-primary/40 border-primary"
                  : "border-slate-300 "
            }`}>
              {d.selectedCards.size > 0 && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  {d.selectedCards.size === d.selectableCount
                    ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    : <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
                  }
                </svg>
              )}
            </div>
            {d.selectedCards.size > 0
              ? `${d.selectedCards.size} selecionada${d.selectedCards.size > 1 ? "s" : ""}`
              : "Selecionar todas"
            }
          </button>
          {d.selectedCards.size > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-2xs text-muted-foreground hover:text-slate-600"
              onClick={() => d.setSelectedCards(new Set())}
            >
              Limpar
            </Button>
          )}
        </div>
      )}
    </>
  );
}

export default ActualFilters;
