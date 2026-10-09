/**
 * Aba Uber do Espelho (09/10): a roteirização é por CARRO, com ida e volta em
 * abas. Cada carro é um bloco com o horário, o aeroporto, quantas pessoas,
 * titular e confirmar UMA vez; quem fica fora de uma direção aparece no fim
 * da aba com o motivo; voo com data longe do evento ganha o aviso.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import type { MirrorCollaborator, MirrorRow, UberGroup } from "@shared/operational-mirror-types";
import { renderComTudo } from "@/test/render";
import { UberView } from "./uber-view";

function linha(id: string, nome: string, ticket: Partial<NonNullable<MirrorRow["ticket"]>> | null, extra: Partial<MirrorRow> = {}): MirrorRow {
  return {
    teamInclusionId: `v-${id}`,
    collaborator: { id, fullName: nome, gender: "female", city: null, state: null, type: null },
    function: { id: "f", name: "Produção", costCenter: null, area: "Produção" },
    schedule: { startDate: "2026-11-21", endDate: "2026-11-22", flightDepartureDate: null, flightReturnDate: null, dailyRates: 2 },
    ticket: ticket as MirrorRow["ticket"], accommodation: null, observations: null,
    baggage: { totalCents: 0, extraCents: 0, oc: null, notes: null, checkIn: null },
    uber: { totalCents: 0, oc: null, notes: null, checkIn: null, suggestedGroupId: null, groupName: null },
    carRental: { company: null, totalCents: 0, oc: null, notes: null, checkIn: null },
    skipUber: false, suggestedRoomGroupId: null, roomGroupLabel: null, pendencies: [],
    ...extra,
  } as MirrorRow;
}

function carro(id: string, direction: "ida" | "volta", date: string, time: string, membros: string[], extra: Partial<UberGroup> = {}): UberGroup {
  return {
    id, eventId: "e1", groupName: null, direction,
    origin: direction === "ida" ? "Hotel/Local do evento" : "GRU",
    destination: direction === "ida" ? "GRU" : "Hotel/Local do evento",
    date, time, suggestedTime: time, manualTime: null, estimatedTotalCents: 0, notes: null,
    titularCollaboratorId: null, status: "sugerido", suggested: true, confirmed: false,
    members: membros.map((cid, i) => ({ id: `${id}-m${i}`, uberGroupId: id, collaboratorId: cid })),
    ...extra,
  } as unknown as UberGroup;
}

const voo = (dIda: string, hIda: string, dVolta: string | null, pouso: string) => ({
  departureAirport: "GRU", returnDestinationAirport: "GRU",
  actualDepartureDate: dIda, actualDepartureTime: hIda, actualReturnDate: dVolta, actualReturnTime: "18:00", returnArrivalTime: pouso,
});

const rows = [
  linha("a", "Ana Souza", voo("2026-11-20", "06:15", "2026-11-23", "19:05")),
  linha("b", "Bia Lima", voo("2026-11-20", "06:40", "2026-11-23", "19:05")),
  linha("c", "Caio Reis", voo("2026-11-20", "10:20", null, "")),
  linha("d", "Dani Melo", voo("2025-04-22", "06:30", "2026-11-23", "21:15")),
  linha("e", "Edu Prado", null),
  linha("f", "Fê Dias", voo("2026-11-20", "11:00", "2026-11-23", "17:05"), { skipUber: true }),
];
const groups = [
  // De propósito fora de ordem: a tela ordena por dia e horário.
  carro("i2", "ida", "2026-11-20", "07:20", ["c"]),
  carro("i1", "ida", "2026-11-20", "03:15", ["a", "b"], { titularCollaboratorId: "a" }),
  carro("i0", "ida", "2025-04-22", "03:30", ["d"]),
  carro("v1", "volta", "2026-11-23", "19:20", ["a", "b"], { confirmed: true }),
  carro("v2", "volta", "2026-11-23", "21:30", ["d"]),
];

function montar(canEdit = true) {
  const collabById = new Map<string, MirrorCollaborator>(rows.map((r) => [r.collaborator.id as string, r.collaborator]));
  const props = {
    onConfirm: vi.fn(), onPatch: vi.fn(), onMover: vi.fn(), onSkipUber: vi.fn(), onRecalc: vi.fn(),
  };
  renderComTudo(
    <UberView groups={groups} rows={rows} collabById={collabById} canEdit={canEdit} pendingId={null}
      evento={{ startDate: "2026-11-21", endDate: "2026-11-22" }} {...props} />,
  );
  return props;
}

describe("UberView — roteirização por carro", () => {
  it("cada carro é um bloco com horário, aeroporto, pessoas, titular e confirmar uma vez", () => {
    const { onConfirm } = montar();
    const c = screen.getByTestId("uber-carro-i1");
    // Ordenado por dia e horário: o carro de 2025 é o 1; o das 03:15 de 20/11, o 2.
    expect(within(c).getByText("Carro 2")).toBeInTheDocument();
    expect(within(c).getByText("sai às")).toBeInTheDocument();
    expect((within(c).getByTestId("uber-hora-i1") as HTMLInputElement).value).toBe("03:15");
    expect(within(c.querySelector("header") as HTMLElement).getByText("GRU")).toBeInTheDocument();
    expect(within(c).getByText("2 pessoas")).toBeInTheDocument();
    expect(within(c).getAllByTestId("uber-titular-i1")).toHaveLength(1);
    expect(within(c).getByText("titular")).toBeInTheDocument();
    // As duas pessoas dentro do bloco, com o voo de cada uma.
    expect(within(c).getByTestId("rot-v-a")).toHaveTextContent(/Ana Souza.*Produção.*sex 20\/11.*GRU.*voo 06:15/);
    expect(within(c).getByTestId("rot-v-b")).toHaveTextContent(/Bia Lima.*voo 06:40/);
    fireEvent.click(within(c).getByTestId("confirm-uber-i1"));
    expect(onConfirm).toHaveBeenCalledWith("i1");
  });

  it("ida e volta em abas; a volta mostra 'busca às', o pouso e o confirmado", () => {
    montar();
    expect(screen.queryByTestId("uber-carro-v1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("uber-aba-volta"));
    expect(screen.getByTestId("uber-aba-volta")).toHaveAttribute("aria-selected", "true");
    const c = screen.getByTestId("uber-carro-v1");
    expect(within(c).getByText("busca às")).toBeInTheDocument();
    expect(within(c).getByText("Confirmado")).toBeInTheDocument();
    expect(within(c).queryByTestId("confirm-uber-v1")).not.toBeInTheDocument();
    expect(within(c).getByTestId("rot-v-a")).toHaveTextContent(/pousa 19:05/);
    expect(screen.queryByTestId("uber-carro-i1")).not.toBeInTheDocument();
  });

  it("quem está fora da direção aparece no fim da aba, com o motivo", () => {
    const { onSkipUber } = montar();
    const fora = screen.getByTestId("uber-fora");
    expect(within(fora).getByText("Fora da ida")).toBeInTheDocument();
    expect(within(fora).getByText("Edu Prado").closest("li")).toHaveTextContent("sem passagem lançada");
    expect(within(fora).getByText("Fê Dias").closest("li")).toHaveTextContent("não vai de Uber");
    expect(within(fora).queryByText("Caio Reis")).not.toBeInTheDocument();
    fireEvent.click(within(fora).getByTestId("voltar-uber-v-f"));
    expect(onSkipUber).toHaveBeenCalledWith("v-f", false);

    // Na volta, Caio (sem voo de volta) entra no bloco.
    fireEvent.click(screen.getByTestId("uber-aba-volta"));
    const foraVolta = screen.getByTestId("uber-fora");
    expect(within(foraVolta).getByText("Caio Reis").closest("li")).toHaveTextContent("sem voo de volta lançado");
  });

  it("voo com data fora do evento ganha o aviso, com o ano à vista", () => {
    montar();
    const c = screen.getByTestId("uber-carro-i0");
    expect(within(c).getByText("Carro 1")).toBeInTheDocument();
    expect(within(c).getByTestId("uber-alerta-data")).toHaveTextContent(/fora do evento — conferir a passagem/);
    expect(within(c).getByTestId("rot-v-d")).toHaveTextContent("22/04/2025");
    expect(screen.queryByTestId("uber-carro-i1")?.querySelector('[data-testid="uber-alerta-data"]')).toBeNull();
  });

  it("somente leitura: sem seletor, sem confirmar e sem tirar/mover", () => {
    montar(false);
    const c = screen.getByTestId("uber-carro-i1");
    expect(within(c).queryByTestId("uber-titular-i1")).not.toBeInTheDocument();
    expect(c.querySelector("header")).toHaveTextContent("Titular Ana Souza");
    expect(within(c).getByText("Sugestão")).toBeInTheDocument();
    expect(within(c).queryByTestId("skip-uber-v-a")).not.toBeInTheDocument();
    expect(within(c).queryByTestId("mover-i1")).not.toBeInTheDocument();
  });
});
