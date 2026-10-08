/**
 * Visão Semana do Calendário (25/09 — extraída de pages/calendar.tsx): sete
 * colunas em md+ e lista vertical por dia no celular.
 *
 * 07/10 (redesenho): cabeçalho do dia numa linha (SEG 5, hoje no círculo de
 * marca), sábado e domingo tingidos, e o chip de Eventos com nome, local e
 * "Dia 2 de 4" (o evento de vários dias repetia o mesmo cartão em cada coluna
 * sem dizer em que dia dele se estava). A coluna vazia fica vazia — o "–"
 * solto no meio parecia dado. Celular: a agenda da semana (`agenda.tsx`).
 * A agenda também entra quando a LARGURA ÚTIL não comporta sete colunas
 * legíveis (tablet, notebook de 1024 com o menu aberto): com ~100px por dia o
 * nome quebrava em "Internacio-nal" e o local virava "Ibirapue…".
 */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Event } from "@shared/schema";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/use-media-query";
import { Agenda } from "./agenda";
import { ChipDoEvento, WEEK_DAY_LONG, WEEK_DAY_SHORT, addDays, type SelectEventFn } from "./calendar-shared";

/** Abaixo disto (≈120px por dia) a semana vira agenda. */
const LARGURA_MIN_COLUNAS = 840;

export function WeekView({ weekStart, events, onSelectEvent, aviso }: {
  weekStart: Date;
  events: Event[];
  onSelectEvent: SelectEventFn;
  /** Faixa do período vazio (vem da página, que sabe o porquê). */
  aviso?: React.ReactNode;
}) {
  const celular = useIsMobile();
  // Largura medida antes de pintar (com `useEffect` a grade piscava antes de virar agenda).
  const ref = useRef<HTMLDivElement | null>(null);
  const [largura, setLargura] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setLargura(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(([e]) => setLargura(e.contentRect.width));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  // `largura` 0 = ainda não medida (ou ambiente sem layout): fica a grade.
  const estreita = celular || (!!largura && largura < LARGURA_MIN_COLUNAS);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const eventsPerDay = useMemo(() => days.map(day => {
    const dayStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    return events
      .filter(ev => ev.startDate <= dayStr && ev.endDate >= dayStr)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }), [days, events]);

  // Índices Seg=0 … Dom=6 → fim de semana = 5 e 6
  const isWeekend = (i: number) => i === 5 || i === 6;

  return (
    <div ref={ref}>
      {aviso}
      {estreita ? (
        <Agenda linhas={days.map((dia, i) => ({ dia, eventos: eventsPerDay[i] }))} onSelectEvent={onSelectEvent} porDia testid="cal-agenda-semana" />
      ) : (
        <div className="grid grid-cols-7" data-testid="cal-semana">
          {days.map((day, i) => {
            const isToday = day.getTime() === today.getTime();
            const dayEvents = eventsPerDay[i];
            return (
              <section
                key={i}
                aria-label={`${WEEK_DAY_LONG[i]}, ${day.getDate()}: ${dayEvents.length === 0 ? "nenhum evento" : `${dayEvents.length} ${dayEvents.length === 1 ? "evento" : "eventos"}`}`}
                aria-current={isToday ? "date" : undefined}
                className={cn(
                  "flex flex-col min-w-0",
                  i < 6 && "border-r border-border",
                  isToday ? "bg-brand-soft/40" : isWeekend(i) && "cal-fds",
                )}
              >
                {/* Cabeçalho do dia */}
                <div className={cn("flex items-center justify-center gap-2 py-2.5 px-2 border-b border-border", isToday ? "bg-brand-soft/70" : isWeekend(i) ? "cal-fds-cab" : "bg-surface-muted")}>
                  <span className={cn("text-2xs font-semibold uppercase tracking-[0.06em]", isToday ? "text-primary" : "text-muted-foreground")}>
                    {WEEK_DAY_SHORT[i]}
                  </span>
                  <span className={cn(
                    "inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-semibold tabular-nums",
                    isToday ? "bg-primary text-primary-foreground" : "text-foreground",
                  )}>
                    {day.getDate()}
                  </span>
                </div>
                {/* Chips */}
                <div className="cal-semana-corpo flex-1 p-1.5 flex flex-col gap-1">
                  {dayEvents.map(ev => <ChipDoEvento key={ev.id} ev={ev} onSelect={onSelectEvent} dia={day} />)}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
