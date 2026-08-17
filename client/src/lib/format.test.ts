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
