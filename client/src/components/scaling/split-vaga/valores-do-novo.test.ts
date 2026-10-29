import { describe, it, expect } from "vitest";
import { preencherValoresDoNovo, type EntradaDoNovo } from "./valores-do-novo";

// 2026-04-10 = sexta (útil), 11 = sábado, 12 = domingo.
const SEXTA = "2026-04-10";
const SABADO = "2026-04-11";
const DOMINGO = "2026-04-12";

function entrada(parcial: Partial<EntradaDoNovo> = {}): EntradaDoNovo {
  return {
    dias: [SEXTA],
    tipoColaborador: "casa",
    vrDiarioCents: null,
    functionName: "Produtor",
    atendimentoTipo: null,
    empreita: false,
    settings: null,
    mobilidadeTitular: 0,
    diasTitular: 3,
    diariaTitular: 15000,
    ...parcial,
  };
}

describe("preencherValoresDoNovo — alimentação pela regra do NOVO colaborador", () => {
  it("titular freela (sem alimentação) + novo casa em dia útil: almoço reduzido R$ 5 + jantar R$ 40", () => {
    const r = preencherValoresDoNovo(entrada());
    expect(r.weekdayLunch).toBe(500);
    expect(r.weekdayDinner).toBe(4000);
    expect(r.weekendLunch + r.weekendDinner).toBe(0);
    expect(r.origemAlimentacao).toContain("Pela regra do colaborador (casa)");
    expect(r.origemAlimentacao).toContain("dia útil R$");
  });

  it("novo freela: alimentação zero, com o motivo", () => {
    const r = preencherValoresDoNovo(entrada({ tipoColaborador: "freela", dias: [SEXTA, SABADO] }));
    expect(r.weekdayLunch + r.weekdayDinner + r.weekendLunch + r.weekendDinner).toBe(0);
    expect(r.origemAlimentacao).toMatch(/Freela não recebe alimentação/);
  });

  it("casa com VR cadastrado: almoço do dia útil = regra da função − VR (nunca negativo)", () => {
    const comVr = preencherValoresDoNovo(entrada({ vrDiarioCents: 3000 }));
    expect(comVr.weekdayLunch).toBe(1000); // 40 − 30
    expect(comVr.weekdayDinner).toBe(4000);
    expect(comVr.origemAlimentacao).toContain("VR");
    const vrAlto = preencherValoresDoNovo(entrada({ vrDiarioCents: 4050 }));
    expect(vrAlto.weekdayLunch).toBe(0);
  });

  it("VR só vale para casa: local ignora o VR e recebe o valor cheio", () => {
    const r = preencherValoresDoNovo(entrada({ tipoColaborador: "local", vrDiarioCents: 3000 }));
    expect(r.weekdayLunch).toBe(4000);
    expect(r.weekdayDinner).toBe(4000);
    expect(r.origemAlimentacao).not.toContain("VR");
  });

  it("fim de semana: casa recebe o valor cheio (dias inteiros: almoço + jantar)", () => {
    const r = preencherValoresDoNovo(entrada({ dias: [SABADO, DOMINGO] }));
    expect(r.weekendLunch).toBe(8000);
    expect(r.weekendDinner).toBe(8000);
    expect(r.weekdayLunch + r.weekdayDinner).toBe(0);
    expect(r.origemAlimentacao).toContain("fim de semana");
    expect(r.origemAlimentacao).not.toContain("dia útil");
  });

  it("usa o perfil da função e o Valores Padrão (cenotécnica / Key Account)", () => {
    const ceno = preencherValoresDoNovo(entrada({ functionName: "Cenotécnica", dias: [SABADO] }));
    expect(ceno.weekendLunch).toBe(3500);
    const ka = preencherValoresDoNovo(entrada({
      functionName: "Atendimento", atendimentoTipo: "key_account", dias: [SABADO],
      settings: { alimentacao_almoco_gestao: 5000, alimentacao_jantar_gestao: 5100 },
    }));
    expect(ka.weekendLunch).toBe(5000);
    expect(ka.weekendDinner).toBe(5100);
    const casaUtil = preencherValoresDoNovo(entrada({ settings: { alimentacao_almoco_casa_util: 700 } }));
    expect(casaUtil.weekdayLunch).toBe(700);
  });

  it("sem alimentação nos casos que o Planejado zera: percurso, função local, empreita", () => {
    for (const e of [
      entrada({ functionName: "Percurso" }),
      entrada({ functionName: "Staff Local" }),
      entrada({ empreita: true }),
    ]) {
      const r = preencherValoresDoNovo(e);
      expect(r.weekdayLunch + r.weekdayDinner).toBe(0);
      expect(r.origemAlimentacao).not.toBe("");
    }
  });
});

describe("preencherValoresDoNovo — mobilidade", () => {
  it("proporção do titular quando ele tem", () => {
    const r = preencherValoresDoNovo(entrada({ mobilidadeTitular: 9000, diasTitular: 3, dias: [SEXTA, SABADO] }));
    expect(r.mobility).toBe(6000);
    expect(r.origemMobilidade).toContain("2 de 3 dias");
  });

  it("titular sem mobilidade: 0 e o convite para digitar", () => {
    const r = preencherValoresDoNovo(entrada({ mobilidadeTitular: 0 }));
    expect(r.mobility).toBe(0);
    expect(r.origemMobilidade).toMatch(/não tem mobilidade/);
  });
});

describe("preencherValoresDoNovo — diária pelo tipo do NOVO colaborador (decisão 29/10)", () => {
  const SEX_SAB = [SEXTA, SABADO];

  it("casa (CLT): sem diária em dia útil; fim de semana com a diária do titular", () => {
    const r = preencherValoresDoNovo(entrada({ tipoColaborador: "casa", dias: SEX_SAB }));
    expect(r.valorDiariaUtil).toBe(0);
    expect(r.valorDiariaFds).toBe(15000);
    expect(r.origemDiarias).toMatch(/^Casa \(CLT\): sem diária em dia útil; fim de semana R\$\s*150,00 por dia/);
  });

  it("casa só em dia útil: o texto não fala de fim de semana", () => {
    const r = preencherValoresDoNovo(entrada({ tipoColaborador: "casa", dias: [SEXTA] }));
    expect(r.valorDiariaUtil).toBe(0);
    expect(r.origemDiarias).toBe("Casa (CLT): sem diária em dia útil.");
  });

  it("cenotécnica de casa: sem diária nenhuma", () => {
    const r = preencherValoresDoNovo(entrada({ tipoColaborador: "casa", functionName: "Cenotécnica", dias: SEX_SAB }));
    expect(r.valorDiariaUtil).toBe(0);
    expect(r.valorDiariaFds).toBe(0);
    expect(r.origemDiarias).toMatch(/cenotécnica: sem diária/);
  });

  it("freela e local: a diária do titular em todos os dias", () => {
    for (const tipo of ["freela", "local"]) {
      const r = preencherValoresDoNovo(entrada({ tipoColaborador: tipo, dias: SEX_SAB }));
      expect(r.valorDiariaUtil).toBe(15000);
      expect(r.valorDiariaFds).toBe(15000);
      expect(r.origemDiarias).toMatch(/diária do titular/);
    }
    const ceno = preencherValoresDoNovo(entrada({ tipoColaborador: "freela", functionName: "Cenotécnica", dias: SEX_SAB }));
    expect(ceno.valorDiariaUtil).toBe(15000);
  });

  it("percurso: diária em todos os dias mesmo para casa (igual ao Planejado)", () => {
    const r = preencherValoresDoNovo(entrada({ tipoColaborador: "casa", functionName: "Percurso", dias: SEX_SAB }));
    expect(r.valorDiariaUtil).toBe(15000);
    expect(r.valorDiariaFds).toBe(15000);
  });
});
