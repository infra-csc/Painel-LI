import { describe, it, expect } from "vitest";
import { calcDeflatedDailies, DEFLATION_TIERS, PERCURSEIRO_TYPES, diasComDiaria, diasEmpreita, regraDiariaPorTipo, percurseiroDiariaCents, diasPercurseiro, isPercursoFunction, isFuncaoLocal } from "./calculation-rules";
import { cenoEmpreitaTotalCents } from "./cenotecnica-empreita";

describe("calcDeflatedDailies (deflação por dia trabalhado)", () => {
  const DIARIA = 46500; // R$ 465,00 — produtor freela local

  it("até 4 dias paga 100% em todos os dias", () => {
    const r = calcDeflatedDailies(DIARIA, 4);
    expect(r.totalCents).toBe(DIARIA * 4);
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0]).toMatchObject({ days: 4, factor: 1.0, dailyCents: DIARIA });
  });

  it("do 5º ao 8º dia cada dia paga 90%", () => {
    const r = calcDeflatedDailies(DIARIA, 8);
    const d90 = Math.round(DIARIA * 0.9);
    expect(r.totalCents).toBe(DIARIA * 4 + d90 * 4);
    expect(r.segments).toHaveLength(2);
    expect(r.segments[1]).toMatchObject({ days: 4, factor: 0.9, dailyCents: d90 });
  });

  it("a partir do 9º dia cada dia paga 80%", () => {
    const r = calcDeflatedDailies(DIARIA, 10);
    const d90 = Math.round(DIARIA * 0.9);
    const d80 = Math.round(DIARIA * 0.8);
    expect(r.totalCents).toBe(DIARIA * 4 + d90 * 4 + d80 * 2);
    expect(r.segments).toHaveLength(3);
    expect(r.segments[2]).toMatchObject({ days: 2, factor: 0.8, dailyCents: d80 });
  });

  it("1 dia não sofre deflação", () => {
    expect(calcDeflatedDailies(75000, 1).totalCents).toBe(75000);
  });

  it("arredonda a diária por dia (sem acumular erro de centavos)", () => {
    // 333 * 0.9 = 299.7 → 300 por dia; nunca 299.7 * n
    const r = calcDeflatedDailies(333, 5);
    expect(r.segments[1].dailyCents).toBe(300);
    expect(r.totalCents).toBe(333 * 4 + 300);
  });

  it("os tiers cobrem todos os dias sem sobreposição", () => {
    // dia 4 → tier 1; dia 5 → tier 2; dia 8 → tier 2; dia 9 → tier 3
    expect(DEFLATION_TIERS[0].toDay).toBe(4);
    expect(DEFLATION_TIERS[1].fromDay).toBe(5);
    expect(DEFLATION_TIERS[1].toDay).toBe(8);
    expect(DEFLATION_TIERS[2].fromDay).toBe(9);
  });
});

describe("tabela do percurseiro", () => {
  it("o total é a soma das 5 parcelas (tabela do usuário 17/08)", () => {
    for (const t of PERCURSEIRO_TYPES) {
      const soma = t.motoqueiroCents + t.feeIvanCents + t.alimentacaoCents + t.transporteCents + t.nfCents;
      expect(t.totalCents).toBe(soma);
    }
    expect(PERCURSEIRO_TYPES[0].totalCents).toBe(112976);
    expect(PERCURSEIRO_TYPES[1].totalCents).toBe(126667);
  });

  it("percurseiroDiariaCents: Tipo 1 = 1.129,76 e Tipo 2 = 1.266,67 (defaults)", () => {
    const t1 = percurseiroDiariaCents("tipo_1", {});
    expect(t1).toMatchObject({ motoqueiro: 70000, fee: 10500, alimentacao: 10200, transporte: 5000, nf: 17276, total: 112976 });
    const t2 = percurseiroDiariaCents("tipo_2", {});
    expect(t2).toMatchObject({ motoqueiro: 80000, fee: 12000, alimentacao: 10200, transporte: 5000, nf: 19467, total: 126667 });
    expect(percurseiroDiariaCents(null, {})).toBeNull();
  });

  it("chaves dos Valores Padrão vencem os defaults (fee em % do motoqueiro)", () => {
    const r = percurseiroDiariaCents("tipo_1", { percurseiro_t1_motoqueiro: "80000", percurseiro_fee_pct: 10, percurseiro_t1_nf: 20000 })!;
    expect(r.motoqueiro).toBe(80000);
    expect(r.fee).toBe(8000);
    expect(r.nf).toBe(20000);
    expect(r.total).toBe(80000 + 8000 + 10200 + 5000 + 20000);
  });

  it("diárias: em viagem sempre 2, local 1; isPercursoFunction", () => {
    expect(diasPercurseiro(true)).toBe(2);
    expect(diasPercurseiro(false)).toBe(1);
    expect(diasPercurseiro(null)).toBe(1);
    expect(isPercursoFunction("Percurso")).toBe(true);
    expect(isPercursoFunction("percurseiro")).toBe(true);
    expect(isPercursoFunction("Produção")).toBe(false);
    // Exemplo do usuário: David Oliveira, percurso freela com passagem, tipo 1
    expect(diasPercurseiro(true) * percurseiroDiariaCents("tipo_1", {})!.total).toBe(225952);
  });
});

import { deflationFactorsFromSettings, DEFLATION_FACTORS_DEFAULT } from "./calculation-rules";

describe("calcDeflatedDailies com fatores editáveis", () => {
  it("usa os fatores padrão quando não informado", () => {
    const r = calcDeflatedDailies(10000, 10);
    // 4×100% + 4×90% + 2×80% = 40000 + 36000 + 16000
    expect(r.totalCents).toBe(40000 + 36000 + 16000);
  });
  it("respeita fatores customizados", () => {
    const r = calcDeflatedDailies(10000, 10, { ate4: 1.0, d5a8: 0.85, d9mais: 0.7 });
    expect(r.totalCents).toBe(4 * 10000 + 4 * 8500 + 2 * 7000);
  });
});

describe("deflationFactorsFromSettings", () => {
  it("converte percentuais inteiros em fatores", () => {
    const f = deflationFactorsFromSettings({ deflacao_fator_ate_4: 100, deflacao_fator_5_8: 90, deflacao_fator_9_mais: 80 });
    expect(f).toEqual({ ate4: 1.0, d5a8: 0.9, d9mais: 0.8 });
  });
  it("cai no default quando ausente", () => {
    expect(deflationFactorsFromSettings({})).toEqual(DEFLATION_FACTORS_DEFAULT);
    expect(deflationFactorsFromSettings(null)).toEqual(DEFLATION_FACTORS_DEFAULT);
  });
  it("aceita string", () => {
    expect(deflationFactorsFromSettings({ deflacao_fator_5_8: "85" }).d5a8).toBe(0.85);
  });
});

import { freelaDailyCents, isDirProvaFunction } from "./calculation-rules";

describe("freelaDailyCents (regra do slide)", () => {
  it("local R$465, viagem R$540, dir de prova R$820 (defaults)", () => {
    expect(freelaDailyCents("produção local", false, {})).toBe(46500);
    expect(freelaDailyCents("produção local", true, {})).toBe(54000);
    expect(freelaDailyCents("dir prova", false, {})).toBe(82000);
    expect(freelaDailyCents("Dir. de Prova", true, {})).toBe(82000);
  });
  it("lê os valores editáveis do Valores Padrão", () => {
    const ss = { freela_diaria_local: 47000, freela_diaria_viagem: "55000", freela_diaria_dir_prova: 90000 };
    expect(freelaDailyCents("kit", false, ss)).toBe(47000);
    expect(freelaDailyCents("kit", true, ss)).toBe(55000);
    expect(freelaDailyCents("dir prova", true, ss)).toBe(90000);
  });
  it("isDirProvaFunction não confunde outras funções", () => {
    expect(isDirProvaFunction("produção")).toBe(false);
    expect(isDirProvaFunction("dir prova")).toBe(true);
  });
});

import { casaDailyCents } from "./calculation-rules";

describe("casaDailyCents (regra do slide, nomes reais do sistema)", () => {
  it("produtor = produção/ativação/kit/sup ceno -> R$465", () => {
    for (const f of ["produção", "produção local", "produção sp 1", "ativação sp", "ativação local", "kit", "kit local", "sup ceno", "sup ceno local"]) {
      expect(casaDailyCents(f, {})).toBe(46500);
    }
  });
  it("dir prova -> R$750; clube o2/vendas -> R$260", () => {
    expect(casaDailyCents("dir prova", {})).toBe(75000);
    expect(casaDailyCents("clube o2", {})).toBe(26000);
  });
  it("fora da regra: atendimento (KA/EC), cenotécnica, percurso, montagem -> null", () => {
    for (const f of ["atendimento", "cenotecnica", "cenotecnica local", "cenotecnica sp", "cenotecnico - freela", "percurso", "percurso local", "Montagem - casa", "Mkt"]) {
      expect(casaDailyCents(f, {})).toBeNull();
    }
  });
  it("valores editáveis", () => {
    expect(casaDailyCents("produção", { casa_diaria_produtor: 50000 })).toBe(50000);
    expect(casaDailyCents("dir prova", { casa_diaria_dir_prova: "80000" })).toBe(80000);
  });
});

describe("diasComDiaria (dias com direito a diária por tipo de colaborador)", () => {
  it("casa (CLT) só recebe diária nos fins de semana", () => {
    expect(diasComDiaria("casa", 2, 2)).toBe(2);
    expect(diasComDiaria("casa", 5, 0)).toBe(0);
    expect(regraDiariaPorTipo("casa")).toBe("fds");
    // Caso do screenshot: 2 úteis + 2 fds a R$ 465 → R$ 930,00 (sem deflação)
    expect(calcDeflatedDailies(46500, diasComDiaria("casa", 2, 2)).totalCents).toBe(93000);
  });

  it("local (produção local) recebe diária em todos os dias", () => {
    expect(diasComDiaria("local", 2, 2)).toBe(4);
    expect(regraDiariaPorTipo("local")).toBe("todos");
    expect(calcDeflatedDailies(46500, diasComDiaria("local", 2, 2)).totalCents).toBe(186000);
  });

  it("casa + cenotécnica: nenhuma diária (nem fds) — Erick", () => {
    expect(regraDiariaPorTipo("casa", "Cenotecnica")).toBe("nenhuma");
    expect(diasComDiaria("casa", 2, 2, "Cenotécnica")).toBe(0);
    expect(calcDeflatedDailies(46500, diasComDiaria("casa", 2, 2, "Cenotecnica")).totalCents).toBe(0);
    // Cenotécnica freela/local: inalterada (todos os dias)
    expect(diasComDiaria("freela", 2, 2, "Cenotecnica")).toBe(4);
    expect(diasComDiaria("local", 2, 2, "Cenotecnica")).toBe(4);
    // Casa em outra função continua "fds"
    expect(regraDiariaPorTipo("casa", "Produção")).toBe("fds");
    // Nome como vem do banco de produção (minúsculo, sem acento) — caso real
    // reportado pelo usuário (Cleber Lucas, "cenotecnica" + Casa mostrava R$ 800)
    expect(regraDiariaPorTipo("casa", "cenotecnica")).toBe("nenhuma");
    expect(diasComDiaria("casa", 2, 2, "cenotecnica")).toBe(0);
    // "Sup Ceno" (supervisor) é do grupo PRODUTOR, não cenotécnico: casa → fds
    expect(regraDiariaPorTipo("casa", "Sup Ceno")).toBe("fds");
    expect(regraDiariaPorTipo("casa", "Supervisor de Cenotecnica")).toBe("fds");
    expect(diasComDiaria("casa", 2, 2, "Sup Ceno")).toBe(2);
  });

  it("freela (e tipo ausente) recebe diária em todos os dias", () => {
    expect(diasComDiaria("freela", 3, 1)).toBe(4);
    expect(diasComDiaria(undefined, 3, 1)).toBe(4);
    expect(regraDiariaPorTipo("freela")).toBe("todos");
  });
});

describe("isFuncaoLocal (função local = só diária)", () => {
  it("reconhece a palavra isolada 'local' no nome da função", () => {
    for (const f of [
      "produção local",
      "producao local",
      "Produção Local",
      "ativação local",
      "cenotecnica local",
      "Cenotécnica Local",
      "kit local",
      "sup ceno local",
      "percurso local",
      "local",
      "LOCAL",
      "produção - local",
      "produção (local)",
      "local produção",
    ]) {
      expect(isFuncaoLocal(f)).toBe(true);
    }
  });

  it("não confunde com palavras que apenas contêm 'local'", () => {
    for (const f of [
      "localidade",
      "localização",
      "vocal",
      "produção localizada",
      "produção",
      "cenotecnica",
      "percurso",
      "atendimento",
      "dir prova",
    ]) {
      expect(isFuncaoLocal(f)).toBe(false);
    }
  });

  it("nome vazio/ausente não é função local", () => {
    expect(isFuncaoLocal(null)).toBe(false);
    expect(isFuncaoLocal(undefined)).toBe(false);
    expect(isFuncaoLocal("")).toBe(false);
    expect(isFuncaoLocal("   ")).toBe(false);
  });

  it("a regra NÃO mexe na diária — só em alimentação e mobilidade", () => {
    // Caso do screenshot: OLGA, "produção local", casa, 16/08–16/08 (1 dia útil).
    // A diária continua pela regra existente; alimentação/mobilidade é que zeram.
    expect(isFuncaoLocal("produção local")).toBe(true);
    expect(diasComDiaria("local", 1, 0, "produção local")).toBe(1);
    expect(calcDeflatedDailies(46500, diasComDiaria("local", 1, 0, "produção local")).totalCents).toBe(46500);
    // Cenotécnica de casa continua sem diária mesmo sendo "local"
    expect(regraDiariaPorTipo("casa", "cenotecnica local")).toBe("nenhuma");
    expect(diasComDiaria("casa", 2, 2, "cenotecnica local")).toBe(0);
  });

  it("'percurso local' continua sendo percurso (pacote fechado)", () => {
    expect(isPercursoFunction("percurso local")).toBe(true);
    expect(isFuncaoLocal("percurso local")).toBe(true);
    // A contagem fixa do percurseiro (local = 1 diária) não muda
    expect(diasPercurseiro(false)).toBe(1);
    expect(diasPercurseiro(true)).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("diasEmpreita (contagem ÚNICA da empreita cenotécnica)", () => {
  it("dias específicos marcados mandam, mesmo não contíguos dentro do período", () => {
    // O bug: a Escalação contava 3 (workDays) e o Planejado 5 (intervalo).
    const incl = {
      workDays: ["2026-08-10", "2026-08-12", "2026-08-14"],
      scheduleStartDate: "2026-08-10",
      scheduleEndDate: "2026-08-14",
      dailyRates: 5,
    };
    expect(diasEmpreita(incl)).toBe(3);
  });

  it("sem workDays cai no intervalo completo (inclusive nas duas pontas)", () => {
    expect(diasEmpreita({ workDays: [], scheduleStartDate: "2026-08-10", scheduleEndDate: "2026-08-14" })).toBe(5);
    expect(diasEmpreita({ scheduleStartDate: "2026-08-10", scheduleEndDate: "2026-08-10" })).toBe(1);
  });

  it("intervalo que cruza mês/ano continua contando por dia de calendário", () => {
    expect(diasEmpreita({ scheduleStartDate: "2026-01-30", scheduleEndDate: "2026-02-02" })).toBe(4);
    expect(diasEmpreita({ scheduleStartDate: "2026-12-30", scheduleEndDate: "2027-01-02" })).toBe(4);
  });

  it("sem datas usa dailyRates; sem nada, zero", () => {
    expect(diasEmpreita({ dailyRates: 4 })).toBe(4);
    expect(diasEmpreita({})).toBe(0);
    expect(diasEmpreita(null)).toBe(0);
    expect(diasEmpreita({ workDays: [null, undefined], dailyRates: 0 })).toBe(0);
  });

  it("ignora entradas inválidas e datas repetidas em workDays", () => {
    expect(diasEmpreita({ workDays: ["2026-08-10", "2026-08-10", null, "", "xx"], dailyRates: 9 })).toBe(1);
    // Timestamp completo (o driver pode devolver ISO com hora) conta como o dia
    expect(diasEmpreita({ workDays: ["2026-08-10T00:00:00.000Z", "2026-08-11T00:00:00.000Z"] })).toBe(2);
  });

  it("fim antes do início não vira contagem negativa — cai em dailyRates", () => {
    expect(diasEmpreita({ scheduleStartDate: "2026-08-14", scheduleEndDate: "2026-08-10", dailyRates: 2 })).toBe(2);
  });

  it("Escalação e Planejado passam a fechar no MESMO valor de tabela", () => {
    const incl = {
      workDays: ["2026-08-10", "2026-08-12", "2026-08-14"],
      scheduleStartDate: "2026-08-10",
      scheduleEndDate: "2026-08-14",
      dailyRates: 5,
    };
    // Antes: a Escalação anunciava 3 dias (R$ 1.050,53) e o Planejado pagava
    // 5 dias (R$ 1.750,88) para a MESMA vaga de Freela SP.
    expect(cenoEmpreitaTotalCents("sp", diasEmpreita(incl))?.totalCents).toBe(105053);
    expect(cenoEmpreitaTotalCents("sp", diasComDiaria("freela", 3, 2))?.totalCents).toBe(175088);
  });
});
