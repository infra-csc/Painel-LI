import { describe, expect, it } from "vitest";
import { mensagemDaEmissao, TEXTO_VAZIA_REMOVIDA } from "./mensagem-da-emissao";

describe("mensagemDaEmissao", () => {
  it("marcar: o texto de sempre", () => {
    expect(mensagemDaEmissao({ ok: ["a", "b"], pulados: [] }, true).title).toBe("2 passagem(ns) marcada(s) como emitida(s)");
  });

  it("desfazer numa passagem com dados: só o carimbo saiu", () => {
    const m = mensagemDaEmissao({ ok: ["a"], pulados: [], removidas: [], statusPorVaga: {} }, false);
    expect(m.title).toBe('1 passagem(ns) voltaram para "não emitida"');
  });

  it("desfazer numa passagem só com o carimbo: avisa que ela saiu e a vaga voltou para Comprar", () => {
    const m = mensagemDaEmissao({ ok: ["a"], pulados: [], removidas: ["a"], statusPorVaga: { a: "escalado" } }, false);
    expect(m.title).toBe(TEXTO_VAZIA_REMOVIDA);
    expect(TEXTO_VAZIA_REMOVIDA).toBe("A passagem vazia foi removida e a vaga voltou para Comprar");
  });

  it("linha vazia removida mas a vaga continua coberta: não promete a volta para Comprar", () => {
    const m = mensagemDaEmissao({ ok: ["a"], pulados: [], removidas: ["a"], statusPorVaga: {} }, false);
    expect(m.title).toBe("A passagem vazia foi removida");
    expect(m.description).toContain("não mudou");
  });

  it("lote misto: conta cada situação", () => {
    const m = mensagemDaEmissao({ ok: ["a", "b", "c"], pulados: [], removidas: ["a"], statusPorVaga: { a: "hospedagem_comprada" } }, false);
    expect(m.title).toBe('3 passagem(ns) voltaram para "não emitida"');
    expect(m.description).toBe("Em 1 vaga, a passagem vazia foi removida e a vaga voltou para Comprar. Em 2 vagas, só o carimbo saiu: os dados da passagem continuam.");
  });
});
