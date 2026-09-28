/**
 * Célula de quantidade da grade de Inclusão (25/09 — extraída do formulário).
 * Input numérico leve (substitui 1 Radix Select por célula — 130+ por grade):
 *   ↑ / ↓ = +1 / −1 · Delete = zera · ← → = célula ao lado · Enter / Shift+Enter
 *   e Ctrl+↑ / Ctrl+↓ = linha abaixo / acima · clamp 0..15.
 */
import { memo } from "react";
import { cn } from "@/lib/utils";

export const QTY_MAX = 15;
const qtyCellSelector = (r: number, c: number) => `[data-qty-cell="${r}-${c}"]`;

export interface QtyCellProps {
  value: number;
  rowIdx: number;
  colIdx: number;
  functionName: string;
  dayLabel: string;
  isWeekend: boolean;
  onChange: (value: number) => void;
}

export const QtyCell = memo(function QtyCell({ value, rowIdx, colIdx, functionName, dayLabel, isWeekend, onChange }: QtyCellProps) {
  const clamp = (n: number) => Math.max(0, Math.min(QTY_MAX, n));

  const focusCell = (e: React.KeyboardEvent<HTMLInputElement>, dRow: number, dCol: number) => {
    const table = e.currentTarget.closest("table");
    const target = table?.querySelector<HTMLInputElement>(qtyCellSelector(rowIdx + dRow, colIdx + dCol));
    if (target) {
      e.preventDefault();
      target.focus();
      target.select();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowUp":
        if (e.ctrlKey || e.metaKey) { focusCell(e, -1, 0); return; }
        e.preventDefault(); onChange(clamp(value + 1)); return;
      case "ArrowDown":
        if (e.ctrlKey || e.metaKey) { focusCell(e, 1, 0); return; }
        e.preventDefault(); onChange(clamp(value - 1)); return;
      case "ArrowLeft":  focusCell(e, 0, -1); return;
      case "ArrowRight": focusCell(e, 0, 1); return;
      case "Enter":      focusCell(e, e.shiftKey ? -1 : 1, 0); return;
      case "Delete":     e.preventDefault(); onChange(0); return;
      default: return;
    }
  };

  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "");
    if (digits === "") { onChange(0); return; }
    onChange(clamp(parseInt(digits.slice(-2), 10) || 0));
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      data-qty-cell={`${rowIdx}-${colIdx}`}
      value={value > 0 ? String(value) : ""}
      placeholder="–"
      aria-label={`${functionName}, ${dayLabel}`}
      title="↑/↓ ajusta · ←/→ muda de célula · Enter desce · Delete zera"
      onChange={onInput}
      onKeyDown={onKeyDown}
      onFocus={e => e.currentTarget.select()}
      className={cn(
        "h-7 w-12 rounded-lg text-center text-xs font-semibold tabular-nums transition-colors outline-none",
        "focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder:text-muted-foreground",
        value > 0
          ? "bg-brand-soft text-primary border border-primary/30"
          : cn("bg-card text-muted-foreground border border-border", isWeekend && "bg-warning-soft/40"),
      )}
    />
  );
});
