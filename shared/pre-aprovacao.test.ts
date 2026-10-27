import { describe, expect, it } from "vitest";
import {
  camposDeValorQueMudaram, estaPreAprovado, pedePreAprovacao, podeLiberarParaProducao, situacaoDaPreAprovacao,
} from "./pre-aprovacao";

const valores = { dailyQuantity: 3, dailyValue: 10_000, weekdayLunch: 0, weekdayDinner: 0, weekendLunch: 0, weekendDinner: 0, mobility: 0, totalValue: 30_000 };

describe("estaPreAprovado", () => {
  it("pre_aprovado e o nome antigo aprovado_rh", () => {
    expect(estaPreAprovado("pre_aprovado")).toBe(true);
    expect(estaPreAprovado("aprovado_rh")).toBe(true);
    expect(estaPreAprovado("pendente")).toBe(false);
    expect(estaPreAprovado("rejeitado_rh")).toBe(false);
    expect(estaPreAprovado(null)).toBe(false);
  });
});

describe("camposDeValorQueMudaram", () => {
  it("compara só o que veio; nulo vale zero", () => {
    expect(camposDeValorQueMudaram(valores, { totalValue: 30_000 })).toEqual([]);
    expect(camposDeValorQueMudaram(valores, { totalValue: 31_000, mobility: 1_000 })).toEqual(["mobility", "totalValue"]);
    expect(camposDeValorQueMudaram({ ...valores, mobilityIda: null }, { mobilityIda: 0 })).toEqual([]);
    expect(camposDeValorQueMudaram(valores, { observations: "x" } as never)).toEqual([]);
  });
});

describe("situacaoDaPreAprovacao", () => {
  it("enviado e não participou vêm antes de tudo", () => {
    expect(situacaoDaPreAprovacao({ enviado: true, naoParticipou: false, planejado: null, valoresDeAgora: valores })).toBe("enviado");
    expect(situacaoDaPreAprovacao({ enviado: false, naoParticipou: true, planejado: null, valoresDeAgora: valores })).toBe("nao_participou");
  });
  it("sem linha gravada ou pendente → pendente", () => {
    expect(situacaoDaPreAprovacao({ enviado: false, naoParticipou: false, planejado: null, valoresDeAgora: valores })).toBe("pendente");
    expect(situacaoDaPreAprovacao({ enviado: false, naoParticipou: false, planejado: { ...valores, status: "pendente" }, valoresDeAgora: valores })).toBe("pendente");
  });
  it("pré-aprovado com o mesmo valor; valor mudou → desatualizado (volta a pedir)", () => {
    const planejado = { ...valores, status: "pre_aprovado" };
    const ok = situacaoDaPreAprovacao({ enviado: false, naoParticipou: false, planejado, valoresDeAgora: valores });
    expect(ok).toBe("pre_aprovado");
    expect(podeLiberarParaProducao(ok)).toBe(true);
    const mudou = situacaoDaPreAprovacao({ enviado: false, naoParticipou: false, planejado, valoresDeAgora: { ...valores, totalValue: 32_000 } });
    expect(mudou).toBe("desatualizado");
    expect(podeLiberarParaProducao(mudou)).toBe(false);
    expect(pedePreAprovacao(mudou)).toBe(true);
  });
  it("evento legado (27/10): sem pré-aprovação → legado, vai ao Realizado sem pedir", () => {
    const base = { enviado: false, naoParticipou: false, valoresDeAgora: valores, eventoLegado: true };
    expect(situacaoDaPreAprovacao({ ...base, planejado: null })).toBe("legado");
    expect(situacaoDaPreAprovacao({ ...base, planejado: { ...valores, status: "pendente" } })).toBe("legado");
    // Pré-aprovada com valor mudado também segue o fluxo antigo (não trava o envio).
    expect(situacaoDaPreAprovacao({ ...base, planejado: { ...valores, status: "pre_aprovado" }, valoresDeAgora: { ...valores, totalValue: 1 } })).toBe("legado");
    expect(podeLiberarParaProducao("legado")).toBe(true);
    expect(pedePreAprovacao("legado")).toBe(false);
  });
  it("evento legado: enviado, não participou e pré-aprovado mantêm a sua situação", () => {
    const base = { naoParticipou: false, valoresDeAgora: valores, eventoLegado: true };
    expect(situacaoDaPreAprovacao({ ...base, enviado: true, planejado: null })).toBe("enviado");
    expect(situacaoDaPreAprovacao({ ...base, enviado: false, naoParticipou: true, planejado: null })).toBe("nao_participou");
    expect(situacaoDaPreAprovacao({ ...base, enviado: false, planejado: { ...valores, status: "pre_aprovado" } })).toBe("pre_aprovado");
  });
});
