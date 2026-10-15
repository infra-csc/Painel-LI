import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderComTudo, criarQueryClient } from "@/test/render";
import { eventoFake } from "@/test/fixtures-dominio";
import type { ProposedChanges } from "@shared/scaling-validation-rules";
import type { ChangeRequestItem, ReviewBody } from "./types";
import { ReviewRequestDialog } from "./decision-dialogs";
import { draftFromProposed, draftToProposed } from "./proposed-changes-form";

const evento = eventoFake({ id: "evt-1", name: "Corrida Aracaju", startDate: "2026-11-10", endDate: "2026-11-11" });
const seguinte = eventoFake({ id: "evt-2", name: "Corrida João Pessoa", startDate: "2026-11-13", endDate: "2026-11-14" });

/** Pedido de INCLUSÃO "só ida, segue direto para outro evento" (09/10). */
const pedidoSoIda: ProposedChanges = {
  v: 1,
  quantity: 1,
  workDays: ["2026-11-10", "2026-11-11"],
  dailyRates: 2,
  needsTicket: true,
  needsAccommodation: false,
  transportModeIda: "aereo",
  flightDepartureDate: "2026-11-09",
  trechosSugeridos: "so_ida",
  voltaSegueParaEventoId: "evt-2",
};

function pedidoDeInclusao(proposed: ProposedChanges): ChangeRequestItem {
  return {
    id: "req-1",
    teamInclusionId: null,
    eventId: "evt-1",
    functionId: "funcao-1",
    area: null,
    requestType: "inclusao",
    status: "pendente",
    reason: "Falta uma pessoa no staff",
    requestedBy: "u-area",
    requestedByName: "Área de Produção",
    createdAt: new Date("2026-10-01T12:00:00Z"),
    functionName: "Staff",
    eventName: "Corrida Aracaju",
    inclusionNumber: null,
    inclusionState: null,
    proposed,
    diff: [],
    canDecide: true,
  } as unknown as ChangeRequestItem;
}

describe("Reajustar pedido de INCLUSÃO — só ida / trecho direto", () => {
  it("draftToProposed mantém trechosSugeridos, idaVemDoEventoId e voltaSegueParaEventoId", () => {
    const out = draftToProposed(draftFromProposed({ ...pedidoSoIda, idaVemDoEventoId: "evt-0" }), "inclusao");
    expect(out).toMatchObject({ trechosSugeridos: "so_ida", idaVemDoEventoId: "evt-0", voltaSegueParaEventoId: "evt-2" });
  });

  it("ida e volta (padrão) não manda os campos vazios", () => {
    const { trechosSugeridos: _t, voltaSegueParaEventoId: _v, ...idaEVolta } = pedidoSoIda;
    const out = draftToProposed(draftFromProposed(idaEVolta), "inclusao")!;
    expect(out).not.toHaveProperty("trechosSugeridos");
    expect(out).not.toHaveProperty("idaVemDoEventoId");
    expect(out).not.toHaveProperty("voltaSegueParaEventoId");
  });

  it("editar campos e enviar: o payload do reajuste leva o 'só ida' e o 'segue para' do pedido", async () => {
    const onSubmit = vi.fn<(body: ReviewBody) => void>();
    const queryClient = criarQueryClient();
    queryClient.setQueryData(["/api/events"], [evento, seguinte]);
    const { user } = renderComTudo(
      <ReviewRequestDialog
        open
        onOpenChange={() => {}}
        kind="reajustar"
        request={pedidoDeInclusao(pedidoSoIda)}
        event={evento}
        pending={false}
        onSubmit={onSubmit}
      />,
      { queryClient },
    );
    await user.click(screen.getByTestId("rev-editar-toggle"));
    await user.type(screen.getByLabelText(/Comentário para a área/), "Ajustei a data da ida");
    await user.click(screen.getByTestId("rev-submit"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const body = onSubmit.mock.calls[0][0];
    expect(body.editedChanges).toMatchObject({
      quantity: 1,
      workDays: ["2026-11-10", "2026-11-11"],
      trechosSugeridos: "so_ida",
      voltaSegueParaEventoId: "evt-2",
      flightDepartureDate: "2026-11-09",
    });
  });
});
