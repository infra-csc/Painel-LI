import { ArrowDownLeft, ArrowUpRight, BedDouble, Ticket } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { TRANSPORT_MODES, type TransportMode } from "@shared/scaling-validation-rules";
import type { TeamInclusion } from "@shared/schema";
import { DayLabel } from "./logistics-chips";
import { ModeSelect } from "./mode-select";
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

interface TravelFieldsProps {
  value: TravelDraft;
  onChange: (patch: Partial<TravelDraft>) => void;
  disabled?: boolean;
  idPrefix: string;
}

const GROUP_TITLE = "flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400";
const FIELD_LABEL = "text-[11px] font-normal text-slate-500";
const CONTROL = "h-9 w-full rounded-lg text-xs bg-white";
/**
 * Mesma medida do CONTROL, SEM `bg-white`: o `ModeSelect` pinta o próprio fundo
 * (`bg-brand-soft/60`) quando já tem um modal escolhido, e o branco daqui — que
 * chega depois no twMerge — apagava esse sinal de "preenchido".
 */
const CONTROL_MODE = "h-9 w-full rounded-lg text-xs min-w-[136px] text-sm";
/**
 * Grade única das duas pernas: transporte · data · saída · chegada.
 * Ida e volta usam ESTA constante — é o que garante o espelho (mesmas colunas,
 * mesmas larguras). A volta não tem hora de chegada no schema: a 4ª célula fica
 * vazia, em vez de o grupo seguinte escorregar para o buraco.
 */
const LEG_GRID = "grid gap-x-3 gap-y-2 grid-cols-2 sm:grid-cols-[minmax(140px,1.1fr)_minmax(150px,1.15fr)_minmax(96px,0.9fr)_minmax(96px,0.9fr)]";

/** Rótulo de 11px; nas datas, mostra o dia da semana ao lado (mesmo "Qua 14/10" da grade). */
function FieldLabel({ htmlFor, text, date }: { htmlFor: string; text: string; date?: string }) {
  return (
    <Label htmlFor={htmlFor} className={cn(FIELD_LABEL, "flex items-baseline gap-1.5 truncate")}>
      <span className="truncate">{text}</span>
      {date ? <DayLabel v={date} className="text-[11px] text-slate-400" /> : null}
    </Label>
  );
}

/** Hora opcional: vazio mostra "--:--" e o `title` avisa que dá para deixar em branco. */
function TimeField({ id, label, value, disabled, onChange }: { id: string; label: string; value: string; disabled?: boolean; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1 min-w-0">
      <FieldLabel htmlFor={id} text={label} />
      <Input id={id} type="time" value={value} disabled={disabled} placeholder="--:--"
        title={disabled ? undefined : "Opcional — deixe em branco se ainda não sabe o horário"}
        onChange={(e) => onChange(e.target.value)} className={cn(CONTROL, "tabular-nums")} />
    </div>
  );
}

/**
 * Bloco de campos de ida/volta + hotel/passagem, reutilizado nos diálogos de
 * pedido: um cartão só, com IDA e VOLTA espelhadas (uma embaixo da outra, mesma
 * grade) e "Precisa de" em linha própria, largura total, no rodapé do cartão.
 */
export function TravelFields({ value, onChange, disabled, idPrefix: p }: TravelFieldsProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-3">
      <fieldset className="space-y-1.5">
        <legend className={GROUP_TITLE}>
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /> Ida
        </legend>
        <div className={LEG_GRID}>
          <div className="space-y-1 min-w-0">
            <FieldLabel htmlFor={`${p}-mode-ida`} text="Transporte" />
            <ModeSelect id={`${p}-mode-ida`} label="Transporte da ida" emptyLabel="Não informado" value={value.transportModeIda}
              disabled={disabled} onChange={(v) => onChange({ transportModeIda: v })} className={CONTROL_MODE} />
          </div>
          <div className="space-y-1 min-w-0">
            <FieldLabel htmlFor={`${p}-date-ida`} text="Data" date={value.flightDepartureDate} />
            <Input id={`${p}-date-ida`} type="date" value={value.flightDepartureDate} disabled={disabled}
              onChange={(e) => onChange({ flightDepartureDate: e.target.value })} className={CONTROL} />
          </div>
          <TimeField id={`${p}-time-ida`} label="Saída (origem)" value={value.flightDepartureSuggestedTime} disabled={disabled}
            onChange={(v) => onChange({ flightDepartureSuggestedTime: v })} />
          <TimeField id={`${p}-time-chegada`} label="Desembarque (chegada)" value={value.flightArrivalSuggestedTime} disabled={disabled}
            onChange={(v) => onChange({ flightArrivalSuggestedTime: v })} />
        </div>
      </fieldset>

      <fieldset className="space-y-1.5">
        <legend className={GROUP_TITLE}>
          <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden="true" /> Volta
        </legend>
        <div className={LEG_GRID}>
          <div className="space-y-1 min-w-0">
            <FieldLabel htmlFor={`${p}-mode-volta`} text="Transporte" />
            <ModeSelect id={`${p}-mode-volta`} label="Transporte da volta" emptyLabel="Não informado" value={value.transportModeVolta}
              disabled={disabled} onChange={(v) => onChange({ transportModeVolta: v })} className={CONTROL_MODE} />
          </div>
          <div className="space-y-1 min-w-0">
            <FieldLabel htmlFor={`${p}-date-volta`} text="Data" date={value.flightReturnDate} />
            <Input id={`${p}-date-volta`} type="date" value={value.flightReturnDate} disabled={disabled} min={value.flightDepartureDate || undefined}
              onChange={(e) => onChange({ flightReturnDate: e.target.value })} className={CONTROL} />
          </div>
          <TimeField id={`${p}-time-volta`} label="Embarque (saída)" value={value.flightReturnSuggestedTime} disabled={disabled}
            onChange={(v) => onChange({ flightReturnSuggestedTime: v })} />
          {/* Coluna da chegada da volta: sem campo no schema — célula vazia só para manter o espelho. */}
          <div aria-hidden="true" className="hidden sm:block" />
        </div>
      </fieldset>

      <p className="text-[11px] text-slate-500">
        Horários são sugestões para a compra e podem ficar em branco (<span className="tabular-nums">--:--</span>).
        O <span className="font-semibold text-slate-600">desembarque da ida</span> e o <span className="font-semibold text-slate-600">embarque da volta</span> são
        os horários que a regra de alimentação usa (almoço/jantar do primeiro e do último dia).
      </p>

      <fieldset className="space-y-1.5 border-t border-slate-100 pt-3">
        <legend className={GROUP_TITLE}>Precisa de</legend>
        <div className="flex flex-wrap items-center gap-2">
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

const NEED_CHIP = "inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors focus-within:ring-2 focus-within:ring-primary/30";
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
