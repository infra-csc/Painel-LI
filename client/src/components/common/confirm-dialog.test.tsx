import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { Trash2 } from "lucide-react";
import { renderComTudo } from "@/test/render";
import { ConfirmDialog, type ConfirmDialogProps } from "./confirm-dialog";

function montar(extras: Partial<ConfirmDialogProps> = {}) {
  const onOpenChange = vi.fn();
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const utils = renderComTudo(
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      onCancel={onCancel}
      title="Excluir vaga?"
      description="A vaga sai da escala e não dá para desfazer."
      confirmLabel="Excluir"
      {...extras}
    />,
  );
  return { ...utils, onOpenChange, onConfirm, onCancel };
}

describe("ConfirmDialog", () => {
  it("renderiza título e descrição num alertdialog nomeado pelo título", () => {
    montar();
    const dialogo = screen.getByRole("alertdialog", { name: "Excluir vaga?" });
    expect(dialogo).toHaveAccessibleDescription("A vaga sai da escala e não dá para desfazer.");
  });

  it("mantém a ordem Cancelar → Confirmar", () => {
    montar();
    const botoes = within(screen.getByRole("alertdialog")).getAllByRole("button");
    expect(botoes.map((b) => b.textContent)).toEqual(["Cancelar", "Excluir"]);
  });

  it("Confirmar chama onConfirm e NÃO fecha sozinho", async () => {
    const { user, onConfirm, onOpenChange } = montar();
    await user.click(screen.getByRole("button", { name: "Excluir" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("Cancelar chama onCancel uma vez e onOpenChange(false)", async () => {
    const { user, onCancel, onOpenChange, onConfirm } = montar();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("Esc chama onOpenChange(false)", async () => {
    const { user, onOpenChange } = montar();
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("no tom padrão o foco inicial vai para o Confirmar", () => {
    montar();
    expect(screen.getByRole("button", { name: "Excluir" })).toHaveFocus();
  });

  it("tone=danger foca o Cancelar e pinta o Confirmar de destructive", () => {
    montar({ tone: "danger", icon: Trash2 });
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Excluir" })).toHaveClass("bg-destructive");
  });

  it("pending desabilita os dois botões, mostra spinner e ignora Esc", async () => {
    const { user, onOpenChange, container } = montar({ pending: true });
    const confirmar = screen.getByRole("button", { name: "Excluir" });
    expect(confirmar).toBeDisabled();
    expect(confirmar).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    expect(confirmar.querySelector("svg.animate-spin")).not.toBeNull();
    expect(container).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("confirmDisabled desabilita só o Confirmar e bloqueia onConfirm", async () => {
    const { user, onConfirm } = montar({ confirmDisabled: true });
    const confirmar = screen.getByRole("button", { name: "Excluir" });
    expect(confirmar).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeEnabled();
    await user.click(confirmar);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("children sem description viram a descrição acessível; detalhes aparecem", () => {
    montar({
      description: undefined,
      detalhes: <span>Evento · Colaborador</span>,
      children: <p>Primeiro parágrafo.</p>,
    });
    expect(screen.getByRole("alertdialog")).toHaveAccessibleDescription("Primeiro parágrafo.");
    expect(screen.getByText("Evento · Colaborador")).toBeInTheDocument();
  });

  it("semConfirmar mostra só o Cancelar, com foco nele", () => {
    montar({ semConfirmar: true });
    const botoes = within(screen.getByRole("alertdialog")).getAllByRole("button");
    expect(botoes).toHaveLength(1);
    expect(botoes[0]).toHaveTextContent("Cancelar");
    expect(botoes[0]).toHaveFocus();
  });
});
