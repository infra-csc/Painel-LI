import { describe, it, expect } from "vitest";
import type { Function as FunctionType, FunctionValue } from "@shared/schema";
import { CENO_EMPREITA_SETTING_KEYS } from "@shared/cenotecnica-empreita";
import { FIELD_LABELS, formSchema, settingsToFormValues, type FormValues } from "./settings-schema";
import {
  camposEditadosDepoisDoEnvio, corpoDasTarifas, historicoDasFuncoes, historicoDasTarifas,
  loteDasFuncoes, mapasSalvos, mesclarRecarga, type Carimbo,
} from "./settings-salvamento";

const CARIMBO: Carimbo = { timestamp: "2026-10-08T15:00:00.000Z", user: "Ana" };

const fn = (id: string, name = `Função ${id}`) => ({ id, name } as FunctionType);
const fv = (functionId: string, v: Partial<FunctionValue>) =>
  ({ id: `fv-${functionId}`, functionId, dailyValue: 0, dailyValueWeekend: 0, dailyValueFreela: 0, dailyValueFreelaWeekend: 0, ...v } as FunctionValue);

describe("FIELD_LABELS (rótulos do histórico)", () => {
  it("toda chave do formulário tem rótulo em texto — nenhuma aparece crua ou como valor", () => {
    for (const key of Object.keys(formSchema.shape)) {
      const rotulo = FIELD_LABELS[key];
      expect(rotulo, key).toBeTruthy();
      expect(rotulo, key).not.toBe(key);
      // Nada de "890.13": rótulo não pode ser número.
      expect(/^[\d.,\s]+$/.test(rotulo), `${key} = ${rotulo}`).toBe(false);
    }
    expect(FIELD_LABELS.atendimento_executivo_contas).toBe("Atendimento — Executivo de Contas");
    for (const k of CENO_EMPREITA_SETTING_KEYS) expect(FIELD_LABELS[k]).toMatch(/^Cenotécnicos Empreita — /);
  });
});

describe("historicoDasTarifas", () => {
  // O GET sempre traz os defaults do servidor, MENOS ida/volta da mobilidade
  // (só o total legado `default_mobility`).
  const settings: Record<string, number> = { default_mobility: 2500, default_daily_value: 5000, freela_diaria_local: 46500, deflacao_fator_5_8: 90 };

  it("o 'antes' é o valor efetivo da chave (o que a tela mostrava), não a diária legada", () => {
    const values: FormValues = { ...settingsToFormValues(settings), default_mobility_ida: "20.00" };
    const h = historicoDasTarifas(settings, values, CARIMBO);
    expect(h).toEqual([
      { ...CARIMBO, field: "Mobilidade Casa — Ida", oldValue: "R$ 12,50", newValue: "R$ 20,00" },
    ]);
  });

  it("chave ausente e não tocada não vira entrada (antes: 'R$ 50,00 → R$ 12,50')", () => {
    expect(historicoDasTarifas(settings, settingsToFormValues(settings), CARIMBO)).toEqual([]);
  });

  it("percentual: antes e depois com %, mesmo carimbo", () => {
    const values: FormValues = { ...settingsToFormValues(settings), deflacao_fator_5_8: "85" };
    expect(historicoDasTarifas(settings, values, CARIMBO)).toEqual([
      { ...CARIMBO, field: "Deflação — Do 5º ao 8º dia (%)", oldValue: "90%", newValue: "85%" },
    ]);
  });
});

describe("corpoDasTarifas", () => {
  it("converte pt-BR e manda o total legado da mobilidade", () => {
    const values: FormValues = { ...settingsToFormValues({}), default_mobility_ida: "10,50", default_mobility_volta: "1.000,00" };
    const body = corpoDasTarifas(values);
    expect(body.default_mobility_ida).toBe(10.5);
    expect(body.default_mobility).toBe(1010.5);
  });
});

describe("camposEditadosDepoisDoEnvio", () => {
  it("só os campos que mudaram depois do envio", () => {
    const enviados = settingsToFormValues({});
    const atuais = { ...enviados, alimentacao_almoco: "41.00" };
    expect(camposEditadosDepoisDoEnvio(enviados, atuais)).toEqual(["alimentacao_almoco"]);
    expect(camposEditadosDepoisDoEnvio(enviados, enviados)).toEqual([]);
  });
});

describe("diárias por função", () => {
  const funcoes = [fn("a", "COORDENADOR"), fn("b")];
  // a: freela 0 = "usa o casa"; b: sem linha ainda.
  const valores = [fv("a", { dailyValue: 10_000, dailyValueWeekend: 12_000 })];

  it("mapasSalvos mostra o freela zerado com o valor casa", () => {
    const m = mapasSalvos(funcoes, valores);
    expect(m.freelaWd.a).toBe("100.00");
    expect(m.freelaWe.a).toBe("120.00");
    expect(m.casaWd.b).toBe("0.00");
  });

  it("lote só com as células alteradas: mudar o casa NÃO grava o freela (fallback)", () => {
    const atuais = mapasSalvos(funcoes, valores);
    atuais.casaWd = { ...atuais.casaWd, a: "150,00" };
    atuais.freelaWe = { ...atuais.freelaWe, b: "300" };
    expect(loteDasFuncoes(funcoes, valores, atuais)).toEqual([
      { functionId: "a", dailyValue: 15_000 },
      { functionId: "b", dailyValueFreelaWeekend: 30_000 },
    ]);
  });

  it("nada alterado → lote vazio", () => {
    expect(loteDasFuncoes(funcoes, valores, mapasSalvos(funcoes, valores))).toEqual([]);
  });

  it("histórico das funções usa o carimbo recebido (um só por salvamento)", () => {
    const atuais = mapasSalvos(funcoes, valores);
    atuais.casaWd = { ...atuais.casaWd, a: "150.00" };
    expect(historicoDasFuncoes(funcoes, valores, atuais, CARIMBO)).toEqual([
      { ...CARIMBO, field: "Diária por função — Coordenador (Casa · Dia Útil)", oldValue: "R$ 100,00", newValue: "R$ 150,00" },
    ]);
  });

  it("recarga preserva a célula editada depois do envio e aceita o resto do servidor", () => {
    const enviados = mapasSalvos(funcoes, valores);
    enviados.casaWd = { ...enviados.casaWd, a: "150.00" };
    // Durante o envio a pessoa mexeu no fim de semana de "b".
    const atuais = { ...enviados, casaWe: { ...enviados.casaWe, b: "77.00" } };
    const frescos = mapasSalvos(funcoes, [fv("a", { dailyValue: 15_000, dailyValueWeekend: 12_000 })]);
    const m = mesclarRecarga(frescos, atuais, enviados);
    expect(m.casaWd.a).toBe("150.00");
    expect(m.casaWe.b).toBe("77.00");
    expect(m.freelaWd.a).toBe("150.00"); // freela 0 acompanha o casa novo
  });
});
