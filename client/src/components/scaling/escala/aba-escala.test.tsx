/**
 * Aba Escala com logística (23/10): as colunas por função contam como a regra
 * de shared/logistica-da-escala, o número da célula bate com a lista do modal,
 * e o dia mostra quem chega, a que horas e em que voo.
 */
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { Accommodation, TeamInclusion, Ticket } from "@shared/schema";
import type { SuggestionRow } from "@/components/scaling-validation/types";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, usuarioFake } from "@/test/fixtures";
import { vagaFake } from "@/test/fixtures-dominio";
import { AbaEscala } from "./aba-escala";

const base: Partial<TeamInclusion> = {
  eventId: "ev", functionId: "f-prod", status: "escalado", phase: "inclusao", deletedAt: null,
  needsTicket: true, needsAccommodation: true,
  scheduleStartDate: "2026-12-10", scheduleEndDate: "2026-12-12", workDays: null,
  flightDepartureDate: "2026-12-09", flightArrivalSuggestedTime: "chegar até 14h", flightReturnDate: "2026-12-13", flightReturnSuggestedTime: "18h",
};
const v = (over: Partial<TeamInclusion>) => vagaFake({ ...base, ...over });

const comPassagem = v({ id: "a", inclusionNumber: 501, collaboratorId: "c-ana" });
const semPassagem = v({ id: "b", inclusionNumber: 502, collaboratorId: "c-bia" });
const semNome = v({ id: "c", inclusionNumber: 503, collaboratorId: null, needsTicket: false, needsAccommodation: false });
const cancelada = v({ id: "d", inclusionNumber: 504, collaboratorId: "c-caio", status: "cancelado" });

const tickets = [{
  id: "t1", teamInclusionId: "a", transportType: "aereo", purchaseDate: "2026-11-20", ticketStatus: "comprada", emittedAt: null, archivedAt: null,
  actualDepartureDate: "2026-12-09", actualDepartureTime: "07:30", actualArrivalTime: "09:55",
  actualReturnDate: "2026-12-13", actualReturnTime: "18:40", returnArrivalTime: "20:20",
  departureAirport: "POA", destinationAirport: "GRU", returnOriginAirport: "GRU", returnDestinationAirport: "POA",
  ticketCompany: "LATAM", locator: "ABC123", ticketObservations: "Conexão em BSB",
}] as unknown as Ticket[];
const accommodations = [{
  id: "h1", teamInclusionId: "a", hotelName: "Ibis Paulista", hotelStatus: "reservada", checkInDate: "2026-12-09", checkOutDate: "2026-12-13",
}] as unknown as Accommodation[];

const NOMES: Record<string, string> = { "c-ana": "ANA SOUZA", "c-bia": "BIA LIMA", "c-caio": "CAIO REIS" };

function montar() {
  mockarFetch((url) => (url.includes("/api/transportes-terrestres") ? respostaJson([]) : respostaJson({ message: "?" }, 404)));
  const linhas = [comPassagem, semPassagem, semNome, cancelada];
  const rows = linhas.map((i) => ({
    ...i, workDays: ["2026-12-10", "2026-12-11", "2026-12-12"],
    status: i.status === "cancelado" ? "sugestao_negada" : i.status, canEdit: false,
  })) as unknown as SuggestionRow[];
  const onAbrirVaga = vi.fn();
  const r = renderComTudo(
    <AbaEscala
      rows={rows} linhas={linhas} functionNameById={new Map([["f-prod", "Produção"]])}
      eventoUnico={{ id: "ev", name: "Troféu Brasil", startDate: "2026-12-10", endDate: "2026-12-12" }}
      variosEventos={false} recorteFuturos tickets={tickets} accommodations={accommodations}
      getCollaboratorName={(id) => (id ? NOMES[id] ?? id : "")}
      onAbrirVaga={onAbrirVaga} onEscalarFuncao={vi.fn()}
    />,
    { user: usuarioFake({ role: "purchasing" }), rota: "/scaling" },
  );
  return { ...r, onAbrirVaga };
}

describe("Aba Escala — logística por função", () => {
  it("conta passagem, hotel e sem nome sem a cancelada", async () => {
    montar();
    expect(screen.getByTestId("logistica-passagem-f-prod")).toHaveTextContent("1/2");
    expect(screen.getByTestId("logistica-hotel-f-prod")).toHaveTextContent("1/2");
    expect(screen.getByTestId("logistica-sem_nome-f-prod")).toHaveTextContent("1");
    await waitFor(() => expect(screen.getByTestId("logistica-terrestre-f-prod")).toHaveTextContent("–"));
    // A vaga sem nome não viaja; a cancelada não entra: 2 precisam de passagem.
    expect(screen.getByTestId("logistica-passagem-total")).toHaveTextContent("1/2");
  });

  it("a célula abre a lista que forma o número: falta 1, resolvida 1, com a viagem", async () => {
    const { user, onAbrirVaga } = montar();
    await user.click(screen.getByTestId("logistica-passagem-f-prod"));
    const modal = await screen.findByTestId("detalhe-logistica-funcao");
    expect(within(modal).getByTestId("logistica-faltam")).toHaveTextContent("Faltam · 1");
    expect(within(modal).getByTestId("logistica-resolvidas")).toHaveTextContent("Resolvidas · 1");
    const ana = within(modal).getByTestId("viagem-vaga-a");
    expect(ana).toHaveTextContent("07:30 → 09:55");
    expect(ana).toHaveTextContent("LOC ABC123");
    expect(ana).toHaveTextContent("Ibis Paulista");
    expect(ana).toHaveTextContent("Conexão em BSB");
    // Sem passagem: a Sugestão, marcada como sugestão.
    const bia = within(modal).getByTestId("viagem-vaga-b");
    expect(bia).toHaveTextContent("sugestão da escala");
    expect(bia).toHaveTextContent("chegar até 14h");
    await user.click(within(bia).getByRole("button", { name: "BIA LIMA" }));
    expect(onAbrirVaga).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }));
  });
});

describe("Aba Escala — por dia", () => {
  it("o rodapé conta quem chega na véspera e a agenda mostra os horários", () => {
    montar();
    // 09/12 ganhou coluna (chegada na véspera do trabalho).
    expect(screen.getByTestId("dia-chegam-2026-12-09")).toHaveTextContent("2");
    expect(screen.getByTestId("agenda-2026-12-09")).toHaveTextContent("Chegam 2 · 09:55, ≈14:00");
  });

  it("o dia abre a lista por horário, com voo e sugestão", async () => {
    const { user } = montar();
    await user.click(screen.getByTestId("agenda-chegam-2026-12-09"));
    const modal = await screen.findByTestId("detalhe-logistica-dia");
    const itens = within(modal).getAllByTestId(/^movimento-/);
    expect(itens.map((li) => li.getAttribute("data-testid"))).toEqual(["movimento-a", "movimento-b"]);
    expect(itens[0]).toHaveTextContent("09:55");
    expect(itens[0]).toHaveTextContent("POA → GRU");
    expect(itens[1]).toHaveTextContent("≈14:00");
    expect(itens[1]).toHaveTextContent("sugestão");
    await user.click(within(modal).getByTestId("aba-hotel"));
    expect(within(modal).getByTestId("logistica-dia-lista")).toHaveTextContent("Ibis Paulista");
  });
});
