/** Auditoria geral (tabela system_logs). */
import { eq, and, or, sql, desc, ilike, gte, inArray, type SQL } from "drizzle-orm";
import { db } from "../db";
import { systemLogs, type SystemLog, type InsertSystemLog } from "@shared/schema";
import { ACOES, FILTRO_EXCLUSAO, MODULOS, STATUS_DE_EVENTO_EXCLUIDO } from "@shared/log-auditoria";

/** % e _ digitados valem como texto, não como curinga do LIKE. */
const escaparLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Códigos (action / entity_type) cujo nome em pt-BR contém o termo — a tela mostra "Exclusão", "Eventos". */
const codigosQueCasam = (mapa: Record<string, { rotulo: string }>, termo: string) => {
  const t = semAcento(termo.trim());
  return t ? Object.entries(mapa).filter(([, v]) => semAcento(v.rotulo).includes(t)).map(([k]) => k) : [];
};

/**
 * `update` que a tela mostra como "Exclusão" — a MESMA regra de
 * `updateLidoComoExclusao` (shared/log-auditoria.ts), em SQL: evento que passou
 * para "excluído" ou vaga que ganhou `deletedAt`, só com antes E depois
 * gravados (um diff de verdade). `->>` num jsonb que não é objeto devolve NULL
 * (registros antigos gravados como texto não casam — não quebram a consulta).
 */
const temConteudoJson = (col: typeof systemLogs.previousData | typeof systemLogs.newData) =>
  sql`(jsonb_typeof(${col}) = 'object' AND ${col} <> '{}'::jsonb)`;
const excluidos = sql.join(STATUS_DE_EVENTO_EXCLUIDO.map((v) => sql`${v}`), sql`, `);
const updateLidoComoExclusaoSql = (): SQL => sql`(
  ${systemLogs.action} = 'update' AND ${temConteudoJson(systemLogs.previousData)} AND ${temConteudoJson(systemLogs.newData)} AND (
    (${systemLogs.entityType} = 'event'
      AND (${systemLogs.newData} ->> 'status') IN (${excluidos})
      AND COALESCE(${systemLogs.previousData} ->> 'status', '') NOT IN (${excluidos}))
    OR (${systemLogs.entityType} = 'team_inclusion'
      AND COALESCE(${systemLogs.newData} ->> 'deletedAt', '') <> ''
      AND COALESCE(${systemLogs.previousData} ->> 'deletedAt', '') = '')
  )
)`;

export interface SystemLogFilters {
  entityType?: string;
  /** Código da ação, ou `FILTRO_EXCLUSAO` ("exclusao"): o que a tela chama de Exclusão. */
  action?: string;
  days?: number;
  search?: string;
  userId?: string;
  /** Nome gravado de quem fez (08/10): pessoa sem cadastro ou ação do sistema (`userId` nulo). */
  userName?: string;
  limit?: number;
  offset?: number;
}

export async function getSystemLogs(filters?: SystemLogFilters): Promise<{ logs: SystemLog[]; total: number }> {
  // Auditoria 28/08: antes a tabela INTEIRA vinha para o Node e filtro/ordem/
  // página aconteciam em JS — com o log só crescendo, cada visita ao
  // Histórico ficava mais lenta. Agora WHERE/ORDER/LIMIT/COUNT são do banco.
  const conds: SQL[] = [];
  if (filters?.entityType && filters.entityType !== "all") conds.push(eq(systemLogs.entityType, filters.entityType));
  if (filters?.action === FILTRO_EXCLUSAO) conds.push(or(eq(systemLogs.action, "delete"), updateLidoComoExclusaoSql())!);
  else if (filters?.action && filters.action !== "all") conds.push(eq(systemLogs.action, filters.action));
  if (filters?.userId) conds.push(eq(systemLogs.userId, filters.userId));
  if (filters?.userName) conds.push(eq(systemLogs.userName, filters.userName));
  if (filters?.days) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - filters.days);
    conds.push(gte(systemLogs.createdAt, cutoffDate));
  }
  if (filters?.search) {
    const term = `%${escaparLike(filters.search)}%`;
    const acoes = codigosQueCasam(ACOES, filters.search);
    const modulos = codigosQueCasam(MODULOS, filters.search);
    conds.push(or(
      ilike(systemLogs.entityName, term),
      ilike(systemLogs.userName, term),
      ilike(systemLogs.details, term),
      ilike(systemLogs.action, term),
      ilike(systemLogs.entityType, term),
      acoes.length > 0 ? inArray(systemLogs.action, acoes) : undefined,
      modulos.length > 0 ? inArray(systemLogs.entityType, modulos) : undefined,
    )!);
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

/**
 * Quem aparece no log (08/10), para o filtro de pessoa: o par (id, nome
 * gravado) de cada autor, com quantos registros. Inclui quem não tem mais
 * cadastro e as ações do sistema (`userId` nulo) — o filtro só oferecia os
 * usuários cadastrados, e esses registros não podiam ser filtrados.
 */
export async function getPessoasDoLog(): Promise<{ userId: string | null; userName: string; total: number }[]> {
  const linhas = await db
    .select({ userId: systemLogs.userId, userName: systemLogs.userName, total: sql<number>`count(*)::int` })
    .from(systemLogs)
    .groupBy(systemLogs.userId, systemLogs.userName);
  return linhas
    .filter((l): l is { userId: string | null; userName: string; total: number } => !!l.userName && !!l.userName.trim())
    .sort((a, b) => a.userName.localeCompare(b.userName, "pt-BR"));
}
