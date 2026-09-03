import { describe, it, expect } from "vitest";
import type { MirrorRow } from "./operational-mirror-types";
import {
  BLOCOS_QUE_PENDENCIAM, blocoEmUso, blocosAbertos, caiNoChip, contextoDaLinha,
  estadoDoBloco, faltamNoBloco, resumoDoEvento, temSugestaoAConfirmar, textoDaSituacao,
} from "./mirror-pendencia";

/**
 * A regra de pendência por bloco (02/09) substitui a contagem de campos. Estes
 * testes travam as seis decisões do handoff: só três blocos pendenciam; bloco
 * fora de uso não conta; vazio ≠ não se aplica; a unidade é o bloco; sugestão
 * não confirmada é falta; extras nunca travam.
 */

const SEM_GRUPOS = { uber: new Set<string>(), quartos: new Set<string>() };

let seq = 0;
function linha(over: Partial<MirrorRow> = {}): MirrorRow {
  seq += 1;
  return {
    teamInclusionId: `ti-${seq}`,
    collaborator: { id: `c-${seq}`, fullName: `Pessoa ${seq}`, gender: "M", city: null, state: null, type: null },
    function: { id: "f1", name: "Produção", costCenter: null, area: "produção" },
    schedule: { startDate: "2026-09-10", endDate: "2026-09-14", flightDepartureDate: "2026-09-10", flightReturnDate: "2026-09-14", dailyRates: 4 },
    ticket: null,
    accommodation: null,
    observations: null,
    baggage: { totalCents: 0, extraCents: 0, oc: null, notes: null, checkIn: null },
    uber: { totalCents: 0, oc: null, notes: null, checkIn: null, suggestedGroupId: null, groupName: null },
    carRental: { company: null, totalCents: 0, oc: null, notes: null, checkIn: null },
    skipUber: false,
    suggestedRoomGroupId: null,
    roomGroupLabel: null,
    pendencies: [],
    ...over,
  } as MirrorRow;
}

/** Passagem com todos os campos cobrados preenchidos. */
const PASSAGEM_COMPLETA = {
  value: 184200, departureAirport: "GRU", returnOriginAirport: "BSB",
  actualDepartureTime: "07:10", actualReturnTime: "19:40", locator: "KXQ8ZP",
  ticketCompany: "LATAM", purchaseOrderNumber: "OC-1", checkIn3: "ok",
} as unknown as MirrorRow["ticket"];

const HOSPEDAGEM_COMPLETA = {
  hotelName: "Hotel Nacional", reservationNumber: "R-1", checkInDate: "2026-09-10", checkOutDate: "2026-09-14",
  nightsCount: 4, dailyRate: 30000, totalCents: 120000, paymentCompany: "Norte", hotelOc: "OC-2", checkIn4: "ok",
} as unknown as MirrorRow["accommodation"];

describe("só três blocos travam o fechamento", () => {
  it("bagagem e locação nunca abrem, mesmo sem OC", () => {
    const r = linha({
      baggage: { totalCents: 12000, extraCents: 12000, oc: null, notes: null, checkIn: null },
      carRental: { company: "Localiza", totalCents: 98000, oc: null, notes: null, checkIn: null },
    });
    const ctx = contextoDaLinha(r, SEM_GRUPOS);
    expect(BLOCOS_QUE_PENDENCIAM).toEqual(["passagem", "hospedagem", "uber"]);
    expect(blocosAbertos(r, ctx)).toEqual([]);
    expect(estadoDoBloco("bagagem", r, ctx)).toBe("lancado");
    expect(estadoDoBloco("locacao", r, ctx)).toBe("lancado");
  });
});

describe("bloco em uso", () => {
  it("quem não precisa de passagem e não tem registro não usa passagem", () => {
    // Mora na cidade do evento: não fica pendente de passagem nem de Uber.
    const r = linha({ needsTicket: false });
    expect(blocoEmUso("passagem", r)).toBe(false);
    expect(blocoEmUso("uber", r)).toBe(false);
    expect(blocosAbertos(r, contextoDaLinha(r, SEM_GRUPOS))).toEqual([]);
  });

  it("precisar de passagem e não ter registro é bloco em uso e aberto", () => {
    const r = linha({ needsTicket: true });
    const ctx = contextoDaLinha(r, SEM_GRUPOS);
    expect(blocoEmUso("passagem", r)).toBe(true);
    expect(blocosAbertos(r, ctx)).toContain("passagem");
    expect(caiNoChip("semPassagem", r, ctx)).toBe(true);
  });

  it("sem o sinal da inclusão, ter o registro basta para estar em uso", () => {
    // Servidor antigo não manda needsTicket: a regra cai no registro.
    const r = linha({ ticket: PASSAGEM_COMPLETA });
    expect(blocoEmUso("passagem", r)).toBe(true);
  });

  it("uber é o traslado do aeroporto: sem passagem, sem uber; dispensado, sem uber", () => {
    expect(blocoEmUso("uber", linha({ needsTicket: true }))).toBe(true);
    expect(blocoEmUso("uber", linha({ needsTicket: true, skipUber: true }))).toBe(false);
    expect(blocoEmUso("uber", linha({ needsTicket: false }))).toBe(false);
  });
});

describe("vazio ≠ não se aplica", () => {
  it("passagem completa fecha o bloco; faltar o localizador reabre", () => {
    const completa = linha({ needsTicket: true, ticket: PASSAGEM_COMPLETA, skipUber: true });
    expect(blocosAbertos(completa, contextoDaLinha(completa, SEM_GRUPOS))).toEqual([]);

    const semLoc = linha({ needsTicket: true, ticket: { ...PASSAGEM_COMPLETA, locator: null } as MirrorRow["ticket"], skipUber: true });
    const ctx = contextoDaLinha(semLoc, SEM_GRUPOS);
    expect(blocosAbertos(semLoc, ctx)).toEqual(["passagem"]);
    expect(caiNoChip("semLocalizador", semLoc, ctx)).toBe(true);
    expect(caiNoChip("semPassagem", semLoc, ctx)).toBe(false);
  });

  it("hospedagem: sem hotel é falta; com hotel, o resto do bloco passa a ser cobrado", () => {
    const soHotel = linha({ needsAccommodation: true, accommodation: { hotelName: "Ibis" } as MirrorRow["accommodation"], needsTicket: false });
    const ctx = contextoDaLinha(soHotel, SEM_GRUPOS);
    expect(blocosAbertos(soHotel, ctx)).toEqual(["hospedagem"]);
    expect(faltamNoBloco("hospedagem", soHotel, ctx)).toBeGreaterThan(0);

    const completa = linha({ needsAccommodation: true, accommodation: HOSPEDAGEM_COMPLETA, needsTicket: false });
    expect(blocosAbertos(completa, contextoDaLinha(completa, SEM_GRUPOS))).toEqual([]);
  });
});

describe("sugestão não confirmada é falta", () => {
  it("uber sugerido e não confirmado abre o bloco; confirmado, fecha", () => {
    const base = {
      needsTicket: true, ticket: PASSAGEM_COMPLETA,
      uber: { totalCents: 8640, oc: "OC-9", notes: null, checkIn: "ok", suggestedGroupId: "g1", groupName: "Carro 1" },
    };
    const sugerido = linha(base);
    const ctxS = contextoDaLinha(sugerido, SEM_GRUPOS);
    expect(blocosAbertos(sugerido, ctxS)).toEqual(["uber"]);
    expect(temSugestaoAConfirmar(sugerido, ctxS)).toBe(true);
    expect(estadoDoBloco("uber", sugerido, ctxS)).toBe("a_completar");

    const confirmado = linha(base);
    const ctxC = contextoDaLinha(confirmado, { uber: new Set(["g1"]), quartos: new Set() });
    expect(blocosAbertos(confirmado, ctxC)).toEqual([]);
    expect(temSugestaoAConfirmar(confirmado, ctxC)).toBe(false);
  });
});

describe("a unidade é o bloco", () => {
  it("o texto nunca conta campos", () => {
    expect(textoDaSituacao(0)).toBe("pronto");
    expect(textoDaSituacao(1)).toBe("1 bloco aberto");
    expect(textoDaSituacao(3)).toBe("3 blocos abertos");
  });

  it("dois campos faltando no mesmo bloco é UM bloco aberto", () => {
    const r = linha({ needsTicket: true, ticket: { ...PASSAGEM_COMPLETA, locator: null, purchaseOrderNumber: null } as MirrorRow["ticket"], skipUber: true });
    const ctx = contextoDaLinha(r, SEM_GRUPOS);
    expect(faltamNoBloco("passagem", r, ctx)).toBe(2);
    expect(blocosAbertos(r, ctx)).toHaveLength(1);
  });
});

describe("chips olham só os blocos que pendenciam e estão em uso", () => {
  it("OC faltando na bagagem não cai em Sem OC", () => {
    const r = linha({
      needsTicket: false, needsAccommodation: false,
      baggage: { totalCents: 12000, extraCents: 12000, oc: null, notes: null, checkIn: null },
    });
    expect(caiNoChip("semOc", r, contextoDaLinha(r, SEM_GRUPOS))).toBe(false);
  });

  it("OC faltando no hotel cai em Sem OC; conferência faltando na passagem cai em Sem conferência", () => {
    const r = linha({
      needsTicket: true, skipUber: true,
      ticket: { ...PASSAGEM_COMPLETA, checkIn3: null } as MirrorRow["ticket"],
      needsAccommodation: true,
      accommodation: { ...HOSPEDAGEM_COMPLETA, hotelOc: null } as MirrorRow["accommodation"],
    });
    const ctx = contextoDaLinha(r, SEM_GRUPOS);
    expect(caiNoChip("semOc", r, ctx)).toBe(true);
    expect(caiNoChip("semConferencia", r, ctx)).toBe(true);
  });
});

describe("resumo do evento", () => {
  it("uma passagem só devolve pessoas travando, blocos e chips", () => {
    const pronta = linha({ needsTicket: true, ticket: PASSAGEM_COMPLETA, skipUber: true, needsAccommodation: true, accommodation: HOSPEDAGEM_COMPLETA });
    const semPassagem = linha({ needsTicket: true, skipUber: true, needsAccommodation: false });
    const local = linha({ needsTicket: false, needsAccommodation: false });
    const comBagagem = linha({ needsTicket: false, needsAccommodation: false, baggage: { totalCents: 5000, extraCents: 5000, oc: null, notes: null, checkIn: null } });

    const r = resumoDoEvento([pronta, semPassagem, local, comBagagem], SEM_GRUPOS);

    expect(r.pessoasTravando).toBe(1);
    expect(r.porBloco.passagem).toEqual({ bloco: "passagem", emUso: 2, prontas: 1, faltam: 1 });
    expect(r.porBloco.hospedagem).toEqual({ bloco: "hospedagem", emUso: 1, prontas: 1, faltam: 0 });
    // Eventual: em uso = lançamentos, nunca "faltam".
    expect(r.porBloco.bagagem).toEqual({ bloco: "bagagem", emUso: 1, prontas: 1, faltam: 0 });
    expect(r.porChip.semPassagem).toBe(1);
    expect(r.porChip.semOc).toBe(0);
  });

  it("evento vazio devolve zeros, não NaN", () => {
    const r = resumoDoEvento([], SEM_GRUPOS);
    expect(r.pessoasTravando).toBe(0);
    expect(r.porBloco.uber.emUso).toBe(0);
  });
});
