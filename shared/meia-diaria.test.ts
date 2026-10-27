import { describe, it, expect } from "vitest";
import {
  comMeiaDiaria, dataIsoValida, diasDeTrabalhoDaVaga, meiasDiariasDoPlanejado, normalizarDiasMeiaExtra, resumoDasMeiasDiarias, semMeiaDiaria,
} from "./meia-diaria";

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
