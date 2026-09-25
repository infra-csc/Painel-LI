/**
 * Barra de filtros da Visão Geral do Planejado — 25/09 (modularização).
 * Selecionar todos, busca por nome, função, tipo (Casa/Freela), ordenação e
 * contador de resultados. Só apresentação: o estado vem de `useBudgetFilters`.
 */
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FiltrosDoPlanejado } from "@/hooks/use-budget-filters";

const ITEM_CLS = "rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-brand-soft data-[highlighted]:text-primary data-[highlighted]:border-l-primary focus:bg-brand-soft focus:text-primary-hover";

export interface BudgetFiltersProps {
  filtros: FiltrosDoPlanejado;
}

export function BudgetFilters({ filtros: f }: BudgetFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-0">
      {f.selectableFiltered.length > 0 && (
        <Checkbox
          checked={f.selectableFiltered.every(b => f.selectedIds.has(b.inclusion.id))}
          onCheckedChange={(checked) => checked ? f.selectAllCards() : f.clearSelection()}
          className="shrink-0"
          aria-label="Selecionar todos os colaboradores pendentes visíveis"
        />
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" aria-hidden="true" />
        <input
          type="text"
          placeholder="Buscar por nome…"
          aria-label="Buscar colaborador por nome"
          value={f.searchTerm}
          onChange={(e) => f.setSearchTerm(e.target.value)}
          className={cn("pl-7 pr-3 bg-surface-muted border-0 border-b-[1.5px] rounded-t-md text-xs text-slate-700 outline-none transition-colors focus:border-b-primary", f.searchTerm ? "border-b-primary" : "border-b-border")} style={{
            height: 34,
            width: 180,
          }}
        />
      </div>

      <Select value={f.filterFunction} onValueChange={f.setFilterFunction}>
        <SelectTrigger className="w-auto min-w-[140px] h-[34px] text-xs shrink-0 bg-surface-muted border-0 border-b border-border rounded-none rounded-t-md text-slate-600 shadow-none focus:ring-0 focus:border-b-primary">
          <SelectValue placeholder="Função" />
        </SelectTrigger>
        <SelectContent className="rounded-xl shadow-3 border border-border min-w-[180px] p-1.5 backdrop-blur-md bg-card/96">
          <SelectItem value="all" className={ITEM_CLS}>Todas as funções</SelectItem>
          {f.uniqueFunctions.map(fn => (
            <SelectItem key={fn} value={fn} className={ITEM_CLS}>{fn}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={f.filterType} onValueChange={f.setFilterType}>
        <SelectTrigger className="w-28 h-[34px] text-xs shrink-0 bg-surface-muted border-0 border-b border-border rounded-none rounded-t-md text-slate-600 shadow-none focus:ring-0">
          <SelectValue placeholder="Tipo" />
        </SelectTrigger>
        <SelectContent className="rounded-xl shadow-3 border border-border min-w-[140px] p-1.5 backdrop-blur-md bg-card/96">
          <SelectItem value="all" className={ITEM_CLS}>Todos</SelectItem>
          <SelectItem value="casa" className={ITEM_CLS}>Casa</SelectItem>
          <SelectItem value="freela" className={ITEM_CLS}>Freela</SelectItem>
        </SelectContent>
      </Select>

      <Select value={f.sortBy} onValueChange={f.setSortBy}>
        <SelectTrigger className="w-auto min-w-[120px] h-[34px] text-xs shrink-0 bg-surface-muted border-0 border-b border-border rounded-none rounded-t-md text-slate-600 shadow-none focus:ring-0">
          <SelectValue placeholder="Ordenar" />
        </SelectTrigger>
        <SelectContent className="rounded-xl shadow-3 border border-border min-w-[160px] p-1.5 backdrop-blur-md bg-card/96">
          <SelectItem value="name_asc" className={ITEM_CLS}>Nome A-Z</SelectItem>
          <SelectItem value="name_desc" className={ITEM_CLS}>Nome Z-A</SelectItem>
          <SelectItem value="days_desc" className={ITEM_CLS}>Mais Dias</SelectItem>
          <SelectItem value="days_asc" className={ITEM_CLS}>Menos Dias</SelectItem>
          <SelectItem value="function" className={ITEM_CLS}>Por Função</SelectItem>
        </SelectContent>
      </Select>

      <div className="flex-1" />
      <span className="text-2xs text-muted-foreground font-semibold bg-surface-muted rounded-lg py-1 px-2.5" aria-live="polite">
        {f.filteredBudgets.length} resultado{f.filteredBudgets.length !== 1 ? "s" : ""}
      </span>
    </div>
  );
}

export default BudgetFilters;
