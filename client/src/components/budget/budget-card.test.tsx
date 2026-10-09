import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import type { BudgetPlanned } from "@shared/schema";
import { renderComTudo } from "@/test/render";
import { moeda, orcamentoFake, vagaDoPlanejado } from "@/test/orcamento-fixture";
import { BudgetCard, type BudgetCardProps } from "./budget-card";

function montar(extras: Partial<BudgetCardProps> = {}) {
  const acoes = { onToggleSelect: vi.fn(), onToggleCollapse: vi.fn(), onEdit: vi.fn(), onSend: vi.fn(), onNotAttended: vi.fn(), onRestore: vi.fn() };
  const budget = extras.budget ?? orcamentoFake();
  const props: BudgetCardProps = {
    budget, name: "Ana Souza", functionName: "Produção",
    isSent: false, isSelected: false, isCollapsed: false, isHighlighted: false,
    planRecord: undefined, cardActual: undefined, eventNotes: [],
    canEdit: true, canMarkNotAttended: true, restorePending: false,
    ...acoes, ...extras,
  };
  const utils = renderComTudo(<BudgetCard {...props} />);
  return { ...utils, ...acoes, budget, card: utils.container.querySelector("[data-card-id]") as HTMLElement };
}

describe("BudgetCard", () => {
  it("mostra o que o motor calculou: diárias, alimentação, mobilidade e o total planejado", () => {
    const { budget, card } = montar();
    // Sanidade da vaga fixa: sex 10 → dom 12 = 1 dia útil + 2 de fim de semana.
    expect(budget.weekdays).toBe(1);
    expect(budget.weekends).toBe(2);
    expect(card).toHaveTextContent("Ana Souza");
    expect(card).toHaveTextContent("Produção");
    expect(card).toHaveTextContent("Freela");
    expect(card).toHaveTextContent("10/04–12/04");
    // Alguns valores podem coincidir entre blocos (ex.: alimentação total = mobilidade); basta existirem.
    const mostra = (centavos: number) => expect(within(card).getAllByText(moeda(centavos)).length).toBeGreaterThan(0);
    mostra(budget.subtotalDiarias);
    mostra(budget.almocoSemana + budget.jantarSemana + budget.almocoFds + budget.jantarFds);
    mostra(budget.mobilidade);
    expect(card).toHaveTextContent("Total planejado");
    mostra(budget.totalFinal);
    expect(card).toHaveTextContent("1 dia útil");
    mostra(budget.valorDiariaUtil);
    mostra(budget.valorDiariaFds);
  });

  it("override de valor recalcula SÓ aquela vaga: o card com override marca 'Valores personalizados' e o outro fica igual", () => {
    const base = orcamentoFake();
    const comOverride = orcamentoFake({ override: { valorDiaria: 50000, valorDiariaUtil: 50000, valorDiariaFds: 50000 } });
    expect(base.hasOverride).toBe(false);
    expect(comOverride.hasOverride).toBe(true);
    expect(comOverride.totalFinal).not.toBe(base.totalFinal);
    expect(comOverride.subtotalDiarias).toBe(50000 * comOverride.diasComDiaria);

    const { card, unmount } = montar({ budget: comOverride });
    expect(within(card).getByTitle("Valores personalizados")).toBeInTheDocument();
    expect(within(card).getByText(moeda(comOverride.totalFinal))).toBeInTheDocument();
    expect(card).toHaveClass("border-warning/25");
    unmount();

    const { card: outro } = montar({ budget: base });
    expect(within(outro).queryByTitle("Valores personalizados")).toBeNull();
    expect(within(outro).getByText(moeda(base.totalFinal))).toBeInTheDocument();
  });

  it("ações do card ativo: selecionar, editar, enviar para o Realizado, recolher", async () => {
    const { user, budget, onToggleSelect, onEdit, onSend, onToggleCollapse } = montar();
    await user.click(screen.getByRole("checkbox", { name: "Selecionar Ana Souza" }));
    await user.click(screen.getByRole("button", { name: "Editar valores de Ana Souza" }));
    await user.click(screen.getByRole("button", { name: "Enviar Ana Souza para o Realizado" }));
    await user.click(screen.getByRole("button", { name: "Recolher card de Ana Souza" }));
    expect(onToggleSelect).toHaveBeenCalledWith(budget.inclusion.id);
    expect(onEdit).toHaveBeenCalledWith(budget);
    expect(onSend).toHaveBeenCalledWith(budget.inclusion.id);
    expect(onToggleCollapse).toHaveBeenCalledWith(budget.inclusion.id);
  });

  it("enviado (isSent): 'Enviado', cadeado no lugar do checkbox, só visualizar — abre o modal em modo leitura", async () => {
    const { user, budget, onEdit } = montar({ isSent: true });
    expect(screen.getByText("Enviado")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /Editar valores/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /para o Realizado/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /não participou/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Visualizar detalhes de Ana Souza" }));
    expect(onEdit).toHaveBeenCalledWith(budget, true);
  });

  it("recolhido esconde o corpo (os três blocos) e o botão vira 'Expandir'", () => {
    const { card } = montar({ isCollapsed: true });
    expect(card).not.toHaveTextContent("Alimentação");
    expect(card).not.toHaveTextContent("Mobilidade");
    expect(screen.getByRole("button", { name: "Expandir card de Ana Souza" })).toBeInTheDocument();
    expect(card).toHaveTextContent("Total planejado"); // o rodapé continua
  });

  it("'Não participou': cabeçalho inativo, total riscado como 'Não contabilizado' e 'Restaurar' com o período", async () => {
    const plano = { id: "plan-1", didNotAttend: true, didNotAttendReason: "Viajou" } as BudgetPlanned;
    const { user, card, onRestore } = montar({ planRecord: plano });
    expect(card).toHaveTextContent("Não participou");
    expect(card).toHaveTextContent('"Viajou"');
    expect(card).toHaveTextContent("Não contabilizado");
    expect(screen.queryByRole("checkbox")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Restaurar" }));
    expect(onRestore).toHaveBeenCalledWith({ id: "plan-1", name: "Ana Souza", functionName: "Produção", startDate: "2026-04-10", endDate: "2026-04-12" });
  });

  it("'Marcar como não participou' passa o orçamento quando ainda não há registro de planejado", async () => {
    const { user, budget, onNotAttended } = montar();
    await user.click(screen.getByRole("button", { name: "Marcar Ana Souza como não participou" }));
    expect(onNotAttended).toHaveBeenCalledWith({ id: undefined, budget, name: "Ana Souza", functionName: "Produção" });
  });

  it("colaborador da casa: 'Casa' e diária só no fim de semana (CLT)", () => {
    const casa = orcamentoFake({ collaboratorType: "casa", vaga: vagaDoPlanejado({ collaboratorId: "colab-casa" }) });
    const { card } = montar({ budget: casa });
    expect(within(card).getByText("Casa")).toBeInTheDocument();
    expect(casa.regraDiaria).toBe("fds");
    expect(card).toHaveTextContent("sem diária (CLT)");
    expect(within(card).getByText(moeda(casa.valorDiariaFds))).toBeInTheDocument();
  });
});
