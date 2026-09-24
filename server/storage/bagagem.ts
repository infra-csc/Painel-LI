/**
 * Controle de Bagagem: pedidos (baggage_requests, soft delete) e histórico
 * pré-sistema (baggage_history, importado da planilha antiga).
 */
import { eq, and, isNull, desc } from "drizzle-orm";
import { db } from "../db";
import {
  baggageRequests, baggageHistory,
  type BaggageRequest, type InsertBaggageRequest, type BaggageHistoryEntry,
} from "@shared/schema";

// ── Pedidos (baggage_requests) ────────────────────────────────────────────
// Soft delete: as listagens só devolvem registros com deleted_at nulo.

export async function getBaggageRequests(eventId?: string): Promise<BaggageRequest[]> {
  const conditions = eventId
    ? and(isNull(baggageRequests.deletedAt), eq(baggageRequests.eventId, eventId))
    : isNull(baggageRequests.deletedAt);
  return await db.select().from(baggageRequests)
    .where(conditions)
    .orderBy(desc(baggageRequests.boardingDate), desc(baggageRequests.createdAt));
}

export async function getBaggageRequest(id: string): Promise<BaggageRequest | undefined> {
  const [row] = await db.select().from(baggageRequests).where(eq(baggageRequests.id, id));
  return row || undefined;
}

export async function createBaggageRequest(request: InsertBaggageRequest & { createdBy?: string | null; createdByName?: string | null }): Promise<BaggageRequest> {
  const [created] = await db.insert(baggageRequests).values(request).returning();
  return created;
}

export async function updateBaggageRequest(id: string, updates: Partial<InsertBaggageRequest>): Promise<BaggageRequest | undefined> {
  const [updated] = await db.update(baggageRequests)
    .set(updates)
    .where(and(eq(baggageRequests.id, id), isNull(baggageRequests.deletedAt)))
    .returning();
  return updated || undefined;
}

export async function softDeleteBaggageRequest(id: string, deletedBy: string): Promise<void> {
  await db.update(baggageRequests)
    .set({ deletedAt: new Date(), deletedBy })
    .where(and(eq(baggageRequests.id, id), isNull(baggageRequests.deletedAt)));
}

// ── Histórico pré-sistema (baggage_history; somente leitura no dia a dia) ──

export async function getBaggageHistory(): Promise<BaggageHistoryEntry[]> {
  return await db.select().from(baggageHistory);
}

// Define a contagem histórica de um colaborador × CIA (UPSERT). quantity 0
// remove a linha — o histórico só guarda contagens > 0.
export async function setBaggageHistory(
  collaboratorId: string, cia: string, quantity: number, sourceName?: string | null,
): Promise<BaggageHistoryEntry | null> {
  const where = and(eq(baggageHistory.collaboratorId, collaboratorId), eq(baggageHistory.cia, cia));
  if (quantity <= 0) {
    await db.delete(baggageHistory).where(where);
    return null;
  }
  const [existing] = await db.select().from(baggageHistory).where(where);
  if (existing) {
    const [row] = await db.update(baggageHistory)
      .set({ quantity, ...(sourceName !== undefined ? { sourceName } : {}) })
      .where(where).returning();
    return row;
  }
  const [row] = await db.insert(baggageHistory)
    .values({ collaboratorId, cia, quantity, sourceName: sourceName ?? "ajuste manual" })
    .returning();
  return row;
}
