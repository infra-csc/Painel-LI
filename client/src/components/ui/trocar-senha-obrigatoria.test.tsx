import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, usuarioFake } from "@/test/fixtures";
import TrocarSenhaObrigatoria from "./trocar-senha-obrigatoria";

const usuario = usuarioFake({ id: "u-1", mustChangePassword: true });

function montar(precisaTrocarSenha = true) {
  return renderComTudo(<TrocarSenhaObrigatoria />, { user: usuario, auth: { precisaTrocarSenha } });
}

async function preencher(user: ReturnType<typeof montar>["user"], atual: string, nova: string, confirmacao: string) {
  if (atual) await user.type(screen.getByLabelText("Senha atual"), atual);
  if (nova) await user.type(screen.getByLabelText("Nova senha"), nova);
  if (confirmacao) await user.type(screen.getByLabelText("Confirmar nova senha"), confirmacao);
  await user.click(screen.getByRole("button", { name: "Salvar nova senha" }));
}

describe("TrocarSenhaObrigatoria", () => {
  it("não renderiza nada quando a senha não é provisória", () => {
    montar(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("abre um dialog com os três campos rotulados e foco na senha atual", () => {
    montar();
    expect(screen.getByRole("dialog", { name: "Troque sua senha para continuar" })).toBeInTheDocument();
    expect(screen.getByLabelText("Senha atual")).toHaveFocus();
    expect(screen.getByLabelText("Nova senha")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("Confirmar nova senha")).toHaveAttribute("autocomplete", "new-password");
  });

  it("não fecha com Esc", async () => {
    const { user } = montar();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  /** O erro está ligado ao campo: `aria-invalid`, descrito pelo alerta e com o foco. Os outros campos ficam limpos. */
  function esperarErroNoCampo(rotulo: string, mensagem: string) {
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent(mensagem);
    expect(alerta.id).not.toBe("");
    const campo = screen.getByLabelText(rotulo);
    expect(campo).toHaveAttribute("aria-invalid", "true");
    expect(campo).toHaveAttribute("aria-describedby", alerta.id);
    expect(campo).toHaveAccessibleDescription(mensagem);
    expect(campo).toHaveFocus();
    for (const outro of ["Senha atual", "Nova senha", "Confirmar nova senha"].filter((r) => r !== rotulo)) {
      expect(screen.getByLabelText(outro)).not.toHaveAttribute("aria-invalid");
      expect(screen.getByLabelText(outro)).not.toHaveAttribute("aria-describedby");
    }
  }

  it("exige a senha atual: marca o campo como inválido e o foca", async () => {
    const fetchMock = mockarFetch(() => respostaJson({}));
    const { user } = montar();
    await preencher(user, "", "novaSenha123", "novaSenha123");
    esperarErroNoCampo("Senha atual", "Informe a senha atual.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("valida o mínimo de 8 caracteres antes de enviar (erro na nova senha)", async () => {
    const fetchMock = mockarFetch(() => respostaJson({}));
    const { user } = montar();
    await preencher(user, "antiga1", "curta", "curta");
    esperarErroNoCampo("Nova senha", "A nova senha precisa ter pelo menos 8 caracteres.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("valida a confirmação e a igualdade com a senha atual, apontando o campo certo", async () => {
    const fetchMock = mockarFetch(() => respostaJson({}));
    const { user } = montar();
    await preencher(user, "antiga123", "novaSenha123", "outraCoisa1");
    esperarErroNoCampo("Confirmar nova senha", "A confirmação não coincide com a nova senha.");

    await user.clear(screen.getByLabelText("Nova senha"));
    await user.clear(screen.getByLabelText("Confirmar nova senha"));
    await preencher(user, "", "antiga123", "antiga123");
    esperarErroNoCampo("Nova senha", "A nova senha precisa ser diferente da atual.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("envia PATCH /api/users/:id com as senhas e chama senhaTrocada com o usuário devolvido", async () => {
    const atualizado = { ...usuario, mustChangePassword: false, createdAt: "2026-01-01T00:00:00.000Z" };
    const fetchMock = mockarFetch(() => respostaJson(atualizado));
    const { user, auth } = montar();
    await preencher(user, "antiga123", "novaSenha123", "novaSenha123");

    await waitFor(() => expect(auth.senhaTrocada).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/users/u-1");
    expect(init?.method).toBe("PATCH");
    expect(init?.credentials).toBe("include");
    expect(JSON.parse(String(init?.body))).toEqual({ currentPassword: "antiga123", newPassword: "novaSenha123" });
    expect(auth.senhaTrocada).toHaveBeenCalledWith(expect.objectContaining({ id: "u-1", mustChangePassword: false }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("mostra a mensagem do servidor quando o PATCH falha (400) e aponta a senha atual", async () => {
    mockarFetch(() => respostaJson({ message: "Senha atual incorreta" }, 400));
    const { user, auth } = montar();
    await preencher(user, "errada123", "novaSenha123", "novaSenha123");
    expect(await screen.findByRole("alert")).toHaveTextContent("Senha atual incorreta");
    expect(auth.senhaTrocada).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Salvar nova senha" })).toBeEnabled();
    await waitFor(() => expect(screen.getByLabelText("Senha atual")).toHaveFocus());
    esperarErroNoCampo("Senha atual", "Senha atual incorreta");
  });

  it("falha sem campo culpado (500): nenhum campo fica inválido, todos são descritos pelo erro e o foco volta à senha atual", async () => {
    mockarFetch(() => respostaJson({ message: "Erro interno" }, 500));
    const { user } = montar();
    await preencher(user, "antiga123", "novaSenha123", "novaSenha123");
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Erro interno");
    await waitFor(() => expect(screen.getByLabelText("Senha atual")).toHaveFocus());
    for (const rotulo of ["Senha atual", "Nova senha", "Confirmar nova senha"]) {
      expect(screen.getByLabelText(rotulo)).not.toHaveAttribute("aria-invalid");
      expect(screen.getByLabelText(rotulo)).toHaveAttribute("aria-describedby", alerta.id);
    }
  });

  it("'Sair da conta' chama logout", async () => {
    const { user, auth } = montar();
    await user.click(screen.getByRole("button", { name: "Sair da conta" }));
    expect(auth.logout).toHaveBeenCalledTimes(1);
  });
});
