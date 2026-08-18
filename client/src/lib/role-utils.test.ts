import { describe, it, expect } from "vitest";
import { getRolePermissions, type UserRole } from "./role-utils";

/** Matriz do módulo Validação de Escala (briefing §7). */
describe("getRolePermissions — módulo Validação de Escala", () => {
  const roles: UserRole[] = ["admin", "production", "function_area", "purchasing", "financial"];

  it("Sugestão: admin/production editam; purchasing/financial só veem; function_area não entra", () => {
    const m = Object.fromEntries(roles.map((r) => [r, getRolePermissions(r)]));
    expect(m.admin.canAccessScalingSuggestion && m.admin.canEditScalingSuggestion).toBe(true);
    expect(m.production.canAccessScalingSuggestion && m.production.canEditScalingSuggestion).toBe(true);
    expect(m.purchasing.canAccessScalingSuggestion).toBe(true);
    expect(m.purchasing.canEditScalingSuggestion).toBe(false);
    expect(m.financial.canAccessScalingSuggestion).toBe(true);
    expect(m.financial.canEditScalingSuggestion).toBe(false);
    expect(m.function_area.canAccessScalingSuggestion).toBe(false);
    expect(m.function_area.canEditScalingSuggestion).toBe(false);
  });

  it("Validação: todos entram; admin e function_area editam", () => {
    for (const r of roles) expect(getRolePermissions(r).canAccessScalingValidation).toBe(true);
    expect(getRolePermissions("admin").canEditScalingValidation).toBe(true);
    expect(getRolePermissions("function_area").canEditScalingValidation).toBe(true);
    for (const r of ["production", "purchasing", "financial"] as UserRole[]) {
      expect(getRolePermissions(r).canEditScalingValidation).toBe(false);
    }
  });

  it("Aprovação: admin/production/purchasing editam; financial e function_area só acompanham", () => {
    for (const r of ["admin", "production", "purchasing"] as UserRole[]) {
      expect(getRolePermissions(r).canAccessScalingApproval).toBe(true);
      expect(getRolePermissions(r).canEditScalingApproval).toBe(true);
    }
    // financial: o GET do servidor aceita o papel (leitura da fila inteira).
    expect(getRolePermissions("financial").canAccessScalingApproval).toBe(true);
    expect(getRolePermissions("financial").canEditScalingApproval).toBe(false);
    // function_area: entra pelo fallback do APROVADOR do servidor (fila filtrada
    // às funções em que é aprovador); sem ser aprovador de nada, leva 403.
    expect(getRolePermissions("function_area").canAccessScalingApproval).toBe(true);
    expect(getRolePermissions("function_area").canEditScalingApproval).toBe(false);
  });

  it("Aprovação: todo papel do módulo entra na tela (o servidor filtra ou nega)", () => {
    for (const r of roles) expect(getRolePermissions(r).canAccessScalingApproval).toBe(true);
  });

  it("Histórico da Escala: todos os perfis veem", () => {
    for (const r of roles) expect(getRolePermissions(r).canAccessScalingEventView).toBe(true);
  });

  it("edit implica access em todas as telas do módulo", () => {
    for (const r of roles) {
      const p = getRolePermissions(r);
      if (p.canEditScalingSuggestion) expect(p.canAccessScalingSuggestion).toBe(true);
      if (p.canEditScalingValidation) expect(p.canAccessScalingValidation).toBe(true);
      if (p.canEditScalingApproval) expect(p.canAccessScalingApproval).toBe(true);
    }
  });

  it("perfil desconhecido não acessa nada do módulo", () => {
    const p = getRolePermissions("qualquer" as UserRole);
    expect(p.canAccessScalingSuggestion).toBe(false);
    expect(p.canAccessScalingValidation).toBe(false);
    expect(p.canAccessScalingApproval).toBe(false);
    expect(p.canAccessScalingEventView).toBe(false);
  });
});
