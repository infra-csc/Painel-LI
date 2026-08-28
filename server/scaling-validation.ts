/**
 * Validação de Escala — rotas da API.
 *
 * FLUXO (regra do usuário, 19/08 — validar não aprova):
 *
 *   sugestão da logística → validação da ÁREA → aprovação do APROVADOR → Inclusão de Equipe
 *
 * 1. A logística envia a escala SUGERIDA de um evento (POST /bulk):
 *    team_inclusions em phase 'sugestao' / status 'sugestao_pendente'.
 * 2. A ÁREA (validador da função) valida a parte dela (POST /validate) — a vaga
 *    vai para 'sugestao_validada' e PARA, aguardando o aprovador — ou abre
 *    pedidos de ajuste/inclusão/exclusão (scaling_change_requests).
 * 3. O APROVADOR (function_managers.role = 'aprovador', ou admin) decide:
 *    - a vaga validada: PATCH /:id/aprovar | /:id/reprovar | /:id/devolver
 *      (e POST /aprovar-lote para o lote);
 *    - os pedidos: PATCH /api/scaling-change-requests/:id/approve|reajustar|negar;
 *    - vaga que a área NUNCA validou: /:id/bypass-approve | /:id/bypass-reject.
 * 4. Só a decisão do aprovador transforma a vaga numa Inclusão comum
 *    ({ phase: 'inclusao', status: 'planejado' }) — a MESMA linha de
 *    team_inclusions.
 *
 * Toda transição de estado da vaga passa por `nextSuggestionState` (shared) —
 * nunca setamos status/phase "na mão". A identidade do ator vem sempre da
 * sessão. Autenticação é global (server/index.ts); aqui só AUTORIZAÇÃO.
 *
 * QUEM DECIDE (regra do usuário, 20/08 — o CADASTRO manda): o módulo é visível
 * para TODOS os perfis; quem VALIDA é quem está cadastrado como `validador` da
 * função em function_managers, e quem APROVA é quem está cadastrado como
 * `aprovador` — QUALQUER que seja o papel global do usuário (admin decide
 * sempre). O papel global só define defaults de visualização (ex.: quais papéis
 * veem a fila inteira de pedidos); ele NUNCA tira nem dá o poder de decidir —
 * isso é exclusivo do cadastro por função.
 *
 * APROVADOR PADRÃO (regra do dono, 26/08 — "sempre será o Pedro Telles"): há um
 * aprovador GLOBAL, guardado em `system_settings.escala_aprovador_padrao`, que
 * decide em QUALQUER função. Ele não tira nada de ninguém — quem é aprovador
 * cadastrado continua decidindo exatamente como antes —; ele existe para que
 * função criada sem aprovador não prenda a vaga validada numa fila sem ninguém
 * do outro lado. Toda guarda de decisão passa por `canDecideFunction` (que
 * chama `canApproveInFunction`, do shared); a chave sem valor configurado
 * devolve o comportamento antigo, palavra por palavra.
 *
 * CORRIDAS (TOCTOU): toda mutação de vaga lida antes e gravada depois usa
 * UPDATE guardado pelo estado esperado (WHERE phase/status + RETURNING);
 * 0 linhas → 409 `VAGA_STATE_CHANGED_MSG` (ou skipped, nos lotes) — nunca uma
 * decisão por cima da outra.
 *
 * Registro: `registerScalingValidationRoutes(app, deps)` em server/routes.ts.
 */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { db } from "./db";
import { storage, type FunctionManagerRole } from "./storage";
import {
  budgetNotes,
  insertTeamInclusionSchema,
  insertScalingChangeRequestSchema,
  type InsertTeamInclusion,
  type TeamInclusion,
  type TeamInclusionLog,
  type ScalingChangeRequest,
  type User,
} from "@shared/schema";
import {
  SUGESTAO_PHASE,
  SUGESTAO_STATUS,
  TRANSPORT_MODES,
  CHANGE_REQUEST_STATUS,
  CANCELABLE_SUGESTAO_STATUS,
  CANCEL_SEND_REQUEST_STATUS,
  CANCEL_SEND_REQUEST_COMMENT,
  isRequestCanceledByCancelSend,
  isSuggestionInclusion,
  nextSuggestionState,
  toInclusaoState,
  parseProposedChanges,
  diffInclusion,
  daysPending,
  canValidateInclusion,
  canApproveRequest,
  canApproveInFunction,
  DEFAULT_APPROVER_SETTING_KEY,
  ALL_EVENTS_ROW_LIMIT,
  requestStatusForAction,
  isRealYmd,
  isValidHhmm,
  VAGA_STATE_CHANGED_MSG,
  PROPOSED_FIELD_LABELS,
  type ProposedChanges,
  type ProposedField,
  type SuggestionAction,
  type ChangeRequestType,
  type ChangeRequestStatus,
  type LastDecisionInfo,
  type LastVagaDecisionInfo,
  type VagaDecisionResult,
} from "@shared/scaling-validation-rules";
import { changeRequestWindow, type ChangeWindow } from "@shared/scaling-change-window";
import { normalizeRole, type CanonicalRole } from "@shared/roles";
import {
  assertEventEditable,
  assertLoadedEventEditable,
  isEventBlockedForActor,
  isEventIdBlockedForActor,
  newEventCache,
  PAST_EVENT_BLOCK_MSG,
} from "./event-guard";
import { effectiveUserId } from "./simulation";

// ── Dependências injetadas por routes.ts (evita import circular) ─────────────
export interface ScalingValidationDeps {
  requireRoles: (req: any, res: any, roles: readonly CanonicalRole[]) => Promise<User | null>;
  createAuditLog: (
    action: string,
    entityType: string,
    entityId: string,
    entityData: any,
    userId?: string,
    userName?: string,
    oldData?: any,
    req?: any,
  ) => Promise<void>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const YMD = /^\d{4}-\d{2}-\d{2}$/;
// Formato E existência real da data/horário (o mesmo refine do shared —
// "2027-02-29" / "24:00" passam no regex mas não existem no calendário/relógio).
const ymd = z.string().regex(YMD, "Data inválida (use AAAA-MM-DD)").refine(isRealYmd, "Data inexistente");
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "Horário inválido (use HH:MM)")
  .refine(isValidHhmm, "Horário inexistente (use HH:MM entre 00:00 e 23:59)");

/** "" → null nos campos de data/hora (mesmo tratamento do /bulk histórico). */
function blankToNull<T extends Record<string, any>>(obj: T, keys: string[]): T {
  const out: Record<string, any> = { ...obj };
  for (const k of keys) if (out[k] === "") out[k] = null;
  return out as T;
}

function sortedYmd(days: unknown): string[] {
  if (!Array.isArray(days)) return [];
  return days
    .map((d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)))
    .filter((d) => YMD.test(d))
    .sort();
}

/**
 * Converte proposedChanges já validado num patch de team_inclusions.
 * ALLOWLIST: só os campos de PROPOSED_FIELD_LABELS (nunca status/phase/ids).
 * workDays também deriva scheduleStart/EndDate e, se não vier dailyRates,
 * dailyRates = quantidade de dias.
 */
function proposedToPatch(proposed: ProposedChanges): Partial<InsertTeamInclusion> {
  const patch: Record<string, unknown> = {};
  for (const field of Object.keys(PROPOSED_FIELD_LABELS) as ProposedField[]) {
    if (proposed[field] === undefined) continue;
    patch[field] = proposed[field];
  }
  if (proposed.workDays) {
    const days = sortedYmd(proposed.workDays);
    patch.workDays = days;
    if (days.length > 0) {
      patch.scheduleStartDate = days[0];
      patch.scheduleEndDate = days[days.length - 1];
      if (proposed.dailyRates === undefined) patch.dailyRates = days.length;
    }
  }
  return patch as Partial<InsertTeamInclusion>;
}

function safeJson(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function getActor(req: Request, res: Response): Promise<User | null> {
  // Usuário EFETIVO (server/simulation.ts): no modo "Ver como usuário" os GETs
  // respondem como o usuário simulado — a fila que ele aprova, as funções que
  // valida. As mutações nem chegam aqui (guard global de somente leitura).
  const userId = effectiveUserId(req as any);
  if (!userId) { res.status(401).json({ message: "Não autenticado" }); return null; }
  const user = await storage.getUser(userId);
  if (!user) { res.status(401).json({ message: "Usuário não encontrado" }); return null; }
  return user;
}

const isAdmin = (u: User) => normalizeRole(u.role) === "admin";

/**
 * Papéis que VEEM a fila inteira de pedidos (default de VISUALIZAÇÃO por papel).
 * Quem não está nesta lista ainda pode ver a fila FILTRADA às funções em que é
 * `aprovador` (fallback do aprovador, abaixo); o 403 sobra só para quem não é
 * nem papel autorizado nem aprovador.
 *
 * REGRA (20/08 — o CADASTRO manda): o papel global NUNCA decide `canDecide`.
 * Aprovador cadastrado em function_managers decide, qualquer que seja o papel
 * (inclusive `financial`); quem não é aprovador da função não decide, mesmo
 * com papel "forte". As rotas de decisão exigem admin OU aprovador da função —
 * nada além disso.
 */
const canViewRequestsByRole = (u: User) => {
  const r = normalizeRole(u.role);
  return r === "admin" || r === "purchasing" || r === "production" || r === "financial";
};

async function roleFor(functionId: string, userId: string): Promise<FunctionManagerRole | null> {
  return storage.getUserFunctionRole(functionId, userId);
}

// ── Aprovador PADRÃO do sistema (regra do dono, 26/08) ───────────────────────
// "O aprovador sempre será o Pedro Telles": o cadastro por função continua
// mandando, mas função criada sem aprovador prendia a vaga validada numa fila
// sem ninguém do outro lado. `system_settings.escala_aprovador_padrao` guarda o
// `users.id` do aprovador global, que decide em QUALQUER função — sem tirar
// nada de quem já é aprovador cadastrado (ver `canApproveInFunction`, shared).
//
// Cache curto em processo: a resolução entra em toda decisão e em cada linha
// das listas; sem ele seria um SELECT na tabela de configurações por requisição.
const DEFAULT_APPROVER_TTL_MS = 30_000;
let defaultApproverCache: { at: number; id: string | null } | null = null;

/** `users.id` do aprovador padrão (null quando a chave não está configurada). */
async function defaultApproverId(): Promise<string | null> {
  const now = Date.now();
  if (defaultApproverCache && now - defaultApproverCache.at < DEFAULT_APPROVER_TTL_MS) {
    return defaultApproverCache.id;
  }
  let id: string | null = null;
  try {
    const settings = await storage.getSystemSettings();
    id = settings.find((s) => s.key === DEFAULT_APPROVER_SETTING_KEY)?.value?.trim() || null;
  } catch (error) {
    // Configuração indisponível NUNCA pode virar 500 numa listagem: sem o
    // padrão, vale exatamente a regra antiga (cadastro por função).
    console.error("[Validação de Escala] falha ao ler o aprovador padrão:", error);
    return defaultApproverCache?.id ?? null;
  }
  defaultApproverCache = { at: now, id };
  return id;
}

/** O ator é o aprovador padrão do sistema? */
async function isDefaultApprover(actor: User): Promise<boolean> {
  const id = await defaultApproverId();
  return !!id && id === actor.id;
}

/**
 * Pode decidir esta função? Admin, aprovador cadastrado dela ou o aprovador
 * padrão do sistema. Substitui o `canApproveRequest` cru em TODAS as guardas de
 * decisão — o shared é quem define a regra.
 */
async function canDecideFunction(functionId: string, actor: User): Promise<boolean> {
  const role = await roleFor(functionId, actor.id);
  return canApproveInFunction({
    roleForFunction: role,
    isAdmin: isAdmin(actor),
    isDefaultApprover: await isDefaultApprover(actor),
  });
}

/** Mensagem única do 403 de decisão (agora o padrão também é uma saída válida). */
const NOT_APPROVER_MSG = "Apenas o aprovador da função, o aprovador padrão do sistema ou um administrador pode decidir";

// ── Modo "todos os eventos" (eventId opcional, regra do dono de 26/08) ───────
//
// O teto de linhas do modo sem evento (`ALL_EVENTS_ROW_LIMIT`, do shared) vale
// só aqui: o recorte com `eventId` continua sem teto nenhum. É um teto de
// SEGURANÇA (não uma paginação): as telas avisam quando ele corta e o filtro
// por evento é a saída. As linhas cortadas são sempre as MENOS urgentes
// (ordenação por `suggestionSentAt` crescente).

/**
 * Janela dos eventos JÁ ENCERRADOS que continuam na consulta histórica sem
 * evento. Só vale para o `event-view` (que enxerga vaga aprovada, negada e
 * excluída, ou seja, o passado inteiro); a lista de vagas em validação NÃO tem
 * corte por data — vaga velha e parada é justamente o que precisa aparecer.
 */
const ALL_EVENTS_RECENT_DAYS = 60;

/** Data (YYYY-MM-DD) de `ALL_EVENTS_RECENT_DAYS` dias atrás. */
function recentEventsCutoffYmd(now: Date = new Date()): string {
  const d = new Date(now.getTime() - ALL_EVENTS_RECENT_DAYS * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/**
 * Campos do evento anexados a cada linha (nome + período): a tela agrupa e
 * ordena por evento no modo "todos". Vêm de UMA consulta em lote
 * (`getEventsByIds`), nunca de um SELECT por linha.
 */
function eventFieldsOf(event: { name: string; startDate: string; endDate: string } | undefined) {
  return {
    eventName: event?.name ?? null,
    eventStartDate: event?.startDate ?? null,
    eventEndDate: event?.endDate ?? null,
  };
}

async function inclusionLog(
  teamInclusionId: string, action: string, details: string,
  previousValue: string | null, newValue: string | null, actor: User,
) {
  await storage.createTeamInclusionLog({
    teamInclusionId, action, details, previousValue, newValue,
    userId: actor.id, userName: actor.name ?? "Usuário",
  });
}

async function addRequestNote(requestId: string, actor: User, content: string) {
  await db.insert(budgetNotes).values({
    entityType: "scaling_change_request",
    entityId: requestId,
    authorId: actor.id,
    authorName: actor.name ?? "Usuário",
    content,
  });
}

function stateLabel(i: { phase: string; status: string }) { return `${i.phase}/${i.status}`; }

// ── Erros: 400 só para zod/regra de negócio; 409 para pedido já decidido; o
// resto é 500 (erro inesperado — não vaza a mensagem interna).
/** Erro de REGRA (transição inválida, proposedChanges inválido…) → 400. */
class RuleViolation extends Error {
  constructor(message: string) { super(message); this.name = "RuleViolation"; }
}
/** Executa uma regra pura do shared: qualquer Error vira RuleViolation (400). */
function rule<T>(fn: () => T): T {
  try { return fn(); }
  catch (e) { throw new RuleViolation(e instanceof Error ? e.message : String(e)); }
}
const ALREADY_DECIDED = "Este pedido já foi decidido";

function sendError(res: Response, error: unknown, logPrefix: string, fallback: string) {
  if (error instanceof RuleViolation || error instanceof z.ZodError) {
    const message = error instanceof z.ZodError
      ? (error.issues[0]?.message ?? "Dados inválidos")
      : error.message;
    return res.status(400).json({ message });
  }
  if (error instanceof Error && (error.message === ALREADY_DECIDED || error.message === VAGA_STATE_CHANGED_MSG)) {
    return res.status(409).json({ message: error.message });
  }
  console.error(`[Validação de Escala] ${logPrefix}:`, error);
  return res.status(500).json({ message: fallback });
}

const toIso = (d: Date | string | null | undefined): string | null => {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const toMs = (d: Date | string | null | undefined): number => {
  if (!d) return 0;
  const t = (d instanceof Date ? d : new Date(d)).getTime();
  return Number.isNaN(t) ? 0 : t;
};

/** O mínimo que `matchesCreatedFromRequest` precisa saber da vaga. */
export interface InclusionIdentity {
  id: string;
  eventId: string;
  functionId: string;
  suggestionSentAt: Date | string | null;
}

/**
 * A vaga NASCEU deste pedido de inclusão devolvido para a área?
 *
 * `scaling_change_requests.resolvedInclusionId` é UMA coluna, mas um pedido de
 * inclusão com `quantity > 1` cria N vagas — o storage só consegue apontar para
 * a PRIMEIRA. Sem esta regra, as vagas 2..N chegavam à área sem o aviso "Vaga
 * criada pelo aprovador — validar" e sem o comentário dele.
 *
 * Casamento sem coluna nova / sem migração: as N linhas são criadas com o MESMO
 * objeto Date usado no `reviewedAt` do pedido (reviewHandler cria `now` uma vez
 * e passa para `buildInclusionRowsFromRequest`, que grava `suggestionSentAt =
 * now`). Logo, para uma vaga nascida do pedido vale, ao milissegundo:
 * `suggestionSentAt === reviewedAt`, no mesmo evento e na mesma função. Só se
 * aplica a pedidos de INCLUSÃO resolvidos como 'reenviado_validacao' — os
 * únicos que criam vagas em sugestao_pendente.
 */
export function matchesCreatedFromRequest(
  inclusion: InclusionIdentity,
  request: Pick<
    ScalingChangeRequest,
    "resolvedInclusionId" | "requestType" | "status" | "eventId" | "functionId" | "reviewedAt"
  >,
): boolean {
  // Vínculo explícito (1ª vaga do lote, ou pedido de inclusão aprovado direto).
  if (request.resolvedInclusionId && request.resolvedInclusionId === inclusion.id) return true;
  if (request.requestType !== "inclusao") return false;
  if (request.status !== CHANGE_REQUEST_STATUS.REENVIADO_VALIDACAO) return false;
  if (request.eventId !== inclusion.eventId) return false;
  if (request.functionId !== inclusion.functionId) return false;
  const sentMs = toMs(inclusion.suggestionSentAt);
  return sentMs !== 0 && sentMs === toMs(request.reviewedAt);
}

/**
 * Instante a partir do qual uma decisão do aprovador ainda EXPLICA o estado
 * atual da vaga (usado por `pickLastDecision` e `pickLastVagaDecision`).
 *
 * Vaga pendente: `suggestionSentAt` — devolver a vaga e reenviar um pedido
 * resetam esse carimbo, então decisão anterior a ele já foi superada.
 * Vaga em `sugestao_validada`: `validatedAt` — o `/validate` NÃO reseta
 * `suggestionSentAt`, e sem este piso a devolução que a ÁREA já resolveu
 * revalidando continuaria aparecendo para sempre ao lado de "Validada pela
 * área — aguardando aprovação". Sem `validatedAt` (linha antiga), cai no
 * `suggestionSentAt`.
 */
function decisionFloorMs(inclusion: {
  suggestionSentAt: Date | string | null;
  status?: string | null;
  validatedAt?: Date | string | null;
}): number {
  const sentMs = toMs(inclusion.suggestionSentAt);
  return inclusion.status === SUGESTAO_STATUS.VALIDADA
    ? Math.max(sentMs, toMs(inclusion.validatedAt))
    : sentMs;
}

/**
 * Última decisão que EXPLICA o estado atual da vaga: o pedido resolvido mais
 * recente (por reviewedAt) da vaga — via teamInclusionId ou, quando a vaga
 * nasceu de um pedido de inclusão devolvido, via `matchesCreatedFromRequest`
 * (cobre TODAS as N vagas do lote, não só a primeira) — desde que (a) não
 * exista pedido pendente mais novo e (b) a decisão seja igual ou posterior ao
 * piso de `decisionFloorMs` (reenvio reseta o carimbo; revalidar a vaga sobe o
 * piso para o `validatedAt`).
 */
export function pickLastDecision(
  inclusion: InclusionIdentity & { status?: string | null; validatedAt?: Date | string | null },
  requests: ScalingChangeRequest[],
): LastDecisionInfo | null {
  let best: ScalingChangeRequest | null = null;
  let newestPendingMs = 0;
  for (const r of requests) {
    if (r.teamInclusionId !== inclusion.id && !matchesCreatedFromRequest(inclusion, r)) continue;
    if (r.status === CHANGE_REQUEST_STATUS.PENDENTE) {
      newestPendingMs = Math.max(newestPendingMs, toMs(r.createdAt));
      continue;
    }
    if (!best || toMs(r.reviewedAt ?? r.updatedAt) > toMs(best.reviewedAt ?? best.updatedAt)) best = r;
  }
  if (!best) return null;
  const decidedMs = toMs(best.reviewedAt ?? best.updatedAt);
  if (newestPendingMs && newestPendingMs > decidedMs) return null;
  if (decidedMs < decisionFloorMs(inclusion)) return null;
  return {
    requestId: best.id,
    requestType: best.requestType as ChangeRequestType,
    status: best.status as ChangeRequestStatus,
    comment: best.reviewComment ?? null,
    byName: best.reviewedByName ?? null,
    at: toIso(best.reviewedAt ?? best.updatedAt),
  };
}

// ── Decisão do aprovador sobre a VAGA (team_inclusion_logs) ──────────────────
// Aprovar/reprovar/devolver a vaga validada NÃO cria um `scaling_change_request`
// — o autor, o comentário e o instante ficam só no log da inclusão. Estas duas
// funções (escrita e leitura) são o par que mantém o comentário recuperável.

/** Marca que separa o texto fixo do log do comentário do aprovador. */
const LOG_COMMENT_MARK = ". Comentário: ";

/** `details` do log: texto fixo + comentário do aprovador (quando houver). */
function detailsWithComment(detail: string, comment: string | null): string {
  return comment ? `${detail}${LOG_COMMENT_MARK}${comment}` : detail;
}

/** Volta do `details` só o comentário do aprovador (null quando não há). */
export function commentFromLogDetails(details: string | null | undefined): string | null {
  if (!details) return null;
  const at = details.indexOf(LOG_COMMENT_MARK);
  if (at < 0) return null;
  // O próprio comentário pode conter a marca: fica tudo depois da PRIMEIRA.
  return details.slice(at + LOG_COMMENT_MARK.length).trim() || null;
}

/** Ação do log → decisão da vaga exposta pela API. */
const VAGA_DECISION_BY_LOG_ACTION = {
  suggestion_approved: "aprovada",
  suggestion_rejected: "reprovada",
  suggestion_returned: "devolvida",
} as const satisfies Record<string, VagaDecisionResult>;
type VagaDecisionLogAction = keyof typeof VAGA_DECISION_BY_LOG_ACTION;
export const VAGA_DECISION_LOG_ACTIONS = Object.keys(VAGA_DECISION_BY_LOG_ACTION) as VagaDecisionLogAction[];

/**
 * Folga entre o relógio da aplicação (`suggestionSentAt`, um `new Date()` do
 * Node) e o do banco (`team_inclusion_logs.createdAt`, `defaultNow()`).
 *
 * A DEVOLUÇÃO grava as duas coisas no mesmo instante lógico — o handler reseta
 * `suggestionSentAt = now` e logo em seguida insere o log. Comparar ">= sem
 * folga" é o que `pickLastDecision` faz (lá os dois carimbos saem do MESMO
 * objeto Date, então milissegundos iguais bastam); aqui os carimbos vêm de
 * relógios diferentes e um log alguns milissegundos "anterior" ao reset
 * esconderia justamente o aviso da devolução.
 */
export const VAGA_DECISION_SKEW_MS = 2_000;

/** O mínimo que `pickLastVagaDecision` precisa saber do log. */
export type VagaDecisionLog = Pick<TeamInclusionLog, "teamInclusionId" | "action" | "details" | "userName" | "createdAt">;

/**
 * Última decisão do aprovador sobre a VAGA que ainda EXPLICA o estado atual:
 * o log `suggestion_approved` / `suggestion_rejected` / `suggestion_returned`
 * mais recente da inclusão, desde que igual ou posterior ao piso de
 * `decisionFloorMs` (o mesmo de `pickLastDecision`), com a folga de relógio de
 * `VAGA_DECISION_SKEW_MS`.
 *
 * O piso é o que faz a devolução SUMIR quando a área revalida: sem ele, a linha
 * mostrava ao mesmo tempo "Validada pela área — aguardando aprovação" e
 * "Devolvida pelo aprovador", porque `/validate` não reseta `suggestionSentAt`.
 */
export function pickLastVagaDecision(
  inclusion: Pick<InclusionIdentity, "id" | "suggestionSentAt"> & {
    status?: string | null;
    validatedAt?: Date | string | null;
  },
  logs: VagaDecisionLog[],
): LastVagaDecisionInfo | null {
  const floorMs = decisionFloorMs(inclusion);
  let best: LastVagaDecisionInfo | null = null;
  let bestMs = -1;
  for (const log of logs) {
    if (log.teamInclusionId !== inclusion.id) continue;
    const action = VAGA_DECISION_BY_LOG_ACTION[log.action as VagaDecisionLogAction];
    if (!action) continue;
    const ms = toMs(log.createdAt);
    if (ms + VAGA_DECISION_SKEW_MS < floorMs) continue;
    if (ms <= bestMs) continue;
    bestMs = ms;
    best = {
      action,
      comment: commentFromLogDetails(log.details),
      byName: log.userName ?? null,
      at: toIso(log.createdAt),
    };
  }
  return best;
}

// ── Schemas dos bodies ───────────────────────────────────────────────────────
const suggestionRowSchema = z.object({
  functionId: z.string().min(1, "functionId é obrigatório"),
  area: z.string().nullish(),
  workDays: z.array(ymd).default([]),
  dailyRates: z.number().int().min(0).optional(),
  dailyValue: z.number().int().min(0).optional(),
  emitsNf: z.boolean().optional(),
  needsTicket: z.boolean().optional().default(false),
  needsAccommodation: z.boolean().optional().default(false),
  transportModeIda: z.enum(TRANSPORT_MODES).nullish(),
  transportModeVolta: z.enum(TRANSPORT_MODES).nullish(),
  scheduleStartDate: ymd.nullish(),
  scheduleEndDate: ymd.nullish(),
  flightDepartureDate: ymd.nullish(),
  flightDepartureSuggestedTime: hhmm.nullish(),
  flightArrivalSuggestedTime: hhmm.nullish(),
  flightReturnDate: ymd.nullish(),
  flightReturnSuggestedTime: hhmm.nullish(),
  city: z.string().max(1000, "Cidade pode ter no máximo 1000 caracteres").nullish(),
  observations: z.string().max(1000, "Observações podem ter no máximo 1000 caracteres").nullish(),
});

const bulkSuggestionSchema = z.object({
  eventId: z.string().min(1, "eventId é obrigatório"),
  rows: z.array(suggestionRowSchema)
    .min(1, "Informe ao menos uma vaga sugerida")
    .max(500, "Envie no máximo 500 vagas por vez"),
  eventObservations: z.string().max(1000, "Observações do evento podem ter no máximo 1000 caracteres").nullish(),
});

const DATE_KEYS = [
  "scheduleStartDate", "scheduleEndDate", "flightDepartureDate", "flightReturnDate",
  "flightDepartureSuggestedTime", "flightArrivalSuggestedTime", "flightReturnSuggestedTime",
];

/** Lote de ids (validação/aprovação): tamanho de tela, nunca ilimitado. */
const idsArray = z.array(z.string().min(1))
  .min(1, "Informe ao menos uma vaga")
  .max(500, "Envie no máximo 500 vagas por vez");

const idsSchema = z.object({ inclusionIds: idsArray });

/** Comentários livres: teto generoso para o texto humano, sem aceitar um payload sem fim. */
const COMMENT_MAX = 2000;
const COMMENT_MAX_MSG = "Comentário pode ter no máximo 2000 caracteres";

const reviewSchema = z.object({
  comment: z.string().trim().min(1, "Informe um comentário para a área").max(COMMENT_MAX, COMMENT_MAX_MSG),
  then: z.enum(["reenviar_validacao", "aprovar_direto"]),
  editedChanges: z.unknown().optional(),
});

const optionalCommentSchema = z.object({ comment: z.string().trim().max(COMMENT_MAX, COMMENT_MAX_MSG).optional() });
/** Decisões que devolvem/reprovam a vaga precisam explicar o porquê para a área. */
const requiredCommentSchema = z.object({
  comment: z.string().trim().min(1, "Informe um comentário para a área").max(COMMENT_MAX, COMMENT_MAX_MSG),
});
/** Lote de aprovação do aprovador. Aceita `ids` (contrato) ou `inclusionIds` (mesmo shape do /validate). */
const approveBatchSchema = z.object({
  ids: idsArray.optional(),
  inclusionIds: idsArray.optional(),
}).refine((b) => (b.ids ?? b.inclusionIds ?? []).length > 0, { message: "Informe ao menos uma vaga" });

/** Vaga já validada pela área mudou de estado entre a leitura e a decisão → 409. */
const VAGA_STATE_CHANGED = "A vaga não está mais aguardando aprovação — recarregue a lista";

// ── Registro das rotas ───────────────────────────────────────────────────────
export function registerScalingValidationRoutes(app: Express, deps: ScalingValidationDeps) {
  const { requireRoles, createAuditLog } = deps;

  // POST /api/scaling-suggestions/bulk — logística (admin/production) envia a
  // escala sugerida do evento. Cria team_inclusions em phase 'sugestao' /
  // status 'sugestao_pendente', sem colaborador, numa única transação.
  app.post("/api/scaling-suggestions/bulk", async (req, res) => {
    const actor = await requireRoles(req, res, ["admin", "production"]);
    if (!actor) return;
    try {
      const parsed = bulkSuggestionSchema.safeParse({
        ...req.body,
        rows: Array.isArray(req.body?.rows) ? req.body.rows.map((r: any) => blankToNull(r ?? {}, DATE_KEYS)) : req.body?.rows,
      });
      if (!parsed.success) {
        return res.status(400).json({ message: "Dados inválidos na escala sugerida", errors: parsed.error.flatten() });
      }
      const { eventId, rows, eventObservations } = parsed.data;

      const event = await storage.getEvent(eventId);
      if (!event) return res.status(404).json({ message: "Evento não encontrado" });
      // Evento encerrado: só o administrador. Enviar a escala sugerida CRIA
      // vagas — o evento já está carregado, então a guarda não relê nada.
      if (!assertLoadedEventEditable(event, actor, res)) return;

      const functionsById = new Map((await storage.getFunctions()).map((f) => [f.id, f]));
      const now = new Date();
      const inserts: InsertTeamInclusion[] = [];
      for (let idx = 0; idx < rows.length; idx++) {
        const r = rows[idx];
        const func = functionsById.get(r.functionId);
        if (!func) return res.status(400).json({ message: `Linha ${idx + 1}: função não encontrada` });
        const days = sortedYmd(r.workDays);
        const candidate = {
          eventId,
          functionId: r.functionId,
          collaboratorId: null,
          area: r.area ?? func.responsibleArea ?? null,
          emitsNf: r.emitsNf ?? true,
          workDays: days,
          dailyRates: r.dailyRates ?? days.length,
          dailyValue: r.dailyValue ?? 0,
          scheduleStartDate: r.scheduleStartDate ?? (days[0] ?? null),
          scheduleEndDate: r.scheduleEndDate ?? (days[days.length - 1] ?? null),
          needsTicket: r.needsTicket,
          needsAccommodation: r.needsAccommodation,
          transportModeIda: r.transportModeIda ?? null,
          transportModeVolta: r.transportModeVolta ?? null,
          flightDepartureDate: r.flightDepartureDate ?? null,
          flightDepartureSuggestedTime: r.flightDepartureSuggestedTime ?? null,
          flightArrivalSuggestedTime: r.flightArrivalSuggestedTime ?? null,
          flightReturnDate: r.flightReturnDate ?? null,
          flightReturnSuggestedTime: r.flightReturnSuggestedTime ?? null,
          city: r.city ?? null,
          observations: r.observations ?? null,
          rowOrder: idx,
          phase: SUGESTAO_PHASE,
          status: SUGESTAO_STATUS.PENDENTE,
          suggestionSentAt: now,
          userId: actor.id,
          updatedBy: actor.id,
        };
        inserts.push(insertTeamInclusionSchema.parse(candidate));
      }

      const eventUpdate = eventObservations !== undefined
        ? { eventId, observations: eventObservations ?? null }
        : undefined;
      const created = await storage.createScalingSuggestionsBatch(inserts, eventUpdate);

      await createAuditLog(
        "suggestion_sent", "team_inclusion", created[0]?.id ?? "bulk",
        { count: created.length, eventId, eventName: event.name },
        actor.id, actor.name, undefined, req,
      );
      for (const c of created) {
        await inclusionLog(c.id, "suggestion_sent", "Vaga sugerida pela logística — aguardando validação da área", null, SUGESTAO_STATUS.PENDENTE, actor);
      }
      if (eventUpdate) {
        await createAuditLog("update", "event", eventId, { observations: eventUpdate.observations }, actor.id, actor.name, { observations: event.observations }, req);
      }
      res.status(201).json({ created: created.length, items: created });
    } catch (error) {
      sendError(res, error, "erro ao enviar sugestões", "Erro ao enviar escala sugerida");
    }
  });

  // GET /api/scaling-suggestions?eventId= — sugestões ativas (todas as áreas).
  // Qualquer usuário logado pode ver.
  //
  // `eventId` é OPCIONAL (regra do dono, 26/08 — "aparecer inicialmente de
  // todos e se eu quiser ver de algum eu seleciono o evento"): SEM ele a rota
  // devolve as vagas em validação de TODOS os eventos, com as mesmas regras de
  // permissão por linha. O recorte de volume é o próprio `phase = 'sugestao'`:
  // só sai daqui o que ainda está no fluxo (a vaga aprovada virou Inclusão e a
  // negada só existe no histórico). NÃO existe corte por data — era exatamente
  // a vaga velha e parada que precisava aparecer —, e sim um teto de linhas
  // (`ALL_EVENTS_ROW_LIMIT`) aplicado no banco sobre as MAIS ANTIGAS primeiro:
  // se algo for cortado, é o menos urgente. A resposta continua sendo um ARRAY
  // (contrato inalterado); o corte é anunciado nos cabeçalhos
  // `X-Scaling-Truncated` / `X-Scaling-Row-Limit`.
  //
  // Cada linha traz:
  //  - eventName / eventStartDate / eventEndDate: o evento da vaga, para a tela
  //    agrupar e ordenar no modo "todos os eventos";
  //  - canEdit: admin ou VALIDADOR da função (pode validar / pedir ajuste);
  //  - canDecide: admin, APROVADOR da função ou o APROVADOR PADRÃO do sistema —
  //    aprovar/reprovar/devolver a vaga já validada (sugestao_validada) e o
  //    bypass das "vagas paradas" (sugestao_pendente). A lista inclui as
  //    VALIDADAS: só as NEGADAS saem.
  //  - daysPending: dias desde suggestionSentAt (reinicia a cada reenvio);
  //  - pendingRequest: pedido pendente da vaga (ou null);
  //  - lastDecision: última decisão do aprovador sobre um PEDIDO que explica o
  //    estado atual (vaga devolvida/negada) — LastDecisionInfo | null;
  //  - lastVagaDecision: última decisão do aprovador sobre a VAGA em si
  //    (aprovar/reprovar/devolver, que não criam pedido), lida de
  //    team_inclusion_logs — LastVagaDecisionInfo | null.
  app.get("/api/scaling-suggestions", async (req, res) => {
    const actor = await getActor(req, res);
    if (!actor) return;
    try {
      const eventId = String(req.query.eventId ?? "");

      const admin = isAdmin(actor);
      // Sem evento: teto no BANCO (limit+1 para saber que houve corte) e as mais
      // antigas primeiro. Com evento: exatamente como antes, sem teto.
      const [rowsRaw, validatorIds, approverIds, defaultApprover] = await Promise.all([
        eventId
          ? storage.getTeamInclusions(false, "sugestao", { eventId })
          : storage.getTeamInclusions(false, "sugestao", {
              orderBySuggestionSentAt: "asc",
              limit: ALL_EVENTS_ROW_LIMIT + 1,
            }),
        storage.getUserManagedFunctionIds(actor.id, "validador"),
        admin ? Promise.resolve([] as string[]) : storage.getUserManagedFunctionIds(actor.id, "aprovador"),
        isDefaultApprover(actor),
      ]);
      // TODO MUNDO VÊ A ESCALA INTEIRA; quem MEXE é quem tem permissão (regra
      // do dono, 26/08 — revoga o recorte por área tentado no mesmo dia). A
      // lista é a mesma para todos; `canEdit`/`canDecide` por linha continuam
      // decidindo quem valida e quem aprova, e o filtro "Só as minhas funções"
      // fica na mão de quem quiser estreitar a visão.
      const truncated = !eventId && rowsRaw.length > ALL_EVENTS_ROW_LIMIT;
      const rows = truncated ? rowsRaw.slice(0, ALL_EVENTS_ROW_LIMIT) : rowsRaw;

      // Pedidos (pendentes E resolvidos): os pendentes viram `pendingRequest`,
      // os resolvidos alimentam `lastDecision`. Sem evento, uma consulta EM
      // LOTE pelos eventos que de fato estão na lista — nunca a tabela toda.
      const eventIds = Array.from(new Set(rows.map((i) => i.eventId).filter(Boolean)));
      const [requests, eventsOfRows] = await Promise.all([
        eventId ? storage.getScalingChangeRequests({ eventId }) : storage.getScalingChangeRequests({ eventIds }),
        storage.getEventsByIds(eventIds),
      ]);
      const eventById = new Map(eventsOfRows.map((e) => [e.id, e]));
      const validates = new Set(validatorIds);
      const approves = new Set(approverIds);
      const pendingByInclusion = new Map<string, ScalingChangeRequest>();
      for (const r of requests) {
        if (r.status === CHANGE_REQUEST_STATUS.PENDENTE && r.teamInclusionId) pendingByInclusion.set(r.teamInclusionId, r);
      }

      const now = new Date();
      // Lista ATIVA: vagas negadas (reprovar_bypass / exclusão aprovada) ficam
      // só no histórico (event-view) — aqui não têm ação possível.
      const active = rows.filter((i) => i.status !== SUGESTAO_STATUS.NEGADA);

      // Decisão do aprovador sobre a VAGA (devolver/reprovar/aprovar não criam
      // pedido): UMA leitura dos logs de todas as vagas da lista, agrupada em
      // memória — nunca um SELECT por linha.
      const vagaLogs = await storage.getTeamInclusionLogsByInclusionIds(
        active.map((i) => i.id), VAGA_DECISION_LOG_ACTIONS,
      );
      const logsByInclusion = new Map<string, VagaDecisionLog[]>();
      for (const log of vagaLogs) {
        const list = logsByInclusion.get(log.teamInclusionId);
        if (list) list.push(log); else logsByInclusion.set(log.teamInclusionId, [log]);
      }

      const result = active
        .map((i) => ({
          ...i,
          ...eventFieldsOf(eventById.get(i.eventId)),
          canEdit: admin || validates.has(i.functionId),
          // O CADASTRO manda: aprovador da função decide, qualquer que seja o
          // papel — e o APROVADOR PADRÃO do sistema decide em qualquer função.
          canDecide: admin || approves.has(i.functionId) || defaultApprover,
          daysPending: daysPending(i.suggestionSentAt, now),
          pendingRequest: pendingByInclusion.get(i.id) ?? null,
          lastDecision: pickLastDecision(i, requests),
          lastVagaDecision: pickLastVagaDecision(i, logsByInclusion.get(i.id) ?? []),
        }));
      res.set("Cache-Control", "no-store");
      // Corte anunciado no cabeçalho: o corpo continua sendo um array puro
      // (as telas que sempre mandam eventId não mudam em nada).
      if (!eventId) {
        res.set("X-Scaling-Row-Limit", String(ALL_EVENTS_ROW_LIMIT));
        if (truncated) res.set("X-Scaling-Truncated", "1");
      }
      res.json(result);
    } catch (error) {
      sendError(res, error, "erro ao listar sugestões", "Erro ao buscar escala sugerida");
    }
  });

  // DELETE /api/scaling-suggestions?eventId= — "Cancelar envio": desfaz o /bulk
  // de um evento inteiro.
  //
  // Regra do usuário (19/08): depois de "Enviar para validação" não havia como
  // voltar atrás — grade errada ou evento errado só saíam pedindo exclusão vaga
  // por vaga na Validação. Aqui a logística remove TUDO de uma vez.
  //
  //  - autorização: a MESMA de quem envia (o /bulk) — admin e produção;
  //  - evento encerrado: só o administrador (assertLoadedEventEditable);
  //  - soft delete (deletedAt/deletedBy) das vagas em phase 'sugestao' com
  //    status ainda NÃO decidido (pendente / validada / com pedido) — ou seja,
  //    inclui o que a área já validou e o que tem pedido em aberto. NÃO toca no
  //    que já virou Inclusão (phase 'inclusao') nem no que está
  //    'sugestao_negada' (já saiu do fluxo). A regra é
  //    `isCancelableSuggestion` (shared), a mesma que a tela usa para contar;
  //  - os pedidos PENDENTES dessas vagas (e os de inclusão do evento, que
  //    pedem vaga nova num envio que deixou de existir) viram 'negado' com
  //    comentário — senão sobrariam órfãos na fila do aprovador;
  //  - tudo numa transação (storage.cancelScalingSuggestionSend).
  //
  // Verbo DELETE na coleção com o mesmo `?eventId=` do GET: cancelar é a
  // remoção do conjunto que o GET lista, não uma ação nova sobre uma vaga.
  app.delete("/api/scaling-suggestions", async (req, res) => {
    const actor = await requireRoles(req, res, ["admin", "production"]);
    if (!actor) return;
    try {
      const eventId = String(req.query.eventId ?? "");
      if (!eventId) return res.status(400).json({ message: "eventId é obrigatório" });

      const event = await storage.getEvent(eventId);
      if (!event) return res.status(404).json({ message: "Evento não encontrado" });
      // Evento encerrado: só o administrador. O evento já está carregado (o nome
      // vai para a auditoria), então a guarda não relê nada.
      if (!assertLoadedEventEditable(event, actor, res)) return;

      const now = new Date();
      const { removed, requestsCanceled } = await storage.cancelScalingSuggestionSend({
        eventId,
        statuses: CANCELABLE_SUGESTAO_STATUS,
        patch: { deletedAt: now, deletedBy: actor.id, updatedBy: actor.id },
        logFor: (row) => ({
          teamInclusionId: row.id,
          action: "suggestion_send_canceled",
          details: "Envio da escala sugerida cancelado pela logística — vaga removida da Validação de Escala",
          previousValue: stateLabel(row),
          newValue: "removida",
          userId: actor.id,
          userName: actor.name ?? "Usuário",
        }),
        shouldCancelRequest: isRequestCanceledByCancelSend,
        requestPatch: {
          status: CANCEL_SEND_REQUEST_STATUS,
          reviewComment: CANCEL_SEND_REQUEST_COMMENT,
          reviewedBy: actor.id,
          reviewedByName: actor.name ?? "Usuário",
          reviewedAt: now,
        },
      });

      if (removed.length > 0) {
        // Auditoria fora da transação: as vagas JÁ saíram e estão commitadas —
        // uma falha aqui não pode virar 500 e fazer o usuário cancelar de novo.
        try {
          await createAuditLog(
            "suggestion_send_canceled", "team_inclusion", removed[0].id,
            {
              count: removed.length,
              requestsCanceled: requestsCanceled.length,
              eventId,
              eventName: event.name,
              inclusionIds: removed.map((r) => r.id),
            },
            actor.id, actor.name, undefined, req,
          );
        } catch (auditError) {
          console.error(`[Validação de Escala] falha ao auditar cancelamento do envio do evento ${eventId}:`, auditError);
        }
      }

      res.json({ removed: removed.length, requestsCanceled: requestsCanceled.length });
    } catch (error) {
      sendError(res, error, "erro ao cancelar envio da sugestão", "Erro ao cancelar o envio da escala sugerida");
    }
  });

  // POST /api/scaling-suggestions/validate — validador da função (ou admin)
  // valida vagas em lote. A validação é o PRIMEIRO passo: a vaga vai para
  // 'sugestao_validada' e fica AGUARDANDO O APROVADOR (PATCH /:id/aprovar).
  app.post("/api/scaling-suggestions/validate", async (req, res) => {
    const actor = await getActor(req, res);
    if (!actor) return;
    const parsed = idsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.flatten() });
    try {
      const admin = isAdmin(actor);
      const ok: string[] = [];
      const skipped: { id: string; reason: string }[] = [];
      const now = new Date();

      // 1) Leitura em lote + checagens (permissão / estado) — nada gravado ainda.
      const ids = Array.from(new Set(parsed.data.inclusionIds));
      const byId = new Map((await storage.getTeamInclusionsByIds(ids)).map((i) => [i.id, i]));
      const roleCache = new Map<string, FunctionManagerRole | null>();
      // Evento encerrado: o lote não vira 403 inteiro — a vaga de evento
      // encerrado entra em `skipped` como qualquer outra recusa de linha. O
      // cache evita um getEvent por vaga (o lote é quase sempre de um evento só)
      // e nem chega a ser consultado quando o ator é administrador.
      const eventCache = newEventCache();
      const candidates: TeamInclusion[] = [];
      for (const id of ids) {
        const inclusion = byId.get(id);
        if (!inclusion || inclusion.deletedAt) { skipped.push({ id, reason: "Vaga não encontrada" }); continue; }
        if (!isSuggestionInclusion(inclusion)) { skipped.push({ id, reason: "Vaga não está em validação" }); continue; }
        if (await isEventIdBlockedForActor(inclusion.eventId, actor, eventCache)) {
          skipped.push({ id, reason: PAST_EVENT_BLOCK_MSG }); continue;
        }
        if (!roleCache.has(inclusion.functionId)) roleCache.set(inclusion.functionId, await roleFor(inclusion.functionId, actor.id));
        if (!canValidateInclusion(roleCache.get(inclusion.functionId), admin)) {
          skipped.push({ id, reason: "Sem permissão para validar esta função" }); continue;
        }
        try { nextSuggestionState(inclusion, "validar"); }
        catch (e) { skipped.push({ id, reason: e instanceof Error ? e.message : String(e) }); continue; }
        candidates.push(inclusion);
      }

      // 2) Gravação: UM update (inArray) + logs numa única transação. "validar"
      // só é válido a partir de sugestao_pendente e leva sempre a
      // sugestao/sugestao_validada — o patch é o mesmo para todas as vagas.
      let updated: TeamInclusion[] = [];
      if (candidates.length > 0) {
        const next = rule(() => nextSuggestionState({ phase: SUGESTAO_PHASE, status: SUGESTAO_STATUS.PENDENTE }, "validar"));
        updated = await storage.validateScalingSuggestionsBatch(
          candidates.map((c) => c.id),
          { phase: next.phase, status: next.status, validatedAt: now, validatedBy: actor.id, updatedBy: actor.id },
          { phase: SUGESTAO_PHASE, status: SUGESTAO_STATUS.PENDENTE },
          (row) => ({
            teamInclusionId: row.id,
            action: "suggestion_validated",
            details: "Vaga validada pela área — segue para aprovação do aprovador",
            previousValue: `${SUGESTAO_PHASE}/${SUGESTAO_STATUS.PENDENTE}`,
            newValue: stateLabel(row),
            userId: actor.id,
            userName: actor.name ?? "Usuário",
          }),
        );
      }
      const updatedIds = new Set(updated.map((u) => u.id));
      for (const c of candidates) {
        if (!updatedIds.has(c.id)) skipped.push({ id: c.id, reason: "A vaga mudou de estado antes de ser validada" });
      }

      // 3) Auditoria (fora da transação — não bloqueia a validação). As vagas JÁ
      // estão validadas e commitadas: uma falha aqui NUNCA pode virar 500 com
      // `ok` vazio (o usuário reenviaria e veria tudo como "já mudou de estado").
      // Loga e segue.
      for (const row of updated) {
        ok.push(row.id);
        try {
          await createAuditLog("suggestion_validated", "team_inclusion", row.id, row, actor.id, actor.name, byId.get(row.id), req);
        } catch (auditError) {
          console.error(`[Validação de Escala] falha ao auditar validação da vaga ${row.id}:`, auditError);
        }
      }
      res.json({ ok, skipped });
    } catch (error) {
      sendError(res, error, "erro ao validar", "Erro ao validar vagas");
    }
  });

  // ── Decisão do APROVADOR sobre a vaga JÁ VALIDADA pela área ────────────────
  // Segundo (e último) passo do fluxo: sugestão → validação da área → APROVAÇÃO
  // → Inclusão de Equipe. Mesma autorização do bypass: admin ou `aprovador` da
  // função. O bypass continua existindo, mas SÓ para vaga que a área nunca
  // validou (sugestao_pendente) — aqui o caminho é aprovar/reprovar/devolver.
  type VagaDecision = "aprovar" | "reprovar" | "devolver";
  const VAGA_DECISION_ACTION: Record<VagaDecision, SuggestionAction> = {
    aprovar: "aprovar_vaga",
    reprovar: "reprovar_vaga",
    devolver: "devolver_validacao",
  };
  // `action` é a chave lida de volta por `pickLastVagaDecision` (o tipo amarra
  // as duas pontas: mudar aqui sem mudar lá não compila).
  const VAGA_DECISION_LOG: Record<VagaDecision, { action: VagaDecisionLogAction; detail: string; message: string }> = {
    aprovar: {
      action: "suggestion_approved",
      detail: "Vaga aprovada pelo aprovador após validação da área — virou Inclusão",
      message: "Vaga aprovada",
    },
    reprovar: {
      action: "suggestion_rejected",
      detail: "Vaga reprovada pelo aprovador após validação da área — fica registrada como negada",
      message: "Vaga reprovada",
    },
    devolver: {
      action: "suggestion_returned",
      detail: "Vaga devolvida pelo aprovador para nova validação da área",
      message: "Vaga devolvida para validação da área",
    },
  };

  /**
   * Carrega a vaga em `sugestao_validada` e checa que o ator é aprovador da
   * função (ou admin). 404 vaga inexistente/excluída; 403 sem permissão — ANTES
   * do 409 de estado, para quem não pode decidir não sondar em que pé a vaga
   * está; 409 quando ela não está mais aguardando aprovação (já virou Inclusão,
   * foi devolvida, ganhou pedido pendente…).
   */
  async function loadValidatedForApprover(res: Response, actor: User, id: string): Promise<TeamInclusion | null> {
    const inclusion = await storage.getTeamInclusion(id);
    if (!inclusion || inclusion.deletedAt) { res.status(404).json({ message: "Vaga não encontrada" }); return null; }
    if (!await canDecideFunction(inclusion.functionId, actor)) {
      res.status(403).json({ message: NOT_APPROVER_MSG });
      return null;
    }
    if (!isSuggestionInclusion(inclusion) || inclusion.status !== SUGESTAO_STATUS.VALIDADA) {
      res.status(409).json({ message: VAGA_STATE_CHANGED }); return null;
    }
    // Evento encerrado: só o administrador. Aqui, e não em cada handler, porque
    // aprovar/reprovar/devolver passam todos por este carregamento.
    if (!await assertEventEditable(inclusion.eventId, actor, res)) return null;
    return inclusion;
  }

  /**
   * Patch da decisão. `aprovar` carimba validatedAt/By quando ausentes (mesmo
   * que a aprovação de pedido/bypass já fazia); `devolver` RESETA
   * suggestionSentAt para agora — o contador de atraso da área recomeça na
   * devolução, igual ao reenvio de pedido.
   */
  function vagaDecisionPatch(
    kind: VagaDecision, inclusion: TeamInclusion, next: { phase: string; status: string }, actor: User, now: Date,
  ): Partial<InsertTeamInclusion> {
    const patch: Partial<InsertTeamInclusion> = { phase: next.phase, status: next.status, updatedBy: actor.id };
    if (kind === "aprovar") {
      patch.validatedAt = inclusion.validatedAt ?? now;
      patch.validatedBy = inclusion.validatedBy ?? actor.id;
    }
    // Reprovar e devolver mandam a vaga de volta para a área (regra do dono,
    // 26/08): nos dois casos o relógio de "parada há N dias" recomeça agora —
    // senão a vaga voltaria já marcada como atrasada por causa da espera do
    // aprovador, que não é da área.
    if (kind === "devolver" || kind === "reprovar") {
      patch.suggestionSentAt = now;
      // Volta a ser vaga "não validada": a área revalida do zero.
      patch.validatedAt = null;
      patch.validatedBy = null;
    }
    return patch;
  }

  // PATCH /api/scaling-suggestions/:id/aprovar   body { comment? }
  // PATCH /api/scaling-suggestions/:id/reprovar  body { comment }  (obrigatório)
  // PATCH /api/scaling-suggestions/:id/devolver  body { comment }  (obrigatório)
  const vagaDecisionHandler = (kind: VagaDecision) => async (req: Request, res: Response) => {
    const actor = await getActor(req, res);
    if (!actor) return;
    try {
      const parsedBody = (kind === "aprovar" ? optionalCommentSchema : requiredCommentSchema).safeParse(req.body ?? {});
      if (!parsedBody.success) {
        return res.status(400).json({ message: parsedBody.error.issues[0]?.message ?? "Dados inválidos" });
      }
      const comment = parsedBody.data.comment?.trim() || null;

      const inclusion = await loadValidatedForApprover(res, actor, req.params.id);
      if (!inclusion) return;

      const next = rule(() => nextSuggestionState(inclusion, VAGA_DECISION_ACTION[kind]));
      const now = new Date();
      // UPDATE guardado: só grava se a vaga AINDA está validada aguardando o
      // aprovador — decisão concorrente que chegou antes leva; esta leva 409.
      const updated = await storage.updateTeamInclusionIfState(
        inclusion.id, vagaDecisionPatch(kind, inclusion, next, actor, now),
        { phase: SUGESTAO_PHASE, statuses: [SUGESTAO_STATUS.VALIDADA] },
      );
      if (!updated) return res.status(409).json({ message: VAGA_STATE_CHANGED_MSG });
      const { action, detail, message } = VAGA_DECISION_LOG[kind];
      await inclusionLog(
        inclusion.id, action, detailsWithComment(detail, comment),
        stateLabel(inclusion), stateLabel(updated), actor,
      );
      await createAuditLog(action, "team_inclusion", inclusion.id, { ...updated, reviewComment: comment }, actor.id, actor.name, inclusion, req);
      res.json({ message, inclusion: updated });
    } catch (error) {
      sendError(res, error, `erro ao ${kind} vaga validada`, `Erro ao ${kind} a vaga`);
    }
  };
  app.patch("/api/scaling-suggestions/:id/aprovar", vagaDecisionHandler("aprovar"));
  app.patch("/api/scaling-suggestions/:id/reprovar", vagaDecisionHandler("reprovar"));
  app.patch("/api/scaling-suggestions/:id/devolver", vagaDecisionHandler("devolver"));

  // POST /api/scaling-suggestions/aprovar-lote — body { ids: string[] }
  // Aprovação EM LOTE das vagas validadas, reaproveitando a mesma transação
  // guardada do /validate (UPDATE único por inArray + logs). Vaga que mudou de
  // estado entre a leitura e a gravação não volta no RETURNING e entra em
  // `skipped` — nunca vira erro do lote inteiro.
  app.post("/api/scaling-suggestions/aprovar-lote", async (req, res) => {
    const actor = await getActor(req, res);
    if (!actor) return;
    const parsed = approveBatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.flatten() });
    try {
      const admin = isAdmin(actor);
      const defaultApprover = await isDefaultApprover(actor);
      const ok: string[] = [];
      const skipped: { id: string; reason: string }[] = [];
      const now = new Date();

      // 1) Leitura em lote + checagens (permissão / estado) — nada gravado ainda.
      const ids = Array.from(new Set(parsed.data.ids ?? parsed.data.inclusionIds ?? []));
      const byId = new Map((await storage.getTeamInclusionsByIds(ids)).map((i) => [i.id, i]));
      const roleCache = new Map<string, FunctionManagerRole | null>();
      // Evento encerrado: mesma regra do /validate — a linha entra em `skipped`
      // em vez de derrubar o lote, com um getEvent por EVENTO (não por vaga).
      const eventCache = newEventCache();
      const candidates: TeamInclusion[] = [];
      for (const id of ids) {
        const inclusion = byId.get(id);
        if (!inclusion || inclusion.deletedAt) { skipped.push({ id, reason: "Vaga não encontrada" }); continue; }
        if (!isSuggestionInclusion(inclusion)) { skipped.push({ id, reason: "Vaga não está em validação" }); continue; }
        if (await isEventIdBlockedForActor(inclusion.eventId, actor, eventCache)) {
          skipped.push({ id, reason: PAST_EVENT_BLOCK_MSG }); continue;
        }
        if (!roleCache.has(inclusion.functionId)) roleCache.set(inclusion.functionId, await roleFor(inclusion.functionId, actor.id));
        // Aprovador padrão do sistema decide qualquer função (regra do dono, 26/08).
        if (!canApproveInFunction({ roleForFunction: roleCache.get(inclusion.functionId), isAdmin: admin, isDefaultApprover: defaultApprover })) {
          skipped.push({ id, reason: "Sem permissão para aprovar esta função" }); continue;
        }
        try { nextSuggestionState(inclusion, "aprovar_vaga"); }
        catch (e) { skipped.push({ id, reason: e instanceof Error ? e.message : String(e) }); continue; }
        candidates.push(inclusion);
      }

      // 2) Gravação. `aprovar_vaga` só é válido a partir de sugestao_validada e
      // leva sempre a inclusao/planejado, então o patch é o mesmo — exceto pelo
      // carimbo validatedAt/By, que só entra nas vagas que ainda não o têm
      // (um patch por grupo; no máximo duas transações).
      const next = rule(() => nextSuggestionState(
        { phase: SUGESTAO_PHASE, status: SUGESTAO_STATUS.VALIDADA }, "aprovar_vaga",
      ));
      const base = { phase: next.phase, status: next.status, updatedBy: actor.id };
      const updated: TeamInclusion[] = [];
      for (const stampValidated of [false, true]) {
        const rows = candidates.filter((c) => Boolean(c.validatedAt) === !stampValidated);
        if (rows.length === 0) continue;
        const batch = await storage.validateScalingSuggestionsBatch(
          rows.map((r) => r.id),
          stampValidated ? { ...base, validatedAt: now, validatedBy: actor.id } : base,
          { phase: SUGESTAO_PHASE, status: SUGESTAO_STATUS.VALIDADA },
          (row) => ({
            teamInclusionId: row.id,
            action: VAGA_DECISION_LOG.aprovar.action,
            details: VAGA_DECISION_LOG.aprovar.detail,
            previousValue: `${SUGESTAO_PHASE}/${SUGESTAO_STATUS.VALIDADA}`,
            newValue: stateLabel(row),
            userId: actor.id,
            userName: actor.name ?? "Usuário",
          }),
        );
        updated.push(...batch);
      }
      const updatedIds = new Set(updated.map((u) => u.id));
      for (const c of candidates) {
        if (!updatedIds.has(c.id)) skipped.push({ id: c.id, reason: VAGA_STATE_CHANGED });
      }

      // 3) Auditoria fora da transação: as vagas JÁ estão aprovadas e commitadas,
      // uma falha aqui não pode virar 500 com `ok` vazio (o usuário reenviaria e
      // veria tudo como "mudou de estado"). Loga e segue.
      for (const row of updated) {
        ok.push(row.id);
        try {
          await createAuditLog(VAGA_DECISION_LOG.aprovar.action, "team_inclusion", row.id, row, actor.id, actor.name, byId.get(row.id), req);
        } catch (auditError) {
          console.error(`[Validação de Escala] falha ao auditar aprovação da vaga ${row.id}:`, auditError);
        }
      }
      res.json({ ok, skipped });
    } catch (error) {
      sendError(res, error, "erro ao aprovar em lote", "Erro ao aprovar vagas");
    }
  });

  // POST /api/scaling-change-requests — validador da função (ou admin) abre um
  // pedido de ajuste/exclusão sobre uma vaga sugerida, ou de inclusão de vaga nova.
  app.post("/api/scaling-change-requests", async (req, res) => {
    const actor = await getActor(req, res);
    if (!actor) return;
    try {
      const parsed = insertScalingChangeRequestSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Dados inválidos no pedido", errors: parsed.error.flatten() });
      const body = parsed.data;
      // Teto do texto livre (o schema compartilhado não o impõe): pt-BR, 400.
      if (typeof body.reason === "string" && body.reason.length > 2000) {
        return res.status(400).json({ message: "Justificativa pode ter no máximo 2000 caracteres" });
      }

      let proposed: ProposedChanges;
      try { proposed = parseProposedChanges(body.proposedChanges, body.requestType); }
      catch (e) { return res.status(400).json({ message: e instanceof Error ? e.message : "proposedChanges inválido" }); }

      const admin = isAdmin(actor);
      // Permissão ANTES de sondar a vaga/pedido pendente: quem não é validador
      // da função não descobre estado de vagas alheias por aqui.
      const role = await roleFor(body.functionId, actor.id);
      if (!canValidateInclusion(role, admin)) {
        return res.status(403).json({ message: "Apenas o validador da função (ou admin) pode abrir pedidos" });
      }

      let inclusion: TeamInclusion | undefined;
      let window: ChangeWindow | null = null;

      if (body.requestType === "inclusao") {
        const [event, func] = await Promise.all([storage.getEvent(body.eventId), storage.getFunction(body.functionId)]);
        if (!event) return res.status(404).json({ message: "Evento não encontrado" });
        if (!func) return res.status(404).json({ message: "Função não encontrada" });
        // Evento encerrado: só o administrador — era a única mutação do módulo
        // sem a guarda. O evento já está carregado; a guarda não relê nada.
        if (!assertLoadedEventEditable(event, actor, res)) return;
      } else {
        inclusion = await storage.getTeamInclusion(body.teamInclusionId!);
        if (!inclusion || inclusion.deletedAt) return res.status(404).json({ message: "Vaga sugerida não encontrada" });
        if (inclusion.functionId !== body.functionId || inclusion.eventId !== body.eventId) {
          return res.status(400).json({ message: "functionId/eventId do pedido não correspondem à vaga" });
        }
        // Janela do pedido (regra do dono, 26/08): em validação, sempre; depois
        // de escalado, até a passagem ser comprada. As passagens só são lidas
        // quando a vaga já saiu da validação — antes disso não existem.
        window = changeRequestWindow(inclusion, {
          isAdmin: admin,
          tickets: isSuggestionInclusion(inclusion) ? null : await storage.getTicketsByInclusionId(inclusion.id),
        });
        if (!window.allowed) return res.status(403).json({ message: window.message });
        // Tirar da escala alguém que JÁ ESTÁ escalado não é pedido de ajuste: a
        // Escalação tem o fluxo de troca/cancelamento, com passagem e hospedagem
        // no meio. Barrar aqui evita um "aprovado" que apagaria a vaga por baixo.
        if (window.postScaling && body.requestType === "exclusao") {
          return res.status(400).json({ message: "A pessoa já está escalada — use a troca ou o cancelamento na Escalação." });
        }
        // Evento encerrado: só o administrador (mesma regra do ramo de inclusão).
        if (!await assertEventEditable(inclusion.eventId, actor, res)) return;
        const pending = (await storage.getScalingChangeRequestsByInclusion(inclusion.id))
          .find((r) => r.status === CHANGE_REQUEST_STATUS.PENDENTE);
        if (pending) return res.status(409).json({ message: "Já existe um pedido pendente para esta vaga" });
      }

      // Transição da vaga ANTES de gravar o pedido: se for inválida, nada é gravado.
      // Vaga JÁ ESCALADA não transiciona: a pessoa continua escalada, com
      // passagem e hospedagem de pé, enquanto o aprovador não decide. O pedido
      // fica pendurado nela e a trava contra pedido duplicado é a mesma.
      let next: { phase: string; status: string } | null = null;
      if (inclusion && !window?.postScaling) next = rule(() => nextSuggestionState(inclusion!, "pedir_ajuste"));

      // Pedido + transição da vaga na MESMA transação (storage). O UPDATE da
      // vaga exige o estado de onde "pedir_ajuste" é válido (pendente ou
      // validada): se uma decisão concorrente já a tirou de lá, a transação
      // aborta com 409 e o pedido NÃO fica criado.
      const { request: created, inclusion: updated } = await storage.createScalingChangeRequestWithTransition(
        {
          teamInclusionId: inclusion?.id ?? null,
          eventId: body.eventId,
          functionId: body.functionId,
          area: body.area ?? inclusion?.area ?? null,
          requestType: body.requestType,
          requestedBy: actor.id,
          requestedByName: actor.name ?? "Usuário",
          proposedChanges: JSON.stringify(proposed),
          reason: body.reason,
          status: CHANGE_REQUEST_STATUS.PENDENTE,
        },
        inclusion?.id ?? null,
        inclusion && next
          ? {
              phase: next.phase, status: next.status, updatedBy: actor.id,
              // Só "pendente": validada está na mesa do aprovador e não aceita
              // mais pedido (regra do dono, 26/08).
              expected: { phase: SUGESTAO_PHASE, statuses: [SUGESTAO_STATUS.PENDENTE] },
            }
          : null,
      );

      if (inclusion && updated) {
        await inclusionLog(inclusion.id, "suggestion_change_requested",
          `Pedido de ${body.requestType} aberto pela área: ${body.reason}`, stateLabel(inclusion), stateLabel(updated), actor);
      } else if (inclusion && window?.postScaling) {
        // Sem mudança de estado para registrar (de = para): o histórico da vaga
        // mostra que o pedido existe, que é o que a Escalação precisa saber.
        await inclusionLog(inclusion.id, "suggestion_change_requested",
          `Pedido de ajuste aberto sobre vaga já escalada: ${body.reason}`, stateLabel(inclusion), stateLabel(inclusion), actor);
      }
      await createAuditLog("create", "scaling_change_request", created.id, created, actor.id, actor.name, undefined, req);
      res.status(201).json(created);
    } catch (error) {
      sendError(res, error, "erro ao criar pedido", "Erro ao criar pedido");
    }
  });

  // GET /api/scaling-change-requests?status=&eventId= — papéis de
  // `canViewRequestsByRole` veem a fila inteira; qualquer outro papel vê os
  // pedidos das funções em que é aprovador. Sem nenhuma das duas coisas → 403.
  // `canDecide` sai SEMPRE do cadastro (aprovador da função ou admin) — o papel
  // global nunca força view-only: quem está cadastrado decide.
  app.get("/api/scaling-change-requests", async (req, res) => {
    const actor = await getActor(req, res);
    if (!actor) return;
    try {
      const status = req.query.status ? String(req.query.status) : undefined;
      const eventId = req.query.eventId ? String(req.query.eventId) : undefined;

      let functionIds: string[] | undefined;
      const admin = isAdmin(actor);
      // O aprovador PADRÃO do sistema decide qualquer função, então vê a fila
      // inteira — igual ao admin e aos papéis de `canViewRequestsByRole`.
      const defaultApprover = await isDefaultApprover(actor);
      // Papel autorizado vê a fila inteira; quem não é papel autorizado ainda vê
      // a fila FILTRADA às funções em que é aprovador; o resto leva 403.
      if (!canViewRequestsByRole(actor) && !defaultApprover) {
        functionIds = await storage.getUserManagedFunctionIds(actor.id, "aprovador");
        if (functionIds.length === 0) return res.status(403).json({ message: "Sem permissão para ver pedidos de ajuste" });
      }
      const approverIds = new Set(
        admin || defaultApprover ? [] : (functionIds ?? await storage.getUserManagedFunctionIds(actor.id, "aprovador")),
      );

      // Só o que os pedidos listados precisam: vagas (inArray de
      // teamInclusionIds), funções e eventos referenciados — nunca a tabela toda.
      const requests = await storage.getScalingChangeRequests({ status, eventId, functionIds });
      const [functions, events, inclusions] = await Promise.all([
        storage.getFunctionsByIds(requests.map((r) => r.functionId)),
        storage.getEventsByIds(requests.map((r) => r.eventId)),
        storage.getTeamInclusionsByIds(requests.map((r) => r.teamInclusionId).filter((id): id is string => Boolean(id))),
      ]);
      const funcName = new Map(functions.map((f) => [f.id, f.name]));
      const eventName = new Map(events.map((e) => [e.id, e.name]));
      const inclusionById = new Map(inclusions.map((i) => [i.id, i]));

      const result = requests.map((r) => {
        const inc = r.teamInclusionId ? inclusionById.get(r.teamInclusionId) : undefined;
        const proposed = safeJson(r.proposedChanges) as ProposedChanges | null;
        let diff: ReturnType<typeof diffInclusion> = [];
        if (inc && proposed && r.requestType === "ajuste") {
          try { diff = diffInclusion(inc, proposed); } catch { diff = []; }
        }
        return {
          ...r,
          functionName: funcName.get(r.functionId) ?? null,
          eventName: eventName.get(r.eventId) ?? null,
          inclusionNumber: inc?.inclusionNumber ?? null,
          inclusionState: inc ? { phase: inc.phase, status: inc.status } : null,
          proposed,
          diff,
          // O CADASTRO manda: aprovador da função decide, qualquer que seja o
          // papel — e o APROVADOR PADRÃO do sistema decide em qualquer função.
          canDecide: admin || defaultApprover || approverIds.has(r.functionId),
        };
      });
      res.set("Cache-Control", "no-store");
      res.json(result);
    } catch (error) {
      sendError(res, error, "erro ao listar pedidos", "Erro ao buscar pedidos de ajuste");
    }
  });

  /**
   * Carrega pedido pendente + checa que o ator é aprovador da função (ou admin).
   * O 403 vem ANTES do 409 de estado: quem não pode decidir não fica sondando
   * se o pedido já foi decidido.
   */
  async function loadPendingRequestForApprover(req: Request, res: Response, actor: User): Promise<ScalingChangeRequest | null> {
    const request = await storage.getScalingChangeRequest(req.params.id);
    if (!request) { res.status(404).json({ message: "Pedido não encontrado" }); return null; }
    if (!await canDecideFunction(request.functionId, actor)) {
      res.status(403).json({ message: NOT_APPROVER_MSG }); return null;
    }
    if (request.status !== CHANGE_REQUEST_STATUS.PENDENTE) {
      // 409 (conflito de estado), igual ao que o storage devolve quando perde a
      // corrida da trava em resolveScalingChangeRequest — o cliente trata os dois
      // do mesmo jeito ("recarregue a lista").
      res.status(409).json({ message: ALREADY_DECIDED }); return null;
    }
    // Evento encerrado: só o administrador. Aqui, e não em cada handler, porque
    // approve/reajustar/negar passam todos por este carregamento — e as três
    // criam ou promovem vaga (o pedido de inclusão aprovado cria N vagas).
    // O pedido guarda o eventId, então não é preciso carregar a vaga.
    if (!await assertEventEditable(request.eventId, actor, res)) return null;
    return request;
  }

  /**
   * A janela do pedido ainda está aberta para ESTA vaga já escalada?
   *
   * Vale na abertura E na decisão: o pedido pode ficar dias pendente e a
   * logística comprar a passagem no meio. Aplicar o ajuste depois da compra
   * mudaria a data de um voo pago sem ninguém saber. Responde 409 (conflito de
   * estado, o mesmo código que a tela já trata como "recarregue") com o motivo.
   */
  async function assertChangeWindowOpen(inclusion: TeamInclusion, actor: User, res: Response): Promise<boolean> {
    const win = changeRequestWindow(inclusion, {
      isAdmin: isAdmin(actor),
      tickets: await storage.getTicketsByInclusionId(inclusion.id),
    });
    if (win.allowed) return true;
    res.status(409).json({ message: win.message });
    return false;
  }

  /**
   * Monta as N linhas de team_inclusions de um pedido de inclusão (NÃO grava —
   * quem grava é `storage.resolveScalingChangeRequest`, na mesma transação do
   * pedido).
   *  - target 'inclusao' (aprovado): nascem já em inclusao/planejado, validadas;
   *  - target 'sugestao' (reenviar para validação): nascem em
   *    sugestao/sugestao_pendente com suggestionSentAt = agora, e a área valida
   *    como qualquer sugestão.
   */
  async function buildInclusionRowsFromRequest(
    request: ScalingChangeRequest, proposed: ProposedChanges, actor: User,
    target: "inclusao" | "sugestao" = "inclusao",
    // Mesmo instante do reviewedAt do pedido: suggestionSentAt == reviewedAt
    // permite ao GET casar a decisão com a vaga (lastDecision).
    now: Date = new Date(),
  ): Promise<InsertTeamInclusion[]> {
    const func = await storage.getFunction(request.functionId);
    const quantity = proposed.quantity ?? 1;
    const patch = proposedToPatch(proposed);
    const days = sortedYmd(patch.workDays ?? []);
    const state = target === "inclusao"
      ? toInclusaoState()
      : { phase: SUGESTAO_PHASE, status: SUGESTAO_STATUS.PENDENTE };
    const rows: InsertTeamInclusion[] = [];
    for (let i = 0; i < quantity; i++) {
      rows.push(insertTeamInclusionSchema.parse({
        eventId: request.eventId,
        functionId: request.functionId,
        collaboratorId: null,
        area: request.area ?? func?.responsibleArea ?? null,
        emitsNf: true,
        ...patch,
        workDays: days,
        dailyRates: patch.dailyRates ?? days.length,
        dailyValue: 0,
        needsTicket: patch.needsTicket ?? false,
        needsAccommodation: patch.needsAccommodation ?? false,
        phase: state.phase,
        status: state.status,
        // Nasceu de um pedido da Validação de Escala: rastreável na consulta histórica
        suggestionSentAt: target === "inclusao" ? (request.createdAt ?? now) : now,
        ...(target === "inclusao" ? { validatedAt: now, validatedBy: actor.id } : {}),
        userId: actor.id,
        updatedBy: actor.id,
      }));
    }
    return rows;
  }

  async function logCreatedFromRequest(created: TeamInclusion[], request: ScalingChangeRequest, actor: User, target: "inclusao" | "sugestao") {
    const detail = target === "inclusao"
      ? `Vaga criada a partir de pedido de inclusão aprovado (${request.requestedByName})`
      : `Vaga criada a partir de pedido de inclusão devolvido para validação da área (${request.requestedByName})`;
    for (const c of created) {
      await inclusionLog(c.id, "created_from_change_request", detail, null, stateLabel(c), actor);
    }
  }

  // PATCH /api/scaling-change-requests/:id/approve — aprovador aceita o pedido
  // como veio: ajuste → aplica na vaga e vira inclusão; inclusão → cria N vagas;
  // exclusão → vaga fica registrada como negada + soft delete.
  app.patch("/api/scaling-change-requests/:id/approve", async (req, res) => {
    const actor = await getActor(req, res);
    if (!actor) return;
    try {
      const request = await loadPendingRequestForApprover(req, res, actor);
      if (!request) return;
      const parsedComment = optionalCommentSchema.safeParse(req.body ?? {});
      if (!parsedComment.success) {
        return res.status(400).json({ message: parsedComment.error.issues[0]?.message ?? "Dados inválidos" });
      }
      const comment = parsedComment.data.comment?.trim() || null;
      const proposed = rule(() => parseProposedChanges(request.proposedChanges, request.requestType as any));
      const now = new Date();
      let inclusionResult: TeamInclusion | TeamInclusion[] | null = null;
      const requestUpdates = {
        status: CHANGE_REQUEST_STATUS.APROVADO,
        reviewComment: comment, reviewedBy: actor.id, reviewedByName: actor.name ?? "Usuário", reviewedAt: now,
      };
      let updatedRequest: ScalingChangeRequest;

      if (request.requestType === "inclusao") {
        // Cria as N vagas + decide o pedido numa única transação (storage).
        const rows = await buildInclusionRowsFromRequest(request, proposed, actor, "inclusao", now);
        const result = await storage.resolveScalingChangeRequest(request.id, requestUpdates, { inclusionInserts: rows });
        updatedRequest = result.request;
        inclusionResult = result.createdInclusions;
        await logCreatedFromRequest(result.createdInclusions, request, actor, "inclusao");
      } else {
        const inclusion = await storage.getTeamInclusion(request.teamInclusionId!);
        if (!inclusion) return res.status(404).json({ message: "Vaga do pedido não encontrada" });
        const isAjuste = request.requestType === "ajuste";
        // Vaga JÁ ESCALADA (pedido aberto pelo modal de Escalação): não há
        // transição a fazer — aplica o ajuste e a vaga fica exatamente onde
        // está, com a pessoa, a passagem e a hospedagem que já tem.
        const postScaling = !isSuggestionInclusion(inclusion);
        // A janela é conferida DE NOVO aqui: entre abrir o pedido e decidir, a
        // logística pode ter comprado a passagem — aprovar depois disso mudaria
        // datas de um voo pago sem ninguém saber.
        if (postScaling && !await assertChangeWindowOpen(inclusion, actor, res)) return;
        const patch: Partial<InsertTeamInclusion> = postScaling
          ? { ...proposedToPatch(proposed), updatedBy: actor.id }
          : (() => {
              const next = rule(() => nextSuggestionState(inclusion, "aprovar_pedido", { requestType: request.requestType as any }));
              return isAjuste
                ? {
                    ...proposedToPatch(proposed),
                    phase: next.phase, status: next.status,
                    validatedAt: inclusion.validatedAt ?? now, validatedBy: inclusion.validatedBy ?? actor.id,
                    updatedBy: actor.id,
                  }
                : {
                    phase: next.phase, status: next.status,
                    deletedAt: now, deletedBy: actor.id, updatedBy: actor.id,
                  };
            })();
        // Vaga + pedido na MESMA transação. O UPDATE da vaga exige que ela
        // AINDA esteja onde estava quando o pedido foi aberto — decisão
        // concorrente (ou vaga que andou na Escalação) → 409 e o pedido
        // continua pendente (a transação aborta inteira).
        const result = await storage.resolveScalingChangeRequest(request.id, requestUpdates, {
          inclusionUpdate: {
            id: inclusion.id, patch,
            expected: postScaling
              ? { phase: inclusion.phase, statuses: [inclusion.status] }
              : { phase: SUGESTAO_PHASE, statuses: [SUGESTAO_STATUS.AJUSTE] },
          },
        });
        updatedRequest = result.request;
        const updated = result.updatedInclusion!;
        const detail = postScaling
          ? `Pedido de ajuste aprovado por ${actor.name} — aplicado na vaga já escalada`
          : isAjuste
          ? `Pedido de ajuste aprovado por ${actor.name} — vaga virou Inclusão`
          : `Pedido de exclusão aprovado por ${actor.name} — vaga removida da escala`;
        await inclusionLog(inclusion.id, "change_request_approved", detail, stateLabel(inclusion), stateLabel(updated), actor);
        await createAuditLog("change_request_approved", "team_inclusion", inclusion.id, updated, actor.id, actor.name, inclusion, req);
        inclusionResult = updated;
      }

      if (comment) await addRequestNote(request.id, actor, comment);
      await createAuditLog("approve", "scaling_change_request", request.id, updatedRequest, actor.id, actor.name, request, req);
      res.json({ message: "Pedido aprovado", request: updatedRequest, inclusion: inclusionResult });
    } catch (error) {
      sendError(res, error, "erro ao aprovar pedido", "Erro ao aprovar pedido");
    }
  });

  // PATCH /api/scaling-change-requests/:id/reajustar | /negar
  // body { comment, then: 'reenviar_validacao' | 'aprovar_direto', editedChanges? }
  //  - reajustar: aprovador altera o pedido (editedChanges) e devolve para a
  //    área validar OU aprova direto já com as alterações;
  //  - negar: aprovador recusa o pedido e devolve para a área validar a vaga
  //    original OU aprova a vaga direto como estava.
  const reviewHandler = (kind: "reajustar" | "negar") => async (req: Request, res: Response) => {
    const actor = await getActor(req, res);
    if (!actor) return;
    try {
      const request = await loadPendingRequestForApprover(req, res, actor);
      if (!request) return;
      const parsedBody = reviewSchema.safeParse(req.body);
      if (!parsedBody.success) return res.status(400).json({ message: "Dados inválidos", errors: parsedBody.error.flatten() });
      const { comment, then, editedChanges } = parsedBody.data;

      const action: SuggestionAction = `${kind}_${then === "reenviar_validacao" ? "reenviar" : "aprovar_direto"}` as SuggestionAction;
      const requestType = request.requestType as "ajuste" | "inclusao" | "exclusao";
      const now = new Date();

      // Alterações a aplicar: só em "reajustar". editedChanges (se vier) substitui o pedido original.
      let changesToApply: ProposedChanges | null = null;
      let editedJson: string | null = null;
      if (kind === "reajustar") {
        if (editedChanges !== undefined && editedChanges !== null) {
          // Reajustar de volta para como a vaga está é permitido: o pedido é
          // resolvido e nenhum campo muda (allowEmptyAjuste).
          changesToApply = rule(() => parseProposedChanges(editedChanges, requestType, { allowEmptyAjuste: true }));
          editedJson = JSON.stringify(changesToApply);
        } else {
          changesToApply = rule(() => parseProposedChanges(request.proposedChanges, requestType));
        }
      }

      let inclusionResult: TeamInclusion | TeamInclusion[] | null = null;
      const newStatus = requestStatusForAction(action) ?? (kind === "reajustar" ? CHANGE_REQUEST_STATUS.REAJUSTADO : CHANGE_REQUEST_STATUS.NEGADO);
      const requestUpdates = {
        status: newStatus,
        reviewComment: comment, reviewedBy: actor.id, reviewedByName: actor.name ?? "Usuário", reviewedAt: now,
        ...(editedJson ? { proposedChanges: editedJson } : {}),
      };
      let updatedRequest: ScalingChangeRequest;

      if (requestType === "inclusao") {
        // Pedido de inclusão não tem vaga existente. Regras:
        //  - reajustar + aprovar_direto → cria as N vagas já em inclusao/planejado;
        //  - reajustar|negar + reenviar_validacao → cria as N vagas em
        //    sugestao/sugestao_pendente (suggestionSentAt = agora) para a área
        //    validar como qualquer sugestão, e o pedido fica
        //    'reenviado_validacao' apontando para a primeira vaga (antes era um
        //    beco sem saída: pedido devolvido sem vaga para voltar a pendente);
        //  - negar + aprovar_direto → nada a criar (só o pedido é negado).
        // Vagas + pedido na MESMA transação (storage).
        let rows: InsertTeamInclusion[] = [];
        let target: "inclusao" | "sugestao" | null = null;
        if (then === "aprovar_direto" && kind === "reajustar" && changesToApply) {
          target = "inclusao";
          rows = await buildInclusionRowsFromRequest({ ...request, proposedChanges: JSON.stringify(changesToApply) }, changesToApply, actor, "inclusao", now);
        } else if (then === "reenviar_validacao") {
          target = "sugestao";
          const proposedForRows = changesToApply ?? rule(() => parseProposedChanges(request.proposedChanges, requestType));
          // suggestionSentAt = now (mesmo instante do reviewedAt): o contador de
          // atraso da vaga nova começa na devolução.
          rows = await buildInclusionRowsFromRequest({ ...request, proposedChanges: JSON.stringify(proposedForRows) }, proposedForRows, actor, "sugestao", now);
        }
        const result = await storage.resolveScalingChangeRequest(
          request.id,
          then === "reenviar_validacao" ? { ...requestUpdates, status: CHANGE_REQUEST_STATUS.REENVIADO_VALIDACAO } : requestUpdates,
          rows.length ? { inclusionInserts: rows } : {},
        );
        updatedRequest = result.request;
        if (target && result.createdInclusions.length) {
          await logCreatedFromRequest(result.createdInclusions, request, actor, target);
          inclusionResult = result.createdInclusions;
        }
      } else {
        const inclusion = await storage.getTeamInclusion(request.teamInclusionId!);
        if (!inclusion) return res.status(404).json({ message: "Vaga do pedido não encontrada" });
        // Vaga JÁ ESCALADA: não existe "devolver para a área validar" — ela não
        // está na fila de validação. O aprovador reajusta e aplica, ou nega e a
        // vaga fica como está. A vaga NUNCA muda de fase por aqui.
        const postScaling = !isSuggestionInclusion(inclusion);
        // Mesma reconferência da aprovação: só o "reajustar" mexe na vaga, mas
        // negar depois da compra também precisa da mensagem certa.
        if (postScaling && kind === "reajustar" && !await assertChangeWindowOpen(inclusion, actor, res)) return;
        if (postScaling && then === "reenviar_validacao") {
          return res.status(400).json({
            message: "A pessoa já está escalada: este pedido não volta para a validação. Aprove com ajustes ou negue.",
          });
        }
        const patch: Partial<InsertTeamInclusion> = postScaling
          ? { updatedBy: actor.id }
          : (() => {
              const next = rule(() => nextSuggestionState(inclusion, action));
              const p: Partial<InsertTeamInclusion> = { phase: next.phase, status: next.status, updatedBy: actor.id };
              if (next.phase !== SUGESTAO_PHASE) {
                p.validatedAt = inclusion.validatedAt ?? now;
                p.validatedBy = inclusion.validatedBy ?? actor.id;
              } else {
                // Reenvio para validação: a vaga volta a sugestao_pendente e o
                // contador de atraso REINICIA (suggestionSentAt = agora, mesmo
                // instante do reviewedAt — o GET usa isso para casar a decisão).
                p.suggestionSentAt = now;
              }
              return p;
            })();
        // Em vaga já escalada, "negar" não muda nada nela — só o pedido é
        // decidido; "reajustar" aplica o que o aprovador editou.
        if (kind === "reajustar" && changesToApply && requestType === "ajuste") Object.assign(patch, proposedToPatch(changesToApply));
        // Vaga + pedido na MESMA transação, com o UPDATE guardado: as ações de
        // reajustar/negar só valem com a vaga AINDA onde estava.
        const result = await storage.resolveScalingChangeRequest(request.id, requestUpdates, {
          inclusionUpdate: {
            id: inclusion.id, patch,
            expected: postScaling
              ? { phase: inclusion.phase, statuses: [inclusion.status] }
              : { phase: SUGESTAO_PHASE, statuses: [SUGESTAO_STATUS.AJUSTE] },
          },
        });
        updatedRequest = result.request;
        const updated = result.updatedInclusion!;
        const detail = postScaling
          ? (kind === "reajustar"
              ? "Pedido reajustado e aplicado pelo aprovador — a vaga continua escalada"
              : "Pedido negado pelo aprovador — a vaga continua escalada como estava")
          : kind === "reajustar"
          ? (then === "reenviar_validacao" ? "Pedido reajustado pelo aprovador — vaga devolvida para validação da área" : "Pedido reajustado e aprovado direto pelo aprovador — vaga virou Inclusão")
          : (then === "reenviar_validacao" ? "Pedido negado pelo aprovador — vaga devolvida para validação da área" : "Pedido negado e vaga aprovada direto como estava — virou Inclusão");
        await inclusionLog(inclusion.id, `change_request_${kind}`, detailsWithComment(detail, comment), stateLabel(inclusion), stateLabel(updated), actor);
        await createAuditLog(`change_request_${kind}`, "team_inclusion", inclusion.id, updated, actor.id, actor.name, inclusion, req);
        inclusionResult = updated;
      }

      await addRequestNote(request.id, actor, comment);
      await createAuditLog(kind, "scaling_change_request", request.id, updatedRequest, actor.id, actor.name, request, req);
      res.json({ message: kind === "reajustar" ? "Pedido reajustado" : "Pedido negado", request: updatedRequest, inclusion: inclusionResult });
    } catch (error) {
      sendError(res, error, `erro ao ${kind} pedido`, `Erro ao ${kind} pedido`);
    }
  };
  app.patch("/api/scaling-change-requests/:id/reajustar", reviewHandler("reajustar"));
  app.patch("/api/scaling-change-requests/:id/negar", reviewHandler("negar"));

  // PATCH /api/scaling-suggestions/:id/bypass-approve | /bypass-reject —
  // aprovador da função (ou admin) decide vaga que a área nunca validou.
  const bypassHandler = (kind: "approve" | "reject") => async (req: Request, res: Response) => {
    const actor = await getActor(req, res);
    if (!actor) return;
    try {
      const inclusion = await storage.getTeamInclusion(req.params.id);
      if (!inclusion || inclusion.deletedAt) return res.status(404).json({ message: "Vaga não encontrada" });
      // 403 antes das checagens de estado: quem não é aprovador não sonda o
      // estado da vaga por aqui.
      if (!await canDecideFunction(inclusion.functionId, actor)) {
        return res.status(403).json({ message: NOT_APPROVER_MSG });
      }
      if (!isSuggestionInclusion(inclusion)) return res.status(400).json({ message: "A vaga não está na etapa de Validação de Escala" });
      // Evento encerrado: só o administrador. O bypass aprova a vaga direto
      // (vira Inclusão) — é exatamente o que não pode acontecer depois do fim.
      if (!await assertEventEditable(inclusion.eventId, actor, res)) return;
      const parsedComment = optionalCommentSchema.safeParse(req.body ?? {});
      if (!parsedComment.success) {
        return res.status(400).json({ message: parsedComment.error.issues[0]?.message ?? "Dados inválidos" });
      }
      const comment = parsedComment.data.comment?.trim() || null;
      const action: SuggestionAction = kind === "approve" ? "aprovar_direto_bypass" : "reprovar_bypass";
      const next = rule(() => nextSuggestionState(inclusion, action));
      const now = new Date();
      const patch: Partial<InsertTeamInclusion> = { phase: next.phase, status: next.status, updatedBy: actor.id };
      if (kind === "approve") { patch.validatedAt = now; patch.validatedBy = actor.id; }
      // UPDATE guardado: o bypass só vale com a vaga AINDA em sugestao_pendente
      // (a área validou / outra decisão chegou antes → 409).
      const updated = await storage.updateTeamInclusionIfState(
        inclusion.id, patch, { phase: SUGESTAO_PHASE, statuses: [SUGESTAO_STATUS.PENDENTE] },
      );
      if (!updated) return res.status(409).json({ message: VAGA_STATE_CHANGED_MSG });
      const detail = kind === "approve"
        ? "Vaga aprovada direto pelo aprovador (sem validação da área) — virou Inclusão"
        : "Vaga reprovada pelo aprovador (sem validação da área) — fica registrada como negada";
      await inclusionLog(inclusion.id, `suggestion_bypass_${kind}`, detailsWithComment(detail, comment), stateLabel(inclusion), stateLabel(updated), actor);
      await createAuditLog(`suggestion_bypass_${kind}`, "team_inclusion", inclusion.id, updated, actor.id, actor.name, inclusion, req);
      res.json({ message: kind === "approve" ? "Vaga aprovada" : "Vaga reprovada", inclusion: updated });
    } catch (error) {
      sendError(res, error, `erro no bypass (${kind})`, "Erro ao decidir vaga");
    }
  };
  app.patch("/api/scaling-suggestions/:id/bypass-approve", bypassHandler("approve"));
  app.patch("/api/scaling-suggestions/:id/bypass-reject", bypassHandler("reject"));

  // GET /api/scaling-suggestions/event-view?eventId= — consulta histórica:
  // todas as sugestões (incl. aprovadas/negadas/excluídas) + inclusões já em
  // 'inclusao' que nasceram de sugestão (suggestionSentAt não nulo) + pedidos.
  //
  // `eventId` é OPCIONAL (regra do dono, 26/08). SEM ele o histórico é o de
  // TODOS os eventos que ainda importam, num recorte explícito — aqui, ao
  // contrário da lista de vagas em validação, o passado inteiro caberia na
  // consulta, então o corte é obrigatório:
  //   (a) eventos com vaga ainda em validação (phase 'sugestao');
  //   (b) eventos com pedido em aberto;
  //   (c) eventos encerrados nos últimos ALL_EVENTS_RECENT_DAYS dias.
  // Sobre esse conjunto vale o mesmo teto de linhas, agora com as MAIS RECENTES
  // primeiro (histórico se lê do fim para o começo) e `truncated` na resposta —
  // que já era um objeto, então nada de contrato muda para quem manda eventId.
  app.get("/api/scaling-suggestions/event-view", async (req, res) => {
    const actor = await getActor(req, res);
    if (!actor) return;
    try {
      const eventId = String(req.query.eventId ?? "");

      // Recorte de eventos do modo "todos" (união de (a), (b) e (c)).
      let scopeEventIds: string[] | undefined;
      if (!eventId) {
        const cutoff = recentEventsCutoffYmd();
        const [openRows, openRequests, allEvents] = await Promise.all([
          storage.getTeamInclusions(false, "sugestao"),
          storage.getScalingChangeRequests({ status: CHANGE_REQUEST_STATUS.PENDENTE }),
          storage.getEvents(),
        ]);
        const ids = new Set<string>();
        for (const r of openRows) if (r.eventId) ids.add(r.eventId);
        for (const r of openRequests) if (r.eventId) ids.add(r.eventId);
        // A tabela de eventos é pequena e já vem inteira para a tela; o recorte
        // por data sai daqui sem custo de consulta extra.
        for (const e of allEvents) if ((e.endDate ?? "") >= cutoff) ids.add(e.id);
        scopeEventIds = Array.from(ids);
      }

      const listOpts = eventId
        ? { eventId }
        : {
            eventIds: scopeEventIds ?? [],
            fromSuggestionOnly: true,
            orderBySuggestionSentAt: "desc" as const,
            limit: ALL_EVENTS_ROW_LIMIT + 1,
          };
      const allRaw = await storage.getTeamInclusions(true, "all", listOpts);
      const truncated = !eventId && allRaw.length > ALL_EVENTS_ROW_LIMIT;
      const all = truncated ? allRaw.slice(0, ALL_EVENTS_ROW_LIMIT) : allRaw;

      const rows = all.filter((i) => isSuggestionInclusion(i) || (i.suggestionSentAt && !i.deletedAt));
      const rowEventIds = Array.from(new Set(rows.map((i) => i.eventId).filter(Boolean)));
      const [requests, eventsOfRows] = await Promise.all([
        eventId
          ? storage.getScalingChangeRequests({ eventId })
          : storage.getScalingChangeRequests({ eventIds: scopeEventIds ?? [] }),
        storage.getEventsByIds(rowEventIds),
      ]);
      const eventById = new Map(eventsOfRows.map((e) => [e.id, e]));

      const requestsByInclusion = new Map<string, ScalingChangeRequest[]>();
      for (const r of requests) {
        if (!r.teamInclusionId) continue;
        const list = requestsByInclusion.get(r.teamInclusionId) ?? [];
        list.push(r);
        requestsByInclusion.set(r.teamInclusionId, list);
      }
      const withExtras = (i: TeamInclusion) => ({
        ...i,
        ...eventFieldsOf(eventById.get(i.eventId)),
        requests: requestsByInclusion.get(i.id) ?? [],
      });
      res.set("Cache-Control", "no-store");
      res.json({
        suggestions: rows.filter((i) => isSuggestionInclusion(i)).map(withExtras),
        inclusions: rows.filter((i) => !isSuggestionInclusion(i)).map(withExtras),
        requests,
        // Só no modo "todos os eventos": a tela avisa e oferece o filtro.
        truncated,
        rowLimit: eventId ? null : ALL_EVENTS_ROW_LIMIT,
        eventCount: eventId ? 1 : (scopeEventIds?.length ?? 0),
      });
    } catch (error) {
      sendError(res, error, "erro na consulta do evento", "Erro ao consultar histórico da escala");
    }
  });

  // GET /api/scaling-default-approver — quem é o aprovador padrão do sistema
  // (regra do dono, 26/08: "sempre será o Pedro Telles"). Só leitura, para a
  // tela do admin mostrar "Aprovador padrão: Fulano" nas funções sem aprovador
  // próprio. Devolve `{ userId: null, userName: null }` quando não configurado
  // — a tela simplesmente não mostra a linha.
  app.get("/api/scaling-default-approver", async (req, res) => {
    const actor = await getActor(req, res);
    if (!actor) return;
    try {
      const userId = await defaultApproverId();
      if (!userId) return res.json({ userId: null, userName: null });
      const user = await storage.getUser(userId);
      // Id configurado apontando para usuário que não existe mais: devolve o id
      // sem nome (a tela cai no texto genérico) em vez de inventar alguém.
      res.set("Cache-Control", "no-store");
      res.json({ userId, userName: user?.name ?? null });
    } catch (error) {
      sendError(res, error, "erro ao ler o aprovador padrão", "Erro ao buscar o aprovador padrão");
    }
  });

  /**
   * GET /api/scaling-change-requests/pending-by-inclusion — quais vagas têm
   * pedido EM ABERTO, para a LISTA da Escalação marcar cada linha (regra do
   * dono, 26/08: "sinalizar também que está em aprovação de ajuste").
   *
   * Uma consulta para a tela inteira, em vez de uma por linha. Devolve o
   * mínimo: vaga, tipo, quem pediu, quando e o motivo — o mesmo que o selo
   * mostra no tooltip. Só leitura, sem estado de vaga alheia além disso.
   */
  app.get("/api/scaling-change-requests/pending-by-inclusion", async (req, res) => {
    const actor = await getActor(req, res);
    if (!actor) return;
    try {
      const eventId = req.query.eventId ? String(req.query.eventId) : undefined;
      const pend = await storage.getScalingChangeRequests({ status: CHANGE_REQUEST_STATUS.PENDENTE, eventId });
      res.set("Cache-Control", "no-store");
      res.json(
        pend
          .filter((r) => r.teamInclusionId)
          .map((r) => ({
            teamInclusionId: r.teamInclusionId,
            requestType: r.requestType,
            reason: r.reason,
            requestedByName: r.requestedByName,
            createdAt: r.createdAt,
          })),
      );
    } catch (error) {
      sendError(res, error, "erro ao listar pedidos em aberto", "Erro ao buscar pedidos em aberto");
    }
  });

  /**
   * GET /api/team-inclusions/:id/change-window — o modal de Escalação pergunta
   * "esta pessoa pode receber pedido de ajuste agora?" e recebe papel + janela +
   * pedido em aberto numa resposta só.
   *
   * Existe para a tela não recalcular permissão: quem responde é a mesma regra
   * que o POST usa para aceitar ou recusar (`changeRequestWindow`), então o
   * botão nunca promete o que a API vai negar. Só leitura.
   */
  app.get("/api/team-inclusions/:id/change-window", async (req, res) => {
    const actor = await getActor(req, res);
    if (!actor) return;
    try {
      const inclusion = await storage.getTeamInclusion(req.params.id);
      if (!inclusion) return res.status(404).json({ message: "Vaga não encontrada" });

      const admin = isAdmin(actor);
      const role = await roleFor(inclusion.functionId, actor.id);
      const canRequest = canValidateInclusion(role, admin);
      res.set("Cache-Control", "no-store");
      // Sem papel para pedir: a tela não mostra nada. Devolve cedo para não
      // sondar passagens nem pedidos de vaga alheia.
      if (!canRequest) {
        return res.json({ canRequest: false, allowed: false, postScaling: false, adminOverride: false, pendingRequest: null });
      }

      // Evento encerrado (20/08) trava antes da janela da passagem: a mensagem
      // que a área vê é a do evento, que é o bloqueio mais forte.
      const event = await storage.getEvent(inclusion.eventId);
      if (event && isEventBlockedForActor(event, actor)) {
        return res.json({
          canRequest: true, allowed: false, message: PAST_EVENT_BLOCK_MSG,
          postScaling: !isSuggestionInclusion(inclusion), adminOverride: false, pendingRequest: null,
        });
      }

      const tickets = isSuggestionInclusion(inclusion) ? [] : await storage.getTicketsByInclusionId(inclusion.id);
      const window = changeRequestWindow(inclusion, { isAdmin: admin, tickets });
      const pending = (await storage.getScalingChangeRequestsByInclusion(inclusion.id))
        .find((r) => r.status === CHANGE_REQUEST_STATUS.PENDENTE) ?? null;
      // Passagem já em preparação (linha existe, compra ainda não): mudar data
      // agora significa a logística refazer a cotação — a tela avisa antes.
      const ticketInProgress = tickets.length > 0 && !window.adminOverride && window.allowed;

      res.json({
        canRequest: true,
        allowed: window.allowed,
        // A tela usa o motivo para decidir o que mostrar: "passagem comprada" é
        // aviso útil; vaga cancelada/excluída não merece cartão nenhum.
        block: window.block ?? null,
        message: window.message ?? null,
        postScaling: window.postScaling,
        adminOverride: window.adminOverride,
        ticketInProgress,
        pendingRequest: pending && {
          id: pending.id,
          requestType: pending.requestType,
          reason: pending.reason,
          requestedByName: pending.requestedByName,
          createdAt: pending.createdAt,
          // O QUE foi pedido, no de/para — a tela mostrava só o motivo
          // ("ddhg"), que não diz nada sobre a mudança em si. Mesmo cálculo do
          // GET da fila de pedidos.
          diff: (() => {
            if (pending.requestType !== "ajuste") return [];
            const proposed = safeJson(pending.proposedChanges) as ProposedChanges | null;
            if (!proposed) return [];
            try { return diffInclusion(inclusion, proposed); } catch { return []; }
          })(),
        },
      });
    } catch (error) {
      sendError(res, error, "erro ao ler a janela de ajuste", "Erro ao verificar o pedido de ajuste");
    }
  });
}
