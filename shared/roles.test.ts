import { describe, it, expect } from "vitest";
import { normalizeRole, isFinanceRole } from "./roles";

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
  it("admin e RH (com aliases) decidem no financeiro", () => {
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
