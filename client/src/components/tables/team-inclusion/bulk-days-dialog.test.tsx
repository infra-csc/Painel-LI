/**
 * Diárias em lote (03/11): diária é pagamento e a mesma pessoa pode estar em vários
 * eventos — toda vaga aparece dentro do seu evento.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { BulkDaysDialog } from "./bulk-days-dialog";
import type { BulkDays } from "./use-bulk-days";

const vaga = (id: string, eventId: string, inclusionNumber: number) => ({
  id, eventId, inclusionNumber, collaboratorId: "c1", functionId: "f1", scheduleStartDate: "2026-11-06", scheduleEndDate: "2026-11-08",
});

function montar(targets: ReturnType<typeof vaga>[]) {
  const bulk = {
    showBatchDiarias: true, fechar: vi.fn(), targets, batchDiariasSelections: {}, changedIds: new Set<string>(),
    toggleBatchDay: vi.fn(), setDays: vi.fn(), handleSaveBatchDiarias: vi.fn(), isPending: false,
    descarteLote: { pedirParaFechar: vi.fn(), Dialogo: null },
  } as unknown as BulkDays;
  render(<BulkDaysDialog bulk={bulk} getEventName={(id) => (id === "e1" ? "Night Run Porto Alegre" : "Meia Maratona do Rio")} getCollaboratorName={() => "Pessoa Um"} getFunctionName={() => "Staff"} />);
}

describe("BulkDaysDialog", () => {
  it("a mesma pessoa em dois eventos: cada vaga fica sob o nome do seu evento, juntas mesmo fora de ordem", () => {
    montar([vaga("v1", "e1", 1), vaga("v2", "e2", 2), vaga("v3", "e1", 3)]);
    expect(screen.getByText(/3 vagas de 2 eventos/)).toBeInTheDocument();
    const noite = screen.getByTestId("lote-evento-e1");
    expect(within(noite).getByRole("heading", { level: 3 })).toHaveTextContent("Night Run Porto Alegre");
    expect(within(noite).getByRole("heading", { level: 3 })).toHaveTextContent("2 vagas");
    expect(within(noite).getByTestId("lote-linha-v1")).toBeInTheDocument();
    expect(within(noite).getByTestId("lote-linha-v3")).toBeInTheDocument();
    const rio = screen.getByTestId("lote-evento-e2");
    expect(within(rio).getByTestId("lote-linha-v2")).toBeInTheDocument();
  });

  it("um evento só: não repete a contagem de eventos na descrição", () => {
    montar([vaga("v1", "e1", 1)]);
    expect(screen.getByText(/^1 vaga — marque/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Night Run Porto Alegre");
  });
});
