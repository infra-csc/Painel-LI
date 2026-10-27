import { describe, expect, it } from "vitest";
import {
  PAGAMENTO_VAZIO, agenciaValida, avisosDoPagamento, camposAlterados, codigoDoBanco, completarCpf, contaValida, cpfValido,
  erroDaChavePix, mascararChavePix, mascararConta, mudouAConta, normalizarChavePix, normalizarPagamento, pagamentoMascarado,
  rotuloDoBanco, titularBateComRazaoSocial, validarPagamento, type DadosDePagamento,
} from "./pagamento";

const CPF = completarCpf("529982247"); // 52998224725 (CPF de exemplo, fictício)

describe("CPF", () => {
  it("valida os dígitos verificadores", () => {
    expect(CPF).toBe("52998224725");
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("529.982.247-24")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cpfValido("123")).toBe(false);
  });
});

describe("banco por código", () => {
  it("3 dígitos, com zeros à esquerda; nome dos conhecidos", () => {
    expect(codigoDoBanco("341")).toBe("341");
    expect(codigoDoBanco("1")).toBe("001");
    expect(codigoDoBanco("1234")).toBeNull();
    expect(codigoDoBanco("abc")).toBeNull();
    expect(rotuloDoBanco("260")).toBe("260 · Nubank");
    expect(rotuloDoBanco("999")).toBe("999");
  });
  it("banco fora da lista conhecida é aceito com aviso, nunca recusado", () => {
    const d: DadosDePagamento = { ...PAGAMENTO_VAZIO, banco: "999", agencia: "1", conta: "1-1", tipoConta: "corrente" };
    expect(validarPagamento(d)).toEqual({});
    expect(avisosDoPagamento(d)[0]).toContain("999");
  });
});

describe("agência e conta", () => {
  it("formatos aceitos e recusados", () => {
    expect(agenciaValida("1234")).toBe(true);
    expect(agenciaValida("1234-5")).toBe(true);
    expect(agenciaValida("123456")).toBe(false);
    expect(contaValida("12345-6")).toBe(true);
    expect(contaValida("123456X")).toBe(true);
    expect(contaValida("12a45")).toBe(false);
  });
});

describe("chave PIX conforme o tipo", () => {
  it("CPF e CNPJ pelos dígitos verificadores", () => {
    expect(erroDaChavePix("cpf", "529.982.247-25")).toBeNull();
    expect(erroDaChavePix("cpf", "529.982.247-24")).toMatch(/CPF inválido/);
    expect(erroDaChavePix("cnpj", "11.222.333/0001-81")).toBeNull();
    expect(erroDaChavePix("cnpj", "11.222.333/0001-82")).toMatch(/CNPJ inválido/);
  });
  it("e-mail, telefone e aleatória", () => {
    expect(erroDaChavePix("email", "pessoa@exemplo.com.br")).toBeNull();
    expect(erroDaChavePix("email", "pessoa@")).toMatch(/E-mail/);
    expect(erroDaChavePix("telefone", "(11) 98765-4321")).toBeNull();
    expect(erroDaChavePix("telefone", "+55 11 98765-4321")).toBeNull();
    expect(erroDaChavePix("telefone", "98765")).toMatch(/Telefone/);
    expect(erroDaChavePix("aleatoria", "123e4567-e89b-42d3-a456-426614174000")).toBeNull();
    expect(erroDaChavePix("aleatoria", "123e4567")).toMatch(/aleatória/);
    expect(erroDaChavePix("cpf", "")).toBe("Informe a chave PIX.");
  });
  it("normaliza para a forma gravada", () => {
    expect(normalizarChavePix("cpf", "529.982.247-25")).toBe("52998224725");
    expect(normalizarChavePix("telefone", "(11) 98765-4321")).toBe("+5511987654321");
    expect(normalizarChavePix("telefone", "+55 (11) 98765-4321")).toBe("+5511987654321");
    expect(normalizarChavePix("email", " Pessoa@Exemplo.com ")).toBe("pessoa@exemplo.com");
  });
});

describe("validarPagamento", () => {
  it("conta é tudo ou nada; PIX pede tipo e chave", () => {
    expect(validarPagamento({ ...PAGAMENTO_VAZIO, banco: "341" })).toMatchObject({ agencia: expect.any(String), conta: expect.any(String), tipoConta: expect.any(String) });
    expect(validarPagamento({ ...PAGAMENTO_VAZIO, pixChave: "x@y.com" })).toMatchObject({ pixTipo: expect.any(String) });
    expect(validarPagamento({ ...PAGAMENTO_VAZIO, pixTipo: "email", pixChave: "x@y.com", email: "contato@exemplo.com" })).toEqual({});
    expect(validarPagamento(PAGAMENTO_VAZIO)).toEqual({});
    expect(validarPagamento({ ...PAGAMENTO_VAZIO, email: "sem-arroba" })).toMatchObject({ email: "E-mail inválido." });
  });
  it("normaliza o que vai para o banco", () => {
    const n = normalizarPagamento({ ...PAGAMENTO_VAZIO, banco: "1", agencia: " 1234-x ", conta: "123-4", tipoConta: "poupanca", pixTipo: "cpf", pixChave: "529.982.247-25", titular: "  Ana   Lima ", email: "A@B.COM" });
    expect(n).toEqual({ banco: "001", agencia: "1234-X", conta: "123-4", tipoConta: "poupanca", pixTipo: "cpf", pixChave: "52998224725", titular: "Ana Lima", email: "a@b.com" });
  });
});

describe("máscaras (auditoria e aviso do sino)", () => {
  it("nunca mostra o dado inteiro", () => {
    expect(mascararConta("12345-6")).toBe("••••5-6");
    expect(mascararChavePix("cpf", "52998224725")).toBe("•••.982.247-••");
    expect(mascararChavePix("email", "pessoa@exemplo.com.br")).toBe("p•••@e•••.com.br");
    expect(mascararChavePix("telefone", "+5511987654321")).toBe("(••) •••••-4321");
    expect(mascararChavePix("aleatoria", "123e4567-e89b-42d3-a456-426614174000")).toBe("123e…4000");
    const m = pagamentoMascarado({ banco: "341", conta: "998877-1", pixTipo: "cpf", pixChave: "52998224725" });
    expect(JSON.stringify(m)).not.toContain("998877");
    expect(JSON.stringify(m)).not.toContain("52998224725");
    expect(m.banco).toBe("341 · Itaú Unibanco");
  });
});

describe("mudança de conta", () => {
  it("só conta/PIX/titular viram aviso; e-mail não", () => {
    const a = { ...PAGAMENTO_VAZIO, email: "a@b.com" };
    expect(mudouAConta(camposAlterados(a, { ...a, email: "c@d.com" }))).toBe(false);
    expect(mudouAConta(camposAlterados(a, { ...a, conta: "1-1" }))).toBe(true);
    expect(mudouAConta(camposAlterados(a, { ...a, pixChave: "x" }))).toBe(true);
  });
});

describe("titular × razão social", () => {
  it("bate ignorando LTDA/ME/EIRELI, acento e o CPF que o MEI leva no começo", () => {
    expect(titularBateComRazaoSocial("João da Silva", "12.345.678 JOAO DA SILVA")).toBe(true);
    expect(titularBateComRazaoSocial("Montagens Exemplo", "MONTAGENS EXEMPLO LTDA - ME")).toBe(true);
    expect(titularBateComRazaoSocial("Maria Souza", "Montagens Exemplo Ltda")).toBe(false);
    expect(titularBateComRazaoSocial("", "Qualquer")).toBe(true);
  });
});
