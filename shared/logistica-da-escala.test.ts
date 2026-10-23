import { describe, expect, it } from "vitest";
import {
  estadoDaContagem,
  horaDaSugestao,
  horariosEmTexto,
  logisticaDaVagaNaEscala,
  noitesDaHospedagem,
  resumirLogistica,
  resumoDoMovimento,
  situacaoDaPassagem,
  type FontesDaLogistica,
  type HospedagemDaEscala,
  type PassagemDaEscala,
  type VagaDaEscala,
} from "./logistica-da-escala";
import type { TrechoTerrestre } from "./transporte-terrestre";

const vaga = (id: string, extra: Partial<VagaDaEscala> = {}): VagaDaEscala => ({
  id, functionId: "f1", status: "escalado", collaboratorId: `c-${id}`, needsTicket: true, needsAccommodation: true,
  flightDepartureDate: "2026-12-09", flightArrivalSuggestedTime: "chegar até 14h", flightReturnDate: "2026-12-14", flightReturnSuggestedTime: "18h",
  ...extra,
});

const passagem = (extra: PassagemDaEscala = {}): PassagemDaEscala => ({
  transportType: "aereo", purchaseDate: "2026-11-20", ticketStatus: "comprada",
  actualDepartureDate: "2026-12-09", actualDepartureTime: "07:30", actualArrivalTime: "09:55",
  actualReturnDate: "2026-12-14", actualReturnTime: "18:40", returnArrivalTime: "20:20",
  departureAirport: "POA", destinationAirport: "GRU", departureCityOrigin: "Porto Alegre", departureCityDestination: "São Paulo",
  returnOriginAirport: "GRU", returnDestinationAirport: "POA", ticketCompany: "LATAM", locator: "ABC123",
  ...extra,
});

const hotel = (extra: HospedagemDaEscala = {}): HospedagemDaEscala => ({
  hotelName: "Ibis Paulista", hotelStatus: "reservada", checkInDate: "2026-12-09", checkOutDate: "2026-12-14", ...extra,
});

const van = (trecho: "ida" | "volta"): TrechoTerrestre => ({ trecho, modo: "van", empresa: "Vans do Sul", valorCentavos: 50_000, grupo: null });

function fontes(dados: {
  passagens?: Record<string, PassagemDaEscala[]>;
  hoteis?: Record<string, HospedagemDaEscala[]>;
  terrestres?: Record<string, TrechoTerrestre[]>;
  saiDe?: Record<string, PassagemDaEscala>;
} = {}): FontesDaLogistica {
  return {
    passagensDe: (id) => dados.passagens?.[id] ?? [],
    hospedagensDe: (id) => dados.hoteis?.[id] ?? [],
    terrestresDe: (id) => dados.terrestres?.[id] ?? [],
    passagemQueSaiDe: (id) => dados.saiDe?.[id],
  };
}

describe("logisticaDaVagaNaEscala — precisa × tem", () => {
  it("passagem viva e hotel reservado: tudo tem", () => {
    const l = logisticaDaVagaNaEscala(vaga("a"), fontes({ passagens: { a: [passagem()] }, hoteis: { a: [hotel()] } }));
    expect(l.passagem).toBe("tem");
    expect(l.terrestre).toBe("nao_precisa");
    expect(l.hotel).toBe("tem");
    expect(l.situacao).toBe("comprada");
  });

  it("sem passagem e sem hotel: falta os dois", () => {
    const l = logisticaDaVagaNaEscala(vaga("a"), fontes());
    expect(l.passagem).toBe("falta");
    expect(l.hotel).toBe("falta");
  });

  it("vaga local (não pede transporte nem hotel): ninguém precisa", () => {
    const l = logisticaDaVagaNaEscala(vaga("a", { needsTicket: false, needsAccommodation: false }), fontes());
    expect(l.passagem).toBe("nao_precisa");
    expect(l.terrestre).toBe("nao_precisa");
    expect(l.hotel).toBe("nao_precisa");
    expect(l.viaja).toBe(false);
    expect(l.chegada).toBeNull();
  });

  it("passagem cancelada não conta; a de histórico (archivedAt) também não", () => {
    const cancelada = logisticaDaVagaNaEscala(vaga("a"), fontes({ passagens: { a: [passagem({ ticketStatus: "cancelada" })] } }));
    expect(cancelada.passagem).toBe("falta");
    expect(cancelada.situacao).toBe("cancelada");
    const historico = logisticaDaVagaNaEscala(vaga("a"), fontes({ passagens: { a: [passagem({ archivedAt: new Date() })] } }));
    expect(historico.passagem).toBe("falta");
    expect(historico.situacao).toBeNull();
  });

  it("hotel cancelado ou sem nome de hotel não conta (mesma regra das Análises)", () => {
    expect(logisticaDaVagaNaEscala(vaga("a"), fontes({ hoteis: { a: [hotel({ hotelStatus: "cancelada" })] } })).hotel).toBe("falta");
    expect(logisticaDaVagaNaEscala(vaga("a"), fontes({ hoteis: { a: [hotel({ hotelName: "  " })] } })).hotel).toBe("falta");
    // Duas hospedagens: vale a viva, mesmo que a primeira seja a cancelada.
    expect(logisticaDaVagaNaEscala(vaga("a"), fontes({ hoteis: { a: [hotel({ hotelStatus: "cancelada" }), hotel()] } })).hotel).toBe("tem");
  });

  it("emitida, só carimbo e registrada sem compra", () => {
    expect(situacaoDaPassagem(passagem({ emittedAt: new Date() }))).toBe("emitida");
    expect(situacaoDaPassagem({ emittedAt: new Date() })).toBe("so_carimbo");
    expect(situacaoDaPassagem(passagem({ purchaseDate: null }))).toBe("registrada");
  });
});

describe("carro/van", () => {
  it("Sugestão indica van nas duas pernas: não pede passagem, pede carro/van", () => {
    const l = logisticaDaVagaNaEscala(vaga("a", { transportModeIda: "van", transportModeVolta: "van" }), fontes());
    expect(l.passagem).toBe("nao_precisa");
    expect(l.terrestre).toBe("falta");
    expect(l.pernasTerrestres).toEqual(["ida", "volta"]);
  });

  it("as duas pernas registradas: carro/van tem", () => {
    const l = logisticaDaVagaNaEscala(vaga("a", { transportModeIda: "van", transportModeVolta: "van" }), fontes({ terrestres: { a: [van("ida"), van("volta")] } }));
    expect(l.terrestre).toBe("tem");
    expect(l.passagem).toBe("nao_precisa");
  });

  it("só a ida registrada: falta", () => {
    const l = logisticaDaVagaNaEscala(vaga("a", { transportModeIda: "van", transportModeVolta: "van" }), fontes({ terrestres: { a: [van("ida")] } }));
    expect(l.terrestre).toBe("falta");
  });

  it("ida de van e volta aérea: as duas colunas precisam", () => {
    const l = logisticaDaVagaNaEscala(vaga("a"), fontes({ terrestres: { a: [van("ida")] } }));
    expect(l.terrestre).toBe("tem");
    expect(l.passagem).toBe("falta");
    expect(l.pernasDePassagem).toEqual(["volta"]);
  });

  it("texto da Sugestão ('14h carro') também indica", () => {
    const l = logisticaDaVagaNaEscala(vaga("a", { flightDepartureSuggestedTime: null, flightArrivalSuggestedTime: "van - 7h", flightReturnSuggestedTime: "14h carro" }), fontes());
    expect(l.pernasTerrestres).toEqual(["ida", "volta"]);
    expect(l.passagem).toBe("nao_precisa");
  });

  it("ônibus indicado é passagem rodoviária, não carro/van", () => {
    const l = logisticaDaVagaNaEscala(vaga("a", { transportModeIda: "onibus", transportModeVolta: "onibus" }), fontes());
    expect(l.terrestre).toBe("nao_precisa");
    expect(l.passagem).toBe("falta");
  });

  it("perna indicada como van mas já coberta pela passagem não é terrestre", () => {
    const l = logisticaDaVagaNaEscala(vaga("a", { transportModeIda: "van" }), fontes({ passagens: { a: [passagem()] } }));
    expect(l.terrestre).toBe("nao_precisa");
    expect(l.passagem).toBe("tem");
  });

  it("só ida: a volta não conta", () => {
    const l = logisticaDaVagaNaEscala(vaga("a", { trechosSugeridos: "so_ida", transportModeIda: "carro" }), fontes({ terrestres: { a: [van("ida")] } }));
    expect(l.terrestre).toBe("tem");
    expect(l.passagem).toBe("nao_precisa");
    expect(l.saida).toBeNull();
  });
});

describe("horários de chegada e saída", () => {
  it("passagem: chega na hora de chegada da ida, sai na hora de partida da volta", () => {
    const l = logisticaDaVagaNaEscala(vaga("a"), fontes({ passagens: { a: [passagem()] } }));
    expect(l.chegada).toMatchObject({ dia: "2026-12-09", hora: "09:55", fonte: "passagem", de: "POA", para: "GRU", companhia: "LATAM", partida: "07:30", chegada: "09:55" });
    expect(l.saida).toMatchObject({ dia: "2026-12-14", hora: "18:40", fonte: "passagem", de: "GRU", para: "POA", chegada: "20:20" });
  });

  it("voo noturno: chegada antes da partida = dia seguinte", () => {
    const l = logisticaDaVagaNaEscala(vaga("a"), fontes({ passagens: { a: [passagem({ actualDepartureTime: "23:10", actualArrivalTime: "01:20" })] } }));
    expect(l.chegada).toMatchObject({ dia: "2026-12-10", hora: "01:20" });
  });

  it("sem passagem: a Sugestão, marcada como sugestão e com o texto livre", () => {
    const l = logisticaDaVagaNaEscala(vaga("a"), fontes());
    expect(l.chegada).toMatchObject({ dia: "2026-12-09", hora: "14:00", fonte: "sugestao", textoDaSugestao: "chegar até 14h" });
    expect(l.saida).toMatchObject({ dia: "2026-12-14", hora: "18:00", fonte: "sugestao" });
  });

  it("carro/van registrado: horário da Sugestão, com o modo e a empresa", () => {
    const l = logisticaDaVagaNaEscala(vaga("a", { transportModeIda: "van", transportModeVolta: "van", flightArrivalSuggestedTime: "van - 20h" }), fontes({ terrestres: { a: [van("ida"), van("volta")] } }));
    expect(l.chegada).toMatchObject({ hora: "20:00", fonte: "sugestao", modo: "van", companhia: "Vans do Sul" });
  });

  it("segue direto para outro evento: sai pela ida da passagem da vaga seguinte", () => {
    const l = logisticaDaVagaNaEscala(
      vaga("a", { voltaSegueParaEventoId: "ev2" }),
      fontes({ passagens: { a: [passagem({ actualReturnDate: null, actualReturnTime: null, returnArrivalTime: null, returnOriginAirport: null, returnDestinationAirport: null })] }, saiDe: { a: passagem({ actualDepartureDate: "2026-12-14", actualDepartureTime: "06:00", actualArrivalTime: "08:10", departureAirport: "GRU", destinationAirport: "REC" }) } }),
    );
    expect(l.saida).toMatchObject({ dia: "2026-12-14", hora: "06:00", para: "REC", segueParaOutroEvento: true });
  });

  it("horaDaSugestao lê '9h30', '07:15' e devolve null para texto sem hora", () => {
    expect(horaDaSugestao("chegar até 9h30")).toBe("09:30");
    expect(horaDaSugestao("van - 07:15")).toBe("07:15");
    expect(horaDaSugestao("manhã")).toBeNull();
  });
});

describe("noitesDaHospedagem", () => {
  it("entra dia 9 e sai dia 14: noites 9 a 13", () => {
    expect(noitesDaHospedagem(hotel())).toEqual(["2026-12-09", "2026-12-10", "2026-12-11", "2026-12-12", "2026-12-13"]);
  });
  it("sem datas ou saída antes da entrada: nenhuma noite", () => {
    expect(noitesDaHospedagem(hotel({ checkOutDate: null }))).toEqual([]);
    expect(noitesDaHospedagem(hotel({ checkOutDate: "2026-12-08" }))).toEqual([]);
  });
});

describe("resumirLogistica — por função, total e por dia", () => {
  const vagas: VagaDaEscala[] = [
    vaga("a"),
    vaga("b"),
    vaga("c", { functionId: "f2", collaboratorId: null, needsTicket: false, needsAccommodation: false }),
    vaga("d", { status: "cancelado" }),
    vaga("e", { functionId: "f2", transportModeIda: "van", transportModeVolta: "van" }),
  ];
  const r = resumirLogistica(vagas, fontes({
    passagens: { a: [passagem()], b: [passagem({ actualArrivalTime: "09:55" }), passagem()] , d: [passagem()] },
    hoteis: { a: [hotel()] },
    terrestres: { e: [van("ida")] },
  }));

  it("cancelada não entra em nada", () => {
    expect(r.porVaga.has("d")).toBe(false);
    expect(r.total.vagas).toBe(4);
  });

  it("conta por função e no total", () => {
    const f1 = r.porFuncao.get("f1")!;
    expect(f1.vagas).toBe(2);
    expect(f1.passagem).toMatchObject({ precisam: 2, tem: 2 });
    expect(f1.hotel).toEqual({ precisam: 2, tem: 1 });
    const f2 = r.porFuncao.get("f2")!;
    expect(f2.semNome).toBe(1);
    expect(f2.terrestre).toEqual({ precisam: 1, tem: 0 });
    expect(f2.passagem).toMatchObject({ precisam: 0, tem: 0 });
    expect(r.total.passagem).toMatchObject({ precisam: 2, tem: 2 });
    expect(r.total.hotel).toEqual({ precisam: 3, tem: 1 });
    expect(r.total.semNome).toBe(1);
  });

  it("por dia: chegam e saem ordenados por hora; hotel por noite", () => {
    const dia9 = r.porDia.get("2026-12-09")!;
    // a e b pela passagem (09:55), e pela Sugestão (chegar até 14h).
    expect(dia9.chegam.map((m) => m.vagaId)).toEqual(["a", "b", "e"]);
    expect(horariosEmTexto(dia9.chegam)).toBe("09:55 (2), ≈14:00");
    expect(dia9.noHotel).toEqual(["a"]);
    expect(r.porDia.get("2026-12-14")!.saem).toHaveLength(3);
    expect(r.porDia.get("2026-12-14")!.noHotel).toEqual([]);
    expect(Array.from(r.porDia.keys())).toEqual([...Array.from(r.porDia.keys())].sort());
  });

  it("primeira chegada e última saída da função", () => {
    expect(r.porFuncao.get("f1")!.primeiraChegada).toMatchObject({ hora: "09:55" });
    expect(r.porFuncao.get("f1")!.ultimaSaida).toMatchObject({ hora: "18:40" });
  });

  it("vaga que viaja sem dia de chegada fica listada", () => {
    const s = resumirLogistica([vaga("x", { flightDepartureDate: null })], fontes());
    expect(s.semDiaDeChegada).toEqual(["x"]);
  });

  it("textos do resumo do dia", () => {
    expect(resumoDoMovimento("Chegam", [])).toBe("Chegam 0");
    expect(resumoDoMovimento("Chegam", [{ dia: "2026-12-10", hora: "22:05", fonte: "passagem" }, { dia: "2026-12-10", hora: null, fonte: "sugestao" }])).toBe("Chegam 2: 22:05, sem horário (1)");
  });

  it("estadoDaContagem", () => {
    expect(estadoDaContagem({ precisam: 0, tem: 0 })).toBe("ninguem");
    expect(estadoDaContagem({ precisam: 5, tem: 5 })).toBe("ok");
    expect(estadoDaContagem({ precisam: 5, tem: 3 })).toBe("falta");
  });
});
