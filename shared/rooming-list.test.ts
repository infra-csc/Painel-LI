import { describe, expect, it } from "vitest";
import {
  cpfFormatado, dataHoraDeSaoPaulo, hoteisDosQuartos, hotelDoEvento, montarRoomingList, nomeDoArquivoDaRoomingList, planoDoHotelDoEvento,
  type EntradaDaRoomingList,
} from "./rooming-list";

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
      [1, "22/04→24/04 Individual; 24/04→26/04 Duplo; 26/04→27/04 Individual", 5],
      [2, "Triplo", 3],
    ]);
    expect(r.quartosPorTipo).toEqual([{ tipo: "Duplo", quantidade: 1 }, { tipo: "Triplo", quantidade: 1 }]);
    expect(r.diariasPorTipo).toEqual([{ tipo: "Individual", quantidade: 3 }, { tipo: "Duplo", quantidade: 2 }, { tipo: "Triplo", quantidade: 3 }]);
    expect(r.totalDeDiarias).toBe(8);
    expect(r.periodoDoEvento).toBe("24/04/2026 a 26/04/2026");
    expect(r.periodoDaHospedagem).toBe("22/04/2026 a 27/04/2026");
    expect(r.linhas[0].hospedes[0]).toEqual({ nome: "Mauricio Souza", cpf: null, checkIn: "22/04/2026", checkOut: "27/04/2026", valor: null });
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

  it("quartos sem hotel definido (hotel: null): só eles, cabeçalho do evento, \"a definir\" e arquivo com o evento", () => {
    const r = montarRoomingList(base({ hotel: null }));
    expect(r.hotelDefinido).toBe(false);
    expect(r.hotel).toBe("a definir");
    expect(r.totalDeQuartos).toBe(1);
    expect(r.linhas[0].hospedes.map((h) => h.nome)).toEqual(["Yara"]);
    expect(r.linhas[0].tipo).toBe("Individual");
    expect(r.periodoDaHospedagem).toBe("23/04/2026 a 25/04/2026");
    expect(r.nomeDoArquivo).toBe("Rooming list - Night Run 1ª Etapa Rio.pdf");
  });

  it("sem hotel com nome digitado só para o PDF: vai no cabeçalho, não no nome do arquivo", () => {
    const r = montarRoomingList(base({ hotel: null, nomeDoHotelNoPdf: "  Hotel   Copacabana " }));
    expect(r.hotel).toBe("Hotel Copacabana");
    expect(r.hotelDefinido).toBe(false);
    expect(r.nomeDoArquivo).toBe("Rooming list - Night Run 1ª Etapa Rio.pdf");
  });

  it("nenhum quarto com hotel: hotel null leva TODOS os quartos", () => {
    const quartos = base().quartos.map((q) => ({ ...q, hotelName: null }));
    const r = montarRoomingList(base({ hotel: null, quartos }));
    expect(r.totalDeQuartos).toBe(4);
    expect(r.totalDeHospedes).toBe(7);
  });

  it("o nome digitado para o PDF não vale quando o hotel está definido", () => {
    const r = montarRoomingList(base({ nomeDoHotelNoPdf: "Outro nome" }));
    expect(r.hotel).toBe("Hotel Atlântico Rio");
    expect(r.hotelDefinido).toBe(true);
  });
});

describe("hotel do evento", () => {
  const q = (id: string, hotelName: string | null, confirmed = false) => ({ id, hotelName, confirmed });

  it("hotelDoEvento: o de mais quartos; empate em ordem alfabética; nenhum → null", () => {
    expect(hotelDoEvento([q("1", "B"), q("2", " b "), q("3", "A"), q("4", null)])).toBe("B");
    expect(hotelDoEvento([q("1", "Zeta"), q("2", "Alfa")])).toBe("Alfa");
    expect(hotelDoEvento([q("1", null), q("2", "  ")])).toBeNull();
  });

  it("sem hotel nenhum: aplica a todos os abertos e conta os confirmados que ficaram", () => {
    const p = planoDoHotelDoEvento([q("1", null), q("2", null), q("3", null, true)], "  Hotel   Rio ");
    expect(p.hotel).toBe("Hotel Rio");
    expect(p.aplicar).toEqual(["1", "2"]);
    expect(p.confirmadosMantidos).toBe(1);
    expect(p.emOutroHotel).toEqual([]);
  });

  it("trocar o hotel do evento leva quem o seguia; exceção em outro hotel só com trocarOutros", () => {
    const quartos = [q("1", "Hotel A"), q("2", "Hotel A"), q("3", "Hotel X"), q("4", null), q("5", "hotel b"), q("6", "Hotel A", true)];
    const p = planoDoHotelDoEvento(quartos, "Hotel B");
    expect(p.aplicar).toEqual(["1", "2", "4"]);
    expect(p.jaNoHotel).toBe(1);
    expect(p.emOutroHotel).toEqual([{ id: "3", hotel: "Hotel X" }]);
    expect(p.outrosMantidos).toBe(1);
    expect(p.confirmadosMantidos).toBe(1);

    const todos = planoDoHotelDoEvento(quartos, "Hotel B", { trocarOutros: true });
    expect(todos.aplicar).toEqual(["1", "2", "3", "4"]);
    expect(todos.outrosMantidos).toBe(0);
  });

  it("confirmado que já está no hotel não conta como \"ficou como estava\"; nome vazio não aplica nada", () => {
    expect(planoDoHotelDoEvento([q("1", "Hotel A", true)], "hotel a").confirmadosMantidos).toBe(0);
    expect(planoDoHotelDoEvento([q("1", null)], "   ").aplicar).toEqual([]);
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
    expect(nomeDoArquivoDaRoomingList(null, "Evento: 1")).toBe("Rooming list - Evento 1.pdf");
  });
});

describe("valores (20/10): o PDF do hotel nunca leva; o de uso interno leva", () => {
  const comValores = (extra: Partial<EntradaDaRoomingList> = {}) => {
    const b = base(extra);
    return {
      ...b,
      quartos: b.quartos.map((q, i) => ({
        ...q, valorCentavos: 100000 + i, valorCompleto: i !== 1,
        hospedes: q.hospedes.map((h) => ({ ...h, valorCentavos: 50000 })),
      })),
    };
  };

  it("sem `comValores`: nenhum valor no documento, mesmo que a tela mande", () => {
    const r = montarRoomingList(comValores());
    expect(r.comValores).toBe(false);
    expect(r.totalDosValores).toBeNull();
    expect(r.linhas.every((l) => l.valor === null && l.hospedes.every((h) => h.valor === null))).toBe(true);
    expect(r.nomeDoArquivo).toBe("Rooming list - Hotel Atlântico Rio - Night Run 1ª Etapa Rio.pdf");
  });

  it("com `comValores`: valor por hóspede e por quarto, total, parcial e nome de uso interno", () => {
    const r = montarRoomingList({ ...comValores(), comValores: true });
    const sp = (s: string | null) => String(s).replace(/ /g, " ");
    expect(sp(r.linhas[0].valor)).toBe("R$ 1.000,00");
    expect(sp(r.linhas[0].hospedes[0].valor)).toBe("R$ 500,00");
    expect(sp(r.totalDosValores)).toBe("R$ 2.000,01");
    expect(r.valoresParciais).toBe(true);
    expect(r.nomeDoArquivo).toBe("USO INTERNO - Rooming list com valores - Hotel Atlântico Rio - Night Run 1ª Etapa Rio.pdf");
  });
});
