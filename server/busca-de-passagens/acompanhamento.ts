/**
 * ACOMPANHAR PREÇO (etapa 2, 09/10) — admin e Compras marcam uma escalação; o
 * agendador (agendador.ts) checa 1x/dia e avisa no sino quando o preço cai X%
 * ou a tendência vira "subir". Regras do dono garantidas aqui:
 *  - no máximo N acompanhadas ao mesmo tempo (ajuste do admin, padrão 20);
 *  - respeita o TETO MENSAL: rota no cache não gasta; no teto, pula e diz;
 *  - para sozinho quando a passagem é registrada (ou a vaga deixa de precisar);
 *  - marcar NÃO gasta consulta: o primeiro preço vem do cache, se houver.
 *
 *  GET    /api/busca-de-passagens/acompanhamentos           lista (ativos + parados há 7 dias)
 *  POST   /api/busca-de-passagens/acompanhamentos           { teamInclusionId, ajuste? }
 *  DELETE /api/busca-de-passagens/acompanhamentos/:id       parar
 *  POST   /api/busca-de-passagens/acompanhamentos/vistos    { ids? } — tira o aviso do sino
 *  POST   /api/busca-de-passagens/acompanhamentos/checar    "Checar agora" (só admin)
 *  GET    /api/shell/precos-acompanhados                     { count } — item de Pendências do sino
 */
import type { Express } from "express";
import { and, eq, gte, inArray, isNotNull, isNull, or, sql as drizzleSql } from "drizzle-orm";
import { db, linhasDe } from "../db";
import { buscaPassagensAcompanhamentos, USUARIO_SISTEMA, type User } from "@shared/schema";
import { hojeISO } from "@shared/hoje-sp";
import { pick, type ConsultaDePassagens, type ResultadoDaConsulta } from "@shared/busca-de-passagens";
import { PAPEIS_DA_BUSCA, PAPEIS_DAS_ANALISES, decidirAvisoDoAcompanhamento, nomeDaRota, chaveDaRota, type TendenciaDoPreco } from "@shared/regras-da-busca";
import { prepararPrevisao, preverVaga, type VagaParaPrevisao } from "@shared/previsao-da-busca";
import { createAuditLog, requireRoles } from "../routes/_compartilhado";
import { carregarConsultas, carregarPendentes } from "./historico";
import { SQL_TERRESTRE_COBRE_A_VAGA } from "../transporte-terrestre";
import {
  consultarUmaVez,
  consumoDoMes,
  fornecedorAtual,
  gravarCache,
  lerAjuste,
  lerAjustes,
  lerCache,
  registrarConsumo,
  registrarHistorico,
  tetoMensal,
} from "./servico";

export interface ResumoDaChecagem {
  checadas: number;
  consultas: number;
  doCache: number;
  avisos: number;
  paradas: number;
  /** Ficaram sem checar porque o teto do mês não deixava gastar. */
  puladas: number;
  erros: number;
  semFornecedor: boolean;
}

const menorPreco = (r: ResultadoDaConsulta | null | undefined) => {
  const v = (r?.itinerarios ?? []).map((i) => i.precoCentavos).filter((p) => p > 0);
  return v.length ? Math.min(...v) : null;
};

/** Encerra os acompanhamentos ativos de vagas que já têm passagem registrada. */
export async function pararOsQueJaTemPassagem(): Promise<number> {
  const r = await db.update(buscaPassagensAcompanhamentos)
    .set({ ativo: false, paradoEm: new Date(), motivoParada: "Passagem registrada" })
    .where(and(
      eq(buscaPassagensAcompanhamentos.ativo, true),
      drizzleSql`EXISTS (SELECT 1 FROM tickets t WHERE t.team_inclusion_id = ${buscaPassagensAcompanhamentos.teamInclusionId} AND t.archived_at IS NULL)`,
    ))
    .returning({ id: buscaPassagensAcompanhamentos.id });
  // 16/10: quem passou a ir de carro/van/ônibus em todas as pernas não tem voo
  // a acompanhar — cada checagem gastaria consulta à toa.
  const terrestre = await db.update(buscaPassagensAcompanhamentos)
    .set({ ativo: false, paradoEm: new Date(), motivoParada: "Vai de carro/van (transporte terrestre)" })
    .where(and(
      eq(buscaPassagensAcompanhamentos.ativo, true),
      drizzleSql`EXISTS (SELECT 1 FROM team_inclusions ti WHERE ti.id = ${buscaPassagensAcompanhamentos.teamInclusionId} AND ${SQL_TERRESTRE_COBRE_A_VAGA})`,
    ))
    .returning({ id: buscaPassagensAcompanhamentos.id });
  return r.length + terrestre.length;
}

/**
 * A checagem: cada escalação acompanhada (até o limite), na ordem em que
 * entrou. Fase 1 pega o preço de hoje (cache ou consulta, dentro do teto);
 * fase 2 lê o histórico já com as consultas novas e decide tendência e aviso.
 */
export async function checarAcompanhamentos(ator: Pick<User, "id" | "name"> | null): Promise<ResumoDaChecagem> {
  const resumo: ResumoDaChecagem = { checadas: 0, consultas: 0, doCache: 0, avisos: 0, paradas: 0, puladas: 0, erros: 0, semFornecedor: false };
  const hoje = hojeISO();
  const ajustes = await lerAjustes();
  resumo.paradas += await pararOsQueJaTemPassagem();
  const ativos = await db.select().from(buscaPassagensAcompanhamentos)
    .where(eq(buscaPassagensAcompanhamentos.ativo, true))
    .orderBy(buscaPassagensAcompanhamentos.criadoEm)
    .limit(Math.max(0, ajustes.limiteDeAcompanhamentos));
  if (ativos.length === 0) return resumo;

  const ajustesPorVaga = Object.fromEntries(ativos.map((a) => [a.teamInclusionId, lerAjuste(a.ajuste)]));
  const pendentes = new Map((await carregarPendentes(hoje, ativos.map((a) => a.teamInclusionId), ajustesPorVaga)).map((v) => [v.vagaId, v]));
  const fornecedor = fornecedorAtual();
  resumo.semFornecedor = !fornecedor;
  const [usadasNoInicio, teto] = await Promise.all([consumoDoMes(), tetoMensal()]);
  let usadas = usadasNoInicio;
  const ator_ = ator?.id ?? USUARIO_SISTEMA.id;

  // Fase 1 — o preço de hoje de cada vaga (soma das rotas dela).
  const precoDeHoje = new Map<string, { preco: number | null; chaves: string[]; vaga: VagaParaPrevisao }>();
  for (const a of ativos) {
    const vaga = pendentes.get(a.teamInclusionId);
    if (!vaga) {
      await db.update(buscaPassagensAcompanhamentos)
        .set({ ativo: false, paradoEm: new Date(), motivoParada: "A escalação não precisa mais de passagem (cancelada, excluída ou com a data passada)" })
        .where(eq(buscaPassagensAcompanhamentos.id, a.id));
      resumo.paradas += 1;
      continue;
    }
    if (vaga.rotas.length === 0) { resumo.erros += 1; continue; }
    const chaves = vaga.rotas.map((r) => r.chave);
    const cache = await lerCache<ResultadoDaConsulta>(chaves);
    const faltam = vaga.rotas.filter((r) => !cache.has(r.chave));
    if (faltam.length > 0 && (!fornecedor || usadas + faltam.length > teto)) {
      if (fornecedor) resumo.puladas += 1;
      // Sem fornecedor ou sem teto: usa só o que está no cache (se tudo estiver).
      continue;
    }
    let preco: number | null = 0;
    for (const r of vaga.rotas) {
      let resultado: ResultadoDaConsulta | null = cache.get(r.chave)?.resposta ?? null;
      if (resultado) resumo.doCache += 1;
      else if (fornecedor) {
        try {
          const consulta: ConsultaDePassagens = pick({ ...r, maxParadas: 1, horarioIda: null, horarioVolta: null, ...chaveParaFiltros(r.chave) });
          const { promessa, nova } = consultarUmaVez(r.chave, fornecedor, consulta);
          resultado = await promessa;
          if (nova) {
            await gravarCache(r.chave, fornecedor.nome, resultado, ator_);
            await registrarConsumo(r.perna, r.chave, fornecedor.nome, ator_);
            usadas += 1;
            resumo.consultas += 1;
            await registrarHistorico({ chave: r.chave, consulta, resultado, fornecedor: fornecedor.nome, usuarioId: ator_, vagaIds: [vaga.vagaId], eventoIds: [vaga.eventId], deslocamento: null })
              .catch((e) => console.error("[busca-de-passagens] histórico do acompanhamento:", e instanceof Error ? e.message : e));
          }
        } catch (e) {
          console.warn("[busca-de-passagens] acompanhamento:", e instanceof Error ? e.message : e);
          resumo.erros += 1;
          resultado = null;
        }
      }
      const m = menorPreco(resultado);
      preco = m === null || preco === null ? null : preco + m;
    }
    precoDeHoje.set(a.id, { preco, chaves, vaga });
  }

  // Fase 2 — tendência (com o histórico de hoje) e o aviso.
  const preparado = prepararPrevisao({ consultas: await carregarConsultas(new Date(Date.now() - 365 * 86_400_000)), hoje });
  const agora = new Date();
  for (const a of ativos) {
    const hojeDaVaga = precoDeHoje.get(a.id);
    if (!hojeDaVaga) continue;
    resumo.checadas += 1;
    const previsao = preverVaga(hojeDaVaga.vaga, preparado);
    const novaTendencia: TendenciaDoPreco = previsao.tendencia;
    const decisao = decidirAvisoDoAcompanhamento({
      referencia: a.precoReferenciaCentavos ?? null,
      novoPreco: hojeDaVaga.preco,
      tendenciaAnterior: (a.tendencia as TendenciaDoPreco | null) ?? null,
      novaTendencia,
      quedaPct: ajustes.quedaParaAvisoPct,
    });
    const preco = hojeDaVaga.preco;
    await db.update(buscaPassagensAcompanhamentos).set({
      chaves: hojeDaVaga.chaves,
      ultimaChecagemEm: agora,
      tendencia: novaTendencia,
      ...(preco !== null ? {
        ultimoPrecoCentavos: preco,
        menorPrecoCentavos: a.menorPrecoCentavos ? Math.min(a.menorPrecoCentavos, preco) : preco,
        precoInicialCentavos: a.precoInicialCentavos ?? preco,
      } : {}),
      precoReferenciaCentavos: decisao.referencia,
      ...(decisao.aviso ? { aviso: decisao.aviso, avisoTexto: decisao.texto, avisoEm: agora, avisoVistoEm: null } : {}),
    }).where(eq(buscaPassagensAcompanhamentos.id, a.id));
    if (decisao.aviso) resumo.avisos += 1;
  }

  await createAuditLog("checar_precos", "busca_de_passagens", hoje, {
    consultas: resumo.consultas, checadas: resumo.checadas, avisos: resumo.avisos, paradas: resumo.paradas, puladas: resumo.puladas,
  }, ator?.id ?? USUARIO_SISTEMA.id, ator?.name || "Sistema");
  return resumo;
}

/** Os filtros de horário moram na chave (planejarBusca já decidiu): reconstrói a consulta exata. */
function chaveParaFiltros(chave: string): Partial<ConsultaDePassagens> {
  const partes = chave.split("|");
  const paradas = partes[4] === "p2" ? 2 : 1;
  const filtro = (t: string | undefined) => {
    if (!t || t === "-") return null;
    const [partidaDe, partidaAte, chegadaDe, chegadaAte] = t.split(",").map((x) => (x === "" ? undefined : Number(x)));
    const f = { partidaDe, partidaAte, chegadaDe, chegadaAte };
    return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)) as ConsultaDePassagens["horarioIda"];
  };
  return { maxParadas: paradas, horarioIda: filtro(partes[5]), horarioVolta: filtro(partes[6]) };
}

/** Linha da lista, com o que a tela mostra (sem nada além do que a vaga já mostra no app). */
async function listar() {
  const rows = await db.execute(drizzleSql`
    SELECT a.*, ti.inclusion_number, ti.event_id, e.name AS event_name, c.full_name AS colaborador, f.name AS funcao, u.name AS criado_por_nome
    FROM busca_passagens_acompanhamentos a
    LEFT JOIN team_inclusions ti ON ti.id = a.team_inclusion_id
    LEFT JOIN events e ON e.id = ti.event_id
    LEFT JOIN collaborators c ON c.id = ti.collaborator_id
    LEFT JOIN functions f ON f.id = ti.function_id
    LEFT JOIN users u ON u.id = a.criado_por
    WHERE a.ativo = TRUE OR a.parado_em >= now() - interval '7 days'
    ORDER BY a.ativo DESC, (a.aviso_em IS NOT NULL AND (a.aviso_visto_em IS NULL OR a.aviso_visto_em < a.aviso_em)) DESC, a.aviso_em DESC NULLS LAST, a.criado_em DESC
  `);
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return linhasDe<Record<string, unknown>>(rows).map((l) => {
    const chaves = Array.isArray(l.chaves) ? (l.chaves as string[]) : typeof l.chaves === "string" ? String(l.chaves).slice(1, -1).split(",").filter(Boolean) : [];
    const rotas = chaves.map((k) => {
      const [perna, trecho] = k.split("|");
      const [o, d] = (trecho ?? "").split(">");
      return o && d ? nomeDaRota(chaveDaRota(perna, o, d)) : null;
    }).filter((x): x is string => !!x);
    const avisoEm = iso(l.aviso_em), vistoEm = iso(l.aviso_visto_em);
    return {
      id: String(l.id),
      teamInclusionId: String(l.team_inclusion_id),
      inclusionNumber: num(l.inclusion_number),
      eventId: (l.event_id as string | null) ?? null,
      eventName: (l.event_name as string | null) ?? null,
      colaborador: (l.colaborador as string | null) ?? null,
      funcao: (l.funcao as string | null) ?? null,
      criadoPorNome: (l.criado_por_nome as string | null) ?? null,
      criadoEm: iso(l.criado_em),
      ativo: l.ativo === true || l.ativo === "t",
      rotas,
      precoInicial: num(l.preco_inicial_centavos),
      ultimoPreco: num(l.ultimo_preco_centavos),
      menorPreco: num(l.menor_preco_centavos),
      ultimaChecagemEm: iso(l.ultima_checagem_em),
      tendencia: (l.tendencia as string | null) ?? null,
      aviso: (l.aviso as string | null) ?? null,
      avisoTexto: (l.aviso_texto as string | null) ?? null,
      avisoEm,
      avisoNovo: !!avisoEm && (!vistoEm || vistoEm < avisoEm),
      paradoEm: iso(l.parado_em),
      motivoParada: (l.motivo_parada as string | null) ?? null,
    };
  });
}

export function registrarAcompanhamentoDePreco(app: Express): void {
  app.get("/api/busca-de-passagens/acompanhamentos", async (req, res) => {
    if (!await requireRoles(req, res, PAPEIS_DA_BUSCA)) return;
    try {
      await pararOsQueJaTemPassagem();
      const [itens, ajustes] = await Promise.all([listar(), lerAjustes()]);
      res.set("Cache-Control", "no-store");
      res.json({
        itens,
        limite: ajustes.limiteDeAcompanhamentos,
        ativos: itens.filter((i) => i.ativo).length,
        hora: ajustes.horaDoAcompanhamento,
        quedaPct: ajustes.quedaParaAvisoPct,
      });
    } catch (error) {
      console.error("[busca-de-passagens] acompanhamentos:", error instanceof Error ? error.message : error);
      res.status(500).json({ message: "Erro ao ler os preços acompanhados" });
    }
  });

  app.post("/api/busca-de-passagens/acompanhamentos", async (req, res) => {
    const ator = await requireRoles(req, res, PAPEIS_DA_BUSCA);
    if (!ator) return;
    const vagaId = typeof req.body?.teamInclusionId === "string" && req.body.teamInclusionId.length <= 64 ? req.body.teamInclusionId : "";
    if (!vagaId) return res.status(400).json({ message: "Escolha a escalação." });
    const ajuste = lerAjuste(req.body?.ajuste);
    try {
      const [ja] = await db.select().from(buscaPassagensAcompanhamentos)
        .where(and(eq(buscaPassagensAcompanhamentos.teamInclusionId, vagaId), eq(buscaPassagensAcompanhamentos.ativo, true)));
      if (ja) return res.json({ id: ja.id, jaExistia: true });
      const ajustes = await lerAjustes();
      const [{ n }] = linhasDe<{ n: number }>(await db.execute(drizzleSql`SELECT count(*)::int AS n FROM busca_passagens_acompanhamentos WHERE ativo = TRUE`));
      if (Number(n) >= ajustes.limiteDeAcompanhamentos) {
        return res.status(409).json({ code: "limite", message: `Já são ${ajustes.limiteDeAcompanhamentos} escalações acompanhadas — o limite. Pare uma para acompanhar outra (ou peça ao administrador para aumentar o limite).` });
      }
      const [vaga] = await carregarPendentes(hojeISO(), [vagaId], { [vagaId]: ajuste });
      if (!vaga) return res.status(400).json({ message: "Esta escalação não precisa mais de passagem (já tem passagem, foi cancelada ou a data passou)." });
      if (vaga.rotas.length === 0) return res.status(400).json({ message: vaga.falta ? `Falta um dado para acompanhar: ${vaga.falta}` : "A rota desta escalação ainda não está completa." });
      // Primeiro preço: só do cache — marcar para acompanhar NÃO gasta consulta.
      const cache = await lerCache<ResultadoDaConsulta>(vaga.rotas.map((r) => r.chave));
      const precos = vaga.rotas.map((r) => menorPreco(cache.get(r.chave)?.resposta));
      const preco = precos.every((p) => p !== null) ? (precos as number[]).reduce((s, p) => s + p, 0) : null;
      const [novo] = await db.insert(buscaPassagensAcompanhamentos).values({
        teamInclusionId: vagaId, criadoPor: ator.id, ajuste: Object.keys(ajuste).length ? (ajuste as Record<string, unknown>) : null, chaves: vaga.rotas.map((r) => r.chave),
        precoInicialCentavos: preco, precoReferenciaCentavos: preco, ultimoPrecoCentavos: preco, menorPrecoCentavos: preco,
        ultimaChecagemEm: preco !== null ? new Date() : null,
      }).returning();
      await createAuditLog("acompanhar_preco", "busca_passagens_acompanhamento", novo.id, {
        inclusionNumber: vaga.numero, rota: vaga.rotas.map((r) => nomeDaRota(chaveDaRota(r.perna, r.origem, r.destino))).join(" + "), precoInicial: preco,
      }, ator.id, ator.name || "Sistema", undefined, req);
      res.json({ id: novo.id, jaExistia: false });
    } catch (error) {
      console.error("[busca-de-passagens] acompanhar:", error instanceof Error ? error.message : error);
      res.status(500).json({ message: "Erro ao acompanhar o preço" });
    }
  });

  app.delete("/api/busca-de-passagens/acompanhamentos/:id", async (req, res) => {
    const ator = await requireRoles(req, res, PAPEIS_DA_BUSCA);
    if (!ator) return;
    try {
      const [a] = await db.update(buscaPassagensAcompanhamentos)
        .set({ ativo: false, paradoEm: new Date(), motivoParada: `Parado por ${ator.name || "um usuário"}` })
        .where(and(eq(buscaPassagensAcompanhamentos.id, req.params.id), eq(buscaPassagensAcompanhamentos.ativo, true)))
        .returning();
      if (!a) return res.status(404).json({ message: "Acompanhamento não encontrado (talvez já tenha parado)." });
      const [numero] = linhasDe<{ n: number }>(await db.execute(drizzleSql`SELECT inclusion_number AS n FROM team_inclusions WHERE id = ${a.teamInclusionId}`));
      await createAuditLog("parar_acompanhamento", "busca_passagens_acompanhamento", a.id, { inclusionNumber: numero?.n ?? null }, ator.id, ator.name || "Sistema", undefined, req);
      res.json({ ok: true });
    } catch (error) {
      console.error("[busca-de-passagens] parar acompanhamento:", error instanceof Error ? error.message : error);
      res.status(500).json({ message: "Erro ao parar o acompanhamento" });
    }
  });

  app.post("/api/busca-de-passagens/acompanhamentos/vistos", async (req, res) => {
    const ator = await requireRoles(req, res, PAPEIS_DA_BUSCA);
    if (!ator) return;
    const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 200) : null;
    try {
      await db.update(buscaPassagensAcompanhamentos).set({ avisoVistoEm: new Date() })
        .where(and(isNotNull(buscaPassagensAcompanhamentos.avisoEm), ids ? inArray(buscaPassagensAcompanhamentos.id, ids.length ? ids : [""]) : drizzleSql`TRUE`));
      res.json({ ok: true });
    } catch (error) {
      console.error("[busca-de-passagens] avisos vistos:", error instanceof Error ? error.message : error);
      res.status(500).json({ message: "Erro ao marcar os avisos" });
    }
  });

  app.post("/api/busca-de-passagens/acompanhamentos/checar", async (req, res) => {
    const admin = await requireRoles(req, res, PAPEIS_DAS_ANALISES);
    if (!admin) return;
    try {
      res.json(await checarAcompanhamentos(admin));
    } catch (error) {
      console.error("[busca-de-passagens] checar agora:", error instanceof Error ? error.message : error);
      res.status(500).json({ message: "Erro ao checar os preços acompanhados" });
    }
  });

  /** Pendências do sino: quantos preços acompanhados mudaram e ninguém viu ainda (admin e Compras). */
  app.get("/api/shell/precos-acompanhados", async (req, res) => {
    if (!await requireRoles(req, res, PAPEIS_DA_BUSCA)) return;
    try {
      const [l] = await db.select({ n: drizzleSql<number>`count(*)::int` }).from(buscaPassagensAcompanhamentos)
        .where(and(
          isNotNull(buscaPassagensAcompanhamentos.avisoEm),
          or(isNull(buscaPassagensAcompanhamentos.avisoVistoEm), drizzleSql`${buscaPassagensAcompanhamentos.avisoVistoEm} < ${buscaPassagensAcompanhamentos.avisoEm}`),
          or(eq(buscaPassagensAcompanhamentos.ativo, true), gte(buscaPassagensAcompanhamentos.paradoEm, new Date(Date.now() - 86_400_000))),
        ));
      res.set("Cache-Control", "no-store");
      res.json({ count: Number(l?.n ?? 0) });
    } catch {
      res.status(500).json({ message: "Erro ao contar os preços acompanhados" });
    }
  });
}

