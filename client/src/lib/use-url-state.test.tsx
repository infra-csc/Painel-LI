// O hook de verdade (com o Router do wouter em memória). As funções puras
// estão cobertas em use-url-state.test.ts.
import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { criarWrapper } from "@/test/render";
import { campo, useUrlState } from "./use-url-state";

const esquema = {
  q: campo.texto(""),
  status: campo.texto("all"),
  pagina: campo.numero(1),
  ativos: campo.booleano(false),
  funcoes: campo.lista([]),
};

function montar(rota: string, opcoes?: { replace?: boolean }) {
  const { Wrapper, historico, navegar } = criarWrapper({ rota });
  const hook = renderHook(() => useUrlState(esquema, opcoes), { wrapper: Wrapper });
  return { ...hook, historico, navegar };
}

const params = (url: string) => new URLSearchParams(url.split("?")[1] ?? "");

describe("useUrlState (hook)", () => {
  it("lê o estado da query string atual e usa os padrões para o resto", () => {
    const { result } = montar("/users?q=ana&pagina=3&funcoes=a,b");
    expect(result.current[0]).toEqual({ q: "ana", status: "all", pagina: 3, ativos: false, funcoes: ["a", "b"] });
  });

  it("escreve só o que difere do padrão e mantém o caminho", () => {
    const { result, historico } = montar("/users");
    act(() => result.current[1]({ q: "joão", ativos: true }));
    expect(result.current[0].q).toBe("joão");
    expect(result.current[0].ativos).toBe(true);
    const atual = historico.at(-1)!;
    expect(atual.startsWith("/users?")).toBe(true);
    expect(params(atual).get("q")).toBe("joão");
    expect(params(atual).get("ativos")).toBe("1");
    expect(params(atual).has("status")).toBe(false);
  });

  it("preserva parâmetros que o esquema não conhece (ex.: event=)", () => {
    const { result, historico } = montar("/scaling?event=ev-1&outro=x");
    act(() => result.current[1]({ pagina: 2 }));
    const p = params(historico.at(-1)!);
    expect(p.get("event")).toBe("ev-1");
    expect(p.get("outro")).toBe("x");
    expect(p.get("pagina")).toBe("2");
  });

  it("voltar ao padrão remove o parâmetro; sem nada sobra o caminho limpo", () => {
    const { result, historico } = montar("/users?q=ana");
    act(() => result.current[1]({ q: "" }));
    expect(historico.at(-1)).toBe("/users");
    expect(result.current[0].q).toBe("");
  });

  it("por padrão usa replace (não empilha histórico a cada tecla)", () => {
    const { result, historico } = montar("/users");
    act(() => result.current[1]({ q: "a" }));
    act(() => result.current[1]({ q: "ab" }));
    act(() => result.current[1]({ q: "abc" }));
    expect(historico).toHaveLength(1);
    expect(historico[0]).toBe("/users?q=abc");
  });

  it("replace: false empilha", () => {
    const { result, historico } = montar("/users", { replace: false });
    act(() => result.current[1]({ pagina: 2 }));
    act(() => result.current[1]({ pagina: 3 }));
    expect(historico).toEqual(["/users", "/users?pagina=2", "/users?pagina=3"]);
  });

  it("duas atualizações no mesmo tick não se apagam", () => {
    const { result, historico } = montar("/users");
    act(() => {
      result.current[1]({ q: "ana" });
      result.current[1]({ pagina: 5 });
    });
    const p = params(historico.at(-1)!);
    expect(p.get("q")).toBe("ana");
    expect(p.get("pagina")).toBe("5");
  });

  it("aceita atualização funcional e não navega quando nada muda", () => {
    const { result, historico } = montar("/users?pagina=2", { replace: false });
    act(() => result.current[1]((anterior) => ({ ...anterior, pagina: anterior.pagina + 1 })));
    expect(result.current[0].pagina).toBe(3);
    act(() => result.current[1]({ pagina: 3 }));
    expect(historico).toEqual(["/users?pagina=2", "/users?pagina=3"]);
  });

  it("reage a navegação externa (voltar do navegador)", () => {
    const { result, navegar } = montar("/users?q=ana");
    act(() => navegar("/users?q=bia"));
    expect(result.current[0].q).toBe("bia");
  });
});
