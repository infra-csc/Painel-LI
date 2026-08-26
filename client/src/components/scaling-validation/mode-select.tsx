import { memo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { TRANSPORT_MODES, TRANSPORT_MODE_LABELS, type TransportMode } from "@shared/scaling-validation-rules";

const NONE = "__none__";

export interface ModeSelectProps {
  value: TransportMode | "";
  onChange: (v: TransportMode | "") => void;
  /** Rótulo acessível (a coluna já diz "Modal ida"; aqui vai o contexto da linha). */
  label: string;
  disabled?: boolean;
  className?: string;
  /** id do gatilho, para associar um <Label htmlFor> (formulários). */
  id?: string;
  /**
   * Texto da opção "sem modal". Padrão "—" (grade densa, onde a coluna já
   * explica o campo); nos formulários vale a palavra inteira: "Não informado".
   */
  emptyLabel?: string;
}

/** Select de modal de transporte (aéreo/ônibus/van/carro/transfer) com opção vazia. */
export const ModeSelect = memo(function ModeSelect({ value, onChange, label, disabled, className, id, emptyLabel = "—" }: ModeSelectProps) {
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : (v as TransportMode))} disabled={disabled}>
      <SelectTrigger id={id} aria-label={label} className={cn("h-8 w-[104px] text-xs rounded-lg", value ? "bg-brand-soft/60 border-primary/30" : "bg-white border-slate-200", className)}>
        <SelectValue placeholder={emptyLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{emptyLabel}</SelectItem>
        {TRANSPORT_MODES.map((m) => (
          <SelectItem key={m} value={m}>{TRANSPORT_MODE_LABELS[m]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
});

export default ModeSelect;
