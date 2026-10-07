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
    if (caminho === "/api/shell/aguardando-gestor" || caminho === "/api/shell/sem-passagem-30d") return respostaJson({ count: 0 });
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
    // 07/10: a contagem saiu do "· 1" em texto corrido para uma pílula ao lado do título.
    expect(within(painel).getByTestId("sino-contagem")).toHaveTextContent(/^1$/);

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

  it("alterações aprovadas para remarcar (07/10): uma entrada por tela, contada UMA vez, e leva a Passagens", async () => {
    const aviso = (id: string, afetaPassagem: boolean, afetaHospedagem: boolean) => ({
      id, teamInclusionId: `ti-${id}`, eventId: "ev-1", afetaPassagem, afetaHospedagem, mudancas: [],
      aprovadoPorNome: "Pedro", aprovadoEm: "2026-10-07T10:00:00.000Z", resolvidoEm: null,
    });
    const fetchMock = mockarFetch(roteador({
      "/api/avisos-de-alteracao": () => respostaJson([aviso("a", true, false), aviso("b", true, true), aviso("c", false, true)]),
    }));
    const { user, historico } = renderComTudo(<NotificationsMenu />, { user: compras, rota: "/scaling" });

    // a, b → Passagens (2); c → só hospedagem (1). O "b" não conta duas vezes.
    await user.click(await screen.findByRole("button", { name: "Pendências (3)" }));
    const painel = await screen.findByRole("dialog", { name: "Pendências" });
    const passagens = await within(painel).findByRole("link", { name: /2 alterações aprovadas para remarcar/ });
    expect(passagens).toHaveTextContent("Datas ou horários mudaram depois da passagem registrada");
    expect(within(painel).getByRole("link", { name: /1 alteração aprovada para remarcar na hospedagem/ })).toBeInTheDocument();
    expect(urlsChamadas(fetchMock)).toContain("/api/avisos-de-alteracao?situacao=pendente");

    await user.click(passagens);
    expect(historico.at(-1)).toMatch(/^\/tickets\?t=\d+$/);
  });

  it("alterações aprovadas: quem não é da logística nem consulta (sem número inventado)", async () => {
    const fetchMock = mockarFetch(roteador());
    const { user } = renderComTudo(<NotificationsMenu />, { user: usuarioFake({ role: "function_area" }) });
    const painel = await abrirSino(user);
    await within(painel).findByText("Nada pendente para você agora.");
    expect(urlsChamadas(fetchMock).some((u) => u.startsWith("/api/avisos-de-alteracao"))).toBe(false);
  });

  it("sem passagem a 30 dias (07/10): só o admin vê; entra no badge e leva à fila Comprar dos próximos 30 dias", async () => {
    const fetchMock = mockarFetch(roteador({ "/api/shell/sem-passagem-30d": () => respostaJson({ count: 4 }) }));
    const { user, historico } = renderComTudo(<NotificationsMenu />, { user: usuarioFake({ id: "admin-1", role: "admin" }), rota: "/scaling" });

    await user.click(await screen.findByRole("button", { name: "Pendências (4)" }));
    const painel = await screen.findByRole("dialog", { name: "Pendências" });
    const item = await within(painel).findByRole("link", { name: /4 escalações sem passagem a 30 dias/ });
    expect(item).toHaveTextContent("A ida é nos próximos 30 dias e a passagem ainda não foi registrada");
    expect(item).toHaveTextContent("Passagens");
    expect(urlsChamadas(fetchMock)).toContain("/api/shell/sem-passagem-30d");

    await user.click(item);
    expect(historico.at(-1)).toMatch(/^\/tickets\?status=pending&periodo=30&t=\d+$/);
  });

  it("sem passagem a 30 dias: Compras nem consulta (só admin)", async () => {
    const fetchMock = mockarFetch(roteador({ "/api/shell/sem-passagem-30d": () => respostaJson({ count: 4 }) }));
    const { user } = renderComTudo(<NotificationsMenu />, { user: compras });
    const painel = await abrirSino(user);
    await within(painel).findByText("Nada pendente para você agora.");
    expect(urlsChamadas(fetchMock).some((u) => u.startsWith("/api/shell/sem-passagem-30d"))).toBe(false);
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
