import { describe, it, expect } from "vitest";
import {
  DEFAULT_PERIOD, diaLocal, ehFimDeSemana, fazTesteDePeriodo, janelaDoPeriodo,
  pegaFimDeSemana, periodoDaLinha, rotuloDoPeriodo, temRecorteDePeriodo,
  type PeriodConfig,
} from "./scaling-period";

/** Sábado, 25/07/2026 — a mesma referência do protótipo do handoff. */
const HOJE = new Date(2026, 6, 25);

const cfg = (over: Partial<PeriodConfig> = {}): PeriodConfig => ({ ...DEFAULT_PERIOD, ...over });
const linha = (ini: string, fim?: string) => ({ scheduleStartDate: ini, scheduleEndDate: fim ?? ini });

describe("datas como dia de calendário", () => {
  it("lê a data no fuso local, não em UTC", () => {
    // new Date("2026-09-03") seria UTC e voltaria um dia a oeste de Greenwich.
    const d = diaLocal("2026-09-03")!;
    expect(d.getDate()).toBe(3);
    expect(d.getMonth()).toBe(8);
    expect(diaLocal("2026-09-03T00:00:00.000Z")!.getDate()).toBe(3);
    expect(diaLocal("")).toBeNull();
    expect(diaLocal(null)).toBeNull();
  });

  it("sem data de término, o período é de um dia só", () => {
    expect(periodoDaLinha({ scheduleStartDate: "2026-09-03", scheduleEndDate: null })).toEqual({
      ini: new Date(2026, 8, 3), fim: new Date(2026, 8, 3),
    });
  });

  it("término antes do início é lido invertido, não descartado", () => {
    const p = periodoDaLinha({ scheduleStartDate: "2026-09-05", scheduleEndDate: "2026-09-03" })!;
    expect(p.ini.getDate()).toBe(3);
    expect(p.fim.getDate()).toBe(5);
  });
});

describe("fim de semana", () => {
  it("reconhece sábado e domingo", () => {
    expect(ehFimDeSemana(new Date(2026, 6, 25))).toBe(true);  // sábado
    expect(ehFimDeSemana(new Date(2026, 6, 26))).toBe(true);  // domingo
    expect(ehFimDeSemana(new Date(2026, 6, 27))).toBe(false); // segunda
  });

  it("um intervalo de 7 dias ou mais sempre pega o fim de semana", () => {
    expect(pegaFimDeSemana(new Date(2026, 6, 27), new Date(2026, 7, 5))).toBe(true);
  });

  it("segunda a sexta não pega", () => {
    expect(pegaFimDeSemana(new Date(2026, 6, 27), new Date(2026, 6, 31))).toBe(false);
  });
});

describe("janela dos presets", () => {
  it("qualquer data não recorta", () => {
    expect(janelaDoPeriodo(cfg(), HOJE)).toBeNull();
  });

  it("próximos 7 e 30 dias contam de hoje", () => {
    expect(janelaDoPeriodo(cfg({ preset: "7" }), HOJE)).toEqual([new Date(2026, 6, 25), new Date(2026, 7, 1)]);
    expect(janelaDoPeriodo(cfg({ preset: "30" }), HOJE)![1]).toEqual(new Date(2026, 7, 24));
  });

  it("este mês e mês que vem pegam o mês inteiro", () => {
    expect(janelaDoPeriodo(cfg({ preset: "mes" }), HOJE)).toEqual([new Date(2026, 6, 1), new Date(2026, 6, 31)]);
    expect(janelaDoPeriodo(cfg({ preset: "proximo" }), HOJE)).toEqual([new Date(2026, 7, 1), new Date(2026, 7, 31)]);
  });

  it("já começou vai do passado até hoje", () => {
    expect(janelaDoPeriodo(cfg({ preset: "andamento" }), HOJE)![1]).toEqual(new Date(2026, 6, 25));
  });

  it("já terminou (eventos realizados) para em ontem — o que está rolando fica de fora", () => {
    const janela = janelaDoPeriodo(cfg({ preset: "realizados" }), HOJE)!;
    expect(janela[1]).toEqual(new Date(2026, 6, 24));
    const teste = fazTesteDePeriodo(cfg({ preset: "realizados" }), HOJE);
    expect(teste({ scheduleStartDate: "2026-07-20", scheduleEndDate: "2026-07-24" })).toBe(true);
    expect(teste({ scheduleStartDate: "2026-07-23", scheduleEndDate: "2026-07-25" })).toBe(false);
  });

  it("datas exatas com um lado só deixam a outra ponta aberta", () => {
    const so = janelaDoPeriodo(cfg({ preset: "custom", de: "2026-09-01" }), HOJE)!;
    expect(so[0]).toEqual(new Date(2026, 8, 1));
    expect(so[1].getFullYear()).toBeGreaterThan(2900);
    expect(janelaDoPeriodo(cfg({ preset: "custom" }), HOJE)).toBeNull();
  });
});

describe("a janela é por sobreposição, não por continência", () => {
  it("escala longa que CRUZA a janela entra", () => {
    // 20/07 a 20/08 não cabe em "próximos 7 dias", mas está acontecendo dentro
    // dela — continência esconderia justamente as escalas que exigem mais
    // antecedência.
    const teste = fazTesteDePeriodo(cfg({ preset: "7" }), HOJE);
    expect(teste(linha("2026-07-20", "2026-08-20"))).toBe(true);
  });

  it("escala inteiramente fora fica de fora", () => {
    const teste = fazTesteDePeriodo(cfg({ preset: "7" }), HOJE);
    expect(teste(linha("2026-10-01", "2026-10-05"))).toBe(false);
  });

  it("encostar na borda conta como cruzar", () => {
    const teste = fazTesteDePeriodo(cfg({ preset: "7" }), HOJE);
    expect(teste(linha("2026-08-01", "2026-08-10"))).toBe(true);  // começa no último dia
    expect(teste(linha("2026-08-02", "2026-08-10"))).toBe(false); // um dia depois
  });

  it("vaga sem data nenhuma NÃO é escondida por um filtro de data", () => {
    // Ela ainda precisa ser escalada; sumir da fila é pior do que aparecer
    // fora do recorte.
    const teste = fazTesteDePeriodo(cfg({ preset: "7" }), HOJE);
    expect(teste({ scheduleStartDate: null, scheduleEndDate: null })).toBe(true);
  });
});

describe("dias da semana", () => {
  const seg = linha("2026-07-27", "2026-07-31"); // seg → sex
  const cruzaSabado = linha("2026-07-30", "2026-08-02"); // qui → dom

  it("pega sábado ou domingo mantém só quem cruza o fim de semana", () => {
    const teste = fazTesteDePeriodo(cfg({ semana: "fds" }), HOJE);
    expect(teste(cruzaSabado)).toBe(true);
    expect(teste(seg)).toBe(false);
  });

  it("só dias úteis é o complemento exato", () => {
    const teste = fazTesteDePeriodo(cfg({ semana: "uteis" }), HOJE);
    expect(teste(seg)).toBe(true);
    expect(teste(cruzaSabado)).toBe(false);
  });

  it("começa no fim de semana olha só a data de início", () => {
    const teste = fazTesteDePeriodo(cfg({ inicioFds: true }), HOJE);
    expect(teste(linha("2026-08-01", "2026-08-05"))).toBe(true);  // sábado
    expect(teste(cruzaSabado)).toBe(false);                        // quinta
  });

  it("combina com a janela: as duas condições valem juntas", () => {
    const teste = fazTesteDePeriodo(cfg({ preset: "7", semana: "uteis" }), HOJE);
    expect(teste(seg)).toBe(true);
    expect(teste(linha("2026-10-05", "2026-10-09"))).toBe(false); // útil, mas fora da janela
  });
});

describe("rótulo e estado do botão", () => {
  it("o rótulo É o recorte, não a palavra Período", () => {
    expect(rotuloDoPeriodo(cfg())).toBe("Qualquer data");
    expect(rotuloDoPeriodo(cfg({ preset: "30" }))).toBe("Próximos 30 dias");
    expect(rotuloDoPeriodo(cfg({ preset: "custom", de: "2026-09-18", ate: "2026-09-22" }))).toBe("18/09 – 22/09");
    expect(rotuloDoPeriodo(cfg({ preset: "custom", de: "2026-09-18" }))).toBe("a partir de 18/09");
    expect(rotuloDoPeriodo(cfg({ semana: "uteis" }))).toBe("Só dias úteis");
    expect(rotuloDoPeriodo(cfg({ preset: "7", inicioFds: true }))).toBe("Próximos 7 dias · Começa no fim de semana");
  });

  it("sabe quando há recorte ativo", () => {
    expect(temRecorteDePeriodo(cfg())).toBe(false);
    expect(temRecorteDePeriodo(cfg({ preset: "custom" }))).toBe(false); // sem data nenhuma
    expect(temRecorteDePeriodo(cfg({ preset: "custom", ate: "2026-09-01" }))).toBe(true);
    expect(temRecorteDePeriodo(cfg({ inicioFds: true }))).toBe(true);
  });
});
