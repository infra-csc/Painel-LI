/**
 * Calendário — configuração de status, datas e peças comuns às três visões
 * (25/09, extraídos de pages/calendar.tsx).
 *
 * Cores/labels e a regra de status vêm de @/lib/event-status — a MESMA fonte da
 * tela de Eventos. Aqui só fica o mapeamento de ícone (lucide) por status.
 */
import { useEffect, useRef } from "react";
import { Ban, CalendarDays, CheckCircle, Clock, Play } from "lucide-react";
import type { Event } from "@shared/schema";
import { getEventStatus, statusStyle, parseLocalDate as parseLocalDateOrNull } from "@/lib/event-status";

const STATUS_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  "concluído": CheckCircle,
  "em andamento": Play,
  "planejado": Clock,
  "excluído": Ban,
};

// Only these statuses are shown in the calendar
export const VISIBLE_STATUSES = new Set(["concluído", "em andamento", "planejado"]);

export function getCfg(status: string) {
  const s = statusStyle(status);
  return { ...s.tw, label: s.label, icon: STATUS_ICON[status] ?? Clock, pulse: s.pulse };
}

// Mesma regra da tela de Eventos (respeita `events.status` manual quando o
// evento ainda não começou; datas decidem "em andamento"/"concluído").
export const getEffectiveStatus = getEventStatus;

export type SelectEventFn = (e: Event, pos: { x: number; y: number }) => void;

// ─── Foco de diálogos flutuantes ─────────────────────────────────────────────
// Foca o painel ao abrir e devolve o foco ao elemento que o abriu ao fechar.
export function useDialogFocus<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => { opener?.focus?.(); };
  }, []);
  return ref;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

// Datas de evento são obrigatórias no schema; o fallback evita NaN caso venha vazio.
export function parseLocalDate(str: string): Date {
  return parseLocalDateOrNull(str) ?? new Date(NaN);
}

export function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

export function isInRange(day: Date, start: Date, end: Date) {
  const d = day.getTime();
  return d >= start.getTime() && d <= end.getTime();
}

export function formatDateRange(startStr: string, endStr: string) {
  const s = parseLocalDate(startStr);
  const e = parseLocalDate(endStr);
  const monthName = (d: Date) => d.toLocaleDateString("pt-BR", { month: "long" });
  const year = (d: Date) => d.getFullYear();
  if (isSameDay(s, e)) {
    return `${s.getDate()} de ${monthName(s)} de ${year(s)}`;
  }
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()} a ${e.getDate()} de ${monthName(s)} de ${year(s)}`;
  }
  if (s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()} de ${monthName(s)} a ${e.getDate()} de ${monthName(e)} de ${year(s)}`;
  }
  return `${s.getDate()} de ${monthName(s)} de ${year(s)} a ${e.getDate()} de ${monthName(e)} de ${year(e)}`;
}

export function dayCount(startStr: string, endStr: string) {
  const s = parseLocalDate(startStr);
  const e = parseLocalDate(endStr);
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
}

export function formatListDate(startStr: string, endStr: string): string {
  const start = parseLocalDate(startStr);
  const end = parseLocalDate(endStr);
  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString("pt-BR", opts);
  if (isSameDay(start, end)) {
    return fmt(start, { day: "numeric", month: "short" });
  }
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()} a ${fmt(end, { day: "numeric", month: "short" })}`;
  }
  return `${fmt(start, { day: "numeric", month: "short" })} a ${fmt(end, { day: "numeric", month: "short" })}`;
}

export const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];
export const MONTH_NAMES_LOWER = [
  "janeiro","fevereiro","março","abril","maio","junho",
  "julho","agosto","setembro","outubro","novembro","dezembro",
];

// ─── Week helpers ─────────────────────────────────────────────────────────────

// Semana ISO: começa na segunda-feira (getDay(): 0=Dom … 6=Sáb).
export function getWeekStart(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  const offset = (copy.getDay() + 6) % 7; // Seg=0 … Dom=6
  copy.setDate(copy.getDate() - offset);
  return copy;
}

export function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

export function isoWeekNumber(d: Date): number {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// Segunda → Domingo (semana ISO)
export const WEEK_DAY_SHORT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
export const WEEK_DAY_LONG = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

// ─── Empty state (Mês/Semana) ─────────────────────────────────────────────────

export function CalendarEmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center" role="status">
      <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
        <CalendarDays className="w-6 h-6 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-slate-600">Nenhum evento {label}</p>
      <p className="text-xs text-muted-foreground">Use as setas para navegar ou ajuste os filtros.</p>
    </div>
  );
}
