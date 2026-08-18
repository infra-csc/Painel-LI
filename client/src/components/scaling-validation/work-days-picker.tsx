import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { addDaysYmd, buildDateList, formatDateHeader } from "./scaling-grid-utils";

interface WorkDaysPickerProps {
  /** Período base (normalmente o do evento). Dias selecionados fora dele também aparecem. */
  rangeStart: string;
  rangeEnd: string;
  value: string[];
  onChange: (days: string[]) => void;
  disabled?: boolean;
  /** Dias extras antes/depois do período para permitir montagem/desmontagem. */
  padDays?: number;
  id?: string;
}

/**
 * "Calendário de dias": um chip por dia do período; clique alterna o dia.
 * Sempre devolve os dias ordenados.
 */
export function WorkDaysPicker({ rangeStart, rangeEnd, value, onChange, disabled, padDays = 2, id }: WorkDaysPickerProps) {
  const days = useMemo(() => {
    const sel = [...value].sort();
    let start = rangeStart ? addDaysYmd(rangeStart, -padDays) : sel[0];
    let end = rangeEnd ? addDaysYmd(rangeEnd, padDays) : sel[sel.length - 1];
    if (sel[0] && (!start || sel[0] < start)) start = sel[0];
    if (sel[sel.length - 1] && (!end || sel[sel.length - 1] > end)) end = sel[sel.length - 1];
    if (!start || !end) return [];
    return buildDateList(start, end);
  }, [rangeStart, rangeEnd, value, padDays]);

  const selected = useMemo(() => new Set(value), [value]);
  const toggle = (d: string) => {
    if (disabled) return;
    const next = new Set(selected);
    if (next.has(d)) next.delete(d); else next.add(d);
    onChange(Array.from(next).sort());
  };

  if (days.length === 0) return <p className="text-xs text-slate-400">Sem período para escolher os dias.</p>;

  return (
    <div id={id} role="group" aria-label="Dias de trabalho" className="flex flex-wrap gap-1.5">
      {days.map((d) => {
        const { date, dayName, isWeekend } = formatDateHeader(d);
        const inEvent = (!rangeStart || d >= rangeStart) && (!rangeEnd || d <= rangeEnd);
        const on = selected.has(d);
        return (
          <button
            key={d}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => toggle(d)}
            title={inEvent ? undefined : "Fora do período do evento"}
            className={cn(
              "flex flex-col items-center min-w-[52px] px-2 py-1 rounded-lg border text-[11px] leading-tight transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60 disabled:cursor-not-allowed",
              on ? "bg-primary text-white border-primary" : cn("bg-white text-slate-600 border-slate-200 hover:border-primary/40", isWeekend && "bg-orange-50/50"),
              !inEvent && !on && "border-dashed text-slate-400",
            )}
          >
            <span className="font-semibold tabular-nums">{date}</span>
            <span className={cn("text-[10px]", on ? "text-white/80" : "text-slate-400")}>{dayName}</span>
          </button>
        );
      })}
    </div>
  );
}

export default WorkDaysPicker;
