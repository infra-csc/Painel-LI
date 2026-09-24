/** Valores de diária por função (tabela function_values). */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { functionValues, type FunctionValue, type InsertFunctionValue } from "@shared/schema";

export async function getFunctionValues(functionId: string): Promise<FunctionValue | undefined> {
  const [value] = await db.select().from(functionValues).where(eq(functionValues.functionId, functionId));
  return value;
}

export async function getAllFunctionValues(): Promise<FunctionValue[]> {
  return await db.select().from(functionValues);
}

export async function createFunctionValue(value: InsertFunctionValue): Promise<FunctionValue> {
  const [created] = await db.insert(functionValues).values(value).returning();
  return created;
}

export async function updateFunctionValue(id: string, value: Partial<InsertFunctionValue>): Promise<FunctionValue> {
  const [updated] = await db.update(functionValues).set({ ...value, updatedAt: new Date() }).where(eq(functionValues.id, id)).returning();
  return updated;
}
