/**
 * Histórico de emissões (29/10) — a leitura do banco; a regra é pura, em
 * shared/historico-de-emissoes.ts. Só leitura: nada aqui grava.
 *
 * Consulta parametrizada (drizzle) pelo colaborador, limitada a
 * EMISSOES_MAX_NOTAS notas (as mais recentes). Não lê nem devolve dado
 * bancário: só CNPJ, razão social, evento, data, valor e status da nota.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { budgetActual, contratos, events, invoices, presencaConfirmacoes } from "@shared/schema";
import {
  EMISSOES_MAX_NOTAS, STATUS_DE_EMISSAO, agruparEmissoes, cnpjDaEmissao, ultimoEnvioDoHistorico,
  type ContratoParaRazao, type EmpresaEmitente, type NotaParaHistorico,
} from "@shared/historico-de-emissoes";

export interface HistoricoDeEmissoes {
  empresas: EmpresaEmitente[];
  /** Notas consideradas (enviadas ou aprovadas com CNPJ válido). */
  totalDeNotas: number;
  /** Havia mais notas que o teto — as mais antigas ficaram de fora. */
  truncado: boolean;
}

export async function historicoDeEmissoesDoColaborador(collaboratorId: string): Promise<HistoricoDeEmissoes> {
  const linhas = await db
    .select({
      notaId: invoices.id,
      eventoId: invoices.eventId,
      eventoNome: events.name,
      status: invoices.status,
      nfCnpj: invoices.nfCnpj,
      nfValor: invoices.nfValor,
      aprovadaEm: invoices.approvedAt,
      criadaEm: invoices.createdAt,
      historico: invoices.history,
      cnpjEmissor: budgetActual.cnpjEmissor,
      razaoSocialEmissor: budgetActual.razaoSocialEmissor,
      valorPrestacao: budgetActual.totalValue,
      cnpjConfirmacao: presencaConfirmacoes.cnpj,
      razaoSocialConfirmacao: presencaConfirmacoes.razaoSocial,
    })
    .from(invoices)
    .innerJoin(events, eq(events.id, invoices.eventId))
    .leftJoin(budgetActual, eq(budgetActual.id, invoices.budgetActualId))
    .leftJoin(presencaConfirmacoes, eq(presencaConfirmacoes.actualId, invoices.budgetActualId))
    .where(and(eq(invoices.collaboratorId, collaboratorId), inArray(invoices.status, [...STATUS_DE_EMISSAO])))
    .orderBy(desc(invoices.createdAt), desc(invoices.id))
    .limit(EMISSOES_MAX_NOTAS + 1);

  const truncado = linhas.length > EMISSOES_MAX_NOTAS;
  const notas: NotaParaHistorico[] = linhas.slice(0, EMISSOES_MAX_NOTAS).map((l) => ({
    notaId: l.notaId, eventoId: l.eventoId, eventoNome: l.eventoNome, status: l.status,
    nfCnpj: l.nfCnpj, cnpjEmissor: l.cnpjEmissor, cnpjConfirmacao: l.cnpjConfirmacao,
    razaoSocialEmissor: l.razaoSocialEmissor, razaoSocialConfirmacao: l.razaoSocialConfirmacao,
    nfValor: l.nfValor, valorPrestacao: l.valorPrestacao,
    aprovadaEm: l.aprovadaEm, enviadaEm: ultimoEnvioDoHistorico(l.historico), criadaEm: l.criadaEm,
  }));

  const cnpjs = Array.from(new Set(notas.map(cnpjDaEmissao).filter((c): c is string => !!c)));
  const doContrato = new Map<string, ContratoParaRazao>();
  if (cnpjs.length) {
    const achados = await db.select({ id: contratos.id, cnpj: contratos.cnpj, razaoSocial: contratos.razaoSocial })
      .from(contratos).where(inArray(contratos.cnpj, cnpjs));
    for (const c of achados) doContrato.set(c.cnpj, { id: c.id, razaoSocial: c.razaoSocial });
  }

  const empresas = agruparEmissoes(notas, doContrato);
  return { empresas, totalDeNotas: empresas.reduce((s, e) => s + e.notas, 0), truncado };
}
