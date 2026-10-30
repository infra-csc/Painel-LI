import { describe, it, expect } from "vitest";
import {
  diaDaProva, diaDaProvaISO, janelaDaProva, normalizarDiasDoEvento, erroDosDiasDoEvento, MENSAGEM_FORA_DO_PERIODO,
} from "./dia-da-prova";

const dm = (d: Date | null) => (d ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}` : null);

describe("dia da prova dentro do período do evento (22/09)", () => {
  it("janela de montagem → o domingo é a prova (casos reais da base)", () => {
    // Blue Run Night Edition: cadastrado 22/09 (ter) a 28/09 (seg); prova 27/09.
    expect(diaDaProvaISO("2026-09-22", "2026-09-28")).toBe("2026-09-27");
    // Circuito Primavera Fortaleza: 22/09 a 27/09 (dom).
    expect(diaDaProvaISO("2026-09-22", "2026-09-27")).toBe("2026-09-27");
    // Teste - Conexão: 18/09 (sex) a 22/09 (ter) → domingo 20/09.
    expect(diaDaProvaISO("2026-09-18", "2026-09-22")).toBe("2026-09-20");
  });

  it("sem domingo na janela, vale o sábado", () => {
    expect(diaDaProvaISO("2026-09-21", "2026-09-26")).toBe("2026-09-26"); // seg a sáb
  });

  it("sem fim de semana nenhum, vale a data de fim", () => {
    expect(diaDaProvaISO("2026-09-22", "2026-09-24")).toBe("2026-09-24"); // ter a qui
  });

  it("evento de um dia só e datas invertidas não quebram", () => {
    expect(diaDaProvaISO("2026-09-27", "2026-09-27")).toBe("2026-09-27");
    expect(diaDaProvaISO("2026-09-28", "2026-09-22")).toBe("2026-09-27");
    expect(diaDaProvaISO(null, null)).toBeNull();
    expect(diaDaProvaISO("2026-09-27", null)).toBe("2026-09-27");
  });

  it("aceita ISO com horário e Date", () => {
    expect(diaDaProvaISO("2026-09-22T03:00:00.000Z", "2026-09-28T03:00:00.000Z")).toBe("2026-09-27");
    expect(dm(diaDaProva(new Date(2026, 8, 22), new Date(2026, 8, 28)))).toBe("27/09");
  });

  it("janela da prova pega sábado e domingo quando os dois estão no período", () => {
    expect(janelaDaProva("2026-09-22", "2026-09-28")).toEqual({ de: new Date(2026, 8, 26), ate: new Date(2026, 8, 27) });
    // Período começando no próprio domingo: só o domingo.
    expect(janelaDaProva("2026-09-27", "2026-09-28")).toEqual({ de: new Date(2026, 8, 27), ate: new Date(2026, 8, 27) });
  });
});

describe("dedução corrigida (30/10): o fim de semana mais perto do FIM do período", () => {
  it("Viva Esporte - Cariacica (06/12 dom → 12/12 sáb): o sábado do fim, não o domingo do início", () => {
    expect(diaDaProvaISO("2026-12-06", "2026-12-12")).toBe("2026-12-12");
    expect(janelaDaProva("2026-12-06", "2026-12-12")).toEqual({ de: new Date(2026, 11, 12), ate: new Date(2026, 11, 12) });
  });

  it("Cariacica deixa de cair na mesma data do Fundão (29/11 dom → 06/12 dom)", () => {
    expect(diaDaProvaISO("2026-11-29", "2026-12-06")).toBe("2026-12-06");
    expect(diaDaProvaISO("2026-12-06", "2026-12-12")).not.toBe(diaDaProvaISO("2026-11-29", "2026-12-06"));
  });

  it("sábado + domingo no fim: o domingo continua sendo a prova", () => {
    expect(diaDaProvaISO("2026-09-20", "2026-09-27")).toBe("2026-09-27"); // dom → dom
    expect(janelaDaProva("2026-09-20", "2026-09-27")).toEqual({ de: new Date(2026, 8, 26), ate: new Date(2026, 8, 27) });
  });

  it("de sábado a sábado: o sábado do fim", () => {
    expect(diaDaProvaISO("2026-09-19", "2026-09-26")).toBe("2026-09-26");
  });
});

describe("dias do evento informados no cadastro (30/10)", () => {
  const SERRA = { diaEventoInicio: "2026-11-05", diaEventoFim: "2026-11-06" };

  it("Viva Esporte Serra sem dias informados: a dedução pega o domingo do fim (08/11)", () => {
    expect(diaDaProvaISO("2026-11-01", "2026-11-08")).toBe("2026-11-08");
    expect(diaDaProvaISO("2026-11-01", "2026-11-08", { diaEventoInicio: null, diaEventoFim: null })).toBe("2026-11-08");
  });

  it("Serra com 05 e 06/11 informados: a prova é o ÚLTIMO dia (06/11) e a janela vai de 05 a 06", () => {
    expect(diaDaProvaISO("2026-11-01", "2026-11-08", SERRA)).toBe("2026-11-06");
    expect(janelaDaProva("2026-11-01", "2026-11-08", SERRA)).toEqual({ de: new Date(2026, 10, 5), ate: new Date(2026, 10, 6) });
  });

  it("Cariacica com 10 e 11/12 informados → 11/12; janela 10–11/12", () => {
    const dias = { diaEventoInicio: "2026-12-10", diaEventoFim: "2026-12-11" };
    expect(diaDaProvaISO("2026-12-06", "2026-12-12", dias)).toBe("2026-12-11");
    expect(janelaDaProva("2026-12-06", "2026-12-12", dias)).toEqual({ de: new Date(2026, 11, 10), ate: new Date(2026, 11, 11) });
  });

  it("só o primeiro dia informado = um dia só", () => {
    expect(diaDaProvaISO("2026-11-01", "2026-11-08", { diaEventoInicio: "2026-11-05" })).toBe("2026-11-05");
    expect(janelaDaProva("2026-11-01", "2026-11-08", { diaEventoInicio: "2026-11-05", diaEventoFim: "" }))
      .toEqual({ de: new Date(2026, 10, 5), ate: new Date(2026, 10, 5) });
  });

  it("evento de fim de semana comum: informar sáb+dom dá o mesmo que a dedução", () => {
    const dias = { diaEventoInicio: "2026-09-26", diaEventoFim: "2026-09-27" };
    expect(diaDaProvaISO("2026-09-22", "2026-09-28", dias)).toBe(diaDaProvaISO("2026-09-22", "2026-09-28"));
    expect(janelaDaProva("2026-09-22", "2026-09-28", dias)).toEqual(janelaDaProva("2026-09-22", "2026-09-28"));
  });
});

describe("cadastro: normalizar e validar os dias do evento", () => {
  const periodo = { startDate: "2026-11-01", endDate: "2026-11-08" };

  it("normaliza: vazio → nulos; só um preenchido → os dois iguais", () => {
    expect(normalizarDiasDoEvento("", null)).toEqual({ diaEventoInicio: null, diaEventoFim: null });
    expect(normalizarDiasDoEvento("2026-11-05", "")).toEqual({ diaEventoInicio: "2026-11-05", diaEventoFim: "2026-11-05" });
    expect(normalizarDiasDoEvento(undefined, "2026-11-06")).toEqual({ diaEventoInicio: "2026-11-06", diaEventoFim: "2026-11-06" });
  });

  it("aceita: vazio, um dia, dois dias, e os dias nas pontas do período", () => {
    expect(erroDosDiasDoEvento({ ...periodo })).toBeNull();
    expect(erroDosDiasDoEvento({ ...periodo, diaEventoInicio: "2026-11-05" })).toBeNull();
    expect(erroDosDiasDoEvento({ ...periodo, diaEventoInicio: "2026-11-05", diaEventoFim: "2026-11-06" })).toBeNull();
    expect(erroDosDiasDoEvento({ ...periodo, diaEventoInicio: "2026-11-01", diaEventoFim: "2026-11-08" })).toBeNull();
  });

  it("recusa: até antes de de, fora do período e data inexistente", () => {
    expect(erroDosDiasDoEvento({ ...periodo, diaEventoInicio: "2026-11-06", diaEventoFim: "2026-11-05" })?.campo).toBe("diaEventoFim");
    expect(erroDosDiasDoEvento({ ...periodo, diaEventoInicio: "2026-10-31" })).toEqual({ campo: "diaEventoInicio", mensagem: MENSAGEM_FORA_DO_PERIODO });
    expect(erroDosDiasDoEvento({ ...periodo, diaEventoInicio: "2026-11-05", diaEventoFim: "2026-11-09" })?.campo).toBe("diaEventoFim");
    expect(erroDosDiasDoEvento({ ...periodo, diaEventoInicio: "2026-02-30" })?.mensagem).toBe("Data inválida.");
  });
});
