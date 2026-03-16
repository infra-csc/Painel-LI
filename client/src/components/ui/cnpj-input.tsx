import { forwardRef, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Algoritmo oficial de validação de CNPJ ───────────────────────────────────
export function validateCnpj(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 14) return false;
  if (/^(\d)\1+$/.test(digits)) return false; // todos iguais (ex: 00000000000000)

  function calcDigit(d: string, weights: number[]) {
    let sum = 0;
    for (let i = 0; i < weights.length; i++) sum += parseInt(d[i]) * weights[i];
    const rem = sum % 11;
    return rem < 2 ? 0 : 11 - rem;
  }

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const d1 = calcDigit(digits, w1);
  const d2 = calcDigit(digits, w2);

  return parseInt(digits[12]) === d1 && parseInt(digits[13]) === d2;
}

// ── Aplica máscara XX.XXX.XXX/XXXX-XX ────────────────────────────────────────
export function maskCnpj(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

// ── Componente ────────────────────────────────────────────────────────────────
interface CnpjInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
}

export const CnpjInput = forwardRef<HTMLInputElement, CnpjInputProps>(
  ({ value = "", onChange, className, ...props }, ref) => {
    const [touched, setTouched] = useState(false);

    const digits = value.replace(/\D/g, "");
    const isFull = digits.length === 14;
    const isValid = isFull && validateCnpj(value);
    const isInvalid = touched && digits.length > 0 && (!isFull || !isValid);
    const isOk = isFull && isValid;

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      const masked = maskCnpj(e.target.value);
      onChange?.(masked);
    }

    return (
      <div className="relative">
        <input
          ref={ref}
          type="text"
          inputMode="numeric"
          value={value}
          onChange={handleChange}
          onBlur={() => setTouched(true)}
          placeholder="00.000.000/0001-00"
          maxLength={18}
          className={cn(
            "flex h-10 w-full rounded-lg border bg-white px-3 py-2 pr-9 text-sm transition-all",
            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1",
            "disabled:cursor-not-allowed disabled:opacity-50",
            isInvalid
              ? "border-red-400 focus-visible:ring-red-400/30 focus-visible:border-red-400"
              : isOk
              ? "border-emerald-400 focus-visible:ring-emerald-400/30 focus-visible:border-emerald-400"
              : "border-gray-200 focus-visible:ring-blue-500/20 focus-visible:border-blue-500",
            className
          )}
          {...props}
        />
        {/* Ícone de status */}
        {isInvalid && (
          <XCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-red-400 pointer-events-none" />
        )}
        {isOk && (
          <CheckCircle2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500 pointer-events-none" />
        )}
      </div>
    );
  }
);

CnpjInput.displayName = "CnpjInput";
