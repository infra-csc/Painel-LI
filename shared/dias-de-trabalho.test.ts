import { describe, it, expect } from "vitest";
import { listarDiasDeTrabalho, recalcularDiasDaVaga, MAX_DIAS_DE_TRABALHO } from "./dias-de-trabalho";

describe("listarDiasDeTrabalho — mesma regra do PATCH da vaga", () => {
  it("inclui as duas pontas, dia a dia", () => {
    expect(listarDiasDeTrabalho("2026-09-01", "2026-09-03")).toEqual([
      "2026-09-01", "2026-09-02", "2026-09-03",
    ]);
  });

  it("um dia só quando início = fim", () => {
    expect(listarDiasDeTrabalho("2026-09-01", "2026-09-01")).toEqual(["2026-09-01"]);
  });

  it("atravessa virada de mês e de ano sem pular nem repetir", () => {
    expect(listarDiasDeTrabalho("2026-12-30", "2027-01-02")).toEqual([
      "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02",
    ]);
  });

  it("atravessa a virada do horário de verão sem duplicar dia (conta em UTC)", () => {
    // Em 2026 o Brasil não tem horário de verão, mas a regra não pode depender
    // do fuso do servidor: 2018-11-04 foi virada em São Paulo.
    expect(listarDiasDeTrabalho("2018-11-03", "2018-11-05")).toEqual([
      "2018-11-03", "2018-11-04", "2018-11-05",
    ]);
  });

  it("aceita ISO com hora (o que vem do JSON) e usa só a data", () => {
    expect(listarDiasDeTrabalho("2026-09-01T00:00:00.000Z", "2026-09-02T00:00:00.000Z")).toEqual([
      "2026-09-01", "2026-09-02",
    ]);
  });

  it("fim antes do início, data inválida ou ausente → vazio", () => {
    expect(listarDiasDeTrabalho("2026-09-03", "2026-09-01")).toEqual([]);
    expect(listarDiasDeTrabalho("2026-02-31", "2026-03-01")).toEqual([]);
    expect(listarDiasDeTrabalho("xx", "2026-03-01")).toEqual([]);
    expect(listarDiasDeTrabalho(null, "2026-03-01")).toEqual([]);
    expect(listarDiasDeTrabalho("2026-03-01", undefined)).toEqual([]);
  });

  it("período absurdo não estoura a memória", () => {
    expect(listarDiasDeTrabalho("2000-01-01", "2030-01-01")).toEqual([]);
    expect(MAX_DIAS_DE_TRABALHO).toBeGreaterThan(365);
  });
});

describe("recalcularDiasDaVaga", () => {
  it("dailyRates é sempre o tamanho de workDays", () => {
    const r = recalcularDiasDaVaga("2026-09-10", "2026-09-14");
    expect(r).toEqual({
      workDays: ["2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14"],
      dailyRates: 5,
    });
  });

  it("sem uma das datas devolve null (quem chama não sobrescreve o gravado)", () => {
    expect(recalcularDiasDaVaga(null, "2026-09-14")).toBeNull();
    expect(recalcularDiasDaVaga("2026-09-10", "")).toBeNull();
    expect(recalcularDiasDaVaga("2026-09-14", "2026-09-10")).toBeNull();
  });
});
