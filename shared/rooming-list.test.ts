import { describe, expect, it } from "vitest";
import { cpfFormatado, dataHoraDeSaoPaulo, hoteisDosQuartos, montarRoomingList, nomeDoArquivoDaRoomingList, type EntradaDaRoomingList } from "./rooming-list";

const base = (extra: Partial<EntradaDaRoomingList> = {}): EntradaDaRoomingList => ({
  hotel: "Hotel Atlântico Rio",
  evento: { nome: "Night Run 1ª Etapa Rio", local: "Rio de Janeiro - RJ", inicio: "2026-04-24", fim: "2026-04-26" },
  incluirCpf: false,
  geradoEm: new Date("2026-10-09T17:05:00Z"),
  contato: { nome: "Helena Martins", email: "admin@demo.local" },
  quartos: [
    {
      hotelName: "Hotel Atlântico Rio", observacao: "Pedir andar alto",
      hospedes: [
        { collaboratorId: "m", nome: "Mauricio Souza", checkIn: "2026-04-22", checkOut: "2026-04-27", cpf: "12345678901" },
        { collaboratorId: "e", nome: "Edney Lima", checkIn: "2026-04-24", checkOut: "2026-04-26", cpf: null },
      ],
    },
    {
      hotelName: "  hotel atlântico   rio ",
      hospedes: [
        { collaboratorId: "a", nome: "Ana Reis", checkIn: "2026-04-23", checkOut: "2026-04-26" },
        { collaboratorId: "b", nome: "Bia Reis", checkIn: "2026-04-23", checkOut: "2026-04-26" },
        { collaboratorId: "c", nome: "Cris Reis", checkIn: "2026-04-23", checkOut: "2026-04-26" },
      ],
    },
    { hotelName: "Outro Hotel", hospedes: [{ collaboratorId: "x", nome: "Xavier", checkIn: "2026-04-23", checkOut: "2026-04-25" }] },
    { hotelName: null, hospedes: [{ collaboratorId: "y", nome: "Yara", checkIn: "2026-04-23", checkOut: "2026-04-25" }] },
  ],
  ...extra,
});

describe("montarRoomingList", () => {
  it("um hotel só, quartos numerados, tipo por trecho e totais", () => {
    const r = montarRoomingList(base());
    expect(r.hotel).toBe("Hotel Atlântico Rio");
    expect(r.totalDeQuartos).toBe(2);
    expect(r.totalDeHospedes).toBe(5);
    expect(r.linhas.map((l) => [l.numero, l.tipo, l.diarias])).toEqual([
      [1, "22/04→24/04 Single; 24/04→26/04 Duplo; 26/04→27/04 Single", 5],
      [2, "Triplo", 3],
    ]);
    expect(r.quartosPorTipo).toEqual([{ tipo: "Duplo", quantidade: 1 }, { tipo: "Triplo", quantidade: 1 }]);
    expect(r.diariasPorTipo).toEqual([{ tipo: "Single", quantidade: 3 }, { tipo: "Duplo", quantidade: 2 }, { tipo: "Triplo", quantidade: 3 }]);
    expect(r.totalDeDiarias).toBe(8);
    expect(r.periodoDoEvento).toBe("24/04/2026 a 26/04/2026");
    expect(r.periodoDaHospedagem).toBe("22/04/2026 a 27/04/2026");
    expect(r.linhas[0].hospedes[0]).toEqual({ nome: "Mauricio Souza", cpf: null, checkIn: "22/04/2026", checkOut: "27/04/2026" });
    expect(r.linhas[0].observacao).toBe("Pedir andar alto");
    expect(r.geradoEm).toBe("09/10/2026 14:05");
    expect(r.contato).toBe("Helena Martins · admin@demo.local");
    expect(r.nomeDoArquivo).toBe("Rooming list - Hotel Atlântico Rio - Night Run 1ª Etapa Rio.pdf");
  });

  it("CPF só sai quando pedido, e só para quem tem CPF válido", () => {
    expect(montarRoomingList(base()).linhas[0].hospedes.map((h) => h.cpf)).toEqual([null, null]);
    const r = montarRoomingList(base({ incluirCpf: true }));
    expect(r.incluiCpf).toBe(true);
    expect(r.linhas[0].hospedes.map((h) => h.cpf)).toEqual(["123.456.789-01", null]);
  });

  it("hotel sem quartos: documento vazio, sem erro", () => {
    const r = montarRoomingList(base({ hotel: "Hotel Inexistente" }));
    expect(r.totalDeQuartos).toBe(0);
    expect(r.periodoDaHospedagem).toBeNull();
  });
});

describe("apoio", () => {
  it("hoteisDosQuartos junta grafias e conta quartos sem hotel", () => {
    expect(hoteisDosQuartos(base().quartos)).toEqual({
      hoteis: [{ nome: "Hotel Atlântico Rio", quartos: 2 }, { nome: "Outro Hotel", quartos: 1 }],
      semHotel: 1,
    });
  });
  it("cpfFormatado só aceita 11 dígitos", () => {
    expect(cpfFormatado("123.456.789-01")).toBe("123.456.789-01");
    expect(cpfFormatado("12.345.678-9")).toBeNull();
    expect(cpfFormatado(null)).toBeNull();
  });
  it("data e hora sempre em São Paulo; nome de arquivo sem caracteres proibidos", () => {
    expect(dataHoraDeSaoPaulo(new Date("2026-01-01T02:30:00Z"))).toBe("31/12/2025 23:30");
    expect(nomeDoArquivoDaRoomingList("Hotel A/B", "Evento: 1")).toBe("Rooming list - Hotel A B - Evento 1.pdf");
  });
});
