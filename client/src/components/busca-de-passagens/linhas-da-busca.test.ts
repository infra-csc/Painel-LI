import { describe, expect, it } from "vitest";
import { eventoFake, vagaFake } from "@/test/fixtures-dominio";
import type { Collaborator, Ticket } from "@shared/schema";
import { eventosAConfirmar, montarLinhas, passaNosFiltros, ordenarLinhas } from "./linhas-da-busca";
import { FILTROS_PADRAO, escreverUrl, lerUrl } from "./filtros-da-busca";
import { vooParaFormulario, centavosParaCampo } from "./voo-para-formulario";
import type { ItinerarioDeVoo } from "@shared/busca-de-passagens";

const HOJE = "2026-10-09";
const evJpa = eventoFake({ id: "ev-jpa", name: "Makai João Pessoa", location: "Tambaú, João Pessoa - PB", aeroportoIata: "JPA", startDate: "2026-11-13", endDate: "2026-11-15" });
// Cidade que o mapa não reconhece: as escalações esperam o aeroporto (15/10).
const evSemAero = eventoFake({ id: "ev-x", name: "Night Run da Ilha", location: "Arena Multiuso", startDate: "2026-11-13", endDate: "2026-11-15" });
// Rio tem GIG e SDU: a busca usa GIG (principal) e a faixa pede a confirmação uma vez.
const evRio = eventoFake({ id: "ev-rio", name: "Desafio Petrobrás - Rio de Janeiro - Travessia - 2026", location: "Praia de Copacabana", startDate: "2026-11-13", endDate: "2026-11-15" });
// Teresina tem um aeroporto só: a busca já usa THE ("sugerido").
const evThe = eventoFake({ id: "ev-the", name: "Corrida Teresina", location: "TERESINA", startDate: "2026-11-13", endDate: "2026-11-15" });
// Evento que já terminou (fim ontem) e um que termina HOJE (ainda vale).
const evPassado = eventoFake({ id: "ev-passado", name: "Eco Run Rio 2025", location: "Rio de Janeiro - RJ", aeroportoIata: "GIG", startDate: "2025-10-05", endDate: "2026-10-08" });
const evHoje = eventoFake({ id: "ev-hoje", name: "Termina hoje", location: "Recife - PE", startDate: "2026-10-07", endDate: "2026-10-09" });
const viagem = { needsTicket: true, city: "São Paulo - SP", flightDepartureDate: "2026-11-12", flightArrivalSuggestedTime: "até 14h", flightReturnDate: "2026-11-16", flightReturnSuggestedTime: "18h+" };

function linhas(extra: { tickets?: Ticket[]; mais?: ReturnType<typeof vagaFake>[] } = {}) {
  const vagas = [
    ...(extra.mais ?? []),
    vagaFake({ id: "a", inclusionNumber: 10, eventId: "ev-jpa", ...viagem }),
    vagaFake({ id: "b", inclusionNumber: 11, eventId: "ev-x", ...viagem }),
    vagaFake({ id: "c", inclusionNumber: 12, eventId: "ev-jpa", ...viagem, transportModeIda: "onibus", transportModeVolta: "onibus" }),
    vagaFake({ id: "d", inclusionNumber: 13, eventId: "ev-jpa", ...viagem, trechosSugeridos: "so_ida", flightReturnDate: null }),
  ];
  return montarLinhas({
    vagas,
    eventById: new Map([evJpa, evSemAero, evRio, evThe, evPassado, evHoje].map((e) => [e.id, e])),
    collaboratorById: new Map<string, Collaborator>(),
    ticketByInclusion: new Map((extra.tickets ?? []).map((t) => [t.teamInclusionId, t])),
    nomeDoColaborador: () => "Ana Souza",
    nomeDaFuncao: () => "Montagem",
    ajustes: {},
    hoje: HOJE,
  });
}

describe("linhas da aba Buscar", () => {
  it("só escalações com trecho aéreo; cada uma com a rota que a busca vai usar e o que falta", () => {
    const l = linhas();
    expect(l.map((x) => x.vaga.id)).toEqual(["a", "b", "d"]);
    expect(l[0]).toMatchObject({ trecho: "ida_e_volta", dataIda: "2026-11-12", dataVolta: "2026-11-16", chegarAte: "até 14h", sairApos: "18h+" });
    expect(l[0].rotas[0]).toMatchObject({ origem: "GRU", destino: "JPA", perna: "ida_e_volta" });
    expect(l[1].faltas.map((f) => f.tipo)).toEqual(["evento_sem_aeroporto"]);
    expect(l[2]).toMatchObject({ trecho: "so_ida", dataVolta: null });
  });

  it("perna registrada como carro/van (16/10) não é aérea: toda terrestre some; só a ida terrestre vira 'só volta'", () => {
    const montar = (terrestres: Array<[string, Array<{ trecho: "ida" | "volta"; modo: "carro" | "van" }>]>) => montarLinhas({
      vagas: [vagaFake({ id: "t1", eventId: "ev-jpa", ...viagem })],
      eventById: new Map([[evJpa.id, evJpa]]),
      collaboratorById: new Map<string, Collaborator>(),
      ticketByInclusion: new Map(),
      nomeDoColaborador: () => "Ana Souza", nomeDaFuncao: () => "Montagem", ajustes: {}, hoje: HOJE,
      terrestreByInclusion: new Map(terrestres.map(([id, l]) => [id, l.map((t) => ({ ...t, empresa: null, valorCentavos: 1 }))])),
    });
    expect(montar([]).map((l) => l.trecho)).toEqual(["ida_e_volta"]);
    expect(montar([["t1", [{ trecho: "ida", modo: "van" }, { trecho: "volta", modo: "van" }]]])).toEqual([]);
    expect(montar([["t1", [{ trecho: "ida", modo: "carro" }]]]).map((l) => l.trecho)).toEqual(["so_volta"]);
  });

  it("sai da mesma região do evento (16/10): sem voo, fora da lista — a não ser que já tenha passagem", () => {
    const sp = eventoFake({ id: "ev-sp", name: "Maratona SP", location: "Ibirapuera, São Paulo - SP", startDate: "2026-11-13", endDate: "2026-11-15" });
    const campinas = eventoFake({ id: "ev-vcp", name: "Corrida Campinas", location: "Campinas - SP", startDate: "2026-11-13", endDate: "2026-11-15" });
    const montar = (tickets: Ticket[] = []) => montarLinhas({
      vagas: [vagaFake({ id: "s1", eventId: "ev-sp", ...viagem }), vagaFake({ id: "s2", eventId: "ev-vcp", ...viagem })],
      eventById: new Map([sp, campinas].map((e) => [e.id, e])),
      collaboratorById: new Map<string, Collaborator>(),
      ticketByInclusion: new Map(tickets.map((t) => [t.teamInclusionId, t])),
      nomeDoColaborador: () => "Ana Souza", nomeDaFuncao: () => "Montagem", ajustes: {}, hoje: HOJE,
    });
    expect(montar()).toEqual([]);
    const [s1] = montar([{ id: "t", teamInclusionId: "s1", value: 1000 } as Ticket]);
    expect(s1.faltas.map((f) => f.tipo)).toEqual(["mesmo_aeroporto"]);
  });

  it("passagem comprada usa as datas e o aeroporto dela e mostra o valor pago", () => {
    const t = { id: "t1", teamInclusionId: "a", value: 123400, actualDepartureDate: "2026-11-11", actualReturnDate: "2026-11-16", departureAirport: "CGH" } as Ticket;
    const [a] = linhas({ tickets: [t] });
    expect(a).toMatchObject({ comprada: true, valorPagoCentavos: 123400, dataIda: "2026-11-11" });
    expect(a.rotas[0]).toMatchObject({ origem: "CGH", dataIda: "2026-11-11" });
  });

  it("filtros: situação, trecho, dado faltando, data da ida e busca por nome/#", () => {
    const t = { id: "t1", teamInclusionId: "a", value: 1000 } as Ticket;
    const l = linhas({ tickets: [t] });
    const ids = (f: Partial<typeof FILTROS_PADRAO>) => l.filter((x) => passaNosFiltros(x, { ...FILTROS_PADRAO, ...f })).map((x) => x.vaga.id);
    expect(ids({})).toEqual(["b", "d"]);
    expect(ids({ situacao: "compradas" })).toEqual(["a"]);
    expect(ids({ situacao: "todas", trecho: "so_ida" })).toEqual(["d"]);
    expect(ids({ situacao: "todas", falta: "sem_aeroporto" })).toEqual(["b"]);
    expect(ids({ situacao: "todas", falta: "prontas" })).toEqual(["a", "d"]);
    expect(ids({ situacao: "todas", de: "2026-11-17" })).toEqual([]); // nem a ida nem a volta no período (28/10)
    expect(ids({ situacao: "todas", q: "#11" })).toEqual(["b"]);
    expect(ids({ situacao: "todas", destino: "JPA" })).toEqual(["a", "d"]);
    expect(ordenarLinhas(l).map((x) => x.vaga.id)).toEqual(["a", "b", "d"]);
  });

  it("período (28/10, dono): a vaga entra se a IDA ou a VOLTA cair no período, limites inclusivos — “só volta” não some", () => {
    const l = linhas({ mais: [vagaFake({ id: "v", inclusionNumber: 9, eventId: "ev-jpa", ...viagem, trechosSugeridos: "so_volta", flightDepartureDate: null })] });
    expect(l.find((x) => x.vaga.id === "v")).toMatchObject({ trecho: "so_volta", dataIda: null, dataVolta: "2026-11-16" });
    const ids = (de: string, ate: string) => l.filter((x) => passaNosFiltros(x, { ...FILTROS_PADRAO, situacao: "todas", de, ate })).map((x) => x.vaga.id);
    // Só a volta (16/11) cai no período: a "só volta" e as de ida e volta entram; a "só ida" (12/11) não.
    expect(ids("2026-11-16", "2026-11-16")).toEqual(["v", "a", "b"]);
    // Só a ida (12/11), limite inclusivo nas duas pontas.
    expect(ids("2026-11-12", "2026-11-12")).toEqual(["a", "b", "d"]);
    // Entre a ida e a volta, sem nenhuma das duas no período: ninguém.
    expect(ids("2026-11-13", "2026-11-15")).toEqual([]);
    // Só "a partir de" / só "até".
    expect(ids("2026-11-14", "")).toEqual(["v", "a", "b"]);
    expect(ids("", "2026-11-12")).toEqual(["a", "b", "d"]);
  });

  it("busca sem acento/caixa: “joao pessoa” acha “Makai João Pessoa” (28/10)", () => {
    const l = linhas();
    const ids = (q: string) => l.filter((x) => passaNosFiltros(x, { ...FILTROS_PADRAO, situacao: "todas", q })).map((x) => x.vaga.id);
    expect(ids("joao pessoa")).toEqual(["a", "d"]);
    expect(ids("MONTAGEM")).toEqual(["a", "b", "d"]);
  });

  it("recorte de período (15/10): padrão = só eventos que terminam hoje ou depois; \"passados\" traz o histórico", () => {
    const comprada = { id: "t9", teamInclusionId: "p2", value: 5000 } as Ticket;
    const l = linhas({
      tickets: [comprada],
      mais: [
        vagaFake({ id: "p1", inclusionNumber: 1, eventId: "ev-passado", ...viagem, flightDepartureDate: "2025-10-04", flightReturnDate: "2025-10-06" }),
        vagaFake({ id: "p2", inclusionNumber: 2, eventId: "ev-passado", ...viagem, flightDepartureDate: "2025-10-04", flightReturnDate: "2025-10-06" }),
        vagaFake({ id: "h1", inclusionNumber: 3, eventId: "ev-hoje", ...viagem, flightDepartureDate: "2026-10-06", flightReturnDate: "2026-10-10" }),
      ],
    });
    expect(l.find((x) => x.vaga.id === "p1")?.eventoPassou).toBe(true);
    expect(l.find((x) => x.vaga.id === "h1")?.eventoPassou).toBe(false);
    const ids = (f: Partial<typeof FILTROS_PADRAO>) => l.filter((x) => passaNosFiltros(x, { ...FILTROS_PADRAO, ...f })).map((x) => x.vaga.id).sort();
    // Padrão: Pendentes de eventos futuros (o de hoje entra; o de ontem não).
    expect(ids({})).toEqual(["a", "b", "d", "h1"]);
    expect(ids({ situacao: "compradas" })).toEqual([]);
    expect(ids({ situacao: "todas" })).toEqual(["a", "b", "d", "h1"]);
    // Com passados: o histórico volta, nas três faixas.
    expect(ids({ passados: true })).toEqual(["a", "b", "d", "h1", "p1"]);
    expect(ids({ situacao: "compradas", passados: true })).toEqual(["p2"]);
    expect(ids({ situacao: "todas", passados: true })).toHaveLength(6);
  });

  it("aeroporto do evento: cidade reconhecida entra sugerida (pronta); vários aeroportos ou desconhecida vão para a faixa, uma vez por evento", () => {
    const l = linhas({
      mais: [
        vagaFake({ id: "t1", inclusionNumber: 21, eventId: "ev-the", ...viagem }),
        vagaFake({ id: "x2", inclusionNumber: 22, eventId: "ev-x", ...viagem, flightDepartureDate: "2026-11-10" }),
        vagaFake({ id: "r1", inclusionNumber: 23, eventId: "ev-rio", ...viagem }),
        vagaFake({ id: "r2", inclusionNumber: 24, eventId: "ev-rio", ...viagem }),
      ],
    });
    const t1 = l.find((x) => x.vaga.id === "t1")!;
    expect(t1.faltas).toEqual([]);
    expect(t1).toMatchObject({ aeroportoSugerido: "THE", aeroportosDaCidadeDoEvento: ["THE"] });
    expect(t1.rotas[0]).toMatchObject({ destino: "THE" });
    const r1 = l.find((x) => x.vaga.id === "r1")!;
    expect(r1.faltas).toEqual([]); // não trava a linha
    expect(r1).toMatchObject({ aeroportoSugerido: "GIG", aeroportosDaCidadeDoEvento: ["GIG", "SDU"] });
    expect(r1.rotas[0]).toMatchObject({ origem: "GRU", destino: "GIG" });
    expect(l.find((x) => x.vaga.id === "a")!.aeroportoSugerido).toBeNull(); // confirmado (JPA) não é "sugerido"
    const faixa = eventosAConfirmar(l, new Map([evSemAero, evRio].map((e) => [e.id, e])));
    expect(faixa).toEqual([
      { eventId: "ev-x", nome: "Night Run da Ilha", local: "Arena Multiuso", sugerido: null, sugestoes: [], escalacoes: 2, primeiraData: "2026-11-10" },
      { eventId: "ev-rio", nome: "Desafio Petrobrás - Rio de Janeiro - Travessia - 2026", local: "Praia de Copacabana", sugerido: "GIG", sugestoes: ["GIG", "SDU"], escalacoes: 2, primeiraData: "2026-11-12" },
    ]);
  });

  it("URL: só o que foge do padrão; o atalho de Passagens traz as vagas", () => {
    expect(escreverUrl("buscar", FILTROS_PADRAO)).toBe("");
    expect(escreverUrl("buscar", { ...FILTROS_PADRAO, passados: true })).toBe("passados=1");
    expect(lerUrl("?passados=1").filtros.passados).toBe(true);
    expect(lerUrl("").filtros.passados).toBe(false);
    const qs = escreverUrl("buscar", { ...FILTROS_PADRAO, situacao: "compradas", funcoes: ["f1", "f2"], de: "2026-11-01" });
    expect(lerUrl(qs).filtros).toMatchObject({ situacao: "compradas", funcoes: ["f1", "f2"], de: "2026-11-01" });
    expect(lerUrl("?vagas=a,b&idaDe=x&aba=consumo")).toMatchObject({ vagas: ["a", "b"], idaDe: "x", aba: "consumo" });
    expect(lerUrl("?aba=inventada&de=ontem").aba).toBe("buscar");
  });
});

describe("Usar este voo → formulário da passagem", () => {
  const seg = (cia: string, n: string, o: string, d: string, p: string, c: string) => ({ companhia: cia, numero: n, origem: o, destino: d, partida: p, chegada: c });
  const rt: ItinerarioDeVoo = {
    id: "x", precoCentavos: 123456, moeda: "BRL",
    pernas: [
      { companhia: "LA", duracaoMin: 300, segmentos: [seg("LA", "3456", "GRU", "BSB", "2026-11-12T06:10", "2026-11-12T07:50"), seg("LA", "3210", "BSB", "JPA", "2026-11-12T08:40", "2026-11-12T11:20")] },
      { companhia: "G3", duracaoMin: 200, segmentos: [seg("G3", "1500", "JPA", "GRU", "2026-11-16T19:05", "2026-11-16T22:25")] },
    ],
  };

  it("ida e volta: aeroportos, datas, horários, companhia, valor e a observação do preço visto", () => {
    const f = vooParaFormulario({ itinerario: rt, perna: "ida_e_volta", chave: "k", vistoEm: "2026-10-09T17:32:00Z" });
    expect(f).toMatchObject({
      transportType: "aereo", isOneWay: false, isReturnOnly: false, value: "1.234,56",
      departureAirport: "GRU", destinationAirport: "JPA", actualDepartureDate: "2026-11-12", actualDepartureTime: "06:10", actualArrivalTime: "11:20",
      returnOriginAirport: "JPA", returnDestinationAirport: "GRU", actualReturnDate: "2026-11-16", actualReturnTime: "19:05", returnArrivalTime: "22:25",
      ticketCompany: "LATAM / GOL",
    });
    expect(f.ticketObservations).toMatch(/Busca de preços \(09\/10 14:32\): LATAM \/ GOL — ida LA 3456 \+ LA 3210 · volta G3 1500/);
    expect(centavosParaCampo(99)).toBe("0,99");
  });

  it("só volta preenche só a volta; trecho direto liga a vaga anterior", () => {
    const so = { ...rt, pernas: [rt.pernas[1]] };
    const v = vooParaFormulario({ itinerario: so, perna: "volta", chave: "k", vistoEm: "x" });
    expect(v).toMatchObject({ isReturnOnly: true, isOneWay: false, returnOriginAirport: "JPA", actualReturnTime: "19:05" });
    expect(v.departureAirport).toBeUndefined();
    const ida = vooParaFormulario({ itinerario: { ...rt, pernas: [rt.pernas[0]] }, perna: "ida", chave: "k", vistoEm: "x", idaVemDeInclusionId: "anterior" }, "obs antiga");
    expect(ida).toMatchObject({ isOneWay: true, idaVemDeInclusionId: "anterior" });
    expect(ida.ticketObservations?.startsWith("obs antiga\nBusca de preços")).toBe(true);
  });
});
