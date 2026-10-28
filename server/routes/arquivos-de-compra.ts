/**
 * Honorários, Fase 3 — ARQUIVOS (28/10): compra de créditos Flash em lote e o
 * arquivo de OC do M4 (prestadores + Flash). Layout PROVISÓRIO até o oficial
 * (shared/formatos-de-arquivo.ts — o TODO único de troca está lá). Carga e
 * gravação em server/arquivos-de-compra-servico.ts; regras em
 * shared/flash-compras.ts.
 *
 *   GET  /api/flash/compras/previa?inicio=&fim=&eventId=&manuais=1   o que está "a comprar" (CPF mascarado)
 *   POST /api/flash/compras                      { inicio, fim, eventId?, incluirManuais?, assinatura }  → 201 { lote }
 *   GET  /api/flash/compras                      lotes (do mais novo ao mais velho)
 *   GET  /api/flash/compras/:id/arquivo?formato=csv|xlsx   arquivo do lote (CPF completo; download auditado)
 *   POST /api/flash/compras/:id/cancelar         { motivo }  (só lote gerado) → os créditos voltam a "a comprar"
 *   POST /api/flash/compras/:id/pago             { pagoEm }  → pago à Flash
 *   GET  /api/ordens-de-compra/arquivo-m4/previa?eventId= | inicio=&fim=
 *   GET  /api/ordens-de-compra/arquivo-m4?eventId= | inicio=&fim= &formato=csv|xlsx   (auditado)
 *
 * Papéis: admin e DP (`financial`) — `requireFinanceUser`. O perfil Honorários
 * não passa (server/perfil-honorarios.ts nega por padrão). A auditoria nunca
 * guarda CPF.
 */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import type { User } from "@shared/schema";
import { MOTIVO_DO_CANCELAMENTO_MAX, MOTIVO_DO_CANCELAMENTO_MIN, erroDoPeriodo, type FiltroDaCompra } from "@shared/flash-compras";
import { FORMATO_COMPRA_FLASH, FORMATO_OC_M4 } from "@shared/formatos-de-arquivo";
import { dataDeCorteLegivel, ehEventoLegado } from "@shared/legado-honorarios";
import { hojeISO } from "@shared/hoje-sp";
import { lerDataDeCorteDoBanco } from "./honorarios-fluxo";
import {
  cancelarLote, diaEmSaoPaulo, enviarArquivo, extensaoDaQuery, formatoDoArquivoDeOc, gerarLoteDeCompra, lerLote, linhasDoArquivoDoLote,
  listarLotes, lotesParaATela, marcarLotePago, montarArquivoDeOc, previaDaCompraParaATela, type EscopoDoArquivoDeOc,
} from "../arquivos-de-compra-servico";
import { createAuditLog, requireFinanceUser, responderErroComStatus } from "./_compartilhado";

const nomeDe = (u: User) => u.name || u.email || "Usuário";

/** Erro com código (HttpError.extra) → { message, codigo }; senão o tratamento padrão. */
function responderErro(res: Response, error: unknown, fallback: string): void {
  const e = (error ?? {}) as { status?: unknown; message?: unknown; extra?: { codigo?: string } };
  if (typeof e.status === "number" && e.status >= 400 && e.status < 500 && e.message) {
    res.status(e.status).json({ message: e.message, ...(e.extra?.codigo ? { codigo: e.extra.codigo } : {}) });
    return;
  }
  responderErroComStatus(res, error, fallback, 500);
}

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** O filtro da compra a partir da query (GET) ou do corpo (POST); erro → 400 já enviado. */
function filtroDaCompra(res: Response, origem: { inicio?: unknown; fim?: unknown; eventId?: unknown; manuais?: unknown; incluirManuais?: unknown }): FiltroDaCompra | null {
  const inicio = texto(origem.inicio), fim = texto(origem.fim);
  const erro = erroDoPeriodo(inicio, fim);
  if (erro) { res.status(400).json({ message: erro, campo: "periodo" }); return null; }
  const eventId = texto(origem.eventId) || null;
  if (eventId && eventId.length > 100) { res.status(400).json({ message: "Evento inválido." }); return null; }
  const manuais = origem.incluirManuais === true || origem.manuais === "1" || origem.manuais === "true";
  return { inicio, fim, eventId, incluirManuais: manuais };
}

const corpoDoLote = z.object({
  inicio: z.string().max(20),
  fim: z.string().max(20),
  eventId: z.string().max(100).nullish(),
  incluirManuais: z.boolean().optional(),
  assinatura: z.string().min(1).max(40),
});
const corpoDoCancelamento = z.object({ motivo: z.string().trim().min(MOTIVO_DO_CANCELAMENTO_MIN).max(MOTIVO_DO_CANCELAMENTO_MAX) });
const corpoDoPago = z.object({ pagoEm: z.string().max(20) });

/** Escopo do arquivo de OC (evento OU período); erro → resposta enviada. */
async function escopoDoArquivoDeOc(req: Request, res: Response): Promise<{ escopo: EscopoDoArquivoDeOc; corte: string } | null> {
  const corte = await lerDataDeCorteDoBanco();
  const eventId = texto(req.query.eventId);
  if (eventId) {
    const evento = await storage.getEvent(eventId);
    if (!evento) { res.status(404).json({ message: "Evento não encontrado." }); return null; }
    if (ehEventoLegado(evento.endDate, corte)) {
      res.status(409).json({ message: `Evento do fluxo antigo (termina antes de ${dataDeCorteLegivel(corte)}): OC segue como antes.`, codigo: "evento_legado" });
      return null;
    }
    return { escopo: { tipo: "evento", evento }, corte };
  }
  const inicio = texto(req.query.inicio), fim = texto(req.query.fim);
  if (!inicio && !fim) { res.status(400).json({ message: "Escolha o evento ou o período." }); return null; }
  const erro = erroDoPeriodo(inicio, fim);
  if (erro) { res.status(400).json({ message: erro, campo: "periodo" }); return null; }
  return { escopo: { tipo: "periodo", inicio, fim }, corte };
}

export function registrarArquivosDeCompra(app: Express): void {
  // ── Compra de créditos Flash ──────────────────────────────────────────────
  app.get("/api/flash/compras/previa", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    const f = filtroDaCompra(res, req.query);
    if (!f) return;
    try {
      res.json(await previaDaCompraParaATela(f));
    } catch (error) {
      responderErro(res, error, "Erro ao montar a prévia da compra");
    }
  });

  app.post("/api/flash/compras", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    const corpo = corpoDoLote.safeParse(req.body);
    if (!corpo.success) return res.status(400).json({ message: "Dados inválidos: período e a assinatura da prévia." });
    const f = filtroDaCompra(res, corpo.data);
    if (!f) return;
    try {
      const lote = await gerarLoteDeCompra(f, corpo.data.assinatura, user);
      await createAuditLog("create", "flash_compra", lote.id, {
        acao: "gerou o lote de compra Flash", lote: lote.numero, periodo: `${lote.periodoInicio} a ${lote.periodoFim}`, eventId: lote.eventId,
        incluiManuais: lote.incluiManuais, colaboradores: lote.colaboradores, lancamentos: lote.lancamentos,
        totalCents: lote.totalCents, alimentacaoCents: lote.totalAlimentacaoCents, mobilidadeCents: lote.totalMobilidadeCents, formato: lote.formato,
      }, user.id, nomeDe(user), undefined, req);
      const [paraATela] = await lotesParaATela([lote]);
      res.status(201).json({ lote: paraATela });
    } catch (error) {
      responderErro(res, error, "Erro ao gerar o lote de compra");
    }
  });

  app.get("/api/flash/compras", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    try {
      res.json({ hoje: hojeISO(), lotes: await listarLotes(), formato: { id: FORMATO_COMPRA_FLASH.id, nome: FORMATO_COMPRA_FLASH.nome, provisorio: FORMATO_COMPRA_FLASH.provisorio } });
    } catch (error) {
      responderErro(res, error, "Erro ao listar os lotes de compra");
    }
  });

  app.get("/api/flash/compras/:id/arquivo", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    const extensao = extensaoDaQuery(req.query.formato);
    try {
      const lote = await lerLote(req.params.id);
      if (!lote) return res.status(404).json({ message: "Lote não encontrado." });
      if (lote.status === "cancelado") return res.status(409).json({ message: "Lote cancelado não tem arquivo — os créditos voltaram para \"a comprar\".", codigo: "lote_cancelado" });
      const linhas = await linhasDoArquivoDoLote(lote);
      // CPF completo: o arquivo é do DP (rota só do DP) e o download fica na auditoria — sem o CPF.
      await createAuditLog("export", "flash_compra", lote.id, {
        acao: "baixou o arquivo de compra Flash (com CPF)", lote: lote.numero, formato: extensao, layout: FORMATO_COMPRA_FLASH.id, linhas: linhas.length,
      }, user.id, nomeDe(user), undefined, req);
      await enviarArquivo(res, FORMATO_COMPRA_FLASH, linhas, `lote-${lote.numero}`, extensao, diaEmSaoPaulo(lote.geradoEm));
    } catch (error) {
      responderErro(res, error, "Erro ao gerar o arquivo do lote");
    }
  });

  app.post("/api/flash/compras/:id/cancelar", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    const corpo = corpoDoCancelamento.safeParse(req.body);
    if (!corpo.success) return res.status(400).json({ message: `Informe o motivo do cancelamento (mínimo ${MOTIVO_DO_CANCELAMENTO_MIN} caracteres).`, campo: "motivo" });
    try {
      const { antes, depois, soltos } = await cancelarLote(req.params.id, corpo.data.motivo, user);
      await createAuditLog("update", "flash_compra", depois.id, {
        acao: "cancelou o lote de compra Flash", lote: depois.numero, motivo: corpo.data.motivo, creditosDevolvidos: soltos, status: depois.status,
      }, user.id, nomeDe(user), { status: antes.status }, req);
      const [lote] = await lotesParaATela([depois]);
      res.json({ lote, creditosDevolvidos: soltos });
    } catch (error) {
      responderErro(res, error, "Erro ao cancelar o lote");
    }
  });

  app.post("/api/flash/compras/:id/pago", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    const corpo = corpoDoPago.safeParse(req.body);
    if (!corpo.success) return res.status(400).json({ message: "Informe a data do pagamento (AAAA-MM-DD).", campo: "pagoEm" });
    try {
      const { antes, depois } = await marcarLotePago(req.params.id, corpo.data.pagoEm, user);
      await createAuditLog("update", "flash_compra", depois.id, {
        acao: "marcou o lote de compra Flash como pago à Flash", lote: depois.numero, pagoEm: corpo.data.pagoEm, status: depois.status,
      }, user.id, nomeDe(user), { status: antes.status, pagoEm: antes.pagoEm }, req);
      const [lote] = await lotesParaATela([depois]);
      res.json({ lote });
    } catch (error) {
      responderErro(res, error, "Erro ao marcar o lote como pago");
    }
  });

  // ── Arquivo de OC do M4 (prestadores + Flash) ─────────────────────────────
  app.get("/api/ordens-de-compra/arquivo-m4/previa", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    try {
      const e = await escopoDoArquivoDeOc(req, res);
      if (!e) return;
      const m = await montarArquivoDeOc(e.escopo, e.corte);
      res.json({
        escopo: e.escopo.tipo === "evento" ? { tipo: "evento", eventId: e.escopo.evento.id, nome: e.escopo.evento.name } : e.escopo,
        prestadores: m.prestadores, flash: m.flash, totalCents: m.totalCents, linhas: m.linhas.length,
        legadosIgnorados: m.legadosIgnorados, formato: formatoDoArquivoDeOc(),
      });
    } catch (error) {
      responderErro(res, error, "Erro ao montar a prévia do arquivo de OC");
    }
  });

  app.get("/api/ordens-de-compra/arquivo-m4", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    const extensao = extensaoDaQuery(req.query.formato);
    try {
      const e = await escopoDoArquivoDeOc(req, res);
      if (!e) return;
      const m = await montarArquivoDeOc(e.escopo, e.corte);
      if (m.linhas.length === 0) return res.status(409).json({ message: "Nada para o arquivo: nenhuma prestação aprovada sem OC e nenhum lote Flash neste escopo.", codigo: "vazio" });
      const hoje = hojeISO();
      const complemento = e.escopo.tipo === "evento" ? `evento-${e.escopo.evento.eventNumber}-${hoje}` : `${e.escopo.inicio}-a-${e.escopo.fim}`;
      await createAuditLog("export", "budget_actual", e.escopo.tipo === "evento" ? e.escopo.evento.id : `periodo:${e.escopo.inicio}:${e.escopo.fim}`, {
        acao: "exportou o arquivo de OC do M4 (prestadores + Flash)", layout: FORMATO_OC_M4.id, formato: extensao,
        escopo: e.escopo.tipo === "evento" ? e.escopo.evento.name : `${e.escopo.inicio} a ${e.escopo.fim}`,
        prestadores: m.prestadores.linhas, lotesFlash: m.flash.lotes.map((l) => l.numero), totalCents: m.totalCents,
      }, user.id, nomeDe(user), undefined, req);
      await enviarArquivo(res, FORMATO_OC_M4, m.linhas, complemento, extensao, hoje);
    } catch (error) {
      responderErro(res, error, "Erro ao gerar o arquivo de OC");
    }
  });
}
