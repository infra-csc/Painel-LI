/**
 * Portal do COLABORADOR (/colaborador) — a API (27/10, Fase 1 do Módulo de
 * Honorários). Ata de 22/10: "cada colaborador acessa o app com CPF e senha;
 * check-in e check-out diários com selfie"; decisão do dono (26/10): o
 * colaborador confirma dias e CNPJ; valores ocultos enquanto o evento estiver
 * com "não exibir valores" (até a OC).
 *
 *   POST /api/colaborador/entrar           { cpf, senha }
 *   POST /api/colaborador/primeiro-acesso  { cpf, codigo, senha }  (também "esqueci a senha")
 *   POST /api/colaborador/sair
 *   GET  /api/colaborador/eu
 *   POST /api/colaborador/termo            { versao }
 *   GET  /api/colaborador/prestacoes
 *   POST /api/colaborador/presencas/:actualId/:dia/entrada   (multipart: foto, lat, lng, precisao)
 *   POST /api/colaborador/presencas/:actualId/:dia/saida
 *   POST /api/colaborador/prestacoes/:actualId/confirmar     { dias, cnpj, razaoSocial?, contestacao? }
 *   GET  /api/colaborador/fotos/:id        (só as próprias selfies)
 *   POST /api/colaborador/prestacoes/:actualId/nota-fiscal   (28/10, multipart: arquivo, valorNota, numeroNota?, cnpjNota?, conta?)
 *   GET  /api/colaborador/prestacoes/:actualId/nota-fiscal/arquivo   (a própria nota)
 *
 * Sessão: `req.session.colaboradorId` (server/colaborador-sessao.ts) — mundo
 * à parte das rotas internas. O CPF nunca vai para a auditoria nem para o log;
 * senha e código só como hash bcrypt.
 */
import type { Express, Request, Response } from "express";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { budgetActual, type BudgetActual, type Collaborator, type ColaboradorAcesso } from "@shared/schema";
import {
  BLOQUEIO_MINUTOS, OCORRENCIA_LABEL, TENTATIVAS_ANTES_DO_BLOQUEIO, diaEmBrasilia, diaValido, erroDaSenha, horaEmBrasilia,
  podeRegistrarEntrada, podeRegistrarSaida, type ConfiguracaoDaPresenca, type EstadoDoDia, type TipoDeOcorrencia,
} from "@shared/presenca";
import { cnpjValido, digitosDoCnpj, mascararCnpj } from "@shared/cnpj";
import { contratoVigenteEm } from "@shared/contratos";
import { hojeISO } from "@shared/hoje-sp";
import { PostgresRateLimitStore } from "../rate-limit-store";
import { encerrarSessaoDoColaborador, iniciarSessaoDoColaborador } from "../colaborador-sessao";
import { acessosDosColaboradores, colaboradoresPorCpf, consumirCodigoDeAcesso, fotoEhDoColaborador, obterAcesso, registrarFalha, salvarAcesso } from "../storage/presenca";
import { contratosDosColaboradores } from "../storage/contratos";
import {
  estadosDosDias, lerConfiguracaoDoBanco, lerDataDeCorteDoBanco, montarPrestacao, montarPrestacoes, permissaoDeConfirmar,
  prestacaoDoFluxoNovo, receberSelfie, registrarMarcacao, salvarConfirmacao, type PrestacaoMontada,
} from "../presenca-servico";
import { createAuditLog, responderErroComStatus } from "./_compartilhado";
import { valoresVisiveisAoColaborador, podeEnviarNotaDaOc } from "@shared/honorarios-pagamento";
import { TIPOS_DE_CONTA, TIPOS_DE_PIX, type DadosDePagamento } from "@shared/pagamento";
import type { Invoice } from "@shared/schema";
import { obterPagamento } from "../storage/contratos";
import { gravarDadosDePagamento, temContaOuPix } from "../pagamento-servico";
import {
  anexoDaNotaParaOColaborador, blocoDoPortal, contaDoPortal, enviarNotaDaPrestacao, lerCamposDaNota, notaDaPrestacao, notasDasPrestacoes, receberArquivoDaNota,
  type ContaDoPortal,
} from "../honorarios-pagamento-servico";
import { prazoDaMontada } from "../presenca-servico";
import { DEFINICAO_DA_ETAPA, ROTULO_DE_QUEM, prazoDoColaborador, situacaoDoVencimento, somarDias, type PrazoDaEtapa, type PrazosDosHonorarios } from "@shared/prazos-honorarios";
import { contestacaoParaTela, lerPrazosDoBanco } from "./honorarios-prazos";

const MSG_CREDENCIAIS = "CPF ou senha incorretos.";
const MSG_CODIGO = "CPF ou código inválido (ou vencido). Peça um código novo ao DP ou à produção.";
const MSG_BLOQUEADO = `Muitas tentativas erradas: o acesso fica bloqueado por ${BLOQUEIO_MINUTOS} minutos.`;

/** Colaborador que pode entrar: ativo e aprovado no cadastro. */
const colaboradorAtivo = (c: Collaborator) => c.active !== false && c.status === "aprovado";

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome;

// Hash "de mentira" para o caminho do CPF sem cadastro gastar o mesmo tempo
// que o do CPF com cadastro (sem vazar quem tem acesso pelo relógio).
let hashFalso: Promise<string> | null = null;
const compararComHashFalso = async (senha: string) => {
  hashFalso ??= bcrypt.hash("senha-que-ninguem-tem-0000", 10);
  await bcrypt.compare(senha, await hashFalso);
};

// CPF sem cadastro (ou sem senha) também "bloqueia" no 5º erro, para a
// resposta ser igual à de quem tem cadastro (contador no Postgres, por hash do CPF).
const contadorSemCadastro = new PostgresRateLimitStore("colab-cpf");
contadorSemCadastro.init({ windowMs: BLOQUEIO_MINUTOS * 60_000 } as Parameters<PostgresRateLimitStore["init"]>[0]);
const chaveDoCpf = (cpf: string) => createHash("sha256").update(`painel-li:${cpf}`).digest("hex");

async function falhaSemCadastro(cpf: string): Promise<boolean> {
  const r = await contadorSemCadastro.increment(chaveDoCpf(cpf));
  return r.totalHits >= TENTATIVAS_ANTES_DO_BLOQUEIO;
}
async function bloqueadoSemCadastro(cpf: string): Promise<boolean> {
  const r = await contadorSemCadastro.get(chaveDoCpf(cpf));
  return !!r && r.totalHits >= TENTATIVAS_ANTES_DO_BLOQUEIO;
}

/** O colaborador do CPF (ativo) e o acesso dele; com dois cadastros no mesmo CPF, o que já tem acesso. */
async function localizarPorCpf(cpf: string): Promise<{ colab: Collaborator; acesso: ColaboradorAcesso | null } | null> {
  const lista = (await colaboradoresPorCpf(cpf)).filter(colaboradorAtivo);
  if (lista.length === 0) return null;
  const acessos = await acessosDosColaboradores(lista.map((c) => c.id));
  const colab = lista.find((c) => acessos.get(c.id)?.senhaHash) ?? lista.find((c) => acessos.has(c.id)) ?? lista[0];
  return { colab, acesso: acessos.get(colab.id) ?? null };
}

const estaBloqueado = (a: ColaboradorAcesso | null) => !!a?.bloqueadoAte && new Date(a.bloqueadoAte).getTime() > Date.now();

/** O que a tela precisa de "quem sou eu" (sem CPF, sem nada do acesso além do termo). */
function eu(colab: Collaborator, acesso: ColaboradorAcesso | null, config: ConfiguracaoDaPresenca) {
  const aceito = !!acesso?.termoVersaoAceita && acesso.termoVersaoAceita === config.termoVersao;
  return {
    colaborador: { id: colab.id, nome: colab.fullName, primeiroNome: primeiroNome(colab.fullName) },
    termo: {
      versao: config.termoVersao,
      texto: config.termoTexto,
      aceito,
      aceitoEm: aceito && acesso?.termoAceitoEm ? new Date(acesso.termoAceitoEm).toISOString() : null,
      versaoAceita: acesso?.termoVersaoAceita ?? null,
    },
    configuracao: { selfieObrigatoria: config.selfieObrigatoria, localizacao: config.localizacao },
  };
}

/**
 * O colaborador da sessão, ainda ativo. Senão encerra a sessão e responde 401.
 * O gate (server/colaborador-sessao.ts) já garantiu que há `colaboradorId`.
 */
async function requireColaborador(req: Request, res: Response): Promise<Collaborator | null> {
  const id = req.session?.colaboradorId;
  const colab = id ? await storage.getCollaborator(id) : undefined;
  if (!colab || !colaboradorAtivo(colab)) {
    await encerrarSessaoDoColaborador(req);
    res.status(401).json({ message: "Acesso encerrado. Fale com o DP.", portalDoColaborador: true });
    return null;
  }
  return colab;
}

const nomeNaAuditoria = (c: Collaborator) => `Colaborador (portal): ${c.fullName}`;

const corpoDoEntrar = z.object({ cpf: z.string().min(1).max(30), senha: z.string().min(1).max(200) });
const corpoDoPrimeiroAcesso = z.object({ cpf: z.string().min(1).max(30), codigo: z.string().regex(/^\d{6}$/), senha: z.string().max(200) });
const corpoDaConfirmacao = z.object({
  dias: z.array(z.string().refine(diaValido)).max(400),
  cnpj: z.string().min(1).max(30),
  razaoSocial: z.string().trim().max(200).nullish(),
  contestacao: z.string().trim().max(2000).nullish(),
});

const marcacaoDoDia = (em: Date | null, fotoId: string | null, por: string | null, lat: string | null, fotoExpurgadaEm: Date | null = null) => em ? {
  em: new Date(em).toISOString(),
  hora: horaEmBrasilia(em),
  comSelfie: !!fotoId,
  // 28/10: a selfie saiu do storage depois da guarda (LGPD); o horário fica.
  fotoExpurgada: !!fotoExpurgadaEm,
  fotoId,
  porRepresentante: por === "representante" || por === "produtor_correcao",
  comLocalizacao: !!lat,
} : null;

/**
 * A prestação como o COLABORADOR vê: valores só se o evento não os oculta —
 * ou depois da OC ("não exibir valores" vale ATÉ a OC, 28/10).
 */
/**
 * O prazo que o COLABORADOR tem agora (28/10, Fase 3): confirmar a presença,
 * enviar ou reenviar a nota — a mesma régua do Painel. No último dia, com o
 * check-out feito, a confirmação já abre: o "confirme até" aparece desde ali.
 */
function prazoParaOColaborador(m: PrestacaoMontada, hoje: string, nota: Invoice | null, prazos: PrazosDosHonorarios, podeConfirmar: boolean): PrazoDaEtapa | null {
  const doColaborador = prazoDoColaborador(prazoDaMontada(m, prazos, hoje, nota));
  if (doColaborador) return doColaborador;
  const ultimo = m.dias[m.dias.length - 1];
  if (!podeConfirmar || m.confirmacao || !ultimo) return null;
  const venceEm = somarDias(ultimo, prazos.confirmarPresenca);
  return {
    etapa: "confirmar_presenca", rotulo: DEFINICAO_DA_ETAPA.confirmar_presenca.rotulo, quem: "colaborador", rotuloDeQuem: ROTULO_DE_QUEM.colaborador,
    desde: ultimo, venceEm, ...situacaoDoVencimento(venceEm, hoje),
  };
}

/** 28/10 (R7): a divisão (o substituto) no portal — a presença e a confirmação ficam com o titular. */
const MSG_DIVISAO_SEM_CONFIRMACAO = "Você trabalhou como substituto nesta vaga: a presença e a confirmação ficam com o titular. A nota fiscal e o pagamento são seus.";

/** A divisão é do fluxo novo? (a MESMA regra da presença, sem a exclusão das divisões) */
const divisaoDoFluxoNovo = (a: BudgetActual, evento: Parameters<typeof prestacaoDoFluxoNovo>[1], dataDeCorte: string) =>
  !!a.splitParentId && !!a.collaboratorId && prestacaoDoFluxoNovo({ ...a, splitParentId: null }, evento, dataDeCorte);

/**
 * 28/10 (R7): a divisão ("Dividir escalação") como o SUBSTITUTO vê — só a OC,
 * a nota e o pagamento (prestação própria); dias sem check-in e sem
 * confirmação; o valor é o do Realizado (fechado pelo produtor).
 */
function divisaoDoColaborador(m: PrestacaoMontada, hoje: string, pagamento: { nota: Invoice | null; conta: ContaDoPortal; prazos: PrazosDosHonorarios }) {
  const ocultos = !valoresVisiveisAoColaborador(m.evento.ocultarValoresColaborador, m.actual.ocNumero);
  const doColaborador = prazoDoColaborador(prazoDaMontada(m, pagamento.prazos, hoje, pagamento.nota));
  const prazo = doColaborador && doColaborador.etapa !== "confirmar_presenca" ? doColaborador : null;
  const fechada = m.actual.sentForReview || m.actual.rhStatus === "aprovado";
  return {
    id: m.actual.id,
    divisao: true,
    evento: { id: m.evento.id, nome: m.evento.name, cidade: m.evento.location, inicio: m.evento.startDate, fim: m.evento.endDate },
    funcao: m.funcaoNome,
    dias: m.dias.map((dia) => ({ dia, estado: (dia > hoje ? "futuro" : "concluido") as EstadoDoDia, entrada: null, saida: null, podeEntrar: false, podeSair: false })),
    ocorrencias: [],
    diasExtras: [],
    confirmacao: null,
    prazo: prazo ? { etapa: prazo.etapa, venceEm: prazo.venceEm, situacao: prazo.situacao, dias: prazo.dias } : null,
    podeConfirmar: false,
    motivoNaoPodeConfirmar: MSG_DIVISAO_SEM_CONFIRMACAO,
    checkoutFinalFeito: fechada,
    valoresOcultos: ocultos,
    valores: ocultos ? null : {
      valorCalculado: m.actual.totalValue,
      valorDaDiaria: m.actual.dailyValue,
      memoria: [],
      valorFinal: fechada ? m.actual.totalValue : null,
    },
    notaEPagamento: blocoDoPortal(m.actual, m.evento, pagamento.nota, m.funcaoNome, pagamento.conta, m.dias[0] ?? null, m.dias[m.dias.length - 1] ?? null),
  };
}

function prestacaoDoColaborador(m: PrestacaoMontada, hoje: string, pagamento: { nota: Invoice | null; conta: ContaDoPortal; prazos: PrazosDosHonorarios }) {
  if (m.actual.splitParentId) return divisaoDoColaborador(m, hoje, pagamento);
  const ocultos = !valoresVisiveisAoColaborador(m.evento.ocultarValoresColaborador, m.actual.ocNumero);
  const confirmar = permissaoDeConfirmar(m, hoje);
  const prazo = prazoParaOColaborador(m, hoje, pagamento.nota, pagamento.prazos, confirmar.ok);
  return {
    id: m.actual.id,
    divisao: false,
    evento: { id: m.evento.id, nome: m.evento.name, cidade: m.evento.location, inicio: m.evento.startDate, fim: m.evento.endDate },
    funcao: m.funcaoNome,
    dias: estadosDosDias(m, hoje).map(({ dia, estado }) => {
      const p = m.presencaPorDia.get(dia) ?? null;
      return {
        dia, estado,
        entrada: p ? marcacaoDoDia(p.checkinEm, p.checkinFotoId, p.checkinPor, p.checkinLat, p.fotoExpurgadaEm) : null,
        saida: p ? marcacaoDoDia(p.checkoutEm, p.checkoutFotoId, p.checkoutPor, p.checkoutLat, p.fotoExpurgadaEm) : null,
        podeEntrar: !m.checkoutFinalFeito && podeRegistrarEntrada({ dia, hoje, dias: m.dias, presenca: p }).ok,
        podeSair: !m.checkoutFinalFeito && podeRegistrarSaida({ dia, hoje, dias: m.dias, presenca: p }).ok,
      };
    }),
    // Sem observação interna nem o nome do substituto (é de outra pessoa).
    ocorrencias: m.ocorrencias.map((o) => ({
      id: o.id, tipo: o.tipo, rotulo: OCORRENCIA_LABEL[o.tipo as TipoDeOcorrencia] ?? o.tipo,
      dia: o.dia ? String(o.dia).slice(0, 10) : null, horas: o.horas != null ? Number(o.horas) : null,
    })),
    diasExtras: m.calculo.diasExtras,
    confirmacao: m.confirmacao ? {
      dias: m.confirmacao.diasConfirmados, cnpj: m.confirmacao.cnpj ? mascararCnpj(m.confirmacao.cnpj) : null,
      razaoSocial: m.confirmacao.razaoSocial, contestacao: m.confirmacao.contestacao,
      confirmadoEm: new Date(m.confirmacao.confirmadoEm).toISOString(),
      valorVisto: ocultos ? null : m.confirmacao.valorVisto,
      // 28/10 (Fase 3): a resposta do DP à contestação (sem o nome de quem respondeu: "o DP").
      respostaDoDp: (() => {
        const c = contestacaoParaTela(m.confirmacao);
        return c?.respondida && c.resposta ? { texto: c.resposta, em: c.respondidaEm } : null;
      })(),
    } : null,
    // 28/10 (Fase 3): o prazo do que é dele agora ("Confirme até", "Envie a nota até").
    prazo: prazo ? { etapa: prazo.etapa, venceEm: prazo.venceEm, situacao: prazo.situacao, dias: prazo.dias } : null,
    podeConfirmar: confirmar.ok,
    motivoNaoPodeConfirmar: confirmar.ok ? null : confirmar.motivo,
    checkoutFinalFeito: m.checkoutFinalFeito,
    valoresOcultos: ocultos,
    // O servidor NÃO manda o número quando o evento oculta os valores.
    valores: ocultos ? null : {
      valorCalculado: m.calculo.valorCalculado,
      valorDaDiaria: m.actual.dailyValue,
      memoria: m.calculo.linhas,
      valorFinal: m.checkoutFinalFeito ? m.actual.totalValue : null,
    },
    // Etapas 5–7 (28/10): OC, nota fiscal, programado e pago.
    notaEPagamento: blocoDoPortal(m.actual, m.evento, pagamento.nota, m.funcaoNome, pagamento.conta, m.dias[0] ?? null, m.dias[m.dias.length - 1] ?? null),
  };
}

export function registrarColaboradorPortal(app: Express): void {
  // ── Entrar ────────────────────────────────────────────────────────────────
  app.post("/api/colaborador/entrar", async (req, res) => {
    const corpo = corpoDoEntrar.safeParse(req.body ?? {});
    const cpf = corpo.success ? corpo.data.cpf.replace(/\D/g, "") : "";
    if (!corpo.success || cpf.length !== 11) return res.status(400).json({ message: "Informe o CPF (11 dígitos) e a senha." });
    const { senha } = corpo.data;
    try {
      const alvo = await localizarPorCpf(cpf);
      if (!alvo || !alvo.acesso?.senhaHash) {
        // Mesmo caminho (e mesmo tempo) de uma senha errada — sem dizer se o CPF tem cadastro.
        if (await bloqueadoSemCadastro(cpf)) return res.status(429).json({ message: MSG_BLOQUEADO, bloqueado: true });
        await compararComHashFalso(senha);
        if (await falhaSemCadastro(cpf)) return res.status(429).json({ message: MSG_BLOQUEADO, bloqueado: true });
        return res.status(401).json({ message: MSG_CREDENCIAIS });
      }
      const { colab, acesso } = alvo;
      if (estaBloqueado(acesso)) return res.status(429).json({ message: MSG_BLOQUEADO, bloqueado: true });
      if (!(await bcrypt.compare(senha, acesso.senhaHash!))) {
        const depois = await registrarFalha(colab.id, TENTATIVAS_ANTES_DO_BLOQUEIO, new Date(Date.now() + BLOQUEIO_MINUTOS * 60_000));
        if (estaBloqueado(depois)) {
          await createAuditLog("update", "colaborador_acesso", colab.id, { acao: "acesso bloqueado por tentativas erradas", minutos: BLOQUEIO_MINUTOS }, undefined, "Sistema", undefined, req);
          return res.status(429).json({ message: MSG_BLOQUEADO, bloqueado: true });
        }
        return res.status(401).json({ message: MSG_CREDENCIAIS });
      }
      const atualizado = await salvarAcesso(colab.id, { tentativasFalhas: 0, bloqueadoAte: null, ultimoAcessoEm: new Date() });
      await iniciarSessaoDoColaborador(req, colab.id);
      await createAuditLog("login", "colaborador_acesso", colab.id, { acao: "entrou no portal do colaborador" }, undefined, nomeNaAuditoria(colab), undefined, req);
      res.json(eu(colab, atualizado, await lerConfiguracaoDoBanco()));
    } catch (error) {
      responderErroComStatus(res, error, "Não foi possível entrar agora. Tente de novo.", 500);
    }
  });

  // ── Primeiro acesso / esqueci a senha ─────────────────────────────────────
  app.post("/api/colaborador/primeiro-acesso", async (req, res) => {
    const corpo = corpoDoPrimeiroAcesso.safeParse(req.body ?? {});
    const cpf = corpo.success ? corpo.data.cpf.replace(/\D/g, "") : "";
    if (!corpo.success || cpf.length !== 11) return res.status(400).json({ message: "Informe o CPF (11 dígitos), o código de 6 dígitos e a senha nova." });
    const erroSenha = erroDaSenha(corpo.data.senha);
    if (erroSenha) return res.status(400).json({ message: erroSenha });
    const { codigo, senha } = corpo.data;
    try {
      const alvo = await localizarPorCpf(cpf);
      const acesso = alvo?.acesso ?? null;
      if (!alvo || !acesso) {
        if (await bloqueadoSemCadastro(cpf)) return res.status(429).json({ message: MSG_BLOQUEADO, bloqueado: true });
        await compararComHashFalso(codigo);
        if (await falhaSemCadastro(cpf)) return res.status(429).json({ message: MSG_BLOQUEADO, bloqueado: true });
        return res.status(401).json({ message: MSG_CODIGO });
      }
      if (estaBloqueado(acesso)) return res.status(429).json({ message: MSG_BLOQUEADO, bloqueado: true });
      const vigente = !!acesso.codigoHash && !!acesso.codigoExpiraEm && new Date(acesso.codigoExpiraEm).getTime() > Date.now();
      let confere = false;
      if (vigente) confere = await bcrypt.compare(codigo, acesso.codigoHash!);
      else await compararComHashFalso(codigo); // mesmo tempo de um código errado
      if (!confere) {
        const depois = await registrarFalha(alvo.colab.id, TENTATIVAS_ANTES_DO_BLOQUEIO, new Date(Date.now() + BLOQUEIO_MINUTOS * 60_000));
        if (estaBloqueado(depois)) return res.status(429).json({ message: MSG_BLOQUEADO, bloqueado: true });
        return res.status(401).json({ message: MSG_CODIGO });
      }
      // Código vale UMA vez: some junto com a troca da senha — 28/10 (revisão
      // S4): de forma atômica (só se o hash lido ainda é o da linha).
      const atualizado = await consumirCodigoDeAcesso(alvo.colab.id, acesso.codigoHash!, {
        senhaHash: await bcrypt.hash(senha, 10), ultimoAcessoEm: new Date(),
      });
      if (!atualizado) return res.status(401).json({ message: MSG_CODIGO });
      await iniciarSessaoDoColaborador(req, alvo.colab.id);
      await createAuditLog("update", "colaborador_acesso", alvo.colab.id, { acao: acesso.senhaHash ? "trocou a senha com o código de acesso" : "criou a senha no primeiro acesso" }, undefined, nomeNaAuditoria(alvo.colab), undefined, req);
      res.json(eu(alvo.colab, atualizado, await lerConfiguracaoDoBanco()));
    } catch (error) {
      responderErroComStatus(res, error, "Não foi possível criar a senha agora. Tente de novo.", 500);
    }
  });

  app.post("/api/colaborador/sair", async (req, res) => {
    await encerrarSessaoDoColaborador(req);
    res.json({ ok: true });
  });

  app.get("/api/colaborador/eu", async (req, res) => {
    const colab = await requireColaborador(req, res);
    if (!colab) return;
    res.set("Cache-Control", "no-store");
    res.json(eu(colab, await obterAcesso(colab.id), await lerConfiguracaoDoBanco()));
  });

  // ── Termo LGPD ────────────────────────────────────────────────────────────
  app.post("/api/colaborador/termo", async (req, res) => {
    const colab = await requireColaborador(req, res);
    if (!colab) return;
    const versao = typeof req.body?.versao === "string" ? req.body.versao.trim() : "";
    const config = await lerConfiguracaoDoBanco();
    if (!versao) return res.status(400).json({ message: "Informe a versão do termo." });
    if (versao !== config.termoVersao) return res.status(409).json({ message: "O termo mudou. Leia a versão atual e aceite de novo.", versaoAtual: config.termoVersao });
    const acesso = await salvarAcesso(colab.id, { termoVersaoAceita: versao, termoAceitoEm: new Date(), termoAceitoIp: req.ip ?? null });
    await createAuditLog("update", "colaborador_acesso", colab.id, { acao: "aceitou o termo de uso de imagem e localização", versao }, undefined, nomeNaAuditoria(colab), undefined, req);
    res.json(eu(colab, acesso, config));
  });

  // ── Meus eventos ──────────────────────────────────────────────────────────
  app.get("/api/colaborador/prestacoes", async (req, res) => {
    const colab = await requireColaborador(req, res);
    if (!colab) return;
    try {
      const [config, dataDeCorte] = await Promise.all([lerConfiguracaoDoBanco(), lerDataDeCorteDoBanco()]);
      // 28/10 (R7): as divisões em que ele é o substituto também (OC, nota e pagamento).
      const minhas = await db.select().from(budgetActual)
        .where(and(eq(budgetActual.collaboratorId, colab.id), eq(budgetActual.didNotAttend, false)));
      const eventos = new Map((await storage.getEventsByIds(minhas.map((a) => a.eventId))).map((e) => [e.id, e]));
      const doFluxoNovo = minhas.filter((a) => prestacaoDoFluxoNovo(a, eventos.get(a.eventId), dataDeCorte) || divisaoDoFluxoNovo(a, eventos.get(a.eventId), dataDeCorte));
      const hoje = diaEmBrasilia();
      const montadas = (await montarPrestacoes(doFluxoNovo, config))
        .sort((a, b) => String(b.evento.startDate).localeCompare(String(a.evento.startDate)));
      // CNPJs ligados ao colaborador (para escolher na confirmação).
      const contratos = (await contratosDosColaboradores([colab.id])).get(colab.id) ?? [];
      const [notas, conta, prazos] = await Promise.all([notasDasPrestacoes(montadas.map((m) => m.actual.id)), contaDoPortal(colab.id), lerPrazosDoBanco()]);
      res.set("Cache-Control", "no-store");
      res.json({
        hoje,
        prestacoes: montadas.map((m) => prestacaoDoColaborador(m, hoje, { nota: notas.get(m.actual.id) ?? null, conta, prazos })),
        cnpjs: contratos.map((c) => ({ cnpj: mascararCnpj(c.cnpj), razaoSocial: c.razaoSocial, ativo: contratoVigenteEm(c, hojeISO()) })),
      });
    } catch (error) {
      responderErroComStatus(res, error, "Não foi possível carregar os seus eventos.", 500);
    }
  });

  /** A prestação do PRÓPRIO colaborador, do fluxo novo — senão 404 (não diz se existe). */
  async function minhaPrestacao(req: Request, res: Response, colab: Collaborator, config: ConfiguracaoDaPresenca): Promise<PrestacaoMontada | null> {
    const m = await montarPrestacao(String(req.params.actualId), config);
    if (!m || m.actual.collaboratorId !== colab.id || !prestacaoDoFluxoNovo(m.actual, m.evento, await lerDataDeCorteDoBanco())) {
      res.status(404).json({ message: "Prestação não encontrada." });
      return null;
    }
    return m;
  }

  /**
   * 28/10 (R7): para a NOTA e o pagamento, a prestação dele OU a divisão em
   * que ele é o substituto. A presença e a confirmação seguem em `minhaPrestacao`.
   */
  async function minhaPrestacaoDaNota(req: Request, res: Response, colab: Collaborator, config: ConfiguracaoDaPresenca): Promise<PrestacaoMontada | null> {
    const m = await montarPrestacao(String(req.params.actualId), config);
    const corte = await lerDataDeCorteDoBanco();
    if (!m || m.actual.collaboratorId !== colab.id || !(prestacaoDoFluxoNovo(m.actual, m.evento, corte) || divisaoDoFluxoNovo(m.actual, m.evento, corte))) {
      res.status(404).json({ message: "Prestação não encontrada." });
      return null;
    }
    return m;
  }

  // ── Check-in / check-out ──────────────────────────────────────────────────
  const marcar = (tipo: "entrada" | "saida") => async (req: Request, res: Response) => {
    const colab = await requireColaborador(req, res);
    if (!colab) return;
    const [config, acesso] = await Promise.all([lerConfiguracaoDoBanco(), obterAcesso(colab.id)]);
    if (acesso?.termoVersaoAceita !== config.termoVersao) {
      return res.status(409).json({ message: "Leia e aceite o termo de uso da imagem e da localização antes do check-in.", codigo: "termo_pendente" });
    }
    if (!(await receberSelfie(req, res))) return;
    const m = await minhaPrestacao(req, res, colab, config);
    if (!m) return;
    const presenca = await registrarMarcacao({ req, res, m, dia: String(req.params.dia), tipo, por: "colaborador", ator: null, config });
    if (!presenca) return;
    res.status(201).json({
      dia: req.params.dia,
      entrada: marcacaoDoDia(presenca.checkinEm, presenca.checkinFotoId, presenca.checkinPor, presenca.checkinLat, presenca.fotoExpurgadaEm),
      saida: marcacaoDoDia(presenca.checkoutEm, presenca.checkoutFotoId, presenca.checkoutPor, presenca.checkoutLat, presenca.fotoExpurgadaEm),
    });
  };
  app.post("/api/colaborador/presencas/:actualId/:dia/entrada", marcar("entrada"));
  app.post("/api/colaborador/presencas/:actualId/:dia/saida", marcar("saida"));

  // ── Confirmação final ─────────────────────────────────────────────────────
  app.post("/api/colaborador/prestacoes/:actualId/confirmar", async (req, res) => {
    const colab = await requireColaborador(req, res);
    if (!colab) return;
    const corpo = corpoDaConfirmacao.safeParse(req.body ?? {});
    if (!corpo.success) return res.status(400).json({ message: "Envie os dias trabalhados e o CNPJ que emite a nota." });
    if (!cnpjValido(corpo.data.cnpj)) return res.status(400).json({ message: "CNPJ inválido — confira os 14 dígitos." });
    const [config, acesso] = await Promise.all([lerConfiguracaoDoBanco(), obterAcesso(colab.id)]);
    if (acesso?.termoVersaoAceita !== config.termoVersao) {
      return res.status(409).json({ message: "Leia e aceite o termo antes de confirmar.", codigo: "termo_pendente" });
    }
    const m = await minhaPrestacao(req, res, colab, config);
    if (!m) return;
    const gravada = await salvarConfirmacao({
      req, res, m, por: "colaborador", ator: null, valoresVisiveis: m.evento.ocultarValoresColaborador === false,
      corpo: { ...corpo.data, cnpj: digitosDoCnpj(corpo.data.cnpj) },
    });
    if (!gravada) return;
    res.json({ confirmacao: { dias: gravada.diasConfirmados, cnpj: gravada.cnpj ? mascararCnpj(gravada.cnpj) : null, razaoSocial: gravada.razaoSocial, contestacao: gravada.contestacao, confirmadoEm: new Date(gravada.confirmadoEm).toISOString(), cnpjComContrato: !!gravada.contratoId } });
  });

  // ── As próprias selfies ───────────────────────────────────────────────────
  app.get("/api/colaborador/fotos/:id", async (req, res) => {
    const colab = await requireColaborador(req, res);
    if (!colab) return;
    const id = String(req.params.id);
    if (!/^ATT-[A-Z0-9-]{4,60}$/.test(id) || !(await fotoEhDoColaborador(id, colab.id))) {
      return res.status(404).json({ message: "Foto não encontrada." });
    }
    const { ObjectStorageService } = await import("../objectStorage");
    const servico = new ObjectStorageService();
    await servico.downloadObject(servico.arquivoDoAnexo(id), res, { inline: true, nomeArquivo: `selfie-${id.slice(-8)}` });
  });

  // ── Nota fiscal com a OC + conta do CNPJ (28/10, etapa 5) ─────────────────
  /**
   * Multipart: `arquivo` (PDF ou foto JPG/PNG, até 10 MB), `valorNota`
   * (centavos), `numeroNota?`, `cnpjNota?` (padrão: o CNPJ emissor) e — SÓ
   * quando ainda não há conta nem PIX gravados — a conta do CNPJ: `banco`,
   * `agencia`, `conta`, `tipoConta`, `pixTipo`, `pixChave`, `titular`
   * (gravada pelo MESMO serviço cifrado do DP; a mudança fica pendente de
   * conferência no sino do DP). Grava a `invoices` da prestação com a OC
   * registrada, status "enviada" (ou reenvia a devolvida).
   */
  app.post("/api/colaborador/prestacoes/:actualId/nota-fiscal", async (req, res) => {
    const colab = await requireColaborador(req, res);
    if (!colab) return;
    if (!(await receberArquivoDaNota(req, res))) return;
    const campos = lerCamposDaNota(req.body);
    if ("erro" in campos) return res.status(400).json({ message: campos.erro, campo: campos.campo });
    try {
      const config = await lerConfiguracaoDoBanco();
      const m = await minhaPrestacaoDaNota(req, res, colab, config);
      if (!m) return;
      const nota = await notaDaPrestacao(m.actual.id);
      const pode = podeEnviarNotaDaOc(m.actual, nota);
      if (!pode.ok) return res.status(409).json({ message: pode.motivo, codigo: pode.codigo });

      // A conta do CNPJ: só quando ainda não há conta nem PIX (depois, só o DP muda).
      const corpo = (req.body ?? {}) as Record<string, unknown>;
      const conta: Partial<DadosDePagamento> = {};
      for (const k of ["banco", "agencia", "conta", "pixChave", "titular"] as const) {
        if (typeof corpo[k] === "string" && corpo[k]) conta[k] = String(corpo[k]).slice(0, 200);
      }
      if (typeof corpo.tipoConta === "string" && corpo.tipoConta) {
        if (!(TIPOS_DE_CONTA as readonly string[]).includes(corpo.tipoConta)) return res.status(400).json({ message: "Tipo de conta inválido.", campo: "tipoConta" });
        conta.tipoConta = corpo.tipoConta as DadosDePagamento["tipoConta"];
      }
      if (typeof corpo.pixTipo === "string" && corpo.pixTipo) {
        if (!(TIPOS_DE_PIX as readonly string[]).includes(corpo.pixTipo)) return res.status(400).json({ message: "Tipo da chave PIX inválido.", campo: "pixTipo" });
        conta.pixTipo = corpo.pixTipo as DadosDePagamento["pixTipo"];
      }
      const gravado = await obterPagamento(colab.id);
      if (temContaOuPix(gravado)) {
        if (Object.keys(conta).length > 0) {
          return res.status(409).json({ message: "A sua conta já está cadastrada — para trocar, fale com o DP.", codigo: "conta_ja_cadastrada" });
        }
      } else {
        if (!conta.conta && !conta.pixChave) {
          return res.status(400).json({ message: "Informe a conta bancária (ou o PIX) do CNPJ para receber.", codigo: "conta_obrigatoria", campo: "conta" });
        }
        const r = await gravarDadosDePagamento({
          colaborador: colab, versao: gravado?.versao ?? 0, enviado: conta,
          autor: { id: `colaborador:${colab.id}`, name: nomeNaAuditoria(colab) }, req,
        });
        if (!r.ok) return res.status(r.status).json(r.corpo);
      }

      const gravada = await enviarNotaDaPrestacao({ req, res, actual: m.actual, nota, campos: campos.campos, ator: null, nomeDoAtor: nomeNaAuditoria(colab) });
      if (!gravada) return;
      const hoje = diaEmBrasilia();
      res.status(nota ? 200 : 201).json({ prestacao: prestacaoDoColaborador(m, hoje, { nota: gravada, conta: await contaDoPortal(colab.id), prazos: await lerPrazosDoBanco() }) });
    } catch (error) {
      responderErroComStatus(res, error, "Não foi possível enviar a nota agora. Tente de novo.", 500);
    }
  });

  /**
   * O arquivo da PRÓPRIA nota fiscal (para conferir o que foi enviado).
   * 28/10 (S9): só o que ele enviou ou o DP/produção enviou para AQUELA
   * prestação — nunca selfie, contrato ou arquivo de outra nota.
   */
  app.get("/api/colaborador/prestacoes/:actualId/nota-fiscal/arquivo", async (req, res) => {
    const colab = await requireColaborador(req, res);
    if (!colab) return;
    const m = await minhaPrestacaoDaNota(req, res, colab, await lerConfiguracaoDoBanco());
    if (!m) return;
    const nota = await notaDaPrestacao(m.actual.id);
    const id = await anexoDaNotaParaOColaborador(nota, m.actual.id, colab.id);
    if (!id) return res.status(404).json({ message: "Nota fiscal não encontrada." });
    const { ObjectStorageService } = await import("../objectStorage");
    const servico = new ObjectStorageService();
    await servico.downloadObject(servico.arquivoDoAnexo(id), res, { inline: true, nomeArquivo: nota?.attachmentName || "nota-fiscal" });
  });
}
