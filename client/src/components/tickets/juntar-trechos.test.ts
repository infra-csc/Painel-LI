import { describe, it, expect } from "vitest";
import { juntarIdaEVolta } from "./juntar-trechos";

const idaGru = {
  departureAirport: "GRU", destinationAirport: "REC",
  departureCityOrigin: "São Paulo", departureCityDestination: "Recife",
  actualDepartureDate: "2026-09-19", actualDepartureTime: "06:10", actualArrivalTime: "09:20",
};
/** Como o leitor devolve um voucher de um trecho só: nos campos de IDA. */
const voltaLida = {
  departureAirport: "REC", destinationAirport: "GRU",
  departureCityOrigin: "Recife", departureCityDestination: "São Paulo",
  actualDepartureDate: "2026-09-21", actualDepartureTime: "18:00", actualArrivalTime: "21:15",
};

describe("ida e volta em vouchers diferentes (15/09)", () => {
  it("segundo voucher vira a volta, valores somam e LOCs ficam juntos", () => {
    const r = juntarIdaEVolta(
      { ...idaGru, value: "850,00", purchaseOrderNumber: "ABC123" },
      { campos: { ...voltaLida, value: "1.200,50", purchaseOrderNumber: "DEF456" }, trechoUnico: true },
    );
    expect(r).not.toBeNull();
    expect(r!.campos.actualDepartureDate).toBe("2026-09-19");
    expect(r!.campos.returnOriginAirport).toBe("REC");
    expect(r!.campos.actualReturnDate).toBe("2026-09-21");
    expect(r!.campos.returnArrivalTime).toBe("21:15");
    expect(r!.campos.value).toBe("2.050,50");
    expect(r!.campos.purchaseOrderNumber).toBe("ABC123 / DEF456");
    expect(r!.campos.isOneWay).toBe(false);
    expect(r!.resumo).toContain("R$ 850,00 + R$ 1.200,50 = R$ 2.050,50");
  });

  it("valor gravado vem em ponto (\"850.5\") e soma igual", () => {
    const r = juntarIdaEVolta(
      { ...idaGru, value: "850.5", purchaseOrderNumber: "ABC123" },
      { campos: { ...voltaLida, value: "100,00", purchaseOrderNumber: "DEF456" }, trechoUnico: true },
    );
    expect(r!.campos.value).toBe("950,50");
  });

  it("voucher mais cedo que o trecho já preenchido vira a ida", () => {
    const r = juntarIdaEVolta(
      { ...idaGru, actualDepartureDate: "2026-09-25", value: "500,00", purchaseOrderNumber: "LATE01" },
      { campos: { ...voltaLida, actualDepartureDate: "2026-09-18", value: "400,00", purchaseOrderNumber: "EARLY1" }, trechoUnico: true },
    );
    expect(r!.campos.actualDepartureDate).toBe("2026-09-18");
    expect(r!.campos.departureAirport).toBe("REC");
    expect(r!.campos.actualReturnDate).toBe("2026-09-25");
    expect(r!.campos.value).toBe("900,00");
  });

  it("passagem só com a volta: o voucher novo entra como ida", () => {
    const soVolta = {
      returnOriginAirport: "REC", returnDestinationAirport: "GRU", actualReturnDate: "2026-09-21",
      isReturnOnly: true, value: "300,00", purchaseOrderNumber: "VOLTA1",
    };
    const r = juntarIdaEVolta(soVolta, { campos: { ...idaGru, value: "200,00", purchaseOrderNumber: "IDA001" }, trechoUnico: true });
    expect(r!.campos.actualDepartureDate).toBe("2026-09-19");
    expect(r!.campos.actualReturnDate).toBe("2026-09-21");
    expect(r!.campos.isReturnOnly).toBe(false);
    expect(r!.campos.value).toBe("500,00");
  });

  it("mesmo voucher relido não soma de novo", () => {
    expect(juntarIdaEVolta(
      { ...idaGru, value: "850,00", purchaseOrderNumber: "ABC123" },
      { campos: { ...idaGru, value: "850,00", purchaseOrderNumber: "ABC123" }, trechoUnico: true },
    )).toBeNull();
  });

  it("não junta quando o voucher traz os dois trechos, ou a passagem está vazia ou completa", () => {
    expect(juntarIdaEVolta({ ...idaGru, purchaseOrderNumber: "A" }, { campos: { ...voltaLida, purchaseOrderNumber: "B" } })).toBeNull();
    expect(juntarIdaEVolta({}, { campos: voltaLida, trechoUnico: true })).toBeNull();
    expect(juntarIdaEVolta(
      { ...idaGru, returnOriginAirport: "REC", actualReturnDate: "2026-09-21", purchaseOrderNumber: "A" },
      { campos: { ...voltaLida, purchaseOrderNumber: "B" }, trechoUnico: true },
    )).toBeNull();
  });
});
