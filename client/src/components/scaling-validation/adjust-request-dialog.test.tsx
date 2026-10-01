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
      inclusion={sugestaoFake({ id: "vaga-1", inclusionNumber: 4643, workDays: ["2026-04-10", "2026-04-11", "2026-04-12"] })}
      event={eventoFake({ startDate: "2026-04-09", endDate: "2026-04-13" })}
      functionName="kit local"
      {...extras}
    />,
  );
  return { ...utils, fetchMock, onOpenChange };
}

const motivo = () => screen.getByLabelText(/Motivo/);
const principal = () => screen.getByTestId("button-enviar-ajuste");

// Dono, 29–30/09: "Não consigo responder um pedido negado" / "ainda não
// resolvemos isso?". Nada mudou na vaga → o botão principal responde validando.
describe("AdjustRequestDialog — responder sem mudar a vaga", () => {
  it("nada mudou + atalho: o botão principal vira 'Responder ao aprovador' e valida com o motivo, sem aviso de erro", async () => {
    const onValidarEmVez = vi.fn();
    const { user, fetchMock } = montar({ onValidarEmVez });
    expect(principal()).toHaveTextContent("Responder ao aprovador · validar a vaga");
    expect(screen.getByTestId("adjust-so-responder")).toHaveTextContent("volta para o aprovador validada");
    await user.click(motivo()); await user.paste("Henrique aprovou. Local de qui a sab.");
    await user.click(principal());
    expect(onValidarEmVez).toHaveBeenCalledWith("Henrique aprovou. Local de qui a sab.");
    expect(screen.queryByRole("alert")).toBeNull();
    // Nenhum pedido de ajuste vazio foi para o servidor.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("mexeu em um dia: o botão volta a ser 'Enviar pedido de ajuste' e a explicação some", async () => {
    const onValidarEmVez = vi.fn();
    const { user } = montar({ onValidarEmVez });
    await user.click(screen.getAllByRole("button", { pressed: false })[0]);
    expect(principal()).toHaveTextContent("Enviar pedido de ajuste");
    expect(screen.queryByTestId("adjust-so-responder")).toBeNull();
  });

  it("sem o atalho (modal da Escalação), a regra continua: nada mudou é erro", async () => {
    const { user } = montar();
    expect(principal()).toHaveTextContent("Enviar pedido de ajuste");
    await user.click(motivo()); await user.paste("Qualquer coisa");
    await user.click(principal());
    expect(screen.getByRole("alert")).toHaveTextContent("Nada foi alterado. Mude ao menos um campo");
  });
});
