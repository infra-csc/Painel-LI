/**
 * Dobra de turno no Realizado (29/10) — a regra pura: o valor do dia com
 * dobra (mais uma diária DAQUELE dia, com a deflação), a dobra substitui o ½,
 * a limpeza das listas, o resumo e o motivo da mudança.
 */
import { describe, expect, it } from "vitest";
import {
  DOBRA_MOTIVO_PREFIXO, contagemDasDobras, dobraDaDiaria, mesmosDiasDeDobra, motivoComDobras, normalizarDiasDobra, resumoDasDobras, separarMeiaEDobra,
} from "./dobra-de-turno";
import { diariaDoDiaNaPosicao, valoresDosDiasDoSubtotal } from "./meia-diaria";
import { DEFLATION_FACTORS_DEFAULT } from "./calculation-rules";

// 07/09/2026 é segunda; 12/09 é sábado.
const SEG_A_SAB = ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12"];

describe("dobra de turno — o valor do dia (29/10)", () => {
  it("dobraDaDiaria: mais uma diária cheia do dia (nunca negativa)", () => {
    expect(dobraDaDiaria(10_000)).toBe(10_000);
    expect(dobraDaDiaria(9_000.4)).toBe(9_000);
    expect(dobraDaDiaria(-5)).toBe(0);
  });

  it("4 × R$ 100 com dobra no 2º dia (R$ 500): 100, 200, 100, 100 — a diária cheia sai certa", () => {
    const dias = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"];
    const v = valoresDosDiasDoSubtotal({ subtotalCents: 50_000, diasComDiaria: dias, diasDobra: ["2026-11-03"], fatores: DEFLATION_FACTORS_DEFAULT });
    expect(v.diaria).toBe(10_000);
    expect(v.dias.map((d) => d.valorCents)).toEqual([10_000, 20_000, 10_000, 10_000]);
    expect(v.dias[1]).toMatchObject({ baseCents: 10_000, dobraCents: 10_000, meiaCents: 0 });
  });

  it("deflação: a dobra no 6º dia vale a diária DAQUELE dia (90%), não 100%", () => {
    // seg–sáb de R$ 100: 4 × 100 + 2 × 90 = 580; com dobra no sábado, + 90 = 670.
    const v = valoresDosDiasDoSubtotal({ subtotalCents: 67_000, diasComDiaria: SEG_A_SAB, diasDobra: ["2026-09-12"], fatores: DEFLATION_FACTORS_DEFAULT });
    expect(v.dias.map((d) => d.valorCents)).toEqual([10_000, 10_000, 10_000, 10_000, 9_000, 18_000]);
    expect(dobraDaDiaria(diariaDoDiaNaPosicao(v.diaria, 5, DEFLATION_FACTORS_DEFAULT))).toBe(9_000);
  });

  it("½ e dobra no mesmo dia: vale a dobra (substitui o ½)", () => {
    const dias = ["2026-11-02", "2026-11-03"];
    const v = valoresDosDiasDoSubtotal({ subtotalCents: 30_000, diasComDiaria: dias, diasMeiaExtra: ["2026-11-03"], diasDobra: ["2026-11-03"], fatores: null });
    expect(v.dias[1]).toMatchObject({ meiaCents: 0, dobraCents: 10_000, valorCents: 20_000 });
  });

  it("dobra em dia sem diária pela regra não conta; valor fechado (fatores null) não deflaciona", () => {
    const v = valoresDosDiasDoSubtotal({ subtotalCents: 30_000, diasComDiaria: ["2026-09-05", "2026-09-06"], diasDobra: ["2026-09-04"], fatores: null });
    expect(v.dias.every((d) => d.dobraCents === 0)).toBe(true);
    expect(v.dias.map((d) => d.valorCents)).toEqual([15_000, 15_000]);
  });
});

describe("dobra de turno — listas, resumo e motivo", () => {
  it("normaliza: só datas reais, dentro dos dias ativos, sem repetição, em ordem", () => {
    expect(normalizarDiasDobra(["2026-10-12", "2026-10-10", "2026-10-12", "2026-02-31", 7, "2026-10-30"], ["2026-10-10", "2026-10-11", "2026-10-12"]))
      .toEqual(["2026-10-10", "2026-10-12"]);
    expect(normalizarDiasDobra("2026-10-10", ["2026-10-10"])).toEqual([]);
  });

  it("separarMeiaEDobra: o dia nas duas listas fica só na dobra", () => {
    expect(separarMeiaEDobra({ diasMeiaExtra: ["2026-10-12", "2026-10-11"], diasDobra: ["2026-10-12"] }))
      .toEqual({ diasDobra: ["2026-10-12"], diasMeiaExtra: ["2026-10-11"] });
  });

  it("resumo: '1 dobra (12/10)' · '2 dobras (11/10 e 12/10)'", () => {
    expect(contagemDasDobras(1)).toBe("1 dobra");
    expect(contagemDasDobras(3)).toBe("3 dobras");
    expect(contagemDasDobras(0)).toBe("");
    expect(resumoDasDobras(["2026-10-12"])).toBe("1 dobra (12/10)");
    expect(resumoDasDobras(["2026-10-12", "2026-10-11", "2026-10-12"])).toBe("2 dobras (11/10 e 12/10)");
    expect(resumoDasDobras(null)).toBe("");
  });

  it("motivo da mudança: põe 'Dobra de turno em dd/mm', troca a de antes e preserva o resto", () => {
    expect(motivoComDobras(null, ["2026-10-12"])).toBe(`${DOBRA_MOTIVO_PREFIXO} 12/10 (2 diárias no dia)`);
    const antes = `Check-out final da presença por Ana · ${DOBRA_MOTIVO_PREFIXO} 12/10 (2 diárias no dia)`;
    expect(motivoComDobras(antes, ["2026-10-11", "2026-10-12"])).toBe(`Check-out final da presença por Ana · ${DOBRA_MOTIVO_PREFIXO} 11/10 e 12/10 (2 diárias no dia)`);
    expect(motivoComDobras(antes, [])).toBe("Check-out final da presença por Ana");
    expect(motivoComDobras(`${DOBRA_MOTIVO_PREFIXO} 12/10 (2 diárias no dia)`, [])).toBeNull();
  });

  it("mesmosDiasDeDobra ignora ordem, repetição e lixo", () => {
    expect(mesmosDiasDeDobra(["2026-10-12", "2026-10-11"], ["2026-10-11", "2026-10-12", "2026-10-12"])).toBe(true);
    expect(mesmosDiasDeDobra(null, [])).toBe(true);
    expect(mesmosDiasDeDobra(["2026-10-12"], [])).toBe(false);
  });
});
