/**
 * Visão Mês do Calendário (25/09 — extraída de pages/calendar.tsx): grade de
 * semanas, faixas de barras (LaneRow), linha "+ N mais" (OverflowRow) e o
 * popover único dos escondidos.
 *
 * 07/10 (redesenho):
 *  - a grade é UMA superfície: as colunas dos dias descem até o fim da semana
 *    (antes os filetes paravam na linha do número e as barras boiavam num
 *    vazio sem colunas); sábado e domingo tingidos, hoje com fundo de marca e
 *    "Hoje" escrito, dias de outro mês esmaecidos;
 *  - barras no desenho dos chips de Eventos (fundo suave, filete na cor do
 *    status no começo, texto alinhado à esquerda); a que vem da semana
 *    anterior ou segue para a próxima fica sem a quina, para o olho ligar;
 *  - três faixas por semana (eram duas) e as semanas crescem até ocupar a
 *    tela — em 1920 o mês inteiro cabe sem rolar;
 *  - "+ N mais" discreto, no dia, com o nome falado ("Ver mais 4 eventos em
 *    16 de outubro"), e não uma faixa cinza que parecia outro evento;
 *  - celular: a agenda do mês (`agenda.tsx`) no lugar de 7 colunas de 50px.
 */
import { useMemo, useState } from "react";
import type { Event } from "@shared/schema";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/use-media-query";
import { computeWeekBars, type EventBar } from "./week-bars";
import { HiddenEventsPopover } from "./hidden-events-popover";
import { Agenda, type LinhaDaAgenda } from "./agenda";
import {
  MONTH_NAMES_LOWER, WEEK_DAY_SHORT, getCfg, getEffectiveStatus, isInRange, isSameDay, nomeFalado, parseLocalDate, posDoAlvo, type SelectEventFn,
} from "./calendar-shared";

const MAX_VISIBLE_LANES = 3;

// Render a single lane row for the event grid
function LaneRow({ lane, bars, onSelectEvent }: { lane: number; bars: EventBar[]; onSelectEvent: SelectEventFn }) {
  const laneBars = bars.filter(b => b.lane === lane).sort((a, b) => a.startCol - b.startCol);
  const items: React.ReactNode[] = [];
  let col = 0;

  for (const bar of laneBars) {
    if (bar.startCol > col) {
      items.push(
        <div key={`sp-${col}`} style={{ gridColumn: `${col + 1} / ${bar.startCol + 1}` }} className="h-[22px]" />
      );
    }
    const cfg = getCfg(getEffectiveStatus(bar.event));
    // Always show name — either from start or repeating at the first visible column
    items.push(
      <button
        key={bar.event.id}
        type="button"
        onClick={(e) => onSelectEvent(bar.event, posDoAlvo(e))}
        style={{ gridColumn: `${bar.startCol + 1} / ${bar.endCol + 2}` }}
        title={`${bar.event.name} · ${bar.event.location}`}
        aria-label={nomeFalado(bar.event)}
        aria-haspopup="dialog"
        data-cal-evento=""
        className={cn(
          "cal-barra h-[22px] min-w-0 flex items-center gap-1.5 text-xs font-medium leading-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:z-[1]",
          cfg.bg, cfg.text,
          bar.isStart ? cn("rounded-l-[5px] ml-1 pl-1.5 border-l-[3px]", cfg.edge) : "rounded-l-none pl-2",
          bar.isEnd ? "rounded-r-[5px] mr-1 pr-2" : "rounded-r-none pr-0",
        )}
      >
        {bar.isStart && cfg.pulse && (
          <span className={cn("w-1.5 h-1.5 rounded-full shrink-0 animate-pulse motion-reduce:animate-none", cfg.dot)} aria-hidden="true" />
        )}
        <span className="truncate">{bar.event.name}</span>
      </button>
    );
    col = bar.endCol + 1;
  }

  if (col < 7) {
    items.push(<div key="sp-end" style={{ gridColumn: `${col + 1} / 8` }} className="h-[22px]" />);
  }

  return <div className="grid grid-cols-7">{items}</div>;
}

type OverflowPopoverState = { day: Date; dayEvents: Event[]; x: number; y: number };

function OverflowRow({ bars, week, allEvents, onOpenPopover }: {
  bars: EventBar[];
  week: Date[];
  allEvents: Event[];
  onOpenPopover: (state: OverflowPopoverState) => void;
}) {
  const hiddenByCol = useMemo(() => {
    const map: Record<number, number> = {};
    bars.filter(b => b.lane >= MAX_VISIBLE_LANES).forEach(b => {
      for (let c = b.startCol; c <= b.endCol; c++) {
        map[c] = (map[c] || 0) + 1;
      }
    });
    return map;
  }, [bars]);

  const hasAny = Object.keys(hiddenByCol).length > 0;
  if (!hasAny) return null;

  function getDayEvents(day: Date): Event[] {
    return allEvents.filter(ev => {
      const start = parseLocalDate(ev.startDate);
      const end = parseLocalDate(ev.endDate);
      return isInRange(day, start, end);
    });
  }

  return (
    <div className="grid grid-cols-7">
      {Array.from({ length: 7 }).map((_, col) => {
        const hiddenCount = hiddenByCol[col];
        if (!hiddenCount) {
          return <div key={col} className="h-5" />;
        }
        const day = week[col];
        return (
          <div key={col} className="px-1 min-w-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const dayEvents = getDayEvents(day);
                onOpenPopover({ day, dayEvents, ...posDoAlvo(e) });
              }}
              aria-label={`Ver mais ${hiddenCount} ${hiddenCount === 1 ? "evento" : "eventos"} em ${day.getDate()} de ${MONTH_NAMES_LOWER[day.getMonth()]}`}
              aria-haspopup="dialog"
              data-testid="cal-mais"
              className="pas-alvo h-5 max-w-full px-1.5 rounded text-2xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              + {hiddenCount} mais
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Semanas do mês (com os dias de borda), cortando a última linha se for só do mês seguinte e sem eventos. */
function buildWeeks(year: number, month: number, events: Event[]): Date[][] {
  const firstDay = new Date(year, month, 1);
  // A grade começa na SEGUNDA (dono, 08/10): sábado e domingo — o fim de
  // semana das provas — ficam juntos no fim da linha, como na Semana.
  const startPad = (firstDay.getDay() + 6) % 7;
  const lastDayNum = new Date(year, month + 1, 0).getDate();

  const allDays: Date[] = [];
  for (let i = 0; i < startPad; i++) {
    allDays.push(new Date(year, month, 1 - startPad + i));
  }
  for (let d = 1; d <= lastDayNum; d++) {
    allDays.push(new Date(year, month, d));
  }
  while (allDays.length % 7 !== 0) {
    const prev = allDays[allDays.length - 1];
    allDays.push(new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1));
  }

  // Trim last row if all are next-month days with no events
  const lastRow = allDays.slice(-7);
  const lastRowAllOtherMonth = lastRow.every(d => d.getMonth() !== month);
  const lastRowHasEvents = lastRow.some(day =>
    events.some(ev => isInRange(day, parseLocalDate(ev.startDate), parseLocalDate(ev.endDate)))
  );
  const trimmedDays = (lastRowAllOtherMonth && !lastRowHasEvents)
    ? allDays.slice(0, -7)
    : allDays;

  const out: Date[][] = [];
  for (let i = 0; i < trimmedDays.length; i += 7) {
    out.push(trimmedDays.slice(i, i + 7));
  }
  return out;
}

/** Agenda do mês (celular): cada evento uma vez, no seu primeiro dia dentro do mês; "Hoje" como marco. */
function linhasDoMes(year: number, month: number, events: Event[]): LinhaDaAgenda[] {
  const ini = new Date(year, month, 1);
  const fim = new Date(year, month + 1, 0);
  const porDia = new Map<number, Event[]>();
  for (const ev of events) {
    const s = parseLocalDate(ev.startDate);
    const e = parseLocalDate(ev.endDate);
    if (e < ini || s > fim) continue;
    const primeiro = s < ini ? ini : s;
    const k = primeiro.getDate();
    if (!porDia.has(k)) porDia.set(k, []);
    porDia.get(k)!.push(ev);
  }
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  if (hoje.getFullYear() === year && hoje.getMonth() === month && !porDia.has(hoje.getDate())) porDia.set(hoje.getDate(), []);
  return Array.from(porDia.keys()).sort((a, b) => a - b).map(k => {
    const dia = new Date(year, month, k);
    const eventos = (porDia.get(k) ?? []).sort((a, b) => a.startDate.localeCompare(b.startDate));
    if (eventos.length > 0) return { dia, eventos };
    // O marco "Hoje" sem evento começando: diz o que está acontecendo (ou que nada está).
    const rolando = events.filter(ev => isInRange(dia, parseLocalDate(ev.startDate), parseLocalDate(ev.endDate))).length;
    return { dia, eventos, nota: rolando === 0 ? "Hoje · nenhum evento" : `Hoje · ${rolando} ${rolando === 1 ? "evento acontecendo" : "eventos acontecendo"}` };
  });
}

export function MonthView({ year, month, events, onSelectEvent, aviso }: {
  year: number; month: number; events: Event[];
  onSelectEvent: SelectEventFn;
  /** Faixa do período vazio (vem da página, que sabe o porquê). */
  aviso?: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Single overflow popover state — only one can be open at a time
  const [overflowPopover, setOverflowPopover] = useState<OverflowPopoverState | null>(null);

  // Wrap onSelectEvent to close any open overflow popover first
  function handleSelectEvent(ev: Event, pos: { x: number; y: number }) {
    setOverflowPopover(null);
    onSelectEvent(ev, pos);
  }

  // Grade + barras são caras (ordenação e parse de datas por semana). Sem memo elas
  // eram recalculadas a cada render — inclusive ao abrir/fechar o popover de overflow.
  const weeks = useMemo(() => buildWeeks(year, month, events), [year, month, events]);
  const weekBars = useMemo(() => weeks.map(week => computeWeekBars(week, events)), [weeks, events]);
  const linhas = useMemo(() => (isMobile ? linhasDoMes(year, month, events) : []), [isMobile, year, month, events]);

  if (isMobile) {
    return (
      <>
        {aviso}
        {linhas.length > 0 && <Agenda linhas={linhas} onSelectEvent={onSelectEvent} testid="cal-agenda-mes" />}
      </>
    );
  }

  return (
    <>
      {aviso}
      <div data-testid="cal-mes">
        {/* Dias da semana */}
        <div className="grid grid-cols-7 border-b border-border bg-surface-muted" aria-hidden="true">
          {WEEK_DAY_SHORT.map((d, i) => (
            <div key={d} className={cn("py-2 text-center text-2xs font-semibold text-muted-foreground uppercase tracking-[0.06em]", i >= 5 && "cal-fds-cab")}>{d}</div>
          ))}
        </div>

        {/* Semanas: o fundo (colunas dos dias) e, por cima, o número e as faixas de barras. */}
        <div style={{ ["--cal-semanas" as string]: weeks.length }}>
          {weeks.map((week, wi) => {
            const bars = weekBars[wi];
            const maxLane = bars.length > 0 ? Math.max(...bars.map(b => b.lane)) : -1;
            const visibleLanes = Math.min(maxLane + 1, MAX_VISIBLE_LANES);
            const hasOverflow = bars.some(b => b.lane >= MAX_VISIBLE_LANES);

            return (
              <div key={wi} className={cn("cal-semana relative", wi > 0 && "border-t border-border")}>
                {/* Fundo: as colunas descem até o fim da semana. */}
                <div className="absolute inset-0 grid grid-cols-7" aria-hidden="true">
                  {week.map((day, di) => {
                    const isToday = isSameDay(day, today);
                    const isWeekend = di >= 5; // Sáb e Dom (grade começa na segunda)
                    return (
                      <div
                        key={di}
                        className={cn(
                          di < 6 && "border-r border-border",
                          isToday ? "bg-brand-soft/60" : isWeekend ? "cal-fds" : "bg-card",
                        )}
                      />
                    );
                  })}
                </div>

                {/* Números dos dias */}
                <div className="relative grid grid-cols-7 h-8 pt-1.5">
                  {week.map((day, di) => {
                    const isCurrentMonth = day.getMonth() === month;
                    const isToday = isSameDay(day, today);
                    return (
                      <div key={di} className="flex items-center justify-between px-2 min-w-0" aria-current={isToday ? "date" : undefined}>
                        <span className={cn(
                          "inline-flex items-center justify-center min-w-6 h-6 rounded-full text-xs tabular-nums",
                          isToday
                            ? "px-1.5 bg-primary text-primary-foreground font-semibold"
                            : isCurrentMonth ? "text-slate-700 font-medium" : "text-muted-foreground/70",
                        )}>
                          {day.getDate()}
                        </span>
                        {isToday && <span className="text-2xs font-semibold text-primary uppercase tracking-[0.06em] truncate">Hoje</span>}
                      </div>
                    );
                  })}
                </div>

                {/* Faixas de barras */}
                <div className="relative pt-1 pb-1.5 space-y-0.5">
                  {Array.from({ length: visibleLanes }).map((_, lane) => (
                    <LaneRow key={lane} lane={lane} bars={bars} onSelectEvent={handleSelectEvent} />
                  ))}
                  {hasOverflow && (
                    <OverflowRow
                      bars={bars}
                      week={week}
                      allEvents={events}
                      // Replace any existing popover — only one at a time
                      onOpenPopover={setOverflowPopover}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Single overflow popover rendered outside the grid — always on top */}
      {overflowPopover && (
        <HiddenEventsPopover
          dayEvents={overflowPopover.dayEvents}
          day={overflowPopover.day}
          x={overflowPopover.x}
          y={overflowPopover.y}
          onSelectEvent={(ev, pos) => { handleSelectEvent(ev, pos); setOverflowPopover(null); }}
          onClose={() => setOverflowPopover(null)}
        />
      )}
    </>
  );
}
