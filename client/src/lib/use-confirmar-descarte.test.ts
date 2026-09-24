// Regra pura do "Descartar alterações?" (23/09).
import { describe, it, expect } from "vitest";
import { decidirFechamento, TEXTOS_DO_DESCARTE } from "./confirmar-descarte";

describe("decidirFechamento", () => {
  it("fecha direto quando não há alteração", () => {
    expect(decidirFechamento(false)).toBe("fechar");
  });
  it("pergunta quando há alteração", () => {
    expect(decidirFechamento(true)).toBe("perguntar");
  });
  it("ignora o pedido enquanto salva, sujo ou não", () => {
    expect(decidirFechamento(true, true)).toBe("ignorar");
    expect(decidirFechamento(false, true)).toBe("ignorar");
  });
});

describe("textos", () => {
  it("são os combinados no code review, em pt-BR", () => {
    expect(TEXTOS_DO_DESCARTE.titulo).toBe("Descartar alterações?");
    expect(TEXTOS_DO_DESCARTE.descricao).toBe("Você tem alterações não salvas.");
    expect(TEXTOS_DO_DESCARTE.continuar).toBe("Continuar editando");
    expect(TEXTOS_DO_DESCARTE.descartar).toBe("Descartar");
  });
});
