import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDiarias } from "@/lib/utils";
import type { Event, TeamInclusion } from "@shared/schema";
import { diffInclusion, type ChangeRequestType, type ProposedChanges } from "@shared/scaling-validation-rules";
import { TravelFields, EMPTY_TRAVEL, travelFromInclusion, validateTravel, type TravelDraft } from "@/components/scaling-validation/travel-fields";
import { WorkDaysPicker } from "@/components/scaling-validation/work-days-picker";

/** Rascunho editável dos campos propostos (usado no "Reajustar" do aprovador). */
export interface ProposedDraft {
  workDays: string[];
  dailyRates: string;
  travel: TravelDraft;
  observations: string;
  quantity: string;
}

const ymd = (v: unknown) => (v ? String(v).slice(0, 10) : "");
const orNull = <T,>(v: T | ""): T | null => (v === "" ? null : v);

/**
 * Monta o rascunho a partir do pedido. Para AJUSTE, `base` é a vaga atual: os
 * campos que o pedido não toca vêm dela (assim o formulário mostra a vaga
 * inteira e o diff sai certo). Para INCLUSÃO não há vaga — só o pedido.
 */
export function draftFromProposed(proposed: ProposedChanges | null, base?: TeamInclusion | null): ProposedDraft {
  const p = proposed ?? { v: 1 };
  const baseDays = (base?.workDays ?? []).map(ymd).filter(Boolean).sort();
  const days = p.workDays ? [...p.workDays].map(ymd).filter(Boolean).sort() : baseDays;
  const travel: TravelDraft = base ? travelFromInclusion(base) : { ...EMPTY_TRAVEL };
  if (p.transportModeIda !== undefined) travel.transportModeIda = p.transportModeIda ?? "";
  if (p.transportModeVolta !== undefined) travel.transportModeVolta = p.transportModeVolta ?? "";
  if (p.flightDepartureDate !== undefined) travel.flightDepartureDate = p.flightDepartureDate ?? "";
  if (p.flightDepartureSuggestedTime !== undefined) travel.flightDepartureSuggestedTime = p.flightDepartureSuggestedTime ?? "";
  if (p.flightArrivalSuggestedTime !== undefined) travel.flightArrivalSuggestedTime = p.flightArrivalSuggestedTime ?? "";
  if (p.flightReturnDate !== undefined) travel.flightReturnDate = p.flightReturnDate ?? "";
  if (p.flightReturnSuggestedTime !== undefined) travel.flightReturnSuggestedTime = p.flightReturnSuggestedTime ?? "";
  if (p.needsTicket !== undefined) travel.needsTicket = !!p.needsTicket;
  if (p.needsAccommodation !== undefined) travel.needsAccommodation = !!p.needsAccommodation;
  const dailyRates = p.dailyRates !== undefined ? p.dailyRates : (base?.dailyRates ?? days.length);
  const observations = p.observations !== undefined ? (p.observations ?? "") : (base?.observations ?? "");
  return {
    workDays: days,
    dailyRates: dailyRates === null || dailyRates === undefined ? "" : String(dailyRates),
    travel,
    observations,
    quantity: String(p.quantity ?? 1),
  };
}

/** Objeto completo (todos os campos) a partir do rascunho — para diff/preview. */
export function fullFromDraft(d: ProposedDraft): ProposedChanges {
  return {
    v: 1,
    workDays: d.workDays.length ? d.workDays : undefined,
    dailyRates: d.dailyRates.trim() === "" ? undefined : Number(d.dailyRates),
    flightDepartureDate: orNull(d.travel.flightDepartureDate),
    flightDepartureSuggestedTime: orNull(d.travel.flightDepartureSuggestedTime),
    flightArrivalSuggestedTime: orNull(d.travel.flightArrivalSuggestedTime),
    flightReturnDate: orNull(d.travel.flightReturnDate),
    flightReturnSuggestedTime: orNull(d.travel.flightReturnSuggestedTime),
    transportModeIda: orNull(d.travel.transportModeIda),
    transportModeVolta: orNull(d.travel.transportModeVolta),
    needsTicket: d.travel.needsTicket,
    needsAccommodation: d.travel.needsAccommodation,
    observations: d.observations.trim() === "" ? null : d.observations.trim(),
  };
}

/** Erros de validação do rascunho (vazio = ok). Mensagens em pt-BR. */
export function validateDraft(d: ProposedDraft, type: ChangeRequestType): string[] {
  const out: string[] = [];
  if (type === "inclusao") {
    const q = Number(d.quantity);
    if (!Number.isInteger(q) || q < 1) out.push("Quantidade deve ser um inteiro maior ou igual a 1.");
  }
  if (type !== "exclusao" && d.workDays.length === 0) out.push("Informe ao menos um dia de trabalho.");
  if (d.dailyRates.trim() !== "") {
    const n = Number(d.dailyRates);
    if (!Number.isInteger(n) || n < 0) out.push("Diárias devem ser um número inteiro (0 ou mais).");
  }
  out.push(...validateTravel(d.travel));
  return out;
}

/**
 * proposedChanges { v: 1, ... } a partir do rascunho.
 *  - AJUSTE com `base`: só os campos que diferem da vaga (o servidor rejeita
 *    ajuste sem nenhum campo); sem `base`: todos os campos preenchidos.
 *  - INCLUSÃO: objeto completo + quantity.
 *  - EXCLUSÃO: { v: 1 }.
 * Devolve null quando o ajuste não muda nada.
 */
export function draftToProposed(d: ProposedDraft, type: ChangeRequestType, base?: TeamInclusion | null): ProposedChanges | null {
  if (type === "exclusao") return { v: 1 };
  const full = fullFromDraft(d);
  if (type === "inclusao") {
    const out: ProposedChanges = { v: 1, quantity: Number(d.quantity) || 1, workDays: d.workDays, dailyRates: full.dailyRates ?? d.workDays.length };
    out.needsTicket = full.needsTicket;
    out.needsAccommodation = full.needsAccommodation;
    for (const k of ["transportModeIda", "transportModeVolta", "flightDepartureDate", "flightDepartureSuggestedTime", "flightArrivalSuggestedTime", "flightReturnDate", "flightReturnSuggestedTime", "observations"] as const) {
      const v = full[k];
      if (v !== null && v !== undefined) (out as Record<string, unknown>)[k] = v;
    }
    return out;
  }
  // ajuste
  if (base) {
    const diff = diffInclusion(base, full);
    if (diff.length === 0) return null;
    const out: ProposedChanges = { v: 1 };
    for (const e of diff) (out as Record<string, unknown>)[e.field] = full[e.field];
    return out;
  }
  const out: ProposedChanges = { v: 1 };
  for (const [k, v] of Object.entries(full)) {
    if (k === "v" || v === undefined) continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return Object.keys(out).length > 1 ? out : null;
}

interface ProposedChangesFormProps {
  type: ChangeRequestType;
  value: ProposedDraft;
  onChange: (next: ProposedDraft) => void;
  event?: Event | null;
  disabled?: boolean;
  idPrefix?: string;
}

/**
 * Formulário dos campos propostos (mesmo conjunto do pedido de ajuste/inclusão
 * da área), reaproveitando WorkDaysPicker + TravelFields da Validação de Escala.
 */
export function ProposedChangesForm({ type, value, onChange, event, disabled, idPrefix = "rev" }: ProposedChangesFormProps) {
  const set = (patch: Partial<ProposedDraft>) => onChange({ ...value, ...patch });
  const onDays = (days: string[]) => {
    // Diárias seguem os dias enquanto estiverem iguais ao total anterior (padrão 1/dia).
    const follows = value.dailyRates.trim() === "" || Number(value.dailyRates) === value.workDays.length;
    set({ workDays: days, dailyRates: follows && days.length > 0 ? String(days.length) : value.dailyRates });
  };
  return (
    <div className="space-y-4">
      {type === "inclusao" && (
        <div className="space-y-1 max-w-[160px]">
          <Label htmlFor={`${idPrefix}-qty`} className="text-xs text-slate-600">Quantidade de vagas</Label>
          <Input id={`${idPrefix}-qty`} type="number" min={1} step={1} value={value.quantity} disabled={disabled} onChange={(e) => set({ quantity: e.target.value })} className="h-9 rounded-lg" />
        </div>
      )}
      <div className="space-y-2">
        <Label className="text-xs text-slate-600">Dias de trabalho <span className="text-red-400">*</span></Label>
        <WorkDaysPicker rangeStart={event?.startDate ?? ""} rangeEnd={event?.endDate ?? ""} value={value.workDays} onChange={onDays} disabled={disabled} />
      </div>
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-daily`} className="text-xs text-slate-600">Diárias</Label>
          <Input id={`${idPrefix}-daily`} type="number" min={0} step={1} value={value.dailyRates} disabled={disabled} onChange={(e) => set({ dailyRates: e.target.value })} className="h-9 rounded-lg" />
          <p className="text-[11px] text-slate-400">Padrão: {formatDiarias(value.workDays.length)} (1 por dia).</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-obs`} className="text-xs text-slate-600">Observações da vaga</Label>
          <Textarea id={`${idPrefix}-obs`} rows={2} maxLength={500} value={value.observations} disabled={disabled} onChange={(e) => set({ observations: e.target.value })} className="rounded-lg text-sm" />
        </div>
      </div>
      <TravelFields idPrefix={idPrefix} value={value.travel} disabled={disabled} onChange={(p) => set({ travel: { ...value.travel, ...p } })} />
    </div>
  );
}

export default ProposedChangesForm;
