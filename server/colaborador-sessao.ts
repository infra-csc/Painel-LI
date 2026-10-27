/**
 * Sessão do COLABORADOR no portal /colaborador (27/10, Fase 1 do Módulo de
 * Honorários).
 *
 * Ata de 22/10: "cada colaborador acessa o app com CPF e senha". É o MESMO
 * express-session do app, com um campo próprio (`colaboradorId`) — e dois
 * mundos separados:
 *  - /api/colaborador/* só aceita sessão de colaborador (a interna recebe 401);
 *  - toda outra rota /api continua exigindo usuário interno (o gate global de
 *    server/app.ts olha `userId`, que a sessão do colaborador não tem).
 * O login sempre REGENERA a sessão (o id anterior, que pode ter sido plantado,
 * deixa de valer), então uma sessão nunca tem os dois ao mesmo tempo.
 */
import type { NextFunction, Request, Response } from "express";

declare module "express-session" {
  interface SessionData {
    /** Colaborador logado no portal (/colaborador). Nunca junto com `userId`. */
    colaboradorId?: string;
  }
}

/** Prefixo das rotas do portal do colaborador. */
export const PREFIXO_DO_COLABORADOR = "/api/colaborador/";

/** Rotas do portal que não pedem sessão (entrar e primeiro acesso/esqueci a senha). */
export const ROTAS_ABERTAS_DO_COLABORADOR = ["/api/colaborador/entrar", "/api/colaborador/primeiro-acesso"] as const;

/** O caminho (já em minúsculas, sem barra final) é do portal do colaborador? */
export function ehRotaDoColaborador(caminho: string): boolean {
  const p = caminho.toLowerCase().split("?")[0].replace(/\/+$/, "");
  return p === "/api/colaborador" || p.startsWith(PREFIXO_DO_COLABORADOR);
}

export function ehRotaAbertaDoColaborador(caminho: string): boolean {
  const p = caminho.toLowerCase().split("?")[0].replace(/\/+$/, "");
  return (ROTAS_ABERTAS_DO_COLABORADOR as readonly string[]).includes(p);
}

/** Mesma inatividade da sessão interna (12 h sem request). */
const INATIVIDADE_MAX_MS = 12 * 60 * 60 * 1000;
const GRAVAR_LAST_SEEN_A_CADA_MS = 5 * 60 * 1000;

/**
 * Gate das rotas /api/colaborador/* (chamado pelo gate global de server/app.ts
 * ANTES da regra do usuário interno). Abertas: entrar e primeiro acesso. O
 * resto exige `colaboradorId`; quem o handler é (ativo? existe?) a rota confere.
 */
export function gateDoColaborador(req: Request, res: Response, next: NextFunction) {
  if (ehRotaAbertaDoColaborador(req.path)) return next();
  const colaboradorId = req.session?.colaboradorId;
  if (!colaboradorId) {
    // Abrir o portal sem sessão é o caminho normal (GET /eu): só o resto vai ao log.
    if (!(req.method === "GET" && req.path.toLowerCase() === "/api/colaborador/eu")) {
      console.warn(`[AuthAudit] PORTAL DO COLABORADOR sem sessão ${req.method} ${req.path}`);
    }
    return res.status(401).json({ message: "Entre com o seu CPF e senha.", portalDoColaborador: true });
  }
  const agora = Date.now();
  const lastSeen = req.session.lastSeen;
  if (typeof lastSeen === "number" && agora - lastSeen > INATIVIDADE_MAX_MS) {
    req.session.destroy(() => {});
    return res.status(401).json({ message: "Sessão expirada por inatividade. Entre de novo.", portalDoColaborador: true });
  }
  if (typeof lastSeen !== "number" || agora - lastSeen > GRAVAR_LAST_SEEN_A_CADA_MS) req.session.lastSeen = agora;
  return next();
}

/** Cria a sessão do colaborador a partir de uma sessão NOVA (anti-fixação). */
export async function iniciarSessaoDoColaborador(req: Request, colaboradorId: string): Promise<void> {
  await new Promise<void>((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
  req.session.colaboradorId = colaboradorId;
  req.session.lastSeen = Date.now();
  await new Promise<void>((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));
}

export async function encerrarSessaoDoColaborador(req: Request): Promise<void> {
  await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
}
