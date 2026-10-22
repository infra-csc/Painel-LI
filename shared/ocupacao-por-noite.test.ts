import { describe, expect, it } from "vitest";
import { diariasDosTrechos, ocupacaoPorNoite, rotuloDoTipo, trechosPorApartamento } from "./ocupacao-por-noite";

const p = (nome: string, checkIn: string | null, checkOut: string | null) => ({ nome, checkIn, checkOut });
const resumo = (ts: ReturnType<typeof ocupacaoPorNoite<ReturnType<typeof p>>>) =>
  ts.map((t) => `${t.de}→${t.ate} ${t.tipo} ${t.noites} [${t.ocupantes.map((o) => o.nome).join(",")}]`);

describe("ocupacaoPorNoite", () => {
  it("caso do dono: Mauricio 22→27 e Edney 24→26 = Single · Duplo · Single", () => {
    const t = ocupacaoPorNoite([p("Mauricio", "2026-04-22", "2026-04-27"), p("Edney", "2026-04-24", "2026-04-26")]);
    expect(resumo(t)).toEqual([
      "2026-04-22→2026-04-24 single 2 [Mauricio]",
      "2026-04-24→2026-04-26 double 2 [Mauricio,Edney]",
      "2026-04-26→2026-04-27 single 1 [Mauricio]",
    ]);
    expect(diariasDosTrechos(t)).toBe(5);
  });

  it("todos com as mesmas datas: um trecho só", () => {
    const t = ocupacaoPorNoite([p("A", "2026-11-13", "2026-11-16"), p("B", "2026-11-13", "2026-11-16")]);
    expect(resumo(t)).toEqual(["2026-11-13→2026-11-16 double 3 [A,B]"]);
  });

  it("triplo que vira duplo quando um sai antes", () => {
    const t = ocupacaoPorNoite([
      p("A", "2026-11-12", "2026-11-16"), p("B", "2026-11-12", "2026-11-16"), p("C", "2026-11-12", "2026-11-14"),
    ]);
    expect(resumo(t)).toEqual([
      "2026-11-12→2026-11-14 triple 2 [A,B,C]",
      "2026-11-14→2026-11-16 double 2 [A,B]",
    ]);
  });

  it("noite vazia no meio não vira trecho; datas inválidas ficam de fora", () => {
    const t = ocupacaoPorNoite([
      p("A", "2026-11-10", "2026-11-12"), p("B", "2026-11-13", "2026-11-14"),
      p("Sem data", null, "2026-11-14"), p("Invertida", "2026-11-14", "2026-11-13"),
    ]);
    expect(resumo(t)).toEqual([
      "2026-11-10→2026-11-12 single 2 [A]",
      "2026-11-13→2026-11-14 single 1 [B]",
    ]);
    expect(ocupacaoPorNoite([])).toEqual([]);
  });

  it("aceita data com hora (timestamp) e atravessa a virada do mês", () => {
    const t = ocupacaoPorNoite([p("A", "2026-10-30T00:00:00.000Z", "2026-11-02T00:00:00.000Z")]);
    expect(resumo(t)).toEqual(["2026-10-30→2026-11-02 single 3 [A]"]);
  });

  it("rótulos", () => {
    expect([rotuloDoTipo("single"), rotuloDoTipo("double"), rotuloDoTipo("triple")]).toEqual(["Individual", "Duplo", "Triplo"]);
  });
});

describe("trechosPorApartamento (22/10 — o apartamento que o hotel usa)", () => {
  const casoDoDono = () => ocupacaoPorNoite([p("Mauricio", "2026-04-22", "2026-04-27"), p("Edney", "2026-04-24", "2026-04-26")]);
  const triploQueEsvazia = () => ocupacaoPorNoite([
    p("A", "2026-04-22", "2026-04-26"), p("B", "2026-04-22", "2026-04-26"), p("C", "2026-04-22", "2026-04-24"),
  ]);

  it("com todos os tipos, os trechos vêm como estão (nem trechos vizinhos de Individual se juntam)", () => {
    expect(resumo(trechosPorApartamento(casoDoDono(), null))).toEqual(resumo(casoDoDono()));
    const vizinhos = ocupacaoPorNoite([p("A", "2026-04-22", "2026-04-24"), p("B", "2026-04-24", "2026-04-26")]);
    expect(resumo(trechosPorApartamento(vizinhos, { duplo: false, triplo: true }))).toEqual(resumo(vizinhos));
  });

  it("sem duplo: as noites de dois num triplo são Triplo — e viram um trecho só", () => {
    expect(resumo(trechosPorApartamento(triploQueEsvazia(), { duplo: false, triplo: true }))).toEqual([
      "2026-04-22→2026-04-26 triple 4 [A,B,C]",
    ]);
  });

  it("sem duplo: Individual · Triplo · Individual (os tipos diferentes não se juntam)", () => {
    expect(resumo(trechosPorApartamento(casoDoDono(), { duplo: false, triplo: true }))).toEqual([
      "2026-04-22→2026-04-24 single 2 [Mauricio]",
      "2026-04-24→2026-04-26 triple 2 [Mauricio,Edney]",
      "2026-04-26→2026-04-27 single 1 [Mauricio]",
    ]);
  });

  it("sem apartamento possível (dois sem duplo nem triplo), fica o tipo da ocupação", () => {
    expect(resumo(trechosPorApartamento(casoDoDono(), { duplo: false, triplo: false }))).toEqual(resumo(casoDoDono()));
  });
});
