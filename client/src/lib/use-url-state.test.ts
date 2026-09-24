// Testes da (de)serialização do estado na URL (23/09). O hook em si depende do
// wouter e do DOM; aqui cobrimos as funções puras que ele usa.
import { describe, it, expect } from "vitest";
import { campo, escreverNaUrl, hrefComEstado, lerDaUrl } from "./use-url-state";

const esquema = {
  q: campo.texto(""),
  status: campo.texto("all"),
  pagina: campo.numero(1),
  ativos: campo.booleano(false),
  funcoes: campo.lista([]),
  aba: campo.opcao<"lancamento" | "aprovacao">("lancamento", "tab"),
};

describe("lerDaUrl", () => {
  it("devolve os padrões quando a query está vazia", () => {
    expect(lerDaUrl(esquema, "")).toEqual({ q: "", status: "all", pagina: 1, ativos: false, funcoes: [], aba: "lancamento" });
  });

  it("aceita a query com ou sem '?'", () => {
    expect(lerDaUrl(esquema, "?q=ana").q).toBe("ana");
    expect(lerDaUrl(esquema, "q=ana").q).toBe("ana");
  });

  it("converte número, booleano e lista", () => {
    const s = lerDaUrl(esquema, "pagina=3&ativos=1&funcoes=a,b,c");
    expect(s.pagina).toBe(3);
    expect(s.ativos).toBe(true);
    expect(s.funcoes).toEqual(["a", "b", "c"]);
  });

  it("aceita 'true' como booleano e ignora número inválido", () => {
    const s = lerDaUrl(esquema, "pagina=abc&ativos=true");
    expect(s.pagina).toBe(1);
    expect(s.ativos).toBe(true);
  });

  it("usa o nome alternativo do parâmetro", () => {
    expect(lerDaUrl(esquema, "tab=aprovacao").aba).toBe("aprovacao");
  });

  it("lista vazia na URL vira lista vazia (sem item '')", () => {
    expect(lerDaUrl(esquema, "funcoes=").funcoes).toEqual([]);
  });
});

describe("escreverNaUrl", () => {
  it("omite campos no padrão", () => {
    expect(escreverNaUrl(esquema, lerDaUrl(esquema, ""))).toBe("");
  });

  it("escreve só o que difere do padrão", () => {
    const qs = escreverNaUrl(esquema, { q: "ana", status: "all", pagina: 2, ativos: true, funcoes: ["x", "y"], aba: "aprovacao" });
    const p = new URLSearchParams(qs);
    expect(p.get("q")).toBe("ana");
    expect(p.get("status")).toBeNull();
    expect(p.get("pagina")).toBe("2");
    expect(p.get("ativos")).toBe("1");
    expect(p.get("funcoes")).toBe("x,y");
    expect(p.get("tab")).toBe("aprovacao");
  });

  it("preserva parâmetros que o esquema não conhece (ex.: evento em foco)", () => {
    const qs = escreverNaUrl(esquema, { ...lerDaUrl(esquema, ""), q: "x" }, "event=ev1&outro=2");
    const p = new URLSearchParams(qs);
    expect(p.get("event")).toBe("ev1");
    expect(p.get("outro")).toBe("2");
    expect(p.get("q")).toBe("x");
  });

  it("remove da URL um campo que voltou ao padrão", () => {
    const qs = escreverNaUrl(esquema, lerDaUrl(esquema, ""), "q=ana&pagina=3&event=ev1");
    expect(qs).toBe("event=ev1");
  });

  it("ida e volta preserva o estado", () => {
    const original = { q: "joão", status: "pending", pagina: 4, ativos: true, funcoes: ["f1"], aba: "lancamento" as const };
    expect(lerDaUrl(esquema, escreverNaUrl(esquema, original))).toEqual(original);
  });
});

describe("hrefComEstado", () => {
  it("monta o link sem '?' quando tudo está no padrão", () => {
    expect(hrefComEstado("/users", esquema, lerDaUrl(esquema, ""))).toBe("/users");
  });
  it("monta o link com a query", () => {
    expect(hrefComEstado("/users", esquema, { ...lerDaUrl(esquema, ""), status: "pending" })).toBe("/users?status=pending");
  });
});
