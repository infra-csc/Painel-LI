import { useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { addDaysYmd, buildReadDateList, formatDateHeader } from "./scaling-grid-utils";

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
  /**
   * Dias que fazem parte do pedido da área (Aprovação). Marcados com um ponto,
   * eles são a referência de quem reajusta: sem isso, mudar um dia aqui apagava
   * da vista o que estava sendo pedido.
   */
  pedidos?: string[];
}

/**
 * "Calendário de dias": um chip por dia do período; clique alterna o dia.
 * Sempre devolve os dias ordenados.
 */
export function WorkDaysPicker({ rangeStart, rangeEnd, value, onChange, disabled, padDays = 2, id, pedidos }: WorkDaysPickerProps) {
  const days = useMemo(() => {
    const sel = [...value].sort();
    let start = rangeStart ? addDaysYmd(rangeStart, -padDays) : sel[0];
    let end = rangeEnd ? addDaysYmd(rangeEnd, padDays) : sel[sel.length - 1];
    if (sel[0] && (!start || sel[0] < start)) start = sel[0];
    if (sel[sel.length - 1] && (!end || sel[sel.length - 1] > end)) end = sel[sel.length - 1];
    if (!start || !end) return [];
    // Leitura (não é a grade de sugestão): trunca em vez de zerar quando o
    // intervalo é muito longo — caso contrário o seletor apareceria vazio.
    return buildReadDateList(start, end).dates;
  }, [rangeStart, rangeEnd, value, padDays]);

  const selected = useMemo(() => new Set(value), [value]);
  const pedidosSet = useMemo(() => new Set(pedidos ?? []), [pedidos]);
  // Último dia clicado — âncora do shift+clique (seleciona o intervalo inteiro).
  const anchorRef = useRef<string | null>(null);
  const toggle = (d: string, shift: boolean) => {
    if (disabled) return;
    const next = new Set(selected);
    const anchor = anchorRef.current;
    if (shift && anchor && anchor !== d) {
      const [a, b] = anchor < d ? [anchor, d] : [d, anchor];
      for (const x of days) if (x >= a && x <= b) next.add(x);
    } else if (next.has(d)) {
      next.delete(d);
    } else {
      next.add(d);
    }
    anchorRef.current = d;
    onChange(Array.from(next).sort());
  };

  if (days.length === 0) return <p className="text-xs text-slate-500">Sem período para escolher os dias.</p>;

  return (
    <div id={id} role="group" aria-label="Dias de trabalho" className="space-y-1.5">
    <div className="flex flex-wrap gap-1.5">
      {days.map((d) => {
        const { date, dayName, isWeekend } = formatDateHeader(d);
        const inEvent = (!rangeStart || d >= rangeStart) && (!rangeEnd || d <= rangeEnd);
        const on = selected.has(d);
        const pedido = pedidosSet.has(d);
        const titulo = pedido
          ? `A área pediu este dia · ${on ? "marcado" : "desmarcado por você"}`
          : inEvent ? undefined : "Fora do período do evento";
        return (
          <button
            key={d}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={(e) => toggle(d, e.shiftKey)}
            title={titulo}
            className={cn(
              "relative flex flex-col items-center min-w-[52px] px-2 py-1 rounded-lg border text-[11px] leading-tight transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60 disabled:cursor-not-allowed",
              // FUNDO só significa "marcado" (regra do dono, 26/08): o fim de
              // semana pintado parecia dia selecionado. Aqui ele aparece só no
              // nome do dia, em laranja.
              on ? "bg-primary text-white border-primary" : "bg-white text-slate-600 border-slate-200 hover:border-primary/40",
              !inEvent && !on && "border-dashed text-slate-400",
            )}
          >
            {pedido && (
              <span
                aria-hidden="true"
                className={cn("absolute right-1 top-1 h-1.5 w-1.5 rounded-full", on ? "bg-white/90" : "bg-primary")}
              />
            )}
            <span className="font-semibold tabular-nums">{date}</span>
            <span className={cn("text-[10px]", on ? "text-white/80" : isWeekend ? "text-orange-700" : "text-slate-500")}>{dayName}</span>
          </button>
        );
      })}
    </div>
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
      <span>Clique para marcar um dia; <kbd className="rounded border border-slate-200 bg-slate-50 px-1 font-mono text-[10px]">Shift</kbd> + clique marca o intervalo.</span>
      {pedidosSet.size > 0 && (
        <span className="inline-flex items-center gap-1 text-slate-500">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" /> pedido da área
        </span>
      )}
    </p>
    </div>
  );
}

export default WorkDaysPicker;
