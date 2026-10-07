/**
 * Funções (07/10, redesenho) — a tela inteira com a API simulada.
 *
 * O que se garante: cada lista de pessoas diz o que o papel permite (regra do
 * dono, 07/10 — responsáveis também pedem ajuste), os nomes dos responsáveis
 * à vista, o recorte "Sem responsável", o adicionar com o efeito antes de
 * confirmar (mesma rota de sempre), a exclusão dizendo QUAL função, a leitura
 * para quem não cadastra e a aba da Escala com validador/aprovador e o
 * aprovador padrão.
 */
import { describe, it, expect } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, usuarioFake, type RoteadorDeFetch } from "@/test/fixtures";
import { criarQueryClientComApi } from "@/test/query-client-api";
import { funcaoFake } from "@/test/fixtures-dominio";
import Functions from "@/pages/functions";

const admin = usuarioFake({ id: "admin-1", role: "admin", name: "Helena Martins", email: "helena@exemplo.com.br" });
const rh = usuarioFake({ id: "rh-1", role: "financial", name: "Patrícia Lemos" });
const bruno = usuarioFake({ id: "u-bruno", role: "function_area", name: "Bruno Cardoso", email: "bruno@exemplo.com.br" });
const camila = usuarioFake({ id: "u-camila", role: "purchasing", name: "Camila Duarte", email: "camila@exemplo.com.br" });
const marcos = usuarioFake({ id: "u-marcos", role: "production", name: "Marcos Vieira", email: "marcos@exemplo.com.br" });

const atendimento = { ...funcaoFake({ id: "f-atend", name: "Atendimento", costCenter: "LI" }), managers: [{ userId: "u-bruno", userName: "Bruno Cardoso" }] };
const kit = { ...funcaoFake({ id: "f-kit", name: "kit", costCenter: null }), managers: [] };
const sistema = { ...funcaoFake({ id: "f-sis", name: "Interna", responsibleArea: "__system__" }), managers: [] };

function api(chamadas: { metodo: string; url: string; corpo?: unknown }[]): RoteadorDeFetch {
  return (url, init) => {
    const metodo = init?.method ?? "GET";
    if (metodo !== "GET") {
      chamadas.push({ metodo, url, corpo: init?.body ? JSON.parse(String(init.body)) : undefined });
      return respostaJson({ success: true });
    }
    switch (url.split("?")[0]) {
      case "/api/functions": return respostaJson([atendimento, kit, sistema]);
      case "/api/users": return respostaJson([admin, bruno, camila, marcos]);
      case "/api/scaling-function-managers": return respostaJson([
        { functionId: "f-atend", userId: "u-bruno", role: "validador" },
        { functionId: "f-atend", userId: "u-marcos", role: "aprovador" },
      ]);
      case "/api/scaling-default-approver": return respostaJson({ userId: "u-marcos", userName: "Marcos Vieira" });
      default: return respostaJson([]);
    }
  };
}

const montar = (user = admin, rota = "/functions") => {
  const chamadas: { metodo: string; url: string; corpo?: unknown }[] = [];
  mockarFetch(api(chamadas));
  const utils = renderComTudo(<Functions />, { user, queryClient: criarQueryClientComApi(), rota });
  return { ...utils, chamadas };
};

describe("Funções — catálogo", () => {
  it("mostra os nomes dos responsáveis e diz, junto da lista, o que eles podem fazer", async () => {
    montar();
    expect(await screen.findByRole("button", { name: "Ver o responsável por Atendimento" })).toHaveTextContent("Bruno Cardoso");
    const faixa = screen.getByTestId("faixa-responsaveis");
    expect(faixa).toHaveTextContent("Responsáveis: editam as vagas desta função na Escalação, pedem troca e pedem ajuste em vaga já escalada.");
    // Função interna do sistema não entra; nome só com a 1ª letra em maiúscula.
    expect(screen.queryByText("Interna")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar função Kit" })).toBeInTheDocument();
    expect(screen.getByTestId("sem-responsavel-f-kit")).toHaveTextContent("Nenhum responsável");
    expect(screen.getByTestId("resumo-funcoes")).toHaveTextContent("2 funções · 1 sem responsável");
  });

  it("recorte 'Sem responsável' deixa só as funções sem ninguém", async () => {
    const { user } = montar();
    await screen.findByTestId("sem-responsavel-f-kit");
    await user.click(screen.getByTestId("recorte-funcoes-sem"));
    expect(screen.queryByRole("button", { name: /Atendimento/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("contagem-funcoes")).toHaveTextContent("1 de 2 funções");
  });

  it("adicionar: o diálogo diz o efeito, busca a pessoa e usa a mesma rota de sempre", async () => {
    const { user, chamadas } = montar();
    await user.click(await screen.findByTestId("button-add-function-manager-f-kit"));
    const dialogo = await screen.findByRole("dialog", { name: "Adicionar responsável" });
    expect(within(dialogo).getByTestId("efeito-responsavel")).toHaveTextContent("pedem ajuste em vaga já escalada");
    const adicionar = within(dialogo).getByTestId("button-submit-add-manager-f-kit");
    expect(adicionar).toBeDisabled();
    await user.click(await within(dialogo).findByText("Camila Duarte"));
    await user.click(adicionar);
    await waitFor(() => expect(chamadas).toContainEqual({ metodo: "POST", url: "/api/functions/f-kit/managers", corpo: { userId: "u-camila" } }));
  });

  it("excluir mostra qual função antes de confirmar", async () => {
    const { user, chamadas } = montar();
    await user.click(await screen.findByTestId("button-delete-function-f-atend"));
    const dialogo = await screen.findByTestId("dialog-excluir-funcao");
    expect(dialogo).toHaveTextContent("Atendimento");
    expect(dialogo).toHaveTextContent("Conta LI · 1 responsável");
    await user.click(within(dialogo).getByRole("button", { name: "Excluir função" }));
    await waitFor(() => expect(chamadas).toContainEqual({ metodo: "DELETE", url: "/api/functions/f-atend", corpo: undefined }));
  });

  it("quem não cadastra (RH) vê a lista e os papéis, sem criar, editar nem adicionar", async () => {
    montar(rh);
    expect(await screen.findByText("Atendimento")).toBeInTheDocument();
    expect(screen.getByTestId("faixa-responsaveis")).toBeInTheDocument();
    expect(screen.queryByTestId("button-add-function")).not.toBeInTheDocument();
    expect(screen.queryByTestId("button-add-function-manager-f-kit")).not.toBeInTheDocument();
    expect(screen.queryByTestId("button-edit-function-f-atend")).not.toBeInTheDocument();
    // A aba da Escala é só do admin.
    expect(screen.queryByTestId("tab-validacao-escala")).not.toBeInTheDocument();
  });
});

describe("Funções — aba Validação de Escala", () => {
  it("diz o que validador e aprovador fazem, quem é o padrão, e aponta função sem validador", async () => {
    montar(admin, "/functions?aba=escala");
    const faixa = await screen.findByTestId("faixa-validacao");
    expect(faixa).toHaveTextContent("Validador: valida a escala sugerida da função e pede ajuste.");
    expect(faixa).toHaveTextContent("Aprovador: decide os pedidos e as vagas validadas da função.");
    expect(within(faixa).getByTestId("nota-aprovador-padrao")).toHaveTextContent("Sem aprovador próprio, decide Marcos Vieira (padrão).");
    expect(await screen.findByTestId("aprovador-padrao-f-kit")).toHaveTextContent("Marcos Vieira");
    expect(screen.getAllByText("Nenhum validador")).toHaveLength(1);
    // "Aplicar a várias funções" fica recolhido até ser pedido.
    expect(screen.queryByTestId("bulk-apply-button")).not.toBeInTheDocument();
  });
});
