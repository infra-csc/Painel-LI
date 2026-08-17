import { describe, it, expect } from "vitest";
import { parseBrNumber } from "./utils";

describe("parseBrNumber (entrada monetária pt-BR)", () => {
  it("vírgula é o separador decimal", () => {
    expect(parseBrNumber("40,50")).toBe(40.5);
    expect(parseBrNumber("0,01")).toBe(0.01);
  });

  it("ponto de milhar + vírgula decimal (o bug clássico: 1.500,00 virava 1,50)", () => {
    expect(parseBrNumber("1.500,00")).toBe(1500);
    expect(parseBrNumber("1.234,56")).toBe(1234.56);
    expect(parseBrNumber("12.345.678,90")).toBe(12345678.9);
  });

  it("sem vírgula, o ponto continua decimal (teclado numérico)", () => {
    expect(parseBrNumber("1234.56")).toBe(1234.56);
    expect(parseBrNumber("40.5")).toBe(40.5);
    expect(parseBrNumber("1.5")).toBe(1.5);
  });

  it("sem vírgula, ponto agrupando 3 dígitos é separador de milhar", () => {
    expect(parseBrNumber("1.500")).toBe(1500);
    expect(parseBrNumber("1.500.000")).toBe(1500000);
  });

  it("casos de referência do formato monetário pt-BR", () => {
    expect(parseBrNumber("1.500,00")).toBe(1500);
    expect(parseBrNumber("1500")).toBe(1500);
    expect(parseBrNumber("0,5")).toBe(0.5);
    expect(parseBrNumber("540,50")).toBe(540.5);
  });

  it("números já numéricos passam direto", () => {
    expect(parseBrNumber(1500)).toBe(1500);
    expect(parseBrNumber(NaN)).toBe(0);
  });

  it("vazio e lixo viram 0", () => {
    expect(parseBrNumber("")).toBe(0);
    expect(parseBrNumber("  ")).toBe(0);
    expect(parseBrNumber("abc")).toBe(0);
    expect(parseBrNumber(null)).toBe(0);
    expect(parseBrNumber(undefined)).toBe(0);
  });
});
