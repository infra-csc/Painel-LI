import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table for authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(), // admin, production, function_area, purchasing, financial
  area: text("area"), // area responsável
  resetToken: text("reset_token"), // token for password reset
  resetTokenExpiry: timestamp("reset_token_expiry"), // expiry for reset token
  status: text("status").notNull().default("pending"), // pending, approved, rejected
  isActive: boolean("is_active").default(true), // account status
  createdAt: timestamp("created_at").defaultNow(),
});

// Events table
export const events = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventNumber: integer("event_number").notNull().default(sql`nextval('event_sequence')`),
  name: text("name").notNull(),
  location: text("location").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  observations: text("observations"),
  status: text("status").notNull().default("planejado"), // planejado, em_andamento, concluido
  createdAt: timestamp("created_at").defaultNow(),
});

// Functions table
export const functions = pgTable("functions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  functionNumber: integer("function_number").notNull().default(sql`nextval('function_sequence')`),
  name: text("name").notNull().unique(),
  description: text("description"),
  responsibleArea: text("responsible_area"),
  quantity: integer("quantity").notNull().default(1),
  userId: varchar("user_id").references(() => users.id), // função vinculada a usuário específico
  createdAt: timestamp("created_at").defaultNow(),
});

// Collaborators table
export const collaborators = pgTable("collaborators", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  collaboratorNumber: integer("collaborator_number").notNull().default(sql`nextval('collaborator_sequence')`),
  fullName: text("full_name").notNull(),
  officialDocument: text("official_document").notNull().unique(), // CPF or RG
  documentType: text("document_type").notNull(), // "cpf" or "rg"
  birthDate: date("birth_date").notNull(),
  area: text("area").notNull(),
  type: text("type").notNull(), // casa, freela, local
  phone: text("phone"), // Make phone optional
  city: text("city").notNull(),
  status: text("status").notNull().default("pendente"), // pendente, aprovado, rejeitado, inativo
  approvalNotes: text("approval_notes"), // observações do administrador
  approvedBy: varchar("approved_by").references(() => users.id), // quem aprovou/rejeitou
  approvedAt: timestamp("approved_at"), // quando foi aprovado/rejeitado
  createdAt: timestamp("created_at").defaultNow(),
});

// Team inclusions table
export const teamInclusions = pgTable("team_inclusions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  inclusionNumber: integer("inclusion_number").notNull().default(sql`nextval('inclusion_sequence')`),
  eventId: varchar("event_id").notNull().references(() => events.id),
  functionId: varchar("function_id").notNull().references(() => functions.id),
  collaboratorId: varchar("collaborator_id").references(() => collaborators.id),
  area: text("area"), // campo que existe no banco mas estava faltando no schema
  rowOrder: integer("row_order"), // posição da linha na planilha para templates
  scheduleStartDate: date("schedule_start_date"),
  scheduleEndDate: date("schedule_end_date"),
  actualStartDate: date("actual_start_date"), // data real de início de trabalho
  actualEndDate: date("actual_end_date"), // data real final
  flightDepartureDate: date("flight_departure_date"),
  flightDepartureSuggestedTime: text("flight_departure_suggested_time"),
  flightReturnDate: date("flight_return_date"),
  flightReturnSuggestedTime: text("flight_return_suggested_time"),
  needsTicket: boolean("needs_ticket").default(false),
  dailyRates: integer("daily_rates").notNull(), // quantidade de diárias planejadas
  dailyValue: integer("daily_value").notNull().default(0), // valor da diária em centavos
  actualDailyRates: integer("actual_daily_rates"), // quantidade real de diárias
  observations: text("observations"),
  actualObservations: text("actual_observations"), // observações do que realmente aconteceu
  emergencyRecord: boolean("emergency_record").default(false), // registro emergencial
  status: text("status").notNull().default("planejado"), // planejado, escalacao, passagem, fechamento, aprovado
  phase: text("phase").notNull().default("inclusao"), // inclusao, escalacao, passagem, fechamento, aprovacao
  userId: varchar("user_id").notNull().references(() => users.id), // usuário responsável pela função
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id), // quem fez a última alteração
});

// Tickets table
export const tickets = pgTable("tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamInclusionId: varchar("team_inclusion_id").notNull().references(() => teamInclusions.id),
  purchaseDate: date("purchase_date"),
  actualDepartureDate: date("actual_departure_date"),
  actualDepartureTime: text("actual_departure_time"),
  actualReturnDate: date("actual_return_date").notNull(), // agora obrigatório
  actualReturnTime: text("actual_return_time"),
  departureAirport: text("departure_airport"),
  destinationAirport: text("destination_airport"),
  value: integer("value"), // valor em centavos
  purchaseOrderNumber: text("purchase_order_number"),
  fileUrl: text("file_url"),
  attachmentIds: text("attachment_ids").array(), // IDs de referência dos anexos da passagem
  cardLastFourDigits: text("card_last_four_digits"), // últimos 4 dígitos do cartão
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id), // quem fez a última alteração
});

// Financial table
export const financial = pgTable("financial", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamInclusionId: varchar("team_inclusion_id").notNull().references(() => teamInclusions.id),
  plannedDailyRates: integer("planned_daily_rates"), // diárias planejadas
  actualDailyRates: integer("actual_daily_rates"), // diárias realizadas
  plannedValue: integer("planned_value"), // valor planejado em centavos
  actualValue: integer("actual_value"), // valor real em centavos
  actualFee: integer("actual_fee"), // cachê em centavos
  observations: text("observations"),
  approved: boolean("approved").default(false),
  approvedAt: timestamp("approved_at"),
  approvedBy: varchar("approved_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id), // quem fez a última alteração
});

// Comments table
export const comments = pgTable("comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamInclusionId: varchar("team_inclusion_id").notNull().references(() => teamInclusions.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  phase: text("phase").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// System Activity Logs table - for public audit trail
export const systemLogs = pgTable("system_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  logNumber: integer("log_number").notNull().default(sql`nextval('log_sequence')`),
  action: text("action").notNull(), // create, update, delete, approve, reject, etc
  entityType: text("entity_type").notNull(), // user, event, function, collaborator, team_inclusion, ticket, financial
  entityId: varchar("entity_id").notNull(), // ID of the affected entity
  entityName: text("entity_name"), // human readable name/description
  details: text("details").notNull(), // detailed description of what happened
  previousData: text("previous_data"), // JSON of old data for updates
  newData: text("new_data"), // JSON of new data 
  userId: varchar("user_id").references(() => users.id), // who performed the action (null for system actions)
  userName: text("user_name"), // cached user name for performance
  ipAddress: text("ip_address"), // IP address of action
  userAgent: text("user_agent"), // browser/client info
  createdAt: timestamp("created_at").defaultNow(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

// Public registration schema (no admin role allowed, no username)
export const publicUserRegistrationSchema = insertUserSchema.extend({
  role: z.enum(["production", "function_area", "purchasing", "financial"])
});

// Login schema (email + password only)
export const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres")
});

// User approval schema (admin only)
export const userApprovalSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  role: z.enum(["admin", "production", "function_area", "purchasing", "financial"]).optional()
});

export const insertEventSchema = createInsertSchema(events).omit({
  id: true,
  eventNumber: true, // tem valor default com sequence
  status: true, // tem valor default "planejado"
  createdAt: true,
});

export const insertFunctionSchema = createInsertSchema(functions).omit({
  id: true,
  createdAt: true,
});

export const insertCollaboratorSchema = createInsertSchema(collaborators).omit({
  id: true,
  createdAt: true,
});

export const insertTeamInclusionSchema = createInsertSchema(teamInclusions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTicketSchema = createInsertSchema(tickets).omit({
  id: true,
  createdAt: true,
}).extend({
  actualReturnDate: z.string().min(1, "Data de volta é obrigatória")
});

export const insertFinancialSchema = createInsertSchema(financial).omit({
  id: true,
  createdAt: true,
});

export const insertCommentSchema = createInsertSchema(comments).omit({
  id: true,
  createdAt: true,
});

export const insertSystemLogSchema = createInsertSchema(systemLogs).omit({
  id: true,
  logNumber: true,
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Event = typeof events.$inferSelect;
export type InsertEvent = z.infer<typeof insertEventSchema>;

export type Function = typeof functions.$inferSelect;
export type InsertFunction = z.infer<typeof insertFunctionSchema>;

export type Collaborator = typeof collaborators.$inferSelect;
export type InsertCollaborator = z.infer<typeof insertCollaboratorSchema>;

export type TeamInclusion = typeof teamInclusions.$inferSelect;
export type InsertTeamInclusion = z.infer<typeof insertTeamInclusionSchema>;

export type Ticket = typeof tickets.$inferSelect;
export type InsertTicket = z.infer<typeof insertTicketSchema>;

export type Financial = typeof financial.$inferSelect;
export type InsertFinancial = z.infer<typeof insertFinancialSchema>;

export type Comment = typeof comments.$inferSelect;
export type InsertComment = z.infer<typeof insertCommentSchema>;

export type SystemLog = typeof systemLogs.$inferSelect;
export type InsertSystemLog = z.infer<typeof insertSystemLogSchema>;
