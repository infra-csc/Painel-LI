/**
 * Funções e responsáveis: catálogo de funções, usuários vinculados à função,
 * responsáveis (validador/aprovador) e o cadastro SEPARADO de responsáveis do
 * módulo de Escala.
 * Papéis: cadastro (admin/Compras/Logística) mantém funções e responsáveis;
 * responsáveis da Escala são só do admin; leitura aberta a qualquer sessão.
 */
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { db } from "../db";
import { users, functionManagers as functionManagersTable, insertFunctionSchema } from "@shared/schema";
import { eq, sql as drizzleSql } from "drizzle-orm";
import { normalizeRole } from "@shared/roles";
import { effectiveUserId } from "../simulation";
import { createAuditLog, cacheDeCatalogo, requireRoles, CADASTRO_ROLES } from "./_compartilhado";

export function registrarFuncoesEResponsaveis(app: Express): void {
  // Functions routes
  // Devolve cada função com `managers: {userId, userName}[]` embutido —
  // a tela de Funções não precisa mais de 1 request por linha
  // (/api/functions/:id/managers continua existindo por compat).
  app.get("/api/functions", async (req, res) => {
    try {
      const functions = await storage.getFunctionsWithManagers();
      cacheDeCatalogo(res);
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

  // Get functions for current user (usuário efetivo — na simulação devolve as
  // funções do usuário SIMULADO, como ele veria)
  app.get("/api/functions/my-functions", async (req, res) => {
    try {
      const userId = effectiveUserId(req);
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
    const ator = await requireRoles(req, res, CADASTRO_ROLES);
    if (!ator) return;
    try {
      const functionData = insertFunctionSchema.parse(req.body);
      const func = await storage.createFunction(functionData);
      await createAuditLog("create", "function", func.id, func, ator.id, ator.name, undefined, req);
      res.json(func);
    } catch (error) {
      res.status(400).json({ message: "Dados inválidos" });
    }
  });

  app.patch("/api/functions/:id", async (req, res) => {
    const ator = await requireRoles(req, res, CADASTRO_ROLES);
    if (!ator) return;
    try {
      const { id } = req.params;
      const functionData = insertFunctionSchema.partial().parse(req.body);
      const anterior = await storage.getFunction(id);
      if (!anterior) return res.status(404).json({ message: "Função não encontrada" });
      const func = await storage.updateFunction(id, functionData);
      await createAuditLog("update", "function", id, func, ator.id, ator.name, anterior, req);
      res.json(func);
    } catch (error) {
      res.status(400).json({ message: "Erro ao atualizar função" });
    }
  });

  app.delete("/api/functions/:id", async (req, res) => {
    const ator = await requireRoles(req, res, CADASTRO_ROLES);
    if (!ator) return;
    try {
      const { id } = req.params;
      const anterior = await storage.getFunction(id);
      if (!anterior) return res.status(404).json({ message: "Função não encontrada" });
      await storage.deleteFunction(id);
      await createAuditLog("delete", "function", id, anterior, ator.id, ator.name, undefined, req);
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
  /**
   * Responsáveis por função, com o NOME de quem responde (01/09).
   *
   * A Escalação precisa dizer "quem escala esta vaga" na linha que o usuário
   * não pode mexer. Só o userId não serve para escrever isso, e carregar a
   * lista inteira de usuários na tela para traduzir um id seria desproporcional.
   *
   * O campo é aditivo: quem já consumia { functionId, userId } continua igual.
   */
  app.get("/api/function-managers/all", async (req, res) => {
    try {
      const all = await db
        .select({
          functionId: functionManagersTable.functionId,
          userId: functionManagersTable.userId,
          userName: users.name,
        })
        .from(functionManagersTable)
        .leftJoin(users, eq(functionManagersTable.userId, users.id));
      res.json(all);
    } catch (error) {
      console.error("erro ao buscar responsáveis:", error);
      res.status(500).json({ message: "Erro ao buscar responsáveis" });
    }
  });

  // ── Responsáveis do MÓDULO DE ESCALA — cadastro SEPARADO ──────────────────
  // Decisão do dono (27/08): esta lista não é a de responsáveis da função. Elas
  // moravam na mesma tabela, e mexer em uma mexia na outra — cadastrar um
  // aprovador dava acesso de responsável na Escalação, e tirar alguém daqui
  // tirava da lista clássica. Agora são tabelas diferentes.
  app.get("/api/scaling-function-managers", async (_req, res) => {
    try {
      res.json(await storage.getAllScalingManagers());
    } catch {
      res.status(500).json({ message: "Erro ao buscar responsáveis da Escala" });
    }
  });

  app.post("/api/scaling-function-managers", async (req, res) => {
    // Só o administrador cuida deste cadastro (permissão própria, decisão de 26/08).
    const actor = await requireRoles(req, res, ["admin"]);
    if (!actor) return;
    const parsed = z.object({
      functionId: z.string().min(1),
      userId: z.string().min(1),
      role: z.enum(["validador", "aprovador"]).default("validador"),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.flatten() });
    try {
      const row = await storage.addScalingManager(parsed.data);
      await createAuditLog("create", "scaling_function_manager", row.id, row, actor.id, actor.name, undefined, req);
      res.json(row);
    } catch {
      res.status(400).json({ message: "Erro ao adicionar responsável da Escala" });
    }
  });

  app.delete("/api/scaling-function-managers/:functionId/:userId", async (req, res) => {
    const actor = await requireRoles(req, res, ["admin"]);
    if (!actor) return;
    const role = req.query.role === "aprovador" || req.query.role === "validador" ? req.query.role : undefined;
    try {
      await storage.removeScalingManager(req.params.functionId, req.params.userId, role);
      await createAuditLog("delete", "scaling_function_manager", `${req.params.functionId}:${req.params.userId}`,
        { functionId: req.params.functionId, userId: req.params.userId, role: role ?? "todos" }, actor.id, actor.name, undefined, req);
      res.json({ success: true });
    } catch {
      res.status(400).json({ message: "Erro ao remover responsável da Escala" });
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

      // role opcional: 'validador' (padrão, comportamento histórico) | 'aprovador'
      const parsedBody = z.object({
        userId: z.string().min(1, "userId é obrigatório"),
        role: z.enum(["validador", "aprovador"]).optional().default("validador"),
      }).safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({ message: "Dados inválidos", errors: parsedBody.error.flatten() });
      }
      const { userId: targetUserId, role } = parsedBody.data;

      const functionManager = await storage.addManagerToFunction({
        functionId: id,
        userId: targetUserId,
        role,
      });
      await createAuditLog("create", "function_manager", `${id}:${targetUserId}`, { functionId: id, userId: targetUserId, role }, user.id, user.name, undefined, req);
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
      await createAuditLog("delete", "function_manager", `${functionId}:${targetUserId}`, { functionId, userId: targetUserId }, user.id, user.name, undefined, req);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ message: "Erro ao remover responsável da função" });
    }
  });

  // Altera o papel (validador ↔ aprovador) de um responsável já vinculado à função
  app.patch("/api/functions/:functionId/managers/:userId", async (req, res) => {
    const ator = await requireRoles(req, res, CADASTRO_ROLES);
    if (!ator) return;
    try {
      const { functionId, userId: targetUserId } = req.params;
      const parsedBody = z.object({ role: z.enum(["validador", "aprovador"]) }).safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({ message: "Papel inválido: use 'validador' ou 'aprovador'" });
      }
      const updated = await storage.updateManagerRole(functionId, targetUserId, parsedBody.data.role);
      if (!updated) return res.status(404).json({ message: "Responsável não encontrado nesta função" });
      await createAuditLog("update", "function_manager", `${functionId}:${targetUserId}`, { functionId, userId: targetUserId, role: parsedBody.data.role }, ator.id, ator.name, undefined, req);
      res.json(updated);
    } catch (error) {
      res.status(400).json({ message: "Erro ao alterar papel do responsável" });
    }
  });
}
