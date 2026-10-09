/**
 * Ver como usuário (08/10, redesenho) — a tela inteira com a API simulada.
 *
 * O que se garante: só aparecem contas ativas e aprovadas (e não você); o
 * filtro de perfil conta e filtra; escolher abre a confirmação com quem, o que
 * vai ver e como sair — e só ela dispara o MESMO POST /api/simulation/start;
 * a recusa do servidor fica dentro da confirmação; com simulação ativa nada
 * começa daqui.
 */
import { describe, it, expect } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, usuarioFake } from "@/test/fixtures";
import { criarQueryClientComApi } from "@/test/query-client-api";
import SimulationPage from "@/pages/simulation";

const admin = usuarioFake({ id: "admin-1", role: "admin", name: "Helena Martins", status: "approved", isActive: true });
const bruno = usuarioFake({ id: "u-bruno", role: "function_area", name: "Bruno Cardoso", email: "bruno@exemplo.com.br", status: "approved", isActive: true, area: "Comercial" });
const camila = usuarioFake({ id: "u-camila", role: "purchasing", name: "Camila Duarte", email: "camila@exemplo.com.br", status: "approved", isActive: true });
const inativo = usuarioFake({ id: "u-ina", role: "production", name: "Igor Inativo", status: "approved", isActive: false });
const pendente = usuarioFake({ id: "u-pen", role: "production", name: "Paula Pendente", status: "pending", isActive: true });

function montar(opcoes: { recusar?: boolean; simulando?: boolean } = {}) {
  const posts: { url: string; corpo: unknown }[] = [];
  mockarFetch((url, init) => {
    if ((init?.method ?? "GET") === "POST") {
      posts.push({ url, corpo: init?.body ? JSON.parse(String(init.body)) : undefined });
      return opcoes.recusar
        ? respostaJson({ message: "Só é possível simular usuários ativos e aprovados." }, 400)
        : respostaJson({ active: true });
    }
    if (url.startsWith("/api/users")) return respostaJson([admin, bruno, camila, inativo, pendente]);
    return respostaJson([]);
  });
  const utils = renderComTudo(<SimulationPage />, {
    user: admin,
    queryClient: criarQueryClientComApi(),
    rota: "/simulation",
    auth: opcoes.simulando ? { simulation: { active: true, realUserName: "Outra Admin", simulatedSince: null } } : undefined,
  });
  return { ...utils, posts };
}

describe("Ver como usuário", () => {
  it("lista só quem pode ser simulado e diz quem ficou de fora", async () => {
    montar();
    const lista = await screen.findByTestId("sim-lista");
    expect(within(lista).getByText("Bruno Cardoso")).toBeInTheDocument();
    expect(within(lista).getByText("Camila Duarte")).toBeInTheDocument();
    expect(within(lista).queryByText("Igor Inativo")).toBeNull();
    expect(within(lista).queryByText("Paula Pendente")).toBeNull();
    expect(within(lista).queryByText("Helena Martins")).toBeNull();
    expect(screen.getByTestId("sim-rodape")).toHaveTextContent("2 contas inativas, pendentes ou recusadas");
  });

  it("o perfil conta e filtra", async () => {
    const { user } = montar();
    await screen.findByTestId("sim-lista");
    expect(screen.getByTestId("sim-perfil-purchasing")).toHaveTextContent("1");
    await user.click(screen.getByTestId("sim-perfil-purchasing"));
    const lista = screen.getByTestId("sim-lista");
    expect(within(lista).queryByText("Bruno Cardoso")).toBeNull();
    expect(within(lista).getByText("Camila Duarte")).toBeInTheDocument();
  });

  it("escolher abre a confirmação; só confirmar faz o POST de sempre", async () => {
    const { user, posts } = montar({ recusar: true });
    await user.click(await screen.findByRole("button", { name: "Ver o sistema como Bruno Cardoso" }));
    const dialogo = await screen.findByTestId("sim-confirmar");
    expect(dialogo).toHaveTextContent("Ver o sistema como Bruno Cardoso?");
    expect(dialogo).toHaveTextContent("Sair da simulação");
    expect(dialogo).toHaveTextContent("Validação de escala");
    expect(posts).toHaveLength(0);

    await user.click(within(dialogo).getByTestId("sim-confirmar-entrar"));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({ url: "/api/simulation/start", corpo: { userId: "u-bruno" } });
    expect(await within(dialogo).findByTestId("sim-erro-iniciar")).toHaveTextContent("Só é possível simular usuários ativos e aprovados.");
  });

  it("com simulação ativa, avisa como sair e nada começa daqui", async () => {
    montar({ simulando: true });
    expect(await screen.findByTestId("sim-ja-simulando")).toHaveTextContent("Sair da simulação");
    expect(await screen.findByRole("button", { name: "Ver o sistema como Bruno Cardoso" })).toBeDisabled();
  });
});
