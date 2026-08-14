/**
 * Sistema de permissões centralizado
 * Define quais roles têm acesso a quais funcionalidades
 */

import type { User } from "@shared/schema";
import { normalizeRole } from "@shared/roles";

export type UserRole = 'admin' | 'production' | 'function_area' | 'purchasing' | 'financial';
export type AccessLevel = 'none' | 'view' | 'edit';

/**
 * Matriz de permissões por funcionalidade
 */
const PERMISSIONS: Record<string, Record<UserRole, AccessLevel>> = {
  // Inclusão de Equipe
  team_inclusion: {
    admin: 'edit',         // Administrador: acesso total
    production: 'edit',    // Logística Interna: acesso total
    function_area: 'none', // Área Responsável por Funções: sem acesso
    purchasing: 'edit',    // Área de Compras/Viagens: acesso total
    financial: 'view'      // RH: apenas visualização
  },
  
  // Escalação
  scaling: {
    admin: 'edit',      // Administrador: acesso total
    production: 'view', // Logística Interna: apenas visualização
    function_area: 'edit', // Área Responsável por Funções: acesso total
    purchasing: 'edit', // Área de Compras/Viagens: acesso total
    financial: 'view'   // Financial: apenas visualização
  },
  
  // Compra de Passagem
  tickets: {
    admin: 'edit',         // Administrador: acesso total
    production: 'edit',    // Logística Interna: acesso total
    function_area: 'view', // Área Responsável por Funções: apenas visualização (inclui cards)
    purchasing: 'edit',    // Área de Compras/Viagens: acesso total
    financial: 'view'      // Financial: apenas visualização
  },
  
  // Funções (admin sempre pode gerenciar)
  functions: {
    admin: 'edit',         // Administrador: acesso total
    production: 'edit',    // Logística Interna: acesso total
    function_area: 'view', // Área Responsável por Funções: visualização
    purchasing: 'edit',    // Área de Compras/Viagens: acesso total
    financial: 'view'      // Financial: visualização
  },
  
  // Colaboradores
  collaborators: {
    admin: 'edit',      // Administrador: acesso total
    production: 'edit', // Logística Interna: acesso total
    function_area: 'edit', // Área Responsável por Funções: acesso total (cadastro habilitado)
    purchasing: 'edit', // Área de Compras/Viagens: acesso total
    financial: 'view'   // Financial: visualização
  },
  
  // Hospedagem
  accommodations: {
    admin: 'edit',         // Administrador: acesso total
    production: 'edit',    // Logística Interna: acesso total
    function_area: 'view', // Área Responsável por Funções: apenas visualização (inclui cards)
    purchasing: 'edit',    // Área de Compras/Viagens: acesso total
    financial: 'view'      // Financial: apenas visualização
  }
};

/**
 * Verifica se o usuário tem permissão para uma funcionalidade
 */
export function hasPermission(user: User | null, feature: string, requiredLevel: AccessLevel = 'view'): boolean {
  if (!user) return false;
  
  const normalizedRole = normalizeRole(user.role);
  if (!normalizedRole) return false;
  
  const userPermission = PERMISSIONS[feature]?.[normalizedRole];
  if (!userPermission) return false;
  
  // Hierarquia de permissões: edit > view > none
  const permissionLevels = { none: 0, view: 1, edit: 2 };
  
  return permissionLevels[userPermission] >= permissionLevels[requiredLevel];
}

/**
 * Verifica se o usuário pode visualizar uma funcionalidade
 */
export function canView(user: User | null, feature: string): boolean {
  return hasPermission(user, feature, 'view');
}

/**
 * Verifica se o usuário pode editar uma funcionalidade
 */
export function canEdit(user: User | null, feature: string): boolean {
  return hasPermission(user, feature, 'edit');
}

/**
 * Verifica se o usuário é administrador
 */
export function isAdmin(user: User | null): boolean {
  if (!user) return false;
  const normalizedRole = normalizeRole(user.role);
  return normalizedRole === 'admin';
}

/**
 * Verifica se o usuário é RH (Financeiro) ou administrador
 */
export function isRhOrAdmin(user: User | null): boolean {
  if (!user) return false;
  const normalizedRole = normalizeRole(user.role);
  return normalizedRole === 'admin' || normalizedRole === 'financial';
}

/**
 * Obtém o nível de acesso do usuário para uma funcionalidade
 */
export function getAccessLevel(user: User | null, feature: string): AccessLevel {
  if (!user) return 'none';
  const normalizedRole = normalizeRole(user.role);
  if (!normalizedRole) return 'none';
  return PERMISSIONS[feature]?.[normalizedRole] || 'none';
}

/**
 * Nomes amigáveis para os roles
 */
export const ROLE_NAMES: Record<UserRole, string> = {
  admin: 'Administrador',
  production: 'Logística Interna',
  function_area: 'Área Responsável por Funções',
  purchasing: 'Área de Compras/Viagem',
  financial: 'RH'
};

/**
 * Obtém o nome amigável do role
 */
export function getRoleName(role: UserRole): string {
  return ROLE_NAMES[role] || role;
}