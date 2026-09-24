import { randomUUID } from "crypto";
import { db } from "./db";
import { 
  users, events, functions, collaborators, teamInclusions, tickets, accommodations, financial, comments, systemLogs,
  functionUsers, functionManagers, scalingFunctionManagers, teamInclusionLogs, functionValues, budgetPlanned, budgetActual, budgetComparison, systemSettings, invoices, paymentCompanies,
  type User, type InsertUser,
  type Event, type InsertEvent,
  type Function, type InsertFunction,
  type Collaborator, type InsertCollaborator,
  type TeamInclusion, type InsertTeamInclusion,
  type Ticket, type InsertTicket,
  type Accommodation, type InsertAccommodation,
  type Financial, type InsertFinancial,
  type Comment, type InsertComment,
  type SystemLog, type InsertSystemLog,
  type FunctionUser, type InsertFunctionUser,
  type FunctionManager, type InsertFunctionManager,
  type ScalingFunctionManager, type InsertScalingFunctionManager,
  type TeamInclusionLog, type InsertTeamInclusionLog,
  type FunctionValue, type InsertFunctionValue,
  type BudgetPlanned, type InsertBudgetPlanned,
  type BudgetActual, type InsertBudgetActual,
  type BudgetComparison, type InsertBudgetComparison,
  type SystemSetting,
  type Invoice, type InsertInvoice,
  type PaymentCompany, type InsertPaymentCompany,
  flashMovements,
  type FlashMovement, type InsertFlashMovement,
  baggageRequests,
  baggageHistory,
  type BaggageRequest, type InsertBaggageRequest, type BaggageHistoryEntry,
  scalingChangeRequests,
  type ScalingChangeRequest,
} from "@shared/schema";
import { eq, and, or, sql, isNull, isNotNull, ne, exists, asc, desc, inArray, ilike, gte } from "drizzle-orm";
import { VAGA_STATE_CHANGED_MSG } from "@shared/scaling-validation-rules";
import { rotuloDoStatus } from "@shared/vaga-status";

/** Papel de um responsável na Validação de Escala (function_managers.role). */
export type FunctionManagerRole = "validador" | "aprovador";

/** Responsável embutido em GET /api/functions — só o que a lista precisa. */
export interface FunctionManagerSummary {
  userId: string;
  userName: string;
  role: FunctionManagerRole;
}
export type FunctionWithManagers = Function & { managers: FunctionManagerSummary[] };

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

/** Phase das vagas ainda em validação pela área (espelha SUGESTAO_PHASE do shared). */
const SUGESTAO_PHASE_VALUE = "sugestao";

/** Pedido de ajuste ainda em aberto (espelha CHANGE_REQUEST_STATUS.PENDENTE do shared). */
const PENDING_REQUEST_STATUS = "pendente";

/** Remove sugestões (phase 'sugestao') de uma lista já carregada. */
export function excludeSuggestions<T extends { phase: string | null }>(rows: T[]): T[] {
  return rows.filter((r) => r.phase !== SUGESTAO_PHASE_VALUE);
}

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

/**
 * Linha bruta de swap_requests (SELECT sr.* + joins), como o SQL devolve —
 * snake_case. Até 23/09 cada chave saía DUPLICADA (snake + camel), dobrando o
 * payload da lista de trocas; o client unificou a leitura em
 * client/src/lib/swap-types.ts (`normalizeSwap`), que lê snake_case primeiro.
 * Só as chaves snake ficam; nenhum consumidor lia as camel.
 */
export function mapSwapRequestRow(row: Record<string, any>): Record<string, any> {
  return { ...row };
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

/** Erro com status HTTP lançado pelo storage (o tratador global de server/http.ts o traduz). */
export class StorageHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export interface IStorage {
  // Users
  getUsers(): Promise<User[]>;
  getUsersByIds(ids: string[]): Promise<User[]>;
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByResetToken(token: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  approveUser(id: string, status: 'approved' | 'rejected', role?: string): Promise<User | undefined>;
  getUsersByStatus(status: 'pending' | 'approved' | 'rejected'): Promise<User[]>;
  
  // Events
  getEvents(includeDeleted?: boolean): Promise<Event[]>;
  getEvent(id: string): Promise<Event | undefined>;
  getEventsWithInclusions(): Promise<Event[]>;
  createEvent(event: InsertEvent): Promise<Event>;
  updateEvent(id: string, event: Partial<InsertEvent>): Promise<Event>;
  deleteEvent(id: string): Promise<void>;
  
  // Functions
  getFunctions(): Promise<Function[]>;
  /** Funções com os responsáveis embutidos (1 query extra, sem N+1 no client). */
  getFunctionsWithManagers(): Promise<FunctionWithManagers[]>;
  getFunction(id: string): Promise<Function | undefined>;
  createFunction(func: InsertFunction): Promise<Function>;
  updateFunction(id: string, func: Partial<InsertFunction>): Promise<Function>;
  deleteFunction(id: string): Promise<void>;
  getFunctionsByUser(userId: string): Promise<Function[]>;
  
  // Function Users (assigned users)
  getFunctionUsers(functionId: string): Promise<FunctionUser[]>;
  addUserToFunction(functionUser: InsertFunctionUser): Promise<FunctionUser>;
  removeUserFromFunction(functionId: string, userId: string): Promise<void>;
  getUserFunctions(userId: string): Promise<Function[]>;
  
  // Function Managers (responsible users)
  getFunctionManagers(functionId: string): Promise<FunctionManager[]>;
  addManagerToFunction(functionManager: InsertFunctionManager): Promise<FunctionManager>;
  removeManagerFromFunction(functionId: string, userId: string): Promise<void>;
  updateManagerRole(functionId: string, userId: string, role: FunctionManagerRole): Promise<FunctionManager | undefined>;
  removeUserFromAllFunctions(userId: string): Promise<void>;
  getUserManagedFunctions(userId: string): Promise<Function[]>;
  /** true para QUALQUER papel (validador ou aprovador) — compat com o uso histórico. */
  isUserFunctionManager(functionId: string, userId: string): Promise<boolean>;
  /** true apenas para role 'aprovador' na função. */
  isUserFunctionApprover(functionId: string, userId: string): Promise<boolean>;
  /** Papel do usuário na função (null se não é responsável). */
  getUserFunctionRole(functionId: string, userId: string): Promise<FunctionManagerRole | null>;
  /** IDs das funções em que o usuário tem o papel informado (ou qualquer papel). */
  getUserManagedFunctionIds(userId: string, role?: FunctionManagerRole): Promise<string[]>;

  // Collaborators
  /** `eventId` (23/09): só quem tem vaga viva no evento — as telas por evento não precisam do cadastro inteiro. */
  getCollaborators(eventId?: string): Promise<Collaborator[]>;
  getCollaborator(id: string): Promise<Collaborator | undefined>;
  /** Duplicidade por documento normalizado (só dígitos/letras, sem pontuação), sem carregar a tabela. */
  getCollaboratorByDocument(officialDocument: string): Promise<Collaborator | undefined>;
  createCollaborator(collaborator: InsertCollaborator): Promise<Collaborator>;
  updateCollaborator(id: string, collaborator: Partial<InsertCollaborator>): Promise<Collaborator>;
  deleteCollaborator(id: string): Promise<void>;
  
  // Team Inclusions
  /**
   * Lista escalações. Por padrão exclui deletadas E sugestões (phase 'sugestao');
   * passe phase 'sugestao' para só sugestões ou 'all' para tudo.
   */
  getTeamInclusions(includeDeleted?: boolean, phase?: TeamInclusionPhaseFilter, opts?: TeamInclusionListOptions): Promise<TeamInclusion[]>;
  getTeamInclusion(id: string): Promise<TeamInclusion | undefined>;
  /** Vagas por id (inclui deletadas e qualquer phase) — para juntar pedidos às vagas sem carregar a tabela toda. */
  getTeamInclusionsByIds(ids: string[]): Promise<TeamInclusion[]>;
  /** Vagas VIVAS (deleted_at nulo) de um colaborador — agenda para o conflito de datas. */
  getTeamInclusionsByCollaborator(collaboratorId: string): Promise<TeamInclusion[]>;
  createTeamInclusion(inclusion: InsertTeamInclusion): Promise<TeamInclusion>;
  /** `logFor` grava o registro de criação de cada vaga DENTRO da mesma transação. */
  createTeamInclusionsBatch(rows: InsertTeamInclusion[], logFor?: (created: TeamInclusion) => InsertTeamInclusionLog): Promise<TeamInclusion[]>;
  updateTeamInclusion(id: string, inclusion: Partial<InsertTeamInclusion>, opts?: UpdateTeamInclusionOptions): Promise<TeamInclusion>;

  // Tickets
  /** `eventId` (23/09): só passagens de vagas do evento. */
  getTickets(eventId?: string): Promise<Ticket[]>;
  getTicket(id: string): Promise<Ticket | undefined>;
  getTicketsByInclusionId(teamInclusionId: string): Promise<Ticket[]>;
  getAccommodationsByInclusionId(teamInclusionId: string): Promise<Accommodation[]>;
  createTicket(ticket: InsertTicket): Promise<Ticket>;
  updateTicket(id: string, ticket: Partial<InsertTicket>): Promise<Ticket>;
  
  // Accommodations
  /** `eventId` (23/09): só hospedagens de vagas do evento. */
  getAccommodations(eventId?: string): Promise<Accommodation[]>;
  getAccommodation(id: string): Promise<Accommodation | undefined>;
  createAccommodation(accommodation: InsertAccommodation): Promise<Accommodation>;
  updateAccommodation(id: string, accommodation: Partial<InsertAccommodation>): Promise<Accommodation>;
  
  // Financial
  getFinancials(): Promise<Financial[]>;
  getFinancial(id: string): Promise<Financial | undefined>;
  createFinancial(financial: InsertFinancial): Promise<Financial>;
  updateFinancial(id: string, financial: Partial<InsertFinancial>): Promise<Financial>;
  
  // Comments
  getComments(teamInclusionId: string): Promise<Comment[]>;
  /** Mais recentes primeiro, ordenados e limitados NO BANCO (23/09). */
  getAllComments(limit?: number): Promise<Comment[]>;
  createComment(comment: InsertComment): Promise<Comment>;

  // System Logs
  getSystemLogs(filters?: { entityType?: string; action?: string; days?: number; search?: string; userId?: string; limit?: number; offset?: number }): Promise<{ logs: SystemLog[]; total: number }>;
  createSystemLog(log: InsertSystemLog): Promise<SystemLog>;
  /** Auditoria em lote — um INSERT multi-linha (rotas que decidem N registros). */
  createSystemLogsBatch(logs: InsertSystemLog[]): Promise<void>;

  // Team Inclusion Logs
  getTeamInclusionLogs(teamInclusionId: string): Promise<TeamInclusionLog[]>;
  getTeamInclusionLogsByInclusionIds(ids: string[], actions?: string[]): Promise<TeamInclusionLog[]>;
  createTeamInclusionLog(log: InsertTeamInclusionLog): Promise<TeamInclusionLog>;
  createTeamInclusionLogsBatch(logs: InsertTeamInclusionLog[]): Promise<void>;
  
  // Function Values (valores automáticos por função)
  getFunctionValues(functionId: string): Promise<FunctionValue | undefined>;
  getAllFunctionValues(): Promise<FunctionValue[]>;
  createFunctionValue(value: InsertFunctionValue): Promise<FunctionValue>;
  updateFunctionValue(id: string, value: Partial<InsertFunctionValue>): Promise<FunctionValue>;
  
  // Budget Planned (Planejado)
  getBudgetPlanned(eventId: string): Promise<BudgetPlanned[]>;
  getBudgetPlannedById(id: string): Promise<BudgetPlanned | undefined>;
  getAllBudgetPlanned(): Promise<BudgetPlanned[]>;
  createBudgetPlanned(planned: InsertBudgetPlanned): Promise<BudgetPlanned>;
  updateBudgetPlanned(id: string, planned: Partial<InsertBudgetPlanned>): Promise<BudgetPlanned>;
  deleteBudgetPlanned(id: string): Promise<void>;
  
  // Budget Actual (Realizado)
  getBudgetActual(eventId: string): Promise<BudgetActual[]>;
  getBudgetActualById(id: string): Promise<BudgetActual | undefined>;
  getAllBudgetActual(): Promise<BudgetActual[]>;
  createBudgetActual(actual: InsertBudgetActual): Promise<BudgetActual>;
  updateBudgetActual(id: string, actual: Partial<InsertBudgetActual>): Promise<BudgetActual>;
  deleteBudgetActual(id: string): Promise<void>;
  
  // Budget Comparison (Comparativo)
  getBudgetComparison(eventId: string): Promise<BudgetComparison | undefined>;
  getAllBudgetComparisons(): Promise<BudgetComparison[]>;
  createBudgetComparison(comparison: InsertBudgetComparison): Promise<BudgetComparison>;
  updateBudgetComparison(id: string, comparison: Partial<InsertBudgetComparison>): Promise<BudgetComparison>;

  // System Settings
  getSystemSettings(): Promise<SystemSetting[]>;
  upsertSystemSetting(key: string, value: string, updatedBy?: string): Promise<SystemSetting>;

  // Invoices (Notas Fiscais)
  getInvoices(eventId?: string): Promise<Invoice[]>;
  getInvoice(id: string): Promise<Invoice | undefined>;
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: string, invoice: Partial<Invoice>): Promise<Invoice>;

  // Payment Companies
  getPaymentCompanies(): Promise<PaymentCompany[]>;
  createPaymentCompany(company: InsertPaymentCompany): Promise<PaymentCompany>;
  deletePaymentCompany(id: number): Promise<void>;

  // Flash Movements (Conta Corrente Flash)
  getFlashMovements(collaboratorId?: string): Promise<FlashMovement[]>;
  getFlashMovement(id: string): Promise<FlashMovement | undefined>;
  /** Lançamentos automáticos de uma origem (ex.: sourceType 'oc' + id da NF). */
  getFlashMovementsBySource(sourceType: string, sourceRef: string): Promise<FlashMovement[]>;
  createFlashMovement(movement: InsertFlashMovementWithSource): Promise<FlashMovement>;
  createFlashMovementsBatch(movements: InsertFlashMovementWithSource[]): Promise<FlashMovement[]>;
  updateFlashMovement(id: string, updates: Partial<InsertFlashMovementWithSource>): Promise<FlashMovement | undefined>;
  deleteFlashMovement(id: string): Promise<void>;

  // Baggage Requests (Controle de Bagagem)
  getBaggageRequests(eventId?: string): Promise<BaggageRequest[]>;
  getBaggageRequest(id: string): Promise<BaggageRequest | undefined>;
  createBaggageRequest(request: InsertBaggageRequest & { createdBy?: string | null; createdByName?: string | null }): Promise<BaggageRequest>;
  updateBaggageRequest(id: string, updates: Partial<InsertBaggageRequest>): Promise<BaggageRequest | undefined>;
  softDeleteBaggageRequest(id: string, deletedBy: string): Promise<void>;
  getBaggageHistory(): Promise<BaggageHistoryEntry[]>;
  setBaggageHistory(collaboratorId: string, cia: string, quantity: number, sourceName?: string | null): Promise<BaggageHistoryEntry | null>;

  // Validação de Escala — sugestões e pedidos de ajuste/inclusão/exclusão
  /**
   * Cria as vagas sugeridas em lote e (opcionalmente) atualiza as observações
   * do evento, tudo numa única transação.
   */
  createScalingSuggestionsBatch(
    rows: InsertTeamInclusion[],
    eventUpdate?: { eventId: string; observations: string | null },
    /** Registro de cada vaga criada, gravado DENTRO da transação (23/09). */
    logFor?: (created: TeamInclusion) => InsertTeamInclusionLog,
  ): Promise<TeamInclusion[]>;
  /**
   * Validação em lote (área valida N vagas): UM update com `inArray` + logs numa
   * única transação. Só atualiza vagas ainda em `expected` (phase/status) e não
   * deletadas; devolve as linhas efetivamente atualizadas — quem não voltou
   * mudou de estado no meio (o chamador marca como "skipped").
   */
  validateScalingSuggestionsBatch(
    ids: string[],
    patch: Partial<InsertTeamInclusion>,
    expected: { phase: string; status: string },
    logFor: (updated: TeamInclusion) => InsertTeamInclusionLog,
  ): Promise<TeamInclusion[]>;
  /**
   * "Cancelar envio" da Sugestão de Escala: soft delete de TODAS as vagas do
   * evento ainda na etapa de sugestão + encerramento dos pedidos pendentes
   * delas, numa única transação. Ver `cancelScalingSuggestionSend` na
   * implementação para o contrato completo.
   */
  cancelScalingSuggestionSend(params: CancelSuggestionSendParams): Promise<CancelSuggestionSendResult>;
  /** Funções/eventos por id (Map por id no chamador) — evita carregar o catálogo inteiro. */
  getFunctionsByIds(ids: string[]): Promise<Function[]>;
  getEventsByIds(ids: string[]): Promise<Event[]>;
  getScalingChangeRequests(filters?: { status?: string; eventId?: string; eventIds?: string[]; functionIds?: string[] }): Promise<ScalingChangeRequest[]>;
  getScalingChangeRequest(id: string): Promise<ScalingChangeRequest | undefined>;
  getScalingChangeRequestsByInclusion(teamInclusionId: string): Promise<ScalingChangeRequest[]>;
  createScalingChangeRequest(request: InsertScalingChangeRequestRow): Promise<ScalingChangeRequest>;
  updateScalingChangeRequest(id: string, updates: Partial<InsertScalingChangeRequestRow>): Promise<ScalingChangeRequest | undefined>;
  /**
   * UPDATE guardado de UMA vaga: só grava se ela ainda estiver no estado
   * `expected` (phase + um dos status) e não deletada. Devolve `undefined`
   * quando 0 linhas — a vaga mudou de estado no meio (o chamador responde 409).
   */
  updateTeamInclusionIfState(
    id: string,
    patch: Partial<InsertTeamInclusion>,
    expected: { phase: string; statuses: readonly string[] },
  ): Promise<TeamInclusion | undefined>;
  createScalingChangeRequestWithTransition(
    request: InsertScalingChangeRequestRow,
    inclusionId: string | null,
    newState: {
      phase: string; status: string; updatedBy?: string | null;
      /** Estado que a vaga PRECISA ter para a transição valer (guarda TOCTOU). */
      expected: { phase: string; statuses: readonly string[] };
    } | null,
  ): Promise<{ request: ScalingChangeRequest; inclusion: TeamInclusion | null }>;
  resolveScalingChangeRequest(
    requestId: string,
    requestUpdates: Partial<InsertScalingChangeRequestRow>,
    ops?: {
      inclusionUpdate?: {
        id: string; patch: Partial<InsertTeamInclusion>;
        /** Estado que a vaga PRECISA ter para o patch valer (guarda TOCTOU). */
        expected?: { phase: string; statuses: readonly string[] };
      } | null;
      inclusionInserts?: InsertTeamInclusion[];
      /** Registros das vagas criadas, gravados DENTRO da transação (23/09). */
      logsForCreated?: (created: TeamInclusion[]) => InsertTeamInclusionLog[];
    },
  ): Promise<{ request: ScalingChangeRequest; updatedInclusion: TeamInclusion | null; createdInclusions: TeamInclusion[] }>;
}

/** Linha completa de scaling_change_requests para inserção (identidade já resolvida pelo servidor). */
export type InsertScalingChangeRequestRow = typeof scalingChangeRequests.$inferInsert;

/** Entrada de `cancelScalingSuggestionSend` (quem decide O QUE sai é o chamador, via `statuses`). */
export interface CancelSuggestionSendParams {
  eventId: string;
  /** Status de sugestão que saem (shared: CANCELABLE_SUGESTAO_STATUS). */
  statuses: readonly string[];
  /** Patch do soft delete (deletedAt/deletedBy/updatedBy). */
  patch: Partial<InsertTeamInclusion>;
  /** Log por vaga removida — gravado DENTRO da transação. */
  logFor: (removed: TeamInclusion) => InsertTeamInclusionLog;
  /**
   * Quais pedidos PENDENTES do evento são encerrados junto (shared:
   * `isRequestCanceledByCancelSend`). A regra vem de fora para não existir uma
   * segunda cópia dela em SQL.
   */
  shouldCancelRequest: (request: ScalingChangeRequest, removedInclusionIds: ReadonlySet<string>) => boolean;
  /** Patch dos pedidos encerrados (status/reviewComment/reviewedBy/reviewedByName/reviewedAt). */
  requestPatch: Partial<InsertScalingChangeRequestRow>;
}

export interface CancelSuggestionSendResult {
  removed: TeamInclusion[];
  requestsCanceled: ScalingChangeRequest[];
}

// Database storage implementation using PostgreSQL + Drizzle
export class DatabaseStorage implements IStorage {
  // Users
  async getUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async getUsersByIds(ids: string[]): Promise<User[]> {
    const unique = Array.from(new Set(ids.filter(Boolean)));
    if (unique.length === 0) return [];
    return await db.select().from(users).where(inArray(users.id, unique));
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  // Removed getUserByUsername since username field is removed

  async getUserByEmail(email: string): Promise<User | undefined> {
    try {
      // Sem diferenciar maiúsculas (23/09): o SSO manda o e-mail como o portal
      // o tem, e o banco pode ter sido cadastrado à mão com outra caixa — a
      // comparação exata criava uma segunda conta para a mesma pessoa.
      const [user] = await db.select().from(users).where(sql`lower(${users.email}) = lower(${email})`);
      return user;
    } catch (error) {
      console.error('[Storage] Error in getUserByEmail:', error);
      throw error;
    }
  }

  async getUserByResetToken(token: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.resetToken, token));
    return user;
  }

  async createUser(userData: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(userData).returning();
    return user;
  }

  async getUsersByStatus(status: 'pending' | 'approved' | 'rejected'): Promise<User[]> {
    return await db.select().from(users).where(eq(users.status, status));
  }

  async approveUser(id: string, status: 'approved' | 'rejected', role?: string): Promise<User | undefined> {
    const updateData: any = { status };
    if (role) updateData.role = role;
    
    const [user] = await db.update(users).set(updateData).where(eq(users.id, id)).returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const [user] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return user;
  }

  // Events
  async getEvents(includeDeleted = false): Promise<Event[]> {
    if (includeDeleted) return await db.select().from(events);
    return await db.select().from(events).where(ne(events.status, "excluído"));
  }

  async getEvent(id: string): Promise<Event | undefined> {
    const [event] = await db.select().from(events).where(eq(events.id, id));
    return event;
  }

  async getEventsWithInclusions(): Promise<Event[]> {
    // Buscar eventos que têm inclusões usando EXISTS (sem duplicatas por JOIN).
    // Vagas ainda em Validação de Escala (phase 'sugestao') e vagas EXCLUÍDAS
    // (soft delete, 23/09) não contam — um evento cujas vagas foram todas
    // removidas aparecia como modelo de escalação com grade vazia.
    return await db
      .select()
      .from(events)
      .where(
        and(
          ne(events.status, "excluído"),
          exists(
            db.select({ id: teamInclusions.id })
              .from(teamInclusions)
              .where(and(
                eq(teamInclusions.eventId, events.id),
                ne(teamInclusions.phase, "sugestao"),
                isNull(teamInclusions.deletedAt),
              ))
          )
        )
      );
  }

  async createEvent(eventData: InsertEvent): Promise<Event> {
    const [event] = await db.insert(events).values(eventData).returning();
    return event;
  }

  async updateEvent(id: string, eventData: Partial<InsertEvent>): Promise<Event> {
    const [event] = await db.update(events).set(eventData).where(eq(events.id, id)).returning();
    return event;
  }

  async deleteEvent(id: string): Promise<void> {
    await db.delete(events).where(eq(events.id, id));
  }

  // Functions
  async getFunctions(): Promise<Function[]> {
    return await db.select().from(functions);
  }

  async getFunctionsWithManagers(): Promise<FunctionWithManagers[]> {
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

  async getFunction(id: string): Promise<Function | undefined> {
    const [func] = await db.select().from(functions).where(eq(functions.id, id));
    return func;
  }

  async createFunction(functionData: InsertFunction): Promise<Function> {
    const [func] = await db.insert(functions).values(functionData).returning();
    return func;
  }

  async getFunctionsByUser(userId: string): Promise<Function[]> {
    return await db.select().from(functions).where(eq(functions.userId, userId));
  }

  async updateFunction(id: string, functionData: Partial<InsertFunction>): Promise<Function> {
    const [func] = await db.update(functions).set(functionData).where(eq(functions.id, id)).returning();
    return func;
  }

  async deleteFunction(id: string): Promise<void> {
    await db.delete(functions).where(eq(functions.id, id));
  }

  // Function Users (assigned users)
  async getFunctionUsers(functionId: string): Promise<FunctionUser[]> {
    return await db.select().from(functionUsers).where(eq(functionUsers.functionId, functionId));
  }

  async addUserToFunction(functionUser: InsertFunctionUser): Promise<FunctionUser> {
    const [fu] = await db.insert(functionUsers).values(functionUser).returning();
    return fu;
  }

  async removeUserFromFunction(functionId: string, userId: string): Promise<void> {
    await db.delete(functionUsers)
      .where(and(eq(functionUsers.functionId, functionId), eq(functionUsers.userId, userId)));
  }

  async getUserFunctions(userId: string): Promise<Function[]> {
    const result = await db
      .select({
        id: functions.id,
        functionNumber: functions.functionNumber,
        name: functions.name,
        description: functions.description,
        responsibleArea: functions.responsibleArea,
        costCenter: functions.costCenter,
        quantity: functions.quantity,
        userId: functions.userId,
        createdAt: functions.createdAt
      })
      .from(functions)
      .innerJoin(functionUsers, eq(functions.id, functionUsers.functionId))
      .where(eq(functionUsers.userId, userId));
    
    return result;
  }

  // Function Managers (responsible users)
  async getFunctionManagers(functionId: string): Promise<FunctionManager[]> {
    return await db.select().from(functionManagers).where(eq(functionManagers.functionId, functionId));
  }

  async addManagerToFunction(functionManager: InsertFunctionManager): Promise<FunctionManager> {
    const [fm] = await db.insert(functionManagers).values(functionManager).returning();
    return fm;
  }

  async removeManagerFromFunction(functionId: string, userId: string): Promise<void> {
    await db.delete(functionManagers)
      .where(and(eq(functionManagers.functionId, functionId), eq(functionManagers.userId, userId)));
  }

  async updateManagerRole(functionId: string, userId: string, role: FunctionManagerRole): Promise<FunctionManager | undefined> {
    const [fm] = await db.update(functionManagers)
      .set({ role })
      .where(and(eq(functionManagers.functionId, functionId), eq(functionManagers.userId, userId)))
      .returning();
    return fm;
  }

  // ── Responsáveis do MÓDULO DE ESCALA (tabela própria) ────────────────────
  async getScalingManagers(functionId: string): Promise<ScalingFunctionManager[]> {
    return await db.select().from(scalingFunctionManagers).where(eq(scalingFunctionManagers.functionId, functionId));
  }

  async getAllScalingManagers(): Promise<ScalingFunctionManager[]> {
    return await db.select().from(scalingFunctionManagers);
  }

  async addScalingManager(row: InsertScalingFunctionManager): Promise<ScalingFunctionManager> {
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

  async removeScalingManager(functionId: string, userId: string, role?: FunctionManagerRole): Promise<void> {
    const cond = role
      ? and(eq(scalingFunctionManagers.functionId, functionId), eq(scalingFunctionManagers.userId, userId), eq(scalingFunctionManagers.role, role))
      : and(eq(scalingFunctionManagers.functionId, functionId), eq(scalingFunctionManagers.userId, userId));
    await db.delete(scalingFunctionManagers).where(cond);
  }

  async removeUserFromAllFunctions(userId: string): Promise<void> {
    await db.delete(functionManagers).where(eq(functionManagers.userId, userId));
  }

  async getUserManagedFunctions(userId: string): Promise<Function[]> {
    const result = await db
      .select({
        id: functions.id,
        functionNumber: functions.functionNumber,
        name: functions.name,
        description: functions.description,
        responsibleArea: functions.responsibleArea,
        costCenter: functions.costCenter,
        quantity: functions.quantity,
        userId: functions.userId,
        createdAt: functions.createdAt
      })
      .from(functions)
      .innerJoin(functionManagers, eq(functions.id, functionManagers.functionId))
      .where(eq(functionManagers.userId, userId));
    
    return result;
  }

  async isUserFunctionManager(functionId: string, userId: string): Promise<boolean> {
    const result = await db
      .select({ count: sql`count(*)`.as('count') })
      .from(functionManagers)
      .where(and(eq(functionManagers.functionId, functionId), eq(functionManagers.userId, userId)));
    
    return Number(result[0]?.count) > 0;
  }

  /**
   * Papel do usuário NO MÓDULO DE ESCALA — lê a tabela própria
   * (`scaling_function_managers`), não a lista clássica de responsáveis.
   * Aprovador vence validador quando a pessoa é as duas coisas na função.
   */
  async getUserFunctionRole(functionId: string, userId: string): Promise<FunctionManagerRole | null> {
    const rows = await db
      .select({ role: scalingFunctionManagers.role })
      .from(scalingFunctionManagers)
      .where(and(eq(scalingFunctionManagers.functionId, functionId), eq(scalingFunctionManagers.userId, userId)));
    if (rows.length === 0) return null;
    return rows.some((r) => r.role === "aprovador") ? "aprovador" : "validador";
  }

  async isUserFunctionApprover(functionId: string, userId: string): Promise<boolean> {
    return (await this.getUserFunctionRole(functionId, userId)) === "aprovador";
  }

  /** Funções em que o usuário é validador/aprovador NO MÓDULO DE ESCALA. */
  async getUserManagedFunctionIds(userId: string, role?: FunctionManagerRole): Promise<string[]> {
    const rows = await db
      .select({ functionId: scalingFunctionManagers.functionId, role: scalingFunctionManagers.role })
      .from(scalingFunctionManagers)
      .where(eq(scalingFunctionManagers.userId, userId));
    return rows
      .filter((r) => !role || (r.role === "aprovador" ? "aprovador" : "validador") === role)
      .map((r) => r.functionId);
  }

  // Collaborators
  async getCollaborators(eventId?: string): Promise<Collaborator[]> {
    // Sem ORDER BY o Postgres devolve na ordem física das linhas, que muda
    // conforme os registros são atualizados — a lista parecia embaralhar
    // sozinha. lower() para "ana" e "Ana" ficarem juntos independentemente da
    // collation do banco.
    const base = db.select().from(collaborators).$dynamic();
    const q = eventId
      ? base.where(exists(
          db.select({ id: teamInclusions.id }).from(teamInclusions).where(and(
            eq(teamInclusions.collaboratorId, collaborators.id),
            eq(teamInclusions.eventId, eventId),
            isNull(teamInclusions.deletedAt),
          )),
        ))
      : base;
    return await q.orderBy(asc(sql`lower(${collaborators.fullName})`));
  }

  async getCollaborator(id: string): Promise<Collaborator | undefined> {
    const [collaborator] = await db.select().from(collaborators).where(eq(collaborators.id, id));
    return collaborator;
  }

  async getCollaboratorByDocument(officialDocument: string): Promise<Collaborator | undefined> {
    // Compara só letras e dígitos: "123.456.789-00" e "12345678900" são o
    // mesmo CPF. Antes a rota carregava a tabela inteira e comparava texto cru.
    const normalizado = String(officialDocument ?? "").replace(/[^0-9A-Za-z]/g, "").toLowerCase();
    if (!normalizado) return undefined;
    const [row] = await db.select().from(collaborators)
      .where(sql`lower(regexp_replace(${collaborators.officialDocument}, '[^0-9A-Za-z]', '', 'g')) = ${normalizado}`)
      .limit(1);
    return row;
  }

  async createCollaborator(collaboratorData: InsertCollaborator): Promise<Collaborator> {
    const [collaborator] = await db.insert(collaborators).values(collaboratorData).returning();
    return collaborator;
  }

  async updateCollaborator(id: string, collaboratorData: Partial<InsertCollaborator>): Promise<Collaborator> {
    const [collaborator] = await db.update(collaborators).set(collaboratorData).where(eq(collaborators.id, id)).returning();
    return collaborator;
  }

  async deleteCollaborator(id: string): Promise<void> {
    await db.delete(collaborators).where(eq(collaborators.id, id));
  }

  // Team Inclusions
  async getTeamInclusions(
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

  async getTeamInclusionsByCollaborator(collaboratorId: string): Promise<TeamInclusion[]> {
    // Só vagas vivas: a excluída não ocupa agenda. Quem chama filtra status
    // (shared/conflito-de-agenda.ts decide o que conta).
    return await db.select().from(teamInclusions)
      .where(and(eq(teamInclusions.collaboratorId, collaboratorId), isNull(teamInclusions.deletedAt)));
  }

  async getTeamInclusion(id: string): Promise<TeamInclusion | undefined> {
    const [inclusion] = await db.select().from(teamInclusions).where(eq(teamInclusions.id, id));
    return inclusion;
  }

  async getTeamInclusionsByIds(ids: string[]): Promise<TeamInclusion[]> {
    const unique = Array.from(new Set(ids.filter(Boolean)));
    if (unique.length === 0) return [];
    return await db.select().from(teamInclusions).where(inArray(teamInclusions.id, unique));
  }

  async createTeamInclusion(inclusionData: InsertTeamInclusion): Promise<TeamInclusion> {
    const [inclusion] = await db.insert(teamInclusions).values(inclusionData).returning();
    return inclusion;
  }

  // Criação em lote numa única transação: a grade cria N escalações de uma vez;
  // sem transação, uma falha no meio deixava as anteriores gravadas (escalação
  // parcial). Ou todas entram, ou nenhuma.
  async createTeamInclusionsBatch(rows: InsertTeamInclusion[], logFor?: (created: TeamInclusion) => InsertTeamInclusionLog): Promise<TeamInclusion[]> {
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

  async updateTeamInclusion(id: string, inclusionData: Partial<InsertTeamInclusion>, opts: UpdateTeamInclusionOptions = {}): Promise<TeamInclusion> {
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
      const collabChanged = inclusionData.collaboratorId !== undefined && inclusionData.collaboratorId !== oldInclusion.collaboratorId;
      const collabIds = collabChanged
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
      const userName = userRows[0]?.name ?? "Sistema";
      const nomeDoColaborador = (cid: string | null | undefined) =>
        cid ? (collabRows.find((c) => c.id === cid)?.fullName ?? "Desconhecido") : "Nenhum";
      const userId = inclusionData.updatedBy || "system";

      const logsToCreate: InsertTeamInclusionLog[] = [];
      const push = (action: string, details: string, previousValue: string | null, newValue: string | null) =>
        logsToCreate.push({ teamInclusionId: id, action, details, previousValue, newValue, userId, userName });

      // Status — rótulo único de shared/vaga-status (o mapa local foi apagado)
      if (inclusionData.status && inclusionData.status !== oldInclusion.status) {
        push("status_changed",
          `Status alterado de "${rotuloDoStatus(oldInclusion.status)}" para "${rotuloDoStatus(inclusionData.status)}"`,
          oldInclusion.status, inclusionData.status);
      }

      if (collabChanged) {
        const oldCollabName = nomeDoColaborador(oldInclusion.collaboratorId);
        const newCollabName = nomeDoColaborador(inclusionData.collaboratorId);
        push("collaborator_changed", `Colaborador alterado de "${oldCollabName}" para "${newCollabName}"`, oldCollabName, newCollabName);
      }

      // Normaliza qualquer valor de data (Date, ISO, texto) → "YYYY-MM-DD"
      const toIsoDate = (d: unknown): string => {
        if (!d) return "";
        if (d instanceof Date) return d.toISOString().slice(0, 10);
        const s = String(d).trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
        const parsed = new Date(s);
        if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
        return s;
      };
      const fmtDate = (d: unknown): string => {
        const iso = toIsoDate(d);
        if (!iso) return "N/A";
        const parts = iso.split("-");
        return parts.length >= 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : iso;
      };

      const oldDaysArr = (oldInclusion.workDays || []).map(toIsoDate).filter(Boolean).sort();
      const newDaysArr = Array.isArray(inclusionData.workDays) ? inclusionData.workDays.map(toIsoDate).filter(Boolean).sort() : null;
      const workDaysAlsoChanging = !!newDaysArr && oldDaysArr.join(",") !== newDaysArr.join(",");

      // Período — só quando os dias NÃO mudam junto (o registro consolidado abaixo já traz o período)
      if (!workDaysAlsoChanging &&
          ((inclusionData.scheduleStartDate && inclusionData.scheduleStartDate !== oldInclusion.scheduleStartDate) ||
           (inclusionData.scheduleEndDate && inclusionData.scheduleEndDate !== oldInclusion.scheduleEndDate))) {
        const prevPeriod = `${fmtDate(oldInclusion.scheduleStartDate)} a ${fmtDate(oldInclusion.scheduleEndDate)}`;
        const newPeriod = `${fmtDate(inclusionData.scheduleStartDate || oldInclusion.scheduleStartDate)} a ${fmtDate(inclusionData.scheduleEndDate || oldInclusion.scheduleEndDate)}`;
        push("dates_changed", `Período: ${prevPeriod} → ${newPeriod}`, prevPeriod, newPeriod);
      }

      if ((inclusionData.flightDepartureDate && inclusionData.flightDepartureDate !== oldInclusion.flightDepartureDate) ||
          (inclusionData.flightReturnDate && inclusionData.flightReturnDate !== oldInclusion.flightReturnDate)) {
        push("travel_dates_changed", "Datas de viagem alteradas",
          `${oldInclusion.flightDepartureDate || "N/A"} a ${oldInclusion.flightReturnDate || "N/A"}`,
          `${inclusionData.flightDepartureDate || oldInclusion.flightDepartureDate || "N/A"} a ${inclusionData.flightReturnDate || oldInclusion.flightReturnDate || "N/A"}`);
      }

      if (inclusionData.observations !== undefined && inclusionData.observations !== oldInclusion.observations) {
        push("observations_changed", "Observações atualizadas", oldInclusion.observations || "", inclusionData.observations || "");
      }

      if (!workDaysAlsoChanging && inclusionData.dailyRates !== undefined && inclusionData.dailyRates !== oldInclusion.dailyRates) {
        push("daily_rates_changed",
          `Quantidade de diárias alterada de ${oldInclusion.dailyRates ?? 0} para ${inclusionData.dailyRates}`,
          String(oldInclusion.dailyRates ?? 0), String(inclusionData.dailyRates));
      }

      if (inclusionData.dailyValue !== undefined && inclusionData.dailyValue !== oldInclusion.dailyValue) {
        const fmtCents = (v: number) => `R$ ${(v / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        push("daily_value_changed",
          `Valor da diária alterado de ${fmtCents(oldInclusion.dailyValue ?? 0)} para ${fmtCents(inclusionData.dailyValue)}`,
          String(oldInclusion.dailyValue ?? 0), String(inclusionData.dailyValue));
      }

      if (newDaysArr && workDaysAlsoChanging) {
        const fmtDay = (d: string) => { const parts = toIsoDate(d).split("-"); return parts.length >= 3 ? `${parts[2]}/${parts[1]}` : d; };
        const oldPeriodStart = oldDaysArr[0] || toIsoDate(oldInclusion.scheduleStartDate);
        const oldPeriodEnd = oldDaysArr[oldDaysArr.length - 1] || toIsoDate(oldInclusion.scheduleEndDate);
        const newPeriodStart = newDaysArr[0] || toIsoDate(inclusionData.scheduleStartDate) || toIsoDate(oldInclusion.scheduleStartDate);
        const newPeriodEnd = newDaysArr[newDaysArr.length - 1] || toIsoDate(inclusionData.scheduleEndDate) || toIsoDate(oldInclusion.scheduleEndDate);
        const details = [
          `${oldDaysArr.length} dia(s) → ${newDaysArr.length} dia(s)`,
          `Período: ${fmtDate(oldPeriodStart)} a ${fmtDate(oldPeriodEnd)} → ${fmtDate(newPeriodStart)} a ${fmtDate(newPeriodEnd)}`,
          `Dias: ${oldDaysArr.length > 0 ? oldDaysArr.map(fmtDay).join(", ") : "nenhum"} → ${newDaysArr.length > 0 ? newDaysArr.map(fmtDay).join(", ") : "nenhum"}`,
        ].join(" | ");
        push("work_days_changed", details, oldDaysArr.join(", ") || "nenhum", newDaysArr.join(", ") || "nenhum");
      }

      if (inclusionData.city !== undefined && inclusionData.city !== oldInclusion.city) {
        push("city_changed",
          `Cidade alterada de "${oldInclusion.city || "Não informada"}" para "${inclusionData.city || "Não informada"}"`,
          oldInclusion.city || "", inclusionData.city || "");
      }

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

  // Tickets
  async getTickets(eventId?: string): Promise<Ticket[]> {
    if (!eventId) return await db.select().from(tickets);
    // Só as passagens de vagas do evento — a tela de Passagens por evento não
    // precisa baixar a tabela inteira (23/09).
    return await db.select().from(tickets).where(exists(
      db.select({ id: teamInclusions.id }).from(teamInclusions)
        .where(and(eq(teamInclusions.id, tickets.teamInclusionId), eq(teamInclusions.eventId, eventId))),
    ));
  }

  async getTicket(id: string): Promise<Ticket | undefined> {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id));
    return ticket;
  }

  /**
   * Passagens de UMA vaga (ida e volta podem ser linhas separadas).
   *
   * Existe para a janela do pedido de ajuste (`shared/scaling-change-window`):
   * a pergunta "já compraram a passagem desta vaga?" não pode custar um
   * `getTickets()` da tabela inteira a cada abertura de modal.
   */
  async getAccommodationsByInclusionId(teamInclusionId: string): Promise<Accommodation[]> {
    return await db.select().from(accommodations).where(eq(accommodations.teamInclusionId, teamInclusionId));
  }

  async getTicketsByInclusionId(teamInclusionId: string): Promise<Ticket[]> {
    return await db.select().from(tickets).where(eq(tickets.teamInclusionId, teamInclusionId));
  }

  async createTicket(ticketData: InsertTicket): Promise<Ticket> {
    const [ticket] = await db.insert(tickets).values(ticketData).returning();
    return ticket;
  }

  async updateTicket(id: string, ticketData: Partial<InsertTicket>): Promise<Ticket> {
    const [ticket] = await db.update(tickets).set(ticketData).where(eq(tickets.id, id)).returning();
    return ticket;
  }

  // Accommodations
  async getAccommodations(eventId?: string): Promise<Accommodation[]> {
    if (!eventId) return await db.select().from(accommodations);
    return await db.select().from(accommodations).where(exists(
      db.select({ id: teamInclusions.id }).from(teamInclusions)
        .where(and(eq(teamInclusions.id, accommodations.teamInclusionId), eq(teamInclusions.eventId, eventId))),
    ));
  }

  async getAccommodation(id: string): Promise<Accommodation | undefined> {
    const [accommodation] = await db.select().from(accommodations).where(eq(accommodations.id, id));
    return accommodation;
  }

  async createAccommodation(accommodationData: InsertAccommodation): Promise<Accommodation> {
    const [accommodation] = await db.insert(accommodations).values(accommodationData).returning();
    return accommodation;
  }

  async updateAccommodation(id: string, accommodationData: Partial<InsertAccommodation>): Promise<Accommodation> {
    const [accommodation] = await db.update(accommodations).set(accommodationData).where(eq(accommodations.id, id)).returning();
    return accommodation;
  }

  // Financial
  async getFinancials(): Promise<Financial[]> {
    return await db.select().from(financial);
  }

  async getFinancial(id: string): Promise<Financial | undefined> {
    const [fin] = await db.select().from(financial).where(eq(financial.id, id));
    return fin;
  }

  async createFinancial(financialData: InsertFinancial): Promise<Financial> {
    const [fin] = await db.insert(financial).values(financialData).returning();
    return fin;
  }

  async updateFinancial(id: string, financialData: Partial<InsertFinancial>): Promise<Financial> {
    const [fin] = await db.update(financial).set(financialData).where(eq(financial.id, id)).returning();
    return fin;
  }

  // Comments
  async getComments(teamInclusionId: string): Promise<Comment[]> {
    return await db.select().from(comments).where(eq(comments.teamInclusionId, teamInclusionId));
  }

  async getAllComments(limit = 500): Promise<Comment[]> {
    // ORDER BY e LIMIT no banco (23/09): antes a tabela inteira vinha para o
    // Node e era ordenada em JS a cada abertura da tela.
    return await db.select().from(comments)
      .orderBy(sql`${comments.createdAt} DESC NULLS LAST`, desc(comments.id))
      .limit(Math.max(1, Math.min(limit, 2000)));
  }

  async createComment(commentData: InsertComment): Promise<Comment> {
    const [comment] = await db.insert(comments).values(commentData).returning();

    // Nome real do autor no log (antes era o literal "Usuário")
    const author = commentData.userId ? await this.getUser(commentData.userId) : undefined;

    await this.createSystemLog({
      action: "create",
      entityType: "comment",
      entityId: comment.teamInclusionId,
      entityName: `Comentário na inclusão ${comment.teamInclusionId}`,
      details: `Novo comentário adicionado: "${commentData.content.substring(0, 50)}..."`,
      newData: JSON.stringify(comment),
      userId: commentData.userId,
      userName: author?.name || "Usuário",
    });

    return comment;
  }
  
  // System Logs
  async getSystemLogs(filters?: { entityType?: string; action?: string; days?: number; search?: string; userId?: string; limit?: number; offset?: number }): Promise<{ logs: SystemLog[]; total: number }> {
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

  async createSystemLog(logData: InsertSystemLog): Promise<SystemLog> {
    const [log] = await db.insert(systemLogs).values(logData).returning();
    return log;
  }

  async createSystemLogsBatch(logs: InsertSystemLog[]): Promise<void> {
    if (logs.length === 0) return;
    await db.insert(systemLogs).values(logs);
  }
  
  // Team Inclusion Logs
  async getTeamInclusionLogs(teamInclusionId: string): Promise<TeamInclusionLog[]> {
    const logs = await db
      .select()
      .from(teamInclusionLogs)
      .where(eq(teamInclusionLogs.teamInclusionId, teamInclusionId));
    
    // Sort by creation time, newest first
    return logs.sort((a, b) => {
      if (!a.createdAt || !b.createdAt) return 0;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  /**
   * Logs de VÁRIAS vagas numa leitura só (evita N+1 quando a lista de sugestões
   * precisa da última decisão do aprovador de cada linha). `actions` filtra no
   * banco; array vazio (de ids ou de actions) devolve [] sem consultar — um
   * `inArray` com lista vazia gera SQL inválido no drizzle.
   * Ordenado do mais novo para o mais antigo, como `getTeamInclusionLogs`.
   */
  async getTeamInclusionLogsByInclusionIds(ids: string[], actions?: string[]): Promise<TeamInclusionLog[]> {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (uniqueIds.length === 0) return [];
    const uniqueActions = actions ? Array.from(new Set(actions.filter(Boolean))) : undefined;
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

  async createTeamInclusionLog(logData: InsertTeamInclusionLog): Promise<TeamInclusionLog> {
    const [log] = await db.insert(teamInclusionLogs).values(logData).returning();
    return log;
  }

  async createTeamInclusionLogsBatch(logs: InsertTeamInclusionLog[]): Promise<void> {
    if (logs.length === 0) return;
    await db.insert(teamInclusionLogs).values(logs);
  }

  // Function Values
  async getFunctionValues(functionId: string): Promise<FunctionValue | undefined> {
    const [value] = await db.select().from(functionValues).where(eq(functionValues.functionId, functionId));
    return value;
  }

  async getAllFunctionValues(): Promise<FunctionValue[]> {
    return await db.select().from(functionValues);
  }

  async createFunctionValue(value: InsertFunctionValue): Promise<FunctionValue> {
    const [created] = await db.insert(functionValues).values(value).returning();
    return created;
  }

  async updateFunctionValue(id: string, value: Partial<InsertFunctionValue>): Promise<FunctionValue> {
    const [updated] = await db.update(functionValues).set({ ...value, updatedAt: new Date() }).where(eq(functionValues.id, id)).returning();
    return updated;
  }

  // Budget Planned
  async getBudgetPlanned(eventId: string): Promise<BudgetPlanned[]> {
    return await db.select().from(budgetPlanned).where(eq(budgetPlanned.eventId, eventId));
  }

  async getBudgetPlannedById(id: string): Promise<BudgetPlanned | undefined> {
    const [planned] = await db.select().from(budgetPlanned).where(eq(budgetPlanned.id, id));
    return planned;
  }

  async getAllBudgetPlanned(): Promise<BudgetPlanned[]> {
    return await db.select().from(budgetPlanned);
  }

  async createBudgetPlanned(planned: InsertBudgetPlanned): Promise<BudgetPlanned> {
    const [created] = await db.insert(budgetPlanned).values(planned).returning();
    return created;
  }

  async updateBudgetPlanned(id: string, planned: Partial<InsertBudgetPlanned>): Promise<BudgetPlanned> {
    const [updated] = await db.update(budgetPlanned).set({ ...planned, updatedAt: new Date() }).where(eq(budgetPlanned.id, id)).returning();
    return updated;
  }

  async deleteBudgetPlanned(id: string): Promise<void> {
    await db.delete(budgetPlanned).where(eq(budgetPlanned.id, id));
  }

  // Budget Actual
  async getBudgetActual(eventId: string): Promise<BudgetActual[]> {
    return await db.select().from(budgetActual).where(eq(budgetActual.eventId, eventId));
  }

  async getBudgetActualById(id: string): Promise<BudgetActual | undefined> {
    const [actual] = await db.select().from(budgetActual).where(eq(budgetActual.id, id));
    return actual;
  }

  async getAllBudgetActual(): Promise<BudgetActual[]> {
    return await db.select().from(budgetActual);
  }

  async createBudgetActual(actual: InsertBudgetActual): Promise<BudgetActual> {
    const [created] = await db.insert(budgetActual).values(actual).returning();
    return created;
  }

  async updateBudgetActual(id: string, actual: Partial<InsertBudgetActual>): Promise<BudgetActual> {
    const [updated] = await db.update(budgetActual).set({ ...actual, updatedAt: new Date() }).where(eq(budgetActual.id, id)).returning();
    return updated;
  }

  async deleteBudgetActual(id: string): Promise<void> {
    await db.delete(budgetActual).where(eq(budgetActual.id, id));
  }

  // Budget Comparison
  async getBudgetComparison(eventId: string): Promise<BudgetComparison | undefined> {
    const [comparison] = await db.select().from(budgetComparison).where(eq(budgetComparison.eventId, eventId));
    return comparison;
  }

  async getAllBudgetComparisons(): Promise<BudgetComparison[]> {
    return await db.select().from(budgetComparison);
  }

  async createBudgetComparison(comparison: InsertBudgetComparison): Promise<BudgetComparison> {
    const [created] = await db.insert(budgetComparison).values(comparison).returning();
    return created;
  }

  async updateBudgetComparison(id: string, comparison: Partial<InsertBudgetComparison>): Promise<BudgetComparison> {
    const [updated] = await db.update(budgetComparison).set({ ...comparison, updatedAt: new Date() }).where(eq(budgetComparison.id, id)).returning();
    return updated;
  }

  async getSystemSettings(): Promise<SystemSetting[]> {
    return await db.select().from(systemSettings);
  }

  async upsertSystemSetting(key: string, value: string, updatedBy?: string): Promise<SystemSetting> {
    // UPSERT atômico pela unique de `key` (23/09): o SELECT-depois-INSERT
    // anterior corria com outro salvamento e um dos dois caía em 23505.
    const [row] = await db.insert(systemSettings)
      .values({ key, value, updatedBy: updatedBy ?? null })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value, updatedAt: new Date(), updatedBy: updatedBy ?? null },
      })
      .returning();
    return row;
  }

  async getInvoices(eventId?: string): Promise<Invoice[]> {
    if (eventId) {
      return await db.select().from(invoices).where(eq(invoices.eventId, eventId));
    }
    return await db.select().from(invoices);
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    return invoice;
  }

  async createInvoice(invoice: InsertInvoice): Promise<Invoice> {
    const [created] = await db.insert(invoices).values(invoice).returning();
    return created;
  }

  async updateInvoice(id: string, invoice: Partial<Invoice>): Promise<Invoice> {
    const [updated] = await db.update(invoices)
      .set({ ...invoice, updatedAt: new Date() })
      .where(eq(invoices.id, id))
      .returning();
    return updated;
  }

  async getPaymentCompanies(): Promise<PaymentCompany[]> {
    return db.select().from(paymentCompanies).orderBy(paymentCompanies.name);
  }

  async createPaymentCompany(company: InsertPaymentCompany): Promise<PaymentCompany> {
    const [created] = await db.insert(paymentCompanies).values(company).returning();
    return created;
  }

  async getFlashMovements(collaboratorId?: string): Promise<FlashMovement[]> {
    const base = db.select().from(flashMovements);
    const ordered = collaboratorId
      ? base.where(eq(flashMovements.collaboratorId, collaboratorId))
      : base;
    return await ordered.orderBy(asc(flashMovements.movementDate), asc(flashMovements.createdAt));
  }

  async getFlashMovement(id: string): Promise<FlashMovement | undefined> {
    const [row] = await db.select().from(flashMovements).where(eq(flashMovements.id, id));
    return row;
  }

  async getFlashMovementsBySource(sourceType: string, sourceRef: string): Promise<FlashMovement[]> {
    return await db.select().from(flashMovements)
      .where(and(eq(flashMovements.sourceType, sourceType), eq(flashMovements.sourceRef, sourceRef)));
  }

  async createFlashMovement(movement: InsertFlashMovementWithSource): Promise<FlashMovement> {
    const [created] = await db.insert(flashMovements).values(movement).returning();
    return created;
  }

  // Inserção atômica (crédito inicial = 2 lançamentos que não podem ficar pela metade)
  async createFlashMovementsBatch(movements: InsertFlashMovementWithSource[]): Promise<FlashMovement[]> {
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
  async updateFlashMovement(id: string, updates: Partial<InsertFlashMovementWithSource>): Promise<FlashMovement | undefined> {
    const [updated] = await db
      .update(flashMovements)
      .set(updates)
      .where(eq(flashMovements.id, id))
      .returning();
    return updated;
  }

  async deleteFlashMovement(id: string): Promise<void> {
    await db.delete(flashMovements).where(eq(flashMovements.id, id));
  }

  async deletePaymentCompany(id: number): Promise<void> {
    await db.delete(paymentCompanies).where(eq(paymentCompanies.id, id));
  }

  // ── Baggage Requests (Controle de Bagagem) ──────────────────────────────
  // Soft delete: as listagens só devolvem registros com deleted_at nulo.

  async getBaggageRequests(eventId?: string): Promise<BaggageRequest[]> {
    const conditions = eventId
      ? and(isNull(baggageRequests.deletedAt), eq(baggageRequests.eventId, eventId))
      : isNull(baggageRequests.deletedAt);
    return await db.select().from(baggageRequests)
      .where(conditions)
      .orderBy(desc(baggageRequests.boardingDate), desc(baggageRequests.createdAt));
  }

  async getBaggageRequest(id: string): Promise<BaggageRequest | undefined> {
    const [row] = await db.select().from(baggageRequests).where(eq(baggageRequests.id, id));
    return row || undefined;
  }

  async createBaggageRequest(request: InsertBaggageRequest & { createdBy?: string | null; createdByName?: string | null }): Promise<BaggageRequest> {
    const [created] = await db.insert(baggageRequests).values(request).returning();
    return created;
  }

  async updateBaggageRequest(id: string, updates: Partial<InsertBaggageRequest>): Promise<BaggageRequest | undefined> {
    const [updated] = await db.update(baggageRequests)
      .set(updates)
      .where(and(eq(baggageRequests.id, id), isNull(baggageRequests.deletedAt)))
      .returning();
    return updated || undefined;
  }

  async softDeleteBaggageRequest(id: string, deletedBy: string): Promise<void> {
    await db.update(baggageRequests)
      .set({ deletedAt: new Date(), deletedBy })
      .where(and(eq(baggageRequests.id, id), isNull(baggageRequests.deletedAt)));
  }

  // Histórico pré-sistema (importado da planilha antiga; somente leitura)
  async getBaggageHistory(): Promise<BaggageHistoryEntry[]> {
    return await db.select().from(baggageHistory);
  }

  // Define a contagem histórica de um colaborador × CIA (UPSERT). quantity 0
  // remove a linha — o histórico só guarda contagens > 0.
  async setBaggageHistory(
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

  // ── Validação de Escala ───────────────────────────────────────────────────
  // Sugestões em lote + observações do evento numa única transação: ou entra
  // tudo, ou nada (mesmo padrão de createTeamInclusionsBatch).
  async createScalingSuggestionsBatch(
    rows: InsertTeamInclusion[],
    eventUpdate?: { eventId: string; observations: string | null },
    logFor?: (created: TeamInclusion) => InsertTeamInclusionLog,
  ): Promise<TeamInclusion[]> {
    return await db.transaction(async (tx) => {
      // INSERT multi-linha + logs na MESMA transação (23/09): antes eram N
      // inserts e os logs iam depois, fora dela — uma falha no meio deixava
      // vaga sem registro de criação.
      const created = rows.length > 0 ? await tx.insert(teamInclusions).values(rows).returning() : [];
      if (logFor && created.length > 0) {
        await tx.insert(teamInclusionLogs).values(created.map(logFor));
      }
      if (eventUpdate) {
        await tx.update(events)
          .set({ observations: eventUpdate.observations })
          .where(eq(events.id, eventUpdate.eventId));
      }
      return created;
    });
  }

  async validateScalingSuggestionsBatch(
    ids: string[],
    patch: Partial<InsertTeamInclusion>,
    expected: { phase: string; status: string },
    logFor: (updated: TeamInclusion) => InsertTeamInclusionLog,
  ): Promise<TeamInclusion[]> {
    const unique = Array.from(new Set(ids.filter(Boolean)));
    if (unique.length === 0) return [];
    return await db.transaction(async (tx) => {
      // Um único UPDATE guardado pelo estado esperado: vaga que mudou de estado
      // entre a leitura e a gravação simplesmente não volta no RETURNING.
      const updated = await tx.update(teamInclusions)
        .set(patch)
        .where(and(
          inArray(teamInclusions.id, unique),
          isNull(teamInclusions.deletedAt),
          eq(teamInclusions.phase, expected.phase),
          eq(teamInclusions.status, expected.status),
        ))
        .returning();
      if (updated.length > 0) {
        await tx.insert(teamInclusionLogs).values(updated.map((row) => logFor(row)));
      }
      return updated;
    });
  }

  /**
   * "Cancelar envio" da Sugestão de Escala — desfaz o /bulk de um evento inteiro.
   *
   * UMA transação com três passos: (1) soft delete das vagas do evento em
   * phase 'sugestao' cujo status está em `statuses` e que ainda não foram
   * excluídas; (2) um log por vaga removida; (3) encerramento dos pedidos
   * PENDENTES daquelas vagas — mais os pedidos de INCLUSÃO do evento
   * (team_inclusion_id null), que pedem uma vaga nova num envio que deixou de
   * existir. Ou tudo entra, ou nada: sem a transação, um erro no meio deixaria
   * vagas excluídas com pedidos vivos apontando para elas.
   *
   * A regra de QUEM sai (status / pedidos) mora em
   * shared/scaling-validation-rules.ts — aqui só o SQL.
   */
  async cancelScalingSuggestionSend(params: CancelSuggestionSendParams): Promise<CancelSuggestionSendResult> {
    const statuses = Array.from(new Set(params.statuses.filter(Boolean)));
    if (statuses.length === 0) return { removed: [], requestsCanceled: [] };
    return await db.transaction(async (tx) => {
      const removed = await tx.update(teamInclusions)
        .set(params.patch)
        .where(and(
          eq(teamInclusions.eventId, params.eventId),
          eq(teamInclusions.phase, SUGESTAO_PHASE_VALUE),
          inArray(teamInclusions.status, statuses),
          isNull(teamInclusions.deletedAt),
        ))
        .returning();
      // Nada removido: não há pedido a encerrar (o único caso de pedido sem vaga
      // é o de inclusão, e ele só faz sentido com o envio ainda de pé).
      if (removed.length === 0) return { removed, requestsCanceled: [] };

      await tx.insert(teamInclusionLogs).values(removed.map((row) => params.logFor(row)));

      // Os pedidos pendentes do evento são poucos (fila da área) — lê e decide
      // com a regra do shared, em vez de reescrevê-la como um WHERE paralelo.
      const removedIds = new Set(removed.map((r) => r.id));
      const pending = await tx.select().from(scalingChangeRequests).where(and(
        eq(scalingChangeRequests.eventId, params.eventId),
        eq(scalingChangeRequests.status, PENDING_REQUEST_STATUS),
      ));
      const toCancel = pending.filter((r) => params.shouldCancelRequest(r, removedIds));
      if (toCancel.length === 0) return { removed, requestsCanceled: [] };

      const requestsCanceled = await tx.update(scalingChangeRequests)
        .set({ ...params.requestPatch, updatedAt: new Date() })
        .where(inArray(scalingChangeRequests.id, toCancel.map((r) => r.id)))
        .returning();
      return { removed, requestsCanceled };
    });
  }

  async getFunctionsByIds(ids: string[]): Promise<Function[]> {
    const unique = Array.from(new Set(ids.filter(Boolean)));
    if (unique.length === 0) return [];
    return await db.select().from(functions).where(inArray(functions.id, unique));
  }

  async getEventsByIds(ids: string[]): Promise<Event[]> {
    const unique = Array.from(new Set(ids.filter(Boolean)));
    if (unique.length === 0) return [];
    return await db.select().from(events).where(inArray(events.id, unique));
  }

  async getScalingChangeRequests(filters?: {
    status?: string; eventId?: string; eventIds?: string[]; functionIds?: string[];
    /**
     * Quem abriu o pedido também o vê, mesmo sem ser aprovador da função. Sem
     * isto, quem pediu um ajuste não tinha como acompanhar a própria fila —
     * perguntava por fora "e aí, saiu?".
     */
    orRequestedBy?: string;
  }): Promise<ScalingChangeRequest[]> {
    const conditions = [];
    if (filters?.status && filters.status !== "all") conditions.push(eq(scalingChangeRequests.status, filters.status));
    if (filters?.eventId && filters.eventId !== "all") conditions.push(eq(scalingChangeRequests.eventId, filters.eventId));
    // Recorte "todos os eventos" da Validação de Escala: o servidor manda o
    // conjunto de eventos que ainda importa — filtro no banco, nunca em JS.
    if (filters?.eventIds) {
      if (filters.eventIds.length === 0) return [];
      conditions.push(inArray(scalingChangeRequests.eventId, filters.eventIds));
    }
    if (filters?.functionIds) {
      const porFuncao = filters.functionIds.length > 0
        ? inArray(scalingChangeRequests.functionId, filters.functionIds)
        : null;
      const meus = filters.orRequestedBy ? eq(scalingChangeRequests.requestedBy, filters.orRequestedBy) : null;
      // Aprovador de algumas funções E autor de pedidos em outras: vê os dois
      // conjuntos, não a interseção.
      if (porFuncao && meus) conditions.push(or(porFuncao, meus)!);
      else if (porFuncao) conditions.push(porFuncao);
      else if (meus) conditions.push(meus);
      else return [];
    }
    const query = db.select().from(scalingChangeRequests).orderBy(desc(scalingChangeRequests.createdAt));
    if (conditions.length === 0) return await query;
    return await query.where(and(...conditions));
  }

  async getScalingChangeRequest(id: string): Promise<ScalingChangeRequest | undefined> {
    const [row] = await db.select().from(scalingChangeRequests).where(eq(scalingChangeRequests.id, id));
    return row;
  }

  async getScalingChangeRequestsByInclusion(teamInclusionId: string): Promise<ScalingChangeRequest[]> {
    return await db.select().from(scalingChangeRequests)
      .where(eq(scalingChangeRequests.teamInclusionId, teamInclusionId))
      .orderBy(desc(scalingChangeRequests.createdAt));
  }

  async createScalingChangeRequest(request: InsertScalingChangeRequestRow): Promise<ScalingChangeRequest> {
    const [row] = await db.insert(scalingChangeRequests).values(request).returning();
    return row;
  }

  async updateScalingChangeRequest(id: string, updates: Partial<InsertScalingChangeRequestRow>): Promise<ScalingChangeRequest | undefined> {
    const [row] = await db.update(scalingChangeRequests)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(scalingChangeRequests.id, id))
      .returning();
    return row;
  }

  /**
   * UPDATE guardado pelo estado esperado (mesmo padrão de
   * `validateScalingSuggestionsBatch`): a decisão concorrente que chegou antes
   * mudou phase/status e este UPDATE simplesmente não encontra a linha.
   */
  async updateTeamInclusionIfState(
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

  // Abertura de pedido + transição da vaga (pendente → ajuste) na MESMA
  // transação: sem isso, um retry podia gravar o pedido e deixar a vaga no
  // estado antigo (ou vice-versa). O UPDATE da vaga é GUARDADO pelo estado
  // esperado (`newState.expected`): se uma decisão concorrente já tirou a vaga
  // de lá, 0 linhas → a transação ABORTA e o pedido NÃO fica criado (senão
  // sobraria um pedido pendente preso apontando para uma vaga já decidida).
  async createScalingChangeRequestWithTransition(
    request: InsertScalingChangeRequestRow,
    inclusionId: string | null,
    newState: {
      phase: string; status: string; updatedBy?: string | null;
      expected: { phase: string; statuses: readonly string[] };
    } | null,
  ): Promise<{ request: ScalingChangeRequest; inclusion: TeamInclusion | null }> {
    return await db.transaction(async (tx) => {
      const [created] = await tx.insert(scalingChangeRequests).values(request).returning();
      let inclusion: TeamInclusion | null = null;
      if (inclusionId && newState) {
        const [row] = await tx.update(teamInclusions)
          .set({ phase: newState.phase, status: newState.status, updatedBy: newState.updatedBy ?? undefined })
          .where(and(
            eq(teamInclusions.id, inclusionId),
            isNull(teamInclusions.deletedAt),
            eq(teamInclusions.phase, newState.expected.phase),
            inArray(teamInclusions.status, [...newState.expected.statuses]),
          ))
          .returning();
        // Lança DENTRO da transação: o insert do pedido é desfeito junto.
        if (!row) throw new Error(VAGA_STATE_CHANGED_MSG);
        inclusion = row;
      }
      return { request: created, inclusion };
    });
  }

  // Decisão do aprovador (aprovar / reajustar / negar) numa ÚNICA transação:
  // aplica mudanças na(s) vaga(s) e/ou cria vagas novas E marca o pedido como
  // decidido. Um retry não duplica vagas nem deixa o pedido preso em 'pendente'.
  // Se houver inserts, resolvedInclusionId do pedido = id da primeira vaga criada.
  // ATENÇÃO: resolvedInclusionId é UMA coluna e um pedido de inclusão com
  // quantity > 1 cria N vagas — as vagas 2..N NÃO ficam apontadas aqui. Quem as
  // reconecta ao pedido (para exibir "Vaga criada pelo aprovador — validar" e o
  // comentário dele) é `matchesCreatedFromRequest` em server/scaling-validation.ts,
  // que casa evento + função + suggestionSentAt == reviewedAt. Por isso o
  // chamador DEVE usar o MESMO objeto Date em requestUpdates.reviewedAt e no
  // suggestionSentAt das linhas inseridas.
  async resolveScalingChangeRequest(
    requestId: string,
    requestUpdates: Partial<InsertScalingChangeRequestRow>,
    ops: {
      inclusionUpdate?: {
        id: string; patch: Partial<InsertTeamInclusion>;
        expected?: { phase: string; statuses: readonly string[] };
      } | null;
      inclusionInserts?: InsertTeamInclusion[];
      logsForCreated?: (created: TeamInclusion[]) => InsertTeamInclusionLog[];
    } = {},
  ): Promise<{ request: ScalingChangeRequest; updatedInclusion: TeamInclusion | null; createdInclusions: TeamInclusion[] }> {
    return await db.transaction(async (tx) => {
      // Trava o pedido: só decide se ainda estiver pendente (evita dupla decisão em retry).
      const [locked] = await tx.update(scalingChangeRequests)
        .set({ updatedAt: new Date() })
        .where(and(eq(scalingChangeRequests.id, requestId), eq(scalingChangeRequests.status, "pendente")))
        .returning();
      if (!locked) throw new Error("Este pedido já foi decidido");

      let updatedInclusion: TeamInclusion | null = null;
      if (ops.inclusionUpdate) {
        // UPDATE guardado pelo estado esperado (quando o chamador o informa):
        // se a vaga já não está mais lá (decisão concorrente), 0 linhas → a
        // transação ABORTA e o pedido volta a 'pendente' intacto.
        const expected = ops.inclusionUpdate.expected;
        const [row] = await tx.update(teamInclusions)
          .set(ops.inclusionUpdate.patch)
          .where(and(
            eq(teamInclusions.id, ops.inclusionUpdate.id),
            ...(expected
              ? [
                  isNull(teamInclusions.deletedAt),
                  eq(teamInclusions.phase, expected.phase),
                  inArray(teamInclusions.status, [...expected.statuses]),
                ]
              : []),
          ))
          .returning();
        if (!row) throw new Error(expected ? VAGA_STATE_CHANGED_MSG : "Vaga do pedido não encontrada");
        updatedInclusion = row;
      }
      // INSERT multi-linha (23/09); o RETURNING preserva a ordem dos VALUES,
      // então createdInclusions[0] continua sendo a primeira vaga pedida.
      const inserts = ops.inclusionInserts ?? [];
      const createdInclusions: TeamInclusion[] = inserts.length > 0
        ? await tx.insert(teamInclusions).values(inserts).returning()
        : [];
      if (ops.logsForCreated && createdInclusions.length > 0) {
        const logs = ops.logsForCreated(createdInclusions);
        if (logs.length > 0) await tx.insert(teamInclusionLogs).values(logs);
      }
      const resolvedInclusionId = requestUpdates.resolvedInclusionId
        ?? createdInclusions[0]?.id
        ?? null;
      const [request] = await tx.update(scalingChangeRequests)
        .set({ ...requestUpdates, resolvedInclusionId, updatedAt: new Date() })
        .where(eq(scalingChangeRequests.id, requestId))
        .returning();
      return { request, updatedInclusion, createdInclusions };
    });
  }
}

export const storage = new DatabaseStorage();
