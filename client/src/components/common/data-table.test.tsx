/**
 * DataTable (28/09): semântica, ordenação, vazio, carregando, linha clicável,
 * seleção e modo cartão (com `matchMedia` mockado para "celular").
 */
import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { DataTable, type ColunaDaTabela } from "./data-table";

interface Linha { id: string; nome: string; cidade: string; total: number }

const LINHAS: Linha[] = [
  { id: "a", nome: "Ana", cidade: "Belém", total: 3 },
  { id: "b", nome: "Bruno", cidade: "Recife", total: 0 },
  { id: "c", nome: "Carla", cidade: "Manaus", total: 7 },
];

type Chave = "nome" | "cidade" | "total";

const COLUNAS: ColunaDaTabela<Linha, Chave>[] = [
  { key: "nome", header: "Nome", cell: r => r.nome, sortable: true, papel: "principal" },
  { key: "cidade", header: "Cidade", cell: r => r.cidade, sortable: true },
  { key: "total", header: "Total", cell: r => r.total, align: "right", headerTip: "Vagas ativas" },
];

/** Faz `useIsMobile()` responder `true` (ou `false`) neste teste. */
function simularCelular(celular: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
    matches: celular && query === "(max-width: 767px)",
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

describe("DataTable — semântica", () => {
  it("tem caption só para leitores de tela, th com scope e aria-rowcount contando o cabeçalho", () => {
    renderComTudo(<DataTable columns={COLUNAS} rows={LINHAS} getRowId={r => r.id} caption="Colaboradores da lista" />);
    const tabela = screen.getByRole("table", { name: "Colaboradores da lista" });
    expect(tabela).toHaveAttribute("aria-rowcount", "4");
    expect(tabela.querySelector("caption")).toHaveClass("sr-only");
    const cabecalhos = screen.getAllByRole("columnheader");
    expect(cabecalhos).toHaveLength(3);
    cabecalhos.forEach(th => expect(th).toHaveAttribute("scope", "col"));
    expect(screen.getAllByRole("row")).toHaveLength(4);
    expect(screen.getByText("Belém")).toBeInTheDocument();
  });

  it("cabeçalho usa o token bg-surface-muted e fica sticky quando pedido", () => {
    renderComTudo(<DataTable columns={COLUNAS} rows={LINHAS} getRowId={r => r.id} caption="x" stickyHeader />);
    const thead = screen.getByRole("table").querySelector("thead");
    expect(thead).toHaveClass("bg-surface-muted", "sticky", "top-0");
  });

  it("densidade compact e regular mudam só o espaçamento das células", () => {
    const { rerender } = renderComTudo(<DataTable columns={COLUNAS} rows={LINHAS} getRowId={r => r.id} caption="x" density="compact" />);
    expect(screen.getByText("Belém")).toHaveClass("px-3.5", "py-2.5");
    rerender(<DataTable columns={COLUNAS} rows={LINHAS} getRowId={r => r.id} caption="x" density="regular" />);
    expect(screen.getByText("Belém")).toHaveClass("px-5", "py-3.5");
  });

  it("zebra pinta as linhas ímpares", () => {
    renderComTudo(<DataTable columns={COLUNAS} rows={LINHAS} getRowId={r => r.id} caption="x" zebra />);
    const linhas = screen.getAllByRole("row").slice(1);
    expect(linhas[0]).not.toHaveClass("bg-surface-muted/40");
    expect(linhas[1]).toHaveClass("bg-surface-muted/40");
  });
});

describe("DataTable — ordenação", () => {
  it("só colunas ordenáveis têm aria-sort e botão; a ativa mostra a direção", async () => {
    const onSort = vi.fn();
    const { user } = renderComTudo(
      <DataTable columns={COLUNAS} rows={LINHAS} getRowId={r => r.id} caption="x" sort={{ key: "nome", dir: "desc" }} onSort={onSort} />,
    );
    expect(screen.getByTestId("header-nome")).toHaveAttribute("aria-sort", "descending");
    expect(screen.getByTestId("header-cidade")).toHaveAttribute("aria-sort", "none");
    expect(screen.getByTestId("header-total")).not.toHaveAttribute("aria-sort");

    await user.click(screen.getByRole("button", { name: "Ordenar por Cidade" }));
    expect(onSort).toHaveBeenCalledWith("cidade");
    expect(screen.queryByRole("button", { name: "Ordenar por Total" })).toBeNull();
  });

  it("o botão de ordenar funciona pelo teclado (Enter)", async () => {
    const onSort = vi.fn();
    const { user } = renderComTudo(
      <DataTable columns={COLUNAS} rows={LINHAS} getRowId={r => r.id} caption="x" sort={null} onSort={onSort} />,
    );
    screen.getByRole("button", { name: "Ordenar por Nome" }).focus();
    await user.keyboard("{Enter}");
    expect(onSort).toHaveBeenCalledWith("nome");
  });
});

describe("DataTable — estados", () => {
  it("vazio renderiza o emptyState no lugar da tabela", () => {
    renderComTudo(<DataTable columns={COLUNAS} rows={[]} getRowId={r => r.id} caption="x" emptyState={<p>Nada por aqui</p>} />);
    expect(screen.getByText("Nada por aqui")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("carregando mostra o esqueleto com o rótulo", () => {
    renderComTudo(<DataTable columns={COLUNAS} rows={LINHAS} getRowId={r => r.id} caption="x" loading loadingLabel="Carregando pessoas…" />);
    expect(screen.getByRole("status", { name: "Carregando pessoas…" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("DataTable — linha clicável, ações e seleção", () => {
  it("a célula principal vira botão; clicar num controle da linha não dispara onRowClick", async () => {
    const onRowClick = vi.fn();
    const onEditar = vi.fn();
    const { user } = renderComTudo(
      <DataTable
        columns={COLUNAS} rows={LINHAS} getRowId={r => r.id} caption="x"
        onRowClick={onRowClick}
        rowActions={r => <button type="button" onClick={() => onEditar(r.id)}>Editar {r.nome}</button>}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Ana" }));
    expect(onRowClick).toHaveBeenCalledWith(LINHAS[0]);

    await user.click(screen.getByRole("button", { name: "Editar Bruno" }));
    expect(onEditar).toHaveBeenCalledWith("b");
    expect(onRowClick).toHaveBeenCalledTimes(1);
    // A coluna de ações tem nome falado mesmo sem rótulo visível.
    expect(screen.getByRole("columnheader", { name: "Ações" })).toBeInTheDocument();
  });

  it("seleção: caixa por linha e 'Selecionar todos' indeterminada quando só parte está marcada", async () => {
    const onToggle = vi.fn();
    const onToggleTodos = vi.fn();
    const { user } = renderComTudo(
      <DataTable
        columns={COLUNAS} rows={LINHAS} getRowId={r => r.id} caption="x"
        selectable={{ selecionados: new Set(["a"]), onToggle, onToggleTodos, rotuloDaLinha: r => r.nome }}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "Selecionar todos" })).toHaveAttribute("aria-checked", "mixed");
    expect(screen.getByRole("checkbox", { name: "Selecionar Ana" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("checkbox", { name: "Selecionar Bruno" }));
    expect(onToggle).toHaveBeenCalledWith("b");
  });

  it("rowRender substitui a linha inteira (linha memoizada da tela)", () => {
    renderComTudo(
      <DataTable
        columns={COLUNAS} rows={LINHAS} getRowId={r => r.id} caption="x"
        rowRender={r => <tr key={r.id} data-testid={`linha-${r.id}`}><td colSpan={3}>{r.nome.toUpperCase()}</td></tr>}
      />,
    );
    expect(screen.getByTestId("linha-a")).toHaveTextContent("ANA");
    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
  });
});

describe("DataTable — modo cartão", () => {
  it("abaixo de md vira lista de cartões com título (principal) e rótulo: valor (secundárias)", () => {
    simularCelular(true);
    renderComTudo(<DataTable columns={COLUNAS} rows={LINHAS} getRowId={r => r.id} caption="Colaboradores" />);
    expect(screen.queryByRole("table")).toBeNull();
    const lista = screen.getByRole("list", { name: "Colaboradores" });
    const cartoes = within(lista).getAllByRole("listitem");
    expect(cartoes).toHaveLength(3);
    expect(within(cartoes[0]).getByText("Ana")).toBeInTheDocument();
    expect(within(cartoes[0]).getByText("Cidade")).toBeInTheDocument();
    expect(within(cartoes[0]).getByText("Belém")).toBeInTheDocument();
  });

  it("cardRender manda no cartão; cardMode='never' mantém a tabela no celular", () => {
    simularCelular(true);
    const { rerender } = renderComTudo(
      <DataTable columns={COLUNAS} rows={LINHAS} getRowId={r => r.id} caption="x" cardRender={r => <article>Cartão de {r.nome}</article>} />,
    );
    expect(screen.getByText("Cartão de Carla")).toBeInTheDocument();
    rerender(<DataTable columns={COLUNAS} rows={LINHAS} getRowId={r => r.id} caption="x" cardMode="never" />);
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("cardMode='always' usa cartões mesmo no desktop e mantém as ações", () => {
    simularCelular(false);
    renderComTudo(
      <DataTable
        columns={COLUNAS} rows={LINHAS} getRowId={r => r.id} caption="x" cardMode="always"
        rowActions={r => <button type="button">Excluir {r.nome}</button>}
      />,
    );
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("button", { name: "Excluir Ana" })).toBeInTheDocument();
  });
});
