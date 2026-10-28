// Contestação do colaborador → DP (28/10, Fase 3): selo aberta/respondida,
// resposta obrigatória e o POST da resposta.
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { DialogoDaContestacao, SeloDaContestacao, type ContestacaoParaTela } from "./contestacao";

const aberta: ContestacaoParaTela = { texto: "Faltou a hora extra de sábado.", em: "2026-11-05T15:00:00Z", respondida: false, resposta: null, respondidaEm: null, respondidaPorNome: null };

afterEach(() => vi.restoreAllMocks());

describe("SeloDaContestacao", () => {
  it("aberta (pendência) × respondida; clicável só com onClick", () => {
    const onClick = vi.fn();
    const { rerender } = renderComTudo(<SeloDaContestacao c={aberta} onClick={onClick} />);
    fireEvent.click(screen.getByTestId("contestacao-selo"));
    expect(onClick).toHaveBeenCalled();
    expect(screen.getByText("Contestação do colaborador")).toBeInTheDocument();
    rerender(<SeloDaContestacao c={{ ...aberta, respondida: true, resposta: "Ok", respondidaPorNome: "Patrícia" }} />);
    expect(screen.getByText("Contestação respondida")).toBeInTheDocument();
    expect(screen.queryByTestId("contestacao-selo")).toBeNull();
  });
});

describe("DialogoDaContestacao", () => {
  it("exige a resposta e envia ao servidor", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ contestacao: { ...aberta, respondida: true, resposta: "Entra na próxima OC." } }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const onClose = vi.fn();
    renderComTudo(<DialogoDaContestacao alvo={{ actualId: "act-1", nome: "Ana Souza", contestacao: aberta }} onClose={onClose} podeResponder />);
    expect(screen.getByText("“Faltou a hora extra de sábado.”")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("contestacao-responder"));
    expect(screen.getByText(/pelo menos 3 caracteres/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId("contestacao-resposta"), { target: { value: "Entra na próxima OC." } });
    fireEvent.click(screen.getByTestId("contestacao-responder"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/presenca/act-1/contestacao/resposta");
    expect(JSON.parse(String(init.body))).toEqual({ resposta: "Entra na próxima OC." });
  });

  it("quem não é DP só lê", () => {
    renderComTudo(<DialogoDaContestacao alvo={{ actualId: "act-1", nome: "Ana Souza", contestacao: aberta }} onClose={vi.fn()} podeResponder={false} />);
    expect(screen.queryByTestId("contestacao-responder")).toBeNull();
    expect(screen.getByText("Aguardando a resposta do DP.")).toBeInTheDocument();
  });
});
