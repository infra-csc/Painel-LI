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
 *
 * 07/10 (redesenho): a regra do recorte saiu para `recortar` — a MESMA função
 * monta a lista e conta quantos eventos cada opção dos filtros deixaria (o
 * número ao lado de cada opção, como em Passagens e Hospedagem). Um contador
 * com cópia própria da regra mentiria na primeira mudança.
 */
import { useCallback, useMemo } from "react";
import type { Event } from "@shared/schema";
import { campo, useUrlState } from "@/lib/use-url-state";
import { getEventStatus, parseLocalDate } from "@/lib/event-status";
import type { SortDir, SortKey, ViewMode } from "./events-shared";

const ORDEM_PADRAO_POR_STATUS = ["em andamento", "planejado", "concluído", "excluído"];

/** O recorte da barra (busca, status, mês, ano) — sem ordenação. */
export interface RecorteDeEventos { q: string; status: string; mes: string; ano: string }

/** A regra do recorte, a mesma de sempre — usada pela lista e pelos contadores. */
export function recortar(events: Event[], r: RecorteDeEventos): Event[] {
  let list = [...events];
  const t = r.q.toLowerCase().trim();
  if (t) list = list.filter(e => e.name.toLowerCase().includes(t) || e.location.toLowerCase().includes(t));
  if (r.status === "default") list = list.filter(e => ["planejado", "em andamento"].includes(getEventStatus(e)));
  else if (r.status === "active") list = list.filter(e => e.status !== "excluído");
  else if (r.status !== "all") list = list.filter(e => getEventStatus(e) === r.status);
  if (r.mes !== "all") list = list.filter(e => { const d = parseLocalDate(e.startDate); return !!d && d.getMonth() + 1 === Number(r.mes); });
  if (r.ano !== "all") list = list.filter(e => { const d = parseLocalDate(e.startDate); return !!d && d.getFullYear() === Number(r.ano); });
  return list;
}

/** Valores do filtro de status — os mesmos do `<select>` de antes (o primeiro é o padrão). */
export const OPCOES_DE_STATUS: { id: string; nome: string }[] = [
  { id: "default", nome: "Planejado + Em andamento" },
  { id: "all", nome: "Todos os status" },
  { id: "active", nome: "Ativos" },
  { id: "planejado", nome: "Planejado" },
  { id: "em andamento", nome: "Em andamento" },
  { id: "concluído", nome: "Concluído" },
  { id: "excluído", nome: "Excluído" },
];

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

  /**
   * Indicador do resumo (07/10): reclicar o aceso volta ao recorte padrão (a
   * mesma ação do "Planejado + Em andamento" no filtro) — um filtro que só
   * liga vira armadilha de mão única. Na Semana/Mês, que não passam pelos
   * filtros, o indicador leva para a lista, onde o recorte tem efeito.
   */
  const escolherDoResumo = useCallback((status: string | null) => {
    const paraALista = f.visao === "week" || f.visao === "calendar" ? { visao: "table" as ViewMode } : {};
    if (status === null) setF({ status: "default", padrao: true, ordem: "eventNumber", dir: "desc", ...paraALista });
    else setF({ status, padrao: false, ...paraALista });
  }, [setF, f.visao]);

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
    const list = recortar(events, { q: f.q, status: f.status, mes: f.mes, ano: f.ano });
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

  /**
   * Quantos eventos cada opção deixaria, mantendo o resto do recorte — o
   * número ao lado de cada opção dos filtros.
   */
  const contagens = useMemo(() => {
    const base: RecorteDeEventos = { q: f.q, status: f.status, mes: f.mes, ano: f.ano };
    const contar = (patch: Partial<RecorteDeEventos>) => recortar(events ?? [], { ...base, ...patch }).length;
    const anos = new Set<string>(["all"]);
    (events ?? []).forEach(e => { const d = parseLocalDate(e.startDate); if (d) anos.add(String(d.getFullYear())); });
    return {
      status: new Map(OPCOES_DE_STATUS.map(o => [o.id, contar({ status: o.id })] as const)),
      mes: new Map(["all", ...Array.from({ length: 12 }, (_, i) => String(i + 1))].map(v => [v, contar({ mes: v })] as const)),
      ano: new Map(Array.from(anos).map(v => [v, contar({ ano: v })] as const)),
    };
  }, [events, f.q, f.status, f.mes, f.ano]);

  return {
    search: f.q, setSearch,
    statusFilter: f.status, setStatusFilter, filterFromCard, escolherDoResumo,
    monthFilter: f.mes, setMonthFilter,
    yearFilter: f.ano, setYearFilter,
    sortKey: f.ordem, sortDir: f.dir, handleSort,
    viewMode: f.visao, setViewMode,
    hasFilters, clearFilters,
    filteredAndSorted, contagens,
  };
}

export type EventsFilters = ReturnType<typeof useEventsFilters>;
