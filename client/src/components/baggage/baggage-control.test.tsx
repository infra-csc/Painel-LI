/**
 * Controle de Bagagem — a tela inteira com a API simulada (redesenho 08/10).
 *
 * Trava o que o redesenho mudou de lugar sem mudar de regra: a fila por
 * companhia conta e filtra (reclicar desliga), a etiqueta e o "N de M" só
 * aparecem com recorte, a linha abre a edição, a exclusão mostra o bilhete e
 * chama o DELETE, os dois relatórios somam os mesmos números (e o − / + do
 * histórico só aparece em "Ajustar histórico"), o vazio tem saída e quem não é
 * admin nem Compras não vê nada.
 */
import { describe, it, expect } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import { renderComTudo, esperarToast } from "@/test/render";
import { mockarFetch, respostaJson, usuarioFake, type RoteadorDeFetch } from "@/test/fixtures";
import { criarQueryClientComApi } from "@/test/query-client-api";
import { colaboradorFake, eventoFake } from "@/test/fixtures-dominio";
import BaggageControlPage from "@/pages/baggage-control";
import type { BaggageHistoryItem, BaggageRequestItem } from "./baggage-core";

const compras = usuarioFake({ id: "compras-1", role: "purchasing", name: "Camila Duarte" });

const evA = eventoFake({ id: "ev-a", name: "Night Run Porto Alegre", location: "Porto Alegre - RS", startDate: "2099-11-07", endDate: "2099-11-08" });
const evB = eventoFake({ id: "ev-b", name: "Maratona de Salvador", location: "Salvador - BA", startDate: "2099-11-21", endDate: "2099-11-23" });
const ana = colaboradorFake({ id: "c-ana", fullName: "ANA MARIA DA SILVA", officialDocument: "10042762602", documentType: "cpf" });
const bruno = colaboradorFake({ id: "c-bruno", fullName: "Bruno Lima", officialDocument: "20020589438", documentType: "cpf" });

function pedido(p: Partial<BaggageRequestItem>): BaggageRequestItem {
  return {
    id: "b-1", eventId: "ev-a", collaboratorId: "c-ana", loc: "BO5820", cia: "Azul", valueCents: 9350, os: "OS-1",
    quantity: 2, agency: "LCA", requestDate: "2099-10-28", boardingDate: "2099-11-03", notes: null, createdAt: "2099-10-28T12:00:00Z",
    createdByName: "Camila Duarte", ...p,
  };
}

const PEDIDOS = [
  pedido({}),
  pedido({ id: "b-2", loc: "AN5783", cia: "TAM", valueCents: 28000, quantity: 1, collaboratorId: "c-bruno", eventId: "ev-b", boardingDate: "2099-11-01" }),
  pedido({ id: "b-3", loc: "ZM5746", cia: "Gol", valueCents: 25650, quantity: 1, collaboratorId: "c-bruno", boardingDate: "2099-10-30", notes: "Material de ativação" }),
];
const HISTORICO: BaggageHistoryItem[] = [{ collaboratorId: "c-ana", cia: "Gol", quantity: 3 }];

function api(pedidos = PEDIDOS, historico = HISTORICO): RoteadorDeFetch {
  return (url, init) => {
    const [caminho] = url.split("?");
    const metodo = init?.method ?? "GET";
    if (metodo === "DELETE" && caminho.startsWith("/api/baggage-requests/")) return respostaJson({ ok: true });
    switch (caminho) {
      case "/api/events": return respostaJson([evA, evB]);
      case "/api/collaborators": return respostaJson([ana, bruno]);
      case "/api/baggage-requests": return respostaJson(pedidos);
      case "/api/baggage-history": return respostaJson(historico);
      default: return respostaJson([]);
    }
  };
}

const montar = (opcoes: { user?: ReturnType<typeof usuarioFake>; rota?: string; pedidos?: BaggageRequestItem[] } = {}) => {
  const fetchMock = mockarFetch(api(opcoes.pedidos ?? PEDIDOS));
  const utils = renderComTudo(<BaggageControlPage />, {
    user: opcoes.user ?? compras, queryClient: criarQueryClientComApi(), rota: opcoes.rota ?? "/baggage-control",
  });
  return { ...utils, fetchMock };
};

describe("Controle de Bagagem — tela", () => {
  it("lista em tabela com o bilhete, o resumo na barra e a fila por companhia que filtra e desliga", async () => {
    const { user } = montar();
    const linha = await screen.findByTestId("baggage-row-BO5820");
    expect(linha).toHaveTextContent("Ana Maria da Silva");
    expect(linha).toHaveTextContent("100.427.626-02");
    expect(linha).toHaveTextContent("Night Run Porto Alegre");
    expect(screen.getByTestId("resumo-do-recorte")).toHaveTextContent("3 solicitações · 4 bagagens");
    expect(screen.getByTestId("baggage-row-ZM5746")).toHaveTextContent("Material de ativação");

    // Sem recorte não há "Limpar" nem "N de M".
    expect(screen.queryByTestId("button-clear-filters")).not.toBeInTheDocument();

    const gol = screen.getByTestId("fila-cia-gol");
    expect(gol).toHaveTextContent("1");
    await user.click(gol);
    expect(gol).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("baggage-row-BO5820")).not.toBeInTheDocument();
    expect(screen.getByTestId("baggage-row-ZM5746")).toBeInTheDocument();
    expect(screen.getByTestId("contagem-bagagem")).toHaveTextContent("1 de 3 solicitações");
    expect(screen.getByRole("button", { name: "Tirar o filtro companhia aérea" })).toBeInTheDocument();

    // Reclicar desliga.
    await user.click(gol);
    expect(await screen.findByTestId("baggage-row-BO5820")).toBeInTheDocument();
  });

  it("a linha abre a edição com o bilhete no cabeçalho; o formulário vazio acusa os obrigatórios", async () => {
    const { user } = montar();
    const linha = await screen.findByTestId("baggage-row-BO5820");
    await user.click(within(linha).getByText("Night Run Porto Alegre"));
    const modal = await screen.findByRole("dialog", { name: "Editar solicitação de bagagem" });
    expect(modal).toHaveTextContent("LOC BO5820");
    expect(within(modal).getByTestId("rodape-obrigatorios")).toHaveTextContent("Tudo preenchido.");
    expect(within(modal).getByRole("radio", { name: "Azul" })).toHaveAttribute("aria-checked", "true");
    await user.click(within(modal).getByTestId("button-cancel-form"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByTestId("button-new-baggage"));
    const novo = await screen.findByRole("dialog", { name: "Nova solicitação de bagagem" });
    await user.click(within(novo).getByTestId("button-submit-baggage"));
    expect(await within(novo).findByText("Informe o localizador (LOC)")).toBeInTheDocument();
    expect(within(novo).getByText("Selecione o evento")).toBeInTheDocument();
    expect(within(novo).getByTestId("rodape-obrigatorios")).toHaveTextContent("Faltam 6 campos obrigatórios");

    // "Outros" abre o texto livre da companhia.
    await user.click(within(novo).getByRole("radio", { name: "Outros" }));
    expect(within(novo).getByLabelText("Nome da companhia aérea")).toBeInTheDocument();
  });

  it("excluir mostra o bilhete e chama o DELETE", async () => {
    const { user, fetchMock } = montar();
    await user.click(await screen.findByTestId("button-delete-AN5783"));
    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByTestId("excluir-bilhete")).toHaveTextContent("AN5783");
    expect(within(dialogo).getByTestId("excluir-bilhete")).toHaveTextContent("Bruno Lima");
    await user.click(within(dialogo).getByTestId("button-confirm-delete"));
    await esperarToast("Solicitação excluída");
    expect(fetchMock.mock.calls.some(([u, i]) => String(u).endsWith("/api/baggage-requests/b-2") && i?.method === "DELETE")).toBe(true);
  });

  it("por colaborador: documento com colunas por companhia, total e o − / + só em 'Ajustar histórico'", async () => {
    const { user } = montar({ rota: "/baggage-control?aba=colaboradores" });
    const relatorio = await screen.findByRole("article", { name: "Bagagens por colaborador" });
    const linhaAna = await within(relatorio).findByTestId("collab-row-c-ana");
    // 2 do sistema (Azul) + 3 do histórico (Gol)
    expect(linhaAna).toHaveTextContent("5");
    expect(linhaAna).toHaveTextContent("3 hist.");
    expect(within(relatorio).getByText(/Total · 2 colaboradores/)).toBeInTheDocument();
    expect(within(relatorio).queryByRole("button", { name: /Adicionar 1 bagagem Gol ao histórico/ })).not.toBeInTheDocument();

    await user.click(within(relatorio).getByTestId("button-ajustar-historico"));
    expect(within(relatorio).getByRole("button", { name: "Adicionar 1 bagagem Gol ao histórico de Ana Maria da Silva" })).toBeInTheDocument();
  });

  it("por evento: solicitações, valor médio e total geral; a linha leva à lista recortada", async () => {
    const { user } = montar({ rota: "/baggage-control?aba=eventos" });
    const relatorio = await screen.findByRole("article", { name: "Bagagens por evento" });
    const linhaA = await within(relatorio).findByTestId("event-row-ev-a");
    expect(linhaA).toHaveTextContent("Night Run Porto Alegre");
    expect(linhaA).toHaveTextContent("Porto Alegre - RS");
    expect(within(relatorio).getByText(/Total geral · 2 eventos/)).toBeInTheDocument();

    await user.click(linhaA);
    expect(await screen.findByTestId("baggage-row-BO5820")).toBeInTheDocument();
    expect(screen.queryByTestId("baggage-row-AN5783")).not.toBeInTheDocument();
  });

  it("sem nenhuma solicitação: vazio com saída e sem fila de zeros", async () => {
    montar({ pedidos: [] });
    expect(await screen.findByText("Nenhuma solicitação de bagagem ainda")).toBeInTheDocument();
    expect(screen.getByTestId("button-new-baggage-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("fila-cia-azul")).not.toBeInTheDocument();
  });

  it("quem não é admin nem Compras não vê nada (e a tela nem pede os dados)", async () => {
    const { fetchMock } = montar({ user: usuarioFake({ role: "production" }) });
    expect(await screen.findByTestId("bagagem-sem-acesso")).toHaveTextContent("Acesso restrito");
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/api/baggage"))).toBe(false);
  });
});
