/** Auditoria geral (tabela system_logs). */
import { eq, and, or, sql, desc, ilike, gte } from "drizzle-orm";
import { db } from "../db";
import { systemLogs, type SystemLog, type InsertSystemLog } from "@shared/schema";

export interface SystemLogFilters {
  entityType?: string;
  action?: string;
  days?: number;
  search?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}

export async function getSystemLogs(filters?: SystemLogFilters): Promise<{ logs: SystemLog[]; total: number }> {
  // Auditoria 28/08: antes a tabela INTEIRA vinha para o Node e filtro/ordem/
  // página aconteciam em JS — com o log só crescendo, cada visita ao
  // Histórico ficava mais lenta. Agora WHERE/ORDER/LIMIT/COUNT são do banco.
  const conds = [] as ReturnType<typeof eq>[];
  if (filters?.entityType && filters.entityType !== "all") conds.push(eq(systemLogs.entityType, filters.entityType));
  if (filters?.action && filters.action !== "all") conds.push(eq(systemLogs.action, filters.action));
  if (filters?.userId) conds.push(eq(systemLogs.userId, filters.userId));
  if (filters?.days) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - filters.days);
    conds.push(gte(systemLogs.createdAt, cutoffDate) as any);
  }
  if (filters?.search) {
    const term = `%${filters.search}%`;
    conds.push(or(
      ilike(systemLogs.entityName, term),
      ilike(systemLogs.userName, term),
      ilike(systemLogs.details, term),
      ilike(systemLogs.action, term),
      ilike(systemLogs.entityType, term),
    ) as any);
  }
  const where = conds.length > 0 ? and(...conds) : undefined;

  let query = db.select().from(systemLogs).where(where).orderBy(desc(systemLogs.createdAt)).$dynamic();
  if (filters?.limit !== undefined) query = query.limit(filters.limit).offset(filters.offset ?? 0);
  const [logs, [{ count }]] = await Promise.all([
    query,
    db.select({ count: sql<number>`count(*)::int` }).from(systemLogs).where(where),
  ]);
  return { logs, total: count };
}

export async function createSystemLog(logData: InsertSystemLog): Promise<SystemLog> {
  const [log] = await db.insert(systemLogs).values(logData).returning();
  return log;
}

export async function createSystemLogsBatch(logs: InsertSystemLog[]): Promise<void> {
  if (logs.length === 0) return;
  await db.insert(systemLogs).values(logs);
}
