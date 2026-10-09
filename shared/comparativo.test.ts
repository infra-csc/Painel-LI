import { describe, expect, it } from "vitest";
import { entraNosTotaisDoComparativo, etapaDoComparativo, idaEVoltaDaMobilidade, idaEVoltaRateadas, naoParticipou, totaisDoGrupoNoComparativo } from "./comparativo";

describe("naoParticipou", () => {
  it("vale a marca do Realizado OU a do Planejado (o critério do Realizado)", () => {
    expect(naoParticipou({ didNotAttend: true }, { didNotAttend: false })).toBe(true);
    expect(naoParticipou({ didNotAttend: false }, { didNotAttend: true })).toBe(true);
    expect(naoParticipou({ didNotAttend: false }, null)).toBe(false);
    expect(naoParticipou(null, undefined)).toBe(false);
  });
});

describe("totaisDoGrupoNoComparativo", () => {
  const planejado = { totalValue: 50_000, didNotAttend: false };

  it("participou: realizado do grupo contra o planejado", () => {
    expect(totaisDoGrupoNoComparativo({ totalValue: 40_000 }, [], planejado))
      .toEqual({ naoParticipou: false, realizado: 40_000, planejado: 50_000, variacao: -10_000 });
  });

  it("marcado só no Realizado: sem 'economia' negativa e o planejado fora do total", () => {
    expect(totaisDoGrupoNoComparativo({ totalValue: 0, didNotAttend: true }, [], planejado))
      .toEqual({ naoParticipou: true, realizado: 0, planejado: 0, variacao: 0 });
  });

  it("marcado no Planejado: o realizado gravado também sai", () => {
    expect(totaisDoGrupoNoComparativo({ totalValue: 30_000 }, [], { totalValue: 50_000, didNotAttend: true }))
      .toEqual({ naoParticipou: true, realizado: 0, planejado: 0, variacao: 0 });
  });

  it("divisão: soma pai + filhos que participaram contra o planejado cheio", () => {
    const t = totaisDoGrupoNoComparativo(
      { totalValue: 20_000 },
      [{ totalValue: 25_000 }, { totalValue: 9_000, didNotAttend: true }],
      planejado,
    );
    expect(t).toEqual({ naoParticipou: false, realizado: 45_000, planejado: 50_000, variacao: -5_000 });
  });

  it("sem planejado: a variação é o próprio realizado e o planejado soma 0", () => {
    expect(totaisDoGrupoNoComparativo({ totalValue: 12_000 }, [], null))
      .toEqual({ naoParticipou: false, realizado: 12_000, planejado: 0, variacao: 12_000 });
  });
});

describe("idaEVoltaDaMobilidade", () => {
  it("nulo ou 0 + 0 com mobilidade > 0 é 'sem divisão': metade para cima na ida", () => {
    expect(idaEVoltaDaMobilidade(3_000, null, null)).toEqual({ ida: 1_500, volta: 1_500 });
    expect(idaEVoltaDaMobilidade(3_000, 0, 0)).toEqual({ ida: 1_500, volta: 1_500 });
    expect(idaEVoltaDaMobilidade(3_001, 0, 0)).toEqual({ ida: 1_501, volta: 1_500 });
  });

  it("divisão gravada é respeitada (inclusive só ida)", () => {
    expect(idaEVoltaDaMobilidade(3_000, 2_000, 1_000)).toEqual({ ida: 2_000, volta: 1_000 });
    expect(idaEVoltaDaMobilidade(3_000, 3_000, 0)).toEqual({ ida: 3_000, volta: 0 });
  });

  it("sem mobilidade: zero e zero", () => {
    expect(idaEVoltaDaMobilidade(0, 0, 0)).toEqual({ ida: 0, volta: 0 });
    expect(idaEVoltaDaMobilidade(null, null, null)).toEqual({ ida: 0, volta: 0 });
  });
});

describe("etapaDoComparativo", () => {
  const aprovada = { sentForReview: true, rhStatus: "aprovado" };
  const pendente = { sentForReview: true, rhStatus: "pendente" };
  const naoEnviada = { sentForReview: false, rhStatus: "pendente" };

  it("ainda há prestação sem envio → Prestação", () => {
    expect(etapaDoComparativo([aprovada, naoEnviada], "pendente")).toBe(2);
    expect(etapaDoComparativo([], "aprovado")).toBe(2);
  });

  it("tudo enviado/decidido → Aprovação RH", () => {
    expect(etapaDoComparativo([aprovada, pendente], "pendente")).toBe(3);
  });

  it("todas aprovadas mas o comparativo AINDA aberto → continua em Aprovação RH", () => {
    expect(etapaDoComparativo([aprovada, aprovada], "pendente")).toBe(3);
    expect(etapaDoComparativo([aprovada, aprovada], null)).toBe(3);
  });

  it("todas aprovadas E o comparativo aprovado → Nota fiscal", () => {
    expect(etapaDoComparativo([aprovada, aprovada], "aprovado")).toBe(4);
  });
});

describe("idaEVoltaRateadas", () => {
  it("mesma proporção da divisão cheia, fechando com a mobilidade rateada", () => {
    expect(idaEVoltaRateadas(3000, 4000, 2000, 2000)).toEqual({ ida: 1500, volta: 1500 });
    expect(idaEVoltaRateadas(1000, 4000, 3000, 1000)).toEqual({ ida: 750, volta: 250 });
  });

  it("centavo ímpar: a volta leva o resto e nada se perde", () => {
    const r = idaEVoltaRateadas(751, 1001, 501, 500);
    expect(r).toEqual({ ida: 376, volta: 375 });
    expect(r.ida + r.volta).toBe(751);
    const s = idaEVoltaRateadas(333, 1000, 333, 667);
    expect(s.ida + s.volta).toBe(333);
  });

  it("sem divisão gravada (nulo ou 0 + 0): metade para cima na ida", () => {
    expect(idaEVoltaRateadas(751, 1001, null, null)).toEqual({ ida: 376, volta: 375 });
    expect(idaEVoltaRateadas(751, 1001, 0, 0)).toEqual({ ida: 376, volta: 375 });
  });

  it("só ida ou só volta é respeitado; rateado zero dá zero", () => {
    expect(idaEVoltaRateadas(500, 1000, 1000, 0)).toEqual({ ida: 500, volta: 0 });
    expect(idaEVoltaRateadas(500, 1000, 0, 1000)).toEqual({ ida: 0, volta: 500 });
    expect(idaEVoltaRateadas(0, 1000, 500, 500)).toEqual({ ida: 0, volta: 0 });
  });
});

describe("entraNosTotaisDoComparativo", () => {
  it("aprovada, ou enviada e pendente — o recorte da NF e do Flash", () => {
    expect(entraNosTotaisDoComparativo({ sentForReview: true, rhStatus: "aprovado" })).toBe(true);
    expect(entraNosTotaisDoComparativo({ sentForReview: false, rhStatus: "aprovado" })).toBe(true);
    expect(entraNosTotaisDoComparativo({ sentForReview: true, rhStatus: "pendente" })).toBe(true);
  });

  it("devolvida, recusada ou não enviada ficam fora dos totais", () => {
    expect(entraNosTotaisDoComparativo({ sentForReview: false, rhStatus: "devolvido" })).toBe(false);
    expect(entraNosTotaisDoComparativo({ sentForReview: false, rhStatus: "rejeitado" })).toBe(false);
    expect(entraNosTotaisDoComparativo({ sentForReview: false, rhStatus: "pendente" })).toBe(false);
  });
});
