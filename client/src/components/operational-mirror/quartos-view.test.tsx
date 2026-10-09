/**
 * Aba Quartos do Espelho (09/10): um bloco por quarto, selo de onde veio cada
 * data (passagem / sugerida / escala), +1 diária na volta a partir das 18h
 * como selo próprio, aviso de hospedagem reservada divergente (do quarto
 * quando é de todos, da linha quando não), ocupação por noite no lugar de
 * "Datas diferentes entre os ocupantes" e o selo de gênero só quando nem o
 * cadastro nem o nome resolvem.
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

function linha(id: string, nome: string, dq: ReturnType<typeof datasDoQuarto>, gender: string | null = "male"): MirrorRow {
  return {
    teamInclusionId: `v-${id}`,
    collaborator: { id, fullName: nome, gender, city: null, state: null, type: null },
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

/** Largura de mesa (a grade é por container query; o jsdom não mede — só garante que nada depende disso). */
function telaLarga() {
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
    matches: true, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }) as MediaQueryList);
}

afterEach(() => { vi.restoreAllMocks(); });

describe("QuartosView — blocos, datas do quarto e ocupação por noite", () => {
  const dqPassagem = datasDoQuarto({ passagem, vaga, hospedagem: { checkInDate: "2026-04-23", checkOutDate: "2026-04-25" } });
  const dqNoite = datasDoQuarto({ passagem: { ...passagem, actualReturnTime: "21:05" }, vaga });
  const dqSugerida = datasDoQuarto({ vaga });
  const dqEscala = datasDoQuarto({ vaga: { ...vaga, flightDepartureDate: null, flightReturnDate: null } });

  it("um bloco por quarto, numerado, com selos de origem, +1 diária e aviso de quem diverge", () => {
    telaLarga();
    const rows = [linha("a", "Ana Souza", dqPassagem), linha("b", "Bruno Lima", dqNoite), linha("c", "Caio Reis", dqSugerida), linha("d", "Davi Melo", dqEscala)];
    montar([grupo("q1", ["a", "b", "c"]), grupo("q2", ["d"])], rows);

    const q1 = screen.getByTestId("room-card-q1");
    expect(within(q1).getByRole("heading", { name: "Quarto 1" })).toBeInTheDocument();
    expect(within(screen.getByTestId("room-card-q2")).getByRole("heading", { name: "Quarto 2" })).toBeInTheDocument();

    const ana = screen.getByTestId("room-row-q1-0");
    expect(within(ana).getAllByText("da passagem")).toHaveLength(2);
    // Só a Ana tem hospedagem reservada divergente: o aviso fica na linha dela.
    expect(screen.getByTestId("room-divergencia-q1-0")).toHaveTextContent("Hospedagem reservada 23/04→25/04, passagem 22/04→26/04 — conferir");
    expect(screen.queryByTestId("room-divergencia-q1")).toBeNull();

    const bruno = screen.getByTestId("room-row-q1-1");
    const saidaDoBruno = within(bruno).getAllByTestId("room-origem-saida")[0];
    expect(within(saidaDoBruno).getByText("da passagem")).toBeInTheDocument();
    expect(within(saidaDoBruno).getByText("+1 diária · volta 21:05")).toBeInTheDocument();
    expect(within(bruno).getByText("27/04/2026")).toBeInTheDocument();

    const caio = screen.getByTestId("room-row-q1-2");
    expect(within(caio).getAllByText("sugerida")).toHaveLength(2);
    expect(screen.queryByTestId("room-divergencia-q1-2")).toBeNull();

    expect(within(screen.getByTestId("room-card-q2")).getByText("Single")).toBeInTheDocument();
  });

  it("ocupação por noite: Triplo até 26/04, Single na noite a mais — e sem a frase de datas diferentes", () => {
    telaLarga();
    const rows = [linha("a", "Ana Souza", dqPassagem), linha("b", "Bruno Lima", dqNoite), linha("c", "Caio Reis", dqSugerida)];
    // A observação gravada é de antes da regra da passagem: não aparece.
    montar([grupo("q1", ["a", "b", "c"], "Datas diferentes entre os ocupantes — 9 noites em comum. Confirme entrada/saída com o hotel.")], rows);
    const trechos = within(screen.getByTestId("room-trechos-q1")).getAllByRole("listitem");
    expect(trechos.map((t) => t.textContent)).toEqual(["22/04→26/04Triplo", "26/04→27/04Single"]);
    expect(trechos[1]).toHaveAttribute("title", "26/04 a 27/04 · 1 noite · Bruno");
    expect(screen.queryByTestId("room-obs-q1")).toBeNull();
  });

  it("mesmas datas: um selo só (Duplo · 2 pessoas); nota escrita à mão continua", () => {
    telaLarga();
    const rows = [linha("a", "Ana Souza", dqEscala), linha("b", "Bruno Lima", dqEscala)];
    montar([grupo("q1", ["a", "b"], "Pedir andar alto")], rows);
    expect(screen.getAllByTestId("room-obs-q1").map((n) => n.textContent)).toEqual(["Pedir andar alto"]);
    expect(within(screen.getByTestId("room-row-q1-0")).getAllByText("da escala")).toHaveLength(2);
    expect(screen.getByText("Duplo")).toBeInTheDocument();
    expect(screen.getByText("2 pessoas")).toBeInTheDocument();
    expect(screen.queryByTestId("room-trechos-q1")).toBeNull();
  });

  it("divergência de hospedagem igual para todos: um aviso do quarto, nenhum na linha", () => {
    const rows = [linha("a", "Ana Souza", dqPassagem), linha("b", "Bruno Lima", dqPassagem)];
    montar([grupo("q1", ["a", "b"])], rows);
    expect(screen.getByTestId("room-divergencia-q1")).toHaveTextContent("Os dois ocupantes: Hospedagem reservada 23/04→25/04, passagem 22/04→26/04 — conferir");
    expect(screen.queryByTestId("room-divergencia-q1-0")).toBeNull();
    expect(screen.queryByTestId("room-divergencia-q1-1")).toBeNull();
  });

  it("gênero: nome comum sem cadastro não leva selo; nome ambíguo leva \"confira o gênero\"", () => {
    const rows = [linha("a", "Ana Souza", dqEscala, null), linha("b", "Darci Lopes", dqEscala, null)];
    montar([grupo("q1", ["a", "b"])], rows);
    expect(screen.queryByTestId("room-sem-genero-q1-0")).toBeNull();
    expect(within(screen.getByTestId("room-row-q1-0")).getByText("Ana Souza")).toHaveAttribute("title", "Gênero deduzido pelo nome");
    const selo = screen.getByTestId("room-sem-genero-q1-1");
    expect(selo).toHaveTextContent("confira o gênero");
    expect(selo).toHaveAttribute("title", "Não foi possível deduzir pelo nome — confira antes de confirmar o quarto");
    expect(screen.queryByText("sem gênero")).toBeNull();
  });
});
