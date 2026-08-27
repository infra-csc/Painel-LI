import { describe, it, expect } from "vitest";
import {
  isAtendimentoFunction, atendimentoDailyCents, ATENDIMENTO_DEFAULTS_CENTS,
  mobilidadeTrechoCents, mobilidadeTrechoComLocalCents, parseHoraMin,
  MOBILIDADE_TRECHO_PADRAO_CENTS, MOBILIDADE_TRECHO_MADRUGADA_CENTS,
  isEventoEmSP, mobilidadeSemVooCents, isTransporteTerrestre,
} from "./atendimento";

describe("mobilidade de quem NÃO voa (regra 17/08): só fora de SP, R$29/trecho", () => {
  it("evento em SP / Grande SP → sem mobilidade", () => {
    for (const loc of ["São Paulo - SP", "SP", "sao paulo", "Grande SP", "Osasco/SP", "Guarulhos - SP", "Barueri (SP)"]) {
      expect(isEventoEmSP(loc)).toBe(true);
      expect(mobilidadeSemVooCents(loc)).toEqual({ ida: 0, volta: 0 });
    }
  });
  it("evento fora de SP → R$29 ida + R$29 volta", () => {
    for (const loc of ["Rio de Janeiro", "Manaus", "Florianópolis", "Corrida DPSP Rio de Janeiro", "BELO HORIZONTE"]) {
      expect(isEventoEmSP(loc)).toBe(false);
      expect(mobilidadeSemVooCents(loc)).toEqual({ ida: 2900, volta: 2900 });
    }
  });
  it("local vazio não assume SP (evento sem local → paga R$29/trecho, conservador)", () => {
    expect(isEventoEmSP("")).toBe(false);
    expect(isEventoEmSP(null)).toBe(false);
  });
});

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

describe("mobilidadeTrechoCents — tabela 'deslocamento aeroporto por trecho' (só as 2 janelas de VOO)", () => {
  it("VOO partindo 23h30–9h30 = 58; chegando 20h–5h = 58; demais = 29 — em qualquer trecho", () => {
    expect(mobilidadeTrechoCents("23:30", null, { trecho: "volta" })).toBe(MOBILIDADE_TRECHO_MADRUGADA_CENTS);
    expect(mobilidadeTrechoCents("09:30", null, { trecho: "volta" })).toBe(MOBILIDADE_TRECHO_MADRUGADA_CENTS);
    expect(mobilidadeTrechoCents("18:00", "20:00", { trecho: "volta" })).toBe(MOBILIDADE_TRECHO_MADRUGADA_CENTS);
    expect(mobilidadeTrechoCents("10:00", "12:00", { trecho: "volta" })).toBe(MOBILIDADE_TRECHO_PADRAO_CENTS);
  });
  it("NÃO existe 'volta partindo ≥ 20h = 58' (interpretação errada de 17/08, revogada pela tabela)", () => {
    expect(mobilidadeTrechoCents("20:00", null, { trecho: "volta" })).toBe(MOBILIDADE_TRECHO_PADRAO_CENTS);
    expect(mobilidadeTrechoCents("22:00", null, { trecho: "volta" })).toBe(MOBILIDADE_TRECHO_PADRAO_CENTS);
    expect(mobilidadeTrechoCents("20:00", null, { trecho: "ida" })).toBe(MOBILIDADE_TRECHO_PADRAO_CENTS);
  });
  it("transporte TERRESTRE (van/ônibus/carro) = R$ 29 fixo, qualquer horário", () => {
    expect(mobilidadeTrechoCents("van - 10h", null)).toBe(2900);
    expect(mobilidadeTrechoCents("van - 20h+", null, { trecho: "volta" })).toBe(2900);
    expect(mobilidadeTrechoCents("onibus - 23h30", null)).toBe(2900);       // seria 58 se fosse voo
    expect(mobilidadeTrechoCents("ônibus - 5h", null)).toBe(2900);
    expect(mobilidadeTrechoCents("carro", null)).toBe(2900);
    expect(mobilidadeTrechoCents("00:30", null, { terrestre: true })).toBe(2900); // passagem rodoviária registrada
    expect(mobilidadeTrechoCents("00:30", null, { terrestre: false })).toBe(5800); // voo
    expect(isTransporteTerrestre("van - 10h")).toBe(true);
    expect(isTransporteTerrestre("09:30")).toBe(false);
  });
  it("caso do usuário (Ulisses/Willians): saída da van 10h e volta 20h+ → 29 + 29 = 58", () => {
    const ida = mobilidadeTrechoCents("van - 10h", null, { trecho: "ida" });
    const volta = mobilidadeTrechoCents("van - 20h+", null, { trecho: "volta" });
    expect(ida + volta).toBe(5800);
  });
});

describe("mobilidadeTrechoComLocalCents — o LOCAL decide primeiro (26/08)", () => {
  it("evento em SP: zero mesmo com passagem marcada (era o furo)", () => {
    for (const loc of ["São Paulo", "São Paulo - SP", "Osasco - SP", "Grande SP"]) {
      expect(mobilidadeTrechoComLocalCents(loc, { voa: true, partida: "23:45", trecho: "ida" })).toBe(0);
      expect(mobilidadeTrechoComLocalCents(loc, { voa: false, trecho: "volta" })).toBe(0);
    }
  });

  it("fora de SP com passagem: continua valendo a regra de horário", () => {
    expect(mobilidadeTrechoComLocalCents("Recife", { voa: true, partida: "14:00", trecho: "ida" }))
      .toBe(MOBILIDADE_TRECHO_PADRAO_CENTS);
    expect(mobilidadeTrechoComLocalCents("Recife", { voa: true, partida: "23:45", trecho: "ida" }))
      .toBe(MOBILIDADE_TRECHO_MADRUGADA_CENTS);
  });

  it("fora de SP sem passagem: R$ 29 por trecho", () => {
    expect(mobilidadeTrechoComLocalCents("Curitiba", { voa: false, trecho: "ida" }))
      .toBe(MOBILIDADE_TRECHO_PADRAO_CENTS);
  });

  it("terrestre fora de SP: R$ 29 fixo, sem a madrugada", () => {
    expect(mobilidadeTrechoComLocalCents("Palmas", { voa: true, partida: "23:45", trecho: "ida", terrestre: true }))
      .toBe(MOBILIDADE_TRECHO_PADRAO_CENTS);
  });
});
