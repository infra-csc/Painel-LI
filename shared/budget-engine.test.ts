import { describe, it, expect } from "vitest";
import { calcularPlanejadoDaVaga, contarDiasDoPeriodo, linhaDoPlanejado } from "./budget-engine";
import { FREELA_DEFAULTS_CENTS, CASA_DEFAULTS_CENTS } from "./calculation-rules";
import { MOBILIDADE_TRECHO_PADRAO_CENTS } from "./atendimento";

// 2026-09-01 é terça; 2026-09-06 é domingo.
const semana = { scheduleStartDate: "2026-09-01", scheduleEndDate: "2026-09-06" };

describe("contarDiasDoPeriodo — a contagem que a tela do Planejado faz", () => {
  it("com início e fim conta o intervalo inteiro, separando útil de fim de semana", () => {
    const r = contarDiasDoPeriodo("2026-09-01", "2026-09-06", 99);
    expect(r).toMatchObject({ weekdays: 4, weekends: 2, qtdDiarias: 6 });
    expect(r.diasPeriodo).toEqual(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"]);
  });

  it("sem o fim, anda dailyRates dias a partir do início (grade antiga) e não lista dias", () => {
    const r = contarDiasDoPeriodo("2026-09-04", null, 3); // sex, sáb, dom
    expect(r).toMatchObject({ weekdays: 1, weekends: 2, qtdDiarias: 3, diasPeriodo: [] });
  });

  it("sem início não conta nada", () => {
    expect(contarDiasDoPeriodo(null, null, 5)).toMatchObject({ weekdays: 0, weekends: 0, qtdDiarias: 5 });
  });
});

describe("calcularPlanejadoDaVaga — sequência da tela, sem a tela", () => {
  it("freela em viagem, evento fora de SP, sem passagem registrada: diária do slide, mobilidade R$29 por trecho, sem alimentação", () => {
    const r = calcularPlanejadoDaVaga({
      vaga: { ...semana, needsTicket: true, dailyRates: 6, dailyValue: 0 },
      functionName: "Produção",
      collaboratorType: "freela",
      functionValue: null,
      settings: {},
      eventLocation: "Recife - PE",
      ticket: null,
    });
    expect(r.diasComDiaria).toBe(6);
    expect(r.sysValorDiaria).toBe(FREELA_DEFAULTS_CENTS.viagem);
    // 6 dias: 4 a 100% + 2 a 90% (deflação padrão)
    expect(r.subtotalDiarias).toBe(FREELA_DEFAULTS_CENTS.viagem * 4 + Math.round(FREELA_DEFAULTS_CENTS.viagem * 0.9) * 2);
    expect(r.mobilidadeIda).toBe(MOBILIDADE_TRECHO_PADRAO_CENTS);
    expect(r.mobilidadeVolta).toBe(MOBILIDADE_TRECHO_PADRAO_CENTS);
    // freela não recebe alimentação (26/08)
    expect(r.almocoSemana + r.jantarSemana + r.almocoFds + r.jantarFds).toBe(0);
    expect(r.totalFinal).toBe(r.subtotalDiarias + r.mobilidade);
    expect(r.hasOverride).toBe(false);
  });

  it("casa em evento em SP: diária só nos fins de semana, mobilidade zero, almoço reduzido em dia útil", () => {
    const r = calcularPlanejadoDaVaga({
      vaga: { ...semana, needsTicket: false, dailyRates: 6, dailyValue: 0 },
      functionName: "Produção",
      collaboratorType: "casa",
      settings: {},
      eventLocation: "São Paulo - SP",
    });
    expect(r.regraDiaria).toBe("fds");
    expect(r.diasComDiaria).toBe(2);
    expect(r.sysValorDiaria).toBe(CASA_DEFAULTS_CENTS.produtor);
    expect(r.subtotalDiarias).toBe(CASA_DEFAULTS_CENTS.produtor * 2);
    expect(r.subtotalDiariasUtil).toBe(0);
    expect(r.mobilidade).toBe(0);
    // jornada externa: almoço + jantar todos os dias; casa em dia útil almoça R$ 5
    expect(r.unitAlmocoSemana).toBe(500);
    expect(r.almocoSemana).toBe(4 * 500);
    expect(r.almocoFds).toBe(2 * 4000);
  });

  it("override manual vence o valor de sistema, e o de sistema continua disponível para 'Restaurar padrão'", () => {
    const base = {
      vaga: { ...semana, needsTicket: true, dailyRates: 6, dailyValue: 0 },
      functionName: "Produção",
      collaboratorType: "freela" as const,
      settings: {},
      eventLocation: "Recife - PE",
    };
    const semOverride = calcularPlanejadoDaVaga(base);
    const comOverride = calcularPlanejadoDaVaga({ ...base, override: { valorDiaria: 10000, mobilidade: 0 } });
    expect(comOverride.valorDiaria).toBe(10000);
    expect(comOverride.sysValorDiaria).toBe(semOverride.sysValorDiaria);
    expect(comOverride.mobilidade).toBe(0);
    expect(comOverride.sysMobilidade).toBe(semOverride.mobilidade);
    expect(comOverride.hasOverride).toBe(true);
  });

  it("percurso: pacote fechado, 2 diárias em viagem, sem deflação, sem alimentação nem mobilidade", () => {
    const r = calcularPlanejadoDaVaga({
      vaga: { ...semana, needsTicket: true, dailyRates: 6, dailyValue: 0, percurseiroTipo: "tipo_2" },
      functionName: "Percurso",
      collaboratorType: "freela",
      settings: {},
      eventLocation: "Recife - PE",
    });
    expect(r.isPercurso).toBe(true);
    expect(r.diasComDiaria).toBe(2);
    expect(r.percurseiro?.total).toBe(r.valorDiaria);
    expect(r.subtotalDiarias).toBe(r.valorDiaria * 2);
    expect(r.deflationSegments[0]?.label).toBe("pacote fechado");
    expect(r.mobilidade).toBe(0);
    expect(r.ajudaCusto).toBe(0);
  });

  it("empreita por empresa: o total é exatamente o valor fechado da vaga", () => {
    const r = calcularPlanejadoDaVaga({
      vaga: { ...semana, needsTicket: false, dailyRates: 6, dailyValue: 0, empreitaEmpresa: "Cenotech", empreitaPessoas: 4, empreitaValor: 1_200_000 },
      functionName: "Cenotécnica",
      collaboratorType: null,
      settings: {},
      eventLocation: "Recife - PE",
    });
    expect(r.cenoEmpreita?.totalCents).toBe(1_200_000);
    expect(r.subtotalDiarias).toBe(1_200_000);
    expect(r.ajudaCusto).toBe(0);
    expect(r.totalFinal).toBe(1_200_000);
  });

  it("passagem registrada manda nos horários (fonteVoo = passagem) e van conta como terrestre", () => {
    const r = calcularPlanejadoDaVaga({
      vaga: { ...semana, needsTicket: true, dailyRates: 6, dailyValue: 0, flightDepartureSuggestedTime: "23:50" },
      functionName: "Produção",
      collaboratorType: "local",
      settings: {},
      eventLocation: "Recife - PE",
      ticket: { actualDepartureTime: "10:00", actualArrivalTime: "12:00", actualReturnTime: "15:00", transportType: "van" },
    });
    expect(r.fonteVoo).toBe("passagem");
    expect(r.vooPartidaIda).toBe("10:00");
    expect(r.mobilidadeIda).toBe(MOBILIDADE_TRECHO_PADRAO_CENTS);
    expect(r.alimEstimada).toBe(false);
  });
});

describe("linhaDoPlanejado — o que vai para budget_planned", () => {
  it("grava os dias com diária e a diária média ponderada; total = totalFinal", () => {
    const r = calcularPlanejadoDaVaga({
      vaga: { ...semana, needsTicket: true, dailyRates: 6, dailyValue: 0 },
      functionName: "Produção",
      collaboratorType: "freela",
      settings: {},
      eventLocation: "Recife - PE",
    });
    const linha = linhaDoPlanejado(r);
    expect(linha.dailyQuantity).toBe(6);
    expect(linha.dailyValue).toBe(Math.round(r.subtotalDiarias / 6));
    expect(linha.totalValue).toBe(r.totalFinal);
    expect(linha.mobility).toBe(linha.mobilityIda + linha.mobilityVolta);
    expect(linha.costAssistance).toBe(0);
    expect(linha.transport).toBe(0);
  });

  it("sem dias com diária, mantém a diária unitária em vez de dividir por zero", () => {
    const r = calcularPlanejadoDaVaga({
      vaga: { ...semana, needsTicket: false, dailyRates: 6, dailyValue: 0 },
      functionName: "Cenotécnica",
      collaboratorType: "casa", // casa + cenotécnica = "nenhuma" diária
      settings: {},
      eventLocation: "São Paulo - SP",
    });
    expect(r.diasComDiaria).toBe(0);
    expect(linhaDoPlanejado(r).dailyQuantity).toBe(0);
    expect(linhaDoPlanejado(r).dailyValue).toBe(r.valorDiaria);
  });
});
