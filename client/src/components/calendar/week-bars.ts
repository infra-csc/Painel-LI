/**
 * Barras de eventos de vários dias numa semana do Mês (25/09 — extraído de
 * pages/calendar.tsx). Função pura: recebe os 7 dias e os eventos e devolve as
 * barras já distribuídas em faixas (lanes), sem sobreposição.
 */
import type { Event } from "@shared/schema";
import { dayCount, parseLocalDate } from "./calendar-shared";

export type EventBar = {
  event: Event;
  startCol: number;
  endCol: number;
  lane: number;
  isStart: boolean;
  isEnd: boolean;
};

export function computeWeekBars(week: Date[], events: Event[]): EventBar[] {
  const weekStart = new Date(week[0]); weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(week[6]); weekEnd.setHours(23, 59, 59, 999);

  // Deduplicate by ID before processing
  const seenIds = new Set<string>();
  const overlapping = events.filter(ev => {
    if (seenIds.has(ev.id)) return false;
    seenIds.add(ev.id);
    const s = parseLocalDate(ev.startDate);
    const e = parseLocalDate(ev.endDate);
    return s <= weekEnd && e >= weekStart;
  });

  overlapping.sort((a, b) => {
    const as = parseLocalDate(a.startDate).getTime();
    const bs = parseLocalDate(b.startDate).getTime();
    if (as !== bs) return as - bs;
    const al = dayCount(a.startDate, a.endDate);
    const bl = dayCount(b.startDate, b.endDate);
    return bl - al;
  });

  const bars: EventBar[] = [];
  const lanesFreeAfter: Date[] = [];

  for (const ev of overlapping) {
    const s = parseLocalDate(ev.startDate);
    const e = parseLocalDate(ev.endDate);

    const startCol = s < weekStart ? 0 : s.getDay();
    const endCol = e > weekEnd ? 6 : e.getDay();
    const isStart = s >= weekStart;
    const isEnd = e <= weekEnd;

    let lane = -1;
    for (let l = 0; l < lanesFreeAfter.length; l++) {
      if (lanesFreeAfter[l] < s || (s <= weekStart && lanesFreeAfter[l] < weekStart)) {
        lane = l;
        break;
      }
    }
    if (lane === -1) lane = lanesFreeAfter.length;
    lanesFreeAfter[lane] = e > weekEnd ? weekEnd : new Date(e.getTime() + 1);

    bars.push({ event: ev, startCol, endCol, lane, isStart, isEnd });
  }

  return bars;
}
