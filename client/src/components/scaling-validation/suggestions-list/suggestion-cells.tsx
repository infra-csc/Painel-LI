/**
 * Células e rótulos da lista de vagas sugeridas (25/09 — extraídos de
 * suggestions-list.tsx): período, logística, chip do #, cadeado, e o
 * agrupamento por evento do modo "Todos os eventos".
 */
import { CalendarDays, Lock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, formatDateRange, formatDiarias } from "@/lib/utils";
import { formatDayMonthBr } from "@/lib/dates";
import { TRANSPORT_MODE_LABELS, type TransportMode } from "@shared/scaling-validation-rules";
import { workDaysOf, ymd, type SuggestionRow } from "../types";
import { DayLabel, LegChip, NeedChips, dayText, legValue } from "../logistics-chips";

// ── Helpers de exibição ──────────────────────────────────────────────────────

export function periodLabel(row: SuggestionRow): string {
  const days = workDaysOf(row);
  if (days.length === 0) {
    const s = ymd(row.scheduleStartDate); const e = ymd(row.scheduleEndDate);
    if (!s) return "Sem período";
    return s === e || !e ? formatDayMonthBr(s) : `${formatDayMonthBr(s)} – ${formatDayMonthBr(e)}`;
  }
  const first = days[0]; const last = days[days.length - 1];
  return first === last ? formatDayMonthBr(first) : `${formatDayMonthBr(first)} – ${formatDayMonthBr(last)}`;
}
export function legLabel(mode: string | null | undefined, date: unknown, time: string | null | undefined): string {
  const parts: string[] = [];
  if (mode) parts.push(TRANSPORT_MODE_LABELS[mode as TransportMode] ?? mode);
  if (date) parts.push(formatDayMonthBr(ymd(date as string)));
  if (time) parts.push(time);
  // Ver legLabel do Histórico: perna ainda não decidida se diz em palavra.
  return parts.length ? parts.join(" ") : "A definir";
}

/** Pontas do período: dias de trabalho quando existem, senão o intervalo da escala. */
function periodEnds(row: SuggestionRow): [string, string] {
  const days = workDaysOf(row);
  if (days.length > 0) return [days[0], days[days.length - 1]];
  return [ymd(row.scheduleStartDate), ymd(row.scheduleEndDate)];
}

/** "Sáb 05/09 – Ter 08/09 · 4 diárias" com "N dias" (lista de dias) em tooltip. */
export function PeriodCell({ row, className }: { row: SuggestionRow; className?: string }) {
  const days = workDaysOf(row);
  const [start, end] = periodEnds(row);
  const label = (
    <span className={cn("font-mono tabular-nums", className)}>
      {start
        ? <>
            <DayLabel v={start} />
            {end && end !== start && <> – <DayLabel v={end} /></>}
          </>
        // Travessão solto não diz nada a quem lê: a falta vira frase.
        : <span className="font-sans italic text-muted-foreground">Sem período</span>}
      {" "}<span className="text-muted-foreground font-sans">· {formatDiarias(days.length || row.dailyRates || 0)}</span>
    </span>
  );
  if (days.length === 0) return label;
  return (
    <Tooltip>
      <TooltipTrigger asChild><span tabIndex={0} className="cursor-help underline decoration-dotted decoration-slate-300 underline-offset-2">{label}</span></TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        <p className="font-semibold">{days.length} {days.length === 1 ? "dia" : "dias"} de trabalho</p>
        <p className="font-mono">{days.map((d) => dayText(d) || formatDayMonthBr(d)).join(", ")}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Ida/volta + o que a vaga precisa, em chips (uma coluna só de "Logística") —
 * mesma linguagem visual da grade da Sugestão (`logistics-chips`).
 *
 * `responsive` (04/09): abaixo de `xl` os chips saem na versão curta (só
 * "Ida · 15/10"), que cabe na coluna estreita; de `xl` para cima, a versão
 * inteira. São dois blocos com `hidden`, não uma media query em JS — a lista
 * não precisa re-renderizar ao redimensionar.
 */
export function LogisticsChips({ row, responsive = false }: { row: SuggestionRow; responsive?: boolean }) {
  // `legValue` trata travessão solto como ausência: campo "—" não pode virar
  // chip nem fazer a vaga parecer que tem viagem.
  const hasLeg = [
    row.transportModeIda, row.flightDepartureDate, row.flightArrivalSuggestedTime,
    row.transportModeVolta, row.flightReturnDate, row.flightReturnSuggestedTime,
  ].some((v) => legValue(v) !== null);
  if (!hasLeg && !row.needsTicket && !row.needsAccommodation) {
    return <span className="text-2xs italic text-muted-foreground">Sem logística</span>;
  }
  const chips = (compact: boolean) => (
    <>
      <LegChip dir="ida" mode={row.transportModeIda} date={row.flightDepartureDate} time={row.flightArrivalSuggestedTime} compact={compact} />
      <LegChip dir="volta" mode={row.transportModeVolta} date={row.flightReturnDate} time={row.flightReturnSuggestedTime} compact={compact} />
      <NeedChips needsTicket={row.needsTicket} needsAccommodation={row.needsAccommodation} />
    </>
  );
  if (!responsive) return <div className="flex flex-wrap items-center gap-1.5">{chips(false)}</div>;
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 xl:hidden">{chips(true)}</div>
      <div className="hidden flex-wrap items-center gap-1.5 xl:flex">{chips(false)}</div>
    </>
  );
}

export function IdChip({ row, onClick }: { row: SuggestionRow; onClick?: () => void }) {
  const cls = "inline-flex items-center rounded-md bg-brand-soft px-1.5 py-0.5 font-mono text-2xs font-semibold tabular-nums text-primary";
  if (!onClick) return <span className={cls}>#{row.inclusionNumber}</span>;
  return (
    <button type="button" onClick={onClick} className={cn(cls, "hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
      aria-label={`Ver detalhes da vaga #${row.inclusionNumber}`}>
      #{row.inclusionNumber}
    </button>
  );
}

export function LockedHint({ reason }: { reason: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span role="img" tabIndex={0} className="inline-flex items-center justify-center text-muted-foreground rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={reason}>
          <Lock className="w-3.5 h-3.5" aria-hidden="true" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">{reason}</TooltipContent>
    </Tooltip>
  );
}

// ── Lista ────────────────────────────────────────────────────────────────────

export type SuggestionSortField = "id" | "function" | "period";

// ── Agrupamento por evento (modo "Todos os eventos", 26/08) ──────────────────

export interface EventGroup {
  key: string;
  name: string;
  /** "05/09 – 08/09/2026" — vazio quando o servidor não sabe o período. */
  period: string;
  rows: SuggestionRow[];
}

/** Período do evento de uma linha, no formato do resto do módulo. */
export function eventPeriodLabel(row: Pick<SuggestionRow, "eventStartDate" | "eventEndDate">): string {
  const start = ymd(row.eventStartDate);
  if (!start) return "";
  return formatDateRange(start, ymd(row.eventEndDate) || start, { withYear: true });
}

/**
 * Agrupa as vagas por EVENTO mantendo a ordem que a tela já escolheu dentro de
 * cada grupo (função, período, o que o usuário ordenou). Os grupos saem do mais
 * recente para o mais antigo — quem abre "Todos os eventos" quer ver primeiro o
 * que está acontecendo agora; sem data, o desempate é pelo nome.
 */
export function groupRowsByEvent(rows: SuggestionRow[]): EventGroup[] {
  const groups = new Map<string, EventGroup & { start: string }>();
  for (const row of rows) {
    const key = row.eventId ?? "";
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        name: row.eventName ?? "Evento sem nome",
        period: eventPeriodLabel(row),
        start: ymd(row.eventStartDate),
        rows: [],
      };
      groups.set(key, g);
    }
    g.rows.push(row);
  }
  return Array.from(groups.values()).sort(
    (a, b) => b.start.localeCompare(a.start) || a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }),
  );
}

/**
 * Rótulo do evento na linha/no card — mesmo padrão tipográfico do módulo.
 * Exportado (04/09): a confirmação do lote na tela usa a MESMA linha para
 * dizer de que evento é cada vaga no modo "Todos os eventos".
 */
export function EventLine({ row, className }: { row: Pick<SuggestionRow, "eventName" | "eventStartDate" | "eventEndDate">; className?: string }) {
  const period = eventPeriodLabel(row);
  return (
    <span className={cn("flex items-center gap-1 text-2xs text-muted-foreground min-w-0", className)}>
      <CalendarDays className="w-3 h-3 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="break-words font-semibold text-slate-600">{row.eventName ?? "Evento sem nome"}</span>
      {period && <span className="font-mono text-muted-foreground whitespace-nowrap">· {period}</span>}
    </span>
  );
}
