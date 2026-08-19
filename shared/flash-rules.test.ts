import { describe, it, expect } from "vitest";
import {
  flashAmountsFromBudgetActual, flashMovementsToSync, isAutomaticFlashMovement,
  flashComparativoDescription, flashComparisonTotals, flashMovementKey, flashMovementsForComparison,
  flashSourceLabel, isFlashCreditableActual, type FlashComparisonActual,
} from "./flash-rules";

describe("flashAmountsFromBudgetActual (alimentação + mobilidade entram; diária não)", () => {
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

// ── Regra 19/08: crédito na aprovação do COMPARATIVO (substitui a da OC) ──────

/** Prestação enviada ao RH, com almoço de semana e mobilidade. */
const prestacao = (over: Partial<FlashComparisonActual> = {}): FlashComparisonActual => ({
  id: "a1", collaboratorId: "c1", didNotAttend: false, sentForReview: true, rhStatus: "pendente",
  weekdayLunch: 2000, weekdayDinner: 0, weekendLunch: 0, weekendDinner: 0, mobility: 3000,
  ...over,
});

describe("isFlashCreditableActual (quem entra no crédito do comparativo)", () => {
  it("enviada ao RH e pendente entra", () => {
    expect(isFlashCreditableActual(prestacao())).toBe(true);
  });
  it("aprovada pelo RH entra mesmo sem sentForReview", () => {
    expect(isFlashCreditableActual(prestacao({ sentForReview: false, rhStatus: "aprovado" }))).toBe(true);
  });
  it("não participou nunca entra", () => {
    expect(isFlashCreditableActual(prestacao({ didNotAttend: true }))).toBe(false);
    expect(isFlashCreditableActual(prestacao({ didNotAttend: true, rhStatus: "aprovado" }))).toBe(false);
  });
  it("devolvida ou rejeitada ficam de fora até o reenvio", () => {
    expect(isFlashCreditableActual(prestacao({ rhStatus: "devolvido" }))).toBe(false);
    expect(isFlashCreditableActual(prestacao({ rhStatus: "rejeitado" }))).toBe(false);
  });
  it("ainda não enviada fica de fora", () => {
    expect(isFlashCreditableActual(prestacao({ sentForReview: false }))).toBe(false);
  });
  it("sem colaborador fica de fora (coluna NOT NULL no Flash)", () => {
    expect(isFlashCreditableActual(prestacao({ collaboratorId: null }))).toBe(false);
  });
  it("prestação ausente → false", () => {
    expect(isFlashCreditableActual(null)).toBe(false);
    expect(isFlashCreditableActual(undefined)).toBe(false);
  });
});

describe("flashMovementsForComparison (montagem a partir das prestações do evento)", () => {
  it("um par (alimentação, mobilidade) por prestação, amarrado ao budget_actual.id", () => {
    const out = flashMovementsForComparison([
      prestacao({ id: "a1", collaboratorId: "c1" }),
      prestacao({ id: "a2", collaboratorId: "c2", weekdayLunch: 1500, mobility: 1000 }),
    ]);
    expect(out).toEqual([
      { actualId: "a1", collaboratorId: "c1", category: "alimentacao", amountCents: 2000 },
      { actualId: "a1", collaboratorId: "c1", category: "mobilidade", amountCents: 3000 },
      { actualId: "a2", collaboratorId: "c2", category: "alimentacao", amountCents: 1500 },
      { actualId: "a2", collaboratorId: "c2", category: "mobilidade", amountCents: 1000 },
    ]);
  });

  it("mesmo colaborador em duas funções → dois pares rastreáveis (um por prestação)", () => {
    const out = flashMovementsForComparison([
      prestacao({ id: "a1", collaboratorId: "c1" }),
      prestacao({ id: "a2", collaboratorId: "c1" }),
    ]);
    expect(out.map(m => m.actualId)).toEqual(["a1", "a1", "a2", "a2"]);
    expect(new Set(out.map(m => m.collaboratorId)).size).toBe(1);
    // chaves lógicas distintas → nada colide no sync
    expect(new Set(out.map(m => flashMovementKey({ sourceRef: m.actualId, category: m.category }))).size).toBe(4);
  });

  it("didNotAttend fica de fora do conjunto", () => {
    const out = flashMovementsForComparison([
      prestacao({ id: "a1" }),
      prestacao({ id: "a2", collaboratorId: "c2", didNotAttend: true }),
    ]);
    expect(out.map(m => m.actualId)).toEqual(["a1", "a1"]);
  });

  it("valor zero não gera lançamento (percurseiro: alimentação e mobilidade 0)", () => {
    const out = flashMovementsForComparison([
      prestacao({ id: "a1", weekdayLunch: 0, weekdayDinner: 0, weekendLunch: 0, weekendDinner: 0, mobility: 0 }),
      prestacao({ id: "a2", collaboratorId: "c2", weekdayLunch: 0, weekdayDinner: 0, weekendLunch: 0, weekendDinner: 0, mobility: 4200 }),
    ]);
    expect(out).toEqual([
      { actualId: "a2", collaboratorId: "c2", category: "mobilidade", amountCents: 4200 },
    ]);
  });

  it("diária alta não entra — só alimentação e mobilidade", () => {
    const out = flashMovementsForComparison([
      prestacao({ id: "a1", dailyQuantity: 4, dailyValue: 30000, transport: 9000 } as any),
    ]);
    expect(flashComparisonTotals(out)).toEqual({ alimentacaoCents: 2000, mobilidadeCents: 3000 });
  });

  it('"não participou" marcado no PLANEJADO também exclui (o comparativo zera o grupo)', () => {
    const actuals = [
      prestacao({ id: "a1", plannedId: "p1" }),
      prestacao({ id: "a2", collaboratorId: "c2", plannedId: "p2" }),
    ];
    const planned = [
      { id: "p1", didNotAttend: true },
      { id: "p2", didNotAttend: false },
    ];
    expect(flashMovementsForComparison(actuals, planned).map(m => m.actualId)).toEqual(["a2", "a2"]);
    // sem o planejado em mãos, a regra só olha a prestação
    expect(flashMovementsForComparison(actuals)).toHaveLength(4);
  });

  it("filho de divisão herda o plannedId do pai — o grupo inteiro sai junto", () => {
    const actuals = [
      prestacao({ id: "pai", plannedId: "p1" }),
      prestacao({ id: "filho", collaboratorId: "c2", plannedId: "p1" }),
    ];
    expect(flashMovementsForComparison(actuals, [{ id: "p1", didNotAttend: true }])).toEqual([]);
  });

  it("sem plannedId, casa o planejado por evento + colaborador + função", () => {
    const a = prestacao({ id: "a1", plannedId: null, eventId: "e1", functionId: "f1" });
    const planned = [{ id: "p9", eventId: "e1", collaboratorId: "c1", functionId: "f1", didNotAttend: true }];
    expect(flashMovementsForComparison([a], planned)).toEqual([]);
    // função diferente → não é a mesma vaga, continua creditando
    expect(flashMovementsForComparison([a], [{ ...planned[0], functionId: "f2" }])).toHaveLength(2);
  });

  it("evento sem prestações elegíveis → nenhum lançamento", () => {
    expect(flashMovementsForComparison([])).toEqual([]);
    expect(flashMovementsForComparison(null)).toEqual([]);
    expect(flashMovementsForComparison([prestacao({ rhStatus: "devolvido" })])).toEqual([]);
  });

  it("totais somam por categoria (resumo do toast)", () => {
    const out = flashMovementsForComparison([
      prestacao({ id: "a1" }),
      prestacao({ id: "a2", collaboratorId: "c2", weekdayLunch: 500, mobility: 700 }),
    ]);
    expect(flashComparisonTotals(out)).toEqual({ alimentacaoCents: 2500, mobilidadeCents: 3700 });
  });
});

describe("idempotência e estorno por chave lógica (sourceRef, category)", () => {
  /** Espelha o sync do servidor: casa o desejado com o existente pela chave. */
  const reconcile = (
    wanted: ReturnType<typeof flashMovementsForComparison>,
    existing: Array<{ id: string; sourceRef: string; category: string; amountCents: number }>,
  ) => {
    const byKey = new Map(existing.map(m => [flashMovementKey(m), m]));
    const created: string[] = [], updated: string[] = [], kept: string[] = [];
    const handled = new Set<string>();
    for (const w of wanted) {
      const key = flashMovementKey({ sourceRef: w.actualId, category: w.category });
      handled.add(key);
      const prev = byKey.get(key);
      if (!prev) created.push(key);
      else if (prev.amountCents !== w.amountCents) updated.push(key);
      else kept.push(key);
    }
    const removed = existing.filter(m => !handled.has(flashMovementKey(m))).map(m => m.id);
    return { created, updated, kept, removed };
  };

  const evento = [prestacao({ id: "a1" }), prestacao({ id: "a2", collaboratorId: "c2", weekdayLunch: 900, mobility: 0 })];

  it("primeira aprovação cria tudo", () => {
    const r = reconcile(flashMovementsForComparison(evento), []);
    expect(r.created).toEqual(["a1|alimentacao", "a1|mobilidade", "a2|alimentacao"]);
    expect(r.removed).toEqual([]);
  });

  it("reaprovar sem mudanças não duplica nem altera nada", () => {
    const wanted = flashMovementsForComparison(evento);
    const existing = wanted.map((w, i) => ({ id: `m${i}`, sourceRef: w.actualId, category: w.category, amountCents: w.amountCents }));
    const r = reconcile(wanted, existing);
    expect(r.created).toEqual([]);
    expect(r.updated).toEqual([]);
    expect(r.removed).toEqual([]);
    expect(r.kept).toHaveLength(3);
  });

  it("RH ajustou o valor → atualiza o mesmo lançamento", () => {
    const before = flashMovementsForComparison(evento);
    const existing = before.map((w, i) => ({ id: `m${i}`, sourceRef: w.actualId, category: w.category, amountCents: w.amountCents }));
    const after = flashMovementsForComparison([prestacao({ id: "a1", weekdayLunch: 4000 }), evento[1]]);
    const r = reconcile(after, existing);
    expect(r.updated).toEqual(["a1|alimentacao"]);
    expect(r.created).toEqual([]);
    expect(r.removed).toEqual([]);
  });

  it("prestação marcada como 'não participou' depois → seu lançamento é removido", () => {
    const before = flashMovementsForComparison(evento);
    const existing = before.map((w, i) => ({ id: `m${i}`, sourceRef: w.actualId, category: w.category, amountCents: w.amountCents }));
    const after = flashMovementsForComparison([prestacao({ id: "a1", didNotAttend: true }), evento[1]]);
    const r = reconcile(after, existing);
    expect(r.removed).toEqual(["m0", "m1"]);
    expect(r.kept).toEqual(["a2|alimentacao"]);
  });

  it("estorno (rejeitar/devolver) remove todos os automáticos do comparativo", () => {
    const before = flashMovementsForComparison(evento);
    const existing = before.map((w, i) => ({ id: `m${i}`, sourceRef: w.actualId, category: w.category, amountCents: w.amountCents }));
    const r = reconcile([], existing);
    expect(r.removed).toEqual(["m0", "m1", "m2"]);
    expect(r.created).toEqual([]);
  });

  it("reaprovar depois do estorno recria os mesmos lançamentos", () => {
    const wanted = flashMovementsForComparison(evento);
    const r = reconcile(wanted, []);
    expect(r.created).toHaveLength(3);
    expect(flashComparisonTotals(wanted)).toEqual({ alimentacaoCents: 2900, mobilidadeCents: 3000 });
  });
});

describe("descrições e origem do lançamento", () => {
  it("descrição do comparativo aprovado com o evento", () => {
    expect(flashComparativoDescription("Night Run")).toBe("Automático — Comparativo aprovado · Night Run");
    expect(flashComparativoDescription(null)).toBe("Automático — Comparativo aprovado");
  });
  it("automático = tudo que não é 'manual'", () => {
    expect(isAutomaticFlashMovement({ sourceType: "comparativo" })).toBe(true);
    expect(isAutomaticFlashMovement({ sourceType: "oc" })).toBe(true);
    expect(isAutomaticFlashMovement({ sourceType: "manual" })).toBe(false);
    // origem ausente conta como manual (coluna NOT NULL DEFAULT 'manual')
    expect(isAutomaticFlashMovement({})).toBe(false);
    expect(isAutomaticFlashMovement({ sourceType: null })).toBe(false);
    expect(isAutomaticFlashMovement(null)).toBe(false);
    expect(isAutomaticFlashMovement(undefined)).toBe(false);
  });
  it("rótulo da origem para extrato e CSV", () => {
    expect(flashSourceLabel("comparativo")).toBe("Comparativo");
    expect(flashSourceLabel("oc")).toBe("OC (legado)");
    expect(flashSourceLabel("manual")).toBe("Manual");
    expect(flashSourceLabel(null)).toBe("Manual");
  });
});
