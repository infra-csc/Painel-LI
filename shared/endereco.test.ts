import { describe, it, expect } from "vitest";
import { CEP_INVALIDO, enderecoEmUmaLinha, formatarCep, normalizarEndereco } from "./endereco";

describe("endereço do colaborador (22/09)", () => {
  it("CEP sai sempre como 00000-000; vazio é vazio; dígitos errados é inválido", () => {
    expect(formatarCep("01234567")).toBe("01234-567");
    expect(formatarCep("01.234-567")).toBe("01234-567");
    expect(formatarCep(" ")).toBe("");
    expect(formatarCep(null)).toBe("");
    expect(formatarCep("1234")).toBeNull();
  });

  it("normaliza só o que veio; em branco vira null; espaços somem", () => {
    expect(normalizarEndereco({ addressStreet: "  Rua  das Flores ", addressNumber: "", addressZip: "01234567", fullName: "X" }))
      .toEqual({ campos: { addressStreet: "Rua das Flores", addressNumber: null, addressZip: "01234-567" } });
    expect(normalizarEndereco({ fullName: "X" })).toEqual({ campos: {} });
    expect(normalizarEndereco({ addressZip: "" })).toEqual({ campos: { addressZip: null } });
  });

  it("CEP com número de dígitos errado é recusado com mensagem clara", () => {
    expect(normalizarEndereco({ addressZip: "123" })).toEqual({ erro: CEP_INVALIDO });
  });

  it("linha de exibição junta o que existir", () => {
    expect(enderecoEmUmaLinha({ addressStreet: "Rua das Flores", addressNumber: "123", addressComplement: "Apto 4" })).toBe("Rua das Flores, 123 — Apto 4");
    expect(enderecoEmUmaLinha({ addressStreet: "Rua das Flores" })).toBe("Rua das Flores");
    expect(enderecoEmUmaLinha({ addressComplement: "Fundos" })).toBe("Fundos");
    expect(enderecoEmUmaLinha({})).toBe("");
  });
});
