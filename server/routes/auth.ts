/**
 * Autenticação e sessão: SSO do Portal Norte, /me, logout, login por senha
 * (só fora de produção) e redefinição de senha (forgot/reset).
 * Papéis: qualquer pessoa (rotas fora do gate global de sessão).
 */
import type { Express } from "express";
import { storage } from "../storage";
import {
  autenticarPorSso, destruirSessoesDoUsuario, iniciarSessao, invalidarCacheDeUsuario,
  semSegredos, SsoError,
} from "../auth-guards";
import { log } from "../vite";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { createAuditLog } from "./_compartilhado";

export function registrarAuth(app: Express): void {
  // ── SSO Endpoint ──────────────────────────────────────────────────────────
  // O portal externo gera um JWT curto e redireciona para:
  //   https://logistica.app/?portal_sso=<JWT>&portal_return=<URL>
  // Normalmente o middleware de server/index.ts consome o token antes do React
  // carregar; esta rota é o caminho alternativo quando o client ainda vê o
  // parâmetro. JWT do portal Norte: HS256, issuer="norte-portal", exp ≤ 10 min.
  // Payload: { email, name, role, level, app }. A verificação e as regras de
  // conta são as MESMAS do middleware (server/auth-guards.ts).
  app.get("/api/auth/sso", async (req, res) => {
    const { token } = req.query;
    if (!token || typeof token !== "string") {
      return res.status(400).json({ message: "Token SSO ausente" });
    }
    // Em produção o boot (server/index.ts) garante SSO_SECRET/SESSION_SECRET.
    // Sem eles (só possível em dev), usamos string vazia: a verificação falha
    // fechada em vez de cair no segredo público versionado.
    const rawSecret = process.env.SSO_SECRET || process.env.SESSION_SECRET || "";
    try {
      const user = await autenticarPorSso(req, token, rawSecret);
      return res.json({ user: semSegredos(user) });
    } catch (error) {
      if (error instanceof SsoError) {
        console.warn(`[SSO] ${error.codigo}: ${error.message}`);
        if (error.codigo === "not_approved") return res.status(403).json({ message: error.message });
        if (error.codigo === "sem_email") return res.status(400).json({ message: error.message });
        return res.status(401).json({ message: "Token SSO inválido ou expirado" });
      }
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

      // A autenticação (sessão + flag SSO) é SEMPRE do usuário REAL — a
      // simulação roda por cima da sessão real e não mexe nisso.
      const realUserId = req.session.userId;
      if (!realUserId) return res.status(401).json({ message: "Não autenticado" });

      // Exige autenticação via SSO — sessões de login direto (sem flag) são rejeitadas
      // Em desenvolvimento, o check é ignorado para facilitar testes locais
      const isDev = process.env.NODE_ENV !== 'production';
      if (!isDev && !req.session.ssoAuthenticated) {
        req.session.destroy(() => {});
        return res.status(401).json({ message: "Não autenticado", requirePortal: true });
      }

      // Modo Simulação: devolve o usuário SIMULADO + metadados para o banner.
      let simulatedId = req.session.simulatedUserId;
      let user = await storage.getUser(simulatedId ?? realUserId);
      if (simulatedId && !user) {
        // Usuário simulado sumiu do banco — encerra a simulação e volta ao real
        delete req.session.simulatedUserId;
        delete req.session.simulatedSince;
        simulatedId = undefined;
        user = await storage.getUser(realUserId);
      }
      if (!user) {
        req.session.destroy(() => {});
        return res.status(401).json({ message: "Sessão inválida" });
      }
      // Conta inativada/rejeitada depois do login: a sessão morre aqui também
      // (o gate global não cobre /api/auth/*).
      if (user.isActive === false || user.status !== "approved") {
        req.session.destroy(() => {});
        return res.status(401).json({ message: "Conta sem acesso. Contate o administrador." });
      }

      let simulation: { active: true; realUserName: string; simulatedSince: string | null } | null = null;
      if (simulatedId) {
        const realUser = await storage.getUser(realUserId);
        simulation = {
          active: true,
          realUserName: realUser?.name ?? "Administrador",
          simulatedSince: req.session.simulatedSince ?? null,
        };
      }

      const portalReturnUrl = req.session.portalReturnUrl || null;
      return res.json({ user: semSegredos(user), portalReturnUrl, simulation });
    } catch {
      return res.status(500).json({ message: "Erro interno" });
    }
  });

  // Login por e-mail e senha — SÓ fora de produção (23/09). Em produção o
  // acesso é pelo Portal Norte: o gate global já exigia sessão de SSO, então
  // uma sessão de senha nunca serviria para nada; melhor recusar de cara do
  // que aceitar credenciais para depois negar tudo. (Não existe flag
  // `allowPasswordLogin` no schema — se um dia precisar, é aqui que entra.)
  app.post("/api/auth/login", async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ message: "Em produção o acesso é pelo Portal Norte" });
    }
    try {
      const email = String(req.body?.email ?? "").trim().toLowerCase();
      const password = req.body?.password;

      if (!email || !password || typeof password !== "string") {
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

      // Sessão NOVA (regenerate) — fixação de sessão
      await iniciarSessao(req, user, { sso: false });

      if (user.mustChangePassword) {
        return res.json({ mustChangePassword: true, user: semSegredos(user) });
      }

      // Log successful login
      try {
        await createAuditLog('login', 'user', user.id, user, user.id, user.name, undefined, req);
      } catch (auditError) {
        console.error('[Login] Audit log failed:', auditError);
        // Don't fail login if audit log fails
      }

      res.json({ user: semSegredos(user) });
    } catch (error) {
      console.error('[Login] Error:', error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // POST /api/auth/register (cadastro público) foi REMOVIDO em 17/08/2026:
  // usuários são criados apenas por admin/RH/Compras via POST /api/users
  // (login é pelo Portal Norte/Microsoft). Uma rota sem autenticação criava
  // contas "pending" à vontade — superfície de abuso sem uso legítimo.

  // O token de redefinição é guardado como HASH (sha256) desde 23/09: quem
  // lê a tabela users (dump, log, backup) não consegue usá-lo. O valor em
  // claro só existe para ser entregue ao usuário (envio por e-mail ainda não
  // implementado; até lá o reset é feito por um admin em
  // POST /api/users/:id/reset-password).
  const hashDoToken = (token: string) => createHash("sha256").update(token).digest("hex");
  const RESPOSTA_GENERICA_RESET = "Se o e-mail existir, você receberá instruções de redefinição";

  // Forgot password route
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const email = String(req.body?.email ?? "").trim().toLowerCase();
      if (!email) {
        return res.status(400).json({ message: "E-mail é obrigatório" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user) {
        // Resposta idêntica à de sucesso: não revelar se o e-mail existe
        return res.json({ message: RESPOSTA_GENERICA_RESET });
      }

      const resetToken = randomBytes(32).toString('hex');
      const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

      await storage.updateUser(user.id, {
        resetToken: hashDoToken(resetToken),
        resetTokenExpiry,
      });

      // O token NUNCA pode voltar na resposta HTTP — quem chama esta rota é
      // anônimo, então devolvê-lo permite takeover de qualquer conta.
      log(`[ForgotPassword] Token gerado para o usuário ${user.id}`);

      res.json({ message: RESPOSTA_GENERICA_RESET });
    } catch {
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // Reset password route
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, newPassword } = req.body ?? {};

      if (!token || typeof token !== "string" || !newPassword || typeof newPassword !== "string") {
        return res.status(400).json({ message: "Token e nova senha são obrigatórios" });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ message: "A nova senha deve ter pelo menos 8 caracteres" });
      }

      const user = await storage.getUserByResetToken(hashDoToken(token));
      if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
        return res.status(400).json({ message: "Token inválido ou expirado" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      const updatedUser = await storage.updateUser(user.id, {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null,
        mustChangePassword: false,
      });
      invalidarCacheDeUsuario(user.id);
      // Senha trocada: sessões antigas (possivelmente de quem motivou o reset) caem
      await destruirSessoesDoUsuario(user.id);

      await createAuditLog('reset_password', 'user', user.id, updatedUser, user.id, user.name, user, req);

      res.json({ message: "Senha redefinida com sucesso" });
    } catch {
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });
}
