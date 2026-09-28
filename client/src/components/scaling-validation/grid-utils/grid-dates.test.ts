import { describe, it, expect } from "vitest";
import {
  buildDateList, buildReadDateList, countDaysInclusive, expandPeriodForDates, MAX_GRID_DAYS, MAX_READ_DAYS, periodBounds, periodProblem,
} from "./grid-dates";

const DATES = ["2026-09-10", "2026-09-11", "2026-09-12"];

describe("buildDateList", () => {
  it("lista inclusiva em horário local", () => {
    expect(buildDateList("2026-09-10", "2026-09-12")).toEqual(DATES);
  });
  it("vazia quando o período é inválido ou parcial", () => {
    expect(buildDateList("2026-09-12", "2026-09-10")).toEqual([]);
    expect(buildDateList("", "2026-09-10")).toEqual([]);
    expect(buildDateList("2026-09", "2026-09-10")).toEqual([]);
  });
  it("respeita o teto de dias (acima retorna [])", () => {
    expect(buildDateList("2026-01-01", "2026-03-31")).toHaveLength(MAX_GRID_DAYS); // 90 dias
    expect(buildDateList("2026-01-01", "2026-04-01")).toEqual([]);
  });
  it("o teto é configurável por opção (o default continua sendo o da grade)", () => {
    expect(buildDateList("2026-01-01", "2026-04-01", { maxDays: 200 })).toHaveLength(91);
    expect(buildDateList("2026-01-01", "2026-04-01", { maxDays: Infinity })).toHaveLength(91);
    expect(buildDateList("2026-09-10", "2026-09-12", { maxDays: 2 })).toEqual([]);
  });
});

describe("countDaysInclusive", () => {
  it("conta os dois extremos e devolve 0 em período inválido", () => {
    expect(countDaysInclusive("2026-09-10", "2026-09-12")).toBe(3);
    expect(countDaysInclusive("2026-09-10", "2026-09-10")).toBe(1);
    expect(countDaysInclusive("2026-01-01", "2026-12-31")).toBe(365);
    expect(countDaysInclusive("2026-09-12", "2026-09-10")).toBe(0);
    expect(countDaysInclusive("", "2026-09-10")).toBe(0);
  });
});

describe("buildReadDateList (leitura: quadro da Escala e CSV)", () => {
  it("período curto: mesma lista da grade, sem truncar", () => {
    expect(buildReadDateList("2026-09-10", "2026-09-12")).toEqual({ dates: DATES, totalDays: 3, truncated: false });
  });
  it("acima do teto da GRADE a leitura continua mostrando os dias (o quadro não fica sem colunas)", () => {
    const r = buildReadDateList("2026-01-01", "2026-04-01"); // 91 dias
    expect(r.dates).toHaveLength(91);
    expect(r.truncated).toBe(false);
    expect(buildDateList("2026-01-01", "2026-04-01")).toEqual([]); // a grade de sugestão segue protegida
  });
  it("acima do teto de leitura trunca no início do período e avisa", () => {
    const r = buildReadDateList("2026-01-01", "2026-09-30", 30);
    expect(r.dates).toHaveLength(30);
    expect(r.dates[0]).toBe("2026-01-01");
    expect(r.dates[29]).toBe("2026-01-30");
    expect(r.totalDays).toBe(countDaysInclusive("2026-01-01", "2026-09-30"));
    expect(r.truncated).toBe(true);
  });
  it("teto padrão de leitura: evento de 2 anos trunca em MAX_READ_DAYS", () => {
    const r = buildReadDateList("2026-01-01", "2027-12-31");
    expect(r.dates).toHaveLength(MAX_READ_DAYS);
    expect(r.totalDays).toBe(730);
    expect(r.truncated).toBe(true);
  });
  it("Infinity não trunca", () => {
    const r = buildReadDateList("2026-01-01", "2027-12-31", Infinity);
    expect(r.dates).toHaveLength(730);
    expect(r.truncated).toBe(false);
  });
  it("período inválido continua vazio, sem truncamento", () => {
    expect(buildReadDateList("2026-09-12", "2026-09-10")).toEqual({ dates: [], totalDays: 0, truncated: false });
    expect(buildReadDateList("", "2026-09-10")).toEqual({ dates: [], totalDays: 0, truncated: false });
  });
});

describe("periodProblem / periodBounds", () => {
  it("classifica período incompleto, invertido, longo e ok", () => {
    expect(periodProblem("", "2026-09-10")).toBe("incompleto");
    expect(periodProblem("2026-09-12", "2026-09-10")).toBe("invertido");
    expect(periodProblem("2026-01-01", "2026-12-31")).toBe("longo");
    expect(periodProblem("2026-09-10", "2026-09-12")).toBeNull();
  });
  it("limites = evento ± 7 dias", () => {
    expect(periodBounds("2026-09-10", "2026-09-12")).toEqual({ min: "2026-09-03", max: "2026-09-19" });
    expect(periodBounds("", "")).toEqual({ min: "", max: "" });
  });
});

describe("expandPeriodForDates (ampliar a grade para cobrir os dias da planilha)", () => {
  const bounds = periodBounds("2026-09-10", "2026-09-13"); // 03/09 a 20/09
  it("amplia até cobrir os dias de fora", () => {
    const r = expandPeriodForDates({ start: "2026-09-10", end: "2026-09-13" }, ["2026-09-08", "2026-09-14"], bounds);
    expect(r).toEqual({ start: "2026-09-08", end: "2026-09-14", changed: true, covered: ["2026-09-08", "2026-09-14"], ignored: [] });
  });
  it("o que passa do limite evento ± 7 dias fica de fora e é informado", () => {
    const r = expandPeriodForDates({ start: "2026-09-10", end: "2026-09-13" }, ["2026-09-09", "2026-10-30"], bounds);
    expect(r.start).toBe("2026-09-09");
    expect(r.end).toBe("2026-09-13");
    expect(r.covered).toEqual(["2026-09-09"]);
    expect(r.ignored).toEqual(["2026-10-30"]);
  });
  it("sem dias de fora (ou com período inválido) nada muda", () => {
    expect(expandPeriodForDates({ start: "2026-09-10", end: "2026-09-13" }, [], bounds).changed).toBe(false);
    const invalido = expandPeriodForDates({ start: "2026-09-13", end: "2026-09-10" }, ["2026-09-08"], bounds);
    expect(invalido).toEqual({ start: "2026-09-13", end: "2026-09-10", changed: false, covered: [], ignored: ["2026-09-08"] });
  });
  it("se o resultado estourar o teto de dias da grade, nada é ampliado", () => {
    const semLimite = { min: "", max: "" };
    const r = expandPeriodForDates({ start: "2026-09-10", end: "2026-09-13" }, ["2027-09-10"], semLimite);
    expect(r.changed).toBe(false);
    expect(r.ignored).toEqual(["2027-09-10"]);
  });
});
