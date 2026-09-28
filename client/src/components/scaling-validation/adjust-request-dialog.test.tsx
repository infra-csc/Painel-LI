import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson } from "@/test/fixtures";
import { eventoFake, sugestaoFake } from "@/test/fixtures-dominio";
import { AdjustRequestDialog } from "./adjust-request-dialog";

type Props = Parameters<typeof AdjustRequestDialog>[0];

function montar(extras: Partial<Props> = {}) {
  const fetchMock = mockarFetch((url) => respostaJson({}, 200, url));
  const onOpenChange = vi.fn();
  const utils = renderComTudo(
    <AdjustRequestDialog
      open
      onOpenChange={onOpenChange}
      inclusion={sugestaoFake({ id: "vaga-1", inclusionNumber: 4643 })}
      event={eventoFake({ startDate: "2026-04-09", endDate: "2026-04-13" })}
      functionName="kit local"
      {...extras}
    />,
  );
  return { ...utils, fetchMock, onOpenChange };
}

const motivo = () => screen.getByLabelText(/Motivo/);
const enviar = () => screen.getByRole("button", { name: /Enviar pedido de ajuste/ });

// Dono, 29/09: "Não consigo responder um pedido negado. Ele pede para alterar
// algo." Quem só quer responder ao aprovador valida com observação.
describe("AdjustRequestDialog — responder sem mudar a vaga", () => {
  it("nada mudou + atalho disponível: explica e oferece validar com o motivo como observação", async () => {
    const onValidarEmVez = vi.fn();
    const { user, fetchMock } = montar({ onValidarEmVez });
    await user.type(motivo(), "Aprovado pelo Henrique");
    await user.click(enviar());
    expect(screen.getByRole("alert")).toHaveTextContent("valide com o motivo como observação");
    await user.click(screen.getByRole("button", { name: "Validar a vaga com este motivo como observação" }));
    expect(onValidarEmVez).toHaveBeenCalledWith("Aprovado pelo Henrique");
    // Nenhum pedido de ajuste vazio foi para o servidor.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sem o atalho (modal da Escalação), a mensagem continua a de antes e não há botão extra", async () => {
    const { user } = montar();
    await user.type(motivo(), "Qualquer coisa");
    await user.click(enviar());
    expect(screen.getByRole("alert")).toHaveTextContent("Nada foi alterado. Mude ao menos um campo");
    expect(screen.queryByTestId("button-validar-em-vez")).toBeNull();
  });
});
