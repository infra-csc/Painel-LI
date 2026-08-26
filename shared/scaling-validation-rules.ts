/**
 * Regras puras da Validação de Escala (sem I/O), compartilhadas entre client e
 * servidor.
 *
 * Fluxo (regra do usuário, 19/08 — a validação da área NÃO aprova sozinha):
 *
 *   sugestão da logística → validação da ÁREA → aprovação do APROVADOR → Inclusão de Equipe
 *
 * A escala nasce como SUGESTÃO da logística (team_inclusions com phase
 * 'sugestao'). Cada área valida a parte dela — e a vaga fica em
 * 'sugestao_validada', AGUARDANDO O APROVADOR; a área também pode abrir
 * pedidos de ajuste / inclusão / exclusão (scaling_change_requests). Um
 * aprovador central (function_managers.role = 'aprovador') decide: aprova a
 * vaga validada, reprova ou devolve para a área revisar — e decide também os
 * pedidos. Só a decisão do aprovador transforma a vaga numa Inclusão comum:
 * { phase: 'inclusao', status: 'planejado' } — a MESMA linha de
 * team_inclusions, nunca uma tabela paralela.
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
  sugestao_validada: "Validada pela área — aguardando aprovação",
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
  "validar",                  // área valida a vaga sem pedido -> aguarda o aprovador
  "pedir_ajuste",             // área abre pedido (ajuste/exclusão) sobre a vaga
  "aprovar_vaga",             // aprovador aprova a vaga JÁ VALIDADA pela área -> Inclusão
  "reprovar_vaga",            // aprovador reprova a vaga já validada (fica registrada)
  "devolver_validacao",       // aprovador devolve a vaga já validada para a área revisar
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
  aprovar_vaga: "Aprovar vaga validada",
  reprovar_vaga: "Reprovar vaga validada",
  devolver_validacao: "Devolver para validação da área",
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
 * DUAS ETAPAS (regra do usuário, 19/08): validar NÃO aprova. A validação da
 * área é o PRIMEIRO passo; a vaga fica parada em `sugestao_validada` até o
 * aprovador decidir. Só as ações do APROVADOR levam a inclusao/planejado.
 *
 *   ÁREA
 *   sugestao_pendente --validar--> sugestao_validada            (aguarda o aprovador)
 *   sugestao_pendente --pedir_ajuste--> sugestao_ajuste
 *   sugestao_validada --pedir_ajuste--> sugestao_ajuste         (enquanto não foi aprovada)
 *
 *   APROVADOR (vaga já validada pela área)
 *   sugestao_validada --aprovar_vaga--> inclusao/planejado
 *   sugestao_validada --reprovar_vaga--> sugestao_negada        (fica registrada, não some)
 *   sugestao_validada --devolver_validacao--> sugestao_pendente (a área revisa de novo)
 *
 *   APROVADOR (decidindo um pedido)
 *   sugestao_ajuste   --aprovar_pedido--> (aplica) --> inclusao/planejado
 *                                          (requestType 'exclusao' -> sugestao_negada)
 *   sugestao_ajuste   --reajustar_reenviar | negar_reenviar--> sugestao_pendente
 *   sugestao_ajuste   --reajustar_aprovar_direto | negar_aprovar_direto--> inclusao/planejado
 *
 *   APROVADOR (bypass — SÓ para vaga que a área NUNCA validou)
 *   sugestao_pendente --aprovar_direto_bypass--> inclusao/planejado
 *   sugestao_pendente --reprovar_bypass--> sugestao_negada
 *
 * O bypass NÃO vale em `sugestao_validada`: ali o caminho normal do aprovador
 * são `aprovar_vaga` / `reprovar_vaga` / `devolver_validacao`.
 *
 * `sugestao_aprovada` continua no enum por compatibilidade de dados antigos,
 * mas não é mais estado de passagem: a aprovação vai direto para inclusão.
 * Transição inválida lança Error com mensagem em pt-BR.
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
      // pendente -> validada: a vaga PARA aqui, aguardando o aprovador
      if (current.status === S.PENDENTE) return sug(S.VALIDADA);
      throw invalid();

    case "pedir_ajuste":
      // a área pode pedir ajuste/exclusão antes de validar E depois de validar,
      // enquanto o aprovador ainda não decidiu — é o comportamento útil (a área
      // percebe o erro depois de ter validado e ainda consegue corrigir).
      if (current.status === S.PENDENTE || current.status === S.VALIDADA) return sug(S.AJUSTE);
      throw invalid();

    case "aprovar_vaga":
      // caminho normal do aprovador: vaga validada pela área -> Inclusão
      if (current.status === S.VALIDADA) return toInclusaoState();
      throw invalid();

    case "reprovar_vaga":
      if (current.status === S.VALIDADA) return sug(S.NEGADA);
      throw invalid();

    case "devolver_validacao":
      // aprovador quer que a área revise: volta para o começo da fila
      if (current.status === S.VALIDADA) return sug(S.PENDENTE);
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
      // só faz sentido para vaga que a área NUNCA validou; em sugestao_validada
      // o caminho é `aprovar_vaga`
      if (current.status === S.PENDENTE) return toInclusaoState();
      throw invalid();

    case "reprovar_bypass":
      // idem: em sugestao_validada o caminho é `reprovar_vaga`
      if (current.status === S.PENDENTE) return sug(S.NEGADA);
      throw invalid();

    default: {
      const never: never = action;
      throw new Error(`Ação desconhecida: ${String(never)}`);
    }
  }
}

/**
 * Ações possíveis a partir do estado atual (para montar botões/menus), na ordem
 * de `SUGGESTION_ACTIONS`. Deriva da própria máquina — nunca duplique a regra.
 *
 *  - sugestao_pendente → validar, pedir_ajuste, aprovar_direto_bypass, reprovar_bypass
 *  - sugestao_validada → pedir_ajuste, aprovar_vaga, reprovar_vaga, devolver_validacao
 *  - sugestao_ajuste   → decisões do aprovador sobre o pedido
 *  - sugestao_negada / fora da fase 'sugestao' → nenhuma
 *
 * Quem pode DE FATO executar cada uma ainda depende de `canValidateInclusion`
 * (área) / `canApproveRequest` (aprovador).
 */
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

/**
 * "AAAA-MM-DD" existe MESMO no calendário? O regex aceita "2027-02-29" e
 * "2026-09-31"; aqui a string é reconstruída via Date UTC (round-trip): se o
 * JavaScript "normalizou" (29/02 → 01/03), a data não existia.
 */
export function isRealYmd(s: string): boolean {
  if (!DATE_YMD.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** "HH:MM" é um horário de verdade (00:00–23:59)? O regex sozinho aceita "24:00" / "23:60". */
export function isValidHhmm(s: string): boolean {
  if (!TIME_HHMM.test(s)) return false;
  const [h, min] = s.split(":").map(Number);
  return h <= 23 && min <= 59;
}

const ymd = z.string()
  .regex(DATE_YMD, "Data inválida (use AAAA-MM-DD)")
  .refine(isRealYmd, "Data inexistente");
const hhmm = z.string()
  .regex(TIME_HHMM, "Horário inválido (use HH:MM)")
  .refine(isValidHhmm, "Horário inexistente (use HH:MM entre 00:00 e 23:59)");
const transportMode = z.enum(TRANSPORT_MODES);

/** Zod de data/horário do módulo — o servidor reutiliza para o /bulk (nunca duplique o refine). */
export const ymdSchema = ymd;
export const hhmmSchema = hhmm;

/**
 * A vaga mudou de estado entre a leitura e a gravação (decisão concorrente
 * venceu a corrida). O servidor devolve 409 com esta mensagem — o cliente
 * recarrega a lista.
 */
export const VAGA_STATE_CHANGED_MSG = "A vaga mudou de estado — recarregue a lista";

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
  quantity: z.number().int("Quantidade deve ser um número inteiro").min(1, "Quantidade mínima é 1").max(50, "Quantidade máxima é 50 vagas por pedido").optional(),
  observations: z.string().max(1000, "Observações podem ter no máximo 1000 caracteres").nullable().optional(),
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
// Cancelar envio da sugestão (desfazer o /bulk)
// ---------------------------------------------------------------------------
//
// Regra do usuário (19/08): depois de "Enviar para validação" a logística
// precisa poder DESFAZER o envio inteiro de um evento — grade errada, evento
// errado, quantidades erradas. Cancelar remove TODAS as vagas ainda no fluxo de
// sugestão daquele evento, inclusive as que a área já validou e as que têm
// pedido pendente (a tela avisa isso na confirmação).
//
// O que NÃO sai:
//  - o que já virou Inclusão (`phase: 'inclusao'`) — a vaga saiu da sugestão e
//    passou a ser escalação de verdade; desfazer isso é assunto da Escalação;
//  - o que está `sugestao_negada` — já saiu do fluxo (reprovada/excluída) e
//    fica só como histórico.

/** Status de sugestão que o "Cancelar envio" remove (soft delete). */
export const CANCELABLE_SUGESTAO_STATUS = [
  SUGESTAO_STATUS.PENDENTE,
  SUGESTAO_STATUS.VALIDADA,
  SUGESTAO_STATUS.AJUSTE,
] as const;
export type CancelableSugestaoStatus = (typeof CANCELABLE_SUGESTAO_STATUS)[number];

/** O mínimo que a regra precisa saber de uma vaga para decidir o cancelamento. */
export interface CancelableRow {
  phase?: string | null;
  status?: string | null;
  /** Vaga já excluída (soft delete) nunca entra de novo. */
  deletedAt?: Date | string | null;
}

/**
 * Esta vaga entra no "Cancelar envio"? Só fase 'sugestao', ainda não excluída e
 * num status ainda NÃO decidido (pendente / validada / com pedido de ajuste).
 * É a MESMA regra do filtro do servidor e da contagem que a tela mostra na
 * confirmação — nunca duplique a lista de status.
 */
export function isCancelableSuggestion(row: CancelableRow | null | undefined): boolean {
  if (!row) return false;
  if (row.phase !== SUGESTAO_PHASE) return false;      // já virou Inclusão (ou nunca foi sugestão)
  if (row.deletedAt) return false;                     // já excluída
  return (CANCELABLE_SUGESTAO_STATUS as readonly string[]).includes(row.status ?? "");
}

/** Resumo do que será removido — o texto do bloco e do AlertDialog sai daqui. */
export interface CancelSendSummary {
  /** Total de vagas que serão removidas. */
  total: number;
  /** Ainda aguardando a validação da área (sugestao_pendente). */
  aguardando: number;
  /** Já validadas pela área, aguardando o aprovador (sugestao_validada). */
  validadas: number;
  /** Com pedido de ajuste/exclusão em aberto (sugestao_ajuste). */
  comPedido: number;
}

/** Agrupa as vagas do evento no resumo do cancelamento (ignora o que não sai). */
export function summarizeCancelableSuggestions(rows: readonly CancelableRow[] | null | undefined): CancelSendSummary {
  const out: CancelSendSummary = { total: 0, aguardando: 0, validadas: 0, comPedido: 0 };
  for (const row of rows ?? []) {
    if (!isCancelableSuggestion(row)) continue;
    out.total++;
    if (row.status === SUGESTAO_STATUS.PENDENTE) out.aguardando++;
    else if (row.status === SUGESTAO_STATUS.VALIDADA) out.validadas++;
    else if (row.status === SUGESTAO_STATUS.AJUSTE) out.comPedido++;
  }
  return out;
}

/** O mínimo que a regra precisa saber de um pedido para decidir o cancelamento. */
export interface CancelableRequest {
  status?: string | null;
  teamInclusionId?: string | null;
}

/**
 * Este pedido é encerrado junto com o cancelamento do envio?
 *
 * Só pedidos PENDENTES — os já decididos são histórico. Entram os que apontam
 * para uma vaga removida e também os pedidos de INCLUSÃO (teamInclusionId
 * null): eles pedem uma vaga NOVA num envio que deixou de existir; deixá-los na
 * fila faria o aprovador criar uma vaga órfã num evento sem sugestão.
 *
 * O status final é `negado` — é o valor que já existe no enum para "o pedido
 * não vai adiante e a vaga não muda por causa dele". Não inventamos um
 * 'cancelado' novo: nenhuma tela saberia lê-lo.
 */
export function isRequestCanceledByCancelSend(
  request: CancelableRequest | null | undefined,
  removedInclusionIds: ReadonlySet<string>,
): boolean {
  if (!request) return false;
  if (request.status !== CHANGE_REQUEST_STATUS.PENDENTE) return false;
  if (!request.teamInclusionId) return true;                 // pedido de inclusão: a vaga nem existe
  return removedInclusionIds.has(request.teamInclusionId);
}

/** Status para onde vão os pedidos encerrados pelo cancelamento do envio. */
export const CANCEL_SEND_REQUEST_STATUS = CHANGE_REQUEST_STATUS.NEGADO;

/** Comentário gravado no pedido encerrado pelo cancelamento (a área precisa entender). */
export const CANCEL_SEND_REQUEST_COMMENT =
  "Envio da escala sugerida cancelado pela logística — o pedido foi encerrado sem decisão.";

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

/** Vaga/pedido "parado": a partir de quantos dias sinalizar (âmbar) e escalar (vermelho). */
export const STALLED_DAYS = 3;
export const DANGER_DAYS = 7;
export type PendingSeverity = "ok" | "warn" | "danger";
export function pendingSeverity(days: number): PendingSeverity {
  return days >= DANGER_DAYS ? "danger" : days >= STALLED_DAYS ? "warn" : "ok";
}

/**
 * Última decisão do aprovador sobre uma vaga (anexada pelo GET de sugestões
 * quando o pedido mais recente já foi resolvido) — a área precisa ver que a
 * vaga VOLTOU e por quê.
 */
export interface LastDecisionInfo {
  requestId: string;
  requestType: ChangeRequestType;
  status: ChangeRequestStatus;   // aprovado | reajustado | negado | reenviado_validacao
  comment: string | null;
  byName: string | null;
  at: string | null;             // ISO
}

export type LastDecisionTone = "warn" | "danger" | "ok" | "info";

/**
 * Texto pt-BR (título + tom) da última decisão do aprovador, para o card/badge
 * da vaga na lista da área. O comentário do aprovador (quando houver) entra no
 * final do título, depois de ": ".
 *
 *  - reenviado_validacao → "Devolvida pelo aprovador (reajuste)" (warn) — a
 *    vaga voltou para a área validar com as alterações do aprovador; se o
 *    pedido era de inclusão, a vaga NASCEU dessa devolução;
 *  - negado → "Pedido negado, vaga mantida" (danger) — o aprovador recusou o
 *    pedido de ajuste/exclusão e devolveu a vaga como estava;
 *  - reajustado / aprovado → decisão final (ok);
 *  - pendente → em análise (info) — não deveria chegar aqui, mas é seguro.
 */
export function describeLastDecision(info: LastDecisionInfo): { title: string; tone: LastDecisionTone } {
  const comment = info.comment?.trim();
  const suffix = comment ? `: ${comment}` : "";
  const typeLabel = CHANGE_REQUEST_TYPE_LABELS[info.requestType] ?? info.requestType;
  switch (info.status) {
    case "reenviado_validacao":
      return {
        title: info.requestType === "inclusao"
          ? `Vaga criada pelo aprovador a partir de pedido de inclusão devolvido — validar${suffix}`
          : `Devolvida pelo aprovador (reajuste)${suffix}`,
        tone: "warn",
      };
    case "negado":
      return {
        title: info.requestType === "inclusao"
          ? `Pedido de inclusão negado${suffix}`
          : `Pedido negado, vaga mantida${suffix}`,
        tone: "danger",
      };
    case "reajustado":
      return { title: `Pedido de ${typeLabel.toLowerCase()} reajustado e aprovado pelo aprovador${suffix}`, tone: "ok" };
    case "aprovado":
      return { title: `Pedido de ${typeLabel.toLowerCase()} aprovado${suffix}`, tone: "ok" };
    case "pendente":
    default:
      return { title: `Pedido de ${typeLabel.toLowerCase()} em análise pelo aprovador`, tone: "info" };
  }
}

/**
 * Última decisão do aprovador sobre a VAGA (não sobre um pedido), anexada pelo
 * GET de sugestões a partir de `team_inclusion_logs`.
 *
 * O `aprovar/reprovar/devolver` da vaga validada NÃO cria
 * `scaling_change_requests` — o autor, o comentário e o instante ficam só no
 * log da inclusão. Sem isto a área via a vaga voltar para "pendente" sem saber
 * quem devolveu nem por quê.
 */
export const VAGA_DECISION_RESULTS = ["aprovada", "reprovada", "devolvida"] as const;
export type VagaDecisionResult = (typeof VAGA_DECISION_RESULTS)[number];

export interface LastVagaDecisionInfo {
  action: VagaDecisionResult;
  comment: string | null;
  byName: string | null;
  at: string | null;             // ISO
}

/**
 * Texto pt-BR (título + tom) da última decisão do aprovador sobre a VAGA, no
 * mesmo formato de `describeLastDecision` (o comentário obrigatório entra no
 * fim do título, depois de ": ").
 *
 *  - devolvida → "Devolvida pelo aprovador para nova validação" (warn) — a vaga
 *    voltou para a área revisar e validar de novo;
 *  - reprovada → "Vaga reprovada pelo aprovador" (danger) — a vaga fica
 *    registrada como negada, não vira Inclusão;
 *  - aprovada  → "Vaga aprovada pelo aprovador" (ok) — virou Inclusão.
 */
export function describeVagaDecision(info: LastVagaDecisionInfo): { title: string; tone: LastDecisionTone } {
  const comment = info.comment?.trim();
  const suffix = comment ? `: ${comment}` : "";
  switch (info.action) {
    case "devolvida":
      return { title: `Devolvida pelo aprovador para nova validação${suffix}`, tone: "warn" };
    case "reprovada":
      return { title: `Vaga reprovada pelo aprovador${suffix}`, tone: "danger" };
    case "aprovada":
    default:
      return { title: `Vaga aprovada pelo aprovador${suffix}`, tone: "ok" };
  }
}

export function daysPending(sentAt: Date | string | null | undefined, now: Date = new Date()): number {
  if (!sentAt) return 0;
  const sent = sentAt instanceof Date ? sentAt : new Date(sentAt);
  if (Number.isNaN(sent.getTime())) return 0;
  const diff = Math.floor((now.getTime() - sent.getTime()) / 86_400_000);
  return diff > 0 ? diff : 0;
}

/**
 * Dias que a vaga JÁ VALIDADA espera a decisão do aprovador.
 *
 * `daysPending` da linha conta desde o envio da logística e inclui o tempo que a
 * ÁREA levou para validar — dizer "pendente há 6 dias" numa vaga validada joga
 * na área um atraso que é do aprovador. Aqui o relógio recomeça em
 * `validatedAt`. Sem carimbo (linha antiga), cai no `daysPending` que veio do
 * servidor.
 *
 * Helper ÚNICO das duas telas: "Aguardando" da Aprovação
 * (components/scaling-approval/awaiting-approval.tsx) e o badge da Validação
 * (components/scaling-validation/suggestions-list.tsx).
 */
export function daysAwaitingApproval(
  row: { validatedAt?: Date | string | null; daysPending?: number | null },
  now: Date = new Date(),
): number {
  if (row.validatedAt) return daysPending(row.validatedAt, now);
  return Math.max(0, row.daysPending ?? 0);
}
