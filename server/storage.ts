import { randomUUID } from "crypto";
import { db } from "./db";
import { 
  users, events, functions, collaborators, teamInclusions, tickets, accommodations, financial, comments, systemLogs,
  functionUsers, functionManagers, teamInclusionLogs, functionValues, budgetPlanned, budgetActual, budgetComparison, systemSettings, invoices, paymentCompanies,
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
  type TeamInclusionLog, type InsertTeamInclusionLog,
  type FunctionValue, type InsertFunctionValue,
  type BudgetPlanned, type InsertBudgetPlanned,
  type BudgetActual, type InsertBudgetActual,
  type BudgetComparison, type InsertBudgetComparison,
  type SystemSetting,
  type Invoice, type InsertInvoice,
  type PaymentCompany, type InsertPaymentCompany,
  flashMovements,
  type FlashMovement, type InsertFlashMovement
} from "@shared/schema";
import { eq, and, sql, isNull, ne, exists, asc } from "drizzle-orm";

export interface IStorage {
  // Users
  getUsers(): Promise<User[]>;
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
  removeUserFromAllFunctions(userId: string): Promise<void>;
  getUserManagedFunctions(userId: string): Promise<Function[]>;
  isUserFunctionManager(functionId: string, userId: string): Promise<boolean>;
  
  // Collaborators
  getCollaborators(): Promise<Collaborator[]>;
  getCollaborator(id: string): Promise<Collaborator | undefined>;
  createCollaborator(collaborator: InsertCollaborator): Promise<Collaborator>;
  updateCollaborator(id: string, collaborator: Partial<InsertCollaborator>): Promise<Collaborator>;
  deleteCollaborator(id: string): Promise<void>;
  
  // Team Inclusions
  getTeamInclusions(includeDeleted?: boolean): Promise<TeamInclusion[]>;
  getTeamInclusion(id: string): Promise<TeamInclusion | undefined>;
  createTeamInclusion(inclusion: InsertTeamInclusion): Promise<TeamInclusion>;
  createTeamInclusionsBatch(rows: InsertTeamInclusion[]): Promise<TeamInclusion[]>;
  updateTeamInclusion(id: string, inclusion: Partial<InsertTeamInclusion>): Promise<TeamInclusion>;
  deleteTeamInclusion(id: string, userId?: string): Promise<void>;
  
  // Tickets
  getTickets(): Promise<Ticket[]>;
  getTicket(id: string): Promise<Ticket | undefined>;
  createTicket(ticket: InsertTicket): Promise<Ticket>;
  updateTicket(id: string, ticket: Partial<InsertTicket>): Promise<Ticket>;
  
  // Accommodations
  getAccommodations(): Promise<Accommodation[]>;
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
  getAllComments(): Promise<Comment[]>;
  createComment(comment: InsertComment): Promise<Comment>;
  
  // System Logs
  getSystemLogs(filters?: { entityType?: string; action?: string; days?: number; search?: string; userId?: string }): Promise<SystemLog[]>;
  createSystemLog(log: InsertSystemLog): Promise<SystemLog>;
  
  // Team Inclusion Logs
  getTeamInclusionLogs(teamInclusionId: string): Promise<TeamInclusionLog[]>;
  createTeamInclusionLog(log: InsertTeamInclusionLog): Promise<TeamInclusionLog>;
  
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
  createFlashMovement(movement: InsertFlashMovement): Promise<FlashMovement>;
  createFlashMovementsBatch(movements: InsertFlashMovement[]): Promise<FlashMovement[]>;
  deleteFlashMovement(id: string): Promise<void>;
}

// Database storage implementation using PostgreSQL + Drizzle
export class DatabaseStorage implements IStorage {
  // Users
  async getUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  // Removed getUserByUsername since username field is removed

  async getUserByEmail(email: string): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.email, email));
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
    // Buscar eventos que têm inclusões usando EXISTS (sem duplicatas por JOIN)
    return await db
      .select()
      .from(events)
      .where(
        and(
          ne(events.status, "excluído"),
          exists(
            db.select({ id: teamInclusions.id })
              .from(teamInclusions)
              .where(eq(teamInclusions.eventId, events.id))
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

  // Collaborators
  async getCollaborators(): Promise<Collaborator[]> {
    // Sem ORDER BY o Postgres devolve na ordem física das linhas, que muda
    // conforme os registros são atualizados — a lista parecia embaralhar
    // sozinha. lower() para "ana" e "Ana" ficarem juntos independentemente da
    // collation do banco.
    return await db
      .select()
      .from(collaborators)
      .orderBy(asc(sql`lower(${collaborators.fullName})`));
  }

  async getCollaborator(id: string): Promise<Collaborator | undefined> {
    const [collaborator] = await db.select().from(collaborators).where(eq(collaborators.id, id));
    return collaborator;
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
  async getTeamInclusions(includeDeleted: boolean = false): Promise<TeamInclusion[]> {
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
        dailyRates: teamInclusions.dailyRates,
        workDays: teamInclusions.workDays,
        dailyValue: teamInclusions.dailyValue,
        actualDailyRates: teamInclusions.actualDailyRates,
        observations: teamInclusions.observations,
        actualObservations: teamInclusions.actualObservations,
        emergencyRecord: teamInclusions.emergencyRecord,
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
        functionName: functions.name,
        eventName: events.name,
        rowOrder: teamInclusions.rowOrder,
      })
      .from(teamInclusions)
      .leftJoin(functions, eq(teamInclusions.functionId, functions.id))
      .leftJoin(events, eq(teamInclusions.eventId, events.id));

    // Se não incluir deletados, filtra apenas os não excluídos
    if (!includeDeleted) {
      return await query.where(isNull(teamInclusions.deletedAt));
    }
    
    return await query;
  }

  async getTeamInclusion(id: string): Promise<TeamInclusion | undefined> {
    const [inclusion] = await db.select().from(teamInclusions).where(eq(teamInclusions.id, id));
    return inclusion;
  }

  async createTeamInclusion(inclusionData: InsertTeamInclusion): Promise<TeamInclusion> {
    const [inclusion] = await db.insert(teamInclusions).values(inclusionData).returning();
    return inclusion;
  }

  // Criação em lote numa única transação: a grade cria N escalações de uma vez;
  // sem transação, uma falha no meio deixava as anteriores gravadas (escalação
  // parcial). Ou todas entram, ou nenhuma.
  async createTeamInclusionsBatch(rows: InsertTeamInclusion[]): Promise<TeamInclusion[]> {
    return await db.transaction(async (tx) => {
      const created: TeamInclusion[] = [];
      for (const r of rows) {
        const [row] = await tx.insert(teamInclusions).values(r).returning();
        created.push(row);
      }
      return created;
    });
  }

  async updateTeamInclusion(id: string, inclusionData: Partial<InsertTeamInclusion>): Promise<TeamInclusion> {
    // Buscar dados antes da atualização para comparação
    const [oldInclusion] = await db.select().from(teamInclusions).where(eq(teamInclusions.id, id));
    if (!oldInclusion) throw new Error("Team inclusion not found");
    
    // Atualizar a inclusão
    const [inclusion] = await db.update(teamInclusions).set(inclusionData).where(eq(teamInclusions.id, id)).returning();
    
    // Buscar nome do usuário se disponível
    let userName = "Sistema";
    if (inclusionData.updatedBy) {
      const [user] = await db.select().from(users).where(eq(users.id, inclusionData.updatedBy));
      if (user) userName = user.name;
    }
    
    // Criar logs para mudanças significativas
    const logsToCreate: InsertTeamInclusionLog[] = [];
    
    // Status change
    if (inclusionData.status && inclusionData.status !== oldInclusion.status) {
      const statusLabels: Record<string, string> = {
        'planejado': 'Aguardando Escalação',
        'confirmado': 'Confirmado',
        'reaberto': 'Reaberto',
        'escalacao': 'Escalado',
        'aguardando_producao': 'Aguardando Aprovação da Produção',
        'passagem': 'Aguardando Passagem',
        'passagem_comprada': 'Passagem Comprada',
        'hospedagem': 'Aguardando Hospedagem',
        'hospedagem_comprada': 'Hospedagem Comprada',
        'hospedagem_passagem_comprada': 'Hospedagem e Passagem Comprada',
        'aprovacao': 'Aguardando Aprovação',
        'aprovado': 'Aprovado',
        'cancelado': 'Cancelado'
      };
      logsToCreate.push({
        teamInclusionId: id,
        action: 'status_changed',
        details: `Status alterado de "${statusLabels[oldInclusion.status] || oldInclusion.status}" para "${statusLabels[inclusionData.status] || inclusionData.status}"`,
        previousValue: oldInclusion.status,
        newValue: inclusionData.status,
        userId: inclusionData.updatedBy || 'system',
        userName
      });
    }
    
    // Collaborator change
    if (inclusionData.collaboratorId !== undefined && inclusionData.collaboratorId !== oldInclusion.collaboratorId) {
      const oldCollabName = oldInclusion.collaboratorId ? 
        (await db.select().from(collaborators).where(eq(collaborators.id, oldInclusion.collaboratorId)))[0]?.fullName || 'Desconhecido' 
        : 'Nenhum';
      const newCollabName = inclusionData.collaboratorId ? 
        (await db.select().from(collaborators).where(eq(collaborators.id, inclusionData.collaboratorId)))[0]?.fullName || 'Desconhecido' 
        : 'Nenhum';
      
      logsToCreate.push({
        teamInclusionId: id,
        action: 'collaborator_changed',
        details: `Colaborador alterado de "${oldCollabName}" para "${newCollabName}"`,
        previousValue: oldCollabName,
        newValue: newCollabName,
        userId: inclusionData.updatedBy || 'system',
        userName
      });
    }
    
    // Work dates change — only log separately when workDays is NOT also changing
    // (when workDays changes, the consolidated entry below handles period too)
    // Normalize any date value (Date object, ISO string, JS date string) → "YYYY-MM-DD"
    const toIsoDate = (d: unknown): string => {
      if (!d) return '';
      if (d instanceof Date) return d.toISOString().slice(0, 10);
      const s = String(d).trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
      const parsed = new Date(s);
      if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
      return s;
    };

    const workDaysAlsoChanging = Array.isArray(inclusionData.workDays) && (() => {
      const oldDays = (oldInclusion.workDays || []).map(toIsoDate).filter(Boolean).sort().join(',');
      const newDays = inclusionData.workDays!.map(toIsoDate).filter(Boolean).sort().join(',');
      return oldDays !== newDays;
    })();
    if (!workDaysAlsoChanging &&
        ((inclusionData.scheduleStartDate && inclusionData.scheduleStartDate !== oldInclusion.scheduleStartDate) ||
         (inclusionData.scheduleEndDate && inclusionData.scheduleEndDate !== oldInclusion.scheduleEndDate))) {
      const fmtDate = (d: string | null | undefined) => {
        if (!d) return 'N/A';
        const [y, m, day] = d.split('-');
        return `${day}/${m}/${y}`;
      };
      const prevPeriod = `${fmtDate(oldInclusion.scheduleStartDate)} a ${fmtDate(oldInclusion.scheduleEndDate)}`;
      const newPeriod = `${fmtDate(inclusionData.scheduleStartDate || oldInclusion.scheduleStartDate)} a ${fmtDate(inclusionData.scheduleEndDate || oldInclusion.scheduleEndDate)}`;
      logsToCreate.push({
        teamInclusionId: id,
        action: 'dates_changed',
        details: `Período: ${prevPeriod} → ${newPeriod}`,
        previousValue: prevPeriod,
        newValue: newPeriod,
        userId: inclusionData.updatedBy || 'system',
        userName
      });
    }
    
    // Travel dates change
    if ((inclusionData.flightDepartureDate && inclusionData.flightDepartureDate !== oldInclusion.flightDepartureDate) ||
        (inclusionData.flightReturnDate && inclusionData.flightReturnDate !== oldInclusion.flightReturnDate)) {
      logsToCreate.push({
        teamInclusionId: id,
        action: 'travel_dates_changed',
        details: `Datas de viagem alteradas`,
        previousValue: `${oldInclusion.flightDepartureDate || 'N/A'} a ${oldInclusion.flightReturnDate || 'N/A'}`,
        newValue: `${inclusionData.flightDepartureDate || oldInclusion.flightDepartureDate || 'N/A'} a ${inclusionData.flightReturnDate || oldInclusion.flightReturnDate || 'N/A'}`,
        userId: inclusionData.updatedBy || 'system',
        userName
      });
    }
    
    // Observations change
    if (inclusionData.observations !== undefined && inclusionData.observations !== oldInclusion.observations) {
      logsToCreate.push({
        teamInclusionId: id,
        action: 'observations_changed',
        details: `Observações atualizadas`,
        previousValue: oldInclusion.observations || '',
        newValue: inclusionData.observations || '',
        userId: inclusionData.updatedBy || 'system',
        userName
      });
    }

    // Daily rates (quantidade de diárias) — skip when workDays is also changing (consolidated below)
    if (!workDaysAlsoChanging && inclusionData.dailyRates !== undefined && inclusionData.dailyRates !== oldInclusion.dailyRates) {
      logsToCreate.push({
        teamInclusionId: id,
        action: 'daily_rates_changed',
        details: `Quantidade de diárias alterada de ${oldInclusion.dailyRates ?? 0} para ${inclusionData.dailyRates}`,
        previousValue: String(oldInclusion.dailyRates ?? 0),
        newValue: String(inclusionData.dailyRates),
        userId: inclusionData.updatedBy || 'system',
        userName
      });
    }

    // Daily value (valor da diária em centavos)
    if (inclusionData.dailyValue !== undefined && inclusionData.dailyValue !== oldInclusion.dailyValue) {
      const fmtCents = (v: number) => `R$ ${(v / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      logsToCreate.push({
        teamInclusionId: id,
        action: 'daily_value_changed',
        details: `Valor da diária alterado de ${fmtCents(oldInclusion.dailyValue ?? 0)} para ${fmtCents(inclusionData.dailyValue)}`,
        previousValue: String(oldInclusion.dailyValue ?? 0),
        newValue: String(inclusionData.dailyValue),
        userId: inclusionData.updatedBy || 'system',
        userName
      });
    }

    // Work days (dias específicos de trabalho) — consolidated entry with count and period
    if (Array.isArray(inclusionData.workDays)) {
      const oldDaysArr = (oldInclusion.workDays || []).map(toIsoDate).filter(Boolean).sort();
      const newDaysArr = inclusionData.workDays.map(toIsoDate).filter(Boolean).sort();
      if (oldDaysArr.join(',') !== newDaysArr.join(',')) {
        const fmtDay = (d: string) => { const parts = toIsoDate(d).split('-'); return parts.length >= 3 ? `${parts[2]}/${parts[1]}` : d; };
        const fmtDate = (d: unknown) => {
          const iso = toIsoDate(d);
          if (!iso) return 'N/A';
          const parts = iso.split('-');
          return parts.length >= 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : iso;
        };
        const oldCount = oldDaysArr.length;
        const newCount = newDaysArr.length;

        // Period before/after (use selected days' min/max if available, else schedule dates)
        const oldPeriodStart = oldDaysArr[0] || toIsoDate(oldInclusion.scheduleStartDate);
        const oldPeriodEnd = oldDaysArr[oldDaysArr.length - 1] || toIsoDate(oldInclusion.scheduleEndDate);
        const newPeriodStart = newDaysArr[0] || toIsoDate(inclusionData.scheduleStartDate) || toIsoDate(oldInclusion.scheduleStartDate);
        const newPeriodEnd = newDaysArr[newDaysArr.length - 1] || toIsoDate(inclusionData.scheduleEndDate) || toIsoDate(oldInclusion.scheduleEndDate);

        const oldDaysLabel = oldDaysArr.length > 0 ? oldDaysArr.map(fmtDay).join(', ') : 'nenhum';
        const newDaysLabel = newDaysArr.length > 0 ? newDaysArr.map(fmtDay).join(', ') : 'nenhum';

        const details = [
          `${oldCount} dia(s) → ${newCount} dia(s)`,
          `Período: ${fmtDate(oldPeriodStart)} a ${fmtDate(oldPeriodEnd)} → ${fmtDate(newPeriodStart)} a ${fmtDate(newPeriodEnd)}`,
          `Dias: ${oldDaysLabel} → ${newDaysLabel}`,
        ].join(' | ');

        logsToCreate.push({
          teamInclusionId: id,
          action: 'work_days_changed',
          details,
          previousValue: oldDaysArr.join(', ') || 'nenhum',
          newValue: newDaysArr.join(', ') || 'nenhum',
          userId: inclusionData.updatedBy || 'system',
          userName
        });
      }
    }

    // City change
    if (inclusionData.city !== undefined && inclusionData.city !== oldInclusion.city) {
      logsToCreate.push({
        teamInclusionId: id,
        action: 'city_changed',
        details: `Cidade alterada de "${oldInclusion.city || 'Não informada'}" para "${inclusionData.city || 'Não informada'}"`,
        previousValue: oldInclusion.city || '',
        newValue: inclusionData.city || '',
        userId: inclusionData.updatedBy || 'system',
        userName
      });
    }

    // Salvar todos os logs
    if (logsToCreate.length > 0) {
      await db.insert(teamInclusionLogs).values(logsToCreate);
    }
    
    return inclusion;
  }

  async deleteTeamInclusion(id: string, userId?: string): Promise<void> {
    // Buscar dados da inclusão antes de excluir para registrar no log
    const [inclusion] = await db.select().from(teamInclusions).where(eq(teamInclusions.id, id));
    if (!inclusion) {
      throw new Error("Team inclusion not found");
    }

    // Buscar nome do evento e função para o log
    const [event] = await db.select().from(events).where(eq(events.id, inclusion.eventId));
    const [func] = await db.select().from(functions).where(eq(functions.id, inclusion.functionId));
    
    // Buscar nome do colaborador se houver
    let collaboratorName = "Não escalado";
    if (inclusion.collaboratorId) {
      const [collaborator] = await db.select().from(collaborators).where(eq(collaborators.id, inclusion.collaboratorId));
      if (collaborator) {
        collaboratorName = collaborator.fullName;
      }
    }

    // Buscar nome do usuário que está excluindo
    let userName = "Sistema";
    if (userId) {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (user) userName = user.name;
    }

    // Registrar log de exclusão
    const details = `Inclusão #${inclusion.inclusionNumber || 'N/A'} excluída - Evento: ${event?.name || 'N/A'}, Função: ${func?.name || 'N/A'}, Colaborador: ${collaboratorName}, Status: ${inclusion.status}`;
    
    await db.insert(teamInclusionLogs).values({
      teamInclusionId: id,
      action: 'deleted',
      details,
      previousValue: JSON.stringify(inclusion), // Salvar dados completos da inclusão
      newValue: null,
      userId: userId || 'system',
      userName
    });

    // Excluir a inclusão
    await db.delete(teamInclusions).where(eq(teamInclusions.id, id));
  }

  // Tickets
  async getTickets(): Promise<Ticket[]> {
    return await db.select().from(tickets);
  }

  async getTicket(id: string): Promise<Ticket | undefined> {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id));
    return ticket;
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
  async getAccommodations(): Promise<Accommodation[]> {
    return await db.select().from(accommodations);
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

  async getAllComments(): Promise<Comment[]> {
    const allComments = await db.select().from(comments);
    return allComments.sort((a, b) => 
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
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
  async getSystemLogs(filters?: { entityType?: string; action?: string; days?: number; search?: string; userId?: string }): Promise<SystemLog[]> {
    const logs = await db.select().from(systemLogs);
    
    let filteredLogs = logs;
    
    if (filters) {
      if (filters.entityType && filters.entityType !== "all") {
        filteredLogs = filteredLogs.filter(log => log.entityType === filters.entityType);
      }
      if (filters.action && filters.action !== "all") {
        filteredLogs = filteredLogs.filter(log => log.action === filters.action);
      }
      if (filters.days) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - filters.days);
        filteredLogs = filteredLogs.filter(log => log.createdAt && new Date(log.createdAt) >= cutoffDate);
      }
      if (filters.userId) {
        filteredLogs = filteredLogs.filter(log => log.userId === filters.userId);
      }
      if (filters.search) {
        const term = filters.search.toLowerCase();
        filteredLogs = filteredLogs.filter(log =>
          (log.entityName || '').toLowerCase().includes(term) ||
          (log.userName || '').toLowerCase().includes(term) ||
          (log.details || '').toLowerCase().includes(term) ||
          (log.action || '').toLowerCase().includes(term) ||
          (log.entityType || '').toLowerCase().includes(term)
        );
      }
    }
    
    return filteredLogs.sort((a, b) => {
      if (!a.createdAt || !b.createdAt) return 0;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  async createSystemLog(logData: InsertSystemLog): Promise<SystemLog> {
    const [log] = await db.insert(systemLogs).values(logData).returning();
    return log;
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

  async createTeamInclusionLog(logData: InsertTeamInclusionLog): Promise<TeamInclusionLog> {
    const [log] = await db.insert(teamInclusionLogs).values(logData).returning();
    return log;
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
    const existing = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
    if (existing.length > 0) {
      const [updated] = await db.update(systemSettings)
        .set({ value, updatedAt: new Date(), updatedBy: updatedBy ?? null })
        .where(eq(systemSettings.key, key))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(systemSettings)
        .values({ key, value, updatedBy: updatedBy ?? null })
        .returning();
      return created;
    }
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

  async createFlashMovement(movement: InsertFlashMovement): Promise<FlashMovement> {
    const [created] = await db.insert(flashMovements).values(movement).returning();
    return created;
  }

  // Inserção atômica (crédito inicial = 2 lançamentos que não podem ficar pela metade)
  async createFlashMovementsBatch(movements: InsertFlashMovement[]): Promise<FlashMovement[]> {
    return await db.transaction(async (tx) => {
      const created: FlashMovement[] = [];
      for (const m of movements) {
        const [row] = await tx.insert(flashMovements).values(m).returning();
        created.push(row);
      }
      return created;
    });
  }

  async deleteFlashMovement(id: string): Promise<void> {
    await db.delete(flashMovements).where(eq(flashMovements.id, id));
  }

  async deletePaymentCompany(id: number): Promise<void> {
    await db.delete(paymentCompanies).where(eq(paymentCompanies.id, id));
  }
}

export const storage = new DatabaseStorage();
