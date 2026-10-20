import { describe, expect, it } from "vitest";
import { fonteDoHotel, hotelTotalCents, isHotelTotalDerived, type LinhaDoHotel } from "./operational-mirror-types";

const linha = (acc: Record<string, unknown> | null, quartos?: LinhaDoHotel["hotelDosQuartos"]): LinhaDoHotel => ({
  accommodation: acc as LinhaDoHotel["accommodation"],
  schedule: { startDate: null, endDate: null, flightDepartureDate: null, flightReturnDate: null, dailyRates: 3 },
  hotelDosQuartos: quartos,
});

describe("hotelTotalCents — lançado × calculado (20/10)", () => {
  it("total lançado à mão vence o calculado pela aba Quartos", () => {
    const r = linha({ totalCents: 50000, dailyRate: 10000 }, { totalCentavos: 41400, noites: 3, completo: true });
    expect(fonteDoHotel(r)).toBe("lancado");
    expect(hotelTotalCents(r)).toBe(50000);
    expect(isHotelTotalDerived(r)).toBe(false);
  });

  it("sem total lançado, o da aba Quartos vence diária × noites — mesmo sem hospedagem cadastrada", () => {
    expect(hotelTotalCents(linha({ dailyRate: 10000 }, { totalCentavos: 41400, noites: 3, completo: true }))).toBe(41400);
    const semHospedagem = linha(null, { totalCentavos: 27600, noites: 2, completo: true });
    expect(fonteDoHotel(semHospedagem)).toBe("quartos");
    expect(hotelTotalCents(semHospedagem)).toBe(27600);
    expect(isHotelTotalDerived(semHospedagem)).toBe(true);
  });

  it("cálculo incompleto (noite sem tarifa) não entra: volta para diária × noites, ou zero", () => {
    expect(hotelTotalCents(linha({ dailyRate: 10000, nightsCount: 2 }, { totalCentavos: 13800, noites: 3, completo: false }))).toBe(20000);
    expect(fonteDoHotel(linha(null, { totalCentavos: 13800, noites: 3, completo: false }))).toBeNull();
    expect(hotelTotalCents(linha(null, null))).toBe(0);
  });

  it("regra antiga intacta: diária × nightsCount, senão × diárias da escala", () => {
    expect(hotelTotalCents(linha({ dailyRate: 10000, nightsCount: 2 }))).toBe(20000);
    expect(hotelTotalCents(linha({ dailyRate: 10000 }))).toBe(30000);
    expect(fonteDoHotel(linha({ dailyRate: 10000 }))).toBe("diaria");
  });
});
