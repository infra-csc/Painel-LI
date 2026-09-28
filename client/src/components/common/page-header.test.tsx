import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { Users } from "lucide-react";
import { renderComTudo } from "@/test/render";
import { PageHeader } from "./page-header";

describe("PageHeader", () => {
  it("renderiza um único h1 com o título (variante padrão)", () => {
    renderComTudo(<PageHeader title="Colaboradores" subtitle="Cadastro e situação" icon={Users} />);
    const titulos = screen.getAllByRole("heading", { level: 1 });
    expect(titulos).toHaveLength(1);
    expect(titulos[0]).toHaveTextContent("Colaboradores");
    expect(screen.getByText("Cadastro e situação")).toBeInTheDocument();
  });

  it("é um <header> (landmark banner) nas duas variantes", () => {
    const { unmount } = renderComTudo(<PageHeader title="Padrão" />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
    unmount();
    renderComTudo(<PageHeader variant="bar" title="Barra" />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("variante bar fica fixa abaixo da barra do topo (sticky + z-30) e sangra até as margens", () => {
    renderComTudo(<PageHeader variant="bar" title="Escalação" subtitle="Evento X" />);
    const header = screen.getByRole("banner");
    expect(header).toHaveClass("sticky", "z-30", "top-[var(--sticky-top)]", "-mx-[var(--page-gutter)]");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText("Evento X")).toHaveAttribute("aria-live", "polite");
  });

  it("variante padrão não é sticky", () => {
    renderComTudo(<PageHeader title="Relatório" />);
    expect(screen.getByRole("banner")).not.toHaveClass("sticky");
  });

  it("renderiza actions, context e tabs", () => {
    renderComTudo(
      <PageHeader
        title="Passagens"
        actions={<button type="button">Nova passagem</button>}
        context={<select aria-label="Evento"><option>Todos</option></select>}
        tabs={<nav aria-label="Abas">Abas</nav>}
      />,
    );
    expect(screen.getByRole("button", { name: "Nova passagem" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Evento" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Abas" })).toBeInTheDocument();
  });

  it("ícone é decorativo (aria-hidden) e não vira nome do cabeçalho", () => {
    const { container } = renderComTudo(<PageHeader title="Colaboradores" icon={Users} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("heading", { level: 1 })).toHaveAccessibleName("Colaboradores");
  });
});
