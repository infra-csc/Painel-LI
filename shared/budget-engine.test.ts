import { describe, it, expect } from "vitest";
import { calcularPlanejadoDaVaga, contarDiasDoPeriodo, linhaDoPlanejado } from "./budget-engine";
import { FREELA_DEFAULTS_CENTS, CASA_DEFAULTS_CENTS } from "./calculation-rules";
import { MOBILIDADE_TRECHO_PADRAO_CENTS } from "./atendimento";
import type { HonorarioNaVaga } from "./honorarios-ceno";

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

  it("percurso: pacote fechado, uma diária por dia trabalhado, sem deflação, sem alimentação nem mobilidade", () => {
    // Regra mudou em 15/10: antes eram 2 diárias fixas em viagem; agora a
    // semana inteira (6 dias trabalhados) vale 6 diárias do pacote.
    const r = calcularPlanejadoDaVaga({
      vaga: { ...semana, needsTicket: true, dailyRates: 6, dailyValue: 0, percurseiroTipo: "tipo_2" },
      functionName: "Percurso",
      collaboratorType: "freela",
      settings: {},
      eventLocation: "Recife - PE",
    });
    expect(r.isPercurso).toBe(true);
    expect(r.diasComDiaria).toBe(6);
    expect(r.percurseiro?.total).toBe(r.valorDiaria);
    expect(r.subtotalDiarias).toBe(r.valorDiaria * 6);
    expect(r.deflationSegments[0]?.label).toBe("pacote fechado");
    expect(r.mobilidade).toBe(0);
    expect(r.ajudaCusto).toBe(0);
  });

  it("percurso (regra 15/10) — Alex, Night Run Teresina: escala só 10/10 com passagem → 1 diária = R$ 1.129,76 (era 2 × = R$ 2.259,52)", () => {
    const r = calcularPlanejadoDaVaga({
      vaga: { scheduleStartDate: "2026-10-10", scheduleEndDate: "2026-10-10", dailyRates: 1, needsTicket: true, dailyValue: 0, percurseiroTipo: "tipo_1" },
      functionName: "Percurso",
      collaboratorType: "freela",
      settings: {},
      eventLocation: "Teresina - PI",
      ticket: {
        actualDepartureDate: "2026-10-09", actualDepartureTime: "23:35", actualArrivalTime: "02:35",
        actualReturnDate: "2026-10-11", actualReturnTime: "18:55",
      },
    });
    expect(r.diasComDiaria).toBe(1);
    expect(r.valorDiaria).toBe(112976);
    expect(r.subtotalDiarias).toBe(112976);
    expect(r.ajudaCusto).toBe(0); // alimentação e mobilidade continuam dentro do pacote
    expect(r.totalFinal).toBe(112976);
  });

  it("percurso (regra 15/10): dias marcados na escala (workDays) mandam sobre o intervalo; local também conta por dia", () => {
    const r = calcularPlanejadoDaVaga({
      vaga: { ...semana, workDays: ["2026-09-01", "2026-09-03"], needsTicket: false, dailyRates: 2, dailyValue: 0, percurseiroTipo: "tipo_1" },
      functionName: "Percurso",
      collaboratorType: "freela",
      settings: {},
      eventLocation: "São Paulo - SP",
    });
    expect(r.diasComDiaria).toBe(2);
    expect(r.subtotalDiarias).toBe(2 * 112976);
  });

  it("alimentação (15/10) — Everson, casa CLT produção, Teresina 07–11/10, volta 12/10 03:45: fds R$ 160, úteis R$ 135, total R$ 295", () => {
    const r = calcularPlanejadoDaVaga({
      vaga: { scheduleStartDate: "2026-10-07", scheduleEndDate: "2026-10-11", dailyRates: 5, needsTicket: true, dailyValue: 0 },
      functionName: "Produção",
      collaboratorType: "casa",
      settings: {},
      eventLocation: "Teresina - PI",
      ticket: {
        actualDepartureDate: "2026-10-07", actualDepartureTime: "06:50", actualArrivalTime: "10:00",
        actualReturnDate: "2026-10-12", actualReturnTime: "03:45",
      },
    });
    expect(r.weekdays).toBe(3);
    expect(r.weekends).toBe(2);
    // sábado e domingo: 2 almoços + 2 jantares de R$ 40 (antes: R$ 80, só o sábado)
    expect(r.almocoFds).toBe(8000);
    expect(r.jantarFds).toBe(8000);
    // qua/qui/sex: 3 × (5 + 40)
    expect(r.almocoSemana + r.jantarSemana).toBe(13500);
    expect(r.almocoSemana + r.jantarSemana + r.almocoFds + r.jantarFds).toBe(29500);
    expect(r.alimEstimada).toBe(false);
  });

  it("alimentação (19/10) — Rubem, casa, NR Teresina 08–11/10: chega 11:30 (almoço até 13h) e a volta 18:55 chega 22:05 (janta): semana R$ 90, fds R$ 160", () => {
    const r = calcularPlanejadoDaVaga({
      vaga: { scheduleStartDate: "2026-10-08", scheduleEndDate: "2026-10-11", dailyRates: 4, needsTicket: true, dailyValue: 0 },
      functionName: "Dir Prova",
      collaboratorType: "casa",
      settings: {},
      eventLocation: "Teresina - PI",
      ticket: {
        actualDepartureDate: "2026-10-08", actualDepartureTime: "06:00", actualArrivalTime: "11:30",
        actualReturnDate: "2026-10-11", actualReturnTime: "18:55", returnArrivalTime: "22:05",
      },
    });
    expect(r.almocoSemana + r.jantarSemana).toBe(9000); // qui/sex: 2 × (5 + 40) — antes R$ 85
    expect(r.almocoFds + r.jantarFds).toBe(16000); // sáb/dom: 2 × (40 + 40) — antes R$ 120
  });

  it("alimentação (19/10): chega 13:30 → sem almoço no 1º dia; volta 18:55 chegando 21:00 em ponto → sem janta", () => {
    const r = calcularPlanejadoDaVaga({
      vaga: { scheduleStartDate: "2026-10-08", scheduleEndDate: "2026-10-11", dailyRates: 4, needsTicket: true, dailyValue: 0 },
      functionName: "Dir Prova",
      collaboratorType: "casa",
      settings: {},
      eventLocation: "Teresina - PI",
      ticket: {
        actualDepartureDate: "2026-10-08", actualDepartureTime: "08:00", actualArrivalTime: "13:30",
        actualReturnDate: "2026-10-11", actualReturnTime: "18:55", returnArrivalTime: "21:00",
      },
    });
    expect(r.almocoSemana).toBe(500); // só a sexta
    expect(r.jantarFds).toBe(4000); // só o sábado
  });

  it("alimentação (15/10): sem passagem, as datas SUGERIDAS da vaga fazem o mesmo papel", () => {
    const r = calcularPlanejadoDaVaga({
      vaga: {
        scheduleStartDate: "2026-10-07", scheduleEndDate: "2026-10-11", dailyRates: 5, needsTicket: true, dailyValue: 0,
        flightDepartureDate: "2026-10-07", flightDepartureSuggestedTime: "06:50", flightArrivalSuggestedTime: "10:00",
        flightReturnDate: "2026-10-12", flightReturnSuggestedTime: "03:45",
      },
      functionName: "Produção",
      collaboratorType: "casa",
      settings: {},
      eventLocation: "Teresina - PI",
    });
    expect(r.almocoFds + r.jantarFds).toBe(16000);
  });

  it("alimentação (15/10): volta na MESMA data do último dia às 18:55 → domingo só com almoço (R$ 120 no fds)", () => {
    const r = calcularPlanejadoDaVaga({
      vaga: { scheduleStartDate: "2026-10-07", scheduleEndDate: "2026-10-11", dailyRates: 5, needsTicket: true, dailyValue: 0 },
      functionName: "Produção",
      collaboratorType: "casa",
      settings: {},
      eventLocation: "Teresina - PI",
      ticket: {
        actualDepartureDate: "2026-10-07", actualDepartureTime: "06:50", actualArrivalTime: "10:00",
        actualReturnDate: "2026-10-11", actualReturnTime: "18:55",
      },
    });
    expect(r.almocoFds).toBe(8000);
    expect(r.jantarFds).toBe(4000);
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

// ── Honorário aprovado da cenotécnica (21/10) ───────────────────────────────
describe("calcularPlanejadoDaVaga — honorário da cenotécnica (21/10)", () => {
  // Ter–qui: 3 dias de trabalho, freela de cenotécnica em viagem, fora de SP.
  const cenoViagem = {
    vaga: { scheduleStartDate: "2026-09-01", scheduleEndDate: "2026-09-03", needsTicket: true, dailyRates: 3, dailyValue: 0, cenoFreelaTipo: "viagem" },
    functionName: "Cenotécnica",
    collaboratorType: "freela",
    settings: {},
    eventLocation: "Recife - PE",
  } as const;
  const honorario = (situacao: "aprovado" | "pendente", valorCents: number, extra: Partial<HonorarioNaVaga> = {}): HonorarioNaVaga => ({
    honorarioId: "h1", tipo: "vaga", nome: "Fulano", status: situacao === "aprovado" ? "aprovado_ajuste" : "aguardando", situacao,
    valorCents, empreita: null, aprovadoPor: situacao === "aprovado" ? "Marcos Vieira" : null, aprovadoEm: situacao === "aprovado" ? "2026-10-21T13:00:00.000Z" : null,
    colaboradorTrocado: false, ...extra,
  });

  it("vaga com a tabela (Freela Viagem, 3 dias) → aprovado com ajuste: a mão de obra vira o aprovado; alimentação e mobilidade não mudam", () => {
    const tabela = calcularPlanejadoDaVaga(cenoViagem);
    expect(tabela.subtotalDiarias).toBe(125_700);
    expect(tabela.cenoEmpreita?.totalCents).toBe(125_700);
    const r = calcularPlanejadoDaVaga({ ...cenoViagem, honorario: honorario("aprovado", 100_000) });
    expect(r.subtotalDiarias).toBe(100_000);
    expect(r.honorarioAprovado).toBe(true);
    expect(r.maoDeObraPelaRegra).toBe(125_700);
    expect(r.cenoEmpreita).toBeNull(); // a tabela não vale mais para a vaga
    expect(r.sysValorDiaria).toBe(Math.round(100_000 / 3));
    expect(r.deflationSegments).toEqual([expect.objectContaining({ days: 3, factor: 1, totalCents: 100_000, label: "honorário aprovado" })]);
    expect(r.mobilidade).toBe(tabela.mobilidade);
    expect(r.ajudaCusto).toBe(tabela.ajudaCusto);
    expect(r.totalFinal).toBe(tabela.totalFinal - 125_700 + 100_000);
  });

  it("\"Outro valor\" aprovado numa vaga sem tipo de freela: o aprovado substitui a diária com deflação", () => {
    const semTipo = { ...cenoViagem, vaga: { ...cenoViagem.vaga, cenoFreelaTipo: null } };
    const diaria = calcularPlanejadoDaVaga(semTipo);
    const r = calcularPlanejadoDaVaga({ ...semTipo, honorario: honorario("aprovado", 150_000, { status: "aprovado" }) });
    expect(r.subtotalDiarias).toBe(150_000);
    expect(r.maoDeObraPelaRegra).toBe(diaria.subtotalDiarias);
    expect(r.totalFinal).toBe(diaria.ajudaCusto + 150_000);
  });

  it("aguardando aprovação não muda o valor: só leva o honorário para o selo", () => {
    const tabela = calcularPlanejadoDaVaga(cenoViagem);
    const r = calcularPlanejadoDaVaga({ ...cenoViagem, honorario: honorario("pendente", 90_000) });
    expect(r.subtotalDiarias).toBe(tabela.subtotalDiarias);
    expect(r.totalFinal).toBe(tabela.totalFinal);
    expect(r.honorarioAprovado).toBe(false);
    expect(r.honorario?.valorCents).toBe(90_000);
    expect(r.maoDeObraPelaRegra).toBeNull();
  });

  it("ajuste manual da diária vence o aprovado e marca a diferença; igual à diária do honorário não é diferença", () => {
    const h = honorario("aprovado", 100_000);
    const ajustado = calcularPlanejadoDaVaga({ ...cenoViagem, honorario: h, override: { valorDiaria: 40_000 } });
    expect(ajustado.subtotalDiarias).toBe(120_000);
    expect(ajustado.honorarioAprovado).toBe(true);
    expect(ajustado.honorarioDifere).toBe(true);
    expect(ajustado.hasOverride).toBe(true);
    const igual = calcularPlanejadoDaVaga({ ...cenoViagem, honorario: h, override: { valorDiaria: Math.round(100_000 / 3) } });
    expect(igual.subtotalDiarias).toBe(100_000);
    expect(igual.honorarioDifere).toBe(false);
  });

  it("parte de uma empreita: vale a parte rateada; empreita por EMPRESA na escala também cede ao aprovado", () => {
    const parte = honorario("aprovado", 33_334, { tipo: "empreita", nome: "Equipe Sul", empreita: { totalCents: 100_000, vagas: 3, primeira: true } });
    expect(calcularPlanejadoDaVaga({ ...cenoViagem, honorario: parte }).subtotalDiarias).toBe(33_334);
    const empresa = {
      ...cenoViagem,
      vaga: { ...cenoViagem.vaga, empreitaEmpresa: "Cenotech", empreitaPessoas: 4, empreitaValor: 1_200_000 },
      collaboratorType: null,
    };
    const r = calcularPlanejadoDaVaga({ ...empresa, honorario: honorario("aprovado", 900_000) });
    expect(r.subtotalDiarias).toBe(900_000);
    expect(r.maoDeObraPelaRegra).toBe(1_200_000);
    // A regra da empresa continua: sem alimentação e sem mobilidade por pessoa.
    expect(r.ajudaCusto).toBe(0);
    expect(r.totalFinal).toBe(900_000);
  });
});
