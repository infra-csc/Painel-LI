import { memo, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { QTY_MAX } from "./scaling-grid-utils";

// Cópia fiel da célula de quantidade da grade da Inclusão de Equipe
// (grid-team-inclusion-form.tsx não a exporta). Mesmos atalhos:
//   ↑ / ↓ = +1 / −1 · Delete = zera · ← → = célula ao lado · Enter / Shift+Enter
//   e Ctrl+↑ / Ctrl+↓ = linha abaixo / acima · clamp 0..15.
const qtyCellSelector = (r: number, c: number) => `[data-qty-cell="${r}-${c}"]`;

/** Quanto tempo o anel âmbar de "bateu no teto" fica visível. */
const CLAMP_FLASH_MS = 1200;

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

/**
 * ←/→ só trocam de célula quando o cursor está na BORDA do texto (ou com o
 * texto todo selecionado, que é o estado logo após o foco). No meio de "12"
 * a seta precisa mover o cursor, como em qualquer input — antes ela pulava
 * de célula e não havia como editar o primeiro dígito.
 */
function atTextEdge(el: HTMLInputElement, side: "start" | "end"): boolean {
  const len = el.value.length;
  const s = el.selectionStart ?? 0;
  const e = el.selectionEnd ?? 0;
  if (len === 0) return true;
  const allSelected = s === 0 && e === len;
  if (allSelected) return true;
  return side === "start" ? s === 0 && e === 0 : s === len && e === len;
}

export const QtyCell = memo(function QtyCell({ value, rowId, date, rowIdx, colIdx, functionName, dayLabel, isWeekend, disabled, onChangeQty }: QtyCellProps) {
  const emit = (v: number) => onChangeQty(rowId, date, v);
  // "Bateu no teto": o valor digitado foi cortado pelo clamp. Sem sinal, quem
  // digitava "20" via "15" aparecer e achava que a tecla falhou.
  const [clamped, setClamped] = useState(false);
  const clampTimer = useRef<number | null>(null);
  useEffect(() => () => { if (clampTimer.current) window.clearTimeout(clampTimer.current); }, []);
  const flashClamp = () => {
    setClamped(true);
    if (clampTimer.current) window.clearTimeout(clampTimer.current);
    clampTimer.current = window.setTimeout(() => setClamped(false), CLAMP_FLASH_MS);
  };
  /** Emite já clampado e acende o aviso quando foi o TETO que cortou (↓ em 0 não avisa nada). */
  const emitClamped = (raw: number) => {
    if (raw > QTY_MAX) flashClamp();
    emit(clamp(raw));
  };

  const focusCell = (e: React.KeyboardEvent<HTMLInputElement>, dRow: number, dCol: number) => {
    const table = e.currentTarget.closest("table");
    const target = table?.querySelector<HTMLInputElement>(qtyCellSelector(rowIdx + dRow, colIdx + dCol));
    if (target) {
      e.preventDefault();
      target.focus();
      target.select();
      // A grade rola dentro do próprio contêiner (max-h): sem isto, Enter
      // descia para uma linha escondida atrás do rodapé fixo.
      target.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowUp":
        if (e.ctrlKey || e.metaKey) { focusCell(e, -1, 0); return; }
        e.preventDefault(); emitClamped(value + 1); return;
      case "ArrowDown":
        if (e.ctrlKey || e.metaKey) { focusCell(e, 1, 0); return; }
        e.preventDefault(); emitClamped(value - 1); return;
      case "ArrowLeft":  if (atTextEdge(e.currentTarget, "start")) focusCell(e, 0, -1); return;
      case "ArrowRight": if (atTextEdge(e.currentTarget, "end")) focusCell(e, 0, 1); return;
      case "Enter":      focusCell(e, e.shiftKey ? -1 : 1, 0); return;
      case "Delete":     e.preventDefault(); emit(0); return;
      default: return;
    }
  };

  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "");
    if (digits === "") { emit(0); return; }
    emitClamped(parseInt(digits.slice(-2), 10) || 0);
  };

  return (
    <>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        disabled={disabled}
        data-qty-cell={`${rowIdx}-${colIdx}`}
        value={value > 0 ? String(value) : ""}
        placeholder="–"
        // Leitor de tela: é um contador 0..15 com ↑/↓, não um campo de texto solto.
        role="spinbutton"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={QTY_MAX}
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
          clamped && "ring-2 ring-amber-400 focus:ring-amber-400 border-amber-400",
        )}
      />
      {clamped && <span className="sr-only" role="status">Máximo de {QTY_MAX} por dia</span>}
    </>
  );
});

export default QtyCell;
