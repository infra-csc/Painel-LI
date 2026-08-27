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
import { mobilidadeTrechoCents, isEventoEmSP, parseHoraMin, MOBILIDADE_TRECHO_MADRUGADA_CENTS } from "@shared/atendimento";
import { calcAlimentacao, type AlimentacaoDia } from "@shared/alimentacao";

export type TransportType = "aereo" | "rodoviario" | "van";

/**
 * Estado bruto do formulário (strings vindas dos inputs). Os campos conhecidos
 * são tipados; o index signature mantém o acesso dinâmico por nome de campo
 * (validação/asteriscos iteram sobre `RequiredField.field`).
 */
export interface TicketFormValues {
  transportType?: TransportType | string;
  isOneWay?: boolean;
  value?: string;
  purchaseDate?: string;
  purchaseOrderNumber?: string;
  departureCityOrigin?: string;
  departureCityDestination?: string;
  returnCityOrigin?: string;
  returnCityDestination?: string;
  departureAirport?: string;
  destinationAirport?: string;
  returnOriginAirport?: string;
  returnDestinationAirport?: string;
  actualDepartureDate?: string;
  actualDepartureTime?: string;
  actualArrivalTime?: string;
  actualReturnDate?: string;
  actualReturnTime?: string;
  cardLastFourDigits?: string;
  ticketObservations?: string;
  attachmentIds?: string[];
  fileUrl?: string | null;
  [key: string]: unknown;
}

export type TicketFormData = TicketFormValues;

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

// ─── Sugestões da escalação ───────────────────────────────────────────────

/** Datas/horários sugeridos pela escalação (campos específicos ou legado nas observações). */
export interface TravelSuggestion {
  ida: string;
  retorno: string;
  /** Horário sugerido de CHEGADA da ida (texto livre: "9h", "09:30"). */
  chegada: string;
  /** Horário sugerido de PARTIDA da volta (texto livre). */
  horario: string;
  /** Horário sugerido de PARTIDA da ida — só existe nos campos específicos. */
  partida?: string;
}

const SUGGESTION_EMPTY = new Set(["", "N/A", "Não definido", "Não informado"]);

/** O valor de sugestão tem conteúdo real (não é placeholder)? */
export function hasSuggestionValue(v: string | null | undefined): v is string {
  return !!v && !SUGGESTION_EMPTY.has(v);
}

interface SuggestionSource {
  observations?: string | null;
  flightDepartureDate?: string | null;
  flightDepartureSuggestedTime?: string | null;
  flightArrivalSuggestedTime?: string | null;
  flightReturnDate?: string | null;
  flightReturnSuggestedTime?: string | null;
}

/**
 * Extrai a sugestão de viagem: PRIORIDADE para os campos específicos da
 * inclusão; FALLBACK para o texto legado das observações ("Ida: ... | Retorno: ...").
 */
export function extractTravelSuggestion(inclusion: SuggestionSource | null | undefined): TravelSuggestion {
  if (inclusion && (inclusion.flightDepartureDate || inclusion.flightArrivalSuggestedTime ||
      inclusion.flightReturnDate || inclusion.flightReturnSuggestedTime)) {
    return {
      ida: inclusion.flightDepartureDate || "Não informado",
      retorno: inclusion.flightReturnDate || "Não informado",
      chegada: inclusion.flightArrivalSuggestedTime || "Não informado",
      horario: inclusion.flightReturnSuggestedTime || "Não informado",
      partida: inclusion.flightDepartureSuggestedTime || undefined,
    };
  }
  const observations = inclusion?.observations;
  if (observations && observations.trim()) {
    const pick = (label: string) => {
      const m = observations.match(new RegExp(`${label}:\\s*([^|]*?)(?:\\s*\\||\\s*$)`));
      return m && m[1].trim() ? m[1].trim() : null;
    };
    const ida = pick("Ida"), retorno = pick("Retorno"), chegada = pick("Chegada"), horario = pick("Horário");
    if (ida || retorno || chegada || horario) {
      return {
        ida: ida ?? "Não definido",
        retorno: retorno ?? "Não definido",
        chegada: chegada ?? "Não definido",
        horario: horario ?? "Não definido",
      };
    }
  }
  return { ida: "Não informado", retorno: "Não informado", chegada: "Não informado", horario: "Não informado" };
}

export function hasAnySuggestion(s: TravelSuggestion): boolean {
  return hasSuggestionValue(s.ida) || hasSuggestionValue(s.retorno) || hasSuggestionValue(s.chegada) || hasSuggestionValue(s.horario);
}

/** Formata a data sugerida para DD/MM/YYYY sem passar por new Date(). */
export function formatSuggestionDate(dateStr: string | null | undefined): string {
  if (!hasSuggestionValue(dateStr)) return "Não informado";
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) return dateStr;
  const m = dateStr.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[3].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[1]}`;
  return dateStr;
}

/** "YYYY-MM-DD" a partir de "YYYY-MM-DD..." ou "DD/MM/YYYY"; null se não reconhecer. */
export function suggestionDateToIso(dateStr: string | null | undefined): string | null {
  if (!hasSuggestionValue(dateStr)) return null;
  let m = dateStr.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/** Minutos desde a meia-noite → "HH:MM" (valor aceito por <input type="time">). */
export function minutesToHHMM(min: number | null): string | null {
  if (min === null || !Number.isFinite(min)) return null;
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Texto livre da escalação ("9h", "0930", "onibus - 10h") → "HH:MM" ou null. */
export function suggestionTimeToHHMM(texto: string | null | undefined): string | null {
  if (!hasSuggestionValue(texto)) return null;
  return minutesToHHMM(parseHoraMin(texto));
}

/**
 * "Usar sugestão": campos a preencher a partir da sugestão da escalação.
 * Só devolve o que conseguiu normalizar — se o horário não parseia, preenche
 * só a data. Por padrão não apaga o que o usuário já digitou (`overwrite`).
 */
export function suggestionToFormPatch(
  s: TravelSuggestion,
  current: TicketFormValues | undefined,
  opts: { overwrite?: boolean } = {},
): Partial<TicketFormValues> {
  const patch: Partial<TicketFormValues> = {};
  const set = (field: keyof TicketFormValues & string, value: string | null) => {
    if (!value) return;
    if (!opts.overwrite && !isBlank(current?.[field])) return;
    patch[field] = value;
  };
  set("actualDepartureDate", suggestionDateToIso(s.ida));
  set("actualDepartureTime", suggestionTimeToHHMM(s.partida));
  set("actualArrivalTime", suggestionTimeToHHMM(s.chegada));
  if (!current?.isOneWay) {
    set("actualReturnDate", suggestionDateToIso(s.retorno));
    set("actualReturnTime", suggestionTimeToHHMM(s.horario));
  }
  return patch;
}

/** Limite (minutos) a partir do qual o horário comprado é "muito diferente" da sugestão. */
export const SUGGESTION_DIVERGENCE_MIN = 4 * 60;

/**
 * Avisos (informativos) quando o comprado diverge muito da sugestão: dia
 * diferente ou horário a mais de 4h. Compara ida (data + chegada) e volta
 * (data + partida). Sem sugestão ou sem valor digitado → sem aviso.
 */
export function suggestionDivergences(form: TicketFormValues | undefined, s: TravelSuggestion): string[] {
  const out: string[] = [];
  if (!form || normalizeTransportType(form.transportType) === "van") return out;

  const cmpDate = (label: string, bought: unknown, sug: string) => {
    const b = dateOnly(bought), g = suggestionDateToIso(sug);
    if (b && g && b !== g) out.push(`${label}: comprada em ${fmtBr(b)}, sugestão era ${fmtBr(g)}.`);
  };
  const cmpTime = (label: string, bought: unknown, sug: string) => {
    const b = parseHoraMin(timeOnly(bought)), g = parseHoraMin(hasSuggestionValue(sug) ? sug : null);
    if (b === null || g === null) return;
    const diff = Math.abs(b - g);
    if (diff > SUGGESTION_DIVERGENCE_MIN) {
      out.push(`${label}: ${minutesToHHMM(b)}, sugestão era ${minutesToHHMM(g)} (${Math.round(diff / 60)}h de diferença).`);
    }
  };

  cmpDate("Data da ida", form.actualDepartureDate, s.ida);
  cmpTime("Chegada da ida", form.actualArrivalTime, s.chegada);
  if (!form.isOneWay) {
    cmpDate("Data da volta", form.actualReturnDate, s.retorno);
    cmpTime("Horário da volta", form.actualReturnTime, s.horario);
  }
  return out;
}

// ─── Impacto no Planejado (informativo) ───────────────────────────────────

export interface PlannedImpactContext {
  /** Dias do período de trabalho (YYYY-MM-DD). Se vazio, o resumo de alimentação sai só como "1º/último dia". */
  workDays?: string[] | null;
  /** Local do evento — em SP a mobilidade é zero (regra do dono, 26/08). */
  eventLocation?: string | null;
  almocoCents?: number;
  jantarCents?: number;
}

export interface PlannedImpact {
  mobilidade: {
    ida: { cents: number; madrugada: boolean } | null;
    volta: { cents: number; madrugada: boolean } | null;
    totalCents: number;
  };
  alimentacao: {
    /** Refeições no dia da chegada, derivadas do horário de chegada (null se sem horário). */
    chegada: { almoco: boolean; jantar: boolean } | null;
    /** Refeições no dia da volta, derivadas do horário de partida da volta (null se sem horário/só ida). */
    retorno: { almoco: boolean; jantar: boolean } | null;
    /** Totais do período — só quando `workDays` foi informado. */
    periodo: { dias: number; almocos: number; jantares: number; totalCents: number; estimado: boolean } | null;
  };
}

/** Dias corridos entre início e fim (inclusive), sem passar por UTC. Mesma régua do Planejado. */
export function periodDays(start: string | null | undefined, end: string | null | undefined): string[] {
  const s = dateOnly(start), e = dateOnly(end);
  if (!s || !e || e < s) return [];
  const out: string[] = [];
  const cur = new Date(`${s}T12:00:00`);
  const endD = new Date(`${e}T12:00:00`);
  let guard = 0;
  while (cur <= endD && guard++ < 400) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

const dayMeals = (d: AlimentacaoDia | undefined) => (d ? { almoco: d.almoco, jantar: d.jantar } : null);

/**
 * Impacto no Planejado dos horários digitados — usa as MESMAS funções do
 * cálculo real (mobilidadeTrechoCents e calcAlimentacao). Van → null.
 * Somente informativo; não altera regra nenhuma.
 */
export function buildPlannedImpact(form: TicketFormValues | undefined, ctx: PlannedImpactContext = {}): PlannedImpact | null {
  if (!form || normalizeTransportType(form.transportType) === "van") return null;
  const oneWay = !!form.isOneWay;
  const depTime = timeOnly(form.actualDepartureTime);
  const arrTime = timeOnly(form.actualArrivalTime);
  const retTime = oneWay ? null : timeOnly(form.actualReturnTime);

  // Mesmas funções do Planejado. Rodoviário = terrestre → R$29 fixo por trecho
  // (a tabela de madrugada é "deslocamento AEROPORTO", só voo).
  const terrestre = normalizeTransportType(form.transportType) === "rodoviario";
  // Evento em SP não paga mobilidade: a prévia tem de dizer o mesmo que o
  // Planejado, senão a logística digita o horário e vê um custo que não existe.
  const emSP = isEventoEmSP(ctx.eventLocation);
  const trecho = (partida: string | null, chegada: string | null, kind: "ida" | "volta") => {
    const cents = emSP ? 0 : mobilidadeTrechoCents(partida, chegada, { trecho: kind, terrestre });
    return { cents, madrugada: cents === MOBILIDADE_TRECHO_MADRUGADA_CENTS };
  };
  const ida = depTime || arrTime ? trecho(depTime, arrTime, "ida") : null;
  const volta = retTime ? trecho(retTime, null, "volta") : null;

  const almocoCents = ctx.almocoCents ?? 4000;
  const jantarCents = ctx.jantarCents ?? 4000;

  // Flags do 1º/último dia: dois dias sintéticos bastam para ler a regra real.
  const flags = calcAlimentacao({
    workDays: ["0001-01-01", "0001-01-02"], voa: true,
    chegadaIda: arrTime, partidaVolta: retTime, almocoCents, jantarCents,
  });
  const chegada = arrTime ? dayMeals(flags.dias[0]) : null;
  const retorno = retTime ? dayMeals(flags.dias[1]) : null;

  let periodo: PlannedImpact["alimentacao"]["periodo"] = null;
  if (ctx.workDays && ctx.workDays.length > 0) {
    const r = calcAlimentacao({
      workDays: ctx.workDays, voa: true,
      chegadaIda: arrTime, partidaVolta: retTime, almocoCents, jantarCents,
    });
    periodo = { dias: r.dias.length, almocos: r.almocos, jantares: r.jantares, totalCents: r.totalCents, estimado: r.estimado };
  }

  return {
    mobilidade: { ida, volta, totalCents: (ida?.cents ?? 0) + (volta?.cents ?? 0) },
    alimentacao: { chegada, retorno, periodo },
  };
}

const brl = (cents: number) => `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const mealsLabel = (m: { almoco: boolean; jantar: boolean }) =>
  m.almoco && m.jantar ? "almoço + jantar" : m.almoco ? "só almoço" : m.jantar ? "só jantar" : "sem refeição";

/** Linhas curtas para a UI ("Ida: madrugada → R$ 58"). Vazio se nada foi digitado. */
export function formatPlannedImpact(impact: PlannedImpact | null): string[] {
  if (!impact) return [];
  const lines: string[] = [];
  const { ida, volta } = impact.mobilidade;
  if (ida) lines.push(`Ida: ${ida.madrugada ? "madrugada" : "padrão"} → ${brl(ida.cents)}`);
  if (volta) lines.push(`Volta: ${volta.madrugada ? "madrugada" : "padrão"} → ${brl(volta.cents)}`);
  const { chegada, retorno, periodo } = impact.alimentacao;
  if (chegada) lines.push(`Chegada → ${mealsLabel(chegada)} no 1º dia`);
  if (retorno) lines.push(`Volta → ${mealsLabel(retorno)} no último dia`);
  if (periodo && (chegada || retorno)) {
    lines.push(`Alimentação: ${periodo.almocos} almoço${periodo.almocos !== 1 ? "s" : ""} + ${periodo.jantares} jantar${periodo.jantares !== 1 ? "es" : ""} em ${periodo.dias} dia${periodo.dias !== 1 ? "s" : ""} → ${brl(periodo.totalCents)}${periodo.estimado ? " (estimado)" : ""}`);
  }
  return lines;
}

// ─── KPI de valor das compradas ───────────────────────────────────────────

export function purchasedValueKpi(values: Array<number | null | undefined>): { count: number; totalCents: number; avgCents: number } {
  const valid = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
  const totalCents = valid.reduce((a, b) => a + b, 0);
  return { count: valid.length, totalCents, avgCents: valid.length ? Math.round(totalCents / valid.length) : 0 };
}

// ─── Passagem gravada → formulário (Editar Passagem) ──────────────────────

/** Subconjunto do Ticket do banco lido pelo formulário. */
export interface StoredTicketLike {
  transportType?: string | null;
  value?: number | null;
  purchaseDate?: string | null;
  departureAirport?: string | null;
  destinationAirport?: string | null;
  departureCityOrigin?: string | null;
  departureCityDestination?: string | null;
  returnCityOrigin?: string | null;
  returnCityDestination?: string | null;
  returnOriginAirport?: string | null;
  returnDestinationAirport?: string | null;
  purchaseOrderNumber?: string | null;
  actualDepartureDate?: string | null;
  actualReturnDate?: string | null;
  actualDepartureTime?: string | null;
  actualArrivalTime?: string | null;
  actualReturnTime?: string | null;
  cardLastFourDigits?: string | null;
  ticketObservations?: string | null;
  attachmentIds?: string[] | null;
}

/**
 * "Só ida" NÃO existe no banco: o formulário grava os campos de volta como
 * null quando o usuário marca "Apenas ida". Derivamos da ausência desses dados.
 */
export function isStoredTicketOneWay(t: StoredTicketLike): boolean {
  return !t.actualReturnDate && !t.actualReturnTime && !t.returnCityOrigin && !t.returnCityDestination;
}

/** Prefill do formulário a partir da passagem gravada (valor em centavos → texto). */
export function ticketToFormValues(t: StoredTicketLike): TicketFormValues {
  const s = (v: string | null | undefined) => v || "";
  return {
    transportType: t.transportType || "aereo",
    isOneWay: isStoredTicketOneWay(t),
    value: ((t.value || 0) / 100).toString(),
    purchaseDate: s(t.purchaseDate),
    departureAirport: s(t.departureAirport),
    destinationAirport: s(t.destinationAirport),
    departureCityOrigin: s(t.departureCityOrigin),
    departureCityDestination: s(t.departureCityDestination),
    returnCityOrigin: s(t.returnCityOrigin),
    returnCityDestination: s(t.returnCityDestination),
    returnOriginAirport: s(t.returnOriginAirport),
    returnDestinationAirport: s(t.returnDestinationAirport),
    purchaseOrderNumber: s(t.purchaseOrderNumber),
    actualDepartureDate: s(t.actualDepartureDate),
    actualReturnDate: s(t.actualReturnDate),
    actualDepartureTime: s(t.actualDepartureTime),
    actualArrivalTime: s(t.actualArrivalTime),
    actualReturnTime: s(t.actualReturnTime),
    cardLastFourDigits: s(t.cardLastFourDigits),
    ticketObservations: s(t.ticketObservations),
    attachmentIds: t.attachmentIds || [],
  };
}
