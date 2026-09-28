/**
 * Barra de filtros da Validação (25/09 — extraída da página) — a mesma na
 * Lista e nas Decididas (11/09): busca, funções em seleção múltipla, "Só as
 * minhas funções" e o único "Limpar filtros" da barra.
 */
import { CheckSquare, ChevronDown, Search, Square } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CHIP_BTN } from "./validation-shared";
import type { ValidationData } from "./use-validation-data";

export function ValidationToolbar({ d, anyEditable }: { d: ValidationData; anyEditable: boolean }) {
  const {
    search, setSearch, functionFilter, setFunctionFilter, functionNameById, functionsInEvent,
    minhasFuncoesIds, isAdmin, onlyMine, setOnlyMine, hasActiveFilters, clearFilters,
  } = d;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5 flex flex-wrap items-center gap-2.5">
      <div className="relative flex-1 min-w-[240px]">
        <Label htmlFor="val-search" className="sr-only">Buscar vaga</Label>
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input id="val-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Função, #ID ou observação" className="h-9 pl-8 rounded-lg bg-surface-muted" />
      </div>
      {/* Funções em seleção múltipla (dono, 15/09): marcar várias de uma vez. */}
      <div className="w-[220px]">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Filtrar por função"
              className={cn(
                "flex h-9 w-full items-center justify-between gap-2 rounded-lg border bg-card px-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                functionFilter.size > 0 ? "border-primary/40 font-medium text-primary" : "border-input text-slate-700",
              )}
              data-testid="filtro-funcoes-validacao"
            >
              <span className="truncate">
                {functionFilter.size === 0
                  ? "Todas as funções"
                  : functionFilter.size === 1
                    ? (functionNameById.get(Array.from(functionFilter)[0]) ?? "1 função")
                    : functionFilter.size + " funções"}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[260px] p-1.5">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Funções</span>
              {functionFilter.size > 0 && (
                <button type="button" onClick={() => setFunctionFilter(new Set())} className="text-xs font-medium text-primary hover:underline" data-testid="limpar-funcoes-validacao">
                  Limpar
                </button>
              )}
            </div>
            <div className="max-h-[300px] overflow-y-auto" role="group" aria-label="Funções">
              {functionsInEvent.map((f) => {
                const on = functionFilter.has(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => setFunctionFilter((prev) => { const n = new Set(prev); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n; })}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-muted"
                    data-testid={"filtro-funcao-" + f.id}
                  >
                    {on
                      ? <CheckSquare className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      : <Square className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                    <span className="min-w-0 break-words">{f.name}</span>
                  </button>
                );
              })}
              {functionsInEvent.length === 0 && <p className="px-2 py-2 text-xs text-muted-foreground">Nenhuma função neste recorte.</p>}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {/* Sem cadastro de validador o admin veria tudo de qualquer jeito — o botão sumiria sem função. */}
      {anyEditable && (minhasFuncoesIds.size > 0 || !isAdmin) && (
        <button
          type="button" aria-pressed={onlyMine} onClick={() => setOnlyMine((v) => !v)}
          title="Só as vagas das funções em que você é validador, em qualquer situação"
          className={cn(CHIP_BTN, onlyMine ? "border-primary/30 bg-brand-soft text-primary" : "border-border bg-card text-slate-600 hover:border-primary/30 hover:text-primary")}
        >
          {onlyMine ? <CheckSquare className="w-4 h-4" aria-hidden="true" /> : <Square className="w-4 h-4" aria-hidden="true" />}
          Só as minhas funções
        </button>
      )}
      {/* O ÚNICO "Limpar filtros" da barra (04/09) — o estado vazio
          filtrado tem o dele; o aviso de seleção oculta, logo abaixo,
          já não repete o botão. */}
      {hasActiveFilters && (
        <button type="button" onClick={clearFilters}
          className="h-9 rounded-lg px-2 text-xs font-medium text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Limpar filtros
        </button>
      )}
    </div>
  );
}
