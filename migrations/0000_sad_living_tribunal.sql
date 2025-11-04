CREATE TABLE "accommodations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_inclusion_id" varchar NOT NULL,
	"check_in_date" date,
	"check_in_time" text,
	"check_out_date" date,
	"check_out_time" text,
	"hotel_location" text,
	"hotel_name" text,
	"daily_rate" integer,
	"reservation_number" text,
	"accommodation_observations" text,
	"attachment_ids" text[],
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"updated_by" varchar
);
--> statement-breakpoint
CREATE TABLE "collaborators" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collaborator_number" integer DEFAULT nextval('collaborator_sequence') NOT NULL,
	"full_name" text NOT NULL,
	"official_document" text NOT NULL,
	"document_type" text NOT NULL,
	"secondary_document" text,
	"secondary_document_type" text,
	"document_attachment_id" text,
	"birth_date" date,
	"type" text NOT NULL,
	"phone" text,
	"city" text NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"approval_notes" text,
	"approved_by" varchar,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "collaborators_official_document_unique" UNIQUE("official_document")
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_inclusion_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"content" text NOT NULL,
	"phase" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_number" integer DEFAULT nextval('event_sequence') NOT NULL,
	"name" text NOT NULL,
	"location" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"observations" text,
	"status" text DEFAULT 'planejado' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "financial" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_inclusion_id" varchar NOT NULL,
	"planned_daily_rates" integer,
	"actual_daily_rates" integer,
	"planned_value" integer,
	"actual_value" integer,
	"actual_fee" integer,
	"observations" text,
	"approved" boolean DEFAULT false,
	"approved_at" timestamp,
	"approved_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"updated_by" varchar
);
--> statement-breakpoint
CREATE TABLE "function_managers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"function_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "function_managers_function_id_user_id_unique" UNIQUE("function_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "function_users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"function_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "function_users_function_id_user_id_unique" UNIQUE("function_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "functions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"function_number" integer DEFAULT nextval('function_sequence') NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"responsible_area" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"user_id" varchar,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "functions_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "system_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"log_number" integer DEFAULT nextval('log_sequence') NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar NOT NULL,
	"entity_name" text,
	"details" text NOT NULL,
	"previous_data" text,
	"new_data" text,
	"user_id" varchar,
	"user_name" text,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "team_inclusion_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_inclusion_id" varchar NOT NULL,
	"action" text NOT NULL,
	"details" text NOT NULL,
	"previous_value" text,
	"new_value" text,
	"user_id" varchar NOT NULL,
	"user_name" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "team_inclusions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inclusion_number" integer DEFAULT nextval('inclusion_sequence') NOT NULL,
	"event_id" varchar NOT NULL,
	"function_id" varchar NOT NULL,
	"collaborator_id" varchar,
	"area" text,
	"row_order" integer,
	"schedule_start_date" date,
	"schedule_end_date" date,
	"actual_start_date" date,
	"actual_end_date" date,
	"flight_departure_date" date,
	"flight_departure_suggested_time" text,
	"flight_arrival_suggested_time" text,
	"flight_return_date" date,
	"flight_return_suggested_time" text,
	"needs_ticket" boolean DEFAULT false,
	"needs_accommodation" boolean DEFAULT false,
	"daily_rates" integer NOT NULL,
	"work_days" date[],
	"daily_value" integer DEFAULT 0 NOT NULL,
	"actual_daily_rates" integer,
	"observations" text,
	"actual_observations" text,
	"emergency_record" boolean DEFAULT false,
	"status" text DEFAULT 'planejado' NOT NULL,
	"previous_status" text,
	"phase" text DEFAULT 'inclusao' NOT NULL,
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"updated_by" varchar
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_inclusion_id" varchar NOT NULL,
	"transport_type" text,
	"purchase_date" date,
	"actual_departure_date" date,
	"actual_departure_time" text,
	"actual_return_date" date,
	"actual_return_time" text,
	"departure_city_origin" text,
	"departure_city_destination" text,
	"return_city_origin" text,
	"return_city_destination" text,
	"departure_airport" text,
	"destination_airport" text,
	"value" integer,
	"purchase_order_number" text,
	"file_url" text,
	"attachment_ids" text[],
	"card_last_four_digits" text,
	"ticket_observations" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"updated_by" varchar
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"area" text,
	"reset_token" text,
	"reset_token_expiry" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "accommodations" ADD CONSTRAINT "accommodations_team_inclusion_id_team_inclusions_id_fk" FOREIGN KEY ("team_inclusion_id") REFERENCES "public"."team_inclusions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accommodations" ADD CONSTRAINT "accommodations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaborators" ADD CONSTRAINT "collaborators_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_team_inclusion_id_team_inclusions_id_fk" FOREIGN KEY ("team_inclusion_id") REFERENCES "public"."team_inclusions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial" ADD CONSTRAINT "financial_team_inclusion_id_team_inclusions_id_fk" FOREIGN KEY ("team_inclusion_id") REFERENCES "public"."team_inclusions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial" ADD CONSTRAINT "financial_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial" ADD CONSTRAINT "financial_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "function_managers" ADD CONSTRAINT "function_managers_function_id_functions_id_fk" FOREIGN KEY ("function_id") REFERENCES "public"."functions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "function_managers" ADD CONSTRAINT "function_managers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "function_users" ADD CONSTRAINT "function_users_function_id_functions_id_fk" FOREIGN KEY ("function_id") REFERENCES "public"."functions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "function_users" ADD CONSTRAINT "function_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "functions" ADD CONSTRAINT "functions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_logs" ADD CONSTRAINT "system_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_inclusion_logs" ADD CONSTRAINT "team_inclusion_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_inclusions" ADD CONSTRAINT "team_inclusions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_inclusions" ADD CONSTRAINT "team_inclusions_function_id_functions_id_fk" FOREIGN KEY ("function_id") REFERENCES "public"."functions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_inclusions" ADD CONSTRAINT "team_inclusions_collaborator_id_collaborators_id_fk" FOREIGN KEY ("collaborator_id") REFERENCES "public"."collaborators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_inclusions" ADD CONSTRAINT "team_inclusions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_inclusions" ADD CONSTRAINT "team_inclusions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_team_inclusion_id_team_inclusions_id_fk" FOREIGN KEY ("team_inclusion_id") REFERENCES "public"."team_inclusions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;