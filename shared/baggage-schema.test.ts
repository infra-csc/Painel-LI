import { describe, it, expect } from "vitest";
import { insertBaggageRequestSchema } from "./schema";

describe("insertBaggageRequestSchema (Controle de Bagagem)", () => {
  const base = {
    eventId: "ev-1",
    collaboratorId: "col-1",
    loc: "ABC123",
    cia: "Azul",
    valueCents: 12000,
    os: "OS-42",
    quantity: 1,
    agency: "LCA",
    requestDate: "2026-08-17",
    boardingDate: "2026-08-20",
  };

  it("aceita uma solicitação válida", () => {
    const r = insertBaggageRequestSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it("aceita valor zero (bagagem cortesia) e notes opcional/nulo", () => {
    expect(insertBaggageRequestSchema.safeParse({ ...base, valueCents: 0 }).success).toBe(true);
    expect(insertBaggageRequestSchema.safeParse({ ...base, notes: null }).success).toBe(true);
    expect(insertBaggageRequestSchema.safeParse({ ...base, notes: "extra" }).success).toBe(true);
  });

  it("aceita embarque no MESMO dia da solicitação", () => {
    const r = insertBaggageRequestSchema.safeParse({ ...base, boardingDate: base.requestDate });
    expect(r.success).toBe(true);
  });

  it("REJEITA valor negativo e valor não inteiro (centavos)", () => {
    expect(insertBaggageRequestSchema.safeParse({ ...base, valueCents: -1 }).success).toBe(false);
    expect(insertBaggageRequestSchema.safeParse({ ...base, valueCents: 120.5 }).success).toBe(false);
  });

  it("REJEITA quantidade menor que 1 ou não inteira", () => {
    expect(insertBaggageRequestSchema.safeParse({ ...base, quantity: 0 }).success).toBe(false);
    expect(insertBaggageRequestSchema.safeParse({ ...base, quantity: -2 }).success).toBe(false);
    expect(insertBaggageRequestSchema.safeParse({ ...base, quantity: 1.5 }).success).toBe(false);
  });

  it("REJEITA embarque anterior à solicitação", () => {
    const r = insertBaggageRequestSchema.safeParse({ ...base, boardingDate: "2026-08-16" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some(i => i.path.includes("boardingDate"))).toBe(true);
    }
  });

  it("REJEITA campos obrigatórios vazios (loc, cia, os, agency)", () => {
    for (const field of ["loc", "cia", "os", "agency"] as const) {
      expect(insertBaggageRequestSchema.safeParse({ ...base, [field]: "" }).success).toBe(false);
      expect(insertBaggageRequestSchema.safeParse({ ...base, [field]: "   " }).success).toBe(false);
    }
  });

  it("REJEITA datas fora do formato YYYY-MM-DD", () => {
    expect(insertBaggageRequestSchema.safeParse({ ...base, requestDate: "17/08/2026" }).success).toBe(false);
    expect(insertBaggageRequestSchema.safeParse({ ...base, boardingDate: "2026-8-2" }).success).toBe(false);
  });

  it("descarta identidade e soft delete vindos do corpo (mass assignment)", () => {
    const r = insertBaggageRequestSchema.parse({
      ...base,
      createdBy: "hacker", createdByName: "Hacker",
      deletedAt: new Date(), deletedBy: "hacker", id: "forjado",
    } as any);
    expect((r as any).createdBy).toBeUndefined();
    expect((r as any).createdByName).toBeUndefined();
    expect((r as any).deletedAt).toBeUndefined();
    expect((r as any).deletedBy).toBeUndefined();
    expect((r as any).id).toBeUndefined();
  });
});
