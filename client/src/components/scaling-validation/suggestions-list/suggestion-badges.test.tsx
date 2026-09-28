import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import type { ScalingChangeRequest } from "@shared/schema";
import { SUGESTAO_STATUS, SUGESTAO_STATUS_LABELS } from "@shared/scaling-validation-rules";
import { renderComTudo } from "@/test/render";
import { sugestaoFake } from "@/test/fixtures-dominio";
import { VALIDATION_NOTE_HINT_LABEL, ValidationNoteHint } from "../validation-note-blocks";
import { PendingDaysBadge, PendingRequestBadge, StatusCell, SuggestionStatusBadge, railClass } from "./suggestion-badges";

const DIA = 86_400_000;

function pedidoFake(parcial: Partial<ScalingChangeRequest> = {}): ScalingChangeRequest {
  return {
    id: "pedido-1", teamInclusionId: "s1", eventId: "evento-1", functionId: "funcao-1", area: null,
    requestType: "exclusao", requestedBy: "u2", requestedByName: "Carlos Lima", proposedChanges: null,
    reason: "Vaga duplicada na grade", status: "pendente", reviewComment: null, reviewedBy: null, reviewedByName: null,
    reviewedAt: null, resolvedInclusionId: null,
    createdAt: new Date("2026-03-02T15:30:00"), updatedAt: new Date("2026-03-02T15:30:00"),
    ...parcial,
  };
}

describe("SuggestionStatusBadge", () => {
  it.each([
    [SUGESTAO_STATUS.PENDENTE, "text-warning"],
    [SUGESTAO_STATUS.VALIDADA, "text-info"],
    [SUGESTAO_STATUS.AJUSTE, "text-warning"],
    [SUGESTAO_STATUS.APROVADA, "text-success"],
    [SUGESTAO_STATUS.NEGADA, "text-danger"],
  ])("%s → rótulo do shared e tom pelo significado (%s)", (status, classe) => {
    renderComTudo(<SuggestionStatusBadge status={status} />);
    const pilula = screen.getByText(SUGESTAO_STATUS_LABELS[status]);
    expect(pilula).toHaveClass(classe);
    expect(railClass(status)).toContain(classe.replace("text-", "bg-"));
  });

  it("status desconhecido não inventa urgência: mostra a chave crua em tom neutro", () => {
    renderComTudo(<SuggestionStatusBadge status="qualquer_coisa" />);
    expect(screen.getByText("qualquer_coisa")).toHaveClass("text-neutral");
  });
});

describe("PendingRequestBadge", () => {
  it("sem pedido não renderiza nada", () => {
    renderComTudo(<PendingRequestBadge row={sugestaoFake()} />);
    expect(screen.queryByText(/Com pedido de/)).toBeNull();
  });

  it("com pedido: selo âmbar focável com o tipo, e motivo/autor/data no tooltip", async () => {
    const { user } = renderComTudo(<PendingRequestBadge row={sugestaoFake({ pendingRequest: pedidoFake() })} />);
    const selo = screen.getByText("Com pedido de exclusão");
    expect(selo).toHaveClass("text-warning");
    expect(selo).toHaveAttribute("tabindex", "0");
    await user.hover(selo);
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Aguardando o aprovador");
    expect(tooltip).toHaveTextContent("Vaga duplicada na grade");
    expect(tooltip).toHaveTextContent("por Carlos Lima");
    expect(tooltip).toHaveTextContent("02/03/2026");
  });

  it("pedido de ajuste usa a palavra certa", () => {
    renderComTudo(<PendingRequestBadge row={sugestaoFake({ pendingRequest: pedidoFake({ requestType: "ajuste" }) })} />);
    expect(screen.getByText("Com pedido de ajuste")).toBeInTheDocument();
  });
});

describe("PendingDaysBadge", () => {
  it("pendente há pouco tempo não mostra nada; a partir do limiar vira aviso, depois perigo", () => {
    const { unmount } = renderComTudo(<PendingDaysBadge row={{ status: SUGESTAO_STATUS.PENDENTE, daysPending: 1, validatedAt: null }} />);
    expect(screen.queryByText(/pendente há/)).toBeNull();
    unmount();

    const { unmount: u2 } = renderComTudo(<PendingDaysBadge row={{ status: SUGESTAO_STATUS.PENDENTE, daysPending: 4, validatedAt: null }} />);
    expect(screen.getByText("pendente há 4 dias")).toHaveClass("text-warning");
    u2();

    renderComTudo(<PendingDaysBadge row={{ status: SUGESTAO_STATUS.PENDENTE, daysPending: 8, validatedAt: null }} />);
    expect(screen.getByText("pendente há 8 dias")).toHaveClass("text-danger");
  });

  it("vaga validada conta desde validatedAt ('aguardando aprovação') e diz quem decide no tooltip", async () => {
    const validadaHa5Dias = new Date(Date.now() - 5 * DIA);
    const { user } = renderComTudo(
      <PendingDaysBadge row={{ status: SUGESTAO_STATUS.VALIDADA, daysPending: 30, validatedAt: validadaHa5Dias }} approverNames={["Marina Dias"]} />,
    );
    const selo = screen.getByText("aguardando aprovação há 5 dias");
    await user.hover(selo);
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("a decisão está com o aprovador há 5 dias");
    expect(tooltip).toHaveTextContent("Quem decide: Marina Dias.");
  });

  it("aprovada ou negada não tem contador", () => {
    renderComTudo(<PendingDaysBadge row={{ status: SUGESTAO_STATUS.APROVADA, daysPending: 40, validatedAt: null }} />);
    expect(screen.queryByText(/há d+ dias?/)).toBeNull();
  });
});

describe("ValidationNoteHint", () => {
  it("sem texto (ou só espaços) não renderiza", () => {
    renderComTudo(<ValidationNoteHint note="   " />);
    expect(screen.queryByLabelText(VALIDATION_NOTE_HINT_LABEL)).toBeNull();
  });

  it("com observação: ícone focável com nome acessível fixo e o texto no tooltip (hover e foco)", async () => {
    const { user } = renderComTudo(<ValidationNoteHint note="Chega no dia anterior" />);
    const gatilho = screen.getByLabelText(VALIDATION_NOTE_HINT_LABEL);
    expect(gatilho).toHaveAttribute("tabindex", "0");
    await user.hover(gatilho);
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Observação da validação");
    expect(tooltip).toHaveTextContent("Chega no dia anterior");
  });
});

describe("StatusCell", () => {
  it("com pedido em aberto mostra UM selo só (o do pedido), não o status cru", () => {
    // Status cru diria "Com pedido de ajuste" (rótulo do shared); o pedido de fato é de EXCLUSÃO — só ele aparece.
    renderComTudo(<StatusCell row={sugestaoFake({ status: SUGESTAO_STATUS.AJUSTE, pendingRequest: pedidoFake({ requestType: "exclusao" }) })} />);
    expect(screen.getByText("Com pedido de exclusão")).toBeInTheDocument();
    expect(screen.queryByText(SUGESTAO_STATUS_LABELS.sugestao_ajuste)).toBeNull();
  });

  it("validada com observação: pílula de status + dica da observação; devolvida pelo aprovador ganha 'Voltou do aprovador'", () => {
    renderComTudo(
      <StatusCell row={sugestaoFake({
        status: SUGESTAO_STATUS.VALIDADA, validationNote: "Confirmar hotel",
        lastVagaDecision: { action: "devolvida", comment: "Revisar datas", byName: "Marina Dias", at: "2026-03-03T10:00:00.000Z" },
      })} />,
    );
    expect(screen.getByText(SUGESTAO_STATUS_LABELS.sugestao_validada)).toBeInTheDocument();
    expect(screen.getByLabelText(VALIDATION_NOTE_HINT_LABEL)).toBeInTheDocument();
    expect(screen.getByText("Voltou do aprovador")).toHaveClass("text-warning");
  });

  it("pendente sem observação não mostra a dica", () => {
    renderComTudo(<StatusCell row={sugestaoFake({ validationNote: "texto antigo" })} />);
    expect(screen.queryByLabelText(VALIDATION_NOTE_HINT_LABEL)).toBeNull();
  });
});
