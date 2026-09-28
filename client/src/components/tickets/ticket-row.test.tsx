import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { passagemFake, vagaFake } from "@/test/fixtures-dominio";
import TicketRow, { ticketSummaryLine, type TicketRowProps } from "./ticket-row";

function montar(extras: Partial<TicketRowProps> = {}) {
  const acoes = { onToggleSelect: vi.fn(), onOpen: vi.fn(), onToggleEmitida: vi.fn() };
  const inclusion = extras.inclusion ?? vagaFake({ id: "vaga-1", inclusionNumber: 101, needsTicket: true });
  const props: TicketRowProps = {
    inclusion, ticket: undefined, rowIdx: 0,
    eventName: "Circuito Brasília", functionName: "Produção", collaboratorName: "ANA SOUZA", eventLocation: "Brasília, DF",
    hasPendingSwap: false, hasApprovedSwap: false, selected: false, canEdit: true,
    ...acoes, ...extras,
  };
  const utils = renderComTudo(<table><tbody><TicketRow {...props} /></tbody></table>);
  return { ...utils, ...acoes, inclusion, linha: screen.getByRole("row") };
}

const PASSAGEM = () => passagemFake({ teamInclusionId: "vaga-1" });

describe("TicketRow", () => {
  it("passagem comprada: ida e volta com data, horários e aeroportos, resumo LOC · valor · tipo", () => {
    const passagem = PASSAGEM();
    const { linha } = montar({ ticket: passagem });
    expect(linha).toHaveTextContent("✓ Passagem confirmada");
    expect(linha).toHaveTextContent("09/04/2026");
    expect(linha).toHaveTextContent("08:00 → 10:00");
    expect(linha).toHaveTextContent("13/04/2026");
    expect(linha).toHaveTextContent("18:00 → 20:00");
    expect(linha).toHaveTextContent("GRU→BSB");
    expect(linha).toHaveTextContent("BSB→GRU");
    // `Intl` separa "R$" do número com U+00A0; o DOM lido pela Testing Library normaliza para espaço.
    expect(ticketSummaryLine(passagem).replace(/ /g, " ")).toBe("LOC AX782Q · R$ 1.500,00 · Aéreo");
    expect(screen.getByTestId("ticket-summary-vaga-1")).toHaveTextContent("LOC AX782Q · R$ 1.500,00 · Aéreo");
    expect(within(linha).getByText("Comprada")).toBeInTheDocument();
  });

  it("só ida (sem dados de volta) não desenha o trecho de retorno", () => {
    const soIda = passagemFake({
      teamInclusionId: "vaga-1", actualReturnDate: null, actualReturnTime: null, returnArrivalTime: null,
      returnOriginAirport: null, returnDestinationAirport: null, returnCityOrigin: null, returnCityDestination: null,
    });
    const { linha } = montar({ ticket: soIda });
    expect(linha).toHaveTextContent("09/04/2026");
    expect(linha).not.toHaveTextContent("13/04/2026");
    expect(linha).not.toHaveTextContent("BSB→GRU");
  });

  it("'Emitida' aparece só quando a passagem foi emitida e trava o pedido de ajuste", () => {
    const { unmount } = montar({ ticket: passagemFake({ teamInclusionId: "vaga-1", emittedAt: new Date("2026-03-21T10:00:00Z") }) });
    const selo = screen.getByTestId("ticket-emitida-vaga-1");
    expect(selo).toHaveTextContent("Emitida");
    expect(selo).toHaveAttribute("title", "Passagem emitida — a área não pede mais ajuste nesta vaga");
    unmount();
    montar({ ticket: PASSAGEM() });
    expect(screen.queryByTestId("ticket-emitida-vaga-1")).toBeNull();
  });

  it("acesso por teclado: botão 'Abrir vaga #101' sr-only (visível só no foco) abre a vaga; cancelada não tem", async () => {
    const { user, onOpen, inclusion, unmount } = montar();
    const abrir = screen.getByRole("button", { name: "Abrir vaga #101" });
    expect(abrir).toHaveClass("sr-only");
    expect(abrir).toHaveClass("focus:not-sr-only");
    await user.click(abrir);
    expect(onOpen).toHaveBeenCalledWith(inclusion);
    unmount();
    montar({ inclusion: vagaFake({ id: "vaga-1", inclusionNumber: 101, status: "cancelado" }) });
    expect(screen.queryByRole("button", { name: /Abrir vaga/ })).toBeNull();
    expect(screen.getByText("Cancelado")).toBeInTheDocument();
  });

  it("modo cartão (celular): cada célula carrega o rótulo em data-rotulo para o CSS empilhar", () => {
    const { linha } = montar({ ticket: PASSAGEM() });
    const rotulos = Array.from(linha.querySelectorAll("td[data-rotulo]")).map((td) => td.getAttribute("data-rotulo"));
    expect(rotulos).toEqual(["Evento e função", "Passageiro", "Destino", "Ida e volta", "Sugestões", "Situação"]);
  });

  it("pendente: 'Não comprada' + pílula Pendente, checkbox de lote e botão 'Registrar passagem' para quem edita", async () => {
    const { user, onToggleSelect, onOpen, linha } = montar();
    expect(linha).toHaveTextContent("Não comprada");
    expect(within(linha).getByText("Pendente")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Selecionar passagem da inclusão #101" }));
    expect(onToggleSelect).toHaveBeenCalledWith("vaga-1");
    await user.click(screen.getByRole("button", { name: "Registrar passagem da inclusão #101" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("evento encerrado (locked) não entra no lote; comprada mostra 'Visualizar passagem' em vez de registrar", () => {
    const { unmount } = montar({ locked: true });
    expect(screen.queryByRole("checkbox")).toBeNull();
    unmount();
    montar({ ticket: PASSAGEM() });
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Visualizar passagem da inclusão #101" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Registrar passagem/ })).toBeNull();
  });

  it("nome em Title Case com iniciais; troca pendente pinta a linha e a pílula; troca aprovada ganha etiqueta", () => {
    const { linha, unmount } = montar({ hasPendingSwap: true });
    expect(within(linha).getByText("Ana Souza")).toBeInTheDocument();
    expect(within(linha).getByText("AS")).toBeInTheDocument();
    expect(within(linha).getByText("Troca pendente")).toBeInTheDocument();
    expect(linha).toHaveClass("border-l-warning-strong");
    unmount();
    montar({ hasApprovedSwap: true, ticket: PASSAGEM() });
    expect(screen.getByText("Troca aprovada")).toBeInTheDocument();
  });

  it("carimbo 'Emitida': quem edita marca/desmarca; sem permissão o botão fica desabilitado com o motivo", async () => {
    const { user, onToggleEmitida, inclusion, unmount } = montar({ ticket: PASSAGEM() });
    await user.click(screen.getByRole("button", { name: "Marcar passagem como emitida" }));
    expect(onToggleEmitida).toHaveBeenCalledWith(inclusion, true);
    unmount();

    montar({ ticket: passagemFake({ teamInclusionId: "vaga-1", emittedAt: new Date() }), canEdit: false });
    const botao = screen.getByRole("button", { name: "Desfazer emissão da passagem" });
    expect(botao).toBeDisabled();
    expect(botao.closest("[aria-disabled='true']")).toHaveAccessibleDescription(
      "Passagem emitida — clique para desfazer e reabrir o pedido de ajuste",
    );
  });

  it("sugestões de viagem da vaga aparecem em âmbar quando existem; sem sugestão, um traço", () => {
    const { linha, unmount } = montar({
      inclusion: vagaFake({ id: "vaga-1", inclusionNumber: 101, flightDepartureDate: "2026-04-09", flightArrivalSuggestedTime: "manhã" }),
    });
    expect(linha).toHaveTextContent("Sugestão");
    expect(linha).toHaveTextContent("manhã");
    unmount();
    const { linha: semSugestao } = montar();
    expect(within(semSugestao).getByText("—")).toBeInTheDocument();
  });
});
