/**
 * Calendário — configuração de status, datas e peças comuns às três visões
 * (25/09, extraídos de pages/calendar.tsx).
 *
 * Cores/labels e a regra de status vêm de @/lib/event-status — a MESMA fonte da
 * tela de Eventos. Aqui só fica o mapeamento de ícone (lucide) por status.
 *
 * 07/10 (redesenho): o chip do evento (o mesmo desenho em Semana, agenda do
 * celular e "+N mais"), a legenda das cores, o aviso do período vazio com a
 * saída ("Ir para novembro"), o ponto de ancoragem do painel que também vale
 * para o teclado (Enter num chip mandava o painel para o canto da tela) e o
 * foco preso dentro dos painéis flutuantes.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Ban, CalendarDays, CheckCircle, Clock, MapPin, Play, SearchX } from "lucide-react";
import type { Event } from "@shared/schema";
import { STATUS, getEventStatus, statusStyle, parseLocalDate as parseLocalDateOrNull } from "@/lib/event-status";
import { cn } from "@/lib/utils";

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

/**
 * Onde o painel do evento deve nascer. Com o mouse, o ponto do clique; pelo
 * teclado (Enter/Espaço o `clientX/Y` vem 0,0) o centro do próprio chip —
 * antes o painel abria colado no canto superior esquerdo.
 */
export function posDoAlvo(e: React.MouseEvent<HTMLElement>): { x: number; y: number } {
  if (e.detail > 0 && (e.clientX || e.clientY)) return { x: e.clientX, y: e.clientY };
  const r = e.currentTarget.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// ─── Foco de diálogos flutuantes ─────────────────────────────────────────────
// Foca o painel ao abrir, prende o Tab dentro dele (é `aria-modal`) e devolve
// o foco ao elemento que o abriu ao fechar.
export function useDialogFocus<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const el = ref.current;
    el?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Tab" || !el) return;
      const focaveis = Array.from(el.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])"));
      if (focaveis.length === 0) { e.preventDefault(); return; }
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      const ativo = document.activeElement;
      if (e.shiftKey && (ativo === primeiro || ativo === el)) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && ativo === ultimo) { e.preventDefault(); primeiro.focus(); }
      else if (!el.contains(ativo)) { e.preventDefault(); primeiro.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); opener?.focus?.(); };
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
/** Domingo → Sábado (grade do Mês). */
export const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];
export const MONTH_NAMES_LOWER = [
  "janeiro","fevereiro","março","abril","maio","junho",
  "julho","agosto","setembro","outubro","novembro","dezembro",
];
const MONTH_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "Sexta, 16 de outubro" — cabeçalho de um dia (popover, agenda). */
export function diaPorExtenso(d: Date) {
  return `${WEEKDAY_LABELS[d.getDay()]}, ${d.getDate()} de ${MONTH_NAMES_LOWER[d.getMonth()]}`;
}

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

/** Rótulo da semana: "5–11 de outubro de 2026" ou "28 set – 4 out de 2026". */
export function rotuloDaSemana(inicio: Date) {
  const fim = addDays(inicio, 6);
  if (inicio.getMonth() === fim.getMonth()) {
    return `${inicio.getDate()}–${fim.getDate()} de ${MONTH_NAMES_LOWER[fim.getMonth()]} de ${fim.getFullYear()}`;
  }
  const ano = inicio.getFullYear() === fim.getFullYear() ? "" : ` de ${inicio.getFullYear()}`;
  return `${inicio.getDate()} ${MONTH_SHORT[inicio.getMonth()]}${ano} – ${fim.getDate()} ${MONTH_SHORT[fim.getMonth()]} de ${fim.getFullYear()}`;
}

/** Eventos que tocam o intervalo [ini, fim] (dias inteiros). */
export function eventosNoPeriodo(events: Event[], ini: Date, fim: Date): Event[] {
  const a = new Date(ini); a.setHours(0, 0, 0, 0);
  const b = new Date(fim); b.setHours(23, 59, 59, 999);
  return events.filter(ev => {
    const s = parseLocalDate(ev.startDate);
    const e = parseLocalDate(ev.endDate);
    return s <= b && e >= a;
  });
}

/** Nome falado do chip: "Maratona X, 6 a 9 de outubro de 2026, Em andamento". */
export function nomeFalado(ev: Event) {
  return `${ev.name}, ${formatDateRange(ev.startDate, ev.endDate)}, ${getCfg(getEffectiveStatus(ev)).label}`;
}

// ─── Chip do evento ──────────────────────────────────────────────────────────

/**
 * O chip de um evento — o mesmo desenho dos chips de Eventos (fundo suave,
 * filete na cor do status, texto na cor do status). `dia` diz em que dia do
 * evento o chip está ("Dia 2 de 4") — na Semana, em vez de repetir o período.
 */
export function ChipDoEvento({ ev, onSelect, dia, className }: {
  ev: Event;
  onSelect: SelectEventFn;
  dia?: Date;
  className?: string;
}) {
  const cfg = getCfg(getEffectiveStatus(ev));
  const total = dayCount(ev.startDate, ev.endDate);
  const nDoDia = dia ? Math.round((dia.getTime() - parseLocalDate(ev.startDate).getTime()) / 86400000) + 1 : null;
  const quando = nDoDia && total > 1 ? `Dia ${nDoDia} de ${total}` : formatListDate(ev.startDate, ev.endDate);
  return (
    <button
      type="button"
      onClick={(e) => onSelect(ev, posDoAlvo(e))}
      aria-label={nomeFalado(ev)}
      aria-haspopup="dialog"
      data-cal-evento=""
      className={cn(
        "cal-chip block w-full min-w-0 text-left rounded-md border-l-[3px] px-2 py-1.5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        cfg.bg, cfg.text, cfg.edge,
        className,
      )}
    >
      <span className="text-xs font-semibold leading-4 line-clamp-3 break-words">{ev.name}</span>
      {ev.location && (
        <span className="mt-1 flex items-center gap-1 text-2xs leading-4 opacity-80 min-w-0">
          <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" /><span className="truncate">{ev.location}</span>
        </span>
      )}
      <span className="flex items-center gap-1.5 text-2xs leading-4 tabular-nums opacity-80">
        {cfg.pulse && <span className={cn("w-1.5 h-1.5 rounded-full shrink-0 animate-pulse motion-reduce:animate-none", cfg.dot)} aria-hidden="true" />}
        {quando}
      </span>
    </button>
  );
}

/** Legenda das cores — só os três status que o calendário mostra. */
export function Legenda({ className }: { className?: string }) {
  return (
    <ul aria-label="Legenda das cores" className={cn("flex items-center gap-3 m-0 p-0 list-none text-xs text-muted-foreground", className)}>
      {(["planejado", "em andamento", "concluído"] as const).map(k => (
        <li key={k} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span className={cn("w-2.5 h-2.5 rounded-[3px]", STATUS[k].tw.dot)} aria-hidden="true" />{STATUS[k].label}
        </li>
      ))}
    </ul>
  );
}

/** Botão-ícone de navegação (mês/semana). */
export const NAV_BTN = "pas-alvo inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-600 hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// ─── Aviso do período (Mês/Semana) ───────────────────────────────────────────

/**
 * Faixa no topo da grade quando o período não tem evento. Diz POR QUÊ
 * (filtro × agenda vazia) e dá a saída: limpar os filtros ou ir direto ao
 * período do próximo evento — antes era "Use as setas para navegar".
 */
export function AvisoDoPeriodo({ titulo, texto, acao, filtro }: {
  titulo: string;
  texto?: ReactNode;
  acao?: { rotulo: string; onClick: () => void; testid?: string; volta?: boolean };
  /** Vazio por causa de busca/filtro (ícone e tom diferentes). */
  filtro?: boolean;
}) {
  const Icone = filtro ? SearchX : CalendarDays;
  return (
    <div role="status" className="pas-entra flex flex-wrap items-center gap-x-3 gap-y-2 px-4 sm:px-5 py-3 border-b border-border bg-surface-muted/60" data-testid="cal-aviso-periodo">
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-card border border-border text-muted-foreground shrink-0 self-start sm:self-center" aria-hidden="true">
        <Icone className="w-4 h-4" />
      </span>
      {/* Celular: o texto ocupa a linha e o botão desce, alinhado com ele. */}
      <div className="min-w-0 flex-1 basis-[calc(100%-44px)] sm:basis-0">
        <p className="m-0 text-sm font-medium text-foreground">{titulo}</p>
        {texto && <p className="m-0 text-xs text-muted-foreground">{texto}</p>}
      </div>
      {acao && (
        <button
          type="button"
          onClick={acao.onClick}
          data-testid={acao.testid}
          className="pas-alvo ml-11 sm:ml-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-card text-xs font-medium text-slate-700 hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {!filtro && acao.volta && <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />}
          {acao.rotulo}
          {!filtro && !acao.volta && <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />}
        </button>
      )}
    </div>
  );
}
