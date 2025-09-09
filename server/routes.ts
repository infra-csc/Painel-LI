import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertEventSchema, 
  insertFunctionSchema, 
  insertCollaboratorSchema,
  insertTeamInclusionSchema,
  insertTicketSchema,
  insertFinancialSchema,
  insertCommentSchema,
  insertUserSchema,
  publicUserRegistrationSchema
} from "@shared/schema";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

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
      res.json({ user: { ...user, password: undefined, resetToken: undefined, resetTokenExpiry: undefined } });
    } catch (error) {
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
      
      const userWithHashedPassword = {
        ...userData,
        password: hashedPassword,
      };
      
      const user = await storage.createUser(userWithHashedPassword);
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
      
      await storage.updateUser(user.id, {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null,
      });
      
      res.json({ message: "Senha redefinida com sucesso" });
    } catch (error) {
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // User management routes (for admin)
  app.post("/api/users", async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      
      // Check if email already exists
      const existingByEmail = await storage.getUserByEmail(userData.email);
      if (existingByEmail) {
        return res.status(400).json({ message: "E-mail já cadastrado" });
      }

      // Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(userData.password, saltRounds);
      
      const userWithHashedPassword = {
        ...userData,
        password: hashedPassword,
      };
      
      const user = await storage.createUser(userWithHashedPassword);
      res.json({ ...user, password: undefined, resetToken: undefined, resetTokenExpiry: undefined });
    } catch (error) {
      res.status(400).json({ message: "Erro ao criar usuário" });
    }
  });

  app.get("/api/users", async (req, res) => {
    try {
      const users = await storage.getUsers();
      const safeUsers = users.map(user => ({ ...user, password: undefined }));
      res.json(safeUsers);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar usuários" });
    }
  });

  // Update user profile route
  app.patch("/api/users/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      // If updating password, verify current password and hash new one
      if (updateData.newPassword) {
        if (!updateData.currentPassword) {
          return res.status(400).json({ message: "Senha atual é obrigatória para alterar senha" });
        }
        
        const user = await storage.getUser(id);
        if (!user) {
          return res.status(404).json({ message: "Usuário não encontrado" });
        }
        
        const isValidPassword = await bcrypt.compare(updateData.currentPassword, user.password);
        if (!isValidPassword) {
          return res.status(400).json({ message: "Senha atual incorreta" });
        }
        
        // Hash new password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(updateData.newPassword, saltRounds);
        updateData.password = hashedPassword;
      }
      
      // Remove password-related fields that shouldn't be stored
      const { currentPassword, newPassword, confirmPassword, ...profileData } = updateData;
      
      if (profileData.email) {
        const existingByEmail = await storage.getUserByEmail(profileData.email);
        if (existingByEmail && existingByEmail.id !== id) {
          return res.status(400).json({ message: "E-mail já está em uso" });
        }
      }
      
      const updatedUser = await storage.updateUser(id, profileData);
      res.json({ ...updatedUser, password: undefined, resetToken: undefined, resetTokenExpiry: undefined });
    } catch (error) {
      res.status(500).json({ message: "Erro ao atualizar usuário" });
    }
  });

  // User approval route (admin only)
  app.patch("/api/users/:id/approval", async (req, res) => {
    try {
      const { id } = req.params;
      const { status, role } = req.body;
      
      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ message: "Status inválido" });
      }
      
      const updatedUser = await storage.approveUser(id, status, role);
      if (!updatedUser) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }
      
      res.json({ ...updatedUser, password: undefined, resetToken: undefined, resetTokenExpiry: undefined });
    } catch (error) {
      res.status(500).json({ message: "Erro ao aprovar usuário" });
    }
  });

  // Events routes
  app.get("/api/events", async (req, res) => {
    try {
      const events = await storage.getEvents();
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
      const eventData = insertEventSchema.parse(req.body);
      const event = await storage.createEvent(eventData);
      res.json(event);
    } catch (error) {
      res.status(400).json({ message: "Dados inválidos" });
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
      const collaboratorData = insertCollaboratorSchema.parse(req.body);
      const collaborator = await storage.createCollaborator(collaboratorData);
      res.json(collaborator);
    } catch (error) {
      res.status(400).json({ message: "Dados inválidos" });
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
      const { eventId } = req.query;
      
      let inclusions = await storage.getTeamInclusions();
      
      // Filtrar por eventId se fornecido
      if (eventId && eventId !== 'all') {
        inclusions = inclusions.filter(inclusion => inclusion.eventId === eventId);
      }
      
      res.json(inclusions);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar inclusões de equipe" });
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
      console.log("🔧 PATCH team-inclusion:", id, req.body);
      const updates = { 
        ...req.body, 
        updatedAt: new Date(),
        updatedBy: req.body.updatedBy || null // frontend deve enviar o ID do usuário que está editando
      };
      console.log("🔧 Updates to apply:", updates);
      const inclusion = await storage.updateTeamInclusion(id, updates);
      res.json(inclusion);
    } catch (error) {
      console.error("❌ Error updating team inclusion:", error);
      res.status(400).json({ message: "Erro ao atualizar inclusão", details: error.message });
    }
  });

  app.delete("/api/team-inclusions/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteTeamInclusion(id);
      res.json({ message: "Inclusão removida com sucesso" });
    } catch (error) {
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
              flightReturnSuggestedTime: horario,
              updatedAt: new Date()
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
      const ticketData = insertTicketSchema.parse(req.body);
      const ticket = await storage.createTicket(ticketData);
      res.json(ticket);
    } catch (error) {
      res.status(400).json({ message: "Dados inválidos" });
    }
  });

  app.patch("/api/tickets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = { 
        ...req.body, 
        updatedAt: new Date(),
        updatedBy: req.body.updatedBy || null // frontend deve enviar o ID do usuário que está editando
      };
      const ticket = await storage.updateTicket(id, updates);
      res.json(ticket);
    } catch (error) {
      res.status(400).json({ message: "Erro ao atualizar passagem" });
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

  // Attachment routes with real object storage
  app.post("/api/attachments/upload", async (req, res) => {
    try {
      const { ObjectStorageService } = await import("./objectStorage");
      const objectStorageService = new ObjectStorageService();
      
      // Gerar ID único para o anexo
      const attachmentId = `ATT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`.toUpperCase();
      
      // Obter URL de upload do object storage
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      
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
      const { ObjectStorageService, ObjectNotFoundError } = await import("./objectStorage");
      const objectStorageService = new ObjectStorageService();
      
      try {
        // Verificar se o arquivo existe no storage
        const objectFile = await objectStorageService.getObjectEntityFile(`/objects/uploads/${id}`);
        
        // Definir metadados customizados no arquivo
        await objectFile.setMetadata({
          metadata: {
            'custom:originalFileName': fileName,
            'custom:uploadedAt': new Date().toISOString(),
          }
        });
        
        res.json({
          message: "Upload confirmado com sucesso",
          attachmentId: id,
          fileName,
          fileType,
          fileSize
        });
      } catch (error) {
        if (error instanceof ObjectNotFoundError) {
          res.status(404).json({ message: "Arquivo não encontrado no storage" });
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error("Erro ao confirmar upload:", error);
      res.status(500).json({ message: "Erro ao confirmar upload do anexo" });
    }
  });

  app.get("/api/attachments/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { ObjectStorageService, ObjectNotFoundError } = await import("./objectStorage");
      const objectStorageService = new ObjectStorageService();
      
      try {
        // Tentar buscar o arquivo no object storage
        const objectFile = await objectStorageService.getObjectEntityFile(`/objects/uploads/${id}`);
        const [metadata] = await objectFile.getMetadata();
        
        // Extrair nome original dos metadados customizados
        const originalFileName = metadata.metadata?.['custom:originalFileName'] || metadata.name || `Anexo_${id.slice(-8)}`;
        
        // Retornar informações do arquivo real
        res.json({
          id,
          name: originalFileName,
          type: metadata.contentType || "application/octet-stream",
          size: metadata.size ? `${(parseInt(metadata.size) / 1024 / 1024).toFixed(2)} MB` : "Desconhecido",
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
      const { ObjectStorageService, ObjectNotFoundError } = await import("./objectStorage");
      const objectStorageService = new ObjectStorageService();
      
      const objectFile = await objectStorageService.getObjectEntityFile(`/objects/uploads/${id}`);
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
      const { ObjectStorageService, ObjectNotFoundError } = await import("./objectStorage");
      const objectStorageService = new ObjectStorageService();
      
      const objectFile = await objectStorageService.getObjectEntityFile(`/objects/uploads/${id}`);
      
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

  const httpServer = createServer(app);
  return httpServer;
}
