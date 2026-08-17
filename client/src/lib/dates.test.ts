import { describe, it, expect } from "vitest";
import { parseLocalDate, formatDateBr, formatDateRange, todayIso, toIsoDate, formatDayMonthBr } from "./dates";

describe("parseLocalDate", () => {
  it("YYYY-MM-DD vira Date local à meia-noite (sem off-by-one)", () => {
    const d = parseLocalDate("2026-08-17")!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(17);
    expect(d.getHours()).toBe(0);
  });

  it("ignora a parte de hora/UTC de um ISO completo", () => {
    // new Date("2026-08-17T00:00:00.000Z") em Brasília seria 16/08 — aqui não.
    const d = parseLocalDate("2026-08-17T00:00:00.000Z")!;
    expect(d.getDate()).toBe(17);
    expect(d.getMonth()).toBe(7);
  });

  it("primeiro e último dia do ano/mês", () => {
    expect(parseLocalDate("2026-01-01")!.getDate()).toBe(1);
    expect(parseLocalDate("2026-01-01")!.getMonth()).toBe(0);
    expect(parseLocalDate("2026-12-31")!.getDate()).toBe(31);
    expect(parseLocalDate("2026-12-31")!.getMonth()).toBe(11);
  });

  it("vazio / inválido → null; Date válido passa direto", () => {
    expect(parseLocalDate("")).toBeNull();
    expect(parseLocalDate(null)).toBeNull();
    expect(parseLocalDate(undefined)).toBeNull();
    expect(parseLocalDate("não é data")).toBeNull();
    const d = new Date(2026, 7, 17);
    expect(parseLocalDate(d)).toBe(d);
    expect(parseLocalDate(new Date("x"))).toBeNull();
  });
});

describe("formatDateBr", () => {
  it("YYYY-MM-DD → dd/mm/aaaa por string", () => {
    expect(formatDateBr("2026-08-17")).toBe("17/08/2026");
    expect(formatDateBr("2026-01-01")).toBe("01/01/2026");
  });
  it("ISO com hora UTC não desloca o dia", () => {
    expect(formatDateBr("2026-08-17T00:00:00.000Z")).toBe("17/08/2026");
    expect(formatDateBr("2026-08-17T03:00:00Z")).toBe("17/08/2026");
  });
  it("aceita Date local", () => {
    expect(formatDateBr(new Date(2026, 7, 17))).toBe("17/08/2026");
  });
  it("vazio → '' e texto não-ISO volta como veio", () => {
    expect(formatDateBr("")).toBe("");
    expect(formatDateBr(null)).toBe("");
    expect(formatDateBr(undefined)).toBe("");
    expect(formatDateBr("sem data")).toBe("sem data");
  });
  it("formatDayMonthBr → dd/mm", () => {
    expect(formatDayMonthBr("2026-08-17")).toBe("17/08");
  });
});

describe("formatDateRange", () => {
  it("intervalo compacto dd/mm – dd/mm", () => {
    expect(formatDateRange("2026-08-17", "2026-08-20")).toBe("17/08 – 20/08");
  });
  it("mesmo dia mostra uma vez; sem fim mostra só o início; sem início '–'", () => {
    expect(formatDateRange("2026-08-17", "2026-08-17")).toBe("17/08");
    expect(formatDateRange("2026-08-17", null)).toBe("17/08");
    expect(formatDateRange(null, "2026-08-17")).toBe("–");
    expect(formatDateRange(undefined, undefined)).toBe("–");
  });
  it("com ano", () => {
    expect(formatDateRange("2026-08-17", "2026-08-20", { withYear: true })).toBe("17/08/2026 – 20/08/2026");
  });
});

describe("todayIso / toIsoDate", () => {
  it("toIsoDate usa horário local, não UTC", () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
    // 23:59 local em 31/12 continua sendo 31/12 (toISOString poderia virar 01/01 em UTC)
    expect(toIsoDate(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });
  it("todayIso tem o formato YYYY-MM-DD e bate com a data local", () => {
    const iso = todayIso();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(iso).toBe(toIsoDate(new Date()));
  });
});
