import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { ApiError } from "@/lib/queryClient";
import { EmptyState } from "./empty-state";
import { QueryState, type QueryLike } from "./query-state";

function consulta(parcial: Partial<QueryLike> = {}): QueryLike {
  return { isLoading: false, isError: false, error: undefined, refetch: vi.fn(), ...parcial };
}

describe("QueryState", () => {
  it("carregando mostra o LoadingState (role=status) e não o conteúdo", () => {
    renderComTudo(
      <QueryState query={consulta({ isLoading: true })} loadingCount={3}>
        <p>Conteúdo</p>
      </QueryState>,
    );
    expect(screen.getByRole("status", { name: "Carregando…" })).toBeInTheDocument();
    expect(screen.queryByText("Conteúdo")).not.toBeInTheDocument();
  });

  it("aceita um `loading` customizado", () => {
    renderComTudo(
      <QueryState query={consulta({ isLoading: true })} loading={<p>Buscando eventos…</p>}>
        <p>Conteúdo</p>
      </QueryState>,
    );
    expect(screen.getByText("Buscando eventos…")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("erro mostra a mensagem real do servidor num role=alert e 'Tentar de novo' refaz SÓ o que falhou", async () => {
    const falhou = consulta({ isError: true, error: new ApiError(500, { message: "Banco de dados indisponível" }) });
    const ok = consulta();
    const { user } = renderComTudo(
      <QueryState queries={[ok, falhou]} errorTitle="Não deu para carregar os eventos">
        <p>Conteúdo</p>
      </QueryState>,
    );
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent("Não deu para carregar os eventos");
    expect(alerta).toHaveTextContent("Banco de dados indisponível");
    expect(screen.queryByText("Conteúdo")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(falhou.refetch).toHaveBeenCalledTimes(1);
    expect(ok.refetch).not.toHaveBeenCalled();
  });

  it("erro sem mensagem do servidor usa o título e o texto pt-BR padrão", () => {
    renderComTudo(<QueryState query={consulta({ isError: true, error: new ApiError(500) })} />);
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent("Não foi possível carregar os dados");
    expect(alerta).toHaveTextContent("Verifique sua conexão e tente de novo. Nada do que você fez foi perdido.");
    expect(alerta).not.toHaveTextContent(/\d{3}:/);
  });

  it("falha de rede (status 0) vira a mensagem de conexão", () => {
    renderComTudo(<QueryState query={consulta({ isError: true, error: new ApiError(0) })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Sem conexão com o servidor");
  });

  it("erro tem prioridade sobre carregando (refetch depois de falha não esconde o aviso)", () => {
    renderComTudo(
      <QueryState query={consulta({ isLoading: true, isError: true, error: new ApiError(503) })}>
        <p>Conteúdo</p>
      </QueryState>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("vazio mostra o EmptyState no lugar do conteúdo", () => {
    renderComTudo(
      <QueryState query={consulta()} isEmpty empty={<EmptyState title="Nenhum evento" description="Crie o primeiro." />}>
        <p>Conteúdo</p>
      </QueryState>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Nenhum evento");
    expect(screen.queryByText("Conteúdo")).not.toBeInTheDocument();
  });

  it("sucesso renderiza children (nó ou função)", () => {
    const { rerender } = renderComTudo(
      <QueryState query={consulta()}>
        <p>Conteúdo</p>
      </QueryState>,
    );
    expect(screen.getByText("Conteúdo")).toBeInTheDocument();
    rerender(<QueryState query={consulta()}>{() => <p>Conteúdo por função</p>}</QueryState>);
    expect(screen.getByText("Conteúdo por função")).toBeInTheDocument();
  });

  it("sem consulta nenhuma renderiza o conteúdo direto", () => {
    renderComTudo(<QueryState><p>Conteúdo</p></QueryState>);
    expect(screen.getByText("Conteúdo")).toBeInTheDocument();
  });
});
