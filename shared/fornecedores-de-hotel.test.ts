import { describe, expect, it } from "vitest";
import { canalDaReserva, formasDoFornecedor, resumoDosFornecedores, textoDoCanal } from "./fornecedores-de-hotel";

describe("Forma de pagamento por fornecedor", () => {
  it("agência é faturado; Airbnb e Hoteis.com, cartão; direto, PIX ou faturado", () => {
    expect(formasDoFornecedor("flytour")).toEqual(["faturado"]);
    expect(formasDoFornecedor("lca")).toEqual(["faturado"]);
    expect(formasDoFornecedor("onfly")).toEqual(["faturado"]);
    expect(formasDoFornecedor("airbnb")).toEqual(["cartao"]);
    expect(formasDoFornecedor("hoteis_com")).toEqual(["cartao"]);
    expect(formasDoFornecedor("direto")).toEqual(["pix", "faturado"]);
  });

  it("forma fixa entra sozinha, mesmo que chegue outra; direto aceita vazio, PIX e faturado", () => {
    expect(canalDaReserva("onfly", null)).toEqual({ ok: true, canal: { fornecedor: "onfly", formaPagamento: "faturado" } });
    expect(canalDaReserva("airbnb", "pix")).toEqual({ ok: true, canal: { fornecedor: "airbnb", formaPagamento: "cartao" } });
    expect(canalDaReserva("direto", null)).toEqual({ ok: true, canal: { fornecedor: "direto", formaPagamento: null } });
    expect(canalDaReserva("direto", "pix")).toEqual({ ok: true, canal: { fornecedor: "direto", formaPagamento: "pix" } });
  });

  it("recusa o que não existe: cartão direto com o hotel, fornecedor desconhecido, forma sem fornecedor", () => {
    expect(canalDaReserva("direto", "cartao").ok).toBe(false);
    expect(canalDaReserva("booking", "cartao").ok).toBe(false);
    expect(canalDaReserva(null, "pix").ok).toBe(false);
    expect(canalDaReserva(null, null)).toEqual({ ok: true, canal: { fornecedor: null, formaPagamento: null } });
  });

  it("o texto da reserva diz o que falta", () => {
    expect(textoDoCanal("lca", "faturado")).toBe("LCA · Faturado");
    expect(textoDoCanal("direto", null)).toBe("Direto com o hotel · pagamento a definir");
    expect(textoDoCanal(null, null)).toBe("Sem fornecedor");
  });
});

describe("Resumo por fornecedor", () => {
  it("o mesmo hotel com canais diferentes: soma por canal e forma, na ordem da lista, sem fornecedor por último", () => {
    const r = resumoDosFornecedores([
      { hospedes: 1 },
      { fornecedor: "direto", formaPagamento: "faturado", hospedes: 2, valorCentavos: 10_000 },
      { fornecedor: "flytour", formaPagamento: "faturado", hospedes: 2, valorCentavos: 30_000 },
      { fornecedor: "direto", formaPagamento: "pix", hospedes: 1, valorCentavos: 5_000 },
      { fornecedor: "flytour", formaPagamento: "faturado", hospedes: 3, valorCentavos: 20_000 },
    ]);
    expect(r.map((l) => [l.fornecedor, l.formaPagamento, l.quartos, l.hospedes, l.valorCentavos])).toEqual([
      ["flytour", "faturado", 2, 5, 50_000],
      ["direto", "faturado", 1, 2, 10_000],
      ["direto", "pix", 1, 1, 5_000],
      [null, null, 1, 1, null],
    ]);
  });
});
