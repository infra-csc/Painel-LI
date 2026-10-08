// Correções de lógica do Comparativo (08/10): "não participou" marcado só no
// Realizado, ida/volta gravadas como 0 + 0, etapa "Nota fiscal" antes do
// fechamento e o ajuste do RH abrindo valores em pt-BR.
import { describe, expect, it } from "vitest";
import { act, renderHook, screen, within } from "@testing-library/react";
import type { BudgetActual, BudgetComparison, BudgetPlanned } from "@shared/schema";
import { criarWrapper, renderComTudo } from "@/test/render";
import { realizadoFake } from "@/test/fixtures-dominio";
import { moeda } from "@/test/orcamento-fixture";
import { useBudgetComparisonData } from "@/hooks/use-budget-comparison-data";
import { useComparisonActions } from "@/hooks/use-budget-comparison-actions";
import { centavosParaCampo, type ComparisonRow } from "./comparison-utils";
import { SplitDetailDialog } from "./split-detail-dialog";
import { ResumoDoComparativo } from "./comparison-header";
import { RhEditActualDialog } from "./rh-edit-actual-dialog";

function planejadoFake(parcial: Partial<BudgetPlanned> = {}): BudgetPlanned {
  return {
    id: "planejado-1", eventId: "evento-1", collaboratorId: "colab-1", functionId: "funcao-1", collaboratorType: "freela",
    dailyQuantity: 3, dailyValue: 30000, costAssistance: 0, weekdayLunch: 0, weekdayDinner: 0, weekendLunch: 0, weekendDinner: 0,
    mobility: 0, mobilityIda: 0, mobilityVolta: 0, transport: 0, totalValue: 90000, observations: null, status: "pendente",
    approvedBy: null, approvedAt: null, createdBy: null, createdAt: new Date("2026-03-01T12:00:00Z"), updatedAt: new Date("2026-03-01T12:00:00Z"),
    updatedBy: null, didNotAttend: false, didNotAttendReason: null,
    ...parcial,
  } as BudgetPlanned;
}

const nome = (id?: string | null) => (id === "colab-1" ? "Ana Souza" : id === "colab-2" ? "Bruno Lima" : "—");

function dadosDoComparativo(budgetPlanned: BudgetPlanned[], budgetActual: BudgetActual[]) {
  const { Wrapper } = criarWrapper();
  return renderHook(() => useBudgetComparisonData({
    budgetPlanned, budgetActual, comparison: null, allTeamInclusions: [], getCollaboratorName: nome,
  }), { wrapper: Wrapper }).result.current;
}

describe("Comparativo — 'não participou' marcado só no Realizado", () => {
  it("fica fora do realizado, do planejado e da diferença (sem 'economia' negativa)", () => {
    const dados = dadosDoComparativo(
      [planejadoFake({ id: "p1", collaboratorId: "colab-1", totalValue: 90000 }), planejadoFake({ id: "p2", collaboratorId: "colab-2", totalValue: 50000 })],
      [
        realizadoFake({ id: "a1", plannedId: "p1", collaboratorId: "colab-1", totalValue: 0, didNotAttend: true, didNotAttendReason: "Doente" }),
        realizadoFake({ id: "a2", plannedId: "p2", collaboratorId: "colab-2", totalValue: 60000 }),
      ],
    );
    const ausente = dados.comparisonData.find(r => r.actual.id === "a1")!;
    expect(ausente.naoParticipou).toBe(true);
    expect(ausente.variance).toBe(0);
    expect(ausente.plannedNosTotais).toBe(0);
    expect(dados.totals.totalPlanned).toBe(50000);
    expect(dados.totals.totalActual).toBe(60000);
    expect(dados.totals.difference).toBe(10000);
  });

  it("o resumo conta quem não participou pelos dois lados", () => {
    const dados = dadosDoComparativo(
      [planejadoFake({ id: "p1" })],
      [realizadoFake({ id: "a1", plannedId: "p1", totalValue: 0, didNotAttend: true })],
    );
    renderComTudo(
      <ResumoDoComparativo selectedEvent={undefined} budgetActual={[]} comparisonData={dados.comparisonData} totals={dados.totals} naoEnviadas={0} />,
    );
    expect(screen.getByText(/1 não participou/)).toBeInTheDocument();
  });
});

describe("Comparativo — trilho de etapas", () => {
  const aprovadas = [realizadoFake({ rhStatus: "aprovado" }), realizadoFake({ rhStatus: "aprovado" })];
  const vazio = { totalPlanned: 0, totalActual: 0, difference: 0, totalCasa: 0, totalFreela: 0, nCasa: 0, nFreela: 0 };
  const resumo = (status: string | null) => (
    <ResumoDoComparativo selectedEvent={undefined} budgetActual={aprovadas} comparisonData={[] as ComparisonRow[]} totals={vazio} naoEnviadas={0} statusDoComparativo={status} />
  );

  it("tudo aprovado mas o comparativo aberto: a etapa atual é 'Aprovação RH'", () => {
    renderComTudo(resumo("pendente"));
    expect(screen.getByTestId("trilho-comparativo")).toHaveAttribute("aria-label", "Etapa atual: Aprovação RH");
  });

  it("comparativo aprovado (fechado): a etapa atual é 'Nota fiscal'", () => {
    renderComTudo(resumo("aprovado"));
    expect(screen.getByTestId("trilho-comparativo")).toHaveAttribute("aria-label", "Etapa atual: Nota fiscal");
  });
});

describe("Comparativo — modal da divisão", () => {
  it("ida/volta gravadas como 0 + 0 com mobilidade > 0 dividem a mobilidade ao meio", () => {
    const actual = realizadoFake({ mobility: 3000, mobilityIda: 0, mobilityVolta: 0, workedDays: ["2026-04-10"] });
    const plano = planejadoFake({ mobility: 4000, mobilityIda: 0, mobilityVolta: 0 });
    renderComTudo(
      <SplitDetailDialog
        splitDetail={{ actual, planned: plano, propPlanned: plano, isParent: false, allGroupDays: ["2026-04-10", "2026-04-11"] }}
        onClose={() => {}}
        getCollaboratorName={nome}
        getFunctionName={() => "Produção"}
      />,
    );
    const mobilidade = within(screen.getByRole("group", { name: "Mobilidade" }));
    const ida = mobilidade.getByText("Ida").closest(".cmp-item") as HTMLElement;
    const volta = mobilidade.getByText("Volta").closest(".cmp-item") as HTMLElement;
    expect(ida).toHaveTextContent(`Planejado: ${moeda(2000)}`);
    expect(ida).toHaveTextContent(`Realizado: ${moeda(1500)}`);
    expect(volta).toHaveTextContent(`Planejado: ${moeda(2000)}`);
    expect(volta).toHaveTextContent(`Realizado: ${moeda(1500)}`);
  });
});

describe("Comparativo — ajuste do RH", () => {
  it("centavos viram texto de campo em pt-BR", () => {
    expect(centavosParaCampo(10000)).toBe("100,00");
    expect(centavosParaCampo(150050)).toBe("1.500,50");
    expect(centavosParaCampo(0)).toBe("0,00");
  });

  it("o modal abre os valores em pt-BR ('100,00', não '100.00')", () => {
    const { Wrapper } = criarWrapper();
    const { result } = renderHook(() => useComparisonActions({
      selectedEventId: "evento-1", userId: "u1", comparison: null as BudgetComparison | null, isLoadingComparison: false,
      comparisonData: [], sortedData: [], selectedItems: new Set(), setSelectedItems: () => {},
    }), { wrapper: Wrapper });
    act(() => result.current.openEditModal(realizadoFake({ dailyValue: 10000, weekdayLunch: 2550, mobility: 150000 })));
    renderComTudo(<RhEditActualDialog acoes={result.current} />);
    expect(screen.getByLabelText("Valor por dia (R$)")).toHaveValue("100,00");
    expect(screen.getByLabelText("Almoço (dias úteis) (R$)")).toHaveValue("25,50");
    expect(screen.getByLabelText("Total (R$)")).toHaveValue("1.500,00");
  });
});
