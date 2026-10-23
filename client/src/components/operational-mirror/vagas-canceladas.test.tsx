/**
 * Vagas canceladas no Espelho (23/10, Night Run Curitiba): o aviso do topo com
 * a lista, e o aviso no quarto CONFIRMADO de onde uma vaga cancelada saiu.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import type { MirrorCollaborator, MirrorRow, RoomGroup, VagaCanceladaComCusto } from "@shared/operational-mirror-types";
import { renderComTudo } from "@/test/render";
import { VagasCanceladas } from "./vagas-canceladas";
import { QuartosView } from "./quartos-view";

const andrew: VagaCanceladaComCusto = {
  teamInclusionId: "v4114", inclusionNumber: 4114,
  collaborator: { id: "andrew", fullName: "ANDREW SOUZA DA SILVA" },
  function: { name: "Kit", area: "Operações", costCenter: null },
  schedule: { startDate: "2026-10-15", endDate: "2026-10-18" },
  passagem: { valorCentavos: 98000, historicoCentavos: 0, ida: "2026-10-14", volta: "2026-10-19", status: "comprada", viva: true },
  hospedagem: { valorCentavos: 120000, hotelName: null, checkIn: "2026-10-14", checkOut: "2026-10-19", status: "reservada", viva: true },
  passagemCentavos: 98000, hotelCentavos: 120000, bagagemCentavos: 0, uberCentavos: 0, locacaoCentavos: 0, totalCentavos: 218000,
  revisar: true,
};
const totais = { vagas: 1, revisar: 1, tickets: 98000, hotel: 120000, baggage: 0, uber: 0, carRental: 0, total: 218000 };

describe("aviso do topo: vagas canceladas com custo", () => {
  it("sem vaga cancelada com custo, não aparece", () => {
    renderComTudo(<VagasCanceladas vagas={[]} totais={undefined} eventId="e1" />);
    expect(screen.queryByTestId("vagas-canceladas")).toBeNull();
  });

  it("diz quantas revisar, quanto continua no custo, abre a lista e leva a Passagens filtrado", () => {
    renderComTudo(<VagasCanceladas vagas={[andrew]} totais={totais} eventId="e1" />);
    expect(screen.getByTestId("vagas-canceladas-aviso")).toHaveTextContent("1 vaga cancelada ainda tem passagem ou hospedagem — revisar");
    expect(screen.getByTestId("vagas-canceladas")).toHaveTextContent("R$ 2.180,00 continuam no custo do evento");
    expect(screen.getByTestId("vagas-canceladas-passagens")).toHaveAttribute("href", "/tickets?event=e1&inclusion=cancelado");
    expect(screen.queryByTestId("vagas-canceladas-lista")).toBeNull();

    const abrir = screen.getByTestId("vagas-canceladas-abrir");
    expect(abrir).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(abrir);
    expect(abrir).toHaveAttribute("aria-expanded", "true");
    const item = within(screen.getByTestId("vagas-canceladas-lista")).getByTestId("vaga-cancelada-v4114");
    expect(item).toHaveTextContent("ANDREW SOUZA DA SILVA");
    expect(item).toHaveTextContent("#4114");
    expect(item).toHaveTextContent("14/10 → 19/10");
    expect(item).toHaveTextContent("hotel a definir");
    expect(item).toHaveTextContent("revisar");
  });
});

describe("quarto confirmado de onde saiu uma vaga cancelada", () => {
  const matheus: MirrorRow = {
    teamInclusionId: "v4739",
    collaborator: { id: "matheus", fullName: "Matheus da Fonte Costa", gender: "male", city: null, state: null, type: null },
    function: { id: "kit", name: "Kit", costCenter: null, area: "Operações" },
    schedule: { startDate: "2026-10-28", endDate: "2026-11-01", flightDepartureDate: null, flightReturnDate: null, dailyRates: 5 },
    ticket: null, accommodation: null, observations: null,
    baggage: { totalCents: 0, extraCents: 0, oc: null, notes: null, checkIn: null },
    uber: { totalCents: 0, oc: null, notes: null, checkIn: null, suggestedGroupId: null, groupName: null },
    carRental: { company: null, totalCents: 0, oc: null, notes: null, checkIn: null },
    skipUber: false, suggestedRoomGroupId: null, roomGroupLabel: null, pendencies: [],
  };
  const quarto = (confirmed: boolean): RoomGroup => ({
    id: "q1", eventId: "e1", hotelName: null, roomType: "double", genderRule: "male",
    checkInDate: "2026-10-28", checkOutDate: "2026-11-02", notes: null, suggested: !confirmed, confirmed,
    members: [{ id: "m1", hotelRoomGroupId: "q1", collaboratorId: "matheus", confirmed, checkInDate: null, checkOutDate: null }],
    foraDoEspelho: [{ collaboratorId: "andrew", nome: "ANDREW SOUZA DA SILVA", motivo: "cancelada" }],
  }) as unknown as RoomGroup;
  const montar = (g: RoomGroup) => renderComTudo(
    <QuartosView groups={[g]} rows={[matheus]} collabById={new Map<string, MirrorCollaborator>([["matheus", matheus.collaborator]])} canEdit={false}
      onConfirm={() => {}} onPatch={() => {}} onMover={() => {}} pendingId={null} />,
  );

  it("confirmado: avisa que uma vaga do quarto foi cancelada; a pessoa cancelada não aparece", () => {
    montar(quarto(true));
    expect(screen.getByTestId("room-vaga-cancelada-q1")).toHaveTextContent("Uma vaga deste quarto foi cancelada (ANDREW SOUZA DA SILVA)");
    const card = screen.getByTestId("room-card-q1");
    expect(within(card).queryByText("ANDREW SOUZA DA SILVA", { exact: true })).toBeNull();
    expect(within(card).getByText("Matheus da Fonte Costa")).toBeInTheDocument();
  });

  it("sugestão: o Refazer resolve — sem aviso", () => {
    montar(quarto(false));
    expect(screen.queryByTestId("room-vaga-cancelada-q1")).toBeNull();
  });
});
