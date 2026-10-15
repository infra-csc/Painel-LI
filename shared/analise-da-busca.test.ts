import { describe, expect, it } from "vitest";
import {
  agruparPrecos,
  custosOcultos,
  indicesDasConsultas,
  indicesDasPassagens,
  melhorMomento,
  pagoXEncontrado,
  precoPorRota,
  type ConsultaDoHistorico,
  type OpcaoDoHistoricoNaAnalise,
  type PassagemDaBusca,
  type UsoDaBusca,
} from "./analise-da-busca";

let seq = 0;
const consulta = (x: Partial<ConsultaDoHistorico> & { preco: number }): ConsultaDoHistorico => {
  const { preco, ...resto } = x;
  const dia = resto.dia ?? "2026-09-01";
  return {
    id: `c${++seq}`, consultadoEm: `${dia}T12:00:00Z`, dia, usuarioId: "u1", perna: "ida_e_volta", origem: "GRU", destino: "JPA",
    dataIda: "2026-10-20", dataVolta: "2026-10-24", deslocada: false, antecedenciaDias: 20, menorPrecoCentavos: preco,
    menorPorCia: null, eventoIds: ["e1"], vagaIds: [], ...resto,
  };
};

/** Duas rotas com a MESMA curva relativa: <7 = 1,4 · 7–14 = 1,15 · 15–30 = 1 · 31–60 = 0,85 do típico. */
function curvaDeExemplo(): ConsultaDoHistorico[] {
  const fatores: Array<[number, number]> = [[3, 1.4], [10, 1.15], [20, 1], [45, 0.85]];
  const out: ConsultaDoHistorico[] = [];
  for (const [rota, base] of [[{ perna: "ida_e_volta" as const, origem: "GRU", destino: "JPA" }, 100000], [{ perna: "ida" as const, origem: "GRU", destino: "POA", dataVolta: null }, 40000]] as const) {
    for (const [ant, f] of fatores) for (let i = 0; i < 3; i++) out.push(consulta({ ...rota, antecedenciaDias: ant, preco: Math.round(base * f), dataIda: "2026-10-20" }));
  }
  return out;
}

const passagem = (x: Partial<PassagemDaBusca>): PassagemDaBusca => ({
  ticketId: `t${++seq}`, eventId: "e1", eventName: "Makai João Pessoa", eventStart: "2026-11-14", valor: 100000, bagagem: null,
  dataCompra: "2026-10-01", dataIda: "2026-11-13", dataVolta: "2026-11-16", horaDaVolta: "15:00", companhia: "GOL",
  origem: "GRU", destino: "JPA", idaEVolta: true, trechoDireto: false, registradoPorId: "u1", registradoPorNome: "Camila Duarte", ...x,
});

describe("agruparPrecos", () => {
  it("grupo com menos de 3 preços aparece mas não é marcado; extremos pelo índice", () => {
    const g = agruparPrecos([
      { grupo: "a", preco: 100, indice: 1.3 }, { grupo: "a", preco: 100, indice: 1.3 }, { grupo: "a", preco: 100, indice: 1.3 },
      { grupo: "b", preco: 200, indice: 0.9 }, { grupo: "b", preco: 200, indice: 0.9 }, { grupo: "b", preco: 200, indice: 0.9 },
      { grupo: "c", preco: 50, indice: 0.5 },
    ], [{ chave: "a", rotulo: "A", curto: "A" }, { chave: "b", rotulo: "B", curto: "B" }, { chave: "c", rotulo: "C", curto: "C" }]);
    // "a" é mais barato em reais, mas 30% acima do típico da rota dele: é o CARO.
    expect(g.map((x) => [x.chave, x.destaque, x.pct, x.comparavel])).toEqual([["a", "caro", 30, true], ["b", "barato", -10, true], ["c", null, -50, false]]);
  });

  it("índice: rota com menos de 3 preços fica fora", () => {
    const i = indicesDasConsultas([consulta({ preco: 100 }), consulta({ preco: 200 }), consulta({ preco: 300 }), consulta({ preco: 999, destino: "MAO" })]);
    expect(i.size).toBe(3);
    expect(Array.from(i.values())).toEqual([0.5, 1, 1.5]);
  });
});

describe("Melhor momento", () => {
  it("frase direta da antecedência pelo índice (rotas de preços diferentes comparadas pelo típico)", () => {
    const m = melhorMomento({ consultas: curvaDeExemplo(), opcoes: [], passagens: [] });
    const f = m.frases.find((x) => x.tema === "antecedencia" && x.fonte === "pesquisado")!;
    expect(f.texto).toBe("Mais barato comprando com 31 a 60 dias: 21% abaixo do típico da rota (média R$ 595). Mais caro comprando com menos de 7 dias: 30% acima (média R$ 980).");
    expect(f.diferencaPct).toBe(65);
    expect(m.pesquisado.antecedencia.find((g) => g.chave === "61+")).toMatchObject({ n: 0, comparavel: false, destaque: null });
    expect(m.base).toMatchObject({ consultas: 24, comIndice: 24, rotas: 2 });
  });

  it("horário: cada voo contra os outros da mesma busca", () => {
    const c = consulta({ preco: 50000 });
    const opcoes: OpcaoDoHistoricoNaAnalise[] = [];
    for (let k = 0; k < 3; k++) {
      const id = `h${k}`;
      opcoes.push(
        { consultaId: id, companhia: "G3", idaPartida: "2026-10-20T05:10", voltaPartida: null, precoCentavos: 40000 },
        { consultaId: id, companhia: "LA", idaPartida: "2026-10-20T09:00", voltaPartida: null, precoCentavos: 50000 },
        { consultaId: id, companhia: "AD", idaPartida: "2026-10-20T19:30", voltaPartida: null, precoCentavos: 65000 },
      );
    }
    const m = melhorMomento({ consultas: [c], opcoes, passagens: [] });
    const f = m.frases.find((x) => x.tema === "horario")!;
    expect(f.barato.chave).toBe("madrugada");
    expect(f.caro.chave).toBe("noite");
    expect(f.texto).toContain("20% abaixo dos outros voos da mesma busca");
  });

  it("quem compra tarde paga a mais (estimado contra a faixa mais barata do pago)", () => {
    const ps: PassagemDaBusca[] = [];
    for (let i = 0; i < 3; i++) {
      ps.push(passagem({ dataCompra: "2026-09-20", dataIda: "2026-11-13", valor: 80000, registradoPorId: "cedo", registradoPorNome: "Ana Cedo" }));
      ps.push(passagem({ dataCompra: "2026-11-10", dataIda: "2026-11-13", valor: 120000, registradoPorId: "tarde", registradoPorNome: "Bruno Tarde" }));
    }
    const m = melhorMomento({ consultas: [], opcoes: [], passagens: ps });
    expect(m.faixaDeReferencia?.chave).toBe("31-60");
    const [primeiro, segundo] = m.quemCompra;
    expect(primeiro).toMatchObject({ nome: "Bruno Tarde", antecedenciaMedia: 3, pctEmCimaDaHora: 100 });
    // 120.000 × (1 − 0,8/1,2) = 40.000 por passagem × 3.
    expect(primeiro.custoExtraEstimado).toBe(120000);
    expect(segundo).toMatchObject({ nome: "Ana Cedo", custoExtraEstimado: 0 });
  });

  it("sem dado: nenhuma frase (estado honesto)", () => {
    const m = melhorMomento({ consultas: [consulta({ preco: 1000 })], opcoes: [], passagens: [] });
    expect(m.frases).toEqual([]);
  });
});

describe("Preço por rota", () => {
  it("menor, último, variação, tendência e a companhia mais barata", () => {
    const lista = [
      consulta({ dia: "2026-09-01", preco: 90000, menorPorCia: { LA: 95000, G3: 90000 } }),
      consulta({ dia: "2026-09-05", preco: 92000, menorPorCia: { LA: 99000, G3: 92000 } }),
      consulta({ dia: "2026-09-09", preco: 99000, menorPorCia: { LA: 99000, G3: 101000 } }),
      consulta({ dia: "2026-09-13", preco: 110000, menorPorCia: { LA: 120000, G3: 110000 } }),
    ];
    const r = precoPorRota({ consultas: lista, passagens: [] }).rotas[0];
    expect(r).toMatchObject({ nome: "GRU ⇄ JPA", consultas: 4, menor: { preco: 90000, dia: "2026-09-01" }, ultimo: { preco: 110000 }, variacaoPct: 22, ciaMaisBarata: "G3", ciaMaisCara: "LA" });
    // (92+99+110)/3 contra (90+92+99)/3.
    expect(r.tendenciaPct).toBe(7);
    expect(r.serie.map((s) => s.menor)).toEqual([90000, 92000, 99000, 110000]);
    expect(r.amostraPequena).toBe(true);
  });

  it("mais usadas e participação das companhias no gasto (pago)", () => {
    const p = precoPorRota({ consultas: [], passagens: [passagem({ companhia: "GOL", valor: 30000 }), passagem({ companhia: "Gol Linhas Aéreas", valor: 30000 }), passagem({ companhia: "LATAM", valor: 40000, destino: "POA" })] });
    expect(p.companhias.map((c) => [c.nome, c.pctGasto])).toEqual([["GOL", 60], ["LATAM", 40]]);
    expect(p.rotasMaisUsadas[0]).toMatchObject({ nome: "GRU ⇄ JPA", passagens: 2 });
  });
});

describe("Pago × encontrado e economia gerada", () => {
  it("pago contra o menor da mesma rota/data e contra o típico; por mês com acumulado", () => {
    const consultas = [
      consulta({ dia: "2026-09-01", preco: 100000 }), consulta({ dia: "2026-09-02", preco: 95000 }), consulta({ dia: "2026-09-03", preco: 120000 }),
      consulta({ dia: "2026-09-03", preco: 130000, dataIda: "2026-10-21" }),
    ];
    const chave = "ida_e_volta|GRU>JPA|2026-10-20|2026-10-24|p1|-|-";
    const usos: UsoDaBusca[] = [
      { id: "u1", dia: "2026-09-03", usuarioId: "a", usuarioNome: "Camila Duarte", ticketId: "t1", valorPago: 101000, companhia: "GOL", eventId: "e1", eventName: "Makai", chave, precoEncontrado: 98000 },
      { id: "u2", dia: "2026-10-02", usuarioId: "a", usuarioNome: "Camila Duarte", ticketId: null, valorPago: null, companhia: "GOL", eventId: "e1", eventName: "Makai", chave, precoEncontrado: 98000 },
    ];
    const r = pagoXEncontrado({ usos, consultas, hoje: "2026-10-09" });
    expect(r.linhas.find((l) => l.id === "u1")).toMatchObject({ menorEncontrado: 95000, diferenca: 6000, diferencaPct: 6, tipico: 110000, economia: 9000, rota: "GRU ⇄ JPA" });
    expect(r.semValorPago).toBe(1);
    expect(r.totais).toMatchObject({ n: 1, pago: 101000, menor: 95000, diferenca: 6000, acimaDoMenor: 1, economia: 9000 });
    expect(r.porMes).toEqual([expect.objectContaining({ mes: "2026-09", rotulo: "set/26", economiaAcumulada: 9000 })]);
    expect(r.mesAtual.n).toBe(0);
    expect(r.porQuem[0]).toMatchObject({ nome: "Camila Duarte", n: 1 });
  });
});

describe("Custos ocultos", () => {
  it("volta a partir das 18h custa uma diária; pinga-pinga contra duas pernas típicas", () => {
    const ps = [
      passagem({ horaDaVolta: "18:40", eventId: "e1" }), passagem({ horaDaVolta: "21:00", eventId: "e2", eventName: "Outro" }), passagem({ horaDaVolta: "17:59" }),
      passagem({ idaEVolta: false, valor: 40000, dataVolta: null, horaDaVolta: null }), passagem({ idaEVolta: false, valor: 50000, dataVolta: null, horaDaVolta: null }),
      passagem({ idaEVolta: false, valor: 60000, dataVolta: null, horaDaVolta: null }),
      passagem({ idaEVolta: false, trechoDireto: true, valor: 45000, dataVolta: null, horaDaVolta: null }),
    ];
    const c = custosOcultos({ passagens: ps, diariaPorEvento: { e1: 30000 } });
    expect(c.voltasNoturnas).toMatchObject({ passagens: 2, custo: 60000, semDiaria: 1 });
    expect(c.pingaPinga).toMatchObject({ trechos: 1, pagoNosTrechos: 45000, pernaTipica: 50000, estimadoSeparado: 100000, economia: 55000 });
  });
});

describe("índice do pago", () => {
  it("usa o típico da BUSCA quando a rota tem consultas (a mesma régua das outras abas)", () => {
    const consultas = [consulta({ preco: 100000 }), consulta({ preco: 100000 }), consulta({ preco: 100000 })];
    const ps: PassagemDaBusca[] = [passagem({ ticketId: "t-a", valor: 130000 })];
    expect(indicesDasPassagens(ps, consultas).get("t-a")).toBeCloseTo(1.3);
    expect(indicesDasPassagens(ps).get("t-a")).toBeUndefined();
  });
});
