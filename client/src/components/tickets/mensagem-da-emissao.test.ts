import { describe, expect, it } from "vitest";
import { mensagemDaEmissao, puladasPorTerrestre, TEXTO_VAZIA_REMOVIDA } from "./mensagem-da-emissao";
import { MOTIVO_JA_TERRESTRE, MOTIVO_VAI_DE_TERRESTRE } from "@shared/carimbo-sem-passagem";

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

  it("marcar uma vaga que vai de carro/van (#4724): diz que nenhuma passagem foi criada", () => {
    const m = mensagemDaEmissao({ ok: [], pulados: [{ id: "a", motivo: MOTIVO_VAI_DE_TERRESTRE, tipo: "terrestre" }] }, true);
    expect(m.title).toBe("Esta vaga vai de carro/van");
    expect(m.description).toContain("Nenhuma passagem foi criada");
  });

  it("lote misto: conta as marcadas e as puladas, com o motivo de cada grupo", () => {
    const m = mensagemDaEmissao({ ok: ["x"], pulados: [
      { id: "a", motivo: MOTIVO_VAI_DE_TERRESTRE, tipo: "terrestre" },
      { id: "b", motivo: MOTIVO_VAI_DE_TERRESTRE, tipo: "terrestre" },
      { id: "c", motivo: MOTIVO_JA_TERRESTRE, tipo: "ja_terrestre" },
    ] }, true);
    expect(m.title).toBe("1 passagem(ns) marcada(s) como emitida(s) · 3 vagas sem passagem criada");
    expect(m.description).toBe("Em 2 vagas: vai de carro/van — registre em 'Vai de carro/van'. Em 1 vaga: já registrada como carro/van.");
  });

  it("pulada por outro motivo (vaga excluída) não entra no aviso de carro/van", () => {
    expect(puladasPorTerrestre({ pulados: [{ id: "a", motivo: "vaga não encontrada" }] })).toEqual([]);
  });
});
