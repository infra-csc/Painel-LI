/**
 * Sanidade das pernas (19/10 — caso #3913). A passagem gravada pelo leitor
 * antigo é o primeiro caso: ida THE→THE 17:35→12:15, volta FOR→FOR 13:25→14:20.
 */
import { describe, it, expect } from "vitest";
import { pernasComHorarioImpossivel, pernasComOrigemIgualAoDestino, problemasNasPernas } from "./sanidade-da-passagem";

const GRAVADA_NO_3913 = {
  transportType: "aereo",
  departureAirport: "THE", destinationAirport: "THE", actualDepartureTime: "17:35", actualArrivalTime: "12:15",
  returnOriginAirport: "FOR", returnDestinationAirport: "FOR", actualReturnTime: "13:25", returnArrivalTime: "14:20",
};

const CERTA_DO_3913 = {
  transportType: "aereo",
  departureAirport: "GRU", destinationAirport: "THE", actualDepartureTime: "14:30", actualArrivalTime: "17:35",
  returnOriginAirport: "THE", returnDestinationAirport: "CGH", actualReturnTime: "12:15", returnArrivalTime: "18:00",
};

describe("origem igual ao destino na mesma perna (regra do levantamento)", () => {
  it("a passagem gravada do #3913 acende nas duas pernas", () => {
    expect(pernasComOrigemIgualAoDestino(GRAVADA_NO_3913)).toEqual([
      { trecho: "ida", motivo: "mesmo_lugar", texto: "Ida THE→THE: origem igual ao destino" },
      { trecho: "volta", motivo: "mesmo_lugar", texto: "Volta FOR→FOR: origem igual ao destino" },
    ]);
  });

  it("a passagem certa não acende", () => {
    expect(problemasNasPernas(CERTA_DO_3913)).toEqual([]);
  });

  it("compara sem caixa e sem espaço sobrando; perna vazia não conta", () => {
    expect(pernasComOrigemIgualAoDestino({ departureAirport: " the ", destinationAirport: "THE" })).toHaveLength(1);
    expect(pernasComOrigemIgualAoDestino({ departureAirport: "", destinationAirport: "" })).toEqual([]);
    expect(pernasComOrigemIgualAoDestino({ returnOriginAirport: "THE" })).toEqual([]);
    expect(pernasComOrigemIgualAoDestino(null)).toEqual([]);
  });

  it("van usa esses campos para outra coisa e fica de fora", () => {
    expect(pernasComOrigemIgualAoDestino({ transportType: "van", departureAirport: "Empresa X", destinationAirport: "Empresa X" })).toEqual([]);
  });

  it("rodoviário com o mesmo terminal nas duas pontas também é suspeito", () => {
    expect(pernasComOrigemIgualAoDestino({ transportType: "rodoviario", departureAirport: "Barra Funda", destinationAirport: "Barra Funda" })).toHaveLength(1);
  });
});

describe("chegada antes da partida (só aéreo)", () => {
  it("17:35 → 12:15 seriam 18h40 de voo: acende", () => {
    expect(pernasComHorarioImpossivel(GRAVADA_NO_3913)).toEqual([
      { trecho: "ida", motivo: "chegada_antes_da_partida", texto: "Ida sai 17:35 e chega 12:15: a chegada fica antes da partida" },
    ]);
  });

  it("voo que vira a meia-noite de forma plausível passa", () => {
    expect(pernasComHorarioImpossivel({ actualDepartureTime: "23:30", actualArrivalTime: "01:10" })).toEqual([]);
    expect(pernasComHorarioImpossivel({ actualReturnTime: "22:00", returnArrivalTime: "08:00" })).toEqual([]);
  });

  it("ônibus pode virar o dia e não é conferido", () => {
    expect(pernasComHorarioImpossivel({ transportType: "rodoviario", actualDepartureTime: "17:00", actualArrivalTime: "12:00" })).toEqual([]);
  });

  it("horário fora do formato não acende nada", () => {
    expect(pernasComHorarioImpossivel({ actualDepartureTime: "manhã", actualArrivalTime: "12:00" })).toEqual([]);
  });
});
