/**
 * Contratos (CNPJ) e dados de pagamento do colaborador (26/10) — acesso a
 * dados. Regras em shared/contratos.ts, shared/pagamento.ts e
 * shared/importacao-contratos.ts; autorização e HTTP em
 * server/routes/contratos.ts e server/routes/pagamento-colaborador.ts.
 *
 * Fora do objeto `storage` (como honorários e trocas): só as rotas do módulo
 * leem estas funções. Nenhuma rota de colaborador (lista, integração,
 * exportação) toca `colaboradores_pagamento` — é isso que impede vazamento.
 *
 * Toda edição de contrato é guardada por `versao` (UPDATE … WHERE versao = x):
 * zero linhas = alguém mudou antes (a rota responde 409). O histórico é
 * gravado na mesma transação.
 */
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { db } from "../db";
import {
  collaborators, contratos, contratosColaboradores, contratosHistorico, colaboradoresPagamento, colaboradoresPagamentoAlteracoes, teamInclusions,
  type Contrato, type ContratoHistorico, type ColaboradorPagamento, type ColaboradorPagamentoAlteracao,
} from "@shared/schema";
import type { ColaboradorParaImportacao, ContratoExistente, OperacaoDaImportacao } from "@shared/importacao-contratos";
import { digitosDoCpf, cpfValido } from "@shared/pagamento";
import { idsUnicos } from "./_comum";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface Autor { id: string; name: string }

export interface ColaboradorDoContrato { id: string; fullName: string; collaboratorNumber: number; type: string; active: boolean }
export type ContratoComColaboradores = Contrato & { colaboradores: ColaboradorDoContrato[] };

export interface DadosDoContrato {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  tipo: string;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  observacao: string | null;
}

// ── Leitura ─────────────────────────────────────────────────────────────────

async function colaboradoresDosContratos(ids: string[], cx: Tx | typeof db = db): Promise<Map<string, ColaboradorDoContrato[]>> {
  const mapa = new Map<string, ColaboradorDoContrato[]>();
  const unicos = idsUnicos(ids);
  if (unicos.length === 0) return mapa;
  const linhas = await cx
    .select({
      contratoId: contratosColaboradores.contratoId,
      id: collaborators.id,
      fullName: collaborators.fullName,
      collaboratorNumber: collaborators.collaboratorNumber,
      type: collaborators.type,
      active: collaborators.active,
    })
    .from(contratosColaboradores)
    .innerJoin(collaborators, eq(collaborators.id, contratosColaboradores.collaboratorId))
    .where(inArray(contratosColaboradores.contratoId, unicos))
    .orderBy(asc(collaborators.fullName));
  for (const l of linhas) {
    const { contratoId, ...c } = l;
    mapa.set(contratoId, [...(mapa.get(contratoId) ?? []), c]);
  }
  return mapa;
}

export async function listarContratos(): Promise<ContratoComColaboradores[]> {
  const lista = await db.select().from(contratos).orderBy(asc(contratos.razaoSocial));
  const porContrato = await colaboradoresDosContratos(lista.map((c) => c.id));
  return lista.map((c) => ({ ...c, colaboradores: porContrato.get(c.id) ?? [] }));
}

export async function obterContrato(id: string, cx: Tx | typeof db = db): Promise<ContratoComColaboradores | null> {
  const [c] = await cx.select().from(contratos).where(eq(contratos.id, id)).limit(1);
  if (!c) return null;
  const porContrato = await colaboradoresDosContratos([c.id], cx);
  return { ...c, colaboradores: porContrato.get(c.id) ?? [] };
}

export async function contratoPorCnpj(cnpj: string): Promise<Contrato | null> {
  const [c] = await db.select().from(contratos).where(eq(contratos.cnpj, cnpj)).limit(1);
  return c ?? null;
}

export async function historicoDoContrato(id: string): Promise<ContratoHistorico[]> {
  return db.select().from(contratosHistorico).where(eq(contratosHistorico.contratoId, id)).orderBy(desc(contratosHistorico.em));
}

/** Contratos ligados a cada colaborador (para o sinal "contrato ativo"). */
export async function contratosDosColaboradores(ids: readonly string[]): Promise<Map<string, Contrato[]>> {
  const mapa = new Map<string, Contrato[]>();
  const unicos = idsUnicos([...ids]);
  if (unicos.length === 0) return mapa;
  const linhas = await db
    .select({ collaboratorId: contratosColaboradores.collaboratorId, c: contratos })
    .from(contratosColaboradores)
    .innerJoin(contratos, eq(contratos.id, contratosColaboradores.contratoId))
    .where(inArray(contratosColaboradores.collaboratorId, unicos));
  for (const l of linhas) mapa.set(l.collaboratorId, [...(mapa.get(l.collaboratorId) ?? []), l.c]);
  return mapa;
}

export async function colaboradoresExistem(ids: readonly string[]): Promise<string[]> {
  const unicos = idsUnicos([...ids]);
  if (unicos.length === 0) return [];
  const linhas = await db.select({ id: collaborators.id }).from(collaborators).where(inArray(collaborators.id, unicos));
  return linhas.map((l) => l.id);
}

export async function nomesDosColaboradores(ids: readonly string[], cx: Tx | typeof db = db): Promise<Map<string, string>> {
  const unicos = idsUnicos([...ids]);
  if (unicos.length === 0) return new Map();
  const linhas = await cx.select({ id: collaborators.id, fullName: collaborators.fullName }).from(collaborators).where(inArray(collaborators.id, unicos));
  return new Map(linhas.map((l) => [l.id, l.fullName]));
}

// ── Escrita ─────────────────────────────────────────────────────────────────

async function registrar(tx: Tx, contratoId: string, acao: string, detalhes: string[], autor: Autor) {
  await tx.insert(contratosHistorico).values({ contratoId, acao, detalhes, por: autor.id, porNome: autor.name });
}

async function vincularNaTx(tx: Tx, contratoId: string, ids: readonly string[], autor: Autor): Promise<string[]> {
  const unicos = idsUnicos([...ids]);
  if (unicos.length === 0) return [];
  const inseridos = await tx
    .insert(contratosColaboradores)
    .values(unicos.map((collaboratorId) => ({ contratoId, collaboratorId, criadoPorNome: autor.name })))
    .onConflictDoNothing()
    .returning({ id: contratosColaboradores.collaboratorId });
  return inseridos.map((i) => i.id);
}

export async function criarContrato(dados: DadosDoContrato, colaboradorIds: readonly string[], autor: Autor): Promise<ContratoComColaboradores> {
  return db.transaction(async (tx) => {
    const [c] = await tx.insert(contratos).values({
      ...dados, criadoPor: autor.id, criadoPorNome: autor.name, atualizadoPorNome: autor.name,
    }).returning();
    const vinculados = await vincularNaTx(tx, c.id, colaboradorIds, autor);
    const nomes = await nomesDosColaboradores(vinculados, tx);
    await registrar(tx, c.id, "criado", [
      "Contrato cadastrado.",
      ...vinculados.map((id) => `Colaborador vinculado: ${nomes.get(id) ?? id}.`),
    ], autor);
    return (await obterContrato(c.id, tx))!;
  });
}

/**
 * Edita o contrato (guardado por versão). `colaboradorIds` presente = a lista
 * inteira de vínculos passa a ser essa (acrescenta e tira o que mudou).
 * Devolve null quando a versão não bate (409 na rota).
 */
export async function editarContrato(
  id: string, versao: number, dados: Partial<DadosDoContrato>, colaboradorIds: readonly string[] | undefined,
  detalhes: string[], autor: Autor,
): Promise<ContratoComColaboradores | null> {
  return db.transaction(async (tx) => {
    const [c] = await tx.update(contratos)
      .set({ ...dados, versao: sql`${contratos.versao} + 1`, updatedAt: new Date(), atualizadoPorNome: autor.name })
      .where(and(eq(contratos.id, id), eq(contratos.versao, versao)))
      .returning({ id: contratos.id });
    if (!c) return null;
    const notas = [...detalhes];
    if (colaboradorIds) {
      const atuais = (await tx.select({ id: contratosColaboradores.collaboratorId }).from(contratosColaboradores)
        .where(eq(contratosColaboradores.contratoId, id))).map((l) => l.id);
      const novos = idsUnicos([...colaboradorIds]);
      const sair = atuais.filter((x) => !novos.includes(x));
      const entrar = novos.filter((x) => !atuais.includes(x));
      if (sair.length) {
        await tx.delete(contratosColaboradores).where(and(eq(contratosColaboradores.contratoId, id), inArray(contratosColaboradores.collaboratorId, sair)));
      }
      const entraram = await vincularNaTx(tx, id, entrar, autor);
      const nomes = await nomesDosColaboradores([...sair, ...entraram], tx);
      for (const x of entraram) notas.push(`Colaborador vinculado: ${nomes.get(x) ?? x}.`);
      for (const x of sair) notas.push(`Colaborador desvinculado: ${nomes.get(x) ?? "colaborador"}.`);
    }
    if (notas.length > 0) await registrar(tx, id, "editado", notas, autor);
    return obterContrato(id, tx);
  });
}

export async function encerrarContrato(id: string, versao: number, motivo: string, autor: Autor): Promise<ContratoComColaboradores | null> {
  return db.transaction(async (tx) => {
    const [c] = await tx.update(contratos)
      .set({
        encerradoEm: new Date(), encerradoPor: autor.id, encerradoPorNome: autor.name, motivoEncerramento: motivo,
        versao: sql`${contratos.versao} + 1`, updatedAt: new Date(), atualizadoPorNome: autor.name,
      })
      .where(and(eq(contratos.id, id), eq(contratos.versao, versao), isNull(contratos.encerradoEm)))
      .returning({ id: contratos.id });
    if (!c) return null;
    await registrar(tx, id, "encerrado", [`Contrato encerrado. Motivo: ${motivo}`], autor);
    return obterContrato(id, tx);
  });
}

export async function reativarContrato(id: string, versao: number, autor: Autor): Promise<ContratoComColaboradores | null> {
  return db.transaction(async (tx) => {
    const [c] = await tx.update(contratos)
      .set({
        encerradoEm: null, encerradoPor: null, encerradoPorNome: null, motivoEncerramento: null,
        versao: sql`${contratos.versao} + 1`, updatedAt: new Date(), atualizadoPorNome: autor.name,
      })
      .where(and(eq(contratos.id, id), eq(contratos.versao, versao), isNotNull(contratos.encerradoEm)))
      .returning({ id: contratos.id });
    if (!c) return null;
    await registrar(tx, id, "reativado", ["Contrato reativado."], autor);
    return obterContrato(id, tx);
  });
}

/** Vincula UM colaborador (a partir do cadastro dele). false = já estava. */
export async function vincularColaborador(contratoId: string, collaboratorId: string, nome: string, autor: Autor): Promise<boolean> {
  return db.transaction(async (tx) => {
    const feitos = await vincularNaTx(tx, contratoId, [collaboratorId], autor);
    if (feitos.length === 0) return false;
    await tx.update(contratos).set({ versao: sql`${contratos.versao} + 1`, updatedAt: new Date(), atualizadoPorNome: autor.name }).where(eq(contratos.id, contratoId));
    await registrar(tx, contratoId, "vinculado", [`Colaborador vinculado: ${nome}.`], autor);
    return true;
  });
}

export async function desvincularColaborador(contratoId: string, collaboratorId: string, nome: string, autor: Autor): Promise<boolean> {
  return db.transaction(async (tx) => {
    const saiu = await tx.delete(contratosColaboradores)
      .where(and(eq(contratosColaboradores.contratoId, contratoId), eq(contratosColaboradores.collaboratorId, collaboratorId)))
      .returning({ id: contratosColaboradores.collaboratorId });
    if (saiu.length === 0) return false;
    await tx.update(contratos).set({ versao: sql`${contratos.versao} + 1`, updatedAt: new Date(), atualizadoPorNome: autor.name }).where(eq(contratos.id, contratoId));
    await registrar(tx, contratoId, "desvinculado", [`Colaborador desvinculado: ${nome}.`], autor);
    return true;
  });
}

export async function definirAnexo(contratoId: string, anexo: { id: string; nome: string } | null, autor: Autor): Promise<ContratoComColaboradores | null> {
  return db.transaction(async (tx) => {
    const [c] = await tx.update(contratos)
      .set({ anexoId: anexo?.id ?? null, anexoNome: anexo?.nome ?? null, versao: sql`${contratos.versao} + 1`, updatedAt: new Date(), atualizadoPorNome: autor.name })
      .where(eq(contratos.id, contratoId))
      .returning({ id: contratos.id });
    if (!c) return null;
    await registrar(tx, contratoId, "anexo", [anexo ? `Anexo do contrato: ${anexo.nome}.` : "Anexo do contrato removido."], autor);
    return obterContrato(contratoId, tx);
  });
}

/** O anexo `ATT-…` é de algum contrato? (ACL: só o DP abre.) */
export async function ehAnexoDeContrato(anexoId: string): Promise<boolean> {
  const [l] = await db.select({ id: contratos.id }).from(contratos).where(eq(contratos.anexoId, anexoId)).limit(1);
  return !!l;
}

// ── Importação ──────────────────────────────────────────────────────────────

/** O que a prévia precisa: contratos com vínculos e colaboradores com os CPFs. */
export async function dadosParaImportacao(): Promise<{ existentes: ContratoExistente[]; colaboradores: ColaboradorParaImportacao[] }> {
  const [lista, links, pessoas] = await Promise.all([
    db.select().from(contratos),
    db.select().from(contratosColaboradores),
    db.select({
      id: collaborators.id, fullName: collaborators.fullName,
      officialDocument: collaborators.officialDocument, documentType: collaborators.documentType,
      secondaryDocument: collaborators.secondaryDocument, secondaryDocumentType: collaborators.secondaryDocumentType,
    }).from(collaborators),
  ]);
  const vinculos = new Map<string, string[]>();
  for (const l of links) vinculos.set(l.contratoId, [...(vinculos.get(l.contratoId) ?? []), l.collaboratorId]);
  const existentes: ContratoExistente[] = lista.map((c) => ({
    id: c.id, cnpj: c.cnpj, razaoSocial: c.razaoSocial, nomeFantasia: c.nomeFantasia, tipo: c.tipo,
    vigenciaInicio: c.vigenciaInicio, vigenciaFim: c.vigenciaFim, observacao: c.observacao,
    encerrado: !!c.encerradoEm, colaboradorIds: vinculos.get(c.id) ?? [],
  }));
  // CPF: o documento marcado como CPF ou, sem marcação, o que tem 11 dígitos válidos.
  const cpfDe = (doc: string | null, tipo: string | null) => {
    const d = digitosDoCpf(doc);
    return d && (String(tipo ?? "").toLowerCase() === "cpf" || cpfValido(d)) && d.length === 11 ? d : null;
  };
  const colaboradores: ColaboradorParaImportacao[] = pessoas.map((p) => ({
    id: p.id,
    fullName: p.fullName,
    cpfs: [cpfDe(p.officialDocument, p.documentType), cpfDe(p.secondaryDocument, p.secondaryDocumentType)].filter((x): x is string => !!x),
  }));
  return { existentes, colaboradores };
}

/** Aplica as operações da prévia numa transação só. Lança em conflito (CNPJ criado no meio). */
export async function aplicarImportacao(
  operacoes: readonly OperacaoDaImportacao[], mudancasPorCnpj: Map<string, string[]>, nomeDoArquivo: string, autor: Autor,
): Promise<{ criados: number; atualizados: number; vinculos: number }> {
  return db.transaction(async (tx) => {
    let criados = 0;
    let atualizados = 0;
    let vinculos = 0;
    const origem = `Importado da planilha "${nomeDoArquivo}".`;
    for (const op of operacoes) {
      let contratoId = op.contratoId;
      if (!contratoId) {
        const [c] = await tx.insert(contratos).values({
          cnpj: op.cnpj, ...op.dados, criadoPor: autor.id, criadoPorNome: autor.name, atualizadoPorNome: autor.name,
        }).returning({ id: contratos.id });
        contratoId = c.id;
        criados++;
        await registrar(tx, contratoId, "importado", [origem, `Linhas ${op.linhas.join(", ")}.`], autor);
      } else {
        await tx.update(contratos)
          .set({ ...op.dados, versao: sql`${contratos.versao} + 1`, updatedAt: new Date(), atualizadoPorNome: autor.name })
          .where(eq(contratos.id, contratoId));
        atualizados++;
        await registrar(tx, contratoId, "importado", [origem, ...(mudancasPorCnpj.get(op.cnpj) ?? [])], autor);
      }
      vinculos += (await vincularNaTx(tx, contratoId, op.novosColaboradores, autor)).length;
    }
    return { criados, atualizados, vinculos };
  });
}

// ── Pagamento ───────────────────────────────────────────────────────────────

export async function obterPagamento(collaboratorId: string): Promise<ColaboradorPagamento | null> {
  const [p] = await db.select().from(colaboradoresPagamento).where(eq(colaboradoresPagamento.collaboratorId, collaboratorId)).limit(1);
  return p ?? null;
}

export type GravacaoDoPagamento = Omit<ColaboradorPagamento, "collaboratorId" | "versao" | "atualizadoPor" | "atualizadoPorNome" | "updatedAt">;

/**
 * Grava o pagamento (cria ou atualiza, guardado por versão: `versaoEsperada`
 * 0 = ainda não existe) e a alteração mascarada, na mesma transação.
 * null = versão não bate (409).
 */
export async function salvarPagamento(
  collaboratorId: string, versaoEsperada: number, valores: GravacaoDoPagamento,
  alteracao: { campos: string[]; antes: Record<string, string | null>; depois: Record<string, string | null>; mudaConta: boolean } | null,
  autor: Autor,
): Promise<ColaboradorPagamento | null> {
  return db.transaction(async (tx) => {
    let gravado: ColaboradorPagamento | undefined;
    if (versaoEsperada === 0) {
      [gravado] = await tx.insert(colaboradoresPagamento)
        .values({ collaboratorId, ...valores, atualizadoPor: autor.id, atualizadoPorNome: autor.name })
        .onConflictDoNothing()
        .returning();
    } else {
      [gravado] = await tx.update(colaboradoresPagamento)
        .set({ ...valores, versao: sql`${colaboradoresPagamento.versao} + 1`, atualizadoPor: autor.id, atualizadoPorNome: autor.name, updatedAt: new Date() })
        .where(and(eq(colaboradoresPagamento.collaboratorId, collaboratorId), eq(colaboradoresPagamento.versao, versaoEsperada)))
        .returning();
    }
    if (!gravado) return null;
    if (alteracao && alteracao.campos.length > 0) {
      await tx.insert(colaboradoresPagamentoAlteracoes).values({ collaboratorId, ...alteracao, por: autor.id, porNome: autor.name });
    }
    return gravado;
  });
}

export type AlteracaoComColaborador = ColaboradorPagamentoAlteracao & { colaboradorNome: string; colaboradorNumero: number };

export async function listarAlteracoes(opcoes: { pendentes: boolean; collaboratorId?: string; limite?: number }): Promise<AlteracaoComColaborador[]> {
  const filtros = [
    opcoes.pendentes ? and(eq(colaboradoresPagamentoAlteracoes.mudaConta, true), isNull(colaboradoresPagamentoAlteracoes.conferidoEm)) : undefined,
    opcoes.collaboratorId ? eq(colaboradoresPagamentoAlteracoes.collaboratorId, opcoes.collaboratorId) : undefined,
  ].filter(Boolean);
  const linhas = await db
    .select({ a: colaboradoresPagamentoAlteracoes, colaboradorNome: collaborators.fullName, colaboradorNumero: collaborators.collaboratorNumber })
    .from(colaboradoresPagamentoAlteracoes)
    .innerJoin(collaborators, eq(collaborators.id, colaboradoresPagamentoAlteracoes.collaboratorId))
    .where(filtros.length ? and(...filtros) : undefined)
    .orderBy(desc(colaboradoresPagamentoAlteracoes.em))
    .limit(opcoes.limite ?? 300);
  return linhas.map((l) => ({ ...l.a, colaboradorNome: l.colaboradorNome, colaboradorNumero: l.colaboradorNumero }));
}

/** Pendentes de conferência que ESTA pessoa pode conferir (feitas por outra). */
export async function contarAlteracoesPendentes(usuarioId: string): Promise<{ count: number; ultima: string | null }> {
  const [r] = await db
    .select({ count: sql<number>`count(*)::int`, ultima: sql<string | null>`max(${colaboradoresPagamentoAlteracoes.em})` })
    .from(colaboradoresPagamentoAlteracoes)
    .where(and(
      eq(colaboradoresPagamentoAlteracoes.mudaConta, true),
      isNull(colaboradoresPagamentoAlteracoes.conferidoEm),
      sql`coalesce(${colaboradoresPagamentoAlteracoes.por}, '') <> ${usuarioId}`,
    ));
  const ultima = r?.ultima ? new Date(r.ultima).toISOString() : null;
  return { count: Number(r?.count ?? 0), ultima };
}

export async function obterAlteracao(id: string): Promise<ColaboradorPagamentoAlteracao | null> {
  const [a] = await db.select().from(colaboradoresPagamentoAlteracoes).where(eq(colaboradoresPagamentoAlteracoes.id, id)).limit(1);
  return a ?? null;
}

/** Confere a alteração (outra pessoa do DP). false = já conferida ou feita pela própria pessoa. */
export async function conferirAlteracao(id: string, autor: Autor): Promise<boolean> {
  const r = await db.update(colaboradoresPagamentoAlteracoes)
    .set({ conferidoEm: new Date(), conferidoPor: autor.id, conferidoPorNome: autor.name })
    .where(and(
      eq(colaboradoresPagamentoAlteracoes.id, id),
      isNull(colaboradoresPagamentoAlteracoes.conferidoEm),
      ne(sql`coalesce(${colaboradoresPagamentoAlteracoes.por}, '')`, autor.id),
    ))
    .returning({ id: colaboradoresPagamentoAlteracoes.id });
  return r.length > 0;
}

/** Colaboradores com vaga (não excluída) no evento — para o selo no Planejado/Realizado. */
export async function colaboradoresDoEvento(eventId: string): Promise<string[]> {
  const linhas = await db
    .selectDistinct({ id: teamInclusions.collaboratorId })
    .from(teamInclusions)
    .where(and(eq(teamInclusions.eventId, eventId), isNull(teamInclusions.deletedAt), isNotNull(teamInclusions.collaboratorId)));
  return linhas.map((l) => l.id).filter((x): x is string => !!x);
}
