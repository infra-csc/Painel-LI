/**
 * "O hotel tem: Individual · Duplo · Triplo" na aba Quartos (22/10): a opção
 * grava pelo PUT dos valores; quarto que excede o que o hotel tem ganha selo
 * e um aviso com "Refazer sugestões"; o Mover não oferece juntar num tipo que
 * o hotel não tem; o painel de valores deixa o tipo cinza e fora da
 * distribuição; o PDF avisa antes de baixar.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { MirrorCollaborator, MirrorEvent, MirrorRow, RoomGroup } from "@shared/operational-mirror-types";
import type { ValoresDoHotelSalvos } from "@shared/custo-dos-quartos";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, usuarioFake } from "@/test/fixtures";
import { QuartosView } from "./quartos-view";
import { regraDosTipos } from "./tipos-do-hotel";

const evento: MirrorEvent = { id: "ev1", name: "Night Run Rio", location: "Rio de Janeiro - RJ", startDate: "2026-04-24", endDate: "2026-04-26", status: null };

function linha(id: string, nome: string): MirrorRow {
  return {
    teamInclusionId: `v-${id}`,
    collaborator: { id, fullName: nome, gender: "male", city: null, state: null, type: null },
    function: { id: "ceno", name: "Cenotécnica", costCenter: null, area: "Cenotécnica" },
    schedule: { startDate: "2026-04-22", endDate: "2026-04-26", flightDepartureDate: null, flightReturnDate: null, dailyRates: 3 },
    ticket: null, accommodation: null, observations: null,
    baggage: { totalCents: 0, extraCents: 0, oc: null, notes: null, checkIn: null },
    uber: { totalCents: 0, oc: null, notes: null, checkIn: null, suggestedGroupId: null, groupName: null },
    carRental: { company: null, totalCents: 0, oc: null, notes: null, checkIn: null },
    skipUber: false, suggestedRoomGroupId: null, roomGroupLabel: null, pendencies: [],
  } as unknown as MirrorRow;
}

function quarto(id: string, membros: string[], confirmed = false): RoomGroup {
  return {
    id, eventId: evento.id, hotelName: "Hotel Rio", roomType: membros.length === 3 ? "triple" : membros.length === 2 ? "double" : "single", genderRule: "male",
    checkInDate: "2026-04-22", checkOutDate: "2026-04-26", notes: null, suggested: true, confirmed,
    members: membros.map((c, i) => ({ id: `${id}-m${i}`, hotelRoomGroupId: id, collaboratorId: c, confirmed, checkInDate: "2026-04-22", checkOutDate: "2026-04-26" })),
  } as unknown as RoomGroup;
}

const valores = (tipos: { duplo: boolean; triplo: boolean }, tarifas = { single: 10000, double: 20000, triple: 27000 }): ValoresDoHotelSalvos => ({
  tarifas, faturaCentavos: null, quartos: [], lateCheckouts: [], tipos,
});

const PESSOAS = ["a", "b", "c", "d", "e", "f"];
const rows = PESSOAS.map((id) => linha(id, `Pessoa ${id.toUpperCase()} Silva`));

function montar({ groups, v, canEdit = true, onRecalc }: { groups: RoomGroup[]; v: ValoresDoHotelSalvos | null; canEdit?: boolean; onRecalc?: () => void }) {
  const collabById = new Map<string, MirrorCollaborator>(rows.map((r) => [r.collaborator.id as string, r.collaborator]));
  return renderComTudo(
    <QuartosView groups={groups} rows={rows} collabById={collabById} canEdit={canEdit} evento={evento} valores={v}
      onConfirm={() => {}} onPatch={() => {}} onMover={() => {}} pendingId={null} onRecalc={onRecalc} />,
    { user: usuarioFake({ role: canEdit ? "purchasing" : "function_area" }) },
  );
}

const corpo = (init?: RequestInit) => JSON.parse(String(init?.body ?? "{}"));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("a opção \"O hotel tem\"", () => {
  it("Individual fixo; Duplo e Triplo marcados por padrão; desmarcar o Triplo grava temTriplo: false", async () => {
    const fetchMock = mockarFetch(() => respostaJson({}));
    const { user } = montar({ groups: [quarto("q1", ["a", "b"])], v: valores({ duplo: true, triplo: true }) });
    const grupo = screen.getByTestId("hotel-tipos");
    expect(within(grupo).getByTestId("hotel-tipo-individual").tagName).toBe("SPAN");
    expect(screen.getByTestId("hotel-tipo-duplo")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("hotel-tipo-triplo")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("hotel-tipos-regra")).toHaveTextContent("");

    await user.click(screen.getByTestId("hotel-tipo-triplo"));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u, i]) =>
      String(u).endsWith("/api/events/ev1/operational-mirror/hotel-valores") && i?.method === "PUT" && corpo(i).temTriplo === false)).toBe(true));
  });

  it("aparece também sem nenhum quarto (vale para a primeira sugestão) e diz a regra", () => {
    montar({ groups: [], v: valores({ duplo: false, triplo: true }) });
    expect(screen.getByTestId("hotel-tipo-duplo")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("hotel-tipos-regra")).toHaveTextContent("Sem duplo: cada pessoa num individual; triplo só para a cenotécnica.");
    expect(screen.getByTestId("quartos-vazio")).toBeInTheDocument();
  });

  it("quem só consulta vê, sem botão", () => {
    montar({ groups: [quarto("q1", ["a"])], v: valores({ duplo: true, triplo: false }), canEdit: false });
    expect(screen.getByTestId("hotel-tipo-triplo").tagName).toBe("SPAN");
    expect(screen.getByTestId("hotel-tipo-triplo")).toHaveTextContent("o hotel não tem");
  });

  it("regra em uma frase para cada combinação", () => {
    expect(regraDosTipos({ duplo: true, triplo: true })).toBeNull();
    expect(regraDosTipos({ duplo: true, triplo: false })).toMatch(/Sem triplo/);
    expect(regraDosTipos({ duplo: false, triplo: false })).toBe("Só individual: um quarto por pessoa.");
  });
});

describe("quartos que excedem o que o hotel tem", () => {
  it("sem triplo: aviso com a contagem, selo no quarto e \"Refazer sugestões\"; o duplo não é marcado", async () => {
    const onRecalc = vi.fn();
    const { user } = montar({ groups: [quarto("q1", ["a", "b", "c"]), quarto("q2", ["d", "e", "f"])], v: valores({ duplo: true, triplo: false }), onRecalc });
    expect(screen.getByTestId("quartos-excedem-texto")).toHaveTextContent("2 quartos triplos, mas o hotel não tem triplo.");
    expect(screen.getByTestId("room-excede-q1")).toHaveTextContent("o hotel não tem triplo");
    expect(screen.getByTestId("room-card-q1")).toHaveAttribute("data-excede", "triple");
    await user.click(screen.getByTestId("quartos-excedem-refazer"));
    expect(onRecalc).toHaveBeenCalledTimes(1);
  });

  it("sem duplo: só o duplo é marcado; confirmado não oferece refazer e diz para reabrir", () => {
    montar({ groups: [quarto("q1", ["a", "b"], true), quarto("q2", ["c", "d", "e"])], v: valores({ duplo: false, triplo: true }), onRecalc: () => {} });
    expect(screen.getByTestId("quartos-excedem-texto")).toHaveTextContent("1 quarto duplo, mas o hotel não tem duplo.");
    expect(screen.getByTestId("quartos-excedem")).toHaveTextContent("1 confirmado fica como está — reabra ou separe à mão.");
    expect(screen.queryByTestId("quartos-excedem-refazer")).toBeNull();
    expect(screen.getByTestId("room-excede-q1")).toBeInTheDocument();
    expect(screen.queryByTestId("room-excede-q2")).toBeNull();
  });

  it("com todos os tipos, nenhum aviso nem selo", () => {
    montar({ groups: [quarto("q1", ["a", "b", "c"]), quarto("q2", ["d", "e"])], v: valores({ duplo: true, triplo: true }) });
    expect(screen.queryByTestId("quartos-excedem")).toBeNull();
    expect(screen.queryByTestId("room-excede-q1")).toBeNull();
  });

  it("Mover: destino que viraria duplo num hotel sem duplo fica desabilitado, com o motivo", async () => {
    const { user } = montar({ groups: [quarto("q1", ["a"]), quarto("q2", ["b"]), quarto("q3", ["c", "d"])], v: valores({ duplo: false, triplo: true }) });
    await user.click(within(screen.getByTestId("room-card-q1")).getByTestId("mover-q1"));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByTestId("mover-destino-bloqueado-q2")).toBeDisabled();
    expect(within(dialogo).getByTestId("mover-destino-bloqueado-q2")).toHaveTextContent("O hotel não tem apartamento duplo.");
    // q3 tem 2: com a pessoa vira triplo, que o hotel tem.
    expect(within(dialogo).getByTestId("mover-destino-q3")).toBeEnabled();
  });
});

describe("valores e PDF com o tipo que o hotel não tem", () => {
  it("painel: o Triplo fica cinza (\"o hotel não tem\"), sem campo, e some da distribuição", () => {
    montar({ groups: [quarto("q1", ["a", "b"]), quarto("q2", ["c"])], v: valores({ duplo: true, triplo: false }) });
    expect(screen.getByTestId("tarifa-triple-sem-tipo")).toHaveTextContent("o hotel não tem");
    expect(screen.queryByTestId("tarifa-triple-campo")).toBeNull();
    expect(screen.getByTestId("tarifa-double-campo")).toBeInTheDocument();
    expect(screen.queryByTestId("distribuicao-triple")).toBeNull();
    expect(screen.getByTestId("distribuicao-double")).toBeInTheDocument();
  });

  it("PDF: avisa quando o documento tem quarto de um tipo que o hotel não tem", async () => {
    const { user } = montar({ groups: [quarto("q1", ["a", "b", "c"]), quarto("q2", ["d"])], v: valores({ duplo: true, triplo: false }) });
    await user.click(screen.getByTestId("quartos-pdf-hotel"));
    expect(await screen.findByTestId("rooming-aviso-excede")).toHaveTextContent("1 quarto deste documento é de um tipo que o hotel não tem.");
  });
});
