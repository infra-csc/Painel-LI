// Redesenho 08/10 do extrato da Conta corrente Flash: entrada e saída em
// colunas separadas (com sinal), meses separados, total no pé e lançamento
// automático somente leitura.
import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { MovementsTable } from "./movements-table";
import type { ExtratoLinha } from "./flash-types";

function linha(p: Partial<ExtratoLinha> & { id: string }): ExtratoLinha {
  return {
    collaboratorId: "c1", category: "alimentacao", type: "credito", amountCents: 10000,
    movementDate: "2026-08-14", description: null, eventId: null, sourceType: "manual", sourceRef: null,
    signed: 10000, runningFood: 10000, runningMobility: 0,
    ...p,
  };
}

const EXTRATO: ExtratoLinha[] = [
  linha({ id: "m1", movementDate: "2026-07-20", amountCents: 35000, signed: 35000, runningFood: 35000, description: "Crédito inicial — admissão" }),
  linha({ id: "m2", movementDate: "2026-08-14", type: "debito", amountCents: 8650, signed: -8650, runningFood: 26350, description: "Almoço na montagem", eventId: "e1" }),
  linha({ id: "m3", movementDate: "2026-08-24", amountCents: 32000, signed: 32000, runningFood: 58350, description: "Reposição alimentação", sourceType: "comparativo", sourceRef: "r1" }),
];

function montar(canManage = true) {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const r = renderComTudo(
    <MovementsTable extratoVisible={EXTRATO} canManage={canManage} getEventName={(id) => (id === "e1" ? "Night Run" : "")} onEdit={onEdit} onDelete={onDelete} />,
  );
  return { ...r, onEdit, onDelete };
}

describe("MovementsTable (extrato)", () => {
  it("põe a entrada e a saída em colunas separadas, com o sinal escrito", () => {
    montar();
    const credito = screen.getByTestId("flash-lancamento-m1");
    expect(within(credito).getByLabelText("Entrada de R$ 350,00")).toHaveTextContent("+R$ 350,00");
    expect(credito.querySelector('[data-col="saida"]')).toBeEmptyDOMElement();
    const debito = screen.getByTestId("flash-lancamento-m2");
    expect(within(debito).getByLabelText("Saída de R$ 86,50")).toHaveTextContent("−R$ 86,50");
    expect(debito.querySelector('[data-col="entrada"]')).toBeEmptyDOMElement();
    // Saldo da categoria depois do lançamento e o evento na linha de baixo.
    expect(within(debito).getByText("R$ 263,50")).toBeInTheDocument();
    expect(within(debito).getByText("Night Run")).toBeInTheDocument();
  });

  it("separa os meses e soma entradas e saídas no pé", () => {
    montar();
    expect(screen.getByText(/Julho de 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Agosto de 2026/)).toBeInTheDocument();
    const pe = screen.getByTestId("flash-extrato-totais");
    expect(pe).toHaveTextContent("+R$ 670,00");
    expect(pe).toHaveTextContent("−R$ 86,50");
  });

  it("o automático é somente leitura; o manual tem editar e excluir", async () => {
    const { user, onEdit, onDelete } = montar();
    const auto = screen.getByTestId("flash-lancamento-m3");
    expect(within(auto).queryByRole("button", { name: "Editar lançamento" })).toBeNull();
    expect(within(auto).getByText("somente leitura")).toBeInTheDocument();
    expect(within(auto).getByText("Automático · Comparativo")).toBeInTheDocument();

    const manual = screen.getByTestId("flash-lancamento-m2");
    await user.click(within(manual).getByRole("button", { name: "Editar lançamento" }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "m2" }));
    await user.click(within(manual).getByRole("button", { name: "Excluir lançamento" }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: "m2" }));
  });

  it("sem permissão de gestão, não há coluna de ações", () => {
    montar(false);
    expect(screen.queryByRole("button", { name: "Editar lançamento" })).toBeNull();
    expect(screen.queryByText("Ações")).toBeNull();
  });
});
