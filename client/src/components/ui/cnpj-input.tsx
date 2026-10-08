import { forwardRef, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { cnpjValido, mascararCnpj } from "@shared/cnpj";

// ── Validação e máscara: a regra mora em @shared/cnpj (08/10) para o servidor
// validar igual. Os nomes de sempre continuam exportados daqui.
export function validateCnpj(value: string): boolean {
  return cnpjValido(value);
}

export function maskCnpj(raw: string): string {
  return mascararCnpj(raw);
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
          <XCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-red-400 pointer-events-none" aria-hidden="true" />
        )}
        {isOk && (
          <CheckCircle2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500 pointer-events-none" aria-hidden="true" />
        )}
      </div>
    );
  }
);

CnpjInput.displayName = "CnpjInput";
