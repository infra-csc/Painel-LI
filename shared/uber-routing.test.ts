import { describe, it, expect } from "vitest";
import { agruparEmCarros, horaDosMinutos, horarioDoCarro, minutosDaHora } from "./uber-routing";

const p = (id: string, hora: string | null, data = "2026-09-30", aeroporto = "GRU") => ({
  id, data, aeroporto, minutos: minutosDaHora(hora),
});

describe("hora e minutos", () => {
  it("converte nos dois sentidos", () => {
    expect(minutosDaHora("07:35")).toBe(455);
    expect(horaDosMinutos(455)).toBe("07:35");
    expect(minutosDaHora("")).toBeNull();
    expect(minutosDaHora("99:99")).toBeNull();
  });

  it("não deixa o carro sair no dia anterior", () => {
    // 01:00 menos 3h de antecedência daria -120: o carro sai à meia-noite.
    expect(horaDosMinutos(-120)).toBe("00:00");
  });
});

describe("quem divide o carro", () => {
  it("junta voos próximos do mesmo aeroporto no mesmo dia", () => {
    // O caso do handoff: 04:55, 05:30 e 05:50 dividem o carro. Comparação por
    // horário idêntico separaria os três.
    const carros = agruparEmCarros([p("a", "04:55"), p("b", "05:30"), p("c", "05:50")], "ida");
    expect(carros).toHaveLength(1);
    expect(carros[0].passageiros.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("abre carro novo quando o próximo passa da janela", () => {
    // 04:55 e 06:40 são 105 minutos — além dos 90 da janela.
    const carros = agruparEmCarros([p("a", "04:55"), p("b", "06:40")], "ida");
    expect(carros).toHaveLength(2);
  });

  it("a janela conta do PRIMEIRO do carro, não do anterior", () => {
    // 04:00, 05:20 e 05:40: o terceiro está a 20min do segundo, mas a 100 do
    // primeiro — sem essa regra o carro cresceria sem limite, de 20 em 20.
    const carros = agruparEmCarros([p("a", "04:00"), p("b", "05:20"), p("c", "05:40")], "ida");
    expect(carros).toHaveLength(2);
    expect(carros[0].passageiros.map((x) => x.id)).toEqual(["a", "b"]);
    expect(carros[1].passageiros.map((x) => x.id)).toEqual(["c"]);
  });

  it("não junta aeroportos nem datas diferentes", () => {
    const carros = agruparEmCarros([
      p("a", "05:00", "2026-09-30", "GRU"),
      p("b", "05:10", "2026-09-30", "CGH"),
      p("c", "05:10", "2026-10-01", "GRU"),
    ], "ida");
    expect(carros).toHaveLength(3);
  });

  it("respeita o máximo de pessoas por carro", () => {
    const carros = agruparEmCarros(
      [p("a", "05:00"), p("b", "05:10"), p("c", "05:20"), p("d", "05:30")],
      "ida",
      { maxPorCarro: 3 },
    );
    expect(carros.map((c) => c.passageiros.length)).toEqual([3, 1]);
  });

  it("quem não tem horário fica sozinho", () => {
    // Juntá-lo a um carro qualquer seria decidir por um dado que não existe.
    const carros = agruparEmCarros([p("a", "05:00"), p("b", null)], "ida");
    expect(carros).toHaveLength(2);
    expect(carros[1].passageiros[0].id).toBe("b");
    expect(carros[1].horario).toBeNull();
  });
});

describe("horário do carro", () => {
  it("na ida sai 3h antes do voo MAIS CEDO — ninguém perde voo", () => {
    const carros = agruparEmCarros([p("a", "04:55"), p("b", "05:50")], "ida");
    expect(carros[0].horario).toBe("01:55");
  });

  it("na volta busca 15min depois do ÚLTIMO pouso — ninguém espera sozinho", () => {
    const carros = agruparEmCarros([p("a", "22:10"), p("b", "22:40")], "volta");
    expect(carros[0].horario).toBe("22:55");
  });

  it("não é a média: a média não serve para nenhum dos dois", () => {
    const media = horaDosMinutos((minutosDaHora("04:55")! + minutosDaHora("05:50")!) / 2);
    expect(media).toBe("05:23");
    expect(horarioDoCarro([p("a", "04:55"), p("b", "05:50")], "ida")).not.toBe(media);
  });

  it("as constantes são ajustáveis", () => {
    expect(horarioDoCarro([p("a", "08:00")], "ida", { antecedenciaMin: 120 })).toBe("06:00");
    expect(horarioDoCarro([p("a", "08:00")], "volta", { esperaPousoMin: 30 })).toBe("08:30");
  });
});
