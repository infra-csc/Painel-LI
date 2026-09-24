/** Colaboradores (tabela collaborators). */
import { eq, and, sql, isNull, exists, asc } from "drizzle-orm";
import { db } from "../db";
import { collaborators, teamInclusions, type Collaborator, type InsertCollaborator } from "@shared/schema";

export async function getCollaborators(eventId?: string): Promise<Collaborator[]> {
  // Sem ORDER BY o Postgres devolve na ordem física das linhas, que muda
  // conforme os registros são atualizados — a lista parecia embaralhar
  // sozinha. lower() para "ana" e "Ana" ficarem juntos independentemente da
  // collation do banco.
  const base = db.select().from(collaborators).$dynamic();
  const q = eventId
    ? base.where(exists(
        db.select({ id: teamInclusions.id }).from(teamInclusions).where(and(
          eq(teamInclusions.collaboratorId, collaborators.id),
          eq(teamInclusions.eventId, eventId),
          isNull(teamInclusions.deletedAt),
        )),
      ))
    : base;
  return await q.orderBy(asc(sql`lower(${collaborators.fullName})`));
}

export async function getCollaborator(id: string): Promise<Collaborator | undefined> {
  const [collaborator] = await db.select().from(collaborators).where(eq(collaborators.id, id));
  return collaborator;
}

export async function getCollaboratorByDocument(officialDocument: string): Promise<Collaborator | undefined> {
  // Compara só letras e dígitos: "123.456.789-00" e "12345678900" são o
  // mesmo CPF. Antes a rota carregava a tabela inteira e comparava texto cru.
  const normalizado = String(officialDocument ?? "").replace(/[^0-9A-Za-z]/g, "").toLowerCase();
  if (!normalizado) return undefined;
  const [row] = await db.select().from(collaborators)
    .where(sql`lower(regexp_replace(${collaborators.officialDocument}, '[^0-9A-Za-z]', '', 'g')) = ${normalizado}`)
    .limit(1);
  return row;
}

export async function createCollaborator(collaboratorData: InsertCollaborator): Promise<Collaborator> {
  const [collaborator] = await db.insert(collaborators).values(collaboratorData).returning();
  return collaborator;
}

/**
 * O que um PATCH de colaborador pode gravar: o schema público mais
 * `inactivatedAt`, que só as rotas /inactivate e /reactivate preenchem.
 */
export type CollaboratorPatch = Partial<InsertCollaborator> & { inactivatedAt?: Date | null };

export async function updateCollaborator(id: string, collaboratorData: CollaboratorPatch): Promise<Collaborator> {
  const [collaborator] = await db.update(collaborators).set(collaboratorData).where(eq(collaborators.id, id)).returning();
  return collaborator;
}

export async function deleteCollaborator(id: string): Promise<void> {
  await db.delete(collaborators).where(eq(collaborators.id, id));
}
