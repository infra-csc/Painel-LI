/**
 * Aprovação de honorários (28/10, dono): um `?evento=` de evento que saiu da
 * fila (link antigo, sininho) escondia tudo sem aviso — totais zerados e lista
 * vazia. Agora a tela diz "Este evento não tem pedidos na fila" e "Ver todos"
 * tira o parâmetro.
 */
import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, usuarioFake } from "@/test/fixtures";
import AprovacaoDeHonorariosPage from "@/pages/aprovacao-de-honorarios";
import type { Honorario } from "./api";

const aprovador = usuarioFake({ id: "u-aprova", role: "production", name: "Quem Aprova" });

const pendente = (p: Partial<Honorario> = {}): Honorario => ({
  id: "a1", eventId: "ev1", tipo: "vaga", teamInclusionId: "v1", functionId: "f1", collaboratorId: "c1", nome: "Pessoa Um",
  pessoas: null, descricao: null, setor: "montagem", posicao: "freela_local", inicio: "2099-10-10", fim: "2099-10-12", diarias: 3,
  valorPedido: 120_000, valorAprovado: null, observacao: null, status: "aguardando", versao: 2, criadoPor: "u-pede", criadoPorNome: "Quem Pede",
  enviadoPor: "u-pede", enviadoPorNome: "Quem Pede", enviadoEm: new Date().toISOString(), decididoPor: null, decididoPorNome: null, decididoEm: null, motivoDecisao: null,
  createdAt: "2099-10-01T10:00:00Z", updatedAt: "2099-10-01T10:00:00Z", liberado: 0, falta: 0, eventName: "Night Run Teste",
  eventStartDate: "2099-10-11", eventEndDate: "2099-10-12", inclusionNumber: 101, functionName: "Cenotécnica", vagaStatus: "escalado",
  vagaExcluida: false, avisoDaVaga: null, colaboradorAtualId: "c1", colaboradorAtual: "Pessoa Um", eventoExcluido: false,
  tipoFreela: "outro", semColaborador: false, vagasDaEmpreita: [], avisosDaEmpreita: [],
  podeEditar: false, podeRemover: false, podeDecidir: true, podeDevolver: true, podeLiberar: false, eAprovador: true,
  ...p,
} as Honorario);

function servidor() {
  mockarFetch((url) => {
    const caminho = url.split("?")[0];
    if (caminho === "/api/honorarios-ceno/acesso") return respostaJson({ podePedir: false, podeAprovar: true, podeLiberar: false, admin: false });
    if (caminho === "/api/honorarios-ceno/aprovacao") return respostaJson(url.includes("decididos") ? [] : [pendente()]);
    return respostaJson([]);
  });
}

describe("Aprovação de honorários — ?evento= de evento fora da fila (28/10)", () => {
  it("avisa que o evento não tem pedidos e “Ver todos” limpa o parâmetro", async () => {
    servidor();
    const { user, historico } = renderComTudo(<AprovacaoDeHonorariosPage />, { user: aprovador, rota: "/aprovacao-de-honorarios?evento=ev-saiu" });
    const aviso = await screen.findByTestId("hon-apr-evento-fora");
    expect(aviso).toHaveTextContent("Este evento não tem pedidos na fila");
    await user.click(screen.getByRole("button", { name: "Ver todos" }));
    await waitFor(() => expect(historico[historico.length - 1]).toBe("/aprovacao-de-honorarios"));
    expect(screen.queryByTestId("hon-apr-evento-fora")).not.toBeInTheDocument();
    expect(await screen.findByTestId("hon-apr-total-evento")).toHaveTextContent("R$ 1.200,00");
  });

  it("evento que está na fila: nada de aviso", async () => {
    servidor();
    renderComTudo(<AprovacaoDeHonorariosPage />, { user: aprovador, rota: "/aprovacao-de-honorarios?evento=ev1" });
    expect(await screen.findByTestId("hon-apr-total-evento")).toHaveTextContent("R$ 1.200,00");
    expect(screen.queryByTestId("hon-apr-evento-fora")).not.toBeInTheDocument();
  });
});
