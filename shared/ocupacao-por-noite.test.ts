import { describe, expect, it } from "vitest";
import { diariasDosTrechos, ocupacaoPorNoite, rotuloDoTipo } from "./ocupacao-por-noite";

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
    expect([rotuloDoTipo("single"), rotuloDoTipo("double"), rotuloDoTipo("triple")]).toEqual(["Single", "Duplo", "Triplo"]);
  });
});
