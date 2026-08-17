import { describe, it, expect } from "vitest";
import { calcDeflatedDailies, DEFLATION_TIERS, PERCURSEIRO_TYPES } from "./calculation-rules";

describe("calcDeflatedDailies (deflação por dia trabalhado)", () => {
  const DIARIA = 46500; // R$ 465,00 — produtor freela local

  it("até 4 dias paga 100% em todos os dias", () => {
    const r = calcDeflatedDailies(DIARIA, 4);
    expect(r.totalCents).toBe(DIARIA * 4);
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0]).toMatchObject({ days: 4, factor: 1.0, dailyCents: DIARIA });
  });

  it("do 5º ao 8º dia cada dia paga 90%", () => {
    const r = calcDeflatedDailies(DIARIA, 8);
    const d90 = Math.round(DIARIA * 0.9);
    expect(r.totalCents).toBe(DIARIA * 4 + d90 * 4);
    expect(r.segments).toHaveLength(2);
    expect(r.segments[1]).toMatchObject({ days: 4, factor: 0.9, dailyCents: d90 });
  });

  it("a partir do 9º dia cada dia paga 80%", () => {
    const r = calcDeflatedDailies(DIARIA, 10);
    const d90 = Math.round(DIARIA * 0.9);
    const d80 = Math.round(DIARIA * 0.8);
    expect(r.totalCents).toBe(DIARIA * 4 + d90 * 4 + d80 * 2);
    expect(r.segments).toHaveLength(3);
    expect(r.segments[2]).toMatchObject({ days: 2, factor: 0.8, dailyCents: d80 });
  });

  it("1 dia não sofre deflação", () => {
    expect(calcDeflatedDailies(75000, 1).totalCents).toBe(75000);
  });

  it("arredonda a diária por dia (sem acumular erro de centavos)", () => {
    // 333 * 0.9 = 299.7 → 300 por dia; nunca 299.7 * n
    const r = calcDeflatedDailies(333, 5);
    expect(r.segments[1].dailyCents).toBe(300);
    expect(r.totalCents).toBe(333 * 4 + 300);
  });

  it("os tiers cobrem todos os dias sem sobreposição", () => {
    // dia 4 → tier 1; dia 5 → tier 2; dia 8 → tier 2; dia 9 → tier 3
    expect(DEFLATION_TIERS[0].toDay).toBe(4);
    expect(DEFLATION_TIERS[1].fromDay).toBe(5);
    expect(DEFLATION_TIERS[1].toDay).toBe(8);
    expect(DEFLATION_TIERS[2].fromDay).toBe(9);
  });
});

describe("tabela do percurseiro", () => {
  it("o total da proposta é a soma das parcelas", () => {
    for (const t of PERCURSEIRO_TYPES) {
      const soma = t.motoqueiroCents + t.feeIvanCents + t.alimentacaoCents + t.transporteCents + t.nfPropostaCents;
      expect(t.totalPropostaCents).toBe(soma);
    }
  });

  it("o total da planilha base é a soma das parcelas", () => {
    for (const t of PERCURSEIRO_TYPES) {
      const soma = t.motoqueiroCents + t.feeIvanCents + t.alimentacaoCents + t.transporteCents + t.nfPlanilhaCents;
      expect(t.totalPlanilhaCents).toBe(soma);
    }
  });
});

import { deflationFactorsFromSettings, DEFLATION_FACTORS_DEFAULT } from "./calculation-rules";

describe("calcDeflatedDailies com fatores editáveis", () => {
  it("usa os fatores padrão quando não informado", () => {
    const r = calcDeflatedDailies(10000, 10);
    // 4×100% + 4×90% + 2×80% = 40000 + 36000 + 16000
    expect(r.totalCents).toBe(40000 + 36000 + 16000);
  });
  it("respeita fatores customizados", () => {
    const r = calcDeflatedDailies(10000, 10, { ate4: 1.0, d5a8: 0.85, d9mais: 0.7 });
    expect(r.totalCents).toBe(4 * 10000 + 4 * 8500 + 2 * 7000);
  });
});

describe("deflationFactorsFromSettings", () => {
  it("converte percentuais inteiros em fatores", () => {
    const f = deflationFactorsFromSettings({ deflacao_fator_ate_4: 100, deflacao_fator_5_8: 90, deflacao_fator_9_mais: 80 });
    expect(f).toEqual({ ate4: 1.0, d5a8: 0.9, d9mais: 0.8 });
  });
  it("cai no default quando ausente", () => {
    expect(deflationFactorsFromSettings({})).toEqual(DEFLATION_FACTORS_DEFAULT);
    expect(deflationFactorsFromSettings(null)).toEqual(DEFLATION_FACTORS_DEFAULT);
  });
  it("aceita string", () => {
    expect(deflationFactorsFromSettings({ deflacao_fator_5_8: "85" }).d5a8).toBe(0.85);
  });
});

import { freelaDailyCents, isDirProvaFunction } from "./calculation-rules";

describe("freelaDailyCents (regra do slide)", () => {
  it("local R$465, viagem R$540, dir de prova R$820 (defaults)", () => {
    expect(freelaDailyCents("produção local", false, {})).toBe(46500);
    expect(freelaDailyCents("produção local", true, {})).toBe(54000);
    expect(freelaDailyCents("dir prova", false, {})).toBe(82000);
    expect(freelaDailyCents("Dir. de Prova", true, {})).toBe(82000);
  });
  it("lê os valores editáveis do Valores Padrão", () => {
    const ss = { freela_diaria_local: 47000, freela_diaria_viagem: "55000", freela_diaria_dir_prova: 90000 };
    expect(freelaDailyCents("kit", false, ss)).toBe(47000);
    expect(freelaDailyCents("kit", true, ss)).toBe(55000);
    expect(freelaDailyCents("dir prova", true, ss)).toBe(90000);
  });
  it("isDirProvaFunction não confunde outras funções", () => {
    expect(isDirProvaFunction("produção")).toBe(false);
    expect(isDirProvaFunction("dir prova")).toBe(true);
  });
});

import { casaDailyCents } from "./calculation-rules";

describe("casaDailyCents (regra do slide, nomes reais do sistema)", () => {
  it("produtor = produção/ativação/kit/sup ceno -> R$465", () => {
    for (const f of ["produção", "produção local", "produção sp 1", "ativação sp", "ativação local", "kit", "kit local", "sup ceno", "sup ceno local"]) {
      expect(casaDailyCents(f, {})).toBe(46500);
    }
  });
  it("dir prova -> R$750; clube o2/vendas -> R$260", () => {
    expect(casaDailyCents("dir prova", {})).toBe(75000);
    expect(casaDailyCents("clube o2", {})).toBe(26000);
  });
  it("fora da regra: atendimento (KA/EC), cenotécnica, percurso, montagem -> null", () => {
    for (const f of ["atendimento", "cenotecnica", "cenotecnica local", "cenotecnica sp", "cenotecnico - freela", "percurso", "percurso local", "Montagem - casa", "Mkt"]) {
      expect(casaDailyCents(f, {})).toBeNull();
    }
  });
  it("valores editáveis", () => {
    expect(casaDailyCents("produção", { casa_diaria_produtor: 50000 })).toBe(50000);
    expect(casaDailyCents("dir prova", { casa_diaria_dir_prova: "80000" })).toBe(80000);
  });
});
