import { describe, it, expect } from "vitest";
import {
  CENO_EMPREITA_DEFAULTS,
  CENO_EMPREITA_SETTING_KEYS,
  CENO_FREELA_TIPOS,
  cenoEmpreitaDefaultsMap,
  cenoEmpreitaRow,
  cenoEmpreitaSettingKey,
  cenoEmpreitaTotalCents,
  isCenoFreelaTipo,
  usaEmpreitaCenotecnica,
} from "./cenotecnica-empreita";

const total = (tipo: any, dias: number, settings?: Record<string, number | string | undefined>) =>
  cenoEmpreitaTotalCents(tipo, dias, settings);

describe("tabela do slide (19/08) — valor FECHADO por nº de dias", () => {
  it("Freela Viagem: 2 dias = R$ 890,13 e 6 dias = R$ 2.360,13", () => {
    expect(total("viagem", 2)?.totalCents).toBe(89013);
    expect(total("viagem", 6)?.totalCents).toBe(236013);
  });
  it("Freela SP: 2 dias = R$ 700,35 e 6 dias = R$ 2.101,05", () => {
    expect(total("sp", 2)?.totalCents).toBe(70035);
    expect(total("sp", 6)?.totalCents).toBe(210105);
  });
  it("Freela Local (A): 2 dias = R$ 677,25", () => {
    expect(total("local_a", 2)?.totalCents).toBe(67725);
  });
  it("Freela Local (B): 6 dias = R$ 1.537,50", () => {
    expect(total("local_b", 6)?.totalCents).toBe(153750);
  });
  it("dias de 2 a 6 nunca são marcados como extrapolados e batem com a tabela", () => {
    for (const tipo of CENO_FREELA_TIPOS) {
      for (const d of [2, 3, 4, 5, 6] as const) {
        const r = total(tipo, d);
        expect(r?.totalCents).toBe(CENO_EMPREITA_DEFAULTS[tipo][d]);
        expect(r?.extrapolado).toBe(false);
      }
    }
  });
  it("não é diária × dias — 4 dias ≠ 2 × (2 dias)", () => {
    expect(total("viagem", 4)!.totalCents).not.toBe(2 * 89013);
  });
});

describe("extrapolação fora da faixa 2..6 dias", () => {
  it("Viagem 7 dias = 6 dias + incremento (367,50)", () => {
    const r = total("viagem", 7)!;
    expect(r.incrementoCents).toBe(36750);
    expect(r.totalCents).toBe(236013 + 36750);
    expect(r.extrapolado).toBe(true);
  });
  it("SP 7 dias = 6 dias + incremento arredondado (350,18)", () => {
    const r = total("sp", 7)!;
    expect(r.incrementoCents).toBe(35018); // (210105 − 70035) / 4 = 35017,5 → 35018
    expect(r.totalCents).toBe(210105 + 35018);
    expect(r.extrapolado).toBe(true);
  });
  it("1 dia = base de 2 dias − incremento", () => {
    const r = total("viagem", 1)!;
    expect(r.totalCents).toBe(89013 - 36750);
    expect(r.extrapolado).toBe(true);
    expect(total("local_b", 1)!.totalCents).toBe(53750 - 25000);
  });
  it("nunca negativo: incremento maior que a base de 2 dias → 0", () => {
    const settings = { ceno_empreita_viagem_2d: 1000, ceno_empreita_viagem_6d: 401000 };
    const r = total("viagem", 1, settings)!;
    expect(r.incrementoCents).toBe(100000);
    expect(r.totalCents).toBe(0);
    expect(r.extrapolado).toBe(true);
  });
  it("dias fracionados são arredondados para o dia mais próximo", () => {
    expect(total("local_a", 3.4)!.totalCents).toBe(99225);
    expect(total("local_a", 3.4)!.extrapolado).toBe(false);
  });
});

describe("entradas inválidas → null (nada a pagar)", () => {
  it("0 dias e dias negativos", () => {
    expect(total("viagem", 0)).toBeNull();
    expect(total("viagem", -3)).toBeNull();
  });
  it("dias não numéricos", () => {
    expect(total("viagem", NaN)).toBeNull();
    expect(total("viagem", Infinity)).toBeNull();
  });
  it("tipo inválido, null ou ausente", () => {
    expect(total("freela_local", 3)).toBeNull();
    expect(total(null, 3)).toBeNull();
    expect(total(undefined, 3)).toBeNull();
    expect(total("VIAGEM", 3)).toBeNull();
  });
});

describe("Valores Padrão vencem a tabela default", () => {
  it("chave editada substitui a célula (número ou string)", () => {
    expect(total("sp", 3, { ceno_empreita_sp_3d: 99999 })!.totalCents).toBe(99999);
    expect(total("sp", 3, { ceno_empreita_sp_3d: "88888" })!.totalCents).toBe(88888);
  });
  it("valor inválido ou negativo cai no default", () => {
    expect(total("sp", 3, { ceno_empreita_sp_3d: "abc" })!.totalCents).toBe(105053);
    expect(total("sp", 3, { ceno_empreita_sp_3d: -100 })!.totalCents).toBe(105053);
    expect(total("sp", 3, {})!.totalCents).toBe(105053);
  });
  it("chave de outra modalidade não contamina", () => {
    expect(total("viagem", 3, { ceno_empreita_sp_3d: 1 })!.totalCents).toBe(125763);
  });
  it("cenoEmpreitaRow aplica as chaves editadas na linha inteira", () => {
    const row = cenoEmpreitaRow("local_b", { ceno_empreita_local_b_2d: 60000 });
    expect(row[2]).toBe(60000);
    expect(row[6]).toBe(153750);
  });
});

describe("chaves do Valores Padrão", () => {
  it("formato ceno_empreita_<tipo>_<dias>d", () => {
    expect(cenoEmpreitaSettingKey("viagem", 3)).toBe("ceno_empreita_viagem_3d");
    expect(cenoEmpreitaSettingKey("local_a", 6)).toBe("ceno_empreita_local_a_6d");
  });
  it("20 chaves (4 modalidades × 5 dias), sem repetição, com defaults em centavos", () => {
    expect(CENO_EMPREITA_SETTING_KEYS).toHaveLength(20);
    expect(new Set(CENO_EMPREITA_SETTING_KEYS).size).toBe(20);
    const map = cenoEmpreitaDefaultsMap();
    expect(Object.keys(map)).toHaveLength(20);
    expect(map["ceno_empreita_viagem_2d"]).toBe(89013);
    expect(map["ceno_empreita_local_b_6d"]).toBe(153750);
    for (const k of CENO_EMPREITA_SETTING_KEYS) expect(map[k]).toBeGreaterThan(0);
  });
});

describe("isCenoFreelaTipo", () => {
  it("aceita só as 4 modalidades", () => {
    for (const t of CENO_FREELA_TIPOS) expect(isCenoFreelaTipo(t)).toBe(true);
    expect(isCenoFreelaTipo("tipo_1")).toBe(false);
    expect(isCenoFreelaTipo("")).toBe(false);
    expect(isCenoFreelaTipo(null)).toBe(false);
    expect(isCenoFreelaTipo(undefined)).toBe(false);
    expect(isCenoFreelaTipo(2)).toBe(false);
  });
});

describe("usaEmpreitaCenotecnica — casa (CLT) não entra na empreita", () => {
  it("cenotécnico de casa → false", () => {
    expect(usaEmpreitaCenotecnica(true, "casa")).toBe(false);
  });
  it("cenotécnico freela (ou sem tipo) → true", () => {
    expect(usaEmpreitaCenotecnica(true, "freela")).toBe(true);
    expect(usaEmpreitaCenotecnica(true, null)).toBe(true);
    expect(usaEmpreitaCenotecnica(true, undefined)).toBe(true);
  });
  it("função que não é cenotécnica → false", () => {
    expect(usaEmpreitaCenotecnica(false, "freela")).toBe(false);
    expect(usaEmpreitaCenotecnica(false, "casa")).toBe(false);
  });
});
