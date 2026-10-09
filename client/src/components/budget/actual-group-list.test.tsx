// Realizado (08/10): o "Total da escalação" de um grupo de divisão somava o
// filho marcado como "não participou" — agora usa as somas de
// @shared/comparativo (as mesmas do resumo e do Comparativo).
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import type { BudgetActual, BudgetPlanned } from "@shared/schema";
import { renderComTudo } from "@/test/render";
import { realizadoFake } from "@/test/fixtures-dominio";
import { moeda } from "@/test/orcamento-fixture";
import { useBudgetActualData } from "@/hooks/use-budget-actual-data";
import { ActualGroupList } from "./actual-group-list";

const planejado = {
  id: "p1", eventId: "evento-1", collaboratorId: "colab-1", functionId: "funcao-1", collaboratorType: "freela",
  dailyQuantity: 4, dailyValue: 10000, costAssistance: 0, weekdayLunch: 0, weekdayDinner: 0, weekendLunch: 0, weekendDinner: 0,
  mobility: 0, mobilityIda: 0, mobilityVolta: 0, transport: 0, totalValue: 40000, didNotAttend: false, didNotAttendReason: null,
} as unknown as BudgetPlanned;

const nome = (id?: string | null) => ({ "colab-1": "Ana Souza", "colab-2": "Bruno Lima", "colab-3": "Carla Dias" })[id ?? ""] ?? "—";

function Lista({ itens }: { itens: BudgetActual[] }) {
  const dados = useBudgetActualData({
    selectedEventId: "evento-1", budgetActual: itens, budgetPlanned: [planejado], teamInclusions: [],
    selectedEvent: undefined, getCollaboratorName: nome, getFunctionName: () => "Produção",
  });
  return (
    <ActualGroupList
      dados={dados} getCollaboratorName={nome} getFunctionName={() => "Produção"} eventNotes={[]} plannedLogs={[]}
      collapsedCards={new Set()} highlightCardId="" isRhOrAdmin={false} splitPending={false}
      onToggleCollapse={vi.fn()} onEdit={vi.fn()} onSplit={vi.fn()} onDelete={vi.fn()} onClearFilters={vi.fn()}
    />
  );
}

// Seg 13/04 → qui 16/04: titular com 2 dias, cada divisão com 1.
const titular = realizadoFake({ id: "a1", plannedId: "p1", collaboratorId: "colab-1", totalValue: 20000, workedDays: ["2026-04-13", "2026-04-14"] });
const presente = realizadoFake({ id: "a2", plannedId: "p1", collaboratorId: "colab-2", splitParentId: "a1", totalValue: 10000, workedDays: ["2026-04-15"] });

describe("ActualGroupList — Total da escalação", () => {
  it("o filho que não participou fica fora do total do grupo", () => {
    const ausente = realizadoFake({ id: "a3", plannedId: "p1", collaboratorId: "colab-3", splitParentId: "a1", totalValue: 10000, workedDays: ["2026-04-16"], didNotAttend: true });
    renderComTudo(<Lista itens={[titular, presente, ausente]} />);
    const pe = screen.getByTestId("realizado-total-escalacao");
    // Antes: R$ 400 (20 + 10 + 10 do ausente). Agora R$ 300, R$ 100 abaixo do planejado.
    expect(pe).toHaveTextContent(/−R\$\s100,00\s?R\$\s300,00$/);
    expect(pe).toHaveTextContent(`planejado ${moeda(40000)}`);
  });

  it("titular que não participou: o planejado sai e não há diferença", () => {
    const titularAusente = realizadoFake({ ...titular, totalValue: 0, didNotAttend: true });
    renderComTudo(<Lista itens={[titularAusente, presente]} />);
    const pe = screen.getByTestId("realizado-total-escalacao");
    expect(pe).toHaveTextContent(moeda(10000));
    expect(pe).not.toHaveTextContent(/planejado/);
  });
});
