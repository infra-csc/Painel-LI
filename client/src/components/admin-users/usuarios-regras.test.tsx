/**
 * Usuários (08/10, correções de lógica) — a tela inteira com a API simulada.
 *
 * O que se garante: a edição manda SÓ o que mudou (RH/Compras salvam o nome
 * de terceiros; o admin salva o próprio nome); o que o servidor recusa fica
 * travado com o motivo (e-mail de terceiros para RH, "Editar" de terceiros
 * para Logística Interna, a própria conta, a senha de outro admin); promover
 * a Administrador confirma antes; o reset exige 8 caracteres e só limpa no
 * sucesso; cada conta conta numa situação só.
 */
import { describe, it, expect } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderComTudo, esperarToast } from "@/test/render";
import { mockarFetch, respostaJson, usuarioFake } from "@/test/fixtures";
import { criarQueryClientComApi } from "@/test/query-client-api";
import type { User } from "@shared/schema";
import AdminUsers from "@/pages/admin-users";
import { situacaoDaConta } from "./acesso";

const admin = usuarioFake({ id: "admin-1", role: "admin", name: "Helena Martins", email: "helena@exemplo.com.br" });
const outroAdmin = usuarioFake({ id: "admin-2", role: "admin", name: "Otávio Prado" });
const rh = usuarioFake({ id: "rh-1", role: "financial", name: "Patrícia Lemos" });
const logistica = usuarioFake({ id: "log-1", role: "production", name: "Lucas Moreira" });
const operador = usuarioFake({ id: "op-1", role: "function_area", name: "Bruno Cardoso", email: "bruno@exemplo.com.br", area: "Comercial" });
const pendenteDesativada = usuarioFake({ id: "pd-1", role: "production", name: "Paula Souza", status: "pending", isActive: false });
const TODOS = [admin, outroAdmin, rh, logistica, operador, pendenteDesativada];

interface Chamada { metodo: string; url: string; corpo: unknown }

function montar(eu: User, respostas: { patch?: () => Response; reset?: () => Response } = {}) {
  const chamadas: Chamada[] = [];
  mockarFetch((url, init) => {
    const metodo = init?.method ?? "GET";
    if (metodo !== "GET") {
      chamadas.push({ metodo, url, corpo: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.includes("reset-password")) return (respostas.reset ?? (() => respostaJson({ message: "Senha resetada com sucesso" })))();
      return (respostas.patch ?? (() => respostaJson(operador)))();
    }
    if (url.startsWith("/api/users")) return respostaJson(TODOS);
    return respostaJson([]);
  });
  const utils = renderComTudo(<AdminUsers />, { user: eu, queryClient: criarQueryClientComApi(), rota: "/admin-users" });
  return { ...utils, chamadas };
}

/**
 * A lista mede a largura útil depois de montar (no jsdom, 0 → cartões): o botão
 * achado antes da troca tabela→cartão sai do documento. Espera os cartões.
 */
async function achar(testid: string) {
  await screen.findByTestId("usr-cartoes");
  return screen.getByTestId(testid);
}

async function trocarNome(user: ReturnType<typeof montar>["user"], novo: string) {
  const campo = screen.getByTestId("input-edit-name");
  await user.clear(campo);
  await user.type(campo, novo);
}

describe("Usuários — editar", () => {
  it("RH edita o nome de outra pessoa: PATCH só com o nome; e-mail travado com o motivo", async () => {
    const { user, chamadas } = montar(rh);
    await user.click(await achar("button-edit-op-1"));
    const modal = await screen.findByTestId("modal-user-edit");
    expect(within(modal).getByTestId("input-edit-email")).toBeDisabled();
    expect(within(modal).getByTestId("usr-edit-email-ajuda")).toHaveTextContent("só administradores alteram o de outra pessoa");
    expect(within(modal).getByTestId("usr-edit-aviso")).toHaveTextContent("Você pode editar o nome.");

    await trocarNome(user, "Bruno Cardoso Filho");
    await user.click(screen.getByTestId("button-save-edit-user"));
    await waitFor(() => expect(chamadas).toHaveLength(1));
    expect(chamadas[0]).toEqual({ metodo: "PATCH", url: "/api/users/op-1", corpo: { name: "Bruno Cardoso Filho" } });
    await esperarToast("Usuário atualizado");
  });

  it("o admin edita o próprio nome: vai só o nome (sem o perfil, que o servidor recusa)", async () => {
    const { user, chamadas } = montar(admin);
    await user.click(await achar("button-edit-admin-1"));
    await screen.findByTestId("modal-user-edit");
    expect(screen.getByTestId("select-edit-role")).toBeDisabled();
    expect(screen.getByTestId("usr-edit-aviso")).toHaveTextContent("Ninguém altera o próprio perfil");

    await trocarNome(user, "Helena Martins Prado");
    await user.click(screen.getByTestId("button-save-edit-user"));
    await waitFor(() => expect(chamadas).toHaveLength(1));
    expect(chamadas[0].corpo).toEqual({ name: "Helena Martins Prado" });
  });

  it("Logística Interna: Editar de outra pessoa desabilitado com o motivo; o próprio, habilitado", async () => {
    montar(logistica);
    expect(await achar("button-edit-op-1")).toBeDisabled();
    expect(screen.getByTestId("button-edit-log-1")).toBeEnabled();
    expect(screen.getAllByText("Só administradores, RH e Compras editam outras pessoas.").length).toBeGreaterThan(0);
  });

  it("promover a Administrador confirma ANTES do PATCH", async () => {
    const { user, chamadas } = montar(admin);
    await user.click(await achar("button-edit-op-1"));
    await screen.findByTestId("modal-user-edit");
    await user.click(screen.getByTestId("select-edit-role"));
    await user.click(await screen.findByRole("option", { name: "Administrador" }));
    await user.click(screen.getByTestId("button-save-edit-user"));

    const confirma = await screen.findByTestId("usr-confirma-admin");
    expect(confirma).toHaveTextContent("Tornar Bruno Cardoso administrador?");
    expect(chamadas).toHaveLength(0);

    await user.click(screen.getByTestId("button-confirm-make-admin"));
    await waitFor(() => expect(chamadas).toHaveLength(1));
    expect(chamadas[0]).toEqual({ metodo: "PATCH", url: "/api/users/op-1", corpo: { role: "admin" } });
  });
});

describe("Usuários — ações de conta", () => {
  it("a própria conta não se desativa; a senha de outro admin fica travada", async () => {
    montar(admin);
    expect(await achar("button-toggle-active-admin-1")).toBeDisabled();
    expect(screen.getByTestId("button-toggle-active-op-1")).toBeEnabled();
    expect(screen.getAllByText("Você não pode desativar a própria conta.").length).toBeGreaterThan(0);

    expect(screen.getByTestId("button-reset-pwd-admin-2")).toBeDisabled();
    expect(screen.getByTestId("button-reset-pwd-admin-1")).toBeEnabled();
    expect(screen.getByTestId("button-reset-pwd-op-1")).toBeEnabled();
    expect(screen.getAllByText("A senha de outro administrador não pode ser redefinida por aqui.").length).toBeGreaterThan(0);
  });

  it("redefinir senha: mínimo 8; erro do servidor mantém o que foi digitado; sucesso fecha", async () => {
    let falhar = true;
    const { user, chamadas } = montar(admin, {
      reset: () => (falhar ? respostaJson({ message: "Falha temporária" }, 500) : respostaJson({ message: "ok" })),
    });
    await user.click(await achar("button-reset-pwd-op-1"));
    await screen.findByTestId("modal-reset-password");

    await user.type(screen.getByTestId("input-new-password"), "Abc1234");
    await user.type(screen.getByTestId("input-confirm-password"), "Abc1234");
    expect(screen.getByTestId("button-confirm-reset-password")).toBeDisabled();
    expect(screen.getByTestId("usr-senha-curta")).toHaveTextContent("falta 1");

    await user.type(screen.getByTestId("input-new-password"), "5");
    await user.type(screen.getByTestId("input-confirm-password"), "5");
    await user.click(screen.getByTestId("button-confirm-reset-password"));
    await waitFor(() => expect(chamadas).toHaveLength(1));
    expect(chamadas[0].corpo).toEqual({ newPassword: "Abc12345" });
    await esperarToast("Não foi possível redefinir a senha");
    expect(screen.getByTestId("input-new-password")).toHaveValue("Abc12345");
    expect(screen.getByTestId("input-confirm-password")).toHaveValue("Abc12345");

    falhar = false;
    await user.click(screen.getByTestId("button-confirm-reset-password"));
    await waitFor(() => expect(screen.queryByTestId("modal-reset-password")).not.toBeInTheDocument());
  });
});

describe("Usuários — situação da conta", () => {
  it("cada conta numa situação só: pendente E desativada fica em Sem acesso", async () => {
    expect(situacaoDaConta({ status: "pending", isActive: false })).toBe("inactive");
    expect(situacaoDaConta({ status: "pending", isActive: true })).toBe("pending");
    expect(situacaoDaConta({ status: "rejected", isActive: true })).toBe("inactive");
    expect(situacaoDaConta({ status: "approved", isActive: false })).toBe("inactive");
    expect(situacaoDaConta({ status: "approved", isActive: true })).toBe("approved");

    montar(admin);
    const resumo = await screen.findByTestId("usr-resumo");
    expect(resumo).toHaveTextContent("6 contas · 1 sem acesso");
    expect(resumo).not.toHaveTextContent("aguardando");
  });
});
