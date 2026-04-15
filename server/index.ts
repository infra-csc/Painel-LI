import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const PgSession = connectPgSimple(session);

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

// Configure session middleware with PostgreSQL store
app.use(session({
  store: new PgSession({
    pool: pool as any,
    tableName: 'session',
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET || 'dev-session-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  },
  name: 'sessionId'
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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

    const { jwtVerify } = await import("jose");
    const rawSecret = process.env.SSO_SECRET || process.env.SESSION_SECRET || 'dev-session-secret-change-in-production';
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
      // Auto-registrar com dados do token
      const bcrypt = await import("bcrypt");
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
      console.log(`[SSO Middleware] Usuário auto-registrado: ${email}`);
    } else if (user.status !== "approved") {
      user = await storage.updateUser(user.id, { status: "approved" }) || user;
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

    // Criar sessão
    req.session.userId = user.id;
    req.session.user = { ...user, password: undefined, resetToken: undefined, resetTokenExpiry: undefined };
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

// Debug middleware to log session info
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`[Session] ${req.method} ${req.path} - SessionID: ${req.sessionID || 'none'}, UserID: ${req.session?.userId || 'none'}`);
  }
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
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
