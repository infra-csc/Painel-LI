/**
 * PDF da rooming list (04/11): a função sai embaixo do nome só na versão de uso interno.
 * O jsPDF grava o texto legível no arquivo, então dá para conferir o conteúdo sem renderizar.
 */
import { describe, expect, it } from "vitest";
import { montarRoomingList, type EntradaDaRoomingList } from "@shared/rooming-list";
import { gerarPdfDaRoomingList } from "./rooming-list-pdf";

const entrada = (extra: Partial<EntradaDaRoomingList> = {}): EntradaDaRoomingList => ({
  hotel: "Hotel Beira Mar",
  evento: { nome: "Circuito Teste", local: "Maceió - AL", inicio: "2026-10-27", fim: "2026-11-01" },
  incluirCpf: false,
  geradoEm: new Date("2026-11-04T12:00:00Z"),
  contato: { nome: "Logística", email: null },
  quartos: [{
    hotelName: "Hotel Beira Mar", valorCentavos: 200_000, valorCompleto: true, fornecedor: "flytour", formaPagamento: "faturado",
    hospedes: [
      { collaboratorId: "a", nome: "Ana Reis", checkIn: "2026-10-26", checkOut: "2026-11-02", valorCentavos: 100_000, funcao: "Cenotecnica" },
      { collaboratorId: "b", nome: "Bia Lima", checkIn: "2026-10-26", checkOut: "2026-11-02", valorCentavos: 100_000, funcao: "Sup Ceno" },
    ],
  }],
  ...extra,
});
const texto = async (e: EntradaDaRoomingList) => (await gerarPdfDaRoomingList(montarRoomingList(e))).output();

describe("PDF da rooming list", () => {
  it("uso interno: a função de cada hóspede e o cabeçalho que a anuncia", async () => {
    const pdf = await texto(entrada({ comValores: true }));
    expect(pdf).toContain("(Cenotecnica)");
    expect(pdf).toContain("(Sup Ceno)");
    // Na célula do quarto e no resumo do fim do documento.
    expect(pdf).toContain("Flytour · Faturado".replace(" · ", " \xB7 "));
    expect(pdf).toContain("(Flytour)");
    expect(pdf).toContain("(Faturado)");
    expect(pdf).toContain("Ana Reis");
  });

  it("documento do hotel: sem função, mesmo com o dado disponível", async () => {
    const pdf = await texto(entrada());
    expect(pdf).toContain("Ana Reis");
    expect(pdf).not.toContain("Cenotecnica");
    expect(pdf).not.toContain("Sup Ceno");
    expect(pdf).not.toContain("Flytour");
    expect(pdf).not.toContain("Faturado");
  });

  it("uso interno sem função em ninguém: cabeçalho de sempre, sem erro", async () => {
    const e = entrada({ comValores: true });
    const pdf = await texto({ ...e, quartos: e.quartos.map((q) => ({ ...q, hospedes: q.hospedes.map((h) => ({ ...h, funcao: null })) })) });
    expect(pdf).toContain("Ana Reis");
    expect(pdf).not.toContain("Cenotecnica");
  });
});
