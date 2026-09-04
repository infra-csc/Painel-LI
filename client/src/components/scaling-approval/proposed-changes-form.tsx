import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDayMonthBr } from "@/lib/dates";
import { DiariasDerivadas } from "@/components/scaling-validation/vaga-card";
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
  // Diárias não entram mais na validação: são 1 por dia de trabalho, derivadas.
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
  /**
   * Dias que a área pediu. Servem de referência dentro do próprio campo: o
   * aprovador vê o que foi pedido enquanto mexe, e consegue voltar a ele.
   */
  diasPedidos?: string[];
}

const ddmm = (d: string) => formatDayMonthBr(d);

/** "incluiu 13/09 · tirou 09/09" — vazio quando a seleção é a mesma do pedido. */
function divergenciaDeDias(escolhidos: string[], pedidos: string[]): string {
  const set = new Set(pedidos);
  const meus = new Set(escolhidos);
  const incluiu = escolhidos.filter((d) => !set.has(d));
  const tirou = pedidos.filter((d) => !meus.has(d));
  if (!incluiu.length && !tirou.length) return "";
  return [
    incluiu.length ? `incluiu ${incluiu.map(ddmm).join(", ")}` : "",
    tirou.length ? `tirou ${tirou.map(ddmm).join(", ")}` : "",
  ].filter(Boolean).join(" · ");
}

/**
 * Formulário dos campos propostos (mesmo conjunto do pedido de ajuste/inclusão
 * da área), reaproveitando WorkDaysPicker + TravelFields da Validação de Escala.
 */
export function ProposedChangesForm({ type, value, onChange, event, disabled, idPrefix = "rev", diasPedidos }: ProposedChangesFormProps) {
  const set = (patch: Partial<ProposedDraft>) => onChange({ ...value, ...patch });
  // Diárias são 1 por dia de trabalho — acompanham os dias, sempre.
  const onDays = (days: string[]) => set({ workDays: days, dailyRates: String(days.length) });
  const pedidos = diasPedidos ?? [];
  const divergencia = pedidos.length ? divergenciaDeDias(value.workDays, pedidos) : "";
  return (
    <div className="space-y-4">
      {type === "inclusao" && (
        <div className="space-y-1 max-w-[160px]">
          <Label htmlFor={`${idPrefix}-qty`} className="text-xs text-slate-600">Quantidade de vagas</Label>
          <Input id={`${idPrefix}-qty`} type="number" min={1} step={1} value={value.quantity} disabled={disabled} onChange={(e) => set({ quantity: e.target.value })} className="h-9 rounded-lg" />
        </div>
      )}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label className="text-xs text-slate-600">Dias de trabalho <span className="text-red-400">*</span></Label>
          {pedidos.length > 0 && (
            <Button type="button" size="sm" variant="outline" className="h-7 rounded-lg text-xs" disabled={disabled || !divergencia}
              title="Devolve a seleção para exatamente os dias que a área pediu"
              onClick={() => onDays([...pedidos].sort())}>
              Voltar ao pedido
            </Button>
          )}
        </div>
        <WorkDaysPicker rangeStart={event?.startDate ?? ""} rangeEnd={event?.endDate ?? ""} value={value.workDays} onChange={onDays} disabled={disabled} pedidos={pedidos} />
        {/* Divergência ao vivo: sem ela, o aprovador mexe nos dias e perde a
            conta do que já mudou em relação ao que foi pedido. */}
        {pedidos.length > 0 && (
          <p className={divergencia ? "text-[11px] text-amber-700" : "text-[11px] text-slate-500"} aria-live="polite">
            {divergencia ? `Você alterou o pedido: ${divergencia}.` : "Igual ao que a área pediu — nenhum dia alterado por você."}
          </p>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <DiariasDerivadas id={`${idPrefix}-daily`} dias={value.workDays.length} />
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-obs`} className="text-xs text-slate-600">Observações da vaga</Label>
          <Textarea id={`${idPrefix}-obs`} rows={2} maxLength={500} value={value.observations} disabled={disabled} onChange={(e) => set({ observations: e.target.value })} className="rounded-lg text-sm" />
        </div>
      </div>
      <TravelFields idPrefix={idPrefix} value={value.travel} workDays={value.workDays} disabled={disabled} onChange={(p) => set({ travel: { ...value.travel, ...p } })} />
    </div>
  );
}

export default ProposedChangesForm;
