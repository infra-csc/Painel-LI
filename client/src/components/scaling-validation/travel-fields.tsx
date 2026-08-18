import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TRANSPORT_MODES, TRANSPORT_MODE_LABELS, type TransportMode } from "@shared/scaling-validation-rules";
import type { TeamInclusion } from "@shared/schema";
import { ymd } from "./types";

/** Campos de viagem/logística editáveis nos pedidos (ajuste e inclusão). */
export interface TravelDraft {
  transportModeIda: TransportMode | "";
  flightDepartureDate: string;
  flightDepartureSuggestedTime: string;
  flightArrivalSuggestedTime: string;
  transportModeVolta: TransportMode | "";
  flightReturnDate: string;
  flightReturnSuggestedTime: string;
  needsAccommodation: boolean;
  needsTicket: boolean;
}

export const EMPTY_TRAVEL: TravelDraft = {
  transportModeIda: "",
  flightDepartureDate: "",
  flightDepartureSuggestedTime: "",
  flightArrivalSuggestedTime: "",
  transportModeVolta: "",
  flightReturnDate: "",
  flightReturnSuggestedTime: "",
  needsAccommodation: false,
  needsTicket: false,
};

const asMode = (v: string | null | undefined): TransportMode | "" =>
  (TRANSPORT_MODES as readonly string[]).includes(v ?? "") ? (v as TransportMode) : "";

/** Rascunho a partir de uma vaga existente (para o "de/para" do pedido de ajuste). */
export function travelFromInclusion(i: TeamInclusion): TravelDraft {
  return {
    transportModeIda: asMode(i.transportModeIda),
    flightDepartureDate: ymd(i.flightDepartureDate),
    flightDepartureSuggestedTime: i.flightDepartureSuggestedTime ?? "",
    flightArrivalSuggestedTime: i.flightArrivalSuggestedTime ?? "",
    transportModeVolta: asMode(i.transportModeVolta),
    flightReturnDate: ymd(i.flightReturnDate),
    flightReturnSuggestedTime: i.flightReturnSuggestedTime ?? "",
    needsAccommodation: !!i.needsAccommodation,
    needsTicket: !!i.needsTicket,
  };
}

const NONE = "__none__";

interface TravelFieldsProps {
  value: TravelDraft;
  onChange: (patch: Partial<TravelDraft>) => void;
  disabled?: boolean;
  idPrefix: string;
}

function ModeSelect({ id, value, onChange, disabled }: { id: string; value: TransportMode | ""; onChange: (v: TransportMode | "") => void; disabled?: boolean }) {
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : (v as TransportMode))} disabled={disabled}>
      <SelectTrigger id={id} className="h-9 rounded-lg text-sm"><SelectValue placeholder="—" /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>— não informado —</SelectItem>
        {TRANSPORT_MODES.map((m) => <SelectItem key={m} value={m}>{TRANSPORT_MODE_LABELS[m]}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/** Bloco de campos de ida/volta + hotel/passagem, reutilizado nos diálogos de pedido. */
export function TravelFields({ value, onChange, disabled, idPrefix: p }: TravelFieldsProps) {
  const lbl = "text-xs text-slate-600";
  return (
    <div className="space-y-4">
      <fieldset className="rounded-xl border border-slate-200 p-3 space-y-3">
        <legend className="px-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Ida</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor={`${p}-mode-ida`} className={lbl}>Transporte</Label>
            <ModeSelect id={`${p}-mode-ida`} value={value.transportModeIda} disabled={disabled} onChange={(v) => onChange({ transportModeIda: v })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${p}-date-ida`} className={lbl}>Data de ida</Label>
            <Input id={`${p}-date-ida`} type="date" value={value.flightDepartureDate} disabled={disabled} onChange={(e) => onChange({ flightDepartureDate: e.target.value })} className="h-9 rounded-lg" />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${p}-time-ida`} className={lbl}>Horário de saída</Label>
            <Input id={`${p}-time-ida`} type="time" value={value.flightDepartureSuggestedTime} disabled={disabled} onChange={(e) => onChange({ flightDepartureSuggestedTime: e.target.value })} className="h-9 rounded-lg" />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${p}-time-chegada`} className={lbl}>Horário de desembarque</Label>
            <Input id={`${p}-time-chegada`} type="time" value={value.flightArrivalSuggestedTime} disabled={disabled} onChange={(e) => onChange({ flightArrivalSuggestedTime: e.target.value })} className="h-9 rounded-lg" />
          </div>
        </div>
      </fieldset>

      <fieldset className="rounded-xl border border-slate-200 p-3 space-y-3">
        <legend className="px-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Volta</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor={`${p}-mode-volta`} className={lbl}>Transporte</Label>
            <ModeSelect id={`${p}-mode-volta`} value={value.transportModeVolta} disabled={disabled} onChange={(v) => onChange({ transportModeVolta: v })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${p}-date-volta`} className={lbl}>Data de volta</Label>
            <Input id={`${p}-date-volta`} type="date" value={value.flightReturnDate} disabled={disabled} min={value.flightDepartureDate || undefined} onChange={(e) => onChange({ flightReturnDate: e.target.value })} className="h-9 rounded-lg" />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${p}-time-volta`} className={lbl}>Horário de embarque</Label>
            <Input id={`${p}-time-volta`} type="time" value={value.flightReturnSuggestedTime} disabled={disabled} onChange={(e) => onChange({ flightReturnSuggestedTime: e.target.value })} className="h-9 rounded-lg" />
          </div>
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-5">
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <Checkbox id={`${p}-hotel`} checked={value.needsAccommodation} disabled={disabled} onCheckedChange={(c) => onChange({ needsAccommodation: c === true })} />
          Precisa de hospedagem
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <Checkbox id={`${p}-ticket`} checked={value.needsTicket} disabled={disabled} onCheckedChange={(c) => onChange({ needsTicket: c === true })} />
          Precisa de passagem
        </label>
      </div>
    </div>
  );
}

/** Erros de consistência dos campos de viagem (vazio = ok). */
export function validateTravel(v: TravelDraft): string[] {
  const out: string[] = [];
  if (v.flightDepartureDate && v.flightReturnDate && v.flightReturnDate < v.flightDepartureDate) out.push("A data de volta não pode ser anterior à data de ida.");
  if (v.needsTicket && (!v.flightDepartureDate || !v.flightReturnDate)) out.push("Com passagem marcada, informe as datas de ida e volta.");
  return out;
}

export default TravelFields;
