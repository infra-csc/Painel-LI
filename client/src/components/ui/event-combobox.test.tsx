import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import type { Event } from "@shared/schema";
import { renderComTudo } from "@/test/render";
import EventCombobox from "./event-combobox";

const eventos = [
  { id: "ev-b", name: "Circuito Brasília", startDate: "2026-03-10", endDate: "2026-03-12" },
  { id: "ev-a", name: "Abertura Curitiba", startDate: "2026-02-01", endDate: "2026-02-01" },
  { id: "ev-c", name: "Maratona Rio", startDate: "2026-05-20", endDate: "2026-05-21" },
] as Event[];

function montar(value = "all", extras: Partial<React.ComponentProps<typeof EventCombobox>> = {}) {
  const onValueChange = vi.fn();
  const utils = renderComTudo(<EventCombobox events={eventos} value={value} onValueChange={onValueChange} {...extras} />);
  return { ...utils, onValueChange };
}

const gatilho = () => screen.getByTestId("event-combobox");

describe("EventCombobox", () => {
  it("abre pelo teclado (Enter no gatilho) com a busca focada e as opções em ordem alfabética", async () => {
    const { user } = montar();
    await user.tab();
    expect(gatilho()).toHaveFocus();
    expect(gatilho()).toHaveAttribute("aria-expanded", "false");
    await user.keyboard("{Enter}");
    expect(gatilho()).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByPlaceholderText("Buscar evento…")).toHaveFocus();

    const lista = screen.getByRole("listbox", { name: "Eventos" });
    const nomes = within(lista).getAllByRole("option").map((o) => o.textContent);
    expect(nomes[0]).toBe("Todos os eventos");
    expect(nomes.slice(1)).toEqual(["Abertura Curitiba01/02/2026", "Circuito Brasília12/03/2026", "Maratona Rio21/05/2026"]);
  });

  it("marca a opção selecionada com aria-selected e mostra o nome no gatilho", async () => {
    const { user } = montar("ev-c");
    expect(gatilho()).toHaveTextContent("Maratona Rio");
    expect(gatilho()).toHaveAttribute("title", "Maratona Rio");
    await user.click(gatilho());
    const selecionada = await screen.findByRole("option", { name: /Maratona Rio/ });
    expect(selecionada).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: /Abertura Curitiba/ })).toHaveAttribute("aria-selected", "false");
  });

  it("Tab percorre as opções e Enter seleciona, fechando a lista", async () => {
    const { user, onValueChange } = montar();
    await user.click(gatilho());
    await screen.findByPlaceholderText("Buscar evento…");
    await user.tab(); // Todos os eventos
    await user.tab(); // Abertura Curitiba
    expect(screen.getByRole("option", { name: /Abertura Curitiba/ })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onValueChange).toHaveBeenCalledWith("ev-a");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("Esc fecha a lista, limpa a busca e devolve o foco ao gatilho", async () => {
    const { user } = montar();
    await user.click(gatilho());
    await user.type(await screen.findByPlaceholderText("Buscar evento…"), "rio");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(gatilho()).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(await screen.findByPlaceholderText("Buscar evento…")).toHaveValue("");
  });

  it("digitar filtra sem diferenciar caixa e some com 'Todos'; sem resultado avisa", async () => {
    const { user } = montar();
    await user.click(gatilho());
    await user.type(await screen.findByPlaceholderText("Buscar evento…"), "RIO");
    const opcoes = screen.getAllByRole("option");
    expect(opcoes).toHaveLength(1);
    expect(opcoes[0]).toHaveTextContent("Maratona Rio");

    await user.click(screen.getByRole("button", { name: "Limpar busca" }));
    expect(screen.getAllByRole("option")).toHaveLength(4);

    await user.type(screen.getByPlaceholderText("Buscar evento…"), "zzz");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText("Nenhum evento encontrado.")).toBeInTheDocument();
  });

  it("botão 'Limpar evento selecionado' volta para 'all' sem abrir a lista", async () => {
    const { user, onValueChange } = montar("ev-b");
    await user.click(screen.getByRole("button", { name: "Limpar evento selecionado" }));
    expect(onValueChange).toHaveBeenCalledWith("all");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("showAllOption=false esconde 'Todos' e mostra o placeholder", async () => {
    const { user } = montar("", { showAllOption: false, placeholder: "Escolha o evento" });
    expect(gatilho()).toHaveTextContent("Escolha o evento");
    await user.click(gatilho());
    await screen.findByRole("listbox");
    expect(screen.queryByRole("option", { name: "Todos os eventos" })).not.toBeInTheDocument();
  });

  it("disabled trava o gatilho e o limpar", () => {
    montar("ev-b", { disabled: true });
    expect(gatilho()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Limpar evento selecionado" })).toBeDisabled();
  });

  // Padrão combobox da WAI-ARIA (25/09): gatilho combobox → listbox; o teclado
  // anda pela lista sem sair da busca, via `aria-activedescendant`.
  it("gatilho é role=combobox apontando (aria-controls) para a listbox, com aria-haspopup=listbox", async () => {
    const { user } = montar();
    expect(gatilho()).toHaveAttribute("role", "combobox");
    expect(gatilho()).toHaveAttribute("aria-haspopup", "listbox");
    expect(gatilho()).toHaveAttribute("aria-expanded", "false");
    await user.click(gatilho());
    const lista = await screen.findByRole("listbox", { name: "Eventos" });
    expect(gatilho()).toHaveAttribute("aria-controls", lista.id);
    expect(lista.id).not.toBe("");
    expect(screen.getByRole("textbox", { name: "Buscar evento" })).toHaveAttribute("aria-controls", lista.id);
  });

  it("setas ↑/↓ movem a opção ativa (aria-activedescendant na busca), Home/End vão às pontas e Enter escolhe a ativa", async () => {
    const rolar = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
    const { user, onValueChange } = montar();
    await user.click(gatilho());
    const busca = await screen.findByRole("textbox", { name: "Buscar evento" });
    expect(busca).toHaveFocus();

    const opcao = (nome: RegExp | string) => screen.getByRole("option", { name: nome });
    const ativaEh = (nome: RegExp | string) => {
      const el = opcao(nome);
      expect(el.id).not.toBe("");
      expect(busca).toHaveAttribute("aria-activedescendant", el.id);
      expect(el).toHaveAttribute("data-active", "true");
      expect(el).toHaveClass("bg-brand-soft");
      expect(screen.getAllByRole("option").filter((o) => o.hasAttribute("data-active"))).toEqual([el]);
    };

    ativaEh("Todos os eventos"); // começa na opção já escolhida (value="all")
    await user.keyboard("{ArrowUp}");
    ativaEh("Todos os eventos"); // não passa do começo
    await user.keyboard("{ArrowDown}");
    ativaEh(/Abertura Curitiba/);
    expect(busca).toHaveFocus(); // as setas não tiram o foco da busca
    await user.keyboard("{End}");
    ativaEh(/Maratona Rio/);
    await user.keyboard("{ArrowDown}");
    ativaEh(/Maratona Rio/); // não passa do fim
    await user.keyboard("{Home}");
    ativaEh("Todos os eventos");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    ativaEh(/Circuito Brasília/);
    expect(rolar).toHaveBeenCalled();

    await user.keyboard("{Enter}");
    expect(onValueChange).toHaveBeenCalledWith("ev-b");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("ao abrir, a opção ativa é a já selecionada; digitar volta a ativa para a primeira do filtro", async () => {
    const { user } = montar("ev-c");
    await user.click(gatilho());
    const busca = await screen.findByRole("textbox", { name: "Buscar evento" });
    expect(busca).toHaveAttribute("aria-activedescendant", screen.getByRole("option", { name: /Maratona Rio/ }).id);

    await user.type(busca, "ci");
    expect(screen.getAllByRole("option")).toHaveLength(1); // "Circuito Brasília" (sem "Todos")
    expect(busca).toHaveAttribute("aria-activedescendant", screen.getByRole("option", { name: /Circuito Brasília/ }).id);

    await user.type(busca, "zzz");
    expect(busca).not.toHaveAttribute("aria-activedescendant");
    await user.keyboard("{ArrowDown}{Enter}"); // sem opção, Enter não escolhe nada nem quebra
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("focar uma opção por Tab também a torna a ativa; Esc devolve o foco ao gatilho", async () => {
    const { user } = montar();
    await user.click(gatilho());
    const busca = await screen.findByRole("textbox", { name: "Buscar evento" });
    await user.tab(); // Todos
    await user.tab(); // Abertura Curitiba
    const abertura = screen.getByRole("option", { name: /Abertura Curitiba/ });
    expect(abertura).toHaveFocus();
    expect(abertura).toHaveAttribute("data-active", "true");
    expect(busca).toHaveAttribute("aria-activedescendant", abertura.id);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(gatilho()).toHaveFocus();
    expect(gatilho()).toHaveAttribute("aria-expanded", "false");
  });
});
