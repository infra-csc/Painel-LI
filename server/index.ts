import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import rateLimit from "express-rate-limit";
import { jwtVerify } from "jose";
import { pool } from "./db";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const PgSession = connectPgSimple(session);

// ── Checagem de configuração no boot ──────────────────────────────────────
// SESSION_SECRET e SSO_SECRET assinam, respectivamente, o cookie de sessão e o
// JWT do SSO. O fallback abaixo é o mesmo literal versionado neste repositório
// (público) — com ele, qualquer pessoa forja um token de SSO com role "admin".
// Por isso, EM PRODUÇÃO, subir sem os segredos é pior do que não subir: o boot
// é abortado. Em desenvolvimento o fallback é tolerado, apenas com aviso.
const IS_PROD = process.env.NODE_ENV === 'production';
const SECRET_FALLBACK = 'dev-session-secret-change-in-production';
const missingSecrets = (['SESSION_SECRET', 'SSO_SECRET'] as const).filter((v) => !process.env[v]);
if (missingSecrets.length > 0) {
  if (IS_PROD) {
    console.error(
      `[Config] FATAL: ${missingSecrets.join(', ')} não definido(s) em produção. ` +
      `Configure nos Secrets antes de expor a aplicação. Encerrando o processo.`
    );
    process.exit(1);
  }
  console.error(
    `[Config] ATENÇÃO (desenvolvimento): ${missingSecrets.join(', ')} não definido(s) — ` +
    `usando o valor padrão público. Isto é INSEGURO fora de desenvolvimento.`
  );
}

// Segredos resolvidos uma única vez. SSO_SECRET herda SESSION_SECRET só em dev
// (em produção ambos são obrigatórios, garantido pela checagem acima).
const SESSION_SECRET = process.env.SESSION_SECRET || SECRET_FALLBACK;
const SSO_SECRET = process.env.SSO_SECRET || process.env.SESSION_SECRET || SECRET_FALLBACK;

// Session interface extension
declare module 'express-session' {
  interface SessionData {
    userId?: string;
    user?: any;
  }
}

const app = express();

// Trust proxy - required for Replit
app.set('trust proxy', 1);

// Gzip compression — reduz tamanho das respostas JSON em ~70-80%
app.use(compression());

// Headers de segurança.
// Deliberadamente NÃO definimos X-Frame-Options / CSP frame-ancestors aqui:
// a aplicação é aberta dentro de um iframe do Portal Norte e qualquer um dos
// dois quebraria esse embed.
// "no-referrer" importa em especial porque o token de SSO trafega na query
// string (?portal_sso=...) — sem isso ele vaza no header Referer para
// qualquer recurso externo carregado pela página.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// Configure session middleware with PostgreSQL store
app.use(session({
  store: new PgSession({
    pool: pool as any,
    tableName: 'session',
    createTableIfMissing: true,
  }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    // Em produção o app roda sob HTTPS e é aberto a partir do Portal Norte
    // (contexto cross-site/iframe). Cookies "Lax" são bloqueados nesse caso,
    // o que derruba a sessão (cada request vira UserID: none → 401).
    // "None" + "Secure" permite o cookie de sessão em contexto cross-site.
    // Em desenvolvimento (http://localhost) mantemos Lax + secure:false.
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  },
  name: 'sessionId'
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── Rate limiting nas rotas de credencial ─────────────────────────────────
// Limites propositalmente folgados: em produção o login é via SSO do Portal
// Norte, então essas rotas quase não têm uso legítimo. O objetivo é apenas
// impedir brute force e enumeração de contas, sem atrapalhar ninguém.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Muitas tentativas. Tente novamente em alguns minutos." },
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Muitas tentativas. Tente novamente mais tarde." },
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', passwordResetLimiter);
app.use('/api/auth/reset-password', passwordResetLimiter);

// ── SSO Middleware (server-side) ──────────────────────────────────────────
// Intercepta ?portal_sso=<JWT> ANTES de qualquer renderização do React.
// Valida o token, cria a sessão e redireciona para / com URL limpa.
// Deve ficar ANTES das rotas da aplicação.
app.use(async (req, res, next) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const ssoToken = url.searchParams.get('portal_sso');
    const portalReturn = url.searchParams.get('portal_return');

    if (!ssoToken) return next();

    const rawSecret = SSO_SECRET;
    const secretKey = new TextEncoder().encode(rawSecret);

    let payload: Record<string, unknown>;
    try {
      const { payload: p } = await jwtVerify(ssoToken, secretKey, { issuer: "norte-portal" });
      payload = p as Record<string, unknown>;
    } catch {
      // Fallback sem issuer (tokens legados)
      try {
        const { payload: p } = await jwtVerify(ssoToken, secretKey);
        payload = p as Record<string, unknown>;
      } catch (err) {
        console.error("[SSO Middleware] Token inválido:", err);
        return next(); // token inválido — deixa o app decidir o que fazer
      }
    }

    const email = payload.email as string | undefined;
    if (!email) return next();

    const tokenName = payload.name as string | undefined;
    const tokenRoleRaw = payload.role as string | undefined;

    // Mapear role do portal Norte (pode vir em português) para os roles internos
    const normalizePortalRole = (r?: string): string => {
      if (!r) return "production";
      const lower = r.toLowerCase().trim();
      if (lower === "admin" || lower.includes("administrador") || lower.includes("administrator")) return "admin";
      if (lower === "financial" || lower.includes("financeiro") || lower.includes("rh") || lower.includes("recursos humanos")) return "financial";
      if (lower === "purchasing" || lower.includes("compras") || lower.includes("viagem")) return "purchasing";
      if (lower === "function_area" || lower.includes("função") || lower.includes("funcao") || lower.includes("function")) return "function_area";
      if (lower === "production" || lower.includes("produç") || lower.includes("logist")) return "production";
      // Se o role é exatamente um dos internos, usar diretamente
      const valid = ["admin", "production", "function_area", "purchasing", "financial"];
      if (valid.includes(lower)) return lower;
      return "production"; // default seguro
    };
    const tokenRole = normalizePortalRole(tokenRoleRaw);

    // Importar storage dinamicamente para evitar dependência circular
    const { storage } = await import("./storage");

    let user = await storage.getUserByEmail(email);

    if (!user) {
      // Usuário não encontrado — auto-criar a partir do token do Portal Norte
      console.log(`[SSO Middleware] Auto-criando usuário: ${email} (role: ${tokenRole})`);
      const bcrypt = (await import("bcryptjs")).default;
      const randomPw = await bcrypt.hash(Math.random().toString(36) + Date.now(), 10);
      user = await storage.createUser({
        email,
        name: tokenName || email,
        password: randomPw,
        role: tokenRole,
        status: "approved",
        isActive: true,
        area: null,
      } as any);
    }

    if (user.status !== "approved" || user.isActive === false) {
      // Usuário inativo ou não aprovado — acesso negado
      console.warn(`[SSO Middleware] Acesso negado — usuário inativo/não aprovado: ${email}`);
      return res.redirect('/auth?sso_error=not_approved');
    }

    // Sincronizar nome do token.
    // Role: preserva o role do banco SE for um role interno válido.
    //       Se o role do banco for inválido (ex: veio em português do portal), corrige agora.
    const validRoles = ["admin", "production", "function_area", "purchasing", "financial"];
    const updates: Record<string, unknown> = {};
    if (tokenName && tokenName !== user.name) updates.name = tokenName;
    if (!validRoles.includes(user.role)) {
      updates.role = tokenRole; // tokenRole já está normalizado (ex: "Administrador" → "admin")
      console.log(`[SSO Middleware] Corrigindo role inválido "${user.role}" → "${tokenRole}" para ${email}`);
    }
    if (Object.keys(updates).length > 0) {
      user = await storage.updateUser(user.id, updates as any) || user;
    }

    // Criar sessão (marcada como autenticada via SSO)
    req.session.userId = user.id;
    req.session.user = { ...user, password: undefined, resetToken: undefined, resetTokenExpiry: undefined };
    (req.session as any).ssoAuthenticated = true;
    if (portalReturn) (req.session as any).portalReturnUrl = portalReturn;

    await new Promise<void>((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve()))
    );

    console.log(`[SSO Middleware] Sessão criada para: ${email}`);

    // Redireciona para / sem parâmetros SSO (URL limpa)
    return res.redirect('/');
  } catch (err) {
    console.error("[SSO Middleware] Erro inesperado:", err);
    return next();
  }
});


// ── requireAuth global (BLOQUEIO ativado em 13/08/2026) ───────────────────
// Evolução do middleware [AuthAudit] que rodou em modo somente-log: toda rota
// /api agora exige sessão, exceto os prefixos públicos abaixo. O fallback de
// identidade via `_userId` no corpo foi removido de todas as rotas — a
// identidade vem exclusivamente da sessão.
//
// Prefixos públicos:
//   /api/auth/        → login, registro, recuperação de senha, sessão
//   /api/integration/ → API da Maratona, autenticada por Bearer token próprio
//   /api/portal/      → handshake do SSO com o Portal Norte
const AUTH_EXEMPT = ['/api/auth/', '/api/integration/', '/api/portal/'];

app.use((req, res, next) => {
  // O Express roteia case-insensitive por padrão, então /API/collaborators
  // CASA com o handler /api/collaborators. Se o gate comparasse o path com o
  // case original, uma requisição em maiúsculas passaria sem sessão. Comparamos
  // sempre em minúsculas para fechar esse contorno.
  const path = req.path.toLowerCase();
  if (!path.startsWith('/api')) return next();
  if (AUTH_EXEMPT.some((prefix) => path.startsWith(prefix))) return next();
  if (req.session?.userId) return next();

  const usouBypass = Boolean(req.body && typeof req.body === 'object' && req.body._userId);
  console.warn(
    `[AuthAudit] BLOQUEADO ${req.method} ${req.path} — sem sessão, bypass=${usouBypass ? 'SIM' : 'nao'}`
  );
  return res.status(401).json({ message: 'Não autenticado' });
});

// CSRF defense-in-depth — como em produção o cookie de sessão é SameSite=None
// (necessário para o contexto cross-site do Portal Norte), validamos a origem
// das requisições que alteram dados. Bloqueia apenas quando o Origin existe e é
// claramente de outro site. Em caso de dúvida (sem Origin, host indeterminado,
// chamadas server-to-server) deixa passar — fail-open para não derrubar fluxos
// legítimos.
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return next();
  }
  const allowedHosts = [req.headers['x-forwarded-host'], req.headers.host]
    .flatMap((h) => (typeof h === 'string' ? h.split(',') : []))
    .map((h) => h.trim())
    .filter(Boolean);
  if (allowedHosts.length === 0 || allowedHosts.includes(originHost)) return next();
  console.warn(`[CSRF] Bloqueado ${req.method} ${req.path} — origin=${originHost} hosts=${allowedHosts.join(',')}`);
  return res.status(403).json({ message: 'Origem não permitida' });
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      // Não serializar o corpo da resposta: rotas como /api/collaborators e
      // /api/users devolvem PII (CPF, telefone, e-mail) que acabaria no log.
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // Relançar aqui vira uncaughtException e derruba o processo — apenas logar.
    console.error(`[Error] ${req.method} ${req.path} → ${status}:`, err);

    if (res.headersSent) return;
    res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
