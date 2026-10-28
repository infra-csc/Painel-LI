/**
 * Tipo de transporte POR TRECHO (28/10, vaga #4618): ida aérea GRU→SDU e
 * volta de ônibus Novo Rio → Barra Funda. A regra da VOLTA usa o tipo da volta
 * — no Planejado (mobilidade e jantar do retorno), na Escala e na sanidade.
 */
import { describe, expect, it } from "vitest";
import {
  nomeDoTipo,
  nomeDosTiposDaPassagem,
  rotuloDoNumeroDaCompra,
  tipoDaIda,
  tipoDaVolta,
  tipoDaVoltaParaGravar,
  trechoTerrestre,
  voltaComOutroTipo,
  valoresPorTrecho,
  detalheDosValores,
  numerosDaCompra,
} from "./tipo-por-trecho";
import { calcularPlanejadoDaVaga } from "./budget-engine";
import { MOBILIDADE_TRECHO_MADRUGADA_CENTS, MOBILIDADE_TRECHO_PADRAO_CENTS } from "./atendimento";
import { logisticaDaVagaNaEscala, type FontesDaLogistica, type PassagemDaEscala, type VagaDaEscala } from "./logistica-da-escala";
import { pernasComHorarioImpossivel } from "./sanidade-da-passagem";
import { montarHistoricoDaVaga } from "./inclusion-timeline";

const mista = { transportType: "aereo", returnTransportType: "rodoviario" };

describe("tipo de cada trecho", () => {
  it("volta sem tipo próprio = igual à ida (todas as passagens antigas)", () => {
    expect(tipoDaVolta({ transportType: "aereo" })).toBe("aereo");
    expect(tipoDaVolta({ transportType: "rodoviario", returnTransportType: null })).toBe("rodoviario");
    expect(voltaComOutroTipo({ transportType: "aereo" })).toBe(false);
    expect(tipoDaIda({ transportType: null })).toBeNull();
  });

  it("ida aérea + volta rodoviária", () => {
    expect(tipoDaIda(mista)).toBe("aereo");
    expect(tipoDaVolta(mista)).toBe("rodoviario");
    expect(voltaComOutroTipo(mista)).toBe(true);
    expect(nomeDosTiposDaPassagem(mista)).toBe("Ida aérea · volta rodoviária");
    expect(rotuloDoNumeroDaCompra(mista)).toBe("LOC / Bilhete");
  });

  it("nomes e rótulos de sempre quando os trechos são iguais", () => {
    expect(nomeDosTiposDaPassagem({ transportType: "rodoviario" })).toBe("Rodoviário");
    expect(nomeDosTiposDaPassagem({ transportType: null })).toBe("Aéreo");
    expect(nomeDoTipo("van")).toBe("Van");
    expect(rotuloDoNumeroDaCompra({ transportType: "rodoviario" })).toBe("Bilhete");
    expect(rotuloDoNumeroDaCompra({ transportType: "van" })).toBe("Empresa");
    expect(rotuloDoNumeroDaCompra({})).toBe("LOC");
    // Volta "diferente" igual à ida não conta como mista.
    expect(voltaComOutroTipo({ transportType: "aereo", returnTransportType: "aereo" })).toBe(false);
  });

  it("o que gravar: só o tipo DIFERENTE da ida, com as duas pernas", () => {
    expect(tipoDaVoltaParaGravar("aereo", "rodoviario")).toBe("rodoviario");
    expect(tipoDaVoltaParaGravar("aereo", "aereo")).toBeNull();
    expect(tipoDaVoltaParaGravar(null, "aereo")).toBeNull(); // ida sem tipo = aérea
    expect(tipoDaVoltaParaGravar("aereo", "")).toBeNull();
    expect(tipoDaVoltaParaGravar("van", "rodoviario")).toBeNull();
    expect(tipoDaVoltaParaGravar("aereo", "van")).toBeNull();
    expect(tipoDaVoltaParaGravar("aereo", "xyz")).toBeNull();
    expect(tipoDaVoltaParaGravar("aereo", "rodoviario", { temIda: true, temVolta: false })).toBeNull();
    expect(tipoDaVoltaParaGravar("aereo", "rodoviario", { temIda: false, temVolta: true })).toBeNull();
    expect(tipoDaVoltaParaGravar("aereo", "rodoviario", { temIda: true, temVolta: true })).toBe("rodoviario");
  });

  it("terrestre = ônibus ou van", () => {
    expect(trechoTerrestre("rodoviario")).toBe(true);
    expect(trechoTerrestre("van")).toBe(true);
    expect(trechoTerrestre("aereo")).toBe(false);
    expect(trechoTerrestre(null)).toBe(false);
  });
});

describe("Planejado — a regra da VOLTA usa o tipo da volta", () => {
  // 2027-11-11 (qui) a 2027-11-15 (seg), evento no Rio.
  const base = {
    vaga: { scheduleStartDate: "2027-11-11", scheduleEndDate: "2027-11-15", needsTicket: true, dailyRates: 5, dailyValue: 0 },
    functionName: "Cenotécnica",
    collaboratorType: "freela" as const,
    settings: {},
    eventLocation: "Aterro do Flamengo, Rio de Janeiro - RJ",
  };
  const horarios = {
    actualDepartureDate: "2027-11-11", actualDepartureTime: "12:05", actualArrivalTime: "13:10",
    // Ônibus noturno: sai 23:45 e chega 06:25 — no voo seria madrugada (R$58).
    actualReturnDate: "2027-11-15", actualReturnTime: "23:45", returnArrivalTime: "06:25",
  };

  it("volta de ônibus: mobilidade da volta = R$29 fixo (não a madrugada do aeroporto); ida aérea segue a regra do voo", () => {
    const tudoAereo = calcularPlanejadoDaVaga({ ...base, ticket: { ...horarios, transportType: "aereo" } });
    expect(tudoAereo.mobilidadeVolta).toBe(MOBILIDADE_TRECHO_MADRUGADA_CENTS);

    const r = calcularPlanejadoDaVaga({ ...base, ticket: { ...horarios, ...mista } });
    expect(r.mobilidadeVolta).toBe(MOBILIDADE_TRECHO_PADRAO_CENTS);
    expect(r.mobilidadeIda).toBe(tudoAereo.mobilidadeIda);
  });

  it("volta de ônibus às 20:30: jantar do retorno (terrestre paga a partir das 20h; o voo, só depois das 21h)", () => {
    // Sem a chegada (a "volta chega depois das 21h" daria jantar aos dois).
    const volta2030 = { ...horarios, actualReturnTime: "20:30", returnArrivalTime: null };
    // Da casa (o freela não recebe alimentação — 26/08).
    const casa = { ...base, functionName: "Produção", collaboratorType: "casa" as const };
    const aereo = calcularPlanejadoDaVaga({ ...casa, ticket: { ...volta2030, transportType: "aereo" } });
    const mistaR = calcularPlanejadoDaVaga({ ...casa, ticket: { ...volta2030, ...mista } });
    const jantares = (r: typeof aereo) => r.jantarSemana + r.jantarFds;
    expect(jantares(mistaR)).toBeGreaterThan(jantares(aereo));
  });

  it("ida de ônibus + volta aérea: a ida é terrestre (R$29) e a volta segue o voo", () => {
    const r = calcularPlanejadoDaVaga({ ...base, ticket: { ...horarios, transportType: "rodoviario", returnTransportType: "aereo" } });
    expect(r.mobilidadeIda).toBe(MOBILIDADE_TRECHO_PADRAO_CENTS);
    expect(r.mobilidadeVolta).toBe(MOBILIDADE_TRECHO_MADRUGADA_CENTS);
  });
});

describe("Escala — chegada e saída com o modo de cada trecho", () => {
  const vaga: VagaDaEscala = { id: "v", functionId: "f", status: "escalado", collaboratorId: "c", needsTicket: true, needsAccommodation: false };
  const passagem: PassagemDaEscala = {
    ...mista, purchaseDate: "2027-10-20", ticketStatus: "comprada",
    actualDepartureDate: "2027-11-11", actualDepartureTime: "12:05", actualArrivalTime: "13:10",
    departureAirport: "GRU", destinationAirport: "SDU",
    actualReturnDate: "2027-11-15", actualReturnTime: "23:45", returnArrivalTime: "06:25",
    returnOriginAirport: "Rodoviária Novo Rio", returnDestinationAirport: "Terminal Barra Funda",
  };
  const fontes: FontesDaLogistica = { passagensDe: () => [passagem], hospedagensDe: () => [], terrestresDe: () => [] };

  it("chega de avião, sai de ônibus", () => {
    const l = logisticaDaVagaNaEscala(vaga, fontes);
    expect(l.chegada).toMatchObject({ modo: "aereo", de: "GRU", para: "SDU" });
    expect(l.saida).toMatchObject({ modo: "rodoviario", de: "Rodoviária Novo Rio", para: "Terminal Barra Funda", hora: "23:45" });
  });
});

describe("sanidade — ônibus noturno da volta não é 'chegada antes da partida'", () => {
  it("na volta rodoviária, 23:45 → 06:25 passa; na volta aérea, 17:35 → 12:15 continua barrado", () => {
    const campos = { ...mista, actualReturnTime: "17:35", returnArrivalTime: "12:15", actualDepartureTime: "17:35", actualArrivalTime: "12:15" };
    const problemas = pernasComHorarioImpossivel(campos);
    expect(problemas.map((p) => p.trecho)).toEqual(["ida"]);
    expect(pernasComHorarioImpossivel({ ...campos, returnTransportType: null }).map((p) => p.trecho)).toEqual(["ida", "volta"]);
  });
});

describe("linha do tempo da vaga", () => {
  it("diz \"Passagem aérea, volta rodoviária\"", () => {
    const itens = montarHistoricoDaVaga({
      vaga: { id: "v", createdAt: "2027-10-01T12:00:00Z" },
      logs: [],
      passagens: [{ id: "t", createdAt: "2027-10-20T12:00:00Z", ...mista, departureCityOrigin: "São Paulo", departureCityDestination: "Rio de Janeiro" }],
      hospedagens: [], trocas: [], pedidos: [],
    } as Parameters<typeof montarHistoricoDaVaga>[0]);
    const registrada = itens.find((i) => i.id === "passagem-t-registrada");
    expect(registrada?.detalhe).toContain("Passagem aérea, volta rodoviária");
  });
});

describe("valor e bilhete por trecho (dono, 28/10: \"deveria SOMAR os valores de ida e volta\")", () => {
  it("value é o TOTAL; a volta à parte é uma parte dele e a ida é o resto", () => {
    expect(valoresPorTrecho({ value: 53893, returnValue: 15000 })).toEqual({ totalCents: 53893, idaCents: 38893, voltaCents: 15000 });
    expect(valoresPorTrecho({ value: 38893 })).toEqual({ totalCents: 38893, idaCents: null, voltaCents: null });
    // O Espelho baixou o total abaixo da volta: a ida não fica negativa.
    expect(valoresPorTrecho({ value: 10000, returnValue: 15000 }).idaCents).toBe(0);
    expect(detalheDosValores({ value: 53893, returnValue: 15000 })).toBe("ida R$ 388,93 + volta R$ 150,00");
    expect(detalheDosValores({ value: 53893 })).toBeNull();
  });

  it("número de cada compra com o rótulo do tipo do trecho", () => {
    expect(numerosDaCompra({ ...mista, purchaseOrderNumber: "JPLN7F8J", returnPurchaseOrderNumber: "4471" })).toEqual(["LOC JPLN7F8J", "Bilhete 4471"]);
    expect(numerosDaCompra({ transportType: "aereo", purchaseOrderNumber: "AX782Q" })).toEqual(["LOC AX782Q"]);
    expect(numerosDaCompra({ transportType: "rodoviario", purchaseOrderNumber: "123" })).toEqual(["Bilhete 123"]);
  });
});
