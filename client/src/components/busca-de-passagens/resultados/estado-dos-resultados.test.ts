import { describe, expect, it } from "vitest";
import { ordenarOpcoes, type ItinerarioDeVoo } from "@shared/busca-de-passagens";
import {
  FILTROS_DAS_OPCOES_PADRAO,
  escreverResultados,
  lerAjustes,
  lerResultados,
  linkDaLista,
  linkDosResultados,
  ordenarParaTela,
  passaNasOpcoes,
} from "./estado-dos-resultados";

const voo = (id: string, cia: string, preco: number, partida: string, chegada: string, paradas = 0): ItinerarioDeVoo => ({
  id, precoCentavos: preco, moeda: "BRL",
  pernas: [{
    companhia: cia, duracaoMin: 180 + paradas * 120,
    segmentos: Array.from({ length: paradas + 1 }, (_, i) => ({
      companhia: cia, numero: `${100 + i}`, origem: i === 0 ? "GRU" : "BSB", destino: i === paradas ? "MAO" : "BSB",
      partida: `2026-11-12T${i === 0 ? partida : "14:00"}`, chegada: `2026-11-12T${i === paradas ? chegada : "13:00"}`,
    })),
  }],
});
const rota = { perna: "ida" as const, faixaIda: null, faixaVolta: null };

describe("estado dos resultados na URL", () => {
  it("ida e volta: vagas, ajustes, rota, filtros e o recorte da lista sobrevivem ao recarregar", () => {
    const qs = escreverResultados({
      vagas: ["v1", "v2"], ajustes: { v1: { maxParadas: 2, aeroportoDeCasa: "CGH" }, v9: { semHorario: true } }, idaDe: null, remarcar: true,
      rota: "ida|GRU>MAO|2026-11-12|-|p1|-|-", flex: ["k1"], alternativas: [], lista: "situacao=todas&passados=1",
      filtros: { ...FILTROS_DAS_OPCOES_PADRAO, cias: ["LA", "AD"], paradas: "0", partida: "manha", ordem: "preco" },
    });
    const e = lerResultados(qs);
    expect(e.vagas).toEqual(["v1", "v2"]);
    // Ajuste de vaga fora da busca não vai para a URL.
    expect(e.ajustes).toEqual({ v1: { maxParadas: 2, aeroportoDeCasa: "CGH" } });
    expect(e.remarcar).toBe(true);
    expect(e.rota).toBe("ida|GRU>MAO|2026-11-12|-|p1|-|-");
    expect(e.flex).toEqual(["k1"]);
    expect(e.filtros).toEqual({ ...FILTROS_DAS_OPCOES_PADRAO, cias: ["LA", "AD"], paradas: "0", partida: "manha", ordem: "preco" });
    expect(e.lista).toBe("situacao=todas&passados=1");
    expect(e.buscar).toBe(false);
  });

  it("\"buscar=1\" só vem no link da lista e nunca volta para a URL da tela", () => {
    const link = linkDosResultados({ vagas: ["v1"], buscar: true });
    expect(link.startsWith("/busca-de-passagens/resultados?")).toBe(true);
    expect(lerResultados(link.split("?")[1]).buscar).toBe(true);
    // A tela regrava a URL a partir do estado SEM o `buscar` (lido uma vez só).
    const { buscar: _lido, ...semBuscar } = lerResultados(link.split("?")[1]);
    expect(escreverResultados(semBuscar)).not.toContain("buscar");
  });

  it("ajustes da URL são limpos: campo inválido ou de fora some, JSON quebrado vira vazio", () => {
    expect(lerAjustes(JSON.stringify({ v1: { aeroportoDeCasa: "gru'><script>", dataIda: "2026-11-12", maxParadas: 9, outro: 1 } }))).toEqual({ v1: { dataIda: "2026-11-12" } });
    expect(lerAjustes("{quebrado")).toEqual({});
    expect(lerAjustes(null)).toEqual({});
  });

  it("voltar à lista leva o recorte de antes + a seleção e os ajustes", () => {
    const url = linkDaLista("situacao=todas&q=ana", ["v1", "v2"], { v2: { maxParadas: 2 } });
    const p = new URLSearchParams(url.split("?")[1]);
    expect(url.startsWith("/busca-de-passagens?")).toBe(true);
    expect(p.get("situacao")).toBe("todas");
    expect(p.get("q")).toBe("ana");
    expect(p.get("vagas")).toBe("v1,v2");
    expect(JSON.parse(p.get("aj")!)).toEqual({ v2: { maxParadas: 2 } });
    expect(linkDaLista("", [], {})).toBe("/busca-de-passagens");
  });
});

describe("filtros locais das opções", () => {
  const opcoes = ordenarOpcoes([
    voo("la", "LA", 150000, "06:30", "10:10"),
    voo("g3", "G3", 120000, "19:00", "23:30", 1),
    voo("ad", "AD", 99000, "13:00", "16:20"),
  ], rota);

  it("companhia, direto × conexão e faixa de partida/chegada recortam sem mexer no resto", () => {
    const f = FILTROS_DAS_OPCOES_PADRAO;
    const ids = (ff: typeof f) => opcoes.filter((o) => passaNasOpcoes(o, "ida", ff)).map((o) => o.itinerario.id);
    expect(ids({ ...f, cias: ["LA", "AD"] })).toEqual(["ad", "la"]);
    expect(ids({ ...f, paradas: "0" })).toEqual(["ad", "la"]);
    expect(ids({ ...f, partida: "manha" })).toEqual(["la"]);
    expect(ids({ ...f, chegada: "noite" })).toEqual(["g3"]);
    expect(ids({ ...f, cias: ["G3"], paradas: "0" })).toEqual([]);
  });

  it("ordem: custo total (regra), preço, duração e partida", () => {
    expect(ordenarParaTela(opcoes, "custo").map((o) => o.itinerario.id)).toEqual(opcoes.map((o) => o.itinerario.id));
    expect(ordenarParaTela(opcoes, "preco").map((o) => o.itinerario.id)).toEqual(["ad", "g3", "la"]);
    expect(ordenarParaTela(opcoes, "partida").map((o) => o.itinerario.id)).toEqual(["la", "ad", "g3"]);
    expect(ordenarParaTela(opcoes, "duracao")[2].itinerario.id).toBe("g3");
  });
});
