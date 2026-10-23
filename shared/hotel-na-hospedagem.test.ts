import { describe, expect, it } from "vitest";
import { conferirHospedagem, dadosDoQuarto, decidirReflexo, hospedagemReservada, textoDoCampo } from "./hotel-na-hospedagem";
import { hospedagemConta } from "../server/vaga-guards";

const dados = (extra: Partial<Parameters<typeof dadosDoQuarto>[0]> = {}) => dadosDoQuarto({
  hotelName: "  Hotel   Ibis ", checkIn: "2099-11-10", checkOut: "2099-11-13", comQuem: ["Bia Lima"],
  valor: { totalCentavos: 45_000, noites: 3, completo: true }, ...extra,
});

describe("dadosDoQuarto — o que o Confirmar leva à hospedagem", () => {
  it("hotel limpo, datas, tipo pela ocupação, diárias, valor e com quem divide", () => {
    expect(dados()).toEqual({
      hotelName: "Hotel Ibis", checkInDate: "2099-11-10", checkOutDate: "2099-11-13", roomType: "double",
      nightsCount: 3, totalCents: 45_000, accommodationObservations: "Divide o quarto com Bia Lima",
    });
  });
  it("sozinho → individual, sem observação; tarifa incompleta → sem valor; noites pelas datas", () => {
    expect(dados({ comQuem: [], valor: { totalCentavos: 10_000, noites: 0, completo: false } })).toMatchObject({
      roomType: "single", accommodationObservations: null, totalCents: null, nightsCount: 3,
    });
    expect(dados({ comQuem: ["Ana", "Bia"] })).toMatchObject({ roomType: "triple", accommodationObservations: "Divide o quarto com Ana e Bia" });
  });
});

describe("decidirReflexo", () => {
  it("sem hospedagem: cria com tudo (e tudo é do Espelho)", () => {
    const d = decidirReflexo({ hospedagem: null, reflexo: null, dados: dados() });
    expect(d.motivo).toBe("criada");
    expect(d.criar).toBe(true);
    expect(d.campos).toEqual(dados());
    expect(d.reflexo).toEqual(dados());
  });

  it("quarto sem hotel: não preenche nada", () => {
    expect(decidirReflexo({ hospedagem: null, reflexo: null, dados: dados({ hotelName: null }) })).toMatchObject({ motivo: "sem-hotel", criar: false, campos: {} });
  });

  it("hospedagem com campos vazios: preenche só os vazios; o lançado à mão diferente vira diferença", () => {
    const d = decidirReflexo({
      hospedagem: { hotelName: "Mercure", checkInDate: null, checkOutDate: "2099-11-14", roomType: null, accommodationObservations: "Chega tarde" },
      reflexo: null, dados: dados(),
    });
    expect(d.campos).toEqual({ checkInDate: "2099-11-10", roomType: "double", nightsCount: 3, totalCents: 45_000 });
    expect(d.diferencas.map((x) => [x.campo, x.naHospedagem, x.doQuarto])).toEqual([
      ["hotelName", "Mercure", "Hotel Ibis"], ["checkOutDate", "2099-11-14", "2099-11-13"],
    ]);
    // Observação lançada à mão: fica, sem aviso.
    expect(d.campos.accommodationObservations).toBeUndefined();
    expect(d.reflexo).not.toHaveProperty("hotelName");
  });

  it("mesmo valor à mão (caixa/espaços): nada a fazer, nem diferença", () => {
    const d = decidirReflexo({ hospedagem: { hotelName: "HOTEL IBIS" }, reflexo: null, dados: dados() });
    expect(d.diferencas).toEqual([]);
    expect(d.campos.hotelName).toBeUndefined();
  });

  it("forcar (Usar os dados do quarto): aplica sobre o lançado à mão", () => {
    const d = decidirReflexo({ hospedagem: { hotelName: "Mercure", checkOutDate: "2099-11-14", accommodationObservations: "x" }, reflexo: null, dados: dados(), forcar: true });
    expect(d.diferencas).toEqual([]);
    expect(d.campos).toMatchObject({ hotelName: "Hotel Ibis", checkOutDate: "2099-11-13", accommodationObservations: "Divide o quarto com Bia Lima" });
  });

  it("confirmado de novo: o que o Espelho escreveu segue o quarto; o que saiu do quarto sai da hospedagem", () => {
    const antes = dados();
    const depois = dados({ hotelName: "Novotel", checkIn: "2099-11-11", comQuem: [] });
    const d = decidirReflexo({ hospedagem: { ...antes }, reflexo: { ...antes }, dados: depois });
    expect(d.campos).toEqual({ hotelName: "Novotel", checkInDate: "2099-11-11", roomType: "single", accommodationObservations: null });
    expect(d.reflexo).not.toHaveProperty("accommodationObservations");
  });

  it("alguém editou à mão o que o Espelho escreveu: vira manual (diferença)", () => {
    const antes = dados();
    const d = decidirReflexo({ hospedagem: { ...antes, hotelName: "Pousada" }, reflexo: { ...antes }, dados: antes });
    expect(d.diferencas.map((x) => x.campo)).toEqual(["hotelName"]);
  });

  it("hospedagem cancelada: não é tocada", () => {
    expect(decidirReflexo({ hospedagem: { hotelStatus: "cancelada" }, reflexo: null, dados: dados() })).toMatchObject({ motivo: "cancelada", campos: {} });
  });
});

describe("conferirHospedagem / hospedagemReservada / textoDoCampo", () => {
  it("situações do ocupante de quarto confirmado", () => {
    const d = dados();
    expect(conferirHospedagem(null, null, d).situacao).toBe("a-preencher");
    expect(conferirHospedagem({ ...d }, { ...d }, d).situacao).toBe("preenchida");
    expect(conferirHospedagem({ ...d, checkInDate: "2099-11-09" }, { ...d, checkInDate: "2099-11-09" }, d).situacao).toBe("desatualizada");
    expect(conferirHospedagem({ ...d, hotelName: "Mercure" }, null, d)).toMatchObject({ situacao: "difere" });
    expect(conferirHospedagem({ hotelStatus: "cancelada" }, null, d).situacao).toBe("cancelada");
    expect(conferirHospedagem(null, null, dados({ hotelName: null })).situacao).toBeNull();
    // Só a observação mudou (texto livre): não pede conferência.
    expect(conferirHospedagem({ ...d, accommodationObservations: null }, { ...d }, d).situacao).toBe("preenchida");
  });

  it("reservada = a mesma regra do status da vaga (hospedagemConta)", () => {
    const casos = [null, { hotelName: "Ibis" }, { hotelName: "  " }, { hotelName: "Ibis", hotelStatus: "cancelada" }, { hotelName: "Ibis", hotelStatus: "reservada" }, { hotelName: null }];
    for (const c of casos) expect(hospedagemReservada(c)).toBe(hospedagemConta(c));
  });

  it("texto dos campos", () => {
    expect(textoDoCampo("checkInDate", "2099-11-10")).toBe("10/11");
    expect(textoDoCampo("roomType", "double")).toBe("Duplo");
    expect(textoDoCampo("totalCents", 45_000)).toMatch(/450,00/);
    expect(textoDoCampo("hotelName", null)).toBe("—");
  });
});
