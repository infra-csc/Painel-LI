/**
 * Dados de pagamento do colaborador — rotas (26/10, Fase 0 do Módulo de
 * Honorários). SÓ o DP (admin + financial): os outros papéis levam 403 aqui
 * e não recebem estes campos em nenhuma outra rota — eles moram numa tabela
 * à parte (`colaboradores_pagamento`) que nenhuma rota de colaborador lê.
 *
 *  GET  /api/colaboradores/:id/pagamento          dados decifrados + CNPJs ligados + avisos
 *  PUT  /api/colaboradores/:id/pagamento          grava (com `versao`; 0 = primeiro cadastro)
 *  GET  /api/pagamento/alteracoes?situacao=pendentes|todas   mudanças (mascaradas)
 *  POST /api/pagamento/alteracoes/:id/conferir    outra pessoa do DP confere
 *  GET  /api/shell/contas-alteradas               contagem do sino
 *
 * PUT: campo AUSENTE do corpo = manter como está (é o que a tela manda para
 * os campos cifrados quando a chave não está configurada ou o valor gravado
 * não decifra); `null` ou "" = apagar.
 */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { createAuditLog, primeiraMensagemDoZod, requireRoles, FINANCE_ROLES } from "./_compartilhado";
import { storage } from "../storage";
import * as dados from "../storage/contratos";
import { chaveConfigurada } from "../cripto-pagamento";
import { MOTIVO_ILEGIVEL, decifrarPagamento, gravarDadosDePagamento } from "../pagamento-servico";
import {
  TIPOS_DE_CONTA, TIPOS_DE_PIX, avisosDoPagamento, titularBateComRazaoSocial, type DadosDePagamento,
} from "@shared/pagamento";
import { mascararCnpj } from "@shared/cnpj";
import { situacaoContratualDoColaborador, situacaoDoContrato } from "@shared/contratos";
import { hojeISO } from "@shared/hoje-sp";

const exigirDp = (req: Request, res: Response) => requireRoles(req, res, FINANCE_ROLES);

// O serviço cifrado mora em server/pagamento-servico.ts (28/10): o portal do
// colaborador grava pelo MESMO caminho.
export { MOTIVO_ILEGIVEL };

const textoOuNulo =z.union([z.string().max(200), z.null()]).optional();
const corpoDoPagamento = z.object({
  versao: z.number().int().min(0),
  banco: textoOuNulo,
  agencia: textoOuNulo,
  conta: textoOuNulo,
  tipoConta: z.union([z.enum(TIPOS_DE_CONTA), z.null()]).optional(),
  pixTipo: z.union([z.enum(TIPOS_DE_PIX), z.null()]).optional(),
  pixChave: textoOuNulo,
  titular: textoOuNulo,
  email: z.union([z.string().max(254), z.null()]).optional(),
}).strict();

export function registrarPagamentoColaborador(app: Express): void {
  app.get("/api/colaboradores/:id/pagamento", async (req, res) => {
    const leitor = await exigirDp(req, res);
    if (!leitor) return;
    const colaborador = await storage.getCollaborator(req.params.id);
    if (!colaborador) return res.status(404).json({ message: "Colaborador não encontrado." });
    const hoje = hojeISO();
    const [gravado, porColaborador, alteracoes] = await Promise.all([
      dados.obterPagamento(colaborador.id),
      dados.contratosDosColaboradores([colaborador.id]),
      dados.listarAlteracoes({ pendentes: false, collaboratorId: colaborador.id, limite: 10 }),
    ]);
    const { dados: pagamento, ilegiveis } = decifrarPagamento(gravado, colaborador.id);
    const contratos = (porColaborador.get(colaborador.id) ?? []).map((c) => ({
      id: c.id, cnpj: mascararCnpj(c.cnpj), razaoSocial: c.razaoSocial, tipo: c.tipo,
      vigenciaInicio: c.vigenciaInicio, vigenciaFim: c.vigenciaFim, situacao: situacaoDoContrato(c, hoje),
    }));
    res.set("Cache-Control", "no-store");
    res.json({
      chaveConfigurada: chaveConfigurada(),
      pagamento: gravado ? { ...pagamento, versao: gravado.versao, atualizadoPorNome: gravado.atualizadoPorNome, updatedAt: gravado.updatedAt } : null,
      ilegiveis: ilegiveis.map((i) => ({ ...i, mensagem: MOTIVO_ILEGIVEL[i.motivo] })),
      contratos,
      situacaoContratual: situacaoContratualDoColaborador(porColaborador.get(colaborador.id) ?? [], hoje),
      avisos: avisosDoTitular(pagamento, contratos).concat(avisosDoPagamento(pagamento)),
      alteracoes: alteracoes.map((a) => ({ id: a.id, campos: a.campos, antes: a.antes, depois: a.depois, mudaConta: a.mudaConta, porNome: a.porNome, em: a.em, conferidoEm: a.conferidoEm, conferidoPorNome: a.conferidoPorNome })),
    });
  });

  app.put("/api/colaboradores/:id/pagamento", async (req, res) => {
    const autor = await exigirDp(req, res);
    if (!autor) return;
    const corpo = corpoDoPagamento.safeParse(req.body);
    if (!corpo.success) return res.status(400).json({ message: primeiraMensagemDoZod(corpo.error, "Dados de pagamento inválidos.") });
    const colaborador = await storage.getCollaborator(req.params.id);
    if (!colaborador) return res.status(404).json({ message: "Colaborador não encontrado." });

    const { versao, ...enviado } = corpo.data;
    const r = await gravarDadosDePagamento({ colaborador, versao, enviado, autor, auditoriaUserId: autor.id, req });
    if (!r.ok) return res.status(r.status).json(r.corpo);
    if (r.semMudanca) return res.json({ ok: true, semMudanca: true, versao: r.versao });
    res.json({ ok: true, versao: r.versao, mudouConta: r.mudouConta, campos: r.campos });
  });

  app.get("/api/pagamento/alteracoes", async (req, res) => {
    const leitor = await exigirDp(req, res);
    if (!leitor) return;
    const pendentes = req.query.situacao !== "todas";
    const lista = await dados.listarAlteracoes({ pendentes, limite: 300 });
    res.set("Cache-Control", "no-store");
    res.json(lista.map((a) => ({
      id: a.id, collaboratorId: a.collaboratorId, colaboradorNome: a.colaboradorNome, colaboradorNumero: a.colaboradorNumero,
      campos: a.campos, antes: a.antes, depois: a.depois, mudaConta: a.mudaConta, porNome: a.porNome, em: a.em,
      conferidoEm: a.conferidoEm, conferidoPorNome: a.conferidoPorNome,
      podeConferir: a.mudaConta && !a.conferidoEm && a.por !== leitor.id,
    })));
  });

  app.post("/api/pagamento/alteracoes/:id/conferir", async (req, res) => {
    const autor = await exigirDp(req, res);
    if (!autor) return;
    const a = await dados.obterAlteracao(req.params.id);
    if (!a) return res.status(404).json({ message: "Alteração não encontrada." });
    if (!a.mudaConta) return res.status(400).json({ message: "Só mudanças de conta ou PIX pedem conferência." });
    if (a.conferidoEm) return res.status(409).json({ message: `Já conferida por ${a.conferidoPorNome ?? "outra pessoa"}.` });
    if (a.por === autor.id) return res.status(403).json({ message: "Quem alterou a conta não confere a própria alteração — peça a outra pessoa do DP." });
    const ok = await dados.conferirAlteracao(a.id, autor);
    if (!ok) return res.status(409).json({ message: "Esta alteração acabou de ser conferida por outra pessoa." });
    await createAuditLog("review", "colaborador_pagamento", a.collaboratorId, { conferida: "sim", campos: a.campos.join(", ") }, autor.id, autor.name, undefined, req);
    res.json({ ok: true });
  });

  /** Sino do DP: mudanças de conta/PIX feitas por OUTRA pessoa, ainda não conferidas. */
  app.get("/api/shell/contas-alteradas", async (req, res) => {
    const leitor = await exigirDp(req, res);
    if (!leitor) return;
    res.set("Cache-Control", "no-store");
    res.json(await dados.contarAlteracoesPendentes(leitor.id));
  });
}

/** Aviso quando o titular da conta não bate com a razão social de nenhum CNPJ ligado. */
function avisosDoTitular(p: DadosDePagamento, contratos: { razaoSocial: string; cnpj: string }[]): string[] {
  if (!p.titular || contratos.length === 0) return [];
  if (contratos.some((c) => titularBateComRazaoSocial(p.titular, c.razaoSocial))) return [];
  const razoes = contratos.map((c) => c.razaoSocial).join("; ");
  return [`O titular da conta (${p.titular}) não bate com a razão social do CNPJ (${razoes}). Confira antes de pagar.`];
}
