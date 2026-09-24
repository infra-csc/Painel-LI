import { describe, it, expect } from "vitest";
import { VALIDATION_NOTE_MAX, normalizeValidationNote, validationNoteRemaining } from "./validation-note";

describe("observação da validação", () => {
  it("apara espaços e devolve null quando não há nada a dizer", () => {
    expect(normalizeValidationNote("  ")).toBeNull();
    expect(normalizeValidationNote("")).toBeNull();
    expect(normalizeValidationNote(null)).toBeNull();
    expect(normalizeValidationNote(undefined)).toBeNull();
    expect(normalizeValidationNote("\n  chegar às 6h \n")).toBe("chegar às 6h");
  });

  it("preserva quebras de linha internas (o aprovador lê como foi escrito)", () => {
    expect(normalizeValidationNote("linha 1\nlinha 2")).toBe("linha 1\nlinha 2");
  });

  it("contador nunca fica negativo e segue o mesmo teto do servidor (1000)", () => {
    expect(VALIDATION_NOTE_MAX).toBe(1000);
    expect(validationNoteRemaining("")).toBe(1000);
    expect(validationNoteRemaining("abc")).toBe(997);
    expect(validationNoteRemaining("x".repeat(1200))).toBe(0);
  });
});
