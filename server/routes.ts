import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storage } from "./storage";
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
  insertInvoiceSchema
} from "@shared/schema";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

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
      
      console.log('[Login] Session saved - SessionID:', req.sessionID, 'UserID:', req.session.userId);
      
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
      
      // In a real app, you'd send an email here
      // For demo purposes, we'll return the token
      res.json({ 
        message: "Token de redefinição gerado",
        resetToken // Remove this in production!
      });
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

      // Only admins can create users via this route
      const isAdmin = currentUser.role === 'administrador' || currentUser.role === 'admin' || currentUser.role === 'administrator';
      if (!isAdmin) {
        return res.status(403).json({ message: "Sem permissão para criar usuários. Apenas administradores podem acessar esta funcionalidade." });
      }

      const userData = insertUserSchema.parse(req.body);
      
      // Check if email already exists
      const existingByEmail = await storage.getUserByEmail(userData.email);
      if (existingByEmail) {
        return res.status(400).json({ message: "E-mail já cadastrado" });
      }

      // Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(userData.password, saltRounds);
      
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

      // Only admins can list all users
      const isAdmin = currentUser.role === 'administrador' || currentUser.role === 'admin' || currentUser.role === 'administrator';
      if (!isAdmin) {
        return res.status(403).json({ message: "Sem permissão para listar usuários. Apenas administradores podem acessar esta funcionalidade." });
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

      // Authorization: only admins can edit other users, and only admins can change role/status
      const isAdmin = currentUser.role === 'administrador' || currentUser.role === 'admin' || currentUser.role === 'administrator';
      const isSelfUpdate = currentUserId === id;

      // Non-admin users can only edit their own profile
      if (!isAdmin && !isSelfUpdate) {
        return res.status(403).json({ message: "Sem permissão para editar este usuário" });
      }

      // Sensitive fields that only admins can modify
      const sensitiveFields = ['role', 'status'];
      const hasSensitiveChanges = sensitiveFields.some(field => updateData[field] !== undefined);
      
      if (hasSensitiveChanges && !isAdmin) {
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
      
      // Additional validation for admin-only fields
      if (!isAdmin && (filteredData.role !== undefined || filteredData.status !== undefined)) {
        return res.status(403).json({ message: "Sem permissão para alterar role ou status. Apenas administradores podem modificar esses campos." });
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

      // Only admins can approve/reject users
      const isAdmin = currentUser.role === 'administrador' || currentUser.role === 'admin' || currentUser.role === 'administrator';
      if (!isAdmin) {
        return res.status(403).json({ message: "Sem permissão para aprovar usuários. Apenas administradores podem acessar esta funcionalidade." });
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
      const isAdmin = admin && (admin.role === 'administrador' || admin.role === 'admin' || admin.role === 'administrator');
      if (!isAdmin) return res.status(403).json({ message: "Acesso negado" });

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

  // Admin: Reset user password
  app.post("/api/users/:id/reset-password", async (req, res) => {
    try {
      const adminId = req.session.userId;
      if (!adminId) return res.status(401).json({ message: "Não autenticado" });
      
      const admin = await storage.getUser(adminId);
      const isAdmin = admin && (admin.role === 'administrador' || admin.role === 'admin' || admin.role === 'administrator');
      if (!isAdmin) return res.status(403).json({ message: "Acesso negado" });

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

  app.put("/api/events/:id", async (req, res) => {
    try {
      const userId = req.session.userId || 'system';
      
      let currentUser = null;
      if (userId !== 'system') {
        currentUser = await storage.getUser(userId);
        if (!currentUser) {
          return res.status(401).json({ message: "Usuário não encontrado" });
        }

        // Only admins can edit events
        if (currentUser.role !== 'admin') {
          return res.status(403).json({ message: "Apenas administradores podem editar eventos" });
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

        // Only admins can delete events
        if (currentUser.role !== 'admin') {
          return res.status(403).json({ message: "Apenas administradores podem excluir eventos" });
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

      // Authorization check: Admin or function manager can add users
      const isAdmin = user.role === 'administrador' || user.role === 'admin' || user.role === 'administrator';
      const isFunctionManager = await storage.isUserFunctionManager(id, userId);
      
      if (!isAdmin && !isFunctionManager) {
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

      // Authorization check: Admin or function manager can remove users
      const isAdmin = user.role === 'administrador' || user.role === 'admin' || user.role === 'administrator';
      const isFunctionManager = await storage.isUserFunctionManager(functionId, userId);
      
      if (!isAdmin && !isFunctionManager) {
        return res.status(403).json({ message: "Sem permissão para remover usuários desta função" });
      }

      await storage.removeUserFromFunction(functionId, targetUserId);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ message: "Erro ao remover usuário da função" });
    }
  });

  // Function Managers routes
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

      // Authorization check: Only admins can add managers
      const isAdmin = user.role === 'administrador' || user.role === 'admin' || user.role === 'administrator';
      
      if (!isAdmin) {
        return res.status(403).json({ message: "Apenas administradores podem adicionar responsáveis às funções" });
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

      // Authorization check: Only admins can remove managers
      const isAdmin = user.role === 'administrador' || user.role === 'admin' || user.role === 'administrator';
      
      if (!isAdmin) {
        return res.status(403).json({ message: "Apenas administradores podem remover responsáveis das funções" });
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
    try {
      console.log("POST /api/collaborators - Dados recebidos:", JSON.stringify(req.body, null, 2));
      
      // Extrair informações do usuário (não fazem parte do schema)
      const { _userId, _userRole, ...bodyData } = req.body;
      
      // Validar dados do colaborador
      let collaboratorData: any = insertCollaboratorSchema.parse(bodyData);
      console.log("Dados validados com sucesso:", JSON.stringify(collaboratorData, null, 2));
      
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

          await storage.createCollaborator(validatedData);
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
      const collaborator = await storage.updateCollaborator(id, collaboratorData);
      res.json(collaborator);
    } catch (error) {
      res.status(400).json({ message: "Erro ao atualizar colaborador" });
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

      // Authorization check: Admin or function manager can modify
      const isAdmin = user.role === 'administrador' || user.role === 'admin' || user.role === 'administrator';
      const isFunctionManager = await storage.isUserFunctionManager(currentInclusion.functionId, userId);
      const isLegacyResponsible = func.userId === userId; // Compatibilidade com o campo antigo
      
      if (!isAdmin && !isFunctionManager && !isLegacyResponsible) {
        return res.status(403).json({ message: "Sem permissão para modificar esta escalação. Apenas responsáveis pela função podem confirmar escalações." });
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
      
      // Auto-recalculate workDays when schedule dates change
      const newStartDate = bodyData.scheduleStartDate || currentInclusion.scheduleStartDate;
      const newEndDate = bodyData.scheduleEndDate || currentInclusion.scheduleEndDate;
      const datesChanged = (bodyData.scheduleStartDate && bodyData.scheduleStartDate !== currentInclusion.scheduleStartDate) ||
                           (bodyData.scheduleEndDate && bodyData.scheduleEndDate !== currentInclusion.scheduleEndDate);
      
      if (datesChanged && newStartDate && newEndDate) {
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
    try {
      const financialData = insertFinancialSchema.parse(req.body);
      const financial = await storage.createFinancial(financialData);
      res.json(financial);
    } catch (error) {
      res.status(400).json({ message: "Dados inválidos" });
    }
  });

  app.patch("/api/financial/:id", async (req, res) => {
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

  app.post("/api/function-values", async (req, res) => {
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
    try {
      const value = await storage.updateFunctionValue(req.params.id, req.body);
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

  // Budget Planned (Planejado)
  app.get("/api/budget-planned", async (req, res) => {
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
      const actual = await storage.updateBudgetActual(req.params.id, req.body);
      const actorId = req.session?.userId;
      const actor = actorId ? await storage.getUser(actorId) : null;
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
    try {
      const { eventId, itemIds } = req.body;
      if (!eventId) {
        return res.status(400).json({ message: "eventId é obrigatório" });
      }
      const items = await storage.getBudgetActual(eventId);
      const toUpdate = itemIds?.length
        ? items.filter((i: any) => itemIds.includes(i.id))
        : items;

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
    try {
      const comparison = await storage.updateBudgetComparison(req.params.id, req.body);
      res.json(comparison);
    } catch (error) {
      console.error("Error updating budget comparison:", error);
      res.status(400).json({ message: "Erro ao atualizar comparativo" });
    }
  });

  app.post("/api/budget-comparison/:id/approve", async (req, res) => {
    try {
      const { approvedBy, approvalObservation } = req.body;
      const comparison = await storage.updateBudgetComparison(req.params.id, {
        status: 'aprovado',
        approvedBy,
        approvalObservation,
        approvedAt: new Date(),
      });
      const actorId = req.session?.userId || approvedBy;
      const actor = actorId ? await storage.getUser(actorId) : null;
      await createAuditLog('approve', 'budget_comparison', req.params.id, comparison, actorId, actor?.name || 'Sistema', undefined, req);
      res.json(comparison);
    } catch (error) {
      console.error("Error approving budget comparison:", error);
      res.status(400).json({ message: "Erro ao aprovar comparativo" });
    }
  });

  app.post("/api/budget-comparison/:id/reject", async (req, res) => {
    try {
      const { approvedBy, rejectionReason } = req.body;
      const comparison = await storage.updateBudgetComparison(req.params.id, {
        status: 'rejeitado',
        approvedBy,
        rejectionReason,
        approvedAt: new Date(),
      });
      const actorId = req.session?.userId || approvedBy;
      const actor = actorId ? await storage.getUser(actorId) : null;
      await createAuditLog('reject', 'budget_comparison', req.params.id, comparison, actorId, actor?.name || 'Sistema', undefined, req);
      res.json(comparison);
    } catch (error) {
      console.error("Error rejecting budget comparison:", error);
      res.status(400).json({ message: "Erro ao rejeitar comparativo" });
    }
  });

  app.post("/api/budget-comparison/:id/return", async (req, res) => {
    try {
      const { approvedBy, returnReason } = req.body;
      const comparison = await storage.updateBudgetComparison(req.params.id, {
        status: 'devolvido',
        approvedBy,
        returnReason,
      });
      const actorId = req.session?.userId || approvedBy;
      const actor = actorId ? await storage.getUser(actorId) : null;
      await createAuditLog('update', 'budget_comparison', req.params.id, comparison, actorId, actor?.name || 'Sistema', undefined, req);
      res.json(comparison);
    } catch (error) {
      console.error("Error returning budget comparison:", error);
      res.status(400).json({ message: "Erro ao devolver comparativo" });
    }
  });

  app.post("/api/budget-actual/rh-action", async (req, res) => {
    try {
      const { itemIds, action, comment, actionBy } = req.body;
      if (!itemIds?.length || !action || !actionBy) {
        return res.status(400).json({ message: "Dados incompletos" });
      }
      if (!['aprovado', 'rejeitado', 'devolvido'].includes(action)) {
        return res.status(400).json({ message: "Ação inválida" });
      }

      const actor = actionBy ? await storage.getUser(actionBy) : null;
      const actorId = req.session?.userId || actionBy;
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
    if (!req.session?.userId) return res.status(401).json({ message: "Não autenticado" });
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== "admin") return res.status(403).json({ message: "Apenas administradores podem alterar configurações" });

    try {
      const allowed = ["default_mobility", "default_mobility_ida", "default_mobility_volta", "default_weekday_lunch", "default_weekday_dinner", "default_weekend_lunch", "default_weekend_dinner", "default_daily_value", "default_daily_value_weekday", "default_daily_value_weekend"];
      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          const val = Math.round(parseFloat(req.body[key]) * 100);
          await storage.upsertSystemSetting(key, String(val), req.session.userId);
        }
      }
      await createAuditLog('update', 'system_settings', 'global', req.body, req.session.userId, user.name || 'Sistema', undefined, req);
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

  app.post("/api/invoices", async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Não autenticado" });
    try {
      const data = insertInvoiceSchema.parse(req.body);
      const invoice = await storage.createInvoice(data);
      res.json(invoice);
    } catch (error) {
      console.error("Error creating invoice:", error);
      res.status(500).json({ message: "Erro ao criar nota fiscal" });
    }
  });

  app.patch("/api/invoices/:id", async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Não autenticado" });
    try {
      const invoice = await storage.updateInvoice(req.params.id, req.body);
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
      if (!paymentDate) return res.status(400).json({ message: "Data de pagamento obrigatória" });
      const invoice = await storage.updateInvoice(req.params.id, {
        status: "aprovada",
        paymentDate,
        approvedAt: new Date(),
        returnComment: null,
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
      const invoice = await storage.updateInvoice(req.params.id, {
        status: "devolvida",
        returnComment: comment ?? null,
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

  const httpServer = createServer(app);
  return httpServer;
}
