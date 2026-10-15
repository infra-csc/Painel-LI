import { describe, expect, it } from "vitest";
import { resumirConsumo, resumoParaHistorico, rotuloDoMes, type LinhaDeConsumo } from "./consumo-da-busca";
import type { ItinerarioDeVoo } from "./busca-de-passagens";

const L = (mes: string, usuarioId: string | null, doCache: boolean, tipo: string, n: number): LinhaDeConsumo => ({ mes, usuarioId, doCache, tipo, n });

describe("resumirConsumo — aba Consumo", () => {
  const linhas = [
    L("2026-10", "ana", false, "ida_e_volta", 300),
    L("2026-10", "ana", false, "link", 20),
    L("2026-10", "bia", false, "ida", 180),
    L("2026-10", "bia", true, "ida", 120),
    L("2026-09", "ana", false, "ida", 50),
    L("2026-09", "ana", true, "ida", 10),
  ];

  it("mês corrente: reais (contam no teto), links, cache e a taxa do cache", () => {
    const r = resumirConsumo(linhas, { hoje: "2026-10-10", teto: 1000, nomes: { ana: "Ana", bia: "Bia" } });
    expect(r.mesAtual).toMatchObject({ mes: "2026-10", reais: 500, links: 20, cache: 120, teto: 1000, situacao: "ok", diaDoMes: 10, diasNoMes: 31 });
    // 120 do cache ÷ (480 buscas reais + 120)
    expect(r.mesAtual.taxaCache).toBeCloseTo(0.2);
    // 500 em 10 dias → 1.550 no fim do mês
    expect(r.mesAtual.projecao).toBe(1550);
  });

  it("últimos 6 meses em ordem, com mês vazio, e quem consultou", () => {
    const r = resumirConsumo(linhas, { hoje: "2026-10-10", teto: 1000, nomes: { ana: "Ana", bia: "Bia" } });
    expect(r.porMes.map((m) => m.rotulo)).toEqual(["mai/26", "jun/26", "jul/26", "ago/26", "set/26", "out/26"]);
    expect(r.porMes[4]).toMatchObject({ reais: 50, cache: 10 });
    expect(r.porMes[0]).toMatchObject({ reais: 0, cache: 0 });
    expect(r.porUsuario).toEqual([
      { usuarioId: "ana", nome: "Ana", reais: 320, cache: 0 },
      { usuarioId: "bia", nome: "Bia", reais: 180, cache: 120 },
    ]);
  });

  it("alerta a partir de 80% e atingido no teto; sem buscas, taxa nula", () => {
    expect(resumirConsumo([L("2026-10", "a", false, "ida", 800)], { hoje: "2026-10-20", teto: 1000 }).mesAtual.situacao).toBe("alerta");
    expect(resumirConsumo([L("2026-10", "a", false, "ida", 1000)], { hoje: "2026-10-20", teto: 1000 }).mesAtual.situacao).toBe("atingido");
    expect(resumirConsumo([], { hoje: "2026-10-01", teto: 1000 }).mesAtual.taxaCache).toBeNull();
    expect(rotuloDoMes("2027-01")).toBe("jan/27");
  });
});

describe("resumoParaHistorico — o que fica guardado de cada consulta", () => {
  const perna = (cia: string, num: string, p: string, c: string) => ({ companhia: cia, duracaoMin: 120, segmentos: [{ companhia: cia, numero: num, origem: "GRU", destino: "JPA", partida: p, chegada: c }] });
  const it_ = (id: string, preco: number, cia: string): ItinerarioDeVoo => ({ id, precoCentavos: preco, moeda: "BRL", pernas: [perna(cia, id, "2026-11-12T08:00", "2026-11-12T10:00")] });

  it("menor preço, menor por companhia e as 10 mais baratas em ordem", () => {
    const lista = Array.from({ length: 12 }, (_, i) => it_(`v${i}`, 50000 + i * 1000, ["LA", "G3", "AD"][i % 3]));
    const r = resumoParaHistorico([...lista].reverse(), "ida");
    expect(r.menorPrecoCentavos).toBe(50000);
    expect(r.menorPorCia).toEqual({ LA: 50000, G3: 51000, AD: 52000 });
    expect(r.opcoes).toHaveLength(10);
    expect(r.opcoes[0]).toMatchObject({ posicao: 1, itinerarioId: "v0", companhia: "LA", voos: "LA v0", idaPartida: "2026-11-12T08:00", voltaPartida: null, paradas: 0, duracaoMin: 120 });
  });

  it("consulta só de volta guarda os horários nas colunas da volta", () => {
    const r = resumoParaHistorico([it_("x", 40000, "G3")], "volta");
    expect(r.opcoes[0]).toMatchObject({ idaPartida: null, voltaPartida: "2026-11-12T08:00", voltaChegada: "2026-11-12T10:00" });
  });
});
