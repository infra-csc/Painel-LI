import { randomUUID } from "crypto";
import { db } from "./db";
import { 
  users, events, functions, collaborators, teamInclusions, tickets, financial, comments, systemLogs,
  type User, type InsertUser,
  type Event, type InsertEvent,
  type Function, type InsertFunction,
  type Collaborator, type InsertCollaborator,
  type TeamInclusion, type InsertTeamInclusion,
  type Ticket, type InsertTicket,
  type Financial, type InsertFinancial,
  type Comment, type InsertComment,
  type SystemLog, type InsertSystemLog
} from "@shared/schema";
import { eq } from "drizzle-orm";

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
  createEvent(event: InsertEvent): Promise<Event>;
  updateEvent(id: string, event: Partial<InsertEvent>): Promise<Event>;
  
  // Functions
  getFunctions(): Promise<Function[]>;
  getFunction(id: string): Promise<Function | undefined>;
  createFunction(func: InsertFunction): Promise<Function>;
  updateFunction(id: string, func: Partial<InsertFunction>): Promise<Function>;
  deleteFunction(id: string): Promise<void>;
  getFunctionsByUser(userId: string): Promise<Function[]>;
  
  // Collaborators
  getCollaborators(): Promise<Collaborator[]>;
  getCollaborator(id: string): Promise<Collaborator | undefined>;
  createCollaborator(collaborator: InsertCollaborator): Promise<Collaborator>;
  updateCollaborator(id: string, collaborator: Partial<InsertCollaborator>): Promise<Collaborator>;
  
  // Team Inclusions
  getTeamInclusions(): Promise<TeamInclusion[]>;
  getTeamInclusion(id: string): Promise<TeamInclusion | undefined>;
  createTeamInclusion(inclusion: InsertTeamInclusion): Promise<TeamInclusion>;
  updateTeamInclusion(id: string, inclusion: Partial<InsertTeamInclusion>): Promise<TeamInclusion>;
  deleteTeamInclusion(id: string): Promise<void>;
  
  // Tickets
  getTickets(): Promise<Ticket[]>;
  getTicket(id: string): Promise<Ticket | undefined>;
  createTicket(ticket: InsertTicket): Promise<Ticket>;
  updateTicket(id: string, ticket: Partial<InsertTicket>): Promise<Ticket>;
  
  // Financial
  getFinancials(): Promise<Financial[]>;
  getFinancial(id: string): Promise<Financial | undefined>;
  createFinancial(financial: InsertFinancial): Promise<Financial>;
  updateFinancial(id: string, financial: Partial<InsertFinancial>): Promise<Financial>;
  
  // Comments
  getComments(teamInclusionId: string): Promise<Comment[]>;
  createComment(comment: InsertComment): Promise<Comment>;
  
  // System Logs
  getSystemLogs(filters?: { entityType?: string; action?: string; days?: number }): Promise<SystemLog[]>;
  createSystemLog(log: InsertSystemLog): Promise<SystemLog>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private events: Map<string, Event> = new Map();
  private functions: Map<string, Function> = new Map();
  private collaborators: Map<string, Collaborator> = new Map();
  private teamInclusions: Map<string, TeamInclusion> = new Map();
  private tickets: Map<string, Ticket> = new Map();
  private financials: Map<string, Financial> = new Map();
  private comments: Map<string, Comment> = new Map();
  private systemLogs: Map<string, SystemLog> = new Map();
  private logCounter: number = 1;

  constructor() {
    // Initialize with demo data
    this.initializeDemoData();
  }

  private initializeDemoData() {
    // Create demo user with hashed password
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
      createdAt: new Date(),
    };
    this.users.set(demoUser.id, demoUser);
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
      isActive: true
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

  async createEvent(insertEvent: InsertEvent): Promise<Event> {
    const id = randomUUID();
    const event: Event = { 
      ...insertEvent, 
      id, 
      createdAt: new Date(), 
      eventNumber: insertEvent.eventNumber || 1,
      status: insertEvent.status || 'planejado', 
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
      functionNumber: insertFunction.functionNumber || 1,
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
      collaboratorNumber: insertCollaborator.collaboratorNumber || 1
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
  async getTeamInclusions(): Promise<TeamInclusion[]> {
    return Array.from(this.teamInclusions.values());
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
      status: insertInclusion.status || 'planejado',
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
      flightDepartureSuggestedTime: insertInclusion.flightDepartureSuggestedTime ?? null,
      flightReturnDate: insertInclusion.flightReturnDate ?? null,
      flightReturnSuggestedTime: insertInclusion.flightReturnSuggestedTime ?? null,
      needsTicket: insertInclusion.needsTicket || false
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

  async deleteTeamInclusion(id: string): Promise<void> {
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
      createdAt: new Date(),
      purchaseDate: insertTicket.purchaseDate ?? null,
      actualDepartureDate: insertTicket.actualDepartureDate ?? null,
      actualDepartureTime: insertTicket.actualDepartureTime ?? null,
      actualReturnDate: insertTicket.actualReturnDate || new Date().toISOString().split('T')[0],
      actualReturnTime: insertTicket.actualReturnTime ?? null,
      departureAirport: insertTicket.departureAirport ?? null,
      destinationAirport: insertTicket.destinationAirport ?? null,
      value: insertTicket.value ?? null,
      purchaseOrderNumber: insertTicket.purchaseOrderNumber ?? null,
      fileUrl: insertTicket.fileUrl ?? null,
      cardLastFourDigits: insertTicket.cardLastFourDigits ?? null
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
      observations: insertFinancial.observations || null,
      plannedDailyRates: insertFinancial.plannedDailyRates || null,
      actualDailyRates: insertFinancial.actualDailyRates || null,
      plannedValue: insertFinancial.plannedValue || null,
      actualValue: insertFinancial.actualValue || null,
      actualFee: insertFinancial.actualFee || null,
      approved: insertFinancial.approved || false,
      approvedAt: insertFinancial.approvedAt || null,
      approvedBy: insertFinancial.approvedBy || null
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

  async createComment(insertComment: InsertComment): Promise<Comment> {
    const id = randomUUID();
    const comment: Comment = { ...insertComment, id, createdAt: new Date() };
    this.comments.set(id, comment);
    return comment;
  }
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
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
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

  async createEvent(eventData: InsertEvent): Promise<Event> {
    const [event] = await db.insert(events).values(eventData).returning();
    return event;
  }

  async updateEvent(id: string, eventData: Partial<InsertEvent>): Promise<Event> {
    const [event] = await db.update(events).set(eventData).where(eq(events.id, id)).returning();
    return event;
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
  async getTeamInclusions(): Promise<TeamInclusion[]> {
    return await db.select().from(teamInclusions);
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
    const [inclusion] = await db.update(teamInclusions).set(inclusionData).where(eq(teamInclusions.id, id)).returning();
    return inclusion;
  }

  async deleteTeamInclusion(id: string): Promise<void> {
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
        filteredLogs = filteredLogs.filter(log => new Date(log.createdAt) >= cutoffDate);
      }
    }
    
    // Sort by creation time, newest first
    return filteredLogs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createSystemLog(logData: InsertSystemLog): Promise<SystemLog> {
    const [log] = await db.insert(systemLogs).values(logData).returning();
    return log;
  }
}

export const storage = new DatabaseStorage();
