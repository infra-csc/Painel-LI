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
