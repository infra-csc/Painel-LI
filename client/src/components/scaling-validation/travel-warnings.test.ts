import { describe, it, expect } from "vitest";
import { avisosDeViagem } from "./travel-warnings";

const dias = ["2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"];

describe("avisosDeViagem — ida/volta × diárias (só aviso, nunca trava)", () => {
  it("sem dias de trabalho não avisa nada", () => {
    expect(avisosDeViagem({ flightDepartureDate: "2026-10-21", flightReturnDate: "2026-10-25" })).toEqual([]);
    expect(avisosDeViagem({ flightDepartureDate: "2026-10-21", flightReturnDate: "2026-10-25" }, [])).toEqual([]);
  });
  it("ida na véspera e volta no último dia: avisa que não há diária na ida", () => {
    const a = avisosDeViagem({ flightDepartureDate: "2026-10-21", flightReturnDate: "2026-10-25" }, dias);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatch(/Ida em 21\/10 — não há diária/);
  });
  it("ida depois do primeiro dia e volta antes do último são os avisos fortes", () => {
    const a = avisosDeViagem({ flightDepartureDate: "2026-10-23", flightReturnDate: "2026-10-24" }, dias);
    expect(a[0]).toMatch(/Ida em 23\/10, depois do primeiro dia/);
    expect(a[1]).toMatch(/Volta em 24\/10, antes do último dia/);
  });
  it("ida e volta dentro dos dias de trabalho: nada a avisar", () => {
    expect(avisosDeViagem({ flightDepartureDate: "2026-10-22", flightReturnDate: "2026-10-25" }, dias)).toEqual([]);
  });
  it("datas vazias não geram aviso", () => {
    expect(avisosDeViagem({ flightDepartureDate: "", flightReturnDate: "" }, dias)).toEqual([]);
  });
});
