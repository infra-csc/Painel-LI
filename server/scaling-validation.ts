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
  isSuggestionInclusion,
  nextSuggestionState,
  toInclusaoState,
  parseProposedChanges,
  diffInclusion,
  daysPending,
  canValidateInclusion,
  canApproveRequest,
  requestStatusForAction,
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
import { normalizeRole, type CanonicalRole } from "@shared/roles";
import {
  assertEventEditable,
  assertLoadedEventEditable,
  isEventIdBlockedForActor,
  newEventCache,
  PAST_EVENT_BLOCK_MSG,
} from "./event-guard";

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
const ymd = z.string().regex(YMD, "Data inválida (use AAAA-MM-DD)");
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "Horário inválido (use HH:MM)");

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
  const userId = (req as any).session?.userId as string | undefined;
  if (!userId) { res.status(401).json({ message: "Não autenticado" }); return null; }
  const user = await storage.getUser(userId);
  if (!user) { res.status(401).json({ message: "Usuário não encontrado" }); return null; }
  return user;
}

const isAdmin = (u: User) => normalizeRole(u.role) === "admin";

/**
 * Papéis que VEEM a fila inteira de pedidos (matriz §7 do briefing).
 * `financial` entra aqui como LEITURA — ele acompanha os pedidos mas nunca
 * decide (ver `isViewOnlyRequests`). Quem não está nesta lista ainda pode ver a
 * fila FILTRADA às funções em que é `aprovador` (fallback do aprovador, abaixo);
 * o 403 sobra só para quem não é nem papel autorizado nem aprovador.
 */
const canViewRequestsByRole = (u: User) => {
  const r = normalizeRole(u.role);
  return r === "admin" || r === "purchasing" || r === "production" || r === "financial";
};

/**
 * Papel que SÓ acompanha (matriz §7: financial = view na Aprovação de Escala).
 * Para ele `canDecide` é sempre false nos payloads — a UI nunca oferece um botão
 * de decisão. As rotas de decisão continuam exigindo ser `aprovador` da função
 * (ou admin), então isto só ESCONDE uma ação, nunca concede uma.
 */
const isViewOnlyRequests = (u: User) => normalizeRole(u.role) === "financial";

async function roleFor(functionId: string, userId: string): Promise<FunctionManagerRole | null> {
  return storage.getUserFunctionRole(functionId, userId);
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
  if (error instanceof Error && error.message === ALREADY_DECIDED) {
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
  city: z.string().nullish(),
  observations: z.string().nullish(),
});

const bulkSuggestionSchema = z.object({
  eventId: z.string().min(1, "eventId é obrigatório"),
  rows: z.array(suggestionRowSchema).min(1, "Informe ao menos uma vaga sugerida"),
  eventObservations: z.string().nullish(),
});

const DATE_KEYS = [
  "scheduleStartDate", "scheduleEndDate", "flightDepartureDate", "flightReturnDate",
  "flightDepartureSuggestedTime", "flightArrivalSuggestedTime", "flightReturnSuggestedTime",
];

const idsSchema = z.object({ inclusionIds: z.array(z.string().min(1)).min(1, "Informe ao menos uma vaga") });

const reviewSchema = z.object({
  comment: z.string().trim().min(1, "Informe um comentário para a área"),
  then: z.enum(["reenviar_validacao", "aprovar_direto"]),
  editedChanges: z.unknown().optional(),
});

const optionalCommentSchema = z.object({ comment: z.string().trim().optional() });
/** Decisões que devolvem/reprovam a vaga precisam explicar o porquê para a área. */
const requiredCommentSchema = z.object({ comment: z.string().trim().min(1, "Informe um comentário para a área") });
/** Lote de aprovação do aprovador. Aceita `ids` (contrato) ou `inclusionIds` (mesmo shape do /validate). */
const approveBatchSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Informe ao menos uma vaga").optional(),
  inclusionIds: z.array(z.string().min(1)).min(1, "Informe ao menos uma vaga").optional(),
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

  // GET /api/scaling-suggestions?eventId= — sugestões ativas do evento (todas
  // as áreas). Qualquer usuário logado pode ver. Cada linha traz:
  //  - canEdit: admin ou VALIDADOR da função (pode validar / pedir ajuste);
  //  - canDecide: admin ou APROVADOR da função — aprovar/reprovar/devolver a
  //    vaga já validada (sugestao_validada) e o bypass das "vagas paradas"
  //    (sugestao_pendente). A lista inclui as VALIDADAS: só as NEGADAS saem.
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
      if (!eventId) return res.status(400).json({ message: "eventId é obrigatório" });

      const admin = isAdmin(actor);
      const viewOnly = isViewOnlyRequests(actor);
      const [rows, validatorIds, approverIds, requests] = await Promise.all([
        storage.getTeamInclusions(false, "sugestao", { eventId }),
        storage.getUserManagedFunctionIds(actor.id, "validador"),
        admin || viewOnly ? Promise.resolve([] as string[]) : storage.getUserManagedFunctionIds(actor.id, "aprovador"),
        // Todos os pedidos do evento (pendentes E resolvidos): os pendentes viram
        // `pendingRequest`, os resolvidos alimentam `lastDecision`.
        storage.getScalingChangeRequests({ eventId }),
      ]);
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
          canEdit: admin || validates.has(i.functionId),
          // `viewOnly` (financial) nunca decide — nem o bypass das "vagas paradas".
          canDecide: !viewOnly && (admin || approves.has(i.functionId)),
          daysPending: daysPending(i.suggestionSentAt, now),
          pendingRequest: pendingByInclusion.get(i.id) ?? null,
          lastDecision: pickLastDecision(i, requests),
          lastVagaDecision: pickLastVagaDecision(i, logsByInclusion.get(i.id) ?? []),
        }));
      res.set("Cache-Control", "no-store");
      res.json(result);
    } catch (error) {
      sendError(res, error, "erro ao listar sugestões", "Erro ao buscar escala sugerida");
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
   * função (ou admin). 404 vaga inexistente/excluída; 409 quando ela não está
   * mais aguardando aprovação (já virou Inclusão, foi devolvida, ganhou pedido
   * pendente…); 403 sem permissão.
   */
  async function loadValidatedForApprover(res: Response, actor: User, id: string): Promise<TeamInclusion | null> {
    const inclusion = await storage.getTeamInclusion(id);
    if (!inclusion || inclusion.deletedAt) { res.status(404).json({ message: "Vaga não encontrada" }); return null; }
    if (!isSuggestionInclusion(inclusion) || inclusion.status !== SUGESTAO_STATUS.VALIDADA) {
      res.status(409).json({ message: VAGA_STATE_CHANGED }); return null;
    }
    const role = await roleFor(inclusion.functionId, actor.id);
    if (!canApproveRequest(role, isAdmin(actor))) {
      res.status(403).json({ message: "Apenas o aprovador da função (ou admin) pode decidir a vaga validada" });
      return null;
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
    if (kind === "devolver") patch.suggestionSentAt = now;
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
      const updated = await storage.updateTeamInclusion(
        inclusion.id, vagaDecisionPatch(kind, inclusion, next, actor, now),
      );
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
        if (!canApproveRequest(roleCache.get(inclusion.functionId), admin)) {
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

      let proposed: ProposedChanges;
      try { proposed = parseProposedChanges(body.proposedChanges, body.requestType); }
      catch (e) { return res.status(400).json({ message: e instanceof Error ? e.message : "proposedChanges inválido" }); }

      const admin = isAdmin(actor);
      let inclusion: TeamInclusion | undefined;

      if (body.requestType === "inclusao") {
        const [event, func] = await Promise.all([storage.getEvent(body.eventId), storage.getFunction(body.functionId)]);
        if (!event) return res.status(404).json({ message: "Evento não encontrado" });
        if (!func) return res.status(404).json({ message: "Função não encontrada" });
      } else {
        inclusion = await storage.getTeamInclusion(body.teamInclusionId!);
        if (!inclusion || inclusion.deletedAt) return res.status(404).json({ message: "Vaga sugerida não encontrada" });
        if (!isSuggestionInclusion(inclusion)) return res.status(400).json({ message: "A vaga não está na etapa de Validação de Escala" });
        if (inclusion.functionId !== body.functionId || inclusion.eventId !== body.eventId) {
          return res.status(400).json({ message: "functionId/eventId do pedido não correspondem à vaga" });
        }
        const pending = (await storage.getScalingChangeRequestsByInclusion(inclusion.id))
          .find((r) => r.status === CHANGE_REQUEST_STATUS.PENDENTE);
        if (pending) return res.status(409).json({ message: "Já existe um pedido pendente para esta vaga" });
      }

      const role = await roleFor(body.functionId, actor.id);
      if (!canValidateInclusion(role, admin)) {
        return res.status(403).json({ message: "Apenas o validador da função (ou admin) pode abrir pedidos" });
      }

      // Transição da vaga ANTES de gravar o pedido: se for inválida, nada é gravado.
      let next: { phase: string; status: string } | null = null;
      if (inclusion) next = rule(() => nextSuggestionState(inclusion!, "pedir_ajuste"));

      // Pedido + transição da vaga na MESMA transação (storage).
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
        inclusion && next ? { phase: next.phase, status: next.status, updatedBy: actor.id } : null,
      );

      if (inclusion && updated) {
        await inclusionLog(inclusion.id, "suggestion_change_requested",
          `Pedido de ${body.requestType} aberto pela área: ${body.reason}`, stateLabel(inclusion), stateLabel(updated), actor);
      }
      await createAuditLog("create", "scaling_change_request", created.id, created, actor.id, actor.name, undefined, req);
      res.status(201).json(created);
    } catch (error) {
      sendError(res, error, "erro ao criar pedido", "Erro ao criar pedido");
    }
  });

  // GET /api/scaling-change-requests?status=&eventId= — admin/compras/produção/RH
  // veem tudo (RH só acompanha: canDecide sempre false); qualquer outro papel vê
  // os pedidos das funções em que é aprovador. Sem nenhuma das duas coisas → 403.
  app.get("/api/scaling-change-requests", async (req, res) => {
    const actor = await getActor(req, res);
    if (!actor) return;
    try {
      const status = req.query.status ? String(req.query.status) : undefined;
      const eventId = req.query.eventId ? String(req.query.eventId) : undefined;

      let functionIds: string[] | undefined;
      const admin = isAdmin(actor);
      const viewOnly = isViewOnlyRequests(actor);
      // Papel autorizado vê a fila inteira; quem não é papel autorizado ainda vê
      // a fila FILTRADA às funções em que é aprovador; o resto leva 403.
      if (!canViewRequestsByRole(actor)) {
        functionIds = await storage.getUserManagedFunctionIds(actor.id, "aprovador");
        if (functionIds.length === 0) return res.status(403).json({ message: "Sem permissão para ver pedidos de ajuste" });
      }
      const approverIds = new Set(
        admin || viewOnly ? [] : (functionIds ?? await storage.getUserManagedFunctionIds(actor.id, "aprovador")),
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
          canDecide: !viewOnly && (admin || approverIds.has(r.functionId)),
        };
      });
      res.set("Cache-Control", "no-store");
      res.json(result);
    } catch (error) {
      sendError(res, error, "erro ao listar pedidos", "Erro ao buscar pedidos de ajuste");
    }
  });

  /** Carrega pedido pendente + checa que o ator é aprovador da função (ou admin). */
  async function loadPendingRequestForApprover(req: Request, res: Response, actor: User): Promise<ScalingChangeRequest | null> {
    const request = await storage.getScalingChangeRequest(req.params.id);
    if (!request) { res.status(404).json({ message: "Pedido não encontrado" }); return null; }
    if (request.status !== CHANGE_REQUEST_STATUS.PENDENTE) {
      // 409 (conflito de estado), igual ao que o storage devolve quando perde a
      // corrida da trava em resolveScalingChangeRequest — o cliente trata os dois
      // do mesmo jeito ("recarregue a lista").
      res.status(409).json({ message: ALREADY_DECIDED }); return null;
    }
    const role = await roleFor(request.functionId, actor.id);
    if (!canApproveRequest(role, isAdmin(actor))) {
      res.status(403).json({ message: "Apenas o aprovador da função (ou admin) pode decidir este pedido" }); return null;
    }
    // Evento encerrado: só o administrador. Aqui, e não em cada handler, porque
    // approve/reajustar/negar passam todos por este carregamento — e as três
    // criam ou promovem vaga (o pedido de inclusão aprovado cria N vagas).
    // O pedido guarda o eventId, então não é preciso carregar a vaga.
    if (!await assertEventEditable(request.eventId, actor, res)) return null;
    return request;
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
      const comment = optionalCommentSchema.safeParse(req.body ?? {}).data?.comment ?? null;
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
        const next = rule(() => nextSuggestionState(inclusion, "aprovar_pedido", { requestType: request.requestType as any }));
        const isAjuste = request.requestType === "ajuste";
        const patch: Partial<InsertTeamInclusion> = isAjuste
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
        // Vaga + pedido na MESMA transação.
        const result = await storage.resolveScalingChangeRequest(request.id, requestUpdates, {
          inclusionUpdate: { id: inclusion.id, patch },
        });
        updatedRequest = result.request;
        const updated = result.updatedInclusion!;
        const detail = isAjuste
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
          changesToApply = rule(() => parseProposedChanges(editedChanges, requestType));
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
        const next = rule(() => nextSuggestionState(inclusion, action));
        const patch: Partial<InsertTeamInclusion> = { phase: next.phase, status: next.status, updatedBy: actor.id };
        if (kind === "reajustar" && changesToApply && requestType === "ajuste") Object.assign(patch, proposedToPatch(changesToApply));
        if (next.phase !== SUGESTAO_PHASE) {
          patch.validatedAt = inclusion.validatedAt ?? now;
          patch.validatedBy = inclusion.validatedBy ?? actor.id;
        } else {
          // Reenvio para validação: a vaga volta a sugestao_pendente e o
          // contador de atraso REINICIA (suggestionSentAt = agora, mesmo
          // instante do reviewedAt — o GET usa isso para casar a decisão).
          patch.suggestionSentAt = now;
        }
        // Vaga + pedido na MESMA transação.
        const result = await storage.resolveScalingChangeRequest(request.id, requestUpdates, {
          inclusionUpdate: { id: inclusion.id, patch },
        });
        updatedRequest = result.request;
        const updated = result.updatedInclusion!;
        const detail = kind === "reajustar"
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
      if (!isSuggestionInclusion(inclusion)) return res.status(400).json({ message: "A vaga não está na etapa de Validação de Escala" });
      const role = await roleFor(inclusion.functionId, actor.id);
      if (!canApproveRequest(role, isAdmin(actor))) {
        return res.status(403).json({ message: "Apenas o aprovador da função (ou admin) pode decidir sem validação da área" });
      }
      // Evento encerrado: só o administrador. O bypass aprova a vaga direto
      // (vira Inclusão) — é exatamente o que não pode acontecer depois do fim.
      if (!await assertEventEditable(inclusion.eventId, actor, res)) return;
      const comment = optionalCommentSchema.safeParse(req.body ?? {}).data?.comment ?? null;
      const action: SuggestionAction = kind === "approve" ? "aprovar_direto_bypass" : "reprovar_bypass";
      const next = rule(() => nextSuggestionState(inclusion, action));
      const now = new Date();
      const patch: Partial<InsertTeamInclusion> = { phase: next.phase, status: next.status, updatedBy: actor.id };
      if (kind === "approve") { patch.validatedAt = now; patch.validatedBy = actor.id; }
      const updated = await storage.updateTeamInclusion(inclusion.id, patch);
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
  app.get("/api/scaling-suggestions/event-view", async (req, res) => {
    const actor = await getActor(req, res);
    if (!actor) return;
    try {
      const eventId = String(req.query.eventId ?? "");
      if (!eventId) return res.status(400).json({ message: "eventId é obrigatório" });
      const [all, requests] = await Promise.all([
        storage.getTeamInclusions(true, "all", { eventId }),
        storage.getScalingChangeRequests({ eventId }),
      ]);
      const rows = all.filter((i) => isSuggestionInclusion(i) || (i.suggestionSentAt && !i.deletedAt));
      const requestsByInclusion = new Map<string, ScalingChangeRequest[]>();
      for (const r of requests) {
        if (!r.teamInclusionId) continue;
        const list = requestsByInclusion.get(r.teamInclusionId) ?? [];
        list.push(r);
        requestsByInclusion.set(r.teamInclusionId, list);
      }
      res.set("Cache-Control", "no-store");
      res.json({
        suggestions: rows.filter((i) => isSuggestionInclusion(i)).map((i) => ({ ...i, requests: requestsByInclusion.get(i.id) ?? [] })),
        inclusions: rows.filter((i) => !isSuggestionInclusion(i)).map((i) => ({ ...i, requests: requestsByInclusion.get(i.id) ?? [] })),
        requests,
      });
    } catch (error) {
      sendError(res, error, "erro na consulta do evento", "Erro ao consultar histórico da escala");
    }
  });
}
