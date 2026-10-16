/**
 * Honorários da cenotécnica (16/10) — acesso a dados. Regras em
 * shared/honorarios-ceno.ts; autorização e HTTP em server/routes/honorarios-ceno.ts.
 *
 * Fica fora do objeto `storage` (como trocas e espelho): o módulo é à parte
 * e só as rotas dele leem estas funções. NADA aqui grava em team_inclusions —
 * a vaga é só lida (para listar as escaladas e tirar o snapshot do nome).
 *
 * Toda mudança de estado usa UPDATE guardado (id + versao + status esperado)
 * dentro de transação, com o histórico gravado junto: zero linhas = alguém
 * mudou o pedido antes (a rota responde 409).
 */
import { and, desc, eq, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import {
  honorariosCeno, honorariosCenoHistorico, honorariosCenoLiberacoes,
  teamInclusions, functions, collaborators, events, scalingFunctionManagers, functionManagers,
  type HonorarioCeno, type HonorarioCenoHistorico, type HonorarioCenoLiberacao, type InsertHonorarioCeno,
} from "@shared/schema";
import { ehCenotecnica } from "@shared/cenotecnica";
import { ACTIVE_CONFLICT_STATUSES } from "@shared/vaga-status";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Liberado = soma das liberações NÃO estornadas (subconsulta por linha). */
const LIBERADO = sql<number>`coalesce((select sum(${honorariosCenoLiberacoes.valor}) from ${honorariosCenoLiberacoes}
  where ${honorariosCenoLiberacoes.honorarioId} = ${honorariosCeno.id} and ${honorariosCenoLiberacoes.estornadaEm} is null), 0)::int`;

/** O pedido com o que as telas leem junto: evento, vaga, função e o liberado. */
export type HonorarioComContexto = HonorarioCeno & {
  liberado: number;
  eventName: string | null;
  eventStartDate: string | null;
  eventEndDate: string | null;
  inclusionNumber: number | null;
  functionName: string | null;
  vagaStatus: string | null;
  vagaExcluida: boolean;
};

function selecaoComContexto() {
  return db
    .select({
      h: honorariosCeno,
      liberado: LIBERADO,
      eventName: events.name,
      eventStartDate: events.startDate,
      eventEndDate: events.endDate,
      inclusionNumber: teamInclusions.inclusionNumber,
      functionName: functions.name,
      vagaStatus: teamInclusions.status,
      vagaDeletedAt: teamInclusions.deletedAt,
    })
    .from(honorariosCeno)
    .innerJoin(events, eq(events.id, honorariosCeno.eventId))
    .leftJoin(teamInclusions, eq(teamInclusions.id, honorariosCeno.teamInclusionId))
    .leftJoin(functions, eq(functions.id, honorariosCeno.functionId));
}

type LinhaSelecionada = Awaited<ReturnType<ReturnType<typeof selecaoComContexto>["where"]>>[number];

function comContexto(l: LinhaSelecionada): HonorarioComContexto {
  return {
    ...l.h,
    liberado: Number(l.liberado ?? 0),
    eventName: l.eventName ?? null,
    eventStartDate: l.eventStartDate ? String(l.eventStartDate) : null,
    eventEndDate: l.eventEndDate ? String(l.eventEndDate) : null,
    inclusionNumber: l.inclusionNumber ?? null,
    functionName: l.functionName ?? null,
    vagaStatus: l.vagaStatus ?? null,
    vagaExcluida: !!l.vagaDeletedAt,
  };
}

export async function listarHonorarios(filtros: SQL[], opts: { limite?: number; ordem?: "decidido" | "evento" } = {}): Promise<HonorarioComContexto[]> {
  const q = selecaoComContexto()
    .where(filtros.length ? and(...filtros) : undefined)
    .orderBy(...(opts.ordem === "decidido"
      ? [desc(honorariosCeno.decididoEm), desc(honorariosCeno.updatedAt)]
      : [desc(events.startDate), honorariosCeno.tipo, honorariosCeno.nome]));
  const linhas = opts.limite ? await q.limit(opts.limite) : await q;
  return linhas.map(comContexto);
}

export async function getHonorario(id: string): Promise<HonorarioComContexto | null> {
  const [l] = await selecaoComContexto().where(eq(honorariosCeno.id, id)).limit(1);
  return l ? comContexto(l) : null;
}

export async function getHonorarioDaVaga(teamInclusionId: string): Promise<HonorarioCeno | null> {
  const [l] = await db.select().from(honorariosCeno).where(eq(honorariosCeno.teamInclusionId, teamInclusionId)).limit(1);
  return l ?? null;
}

export const filtros = {
  doEvento: (eventId: string) => eq(honorariosCeno.eventId, eventId),
  status: (s: string[]) => inArray(honorariosCeno.status, s),
  semRascunho: () => ne(honorariosCeno.status, "rascunho"),
  ids: (ids: string[]) => inArray(honorariosCeno.id, ids),
};

// ── Funções de cenotécnica e quem responde por elas ─────────────────────────

/** Funções cujo nome é de cenotécnica — inclui "Sup Ceno" (passa pelo gestor, como na escala). */
export async function funcoesDeCenotecnica(): Promise<{ id: string; name: string }[]> {
  const todas = await db.select({ id: functions.id, name: functions.name }).from(functions);
  return todas.filter((f) => ehCenotecnica(f.name, { incluiSupCeno: true }));
}

/**
 * Papéis do usuário nas funções: validador/aprovador do MÓDULO DE ESCALA
 * (scaling_function_managers) e responsável clássico (function_managers —
 * quem confirma a escalação da função).
 */
export async function papeisNasFuncoes(userId: string): Promise<{ validador: Set<string>; aprovador: Set<string>; responsavel: Set<string> }> {
  const [escala, classicos] = await Promise.all([
    db.select({ functionId: scalingFunctionManagers.functionId, role: scalingFunctionManagers.role })
      .from(scalingFunctionManagers).where(eq(scalingFunctionManagers.userId, userId)),
    db.select({ functionId: functionManagers.functionId }).from(functionManagers).where(eq(functionManagers.userId, userId)),
  ]);
  return {
    validador: new Set(escala.filter((r) => r.role !== "aprovador").map((r) => r.functionId)),
    aprovador: new Set(escala.filter((r) => r.role === "aprovador").map((r) => r.functionId)),
    responsavel: new Set(classicos.map((r) => r.functionId)),
  };
}

// ── Vagas escaladas de cenotécnica ──────────────────────────────────────────

export interface VagaDeCenotecnica {
  id: string;
  eventId: string;
  inclusionNumber: number;
  functionId: string;
  functionName: string;
  collaboratorId: string | null;
  collaboratorName: string | null;
  collaboratorType: string | null;
  status: string;
  scheduleStartDate: string | null;
  scheduleEndDate: string | null;
  dailyRates: number;
  cenoFreelaTipo: string | null;
  needsTicket: boolean;
  empreitaEmpresa: string | null;
  empreitaPessoas: number | null;
  empreitaValor: number | null;
}

/**
 * Vagas ESCALADAS (status de confirmação, inclusive os legados) das funções
 * indicadas, num evento ou em vários. Sem as excluídas e sem a fase de sugestão.
 */
export async function vagasEscaladas(functionIds: string[], eventIds?: string[], vagaId?: string): Promise<VagaDeCenotecnica[]> {
  if (functionIds.length === 0) return [];
  if (eventIds && eventIds.length === 0) return [];
  const condicoes: SQL[] = [
    inArray(teamInclusions.functionId, functionIds),
    inArray(teamInclusions.status, [...ACTIVE_CONFLICT_STATUSES]),
    isNull(teamInclusions.deletedAt),
    ne(teamInclusions.phase, "sugestao"),
  ];
  if (eventIds) condicoes.push(inArray(teamInclusions.eventId, eventIds));
  if (vagaId) condicoes.push(eq(teamInclusions.id, vagaId));
  const linhas = await db
    .select({
      id: teamInclusions.id, eventId: teamInclusions.eventId, inclusionNumber: teamInclusions.inclusionNumber,
      functionId: teamInclusions.functionId, functionName: functions.name,
      collaboratorId: teamInclusions.collaboratorId, collaboratorName: collaborators.fullName, collaboratorType: collaborators.type,
      status: teamInclusions.status, scheduleStartDate: teamInclusions.scheduleStartDate, scheduleEndDate: teamInclusions.scheduleEndDate,
      dailyRates: teamInclusions.dailyRates, cenoFreelaTipo: teamInclusions.cenoFreelaTipo, needsTicket: teamInclusions.needsTicket,
      empreitaEmpresa: teamInclusions.empreitaEmpresa, empreitaPessoas: teamInclusions.empreitaPessoas, empreitaValor: teamInclusions.empreitaValor,
    })
    .from(teamInclusions)
    .innerJoin(functions, eq(functions.id, teamInclusions.functionId))
    .leftJoin(collaborators, eq(collaborators.id, teamInclusions.collaboratorId))
    .where(and(...condicoes))
    .orderBy(functions.name, teamInclusions.inclusionNumber);
  return linhas.map((l) => ({
    ...l,
    collaboratorName: l.collaboratorName ?? null,
    collaboratorType: l.collaboratorType ?? null,
    scheduleStartDate: l.scheduleStartDate ? String(l.scheduleStartDate) : null,
    scheduleEndDate: l.scheduleEndDate ? String(l.scheduleEndDate) : null,
  }));
}

/** A vaga, se for ESCALADA e de uma das funções indicadas (senão null). */
export async function getVagaEscalada(id: string, functionIds: string[]): Promise<VagaDeCenotecnica | null> {
  const [v] = await vagasEscaladas(functionIds, undefined, id);
  return v ?? null;
}

export async function getEvento(id: string): Promise<{ id: string; name: string; startDate: string; endDate: string; location: string; status: string } | null> {
  const [e] = await db.select({ id: events.id, name: events.name, startDate: events.startDate, endDate: events.endDate, location: events.location, status: events.status })
    .from(events).where(eq(events.id, id)).limit(1);
  return e ? { ...e, startDate: String(e.startDate), endDate: String(e.endDate) } : null;
}

/** Eventos (não excluídos) com as datas, para a lista "escolha o evento" de quem pede. */
export async function eventosPorIds(ids: string[]): Promise<{ id: string; name: string; startDate: string; endDate: string; location: string; status: string }[]> {
  if (ids.length === 0) return [];
  const es = await db.select({ id: events.id, name: events.name, startDate: events.startDate, endDate: events.endDate, location: events.location, status: events.status })
    .from(events).where(and(inArray(events.id, ids), ne(events.status, "excluído")));
  return es.map((e) => ({ ...e, startDate: String(e.startDate), endDate: String(e.endDate) }));
}

/** Todos os pedidos (qualquer status) de uma lista de eventos — para os resumos por evento. */
export async function honorariosDosEventos(eventIds: string[]): Promise<HonorarioComContexto[]> {
  if (eventIds.length === 0) return [];
  return listarHonorarios([inArray(honorariosCeno.eventId, eventIds)]);
}

/** Eventos que têm pedido de honorário (qualquer status). */
export async function eventosComHonorario(): Promise<string[]> {
  const r = await db.selectDistinct({ eventId: honorariosCeno.eventId }).from(honorariosCeno);
  return r.map((x) => x.eventId);
}

// ── Escrita ─────────────────────────────────────────────────────────────────

export interface Ator { id: string; nome: string }

export interface EntradaDoHistorico {
  acao: string;
  valorAnterior?: number | null;
  valorNovo?: number | null;
  motivo?: string | null;
  detalhe?: string | null;
}

async function registrar(tx: Tx, honorarioId: string, ator: Ator, e: EntradaDoHistorico) {
  await tx.insert(honorariosCenoHistorico).values({
    honorarioId, acao: e.acao, valorAnterior: e.valorAnterior ?? null, valorNovo: e.valorNovo ?? null,
    motivo: e.motivo ?? null, detalhe: e.detalhe ?? null, porId: ator.id, porNome: ator.nome,
  });
}

export async function criarHonorario(row: InsertHonorarioCeno, ator: Ator, historico: EntradaDoHistorico): Promise<HonorarioCeno> {
  return db.transaction(async (tx) => {
    const [novo] = await tx.insert(honorariosCeno).values(row).returning();
    await registrar(tx, novo.id, ator, historico);
    return novo;
  });
}

/**
 * UPDATE guardado: só grava se a versão e o status ainda são os esperados.
 * Devolve a linha nova ou null (corrida perdida → 409 na rota).
 */
export async function atualizarGuardado(
  id: string, versao: number, statusEsperados: readonly string[],
  set: Partial<InsertHonorarioCeno>, ator: Ator, historico: EntradaDoHistorico | null,
): Promise<HonorarioCeno | null> {
  return db.transaction(async (tx) => {
    const [linha] = await tx.update(honorariosCeno)
      .set({ ...set, versao: sql`${honorariosCeno.versao} + 1`, updatedAt: new Date() })
      .where(and(eq(honorariosCeno.id, id), eq(honorariosCeno.versao, versao), inArray(honorariosCeno.status, [...statusEsperados])))
      .returning();
    if (!linha) return null;
    if (historico) await registrar(tx, id, ator, historico);
    return linha;
  });
}

/** Remove um rascunho (só se ainda for rascunho nunca enviado, na versão lida). */
export async function removerRascunho(id: string, versao: number): Promise<boolean> {
  const r = await db.delete(honorariosCeno)
    .where(and(eq(honorariosCeno.id, id), eq(honorariosCeno.versao, versao), eq(honorariosCeno.status, "rascunho"), isNull(honorariosCeno.enviadoEm)))
    .returning({ id: honorariosCeno.id });
  return r.length > 0;
}

/**
 * Liberação de verba: na MESMA transação, (1) sobe a versão do pedido com a
 * guarda de versão + aprovado (uma devolução concorrente perde), (2) confere
 * de novo o que falta liberar com a linha travada, (3) grava a liberação e o
 * histórico. Devolve null em corrida ou "passou do que falta".
 */
export async function registrarLiberacao(
  id: string, versao: number, l: { data: string; oc: string; valor: number; observacao: string | null },
  ator: Ator, faltaAntes: (liberadoAgora: number) => number, detalhe: (liberadoDepois: number) => string,
): Promise<{ honorario: HonorarioCeno; liberacao: HonorarioCenoLiberacao } | null> {
  return db.transaction(async (tx) => {
    const [linha] = await tx.update(honorariosCeno)
      .set({ versao: sql`${honorariosCeno.versao} + 1`, updatedAt: new Date() })
      .where(and(eq(honorariosCeno.id, id), eq(honorariosCeno.versao, versao), inArray(honorariosCeno.status, ["aprovado", "aprovado_ajuste"])))
      .returning();
    if (!linha) return null;
    const [{ total }] = await tx.select({ total: sql<number>`coalesce(sum(${honorariosCenoLiberacoes.valor}), 0)::int` })
      .from(honorariosCenoLiberacoes)
      .where(and(eq(honorariosCenoLiberacoes.honorarioId, id), isNull(honorariosCenoLiberacoes.estornadaEm)));
    if (l.valor > faltaAntes(Number(total))) {
      tx.rollback();
    }
    const [liberacao] = await tx.insert(honorariosCenoLiberacoes).values({
      honorarioId: id, data: l.data, oc: l.oc, valor: l.valor, observacao: l.observacao, porId: ator.id, porNome: ator.nome,
    }).returning();
    await registrar(tx, id, ator, { acao: "liberacao", valorNovo: l.valor, detalhe: detalhe(Number(total) + l.valor) });
    return { honorario: linha, liberacao };
  }).catch((err: unknown) => {
    // tx.rollback() lança TransactionRollbackError — aqui significa "passou do que falta".
    if (err && typeof err === "object" && (err as { name?: string }).name === "TransactionRollbackError") return null;
    throw err;
  });
}

export async function getLiberacao(id: string): Promise<HonorarioCenoLiberacao | null> {
  const [l] = await db.select().from(honorariosCenoLiberacoes).where(eq(honorariosCenoLiberacoes.id, id)).limit(1);
  return l ?? null;
}

/** Estorno lógico de uma liberação (fica no histórico, sai da soma). */
export async function estornarLiberacao(
  id: string, versao: number, liberacaoId: string, motivo: string, ator: Ator, detalhe: string,
): Promise<HonorarioCeno | null> {
  return db.transaction(async (tx) => {
    const [linha] = await tx.update(honorariosCeno)
      .set({ versao: sql`${honorariosCeno.versao} + 1`, updatedAt: new Date() })
      .where(and(eq(honorariosCeno.id, id), eq(honorariosCeno.versao, versao)))
      .returning();
    if (!linha) return null;
    const [estornada] = await tx.update(honorariosCenoLiberacoes)
      .set({ estornadaEm: new Date(), estornadaPor: ator.id, estornadaPorNome: ator.nome, motivoEstorno: motivo })
      .where(and(eq(honorariosCenoLiberacoes.id, liberacaoId), eq(honorariosCenoLiberacoes.honorarioId, id), isNull(honorariosCenoLiberacoes.estornadaEm)))
      .returning();
    if (!estornada) { tx.rollback(); }
    await registrar(tx, id, ator, { acao: "liberacao_estornada", valorAnterior: estornada.valor, motivo, detalhe });
    return linha;
  }).catch((err: unknown) => {
    if (err && typeof err === "object" && (err as { name?: string }).name === "TransactionRollbackError") return null;
    throw err;
  });
}

// ── Leitura do histórico e das liberações ───────────────────────────────────

export async function historicoDe(honorarioId: string): Promise<HonorarioCenoHistorico[]> {
  return db.select().from(honorariosCenoHistorico)
    .where(eq(honorariosCenoHistorico.honorarioId, honorarioId))
    .orderBy(desc(honorariosCenoHistorico.em));
}

export async function liberacoesDe(honorarioIds: string[]): Promise<HonorarioCenoLiberacao[]> {
  if (honorarioIds.length === 0) return [];
  return db.select().from(honorariosCenoLiberacoes)
    .where(inArray(honorariosCenoLiberacoes.honorarioId, honorarioIds))
    .orderBy(desc(honorariosCenoLiberacoes.data), desc(honorariosCenoLiberacoes.createdAt));
}
