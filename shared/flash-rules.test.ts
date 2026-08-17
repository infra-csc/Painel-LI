import { describe, it, expect } from "vitest";
import {
  flashAmountsFromBudgetActual, flashMovementsToSync, flashOcDescription, isAutomaticFlashMovement,
} from "./flash-rules";

describe("flashAmountsFromBudgetActual (OC → Flash: alimentação + mobilidade, diária não)", () => {
  it("alimentação = soma das 4 refeições", () => {
    const r = flashAmountsFromBudgetActual({
      weekdayLunch: 800, weekdayDinner: 1200, weekendLunch: 3000, weekendDinner: 2500,
      mobility: 0,
    });
    expect(r.alimentacaoCents).toBe(7500);
  });

  it("mobilidade = coluna mobility (total ida+volta gravado)", () => {
    const r = flashAmountsFromBudgetActual({ mobility: 5000, mobilityIda: 2500, mobilityVolta: 2500 });
    expect(r.mobilidadeCents).toBe(5000);
  });

  it("registro legado sem total: usa ida + volta", () => {
    const r = flashAmountsFromBudgetActual({ mobility: 0, mobilityIda: 1800, mobilityVolta: 2200 });
    expect(r.mobilidadeCents).toBe(4000);
  });

  it("diária, ajuda de custo e translado são ignorados", () => {
    const r = flashAmountsFromBudgetActual({
      dailyQuantity: 3, dailyValue: 25000, costAssistance: 10000, transport: 8000,
      weekdayLunch: 800, mobility: 5000,
    } as any);
    expect(r).toEqual({ alimentacaoCents: 800, mobilidadeCents: 5000 });
  });

  it("percurso / sem valores → tudo zero e nenhum lançamento", () => {
    const r = flashAmountsFromBudgetActual({ weekdayLunch: 0, mobility: 0, mobilityIda: 0, mobilityVolta: 0 });
    expect(r).toEqual({ alimentacaoCents: 0, mobilidadeCents: 0 });
    expect(flashMovementsToSync(r)).toEqual([]);
  });

  it("realizado ausente → zero", () => {
    expect(flashAmountsFromBudgetActual(null)).toEqual({ alimentacaoCents: 0, mobilidadeCents: 0 });
    expect(flashAmountsFromBudgetActual(undefined)).toEqual({ alimentacaoCents: 0, mobilidadeCents: 0 });
  });

  it("valores nulos/negativos/NaN não somam", () => {
    const r = flashAmountsFromBudgetActual({
      weekdayLunch: null, weekdayDinner: -500, weekendLunch: NaN as any, weekendDinner: 1000,
      mobility: null, mobilityIda: -1, mobilityVolta: 700,
    });
    expect(r).toEqual({ alimentacaoCents: 1000, mobilidadeCents: 700 });
  });

  it("colaborador de casa: usa o que está gravado, não recalcula", () => {
    // casa em dia útil tem só a "diferença" (R$ 8) gravada no Realizado
    const r = flashAmountsFromBudgetActual({ weekdayLunch: 800, weekdayDinner: 0, weekendLunch: 0, weekendDinner: 0, mobility: 3200 });
    expect(r).toEqual({ alimentacaoCents: 800, mobilidadeCents: 3200 });
  });
});

describe("flashMovementsToSync", () => {
  it("um lançamento por categoria com valor > 0", () => {
    expect(flashMovementsToSync({ alimentacaoCents: 7500, mobilidadeCents: 5000 })).toEqual([
      { category: "alimentacao", amountCents: 7500 },
      { category: "mobilidade", amountCents: 5000 },
    ]);
  });
  it("categoria zerada fica de fora", () => {
    expect(flashMovementsToSync({ alimentacaoCents: 0, mobilidadeCents: 5000 })).toEqual([
      { category: "mobilidade", amountCents: 5000 },
    ]);
    expect(flashMovementsToSync({ alimentacaoCents: 900, mobilidadeCents: 0 })).toEqual([
      { category: "alimentacao", amountCents: 900 },
    ]);
  });
});

describe("flashOcDescription / isAutomaticFlashMovement", () => {
  it("descrição padrão com OC e evento", () => {
    expect(flashOcDescription(" 12345 ", "Night Run")).toBe("Automático — OC nº 12345 · Night Run");
    expect(flashOcDescription("", null)).toBe("Automático — OC nº —");
  });
  it("automático = sourceType 'oc'", () => {
    expect(isAutomaticFlashMovement({ sourceType: "oc" })).toBe(true);
    expect(isAutomaticFlashMovement({ sourceType: "manual" })).toBe(false);
    expect(isAutomaticFlashMovement({})).toBe(false);
    expect(isAutomaticFlashMovement(null)).toBe(false);
  });
});
