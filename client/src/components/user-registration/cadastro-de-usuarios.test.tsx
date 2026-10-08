/**
 * Cadastro de usuários (08/10, redesenho) — a tela inteira com a API simulada.
 *
 * O que se garante: o mesmo POST /api/users com o mesmo payload; erros do
 * schema com as frases de sempre (inclusive o perfil, que chega ao zod como
 * null); e-mail repetido (409) no próprio campo; conta criada vira a faixa com
 * o nome e o formulário volta vazio; quem não é admin só vê os dois perfis que
 * o servidor aceita; a lista de telas do perfil é a do menu lateral.
 */
import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, usuarioFake } from "@/test/fixtures";
import { criarQueryClientComApi } from "@/test/query-client-api";
import { visibleTabs } from "@/components/layout/nav-items";
import type { User } from "@shared/schema";
import UserRegistration from "@/pages/user-registration";
import { PERFIS, telasDoPerfil } from "./perfis";

const admin = usuarioFake({ id: "admin-1", role: "admin", name: "Helena Martins" });
const rh = usuarioFake({ id: "rh-1", role: "financial", name: "Patrícia Lemos" });

function montar(user: User, respostaDoPost: () => Response = () => respostaJson({ id: "novo", name: "Joana Lima", email: "joana@empresa.com.br", role: "production" })) {
  const chamadas: { url: string; corpo: unknown }[] = [];
  mockarFetch((url, init) => {
    if ((init?.method ?? "GET") === "POST") {
      chamadas.push({ url, corpo: init?.body ? JSON.parse(String(init.body)) : undefined });
      return respostaDoPost();
    }
    return respostaJson([]);
  });
  const utils = renderComTudo(<UserRegistration />, { user, queryClient: criarQueryClientComApi(), rota: "/user-registration" });
  return { ...utils, chamadas };
}

describe("Cadastro de usuários", () => {
  it("cria com o mesmo payload de antes e mostra a conta criada", async () => {
    const { user, chamadas } = montar(admin);
    await user.type(screen.getByLabelText(/Nome completo/), "Joana Lima");
    await user.type(screen.getByLabelText(/E-mail corporativo/), "joana@empresa.com.br");
    await user.click(screen.getByRole("radio", { name: /Logística Interna/ }));
    await user.type(screen.getByLabelText("Área específica"), "Cenografia");
    expect(screen.getByTestId("cad-telas")).toHaveTextContent("O que Logística Interna vê no menu");
    await user.click(screen.getByTestId("button-submit"));

    await waitFor(() => expect(chamadas).toHaveLength(1));
    expect(chamadas[0]).toEqual({
      url: "/api/users",
      corpo: { name: "Joana Lima", email: "joana@empresa.com.br", role: "production", area: "Cenografia" },
    });
    expect(await screen.findByTestId("cad-concluido")).toHaveTextContent("Usuário criado: Joana Lima");
    expect(screen.getByLabelText(/Nome completo/)).toHaveValue("");
    expect(screen.getByRole("radio", { name: /Logística Interna/ })).not.toBeChecked();
  });

  it("vazio: as frases do schema, sem POST", async () => {
    const { user, chamadas } = montar(admin);
    await user.click(screen.getByTestId("button-submit"));
    expect(await screen.findByText("Nome deve ter pelo menos 2 caracteres")).toBeInTheDocument();
    expect(screen.getByText("Digite um e-mail válido")).toBeInTheDocument();
    expect(screen.getByText("Selecione um perfil de acesso")).toBeInTheDocument();
    expect(chamadas).toHaveLength(0);
  });

  it("e-mail repetido (409) vai para o campo de e-mail", async () => {
    const { user } = montar(admin, () => respostaJson({ message: "E-mail já cadastrado" }, 409));
    await user.type(screen.getByLabelText(/Nome completo/), "Joana Lima");
    await user.type(screen.getByLabelText(/E-mail corporativo/), "joana@empresa.com.br");
    await user.click(screen.getByRole("radio", { name: /Área de Função/ }));
    await user.click(screen.getByTestId("button-submit"));
    expect(await screen.findByText("Já existe um usuário com este e-mail.")).toBeInTheDocument();
    expect(screen.getByLabelText(/E-mail corporativo/)).toHaveAttribute("aria-invalid", "true");
  });

  it("outro erro do servidor fica no rodapé, ao lado do botão", async () => {
    const { user } = montar(admin, () => respostaJson({ message: "Erro interno ao criar" }, 500));
    await user.type(screen.getByLabelText(/Nome completo/), "Joana Lima");
    await user.type(screen.getByLabelText(/E-mail corporativo/), "joana@empresa.com.br");
    await user.click(screen.getByRole("radio", { name: /Logística Interna/ }));
    await user.click(screen.getByTestId("button-submit"));
    expect(await screen.findByTestId("cad-erro-servidor")).toHaveTextContent("Erro interno ao criar");
  });

  it("RH só vê os perfis que o servidor aceita dele", () => {
    montar(rh);
    const nomes = screen.getAllByRole("radio").map((r) => (r as HTMLInputElement).value);
    expect(nomes).toEqual(["production", "function_area"]);
    expect(screen.getByText(/só são cadastrados por um administrador/)).toBeInTheDocument();
  });

  it("as telas de cada perfil são as do menu lateral", () => {
    for (const p of PERFIS) {
      const doMenu = visibleTabs({ role: p.value } as User).map((t) => t.label);
      expect(telasDoPerfil(p.value).flatMap((g) => g.telas)).toEqual(doMenu);
    }
  });
});
