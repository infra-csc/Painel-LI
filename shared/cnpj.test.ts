import { describe, expect, it } from "vitest";
import { cnpjValido, completarCnpj, erroDoCnpj, mascararCnpj } from "./cnpj";

describe("cnpjValido", () => {
  it("aceita CNPJ com os dígitos verificadores certos, com ou sem máscara", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11222333000181")).toBe(true);
  });

  it("recusa dígito verificador errado, tamanho errado e dígitos todos iguais", () => {
    expect(cnpjValido("11.222.333/0001-82")).toBe(false);
    expect(cnpjValido("00.000.000/0001-00")).toBe(false);
    expect(cnpjValido("11.222.333/0001")).toBe(false);
    expect(cnpjValido("11.111.111/1111-11")).toBe(false);
    expect(cnpjValido("")).toBe(false);
    expect(cnpjValido(null)).toBe(false);
  });
});

describe("erroDoCnpj", () => {
  it("vazio não é erro (campo opcional); incompleto e inválido têm mensagens próprias", () => {
    expect(erroDoCnpj("")).toBeNull();
    expect(erroDoCnpj(null)).toBeNull();
    expect(erroDoCnpj("11.222.333/0001-81")).toBeNull();
    expect(erroDoCnpj("11.222")).toBe("CNPJ incompleto — são 14 dígitos.");
    expect(erroDoCnpj("11.222.333/0001-82")).toBe("CNPJ inválido — confira os dígitos verificadores.");
  });
});

describe("mascararCnpj e completarCnpj", () => {
  it("máscara progressiva XX.XXX.XXX/XXXX-XX", () => {
    expect(mascararCnpj("1122")).toBe("11.22");
    expect(mascararCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(mascararCnpj("11.222.333/0001-81999")).toBe("11.222.333/0001-81");
  });

  it("completar uma base de 12 dígitos dá um CNPJ válido", () => {
    expect(completarCnpj("112223330001")).toBe("11.222.333/0001-81");
    expect(cnpjValido(completarCnpj("123456010001"))).toBe(true);
  });
});
