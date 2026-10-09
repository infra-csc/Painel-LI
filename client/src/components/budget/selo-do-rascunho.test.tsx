import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { SeloDoRascunho } from "./selo-do-rascunho";

describe("SeloDoRascunho (08/10)", () => {
  it("salvo: 'Rascunho salvo HH:MM' em verde", () => {
    renderComTudo(<SeloDoRascunho status="salvo" savedAt="17:20" temAjuste />);
    const selo = screen.getByTestId("planejado-selo-rascunho");
    expect(selo).toHaveTextContent("Rascunho salvo 17:20");
    expect(selo).toHaveAttribute("data-status", "salvo");
  });

  it("gravando: 'Salvando rascunho…'", () => {
    renderComTudo(<SeloDoRascunho status="salvando" savedAt="17:20" temAjuste />);
    expect(screen.getByTestId("planejado-selo-rascunho")).toHaveTextContent("Salvando rascunho…");
  });

  it("servidor fora: 'Só neste navegador', com a explicação no tooltip", async () => {
    const { user } = renderComTudo(<SeloDoRascunho status="local" savedAt={null} temAjuste />);
    const selo = screen.getByTestId("planejado-selo-rascunho");
    expect(selo).toHaveTextContent("Só neste navegador");
    await user.hover(selo);
    expect((await screen.findAllByText(/sem conexão com o servidor/)).length).toBeGreaterThan(0);
  });

  it("sem ajuste ou carregando: não há selo", () => {
    const { rerender } = renderComTudo(<SeloDoRascunho status="salvo" savedAt={null} temAjuste={false} />);
    expect(screen.queryByTestId("planejado-selo-rascunho")).toBeNull();
    rerender(<SeloDoRascunho status="carregando" savedAt={null} temAjuste />);
    expect(screen.queryByTestId("planejado-selo-rascunho")).toBeNull();
  });
});
