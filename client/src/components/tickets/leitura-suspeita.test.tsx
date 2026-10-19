/**
 * "Leitura do voucher suspeita, confira" na lista de Passagens (19/10 — caso
 * #3913): a passagem gravada com origem igual ao destino na mesma perna
 * (THE→THE, FOR→FOR) ganha o selo âmbar e o atalho para corrigir.
 */
import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { passagemFake, vagaFake } from "@/test/fixtures-dominio";
import TicketRow, { type TicketRowProps } from "./ticket-row";

/** Como o leitor antigo gravou o #3913 (dados de voo; pessoa fictícia). */
const GRAVADA_ERRADA = {
  teamInclusionId: "v3913",
  departureAirport: "THE", destinationAirport: "THE", actualDepartureTime: "17:35", actualArrivalTime: "12:15",
  returnOriginAirport: "FOR", returnDestinationAirport: "FOR", actualReturnTime: "13:25", returnArrivalTime: "14:20",
};

function linha(extras: Partial<TicketRowProps> = {}) {
  const acoes = { onToggleSelect: vi.fn(), onOpen: vi.fn(), onCorrigirPassagem: vi.fn() };
  const inclusion = vagaFake({ id: "v3913", inclusionNumber: 3913, needsTicket: true, status: "escalado" });
  const { user } = renderComTudo(
    <table><tbody>
      <TicketRow
        inclusion={inclusion} ticket={passagemFake(GRAVADA_ERRADA)} rowIdx={0}
        eventName="Night Run - Teresina - 2026" functionName="Kit" collaboratorName="FULANO DE TESTE" eventLocation="Teresina - PI"
        hasPendingSwap={false} hasApprovedSwap={false} selected={false} canEdit
        {...acoes} {...extras}
      />
    </tbody></table>,
  );
  return { ...acoes, user, inclusion, row: screen.getByRole("row") };
}

describe("linha de Passagens — leitura do voucher suspeita", () => {
  it("origem igual ao destino: selo âmbar com as pernas no detalhe e o atalho para corrigir", async () => {
    const { row, inclusion, onCorrigirPassagem, onOpen, user } = linha();
    const selo = within(row).getByTestId("ticket-leitura-suspeita-v3913");
    expect(selo).toHaveTextContent("Leitura do voucher suspeita, confira");
    expect(selo).toHaveAttribute("title", "Ida THE→THE: origem igual ao destino · Volta FOR→FOR: origem igual ao destino. Confira com o voucher e corrija a passagem.");
    await user.click(within(row).getByTestId("corrigir-leitura-suspeita-v3913"));
    expect(onCorrigirPassagem).toHaveBeenCalledWith(inclusion);
    expect(onOpen).not.toHaveBeenCalled();
    // A borda da linha diz que a vez é de Compras.
    expect(row.className).toContain("border-l-warning-strong");
  });

  it("sem permissão de editar: o selo fica, o atalho não", () => {
    const { row } = linha({ canEdit: false });
    expect(within(row).getByTestId("ticket-leitura-suspeita-v3913")).toBeInTheDocument();
    expect(within(row).queryByTestId("corrigir-leitura-suspeita-v3913")).toBeNull();
  });

  it("passagem certa (GRU→THE, THE→CGH) não ganha selo", () => {
    const { row } = linha({
      ticket: passagemFake({
        ...GRAVADA_ERRADA,
        departureAirport: "GRU", actualDepartureTime: "14:30", actualArrivalTime: "17:35",
        returnOriginAirport: "THE", returnDestinationAirport: "CGH", actualReturnTime: "12:15", returnArrivalTime: "18:00",
      }),
    });
    expect(within(row).queryByTestId("ticket-leitura-suspeita-v3913")).toBeNull();
  });
});
