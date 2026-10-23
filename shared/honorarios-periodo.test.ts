import { describe, expect, it } from "vitest";
import {
  dentroDoIntervalo, descricaoDoIntervalo, intervaloDoPeriodo, liberacoesNoPeriodo, preambuloDoCsv, recortarPelaDataDaLiberacao,
  recortarPelaDataDoEvento, rotuloDoPeriodo, sufixoDoPeriodo, totaisPagosNoPeriodo,
} from "./honorarios-periodo";

const HOJE = "2026-10-23";

describe("intervaloDoPeriodo — atalhos relativos a hoje", () => {
  it("este mês, mês passado, últimos 3 meses (o atual e os dois anteriores) e este ano", () => {
    expect(intervaloDoPeriodo({ atalho: "este-mes" }, HOJE)).toEqual({ de: "2026-10-01", ate: "2026-10-31" });
    expect(intervaloDoPeriodo({ atalho: "mes-passado" }, HOJE)).toEqual({ de: "2026-09-01", ate: "2026-09-30" });
    expect(intervaloDoPeriodo({ atalho: "ultimos-3-meses" }, HOJE)).toEqual({ de: "2026-08-01", ate: "2026-10-31" });
    expect(intervaloDoPeriodo({ atalho: "este-ano" }, HOJE)).toEqual({ de: "2026-01-01", ate: "2026-12-31" });
    expect(intervaloDoPeriodo({ atalho: "tudo" }, HOJE)).toEqual({ de: null, ate: null });
  });

  it("virada de ano e fevereiro", () => {
    expect(intervaloDoPeriodo({ atalho: "mes-passado" }, "2027-01-05")).toEqual({ de: "2026-12-01", ate: "2026-12-31" });
    expect(intervaloDoPeriodo({ atalho: "ultimos-3-meses" }, "2027-02-10")).toEqual({ de: "2026-12-01", ate: "2027-02-28" });
    expect(intervaloDoPeriodo({ atalho: "este-mes" }, "2028-02-01")).toEqual({ de: "2028-02-01", ate: "2028-02-29" });
  });

  it("de/até livre: data inválida vira sem limite; de depois do até troca", () => {
    expect(intervaloDoPeriodo({ atalho: "personalizado", de: "2026-10-05", ate: "2026-10-20" }, HOJE)).toEqual({ de: "2026-10-05", ate: "2026-10-20" });
    expect(intervaloDoPeriodo({ atalho: "personalizado", de: "2026-10-20", ate: "2026-10-05" }, HOJE)).toEqual({ de: "2026-10-05", ate: "2026-10-20" });
    expect(intervaloDoPeriodo({ atalho: "personalizado", de: "xx", ate: "2026-10-05" }, HOJE)).toEqual({ de: null, ate: "2026-10-05" });
    expect(intervaloDoPeriodo({ atalho: "personalizado" }, HOJE)).toEqual({ de: null, ate: null });
  });
});

describe("dentroDoIntervalo", () => {
  it("limites inclusivos; sem data fica fora quando há limite e dentro quando não há", () => {
    const out = { de: "2026-10-01", ate: "2026-10-31" };
    expect(dentroDoIntervalo("2026-10-01", out)).toBe(true);
    expect(dentroDoIntervalo("2026-10-31", out)).toBe(true);
    expect(dentroDoIntervalo("2026-09-30", out)).toBe(false);
    expect(dentroDoIntervalo("2026-11-01", out)).toBe(false);
    expect(dentroDoIntervalo(null, out)).toBe(false);
    expect(dentroDoIntervalo(null, { de: null, ate: null })).toBe(true);
    expect(dentroDoIntervalo("2026-10-31T23:00:00Z", out)).toBe(true);
    expect(dentroDoIntervalo("2026-12-01", { de: "2026-11-01", ate: null })).toBe(true);
  });
});

describe("textos do período", () => {
  it("botão, descrição, nome do arquivo e as linhas de abertura do CSV", () => {
    expect(rotuloDoPeriodo({ atalho: "este-mes" }, HOJE)).toBe("Este mês");
    expect(rotuloDoPeriodo({ atalho: "tudo" }, HOJE)).toBe("Todo o período");
    expect(rotuloDoPeriodo({ atalho: "personalizado", de: "2026-10-05", ate: "2026-10-20" }, HOJE)).toBe("05/10/2026 a 20/10/2026");
    expect(rotuloDoPeriodo({ atalho: "personalizado", de: "2026-10-05" }, HOJE)).toBe("A partir de 05/10/2026");
    expect(descricaoDoIntervalo({ de: null, ate: "2026-10-20" })).toBe("até 20/10/2026");
    expect(sufixoDoPeriodo({ de: null, ate: null })).toBe("");
    expect(sufixoDoPeriodo({ de: "2026-10-01", ate: "2026-10-31" })).toBe("-2026-10-01-a-2026-10-31");
    expect(sufixoDoPeriodo({ de: "2026-10-01", ate: "2026-10-31" }, "liberacao")).toBe("-2026-10-01-a-2026-10-31-por-liberacao");
    expect(sufixoDoPeriodo({ de: "2026-10-01", ate: null })).toBe("-desde-2026-10-01");
    expect(preambuloDoCsv("Honorários", { de: "2026-10-01", ate: "2026-10-31" }, "liberacao", "Night Run")).toEqual([
      ["Honorários"], ["Período", "01/10/2026 a 31/10/2026 (data da liberação)"], ["Evento", "Night Run"], [],
    ]);
    expect(preambuloDoCsv("Honorários", { de: null, ate: null }, "evento")).toEqual([["Honorários"], ["Período", "todo o período"], []]);
  });
});

const lib = (data: string, valor: number, estornadaEm: string | null = null) => ({ data, valor, estornadaEm });
const OUTUBRO = { de: "2026-10-01", ate: "2026-10-31" };

describe("recortes", () => {
  const linhas = [
    { id: "a", eventId: "e1", eventStartDate: "2026-09-20", valorAprovado: 120_000, falta: 0, liberacoes: [lib("2026-09-25", 50_000), lib("2026-10-02", 70_000)] },
    { id: "b", eventId: "e2", eventStartDate: "2026-10-10", valorAprovado: 50_000, falta: 30_000, liberacoes: [lib("2026-10-15", 20_000), lib("2026-10-16", 99_000, "2026-10-17T10:00:00Z")] },
    { id: "c", eventId: "e2", eventStartDate: "2026-10-10", valorAprovado: 100_000, falta: 100_000, liberacoes: [] },
    { id: "d", eventId: "e3", eventStartDate: null, valorAprovado: 10_000, falta: 0, liberacoes: [lib("2026-11-02", 10_000)] },
  ];

  it("pela data do evento: só os eventos que começam no período; tudo devolve tudo", () => {
    expect(recortarPelaDataDoEvento(linhas, OUTUBRO).map((l) => l.id)).toEqual(["b", "c"]);
    expect(recortarPelaDataDoEvento(linhas, { de: null, ate: null })).toHaveLength(4);
  });

  it("pela data da liberação: o pago no período, com só as OCs do período; estornada não conta", () => {
    const r = recortarPelaDataDaLiberacao(linhas, OUTUBRO);
    expect(r.map((x) => x.linha.id)).toEqual(["a", "b"]);
    // Evento de setembro pago metade em setembro e metade em outubro: em outubro, só a parte de outubro.
    expect(r[0]).toMatchObject({ liberadoNoPeriodo: 70_000 });
    expect(r[0].liberacoes.map((l) => l.data)).toEqual(["2026-10-02"]);
    expect(r[1]).toMatchObject({ liberadoNoPeriodo: 20_000 });
    expect(totaisPagosNoPeriodo(r)).toEqual({ liberado: 90_000, liberacoes: 2, pedidos: 2, eventos: 2, aprovadoDessesPedidos: 170_000, faltaDessesPedidos: 30_000 });
  });

  it("liberacoesNoPeriodo ignora estornadas mesmo sem limite de datas", () => {
    expect(liberacoesNoPeriodo(linhas[1].liberacoes, { de: null, ate: null })).toHaveLength(1);
  });
});
