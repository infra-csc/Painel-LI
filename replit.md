# Overview

This is a comprehensive production management system built with React and Express, designed to handle event staffing workflows. The application manages the complete lifecycle of event production from team inclusion to final approval, with role-based access control and a multi-phase workflow system. The system integrates with Microsoft Dataverse and uses PostgreSQL for data persistence.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with TypeScript, built using Vite for fast development and optimized builds
- **UI Framework**: Shadcn/ui components built on Radix UI primitives with Tailwind CSS for styling
- **State Management**: TanStack Query for server state management and caching
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation for type-safe form validation

## Backend Architecture
- **Server**: Express.js with TypeScript for the REST API
- **Database ORM**: Drizzle ORM with PostgreSQL database schema
- **Authentication**: Session-based authentication with role-based access control
- **API Design**: RESTful endpoints with proper HTTP status codes and error handling
- **Development Setup**: Hot module replacement with Vite middleware integration

## Database Design
- **Primary Tables**: Users, Events, Functions, Collaborators, TeamInclusions, Tickets, Financial, Comments
- **Schema Management**: Drizzle migrations with PostgreSQL as the target database
- **Data Validation**: Zod schemas for runtime type checking and validation
- **Relationships**: Foreign key relationships between core entities (events, collaborators, functions)
- **Area Field**: The 'area' field belongs only to Users and TeamInclusions tables, NOT to Collaborators. Users have an area they're responsible for, and TeamInclusions have an area field to indicate which area the team inclusion belongs to in the context of that specific event

## Workflow System
- **Multi-Phase Process**: Five distinct phases (Inclusion, Scaling, Tickets, Closure, Approval)
- **Role-Based Access**: Different user roles have access to specific workflow phases
- **Status Tracking**: Comprehensive status management across all entities
- **Comments System**: Built-in commenting system for collaboration and audit trails

## Financial Workflow (Prestações de Contas)
- **Terminology**: "Prestação de Contas" (NOT "Execução") — refers to the accountability/expense report flow
- **Flow**: Escalação → Planejado (RH) → Prestação de Contas (Resp. Função) → Aprovação (RH)
- **RH Control Page**: "Controle de Prestações de Contas" — RH-only view showing all items across events
- **Status Flow**:
  - Planejamento pendente: Escalação exists, RH hasn't created the planned budget
  - Aguardando prestação: Planned exists, waiting for function responsible to fill actual
  - Prestação recebida: Function responsible submitted, awaiting RH analysis
  - Devolvida para ajuste: RH returned for corrections
  - Aprovada para faturamento: RH approved for billing
  - Recusada: RH rejected
- **Default view**: Hides concluded items (aprovada/recusada); "Concluídos" filter shows them
- **Business rules**: Events without escalações don't appear in Planejado or RH Control

## Nota Fiscal Flow
- **5th step** in the comparativo stepper: Escalação → Planejamento RH → Prestação → Aprovação RH → Nota Fiscal
- **Table**: `invoices` — stores invoice submissions per collaborator per event
- **Fields**: `eventId`, `collaboratorId`, `functionId`, `budgetActualId`, `oc`, `attachmentUrl`, `attachmentName`, `paymentText`, `status`, `returnComment`, `paymentDate`, `approvedAt`
- **Status flow**: `pendente` → `enviada` → `aprovada` | `devolvida` | `recusada`; devolvida allows resubmission
- **Empresa pagadora**: `events.paymentCompanyName` + `events.paymentCompanyCnpj` — optional fields; when filled, auto-generates payment text in each invoice
- **Page**: `/invoices` — two tabs: "Lançamento" (collaborators submit OC + file) and "Aprovação RH" (RH approves with payment date, returns with comment, or rejects)
- **Access**: Lançamento visible to all; Aprovação RH tab only for admin/financial roles
- **API**: `GET/POST /api/invoices`, `PATCH /api/invoices/:id`, `POST /api/invoices/:id/approve|return|reject`

## Empresas Pagadoras
- **Table**: `payment_companies` — stores reusable companies (name + CNPJ) for payment purposes
- **Fields**: `id` (serial), `name`, `cnpj`, `createdAt`
- **API**: `GET /api/payment-companies` (all users), `POST /api/payment-companies` (admin only), `DELETE /api/payment-companies/:id` (admin only)
- **Event Modal**: When companies are registered, a "Selecionar empresa cadastrada" dropdown appears in the payment section — selecting one auto-fills name + CNPJ fields
- **Management**: Admin can add/delete companies in the Configurações page under "Empresas Pagadoras" section

## System Settings (Configurações)
- **Table**: `system_settings` — key-value store for global default values
- **Casa keys**: `default_daily_value_weekday`, `default_daily_value_weekend`, `default_mobility_ida`, `default_mobility_volta`, `default_weekday_lunch`, `default_weekday_dinner`, `default_weekend_lunch`, `default_weekend_dinner`
- **Freela keys**: same with `_freela` suffix (e.g. `default_daily_value_weekday_freela`, `default_mobility_ida_freela`, etc.)
- **Values stored in centavos** (integers): e.g. `2500` = R$25,00
- **API**: `GET /api/system-settings` returns object with defaults; `PUT /api/system-settings` updates (admin only, receives values in reais, stores in centavos)
- **Architecture**: Global defaults → used as fallback in budget-planned.tsx calculations → `budget_planned` stores its own independent copy → existing events unaffected
- **Casa/Freela toggle**: UI tab in `/system-settings` to configure separate values for each collaborator type

## Function Values (Diária por Função)
- **Table**: `function_values` — daily rate overrides per function
- **Daily rate columns**: `dailyValue` (casa weekday), `dailyValueWeekend` (casa weekend), `dailyValueFreela` (freela weekday), `dailyValueFreelaWeekend` (freela weekend) — all in centavos
- **UI**: Two columns in the function table (Dia Útil + Fim de Semana), tabs switch between Casa and Freela values
- **Calculation priority**: override → function-specific (type+weekday/weekend) → inclusion daily value → system default
- **Access**: Admin-only page at `/system-settings`, shown in sidebar under "Sistema"

## "Não Participou" Feature (Did Not Attend)
- **Purpose**: Allows RH/Admin to mark a `budget_planned` record as "did not attend" — removing it from financial totals while keeping it visible for historical record
- **Schema**: `budget_planned` has `didNotAttend boolean DEFAULT false` and `didNotAttendReason text`
- **API**: `POST /api/budget-planned/:id/toggle-not-attended` — toggles the flag; accepts optional `reason` body param
- **Access**: `isRhOrAdmin(user)` — Admin or Financeiro role
- **UI (Orçamento Planejado)**: UserX button visible only when card is "sent" (`isSent`) and has a planned record; card gets grey/dashed border + opacity; "Não participou" badge; reason shown in italic; Undo2 button to restore; confirmation modal with optional reason field
- **UI (Comparativo)**: Uses `row.planned.didNotAttend` (planned record's flag); card gets grey/dashed style; "Não participou" badge; expanded section shows notice; `groupActualTotal` = 0; excludes from totals

## Split Vacancy Feature (Divisão de Vaga)
- **Purpose**: Allows a `budget_actual` record to be split — assigning specific days to a different collaborator
- **Schema**: `budget_actual` has `splitParentId varchar` (null = original, set = split child) and `workedDays text[]` (YYYY-MM-DD strings per collaborator)
- **API**: `POST /api/budget-actual/:id/split` — creates a child record linked to the parent with pro-rated values; optionally updates parent's `workedDays`
- **UI**: GitFork icon button in each editable card opens `SplitVagaModal`; child items show a "Divisão" badge in purple
- **Modal** (`client/src/components/split-vaga-modal.tsx`): Collaborator search dropdown (portal-based), day picker (one button per day in the team inclusion range), mobility input, coverage warning

## Authentication & Authorization
- **User Roles**: Administrator, Production Area, Function Area, Purchasing, Financial
- **Session Management**: Server-side session handling with secure authentication
- **Permission Model**: Role-based access to specific features and workflow phases

## External Dependencies

- **Database**: Neon PostgreSQL serverless database for cloud-hosted data storage
- **UI Components**: Extensive Radix UI component library for accessible, unstyled components
- **Styling**: Tailwind CSS with custom design system variables for consistent theming
- **Form Validation**: Zod for schema validation and type safety
- **Development Tools**: Replit-specific tooling for cloud development environment
- **Microsoft Dataverse**: Integration planned for enterprise data synchronization (as mentioned in requirements document)