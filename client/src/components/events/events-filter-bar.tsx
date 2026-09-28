/**
 * Barra de busca, filtros, contador e seletor de visualização de Eventos
 * (28/09, extraída de pages/events.tsx sem mudança visual). O estado vem de
 * `useEventsFilters` (URL); aqui só se desenha.
 */
import { AlignJustify, CalendarDays, CalendarRange, FilterX, List, Search, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/use-media-query";
import { MONTHS, SELECT_CLASS, type ViewMode } from "./events-shared";
import type { EventsFilters } from "./use-events-filters";

/** Um select de filtro da barra (valor, setter, opções [valor, rótulo]). */
type SelectDeFiltro = { val: string; set: (v: string) => void; opts: string[][]; test?: string; label: string };

const VIEWS: { key: ViewMode; icon: typeof List; title: string }[] = [
  { key: "table", icon: AlignJustify, title: "Tabela" },
  { key: "list", icon: List, title: "Lista" },
  { key: "week", icon: CalendarRange, title: "Semana" },
  { key: "calendar", icon: CalendarDays, title: "Mês" },
];

export interface EventsFilterBarProps {
  filtros: EventsFilters;
  availableYears: number[];
  /** Quantos eventos a visualização atual mostra de fato. */
  visibleCount: number;
}

export function EventsFilterBar({ filtros, availableYears, visibleCount }: EventsFilterBarProps) {
  const {
    search, setSearch, statusFilter, setStatusFilter, monthFilter, setMonthFilter,
    yearFilter, setYearFilter, hasFilters, clearFilters, viewMode, setViewMode,
  } = filtros;
  // Celular (25/09): abaixo de `md` a "Tabela" vira cartões — o mesmo que a
  // "Lista" — então o botão dela some do seletor e "Lista" aparece ativa.
  const isMobile = useIsMobile();
  // Calendário e semana mostram todos os eventos ativos (não passam pelos filtros
  // da barra), então o contador precisa refletir a lista realmente exibida.
  const isCalendarLike = viewMode === "calendar" || viewMode === "week";

  const selects: SelectDeFiltro[] = [
    { val: statusFilter, set: setStatusFilter,
      opts: [["default", "Planejado + Em andamento"], ["all", "Todos os status"], ["active", "Ativos"], ["planejado", "Planejado"], ["em andamento", "Em andamento"], ["concluído", "Concluído"], ["excluído", "Excluído"]],
      test: "select-status-filter", label: "Filtrar por status" },
    { val: monthFilter, set: setMonthFilter,
      opts: [["all", "Todos os meses"], ...MONTHS.map((m, i) => [String(i + 1), m])],
      test: undefined, label: "Filtrar por mês" },
    { val: yearFilter, set: setYearFilter,
      opts: [["all", "Todos os anos"], ...availableYears.map(y => [String(y), String(y)])],
      test: undefined, label: "Filtrar por ano" },
  ];

  return (
    <div className="bg-card rounded-lg border border-border px-3 py-2.5 shadow-1">
      <div className="flex items-center gap-2 flex-wrap">

        {/* Search */}
        <div className="relative flex-[1_1_180px] min-w-[150px]">
          <Search size={12} className="absolute left-[9px] top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" aria-hidden="true" />
          <input
            id="events-search"
            aria-label="Buscar evento ou cidade"
            placeholder="Buscar evento ou cidade…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-search-event"
            className={cn("w-full h-8 text-xs pl-7 border border-input rounded-md bg-muted/40 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring placeholder:text-muted-foreground", search ? "pr-8" : "pr-2")}
          />
          {/* Alvo de 24px (23/09): o ícone de 11px sozinho era difícil de acertar no toque. */}
          {search && (
            <button type="button" onClick={() => setSearch("")} aria-label="Limpar busca" className="absolute right-1 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X size={12} aria-hidden="true" /></button>
          )}
        </div>

        {/* Selects */}
        {selects.map((s, i) => (
          <select key={i} value={s.val} onChange={e => s.set(e.target.value)} data-testid={s.test} aria-label={s.label} className={SELECT_CLASS}>
            {s.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ))}

        {hasFilters && (
          <button type="button" onClick={clearFilters} data-testid="button-clear-filters"
            className="h-8 px-2.5 rounded-md text-primary text-xs font-bold flex items-center gap-1 hover:text-primary-hover hover:bg-brand-soft transition-colors">
            <FilterX className="h-4 w-4" aria-hidden="true" />
            Limpar filtros
          </button>
        )}

        <span className="text-2xs text-muted-foreground ml-auto whitespace-nowrap" aria-live="polite">
          {visibleCount} evento{visibleCount !== 1 ? "s" : ""}
          {isCalendarLike && " (todos os ativos)"}
        </span>

        <div className="w-px h-[18px] bg-border hidden sm:block" />

        {/* View toggle */}
        <div className="flex bg-muted rounded-md p-0.5 gap-px">
          {VIEWS.map(v => {
            // No celular "Tabela" e "Lista" são a mesma coisa: o botão da tabela some.
            if (v.key === "table" && isMobile) return null;
            const active = viewMode === v.key || (isMobile && v.key === "list" && viewMode === "table");
            return (
              <Tooltip key={v.key}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setViewMode(v.key)}
                    aria-label={`Visualização: ${v.title}`}
                    aria-pressed={active}
                    className={cn(
                      "flex items-center justify-center w-7 h-7 rounded-md transition-all duration-150",
                      active ? "bg-card text-primary shadow-1" : "bg-transparent text-muted-foreground hover:text-slate-600",
                    )}
                  >
                    <v.icon className="h-4 w-4" aria-hidden="true" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{v.title}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default EventsFilterBar;
