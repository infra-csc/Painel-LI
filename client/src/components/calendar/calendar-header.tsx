/**
 * Barra de ferramentas e cabeçalho do período do Calendário (25/09 — extraído
 * de pages/calendar.tsx).
 *
 * 07/10 (redesenho), a MESMA anatomia de Eventos/Passagens:
 *  - o título e o resumo foram para a barra da tela (56px, `pages/calendar`);
 *  - a barra de ferramentas usa as peças comuns — busca com Esc que apaga, o
 *    status numa lista desenhada com a contagem de cada opção (eram pílulas
 *    com "Filtros:" e zeros à vista), "Limpar filtros" e o seletor de visão;
 *  - a navegação do período mora no topo da grade, num grupo só (‹ Hoje ›),
 *    com o período por extenso, a contagem do período e a legenda das cores.
 *
 * **Nenhum controle saiu**: busca (nome ou local), status (todos, concluído,
 * em andamento, planejado — com as mesmas contagens), limpar, Mês/Semana/
 * Lista, setas, Hoje e o número da semana continuam aqui.
 */
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, List, type LucideIcon } from "lucide-react";
import { BuscaDaLista, LimparFiltros } from "@/components/common/barra-de-filtros";
import { FiltroDeLista } from "@/components/common/filter-popover";
import { cn } from "@/lib/utils";
import { Legenda, MONTH_NAMES_LOWER, NAV_BTN, addDays, eventosNoPeriodo, isoWeekNumber, rotuloDaSemana } from "./calendar-shared";
import type { CalendarState, CalendarView } from "./use-calendar-state";

const VISOES: readonly [CalendarView, string, LucideIcon][] = [
  ["month", "Mês", CalendarDays],
  ["week", "Semana", CalendarRange],
  ["list", "Lista", List],
];

/** Seletor de visão: segmentado, com o rótulo à vista (são só três); no celular, só o ícone. */
function SeletorDeVisao({ view, setView }: Pick<CalendarState, "view" | "setView">) {
  return (
    <div role="group" aria-label="Visualização" className="inline-flex shrink-0 items-center h-[34px] p-0.5 gap-0.5 rounded-lg border border-border bg-surface-muted">
      {VISOES.map(([k, rotulo, Icone]) => {
        const ativo = view === k;
        return (
          <button
            key={k}
            type="button"
            onClick={() => setView(k)}
            aria-pressed={ativo}
            aria-label={rotulo}
            title={rotulo}
            data-testid={`cal-visao-${k}`}
            className={cn(
              "pas-alvo inline-flex items-center justify-center gap-1.5 h-full min-w-[34px] px-2 sm:px-2.5 rounded-md text-sm transition-[background-color,color,box-shadow] duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              ativo ? "bg-card text-foreground font-medium shadow-1" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icone className={cn("h-4 w-4 shrink-0", ativo && "text-primary")} aria-hidden="true" />
            <span className="hidden sm:inline">{rotulo}</span>
          </button>
        );
      })}
    </div>
  );
}

export function CalendarToolbar({ s }: { s: CalendarState }) {
  const { view, setView, searchQuery, setSearchQuery, statusFilter, setStatusFilter, statusCounts, legendItems, visibleEvents, hasFilters, limparFiltros } = s;
  // Nenhum evento no calendário: busca e status não têm o que filtrar — fica só a visão.
  const semNada = visibleEvents.length === 0 && !hasFilters;
  // Na ordem da vida do evento — a mesma da legenda (planejado → em andamento → concluído).
  const itens = [...legendItems].reverse();
  const opcoes = [{ id: "all", nome: "Todos os status" }, ...itens.map(i => ({ id: i.key, nome: i.label }))];
  const contagens = new Map<string, number>([["all", visibleEvents.length], ...itens.map(i => [i.key, statusCounts[i.key] || 0] as [string, number])]);
  return (
    <div role="search" aria-label="Filtros do calendário" className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
      {!semNada && <>
      <div className="flex-[1_1_100%] min-w-0 sm:flex-[1_1_200px] sm:max-w-[320px]">
        <BuscaDaLista
          valor={searchQuery}
          onChange={setSearchQuery}
          placeholder="Buscar evento ou local"
          rotulo="Buscar evento por nome ou local"
          testid="cal-busca"
        />
      </div>
      <div role="group" aria-label="Filtrar por status" className="flex-1 sm:flex-none min-w-[156px]">
        <FiltroDeLista
          valor={statusFilter}
          onChange={setStatusFilter}
          opcoes={opcoes}
          contagens={contagens}
          testid="cal-status"
          larguraPopover={240}
        />
      </div>
      {/* Celular: "Limpar filtros" desce para depois do seletor (status e visão ficam na mesma linha). */}
      {hasFilters && (
        <div className="pas-entra shrink-0 order-last sm:order-none">
          <LimparFiltros onClick={limparFiltros} testid="cal-limpar-filtros" />
        </div>
      )}
      </>}
      <div className="ml-auto">
        <SeletorDeVisao view={view} setView={setView} />
      </div>
    </div>
  );
}

/**
 * Topo da grade (Mês/Semana): o período por extenso, ‹ Hoje › num grupo só,
 * quantos eventos o período tem e a legenda das cores.
 */
export function CabecalhoDoPeriodo({ s }: { s: CalendarState }) {
  const { view, viewYear, viewMonth, viewWeekStart, prevMonth, nextMonth, prevWeek, nextWeek, goToday, isCurrentMonth, isCurrentWeek, filteredEvents } = s;
  const mes = view === "month";
  const ini = mes ? new Date(viewYear, viewMonth, 1) : viewWeekStart;
  const fim = mes ? new Date(viewYear, viewMonth + 1, 0) : addDays(viewWeekStart, 6);
  const n = eventosNoPeriodo(filteredEvents, ini, fim).length;
  const rotulo = mes ? `${MONTH_NAMES_LOWER[viewMonth]} de ${viewYear}` : rotuloDaSemana(viewWeekStart);
  const ehHoje = mes ? isCurrentMonth : isCurrentWeek;
  const unidade = mes ? "mês" : "semana";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 sm:px-5 py-3 border-b border-border">
      <div className="flex flex-wrap items-baseline gap-x-2.5 min-w-0 flex-1 sm:flex-none">
        {/* `first-letter:uppercase`, não `capitalize`: "Outubro De 2026" virava Title Case. */}
        <h2 className="m-0 min-w-0 text-base font-semibold text-foreground tracking-tight first-letter:uppercase truncate" aria-live="polite" data-testid="cal-periodo">
          {rotulo}
        </h2>
        {!mes && (
          <span className="hidden sm:inline shrink-0 text-xs text-muted-foreground tabular-nums" title="Número da semana no ano (ISO)">
            Semana {isoWeekNumber(viewWeekStart)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-0.5 shrink-0 rounded-lg border border-border p-0.5">
        <button type="button" onClick={mes ? prevMonth : prevWeek} aria-label={mes ? "Mês anterior" : "Semana anterior"} title={`${mes ? "Mês anterior" : "Semana anterior"} (←)`} className={NAV_BTN}>
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        </button>
        <button
          type="button" onClick={goToday} disabled={ehHoje}
          title={ehHoje ? `Você já está ${mes ? "no mês" : "na semana"} de hoje` : "Voltar para hoje (H)"}
          className="pas-alvo h-8 px-2.5 rounded-md text-xs font-medium text-slate-700 hover:bg-muted transition-colors disabled:text-muted-foreground disabled:hover:bg-transparent disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="cal-hoje"
        >
          Hoje
        </button>
        <button type="button" onClick={mes ? nextMonth : nextWeek} aria-label={mes ? "Próximo mês" : "Próxima semana"} title={`${mes ? "Próximo mês" : "Próxima semana"} (→)`} className={NAV_BTN}>
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
      {/* Com zero, quem fala é o aviso logo abaixo da grade (sem repetir). Celular: a contagem desce para baixo do título. */}
      <div className="flex items-center gap-4 basis-full sm:basis-auto sm:ml-auto">
        {(n > 0 || !mes) && (
          <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap" data-testid="cal-contagem-periodo">
            {/* Celular: o número da semana vem aqui, na mesma linha da contagem. */}
            {!mes && <span className="sm:hidden">Semana {isoWeekNumber(viewWeekStart)}{n > 0 && " · "}</span>}
            {n > 0 && <>{n} {n === 1 ? "evento" : "eventos"} {mes ? "no" : "na"} {unidade}</>}
          </span>
        )}
        {n > 0 && <span aria-hidden="true" className="hidden lg:block w-px h-4 bg-border" />}
        <Legenda className="hidden lg:flex" />
      </div>
    </div>
  );
}
