/**
 * A vaga já está no Realizado? Pelo colaborador e função ou pela linha do
 * Planejado gravada com a vaga (vaga sem colaborador, empreita por empresa).
 * Depois disso a prestação guarda os próprios valores: mudar a vaga não chega lá.
 */
import { and, eq, inArray, or } from "drizzle-orm";
import { budgetActual, budgetPlanned, type TeamInclusion } from "@shared/schema";
import { db } from "./db";

type VagaDaBusca = Pick<TeamInclusion, "id" | "eventId" | "collaboratorId" | "functionId">;

/** As linhas do Planejado desta vaga, gravadas com ela ou pela chave colaborador e função. */
export function linhasDoPlanejadoDaVaga(v: VagaDaBusca) {
  return db.select().from(budgetPlanned).where(and(
    eq(budgetPlanned.eventId, v.eventId),
    v.collaboratorId
      ? or(eq(budgetPlanned.teamInclusionId, v.id), and(eq(budgetPlanned.collaboratorId, v.collaboratorId), eq(budgetPlanned.functionId, v.functionId)))
      : eq(budgetPlanned.teamInclusionId, v.id),
  ));
}

export async function vagaJaNoRealizado(v: VagaDaBusca): Promise<boolean> {
  const linhas = await linhasDoPlanejadoDaVaga(v);
  const porColaborador = v.collaboratorId
    ? and(eq(budgetActual.collaboratorId, v.collaboratorId), eq(budgetActual.functionId, v.functionId))
    : undefined;
  const porLinha = linhas.length ? inArray(budgetActual.plannedId, linhas.map((l) => l.id)) : undefined;
  if (!porColaborador && !porLinha) return false;
  const [achada] = await db.select({ id: budgetActual.id }).from(budgetActual)
    .where(and(eq(budgetActual.eventId, v.eventId), or(porColaborador, porLinha))).limit(1);
  return !!achada;
}
