/**
 * Vagas (team_inclusions) e seus registros (team_inclusion_logs).
 *
 * As transições guardadas por estado esperado (`updateTeamInclusion` com
 * `expectedStatus`, `updateTeamInclusionIfState`) moram aqui; os fluxos que
 * envolvem também pedidos de ajuste ficam em validacao-de-escala.ts.
 */
import { eq, and, or, sql, isNull, isNotNull, ne, asc, desc, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  teamInclusions, teamInclusionLogs, functions, events, users, collaborators, systemLogs,
  type TeamInclusion, type InsertTeamInclusion,
  type TeamInclusionLog, type InsertTeamInclusionLog,
  type InsertSystemLog,
} from "@shared/schema";
import { VAGA_STATE_CHANGED_MSG } from "@shared/scaling-validation-rules";
import { idsUnicos, StorageHttpError, SUGESTAO_PHASE_VALUE } from "./_comum";
import { colaboradorMudou, montarLogsDeAlteracaoDaVaga } from "./vagas-historico";

/**
 * Filtro de phase para leituras de team_inclusions.
 * - undefined (padrão): EXCLUI sugestões (phase 'sugestao') — as telas
 *   operacionais (Escalação, Passagens, Hospedagem, Planejado, Espelho…) nunca
 *   podem enxergar uma vaga que a área ainda não validou.
 * - 'sugestao': só sugestões.
 * - 'all': tudo (consultas históricas da Validação de Escala).
 */
export type TeamInclusionPhaseFilter = "sugestao" | "all" | undefined;

/** Filtros extras de getTeamInclusions (aplicados NO BANCO, não em JS). */
export interface TeamInclusionListOptions {
  /** Só vagas deste evento. */
  eventId?: string;
  /**
   * Só vagas destes eventos (recorte "todos os eventos" da Validação de Escala:
   * o servidor calcula antes o conjunto de eventos que ainda importa e passa
   * aqui — a lista NUNCA é filtrada em JS depois de carregar a tabela toda).
   * Lista vazia devolve [] sem ir ao banco.
   */
  eventIds?: string[];
  /**
   * Ordena por `suggestionSentAt`; 'asc' põe primeiro quem espera há mais tempo
   * — combinada com `limit`, é o que garante que o teto corte o que é menos
   * urgente, nunca a vaga mais antiga parada.
   */
  orderBySuggestionSentAt?: "asc" | "desc";
  /** Teto de linhas, aplicado no banco (LIMIT), não em JS. */
  limit?: number;
  /** Só vagas neste status (filtro do GET /api/team-inclusions, 23/09). */
  status?: string;
  /**
   * Ordem estável para a listagem operacional (23/09): número da vaga e id.
   * Sem ORDER BY o Postgres devolve na ordem física, que muda a cada UPDATE —
   * a grade "embaralhava" depois de salvar. Ignorada quando
   * `orderBySuggestionSentAt` está presente.
   */
  orderByInclusionNumber?: boolean;
  /**
   * Só o que passou pela Validação de Escala: vaga em `phase = 'sugestao'` OU
   * vaga que já virou Inclusão mas nasceu de uma sugestão (`suggestionSentAt`
   * preenchido). É o mesmo recorte que a consulta histórica fazia em JS —
   * trazido para o banco para o `limit` cortar as linhas certas.
   */
  fromSuggestionOnly?: boolean;
}

/**
 * Opções do UPDATE de vaga (23/09) — as transições passam a ser GUARDADAS:
 * `expectedStatus` vira `WHERE status = …`; 0 linhas → HttpError 409. Os logs
 * extras e o registro de auditoria entram na MESMA transação do UPDATE.
 */
export interface UpdateTeamInclusionOptions {
  /** Status que a vaga PRECISA ter para o UPDATE valer (guarda contra corrida). */
  expectedStatus?: string | readonly string[];
  /** Mensagem do 409 quando a guarda falha. */
  conflictMessage?: string;
  /** Registros extras em team_inclusion_logs (teamInclusionId preenchido aqui). */
  extraLogs?: Omit<InsertTeamInclusionLog, "teamInclusionId">[];
  /** Linha de system_logs montada a partir da vaga já atualizada. */
  auditFor?: (updated: TeamInclusion) => InsertSystemLog | null;
  /** Vaga excluída (deletedAt) também é recusada — 404 em vez de gravar em cima. */
  rejectDeleted?: boolean;
}

/** Remove sugestões (phase 'sugestao') de uma lista já carregada. */
export function excludeSuggestions<T extends { phase: string | null }>(rows: T[]): T[] {
  return rows.filter((r) => r.phase !== SUGESTAO_PHASE_VALUE);
}

export async function getTeamInclusions(
  includeDeleted: boolean = false,
  phase: TeamInclusionPhaseFilter = undefined,
  opts: TeamInclusionListOptions = {},
): Promise<TeamInclusion[]> {
  const query = db
    .select({
      id: teamInclusions.id,
      inclusionNumber: teamInclusions.inclusionNumber,
      eventId: teamInclusions.eventId,
      functionId: teamInclusions.functionId,
      collaboratorId: teamInclusions.collaboratorId,
      area: teamInclusions.area,
      scheduleStartDate: teamInclusions.scheduleStartDate,
      scheduleEndDate: teamInclusions.scheduleEndDate,
      actualStartDate: teamInclusions.actualStartDate,
      actualEndDate: teamInclusions.actualEndDate,
      flightDepartureDate: teamInclusions.flightDepartureDate,
      flightDepartureSuggestedTime: teamInclusions.flightDepartureSuggestedTime,
      flightArrivalSuggestedTime: teamInclusions.flightArrivalSuggestedTime,
      flightReturnDate: teamInclusions.flightReturnDate,
      flightReturnSuggestedTime: teamInclusions.flightReturnSuggestedTime,
      needsTicket: teamInclusions.needsTicket,
      needsAccommodation: teamInclusions.needsAccommodation,
      transportModeIda: teamInclusions.transportModeIda,
      transportModeVolta: teamInclusions.transportModeVolta,
      suggestionSentAt: teamInclusions.suggestionSentAt,
      validatedAt: teamInclusions.validatedAt,
      validatedBy: teamInclusions.validatedBy,
      validationNote: teamInclusions.validationNote,
      dailyRates: teamInclusions.dailyRates,
      workDays: teamInclusions.workDays,
      dailyValue: teamInclusions.dailyValue,
      actualDailyRates: teamInclusions.actualDailyRates,
      observations: teamInclusions.observations,
      actualObservations: teamInclusions.actualObservations,
      emergencyRecord: teamInclusions.emergencyRecord,
      skipUber: teamInclusions.skipUber,
      city: teamInclusions.city,
      status: teamInclusions.status,
      previousStatus: teamInclusions.previousStatus,
      phase: teamInclusions.phase,
      userId: teamInclusions.userId,
      createdAt: teamInclusions.createdAt,
      updatedAt: teamInclusions.updatedAt,
      updatedBy: teamInclusions.updatedBy,
      deletedAt: teamInclusions.deletedAt,
      deletedBy: teamInclusions.deletedBy,
      approvedByProduction: teamInclusions.approvedByProduction,
      approvedByProductionAt: teamInclusions.approvedByProductionAt,
      emitsNf: teamInclusions.emitsNf,
      atendimentoTipo: teamInclusions.atendimentoTipo,
      percurseiroTipo: teamInclusions.percurseiroTipo,
      cenoFreelaTipo: teamInclusions.cenoFreelaTipo,
      empreitaEmpresa: teamInclusions.empreitaEmpresa,
      empreitaPessoas: teamInclusions.empreitaPessoas,
      empreitaValor: teamInclusions.empreitaValor,
      functionName: functions.name,
      eventName: events.name,
      rowOrder: teamInclusions.rowOrder,
    })
    .from(teamInclusions)
    .leftJoin(functions, eq(teamInclusions.functionId, functions.id))
    .leftJoin(events, eq(teamInclusions.eventId, events.id))
    .$dynamic();

  // Filtros: deletados (soft delete) e phase.
  // Por padrão as sugestões (phase 'sugestao') NÃO saem daqui — só a Validação
  // de Escala as enxerga, pedindo explicitamente phase 'sugestao' ou 'all'.
  const conditions = [];
  if (!includeDeleted) conditions.push(isNull(teamInclusions.deletedAt));
  if (phase === "sugestao") conditions.push(eq(teamInclusions.phase, SUGESTAO_PHASE_VALUE));
  else if (phase !== "all") conditions.push(ne(teamInclusions.phase, SUGESTAO_PHASE_VALUE));
  // Evento EXCLUÍDO (soft delete do evento) não aparece nas listagens
  // operacionais nem na integração Maratona (23/09). O acesso direto por id
  // (getTeamInclusion) continua livre para o administrador.
  conditions.push(or(isNull(events.status), ne(events.status, "excluído"))!);
  if (opts.eventId) conditions.push(eq(teamInclusions.eventId, opts.eventId));
  if (opts.status) conditions.push(eq(teamInclusions.status, opts.status));
  if (opts.eventIds) {
    // Recorte vazio = nada a devolver (inArray com lista vazia é SQL inválido).
    if (opts.eventIds.length === 0) return [];
    conditions.push(inArray(teamInclusions.eventId, opts.eventIds));
  }

  if (opts.fromSuggestionOnly) {
    conditions.push(
      or(eq(teamInclusions.phase, SUGESTAO_PHASE_VALUE), isNotNull(teamInclusions.suggestionSentAt))!,
    );
  }

  // WHERE → ORDER BY → LIMIT, nesta ordem (a do SQL e a que o builder exige).
  // ORDER BY / LIMIT só quando pedidos: sem eles o comportamento é o de sempre
  // (lista inteira, ordem física do Postgres) — nenhuma chamada existente muda.
  let q = conditions.length === 0 ? query : query.where(and(...conditions));
  if (opts.orderBySuggestionSentAt) {
    // NULLS LAST nos dois sentidos: no DESC o Postgres põe NULL primeiro, e
    // linha sem `suggestionSentAt` comeria o `limit` das que interessam.
    q = q.orderBy(
      opts.orderBySuggestionSentAt === "asc"
        ? asc(teamInclusions.suggestionSentAt)
        : sql`${teamInclusions.suggestionSentAt} DESC NULLS LAST`,
    );
  } else if (opts.orderByInclusionNumber) {
    q = q.orderBy(asc(teamInclusions.inclusionNumber), asc(teamInclusions.id));
  }
  if (opts.limit) q = q.limit(opts.limit);
  return await q;
}

export async function getTeamInclusionsByCollaborator(collaboratorId: string): Promise<TeamInclusion[]> {
  // Só vagas vivas: a excluída não ocupa agenda. Quem chama filtra status
  // (shared/conflito-de-agenda.ts decide o que conta).
  return await db.select().from(teamInclusions)
    .where(and(eq(teamInclusions.collaboratorId, collaboratorId), isNull(teamInclusions.deletedAt)));
}

export async function getTeamInclusion(id: string): Promise<TeamInclusion | undefined> {
  const [inclusion] = await db.select().from(teamInclusions).where(eq(teamInclusions.id, id));
  return inclusion;
}

export async function getTeamInclusionsByIds(ids: string[]): Promise<TeamInclusion[]> {
  const unique = idsUnicos(ids);
  if (unique.length === 0) return [];
  return await db.select().from(teamInclusions).where(inArray(teamInclusions.id, unique));
}

export async function createTeamInclusion(inclusionData: InsertTeamInclusion): Promise<TeamInclusion> {
  const [inclusion] = await db.insert(teamInclusions).values(inclusionData).returning();
  return inclusion;
}

// Criação em lote numa única transação: a grade cria N escalações de uma vez;
// sem transação, uma falha no meio deixava as anteriores gravadas (escalação
// parcial). Ou todas entram, ou nenhuma.
export async function createTeamInclusionsBatch(rows: InsertTeamInclusion[], logFor?: (created: TeamInclusion) => InsertTeamInclusionLog): Promise<TeamInclusion[]> {
  if (rows.length === 0) return [];
  return await db.transaction(async (tx) => {
    // UM INSERT multi-linha (23/09) — antes eram N viagens ao banco. O
    // RETURNING preserva a ordem dos VALUES no Postgres.
    const created = await tx.insert(teamInclusions).values(rows).returning();
    if (logFor && created.length > 0) {
      await tx.insert(teamInclusionLogs).values(created.map(logFor));
    }
    return created;
  });
}

export async function updateTeamInclusion(id: string, inclusionData: Partial<InsertTeamInclusion>, opts: UpdateTeamInclusionOptions = {}): Promise<TeamInclusion> {
  // 23/09: tudo numa transação e com UPDATE GUARDADO. Antes eram até 7
  // round-trips soltos (SELECT da vaga, UPDATE, SELECT do usuário, 2 SELECTs
  // de colaborador, INSERT dos logs) e o UPDATE não conferia o estado — duas
  // confirmações simultâneas gravavam uma por cima da outra.
  return await db.transaction(async (tx) => {
    const [oldInclusion] = await tx.select().from(teamInclusions).where(eq(teamInclusions.id, id));
    if (!oldInclusion) throw new StorageHttpError(404, "Escalação não encontrada");
    if (opts.rejectDeleted && oldInclusion.deletedAt) throw new StorageHttpError(404, "Vaga excluída");

    const expected = opts.expectedStatus === undefined
      ? null
      : Array.isArray(opts.expectedStatus) ? [...opts.expectedStatus] : [String(opts.expectedStatus)];
    const guard = expected
      ? and(eq(teamInclusions.id, id), inArray(teamInclusions.status, expected))
      : eq(teamInclusions.id, id);
    const [inclusion] = await tx.update(teamInclusions).set(inclusionData).where(guard).returning();
    if (!inclusion) {
      throw new StorageHttpError(409, opts.conflictMessage ?? VAGA_STATE_CHANGED_MSG);
    }

    // Nome de quem alterou e dos colaboradores (antigo/novo) numa só ida.
    const collabIds = colaboradorMudou(oldInclusion, inclusionData)
      ? [oldInclusion.collaboratorId, inclusionData.collaboratorId].filter((v): v is string => !!v)
      : [];
    const [userRows, collabRows] = await Promise.all([
      inclusionData.updatedBy
        ? tx.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, inclusionData.updatedBy))
        : Promise.resolve([] as { id: string; name: string }[]),
      collabIds.length > 0
        ? tx.select({ id: collaborators.id, fullName: collaborators.fullName }).from(collaborators).where(inArray(collaborators.id, collabIds))
        : Promise.resolve([] as { id: string; fullName: string }[]),
    ]);

    // Descrição de cada mudança (função pura de vagas-historico.ts) + extras.
    const logsToCreate = montarLogsDeAlteracaoDaVaga({
      id,
      antes: oldInclusion,
      patch: inclusionData,
      userId: inclusionData.updatedBy || "system",
      userName: userRows[0]?.name ?? "Sistema",
      nomeDoColaborador: (cid) =>
        cid ? (collabRows.find((c) => c.id === cid)?.fullName ?? "Desconhecido") : "Nenhum",
    });
    for (const extra of opts.extraLogs ?? []) logsToCreate.push({ ...extra, teamInclusionId: id });

    // Um único INSERT multi-linha, na mesma transação do UPDATE.
    if (logsToCreate.length > 0) {
      await tx.insert(teamInclusionLogs).values(logsToCreate);
    }
    const audit = opts.auditFor?.(inclusion);
    if (audit) await tx.insert(systemLogs).values(audit);

    return inclusion;
  });
}

/**
 * UPDATE guardado pelo estado esperado (mesmo padrão de
 * `validateScalingSuggestionsBatch`): a decisão concorrente que chegou antes
 * mudou phase/status e este UPDATE simplesmente não encontra a linha.
 */
export async function updateTeamInclusionIfState(
  id: string,
  patch: Partial<InsertTeamInclusion>,
  expected: { phase: string; statuses: readonly string[] },
): Promise<TeamInclusion | undefined> {
  const [row] = await db.update(teamInclusions)
    .set(patch)
    .where(and(
      eq(teamInclusions.id, id),
      isNull(teamInclusions.deletedAt),
      eq(teamInclusions.phase, expected.phase),
      inArray(teamInclusions.status, [...expected.statuses]),
    ))
    .returning();
  return row;
}

// ── Registros da vaga (team_inclusion_logs) ───────────────────────────────

export async function getTeamInclusionLogs(teamInclusionId: string): Promise<TeamInclusionLog[]> {
  // Do mais novo para o mais antigo, no banco (índice team_inclusion_logs
  // (team_inclusion_id, created_at DESC)) — como a versão por ids abaixo.
  return await db
    .select()
    .from(teamInclusionLogs)
    .where(eq(teamInclusionLogs.teamInclusionId, teamInclusionId))
    .orderBy(desc(teamInclusionLogs.createdAt));
}

/**
 * Logs de VÁRIAS vagas numa leitura só (evita N+1 quando a lista de sugestões
 * precisa da última decisão do aprovador de cada linha). `actions` filtra no
 * banco; array vazio (de ids ou de actions) devolve [] sem consultar — um
 * `inArray` com lista vazia gera SQL inválido no drizzle.
 * Ordenado do mais novo para o mais antigo, como `getTeamInclusionLogs`.
 */
export async function getTeamInclusionLogsByInclusionIds(ids: string[], actions?: string[]): Promise<TeamInclusionLog[]> {
  const uniqueIds = idsUnicos(ids);
  if (uniqueIds.length === 0) return [];
  const uniqueActions = actions ? idsUnicos(actions) : undefined;
  if (uniqueActions && uniqueActions.length === 0) return [];
  const where = uniqueActions
    ? and(inArray(teamInclusionLogs.teamInclusionId, uniqueIds), inArray(teamInclusionLogs.action, uniqueActions))
    : inArray(teamInclusionLogs.teamInclusionId, uniqueIds);
  return await db
    .select()
    .from(teamInclusionLogs)
    .where(where)
    .orderBy(desc(teamInclusionLogs.createdAt));
}

export async function createTeamInclusionLog(logData: InsertTeamInclusionLog): Promise<TeamInclusionLog> {
  const [log] = await db.insert(teamInclusionLogs).values(logData).returning();
  return log;
}

export async function createTeamInclusionLogsBatch(logs: InsertTeamInclusionLog[]): Promise<void> {
  if (logs.length === 0) return;
  await db.insert(teamInclusionLogs).values(logs);
}
