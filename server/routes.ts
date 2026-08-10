import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { z } from "zod";
import { storage } from "./storage";
import { db } from "./db";
import { budgetNotes, functionManagers as functionManagersTable, budgetPlanned as budgetPlannedTable, events as eventsTable, swapRequests as swapRequestsTable, teamInclusions as teamInclusionsTable, collaborators as collaboratorsTable, flashLedgerEntries } from "@shared/schema";
import { eq, and, inArray, desc, sql as drizzleSql } from "drizzle-orm";
import { 
  insertEventSchema,
  updateEventSchema,
  insertFunctionSchema, 
  insertCollaboratorSchema,
  insertTeamInclusionSchema,
  insertTicketSchema,
  insertAccommodationSchema,
  insertFinancialSchema,
  insertCommentSchema,
  insertUserSchema,
  publicUserRegistrationSchema,
  insertFunctionValuesSchema,
  insertBudgetPlannedSchema,
  insertBudgetActualSchema,
  insertBudgetComparisonSchema,
  insertInvoiceSchema,
  insertBudgetNoteSchema,
  insertSwapRequestSchema,
  insertFlashLedgerEntrySchema
} from "@shared/schema";
import bcrypt from "bcryptjs";
import { randomBytes, timingSafeEqual } from "crypto";

// Comparação de tokens em tempo constante (defesa contra timing attacks)
function safeTokenEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
import { getOperationalMirror, recalculateLogisticsSuggestions, exportOperationalMirrorExcel, patchOperationalMirrorCell } from "./operational-mirror";
import {
  uberGroups as uberGroupsTable,
  hotelRoomGroups as hotelRoomGroupsTable,
  logisticsExtraCosts as logisticsExtraCostsTable,
  insertLogisticsExtraCostSchema,
} from "@shared/schema";

// Audit helpers
function sanitizeFields(data: any): any {
  if (!data || typeof data !== 'object') return data;
  
  const sensitiveFields = ['password', 'resetToken', 'resetTokenExpiry'];
  const sanitized = { ...data };
  
  for (const field of sensitiveFields) {
    if (sanitized[field] !== undefined) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

function safeDiff(oldData: any, newData: any): { changed: string[], previous: any, current: any } {
  if (!oldData && !newData) return { changed: [], previous: {}, current: {} };
  if (!oldData) return { changed: Object.keys(newData || {}), previous: {}, current: sanitizeFields(newData) };
  if (!newData) return { changed: [], previous: sanitizeFields(oldData), current: {} };
  
  const changed: string[] = [];
  const previous: any = {};
  const current: any = {};
  
  // Compare all fields from both objects
  const allFields = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  
  for (const field of Array.from(allFields)) {
    if (oldData[field] !== newData[field]) {
      changed.push(field);
      previous[field] = oldData[field];
      current[field] = newData[field];
    }
  }
  
  return {
    changed,
    previous: sanitizeFields(previous),
    current: sanitizeFields(current)
  };
}

function getEntityName(entityType: string, entityData: any): string {
  if (!entityData) return 'N/A';
  
  switch (entityType) {
    case 'user':
      return entityData.name || entityData.email || 'Usuário';
    case 'event':
      return entityData.name || `Evento #${entityData.eventNumber}` || 'Evento';
    case 'function':
      return entityData.name || `Função #${entityData.functionNumber}` || 'Função';
    case 'collaborator':
      return entityData.fullName || `Colaborador #${entityData.collaboratorNumber}` || 'Colaborador';
    case 'team_inclusion':
      return `Inclusão #${entityData.inclusionNumber}` || 'Inclusão de Equipe';
    case 'ticket':
      return entityData.purchaseOrderNumber || `Passagem #${entityData.id?.slice(0, 8)}` || 'Passagem';
    case 'accommodation':
      return entityData.reservationNumber || `Hospedagem #${entityData.id?.slice(0, 8)}` || 'Hospedagem';
    case 'financial':
      return `Financeiro #${entityData.id?.slice(0, 8)}` || 'Registro Financeiro';
    case 'comment':
      return `Comentário em ${entityData.phase}` || 'Comentário';
    case 'budget_planned':
      return entityData.collaboratorName || `Planejamento #${entityData.id?.slice(0, 8)}` || 'Planejamento';
    case 'budget_actual':
      return entityData.collaboratorName || `Prestação #${entityData.id?.slice(0, 8)}` || 'Prestação de Contas';
    case 'budget_comparison':
      return entityData.collaboratorName || `Comparativo #${entityData.id?.slice(0, 8)}` || 'Comparativo';
    case 'system_settings':
      return 'Configurações do Sistema';
    default:
      return entityType;
  }
}

async function createAuditLog(
  action: string,
  entityType: string, 
  entityId: string,
  entityData: any,
  userId?: string,
  userName?: string,
  oldData?: any,
  req?: any
) {
  try {
    const diff = safeDiff(oldData, entityData);
    
    await storage.createSystemLog({
      action,
      entityType,
      entityId,
      entityName: getEntityName(entityType, entityData),
      details: diff.changed.length > 0 
        ? `Campos alterados: ${diff.changed.join(', ')}`
        : `${action} realizada`,
      previousData: diff.changed.length > 0 ? JSON.stringify(diff.previous) : null,
      newData: diff.changed.length > 0 ? JSON.stringify(diff.current) : JSON.stringify(sanitizeFields(entityData)),
      userId: userId || null,
      userName: userName || 'Sistema',
      ipAddress: req?.ip || req?.connection?.remoteAddress || null,
      userAgent: req?.get('User-Agent') || null
    });
  } catch (error) {
    console.error('Failed to create audit log:', error);
  }
}

// ── Conta corrente Flash ─────────────────────────────────────────────────────
// Lança na conta corrente os débitos de alimentação e mobilidade de um
// realizado que acabou de ser aprovado pelo RH.
//
// A planilha atual faz isso à mão, uma aba por pessoa. Os valores já existem no
// budget_actual, então o débito é derivado — não digitado.
//
// Idempotente: a restrição única (budget_actual_id, account) faz a segunda
// tentativa falhar, e o onConflictDoNothing a transforma em no-op. Aprovar o
// mesmo realizado de novo (ou devolver e reaprovar) não duplica o lançamento.
async function postFlashDebitsForActual(actualId: string, actorId?: string): Promise<void> {
  const actual = await storage.getBudgetActualById(actualId);
  if (!actual || !actual.collaboratorId) return;

  const event = actual.eventId ? await storage.getEvent(actual.eventId) : null;
  const referenceDate = event?.startDate || new Date().toISOString().slice(0, 10);
  const description = event?.name || "Evento";

  const alimentacao =
    (actual.weekdayLunch ?? 0) + (actual.weekdayDinner ?? 0) +
    (actual.weekendLunch ?? 0) + (actual.weekendDinner ?? 0);
  const mobilidade = actual.mobility ?? 0;

  const rows = [
    { account: "alimentacao" as const, value: alimentacao },
    { account: "mobilidade" as const, value: mobilidade },
  ]
    // Sem valor não há consumo — não polui o extrato com linhas de zero.
    .filter((r) => r.value > 0)
    .map((r) => ({
      collaboratorId: actual.collaboratorId as string,
      account: r.account,
      amount: -r.value, // débito
      referenceDate,
      description,
      kind: "debito_evento",
      eventId: actual.eventId ?? null,
      budgetActualId: actualId,
      createdBy: actorId ?? null,
      notes: null,
    }));

  if (rows.length === 0) return;
  await db.insert(flashLedgerEntries).values(rows as any).onConflictDoNothing();
}

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept all file types for now
    cb(null, true);
  }
});

export async function registerRoutes(app: Express): Promise<Server> {

  // ── Autorização da área financeira ───────────────────────────────────────
  // Antes da revisão, 19 das 51 rotas financeiras não checavam nada, e as de
  // aprovação aceitavam a identidade pelo corpo (actionBy, approvedBy). Na
  // prática, dois POSTs sem credencial aprovavam pagamento.
  //
  // Dois níveis, de propósito:
  //   requireFinancialRead  — só exige estar autenticado. Fecha o acesso
  //                           anônimo sem entrar no mérito de qual papel vê
  //                           cada tela, que já é tratado no cliente.
  //   requireFinancialWrite — exige admin ou financial (RH). Vale para
  //                           aprovar, rejeitar, devolver e para mexer na
  //                           tabela de valores, raiz de todo o cálculo.
  //
  // Ambos devolvem o usuário, para a rota não buscá-lo de novo.
  const requireFinancialRead = async (req: any, res: any) => {
    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ message: "Não autenticado" });
      return null;
    }
    const user = await storage.getUser(userId);
    if (!user) {
      res.status(401).json({ message: "Sessão inválida" });
      return null;
    }
    return user;
  };

  const FINANCIAL_ROLES = ['admin', 'administrator', 'administrador', 'financial'];

  const requireFinancialWrite = async (req: any, res: any) => {
    const user = await requireFinancialRead(req, res);
    if (!user) return null;
    if (!FINANCIAL_ROLES.includes(user.role)) {
      res.status(403).json({ message: "Apenas RH e administradores podem executar esta ação" });
      return null;
    }
    return user;
  };

  // ── Portal Norte — API de Gestão de Usuários ──────────────────────────────
  // Endpoints chamados server-to-server pelo Portal Norte para gerenciar usuários.
  // Autenticação: Authorization: Bearer <SSO_SECRET>
  // CORS: permite qualquer origem (chamadas server-to-server)

  const validatePortalSecret = (req: any, res: any): boolean => {
    const authHeader = req.headers["authorization"] as string | undefined;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const secret = process.env.SSO_SECRET;
    if (!secret || !token || !safeTokenEqual(token, secret)) {
      res.status(401).json({ message: "Não autorizado" });
      return false;
    }
    return true;
  };

  // ── Maratona — API de Integração (somente leitura) ────────────────────────
  // Endpoints GET consumidos server-to-server pelo sistema "Maratona".
  // Autenticação: Authorization: Bearer <MARATONA_API_TOKEN>
  // Os externalId são os IDs estáveis (uuid) das tabelas, garantindo que a
  // Maratona reconheça e atualize registros em vez de duplicar.
  const validateMaratonaToken = (req: any, res: any): boolean => {
    const authHeader = req.headers["authorization"] as string | undefined;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const secret = process.env.MARATONA_API_TOKEN;
    if (!secret) {
      console.error("[Maratona API] MARATONA_API_TOKEN não configurado");
      res.status(503).json({ message: "Integração não configurada" });
      return false;
    }
    if (!token || !safeTokenEqual(token, secret)) {
      res.status(401).json({ message: "Não autorizado" });
      return false;
    }
    return true;
  };

  // 1. GET /api/integration/employees — todos os colaboradores
  app.get("/api/integration/employees", async (req, res) => {
    if (!validateMaratonaToken(req, res)) return;
    try {
      const collaborators = await storage.getCollaborators();
      const payload = collaborators.map((c) => ({
        externalId: c.id,
        name: c.fullName,
        document: c.officialDocument ?? undefined,
        phone: c.phone ?? undefined,
        active: c.active !== false && c.status !== "inativo",
        // "freela" → Freela; "casa"/"local" → Casa (colaborador fixo/local é tratado como Casa)
        employmentType: c.type === "freela" ? "Freela" : "Casa",
      }));
      return res.json(payload);
    } catch (err) {
      console.error("[Maratona API] Erro ao listar colaboradores:", err);
      return res.status(500).json({ message: "Erro interno" });
    }
  });

  // 2. GET /api/integration/events — todos os eventos
  app.get("/api/integration/events", async (req, res) => {
    if (!validateMaratonaToken(req, res)) return;
    try {
      const events = await storage.getEvents();
      const payload = events.map((e) => ({
        externalId: e.id,
        name: e.name,
        location: e.location ?? undefined,
        startDate: e.startDate ?? undefined,
        endDate: e.endDate ?? undefined,
      }));
      return res.json(payload);
    } catch (err) {
      console.error("[Maratona API] Erro ao listar eventos:", err);
      return res.status(500).json({ message: "Erro interno" });
    }
  });

  // Normaliza qualquer valor de data (Date, string ISO, etc.) → "YYYY-MM-DD"
  const toIsoDateStr = (d: unknown): string | undefined => {
    if (!d) return undefined;
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    const s = String(d).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return undefined;
  };

  // 3. GET /api/integration/participations — participações (colaborador x evento x função)
  app.get("/api/integration/participations", async (req, res) => {
    if (!validateMaratonaToken(req, res)) return;
    try {
      const [inclusions, functions] = await Promise.all([
        storage.getTeamInclusions(),
        storage.getFunctions(),
      ]);
      const functionNameById = new Map(functions.map((f) => [f.id, f.name]));
      const payload = inclusions
        .filter((ti) => ti.collaboratorId)
        .map((ti) => {
          // Dias de trabalho específicos (não consecutivos) têm prioridade sobre o período agendado
          const workDaysIso = (ti.workDays || [])
            .map(toIsoDateStr)
            .filter((d): d is string => !!d)
            .sort();

          const diariaCount = workDaysIso.length > 0 ? workDaysIso.length : (ti.dailyRates ?? undefined);
          const diariaStartDate = workDaysIso.length > 0 ? workDaysIso[0] : toIsoDateStr(ti.scheduleStartDate);
          const diariaEndDate = workDaysIso.length > 0 ? workDaysIso[workDaysIso.length - 1] : toIsoDateStr(ti.scheduleEndDate);

          return {
            eventExternalId: ti.eventId,
            employeeExternalId: ti.collaboratorId,
            functionName: functionNameById.get(ti.functionId) ?? undefined,
            teamName: ti.area ?? undefined,
            // "confirmado" = qualquer status que não seja apenas planejado ou cancelado
            confirmed: ti.status !== "planejado" && ti.status !== "cancelado",
            diariaCount,
            diariaStartDate,
            diariaEndDate,
          };
        });
      return res.json(payload);
    } catch (err) {
      console.error("[Maratona API] Erro ao listar participações:", err);
      return res.status(500).json({ message: "Erro interno" });
    }
  });

  const normalizeRolePortal = (r?: string): string => {
    if (!r) return "production";
    const lower = r.toLowerCase().trim();
    if (lower === "admin" || lower.includes("administrador")) return "admin";
    if (lower === "financial" || lower.includes("financeiro") || lower.includes("rh")) return "financial";
    if (lower === "purchasing" || lower.includes("compras") || lower.includes("viagem")) return "purchasing";
    if (lower === "function_area" || lower.includes("função") || lower.includes("funcao") || lower.includes("function")) return "function_area";
    if (lower === "production" || lower.includes("produç") || lower.includes("logist")) return "production";
    const valid = ["admin", "production", "function_area", "purchasing", "financial"];
    if (valid.includes(lower)) return lower;
    return "production";
  };

  // GET /api/portal/users — listar todos os usuários
  app.get("/api/portal/users", async (req, res) => {
    if (!validatePortalSecret(req, res)) return;
    try {
      const allUsers = await storage.getUsers();
      const safe = allUsers.map(u => ({
        id: u.id, email: u.email, name: u.name, role: u.role,
        area: u.area, status: u.status, isActive: u.isActive, createdAt: u.createdAt,
      }));
      return res.json(safe);
    } catch (err) {
      console.error("[Portal API] Erro ao listar usuários:", err);
      return res.status(500).json({ message: "Erro interno" });
    }
  });

  // POST /api/portal/users — criar usuário
  app.post("/api/portal/users", async (req, res) => {
    if (!validatePortalSecret(req, res)) return;
    try {
      const { email, name, role, area } = req.body;
      if (!email || !name) return res.status(400).json({ message: "email e name são obrigatórios" });

      const existing = await storage.getUserByEmail(email);
      if (existing) return res.status(409).json({ message: "Usuário já existe", user: { id: existing.id, email: existing.email } });

      const tempPassword = await bcrypt.hash(Math.random().toString(36) + Date.now(), 10);

      const user = await storage.createUser({
        email: email.toLowerCase().trim(),
        name,
        password: tempPassword,
        role: normalizeRolePortal(role) as any,
        status: "approved",
        area: area || null,
        isActive: true,
      } as any);

      console.log(`[Portal API] Usuário criado: ${email}`);
      return res.status(201).json({
        id: user.id, email: user.email, name: user.name, role: user.role,
        area: user.area, status: user.status, isActive: user.isActive,
      });
    } catch (err) {
      console.error("[Portal API] Erro ao criar usuário:", err);
      return res.status(500).json({ message: "Erro interno" });
    }
  });

  // PATCH /api/portal/users/:email — atualizar usuário por email
  app.patch("/api/portal/users/:email", async (req, res) => {
    if (!validatePortalSecret(req, res)) return;
    try {
      const email = decodeURIComponent(req.params.email);
      const user = await storage.getUserByEmail(email);
      if (!user) return res.status(404).json({ message: "Usuário não encontrado" });

      const { name, role, area, isActive, status } = req.body;
      const updates: Record<string, any> = {};
      if (name !== undefined) updates.name = name;
      if (role !== undefined) updates.role = normalizeRolePortal(role);
      if (area !== undefined) updates.area = area;
      if (isActive !== undefined) updates.isActive = Boolean(isActive);
      if (status !== undefined) updates.status = status;

      const updated = await storage.updateUser(user.id, updates);
      console.log(`[Portal API] Usuário atualizado: ${email}`);
      return res.json({
        id: updated!.id, email: updated!.email, name: updated!.name,
        role: updated!.role, area: updated!.area, status: updated!.status, isActive: updated!.isActive,
      });
    } catch (err) {
      console.error("[Portal API] Erro ao atualizar usuário:", err);
      return res.status(500).json({ message: "Erro interno" });
    }
  });

  // DELETE /api/portal/users/:email — desativar usuário por email
  app.delete("/api/portal/users/:email", async (req, res) => {
    if (!validatePortalSecret(req, res)) return;
    try {
      const email = decodeURIComponent(req.params.email);
      const user = await storage.getUserByEmail(email);
      if (!user) return res.status(404).json({ message: "Usuário não encontrado" });

      await storage.updateUser(user.id, { isActive: false, status: "rejected" } as any);
      console.log(`[Portal API] Usuário desativado: ${email}`);
      return res.json({ message: "Usuário desativado com sucesso" });
    } catch (err) {
      console.error("[Portal API] Erro ao desativar usuário:", err);
      return res.status(500).json({ message: "Erro interno" });
    }
  });

  // ── SSO Endpoint ──────────────────────────────────────────────────────────
  // O portal externo gera um JWT curto (ex: 5 min) e redireciona para:
  //   https://logistica.app/?portal_sso=<JWT>&portal_return=<URL>
  // O cliente detecta o parâmetro e chama GET /api/auth/sso?token=<JWT>.
  // JWT do portal Norte: HS256, issuer="norte-portal", expira em 10min.
  // Payload: { email, name, role, level, app }
  // Segredo compartilhado: variável de ambiente SSO_SECRET.
  app.get("/api/auth/sso", async (req, res) => {
    try {
      const { token } = req.query;
      if (!token || typeof token !== "string") {
        return res.status(400).json({ message: "Token SSO ausente" });
      }

      const { jwtVerify } = await import("jose");
      const rawSecret = process.env.SSO_SECRET || process.env.SESSION_SECRET || "dev-session-secret-change-in-production";
      const secretKey = new TextEncoder().encode(rawSecret);

      let payload: Record<string, unknown>;
      try {
        // Verifica assinatura e issuer "norte-portal"
        const { payload: p } = await jwtVerify(token, secretKey, { issuer: "norte-portal" });
        payload = p as Record<string, unknown>;
      } catch (err) {
        // Fallback: tentar sem issuer (compatibilidade com tokens legados)
        try {
          const { payload: p } = await jwtVerify(token, secretKey);
          payload = p as Record<string, unknown>;
        } catch {
          console.error("[SSO] Token inválido:", err);
          return res.status(401).json({ message: "Token SSO inválido ou expirado" });
        }
      }

      const email = payload.email as string | undefined;
      if (!email) {
        return res.status(400).json({ message: "Token SSO não contém email" });
      }

      // Campos enriquecidos do novo formato do portal Norte
      const tokenName    = payload.name  as string | undefined;
      const tokenRoleRaw = payload.role  as string | undefined;

      // Mapear role do portal Norte (pode vir em português) para os roles internos
      const normalizePortalRole = (r?: string): string => {
        if (!r) return "production";
        const lower = r.toLowerCase().trim();
        if (lower === "admin" || lower.includes("administrador") || lower.includes("administrator")) return "admin";
        if (lower === "financial" || lower.includes("financeiro") || lower.includes("rh") || lower.includes("recursos humanos")) return "financial";
        if (lower === "purchasing" || lower.includes("compras") || lower.includes("viagem")) return "purchasing";
        if (lower === "function_area" || lower.includes("função") || lower.includes("funcao") || lower.includes("function")) return "function_area";
        if (lower === "production" || lower.includes("produç") || lower.includes("logist")) return "production";
        const valid = ["admin", "production", "function_area", "purchasing", "financial"];
        if (valid.includes(lower)) return lower;
        return "production";
      };
      const tokenRole = normalizePortalRole(tokenRoleRaw);

      let user = await storage.getUserByEmail(email);

      if (!user) {
        // Usuário não existe ainda — auto-registrar com dados do token
        const tempPassword = await bcrypt.hash(Math.random().toString(36), 10);
        user = await storage.createUser({
          email,
          name: tokenName || email.split("@")[0],
          password: tempPassword,
          role: tokenRole as any,
          status: "approved",
          area: null,
          isActive: true,
        } as any);
        console.log(`[SSO] Usuário auto-registrado via Norte Portal: ${email}`);
      } else if (user.status !== "approved") {
        // Usuário existe mas não está aprovado — aprovar via SSO
        user = await storage.updateUser(user.id, { status: "approved" }) || user;
      }

      // Sincronizar nome do token.
      // Role: preserva o role do banco SE for válido. Corrige roles inválidos (ex: vindos em português do portal).
      const validRoles = ["admin", "production", "function_area", "purchasing", "financial"];
      const updates: Record<string, unknown> = {};
      if (tokenName && tokenName !== user.name) updates.name = tokenName;
      if (!validRoles.includes(user.role)) {
        updates.role = tokenRole;
        console.log(`[SSO] Corrigindo role inválido "${user.role}" → "${tokenRole}" para ${email}`);
      }
      if (Object.keys(updates).length > 0) {
        user = await storage.updateUser(user.id, updates as any) || user;
      }

      // Criar sessão (marcada como autenticada via SSO)
      req.session.userId = user.id;
      req.session.user = { ...user, password: undefined, resetToken: undefined, resetTokenExpiry: undefined };
      (req.session as any).ssoAuthenticated = true;

      await new Promise<void>((resolve, reject) =>
        req.session.save((err) => (err ? reject(err) : resolve()))
      );

      const safeUser = { ...user, password: undefined, resetToken: undefined, resetTokenExpiry: undefined };
      return res.json({ user: safeUser });
    } catch (error) {
      console.error("[SSO] Erro:", error);
      return res.status(500).json({ message: "Erro interno no SSO" });
    }
  });

  // Encerra a sessão do servidor
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {});
    res.json({ success: true });
  });

  // Retorna o usuário da sessão ativa (usado pelo React ao inicializar)
  app.get("/api/auth/me", async (req, res) => {
    try {
      // Nunca deixar cache — sempre buscar dados frescos do banco
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");

      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Não autenticado" });

      // Exige autenticação via SSO — sessões de login direto (sem flag) são rejeitadas
      // Em desenvolvimento, o check é ignorado para facilitar testes locais
      const isDev = process.env.NODE_ENV !== 'production';
      if (!isDev && !(req.session as any).ssoAuthenticated) {
        req.session.destroy(() => {});
        return res.status(401).json({ message: "Não autenticado", requirePortal: true });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        req.session.destroy(() => {});
        return res.status(401).json({ message: "Sessão inválida" });
      }
      const safeUser = { ...user, password: undefined, resetToken: undefined, resetTokenExpiry: undefined };
      const portalReturnUrl = (req.session as any).portalReturnUrl || null;
      return res.json({ user: safeUser, portalReturnUrl });
    } catch (error) {
      return res.status(500).json({ message: "Erro interno" });
    }
  });

  // Authentication routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ message: "E-mail e senha são obrigatórios" });
      }
      
      const user = await storage.getUserByEmail(email);
      
      if (!user || user.status !== 'approved') {
        return res.status(401).json({ message: "Credenciais inválidas ou conta não aprovada" });
      }
      
      // Compare password with hash
      const isValidPassword = await bcrypt.compare(password, user.password);
      
      if (!isValidPassword) {
        return res.status(401).json({ message: "Credenciais inválidas" });
      }
      
      // Store user in session
      req.session.userId = user.id;
      req.session.user = { ...user, password: undefined, resetToken: undefined, resetTokenExpiry: undefined };
      
      if (user.mustChangePassword) {
        return res.json({ 
          mustChangePassword: true, 
          user: { ...user, password: undefined, resetToken: undefined, resetTokenExpiry: undefined } 
        });
      }
      
      // Log successful login
      try {
        await createAuditLog(
          'login',
          'user',
          user.id,
          user,
          user.id,
          user.name,
          undefined,
          req
        );
      } catch (auditError) {
        console.error('[Login] Audit log failed:', auditError);
        // Don't fail login if audit log fails
      }
      
      res.json({ user: { ...user, password: undefined, resetToken: undefined, resetTokenExpiry: undefined } });
    } catch (error: any) {
      console.error('[Login] Error:', error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // User registration route
  app.post("/api/auth/register", async (req, res) => {
    try {
      const userData = publicUserRegistrationSchema.parse(req.body);
      
      // Check if email already exists
      const existingByEmail = await storage.getUserByEmail(userData.email);
      if (existingByEmail) {
        return res.status(400).json({ message: "E-mail já cadastrado" });
      }

      // Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(userData.password, saltRounds);
      
      // Public registration should require admin approval
      const userWithHashedPassword = {
        ...userData,
        password: hashedPassword,
        status: "pending", // Public registration requires admin approval
      };
      
      const user = await storage.createUser(userWithHashedPassword);
      
      // Log user registration
      await createAuditLog(
        'create',
        'user',
        user.id,
        user,
        undefined,
        'Sistema', // Public registration is system-initiated
        undefined,
        req
      );
      
      res.json({ user: { ...user, password: undefined, resetToken: undefined, resetTokenExpiry: undefined } });
    } catch (error) {
      res.status(400).json({ message: "Erro ao criar usuário" });
    }
  });
  
  // Forgot password route
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "E-mail é obrigatório" });
      }
      
      const user = await storage.getUserByEmail(email);
      if (!user) {
        // Don't reveal if email exists for security
        return res.json({ message: "Se o e-mail existir, você receberá instruções de redefinição" });
      }
      
      // Generate reset token
      const resetToken = randomBytes(32).toString('hex');
      const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now
      
      await storage.updateUser(user.id, {
        resetToken,
        resetTokenExpiry,
      });
      
      // O token NUNCA pode voltar na resposta HTTP — quem chama esta rota é
      // anônimo, então devolvê-lo permite takeover de qualquer conta.
      // O envio por e-mail ainda não está implementado; até lá o reset é feito
      // por um admin via POST /api/users/:id/reset-password.
      console.log(`[ForgotPassword] Token gerado para o usuário ${user.id}`);

      res.json({ message: "Se o e-mail existir, você receberá instruções de redefinição" });
    } catch (error) {
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });
  
  // Reset password route
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      
      if (!token || !newPassword) {
        return res.status(400).json({ message: "Token e nova senha são obrigatórios" });
      }
      
      const user = await storage.getUserByResetToken(token);
      if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
        return res.status(400).json({ message: "Token inválido ou expirado" });
      }
      
      // Hash new password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
      
      const updatedUser = await storage.updateUser(user.id, {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null,
      });
      
      // Log password reset
      await createAuditLog(
        'reset_password',
        'user',
        user.id,
        updatedUser,
        user.id,
        user.name,
        user,
        req
      );
      
      res.json({ message: "Senha redefinida com sucesso" });
    } catch (error) {
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // User management routes (for admin)
  app.post("/api/users", async (req, res) => {
    try {
      // Check authentication and authorization
      const userId = req.session.userId || req.body?._userId;
      if (!userId) {
        return res.status(401).json({ message: "Usuário não autenticado" });
      }

      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ message: "Usuário não encontrado" });
      }

      // Admins, financial (RH) and purchasing (Compras) can create users
      const isAdmin = currentUser.role === 'administrador' || currentUser.role === 'admin' || currentUser.role === 'administrator';
      const canManageUsers = isAdmin || currentUser.role === 'financial' || currentUser.role === 'purchasing';
      if (!canManageUsers) {
        return res.status(403).json({ message: "Sem permissão para criar usuários." });
      }

      // Senha é opcional nessa rota — login é via Microsoft/SSO
      const adminCreateSchema = insertUserSchema.extend({ password: z.string().optional() });
      const userData = adminCreateSchema.parse(req.body);

      // Only true admins can create admin users
      if (userData.role === 'admin' && !isAdmin) {
        return res.status(403).json({ message: "Apenas administradores podem criar outro Administrador." });
      }
      
      // Check if email already exists
      const existingByEmail = await storage.getUserByEmail(userData.email);
      if (existingByEmail) {
        return res.status(400).json({ message: "E-mail já cadastrado" });
      }

      // Hash password — gera uma senha aleatória se não for fornecida (login via Microsoft/SSO)
      const saltRounds = 10;
      const rawPassword = userData.password || (Math.random().toString(36) + Date.now().toString(36));
      const hashedPassword = await bcrypt.hash(rawPassword, saltRounds);
      
      // Internal user registration should create approved users directly
      const userWithHashedPassword = {
        ...userData,
        password: hashedPassword,
        status: "approved", // Internal registration doesn't require admin approval
      };
      
      const user = await storage.createUser(userWithHashedPassword);
      
      // Log user creation by admin
      await createAuditLog(
        'create',
        'user',
        user.id,
        user,
        currentUser.id,
        currentUser.name,
        undefined,
        req
      );
      
      res.json({ ...user, password: undefined, resetToken: undefined, resetTokenExpiry: undefined });
    } catch (error) {
      res.status(400).json({ message: "Erro ao criar usuário" });
    }
  });

  app.get("/api/users", async (req, res) => {
    try {
      // Check authentication and authorization
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ message: "Usuário não autenticado" });
      }

      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ message: "Usuário não encontrado" });
      }

      // Admins, financial (RH), purchasing (Compras) and production (Logística) can list users
      const isAdmin = currentUser.role === 'administrador' || currentUser.role === 'admin' || currentUser.role === 'administrator';
      const canManageUsers = isAdmin || currentUser.role === 'financial' || currentUser.role === 'purchasing' || currentUser.role === 'production';
      if (!canManageUsers) {
        return res.status(403).json({ message: "Sem permissão para listar usuários." });
      }

      const users = await storage.getUsers();
      const safeUsers = users.map(user => ({ ...user, password: undefined, resetToken: undefined, resetTokenExpiry: undefined }));
      res.json(safeUsers);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar usuários" });
    }
  });

  // Update user profile route
  app.patch("/api/users/:id", async (req, res) => {
    try {
      // Check authentication
      const currentUserId = req.session.userId || req.body?._userId;
      if (!currentUserId) {
        return res.status(401).json({ message: "Usuário não autenticado" });
      }

      const currentUser = await storage.getUser(currentUserId);
      if (!currentUser) {
        return res.status(401).json({ message: "Usuário não encontrado" });
      }

      const { id } = req.params;
      const updateData = req.body;
      
      // Check if user exists
      const targetUser = await storage.getUser(id);
      if (!targetUser) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }

      // Authorization: admins, financial (RH) and purchasing (Compras) can edit other users
      const isAdmin = currentUser.role === 'administrador' || currentUser.role === 'admin' || currentUser.role === 'administrator';
      const canManageUsers = isAdmin || currentUser.role === 'financial' || currentUser.role === 'purchasing';
      const isSelfUpdate = currentUserId === id;

      // Only user managers can edit other users' profiles
      if (!canManageUsers && !isSelfUpdate) {
        return res.status(403).json({ message: "Sem permissão para editar este usuário" });
      }

      // Sensitive fields: only managers can change role/status
      const sensitiveFields = ['role', 'status'];
      const hasSensitiveChanges = sensitiveFields.some(field => updateData[field] !== undefined);
      
      if (hasSensitiveChanges && !canManageUsers) {
        return res.status(403).json({ message: "Sem permissão para alterar role ou status. Apenas administradores podem modificar esses campos." });
      }
      
      // Handle password change separately with proper validation
      let hashedNewPassword: string | undefined = undefined;
      if (updateData.newPassword) {
        if (!updateData.currentPassword) {
          return res.status(400).json({ message: "Senha atual é obrigatória para alterar senha" });
        }
        
        const isValidPassword = await bcrypt.compare(updateData.currentPassword, targetUser.password);
        if (!isValidPassword) {
          return res.status(400).json({ message: "Senha atual incorreta" });
        }
        
        // Hash new password
        const saltRounds = 10;
        hashedNewPassword = await bcrypt.hash(updateData.newPassword, saltRounds);
      }
      
      // Remove password-related fields and sensitive fields that shouldn't be stored directly
      const { currentPassword, newPassword, confirmPassword, password, resetToken, resetTokenExpiry, ...profileData } = updateData;
      
      // Define allowed fields based on user type
      const allowedFieldsForSelf = ['name', 'email'];
      const allowedFieldsForAdmin = ['name', 'email', 'role', 'status', 'area'];
      
      const allowedFields = isAdmin ? allowedFieldsForAdmin : allowedFieldsForSelf;
      
      // Filter profileData to only include allowed fields
      const filteredData: any = {};
      for (const field of allowedFields) {
        if (profileData[field] !== undefined) {
          filteredData[field] = profileData[field];
        }
      }
      
      // Add hashed password if there was a password change
      if (hashedNewPassword) {
        filteredData.password = hashedNewPassword;
      }
      
      // Additional validation: only user managers can change role/status
      if (!canManageUsers && (filteredData.role !== undefined || filteredData.status !== undefined)) {
        return res.status(403).json({ message: "Sem permissão para alterar role ou status." });
      }

      // Only true admins can assign the 'admin' role
      if (filteredData.role === 'admin' && !isAdmin) {
        return res.status(403).json({ message: "Apenas administradores podem atribuir o papel de Administrador." });
      }
      
      if (filteredData.email) {
        const existingByEmail = await storage.getUserByEmail(filteredData.email);
        if (existingByEmail && existingByEmail.id !== id) {
          return res.status(400).json({ message: "E-mail já está em uso" });
        }
      }
      
      const updatedUser = await storage.updateUser(id, filteredData);
      
      // Log user update
      await createAuditLog(
        'update',
        'user',
        id,
        updatedUser,
        currentUser.id,
        currentUser.name,
        targetUser,
        req
      );
      
      res.json({ ...updatedUser, password: undefined, resetToken: undefined, resetTokenExpiry: undefined });
    } catch (error) {
      res.status(500).json({ message: "Erro ao atualizar usuário" });
    }
  });

  // User approval route (admin only)
  app.patch("/api/users/:id/approval", async (req, res) => {
    try {
      // Check authentication and authorization
      const userId = req.session.userId || req.body?._userId;
      if (!userId) {
        return res.status(401).json({ message: "Usuário não autenticado" });
      }

      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ message: "Usuário não encontrado" });
      }

      // Admins, financial (RH), purchasing (Compras) and production (Logística) can approve/reject users
      const isAdmin = currentUser.role === 'administrador' || currentUser.role === 'admin' || currentUser.role === 'administrator';
      const canManageUsers = isAdmin || currentUser.role === 'financial' || currentUser.role === 'purchasing' || currentUser.role === 'production';
      if (!canManageUsers) {
        return res.status(403).json({ message: "Sem permissão para aprovar usuários." });
      }

      const { id } = req.params;
      const { status, role } = req.body;
      
      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ message: "Status inválido" });
      }
      
      const targetUser = await storage.getUser(id);
      const updatedUser = await storage.approveUser(id, status, role);
      if (!updatedUser) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }
      
      // Log user approval/rejection
      await createAuditLog(
        status === 'approved' ? 'approve' : 'reject',
        'user',
        id,
        updatedUser,
        currentUser.id,
        currentUser.name,
        targetUser,
        req
      );
      
      res.json({ ...updatedUser, password: undefined, resetToken: undefined, resetTokenExpiry: undefined });
    } catch (error) {
      res.status(500).json({ message: "Erro ao aprovar usuário" });
    }
  });

  // Admin: Toggle user active status (Reactivação)
  app.patch("/api/users/:id/toggle-active", async (req, res) => {
    try {
      const adminId = req.session.userId || req.body?._userId;
      if (!adminId) return res.status(401).json({ message: "Não autenticado" });
      
      const admin = await storage.getUser(adminId);
      const isAdmin = admin && (admin.role === 'administrador' || admin.role === 'admin' || admin.role === 'administrator');
      const isPurchasing = admin && admin.role === 'purchasing';
      const isProduction = admin && admin.role === 'production';
      if (!isAdmin && !isPurchasing && !isProduction) return res.status(403).json({ message: "Acesso negado" });

      const userId = req.params.id;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "Usuário não encontrado" });

      const newIsActive = !user.isActive;
      const updatedUser = await storage.updateUser(userId, { isActive: newIsActive });
      
      // Se o usuário foi desativado, remove-o dos responsáveis de todas as funções
      if (!newIsActive) {
        await storage.removeUserFromAllFunctions(userId);
      }
      
      await createAuditLog(
        'update',
        'user',
        userId,
        updatedUser,
        adminId,
        admin.name,
        user,
        req
      );

      res.json(updatedUser);
    } catch (error) {
      res.status(500).json({ message: "Erro ao alterar status do usuário" });
    }
  });

  // Admin: Toggle can_approve_cenotecnica permission
  app.patch("/api/users/:id/toggle-cenotecnica-approval", async (req, res) => {
    try {
      const adminId = req.session.userId;
      if (!adminId) return res.status(401).json({ message: "Não autenticado" });

      const admin = await storage.getUser(adminId);
      const isAdmin = admin && ['admin', 'administrator', 'administrador'].includes(admin.role ?? '');
      if (!isAdmin) return res.status(403).json({ message: "Apenas administradores podem alterar esta permissão" });

      const { id } = req.params;
      const targetUser = await storage.getUser(id);
      if (!targetUser) return res.status(404).json({ message: "Usuário não encontrado" });

      const newValue = !targetUser.canApproveCenotecnica;
      const updated = await storage.updateUser(id, { canApproveCenotecnica: newValue });
      res.json({ ...updated, password: undefined, resetToken: undefined, resetTokenExpiry: undefined });
    } catch (error) {
      res.status(500).json({ message: "Erro ao atualizar permissão" });
    }
  });

  // Admin: Reset user password
  app.post("/api/users/:id/reset-password", async (req, res) => {
    try {
      const adminId = req.session.userId || req.body?._userId;
      if (!adminId) return res.status(401).json({ message: "Não autenticado" });
      
      const admin = await storage.getUser(adminId);
      const isAdmin = admin && (admin.role === 'administrador' || admin.role === 'admin' || admin.role === 'administrator');
      const isPurchasingAdmin = admin && admin.role === 'purchasing';
      const isProductionAdmin = admin && admin.role === 'production';
      if (!isAdmin && !isPurchasingAdmin && !isProductionAdmin) return res.status(403).json({ message: "Acesso negado" });

      const userId = req.params.id;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "Usuário não encontrado" });

      const { newPassword } = req.body;
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ message: "Nova senha deve ter pelo menos 6 caracteres" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(userId, { 
        password: hashedPassword,
        mustChangePassword: true 
      });
      
      await createAuditLog(
        'update',
        'user',
        userId,
        { ...user, password: '[CHANGED]' },
        adminId,
        admin.name,
        user,
        req
      );

      res.json({ message: "Senha resetada com sucesso" });
    } catch (error) {
      res.status(500).json({ message: "Erro ao resetar senha" });
    }
  });

  // Events routes
  app.get("/api/events", async (req, res) => {
    try {
      const includeDeleted = req.query.includeDeleted === "true";
      const events = await storage.getEvents(includeDeleted);
      res.json(events);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar eventos" });
    }
  });

  // Get events that have team inclusions (for template loading)
  app.get("/api/events-with-inclusions", async (req, res) => {
    try {
      const eventsWithInclusions = await storage.getEventsWithInclusions();
      res.json(eventsWithInclusions);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar eventos com escalações" });
    }
  });

  app.post("/api/events", async (req, res) => {
    try {
      const userId = req.session.userId || 'system';
      
      let currentUser = null;
      if (userId !== 'system') {
        currentUser = await storage.getUser(userId);
        if (!currentUser) {
          return res.status(401).json({ message: "Usuário não encontrado" });
        }
      }

      const eventData = insertEventSchema.parse(req.body);
      const event = await storage.createEvent(eventData);
      
      // Log event creation
      await createAuditLog(
        'create',
        'event',
        event.id,
        event,
        userId,
        currentUser?.name || 'Sistema',
        undefined,
        req
      );
      res.json(event);
    } catch (error) {
      res.status(400).json({ message: "Dados inválidos" });
    }
  });

  // Dedicated endpoint for updating payment company (accessible to admin + financial roles)
  app.patch("/api/events/:id/payment-company", async (req, res) => {
    try {
      const actorId = req.session?.userId || req.body?._userId;
      const actor = actorId ? await storage.getUser(actorId) : null;
      if (!actor || !['admin', 'financial'].includes(actor.role)) {
        return res.status(403).json({ message: "Sem permissão para configurar empresa pagadora" });
      }
      const event = await storage.getEvent(req.params.id);
      if (!event) return res.status(404).json({ message: "Evento não encontrado" });
      const { paymentCompanyName, paymentCompanyCnpj } = req.body;
      if (!paymentCompanyName?.trim() || !paymentCompanyCnpj?.trim()) {
        return res.status(400).json({ message: "Nome e CNPJ são obrigatórios" });
      }
      const updated = await storage.updateEvent(req.params.id, { paymentCompanyName, paymentCompanyCnpj });
      res.json(updated);
    } catch (error) {
      console.error("Error updating payment company:", error);
      res.status(500).json({ message: "Erro ao atualizar empresa pagadora" });
    }
  });

  app.put("/api/events/:id", async (req, res) => {
    try {
      const userId = req.session.userId || 'system';
      
      let currentUser = null;
      if (userId !== 'system') {
        currentUser = await storage.getUser(userId);
        if (!currentUser) {
          return res.status(401).json({ message: "Usuário não encontrado" });
        }

        // Only admins and purchasing can edit events
        const canEditEvent = ['admin', 'administrador', 'administrator', 'purchasing'].includes(currentUser.role);
        if (!canEditEvent) {
          return res.status(403).json({ message: "Sem permissão para editar eventos" });
        }
      }

      const eventId = req.params.id;
      const oldEvent = await storage.getEvent(eventId);
      if (!oldEvent) {
        return res.status(404).json({ message: "Evento não encontrado" });
      }

      // Allow partial updates including status field
      const eventData = updateEventSchema.parse(req.body);
      const updatedEvent = await storage.updateEvent(eventId, eventData);
      
      // Log event update
      await createAuditLog(
        'update',
        'event',
        updatedEvent.id,
        updatedEvent,
        userId,
        currentUser?.name || 'Sistema',
        oldEvent,
        req
      );
      
      res.json(updatedEvent);
    } catch (error) {
      res.status(400).json({ message: "Dados inválidos" });
    }
  });

  app.delete("/api/events/:id", async (req, res) => {
    try {
      const userId = req.session.userId || 'system';
      
      let currentUser = null;
      if (userId !== 'system') {
        currentUser = await storage.getUser(userId);
        if (!currentUser) {
          return res.status(401).json({ message: "Usuário não encontrado" });
        }

        // Only admins and purchasing can delete events
        const canDeleteEvent = ['admin', 'administrador', 'administrator', 'purchasing'].includes(currentUser.role);
        if (!canDeleteEvent) {
          return res.status(403).json({ message: "Sem permissão para excluir eventos" });
        }
      }

      const eventId = req.params.id;
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ message: "Evento não encontrado" });
      }

      await storage.deleteEvent(eventId);
      
      // Log event deletion
      await createAuditLog(
        'delete',
        'event',
        eventId,
        null,
        userId,
        currentUser?.name || 'Sistema',
        event,
        req
      );
      
      res.json({ message: "Evento excluído com sucesso" });
    } catch (error) {
      res.status(500).json({ message: "Erro ao excluir evento" });
    }
  });

  // Functions routes
  app.get("/api/functions", async (req, res) => {
    try {
      const functions = await storage.getFunctions();
      res.json(functions);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar funções" });
    }
  });

  // Retorna quais tipos de colaborador (casa/freela) cada função possui em escalações
  app.get("/api/function-collaborator-types", async (req, res) => {
    try {
      const rows = await db.execute(drizzleSql`
        SELECT ti.function_id, array_agg(DISTINCT c.type) as types
        FROM team_inclusions ti
        JOIN collaborators c ON c.id = ti.collaborator_id
        WHERE c.type IS NOT NULL
        GROUP BY ti.function_id
      `);
      const result: Record<string, string[]> = {};
      for (const row of rows.rows as any[]) {
        result[row.function_id] = row.types ?? [];
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar tipos por função" });
    }
  });

  // Get functions for current user
  app.get("/api/functions/my-functions", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ message: "Usuário não autenticado" });
      }
      
      const functions = await storage.getFunctionsByUser(userId);
      res.json(functions);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar funções do usuário" });
    }
  });

  app.post("/api/functions", async (req, res) => {
    try {
      const functionData = insertFunctionSchema.parse(req.body);
      const func = await storage.createFunction(functionData);
      res.json(func);
    } catch (error) {
      res.status(400).json({ message: "Dados inválidos" });
    }
  });

  app.patch("/api/functions/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const functionData = insertFunctionSchema.partial().parse(req.body);
      const func = await storage.updateFunction(id, functionData);
      res.json(func);
    } catch (error) {
      res.status(400).json({ message: "Erro ao atualizar função" });
    }
  });

  app.delete("/api/functions/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteFunction(id);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ message: "Erro ao deletar função" });
    }
  });

  // Function Users routes
  app.get("/api/functions/:id/users", async (req, res) => {
    try {
      const { id } = req.params;
      const functionUsers = await storage.getFunctionUsers(id);
      res.json(functionUsers);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar usuários da função" });
    }
  });

  app.post("/api/functions/:id/users", async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session.userId;
      
      if (!userId) {
        return res.status(401).json({ message: "Usuário não autenticado" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "Usuário não encontrado" });
      }

      // Authorization check: Admin, purchasing, production or function manager can add users
      const isAdmin = user.role === 'administrador' || user.role === 'admin' || user.role === 'administrator';
      const isPurchasing = user.role === 'purchasing';
      const isProduction = user.role === 'production';
      const isFunctionManager = await storage.isUserFunctionManager(id, userId);
      
      if (!isAdmin && !isPurchasing && !isProduction && !isFunctionManager) {
        return res.status(403).json({ message: "Sem permissão para adicionar usuários a esta função" });
      }

      const { userId: targetUserId } = req.body;
      
      const functionUser = await storage.addUserToFunction({
        functionId: id,
        userId: targetUserId
      });
      res.json(functionUser);
    } catch (error) {
      res.status(400).json({ message: "Erro ao adicionar usuário à função" });
    }
  });

  app.delete("/api/functions/:functionId/users/:userId", async (req, res) => {
    try {
      const { functionId, userId: targetUserId } = req.params;
      const userId = req.session.userId;
      
      if (!userId) {
        return res.status(401).json({ message: "Usuário não autenticado" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "Usuário não encontrado" });
      }

      // Authorization check: Admin, purchasing, production or function manager can remove users
      const isAdmin = user.role === 'administrador' || user.role === 'admin' || user.role === 'administrator';
      const isPurchasing = user.role === 'purchasing';
      const isProduction = user.role === 'production';
      const isFunctionManager = await storage.isUserFunctionManager(functionId, userId);
      
      if (!isAdmin && !isPurchasing && !isProduction && !isFunctionManager) {
        return res.status(403).json({ message: "Sem permissão para remover usuários desta função" });
      }

      await storage.removeUserFromFunction(functionId, targetUserId);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ message: "Erro ao remover usuário da função" });
    }
  });

  // Function Managers routes
  // Retorna todos os function managers em uma única query (evita N+1 no frontend)
  app.get("/api/function-managers/all", async (req, res) => {
    try {
      const all = await db.select().from(functionManagersTable);
      res.json(all);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar responsáveis" });
    }
  });

  app.get("/api/functions/:id/managers", async (req, res) => {
    try {
      const { id } = req.params;
      const functionManagers = await storage.getFunctionManagers(id);
      res.json(functionManagers);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar responsáveis da função" });
    }
  });

  app.post("/api/functions/:id/managers", async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session.userId;
      
      if (!userId) {
        return res.status(401).json({ message: "Usuário não autenticado" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "Usuário não encontrado" });
      }

      // Authorization check: Admins, purchasing and production can add managers
      const isAdmin = user.role === 'administrador' || user.role === 'admin' || user.role === 'administrator';
      const isPurchasing = user.role === 'purchasing';
      const isProduction = user.role === 'production';
      
      if (!isAdmin && !isPurchasing && !isProduction) {
        return res.status(403).json({ message: "Sem permissão para adicionar responsáveis às funções" });
      }

      const { userId: targetUserId } = req.body;
      
      const functionManager = await storage.addManagerToFunction({
        functionId: id,
        userId: targetUserId
      });
      res.json(functionManager);
    } catch (error) {
      res.status(400).json({ message: "Erro ao adicionar responsável à função" });
    }
  });

  app.delete("/api/functions/:functionId/managers/:userId", async (req, res) => {
    try {
      const { functionId, userId: targetUserId } = req.params;
      const userId = req.session.userId;
      
      if (!userId) {
        return res.status(401).json({ message: "Usuário não autenticado" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "Usuário não encontrado" });
      }

      // Authorization check: Admins, purchasing and production can remove managers
      const isAdmin = user.role === 'administrador' || user.role === 'admin' || user.role === 'administrator';
      const isPurchasing = user.role === 'purchasing';
      const isProduction = user.role === 'production';
      
      if (!isAdmin && !isPurchasing && !isProduction) {
        return res.status(403).json({ message: "Sem permissão para remover responsáveis das funções" });
      }

      await storage.removeManagerFromFunction(functionId, targetUserId);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ message: "Erro ao remover responsável da função" });
    }
  });

  // Collaborators routes
  app.get("/api/collaborators", async (req, res) => {
    try {
      const collaborators = await storage.getCollaborators();

      // Resolve os nomes de quem cadastrou/editou aqui, e não no cliente:
      // /api/users é restrito a alguns papéis, então uma tela aberta a
      // "Área de Função" não conseguiria traduzir o UUID e mostraria o id cru.
      // Uma consulta a mais no total (a tabela de usuários é pequena), não uma
      // por colaborador.
      const needsAuthor = collaborators.some(c => (c as any).createdBy || (c as any).updatedBy);
      if (!needsAuthor) return res.json(collaborators);

      const users = await storage.getUsers();
      const nameById = new Map(users.map(u => [u.id, u.name]));
      const enriched = collaborators.map(c => ({
        ...c,
        createdByName: (c as any).createdBy ? nameById.get((c as any).createdBy) ?? null : null,
        updatedByName: (c as any).updatedBy ? nameById.get((c as any).updatedBy) ?? null : null,
      }));
      res.json(enriched);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar colaboradores" });
    }
  });

  app.post("/api/collaborators", async (req, res) => {
    try {
      // Extrair informações do usuário (não fazem parte do schema)
      const { _userId, _userRole, ...bodyData } = req.body;

      // Validar dados do colaborador
      // (não logar o corpo: contém CPF/telefone do colaborador)
      let collaboratorData: any = insertCollaboratorSchema.parse(bodyData);

      // Autoria do cadastro. Prefere a sessão; cai para o _userId do corpo
      // apenas porque esta rota ainda não exige autenticação — quando o
      // requireAuth global entrar, o fallback deve sair junto.
      const authorId = req.session?.userId || _userId || null;
      collaboratorData = { ...collaboratorData, createdBy: authorId, updatedBy: authorId };

      // Auto-aprovar colaboradores criados por usuários "Área de Função"
      if (_userRole === 'function_area') {
        console.log("Auto-aprovando colaborador criado por usuário Área de Função");
        collaboratorData = {
          ...collaboratorData,
          status: 'aprovado',
          approvedAt: new Date(),
          approvedBy: _userId
        };
      }
      
      console.log("Dados finais do colaborador:", JSON.stringify(collaboratorData, null, 2));
      
      // Verificar se já existe um colaborador com o mesmo documento oficial
      const existingCollaborators = await storage.getCollaborators();
      const duplicateDoc = existingCollaborators.find(
        c => c.officialDocument === collaboratorData.officialDocument
      );
      
      if (duplicateDoc) {
        return res.status(400).json({ 
          message: `Já existe um colaborador cadastrado com o documento ${collaboratorData.officialDocument}` 
        });
      }
      
      const collaborator = await storage.createCollaborator(collaboratorData);
      res.json(collaborator);
    } catch (error) {
      console.error("Erro completo ao criar colaborador:", error);
      if (error instanceof Error) {
        console.error("Mensagem de erro:", error.message);
      }
      res.status(400).json({ message: "Dados inválidos. Verifique os campos obrigatórios." });
    }
  });

  app.post("/api/collaborators/bulk", async (req, res) => {
    try {
      const { collaborators, _userId, _userRole } = req.body;
      
      if (!Array.isArray(collaborators) || collaborators.length === 0) {
        return res.status(400).json({ message: "Lista de colaboradores é obrigatória" });
      }

      const result = {
        totalProcessed: collaborators.length,
        successful: 0,
        failed: 0,
        errors: [] as Array<{ row: number; name: string; error: string }>
      };

      // Set para controlar documentos já processados no lote atual
      const processedDocuments = new Set<string>();

      for (let i = 0; i < collaborators.length; i++) {
        const collaboratorData = collaborators[i];
        
        // Verificar se o documento já foi processado no lote atual
        const docToCheck = collaboratorData.officialDocument || collaboratorData.document;
        if (processedDocuments.has(docToCheck)) {
          // Ignorar silenciosamente os duplicados no mesmo CSV
          continue;
        }
        
        // Adicionar documento ao conjunto de processados
        processedDocuments.add(docToCheck);
        
        try {
          // Validate each collaborator - tratar campos vazios
          const birthDateValue = collaboratorData.birthDate 
            ? collaboratorData.birthDate // já está em formato YYYY-MM-DD
            : '1900-01-01'; // data padrão para campos vazios
          
          // Auto-aprovar apenas se for usuário "Área de Função"
          const autoApprove = _userRole === 'function_area';
          
          const validatedData = insertCollaboratorSchema.parse({
            fullName: collaboratorData.fullName || 'Sem nome',
            officialDocument: collaboratorData.officialDocument || collaboratorData.document || 'SEM-DOCUMENTO-' + Date.now(),
            documentType: collaboratorData.documentType || 'rg',
            birthDate: birthDateValue,
            phone: collaboratorData.phone || null,
            type: collaboratorData.type || 'freela',
            city: collaboratorData.city || 'Não informado',
            area: collaboratorData.area || 'Geral',
            status: autoApprove ? "aprovado" : "pendente", // Auto-aprovar apenas para function_area
            ...(autoApprove && _userId ? {
              approvedBy: _userId,
              approvedAt: new Date().toISOString()
            } : {})
          });

          // Check if collaborator with same document already exists
          const existing = await storage.getCollaborators();
          const duplicateDoc = existing.find(c => c.officialDocument === validatedData.officialDocument);
          
          if (duplicateDoc) {
            result.failed++;
            result.errors.push({
              row: i + 1,
              name: collaboratorData.fullName || 'N/A', 
              error: 'Documento oficial já cadastrado'
            });
            continue;
          }

          // Autoria também na importação em lote — é justamente aí que entram
          // os cadastros incompletos que se quer conseguir cobrar depois.
          const bulkAuthorId = req.session?.userId || _userId || null;
          await storage.createCollaborator({
            ...validatedData,
            createdBy: bulkAuthorId,
            updatedBy: bulkAuthorId,
          } as any);
          result.successful++;
          
        } catch (error) {
          result.failed++;
          result.errors.push({
            row: i + 1,
            name: collaboratorData.fullName || 'N/A',
            error: error instanceof Error ? error.message : 'Erro de validação'
          });
        }
      }

      res.json(result);
    } catch (error) {
      console.error('Bulk upload error:', error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  app.patch("/api/collaborators/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const collaboratorData = insertCollaboratorSchema.partial().parse(req.body);
      // Campos de inativação só podem ser alterados pelas rotas dedicadas
      // (/inactivate e /reactivate), que aplicam a checagem de permissão e o
      // motivo obrigatório. Removemos aqui para evitar burlar essas regras.
      delete (collaboratorData as any).active;
      delete (collaboratorData as any).inactiveReason;
      delete (collaboratorData as any).inactivatedAt;

      // Registra quem editou por último. Mesmo fallback da rota de criação.
      const editorId = req.session?.userId || req.body?._userId || null;
      const collaborator = await storage.updateCollaborator(id, {
        ...collaboratorData,
        updatedBy: editorId,
        updatedAt: new Date(),
      } as any);
      res.json(collaborator);
    } catch (error) {
      res.status(400).json({ message: "Erro ao atualizar colaborador" });
    }
  });

  app.post("/api/collaborators/:id/inactivate", async (req, res) => {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ message: "Não autenticado" });
    const currentUser = await storage.getUser(userId);
    const isAdminOrPurchasing = currentUser && ['admin', 'administrator', 'administrador', 'purchasing'].includes(currentUser.role);
    if (!isAdminOrPurchasing) return res.status(403).json({ message: "Sem permissão para inativar colaboradores" });
    try {
      const { id } = req.params;
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
      if (!reason) return res.status(400).json({ message: "O motivo da inativação é obrigatório." });
      const collaborator = await storage.getCollaborator(id);
      if (!collaborator) return res.status(404).json({ message: "Colaborador não encontrado" });
      const updated = await storage.updateCollaborator(id, {
        active: false,
        inactiveReason: reason,
        inactivatedAt: new Date(),
      } as any);
      res.json(updated);
    } catch (error: any) {
      console.error("Error inactivating collaborator:", error);
      res.status(500).json({ message: "Erro ao inativar colaborador" });
    }
  });

  app.post("/api/collaborators/:id/reactivate", async (req, res) => {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ message: "Não autenticado" });
    const currentUser = await storage.getUser(userId);
    const isAdminOrPurchasing = currentUser && ['admin', 'administrator', 'administrador', 'purchasing'].includes(currentUser.role);
    if (!isAdminOrPurchasing) return res.status(403).json({ message: "Sem permissão para reativar colaboradores" });
    try {
      const { id } = req.params;
      const collaborator = await storage.getCollaborator(id);
      if (!collaborator) return res.status(404).json({ message: "Colaborador não encontrado" });
      const updated = await storage.updateCollaborator(id, {
        active: true,
        inactiveReason: null,
        inactivatedAt: null,
      } as any);
      res.json(updated);
    } catch (error: any) {
      console.error("Error reactivating collaborator:", error);
      res.status(500).json({ message: "Erro ao reativar colaborador" });
    }
  });


  // Team Inclusions routes
  app.get("/api/team-inclusions", async (req, res) => {
    try {
      const { eventId, includeDeleted } = req.query;
      
      let inclusions = await storage.getTeamInclusions(includeDeleted === 'true');
      
      // Filtrar por eventId se fornecido
      if (eventId && eventId !== 'all') {
        inclusions = inclusions.filter(inclusion => inclusion.eventId === eventId);
      }
      
      // Disable HTTP caching to prevent stale data
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      
      res.json(inclusions);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar inclusões de equipe" });
    }
  });

  // Get logs for a specific team inclusion
  app.get("/api/team-inclusions/:id/logs", async (req, res) => {
    try {
      const { id } = req.params;
      const logs = await storage.getTeamInclusionLogs(id);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar histórico de alterações" });
    }
  });

  app.post("/api/team-inclusions", async (req, res) => {
    try {
      // Clean empty date strings before validation
      const cleanedData = { ...req.body };
      
      // Convert empty date strings to null
      if (cleanedData.scheduleStartDate === "") cleanedData.scheduleStartDate = null;
      if (cleanedData.scheduleEndDate === "") cleanedData.scheduleEndDate = null;
      if (cleanedData.actualStartDate === "") cleanedData.actualStartDate = null;
      if (cleanedData.actualEndDate === "") cleanedData.actualEndDate = null;
      if (cleanedData.flightDepartureDate === "") cleanedData.flightDepartureDate = null;
      if (cleanedData.flightReturnDate === "") cleanedData.flightReturnDate = null;
      
      
      const inclusionData = insertTeamInclusionSchema.parse(cleanedData);
      const inclusion = await storage.createTeamInclusion(inclusionData);
      const actorId = req.session?.userId;
      const actor = actorId ? await storage.getUser(actorId) : null;
      await createAuditLog('create', 'team_inclusion', inclusion.id, inclusion, actorId, actor?.name || 'Sistema', undefined, req);
      res.json(inclusion);
    } catch (error) {
      console.error("Error creating team inclusion:", error);
      console.error("Request body:", req.body);
      res.status(400).json({ message: "Dados inválidos", error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.patch("/api/team-inclusions/:id", async (req, res) => {
    try {
      const { id } = req.params;
      console.log("📝 [EDIT DEBUG] PATCH request received for inclusion ID:", id);
      console.log("📝 [EDIT DEBUG] Request body:", JSON.stringify(req.body, null, 2));
      
      // Get userId from request body (frontend sends it)
      const userId = req.body._userId || req.session?.userId;
      console.log("📝 [EDIT DEBUG] User ID:", userId);
      
      if (!userId) {
        return res.status(401).json({ message: "Usuário não autenticado" });
      }

      // Get the current user to check permissions
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "Usuário não encontrado" });
      }

      // Get the team inclusion to check function
      const currentInclusion = await storage.getTeamInclusion(id);
      if (!currentInclusion) {
        return res.status(404).json({ message: "Inclusão de equipe não encontrada" });
      }

      // Check if user can manage this function
      const func = await storage.getFunction(currentInclusion.functionId);
      if (!func) {
        return res.status(404).json({ message: "Função não encontrada" });
      }

      // Authorization check: Admin, production, purchasing or function manager can modify
      const isAdmin = user.role === 'administrador' || user.role === 'admin' || user.role === 'administrator';
      const isProductionOrPurchasing = user.role === 'production' || user.role === 'purchasing';
      const isFunctionManager = await storage.isUserFunctionManager(currentInclusion.functionId, userId);
      const isLegacyResponsible = func.userId === userId; // Compatibilidade com o campo antigo
      
      if (!isAdmin && !isProductionOrPurchasing && !isFunctionManager && !isLegacyResponsible) {
        return res.status(403).json({ message: "Sem permissão para modificar esta escalação." });
      }

      console.log("🔧 PATCH team-inclusion:", id, req.body);
      
      // 🔍 DETAILED LOGGING FOR ESCALATION CONFIRMATION
      if (req.body.status || req.body.phase) {
        console.log("🔍 [CONFIRM DEBUG - BACKEND] Escalation confirmation detected!");
        console.log("🔍 [CONFIRM DEBUG - BACKEND] Current inclusion status:", currentInclusion.status);
        console.log("🔍 [CONFIRM DEBUG - BACKEND] Current inclusion phase:", currentInclusion.phase);
        console.log("🔍 [CONFIRM DEBUG - BACKEND] Current needsTicket:", currentInclusion.needsTicket);
        console.log("🔍 [CONFIRM DEBUG - BACKEND] Current needsAccommodation:", currentInclusion.needsAccommodation);
        console.log("🔍 [CONFIRM DEBUG - BACKEND] Received new status:", req.body.status);
        console.log("🔍 [CONFIRM DEBUG - BACKEND] Received new phase:", req.body.phase);
        console.log("🔍 [CONFIRM DEBUG - BACKEND] Received collaboratorId:", req.body.collaboratorId);
      }
      
      // Remove _userId from body (it's only for auth)
      const { _userId, ...bodyData } = req.body;
      
      // Auto-recalculate workDays when schedule dates change (skip if workDays explicitly provided)
      const newStartDate = bodyData.scheduleStartDate || currentInclusion.scheduleStartDate;
      const newEndDate = bodyData.scheduleEndDate || currentInclusion.scheduleEndDate;
      const datesChanged = (bodyData.scheduleStartDate && bodyData.scheduleStartDate !== currentInclusion.scheduleStartDate) ||
                           (bodyData.scheduleEndDate && bodyData.scheduleEndDate !== currentInclusion.scheduleEndDate);
      
      if (Array.isArray(bodyData.workDays)) {
        // workDays explicitly sent — use as-is and update dailyRates from count
        bodyData.dailyRates = bodyData.workDays.length;
      } else if (datesChanged && newStartDate && newEndDate) {
        const start = new Date(newStartDate);
        const end = new Date(newEndDate);
        const newWorkDays: string[] = [];
        const current = new Date(start);
        while (current <= end) {
          newWorkDays.push(current.toISOString().split('T')[0]);
          current.setDate(current.getDate() + 1);
        }
        bodyData.workDays = newWorkDays;
        bodyData.dailyRates = newWorkDays.length;
      }
      
      // VALIDAÇÃO: Impedir reabertura se já houver passagem/hospedagem comprada
      if (bodyData.status === 'reaberto') {
        // Verificar se tem passagem comprada (se precisa de passagem)
        if (currentInclusion.needsTicket) {
          const allTickets = await storage.getTickets();
          const inclusionTickets = allTickets.filter(t => t.teamInclusionId === id);
          const hasTicketPurchased = inclusionTickets.some(ticket => ticket.purchaseDate !== null);
          
          if (hasTicketPurchased) {
            return res.status(400).json({ 
              message: "Não é possível reabrir esta escalação pois a passagem já foi comprada. Cancele a compra da passagem primeiro." 
            });
          }
        }
        
        // Verificar se tem hospedagem comprada (se não precisa de passagem)
        if (!currentInclusion.needsTicket) {
          const allAccommodations = await storage.getAccommodations();
          const inclusionAccommodations = allAccommodations.filter(a => a.teamInclusionId === id);
          const hasAccommodationPurchased = inclusionAccommodations.some(acc => 
            acc.reservationNumber !== null && acc.reservationNumber !== ''
          );
          
          if (hasAccommodationPurchased) {
            return res.status(400).json({ 
              message: "Não é possível reabrir esta escalação pois a hospedagem já foi reservada. Cancele a reserva primeiro." 
            });
          }
        }
      }
      
      // VALIDAÇÃO: Bloquear alteração direta de colaborador em escalações confirmadas
      // A única forma permitida de trocar colaborador após confirmação é via solicitação de troca (swap request)
      const confirmedStatuses = ['aguardando_producao', 'escalado', 'passagem', 'passagem_comprada', 'hospedagem', 'hospedagem_comprada', 'aprovacao', 'aprovado', 'concluido'];
      if (
        bodyData.collaboratorId !== undefined &&
        bodyData.collaboratorId !== currentInclusion.collaboratorId &&
        confirmedStatuses.includes(currentInclusion.status)
      ) {
        return res.status(403).json({
          message: "Não é possível alterar o colaborador diretamente após a escalação ser confirmada. Use o fluxo de Solicitação de Troca."
        });
      }

      // BACKEND OVERRIDE: Se está confirmando escalação (enviando colaborador + status escalado),
      // verificar se a função é cenotécnica e forçar aguardando_producao
      const isConfirmingEscalation = bodyData.collaboratorId && 
        bodyData.collaboratorId !== currentInclusion.collaboratorId &&
        (bodyData.status === 'escalado' || bodyData.status === 'aprovacao');
      
      if (isConfirmingEscalation) {
        const allFunctions = await storage.getFunctions();
        const func = allFunctions.find(f => f.id === currentInclusion.functionId);
        const funcName = func?.name?.toLowerCase() || '';
        if (funcName.includes('cenotecnica') || funcName.includes('cenotécnica') || funcName.includes('sup ceno')) {
          console.log("🎭 [CENOTECNICA OVERRIDE] Forcing aguardando_producao for function:", func?.name);
          bodyData.status = 'aguardando_producao';
          bodyData.phase = 'escalacao';
        }
      }

      const updates = { 
        ...bodyData, 
        updatedBy: userId // Use authenticated user ID
      };
      console.log("🔧 Updates to apply:", updates);
      const inclusion = await storage.updateTeamInclusion(id, updates);
      console.log("✅ [EDIT DEBUG] Team inclusion updated successfully:", inclusion.id, "- New status:", inclusion.status);
      await createAuditLog('update', 'team_inclusion', id, inclusion, userId, user?.name || 'Sistema', currentInclusion, req);
      res.json(inclusion);
    } catch (error) {
      console.error("❌ Error updating team inclusion:", error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      res.status(400).json({ message: "Erro ao atualizar inclusão", details: errorMessage });
    }
  });

  // Aprovação de Produção para cenotécnica
  app.patch("/api/team-inclusions/:id/approve-production", async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session?.userId;
      if (!userId) return res.status(401).json({ message: "Não autenticado" });

      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Usuário não encontrado" });

      const isAdmin = ['admin', 'administrator', 'administrador'].includes(user.role ?? '');
      const hasPermission = isAdmin || user.canApproveCenotecnica === true;
      if (!hasPermission) {
        return res.status(403).json({ message: "Você não tem permissão para aprovar escalações de cenotécnica" });
      }

      const inclusion = await storage.getTeamInclusion(id);
      if (!inclusion) return res.status(404).json({ message: "Escalação não encontrada" });
      if (inclusion.status !== 'aguardando_producao') {
        return res.status(400).json({ message: "Escalação não está aguardando aprovação da produção" });
      }

      // Verificar se é cenotécnica
      const func = await storage.getFunction(inclusion.functionId);
      const funcName = (func?.name || '').toLowerCase();
      const isCenotecnica = funcName.includes('cenotecnica') || funcName.includes('cenotécnica') || funcName.includes('sup ceno');
      if (!isCenotecnica) {
        return res.status(400).json({ message: "Apenas funções cenotécnicas precisam de aprovação da produção" });
      }

      // Após aprovação da produção, vai direto para aprovado se sem logística
      // (Compras só entra no fluxo de trocas, não na primeira escalação)
      const noLogistics = !inclusion.needsTicket && !inclusion.needsAccommodation;
      const nextStatus = noLogistics ? 'aprovado' : 'escalado';
      const nextPhase = noLogistics ? 'aprovado' : 'escalacao';

      const updated = await storage.updateTeamInclusion(id, {
        status: nextStatus,
        phase: nextPhase,
        approvedByProduction: userId,
        approvedByProductionAt: new Date(),
        updatedBy: userId,
      });
      await createAuditLog('approve_production', 'team_inclusion', id, updated, userId, user.name ?? 'Produção', inclusion, req);
      await storage.createTeamInclusionLog({
        teamInclusionId: id,
        action: 'approve_production',
        details: `Escalação aprovada pela produção → status: ${nextStatus === 'aprovado' ? 'Aprovado' : 'Escalado'}`,
        previousValue: 'aguardando_producao',
        newValue: nextStatus,
        userId,
        userName: user.name ?? 'Produção',
      });
      res.json({ message: "Escalação aprovada pela produção", inclusion: updated });
    } catch (error) {
      console.error("Error approving production:", error);
      res.status(500).json({ message: "Erro ao aprovar escalação" });
    }
  });

  // Reprovar escalação de cenotécnica pela Produção (remove colaborador, volta p/ escalacao)
  app.patch("/api/team-inclusions/:id/reject-production", async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session?.userId;
      if (!userId) return res.status(401).json({ message: "Não autenticado" });

      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Usuário não encontrado" });

      const isAdmin = ['admin', 'administrator', 'administrador'].includes(user.role ?? '');
      const hasPermission = isAdmin || user.canApproveCenotecnica === true;
      if (!hasPermission) {
        return res.status(403).json({ message: "Você não tem permissão para reprovar escalações de cenotécnica" });
      }

      const inclusion = await storage.getTeamInclusion(id);
      if (!inclusion) return res.status(404).json({ message: "Escalação não encontrada" });
      if (inclusion.status !== 'aguardando_producao') {
        return res.status(400).json({ message: "Escalação não está aguardando aprovação da produção" });
      }

      // Reprovar: remove colaborador e volta para fase de escalação
      const updated = await storage.updateTeamInclusion(id, {
        status: 'escalacao',
        phase: 'escalacao',
        collaboratorId: null,
        updatedBy: userId,
      });
      await createAuditLog('reject_production', 'team_inclusion', id, updated, userId, user.name ?? 'Produção', inclusion, req);
      await storage.createTeamInclusionLog({
        teamInclusionId: id,
        action: 'reject_production',
        details: `Escalação reprovada pela produção — colaborador removido, voltou para escalação`,
        previousValue: 'aguardando_producao',
        newValue: 'escalacao',
        userId,
        userName: user.name ?? 'Produção',
      });
      res.json({ message: "Escalação reprovada pela produção — colaborador removido", inclusion: updated });
    } catch (error) {
      console.error("Error rejecting production:", error);
      res.status(500).json({ message: "Erro ao reprovar escalação" });
    }
  });

  // Reativar escalação cancelada (admin only)
  // Admin: Fix cenotécnica inclusions stuck with wrong status
  app.post("/api/admin/fix-cenotecnica-statuses", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) return res.status(401).json({ message: "Não autenticado" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Usuário não encontrado" });
      const isAdmin = ['admin', 'administrator', 'administrador'].includes(user.role ?? '');
      if (!isAdmin) return res.status(403).json({ message: "Apenas administradores podem executar esta correção" });

      const allFunctions = await storage.getFunctions();
      const cenotecnicaFunctionIds = new Set(
        allFunctions
          .filter(f => f.name.toLowerCase().includes('cenotecnica') || f.name.toLowerCase().includes('cenotécnica') || f.name.toLowerCase().includes('sup ceno'))
          .map(f => f.id)
      );

      const allInclusions = await storage.getTeamInclusions();
      const toFix = allInclusions.filter(i =>
        i.collaboratorId && // has a collaborator (was escalated)
        i.status === 'escalado' &&
        i.functionId &&
        cenotecnicaFunctionIds.has(i.functionId)
      );

      const fixed = [];
      for (const inc of toFix) {
        const updated = await storage.updateTeamInclusion(inc.id, {
          status: 'aguardando_producao',
          phase: 'escalacao',
          updatedBy: userId,
        });
        fixed.push({ id: inc.id, inclusionNumber: inc.inclusionNumber });
      }

      console.log(`✅ [ADMIN FIX] Fixed ${fixed.length} cenotecnica inclusions:`, fixed);
      res.json({ message: `${fixed.length} escalação(ões) cenotécnica corrigida(s)`, fixed });
    } catch (error) {
      console.error("Error fixing cenotecnica statuses:", error);
      res.status(500).json({ message: "Erro ao corrigir escalações" });
    }
  });

  app.patch("/api/team-inclusions/:id/reactivate", async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session?.userId;
      if (!userId) return res.status(401).json({ message: "Não autenticado" });

      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Usuário não encontrado" });

      const isAdmin = ['admin', 'administrator', 'administrador'].includes(user.role ?? '');
      if (!isAdmin) return res.status(403).json({ message: "Apenas administradores podem reativar escalações" });

      const current = await storage.getTeamInclusion(id);
      if (!current) return res.status(404).json({ message: "Escalação não encontrada" });
      if (current.status !== 'cancelado') return res.status(400).json({ message: "Apenas escalações canceladas podem ser reativadas" });

      const updated = await storage.updateTeamInclusion(id, {
        status: 'pendente',
        deletedAt: null,
        deletedBy: null,
        updatedBy: userId,
      });
      await createAuditLog('reactivate', 'team_inclusion', id, current, userId, user.name ?? 'Admin', undefined, req);
      res.json({ message: "Escalação reativada com sucesso", inclusion: updated });
    } catch (error) {
      console.error("Error reactivating team inclusion:", error);
      res.status(500).json({ message: "Erro ao reativar escalação" });
    }
  });

  app.delete("/api/team-inclusions/:id", async (req, res) => {
    try {
      const { id } = req.params;
      // Use authenticated user ID or null (deletedBy is nullable foreign key)
      const userId = req.session?.userId || null;
      
      // Soft delete - marca como excluído ao invés de deletar permanentemente
      const prevInclusion = await storage.getTeamInclusion(id);
      const inclusion = await storage.updateTeamInclusion(id, {
        deletedAt: new Date(),
        deletedBy: userId,
      });
      const actor = userId ? await storage.getUser(userId) : null;
      await createAuditLog('delete', 'team_inclusion', id, prevInclusion, userId || undefined, actor?.name || 'Sistema', undefined, req);
      res.json({ message: "Inclusão removida com sucesso", inclusion });
    } catch (error) {
      console.error("Error deleting team inclusion:", error);
      res.status(500).json({ message: "Erro ao remover inclusão" });
    }
  });

  // Endpoint para migrar horários das observações para os campos específicos
  app.post("/api/team-inclusions/migrate-flight-times", async (req, res) => {
    try {
      const inclusions = await storage.getTeamInclusions();
      let updatedCount = 0;

      for (const inclusion of inclusions) {
        // Atualizar apenas se não tiver horários definidos mas tiver observações
        if (inclusion.needsTicket && inclusion.observations && 
            (!inclusion.flightDepartureSuggestedTime || !inclusion.flightReturnSuggestedTime)) {
          
          // Extrair horários das observações
          const observations = inclusion.observations;
          const idaMatch = observations.match(/Ida:\s*([^|]*?)(?:\s*\||\s*$)/);
          const horarioMatch = observations.match(/Horário:\s*([^|]*?)(?:\s*\||\s*$)/);
          
          const ida = (idaMatch && idaMatch[1].trim()) ? idaMatch[1].trim() : null;
          const horario = (horarioMatch && horarioMatch[1].trim()) ? horarioMatch[1].trim() : null;
          
          if (ida || horario) {
            await storage.updateTeamInclusion(inclusion.id, {
              flightDepartureSuggestedTime: ida,
              flightReturnSuggestedTime: horario
            });
            
            updatedCount++;
          }
        }
      }

      res.json({ 
        message: `Migração concluída`,
        updatedCount,
        totalProcessed: inclusions.length
      });
    } catch (error) {
      console.error("Erro ao migrar horários:", error);
      res.status(500).json({ message: "Erro ao migrar horários das observações" });
    }
  });


  // Tickets routes
  app.get("/api/tickets", async (req, res) => {
    try {
      const tickets = await storage.getTickets();
      res.json(tickets);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar passagens" });
    }
  });

  app.post("/api/tickets", async (req, res) => {
    try {
      console.log("📝 Dados recebidos:", JSON.stringify(req.body, null, 2));
      const ticketData = insertTicketSchema.parse(req.body);
      console.log("✅ Dados validados:", JSON.stringify(ticketData, null, 2));
      const ticket = await storage.createTicket(ticketData);
      const actorId = req.session?.userId;
      const actor = actorId ? await storage.getUser(actorId) : null;
      await createAuditLog('create', 'ticket', ticket.id, ticket, actorId, actor?.name || 'Sistema', undefined, req);
      res.json(ticket);
    } catch (error) {
      console.error("❌ Erro na validação:", error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      res.status(400).json({ message: "Dados inválidos", error: errorMessage });
    }
  });

  app.patch("/api/tickets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = { 
        ...req.body, 
        updatedAt: new Date(),
        updatedBy: req.body.updatedBy || null
      };
      const prev = await storage.getTicket(id);
      const ticket = await storage.updateTicket(id, updates);
      const actorId = req.session?.userId || req.body.updatedBy;
      const actor = actorId ? await storage.getUser(actorId) : null;
      await createAuditLog('update', 'ticket', id, ticket, actorId, actor?.name || 'Sistema', prev, req);
      res.json(ticket);
    } catch (error) {
      res.status(400).json({ message: "Erro ao atualizar passagem" });
    }
  });

  // Accommodations routes
  app.get("/api/accommodations", async (req, res) => {
    try {
      const accommodations = await storage.getAccommodations();
      res.json(accommodations);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar hospedagens" });
    }
  });

  app.post("/api/accommodations", async (req, res) => {
    try {
      console.log("📝 Dados de hospedagem recebidos:", JSON.stringify(req.body, null, 2));
      const accommodationData = insertAccommodationSchema.parse(req.body);
      console.log("✅ Dados de hospedagem validados:", JSON.stringify(accommodationData, null, 2));
      const accommodation = await storage.createAccommodation(accommodationData);
      const actorId = req.session?.userId;
      const actor = actorId ? await storage.getUser(actorId) : null;
      await createAuditLog('create', 'accommodation', accommodation.id, accommodation, actorId, actor?.name || 'Sistema', undefined, req);
      res.json(accommodation);
    } catch (error) {
      console.error("❌ Erro na validação de hospedagem:", error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      res.status(400).json({ message: "Dados inválidos", error: errorMessage });
    }
  });

  app.patch("/api/accommodations/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = { 
        ...req.body, 
        updatedAt: new Date(),
        updatedBy: req.body.updatedBy || null
      };
      const prev = await storage.getAccommodation(id);
      const accommodation = await storage.updateAccommodation(id, updates);
      const actorId = req.session?.userId || req.body.updatedBy;
      const actor = actorId ? await storage.getUser(actorId) : null;
      await createAuditLog('update', 'accommodation', id, accommodation, actorId, actor?.name || 'Sistema', prev, req);
      res.json(accommodation);
    } catch (error) {
      res.status(400).json({ message: "Erro ao atualizar hospedagem" });
    }
  });

  // ===== Espelho Operacional (Logística do Evento) =====
  app.get("/api/events/:eventId/operational-mirror", async (req, res) => {
    try {
      const data = await getOperationalMirror(req.params.eventId);
      if (!data) return res.status(404).json({ message: "Evento não encontrado" });
      res.json(data);
    } catch (error) {
      console.error("Erro espelho operacional:", error);
      res.status(500).json({ message: "Erro ao carregar espelho operacional" });
    }
  });

  app.patch("/api/events/:eventId/operational-mirror/rows/:rowId", async (req, res) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ message: "Não autenticado" });
      const { field, value } = req.body || {};
      if (!field) return res.status(400).json({ message: "Campo obrigatório" });
      const result = await patchOperationalMirrorCell(req.params.eventId, req.params.rowId, field, value);
      res.json(result);
    } catch (error: any) {
      console.error("Erro ao salvar célula do espelho:", error);
      res.status(400).json({ message: error?.message || "Erro ao salvar célula" });
    }
  });

  app.post("/api/events/:eventId/recalculate-logistics-suggestions", async (req, res) => {
    try {
      const result = await recalculateLogisticsSuggestions(req.params.eventId);
      res.json(result);
    } catch (error) {
      console.error("Erro ao recalcular sugestões:", error);
      res.status(500).json({ message: "Erro ao recalcular sugestões" });
    }
  });

  app.get("/api/events/:eventId/operational-mirror/export", async (req, res) => {
    try {
      const buf = await exportOperationalMirrorExcel(req.params.eventId);
      if (!buf) return res.status(404).json({ message: "Evento não encontrado" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="espelho-operacional.xlsx"`);
      res.send(buf);
    } catch (error) {
      console.error("Erro ao exportar espelho:", error);
      res.status(500).json({ message: "Erro ao exportar" });
    }
  });

  app.post("/api/hotel-room-groups/:id/confirm", async (req, res) => {
    try {
      const [g] = await db.update(hotelRoomGroupsTable)
        .set({ confirmed: true, suggested: false, updatedAt: new Date() })
        .where(eq(hotelRoomGroupsTable.id, req.params.id)).returning();
      res.json(g);
    } catch (error) {
      res.status(400).json({ message: "Erro ao confirmar grupo de quarto" });
    }
  });

  app.patch("/api/hotel-room-groups/:id", async (req, res) => {
    try {
      const allowed: any = {};
      for (const k of ["hotelName", "roomType", "genderRule", "checkInDate", "checkOutDate", "notes", "confirmed"]) {
        if (k in req.body) allowed[k] = req.body[k];
      }
      const [g] = await db.update(hotelRoomGroupsTable)
        .set({ ...allowed, updatedAt: new Date() })
        .where(eq(hotelRoomGroupsTable.id, req.params.id)).returning();
      res.json(g);
    } catch (error) {
      res.status(400).json({ message: "Erro ao atualizar grupo de quarto" });
    }
  });

  app.post("/api/uber-groups/:id/confirm", async (req, res) => {
    try {
      const [g] = await db.update(uberGroupsTable)
        .set({ confirmed: true, suggested: false, status: "confirmado", updatedAt: new Date() })
        .where(eq(uberGroupsTable.id, req.params.id)).returning();
      res.json(g);
    } catch (error) {
      res.status(400).json({ message: "Erro ao confirmar grupo de uber" });
    }
  });

  app.patch("/api/uber-groups/:id", async (req, res) => {
    try {
      const allowed: any = {};
      for (const k of ["groupName", "direction", "origin", "destination", "date", "time", "estimatedTotalCents", "notes", "status", "confirmed"]) {
        if (k in req.body) allowed[k] = req.body[k];
      }
      const [g] = await db.update(uberGroupsTable)
        .set({ ...allowed, updatedAt: new Date() })
        .where(eq(uberGroupsTable.id, req.params.id)).returning();
      res.json(g);
    } catch (error) {
      res.status(400).json({ message: "Erro ao atualizar grupo de uber" });
    }
  });

  // Custos extras de logística (bagagem, uber, locação)
  app.post("/api/logistics-extra-costs", async (req, res) => {
    try {
      const data = insertLogisticsExtraCostSchema.parse(req.body);
      const [created] = await db.insert(logisticsExtraCostsTable).values(data).returning();
      res.json(created);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "erro";
      res.status(400).json({ message: "Dados inválidos", error: msg });
    }
  });

  app.patch("/api/logistics-extra-costs/:id", async (req, res) => {
    try {
      const allowed: any = {};
      for (const k of ["collaboratorId", "type", "description", "amountCents", "oc", "checkInReference", "company", "notes", "attachmentUrl"]) {
        if (k in req.body) allowed[k] = req.body[k];
      }
      const [updated] = await db.update(logisticsExtraCostsTable)
        .set({ ...allowed, updatedAt: new Date() })
        .where(eq(logisticsExtraCostsTable.id, req.params.id)).returning();
      res.json(updated);
    } catch (error) {
      res.status(400).json({ message: "Erro ao atualizar custo" });
    }
  });

  app.delete("/api/logistics-extra-costs/:id", async (req, res) => {
    try {
      await db.delete(logisticsExtraCostsTable).where(eq(logisticsExtraCostsTable.id, req.params.id));
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ message: "Erro ao excluir custo" });
    }
  });

  // Financial routes
  app.get("/api/financial", async (req, res) => {
    if (!(await requireFinancialRead(req, res))) return;
    try {
      const financial = await storage.getFinancials();
      res.json(financial);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar dados financeiros" });
    }
  });

  app.post("/api/financial", async (req, res) => {
    if (!(await requireFinancialRead(req, res))) return;
    try {
      const financialData = insertFinancialSchema.parse(req.body);
      const financial = await storage.createFinancial(financialData);
      res.json(financial);
    } catch (error) {
      res.status(400).json({ message: "Dados inválidos" });
    }
  });

  app.patch("/api/financial/:id", async (req, res) => {
    if (!(await requireFinancialRead(req, res))) return;
    try {
      const { id } = req.params;
      const updates = { 
        ...req.body, 
        updatedAt: new Date(),
        updatedBy: req.body.updatedBy || null // frontend deve enviar o ID do usuário que está editando
      };
      const financial = await storage.updateFinancial(id, updates);
      res.json(financial);
    } catch (error) {
      res.status(400).json({ message: "Erro ao atualizar dados financeiros" });
    }
  });

  // Comments routes
  app.get("/api/comments/:teamInclusionId", async (req, res) => {
    try {
      const { teamInclusionId } = req.params;
      const comments = await storage.getComments(teamInclusionId);
      res.json(comments);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar comentários" });
    }
  });

  app.post("/api/comments", async (req, res) => {
    try {
      const commentData = insertCommentSchema.parse(req.body);
      const comment = await storage.createComment(commentData);
      res.json(comment);
    } catch (error) {
      res.status(400).json({ message: "Dados inválidos" });
    }
  });

  app.get("/api/all-comments", async (req, res) => {
    try {
      const allComments = await storage.getAllComments();
      res.json(allComments);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar todos os comentários" });
    }
  });

  // Simple file upload endpoint for FileUpload component
  app.post("/api/upload", upload.array('files', 10), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        return res.status(400).json({ message: "Nenhum arquivo enviado" });
      }

      const { ObjectStorageService } = await import("./objectStorage");
      const objectStorageService = new ObjectStorageService();
      
      const uploadedFiles = [];
      
      for (const file of files) {
        // Generate unique ID for the attachment
        const attachmentId = `ATT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`.toUpperCase();
        
        // Get upload URL from object storage
        const uploadURL = await objectStorageService.getObjectEntityUploadURL(attachmentId);
        
        // Upload file directly using the presigned URL
        const response = await fetch(uploadURL, {
          method: 'PUT',
          body: file.buffer,
          headers: {
            'Content-Type': file.mimetype,
          },
        });
        
        if (!response.ok) {
          throw new Error(`Upload failed for ${file.originalname}`);
        }
        
        // Build file info
        const fileInfo = {
          id: attachmentId,
          name: file.originalname,
          type: file.mimetype,
          size: file.size,
          url: `/api/attachments/${attachmentId}/view`
        };
        
        uploadedFiles.push(fileInfo);
      }
      
      res.json(uploadedFiles);
      
    } catch (error) {
      console.error("Erro no upload:", error);
      res.status(500).json({ message: "Erro ao fazer upload dos arquivos" });
    }
  });

  // Attachment routes with real object storage
  app.post("/api/attachments/upload", async (req, res) => {
    try {
      const { ObjectStorageService } = await import("./objectStorage");
      const objectStorageService = new ObjectStorageService();
      
      // Gerar ID único para o anexo
      const attachmentId = `ATT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`.toUpperCase();
      
      // Obter URL de upload do object storage
      const uploadURL = await objectStorageService.getObjectEntityUploadURL(attachmentId);
      
      res.json({ 
        attachmentId,
        uploadURL,
        message: "URL de upload gerada com sucesso"
      });
    } catch (error) {
      console.error("Erro ao gerar URL de upload:", error);
      res.status(500).json({ message: "Erro ao preparar upload do anexo" });
    }
  });

  // Confirmar upload completo e definir metadados
  app.post("/api/attachments/:id/confirm", async (req, res) => {
    try {
      const { id } = req.params;
      const { fileName, fileType, fileSize } = req.body;
      const { ObjectStorageService, ObjectNotFoundError, objectStorageClient } = await import("./objectStorage");
      const objectStorageService = new ObjectStorageService();
      
      // Função auxiliar para analisar caminho do objeto  
      const parseObjectPath = (path: string): { bucketName: string; objectName: string } => {
        if (!path.startsWith("/")) path = `/${path}`;
        const pathParts = path.split("/");
        if (pathParts.length < 3) throw new Error("Invalid path: must contain at least a bucket name");
        const bucketName = pathParts[1];
        const objectName = pathParts.slice(2).join("/");
        return { bucketName, objectName };
      };
      
      try {
        // Salvar o nome original do arquivo nos metadados do objeto no storage
        if (fileName) {
          try {
            const privateDir = objectStorageService.getPrivateObjectDir();
            const fullPath = `${privateDir}/uploads/${id}`;
            const parseObjectPath2 = (path: string): { bucketName: string; objectName: string } => {
              if (!path.startsWith("/")) path = `/${path}`;
              const pathParts = path.split("/");
              if (pathParts.length < 3) throw new Error("Invalid path");
              return { bucketName: pathParts[1], objectName: pathParts.slice(2).join("/") };
            };
            const { bucketName, objectName } = parseObjectPath2(fullPath);
            const bucket = objectStorageClient.bucket(bucketName);
            const objectFile = bucket.file(objectName);
            await objectFile.setMetadata({ metadata: { 'custom:originalFileName': fileName } });
          } catch (_metaErr) {
            // não crítico — seguir mesmo se falhar
          }
        }
        res.json({
          message: "Upload confirmado com sucesso",
          attachmentId: id,
          fileName,
          fileType,
          fileSize
        });
      } catch (error) {
        throw error;
      }
    } catch (error) {
      console.error("Erro ao confirmar upload:", error);
      res.status(500).json({ message: "Erro ao confirmar upload do anexo" });
    }
  });

  app.get("/api/attachments/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { ObjectStorageService, ObjectNotFoundError, objectStorageClient } = await import("./objectStorage");
      const objectStorageService = new ObjectStorageService();
      
      try {
        // Buscar arquivo diretamente no storage  
        const privateDir = objectStorageService.getPrivateObjectDir();
        const fullPath = `${privateDir}/uploads/${id}`;
        
        const parseObjectPath = (path: string): { bucketName: string; objectName: string } => {
          if (!path.startsWith("/")) path = `/${path}`;
          const pathParts = path.split("/");
          if (pathParts.length < 3) throw new Error("Invalid path");
          return { bucketName: pathParts[1], objectName: pathParts.slice(2).join("/") };
        };
        
        const { bucketName, objectName } = parseObjectPath(fullPath);
        const bucket = objectStorageClient.bucket(bucketName);
        const objectFile = bucket.file(objectName);
        const [metadata] = await objectFile.getMetadata();
        
        // Extrair nome original dos metadados customizados
        const extractedName = metadata.name ? metadata.name.split('/').pop() : null;
        // Se o nome extraído é apenas o ID do objeto (começa com "ATT-"), ignorar
        const fallbackName = extractedName && !extractedName.startsWith('ATT-') ? extractedName : `Anexo_${id.slice(-8)}`;
        const originalFileName = metadata.metadata?.['custom:originalFileName'] || fallbackName;
        
        // Retornar informações do arquivo real
        res.json({
          id,
          name: originalFileName,
          type: metadata.contentType || "application/octet-stream",
          size: metadata.size ? `${(parseInt(String(metadata.size)) / 1024 / 1024).toFixed(2)} MB` : "Desconhecido",
          downloadUrl: `/api/attachments/${id}/download`,
          viewUrl: `/api/attachments/${id}/view`,
          message: "Arquivo encontrado no storage"
        });
      } catch (error) {
        if (error instanceof ObjectNotFoundError) {
          // Arquivo não existe no storage, retornar informação simulada
          res.json({
            id,
            name: `Anexo_${id.slice(-8)}.pdf`,
            type: "application/pdf", 
            size: "Arquivo não encontrado",
            downloadUrl: "#",
            viewUrl: "#",
            message: "Arquivo simulado - não foi encontrado no storage real"
          });
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error("Erro ao buscar anexo:", error);
      res.status(500).json({ message: "Erro ao buscar anexo" });
    }
  });

  // Download de anexo
  app.get("/api/attachments/:id/download", async (req, res) => {
    try {
      const { id } = req.params;
      const { ObjectStorageService, ObjectNotFoundError, objectStorageClient } = await import("./objectStorage");
      const objectStorageService = new ObjectStorageService();
      
      // Buscar arquivo diretamente no storage
      const privateDir = objectStorageService.getPrivateObjectDir();
      const fullPath = `${privateDir}/uploads/${id}`;
      
      const parseObjectPath = (path: string): { bucketName: string; objectName: string } => {
        if (!path.startsWith("/")) path = `/${path}`;
        const pathParts = path.split("/");
        return { bucketName: pathParts[1], objectName: pathParts.slice(2).join("/") };
      };
      
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const objectFile = bucket.file(objectName);
      
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      if (error instanceof Error && error.name === "ObjectNotFoundError") {
        res.status(404).json({ message: "Arquivo não encontrado" });
      } else {
        console.error("Erro ao fazer download:", error);
        res.status(500).json({ message: "Erro ao fazer download do anexo" });
      }
    }
  });

  // Visualização de anexo (mesmo que download, mas com headers apropriados)
  app.get("/api/attachments/:id/view", async (req, res) => {
    try {
      const { id } = req.params;
      const { ObjectStorageService, ObjectNotFoundError, objectStorageClient } = await import("./objectStorage");
      const objectStorageService = new ObjectStorageService();
      
      // Buscar arquivo diretamente no storage
      const privateDir = objectStorageService.getPrivateObjectDir();
      const fullPath = `${privateDir}/uploads/${id}`;
      
      const parseObjectPath = (path: string): { bucketName: string; objectName: string } => {
        if (!path.startsWith("/")) path = `/${path}`;
        const pathParts = path.split("/");
        return { bucketName: pathParts[1], objectName: pathParts.slice(2).join("/") };
      };
      
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const objectFile = bucket.file(objectName);
      
      // Adicionar header para visualização inline
      res.set('Content-Disposition', 'inline');
      
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      if (error instanceof Error && error.name === "ObjectNotFoundError") {
        res.status(404).json({ message: "Arquivo não encontrado" });
      } else {
        console.error("Erro ao visualizar arquivo:", error);
        res.status(500).json({ message: "Erro ao visualizar anexo" });
      }
    }
  });

  // System Logs route (admin only)
  app.get("/api/system-logs", async (req, res) => {
    try {
      // Check authentication and authorization
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ message: "Usuário não autenticado" });
      }

      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ message: "Usuário não encontrado" });
      }

      // Only admins can access system logs
      const isAdmin = currentUser.role === 'administrador' || currentUser.role === 'admin' || currentUser.role === 'administrator';
      if (!isAdmin) {
        return res.status(403).json({ message: "Sem permissão para acessar logs do sistema. Apenas administradores podem acessar esta funcionalidade." });
      }

      // Parse query parameters for filtering
      const { entityType, action, days, search, userId: filterUserId, page = '1', limit = '50' } = req.query;
      
      // Build filters object
      const filters: any = {};
      if (entityType && entityType !== 'all') {
        filters.entityType = entityType as string;
      }
      if (action && action !== 'all') {
        filters.action = action as string;
      }
      if (days) {
        filters.days = parseInt(days as string, 10);
      }
      if (search) {
        filters.search = search as string;
      }
      if (filterUserId) {
        filters.userId = filterUserId as string;
      }

      // Get logs with filters
      const allLogs = await storage.getSystemLogs(filters);
      
      // Apply pagination
      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const offset = (pageNum - 1) * limitNum;
      
      const paginatedLogs = allLogs.slice(offset, offset + limitNum);
      
      // Return paginated response
      res.json({
        logs: paginatedLogs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: allLogs.length,
          pages: Math.ceil(allLogs.length / limitNum)
        }
      });
    } catch (error) {
      console.error("Error fetching system logs:", error);
      res.status(500).json({ message: "Erro ao buscar logs do sistema" });
    }
  });

  // ================ BUDGET ROUTES ================

  // Function Values (valores automáticos por função)
  app.get("/api/function-values", async (req, res) => {
    if (!(await requireFinancialRead(req, res))) return;
    try {
      const values = await storage.getAllFunctionValues();
      res.json(values);
    } catch (error) {
      console.error("Error fetching function values:", error);
      res.status(500).json({ message: "Erro ao buscar valores das funções" });
    }
  });

  app.get("/api/function-values/:functionId", async (req, res) => {
    if (!(await requireFinancialRead(req, res))) return;
    try {
      const value = await storage.getFunctionValues(req.params.functionId);
      res.json(value || null);
    } catch (error) {
      console.error("Error fetching function value:", error);
      res.status(500).json({ message: "Erro ao buscar valor da função" });
    }
  });

  // A tabela de valores é a raiz de todo o cálculo financeiro — sem checagem,
  // qualquer requisição reescrevia quanto cada função paga.
  app.post("/api/function-values", async (req, res) => {
    if (!(await requireFinancialWrite(req, res))) return;
    try {
      const data = insertFunctionValuesSchema.parse(req.body);
      const value = await storage.createFunctionValue(data);
      res.status(201).json(value);
    } catch (error) {
      console.error("Error creating function value:", error);
      res.status(400).json({ message: "Erro ao criar valor da função" });
    }
  });

  app.patch("/api/function-values/:id", async (req, res) => {
    if (!(await requireFinancialWrite(req, res))) return;
    try {
      // Antes o req.body ia cru para o storage, sem schema — qualquer coluna
      // podia ser escrita. O partial() valida os campos e descarta o resto.
      const data = insertFunctionValuesSchema.partial().parse(req.body);
      const value = await storage.updateFunctionValue(req.params.id, data);
      res.json(value);
    } catch (error) {
      console.error("Error updating function value:", error);
      res.status(400).json({ message: "Erro ao atualizar valor da função" });
    }
  });

  // Gerar valores padrão para funções sem configuração
  app.post("/api/function-values/generate-defaults", async (req, res) => {
    if (!(await requireFinancialWrite(req, res))) return;
    try {
      const functions = await storage.getFunctions();
      const existingValues = await storage.getAllFunctionValues();
      const existingFunctionIds = new Set(existingValues.map(v => v.functionId));
      
      const defaultValues: Record<string, { dailyValue: number; costAssistance: number; mobility: number }> = {
        'coordenador': { dailyValue: 50000, costAssistance: 15000, mobility: 5000 },
        'supervisor': { dailyValue: 40000, costAssistance: 12000, mobility: 4000 },
        'lider': { dailyValue: 35000, costAssistance: 10000, mobility: 3500 },
        'tecnico': { dailyValue: 30000, costAssistance: 8000, mobility: 3000 },
        'operador': { dailyValue: 25000, costAssistance: 7000, mobility: 2500 },
        'auxiliar': { dailyValue: 20000, costAssistance: 6000, mobility: 2000 },
        'motorista': { dailyValue: 22000, costAssistance: 8000, mobility: 0 },
        'default': { dailyValue: 25000, costAssistance: 7000, mobility: 2500 }
      };
      
      const created = [];
      for (const func of functions) {
        if (!existingFunctionIds.has(func.id)) {
          const funcNameLower = func.name.toLowerCase();
          let values = defaultValues['default'];
          
          for (const [key, val] of Object.entries(defaultValues)) {
            if (funcNameLower.includes(key)) {
              values = val;
              break;
            }
          }
          
          const newValue = await storage.createFunctionValue({
            functionId: func.id,
            dailyValue: values.dailyValue,
            costAssistance: values.costAssistance,
            weekdayLunch: 3500,
            weekdayDinner: 4000,
            weekendLunch: 4000,
            weekendDinner: 4500,
            mobility: values.mobility,
            transport: 0,
          });
          created.push(newValue);
        }
      }
      
      res.json({ created: created.length, values: created });
    } catch (error) {
      console.error("Error generating default values:", error);
      res.status(500).json({ message: "Erro ao gerar valores padrão" });
    }
  });

  // Budget Planned — Apply system defaults to all pending (not-yet-sent) records
  app.post("/api/budget-planned/apply-defaults", async (req, res) => {
    const userId = req.session?.userId || req.body?._userId;
    if (!userId) return res.status(401).json({ message: "Não autenticado" });
    const user = await storage.getUser(userId);
    if (!user || (user.role !== "admin" && user.role !== "financial"))
      return res.status(403).json({ message: "Acesso negado" });

    try {
      const [allPlanned, allActual, allInclusions, allFunctionValues, rawSettings, allCollaborators, allTickets] = await Promise.all([
        storage.getAllBudgetPlanned(),
        storage.getAllBudgetActual(),
        storage.getTeamInclusions(),
        storage.getAllFunctionValues(),
        storage.getSystemSettings(),
        storage.getCollaborators(),
        storage.getTickets(),
      ]);

      // Horário real da passagem tem precedência sobre o sugerido da escalação.
      // Quando o orçamento é calculado antes da compra, a passagem ainda não
      // existe e o sugerido é o que há.
      const ticketByInclusion = new Map<string, any>();
      for (const t of allTickets) {
        if (t.teamInclusionId) ticketByInclusion.set(t.teamInclusionId, t);
      }

      const cfg: Record<string, number> = {};
      for (const s of rawSettings) cfg[s.key] = parseInt(s.value);

      // Casa defaults
      const D = {
        dailyWd:  cfg.default_daily_value_weekday  ?? cfg.default_daily_value ?? 5000,
        dailyWe:  cfg.default_daily_value_weekend   ?? cfg.default_daily_value ?? 5000,
        mobIda:   cfg.default_mobility_ida   ?? Math.ceil((cfg.default_mobility ?? 2500) / 2),
        mobVolta: cfg.default_mobility_volta  ?? Math.floor((cfg.default_mobility ?? 2500) / 2),
        almSem:   cfg.default_weekday_lunch   ?? 3500,
        janSem:   cfg.default_weekday_dinner  ?? 4000,
        almFds:   cfg.default_weekend_lunch   ?? 4000,
        janFds:   cfg.default_weekend_dinner  ?? 4500,
        // Freela-specific defaults
        dailyWdFreela: cfg.default_daily_value_weekday_freela ?? cfg.default_daily_value_weekday ?? cfg.default_daily_value ?? 5000,
        dailyWeFreela: cfg.default_daily_value_weekend_freela ?? cfg.default_daily_value_weekend ?? cfg.default_daily_value ?? 5000,
        mobIdaFreela:  cfg.default_mobility_ida_freela  ?? cfg.default_mobility_ida  ?? Math.ceil((cfg.default_mobility ?? 2500) / 2),
        mobVoltaFreela: cfg.default_mobility_volta_freela ?? cfg.default_mobility_volta ?? Math.floor((cfg.default_mobility ?? 2500) / 2),
        almSemFreela:  cfg.default_weekday_lunch_freela ?? cfg.default_weekday_lunch ?? 3500,
        janSemFreela:  cfg.default_weekday_dinner_freela ?? cfg.default_weekday_dinner ?? 4000,
        almFdsFreela:  cfg.default_weekend_lunch_freela ?? cfg.default_weekend_lunch ?? 4000,
        janFdsFreela:  cfg.default_weekend_dinner_freela ?? cfg.default_weekend_dinner ?? 4500,
      };

      // Build set of (eventId|collaboratorId|functionId) that already have a budget_actual
      const sentKeys = new Set<string>();
      for (const a of allActual) sentKeys.add(`${a.eventId}|${a.collaboratorId}|${a.functionId}`);

      // Sequência de dias do período. A deflação depende da POSIÇÃO do dia
      // (1º, 5º, 9º...), então não basta contar quantos são úteis e quantos são
      // de fim de semana — é preciso saber a ordem.
      const listDays = (start: string | null, end: string | null, fallback: number): boolean[] => {
        if (start && end) {
          const s = new Date(start + 'T12:00:00'), e = new Date(end + 'T12:00:00');
          const days: boolean[] = [];
          const cur = new Date(s);
          while (cur <= e) {
            const d = cur.getDay();
            days.push(d === 0 || d === 6); // true = fim de semana
            cur.setDate(cur.getDate() + 1);
          }
          return days;
        }
        // Sem datas, cai no fallback da quantidade de diárias, todas como dia útil.
        return Array.from({ length: Math.max(0, fallback) }, () => false);
      };

      // Regra de deflação (slide 7 do deck de melhorias):
      //   até 4 dias      100%
      //   a partir do 5º   90%
      //   a partir do 9º   80%
      //
      // É MARGINAL, não um fator único sobre o total: cada dia paga conforme a
      // faixa em que ele cai. Num evento de 10 dias, os 4 primeiros valem
      // integral, do 5º ao 8º valem 90% e o 9º e 10º valem 80%.
      //
      // Os limites e percentuais vêm das configurações do sistema para poderem
      // ser ajustados quando a regra mudar, sem depender de deploy. Os valores
      // abaixo são o fallback e correspondem à regra vigente do slide 7.
      // Guardados em centésimos de ponto percentual (9000 = 90%) para manter a
      // mesma convenção inteira do resto das configurações.
      const deflTier1Day = cfg.deflation_tier1_start_day ?? 5;   // 1º dia da faixa reduzida
      const deflTier2Day = cfg.deflation_tier2_start_day ?? 9;   // 1º dia da faixa mais reduzida
      const deflTier1Pct = (cfg.deflation_tier1_percent ?? 9000) / 10000;
      const deflTier2Pct = (cfg.deflation_tier2_percent ?? 8000) / 10000;

      const deflationFactor = (dayNumber: number): number => {
        if (dayNumber >= deflTier2Day) return deflTier2Pct;
        if (dayNumber >= deflTier1Day) return deflTier1Pct;
        return 1;
      };

      // ── Mobilidade por faixa de horário de voo (slides 7 e 9) ──────────────
      //   deslocamento aeroporto por trecho, demais horários  R$ 29,00
      //   voo partindo das 23h30 até 9h30                     R$ 58,00
      //   voo chegando das 20h00 até as 5h00                  R$ 58,00
      //
      // Antes a mobilidade era um valor fixo, sem noção de horário. Agora cada
      // trecho é avaliado pelo horário do voo correspondente.
      //
      // Tudo configurável para a regra poder mudar sem deploy. Janelas em
      // minutos desde a meia-noite, que é o que permite expressar faixas que
      // cruzam o dia (23h30 às 9h30) com dois inteiros.
      const mobStandard = cfg.mobility_leg_standard ?? 2900;
      const mobUnsocial = cfg.mobility_leg_unsocial ?? 5800;
      const depWinStart = cfg.mobility_departure_window_start ?? 1410; // 23:30
      const depWinEnd   = cfg.mobility_departure_window_end   ?? 570;  // 09:30
      const arrWinStart = cfg.mobility_arrival_window_start   ?? 1200; // 20:00
      const arrWinEnd   = cfg.mobility_arrival_window_end     ?? 300;  // 05:00

      // "23:30", "23h30", "2330" → 1410. Devolve null quando não dá para ler,
      // e nesse caso o trecho mantém o valor atual em vez de chutar faixa.
      const toMinutes = (raw: string | null | undefined): number | null => {
        if (!raw) return null;
        const m = String(raw).trim().match(/^(\d{1,2})[:h.]?(\d{2})/);
        if (!m) return null;
        const h = Number(m[1]), min = Number(m[2]);
        if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
        return h * 60 + min;
      };

      // As duas janelas cruzam a meia-noite, então "dentro" é start..24h ou 0..end.
      const inWindow = (minutes: number, start: number, end: number): boolean =>
        start <= end ? minutes >= start && minutes <= end : minutes >= start || minutes <= end;

      // Calcular todos os updates necessários primeiro, depois executar em paralelo
      const updates: Promise<any>[] = [];
      for (const planned of allPlanned) {
        if (sentKeys.has(`${planned.eventId}|${planned.collaboratorId}|${planned.functionId}`)) continue;

        const inc = allInclusions.find(i =>
          i.eventId === planned.eventId &&
          i.collaboratorId === planned.collaboratorId &&
          i.functionId === planned.functionId
        );
        const dayList = listDays(
          inc?.scheduleStartDate ?? null,
          inc?.scheduleEndDate ?? null,
          planned.dailyQuantity
        );

        const collaborator = allCollaborators.find(c => c.id === planned.collaboratorId);
        const isFreela = !collaborator || collaborator.type === 'freela';

        const fv = allFunctionValues.find(f => f.functionId === planned.functionId);

        // Faixa B (slides 8 e 10: Nível B do cenotécnico, Tipo 2 do
        // percurseiro). rate_level = 'b' faz ler as colunas *_b em vez das
        // colunas normais; qualquer outro valor (incluindo nulo) usa a faixa
        // A, que é o comportamento de sempre.
        const useFaixaB = inc?.rateLevel === 'b';
        const fvDailyValue = useFaixaB ? fv?.dailyValueB : fv?.dailyValue;
        const fvDailyValueWeekend = useFaixaB ? fv?.dailyValueWeekendB : fv?.dailyValueWeekend;
        const fvDailyValueFreela = useFaixaB ? fv?.dailyValueFreelaB : fv?.dailyValueFreela;
        const fvDailyValueFreelaWeekend = useFaixaB ? fv?.dailyValueFreelaWeekendB : fv?.dailyValueFreelaWeekend;

        const dailyWd = isFreela
          ? (fvDailyValueFreela || D.dailyWdFreela)
          : (fvDailyValue || D.dailyWd);
        const dailyWe = isFreela
          ? (fvDailyValueFreelaWeekend || fvDailyValueFreela || D.dailyWeFreela)
          : (fvDailyValueWeekend || fvDailyValue || D.dailyWe);
        // Alimentação e mobilidade vinham EXCLUSIVAMENTE do default global —
        // as colunas correspondentes de function_values nunca eram lidas, o
        // que tornava impossível ter valor por função (ex.: a coluna
        // "Cenotécnica" do slide 7, com R$ 35 contra R$ 40 das demais).
        //
        // Agora o valor da função tem precedência e o default global é o
        // fallback. Zero conta como "não configurado" — é a mesma convenção já
        // usada acima para dailyValue, onde `fv?.dailyValue || D.dailyWd`
        // trata 0 como ausente. Manter a convenção evita que a mesma função se
        // comporte de um jeito na diária e de outro na alimentação.
        const prefer = (fromFunction: number | null | undefined, fallback: number) =>
          fromFunction && fromFunction > 0 ? fromFunction : fallback;

        // Mobilidade por trecho. Precedência:
        //   1. Se há horário de voo conhecido, vale a tabela por faixa de
        //      horário — ela é global e trata do traslado de aeroporto, que só
        //      existe quando há voo.
        //   2. Sem horário, cai no valor da função.
        //   3. Sem valor na função, no default global.
        const ticket = inc ? ticketByInclusion.get(inc.id) : null;

        // Ida: traslado até o aeroporto — vale o horário de PARTIDA do voo.
        const idaDepartureMin = toMinutes(ticket?.actualDepartureTime ?? inc?.flightDepartureSuggestedTime);
        // Chegada do voo de ida encarece o traslado no destino, quando conhecida.
        const idaArrivalMin = toMinutes(inc?.flightArrivalSuggestedTime);
        // Volta: o sistema registra a partida do voo de volta. Não há campo de
        // chegada em casa, então a janela "voo chegando" não é avaliável aqui.
        const voltaDepartureMin = toMinutes(ticket?.actualReturnTime ?? inc?.flightReturnSuggestedTime);

        const mobIdaBase   = prefer(fv?.mobility, isFreela ? D.mobIdaFreela : D.mobIda);
        const mobVoltaBase = prefer(fv?.transport, isFreela ? D.mobVoltaFreela : D.mobVolta);

        const mobIda = (idaDepartureMin === null && idaArrivalMin === null)
          ? mobIdaBase
          : ((idaDepartureMin !== null && inWindow(idaDepartureMin, depWinStart, depWinEnd)) ||
             (idaArrivalMin   !== null && inWindow(idaArrivalMin,   arrWinStart, arrWinEnd)))
            ? mobUnsocial
            : mobStandard;

        const mobVolta = voltaDepartureMin === null
          ? mobVoltaBase
          : inWindow(voltaDepartureMin, depWinStart, depWinEnd)
            ? mobUnsocial
            : mobStandard;
        const almSem   = prefer(fv?.weekdayLunch,  isFreela ? D.almSemFreela : D.almSem);
        const janSem   = prefer(fv?.weekdayDinner, isFreela ? D.janSemFreela : D.janSem);
        const almFds   = prefer(fv?.weekendLunch,  isFreela ? D.almFdsFreela : D.almFds);
        const janFds   = prefer(fv?.weekendDinner, isFreela ? D.janFdsFreela : D.janFds);

        // Percorre o período dia a dia aplicando, em cada um, a tarifa daquele
        // tipo de dia (útil ou fim de semana) e o fator de deflação da posição.
        // A deflação incide sobre diária e alimentação, que são por dia.
        let subtotalDiariasRaw = 0;
        let wdLunchRaw = 0, wdDinnerRaw = 0, weLunchRaw = 0, weDinnerRaw = 0;
        dayList.forEach((isWeekend, idx) => {
          const f = deflationFactor(idx + 1);
          if (isWeekend) {
            subtotalDiariasRaw += dailyWe * f;
            weLunchRaw  += almFds * f;
            weDinnerRaw += janFds * f;
          } else {
            subtotalDiariasRaw += dailyWd * f;
            wdLunchRaw  += almSem * f;
            wdDinnerRaw += janSem * f;
          }
        });

        const wdLunch   = Math.round(wdLunchRaw);
        const wdDinner  = Math.round(wdDinnerRaw);
        const weLunch   = Math.round(weLunchRaw);
        const weDinner  = Math.round(weDinnerRaw);
        const subtotalDiarias = Math.round(subtotalDiariasRaw);

        // Mobilidade não é por dia: são dois trechos (ida e volta),
        // independentes da duração. Um fator indexado por dia não tem leitura
        // natural aqui, então tratamos a ida como o dia 1 (sempre integral) e a
        // volta pelo fator do último dia do período.
        const lastDayFactor = dayList.length > 0 ? deflationFactor(dayList.length) : 1;
        const mobIdaDefl   = Math.round(mobIda * deflationFactor(1));
        const mobVoltaDefl = Math.round(mobVolta * lastDayFactor);
        const mobDefl      = mobIdaDefl + mobVoltaDefl;

        const costAssistance = mobDefl + wdLunch + wdDinner + weLunch + weDinner;
        const totalValue = subtotalDiarias + costAssistance;

        updates.push(storage.updateBudgetPlanned(planned.id, {
          dailyValue: dailyWd,
          weekdayLunch: wdLunch,
          weekdayDinner: wdDinner,
          weekendLunch: weLunch,
          weekendDinner: weDinner,
          mobilityIda: mobIdaDefl,
          mobilityVolta: mobVoltaDefl,
          mobility: mobDefl,
          costAssistance,
          totalValue,
        }));
      }

      await Promise.all(updates);
      res.json({ updated: updates.length });
    } catch (error) {
      console.error("Error applying defaults to planned:", error);
      res.status(500).json({ message: "Erro ao atualizar planejamentos" });
    }
  });

  // Retorna apenas os eventos que têm ao menos um budget_planned — evita carregar todos os registros no cliente
  app.get("/api/events-with-planned", async (req, res) => {
    try {
      const rows = await db.selectDistinct({ eventId: budgetPlannedTable.eventId }).from(budgetPlannedTable);
      const ids = rows.map(r => r.eventId).filter(Boolean) as string[];
      if (ids.length === 0) return res.json([]);
      const evts = await db.select().from(eventsTable).where(inArray(eventsTable.id, ids));
      res.json(evts);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar eventos com planejamento" });
    }
  });

  // Budget Planned (Planejado)
  app.get("/api/budget-planned", async (req, res) => {
    if (!(await requireFinancialRead(req, res))) return;
    try {
      const { eventId } = req.query;
      if (eventId) {
        const planned = await storage.getBudgetPlanned(eventId as string);
        res.json(planned);
      } else {
        const all = await storage.getAllBudgetPlanned();
        res.json(all);
      }
    } catch (error) {
      console.error("Error fetching budget planned:", error);
      res.status(500).json({ message: "Erro ao buscar planejamento" });
    }
  });

  app.get("/api/budget-planned/:id", async (req, res) => {
    if (!(await requireFinancialRead(req, res))) return;
    try {
      const planned = await storage.getBudgetPlannedById(req.params.id);
      if (!planned) {
        return res.status(404).json({ message: "Planejamento não encontrado" });
      }
      res.json(planned);
    } catch (error) {
      console.error("Error fetching budget planned:", error);
      res.status(500).json({ message: "Erro ao buscar planejamento" });
    }
  });

  app.post("/api/budget-planned", async (req, res) => {
    try {
      const data = insertBudgetPlannedSchema.parse(req.body);
      const planned = await storage.createBudgetPlanned(data);
      const actorId = req.session?.userId;
      const actor = actorId ? await storage.getUser(actorId) : null;
      await createAuditLog('create', 'budget_planned', planned.id, planned, actorId, actor?.name || 'Sistema', undefined, req);
      res.status(201).json(planned);
    } catch (error) {
      console.error("Error creating budget planned:", error);
      res.status(400).json({ message: "Erro ao criar planejamento" });
    }
  });

  app.patch("/api/budget-planned/:id", async (req, res) => {
    try {
      const prev = await storage.getBudgetPlannedById(req.params.id);
      const planned = await storage.updateBudgetPlanned(req.params.id, req.body);
      const actorId = req.session?.userId;
      const actor = actorId ? await storage.getUser(actorId) : null;
      await createAuditLog('update', 'budget_planned', req.params.id, planned, actorId, actor?.name || 'Sistema', prev, req);
      res.json(planned);
    } catch (error) {
      console.error("Error updating budget planned:", error);
      res.status(400).json({ message: "Erro ao atualizar planejamento" });
    }
  });

  app.delete("/api/budget-planned/:id", async (req, res) => {
    try {
      const prev = await storage.getBudgetPlannedById(req.params.id);
      const actorId = req.session?.userId;
      const actor = actorId ? await storage.getUser(actorId) : null;
      await storage.deleteBudgetPlanned(req.params.id);
      await createAuditLog('delete', 'budget_planned', req.params.id, prev, actorId, actor?.name || 'Sistema', undefined, req);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting budget planned:", error);
      res.status(500).json({ message: "Erro ao excluir planejamento" });
    }
  });

  app.post("/api/budget-planned/:id/toggle-not-attended", async (req, res) => {
    try {
      const { reason } = req.body as { reason?: string };
      const item = await storage.getBudgetPlannedById(req.params.id);
      if (!item) return res.status(404).json({ message: "Item não encontrado" });
      const toggled = !(item as any).didNotAttend;
      const updated = await storage.updateBudgetPlanned(req.params.id, {
        didNotAttend: toggled,
        didNotAttendReason: toggled ? (reason || null) : null,
      } as any);
      const actorId = req.session?.userId;
      const actor = actorId ? await storage.getUser(actorId) : null;
      await createAuditLog('update', 'budget_planned', req.params.id, updated, actorId, actor?.name || 'Sistema', item, req);
      res.json(updated);
    } catch (error) {
      console.error("Error toggling not-attended on planned:", error);
      res.status(400).json({ message: "Erro ao atualizar participação" });
    }
  });

  // Budget Actual (Realizado)
  app.get("/api/budget-actual", async (req, res) => {
    if (!(await requireFinancialRead(req, res))) return;
    try {
      const { eventId } = req.query;
      if (eventId) {
        const actual = await storage.getBudgetActual(eventId as string);
        res.json(actual);
      } else {
        const all = await storage.getAllBudgetActual();
        res.json(all);
      }
    } catch (error) {
      console.error("Error fetching budget actual:", error);
      res.status(500).json({ message: "Erro ao buscar realizado" });
    }
  });

  app.get("/api/budget-actual/:id", async (req, res) => {
    if (!(await requireFinancialRead(req, res))) return;
    try {
      const actual = await storage.getBudgetActualById(req.params.id);
      if (!actual) {
        return res.status(404).json({ message: "Realizado não encontrado" });
      }
      res.json(actual);
    } catch (error) {
      console.error("Error fetching budget actual:", error);
      res.status(500).json({ message: "Erro ao buscar realizado" });
    }
  });

  app.post("/api/budget-actual", async (req, res) => {
    try {
      const data = insertBudgetActualSchema.parse(req.body);
      const actual = await storage.createBudgetActual(data);
      const actorId = req.session?.userId || req.body.createdBy;
      const actor = actorId ? await storage.getUser(actorId) : null;
      await createAuditLog('create', 'budget_actual', actual.id, actual, actorId, actor?.name || 'Sistema', undefined, req);
      res.status(201).json(actual);
    } catch (error) {
      console.error("Error creating budget actual:", error);
      res.status(400).json({ message: "Erro ao criar realizado" });
    }
  });

  app.post("/api/budget-actual/duplicate-from-planned/:eventId", async (req, res) => {
    try {
      const { eventId } = req.params;
      const planned = await storage.getBudgetPlanned(eventId);
      const actorId = req.session?.userId || req.body.userId;
      const actor = actorId ? await storage.getUser(actorId) : null;

      // Carrega a forma de pagamento definida na escalação para copiar no
      // realizado. budget_actual não tem FK para team_inclusions — a ligação
      // possível é por (evento + colaborador + função). Copiamos o valor uma
      // vez, em vez de resolver esse join toda vez que a tela de Notas Fiscais
      // carrega, que além de custoso ficaria ambíguo com divisão de vaga.
      //
      // O trio não é único: em produção há 15 trios com mais de uma inclusão
      // (31 inclusões no total), tipicamente por divisão de vaga. Um Map simples
      // sobrescreveria e escolheria uma forma de pagamento arbitrária — errar
      // aqui manda alguém para a fila errada de pagamento.
      //
      // Por isso só propagamos quando as inclusões do trio CONCORDAM. Havendo
      // divergência, deixa nulo: a tela de Notas Fiscais trata nulo como "nf",
      // que é o fluxo atual, e alguém decide manualmente em vez de o sistema
      // escolher no escuro.
      const inclusions = await storage.getTeamInclusions();
      const methodsByKey = new Map<string, Set<string>>();
      for (const ti of inclusions) {
        const method = (ti as any).paymentMethod;
        if (!method || !ti.collaboratorId) continue;
        const key = `${ti.eventId}|${ti.collaboratorId}|${ti.functionId}`;
        const set = methodsByKey.get(key) ?? new Set<string>();
        set.add(method);
        methodsByKey.set(key, set);
      }
      const paymentMethodByKey = new Map<string, string>();
      for (const [key, methods] of Array.from(methodsByKey.entries())) {
        if (methods.size === 1) {
          paymentMethodByKey.set(key, Array.from(methods)[0]);
        } else {
          console.warn(`[PaymentMethod] Formas de pagamento divergentes em ${key} — deixando nulo para decisão manual`);
        }
      }

      const duplicated = await Promise.all(
        planned.map(async (p) => {
          const actualData = {
            plannedId: p.id,
            eventId: p.eventId,
            collaboratorId: p.collaboratorId,
            functionId: p.functionId,
            // Nulo quando a escalação é anterior a este campo — a tela de Notas
            // Fiscais trata nulo como "nf", mantendo o fluxo atual.
            paymentMethod: paymentMethodByKey.get(`${p.eventId}|${p.collaboratorId}|${p.functionId}`) ?? null,
            collaboratorType: p.collaboratorType,
            dailyQuantity: p.dailyQuantity,
            dailyValue: p.dailyValue,
            costAssistance: p.costAssistance,
            weekdayLunch: p.weekdayLunch,
            weekdayDinner: p.weekdayDinner,
            weekendLunch: p.weekendLunch,
            weekendDinner: p.weekendDinner,
            mobility: p.mobility,
            transport: p.transport,
            totalValue: p.totalValue,
            observations: p.observations,
            createdBy: req.body.userId,
          };
          return await storage.createBudgetActual(actualData);
        })
      );

      await createAuditLog('create', 'budget_actual', eventId, { eventId, count: duplicated.length }, actorId, actor?.name || 'Sistema', undefined, req);
      res.status(201).json(duplicated);
    } catch (error) {
      console.error("Error duplicating from planned:", error);
      res.status(400).json({ message: "Erro ao duplicar do planejado" });
    }
  });

  app.post("/api/budget-actual/:id/duplicate", async (req, res) => {
    if (!(await requireFinancialRead(req, res))) return;
    try {
      const original = await storage.getBudgetActualById(req.params.id);
      if (!original) {
        return res.status(404).json({ message: "Item não encontrado" });
      }
      const duplicateData = {
        plannedId: null,
        eventId: original.eventId,
        collaboratorId: original.collaboratorId,
        functionId: original.functionId,
        collaboratorType: original.collaboratorType,
        dailyQuantity: original.dailyQuantity,
        dailyValue: original.dailyValue,
        costAssistance: original.costAssistance,
        weekdayLunch: original.weekdayLunch,
        weekdayDinner: original.weekdayDinner,
        weekendLunch: original.weekendLunch,
        weekendDinner: original.weekendDinner,
        mobility: original.mobility,
        transport: original.transport,
        totalValue: original.totalValue,
        observations: "Duplicado no Realizado",
        createdBy: req.body.userId,
      };
      const duplicated = await storage.createBudgetActual(duplicateData);
      const actorId = req.session?.userId || req.body.userId;
      const actor = actorId ? await storage.getUser(actorId) : null;
      await createAuditLog('create', 'budget_actual', duplicated.id, duplicated, actorId, actor?.name || 'Sistema', undefined, req);
      res.status(201).json(duplicated);
    } catch (error) {
      console.error("Error duplicating budget actual:", error);
      res.status(400).json({ message: "Erro ao duplicar item" });
    }
  });

  // ── Split vacancy endpoint ────────────────────────────────────────────────
  app.post("/api/budget-actual/:id/split", async (req, res) => {
    if (!(await requireFinancialRead(req, res))) return;
    try {
      const parent = await storage.getBudgetActualById(req.params.id);
      if (!parent) return res.status(404).json({ message: "Item não encontrado" });

      const {
        collaboratorId, workedDays, parentWorkedDays, collaboratorType,
        mobility, weekdayLunch, weekdayDinner, weekendLunch, weekendDinner,
        dailyValue, dailyQuantity, totalValue,
      } = req.body;
      if (!collaboratorId || !Array.isArray(workedDays) || workedDays.length === 0) {
        return res.status(400).json({ message: "collaboratorId e workedDays são obrigatórios" });
      }

      // Accept pre-calculated values from frontend, or fall back to parent's values
      const childMobility = typeof mobility === 'number' ? mobility : (parent.mobility || 0);
      const childDailyValue = typeof dailyValue === 'number' ? dailyValue : parent.dailyValue;
      const childDailyQty = typeof dailyQuantity === 'number' ? dailyQuantity : workedDays.length;
      const childWeekdayLunch = typeof weekdayLunch === 'number' ? weekdayLunch : 0;
      const childWeekdayDinner = typeof weekdayDinner === 'number' ? weekdayDinner : 0;
      const childWeekendLunch = typeof weekendLunch === 'number' ? weekendLunch : 0;
      const childWeekendDinner = typeof weekendDinner === 'number' ? weekendDinner : 0;
      const childTotal = typeof totalValue === 'number' ? totalValue :
        (childDailyQty * childDailyValue + childWeekdayLunch + childWeekdayDinner + childWeekendLunch + childWeekendDinner + childMobility);

      // O cliente manda os totais já calculados e o servidor aceitava sem
      // conferir. O total precisa bater com os próprios componentes enviados —
      // é a mesma fórmula que a tela de Realizado usa. Sem isso, um total
      // arbitrário entra no lugar do valor devido.
      const childEsperado = childDailyQty * childDailyValue + childWeekdayLunch
        + childWeekdayDinner + childWeekendLunch + childWeekendDinner + childMobility;
      if (childTotal !== childEsperado) {
        return res.status(400).json({
          message: `Total da divisão não confere com os componentes: recebido ${childTotal}, esperado ${childEsperado} (em centavos).`,
        });
      }
      if (childTotal < 0) {
        return res.status(400).json({ message: "Total da divisão não pode ser negativo" });
      }

      const splitData = {
        splitParentId: parent.id,
        plannedId: parent.plannedId,
        eventId: parent.eventId,
        collaboratorId,
        functionId: parent.functionId,
        collaboratorType: collaboratorType || parent.collaboratorType,
        dailyQuantity: childDailyQty,
        dailyValue: childDailyValue,
        costAssistance: 0,
        weekdayLunch: childWeekdayLunch,
        weekdayDinner: childWeekdayDinner,
        weekendLunch: childWeekendLunch,
        weekendDinner: childWeekendDinner,
        mobility: childMobility,
        transport: 0,
        totalValue: childTotal,
        workedDays,
        observations: `Divisão de escalação — colaborador adicional`,
        createdBy: req.session?.userId || null,
      };

      const created = await storage.createBudgetActual(splitData as any);

      // Update parent's workedDays AND recalculate financial values for remaining days
      const remainingDays: string[] = Array.isArray(parentWorkedDays) ? parentWorkedDays : [];
      const { parentValues } = req.body;
      let parentUpdate: Record<string, unknown> = { workedDays: remainingDays };
      if (parentValues && typeof parentValues === 'object') {
        // Frontend sent pre-computed parent values for remaining days
        parentUpdate = {
          ...parentUpdate,
          weekdayLunch: parentValues.weekdayLunch ?? parent.weekdayLunch,
          weekdayDinner: parentValues.weekdayDinner ?? parent.weekdayDinner,
          weekendLunch: parentValues.weekendLunch ?? parent.weekendLunch,
          weekendDinner: parentValues.weekendDinner ?? parent.weekendDinner,
          mobility: parentValues.mobility ?? parent.mobility,
          dailyQuantity: parentValues.dailyQuantity ?? parent.dailyQuantity,
          totalValue: parentValues.totalValue ?? parent.totalValue,
        };
      }
      await storage.updateBudgetActual(parent.id, parentUpdate as any);

      const actorId = req.session?.userId;
      const actor = actorId ? await storage.getUser(actorId) : null;
      await createAuditLog('create', 'budget_actual', created.id, created, actorId, actor?.name || 'Sistema', undefined, req);

      res.status(201).json(created);
    } catch (error) {
      console.error("Error splitting budget actual:", error);
      res.status(400).json({ message: "Erro ao dividir vaga" });
    }
  });

  // Marca alguém como ausente e o tira do pagamento — exige estar autenticado.
  app.post("/api/budget-actual/:id/toggle-not-attended", async (req, res) => {
    if (!(await requireFinancialRead(req, res))) return;
    try {
      const { reason } = req.body as { reason?: string };
      const item = await storage.getBudgetActualById(req.params.id);
      if (!item) return res.status(404).json({ message: "Item não encontrado" });
      const toggled = !item.didNotAttend;
      const updated = await storage.updateBudgetActual(req.params.id, {
        didNotAttend: toggled,
        didNotAttendReason: toggled ? (reason || null) : null,
      } as any);
      const actorId = req.session?.userId;
      const actor = actorId ? await storage.getUser(actorId) : null;
      await createAuditLog('update', 'budget_actual', req.params.id, updated, actorId, actor?.name || 'Sistema', item, req);
      res.json(updated);
    } catch (error) {
      console.error("Error toggling not-attended:", error);
      res.status(400).json({ message: "Erro ao atualizar participação" });
    }
  });

  app.patch("/api/budget-actual/:id", async (req, res) => {
    try {
      const prev = await storage.getBudgetActualById(req.params.id);
      const actorId = req.session?.userId || req.body?._userId;
      const actor = actorId ? await storage.getUser(actorId) : null;
      const isRhAdmin = actor?.role === 'admin' || actor?.role === 'financial';

      // Track which monetary fields the RH changed
      const RH_FIELDS: Record<string, string> = {
        dailyValue: 'Diária',
        dailyQuantity: 'Qtd. Diárias',
        weekdayLunch: 'Almoço (Sem.)',
        weekdayDinner: 'Jantar (Sem.)',
        weekendLunch: 'Almoço (FdS)',
        weekendDinner: 'Jantar (FdS)',
        mobility: 'Mobilidade',
      };

      let updatePayload = { ...req.body };

      if (isRhAdmin && prev) {
        const existingFields: Record<string, {from: number; to: number; label: string}> =
          prev.rhAdjustedFields ? JSON.parse(prev.rhAdjustedFields) : {};

        let changed = false;
        for (const [field, label] of Object.entries(RH_FIELDS)) {
          const newVal = req.body[field];
          if (newVal === undefined) continue;
          const prevVal = (prev as any)[field] ?? 0;
          if (Number(newVal) !== Number(prevVal)) {
            existingFields[field] = { from: prevVal, to: Number(newVal), label };
            changed = true;
          }
        }

        if (changed) {
          updatePayload.rhAdjusted = true;
          updatePayload.rhAdjustedFields = JSON.stringify(existingFields);
        }
      }

      const actual = await storage.updateBudgetActual(req.params.id, updatePayload);
      await createAuditLog('update', 'budget_actual', req.params.id, actual, actorId, actor?.name || 'Sistema', prev, req);
      res.json(actual);
    } catch (error) {
      console.error("Error updating budget actual:", error);
      res.status(400).json({ message: "Erro ao atualizar realizado" });
    }
  });

  app.delete("/api/budget-actual/:id", async (req, res) => {
    try {
      const prev = await storage.getBudgetActualById(req.params.id);
      const actorId = req.session?.userId;
      const actor = actorId ? await storage.getUser(actorId) : null;
      await storage.deleteBudgetActual(req.params.id);
      await createAuditLog('delete', 'budget_actual', req.params.id, prev, actorId, actor?.name || 'Sistema', undefined, req);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting budget actual:", error);
      res.status(500).json({ message: "Erro ao excluir realizado" });
    }
  });

  app.post("/api/budget-actual/send-for-review", async (req, res) => {
    if (!(await requireFinancialRead(req, res))) return;
    try {
      const { eventId, itemIds } = req.body;
      if (!eventId) {
        return res.status(400).json({ message: "eventId é obrigatório" });
      }
      const items = await storage.getBudgetActual(eventId);
      const canSend = (i: any) => !i.sentForReview || i.rhStatus === 'devolvido' || i.rhStatus === 'rejeitado';
      const toUpdate = itemIds?.length
        ? items.filter((i: any) => itemIds.includes(i.id) && canSend(i))
        : items.filter(canSend);

      const actorId = req.session?.userId;
      const actor = actorId ? await storage.getUser(actorId) : null;

      for (const item of toUpdate) {
        const wasRejectedOrReturned = item.rhStatus === 'rejeitado' || item.rhStatus === 'devolvido';
        await storage.updateBudgetActual(item.id, {
          sentForReview: true,
          rhStatus: 'pendente',
          ...(wasRejectedOrReturned ? { resubmitted: true } : {}),
        });
      }

      await createAuditLog('send_review', 'budget_actual', eventId, { eventId, count: toUpdate.length }, actorId, actor?.name || 'Sistema', undefined, req);
      res.json({ updated: toUpdate.length });
    } catch (error) {
      console.error("Error sending for review:", error);
      res.status(500).json({ message: "Erro ao enviar para revisão" });
    }
  });

  // Budget Comparison (Comparativo)
  app.get("/api/budget-comparison", async (req, res) => {
    if (!(await requireFinancialRead(req, res))) return;
    try {
      const { eventId } = req.query;
      if (eventId) {
        const comparison = await storage.getBudgetComparison(eventId as string);
        res.json(comparison || null);
      } else {
        const all = await storage.getAllBudgetComparisons();
        res.json(all);
      }
    } catch (error) {
      console.error("Error fetching budget comparison:", error);
      res.status(500).json({ message: "Erro ao buscar comparativo" });
    }
  });

  app.post("/api/budget-comparison", async (req, res) => {
    if (!(await requireFinancialRead(req, res))) return;
    try {
      const data = insertBudgetComparisonSchema.parse(req.body);
      const comparison = await storage.createBudgetComparison(data);
      res.status(201).json(comparison);
    } catch (error) {
      console.error("Error creating budget comparison:", error);
      res.status(400).json({ message: "Erro ao criar comparativo" });
    }
  });

  app.post("/api/budget-comparison/calculate/:eventId", async (req, res) => {
    if (!(await requireFinancialRead(req, res))) return;
    try {
      const { eventId } = req.params;
      
      // Get planned and actual data
      const planned = await storage.getBudgetPlanned(eventId);
      const actual = await storage.getBudgetActual(eventId);
      
      // Calculate totals
      const totalPlanned = planned.reduce((sum, p) => sum + (p.totalValue || 0), 0);
      const totalActual = actual.reduce((sum, a) => sum + (a.totalValue || 0), 0);
      const variance = totalPlanned - totalActual;
      const variancePercent = totalPlanned > 0 
        ? ((variance / totalPlanned) * 100).toFixed(2) + '%'
        : '0%';
      
      // Generate changes log
      const changesLog = actual
        .filter(a => a.plannedId)
        .map(a => {
          const p = planned.find(pl => pl.id === a.plannedId);
          if (!p) return null;
          
          const changes: string[] = [];
          if (a.dailyQuantity !== p.dailyQuantity) changes.push(`Diárias: ${p.dailyQuantity} → ${a.dailyQuantity}`);
          if (a.dailyValue !== p.dailyValue) changes.push(`Valor diária: ${p.dailyValue} → ${a.dailyValue}`);
          if (a.totalValue !== p.totalValue) changes.push(`Total: ${p.totalValue} → ${a.totalValue}`);
          
          return changes.length > 0 ? { collaboratorId: a.collaboratorId, changes, reason: a.changeReason } : null;
        })
        .filter(Boolean);
      
      // Check if comparison exists
      let comparison = await storage.getBudgetComparison(eventId);
      
      if (comparison) {
        comparison = await storage.updateBudgetComparison(comparison.id, {
          totalPlanned,
          totalActual,
          variance,
          variancePercent,
          changesLog: JSON.stringify(changesLog),
        });
      } else {
        comparison = await storage.createBudgetComparison({
          eventId,
          totalPlanned,
          totalActual,
          variance,
          variancePercent,
          changesLog: JSON.stringify(changesLog),
          status: 'pendente',
        });
      }
      
      res.json(comparison);
    } catch (error) {
      console.error("Error calculating budget comparison:", error);
      res.status(400).json({ message: "Erro ao calcular comparativo" });
    }
  });

  app.patch("/api/budget-comparison/:id", async (req, res) => {
    if (!(await requireFinancialRead(req, res))) return;
    try {
      const comparison = await storage.updateBudgetComparison(req.params.id, req.body);
      res.json(comparison);
    } catch (error) {
      console.error("Error updating budget comparison:", error);
      res.status(400).json({ message: "Erro ao atualizar comparativo" });
    }
  });

  // approvedBy vinha do corpo nas três ações abaixo — passa a ser sempre quem
  // está na sessão, para ninguém aprovar em nome de outra pessoa.
  app.post("/api/budget-comparison/:id/approve", async (req, res) => {
    const actor = await requireFinancialWrite(req, res);
    if (!actor) return;
    try {
      const { approvalObservation } = req.body;
      const comparison = await storage.updateBudgetComparison(req.params.id, {
        status: 'aprovado',
        approvedBy: actor.id,
        approvalObservation,
        approvedAt: new Date(),
      });
      await createAuditLog('approve', 'budget_comparison', req.params.id, comparison, actor.id, actor.name || 'Sistema', undefined, req);
      res.json(comparison);
    } catch (error) {
      console.error("Error approving budget comparison:", error);
      res.status(400).json({ message: "Erro ao aprovar comparativo" });
    }
  });

  app.post("/api/budget-comparison/:id/reject", async (req, res) => {
    const actor = await requireFinancialWrite(req, res);
    if (!actor) return;
    try {
      const { rejectionReason } = req.body;
      const comparison = await storage.updateBudgetComparison(req.params.id, {
        status: 'rejeitado',
        approvedBy: actor.id,
        rejectionReason,
        approvedAt: new Date(),
      });
      await createAuditLog('reject', 'budget_comparison', req.params.id, comparison, actor.id, actor.name || 'Sistema', undefined, req);
      res.json(comparison);
    } catch (error) {
      console.error("Error rejecting budget comparison:", error);
      res.status(400).json({ message: "Erro ao rejeitar comparativo" });
    }
  });

  app.post("/api/budget-comparison/:id/return", async (req, res) => {
    const actor = await requireFinancialWrite(req, res);
    if (!actor) return;
    try {
      const { returnReason } = req.body;
      const comparison = await storage.updateBudgetComparison(req.params.id, {
        status: 'devolvido',
        approvedBy: actor.id,
        returnReason,
      });
      await createAuditLog('update', 'budget_comparison', req.params.id, comparison, actor.id, actor.name || 'Sistema', undefined, req);
      res.json(comparison);
    } catch (error) {
      console.error("Error returning budget comparison:", error);
      res.status(400).json({ message: "Erro ao devolver comparativo" });
    }
  });

  // ── Conta corrente Flash ───────────────────────────────────────────────────

  // Saldo e extrato são dado financeiro pessoal de 832 colaboradores. Exigir só
  // sessão deixaria qualquer usuário logado ver a conta de todo mundo, o que
  // não bate nem com a restrição do POST logo abaixo.
  const requireFlashAccess = async (req: any, res: any): Promise<boolean> => {
    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ message: "Não autenticado" });
      return false;
    }
    const currentUser = await storage.getUser(userId);
    const allowed = currentUser && ['admin', 'administrator', 'administrador', 'financial'].includes(currentUser.role);
    if (!allowed) {
      res.status(403).json({ message: "Apenas RH e administradores acessam a conta corrente" });
      return false;
    }
    return true;
  };

  // Saldos por colaborador. Saldo = SUM(amount) — nunca lido de coluna
  // materializada, para não divergir do extrato.
  app.get("/api/flash/balances", async (req, res) => {
    if (!(await requireFlashAccess(req, res))) return;
    try {
      const rows = await db
        .select({
          collaboratorId: flashLedgerEntries.collaboratorId,
          account: flashLedgerEntries.account,
          balance: drizzleSql<number>`sum(${flashLedgerEntries.amount})::int`,
          lastEntry: drizzleSql<string>`max(${flashLedgerEntries.referenceDate})`,
        })
        .from(flashLedgerEntries)
        .groupBy(flashLedgerEntries.collaboratorId, flashLedgerEntries.account);

      const byCollaborator = new Map<string, any>();
      for (const r of rows) {
        const entry = byCollaborator.get(r.collaboratorId) ?? {
          collaboratorId: r.collaboratorId,
          alimentacao: 0,
          mobilidade: 0,
          lastEntry: null as string | null,
        };
        if (r.account === "alimentacao") entry.alimentacao = Number(r.balance) || 0;
        if (r.account === "mobilidade") entry.mobilidade = Number(r.balance) || 0;
        if (!entry.lastEntry || (r.lastEntry && r.lastEntry > entry.lastEntry)) entry.lastEntry = r.lastEntry;
        byCollaborator.set(r.collaboratorId, entry);
      }
      return res.json(Array.from(byCollaborator.values()));
    } catch (error) {
      console.error("[Flash]Erro ao calcular saldos:", error);
      return res.status(500).json({ message: "Erro ao calcular saldos" });
    }
  });

  // Extrato de uma pessoa — equivalente à aba individual da planilha.
  app.get("/api/flash/statement/:collaboratorId", async (req, res) => {
    if (!(await requireFlashAccess(req, res))) return;
    try {
      const entries = await db
        .select()
        .from(flashLedgerEntries)
        .where(eq(flashLedgerEntries.collaboratorId, req.params.collaboratorId))
        .orderBy(flashLedgerEntries.referenceDate, flashLedgerEntries.createdAt);

      // Saldo corrente por conta, calculado na ordem do extrato — é a coluna
      // "Saldo" da planilha.
      const running: Record<string, number> = { alimentacao: 0, mobilidade: 0 };
      const withBalance = entries.map((e) => {
        running[e.account] = (running[e.account] ?? 0) + e.amount;
        return { ...e, balanceAfter: running[e.account] };
      });

      return res.json({
        entries: withBalance,
        balances: { alimentacao: running.alimentacao, mobilidade: running.mobilidade },
      });
    } catch (error) {
      console.error("[Flash]Erro ao montar extrato:", error);
      return res.status(500).json({ message: "Erro ao montar extrato" });
    }
  });

  // Lançamento manual: saldo de abertura, crédito complementar e ajustes.
  // Débito de evento não entra aqui — ele é derivado do realizado aprovado.
  app.post("/api/flash/entries", async (req, res) => {
    if (!(await requireFlashAccess(req, res))) return;
    try {
      const userId = req.session!.userId!;
      const currentUser = await storage.getUser(userId);

      const data = insertFlashLedgerEntrySchema.parse({ ...req.body, createdBy: userId });
      if (data.kind === "debito_evento") {
        return res.status(400).json({ message: "Débito de evento é lançado automaticamente na aprovação do realizado" });
      }

      const [created] = await db.insert(flashLedgerEntries).values({ ...data, budgetActualId: null } as any).returning();
      await createAuditLog('create', 'flash_ledger', created.id, created, userId, currentUser?.name, undefined, req);
      return res.status(201).json(created);
    } catch (error) {
      console.error("[Flash]Erro ao criar lançamento:", error);
      return res.status(400).json({ message: error instanceof Error ? error.message : "Dados inválidos" });
    }
  });

  app.post("/api/budget-actual/rh-action", async (req, res) => {
    // Esta é a rota que libera pagamento: marca rhStatus e, com isso, destrava
    // o envio da nota fiscal. Antes não checava nada e usava como identidade o
    // actionBy vindo do corpo — um POST anônimo aprovava lotes.
    const actor = await requireFinancialWrite(req, res);
    if (!actor) return;
    try {
      const { itemIds, action, comment } = req.body;
      if (!itemIds?.length || !action) {
        return res.status(400).json({ message: "Dados incompletos" });
      }
      if (!['aprovado', 'rejeitado', 'devolvido'].includes(action)) {
        return res.status(400).json({ message: "Ação inválida" });
      }

      // Quem aprovou é sempre quem está na sessão. O actionBy do corpo é
      // ignorado — era ele que permitia agir em nome de outra pessoa.
      const actionBy = actor.id;
      const actorId = actor.id;
      const results = [];
      for (const id of itemIds) {
        const updated = await storage.updateBudgetActual(id, {
          rhStatus: action,
          rhComment: comment || null,
          rhActionBy: actionBy,
          rhActionAt: new Date(),
          ...(action === 'devolvido' || action === 'rejeitado'
            ? { sentForReview: false }
            : {}),
        });
        results.push(updated);

        // Aprovar o realizado baixa alimentação e mobilidade na conta corrente
        // Flash. Falha aqui não derruba a aprovação: o RH não pode ficar
        // travado por causa do razão, e o lançamento pode ser refeito depois
        // sem duplicar (a restrição única cuida disso).
        if (action === 'aprovado') {
          try {
            await postFlashDebitsForActual(id, actorId);
          } catch (ledgerError) {
            console.error(`[Flash]Falha ao lançar débito do realizado ${id}:`, ledgerError);
          }
        }
      }

      const logAction = action === 'aprovado' ? 'approve' : action === 'rejeitado' ? 'reject' : 'update';
      await createAuditLog(logAction, 'budget_actual', itemIds[0], { itemIds, action, comment, count: results.length }, actorId, actor?.name || 'Sistema', undefined, req);
      res.json({ updated: results.length, items: results });
    } catch (error) {
      console.error("Error performing RH action:", error);
      res.status(400).json({ message: "Erro ao processar ação do RH" });
    }
  });

  // ─── System Settings ──────────────────────────────────────────────
  app.get("/api/system-settings", async (req, res) => {
    if (!(await requireFinancialRead(req, res))) return;
    try {
      const settings = await storage.getSystemSettings();
      const defaults: Record<string, number> = {
        default_mobility: 2500,
        default_weekday_lunch: 3500,
        default_weekday_dinner: 4000,
        default_weekend_lunch: 4000,
        default_weekend_dinner: 4500,
        default_daily_value: 5000,
        default_daily_value_weekday: 5000,
        default_daily_value_weekend: 5000,
        // Freela defaults (same as casa defaults when not set)
        default_daily_value_weekday_freela: 5000,
        default_daily_value_weekend_freela: 5000,
        default_mobility_ida_freela: 0,
        default_mobility_volta_freela: 0,
        default_weekday_lunch_freela: 3500,
        default_weekday_dinner_freela: 4000,
        default_weekend_lunch_freela: 4000,
        default_weekend_dinner_freela: 4500,
        // Deflação por faixa de dias (slide 7). Percentuais em centésimos de
        // ponto: 9000 = 90%. Editáveis para a regra mudar sem deploy.
        deflation_tier1_start_day: 5,
        deflation_tier2_start_day: 9,
        deflation_tier1_percent: 9000,
        deflation_tier2_percent: 8000,
        // Mobilidade por faixa de horário de voo (slides 7 e 9). Valores em
        // centavos; janelas em minutos desde a meia-noite, o que permite
        // expressar faixas que cruzam o dia com dois inteiros.
        mobility_leg_standard: 2900,            // R$ 29,00
        mobility_leg_unsocial: 5800,            // R$ 58,00
        mobility_departure_window_start: 1410,  // 23:30
        mobility_departure_window_end: 570,     // 09:30
        mobility_arrival_window_start: 1200,    // 20:00
        mobility_arrival_window_end: 300,       // 05:00
      };
      const result: Record<string, number> = { ...defaults };
      for (const s of settings) {
        result[s.key] = parseInt(s.value, 10);
      }
      res.json(result);
    } catch (error) {
      console.error("Error fetching system settings:", error);
      res.status(500).json({ message: "Erro ao buscar configurações" });
    }
  });

  app.put("/api/system-settings", async (req, res) => {
    // Antes aceitava _userId do corpo para autorizar, mas gravava a auditoria
    // com req.session.userId — quem usava o bypass alterava os defaults do
    // cálculo sem deixar autor registrado.
    const user = await requireFinancialWrite(req, res);
    if (!user) return;
    const userId = user.id;

    try {
      const allowed = [
        "default_mobility", "default_mobility_ida", "default_mobility_volta",
        "default_weekday_lunch", "default_weekday_dinner", "default_weekend_lunch", "default_weekend_dinner",
        "default_daily_value", "default_daily_value_weekday", "default_daily_value_weekend",
        // Freela-specific keys
        "default_daily_value_weekday_freela", "default_daily_value_weekend_freela",
        "default_mobility_ida_freela", "default_mobility_volta_freela",
        "default_weekday_lunch_freela", "default_weekday_dinner_freela",
        "default_weekend_lunch_freela", "default_weekend_dinner_freela",
      ];

      // Regra de deflação — dias são inteiros e percentuais vêm em centésimos
      // de ponto (9000 = 90%), então não passam pelo × 100 dos valores
      // monetários. Ficam editáveis para a regra poder mudar sem deploy.
      const allowedRaw = [
        "deflation_tier1_start_day", "deflation_tier2_start_day",
        "deflation_tier1_percent", "deflation_tier2_percent",
        "mobility_leg_standard", "mobility_leg_unsocial",
        "mobility_departure_window_start", "mobility_departure_window_end",
        "mobility_arrival_window_start", "mobility_arrival_window_end",
      ];
      for (const key of allowedRaw) {
        if (req.body[key] === undefined) continue;
        const num = Number(String(req.body[key]).trim().replace(',', '.'));
        if (!Number.isFinite(num) || num < 0) {
          return res.status(400).json({ message: `Valor inválido para ${key}: informe um número não negativo.` });
        }
        if (key.endsWith("_percent") && num > 10000) {
          return res.status(400).json({ message: `${key} não pode passar de 10000 (100%).` });
        }
        if (key.endsWith("_start_day") && num < 1) {
          return res.status(400).json({ message: `${key} precisa ser pelo menos 1 (primeiro dia da faixa).` });
        }
        // Janelas são minutos desde a meia-noite: 0 (00:00) é válido, 1440 não.
        if (key.includes("_window_") && num > 1439) {
          return res.status(400).json({ message: `${key} precisa estar entre 0 e 1439 (minutos desde a meia-noite).` });
        }
        await storage.upsertSystemSetting(key, String(Math.round(num)), userId);
      }
      for (const key of allowed) {
        if (req.body[key] === undefined) continue;
        // parseFloat aceitava "abc" e gravava a string "NaN" no banco, além de
        // deixar passar negativo e notação científica. Estes são os defaults de
        // todo o cálculo — um valor inválido aqui contamina o sistema inteiro.
        const raw = req.body[key];
        const num = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(',', '.'));
        if (!Number.isFinite(num) || num < 0) {
          return res.status(400).json({ message: `Valor inválido para ${key}: informe um número não negativo.` });
        }
        await storage.upsertSystemSetting(key, String(Math.round(num * 100)), userId);
      }
      await createAuditLog('update', 'system_settings', 'global', req.body, userId, user.name || 'Sistema', undefined, req);
      res.json({ message: "Configurações salvas com sucesso" });
    } catch (error) {
      console.error("Error updating system settings:", error);
      res.status(500).json({ message: "Erro ao salvar configurações" });
    }
  });

  // ── Invoices (Notas Fiscais) ──────────────────────────────────────────────

  app.get("/api/invoices", async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Não autenticado" });
    try {
      const eventId = req.query.eventId as string | undefined;
      const result = await storage.getInvoices(eventId);
      res.json(result);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res.status(500).json({ message: "Erro ao buscar notas fiscais" });
    }
  });

  // Helper: append an event to the stored history JSON of an invoice
  async function appendHistory(invoiceId: string, event: Record<string, any>): Promise<string> {
    const existing = await storage.getInvoice(invoiceId);
    let arr: any[] = [];
    try { arr = JSON.parse(existing?.history || "[]"); } catch { arr = []; }
    arr.push({ ...event, at: new Date().toISOString() });
    return JSON.stringify(arr);
  }

  // Slide 5 do deck: lançamentos que compartilham a mesma OC precisam ter a
  // mesma nota anexada. Uma OC é uma ordem de compra só — se ela cobre várias
  // pessoas, o documento fiscal é o mesmo para todas. Divergir aí significa
  // nota errada anexada em alguém.
  //
  // A comparação é pelo nome do arquivo, que é o que o usuário enxerga. Escopo:
  // dentro do mesmo evento, que é como a tela apresenta os lançamentos.
  // Devolve mensagem de erro, ou null se estiver tudo certo.
  async function validateOcAttachment(
    eventId: string,
    oc: string | null | undefined,
    attachmentName: string | null | undefined,
    ignoreInvoiceId?: string,
  ): Promise<string | null> {
    const ocTrim = (oc || "").trim();
    if (!ocTrim) return null; // sem OC não há o que comparar

    const sameEvent = await storage.getInvoices(eventId);
    const sameOc = sameEvent.filter(
      (inv) => inv.id !== ignoreInvoiceId && (inv.oc || "").trim().toLowerCase() === ocTrim.toLowerCase() && (inv.attachmentName || "").trim() !== "",
    );
    if (sameOc.length === 0) return null;

    const existingName = (sameOc[0].attachmentName || "").trim();
    const incomingName = (attachmentName || "").trim();
    if (!incomingName) {
      return `A OC ${ocTrim} já foi usada em outro lançamento com a nota "${existingName}". Anexe a mesma nota.`;
    }
    if (incomingName.toLowerCase() !== existingName.toLowerCase()) {
      return `A OC ${ocTrim} já está vinculada à nota "${existingName}". Lançamentos com a mesma OC precisam ter a mesma nota anexada — verifique se a OC ou o arquivo estão corretos.`;
    }
    return null;
  }

  app.post("/api/invoices", async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Não autenticado" });
    try {
      const data = insertInvoiceSchema.parse(req.body);

      // Pagamento via Caju não tem nota nem OC — a regra não se aplica.
      if (data.status !== "pago_caju") {
        const ocError = await validateOcAttachment(data.eventId, data.oc, data.attachmentName);
        if (ocError) return res.status(409).json({ message: ocError });
      }

      const firstEvent = { type: "enviado", oc: data.oc || null, attachmentName: data.attachmentName || null, at: new Date().toISOString() };
      const invoice = await storage.createInvoice({ ...data, history: JSON.stringify([firstEvent]) });
      res.json(invoice);
    } catch (error) {
      console.error("Error creating invoice:", error);
      res.status(500).json({ message: "Erro ao criar nota fiscal" });
    }
  });

  app.patch("/api/invoices/:id", async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Não autenticado" });
    try {
      const body = req.body;

      // Mesma regra de OC × nota do POST, agora no reenvio. Só checa quando a
      // OC ou o anexo estão sendo mexidos — um PATCH de check-in ou de data de
      // pagamento não precisa revalidar.
      if (body.status !== "pago_caju" && (body.oc !== undefined || body.attachmentName !== undefined)) {
        const current = await storage.getInvoice(req.params.id);
        if (current) {
          const ocError = await validateOcAttachment(
            current.eventId,
            body.oc !== undefined ? body.oc : current.oc,
            body.attachmentName !== undefined ? body.attachmentName : current.attachmentName,
            req.params.id,
          );
          if (ocError) return res.status(409).json({ message: ocError });
        }
      }

      let historyStr: string | undefined;
      // If resubmitting (setting status back to enviada), record a "reenviado" event
      if (body.status === "enviada") {
        historyStr = await appendHistory(req.params.id, {
          type: "reenviado",
          oc: body.oc || null,
          attachmentName: body.attachmentName || null,
        });
      }
      // If setting paymentDate (check-in), record a "checkin" event
      if (body.paymentDate && !body.status) {
        historyStr = await appendHistory(req.params.id, {
          type: "checkin",
          paymentDate: body.paymentDate,
        });
      }
      const invoice = await storage.updateInvoice(req.params.id, {
        ...body,
        ...(historyStr !== undefined ? { history: historyStr } : {}),
      });
      res.json(invoice);
    } catch (error) {
      console.error("Error updating invoice:", error);
      res.status(500).json({ message: "Erro ao atualizar nota fiscal" });
    }
  });

  app.post("/api/invoices/:id/approve", async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Não autenticado" });
    const user = await storage.getUser(req.session.userId);
    if (!user || (user.role !== "admin" && user.role !== "financial")) {
      return res.status(403).json({ message: "Sem permissão" });
    }
    try {
      const { paymentDate } = req.body;
      const historyStr = await appendHistory(req.params.id, { type: "aprovado" });
      const invoice = await storage.updateInvoice(req.params.id, {
        status: "aprovada",
        ...(paymentDate ? { paymentDate } : {}),
        approvedAt: new Date(),
        returnComment: null,
        history: historyStr,
      });
      res.json(invoice);
    } catch (error) {
      console.error("Error approving invoice:", error);
      res.status(500).json({ message: "Erro ao aprovar nota fiscal" });
    }
  });

  app.post("/api/invoices/:id/return", async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Não autenticado" });
    const user = await storage.getUser(req.session.userId);
    if (!user || (user.role !== "admin" && user.role !== "financial")) {
      return res.status(403).json({ message: "Sem permissão" });
    }
    try {
      const { comment } = req.body;
      const historyStr = await appendHistory(req.params.id, { type: "devolvido", comment: comment || null });
      const invoice = await storage.updateInvoice(req.params.id, {
        status: "devolvida",
        returnComment: comment ?? null,
        history: historyStr,
      });
      res.json(invoice);
    } catch (error) {
      console.error("Error returning invoice:", error);
      res.status(500).json({ message: "Erro ao devolver nota fiscal" });
    }
  });

  app.post("/api/invoices/:id/reject", async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Não autenticado" });
    const user = await storage.getUser(req.session.userId);
    if (!user || (user.role !== "admin" && user.role !== "financial")) {
      return res.status(403).json({ message: "Sem permissão" });
    }
    try {
      const { comment } = req.body;
      const invoice = await storage.updateInvoice(req.params.id, {
        status: "recusada",
        returnComment: comment ?? null,
      });
      res.json(invoice);
    } catch (error) {
      console.error("Error rejecting invoice:", error);
      res.status(500).json({ message: "Erro ao recusar nota fiscal" });
    }
  });

  app.post("/api/invoices/:id/checkin", async (req, res) => {
    const actorId = req.session?.userId || req.body?._userId;
    if (!actorId) return res.status(401).json({ message: "Não autenticado" });
    const user = await storage.getUser(actorId);
    if (!user || (user.role !== "admin" && user.role !== "financial")) {
      return res.status(403).json({ message: "Sem permissão" });
    }
    try {
      const { paymentDate } = req.body;
      const invoice = await storage.updateInvoice(req.params.id, {
        checkinAt: new Date(),
        checkinBy: actorId,
        ...(paymentDate ? { paymentDate } : {}),
      });
      res.json(invoice);
    } catch (error) {
      console.error("Error doing financial checkin:", error);
      res.status(500).json({ message: "Erro ao fazer check-in financeiro" });
    }
  });

  // Payment Companies
  app.get("/api/payment-companies", async (req, res) => {
    const userId = req.session.userId || req.body?._userId;
    if (!userId) return res.status(401).json({ message: "Não autenticado" });
    try {
      const companies = await storage.getPaymentCompanies();
      res.json(companies);
    } catch (error) {
      console.error("Error fetching payment companies:", error);
      res.status(500).json({ message: "Erro ao buscar empresas" });
    }
  });

  app.post("/api/payment-companies", async (req, res) => {
    const userId = req.session.userId || req.body?._userId;
    if (!userId) return res.status(401).json({ message: "Não autenticado" });
    try {
      const { name, cnpj } = req.body;
      if (!name || !cnpj) return res.status(400).json({ message: "Nome e CNPJ são obrigatórios" });
      const company = await storage.createPaymentCompany({ name, cnpj });
      res.status(201).json(company);
    } catch (error) {
      console.error("Error creating payment company:", error);
      res.status(500).json({ message: "Erro ao criar empresa" });
    }
  });

  app.delete("/api/payment-companies/:id", async (req, res) => {
    const userId = req.session.userId || req.body?._userId;
    if (!userId) return res.status(401).json({ message: "Não autenticado" });
    const user = await storage.getUser(userId);
    if (!user || !["admin"].includes(user.role)) return res.status(403).json({ message: "Sem permissão" });
    try {
      await storage.deletePaymentCompany(Number(req.params.id));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting payment company:", error);
      res.status(500).json({ message: "Erro ao excluir empresa" });
    }
  });

  // ─── Budget Notes (Chat de Auditoria) ───────────────────────────────────────

  // GET /api/budget-notes?entityType=X&entityId=Y
  app.get("/api/budget-notes", async (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ message: "Não autenticado" });
    const { entityType, entityId } = req.query as Record<string, string>;
    if (!entityType || !entityId) return res.status(400).json({ message: "entityType e entityId obrigatórios" });
    try {
      const notes = await db
        .select()
        .from(budgetNotes)
        .where(and(eq(budgetNotes.entityType, entityType), eq(budgetNotes.entityId, entityId)))
        .orderBy(budgetNotes.createdAt);
      res.json(notes);
    } catch (error) {
      console.error("Error fetching budget notes:", error);
      res.status(500).json({ message: "Erro ao buscar observações" });
    }
  });

  // POST /api/budget-notes
  app.post("/api/budget-notes", async (req, res) => {
    const userId = req.session.userId || req.body?._userId;
    if (!userId) return res.status(401).json({ message: "Não autenticado" });
    const user = await storage.getUser(userId);
    if (!user) return res.status(401).json({ message: "Usuário não encontrado" });
    const parsed = insertBudgetNoteSchema.safeParse({
      ...req.body,
      authorId: userId,
      authorName: user.name,
    });
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.flatten() });
    try {
      const [note] = await db.insert(budgetNotes).values(parsed.data).returning();

      // Se nota em budget_planned que já foi enviado → log automático pós-planejamento
      if (parsed.data.entityType === 'planned') {
        try {
          const sentCheck = await db.execute(drizzleSql`
            SELECT id FROM budget_actual WHERE planned_id = ${parsed.data.entityId} LIMIT 1`
          );
          const rows = Array.isArray(sentCheck) ? sentCheck : (sentCheck as any).rows || [];
          if (rows.length > 0) {
            await storage.createSystemLog({
              action: 'note',
              entityType: 'budget_planned',
              entityId: parsed.data.entityId,
              entityName: user.name,
              details: `Nota adicionada pós-planejamento por ${user.name}`,
              userId,
              userName: user.name,
              previousData: null,
              newData: JSON.stringify({ content: parsed.data.content }),
            });
          }
        } catch (_) {}
      }

      res.status(201).json(note);
    } catch (error) {
      console.error("Error creating budget note:", error);
      res.status(500).json({ message: "Erro ao criar observação" });
    }
  });

  // GET /api/budget-notes/by-event?entityType=actual|planned&eventId=X
  app.get("/api/budget-notes/by-event", async (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ message: "Não autenticado" });
    const { entityType, eventId } = req.query as Record<string, string>;
    if (!entityType || !eventId) return res.status(400).json({ message: "entityType e eventId obrigatórios" });
    try {
      let result: any;
      if (entityType === "actual") {
        result = await db.execute(drizzleSql`
          SELECT bn.* FROM budget_notes bn
          JOIN budget_actual ba ON bn.entity_id = ba.id
          WHERE bn.entity_type = 'actual' AND ba.event_id = ${eventId}
          ORDER BY bn.created_at DESC`
        );
      } else if (entityType === "planned") {
        result = await db.execute(drizzleSql`
          SELECT bn.* FROM budget_notes bn
          JOIN budget_planned bp ON bn.entity_id = bp.id
          WHERE bn.entity_type = 'planned' AND bp.event_id = ${eventId}
          ORDER BY bn.created_at DESC`
        );
      } else {
        return res.json([]);
      }
      const notes = Array.isArray(result) ? result : (result as any).rows || [];
      res.json(notes);
    } catch (error) {
      console.error("Error fetching event budget notes:", error);
      res.status(500).json({ message: "Erro ao buscar observações do evento" });
    }
  });

  // ── Activity Logs (Histórico por entidade) ──

  // GET /api/activity-logs?entityType=budget_planned|budget_actual&entityId=X
  app.get("/api/activity-logs", async (req, res) => {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ message: "Não autenticado" });
    const { entityType, entityId } = req.query as Record<string, string>;
    if (!entityType || !entityId) return res.status(400).json({ message: "entityType e entityId obrigatórios" });
    try {
      const result = await db.execute(drizzleSql`
        SELECT id, action, entity_type, entity_id, entity_name, details,
               previous_data, new_data, user_id, user_name, created_at
        FROM system_logs
        WHERE entity_type = ${entityType} AND entity_id = ${entityId}
        ORDER BY created_at DESC
        LIMIT 100`
      );
      const logs = Array.isArray(result) ? result : (result as any).rows || [];
      res.json(logs);
    } catch (error) {
      console.error("Error fetching activity logs:", error);
      res.status(500).json({ message: "Erro ao buscar histórico" });
    }
  });

  // GET /api/activity-logs/by-event?entityType=budget_planned|budget_actual&eventId=X
  app.get("/api/activity-logs/by-event", async (req, res) => {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ message: "Não autenticado" });
    const { entityType, eventId } = req.query as Record<string, string>;
    if (!entityType || !eventId) return res.status(400).json({ message: "entityType e eventId obrigatórios" });
    try {
      let result: any;
      if (entityType === "budget_planned") {
        result = await db.execute(drizzleSql`
          SELECT sl.id, sl.action, sl.entity_type, sl.entity_id, sl.entity_name,
                 sl.details, sl.previous_data, sl.new_data, sl.user_id, sl.user_name, sl.created_at
          FROM system_logs sl
          JOIN budget_planned bp ON sl.entity_id = bp.id
          WHERE sl.entity_type = 'budget_planned' AND bp.event_id = ${eventId}
          ORDER BY sl.created_at DESC`
        );
      } else if (entityType === "budget_actual") {
        result = await db.execute(drizzleSql`
          SELECT sl.id, sl.action, sl.entity_type, sl.entity_id, sl.entity_name,
                 sl.details, sl.previous_data, sl.new_data, sl.user_id, sl.user_name, sl.created_at
          FROM system_logs sl
          JOIN budget_actual ba ON sl.entity_id = ba.id
          WHERE sl.entity_type = 'budget_actual' AND ba.event_id = ${eventId}
          ORDER BY sl.created_at DESC`
        );
      } else {
        return res.json([]);
      }
      const logs = Array.isArray(result) ? result : (result as any).rows || [];
      res.json(logs);
    } catch (error) {
      console.error("Error fetching event activity logs:", error);
      res.status(500).json({ message: "Erro ao buscar histórico do evento" });
    }
  });

  // ─── Swap Requests (Solicitações de Troca de Colaborador) ─────────────────

  // Criar tabela se não existir (migration inline)
  app.get("/api/swap-requests", async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Não autenticado" });
    try {
      const rows = await db.execute(drizzleSql`
        SELECT sr.*, 
               cc.full_name as current_collaborator_name,
               nc.full_name as new_collaborator_name,
               ti.status as inclusion_status,
               ti.deleted_at as inclusion_deleted_at
        FROM swap_requests sr
        LEFT JOIN collaborators cc ON sr.current_collaborator_id = cc.id
        LEFT JOIN collaborators nc ON sr.new_collaborator_id = nc.id
        LEFT JOIN team_inclusions ti ON sr.team_inclusion_id = ti.id
        ORDER BY sr.created_at DESC
      `);
      res.json((rows as any).rows ?? rows);
    } catch (error) {
      console.error("Error fetching swap requests:", error);
      res.status(500).json({ message: "Erro ao buscar solicitações de troca" });
    }
  });

  app.get("/api/swap-requests/inclusion/:teamInclusionId", async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Não autenticado" });
    const { teamInclusionId } = req.params;
    try {
      const rows = await db.execute(drizzleSql`
        SELECT sr.*, 
               cc.full_name as current_collaborator_name,
               nc.full_name as new_collaborator_name
        FROM swap_requests sr
        LEFT JOIN collaborators cc ON sr.current_collaborator_id = cc.id
        LEFT JOIN collaborators nc ON sr.new_collaborator_id = nc.id
        WHERE sr.team_inclusion_id = ${teamInclusionId}
        ORDER BY sr.created_at DESC
      `);
      res.json((rows as any).rows ?? rows);
    } catch (error) {
      console.error("Error fetching swap requests for inclusion:", error);
      res.status(500).json({ message: "Erro ao buscar solicitações de troca" });
    }
  });

  app.post("/api/swap-requests", async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Não autenticado" });
    const currentUser = await storage.getUser(req.session.userId);
    if (!currentUser) return res.status(401).json({ message: "Usuário não encontrado" });

    const { teamInclusionId, newCollaboratorId, reason } = req.body;
    if (!teamInclusionId || !newCollaboratorId || !reason?.trim()) {
      return res.status(400).json({ message: "Campos obrigatórios: teamInclusionId, newCollaboratorId, reason" });
    }

    // Verificar se já existe solicitação pendente para essa inclusão
    const existing = await db.execute(drizzleSql`
      SELECT id FROM swap_requests WHERE team_inclusion_id = ${teamInclusionId} AND status = 'pendente'
    `);
    const existingRows = (existing as any).rows ?? existing;
    if (existingRows.length > 0) {
      return res.status(409).json({ message: "Já existe uma solicitação de troca pendente para esta escalação" });
    }

    // Buscar inclusão para pegar o colaborador atual
    const inclusionRows = await db.execute(drizzleSql`
      SELECT collaborator_id FROM team_inclusions WHERE id = ${teamInclusionId}
    `);
    const inclRows = (inclusionRows as any).rows ?? inclusionRows;
    const currentCollaboratorId = inclRows[0]?.collaborator_id ?? null;

    try {
      const result = await db.execute(drizzleSql`
        INSERT INTO swap_requests (team_inclusion_id, requested_by, requested_by_name, current_collaborator_id, new_collaborator_id, reason, status)
        VALUES (${teamInclusionId}, ${currentUser.id}, ${currentUser.name}, ${currentCollaboratorId}, ${newCollaboratorId}, ${reason.trim()}, 'pendente')
        RETURNING *
      `);
      const row = ((result as any).rows ?? result)[0];
      res.status(201).json(row);
    } catch (error) {
      console.error("Error creating swap request:", error);
      res.status(500).json({ message: "Erro ao criar solicitação de troca" });
    }
  });

  app.patch("/api/swap-requests/:id/approve", async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Não autenticado" });
    const currentUser = await storage.getUser(req.session.userId);
    if (!currentUser) return res.status(401).json({ message: "Usuário não encontrado" });

    const isAdminOrPurchasing = ['admin', 'administrator', 'administrador', 'purchasing'].includes(currentUser.role);
    if (!isAdminOrPurchasing) return res.status(403).json({ message: "Sem permissão" });

    const { id } = req.params;
    const { reviewComment } = req.body;

    try {
      // Buscar o swap request
      const srRows = await db.execute(drizzleSql`SELECT * FROM swap_requests WHERE id = ${id}`);
      const sr = ((srRows as any).rows ?? srRows)[0];
      if (!sr) return res.status(404).json({ message: "Solicitação não encontrada" });
      if (sr.status !== 'pendente') return res.status(400).json({ message: "Solicitação não está pendente" });

      // Atualizar colaborador na team_inclusion
      await db.execute(drizzleSql`
        UPDATE team_inclusions SET collaborator_id = ${sr.new_collaborator_id}, updated_at = NOW() WHERE id = ${sr.team_inclusion_id}
      `);

      // Marcar swap request como aprovado
      await db.execute(drizzleSql`
        UPDATE swap_requests SET status = 'aprovado', reviewed_by = ${currentUser.id}, reviewed_by_name = ${currentUser.name}, review_comment = ${reviewComment ?? null}, reviewed_at = NOW()
        WHERE id = ${id}
      `);

      res.json({ message: "Troca aprovada com sucesso" });
    } catch (error) {
      console.error("Error approving swap request:", error);
      res.status(500).json({ message: "Erro ao aprovar troca" });
    }
  });

  app.patch("/api/swap-requests/:id/reject", async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Não autenticado" });
    const currentUser = await storage.getUser(req.session.userId);
    if (!currentUser) return res.status(401).json({ message: "Usuário não encontrado" });

    const isAdminOrPurchasing = ['admin', 'administrator', 'administrador', 'purchasing'].includes(currentUser.role);
    if (!isAdminOrPurchasing) return res.status(403).json({ message: "Sem permissão" });

    const { id } = req.params;
    const { reviewComment } = req.body;
    if (!reviewComment?.trim()) return res.status(400).json({ message: "Motivo da rejeição é obrigatório" });

    try {
      const srRows = await db.execute(drizzleSql`SELECT * FROM swap_requests WHERE id = ${id}`);
      const sr = ((srRows as any).rows ?? srRows)[0];
      if (!sr) return res.status(404).json({ message: "Solicitação não encontrada" });
      if (sr.status !== 'pendente') return res.status(400).json({ message: "Solicitação não está pendente" });

      await db.execute(drizzleSql`
        UPDATE swap_requests SET status = 'rejeitado', reviewed_by = ${currentUser.id}, reviewed_by_name = ${currentUser.name}, review_comment = ${reviewComment.trim()}, reviewed_at = NOW()
        WHERE id = ${id}
      `);

      res.json({ message: "Troca rejeitada" });
    } catch (error) {
      console.error("Error rejecting swap request:", error);
      res.status(500).json({ message: "Erro ao rejeitar troca" });
    }
  });

  app.patch("/api/swap-requests/:id/cancel", async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Não autenticado" });
    const currentUser = await storage.getUser(req.session.userId);
    if (!currentUser) return res.status(401).json({ message: "Usuário não encontrado" });

    const { id } = req.params;
    try {
      const srRows = await db.execute(drizzleSql`SELECT * FROM swap_requests WHERE id = ${id}`);
      const sr = ((srRows as any).rows ?? srRows)[0];
      if (!sr) return res.status(404).json({ message: "Solicitação não encontrada" });
      if (sr.status !== 'pendente') return res.status(400).json({ message: "Solicitação não está pendente" });

      const isAdminOrPurchasing = ['admin', 'administrator', 'administrador', 'purchasing'].includes(currentUser.role);
      const isRequester = sr.requested_by === currentUser.id;
      if (!isAdminOrPurchasing && !isRequester) return res.status(403).json({ message: "Sem permissão para cancelar" });

      await db.execute(drizzleSql`
        UPDATE swap_requests SET status = 'cancelado', reviewed_by = ${currentUser.id}, reviewed_by_name = ${currentUser.name}, reviewed_at = NOW()
        WHERE id = ${id}
      `);

      res.json({ message: "Solicitação cancelada" });
    } catch (error) {
      console.error("Error cancelling swap request:", error);
      res.status(500).json({ message: "Erro ao cancelar solicitação" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
