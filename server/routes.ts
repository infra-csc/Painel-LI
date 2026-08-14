import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { z } from "zod";
import { storage } from "./storage";
import { db } from "./db";
import { budgetNotes, functionManagers as functionManagersTable, budgetPlanned as budgetPlannedTable, events as eventsTable, swapRequests as swapRequestsTable, teamInclusions as teamInclusionsTable, collaborators as collaboratorsTable } from "@shared/schema";
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
  insertFlashMovementSchema,
  insertBudgetNoteSchema,
  insertSwapRequestSchema
} from "@shared/schema";
import { isFinanceRole, normalizeRole, ROLE_GROUPS, type CanonicalRole } from "@shared/roles";
import {
  isNfEligible, podeDecidirPrestacao, podeEnviarParaRevisao,
  prestacaoEstaTravada, podeAprovarNota, podeDevolverNota, podeFazerCheckin,
} from "@shared/prestacao-rules";
import { isAtendimentoFunction } from "@shared/atendimento";
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

// Tipos aceitos nos uploads: documentos (CPF/RG, passagens, notas) e imagens.
// Executáveis/scripts são rejeitados — o app nunca precisa deles e aceitá-los
// aumenta a superfície de ataque sem ganho algum.
const ALLOWED_UPLOAD_MIMES = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv', 'text/plain',
]);

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_UPLOAD_MIMES.has(file.mimetype)) return cb(null, true);
    cb(new Error(`Tipo de arquivo não permitido: ${file.mimetype}`));
  }
});

export async function registerRoutes(app: Express): Promise<Server> {

  // ── Autorização por papel ─────────────────────────────────────────────────
  // A autenticação é garantida pelo middleware global de server/index.ts (toda
  // rota /api exige sessão, exceto /api/auth, /api/integration e /api/portal).
  // Estes helpers cuidam da AUTORIZAÇÃO: quem, entre os autenticados, pode agir.
  // A identidade vem sempre da sessão — nunca do corpo da requisição.
  const requireRoles = async (req: any, res: any, roles: readonly CanonicalRole[]) => {
    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ message: "Não autenticado" });
      return null;
    }
    const user = await storage.getUser(userId);
    const role = normalizeRole(user?.role);
    if (!user || !role || !roles.includes(role)) {
      res.status(403).json({ message: "Sem permissão para esta ação" });
      return null;
    }
    return user;
  };

  // Grupos definidos em shared/roles.ts — fonte única entre client e servidor
  const CADASTRO_ROLES = ROLE_GROUPS.cadastro;
  const FINANCE_ROLES = ROLE_GROUPS.financeiro;
  const LOGISTICA_ROLES = ROLE_GROUPS.logistica;

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
      // Em produção o boot (server/index.ts) garante SSO_SECRET/SESSION_SECRET.
      // Sem eles (só possível em dev), usamos string vazia: a verificação falha
      // fechada em vez de cair no segredo público versionado.
      const rawSecret = process.env.SSO_SECRET || process.env.SESSION_SECRET || "";
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
      } else if (user.status === "rejected" || user.isActive === false) {
        // Conta rejeitada por um admin ou inativada — o SSO NÃO reverte essa
        // decisão (antes qualquer não-aprovado, inclusive rejeitado, era
        // auto-aprovado no login por SSO).
        console.warn(`[SSO] Acesso negado — conta rejeitada/inativa: ${email}`);
        return res.status(403).json({ message: "Conta sem acesso. Contate o administrador." });
      } else if (user.status === "pending") {
        // Primeiro acesso via SSO de um usuário pré-cadastrado — aprovar
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

      // isActive === false = conta inativada; o toggle-active só mexe nesse
      // campo, então o login por senha precisa checá-lo (o SSO já checa os dois)
      if (!user || user.status !== 'approved' || user.isActive === false) {
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
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ message: "Usuário não autenticado" });
      }

      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ message: "Usuário não encontrado" });
      }

      // Admins, financial (RH) and purchasing (Compras) can create users
      const isAdmin = normalizeRole(currentUser.role) === 'admin';
      const canManageUsers = isAdmin || normalizeRole(currentUser.role) === 'financial' || normalizeRole(currentUser.role) === 'purchasing';
      if (!canManageUsers) {
        return res.status(403).json({ message: "Sem permissão para criar usuários." });
      }

      // Senha é opcional nessa rota — login é via Microsoft/SSO
      const adminCreateSchema = insertUserSchema.extend({ password: z.string().optional() });
      const userData = adminCreateSchema.parse(req.body);

      // Only true admins can create admin users
      if (normalizeRole(userData.role) === 'admin' && !isAdmin) {
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
      const isAdmin = normalizeRole(currentUser.role) === 'admin';
      const canManageUsers = isAdmin || normalizeRole(currentUser.role) === 'financial' || normalizeRole(currentUser.role) === 'purchasing' || normalizeRole(currentUser.role) === 'production';
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
      const currentUserId = req.session.userId;
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
      const isAdmin = normalizeRole(currentUser.role) === 'admin';
      const canManageUsers = isAdmin || normalizeRole(currentUser.role) === 'financial' || normalizeRole(currentUser.role) === 'purchasing';
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
      if (normalizeRole(filteredData.role) === 'admin' && !isAdmin) {
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
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ message: "Usuário não autenticado" });
      }

      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ message: "Usuário não encontrado" });
      }

      // Admins, financial (RH), purchasing (Compras) and production (Logística) can approve/reject users
      const isAdmin = normalizeRole(currentUser.role) === 'admin';
      const canManageUsers = isAdmin || normalizeRole(currentUser.role) === 'financial' || normalizeRole(currentUser.role) === 'purchasing' || normalizeRole(currentUser.role) === 'production';
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
      const adminId = req.session.userId;
      if (!adminId) return res.status(401).json({ message: "Não autenticado" });
      
      const admin = await storage.getUser(adminId);
      const isAdmin = admin && (normalizeRole(admin.role) === 'admin');
      const isPurchasing = admin && normalizeRole(admin.role) === 'purchasing';
      const isProduction = admin && normalizeRole(admin.role) === 'production';
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
      const isAdmin = admin && normalizeRole(admin.role) === 'admin';
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
      const adminId = req.session.userId;
      if (!adminId) return res.status(401).json({ message: "Não autenticado" });
      
      const admin = await storage.getUser(adminId);
      const isAdmin = admin && (normalizeRole(admin.role) === 'admin');
      const isPurchasingAdmin = admin && normalizeRole(admin.role) === 'purchasing';
      const isProductionAdmin = admin && normalizeRole(admin.role) === 'production';
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
      const actorId = req.session?.userId;
      const actor = actorId ? await storage.getUser(actorId) : null;
      if (!actor || !isFinanceRole(actor.role)) {
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
        const canEditEvent = ['admin', 'purchasing'].includes(normalizeRole(currentUser.role) ?? '');
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
        const canDeleteEvent = ['admin', 'purchasing'].includes(normalizeRole(currentUser.role) ?? '');
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
    if (!await requireRoles(req, res, CADASTRO_ROLES)) return;
    try {
      const functionData = insertFunctionSchema.parse(req.body);
      const func = await storage.createFunction(functionData);
      res.json(func);
    } catch (error) {
      res.status(400).json({ message: "Dados inválidos" });
    }
  });

  app.patch("/api/functions/:id", async (req, res) => {
    if (!await requireRoles(req, res, CADASTRO_ROLES)) return;
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
    if (!await requireRoles(req, res, CADASTRO_ROLES)) return;
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
      const isAdmin = normalizeRole(user.role) === 'admin';
      const isPurchasing = normalizeRole(user.role) === 'purchasing';
      const isProduction = normalizeRole(user.role) === 'production';
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
      const isAdmin = normalizeRole(user.role) === 'admin';
      const isPurchasing = normalizeRole(user.role) === 'purchasing';
      const isProduction = normalizeRole(user.role) === 'production';
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
      const isAdmin = normalizeRole(user.role) === 'admin';
      const isPurchasing = normalizeRole(user.role) === 'purchasing';
      const isProduction = normalizeRole(user.role) === 'production';
      
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
      const isAdmin = normalizeRole(user.role) === 'admin';
      const isPurchasing = normalizeRole(user.role) === 'purchasing';
      const isProduction = normalizeRole(user.role) === 'production';
      
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
      res.json(collaborators);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar colaboradores" });
    }
  });

  app.post("/api/collaborators", async (req, res) => {
    // Mesmos papéis que o PATCH exige (cadastro + área de função). Antes exigia
    // só sessão, então qualquer logado criava colaborador.
    const creator = await requireRoles(req, res, [...CADASTRO_ROLES, 'function_area']);
    if (!creator) return;
    const creatorId = creator.id;
    try {
      // Campos de identidade que o client ainda possa enviar são descartados —
      // a identidade e o papel vêm da sessão
      const { _userId, _userRole, ...bodyData } = req.body;

      // Validar dados do colaborador
      // (não logar o corpo: contém CPF/telefone do colaborador)
      let collaboratorData: any = insertCollaboratorSchema.parse(bodyData);
      // Aprovação só pelo fluxo dedicado (ou pela regra de auto-aprovação abaixo)
      delete collaboratorData.status;
      delete collaboratorData.approvedBy;
      delete collaboratorData.approvedAt;

      // creator já veio de requireRoles acima
      collaboratorData = {
        ...collaboratorData,
        createdBy: creator.id,
        createdByName: creator.name,
      };

      // Auto-aprovar colaboradores criados por usuários "Área de Função".
      // O papel vem do banco (via sessão) — antes vinha do corpo da requisição,
      // então qualquer um se declarava function_area e já nascia aprovado.
      if (normalizeRole(creator?.role) === 'function_area') {
        collaboratorData = {
          ...collaboratorData,
          status: 'aprovado',
          approvedAt: new Date(),
          approvedBy: creator?.id ?? null,
        };
      }

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
    const bulkCreator = await requireRoles(req, res, [...CADASTRO_ROLES, 'function_area']);
    if (!bulkCreator) return;
    const bulkCreatorId = bulkCreator.id;
    try {
      const { collaborators } = req.body;

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

      // bulkCreator já veio de requireRoles; papel do banco, não do corpo
      const bulkAutoApprove = normalizeRole(bulkCreator.role) === 'function_area';

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
          const autoApprove = bulkAutoApprove;

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
            ...(autoApprove ? {
              approvedBy: bulkCreatorId,
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

          await storage.createCollaborator({
            ...validatedData,
            createdBy: bulkCreator?.id ?? null,
            createdByName: bulkCreator?.name ?? null,
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
    // Cadastro de colaborador: mesmos papéis que podem criar (inclui a Área de
    // Função, que mantém o próprio time). Antes qualquer requisição editava.
    if (!await requireRoles(req, res, [...CADASTRO_ROLES, 'function_area'])) return;
    try {
      const { id } = req.params;
      const collaboratorData = insertCollaboratorSchema.partial().parse(req.body);
      // Campos de inativação só podem ser alterados pelas rotas dedicadas
      // (/inactivate e /reactivate), que aplicam a checagem de permissão e o
      // motivo obrigatório. Removemos aqui para evitar burlar essas regras.
      delete (collaboratorData as any).active;
      delete (collaboratorData as any).inactiveReason;
      delete (collaboratorData as any).inactivatedAt;
      // Proveniência é definida apenas na criação — não pode ser reescrita aqui
      delete (collaboratorData as any).createdBy;
      delete (collaboratorData as any).createdByName;
      const collaborator = await storage.updateCollaborator(id, collaboratorData);
      res.json(collaborator);
    } catch (error) {
      res.status(400).json({ message: "Erro ao atualizar colaborador" });
    }
  });

  app.post("/api/collaborators/:id/inactivate", async (req, res) => {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ message: "Não autenticado" });
    const currentUser = await storage.getUser(userId);
    const isAdminOrPurchasing = currentUser && ['admin', 'purchasing'].includes(normalizeRole(currentUser.role) ?? '');
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
    const isAdminOrPurchasing = currentUser && ['admin', 'purchasing'].includes(normalizeRole(currentUser.role) ?? '');
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
    if (!await requireRoles(req, res, CADASTRO_ROLES)) return;
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
      res.status(400).json({ message: "Dados inválidos", error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Criação em lote (grade de escalação) — tudo numa transação: ou todas as
  // escalações entram, ou nenhuma. Antes o client fazia N POSTs sequenciais e
  // uma falha no meio deixava escalação parcial.
  app.post("/api/team-inclusions/bulk", async (req, res) => {
    const actor = await requireRoles(req, res, CADASTRO_ROLES);
    if (!actor) return;
    try {
      const { inclusions } = req.body as { inclusions: any[] };
      if (!Array.isArray(inclusions) || inclusions.length === 0) {
        return res.status(400).json({ message: "Lista de escalações é obrigatória" });
      }
      const rows = inclusions.map((raw) => {
        const cleaned = { ...raw };
        for (const k of ["scheduleStartDate", "scheduleEndDate", "actualStartDate", "actualEndDate", "flightDepartureDate", "flightReturnDate"]) {
          if (cleaned[k] === "") cleaned[k] = null;
        }
        return insertTeamInclusionSchema.parse(cleaned);
      });
      const created = await storage.createTeamInclusionsBatch(rows);
      await createAuditLog('create', 'team_inclusion', created[0]?.id ?? 'bulk', { count: created.length }, actor.id, actor.name, undefined, req);
      res.status(201).json({ created: created.length, items: created });
    } catch (error) {
      console.error("Error creating team inclusions batch:", error);
      res.status(400).json({ message: "Dados inválidos no lote de escalações", error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.patch("/api/team-inclusions/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session?.userId;

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
      const isAdmin = normalizeRole(user.role) === 'admin';
      const isProductionOrPurchasing = normalizeRole(user.role) === 'production' || normalizeRole(user.role) === 'purchasing';
      const isFunctionManager = await storage.isUserFunctionManager(currentInclusion.functionId, userId);
      const isLegacyResponsible = func.userId === userId; // Compatibilidade com o campo antigo
      
      if (!isAdmin && !isProductionOrPurchasing && !isFunctionManager && !isLegacyResponsible) {
        return res.status(403).json({ message: "Sem permissão para modificar esta escalação." });
      }

      // Transição de status/fase da escalação — uma linha por mudança
      if (req.body.status || req.body.phase) {
        console.log(
          `[Escalação ${id}] ${currentInclusion.status}/${currentInclusion.phase} → ${req.body.status ?? currentInclusion.status}/${req.body.phase ?? currentInclusion.phase}`
        );
      }

      // Descarta campos de identidade que o client legado ainda possa enviar
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

      // Allowlist: só campos legitimamente editáveis por esta rota genérica.
      // Fora dela ficam a aprovação da produção (rota /approve-production com
      // checagem de canApproveCenotecnica), o soft-delete (rota DELETE),
      // identidade (event/function/inclusionNumber) e campos de servidor.
      // Antes o corpo cru era espalhado — um responsável de função gravava
      // approvedByProduction/deletedAt direto e pulava as rotas dedicadas.
      const EDITABLE_INCLUSION_FIELDS = new Set([
        'collaboratorId', 'area', 'emitsNf', 'rowOrder',
        'scheduleStartDate', 'scheduleEndDate', 'actualStartDate', 'actualEndDate',
        'flightDepartureDate', 'flightDepartureSuggestedTime', 'flightArrivalSuggestedTime',
        'flightReturnDate', 'flightReturnSuggestedTime',
        'needsTicket', 'needsAccommodation', 'dailyRates', 'workDays', 'dailyValue',
        'actualDailyRates', 'observations', 'actualObservations', 'emergencyRecord',
        'city', 'status', 'previousStatus', 'phase', 'atendimentoTipo',
      ]);
      const updates: Record<string, any> = { updatedBy: userId };
      for (const [k, v] of Object.entries(bodyData)) {
        if (EDITABLE_INCLUSION_FIELDS.has(k)) updates[k] = v;
      }

      // Atendimento: ao ter colaborador atribuído, o tipo (Key Account /
      // Executivo de Contas) é obrigatório — define a tarifa da diária.
      if (isAtendimentoFunction(func.name)) {
        const effColab = updates.collaboratorId !== undefined ? updates.collaboratorId : currentInclusion.collaboratorId;
        const effTipo = updates.atendimentoTipo !== undefined ? updates.atendimentoTipo : (currentInclusion as any).atendimentoTipo;
        if (effColab && !effTipo) {
          return res.status(400).json({ message: "Para atendimento, selecione o tipo (Key Account ou Executivo de Contas) ao escalar o colaborador." });
        }
      } else if (updates.atendimentoTipo !== undefined) {
        // Fora de atendimento o campo não faz sentido
        updates.atendimentoTipo = null;
      }

      const inclusion = await storage.updateTeamInclusion(id, updates);
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

      const isAdmin = normalizeRole(user.role) === 'admin';
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

      const isAdmin = normalizeRole(user.role) === 'admin';
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
      const isAdmin = normalizeRole(user.role) === 'admin';
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

      const isAdmin = normalizeRole(user.role) === 'admin';
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
    if (!await requireRoles(req, res, CADASTRO_ROLES)) return;
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
    if (!await requireRoles(req, res, CADASTRO_ROLES)) return;
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
    if (!await requireRoles(req, res, LOGISTICA_ROLES)) return;
    try {
      // Não logar o corpo: passagens contêm dados pessoais do passageiro
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
    if (!await requireRoles(req, res, LOGISTICA_ROLES)) return;
    try {
      const { id } = req.params;
      const updates = { 
        ...req.body, 
        updatedAt: new Date(),
        updatedBy: req.session?.userId ?? null // ator vem da sessão, não do corpo
      };
      const prev = await storage.getTicket(id);
      const ticket = await storage.updateTicket(id, updates);
      const actorId = req.session?.userId;
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
    if (!await requireRoles(req, res, LOGISTICA_ROLES)) return;
    try {
      // Não logar o corpo: hospedagem contém dados pessoais do hóspede
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
    if (!await requireRoles(req, res, LOGISTICA_ROLES)) return;
    try {
      const { id } = req.params;
      const updates = { 
        ...req.body, 
        updatedAt: new Date(),
        updatedBy: req.session?.userId ?? null // ator vem da sessão, não do corpo
      };
      const prev = await storage.getAccommodation(id);
      const accommodation = await storage.updateAccommodation(id, updates);
      const actorId = req.session?.userId;
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
    if (!await requireRoles(req, res, LOGISTICA_ROLES)) return;
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
    if (!await requireRoles(req, res, LOGISTICA_ROLES)) return;
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
    if (!await requireRoles(req, res, LOGISTICA_ROLES)) return;
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
    if (!await requireRoles(req, res, LOGISTICA_ROLES)) return;
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
    if (!await requireRoles(req, res, LOGISTICA_ROLES)) return;
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
    if (!await requireRoles(req, res, LOGISTICA_ROLES)) return;
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
    if (!await requireRoles(req, res, LOGISTICA_ROLES)) return;
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
    if (!await requireRoles(req, res, LOGISTICA_ROLES)) return;
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
    if (!await requireRoles(req, res, LOGISTICA_ROLES)) return;
    try {
      await db.delete(logisticsExtraCostsTable).where(eq(logisticsExtraCostsTable.id, req.params.id));
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ message: "Erro ao excluir custo" });
    }
  });

  // Financial routes
  app.get("/api/financial", async (req, res) => {
    try {
      const financial = await storage.getFinancials();
      res.json(financial);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar dados financeiros" });
    }
  });

  app.post("/api/financial", async (req, res) => {
    if (!await requireRoles(req, res, FINANCE_ROLES)) return;
    try {
      const financialData = insertFinancialSchema.parse(req.body);
      const financial = await storage.createFinancial(financialData);
      res.json(financial);
    } catch (error) {
      res.status(400).json({ message: "Dados inválidos" });
    }
  });

  app.patch("/api/financial/:id", async (req, res) => {
    if (!await requireRoles(req, res, FINANCE_ROLES)) return;
    try {
      const { id } = req.params;
      const updates = { 
        ...req.body, 
        updatedAt: new Date(),
        updatedBy: req.session?.userId ?? null // ator vem da sessão, não do corpo
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
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ message: "Não autenticado" });
    try {
      const parsed = insertCommentSchema.parse(req.body);
      // A autoria vem da sessão, nunca do corpo (o schema tinha userId e o
      // client mandava user.id — mesmo padrão _userId removido do resto do app)
      const inclusion = await storage.getTeamInclusion(parsed.teamInclusionId);
      if (!inclusion) return res.status(404).json({ message: "Inclusão não encontrada" });
      const comment = await storage.createComment({ ...parsed, userId });
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
      const isAdmin = normalizeRole(currentUser.role) === 'admin';
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
    try {
      const values = await storage.getAllFunctionValues();
      res.json(values);
    } catch (error) {
      console.error("Error fetching function values:", error);
      res.status(500).json({ message: "Erro ao buscar valores das funções" });
    }
  });

  app.get("/api/function-values/:functionId", async (req, res) => {
    try {
      const value = await storage.getFunctionValues(req.params.functionId);
      res.json(value || null);
    } catch (error) {
      console.error("Error fetching function value:", error);
      res.status(500).json({ message: "Erro ao buscar valor da função" });
    }
  });

  // Valores por função definem diárias — impacto financeiro direto
  app.post("/api/function-values", async (req, res) => {
    if (!await requireRoles(req, res, FINANCE_ROLES)) return;
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
    if (!await requireRoles(req, res, FINANCE_ROLES)) return;
    try {
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
  // ── Guardas do módulo financeiro ────────────────────────────────────────────
  // Identidade vem SOMENTE da sessão (o fallback _userId do corpo é forjável).
  const requireFinSession = (req: any, res: any): string | null => {
    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ message: "Não autenticado" });
      return null;
    }
    return userId;
  };
  // Sessão + papel de decisão financeira (admin/RH, aliases legados inclusos)
  const requireFinanceUser = async (req: any, res: any) => {
    const userId = requireFinSession(req, res);
    if (!userId) return null;
    const user = await storage.getUser(userId);
    if (!user || !isFinanceRole(user.role)) {
      res.status(403).json({ message: "Sem permissão para esta ação financeira" });
      return null;
    }
    return user;
  };
  // Escrita no módulo financeiro: exige papel financeiro (mesma regra que o
  // client aplica às telas — só admin/RH acessam). Drop-in de requireFinSession:
  // devolve o userId (string) ou null, mantendo os dois padrões de call site.
  // As telas financeiras são finance-only; os GETs seguem com requireFinSession
  // porque alguns (ex.: /api/payment-companies) são lidos por telas não-financeiras.
  const requireFinWrite = async (req: any, res: any): Promise<string | null> => {
    const user = await requireFinanceUser(req, res);
    return user ? user.id : null;
  };
  // NOTA (dívida registrada em 13/08): o servidor NÃO recalcula totalValue
  // porque o schema não persiste a diária de FDS separada — o total usa
  // diáriaÚtil×diasÚteis + diáriaFDS×diasFDS, mas só a diária útil é gravada.
  // Recalcular a partir dos campos corromperia totais legítimos. O caminho
  // definitivo é adicionar colunas daily_value_weekend em planned/actual.

  app.post("/api/budget-planned/apply-defaults", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;

    try {
      const [allPlanned, allActual, allInclusions, allFunctionValues, rawSettings, allCollaborators] = await Promise.all([
        storage.getAllBudgetPlanned(),
        storage.getAllBudgetActual(),
        storage.getTeamInclusions(),
        storage.getAllFunctionValues(),
        storage.getSystemSettings(),
        storage.getCollaborators(),
      ]);

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

      const countDays = (start: string | null, end: string | null, fallback: number) => {
        if (start && end) {
          const s = new Date(start + 'T12:00:00'), e = new Date(end + 'T12:00:00');
          let wd = 0, we = 0;
          const cur = new Date(s);
          while (cur <= e) { const d = cur.getDay(); (d === 0 || d === 6) ? we++ : wd++; cur.setDate(cur.getDate() + 1); }
          return { weekdays: wd, weekends: we };
        }
        return { weekdays: fallback, weekends: 0 };
      };

      // Calcular todos os updates necessários primeiro, depois executar em paralelo
      const updates: Promise<any>[] = [];
      for (const planned of allPlanned) {
        if (sentKeys.has(`${planned.eventId}|${planned.collaboratorId}|${planned.functionId}`)) continue;

        const inc = allInclusions.find(i =>
          i.eventId === planned.eventId &&
          i.collaboratorId === planned.collaboratorId &&
          i.functionId === planned.functionId
        );
        const { weekdays, weekends } = countDays(
          inc?.scheduleStartDate ?? null,
          inc?.scheduleEndDate ?? null,
          planned.dailyQuantity
        );

        const collaborator = allCollaborators.find(c => c.id === planned.collaboratorId);
        const isFreela = !collaborator || collaborator.type === 'freela';

        const fv = allFunctionValues.find(f => f.functionId === planned.functionId);
        // ?? em vez de ||: um valor de função configurado como 0 é legítimo e
        // não deve ser substituído pelo default do sistema
        const dailyWd = isFreela
          ? (fv?.dailyValueFreela ?? D.dailyWdFreela)
          : (fv?.dailyValue ?? D.dailyWd);
        const dailyWe = isFreela
          ? (fv?.dailyValueFreelaWeekend ?? fv?.dailyValueFreela ?? D.dailyWeFreela)
          : (fv?.dailyValueWeekend ?? fv?.dailyValue ?? D.dailyWe);
        const mobIda   = isFreela ? D.mobIdaFreela   : D.mobIda;
        const mobVolta  = isFreela ? D.mobVoltaFreela  : D.mobVolta;
        const mob       = mobIda + mobVolta;
        const almSem    = isFreela ? D.almSemFreela    : D.almSem;
        const janSem    = isFreela ? D.janSemFreela    : D.janSem;
        const almFds    = isFreela ? D.almFdsFreela    : D.almFds;
        const janFds    = isFreela ? D.janFdsFreela    : D.janFds;

        const wdLunch   = almSem * weekdays;
        const wdDinner  = janSem * weekdays;
        const weLunch   = almFds * weekends;
        const weDinner  = janFds * weekends;
        const costAssistance = mob + wdLunch + wdDinner + weLunch + weDinner;
        const subtotalDiarias = dailyWd * weekdays + dailyWe * weekends;
        const totalValue = subtotalDiarias + costAssistance;

        updates.push(storage.updateBudgetPlanned(planned.id, {
          dailyValue: dailyWd,
          weekdayLunch: wdLunch,
          weekdayDinner: wdDinner,
          weekendLunch: weLunch,
          weekendDinner: weDinner,
          mobilityIda: mobIda,
          mobilityVolta: mobVolta,
          mobility: mob,
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
    if (!requireFinSession(req, res)) return;
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
    if (!requireFinSession(req, res)) return;
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
    const actorId = await requireFinWrite(req, res);
    if (!actorId) return;
    try {
      const data: any = insertBudgetPlannedSchema.parse(req.body);
      // Campos de workflow não nascem pela API — têm rotas dedicadas
      delete data.status;
      delete data.didNotAttend;
      const planned = await storage.createBudgetPlanned(data);
      const actor = await storage.getUser(actorId);
      await createAuditLog('create', 'budget_planned', planned.id, planned, actorId, actor?.name || 'Sistema', undefined, req);
      res.status(201).json(planned);
    } catch (error: any) {
      // 23505 = unique_violation (constraint criada na migração de 13/08):
      // já existe planejado para este colaborador+função neste evento
      if (error?.code === '23505') {
        return res.status(409).json({ message: "Já existe um planejamento para este colaborador e função neste evento." });
      }
      console.error("Error creating budget planned:", error);
      res.status(400).json({ message: "Erro ao criar planejamento" });
    }
  });

  app.patch("/api/budget-planned/:id", async (req, res) => {
    const actorId = await requireFinWrite(req, res);
    if (!actorId) return;
    try {
      const prev = await storage.getBudgetPlannedById(req.params.id);
      if (!prev) return res.status(404).json({ message: "Planejamento não encontrado" });
      // Validação + allowlist: campos de workflow só mudam pelas rotas dedicadas
      const data: any = insertBudgetPlannedSchema.partial().parse(req.body);
      delete data.status;
      delete data.didNotAttend;
      delete data.didNotAttendReason;
      const actor = await storage.getUser(actorId);
      const planned = await storage.updateBudgetPlanned(req.params.id, { ...data, updatedBy: actorId } as any);
      await createAuditLog('update', 'budget_planned', req.params.id, planned, actorId, actor?.name || 'Sistema', prev, req);
      res.json(planned);
    } catch (error) {
      console.error("Error updating budget planned:", error);
      res.status(400).json({ message: "Erro ao atualizar planejamento" });
    }
  });

  app.delete("/api/budget-planned/:id", async (req, res) => {
    const actorId = await requireFinWrite(req, res);
    if (!actorId) return;
    try {
      const prev = await storage.getBudgetPlannedById(req.params.id);
      if (!prev) return res.status(404).json({ message: "Planejamento não encontrado" });
      const actor = await storage.getUser(actorId);
      await storage.deleteBudgetPlanned(req.params.id);
      await createAuditLog('delete', 'budget_planned', req.params.id, prev, actorId, actor?.name || 'Sistema', undefined, req);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting budget planned:", error);
      res.status(500).json({ message: "Erro ao excluir planejamento" });
    }
  });

  app.post("/api/budget-planned/:id/toggle-not-attended", async (req, res) => {
    const finUser = await requireFinanceUser(req, res);
    if (!finUser) return;
    try {
      const { reason } = req.body as { reason?: string };
      const item = await storage.getBudgetPlannedById(req.params.id);
      if (!item) return res.status(404).json({ message: "Item não encontrado" });
      const toggled = !(item as any).didNotAttend;
      const updated = await storage.updateBudgetPlanned(req.params.id, {
        didNotAttend: toggled,
        didNotAttendReason: toggled ? (reason || null) : null,
      } as any);
      const actorId = finUser.id;
      const actor = finUser;
      await createAuditLog('update', 'budget_planned', req.params.id, updated, actorId, actor?.name || 'Sistema', item, req);
      res.json(updated);
    } catch (error) {
      console.error("Error toggling not-attended on planned:", error);
      res.status(400).json({ message: "Erro ao atualizar participação" });
    }
  });

  // Budget Actual (Realizado)
  app.get("/api/budget-actual", async (req, res) => {
    if (!requireFinSession(req, res)) return;
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
    if (!requireFinSession(req, res)) return;
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
    const actorId = await requireFinWrite(req, res);
    if (!actorId) return;
    try {
      const data: any = insertBudgetActualSchema.parse(req.body);
      // Campos de workflow não nascem pela API — impedem "nascer aprovado"
      delete data.rhStatus;
      delete data.sentForReview;
      delete data.rhActionBy;
      delete data.rhActionAt;
      delete data.rhAdjusted;
      delete data.rhAdjustedFields;
      delete data.resubmitted;
      delete data.didNotAttend;
      delete data.didNotAttendReason;
      const actual = await storage.createBudgetActual({ ...data, createdBy: actorId });
      const actor = await storage.getUser(actorId);
      await createAuditLog('create', 'budget_actual', actual.id, actual, actorId, actor?.name || 'Sistema', undefined, req);
      res.status(201).json(actual);
    } catch (error) {
      console.error("Error creating budget actual:", error);
      res.status(400).json({ message: "Erro ao criar realizado" });
    }
  });

  app.post("/api/budget-actual/duplicate-from-planned/:eventId", async (req, res) => {
    const actorId = await requireFinWrite(req, res);
    if (!actorId) return;
    try {
      const { eventId } = req.params;
      // Idempotência: repetir a chamada duplicava todas as prestações do evento
      const existing = await storage.getBudgetActual(eventId);
      if (existing.length > 0) {
        return res.status(409).json({ message: "Este evento já tem prestações no Realizado — duplicação ignorada." });
      }
      const planned = await storage.getBudgetPlanned(eventId);
      const actor = await storage.getUser(actorId);

      const duplicated = await Promise.all(
        planned.map(async (p) => {
          const actualData = {
            plannedId: p.id,
            eventId: p.eventId,
            collaboratorId: p.collaboratorId,
            functionId: p.functionId,
            collaboratorType: p.collaboratorType,
            dailyQuantity: p.dailyQuantity,
            dailyValue: p.dailyValue,
            costAssistance: p.costAssistance,
            weekdayLunch: p.weekdayLunch,
            weekdayDinner: p.weekdayDinner,
            weekendLunch: p.weekendLunch,
            weekendDinner: p.weekendDinner,
            mobility: p.mobility,
            mobilityIda: (p as any).mobilityIda ?? null,
            mobilityVolta: (p as any).mobilityVolta ?? null,
            transport: p.transport,
            totalValue: p.totalValue,
            observations: p.observations,
            createdBy: actorId,
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
    const dupActorId = await requireFinWrite(req, res);
    if (!dupActorId) return;
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
        createdBy: dupActorId,
      };
      const duplicated = await storage.createBudgetActual(duplicateData);
      const actorId = dupActorId;
      const actor = await storage.getUser(actorId);
      await createAuditLog('create', 'budget_actual', duplicated.id, duplicated, actorId, actor?.name || 'Sistema', undefined, req);
      res.status(201).json(duplicated);
    } catch (error) {
      console.error("Error duplicating budget actual:", error);
      res.status(400).json({ message: "Erro ao duplicar item" });
    }
  });

  // ── Split vacancy endpoint ────────────────────────────────────────────────
  app.post("/api/budget-actual/:id/split", async (req, res) => {
    if (!await requireFinWrite(req, res)) return;
    try {
      const parent = await storage.getBudgetActualById(req.params.id);
      if (!parent) return res.status(404).json({ message: "Item não encontrado" });
      // Divisão só faz sentido antes da análise: item em revisão ou aprovado é imutável
      if (prestacaoEstaTravada(parent)) {
        return res.status(400).json({ message: "Não é possível dividir um item enviado para revisão ou já aprovado." });
      }

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

  app.post("/api/budget-actual/:id/toggle-not-attended", async (req, res) => {
    const finUser = await requireFinanceUser(req, res);
    if (!finUser) return;
    try {
      const { reason } = req.body as { reason?: string };
      const item = await storage.getBudgetActualById(req.params.id);
      if (!item) return res.status(404).json({ message: "Item não encontrado" });
      const toggled = !item.didNotAttend;
      const updated = await storage.updateBudgetActual(req.params.id, {
        didNotAttend: toggled,
        didNotAttendReason: toggled ? (reason || null) : null,
      } as any);
      const actorId = finUser.id;
      const actor = finUser;
      await createAuditLog('update', 'budget_actual', req.params.id, updated, actorId, actor?.name || 'Sistema', item, req);
      res.json(updated);
    } catch (error) {
      console.error("Error toggling not-attended:", error);
      res.status(400).json({ message: "Erro ao atualizar participação" });
    }
  });

  app.patch("/api/budget-actual/:id", async (req, res) => {
    const actorId = await requireFinWrite(req, res);
    if (!actorId) return;
    try {
      const prev = await storage.getBudgetActualById(req.params.id);
      if (!prev) return res.status(404).json({ message: "Realizado não encontrado" });
      const actor = await storage.getUser(actorId);
      const isRhAdmin = isFinanceRole(actor?.role);
      // Item em análise ou aprovado é imutável para quem não é RH/admin
      if (!isRhAdmin && prestacaoEstaTravada(prev)) {
        return res.status(400).json({ message: "Este item está em análise ou aprovado — apenas o RH pode ajustá-lo." });
      }

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

      // Validação + allowlist: workflow muda apenas pelas rotas dedicadas
      // (send-for-review, rh-action, toggle-not-attended)
      const parsed: any = insertBudgetActualSchema.partial().parse(req.body);
      delete parsed.rhStatus;
      delete parsed.sentForReview;
      delete parsed.rhActionBy;
      delete parsed.rhActionAt;
      delete parsed.rhAdjusted;
      delete parsed.rhAdjustedFields;
      delete parsed.resubmitted;
      delete parsed.didNotAttend;
      delete parsed.didNotAttendReason;
      let updatePayload: any = { ...parsed, updatedBy: actorId };

      if (isRhAdmin && prev) {
        const existingFields: Record<string, {from: number; to: number; label: string}> =
          prev.rhAdjustedFields ? JSON.parse(prev.rhAdjustedFields) : {};

        let changed = false;
        for (const [field, label] of Object.entries(RH_FIELDS)) {
          const newVal = parsed[field];
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
    const actorId = await requireFinWrite(req, res);
    if (!actorId) return;
    try {
      const prev = await storage.getBudgetActualById(req.params.id);
      if (!prev) return res.status(404).json({ message: "Realizado não encontrado" });
      if (prev.rhStatus === 'aprovado') {
        return res.status(400).json({ message: "Item aprovado não pode ser excluído." });
      }
      // NF vinculada impede a exclusão (senão a nota ficaria sem origem)
      const eventInvoices = await storage.getInvoices(prev.eventId);
      if (eventInvoices.some(inv => inv.budgetActualId === prev.id)) {
        return res.status(400).json({ message: "Há uma nota fiscal vinculada a este item — exclua/trate a NF primeiro." });
      }
      const actor = await storage.getUser(actorId);
      await storage.deleteBudgetActual(req.params.id);
      await createAuditLog('delete', 'budget_actual', req.params.id, prev, actorId, actor?.name || 'Sistema', undefined, req);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting budget actual:", error);
      res.status(500).json({ message: "Erro ao excluir realizado" });
    }
  });

  app.post("/api/budget-actual/send-for-review", async (req, res) => {
    const actorId = await requireFinWrite(req, res);
    if (!actorId) return;
    try {
      const { eventId, itemIds } = req.body;
      if (!eventId) {
        return res.status(400).json({ message: "eventId é obrigatório" });
      }
      const items = await storage.getBudgetActual(eventId);
      // Aprovado é terminal — reenvio só para pendente nunca enviado, devolvido ou rejeitado
      const canSend = podeEnviarParaRevisao;
      const toUpdate = itemIds?.length
        ? items.filter((i: any) => itemIds.includes(i.id) && canSend(i))
        : items.filter(canSend);

      const actor = await storage.getUser(actorId);

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
    if (!requireFinSession(req, res)) return;
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
    if (!await requireFinWrite(req, res)) return;
    try {
      const data = insertBudgetComparisonSchema.parse(req.body);
      const comparison = await storage.createBudgetComparison(data);
      res.status(201).json(comparison);
    } catch (error: any) {
      if (error?.code === '23505') {
        return res.status(409).json({ message: "Já existe um comparativo para este evento." });
      }
      console.error("Error creating budget comparison:", error);
      res.status(400).json({ message: "Erro ao criar comparativo" });
    }
  });

  app.post("/api/budget-comparison/calculate/:eventId", async (req, res) => {
    if (!await requireFinWrite(req, res)) return;
    try {
      const { eventId } = req.params;
      
      // Get planned and actual data
      const planned = await storage.getBudgetPlanned(eventId);
      const allActual = await storage.getBudgetActual(eventId);

      // Espelha EXATAMENTE o cálculo da tela Comparativo (budget-comparison.tsx):
      // processa só os pais enviados; o total do grupo é pai(já reduzido pelo
      // split) + TODOS os filhos; "não participou" (no planejado) zera o grupo.
      // A versão anterior excluía os filhos de split e subcontava o realizado.
      const splitChildren = new Map<string, any[]>();
      for (const a of allActual as any[]) {
        if (a.splitParentId) {
          const arr = splitChildren.get(a.splitParentId) || [];
          arr.push(a);
          splitChildren.set(a.splitParentId, arr);
        }
      }
      const parents = (allActual as any[]).filter(a => a.sentForReview && !a.splitParentId);
      const matchPlanned = (a: any) => a.plannedId
        ? planned.find((pl: any) => pl.id === a.plannedId)
        : planned.find((pl: any) => pl.collaboratorId === a.collaboratorId && pl.functionId === a.functionId && pl.eventId === a.eventId);
      let totalActual = 0;
      let totalPlanned = 0;
      for (const p of parents) {
        const mp: any = matchPlanned(p);
        const notAttended = !!mp?.didNotAttend;
        const kids = splitChildren.get(p.id) || [];
        totalActual += notAttended ? 0 : (p.totalValue || 0) + kids.reduce((s, c) => s + (c.totalValue || 0), 0);
        totalPlanned += mp?.totalValue || 0;
      }
      // Convenção da tela: variância positiva = realizado acima do planejado
      const variance = totalActual - totalPlanned;
      const variancePercent = totalPlanned > 0
        ? ((variance / totalPlanned) * 100).toFixed(2) + '%'
        : '0%';

      // Changes log: só os pais enviados com planejado (filhos de split são
      // frações — comparar cada um contra o planejado cheio seria enganoso)
      const changesLog = parents
        .filter((a: any) => a.plannedId)
        .map((a: any) => {
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
    const finUser = await requireFinanceUser(req, res);
    if (!finUser) return;
    try {
      // Allowlist: decisão (status/approvedBy/motivos) só pelas rotas dedicadas
      const data: any = insertBudgetComparisonSchema.partial().parse(req.body);
      delete data.status;
      delete data.approvedBy;
      delete data.approvedAt;
      delete data.approvalObservation;
      delete data.rejectionReason;
      delete data.returnReason;
      const comparison = await storage.updateBudgetComparison(req.params.id, data);
      res.json(comparison);
    } catch (error) {
      console.error("Error updating budget comparison:", error);
      res.status(400).json({ message: "Erro ao atualizar comparativo" });
    }
  });

  app.post("/api/budget-comparison/:id/approve", async (req, res) => {
    const finUser = await requireFinanceUser(req, res);
    if (!finUser) return;
    try {
      const { approvalObservation } = req.body;
      const comparison = await storage.updateBudgetComparison(req.params.id, {
        status: 'aprovado',
        approvedBy: finUser.id,
        approvalObservation,
        approvedAt: new Date(),
      });
      await createAuditLog('approve', 'budget_comparison', req.params.id, comparison, finUser.id, finUser.name, undefined, req);
      res.json(comparison);
    } catch (error) {
      console.error("Error approving budget comparison:", error);
      res.status(400).json({ message: "Erro ao aprovar comparativo" });
    }
  });

  app.post("/api/budget-comparison/:id/reject", async (req, res) => {
    const finUser = await requireFinanceUser(req, res);
    if (!finUser) return;
    try {
      const { rejectionReason } = req.body;
      const comparison = await storage.updateBudgetComparison(req.params.id, {
        status: 'rejeitado',
        approvedBy: finUser.id,
        rejectionReason,
        approvedAt: new Date(),
      });
      await createAuditLog('reject', 'budget_comparison', req.params.id, comparison, finUser.id, finUser.name, undefined, req);
      res.json(comparison);
    } catch (error) {
      console.error("Error rejecting budget comparison:", error);
      res.status(400).json({ message: "Erro ao rejeitar comparativo" });
    }
  });

  app.post("/api/budget-comparison/:id/return", async (req, res) => {
    const finUser = await requireFinanceUser(req, res);
    if (!finUser) return;
    try {
      const { returnReason } = req.body;
      const comparison = await storage.updateBudgetComparison(req.params.id, {
        status: 'devolvido',
        approvedBy: finUser.id,
        returnReason,
      });
      await createAuditLog('update', 'budget_comparison', req.params.id, comparison, finUser.id, finUser.name, undefined, req);
      res.json(comparison);
    } catch (error) {
      console.error("Error returning budget comparison:", error);
      res.status(400).json({ message: "Erro ao devolver comparativo" });
    }
  });

  app.post("/api/budget-actual/rh-action", async (req, res) => {
    // Decisão do RH: sessão + papel obrigatórios; o ator vem da sessão
    // (antes qualquer requisição anônima aprovava em nome de qualquer um)
    const finUser = await requireFinanceUser(req, res);
    if (!finUser) return;
    try {
      const { itemIds, action, comment } = req.body;
      if (!itemIds?.length || !action) {
        return res.status(400).json({ message: "Dados incompletos" });
      }
      if (!['aprovado', 'rejeitado', 'devolvido'].includes(action)) {
        return res.status(400).json({ message: "Ação inválida" });
      }

      const actor = finUser;
      const actorId = finUser.id;
      const results = [];
      const skipped: string[] = [];
      for (const id of itemIds) {
        // Máquina de estados: só decide o que está de fato em análise
        const current = await storage.getBudgetActualById(id);
        if (!podeDecidirPrestacao(current).ok) {
          skipped.push(id);
          continue;
        }
        const updated = await storage.updateBudgetActual(id, {
          rhStatus: action,
          rhComment: comment || null,
          rhActionBy: actorId,
          rhActionAt: new Date(),
          ...(action === 'devolvido' || action === 'rejeitado'
            ? { sentForReview: false }
            : {}),
        });
        results.push(updated);
      }

      const logAction = action === 'aprovado' ? 'approve' : action === 'rejeitado' ? 'reject' : 'update';
      await createAuditLog(logAction, 'budget_actual', itemIds[0], { itemIds, action, comment, count: results.length, skipped }, actorId, actor?.name || 'Sistema', undefined, req);
      res.json({ updated: results.length, items: results, skipped });
    } catch (error) {
      console.error("Error performing RH action:", error);
      res.status(400).json({ message: "Erro ao processar ação do RH" });
    }
  });

  // ─── System Settings ──────────────────────────────────────────────
  app.get("/api/system-settings", async (req, res) => {
    if (!requireFinSession(req, res)) return;
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
        // Tarifas de atendimento (Key Account / Executivo de Contas)
        atendimento_key_account: 58000,
        atendimento_executivo_contas: 46500,
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
    const user = await requireFinanceUser(req, res);
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
        // Tarifas de atendimento (Key Account / Executivo de Contas)
        "atendimento_key_account", "atendimento_executivo_contas",
      ];
      // Valida tudo antes de gravar qualquer chave — um valor não numérico
      // gravava "NaN" no banco e quebrava o formulário de todos os usuários
      const updates: Array<[string, number]> = [];
      for (const key of allowed) {
        if (req.body[key] === undefined) continue;
        const parsed = parseFloat(req.body[key]);
        if (!Number.isFinite(parsed) || parsed < 0) {
          return res.status(400).json({ message: `Valor inválido para "${key}" — informe um número maior ou igual a zero.` });
        }
        updates.push([key, Math.round(parsed * 100)]);
      }
      for (const [key, val] of updates) {
        await storage.upsertSystemSetting(key, String(val), userId);
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

  // Slide 5 do deck de melhorias: dentro do mesmo evento, lançamentos com a
  // mesma OC precisam ter a mesma nota fiscal anexada (mesmo arquivo/nome).
  // Devolve a mensagem de erro, ou null se estiver consistente.
  const validateOcConsistency = async (
    eventId: string,
    oc: string | null | undefined,
    attachmentName: string | null | undefined,
    ignoreInvoiceId?: string,
  ): Promise<string | null> => {
    const ocNorm = (oc || "").trim().toLowerCase();
    if (!ocNorm) return null;
    const eventInvoices = await storage.getInvoices(eventId);
    const conflicting = eventInvoices.find(inv =>
      inv.id !== ignoreInvoiceId &&
      inv.status !== "recusada" &&
      (inv.oc || "").trim().toLowerCase() === ocNorm &&
      (inv.attachmentName || "") !== (attachmentName || "")
    );
    if (!conflicting) return null;
    return `A OC "${(oc || "").trim()}" já foi usada neste evento com a nota "${conflicting.attachmentName || "sem anexo"}". ` +
      `Lançamentos com a mesma OC precisam ter exatamente a mesma nota fiscal anexada. ` +
      `Confira o número da OC ou anexe o mesmo arquivo.`;
  };

  app.post("/api/invoices", async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Não autenticado" });
    try {
      const data: any = insertInvoiceSchema.parse(req.body);
      // NF não nasce aprovada/paga — envio sempre começa o fluxo
      delete data.approvedAt;
      delete data.checkinAt;
      delete data.checkinBy;
      delete data.paymentDate;
      if (data.status && data.status !== "enviada" && data.status !== "pendente") {
        data.status = "enviada";
      }
      // Elegibilidade: a prestação precisa existir e estar enviada ou aprovada
      // (devolvida/rejeitada pausa a NF até regularizar)
      if (data.budgetActualId) {
        const actualRef = await storage.getBudgetActualById(data.budgetActualId);
        if (!actualRef) {
          return res.status(400).json({ message: "Prestação (Realizado) não encontrada para esta nota." });
        }
        const eligible = isNfEligible(actualRef);
        if (!eligible) {
          return res.status(400).json({ message: "Este item do Realizado não está elegível para NF (devolvido, rejeitado ou ainda não enviado)." });
        }
        // Unicidade: uma NF por prestação (constraint no banco cobre corrida)
        const existingInvoices = await storage.getInvoices(data.eventId);
        if (existingInvoices.some(inv => inv.budgetActualId === data.budgetActualId)) {
          return res.status(409).json({ message: "Já existe uma nota fiscal para este item — use o reenvio na nota existente." });
        }
      }
      const ocError = await validateOcConsistency(data.eventId, data.oc, data.attachmentName);
      if (ocError) return res.status(400).json({ message: ocError });
      const firstEvent = { type: "enviado", oc: data.oc || null, attachmentName: data.attachmentName || null, at: new Date().toISOString() };
      const invoice = await storage.createInvoice({ ...data, history: JSON.stringify([firstEvent]) });
      res.json(invoice);
    } catch (error: any) {
      if (error?.name === 'ZodError') {
        return res.status(400).json({ message: "Dados da nota inválidos. Verifique OC e anexo." });
      }
      if (error?.code === '23505') {
        return res.status(409).json({ message: "Já existe uma nota fiscal para este item." });
      }
      console.error("Error creating invoice:", error);
      res.status(500).json({ message: "Erro ao criar nota fiscal" });
    }
  });

  app.patch("/api/invoices/:id", async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Não autenticado" });
    try {
      const existing = await storage.getInvoice(req.params.id);
      if (!existing) return res.status(404).json({ message: "Nota fiscal não encontrada" });
      // NF aprovada é imutável por esta rota (check-in tem rota própria)
      if (existing.status === "aprovada") {
        return res.status(400).json({ message: "Nota fiscal aprovada não pode ser alterada." });
      }
      // Allowlist: este PATCH serve ao envio/reenvio pelo colaborador.
      // Aprovar/devolver/recusar/check-in têm rotas dedicadas com papel —
      // antes qualquer logado aprovava a própria NF por aqui (IDOR).
      const body: any = {};
      for (const k of ["oc", "attachmentUrl", "attachmentName", "paymentText"]) {
        if (k in req.body) body[k] = req.body[k];
      }
      if (req.body.status !== undefined) {
        if (req.body.status !== "enviada") {
          return res.status(400).json({ message: "Por esta rota o status só pode ir para 'enviada' (reenvio)." });
        }
        body.status = "enviada";
      }
      let historyStr: string | undefined;
      // If resubmitting (setting status back to enviada), record a "reenviado" event
      if (body.status === "enviada") {
        const ocError = await validateOcConsistency(
          existing.eventId,
          body.oc !== undefined ? body.oc : existing.oc,
          body.attachmentName !== undefined ? body.attachmentName : existing.attachmentName,
          existing.id,
        );
        if (ocError) return res.status(400).json({ message: ocError });
        historyStr = await appendHistory(req.params.id, {
          type: "reenviado",
          oc: body.oc ?? existing.oc ?? null,
          attachmentName: body.attachmentName ?? existing.attachmentName ?? null,
        });
        // Reenvio limpa o comentário da devolução anterior
        body.returnComment = null;
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
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    try {
      const inv = await storage.getInvoice(req.params.id);
      const actualRef = inv?.budgetActualId ? await storage.getBudgetActualById(inv.budgetActualId) : null;
      const permissao = podeAprovarNota(inv, actualRef);
      if (!permissao.ok) return res.status(inv ? 400 : 404).json({ message: permissao.motivo });
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
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    try {
      const inv = await storage.getInvoice(req.params.id);
      const permissao = podeDevolverNota(inv);
      if (!permissao.ok) return res.status(inv ? 400 : 404).json({ message: permissao.motivo });
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
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    try {
      const inv = await storage.getInvoice(req.params.id);
      if (!inv) return res.status(404).json({ message: "Nota fiscal não encontrada" });
      if (inv.status !== "enviada") {
        return res.status(400).json({ message: "Só é possível recusar uma nota com status 'enviada'." });
      }
      const { comment } = req.body;
      const historyStr = await appendHistory(req.params.id, { type: "recusado", comment: comment || null });
      const invoice = await storage.updateInvoice(req.params.id, {
        status: "recusada",
        returnComment: comment ?? null,
        history: historyStr,
      });
      res.json(invoice);
    } catch (error) {
      console.error("Error rejecting invoice:", error);
      res.status(500).json({ message: "Erro ao recusar nota fiscal" });
    }
  });

  app.post("/api/invoices/:id/checkin", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    try {
      const inv = await storage.getInvoice(req.params.id);
      const { paymentDate } = req.body;
      const permissao = podeFazerCheckin(inv, paymentDate);
      if (!permissao.ok) return res.status(inv ? 400 : 404).json({ message: permissao.motivo });
      const historyStr = await appendHistory(req.params.id, { type: "checkin", paymentDate });
      const invoice = await storage.updateInvoice(req.params.id, {
        checkinAt: new Date(),
        checkinBy: user.id,
        paymentDate,
        history: historyStr,
      });
      res.json(invoice);
    } catch (error) {
      console.error("Error doing financial checkin:", error);
      res.status(500).json({ message: "Erro ao fazer check-in financeiro" });
    }
  });

  // Payment Companies
  app.get("/api/payment-companies", async (req, res) => {
    if (!requireFinSession(req, res)) return;
    try {
      const companies = await storage.getPaymentCompanies();
      res.json(companies);
    } catch (error) {
      console.error("Error fetching payment companies:", error);
      res.status(500).json({ message: "Erro ao buscar empresas" });
    }
  });

  app.post("/api/payment-companies", async (req, res) => {
    if (!await requireRoles(req, res, [...FINANCE_ROLES, 'purchasing'])) return;
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
    const userId = requireFinSession(req, res);
    if (!userId) return;
    const user = await storage.getUser(userId);
    if (!user || normalizeRole(user.role) !== "admin") return res.status(403).json({ message: "Sem permissão" });
    try {
      await storage.deletePaymentCompany(Number(req.params.id));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting payment company:", error);
      res.status(500).json({ message: "Erro ao excluir empresa" });
    }
  });

  // ─── Conta Corrente Flash (slide 6 do deck de melhorias) ────────────────────

  app.get("/api/flash-movements", async (req, res) => {
    if (!requireFinSession(req, res)) return;
    try {
      const collaboratorId = req.query.collaboratorId as string | undefined;
      const movements = await storage.getFlashMovements(collaboratorId);
      res.json(movements);
    } catch (error) {
      console.error("Error fetching flash movements:", error);
      res.status(500).json({ message: "Erro ao buscar lançamentos da conta corrente" });
    }
  });

  app.post("/api/flash-movements", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    try {
      const data = insertFlashMovementSchema.parse(req.body);
      const movement = await storage.createFlashMovement({
        ...data,
        createdBy: user.id,
        createdByName: user.name,
      });
      res.status(201).json(movement);
    } catch (error) {
      console.error("Error creating flash movement:", error);
      res.status(400).json({ message: "Dados inválidos. Verifique categoria, tipo, valor e data." });
    }
  });

  // Crédito inicial da admissão: os dois lançamentos (alimentação R$ 350 +
  // mobilidade R$ 150) numa única transação — antes eram 2 POSTs do client e
  // uma falha no segundo deixava o saldo pela metade sem correção pela UI.
  app.post("/api/flash-movements/initial-credit", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    try {
      const { collaboratorId, movementDate } = req.body;
      if (!collaboratorId || !movementDate) {
        return res.status(400).json({ message: "collaboratorId e movementDate são obrigatórios" });
      }
      const existing = await storage.getFlashMovements(collaboratorId);
      if (existing.length > 0) {
        return res.status(409).json({ message: "Este colaborador já tem lançamentos — o crédito inicial só vale para conta nova." });
      }
      const base = { collaboratorId, type: "credito" as const, movementDate, description: "Crédito inicial — admissão", createdBy: user.id, createdByName: user.name };
      const movements = await storage.createFlashMovementsBatch([
        { ...base, category: "alimentacao", amountCents: 35000 },
        { ...base, category: "mobilidade", amountCents: 15000 },
      ]);
      res.status(201).json(movements);
    } catch (error) {
      console.error("Error creating initial flash credit:", error);
      res.status(500).json({ message: "Erro ao lançar o crédito inicial" });
    }
  });

  app.delete("/api/flash-movements/:id", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    try {
      const prev = (await storage.getFlashMovements()).find(m => m.id === req.params.id);
      if (!prev) return res.status(404).json({ message: "Lançamento não encontrado" });
      await storage.deleteFlashMovement(req.params.id);
      // Trilha: exclusão de lançamento financeiro fica no audit log com o registro apagado
      await createAuditLog('delete', 'financial', req.params.id, prev, user.id, user.name, undefined, req);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting flash movement:", error);
      res.status(500).json({ message: "Erro ao excluir lançamento" });
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
    const userId = req.session.userId;
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

    // A inclusão precisa existir e ter um colaborador atual — sem alguém para
    // trocar, a operação correta é atribuir direto, não abrir uma troca.
    const inclusion = await storage.getTeamInclusion(teamInclusionId);
    if (!inclusion) return res.status(404).json({ message: "Escalação não encontrada" });
    const currentCollaboratorId = inclusion.collaboratorId ?? null;
    if (!currentCollaboratorId) {
      return res.status(400).json({ message: "Esta escalação ainda não tem colaborador — não há troca a fazer." });
    }
    if (newCollaboratorId === currentCollaboratorId) {
      return res.status(400).json({ message: "O novo colaborador é o mesmo que já está escalado." });
    }

    // O novo colaborador precisa existir, estar aprovado e ativo
    const newCollaborator = await storage.getCollaborator(newCollaboratorId);
    if (!newCollaborator) return res.status(404).json({ message: "Colaborador novo não encontrado" });
    if (newCollaborator.status !== 'aprovado' || newCollaborator.active === false) {
      return res.status(400).json({ message: "O colaborador escolhido não está aprovado/ativo." });
    }

    // Verificar se já existe solicitação pendente para essa inclusão
    const existing = await db.execute(drizzleSql`
      SELECT id FROM swap_requests WHERE team_inclusion_id = ${teamInclusionId} AND status = 'pendente'
    `);
    const existingRows = (existing as any).rows ?? existing;
    if (existingRows.length > 0) {
      return res.status(409).json({ message: "Já existe uma solicitação de troca pendente para esta escalação" });
    }

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

    const isAdminOrPurchasing = ['admin', 'purchasing'].includes(normalizeRole(currentUser.role) ?? '');
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

    const isAdminOrPurchasing = ['admin', 'purchasing'].includes(normalizeRole(currentUser.role) ?? '');
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

      const isAdminOrPurchasing = ['admin', 'purchasing'].includes(normalizeRole(currentUser.role) ?? '');
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
