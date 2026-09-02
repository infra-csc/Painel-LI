import { describe, it, expect } from "vitest";
import type { Accommodation, Event, TeamInclusion } from "@shared/schema";
import {
  contadoresDaFila, contarDiarias, dataDeChegada, diasAte, ehUrgente,
  jaRegistrada, pertenceAoBloco, precisaReservar, temTrocaPendente,
} from "./accommodations-queue";

const HOJE = "2026-09-02";

const EVENTOS = new Map<string, Event>([
  ["e1", { id: "e1", name: "Evento 1", startDate: "2026-09-20" } as Event],
  ["perto", { id: "perto", name: "Já já", startDate: "2026-09-05" } as Event],
]);

const ctx = (over: Partial<Parameters<typeof contadoresDaFila>[1]> = {}) => ({
  eventById: EVENTOS,
  accommodationMap: new Map<string, Accommodation>(),
  pendingSwapByInclusion: new Set<string>(),
  hoje: HOJE,
  ...over,
});

let seq = 0;
const vaga = (over: Partial<TeamInclusion> = {}) => ({
  id: `v${++seq}`, inclusionNumber: seq,
  eventId: "e1", functionId: "f1", collaboratorId: "c1",
  needsAccommodation: true, status: "escalado",
  ...over,
}) as TeamInclusion;

const hospedagem = (over: Partial<Accommodation> = {}) =>
  ({ id: "a" + Math.random(), hotelName: "Ibis Centro", ...over }) as Accommodation;

describe("data de chegada", () => {
  it("o período de trabalho manda; a data do evento é o reserva", () => {
    // Quem monta chega antes e quem entra no meio chega depois — a data do
    // evento não descreve nenhum dos dois.
    expect(dataDeChegada(vaga({ scheduleStartDate: "2026-09-18" }), EVENTOS)).toBe("2026-09-18");
    expect(dataDeChegada(vaga({ scheduleStartDate: null }), EVENTOS)).toBe("2026-09-20");
  });

  it("sem período e sem evento conhecido, não há data", () => {
    expect(dataDeChegada(vaga({ scheduleStartDate: null, eventId: "sumiu" }), EVENTOS)).toBeNull();
  });

  it("aceita timestamp e fica só com a data", () => {
    expect(dataDeChegada(vaga({ scheduleStartDate: "2026-09-18T00:00:00.000Z" as never }), EVENTOS)).toBe("2026-09-18");
  });
});

describe("diasAte", () => {
  it("conta dias de calendário sem fuso no meio", () => {
    expect(diasAte("2026-09-09", HOJE)).toBe(7);
    expect(diasAte("2026-09-02", HOJE)).toBe(0);
    expect(diasAte("2026-08-30", HOJE)).toBe(-3);
  });
});

describe("os quatro blocos", () => {
  it("Reservar é quem não tem registro e não foi cancelada", () => {
    const v = vaga();
    expect(precisaReservar(v, ctx())).toBe(true);
    expect(precisaReservar(v, ctx({ accommodationMap: new Map([[v.id, hospedagem()]]) }))).toBe(false);
    expect(precisaReservar(vaga({ status: "cancelado" }), ctx())).toBe(false);
  });

  it("Urgente é chegar em até 7 dias SEM reserva", () => {
    expect(ehUrgente(vaga({ scheduleStartDate: "2026-09-09" }), ctx())).toBe(true);  // exatamente 7
    expect(ehUrgente(vaga({ scheduleStartDate: "2026-09-10" }), ctx())).toBe(false); // 8
    // Já registrada não é urgente — o trabalho está feito.
    const feita = vaga({ scheduleStartDate: "2026-09-03" });
    expect(ehUrgente(feita, ctx({ accommodationMap: new Map([[feita.id, hospedagem()]]) }))).toBe(false);
  });

  it("quem já deveria ter chegado continua urgente por uma semana", () => {
    // O atrasado recente é o caso mais grave: a pessoa viajou e está sem hotel.
    expect(ehUrgente(vaga({ scheduleStartDate: "2026-08-28" }), ctx())).toBe(true);  // -5
    expect(ehUrgente(vaga({ scheduleStartDate: "2026-08-26" }), ctx())).toBe(true);  // -7, no limite
  });

  it("mas evento que acabou há meses não é urgência, é histórico", () => {
    /**
     * Medido nos dados reais: 1.348 das 2.011 vagas sem reserva têm chegada há
     * mais de 30 dias. Contando todo o passado, "Urgente" marcava 1.540 de
     * 1.822 e deixava de escolher trabalho nenhum.
     */
    expect(ehUrgente(vaga({ scheduleStartDate: "2026-08-25" }), ctx())).toBe(false); // -8
    expect(ehUrgente(vaga({ scheduleStartDate: "2026-02-10" }), ctx())).toBe(false);
  });

  it("sem data de chegada não dá para dizer que é urgente", () => {
    expect(ehUrgente(vaga({ scheduleStartDate: null, eventId: "sumiu" }), ctx())).toBe(false);
  });

  it("Troca é troca pendente, e cancelada não conta", () => {
    const v = vaga();
    const comTroca = ctx({ pendingSwapByInclusion: new Set([v.id]) });
    expect(temTrocaPendente(v, comTroca)).toBe(true);
    const cancelada = vaga({ status: "cancelado" });
    expect(temTrocaPendente(cancelada, ctx({ pendingSwapByInclusion: new Set([cancelada.id]) }))).toBe(false);
  });

  it("Registradas é ter registro, inclusive se a inclusão foi cancelada depois", () => {
    // A reserva existe no hotel mesmo que a escalação tenha caído — escondê-la
    // faria a diária sumir da conta sem ninguém cancelar nada.
    const v = vaga({ status: "cancelado" });
    expect(jaRegistrada(v, ctx({ accommodationMap: new Map([[v.id, hospedagem()]]) }))).toBe(true);
  });

  it("pertenceAoBloco despacha para a mesma regra", () => {
    const v = vaga({ scheduleStartDate: "2026-09-03" });
    expect(pertenceAoBloco("urgente", v, ctx())).toBe(true);
    expect(pertenceAoBloco("registradas", v, ctx())).toBe(false);
  });
});

describe("diárias", () => {
  it("diária é noite dormida, não dia no calendário", () => {
    expect(contarDiarias("2026-09-11", "2026-09-15")).toBe(4);
  });

  it("entrar e sair no mesmo dia é uma diária — o quarto foi ocupado", () => {
    expect(contarDiarias("2026-09-11", "2026-09-11")).toBe(1);
  });

  it("datas faltando ou invertidas não inventam diária", () => {
    expect(contarDiarias(null, "2026-09-15")).toBe(0);
    expect(contarDiarias("2026-09-11", null)).toBe(0);
    expect(contarDiarias("2026-09-15", "2026-09-11")).toBe(0);
  });
});

describe("contadores da fila", () => {
  it("uma passagem só devolve os quatro números e a sub-linha", () => {
    const aReservar = vaga({ scheduleStartDate: "2026-09-25" });
    const urgente = vaga({ scheduleStartDate: "2026-09-04" });
    const registrada1 = vaga();
    const registrada2 = vaga();
    const registrada3 = vaga();
    const cancelada = vaga({ status: "cancelado" });
    const comTroca = vaga({ scheduleStartDate: "2026-09-25" });

    const mapa = new Map<string, Accommodation>([
      [registrada1.id, hospedagem({ hotelName: "Ibis Centro", checkInDate: "2026-09-11", checkOutDate: "2026-09-15" })],
      [registrada2.id, hospedagem({ hotelName: "ibis centro ", checkInDate: "2026-09-11", checkOutDate: "2026-09-15" })],
      [registrada3.id, hospedagem({ hotelName: "Mercure", checkInDate: "2026-09-12", checkOutDate: "2026-09-15" })],
    ]);

    const r = contadoresDaFila(
      [aReservar, urgente, registrada1, registrada2, registrada3, cancelada, comTroca],
      ctx({ accommodationMap: mapa, pendingSwapByInclusion: new Set([comTroca.id]) }),
    );

    expect(r.reservar).toBe(3);      // aReservar + urgente + comTroca (cancelada fora)
    expect(r.urgente).toBe(1);
    expect(r.troca).toBe(1);
    expect(r.registradas).toBe(3);
    // "Ibis Centro" e "ibis centro " são o mesmo hotel — o operador digitou.
    expect(r.hoteisDistintos).toBe(2);
    expect(r.diarias).toBe(4 + 4 + 3);
  });

  it("lista vazia devolve zeros, não NaN", () => {
    expect(contadoresDaFila([], ctx())).toEqual({
      reservar: 0, urgente: 0, troca: 0, registradas: 0, hoteisDistintos: 0, diarias: 0,
    });
  });
});
