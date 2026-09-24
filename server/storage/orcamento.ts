/** Orçamento por evento: planejado, realizado e comparativo. */
import { eq } from "drizzle-orm";
import { db } from "../db";
import {
  budgetPlanned, budgetActual, budgetComparison,
  type BudgetPlanned, type InsertBudgetPlanned,
  type BudgetActual, type InsertBudgetActual,
  type BudgetComparison, type InsertBudgetComparison,
} from "@shared/schema";

// ── Planejado (budget_planned) ────────────────────────────────────────────

export async function getBudgetPlanned(eventId: string): Promise<BudgetPlanned[]> {
  return await db.select().from(budgetPlanned).where(eq(budgetPlanned.eventId, eventId));
}

export async function getBudgetPlannedById(id: string): Promise<BudgetPlanned | undefined> {
  const [planned] = await db.select().from(budgetPlanned).where(eq(budgetPlanned.id, id));
  return planned;
}

export async function getAllBudgetPlanned(): Promise<BudgetPlanned[]> {
  return await db.select().from(budgetPlanned);
}

export async function createBudgetPlanned(planned: InsertBudgetPlanned): Promise<BudgetPlanned> {
  const [created] = await db.insert(budgetPlanned).values(planned).returning();
  return created;
}

export async function updateBudgetPlanned(id: string, planned: Partial<InsertBudgetPlanned>): Promise<BudgetPlanned> {
  const [updated] = await db.update(budgetPlanned).set({ ...planned, updatedAt: new Date() }).where(eq(budgetPlanned.id, id)).returning();
  return updated;
}

export async function deleteBudgetPlanned(id: string): Promise<void> {
  await db.delete(budgetPlanned).where(eq(budgetPlanned.id, id));
}

// ── Realizado (budget_actual) ─────────────────────────────────────────────

export async function getBudgetActual(eventId: string): Promise<BudgetActual[]> {
  return await db.select().from(budgetActual).where(eq(budgetActual.eventId, eventId));
}

export async function getBudgetActualById(id: string): Promise<BudgetActual | undefined> {
  const [actual] = await db.select().from(budgetActual).where(eq(budgetActual.id, id));
  return actual;
}

export async function getAllBudgetActual(): Promise<BudgetActual[]> {
  return await db.select().from(budgetActual);
}

export async function createBudgetActual(actual: InsertBudgetActual): Promise<BudgetActual> {
  const [created] = await db.insert(budgetActual).values(actual).returning();
  return created;
}

export async function updateBudgetActual(id: string, actual: Partial<InsertBudgetActual>): Promise<BudgetActual> {
  const [updated] = await db.update(budgetActual).set({ ...actual, updatedAt: new Date() }).where(eq(budgetActual.id, id)).returning();
  return updated;
}

export async function deleteBudgetActual(id: string): Promise<void> {
  await db.delete(budgetActual).where(eq(budgetActual.id, id));
}

// ── Comparativo (budget_comparison) ───────────────────────────────────────

export async function getBudgetComparison(eventId: string): Promise<BudgetComparison | undefined> {
  const [comparison] = await db.select().from(budgetComparison).where(eq(budgetComparison.eventId, eventId));
  return comparison;
}

/** Comparativo pelo PRÓPRIO id (as decisões aprovar/recusar/devolver recebem o id, não o evento). */
export async function getBudgetComparisonById(id: string): Promise<BudgetComparison | undefined> {
  const [comparison] = await db.select().from(budgetComparison).where(eq(budgetComparison.id, id));
  return comparison;
}

export async function getAllBudgetComparisons(): Promise<BudgetComparison[]> {
  return await db.select().from(budgetComparison);
}

export async function createBudgetComparison(comparison: InsertBudgetComparison): Promise<BudgetComparison> {
  const [created] = await db.insert(budgetComparison).values(comparison).returning();
  return created;
}

export async function updateBudgetComparison(id: string, comparison: Partial<InsertBudgetComparison>): Promise<BudgetComparison> {
  const [updated] = await db.update(budgetComparison).set({ ...comparison, updatedAt: new Date() }).where(eq(budgetComparison.id, id)).returning();
  return updated;
}
