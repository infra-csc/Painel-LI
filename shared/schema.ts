import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, date, unique, decimal, serial, type AnyPgColumn } from "drizzle-orm/pg-core";
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
  mustChangePassword: boolean("must_change_password").default(false), // force password change
  canApproveCenotecnica: boolean("can_approve_cenotecnica").default(false), // permissão especial: aprovar escalações de cenotécnica
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
  paymentCompanyName: text("payment_company_name"),
  paymentCompanyCnpj: text("payment_company_cnpj"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Functions table
export const functions = pgTable("functions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  functionNumber: integer("function_number").notNull().default(sql`nextval('function_sequence')`),
  name: text("name").notNull().unique(),
  description: text("description"),
  responsibleArea: text("responsible_area"),
  costCenter: text("cost_center"), // centro de custo da função
  quantity: integer("quantity").notNull().default(1),
  userId: varchar("user_id").references(() => users.id), // mantido para compatibilidade, será depreciado
  createdAt: timestamp("created_at").defaultNow(),
});

// Tabela para usuários atribuídos à função
export const functionUsers = pgTable("function_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  functionId: varchar("function_id").notNull().references(() => functions.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  // Evitar duplicatas
  unq: unique().on(table.functionId, table.userId),
}));

// Tabela para usuários responsáveis pela função (podem confirmar escalações)
/**
 * Responsáveis do MÓDULO DE ESCALA (validador da área / aprovador dos pedidos).
 *
 * Tabela PRÓPRIA, separada de `function_managers` (decisão do dono, 27/08:
 * "eu disse que era separado"). As duas listas existiam na mesma tabela e se
 * atropelavam: cadastrar um aprovador da Escala dava a ele acesso de
 * responsável na Escalação/Produção, e mexer na lista da Escala removia gente
 * da lista clássica. Agora cada cadastro cuida da sua vida.
 *
 * A unicidade é por (função, usuário, papel): a mesma pessoa pode ser
 * validadora de uma função e aprovadora de outra — e, se fizer sentido, as duas
 * coisas na mesma função.
 */
export const scalingFunctionManagers = pgTable("scaling_function_managers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  functionId: varchar("function_id").notNull().references(() => functions.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** 'validador' (área que valida a sugestão) | 'aprovador' (decide os pedidos) */
  role: text("role").notNull().default("validador"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  unq: unique().on(table.functionId, table.userId, table.role),
}));

export const functionManagers = pgTable("function_managers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  functionId: varchar("function_id").notNull().references(() => functions.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Papel na Validação de Escala: 'validador' (responsável da área — comportamento
  // histórico) | 'aprovador' (aprovador central dos pedidos de ajuste/inclusão/exclusão)
  role: text("role").notNull().default("validador"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  // Evitar duplicatas
  unq: unique().on(table.functionId, table.userId),
}));

// Collaborators table
export const collaborators = pgTable("collaborators", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  collaboratorNumber: integer("collaborator_number").notNull().default(sql`nextval('collaborator_sequence')`),
  fullName: text("full_name").notNull(),
  officialDocument: text("official_document").notNull().unique(), // CPF or RG (primary document)
  documentType: text("document_type").notNull(), // "cpf" or "rg"
  secondaryDocument: text("secondary_document"), // RG or CPF (secondary document)
  secondaryDocumentType: text("secondary_document_type"), // "cpf" or "rg"
  documentAttachmentId: text("document_attachment_id"), // ID do documento anexado (CPF/RG)
  birthDate: date("birth_date"),
  type: text("type").notNull(), // casa, freela, local
  phone: text("phone"), // Make phone optional
  city: text("city").notNull(),
  state: text("state"), // estado de origem
  gender: text("gender"), // male, female, other, unknown — usado para sugestão de quarto
  status: text("status").notNull().default("pendente"), // pendente, aprovado, rejeitado, inativo
  approvalNotes: text("approval_notes"), // observações do administrador
  approvedBy: varchar("approved_by").references(() => users.id), // quem aprovou/rejeitou
  approvedAt: timestamp("approved_at"), // quando foi aprovado/rejeitado
  isCoordinator: boolean("is_coordinator").default(false), // flag para indicar se é coordenador
  active: boolean("active").notNull().default(true), // false = inativado (mantido no histórico, oculto nas escalações)
  inactiveReason: text("inactive_reason"), // motivo obrigatório da inativação
  inactivatedAt: timestamp("inactivated_at"), // quando foi inativado
  createdBy: varchar("created_by").references(() => users.id), // quem criou o cadastro
  createdByName: text("created_by_name"), // nome de quem criou (snapshot p/ exibição sem join)
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
  emitsNf: boolean("emits_nf").notNull().default(true), // se este escalado emite nota fiscal (definido na escalação, não no cadastro)
  // Para funções de "atendimento": qual tarifa usar (Key Account x Executivo de
  // Contas), definida na escalação ao atribuir o colaborador. null nas demais funções.
  atendimentoTipo: text("atendimento_tipo"), // 'key_account' | 'executivo_contas'
  // Para funções de "percurso" (motoqueiro): pacote fechado Tipo 1 x Tipo 2,
  // definido na escalação ao atribuir o colaborador. null nas demais funções.
  percurseiroTipo: text("percurseiro_tipo"), // 'tipo_1' | 'tipo_2'
  // Para funções de "cenotécnica" (exceto "sup ceno", que é produtor): modalidade
  // de EMPREITA (valor fechado por nº de dias — tabela 19/08), definida na
  // escalação ao atribuir o colaborador. null nas demais funções.
  // Ver shared/cenotecnica-empreita.ts (CENO_FREELA_TIPOS).
  cenoFreelaTipo: text("ceno_freela_tipo"), // 'viagem' | 'sp' | 'local_a' | 'local_b'
  rowOrder: integer("row_order"), // posição da linha na planilha para templates
  scheduleStartDate: date("schedule_start_date"),
  scheduleEndDate: date("schedule_end_date"),
  actualStartDate: date("actual_start_date"), // data real de início de trabalho
  actualEndDate: date("actual_end_date"), // data real final
  flightDepartureDate: date("flight_departure_date"),
  flightDepartureSuggestedTime: text("flight_departure_suggested_time"), // horário sugerido de ida
  flightArrivalSuggestedTime: text("flight_arrival_suggested_time"), // horário sugerido de chegada
  flightReturnDate: date("flight_return_date"),
  flightReturnSuggestedTime: text("flight_return_suggested_time"), // horário sugerido de volta
  needsTicket: boolean("needs_ticket").default(false),
  needsAccommodation: boolean("needs_accommodation").default(false),
  // Validação de Escala: modal sugerido pela logística para ida/volta
  transportModeIda: text("transport_mode_ida"), // 'aereo' | 'onibus' | 'van' | 'carro' | 'transfer' | null
  transportModeVolta: text("transport_mode_volta"), // 'aereo' | 'onibus' | 'van' | 'carro' | 'transfer' | null
  suggestionSentAt: timestamp("suggestion_sent_at"), // quando a sugestão foi enviada para validação da área
  validatedAt: timestamp("validated_at"), // quando a área validou a sugestão
  validatedBy: varchar("validated_by").references(() => users.id), // quem validou (responsável da função)
  dailyRates: integer("daily_rates").notNull(), // quantidade de diárias planejadas
  workDays: date("work_days").array(), // dias específicos de trabalho (quando não consecutivos)
  dailyValue: integer("daily_value").notNull().default(0), // valor da diária em centavos
  actualDailyRates: integer("actual_daily_rates"), // quantidade real de diárias
  observations: text("observations"),
  actualObservations: text("actual_observations"), // observações do que realmente aconteceu
  emergencyRecord: boolean("emergency_record").default(false), // registro emergencial
  /**
   * Dispensado da roteirizacao de Uber (31/08). Quem vai de carro proprio, quem
   * ja esta na cidade ou quem a producao decidiu levar de outro jeito nao entra
   * em carro nenhum, nao gera custo e some das sugestoes. Antes essas pessoas
   * simplesmente apareciam num carro que ninguem ia usar.
   */
  skipUber: boolean("skip_uber").notNull().default(false),
  city: text("city"), // cidade do colaborador no contexto deste evento (pode ser editada antes da confirmação)
  // planejado, confirmado, reaberto, escalacao, passagem, passagem_comprada, hospedagem, hospedagem_comprada,
  // hospedagem_passagem_comprada, aprovado, cancelado
  // + Validação de Escala (phase 'sugestao'): sugestao_pendente, sugestao_validada, sugestao_ajuste,
  //   sugestao_aprovada, sugestao_negada  (ver shared/scaling-validation-rules.ts)
  status: text("status").notNull().default("planejado"),
  previousStatus: text("previous_status"), // armazena o status anterior quando cancelado
  // sugestao (Validação de Escala — antes da inclusão), inclusao, escalacao, passagem, hospedagem, aprovacao
  phase: text("phase").notNull().default("inclusao"),
  userId: varchar("user_id").notNull().references(() => users.id), // usuário responsável pela função
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id), // quem fez a última alteração
  deletedAt: timestamp("deleted_at"), // soft delete - quando foi excluído
  deletedBy: varchar("deleted_by").references(() => users.id), // quem excluiu
  approvedByProduction: varchar("approved_by_production").references(() => users.id), // quem aprovou a cenotécnica (produção)
  approvedByProductionAt: timestamp("approved_by_production_at"), // quando a produção aprovou
});

// Tickets table
export const tickets = pgTable("tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamInclusionId: varchar("team_inclusion_id").notNull().references(() => teamInclusions.id),
  transportType: text("transport_type"), // aereo, rodoviario
  purchaseDate: date("purchase_date"),
  actualDepartureDate: date("actual_departure_date"),
  actualDepartureTime: text("actual_departure_time"),
  // Horário de CHEGADA da ida ("HH:MM") — a regra de alimentação ("almoço se
  // chega até 11h, jantar até 19h") depende dele; só existiam horários de partida
  actualArrivalTime: text("actual_arrival_time"),
  actualReturnDate: date("actual_return_date"), // agora opcional
  actualReturnTime: text("actual_return_time"),
  // Horário de CHEGADA da volta ("HH:MM") — faltava (dono, 27/08): a regra de
  // mobilidade "voo chegando das 20h às 5h → R$58" nunca pegava na volta.
  returnArrivalTime: text("return_arrival_time"),
  departureCityOrigin: text("departure_city_origin"), // cidade de origem da ida
  departureCityDestination: text("departure_city_destination"), // cidade de destino da ida
  returnCityOrigin: text("return_city_origin"), // cidade de origem da volta
  returnCityDestination: text("return_city_destination"), // cidade de destino da volta
  departureAirport: text("departure_airport"), // aeroporto origem da ida 
  destinationAirport: text("destination_airport"), // aeroporto destino da ida
  returnOriginAirport: text("return_origin_airport"), // aeroporto origem da volta
  returnDestinationAirport: text("return_destination_airport"), // aeroporto destino da volta
  value: integer("value"), // valor em centavos
  purchaseOrderNumber: text("purchase_order_number"),
  fileUrl: text("file_url"),
  attachmentIds: text("attachment_ids").array(), // IDs de referência dos anexos da passagem
  cardLastFourDigits: text("card_last_four_digits"), // últimos 4 dígitos do cartão
  ticketObservations: text("ticket_observations"), // observações sobre a passagem
  ticketCompany: text("ticket_company"), // companhia aérea/empresa da passagem
  ticketStatus: text("ticket_status"), // pendente, comprada, confirmada, cancelada
  // EMITIDA — ato explícito de quem compra (regra do dono, 26/08). Marcar não
  // exige ter preenchido a passagem: serve de aviso de que o bilhete saiu e,
  // a partir daí, a área não pede mais ajuste. O preenchimento continua livre.
  emittedAt: timestamp("emitted_at"),
  emittedBy: varchar("emitted_by").references(() => users.id),
  locator: text("locator"), // localizador (LOC) — separado do reservationNumber
  checkIn3: text("check_in_3"), // conferência da passagem (espelho operacional)
  baggageTotalCents: integer("baggage_total_cents"), // valor total bagagem em centavos
  baggageOc: text("baggage_oc"), // OC da bagagem
  baggageNotes: text("baggage_notes"), // observações da bagagem
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id), // quem fez a última alteração
});

// Accommodations table
export const accommodations = pgTable("accommodations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamInclusionId: varchar("team_inclusion_id").notNull().references(() => teamInclusions.id),
  checkInDate: date("check_in_date"),
  checkInTime: text("check_in_time"),
  checkOutDate: date("check_out_date"),
  checkOutTime: text("check_out_time"),
  hotelLocation: text("hotel_location"), // local do hotel
  hotelName: text("hotel_name"), // nome do hotel
  dailyRate: integer("daily_rate"), // valor da diária em centavos
  reservationNumber: text("reservation_number"), // número da reserva/LOC
  accommodationObservations: text("accommodation_observations"), // observações
  attachmentIds: text("attachment_ids").array(), // IDs de referência dos anexos da hospedagem
  roomType: text("room_type"), // single, duplo, triplo
  nightsCount: integer("nights_count"), // quantidade de diárias (espelho operacional)
  lateCheckout: boolean("late_checkout").default(false), // late check-out
  totalCents: integer("total_cents"), // valor total da hospedagem em centavos
  paymentCompany: text("payment_company"), // empresa de pagamento do hotel
  hotelOc: text("hotel_oc"), // OC do hotel
  checkIn4: text("check_in_4"), // conferência da hospedagem (espelho operacional)
  hotelStatus: text("hotel_status"), // pendente, reservada, confirmada, cancelada
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
/**
 * Comentários GERAIS do evento (28/08) — mural aberto: qualquer usuário
 * autenticado escreve, todas as telas da Escala leem. Diferente de
 * `events.observations` (campo único da logística) e de `comments` (por vaga).
 */
export const eventComments = pgTable("event_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const comments = pgTable("comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamInclusionId: varchar("team_inclusion_id").notNull().references(() => teamInclusions.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  phase: text("phase").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Team Inclusion Logs table - audit trail for escalation changes
export const teamInclusionLogs = pgTable("team_inclusion_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamInclusionId: varchar("team_inclusion_id").notNull(), // Sem cascade para manter histórico de exclusões
  action: text("action").notNull(), // created, collaborator_changed, status_changed, dates_changed, confirmed, reopened, deleted, etc
  details: text("details").notNull(), // human-readable description of what changed
  previousValue: text("previous_value"), // previous value for the field that changed
  newValue: text("new_value"), // new value for the field that changed
  userId: varchar("user_id").notNull().references(() => users.id),
  userName: text("user_name").notNull(), // cached for performance
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

// Valores por função (valores automáticos para cálculo)
export const functionValues = pgTable("function_values", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  functionId: varchar("function_id").notNull().references(() => functions.id, { onDelete: 'cascade' }),
  dailyValue: integer("daily_value").notNull().default(0), // diária casa - dia útil (centavos)
  dailyValueWeekend: integer("daily_value_weekend").notNull().default(0), // diária casa - fim de semana (centavos)
  dailyValueFreela: integer("daily_value_freela").notNull().default(0), // diária freela - dia útil (centavos)
  dailyValueFreelaWeekend: integer("daily_value_freela_weekend").notNull().default(0), // diária freela - fim de semana (centavos)
  costAssistance: integer("cost_assistance").notNull().default(0), // ajuda de custo em centavos
  weekdayLunch: integer("weekday_lunch").notNull().default(0), // almoço semana em centavos
  weekdayDinner: integer("weekday_dinner").notNull().default(0), // jantar semana em centavos
  weekendLunch: integer("weekend_lunch").notNull().default(0), // almoço fds em centavos
  weekendDinner: integer("weekend_dinner").notNull().default(0), // jantar fds em centavos
  mobility: integer("mobility").notNull().default(0), // mobilidade em centavos
  transport: integer("transport").notNull().default(0), // translado em centavos
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Planejado - orçamento previsto do evento
export const budgetPlanned = pgTable("budget_planned", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: 'cascade' }),
  collaboratorId: varchar("collaborator_id").references(() => collaborators.id),
  functionId: varchar("function_id").references(() => functions.id),
  collaboratorType: text("collaborator_type"), // casa, freela - para cálculo de dias
  dailyQuantity: integer("daily_quantity").notNull().default(0), // quantidade de diárias
  dailyValue: integer("daily_value").notNull().default(0), // valor da diária em centavos
  costAssistance: integer("cost_assistance").notNull().default(0), // ajuda de custo em centavos
  weekdayLunch: integer("weekday_lunch").notNull().default(0), // almoço semana em centavos
  weekdayDinner: integer("weekday_dinner").notNull().default(0), // jantar semana em centavos
  weekendLunch: integer("weekend_lunch").notNull().default(0), // almoço fds em centavos
  weekendDinner: integer("weekend_dinner").notNull().default(0), // jantar fds em centavos
  mobility: integer("mobility").notNull().default(0), // mobilidade total em centavos (ida + volta)
  mobilityIda: integer("mobility_ida").default(0), // mobilidade ida em centavos
  mobilityVolta: integer("mobility_volta").default(0), // mobilidade volta em centavos
  transport: integer("transport").notNull().default(0), // translado em centavos
  totalValue: integer("total_value").notNull().default(0), // total em centavos (calculado)
  observations: text("observations"), // observações
  status: text("status").notNull().default("pendente"), // pendente, aprovado_rh, rejeitado_rh
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id),
  didNotAttend: boolean("did_not_attend").notNull().default(false),
  didNotAttendReason: text("did_not_attend_reason"),
});

// Realizado - o que realmente aconteceu
export const budgetActual = pgTable("budget_actual", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  plannedId: varchar("planned_id").references(() => budgetPlanned.id), // referência ao planejado original (pode ser null se adicionado direto)
  eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: 'cascade' }),
  collaboratorId: varchar("collaborator_id").references(() => collaborators.id),
  functionId: varchar("function_id").references(() => functions.id),
  collaboratorType: text("collaborator_type"), // casa, freela
  dailyQuantity: integer("daily_quantity").notNull().default(0), // quantidade de diárias
  dailyValue: integer("daily_value").notNull().default(0), // valor da diária em centavos
  costAssistance: integer("cost_assistance").notNull().default(0), // ajuda de custo em centavos
  weekdayLunch: integer("weekday_lunch").notNull().default(0), // almoço semana em centavos
  weekdayDinner: integer("weekday_dinner").notNull().default(0), // jantar semana em centavos
  weekendLunch: integer("weekend_lunch").notNull().default(0), // almoço fds em centavos
  weekendDinner: integer("weekend_dinner").notNull().default(0), // jantar fds em centavos
  mobility: integer("mobility").notNull().default(0), // mobilidade total em centavos (ida + volta)
  mobilityIda: integer("mobility_ida").default(0), // mobilidade ida em centavos
  mobilityVolta: integer("mobility_volta").default(0), // mobilidade volta em centavos
  transport: integer("transport").notNull().default(0), // translado em centavos
  totalValue: integer("total_value").notNull().default(0), // total em centavos (calculado)
  changeReason: text("change_reason"), // motivo da alteração (obrigatório se diferente do planejado)
  paymentStatus: text("payment_status").notNull().default("pendente"), // pendente, confirmado, pago
  observations: text("observations"), // observações
  attachmentIds: text("attachment_ids").array(), // comprovantes/anexos
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id),
  sentForReview: boolean("sent_for_review").notNull().default(false),
  rhStatus: text("rh_status").notNull().default("pendente"), // pendente, aprovado, rejeitado, devolvido
  rhComment: text("rh_comment"),
  rhActionBy: varchar("rh_action_by").references(() => users.id),
  rhActionAt: timestamp("rh_action_at"),
  resubmitted: boolean("resubmitted").notNull().default(false), // true quando reenviado após devolução/recusa
  // se preenchido, este é um registro de divisão de vaga
  // FK real criada no banco em 13/08 (budget_actual_split_parent_fk, ON DELETE CASCADE)
  splitParentId: varchar("split_parent_id").references((): AnyPgColumn => budgetActual.id),
  workedDays: text("worked_days").array(), // dias específicos trabalhados [YYYY-MM-DD]
  didNotAttend: boolean("did_not_attend").notNull().default(false), // marcado como não participou
  didNotAttendReason: text("did_not_attend_reason"), // motivo de não participação
  rhAdjusted: boolean("rh_adjusted").notNull().default(false), // RH editou valores do realizado
  rhAdjustedFields: text("rh_adjusted_fields"), // JSON: {field: {from, to, label}} dos campos alterados pelo RH
  rhAdjustNote: text("rh_adjust_note"), // observação do RH ao fazer ajuste nos valores
});

// Comparativo e aprovação do RH
export const budgetComparison = pgTable("budget_comparison", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: 'cascade' }),
  totalPlanned: integer("total_planned").notNull().default(0), // total planejado em centavos
  totalActual: integer("total_actual").notNull().default(0), // total realizado em centavos
  variance: integer("variance").notNull().default(0), // diferença (positivo = economia, negativo = acima)
  variancePercent: text("variance_percent"), // percentual de variação
  status: text("status").notNull().default("pendente"), // pendente, aprovado, rejeitado, devolvido
  approvalObservation: text("approval_observation"), // observação do RH ao aprovar/rejeitar
  rejectionReason: text("rejection_reason"), // motivo da recusa
  returnReason: text("return_reason"), // motivo da devolução (dados incorretos)
  changesLog: text("changes_log"), // JSON com histórico de mudanças do planejado para realizado
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

// Cadastro público: só os campos que um solicitante pode informar. Papéis
// privilegiados (admin/financial/purchasing) NUNCA vêm do corpo — são
// atribuídos por um admin na aprovação (userApprovalSchema). Antes o schema
// estendia insertUserSchema inteiro, aceitando role "admin", isActive,
// canApproveCenotecnica e mustChangePassword do corpo (mass assignment).
export const publicUserRegistrationSchema = insertUserSchema
  .pick({ email: true, name: true, area: true })
  .extend({
    password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
    role: z.enum(["production", "function_area"]).default("production"),
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

// Schema for updating events (allows status field)
export const updateEventSchema = createInsertSchema(events).omit({
  id: true,
  eventNumber: true,
  createdAt: true,
}).partial();

export const insertFunctionSchema = createInsertSchema(functions).omit({
  id: true,
  createdAt: true,
});

export const insertCollaboratorSchema = createInsertSchema(collaborators).omit({
  id: true,
  createdAt: true,
  inactivatedAt: true,
}).extend({
  birthDate: z.string().optional(), // Força string para birthDate
});

export const insertTeamInclusionSchema = createInsertSchema(teamInclusions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTicketSchema = createInsertSchema(tickets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  transportType: z.enum(["aereo", "rodoviario", "van"]).optional()
});

export const insertAccommodationSchema = createInsertSchema(accommodations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFinancialSchema = createInsertSchema(financial).omit({
  id: true,
  createdAt: true,
});

export const insertCommentSchema = createInsertSchema(comments).omit({
  id: true,
  createdAt: true,
});

export const insertTeamInclusionLogSchema = createInsertSchema(teamInclusionLogs).omit({
  id: true,
  createdAt: true,
});

export const insertSystemLogSchema = createInsertSchema(systemLogs).omit({
  id: true,
  logNumber: true,
  createdAt: true,
});

export const insertFunctionUserSchema = createInsertSchema(functionUsers).omit({
  id: true,
  createdAt: true,
});

export const insertScalingFunctionManagerSchema = createInsertSchema(scalingFunctionManagers).omit({
  id: true,
  createdAt: true,
});

export const insertFunctionManagerSchema = createInsertSchema(functionManagers).omit({
  id: true,
  createdAt: true,
});

export const insertFunctionValuesSchema = createInsertSchema(functionValues).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBudgetPlannedSchema = createInsertSchema(budgetPlanned).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBudgetActualSchema = createInsertSchema(budgetActual).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// System Settings - global default values for budget calculations
export const systemSettings = pgTable("system_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: varchar("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id),
});

export const insertSystemSettingsSchema = createInsertSchema(systemSettings).omit({
  id: true,
  updatedAt: true,
});

export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = z.infer<typeof insertSystemSettingsSchema>;

export const insertBudgetComparisonSchema = createInsertSchema(budgetComparison).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Invoices table (Notas Fiscais)
export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: 'cascade' }),
  collaboratorId: varchar("collaborator_id").notNull().references(() => collaborators.id),
  functionId: varchar("function_id").notNull().references(() => functions.id),
  // FK real criada no banco em 13/08 (invoices_budget_actual_fk, ON DELETE SET NULL)
  // + índice único parcial invoices_budget_actual_uq: uma NF por prestação
  budgetActualId: varchar("budget_actual_id").references(() => budgetActual.id),
  oc: text("oc"),
  attachmentUrl: text("attachment_url"),
  attachmentName: text("attachment_name"),
  paymentText: text("payment_text"),
  status: text("status").notNull().default("pendente"), // pendente, enviada, aprovada, devolvida, recusada
  returnComment: text("return_comment"),
  paymentDate: date("payment_date"),
  approvedAt: timestamp("approved_at"),
  history: text("history").default("[]"),
  checkinAt: timestamp("checkin_at"),
  checkinBy: varchar("checkin_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;

// Conta Corrente Flash (slide 6 do deck de melhorias) — controle do saldo de
// Flash Benefícios por colaborador. Crédito inicial na admissão (R$ 350
// alimentação + R$ 150 mobilidade) e reembolsos por evento para manter o
// colaborador sempre com esses valores disponíveis.
export const flashMovements = pgTable("flash_movements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  collaboratorId: varchar("collaborator_id").notNull().references(() => collaborators.id),
  eventId: varchar("event_id").references(() => events.id), // reembolso ligado a um evento (opcional)
  category: text("category").notNull(), // alimentacao, mobilidade
  type: text("type").notNull(), // credito, debito
  amountCents: integer("amount_cents").notNull(), // sempre positivo; o sinal vem do type
  movementDate: date("movement_date").notNull(),
  description: text("description"),
  createdBy: varchar("created_by").references(() => users.id),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
  // Origem do lançamento (17/08): 'manual' (tela Conta Corrente Flash) ou
  // 'oc' (crédito automático gerado pelo lançamento da NF com OC — ver
  // server/flash-oc.ts). sourceRef guarda o id da invoice quando 'oc';
  // (source_type, source_ref, category) identifica o lançamento automático
  // e torna a sincronização idempotente. Migração: 2026-08-17-flash-oc.ts.
  sourceType: text("source_type").notNull().default("manual"),
  sourceRef: text("source_ref"),
});

export const insertFlashMovementSchema = createInsertSchema(flashMovements).omit({
  id: true,
  createdAt: true,
  // Origem nunca vem do body: a API manual sempre grava 'manual'; 'oc' só
  // nasce no servidor via syncFlashFromInvoice.
  sourceType: true,
  sourceRef: true,
}).extend({
  category: z.enum(["alimentacao", "mobilidade"]),
  type: z.enum(["credito", "debito"]),
  amountCents: z.number().int().positive(),
});

export type FlashMovement = typeof flashMovements.$inferSelect;
export type InsertFlashMovement = z.infer<typeof insertFlashMovementSchema>;

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

export type Accommodation = typeof accommodations.$inferSelect;
export type InsertAccommodation = z.infer<typeof insertAccommodationSchema>;

export type Financial = typeof financial.$inferSelect;
export type InsertFinancial = z.infer<typeof insertFinancialSchema>;

export type Comment = typeof comments.$inferSelect;
export type InsertComment = z.infer<typeof insertCommentSchema>;

export type TeamInclusionLog = typeof teamInclusionLogs.$inferSelect;
export type InsertTeamInclusionLog = z.infer<typeof insertTeamInclusionLogSchema>;

export type SystemLog = typeof systemLogs.$inferSelect;
export type InsertSystemLog = z.infer<typeof insertSystemLogSchema>;

export type FunctionUser = typeof functionUsers.$inferSelect;
export type InsertFunctionUser = z.infer<typeof insertFunctionUserSchema>;

export type EventComment = typeof eventComments.$inferSelect;
export type FunctionManager = typeof functionManagers.$inferSelect;
/** Responsável do módulo de Escala (tabela própria — ver scalingFunctionManagers). */
export type ScalingFunctionManager = typeof scalingFunctionManagers.$inferSelect;
export type InsertScalingFunctionManager = z.infer<typeof insertScalingFunctionManagerSchema>;
export type InsertFunctionManager = z.infer<typeof insertFunctionManagerSchema>;

export type FunctionValue = typeof functionValues.$inferSelect;
export type InsertFunctionValue = z.infer<typeof insertFunctionValuesSchema>;

export type BudgetPlanned = typeof budgetPlanned.$inferSelect;
export type InsertBudgetPlanned = z.infer<typeof insertBudgetPlannedSchema>;

export type BudgetActual = typeof budgetActual.$inferSelect;
export type InsertBudgetActual = z.infer<typeof insertBudgetActualSchema>;

export type BudgetComparison = typeof budgetComparison.$inferSelect;
export type InsertBudgetComparison = z.infer<typeof insertBudgetComparisonSchema>;

export const paymentCompanies = pgTable("payment_companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  cnpj: text("cnpj").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPaymentCompanySchema = createInsertSchema(paymentCompanies).omit({ id: true, createdAt: true });

export type PaymentCompany = typeof paymentCompanies.$inferSelect;
export type InsertPaymentCompany = z.infer<typeof insertPaymentCompanySchema>;

// Budget Notes (chat de auditoria para Planejado e Realizado)
export const budgetNotes = pgTable("budget_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: text("entity_type").notNull(), // 'planned' | 'actual'
  entityId: varchar("entity_id").notNull(),
  authorId: varchar("author_id").notNull(),
  authorName: text("author_name").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBudgetNoteSchema = createInsertSchema(budgetNotes).omit({ id: true, createdAt: true });
export type BudgetNote = typeof budgetNotes.$inferSelect;
export type InsertBudgetNote = z.infer<typeof insertBudgetNoteSchema>;

// Swap Requests — solicitações de troca de colaborador na escalação
export const swapRequests = pgTable("swap_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamInclusionId: varchar("team_inclusion_id").notNull().references(() => teamInclusions.id, { onDelete: 'cascade' }),
  requestedBy: varchar("requested_by").notNull().references(() => users.id),
  requestedByName: text("requested_by_name").notNull(),
  currentCollaboratorId: varchar("current_collaborator_id").references(() => collaborators.id),
  newCollaboratorId: varchar("new_collaborator_id").references(() => collaborators.id),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pendente"), // pendente, aprovado, rejeitado
  reviewComment: text("review_comment"),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedByName: text("reviewed_by_name"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSwapRequestSchema = createInsertSchema(swapRequests).omit({
  id: true,
  createdAt: true,
  reviewedAt: true,
});

export type SwapRequest = typeof swapRequests.$inferSelect;
export type InsertSwapRequest = z.infer<typeof insertSwapRequestSchema>;

// ===== VALIDAÇÃO DE ESCALA =====
// Pedidos de ajuste / inclusão / exclusão feitos pela área sobre a escala
// sugerida (team_inclusions com phase 'sugestao'). Modelado sobre swap_requests.
// Pedido negado FICA registrado (nunca é apagado). proposed_changes é JSON
// (string) validado por zod versionado — ver proposedChangesSchema em
// shared/scaling-validation-rules.ts. Chat/comentários usam budget_notes.
export const scalingChangeRequests = pgTable("scaling_change_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // null quando request_type = 'inclusao' (a vaga ainda não existe)
  teamInclusionId: varchar("team_inclusion_id").references(() => teamInclusions.id, { onDelete: 'cascade' }),
  eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: 'cascade' }),
  functionId: varchar("function_id").notNull().references(() => functions.id), // sempre do catálogo
  area: text("area"),
  requestType: text("request_type").notNull(), // 'ajuste' | 'inclusao' | 'exclusao'
  requestedBy: varchar("requested_by").notNull().references(() => users.id),
  requestedByName: text("requested_by_name").notNull(),
  proposedChanges: text("proposed_changes"), // JSON string { v: 1, ... } (proposedChangesSchema)
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pendente"), // 'pendente' | 'aprovado' | 'reajustado' | 'negado' | 'reenviado_validacao'
  reviewComment: text("review_comment"),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedByName: text("reviewed_by_name"),
  reviewedAt: timestamp("reviewed_at"),
  resolvedInclusionId: varchar("resolved_inclusion_id").references(() => teamInclusions.id), // inclusão criada quando 'inclusao' é aprovada
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertScalingChangeRequestSchema = createInsertSchema(scalingChangeRequests)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    requestedBy: true,     // identidade vem SEMPRE da sessão
    requestedByName: true,
    status: true,
    reviewComment: true,
    reviewedBy: true,
    reviewedByName: true,
    reviewedAt: true,
    resolvedInclusionId: true,
  })
  .extend({
    requestType: z.enum(["ajuste", "inclusao", "exclusao"]),
    reason: z.string().trim().min(1, "Informe o motivo do pedido"),
    proposedChanges: z.string().nullish(),
  })
  .superRefine((data, ctx) => {
    if (data.requestType === "inclusao" && data.teamInclusionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["teamInclusionId"],
        message: "Pedido de inclusão não referencia uma vaga existente",
      });
    }
    if (data.requestType !== "inclusao" && !data.teamInclusionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["teamInclusionId"],
        message: "Pedido de ajuste/exclusão precisa referenciar a vaga sugerida",
      });
    }
  });

export type ScalingChangeRequest = typeof scalingChangeRequests.$inferSelect;
export type InsertScalingChangeRequest = z.infer<typeof insertScalingChangeRequestSchema>;

// ===== CONTROLE DE BAGAGEM =====
// Solicitações de bagagem por colaborador/evento (porte do app standalone).
// Dinheiro em centavos; contagens por CIA são SEMPRE derivadas dos registros
// (nada de contadores manuais). Exclusão é soft delete.
export const baggageRequests = pgTable("baggage_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id),
  collaboratorId: varchar("collaborator_id").notNull().references(() => collaborators.id),
  loc: text("loc").notNull(), // localizador (uppercase no client)
  cia: text("cia").notNull(), // Azul, Gol, TAM ou texto livre ("Outros")
  valueCents: integer("value_cents").notNull(), // valor da solicitação em centavos (>= 0)
  os: text("os").notNull(),
  quantity: integer("quantity").notNull().default(1), // nº de bagagens (>= 1)
  agency: text("agency").notNull(), // LCA, Flytour, Onfly, Direto no site ou livre
  requestDate: date("request_date").notNull(), // data da solicitação
  boardingDate: date("boarding_date").notNull(), // data do embarque (>= solicitação)
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id),
  createdByName: text("created_by_name"), // snapshot p/ exibição sem join
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // soft delete
  deletedBy: varchar("deleted_by"),
});

const DATE_YMD = /^\d{4}-\d{2}-\d{2}$/;

export const insertBaggageRequestSchema = createInsertSchema(baggageRequests)
  .omit({
    id: true,
    createdAt: true,
    createdBy: true,     // identidade vem SEMPRE da sessão, nunca do corpo
    createdByName: true,
    deletedAt: true,
    deletedBy: true,
  })
  .extend({
    loc: z.string().trim().min(1, "Informe o localizador (LOC)"),
    cia: z.string().trim().min(1, "Informe a companhia aérea"),
    os: z.string().trim().min(1, "Informe a OS"),
    agency: z.string().trim().min(1, "Informe a agência"),
    valueCents: z.number().int("Valor deve ser em centavos inteiros").min(0, "Valor não pode ser negativo"),
    quantity: z.number().int("Quantidade deve ser um número inteiro").min(1, "Quantidade mínima é 1"),
    requestDate: z.string().regex(DATE_YMD, "Data da solicitação inválida"),
    boardingDate: z.string().regex(DATE_YMD, "Data do embarque inválida"),
    notes: z.string().nullish(),
  })
  .superRefine((data, ctx) => {
    if (data.requestDate && data.boardingDate && data.boardingDate < data.requestDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["boardingDate"],
        message: "A data do embarque não pode ser anterior à data da solicitação",
      });
    }
  });

export type BaggageRequest = typeof baggageRequests.$inferSelect;
export type InsertBaggageRequest = z.infer<typeof insertBaggageRequestSchema>;

// Histórico pré-sistema: contagens de bagagem por colaborador × CIA importadas
// da planilha/HTML antigo (sem evento/valor/data — só a contagem consolidada).
// Somadas na visão "Por colaborador" com selo de histórico; registros novos
// nascem completos em baggage_requests.
export const baggageHistory = pgTable("baggage_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  collaboratorId: varchar("collaborator_id").notNull().references(() => collaborators.id),
  cia: text("cia").notNull(), // Azul, Gol, TAM ou Outros
  quantity: integer("quantity").notNull(), // >= 1
  sourceName: text("source_name"), // nome como constava na origem (auditoria)
  importedAt: timestamp("imported_at").defaultNow(),
});

export type BaggageHistoryEntry = typeof baggageHistory.$inferSelect;

// ===== ESPELHO OPERACIONAL — Logística do Evento =====

// Custos extras de logística (bagagem, uber, locação de carro, outros)
export const logisticsExtraCosts = pgTable("logistics_extra_costs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: 'cascade' }),
  collaboratorId: varchar("collaborator_id").references(() => collaborators.id),
  teamInclusionId: varchar("team_inclusion_id").references(() => teamInclusions.id),
  type: text("type").notNull(), // baggage, uber, car_rental, other
  description: text("description"),
  amountCents: integer("amount_cents").notNull().default(0),
  oc: text("oc"),
  checkInReference: text("check_in_reference"),
  company: text("company"),
  notes: text("notes"),
  attachmentUrl: text("attachment_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Grupos de Uber (sugeridos ou confirmados)
export const uberGroups = pgTable("uber_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: 'cascade' }),
  groupName: text("group_name"),
  direction: text("direction"), // ida, volta, interno, aeroporto_hotel, hotel_evento
  origin: text("origin"),
  destination: text("destination"),
  date: date("date"),
  /**
   * Horário que vale para o carro. Continua sendo o campo que a tela lê.
   */
  time: text("time"),
  /**
   * Separados de propósito (31/08): sem saber o que foi CALCULADO e o que foi
   * ajustado À MÃO, "Refazer sugestões" não tinha como preservar o ajuste —
   * recalculava tudo e o trabalho de quem corrigiu o horário se perdia.
   * suggestedTime é o que o cálculo diz; manualTime, o que alguém decidiu.
   */
  suggestedTime: text("suggested_time"),
  manualTime: text("manual_time"),
  estimatedTotalCents: integer("estimated_total_cents").default(0),
  notes: text("notes"),
  // TITULAR do carro (28/08): quem chama e responde pela corrida. Existe nas
  // planilhas da equipe e é escolhido À MÃO entre os passageiros do grupo —
  // decisão do dono; o sistema não adivinha.
  titularCollaboratorId: varchar("titular_collaborator_id").references(() => collaborators.id),
  status: text("status").notNull().default("sugerido"), // sugerido, confirmado
  suggested: boolean("suggested").notNull().default(true),
  confirmed: boolean("confirmed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const uberGroupMembers = pgTable("uber_group_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  uberGroupId: varchar("uber_group_id").notNull().references(() => uberGroups.id, { onDelete: 'cascade' }),
  collaboratorId: varchar("collaborator_id").notNull().references(() => collaborators.id),
  estimatedShareCents: integer("estimated_share_cents").default(0),
  confirmed: boolean("confirmed").notNull().default(false),
  notes: text("notes"),
});

// Grupos de quarto de hotel (sugeridos ou confirmados)
export const hotelRoomGroups = pgTable("hotel_room_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: 'cascade' }),
  hotelName: text("hotel_name"),
  roomType: text("room_type"), // single, double, triple
  genderRule: text("gender_rule"), // male, female, mixed, none
  checkInDate: date("check_in_date"),
  checkOutDate: date("check_out_date"),
  notes: text("notes"),
  suggested: boolean("suggested").notNull().default(true),
  confirmed: boolean("confirmed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const hotelRoomGroupMembers = pgTable("hotel_room_group_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hotelRoomGroupId: varchar("hotel_room_group_id").notNull().references(() => hotelRoomGroups.id, { onDelete: 'cascade' }),
  collaboratorId: varchar("collaborator_id").notNull().references(() => collaborators.id),
  /**
   * Estadia DESTA pessoa no quarto (31/08). O período era do grupo inteiro, e
   * quem chega um dia antes ou sai um dia depois — montagem, desmontagem —
   * ficava com a data errada ou fora do quarto. Vazio = segue o grupo.
   */
  checkInDate: date("check_in_date"),
  checkOutDate: date("check_out_date"),
  confirmed: boolean("confirmed").notNull().default(false),
  notes: text("notes"),
});

export const insertLogisticsExtraCostSchema = createInsertSchema(logisticsExtraCosts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUberGroupSchema = createInsertSchema(uberGroups).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUberGroupMemberSchema = createInsertSchema(uberGroupMembers).omit({ id: true });
export const insertHotelRoomGroupSchema = createInsertSchema(hotelRoomGroups).omit({ id: true, createdAt: true, updatedAt: true });
export const insertHotelRoomGroupMemberSchema = createInsertSchema(hotelRoomGroupMembers).omit({ id: true });

export type LogisticsExtraCost = typeof logisticsExtraCosts.$inferSelect;
export type InsertLogisticsExtraCost = z.infer<typeof insertLogisticsExtraCostSchema>;
export type UberGroup = typeof uberGroups.$inferSelect;
export type InsertUberGroup = z.infer<typeof insertUberGroupSchema>;
export type UberGroupMember = typeof uberGroupMembers.$inferSelect;
export type InsertUberGroupMember = z.infer<typeof insertUberGroupMemberSchema>;
export type HotelRoomGroup = typeof hotelRoomGroups.$inferSelect;
export type InsertHotelRoomGroup = z.infer<typeof insertHotelRoomGroupSchema>;
export type HotelRoomGroupMember = typeof hotelRoomGroupMembers.$inferSelect;
export type InsertHotelRoomGroupMember = z.infer<typeof insertHotelRoomGroupMemberSchema>;
