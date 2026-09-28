/**
 * Eventos — tipos, constantes e helpers compartilhados pelos módulos de
 * components/events/** (28/09, extraídos de pages/events.tsx, que tinha 778
 * linhas com dados, filtros, quatro visualizações e a tabela no mesmo arquivo).
 *
 * STATUS, getEventStatus e parseLocalDate continuam em @/lib/event-status —
 * compartilhados com o Calendário para que status e paleta nunca divirjam.
 */
import { endOfDay, format, isWithinInterval, startOfDay } from "date-fns";
import type { Event } from "@shared/schema";
import { StatusBadge } from "@/components/common/status-badge";
import { STATUS, parseLocalDate } from "@/lib/event-status";

export const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
export const WEEK_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Classe compartilhada dos <select> nativos da barra de filtros. */
export const SELECT_CLASS = "h-8 text-xs px-2 border border-input rounded-md bg-muted/40 text-foreground cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring";
/** Botão-ícone de navegação (mês/semana). */
export const NAV_BTN = "flex items-center justify-center w-8 h-8 rounded-full text-foreground hover:bg-brand-soft transition-colors";
/** Botão-ícone de ação nas linhas. */
export const ACTION_BTN = "flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

export type SortKey = "eventNumber" | "name" | "period" | "status";
export type SortDir = "asc" | "desc";
export type ViewMode = "table" | "list" | "week" | "calendar";

export function formatPeriod(s: string, e: string) {
  const d1 = parseLocalDate(s), d2 = parseLocalDate(e);
  if (!d1 || !d2) return `${s} – ${e}`;
  if (d1.toDateString() === d2.toDateString()) return format(d1, "dd/MM/yy");
  const sm = d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();
  return sm ? `${format(d1, "dd")}–${format(d2, "dd/MM/yy")}` : `${format(d1, "dd/MM")} – ${format(d2, "dd/MM/yy")}`;
}

export function eventsOnDay(events: Event[], day: Date) {
  return events.filter(ev => {
    const start = parseLocalDate(ev.startDate);
    const end = parseLocalDate(ev.endDate);
    if (!start || !end || end < start) return false;
    return isWithinInterval(day, { start: startOfDay(start), end: endOfDay(end) });
  });
}

// StatusBadge único (23/09): o tom vem de lib/event-status (planejado = info,
// em andamento = primary, concluído = success, excluído = neutral).
export function EventStatusBadge({ ds }: { ds: string }) {
  const sc = STATUS[ds] ?? STATUS["planejado"];
  return (
    <StatusBadge tone={sc.tone} dot pulse={sc.pulse}>
      {sc.label}
    </StatusBadge>
  );
}
