import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table for authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(), // admin, production, function_area, purchasing, financial
  area: text("area"), // area responsável
  resetToken: text("reset_token"), // token for password reset
  resetTokenExpiry: timestamp("reset_token_expiry"), // expiry for reset token
  isActive: boolean("is_active").default(true), // account status
  createdAt: timestamp("created_at").defaultNow(),
});

// Events table
export const events = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
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
  name: text("name").notNull().unique(),
  description: text("description"),
  quantity: integer("quantity").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
});

// Collaborators table
export const collaborators = pgTable("collaborators", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fullName: text("full_name").notNull(),
  officialDocument: text("official_document").notNull().unique(), // CPF or RG
  documentType: text("document_type").notNull(), // "cpf" or "rg"
  birthDate: date("birth_date").notNull(),
  area: text("area").notNull(),
  type: text("type").notNull(), // casa, freela, local
  phone: text("phone"), // Make phone optional
  city: text("city").notNull(),
  status: text("status").notNull().default("ativo"), // ativo, inativo
  createdAt: timestamp("created_at").defaultNow(),
});

// Team inclusions table
export const teamInclusions = pgTable("team_inclusions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id),
  functionId: varchar("function_id").notNull().references(() => functions.id),
  collaboratorId: varchar("collaborator_id").references(() => collaborators.id),
  area: text("area").notNull(), // área selecionada - now required
  scheduleStartDate: date("schedule_start_date").notNull(),
  scheduleEndDate: date("schedule_end_date").notNull(),
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
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Tickets table
export const tickets = pgTable("tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamInclusionId: varchar("team_inclusion_id").notNull().references(() => teamInclusions.id),
  purchaseDate: date("purchase_date"),
  actualDepartureDate: date("actual_departure_date"),
  actualDepartureTime: text("actual_departure_time"),
  actualReturnDate: date("actual_return_date"),
  actualReturnTime: text("actual_return_time"),
  departureAirport: text("departure_airport"),
  destinationAirport: text("destination_airport"),
  value: integer("value"), // valor em centavos
  purchaseOrderNumber: text("purchase_order_number"),
  fileUrl: text("file_url"),
  createdAt: timestamp("created_at").defaultNow(),
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

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertEventSchema = createInsertSchema(events).omit({
  id: true,
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
});

export const insertFinancialSchema = createInsertSchema(financial).omit({
  id: true,
  createdAt: true,
});

export const insertCommentSchema = createInsertSchema(comments).omit({
  id: true,
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
