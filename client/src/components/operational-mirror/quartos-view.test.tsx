/**
 * Aba Quartos do Espelho (09/10): rótulo TRIPLO, selo de onde veio cada data
 * (passagem / sugerida / escala), +1 diária na volta a partir das 18h, aviso
 * de hospedagem reservada divergente e a observação de datas diferentes
 * recalculada com as datas mostradas.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import type { MirrorCollaborator, MirrorRow, RoomGroup } from "@shared/operational-mirror-types";
import { datasDoQuarto } from "@shared/datas-do-quarto";
import { renderComTudo } from "@/test/render";
import { QuartosView } from "./quartos-view";

const vaga = {
  flightDepartureDate: "2026-04-22", flightReturnDate: "2026-04-26", flightReturnSuggestedTime: null,
  scheduleStartDate: "2026-04-23", scheduleEndDate: "2026-04-25",
};
const passagem = {
  actualDepartureDate: "2026-04-22", actualDepartureTime: "08:00", actualArrivalTime: "09:00",
  actualReturnDate: "2026-04-26", actualReturnTime: "11:00",
};

function linha(id: string, nome: string, dq: ReturnType<typeof datasDoQuarto>): MirrorRow {
  return {
    teamInclusionId: `v-${id}`,
    collaborator: { id, fullName: nome, gender: "male", city: null, state: null, type: null },
    function: { id: "ceno", name: "Cenotécnica", costCenter: null, area: "Cenotécnica" },
    schedule: { startDate: "2026-04-23", endDate: "2026-04-25", flightDepartureDate: null, flightReturnDate: null, dailyRates: 3 },
    ticket: null, accommodation: null, observations: null,
    baggage: { totalCents: 0, extraCents: 0, oc: null, notes: null, checkIn: null },
    uber: { totalCents: 0, oc: null, notes: null, checkIn: null, suggestedGroupId: null, groupName: null },
    carRental: { company: null, totalCents: 0, oc: null, notes: null, checkIn: null },
    skipUber: false, suggestedRoomGroupId: null, roomGroupLabel: null, pendencies: [],
    datasDoQuarto: dq,
  };
}

function grupo(id: string, membros: string[], notes: string | null = null): RoomGroup {
  return {
    id, eventId: "e1", hotelName: "Hotel Rio", roomType: "double", genderRule: "male",
    checkInDate: "2026-04-22", checkOutDate: "2026-04-26", notes, suggested: true, confirmed: false,
    members: membros.map((cid, i) => ({ id: `${id}-m${i}`, hotelRoomGroupId: id, collaboratorId: cid, confirmed: false, checkInDate: null, checkOutDate: null })),
  } as unknown as RoomGroup;
}

function montar(groups: RoomGroup[], rows: MirrorRow[]) {
  const collabById = new Map<string, MirrorCollaborator>(rows.map((r) => [r.collaborator.id as string, r.collaborator]));
  return renderComTudo(
    <QuartosView groups={groups} rows={rows} collabById={collabById} canEdit={false}
      onConfirm={() => {}} onPatch={() => {}} onMover={() => {}} pendingId={null} />,
  );
}

/** Tabela (≥1024): o jsdom não tem largura, então a consulta responde "sim". */
function telaLarga() {
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
    matches: true, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }) as MediaQueryList);
}

afterEach(() => { vi.restoreAllMocks(); });

describe("QuartosView — triplo e datas do quarto", () => {
  const dqPassagem = datasDoQuarto({ passagem, vaga, hospedagem: { checkInDate: "2026-04-23", checkOutDate: "2026-04-25" } });
  const dqNoite = datasDoQuarto({ passagem: { ...passagem, actualReturnTime: "21:05" }, vaga });
  const dqSugerida = datasDoQuarto({ vaga });
  const dqEscala = datasDoQuarto({ vaga: { ...vaga, flightDepartureDate: null, flightReturnDate: null } });

  it("tabela: TRIPLO · 3 pessoas, selos de origem, +1 diária e aviso de hospedagem divergente", () => {
    telaLarga();
    const rows = [linha("a", "Ana Souza", dqPassagem), linha("b", "Bruno Lima", dqNoite), linha("c", "Caio Reis", dqSugerida)];
    montar([grupo("q1", ["a", "b", "c"])], rows);

    const view = screen.getByTestId("quartos-view");
    expect(within(view).getByText("Triplo")).toBeInTheDocument();
    expect(within(view).getByText("3 pessoas")).toBeInTheDocument();

    const ana = screen.getByTestId("room-row-q1-0");
    expect(within(ana).getAllByText("da passagem")).toHaveLength(2);
    expect(screen.getByTestId("room-divergencia-q1-0")).toHaveTextContent("Hospedagem reservada 23/04→25/04, passagem 22/04→26/04 — conferir");

    const bruno = screen.getByTestId("room-row-q1-1");
    expect(within(bruno).getByText("+1 diária (volta 21:05)")).toBeInTheDocument();
    expect(within(bruno).getByText("27/04/2026")).toBeInTheDocument();

    const caio = screen.getByTestId("room-row-q1-2");
    expect(within(caio).getAllByText("sugerida")).toHaveLength(2);
    expect(screen.queryByTestId("room-divergencia-q1-2")).toBeNull();
  });

  it("observação de datas diferentes é recalculada com as datas mostradas (ignora a gravada)", () => {
    telaLarga();
    const rows = [linha("a", "Ana Souza", dqPassagem), linha("b", "Bruno Lima", dqNoite)];
    // A gravada é de antes da regra da passagem (datas da diária).
    montar([grupo("q1", ["a", "b"], "Datas diferentes entre os ocupantes — 9 noites em comum. Confirme entrada/saída com o hotel.")], rows);
    expect(screen.getByTestId("room-obs-q1")).toHaveTextContent("Datas diferentes entre os ocupantes — 4 noites em comum.");
  });

  it("mesmas datas: sem observação; nota escrita à mão continua", () => {
    telaLarga();
    const rows = [linha("a", "Ana Souza", dqEscala), linha("b", "Bruno Lima", dqEscala)];
    montar([grupo("q1", ["a", "b"], "Pedir andar alto")], rows);
    expect(screen.getAllByTestId("room-obs-q1").map((n) => n.textContent)).toEqual(["Pedir andar alto"]);
    expect(within(screen.getByTestId("room-row-q1-0")).getAllByText("da escala")).toHaveLength(2);
    expect(screen.getByText("Duplo")).toBeInTheDocument();
  });

  it("cartão (tablet/celular) mostra o mesmo triplo, selo e aviso", () => {
    const rows = [linha("a", "Ana Souza", dqPassagem), linha("b", "Bruno Lima", dqNoite), linha("c", "Caio Reis", dqSugerida)];
    montar([grupo("q1", ["a", "b", "c"])], rows);
    const cartao = screen.getByTestId("room-card-q1");
    expect(within(cartao).getByText("Triplo")).toBeInTheDocument();
    expect(within(cartao).getByText("+1 diária (volta 21:05)")).toBeInTheDocument();
    expect(within(cartao).getByTestId("room-divergencia-q1-0")).toBeInTheDocument();
  });
});
