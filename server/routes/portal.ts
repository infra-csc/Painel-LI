/**
 * Portal Norte — API de gestão de usuários chamada server-to-server.
 * Rotas: GET/POST /api/portal/users, PATCH/DELETE /api/portal/users/:email.
 * Autenticação: Bearer PORTAL_API_TOKEN (SSO_SECRET aceito com aviso de
 * depreciação). Cria, atualiza e desativa contas que o portal provisiona.
 */
import type { Express, Request, Response } from "express";
import type { User } from "@shared/schema";
import { storage } from "../storage";
import { destruirSessoesDoUsuario, invalidarCacheDeUsuario, papelDoPortal } from "../auth-guards";
import { log } from "../vite";
import bcrypt from "bcryptjs";
import { safeTokenEqual } from "./_compartilhado";

export function registrarPortal(app: Express): void {
  // ── Portal Norte — API de Gestão de Usuários ──────────────────────────────
  // Endpoints chamados server-to-server pelo Portal Norte para gerenciar usuários.
  // Autenticação: Authorization: Bearer <PORTAL_API_TOKEN> (23/09). Enquanto a
  // env não existir, SSO_SECRET continua aceito com aviso de depreciação no
  // boot (server/index.ts) — o mesmo segredo assinar o JWT e autenticar esta
  // API significava que vazar um vazava o outro.

  const validatePortalSecret = (req: Request, res: Response): boolean => {
    const authHeader = req.headers["authorization"] as string | undefined;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const secret = process.env.PORTAL_API_TOKEN || process.env.SSO_SECRET;
    if (!secret || !token || !safeTokenEqual(token, secret)) {
      res.status(401).json({ message: "Não autorizado" });
      return false;
    }
    return true;
  };

  // Resposta padrão do portal: nunca password/resetToken (semSegredos) e só
  // os campos que o portal usa.
  const usuarioParaOPortal = (u: User) => ({
    id: u.id, email: u.email, name: u.name, role: u.role,
    area: u.area, status: u.status, isActive: u.isActive, createdAt: u.createdAt,
  });
  const emailNormalizado = (e: unknown): string => String(e ?? "").trim().toLowerCase();

  // GET /api/portal/users — listar todos os usuários
  app.get("/api/portal/users", async (req, res) => {
    if (!validatePortalSecret(req, res)) return;
    try {
      const allUsers = await storage.getUsers();
      return res.json(allUsers.map(usuarioParaOPortal));
    } catch (err) {
      console.error("[Portal API] Erro ao listar usuários:", err);
      return res.status(500).json({ message: "Erro interno" });
    }
  });

  // POST /api/portal/users — criar usuário
  app.post("/api/portal/users", async (req, res) => {
    if (!validatePortalSecret(req, res)) return;
    try {
      const { name, role, area } = req.body ?? {};
      const email = emailNormalizado(req.body?.email);
      if (!email || !name) return res.status(400).json({ message: "email e name são obrigatórios" });

      const existing = await storage.getUserByEmail(email);
      if (existing) return res.status(409).json({ message: "Usuário já existe", user: { id: existing.id, email: existing.email } });

      const tempPassword = await bcrypt.hash(Math.random().toString(36) + Date.now(), 10);

      const user = await storage.createUser({
        email,
        name: String(name),
        password: tempPassword,
        role: papelDoPortal(role),
        status: "approved",
        area: area || null,
        isActive: true,
      });

      log(`[Portal API] Usuário criado: ${user.id}`);
      return res.status(201).json(usuarioParaOPortal(user));
    } catch (err) {
      console.error("[Portal API] Erro ao criar usuário:", err);
      return res.status(500).json({ message: "Erro interno" });
    }
  });

  // PATCH /api/portal/users/:email — atualizar usuário por email
  app.patch("/api/portal/users/:email", async (req, res) => {
    if (!validatePortalSecret(req, res)) return;
    try {
      const email = emailNormalizado(decodeURIComponent(req.params.email));
      const user = await storage.getUserByEmail(email);
      if (!user) return res.status(404).json({ message: "Usuário não encontrado" });

      const { name, role, area, isActive, status } = req.body ?? {};
      const updates: Partial<User> = {};
      if (name !== undefined) updates.name = String(name);
      if (role !== undefined) updates.role = papelDoPortal(role);
      if (area !== undefined) updates.area = area;
      if (isActive !== undefined) updates.isActive = Boolean(isActive);
      if (status !== undefined) {
        if (!["pending", "approved", "rejected"].includes(String(status))) {
          return res.status(400).json({ message: "status inválido" });
        }
        updates.status = String(status);
      }

      const updated = await storage.updateUser(user.id, updates);
      invalidarCacheDeUsuario(user.id);
      if (updates.isActive === false || updates.status === "rejected") await destruirSessoesDoUsuario(user.id);
      log(`[Portal API] Usuário atualizado: ${user.id}`);
      return res.json(usuarioParaOPortal(updated!));
    } catch (err) {
      console.error("[Portal API] Erro ao atualizar usuário:", err);
      return res.status(500).json({ message: "Erro interno" });
    }
  });

  // DELETE /api/portal/users/:email — desativar usuário por email
  app.delete("/api/portal/users/:email", async (req, res) => {
    if (!validatePortalSecret(req, res)) return;
    try {
      const email = emailNormalizado(decodeURIComponent(req.params.email));
      const user = await storage.getUserByEmail(email);
      if (!user) return res.status(404).json({ message: "Usuário não encontrado" });

      await storage.updateUser(user.id, { isActive: false, status: "rejected" });
      await destruirSessoesDoUsuario(user.id);
      log(`[Portal API] Usuário desativado: ${user.id}`);
      return res.json({ message: "Usuário desativado com sucesso" });
    } catch (err) {
      console.error("[Portal API] Erro ao desativar usuário:", err);
      return res.status(500).json({ message: "Erro interno" });
    }
  });
}
