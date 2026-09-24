import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { parseBrNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * Campo de moeda em centavos (23/09) — antes copiado em budget-actual,
 * system-settings e split-vaga-modal.
 *
 * - `value` em CENTAVOS; `onChange` devolve centavos inteiros.
 * - Mantém o texto digitado ("1.500,50" funciona) e só normaliza no blur.
 * - Se o valor externo mudar enquanto o campo NÃO está em foco, ressincroniza.
 * - `onChange` também dispara no blur (sem edição) — quem precisa distinguir
 *   compara com o valor anterior antes de marcar "editado".
 */
export interface CurrencyInputProps {
  value: number;
  onChange: (cents: number) => void;
  className?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  placeholder?: string;
  "aria-label"?: string;
  /** Sem o visual padrão (fundo/borda/foco): o chamador estiliza tudo via `className`. */
  semEstilo?: boolean;
  id?: string;
  name?: string;
}

const paraTexto = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

export function CurrencyInput({
  value, onChange, className, disabled, style, placeholder, semEstilo, id, name,
  "aria-label": ariaLabel,
}: CurrencyInputProps) {
  const [display, setDisplay] = useState(() => paraTexto(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDisplay(paraTexto(value));
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setDisplay(raw);
    if (raw.trim() === "") return;
    // parseBrNumber trata "1.500,00" como 1500 (ponto de milhar + vírgula decimal)
    onChange(Math.round(parseBrNumber(raw) * 100));
  };

  const handleBlur = () => {
    if (display.trim() === "") {
      setDisplay(paraTexto(value));
      return;
    }
    const cents = Math.round(parseBrNumber(display) * 100);
    onChange(cents);
    setDisplay(paraTexto(cents));
  };

  const handleFocus = () => {
    setTimeout(() => inputRef.current?.select(), 0);
  };

  return (
    <Input
      ref={inputRef}
      id={id}
      name={name}
      type="text"
      inputMode="decimal"
      style={style}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={cn(
        !semEstilo && "bg-surface-muted border-border rounded-lg font-medium focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:border-primary/40",
        "transition-colors",
        className,
      )}
      value={display}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      disabled={disabled}
    />
  );
}

export default CurrencyInput;
