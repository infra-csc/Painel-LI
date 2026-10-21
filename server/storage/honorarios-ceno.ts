/**
 * Honorários da cenotécnica (16/10) — acesso a dados. Regras em
 * shared/honorarios-ceno.ts; autorização e HTTP em server/routes/honorarios-ceno.ts.
 *
 * Fica fora do objeto `storage` (como trocas e espelho): o módulo é à parte
 * e só as rotas dele leem estas funções — mais o Planejado, desde 21/10, que
 * lê os pedidos do evento por `honorariosParaPlanejado` (só leitura). NADA
 * aqui grava em team_inclusions nem no Planejado —
 * a vaga é só lida (para listar as escaladas e tirar o snapshot do nome).
 *
 * Toda mudança de estado usa UPDATE guardado (id + versao + status esperado)
 * dentro de transação, com o histórico gravado junto: zero linhas = alguém
 * mudou o pedido antes (a rota responde 409).
 */
import { and, desc, eq, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db";
import {
  honorariosCeno, honorariosCenoHistorico, honorariosCenoLiberacoes, honorariosCenoEmpreitaVagas,
  teamInclusions, functions, collaborators, events, scalingFunctionManagers, functionManagers, USUARIO_SISTEMA,
  type HonorarioCeno, type HonorarioCenoHistorico, type HonorarioCenoLiberacao, type InsertHonorarioCeno,
} from "@shared/schema";
import { ehCenotecnica } from "@shared/cenotecnica";
import { diasEmpreita } from "@shared/calculation-rules";
import {
  AVISO_NA_EMPREITA_LABEL, STATUS_DE_VAGA_ATIVA, avisoDaVaga, avisoDaVagaNaEmpreita, type AvisoDaVaga,
  type HonorarioParaPlanejado,
} from "@shared/honorarios-ceno";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Vaga que faz parte de uma empreita (20/10) — com quem está nela HOJE e o aviso, se mudou. */
export interface VagaDaEmpreita {
  id: string;
  inclusionNumber: number;
  functionId: string;
  functionName: string | null;
  collaboratorId: string | null;
  collaboratorName: string | null;
  scheduleStartDate: string | null;
  scheduleEndDate: string | null;
  /** Dias de trabalho (os mesmos da tabela de empreita). */
  dias: number;
  aviso: Exclude<AvisoDaVaga, "colaborador_trocado"> | null;
}

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
  /** A escala mudou depois do pedido (troca, cancelamento, exclusão…) — ver shared/honorarios-ceno.ts. */
  avisoDaVaga: AvisoDaVaga | null;
  /** Quem está HOJE na vaga (o pedido guarda o nome de quando foi feito). */
  colaboradorAtualId: string | null;
  colaboradorAtual: string | null;
  /** O evento foi excluído (soft delete) depois do pedido. */
  eventoExcluido: boolean;
  /** Pedido de VAGA ainda sem colaborador (vaga aberta) — "Vaga #N sem nome". */
  semColaborador: boolean;
  /** EMPREITA: as vagas que fazem parte dela (vazio na vaga e na equipe sem vaga). */
  vagasDaEmpreita: VagaDaEmpreita[];
  /** EMPREITA: o que mudou nas vagas dela ("#5063 cancelada na escala"), para o aviso. */
  avisosDaEmpreita: string[];
};

/** Colaborador que está hoje na vaga (o `collaborators` sem alias é o do pedido). */
const colaboradorDaVaga = alias(collaborators, "hon_colaborador_da_vaga");

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
      eventStatus: events.status,
      vagaId: teamInclusions.id,
      vagaStatus: teamInclusions.status,
      vagaDeletedAt: teamInclusions.deletedAt,
      vagaPhase: teamInclusions.phase,
      vagaFunctionId: teamInclusions.functionId,
      vagaCollaboratorId: teamInclusions.collaboratorId,
      vagaEmpreitaEmpresa: teamInclusions.empreitaEmpresa,
      vagaCollaboratorName: colaboradorDaVaga.fullName,
      vagaCollaboratorType: colaboradorDaVaga.type,
    })
    .from(honorariosCeno)
    .innerJoin(events, eq(events.id, honorariosCeno.eventId))
    .leftJoin(teamInclusions, eq(teamInclusions.id, honorariosCeno.teamInclusionId))
    .leftJoin(colaboradorDaVaga, eq(colaboradorDaVaga.id, teamInclusions.collaboratorId))
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
    avisoDaVaga: avisoDaVaga(l.h, l.vagaId ? {
      deletedAt: l.vagaDeletedAt, status: l.vagaStatus ?? null, phase: l.vagaPhase ?? null, functionId: l.vagaFunctionId ?? null,
      collaboratorId: l.vagaCollaboratorId ?? null, collaboratorType: l.vagaCollaboratorType ?? null, empreitaEmpresa: l.vagaEmpreitaEmpresa ?? null,
    } : null, STATUS_DE_VAGA_ATIVA),
    colaboradorAtualId: l.vagaCollaboratorId ?? null,
    colaboradorAtual: l.vagaCollaboratorName ?? null,
    eventoExcluido: l.eventStatus === "excluído" || l.eventStatus === "excluido",
    semColaborador: l.h.tipo === "vaga" && !l.h.collaboratorId,
    vagasDaEmpreita: [],
    avisosDaEmpreita: [],
  };
}

/**
 * Pedido feito na vaga ABERTA e a vaga ganhou um freela depois (20/10): o
 * pedido passa a ser dele — grava colaborador e nome (o retrato) e deixa no
 * histórico. NÃO é troca: não sobe a versão (quem está com a tela aberta
 * continua podendo salvar e enviar) e não pede confirmação. Idempotente e
 * seguro em corrida: só grava se o pedido ainda está sem colaborador.
 */
async function adotarColaboradorDaVaga(hs: HonorarioComContexto[]): Promise<void> {
  const alvos = hs.filter((h) => h.tipo === "vaga" && !h.collaboratorId && h.colaboradorAtualId && !h.avisoDaVaga);
  for (const h of alvos) {
    const nome = (h.colaboradorAtual ?? "").trim() || h.nome;
    const gravou = await db.transaction(async (tx) => {
      const [linha] = await tx.update(honorariosCeno)
        .set({ collaboratorId: h.colaboradorAtualId, nome })
        .where(and(eq(honorariosCeno.id, h.id), isNull(honorariosCeno.collaboratorId), eq(honorariosCeno.tipo, "vaga")))
        .returning({ id: honorariosCeno.id });
      if (!linha) return false;
      await registrar(tx, h.id, { id: USUARIO_SISTEMA.id, nome: "Escalação" }, { acao: "colaborador_escalado", detalhe: `Vaga escalada: ${h.nome} → ${nome}` });
      return true;
    });
    if (gravou) { h.collaboratorId = h.colaboradorAtualId; h.nome = nome; h.semColaborador = false; }
  }
}

/** Completa a leitura: adota o colaborador da vaga aberta e traz as vagas das empreitas. */
async function completar(hs: HonorarioComContexto[]): Promise<HonorarioComContexto[]> {
  if (hs.length === 0) return hs;
  await adotarColaboradorDaVaga(hs);
  const empreitas = hs.filter((h) => h.tipo === "empreita");
  if (empreitas.length) {
    const porEmpreita = await vagasDasEmpreitas(empreitas.map((h) => h.id));
    for (const h of empreitas) {
      h.vagasDaEmpreita = porEmpreita.get(h.id) ?? [];
      h.avisosDaEmpreita = h.vagasDaEmpreita.filter((v) => v.aviso).map((v) => `#${v.inclusionNumber} ${AVISO_NA_EMPREITA_LABEL[v.aviso!]}`);
    }
  }
  return hs;
}

export async function listarHonorarios(filtros: SQL[], opts: { limite?: number; ordem?: "decidido" | "evento" } = {}): Promise<HonorarioComContexto[]> {
  const q = selecaoComContexto()
    .where(filtros.length ? and(...filtros) : undefined)
    .orderBy(...(opts.ordem === "decidido"
      ? [desc(honorariosCeno.decididoEm), desc(honorariosCeno.updatedAt)]
      : [desc(events.startDate), honorariosCeno.tipo, honorariosCeno.nome]));
  const linhas = opts.limite ? await q.limit(opts.limite) : await q;
  return completar(linhas.map(comContexto));
}

export async function getHonorario(id: string): Promise<HonorarioComContexto | null> {
  const [l] = await selecaoComContexto().where(eq(honorariosCeno.id, id)).limit(1);
  return l ? (await completar([comContexto(l)]))[0] : null;
}

// ── Empreita que agrupa vagas (20/10) ───────────────────────────────────────

/** As vagas de cada empreita, com quem está nelas hoje e o aviso se a vaga mudou. */
export async function vagasDasEmpreitas(honorarioIds: string[]): Promise<Map<string, VagaDaEmpreita[]>> {
  const mapa = new Map<string, VagaDaEmpreita[]>();
  if (honorarioIds.length === 0) return mapa;
  const linhas = await db
    .select({
      honorarioId: honorariosCenoEmpreitaVagas.honorarioId,
      id: teamInclusions.id, inclusionNumber: teamInclusions.inclusionNumber, functionId: teamInclusions.functionId,
      functionName: functions.name, collaboratorId: teamInclusions.collaboratorId, collaboratorName: collaborators.fullName,
      collaboratorType: collaborators.type, status: teamInclusions.status, phase: teamInclusions.phase, deletedAt: teamInclusions.deletedAt,
      empreitaEmpresa: teamInclusions.empreitaEmpresa, scheduleStartDate: teamInclusions.scheduleStartDate,
      scheduleEndDate: teamInclusions.scheduleEndDate, workDays: teamInclusions.workDays, dailyRates: teamInclusions.dailyRates,
    })
    .from(honorariosCenoEmpreitaVagas)
    .innerJoin(teamInclusions, eq(teamInclusions.id, honorariosCenoEmpreitaVagas.teamInclusionId))
    .leftJoin(functions, eq(functions.id, teamInclusions.functionId))
    .leftJoin(collaborators, eq(collaborators.id, teamInclusions.collaboratorId))
    .where(inArray(honorariosCenoEmpreitaVagas.honorarioId, honorarioIds))
    .orderBy(teamInclusions.inclusionNumber);
  for (const l of linhas) {
    const inicio = l.scheduleStartDate ? String(l.scheduleStartDate) : null;
    const fim = l.scheduleEndDate ? String(l.scheduleEndDate) : null;
    const v: VagaDaEmpreita = {
      id: l.id, inclusionNumber: l.inclusionNumber, functionId: l.functionId, functionName: l.functionName ?? null,
      collaboratorId: l.collaboratorId ?? null, collaboratorName: l.collaboratorName ?? null,
      scheduleStartDate: inicio, scheduleEndDate: fim,
      dias: diasEmpreita({ workDays: (l.workDays ?? []).map(String), scheduleStartDate: inicio, scheduleEndDate: fim, dailyRates: l.dailyRates }),
      aviso: avisoDaVagaNaEmpreita({
        deletedAt: l.deletedAt, status: l.status ?? null, phase: l.phase ?? null, functionId: l.functionId,
        collaboratorId: l.collaboratorId ?? null, collaboratorType: l.collaboratorType ?? null, empreitaEmpresa: l.empreitaEmpresa ?? null,
      }, STATUS_DE_VAGA_ATIVA, ehCenotecnica(l.functionName, { incluiSupCeno: true })),
    };
    mapa.set(l.honorarioId, [...(mapa.get(l.honorarioId) ?? []), v]);
  }
  return mapa;
}

/** De que empreita é cada vaga (vagaId → { honorarioId, nome }). */
export async function empreitasDasVagas(vagaIds: string[]): Promise<Map<string, { honorarioId: string; nome: string; status: string }>> {
  const mapa = new Map<string, { honorarioId: string; nome: string; status: string }>();
  if (vagaIds.length === 0) return mapa;
  const linhas = await db
    .select({ vagaId: honorariosCenoEmpreitaVagas.teamInclusionId, honorarioId: honorariosCeno.id, nome: honorariosCeno.nome, status: honorariosCeno.status })
    .from(honorariosCenoEmpreitaVagas)
    .innerJoin(honorariosCeno, eq(honorariosCeno.id, honorariosCenoEmpreitaVagas.honorarioId))
    .where(inArray(honorariosCenoEmpreitaVagas.teamInclusionId, vagaIds));
  for (const l of linhas) mapa.set(l.vagaId, { honorarioId: l.honorarioId, nome: l.nome, status: l.status });
  return mapa;
}

/** Pedidos INDIVIDUAIS (tipo vaga) das vagas indicadas. */
export async function pedidosIndividuaisDasVagas(vagaIds: string[]): Promise<HonorarioCeno[]> {
  if (vagaIds.length === 0) return [];
  return db.select().from(honorariosCeno).where(and(eq(honorariosCeno.tipo, "vaga"), inArray(honorariosCeno.teamInclusionId, vagaIds)));
}

/** Erro de regra dentro da transação (a rota responde 409 com a mensagem). */
export class ConflitoDoHonorario extends Error {
  constructor(message: string) { super(message); this.name = "ConflitoDoHonorario"; }
}

/**
 * Grava as vagas da empreita (substitui a lista) na transação do pedido. Os
 * pedidos individuais em rascunho/devolvido dessas vagas são descartados
 * (quem pede confirmou na tela); se sobrar algum (corrida: alguém enviou no
 * meio), nada é gravado. Vaga já em outra empreita: o índice único recusa.
 */
export async function gravarVagasDaEmpreita(tx: Tx, honorarioId: string, vagaIds: string[], descartar: string[], ator: Ator): Promise<void> {
  if (descartar.length) {
    const removidos = await tx.delete(honorariosCeno)
      .where(and(inArray(honorariosCeno.id, descartar), eq(honorariosCeno.tipo, "vaga"), inArray(honorariosCeno.status, ["rascunho", "devolvido"])))
      .returning({ id: honorariosCeno.id, nome: honorariosCeno.nome });
    for (const r of removidos) {
      await registrar(tx, honorarioId, ator, { acao: "pedido_individual_descartado", detalhe: `Pedido próprio de ${r.nome} descartado — a vaga entrou na empreita` });
    }
  }
  if (vagaIds.length) {
    const restantes = await tx.select({ id: honorariosCeno.id, nome: honorariosCeno.nome }).from(honorariosCeno)
      .where(and(eq(honorariosCeno.tipo, "vaga"), inArray(honorariosCeno.teamInclusionId, vagaIds)));
    if (restantes.length) throw new ConflitoDoHonorario(`${restantes[0].nome} tem pedido próprio — recarregue e tente de novo.`);
  }
  await tx.delete(honorariosCenoEmpreitaVagas).where(eq(honorariosCenoEmpreitaVagas.honorarioId, honorarioId));
  if (vagaIds.length) {
    await tx.insert(honorariosCenoEmpreitaVagas).values(vagaIds.map((teamInclusionId) => ({ honorarioId, teamInclusionId })));
  }
}

/** Na criação do pedido individual: a vaga não pode ter entrado numa empreita no meio. */
export async function garantirVagaForaDeEmpreita(tx: Tx, vagaId: string): Promise<void> {
  const [l] = await tx.select({ nome: honorariosCeno.nome }).from(honorariosCenoEmpreitaVagas)
    .innerJoin(honorariosCeno, eq(honorariosCeno.id, honorariosCenoEmpreitaVagas.honorarioId))
    .where(eq(honorariosCenoEmpreitaVagas.teamInclusionId, vagaId)).limit(1);
  if (l) throw new ConflitoDoHonorario(`Esta vaga faz parte da empreita ${l.nome} — o valor dela é o da empreita.`);
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

// ── Vagas ativas de cenotécnica ─────────────────────────────────────────────

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
  /** Dias de trabalho da vaga (os da tabela de empreita: dias marcados, período ou diárias). */
  dias: number;
}

/**
 * Vagas ATIVAS das funções indicadas, num evento ou em vários: escaladas
 * (status de confirmação, inclusive os legados) e, desde 20/10, também as
 * abertas/só salvas — "não precisa escalar". Sem as canceladas, as excluídas
 * e a fase de sugestão.
 */
export async function vagasAtivas(functionIds: string[], eventIds?: string[], vagaId?: string): Promise<VagaDeCenotecnica[]> {
  if (functionIds.length === 0) return [];
  if (eventIds && eventIds.length === 0) return [];
  const condicoes: SQL[] = [
    inArray(teamInclusions.functionId, functionIds),
    inArray(teamInclusions.status, [...STATUS_DE_VAGA_ATIVA]),
    isNull(teamInclusions.deletedAt),
    // `phase <> 'sugestao'` sozinho deixaria de fora a vaga com fase nula.
    or(isNull(teamInclusions.phase), ne(teamInclusions.phase, "sugestao"))!,
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
      workDays: teamInclusions.workDays,
    })
    .from(teamInclusions)
    .innerJoin(functions, eq(functions.id, teamInclusions.functionId))
    .leftJoin(collaborators, eq(collaborators.id, teamInclusions.collaboratorId))
    .where(and(...condicoes))
    .orderBy(functions.name, teamInclusions.inclusionNumber);
  return linhas.map(({ workDays, ...l }) => {
    const scheduleStartDate = l.scheduleStartDate ? String(l.scheduleStartDate) : null;
    const scheduleEndDate = l.scheduleEndDate ? String(l.scheduleEndDate) : null;
    return {
      ...l,
      collaboratorName: l.collaboratorName ?? null,
      collaboratorType: l.collaboratorType ?? null,
      scheduleStartDate,
      scheduleEndDate,
      dias: diasEmpreita({ workDays: (workDays ?? []).map(String), scheduleStartDate, scheduleEndDate, dailyRates: l.dailyRates }),
    };
  });
}

/** A vaga, se estiver ATIVA e for de uma das funções indicadas (senão null). */
export async function getVagaAtiva(id: string, functionIds: string[]): Promise<VagaDeCenotecnica | null> {
  const [v] = await vagasAtivas(functionIds, undefined, id);
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

/**
 * Os pedidos do evento como o PLANEJADO lê (21/10) — SÓ LEITURA: não passa
 * por `completar` (que grava o colaborador da vaga aberta no pedido); o aviso
 * de cada vaga sai do mesmo `avisoDaVaga`/`avisoDaVagaNaEmpreita` das telas do
 * módulo. A regra (aprovado vale, rateio da empreita) fica em
 * shared/honorarios-ceno.ts · honorariosNasVagas.
 */
export async function honorariosParaPlanejado(eventId: string): Promise<HonorarioParaPlanejado[]> {
  const linhas = (await selecaoComContexto().where(eq(honorariosCeno.eventId, eventId))).map(comContexto);
  const empreitas = linhas.filter((h) => h.tipo === "empreita").map((h) => h.id);
  const vagasPorEmpreita = await vagasDasEmpreitas(empreitas);
  return linhas.map((h) => ({
    id: h.id,
    tipo: h.tipo,
    nome: h.nome,
    status: h.status,
    valorPedido: h.valorPedido,
    valorAprovado: h.valorAprovado,
    decididoPorNome: h.decididoPorNome,
    decididoEm: h.decididoEm ? new Date(h.decididoEm).toISOString() : null,
    teamInclusionId: h.teamInclusionId,
    avisoDaVaga: h.avisoDaVaga,
    vagas: (vagasPorEmpreita.get(h.id) ?? []).map((v) => ({ id: v.id, inclusionNumber: v.inclusionNumber, ativa: !v.aviso })),
  }));
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

/** Passo extra na MESMA transação (vagas da empreita, conferência da vaga). Lança para desfazer tudo. */
export type PassoNaTransacao = (tx: Tx, honorarioId: string) => Promise<void>;

export async function criarHonorario(row: InsertHonorarioCeno, ator: Ator, historico: EntradaDoHistorico, extra?: PassoNaTransacao): Promise<HonorarioCeno> {
  return db.transaction(async (tx) => {
    const [novo] = await tx.insert(honorariosCeno).values(row).returning();
    await registrar(tx, novo.id, ator, historico);
    if (extra) await extra(tx, novo.id);
    return novo;
  });
}

/**
 * UPDATE guardado: só grava se a versão e o status ainda são os esperados.
 * Devolve a linha nova ou null (corrida perdida → 409 na rota).
 */
export async function atualizarGuardado(
  id: string, versao: number, statusEsperados: readonly string[],
  set: Partial<InsertHonorarioCeno>, ator: Ator, historico: EntradaDoHistorico | readonly EntradaDoHistorico[] | null,
  extra?: PassoNaTransacao,
): Promise<HonorarioCeno | null> {
  return db.transaction(async (tx) => {
    const [linha] = await tx.update(honorariosCeno)
      .set({ ...set, versao: sql`${honorariosCeno.versao} + 1`, updatedAt: new Date() })
      .where(and(eq(honorariosCeno.id, id), eq(honorariosCeno.versao, versao), inArray(honorariosCeno.status, [...statusEsperados])))
      .returning();
    if (!linha) return null;
    const entradas: readonly EntradaDoHistorico[] = historico == null ? [] : Array.isArray(historico) ? historico : [historico as EntradaDoHistorico];
    for (const e of entradas) await registrar(tx, id, ator, e);
    if (extra) await extra(tx, id);
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
