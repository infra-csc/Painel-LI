import type { Request, Response, NextFunction } from "express";

/**
 * Rotas que NÃO precisam de sessão autenticada.
 * - /api/auth/*      — login, register, forgot-password, reset-password, sso
 * - /api/integration/* — API Maratona (autenticada por Bearer token próprio)
 */
const PUBLIC_PREFIXES = ["/api/auth/", "/api/integration/"];

/**
 * Middleware global de autenticação.
 *
 * Bloqueia qualquer rota /api/* sem sessão ativa, exceto as listadas em
 * PUBLIC_PREFIXES. Retorna 401 JSON — o React redireciona para /auth.
 *
 * IMPORTANTE: a identidade do ator deve ser derivada EXCLUSIVAMENTE de
 * req.session.userId. Nunca aceitar userId do body (IDOR).
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Deixa passar rotas não-API (assets, HTML do Vite, etc.)
  if (!req.path.startsWith("/api")) return next();

  // Deixa passar rotas públicas explícitas
  if (PUBLIC_PREFIXES.some((prefix) => req.path.startsWith(prefix))) return next();

  // Exige sessão
  if (req.session?.userId) return next();

  return res.status(401).json({ message: "Não autenticado" });
}
