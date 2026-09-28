import { describe, it, expect } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, urlsChamadas, type RoteadorDeFetch } from "@/test/fixtures";
import { usuarioFake } from "@/test/fixtures";
import NotificationsMenu, { SHELL_QUERY_KEYS } from "./notifications-menu";

const compras = usuarioFake({ id: "compras-1", role: "purchasing" });

/** Roteia por URL; o que não for tratado devolve lista vazia. */
function roteador(sobrescrever: Partial<Record<string, () => Response | Promise<Response>>> = {}): RoteadorDeFetch {
  return (url) => {
    const caminho = url.split("?")[0];
    const proprio = sobrescrever[caminho];
    if (proprio) return proprio();
    if (caminho === "/api/shell/aguardando-gestor") return respostaJson({ count: 0 });
    return respostaJson([]);
  };
}

const trocaPendenteEmPassagens = {
  id: "swap-1",
  team_inclusion_id: "ti-1",
  requested_by: "prod-1",
  status: "pendente",
  reason: "Substituição",
  inclusion_status: "passagem_comprada",
  inclusion_deleted_at: null,
  created_at: "2026-09-20T10:00:00.000Z",
};

/** Abre o sino e devolve o painel — que se chama "Pendências" (aria-labelledby no título), não um diálogo anônimo. */
async function abrirSino(user: ReturnType<typeof renderComTudo>["user"]) {
  await user.click(screen.getByRole("button", { name: /Pendências/ }));
  return screen.findByRole("dialog", { name: "Pendências" });
}

describe("NotificationsMenu", () => {
  it("exporta as chaves das consultas que alimentam o sino", () => {
    expect(SHELL_QUERY_KEYS).toEqual([["/api/swap-requests"], ["shell"]]);
  });

  it("enquanto carrega mostra 'Carregando pendências…' e NUNCA 'Nada pendente'", async () => {
    mockarFetch(() => new Promise<Response>(() => {})); // nunca responde
    const { user } = renderComTudo(<NotificationsMenu />, { user: compras });
    const painel = await abrirSino(user);
    expect(within(painel).getByRole("status")).toHaveTextContent("Carregando pendências…");
    expect(within(painel).queryByText(/Nada pendente/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pendências" })).toBeInTheDocument();
  });

  it("erro na API mostra um alerta em vez de fingir que não há pendências", async () => {
    mockarFetch(roteador({ "/api/swap-requests": () => respostaJson({ message: "Erro interno" }, 500) }));
    const { user } = renderComTudo(<NotificationsMenu />, { user: compras });
    const painel = await abrirSino(user);
    const alerta = await within(painel).findByRole("alert");
    expect(alerta).toHaveTextContent("Não foi possível carregar as pendências. Verifique sua conexão.");
    expect(within(painel).queryByText(/Nada pendente/)).not.toBeInTheDocument();
  });

  it("sem pendências: sem badge, 'Nada pendente para você agora.' e link para a página geral", async () => {
    mockarFetch(roteador());
    const { user } = renderComTudo(<NotificationsMenu />, { user: compras });
    const painel = await abrirSino(user);
    expect(await within(painel).findByText("Nada pendente para você agora.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pendências" })).not.toHaveTextContent(/\d/);
    expect(within(painel).getByRole("link", { name: "Ver todas as pendências" })).toHaveAttribute("href", "/pendencias");
    expect(within(painel).queryByRole("button", { name: "Marcar tudo como visto" })).not.toBeInTheDocument();
  });

  it("com pendências (fetch real normalizado) lista os itens, mostra o badge e navega com carimbo", async () => {
    const fetchMock = mockarFetch(roteador({ "/api/swap-requests": () => respostaJson([trocaPendenteEmPassagens]) }));
    const { user, historico } = renderComTudo(<NotificationsMenu />, { user: compras, rota: "/scaling" });

    const sino = await screen.findByRole("button", { name: "Pendências (1)" });
    expect(sino).toHaveTextContent("1");
    await user.click(sino);
    // Com contagem, o nome do painel continua "Pendências" — o "· 1" fica fora do título referenciado.
    const painel = await screen.findByRole("dialog", { name: "Pendências" });
    const titulo = document.getElementById(painel.getAttribute("aria-labelledby")!);
    expect(titulo).toHaveTextContent(/^Pendências$/);
    expect(painel).toContainElement(titulo);
    expect(painel).toHaveTextContent("Pendências · 1");

    const item = await within(painel).findByRole("link", { name: /1 troca pendente em Passagens/ });
    expect(item).toHaveTextContent("Compras precisa confirmar a substituição");
    expect(item).toHaveTextContent("Passagens");
    expect(within(item).getByText("Novo")).toHaveClass("sr-only");
    expect(within(painel).getByRole("button", { name: "Marcar tudo como visto" })).toBeInTheDocument();
    expect(urlsChamadas(fetchMock)).toContain("/api/swap-requests");

    await user.click(item);
    expect(historico.at(-1)).toMatch(/^\/tickets\?t=\d+$/);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("'Marcar tudo como visto' apaga o ponto de novidade sem mudar a contagem", async () => {
    mockarFetch(roteador({ "/api/swap-requests": () => respostaJson([trocaPendenteEmPassagens]) }));
    const { user } = renderComTudo(<NotificationsMenu />, { user: compras });
    await screen.findByRole("button", { name: "Pendências (1)" });
    const painel = await abrirSino(user);
    await within(painel).findByRole("link", { name: /1 troca pendente/ });

    await user.click(within(painel).getByRole("button", { name: "Marcar tudo como visto" }));
    expect(within(painel).queryByText("Novo")).not.toBeInTheDocument();
    expect(within(painel).queryByRole("button", { name: "Marcar tudo como visto" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pendências (1)" })).toBeInTheDocument();
  });
});
