/**
 * Prazos e cobranças do fluxo novo dos honorários (28/10, Fase 3).
 *
 *   GET  /api/honorarios/prazos                         (admin, DP) — os dias de cada etapa
 *   PUT  /api/honorarios/prazos                         (só admin)
 *   POST /api/presenca/:actualId/contestacao/resposta   { resposta } (admin, DP)
 *   GET  /api/shell/honorarios-prazos                   (admin, DP) — contagem do sino
 *
 * Os dias ficam em system_settings (`honorarios_prazo_*`) com o padrão
 * PROVISÓRIO de shared/prazos-honorarios.ts (o dono pode mudar). A
 * contestação do colaborador ("Algo não bate?" na confirmação) volta ao DP:
 * ele responde e a contestação fica "respondida"; o colaborador vê a resposta
 * no portal. Tudo auditado. O perfil Honorários não passa
 * (server/perfil-honorarios.ts nega por padrão); a produção não vê nada
 * daqui — o prazo do check-out final dela vem na própria tela da presença.
 */
import type { Express } from "express";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { presencaConfirmacoes, type User } from "@shared/schema";
import { normalizeRole } from "@shared/roles";
import { PRAZOS_PADRAO, lerPrazosDosHonorarios, validarPrazosDosHonorarios, type PrazosDosHonorarios } from "@shared/prazos-honorarios";
import { dataDeCorteLegivel, ehEventoLegado } from "@shared/legado-honorarios";
import { createAuditLog, requireFinanceUser, responderErroComStatus } from "./_compartilhado";
import { lerDataDeCorteDoBanco } from "./honorarios-fluxo";
import { carregarControleRh } from "./rh-controle";

const nomeDe = (u: User) => u.name || u.email || "Usuário";

export async function lerPrazosDoBanco(): Promise<PrazosDosHonorarios> {
  return lerPrazosDosHonorarios(await storage.getSystemSettings());
}

const corpoDaResposta = z.object({ resposta: z.string().trim().min(3, "Escreva a resposta (pelo menos 3 caracteres).").max(2000) });

/** A contestação como o DP e o colaborador a leem. */
export function contestacaoParaTela(c: {
  contestacao: string | null; confirmadoEm: Date | string; contestacaoResposta: string | null;
  contestacaoRespondidaEm: Date | string | null; contestacaoRespondidaPorNome: string | null;
} | null | undefined) {
  if (!c?.contestacao) return null;
  return {
    texto: c.contestacao,
    em: new Date(c.confirmadoEm).toISOString(),
    respondida: !!c.contestacaoRespondidaEm,
    resposta: c.contestacaoResposta,
    respondidaEm: c.contestacaoRespondidaEm ? new Date(c.contestacaoRespondidaEm).toISOString() : null,
    respondidaPorNome: c.contestacaoRespondidaPorNome,
  };
}

export function registrarPrazosDosHonorarios(app: Express): void {
  // ── Configuração ──────────────────────────────────────────────────────────
  app.get("/api/honorarios/prazos", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    res.set("Cache-Control", "no-store");
    res.json({ prazos: await lerPrazosDoBanco(), padrao: PRAZOS_PADRAO, provisorio: true, podeEditar: normalizeRole(user.role) === "admin" });
  });

  app.put("/api/honorarios/prazos", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    if (normalizeRole(user.role) !== "admin") return res.status(403).json({ message: "Só o administrador muda os prazos." });
    try {
      const atual = await lerPrazosDoBanco();
      const r = validarPrazosDosHonorarios(req.body ?? {}, atual);
      if ("erro" in r) return res.status(400).json({ message: r.erro, campo: r.campo });
      for (const [chave, valor] of Object.entries(r.gravar)) await storage.upsertSystemSetting(chave, valor, user.id);
      if (Object.keys(r.gravar).length > 0) {
        await createAuditLog("update", "system_settings", "honorarios-prazos", r.novos, user.id, nomeDe(user), atual, req);
      }
      res.json({ prazos: r.novos, padrao: PRAZOS_PADRAO, provisorio: true, podeEditar: true });
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao salvar os prazos", 500);
    }
  });

  // ── Contestação do colaborador → DP ───────────────────────────────────────
  app.post("/api/presenca/:actualId/contestacao/resposta", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    const corpo = corpoDaResposta.safeParse(req.body ?? {});
    if (!corpo.success) return res.status(400).json({ message: corpo.error.issues[0]?.message ?? "Escreva a resposta." });
    try {
      const actual = await storage.getBudgetActualById(String(req.params.actualId));
      if (!actual) return res.status(404).json({ message: "Prestação não encontrada." });
      const evento = await storage.getEvent(actual.eventId);
      const dataDeCorte = await lerDataDeCorteDoBanco();
      if (!evento || ehEventoLegado(evento.endDate, dataDeCorte)) {
        return res.status(409).json({ message: `Evento do fluxo antigo (termina antes de ${dataDeCorteLegivel(dataDeCorte)}): não há contestação pelo app.`, codigo: "evento_legado" });
      }
      const [c] = await db.select().from(presencaConfirmacoes).where(eq(presencaConfirmacoes.actualId, actual.id));
      if (!c?.contestacao) return res.status(409).json({ message: "Esta prestação não tem contestação do colaborador.", codigo: "sem_contestacao" });
      const agora = new Date();
      // Só grava sobre a MESMA contestação que o DP leu (o colaborador pode refazer a confirmação).
      const [gravada] = await db.update(presencaConfirmacoes).set({
        contestacaoResposta: corpo.data.resposta,
        contestacaoRespondidaEm: agora,
        contestacaoRespondidaPor: user.id,
        contestacaoRespondidaPorNome: nomeDe(user),
      }).where(and(eq(presencaConfirmacoes.id, c.id), eq(presencaConfirmacoes.contestacao, c.contestacao))).returning();
      if (!gravada) return res.status(409).json({ message: "O colaborador mudou a contestação enquanto você respondia — atualize e leia de novo.", codigo: "mudou" });
      await createAuditLog(c.contestacaoRespondidaEm ? "update" : "create", "presenca_contestacao", gravada.id, {
        acao: c.contestacaoRespondidaEm ? "resposta à contestação alterada" : "contestação do colaborador respondida",
        prestacao: actual.id, resposta: corpo.data.resposta,
      }, user.id, nomeDe(user), c.contestacaoRespondidaEm ? { resposta: c.contestacaoResposta } : undefined, req);
      res.json({ contestacao: contestacaoParaTela(gravada) });
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao responder a contestação", 500);
    }
  });

  // ── Sino do DP ────────────────────────────────────────────────────────────
  // Uma contagem só (o sino não lista prestação por prestação): atrasados,
  // quantos deles estão com o próprio DP, vence hoje e contestações abertas.
  app.get("/api/shell/honorarios-prazos", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    try {
      const dataDeCorte = await lerDataDeCorteDoBanco();
      const eventos = (await storage.getEvents(false)).filter((e) => !ehEventoLegado(e.endDate, dataDeCorte));
      const controle = eventos.length ? await carregarControleRh({ eventIds: eventos.map((e) => e.id), recorte: "fluxo_novo" }) : null;
      const p = controle?.contadores.prazos;
      res.set("Cache-Control", "no-store");
      res.json({
        atrasados: p?.atrasados ?? 0,
        atrasadosComODp: p?.atrasadosPorQuem.dp ?? 0,
        atrasadosComAProducao: p?.atrasadosPorQuem.producao ?? 0,
        atrasadosComOColaborador: p?.atrasadosPorQuem.colaborador ?? 0,
        venceHoje: p?.venceHoje ?? 0,
        contestacoesAbertas: controle?.contadores.contestacoesAbertas ?? 0,
      });
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao contar os prazos dos honorários", 500);
    }
  });
}
