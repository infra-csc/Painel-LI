import { describe, expect, it } from "vitest";
import {
  analisarPassagens, chaveDaCompanhia, diaDaSemana, diaISO, diasEntre, lugarDaRota, nomeDaCompanhia,
  periodoPadrao, somarMeses, MIN_PASSAGENS_POR_DIA, type PassagemParaAnalise,
} from "./analise-de-passagens";

let seq = 0;
function passagem(p: Partial<PassagemParaAnalise> = {}): PassagemParaAnalise {
  seq += 1;
  return {
    ticketId: `t${seq}`,
    teamInclusionId: `v${seq}`,
    eventId: "ev-a",
    eventName: "Maratona A",
    eventStartDate: "2026-10-10",
    pessoaId: `p${seq}`,
    arquivada: false,
    valor: 100_000,
    bagagem: null,
    dataCompra: "2026-09-20",
    dataIda: "2026-10-09",
    dataVolta: "2026-10-12",
    companhia: "LATAM",
    transporte: "aereo",
    origem: "GRU",
    destino: "SSA",
    ...p,
  };
}

// 2026-10-05 é segunda; 2026-10-09 sexta; 2026-10-11 domingo.
const SEG = "2026-10-05", TER = "2026-10-06", SEX = "2026-10-09", DOM = "2026-10-11";

describe("datas como texto, sem fuso", () => {
  it("dia da semana sai do calendário", () => {
    expect(diaDaSemana(SEG)).toBe(1);
    expect(diaDaSemana(SEX)).toBe(5);
    expect(diaDaSemana(DOM)).toBe(0);
  });
  it("aceita timestamp e recusa data impossível", () => {
    expect(diaISO("2026-10-09T03:00:00.000Z")).toBe("2026-10-09");
    expect(diaISO("2026-02-30")).toBeNull();
    expect(diaISO("")).toBeNull();
    expect(diaISO(null)).toBeNull();
  });
  it("dias entre e meses", () => {
    expect(diasEntre("2026-09-30", "2026-10-09")).toBe(9);
    expect(diasEntre("2026-10-09", "2026-10-01")).toBe(-8);
    expect(somarMeses("2026-05-31", -3)).toBe("2026-02-28");
    expect(periodoPadrao("2026-10-07")).toEqual({ de: "2026-07-07", ate: null });
  });
});

describe("normalização", () => {
  it("companhia: LATAM, 'latam ', 'Latam Airlines' e TAM são a mesma", () => {
    expect(chaveDaCompanhia("LATAM")).toBe("LATAM");
    expect(chaveDaCompanhia("latam ")).toBe("LATAM");
    expect(chaveDaCompanhia("Latam Airlines Brasil")).toBe("LATAM");
    expect(chaveDaCompanhia("TAM")).toBe("LATAM");
    expect(chaveDaCompanhia("Gol Linhas Aéreas")).toBe("GOL");
    expect(chaveDaCompanhia("azul")).toBe("AZUL");
    expect(chaveDaCompanhia("  ")).toBe("");
    expect(chaveDaCompanhia("Viação Cometa")).toBe("VIACAO COMETA");
    expect(nomeDaCompanhia("AZUL")).toBe("Azul");
    expect(nomeDaCompanhia("")).toBe("Sem companhia");
    expect(nomeDaCompanhia("VIACAO COMETA", " Viação  Cometa")).toBe("Viação Cometa");
  });
  it("rota: aeroporto em maiúsculas; cidade sem acento/caixa; endereço fica com a cidade", () => {
    expect(lugarDaRota("gru")).toEqual({ chave: "GRU", nome: "GRU" });
    expect(lugarDaRota("São Paulo - SP")?.chave).toBe("sao paulo sp");
    expect(lugarDaRota("sao paulo/SP")?.chave).toBe("sao paulo sp");
    expect(lugarDaRota("Farol da Barra, Salvador - BA")).toEqual({ chave: "salvador ba", nome: "Salvador - BA" });
    expect(lugarDaRota("")).toBeNull();
  });
});

describe("analisarPassagens", () => {
  it("totais: gasto = passagem + bagagem; sem valor/sem data contados à parte", () => {
    const r = analisarPassagens([
      passagem({ valor: 100_000, bagagem: 15_000 }),
      passagem({ valor: 50_000 }),
      passagem({ valor: null, dataCompra: null }),
      passagem({ valor: 0, dataIda: null }),
    ], []);
    expect(r.totais.passagens).toBe(4);
    expect(r.totais.comValor).toBe(2);
    expect(r.totais.semValor).toBe(2);
    expect(r.totais.semDataCompra).toBe(1);
    expect(r.totais.semDataIda).toBe(1);
    expect(r.totais.totalPassagem).toBe(150_000);
    expect(r.totais.totalBagagem).toBe(15_000);
    expect(r.totais.gasto).toBe(165_000);
    expect(r.totais.media).toBe(75_000); // só passagem, só quem tem valor
    expect(r.totais.eventos).toBe(1);
    expect(r.bagagem).toEqual({ passagens: 1, total: 15_000 });
  });

  it("dia da semana da ida: mais caro e mais barato só entre dias com o mínimo de passagens", () => {
    const lista = [
      // Sexta: 3 passagens, média 1.200
      ...[1_100_00, 1_200_00, 1_300_00].map((valor) => passagem({ dataIda: SEX, valor })),
      // Terça: 3 passagens, média 600
      ...[500_00, 600_00, 700_00].map((valor) => passagem({ dataIda: TER, valor })),
      // Segunda: 3 passagens, média 800
      ...[800_00, 800_00, 800_00].map((valor) => passagem({ dataIda: SEG, valor })),
      // Domingo: 1 passagem só, carísssima — não pode virar "mais caro".
      passagem({ dataIda: DOM, valor: 5_000_00 }),
    ];
    const r = analisarPassagens(lista, []);
    expect(MIN_PASSAGENS_POR_DIA).toBe(3);
    expect(r.diasDaIda.map((d) => d.curto)).toEqual(["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]);
    const dia = (c: string) => r.diasDaIda.find((d) => d.curto === c)!;
    expect(dia("Sex")).toMatchObject({ comValor: 3, media: 1_200_00, destaque: "caro", comparavel: true });
    expect(dia("Ter")).toMatchObject({ comValor: 3, media: 600_00, destaque: "barato" });
    expect(dia("Seg").destaque).toBeNull();
    expect(dia("Dom")).toMatchObject({ comValor: 1, comparavel: false, destaque: null, media: 5_000_00 });
    expect(dia("Qua")).toMatchObject({ passagens: 0, media: null, destaque: null });
  });

  it("volta usa a data da volta; com um só dia comparável não marca nada", () => {
    const r = analisarPassagens([1, 2, 3].map(() => passagem({ dataVolta: DOM })), []);
    expect(r.diasDaVolta.find((d) => d.curto === "Dom")).toMatchObject({ passagens: 3, destaque: null });
  });

  it("por evento: total, pessoas distintas (só quem viajou), por pessoa e trocas", () => {
    const r = analisarPassagens([
      passagem({ eventId: "ev-a", eventName: "Maratona A", pessoaId: "ana", valor: 100_000 }),
      // Ida e volta em linhas separadas: a mesma pessoa conta uma vez.
      passagem({ eventId: "ev-a", eventName: "Maratona A", pessoaId: "ana", valor: 80_000 }),
      passagem({ eventId: "ev-a", eventName: "Maratona A", pessoaId: "bia", valor: 60_000, bagagem: 20_000 }),
      // Histórico de troca: custo fica, pessoa não conta.
      passagem({ eventId: "ev-a", eventName: "Maratona A", pessoaId: "caio", valor: 40_000, arquivada: true }),
      passagem({ eventId: "ev-b", eventName: "Corrida B", pessoaId: "dani", valor: 90_000 }),
    ], []);
    expect(r.porEvento.map((e) => e.nome)).toEqual(["Maratona A", "Corrida B"]);
    const a = r.porEvento[0];
    expect(a).toMatchObject({ passagens: 4, gasto: 300_000, pessoas: 2, porPessoa: 150_000, trocas: 1 });
    expect(r.porEvento[1]).toMatchObject({ gasto: 90_000, pessoas: 1, porPessoa: 90_000 });
    expect(r.trocas).toEqual({ passagens: 1, gasto: 40_000 });
  });

  it("antecedência em faixas, com % abaixo de 14 dias; compra depois da ida fica de fora", () => {
    const ida = "2026-10-30";
    const r = analisarPassagens([
      passagem({ dataIda: ida, dataCompra: "2026-10-27", valor: 150_000 }), // 3 dias
      passagem({ dataIda: ida, dataCompra: "2026-10-20", valor: 120_000 }), // 10
      passagem({ dataIda: ida, dataCompra: "2026-10-16", valor: 110_000 }), // 14 → faixa 7–14, mas NÃO "< 14"
      passagem({ dataIda: ida, dataCompra: "2026-10-05", valor: 90_000 }),  // 25
      passagem({ dataIda: ida, dataCompra: "2026-09-15", valor: 70_000 }),  // 45
      passagem({ dataIda: ida, dataCompra: "2026-07-01", valor: 65_000 }),  // 121
      passagem({ dataIda: ida, dataCompra: "2026-11-02", valor: 65_000 }),  // depois da ida
      passagem({ dataIda: ida, dataCompra: null }),
    ], []);
    const f = Object.fromEntries(r.antecedencia.faixas.map((x) => [x.chave, x]));
    expect(f["0-6"]).toMatchObject({ passagens: 1, media: 150_000 });
    expect(f["7-14"]).toMatchObject({ passagens: 2, media: 115_000 });
    expect(f["15-29"].passagens).toBe(1);
    expect(f["30-59"].passagens).toBe(1);
    expect(f["60+"].passagens).toBe(1);
    expect(r.antecedencia.base).toBe(6);
    expect(r.antecedencia.menosDe14).toBe(2);
    expect(r.antecedencia.pctMenosDe14).toBe(33);
    expect(r.totais.compraDepoisDaIda).toBe(1);
    // Nenhuma faixa tem 3 com valor: nada é marcado.
    expect(r.antecedencia.faixas.every((x) => x.destaque === null)).toBe(true);
  });

  it("rota, companhia e transporte normalizados", () => {
    const r = analisarPassagens([
      passagem({ origem: "gru", destino: "SSA", companhia: "LATAM", valor: 100_000 }),
      passagem({ origem: "GRU", destino: "ssa", companhia: "latam ", valor: 100_000 }),
      passagem({ origem: "São Paulo - SP", destino: "Farol da Barra, Salvador - BA", companhia: "Gol", transporte: "rodoviario", valor: 30_000 }),
      passagem({ origem: "sao paulo/sp", destino: "Salvador - BA", companhia: null, transporte: null, valor: 20_000 }),
      passagem({ origem: null, destino: "SSA", valor: 10_000 }),
    ], []);
    expect(r.porRota[0]).toMatchObject({ chave: "GRU→SSA", nome: "GRU → SSA", passagens: 2, media: 100_000 });
    expect(r.porRota[1]).toMatchObject({ chave: "sao paulo sp→salvador ba", passagens: 2 });
    expect(r.porRota).toHaveLength(2); // sem origem não vira rota
    expect(r.porCompanhia.map((c) => [c.nome, c.passagens])).toEqual([["LATAM", 3], ["GOL", 1], ["Sem companhia", 1]]);
    expect(r.porTransporte.map((t) => [t.nome, t.passagens])).toEqual([["Aéreo", 3], ["Rodoviário", 1], ["Não informado", 1]]);
  });

  it("filtros: período pelo início do evento; evento, companhia e transporte; opções do período inteiro", () => {
    const lista = [
      passagem({ eventId: "ev-velho", eventName: "Velho", eventStartDate: "2026-01-10" }),
      passagem({ eventId: "ev-a", eventName: "A", eventStartDate: "2026-10-10", companhia: "LATAM" }),
      passagem({ eventId: "ev-a", eventName: "A", eventStartDate: "2026-10-10", companhia: "Azul" }),
      passagem({ eventId: "ev-b", eventName: "B", eventStartDate: "2026-12-01", companhia: "latam", transporte: "van" }),
      passagem({ eventId: "ev-sem-data", eventName: "Sem data", eventStartDate: null }),
    ];
    const periodo = analisarPassagens(lista, [], { de: "2026-07-07" });
    expect(periodo.totais.passagens).toBe(3);
    expect(periodo.opcoes.eventos.map((e) => [e.nome, e.n])).toEqual([["A", 2], ["B", 1]]);
    expect(periodo.opcoes.companhias.map((c) => [c.id, c.n])).toEqual([["LATAM", 2], ["AZUL", 1]]);

    const latam = analisarPassagens(lista, [], { de: "2026-07-07", companhia: "LATAM" });
    expect(latam.totais.passagens).toBe(2);
    // As opções não encolhem com o próprio filtro.
    expect(latam.opcoes.companhias).toHaveLength(2);

    expect(analisarPassagens(lista, [], { de: "2026-07-07", ate: "2026-10-31", eventId: "ev-a" }).totais.passagens).toBe(2);
    expect(analisarPassagens(lista, [], { transporte: "van" }).totais.passagens).toBe(1);
    // Sem período, entra tudo (inclusive evento sem data).
    expect(analisarPassagens(lista, []).totais.passagens).toBe(5);
  });

  it("remarcações: avisos pendentes e resolvidos, recortados por evento", () => {
    const avisos = [
      { eventId: "ev-a", resolvido: false },
      { eventId: "ev-a", resolvido: true },
      { eventId: "ev-b", resolvido: true },
    ];
    expect(analisarPassagens([], avisos).remarcacoes).toEqual({ total: 3, pendentes: 1, resolvidos: 2 });
    expect(analisarPassagens([], avisos, { eventId: "ev-a" }).remarcacoes).toEqual({ total: 2, pendentes: 1, resolvidos: 1 });
  });

  it("sem passagens: tudo zerado, nada de NaN", () => {
    const r = analisarPassagens([], []);
    expect(r.totais).toMatchObject({ passagens: 0, gasto: 0, media: null, eventos: 0 });
    expect(r.antecedencia.pctMenosDe14).toBeNull();
    expect(r.diasDaIda.every((d) => d.media === null && d.destaque === null)).toBe(true);
    expect(r.porEvento).toEqual([]);
    expect(JSON.stringify(r)).not.toContain("NaN");
  });

  it("por mês da ida, em ordem", () => {
    const r = analisarPassagens([
      passagem({ dataIda: "2026-11-02", valor: 100_000 }),
      passagem({ dataIda: "2026-09-02", valor: 50_000 }),
      passagem({ dataIda: "2026-09-20", valor: 70_000 }),
    ], []);
    expect(r.porMes.map((m) => [m.mes, m.rotulo, m.passagens, m.media])).toEqual([
      ["2026-09", "set/26", 2, 60_000],
      ["2026-11", "nov/26", 1, 100_000],
    ]);
  });
});
