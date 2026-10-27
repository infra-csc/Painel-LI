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
import { chaveConfigurada, cifrar, decifrar, ChaveDePagamentoAusente } from "../cripto-pagamento";
import {
  CAMPOS_CIFRADOS, PAGAMENTO_VAZIO, TIPOS_DE_CONTA, TIPOS_DE_PIX, avisosDoPagamento, camposAlterados, mudouAConta,
  normalizarPagamento, pagamentoMascarado, titularBateComRazaoSocial, validarPagamento,
  type CampoCifrado, type DadosDePagamento, type TipoDeConta, type TipoDePix,
} from "@shared/pagamento";
import { mascararCnpj } from "@shared/cnpj";
import { situacaoContratualDoColaborador, situacaoDoContrato } from "@shared/contratos";
import { hojeISO } from "@shared/hoje-sp";
import type { ColaboradorPagamento } from "@shared/schema";

const exigirDp = (req: Request, res: Response) => requireRoles(req, res, FINANCE_ROLES);

const COLUNA_CIFRADA: Record<CampoCifrado, "bancoCifrado" | "agenciaCifrada" | "contaCifrada" | "pixChaveCifrada"> = {
  banco: "bancoCifrado",
  agencia: "agenciaCifrada",
  conta: "contaCifrada",
  pixChave: "pixChaveCifrada",
};

export const MOTIVO_ILEGIVEL: Record<"sem_chave" | "outra_chave" | "corrompido", string> = {
  sem_chave: "A chave de criptografia não está configurada.",
  outra_chave: "Gravado com outra chave de criptografia — digite de novo.",
  corrompido: "O valor gravado não pôde ser lido — digite de novo.",
};

interface Decifrado {
  dados: DadosDePagamento;
  ilegiveis: { campo: CampoCifrado; motivo: keyof typeof MOTIVO_ILEGIVEL }[];
}

function decifrarPagamento(p: ColaboradorPagamento | null, collaboratorId: string): Decifrado {
  if (!p) return { dados: { ...PAGAMENTO_VAZIO }, ilegiveis: [] };
  const d: DadosDePagamento = {
    ...PAGAMENTO_VAZIO,
    tipoConta: (TIPOS_DE_CONTA as readonly string[]).includes(p.tipoConta ?? "") ? (p.tipoConta as TipoDeConta) : null,
    pixTipo: (TIPOS_DE_PIX as readonly string[]).includes(p.pixTipo ?? "") ? (p.pixTipo as TipoDePix) : null,
    titular: p.titular,
    email: p.email,
  };
  const ilegiveis: Decifrado["ilegiveis"] = [];
  for (const campo of CAMPOS_CIFRADOS) {
    const r = decifrar(p[COLUNA_CIFRADA[campo]], `${collaboratorId}:${campo}`);
    if (r.ok) d[campo] = r.valor;
    else ilegiveis.push({ campo, motivo: r.motivo });
  }
  return { dados: d, ilegiveis };
}

/** Valor provisório (válido) de um campo cifrado que existe mas não pôde ser lido. */
const PROVISORIO: Record<CampoCifrado, string> = { banco: "000", agencia: "0", conta: "0", pixChave: "provisorio@chave.invalida" };

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

    const gravado = await dados.obterPagamento(colaborador.id);
    if ((gravado?.versao ?? 0) !== corpo.data.versao) {
      return res.status(409).json({ message: "Os dados de pagamento foram alterados por outra pessoa enquanto você editava. Recarregue e confira.", codigo: "versao" });
    }
    const atual = decifrarPagamento(gravado, colaborador.id);
    const ilegivel: CampoCifrado[] = atual.ilegiveis.map((i) => i.campo);
    const temChave = chaveConfigurada();

    // Ausente = manter; cifrado ilegível e ausente = manter o que está gravado.
    const { versao: _v, ...enviado } = corpo.data;
    const mandouCifrado = CAMPOS_CIFRADOS.some((c) => enviado[c] !== undefined);
    if (mandouCifrado && !temChave) {
      return res.status(503).json({ message: "Banco, agência, conta e PIX estão desabilitados: falta configurar a chave de criptografia (PAGAMENTO_CHAVE).", codigo: "sem_chave" });
    }
    const juntado: DadosDePagamento = { ...atual.dados };
    for (const k of Object.keys(PAGAMENTO_VAZIO) as (keyof DadosDePagamento)[]) {
      if (enviado[k] !== undefined) (juntado as unknown as Record<string, unknown>)[k] = enviado[k];
    }
    // Cifrado ilegível (sem chave / outra chave) e não reenviado: o valor
    // existe mas não o conhecemos. Entra um valor provisório só para a
    // normalização e a validação do resto (ex.: o tipo de conta não cai por
    // "não ter banco"); na gravação, fica o que já estava no banco.
    const desconhecidos: CampoCifrado[] = CAMPOS_CIFRADOS.filter((c) => ilegivel.includes(c) && enviado[c] === undefined);
    for (const c of desconhecidos) juntado[c] = PROVISORIO[c];
    const novo = normalizarPagamento(juntado);
    const erros = validarPagamento(novo);
    for (const c of desconhecidos) delete erros[c];
    const primeiro = Object.entries(erros)[0];
    if (primeiro) return res.status(400).json({ message: primeiro[1], campo: primeiro[0], erros });

    const antesComparavel: DadosDePagamento = { ...atual.dados };
    for (const c of ilegivel) antesComparavel[c] = desconhecidos.includes(c) ? novo[c] : "(ilegível)";
    const campos = camposAlterados(antesComparavel, novo);
    if (campos.length === 0) {
      return res.json({ ok: true, semMudanca: true, versao: gravado?.versao ?? 0 });
    }

    let valores: dados.GravacaoDoPagamento;
    try {
      valores = {
        bancoCifrado: desconhecidos.includes("banco") ? gravado!.bancoCifrado : cifrar(novo.banco, `${colaborador.id}:banco`),
        agenciaCifrada: desconhecidos.includes("agencia") ? gravado!.agenciaCifrada : cifrar(novo.agencia, `${colaborador.id}:agencia`),
        contaCifrada: desconhecidos.includes("conta") ? gravado!.contaCifrada : cifrar(novo.conta, `${colaborador.id}:conta`),
        pixChaveCifrada: desconhecidos.includes("pixChave") ? gravado!.pixChaveCifrada : cifrar(novo.pixChave, `${colaborador.id}:pixChave`),
        tipoConta: novo.tipoConta,
        pixTipo: novo.pixTipo,
        titular: novo.titular,
        email: novo.email,
      };
    } catch (erro) {
      if (erro instanceof ChaveDePagamentoAusente) {
        return res.status(503).json({ message: "Banco, agência, conta e PIX estão desabilitados: falta configurar a chave de criptografia (PAGAMENTO_CHAVE).", codigo: "sem_chave" });
      }
      throw erro;
    }

    const mascaraDe = (d: DadosDePagamento) => {
      const m = pagamentoMascarado(d);
      return Object.fromEntries(campos.map((c) => [c, m[c] ?? null]));
    };
    const antesMascarado = mascaraDe(atual.dados);
    for (const c of ilegivel) if (campos.includes(c)) antesMascarado[c] = "(ilegível)";
    const depoisMascarado = mascaraDe(novo);
    const mudaConta = mudouAConta(campos);

    const salvo = await dados.salvarPagamento(colaborador.id, corpo.data.versao, valores, {
      campos, antes: antesMascarado, depois: depoisMascarado, mudaConta,
    }, autor);
    if (!salvo) return res.status(409).json({ message: "Os dados de pagamento foram alterados por outra pessoa enquanto você editava. Recarregue e confira.", codigo: "versao" });

    await createAuditLog("update", "colaborador_pagamento", colaborador.id,
      { colaborador: colaborador.fullName, ...depoisMascarado },
      autor.id, autor.name,
      { colaborador: colaborador.fullName, ...antesMascarado },
      req);
    res.json({ ok: true, versao: salvo.versao, mudouConta: mudaConta, campos });
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
