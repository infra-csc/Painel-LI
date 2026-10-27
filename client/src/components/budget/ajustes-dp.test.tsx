/**
 * Ajustes pedidos pelo DP (28/10) nas telas: o cartão do Planejado diz os
 * dias com 1,5 diária, o VR e a empreita sem mobilidade; a fileira de dias
 * alterna; o "Voltar ao Planejado" exige motivo, explica o bloqueio e chama a
 * rota; o "Ajustar o realizado" zera ida e volta juntos.
 */
import { describe, it, expect, vi } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, urlsChamadas } from "@/test/fixtures";
import { moeda, orcamentoFake, vagaDoPlanejado } from "@/test/orcamento-fixture";
import { realizadoFake } from "@/test/fixtures-dominio";
import { BudgetCard, type BudgetCardProps } from "./budget-card";
import { VoltarAoPlanejadoDialog } from "./voltar-ao-planejado-dialog";
import { FileiraDeMeiaDiaria } from "@/components/common/meia-diaria";

function cartao(budget: BudgetCardProps["budget"]) {
  const props: BudgetCardProps = {
    budget, name: "Ana Souza", functionName: "Produção",
    isSent: false, isSelected: false, isCollapsed: false, isHighlighted: false,
    planRecord: undefined, cardActual: undefined, eventNotes: [],
    canEdit: true, canMarkNotAttended: true, restorePending: false, situacao: "pendente",
    onToggleSelect: vi.fn(), onToggleCollapse: vi.fn(), onEdit: vi.fn(), onSend: vi.fn(), onNotAttended: vi.fn(),
    onRestore: vi.fn(), onPreAprovar: vi.fn(), onDesfazerPreAprovacao: vi.fn(),
  };
  return renderComTudo(<BudgetCard {...props} />);
}

describe("cartão do Planejado (28/10)", () => {
  it("1,5 diária: diz o dia e quanto o ½ somou (já dentro das Diárias)", () => {
    const budget = orcamentoFake({ vaga: vagaDoPlanejado({ diasMeiaExtra: ["2026-04-11"] }) });
    expect(budget.subtotalMeiasDiarias).toBeGreaterThan(0);
    cartao(budget);
    const linha = screen.getByTestId("planejado-meia-diaria");
    expect(linha).toHaveTextContent("1 dia com 1,5 diária (11/04)");
    expect(screen.getByText(`+${moeda(budget.subtotalMeiasDiarias)}`)).toBeInTheDocument();
    expect(screen.getAllByText(moeda(budget.subtotalDiarias)).length).toBeGreaterThan(0);
  });

  it("VR R$ 40,50 de um colaborador da casa: 'cobre o almoço'", () => {
    const budget = orcamentoFake({ collaboratorType: "casa", vrDiarioCents: 4_050 });
    expect(budget.unitAlmocoSemana).toBe(0);
    cartao(budget);
    expect(screen.getByTestId("planejado-vr")).toHaveTextContent(`VR ${moeda(4_050)} cobre o almoço`);
  });

  it("empreita da tabela: mobilidade zerada com a razão", () => {
    const budget = orcamentoFake({ functionName: "Cenotécnica", vaga: vagaDoPlanejado({ cenoFreelaTipo: "viagem", needsTicket: true }) });
    expect(budget.empreitaSemMobilidade).toBe(true);
    cartao(budget);
    expect(screen.getByTestId("planejado-empreita-sem-mobilidade")).toHaveTextContent("sem mobilidade (empreita)");
  });
});

describe("FileiraDeMeiaDiaria", () => {
  it("cada dia alterna (aria-pressed) e o dia sem diária fica travado com o porquê", async () => {
    const onAlternar = vi.fn();
    const { user } = renderComTudo(
      <FileiraDeMeiaDiaria dias={[{ dia: "2026-04-10" }, { dia: "2026-04-11", bloqueio: "Sem diária neste dia" }]} marcados={new Set(["2026-04-10"])} onAlternar={onAlternar} />,
    );
    const [sexta, sabado] = screen.getAllByRole("button");
    expect(sexta).toHaveAttribute("aria-pressed", "true");
    expect(sexta).toHaveTextContent("1,5×");
    expect(sabado).toBeDisabled();
    await user.click(sexta);
    expect(onAlternar).toHaveBeenCalledWith("2026-04-10");
  });
});

describe("VoltarAoPlanejadoDialog", () => {
  it("com OC registrada só explica o bloqueio (sem o botão de voltar)", () => {
    renderComTudo(<VoltarAoPlanejadoDialog item={realizadoFake({ plannedId: "pl-1", ocNumero: "OC-9" })} nome="Lucas" funcao="Cenotécnica" onClose={vi.fn()} />);
    expect(screen.getByTestId("voltar-bloqueado")).toHaveTextContent("Já tem OC registrada");
    expect(screen.queryByTestId("voltar-confirmar")).not.toBeInTheDocument();
  });

  it("exige o motivo e chama a rota com ele", async () => {
    const fetchMock = mockarFetch((url) => url.includes("/voltar-ao-planejado")
      ? respostaJson({ ok: true, plannedId: "pl-1", legado: false, divisoesRemovidas: 0, comparativoAprovado: false, flash: null })
      : respostaJson([]));
    const onClose = vi.fn();
    const item = realizadoFake({ plannedId: "pl-1" });
    const { user } = renderComTudo(<VoltarAoPlanejadoDialog item={item} nome="Lucas" funcao="Cenotécnica" onClose={onClose} />);
    const dialogo = screen.getByTestId("dialogo-voltar-ao-planejado");
    await user.click(within(dialogo).getByTestId("voltar-confirmar"));
    expect(within(dialogo).getByText(/Escreva o motivo/)).toBeInTheDocument();
    expect(urlsChamadas(fetchMock).some((u) => u.includes("voltar-ao-planejado"))).toBe(false);

    await user.type(within(dialogo).getByTestId("voltar-motivo"), "Empreita sem mobilidade");
    await user.click(within(dialogo).getByTestId("voltar-confirmar"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const chamada = fetchMock.mock.calls.find(([u]) => String(u).includes(`/api/budget-actual/${item.id}/voltar-ao-planejado`));
    expect(chamada).toBeTruthy();
    expect(JSON.parse(String(chamada?.[1]?.body))).toEqual({ motivo: "Empreita sem mobilidade" });
  });
});
