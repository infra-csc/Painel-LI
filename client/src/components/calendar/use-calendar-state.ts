/**
 * Estado do Calendário (25/09 — extraído de pages/calendar.tsx): visão,
 * mês/semana, status e busca na URL; navegação; consulta de eventos; recorte e
 * contadores por status; evento aberto no painel.
 *
 * 07/10 (redesenho): só navegação e apresentação a mais — "Tentar novamente"
 * (refetch), "Limpar filtros", ir direto ao período de um evento (a saída do
 * período vazio) e o próximo/último evento em relação a uma data. A consulta,
 * o recorte por status e a regra de status não mudaram.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Event } from "@shared/schema";
import { apiErrorMessage, apiErrorStatus } from "@/lib/api-error";
import { STATUS } from "@/lib/event-status";
import { campo, useUrlState } from "@/lib/use-url-state";
import { VISIBLE_STATUSES, addDays, getEffectiveStatus, getWeekStart } from "./calendar-shared";

export type CalendarView = "month" | "week" | "list";

export function useCalendarState() {
  const today = new Date();
  // Visão, mês/semana, status e busca na URL (23/09): voltar para o calendário
  // devolve o mesmo mês e o mesmo recorte; o link copiado também.
  const [urlState, setUrlState] = useUrlState({
    visao: campo.opcao<CalendarView>("month"),
    mes: campo.texto(""),      // AAAA-MM
    semana: campo.texto(""),   // AAAA-MM-DD (segunda-feira)
    status: campo.texto("all"),
    q: campo.texto(""),
  });
  const view = urlState.visao;
  const setView = (v: CalendarView) => setUrlState({ visao: v });
  // 25/09: as duas expressões tinham perdido a barra do `\d` numa substituição
  // automática (casavam a letra "d") e a visão caía sempre em hoje. Corrigido.
  const { viewYear, viewMonth } = useMemo(() => {
    const m = /^(\d{4})-(\d{2})$/.exec(urlState.mes);
    return m ? { viewYear: Number(m[1]), viewMonth: Number(m[2]) - 1 } : { viewYear: today.getFullYear(), viewMonth: today.getMonth() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlState.mes]);
  const viewWeekStart = useMemo(() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(urlState.semana);
    return m ? getWeekStart(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : getWeekStart(new Date());
  }, [urlState.semana]);
  const mesNaUrl = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, "0")}`;
  const diaNaUrl = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [clickPos, setClickPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const statusFilter = urlState.status;
  const setStatusFilter = (v: string) => setUrlState({ status: v });
  const searchQuery = urlState.q;
  const setSearchQuery = (v: string) => setUrlState({ q: v });

  function handleSelectEvent(e: Event, pos: { x: number; y: number }) {
    setClickPos(pos);
    setSelectedEvent(e);
  }

  const { data: events = [], isLoading, isError, error, refetch, isFetching } = useQuery<Event[]>({ queryKey: ["/api/events"] });

  // Sem isso, uma sessão expirada ou queda de rede viravam "0 eventos" —
  // um calendário vazio indistinguível de uma agenda realmente vazia.
  const loadErrorMessage = (() => {
    if (!isError) return null;
    if (apiErrorStatus(error) === 401) return "Sua sessão expirou. Entre novamente para ver os eventos.";
    return apiErrorMessage(error, "Não foi possível carregar os eventos. Verifique sua conexão e tente novamente.");
  })();

  // Only show concluido / em_andamento / planejado — never cancelled/deleted/inactive
  const visibleEvents = useMemo(() =>
    events.filter(ev => VISIBLE_STATUSES.has(getEffectiveStatus(ev))),
    [events]
  );

  const filteredEvents = useMemo(() => {
    let result = visibleEvents;
    if (statusFilter !== "all") {
      result = result.filter(ev => getEffectiveStatus(ev) === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(ev =>
        ev.name.toLowerCase().includes(q) || ev.location.toLowerCase().includes(q)
      );
    }
    return result;
  }, [visibleEvents, statusFilter, searchQuery]);

  function prevMonth() {
    setUrlState({ mes: viewMonth === 0 ? mesNaUrl(viewYear - 1, 11) : mesNaUrl(viewYear, viewMonth - 1) });
  }
  function nextMonth() {
    setUrlState({ mes: viewMonth === 11 ? mesNaUrl(viewYear + 1, 0) : mesNaUrl(viewYear, viewMonth + 1) });
  }
  function goToday() {
    // Vazio = hoje: a URL fica limpa quando se está no mês/semana corrente.
    setUrlState({ mes: "", semana: "" });
  }
  /** Leva Mês e Semana ao período que contém `d` (saída do período vazio). Vazio = o corrente. */
  function irParaDia(d: Date) {
    const mesCorrente = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
    const semana = getWeekStart(d);
    setUrlState({
      mes: mesCorrente ? "" : mesNaUrl(d.getFullYear(), d.getMonth()),
      semana: semana.getTime() === getWeekStart(today).getTime() ? "" : diaNaUrl(semana),
    });
  }
  function prevWeek() { setUrlState({ semana: diaNaUrl(addDays(viewWeekStart, -7)) }); }
  function nextWeek() { setUrlState({ semana: diaNaUrl(addDays(viewWeekStart, 7)) }); }

  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();
  const currentWeekStart = getWeekStart(today);
  const isCurrentWeek = viewWeekStart.getTime() === currentWeekStart.getTime();

  // Counts based on visible events only (excludes cancelled/deleted/inactive)
  const statusCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const ev of visibleEvents) { const s = getEffectiveStatus(ev); map[s] = (map[s] || 0) + 1; }
    return map;
  }, [visibleEvents]);

  const hasFilters = statusFilter !== "all" || searchQuery.trim() !== "";
  function limparFiltros() { setUrlState({ status: "all", q: "" }); }

  // Eventos do recorte em ordem de início — para "Próximo evento: …" no período vazio.
  const ordenados = useMemo(
    () => [...filteredEvents].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [filteredEvents],
  );
  /** O primeiro evento que começa depois de `d` (ou `null`). */
  function proximoDepois(d: Date): Event | null {
    const ref = diaNaUrl(d);
    return ordenados.find(ev => ev.startDate > ref) ?? null;
  }
  /** O evento que terminou mais perto antes de `d` (ou `null`). */
  function ultimoAntes(d: Date): Event | null {
    const ref = diaNaUrl(d);
    let achado: Event | null = null;
    for (const ev of ordenados) if (ev.endDate < ref && (!achado || ev.endDate > achado.endDate)) achado = ev;
    return achado;
  }

  const legendItems = (["concluído", "em andamento", "planejado"] as const).map(key => ({
    key, label: STATUS[key].label, ...STATUS[key].tw,
  }));

  return {
    view, setView, viewYear, viewMonth, viewWeekStart, selectedEvent, setSelectedEvent, clickPos,
    statusFilter, setStatusFilter, searchQuery, setSearchQuery, handleSelectEvent,
    isLoading, loadErrorMessage, visibleEvents, filteredEvents, refetch, isFetching,
    prevMonth, nextMonth, goToday, prevWeek, nextWeek, isCurrentMonth, isCurrentWeek, statusCounts, legendItems,
    hasFilters, limparFiltros, irParaDia, proximoDepois, ultimoAntes,
  };
}

export type CalendarState = ReturnType<typeof useCalendarState>;
