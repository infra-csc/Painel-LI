import { describe, it, expect } from "vitest";
import { buildDateList, periodProblem } from "./grid-dates";
import {
  countOutsidePeriod, decomposeGridRows, emptyGridRow, mergePastedRows, pasteConflicts, QTY_MAX, reframeRows,
  sanitizeDraftRow, sanitizeDraftRows, totalsByDay,
} from "./grid-rows";

const DATES = ["2026-09-10", "2026-09-11", "2026-09-12"];

describe("período inválido não reencaixa (fluxo da página)", () => {
  it("countOutsidePeriod conta pessoas-dia e dias que sairiam ao encolher", () => {
    const row = emptyGridRow("f1", "Kit", DATES, "r1");
    row.quantities = { "2026-09-10": 2, "2026-09-11": 1, "2026-09-12": 3 };
    expect(countOutsidePeriod([row], ["2026-09-11"])).toEqual({ pessoasDia: 5, dias: 2 });
    expect(countOutsidePeriod([row], DATES)).toEqual({ pessoasDia: 0, dias: 0 });
  });
  it("com período inválido a lista vem vazia e as linhas NÃO devem ser reencaixadas (quantidades preservadas)", () => {
    const row = emptyGridRow("f1", "Kit", DATES, "r1");
    row.quantities = { "2026-09-10": 2, "2026-09-11": 1, "2026-09-12": 3 };
    const dates = buildDateList("2026-09-12", "2026-09-10");
    expect(dates).toEqual([]);
    // Regra da página: só reencaixa quando periodProblem() === null.
    const rows = periodProblem("2026-09-12", "2026-09-10") ? [row] : reframeRows([row], dates);
    expect(rows[0].quantities).toEqual({ "2026-09-10": 2, "2026-09-11": 1, "2026-09-12": 3 });
    // (se reencaixasse, zeraria tudo)
    expect(reframeRows([row], dates)[0].quantities).toEqual({});
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

describe("colar não duplica (substituição por função)", () => {
  it("pasteConflicts lista as funções já na grade; mergePastedRows substitui na posição e anexa as novas", () => {
    const kitA = emptyGridRow("f1", "Kit", DATES, "kitA");
    const prod = emptyGridRow("f2", "Produção", DATES, "prod");
    const kitB = emptyGridRow("f1", "Kit", DATES, "kitB");
    const existing = [kitA, prod, kitB];
    const pastedKit = emptyGridRow("f1", "Kit", DATES, "pKit");
    pastedKit.quantities["2026-09-10"] = 4;
    const pastedAt = emptyGridRow("f3", "Atendimento", DATES, "pAt");
    expect(pasteConflicts(existing, [pastedKit, pastedAt])).toEqual(["Kit"]);
    const merged = mergePastedRows(existing, [pastedKit, pastedAt]);
    expect(merged.map((r) => r.rowId)).toEqual(["pKit", "prod", "pAt"]);
    expect(merged[0].quantities["2026-09-10"]).toBe(4);
  });
  it("sem conflito só anexa", () => {
    const prod = emptyGridRow("f2", "Produção", DATES, "prod");
    const pasted = emptyGridRow("f1", "Kit", DATES, "pKit");
    expect(pasteConflicts([prod], [pasted])).toEqual([]);
    expect(mergePastedRows([prod], [pasted]).map((r) => r.rowId)).toEqual(["prod", "pKit"]);
  });
});

describe("sanitizeDraftRows (rascunho blindado do localStorage)", () => {
  const VALID = {
    rowId: "f1-1", functionId: "f1", functionName: "Kit",
    quantities: { "2026-09-10": 2 },
    transportModeIda: "aereo", flightDepartureDate: "2026-09-09", flightArrivalSuggestedTime: "10:00",
    transportModeVolta: "onibus", flightReturnDate: "2026-09-13", flightReturnSuggestedTime: "18:00",
    needsAccommodation: true, needsTicket: true, observations: "obs",
  };

  it("linha válida sobrevive intacta", () => {
    expect(sanitizeDraftRow(VALID)).toEqual(VALID);
  });

  it("o que não é lista (ou linha sem o mínimo) é descartado sem derrubar nada", () => {
    expect(sanitizeDraftRows(undefined)).toEqual([]);
    expect(sanitizeDraftRows("corrompido")).toEqual([]);
    expect(sanitizeDraftRows({ rows: [] })).toEqual([]);
    expect(sanitizeDraftRows([null, "x", 7, [], { functionId: "f1" }, { functionName: "Kit" }])).toEqual([]);
    // A linha boa sobrevive mesmo cercada de lixo.
    expect(sanitizeDraftRows([null, VALID, { foo: "bar" }])).toEqual([VALID]);
  });

  it("quantities vira objeto são: chave não-data sai, número é clampado, tipo errado vira 0", () => {
    const row = sanitizeDraftRow({
      ...VALID,
      quantities: { "2026-09-10": 99, "2026-09-11": -3, "2026-09-12": "2", "não-é-data": 5, "2026-09-13": 1.9 },
    })!;
    expect(row.quantities).toEqual({ "2026-09-10": QTY_MAX, "2026-09-11": 0, "2026-09-12": 0, "2026-09-13": 1 });
  });

  it("quantities ausente/corrompido não derruba a linha (vira objeto vazio)", () => {
    expect(sanitizeDraftRow({ ...VALID, quantities: undefined })!.quantities).toEqual({});
    expect(sanitizeDraftRow({ ...VALID, quantities: "x" })!.quantities).toEqual({});
    expect(sanitizeDraftRow({ ...VALID, quantities: [1, 2] })!.quantities).toEqual({});
  });

  it("campos de texto e booleanos são coagidos; modal desconhecido cai para vazio", () => {
    const row = sanitizeDraftRow({
      ...VALID,
      transportModeIda: "jetpack", transportModeVolta: 3,
      flightDepartureDate: 42, observations: { a: 1 },
      needsAccommodation: "sim", needsTicket: 1,
    })!;
    expect(row.transportModeIda).toBe("");
    expect(row.transportModeVolta).toBe("");
    expect(row.flightDepartureDate).toBe("");
    expect(row.observations).toBe("");
    expect(row.needsAccommodation).toBe(false);
    expect(row.needsTicket).toBe(false);
  });

  it("rowId ausente ganha um novo (a grade precisa de chave estável por linha)", () => {
    const row = sanitizeDraftRow({ ...VALID, rowId: undefined })!;
    expect(typeof row.rowId).toBe("string");
    expect(row.rowId.length).toBeGreaterThan(0);
  });
});

describe("totalsByDay (rodapé Pessoas por dia)", () => {
  const mk = (fid: string, q: Record<string, number>) => {
    const row = emptyGridRow(fid, fid, DATES);
    Object.assign(row.quantities, q);
    return row;
  };

  it("soma cada coluna, o total geral e aponta o pico", () => {
    const rows = [
      mk("a", { "2026-09-10": 2, "2026-09-11": 1 }),
      mk("b", { "2026-09-11": 3, "2026-09-12": 1 }),
    ];
    const t = totalsByDay(rows, DATES);
    expect(t.byDay).toEqual({ "2026-09-10": 2, "2026-09-11": 4, "2026-09-12": 1 });
    expect(t.grand).toBe(7);
    expect(t.peakDate).toBe("2026-09-11");
    expect(t.peakTotal).toBe(4);
  });

  it("grade vazia: sem pico e totais zerados", () => {
    const t = totalsByDay([], DATES);
    expect(t.grand).toBe(0);
    expect(t.peakDate).toBe("");
    expect(t.peakTotal).toBe(0);
    expect(t.byDay["2026-09-10"]).toBe(0);
  });

  it("empate de pico: vence o primeiro dia", () => {
    const t = totalsByDay([mk("a", { "2026-09-10": 2, "2026-09-12": 2 })], DATES);
    expect(t.peakDate).toBe("2026-09-10");
  });
});
