// Regras compartilhadas do formulário de passagem (modal individual e lote).
//
// Os horários gravados aqui alimentam o Planejado: mobilidade (janela de
// madrugada — chegada entre 20h e 5h) e alimentação (chegada ≤11h almoço,
// ≤19h jantar; retorno ≥13h/≥21h). Por isso obrigatoriedade, montagem do
// payload e validação cronológica vivem num único lugar — antes cada fluxo
// tinha a sua cópia e elas divergiam (o lote descartava os aeroportos da
// volta, o modal não exigia o horário de chegada, os asteriscos da UI não
// batiam com o que era validado).
import { parseBrNumber } from "@/lib/utils";

export type TransportType = "aereo" | "rodoviario" | "van";

/** Estado bruto do formulário (strings vindas dos inputs). */
export type TicketFormData = Record<string, any>;

export interface RequiredField {
  field: string;
  label: string;
}

/** Valor monetário em centavos. Aceita "1.500,00" e "1500.00"; vazio vira null. */
export function toCents(raw: any): number | null {
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  return Math.round(parseBrNumber(raw) * 100);
}

export function normalizeTransportType(value: any): TransportType {
  return value === "rodoviario" || value === "van" ? value : "aereo";
}

/**
 * Campos obrigatórios por modalidade — fonte única para validação E para os
 * asteriscos da UI. Os rótulos são exatamente os que aparecem nos formulários.
 *
 * "Chegada (ida)" é obrigatória para aéreo e rodoviário: sem ela o Planejado
 * não sabe se o colaborador tem direito a almoço/jantar no dia da chegada nem
 * se a mobilidade cai na janela de madrugada. Van não tem horário de chegada.
 */
export function getRequiredFields(transportType: any, isOneWay: boolean): RequiredField[] {
  const type = normalizeTransportType(transportType);
  if (type === "van") {
    return [{ field: "purchaseOrderNumber", label: "Nome da Empresa" }];
  }
  const isRodo = type === "rodoviario";
  const base: RequiredField[] = [
    { field: "purchaseOrderNumber", label: isRodo ? "Bilhete" : "LOC" },
    ...(isRodo ? [] : [{ field: "value", label: "Valor da Passagem" }]),
    { field: "departureAirport", label: isRodo ? "Rodoviária Origem" : "Aeroporto Origem" },
    { field: "destinationAirport", label: isRodo ? "Rodoviária Destino" : "Aeroporto Destino" },
    { field: "actualDepartureDate", label: "Data (ida)" },
    { field: "actualDepartureTime", label: "Horário (ida)" },
    { field: "actualArrivalTime", label: "Chegada (ida)" },
  ];
  if (isOneWay) return base;
  return [
    ...base,
    { field: "actualReturnDate", label: "Data (volta)" },
    { field: "actualReturnTime", label: "Horário (volta)" },
  ];
}

export function isFieldRequired(transportType: any, isOneWay: boolean, field: string): boolean {
  return getRequiredFields(transportType, isOneWay).some(f => f.field === field);
}

const isBlank = (v: any) => v === undefined || v === null || String(v).trim() === "";

/** Devolve os campos obrigatórios não preenchidos (com rótulo). */
export function getMissingRequiredFields(form: TicketFormData): RequiredField[] {
  const type = normalizeTransportType(form?.transportType);
  return getRequiredFields(type, !!form?.isOneWay).filter(({ field }) => isBlank(form?.[field]));
}

/**
 * Payload único enviado ao servidor (POST e PATCH). Van zera todos os campos
 * de trecho; "apenas ida" zera os de volta. Os aeroportos/rodoviárias da
 * VOLTA sempre entram — o lote os descartava e o que o usuário digitava sumia.
 */
export function buildTicketPayload(
  form: TicketFormData,
  opts: { teamInclusionId?: string; today?: string } = {},
): Record<string, any> {
  const type = normalizeTransportType(form?.transportType);
  const isVan = type === "van";
  const oneWay = !!form?.isOneWay;
  const orNull = (v: any) => (isBlank(v) ? null : v);
  const leg = (v: any) => (isVan ? null : orNull(v));
  const ret = (v: any) => (isVan || oneWay ? null : orNull(v));
  const today = opts.today ?? new Date().toISOString().split("T")[0];

  return {
    ...(opts.teamInclusionId ? { teamInclusionId: opts.teamInclusionId } : {}),
    transportType: type,
    value: isVan ? null : toCents(form?.value),
    purchaseDate: form?.purchaseDate || today,
    actualDepartureDate: leg(form?.actualDepartureDate),
    actualDepartureTime: leg(form?.actualDepartureTime),
    actualArrivalTime: leg(form?.actualArrivalTime),
    actualReturnDate: ret(form?.actualReturnDate),
    actualReturnTime: ret(form?.actualReturnTime),
    departureCityOrigin: leg(form?.departureCityOrigin),
    departureCityDestination: leg(form?.departureCityDestination),
    returnCityOrigin: ret(form?.returnCityOrigin),
    returnCityDestination: ret(form?.returnCityDestination),
    departureAirport: leg(form?.departureAirport),
    destinationAirport: leg(form?.destinationAirport),
    returnOriginAirport: ret(form?.returnOriginAirport),
    returnDestinationAirport: ret(form?.returnDestinationAirport),
    purchaseOrderNumber: orNull(form?.purchaseOrderNumber),
    // fileUrl é legado (voucher antigo) e nenhum input da tela o preenche:
    // só entra no payload se o form o trouxer explicitamente — senão um PATCH
    // apagaria o voucher de passagens antigas.
    ...(form?.fileUrl !== undefined ? { fileUrl: orNull(form.fileUrl) } : {}),
    attachmentIds: Array.isArray(form?.attachmentIds) && form.attachmentIds.length > 0 ? form.attachmentIds : null,
    cardLastFourDigits: isVan ? null : orNull(form?.cardLastFourDigits),
    ticketObservations: orNull(form?.ticketObservations),
  };
}

// ─── Validação cronológica ────────────────────────────────────────────────

export interface ChronologyContext {
  /** "YYYY-MM-DD" — injetável para testes. */
  today?: string;
  scheduleStartDate?: string | null;
  scheduleEndDate?: string | null;
}

export interface ChronologyResult {
  /** Erros bloqueantes, por campo. */
  errors: Record<string, string>;
  /** Avisos não bloqueantes ("continuar mesmo assim"). */
  warnings: string[];
}

const dateOnly = (v: any): string | null => {
  if (isBlank(v)) return null;
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

const timeOnly = (v: any): string | null => {
  if (isBlank(v)) return null;
  const m = String(v).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
};

const fmtBr = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Função pura. Strings "YYYY-MM-DD" e "HH:MM" comparam-se lexicograficamente,
 * então nada passa por new Date() (que leria a data como UTC e voltaria um dia).
 */
export function validateTicketChronology(form: TicketFormData, ctx: ChronologyContext = {}): ChronologyResult {
  const errors: Record<string, string> = {};
  const warnings: string[] = [];
  const today = ctx.today ?? todayIso();
  const type = normalizeTransportType(form?.transportType);

  const purchase = dateOnly(form?.purchaseDate);
  if (purchase && purchase > today) {
    errors.purchaseDate = "A data da compra não pode estar no futuro.";
  }

  if (type === "van") return { errors, warnings };

  const dep = dateOnly(form?.actualDepartureDate);
  const depTime = timeOnly(form?.actualDepartureTime);
  const arrTime = timeOnly(form?.actualArrivalTime);
  const oneWay = !!form?.isOneWay;
  const ret = oneWay ? null : dateOnly(form?.actualReturnDate);
  const retTime = oneWay ? null : timeOnly(form?.actualReturnTime);

  if (dep && ret) {
    if (ret < dep) {
      errors.actualReturnDate = `A volta (${fmtBr(ret)}) não pode ser antes da ida (${fmtBr(dep)}).`;
    } else if (ret === dep && depTime && retTime && retTime < depTime) {
      errors.actualReturnTime = `No mesmo dia, o horário da volta (${retTime}) não pode ser antes da ida (${depTime}).`;
    }
  }

  // Chegada antes da partida: quase sempre erro de digitação, mas voos noturnos
  // (parte 23:00, chega 01:30 do dia seguinte) existem e a chegada de madrugada
  // é justamente o que dispara a mobilidade especial. Por isso é aviso, não erro.
  if (depTime && arrTime && arrTime < depTime) {
    warnings.push(
      `Chegada (${arrTime}) anterior à partida (${depTime}) — confirme se o trecho chega no dia seguinte.`,
    );
  }

  const start = dateOnly(ctx.scheduleStartDate);
  const end = dateOnly(ctx.scheduleEndDate);
  if (dep && start && dep > start) {
    warnings.push(`A ida (${fmtBr(dep)}) é depois do início do período de trabalho (${fmtBr(start)}).`);
  }
  if (ret && end && ret < end) {
    warnings.push(`A volta (${fmtBr(ret)}) é antes do término do período de trabalho (${fmtBr(end)}).`);
  }

  return { errors, warnings };
}

/** Há algo digitado além de defaults automáticos (para "Descartar alterações?"). */
export function hasUnsavedTicketInput(form: TicketFormData | undefined, ignore: string[] = []): boolean {
  if (!form) return false;
  return Object.entries(form).some(([k, v]) => {
    if (ignore.includes(k)) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "boolean") return v;
    return !isBlank(v);
  });
}
