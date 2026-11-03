import { describe, expect, it } from "vitest";
import { calcAlimentacao } from "./alimentacao";
import { calcularPlanejadoDaVaga, linhaDoPlanejado, type VagaParaPlanejado } from "./budget-engine";
import { domingoDaNight, resumoDosDiasDeCarregamento, valemRegrasDe2910 } from "./regras-de-29-10";

// 2026-11-14 é sábado; 2026-11-15, domingo.
const NIGHT = {
  nomeDoEvento: "Night Run - Porto Alegre - 2026", fimDoEvento: "2026-11-15", fimDaEscala: "2026-11-14",
  collaboratorType: "casa", nomeDaFuncao: "kit",
};

describe("valemRegrasDe2910", () => {
  it("vale para o evento que termina a partir de 04/11/2026", () => {
    expect(valemRegrasDe2910("2026-11-04")).toBe(true);
    expect(valemRegrasDe2910("2026-11-03")).toBe(false);
    expect(valemRegrasDe2910(null)).toBe(false);
  });
});

describe("domingoDaNight", () => {
  it("casa com a escala terminando no sábado ganha o domingo", () => {
    expect(domingoDaNight(NIGHT)).toBe("2026-11-15");
  });
  it("nome do evento em qualquer caixa", () => {
    expect(domingoDaNight({ ...NIGHT, nomeDoEvento: "BLUE RUN NIGHT EDITION" })).toBe("2026-11-15");
  });
  it("freela e local não ganham (em produção o domingo à mão foi sempre da casa)", () => {
    expect(domingoDaNight({ ...NIGHT, collaboratorType: "freela" })).toBeNull();
    expect(domingoDaNight({ ...NIGHT, collaboratorType: "local" })).toBeNull();
  });
  it("casa na cenotécnica não recebe diária: fica de fora", () => {
    expect(domingoDaNight({ ...NIGHT, nomeDaFuncao: "cenotecnica" })).toBeNull();
  });
  it("evento que não é Night, escala que não termina no sábado, ou domingo fora do evento: nada", () => {
    expect(domingoDaNight({ ...NIGHT, nomeDoEvento: "Maratona de Salvador" })).toBeNull();
    expect(domingoDaNight({ ...NIGHT, nomeDoEvento: "Knight Games" })).toBeNull();
    expect(domingoDaNight({ ...NIGHT, fimDaEscala: "2026-11-13" })).toBeNull();
    expect(domingoDaNight({ ...NIGHT, fimDoEvento: "2026-11-14" })).toBeNull();
    expect(domingoDaNight({ ...NIGHT, fimDaEscala: null })).toBeNull();
  });
  it("evento antes do corte não muda", () => {
    expect(domingoDaNight({ ...NIGHT, fimDaEscala: "2026-10-24", fimDoEvento: "2026-10-25" })).toBeNull();
  });
});

describe("calcAlimentacao — sem logística e carregamento", () => {
  const dias = ["2026-11-12", "2026-11-13", "2026-11-14"];
  const base = { workDays: dias, voa: false, almocoCents: 4000, jantarCents: 4000 };

  it("sem a regra ligada: almoço + jantar, como antes", () => {
    const r = calcAlimentacao(base);
    expect(r).toMatchObject({ almocos: 3, jantares: 3, totalCents: 24000, estimado: false });
  });
  it("sem logística: só o almoço", () => {
    const r = calcAlimentacao({ ...base, semJantaSemLogistica: true });
    expect(r).toMatchObject({ almocos: 3, jantares: 0, totalCents: 12000, estimado: false });
  });
  it("o dia de carregamento tem janta", () => {
    const r = calcAlimentacao({ ...base, semJantaSemLogistica: true, diasCarregamento: ["2026-11-13"] });
    expect(r).toMatchObject({ almocos: 3, jantares: 1, totalCents: 16000 });
    expect(r.dias.find((d) => d.date === "2026-11-13")?.jantar).toBe(true);
    expect(r.dias.find((d) => d.date === "2026-11-12")?.jantar).toBe(false);
  });
  it("quem viaja continua pelos horários; carregamento garante a janta do dia", () => {
    const voa = { workDays: dias, voa: true, chegadaIda: "20:00", partidaVolta: "22:00", almocoCents: 4000, jantarCents: 4000, semJantaSemLogistica: true };
    expect(calcAlimentacao(voa).dias[0]).toMatchObject({ almoco: false, jantar: false });
    expect(calcAlimentacao(voa).dias[1]).toMatchObject({ almoco: true, jantar: true });
    expect(calcAlimentacao({ ...voa, diasCarregamento: [dias[0]] }).dias[0]).toMatchObject({ almoco: false, jantar: true });
  });
});

describe("Planejado — regras de 29/10", () => {
  const vaga = (p: Partial<VagaParaPlanejado> = {}) => ({
    id: "v1", eventId: "e1", functionId: "f1", collaboratorId: "c1", needsTicket: false,
    scheduleStartDate: "2026-11-13", scheduleEndDate: "2026-11-14", dailyRates: 2, ...p,
  }) as VagaParaPlanejado;
  const entrada = (p: Partial<Parameters<typeof calcularPlanejadoDaVaga>[0]> = {}) => ({
    vaga: vaga(), functionName: "kit", collaboratorType: "casa", settings: {}, functionValue: { dailyValueLocal: 20000, dailyValueTravel: 20000 } as never,
    eventName: "Night Run - Porto Alegre", eventEndDate: "2026-11-15", ...p,
  });

  it("Night: a casa que termina no sábado recebe a diária do domingo e o Realizado nasce com o dia", () => {
    const r = calcularPlanejadoDaVaga(entrada());
    expect(r.domingoDaNight).toBe("2026-11-15");
    expect(r.diasDaVagaComDomingo).toEqual(["2026-11-13", "2026-11-14", "2026-11-15"]);
    expect(r.weekends).toBe(2);
    expect(r.diasComDiaria).toBe(2);
    expect(linhaDoPlanejado(r).dailyQuantity).toBe(2);
  });
  it("freela na Night não muda", () => {
    const r = calcularPlanejadoDaVaga(entrada({ collaboratorType: "freela" }));
    expect(r.domingoDaNight).toBeNull();
    expect(r.diasDaVagaComDomingo).toBeNull();
    expect(r.weekends).toBe(1);
  });
  it("sem logística o Planejado não traz janta; dia de carregamento traz", () => {
    const sem = calcularPlanejadoDaVaga(entrada({ collaboratorType: "local", functionName: "produção" }));
    expect(sem.sysJantarSemana + sem.sysJantarFds).toBe(0);
    expect(sem.sysAlmocoSemana + sem.sysAlmocoFds).toBeGreaterThan(0);
    const com = calcularPlanejadoDaVaga(entrada({ collaboratorType: "local", functionName: "produção", vaga: vaga({ diasCarregamento: ["2026-11-14"] }) }));
    expect(com.sysJantarFds).toBeGreaterThan(0);
    expect(com.sysJantarSemana).toBe(0);
  });
  it("evento antes do corte: almoço + jantar, como sempre", () => {
    const r = calcularPlanejadoDaVaga(entrada({ collaboratorType: "local", functionName: "produção", eventEndDate: "2026-11-03", eventName: "Maratona" }));
    expect(r.sysJantarSemana + r.sysJantarFds).toBeGreaterThan(0);
  });
});

describe("resumoDosDiasDeCarregamento", () => {
  it("um, vários, nenhum", () => {
    expect(resumoDosDiasDeCarregamento(["2026-11-14"])).toBe("1 dia de carregamento (14/11)");
    expect(resumoDosDiasDeCarregamento(["2026-11-14", "2026-11-13"])).toBe("2 dias de carregamento (13/11 e 14/11)");
    expect(resumoDosDiasDeCarregamento(null)).toBe("");
  });
});

describe("Revisão de 03/11", () => {
  it("domingo da Night: percurso e função local da casa ficam de fora", () => {
    expect(domingoDaNight({ ...NIGHT, nomeDaFuncao: "percurso" })).toBeNull();
    expect(domingoDaNight({ ...NIGHT, nomeDaFuncao: "produção local" })).toBeNull();
  });

  it("carregamento em quem viaja só vale com a regra ligada (evento antigo não muda)", () => {
    const voa = { workDays: ["2026-11-12", "2026-11-13"], voa: true, chegadaIda: "20:00", partidaVolta: "22:00", almocoCents: 4000, jantarCents: 4000, diasCarregamento: ["2026-11-12"] };
    expect(calcAlimentacao(voa).dias[0].jantar).toBe(false);
    expect(calcAlimentacao({ ...voa, semJantaSemLogistica: true }).dias[0].jantar).toBe(true);
  });

  it("janta à mão na linha pré-aprovada não some ao recalcular; o ajuste da tela vence", () => {
    const entrada = {
      vaga: { id: "v1", eventId: "e1", functionId: "f1", collaboratorId: "c1", needsTicket: false, scheduleStartDate: "2026-11-12", scheduleEndDate: "2026-11-13", dailyRates: 2 } as VagaParaPlanejado,
      functionName: "produção", collaboratorType: "local", settings: {}, functionValue: { dailyValueLocal: 20000, dailyValueTravel: 20000 } as never,
      eventName: "Maratona", eventEndDate: "2026-11-15",
    };
    expect(calcularPlanejadoDaVaga(entrada).jantarSemana).toBe(0);
    expect(calcularPlanejadoDaVaga({ ...entrada, jantaPreAprovada: { semana: 4000, fds: 0 } }).jantarSemana).toBe(4000);
    const ajuste = { jantarSemana: 0 } as never;
    expect(calcularPlanejadoDaVaga({ ...entrada, jantaPreAprovada: { semana: 4000, fds: 0 }, override: ajuste }).jantarSemana).toBe(0);
  });
});
