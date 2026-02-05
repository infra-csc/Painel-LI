import { randomUUID } from "crypto";
import { db } from "./db";
import { 
  users, events, functions, collaborators, teamInclusions, tickets, accommodations, financial, comments, systemLogs,
  functionUsers, functionManagers, teamInclusionLogs, functionValues, budgetPlanned, budgetActual, budgetComparison,
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
  type BudgetComparison, type InsertBudgetComparison
} from "@shared/schema";
import { eq, and, sql, isNull } from "drizzle-orm";

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
  getEvents(): Promise<Event[]>;
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
  
  // Team Inclusions
  getTeamInclusions(includeDeleted?: boolean): Promise<TeamInclusion[]>;
  getTeamInclusion(id: string): Promise<TeamInclusion | undefined>;
  createTeamInclusion(inclusion: InsertTeamInclusion): Promise<TeamInclusion>;
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
  getSystemLogs(filters?: { entityType?: string; action?: string; days?: number }): Promise<SystemLog[]>;
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
}

export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private events: Map<string, Event> = new Map();
  private functions: Map<string, Function> = new Map();
  private collaborators: Map<string, Collaborator> = new Map();
  private teamInclusions: Map<string, TeamInclusion> = new Map();
  private tickets: Map<string, Ticket> = new Map();
  private accommodations: Map<string, Accommodation> = new Map();
  private financials: Map<string, Financial> = new Map();
  private comments: Map<string, Comment> = new Map();
  private systemLogs: Map<string, SystemLog> = new Map();
  private functionUsers: Map<string, FunctionUser> = new Map();
  private functionManagers: Map<string, FunctionManager> = new Map();
  private logCounter: number = 1;
  private eventCounter: number = 1;
  private functionCounter: number = 1;

  constructor() {
    // Initialize with demo data
    this.initializeDemoData();
  }

  private initializeDemoData() {
    // Create demo admin user with hashed password
    const demoUser: User = {
      id: "demo-user-1",
      email: "admin@sistema.com",
      password: "$2b$10$s39R6A1cSe6scFn/rIfPL.4LDZZGSXwDEw8Sf/TXXbiXihRLVfQJy", // admin123
      name: "João Pedro Silva",
      role: "admin",
      area: "Administração",
      resetToken: null,
      resetTokenExpiry: null,
      status: "approved",
      isActive: true,
      mustChangePassword: false,
      createdAt: new Date(),
    };
    this.users.set(demoUser.id, demoUser);

    // Create demo purchasing user for testing
    const purchasingUser: User = {
      id: "demo-user-purchasing",
      email: "compras@sistema.com",
      password: "$2b$10$s39R6A1cSe6scFn/rIfPL.4LDZZGSXwDEw8Sf/TXXbiXihRLVfQJy", // admin123
      name: "Maria Santos",
      role: "purchasing",
      area: "Compras e Viagens",
      resetToken: null,
      resetTokenExpiry: null,
      status: "approved",
      isActive: true,
      mustChangePassword: false,
      createdAt: new Date(),
    };
    this.users.set(purchasingUser.id, purchasingUser);
  }

  // Users
  async getUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  // Removed getUserByUsername since username field is removed

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.email === email);
  }

  async getUserByResetToken(token: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.resetToken === token);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { 
      ...insertUser, 
      id, 
      createdAt: new Date(), 
      area: insertUser.area || null,
      resetToken: null,
      resetTokenExpiry: null,
      status: insertUser.status || 'pending',
      isActive: true,
      mustChangePassword: false
    };
    this.users.set(id, user);
    return user;
  }

  async getUsersByStatus(status: 'pending' | 'approved' | 'rejected'): Promise<User[]> {
    return Array.from(this.users.values()).filter(user => user.status === status);
  }

  async approveUser(id: string, status: 'approved' | 'rejected', role?: string): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    
    const updatedUser = { ...user, status, ...(role && { role }) };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const existing = this.users.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.users.set(id, updated);
    return updated;
  }

  // Events
  async getEvents(): Promise<Event[]> {
    return Array.from(this.events.values());
  }

  async getEvent(id: string): Promise<Event | undefined> {
    return this.events.get(id);
  }

  async getEventsWithInclusions(): Promise<Event[]> {
    // Filtrar eventos que têm inclusões de equipe
    const allEvents = Array.from(this.events.values());
    const eventsWithInclusions = [];
    
    for (const event of allEvents) {
      const inclusionsForEvent = Array.from(this.teamInclusions.values())
        .filter(inclusion => inclusion.eventId === event.id);
      
      if (inclusionsForEvent.length > 0) {
        eventsWithInclusions.push(event);
      }
    }
    
    return eventsWithInclusions;
  }

  async createEvent(insertEvent: InsertEvent): Promise<Event> {
    const id = randomUUID();
    const event: Event = { 
      ...insertEvent, 
      id, 
      createdAt: new Date(), 
      eventNumber: this.eventCounter++,
      status: 'planejado', 
      observations: insertEvent.observations || null 
    };
    this.events.set(id, event);
    return event;
  }

  async updateEvent(id: string, eventUpdate: Partial<InsertEvent>): Promise<Event> {
    const existing = this.events.get(id);
    if (!existing) throw new Error("Event not found");
    const updated = { ...existing, ...eventUpdate };
    this.events.set(id, updated);
    return updated;
  }

  async deleteEvent(id: string): Promise<void> {
    if (!this.events.has(id)) {
      throw new Error("Event not found");
    }
    this.events.delete(id);
  }

  // Functions
  async getFunctions(): Promise<Function[]> {
    return Array.from(this.functions.values());
  }

  async getFunction(id: string): Promise<Function | undefined> {
    return this.functions.get(id);
  }

  async createFunction(insertFunction: InsertFunction): Promise<Function> {
    const id = randomUUID();
    const func: Function = { 
      ...insertFunction, 
      id, 
      createdAt: new Date(), 
      functionNumber: this.functionCounter++,
      description: insertFunction.description || null,
      responsibleArea: insertFunction.responsibleArea || null,
      quantity: insertFunction.quantity || 1,
      userId: insertFunction.userId || null
    };
    this.functions.set(id, func);
    return func;
  }

  async getFunctionsByUser(userId: string): Promise<Function[]> {
    return Array.from(this.functions.values()).filter(func => func.userId === userId);
  }

  async updateFunction(id: string, funcUpdate: Partial<InsertFunction>): Promise<Function> {
    const existing = this.functions.get(id);
    if (!existing) throw new Error("Function not found");
    const updated = { ...existing, ...funcUpdate };
    this.functions.set(id, updated);
    return updated;
  }

  async deleteFunction(id: string): Promise<void> {
    if (!this.functions.has(id)) {
      throw new Error("Function not found");
    }
    this.functions.delete(id);
  }

  // Function Users (assigned users)
  async getFunctionUsers(functionId: string): Promise<FunctionUser[]> {
    return Array.from(this.functionUsers.values()).filter(fu => fu.functionId === functionId);
  }

  async addUserToFunction(functionUser: InsertFunctionUser): Promise<FunctionUser> {
    const id = randomUUID();
    const fu: FunctionUser = {
      ...functionUser,
      id,
      createdAt: new Date()
    };
    this.functionUsers.set(id, fu);
    return fu;
  }

  async removeUserFromFunction(functionId: string, userId: string): Promise<void> {
    for (const [id, fu] of Array.from(this.functionUsers.entries())) {
      if (fu.functionId === functionId && fu.userId === userId) {
        this.functionUsers.delete(id);
        break;
      }
    }
  }

  async getUserFunctions(userId: string): Promise<Function[]> {
    const userFunctionIds = Array.from(this.functionUsers.values())
      .filter(fu => fu.userId === userId)
      .map(fu => fu.functionId);
    
    return Array.from(this.functions.values())
      .filter(func => userFunctionIds.includes(func.id));
  }

  // Function Managers (responsible users)
  async getFunctionManagers(functionId: string): Promise<FunctionManager[]> {
    return Array.from(this.functionManagers.values()).filter(fm => fm.functionId === functionId);
  }

  async addManagerToFunction(functionManager: InsertFunctionManager): Promise<FunctionManager> {
    const id = randomUUID();
    const fm: FunctionManager = {
      ...functionManager,
      id,
      createdAt: new Date()
    };
    this.functionManagers.set(id, fm);
    return fm;
  }

  async removeManagerFromFunction(functionId: string, userId: string): Promise<void> {
    for (const [id, fm] of Array.from(this.functionManagers.entries())) {
      if (fm.functionId === functionId && fm.userId === userId) {
        this.functionManagers.delete(id);
        break;
      }
    }
  }

  async removeUserFromAllFunctions(userId: string): Promise<void> {
    for (const [id, fm] of Array.from(this.functionManagers.entries())) {
      if (fm.userId === userId) {
        this.functionManagers.delete(id);
      }
    }
  }

  async getUserManagedFunctions(userId: string): Promise<Function[]> {
    const managedFunctionIds = Array.from(this.functionManagers.values())
      .filter(fm => fm.userId === userId)
      .map(fm => fm.functionId);
    
    return Array.from(this.functions.values())
      .filter(func => managedFunctionIds.includes(func.id));
  }

  async isUserFunctionManager(functionId: string, userId: string): Promise<boolean> {
    return Array.from(this.functionManagers.values())
      .some(fm => fm.functionId === functionId && fm.userId === userId);
  }

  // Collaborators
  async getCollaborators(): Promise<Collaborator[]> {
    return Array.from(this.collaborators.values());
  }

  async getCollaborator(id: string): Promise<Collaborator | undefined> {
    return this.collaborators.get(id);
  }

  async createCollaborator(insertCollaborator: InsertCollaborator): Promise<Collaborator> {
    const id = randomUUID();
    const collaborator: Collaborator = { 
      ...insertCollaborator, 
      id, 
      createdAt: new Date(), 
      status: insertCollaborator.status || 'ativo',
      phone: insertCollaborator.phone || null,
      collaboratorNumber: insertCollaborator.collaboratorNumber || 1,
      approvalNotes: insertCollaborator.approvalNotes || null,
      approvedBy: insertCollaborator.approvedBy || null,
      approvedAt: insertCollaborator.approvedAt || null
    };
    this.collaborators.set(id, collaborator);
    return collaborator;
  }

  async updateCollaborator(id: string, collaboratorUpdate: Partial<InsertCollaborator>): Promise<Collaborator> {
    const existing = this.collaborators.get(id);
    if (!existing) throw new Error("Collaborator not found");
    const updated = { ...existing, ...collaboratorUpdate };
    this.collaborators.set(id, updated);
    return updated;
  }

  // Team Inclusions
  async getTeamInclusions(includeDeleted: boolean = false): Promise<TeamInclusion[]> {
    const allInclusions = Array.from(this.teamInclusions.values());
    if (!includeDeleted) {
      return allInclusions.filter(inclusion => !inclusion.deletedAt);
    }
    return allInclusions;
  }

  async getTeamInclusion(id: string): Promise<TeamInclusion | undefined> {
    return this.teamInclusions.get(id);
  }

  async createTeamInclusion(insertInclusion: InsertTeamInclusion): Promise<TeamInclusion> {
    const id = randomUUID();
    const inclusion: TeamInclusion = { 
      id,
      eventId: insertInclusion.eventId,
      functionId: insertInclusion.functionId,
      userId: insertInclusion.userId,
      inclusionNumber: insertInclusion.inclusionNumber || 1,
      area: insertInclusion.area ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedBy: insertInclusion.updatedBy || null,
      status: insertInclusion.status || 'planejado',
      previousStatus: insertInclusion.previousStatus ?? null,
      phase: insertInclusion.phase || 'inclusao',
      observations: insertInclusion.observations ?? null,
      actualObservations: insertInclusion.actualObservations ?? null,
      collaboratorId: insertInclusion.collaboratorId ?? null,
      actualStartDate: insertInclusion.actualStartDate ?? null,
      actualEndDate: insertInclusion.actualEndDate ?? null,
      actualDailyRates: insertInclusion.actualDailyRates ?? null,
      emergencyRecord: insertInclusion.emergencyRecord || false,
      dailyValue: insertInclusion.dailyValue || 0,
      dailyRates: insertInclusion.dailyRates || 1,
      scheduleStartDate: insertInclusion.scheduleStartDate ?? null,
      scheduleEndDate: insertInclusion.scheduleEndDate ?? null,
      flightDepartureDate: insertInclusion.flightDepartureDate ?? null,
      flightArrivalSuggestedTime: insertInclusion.flightArrivalSuggestedTime ?? null,
      flightReturnDate: insertInclusion.flightReturnDate ?? null,
      flightReturnSuggestedTime: insertInclusion.flightReturnSuggestedTime ?? null,
      needsTicket: insertInclusion.needsTicket || false,
      needsAccommodation: insertInclusion.needsAccommodation || false,
      rowOrder: insertInclusion.rowOrder ?? null
    };
    this.teamInclusions.set(id, inclusion);
    return inclusion;
  }

  async updateTeamInclusion(id: string, inclusionUpdate: Partial<InsertTeamInclusion>): Promise<TeamInclusion> {
    const existing = this.teamInclusions.get(id);
    if (!existing) throw new Error("Team inclusion not found");
    const updated = { ...existing, ...inclusionUpdate, updatedAt: new Date() };
    this.teamInclusions.set(id, updated);
    return updated;
  }

  async deleteTeamInclusion(id: string, userId?: string): Promise<void> {
    if (!this.teamInclusions.has(id)) {
      throw new Error("Team inclusion not found");
    }
    this.teamInclusions.delete(id);
  }

  // Tickets
  async getTickets(): Promise<Ticket[]> {
    return Array.from(this.tickets.values());
  }

  async getTicket(id: string): Promise<Ticket | undefined> {
    return this.tickets.get(id);
  }

  async createTicket(insertTicket: InsertTicket): Promise<Ticket> {
    const id = randomUUID();
    const ticket: Ticket = { 
      id,
      teamInclusionId: insertTicket.teamInclusionId,
      transportType: insertTicket.transportType ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedBy: insertTicket.updatedBy || null,
      purchaseDate: insertTicket.purchaseDate ?? null,
      actualDepartureDate: insertTicket.actualDepartureDate ?? null,
      actualDepartureTime: insertTicket.actualDepartureTime ?? null,
      actualReturnDate: insertTicket.actualReturnDate || new Date().toISOString().split('T')[0],
      actualReturnTime: insertTicket.actualReturnTime ?? null,
      departureCityOrigin: insertTicket.departureCityOrigin ?? null,
      departureCityDestination: insertTicket.departureCityDestination ?? null,
      returnCityOrigin: insertTicket.returnCityOrigin ?? null,
      returnCityDestination: insertTicket.returnCityDestination ?? null,
      departureAirport: insertTicket.departureAirport ?? null,
      destinationAirport: insertTicket.destinationAirport ?? null,
      value: insertTicket.value ?? null,
      purchaseOrderNumber: insertTicket.purchaseOrderNumber ?? null,
      fileUrl: insertTicket.fileUrl ?? null,
      attachmentIds: insertTicket.attachmentIds || null,
      cardLastFourDigits: insertTicket.cardLastFourDigits ?? null,
      ticketObservations: insertTicket.ticketObservations ?? null
    };
    this.tickets.set(id, ticket);
    return ticket;
  }

  async updateTicket(id: string, ticketUpdate: Partial<InsertTicket>): Promise<Ticket> {
    const existing = this.tickets.get(id);
    if (!existing) throw new Error("Ticket not found");
    const updated = { ...existing, ...ticketUpdate };
    this.tickets.set(id, updated);
    return updated;
  }

  // Accommodations
  async getAccommodations(): Promise<Accommodation[]> {
    return Array.from(this.accommodations.values());
  }

  async getAccommodation(id: string): Promise<Accommodation | undefined> {
    return this.accommodations.get(id);
  }

  async createAccommodation(insertAccommodation: InsertAccommodation): Promise<Accommodation> {
    const id = randomUUID();
    const accommodation: Accommodation = { 
      id,
      teamInclusionId: insertAccommodation.teamInclusionId,
      checkInDate: insertAccommodation.checkInDate ?? null,
      checkInTime: insertAccommodation.checkInTime ?? null,
      checkOutDate: insertAccommodation.checkOutDate ?? null,
      checkOutTime: insertAccommodation.checkOutTime ?? null,
      hotelLocation: insertAccommodation.hotelLocation ?? null,
      hotelName: insertAccommodation.hotelName ?? null,
      accommodationObservations: insertAccommodation.accommodationObservations ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedBy: insertAccommodation.updatedBy || null
    };
    this.accommodations.set(id, accommodation);
    return accommodation;
  }

  async updateAccommodation(id: string, accommodationUpdate: Partial<InsertAccommodation>): Promise<Accommodation> {
    const existing = this.accommodations.get(id);
    if (!existing) throw new Error("Accommodation not found");
    const updated = { ...existing, ...accommodationUpdate };
    this.accommodations.set(id, updated);
    return updated;
  }

  // Financial
  async getFinancials(): Promise<Financial[]> {
    return Array.from(this.financials.values());
  }

  async getFinancial(id: string): Promise<Financial | undefined> {
    return this.financials.get(id);
  }

  async createFinancial(insertFinancial: InsertFinancial): Promise<Financial> {
    const id = randomUUID();
    const financial: Financial = { 
      ...insertFinancial, 
      id, 
      createdAt: new Date(),
      updatedAt: new Date(),
      observations: insertFinancial.observations || null,
      plannedDailyRates: insertFinancial.plannedDailyRates || null,
      actualDailyRates: insertFinancial.actualDailyRates || null,
      plannedValue: insertFinancial.plannedValue || null,
      actualValue: insertFinancial.actualValue || null,
      actualFee: insertFinancial.actualFee || null,
      approved: insertFinancial.approved || false,
      approvedAt: insertFinancial.approvedAt || null,
      approvedBy: insertFinancial.approvedBy || null,
      updatedBy: insertFinancial.updatedBy || null
    };
    this.financials.set(id, financial);
    return financial;
  }

  async updateFinancial(id: string, financialUpdate: Partial<InsertFinancial>): Promise<Financial> {
    const existing = this.financials.get(id);
    if (!existing) throw new Error("Financial not found");
    const updated = { ...existing, ...financialUpdate };
    this.financials.set(id, updated);
    return updated;
  }

  // Comments
  async getComments(teamInclusionId: string): Promise<Comment[]> {
    return Array.from(this.comments.values()).filter(comment => comment.teamInclusionId === teamInclusionId);
  }

  async getAllComments(): Promise<Comment[]> {
    return Array.from(this.comments.values()).sort((a, b) => 
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }

  async createComment(insertComment: InsertComment): Promise<Comment> {
    const id = randomUUID();
    const comment: Comment = { ...insertComment, id, createdAt: new Date() };
    this.comments.set(id, comment);
    return comment;
  }
  
  // System Logs
  async getSystemLogs(filters?: { entityType?: string; action?: string; days?: number }): Promise<SystemLog[]> {
    const logs = Array.from(this.systemLogs.values());
    
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
    }
    
    // Sort by creation time, newest first
    return filteredLogs.sort((a, b) => {
      if (!a.createdAt || !b.createdAt) return 0;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  async createSystemLog(insertLog: InsertSystemLog): Promise<SystemLog> {
    const id = randomUUID();
    const log: SystemLog = { 
      ...insertLog, 
      id,
      logNumber: this.logCounter++,
      createdAt: new Date(),
      userId: insertLog.userId || null,
      userName: insertLog.userName || null,
      entityName: insertLog.entityName || null,
      previousData: insertLog.previousData || null,
      newData: insertLog.newData || null,
      ipAddress: insertLog.ipAddress || null,
      userAgent: insertLog.userAgent || null
    };
    this.systemLogs.set(id, log);
    return log;
  }
  
  // Team Inclusion Logs - stub methods (not used in memory storage)
  async getTeamInclusionLogs(teamInclusionId: string): Promise<TeamInclusionLog[]> {
    return [];
  }
  
  async createTeamInclusionLog(log: InsertTeamInclusionLog): Promise<TeamInclusionLog> {
    const id = randomUUID();
    const logEntry: TeamInclusionLog = {
      ...log,
      id,
      createdAt: new Date(),
    };
    return logEntry;
  }

  // Function Values - stub implementations
  async getFunctionValues(functionId: string): Promise<FunctionValue | undefined> { return undefined; }
  async getAllFunctionValues(): Promise<FunctionValue[]> { return []; }
  async createFunctionValue(value: InsertFunctionValue): Promise<FunctionValue> { throw new Error("Not implemented"); }
  async updateFunctionValue(id: string, value: Partial<InsertFunctionValue>): Promise<FunctionValue> { throw new Error("Not implemented"); }

  // Budget Planned - stub implementations
  async getBudgetPlanned(eventId: string): Promise<BudgetPlanned[]> { return []; }
  async getBudgetPlannedById(id: string): Promise<BudgetPlanned | undefined> { return undefined; }
  async getAllBudgetPlanned(): Promise<BudgetPlanned[]> { return []; }
  async createBudgetPlanned(planned: InsertBudgetPlanned): Promise<BudgetPlanned> { throw new Error("Not implemented"); }
  async updateBudgetPlanned(id: string, planned: Partial<InsertBudgetPlanned>): Promise<BudgetPlanned> { throw new Error("Not implemented"); }
  async deleteBudgetPlanned(id: string): Promise<void> {}

  // Budget Actual - stub implementations
  async getBudgetActual(eventId: string): Promise<BudgetActual[]> { return []; }
  async getBudgetActualById(id: string): Promise<BudgetActual | undefined> { return undefined; }
  async getAllBudgetActual(): Promise<BudgetActual[]> { return []; }
  async createBudgetActual(actual: InsertBudgetActual): Promise<BudgetActual> { throw new Error("Not implemented"); }
  async updateBudgetActual(id: string, actual: Partial<InsertBudgetActual>): Promise<BudgetActual> { throw new Error("Not implemented"); }
  async deleteBudgetActual(id: string): Promise<void> {}

  // Budget Comparison - stub implementations
  async getBudgetComparison(eventId: string): Promise<BudgetComparison | undefined> { return undefined; }
  async getAllBudgetComparisons(): Promise<BudgetComparison[]> { return []; }
  async createBudgetComparison(comparison: InsertBudgetComparison): Promise<BudgetComparison> { throw new Error("Not implemented"); }
  async updateBudgetComparison(id: string, comparison: Partial<InsertBudgetComparison>): Promise<BudgetComparison> { throw new Error("Not implemented"); }
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
  async getEvents(): Promise<Event[]> {
    return await db.select().from(events);
  }

  async getEvent(id: string): Promise<Event | undefined> {
    const [event] = await db.select().from(events).where(eq(events.id, id));
    return event;
  }

  async getEventsWithInclusions(): Promise<Event[]> {
    // Buscar eventos que têm inclusões de equipe usando JOIN
    const eventsWithTeamInclusions = await db
      .selectDistinct({ 
        id: events.id,
        name: events.name,
        location: events.location,
        startDate: events.startDate,
        endDate: events.endDate,
        observations: events.observations,
        eventNumber: events.eventNumber,
        status: events.status,
        createdAt: events.createdAt
      })
      .from(events)
      .innerJoin(teamInclusions, eq(events.id, teamInclusions.eventId));
    
    return eventsWithTeamInclusions;
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
    return await db.select().from(collaborators);
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
        status: teamInclusions.status,
        previousStatus: teamInclusions.previousStatus,
        phase: teamInclusions.phase,
        userId: teamInclusions.userId,
        createdAt: teamInclusions.createdAt,
        updatedAt: teamInclusions.updatedAt,
        updatedBy: teamInclusions.updatedBy,
        deletedAt: teamInclusions.deletedAt,
        deletedBy: teamInclusions.deletedBy,
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
    
    // Work dates change
    if ((inclusionData.scheduleStartDate && inclusionData.scheduleStartDate !== oldInclusion.scheduleStartDate) ||
        (inclusionData.scheduleEndDate && inclusionData.scheduleEndDate !== oldInclusion.scheduleEndDate)) {
      logsToCreate.push({
        teamInclusionId: id,
        action: 'dates_changed',
        details: `Período de trabalho alterado`,
        previousValue: `${oldInclusion.scheduleStartDate || 'N/A'} a ${oldInclusion.scheduleEndDate || 'N/A'}`,
        newValue: `${inclusionData.scheduleStartDate || oldInclusion.scheduleStartDate || 'N/A'} a ${inclusionData.scheduleEndDate || oldInclusion.scheduleEndDate || 'N/A'}`,
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
    
    // Create log entry for comment creation
    await this.createSystemLog({
      action: "create",
      entityType: "comment",
      entityId: comment.teamInclusionId,
      entityName: `Comentário na inclusão ${comment.teamInclusionId}`,
      details: `Novo comentário adicionado: "${commentData.content.substring(0, 50)}..."`,
      newData: JSON.stringify(comment),
      userId: commentData.userId,
      userName: "Usuário", // Would normally fetch from user table
    });
    
    return comment;
  }
  
  // System Logs
  async getSystemLogs(filters?: { entityType?: string; action?: string; days?: number }): Promise<SystemLog[]> {
    let query = db.select().from(systemLogs);
    
    // Apply filters if provided
    if (filters?.days) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - filters.days);
      // This would need proper date filtering in production
    }
    
    const logs = await query;
    
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
    }
    
    // Sort by creation time, newest first
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
}

export const storage = new DatabaseStorage();
