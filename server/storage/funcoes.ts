/** Funções (tabela functions) e usuários atribuídos a elas (function_users). */
import { eq, and, inArray, getTableColumns } from "drizzle-orm";
import { db } from "../db";
import {
  functions, functionUsers, functionManagers, users,
  type Function, type InsertFunction,
  type FunctionUser, type InsertFunctionUser,
} from "@shared/schema";
import { idsUnicos, type FunctionManagerRole } from "./_comum";

/** Responsável embutido em GET /api/functions — só o que a lista precisa. */
export interface FunctionManagerSummary {
  userId: string;
  userName: string;
  role: FunctionManagerRole;
}
export type FunctionWithManagers = Function & { managers: FunctionManagerSummary[] };

/**
 * Todas as colunas de `functions`, para SELECTs com JOIN devolverem a linha
 * "achatada" (sem o JOIN o `select()` vazio já faria isso; com JOIN o drizzle
 * aninha por tabela). Antes as duas consultas listavam as 9 colunas à mão.
 */
export const COLUNAS_DA_FUNCAO = getTableColumns(functions);

export async function getFunctions(): Promise<Function[]> {
  return await db.select().from(functions);
}

export async function getFunctionsWithManagers(): Promise<FunctionWithManagers[]> {
  // 2 queries no total (funções + responsáveis com join em users), em vez
  // de 1 + N chamadas a /api/functions/:id/managers a partir do client.
  const [funcs, managerRows] = await Promise.all([
    db.select().from(functions),
    db
      .select({
        functionId: functionManagers.functionId,
        userId: functionManagers.userId,
        role: functionManagers.role,
        userName: users.name,
        userEmail: users.email,
      })
      .from(functionManagers)
      .leftJoin(users, eq(users.id, functionManagers.userId)),
  ]);
  const byFunction = new Map<string, FunctionManagerSummary[]>();
  for (const m of managerRows) {
    const list = byFunction.get(m.functionId) ?? [];
    list.push({
      userId: m.userId,
      userName: m.userName || m.userEmail || "Usuário",
      role: m.role === "aprovador" ? "aprovador" : "validador",
    });
    byFunction.set(m.functionId, list);
  }
  return funcs.map(f => ({ ...f, managers: byFunction.get(f.id) ?? [] }));
}

export async function getFunction(id: string): Promise<Function | undefined> {
  const [func] = await db.select().from(functions).where(eq(functions.id, id));
  return func;
}

export async function getFunctionsByIds(ids: string[]): Promise<Function[]> {
  const unique = idsUnicos(ids);
  if (unique.length === 0) return [];
  return await db.select().from(functions).where(inArray(functions.id, unique));
}

export async function createFunction(functionData: InsertFunction): Promise<Function> {
  const [func] = await db.insert(functions).values(functionData).returning();
  return func;
}

export async function getFunctionsByUser(userId: string): Promise<Function[]> {
  return await db.select().from(functions).where(eq(functions.userId, userId));
}

export async function updateFunction(id: string, functionData: Partial<InsertFunction>): Promise<Function> {
  const [func] = await db.update(functions).set(functionData).where(eq(functions.id, id)).returning();
  return func;
}

export async function deleteFunction(id: string): Promise<void> {
  await db.delete(functions).where(eq(functions.id, id));
}

// ── Usuários atribuídos à função (function_users) ─────────────────────────

export async function getFunctionUsers(functionId: string): Promise<FunctionUser[]> {
  return await db.select().from(functionUsers).where(eq(functionUsers.functionId, functionId));
}

export async function addUserToFunction(functionUser: InsertFunctionUser): Promise<FunctionUser> {
  const [fu] = await db.insert(functionUsers).values(functionUser).returning();
  return fu;
}

export async function removeUserFromFunction(functionId: string, userId: string): Promise<void> {
  await db.delete(functionUsers)
    .where(and(eq(functionUsers.functionId, functionId), eq(functionUsers.userId, userId)));
}

export async function getUserFunctions(userId: string): Promise<Function[]> {
  return await db
    .select(COLUNAS_DA_FUNCAO)
    .from(functions)
    .innerJoin(functionUsers, eq(functions.id, functionUsers.functionId))
    .where(eq(functionUsers.userId, userId));
}
