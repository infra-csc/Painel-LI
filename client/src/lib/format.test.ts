import { describe, it, expect } from "vitest";
import { toTitleCase, initials, formatCpf, formatDocument, avatarClasses, AVATAR_COLORS } from "./format";

describe("toTitleCase", () => {
  it("capitaliza cada palavra", () => {
    expect(toTitleCase("MARIA SILVA")).toBe("Maria Silva");
    expect(toTitleCase("joão pedro")).toBe("João Pedro");
  });

  it("mantém preposições/artigos em minúsculo no meio do nome", () => {
    expect(toTitleCase("MARIA DA SILVA E SOUZA")).toBe("Maria da Silva e Souza");
    expect(toTitleCase("josé dos santos de oliveira")).toBe("José dos Santos de Oliveira");
    expect(toTitleCase("hotel do lago")).toBe("Hotel do Lago");
  });

  it("capitaliza a primeira palavra mesmo sendo preposição", () => {
    expect(toTitleCase("de olho no prazo")).toBe("De Olho no Prazo");
  });

  it("trata hífens, espaços extras e vazios", () => {
    expect(toTitleCase("ana-clara  lima")).toBe("Ana-Clara Lima");
    expect(toTitleCase("")).toBe("");
    expect(toTitleCase(null)).toBe("");
    expect(toTitleCase(undefined)).toBe("");
    expect(toTitleCase("—")).toBe("—");
  });
});

describe("initials", () => {
  it("usa primeira e última palavra", () => {
    expect(initials("Maria da Silva")).toBe("MS");
  });
  it("uma palavra → duas primeiras letras", () => {
    expect(initials("Ana")).toBe("AN");
  });
  it("vazio → vazio", () => {
    expect(initials("")).toBe("");
    expect(initials("   ")).toBe("");
    expect(initials(null)).toBe("");
  });
});

describe("formatCpf / formatDocument", () => {
  it("aplica máscara em 11 dígitos", () => {
    expect(formatCpf("12345678901")).toBe("123.456.789-01");
    expect(formatCpf("123.456.789-01")).toBe("123.456.789-01");
  });
  it("devolve como veio se não tiver 11 dígitos", () => {
    expect(formatCpf("123")).toBe("123");
    expect(formatCpf("")).toBe("");
    expect(formatCpf(null)).toBe("");
  });
  it("formatDocument só mascara CPF", () => {
    expect(formatDocument("12345678901", "cpf")).toBe("123.456.789-01");
    expect(formatDocument("12345678901", "CPF")).toBe("123.456.789-01");
    expect(formatDocument("AB123456", "rg")).toBe("AB123456");
    expect(formatDocument("", "cpf")).toBe("");
  });
});

describe("avatarClasses", () => {
  it("é determinístico e devolve um par da paleta", () => {
    const a = avatarClasses("Maria");
    expect(avatarClasses("Maria")).toBe(a);
    expect(AVATAR_COLORS).toContain(a);
    expect(a).toHaveLength(2);
  });
  it("não quebra com vazio", () => {
    expect(AVATAR_COLORS).toContain(avatarClasses(""));
    expect(AVATAR_COLORS).toContain(avatarClasses(null));
  });
});

// ─── Moeda e dias (23/09) ───────────────────────────────────────────────────
import { formatarMoeda, formatarMoedaReais, contarDiasUteisEFds, contarDiasUteisEFdsPorQuantidade } from "./format";

// O Intl usa espaço não separável entre "R$" e o número.
const semNbsp = (s: string) => s.replace(/ /g, " ");

describe("formatarMoeda", () => {
  it("formata centavos em pt-BR", () => {
    expect(semNbsp(formatarMoeda(123456))).toBe("R$ 1.234,56");
    expect(semNbsp(formatarMoeda(0))).toBe("R$ 0,00");
    expect(semNbsp(formatarMoeda(-500))).toBe("-R$ 5,00");
  });
  it("arredonda centavos fracionários e tolera valores inválidos", () => {
    expect(semNbsp(formatarMoeda(1050.6))).toBe("R$ 10,51");
    expect(semNbsp(formatarMoeda(NaN))).toBe("R$ 0,00");
    expect(semNbsp(formatarMoeda(null))).toBe("R$ 0,00");
  });
});

describe("formatarMoedaReais", () => {
  it("formata reais", () => {
    expect(semNbsp(formatarMoedaReais(1234.5))).toBe("R$ 1.234,50");
    expect(semNbsp(formatarMoedaReais(undefined))).toBe("R$ 0,00");
  });
});

describe("contarDiasUteisEFds", () => {
  it("conta o intervalo fechado (seg 2026-09-21 a dom 2026-09-27)", () => {
    expect(contarDiasUteisEFds("2026-09-21", "2026-09-27")).toEqual({ weekdays: 5, weekends: 2 });
  });
  it("um dia só", () => {
    expect(contarDiasUteisEFds("2026-09-26", "2026-09-26")).toEqual({ weekdays: 0, weekends: 1 });
  });
  it("intervalo invertido é corrigido; datas ausentes ou inválidas dão zero", () => {
    expect(contarDiasUteisEFds("2026-09-27", "2026-09-21")).toEqual({ weekdays: 5, weekends: 2 });
    expect(contarDiasUteisEFds(null, "2026-09-21")).toEqual({ weekdays: 0, weekends: 0 });
    expect(contarDiasUteisEFds("abc", "2026-09-21")).toEqual({ weekdays: 0, weekends: 0 });
  });
  it("aceita timestamp ISO (recorta a data)", () => {
    expect(contarDiasUteisEFds("2026-09-25T00:00:00.000Z", "2026-09-28T00:00:00.000Z")).toEqual({ weekdays: 2, weekends: 2 });
  });
});

describe("contarDiasUteisEFdsPorQuantidade", () => {
  it("conta N dias corridos a partir do início (sex 2026-09-25, 4 dias)", () => {
    expect(contarDiasUteisEFdsPorQuantidade("2026-09-25", 4)).toEqual({ weekdays: 2, weekends: 2 });
  });
  it("quantidade zero ou início ausente dão zero", () => {
    expect(contarDiasUteisEFdsPorQuantidade("2026-09-25", 0)).toEqual({ weekdays: 0, weekends: 0 });
    expect(contarDiasUteisEFdsPorQuantidade(null, 3)).toEqual({ weekdays: 0, weekends: 0 });
  });
});
