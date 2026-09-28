/**
 * Fábrica da aplicação Express (24/09).
 *
 * Tudo o que server/index.ts montava no import — headers de segurança, sessão,
 * SSO, gate global de autenticação, modo simulação, CSRF, rotas e tratador de
 * erros — vive aqui, em `createApp`. O index.ts só faz o boot (estrutura do
 * banco, Vite/estático e `listen`). Motivo: os testes de rota (server/test/)
 * precisam de UMA instância do app com as MESMAS regras de produção, sem abrir
 * porta nem tocar em banco real.
 *
 * A ORDEM dos middlewares é a mesma de antes — mudar a ordem muda o que cada
 * regra enxerga (o CSRF precisa da sessão; o gate precisa do JSON parseado só
 * para o log de bypass; etc.).
 */
import express, { type Express } from "express";
import type { Server } from "http";
import compression from "compression";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import rateLimit from "express-rate-limit";
import { randomUUID } from "crypto";
import { pool } from "./db";
import { criarStoreDeRateLimit } from "./rate-limit-store";
import type { User } from "@shared/schema";
import { registerRoutes } from "./routes";
import { simulationReadOnlyGuard } from "./simulation";
import { log } from "./vite";
import { tratadorGlobalDeErros, serializarJsonNaBorda } from "./http";
import {
  autenticarPorSso,
  carregarUsuario,
  hostsDoPortal,
  origensDoPortal,
  SsoError,
} from "./auth-guards";

// Session interface extension (os campos do SSO/inatividade estão em
// server/auth-guards.ts; os da simulação em server/simulation.ts).
declare module 'express-session' {
  interface SessionData {
    userId?: string;
    /** Cópia do usuário sem segredos (auth-guards.semSegredos) gravada no login. */
    user?: Omit<User, "password" | "resetToken" | "resetTokenExpiry">;
  }
}

export interface OpcoesDoApp {
  /**
   * Trata a instância como PRODUÇÃO nas regras de segurança: exige sessão
   * vinda do SSO em toda a API, HSTS, cookie SameSite=None e aborta o boot
   * sem SESSION_SECRET/SSO_SECRET. Padrão: NODE_ENV === "production".
   * Os testes ligam isto com NODE_ENV=test para exercitar as regras reais.
   */
  modoSeguro?: boolean;
  /**
   * Flag `Secure` do cookie de sessão. Padrão: igual a `modoSeguro`. Os testes
   * (supertest, http sem TLS) passam `false` — com `Secure` o cookie nunca
   * voltaria e toda requisição seria 401.
   */
  cookieSecure?: boolean;
  /**
   * Store de sessão. Padrão: connect-pg-simple sobre `pool`; com
   * PAINEL_DB=pglite (testes) o padrão é o MemoryStore do express-session,
   * para não depender da tabela `session`.
   */
  sessionStore?: session.Store;
}

export interface AppCriado {
  app: Express;
  /** http.Server já ligado ao app (criado por registerRoutes) — ainda sem `listen`. */
  server: Server;
}

export async function createApp(opts: OpcoesDoApp = {}): Promise<AppCriado> {
  const IS_PROD = opts.modoSeguro ?? process.env.NODE_ENV === 'production';
  const COOKIE_SECURE = opts.cookieSecure ?? IS_PROD;

  // ── Checagem de configuração no boot ──────────────────────────────────────
  // SESSION_SECRET e SSO_SECRET assinam, respectivamente, o cookie de sessão e o
  // JWT do SSO. O fallback abaixo é o mesmo literal versionado neste repositório
  // (público) — com ele, qualquer pessoa forja um token de SSO com role "admin".
  // Por isso, EM PRODUÇÃO, subir sem os segredos é pior do que não subir: o boot
  // é abortado. Em desenvolvimento o fallback é tolerado, apenas com aviso.
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

  // PORTAL_ORIGIN (23/09): origens do Portal Norte que podem nos embutir em
  // iframe e para onde `portal_return` pode voltar. Sem ela, em produção, o
  // iframe do portal deixa de carregar (frame-ancestors 'self').
  const PORTAL_ORIGINS = origensDoPortal();
  if (IS_PROD && PORTAL_ORIGINS.length === 0) {
    console.warn(
      "[Config] AVISO: PORTAL_ORIGIN não definido em produção — " +
      "a CSP fica em frame-ancestors 'self' e o iframe do Portal Norte não carrega."
    );
  }
  // PORTAL_API_TOKEN (23/09): segredo próprio das chamadas server-to-server em
  // /api/portal/*. Até então usava-se o SSO_SECRET — o mesmo que assina o JWT.
  if (!process.env.PORTAL_API_TOKEN) {
    console.warn(
      "[Config] DEPRECIADO: PORTAL_API_TOKEN não definido — /api/portal/* aceita SSO_SECRET como Bearer. " +
      "Defina PORTAL_API_TOKEN e atualize o Portal Norte."
    );
  }

  const app = express();

  // Trust proxy - required for Replit
  app.set('trust proxy', 1);
  // Colunas jsonb (25/09) saem como string JSON, como o client espera — ver server/http.ts.
  app.set('json replacer', serializarJsonNaBorda);

  // Gzip compression — reduz tamanho das respostas JSON em ~70-80%
  app.use(compression());

  // ── Identificação e log de request (23/09) ──────────────────────────────────
  // Primeiro middleware de verdade: todo request ganha um id curto (devolvido em
  // X-Request-Id, para o usuário citar no suporte) e é logado ao terminar com
  // método, rota, status, duração e um prefixo do userId — nunca o corpo (as
  // respostas de /api/collaborators e /api/users têm PII).
  app.use((req, res, next) => {
    const requestId = randomUUID().slice(0, 8);
    req.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    const start = Date.now();
    const path = req.path;
    res.on("finish", () => {
      if (!path.startsWith("/api")) return;
      const userId = req.session?.userId ? req.session.userId.slice(0, 8) : "anon";
      log(`${requestId} ${userId} ${req.method} ${path} ${res.statusCode} in ${Date.now() - start}ms`);
    });
    next();
  });

  // Headers de segurança.
  // - CSP frame-ancestors: só nós mesmos e o Portal Norte podem nos embutir em
  //   iframe (substitui o antigo "sem X-Frame-Options porque quebra o portal" —
  //   X-Frame-Options continua NÃO definido, ele não aceita lista de origens).
  // - "no-referrer" importa em especial porque o token de SSO trafega na query
  //   string (?portal_sso=...) — sem isso ele vaza no header Referer para
  //   qualquer recurso externo carregado pela página.
  // - HSTS só em produção (em dev o app roda em http://localhost).
  const FRAME_ANCESTORS = ["'self'", ...PORTAL_ORIGINS].join(" ");
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', `frame-ancestors ${FRAME_ANCESTORS}`);
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (IS_PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  // Store de sessão: PostgreSQL (connect-pg-simple) por padrão. Nos testes
  // (PAINEL_DB=pglite) o MemoryStore do próprio express-session — a tabela
  // `session` não existe no PGlite e o teste não precisa persistir sessão.
  let store = opts.sessionStore;
  if (!store) {
    if (process.env.PAINEL_DB === "pglite") {
      store = new session.MemoryStore();
    } else {
      const PgSession = connectPgSimple(session);
      store = new PgSession({
        // any: o Pool do @neondatabase/serverless não é o pg.Pool que o
        // connect-pg-simple tipa, mas expõe a mesma interface de query.
        pool: pool as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        tableName: 'session',
        createTableIfMissing: true,
        // Sem isso o connect-pg-simple faz UPDATE na tabela session em TODO request
        // (touch). `rolling` está desligado, então a expiração absoluta continua
        // sendo os 7 dias do login; a inatividade é tratada no gate global.
        disableTouch: true,
      });
    }
  }

  // Configure session middleware with PostgreSQL store
  app.use(session({
    store,
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      // Em produção o app roda sob HTTPS e é aberto a partir do Portal Norte
      // (contexto cross-site/iframe). Cookies "Lax" são bloqueados nesse caso,
      // o que derruba a sessão (cada request vira UserID: none → 401).
      // "None" + "Secure" permite o cookie de sessão em contexto cross-site.
      // Em desenvolvimento (http://localhost) mantemos Lax + secure:false.
      // `cookieSecure` só é desligado pelos testes (http, sem TLS) — SameSite
      // acompanha: "None" sem Secure é rejeitado pelos navegadores.
      secure: COOKIE_SECURE,
      httpOnly: true,
      sameSite: IS_PROD && COOKIE_SECURE ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    },
    name: 'sessionId'
  }));

  // 2 MB: o cadastro em lote de colaboradores e a importação do espelho
  // estouravam os 100 kb padrão. `express.urlencoded` foi REMOVIDO (23/09):
  // nenhuma rota lia formulário e ele era exatamente o formato que um
  // `<form method=post>` de outro site consegue enviar (CSRF).
  app.use(express.json({ limit: '2mb' }));

  // ── Rate limiting nas rotas de credencial ─────────────────────────────────
  // Limites propositalmente folgados: em produção o login é via SSO do Portal
  // Norte, então essas rotas quase não têm uso legítimo. O objetivo é apenas
  // impedir brute force e enumeração de contas, sem atrapalhar ninguém.
  // Contadores no Postgres (25/09, server/rate-limit-store.ts): o MemoryStore
  // padrão contava por instância — com autoscale, N instâncias = N × o limite,
  // e o contador zerava a cada deploy. Uma instância de store por limitador.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Muitas tentativas. Tente novamente em alguns minutos." },
    store: criarStoreDeRateLimit("login"),
  });

  const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Muitas tentativas. Tente novamente mais tarde." },
    store: criarStoreDeRateLimit("reset"),
  });

  app.use('/api/auth/login', authLimiter);
  // /api/auth/register foi removido em 17/08/2026 (registro público desativado).
  app.use('/api/auth/forgot-password', passwordResetLimiter);
  app.use('/api/auth/reset-password', passwordResetLimiter);

  // ── Login automático do MODO DEMONSTRAÇÃO (25/09) ─────────────────────────
  // `GET /__demo/entrar?papel=admin|production|purchasing|function_area|
  // financial|aprovador` cria a sessão do usuário semeado (server/dev/
  // demo-seed.ts) e redireciona para /. Registrado SÓ quando as DUAS
  // condições valem — PAINEL_DEMO=1 e NODE_ENV diferente de "production" —
  // lidas do ambiente, nunca de `opts`: em produção a rota não existe (404),
  // e o teste server/test/demo-seed.test.ts garante isso. Fica antes do SSO e
  // do gate porque cria sessão do mesmo jeito que o SSO (`ssoAuthenticated`).
  if (process.env.PAINEL_DEMO === "1" && process.env.NODE_ENV !== "production") {
    const { registrarLoginDeDemo } = await import("./dev/demo-login");
    registrarLoginDeDemo(app);
    console.warn("[Demo] PAINEL_DEMO=1 — login automático em GET /__demo/entrar?papel=… (NUNCA em produção)");
  }

  // ── SSO Middleware (server-side) ──────────────────────────────────────────
  // Intercepta ?portal_sso=<JWT> ANTES de qualquer renderização do React.
  // Valida o token, cria a sessão e redireciona para / com URL limpa.
  // Deve ficar ANTES das rotas da aplicação. A lógica em si (verificação do JWT,
  // regras de conta, sessão nova) vive em server/auth-guards.ts e é a MESMA da
  // rota GET /api/auth/sso.
  app.use(async (req, res, next) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const ssoToken = url.searchParams.get('portal_sso');
    if (!ssoToken) return next();
    const portalReturn = url.searchParams.get('portal_return');

    try {
      const user = await autenticarPorSso(req, ssoToken, SSO_SECRET, portalReturn);
      log(`SSO: sessão criada para o usuário ${user.id.slice(0, 8)}`);
      // Redireciona para / sem parâmetros SSO (URL limpa)
      return res.redirect('/');
    } catch (err) {
      if (err instanceof SsoError) {
        console.warn(`[SSO Middleware] ${err.codigo}: ${err.message}`);
        if (err.codigo === 'not_approved') return res.redirect('/auth?sso_error=not_approved');
        return next(); // token inválido/reutilizado — o client mostra o erro pelo /api/auth/sso
      }
      console.error("[SSO Middleware] Erro inesperado:", err);
      return next();
    }
  });


  // ── requireAuth global (BLOQUEIO ativado em 13/08/2026; endurecido em 23/09) ─
  // Toda rota /api exige sessão, exceto os prefixos públicos abaixo. Desde 23/09
  // o gate também:
  //   - carrega o usuário (cache de 60 s em auth-guards) e nega 401 se a conta
  //     foi inativada ou não está aprovada — antes o cookie valia 7 dias mesmo
  //     depois de um admin inativar a conta;
  //   - em produção exige sessão vinda do SSO para TODA a API (antes só
  //     /api/auth/me checava, e uma sessão de login por senha valia para o resto);
  //   - expira por inatividade (12 h sem request) — barato: compara timestamps e
  //     só grava `lastSeen` a cada 5 min;
  //   - com `mustChangePassword`, só deixa passar /api/auth/* e a troca da
  //     própria senha (PATCH /api/users/:id do próprio usuário);
  //   - guarda o usuário REAL em `req.user` para os handlers reutilizarem.
  //
  // Prefixos públicos:
  //   /api/auth/        → login, recuperação de senha, sessão, SSO
  //   /api/integration/ → API da Maratona, autenticada por Bearer token próprio
  //   /api/portal/      → gestão de usuários pelo Portal Norte (Bearer próprio)
  const AUTH_EXEMPT = ['/api/auth/', '/api/integration/', '/api/portal/'];
  const INATIVIDADE_MAX_MS = 12 * 60 * 60 * 1000;
  const GRAVAR_LAST_SEEN_A_CADA_MS = 5 * 60 * 1000;

  app.use(async (req, res, next) => {
    // O Express roteia case-insensitive por padrão, então /API/collaborators
    // CASA com o handler /api/collaborators. Se o gate comparasse o path com o
    // case original, uma requisição em maiúsculas passaria sem sessão. Comparamos
    // sempre em minúsculas para fechar esse contorno.
    const path = req.path.toLowerCase();
    if (!path.startsWith('/api')) return next();
    if (AUTH_EXEMPT.some((prefix) => path.startsWith(prefix))) return next();

    const negar = (status: number, body: Record<string, unknown>, motivo: string) => {
      console.warn(`[AuthAudit] BLOQUEADO ${req.method} ${req.path} — ${motivo}`);
      req.session?.destroy(() => {});
      return res.status(status).json(body);
    };

    const userId = req.session?.userId;
    if (!userId) {
      const usouBypass = Boolean(req.body && typeof req.body === 'object' && req.body._userId);
      console.warn(`[AuthAudit] BLOQUEADO ${req.method} ${req.path} — sem sessão, bypass=${usouBypass ? 'SIM' : 'nao'}`);
      return res.status(401).json({ message: 'Não autenticado' });
    }

    if (IS_PROD && req.session.ssoAuthenticated !== true) {
      return negar(401, { message: 'Não autenticado', requirePortal: true }, 'sessão sem SSO em produção');
    }

    const agora = Date.now();
    const lastSeen = req.session.lastSeen;
    if (typeof lastSeen === 'number' && agora - lastSeen > INATIVIDADE_MAX_MS) {
      return negar(401, { message: 'Sessão expirada por inatividade' }, 'inatividade > 12h');
    }
    if (typeof lastSeen !== 'number' || agora - lastSeen > GRAVAR_LAST_SEEN_A_CADA_MS) {
      req.session.lastSeen = agora;
    }

    let user;
    try {
      user = await carregarUsuario(userId);
    } catch (err) {
      return next(err);
    }
    if (!user) return negar(401, { message: 'Sessão inválida' }, 'usuário não existe mais');
    if (user.isActive === false || user.status !== 'approved') {
      return negar(401, { message: 'Conta sem acesso. Contate o administrador.' }, 'conta inativa/não aprovada');
    }

    if (user.mustChangePassword) {
      const trocandoAPropriaSenha = req.method === 'PATCH' && path === `/api/users/${user.id.toLowerCase()}`;
      if (!trocandoAPropriaSenha) {
        return res.status(403).json({ message: 'Troque sua senha antes de continuar', mustChangePassword: true });
      }
    }

    req.user = user;
    return next();
  });

  // ── Modo Simulação: somente leitura ───────────────────────────────────────
  // Com `session.simulatedUserId` setado (admin vendo o sistema como outro
  // usuário — server/simulation.ts), toda mutação em /api responde 403, exceto
  // sair da simulação e logout. GET/HEAD/OPTIONS passam (OPTIONS = preflight).
  app.use(simulationReadOnlyGuard);

  // ── CSRF fail-closed (23/09) ────────────────────────────────────────────────
  // Em produção o cookie de sessão é SameSite=None (necessário para o iframe do
  // Portal Norte), então o navegador o envia em requests iniciados por QUALQUER
  // site. Defesa em duas camadas, para toda mutação em /api:
  //  1. Content-Type: só JSON ou multipart. Um `<form method=post>` de outro
  //     site só consegue urlencoded/multipart-sem-fetch/text-plain — e fetch
  //     com JSON cross-site exige preflight, que não passa sem CORS (não temos).
  //     Requests sem corpo (logout, simulation/stop) passam sem Content-Type.
  //  2. Origin: precisa existir e estar na allowlist (hosts do próprio app +
  //     PORTAL_ORIGIN). Sem Origin, aceitamos só Sec-Fetch-Site same-origin/none.
  //     Origin "null" (sandbox, redirecionamento cross-site) é recusado.
  // Exceção: Bearer em /api/integration e /api/portal (server-to-server, sem
  // cookie — o CSRF não se aplica).
  app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    const path = req.path.toLowerCase();
    if (!path.startsWith('/api')) return next();

    const auth = req.headers.authorization ?? '';
    const ehServerToServer = /^bearer\s+\S+/i.test(auth) &&
      (path.startsWith('/api/integration/') || path.startsWith('/api/portal/'));
    if (ehServerToServer) return next();

    const bloquear = (status: number, message: string, motivo: string) => {
      console.warn(`[CSRF] Bloqueado ${req.method} ${req.path} — ${motivo}`);
      return res.status(status).json({ message });
    };

    const contentType = (req.headers['content-type'] ?? '').toLowerCase();
    const tamanho = Number(req.headers['content-length'] ?? 0);
    const temCorpo = tamanho > 0 || Boolean(req.headers['transfer-encoding']);
    const tipoAceito = contentType.startsWith('application/json') || contentType.startsWith('multipart/form-data');
    if (contentType ? !tipoAceito : temCorpo) {
      return bloquear(415, 'Tipo de conteúdo não permitido', `content-type=${contentType || '(vazio)'}`);
    }

    const allowedHosts = [req.headers['x-forwarded-host'], req.headers.host]
      .flatMap((h) => (typeof h === 'string' ? h.split(',') : []))
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean)
      .concat(hostsDoPortal().map((h) => h.toLowerCase()));

    const origin = req.headers.origin;
    if (!origin) {
      const secFetchSite = String(req.headers['sec-fetch-site'] ?? '').toLowerCase();
      if (secFetchSite === 'same-origin' || secFetchSite === 'none') return next();
      return bloquear(403, 'Origem não informada', `sem Origin, sec-fetch-site=${secFetchSite || '(vazio)'}`);
    }
    if (origin === 'null') return bloquear(403, 'Origem não permitida', 'origin=null');
    let originHost: string;
    try {
      originHost = new URL(origin).host.toLowerCase();
    } catch {
      return bloquear(403, 'Origem não permitida', `origin inválido=${origin}`);
    }
    if (allowedHosts.length === 0 || !allowedHosts.includes(originHost)) {
      return bloquear(403, 'Origem não permitida', `origin=${originHost} hosts=${allowedHosts.join(',')}`);
    }
    return next();
  });

  const server = await registerRoutes(app);

  // Tratador global (server/http.ts): mapeia multer/zod/Postgres para status e
  // mensagem em pt-BR e NUNCA devolve `err.message` cru de erro desconhecido.
  app.use(tratadorGlobalDeErros);

  return { app, server };
}
