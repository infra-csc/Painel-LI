import { describe, it, expect, vi } from "vitest";

// O módulo importa ./db, que exige DATABASE_URL ao carregar. As funções aqui
// testadas são puras — o banco é só um objeto vazio.
vi.mock("./db", () => ({ db: {} }));

import {
  consolidarPassagens,
  patchDaVaga,
  alvoDoCampo,
  coerce,
  montarGruposUber,
  temCabecalhoDoEspelho,
  timeToMinutes,
} from "./operational-mirror";

const idaGru = {
  id: "t1", teamInclusionId: "v1", createdAt: new Date("2026-09-01T10:00:00Z"),
  departureAirport: "GRU", destinationAirport: "REC",
  departureCityOrigin: "São Paulo", departureCityDestination: "Recife",
  actualDepartureDate: "2026-09-19", actualDepartureTime: "06:10", actualArrivalTime: "09:20",
  actualReturnDate: null, actualReturnTime: null, returnArrivalTime: null,
  returnOriginAirport: null, returnDestinationAirport: null, returnCityOrigin: null, returnCityDestination: null,
  value: 85000, baggageTotalCents: 5000, locator: "ABC123", purchaseOrderNumber: "OC-1",
  attachmentIds: ["a1"], fileUrl: null, ticketCompany: "LATAM",
};
/** Segundo voucher, lido pelo leitor como trecho solto → campos de IDA. */
const voltaComoIda = {
  id: "t2", teamInclusionId: "v1", createdAt: new Date("2026-09-02T10:00:00Z"),
  departureAirport: "REC", destinationAirport: "GRU",
  departureCityOrigin: "Recife", departureCityDestination: "São Paulo",
  actualDepartureDate: "2026-09-21", actualDepartureTime: "18:00", actualArrivalTime: "21:15",
  actualReturnDate: null, actualReturnTime: null, returnArrivalTime: null,
  returnOriginAirport: null, returnDestinationAirport: null, returnCityOrigin: null, returnCityDestination: null,
  value: 120050, baggageTotalCents: null, locator: "DEF456", purchaseOrderNumber: "OC-2",
  attachmentIds: ["a2"], fileUrl: "http://x/v2.pdf", ticketCompany: null,
};

describe("consolidarPassagens — ida e volta em linhas separadas", () => {
  it("uma passagem só volta o MESMO objeto (formato intocado)", () => {
    expect(consolidarPassagens([idaGru])).toBe(idaGru);
    expect(consolidarPassagens([])).toBeNull();
  });

  it("dois trechos soltos: o mais cedo vira ida, o mais tarde vira volta; valores somam; LOC/OC juntam", () => {
    const r = consolidarPassagens([voltaComoIda, idaGru])!; // ordem do banco não importa
    expect(r.departureAirport).toBe("GRU");
    expect(r.actualDepartureDate).toBe("2026-09-19");
    expect(r.actualDepartureTime).toBe("06:10");
    expect(r.returnOriginAirport).toBe("REC");
    expect(r.returnDestinationAirport).toBe("GRU");
    expect(r.actualReturnDate).toBe("2026-09-21");
    expect(r.actualReturnTime).toBe("18:00");
    expect(r.returnArrivalTime).toBe("21:15");
    expect(r.returnCityOrigin).toBe("Recife");
    expect(r.value).toBe(85000 + 120050);
    expect(r.baggageTotalCents).toBe(5000);
    expect(r.locator).toBe("ABC123 / DEF456");
    expect(r.purchaseOrderNumber).toBe("OC-1 / OC-2");
    expect(r.attachmentIds).toEqual(["a1", "a2"]);
    // demais campos: último preenchido na ordem de criação
    expect(r.id).toBe("t2");
    expect(r.fileUrl).toBe("http://x/v2.pdf");
    expect(r.ticketCompany).toBe("LATAM");
  });

  it("passagem 'só volta' (campos de VOLTA) + voucher de ida: fica cada um no seu lado", () => {
    const soVolta = {
      ...voltaComoIda,
      departureAirport: null, destinationAirport: null, departureCityOrigin: null, departureCityDestination: null,
      actualDepartureDate: null, actualDepartureTime: null, actualArrivalTime: null,
      returnOriginAirport: "REC", returnDestinationAirport: "GRU", actualReturnDate: "2026-09-21", actualReturnTime: "18:00",
    };
    const r = consolidarPassagens([soVolta, idaGru])!;
    expect(r.departureAirport).toBe("GRU");
    expect(r.actualDepartureDate).toBe("2026-09-19");
    expect(r.returnOriginAirport).toBe("REC");
    expect(r.actualReturnDate).toBe("2026-09-21");
    expect(r.value).toBe(85000 + 120050);
  });

  it("mesmo voucher gravado duas vezes não soma nem junta o LOC", () => {
    const repetida = { ...idaGru, id: "t3", createdAt: new Date("2026-09-03T10:00:00Z") };
    const r = consolidarPassagens([idaGru, repetida])!;
    expect(r.value).toBe(85000);
    expect(r.locator).toBe("ABC123");
    expect(r.departureAirport).toBe("GRU");
    expect(r.returnOriginAirport).toBeNull();
  });

  it("linha completa (ida e volta) + trecho extra: soma o valor e mantém a ida mais cedo / volta mais tarde", () => {
    const completa = {
      ...idaGru, id: "t0",
      returnOriginAirport: "REC", returnDestinationAirport: "GRU", actualReturnDate: "2026-09-21", actualReturnTime: "18:00",
    };
    const trechoDepois = { ...voltaComoIda, id: "t9", actualDepartureDate: "2026-09-25", actualDepartureTime: "07:00", locator: "ZZZ999" };
    const r = consolidarPassagens([completa, trechoDepois])!;
    expect(r.actualDepartureDate).toBe("2026-09-19");
    expect(r.actualReturnDate).toBe("2026-09-25");
    expect(r.actualReturnTime).toBe("07:00");
    expect(r.value).toBe(85000 + 120050);
    expect(r.locator).toBe("ABC123 / ZZZ999");
  });

  it("linhas sem nenhum trecho (só valor) apenas somam", () => {
    const soValor = { id: "t5", teamInclusionId: "v1", createdAt: null, value: 1000, locator: null };
    const r = consolidarPassagens([idaGru, soValor])!;
    expect(r.value).toBe(86000);
    expect(r.departureAirport).toBe("GRU");
    expect(r.locator).toBe("ABC123");
  });
});

describe("patchDaVaga — datas da escala refazem workDays/dailyRates", () => {
  const vaga = { scheduleStartDate: "2026-09-10", scheduleEndDate: "2026-09-12" };

  it("mudar o término recalcula com a mesma regra do PATCH", () => {
    expect(patchDaVaga(vaga, "scheduleEndDate", "2026-09-14")).toEqual({
      scheduleEndDate: "2026-09-14",
      workDays: ["2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14"],
      dailyRates: 5,
    });
  });

  it("mudar o início também", () => {
    expect(patchDaVaga(vaga, "scheduleStartDate", "2026-09-11")).toEqual({
      scheduleStartDate: "2026-09-11", workDays: ["2026-09-11", "2026-09-12"], dailyRates: 2,
    });
  });

  it("mesma data, data vazia ou fim antes do início: só a coluna, sem mexer nas diárias", () => {
    expect(patchDaVaga(vaga, "scheduleEndDate", "2026-09-12")).toEqual({ scheduleEndDate: "2026-09-12" });
    expect(patchDaVaga(vaga, "scheduleEndDate", null)).toEqual({ scheduleEndDate: null });
    expect(patchDaVaga(vaga, "scheduleEndDate", "2026-09-01")).toEqual({ scheduleEndDate: "2026-09-01" });
  });

  it("outras colunas da vaga não tocam nas diárias", () => {
    expect(patchDaVaga(vaga, "flightDepartureDate", "2026-09-09")).toEqual({ flightDepartureDate: "2026-09-09" });
    expect(patchDaVaga(vaga, "observations", "x")).toEqual({ observations: "x" });
  });
});

describe("alvoDoCampo — só campos do mapa, sem herança do prototype", () => {
  it("campo conhecido", () => {
    expect(alvoDoCampo("ticket.value")).toEqual({ table: "tickets", col: "value", type: "int" });
  });
  it("__proto__, constructor, toString e desconhecidos são recusados", () => {
    for (const f of ["__proto__", "constructor", "toString", "hasOwnProperty", "ticket.id", ""]) {
      expect(alvoDoCampo(f)).toBeNull();
    }
  });
});

describe("coerce", () => {
  it("vazio vira null (ou false em bool); int arredonda; bool aceita 'true'/1", () => {
    expect(coerce("", "int")).toBeNull();
    expect(coerce(null, "bool")).toBe(false);
    expect(coerce("12.7", "int")).toBe(12);
    expect(coerce(12.7, "int")).toBe(13);
    expect(coerce("abc", "int")).toBeNull();
    expect(coerce("1", "bool")).toBe(true);
    expect(coerce("nao", "bool")).toBe(false);
    expect(coerce("2026-09-01", "date")).toBe("2026-09-01");
  });
});

describe("montarGruposUber — regra pura de agrupamento", () => {
  const config = { uberTimeWindowMinutes: 90, uberMaxPeoplePerCar: 4, uberAdvanceMinutes: 180, uberPickupWaitMinutes: 30 };

  it("junta quem voa do mesmo aeroporto, no mesmo dia, dentro da janela; separa por hotel", () => {
    const grupos = montarGruposUber([
      { collabId: "a", date: "2026-09-19", airport: "GRU", hotel: "H1", minutes: timeToMinutes("06:10") },
      { collabId: "b", date: "2026-09-19", airport: "GRU", hotel: "H1", minutes: timeToMinutes("07:00") },
      { collabId: "c", date: "2026-09-19", airport: "GRU", hotel: "H2", minutes: timeToMinutes("06:30") },
      { collabId: "d", date: "2026-09-19", airport: "GRU", hotel: "H1", minutes: timeToMinutes("11:00") },
    ], "ida", config);
    expect(grupos.map((g) => g.members.sort())).toEqual([["a", "b"], ["d"], ["c"]]);
    expect(grupos[0]).toMatchObject({ direction: "ida", origin: "H1", destination: "GRU", date: "2026-09-19", groupName: "Ida GRU 2026-09-19" });
    // 03:10 = 06:10 − 3h: o carro é pensado pelo voo mais cedo
    expect(grupos[0].time).toBe("03:10");
  });

  it("respeita o máximo por carro", () => {
    const grupos = montarGruposUber(
      ["a", "b", "c", "d", "e"].map((id, i) => ({ collabId: id, date: "2026-09-19", airport: "GRU", hotel: "H", minutes: 600 + i })),
      "ida", { ...config, uberMaxPeoplePerCar: 2 },
    );
    expect(grupos.map((g) => g.members.length)).toEqual([2, 2, 1]);
  });

  it("volta inverte origem/destino e quem não tem horário fica sozinho", () => {
    const grupos = montarGruposUber([
      { collabId: "a", date: "2026-09-21", airport: "GRU", hotel: "H", minutes: timeToMinutes("18:00") },
      { collabId: "b", date: "2026-09-21", airport: "GRU", hotel: "H", minutes: null },
    ], "volta", config);
    expect(grupos).toHaveLength(2);
    expect(grupos[0]).toMatchObject({ origin: "GRU", destination: "H", members: ["a"] });
    expect(grupos[1].members).toEqual(["b"]);
  });

  it("sem candidatos, sem grupos", () => {
    expect(montarGruposUber([], "ida", config)).toEqual([]);
  });
});

describe("temCabecalhoDoEspelho", () => {
  it("achou NOME e DEPARTAMENTO em qualquer linha", () => {
    expect(temCabecalhoDoEspelho([["Evento: X"], [], ["CPF", "NOME", "DN", "DEPARTAMENTO"]])).toBe(true);
    expect(temCabecalhoDoEspelho([["DASH"], ["Total", 10]])).toBe(false);
    expect(temCabecalhoDoEspelho([])).toBe(false);
  });
});
