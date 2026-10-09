/**
 * Rotas da busca de passagens na internet (09/10) — SÓ admin e Compras.
 *
 *  POST /api/busca-de-passagens              prévia (grátis) e busca (gasta só o autorizado)
 *  POST /api/busca-de-passagens/link         link de compra de um itinerário (só no clique; cache)
 *  GET  /api/busca-de-passagens/consumo      "N de 1.000 consultas este mês"
 *  GET  /api/busca-de-passagens/consumo/detalhe   aba Consumo (só admin)
 *  POST /api/busca-de-passagens/uso          "Usar este voo" que virou passagem (preço encontrado × pago)
 *  PUT  /api/busca-de-passagens/eventos/:id/aeroporto   confirma o aeroporto do evento
 *  PUT  /api/busca-de-passagens/teto         teto mensal (só admin)
 *
 * Regras do dono garantidas AQUI (a tela só mostra): nada consulta sem pedido
 * explícito; vaga com dado faltando não consulta; o cache de 3 h é de todos;
 * consulta de cache não conta; no teto a busca para com aviso claro.
 */
import type { Express, Request, Response } from "express";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { buscaPassagensConsultas, buscaPassagensUsos, collaborators, events, systemSettings, tickets, users } from "@shared/schema";
import { resumirConsumo } from "@shared/consumo-da-busca";
import {
  CHAVE_DO_TETO_MENSAL,
  HORAS_DE_CACHE_DA_BUSCA,
  MAX_CONSULTAS_POR_BUSCA,
  MAX_VAGAS_POR_BUSCA,
  chaveDoLink,
  pick,
  planejarBusca,
  variantesDeData,
  type AjusteDaBusca,
  type ConsultaDePassagens,
  type ConsumoDaBusca,
  type DadoFaltando,
  type ErroNaRota,
  type EventoDaBusca,
  type ResultadoDaConsulta,
  type ResultadoNaTela,
  type RespostaDaBusca,
  type RotaNaTela,
  type VagaDaBusca,
} from "@shared/busca-de-passagens";
import { ehIata, AEROPORTOS } from "@shared/aeroportos-do-brasil";
import { hojeISO } from "@shared/hoje-sp";
import { createAuditLog, requireRoles } from "../routes/_compartilhado";
import { ErroDoFornecedor, type LinkDeCompra } from "./fornecedor";
import {
  consultarUmaVez,
  consumoDoMes,
  diariaMediaPorEvento,
  fornecedorAtual,
  gravarCache,
  lerCache,
  linksUmaVez,
  linhasDeConsumo,
  registrarAcertosDoCache,
  registrarConsumo,
  registrarHistorico,
  tetoMensal,
} from "./servico";

const QUEM_BUSCA = ["admin", "purchasing"] as const;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

const listaDeTexto = (v: unknown, max = 200): string[] =>
  Array.isArray(v) ? Array.from(new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 300))).slice(0, max) : [];

/** Ajuste vindo da tela → só o que a regra aceita (nada mais passa). */
function lerAjuste(bruto: unknown): AjusteDaBusca {
  if (!bruto || typeof bruto !== "object") return {};
  const a = bruto as Record<string, unknown>;
  const out: AjusteDaBusca = {};
  if (typeof a.aeroportoDeCasa === "string" && ehIata(a.aeroportoDeCasa)) out.aeroportoDeCasa = a.aeroportoDeCasa.toUpperCase();
  if (typeof a.dataIda === "string" && DATA.test(a.dataIda)) out.dataIda = a.dataIda;
  if (typeof a.dataVolta === "string" && DATA.test(a.dataVolta)) out.dataVolta = a.dataVolta;
  if (a.maxParadas === 2) out.maxParadas = 2;
  if (typeof a.idaDoEventoId === "string" && a.idaDoEventoId.length <= 64) out.idaDoEventoId = a.idaDoEventoId;
  if (a.somente === "ida" || a.somente === "volta") out.somente = a.somente;
  return out;
}

async function consumoAtual(): Promise<ConsumoDaBusca> {
  const f = fornecedorAtual();
  const [usadas, teto] = await Promise.all([consumoDoMes(), tetoMensal()]);
  return { usadas, teto, fornecedor: f ? { nome: f.nome, simulado: f.simulado } : null, cacheHoras: HORAS_DE_CACHE_DA_BUSCA };
}

const erroDaRota = (e: unknown): ErroNaRota =>
  e instanceof ErroDoFornecedor
    ? { codigo: e.codigo, mensagem: e.message }
    : { codigo: "falha", mensagem: "A consulta falhou. Tente de novo em instantes." };

function responderTeto(res: Response, usadas: number, teto: number, precisa: number) {
  const restam = Math.max(0, teto - usadas);
  res.status(429).json({
    code: "teto_atingido",
    message: restam === 0
      ? `O teto de ${teto} consultas deste mês foi atingido. A busca volta no dia 1º — ou o administrador aumenta o teto.`
      : `Restam ${restam} de ${teto} consultas este mês e esta busca precisa de ${precisa}. Busque menos rotas ou peça ao administrador para aumentar o teto.`,
    usadas, teto, precisa,
  });
}

export function registrarBuscaDePassagens(app: Express): void {
  app.get("/api/busca-de-passagens/consumo", async (req, res) => {
    if (!await requireRoles(req, res, QUEM_BUSCA)) return;
    try {
      res.set("Cache-Control", "no-store");
      res.json(await consumoAtual());
    } catch (error) {
      console.error("[busca-de-passagens] consumo:", error instanceof Error ? error.message : error);
      res.status(500).json({ message: "Erro ao ler o consumo da busca de passagens" });
    }
  });

  app.post("/api/busca-de-passagens", async (req: Request, res: Response) => {
    const ator = await requireRoles(req, res, QUEM_BUSCA);
    if (!ator) return;
    const corpo = (req.body ?? {}) as Record<string, unknown>;
    const brutas = Array.isArray(corpo.vagas) ? corpo.vagas : [];
    const pedidas = brutas
      .filter((v): v is { id: string; ajuste?: unknown } => !!v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string")
      .map((v) => ({ id: v.id, ajuste: lerAjuste(v.ajuste) }));
    if (pedidas.length === 0) return res.status(400).json({ message: "Escolha ao menos uma vaga." });
    if (pedidas.length > MAX_VAGAS_POR_BUSCA) return res.status(400).json({ message: `Busque no máximo ${MAX_VAGAS_POR_BUSCA} vagas por vez.` });
    const consultar = new Set(listaDeTexto(corpo.consultar));
    const consultarVagas = new Set(listaDeTexto(corpo.consultarVagas));
    const atualizar = new Set(listaDeTexto(corpo.atualizar));
    const flex = new Set(listaDeTexto(corpo.flex));
    const mostrarFlex = new Set([...listaDeTexto(corpo.mostrarFlex), ...Array.from(flex)]);

    try {
      const hoje = hojeISO();
      // ── Dados das vagas (só o que a regra lê; nada disso sai para o fornecedor)
      const vagasDoBanco = (await storage.getTeamInclusionsByIds(pedidas.map((p) => p.id))).filter((v) => !v.deletedAt);
      const porId = new Map(vagasDoBanco.map((v) => [v.id, v]));
      const faltandoExtra: DadoFaltando[] = pedidas
        .filter((p) => !porId.has(p.id))
        .map((p) => ({ vagaId: p.id, tipo: "vaga_invalida" as const, mensagem: "Vaga não encontrada ou excluída." }));
      const colabIds = Array.from(new Set(vagasDoBanco.map((v) => v.collaboratorId).filter((x): x is string => !!x)));
      const cidades = new Map((colabIds.length
        ? await db.select({ id: collaborators.id, city: collaborators.city }).from(collaborators).where(inArray(collaborators.id, colabIds))
        : []).map((c) => [c.id, c.city]));
      const eventIds = new Set<string>();
      for (const v of vagasDoBanco) {
        eventIds.add(v.eventId);
        if (v.idaVemDoEventoId) eventIds.add(v.idaVemDoEventoId);
      }
      for (const p of pedidas) if (p.ajuste.idaDoEventoId) eventIds.add(p.ajuste.idaDoEventoId);
      const eventos = new Map<string, EventoDaBusca>((await storage.getEventsByIds(Array.from(eventIds)))
        .map((e) => [e.id, { id: e.id, name: e.name, location: e.location, aeroportoIata: e.aeroportoIata ?? null }]));
      const vagas: VagaDaBusca[] = vagasDoBanco.map((v) => ({
        ...v,
        cidadeDeSaida: v.city || (v.collaboratorId ? cidades.get(v.collaboratorId) : null) || null,
      }));
      const ajustes = Object.fromEntries(pedidas.map((p) => [p.id, p.ajuste]));
      const plano = planejarBusca({ vagas, eventos, ajustes, hoje });

      // ── Datas vizinhas e cache
      const variantesPorRota = new Map(plano.rotas.map((r) => [r.chave, variantesDeData(r, hoje)]));
      const todasAsChaves = [...plano.rotas.map((r) => r.chave), ...Array.from(variantesPorRota.values()).flat().map((v) => v.chave)];
      const cache = await lerCache<ResultadoDaConsulta>(todasAsChaves);

      // ── O que este pedido autoriza a gastar (e só se não estiver no cache)
      type Contexto = { consulta: ConsultaDePassagens; tipo: string; vagaIds: string[]; eventoIds: string[]; deslocamento: { ida: number; volta: number } | null };
      const aConsultar = new Map<string, Contexto>();
      for (const r of plano.rotas) {
        const autorizada = consultar.has(r.chave) || atualizar.has(r.chave) || r.vagas.some((v) => consultarVagas.has(v.vagaId));
        if (autorizada && (!cache.has(r.chave) || atualizar.has(r.chave))) aConsultar.set(r.chave, { consulta: pick(r), tipo: r.perna, vagaIds: r.vagas.map((v) => v.vagaId), eventoIds: r.eventoIds, deslocamento: null });
        if (flex.has(r.chave)) {
          for (const v of variantesPorRota.get(r.chave) ?? []) {
            if (!cache.has(v.chave) || atualizar.has(v.chave)) aConsultar.set(v.chave, { consulta: v.consulta, tipo: r.perna, vagaIds: r.vagas.map((x) => x.vagaId), eventoIds: r.eventoIds, deslocamento: v.deslocamento });
          }
        }
      }
      if (aConsultar.size > MAX_CONSULTAS_POR_BUSCA) {
        return res.status(400).json({ message: `Esta busca faria ${aConsultar.size} consultas — o máximo por vez é ${MAX_CONSULTAS_POR_BUSCA}. Selecione menos vagas.` });
      }

      const fornecedor = fornecedorAtual();
      const erros = new Map<string, ErroNaRota>();
      const agora = new Map<string, { resultado: ResultadoDaConsulta; em: Date }>();
      let gastou = 0;
      if (aConsultar.size > 0) {
        if (!fornecedor) {
          return res.status(503).json({ code: "nao_configurada", message: "A busca de preços ainda não está configurada: falta o Secret IGNAV_API_KEY no servidor." });
        }
        const [usadas, teto] = await Promise.all([consumoDoMes(), tetoMensal()]);
        if (usadas + aConsultar.size > teto) return responderTeto(res, usadas, teto, aConsultar.size);

        // Até 3 de cada vez; erro de crédito/chave para tudo o que falta.
        const fila = Array.from(aConsultar.entries());
        let parar: ErroNaRota | null = null;
        const trabalhar = async () => {
          for (;;) {
            const item = fila.shift();
            if (!item) return;
            const [chave, ctx] = item;
            const { consulta, tipo } = ctx;
            if (parar) { erros.set(chave, parar); continue; }
            try {
              const { promessa, nova } = consultarUmaVez(chave, fornecedor, consulta);
              const resultado = await promessa;
              if (nova) {
                const em = await gravarCache(chave, fornecedor.nome, resultado, ator.id);
                await registrarConsumo(tipo, chave, fornecedor.nome, ator.id);
                gastou++;
                agora.set(chave, { resultado, em });
                // Histórico para as análises: falhar aqui não pode derrubar a busca.
                await registrarHistorico({ chave, consulta, resultado, fornecedor: fornecedor.nome, usuarioId: ator.id, vagaIds: ctx.vagaIds, eventoIds: ctx.eventoIds, deslocamento: ctx.deslocamento })
                  .catch((e) => console.error("[busca-de-passagens] histórico:", e instanceof Error ? e.message : e));
              } else {
                agora.set(chave, { resultado, em: new Date() });
              }
            } catch (e) {
              const erro = erroDaRota(e);
              erros.set(chave, erro);
              if (erro.codigo === "limite_do_fornecedor" || erro.codigo === "chave_invalida") parar = erro;
            }
          }
        };
        await Promise.all([trabalhar(), trabalhar(), trabalhar()]);
      }

      const naTela = (chave: string): ResultadoNaTela | null => {
        const n = agora.get(chave);
        if (n) return { ...n.resultado, consultadoEm: n.em.toISOString(), doCache: false };
        const c = cache.get(chave);
        return c ? { ...c.resposta, consultadoEm: c.consultadoEm.toISOString(), doCache: true } : null;
      };
      const diarias = await diariaMediaPorEvento(plano.rotas.flatMap((r) => r.eventoIds));
      const rotas: RotaNaTela[] = plano.rotas.map((r) => {
        const variantes = variantesPorRota.get(r.chave) ?? [];
        const valoresDeDiaria = r.eventoIds.map((id) => diarias.get(id)).filter((x): x is number => typeof x === "number");
        return {
          ...r,
          resultado: naTela(r.chave),
          erro: erros.get(r.chave) ?? null,
          diariaCentavos: valoresDeDiaria.length ? Math.round(valoresDeDiaria.reduce((s, x) => s + x, 0) / valoresDeDiaria.length) : null,
          variantes: mostrarFlex.has(r.chave)
            ? variantes.map((v) => ({
              chave: v.chave, rotulo: v.rotulo, diarias: v.diarias, dataIda: v.consulta.dataIda, dataVolta: v.consulta.dataVolta,
              resultado: naTela(v.chave), erro: erros.get(v.chave) ?? null,
            }))
            : null,
          consultasDoFlex: variantes.filter((v) => !cache.has(v.chave) && !agora.has(v.chave)).length,
        };
      });

      // Quem recebeu do cache sem consultar (aba Consumo · % atendido pelo cache).
      const servidasDoCache = rotas.flatMap((r) => [
        ...(r.resultado?.doCache && cache.get(r.chave) ? [{ chave: r.chave, tipo: r.perna, entrada: cache.get(r.chave)! }] : []),
        ...(r.variantes ?? []).filter((v) => v.resultado?.doCache && cache.get(v.chave)).map((v) => ({ chave: v.chave, tipo: r.perna, entrada: cache.get(v.chave)! })),
      ]);
      await registrarAcertosDoCache(ator.id, servidasDoCache).catch((e) => console.error("[busca-de-passagens] acertos do cache:", e instanceof Error ? e.message : e));

      if (gastou > 0) {
        // Auditoria SEM dado pessoal: só quantas consultas e as rotas (aeroportos/datas).
        await createAuditLog("buscar_precos", "busca_de_passagens", hoje.slice(0, 7), {
          consultas: gastou, vagas: vagasDoBanco.length, rotas: Array.from(agora.keys()).slice(0, 40), fornecedor: fornecedor?.nome,
        }, ator.id, ator.name || "Sistema", undefined, req);
      }
      const resposta: RespostaDaBusca = { rotas, faltando: [...faltandoExtra, ...plano.faltando], gastou, consumo: await consumoAtual() };
      res.set("Cache-Control", "no-store");
      res.json(resposta);
    } catch (error) {
      console.error("[busca-de-passagens] busca:", error instanceof Error ? error.message : error);
      res.status(500).json({ message: "Erro ao buscar preços de passagem" });
    }
  });

  app.post("/api/busca-de-passagens/link", async (req, res) => {
    const ator = await requireRoles(req, res, QUEM_BUSCA);
    if (!ator) return;
    const id = typeof req.body?.itinerarioId === "string" ? req.body.itinerarioId.trim() : "";
    if (!id || id.length > 300) return res.status(400).json({ message: "Itinerário inválido." });
    try {
      const chave = chaveDoLink(id);
      const cache = await lerCache<LinkDeCompra[]>([chave]);
      const emCache = cache.get(chave);
      if (emCache) return res.json({ links: emCache.resposta, doCache: true });
      const fornecedor = fornecedorAtual();
      if (!fornecedor) return res.status(503).json({ code: "nao_configurada", message: "A busca de preços ainda não está configurada: falta o Secret IGNAV_API_KEY no servidor." });
      const [usadas, teto] = await Promise.all([consumoDoMes(), tetoMensal()]);
      if (usadas + 1 > teto) return responderTeto(res, usadas, teto, 1);
      const { promessa, nova } = linksUmaVez(id, fornecedor);
      const links = await promessa;
      if (nova) {
        await gravarCache(chave, fornecedor.nome, links, ator.id);
        await registrarConsumo("link", chave, fornecedor.nome, ator.id);
      }
      res.json({ links, doCache: false });
    } catch (e) {
      const erro = erroDaRota(e);
      const status = erro.codigo === "nao_encontrado" ? 404 : erro.codigo === "limite_do_fornecedor" ? 429 : 502;
      res.status(status).json({ code: erro.codigo, message: erro.mensagem });
    }
  });

  app.put("/api/busca-de-passagens/eventos/:id/aeroporto", async (req, res) => {
    const ator = await requireRoles(req, res, QUEM_BUSCA);
    if (!ator) return;
    const iata = typeof req.body?.iata === "string" ? req.body.iata.trim().toUpperCase() : "";
    if (!ehIata(iata)) return res.status(400).json({ message: "Informe o código do aeroporto com 3 letras (ex.: GRU)." });
    try {
      const anterior = await storage.getEvent(req.params.id);
      if (!anterior) return res.status(404).json({ message: "Evento não encontrado" });
      const [evento] = await db.update(events).set({ aeroportoIata: iata }).where(eq(events.id, anterior.id)).returning();
      await createAuditLog("update", "event", evento.id, evento, ator.id, ator.name || "Sistema", anterior, req);
      res.json({ id: evento.id, aeroportoIata: evento.aeroportoIata, conhecido: !!AEROPORTOS[iata] });
    } catch (error) {
      console.error("[busca-de-passagens] aeroporto do evento:", error instanceof Error ? error.message : error);
      res.status(500).json({ message: "Erro ao salvar o aeroporto do evento" });
    }
  });

  /** Aba Consumo (só admin): mês corrente, 6 meses, por usuário, cache e projeção. */
  app.get("/api/busca-de-passagens/consumo/detalhe", async (req, res) => {
    if (!await requireRoles(req, res, ["admin"])) return;
    try {
      const [linhas, teto] = await Promise.all([linhasDeConsumo(6), tetoMensal()]);
      const ids = Array.from(new Set(linhas.map((l) => l.usuarioId).filter((x): x is string => !!x)));
      const nomes = Object.fromEntries((ids.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids)) : [])
        .map((u) => [u.id, u.name]));
      const f = fornecedorAtual();
      res.set("Cache-Control", "no-store");
      res.json({
        ...resumirConsumo(linhas, { hoje: hojeISO(), teto, nomes }),
        fornecedor: f ? { nome: f.nome, simulado: f.simulado } : null,
        cacheHoras: HORAS_DE_CACHE_DA_BUSCA,
      });
    } catch (error) {
      console.error("[busca-de-passagens] consumo detalhado:", error instanceof Error ? error.message : error);
      res.status(500).json({ message: "Erro ao montar o consumo da busca" });
    }
  });

  /**
   * "Usar este voo" que virou passagem registrada: guarda o preço ENCONTRADO
   * (e quando foi visto) ligado à vaga e à passagem atual — base do "pago ×
   * encontrado". Chamado pela tela logo depois do registro.
   */
  app.post("/api/busca-de-passagens/uso", async (req, res) => {
    const ator = await requireRoles(req, res, QUEM_BUSCA);
    if (!ator) return;
    const b = (req.body ?? {}) as Record<string, unknown>;
    const txt = (k: string, max = 300) => (typeof b[k] === "string" && (b[k] as string).length <= max ? (b[k] as string) : null);
    const vagaId = txt("teamInclusionId", 64);
    const chave = txt("chave");
    const itinerarioId = txt("itinerarioId");
    const perna = b.perna === "ida" || b.perna === "volta" || b.perna === "ida_e_volta" ? b.perna : null;
    const preco = Number(b.precoCentavos);
    if (!vagaId || !chave || !itinerarioId || !perna || !Number.isInteger(preco) || preco <= 0) return res.status(400).json({ message: "Dados do voo usado incompletos." });
    try {
      const [passagem] = await db.select({ id: tickets.id }).from(tickets)
        .where(and(eq(tickets.teamInclusionId, vagaId), isNull(tickets.archivedAt))).orderBy(desc(tickets.updatedAt)).limit(1);
      const [consulta] = await db.select({ id: buscaPassagensConsultas.id }).from(buscaPassagensConsultas)
        .where(eq(buscaPassagensConsultas.chave, chave)).orderBy(desc(buscaPassagensConsultas.consultadoEm)).limit(1);
      const visto = typeof b.precoVistoEm === "string" ? new Date(b.precoVistoEm) : null;
      await db.insert(buscaPassagensUsos).values({
        usuarioId: ator.id, teamInclusionId: vagaId, ticketId: passagem?.id ?? null, consultaId: consulta?.id ?? null,
        chave, perna, itinerarioId, companhia: txt("companhia", 60), voos: txt("voos", 200), precoEncontradoCentavos: preco,
        precoVistoEm: visto && !Number.isNaN(visto.getTime()) ? visto : null,
      });
      res.json({ ok: true, ticketId: passagem?.id ?? null });
    } catch (error) {
      console.error("[busca-de-passagens] uso:", error instanceof Error ? error.message : error);
      res.status(500).json({ message: "Erro ao guardar o voo usado" });
    }
  });

  app.put("/api/busca-de-passagens/teto", async (req, res) => {
    const admin = await requireRoles(req, res, ["admin"]);
    if (!admin) return;
    const teto = Number(req.body?.teto);
    if (!Number.isInteger(teto) || teto < 0 || teto > 1_000_000) return res.status(400).json({ message: "Informe um teto inteiro entre 0 e 1.000.000." });
    try {
      const anterior = await tetoMensal();
      await db.insert(systemSettings).values({ key: CHAVE_DO_TETO_MENSAL, value: String(teto), updatedBy: admin.id })
        .onConflictDoUpdate({ target: systemSettings.key, set: { value: String(teto), updatedBy: admin.id, updatedAt: new Date() } });
      await createAuditLog("update", "system_settings", CHAVE_DO_TETO_MENSAL, { [CHAVE_DO_TETO_MENSAL]: teto }, admin.id, admin.name || "Sistema", { [CHAVE_DO_TETO_MENSAL]: anterior }, req);
      res.json(await consumoAtual());
    } catch (error) {
      console.error("[busca-de-passagens] teto:", error instanceof Error ? error.message : error);
      res.status(500).json({ message: "Erro ao salvar o teto" });
    }
  });
}
