import { describe, expect, it } from "vitest";
import {
  DATA_DE_CORTE_PADRAO, dataDeCorteLegivel, dataDeCorteValida, ehEventoLegado, ehRecorteDoLegado, eventoNoRecorte, lerDataDeCorte,
} from "./legado-honorarios";

describe("data de corte do legado (decisão de 26/10)", () => {
  it("padrão: 01/11/2026", () => {
    expect(DATA_DE_CORTE_PADRAO).toBe("2026-11-01");
    expect(lerDataDeCorte(undefined)).toBe("2026-11-01");
    expect(lerDataDeCorte("  ")).toBe("2026-11-01");
    expect(lerDataDeCorte("2026-12-01")).toBe("2026-12-01");
    expect(lerDataDeCorte("31/12/2026")).toBe("2026-11-01");
    expect(dataDeCorteLegivel("2026-11-01")).toBe("01/11/2026");
  });

  it("só aceita data real AAAA-MM-DD", () => {
    expect(dataDeCorteValida("2026-11-01")).toBe(true);
    expect(dataDeCorteValida("2028-02-29")).toBe(true);
    expect(dataDeCorteValida("2026-02-30")).toBe(false);
    expect(dataDeCorteValida("2026-13-01")).toBe(false);
    expect(dataDeCorteValida("2026-11-1")).toBe(false);
    expect(dataDeCorteValida(20261101)).toBe(false);
  });
});

describe("ehEventoLegado: o FIM do evento é anterior à data de corte", () => {
  const corte = "2026-11-01";
  it("termina em 31/10 → legado; termina em 01/11 → fluxo novo", () => {
    expect(ehEventoLegado("2026-10-31", corte)).toBe(true);
    expect(ehEventoLegado("2026-11-01", corte)).toBe(false);
    expect(ehEventoLegado("2026-12-15", corte)).toBe(false);
  });
  it("começou antes do corte mas termina depois → fluxo novo", () => {
    expect(ehEventoLegado("2026-11-03", corte)).toBe(false);
  });
  it("aceita timestamp e Date; sem fim → fluxo novo", () => {
    expect(ehEventoLegado("2026-10-31T23:00:00.000Z", corte)).toBe(true);
    expect(ehEventoLegado(new Date("2026-10-15T12:00:00Z"), corte)).toBe(true);
    expect(ehEventoLegado(null, corte)).toBe(false);
    expect(ehEventoLegado("lixo", corte)).toBe(false);
  });
});

describe("recortes", () => {
  it("fluxo novo, legado e todos", () => {
    expect(eventoNoRecorte(true, "legado")).toBe(true);
    expect(eventoNoRecorte(false, "legado")).toBe(false);
    expect(eventoNoRecorte(true, "fluxo_novo")).toBe(false);
    expect(eventoNoRecorte(false, "fluxo_novo")).toBe(true);
    expect(eventoNoRecorte(true, "todos")).toBe(true);
    expect(ehRecorteDoLegado("legado")).toBe(true);
    expect(ehRecorteDoLegado("outro")).toBe(false);
  });
});
