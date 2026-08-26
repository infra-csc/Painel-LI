import {
  ArrowDownLeft, ArrowLeftRight, ArrowUpRight, BedDouble, Bus, BusFront, Car,
  PlaneLanding, PlaneTakeoff, Route, Ticket,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TRANSPORT_MODES, TRANSPORT_MODE_LABELS, type TransportMode } from "@shared/scaling-validation-rules";
import { formatDateHeader, legValue, type DateHeader } from "./scaling-grid-utils";

/** Reexporta para quem já lia a normalização a partir dos chips. */
export { legValue };

/**
 * Linguagem visual única dos chips de logística — usada pela grade da Sugestão
 * e pela lista da Validação, para que "ida", "volta", "passagem" e "hotel"
 * sejam lidos pelo ÍCONE antes da palavra.
 *
 * Só apresentação: nada aqui lê ou escreve dado da vaga.
 */

// ── Datas ────────────────────────────────────────────────────────────────────

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Dia da semana + "dd/mm" + fim de semana de uma data (Date, ISO ou
 * "YYYY-MM-DD"); `null` quando a data não existe ou é inválida.
 * Reaproveita `formatDateHeader` — o mesmo helper do cabeçalho da grade, para
 * que "Qua 14/10" signifique a mesma coisa nas duas telas.
 */
export function dayInfo(v: string | Date | null | undefined): DateHeader | null {
  if (!v) return null;
  const d = v instanceof Date
    ? (Number.isNaN(v.getTime()) ? "" : `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`)
    : String(v).slice(0, 10);
  return YMD_RE.test(d) ? formatDateHeader(d) : null;
}

/** "Qua 14/10" em texto puro (para `title`/`aria-label`); "" se não houver data. */
export function dayText(v: string | Date | null | undefined): string {
  const h = dayInfo(v);
  return h ? `${h.dayName} ${h.date}` : "";
}

/** "Qua 14/10" com o dia da semana discreto (laranja no fim de semana). */
export function DayLabel({ v, className }: { v: string | Date | null | undefined; className?: string }) {
  const h = dayInfo(v);
  if (!h) return null;
  return (
    <span className={cn("whitespace-nowrap", className)}>
      <span className={cn("font-sans font-normal", h.isWeekend ? "text-orange-600" : "text-slate-400")}>{h.dayName}</span>{" "}
      <span className="tabular-nums">{h.date}</span>
    </span>
  );
}

// ── Chips ────────────────────────────────────────────────────────────────────

const CHIP_BASE = "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] leading-4 whitespace-nowrap";
/** Chip neutro (data/hora, observação). */
export const CHIP_NEUTRAL = cn(CHIP_BASE, "border-slate-200 bg-slate-50 text-slate-600");
/** Chip de destaque — o que a vaga PRECISA (passagem, hotel). */
export const CHIP_NEED = cn(CHIP_BASE, "border-primary/20 bg-brand-soft font-semibold text-primary");

const MODE_ICONS: Record<TransportMode, LucideIcon> = {
  aereo: Route, // aéreo nunca usa este mapa: a direção manda (decolar/pousar)
  onibus: Bus,
  van: BusFront,
  carro: Car,
  transfer: ArrowLeftRight,
};

export type LegDirection = "ida" | "volta";
const DIR_LABEL: Record<LegDirection, string> = { ida: "Ida", volta: "Volta" };

/**
 * Ida e volta empilhadas e iguais se confundem numa lista longa (o dono, 26/08:
 * "está fácil de se confundir por aqui"). Cada direção ganha uma FAIXA de cor à
 * esquerda e a palavra colorida — sinal que se lê antes da data. O fundo segue
 * neutro de propósito: dentro do chip o dia de fim de semana já é laranja, e um
 * fundo colorido brigaria com ele.
 */
const DIR_ACCENT: Record<LegDirection, { bar: string; icon: string; word: string }> = {
  ida:   { bar: "border-l-2 border-l-sky-400",    icon: "text-sky-500",    word: "text-sky-800" },
  volta: { bar: "border-l-2 border-l-indigo-400", icon: "text-indigo-500", word: "text-indigo-800" },
};

/** O banco guarda o modal como texto livre — só desenha ícone o que for válido. */
const asMode = (m: string | null | undefined): TransportMode | null =>
  m && (TRANSPORT_MODES as readonly string[]).includes(m) ? (m as TransportMode) : null;

/** Ícone do modal + seta de direção (o aéreo dispensa a seta: decola/pousa). */
function legIcons(dir: LegDirection, mode: TransportMode | null) {
  if (mode === "aereo") return { Mode: dir === "ida" ? PlaneTakeoff : PlaneLanding, Arrow: null };
  return {
    Mode: mode ? MODE_ICONS[mode] : Route,
    Arrow: dir === "ida" ? ArrowUpRight : ArrowDownLeft,
  };
}

export interface LegChipProps {
  dir: LegDirection;
  /** `transportModeIda` / `transportModeVolta` — vazio = modal ainda não definido. */
  mode?: string | null;
  /** Data da perna (Date, ISO ou "YYYY-MM-DD"). */
  date?: string | Date | null;
  /** Hora "HH:MM" (desembarque na ida, embarque na volta). */
  time?: string | null;
  className?: string;
}

/**
 * Chip de uma perna da viagem: `↗ Ida · Qua 15/10 · 11:00`.
 * Sem modal, sem data e sem hora → não aparece (nada a dizer).
 */
export function LegChip({ dir, mode, date, time, className }: LegChipProps) {
  // `legValue` primeiro: travessão solto no dado não pode virar chip.
  const m = asMode(legValue(mode) as string | null);
  const day = dayInfo(legValue(date));
  const hour = (legValue(time) as string | null) ?? "";
  if (!m && !day && !hour) return null;

  const { Mode, Arrow } = legIcons(dir, m);
  const modeText = m ? TRANSPORT_MODE_LABELS[m].toLowerCase() : "modal a definir";
  const label = [
    `${DIR_LABEL[dir]}: ${modeText}`,
    day ? `${day.dayName} ${day.date}` : "",
    hour ? `às ${hour}` : "",
  ].filter(Boolean).join(", ").replace(", às", " às");

  const accent = DIR_ACCENT[dir];
  return (
    <span role="img" aria-label={label} title={label} className={cn(CHIP_NEUTRAL, accent.bar, "rounded-l-sm pl-1.5", className)}>
      <Mode className={cn("h-3 w-3 shrink-0", accent.icon)} aria-hidden="true" />
      {Arrow && <Arrow className={cn("h-2.5 w-2.5 shrink-0", accent.icon)} aria-hidden="true" />}
      <span className={cn("font-semibold", accent.word)}>{DIR_LABEL[dir]}</span>
      {day && (
        <>
          <span className="text-slate-300" aria-hidden="true">·</span>
          <DayLabel v={date} />
        </>
      )}
      {hour && (
        <>
          <span className="text-slate-300" aria-hidden="true">·</span>
          <span className="tabular-nums">{hour}</span>
        </>
      )}
    </span>
  );
}

const NEED = {
  passagem: { Icon: Ticket, text: "Passagem", label: "Precisa de passagem" },
  hotel: { Icon: BedDouble, text: "Hotel", label: "Precisa de hospedagem" },
} as const;

/** Marca do que a vaga precisa — chip destacado, só quando precisa. */
export function NeedChip({ kind, className }: { kind: keyof typeof NEED; className?: string }) {
  const { Icon, text, label } = NEED[kind];
  return (
    <span role="img" aria-label={label} title={label} className={cn(CHIP_NEED, className)}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {text}
    </span>
  );
}

/** Passagem e hotel na mesma ordem nas duas telas. */
export function NeedChips({ needsTicket, needsAccommodation, className }: {
  needsTicket?: boolean | null; needsAccommodation?: boolean | null; className?: string;
}) {
  return (
    <>
      {needsTicket ? <NeedChip kind="passagem" className={className} /> : null}
      {needsAccommodation ? <NeedChip kind="hotel" className={className} /> : null}
    </>
  );
}
