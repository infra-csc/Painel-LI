/**
 * Responsáveis por função em duas tabelas distintas:
 *  - `function_managers`: responsáveis clássicos (lista de GET /api/functions);
 *  - `scaling_function_managers`: validador/aprovador do MÓDULO DE ESCALA.
 * As consultas de papel (`getUserFunctionRole`, `isUserFunctionApprover`,
 * `getUserManagedFunctionIds`) leem a tabela do módulo de escala.
 */
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db";
import {
  functions, functionManagers, scalingFunctionManagers,
  type Function,
  type FunctionManager, type InsertFunctionManager,
  type ScalingFunctionManager, type InsertScalingFunctionManager,
} from "@shared/schema";
import { type FunctionManagerRole } from "./_comum";
import { COLUNAS_DA_FUNCAO } from "./funcoes";

// ── Responsáveis clássicos (function_managers) ────────────────────────────

export async function getFunctionManagers(functionId: string): Promise<FunctionManager[]> {
  return await db.select().from(functionManagers).where(eq(functionManagers.functionId, functionId));
}

export async function addManagerToFunction(functionManager: InsertFunctionManager): Promise<FunctionManager> {
  const [fm] = await db.insert(functionManagers).values(functionManager).returning();
  return fm;
}

export async function removeManagerFromFunction(functionId: string, userId: string): Promise<void> {
  await db.delete(functionManagers)
    .where(and(eq(functionManagers.functionId, functionId), eq(functionManagers.userId, userId)));
}

export async function updateManagerRole(functionId: string, userId: string, role: FunctionManagerRole): Promise<FunctionManager | undefined> {
  const [fm] = await db.update(functionManagers)
    .set({ role })
    .where(and(eq(functionManagers.functionId, functionId), eq(functionManagers.userId, userId)))
    .returning();
  return fm;
}

export async function removeUserFromAllFunctions(userId: string): Promise<void> {
  await db.delete(functionManagers).where(eq(functionManagers.userId, userId));
}

export async function getUserManagedFunctions(userId: string): Promise<Function[]> {
  return await db
    .select(COLUNAS_DA_FUNCAO)
    .from(functions)
    .innerJoin(functionManagers, eq(functions.id, functionManagers.functionId))
    .where(eq(functionManagers.userId, userId));
}

export async function isUserFunctionManager(functionId: string, userId: string): Promise<boolean> {
  const result = await db
    .select({ count: sql`count(*)`.as('count') })
    .from(functionManagers)
    .where(and(eq(functionManagers.functionId, functionId), eq(functionManagers.userId, userId)));

  return Number(result[0]?.count) > 0;
}

// ── Responsáveis do MÓDULO DE ESCALA (scaling_function_managers) ──────────

export async function getScalingManagers(functionId: string): Promise<ScalingFunctionManager[]> {
  return await db.select().from(scalingFunctionManagers).where(eq(scalingFunctionManagers.functionId, functionId));
}

export async function getAllScalingManagers(): Promise<ScalingFunctionManager[]> {
  return await db.select().from(scalingFunctionManagers);
}

export async function addScalingManager(row: InsertScalingFunctionManager): Promise<ScalingFunctionManager> {
  const [novo] = await db.insert(scalingFunctionManagers).values(row)
    .onConflictDoNothing({ target: [scalingFunctionManagers.functionId, scalingFunctionManagers.userId, scalingFunctionManagers.role] })
    .returning();
  if (novo) return novo;
  // Já existia: devolve a linha atual (o cadastro é idempotente).
  const [atual] = await db.select().from(scalingFunctionManagers).where(and(
    eq(scalingFunctionManagers.functionId, row.functionId),
    eq(scalingFunctionManagers.userId, row.userId),
    eq(scalingFunctionManagers.role, row.role ?? "validador"),
  )).limit(1);
  return atual;
}

export async function removeScalingManager(functionId: string, userId: string, role?: FunctionManagerRole): Promise<void> {
  const cond = role
    ? and(eq(scalingFunctionManagers.functionId, functionId), eq(scalingFunctionManagers.userId, userId), eq(scalingFunctionManagers.role, role))
    : and(eq(scalingFunctionManagers.functionId, functionId), eq(scalingFunctionManagers.userId, userId));
  await db.delete(scalingFunctionManagers).where(cond);
}

/**
 * Papel do usuário NO MÓDULO DE ESCALA — lê a tabela própria
 * (`scaling_function_managers`), não a lista clássica de responsáveis.
 * Aprovador vence validador quando a pessoa é as duas coisas na função.
 */
export async function getUserFunctionRole(functionId: string, userId: string): Promise<FunctionManagerRole | null> {
  const rows = await db
    .select({ role: scalingFunctionManagers.role })
    .from(scalingFunctionManagers)
    .where(and(eq(scalingFunctionManagers.functionId, functionId), eq(scalingFunctionManagers.userId, userId)));
  if (rows.length === 0) return null;
  return rows.some((r) => r.role === "aprovador") ? "aprovador" : "validador";
}

export async function isUserFunctionApprover(functionId: string, userId: string): Promise<boolean> {
  return (await getUserFunctionRole(functionId, userId)) === "aprovador";
}

/** Funções em que o usuário é validador/aprovador NO MÓDULO DE ESCALA. */
export async function getUserManagedFunctionIds(userId: string, role?: FunctionManagerRole): Promise<string[]> {
  const rows = await db
    .select({ functionId: scalingFunctionManagers.functionId, role: scalingFunctionManagers.role })
    .from(scalingFunctionManagers)
    .where(eq(scalingFunctionManagers.userId, userId));
  return rows
    .filter((r) => !role || (r.role === "aprovador" ? "aprovador" : "validador") === role)
    .map((r) => r.functionId);
}
