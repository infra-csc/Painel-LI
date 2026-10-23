/**
 * Perfil "Honorários (liberação)" (23/10) na casca: o menu só com a tela dele,
 * a tela inicial, "Sem acesso a esta tela" nas outras URLs, a paleta ⌘K sem
 * outras telas nem eventos e a casca sem consultar o resto da API.
 */
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, urlsChamadas, usuarioFake } from "@/test/fixtures";
import { SidebarProvider } from "@/contexts/sidebar-context";
import { getRolePermissions, getRoleLabel, hasPermission } from "@/lib/role-utils";
import { visibleGroups, visibleTabs } from "./nav-items";
import Sidebar from "./sidebar";
import ProtectedRoute from "./protected-route";
import CommandPalette from "./command-palette";

const honorarios = usuarioFake({ id: "u-hon", role: "honorarios", name: "Romilson Teste", email: "romilson@exemplo.com.br" });
const roteador = (url: string) => {
  const caminho = url.split("?")[0];
  if (caminho === "/api/honorarios-ceno/acesso") return respostaJson({ podePedir: false, podeAprovar: false, podeLiberar: true, admin: false });
  if (caminho === "/api/honorarios-ceno/pendencias") return respostaJson({ aguardandoMinhaAprovacao: 0, aguardandoPodeDecidir: 0, devolvidosParaMim: 0, aLiberar: 2 });
  return respostaJson({ message: "Seu acesso é só à tela Honorários da cenotécnica." }, 403);
};

describe("Perfil Honorários — permissões do client", () => {
  it("só a tela Honorários da cenotécnica; RH e admin continuam abrindo", () => {
    const p = getRolePermissions("honorarios");
    const ligadas = Object.entries(p).filter(([, v]) => v).map(([k]) => k);
    expect(ligadas).toEqual(["canAccessHonorariosCeno"]);
    expect(visibleTabs(honorarios).map((t) => t.path)).toEqual(["/honorarios-ceno"]);
    expect(visibleGroups(honorarios).map((g) => [g.group.title, g.items.map((i) => i.label)])).toEqual([["Financeiro", ["Honorários da cenotécnica"]]]);
    expect(hasPermission(usuarioFake({ role: "financial" }), "canAccessHonorariosCeno")).toBe(true);
    expect(hasPermission(usuarioFake({ role: "admin" }), "canAccessHonorariosCeno")).toBe(true);
    expect(hasPermission(usuarioFake({ role: "production" }), "canAccessHonorariosCeno")).toBe(false);
    expect(getRoleLabel("honorarios")).toBe("Honorários (liberação)");
  });
});

describe("Perfil Honorários — menu", () => {
  it("o menu mostra só “Honorários da cenotécnica”, com o contador do a liberar, e a casca não consulta o resto", async () => {
    const fetchMock = mockarFetch(roteador);
    renderComTudo(<SidebarProvider><Sidebar /></SidebarProvider>, { user: honorarios, rota: "/honorarios-ceno" });
    const menu = screen.getByRole("complementary", { name: "Menu principal" });
    const links = within(menu).getAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("/") && a.getAttribute("href") !== "/");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/honorarios-ceno"]);
    expect(within(menu).getByText("Honorários da cenotécnica")).toBeInTheDocument();
    expect(within(menu).queryByText("Escalação")).not.toBeInTheDocument();
    expect(within(menu).queryByText("Planejado")).not.toBeInTheDocument();
    await waitFor(() => expect(within(menu).getByText("2")).toBeInTheDocument());
    const urls = urlsChamadas(fetchMock).map((u) => u.split("?")[0]);
    expect(urls.every((u) => u.startsWith("/api/honorarios-ceno/"))).toBe(true);
    expect(urls).not.toContain("/api/swap-requests");
  });
});

describe("Perfil Honorários — URL de outra tela", () => {
  it("mostra “Sem acesso a esta tela” com o botão para a tela dele (não abre a outra)", async () => {
    mockarFetch(roteador);
    renderComTudo(
      <ProtectedRoute permission="canAccessScreen2"><div>Conteúdo da Escalação</div></ProtectedRoute>,
      { user: honorarios, rota: "/scaling" },
    );
    expect(await screen.findByTestId("sem-acesso-a-tela")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sem acesso a esta tela" })).toBeInTheDocument();
    expect(screen.getByText("Honorários da cenotécnica", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ir para Honorários da cenotécnica/ })).toHaveAttribute("href", "/honorarios-ceno");
    expect(screen.getByText("Honorários (liberação)")).toBeInTheDocument();
    expect(screen.queryByText("Conteúdo da Escalação")).not.toBeInTheDocument();
  });

  it("a tela dele abre normalmente; os outros papéis seguem sendo redirecionados como antes", async () => {
    mockarFetch(roteador);
    renderComTudo(<ProtectedRoute permission="canAccessHonorariosCeno"><div>Tela dos honorários</div></ProtectedRoute>, { user: honorarios, rota: "/honorarios-ceno" });
    expect(screen.getByText("Tela dos honorários")).toBeInTheDocument();
  });

  it("papel de operação sem a permissão: redireciona (sem a tela de sem acesso)", () => {
    mockarFetch(roteador);
    const { historico } = renderComTudo(<ProtectedRoute permission="canAccessAdminUsers"><div>Usuários</div></ProtectedRoute>, { user: usuarioFake({ role: "function_area" }), rota: "/admin-users" });
    expect(screen.queryByTestId("sem-acesso-a-tela")).not.toBeInTheDocument();
    expect(historico.at(-1)).toBe("/");
  });
});

describe("Perfil Honorários — busca ⌘K", () => {
  it("só oferece a tela dele e nenhum evento", async () => {
    const fetchMock = mockarFetch(roteador);
    renderComTudo(<CommandPalette open onOpenChange={() => {}} />, { user: honorarios, rota: "/honorarios-ceno" });
    const dialogo = await screen.findByRole("dialog");
    const opcoes = within(dialogo).getAllByRole("option");
    expect(opcoes.map((o) => o.textContent)).toEqual([expect.stringContaining("Honorários da cenotécnica")]);
    expect(within(dialogo).getByPlaceholderText("Buscar tela…")).toBeInTheDocument();
    expect(urlsChamadas(fetchMock)).not.toContain("/api/events");
  });
});
