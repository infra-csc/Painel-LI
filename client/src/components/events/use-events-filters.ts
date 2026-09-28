/**
 * Filtros, ordenação e visualização de Eventos — na URL (28/09).
 *
 * Antes tudo era `useState` em pages/events.tsx: abrir um evento e voltar
 * perdia busca, status e a visualização escolhida. Agora vive na query string
 * via `useUrlState` (como Usuários, Funções e Flash): a URL fica copiável e o
 * botão Voltar devolve o mesmo recorte. Só o que difere do padrão é escrito.
 *
 * `padrao` (booleano) marca a ordenação padrão da tela — por status (em
 * andamento → planejado → concluído → excluído) e data — que vale até a pessoa
 * clicar num cabeçalho ou num cartão de indicador.
 */
import { useCallback, useMemo } from "react";
import type { Event } from "@shared/schema";
import { campo, useUrlState } from "@/lib/use-url-state";
import { getEventStatus, parseLocalDate } from "@/lib/event-status";
import type { SortDir, SortKey, ViewMode } from "./events-shared";

const ORDEM_PADRAO_POR_STATUS = ["em andamento", "planejado", "concluído", "excluído"];

export function useEventsFilters(events: Event[] | undefined) {
  const [f, setF] = useUrlState({
    q: campo.texto(""),
    status: campo.texto("default"),
    mes: campo.texto("all"),
    ano: campo.texto("all"),
    ordem: campo.opcao<SortKey>("eventNumber"),
    dir: campo.opcao<SortDir>("desc"),
    padrao: campo.booleano(true),
    visao: campo.opcao<ViewMode>("table"),
  });

  const setSearch = useCallback((q: string) => setF({ q }), [setF]);
  const setMonthFilter = useCallback((mes: string) => setF({ mes }), [setF]);
  const setYearFilter = useCallback((ano: string) => setF({ ano }), [setF]);
  const setViewMode = useCallback((visao: ViewMode) => setF({ visao }), [setF]);

  /** Select de status: voltar ao padrão também restaura a ordenação padrão. */
  const setStatusFilter = useCallback((status: string) => {
    if (status === "default") setF({ status, padrao: true, ordem: "eventNumber", dir: "desc" });
    else setF({ status });
  }, [setF]);

  /** Cartão de indicador: filtra e sai da ordenação padrão (como sempre foi). */
  const filterFromCard = useCallback((status: string) => setF({ status, padrao: false }), [setF]);

  const handleSort = useCallback((col: SortKey) => {
    setF(prev => prev.ordem === col
      ? { ...prev, padrao: false, dir: prev.dir === "asc" ? "desc" : "asc" }
      : { ...prev, padrao: false, ordem: col, dir: "asc" });
  }, [setF]);

  const hasFilters = !!(f.q || f.status !== "default" || f.mes !== "all" || f.ano !== "all");
  const clearFilters = useCallback(
    () => setF({ q: "", status: "default", mes: "all", ano: "all", ordem: "eventNumber", dir: "desc", padrao: true }),
    [setF],
  );

  const filteredAndSorted = useMemo(() => {
    if (!events) return [];
    let list = [...events];
    const t = f.q.toLowerCase().trim();
    if (t) list = list.filter(e => e.name.toLowerCase().includes(t) || e.location.toLowerCase().includes(t));
    if (f.status === "default") list = list.filter(e => ["planejado", "em andamento"].includes(getEventStatus(e)));
    else if (f.status === "active") list = list.filter(e => e.status !== "excluído");
    else if (f.status !== "all") list = list.filter(e => getEventStatus(e) === f.status);
    if (f.mes !== "all") list = list.filter(e => { const d = parseLocalDate(e.startDate); return !!d && d.getMonth() + 1 === Number(f.mes); });
    if (f.ano !== "all") list = list.filter(e => { const d = parseLocalDate(e.startDate); return !!d && d.getFullYear() === Number(f.ano); });
    if (f.padrao) {
      list.sort((a, b) => {
        const d = ORDEM_PADRAO_POR_STATUS.indexOf(getEventStatus(a)) - ORDEM_PADRAO_POR_STATUS.indexOf(getEventStatus(b));
        if (d !== 0) return d;
        return (parseLocalDate(a.startDate)?.getTime() ?? 0) - (parseLocalDate(b.startDate)?.getTime() ?? 0);
      });
    } else {
      list.sort((a, b) => {
        let va: string | number, vb: string | number;
        if (f.ordem === "eventNumber") { va = a.eventNumber ?? 0; vb = b.eventNumber ?? 0; }
        else if (f.ordem === "name") { va = a.name; vb = b.name; }
        else if (f.ordem === "period") { va = a.startDate; vb = b.startDate; }
        else { va = getEventStatus(a); vb = getEventStatus(b); }
        if (va < vb) return f.dir === "asc" ? -1 : 1;
        if (va > vb) return f.dir === "asc" ? 1 : -1;
        return 0;
      });
    }
    return list;
  }, [events, f.q, f.status, f.mes, f.ano, f.ordem, f.dir, f.padrao]);

  return {
    search: f.q, setSearch,
    statusFilter: f.status, setStatusFilter, filterFromCard,
    monthFilter: f.mes, setMonthFilter,
    yearFilter: f.ano, setYearFilter,
    sortKey: f.ordem, sortDir: f.dir, handleSort,
    viewMode: f.visao, setViewMode,
    hasFilters, clearFilters,
    filteredAndSorted,
  };
}

export type EventsFilters = ReturnType<typeof useEventsFilters>;
