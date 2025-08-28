import { randomUUID } from "crypto";
import type {
  User, InsertUser,
  Event, InsertEvent,
  Function, InsertFunction,
  Collaborator, InsertCollaborator,
  TeamInclusion, InsertTeamInclusion,
  Ticket, InsertTicket,
  Financial, InsertFinancial,
  Comment, InsertComment
} from "@shared/schema";

export interface IStorage {
  // Users
  getUsers(): Promise<User[]>;
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
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

  constructor() {
    // Initialize with demo data
    this.initializeDemoData();
  }

  private initializeDemoData() {
    // Create demo user
    const demoUser: User = {
      id: "demo-user-1",
      username: "admin",
      email: "admin@sistema.com",
      password: "admin123",
      name: "João Pedro Silva",
      role: "admin",
      area: "Administração",
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

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.email === email);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id, createdAt: new Date(), area: insertUser.area || null };
    this.users.set(id, user);
    return user;
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
    const event: Event = { ...insertEvent, id, createdAt: new Date(), status: insertEvent.status || 'planejado', observations: insertEvent.observations || null };
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
      description: insertFunction.description || null,
      quantity: insertFunction.quantity || 1
    };
    this.functions.set(id, func);
    return func;
  }

  async updateFunction(id: string, funcUpdate: Partial<InsertFunction>): Promise<Function> {
    const existing = this.functions.get(id);
    if (!existing) throw new Error("Function not found");
    const updated = { ...existing, ...funcUpdate };
    this.functions.set(id, updated);
    return updated;
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
    const collaborator: Collaborator = { ...insertCollaborator, id, createdAt: new Date(), status: insertCollaborator.status || 'ativo' };
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
      ...insertInclusion, 
      id, 
      createdAt: new Date(),
      updatedAt: new Date(),
      status: insertInclusion.status || 'planejado',
      phase: insertInclusion.phase || 'inclusao',
      area: insertInclusion.area || null,
      observations: insertInclusion.observations || null,
      actualObservations: insertInclusion.actualObservations || null,
      collaboratorId: insertInclusion.collaboratorId || null,
      actualStartDate: insertInclusion.actualStartDate || null,
      actualEndDate: insertInclusion.actualEndDate || null,
      actualDailyRates: insertInclusion.actualDailyRates || null,
      emergencyRecord: insertInclusion.emergencyRecord || false,
      dailyValue: insertInclusion.dailyValue || 0,
      flightDepartureDate: insertInclusion.flightDepartureDate || null,
      flightDepartureSuggestedTime: insertInclusion.flightDepartureSuggestedTime || null,
      flightReturnDate: insertInclusion.flightReturnDate || null,
      flightReturnSuggestedTime: insertInclusion.flightReturnSuggestedTime || null,
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
      ...insertTicket, 
      id, 
      createdAt: new Date(),
      purchaseDate: insertTicket.purchaseDate || null,
      actualDepartureDate: insertTicket.actualDepartureDate || null,
      actualDepartureTime: insertTicket.actualDepartureTime || null,
      actualReturnDate: insertTicket.actualReturnDate || null,
      actualReturnTime: insertTicket.actualReturnTime || null,
      departureAirport: insertTicket.departureAirport || null,
      destinationAirport: insertTicket.destinationAirport || null,
      value: insertTicket.value || null,
      purchaseOrderNumber: insertTicket.purchaseOrderNumber || null,
      fileUrl: insertTicket.fileUrl || null
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

export const storage = new MemStorage();
