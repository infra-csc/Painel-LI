import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { PAST_EVENT_BLOCK_MSG } from "@shared/event-window";
import { renderComTudo } from "@/test/render";
import { usuarioFake } from "@/test/fixtures";
import { vagaFake } from "@/test/fixtures-dominio";
import { modalDataFromInclusion } from "../scaling-utils";
import { CENO_FREELA_MISSING_MSG } from "../scaling-validation";
import type { ScalingData } from "../use-scaling-data";
import type { ScalingMutations } from "../use-scaling-mutations";
import { DetailsFooter, type DetailsFooterProps } from "./details-footer";

/** Só as regras que o rodapé consulta — o resto do `ScalingData` não é tocado aqui. */
function dados(extras: Record<string, unknown> = {}): ScalingData {
  return {
    canEditCollaborator: () => true,
    isEventLocked: () => false,
    canConfirmEscalation: () => true,
    isAtendimentoInclusion: () => false,
    isPercursoInclusion: () => false,
    getCollaboratorConflicts: () => ({ sameEvent: [], dateOverlap: [] }),
    getCollaboratorName: () => "Ana Souza",
    getEventName: () => "Circuito Brasília",
    getFunctionName: () => "Produção",
    getCollaboratorCity: () => "Curitiba",
    ...extras,
  } as unknown as ScalingData;
}

function mutacoes(extras: { salvando?: boolean; reativando?: boolean } = {}): ScalingMutations {
  return {
    saveInclusion: { isPending: !!extras.salvando },
    reactivate: { isPending: !!extras.reativando },
  } as unknown as ScalingMutations;
}

function montar(extras: Partial<DetailsFooterProps> = {}) {
  const callbacks = { onPedirAjuste: vi.fn(), onReativar: vi.fn(), onClose: vi.fn(), onSave: vi.fn(), onConfirm: vi.fn() };
  const inclusion = extras.inclusion ?? vagaFake();
  const props: DetailsFooterProps = {
    inclusion,
    modalData: modalDataFromInclusion(inclusion),
    data: dados(),
    mutations: mutacoes(),
    user: usuarioFake({ role: "production" }),
    eventLocked: false,
    requestLockReason: null,
    mostrarPedirAjuste: false,
    ...callbacks,
    ...extras,
  };
  const utils = renderComTudo(<DetailsFooter {...props} />);
  return { ...utils, ...callbacks };
}

const salvar = () => screen.queryByRole("button", { name: /Salvar alterações|Salvando…/ });
const confirmar = () => screen.queryByRole("button", { name: /Confirmar escalação|Confirmando…/ });
const motivoInline = () => screen.queryByTestId("text-confirm-block-reason");

describe("DetailsFooter", () => {
  it("vaga salva com permissão: Salvar e Confirmar habilitados, sem motivo de bloqueio, e chamam os callbacks", async () => {
    const { user, onSave, onConfirm, onClose } = montar();
    expect(motivoInline()).toBeNull();
    expect(salvar()).toBeEnabled();
    expect(confirmar()).toBeEnabled();
    await user.click(salvar()!);
    await user.click(confirmar()!);
    await user.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onSave).toHaveBeenCalledWith(false);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sem colaborador: Confirmar desabilitado, motivo inline (role=status) e o mesmo motivo no tooltip", async () => {
    const { user } = montar({ inclusion: vagaFake({ collaboratorId: null }) });
    const motivo = "Selecione um colaborador antes de confirmar.";
    expect(confirmar()).toBeDisabled();
    expect(motivoInline()).toHaveTextContent(motivo);
    expect(motivoInline()).toHaveAttribute("role", "status");
    // O botão desabilitado não recebe eventos; o gatilho do tooltip é o span focável que o envolve.
    const gatilho = confirmar()!.parentElement!;
    expect(gatilho).toHaveAttribute("tabindex", "0");
    await user.hover(gatilho);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(motivo);
    // Salvar continua liberado: salvar sem colaborador é permitido, confirmar não.
    expect(salvar()).toBeEnabled();
  });

  it("pedido em análise trava Salvar E Confirmar e é o motivo mostrado (vem antes dos demais)", () => {
    montar({ inclusion: vagaFake({ collaboratorId: null }), requestLockReason: "Pedido de ajuste em análise pelo aprovador" });
    expect(salvar()).toBeDisabled();
    expect(confirmar()).toBeDisabled();
    expect(motivoInline()).toHaveTextContent("Pedido de ajuste em análise pelo aprovador");
  });

  it("escalada: Confirmar some; Salvar fica só enquanto ainda dá para alterar o colaborador", () => {
    const escalada = vagaFake({ status: "escalado" });
    const { unmount } = montar({ inclusion: escalada });
    expect(confirmar()).toBeNull();
    expect(salvar()).toBeEnabled();
    unmount();
    montar({ inclusion: escalada, data: dados({ canEditCollaborator: () => false }) });
    expect(confirmar()).toBeNull();
    expect(salvar()).toBeNull();
  });

  it("somente leitura (passagem comprada, papel de área): só Fechar", () => {
    montar({ inclusion: vagaFake({ status: "passagem_comprada" }) });
    expect(salvar()).toBeNull();
    expect(confirmar()).toBeNull();
    expect(screen.getByRole("button", { name: "Fechar" })).toBeInTheDocument();
  });

  it("admin nunca é somente leitura: com passagem comprada ainda pode salvar (mas não reconfirmar)", () => {
    montar({ inclusion: vagaFake({ status: "passagem_comprada" }), user: usuarioFake({ role: "admin" }) });
    expect(salvar()).toBeEnabled();
    expect(confirmar()).toBeNull();
  });

  it("pending: botões travados com 'Salvando…'/'Confirmando…' e sem motivo inline competindo", () => {
    montar({ mutations: mutacoes({ salvando: true }) });
    expect(salvar()).toBeDisabled();
    expect(salvar()).toHaveTextContent("Salvando…");
    expect(confirmar()).toBeDisabled();
    expect(confirmar()).toHaveTextContent("Confirmando…");
    expect(motivoInline()).toBeNull();
  });

  it("'Pedir ajuste' aparece só com mostrarPedirAjuste e chama onPedirAjuste", async () => {
    const { user, onPedirAjuste, unmount } = montar({ mostrarPedirAjuste: true });
    await user.click(screen.getByRole("button", { name: "Pedir ajuste" }));
    expect(onPedirAjuste).toHaveBeenCalledTimes(1);
    unmount();
    montar({ mostrarPedirAjuste: false });
    expect(screen.queryByRole("button", { name: "Pedir ajuste" })).toBeNull();
  });

  it("cancelada: o admin vê 'Reativar escalação' (e chama onReativar); a área não vê", async () => {
    const cancelada = vagaFake({ status: "cancelado" });
    const { user, onReativar, unmount } = montar({ inclusion: cancelada, user: usuarioFake({ role: "admin" }) });
    await user.click(screen.getByRole("button", { name: "Reativar escalação" }));
    expect(onReativar).toHaveBeenCalledTimes(1);
    unmount();
    montar({ inclusion: cancelada, user: usuarioFake({ role: "production" }) });
    expect(screen.queryByRole("button", { name: "Reativar escalação" })).toBeNull();
  });

  it("evento encerrado bloqueia com a frase única do shared", () => {
    montar({ data: dados({ isEventLocked: () => true }) });
    expect(confirmar()).toBeDisabled();
    expect(motivoInline()).toHaveTextContent(PAST_EVENT_BLOCK_MSG);
  });

  it("cenotécnica sem tipo de freela: aviso NÃO bloqueante — botões seguem habilitados", () => {
    montar({ data: dados({ getFunctionName: () => "Cenotecnica" }) });
    expect(screen.getByTestId("text-scaling-warning")).toHaveTextContent(CENO_FREELA_MISSING_MSG);
    expect(motivoInline()).toBeNull();
    expect(confirmar()).toBeEnabled();
  });
});
