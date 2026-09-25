// O hook com o AlertDialog de verdade. A regra pura está em use-confirmar-descarte.test.ts.
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { useConfirmarDescarte, type OpcoesDoDescarte } from "./use-confirmar-descarte";

function Formulario({ sujo, aoFechar, opcoes }: { sujo: boolean; aoFechar: () => void; opcoes?: OpcoesDoDescarte }) {
  const { pedirParaFechar, Dialogo, confirmando } = useConfirmarDescarte(sujo, opcoes);
  return (
    <>
      <button type="button" onClick={() => pedirParaFechar(aoFechar)}>Fechar formulário</button>
      <output data-testid="confirmando">{String(confirmando)}</output>
      {Dialogo}
    </>
  );
}

function montar(sujo: boolean, opcoes?: OpcoesDoDescarte) {
  const aoFechar = vi.fn();
  const utils = renderComTudo(<Formulario sujo={sujo} aoFechar={aoFechar} opcoes={opcoes} />);
  return { ...utils, aoFechar };
}

describe("useConfirmarDescarte", () => {
  it("sem alteração fecha na hora, sem diálogo", async () => {
    const { user, aoFechar } = montar(false);
    await user.click(screen.getByRole("button", { name: "Fechar formulário" }));
    expect(aoFechar).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("confirmando")).toHaveTextContent("false");
  });

  it("com alteração abre 'Descartar alterações?' e ainda não fecha", async () => {
    const { user, aoFechar } = montar(true);
    await user.click(screen.getByRole("button", { name: "Fechar formulário" }));
    const dialogo = screen.getByRole("alertdialog", { name: "Descartar alterações?" });
    expect(dialogo).toHaveAccessibleDescription("Você tem alterações não salvas.");
    expect(aoFechar).not.toHaveBeenCalled();
    expect(screen.getByTestId("confirmando")).toHaveTextContent("true");
  });

  it("'Descartar' chama aoFechar uma vez e fecha o diálogo", async () => {
    const { user, aoFechar } = montar(true);
    await user.click(screen.getByRole("button", { name: "Fechar formulário" }));
    await user.click(screen.getByRole("button", { name: "Descartar" }));
    expect(aoFechar).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("'Continuar editando' não chama aoFechar e fecha só o diálogo", async () => {
    const { user, aoFechar } = montar(true);
    await user.click(screen.getByRole("button", { name: "Fechar formulário" }));
    await user.click(screen.getByRole("button", { name: "Continuar editando" }));
    expect(aoFechar).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("confirmando")).toHaveTextContent("false");
  });

  it("Esc no diálogo equivale a continuar editando", async () => {
    const { user, aoFechar } = montar(true);
    await user.click(screen.getByRole("button", { name: "Fechar formulário" }));
    await user.keyboard("{Escape}");
    expect(aoFechar).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("enquanto salva ignora o pedido de fechar (sujo ou não)", async () => {
    const { user, aoFechar } = montar(true, { salvando: true });
    await user.click(screen.getByRole("button", { name: "Fechar formulário" }));
    expect(aoFechar).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("aceita descrição alternativa", async () => {
    const { user } = montar(true, { descricao: "A nota fiscal não foi salva." });
    await user.click(screen.getByRole("button", { name: "Fechar formulário" }));
    expect(screen.getByRole("alertdialog")).toHaveAccessibleDescription("A nota fiscal não foi salva.");
  });
});
