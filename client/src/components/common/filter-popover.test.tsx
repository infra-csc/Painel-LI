/**
 * Seletor de evento com um evento já escolhido (28/10, dono): o escolhido
 * mostra o número dele; os outros aparecem na lista SEM número (nem 0).
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FiltroUnico } from "./filter-popover";

describe("FiltroUnico — opção sem número", () => {
  it("n = null não mostra número; n = 0 mostra 0", async () => {
    render(
      <FiltroUnico
        valor="e1"
        onChange={() => {}}
        opcoes={[
          { id: "e1", nome: "Maratona SP", n: 0 },
          { id: "e2", nome: "Corrida Rio", n: null },
        ]}
        rotuloTodos="Todos os eventos"
        placeholderBusca="Buscar evento…"
        testid="filter-event"
      />,
    );
    await userEvent.click(screen.getByTestId("filter-event"));
    const escolhido = await screen.findByTestId("filter-event-opcao-e1");
    expect(escolhido).toHaveTextContent(/Maratona SP\s*0$/);
    const outro = screen.getByTestId("filter-event-opcao-e2");
    expect(outro).toHaveTextContent(/^Corrida Rio$/);
    // Nenhum contador vazio sobrando ao lado do nome.
    expect(outro.querySelector(".tabular-nums")).toBeNull();
  });
});
