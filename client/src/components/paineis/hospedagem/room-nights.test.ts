/**
 * Painel de hospedagem (30/10) — room night (quarto × noite) e pessoa-noite
 * (pessoa × noite), custo por room night e agrupamentos.
 */
import { describe, it, expect } from "vitest";
import type { Accommodation, Event, TeamInclusion } from "@shared/schema";
import {
  agruparEstadias, custoDaHospedagem, estadiasNoHotel, noitesDaHospedagem, numerosDoHotel, recortarEstadias,
  textoDeNoites, tipoDoApartamento,
} from "./room-nights";

const EVENTOS = [
  { id: "ssa", name: "Maratona de Salvador", startDate: "2026-11-20", endDate: "2026-11-22", diaEventoInicio: null, diaEventoFim: null },
  { id: "rio", name: "Running Hour Rio", startDate: "2026-09-10", endDate: "2026-09-12", diaEventoInicio: null, diaEventoFim: null },
] as unknown as Event[];

let seq = 0;
const vaga = (eventId: string, over: Partial<TeamInclusion> & { phase?: string } = {}) =>
  ({ id: `v${++seq}`, eventId, functionId: "prod", status: "escalado", phase: "inclusao", deletedAt: null, ...over }) as unknown as TeamInclusion;
const hosp = (teamInclusionId: string, over: Partial<Accommodation> = {}) => ({
  id: `h${++seq}`, teamInclusionId, hotelName: "Hotel Farol", hotelStatus: "reservada", roomType: "double",
  checkInDate: "2026-11-19", checkOutDate: "2026-11-22", nightsCount: null, dailyRate: 30_000, totalCents: null, ...over,
}) as unknown as Accommodation;

describe("regras unitárias", () => {
  it("tipo do apartamento aceita as grafias do app (single/duplo/double/triplo)", () => {
    expect(tipoDoApartamento("single")).toBe("single");
    expect(tipoDoApartamento("Individual")).toBe("single");
    expect(tipoDoApartamento("duplo")).toBe("double");
    expect(tipoDoApartamento("double")).toBe("double");
    expect(tipoDoApartamento("Triplo")).toBe("triple");
    expect(tipoDoApartamento(null)).toBe("");
    expect(tipoDoApartamento("suíte master")).toBe("");
  });

  it("noites: diárias informadas; senão check-out − check-in; sem nada, null", () => {
    expect(noitesDaHospedagem({ nightsCount: 4, checkInDate: null, checkOutDate: null })).toBe(4);
    expect(noitesDaHospedagem({ nightsCount: null, checkInDate: "2026-11-19", checkOutDate: "2026-11-22" })).toBe(3);
    expect(noitesDaHospedagem({ nightsCount: 0, checkInDate: "2026-11-22", checkOutDate: "2026-11-22" })).toBeNull();
    expect(noitesDaHospedagem({ nightsCount: null, checkInDate: null, checkOutDate: null })).toBeNull();
  });

  it("custo: total; senão diária × noites", () => {
    expect(custoDaHospedagem({ totalCents: 50_000, dailyRate: 1 }, 3)).toBe(50_000);
    expect(custoDaHospedagem({ totalCents: null, dailyRate: 30_000 }, 3)).toBe(90_000);
    expect(custoDaHospedagem({ totalCents: null, dailyRate: null }, 3)).toBeNull();
  });
});

function cenario() {
  seq = 0;
  const [a, b, c, d, e, f, g, h] = [vaga("ssa"), vaga("ssa"), vaga("ssa"), vaga("ssa"), vaga("rio"), vaga("ssa", { status: "cancelado" }), vaga("ssa", { phase: "sugestao", status: "sugestao_pendente" }), vaga("ssa")];
  const vagas = [a, b, c, d, e, f, g, h];
  const hospedagens = [
    hosp(a.id), hosp(b.id), // o Duplo: 2 pessoas × 3 noites = 6 pessoa-noites, 3 room nights
    hosp(c.id, { roomType: "single", hotelName: "hotel  farol", totalCents: 120_000 }), // mesmo hotel, outra grafia
    hosp(d.id, { roomType: null, hotelName: "Pousada Sol", nightsCount: null, checkInDate: null, checkOutDate: null }), // sem noites
    hosp(e.id, { roomType: "triplo", hotelName: "Copa Hotel", checkInDate: "2026-09-09", checkOutDate: "2026-09-12" }),
    hosp(f.id), // vaga cancelada: fora
    hosp(g.id), // sugestão: fora
    hosp(h.id, { hotelStatus: "cancelada" }), // hospedagem cancelada: fora
    hosp(h.id, { id: "sem-hotel", hotelName: "  " }), // sem hotel: fora
  ];
  return { vagas, hospedagens };
}

describe("estadias e números", () => {
  it("só hospedagem que conta, de vaga viva fora da sugestão", () => {
    const { vagas, hospedagens } = cenario();
    const es = estadiasNoHotel(hospedagens, vagas, EVENTOS);
    expect(es).toHaveLength(5);
    expect(es.find((x) => x.teamInclusionId === vagas[0].id)).toMatchObject({ noites: 3, roomNights: 1.5, custo: 90_000, dataEvento: "2026-11-22", hotel: "hotel farol" });
  });

  it("room nights × pessoa-noites e custo por cada um", () => {
    const { vagas, hospedagens } = cenario();
    const es = estadiasNoHotel(hospedagens, vagas, EVENTOS);
    const n = numerosDoHotel(es);
    // Duplo 3 + Individual 3 + Triplo 1 (3 noites ÷ 3) = 7 room nights; pessoa-noites 3+3+3+3 = 12.
    expect(n).toMatchObject({ hospedagens: 5, roomNights: 7, pessoaNoites: 12, semNoites: 1, semCusto: 1 });
    // Custo: 90.000 + 90.000 + 120.000 + 90.000 = 390.000; ÷ 7 room nights; ÷ 12 pessoa-noites.
    expect(n.custo).toBe(390_000);
    expect(n.porRoomNight).toBe(Math.round(390_000 / 7));
    expect(n.porPessoaNoite).toBe(32_500);
    expect(n.tipos).toEqual({ single: 1, double: 2, triple: 1, "": 1 });
  });

  it("agrupa por hotel (grafias juntas), por evento e por tipo", () => {
    const { vagas, hospedagens } = cenario();
    const es = estadiasNoHotel(hospedagens, vagas, EVENTOS);
    const porHotel = agruparEstadias(es, "hotel");
    expect(porHotel[0]).toMatchObject({ chave: "hotel farol", nome: "Hotel Farol", hospedagens: 3, roomNights: 6, outros: ["Maratona de Salvador"] });
    const porEvento = agruparEstadias(es, "evento");
    expect(porEvento.map((g) => g.chave)).toEqual(["ssa", "rio"]);
    expect(porEvento[0].outros).toEqual(["Hotel Farol", "Pousada Sol"]); // "hotel  farol" é o mesmo hotel
    expect(agruparEstadias(es, "tipo").map((g) => g.nome)).toEqual(["Individual", "Duplo", "Triplo", "Sem tipo"]);
  });

  it("recorte pelo dia do evento, evento e função", () => {
    const { vagas, hospedagens } = cenario();
    const es = estadiasNoHotel(hospedagens, vagas, EVENTOS);
    expect(recortarEstadias(es, { de: "2026-10-30", ate: null, eventId: "all", funcoes: [] })).toHaveLength(4);
    expect(recortarEstadias(es, { de: null, ate: null, eventId: "rio", funcoes: [] })).toHaveLength(1);
    expect(recortarEstadias(es, { de: null, ate: null, eventId: "all", funcoes: ["ceno"] })).toHaveLength(0);
  });

  it("texto de noites com uma casa", () => {
    expect(textoDeNoites(7)).toBe("7");
    expect(textoDeNoites(3.5)).toBe("3,5");
  });
});
