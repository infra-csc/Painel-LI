// Funções puras do "evento em foco" (23/09): leitura dos dois nomes de
// parâmetro, reescrita da query e chave por usuário no localStorage.
import { describe, it, expect } from "vitest";
import { buscaComEvento, chaveDoEventoEmFoco, hrefComEvento, lerEventoDaBusca } from "./evento-em-foco";

describe("lerEventoDaBusca", () => {
  it("lê ?event= (Financeiro/Passagens)", () => {
    expect(lerEventoDaBusca("?event=abc&q=x")).toBe("abc");
  });
  it("lê ?eventId= (Escala/Espelho)", () => {
    expect(lerEventoDaBusca("eventId=xyz")).toBe("xyz");
  });
  it("prefere ?event= quando os dois existem", () => {
    expect(lerEventoDaBusca("event=a&eventId=b")).toBe("a");
  });
  it("vazio quando não há evento", () => {
    expect(lerEventoDaBusca("q=x")).toBe("");
  });
});

describe("buscaComEvento", () => {
  it("preserva os outros parâmetros e escreve o evento", () => {
    const p = new URLSearchParams(buscaComEvento("q=ana&status=pending", "ev1"));
    expect(p.get("q")).toBe("ana");
    expect(p.get("status")).toBe("pending");
    expect(p.get("event")).toBe("ev1");
  });
  it("nunca deixa event e eventId apontando para eventos diferentes", () => {
    const p = new URLSearchParams(buscaComEvento("eventId=velho&x=1", "novo", "event"));
    expect(p.get("eventId")).toBeNull();
    expect(p.get("event")).toBe("novo");
    expect(p.get("x")).toBe("1");
  });
  it("modo substituir zera tudo e escreve só evento + extras", () => {
    const p = new URLSearchParams(buscaComEvento("q=ana&request=r1", "ev1", "eventId", "substituir", { tab: "hist" }));
    expect(p.get("q")).toBeNull();
    expect(p.get("request")).toBeNull();
    expect(p.get("eventId")).toBe("ev1");
    expect(p.get("tab")).toBe("hist");
  });
  it("evento vazio remove o parâmetro e mantém o resto", () => {
    expect(buscaComEvento("event=ev1&q=ana", "")).toBe("q=ana");
  });
  it("ignora extras vazios", () => {
    expect(buscaComEvento("", "ev1", "eventId", "substituir", { tab: "" })).toBe("eventId=ev1");
  });
});

describe("hrefComEvento", () => {
  it("monta o link com o parâmetro pedido", () => {
    expect(hrefComEvento("/budget-actual", "ev1")).toBe("/budget-actual?event=ev1");
    expect(hrefComEvento("/scaling-suggestion", "ev1", "eventId")).toBe("/scaling-suggestion?eventId=ev1");
  });
  it("sem evento devolve só o caminho", () => {
    expect(hrefComEvento("/budget-actual", "")).toBe("/budget-actual");
    expect(hrefComEvento("/budget-actual", null)).toBe("/budget-actual");
  });
});

describe("chaveDoEventoEmFoco", () => {
  it("é por usuário", () => {
    expect(chaveDoEventoEmFoco("u1")).toBe("evento-em-foco:u1");
    expect(chaveDoEventoEmFoco("u2")).not.toBe(chaveDoEventoEmFoco("u1"));
  });
  it("tem valor estável sem usuário", () => {
    expect(chaveDoEventoEmFoco(null)).toBe("evento-em-foco:anonimo");
    expect(chaveDoEventoEmFoco(undefined)).toBe("evento-em-foco:anonimo");
  });
});
