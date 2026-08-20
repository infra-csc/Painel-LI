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
  // LIBERAÇÃO ATUAL (decisão do usuário, 19/08): o módulo inteiro aparece
  // SÓ PARA ADMIN enquanto o fluxo é testado — nenhum outro papel vê as 4 telas
  // no menu nem entra pela rota. A matriz do briefing (abaixo) fica registrada
  // para quando a liberação for ampliada: basta devolver os `true` por papel.
  // ── Módulo Validação de Escala (matriz do briefing §7) ──────────────────
  // Tela                 | admin | production | purchasing | financial | function_area
  // Sugestão de Escala   | edit  | edit       | view       | view      | none
  // Validação de Escala  | edit  | view       | view       | view      | edit (só das funções em que é validador — canEdit do servidor)
  // Aprovação de Escala  | edit  | edit       | edit       | view      | view (só os pedidos das funções em que é aprovador — filtro do servidor)
  // Histórico da Escala  | view  | view       | view       | view      | view
  // "Access" = entra na tela (menu + rota); "Edit" = pode gravar. A decisão
  // final de cada linha/pedido continua sendo do servidor (canEdit/canDecide).
  canAccessScalingSuggestion: boolean; // entra na Sugestão (view) — admin, production, purchasing, financial
  canEditScalingSuggestion: boolean;   // espelha POST /api/scaling-suggestions/bulk (admin, production)
  canAccessScalingValidation: boolean; // GET /api/scaling-suggestions — todos os perfis logados
  canEditScalingValidation: boolean;   // espelha POST /api/scaling-suggestions/validate — admin e function_area (validador da função; canEdit do servidor)
  canAccessScalingApproval: boolean;   // GET /api/scaling-change-requests — admin/production/purchasing/financial por papel + function_area (o servidor filtra às funções em que é aprovador, ou responde 403)
  canEditScalingApproval: boolean;     // espelha a decisão de pedidos — admin, production, purchasing (canDecide do servidor por pedido é a trava final)
  canAccessScalingEventView: boolean;  // GET /api/scaling-suggestions/event-view — qualquer usuário logado (somente leitura)
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
        canAccessScalingSuggestion: false,
        canEditScalingSuggestion: false,
        canAccessScalingValidation: false,
        canEditScalingValidation: false,
        canAccessScalingApproval: false,
        canEditScalingApproval: false,
        canAccessScalingEventView: false,
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
        canAccessScalingSuggestion: false,
        canEditScalingSuggestion: false,
        canAccessScalingValidation: false,
        canEditScalingValidation: false,   // valida só as funções em que é validador (canEdit do servidor)
        // Entra na Aprovação porque o servidor tem o fallback do APROVADOR: quem é
        // 'aprovador' de alguma função vê (e decide) os pedidos dela. Quem não for
        // aprovador de nada leva 403 e a tela mostra o estado neutro.
        canAccessScalingApproval: false,
        canEditScalingApproval: false,    // §7: não é papel de decisão — quem libera é o canDecide do servidor
        canAccessScalingEventView: false,
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
        canAccessScalingSuggestion: false,   // view (a tela do outro agente adotará canEditScalingSuggestion)
        canEditScalingSuggestion: false,
        canAccessScalingValidation: false,
        canEditScalingValidation: false,
        canAccessScalingApproval: false,
        canEditScalingApproval: false,
        canAccessScalingEventView: false,
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
        canAccessScalingSuggestion: false,   // view (a tela do outro agente adotará canEditScalingSuggestion)
        canEditScalingSuggestion: false,
        canAccessScalingValidation: false,
        canEditScalingValidation: false,
        canAccessScalingApproval: false,     // view — o GET aceita financial; canDecide vem sempre false do servidor
        canEditScalingApproval: false,
        canAccessScalingEventView: false,
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
