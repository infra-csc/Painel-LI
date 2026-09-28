import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import type { TeamInclusion } from "@shared/schema";
import { renderComTudo } from "@/test/render";
import { passagemFake, vagaFake } from "@/test/fixtures-dominio";
import type { NormalizedSwap } from "@/lib/swap-types";
import type { PendingChangeRequest } from "./scaling-data-types";
import type { ScalingTableProps } from "./scaling-table";
import { getScalingStatusKey, STATUS_META } from "./scaling-status";
import { ScalingTableRow } from "./scaling-table-row";

type Props = Omit<ScalingTableProps, "rows">;

function trocaFake(parcial: Partial<NormalizedSwap> = {}): NormalizedSwap {
  return {
    id: "troca-1", teamInclusionId: "vaga-1", requestedBy: "user-1", requestedByName: "Carlos Lima",
    currentCollaboratorId: "colab-1", newCollaboratorId: "colab-2",
    currentCollaboratorName: "ANA SOUZA", newCollaboratorName: "BIA LIMA",
    reason: "Ana ficou doente", status: "pendente", reviewComment: null, reviewedBy: null, reviewedByName: null, reviewedAt: null,
    createdAt: "2026-03-02T12:00:00.000Z", newCity: null, swapKind: "substituicao", pairedInclusionId: null, pairedNewCity: null,
    inclusionNumber: 101, eventName: "Circuito Brasília", pairedInclusionNumber: null, pairedEventName: null, pairedFunctionName: null,
    inclusionStatus: "planejado", inclusionDeletedAt: null,
    ...parcial,
  };
}

function props(extras: Partial<Props> = {}): Props {
  return {
    sortConfig: null, onSort: vi.fn(), onRowClick: vi.fn(), onViewComments: vi.fn(),
    // A página interrompe a propagação no handler (use-scaling-modal.ts): o botão não pode abrir a linha por baixo.
    onEscalar: vi.fn((e: React.MouseEvent) => e.stopPropagation()),
    getFunctionName: () => "Produção", getEventName: () => "Circuito Brasília",
    getCollaboratorName: (id) => (id ? "Ana Souza" : ""), getCollaboratorCity: () => null,
    getTicket: () => undefined, getAccommodation: () => undefined,
    pendingSwapByInclusion: new Map(), pendingChangeByInclusion: new Map(), approvedSwapInclusionIds: new Set(), seenSwapIds: new Set(),
    currentUserId: "user-1", isAdminOrPurchasing: false, canManageFunction: () => true, canApproveProduction: false,
    selectedIds: new Set(), getSelectBlockReason: () => null, onToggleSelect: vi.fn(), onToggleAllVisible: vi.fn(),
    ...extras,
  };
}

function montar(vaga: TeamInclusion, extras: Partial<Props> = {}) {
  const p = props(extras);
  const utils = renderComTudo(<table><tbody><ScalingTableRow inclusion={vaga} p={p} /></tbody></table>);
  return { ...utils, p, linha: screen.getByRole("row") };
}

const VAGA = () => vagaFake({ id: "vaga-1", inclusionNumber: 101 });

describe("ScalingTableRow", () => {
  it.each([
    ["vaga sem colaborador", vagaFake({ id: "vaga-1", inclusionNumber: 101, collaboratorId: null }), "pendente", null],
    ["colaborador salvo, sem confirmar", VAGA(), "salvo", "Falta confirmar a escalação"],
    ["escalação confirmada", vagaFake({ id: "vaga-1", inclusionNumber: 101, status: "escalado" }), "escalado", null],
    ["cenotécnica com o gestor", vagaFake({ id: "vaga-1", inclusionNumber: 101, status: "aguardando_producao" }), "aguardando_producao", "Enviada ao gestor"],
    ["cancelada", vagaFake({ id: "vaga-1", inclusionNumber: 101, status: "cancelado" }), "cancelado", null],
  ] as const)("pílula pela regra única getScalingStatusKey — %s", (_nome, vaga, chave, detalhe) => {
    montar(vaga);
    expect(getScalingStatusKey(vaga)).toBe(chave);
    const pilula = screen.getByTestId(`scaling-status-${chave}`);
    expect(pilula).toHaveTextContent(STATUS_META[chave].label);
    if (detalhe) expect(screen.getByTestId("detalhe-situacao-vaga-1")).toHaveTextContent(detalhe);
  });

  it("troca pendida pelo próprio usuário: pílula 'Troca em análise' no lugar do status e 'Ana → Bia' embaixo", () => {
    const troca = trocaFake();
    montar(VAGA(), { pendingSwapByInclusion: new Map([["vaga-1", troca]]) });
    expect(screen.getByTestId("scaling-status-troca-em-analise")).toHaveTextContent("Troca em análise");
    expect(screen.queryByTestId("scaling-status-salvo")).toBeNull();
    const detalhe = screen.getByTestId("detalhe-situacao-vaga-1");
    expect(detalhe).toHaveTextContent("Ana → Bia");
    expect(detalhe).toHaveAttribute("title", expect.stringContaining("pedida por Carlos Lima"));
    expect(detalhe).toHaveAttribute("title", expect.stringContaining("Ana ficou doente"));
  });

  it("troca já vista pelo solicitante não repete o aviso — volta a pílula do status", () => {
    const troca = trocaFake();
    montar(VAGA(), { pendingSwapByInclusion: new Map([["vaga-1", troca]]), seenSwapIds: new Set([troca.id]) });
    expect(screen.queryByTestId("scaling-status-troca-em-analise")).toBeNull();
    expect(screen.getByTestId("scaling-status-salvo")).toBeInTheDocument();
  });

  it("troca de outra pessoa só aparece para Compras/admin", () => {
    const troca = trocaFake({ requestedBy: "outro-usuario" });
    const { unmount } = montar(VAGA(), { pendingSwapByInclusion: new Map([["vaga-1", troca]]) });
    expect(screen.queryByTestId("scaling-status-troca-em-analise")).toBeNull();
    unmount();
    montar(VAGA(), { pendingSwapByInclusion: new Map([["vaga-1", troca]]), isAdminOrPurchasing: true });
    expect(screen.getByTestId("scaling-status-troca-em-analise")).toBeInTheDocument();
  });

  it("confirmar rápido só existe quando podeConfirmarRapido diz que a linha está pronta", async () => {
    const onConfirmarRapido = vi.fn();
    const { user, unmount } = montar(VAGA(), { onConfirmarRapido, podeConfirmarRapido: () => true });
    const botao = screen.getByRole("button", { name: "Confirmar escalação #101" });
    await user.click(botao);
    expect(onConfirmarRapido).toHaveBeenCalledTimes(1);
    expect(onConfirmarRapido.mock.calls[0][1]).toMatchObject({ id: "vaga-1" });
    unmount();

    montar(VAGA(), { onConfirmarRapido, podeConfirmarRapido: () => false });
    expect(screen.queryByRole("button", { name: "Confirmar escalação #101" })).toBeNull();
  });

  it("confirmar rápido some para quem não gere a função e trava enquanto confirma", () => {
    const onConfirmarRapido = vi.fn();
    const { unmount } = montar(VAGA(), { onConfirmarRapido, podeConfirmarRapido: () => true, canManageFunction: () => false });
    expect(screen.queryByRole("button", { name: "Confirmar escalação #101" })).toBeNull();
    unmount();

    montar(VAGA(), { onConfirmarRapido, podeConfirmarRapido: () => true, confirmandoId: "vaga-1" });
    const botao = screen.getByRole("button", { name: "Confirmar escalação #101" });
    expect(botao).toBeDisabled();
    expect(botao).toHaveTextContent("Confirmando…");
  });

  it("vaga vazia: 'Escalar alguém' para quem gere a função; cadeado com o responsável para quem não", async () => {
    const vazia = vagaFake({ id: "vaga-1", inclusionNumber: 101, collaboratorId: null });
    const { user, p, unmount } = montar(vazia);
    await user.click(screen.getByRole("button", { name: /Escalar alguém/ }));
    expect(p.onEscalar).toHaveBeenCalledTimes(1);
    expect(p.onRowClick).not.toHaveBeenCalled(); // o clique no botão não abre o modal por baixo
    unmount();

    montar(vazia, { canManageFunction: () => false, getResponsavelDaFuncao: () => "Carlos Lima" });
    expect(screen.queryByRole("button", { name: /Escalar alguém/ })).toBeNull();
    expect(screen.getByText("Não escalado").closest("span")).toHaveAttribute(
      "title", "Quem escala esta vaga é Carlos Lima, responsável por Produção. Você pode consultar.",
    );
  });

  it("abre os detalhes pelo clique na linha, por Enter e pelo botão 'Abrir detalhes'", async () => {
    const { user, p, linha } = montar(VAGA());
    expect(linha).toHaveAttribute("aria-label", "Abrir detalhes da escalação #101");
    await user.click(linha);
    linha.focus();
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Abrir detalhes de #101" }));
    expect(p.onRowClick).toHaveBeenCalledTimes(3);
  });

  it("comentários: o botão anuncia a contagem e abre o histórico sem abrir a linha", async () => {
    const { user, p } = montar(VAGA(), { commentCountByInclusion: new Map([["vaga-1", 3]]) });
    await user.click(screen.getByRole("button", { name: "Abrir comentários e histórico da escalação #101 (3)" }));
    expect(p.onViewComments).toHaveBeenCalledTimes(1);
    expect(p.onRowClick).not.toHaveBeenCalled();
    expect(screen.getByTestId("badge-comments-vaga-1")).toHaveTextContent("3");
  });

  it("pedido de ajuste em aberto vira chip âmbar com o texto completo no title", () => {
    const pedido: PendingChangeRequest = { teamInclusionId: "vaga-1", requestType: "ajuste", reason: "Trocar datas", requestedByName: "Marina Dias", createdAt: "2026-03-02T12:00:00.000Z" };
    montar(VAGA(), { pendingChangeByInclusion: new Map([["vaga-1", pedido]]) });
    const chip = screen.getByTestId("detalhe-situacao-vaga-1");
    expect(chip).toHaveTextContent("Ajuste c/ aprovador");
    expect(chip).toHaveAttribute("title", expect.stringContaining("Pedido de ajuste com o aprovador"));
    expect(chip).toHaveAttribute("title", expect.stringContaining("por Marina Dias"));
  });

  it("seleção bloqueada: checkbox desabilitado e o motivo no nome acessível", () => {
    montar(VAGA(), { getSelectBlockReason: () => "Já confirmada" });
    const caixa = screen.getByRole("checkbox", { name: "Não selecionável: Já confirmada" });
    expect(caixa).toBeDisabled();
  });

  it("'Precisa de': passagem comprada em azul, hospedagem faltando em âmbar; sem nada, 'Sem logística'", () => {
    const vaga = vagaFake({ id: "vaga-1", inclusionNumber: 101, needsTicket: true, needsAccommodation: true });
    const { unmount } = montar(vaga, { getTicket: () => passagemFake({ teamInclusionId: "vaga-1" }) });
    expect(screen.getByTitle("Passagem comprada")).toHaveClass("bg-brand-soft");
    expect(screen.getByTitle("Precisa de hospedagem — ainda não reservada")).toHaveClass("bg-warning-soft");
    unmount();
    montar(VAGA());
    expect(screen.getByText("Sem logística")).toBeInTheDocument();
  });
});
