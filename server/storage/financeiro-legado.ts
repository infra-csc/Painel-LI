/** Financeiro legado (tabela financial) — usado só por routes/financeiro-legado.ts. */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { financial, type Financial, type InsertFinancial } from "@shared/schema";

export async function getFinancials(): Promise<Financial[]> {
  return await db.select().from(financial);
}

export async function getFinancial(id: string): Promise<Financial | undefined> {
  const [fin] = await db.select().from(financial).where(eq(financial.id, id));
  return fin;
}

export async function createFinancial(financialData: InsertFinancial): Promise<Financial> {
  const [fin] = await db.insert(financial).values(financialData).returning();
  return fin;
}

export async function updateFinancial(id: string, financialData: Partial<InsertFinancial>): Promise<Financial> {
  const [fin] = await db.update(financial).set(financialData).where(eq(financial.id, id)).returning();
  return fin;
}
