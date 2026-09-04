import { useId, useMemo } from "react";
import { TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ModeSelect } from "./mode-select";
import { avisosDeViagem } from "./travel-warnings";
import type { SuggestionGridRow } from "./scaling-grid-utils";

export interface LogisticsPanelProps {
  row: SuggestionGridRow;
  disabled?: boolean;
  onChangeRow: (rowId: string, patch: Partial<SuggestionGridRow>) => void;
  /**
   * Dias da grade com quantidade > 0 nesta linha ("AAAA-MM-DD"). Com eles o
   * painel AVISA (não trava) quando ida/volta não batem com as diárias — o
   * mesmo `avisosDeViagem` do cartão de viagem dos pedidos.
   */
  workDays?: string[];
}

const GROUP = "text-[10px] font-bold uppercase tracking-wide text-slate-500";
const FIELD_LABEL = "block text-[11px] font-medium text-slate-500 mb-1";
// Mesmo placeholder/title do TimeField dos pedidos (travel-fields.tsx): o
// horário sugerido é texto livre com faixa, e as duas telas têm de dizer isso
// com as mesmas palavras.
const TIME_PLACEHOLDER = "ex.: 8-14h, 22h";
const TIME_TITLE = "Opcional — pode ser uma faixa (8-14h) ou uma hora (22h)";
const inputCls = (filled: boolean) =>
  cn(
    "h-8 text-xs rounded-lg transition-colors focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder:text-slate-400",
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
 * Painel de logística de UMA linha da grade: campos rotulados agrupados em
 * Ida · Volta · Precisa de · Observação. Fica FORA da tabela (num cartão logo
 * abaixo da grade) para continuar visível mesmo com a grade rolada.
 * Controlado — todo change vai para `onChangeRow` da página.
 */
export function LogisticsPanel({ row, disabled, onChangeRow, workDays }: LogisticsPanelProps) {
  const patch = (p: Partial<SuggestionGridRow>) => onChangeRow(row.rowId, p);
  // ids reais para <Label htmlFor>: o painel é um só por vez, mas o useId
  // evita colisão com os campos de período/observação da página.
  const id = useId();
  const f = (name: string) => `${id}-${name}`;
  const avisos = useMemo(
    () => avisosDeViagem({ flightDepartureDate: row.flightDepartureDate, flightReturnDate: row.flightReturnDate }, workDays),
    [row.flightDepartureDate, row.flightReturnDate, workDays],
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
        <fieldset className="min-w-0">
          <legend className={GROUP}>Ida</legend>
          <div className="mt-1.5 flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor={f("modal-ida")} className={FIELD_LABEL}>Modal</Label>
              <ModeSelect id={f("modal-ida")} value={row.transportModeIda} disabled={disabled} label={`Modal de ida — ${row.functionName}`} onChange={(v) => patch({ transportModeIda: v })} />
            </div>
            <div>
              <Label htmlFor={f("data-ida")} className={FIELD_LABEL}>Data</Label>
              <Input id={f("data-ida")} type="date" value={row.flightDepartureDate} disabled={disabled} aria-label={`Data de ida — ${row.functionName}`}
                onChange={(e) => patch({ flightDepartureDate: e.target.value })} className={cn(inputCls(!!row.flightDepartureDate), "w-[132px]")} />
            </div>
            <div>
              <Label htmlFor={f("hora-ida")} className={FIELD_LABEL}>Desembarque (chegada)</Label>
              <Input id={f("hora-ida")} type="text" placeholder={TIME_PLACEHOLDER} title={disabled ? undefined : TIME_TITLE} maxLength={40}
                value={row.flightArrivalSuggestedTime} disabled={disabled} aria-label={`Horário de desembarque — ${row.functionName}`}
                onChange={(e) => patch({ flightArrivalSuggestedTime: e.target.value })} className={cn(inputCls(!!row.flightArrivalSuggestedTime), "w-[124px] tabular-nums")} />
            </div>
          </div>
        </fieldset>

        <fieldset className="min-w-0">
          <legend className={GROUP}>Volta</legend>
          <div className="mt-1.5 flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor={f("modal-volta")} className={FIELD_LABEL}>Modal</Label>
              <ModeSelect id={f("modal-volta")} value={row.transportModeVolta} disabled={disabled} label={`Modal de volta — ${row.functionName}`} onChange={(v) => patch({ transportModeVolta: v })} />
            </div>
            <div>
              <Label htmlFor={f("data-volta")} className={FIELD_LABEL}>Data</Label>
              {/* min = data da ida: o seletor já não oferece volta antes da ida (data digitada continua validada pela regra). */}
              <Input id={f("data-volta")} type="date" value={row.flightReturnDate} disabled={disabled} aria-label={`Data de volta — ${row.functionName}`}
                min={row.flightDepartureDate || undefined}
                onChange={(e) => patch({ flightReturnDate: e.target.value })} className={cn(inputCls(!!row.flightReturnDate), "w-[132px]")} />
            </div>
            <div>
              <Label htmlFor={f("hora-volta")} className={FIELD_LABEL}>Embarque (saída)</Label>
              <Input id={f("hora-volta")} type="text" placeholder={TIME_PLACEHOLDER} title={disabled ? undefined : TIME_TITLE} maxLength={40}
                value={row.flightReturnSuggestedTime} disabled={disabled} aria-label={`Horário de embarque da volta — ${row.functionName}`}
                onChange={(e) => patch({ flightReturnSuggestedTime: e.target.value })} className={cn(inputCls(!!row.flightReturnSuggestedTime), "w-[124px] tabular-nums")} />
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
            <Label htmlFor={f("obs")} className="sr-only">Observação — {row.functionName}</Label>
            <Input id={f("obs")} value={row.observations} disabled={disabled} maxLength={500} placeholder="Ex.: chega junto com a carreta"
              onChange={(e) => patch({ observations: e.target.value })} className={cn(inputCls(!!row.observations), "w-full")} />
          </div>
        </fieldset>
      </div>

      {/* Avisos de viagem × diárias: aviso, não erro — o envio segue. A frase
          "dá para enviar" aparece UMA vez, no rodapé, e não em cada item. */}
      {avisos.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800" role="status" data-testid="sug-logistics-avisos">
          <ul className="space-y-0.5">
            {avisos.map((a) => (
              <li key={a} className="flex items-start gap-1.5">
                <TriangleAlert className="mt-px h-3 w-3 shrink-0 text-amber-600" aria-hidden="true" />
                <span>{a}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-amber-700">Só um aviso — dá para enviar assim mesmo.</p>
        </div>
      )}

      <p className="text-[11px] text-slate-500">
        Horário é uma faixa ou janela para Compras (ex.: "8-14h", "20h+"), não a hora exata do voo — quem compra confirma na tela de Passagens.
      </p>
    </div>
  );
}

export default LogisticsPanel;
