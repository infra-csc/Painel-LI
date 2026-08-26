/**
 * Modo Simulação — "Ver como usuário".
 *
 * O ADMIN (usuário REAL da sessão) escolhe um usuário ativo e passa a ver o
 * sistema inteiro como aquele usuário veria: menu, telas, permissões e os
 * dados que o servidor filtra por pessoa. Regras de segurança:
 *
 *  1. `session.userId` NUNCA muda — a simulação vive num campo separado
 *     (`session.simulatedUserId`). Logout, refresh de sessão, SSO e as
 *     próprias rotas /api/simulation/* usam sempre o usuário REAL.
 *  2. A identidade EFETIVA (quem as rotas de leitura enxergam) é resolvida por
 *     `effectiveUserId(req)` = simulatedUserId ?? userId. Os pontos de
 *     resolução de ator (requireRoles, getActor, /api/auth/me e os GETs que
 *     leem a sessão) usam esse helper.
 *  3. SOMENTE LEITURA garantido no servidor: com simulação ativa, todo método
 *     não-GET em /api responde 403, exceto POST /api/simulation/start (o
 *     handler recusa com 400 "Saia da simulação atual primeiro"),
 *     POST /api/simulation/stop e POST /api/auth/logout. Assim é impossível
 *     agir em nome do usuário simulado.
 *  4. Início e fim ficam na auditoria (simulation_start / simulation_stop),
 *     sempre atribuídos ao admin REAL.
 *
 * O storage é importado de forma tardia (dentro dos handlers) para que os
 * helpers puros deste módulo possam ser testados sem DATABASE_URL.
 */
import type { Express, NextFunction, Request, Response } from "express";
import { normalizeRole } from "@shared/roles";

declare module "express-session" {
  interface SessionData {
    /** Usuário sendo simulado pelo admin (se houver). O userId REAL não muda. */
    simulatedUserId?: string;
    /** ISO string de quando a simulação começou (para o banner do client). */
    simulatedSince?: string;
  }
}

type SessionLike =
  | { userId?: string; simulatedUserId?: string }
  | null
  | undefined;

/**
 * Identidade EFETIVA da requisição: o usuário simulado, se houver, senão o
 * usuário real da sessão. Função pura para ser testável.
 */
export function resolveEffectiveUserId(session: SessionLike): string | undefined {
  return session?.simulatedUserId ?? session?.userId ?? undefined;
}

/** Açúcar sobre `resolveEffectiveUserId` para uso direto nas rotas. */
export function effectiveUserId(req: { session?: SessionLike }): string | undefined {
  return resolveEffectiveUserId(req?.session);
}

export const SIMULATION_READONLY_MESSAGE =
  "Modo simulação — somente leitura. Saia da simulação para agir.";

/**
 * Rotas de escrita liberadas mesmo com simulação ativa:
 *  - /api/simulation/start: o handler recusa com o 400 correto ("Saia da
 *    simulação atual primeiro") e é restrito ao admin REAL — sem risco.
 *  - /api/simulation/stop: é o botão "Sair da simulação".
 *  - /api/auth/logout: o admin sempre pode encerrar a própria sessão.
 */
const SIMULATION_WRITE_WHITELIST = new Set([
  "/api/simulation/start",
  "/api/simulation/stop",
  "/api/auth/logout",
]);

/**
 * Decide se uma requisição deve ser bloqueada pelo modo somente leitura.
 * Pura (método + path + flag) para ser testável.
 * GET/HEAD/OPTIONS passam sempre — OPTIONS em particular nunca pode ser
 * bloqueado (preflight de CORS). Paths fora de /api (assets, Vite) passam.
 * A comparação é em minúsculas porque o Express roteia case-insensitive.
 */
export function isBlockedBySimulation(
  method: string,
  path: string,
  simulating: boolean,
): boolean {
  if (!simulating) return false;
  const m = method.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return false;
  const p = path.toLowerCase().replace(/\/+$/, "");
  if (!p.startsWith("/api")) return false;
  return !SIMULATION_WRITE_WHITELIST.has(p);
}

/**
 * Middleware global (registrado em server/index.ts, depois do gate de sessão):
 * com simulação ativa, toda mutação em /api fora da whitelist responde 403.
 */
export function simulationReadOnlyGuard(req: Request, res: Response, next: NextFunction) {
  if (isBlockedBySimulation(req.method, req.path, Boolean(req.session?.simulatedUserId))) {
    return res.status(403).json({ message: SIMULATION_READONLY_MESSAGE });
  }
  next();
}

// Assinatura do createAuditLog de server/routes.ts (injetado para não duplicar
// a lógica de diff/sanitização nem criar import circular).
type CreateAuditLog = (
  action: string,
  entityType: string,
  entityId: string,
  entityData: any,
  userId?: string,
  userName?: string,
  oldData?: any,
  req?: any,
) => Promise<void>;

export interface SimulationDeps {
  createAuditLog: CreateAuditLog;
}

export function registerSimulationRoutes(app: Express, deps: SimulationDeps) {
  const { createAuditLog } = deps;

  // Inicia a simulação. Só o ADMIN DE VERDADE (usuário real da sessão) pode.
  app.post("/api/simulation/start", async (req, res) => {
    try {
      const realUserId = req.session?.userId;
      if (!realUserId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const { storage } = await import("./storage");
      const realUser = await storage.getUser(realUserId);
      if (!realUser || normalizeRole(realUser.role) !== "admin") {
        return res.status(403).json({ message: "Apenas administradores podem simular outro usuário." });
      }

      if (req.session.simulatedUserId) {
        return res.status(400).json({ message: "Saia da simulação atual primeiro." });
      }

      const userId = typeof req.body?.userId === "string" ? req.body.userId : null;
      if (!userId) {
        return res.status(400).json({ message: "Informe o usuário a simular (userId)." });
      }
      if (userId === realUserId) {
        return res.status(400).json({ message: "Você não pode simular a si mesmo." });
      }

      const target = await storage.getUser(userId);
      if (!target) {
        return res.status(404).json({ message: "Usuário não encontrado." });
      }
      if (target.status !== "approved" || target.isActive === false) {
        return res.status(400).json({ message: "Só é possível simular usuários ativos e aprovados." });
      }

      req.session.simulatedUserId = target.id;
      req.session.simulatedSince = new Date().toISOString();
      await new Promise<void>((resolve, reject) =>
        req.session.save((err) => (err ? reject(err) : resolve())),
      );

      await createAuditLog(
        "simulation_start",
        "user",
        target.id,
        target,
        realUser.id,
        realUser.name,
        undefined,
        req,
      );

      return res.json({
        active: true,
        simulatedUser: { id: target.id, name: target.name, email: target.email, role: target.role },
      });
    } catch (error) {
      console.error("[Simulation] Erro ao iniciar simulação:", error);
      return res.status(500).json({ message: "Erro ao iniciar a simulação" });
    }
  });

  // Encerra a simulação. Permitido SEMPRE que houver simulação ativa (está na
  // whitelist do modo somente leitura) — é o caminho de saída.
  app.post("/api/simulation/stop", async (req, res) => {
    try {
      const realUserId = req.session?.userId;
      if (!realUserId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const simulatedId = req.session.simulatedUserId;
      if (!simulatedId) {
        return res.status(400).json({ message: "Nenhuma simulação ativa." });
      }

      delete req.session.simulatedUserId;
      delete req.session.simulatedSince;
      await new Promise<void>((resolve, reject) =>
        req.session.save((err) => (err ? reject(err) : resolve())),
      );

      const { storage } = await import("./storage");
      const [realUser, target] = await Promise.all([
        storage.getUser(realUserId),
        storage.getUser(simulatedId),
      ]);
      await createAuditLog(
        "simulation_stop",
        "user",
        simulatedId,
        target ?? { id: simulatedId },
        realUserId,
        realUser?.name,
        undefined,
        req,
      );

      return res.json({ active: false });
    } catch (error) {
      console.error("[Simulation] Erro ao encerrar simulação:", error);
      return res.status(500).json({ message: "Erro ao encerrar a simulação" });
    }
  });
}
