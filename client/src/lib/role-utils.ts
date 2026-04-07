import type { User } from "@shared/schema";

export type UserRole = "admin" | "production" | "function_area" | "purchasing" | "financial";

export interface RolePermissions {
  canAccessCadastros: boolean;   // events, user-registration, functions
  canAccessScreen0: boolean;     // legacy — budget-planned, budget-actual, invoices (now = canAccessFinanceiro)
  canEditScreen0: boolean;
  canAccessScreen1: boolean;     // team inclusion
  canEditScreen1: boolean;
  canAccessScreen2: boolean;     // scaling
  canSelectCollaborators: boolean;
  canAccessScreen3: boolean;     // tickets + accommodations
  canRegisterTickets: boolean;
  canAccessScreen4: boolean;
  canEditScreen4: boolean;
  canAccessScreen5: boolean;     // comparativo + rh-control
  canApproveFinancial: boolean;
  canAccessFinanceiro: boolean;  // planejado, realizado, notas fiscais, valores padrão
  canAccessScreen6: boolean;     // consulta geral — admin only
  canAccessAdminUsers: boolean;  // admin-users management — admin only
  canAccessCollaborators: boolean;
  canEditCollaborators: boolean;
  canAccessCalendar: boolean;
}

export function getRolePermissions(role: UserRole): RolePermissions {
  switch (role) {
    case "admin":
      return {
        canAccessCadastros: true,
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
        canAccessFinanceiro: true,
        canAccessScreen6: true,
        canAccessAdminUsers: true,
        canAccessCollaborators: true,
        canEditCollaborators: true,
        canAccessCalendar: true,
      };

    case "production":
      return {
        canAccessCadastros: false,
        canAccessScreen0: false,
        canEditScreen0: false,
        canAccessScreen1: true,
        canEditScreen1: true,
        canAccessScreen2: true,
        canSelectCollaborators: false,
        canAccessScreen3: true,
        canRegisterTickets: false,
        canAccessScreen4: true,
        canEditScreen4: true,
        canAccessScreen5: false,
        canApproveFinancial: false,
        canAccessFinanceiro: false,
        canAccessScreen6: false,
        canAccessAdminUsers: false,
        canAccessCollaborators: true,
        canEditCollaborators: true,
        canAccessCalendar: true,
      };

    case "function_area":
      return {
        canAccessCadastros: false,
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
        canAccessFinanceiro: false,
        canAccessScreen6: false,
        canAccessAdminUsers: false,
        canAccessCollaborators: true,
        canEditCollaborators: true,
        canAccessCalendar: true,
      };

    case "purchasing":
      return {
        canAccessCadastros: true,
        canAccessScreen0: false,
        canEditScreen0: false,
        canAccessScreen1: true,
        canEditScreen1: true,
        canAccessScreen2: true,
        canSelectCollaborators: false,
        canAccessScreen3: true,
        canRegisterTickets: true,
        canAccessScreen4: false,
        canEditScreen4: false,
        canAccessScreen5: false,
        canApproveFinancial: false,
        canAccessFinanceiro: false,
        canAccessScreen6: false,
        canAccessAdminUsers: false,
        canAccessCollaborators: true,
        canEditCollaborators: true,
        canAccessCalendar: true,
      };

    case "financial":
      return {
        canAccessCadastros: true,
        canAccessScreen0: true,
        canEditScreen0: true,
        canAccessScreen1: true,
        canEditScreen1: false,
        canAccessScreen2: true,
        canSelectCollaborators: false,
        canAccessScreen3: true,
        canRegisterTickets: false,
        canAccessScreen4: true,
        canEditScreen4: true,
        canAccessScreen5: true,
        canApproveFinancial: true,
        canAccessFinanceiro: true,
        canAccessScreen6: false,
        canAccessAdminUsers: false,
        canAccessCollaborators: true,
        canEditCollaborators: true,
        canAccessCalendar: true,
      };

    default:
      return {
        canAccessCadastros: false,
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
        canAccessFinanceiro: false,
        canAccessScreen6: false,
        canAccessAdminUsers: false,
        canAccessCollaborators: false,
        canEditCollaborators: false,
        canAccessCalendar: false,
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
    case "financial": return "RH";
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
