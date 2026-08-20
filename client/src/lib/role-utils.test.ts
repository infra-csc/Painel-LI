import { describe, it, expect } from "vitest";
import { getRolePermissions, type UserRole } from "./role-utils";

/**
 * Módulo Validação de Escala.
 *
 * LIBERAÇÃO ATUAL (decisão do usuário, 19/08): as 4 telas aparecem SÓ PARA
 * ADMIN enquanto o fluxo é testado. A matriz do briefing §7 (produção edita a
 * Sugestão, área valida as funções dela, etc.) continua documentada em
 * role-utils.ts para quando a liberação for ampliada — quando isso acontecer,
 * estes testes voltam a distinguir papel a papel.
 */
describe("getRolePermissions — módulo Validação de Escala", () => {
  const roles: UserRole[] = ["admin", "production", "function_area", "purchasing", "financial"];
  const outrosPapeis = roles.filter((r) => r !== "admin");

  it("admin entra e edita as 4 telas", () => {
    const p = getRolePermissions("admin");
    expect(p.canAccessScalingSuggestion && p.canEditScalingSuggestion).toBe(true);
    expect(p.canAccessScalingValidation && p.canEditScalingValidation).toBe(true);
    expect(p.canAccessScalingApproval && p.canEditScalingApproval).toBe(true);
    expect(p.canAccessScalingEventView).toBe(true);
  });

  it("nenhum outro papel vê o módulo (menu nem rota)", () => {
    for (const r of outrosPapeis) {
      const p = getRolePermissions(r);
      expect(p.canAccessScalingSuggestion).toBe(false);
      expect(p.canAccessScalingValidation).toBe(false);
      expect(p.canAccessScalingApproval).toBe(false);
      expect(p.canAccessScalingEventView).toBe(false);
    }
  });

  it("sem acesso não há edição", () => {
    for (const r of outrosPapeis) {
      const p = getRolePermissions(r);
      expect(p.canEditScalingSuggestion).toBe(false);
      expect(p.canEditScalingValidation).toBe(false);
      expect(p.canEditScalingApproval).toBe(false);
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

  it("perfil desconhecido não acessa nada do módulo", () => {
    const p = getRolePermissions("qualquer" as UserRole);
    expect(p.canAccessScalingSuggestion).toBe(false);
    expect(p.canAccessScalingValidation).toBe(false);
    expect(p.canAccessScalingApproval).toBe(false);
    expect(p.canAccessScalingEventView).toBe(false);
  });
});
