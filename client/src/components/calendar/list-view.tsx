/**
 * Visão Lista do Calendário (25/09 — extraída de pages/calendar.tsx): eventos
 * agrupados por mês, do mês atual em diante e depois os passados (mais recente primeiro).
 *
 * 07/10 (redesenho): a agenda. Cada mês é um bloco com as linhas coladas
 * (eram cartões soltos com um quadrado de ícone de 48px — o mesmo relógio
 * para todos os planejados); cada linha tem a folhinha da data de Eventos,
 * nome e local, o período com "começa em 3 dias" e a pílula do status. A
 * linha inteira abre o painel. Os meses passados vêm depois de um marco
 * "Meses anteriores" — antes a ordem pulava de dezembro para setembro sem
 * aviso.
 */
import { useMemo } from "react";
import { CalendarDays, ChevronRight, History, MapPin, SearchX } from "lucide-react";
import type { Event } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { DataTable, type ColunaDaTabela } from "@/components/common/data-table";
import { EventStatusBadge, FolhinhaDeData, quandoAcontece } from "@/components/events/events-shared";
import { cn } from "@/lib/utils";
import { MONTH_NAMES_LOWER, formatListDate, getCfg, getEffectiveStatus, nomeFalado, parseLocalDate, posDoAlvo, type SelectEventFn } from "./calendar-shared";

/** Colunas declaradas para o DataTable (o cartão abaixo é o que aparece). */
const COLUNAS_DA_LISTA: ColunaDaTabela<Event>[] = [
  { key: "evento", header: "Evento", papel: "principal", cell: ev => ev.name },
  { key: "local", header: "Local", cell: ev => ev.location },
  { key: "data", header: "Data", cell: ev => formatListDate(ev.startDate, ev.endDate) },
  { key: "status", header: "Status", cell: ev => getCfg(getEffectiveStatus(ev)).label },
];

function CalendarEventCard({ ev, onSelectEvent }: { ev: Event; onSelectEvent: SelectEventFn }) {
  const ds = getEffectiveStatus(ev);
  const quando = quandoAcontece(ev);
  return (
    <button
      type="button"
      onClick={(e) => onSelectEvent(ev, posDoAlvo(e))}
      aria-label={nomeFalado(ev)}
      aria-haspopup="dialog"
      data-cal-evento=""
      className="cal-linha group w-full text-left flex items-center gap-3 sm:gap-4 px-3.5 sm:px-4 py-3 focus-visible:outline-none"
    >
      <FolhinhaDeData ev={ev} ds={ds} />

      {/* xl+: o local ganha coluna própria (como na tabela de Eventos) — em 1920 sobrava
          um vão de mil pixels entre o nome e o período. */}
      <div className="flex-1 min-w-0 md:grid md:grid-cols-[minmax(0,1fr)_minmax(150px,200px)_128px] xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_168px_128px] md:items-center md:gap-4">
        <div className="min-w-0">
          <p className="m-0 text-sm font-semibold leading-5 text-foreground group-hover:text-primary transition-colors truncate">{ev.name}</p>
          <p className="m-0 mt-0.5 flex xl:hidden items-center gap-1 text-xs leading-[18px] text-muted-foreground min-w-0">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{ev.location}</span>
          </p>
        </div>
        <p className="m-0 hidden xl:flex items-center gap-1.5 text-sm leading-5 text-slate-700 min-w-0">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">{ev.location}</span>
        </p>
        {/* Celular: período e status numa linha só, embaixo do local. */}
        <div className="mt-1.5 md:mt-0 flex items-center gap-2 md:block min-w-0">
          <span className="block text-xs md:text-sm text-foreground tabular-nums whitespace-nowrap">{formatListDate(ev.startDate, ev.endDate)}</span>
          {quando && (
            <span className={cn("block text-xs leading-4 truncate", ds === "em andamento" ? "text-primary font-medium" : "text-muted-foreground")}>
              <span className="md:hidden" aria-hidden="true">· </span>{quando}
            </span>
          )}
        </div>
        <div className="hidden md:flex justify-start">
          <EventStatusBadge ds={ds} />
        </div>
      </div>

      <span aria-hidden="true" title={getCfg(ds).label} className={cn("md:hidden shrink-0 self-start mt-1.5 w-2.5 h-2.5 rounded-full", getCfg(ds).dot)} />
      <ChevronRight className="hidden sm:block w-4 h-4 shrink-0 text-muted-foreground/70 group-hover:text-primary transition-[color,transform] duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
    </button>
  );
}

export function ListView({ events, onSelectEvent, hasFilters, onLimparFiltros }: {
  events: Event[];
  onSelectEvent: SelectEventFn;
  hasFilters: boolean;
  /** Saída do "nenhum resultado". */
  onLimparFiltros?: () => void;
}) {
  const today = new Date();
  const currentMonthNum = today.getFullYear() * 12 + today.getMonth();
  const currentMonthKey = `${today.getFullYear()}-${today.getMonth()}`;

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; key: string; events: Event[] }>();
    for (const ev of events) {
      const d = parseLocalDate(ev.startDate);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!map.has(key)) {
        map.set(key, { label: `${MONTH_NAMES_LOWER[d.getMonth()]} de ${d.getFullYear()}`, key, events: [] });
      }
      map.get(key)!.events.push(ev);
    }
    const allGroups = Array.from(map.values()).map(g => ({
      ...g,
      events: [...g.events].sort(
        (a, b) => parseLocalDate(a.startDate).getTime() - parseLocalDate(b.startDate).getTime()
      ),
    }));

    const toMonthNum = (key: string) => {
      const [y, m] = key.split("-").map(Number);
      return y * 12 + m;
    };

    const current = allGroups.filter(g => toMonthNum(g.key) >= currentMonthNum)
      .sort((a, b) => toMonthNum(a.key) - toMonthNum(b.key));

    const past = allGroups.filter(g => toMonthNum(g.key) < currentMonthNum)
      .sort((a, b) => toMonthNum(b.key) - toMonthNum(a.key)); // mais recente primeiro

    return [...current, ...past];
  }, [events, currentMonthNum]);

  if (grouped.length === 0) {
    const Icone = hasFilters ? SearchX : CalendarDays;
    return (
      <div role="status" className="pas-entra flex flex-col items-center text-center rounded-xl border border-dashed border-border bg-card px-6 py-14" data-testid="cal-lista-vazia">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-muted text-muted-foreground mb-3" aria-hidden="true">
          <Icone className="w-5 h-5" />
        </span>
        <h2 className="m-0 text-base font-semibold text-foreground">
          {hasFilters ? "Nenhum evento com esses filtros" : "Nenhum evento no calendário"}
        </h2>
        <p className="m-0 mt-1.5 max-w-[420px] text-sm leading-relaxed text-muted-foreground">
          {hasFilters
            ? "A busca procura no nome e no local do evento. Tente outro termo ou outro status."
            : "Os eventos planejados, em andamento e concluídos aparecem aqui assim que forem cadastrados."}
        </p>
        {hasFilters && onLimparFiltros && (
          <Button variant="outline" className="mt-5 rounded-lg" onClick={onLimparFiltros}>Limpar filtros</Button>
        )}
      </div>
    );
  }

  const primeiroPassado = grouped.findIndex(g => {
    const [gy, gm] = g.key.split("-").map(Number);
    return gy * 12 + gm < currentMonthNum;
  });

  return (
    <div className="flex flex-col gap-6" data-testid="cal-lista">
      {grouped.map((group, gi) => {
        const isCurrent = group.key === currentMonthKey;
        const [gy, gm] = group.key.split("-").map(Number);
        const isPast = gy * 12 + gm < currentMonthNum;

        return (
          <section key={group.key} aria-labelledby={`cal-mes-${group.key}`} className={cn(isPast && "cal-passado")}>
            {/* Marco entre o que vem e o que já foi: a ordem muda de sentido aqui. */}
            {gi === primeiroPassado && (
              <p className="m-0 mb-4 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <History className="w-3.5 h-3.5" aria-hidden="true" />
                {gi === 0 ? "Nenhum evento daqui para a frente — meses anteriores" : "Meses anteriores"}
                <span aria-hidden="true" className="flex-1 h-px bg-border" />
              </p>
            )}
            <div className="flex items-baseline gap-2 mb-2 px-1">
              <h2 id={`cal-mes-${group.key}`} className="m-0 text-sm font-semibold text-foreground first-letter:uppercase">
                {group.label}
              </h2>
              {isCurrent && (
                <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-primary">Este mês</span>
              )}
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                {group.events.length} {group.events.length === 1 ? "evento" : "eventos"}
              </span>
            </div>

            {/* 28/09: pelo DataTable em `cardMode="always"` — cada mês é uma
                <ul role="list"> nomeada; 07/10: as linhas coladas num bloco só. */}
            <DataTable
              columns={COLUNAS_DA_LISTA}
              rows={group.events}
              getRowId={ev => ev.id}
              caption={`Eventos de ${group.label}`}
              cardMode="always"
              cardListClassName="gap-0 divide-y divide-border rounded-xl border border-border bg-card shadow-1 overflow-hidden"
              cardRender={ev => <CalendarEventCard ev={ev} onSelectEvent={onSelectEvent} />}
            />
          </section>
        );
      })}
    </div>
  );
}
