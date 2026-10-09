/**
 * Datas do quarto no Espelho (09/10): "a data vir sempre da passagem e não da
 * diária" e "quem volta após 18h ganha uma diária no dia seguinte".
 */
import { describe, it, expect } from "vitest";
import { datasDoQuarto, horaInicialDaFaixa, seloDaOrigem, somarDias, HORA_DA_VOLTA_COM_DIARIA_EXTRA } from "./datas-do-quarto";

// Night Run 1ª Etapa Rio: diária 23→25, passagem 22→26.
const vaga = {
  flightDepartureDate: "2026-04-22",
  flightReturnDate: "2026-04-26",
  flightReturnSuggestedTime: null as string | null,
  scheduleStartDate: "2026-04-23",
  scheduleEndDate: "2026-04-25",
};
const passagem = {
  actualDepartureDate: "2026-04-22", actualDepartureTime: "08:10", actualArrivalTime: "09:15",
  actualReturnDate: "2026-04-26", actualReturnTime: "11:00",
};

describe("origem da data", () => {
  it("a passagem vence a escala e a hospedagem reservada", () => {
    const d = datasDoQuarto({ passagem, vaga, hospedagem: { checkInDate: "2026-04-23", checkOutDate: "2026-04-25" } });
    expect([d.checkIn, d.checkOut]).toEqual(["2026-04-22", "2026-04-26"]);
    expect([d.origemEntrada, d.origemSaida]).toEqual(["passagem", "passagem"]);
  });

  it("hospedagem reservada que diverge da passagem vira aviso, não some", () => {
    const d = datasDoQuarto({ passagem, vaga, hospedagem: { checkInDate: "2026-04-23", checkOutDate: "2026-04-25" } });
    expect(d.divergencia?.texto).toBe("Hospedagem reservada 23/04→25/04, passagem 22/04→26/04 — conferir");
  });

  it("hospedagem igual à passagem não gera aviso", () => {
    const d = datasDoQuarto({ passagem, vaga, hospedagem: { checkInDate: "2026-04-22", checkOutDate: "2026-04-26" } });
    expect(d.divergencia).toBeNull();
  });

  it("sem passagem: datas sugeridas da vaga", () => {
    const d = datasDoQuarto({ passagem: null, vaga });
    expect([d.checkIn, d.checkOut, d.origemEntrada, d.origemSaida]).toEqual(["2026-04-22", "2026-04-26", "sugerida", "sugerida"]);
  });

  it("sem passagem nem sugerida: hospedagem; sem nada disso: escala", () => {
    const semViagem = { ...vaga, flightDepartureDate: null, flightReturnDate: null };
    const comAcc = datasDoQuarto({ vaga: semViagem, hospedagem: { checkInDate: "2026-04-21", checkOutDate: "2026-04-24" } });
    expect([comAcc.checkIn, comAcc.checkOut, comAcc.origemEntrada]).toEqual(["2026-04-21", "2026-04-24", "hospedagem"]);
    expect(comAcc.divergencia).toBeNull();
    const soEscala = datasDoQuarto({ vaga: semViagem });
    expect([soEscala.checkIn, soEscala.checkOut, soEscala.origemSaida]).toEqual(["2026-04-23", "2026-04-25", "escala"]);
  });

  it("passagem só de ida: entrada da passagem, saída da sugerida", () => {
    const d = datasDoQuarto({ passagem: { actualDepartureDate: "2026-04-21", actualDepartureTime: "07:00", actualArrivalTime: "08:00" }, vaga });
    expect([d.checkIn, d.origemEntrada]).toEqual(["2026-04-21", "passagem"]);
    expect([d.checkOut, d.origemSaida]).toEqual(["2026-04-26", "sugerida"]);
  });

  it("passagem só de ida e vaga sem volta sugerida: saída da escala", () => {
    const d = datasDoQuarto({ passagem: { actualDepartureDate: "2026-04-21" }, vaga: { ...vaga, flightReturnDate: null } });
    expect([d.checkOut, d.origemSaida]).toEqual(["2026-04-25", "escala"]);
  });

  it("selo curto de cada origem", () => {
    expect(["passagem", "sugerida", "hospedagem", "escala", null].map((o) => seloDaOrigem(o as never)))
      .toEqual(["da passagem", "sugerida", "da hospedagem", "da escala", null]);
  });
});

describe("chegada depois da meia-noite", () => {
  it("parte 23:40 e pousa 01:10: entra no quarto no dia seguinte", () => {
    const d = datasDoQuarto({ passagem: { ...passagem, actualDepartureTime: "23:40", actualArrivalTime: "01:10" }, vaga });
    expect(d.checkIn).toBe("2026-04-23");
    expect(d.chegadaDepoisDaMeiaNoite).toBe(true);
  });

  it("sem hora de chegada, fica na data de partida", () => {
    const d = datasDoQuarto({ passagem: { ...passagem, actualDepartureTime: "23:40", actualArrivalTime: null }, vaga });
    expect(d.checkIn).toBe("2026-04-22");
    expect(d.chegadaDepoisDaMeiaNoite).toBe(false);
  });

  it("virada de mês", () => {
    expect(somarDias("2026-04-30", 1)).toBe("2026-05-01");
  });
});

describe("volta a partir das 18h ganha uma diária", () => {
  const volta = (hora: string | null) => datasDoQuarto({ passagem: { ...passagem, actualReturnTime: hora }, vaga });

  it("a régua é 18:00", () => {
    expect(HORA_DA_VOLTA_COM_DIARIA_EXTRA).toBe(18 * 60);
  });

  it("17:59 não ganha", () => {
    expect(volta("17:59").checkOut).toBe("2026-04-26");
    expect(volta("17:59").diariaExtraNaVolta).toBeNull();
  });

  it("18:00 ganha (inclusive)", () => {
    expect(volta("18:00").checkOut).toBe("2026-04-27");
  });

  it("21:05 ganha e diz o horário", () => {
    const d = volta("21:05");
    expect(d.checkOut).toBe("2026-04-27");
    expect(d.diariaExtraNaVolta).toEqual({ horario: "21:05" });
  });

  it("volta sem horário não ganha", () => {
    expect(volta(null).checkOut).toBe("2026-04-26");
    expect(volta(null).diariaExtraNaVolta).toBeNull();
  });

  it("sem passagem, a faixa sugerida \"20h+\" ganha", () => {
    const d = datasDoQuarto({ vaga: { ...vaga, flightReturnSuggestedTime: "20h+" } });
    expect(d.checkOut).toBe("2026-04-27");
    expect(d.diariaExtraNaVolta).toEqual({ horario: "20h+" });
  });

  it("faixa sugerida que começa antes das 18h (\"8-14h\") não ganha; texto sem hora também não", () => {
    expect(datasDoQuarto({ vaga: { ...vaga, flightReturnSuggestedTime: "8-14h" } }).checkOut).toBe("2026-04-26");
    expect(datasDoQuarto({ vaga: { ...vaga, flightReturnSuggestedTime: "à noite" } }).checkOut).toBe("2026-04-26");
  });

  it("com passagem, o horário sugerido não é usado", () => {
    const d = datasDoQuarto({ passagem: { ...passagem, actualReturnTime: "10:00" }, vaga: { ...vaga, flightReturnSuggestedTime: "20h+" } });
    expect(d.checkOut).toBe("2026-04-26");
  });

  it("a diária extra conta na divergência com a hospedagem reservada", () => {
    const d = datasDoQuarto({ passagem: { ...passagem, actualReturnTime: "21:05" }, vaga, hospedagem: { checkInDate: "2026-04-22", checkOutDate: "2026-04-26" } });
    expect(d.divergencia?.texto).toBe("Hospedagem reservada 22/04→26/04, passagem 22/04→27/04 — conferir");
  });
});

describe("hora inicial da faixa sugerida", () => {
  it.each([
    ["20h+", 20 * 60],
    ["depois das 20h", 20 * 60],
    ["18-22h", 18 * 60],
    ["8-14h", 8 * 60],
    ["8h às 10h", 8 * 60],
    ["21:30", 21 * 60 + 30],
    ["9h30", 9 * 60 + 30],
    ["0900", 9 * 60],
    ["carro", null],
    ["", null],
  ])("%s", (texto, esperado) => {
    expect(horaInicialDaFaixa(texto)).toBe(esperado);
  });
});
