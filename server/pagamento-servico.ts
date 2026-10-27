/**
 * Dados de pagamento do colaborador — o SERVIÇO cifrado (28/10, Fase 2 dos
 * Honorários). Saiu de server/routes/pagamento-colaborador.ts para que o DP
 * (PUT /api/colaboradores/:id/pagamento) e o colaborador no portal (envio da
 * NF com a conta do CNPJ, só quando ainda não há dados) gravem pelo MESMO
 * caminho: cifra (AES-256-GCM, server/cripto-pagamento.ts), versão otimista,
 * alteração mascarada (mudança de conta fica pendente de conferência do DP) e
 * auditoria sem o dado em claro.
 */
import type { Request } from "express";
import { createAuditLog } from "./routes/_compartilhado";
import * as dados from "./storage/contratos";
import { chaveConfigurada, cifrar, decifrar, ChaveDePagamentoAusente } from "./cripto-pagamento";
import {
  CAMPOS_CIFRADOS, PAGAMENTO_VAZIO, TIPOS_DE_CONTA, TIPOS_DE_PIX, camposAlterados, mudouAConta,
  normalizarPagamento, pagamentoMascarado, validarPagamento,
  type CampoCifrado, type DadosDePagamento, type TipoDeConta, type TipoDePix,
} from "@shared/pagamento";
import type { ColaboradorPagamento, Collaborator } from "@shared/schema";

export const MOTIVO_ILEGIVEL: Record<"sem_chave" | "outra_chave" | "corrompido", string> = {
  sem_chave: "A chave de criptografia não está configurada.",
  outra_chave: "Gravado com outra chave de criptografia — digite de novo.",
  corrompido: "O valor gravado não pôde ser lido — digite de novo.",
};

const COLUNA_CIFRADA: Record<CampoCifrado, "bancoCifrado" | "agenciaCifrada" | "contaCifrada" | "pixChaveCifrada"> = {
  banco: "bancoCifrado",
  agencia: "agenciaCifrada",
  conta: "contaCifrada",
  pixChave: "pixChaveCifrada",
};

export interface Decifrado {
  dados: DadosDePagamento;
  ilegiveis: { campo: CampoCifrado; motivo: keyof typeof MOTIVO_ILEGIVEL }[];
}

export function decifrarPagamento(p: ColaboradorPagamento | null, collaboratorId: string): Decifrado {
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

/** Há conta ou PIX gravados (mesmo que ilegíveis sem a chave)? */
export const temContaOuPix = (p: ColaboradorPagamento | null): boolean =>
  !!p && (!!p.contaCifrada || !!p.pixChaveCifrada);

/** Valor provisório (válido) de um campo cifrado que existe mas não pôde ser lido. */
const PROVISORIO: Record<CampoCifrado, string> = { banco: "000", agencia: "0", conta: "0", pixChave: "provisorio@chave.invalida" };

const MSG_SEM_CHAVE = "Banco, agência, conta e PIX estão desabilitados: falta configurar a chave de criptografia (PAGAMENTO_CHAVE).";
const MSG_VERSAO = "Os dados de pagamento foram alterados por outra pessoa enquanto você editava. Recarregue e confira.";

export type ResultadoDaGravacao =
  | { ok: true; semMudanca: true; versao: number }
  | { ok: true; semMudanca: false; versao: number; mudouConta: boolean; campos: (keyof DadosDePagamento)[] }
  | { ok: false; status: number; corpo: Record<string, unknown> };

/**
 * Grava os dados de pagamento. Campo AUSENTE de `enviado` = manter; `null`
 * ou "" = apagar. `versao` é a que a tela leu (0 = primeiro cadastro).
 * `auditoriaUserId`: o usuário interno (o colaborador do portal não é um
 * usuário — vai sem id, com o nome em `autor.name`).
 */
export async function gravarDadosDePagamento(a: {
  colaborador: Collaborator;
  versao: number;
  enviado: Partial<DadosDePagamento>;
  autor: dados.Autor;
  auditoriaUserId?: string;
  req: Request;
}): Promise<ResultadoDaGravacao> {
  const { colaborador, enviado, autor, req } = a;
  const gravado = await dados.obterPagamento(colaborador.id);
  if ((gravado?.versao ?? 0) !== a.versao) return { ok: false, status: 409, corpo: { message: MSG_VERSAO, codigo: "versao" } };
  const atual = decifrarPagamento(gravado, colaborador.id);
  const ilegivel: CampoCifrado[] = atual.ilegiveis.map((i) => i.campo);
  const temChave = chaveConfigurada();

  // Ausente = manter; cifrado ilegível e ausente = manter o que está gravado.
  const mandouCifrado = CAMPOS_CIFRADOS.some((c) => enviado[c] !== undefined);
  if (mandouCifrado && !temChave) return { ok: false, status: 503, corpo: { message: MSG_SEM_CHAVE, codigo: "sem_chave" } };
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
  if (primeiro) return { ok: false, status: 400, corpo: { message: primeiro[1], campo: primeiro[0], erros } };

  const antesComparavel: DadosDePagamento = { ...atual.dados };
  for (const c of ilegivel) antesComparavel[c] = desconhecidos.includes(c) ? novo[c] : "(ilegível)";
  const campos = camposAlterados(antesComparavel, novo);
  if (campos.length === 0) return { ok: true, semMudanca: true, versao: gravado?.versao ?? 0 };

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
    if (erro instanceof ChaveDePagamentoAusente) return { ok: false, status: 503, corpo: { message: MSG_SEM_CHAVE, codigo: "sem_chave" } };
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

  const salvo = await dados.salvarPagamento(colaborador.id, a.versao, valores, {
    campos, antes: antesMascarado, depois: depoisMascarado, mudaConta,
  }, autor);
  if (!salvo) return { ok: false, status: 409, corpo: { message: MSG_VERSAO, codigo: "versao" } };

  await createAuditLog("update", "colaborador_pagamento", colaborador.id,
    { colaborador: colaborador.fullName, ...depoisMascarado },
    a.auditoriaUserId, autor.name,
    { colaborador: colaborador.fullName, ...antesMascarado },
    req);
  return { ok: true, semMudanca: false, versao: salvo.versao, mudouConta: mudaConta, campos };
}
