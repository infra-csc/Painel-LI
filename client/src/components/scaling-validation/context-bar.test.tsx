import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { eventoFake } from "@/test/fixtures-dominio";
import { ContextBar } from "./context-bar";

type Props = Parameters<typeof ContextBar>[0];

function montar(extras: Partial<Props> = {}) {
  const evento = eventoFake({ id: "ev-1", name: "Maratona do Rio" });
  return renderComTudo(
    <ContextBar
      events={[evento, eventoFake({ id: "ev-2", name: "Meia de Brasília" })]}
      eventId="ev-1"
      onEventChange={vi.fn()}
      selectedEvent={evento}
      observations=""
      onObservationsChange={vi.fn()}
      eventTestId="ctx-evento"
      {...extras}
    />,
  );
}

// Sugestão de Escala: papéis só-leitura (compras/financeiro) precisam trocar de
// evento para LER outra grade; só a edição fica travada.
describe("ContextBar — seletor × edição", () => {
  it("modo leitura: seletor de evento livre, recado travado", async () => {
    const { user } = montar({ disabled: true, eventPickerDisabled: false });
    expect(screen.getByTestId("ctx-evento")).toBeEnabled();
    await user.click(screen.getAllByRole("button", { name: /Recado para as áreas/ })[0]);
    expect(screen.getByLabelText("Recado para as áreas")).toBeDisabled();
  });

  it("durante o envio: o seletor trava", () => {
    montar({ disabled: true, eventPickerDisabled: true });
    expect(screen.getByTestId("ctx-evento")).toBeDisabled();
  });

  it("sem eventPickerDisabled, `disabled` continua travando o seletor (compatível)", () => {
    montar({ disabled: true });
    expect(screen.getByTestId("ctx-evento")).toBeDisabled();
  });
});
