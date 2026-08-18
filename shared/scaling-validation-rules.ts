/**
 * Regras puras da Validação de Escala (sem I/O), compartilhadas entre client e
 * servidor.
 *
 * Fluxo: a escala nasce como SUGESTÃO da logística (team_inclusions com
 * phase 'sugestao'), cada área valida a parte dela e um aprovador central
 * (function_managers.role = 'aprovador') decide os pedidos de ajuste /
 * inclusão / exclusão (scaling_change_requests). Quando a vaga é aprovada ela
 * vira uma Inclusão comum: { phase: 'inclusao', status: 'planejado' } — a
 * MESMA linha de team_inclusions, nunca uma tabela paralela.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Constantes / tipos
// ---------------------------------------------------------------------------

export const SUGESTAO_PHASE = "sugestao" as const;
export type SugestaoPhase = typeof SUGESTAO_PHASE;

export const SUGESTAO_STATUS = {
  PENDENTE: "sugestao_pendente",
  VALIDADA: "sugestao_validada",
  AJUSTE: "sugestao_ajuste",
  APROVADA: "sugestao_aprovada",
  NEGADA: "sugestao_negada",
} as const;
export type SugestaoStatus = (typeof SUGESTAO_STATUS)[keyof typeof SUGESTAO_STATUS];
export const SUGESTAO_STATUS_VALUES = Object.values(SUGESTAO_STATUS) as SugestaoStatus[];

export const SUGESTAO_STATUS_LABELS: Record<SugestaoStatus, string> = {
  sugestao_pendente: "Aguardando validação da área",
  sugestao_validada: "Validada pela área",
  sugestao_ajuste: "Com pedido de ajuste",
  sugestao_aprovada: "Aprovada",
  sugestao_negada: "Negada",
};

export const TRANSPORT_MODES = ["aereo", "onibus", "van", "carro", "transfer"] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];
export const TRANSPORT_MODE_LABELS: Record<TransportMode, string> = {
  aereo: "Aéreo",
  onibus: "Ônibus",
  van: "Van",
  carro: "Carro",
  transfer: "Transfer",
};

export const CHANGE_REQUEST_TYPES = ["ajuste", "inclusao", "exclusao"] as const;
export type ChangeRequestType = (typeof CHANGE_REQUEST_TYPES)[number];
export const CHANGE_REQUEST_TYPE_LABELS: Record<ChangeRequestType, string> = {
  ajuste: "Ajuste",
  inclusao: "Inclusão",
  exclusao: "Exclusão",
};

export const CHANGE_REQUEST_STATUS = {
  PENDENTE: "pendente",
  APROVADO: "aprovado",
  REAJUSTADO: "reajustado",
  NEGADO: "negado",
  REENVIADO_VALIDACAO: "reenviado_validacao",
} as const;
export type ChangeRequestStatus = (typeof CHANGE_REQUEST_STATUS)[keyof typeof CHANGE_REQUEST_STATUS];
export const CHANGE_REQUEST_STATUS_VALUES = Object.values(CHANGE_REQUEST_STATUS) as ChangeRequestStatus[];
export const CHANGE_REQUEST_STATUS_LABELS: Record<ChangeRequestStatus, string> = {
  pendente: "Pendente",
  aprovado: "Aprovado",
  reajustado: "Reajustado",
  negado: "Negado",
  reenviado_validacao: "Reenviado para validação",
};

/** Papel do usuário na função (function_managers.role). */
export const FUNCTION_MANAGER_ROLES = ["validador", "aprovador"] as const;
export type FunctionManagerRole = (typeof FUNCTION_MANAGER_ROLES)[number];

// ---------------------------------------------------------------------------
// Estado da vaga
// ---------------------------------------------------------------------------

export interface SuggestionState {
  status: string;
  phase: string;
}

/** Estado final quando a sugestão é aprovada: vira Inclusão comum. */
export function toInclusaoState(): { phase: "inclusao"; status: "planejado" } {
  return { phase: "inclusao", status: "planejado" };
}

/** A vaga ainda está na etapa de sugestão (Validação de Escala)? */
export function isSuggestionInclusion(inclusion: { phase?: string | null } | null | undefined): boolean {
  return inclusion?.phase === SUGESTAO_PHASE;
}

export const SUGGESTION_ACTIONS = [
  "validar",                  // área valida a vaga sem pedido
  "pedir_ajuste",             // área abre pedido (ajuste/exclusão) sobre a vaga
  "aprovar_pedido",           // aprovador aceita o pedido como veio
  "reajustar_reenviar",       // aprovador altera o pedido e devolve para a área validar
  "reajustar_aprovar_direto", // aprovador altera o pedido e aprova sem nova validação
  "negar_reenviar",           // aprovador nega o pedido e devolve para a área validar
  "negar_aprovar_direto",     // aprovador nega o pedido e aprova a vaga como estava
  "aprovar_direto_bypass",    // aprovador aprova vaga que a área nunca validou
  "reprovar_bypass",          // aprovador reprova vaga que a área nunca validou (fica registrada)
] as const;
export type SuggestionAction = (typeof SUGGESTION_ACTIONS)[number];

export const SUGGESTION_ACTION_LABELS: Record<SuggestionAction, string> = {
  validar: "Validar",
  pedir_ajuste: "Pedir ajuste",
  aprovar_pedido: "Aprovar pedido",
  reajustar_reenviar: "Reajustar e reenviar para validação",
  reajustar_aprovar_direto: "Reajustar e aprovar direto",
  negar_reenviar: "Negar e reenviar para validação",
  negar_aprovar_direto: "Negar e aprovar direto",
  aprovar_direto_bypass: "Aprovar direto (sem validação da área)",
  reprovar_bypass: "Reprovar (sem validação da área)",
};

export interface NextSuggestionStateOptions {
  /**
   * Tipo do pedido sendo decidido (só relevante em `aprovar_pedido`): quando o
   * pedido aprovado é de EXCLUSÃO a vaga não vira inclusão — fica registrada
   * como sugestao_negada.
   */
  requestType?: ChangeRequestType;
}

/**
 * Máquina de transição da vaga na Validação de Escala.
 *
 *   sugestao_pendente --validar--> sugestao_validada --(sem pedido)--> sugestao_aprovada
 *                                                    ==> {phase:'inclusao', status:'planejado'}
 *   sugestao_pendente --pedir_ajuste--> sugestao_ajuste
 *   sugestao_ajuste   --aprovar_pedido--> (aplica) --> inclusao/planejado
 *                                          (requestType 'exclusao' -> sugestao_negada)
 *   sugestao_ajuste   --reajustar_reenviar | negar_reenviar--> sugestao_pendente
 *   sugestao_ajuste   --reajustar_aprovar_direto | negar_aprovar_direto--> inclusao/planejado
 *   sugestao_pendente --aprovar_direto_bypass--> inclusao/planejado
 *   sugestao_pendente --reprovar_bypass--> sugestao_negada (fica registrada, não some)
 *
 * Retorna o estado FINAL já convertido (a passagem por sugestao_validada /
 * sugestao_aprovada é imediata e não persiste). Transição inválida lança Error
 * com mensagem em pt-BR.
 */
export function nextSuggestionState(
  current: SuggestionState,
  action: SuggestionAction,
  opts: NextSuggestionStateOptions = {},
): SuggestionState {
  if (current.phase !== SUGESTAO_PHASE) {
    throw new Error(
      `A vaga não está na etapa de Validação de Escala (fase atual: ${current.phase || "—"}). ` +
      `Ação "${SUGGESTION_ACTION_LABELS[action] ?? action}" não permitida.`,
    );
  }
  const S = SUGESTAO_STATUS;
  const invalid = () =>
    new Error(
      `Transição inválida: não é possível "${SUGGESTION_ACTION_LABELS[action] ?? action}" ` +
      `quando a vaga está em "${SUGESTAO_STATUS_LABELS[current.status as SugestaoStatus] ?? current.status}".`,
    );
  const sug = (status: SugestaoStatus): SuggestionState => ({ status, phase: SUGESTAO_PHASE });

  switch (action) {
    case "validar":
      // pendente -> validada -> (sem pedido) aprovada -> inclusão, tudo imediato
      if (current.status === S.PENDENTE) return toInclusaoState();
      throw invalid();

    case "pedir_ajuste":
      if (current.status === S.PENDENTE) return sug(S.AJUSTE);
      throw invalid();

    case "aprovar_pedido":
      if (current.status !== S.AJUSTE) throw invalid();
      // pedido de exclusão aprovado: a vaga não segue; fica registrada como negada
      if (opts.requestType === "exclusao") return sug(S.NEGADA);
      // aplica o ajuste e volta a "validada" -> aprovada -> inclusão
      return toInclusaoState();

    case "reajustar_reenviar":
    case "negar_reenviar":
      if (current.status === S.AJUSTE) return sug(S.PENDENTE);
      throw invalid();

    case "reajustar_aprovar_direto":
    case "negar_aprovar_direto":
      if (current.status === S.AJUSTE) return toInclusaoState();
      throw invalid();

    case "aprovar_direto_bypass":
      // só faz sentido para vaga que a área nunca validou
      if (current.status === S.PENDENTE) return toInclusaoState();
      throw invalid();

    case "reprovar_bypass":
      if (current.status === S.PENDENTE) return sug(S.NEGADA);
      throw invalid();

    default: {
      const never: never = action;
      throw new Error(`Ação desconhecida: ${String(never)}`);
    }
  }
}

/** Ações possíveis a partir do estado atual (para montar botões/menus). */
export function availableSuggestionActions(current: SuggestionState): SuggestionAction[] {
  return SUGGESTION_ACTIONS.filter((a) => {
    try { nextSuggestionState(current, a); return true; } catch { return false; }
  });
}

/** Status do pedido (scaling_change_requests) resultante de cada decisão do aprovador. */
export function requestStatusForAction(action: SuggestionAction): ChangeRequestStatus | null {
  switch (action) {
    case "aprovar_pedido": return CHANGE_REQUEST_STATUS.APROVADO;
    case "reajustar_reenviar": return CHANGE_REQUEST_STATUS.REENVIADO_VALIDACAO;
    case "reajustar_aprovar_direto": return CHANGE_REQUEST_STATUS.REAJUSTADO;
    case "negar_reenviar": return CHANGE_REQUEST_STATUS.NEGADO;
    case "negar_aprovar_direto": return CHANGE_REQUEST_STATUS.NEGADO;
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// proposedChanges (JSON versionado)
// ---------------------------------------------------------------------------

const DATE_YMD = /^\d{4}-\d{2}-\d{2}$/;
const TIME_HHMM = /^\d{2}:\d{2}$/;

const ymd = z.string().regex(DATE_YMD, "Data inválida (use AAAA-MM-DD)");
const hhmm = z.string().regex(TIME_HHMM, "Horário inválido (use HH:MM)");
const transportMode = z.enum(TRANSPORT_MODES);

export const proposedChangesSchema = z.object({
  v: z.literal(1),
  workDays: z.array(ymd).min(1, "Informe ao menos um dia de trabalho").optional(),
  dailyRates: z.number().int("Diárias devem ser um número inteiro").min(0, "Diárias não podem ser negativas").optional(),
  flightDepartureDate: ymd.nullable().optional(),
  flightDepartureSuggestedTime: hhmm.nullable().optional(),
  flightArrivalSuggestedTime: hhmm.nullable().optional(),
  flightReturnDate: ymd.nullable().optional(),
  flightReturnSuggestedTime: hhmm.nullable().optional(),
  transportModeIda: transportMode.nullable().optional(),
  transportModeVolta: transportMode.nullable().optional(),
  needsTicket: z.boolean().optional(),
  needsAccommodation: z.boolean().optional(),
  quantity: z.number().int("Quantidade deve ser um número inteiro").min(1, "Quantidade mínima é 1").optional(),
  observations: z.string().nullable().optional(),
}).strict();

export type ProposedChanges = z.infer<typeof proposedChangesSchema>;

/** Campos de proposedChanges que existem na vaga (team_inclusions) — para o "de/para". */
export const PROPOSED_FIELD_LABELS: Record<Exclude<keyof ProposedChanges, "v" | "quantity">, string> = {
  workDays: "Dias de trabalho",
  dailyRates: "Diárias",
  flightDepartureDate: "Data de ida",
  flightDepartureSuggestedTime: "Horário sugerido de ida",
  flightArrivalSuggestedTime: "Horário sugerido de chegada",
  flightReturnDate: "Data de volta",
  flightReturnSuggestedTime: "Horário sugerido de volta",
  transportModeIda: "Transporte de ida",
  transportModeVolta: "Transporte de volta",
  needsTicket: "Precisa de passagem",
  needsAccommodation: "Precisa de hospedagem",
  observations: "Observações",
};
export type ProposedField = keyof typeof PROPOSED_FIELD_LABELS;

/**
 * Valida proposedChanges (string JSON ou objeto). Regras por tipo:
 * - 'ajuste': `quantity` NÃO é permitido; precisa de ao menos um campo alterado;
 * - 'inclusao': `workDays` OBRIGATÓRIO (>= 1 dia — a vaga nova precisa nascer
 *   com dias/diárias); `quantity` >= 1 (default 1);
 * - 'exclusao': não carrega mudanças (aceita vazio/nulo → { v: 1 }).
 * Lança Error com mensagem pt-BR quando inválido.
 */
export function parseProposedChanges(raw: unknown, requestType: ChangeRequestType): ProposedChanges {
  let value: unknown = raw;
  if (value === undefined || value === null || value === "") value = { v: 1 };
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { throw new Error("proposedChanges não é um JSON válido"); }
  }
  const parsed = proposedChangesSchema.safeParse(value);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path?.length ? `${first.path.join(".")}: ` : "";
    throw new Error(`proposedChanges inválido — ${path}${first?.message ?? "erro de validação"}`);
  }
  const data = parsed.data;
  const changedKeys = Object.keys(data).filter((k) => k !== "v");
  if (requestType === "inclusao") {
    if (!data.workDays || data.workDays.length === 0) {
      throw new Error("Pedido de inclusão precisa informar os dias de trabalho da vaga nova (workDays)");
    }
    if (data.quantity === undefined) data.quantity = 1;
  }
  if (requestType === "ajuste") {
    if (data.quantity !== undefined) {
      throw new Error("Pedido de ajuste não aceita quantidade (só pedidos de inclusão)");
    }
    if (changedKeys.length === 0) {
      throw new Error("Pedido de ajuste precisa informar ao menos um campo a alterar");
    }
  }
  if (requestType === "exclusao" && changedKeys.length > 0) {
    throw new Error("Pedido de exclusão não carrega alterações de campos");
  }
  return data;
}

// ---------------------------------------------------------------------------
// diff "de/para"
// ---------------------------------------------------------------------------

export interface InclusionDiffEntry {
  field: ProposedField;
  label: string;
  from: unknown;
  to: unknown;
}

/** Subconjunto da vaga (team_inclusions) comparável com proposedChanges. */
export type InclusionForDiff = Partial<{
  workDays: (string | Date)[] | null;
  dailyRates: number | null;
  flightDepartureDate: string | Date | null;
  flightDepartureSuggestedTime: string | null;
  flightArrivalSuggestedTime: string | null;
  flightReturnDate: string | Date | null;
  flightReturnSuggestedTime: string | null;
  transportModeIda: string | null;
  transportModeVolta: string | null;
  needsTicket: boolean | null;
  needsAccommodation: boolean | null;
  observations: string | null;
}>;

function toYmd(v: string | Date | null | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function normalize(field: ProposedField, v: unknown): unknown {
  switch (field) {
    case "workDays":
      return Array.isArray(v) ? [...v].map((d) => toYmd(d as string | Date)).filter(Boolean).sort() : null;
    case "flightDepartureDate":
    case "flightReturnDate":
      return toYmd(v as string | Date | null);
    case "needsTicket":
    case "needsAccommodation":
      return Boolean(v);
    case "dailyRates":
      return v === null || v === undefined ? null : Number(v);
    default:
      return v === undefined || v === "" ? null : v;
  }
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
}

/**
 * Lista só os campos que MUDAM entre a vaga atual e o pedido (para o
 * "de/para" do aprovador). Campos ausentes no pedido não entram; `quantity`
 * não é campo da vaga e é ignorado.
 */
export function diffInclusion(current: InclusionForDiff, proposed: ProposedChanges): InclusionDiffEntry[] {
  const out: InclusionDiffEntry[] = [];
  for (const field of Object.keys(PROPOSED_FIELD_LABELS) as ProposedField[]) {
    if (!(field in proposed) || proposed[field] === undefined) continue;
    const from = normalize(field, (current as Record<string, unknown>)[field]);
    const to = normalize(field, proposed[field]);
    if (!sameValue(from, to)) out.push({ field, label: PROPOSED_FIELD_LABELS[field], from, to });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Permissões / prazos
// ---------------------------------------------------------------------------

/** Pode validar/pedir ajuste da vaga: admin ou validador da função. */
export function canValidateInclusion(
  userRoleForFunction: FunctionManagerRole | null | undefined,
  isAdmin: boolean,
): boolean {
  return Boolean(isAdmin) || userRoleForFunction === "validador";
}

/** Pode decidir pedidos / fazer bypass: admin ou aprovador da função. */
export function canApproveRequest(
  userRoleForFunction: FunctionManagerRole | null | undefined,
  isAdmin: boolean,
): boolean {
  return Boolean(isAdmin) || userRoleForFunction === "aprovador";
}

/** Dias inteiros desde o envio da sugestão (0 se não enviada ou no mesmo dia). */
export function daysPending(sentAt: Date | string | null | undefined, now: Date = new Date()): number {
  if (!sentAt) return 0;
  const sent = sentAt instanceof Date ? sentAt : new Date(sentAt);
  if (Number.isNaN(sent.getTime())) return 0;
  const diff = Math.floor((now.getTime() - sent.getTime()) / 86_400_000);
  return diff > 0 ? diff : 0;
}
