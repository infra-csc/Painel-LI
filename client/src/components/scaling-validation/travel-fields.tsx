import { BedDouble, Ticket } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
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

const GROUP_TITLE = "text-[10px] font-bold uppercase tracking-wider text-slate-400";
const FIELD_LABEL = "text-[11px] text-slate-500";

/**
 * Bloco de campos de ida/volta + hotel/passagem, reutilizado nos diálogos de
 * pedido: um cartão só, com os três grupos lado a lado (ida · volta · precisa de).
 */
export function TravelFields({ value, onChange, disabled, idPrefix: p }: TravelFieldsProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 flex flex-wrap gap-x-6 gap-y-4">
      <fieldset className="space-y-2 min-w-0">
        <legend className={GROUP_TITLE}>Ida</legend>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1 w-[120px]">
            <Label htmlFor={`${p}-mode-ida`} className={FIELD_LABEL}>Transporte</Label>
            <ModeSelect id={`${p}-mode-ida`} value={value.transportModeIda} disabled={disabled} onChange={(v) => onChange({ transportModeIda: v })} />
          </div>
          <div className="space-y-1 w-[140px]">
            <Label htmlFor={`${p}-date-ida`} className={FIELD_LABEL}>Data</Label>
            <Input id={`${p}-date-ida`} type="date" value={value.flightDepartureDate} disabled={disabled} onChange={(e) => onChange({ flightDepartureDate: e.target.value })} className="h-9 rounded-lg text-xs" />
          </div>
          <div className="space-y-1 w-[104px]">
            <Label htmlFor={`${p}-time-ida`} className={FIELD_LABEL}>Saída</Label>
            <Input id={`${p}-time-ida`} type="time" value={value.flightDepartureSuggestedTime} disabled={disabled} onChange={(e) => onChange({ flightDepartureSuggestedTime: e.target.value })} className="h-9 rounded-lg text-xs" />
          </div>
          <div className="space-y-1 w-[104px]">
            <Label htmlFor={`${p}-time-chegada`} className={FIELD_LABEL}>Desembarque</Label>
            <Input id={`${p}-time-chegada`} type="time" value={value.flightArrivalSuggestedTime} disabled={disabled} onChange={(e) => onChange({ flightArrivalSuggestedTime: e.target.value })} className="h-9 rounded-lg text-xs" />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-2 min-w-0">
        <legend className={GROUP_TITLE}>Volta</legend>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1 w-[120px]">
            <Label htmlFor={`${p}-mode-volta`} className={FIELD_LABEL}>Transporte</Label>
            <ModeSelect id={`${p}-mode-volta`} value={value.transportModeVolta} disabled={disabled} onChange={(v) => onChange({ transportModeVolta: v })} />
          </div>
          <div className="space-y-1 w-[140px]">
            <Label htmlFor={`${p}-date-volta`} className={FIELD_LABEL}>Data</Label>
            <Input id={`${p}-date-volta`} type="date" value={value.flightReturnDate} disabled={disabled} min={value.flightDepartureDate || undefined} onChange={(e) => onChange({ flightReturnDate: e.target.value })} className="h-9 rounded-lg text-xs" />
          </div>
          <div className="space-y-1 w-[104px]">
            <Label htmlFor={`${p}-time-volta`} className={FIELD_LABEL}>Embarque</Label>
            <Input id={`${p}-time-volta`} type="time" value={value.flightReturnSuggestedTime} disabled={disabled} onChange={(e) => onChange({ flightReturnSuggestedTime: e.target.value })} className="h-9 rounded-lg text-xs" />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className={GROUP_TITLE}>Precisa de</legend>
        <div className="flex items-center gap-2">
          <label className={cn(NEED_CHIP, value.needsAccommodation ? NEED_ON : NEED_OFF, disabled && "opacity-60 cursor-not-allowed")}>
            <Checkbox id={`${p}-hotel`} checked={value.needsAccommodation} disabled={disabled} onCheckedChange={(c) => onChange({ needsAccommodation: c === true })} />
            <BedDouble className="w-3.5 h-3.5" aria-hidden="true" /> Hotel
          </label>
          <label className={cn(NEED_CHIP, value.needsTicket ? NEED_ON : NEED_OFF, disabled && "opacity-60 cursor-not-allowed")}>
            <Checkbox id={`${p}-ticket`} checked={value.needsTicket} disabled={disabled} onCheckedChange={(c) => onChange({ needsTicket: c === true })} />
            <Ticket className="w-3.5 h-3.5" aria-hidden="true" /> Passagem
          </label>
        </div>
      </fieldset>
    </div>
  );
}

const NEED_CHIP = "inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors";
const NEED_ON = "border-primary/30 bg-brand-soft text-primary";
const NEED_OFF = "border-slate-200 bg-white text-slate-600 hover:border-primary/30";

/** Erros de consistência dos campos de viagem (vazio = ok). */
export function validateTravel(v: TravelDraft): string[] {
  const out: string[] = [];
  if (v.flightDepartureDate && v.flightReturnDate && v.flightReturnDate < v.flightDepartureDate) out.push("A data de volta não pode ser anterior à data de ida.");
  if (v.needsTicket && (!v.flightDepartureDate || !v.flightReturnDate)) out.push("Com passagem marcada, informe as datas de ida e volta.");
  return out;
}

export default TravelFields;
