import { describe, it, expect } from "vitest";
import { normalizeRole, isFinanceRole, hasRoleIn, ROLE_GROUPS, ehPerfilHonorarios, podeLiberarHonorarios, PAPEIS_CANONICOS } from "./roles";

describe("normalizeRole", () => {
  it("papéis canônicos passam direto", () => {
    expect(normalizeRole("admin")).toBe("admin");
    expect(normalizeRole("financial")).toBe("financial");
    expect(normalizeRole("production")).toBe("production");
  });

  it("aliases legados são normalizados (o servidor comparava string literal)", () => {
    expect(normalizeRole("administrador")).toBe("admin");
    expect(normalizeRole("administrator")).toBe("admin");
    expect(normalizeRole("financeiro")).toBe("financial");
    expect(normalizeRole("finance")).toBe("financial");
    // 26/10: o rótulo novo e o que o Portal manda
    expect(normalizeRole("Financeiro / DP")).toBe("financial");
    expect(normalizeRole("Financeiro / RH")).toBe("financial");
    // Sigla solta não vira papel (27/10): "rh"/"dp" gravado à mão não ganha o financeiro.
    expect(normalizeRole("DP")).toBeNull();
    expect(normalizeRole("rh")).toBeNull();
    expect(normalizeRole("logistica")).toBe("production");
    expect(normalizeRole("compras")).toBe("purchasing");
  });

  it("caixa e espaços não importam", () => {
    expect(normalizeRole(" Administrador ")).toBe("admin");
    expect(normalizeRole("FINANCEIRO")).toBe("financial");
  });

  it("papel desconhecido/vazio vira null", () => {
    expect(normalizeRole("hacker")).toBeNull();
    expect(normalizeRole("")).toBeNull();
    expect(normalizeRole(null)).toBeNull();
    expect(normalizeRole(undefined)).toBeNull();
  });
});

describe("isFinanceRole", () => {
  it("admin e DP (com aliases) decidem no financeiro", () => {
    expect(isFinanceRole("admin")).toBe(true);
    expect(isFinanceRole("administrador")).toBe(true);
    expect(isFinanceRole("financial")).toBe(true);
    expect(isFinanceRole("financeiro")).toBe(true);
  });

  it("demais papéis não", () => {
    expect(isFinanceRole("production")).toBe(false);
    expect(isFinanceRole("purchasing")).toBe(false);
    expect(isFinanceRole(null)).toBe(false);
  });
});

describe("hasRoleIn (grupos de autorização do servidor)", () => {
  it("cadastro: admin, compras e logística — não DP nem área de função", () => {
    expect(hasRoleIn("admin", ROLE_GROUPS.cadastro)).toBe(true);
    expect(hasRoleIn("purchasing", ROLE_GROUPS.cadastro)).toBe(true);
    expect(hasRoleIn("production", ROLE_GROUPS.cadastro)).toBe(true);
    expect(hasRoleIn("financial", ROLE_GROUPS.cadastro)).toBe(false);
    expect(hasRoleIn("function_area", ROLE_GROUPS.cadastro)).toBe(false);
  });

  it("financeiro: só admin e DP", () => {
    expect(hasRoleIn("admin", ROLE_GROUPS.financeiro)).toBe(true);
    expect(hasRoleIn("financial", ROLE_GROUPS.financeiro)).toBe(true);
    expect(hasRoleIn("production", ROLE_GROUPS.financeiro)).toBe(false);
    expect(hasRoleIn("purchasing", ROLE_GROUPS.financeiro)).toBe(false);
  });

  it("aceita aliases legados nos grupos (a falha que dava 403 indevido)", () => {
    expect(hasRoleIn("financeiro", ROLE_GROUPS.financeiro)).toBe(true);
    expect(hasRoleIn("administrador", ROLE_GROUPS.cadastro)).toBe(true);
    expect(hasRoleIn("compras", ROLE_GROUPS.logistica)).toBe(true);
    expect(hasRoleIn("logistica", ROLE_GROUPS.logistica)).toBe(true);
  });

  it("papel desconhecido nunca entra em grupo nenhum", () => {
    for (const g of Object.values(ROLE_GROUPS)) {
      expect(hasRoleIn("hacker", g)).toBe(false);
      expect(hasRoleIn(null, g)).toBe(false);
      expect(hasRoleIn("", g)).toBe(false);
    }
  });
});

describe("perfil Honorários (liberação) — 23/10", () => {
  it("o nome exato do Portal e a chave gravada viram `honorarios` (caixa, acentos e espaços não importam)", () => {
    expect(normalizeRole("Honorários (liberação)")).toBe("honorarios");
    expect(normalizeRole("  HONORÁRIOS (LIBERAÇÃO) ")).toBe("honorarios");
    expect(normalizeRole("honorarios (liberacao)")).toBe("honorarios");
    expect(normalizeRole("Honorários  (liberação)")).toBe("honorarios");
    expect(normalizeRole("honorarios")).toBe("honorarios");
    expect(PAPEIS_CANONICOS).toContain("honorarios");
  });

  it("só libera honorário: não é papel financeiro nem entra em grupo nenhum", () => {
    expect(ehPerfilHonorarios("Honorários (liberação)")).toBe(true);
    expect(ehPerfilHonorarios("financial")).toBe(false);
    expect(podeLiberarHonorarios("honorarios")).toBe(true);
    expect(podeLiberarHonorarios("financial")).toBe(true);
    expect(podeLiberarHonorarios("admin")).toBe(true);
    expect(podeLiberarHonorarios("production")).toBe(false);
    expect(isFinanceRole("honorarios")).toBe(false);
    for (const g of Object.values(ROLE_GROUPS)) expect(hasRoleIn("honorarios", g)).toBe(false);
  });

  it("os acentos nos papéis antigos seguem valendo como antes", () => {
    expect(normalizeRole("Financeiro")).toBe("financial");
    expect(normalizeRole("Logística")).toBe("production");
    expect(normalizeRole("Área de Função")).toBeNull();
  });
});
