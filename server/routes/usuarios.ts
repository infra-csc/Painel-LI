/**
 * Usuários internos: criar, listar, editar, aprovar, inativar, permissão de
 * cenotécnica e reset de senha por administrador.
 * Papéis: admin (tudo); RH e Compras criam/editam operadores; o próprio
 * usuário edita nome, e-mail e senha.
 */
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { userApprovalSchema } from "@shared/schema";
import { normalizeRole } from "@shared/roles";
import { destruirSessoesDoUsuario, invalidarCacheDeUsuario, semSegredos } from "../auth-guards";
import { randomBytes } from "crypto";
import { createAuditLog, requireRoles, TODOS_OS_PAPEIS, primeiraMensagemDoZod } from "./_compartilhado";
import {
  SENHA_MINIMA, MSG_SENHA_DE_OUTRO_ADMIN, camposEditaveisDoUsuario, podeRedefinirSenhaDe, recusaDaEdicaoDeUsuario,
  type CampoDoUsuario,
} from "@shared/edicao-de-usuario";
import bcrypt from "bcryptjs";

export function registrarUsuarios(app: Express): void {
  // ── Usuários ────────────────────────────────────────────────────────────────
  // Regras (23/09): quem cria/edita/aprova/inativa é sempre verificado por
  // requireRoles (papel do banco, nunca do corpo); o corpo passa por schema
  // estrito (nada de isActive, canApproveCenotecnica, mustChangePassword,
  // resetToken ou status por mass assignment); toda resposta sai por
  // semSegredos; toda alteração invalida o cache do gate global.
  const emailSchema = z.string().trim().email("E-mail inválido").transform((e) => e.toLowerCase());
  // Área vazia ("" ou só espaços) vira null (08/10): antes o banco guardava "".
  const areaSchema = z.string().trim().nullable().transform((a) => a || null).optional();
  const senhaSchema = z.string().min(SENHA_MINIMA, `Senha deve ter pelo menos ${SENHA_MINIMA} caracteres`);
  const criarUsuarioSchema = z.object({
    email: emailSchema,
    name: z.string().trim().min(1, "Nome é obrigatório"),
    password: senhaSchema.optional(),
    role: z.enum(TODOS_OS_PAPEIS),
    area: areaSchema,
  }).strict();
  const editarUsuarioSchema = z.object({
    name: z.string().trim().min(1, "Nome é obrigatório").optional(),
    email: emailSchema.optional(),
    role: z.enum(TODOS_OS_PAPEIS).optional(),
    status: z.enum(["pending", "approved", "rejected"]).optional(),
    area: areaSchema,
    currentPassword: z.string().optional(),
    newPassword: senhaSchema.optional(),
    confirmPassword: z.string().optional(),
  }).strict();

  // Criar usuário: admin escolhe qualquer papel; RH e Compras só criam
  // operadores (production/function_area) — antes podiam criar outro RH ou
  // outro Compras. Senha é opcional (login é via Portal Norte).
  app.post("/api/users", async (req, res) => {
    const currentUser = await requireRoles(req, res, ["admin", "financial", "purchasing"]);
    if (!currentUser) return;
    const isAdmin = normalizeRole(currentUser.role) === 'admin';

    const parsed = criarUsuarioSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: primeiraMensagemDoZod(parsed.error) });
    const userData = parsed.data;

    if (!isAdmin && userData.role !== "production" && userData.role !== "function_area") {
      return res.status(403).json({ message: "RH e Compras só criam usuários de Produção ou Área de Função." });
    }

    const existingByEmail = await storage.getUserByEmail(userData.email);
    if (existingByEmail) {
      return res.status(409).json({ message: "E-mail já cadastrado" });
    }

    // Hash password — gera uma senha aleatória se não for fornecida (login via Microsoft/SSO)
    const rawPassword = userData.password || (randomBytes(24).toString("hex"));
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    const user = await storage.createUser({
      email: userData.email,
      name: userData.name,
      password: hashedPassword,
      role: userData.role,
      area: userData.area ?? null,
      status: "approved", // criação interna não passa por aprovação
    });

    await createAuditLog('create', 'user', user.id, user, currentUser.id, currentUser.name, undefined, req);

    res.json(semSegredos(user));
  });

  app.get("/api/users", async (req, res) => {
    // Admins, RH, Compras e Logística listam usuários (usuário efetivo — simulação)
    const currentUser = await requireRoles(req, res, ["admin", "financial", "purchasing", "production"]);
    if (!currentUser) return;
    const users = await storage.getUsers();
    res.json(users.map(semSegredos));
  });

  // Editar usuário. Quem pode o quê:
  //   - o próprio usuário: name, email e a própria senha (com a senha atual);
  //   - RH/Compras em terceiros: só name;
  //   - admin em terceiros: name, email, role, status, area;
  //   - ninguém muda o PRÓPRIO papel/status (nem admin — evita se trancar fora).
  app.patch("/api/users/:id", async (req, res) => {
    const currentUser = await requireRoles(req, res, TODOS_OS_PAPEIS);
    if (!currentUser) return;

    const { id } = req.params;
    const parsed = editarUsuarioSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: primeiraMensagemDoZod(parsed.error) });
    const updateData = parsed.data;

    const targetUser = await storage.getUser(id);
    if (!targetUser) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }

    // Quem edita o quê: regra única em shared/edicao-de-usuario.ts (08/10 — a
    // tela de Usuários usa a mesma para travar campos e botões). Mesmas
    // mensagens e a mesma ordem de antes:
    //   - Logística Interna/Área de Função não editam terceiros;
    //   - ninguém muda o próprio perfil/status;
    //   - perfil, status e área só por administrador (antes o servidor
    //     descartava em silêncio; agora 403 com mensagem clara);
    //   - e-mail é a chave do SSO: o de terceiros, só admin.
    const isSelfUpdate = currentUser.id === id;
    const enviados = (["name", "email", "role", "status", "area"] as const).filter((c) => updateData[c] !== undefined);
    const recusa = recusaDaEdicaoDeUsuario(currentUser.role, isSelfUpdate, enviados);
    if (recusa) return res.status(403).json({ message: recusa });
    // Senha: só a própria, com a atual
    if (updateData.newPassword !== undefined && !isSelfUpdate) {
      return res.status(403).json({ message: "A senha só pode ser alterada pelo próprio usuário. Use o reset de senha." });
    }

    let hashedNewPassword: string | undefined = undefined;
    if (updateData.newPassword) {
      if (!updateData.currentPassword) {
        return res.status(400).json({ message: "Senha atual é obrigatória para alterar senha" });
      }
      const isValidPassword = await bcrypt.compare(updateData.currentPassword, targetUser.password);
      if (!isValidPassword) {
        return res.status(400).json({ message: "Senha atual incorreta" });
      }
      hashedNewPassword = await bcrypt.hash(updateData.newPassword, 10);
    }

    const allowedFields: readonly CampoDoUsuario[] = camposEditaveisDoUsuario(currentUser.role, isSelfUpdate);

    const filteredData: Partial<typeof targetUser> = {};
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) (filteredData as Record<string, unknown>)[field] = updateData[field];
    }
    if (hashedNewPassword) {
      filteredData.password = hashedNewPassword;
      filteredData.mustChangePassword = false; // trocou: o gate libera
    }
    if (Object.keys(filteredData).length === 0) {
      return res.status(400).json({ message: "Nada para alterar" });
    }

    if (filteredData.email) {
      const existingByEmail = await storage.getUserByEmail(filteredData.email);
      if (existingByEmail && existingByEmail.id !== id) {
        return res.status(409).json({ message: "E-mail já está em uso" });
      }
    }

    const updatedUser = await storage.updateUser(id, filteredData);
    invalidarCacheDeUsuario(id);
    if (filteredData.status === "rejected") await destruirSessoesDoUsuario(id);

    await createAuditLog('update', 'user', id, updatedUser, currentUser.id, currentUser.name, targetUser, req);

    res.json(semSegredos(updatedUser!));
  });

  // Aprovar/rejeitar usuário — só admin (antes RH, Compras e Logística também
  // podiam, e o corpo não era validado: `role` aceitava qualquer string).
  app.patch("/api/users/:id/approval", async (req, res) => {
    const currentUser = await requireRoles(req, res, ["admin"]);
    if (!currentUser) return;

    const { id } = req.params;
    const parsed = userApprovalSchema.strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: primeiraMensagemDoZod(parsed.error) });
    const { status, role } = parsed.data;

    if (id === currentUser.id) {
      return res.status(403).json({ message: "Você não pode alterar o próprio status ou perfil." });
    }

    const targetUser = await storage.getUser(id);
    if (!targetUser) return res.status(404).json({ message: "Usuário não encontrado" });
    const updatedUser = await storage.approveUser(id, status, role);
    invalidarCacheDeUsuario(id);
    if (status === 'rejected') await destruirSessoesDoUsuario(id);

    await createAuditLog(
      status === 'approved' ? 'approve' : 'reject',
      'user', id, updatedUser, currentUser.id, currentUser.name, targetUser, req,
    );

    res.json(semSegredos(updatedUser!));
  });

  // Inativar/reativar usuário — só admin. Inativar derruba as sessões abertas
  // (antes a pessoa continuava logada até o cookie vencer).
  app.patch("/api/users/:id/toggle-active", async (req, res) => {
    const admin = await requireRoles(req, res, ["admin"]);
    if (!admin) return;

    const userId = req.params.id;
    if (userId === admin.id) {
      return res.status(403).json({ message: "Você não pode inativar a própria conta." });
    }
    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ message: "Usuário não encontrado" });

    const newIsActive = !user.isActive;
    const updatedUser = await storage.updateUser(userId, { isActive: newIsActive });
    invalidarCacheDeUsuario(userId);

    // Se o usuário foi desativado, remove-o dos responsáveis de todas as
    // funções e encerra as sessões dele
    if (!newIsActive) {
      await storage.removeUserFromAllFunctions(userId);
      await destruirSessoesDoUsuario(userId);
    }

    await createAuditLog('update', 'user', userId, updatedUser, admin.id, admin.name, user, req);

    res.json(semSegredos(updatedUser!));
  });

  // Admin: Toggle can_approve_cenotecnica permission
  app.patch("/api/users/:id/toggle-cenotecnica-approval", async (req, res) => {
    const admin = await requireRoles(req, res, ["admin"]);
    if (!admin) return;

    const { id } = req.params;
    const targetUser = await storage.getUser(id);
    if (!targetUser) return res.status(404).json({ message: "Usuário não encontrado" });

    const newValue = !targetUser.canApproveCenotecnica;
    const updated = await storage.updateUser(id, { canApproveCenotecnica: newValue });
    invalidarCacheDeUsuario(id);
    await createAuditLog('update', 'user', id, updated, admin.id, admin.name, targetUser, req);
    res.json(semSegredos(updated!));
  });

  // Reset de senha por admin — só admin, nunca contra OUTRO admin (a si mesmo
  // pode). Senha mínima 8; a pessoa é obrigada a trocar no próximo acesso.
  app.post("/api/users/:id/reset-password", async (req, res) => {
    const admin = await requireRoles(req, res, ["admin"]);
    if (!admin) return;
    // Em produção não existe senha no Painel: o acesso é só pelo Portal Norte
    // (conta Microsoft). Redefinir aqui só marcava "trocar senha no próximo
    // acesso" e prendia a pessoa num diálogo (30/09).
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ message: "Em produção o acesso é pelo Portal Norte — não há senha para redefinir." });
    }

    const userId = req.params.id;
    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ message: "Usuário não encontrado" });
    if (!podeRedefinirSenhaDe(user.role, user.id === admin.id)) {
      return res.status(403).json({ message: MSG_SENHA_DE_OUTRO_ADMIN });
    }

    const { newPassword } = req.body ?? {};
    if (!newPassword || typeof newPassword !== "string" || newPassword.length < SENHA_MINIMA) {
      return res.status(400).json({ message: `Nova senha deve ter pelo menos ${SENHA_MINIMA} caracteres` });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await storage.updateUser(userId, {
      password: hashedPassword,
      mustChangePassword: true,
      resetToken: null,
      resetTokenExpiry: null,
    });
    invalidarCacheDeUsuario(userId);
    if (userId !== admin.id) await destruirSessoesDoUsuario(userId);

    await createAuditLog('update', 'user', userId, { ...user, password: '[CHANGED]', mustChangePassword: true }, admin.id, admin.name, user, req);

    res.json({ message: "Senha resetada com sucesso" });
  });
}
