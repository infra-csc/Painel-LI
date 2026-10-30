/**
 * Escalação — "Limpar filtros" e o `?fila=` do sininho (28/10, dono).
 *
 * O aviso do sino abre /scaling?fila=troca já no bloco. "Limpar" voltava o
 * bloco para "Todas", mas deixava o `?fila=` na URL — recarregar reabria o
 * bloco. Limpar agora tira o parâmetro, sem tocar num `?honorarios=` que não
 * veio junto (o efeito do link de honorários lê a URL e reabriria a gaveta).
 */
import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { criarWrapper } from "@/test/render";
import { usuarioFake } from "@/test/fixtures";
import { useScalingFilters } from "./use-scaling-filters";

function montar(rota: string) {
  const { Wrapper, historico } = criarWrapper({ user: usuarioFake({ role: "admin" }), rota });
  const { result } = renderHook(() => useScalingFilters(), { wrapper: Wrapper });
  return { result, historico };
}

describe("useScalingFilters — Limpar tira o ?fila= da URL (28/10)", () => {
  it("abre no bloco do link e, ao limpar, sai do bloco E da URL", async () => {
    const { result, historico } = montar("/scaling?fila=troca&t=123");
    await waitFor(() => expect(result.current.fila).toBe("troca"));
    act(() => result.current.limpaFiltros());
    expect(result.current.fila).toBeNull();
    await waitFor(() => expect(historico.at(-1)).toBe("/scaling"));
    // O efeito do link não reabre o bloco depois de a URL mudar.
    expect(result.current.fila).toBeNull();
  });

  it("o link de honorários junto com o bloco também sai — não pode disparar de novo", async () => {
    const { result, historico } = montar("/scaling?fila=gestor&honorarios=devolvidos&t=9");
    await waitFor(() => expect(result.current.fila).toBe("gestor"));
    act(() => result.current.limpaFiltros());
    await waitFor(() => expect(historico.at(-1)).toBe("/scaling"));
  });

  it("sem ?fila= na URL, limpar não mexe na URL (o ?honorarios= sozinho não é refeito)", async () => {
    const { result, historico } = montar("/scaling?honorarios=devolvidos&t=5");
    act(() => result.current.setBusca("ana"));
    act(() => result.current.limpaFiltros());
    expect(result.current.busca).toBe("");
    expect(historico).toEqual(["/scaling?honorarios=devolvidos&t=5"]);
  });
});

describe("useScalingFilters — link dos Painéis (30/10)", () => {
  it("?eventId=&fila=&q= abre a Fila no evento, no bloco e com a busca; limpar tira tudo da URL", async () => {
    const { result, historico } = montar("/scaling?eventId=ev-1&fila=prontas&q=4821");
    await waitFor(() => expect(result.current.eventosMarcados).toEqual(["ev-1"]));
    expect(result.current.fila).toBe("prontas");
    expect(result.current.busca).toBe("4821");
    expect(result.current.aba).toBe("fila");
    act(() => result.current.limpaFiltros());
    await waitFor(() => expect(historico.at(-1)).toBe("/scaling"));
    expect(result.current.eventosMarcados).toEqual([]);
  });

  it("só ?eventId= abre em Todas, sem busca", async () => {
    const { result } = montar("/scaling?eventId=ev-2");
    await waitFor(() => expect(result.current.eventosMarcados).toEqual(["ev-2"]));
    expect(result.current.fila).toBeNull();
    expect(result.current.busca).toBe("");
  });
});
