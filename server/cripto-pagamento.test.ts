import { afterEach, describe, expect, it } from "vitest";
import { randomBytes } from "crypto";
import { ChaveDePagamentoAusente, chaveConfigurada, cifrar, decifrar, pareceCifrado } from "./cripto-pagamento";

const original = process.env.PAGAMENTO_CHAVE;
afterEach(() => {
  if (original === undefined) delete process.env.PAGAMENTO_CHAVE;
  else process.env.PAGAMENTO_CHAVE = original;
});

const chaveB64 = () => randomBytes(32).toString("base64");

describe("cripto-pagamento (AES-256-GCM)", () => {
  it("cifra e decifra; o texto puro não aparece no valor gravado; IV novo a cada vez", () => {
    process.env.PAGAMENTO_CHAVE = chaveB64();
    const g1 = cifrar("12345-6", "colab-1:conta")!;
    const g2 = cifrar("12345-6", "colab-1:conta")!;
    expect(pareceCifrado(g1)).toBe(true);
    expect(g1).not.toContain("12345");
    expect(g1).not.toBe(g2);
    expect(decifrar(g1, "colab-1:conta")).toEqual({ ok: true, valor: "12345-6" });
  });

  it("aceita a chave em hex (64) e recusa tamanho errado (fica 'sem chave', sem quebrar)", () => {
    process.env.PAGAMENTO_CHAVE = randomBytes(32).toString("hex");
    expect(chaveConfigurada()).toBe(true);
    process.env.PAGAMENTO_CHAVE = randomBytes(16).toString("base64");
    expect(chaveConfigurada()).toBe(false);
    delete process.env.PAGAMENTO_CHAVE;
    expect(chaveConfigurada()).toBe(false);
  });

  it("sem chave: cifrar lança erro próprio; decifrar diz 'sem_chave' (não lança)", () => {
    process.env.PAGAMENTO_CHAVE = chaveB64();
    const g = cifrar("341", "c:banco");
    delete process.env.PAGAMENTO_CHAVE;
    expect(() => cifrar("341", "c:banco")).toThrow(ChaveDePagamentoAusente);
    expect(decifrar(g, "c:banco")).toEqual({ ok: false, motivo: "sem_chave" });
    expect(decifrar(null, "c:banco")).toEqual({ ok: true, valor: null });
  });

  it("chave trocada: 'outra_chave'; contexto trocado (outro colaborador/campo): 'corrompido'", () => {
    process.env.PAGAMENTO_CHAVE = chaveB64();
    const g = cifrar("12345-6", "colab-1:conta");
    expect(decifrar(g, "colab-2:conta")).toEqual({ ok: false, motivo: "corrompido" });
    expect(decifrar(g, "colab-1:agencia")).toEqual({ ok: false, motivo: "corrompido" });
    process.env.PAGAMENTO_CHAVE = chaveB64();
    expect(decifrar(g, "colab-1:conta")).toEqual({ ok: false, motivo: "outra_chave" });
    expect(decifrar("lixo", "colab-1:conta")).toEqual({ ok: false, motivo: "corrompido" });
  });

  it("vazio continua vazio (null)", () => {
    process.env.PAGAMENTO_CHAVE = chaveB64();
    expect(cifrar("", "x")).toBeNull();
    expect(cifrar(null, "x")).toBeNull();
  });
});
