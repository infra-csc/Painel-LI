/**
 * Perfil "Honorários (liberação)" — o que a API deixa esse papel fazer (23/10).
 *
 * Pedido do dono: uma pessoa que só "libera verba e extrai relatório" nos
 * Honorários da cenotécnica. Em vez de acrescentar uma checagem em cada uma
 * das ~300 rotas (e torcer para nenhuma rota nova esquecer), o perfil é
 * NEGADO POR PADRÃO: depois do gate de sessão, toda rota /api fora da lista
 * abaixo responde 403 para ele — inclusive as que qualquer logado lê hoje
 * (eventos, colaboradores, trocas, sino da escala, valores padrão…).
 *
 * O que a casca do app (menu, topo, sino) precisa, e por que não vaza nada:
 *  - /api/auth/*  (me, logout, sso): fora deste gate como de todos; o /me
 *    devolve só o próprio usuário, sem segredos;
 *  - GET /api/honorarios-ceno/acesso e /pendencias: o que a pessoa faz no
 *    módulo e as contagens do sino (o "a liberar" chega para este perfil);
 *  - a tela: GET /financeiro, GET /:id/historico, POST /:id/liberacoes e
 *    POST /:id/liberacoes/:lid/estornar. O CSV e os relatórios são montados
 *    na tela a partir do /financeiro — não há rota própria;
 *  - PATCH /api/users/<o próprio id>: só a troca da senha provisória (login por
 *    senha fora de produção); as regras de edição de usuário valem igual;
 *  - POST /api/simulation/stop: o admin vendo o sistema como esta pessoa sai
 *    da simulação (a rota confere o admin REAL).
 *
 * Lançar, enviar, aprovar e devolver honorário NÃO estão aqui: o pedido é da
 * cenotécnica e a aprovação, do aprovador da escala.
 */
import type { NextFunction, Request, Response } from "express";
import { ehPerfilHonorarios } from "@shared/roles";

interface RotaLiberada {
  metodos: readonly string[];
  caminho: RegExp;
}

const ID = "[^/]+";
const ROTAS_DO_PERFIL_HONORARIOS: readonly RotaLiberada[] = [
  { metodos: ["GET", "HEAD"], caminho: /^\/api\/honorarios-ceno\/(acesso|pendencias|financeiro)$/ },
  { metodos: ["GET", "HEAD"], caminho: new RegExp(`^/api/honorarios-ceno/${ID}/historico$`) },
  { metodos: ["POST"], caminho: new RegExp(`^/api/honorarios-ceno/${ID}/liberacoes$`) },
  { metodos: ["POST"], caminho: new RegExp(`^/api/honorarios-ceno/${ID}/liberacoes/${ID}/estornar$`) },
  { metodos: ["POST"], caminho: /^\/api\/simulation\/stop$/ },
];

/** Prefixos que não passam pelo gate de sessão (server/app.ts) — nem por este. */
const FORA_DO_GATE = ["/api/auth/", "/api/integration/", "/api/portal/"];

export const MSG_SO_HONORARIOS = "Seu acesso é só à tela Honorários da cenotécnica.";

/**
 * A rota é liberada para o perfil Honorários? Pura (método + caminho + id),
 * para o teste cobrir a lista sem subir o app. Caminho em minúsculas, sem
 * querystring e sem a barra final (o Express casa "/x/" com "/x").
 */
export function rotaLiberadaAoPerfilHonorarios(metodo: string, caminho: string, proprioId: string): boolean {
  const m = metodo.toUpperCase();
  if (m === "OPTIONS") return true;
  const p = caminho.toLowerCase().split("?")[0].replace(/\/+$/, "");
  if (!p.startsWith("/api")) return true;
  if (FORA_DO_GATE.some((prefixo) => `${p}/`.startsWith(prefixo))) return true;
  if (m === "PATCH" && p === `/api/users/${proprioId.toLowerCase()}`) return true;
  return ROTAS_DO_PERFIL_HONORARIOS.some((r) => r.metodos.includes(m) && r.caminho.test(p));
}

/**
 * Middleware: vem DEPOIS do gate de sessão (que já pôs o usuário real em
 * `req.user`). No "Ver como usuário" vale o usuário SIMULADO — o admin vê
 * exatamente o que a pessoa veria.
 */
export async function bloqueioDoPerfilHonorarios(req: Request, res: Response, next: NextFunction) {
  const real = req.user;
  if (!real) return next();
  const simuladoId = req.session?.simulatedUserId;
  let efetivo = real;
  if (simuladoId && simuladoId !== real.id) {
    try {
      // Import tardio: o módulo fica testável sem DATABASE_URL (como server/simulation.ts).
      const { carregarUsuario } = await import("./auth-guards");
      efetivo = (await carregarUsuario(simuladoId)) ?? real;
    } catch (err) {
      return next(err);
    }
  }
  if (!ehPerfilHonorarios(efetivo.role)) return next();
  if (rotaLiberadaAoPerfilHonorarios(req.method, req.path, efetivo.id)) return next();
  console.warn(`[AuthAudit] PERFIL HONORÁRIOS barrado ${req.method} ${req.path}`);
  return res.status(403).json({ message: MSG_SO_HONORARIOS });
}
