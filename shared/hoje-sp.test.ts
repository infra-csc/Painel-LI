import { describe, it, expect } from "vitest";
import { hojeISO, FUSO_DA_OPERACAO } from "./hoje-sp";

describe("hojeISO — a data de negócio é a de São Paulo", () => {
  it("às 23h de Brasília ainda é o mesmo dia (em UTC já seria o seguinte)", () => {
    const agora = new Date("2026-09-23T02:30:00.000Z"); // 22/09 23:30 em SP (UTC-3)
    expect(agora.toISOString().slice(0, 10)).toBe("2026-09-23");
    expect(hojeISO(FUSO_DA_OPERACAO, agora)).toBe("2026-09-22");
  });

  it("de madrugada em SP, o dia já virou", () => {
    const agora = new Date("2026-09-23T03:00:00.000Z"); // 23/09 00:00 em SP
    expect(hojeISO(undefined, agora)).toBe("2026-09-23");
  });

  it("formato sempre YYYY-MM-DD com zeros à esquerda", () => {
    expect(hojeISO(FUSO_DA_OPERACAO, new Date("2026-01-05T15:00:00.000Z"))).toBe("2026-01-05");
  });

  it("aceita outro fuso", () => {
    const agora = new Date("2026-09-23T02:30:00.000Z");
    expect(hojeISO("UTC", agora)).toBe("2026-09-23");
    expect(hojeISO("Asia/Tokyo", agora)).toBe("2026-09-23");
    expect(hojeISO("America/Los_Angeles", agora)).toBe("2026-09-22");
  });
});
