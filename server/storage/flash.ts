/** Lançamentos Flash (tabela flash_movements). */
import { eq, and, asc } from "drizzle-orm";
import { db } from "../db";
import { flashMovements, type FlashMovement, type InsertFlashMovement } from "@shared/schema";

/**
 * Lançamento Flash com origem explícita. O schema público (insertFlashMovementSchema)
 * omite sourceType/sourceRef para o body da API nunca criar um "automático";
 * só o servidor (server/flash-credit.ts) grava sourceType automático ("comparativo";
 * "oc" é legado congelado da regra antiga).
 */
export type InsertFlashMovementWithSource = InsertFlashMovement & {
  sourceType?: "manual" | "comparativo" | "oc";
  sourceRef?: string | null;
};

export async function getFlashMovements(collaboratorId?: string): Promise<FlashMovement[]> {
  const base = db.select().from(flashMovements);
  const ordered = collaboratorId
    ? base.where(eq(flashMovements.collaboratorId, collaboratorId))
    : base;
  return await ordered.orderBy(asc(flashMovements.movementDate), asc(flashMovements.createdAt));
}

export async function getFlashMovement(id: string): Promise<FlashMovement | undefined> {
  const [row] = await db.select().from(flashMovements).where(eq(flashMovements.id, id));
  return row;
}

export async function getFlashMovementsBySource(sourceType: string, sourceRef: string): Promise<FlashMovement[]> {
  return await db.select().from(flashMovements)
    .where(and(eq(flashMovements.sourceType, sourceType), eq(flashMovements.sourceRef, sourceRef)));
}

export async function createFlashMovement(movement: InsertFlashMovementWithSource): Promise<FlashMovement> {
  const [created] = await db.insert(flashMovements).values(movement).returning();
  return created;
}

// Inserção atômica (crédito inicial = 2 lançamentos que não podem ficar pela metade)
export async function createFlashMovementsBatch(movements: InsertFlashMovementWithSource[]): Promise<FlashMovement[]> {
  return await db.transaction(async (tx) => {
    const created: FlashMovement[] = [];
    for (const m of movements) {
      const [row] = await tx.insert(flashMovements).values(m).returning();
      created.push(row);
    }
    return created;
  });
}

// Edição in-place: substitui o antigo fluxo delete+recreate do client, que
// perdia o lançamento original quando a recriação falhava.
export async function updateFlashMovement(id: string, updates: Partial<InsertFlashMovementWithSource>): Promise<FlashMovement | undefined> {
  const [updated] = await db
    .update(flashMovements)
    .set(updates)
    .where(eq(flashMovements.id, id))
    .returning();
  return updated;
}

export async function deleteFlashMovement(id: string): Promise<void> {
  await db.delete(flashMovements).where(eq(flashMovements.id, id));
}
