/**
 * Barra de busca, filtros e seletor de visualização de Eventos (28/09,
 * extraída de pages/events.tsx). O estado vem de `useEventsFilters` (URL);
 * aqui só se desenha.
 *
 * 07/10 (redesenho): a MESMA anatomia da barra de Passagens/Hospedagem
 * (peças de `common/barra-de-filtros` e `common/filter-popover`) — busca com
 * Esc que apaga, e status/mês/ano em listas desenhadas com o número de eventos
 * que cada opção deixa (eram três `<select>` nativos dentro de um cartão).
 * O contador foi para a barra da tela, junto do título.
 *
 * Semana e Mês mostram todos os eventos ativos — não passam pelos filtros. Em
 * vez de deixar busca e filtros à vista sem efeito nenhum, a barra diz isso.
 *
 * **Nenhum filtro saiu**: busca, status (as mesmas 7 opções), mês, ano,
 * limpar e as quatro visualizações continuam aqui, com os mesmos valores.
 */
import { AlignJustify, CalendarDays, CalendarRange, Info, LayoutGrid } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BuscaDaLista, LimparFiltros } from "@/components/common/barra-de-filtros";
import { FiltroDeLista } from "@/components/common/filter-popover";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/use-media-query";
import { MONTHS, type ViewMode } from "./events-shared";
import { OPCOES_DE_STATUS, type EventsFilters } from "./use-events-filters";

const VIEWS: { key: ViewMode; icon: typeof AlignJustify; title: string }[] = [
  { key: "table", icon: AlignJustify, title: "Tabela" },
  { key: "list", icon: LayoutGrid, title: "Lista" },
  { key: "week", icon: CalendarRange, title: "Semana" },
  { key: "calendar", icon: CalendarDays, title: "Mês" },
];

const OPCOES_DE_MES = [{ id: "all", nome: "Todos os meses" }, ...MONTHS.map((m, i) => ({ id: String(i + 1), nome: m }))];

export interface EventsFilterBarProps {
  filtros: EventsFilters;
  availableYears: number[];
}

/** Seletor de visualização: rótulo à vista a partir de 1500px (em 1366, com o menu aberto, ele empurrava a barra para duas linhas); antes, ícone com dica. */
function SeletorDeVisao({ viewMode, setViewMode, className }: Pick<EventsFilters, "viewMode" | "setViewMode"> & { className?: string }) {
  // Celular (25/09): abaixo de `md` a "Tabela" vira cartões — o mesmo que a
  // "Lista" — então o botão dela some do seletor e "Lista" aparece ativa.
  const isMobile = useIsMobile();
  return (
    <div role="group" aria-label="Visualização" className={cn("inline-flex shrink-0 items-center h-[34px] p-0.5 gap-0.5 rounded-lg border border-border bg-surface-muted", className)}>
      {VIEWS.map(v => {
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
                data-testid={`view-${v.key}`}
                className={cn(
                  "pas-alvo inline-flex items-center justify-center gap-1.5 h-full min-w-[34px] px-2 min-[1500px]:px-2.5 rounded-md text-sm transition-[background-color,color,box-shadow] duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "bg-card text-foreground font-medium shadow-1" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <v.icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} aria-hidden="true" />
                <span className="hidden min-[1500px]:inline">{v.title}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent className="min-[1500px]:hidden">{v.title}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

export function EventsFilterBar({ filtros, availableYears }: EventsFilterBarProps) {
  const {
    search, setSearch, statusFilter, setStatusFilter, monthFilter, setMonthFilter,
    yearFilter, setYearFilter, hasFilters, clearFilters, viewMode, setViewMode, contagens,
  } = filtros;
  // Calendário e semana mostram todos os eventos ativos (não passam pelos filtros).
  const isCalendarLike = viewMode === "calendar" || viewMode === "week";
  const opcoesDeAno = [{ id: "all", nome: "Todos os anos" }, ...availableYears.map(y => ({ id: String(y), nome: String(y) }))];

  return (
    <div role="search" aria-label="Filtros dos eventos" className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
      {isCalendarLike ? (
        <p className="pas-entra flex items-start gap-1.5 min-w-0 flex-1 m-0 text-xs leading-5 text-muted-foreground" data-testid="nota-calendario">
          <Info className="w-3.5 h-3.5 mt-[3px] shrink-0" aria-hidden="true" />
          <span>
            {viewMode === "week" ? "A semana" : "O mês"} mostra todos os eventos ativos.
            <span className="hidden sm:inline"> A busca e os filtros valem para a tabela e a lista.</span>
          </span>
        </p>
      ) : (
        <>
          <div className="flex-1 min-w-0 sm:flex-[1_1_180px] sm:max-w-[320px]">
            <BuscaDaLista
              valor={search}
              onChange={setSearch}
              placeholder="Buscar evento ou cidade"
              rotulo="Buscar evento ou cidade"
              testid="input-search-event"
            />
          </div>
          {/* Celular: os filtros descem para uma fileira que rola de lado (abaixo da busca). */}
          <div className="pas-rolagem-x order-last basis-full -mx-[var(--page-gutter)] px-[var(--page-gutter)] flex items-center gap-1.5 sm:order-none sm:basis-auto sm:mx-0 sm:px-0 sm:overflow-visible">
            <div role="group" aria-label="Filtrar por status" className="shrink-0 min-w-[150px]">
              <FiltroDeLista
                valor={statusFilter}
                onChange={setStatusFilter}
                opcoes={OPCOES_DE_STATUS}
                contagens={contagens.status}
                testid="select-status-filter"
                larguraPopover={268}
              />
            </div>
            <div role="group" aria-label="Filtrar por mês" className="shrink-0 min-w-[138px]">
              <FiltroDeLista valor={monthFilter} onChange={setMonthFilter} opcoes={OPCOES_DE_MES} contagens={contagens.mes} testid="select-month-filter" larguraPopover={220} />
            </div>
            <div role="group" aria-label="Filtrar por ano" className="shrink-0 min-w-[128px]">
              <FiltroDeLista valor={yearFilter} onChange={setYearFilter} opcoes={opcoesDeAno} contagens={contagens.ano} testid="select-year-filter" larguraPopover={200} />
            </div>
            {hasFilters && (
              <div className="pas-entra shrink-0">
                <LimparFiltros onClick={clearFilters} />
              </div>
            )}
          </div>
        </>
      )}
      <SeletorDeVisao viewMode={viewMode} setViewMode={setViewMode} className="ml-auto" />
    </div>
  );
}

export default EventsFilterBar;
