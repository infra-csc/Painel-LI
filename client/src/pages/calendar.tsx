/**
 * Calendário de eventos — visões Mês, Semana e Lista, com painel de detalhe.
 *
 * Desde 25/09 a página só compõe (tinha 1.335 linhas): estado e navegação em
 * `components/calendar/use-calendar-state`, cabeçalho em `calendar-header`,
 * cada visão no seu arquivo (`month-view`, `week-view`, `list-view`), o painel
 * do evento em `event-panel` e as barras da semana em `week-bars` (função pura).
 */
import { AlertTriangle } from "lucide-react";
import { usePageTitle } from "@/components/common/use-page-title";
import { useCalendarState } from "@/components/calendar/use-calendar-state";
import { CalendarHeader } from "@/components/calendar/calendar-header";
import { MonthView } from "@/components/calendar/month-view";
import { WeekView } from "@/components/calendar/week-view";
import { ListView } from "@/components/calendar/list-view";
import { EventPanel } from "@/components/calendar/event-panel";

export default function CalendarPage() {
  usePageTitle("Calendário");
  const s = useCalendarState();
  const { view, viewYear, viewMonth, viewWeekStart, filteredEvents, handleSelectEvent, isLoading, loadErrorMessage, statusFilter, searchQuery, selectedEvent, setSelectedEvent, clickPos } = s;

  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-48px)] lg:h-[calc(100vh-64px)] max-w-6xl mx-auto">
      {/* Cabeçalho padrão (23/09): PageHeader no lugar do h1 manual; navegação de
          mês/semana entra como `context`, busca/filtros/visão como `actions`. */}
      <CalendarHeader s={s} />

      {/* ── Calendar / Week / List ── */}
      <div className="flex-1 min-h-0">
        {isLoading ? (
          <div className="h-full bg-card rounded-xl border border-border flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" role="status" aria-label="Carregando calendário" />
          </div>
        ) : loadErrorMessage ? (
          <div
            role="alert"
            className="h-full bg-card rounded-xl border border-warning/25 flex flex-col items-center justify-center gap-3 text-center px-6"
          >
            <div className="w-14 h-14 rounded-xl bg-warning-soft flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-warning-strong" aria-hidden="true" />
            </div>
            <p className="text-sm font-semibold text-slate-700">Não foi possível carregar o calendário</p>
            <p className="text-xs text-muted-foreground max-w-sm">{loadErrorMessage}</p>
          </div>
        ) : view === "month" ? (
          <MonthView year={viewYear} month={viewMonth} events={filteredEvents} onSelectEvent={handleSelectEvent} />
        ) : view === "week" ? (
          <WeekView weekStart={viewWeekStart} events={filteredEvents} onSelectEvent={handleSelectEvent} />
        ) : (
          <div className="h-full overflow-y-auto">
            <ListView
              events={filteredEvents}
              onSelectEvent={handleSelectEvent}
              hasFilters={statusFilter !== "all" || searchQuery.trim() !== ""}
            />
          </div>
        )}
      </div>

      {/* ── Event detail panel ── */}
      {selectedEvent && (
        <EventPanel event={selectedEvent} onClose={() => setSelectedEvent(null)} clickPos={clickPos} />
      )}
    </div>
  );
}
