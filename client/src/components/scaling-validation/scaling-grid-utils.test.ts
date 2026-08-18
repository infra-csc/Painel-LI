import { describe, it, expect } from "vitest";
import {
  buildDateList, decomposeGridRows, emptyGridRow, parsePastedRows, parseShortDate,
  parseTimeHHMM, parseTransportMode, reframeRows, validateGridRow, normalizeStr,
} from "./scaling-grid-utils";

const DATES = ["2026-09-10", "2026-09-11", "2026-09-12"];

describe("buildDateList", () => {
  it("lista inclusiva em horário local", () => {
    expect(buildDateList("2026-09-10", "2026-09-12")).toEqual(DATES);
  });
  it("vazia quando o período é inválido", () => {
    expect(buildDateList("2026-09-12", "2026-09-10")).toEqual([]);
    expect(buildDateList("", "2026-09-10")).toEqual([]);
  });
});

describe("decomposeGridRows (1 registro por pessoa)", () => {
  it("2,1,2 vira 2 pessoas: uma nos 3 dias e outra só nos dias 1 e 3", () => {
    const row = emptyGridRow("f1", "Kit", DATES, "r1");
    row.quantities = { "2026-09-10": 2, "2026-09-11": 1, "2026-09-12": 2 };
    row.transportModeIda = "aereo";
    row.needsTicket = true;
    const recs = decomposeGridRows([row], DATES);
    expect(recs).toHaveLength(2);
    expect(recs[0].workDays).toEqual(DATES);
    expect(recs[0].dailyRates).toBe(3);
    expect(recs[1].workDays).toEqual(["2026-09-10", "2026-09-12"]);
    expect(recs[1].dailyRates).toBe(2);
    expect(recs[1].transportModeIda).toBe("aereo");
    expect(recs[1].needsTicket).toBe(true);
    expect(recs[1].observations).toBeNull();
  });
  it("2|2|1|3 em 4 dias vira 3 pessoas: P1 4 dias, P2 dias 1,2,4 (3 diárias), P3 só dia 4 (1 diária)", () => {
    const D4 = ["2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13"];
    const row = emptyGridRow("f1", "Kit", D4, "r1");
    row.quantities = { "2026-09-10": 2, "2026-09-11": 2, "2026-09-12": 1, "2026-09-13": 3 };
    const recs = decomposeGridRows([row], D4);
    expect(recs).toHaveLength(3);
    expect(recs[0].workDays).toEqual(D4);
    expect(recs[0].dailyRates).toBe(4);
    expect(recs[1].workDays).toEqual(["2026-09-10", "2026-09-11", "2026-09-13"]);
    expect(recs[1].dailyRates).toBe(3);
    expect(recs[2].workDays).toEqual(["2026-09-13"]);
    expect(recs[2].dailyRates).toBe(1);
    // rowOrder = índice da linha na grade (todas as pessoas da mesma linha compartilham)
    expect(recs.map((r) => r.rowOrder)).toEqual([0, 0, 0]);
  });
  it("rowOrder segue a posição da linha na grade, mesmo com função repetida", () => {
    const a = emptyGridRow("f1", "Kit", DATES, "a");
    a.quantities = { "2026-09-10": 1 };
    const vazia = emptyGridRow("f2", "Vazia", DATES, "b");
    const c = emptyGridRow("f1", "Kit", DATES, "c");
    c.quantities = { "2026-09-12": 2 };
    const recs = decomposeGridRows([a, vazia, c], DATES);
    expect(recs.map((r) => [r.functionId, r.rowOrder, r.dailyRates])).toEqual([["f1", 0, 1], ["f1", 2, 1], ["f1", 2, 1]]);
  });
  it("linha sem quantidade não gera registro", () => {
    expect(decomposeGridRows([emptyGridRow("f1", "Kit", DATES)], DATES)).toEqual([]);
  });
});

describe("reframeRows", () => {
  it("mantém dias que continuam e descarta os que saíram", () => {
    const row = emptyGridRow("f1", "Kit", DATES, "r1");
    row.quantities = { "2026-09-10": 1, "2026-09-11": 2, "2026-09-12": 3 };
    const [r] = reframeRows([row], ["2026-09-11", "2026-09-12", "2026-09-13"]);
    expect(r.quantities).toEqual({ "2026-09-11": 2, "2026-09-12": 3, "2026-09-13": 0 });
  });
});

describe("parsers de colagem", () => {
  it("parseShortDate aceita dd/mmm, dd/mm, dd/mm/aa e ISO", () => {
    expect(parseShortDate("15/nov", "2026")).toBe("2026-11-15");
    expect(parseShortDate("5/11", "2026")).toBe("2026-11-05");
    expect(parseShortDate("15/11/25", "2026")).toBe("2025-11-15");
    expect(parseShortDate("2026-11-15", "2026")).toBe("2026-11-15");
    expect(parseShortDate("abc", "2026")).toBe("");
  });
  it("parseTimeHHMM normaliza 14h30 / 14:30 / 1430 / 9", () => {
    expect(parseTimeHHMM("14h30")).toBe("14:30");
    expect(parseTimeHHMM("14:30")).toBe("14:30");
    expect(parseTimeHHMM("1430")).toBe("14:30");
    expect(parseTimeHHMM("9")).toBe("09:00");
    expect(parseTimeHHMM("25:00")).toBe("");
  });
  it("parseTransportMode aceita rótulos e sinônimos", () => {
    expect(parseTransportMode("Aéreo")).toBe("aereo");
    expect(parseTransportMode("ônibus")).toBe("onibus");
    expect(parseTransportMode("Traslado")).toBe("transfer");
    expect(parseTransportMode("foguete")).toBe("");
  });
  it("normalizeStr remove acentos e caixa", () => {
    expect(normalizeStr("  Produção ")).toBe("producao");
  });
  it("parsePastedRows monta linhas e acumula funções desconhecidas", () => {
    const text = [
      ["Kit", "Aéreo", "09/09", "10h", "Aéreo", "13/09", "18:00", "sim", "sim", "obs", "1", "1", "2"].join("\t"),
      ["Inexistente", "", "", "", "", "", "", "", "", "", "1"].join("\t"),
    ].join("\n");
    const res = parsePastedRows(text, [{ id: "f1", name: "Kit" }], DATES, "2026");
    expect(res.skippedNames).toEqual(["Inexistente"]);
    expect(res.rows).toHaveLength(1);
    const r = res.rows[0];
    expect(r.functionId).toBe("f1");
    expect(r.transportModeIda).toBe("aereo");
    expect(r.flightDepartureDate).toBe("2026-09-09");
    expect(r.flightArrivalSuggestedTime).toBe("10:00");
    expect(r.flightReturnSuggestedTime).toBe("18:00");
    expect(r.needsAccommodation).toBe(true);
    expect(r.needsTicket).toBe(true);
    expect(r.observations).toBe("obs");
    expect(r.quantities).toEqual({ "2026-09-10": 1, "2026-09-11": 1, "2026-09-12": 2 });
  });
});

describe("validateGridRow", () => {
  it("passagem sem datas e horário inválido são apontados; linha vazia é ignorada", () => {
    const row = emptyGridRow("f1", "Kit", DATES, "r1");
    expect(validateGridRow(row)).toEqual([]);
    row.quantities["2026-09-10"] = 1;
    row.needsTicket = true;
    row.flightArrivalSuggestedTime = "14h";
    const issues = validateGridRow(row);
    expect(issues.some((i) => i.includes("passagem"))).toBe(true);
    expect(issues.some((i) => i.includes("desembarque"))).toBe(true);
  });
});
