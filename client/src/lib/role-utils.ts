/**
 * FONTE ÚNICA das flags de permissão do client, espelhadas do servidor.
 * NOVAS PERMISSÕES VÃO AQUI (com o comentário da rota que espelham).
 *
 * `permissions.ts` é a matriz feature × nível ('none' | 'view' | 'edit')
 * usada por telas legadas — convivem por enquanto; não unificar sem
 * revisar cada tela.
 */
import type { User } from "@shared/schema";
import { normalizeRole } from "@shared/roles";

export type UserRole = "admin" | "production" | "function_area" | "purchasing" | "financial";

/**
 * Flags de permissão do client. Cada uma ESPELHA a regra real de uma rota em
 * server/routes.ts (comentário ao lado). Se a rota mudar lá, mude aqui — o
 * objetivo é nunca mostrar um botão que o servidor vai recusar com 403.
 */
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
  canAccessScreen6: boolean;     // Consulta Geral — espelha GET /api/system-logs (só admin; RH não vê)
  canAccessAdminUsers: boolean;  // Gerenciamento de Usuários — espelha GET /api/users (admin, financial, purchasing, production)
  canAccessCollaborators: boolean;
  canEditCollaborators: boolean; // espelha POST/PATCH /api/collaborators e /bulk (CADASTRO_ROLES + function_area)
  canManageFunctions: boolean;   // espelha POST/PATCH/DELETE /api/functions e /:id/managers (CADASTRO_ROLES: admin, purchasing, production)
  canCreateUsers: boolean;       // espelha POST /api/users (admin, financial, purchasing)
  canManageUserAccounts: boolean;// espelha PATCH /api/users/:id/toggle-active e POST /:id/reset-password (admin, purchasing, production)
  canChangeUserRole: boolean;    // espelha PATCH /api/users/:id — role/area só admin (allowedFieldsForAdmin)
  canAccessCalendar: boolean;
  canAccessBaggage: boolean;     // controle de bagagem — admin e compras
  // ── Módulo Validação de Escala (decisão do usuário, 20/08 — revoga o
  // admin-only de 19/08) ───────────────────────────────────────────────────
  // Regra: ACESSO às 4 telas é de TODOS os papéis conhecidos; a ESCRITA real
  // vem do CADASTRO em Funções (validador/aprovador) — as flags de edit abaixo
  // são apenas o default do papel; quem não tem cadastro nenhum visualiza.
  // Ex.: um validador cadastrado de qualquer papel valida (canEdit do servidor)
  // e um aprovador cadastrado de qualquer papel decide (canDecide do servidor).
  // Perfil desconhecido continua sem nada.
  canAccessScalingSuggestion: boolean; // entra na Sugestão — todos os papéis conhecidos
  canEditScalingSuggestion: boolean;   // default do papel: monta/envia/cancela a sugestão — espelha POST /api/scaling-suggestions/bulk (admin, production)
  canAccessScalingValidation: boolean; // GET /api/scaling-suggestions — todos os papéis conhecidos
  canEditScalingValidation: boolean;   // default do papel: admin, function_area — mas as telas já deixam validador CADASTRADO de qualquer papel validar (canEdit do servidor)
  canAccessScalingApproval: boolean;   // GET /api/scaling-change-requests — todos os papéis conhecidos (o servidor filtra/decide por cadastro)
  canEditScalingApproval: boolean;     // default do papel: admin — a decisão real é o canDecide do servidor, por cadastro de aprovador (qualquer papel cadastrado decide)
  canAccessScalingEventView: boolean;  // GET /api/scaling-suggestions/event-view — todos os papéis conhecidos (somente leitura)
  canAccessScalingManagers: boolean;   // aba Responsáveis da Escala dentro de Funções — permissões próprias, diferentes do catálogo (só admin)
}

export function getRolePermissions(role: UserRole): RolePermissions {
  const canonical = normalizeRole(role) ?? role;
  switch (canonical) {
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
        canManageFunctions: true,
        canCreateUsers: true,
        canManageUserAccounts: true,
        canChangeUserRole: true,
        canAccessCalendar: true,
        canAccessBaggage: true,
        canAccessScalingSuggestion: true,
        canEditScalingSuggestion: true,
        canAccessScalingValidation: true,
        canEditScalingValidation: true,
        canAccessScalingApproval: true,
        canEditScalingApproval: true,
        canAccessScalingEventView: true,
        canAccessScalingManagers: true,   // aba Responsáveis da Escala — só admin
      };

    case "production":
      return {
        canAccessCadastros: true,
        canAccessScreen0: false,
        canEditScreen0: false,
        canAccessScreen1: true,
        canEditScreen1: true,
        canAccessScreen2: true,
        canSelectCollaborators: true,
        canAccessScreen3: true,
        canRegisterTickets: true,
        canAccessScreen4: true,
        canEditScreen4: true,
        canAccessScreen5: false,
        canApproveFinancial: false,
        canAccessFinanceiro: false,
        canAccessScreen6: false,
        canAccessAdminUsers: true,
        canAccessCollaborators: true,
        canEditCollaborators: true,
        canManageFunctions: true,
        canCreateUsers: false,        // POST /api/users recusa production
        canManageUserAccounts: true,
        canChangeUserRole: false,
        canAccessCalendar: true,
        canAccessBaggage: false,
        canAccessScalingSuggestion: true,
        canEditScalingSuggestion: true,   // production monta/envia/cancela a sugestão (espelha o /bulk)
        canAccessScalingValidation: true,
        canEditScalingValidation: false,  // valida se for validador cadastrado (canEdit do servidor)
        canAccessScalingApproval: true,
        canEditScalingApproval: false,    // decide se for aprovador cadastrado (canDecide do servidor)
        canAccessScalingEventView: true,
        canAccessScalingManagers: false,  // aba Responsáveis da Escala — só admin
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
        canEditCollaborators: true,   // servidor aceita function_area em POST/PATCH /api/collaborators
        canManageFunctions: false,
        canCreateUsers: false,
        canManageUserAccounts: false,
        canChangeUserRole: false,
        canAccessCalendar: true,
        canAccessBaggage: false,
        canAccessScalingSuggestion: true,
        canEditScalingSuggestion: false,
        canAccessScalingValidation: true,
        canEditScalingValidation: true,   // valida só as funções em que é validador (canEdit do servidor)
        canAccessScalingApproval: true,   // quem é aprovador cadastrado decide; quem não é visualiza o estado neutro
        canEditScalingApproval: false,    // a decisão real é o canDecide do servidor, por cadastro
        canAccessScalingEventView: true,
        canAccessScalingManagers: false,  // aba Responsáveis da Escala — só admin
      };

    case "purchasing":
      return {
        canAccessCadastros: true,
        canAccessScreen0: false,
        canEditScreen0: false,
        canAccessScreen1: true,
        canEditScreen1: true,
        canAccessScreen2: true,
        canSelectCollaborators: true,
        canAccessScreen3: true,
        canRegisterTickets: true,
        canAccessScreen4: true,
        canEditScreen4: true,
        canAccessScreen5: false,
        canApproveFinancial: false,
        canAccessFinanceiro: false,
        canAccessScreen6: false,
        canAccessAdminUsers: true,
        canAccessCollaborators: true,
        canEditCollaborators: true,
        canManageFunctions: true,
        canCreateUsers: true,
        canManageUserAccounts: true,
        canChangeUserRole: false,
        canAccessCalendar: true,
        canAccessBaggage: true,
        canAccessScalingSuggestion: true,   // view por padrão de papel
        canEditScalingSuggestion: false,
        canAccessScalingValidation: true,
        canEditScalingValidation: false,    // valida se for validador cadastrado (canEdit do servidor)
        canAccessScalingApproval: true,
        canEditScalingApproval: false,      // decide se for aprovador cadastrado (canDecide do servidor)
        canAccessScalingEventView: true,
        canAccessScalingManagers: false,    // aba Responsáveis da Escala — só admin
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
        canEditScreen4: false,
        canAccessScreen5: true,
        canApproveFinancial: true,
        canAccessFinanceiro: true,
        canAccessScreen6: false,      // GET /api/system-logs é só admin — RH não vê a Consulta
        canAccessAdminUsers: true,
        canAccessCollaborators: true,
        canEditCollaborators: false,  // POST/PATCH /api/collaborators recusa financial
        canManageFunctions: false,    // POST/PATCH/DELETE /api/functions recusa financial
        canCreateUsers: true,
        canManageUserAccounts: false, // toggle-active/reset-password recusam financial
        canChangeUserRole: false,
        canAccessCalendar: true,
        canAccessBaggage: false,
        canAccessScalingSuggestion: true,   // view por padrão de papel
        canEditScalingSuggestion: false,
        canAccessScalingValidation: true,
        canEditScalingValidation: false,    // valida se for validador cadastrado (canEdit do servidor)
        canAccessScalingApproval: true,
        canEditScalingApproval: false,      // decide se for aprovador cadastrado (canDecide do servidor)
        canAccessScalingEventView: true,
        canAccessScalingManagers: false,    // aba Responsáveis da Escala — só admin
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
        canManageFunctions: false,
        canCreateUsers: false,
        canManageUserAccounts: false,
        canChangeUserRole: false,
        canAccessCalendar: false,
        canAccessBaggage: false,
        canAccessScalingSuggestion: false,
        canEditScalingSuggestion: false,
        canAccessScalingValidation: false,
        canEditScalingValidation: false,
        canAccessScalingApproval: false,
        canEditScalingApproval: false,
        canAccessScalingEventView: false,
        canAccessScalingManagers: false,
      };
  }
}

export function hasPermission(user: User | null, permission: keyof RolePermissions): boolean {
  if (!user) return false;
  const permissions = getRolePermissions(user.role as UserRole);
  return permissions[permission];
}

export function getRoleLabel(role: UserRole): string {
  const canonical = normalizeRole(role) ?? role;
  switch (canonical) {
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
