import { describe, expect, it } from "vitest";
import {
  avaliarOpcao,
  chaveDaConsulta,
  consultasPrevistas,
  faixaDeHorario,
  faixaEmTexto,
  filtroDaFaixa,
  ordenarOpcoes,
  planejarBusca,
  variantesDeData,
  type EventoDaBusca,
  type ItinerarioDeVoo,
  type VagaDaBusca,
} from "./busca-de-passagens";
import { aeroportosDaCidade, chaveDaCidade } from "./aeroportos-do-brasil";

const HOJE = "2026-10-09";

describe("faixaDeHorario — horário sugerido em texto livre", () => {
  it.each([
    ["8-14h", "chegar_ate", { desde: 480, ate: 840 }],
    ["8h às 14h", "chegar_ate", { desde: 480, ate: 840 }],
    ["entre 8 e 14h", "chegar_ate", { desde: 480, ate: 840 }],
    ["até 14h", "chegar_ate", { desde: null, ate: 840 }],
    ["antes das 13:30", "sair_apos", { desde: null, ate: 810 }],
    ["20h+", "sair_apos", { desde: 1200, ate: null }],
    ["depois das 20h", "chegar_ate", { desde: 1200, ate: null }],
    ["a partir das 18h30", "chegar_ate", { desde: 1110, ate: null }],
    ["após 19h", "chegar_ate", { desde: 1140, ate: null }],
    ["9h", "chegar_ate", { desde: null, ate: 540 }],
    ["9h", "sair_apos", { desde: 540, ate: null }],
    ["10:15", "chegar_ate", { desde: null, ate: 615 }],
    ["manhã", "chegar_ate", { desde: 300, ate: 720 }],
    ["final da tarde", "sair_apos", { desde: 900, ate: 1080 }],
  ] as const)("%s (%s)", (texto, sentido, esperado) => {
    expect(faixaDeHorario(texto, sentido)).toEqual(esperado);
  });

  it.each(["", "Não informado", "a combinar", "22-2h", "25h"])("não interpretável → sem filtro: %j", (texto) => {
    expect(faixaDeHorario(texto, "chegar_ate")).toBeNull();
  });

  it("vira o filtro do fornecedor em horas inteiras, arredondando para fora", () => {
    expect(filtroDaFaixa({ desde: 480, ate: 840 }, "chegada")).toEqual({ chegadaDe: 8, chegadaAte: 14 });
    expect(filtroDaFaixa({ desde: 615, ate: 810 }, "chegada")).toEqual({ chegadaDe: 10, chegadaAte: 13 });
    expect(filtroDaFaixa({ desde: 1200, ate: null }, "partida")).toEqual({ partidaDe: 20 });
    expect(filtroDaFaixa(null, "partida")).toBeNull();
    expect(faixaEmTexto({ desde: null, ate: 840 })).toBe("até 14h");
    expect(faixaEmTexto({ desde: 1110, ate: null })).toBe("a partir de 18h30");
  });
});

describe("aeroportos da cidade", () => {
  it("lê o texto livre do \"Sai de\" e põe o principal primeiro", () => {
    expect(chaveDaCidade("São Paulo - SP")).toBe("sao paulo");
    expect(chaveDaCidade("Sao Paulo/SP")).toBe("sao paulo");
    expect(aeroportosDaCidade("São Paulo - SP")).toEqual(["GRU", "CGH", "VCP"]);
    expect(aeroportosDaCidade("rio de janeiro")).toEqual(["GIG", "SDU"]);
    expect(aeroportosDaCidade("Belo Horizonte, MG")).toEqual(["CNF", "PLU"]);
    expect(aeroportosDaCidade("gru")).toEqual(["GRU"]);
    expect(aeroportosDaCidade("Xique-Xique")).toEqual([]);
  });
});

const eventos = (lista: EventoDaBusca[]) => new Map(lista.map((e) => [e.id, e]));
const JPA: EventoDaBusca = { id: "ev-jpa", name: "Makai João Pessoa", location: "Praia de Tambaú, João Pessoa - PB", aeroportoIata: "JPA" };
const AJU: EventoDaBusca = { id: "ev-aju", name: "Night Run Aracaju", location: "Orla de Atalaia, Aracaju - SE", aeroportoIata: "AJU" };
const vaga = (id: string, extra: Partial<VagaDaBusca> = {}): VagaDaBusca => ({
  id, eventId: "ev-jpa", cidadeDeSaida: "São Paulo - SP", needsTicket: true,
  flightDepartureDate: "2026-11-12", flightArrivalSuggestedTime: "até 14h",
  flightReturnDate: "2026-11-16", flightReturnSuggestedTime: "18h+",
  ...extra,
});

describe("planejarBusca — agrupamento e pernas", () => {
  it("3 vagas de São Paulo para o mesmo evento e datas = 1 consulta de ida e volta", () => {
    const plano = planejarBusca({ vagas: [vaga("a"), vaga("b"), vaga("c")], eventos: eventos([JPA]), hoje: HOJE });
    expect(plano.faltando).toEqual([]);
    expect(plano.rotas).toHaveLength(1);
    const r = plano.rotas[0];
    expect(r).toMatchObject({ perna: "ida_e_volta", origem: "GRU", destino: "JPA", dataIda: "2026-11-12", dataVolta: "2026-11-16", maxParadas: 1 });
    expect(r.horarioIda).toEqual({ chegadaAte: 14 });
    expect(r.horarioVolta).toEqual({ partidaDe: 18 });
    expect(r.vagas.map((v) => v.vagaId)).toEqual(["a", "b", "c"]);
    expect(r.alternativasDeCasa).toEqual(["CGH", "VCP"]);
  });

  it("filtro diferente, data diferente ou cidade diferente = consultas separadas", () => {
    const plano = planejarBusca({
      vagas: [vaga("a"), vaga("b", { flightArrivalSuggestedTime: "8-12h" }), vaga("c", { flightDepartureDate: "2026-11-11" }), vaga("d", { cidadeDeSaida: "Rio de Janeiro - RJ" })],
      eventos: eventos([JPA]), hoje: HOJE,
    });
    expect(plano.rotas).toHaveLength(4);
    expect(plano.rotas.find((r) => r.vagas[0].vagaId === "d")?.origem).toBe("GIG");
  });

  it("\"até 14h\" e \"até 14:30\" pedem a mesma coisa ao fornecedor: uma consulta, janela mais estreita", () => {
    const plano = planejarBusca({ vagas: [vaga("a", { flightArrivalSuggestedTime: "até 14:30" }), vaga("b")], eventos: eventos([JPA]), hoje: HOJE });
    expect(plano.rotas).toHaveLength(1);
    expect(plano.rotas[0].faixaIda).toEqual({ desde: null, ate: 840 });
  });

  it("só ida e só volta consultam só a perna necessária", () => {
    const plano = planejarBusca({
      vagas: [vaga("ida", { trechosSugeridos: "so_ida", flightReturnDate: null }), vaga("volta", { trechosSugeridos: "so_volta", flightDepartureDate: null })],
      eventos: eventos([JPA]), hoje: HOJE,
    });
    const ida = plano.rotas.find((r) => r.perna === "ida")!;
    const volta = plano.rotas.find((r) => r.perna === "volta")!;
    expect(ida).toMatchObject({ origem: "GRU", destino: "JPA", dataIda: "2026-11-12", dataVolta: null });
    expect(volta).toMatchObject({ origem: "JPA", destino: "GRU", dataIda: "2026-11-16", horarioIda: { partidaDe: 18 } });
  });

  it("pinga-pinga: a ida sai do aeroporto do evento anterior; a volta continua indo para casa", () => {
    const plano = planejarBusca({
      vagas: [vaga("alonso", { idaVemDoEventoId: "ev-aju" })],
      eventos: eventos([JPA, AJU]), hoje: HOJE,
    });
    expect(plano.rotas.map((r) => [r.perna, r.origem, r.destino, r.trechoDireto])).toEqual([
      ["ida", "AJU", "JPA", true],
      ["volta", "JPA", "GRU", false],
    ]);
  });

  it("\"Buscar preços do trecho direto\": só a ida, da cidade do evento anterior", () => {
    const plano = planejarBusca({
      vagas: [vaga("alonso")], eventos: eventos([JPA, AJU]), hoje: HOJE,
      ajustes: { alonso: { idaDoEventoId: "ev-aju", somente: "ida" } },
    });
    expect(plano.rotas).toHaveLength(1);
    expect(plano.rotas[0]).toMatchObject({ perna: "ida", origem: "AJU", destino: "JPA", trechoDireto: true });
  });

  it("segue direto para outro evento = sem volta; ida por ônibus = só a volta", () => {
    const plano = planejarBusca({
      vagas: [vaga("segue", { voltaSegueParaEventoId: "ev-x" }), vaga("onibus", { transportModeIda: "onibus" })],
      eventos: eventos([JPA]), hoje: HOJE,
    });
    expect(plano.rotas.map((r) => `${r.perna}:${r.vagas[0].vagaId}`).sort()).toEqual(["ida:segue", "volta:onibus"]);
  });

  it("dado faltando: a vaga não entra e a tela recebe o que falta (nada é consultado pela metade)", () => {
    const semAero = { ...JPA, aeroportoIata: null };
    const plano = planejarBusca({
      vagas: [
        vaga("sem-data", { flightDepartureDate: null }),
        vaga("sem-cidade", { cidadeDeSaida: "" }),
        vaga("cidade-estranha", { cidadeDeSaida: "Xique-Xique - BA" }),
        vaga("passada", { flightDepartureDate: "2026-09-01" }),
      ],
      eventos: eventos([JPA]), hoje: HOJE,
    });
    expect(plano.rotas).toEqual([]);
    expect(plano.faltando.map((f) => `${f.vagaId}:${f.tipo}`)).toEqual([
      "sem-data:sem_data_ida", "sem-cidade:sem_cidade_de_saida", "cidade-estranha:cidade_sem_aeroporto", "passada:data_passada",
    ]);
    const evento = planejarBusca({ vagas: [vaga("a"), vaga("b")], eventos: eventos([semAero]), hoje: HOJE });
    expect(evento.rotas).toEqual([]);
    expect(evento.faltando[0]).toMatchObject({ tipo: "evento_sem_aeroporto", eventId: "ev-jpa", sugestoes: ["JPA"] });
    expect(evento.faltando[1].sugestoes).toBeUndefined();
  });

  it("ajustes da tela: aeroporto de casa trocado, data informada e 2 conexões mudam a chave", () => {
    const base = planejarBusca({ vagas: [vaga("a")], eventos: eventos([JPA]), hoje: HOJE }).rotas[0];
    const ajustada = planejarBusca({
      vagas: [vaga("a", { flightDepartureDate: null })], eventos: eventos([JPA]), hoje: HOJE,
      ajustes: { a: { aeroportoDeCasa: "cgh", dataIda: "2026-11-12", maxParadas: 2 } },
    }).rotas[0];
    expect(ajustada).toMatchObject({ origem: "CGH", maxParadas: 2, dataIda: "2026-11-12" });
    expect(ajustada.alternativasDeCasa).toEqual(["GRU", "VCP"]);
    expect(ajustada.chave).not.toBe(base.chave);
  });

  it("cidade de saída no mesmo aeroporto do evento não consulta", () => {
    const sp: EventoDaBusca = { id: "ev-sp", name: "Maratona SP", location: "Ibirapuera, São Paulo - SP", aeroportoIata: "CGH" };
    const plano = planejarBusca({ vagas: [vaga("a", { eventId: "ev-sp" })], eventos: eventos([sp]), hoje: HOJE });
    expect(plano.faltando[0].tipo).toBe("mesmo_aeroporto");
  });
});

describe("chave do cache e consultas previstas", () => {
  it("a chave é o pedido normalizado (maiúsculas, filtros em horas)", () => {
    const c = { perna: "ida" as const, origem: "gru", destino: "jpa", dataIda: "2026-11-12", dataVolta: null, maxParadas: 1 as const, horarioIda: { chegadaAte: 14 }, horarioVolta: null };
    expect(chaveDaConsulta(c)).toBe("ida|GRU>JPA|2026-11-12|-|p1|,,,14|-");
    expect(chaveDaConsulta({ ...c, origem: "GRU", destino: "JPA" })).toBe(chaveDaConsulta(c));
  });

  it("conta só o que não está no cache (e cada chave uma vez)", () => {
    expect(consultasPrevistas(["a", "b", "c", "c"], new Set(["b"]))).toBe(2);
    expect(consultasPrevistas([], new Set())).toBe(0);
  });

  it("datas flexíveis: 2 consultas por rota, sem data que já passou", () => {
    const r = planejarBusca({ vagas: [vaga("a")], eventos: eventos([JPA]), hoje: HOJE }).rotas[0];
    const v = variantesDeData(r, HOJE);
    expect(v.map((x) => [x.consulta.dataIda, x.consulta.dataVolta, x.diarias])).toEqual([
      ["2026-11-11", "2026-11-16", 1],
      ["2026-11-12", "2026-11-17", 1],
    ]);
    expect(new Set(v.map((x) => x.chave)).size).toBe(2);
    const amanha = planejarBusca({ vagas: [vaga("b", { trechosSugeridos: "so_ida", flightDepartureDate: "2026-10-09" })], eventos: eventos([JPA]), hoje: HOJE }).rotas[0];
    expect(variantesDeData(amanha, HOJE).map((x) => x.consulta.dataIda)).toEqual(["2026-10-10"]);
  });
});

const seg = (cia: string, num: string, o: string, d: string, partida: string, chegada: string) =>
  ({ companhia: cia, numero: num, origem: o, destino: d, partida, chegada });
const itin = (id: string, preco: number, pernas: ItinerarioDeVoo["pernas"], extra: Partial<ItinerarioDeVoo> = {}): ItinerarioDeVoo =>
  ({ id, precoCentavos: preco, moeda: "BRL", pernas, ...extra });

describe("custo total e ordenação", () => {
  const rotaVolta = { perna: "volta" as const, faixaIda: null, faixaVolta: { desde: 17 * 60, ate: null } };

  it("volta a partir das 18h ganha +1 diária e soma o valor da diária no custo", () => {
    const tarde = itin("t", 50000, [{ companhia: "LA", duracaoMin: 200, segmentos: [seg("LA", "3001", "JPA", "GRU", "2026-11-16T17:10", "2026-11-16T20:30")] }]);
    const noite = itin("n", 42000, [{ companhia: "G3", duracaoMin: 200, segmentos: [seg("G3", "1500", "JPA", "GRU", "2026-11-16T18:00", "2026-11-16T21:20")] }]);
    const a = avaliarOpcao(noite, rotaVolta, { diariaCentavos: 25000 });
    expect(a.diariaExtraNaVolta).toBe(true);
    expect(a.custoTotalCentavos).toBe(67000);
    expect(a.selos.map((s) => s.texto)).toContain("+1 diária");
    // O voo de R$ 420 sai às 18h e fica mais caro que o de R$ 500 às 17h10.
    expect(ordenarOpcoes([noite, tarde], rotaVolta, { diariaCentavos: 25000 }).map((o) => o.itinerario.id)).toEqual(["t", "n"]);
    // Sem valor de diária conhecido: só o selo, o custo é o preço.
    const semValor = avaliarOpcao(noite, rotaVolta);
    expect(semValor.custoTotalCentavos).toBe(42000);
    expect(semValor.selos.map((s) => s.tipo)).toContain("diaria_extra");
  });

  it("voo absurdo (2 conexões, 17 h) vai para o fim com selo, mesmo mais barato", () => {
    const rotaIda = { perna: "ida" as const, faixaIda: { desde: null, ate: 14 * 60 }, faixaVolta: null };
    const direto = itin("d", 90000, [{ companhia: "AD", duracaoMin: 200, segmentos: [seg("AD", "4100", "GRU", "JPA", "2026-11-12T08:00", "2026-11-12T11:20")] }]);
    const absurdo = itin("x", 40000, [{ companhia: "AD", duracaoMin: 17 * 60, segmentos: [
      seg("AD", "1", "GRU", "BSB", "2026-11-11T21:00", "2026-11-11T22:40"),
      seg("AD", "2", "BSB", "REC", "2026-11-12T06:00", "2026-11-12T08:40"),
      seg("AD", "3", "REC", "JPA", "2026-11-12T13:00", "2026-11-12T13:50"),
    ] }]);
    const atrasado = itin("l", 60000, [{ companhia: "G3", duracaoMin: 200, segmentos: [seg("G3", "9", "GRU", "JPA", "2026-11-12T12:00", "2026-11-12T15:20")] }]);
    const ordem = ordenarOpcoes([absurdo, atrasado, direto], rotaIda);
    expect(ordem.map((o) => o.itinerario.id)).toEqual(["d", "l", "x"]);
    expect(ordem[0].selos.map((s) => s.tipo)).toEqual(["menor_custo", "no_horario"]);
    expect(ordem[1].selos.map((s) => s.tipo)).toContain("fora_do_horario");
    expect(ordem[2].absurda).toBe(true);
    expect(ordem[2].selos.map((s) => s.tipo)).toEqual(expect.arrayContaining(["viagem_longa", "conexao_longa"]));
  });

  it("ida e volta: diárias da data flexível somam com a da volta noturna", () => {
    const rota = { perna: "ida_e_volta" as const, faixaIda: null, faixaVolta: null };
    const rt = itin("rt", 100000, [
      { companhia: "LA", duracaoMin: 200, segmentos: [seg("LA", "1", "GRU", "JPA", "2026-11-11T08:00", "2026-11-11T11:20")] },
      { companhia: "LA", duracaoMin: 200, segmentos: [seg("LA", "2", "JPA", "GRU", "2026-11-16T19:00", "2026-11-16T22:20")] },
    ]);
    const o = avaliarOpcao(rt, rota, { diariaCentavos: 30000, diariasDaData: 1 });
    expect(o.diarias).toBe(2);
    expect(o.custoTotalCentavos).toBe(160000);
  });
});
