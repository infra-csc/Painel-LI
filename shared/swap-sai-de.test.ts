import { describe, it, expect } from "vitest";
import { SAI_DE_SP, cidadeDeSaida, validarSaiDe, validarSaiDeOpcional } from "./swap-sai-de";

describe("Sai de na troca de colaborador (14/09)", () => {
  it("SP marcado grava o texto padrão; senão, a cidade digitada sem espaços sobrando", () => {
    expect(cidadeDeSaida(true, "qualquer")).toBe(SAI_DE_SP);
    expect(cidadeDeSaida(false, "  Rio de Janeiro - RJ ")).toBe("Rio de Janeiro - RJ");
    expect(cidadeDeSaida(false, null)).toBe("");
  });

  it("exige uma cidade de verdade", () => {
    expect(validarSaiDe(SAI_DE_SP)).toBeNull();
    expect(validarSaiDe("Palmas - TO")).toBeNull();
    expect(validarSaiDe("")).toMatch(/Informe de onde/);
    expect(validarSaiDe("   ")).toMatch(/Informe de onde/);
    expect(validarSaiDe(null)).toMatch(/Informe de onde/);
    expect(validarSaiDe("x".repeat(121))).toMatch(/muito longa/);
  });
});

describe("Sai de opcional na Sugestão e nos pedidos (09/10)", () => {
  it("vazio vale; preenchido segue a mesma régua", () => {
    expect(validarSaiDeOpcional("")).toBeNull();
    expect(validarSaiDeOpcional("   ")).toBeNull();
    expect(validarSaiDeOpcional(null)).toBeNull();
    expect(validarSaiDeOpcional(undefined)).toBeNull();
    expect(validarSaiDeOpcional(SAI_DE_SP)).toBeNull();
    expect(validarSaiDeOpcional(" Belo Horizonte - MG ")).toBeNull();
    expect(validarSaiDeOpcional("R")).toMatch(/muito curta/);
    expect(validarSaiDeOpcional("x".repeat(121))).toMatch(/muito longa/);
  });
});
