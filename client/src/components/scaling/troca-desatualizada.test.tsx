/**
 * Pedido de troca com as vagas mudadas desde o pedido (dono, 09/10): os três
 * quadros com "Aprovar troca" (Escalação, Passagens, Hospedagem) avisam no
 * topo, desabilitam o Aprovar com o motivo e deixam o Rejeitar habilitado. Sem
 * mudança, nada disso aparece. E a reprovação do gestor avisa que cancela a
 * troca pendente.
 */
import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import type { Collaborator, TeamInclusion } from "@shared/schema";
import { renderComTudo } from "@/test/render";
import { vagaFake } from "@/test/fixtures-dominio";
import { avisoDeTrocaPendente, trocasPendentesPorVaga, type NormalizedSwap } from "@/lib/swap-types";
import { SwapStatusCard } from "./swap-request-panel";
import { ProductionApprovalCard } from "./production-approval-card";
import TicketsSwapReviewPanel from "@/components/tickets/swap-review-panel";
import AccommodationsSwapReviewPanel from "@/components/accommodations/swap-review-panel";
import type { SwapRequestRow } from "@/components/tickets/use-tickets-data";

const ROBERTO = "c-roberto";
const MATHEUS = "c-matheus";

/** O caso do dono: transferência na #4287 (Roberto) trazendo o Matheus da #4290. */
function transferencia(parcial: Partial<NormalizedSwap> = {}): NormalizedSwap {
  return {
    id: "troca-1", teamInclusionId: "vaga-4287", requestedBy: "user-1", requestedByName: "Gabrielle Souza",
    currentCollaboratorId: ROBERTO, newCollaboratorId: MATHEUS,
    currentCollaboratorName: "ROBERTO CARLOS DE SOUZA", newCollaboratorName: "MATHEUS PEREIRA SILVA",
    reason: "Roberto não pode ir", status: "pendente", reviewComment: null, reviewedBy: null, reviewedByName: null, reviewedAt: null,
    createdAt: "2026-10-07T12:00:00.000Z", newCity: "São Paulo - SP", swapKind: "transferencia",
    pairedInclusionId: "vaga-4290", pairedNewCity: null,
    inclusionNumber: 4287, eventName: "Maratona X", pairedInclusionNumber: 4290, pairedEventName: "Corrida Y", pairedFunctionName: "Montagem",
    inclusionStatus: "escalado", inclusionDeletedAt: null,
    inclusionCollaboratorId: ROBERTO, inclusionCollaboratorName: "ROBERTO CARLOS DE SOUZA",
    pairedCollaboratorId: MATHEUS, pairedCollaboratorName: "MATHEUS PEREIRA SILVA",
    ...parcial,
  };
}
/** Depois do pedido, a #4290 passou a ter o Roberto. */
const mudada = () => transferencia({ pairedCollaboratorId: ROBERTO, pairedCollaboratorName: "ROBERTO CARLOS DE SOUZA" });
const MOTIVO = "A vaga #4290 hoje está com Roberto Carlos de Souza, não com Matheus Pereira Silva.";

const nomes: Record<string, string> = { [ROBERTO]: "Roberto Carlos de Souza", [MATHEUS]: "Matheus Pereira Silva" };
/** O botão de verdade (desabilitado, ele fica dentro do invólucro do MotivoDesabilitado, que também tem papel de botão). */
const botaoAprovar = () => screen.getAllByRole("button", { name: /aprovar troca/i }).find((el) => el.tagName === "BUTTON")!;
const mutacao = () => ({ isPending: false, mutate: vi.fn() }) as never;

function montarEscalacao(swap: NormalizedSwap) {
  return renderComTudo(
    <SwapStatusCard
      pendingSwap={swap} latestSwap={undefined} currentUserId="user-9" isAdminOrPurchasing
      getCollaboratorName={(id) => (id ? nomes[id] ?? "" : "")}
      mutations={{ approveSwap: mutacao(), rejectSwap: mutacao(), cancelSwap: mutacao() }}
    />,
  );
}

function linhaCrua(s: NormalizedSwap): SwapRequestRow {
  return {
    id: s.id, team_inclusion_id: s.teamInclusionId, requested_by: s.requestedBy, requested_by_name: s.requestedByName,
    current_collaborator_id: s.currentCollaboratorId, new_collaborator_id: s.newCollaboratorId,
    current_collaborator_name: s.currentCollaboratorName, new_collaborator_name: s.newCollaboratorName,
    reason: s.reason, status: s.status, created_at: s.createdAt, new_city: s.newCity, swap_kind: s.swapKind,
    paired_inclusion_id: s.pairedInclusionId, inclusion_number: s.inclusionNumber, paired_inclusion_number: s.pairedInclusionNumber,
    inclusion_collaborator_id: s.inclusionCollaboratorId, inclusion_collaborator_name: s.inclusionCollaboratorName,
    paired_collaborator_id: s.pairedCollaboratorId, paired_collaborator_name: s.pairedCollaboratorName,
  } as unknown as SwapRequestRow;
}

const vaga4287 = (extras: Partial<TeamInclusion> = {}) => vagaFake({ id: "vaga-4287", inclusionNumber: 4287, collaboratorId: ROBERTO, ...extras } as Partial<TeamInclusion>);

function montarPassagens(swap: NormalizedSwap) {
  return renderComTudo(
    <TicketsSwapReviewPanel
      swap={linhaCrua(swap)} inclusion={vaga4287({ status: "passagem_comprada" })}
      currentCollabName="Roberto Carlos de Souza" requestedCollabName="Matheus Pereira Silva"
      isPurchasingRole isPending={false} onApprove={vi.fn()} onReject={vi.fn()}
    />,
  );
}

function montarHospedagem(swap: NormalizedSwap) {
  const colabs = new Map<string, Collaborator>(Object.entries(nomes).map(([id, fullName]) => [id, { id, fullName, city: "São Paulo - SP" } as Collaborator]));
  return renderComTudo(
    <AccommodationsSwapReviewPanel inclusion={vaga4287({ status: "hospedagem_comprada" })} swaps={[swap]} collaboratorById={colabs} canReview />,
  );
}

describe.each([
  ["Escalação", montarEscalacao, /recusar troca/i],
  ["Passagens", montarPassagens, /rejeitar troca/i],
  ["Hospedagem", montarHospedagem, /rejeitar troca/i],
] as const)("%s — troca pendente com as vagas mudadas (09/10)", (_tela, montar, rejeitar) => {
  it("avisa no topo, mostra quem está de fato e trava o Aprovar; Rejeitar continua", () => {
    montar(mudada());
    const aviso = screen.getByTestId("aviso-troca-desatualizada");
    expect(within(aviso).getByText("As vagas mudaram desde o pedido")).toBeInTheDocument();
    expect(within(aviso).getByText(MOTIVO)).toBeInTheDocument();
    expect(within(aviso).getByText("Recuse e peça de novo com as vagas como estão hoje.")).toBeInTheDocument();
    expect(botaoAprovar()).toBeDisabled();
    expect(screen.getByRole("button", { name: rejeitar })).toBeEnabled();
    // "Hoje" da #4290 é quem está nela agora (Roberto), não o Matheus do pedido.
    const explicacao = screen.getAllByTestId("swap-explicacao")[0];
    const item4290 = within(explicacao).getByText(/Vaga #4290/).closest("li")!;
    expect(within(item4290).getByText("Roberto Carlos de Souza")).toBeInTheDocument();
  });

  it("sem mudança: nenhum aviso e Aprovar habilitado", () => {
    montar(transferencia());
    expect(screen.queryByTestId("aviso-troca-desatualizada")).not.toBeInTheDocument();
    expect(botaoAprovar()).toBeEnabled();
  });
});

describe("Reprovar no gestor com troca pendente (09/10)", () => {
  const montar = (trocaPendente: Pick<NormalizedSwap, "requestedByName"> | null) => renderComTudo(
    <ProductionApprovalCard
      inclusion={vagaFake({ status: "aguardando_producao" } as Partial<TeamInclusion>)} canApprove
      mutations={{ approveProduction: mutacao(), rejectProduction: mutacao() }} trocaPendente={trocaPendente}
    />,
  );

  it("o diálogo de reprovar avisa que o pedido de troca será cancelado", async () => {
    const { user } = montar({ requestedByName: "Gabrielle Souza" });
    await user.click(screen.getByRole("button", { name: "Reprovar" }));
    expect(await screen.findByTestId("aviso-troca-pendente")).toHaveTextContent(
      "Esta vaga tem um pedido de troca pendente (de Gabrielle Souza) — continuar cancela o pedido.",
    );
  });

  it("sem troca pendente, o diálogo segue como antes", async () => {
    const { user } = montar(null);
    await user.click(screen.getByRole("button", { name: "Reprovar" }));
    expect(await screen.findByText(/removido da vaga/)).toBeInTheDocument();
    expect(screen.queryByTestId("aviso-troca-pendente")).not.toBeInTheDocument();
  });
});

describe("trocas pendentes por vaga (09/10)", () => {
  it("a troca aparece nas DUAS vagas e só enquanto pendente", () => {
    const mapa = trocasPendentesPorVaga([transferencia(), transferencia({ id: "troca-2", teamInclusionId: "vaga-9", pairedInclusionId: null, status: "rejeitado" })]);
    expect(Array.from(mapa.keys()).sort()).toEqual(["vaga-4287", "vaga-4290"]);
    expect(avisoDeTrocaPendente(mapa.get("vaga-4290")!)).toBe("Esta vaga tem um pedido de troca pendente (de Gabrielle Souza) — continuar cancela o pedido.");
  });
});
