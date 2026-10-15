import { describe, expect, it } from "vitest";
import {
  AJUSTES_PADRAO,
  CHAVES_DOS_AJUSTES,
  alertasDeGrupo,
  avaliarTetoDoTrecho,
  chaveDaRota,
  decidirAvisoDoAcompanhamento,
  faixaDaAntecedencia,
  funcoesQueDespacham,
  justificativaValida,
  lerAjustesDaBusca,
  mediana,
  nomeDaRota,
  precoTipico,
  rotaDaPassagem,
  validarAjustes,
  type PernaParaGrupo,
} from "./regras-da-busca";

describe("ajustes da busca (system_settings)", () => {
  it("padrão quando falta ou vem quebrado; lê o que é válido", () => {
    expect(lerAjustesDaBusca({})).toEqual(AJUSTES_PADRAO);
    const a = lerAjustesDaBusca({
      [CHAVES_DOS_AJUSTES.tetoPorTrechoPct]: "45",
      [CHAVES_DOS_AJUSTES.limiteDeAcompanhamentos]: "abc",
      [CHAVES_DOS_AJUSTES.horaDoAcompanhamento]: "25",
      [CHAVES_DOS_AJUSTES.funcoesComMala]: "[\"f1\",\"f2\",3]",
    });
    expect(a).toMatchObject({ tetoPorTrechoPct: 45, limiteDeAcompanhamentos: 20, horaDoAcompanhamento: 7, funcoesComMala: ["f1", "f2"] });
    expect(lerAjustesDaBusca({ [CHAVES_DOS_AJUSTES.funcoesComMala]: "{quebrado" }).funcoesComMala).toBeNull();
  });

  it("valida o PUT campo a campo", () => {
    const r = validarAjustes({ tetoPorTrechoPct: 50, quedaParaAvisoPct: 0, funcoesComMala: ["a", "a", "b"], outro: 1 });
    expect(r.ok).toEqual({ tetoPorTrechoPct: 50, funcoesComMala: ["a", "b"] });
    expect(Object.keys(r.erros)).toEqual(["quedaParaAvisoPct"]);
  });
});

describe("quem despacha mala", () => {
  const funcoes = [{ id: "c", name: "Cenotécnica" }, { id: "s", name: "Sup Ceno" }, { id: "k", name: "Key Account" }];
  it("sem lista do admin: cenotécnica; com lista: a lista manda", () => {
    expect(Array.from(funcoesQueDespacham(funcoes, null))).toEqual(["c"]);
    expect(Array.from(funcoesQueDespacham(funcoes, ["k"]))).toEqual(["k"]);
    expect(funcoesQueDespacham(funcoes, []).size).toBe(0);
  });
});

describe("rota, mediana e preço típico", () => {
  it("ida e volta e uma perna são tarifas diferentes", () => {
    expect(chaveDaRota("ida_e_volta", "gru", "jpa")).toBe("rt|GRU>JPA");
    expect(chaveDaRota("volta", "JPA", "GRU")).toBe("ow|JPA>GRU");
    expect(nomeDaRota("rt|GRU>JPA")).toBe("GRU ⇄ JPA");
    expect(nomeDaRota("ow|JPA>GRU")).toBe("JPA → GRU");
  });

  it("mediana robusta; típico só com amostra mínima", () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([1, 2, 3, 10])).toBe(3);
    expect(mediana([])).toBeNull();
    expect(precoTipico([100, 200])).toBeNull();
    expect(precoTipico([100, 200, 300, null, 0])).toEqual({ mediana: 200, amostra: 3 });
  });

  it("faixas de antecedência do briefing (<7, 7–14, 15–30, 31–60, 60+)", () => {
    expect([0, 6, 7, 14, 15, 30, 31, 60, 61].map(faixaDaAntecedencia)).toEqual(["0-6", "0-6", "7-14", "7-14", "15-30", "15-30", "31-60", "31-60", "61+"]);
    expect(faixaDaAntecedencia(-1)).toBeNull();
  });
});

describe("teto por trecho", () => {
  it("acima de N% do típico exige justificativa; sem típico não julga", () => {
    const t = avaliarTetoDoTrecho(140000, { mediana: 100000, amostra: 8 }, 30)!;
    expect(t).toMatchObject({ acima: true, limite: 130000, pctAcimaDoTipico: 40 });
    expect(avaliarTetoDoTrecho(125000, { mediana: 100000, amostra: 8 }, 30)!.acima).toBe(false);
    expect(avaliarTetoDoTrecho(999999, null, 30)).toBeNull();
    expect(justificativaValida("ok")).toBe(false);
    expect(justificativaValida("Único voo que chega antes da montagem")).toBe(true);
  });

  it("rota da passagem: ida e volta, só ida, só volta", () => {
    const base = { departureAirport: "gru", destinationAirport: "JPA", returnOriginAirport: "JPA", returnDestinationAirport: "GRU" };
    expect(rotaDaPassagem({ ...base, actualDepartureDate: "2026-11-12", actualReturnDate: "2026-11-16" })).toEqual({ perna: "ida_e_volta", origem: "GRU", destino: "JPA" });
    expect(rotaDaPassagem({ ...base, actualDepartureDate: "2026-11-12" })).toEqual({ perna: "ida", origem: "GRU", destino: "JPA" });
    expect(rotaDaPassagem({ ...base, actualReturnDate: "2026-11-16" })).toEqual({ perna: "volta", origem: "JPA", destino: "GRU" });
    expect(rotaDaPassagem({ departureAirport: "São Paulo", destinationAirport: "JPA", actualDepartureDate: "2026-11-12" })).toBeNull();
  });
});

describe("alerta de grupo", () => {
  const perna = (i: number, extra: Partial<PernaParaGrupo> = {}): PernaParaGrupo =>
    ({ vagaId: `v${i}`, numero: 100 + i, nome: `Pessoa ${i}`, origem: "GRU", destino: "POA", data: "2026-11-14", ...extra });

  it("10+ pessoas no mesmo trecho e dia viram alerta, com a lista; menos que isso não", () => {
    const pernas = [...Array.from({ length: 11 }, (_, i) => perna(i)), perna(1), ...Array.from({ length: 9 }, (_, i) => perna(50 + i, { data: "2026-11-15" }))];
    const a = alertasDeGrupo(pernas);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ origem: "GRU", destino: "POA", data: "2026-11-14" });
    expect(a[0].vagas).toHaveLength(11);
    expect(a[0].vagas[0].numero).toBe(100);
  });
});

describe("aviso do acompanhamento", () => {
  it("queda de 10%+ desde a referência avisa e vira a nova referência", () => {
    const d = decidirAvisoDoAcompanhamento({ referencia: 112000, novoPreco: 98000, tendenciaAnterior: "estavel", novaTendencia: "estavel", quedaPct: 10 });
    expect(d).toEqual({ aviso: "caiu", texto: "Caiu 13% (R$ 1.120 → R$ 980)", referencia: 98000 });
  });

  it("queda pequena não avisa; tendência que VIRA subir avisa uma vez", () => {
    expect(decidirAvisoDoAcompanhamento({ referencia: 100000, novoPreco: 95000, tendenciaAnterior: null, novaTendencia: "estavel", quedaPct: 10 }).aviso).toBeNull();
    expect(decidirAvisoDoAcompanhamento({ referencia: 100000, novoPreco: 101000, tendenciaAnterior: "estavel", novaTendencia: "subir", quedaPct: 10 }).aviso).toBe("subir");
    expect(decidirAvisoDoAcompanhamento({ referencia: 100000, novoPreco: 101000, tendenciaAnterior: "subir", novaTendencia: "subir", quedaPct: 10 }).aviso).toBeNull();
  });

  it("primeira checagem só guarda a referência", () => {
    expect(decidirAvisoDoAcompanhamento({ referencia: null, novoPreco: 80000, tendenciaAnterior: null, novaTendencia: "subir", quedaPct: 10 }))
      .toEqual({ aviso: null, texto: null, referencia: 80000 });
  });
});
