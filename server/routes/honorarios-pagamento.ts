/**
 * Módulo de Honorários, Fase 2 em modo MANUAL (28/10) — rotas internas das
 * etapas 4 a 7 (OC, NF pelo representante, conferência, pago) e o expurgo
 * das selfies. Regras puras em shared/honorarios-pagamento.ts; carga e envio
 * da NF em server/honorarios-pagamento-servico.ts.
 *
 *   GET  /api/ordens-de-compra?eventId=                  linhas do evento (aprovadas) + contadores
 *   POST /api/ordens-de-compra                           { actualId, numero, valor?, data?, justificativa? }
 *   POST /api/ordens-de-compra/lote/previa               { eventId, texto }        (NÃO grava)
 *   POST /api/ordens-de-compra/lote                      { eventId, texto, justificativa? }
 *   POST /api/ordens-de-compra/:actualId/desfazer        { motivo }  (só sem NF)
 *   GET  /api/ordens-de-compra/exportar?eventId=&formato=csv|xlsx   aprovadas SEM OC (com CPF; auditado)
 *   POST /api/ordens-de-compra/:actualId/nota-fiscal     multipart (representante: admin, DP, produção)
 *   GET  /api/invoices/conferencia?eventId=              OC × NF × CNPJ e o pago, por nota
 *   POST /api/pagamentos/marcar-pago                     { actualIds[], pagoEm, observacao?, comprovanteId? }
 *   POST /api/pagamentos/:actualId/desfazer              { motivo }
 *   GET  /api/presenca/expurgo                           situação (prévia + liga/desliga)
 *   POST /api/presenca/expurgo[?simular=1]               prévia ou execução na hora
 *   PUT  /api/presenca/expurgo/automatico                { ligado }  (só o admin)
 *
 * Papéis: OC, pago, exportação, conferência e expurgo — admin e DP
 * (`financial`). A NF pelo representante também aceita a produção. O perfil
 * Honorários não vê nada (server/perfil-honorarios.ts nega por padrão).
 * Evento LEGADO → 409 `evento_legado` (o legado segue como hoje). Toda
 * gravação vai para a auditoria — sem CPF e sem dado bancário.
 */
import type { Express, Response } from "express";
import { z } from "zod";
import { and, eq, inArray, isNotNull, isNull, sql as drizzleSql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { budgetActual as budgetActualTable, type BudgetActual, type Event, type User } from "@shared/schema";
import { normalizeRole, type CanonicalRole } from "@shared/roles";
import {
  CHAVE_DO_EXPURGO_AUTOMATICO, COLUNAS_DA_EXPORTACAO, JUSTIFICATIVA_MAX, JUSTIFICATIVA_MIN, LOTE_DE_PAGO_MAX, MOTIVO_DO_DESFAZER_MIN,
  MSG_NAO_EMITE_NF, OBS_DO_PAGAMENTO_MAX, ESTADOS_DO_PAGAMENTO, erroDaDataPassada, erroDoNumeroDaOc, erroDoValorEmCentavos, lerLoteDeOc,
  montarCsv, normalizarNumeroDaOc, ocExigeJustificativa, podeDesfazerOc, podeDesfazerPago, podeMarcarPago, podeRegistrarOc, reaisParaCsv,
  type EstadoDoPagamento, type OrigemDaOc,
} from "@shared/honorarios-pagamento";
import { SITUACAO_DO_CNPJ_LABEL, cpfDoCadastro } from "@shared/presenca";
import { dataDeCorteLegivel, ehEventoLegado } from "@shared/legado-honorarios";
import { mascararCnpj } from "@shared/cnpj";
import { hojeISO } from "@shared/hoje-sp";
import { lerDataDeCorteDoBanco } from "./honorarios-fluxo";
import {
  enviarNotaDaPrestacao, lerCamposDaNota, linhasDaOc, montar, montarDoEvento, paraOLote, receberArquivoDaNota,
  type PrestacaoDoPagamentoMontada,
} from "../honorarios-pagamento-servico";
import { expurgarSelfies, expurgoAutomaticoEstaLigado, temStorageReal } from "../expurgo-selfies";
import {
  createAuditLog, createAuditLogsBatch, montarLogDeAuditoria, requireFinanceUser, requireRoles, responderErroComStatus,
} from "./_compartilhado";

/** Quem envia a NF como representante (o lançamento interno já existente é só do DP). */
const PAPEIS_DA_NF_INTERNA: readonly CanonicalRole[] = ["admin", "financial", "production"];

const nomeDe = (u: User) => u.name || u.email || "Usuário";
const RE_ANEXO = /^ATT-[A-Z0-9-]{4,60}$/;

/** Evento legado → 409 (resposta enviada) ; senão o evento. */
async function eventoDoFluxoNovo(res: Response, eventId: string): Promise<Event | null> {
  const evento = await storage.getEvent(eventId);
  if (!evento) { res.status(404).json({ message: "Evento não encontrado." }); return null; }
  const corte = await lerDataDeCorteDoBanco();
  if (ehEventoLegado(evento.endDate, corte)) {
    res.status(409).json({ message: `Evento do fluxo antigo (termina antes de ${dataDeCorteLegivel(corte)}): OC e pagamento seguem como antes.`, codigo: "evento_legado" });
    return null;
  }
  return evento;
}

/** A prestação montada + o evento do fluxo novo (respostas de erro já enviadas). */
async function prestacaoDoFluxoNovo(res: Response, actualId: string): Promise<{ m: PrestacaoDoPagamentoMontada; evento: Event } | null> {
  const actual = await storage.getBudgetActualById(actualId);
  if (!actual) { res.status(404).json({ message: "Prestação não encontrada." }); return null; }
  const evento = await eventoDoFluxoNovo(res, actual.eventId);
  if (!evento) return null;
  const [m] = await montar([actual]);
  return { m, evento };
}

const contadoresVazios = () => ({
  ...(Object.fromEntries(ESTADOS_DO_PAGAMENTO.map((e) => [e, 0])) as Record<EstadoDoPagamento, number>),
  naoEmiteNf: 0, exigemJustificativa: 0, total: 0,
});

const corpoDaOc = z.object({
  actualId: z.string().min(1).max(100),
  numero: z.string().max(200),
  valor: z.number().nullish(),
  data: z.string().max(20).nullish(),
  justificativa: z.string().trim().max(JUSTIFICATIVA_MAX).nullish(),
});
const corpoDoLote = z.object({
  eventId: z.string().min(1).max(100),
  texto: z.string().max(2_000_000),
  justificativa: z.string().trim().max(JUSTIFICATIVA_MAX).nullish(),
});
const corpoDoMotivo = z.object({ motivo: z.string().trim().min(MOTIVO_DO_DESFAZER_MIN).max(1000) });
const corpoDoPago = z.object({
  actualIds: z.array(z.string().min(1).max(100)).min(1).max(LOTE_DE_PAGO_MAX),
  pagoEm: z.string().max(20),
  observacao: z.string().trim().max(OBS_DO_PAGAMENTO_MAX).nullish(),
  comprovanteId: z.string().regex(RE_ANEXO).nullish(),
});

/** Campos gravados ao registrar a OC. */
const camposDaOc = (u: User, origem: OrigemDaOc, numero: string, valor: number, data: string, justificativa: string | null) => ({
  ocNumero: numero, ocValor: valor, ocData: data, ocRegistradaEm: new Date(), ocRegistradaPor: u.id, ocOrigem: origem,
  ocJustificativa: justificativa, updatedAt: new Date(), updatedBy: u.id,
});

/** O que a auditoria guarda da OC (sem CPF). */
const resumoDaOc = (a: BudgetActual, extra: Record<string, unknown> = {}) => ({
  ocNumero: a.ocNumero, ocValor: a.ocValor, ocData: a.ocData, ocOrigem: a.ocOrigem, ocJustificativa: a.ocJustificativa, ...extra,
});

export function registrarHonorariosPagamento(app: Express): void {
  // ── Lista do evento ───────────────────────────────────────────────────────
  app.get("/api/ordens-de-compra", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    const eventId = typeof req.query.eventId === "string" ? req.query.eventId : "";
    if (!eventId) return res.status(400).json({ message: "Escolha o evento." });
    try {
      const evento = await eventoDoFluxoNovo(res, eventId);
      if (!evento) return;
      const aprovadas = (await montarDoEvento(evento.id)).filter((m) => m.actual.rhStatus === "aprovado");
      const linhas = (await linhasDaOc(aprovadas))
        .sort((a, b) => (a.colaborador?.nome ?? "").localeCompare(b.colaborador?.nome ?? "", "pt-BR"));
      const contadores = contadoresVazios();
      for (const l of linhas) {
        contadores.total += 1;
        if (!l.emiteNf) { contadores.naoEmiteNf += 1; continue; }
        contadores[l.estado] += 1;
        if (l.acoes.registrarOc && l.acoes.exigeJustificativa) contadores.exigemJustificativa += 1;
      }
      res.set("Cache-Control", "no-store");
      res.json({
        evento: {
          id: evento.id, nome: evento.name, cidade: evento.location, inicio: evento.startDate, fim: evento.endDate,
          empresaPagadora: { nome: evento.paymentCompanyName, cnpj: evento.paymentCompanyCnpj ? mascararCnpj(evento.paymentCompanyCnpj) : null },
        },
        hoje: hojeISO(),
        linhas,
        contadores,
        permissoes: { podeDesfazerPago: true, podeRodarExpurgo: true },
      });
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao carregar as ordens de compra", 500);
    }
  });

  // ── Registrar a OC (individual) ───────────────────────────────────────────
  app.post("/api/ordens-de-compra", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    const corpo = corpoDaOc.safeParse(req.body ?? {});
    if (!corpo.success) return res.status(400).json({ message: "Informe a prestação e o número da OC (valor em centavos e data AAAA-MM-DD, se quiser)." });
    const { actualId, justificativa } = corpo.data;
    const erroNumero = erroDoNumeroDaOc(corpo.data.numero);
    if (erroNumero) return res.status(400).json({ message: erroNumero, campo: "numero" });
    try {
      const alvo = await prestacaoDoFluxoNovo(res, actualId);
      if (!alvo) return;
      const { m } = alvo;
      const pode = podeRegistrarOc(m.actual);
      if (!pode.ok) return res.status(pode.codigo === "nao_encontrada" ? 404 : 409).json({ message: pode.motivo, codigo: pode.codigo });
      if (!m.emiteNf) return res.status(409).json({ message: MSG_NAO_EMITE_NF, codigo: "nao_emite_nf" });
      const valor = corpo.data.valor ?? m.actual.totalValue;
      const erroValor = erroDoValorEmCentavos(valor, "O valor da OC");
      if (erroValor) return res.status(400).json({ message: erroValor, campo: "valor" });
      const hoje = hojeISO();
      const data = corpo.data.data ?? hoje;
      const erroData = erroDaDataPassada(data, hoje, "a data da OC");
      if (erroData) return res.status(400).json({ message: erroData, campo: "data" });
      const exige = ocExigeJustificativa(m.cnpj.situacao);
      if (exige && (!justificativa || justificativa.length < JUSTIFICATIVA_MIN)) {
        return res.status(409).json({
          message: `${SITUACAO_DO_CNPJ_LABEL[m.cnpj.situacao]}: escreva a justificativa para registrar a OC assim mesmo.`,
          codigo: "justificativa_obrigatoria", situacaoDoCnpj: m.cnpj.situacao,
        });
      }
      const numero = normalizarNumeroDaOc(corpo.data.numero);
      const [depois] = await db.update(budgetActualTable)
        .set(camposDaOc(user, "manual", numero, valor, data, exige ? justificativa! : null))
        .where(and(eq(budgetActualTable.id, actualId), isNull(budgetActualTable.ocNumero), eq(budgetActualTable.rhStatus, "aprovado")))
        .returning();
      if (!depois) return res.status(409).json({ message: "A prestação mudou enquanto a OC era registrada — recarregue.", codigo: "mudou" });
      await createAuditLog("update", "budget_actual", depois.id, resumoDaOc(depois, {
        acao: "OC registrada", situacaoDoCnpj: m.cnpj.situacao, valorAprovado: m.actual.totalValue,
      }), user.id, nomeDe(user), { ocNumero: null }, req);
      const [linha] = await linhasDaOc(await montar([depois]));
      res.status(201).json({ linha });
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao registrar a OC", 500);
    }
  });

  // ── Lote: prévia (não grava) e confirmação ────────────────────────────────
  app.post("/api/ordens-de-compra/lote/previa", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    const corpo = corpoDoLote.safeParse(req.body ?? {});
    if (!corpo.success) return res.status(400).json({ message: "Envie o evento e o texto do lote (colado ou lido do CSV)." });
    try {
      const evento = await eventoDoFluxoNovo(res, corpo.data.eventId);
      if (!evento) return;
      const prestacoes = (await montarDoEvento(evento.id)).map(paraOLote);
      res.set("Cache-Control", "no-store");
      res.json(lerLoteDeOc(corpo.data.texto, prestacoes, hojeISO()));
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao ler o lote", 500);
    }
  });

  app.post("/api/ordens-de-compra/lote", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    const corpo = corpoDoLote.safeParse(req.body ?? {});
    if (!corpo.success) return res.status(400).json({ message: "Envie o evento e o texto do lote (colado ou lido do CSV)." });
    const justificativa = corpo.data.justificativa && corpo.data.justificativa.length >= JUSTIFICATIVA_MIN ? corpo.data.justificativa : null;
    try {
      const evento = await eventoDoFluxoNovo(res, corpo.data.eventId);
      if (!evento) return;
      // A prévia NUNCA é confiada: o texto é relido aqui, contra o banco de agora.
      const leitura = lerLoteDeOc(corpo.data.texto, (await montarDoEvento(evento.id)).map(paraOLote), hojeISO());
      const recusadas: { linha: number; referencia: string; motivos: string[] }[] = leitura.linhas
        .filter((l) => l.situacao === "erro").map((l) => ({ linha: l.linha, referencia: l.referencia, motivos: l.erros }));
      const aplicar = leitura.linhas.filter((l) => l.situacao === "ok");
      const semJustificativa = aplicar.filter((l) => l.exigeJustificativa && !justificativa);
      for (const l of semJustificativa) {
        recusadas.push({ linha: l.linha, referencia: l.referencia, motivos: ["CNPJ emissor sem contrato ativo — escreva a justificativa do lote."] });
      }
      const gravar = aplicar.filter((l) => !(l.exigeJustificativa && !justificativa));
      const antes = new Map((await montarDoEvento(evento.id, gravar.map((l) => l.actualId!))).map((m) => [m.actual.id, m.actual]));
      const gravadas = await db.transaction(async (tx) => {
        const feitas: BudgetActual[] = [];
        for (const l of gravar) {
          const [depois] = await tx.update(budgetActualTable)
            .set(camposDaOc(user, "lote", l.numero!, l.valor!, l.data!, l.exigeJustificativa ? justificativa : null))
            .where(and(eq(budgetActualTable.id, l.actualId!), isNull(budgetActualTable.ocNumero), eq(budgetActualTable.rhStatus, "aprovado")))
            .returning();
          if (depois) feitas.push(depois);
          else recusadas.push({ linha: l.linha, referencia: l.referencia, motivos: ["A prestação mudou enquanto o lote era gravado."] });
        }
        return feitas;
      });
      await createAuditLogsBatch(gravadas.map((d) => montarLogDeAuditoria("update", "budget_actual", d.id,
        resumoDaOc(d, { acao: "OC registrada (lote)", valorAprovado: antes.get(d.id)?.totalValue ?? null }),
        user.id, nomeDe(user), { ocNumero: null }, req)));
      recusadas.sort((a, b) => a.linha - b.linha);
      res.json({
        registradas: gravadas.length,
        ignoradas: leitura.resumo.ignorada,
        recusadas,
        linhas: await linhasDaOc(await montar(gravadas)),
      });
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao gravar o lote de OC", 500);
    }
  });

  // ── Desfazer a OC (só sem NF) ─────────────────────────────────────────────
  app.post("/api/ordens-de-compra/:actualId/desfazer", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    const corpo = corpoDoMotivo.safeParse(req.body ?? {});
    if (!corpo.success) return res.status(400).json({ message: `Escreva o motivo (pelo menos ${MOTIVO_DO_DESFAZER_MIN} caracteres).` });
    try {
      const alvo = await prestacaoDoFluxoNovo(res, String(req.params.actualId));
      if (!alvo) return;
      const { m } = alvo;
      const pode = podeDesfazerOc(m.actual, m.nota);
      if (!pode.ok) return res.status(409).json({ message: pode.motivo, codigo: pode.codigo });
      // Guarda no banco: a NF pode ter chegado agora (o portal envia sozinho).
      const [depois] = await db.update(budgetActualTable).set({
        ocNumero: null, ocValor: null, ocData: null, ocRegistradaEm: null, ocRegistradaPor: null, ocOrigem: null, ocJustificativa: null,
        updatedAt: new Date(), updatedBy: user.id,
      }).where(and(
        eq(budgetActualTable.id, m.actual.id), eq(budgetActualTable.ocNumero, m.actual.ocNumero!),
        drizzleSql`NOT EXISTS (SELECT 1 FROM invoices nf WHERE nf.budget_actual_id = "budget_actual"."id")`,
      )).returning();
      if (!depois) return res.status(409).json({ message: "Chegou uma nota fiscal para esta OC (ou ela mudou) — não dá mais para desfazer.", codigo: "com_nf" });
      await createAuditLog("update", "budget_actual", depois.id, { acao: "OC desfeita", motivo: corpo.data.motivo, ocNumero: null },
        user.id, nomeDe(user), resumoDaOc(m.actual), req);
      const [linha] = await linhasDaOc(await montar([depois]));
      res.json({ linha });
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao desfazer a OC", 500);
    }
  });

  // ── Exportar as aprovadas SEM OC ("Plano B" do slide 12) ──────────────────
  app.get("/api/ordens-de-compra/exportar", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    const eventId = typeof req.query.eventId === "string" ? req.query.eventId : "";
    const formato = req.query.formato === "xlsx" ? "xlsx" : "csv";
    if (!eventId) return res.status(400).json({ message: "Escolha o evento." });
    try {
      const evento = await eventoDoFluxoNovo(res, eventId);
      if (!evento) return;
      const semOc = (await montarDoEvento(evento.id))
        .filter((m) => m.actual.rhStatus === "aprovado" && !m.actual.ocNumero && m.emiteNf)
        .sort((a, b) => (a.colaborador?.fullName ?? "").localeCompare(b.colaborador?.fullName ?? "", "pt-BR"));
      // CPF completo: o arquivo é do DP (a rota é só do DP) e o download fica na auditoria — sem o CPF.
      const linhas = semOc.map((m) => [
        m.actual.id, m.colaborador?.fullName ?? "", (m.colaborador ? cpfDoCadastro(m.colaborador) : null) ?? "",
        m.cnpj.digitos ? mascararCnpj(m.cnpj.digitos) : "", m.cnpj.razaoSocial ?? "", SITUACAO_DO_CNPJ_LABEL[m.cnpj.situacao],
        evento.name, m.funcao.nome ?? "", m.actual.totalValue, m.funcao.centroDeCusto ?? "", "", "", "",
      ] as const);
      const base = `prestacoes-sem-oc-${evento.eventNumber}-${hojeISO()}`;
      await createAuditLog("export", "budget_actual", evento.id, {
        acao: "exportou as prestações aprovadas sem OC (com CPF)", evento: evento.name, linhas: linhas.length, formato,
      }, user.id, nomeDe(user), undefined, req);
      res.set("Cache-Control", "no-store");
      if (formato === "xlsx") {
        const XLSX = await import("xlsx");
        const planilha = XLSX.utils.aoa_to_sheet([
          [...COLUNAS_DA_EXPORTACAO],
          ...linhas.map((l) => l.map((c, i) => (i === 8 ? Number(c) / 100 : c))),
        ]);
        const livro = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(livro, planilha, "Sem OC");
        const buffer: Buffer = XLSX.write(livro, { type: "buffer", bookType: "xlsx" });
        res.set({
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${base}.xlsx"`,
        });
        return res.send(buffer);
      }
      res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"` });
      res.send(montarCsv([[...COLUNAS_DA_EXPORTACAO], ...linhas.map((l) => l.map((c, i) => (i === 8 ? reaisParaCsv(Number(c)) : c)))]));
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao exportar", 500);
    }
  });

  // ── NF pelo representante (produção/DP), com a OC travada ─────────────────
  app.post("/api/ordens-de-compra/:actualId/nota-fiscal", async (req, res) => {
    const user = await requireRoles(req, res, PAPEIS_DA_NF_INTERNA);
    if (!user) return;
    if (!(await receberArquivoDaNota(req, res))) return;
    const campos = lerCamposDaNota(req.body);
    if ("erro" in campos) return res.status(400).json({ message: campos.erro, campo: campos.campo });
    try {
      const alvo = await prestacaoDoFluxoNovo(res, String(req.params.actualId));
      if (!alvo) return;
      const { m } = alvo;
      if (m.actual.splitParentId || m.actual.didNotAttend) return res.status(404).json({ message: "Prestação não encontrada." });
      const gravada = await enviarNotaDaPrestacao({ req, res, actual: m.actual, nota: m.nota, campos: campos.campos, ator: user, nomeDoAtor: nomeDe(user) });
      if (!gravada) return;
      const [linha] = await linhasDaOc(await montar([m.actual]));
      res.status(m.nota ? 200 : 201).json({ linha });
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao enviar a nota fiscal", 500);
    }
  });

  // ── Conferência OC × NF × CNPJ (tela Notas fiscais) ───────────────────────
  app.get("/api/invoices/conferencia", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    const eventId = typeof req.query.eventId === "string" && req.query.eventId && req.query.eventId !== "all" ? req.query.eventId : undefined;
    try {
      const notas = (await storage.getInvoices(eventId)).filter((n) => !!n.budgetActualId);
      const actuals = notas.length
        ? await db.select().from(budgetActualTable).where(inArray(budgetActualTable.id, notas.map((n) => n.budgetActualId!)))
        : [];
      const corte = await lerDataDeCorteDoBanco();
      const eventos = new Map((await storage.getEventsByIds(Array.from(new Set(actuals.map((a) => a.eventId))))).map((e) => [e.id, e]));
      const linhas = await linhasDaOc(await montar(actuals));
      const porActual = new Map(linhas.map((l) => [l.actualId, l]));
      res.set("Cache-Control", "no-store");
      res.json(notas.map((n) => {
        const l = porActual.get(n.budgetActualId!);
        const evento = l ? eventos.get(l.eventId) : undefined;
        const legado = !evento || ehEventoLegado(evento.endDate, corte);
        return {
          invoiceId: n.id,
          actualId: n.budgetActualId,
          legado,
          ocRegistrada: l?.oc ?? null,
          cnpjEmissor: l?.cnpjEmissor ?? null,
          valorAprovado: l?.valorAprovado ?? null,
          conferencia: l?.conferencia ?? null,
          estado: l?.estado ?? null,
          rotuloDoEstado: l?.rotuloDoEstado ?? null,
          programadoPara: l?.programadoPara ?? null,
          pagamento: l?.pagamento ?? null,
          podeMarcarPago: !legado && !!l?.acoes.marcarPago,
          podeDesfazerPago: !legado && !!l?.acoes.desfazerPago,
        };
      }));
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao carregar a conferência das notas", 500);
    }
  });

  // ── Marcar como pago (individual e lote) ──────────────────────────────────
  app.post("/api/pagamentos/marcar-pago", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    const corpo = corpoDoPago.safeParse(req.body ?? {});
    if (!corpo.success) return res.status(400).json({ message: "Escolha as prestações e a data do pagamento (AAAA-MM-DD); o comprovante, se houver, é um anexo enviado pelo sistema." });
    const hoje = hojeISO();
    const erroData = erroDaDataPassada(corpo.data.pagoEm, hoje, "a data do pagamento");
    if (erroData) return res.status(400).json({ message: erroData, campo: "pagoEm" });
    const ids = Array.from(new Set(corpo.data.actualIds));
    try {
      const actuals = await db.select().from(budgetActualTable).where(inArray(budgetActualTable.id, ids));
      const porId = new Map(actuals.map((a) => [a.id, a]));
      const corte = await lerDataDeCorteDoBanco();
      const eventos = new Map((await storage.getEventsByIds(Array.from(new Set(actuals.map((a) => a.eventId))))).map((e) => [e.id, e]));
      const notas = new Map((await montar(actuals)).map((m) => [m.actual.id, m.nota]));
      const recusadas: { actualId: string; motivo: string; codigo: string }[] = [];
      const aptas: string[] = [];
      for (const id of ids) {
        const a = porId.get(id);
        const ev = a ? eventos.get(a.eventId) : undefined;
        if (!a || !ev) { recusadas.push({ actualId: id, motivo: "Prestação não encontrada.", codigo: "nao_encontrada" }); continue; }
        if (ehEventoLegado(ev.endDate, corte)) { recusadas.push({ actualId: id, motivo: "Evento do fluxo antigo — o pagamento segue como antes.", codigo: "evento_legado" }); continue; }
        const pode = podeMarcarPago(a, notas.get(id));
        if (!pode.ok) { recusadas.push({ actualId: id, motivo: pode.motivo, codigo: pode.codigo }); continue; }
        aptas.push(id);
      }
      if (ids.length === 1 && recusadas.length === 1) {
        const r = recusadas[0];
        return res.status(r.codigo === "nao_encontrada" ? 404 : 409).json({ message: r.motivo, codigo: r.codigo });
      }
      const agora = new Date();
      const pagas = aptas.length === 0 ? [] : await db.update(budgetActualTable).set({
        pagoEm: corpo.data.pagoEm, pagoRegistradoPor: user.id, pagoRegistradoEm: agora,
        pagamentoObs: corpo.data.observacao || null, pagamentoComprovanteId: corpo.data.comprovanteId ?? null,
        updatedAt: agora, updatedBy: user.id,
      }).where(and(
        inArray(budgetActualTable.id, aptas), isNull(budgetActualTable.pagoEm),
        // Guarda no banco: a NF continua aprovada e lançada no M4 (programado).
        drizzleSql`EXISTS (SELECT 1 FROM invoices nf WHERE nf.budget_actual_id = "budget_actual"."id" AND nf.status = 'aprovada' AND nf.checkin_at IS NOT NULL)`,
      )).returning();
      const feitas = new Set(pagas.map((p) => p.id));
      for (const id of aptas) if (!feitas.has(id)) recusadas.push({ actualId: id, motivo: "A prestação mudou enquanto o pagamento era registrado — recarregue.", codigo: "mudou" });
      await createAuditLogsBatch(pagas.map((p) => montarLogDeAuditoria("update", "budget_actual", p.id, {
        acao: aptas.length > 1 ? "marcada como paga (lote)" : "marcada como paga",
        pagoEm: p.pagoEm, observacao: p.pagamentoObs, comprovante: !!p.pagamentoComprovanteId, ocNumero: p.ocNumero,
      }, user.id, nomeDe(user), { pagoEm: null }, req)));
      if (ids.length === 1 && pagas.length === 0) return res.status(409).json({ message: recusadas[0]?.motivo ?? "Não foi possível marcar como pago.", codigo: recusadas[0]?.codigo ?? "mudou" });
      res.json({ pagas: pagas.length, recusadas, linhas: await linhasDaOc(await montar(pagas)) });
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao marcar como pago", 500);
    }
  });

  app.post("/api/pagamentos/:actualId/desfazer", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    const corpo = corpoDoMotivo.safeParse(req.body ?? {});
    if (!corpo.success) return res.status(400).json({ message: `Escreva o motivo (pelo menos ${MOTIVO_DO_DESFAZER_MIN} caracteres).` });
    try {
      const alvo = await prestacaoDoFluxoNovo(res, String(req.params.actualId));
      if (!alvo) return;
      const { m } = alvo;
      const pode = podeDesfazerPago(m.actual);
      if (!pode.ok) return res.status(409).json({ message: pode.motivo, codigo: pode.codigo });
      const [depois] = await db.update(budgetActualTable).set({
        pagoEm: null, pagoRegistradoPor: null, pagoRegistradoEm: null, pagamentoObs: null, pagamentoComprovanteId: null,
        updatedAt: new Date(), updatedBy: user.id,
      }).where(and(eq(budgetActualTable.id, m.actual.id), isNotNull(budgetActualTable.pagoEm))).returning();
      if (!depois) return res.status(409).json({ message: "A prestação mudou — recarregue.", codigo: "mudou" });
      await createAuditLog("update", "budget_actual", depois.id, { acao: "pagamento desfeito", motivo: corpo.data.motivo, pagoEm: null },
        user.id, nomeDe(user), { pagoEm: m.actual.pagoEm, observacao: m.actual.pagamentoObs }, req);
      const [linha] = await linhasDaOc(await montar([depois]));
      res.json({ linha });
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao desfazer o pagamento", 500);
    }
  });

  // ── Expurgo das selfies (LGPD) ────────────────────────────────────────────
  const situacaoDoExpurgo = async (user: User) => ({
    automatico: await expurgoAutomaticoEstaLigado(),
    rotinaDiariaAtiva: temStorageReal(),
    podeMudarAutomatico: normalizeRole(user.role) === "admin",
    previa: await expurgarSelfies({ simular: true, ator: user, origem: "manual" }),
  });

  app.get("/api/presenca/expurgo", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    try {
      res.set("Cache-Control", "no-store");
      res.json(await situacaoDoExpurgo(user));
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao ler o expurgo das selfies", 500);
    }
  });

  app.post("/api/presenca/expurgo", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    const simular = req.query.simular === "1" || req.query.simular === "true";
    if (!simular && process.env.PAINEL_DEMO === "1") {
      return res.status(409).json({ message: "Na demonstração o expurgo só mostra a prévia (o storage é de mentira).", codigo: "demo" });
    }
    try {
      const resumo = await expurgarSelfies({ simular, ator: user, req, origem: "manual" });
      res.json(resumo);
    } catch (error) {
      responderErroComStatus(res, error, "Erro no expurgo das selfies", 500);
    }
  });

  app.put("/api/presenca/expurgo/automatico", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    if (normalizeRole(user.role) !== "admin") return res.status(403).json({ message: "Só o administrador liga ou desliga o expurgo diário." });
    const corpo = z.object({ ligado: z.boolean() }).safeParse(req.body ?? {});
    if (!corpo.success) return res.status(400).json({ message: "Informe { ligado: true | false }." });
    try {
      const antes = await expurgoAutomaticoEstaLigado();
      await storage.upsertSystemSetting(CHAVE_DO_EXPURGO_AUTOMATICO, String(corpo.data.ligado), user.id);
      await createAuditLog("update", "system_settings", CHAVE_DO_EXPURGO_AUTOMATICO, { [CHAVE_DO_EXPURGO_AUTOMATICO]: corpo.data.ligado },
        user.id, nomeDe(user), { [CHAVE_DO_EXPURGO_AUTOMATICO]: antes }, req);
      res.json(await situacaoDoExpurgo(user));
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao salvar o expurgo automático", 500);
    }
  });
}

