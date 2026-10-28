/**
 * Ajustes pedidos pelo DP (28/10) no motor do Planejado:
 *  1. 1,5 diária num dia (carga/descarga) — shared/meia-diaria.ts;
 *  2. empreita da tabela sem mobilidade;
 *  3. VR do colaborador da casa no almoço de dia útil;
 *  4. mobilidade do ajuste manual sempre coerente (total = ida + volta).
 */
import { describe, it, expect } from "vitest";
import { calcularPlanejadoDaVaga, linhaDoPlanejado, EMPREITA_SEM_MOBILIDADE_RAZAO } from "./budget-engine";
import { CASA_DEFAULTS_CENTS, FREELA_DEFAULTS_CENTS, PERCURSEIRO_DEFAULTS } from "./calculation-rules";
import { MOBILIDADE_TRECHO_PADRAO_CENTS } from "./atendimento";
import { refeicaoCentsDia } from "./alimentacao";
import { mobilidadeCoerente } from "./comparativo";
import type { HonorarioNaVaga } from "./honorarios-ceno";

// 2026-09-01 é terça; 2026-09-05/06 são sábado e domingo.
const semana = { scheduleStartDate: "2026-09-01", scheduleEndDate: "2026-09-06" };
const freelaViagem = {
  vaga: { ...semana, needsTicket: true, dailyRates: 6, dailyValue: 0 },
  functionName: "Produção",
  collaboratorType: "freela",
  settings: {},
  eventLocation: "Recife - PE",
} as const;
const V = FREELA_DEFAULTS_CENTS.viagem; // R$ 540,00

describe("1,5 diária num dia (28/10)", () => {
  it("soma ½ da diária do dia, com o fator de deflação DAQUELE dia; a média gravada carrega o ½", () => {
    const sem = calcularPlanejadoDaVaga(freelaViagem);
    const r = calcularPlanejadoDaVaga({ ...freelaViagem, vaga: { ...freelaViagem.vaga, diasMeiaExtra: ["2026-09-02", "2026-09-06"] } });
    // 2º dia: 100% → ½ = 270,00; 6º dia: 90% (486,00) → ½ = 243,00
    expect(r.meiasDiarias).toEqual([{ dia: "2026-09-02", valorCents: V / 2 }, { dia: "2026-09-06", valorCents: Math.round(V * 0.9) / 2 }]);
    expect(r.subtotalMeiasDiarias).toBe(27_000 + 24_300);
    expect(r.subtotalDiarias).toBe(sem.subtotalDiarias + 51_300);
    expect(r.totalFinal).toBe(sem.totalFinal + 51_300);
    expect(r.diasComDiaria).toBe(6); // a contagem de dias não muda
    // útil × fds: o ½ do domingo vai para o fim de semana
    expect(r.subtotalDiariasUtil + r.subtotalDiariasFds).toBe(r.subtotalDiarias);
    expect(r.subtotalDiariasFds - sem.subtotalDiariasFds).toBe(24_300);
    const linha = linhaDoPlanejado(r);
    expect(linha.dailyQuantity).toBe(6);
    expect(linha.dailyValue).toBe(Math.round(r.subtotalDiarias / 6));
    expect(linha.diasMeiaExtra).toEqual(["2026-09-02", "2026-09-06"]);
  });

  it("dia fora dos dias de trabalho, repetido ou inválido é ignorado", () => {
    const r = calcularPlanejadoDaVaga({
      ...freelaViagem,
      vaga: { ...freelaViagem.vaga, workDays: ["2026-09-01", "2026-09-02"], diasMeiaExtra: ["2026-09-02", "2026-09-02", "2026-09-04", "lixo", null] },
    });
    expect(r.diasMeiaExtra).toEqual(["2026-09-02"]);
    expect(r.subtotalMeiasDiarias).toBe(V / 2);
  });

  it("casa: dia útil marcado continua sem diária (½ de zero); fim de semana marcado ganha ½ da diária de casa", () => {
    const r = calcularPlanejadoDaVaga({
      vaga: { ...semana, needsTicket: false, dailyRates: 6, dailyValue: 0, diasMeiaExtra: ["2026-09-01", "2026-09-05"] },
      functionName: "Produção", collaboratorType: "casa", settings: {}, eventLocation: "São Paulo - SP",
    });
    expect(r.meiasDiarias).toEqual([{ dia: "2026-09-01", valorCents: 0 }, { dia: "2026-09-05", valorCents: CASA_DEFAULTS_CENTS.produtor / 2 }]);
    expect(r.subtotalDiarias).toBe(CASA_DEFAULTS_CENTS.produtor * 2 + CASA_DEFAULTS_CENTS.produtor / 2);
    expect(r.subtotalDiariasUtil).toBe(0);
  });

  it("o DP desmarca no Planejado: o ajuste (lista vazia) vence os dias da vaga", () => {
    const r = calcularPlanejadoDaVaga({
      ...freelaViagem,
      vaga: { ...freelaViagem.vaga, diasMeiaExtra: ["2026-09-02"] },
      override: { diasMeiaExtra: [] },
    });
    expect(r.diasMeiaExtra).toEqual([]);
    expect(r.subtotalMeiasDiarias).toBe(0);
  });

  it("percurso: ½ do pacote do dia, sem deflação", () => {
    const r = calcularPlanejadoDaVaga({
      vaga: { ...semana, needsTicket: true, dailyRates: 6, dailyValue: 0, percurseiroTipo: "tipo_1", diasMeiaExtra: ["2026-09-06"] },
      functionName: "Percurso", collaboratorType: "freela", settings: {}, eventLocation: "Recife - PE",
    });
    const pacote = PERCURSEIRO_DEFAULTS.t1Motoqueiro + Math.round(PERCURSEIRO_DEFAULTS.t1Motoqueiro * 0.15) + PERCURSEIRO_DEFAULTS.alimentacao + PERCURSEIRO_DEFAULTS.transporte + PERCURSEIRO_DEFAULTS.t1Nf;
    expect(r.subtotalMeiasDiarias).toBe(Math.round(pacote / 2));
    expect(r.subtotalDiarias).toBe(pacote * 6 + Math.round(pacote / 2));
  });

  it("honorário aprovado (valor fechado da vaga): o ½ não se soma e a tela é avisada", () => {
    const honorario: HonorarioNaVaga = {
      honorarioId: "h1", tipo: "vaga", nome: "Fulano", status: "aprovado", situacao: "aprovado", valorCents: 100_000,
      empreita: null, aprovadoPor: "Marcos", aprovadoEm: "2026-10-21T13:00:00.000Z", colaboradorTrocado: false,
    };
    const r = calcularPlanejadoDaVaga({
      vaga: { scheduleStartDate: "2026-09-01", scheduleEndDate: "2026-09-03", needsTicket: true, dailyRates: 3, dailyValue: 0, cenoFreelaTipo: "viagem", diasMeiaExtra: ["2026-09-02"] },
      functionName: "Cenotécnica", collaboratorType: "freela", settings: {}, eventLocation: "Recife - PE", honorario,
    });
    expect(r.meiaDiariaSemEfeito).toBe(true);
    expect(r.subtotalMeiasDiarias).toBe(0);
    expect(r.subtotalDiarias).toBe(100_000);
  });
});

describe("empreita da tabela sem mobilidade (28/10 — caso Lucas, NR São Luís)", () => {
  const ceno = {
    vaga: { scheduleStartDate: "2026-09-01", scheduleEndDate: "2026-09-03", needsTicket: true, dailyRates: 3, dailyValue: 0, cenoFreelaTipo: "viagem" },
    functionName: "Cenotécnica",
    collaboratorType: "freela",
    settings: {},
    eventLocation: "São Luís - MA",
  } as const;

  it("vaga com modalidade de empreita: ida, volta e total = 0, com a razão", () => {
    const r = calcularPlanejadoDaVaga(ceno);
    expect(r.empreitaSemMobilidade).toBe(true);
    expect([r.mobilidade, r.mobilidadeIda, r.mobilidadeVolta, r.sysMobilidade]).toEqual([0, 0, 0, 0]);
    expect(EMPREITA_SEM_MOBILIDADE_RAZAO).toMatch(/sem mobilidade/);
    expect(linhaDoPlanejado(r)).toMatchObject({ mobility: 0, mobilityIda: 0, mobilityVolta: 0 });
  });

  it("sem a modalidade (freela de diária comum) e a casa seguem com mobilidade", () => {
    const semTipo = calcularPlanejadoDaVaga({ ...ceno, vaga: { ...ceno.vaga, cenoFreelaTipo: null } });
    expect(semTipo.empreitaSemMobilidade).toBe(false);
    expect(semTipo.mobilidade).toBe(2 * MOBILIDADE_TRECHO_PADRAO_CENTS);
    const casa = calcularPlanejadoDaVaga({ ...ceno, collaboratorType: "casa" });
    expect(casa.empreitaSemMobilidade).toBe(false);
    expect(casa.mobilidade).toBe(2 * MOBILIDADE_TRECHO_PADRAO_CENTS);
  });

  it("o ajuste manual continua mandando (e fica coerente)", () => {
    const r = calcularPlanejadoDaVaga({ ...ceno, override: { mobilidade: 5_800 } });
    expect(r.mobilidade).toBe(5_800);
    expect(r.mobilidadeIda + r.mobilidadeVolta).toBe(5_800);
  });
});

describe("VR do colaborador da casa no almoço de dia útil (28/10)", () => {
  const casaSP = {
    vaga: { ...semana, needsTicket: false, dailyRates: 6, dailyValue: 0 },
    functionName: "Produção",
    collaboratorType: "casa",
    settings: {},
    eventLocation: "São Paulo - SP",
  } as const;

  it("VR R$ 40,50 cobre o almoço de R$ 40,00: almoço de dia útil = R$ 0,00 (fim de semana não muda)", () => {
    const r = calcularPlanejadoDaVaga({ ...casaSP, vrDiarioCents: 4_050 });
    expect(r.vrDiarioCents).toBe(4_050);
    expect(r.unitAlmocoSemana).toBe(0);
    expect(r.almocoSemana).toBe(0);
    expect(r.almocoFds).toBe(2 * 4_000);
    expect(r.jantarSemana).toBe(4 * 4_000);
  });

  it("VR menor que o almoço paga a diferença; sem VR vale o fixo de sempre (R$ 5,00)", () => {
    expect(calcularPlanejadoDaVaga({ ...casaSP, vrDiarioCents: 3_000 }).unitAlmocoSemana).toBe(1_000);
    const semVr = calcularPlanejadoDaVaga({ ...casaSP, vrDiarioCents: null });
    expect(semVr.unitAlmocoSemana).toBe(500);
    expect(semVr.vrDiarioCents).toBeNull();
  });

  it("gestão (Key Account) R$ 44 e cenotécnica R$ 35 descontam o VR do valor da própria regra", () => {
    expect(refeicaoCentsDia("gestao", {}, { tipoColaborador: "casa", isWeekend: false, vrDiarioCents: 4_050 }).almocoCents).toBe(350);
    expect(refeicaoCentsDia("ceno", {}, { tipoColaborador: "casa", isWeekend: false, vrDiarioCents: 3_000 }).almocoCents).toBe(500);
    expect(refeicaoCentsDia("demais", { alimentacao_almoco: 4_500 }, { tipoColaborador: "casa", isWeekend: false, vrDiarioCents: 4_050 }).almocoCents).toBe(450);
  });

  it("freela e fim de semana ignoram o VR", () => {
    expect(refeicaoCentsDia("demais", {}, { tipoColaborador: "freela", isWeekend: false, vrDiarioCents: 4_050 }).almocoCents).toBe(0);
    expect(refeicaoCentsDia("demais", {}, { tipoColaborador: "casa", isWeekend: true, vrDiarioCents: 4_050 }).almocoCents).toBe(4_000);
    const freela = calcularPlanejadoDaVaga({ ...freelaViagem, vrDiarioCents: 4_050 });
    expect(freela.vrDiarioCents).toBeNull();
  });
});

describe("mobilidade coerente (28/10 — caso Lucas)", () => {
  it("zerar o total zera ida e volta", () => {
    expect(mobilidadeCoerente({ total: 0 }, { total: 11_600, ida: 5_800, volta: 5_800 })).toEqual({ total: 0, ida: 0, volta: 0 });
    // mesmo com ida/volta "sobrando" no ajuste, o total manda
    expect(mobilidadeCoerente({ total: 0, ida: 5_800, volta: 5_800 }, { total: 0 })).toEqual({ total: 0, ida: 0, volta: 0 });
  });

  it("editar ida/volta recalcula o total; total novo é rateado na proporção de antes", () => {
    expect(mobilidadeCoerente({ ida: 2_900 }, { total: 11_600, ida: 5_800, volta: 5_800 })).toEqual({ total: 8_700, ida: 2_900, volta: 5_800 });
    expect(mobilidadeCoerente({ total: 8_700 }, { total: 8_700, ida: 5_800, volta: 2_900 })).toEqual({ total: 8_700, ida: 5_800, volta: 2_900 });
    expect(mobilidadeCoerente({ total: 5_800 }, { total: 8_700, ida: 5_800, volta: 2_900 })).toEqual({ total: 5_800, ida: 3_867, volta: 1_933 });
  });

  it("no motor: override só com o total zerado não deixa ida/volta para trás", () => {
    const r = calcularPlanejadoDaVaga({ ...freelaViagem, override: { mobilidade: 0 } });
    expect([r.mobilidade, r.mobilidadeIda, r.mobilidadeVolta]).toEqual([0, 0, 0]);
    expect(linhaDoPlanejado(r)).toMatchObject({ mobility: 0, mobilityIda: 0, mobilityVolta: 0 });
  });
});

describe("revisão 28/10 — o que a linha do Planejado grava", () => {
  const honorario: HonorarioNaVaga = {
    honorarioId: "h1", tipo: "vaga", nome: "Fulano", status: "aprovado", situacao: "aprovado", valorCents: 100_000,
    empreita: null, aprovadoPor: "Marcos", aprovadoEm: "2026-10-21T13:00:00.000Z", colaboradorTrocado: false,
  };

  it("R4: ½ sem efeito (honorário aprovado) não vai para a linha — o Realizado não pode tratá-lo como 1,5", () => {
    const r = calcularPlanejadoDaVaga({
      vaga: { scheduleStartDate: "2026-09-01", scheduleEndDate: "2026-09-03", needsTicket: true, dailyRates: 3, dailyValue: 0, cenoFreelaTipo: "viagem", diasMeiaExtra: ["2026-09-02"] },
      functionName: "Cenotécnica", collaboratorType: "freela", settings: {}, eventLocation: "Recife - PE", honorario,
    });
    expect(linhaDoPlanejado(r).diasMeiaExtra).toEqual([]);
  });

  it("R4: casa com ½ marcado em dia útil (½ de zero) grava só o dia que tem valor", () => {
    const r = calcularPlanejadoDaVaga({
      vaga: { ...semana, needsTicket: false, dailyRates: 6, dailyValue: 0, diasMeiaExtra: ["2026-09-01", "2026-09-05"] },
      functionName: "Produção", collaboratorType: "casa", settings: {}, eventLocation: "São Paulo - SP",
    });
    expect(linhaDoPlanejado(r).diasMeiaExtra).toEqual(["2026-09-05"]);
  });

  it("R8: casa sem dia de diária (só dias úteis) grava diária 0 — nada de diária nominal para a hora extra nem para o Realizado espalhar", () => {
    const r = calcularPlanejadoDaVaga({
      vaga: { scheduleStartDate: "2026-09-01", scheduleEndDate: "2026-09-03", needsTicket: false, dailyRates: 3, dailyValue: 0 },
      functionName: "Produção", collaboratorType: "casa", settings: {}, eventLocation: "São Paulo - SP",
    });
    const linha = linhaDoPlanejado(r);
    expect(linha.dailyQuantity).toBe(0);
    expect(linha.dailyValue).toBe(0);
  });
});
