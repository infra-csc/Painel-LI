/**
 * Validação de Escala — rotas da API.
 *
 * Fluxo: a logística envia a escala SUGERIDA de um evento (team_inclusions com
 * phase 'sugestao'); cada área valida a parte dela (validador da função) ou abre
 * pedidos de ajuste/inclusão/exclusão (scaling_change_requests); um aprovador
 * central (function_managers.role = 'aprovador') decide os pedidos. Quando a
 * vaga é aprovada ela vira uma Inclusão comum ({ phase: 'inclusao', status:
 * 'planejado' }) — a MESMA linha de team_inclusions.
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
} from "@shared/scaling-validation-rules";
import { normalizeRole, type CanonicalRole } from "@shared/roles";

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
const canViewRequestsByRole = (u: User) => {
  const r = normalizeRole(u.role);
  return r === "admin" || r === "purchasing" || r === "production";
};

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
      console.error("[Validação de Escala] erro ao enviar sugestões:", error);
      res.status(400).json({ message: "Erro ao enviar escala sugerida", error: error instanceof Error ? error.message : String(error) });
    }
  });

  // GET /api/scaling-suggestions?eventId= — sugestões ativas do evento (todas
  // as áreas) + canEdit (responsável da função, qualquer papel, ou admin) e
  // daysPending. Qualquer usuário logado pode ver.
  app.get("/api/scaling-suggestions", async (req, res) => {
    const actor = await getActor(req, res);
    if (!actor) return;
    try {
      const eventId = String(req.query.eventId ?? "");
      if (!eventId) return res.status(400).json({ message: "eventId é obrigatório" });

      const [rows, validatorIds, requests] = await Promise.all([
        storage.getTeamInclusions(false, "sugestao"),
        storage.getUserManagedFunctionIds(actor.id, "validador"),
        storage.getScalingChangeRequests({ eventId, status: CHANGE_REQUEST_STATUS.PENDENTE }),
      ]);
      const admin = isAdmin(actor);
      const validates = new Set(validatorIds);
      const pendingByInclusion = new Map<string, ScalingChangeRequest>();
      for (const r of requests) if (r.teamInclusionId) pendingByInclusion.set(r.teamInclusionId, r);

      const now = new Date();
      // Lista ATIVA: vagas negadas (reprovar_bypass / exclusão aprovada) ficam
      // só no histórico (event-view) — aqui não têm ação possível.
      const result = rows
        .filter((i) => i.eventId === eventId && i.status !== SUGESTAO_STATUS.NEGADA)
        .map((i) => ({
          ...i,
          // canEdit = quem pode validar/pedir ajuste: admin ou VALIDADOR da função
          // (aprovador via lista veria o botão e levaria 403).
          canEdit: admin || validates.has(i.functionId),
          daysPending: daysPending(i.suggestionSentAt, now),
          pendingRequest: pendingByInclusion.get(i.id) ?? null,
        }));
      res.set("Cache-Control", "no-store");
      res.json(result);
    } catch (error) {
      console.error("[Validação de Escala] erro ao listar sugestões:", error);
      res.status(500).json({ message: "Erro ao buscar escala sugerida" });
    }
  });

  // POST /api/scaling-suggestions/validate — validador da função (ou admin)
  // valida vagas em lote. Sem pedido → vira Inclusão (inclusao/planejado).
  app.post("/api/scaling-suggestions/validate", async (req, res) => {
    const actor = await getActor(req, res);
    if (!actor) return;
    const parsed = idsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.flatten() });
    try {
      const admin = isAdmin(actor);
      const ok: string[] = [];
      const skipped: { id: string; reason: string }[] = [];
      const roleCache = new Map<string, FunctionManagerRole | null>();
      const now = new Date();

      for (const id of parsed.data.inclusionIds) {
        const inclusion = await storage.getTeamInclusion(id);
        if (!inclusion || inclusion.deletedAt) { skipped.push({ id, reason: "Vaga não encontrada" }); continue; }
        if (!isSuggestionInclusion(inclusion)) { skipped.push({ id, reason: "Vaga não está em validação" }); continue; }
        if (!roleCache.has(inclusion.functionId)) roleCache.set(inclusion.functionId, await roleFor(inclusion.functionId, actor.id));
        if (!canValidateInclusion(roleCache.get(inclusion.functionId), admin)) {
          skipped.push({ id, reason: "Sem permissão para validar esta função" }); continue;
        }
        let next;
        try { next = nextSuggestionState(inclusion, "validar"); }
        catch (e) { skipped.push({ id, reason: e instanceof Error ? e.message : String(e) }); continue; }

        const updated = await storage.updateTeamInclusion(id, {
          phase: next.phase, status: next.status,
          validatedAt: now, validatedBy: actor.id, updatedBy: actor.id,
        });
        await inclusionLog(id, "suggestion_validated", "Vaga validada pela área — virou Inclusão (aguardando escalação)", stateLabel(inclusion), stateLabel(updated), actor);
        await createAuditLog("suggestion_validated", "team_inclusion", id, updated, actor.id, actor.name, inclusion, req);
        ok.push(id);
      }
      res.json({ ok, skipped });
    } catch (error) {
      console.error("[Validação de Escala] erro ao validar:", error);
      res.status(500).json({ message: "Erro ao validar vagas" });
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
      if (inclusion) next = nextSuggestionState(inclusion, "pedir_ajuste");

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
      console.error("[Validação de Escala] erro ao criar pedido:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Erro ao criar pedido" });
    }
  });

  // GET /api/scaling-change-requests?status=&eventId= — admin/compras/produção
  // veem tudo; aprovador vê os pedidos das funções em que é aprovador.
  app.get("/api/scaling-change-requests", async (req, res) => {
    const actor = await getActor(req, res);
    if (!actor) return;
    try {
      const status = req.query.status ? String(req.query.status) : undefined;
      const eventId = req.query.eventId ? String(req.query.eventId) : undefined;

      let functionIds: string[] | undefined;
      const admin = isAdmin(actor);
      if (!canViewRequestsByRole(actor)) {
        functionIds = await storage.getUserManagedFunctionIds(actor.id, "aprovador");
        if (functionIds.length === 0) return res.status(403).json({ message: "Sem permissão para ver pedidos de ajuste" });
      }
      const approverIds = new Set(admin ? [] : await storage.getUserManagedFunctionIds(actor.id, "aprovador"));

      const [requests, functions, events, inclusions] = await Promise.all([
        storage.getScalingChangeRequests({ status, eventId, functionIds }),
        storage.getFunctions(),
        storage.getEvents(),
        storage.getTeamInclusions(true, "all"),
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
          canDecide: admin || approverIds.has(r.functionId),
        };
      });
      res.set("Cache-Control", "no-store");
      res.json(result);
    } catch (error) {
      console.error("[Validação de Escala] erro ao listar pedidos:", error);
      res.status(500).json({ message: "Erro ao buscar pedidos de ajuste" });
    }
  });

  /** Carrega pedido pendente + checa que o ator é aprovador da função (ou admin). */
  async function loadPendingRequestForApprover(req: Request, res: Response, actor: User): Promise<ScalingChangeRequest | null> {
    const request = await storage.getScalingChangeRequest(req.params.id);
    if (!request) { res.status(404).json({ message: "Pedido não encontrado" }); return null; }
    if (request.status !== CHANGE_REQUEST_STATUS.PENDENTE) {
      res.status(400).json({ message: "Este pedido já foi decidido" }); return null;
    }
    const role = await roleFor(request.functionId, actor.id);
    if (!canApproveRequest(role, isAdmin(actor))) {
      res.status(403).json({ message: "Apenas o aprovador da função (ou admin) pode decidir este pedido" }); return null;
    }
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
  ): Promise<InsertTeamInclusion[]> {
    const func = await storage.getFunction(request.functionId);
    const quantity = proposed.quantity ?? 1;
    const patch = proposedToPatch(proposed);
    const days = sortedYmd(patch.workDays ?? []);
    const now = new Date();
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
      const proposed = parseProposedChanges(request.proposedChanges, request.requestType as any);
      const now = new Date();
      let inclusionResult: TeamInclusion | TeamInclusion[] | null = null;
      const requestUpdates = {
        status: CHANGE_REQUEST_STATUS.APROVADO,
        reviewComment: comment, reviewedBy: actor.id, reviewedByName: actor.name ?? "Usuário", reviewedAt: now,
      };
      let updatedRequest: ScalingChangeRequest;

      if (request.requestType === "inclusao") {
        // Cria as N vagas + decide o pedido numa única transação (storage).
        const rows = await buildInclusionRowsFromRequest(request, proposed, actor, "inclusao");
        const result = await storage.resolveScalingChangeRequest(request.id, requestUpdates, { inclusionInserts: rows });
        updatedRequest = result.request;
        inclusionResult = result.createdInclusions;
        await logCreatedFromRequest(result.createdInclusions, request, actor, "inclusao");
      } else {
        const inclusion = await storage.getTeamInclusion(request.teamInclusionId!);
        if (!inclusion) return res.status(404).json({ message: "Vaga do pedido não encontrada" });
        const next = nextSuggestionState(inclusion, "aprovar_pedido", { requestType: request.requestType as any });
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
      console.error("[Validação de Escala] erro ao aprovar pedido:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Erro ao aprovar pedido" });
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
          changesToApply = parseProposedChanges(editedChanges, requestType);
          editedJson = JSON.stringify(changesToApply);
        } else {
          changesToApply = parseProposedChanges(request.proposedChanges, requestType);
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
          rows = await buildInclusionRowsFromRequest({ ...request, proposedChanges: JSON.stringify(changesToApply) }, changesToApply, actor, "inclusao");
        } else if (then === "reenviar_validacao") {
          target = "sugestao";
          const proposedForRows = changesToApply ?? parseProposedChanges(request.proposedChanges, requestType);
          rows = await buildInclusionRowsFromRequest({ ...request, proposedChanges: JSON.stringify(proposedForRows) }, proposedForRows, actor, "sugestao");
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
        const next = nextSuggestionState(inclusion, action);
        const patch: Partial<InsertTeamInclusion> = { phase: next.phase, status: next.status, updatedBy: actor.id };
        if (kind === "reajustar" && changesToApply && requestType === "ajuste") Object.assign(patch, proposedToPatch(changesToApply));
        if (next.phase !== SUGESTAO_PHASE) {
          patch.validatedAt = inclusion.validatedAt ?? now;
          patch.validatedBy = inclusion.validatedBy ?? actor.id;
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
        await inclusionLog(inclusion.id, `change_request_${kind}`, `${detail}. Comentário: ${comment}`, stateLabel(inclusion), stateLabel(updated), actor);
        await createAuditLog(`change_request_${kind}`, "team_inclusion", inclusion.id, updated, actor.id, actor.name, inclusion, req);
        inclusionResult = updated;
      }

      await addRequestNote(request.id, actor, comment);
      await createAuditLog(kind, "scaling_change_request", request.id, updatedRequest, actor.id, actor.name, request, req);
      res.json({ message: kind === "reajustar" ? "Pedido reajustado" : "Pedido negado", request: updatedRequest, inclusion: inclusionResult });
    } catch (error) {
      console.error(`[Validação de Escala] erro ao ${kind} pedido:`, error);
      res.status(400).json({ message: error instanceof Error ? error.message : `Erro ao ${kind} pedido` });
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
      const comment = optionalCommentSchema.safeParse(req.body ?? {}).data?.comment ?? null;
      const action: SuggestionAction = kind === "approve" ? "aprovar_direto_bypass" : "reprovar_bypass";
      const next = nextSuggestionState(inclusion, action);
      const now = new Date();
      const patch: Partial<InsertTeamInclusion> = { phase: next.phase, status: next.status, updatedBy: actor.id };
      if (kind === "approve") { patch.validatedAt = now; patch.validatedBy = actor.id; }
      const updated = await storage.updateTeamInclusion(inclusion.id, patch);
      const detail = kind === "approve"
        ? "Vaga aprovada direto pelo aprovador (sem validação da área) — virou Inclusão"
        : "Vaga reprovada pelo aprovador (sem validação da área) — fica registrada como negada";
      await inclusionLog(inclusion.id, `suggestion_bypass_${kind}`, comment ? `${detail}. Comentário: ${comment}` : detail, stateLabel(inclusion), stateLabel(updated), actor);
      await createAuditLog(`suggestion_bypass_${kind}`, "team_inclusion", inclusion.id, updated, actor.id, actor.name, inclusion, req);
      res.json({ message: kind === "approve" ? "Vaga aprovada" : "Vaga reprovada", inclusion: updated });
    } catch (error) {
      console.error(`[Validação de Escala] erro no bypass (${kind}):`, error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Erro ao decidir vaga" });
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
        storage.getTeamInclusions(true, "all"),
        storage.getScalingChangeRequests({ eventId }),
      ]);
      const rows = all.filter((i) =>
        i.eventId === eventId &&
        (isSuggestionInclusion(i) || (i.suggestionSentAt && !i.deletedAt)),
      );
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
      console.error("[Validação de Escala] erro na consulta do evento:", error);
      res.status(500).json({ message: "Erro ao consultar histórico da escala" });
    }
  });
}
