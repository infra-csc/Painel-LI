import { describe, it, expect } from "vitest";
import { calcAlimentacao, isCenotecnicaFunction, refeicaoCents, refeicaoCentsDia } from "./alimentacao";

const base = { almocoCents: 4000, jantarCents: 4000 };
const dias3 = ["2026-08-28", "2026-08-29", "2026-08-30"];

describe("calcAlimentacao — quem não voa (jornada externa, regra 17/08)", () => {
  it("almoço + jantar em TODOS os dias trabalhados, sem 'estimado'", () => {
    const r = calcAlimentacao({ workDays: dias3, voa: false, ...base });
    expect(r.dias).toHaveLength(3);
    expect(r.dias.every(d => d.almoco && d.jantar && d.papel === "externo")).toBe(true);
    expect(r.almocos).toBe(3);
    expect(r.jantares).toBe(3);
    expect(r.totalCents).toBe(3 * 8000);
    expect(r.estimado).toBe(false);
  });
  it("sem dias → zero (mesmo sem voar)", () => {
    expect(calcAlimentacao({ workDays: [], voa: false, ...base }).totalCents).toBe(0);
  });
});

describe("calcAlimentacao — exemplo confirmado (Agatha 28–30/08)", () => {
  it("chega 10h30, volta parte 18h → 80 + 80 + 40 = R$200", () => {
    const r = calcAlimentacao({ workDays: dias3, voa: true, chegadaIda: "10:30", partidaVolta: "18:00", ...base });
    expect(r.dias[0]).toMatchObject({ papel: "chegada", almoco: true, jantar: true });
    expect(r.dias[1]).toMatchObject({ papel: "meio", almoco: true, jantar: true });
    expect(r.dias[2]).toMatchObject({ papel: "retorno", almoco: true, jantar: false });
    expect(r.totalCents).toBe(20000);
    expect(r.estimado).toBe(false);
  });
});

describe("dia de chegada (cortes 11h / 19h)", () => {
  const calc = (chegadaIda: string) =>
    calcAlimentacao({ workDays: dias3, voa: true, chegadaIda, partidaVolta: "18:00", ...base }).dias[0];
  it("chega 11:00 em ponto → almoço e jantar", () => {
    expect(calc("11:00")).toMatchObject({ almoco: true, jantar: true });
  });
  it("chega 15:00 → só jantar", () => {
    expect(calc("15:00")).toMatchObject({ almoco: false, jantar: true });
  });
  it("chega 21:00 → nada", () => {
    expect(calc("21:00")).toMatchObject({ almoco: false, jantar: false });
  });
});

describe("dia de retorno (cortes 13h / 21h)", () => {
  const calc = (partidaVolta: string) =>
    calcAlimentacao({ workDays: dias3, voa: true, chegadaIda: "10:00", partidaVolta, ...base }).dias[2];
  it("volta 08:00 → nada", () => {
    expect(calc("08:00")).toMatchObject({ almoco: false, jantar: false });
  });
  it("volta 13:00 em ponto → almoço", () => {
    expect(calc("13:00")).toMatchObject({ almoco: true, jantar: false });
  });
  it("volta 22:00 → almoço e jantar", () => {
    expect(calc("22:00")).toMatchObject({ almoco: true, jantar: true });
  });
});

describe("dia de retorno — transporte terrestre (regra 17/08: van saindo ≥ 20h já janta)", () => {
  const calc = (partidaVolta: string, terrestre?: boolean) =>
    calcAlimentacao({ workDays: dias3, voa: true, chegadaIda: "10:00", partidaVolta, terrestre, ...base }).dias[2];
  it("van saindo 20:00 → almoço e jantar; voo saindo 20:00 → só almoço (corte 21h)", () => {
    expect(calc("van - 20h+", true)).toMatchObject({ almoco: true, jantar: true });
    expect(calc("20:00", true)).toMatchObject({ almoco: true, jantar: true });
    expect(calc("20:00", false)).toMatchObject({ almoco: true, jantar: false });
    expect(calc("20:00")).toMatchObject({ almoco: true, jantar: false });
  });
  it("van saindo 19:59 → sem jantar; voo saindo 21:00 → jantar", () => {
    expect(calc("19:59", true)).toMatchObject({ jantar: false });
    expect(calc("21:00", false)).toMatchObject({ jantar: true });
  });
  it("caso do usuário (Ulisses/Willians, 18–21/06, van 10h / van 20h+): domingo com jantar", () => {
    const r = calcAlimentacao({
      workDays: ["2026-06-18", "2026-06-19", "2026-06-20", "2026-06-21"], voa: true, terrestre: true,
      chegadaIda: "van - 10h", partidaVolta: "van - 20h+", ...base,
    });
    expect(r.dias[3]).toMatchObject({ papel: "retorno", almoco: true, jantar: true });
    expect(r.jantares).toBe(4);
  });
});

describe("viagem de 1 dia (as duas condições no mesmo dia)", () => {
  it("chega 10h e volta 22h → almoço e jantar", () => {
    const r = calcAlimentacao({ workDays: ["2026-08-28"], voa: true, chegadaIda: "10:00", partidaVolta: "22:00", ...base });
    expect(r.dias[0]).toMatchObject({ papel: "unico", almoco: true, jantar: true });
  });
  it("chega 10h e volta 15h → só almoço (jantar cai pela partida antes das 21h)", () => {
    const r = calcAlimentacao({ workDays: ["2026-08-28"], voa: true, chegadaIda: "10:00", partidaVolta: "15:00", ...base });
    expect(r.dias[0]).toMatchObject({ almoco: true, jantar: false });
  });
  it("chega 15h e volta 22h → só jantar (almoço cai pela chegada após 11h)", () => {
    const r = calcAlimentacao({ workDays: ["2026-08-28"], voa: true, chegadaIda: "15:00", partidaVolta: "22:00", ...base });
    expect(r.dias[0]).toMatchObject({ almoco: false, jantar: true });
  });
});

describe("sem horário da passagem → dia cheio + estimado", () => {
  it("sem chegada: dia de chegada assume cheio e marca estimado", () => {
    const r = calcAlimentacao({ workDays: dias3, voa: true, chegadaIda: null, partidaVolta: "18:00", ...base });
    expect(r.dias[0]).toMatchObject({ almoco: true, jantar: true });
    expect(r.estimado).toBe(true);
  });
  it("sem nenhum horário: tudo cheio, estimado", () => {
    const r = calcAlimentacao({ workDays: dias3, voa: true, ...base });
    expect(r.totalCents).toBe(3 * 8000);
    expect(r.estimado).toBe(true);
  });
});

describe("valores por refeição (Valores Padrão)", () => {
  it("Demais 40/40, Cenotécnica 35/35 por padrão", () => {
    expect(refeicaoCents(false, {})).toEqual({ almocoCents: 4000, jantarCents: 4000 });
    expect(refeicaoCents(true, {})).toEqual({ almocoCents: 3500, jantarCents: 3500 });
  });
  it("lê as chaves editáveis", () => {
    expect(refeicaoCents(false, { alimentacao_almoco: 4500, alimentacao_jantar: "5000" }))
      .toEqual({ almocoCents: 4500, jantarCents: 5000 });
  });
  it("isCenotecnicaFunction", () => {
    expect(isCenotecnicaFunction("cenotecnica")).toBe(true);
    expect(isCenotecnicaFunction("Cenotécnica")).toBe(true);
    // "Sup Ceno" (supervisor) é do grupo PRODUTOR — regra confirmada pelo usuário:
    // recebe diária normal e alimentação de "demais", não a de cenotécnica.
    expect(isCenotecnicaFunction("Sup Ceno")).toBe(false);
    expect(isCenotecnicaFunction("Supervisor de Cenotecnica")).toBe(false);
    expect(isCenotecnicaFunction("atendimento")).toBe(false);
  });
});

describe("refeicaoCentsDia — almoço de casa (CLT) em dia útil", () => {
  it("casa em dia útil: almoço R$ 5,00 (diferença do VR), jantar R$ 40,00", () => {
    expect(refeicaoCentsDia(false, {}, { tipoColaborador: "casa", isWeekend: false }))
      .toEqual({ almocoCents: 500, jantarCents: 4000 });
  });
  it("casa em fim de semana: almoço R$ 40,00 e jantar R$ 40,00", () => {
    expect(refeicaoCentsDia(false, {}, { tipoColaborador: "casa", isWeekend: true }))
      .toEqual({ almocoCents: 4000, jantarCents: 4000 });
  });
  it("freela e local em dia útil: inalterado (R$ 40 / R$ 40)", () => {
    expect(refeicaoCentsDia(false, {}, { tipoColaborador: "freela", isWeekend: false }))
      .toEqual({ almocoCents: 4000, jantarCents: 4000 });
    expect(refeicaoCentsDia(false, {}, { tipoColaborador: "local", isWeekend: false }))
      .toEqual({ almocoCents: 4000, jantarCents: 4000 });
  });
  it("tabela CASA do usuário (Dir. Prova / Produtor incl. SupCeno / Exec. Vendas O2 Prime): todos R$ 5,00 no almoço útil", () => {
    for (const fn of ["Dir. Prova", "Produção", "Ativação", "Kit", "Sup Ceno", "Executivo Vendas O2 Prime", "atendimento"]) {
      const ceno = isCenotecnicaFunction(fn);
      expect(ceno).toBe(false); // nenhuma dessas é cenotécnica (SupCeno é produtor)
      expect(refeicaoCentsDia(ceno, {}, { tipoColaborador: "casa", isWeekend: false }).almocoCents).toBe(500);
    }
  });
  it("chave alimentacao_almoco_casa_util dos Valores Padrão vence o default", () => {
    expect(refeicaoCentsDia(false, { alimentacao_almoco_casa_util: "1000" }, { tipoColaborador: "casa", isWeekend: false }).almocoCents).toBe(1000);
  });
  it("exemplo do usuário: casa, 2 úteis + 2 fds, almoço+jantar todos os dias → R$ 250,00 (2×(5+40) + 2×(40+40))", () => {
    const util = refeicaoCentsDia(false, {}, { tipoColaborador: "casa", isWeekend: false });
    const fds = refeicaoCentsDia(false, {}, { tipoColaborador: "casa", isWeekend: true });
    expect(2 * (util.almocoCents + util.jantarCents) + 2 * (fds.almocoCents + fds.jantarCents)).toBe(25000);
  });
});

describe("refeicaoCentsDia — cenotécnica de casa (regra 17/08)", () => {
  it("casa ceno dia útil: almoço R$ 3,00 / jantar R$ 35,00", () => {
    expect(refeicaoCentsDia(true, {}, { tipoColaborador: "casa", isWeekend: false }))
      .toEqual({ almocoCents: 300, jantarCents: 3500 });
  });
  it("casa ceno fim de semana: R$ 35 / R$ 35", () => {
    expect(refeicaoCentsDia(true, {}, { tipoColaborador: "casa", isWeekend: true }))
      .toEqual({ almocoCents: 3500, jantarCents: 3500 });
  });
  it("cenotécnica freela em dia útil: inalterada (R$ 35 / R$ 35)", () => {
    expect(refeicaoCentsDia(true, {}, { tipoColaborador: "freela", isWeekend: false }))
      .toEqual({ almocoCents: 3500, jantarCents: 3500 });
  });
  it("exemplo do usuário (Erick): 2 úteis + 2 fds, almoço+jantar → R$ 216,00", () => {
    const u = refeicaoCentsDia(true, {}, { tipoColaborador: "casa", isWeekend: false });
    const f = refeicaoCentsDia(true, {}, { tipoColaborador: "casa", isWeekend: true });
    expect(2 * (u.almocoCents + u.jantarCents) + 2 * (f.almocoCents + f.jantarCents)).toBe(21600);
  });
});
