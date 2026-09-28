import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { criarWrapper } from "@/test/render";
import { mockarFetch, respostaJson } from "@/test/fixtures";
import { SWAP_REQUESTS_QUERY_KEY, useSwapRequests } from "./use-swap-requests";

const linhaCrua = {
  id: "swap-1",
  team_inclusion_id: "ti-1",
  requested_by: "u-9",
  requested_by_name: "Ana",
  current_collaborator_id: "c-1",
  new_collaborator_id: "c-2",
  current_collaborator_name: "Bruno",
  new_collaborator_name: "Carla",
  reason: "Substituição",
  status: "pendente",
  review_comment: null,
  reviewed_by: null,
  reviewed_by_name: null,
  reviewed_at: null,
  created_at: "2026-09-20T10:00:00.000Z",
  new_city: "Curitiba",
  swap_kind: "permuta",
  paired_inclusion_id: "ti-2",
  paired_new_city: "",
  inclusion_number: "12",
  event_name: "Maratona Rio",
  paired_inclusion_number: 13,
  paired_event_name: "Maratona Rio",
  paired_function_name: "Staff",
  inclusion_status: "passagem_comprada",
  inclusion_deleted_at: null,
};

describe("useSwapRequests", () => {
  it("normaliza a resposta snake_case da API em camelCase (números, nulos, vazio→null)", async () => {
    mockarFetch(() => respostaJson([linhaCrua]));
    const { Wrapper } = criarWrapper();
    const { result } = renderHook(() => useSwapRequests(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [s] = result.current.data!;
    expect(s).toMatchObject({
      id: "swap-1",
      teamInclusionId: "ti-1",
      requestedBy: "u-9",
      requestedByName: "Ana",
      currentCollaboratorName: "Bruno",
      newCollaboratorName: "Carla",
      status: "pendente",
      reviewedAt: null,
      createdAt: "2026-09-20T10:00:00.000Z",
      newCity: "Curitiba",
      swapKind: "permuta",
      pairedInclusionId: "ti-2",
      pairedNewCity: null,
      inclusionNumber: 12,
      pairedInclusionNumber: 13,
      inclusionStatus: "passagem_comprada",
      inclusionDeletedAt: null,
    });
    expect(Object.keys(s).some((k) => k.includes("_"))).toBe(false);
  });

  it("aceita camelCase também e preenche padrões (status pendente, swapKind substituicao)", async () => {
    mockarFetch(() => respostaJson([{ id: "s2", teamInclusionId: "ti-5", requestedBy: "u-1", reason: "x" }]));
    const { Wrapper } = criarWrapper();
    const { result } = renderHook(() => useSwapRequests(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data![0]).toMatchObject({ teamInclusionId: "ti-5", status: "pendente", swapKind: "substituicao", eventName: null });
  });

  it("dois consumidores compartilham a chave: uma requisição só e o mesmo cache", async () => {
    const fetchMock = mockarFetch(() => respostaJson([linhaCrua]));
    const { Wrapper, queryClient } = criarWrapper();
    const lista = renderHook(() => useSwapRequests(), { wrapper: Wrapper });
    const contagem = renderHook(() => useSwapRequests({ select: (swaps) => swaps.filter((s) => s.status === "pendente").length }), { wrapper: Wrapper });

    await waitFor(() => expect(lista.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(contagem.result.current.data).toBe(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(SWAP_REQUESTS_QUERY_KEY).toEqual(["/api/swap-requests"]);
    expect(queryClient.getQueryData(SWAP_REQUESTS_QUERY_KEY)).toEqual(lista.result.current.data);
  });

  it("chama a API com credenciais e resposta não-lista vira lista vazia", async () => {
    const fetchMock = mockarFetch(() => respostaJson({ message: "formato antigo" }));
    const { Wrapper } = criarWrapper();
    const { result } = renderHook(() => useSwapRequests(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/swap-requests");
    expect(init?.credentials).toBe("include");
  });

  it("erro HTTP vira ApiError com mensagem pt-BR (não lista vazia em silêncio)", async () => {
    mockarFetch(() => respostaJson({}, 500));
    const { Wrapper } = criarWrapper();
    const { result } = renderHook(() => useSwapRequests(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Erro no servidor");
    expect(result.current.data).toBeUndefined();
  });

  it("enabled=false não chama a API", async () => {
    const fetchMock = mockarFetch(() => respostaJson([]));
    const { Wrapper } = criarWrapper();
    const { result } = renderHook(() => useSwapRequests({ enabled: false }), { wrapper: Wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
  });
});
