import { memo } from "react";
import { cn } from "@/lib/utils";
import { QTY_MAX } from "./scaling-grid-utils";

// Cópia fiel da célula de quantidade da grade da Inclusão de Equipe
// (grid-team-inclusion-form.tsx não a exporta). Mesmos atalhos:
//   ↑ / ↓ = +1 / −1 · Delete = zera · ← → = célula ao lado · Enter / Shift+Enter
//   e Ctrl+↑ / Ctrl+↓ = linha abaixo / acima · clamp 0..15.
const qtyCellSelector = (r: number, c: number) => `[data-qty-cell="${r}-${c}"]`;

export interface QtyCellProps {
  value: number;
  /** Identidade estável da célula: a página recebe (rowId, date, valor) sem callback inline. */
  rowId: string;
  date: string;
  rowIdx: number;
  colIdx: number;
  functionName: string;
  dayLabel: string;
  isWeekend: boolean;
  disabled?: boolean;
  onChangeQty: (rowId: string, date: string, value: number) => void;
}

const clamp = (n: number) => Math.max(0, Math.min(QTY_MAX, n));

export const QtyCell = memo(function QtyCell({ value, rowId, date, rowIdx, colIdx, functionName, dayLabel, isWeekend, disabled, onChangeQty }: QtyCellProps) {
  const emit = (v: number) => onChangeQty(rowId, date, v);

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
        e.preventDefault(); emit(clamp(value + 1)); return;
      case "ArrowDown":
        if (e.ctrlKey || e.metaKey) { focusCell(e, 1, 0); return; }
        e.preventDefault(); emit(clamp(value - 1)); return;
      case "ArrowLeft":  focusCell(e, 0, -1); return;
      case "ArrowRight": focusCell(e, 0, 1); return;
      case "Enter":      focusCell(e, e.shiftKey ? -1 : 1, 0); return;
      case "Delete":     e.preventDefault(); emit(0); return;
      default: return;
    }
  };

  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "");
    if (digits === "") { emit(0); return; }
    emit(clamp(parseInt(digits.slice(-2), 10) || 0));
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      disabled={disabled}
      data-qty-cell={`${rowIdx}-${colIdx}`}
      value={value > 0 ? String(value) : ""}
      placeholder="–"
      aria-label={`${functionName}, ${dayLabel}`}
      title="↑/↓ ajusta · ←/→ muda de célula · Enter desce · Delete zera"
      onChange={onInput}
      onKeyDown={onKeyDown}
      onFocus={(e) => e.currentTarget.select()}
      className={cn(
        "h-8 w-12 rounded-lg text-center text-xs font-semibold tabular-nums transition-colors outline-none",
        "focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder:text-slate-300 disabled:opacity-60",
        value > 0
          ? "bg-brand-soft text-primary border border-primary/30"
          : "bg-white text-slate-500 border border-slate-200",
      )}
    />
  );
});

export default QtyCell;
