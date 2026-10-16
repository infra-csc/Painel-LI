import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson } from "@/test/fixtures";
import { vagaFake } from "@/test/fixtures-dominio";
import { coberturaTerrestre, type TrechoTerrestre } from "@shared/transporte-terrestre";
import TicketRow, { type TicketRowProps } from "./ticket-row";
import TerrestreDialog from "./terrestre-dialog";

// Prints do dono (16/10, Blue Run - Campinas): a Sugestão diz "van - 7h saindo".
const vagaDaVan = () => vagaFake({ id: "vaga-1", inclusionNumber: 4810, needsTicket: true, flightArrivalSuggestedTime: "van - 7h saindo", flightReturnSuggestedTime: "van - 18h" });

function linha(extras: Partial<TicketRowProps> = {}) {
  const acoes = { onToggleSelect: vi.fn(), onOpen: vi.fn(), onToggleEmitida: vi.fn(), onTerrestre: vi.fn() };
  const inclusion = extras.inclusion ?? vagaDaVan();
  const props: TicketRowProps = {
    inclusion, ticket: undefined, rowIdx: 0,
    eventName: "Blue Run - Campinas - 2026", functionName: "Staff", collaboratorName: "MARINA SOUZA", eventLocation: "Campinas - SP",
    hasPendingSwap: false, hasApprovedSwap: false, selected: false, canEdit: true,
    ...acoes, ...extras,
  };
  renderComTudo(<table><tbody><TicketRow {...props} /></tbody></table>);
  return { ...acoes, inclusion, linha: screen.getByRole("row") };
}

const van = (trecho: "ida" | "volta"): TrechoTerrestre => ({ trecho, modo: "van", empresa: "Transluz", valorCentavos: 60_000 });

describe("Linha de Passagens com transporte terrestre", () => {
  it("vaga sem passagem com a Sugestão de van: o atalho diz 'Vai de van' e abre já com van", async () => {
    const { onTerrestre, onOpen, inclusion } = linha();
    const atalho = screen.getByTestId("atalho-terrestre-vaga-1");
    expect(atalho).toHaveTextContent("Vai de van");
    await userEvent.click(atalho);
    expect(onTerrestre).toHaveBeenCalledWith(inclusion, "van");
    // O clique no atalho não abre o modal da passagem por baixo.
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("toda terrestre: sai de 'Pendente', mostra 'Vai de van' e o valor, sem caixa de seleção nem 'Emitida'", () => {
    const terrestres = [van("ida"), van("volta")];
    const { linha: tr } = linha({ terrestres, cobertura: coberturaTerrestre({}, terrestres) });
    expect(within(tr).queryByText("Pendente")).not.toBeInTheDocument();
    expect(screen.getByTestId("ticket-terrestre-vaga-1")).toHaveTextContent("Vai de van");
    expect(screen.getByTestId("ticket-terrestre-vaga-1").textContent?.replace(/ /g, " ")).toContain("R$ 1.200,00 · sem passagem");
    const viagem = screen.getByTestId("terrestre-vaga-1").textContent?.replace(/ /g, " ") ?? "";
    // Ida e volta iguais viram uma entrada só.
    for (const trecho of ["Ida e volta · Van", "Transluz · ", "R$ 600,00 cada trecho"]) expect(viagem).toContain(trecho);
    expect(screen.queryByTestId("checkbox-ticket-vaga-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("toggle-emitida-vaga-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("atalho-terrestre-vaga-1")).not.toBeInTheDocument();
  });

  it("só a ida terrestre: continua 'Pendente' e diz que a volta não foi comprada", () => {
    const terrestres = [van("ida")];
    const { linha: tr } = linha({ terrestres, cobertura: coberturaTerrestre({}, terrestres) });
    expect(within(tr).getByText("Pendente")).toBeInTheDocument();
    expect(tr).toHaveTextContent("Volta: passagem não comprada");
    expect(screen.getByTestId("checkbox-ticket-vaga-1")).toBeInTheDocument();
  });

  it("clicar no terrestre registrado abre a edição", async () => {
    const terrestres = [van("ida"), van("volta")];
    const { onTerrestre, inclusion } = linha({ terrestres, cobertura: coberturaTerrestre({}, terrestres) });
    await userEvent.click(screen.getByTestId("editar-terrestre-vaga-1"));
    expect(onTerrestre).toHaveBeenCalledWith(inclusion);
  });
});

function dialogo(extras: Partial<Parameters<typeof TerrestreDialog>[0]> = {}) {
  const onClose = vi.fn();
  renderComTudo(
    <TerrestreDialog
      abertura={{ inclusion: vagaDaVan(), modo: "van" }}
      onClose={onClose}
      registros={[]}
      ticket={undefined}
      collaboratorName="Marina Souza"
      eventName="Blue Run - Campinas - 2026"
      functionName="Staff"
      {...extras}
    />,
  );
  return { onClose };
}

describe("Diálogo 'Vai de carro ou van'", () => {
  it("van sem empresa e sem valor: os dois campos obrigatórios em vermelho, nada vai ao servidor", async () => {
    const fetchMock = mockarFetch((url) => respostaJson({}, 200, url));
    dialogo();
    await userEvent.click(screen.getByTestId("terrestre-salvar"));
    expect(await screen.findByText("Nome da empresa é obrigatório")).toBeInTheDocument();
    expect(screen.getByText("Valor é obrigatório")).toBeInTheDocument();
    expect(screen.getByTestId("terrestre-ida-empresa")).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("carro pede só o valor ('Valor do carro'); sem empresa na tela", async () => {
    mockarFetch((url) => respostaJson({}, 200, url));
    dialogo({ abertura: { inclusion: vagaDaVan(), modo: "carro" } });
    expect(screen.queryByTestId("terrestre-ida-empresa")).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("terrestre-salvar"));
    expect(await screen.findByText("Valor do carro é obrigatório")).toBeInTheDocument();
  });

  it("van preenchida: envia ida e volta com empresa e valor em centavos e fecha", async () => {
    const fetchMock = mockarFetch((url) => respostaJson({ gravados: 2, vagas: 1, falhas: [], statusPorVaga: { "vaga-1": "passagem_comprada" } }, 200, url));
    const { onClose } = dialogo();
    await userEvent.type(screen.getByTestId("terrestre-ida-empresa"), "Transluz Transportes");
    await userEvent.type(screen.getByTestId("terrestre-ida-valor"), "600,00");
    expect(screen.getByTestId("terrestre-total").textContent?.replace(/ /g, " ")).toContain("Total da vaga: R$ 1.200,00");
    await userEvent.click(screen.getByTestId("terrestre-salvar"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const chamada = fetchMock.mock.calls.find(([u]) => String(u).includes("/api/transportes-terrestres"));
    expect(chamada?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(chamada?.[1]?.body))).toEqual({
      itens: [
        { teamInclusionId: "vaga-1", trecho: "ida", modo: "van", empresa: "Transluz Transportes", valorCentavos: 60_000 },
        { teamInclusionId: "vaga-1", trecho: "volta", modo: "van", empresa: "Transluz Transportes", valorCentavos: 60_000 },
      ],
    });
  });

  it("Sugestão com van na ida e carro na volta: a volta já abre separada, com Carro marcado", () => {
    mockarFetch((url) => respostaJson({}, 200, url));
    const mista = vagaFake({ id: "vaga-1", inclusionNumber: 4811, needsTicket: true, flightArrivalSuggestedTime: "van - 7h saindo", flightReturnSuggestedTime: "carro - 18h" });
    dialogo({ abertura: { inclusion: mista, modo: "van" } });
    expect(screen.getByTestId("terrestre-volta-igual")).not.toBeChecked();
    expect(screen.getByTestId("terrestre-modo-van")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("terrestre-modo-volta-carro")).toHaveAttribute("aria-checked", "true");
  });

  it("perna com passagem fica travada (só a outra pode ser terrestre)", () => {
    mockarFetch((url) => respostaJson({}, 200, url));
    dialogo({ ticket: { actualDepartureDate: "2026-10-20", actualDepartureTime: "07:00" } as never });
    expect(screen.getByTestId("terrestre-perna-ida")).toBeDisabled();
    expect(screen.getByTestId("terrestre-perna-ida")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("terrestre-perna-volta")).toHaveAttribute("aria-pressed", "true");
  });
});
