import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { rotuloDaVaga } from "@/components/common/status-badge";
import { PAST_EVENT_BLOCK_MSG } from "@/lib/event-lock";
import { InclusionRow, type InclusionRowProps } from "./inclusion-row";

function montar(extras: Partial<InclusionRowProps> = {}) {
  const acoes = {
    onToggleSelect: vi.fn(), onCopyId: vi.fn(), onComments: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onCancel: vi.fn(),
  };
  const props: InclusionRowProps = {
    index: 0, id: "vaga-1", inclusionNumber: 101,
    eventName: "Circuito Brasília", eventLocation: "Brasília, DF", functionName: "Produção",
    collaboratorName: "Ana Souza", empreitaEmpresa: null, empreitaTitulo: "",
    displayStatus: "aguardando_passagem", isCanceled: false,
    periodo: "10/04 – 12/04", diarias: "3 diárias",
    needsTicket: true, needsAccommodation: false,
    selected: false, locked: false, lockReason: null,
    canEditScreen: true, readOnly: false, canDelete: true, canCancel: true, cancelByRole: false, swapApproved: false,
    ...acoes, ...extras,
  };
  const utils = renderComTudo(<table><tbody><InclusionRow {...props} /></tbody></table>);
  return { ...utils, ...acoes, linha: screen.getByRole("row") };
}

const editar = () => screen.queryByRole("button", { name: "Editar inclusão #101" });
const excluir = () => screen.queryByRole("button", { name: "Excluir inclusão #101" });
const cancelar = () => screen.queryByRole("button", { name: "Cancelar escalação da inclusão #101" });

describe("InclusionRow", () => {
  it("mostra número, evento, função, colaborador, período e a pílula de status com o rótulo do shared", () => {
    const { linha } = montar();
    expect(linha).toHaveTextContent("#101");
    expect(within(linha).getByText("Circuito Brasília")).toBeInTheDocument();
    expect(within(linha).getByText("Brasília, DF")).toBeInTheDocument();
    expect(within(linha).getByText("Produção")).toBeInTheDocument();
    expect(within(linha).getByText("Ana Souza")).toBeInTheDocument();
    expect(within(linha).getByText("10/04 – 12/04")).toBeInTheDocument();
    expect(within(linha).getByText("3 diárias")).toBeInTheDocument();
    const pilula = screen.getByTestId("status-aguardando_passagem");
    expect(pilula).toHaveTextContent(rotuloDaVaga("aguardando_passagem"));
    // aguardando → tom warning (cor sai do significado, não da tela)
    expect(pilula).toHaveClass("text-warning");
  });

  it("vaga sem colaborador diz 'Não escalado'; empreita mostra a etiqueta e a empresa", () => {
    const { unmount } = montar({ collaboratorName: null });
    expect(screen.getByText("Não escalado")).toBeInTheDocument();
    unmount();
    montar({ collaboratorName: null, empreitaEmpresa: "Cenoart Ltda", empreitaTitulo: "Empreita Cenoart Ltda" });
    expect(screen.getByText("Empreita")).toBeInTheDocument();
    expect(screen.getByText(/Cenoart Ltda/)).toBeInTheDocument();
  });

  it("'Precisa de' passagem/hospedagem tem título legível nos dois estados", () => {
    montar({ needsTicket: true, needsAccommodation: false });
    expect(screen.getByTitle("Precisa de passagem")).toBeInTheDocument();
    expect(screen.getByTitle("Não precisa de hospedagem")).toBeInTheDocument();
  });

  it("status editável: comentários, editar, excluir e cancelar chamam os callbacks com o id", async () => {
    const { user, onComments, onEdit, onDelete, onCancel } = montar();
    await user.click(screen.getByRole("button", { name: "Ver comentários da inclusão #101" }));
    await user.click(editar()!);
    await user.click(excluir()!);
    await user.click(cancelar()!);
    expect(onComments).toHaveBeenCalledWith("vaga-1");
    expect(onEdit).toHaveBeenCalledWith("vaga-1");
    expect(onDelete).toHaveBeenCalledWith("vaga-1");
    expect(onCancel).toHaveBeenCalledWith("vaga-1");
  });

  it("somente leitura (comprado/cancelado): sem Editar; excluir só com canDelete; cancelar só pelo papel (cancelByRole)", () => {
    const { unmount } = montar({ readOnly: true, canDelete: false, canCancel: true, cancelByRole: false });
    expect(editar()).toBeNull();
    expect(excluir()).toBeNull();
    expect(cancelar()).toBeNull();
    unmount();
    montar({ readOnly: true, canDelete: true, canCancel: true, cancelByRole: true });
    expect(editar()).toBeNull();
    expect(excluir()).toBeInTheDocument();
    expect(cancelar()).toBeInTheDocument();
  });

  it("sem permissão de tela só resta comentar e copiar o ID", () => {
    montar({ canEditScreen: false });
    expect(editar()).toBeNull();
    expect(excluir()).toBeNull();
    expect(cancelar()).toBeNull();
    expect(screen.getByRole("button", { name: "Ver comentários da inclusão #101" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copiar ID da inclusão #101" })).toBeInTheDocument();
  });

  it("linha travada: cadeado com o motivo, checkbox desabilitado com o motivo no title e nenhuma ação de edição", () => {
    const motivo = "Evento indisponível — recarregue a página";
    montar({ locked: true, lockReason: motivo });
    expect(screen.getByLabelText(motivo)).toBeInTheDocument();
    const caixa = screen.getByRole("checkbox", { name: "Selecionar inclusão #101" });
    expect(caixa).toBeDisabled();
    expect(caixa).toHaveAttribute("title", motivo);
    expect(editar()).toBeNull();
    expect(excluir()).toBeNull();
  });

  it("travada sem motivo próprio usa a frase padrão de evento encerrado", () => {
    montar({ locked: true, lockReason: null });
    expect(screen.getByLabelText(PAST_EVENT_BLOCK_MSG)).toBeInTheDocument();
  });

  it("checkbox chama onToggleSelect; copiar ID manda o NÚMERO da inclusão (não o uuid)", async () => {
    const { user, onToggleSelect, onCopyId } = montar();
    await user.click(screen.getByRole("checkbox", { name: "Selecionar inclusão #101" }));
    expect(onToggleSelect).toHaveBeenCalledWith("vaga-1");
    await user.click(screen.getByRole("button", { name: "Copiar ID da inclusão #101" }));
    expect(onCopyId).toHaveBeenCalledWith("101");
  });

  it("cancelada fica esmaecida; troca aprovada ganha a etiqueta", () => {
    const { linha } = montar({ isCanceled: true, swapApproved: true, displayStatus: "cancelado" });
    expect(linha).toHaveClass("opacity-40");
    expect(screen.getByText("Troca aprovada")).toBeInTheDocument();
    expect(screen.getByTestId("status-cancelado")).toHaveTextContent("Cancelada");
  });
});
