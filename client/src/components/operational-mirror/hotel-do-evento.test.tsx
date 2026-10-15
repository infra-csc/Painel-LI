/**
 * Aba Quartos, 15/10 — "todos ficam no mesmo hotel por evento":
 *  - campo "Hotel do evento" no topo aplica a todos (PATCH .../hotel), com
 *    pergunta quando há quarto em OUTRO hotel, e toast com o que ficou;
 *  - cabeçalho do quarto: hotel do evento discreto, "outro hotel" destacado,
 *    "trocar só este" como exceção;
 *  - PDF para o hotel sem hotel definido: "Todos os quartos" / "Sem hotel
 *    definido", nome opcional só para o PDF, "Baixar PDF" liberado.
 */
import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import type { MirrorCollaborator, MirrorEvent, MirrorRow, RoomGroup } from "@shared/operational-mirror-types";
import { esperarToast, renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, usuarioFake } from "@/test/fixtures";
import { QuartosView } from "./quartos-view";

const evento: MirrorEvent = { id: "ev1", name: "Night Run Rio", location: "Rio de Janeiro - RJ", startDate: "2026-04-24", endDate: "2026-04-26", status: null };

function linha(id: string, nome: string): MirrorRow {
  return {
    teamInclusionId: `v-${id}`,
    collaborator: { id, fullName: nome, gender: "male", city: null, state: null, type: null },
    function: { id: "f", name: "Montagem", costCenter: null, area: "Montagem" },
    schedule: { startDate: "2026-04-23", endDate: "2026-04-25", flightDepartureDate: null, flightReturnDate: null, dailyRates: 3 },
    ticket: null, accommodation: null, observations: null,
    baggage: { totalCents: 0, extraCents: 0, oc: null, notes: null, checkIn: null },
    uber: { totalCents: 0, oc: null, notes: null, checkIn: null, suggestedGroupId: null, groupName: null },
    carRental: { company: null, totalCents: 0, oc: null, notes: null, checkIn: null },
    skipUber: false, suggestedRoomGroupId: null, roomGroupLabel: null, pendencies: [],
  } as unknown as MirrorRow;
}

function grupo(id: string, hotelName: string | null, membro: string, confirmed = false): RoomGroup {
  return {
    id, eventId: evento.id, hotelName, roomType: "single", genderRule: "male",
    checkInDate: "2026-04-23", checkOutDate: "2026-04-25", notes: null, suggested: true, confirmed,
    members: [{ id: `${id}-m`, hotelRoomGroupId: id, collaboratorId: membro, confirmed: false, checkInDate: null, checkOutDate: null }],
  } as unknown as RoomGroup;
}

function montar(groups: RoomGroup[], canEdit = true) {
  const rows = groups.map((g, i) => linha(g.members[0].collaboratorId, `Pessoa ${i + 1} Silva`));
  const collabById = new Map<string, MirrorCollaborator>(rows.map((r) => [r.collaborator.id as string, r.collaborator]));
  return renderComTudo(
    <QuartosView groups={groups} rows={rows} collabById={collabById} canEdit={canEdit} evento={evento}
      onConfirm={() => {}} onPatch={() => {}} onMover={() => {}} pendingId={null} />,
    { user: usuarioFake({ role: "admin" }) },
  );
}

const corpo = (init?: RequestInit) => JSON.parse(String(init?.body ?? "{}"));

describe("Hotel do evento", () => {
  it("sem hotel nenhum: aviso discreto, quartos \"hotel a definir\", aplicar a todos pula o confirmado", async () => {
    const fetchMock = mockarFetch((url, init) => {
      if (url.endsWith("/operational-mirror/hotel") && init?.method === "PATCH") {
        return respostaJson({ hotel: "Hotel B", aplicados: 2, confirmadosMantidos: 1, outrosMantidos: 0, totalDeQuartos: 3 });
      }
      return respostaJson({});
    });
    const { user } = montar([grupo("q1", null, "a"), grupo("q2", null, "b"), grupo("q3", null, "c", true)]);

    expect(screen.getByTestId("hotel-do-evento-situacao")).toHaveTextContent("Nenhum quarto tem hotel ainda.");
    expect(within(screen.getByTestId("room-card-q1")).getByText("hotel a definir")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Definir hotel…")).toBeNull();

    await user.type(screen.getByTestId("hotel-do-evento-campo"), "Hotel B");
    expect(screen.getByTestId("hotel-do-evento-situacao")).toHaveTextContent("Vai para 2 quartos · 1 confirmado fica como está");
    await user.click(screen.getByTestId("hotel-do-evento-aplicar"));

    const chamada = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/api/events/ev1/operational-mirror/hotel"));
    expect(chamada?.[1]?.method).toBe("PATCH");
    expect(corpo(chamada?.[1])).toEqual({ hotelName: "Hotel B", trocarOutros: false });
    await esperarToast("Hotel definido em 2 quartos");
    await esperarToast("1 confirmado ficou como estava.");
  });

  it("quarto em OUTRO hotel: pergunta manter / trocar todos, e \"Trocar todos\" manda trocarOutros", async () => {
    const fetchMock = mockarFetch((url, init) => (url.endsWith("/operational-mirror/hotel") && init?.method === "PATCH"
      ? respostaJson({ hotel: "Hotel B", aplicados: 3, confirmadosMantidos: 0, outrosMantidos: 0, totalDeQuartos: 3 })
      : respostaJson({})));
    const { user } = montar([grupo("q1", "Hotel A", "a"), grupo("q2", "Hotel A", "b"), grupo("q3", "Hotel X", "c")]);

    const campo = screen.getByTestId("hotel-do-evento-campo");
    expect(campo).toHaveValue("Hotel A");
    expect(screen.getByTestId("hotel-do-evento-situacao")).toHaveTextContent("Em 2 de 3 quartos · 1 em outro hotel");
    await user.clear(campo);
    await user.type(campo, "Hotel B");
    await user.click(screen.getByTestId("hotel-do-evento-aplicar"));

    const dialogo = await screen.findByTestId("hotel-do-evento-dialogo");
    expect(dialogo).toHaveTextContent("1 quarto está em outro hotel: Hotel X (1)");
    expect(within(dialogo).getByTestId("hotel-do-evento-manter")).toHaveTextContent("Manter esse");
    await user.click(within(dialogo).getByTestId("hotel-do-evento-trocar-todos"));

    const chamada = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/operational-mirror/hotel"));
    expect(corpo(chamada?.[1])).toEqual({ hotelName: "Hotel B", trocarOutros: true });
    await esperarToast("Hotel definido em 3 quartos");
  });

  it("cabeçalho do quarto: hotel do evento discreto, exceção destacada, \"trocar só este\" abre o campo", async () => {
    mockarFetch(() => respostaJson({}));
    const { user } = montar([grupo("q1", "Hotel A", "a"), grupo("q2", "Hotel A", "b"), grupo("q3", "Hotel X", "c")]);
    const q1 = screen.getByTestId("room-card-q1");
    expect(within(q1).getByText("Hotel A")).toHaveAttribute("title", "Hotel do evento");
    expect(within(q1).queryByText("outro hotel")).toBeNull();
    expect(within(screen.getByTestId("room-card-q3")).getByText("outro hotel")).toBeInTheDocument();

    await user.click(within(q1).getByRole("button", { name: "Trocar o hotel só deste quarto (Hotel A)" }));
    expect(within(q1).getByRole("combobox", { name: "Hotel só deste quarto" })).toHaveFocus();
  });

  it("sem permissão: só leitura, sem campo nem \"trocar só este\"", () => {
    mockarFetch(() => respostaJson({}));
    montar([grupo("q1", "Hotel A", "a")], false);
    expect(screen.getByTestId("hotel-do-evento")).toHaveTextContent("Hotel A");
    expect(screen.queryByTestId("hotel-do-evento-campo")).toBeNull();
    expect(screen.queryByTestId("quarto-hotel-trocar")).toBeNull();
  });
});

describe("PDF para o hotel sem hotel definido", () => {
  it("nenhum quarto com hotel: \"Todos os quartos\", aviso só informativo, nome opcional e Baixar liberado", async () => {
    mockarFetch(() => respostaJson({}));
    const { user } = montar([grupo("q1", null, "a"), grupo("q2", null, "b")]);
    await user.click(screen.getByTestId("quartos-pdf-hotel"));
    const dialogo = await screen.findByTestId("dialogo-rooming-list");
    expect(within(dialogo).getByTestId("rooming-opcao-unica")).toHaveTextContent("Todos os quartos2 quartos");
    expect(within(dialogo).getByTestId("rooming-quartos-sem-hotel")).toHaveTextContent("“Hotel: a definir”");
    expect(within(dialogo).getByTestId("rooming-previa-cabecalho")).toHaveTextContent("Night Run Rio · Hotel: a definir");
    await user.type(within(dialogo).getByTestId("rooming-nome-no-pdf"), "Hotel Provisório");
    expect(within(dialogo).getByTestId("rooming-previa-cabecalho")).toHaveTextContent("Hotel: Hotel Provisório");
    expect(within(dialogo).getByTestId("rooming-baixar")).toBeEnabled();
  });

  it("com e sem hotel: cada hotel + \"Sem hotel definido (N quartos)\"", async () => {
    mockarFetch(() => respostaJson({}));
    const { user } = montar([grupo("q1", "Hotel A", "a"), grupo("q2", null, "b"), grupo("q3", null, "c")]);
    await user.click(screen.getByTestId("quartos-pdf-hotel"));
    const dialogo = await screen.findByTestId("dialogo-rooming-list");
    expect(within(dialogo).getAllByRole("radio")).toHaveLength(2);
    expect(within(dialogo).getByTestId("rooming-quartos-sem-hotel")).toHaveTextContent("2 quartos sem hotel não entram neste PDF");
    expect(within(dialogo).queryByTestId("rooming-nome-no-pdf")).toBeNull();
    const opcao = within(dialogo).getByTestId("rooming-opcao-sem-hotel");
    expect(opcao).toHaveTextContent("Sem hotel definido2 quartos");
    await user.click(opcao);
    expect(within(dialogo).getByTestId("rooming-nome-no-pdf")).toBeInTheDocument();
    expect(within(dialogo).getByTestId("rooming-baixar")).toBeEnabled();
  });
});
