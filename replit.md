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

## System Settings (Configurações)
- **Table**: `system_settings` — key-value store for global default values
- **Keys**: `default_daily_value`, `default_mobility`, `default_weekday_lunch`, `default_weekday_dinner`, `default_weekend_lunch`, `default_weekend_dinner`
- **Values stored in centavos** (integers): e.g. `2500` = R$25,00
- **API**: `GET /api/system-settings` returns object with defaults; `PUT /api/system-settings` updates (admin only, receives values in reais, stores in centavos)
- **Architecture**: Global defaults → used as fallback in budget-planned.tsx calculations → `budget_planned` stores its own independent copy → existing events unaffected
- **Access**: Admin-only page at `/system-settings`, shown in sidebar under "Sistema"

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