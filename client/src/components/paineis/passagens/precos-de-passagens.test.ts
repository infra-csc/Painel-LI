/**
 * Painel de passagens (30/10) — comparação de preços: unidade por compra
 * (⇄ ida e volta, → trecho), tipo por trecho, típico da rota e o teto.
 */
import { describe, it, expect } from "vitest";
import type { Event, TeamInclusion, Ticket } from "@shared/schema";
import {
  acimaDoTipico, agruparPrecos, estatistica, precosDasPassagens, recortarPrecos, rotuloDoMes, tiposPresentes,
} from "./precos-de-passagens";

const EVENTOS = [
  { id: "ssa", name: "Maratona de Salvador", startDate: "2026-11-20", endDate: "2026-11-22", status: "planejado" },
  { id: "rio", name: "Running Hour Rio", startDate: "2026-09-10", endDate: "2026-09-12", status: "planejado" },
  { id: "x", name: "Evento excluído", startDate: "2026-11-01", endDate: "2026-11-02", status: "excluido" },
] as unknown as Event[];

let seq = 0;
const vaga = (eventId: string, over: Partial<TeamInclusion> = {}) =>
  ({ id: `v${++seq}`, inclusionNumber: 100 + seq, eventId, functionId: "prod", collaboratorId: `c${seq}`, deletedAt: null, ...over }) as unknown as TeamInclusion;

const idaEVolta = (teamInclusionId: string, value: number | null, over: Partial<Ticket> = {}) => ({
  id: `t${++seq}`, teamInclusionId, value, transportType: "aereo", returnTransportType: null, returnValue: null,
  ticketCompany: "LATAM", departureAirport: "GRU", destinationAirport: "SSA", departureCityOrigin: "São Paulo", departureCityDestination: "Salvador",
  returnOriginAirport: "SSA", returnDestinationAirport: "GRU", returnCityOrigin: "Salvador", returnCityDestination: "São Paulo",
  actualDepartureDate: "2026-11-19", actualReturnDate: "2026-11-23", archivedAt: null, ...over,
}) as unknown as Ticket;

function base() {
  seq = 0;
  const vs = Array.from({ length: 8 }, () => vaga("ssa"));
  const rio = vaga("rio");
  const excluida = vaga("ssa", { deletedAt: new Date() as unknown as TeamInclusion["deletedAt"] });
  const doExcluido = vaga("x");
  const vagas = [...vs, rio, excluida, doExcluido];
  const passagens = [
    idaEVolta(vs[0].id, 100_000), idaEVolta(vs[1].id, 110_000), idaEVolta(vs[2].id, 90_000),
    idaEVolta(vs[3].id, 200_000, { ticketCompany: "Latam Airlines" }), // muito acima (mediana 105.000 × 1,3 = 136.500)
    idaEVolta(vs[4].id, null), // sem valor
    // Só ida: trecho "→", não se mistura com a rota ⇄.
    idaEVolta(vs[5].id, 60_000, { actualReturnDate: null, returnCityOrigin: null, returnCityDestination: null, returnOriginAirport: null, returnDestinationAirport: null }),
    // Ida aérea + volta de ônibus (28/10): dois trechos, cada um no seu tipo e com o seu valor.
    idaEVolta(vs[6].id, 53_893, { returnTransportType: "rodoviario", returnValue: 15_000, returnOriginAirport: "", returnCityOrigin: "Salvador", returnCityDestination: "Feira de Santana", returnDestinationAirport: null }),
    idaEVolta(rio.id, 80_000, { destinationAirport: "SDU", departureCityDestination: "Rio", ticketCompany: "GOL", actualDepartureDate: "2026-09-09" }),
    idaEVolta(excluida.id, 999_999),
    idaEVolta(doExcluido.id, 999_999),
  ];
  return { vagas, passagens };
}

describe("precosDasPassagens", () => {
  it("uma unidade por compra; volta de outro tipo vira dois trechos; vaga e evento excluídos ficam fora", () => {
    const { vagas, passagens } = base();
    const u = precosDasPassagens(passagens, vagas, EVENTOS);
    expect(u).toHaveLength(9);
    const partes = u.filter((p) => p.ticketId === passagens[6].id);
    expect(partes.map((p) => [p.tipo, p.valor, p.rota?.nome])).toEqual([
      ["aereo", 38_893, "GRU → SSA"],
      ["rodoviario", 15_000, "Salvador → Feira de Santana"],
    ]);
    expect(u.find((p) => p.ticketId === passagens[0].id)?.rota?.nome).toBe("GRU ⇄ SSA");
    expect(u.find((p) => p.ticketId === passagens[5].id)?.rota?.nome).toBe("GRU → SSA");
    // "Latam Airlines" é LATAM.
    expect(u.find((p) => p.ticketId === passagens[3].id)?.companhia).toBe("LATAM");
  });

  it("passagem repetida (atual e histórico na mesma lista) conta uma vez", () => {
    const { vagas, passagens } = base();
    expect(precosDasPassagens([...passagens, passagens[0]], vagas, EVENTOS)).toHaveLength(9);
  });
});

describe("agrupar e comparar", () => {
  it("por rota: qtde, média, mín e máx só com valor; ⇄ e → separados", () => {
    const { vagas, passagens } = base();
    const u = precosDasPassagens(passagens, vagas, EVENTOS);
    const g = agruparPrecos(u, "rota");
    const rt = g.find((x) => x.nome === "GRU ⇄ SSA")!;
    expect(rt).toMatchObject({ qtde: 5, comValor: 4, total: 500_000, media: 125_000, min: 90_000, max: 200_000, mediana: 105_000 });
    const ow = g.find((x) => x.nome === "GRU → SSA")!;
    expect(ow.qtde).toBe(2);
    expect(g[0].nome).toBe("GRU ⇄ SSA"); // mais comprada primeiro
  });

  it("por tipo e por mês da viagem (meses em ordem)", () => {
    const { vagas, passagens } = base();
    const u = precosDasPassagens(passagens, vagas, EVENTOS);
    expect(agruparPrecos(u, "tipo").map((x) => [x.chave, x.qtde])).toEqual([["aereo", 8], ["rodoviario", 1]]);
    expect(agruparPrecos(u, "mes").map((x) => x.nome)).toEqual(["set/26", "nov/26"]);
    expect(rotuloDoMes("2026-01")).toBe("jan/26");
  });

  it("muito acima do típico: mediana da rota (≥ 3 com valor) + teto de 30%", () => {
    const { vagas, passagens } = base();
    const u = precosDasPassagens(passagens, vagas, EVENTOS);
    const acima = acimaDoTipico(u, u);
    expect(acima).toHaveLength(1);
    expect(acima[0]).toMatchObject({ tipico: 105_000, pctAcima: 90 });
    expect(acima[0].item.valor).toBe(200_000);
    // Com teto maior, ninguém.
    expect(acimaDoTipico(u, u, 100)).toHaveLength(0);
    // O típico sai de TODAS as passagens, mesmo com o recorte num evento só.
    const soUma = u.filter((p) => p.valor === 200_000);
    expect(acimaDoTipico(soUma, u)).toHaveLength(1);
    // Grupo conta quantas acima.
    const ids = new Set(acima.map((a) => a.item.id));
    expect(agruparPrecos(u, "rota", ids).find((x) => x.nome === "GRU ⇄ SSA")?.acima).toBe(1);
  });

  it("recorte: período pelo início do evento, evento, função e tipo", () => {
    const { vagas, passagens } = base();
    const u = precosDasPassagens(passagens, vagas, EVENTOS);
    const todos = { de: null, ate: null, eventId: "all", funcoes: [], tipo: "all" };
    expect(recortarPrecos(u, { ...todos, de: "2026-10-01" })).toHaveLength(8);
    expect(recortarPrecos(u, { ...todos, eventId: "rio" })).toHaveLength(1);
    expect(recortarPrecos(u, { ...todos, tipo: "rodoviario" })).toHaveLength(1);
    expect(recortarPrecos(u, { ...todos, funcoes: ["outra"] })).toHaveLength(0);
    expect(tiposPresentes(u).map((t) => [t.id, t.n])).toEqual([["aereo", 8], ["rodoviario", 1]]);
  });

  it("estatística de lista vazia ou sem valor", () => {
    expect(estatistica([])).toMatchObject({ qtde: 0, media: null, min: null, max: null });
    expect(estatistica([{ valor: null }, { valor: 0 }])).toMatchObject({ qtde: 2, comValor: 0, media: null });
  });
});
