import { describe, it, expect } from "vitest";
import { decomposeGridRows, QTY_MAX } from "./grid-rows";
import { rowsFromSuggestions } from "./copy-from-event";

const DATES = ["2026-09-10", "2026-09-11", "2026-09-12"];

describe("rowsFromSuggestions (Copiar de evento)", () => {
  const FUNCS = [
    { id: "f1", name: "Produção" },
    { id: "f2", name: "Kit" },
  ];

  it("reagrega vagas por função: quantidade = nº de vagas que trabalham no dia", () => {
    const res = rowsFromSuggestions(
      [
        { functionId: "f1", workDays: ["2026-09-10", "2026-09-11"] },
        { functionId: "f1", workDays: ["2026-09-11"] },
        { functionId: "f2", workDays: ["2026-09-12"] },
      ],
      FUNCS, DATES,
    );
    expect(res.totalVagas).toBe(3);
    expect(res.rows).toHaveLength(2);
    const producao = res.rows.find((r) => r.functionId === "f1")!;
    expect(producao.functionName).toBe("Produção");
    expect(producao.quantities).toEqual({ "2026-09-10": 1, "2026-09-11": 2, "2026-09-12": 0 });
    // é a inversa da decomposição: reaplicar decomposeGridRows devolve as mesmas vagas
    const back = decomposeGridRows([producao], DATES);
    expect(back.map((r) => r.workDays)).toEqual([["2026-09-10", "2026-09-11"], ["2026-09-11"]]);
  });

  it("copiar de outro evento leva a faixa do horário como está (04/09)", () => {
    const res = rowsFromSuggestions(
      [{ functionId: "f1", workDays: ["2026-09-10"], transportModeIda: "aereo", flightDepartureDate: "2026-09-09",
        flightArrivalSuggestedTime: "8-14h", transportModeVolta: "aereo", flightReturnDate: "2026-09-12", flightReturnSuggestedTime: "20h+" }],
      FUNCS, DATES,
    );
    expect(res.rows[0].flightArrivalSuggestedTime).toBe("8-14h");
    expect(res.rows[0].flightReturnSuggestedTime).toBe("20h+");
  });

  it("dias fora do período atual não entram na grade e voltam em outsideDays", () => {
    const res = rowsFromSuggestions(
      [{ functionId: "f1", workDays: ["2026-09-09", "2026-09-10", "2026-09-20"] }],
      FUNCS, DATES,
    );
    expect(res.rows[0].quantities["2026-09-10"]).toBe(1);
    expect(res.outsideDays).toEqual(["2026-09-09", "2026-09-20"]);
  });

  it("cada logística vira a SUA linha; datas ISO longas e HH:MM:SS são normalizadas", () => {
    const res = rowsFromSuggestions(
      [
        { functionId: "f1", workDays: ["2026-09-10"] }, // sem viagem
        {
          functionId: "f1", workDays: ["2026-09-11"],
          transportModeIda: "aereo", flightDepartureDate: "2026-09-09T00:00:00.000Z",
          flightArrivalSuggestedTime: "10:00:00", needsTicket: true,
        },
      ],
      FUNCS, DATES,
    );
    expect(res.rows).toHaveLength(2);
    const semViagem = res.rows[0];
    expect(semViagem.transportModeIda).toBe("");
    expect(semViagem.needsTicket).toBe(false);
    expect(semViagem.quantities).toEqual({ "2026-09-10": 1, "2026-09-11": 0, "2026-09-12": 0 });
    const comViagem = res.rows[1];
    expect(comViagem.transportModeIda).toBe("aereo");
    expect(comViagem.flightDepartureDate).toBe("2026-09-09");
    expect(comViagem.flightArrivalSuggestedTime).toBe("10:00");
    expect(comViagem.needsTicket).toBe(true);
    expect(comViagem.needsAccommodation).toBe(false);
    expect(comViagem.quantities).toEqual({ "2026-09-10": 0, "2026-09-11": 1, "2026-09-12": 0 });
  });

  it("duas vagas da mesma função com logísticas diferentes viram 2 linhas (a ida-e-volta não vaza de uma para a outra)", () => {
    const res = rowsFromSuggestions(
      [
        {
          functionId: "f1", workDays: ["2026-09-10", "2026-09-11"],
          transportModeIda: "aereo", flightDepartureDate: "2026-09-10", needsTicket: true, needsAccommodation: true,
        },
        { functionId: "f1", workDays: ["2026-09-10", "2026-09-11"] }, // local: sem passagem nem hotel
      ],
      FUNCS, DATES,
    );
    expect(res.rows).toHaveLength(2);
    expect(res.rows.every((r) => r.functionId === "f1")).toBe(true);
    const [aerea, local] = res.rows;
    expect(aerea.needsTicket).toBe(true);
    expect(aerea.needsAccommodation).toBe(true);
    expect(local.needsTicket).toBe(false);
    expect(local.needsAccommodation).toBe(false);
    expect(local.transportModeIda).toBe("");
    // ida-e-volta: decompor de novo devolve exatamente as duas vagas de origem
    const back = decomposeGridRows(res.rows, DATES);
    expect(back).toHaveLength(2);
    expect(back.map((r) => r.workDays)).toEqual([
      ["2026-09-10", "2026-09-11"],
      ["2026-09-10", "2026-09-11"],
    ]);
    expect(back.map((r) => r.needsTicket)).toEqual([true, false]);
    expect(back.map((r) => r.flightDepartureDate)).toEqual(["2026-09-10", null]);
  });

  it("observação diferente também separa as linhas; vagas idênticas continuam juntas", () => {
    const res = rowsFromSuggestions(
      [
        { functionId: "f1", workDays: ["2026-09-10"], observations: "chega antes" },
        { functionId: "f1", workDays: ["2026-09-10"], observations: "chega antes" },
        { functionId: "f1", workDays: ["2026-09-10"], observations: "fica no hotel B" },
      ],
      FUNCS, DATES,
    );
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0].quantities["2026-09-10"]).toBe(2);
    expect(res.rows[0].observations).toBe("chega antes");
    expect(res.rows[1].quantities["2026-09-10"]).toBe(1);
    expect(res.rows[1].observations).toBe("fica no hotel B");
  });

  it("linhas da mesma função ficam juntas mesmo quando as vagas vêm intercaladas", () => {
    const res = rowsFromSuggestions(
      [
        { functionId: "f1", workDays: ["2026-09-10"], needsTicket: true },
        { functionId: "f2", workDays: ["2026-09-10"] },
        { functionId: "f1", workDays: ["2026-09-11"] },
      ],
      FUNCS, DATES,
    );
    expect(res.rows.map((r) => r.functionId)).toEqual(["f1", "f1", "f2"]);
  });

  it("diárias ajustadas à mão na origem são contadas (a grade recalcula pelos dias)", () => {
    const res = rowsFromSuggestions(
      [
        { functionId: "f1", workDays: ["2026-09-10", "2026-09-11"], dailyRates: 3 }, // ajustada
        { functionId: "f2", workDays: ["2026-09-10"], dailyRates: 1 },               // bate
        { functionId: "f2", workDays: ["2026-09-12"] },                              // sem info
      ],
      FUNCS, DATES,
    );
    expect(res.manualDailyRates).toBe(1);
  });

  it("dia fora do período não conta como diária ajustada (compara com os dias da vaga, não com a grade)", () => {
    const res = rowsFromSuggestions(
      [{ functionId: "f1", workDays: ["2026-09-09", "2026-09-10"], dailyRates: 2 }],
      FUNCS, DATES,
    );
    expect(res.manualDailyRates).toBe(0);
    expect(res.outsideDays).toEqual(["2026-09-09"]);
  });

  it("função fora do catálogo fica de fora (contada); modal desconhecido cai para vazio", () => {
    const res = rowsFromSuggestions(
      [
        { functionId: "fantasma", workDays: ["2026-09-10"] },
        { functionId: "f2", workDays: ["2026-09-10"], transportModeIda: "jetpack" },
      ],
      FUNCS, DATES,
    );
    expect(res.unknownFunctions).toBe(1);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].transportModeIda).toBe("");
  });

  it("mais de QTY_MAX vagas no mesmo dia: clampa e conta a célula ajustada", () => {
    const many = Array.from({ length: QTY_MAX + 2 }, () => ({ functionId: "f1", workDays: ["2026-09-10"] }));
    const res = rowsFromSuggestions(many, FUNCS, DATES);
    expect(res.rows[0].quantities["2026-09-10"]).toBe(QTY_MAX);
    expect(res.clampedCells).toBe(1);
  });
});
