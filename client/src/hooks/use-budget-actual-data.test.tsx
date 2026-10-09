// Realizado (08/10): o titular de uma divisão mostrava o planejado PROPORCIONAL
// no cartão e o CHEIO no modal. Agora os dois usam `getPlannedDaPrestacao`.
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { BudgetPlanned } from "@shared/schema";
import { criarWrapper } from "@/test/render";
import { realizadoFake } from "@/test/fixtures-dominio";
import { useBudgetActualData } from "./use-budget-actual-data";

const planejado = {
  id: "p1", eventId: "evento-1", collaboratorId: "colab-1", functionId: "funcao-1", collaboratorType: "freela",
  dailyQuantity: 4, dailyValue: 10000, costAssistance: 0, weekdayLunch: 0, weekdayDinner: 0, weekendLunch: 0, weekendDinner: 0,
  mobility: 4000, mobilityIda: 2000, mobilityVolta: 2000, transport: 0, totalValue: 44000, didNotAttend: false, didNotAttendReason: null,
} as unknown as BudgetPlanned;

// Seg 13/04 → qui 16/04: titular ficou com 3 dias, a divisão com 1.
const titular = realizadoFake({ id: "a1", plannedId: "p1", collaboratorId: "colab-1", workedDays: ["2026-04-13", "2026-04-14", "2026-04-15"], sentForReview: false });
const divisao = realizadoFake({ id: "a2", plannedId: "p1", collaboratorId: "colab-2", splitParentId: "a1", workedDays: ["2026-04-16"], sentForReview: false });

function montar() {
  const { Wrapper } = criarWrapper();
  return renderHook(() => useBudgetActualData({
    selectedEventId: "evento-1",
    budgetActual: [titular, divisao],
    budgetPlanned: [planejado],
    teamInclusions: [],
    selectedEvent: undefined,
    getCollaboratorName: (id) => (id === "colab-1" ? "Ana Souza" : "Bruno Lima"),
    getFunctionName: () => "Produção",
  }), { wrapper: Wrapper });
}

describe("useBudgetActualData — planejado da prestação", () => {
  it("o titular de uma divisão recebe o planejado proporcional (o mesmo do cartão)", () => {
    const { result } = montar();
    const dados = result.current;
    const doModal = dados.getPlannedDaPrestacao(titular);
    const doCartao = dados.getCardPlanned(titular, { isGParent: true });
    expect(doModal).toEqual(doCartao);
    expect(doModal?.totalValue).toBeLessThan(planejado.totalValue);
    expect(doModal?.mobility).toBe(3000); // 3 de 4 dias
  });

  it("o filho da divisão também, e uma prestação avulsa fica com o planejado cheio", () => {
    const { result } = montar();
    expect(result.current.getPlannedDaPrestacao(divisao)?.mobility).toBe(1000);
    const avulsa = realizadoFake({ id: "a9", plannedId: "p1" });
    expect(result.current.getPlannedDaPrestacao(avulsa)).toBe(planejado);
  });

  it("com o filho fora do recorte filtrado, o titular continua proporcional", () => {
    const { result } = montar();
    act(() => result.current.setSearchTerm("Ana"));
    expect(result.current.filteredItems.map(i => i.id)).toEqual(["a1"]);
    expect(result.current.getPlannedDaPrestacao(titular)?.mobility).toBe(3000);
  });
});

describe("useBudgetActualData — rateio de ida e volta e divergência (08/10)", () => {
  it("ida + volta do planejado rateado fecham com a mobilidade rateada", () => {
    const { result } = montar();
    const doTitular = result.current.getPlannedDaPrestacao(titular);
    expect(doTitular).toMatchObject({ mobility: 3000, mobilityIda: 1500, mobilityVolta: 1500 });
    const daDivisao = result.current.getPlannedDaPrestacao(divisao);
    expect(daDivisao).toMatchObject({ mobility: 1000, mobilityIda: 500, mobilityVolta: 500 });
  });

  it("o titular é comparado com o planejado PROPORCIONAL que o cartão mostra", () => {
    const { Wrapper } = criarWrapper();
    const bate = realizadoFake({ ...titular, totalValue: 33000 }); // 3 diárias de R$ 100 + R$ 30 de mobilidade
    const cheio = realizadoFake({ ...titular, id: "a3", totalValue: planejado.totalValue });
    const filhoDoCheio = realizadoFake({ ...divisao, id: "a4", splitParentId: "a3" });
    const { result } = renderHook(() => useBudgetActualData({
      selectedEventId: "evento-1",
      budgetActual: [bate, divisao, cheio, filhoDoCheio],
      budgetPlanned: [planejado],
      teamInclusions: [],
      selectedEvent: undefined,
      getCollaboratorName: () => "Ana Souza",
      getFunctionName: () => "Produção",
    }), { wrapper: Wrapper });
    expect(result.current.getPlannedDaPrestacao(bate)?.totalValue).toBe(33000);
    // Antes: comparado com o cheio (R$ 440) → sempre "divergente".
    expect(result.current.hasItemDivergence(bate)).toBe(false);
    // Igual ao CHEIO mas acima do proporcional → diverge.
    expect(result.current.hasItemDivergence(cheio)).toBe(true);
  });
});
