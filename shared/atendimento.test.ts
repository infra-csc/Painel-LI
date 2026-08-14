import { describe, it, expect } from "vitest";
import {
  isAtendimentoFunction, atendimentoDailyCents, ATENDIMENTO_DEFAULTS_CENTS,
  mobilidadeTrechoCents, parseHoraMin,
  MOBILIDADE_TRECHO_PADRAO_CENTS, MOBILIDADE_TRECHO_MADRUGADA_CENTS,
} from "./atendimento";

describe("isAtendimentoFunction", () => {
  it("reconhece atendimento (variações)", () => {
    expect(isAtendimentoFunction("atendimento")).toBe(true);
    expect(isAtendimentoFunction("Atendimento (Key Account)")).toBe(true);
    expect(isAtendimentoFunction("ATENDIMENTO")).toBe(true);
  });
  it("não confunde outras funções", () => {
    expect(isAtendimentoFunction("Dir. Prova")).toBe(false);
    expect(isAtendimentoFunction("Produtor")).toBe(false);
    expect(isAtendimentoFunction(null)).toBe(false);
  });
});

describe("atendimentoDailyCents", () => {
  it("usa o valor do Valores Padrão quando presente", () => {
    const ss = { atendimento_key_account: 60000, atendimento_executivo_contas: 47000 };
    expect(atendimentoDailyCents("key_account", ss)).toBe(60000);
    expect(atendimentoDailyCents("executivo_contas", ss)).toBe(47000);
  });
  it("cai no default quando não configurado", () => {
    expect(atendimentoDailyCents("key_account", {})).toBe(ATENDIMENTO_DEFAULTS_CENTS.key_account);
    expect(atendimentoDailyCents("executivo_contas", null)).toBe(ATENDIMENTO_DEFAULTS_CENTS.executivo_contas);
  });
  it("null para tipo ausente/ inválido", () => {
    expect(atendimentoDailyCents(null, {})).toBeNull();
    expect(atendimentoDailyCents("outro" as any, {})).toBeNull();
  });
  it("aceita settings como string", () => {
    expect(atendimentoDailyCents("key_account", { atendimento_key_account: "58000" })).toBe(58000);
  });
});

describe("mobilidade por horário de voo", () => {
  it("horário diurno -> R$29", () => {
    expect(mobilidadeTrechoCents("14:00")).toBe(MOBILIDADE_TRECHO_PADRAO_CENTS);
    expect(mobilidadeTrechoCents("10:00", "18:00")).toBe(MOBILIDADE_TRECHO_PADRAO_CENTS);
  });
  it("voo partindo na janela 23h30-9h30 -> R$58", () => {
    expect(mobilidadeTrechoCents("23:45")).toBe(MOBILIDADE_TRECHO_MADRUGADA_CENTS);
    expect(mobilidadeTrechoCents("05:00")).toBe(MOBILIDADE_TRECHO_MADRUGADA_CENTS);
    expect(mobilidadeTrechoCents("09:30")).toBe(MOBILIDADE_TRECHO_MADRUGADA_CENTS);
    expect(mobilidadeTrechoCents("09:31")).toBe(MOBILIDADE_TRECHO_PADRAO_CENTS);
  });
  it("voo chegando na janela 20h-5h -> R$58", () => {
    expect(mobilidadeTrechoCents("14:00", "22:00")).toBe(MOBILIDADE_TRECHO_MADRUGADA_CENTS);
    expect(mobilidadeTrechoCents("14:00", "04:59")).toBe(MOBILIDADE_TRECHO_MADRUGADA_CENTS);
    expect(mobilidadeTrechoCents("14:00", "19:59")).toBe(MOBILIDADE_TRECHO_PADRAO_CENTS);
  });
  it("horário vazio/ inválido -> padrão R$29", () => {
    expect(mobilidadeTrechoCents(null)).toBe(MOBILIDADE_TRECHO_PADRAO_CENTS);
    expect(mobilidadeTrechoCents("xx:yy")).toBe(MOBILIDADE_TRECHO_PADRAO_CENTS);
  });
  it("parseHoraMin", () => {
    expect(parseHoraMin("09:30")).toBe(570);
    expect(parseHoraMin("23:59")).toBe(1439);
    expect(parseHoraMin("24:00")).toBeNull();
    expect(parseHoraMin("")).toBeNull();
  });
});
