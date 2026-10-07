/**
 * Eventos — tipos, constantes e helpers compartilhados pelos módulos de
 * components/events/** (28/09, extraídos de pages/events.tsx, que tinha 778
 * linhas com dados, filtros, quatro visualizações e a tabela no mesmo arquivo).
 *
 * STATUS, getEventStatus e parseLocalDate continuam em @/lib/event-status —
 * compartilhados com o Calendário para que status e paleta nunca divirjam.
 *
 * 07/10 (redesenho): "quando acontece" por extenso (começa em 2 dias, termina
 * amanhã…) e a folhinha de data dos cartões — o que a pessoa procura numa
 * lista de provas é QUANDO, e o dd/MM/yy sozinho obrigava a fazer a conta.
 */
import { differenceInCalendarDays, endOfDay, format, isWithinInterval, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Event } from "@shared/schema";
import { StatusBadge } from "@/components/common/status-badge";
import { STATUS, getEventStatus, parseLocalDate } from "@/lib/event-status";
import { cn } from "@/lib/utils";

export const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
export const WEEK_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Botão-ícone de navegação (mês/semana). */
export const NAV_BTN = "pas-alvo inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-600 hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
/** Botão-ícone de ação nas linhas e cartões (32px; 44px no toque). */
export const ACTION_BTN = "pas-alvo relative z-[1] inline-flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:cursor-not-allowed";

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

/** Quantos dias o evento dura (início e fim contam). `null` com data inválida. */
export function duracaoEmDias(s: string, e: string): number | null {
  const d1 = parseLocalDate(s), d2 = parseLocalDate(e);
  if (!d1 || !d2 || d2 < d1) return null;
  return differenceInCalendarDays(d2, d1) + 1;
}

const emDias = (n: number) => (n >= 60 ? `${Math.round(n / 30)} meses` : `${n} dias`);

/**
 * Quando o evento acontece, relativo a hoje — "começa em 3 dias", "termina
 * amanhã", "terminou há 12 dias". Só apresentação: o status continua vindo
 * de `getEventStatus`. Excluído (e concluído à mão antes das datas) não tem
 * o que dizer.
 */
export function quandoAcontece(ev: Pick<Event, "status" | "startDate" | "endDate">, hoje = new Date()): string | null {
  const ds = getEventStatus(ev);
  if (ds === "excluído") return null;
  const ini = parseLocalDate(ev.startDate), fim = parseLocalDate(ev.endDate);
  if (!ini || !fim) return null;
  const h = startOfDay(hoje);
  const aIni = differenceInCalendarDays(ini, h);
  const aFim = differenceInCalendarDays(fim, h);
  if (aFim < 0) return aFim === -1 ? "terminou ontem" : `terminou há ${emDias(-aFim)}`;
  if (ds === "concluído") return null;
  if (aIni <= 0) return aFim === 0 ? "termina hoje" : aFim === 1 ? "termina amanhã" : `termina em ${emDias(aFim)}`;
  return aIni === 1 ? "começa amanhã" : `começa em ${emDias(aIni)}`;
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

/**
 * Folhinha de data (dia grande + mês abreviado) na cor do status — a âncora
 * visual do cartão: numa lista de provas o olho procura a data primeiro.
 */
export function FolhinhaDeData({ ev, ds, className }: { ev: Pick<Event, "startDate">; ds: string; className?: string }) {
  const d = parseLocalDate(ev.startDate);
  const sc = STATUS[ds] ?? STATUS["planejado"];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex flex-col items-center justify-center w-11 h-12 shrink-0 rounded-lg border leading-none tabular-nums",
        ds === "excluído" ? "bg-surface-muted border-border text-muted-foreground" : cn(sc.tw.bg, sc.tw.border, sc.tw.text),
        className,
      )}
    >
      <span className="text-lg font-semibold tracking-tight">{d ? format(d, "dd") : "—"}</span>
      <span className="mt-0.5 text-2xs font-semibold uppercase tracking-[0.06em] opacity-80">
        {d ? format(d, "MMM", { locale: ptBR }).replace(".", "") : ""}
      </span>
    </span>
  );
}
