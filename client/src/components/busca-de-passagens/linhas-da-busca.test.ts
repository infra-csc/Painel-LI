import { describe, expect, it } from "vitest";
import { eventoFake, vagaFake } from "@/test/fixtures-dominio";
import type { Collaborator, Ticket } from "@shared/schema";
import { montarLinhas, passaNosFiltros, ordenarLinhas } from "./linhas-da-busca";
import { FILTROS_PADRAO, escreverUrl, lerUrl } from "./filtros-da-busca";
import { vooParaFormulario, centavosParaCampo } from "./voo-para-formulario";
import type { ItinerarioDeVoo } from "@shared/busca-de-passagens";

const HOJE = "2026-10-09";
const evJpa = eventoFake({ id: "ev-jpa", name: "Makai João Pessoa", location: "Tambaú, João Pessoa - PB", aeroportoIata: "JPA" });
const evSemAero = eventoFake({ id: "ev-x", name: "Night Run Aracaju", location: "Atalaia, Aracaju - SE" });
const viagem = { needsTicket: true, city: "São Paulo - SP", flightDepartureDate: "2026-11-12", flightArrivalSuggestedTime: "até 14h", flightReturnDate: "2026-11-16", flightReturnSuggestedTime: "18h+" };

function linhas(extra: { tickets?: Ticket[] } = {}) {
  const vagas = [
    vagaFake({ id: "a", inclusionNumber: 10, eventId: "ev-jpa", ...viagem }),
    vagaFake({ id: "b", inclusionNumber: 11, eventId: "ev-x", ...viagem }),
    vagaFake({ id: "c", inclusionNumber: 12, eventId: "ev-jpa", ...viagem, transportModeIda: "onibus", transportModeVolta: "onibus" }),
    vagaFake({ id: "d", inclusionNumber: 13, eventId: "ev-jpa", ...viagem, trechosSugeridos: "so_ida", flightReturnDate: null }),
  ];
  return montarLinhas({
    vagas,
    eventById: new Map([[evJpa.id, evJpa], [evSemAero.id, evSemAero]]),
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
    expect(ids({ situacao: "todas", de: "2026-11-13" })).toEqual([]);
    expect(ids({ situacao: "todas", q: "#11" })).toEqual(["b"]);
    expect(ids({ situacao: "todas", destino: "JPA" })).toEqual(["a", "d"]);
    expect(ordenarLinhas(l).map((x) => x.vaga.id)).toEqual(["a", "b", "d"]);
  });

  it("URL: só o que foge do padrão; o atalho de Passagens traz as vagas", () => {
    expect(escreverUrl("buscar", FILTROS_PADRAO)).toBe("");
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
