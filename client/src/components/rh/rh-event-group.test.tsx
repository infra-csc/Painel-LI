// Faixa do evento no Controle RH (08/10): o número em destaque é o do RH
// ("N com o RH"), e o total de pendentes vem à parte — antes "N pendentes"
// somava o que estava com o responsável e os devolvidos.
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { linhaRhFake } from "@/test/fixtures-dominio";
import type { EventGroup, PrestacaoItem } from "./prestacao-types";
import { RhEventGroup, type RhEventGroupProps } from "./rh-event-group";

function grupo(items: PrestacaoItem[]): EventGroup {
  return {
    event: items[0].event,
    items,
    actionNeeded: items.filter(i => ["planejamento_pendente", "aguardando_prestacao", "prestacao_recebida", "devolvida_para_ajuste"].includes(i.status)).length,
    rhNeeded: items.filter(i => i.rhPrecisaAgir).length,
  };
}

function montar(g: EventGroup) {
  const props: RhEventGroupProps = {
    group: g, isOpen: false, onToggle: vi.fn(), expandedCards: new Set(), expandedDetails: new Set(),
    approvingInvoiceId: null, nfApproving: false, canRh: true,
    toggleExpand: vi.fn(), toggleDetails: vi.fn(), navigate: vi.fn(), setApprovingInvoiceId: vi.fn(), setNfApproving: vi.fn(),
    toast: vi.fn() as unknown as RhEventGroupProps["toast"],
  };
  return renderComTudo(<RhEventGroup {...props} />);
}

describe("RhEventGroup", () => {
  it("mostra quantas estão com o RH e, à parte, quantas pendem no total", () => {
    montar(grupo([
      linhaRhFake({ status: "prestacao_recebida", rhPrecisaAgir: true }),
      linhaRhFake({ status: "aguardando_prestacao", rhPrecisaAgir: false }),
      linhaRhFake({ status: "devolvida_para_ajuste", rhPrecisaAgir: false }),
    ]));
    expect(screen.getByTestId("crh-grupo-com-rh")).toHaveTextContent("1 com o RH");
    expect(screen.getByTestId("crh-grupo-pendentes")).toHaveTextContent("3 pendentes no total");
    expect(screen.queryByText(/· 3 pendentes$/)).toBeNull();
  });

  it("check-in e nota a aprovar contam para o RH; sem nada com o responsável, não repete o total", () => {
    montar(grupo([
      linhaRhFake({ status: "aprovada_faturamento", rhPrecisaAgir: true }),
      linhaRhFake({ status: "planejamento_pendente", rhPrecisaAgir: true }),
    ]));
    expect(screen.getByTestId("crh-grupo-com-rh")).toHaveTextContent("2 com o RH");
    expect(screen.queryByTestId("crh-grupo-pendentes")).toBeNull();
  });

  it("nada com o RH: sem destaque âmbar, só o total de pendentes", () => {
    montar(grupo([
      linhaRhFake({ status: "aguardando_prestacao", rhPrecisaAgir: false }),
      linhaRhFake({ status: "aguardando_prestacao", rhPrecisaAgir: false }),
    ]));
    expect(screen.queryByTestId("crh-grupo-com-rh")).toBeNull();
    expect(screen.getByTestId("crh-grupo-pendentes")).toHaveTextContent("2 pendentes");
    expect(screen.getByTestId("crh-grupo-pendentes")).not.toHaveTextContent("no total");
  });
});
