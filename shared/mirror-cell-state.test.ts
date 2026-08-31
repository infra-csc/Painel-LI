import { describe, it, expect } from "vitest";
import { campoObrigatorio, estadoDaCelula, faltamNaLinha, temValor, type ContextoDaLinha } from "./mirror-cell-state";

const VAZIA: ContextoDaLinha = {
  temPassagem: false, temHotel: false,
  bagagemCents: 0, uberCents: 0, locacaoCents: 0,
};

describe("obrigatoriedade condicional", () => {
  it("cobra o valor da passagem sempre — é o número que entra na prestação", () => {
    expect(campoObrigatorio("ticket.value", VAZIA)).toBe(true);
  });

  it("cobra o hotel sempre — é ele que destrava o resto do bloco", () => {
    expect(campoObrigatorio("accommodation.hotelName", VAZIA)).toBe(true);
  });

  it("não cobra os campos da passagem enquanto não há passagem lançada", () => {
    expect(campoObrigatorio("ticket.locator", VAZIA)).toBe(false);
    expect(campoObrigatorio("schedule.departureDate", VAZIA)).toBe(false);
    expect(campoObrigatorio("ticket.locator", { ...VAZIA, temPassagem: true })).toBe(true);
    expect(campoObrigatorio("schedule.departureDate", { ...VAZIA, temPassagem: true })).toBe(true);
  });

  it("não cobra os campos da hospedagem enquanto não há hotel", () => {
    expect(campoObrigatorio("accommodation.checkInDate", VAZIA)).toBe(false);
    expect(campoObrigatorio("accommodation.checkInDate", { ...VAZIA, temHotel: true })).toBe(true);
  });

  it("cobra OC e conferência de um extra só quando aquele extra tem valor", () => {
    expect(campoObrigatorio("baggage.oc", VAZIA)).toBe(false);
    expect(campoObrigatorio("baggage.oc", { ...VAZIA, bagagemCents: 5000 })).toBe(true);
    // Bagagem com valor não cobra a OC da locação: cada extra responde por si.
    expect(campoObrigatorio("carRental.oc", { ...VAZIA, bagagemCents: 5000 })).toBe(false);
  });

  it("nunca cobra período, late checkout e observações", () => {
    const cheio: ContextoDaLinha = { ...VAZIA, temPassagem: true, temHotel: true, bagagemCents: 100, uberCents: 100, locacaoCents: 100 };
    for (const campo of ["schedule.startDate", "schedule.endDate", "accommodation.lateCheckout", "observations"]) {
      expect(campoObrigatorio(campo, cheio)).toBe(false);
    }
  });

  it("não cobra o valor dos extras: extra que não houve é zero", () => {
    expect(campoObrigatorio("baggage.amountCents", VAZIA)).toBe(false);
    expect(campoObrigatorio("carRental.amountCents", { ...VAZIA, locacaoCents: 900 })).toBe(false);
  });
});

describe("temValor", () => {
  it("zero conta como preenchido, string vazia e nulo não", () => {
    expect(temValor(0)).toBe(true);
    expect(temValor("")).toBe(false);
    expect(temValor("   ")).toBe(false);
    expect(temValor(null)).toBe(false);
    expect(temValor(undefined)).toBe(false);
    expect(temValor(false)).toBe(false);
    expect(temValor(true)).toBe(true);
  });
});

describe("estado da célula", () => {
  it("vazio obrigatório vira falta; vazio dispensável fica em silêncio", () => {
    expect(estadoDaCelula("ticket.value", null, VAZIA)).toBe("falta");
    expect(estadoDaCelula("observations", null, VAZIA)).toBe("vazio");
  });

  it("com valor, nunca cobra", () => {
    expect(estadoDaCelula("ticket.value", 45000, VAZIA)).toBe("preenchido");
  });

  it("Uber não confirmado é sugestão, não falta de preenchimento", () => {
    const ctx = { ...VAZIA, uberCents: 5800 };
    expect(estadoDaCelula("uber.amountCents", 5800, ctx)).toBe("a_confirmar");
    // Confirmado, o valor passa a valer como dado.
    expect(estadoDaCelula("uber.amountCents", 5800, { ...ctx, uberConfirmado: true })).toBe("preenchido");
  });

  it("quem foi dispensado do Uber mostra 'não usa', não cobrança", () => {
    const ctx = { ...VAZIA, uberCents: 5800, semUber: true };
    expect(estadoDaCelula("uber.oc", null, ctx)).toBe("nao_usa");
  });

  it("tipo de quarto é sugestão até o quarto ser confirmado", () => {
    expect(estadoDaCelula("accommodation.roomType", "Duplo", VAZIA)).toBe("a_confirmar");
    expect(estadoDaCelula("accommodation.roomType", "Duplo", { ...VAZIA, quartoConfirmado: true })).toBe("preenchido");
  });

  it("célula em 'a confirmar' não conta como falta na linha", () => {
    const ctx = { ...VAZIA, uberCents: 5800 };
    const campos = [
      { campo: "ticket.value", valor: null },      // falta
      { campo: "uber.oc", valor: null },           // a confirmar
      { campo: "observations", valor: null },      // silêncio
    ];
    expect(faltamNaLinha(campos, ctx)).toBe(1);
  });
});
