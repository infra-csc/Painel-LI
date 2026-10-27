/**
 * Presença no evento — rotas INTERNAS (27/10, Fase 1 do Módulo de
 * Honorários): produção, DP e Área de Função. Ata de 22/10: "o produtor
 * responsável faz o check-out final, marca as divergências (horas
 * adicionais, ausências), ajusta o valor final, informa o CNPJ do titular e
 * submete ao DP". Decisão do dono (26/10): o produtor ajusta até 10%; o DP
 * (financial) e o administrador, sem limite.
 *
 *   POST   /api/colaboradores/:id/codigo-de-acesso      (DP, admin, produção)
 *   GET    /api/presenca/configuracao                  (DP, admin) · PUT só admin
 *   GET    /api/presenca/eventos/:eventId              (admin, DP, produção, Área de Função*)
 *   POST   /api/presenca/:actualId/:dia/entrada|saida  representante (multipart, como o colaborador)
 *   PATCH  /api/presenca/:actualId/:dia                correção { entrada?, saida?, motivo } (produção, DP, admin)
 *   POST   /api/presenca/:actualId/ocorrencias         { tipo, dia?, horas?, substitutoCollaboratorId?, observacao? }
 *   DELETE /api/presenca/ocorrencias/:id               (remoção lógica)
 *   POST   /api/presenca/:actualId/confirmar           confirmação pelo representante
 *   POST   /api/presenca/:actualId/checkout-final      { valorFinal, cnpj?, razaoSocial?, justificativa? } (produção, DP, admin)
 *
 * * Área de Função: só as prestações das funções em que é responsável
 *   (function_managers ou functions.userId — a mesma régua de quem edita a
 *   vaga; o Realizado em si continua só do DP/admin).
 * O perfil Honorários não passa (server/perfil-honorarios.ts nega por padrão).
 * Evento LEGADO (termina antes da data de corte) → 409: a presença é do fluxo novo.
 */
import type { Express, Request, Response } from "express";
import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import {
  budgetActual as budgetActualTable, collaborators as collaboratorsTable, presencas, presencaOcorrencias,
  type BudgetActual, type Presenca, type User,
} from "@shared/schema";
import { normalizeRole, type CanonicalRole } from "@shared/roles";
import {
  CONFIGURACAO_PADRAO, ESTADO_DO_DIA_LABEL, OCORRENCIA_LABEL, RE_HORA, SITUACAO_DO_CNPJ_LABEL, TIPOS_DE_OCORRENCIA, VALIDADE_DO_CODIGO_HORAS,
  ajusteEmPct, camposDoRealizadoNoCheckoutFinal, cpfDoCadastro, cpfMascarado, dentroDoLimite, diaEmBrasilia, diaSeguinte, diaValido,
  erroDoCnpjInformado, faixaDoAjuste, horaEmBrasilia, instanteEmBrasilia, reaisDaPresenca, situacaoDoCnpjInformado, validarConfiguracaoDaPresenca,
  type ConfiguracaoDaPresenca, type TipoDeOcorrencia,
} from "@shared/presenca";
import { podeEnviarParaRevisao, prestacaoEstaTravada } from "@shared/prestacao-rules";
import { dataDeCorteLegivel, ehEventoLegado } from "@shared/legado-honorarios";
import { digitosDoCnpj, mascararCnpj } from "@shared/cnpj";
import { situacaoContratualDoColaborador } from "@shared/contratos";
import { HttpError } from "../http";
import { acessosDosColaboradores, obterOcorrencia, salvarAcesso } from "../storage/presenca";
import { contratosDosColaboradores } from "../storage/contratos";
import {
  estadosDosDias, funcoesDoResponsavel, lerConfiguracaoDoBanco, lerDataDeCorteDoBanco, montarPrestacao, montarPrestacoes,
  permissaoDeConfirmar, prestacaoDoFluxoNovo, receberSelfie, registrarMarcacao, salvarConfirmacao, type PrestacaoMontada,
} from "../presenca-servico";
import { marcarEnviadosParaRevisao } from "./orcamento-realizado";
import { PAPEIS_QUE_VEEM_SELFIES } from "../objectAcl";
import { notasDasPrestacoes } from "../honorarios-pagamento-servico";
import { ROTULO_DO_ESTADO_DO_PAGAMENTO, estadoDoPagamento, podeEnviarNotaDaOc } from "@shared/honorarios-pagamento";
import {
  createAuditLog, createAuditLogsBatch, montarLogDeAuditoria, requireFinanceUser, requireRoles, responderErroComStatus,
} from "./_compartilhado";

/** Quem vê a presença do evento e age como representante (check-in/out, ocorrências, confirmação). */
const PAPEIS_DA_PRESENCA: readonly CanonicalRole[] = ["admin", "financial", "production", "function_area"];
/** Quem corrige horário e faz o check-out final ("produção/DP"). */
const PAPEIS_DO_PRODUTOR: readonly CanonicalRole[] = ["admin", "financial", "production"];
/** Quem gera o código de primeiro acesso do colaborador. */
const PAPEIS_DO_CODIGO: readonly CanonicalRole[] = ["admin", "financial", "production"];

const ehDp = (u: User) => { const p = normalizeRole(u.role); return p === "admin" || p === "financial"; };
const nomeDe = (u: User) => u.name || u.email || "Usuário";
const diaCurto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Carrega a prestação e confere: existe, é do fluxo novo (legado → 409) e, para
 * a Área de Função, é de uma função em que ela é responsável (senão 403).
 */
async function prestacaoComAcesso(req: Request, res: Response, papeis: readonly CanonicalRole[], actualId: string): Promise<{ user: User; m: PrestacaoMontada; config: ConfiguracaoDaPresenca } | null> {
  const user = await requireRoles(req, res, papeis);
  if (!user) return null;
  const config = await lerConfiguracaoDoBanco();
  const m = await montarPrestacao(actualId, config);
  if (!m || m.actual.splitParentId) { res.status(404).json({ message: "Prestação não encontrada." }); return null; }
  const dataDeCorte = await lerDataDeCorteDoBanco();
  if (ehEventoLegado(m.evento.endDate, dataDeCorte)) {
    res.status(409).json({ message: `Evento do fluxo antigo (termina antes de ${dataDeCorteLegivel(dataDeCorte)}): a presença não se aplica.`, codigo: "evento_legado" });
    return null;
  }
  if (!prestacaoDoFluxoNovo(m.actual, m.evento, dataDeCorte)) { res.status(409).json({ message: "Esta prestação está marcada como \"não participou\"." }); return null; }
  if (normalizeRole(user.role) === "function_area") {
    const minhas = await funcoesDoResponsavel(user.id);
    if (!m.actual.functionId || !minhas.has(m.actual.functionId)) { res.status(403).json({ message: "Esta prestação é de uma função que não está com você." }); return null; }
  }
  return { user, m, config };
}

const corpoDaOcorrencia = z.object({
  tipo: z.enum(TIPOS_DE_OCORRENCIA),
  dia: z.string().refine(diaValido, "Dia inválido").nullish(),
  horas: z.number().positive().max(24).nullish(),
  substitutoCollaboratorId: z.string().min(1).max(100).nullish(),
  observacao: z.string().trim().max(1000).nullish(),
});

const corpoDaCorrecao = z.object({
  entrada: z.string().regex(RE_HORA, "Hora inválida (HH:MM)").nullish(),
  saida: z.string().regex(RE_HORA, "Hora inválida (HH:MM)").nullish(),
  motivo: z.string().trim().min(5, "Escreva o motivo (pelo menos 5 caracteres).").max(500),
});

const corpoDoCheckoutFinal = z.object({
  valorFinal: z.number().int().min(0).max(1_000_000_000),
  cnpj: z.string().max(30).nullish(),
  razaoSocial: z.string().trim().max(200).nullish(),
  justificativa: z.string().trim().max(2000).nullish(),
});

const corpoDaConfirmacao = z.object({
  dias: z.array(z.string().refine(diaValido)).max(400),
  cnpj: z.string().min(1).max(30),
  razaoSocial: z.string().trim().max(200).nullish(),
  contestacao: z.string().trim().max(2000).nullish(),
});

/** A prestação vista pela produção/DP (o que a tela "Presença no evento" e a Conferência DP usam). */
async function prestacoesParaTela(montadas: PrestacaoMontada[], user: User, config: ConfiguracaoDaPresenca, hoje: string) {
  const colabIds = Array.from(new Set(montadas.map((m) => m.actual.collaboratorId).filter((v): v is string => !!v)));
  const substitutos = Array.from(new Set(montadas.flatMap((m) => m.ocorrencias.map((o) => o.substitutoCollaboratorId)).filter((v): v is string => !!v)));
  const userIds = Array.from(new Set(montadas.flatMap((m) => [
    m.actual.checkoutFinalPor, m.confirmacao?.userId,
    ...Array.from(m.presencaPorDia.values()).flatMap((p) => [p.checkinUserId, p.checkoutUserId]),
  ]).filter((v): v is string => !!v)));
  const [contratos, acessos, nomesSubst, usuarios, notas] = await Promise.all([
    contratosDosColaboradores(colabIds),
    acessosDosColaboradores(colabIds),
    substitutos.length ? db.select({ id: collaboratorsTable.id, nome: collaboratorsTable.fullName }).from(collaboratorsTable).where(inArray(collaboratorsTable.id, substitutos)) : Promise.resolve([]),
    userIds.length ? storage.getUsersByIds(userIds) : Promise.resolve([] as User[]),
    notasDasPrestacoes(montadas.map((m) => m.actual.id)),
  ]);
  // NF pelo representante (28/10): admin, DP e produção — POST /api/ordens-de-compra/:actualId/nota-fiscal.
  const enviaNf = (PAPEIS_DO_PRODUTOR as readonly string[]).includes(normalizeRole(user.role) ?? "");
  const nomeDoSubst = new Map(nomesSubst.map((s) => [s.id, s.nome]));
  const nomeDoUsuario = new Map(usuarios.map((u) => [u.id, u.name || u.email]));
  const podeVerFotos = (PAPEIS_QUE_VEEM_SELFIES as readonly string[]).includes(normalizeRole(user.role) ?? "");
  const limitado = !ehDp(user);
  const agora = Date.now();

  const marcacao = (p: Presenca, lado: "checkin" | "checkout") => {
    const em = lado === "checkin" ? p.checkinEm : p.checkoutEm;
    if (!em) return null;
    const fotoId = lado === "checkin" ? p.checkinFotoId : p.checkoutFotoId;
    const userId = lado === "checkin" ? p.checkinUserId : p.checkoutUserId;
    return {
      em: new Date(em).toISOString(), hora: horaEmBrasilia(em),
      por: lado === "checkin" ? p.checkinPor : p.checkoutPor,
      porUsuario: userId ? { id: userId, nome: nomeDoUsuario.get(userId) ?? null } : null,
      comSelfie: !!fotoId,
      // 28/10: a selfie saiu do storage depois da guarda (LGPD); o horário fica.
      fotoExpurgada: !!p.fotoExpurgadaEm,
      fotoId: podeVerFotos ? fotoId : null,
      fotoUrl: podeVerFotos && fotoId ? `/api/attachments/${fotoId}/view` : null,
      lat: lado === "checkin" ? (p.checkinLat != null ? Number(p.checkinLat) : null) : (p.checkoutLat != null ? Number(p.checkoutLat) : null),
      lng: lado === "checkin" ? (p.checkinLng != null ? Number(p.checkinLng) : null) : (p.checkoutLng != null ? Number(p.checkoutLng) : null),
      precisaoM: lado === "checkin" ? p.checkinPrecisaoM : p.checkoutPrecisaoM,
    };
  };

  return montadas.map((m) => {
    const colabId = m.actual.collaboratorId;
    const contratosDele = colabId ? contratos.get(colabId) ?? [] : [];
    const acesso = colabId ? acessos.get(colabId) : undefined;
    const cnpjCheckout = m.actual.cnpjEmissor;
    const cnpjInformado = cnpjCheckout || m.confirmacao?.cnpj || null;
    const sitCnpj = situacaoDoCnpjInformado(cnpjInformado, contratosDele, hoje);
    const presencasDoDia = estadosDosDias(m, hoje).map(({ dia, estado }) => {
      const p = m.presencaPorDia.get(dia);
      return {
        dia, estado, rotulo: ESTADO_DO_DIA_LABEL[estado],
        entrada: p ? marcacao(p, "checkin") : null,
        saida: p ? marcacao(p, "checkout") : null,
        observacao: p?.observacao ?? null,
      };
    });
    const confirmar = permissaoDeConfirmar(m, hoje);
    return {
      actualId: m.actual.id,
      colaborador: m.colaborador ? { id: m.colaborador.id, nome: m.colaborador.fullName, numero: m.colaborador.collaboratorNumber, tipo: m.actual.collaboratorType } : null,
      funcao: { id: m.actual.functionId, nome: m.funcaoNome },
      fonteDosDias: m.fonteDosDias,
      dias: presencasDoDia,
      diasExtras: m.calculo.diasExtras,
      ocorrencias: m.ocorrencias.map((o) => ({
        id: o.id, tipo: o.tipo, rotulo: OCORRENCIA_LABEL[o.tipo as TipoDeOcorrencia] ?? o.tipo,
        dia: o.dia ? String(o.dia).slice(0, 10) : null, horas: o.horas != null ? Number(o.horas) : null,
        substituto: o.substitutoCollaboratorId ? { id: o.substitutoCollaboratorId, nome: nomeDoSubst.get(o.substitutoCollaboratorId) ?? null } : null,
        observacao: o.observacao, criadoPorNome: o.criadoPorNome, criadoEm: new Date(o.criadoEm).toISOString(),
      })),
      confirmacao: m.confirmacao ? {
        por: m.confirmacao.confirmadoPor,
        porUsuario: m.confirmacao.userId ? { id: m.confirmacao.userId, nome: nomeDoUsuario.get(m.confirmacao.userId) ?? null } : null,
        dias: m.confirmacao.diasConfirmados, valorVisto: m.confirmacao.valorVisto,
        cnpj: m.confirmacao.cnpj ? mascararCnpj(m.confirmacao.cnpj) : null, razaoSocial: m.confirmacao.razaoSocial,
        contratoId: m.confirmacao.contratoId, contestacao: m.confirmacao.contestacao,
        confirmadoEm: new Date(m.confirmacao.confirmadoEm).toISOString(),
      } : null,
      podeConfirmar: confirmar.ok,
      calculo: {
        valorBase: m.calculo.valorBase, valorCalculado: m.calculo.valorCalculado, linhas: m.calculo.linhas,
        diasPagos: m.calculo.diasPagos, diasComFalta: m.calculo.diasComFalta, diasExtras: m.calculo.diasExtras,
        horasExtras: m.calculo.horasExtras, valorDaHora: m.calculo.valorDaHora, valorHorasExtras: m.calculo.valorHorasExtras,
      },
      limiteDoAjuste: limitado ? { pct: config.produtorAjusteMaxPct, ...faixaDoAjuste(m.calculo.valorCalculado, config.produtorAjusteMaxPct) } : null,
      diasPendentes: m.pendentes,
      checkoutFinal: {
        feito: m.checkoutFinalFeito,
        em: m.actual.checkoutFinalEm ? new Date(m.actual.checkoutFinalEm).toISOString() : null,
        por: m.actual.checkoutFinalPor ? { id: m.actual.checkoutFinalPor, nome: nomeDoUsuario.get(m.actual.checkoutFinalPor) ?? null } : null,
        valorCalculado: m.actual.valorCalculado, valorFinal: m.checkoutFinalFeito ? m.actual.totalValue : null,
        ajustePct: m.actual.ajusteProdutorPct != null ? Number(m.actual.ajusteProdutorPct) : null,
        horasExtras: Number(m.actual.horasExtras ?? 0), valorHorasExtras: m.actual.valorHorasExtras,
        podeFazer: podeEnviarParaRevisao(m.actual),
      },
      cnpj: {
        informado: cnpjInformado ? mascararCnpj(cnpjInformado) : null,
        razaoSocial: cnpjCheckout ? m.actual.razaoSocialEmissor : m.confirmacao?.razaoSocial ?? null,
        origem: cnpjCheckout ? "checkout_final" : m.confirmacao?.cnpj ? "confirmacao" : null,
        situacao: sitCnpj.situacao, rotulo: SITUACAO_DO_CNPJ_LABEL[sitCnpj.situacao], contratoId: sitCnpj.contratoId,
      },
      situacaoContratual: situacaoContratualDoColaborador(contratosDele, hoje),
      acesso: {
        temSenha: !!acesso?.senhaHash,
        codigoValidoAte: acesso?.codigoHash && acesso.codigoExpiraEm && new Date(acesso.codigoExpiraEm).getTime() > agora ? new Date(acesso.codigoExpiraEm).toISOString() : null,
        bloqueadoAte: acesso?.bloqueadoAte && new Date(acesso.bloqueadoAte).getTime() > agora ? new Date(acesso.bloqueadoAte).toISOString() : null,
        termoAceito: !!acesso?.termoVersaoAceita && acesso.termoVersaoAceita === config.termoVersao,
        ultimoAcessoEm: acesso?.ultimoAcessoEm ? new Date(acesso.ultimoAcessoEm).toISOString() : null,
      },
      realizado: { rhStatus: m.actual.rhStatus, sentForReview: m.actual.sentForReview, totalValue: m.actual.totalValue, dailyValue: m.actual.dailyValue },
      // Etapas 4–7 (28/10): a OC, a nota e se dá para enviar a NF como representante.
      notaFiscal: (() => {
        const n = notas.get(m.actual.id) ?? null;
        const estado = estadoDoPagamento({ ocNumero: m.actual.ocNumero, pagoEm: m.actual.pagoEm, nota: n });
        return {
          estado, rotulo: ROTULO_DO_ESTADO_DO_PAGAMENTO[estado],
          oc: m.actual.ocNumero ? { numero: m.actual.ocNumero, valor: m.actual.ocValor, data: m.actual.ocData } : null,
          nota: n ? { id: n.id, status: n.status, numero: n.nfNumero, valor: n.nfValor, arquivoNome: n.attachmentName, comentarioDoDp: n.returnComment } : null,
          pagoEm: m.actual.pagoEm,
          podeEnviar: enviaNf && podeEnviarNotaDaOc(m.actual, n).ok,
        };
      })(),
    };
  });
}

/** Responde a prestação de novo montada (depois de uma escrita). */
async function responderPrestacao(res: Response, actualId: string, user: User, status = 200) {
  const config = await lerConfiguracaoDoBanco();
  const m = await montarPrestacao(actualId, config);
  if (!m) return res.status(404).json({ message: "Prestação não encontrada." });
  const [linha] = await prestacoesParaTela([m], user, config, diaEmBrasilia());
  return res.status(status).json(linha);
}

export function registrarPresenca(app: Express): void {
  // ── Código de primeiro acesso do colaborador ──────────────────────────────
  app.post("/api/colaboradores/:id/codigo-de-acesso", async (req, res) => {
    const user = await requireRoles(req, res, PAPEIS_DO_CODIGO);
    if (!user) return;
    try {
      const colab = await storage.getCollaborator(req.params.id);
      if (!colab) return res.status(404).json({ message: "Colaborador não encontrado." });
      if (colab.active === false || colab.status !== "aprovado") return res.status(409).json({ message: "Colaborador inativo ou não aprovado — não tem acesso ao portal." });
      const cpf = cpfDoCadastro(colab);
      if (!cpf) return res.status(409).json({ message: "O cadastro não tem CPF — complete o cadastro antes de gerar o código." });
      const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const validoAte = new Date(Date.now() + VALIDADE_DO_CODIGO_HORAS * 3_600_000);
      // Código novo destrava quem estava bloqueado (o DP/produção está ajudando).
      const acesso = await salvarAcesso(colab.id, {
        codigoHash: await bcrypt.hash(codigo, 10), codigoExpiraEm: validoAte, codigoGeradoPor: user.id,
        tentativasFalhas: 0, bloqueadoAte: null,
      });
      // Auditoria SEM o código e sem o CPF.
      await createAuditLog("create", "colaborador_acesso", colab.id, {
        acao: "gerou o código de acesso ao portal do colaborador", colaborador: colab.fullName, validoAte: validoAte.toISOString(),
      }, user.id, nomeDe(user), undefined, req);
      res.set("Cache-Control", "no-store");
      res.status(201).json({
        codigo, validoAte: validoAte.toISOString(),
        colaborador: { id: colab.id, nome: colab.fullName, cpf: cpfMascarado(cpf) },
        jaTemSenha: !!acesso.senhaHash,
      });
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao gerar o código de acesso", 500);
    }
  });

  // ── Configurações (padrão provisório) ─────────────────────────────────────
  app.get("/api/presenca/configuracao", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    res.set("Cache-Control", "no-store");
    res.json({ configuracao: await lerConfiguracaoDoBanco(), padrao: CONFIGURACAO_PADRAO, provisorio: true, podeEditar: normalizeRole(user.role) === "admin" });
  });

  app.put("/api/presenca/configuracao", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    if (normalizeRole(user.role) !== "admin") return res.status(403).json({ message: "Só o administrador muda as regras da presença." });
    try {
      const atual = await lerConfiguracaoDoBanco();
      const r = validarConfiguracaoDaPresenca(req.body ?? {}, atual);
      if ("erro" in r) return res.status(400).json({ message: r.erro });
      for (const [chave, valor] of Object.entries(r.gravar)) await storage.upsertSystemSetting(chave, valor, user.id);
      if (Object.keys(r.gravar).length > 0) {
        const resumo = (c: ConfiguracaoDaPresenca) => ({ ...c, termoTexto: `${c.termoTexto.length} caracteres` });
        await createAuditLog("update", "system_settings", "presenca", resumo(r.nova), user.id, nomeDe(user), resumo(atual), req);
      }
      res.json({ configuracao: r.nova, padrao: CONFIGURACAO_PADRAO, provisorio: true, podeEditar: true });
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao salvar as regras da presença", 500);
    }
  });

  // ── Presença do evento ────────────────────────────────────────────────────
  app.get("/api/presenca/eventos/:eventId", async (req, res) => {
    const user = await requireRoles(req, res, PAPEIS_DA_PRESENCA);
    if (!user) return;
    try {
      const evento = await storage.getEvent(req.params.eventId);
      if (!evento) return res.status(404).json({ message: "Evento não encontrado." });
      const dataDeCorte = await lerDataDeCorteDoBanco();
      if (ehEventoLegado(evento.endDate, dataDeCorte)) {
        return res.status(409).json({ message: `Evento do fluxo antigo (termina antes de ${dataDeCorteLegivel(dataDeCorte)}): a presença não se aplica.`, codigo: "evento_legado" });
      }
      const config = await lerConfiguracaoDoBanco();
      let actuals: BudgetActual[] = (await db.select().from(budgetActualTable)
        .where(and(eq(budgetActualTable.eventId, evento.id), isNull(budgetActualTable.splitParentId))))
        .filter((a) => prestacaoDoFluxoNovo(a, evento, dataDeCorte));
      const papel = normalizeRole(user.role);
      if (papel === "function_area") {
        const minhas = await funcoesDoResponsavel(user.id);
        actuals = actuals.filter((a) => !!a.functionId && minhas.has(a.functionId));
      }
      const hoje = diaEmBrasilia();
      const montadas = await montarPrestacoes(actuals, config);
      const prestacoes = (await prestacoesParaTela(montadas, user, config, hoje))
        .sort((a, b) => (a.colaborador?.nome ?? "").localeCompare(b.colaborador?.nome ?? "", "pt-BR"));
      const naArenaAgora = prestacoes.flatMap((p) => {
        const d = p.dias.find((x) => x.dia === hoje && x.estado === "em_andamento");
        return d ? [{ actualId: p.actualId, colaborador: p.colaborador?.nome ?? null, funcao: p.funcao.nome, desde: d.entrada?.hora ?? null }] : [];
      });
      res.set("Cache-Control", "no-store");
      res.json({
        evento: {
          id: evento.id, nome: evento.name, cidade: evento.location, inicio: evento.startDate, fim: evento.endDate,
          ocultarValoresColaborador: evento.ocultarValoresColaborador,
        },
        hoje,
        configuracao: {
          selfieObrigatoria: config.selfieObrigatoria, localizacao: config.localizacao,
          horaExtraDivisor: config.horaExtraDivisor, produtorAjusteMaxPct: config.produtorAjusteMaxPct, provisorio: true,
        },
        permissoes: {
          verFotos: (PAPEIS_QUE_VEEM_SELFIES as readonly string[]).includes(papel ?? ""),
          representante: true,
          corrigir: (PAPEIS_DO_PRODUTOR as readonly string[]).includes(papel ?? ""),
          checkoutFinal: (PAPEIS_DO_PRODUTOR as readonly string[]).includes(papel ?? ""),
          gerarCodigo: (PAPEIS_DO_CODIGO as readonly string[]).includes(papel ?? ""),
          ajusteSemLimite: ehDp(user),
        },
        naArenaAgora,
        prestacoes,
      });
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao carregar a presença do evento", 500);
    }
  });

  // ── Representante: check-in / check-out pelo colaborador ──────────────────
  const marcarComoRepresentante = (tipo: "entrada" | "saida") => async (req: Request, res: Response) => {
    const acesso = await prestacaoComAcesso(req, res, PAPEIS_DA_PRESENCA, String(req.params.actualId));
    if (!acesso) return;
    if (!(await receberSelfie(req, res))) return;
    const { user, m, config } = acesso;
    const presenca = await registrarMarcacao({ req, res, m, dia: String(req.params.dia), tipo, por: "representante", ator: user, config });
    if (!presenca) return;
    await responderPrestacao(res, m.actual.id, user, 201);
  };
  app.post("/api/presenca/:actualId/:dia/entrada", marcarComoRepresentante("entrada"));
  app.post("/api/presenca/:actualId/:dia/saida", marcarComoRepresentante("saida"));

  // ── Correção de horário (check-out esquecido) ─────────────────────────────
  app.patch("/api/presenca/:actualId/:dia", async (req, res) => {
    const acesso = await prestacaoComAcesso(req, res, PAPEIS_DO_PRODUTOR, String(req.params.actualId));
    if (!acesso) return;
    const { user, m } = acesso;
    const dia = String(req.params.dia);
    if (!diaValido(dia) || !m.dias.includes(dia)) return res.status(400).json({ message: "Este dia não é um dia de diária desta prestação." });
    const corpo = corpoDaCorrecao.safeParse(req.body ?? {});
    if (!corpo.success) return res.status(400).json({ message: corpo.error.issues[0]?.message ?? "Dados inválidos." });
    const { entrada, saida, motivo } = corpo.data;
    if (entrada === undefined && saida === undefined) return res.status(400).json({ message: "Informe a entrada e/ou a saída." });
    if (prestacaoEstaTravada(m.actual) && !ehDp(user)) return res.status(409).json({ message: "Esta prestação já foi enviada ao DP — só o DP corrige agora." });
    const antes = m.presencaPorDia.get(dia) ?? null;
    const novaEntrada = entrada === undefined ? antes?.checkinEm ?? null : entrada ? instanteEmBrasilia(dia, entrada) : null;
    let novaSaida = saida === undefined ? antes?.checkoutEm ?? null : saida ? instanteEmBrasilia(dia, saida) : null;
    // Saída "antes" da entrada no relógio = passou da meia-noite (dia seguinte).
    if (saida && novaEntrada && novaSaida && novaSaida.getTime() <= new Date(novaEntrada).getTime()) novaSaida = instanteEmBrasilia(diaSeguinte(dia), saida);
    if (novaSaida && !novaEntrada) return res.status(400).json({ message: "Sem entrada não há saída — informe a entrada também." });
    if ((novaEntrada && new Date(novaEntrada).getTime() > Date.now()) || (novaSaida && new Date(novaSaida).getTime() > Date.now())) {
      return res.status(400).json({ message: "O horário corrigido não pode estar no futuro." });
    }
    try {
      const agora = new Date();
      const nota = `${diaCurto(diaEmBrasilia(agora))} ${horaEmBrasilia(agora)} — ${nomeDe(user)}: ${motivo}`;
      const mudouEntrada = entrada !== undefined;
      const mudouSaida = saida !== undefined;
      const campos = {
        ...(mudouEntrada ? { checkinEm: novaEntrada ? new Date(novaEntrada) : null, checkinPor: novaEntrada ? "produtor_correcao" : null, checkinUserId: novaEntrada ? user.id : null } : {}),
        ...(mudouSaida ? { checkoutEm: novaSaida ? new Date(novaSaida) : null, checkoutPor: novaSaida ? "produtor_correcao" : null, checkoutUserId: novaSaida ? user.id : null } : {}),
        observacao: antes?.observacao ? `${antes.observacao}\n${nota}` : nota,
        atualizadoEm: agora,
      };
      const [gravada] = await db.insert(presencas)
        .values({ actualId: m.actual.id, eventId: m.actual.eventId, collaboratorId: m.actual.collaboratorId!, dia, ...campos })
        .onConflictDoUpdate({ target: [presencas.actualId, presencas.dia], set: campos })
        .returning();
      const hora = (d: Date | string | null | undefined) => (d ? horaEmBrasilia(d) : null);
      await createAuditLog("update", "presenca", gravada.id, {
        acao: "correção de horário pelo produtor", prestacao: m.actual.id, dia, motivo,
        entrada: hora(gravada.checkinEm), saida: hora(gravada.checkoutEm),
      }, user.id, nomeDe(user), { entrada: hora(antes?.checkinEm), saida: hora(antes?.checkoutEm) }, req);
      await responderPrestacao(res, m.actual.id, user);
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao corrigir o horário", 500);
    }
  });

  // ── Ocorrências ───────────────────────────────────────────────────────────
  app.post("/api/presenca/:actualId/ocorrencias", async (req, res) => {
    const acesso = await prestacaoComAcesso(req, res, PAPEIS_DA_PRESENCA, String(req.params.actualId));
    if (!acesso) return;
    const { user, m } = acesso;
    const corpo = corpoDaOcorrencia.safeParse(req.body ?? {});
    if (!corpo.success) return res.status(400).json({ message: "Informe o tipo (falta, diária extra, horas extras ou substituição) e os dados dele." });
    if (prestacaoEstaTravada(m.actual)) return res.status(409).json({ message: "Esta prestação já foi enviada ao DP — as ocorrências não mudam mais." });
    const { tipo, horas, substitutoCollaboratorId, observacao } = corpo.data;
    const dia = corpo.data.dia ?? null;
    const ativosNoDia = (tipos: string[]) => m.ocorrencias.some((o) => o.dia && String(o.dia).slice(0, 10) === dia && tipos.includes(o.tipo));
    if (tipo === "falta" || tipo === "substituicao") {
      if (!dia || !m.dias.includes(dia)) return res.status(400).json({ message: "Escolha um dia de diária desta prestação." });
      if (ativosNoDia(["falta", "substituicao"])) return res.status(409).json({ message: `Já há falta ou substituição em ${diaCurto(dia)}.` });
    }
    if (tipo === "substituicao") {
      if (!substitutoCollaboratorId) return res.status(400).json({ message: "Informe quem substituiu." });
      if (substitutoCollaboratorId === m.actual.collaboratorId) return res.status(400).json({ message: "O substituto tem que ser outra pessoa." });
      if (!(await storage.getCollaborator(substitutoCollaboratorId))) return res.status(404).json({ message: "Substituto não encontrado." });
    }
    if (tipo === "diaria_extra") {
      if (!dia) return res.status(400).json({ message: "Informe o dia da diária extra." });
      if (m.dias.includes(dia)) return res.status(400).json({ message: "Este dia já é de diária — a diária extra é um dia a mais." });
      if (ativosNoDia(["diaria_extra"])) return res.status(409).json({ message: `Já há diária extra em ${diaCurto(dia)}.` });
    }
    if (tipo === "horas_extras") {
      if (!horas) return res.status(400).json({ message: "Informe as horas extras (até 24 por lançamento)." });
      if (dia && !m.dias.includes(dia) && !m.calculo.diasExtras.includes(dia)) return res.status(400).json({ message: "Escolha um dia da prestação (ou deixe sem dia)." });
    }
    try {
      const [criada] = await db.insert(presencaOcorrencias).values({
        actualId: m.actual.id, tipo, dia,
        horas: tipo === "horas_extras" && horas ? String(horas) : null,
        substitutoCollaboratorId: tipo === "substituicao" ? substitutoCollaboratorId ?? null : null,
        observacao: observacao || null, criadoPor: user.id, criadoPorNome: nomeDe(user),
      }).returning();
      await createAuditLog("create", "presenca_ocorrencia", criada.id, {
        acao: `ocorrência: ${OCORRENCIA_LABEL[tipo]}`, prestacao: m.actual.id, tipo, dia, horas: horas ?? null,
        substituto: criada.substitutoCollaboratorId, observacao: criada.observacao,
      }, user.id, nomeDe(user), undefined, req);
      await responderPrestacao(res, m.actual.id, user, 201);
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao lançar a ocorrência", 500);
    }
  });

  app.delete("/api/presenca/ocorrencias/:id", async (req, res) => {
    const user = await requireRoles(req, res, PAPEIS_DA_PRESENCA);
    if (!user) return;
    const o = await obterOcorrencia(req.params.id);
    if (!o || o.removidoEm) return res.status(404).json({ message: "Ocorrência não encontrada." });
    const acesso = await prestacaoComAcesso(req, res, PAPEIS_DA_PRESENCA, o.actualId);
    if (!acesso) return;
    if (prestacaoEstaTravada(acesso.m.actual)) return res.status(409).json({ message: "Esta prestação já foi enviada ao DP — as ocorrências não mudam mais." });
    try {
      const [removida] = await db.update(presencaOcorrencias)
        .set({ removidoEm: new Date(), removidoPor: user.id })
        .where(and(eq(presencaOcorrencias.id, o.id), isNull(presencaOcorrencias.removidoEm)))
        .returning();
      if (!removida) return res.status(404).json({ message: "Ocorrência não encontrada." });
      await createAuditLog("delete", "presenca_ocorrencia", o.id, {
        acao: `ocorrência removida: ${OCORRENCIA_LABEL[o.tipo as TipoDeOcorrencia] ?? o.tipo}`, prestacao: o.actualId, dia: o.dia,
      }, user.id, nomeDe(user), undefined, req);
      await responderPrestacao(res, o.actualId, user);
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao remover a ocorrência", 500);
    }
  });

  // ── Confirmação pelo representante ────────────────────────────────────────
  app.post("/api/presenca/:actualId/confirmar", async (req, res) => {
    const acesso = await prestacaoComAcesso(req, res, PAPEIS_DA_PRESENCA, String(req.params.actualId));
    if (!acesso) return;
    const corpo = corpoDaConfirmacao.safeParse(req.body ?? {});
    if (!corpo.success) return res.status(400).json({ message: "Envie os dias trabalhados e o CNPJ que emite a nota." });
    const erro = erroDoCnpjInformado(corpo.data.cnpj);
    if (erro) return res.status(400).json({ message: erro });
    const { user, m } = acesso;
    const gravada = await salvarConfirmacao({
      req, res, m, por: "representante", ator: user, valoresVisiveis: m.evento.ocultarValoresColaborador === false,
      corpo: { ...corpo.data, cnpj: digitosDoCnpj(corpo.data.cnpj) },
    });
    if (!gravada) return;
    await responderPrestacao(res, m.actual.id, user);
  });

  // ── Check-out final ───────────────────────────────────────────────────────
  app.post("/api/presenca/:actualId/checkout-final", async (req, res) => {
    const acesso = await prestacaoComAcesso(req, res, PAPEIS_DO_PRODUTOR, String(req.params.actualId));
    if (!acesso) return;
    const { user, m, config } = acesso;
    const corpo = corpoDoCheckoutFinal.safeParse(req.body ?? {});
    if (!corpo.success) return res.status(400).json({ message: "Informe o valor final em centavos (e, se for o caso, o CNPJ e a justificativa)." });
    const { valorFinal, justificativa } = corpo.data;
    const erroCnpj = erroDoCnpjInformado(corpo.data.cnpj);
    if (erroCnpj) return res.status(400).json({ message: erroCnpj });
    if (!podeEnviarParaRevisao(m.actual)) return res.status(409).json({ message: "Esta prestação já está com o DP (ou já foi aprovada)." });
    if (m.pendentes.length > 0) {
      return res.status(409).json({
        message: `Falta presença ou ocorrência em ${m.pendentes.map(diaCurto).join(", ")} — registre o check-in (ou a falta) antes do check-out final.`,
        codigo: "dias_pendentes", diasPendentes: m.pendentes,
      });
    }
    if (!m.confirmacao && (!justificativa || justificativa.length < 5)) {
      return res.status(409).json({ message: "O colaborador ainda não confirmou: escreva a justificativa para enviar assim mesmo.", codigo: "justificativa_obrigatoria" });
    }
    const calculado = m.calculo.valorCalculado;
    if (!ehDp(user) && !dentroDoLimite(calculado, valorFinal, config.produtorAjusteMaxPct)) {
      const { minimo, maximo } = faixaDoAjuste(calculado, config.produtorAjusteMaxPct);
      return res.status(409).json({
        message: `O ajuste passa do limite de ${config.produtorAjusteMaxPct.toLocaleString("pt-BR")}%: o valor final tem que ficar entre ${reaisDaPresenca(minimo)} e ${reaisDaPresenca(maximo)}. Acima disso, só o DP.`,
        codigo: "fora_do_limite", minimo, maximo,
      });
    }
    const cnpj = corpo.data.cnpj ? digitosDoCnpj(corpo.data.cnpj) : m.confirmacao?.cnpj ?? null;
    const razaoSocial = corpo.data.cnpj ? corpo.data.razaoSocial?.trim() || null : corpo.data.razaoSocial?.trim() || m.confirmacao?.razaoSocial || null;
    const pct = ajusteEmPct(calculado, valorFinal);
    const campos = camposDoRealizadoNoCheckoutFinal(m.actual, m.calculo, valorFinal);
    const semConfirmacao = !m.confirmacao;
    // Motivo da mudança no Realizado (27/10): a Conferência DP cobra `changeReason`
    // quando o valor difere do planejado — o check-out final é esse motivo.
    const nOcorrencias = m.ocorrencias.filter((o) => !o.removidoEm).length;
    const motivoDoCheckout = [
      `Check-out final da presença por ${nomeDe(user)}`,
      nOcorrencias > 0 ? `${nOcorrencias} ${nOcorrencias === 1 ? "ocorrência" : "ocorrências"}` : null,
      pct ? `ajuste de ${pct.toLocaleString("pt-BR")}% sobre o calculado` : null,
      semConfirmacao ? `sem a confirmação do colaborador: ${justificativa}` : null,
    ].filter(Boolean).join(" · ");
    const agora = new Date();
    try {
      const { depois, enviado } = await db.transaction(async (tx) => {
        const [depois] = await tx.update(budgetActualTable).set({
          ...campos,
          valorCalculado: calculado,
          ajusteProdutorPct: pct != null ? String(pct) : null,
          horasExtras: String(m.calculo.horasExtras),
          valorHorasExtras: m.calculo.valorHorasExtras,
          cnpjEmissor: cnpj, razaoSocialEmissor: razaoSocial,
          checkoutFinalEm: agora, checkoutFinalPor: user.id,
          changeReason: motivoDoCheckout,
          ...(semConfirmacao ? { observations: [m.actual.observations, `Check-out final sem a confirmação do colaborador (${nomeDe(user)}): ${justificativa}`].filter(Boolean).join("\n") } : {}),
          updatedAt: agora, updatedBy: user.id,
        }).where(and(
          eq(budgetActualTable.id, m.actual.id),
          eq(budgetActualTable.rhStatus, m.actual.rhStatus),
          eq(budgetActualTable.sentForReview, m.actual.sentForReview),
        )).returning();
        if (!depois) throw new HttpError(409, "A prestação mudou enquanto o check-out final era feito — atualize e tente de novo.");
        // Envio ao DP pelo MESMO caminho do "Enviar para revisão" do Realizado.
        const [enviado] = await marcarEnviadosParaRevisao(tx, [depois], user.id);
        if (!enviado) throw new HttpError(409, "Não foi possível enviar ao DP — a prestação mudou de estado.");
        return { depois, enviado };
      });
      await createAuditLogsBatch([
        montarLogDeAuditoria("update", "budget_actual", depois.id, {
          ...depois, acao: "check-out final da presença", valorCalculado: calculado, valorFinal, ajusteProdutorPct: pct,
          ...(semConfirmacao ? { justificativa } : {}),
        }, user.id, nomeDe(user), m.actual, req),
        montarLogDeAuditoria("send_review", "budget_actual", enviado.id, enviado, user.id, nomeDe(user), depois, req),
      ]);
      await responderPrestacao(res, m.actual.id, user);
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao fazer o check-out final", 500);
    }
  });
}
