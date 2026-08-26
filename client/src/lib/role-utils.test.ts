import { describe, it, expect } from "vitest";
import { getRolePermissions, type UserRole } from "./role-utils";

/**
 * Módulo Validação de Escala.
 *
 * REGRA ATUAL (decisão do usuário, 20/08 — revoga o admin-only de 19/08):
 * ACESSO às 4 telas é de TODOS os papéis conhecidos; a ESCRITA real vem do
 * CADASTRO em Funções (validador/aprovador) — as flags de edit são só o
 * default do papel; quem não tem cadastro nenhum visualiza. Perfil
 * desconhecido continua sem nada.
 */
describe("getRolePermissions — módulo Validação de Escala", () => {
  const roles: UserRole[] = ["admin", "production", "function_area", "purchasing", "financial"];

  it("todos os papéis conhecidos acessam as 4 telas", () => {
    for (const r of roles) {
      const p = getRolePermissions(r);
      expect(p.canAccessScalingSuggestion).toBe(true);
      expect(p.canAccessScalingValidation).toBe(true);
      expect(p.canAccessScalingApproval).toBe(true);
      expect(p.canAccessScalingEventView).toBe(true);
    }
  });

  it("edição da Sugestão (default do papel): admin e production — espelha o /bulk", () => {
    for (const r of roles) {
      const p = getRolePermissions(r);
      expect(p.canEditScalingSuggestion).toBe(r === "admin" || r === "production");
    }
  });

  it("edição da Validação (default do papel): admin e function_area — validador cadastrado de qualquer papel valida via canEdit do servidor", () => {
    for (const r of roles) {
      const p = getRolePermissions(r);
      expect(p.canEditScalingValidation).toBe(r === "admin" || r === "function_area");
    }
  });

  it("edição da Aprovação (default do papel): só admin — a decisão real é o canDecide do servidor, por cadastro de aprovador", () => {
    for (const r of roles) {
      const p = getRolePermissions(r);
      expect(p.canEditScalingApproval).toBe(r === "admin");
    }
  });

  it("edit implica access em todas as telas do módulo", () => {
    for (const r of roles) {
      const p = getRolePermissions(r);
      if (p.canEditScalingSuggestion) expect(p.canAccessScalingSuggestion).toBe(true);
      if (p.canEditScalingValidation) expect(p.canAccessScalingValidation).toBe(true);
      if (p.canEditScalingApproval) expect(p.canAccessScalingApproval).toBe(true);
    }
  });

  it("perfil desconhecido não acessa nem edita nada do módulo", () => {
    const p = getRolePermissions("qualquer" as UserRole);
    expect(p.canAccessScalingSuggestion).toBe(false);
    expect(p.canAccessScalingValidation).toBe(false);
    expect(p.canAccessScalingApproval).toBe(false);
    expect(p.canAccessScalingEventView).toBe(false);
    expect(p.canEditScalingSuggestion).toBe(false);
    expect(p.canEditScalingValidation).toBe(false);
    expect(p.canEditScalingApproval).toBe(false);
  });

  it("aba Responsáveis da Escala (dentro de Funções): permissão própria, só admin — diferente do catálogo", () => {
    for (const r of roles) {
      const p = getRolePermissions(r);
      expect(p.canAccessScalingManagers).toBe(r === "admin");
    }
    // desconhecido também fica de fora
    expect(getRolePermissions("qualquer" as UserRole).canAccessScalingManagers).toBe(false);
  });
});

/**
 * Módulo Simulação — "Ver como usuário" (espelha POST /api/simulation/start,
 * que só o admin REAL da sessão pode chamar).
 */
describe("getRolePermissions — módulo Simulação (Ver como usuário)", () => {
  const roles: UserRole[] = ["admin", "production", "function_area", "purchasing", "financial"];

  it("só admin acessa o módulo de simulação", () => {
    for (const r of roles) {
      expect(getRolePermissions(r).canAccessSimulation).toBe(r === "admin");
    }
  });

  it("perfil desconhecido não acessa", () => {
    expect(getRolePermissions("qualquer" as UserRole).canAccessSimulation).toBe(false);
  });
});
