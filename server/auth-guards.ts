/**
 * Autenticação compartilhada (23/09): SSO do Portal Norte, cache do usuário da
 * sessão, sanitização do usuário e utilidades de sessão.
 *
 * Até 23/09 a lógica do SSO existia DUAS vezes (middleware em index.ts e rota
 * GET /api/auth/sso em routes.ts), cada uma com o seu `normalizePortalRole` e
 * regras de aceitação ligeiramente diferentes. Aqui fica a versão única; os
 * dois pontos de entrada só decidem como responder (redirect × JSON).
 */
import type { Request } from "express";
import { createHash } from "crypto";
import { jwtVerify } from "jose";
import { normalizeRole, type CanonicalRole } from "@shared/roles";
import type { User } from "@shared/schema";
import { pool } from "./db";
import { storage } from "./storage";

// ── Tipagem: o que guardamos no request e na sessão ─────────────────────────
declare module "express-serve-static-core" {
  interface Request {
    /** Usuário REAL da sessão, carregado pelo gate global (server/index.ts). */
    user?: User;
    /** Identificador curto da requisição (também vai no header X-Request-Id). */
    requestId?: string;
  }
}

declare module "express-session" {
  interface SessionData {
    /** true quando a sessão nasceu de um token do Portal Norte. */
    ssoAuthenticated?: boolean;
    /** Último request visto (ms). Base da expiração por inatividade. */
    lastSeen?: number;
    /** URL de retorno ao portal, já validada (https + host permitido). */
    portalReturnUrl?: string;
  }
}

// ── Sanitização ─────────────────────────────────────────────────────────────
/** Usuário sem os campos que NUNCA podem sair do servidor. */
export function semSegredos<T extends { password?: unknown; resetToken?: unknown; resetTokenExpiry?: unknown }>(user: T) {
  const { password: _p, resetToken: _t, resetTokenExpiry: _e, ...resto } = user;
  return resto;
}

// ── Cache do usuário da sessão ──────────────────────────────────────────────
// O gate global precisa do usuário em TODO request (para negar inativo,
// não aprovado, mustChangePassword). Bater no banco a cada request dobraria a
// carga; um cache por id com TTL curto resolve. As rotas que alteram usuário
// chamam `invalidarCacheDeUsuario` para o efeito ser imediato nesta instância
// (em outra instância do autoscale o efeito leva até TTL_USUARIO_MS).
const TTL_USUARIO_MS = 60_000;
const cacheDeUsuarios = new Map<string, { user: User | null; ate: number }>();

export async function carregarUsuario(id: string): Promise<User | null> {
  const agora = Date.now();
  const emCache = cacheDeUsuarios.get(id);
  if (emCache && emCache.ate > agora) return emCache.user;
  const user = (await storage.getUser(id)) ?? null;
  cacheDeUsuarios.set(id, { user, ate: agora + TTL_USUARIO_MS });
  // Sem crescer para sempre: a cada escrita, descarta o que já venceu.
  if (cacheDeUsuarios.size > 500) {
    cacheDeUsuarios.forEach((v, k) => { if (v.ate <= agora) cacheDeUsuarios.delete(k); });
  }
  return user;
}

export function invalidarCacheDeUsuario(id: string): void {
  cacheDeUsuarios.delete(id);
}

/**
 * Apaga todas as sessões de um usuário (connect-pg-simple guarda o JSON da
 * sessão na coluna `sess`; `userId` fica na raiz desse JSON). Usado ao inativar
 * ou rejeitar uma conta: sem isso a pessoa continuaria logada até o cookie
 * vencer (7 dias).
 */
export async function destruirSessoesDoUsuario(userId: string): Promise<void> {
  await pool.query(`DELETE FROM "session" WHERE sess->>'userId' = $1`, [userId]);
  invalidarCacheDeUsuario(userId);
}

// ── Origens do Portal Norte ─────────────────────────────────────────────────
/** Origens completas (ex.: https://portal.norte.com.br) lidas de PORTAL_ORIGIN. */
export function origensDoPortal(): string[] {
  return (process.env.PORTAL_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      try { return new URL(s).origin; } catch { return null; }
    })
    .filter((s): s is string => !!s);
}

/** Só os hosts (host[:porta]) das origens do portal — para a allowlist do CSRF. */
export function hostsDoPortal(): string[] {
  return origensDoPortal().map((o) => new URL(o).host);
}

/**
 * `portal_return` só é aceito em https e para um host do PORTAL_ORIGIN — senão
 * o parâmetro vira um redirecionador aberto a partir do nosso domínio.
 */
export function portalReturnPermitido(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    if (!hostsDoPortal().includes(u.host)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

// ── Papel vindo do portal ───────────────────────────────────────────────────
/**
 * O portal pode mandar o papel em português ("Administrador", "Recursos
 * Humanos", "Compras e Viagens"...). Primeiro a tabela oficial de aliases
 * (@shared/roles); só depois as heurísticas por trecho, para o que a tabela
 * não conhece. Default seguro: production (menor privilégio operacional).
 */
export function papelDoPortal(raw?: string | null): CanonicalRole {
  const canonico = normalizeRole(raw);
  if (canonico) return canonico;
  const lower = (raw ?? "").toLowerCase().trim();
  if (!lower) return "production";
  if (lower.includes("administr")) return "admin";
  if (lower.includes("financeiro") || lower === "rh" || lower.includes("recursos humanos")) return "financial";
  if (lower.includes("compras") || lower.includes("viagem")) return "purchasing";
  if (lower.includes("função") || lower.includes("funcao") || lower.includes("function")) return "function_area";
  return "production";
}

// ── SSO: verificação do token ───────────────────────────────────────────────
export class SsoError extends Error {
  constructor(public codigo: "token_invalido" | "token_reutilizado" | "sem_email" | "app_errado" | "not_approved", message: string) {
    super(message);
    this.name = "SsoError";
  }
}

/** Valores aceitos na claim `app` quando ela vier no token. */
const APPS_ACEITOS = new Set(["painel-li", "logistica-interna"]);

// Anti-reuso: um token só cria sessão UMA vez. Guardamos o jti (ou o hash do
// token) até ele expirar. Limitação conhecida: o Set é por instância — no
// autoscale com mais de uma instância, o segundo uso numa instância diferente
// dentro dos 10 min de vida do token passaria. Trocar por tabela se virar risco.
const tokensUsados = new Map<string, number>();
function registrarUsoDoToken(chave: string, expMs: number): boolean {
  const agora = Date.now();
  if (tokensUsados.size > 5000) {
    tokensUsados.forEach((v, k) => { if (v <= agora) tokensUsados.delete(k); });
  }
  if (tokensUsados.has(chave)) return false;
  tokensUsados.set(chave, expMs);
  return true;
}

export interface PayloadDoSso {
  email: string;
  name?: string;
  role?: string;
}

/**
 * Verifica assinatura, issuer, algoritmo, claims obrigatórias, idade máxima,
 * claim `app` (quando presente) e reuso. Sem fallback "token legado sem
 * issuer" (removido em 23/09 — era uma porta para tokens de outros emissores
 * assinados com o mesmo segredo).
 */
export async function verificarTokenSso(token: string, secret: string): Promise<PayloadDoSso> {
  const key = new TextEncoder().encode(secret);
  let payload: Record<string, unknown>;
  try {
    const r = await jwtVerify(token, key, {
      issuer: "norte-portal",
      algorithms: ["HS256"],
      requiredClaims: ["exp", "iat", "email"],
      maxTokenAge: "10m",
      // `audience`: o payload documentado ({ email, name, role, level, app })
      // não tem `aud`; se o portal passar a mandar, exigir aqui.
    });
    payload = r.payload as Record<string, unknown>;
  } catch (err) {
    throw new SsoError("token_invalido", `Token SSO inválido ou expirado (${(err as Error)?.name ?? "erro"})`);
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email) throw new SsoError("sem_email", "Token SSO não contém e-mail");

  const app = payload.app;
  if (typeof app === "string" && app && !APPS_ACEITOS.has(app.toLowerCase())) {
    throw new SsoError("app_errado", "Token SSO emitido para outro aplicativo");
  }

  const expMs = typeof payload.exp === "number" ? payload.exp * 1000 : Date.now() + 10 * 60_000;
  const chave = typeof payload.jti === "string" && payload.jti
    ? `jti:${payload.jti}`
    : `sha:${createHash("sha256").update(token).digest("hex")}`;
  if (!registrarUsoDoToken(chave, expMs)) {
    throw new SsoError("token_reutilizado", "Token SSO já utilizado");
  }

  return {
    email,
    name: typeof payload.name === "string" ? payload.name : undefined,
    role: typeof payload.role === "string" ? payload.role : undefined,
  };
}

/**
 * Encontra (ou cria) o usuário do token e aplica as regras de acesso:
 *  - conta inexistente → criada aprovada, com o papel do token normalizado;
 *  - conta rejeitada, inativa ou ainda pendente → negada (o SSO não reverte
 *    decisão de admin; antes uma das duas implementações auto-aprovava
 *    "pending" e a outra negava — ficou a mais restritiva);
 *  - nome sincronizado com o token; papel do banco preservado se válido,
 *    corrigido se for lixo.
 */
export async function usuarioDoSso(p: PayloadDoSso): Promise<User> {
  const tokenRole = papelDoPortal(p.role);
  let user = await storage.getUserByEmail(p.email);

  if (!user) {
    const bcrypt = (await import("bcryptjs")).default;
    const randomPw = await bcrypt.hash(Math.random().toString(36) + Date.now(), 10);
    user = await storage.createUser({
      email: p.email,
      name: p.name || p.email.split("@")[0],
      password: randomPw,
      role: tokenRole,
      status: "approved",
      isActive: true,
      area: null,
    });
    console.log(`[SSO] Usuário auto-criado via Portal Norte: ${user.id}`);
  }

  if (user.status !== "approved" || user.isActive === false) {
    throw new SsoError("not_approved", "Conta sem acesso. Contate o administrador.");
  }

  const updates: Partial<User> = {};
  if (p.name && p.name !== user.name) updates.name = p.name;
  if (!normalizeRole(user.role)) {
    updates.role = tokenRole;
    console.log(`[SSO] Corrigindo papel inválido "${user.role}" → "${tokenRole}" (usuário ${user.id})`);
  }
  if (Object.keys(updates).length > 0) {
    user = (await storage.updateUser(user.id, updates)) || user;
    invalidarCacheDeUsuario(user.id);
  }
  return user;
}

/**
 * Cria a sessão para `user` a partir de uma sessão NOVA (`regenerate`): o id
 * de sessão anterior — que pode ter sido plantado por terceiro (fixação) —
 * deixa de valer. Uma simulação pendente nunca sobrevive à troca de dono.
 */
export async function iniciarSessao(
  req: Request,
  user: User,
  opts: { sso: boolean; portalReturnUrl?: string | null },
): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    req.session.regenerate((err) => (err ? reject(err) : resolve())),
  );
  req.session.userId = user.id;
  req.session.user = semSegredos(user);
  req.session.ssoAuthenticated = opts.sso;
  req.session.lastSeen = Date.now();
  if (opts.portalReturnUrl) req.session.portalReturnUrl = opts.portalReturnUrl;
  await new Promise<void>((resolve, reject) =>
    req.session.save((err) => (err ? reject(err) : resolve())),
  );
}

/** Fluxo completo do SSO: token → usuário → sessão. */
export async function autenticarPorSso(
  req: Request,
  token: string,
  secret: string,
  portalReturn?: string | null,
): Promise<User> {
  const payload = await verificarTokenSso(token, secret);
  const user = await usuarioDoSso(payload);
  await iniciarSessao(req, user, { sso: true, portalReturnUrl: portalReturnPermitido(portalReturn) });
  return user;
}
