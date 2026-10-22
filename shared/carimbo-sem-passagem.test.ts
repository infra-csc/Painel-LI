import { describe, expect, it } from "vitest";
import {
  MOTIVO_JA_TERRESTRE,
  MOTIVO_VAI_DE_ONIBUS,
  MOTIVO_VAI_DE_TERRESTRE,
  decidirCarimboSemPassagem,
  pernasQueIndicamTerrestre,
} from "./carimbo-sem-passagem";

describe("decidirCarimboSemPassagem (22/10, vaga #4724)", () => {
  it("Sugestão de volta '14h carro' (o caso real): pula, sem criar passagem — falta registrar a volta", () => {
    expect(decidirCarimboSemPassagem({ flightReturnSuggestedTime: "14h carro" }, [])).toEqual({
      acao: "pular", tipo: "terrestre", motivo: MOTIVO_VAI_DE_TERRESTRE, pernas: ["volta"],
    });
    expect(MOTIVO_VAI_DE_TERRESTRE).toBe("vai de carro/van — registre em 'Vai de carro/van'");
  });

  it("'van - 20h' na ida e na volta: as duas pernas", () => {
    const d = decidirCarimboSemPassagem({ flightArrivalSuggestedTime: "van - 20h", flightReturnSuggestedTime: "van - 20h" }, []);
    expect(d).toMatchObject({ acao: "pular", tipo: "terrestre", pernas: ["ida", "volta"] });
  });

  it("campo da Validação de Escala manda: transportModeIda 'van' pula; 'aereo' com texto de carro carimba", () => {
    expect(decidirCarimboSemPassagem({ transportModeIda: "van" }, [])).toMatchObject({ acao: "pular", tipo: "terrestre", pernas: ["ida"] });
    expect(decidirCarimboSemPassagem({ transportModeIda: "transfer" }, [])).toMatchObject({ acao: "pular", tipo: "terrestre" });
    expect(decidirCarimboSemPassagem({ transportModeIda: "aereo", transportModeVolta: "aereo", flightReturnSuggestedTime: "carro" }, [])).toEqual({ acao: "carimbar" });
  });

  it("aérea (horário sem modo, ou 'uber' no texto): carimba, como hoje", () => {
    expect(decidirCarimboSemPassagem({ flightDepartureSuggestedTime: "09:30", flightReturnSuggestedTime: "18h" }, [])).toEqual({ acao: "carimbar" });
    expect(decidirCarimboSemPassagem({ flightArrivalSuggestedTime: "chega 10h + uber até o hotel" }, [])).toEqual({ acao: "carimbar" });
    expect(decidirCarimboSemPassagem({}, [])).toEqual({ acao: "carimbar" });
  });

  it("todas as pernas já registradas como carro/van: pula, 'já registrada'", () => {
    expect(decidirCarimboSemPassagem({ flightReturnSuggestedTime: "14h carro" }, [{ trecho: "ida" }, { trecho: "volta" }])).toEqual({
      acao: "pular", tipo: "ja_terrestre", motivo: MOTIVO_JA_TERRESTRE, pernas: [],
    });
    // "Só ida": registrar a ida já cobre a vaga.
    expect(decidirCarimboSemPassagem({ trechosSugeridos: "so_ida" }, [{ trecho: "ida" }])).toMatchObject({ tipo: "ja_terrestre" });
  });

  it("uma perna registrada como terrestre e a outra aérea: carimba (é o bilhete da perna aérea)", () => {
    expect(decidirCarimboSemPassagem({ flightReturnSuggestedTime: "14h carro" }, [{ trecho: "volta" }])).toEqual({ acao: "carimbar" });
  });

  it("ônibus de linha: pula com o motivo da passagem rodoviária", () => {
    expect(decidirCarimboSemPassagem({ flightReturnSuggestedTime: "22h - onibus" }, [])).toEqual({
      acao: "pular", tipo: "rodoviaria", motivo: MOTIVO_VAI_DE_ONIBUS, pernas: ["volta"],
    });
  });

  it("perna que a vaga não tem não conta ('só ida' com volta '14h carro')", () => {
    expect(pernasQueIndicamTerrestre({ trechosSugeridos: "so_ida", flightReturnSuggestedTime: "14h carro" })).toEqual([]);
    expect(decidirCarimboSemPassagem({ trechosSugeridos: "so_ida", flightReturnSuggestedTime: "14h carro" }, [])).toEqual({ acao: "carimbar" });
  });
});
