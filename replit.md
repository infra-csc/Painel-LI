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