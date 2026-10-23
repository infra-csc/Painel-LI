/**
 * Aba Quartos, 23/10 — "quando confirmar, deve preencher lá na aba de
 * Hospedagem com os dados":
 *  - quarto confirmado: "Hospedagem preenchida" na linha, ou a diferença com
 *    o lançado à mão e "Usar os dados do quarto";
 *  - quarto reaberto com hospedagem preenchida no último Confirmar: o aviso;
 *  - a faixa do hotel do evento resume e faz em lote.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { MirrorCollaborator, MirrorEvent, MirrorRow, RoomGroup } from "@shared/operational-mirror-types";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, usuarioFake } from "@/test/fixtures";
import { hospedagemFake } from "@/test/fixtures-dominio";
import { QuartosView } from "./quartos-view";

const evento: MirrorEvent = { id: "ev1", name: "Night Run Rio", location: "Rio de Janeiro - RJ", startDate: "2026-04-24", endDate: "2026-04-26", status: null };

function linha(id: string, nome: string, extra: Partial<MirrorRow> = {}): MirrorRow {
  return {
    teamInclusionId: `v-${id}`,
    collaborator: { id, fullName: nome, gender: "male", city: null, state: null, type: null },
    function: { id: "f", name: "Montagem", costCenter: null, area: "Montagem" },
    schedule: { startDate: "2026-04-23", endDate: "2026-04-25", flightDepartureDate: null, flightReturnDate: null, dailyRates: 3 },
    ticket: null, accommodation: null, observations: null,
    baggage: { totalCents: 0, extraCents: 0, oc: null, notes: null, checkIn: null },
    uber: { totalCents: 0, oc: null, notes: null, checkIn: null, suggestedGroupId: null, groupName: null },
    carRental: { company: null, totalCents: 0, oc: null, notes: null, checkIn: null },
    skipUber: false, needsAccommodation: true, suggestedRoomGroupId: null, roomGroupLabel: null, pendencies: [],
    datasDoQuarto: { checkIn: "2026-04-23", checkOut: "2026-04-25", origemEntrada: "escala", origemSaida: "escala", chegadaDepoisDaMeiaNoite: false, diariaExtraNaVolta: null, divergencia: null },
    ...extra,
  } as unknown as MirrorRow;
}

function grupo(id: string, membro: string, confirmed: boolean): RoomGroup {
  return {
    id, eventId: evento.id, hotelName: "Hotel Ibis", roomType: "single", genderRule: "male",
    checkInDate: "2026-04-23", checkOutDate: "2026-04-25", notes: null, suggested: true, confirmed,
    members: [{ id: `${id}-m`, hotelRoomGroupId: id, collaboratorId: membro, confirmed: false, checkInDate: null, checkOutDate: null }],
  } as unknown as RoomGroup;
}

/** Os dados que o Confirmar escreveria para uma pessoa sozinha no quarto acima. */
const DO_QUARTO = { hotelName: "Hotel Ibis", checkInDate: "2026-04-23", checkOutDate: "2026-04-25", roomType: "single", nightsCount: 2 };

function montar(groups: RoomGroup[], rows: MirrorRow[]) {
  const collabById = new Map<string, MirrorCollaborator>(rows.map((r) => [r.collaborator.id as string, r.collaborator]));
  return renderComTudo(
    <QuartosView groups={groups} rows={rows} collabById={collabById} canEdit evento={evento}
      onConfirm={() => {}} onPatch={() => {}} onMover={() => {}} pendingId={null} />,
    { user: usuarioFake({ role: "purchasing" }) },
  );
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("Hospedagem da vaga na aba Quartos", () => {
  it("confirmado e preenchido: 'Hospedagem preenchida' e o resumo verde", () => {
    const acc = hospedagemFake({ teamInclusionId: "v-a", ...DO_QUARTO });
    montar([grupo("q1", "a", true)], [linha("a", "Ana Souza", { accommodation: acc, hospedagemDoEspelho: { ...DO_QUARTO } })]);
    expect(screen.getByTestId("hospedagem-ok-v-a")).toHaveTextContent("Hospedagem preenchida");
    expect(screen.getByTestId("hospedagens-das-vagas-situacao")).toHaveTextContent("1 preenchida pelo quarto confirmado");
  });

  it("lançado à mão diferente: mostra a diferença e 'Usar os dados do quarto' manda só esta vaga", async () => {
    const fetchMock = mockarFetch((url, init) => {
      if (url.endsWith("/operational-mirror/hospedagens") && init?.method === "POST") {
        return respostaJson({ criadas: 0, atualizadas: 1, diferem: [], canceladas: 0, semHotel: 0, statusAlterados: 0 });
      }
      return respostaJson({});
    });
    const acc = hospedagemFake({ teamInclusionId: "v-a", ...DO_QUARTO, hotelName: "Mercure Centro" });
    const { user } = montar([grupo("q1", "a", true)], [linha("a", "Ana Souza", { accommodation: acc, hospedagemDoEspelho: null })]);
    const aviso = screen.getByTestId("hospedagem-difere-v-a");
    expect(aviso).toHaveTextContent("Hotel: Mercure Centro (quarto: Hotel Ibis)");
    expect(screen.getByTestId("hospedagens-das-vagas-situacao")).toHaveTextContent("1 com dados lançados à mão");

    await user.click(screen.getByTestId("hospedagem-usar-v-a"));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/operational-mirror/hospedagens"))).toBe(true));
    const [, init] = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/operational-mirror/hospedagens"))!;
    expect(JSON.parse(String(init?.body))).toEqual({ usarDadosDoQuarto: ["v-a"] });
  });

  it("confirmado sem hospedagem ainda: 'a preencher' e o botão em lote (sem corpo)", async () => {
    const fetchMock = mockarFetch(() => respostaJson({ criadas: 1, atualizadas: 0, diferem: [], canceladas: 0, semHotel: 0, statusAlterados: 1 }));
    const { user } = montar([grupo("q1", "a", true)], [linha("a", "Ana Souza")]);
    expect(screen.getByTestId("hospedagem-a-preencher-v-a")).toHaveTextContent("Hospedagem ainda não preenchida");
    await user.click(screen.getByTestId("hospedagens-preencher"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({});
  });

  it("quarto reaberto com hospedagem do último Confirmar: avisa para conferir", () => {
    const acc = hospedagemFake({ teamInclusionId: "v-a", ...DO_QUARTO });
    montar([grupo("q1", "a", false)], [linha("a", "Ana Souza", { accommodation: acc, hospedagemDoEspelho: { ...DO_QUARTO } })]);
    expect(screen.getByTestId("hospedagem-reaberto-v-a")).toHaveTextContent("Quarto reaberto — confira a hospedagem");
    expect(screen.getByTestId("hospedagens-das-vagas-situacao")).toHaveTextContent("1 em quarto reaberto");
  });

  it("nenhum quarto confirmado: a faixa explica o que o Confirmar faz", () => {
    montar([grupo("q1", "a", false)], [linha("a", "Ana Souza")]);
    expect(screen.getByTestId("hospedagens-das-vagas")).toHaveTextContent("Ao confirmar um quarto, a hospedagem de cada pessoa é preenchida");
  });
});
