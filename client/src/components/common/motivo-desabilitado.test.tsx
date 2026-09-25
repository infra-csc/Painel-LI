import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { Button } from "@/components/ui/button";
import { MotivoDesabilitado, MOTIVO_PADRAO } from "./motivo-desabilitado";

/** O invólucro focável: role=button desabilitado, nomeado pelo botão filho e descrito pelo motivo. */
const involucro = (nome: string, motivo: string) => screen.getByRole("button", { name: nome, description: motivo });
/** O `<button disabled>` de verdade, dentro do invólucro. */
const botaoInterno = (nome: string) => screen.getAllByRole("button", { name: nome }).find((el) => el.tagName === "BUTTON")!;

describe("MotivoDesabilitado", () => {
  it("botão desabilitado ganha um invólucro focável role=button aria-disabled, nomeado pelo filho e descrito pelo motivo", () => {
    renderComTudo(
      <MotivoDesabilitado motivo="Selecione um evento" desabilitado>
        <Button disabled>Exportar</Button>
      </MotivoDesabilitado>,
    );
    const span = involucro("Exportar", "Selecione um evento");
    expect(span.tagName).toBe("SPAN");
    expect(span).toHaveAttribute("tabindex", "0");
    expect(span).toHaveAttribute("aria-disabled", "true");
    expect(span).not.toHaveAttribute("aria-label"); // aria-label é proibido sem papel; agora o nome vem do conteúdo
    expect(span).toHaveAccessibleName("Exportar"); // o motivo NÃO entra no nome (só na descrição)
    expect(span).toHaveAccessibleDescription("Selecione um evento");
    const descricao = document.getElementById(span.getAttribute("aria-describedby")!)!;
    expect(descricao).toHaveClass("sr-only");
    expect(span).toContainElement(descricao);
    expect(span).toContainElement(botaoInterno("Exportar"));
    expect(botaoInterno("Exportar")).toBeDisabled();
  });

  it("mostra o tooltip ao focar o invólucro pelo teclado", async () => {
    const { user } = renderComTudo(
      <MotivoDesabilitado motivo="Selecione um evento" desabilitado>
        <Button disabled>Exportar</Button>
      </MotivoDesabilitado>,
    );
    await user.tab();
    expect(involucro("Exportar", "Selecione um evento")).toHaveFocus();
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Selecione um evento");
    // Com o tooltip aberto a descrição continua sendo o motivo (o Radix não a sobrescreve).
    expect(involucro("Exportar", "Selecione um evento")).toHaveAccessibleDescription("Selecione um evento");
  });

  it("mostra o tooltip ao passar o mouse sobre o invólucro", async () => {
    const { user } = renderComTudo(
      <MotivoDesabilitado motivo="Sem permissão para excluir" desabilitado>
        <Button disabled>Excluir</Button>
      </MotivoDesabilitado>,
    );
    await user.hover(involucro("Excluir", "Sem permissão para excluir"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Sem permissão para excluir");
  });

  it("habilitado: o tooltip vai direto no botão, sem invólucro nem descrição fixa", async () => {
    const { user } = renderComTudo(
      <MotivoDesabilitado motivo="Gera o Excel do evento">
        <Button>Exportar</Button>
      </MotivoDesabilitado>,
    );
    const botoes = screen.getAllByRole("button", { name: "Exportar" });
    expect(botoes).toHaveLength(1);
    const botao = botoes[0];
    expect(botao.tagName).toBe("BUTTON");
    expect(botao.parentElement?.tagName).not.toBe("SPAN");
    expect(botao).not.toHaveAttribute("aria-describedby");
    await user.tab();
    expect(botao).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Gera o Excel do evento");
  });

  it("sem motivo devolve o filho como está (sem tooltip)", async () => {
    const { user } = renderComTudo(
      <MotivoDesabilitado motivo="" desabilitado>
        <Button disabled>Exportar</Button>
      </MotivoDesabilitado>,
    );
    expect(screen.getAllByRole("button", { name: "Exportar" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Exportar" }).parentElement?.tagName).not.toBe("SPAN");
    await user.tab();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("motivo que não é texto vira a descrição padrão 'Ação indisponível' (o tooltip mostra o JSX)", async () => {
    const { user } = renderComTudo(
      <MotivoDesabilitado motivo={<strong>Só o RH</strong>} desabilitado>
        <Button disabled>Aprovar</Button>
      </MotivoDesabilitado>,
    );
    expect(MOTIVO_PADRAO).toBe("Ação indisponível");
    const span = involucro("Aprovar", MOTIVO_PADRAO);
    expect(span.tagName).toBe("SPAN");
    expect(span).not.toHaveAttribute("aria-label");
    await user.tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Só o RH");
  });
});
