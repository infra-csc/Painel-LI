/**
 * Contratos (CNPJ) — rotas (26/10, Fase 0 do Módulo de Honorários).
 *
 * Só o DP (admin + financial — ROLE_GROUPS.financeiro) lê e grava; os outros
 * papéis levam 403 em TODAS as rotas daqui. Ordem das respostas (padrão do
 * app): 401 → 403 → 400 (dados) → 404 → 409 (estado/versão/duplicado).
 *
 *  GET    /api/contratos                       lista com situação e vínculos
 *  GET    /api/contratos/situacao              sinal "contrato ativo" por colaborador
 *                                              (?colaboradores=a,b&data= ou ?eventId=)
 *  POST   /api/contratos/importacao/previa     prévia da planilha (NÃO grava)
 *  POST   /api/contratos/importacao/confirmar  grava o que a prévia mostrou
 *  POST   /api/contratos/aprovacao-automatica[?simular=1]
 *                                              aprovar fornecedores pelo histórico (28/10)
 *  GET    /api/contratos/:id                   contrato + histórico
 *  POST   /api/contratos                       cria
 *  PATCH  /api/contratos/:id                   edita (com `versao`)
 *  POST   /api/contratos/:id/encerrar|reativar
 *  POST   /api/contratos/:id/colaboradores/:cid   vincula (a partir do cadastro do colaborador)
 *  DELETE /api/contratos/:id/colaboradores/:cid   desvincula
 *  POST   /api/contratos/:id/anexo             anexo do contrato (multipart, campo "file")
 *  DELETE /api/contratos/:id/anexo
 *
 * O CNPJ sem contrato ativo vira pendência que TRAVA A OC (decisão do dono,
 * 26/10) — a OC é da Fase 2; aqui só a regra (shared/contratos.ts) e o sinal.
 */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { createAuditLog, primeiraMensagemDoZod, requireRoles, upload, FINANCE_ROLES } from "./_compartilhado";
import { cnpjValido, digitosDoCnpj, erroDoCnpj, mascararCnpj } from "@shared/cnpj";
import {
  CONTRATO_OBSERVACAO_MAX, CONTRATO_TEXTO_MAX, TIPOS_DE_CONTRATO, TIPO_DE_CONTRATO_LABEL, diasParaVencer, erroDaVigencia,
  situacaoContratualDoColaborador, situacaoDoContrato, vigenciaEmTexto, type SituacaoContratualDoColaborador, type SituacaoDoContrato, type TipoDeContrato,
} from "@shared/contratos";
import {
  CAMPOS_DA_IMPORTACAO, IMPORTACAO_MAX_COLUNAS, IMPORTACAO_MAX_LINHAS, erroDoMapeamento, preverImportacao, type Mapeamento,
} from "@shared/importacao-contratos";
import { hojeISO } from "@shared/hoje-sp";
import type { Contrato } from "@shared/schema";
import * as dados from "../storage/contratos";
import type { ContratoComColaboradores } from "../storage/contratos";
import { storage } from "../storage";
import { aprovarPeloHistorico } from "../fornecedor-automatico";

// ── Formato devolvido ───────────────────────────────────────────────────────

export interface ContratoDaApi extends Omit<ContratoComColaboradores, "createdAt" | "updatedAt" | "encerradoEm"> {
  cnpjFormatado: string;
  situacao: SituacaoDoContrato;
  diasParaVencer: number | null;
  createdAt: string;
  updatedAt: string;
  encerradoEm: string | null;
}

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

function paraApi(c: ContratoComColaboradores, hoje: string): ContratoDaApi {
  return {
    ...c,
    cnpjFormatado: mascararCnpj(c.cnpj),
    situacao: situacaoDoContrato(c, hoje),
    diasParaVencer: diasParaVencer(c, hoje),
    createdAt: iso(c.createdAt)!,
    updatedAt: iso(c.updatedAt)!,
    encerradoEm: iso(c.encerradoEm),
  };
}

// ── Validação ───────────────────────────────────────────────────────────────

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const textoOpcional = (max: number) => z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? v.trim().replace(/\s+/g, " ") : v),
  z.string().max(max, `Texto longo demais (máx. ${max}).`).nullable().optional(),
);
const dataOpcional = z.preprocess(
  (v) => (v === "" ? null : v),
  z.string().regex(RE_DATA, "Data inválida (use AAAA-MM-DD).").nullable().optional(),
);

const camposDoContrato = {
  cnpj: z.string({ required_error: "Informe o CNPJ." }),
  razaoSocial: z.string({ required_error: "Informe a razão social." }).trim().min(1, "Informe a razão social.").max(CONTRATO_TEXTO_MAX, "Razão social longa demais."),
  nomeFantasia: textoOpcional(CONTRATO_TEXTO_MAX),
  tipo: z.enum(TIPOS_DE_CONTRATO, { errorMap: () => ({ message: "Tipo deve ser MEI, Empresa ou Empreiteira." }) }),
  vigenciaInicio: dataOpcional,
  vigenciaFim: dataOpcional,
  observacao: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().max(CONTRATO_OBSERVACAO_MAX, "Observação longa demais.").nullable().optional()),
  colaboradorIds: z.array(z.string().min(1)).max(500, "Vínculos demais num contrato só.").optional(),
};
const corpoNovo = z.object(camposDoContrato).strict();
const corpoEdicao = z.object({ ...camposDoContrato, versao: z.number().int().positive() }).partial().required({ versao: true }).strict();

const corpoPrevia = z.object({
  nomeDoArquivo: z.string().max(200).optional(),
  /** Linhas SEM o cabeçalho; cada célula já em texto (o navegador converte datas para AAAA-MM-DD). */
  linhas: z.array(z.array(z.union([z.string(), z.number(), z.null()]).transform((v) => (v == null ? "" : String(v)))).max(IMPORTACAO_MAX_COLUNAS))
    .max(IMPORTACAO_MAX_LINHAS, `A planilha passa de ${IMPORTACAO_MAX_LINHAS} linhas — divida em partes.`),
  colunas: z.number().int().min(1).max(IMPORTACAO_MAX_COLUNAS),
  mapeamento: z.record(z.enum(CAMPOS_DA_IMPORTACAO), z.number().int().min(0)),
});
const corpoConfirmacao = corpoPrevia.extend({ assinatura: z.string().min(1).max(32) });

const corpoEncerrar = z.object({
  versao: z.number().int().positive(),
  motivo: z.string({ required_error: "Diga o motivo do encerramento." }).trim().min(3, "Diga o motivo do encerramento.").max(500),
});
const corpoReativar = z.object({ versao: z.number().int().positive() });

// ── Rotas ───────────────────────────────────────────────────────────────────

const exigirDp = (req: Request, res: Response) => requireRoles(req, res, FINANCE_ROLES);

const MSG_VERSAO = "Este contrato foi alterado por outra pessoa enquanto você editava. Recarregue e tente de novo.";

export function registrarContratos(app: Express): void {
  app.get("/api/contratos", async (req, res) => {
    if (!(await exigirDp(req, res))) return;
    const hoje = hojeISO();
    const lista = await dados.listarContratos();
    res.set("Cache-Control", "no-store");
    res.json({ hoje, contratos: lista.map((c) => paraApi(c, hoje)) });
  });

  /**
   * Sinal "contrato ativo" por colaborador. `?eventId=` usa os colaboradores
   * com vaga no evento e a data de FIM do evento (o check-out final da ata);
   * `?colaboradores=a,b` usa `?data=` (padrão: hoje).
   */
  app.get("/api/contratos/situacao", async (req, res) => {
    if (!(await exigirDp(req, res))) return;
    let ids: string[] = [];
    let data = typeof req.query.data === "string" && RE_DATA.test(req.query.data) ? req.query.data : hojeISO();
    const eventId = typeof req.query.eventId === "string" ? req.query.eventId : "";
    if (eventId) {
      const evento = await storage.getEvent(eventId);
      if (!evento) return res.status(404).json({ message: "Evento não encontrado." });
      ids = await dados.colaboradoresDoEvento(eventId);
      if (typeof req.query.data !== "string" && evento.endDate) data = String(evento.endDate).slice(0, 10);
    } else if (typeof req.query.colaboradores === "string") {
      ids = req.query.colaboradores.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 1000);
    } else {
      return res.status(400).json({ message: "Informe ?colaboradores= ou ?eventId=." });
    }
    const porColaborador = await dados.contratosDosColaboradores(ids);
    const situacoes: Record<string, { situacao: SituacaoContratualDoColaborador; contratos: { id: string; cnpj: string; razaoSocial: string; situacao: SituacaoDoContrato }[] }> = {};
    for (const id of ids) {
      const deles = porColaborador.get(id) ?? [];
      situacoes[id] = {
        situacao: situacaoContratualDoColaborador(deles, data),
        contratos: deles.map((c) => ({ id: c.id, cnpj: mascararCnpj(c.cnpj), razaoSocial: c.razaoSocial, situacao: situacaoDoContrato(c, data) })),
      };
    }
    res.set("Cache-Control", "no-store");
    res.json({ data, situacoes });
  });

  app.post("/api/contratos/importacao/previa", async (req, res) => {
    if (!(await exigirDp(req, res))) return;
    const corpo = corpoPrevia.safeParse(req.body);
    if (!corpo.success) return res.status(400).json({ message: primeiraMensagemDoZod(corpo.error, "Planilha inválida.") });
    const mapeamento = corpo.data.mapeamento as Mapeamento;
    const erroMap = erroDoMapeamento(mapeamento, corpo.data.colunas);
    if (erroMap) return res.status(400).json({ message: erroMap });
    const { existentes, colaboradores } = await dados.dadosParaImportacao();
    const previa = preverImportacao(corpo.data.linhas, mapeamento, existentes, colaboradores);
    res.set("Cache-Control", "no-store");
    // A prévia devolve as LINHAS (o que a tela mostra) e a assinatura; as
    // operações ficam no servidor (recalculadas na confirmação).
    res.json({ linhas: previa.linhas, contagem: previa.contagem, contratos: previa.contratos, assinatura: previa.assinatura });
  });

  app.post("/api/contratos/importacao/confirmar", async (req, res) => {
    const autor = await exigirDp(req, res);
    if (!autor) return;
    const corpo = corpoConfirmacao.safeParse(req.body);
    if (!corpo.success) return res.status(400).json({ message: primeiraMensagemDoZod(corpo.error, "Planilha inválida.") });
    const mapeamento = corpo.data.mapeamento as Mapeamento;
    const erroMap = erroDoMapeamento(mapeamento, corpo.data.colunas);
    if (erroMap) return res.status(400).json({ message: erroMap });
    const { existentes, colaboradores } = await dados.dadosParaImportacao();
    const previa = preverImportacao(corpo.data.linhas, mapeamento, existentes, colaboradores);
    if (previa.assinatura !== corpo.data.assinatura) {
      return res.status(409).json({ message: "O cadastro de contratos mudou desde a prévia. Gere a prévia de novo antes de confirmar.", codigo: "previa_desatualizada" });
    }
    if (previa.operacoes.length === 0) {
      return res.status(400).json({ message: "Nada para gravar: nenhuma linha nova ou com mudança." });
    }
    const mudancas = new Map<string, string[]>();
    for (const op of previa.operacoes) {
      const primeira = previa.linhas.find((l) => op.linhas.includes(l.linha) && l.mudancas.length > 0);
      if (primeira) mudancas.set(op.cnpj, primeira.mudancas);
    }
    const nomeDoArquivo = (corpo.data.nomeDoArquivo || "planilha").slice(0, 120);
    try {
      const r = await dados.aplicarImportacao(previa.operacoes, mudancas, nomeDoArquivo, autor);
      await createAuditLog("import", "contrato", "importacao", {
        arquivo: nomeDoArquivo, criados: r.criados, atualizados: r.atualizados, vinculos: r.vinculos,
        linhasComErro: previa.contagem.erros, linhas: previa.contagem.total,
      }, autor.id, autor.name, undefined, req);
      res.json({
        ...r,
        linhasComErro: previa.contagem.erros,
        repetidas: previa.contagem.repetidas,
        semMudanca: previa.contagem.semMudanca,
        erros: previa.linhas.filter((l) => l.acao === "erro").map((l) => ({ linha: l.linha, cnpj: l.cnpj, erros: l.erros })),
      });
    } catch (erro) {
      if (violaUnicidade(erro)) {
        return res.status(409).json({ message: "Um dos CNPJs foi cadastrado por outra pessoa durante a importação. Gere a prévia de novo." });
      }
      throw erro;
    }
  });

  /**
   * 28/10 — "Aprovar fornecedores pelo histórico": varredura única do passado
   * (CNPJ que já teve OC, nota aprovada ou pagamento vira contrato ativo).
   * `?simular=1` = prévia, NÃO grava. Regra em shared/fornecedor-automatico.ts.
   */
  app.post("/api/contratos/aprovacao-automatica", async (req, res) => {
    const autor = await exigirDp(req, res);
    if (!autor) return;
    const simular = req.query.simular === "1" || req.query.simular === "true";
    const r = await aprovarPeloHistorico({ simular }, autor, req);
    res.set("Cache-Control", "no-store");
    res.json(r);
  });

  app.get("/api/contratos/:id", async (req, res) => {
    if (!(await exigirDp(req, res))) return;
    const c = await dados.obterContrato(req.params.id);
    if (!c) return res.status(404).json({ message: "Contrato não encontrado." });
    const historico = await dados.historicoDoContrato(c.id);
    res.set("Cache-Control", "no-store");
    res.json({ contrato: paraApi(c, hojeISO()), historico: historico.map((h) => ({ ...h, em: iso(h.em) })) });
  });

  app.post("/api/contratos", async (req, res) => {
    const autor = await exigirDp(req, res);
    if (!autor) return;
    const corpo = corpoNovo.safeParse(req.body);
    if (!corpo.success) return res.status(400).json({ message: primeiraMensagemDoZod(corpo.error) });
    const d = corpo.data;
    const erroCnpj = erroDoCnpj(d.cnpj) ?? (digitosDoCnpj(d.cnpj) ? null : "Informe o CNPJ.");
    if (erroCnpj) return res.status(400).json({ message: erroCnpj, campo: "cnpj" });
    const erroVig = erroDaVigencia(d.vigenciaInicio, d.vigenciaFim);
    if (erroVig) return res.status(400).json({ message: erroVig, campo: "vigenciaFim" });
    const ids = d.colaboradorIds ?? [];
    if ((await dados.colaboradoresExistem(ids)).length !== new Set(ids).size) {
      return res.status(400).json({ message: "Algum colaborador escolhido não existe mais. Recarregue a lista." });
    }
    const cnpj = digitosDoCnpj(d.cnpj);
    const jaExiste = await dados.contratoPorCnpj(cnpj);
    if (jaExiste) return res.status(409).json({ message: `Já existe contrato para o CNPJ ${mascararCnpj(cnpj)} (${jaExiste.razaoSocial}).`, contratoId: jaExiste.id, campo: "cnpj" });
    try {
      const c = await dados.criarContrato({
        cnpj, razaoSocial: d.razaoSocial, nomeFantasia: d.nomeFantasia ?? null, tipo: d.tipo,
        vigenciaInicio: d.vigenciaInicio ?? null, vigenciaFim: d.vigenciaFim ?? null, observacao: d.observacao ?? null,
      }, ids, autor);
      await createAuditLog("create", "contrato", c.id, resumoParaAuditoria(c), autor.id, autor.name, undefined, req);
      res.status(201).json(paraApi(c, hojeISO()));
    } catch (erro) {
      if (violaUnicidade(erro)) {
        return res.status(409).json({ message: `Já existe contrato para o CNPJ ${mascararCnpj(cnpj)}.`, campo: "cnpj" });
      }
      throw erro;
    }
  });

  app.patch("/api/contratos/:id", async (req, res) => {
    const autor = await exigirDp(req, res);
    if (!autor) return;
    const corpo = corpoEdicao.safeParse(req.body);
    if (!corpo.success) return res.status(400).json({ message: primeiraMensagemDoZod(corpo.error) });
    const atual = await dados.obterContrato(req.params.id);
    if (!atual) return res.status(404).json({ message: "Contrato não encontrado." });
    const d = corpo.data;
    const mudar: Partial<dados.DadosDoContrato> = {};
    if (d.cnpj !== undefined) {
      const cnpj = digitosDoCnpj(d.cnpj);
      if (!cnpjValido(cnpj)) return res.status(400).json({ message: erroDoCnpj(d.cnpj) ?? "Informe o CNPJ.", campo: "cnpj" });
      if (cnpj !== atual.cnpj) {
        const outro = await dados.contratoPorCnpj(cnpj);
        if (outro) return res.status(409).json({ message: `Já existe contrato para o CNPJ ${mascararCnpj(cnpj)} (${outro.razaoSocial}).`, campo: "cnpj" });
        mudar.cnpj = cnpj;
      }
    }
    if (d.razaoSocial !== undefined) mudar.razaoSocial = d.razaoSocial;
    if (d.nomeFantasia !== undefined) mudar.nomeFantasia = d.nomeFantasia ?? null;
    if (d.tipo !== undefined) mudar.tipo = d.tipo;
    if (d.vigenciaInicio !== undefined) mudar.vigenciaInicio = d.vigenciaInicio ?? null;
    if (d.vigenciaFim !== undefined) mudar.vigenciaFim = d.vigenciaFim ?? null;
    if (d.observacao !== undefined) mudar.observacao = d.observacao ?? null;
    const inicio = "vigenciaInicio" in mudar ? mudar.vigenciaInicio : atual.vigenciaInicio;
    const fim = "vigenciaFim" in mudar ? mudar.vigenciaFim : atual.vigenciaFim;
    const erroVig = erroDaVigencia(inicio, fim);
    if (erroVig) return res.status(400).json({ message: erroVig, campo: "vigenciaFim" });
    if (d.colaboradorIds && (await dados.colaboradoresExistem(d.colaboradorIds)).length !== new Set(d.colaboradorIds).size) {
      return res.status(400).json({ message: "Algum colaborador escolhido não existe mais. Recarregue a lista." });
    }
    const notas = descreverMudancas(atual, mudar);
    try {
      const c = await dados.editarContrato(atual.id, d.versao, mudar, d.colaboradorIds, notas, autor);
      if (!c) return res.status(409).json({ message: MSG_VERSAO, codigo: "versao" });
      await createAuditLog("update", "contrato", c.id, resumoParaAuditoria(c), autor.id, autor.name, resumoParaAuditoria(atual), req);
      res.json(paraApi(c, hojeISO()));
    } catch (erro) {
      if (violaUnicidade(erro)) return res.status(409).json({ message: "Já existe contrato para este CNPJ.", campo: "cnpj" });
      throw erro;
    }
  });

  app.post("/api/contratos/:id/encerrar", async (req, res) => {
    const autor = await exigirDp(req, res);
    if (!autor) return;
    const corpo = corpoEncerrar.safeParse(req.body);
    if (!corpo.success) return res.status(400).json({ message: primeiraMensagemDoZod(corpo.error) });
    const atual = await dados.obterContrato(req.params.id);
    if (!atual) return res.status(404).json({ message: "Contrato não encontrado." });
    if (atual.encerradoEm) return res.status(409).json({ message: "Este contrato já está encerrado." });
    const c = await dados.encerrarContrato(atual.id, corpo.data.versao, corpo.data.motivo, autor);
    if (!c) return res.status(409).json({ message: MSG_VERSAO, codigo: "versao" });
    await createAuditLog("close", "contrato", c.id, resumoParaAuditoria(c), autor.id, autor.name, resumoParaAuditoria(atual), req);
    res.json(paraApi(c, hojeISO()));
  });

  app.post("/api/contratos/:id/reativar", async (req, res) => {
    const autor = await exigirDp(req, res);
    if (!autor) return;
    const corpo = corpoReativar.safeParse(req.body);
    if (!corpo.success) return res.status(400).json({ message: primeiraMensagemDoZod(corpo.error) });
    const atual = await dados.obterContrato(req.params.id);
    if (!atual) return res.status(404).json({ message: "Contrato não encontrado." });
    if (!atual.encerradoEm) return res.status(409).json({ message: "Este contrato não está encerrado." });
    const c = await dados.reativarContrato(atual.id, corpo.data.versao, autor);
    if (!c) return res.status(409).json({ message: MSG_VERSAO, codigo: "versao" });
    await createAuditLog("reactivate", "contrato", c.id, resumoParaAuditoria(c), autor.id, autor.name, resumoParaAuditoria(atual), req);
    res.json(paraApi(c, hojeISO()));
  });

  app.post("/api/contratos/:id/colaboradores/:colaboradorId", async (req, res) => {
    const autor = await exigirDp(req, res);
    if (!autor) return;
    const contrato = await dados.obterContrato(req.params.id);
    if (!contrato) return res.status(404).json({ message: "Contrato não encontrado." });
    const colaborador = await storage.getCollaborator(req.params.colaboradorId);
    if (!colaborador) return res.status(404).json({ message: "Colaborador não encontrado." });
    const fez = await dados.vincularColaborador(contrato.id, colaborador.id, colaborador.fullName, autor);
    if (fez) await createAuditLog("link", "contrato", contrato.id, { cnpj: mascararCnpj(contrato.cnpj), colaborador: colaborador.fullName }, autor.id, autor.name, undefined, req);
    res.json(paraApi((await dados.obterContrato(contrato.id))!, hojeISO()));
  });

  app.delete("/api/contratos/:id/colaboradores/:colaboradorId", async (req, res) => {
    const autor = await exigirDp(req, res);
    if (!autor) return;
    const contrato = await dados.obterContrato(req.params.id);
    if (!contrato) return res.status(404).json({ message: "Contrato não encontrado." });
    const vinculado = contrato.colaboradores.find((c) => c.id === req.params.colaboradorId);
    if (!vinculado) return res.status(404).json({ message: "Este colaborador não está vinculado ao contrato." });
    await dados.desvincularColaborador(contrato.id, vinculado.id, vinculado.fullName, autor);
    await createAuditLog("unlink", "contrato", contrato.id, { cnpj: mascararCnpj(contrato.cnpj), colaborador: vinculado.fullName }, autor.id, autor.name, undefined, req);
    res.json(paraApi((await dados.obterContrato(contrato.id))!, hojeISO()));
  });

  app.post("/api/contratos/:id/anexo", upload.single("file"), async (req, res) => {
    const autor = await exigirDp(req, res);
    if (!autor) return;
    const contrato = await dados.obterContrato(req.params.id);
    if (!contrato) return res.status(404).json({ message: "Contrato não encontrado." });
    const arquivo = req.file;
    if (!arquivo) return res.status(400).json({ message: "Nenhum arquivo enviado." });
    const { tipoPermitidoDoArquivo, sanitizarNomeDeArquivo } = await import("../objectAcl");
    const tipo = tipoPermitidoDoArquivo(arquivo.buffer, arquivo.mimetype, arquivo.originalname);
    if (!tipo || !tipo.inline) {
      return res.status(415).json({ message: "O contrato precisa ser PDF ou imagem (PNG/JPG)." });
    }
    const { ObjectStorageService, novoIdDeAnexo } = await import("../objectStorage");
    const id = novoIdDeAnexo();
    const nome = sanitizarNomeDeArquivo(arquivo.originalname, tipo);
    try {
      await new ObjectStorageService().enviarAnexo(id, arquivo.buffer, tipo.contentType, { ownerId: autor.id, nomeOriginal: nome, classe: "contrato" });
    } catch (erro) {
      console.error("[contratos] falha ao gravar o anexo:", erro instanceof Error ? erro.message : erro);
      return res.status(503).json({ message: "O armazenamento de arquivos não respondeu. O contrato continua salvo; tente anexar de novo." });
    }
    const c = await dados.definirAnexo(contrato.id, { id, nome }, autor);
    await createAuditLog("attach", "contrato", contrato.id, { cnpj: mascararCnpj(contrato.cnpj), anexo: nome }, autor.id, autor.name, undefined, req);
    res.json(paraApi(c!, hojeISO()));
  });

  app.delete("/api/contratos/:id/anexo", async (req, res) => {
    const autor = await exigirDp(req, res);
    if (!autor) return;
    const contrato = await dados.obterContrato(req.params.id);
    if (!contrato) return res.status(404).json({ message: "Contrato não encontrado." });
    if (!contrato.anexoId) return res.status(404).json({ message: "Este contrato não tem anexo." });
    const c = await dados.definirAnexo(contrato.id, null, autor);
    await createAuditLog("detach", "contrato", contrato.id, { cnpj: mascararCnpj(contrato.cnpj), anexo: contrato.anexoNome }, autor.id, autor.name, undefined, req);
    res.json(paraApi(c!, hojeISO()));
  });
}

// ── Auxiliares ──────────────────────────────────────────────────────────────


function descreverMudancas(atual: Contrato, mudar: Partial<dados.DadosDoContrato>): string[] {
  const notas: string[] = [];
  if (mudar.cnpj && mudar.cnpj !== atual.cnpj) notas.push(`CNPJ: ${mascararCnpj(atual.cnpj)} → ${mascararCnpj(mudar.cnpj)}`);
  if (mudar.razaoSocial !== undefined && mudar.razaoSocial !== atual.razaoSocial) notas.push(`Razão social: ${atual.razaoSocial} → ${mudar.razaoSocial}`);
  if (mudar.nomeFantasia !== undefined && (mudar.nomeFantasia ?? null) !== (atual.nomeFantasia ?? null)) notas.push(`Nome fantasia: ${atual.nomeFantasia ?? "—"} → ${mudar.nomeFantasia ?? "—"}`);
  if (mudar.tipo !== undefined && mudar.tipo !== atual.tipo) {
    notas.push(`Tipo: ${TIPO_DE_CONTRATO_LABEL[atual.tipo as TipoDeContrato] ?? atual.tipo} → ${TIPO_DE_CONTRATO_LABEL[mudar.tipo as TipoDeContrato] ?? mudar.tipo}`);
  }
  const ini = mudar.vigenciaInicio !== undefined ? mudar.vigenciaInicio : atual.vigenciaInicio;
  const fim = mudar.vigenciaFim !== undefined ? mudar.vigenciaFim : atual.vigenciaFim;
  if ((ini ?? null) !== (atual.vigenciaInicio ?? null) || (fim ?? null) !== (atual.vigenciaFim ?? null)) {
    notas.push(`Vigência: ${vigenciaEmTexto(atual.vigenciaInicio, atual.vigenciaFim)} → ${vigenciaEmTexto(ini, fim)}`);
  }
  if (mudar.observacao !== undefined && (mudar.observacao ?? null) !== (atual.observacao ?? null)) notas.push("Observação alterada.");
  return notas;
}

/** O que vai para o log de auditoria do sistema (sem anexos nem ids técnicos). */
function resumoParaAuditoria(c: ContratoComColaboradores) {
  return {
    cnpj: mascararCnpj(c.cnpj),
    razaoSocial: c.razaoSocial,
    nomeFantasia: c.nomeFantasia,
    tipo: TIPO_DE_CONTRATO_LABEL[c.tipo as TipoDeContrato] ?? c.tipo,
    vigenciaInicio: c.vigenciaInicio,
    vigenciaFim: c.vigenciaFim,
    encerrado: !!c.encerradoEm,
    origem: c.origem,
    colaboradores: c.colaboradores.map((x) => x.fullName).join(", "),
  };
}

/** Violação de UNIQUE (23505), direta ou embrulhada pelo drizzle (`cause`). */
function violaUnicidade(erro: unknown): boolean {
  const e = erro as { code?: unknown; cause?: { code?: unknown } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}
