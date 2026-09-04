import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ModeSelect } from "./mode-select";
import type { SuggestionGridRow } from "./scaling-grid-utils";

export interface LogisticsPanelProps {
  row: SuggestionGridRow;
  disabled?: boolean;
  onChangeRow: (rowId: string, patch: Partial<SuggestionGridRow>) => void;
}

const GROUP = "text-[10px] font-bold uppercase tracking-wide text-slate-500";
const FIELD_LABEL = "block text-[11px] font-medium text-slate-500 mb-1";
const inputCls = (filled: boolean) =>
  cn(
    "h-8 text-xs rounded-lg transition-colors focus:ring-2 focus:ring-primary/30 focus:border-primary",
    filled ? "bg-brand-soft/60 border-primary/30" : "bg-white border-slate-200",
  );

function Toggle({ label, on, disabled, onToggle, rowName }: {
  label: string; on: boolean; disabled?: boolean; onToggle: (v: boolean) => void; rowName: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={`Precisa de ${label.toLowerCase()} — ${rowName}`}
      disabled={disabled}
      onClick={() => onToggle(!on)}
      className={cn(
        "h-8 rounded-lg border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
        on ? "bg-brand-soft border-primary/30 text-primary" : "bg-white border-slate-200 text-slate-600 hover:border-primary/30",
      )}
    >
      {label}
    </button>
  );
}

/**
 * Painel expandido de logística de UMA linha da grade (abre numa <tr> com
 * colSpan): campos rotulados agrupados em Ida · Volta · Precisa de · Observação.
 * Controlado — todo change vai para `onChangeRow` da página.
 */
export function LogisticsPanel({ row, disabled, onChangeRow }: LogisticsPanelProps) {
  const patch = (p: Partial<SuggestionGridRow>) => onChangeRow(row.rowId, p);
  return (
    <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
      <fieldset className="min-w-0">
        <legend className={GROUP}>Ida</legend>
        <div className="mt-1.5 flex items-end gap-2">
          <div>
            <span className={FIELD_LABEL}>Modal</span>
            <ModeSelect value={row.transportModeIda} disabled={disabled} label={`Modal de ida — ${row.functionName}`} onChange={(v) => patch({ transportModeIda: v })} />
          </div>
          <div>
            <span className={FIELD_LABEL}>Data</span>
            <Input type="date" value={row.flightDepartureDate} disabled={disabled} aria-label={`Data de ida — ${row.functionName}`}
              onChange={(e) => patch({ flightDepartureDate: e.target.value })} className={cn(inputCls(!!row.flightDepartureDate), "w-[132px]")} />
          </div>
          <div>
            <span className={FIELD_LABEL}>Desembarque até</span>
            <Input type="text" placeholder="ex.: 8-14h" maxLength={40} value={row.flightArrivalSuggestedTime} disabled={disabled} aria-label={`Horário de desembarque — ${row.functionName}`}
              onChange={(e) => patch({ flightArrivalSuggestedTime: e.target.value })} className={cn(inputCls(!!row.flightArrivalSuggestedTime), "w-[96px]")} />
          </div>
        </div>
      </fieldset>

      <fieldset className="min-w-0">
        <legend className={GROUP}>Volta</legend>
        <div className="mt-1.5 flex items-end gap-2">
          <div>
            <span className={FIELD_LABEL}>Modal</span>
            <ModeSelect value={row.transportModeVolta} disabled={disabled} label={`Modal de volta — ${row.functionName}`} onChange={(v) => patch({ transportModeVolta: v })} />
          </div>
          <div>
            <span className={FIELD_LABEL}>Data</span>
            <Input type="date" value={row.flightReturnDate} disabled={disabled} aria-label={`Data de volta — ${row.functionName}`}
              onChange={(e) => patch({ flightReturnDate: e.target.value })} className={cn(inputCls(!!row.flightReturnDate), "w-[132px]")} />
          </div>
          <div>
            <span className={FIELD_LABEL}>Embarque a partir</span>
            <Input type="text" placeholder="ex.: 8-14h" maxLength={40} value={row.flightReturnSuggestedTime} disabled={disabled} aria-label={`Horário de embarque da volta — ${row.functionName}`}
              onChange={(e) => patch({ flightReturnSuggestedTime: e.target.value })} className={cn(inputCls(!!row.flightReturnSuggestedTime), "w-[96px]")} />
          </div>
        </div>
      </fieldset>

      <fieldset className="min-w-0">
        <legend className={GROUP}>Precisa de</legend>
        <div className="mt-1.5 flex items-center gap-2 pt-[18px]">
          <Toggle label="Hotel" on={row.needsAccommodation} disabled={disabled} rowName={row.functionName} onToggle={(v) => patch({ needsAccommodation: v })} />
          <Toggle label="Passagem" on={row.needsTicket} disabled={disabled} rowName={row.functionName} onToggle={(v) => patch({ needsTicket: v })} />
        </div>
      </fieldset>

      <fieldset className="min-w-[240px] flex-1">
        <legend className={GROUP}>Observação da linha</legend>
        <div className="mt-1.5 pt-[18px]">
          <Input value={row.observations} disabled={disabled} maxLength={500} placeholder="Ex.: chega junto com a carreta"
            aria-label={`Observação — ${row.functionName}`}
            onChange={(e) => patch({ observations: e.target.value })} className={cn(inputCls(!!row.observations), "w-full placeholder:text-slate-300")} />
        </div>
      </fieldset>
    </div>
  );
}

export default LogisticsPanel;
