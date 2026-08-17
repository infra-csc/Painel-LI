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

describe("parseHoraMin — formatos reais dos campos de texto livre da escalação", () => {
  it('"9h" e "22h" (formato mais comum)', () => {
    expect(parseHoraMin("9h")).toBe(9 * 60);
    expect(parseHoraMin("22h")).toBe(22 * 60);
  });
  it('"20h+" e faixas "10h-14h" / "14-18h" usam o primeiro horário', () => {
    expect(parseHoraMin("20h+")).toBe(20 * 60);
    expect(parseHoraMin("10h-14h")).toBe(10 * 60);
    expect(parseHoraMin("14-18h")).toBe(18 * 60); // sem "h" no 14, pega o 18h
  });
  it('"onibus - 10h" e "carro - 14h" extraem o horário do meio do texto', () => {
    expect(parseHoraMin("onibus - 10h")).toBe(10 * 60);
    expect(parseHoraMin("carro - 14h")).toBe(14 * 60);
  });
  it('"0900" militar', () => {
    expect(parseHoraMin("0900")).toBe(9 * 60);
    expect(parseHoraMin("1430")).toBe(14 * 60 + 30);
  });
  it('"carro" sem horário -> null (alimentação vira estimada)', () => {
    expect(parseHoraMin("carro")).toBeNull();
    expect(parseHoraMin("van")).toBeNull();
  });
  it('"9h30" com minutos', () => {
    expect(parseHoraMin("9h30")).toBe(9 * 60 + 30);
  });
});
