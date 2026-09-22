import { describe, it, expect } from "vitest";
import { diaDaProva, diaDaProvaISO, janelaDaProva } from "./dia-da-prova";

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
