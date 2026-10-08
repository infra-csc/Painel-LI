// Redesenho 08/10 da Conta corrente Flash: recorte da lista pelo alvo, sem
// resultado com "Limpar filtros" e a exclusão com o saldo antes → depois.
import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { AccountsList, DeleteMovementDialog, ResumoDoFlash, type AccountsListProps } from "./flash-cards";

const ROWS: AccountsListProps["linhas"] = [
  { collaboratorId: "c1", name: "ANA SOUZA", food: 35000, mobility: 15000, count: 2, belowTarget: false },
  { collaboratorId: "c2", name: "BRUNO LIMA", food: 8210, mobility: 15000, count: 5, belowTarget: true },
];

function montarLista(extras: Partial<AccountsListProps> = {}) {
  const props: AccountsListProps = {
    search: "", setSearch: vi.fn(), movementsCount: 7, selectedCollabId: "", onSelect: vi.fn(),
    situacao: "todas", onSituacao: vi.fn(), contagem: { todas: 2, abaixo: 1, "no-alvo": 1 },
    linhas: ROWS, totalDeContas: 2,
    ...extras,
  };
  return { ...renderComTudo(<AccountsList {...props} />), props };
}

describe("AccountsList", () => {
  it("mostra o nome formatado, a situação do alvo e abre a conta", async () => {
    const { user, props } = montarLista();
    expect(screen.getByText("Ana Souza")).toBeInTheDocument();
    expect(within(screen.getByTestId("flash-conta-c2")).getByText("Abaixo")).toBeInTheDocument();
    expect(within(screen.getByTestId("flash-conta-c1")).getByText("No alvo")).toBeInTheDocument();
    await user.click(screen.getByTestId("flash-conta-c2"));
    expect(props.onSelect).toHaveBeenCalledWith("c2");
  });

  it("o recorte conta cada lado e avisa qual está ligado", async () => {
    const { user, props } = montarLista();
    const abaixo = screen.getByTestId("flash-situacao-abaixo");
    expect(abaixo).toHaveAccessibleName("Abaixo do alvo (1)");
    await user.click(abaixo);
    expect(props.onSituacao).toHaveBeenCalledWith("abaixo");
    expect(screen.getByTestId("flash-situacao-todas")).toHaveAttribute("aria-pressed", "true");
  });

  it("sem resultado: diz o que buscou e limpa busca e recorte", async () => {
    const { user, props } = montarLista({ search: "zzz", linhas: [], contagem: { todas: 0, abaixo: 0, "no-alvo": 0 } });
    expect(screen.getByText("Nenhuma conta com “zzz”")).toBeInTheDocument();
    await user.click(screen.getByTestId("flash-limpar-filtros"));
    expect(props.setSearch).toHaveBeenCalledWith("");
    expect(props.onSituacao).toHaveBeenCalledWith("todas");
  });
});

describe("ResumoDoFlash", () => {
  it("'Abaixo do alvo' recorta a lista e fica desligado quando não há nenhuma", async () => {
    const onVerAbaixo = vi.fn();
    const { user, rerender } = renderComTudo(<ResumoDoFlash totals={{ accounts: 13, food: 411210, mobility: 143850, below: 4 }} abaixoAtivo={false} onVerAbaixo={onVerAbaixo} />);
    expect(screen.getByTestId("flash-saldo-alimentacao")).toHaveTextContent("R$ 4.112,10");
    await user.click(screen.getByTestId("flash-abaixo-do-alvo"));
    expect(onVerAbaixo).toHaveBeenCalled();
    rerender(<ResumoDoFlash totals={{ accounts: 13, food: 1, mobility: 1, below: 0 }} abaixoAtivo={false} onVerAbaixo={onVerAbaixo} />);
    expect(screen.getByTestId("flash-abaixo-do-alvo")).toBeDisabled();
  });
});

describe("DeleteMovementDialog", () => {
  it("mostra o lançamento e o saldo da categoria antes → depois; só fecha pelo servidor", async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const { user } = renderComTudo(
      <DeleteMovementDialog
        movement={{ id: "m1", collaboratorId: "c1", category: "mobilidade", type: "credito", amountCents: 15000, movementDate: "2026-07-20", description: "Crédito inicial — admissão" }}
        saldoAtual={8850}
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );
    const resumo = screen.getByTestId("flash-excluir-resumo");
    expect(resumo).toHaveTextContent("Crédito · Mobilidade · 20/07/2026");
    expect(resumo).toHaveTextContent("+R$ 150,00");
    expect(resumo).toHaveTextContent("-R$ 61,50");
    await user.click(screen.getByTestId("flash-excluir-confirmar"));
    expect(onConfirm).toHaveBeenCalledWith("m1");
    expect(onClose).not.toHaveBeenCalled();
  });
});
