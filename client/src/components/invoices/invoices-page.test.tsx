// Tela Notas fiscais (08/10): o "×" que limpa o evento da barra funcionava só
// por um instante — o efeito que escolhe o primeiro evento ativo escolhia de
// novo na mesma hora. Agora, limpo pela pessoa, fica limpo.
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, usuarioFake } from "@/test/fixtures";
import { criarQueryClientComApi } from "@/test/query-client-api";
import { eventoFake } from "@/test/fixtures-dominio";
import InvoicesPage from "@/pages/invoices";

describe("InvoicesPage — limpar o evento", () => {
  it("o '×' da barra limpa o evento e a tela pede um evento (não volta sozinho para o primeiro)", async () => {
    const evento = eventoFake({ id: "ev-nf", name: "Meia de Brasília", paymentCompanyName: "CSC Esporte", paymentCompanyCnpj: "11.222.333/0001-81" });
    mockarFetch((url) => {
      if (url.includes("/api/events")) return respostaJson([evento]);
      return respostaJson([]);
    });
    const { user } = renderComTudo(<InvoicesPage />, {
      user: usuarioFake({ role: "financial" }),
      rota: "/invoices",
      queryClient: criarQueryClientComApi(),
    });

    // Abre no primeiro evento ativo (comportamento de sempre).
    expect(await screen.findByRole("button", { name: "Limpar evento selecionado" }, { timeout: 5000 })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Limpar evento selecionado" }));

    expect(await screen.findByText("Selecione um evento")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Limpar evento selecionado" })).toBeNull();
  });
});
