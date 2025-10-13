import type { User } from "@shared/schema";

export type UserRole = "admin" | "production" | "function_area" | "purchasing" | "financial";

export interface RolePermissions {
  canAccessScreen0: boolean;  // user registration + functions - admin only
  canEditScreen0: boolean;
  canAccessScreen1: boolean;  // team inclusion
  canEditScreen1: boolean;    // team inclusion editing
  canAccessScreen2: boolean;  // scaling
  canSelectCollaborators: boolean;
  canAccessScreen3: boolean;  // tickets
  canRegisterTickets: boolean;
  canAccessScreen4: boolean;
  canEditScreen4: boolean;
  canAccessScreen5: boolean;
  canApproveFinancial: boolean;
  canAccessScreen6: boolean; // consultation - admin only
  canAccessAdminUsers: boolean; // admin users management - admin only
  canAccessCollaborators: boolean; // collaborator management
  canEditCollaborators: boolean; // edit collaborators
}

export function getRolePermissions(role: UserRole): RolePermissions {
  switch (role) {
    case "admin":
      return {
        canAccessScreen0: true,
        canEditScreen0: true,
        canAccessScreen1: true,
        canEditScreen1: true,
        canAccessScreen2: true,
        canSelectCollaborators: true,
        canAccessScreen3: true,
        canRegisterTickets: true,
        canAccessScreen4: true,
        canEditScreen4: true,
        canAccessScreen5: true,
        canApproveFinancial: true,
        canAccessScreen6: true,
        canAccessAdminUsers: true,
        canAccessCollaborators: true,
        canEditCollaborators: true,
      };
    case "production":
      return {
        canAccessScreen0: false,
        canEditScreen0: false,
        canAccessScreen1: true,   // team inclusion - access
        canEditScreen1: true,     // team inclusion - can edit
        canAccessScreen2: true,   // scaling - view access
        canSelectCollaborators: false,
        canAccessScreen3: true,   // tickets - view access
        canRegisterTickets: false,
        canAccessScreen4: true,
        canEditScreen4: true,
        canAccessScreen5: false,
        canApproveFinancial: false,
        canAccessScreen6: false,
        canAccessAdminUsers: false,
        canAccessCollaborators: true,
        canEditCollaborators: true,
      };
    case "function_area":
      return {
        canAccessScreen0: false,
        canEditScreen0: false,
        canAccessScreen1: false,
        canEditScreen1: false,
        canAccessScreen2: true,
        canSelectCollaborators: true,
        canAccessScreen3: false,
        canRegisterTickets: false,
        canAccessScreen4: false,
        canEditScreen4: false,
        canAccessScreen5: false,
        canApproveFinancial: false,
        canAccessScreen6: false,
        canAccessAdminUsers: false,
        canAccessCollaborators: true,
        canEditCollaborators: true,
      };
    case "purchasing":
      return {
        canAccessScreen0: false,
        canEditScreen0: false,
        canAccessScreen1: false,
        canEditScreen1: false,
        canAccessScreen2: true,  // scaling - view access
        canSelectCollaborators: false,
        canAccessScreen3: true,
        canRegisterTickets: true,
        canAccessScreen4: false,
        canEditScreen4: false,
        canAccessScreen5: false,
        canApproveFinancial: false,
        canAccessScreen6: false,
        canAccessAdminUsers: false,
        canAccessCollaborators: false,
        canEditCollaborators: false,
      };
    case "financial":
      return {
        canAccessScreen0: false,
        canEditScreen0: false,
        canAccessScreen1: false,
        canEditScreen1: false,
        canAccessScreen2: false,
        canSelectCollaborators: false,
        canAccessScreen3: false,
        canRegisterTickets: false,
        canAccessScreen4: false,
        canEditScreen4: false,
        canAccessScreen5: true,
        canApproveFinancial: true,
        canAccessScreen6: false,
        canAccessAdminUsers: false,
        canAccessCollaborators: false,
        canEditCollaborators: false,
      };
    default:
      return {
        canAccessScreen0: false,
        canEditScreen0: false,
        canAccessScreen1: false,
        canEditScreen1: false,
        canAccessScreen2: false,
        canSelectCollaborators: false,
        canAccessScreen3: false,
        canRegisterTickets: false,
        canAccessScreen4: false,
        canEditScreen4: false,
        canAccessScreen5: false,
        canApproveFinancial: false,
        canAccessScreen6: false,
        canAccessAdminUsers: false,
        canAccessCollaborators: false,
        canEditCollaborators: false,
      };
  }
}

export function hasPermission(user: User | null, permission: keyof RolePermissions): boolean {
  if (!user) return false;
  const permissions = getRolePermissions(user.role as UserRole);
  return permissions[permission];
}

export function getRoleLabel(role: UserRole): string {
  switch (role) {
    case "admin": return "Administrador";
    case "production": return "Logística Interna";
    case "function_area": return "Área responsável por funções";
    case "purchasing": return "Área de Compras/Viagem";
    case "financial": return "Área Financeira";
    default: return "Usuário";
  }
}

export function getAvailableAreas(): string[] {
  return [
    "Logística Interna",
    "Técnica",
    "Cenografia",
    "Figurino",
    "Maquiagem",
    "Som",
    "Iluminação",
    "Vídeo",
    "Fotografia",
    "Segurança",
    "Limpeza",
    "Catering",
    "Logística"
  ];
}