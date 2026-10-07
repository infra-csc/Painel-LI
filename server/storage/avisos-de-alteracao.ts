/**
 * Avisos de alteração para Compras (02/10) — ver shared/aviso-de-alteracao.ts.
 * Quem CRIA é a aprovação do ajuste (resolveScalingChangeRequest, na mesma
 * transação); aqui só a leitura da fila e o "Já atuei".
 */
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "../db";
import {
  avisosDeAlteracao, teamInclusions, collaborators, functions, events,
  type AvisoDeAlteracao,
} from "@shared/schema";

/** O aviso com o que a tela precisa para dizer "qual prova, qual vaga, quem". */
export type AvisoDeAlteracaoComVaga = AvisoDeAlteracao & {
  inclusionNumber: number | null;
  eventName: string | null;
  eventStartDate: string | null;
  functionName: string | null;
  collaboratorName: string | null;
};

/** Resolvidos aparecem só os mais recentes — a fila é dos pendentes. */
const LIMITE_RESOLVIDOS = 100;

export async function getAvisosDeAlteracao(
  opts: { situacao?: "pendente" | "resolvido"; eventId?: string; teamInclusionId?: string } = {},
): Promise<AvisoDeAlteracaoComVaga[]> {
  const situacao = opts.situacao ?? "pendente";
  const filtros = [
    situacao === "pendente" ? isNull(avisosDeAlteracao.resolvidoEm) : isNotNull(avisosDeAlteracao.resolvidoEm),
    ...(opts.eventId ? [eq(avisosDeAlteracao.eventId, opts.eventId)] : []),
    ...(opts.teamInclusionId ? [eq(avisosDeAlteracao.teamInclusionId, opts.teamInclusionId)] : []),
  ];
  const q = db
    .select({
      aviso: avisosDeAlteracao,
      inclusionNumber: teamInclusions.inclusionNumber,
      eventName: events.name,
      eventStartDate: events.startDate,
      functionName: functions.name,
      collaboratorName: collaborators.fullName,
    })
    .from(avisosDeAlteracao)
    .innerJoin(teamInclusions, eq(teamInclusions.id, avisosDeAlteracao.teamInclusionId))
    .leftJoin(events, eq(events.id, avisosDeAlteracao.eventId))
    .leftJoin(functions, eq(functions.id, teamInclusions.functionId))
    .leftJoin(collaborators, eq(collaborators.id, teamInclusions.collaboratorId))
    .where(and(...filtros))
    .orderBy(situacao === "pendente" ? avisosDeAlteracao.aprovadoEm : desc(avisosDeAlteracao.resolvidoEm));
  const linhas = situacao === "resolvido" ? await q.limit(LIMITE_RESOLVIDOS) : await q;
  return linhas.map(({ aviso, ...resto }) => ({
    ...aviso,
    inclusionNumber: resto.inclusionNumber ?? null,
    eventName: resto.eventName ?? null,
    eventStartDate: resto.eventStartDate ? String(resto.eventStartDate) : null,
    functionName: resto.functionName ?? null,
    collaboratorName: resto.collaboratorName ?? null,
  }));
}

/**
 * "Já atuei": marca o aviso como resolvido. UPDATE guardado — se outra pessoa
 * de Compras resolveu antes, devolve null (a rota responde 409).
 */
export async function resolverAvisoDeAlteracao(
  id: string,
  por: { id: string; nome: string },
  resolucao: string | null,
): Promise<AvisoDeAlteracao | null> {
  const [linha] = await db.update(avisosDeAlteracao)
    .set({ resolvidoEm: new Date(), resolvidoPor: por.id, resolvidoPorNome: por.nome, resolucao })
    .where(and(eq(avisosDeAlteracao.id, id), isNull(avisosDeAlteracao.resolvidoEm)))
    .returning();
  return linha ?? null;
}

export async function getAvisoDeAlteracao(id: string): Promise<AvisoDeAlteracao | undefined> {
  const [linha] = await db.select().from(avisosDeAlteracao).where(eq(avisosDeAlteracao.id, id));
  return linha;
}
