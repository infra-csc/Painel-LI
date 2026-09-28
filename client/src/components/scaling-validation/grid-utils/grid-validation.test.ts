import { describe, it, expect } from "vitest";
import { emptyGridRow } from "./grid-rows";
import { legValue, validateGridRow } from "./grid-validation";

const DATES = ["2026-09-10", "2026-09-11", "2026-09-12"];

describe("validateGridRow", () => {
  it("horário inválido é erro, passagem sem datas é só aviso; linha vazia é ignorada", () => {
    const row = emptyGridRow("f1", "Kit", DATES, "r1");
    expect(validateGridRow(row)).toEqual({ errors: [], warnings: [] });
    row.quantities["2026-09-10"] = 1;
    row.needsTicket = true;
    // Faixa/texto com dígito vale (04/09): "14h", "8-14h". Sem dígito é erro.
    row.flightArrivalSuggestedTime = "manhã";
    const v = validateGridRow(row);
    expect(v.warnings.some((i) => i.includes("passagem"))).toBe(true);
    expect(v.errors.some((i) => i.includes("passagem"))).toBe(false);
    expect(v.errors.some((i) => i.includes("desembarque"))).toBe(true);
    row.flightArrivalSuggestedTime = "8-14h";
    expect(validateGridRow(row).errors.some((i) => i.includes("desembarque"))).toBe(false);
  });
  it("data de volta antes da ida é erro", () => {
    const row = emptyGridRow("f1", "Kit", DATES, "r1");
    row.quantities["2026-09-10"] = 1;
    row.flightDepartureDate = "2026-09-12";
    row.flightReturnDate = "2026-09-10";
    expect(validateGridRow(row).errors).toEqual(["data de volta anterior à data de ida"]);
  });
});

describe("legValue — travessão solto é ausência, não conteúdo", () => {
  it("devolve o conteúdo real quando existe", () => {
    expect(legValue("onibus")).toBe("onibus");
    expect(legValue(" 07:30 ")).toBe("07:30");
    expect(legValue("2026-09-09")).toBe("2026-09-09");
  });

  it("trata vazio e marcas de vazio como ausência", () => {
    expect(legValue(null)).toBeNull();
    expect(legValue(undefined)).toBeNull();
    expect(legValue("")).toBeNull();
    expect(legValue("   ")).toBeNull();
    expect(legValue("—")).toBeNull();   // travessão
    expect(legValue("-")).toBeNull();
    expect(legValue("--")).toBeNull();
    expect(legValue("--:--")).toBeNull();
    expect(legValue(" — ")).toBeNull();
    expect(legValue("/")).toBeNull();
  });

  it("Date inválido é ausência; Date válido passa", () => {
    expect(legValue(new Date("nada"))).toBeNull();
    const d = new Date("2026-09-09T00:00:00Z");
    expect(legValue(d)).toBe(d);
  });

  it("não engole conteúdo que só CONTÉM traço", () => {
    expect(legValue("Rio - SP")).toBe("Rio - SP");
    expect(legValue("07:30-09:00")).toBe("07:30-09:00");
  });
});
