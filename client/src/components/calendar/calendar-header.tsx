/**
 * Cabeçalho do Calendário (25/09 — extraído de pages/calendar.tsx): PageHeader
 * com a navegação de mês/semana em `context` e busca, filtros de status e
 * alternância de visão em `actions`.
 */
import { CalendarDays, ChevronLeft, ChevronRight, Columns3, LayoutGrid, List, Search, X, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { MONTH_NAMES, addDays, isoWeekNumber } from "./calendar-shared";
import type { CalendarState, CalendarView } from "./use-calendar-state";

const SETA = "p-1.5 hover:bg-surface-muted rounded-lg text-muted-foreground transition-colors";
const hojeCls = (ativo: boolean) => `ml-1 px-3 py-1 border rounded-lg text-xs font-bold transition-all ${
  ativo ? "border-primary/25 bg-brand-soft text-primary" : "border-border text-muted-foreground hover:bg-surface-muted"
}`;

function NavegacaoDoPeriodo({ s }: { s: CalendarState }) {
  const { view, viewYear, viewMonth, viewWeekStart, prevMonth, nextMonth, prevWeek, nextWeek, goToday, isCurrentMonth, isCurrentWeek } = s;
  if (view === "month") {
    return (
      <div className="flex items-center gap-1 ml-2 border-l border-border pl-4">
        <button onClick={prevMonth} aria-label="Mês anterior" className={SETA}>
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        </button>
        <span className="text-sm font-bold text-foreground min-w-[140px] text-center">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button onClick={nextMonth} aria-label="Próximo mês" className={SETA}>
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
        <button onClick={goToday} className={hojeCls(isCurrentMonth)}>Hoje</button>
      </div>
    );
  }
  if (view === "week") {
    const weekEnd = addDays(viewWeekStart, 6);
    const sameMonth = viewWeekStart.getMonth() === weekEnd.getMonth();
    const rangeLabel = sameMonth
      ? `${viewWeekStart.getDate()} – ${weekEnd.getDate()} ${MONTH_NAMES[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`
      : `${viewWeekStart.getDate()} ${MONTH_NAMES[viewWeekStart.getMonth()]} – ${weekEnd.getDate()} ${MONTH_NAMES[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;
    return (
      <div className="flex items-center gap-1 ml-2 border-l border-border pl-4">
        <button onClick={prevWeek} aria-label="Semana anterior" className={SETA}>
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        </button>
        <div className="flex items-center gap-2 min-w-[200px] justify-center">
          <span className="text-sm font-bold text-foreground">{rangeLabel}</span>
          <span className="px-2 py-0.5 bg-brand-soft text-primary text-2xs font-bold rounded-full uppercase tracking-wider">
            Sem. {isoWeekNumber(viewWeekStart)}
          </span>
        </div>
        <button onClick={nextWeek} aria-label="Próxima semana" className={SETA}>
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
        <button onClick={goToday} className={hojeCls(isCurrentWeek)}>Hoje</button>
      </div>
    );
  }
  return null;
}

const VISOES: readonly [CalendarView, string, LucideIcon][] = [
  ["month", "Mês", LayoutGrid],
  ["week", "Semana", Columns3],
  ["list", "Lista", List],
];

export function CalendarHeader({ s }: { s: CalendarState }) {
  const { view, setView, searchQuery, setSearchQuery, statusFilter, setStatusFilter, statusCounts, legendItems, isLoading, loadErrorMessage, visibleEvents } = s;
  return (
    <PageHeader
      icon={CalendarDays}
      title="Calendário"
      subtitle={
        <span aria-live="polite">
          {isLoading
            ? "Carregando eventos…"
            : loadErrorMessage
              ? "Contagem indisponível"
              : `${visibleEvents.length} ${visibleEvents.length === 1 ? "evento" : "eventos"} ativos`}
        </span>
      }
      className="items-center bg-card px-5 py-3 rounded-xl shadow-1 border border-border shrink-0"
      context={<NavegacaoDoPeriodo s={s} />}
      actions={<>
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" aria-hidden="true" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar evento…"
            aria-label="Buscar evento por nome ou local"
            className="h-8 pl-8 pr-3 text-xs rounded-xl border border-border bg-surface-muted text-slate-700 placeholder:text-muted-foreground outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/25 transition-all w-40"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} aria-label="Limpar busca" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-slate-600">
              <X className="w-3 h-3" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Status filter pills */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-muted rounded-xl border border-border">
          <span className="text-2xs font-black text-muted-foreground uppercase tracking-widest mr-0.5">Filtros:</span>
          {legendItems.map(item => {
            const count = statusCounts[item.key] || 0;
            const isActive = statusFilter === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setStatusFilter(isActive ? "all" : item.key)}
                aria-pressed={isActive}
                className={`flex items-center gap-1.5 text-2xs font-bold transition-all px-2 py-0.5 rounded-lg ${
                  isActive ? `${item.bg} ${item.text}` : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${item.dot}`} />
                {item.label}
                <span className={`tabular-nums text-2xs ${isActive ? "opacity-70" : "text-muted-foreground"}`}>{count}</span>
              </button>
            );
          })}
          {statusFilter !== "all" && (
            <button onClick={() => setStatusFilter("all")} aria-label="Limpar filtro de status" className="text-2xs text-muted-foreground hover:text-danger-strong font-bold ml-1">
              <X className="w-3 h-3" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-1 bg-muted p-1 rounded-xl">
          {VISOES.map(([k, label, Icone]) => (
            <button
              key={k}
              onClick={() => setView(k)}
              aria-pressed={view === k}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                view === k ? "bg-primary text-primary-foreground shadow-1" : "text-muted-foreground hover:bg-border"
              }`}
            >
              <Icone className="w-3.5 h-3.5" aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
      </>}
    />
  );
}
