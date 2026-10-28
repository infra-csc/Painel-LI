import { describe, it, expect } from "vitest";
import {
  comMeiaDiaria, dataIsoValida, diariaDoDiaNaPosicao, diasDeTrabalhoDaVaga, meiaDaDiaria, meiasDiariasDoPlanejado, normalizarDiasMeiaExtra, resumoDasMeiasDiarias, semMeiaDiaria,
  valoresDosDiasDoSubtotal,
} from "./meia-diaria";
import { DEFLATION_FACTORS_DEFAULT } from "./calculation-rules";

describe("1,5 diária — regra compartilhada (28/10)", () => {
  it("dias de trabalho: os marcados mandam; sem eles, o período", () => {
    expect(diasDeTrabalhoDaVaga({ workDays: ["2026-10-12", "2026-10-10", "2026-10-12"], scheduleStartDate: "2026-10-01", scheduleEndDate: "2026-10-20" }))
      .toEqual(["2026-10-10", "2026-10-12"]);
    expect(diasDeTrabalhoDaVaga({ scheduleStartDate: "2026-10-10", scheduleEndDate: "2026-10-12" })).toEqual(["2026-10-10", "2026-10-11", "2026-10-12"]);
    expect(diasDeTrabalhoDaVaga(null)).toEqual([]);
  });

  it("normaliza: só datas reais, dentro dos permitidos, sem repetição e em ordem", () => {
    expect(normalizarDiasMeiaExtra(["2026-10-12", "2026-10-10", "2026-10-12", "2026-02-31", 5, "2026-10-30"], ["2026-10-10", "2026-10-11", "2026-10-12"]))
      .toEqual(["2026-10-10", "2026-10-12"]);
    expect(normalizarDiasMeiaExtra("2026-10-10", ["2026-10-10"])).toEqual([]);
    expect(normalizarDiasMeiaExtra(["2026-10-10"], [])).toEqual([]);
    expect(dataIsoValida("2026-02-29")).toBe(false);
  });

  it("o ½ de cada dia marcado usa a diária daquele dia; dia sem diária vale 0", () => {
    const r = meiasDiariasDoPlanejado(["2026-10-11", "2026-10-13"], ["2026-10-10", "2026-10-11"], (p) => [54_000, 48_601][p]);
    expect(r.dias).toEqual([{ dia: "2026-10-11", valorCents: 24_301 }, { dia: "2026-10-13", valorCents: 0 }]);
    expect(r.totalCents).toBe(24_301);
  });

  it("marcar e desmarcar no Realizado volta ao valor de antes, centavo a centavo", () => {
    for (const v of [54_000, 35_018, 48_601, 1, 0]) expect(semMeiaDiaria(comMeiaDiaria(v))).toBe(v);
    expect(comMeiaDiaria(54_000)).toBe(81_000);
  });

  it("resumo para o cartão e a memória", () => {
    expect(resumoDasMeiasDiarias(["2026-10-12"])).toBe("1 dia com 1,5 diária (12/10)");
    expect(resumoDasMeiasDiarias(["2026-10-12", "2026-10-11", "2026-10-13"])).toBe("3 dias com 1,5 diária (11/10, 12/10 e 13/10)");
    expect(resumoDasMeiasDiarias([])).toBe("");
    expect(resumoDasMeiasDiarias(null)).toBe("");
  });
});

describe("revisão 28/10 — a regra do dia, uma só (R3/R5)", () => {
  it("do subtotal gravado de volta ao valor de cada dia: 4 × R$ 100 com 1,5 no 3º (R$ 450) → 100, 100, 150, 100", () => {
    const dias = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"];
    const v = valoresDosDiasDoSubtotal({ subtotalCents: 45_000, diasComDiaria: dias, diasMeiaExtra: ["2026-11-04"], fatores: DEFLATION_FACTORS_DEFAULT });
    expect(v.diaria).toBe(10_000);
    expect(v.dias.map((d) => d.valorCents)).toEqual([10_000, 10_000, 15_000, 10_000]);
  });

  it("R5: seg–sáb de R$ 100 com ½ na segunda — o Realizado acha o MESMO ½ do Planejado (R$ 50,00, não 1,5 × a média)", () => {
    const dias = ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12"];
    const planejado = meiasDiariasDoPlanejado(["2026-09-07"], dias, (p) => diariaDoDiaNaPosicao(10_000, p, DEFLATION_FACTORS_DEFAULT));
    expect(planejado.totalCents).toBe(5_000);
    // O Realizado nasce com o subtotal do Planejado: 4 × 100 + 2 × 90 + ½ = 630.
    const v = valoresDosDiasDoSubtotal({ subtotalCents: 63_000, diasComDiaria: dias, diasMeiaExtra: ["2026-09-07"], fatores: DEFLATION_FACTORS_DEFAULT });
    expect(v.dias[0].meiaCents).toBe(5_000);
    expect(v.dias.map((d) => d.valorCents)).toEqual([15_000, 10_000, 10_000, 10_000, 9_000, 9_000]);
    // e marcar o ½ num dia novo usa a diária do dia × fator (6º dia: 90 → ½ = 45)
    expect(meiaDaDiaria(diariaDoDiaNaPosicao(v.diaria, 5, DEFLATION_FACTORS_DEFAULT))).toBe(4_500);
  });

  it("R4: ½ marcado em dia sem diária pela regra não conta; valor fechado (fatores null) não deflaciona", () => {
    const v = valoresDosDiasDoSubtotal({ subtotalCents: 30_000, diasComDiaria: ["2026-09-05", "2026-09-06"], diasMeiaExtra: ["2026-09-04"], fatores: null });
    expect(v.dias.every((d) => d.meiaCents === 0)).toBe(true);
    expect(v.dias.map((d) => d.valorCents)).toEqual([15_000, 15_000]);
  });
});
