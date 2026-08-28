/**
 * Casamento voucher → vaga (28/08). Gravar passagem na vaga errada é caro de
 * desfazer, então na dúvida a função devolve null e a tela pede a escolha.
 */
import { describe, it, expect } from "vitest";
import { casarVaga } from "./voucher-match";

const vagas = [
  { id: "a", nome: "Robson da Silva Miranda" },
  { id: "b", nome: "Patrícia Fernanda de Souza Dantas" },
  { id: "c", nome: "João Pedro Alves" },
];

describe("casarVaga", () => {
  it("casa ignorando caixa e acento (o voucher vem em CAIXA ALTA)", () => {
    expect(casarVaga("ROBSON DA SILVA MIRANDA", vagas)).toBe("a");
    expect(casarVaga("PATRICIA FERNANDA DE SOUZA DANTAS", vagas)).toBe("b");
  });

  it("casa por primeiro e último nome quando o meio vem diferente", () => {
    expect(casarVaga("ROBSON MIRANDA", vagas)).toBe("a");
  });

  it("não escolhe ninguém quando há homônimos", () => {
    const comHomonimo = [...vagas, { id: "d", nome: "ROBSON DA SILVA MIRANDA" }];
    expect(casarVaga("Robson da Silva Miranda", comHomonimo)).toBeNull();
  });

  it("não chuta quando o nome não bate com vaga nenhuma", () => {
    expect(casarVaga("MARIA DAS DORES", vagas)).toBeNull();
  });

  it("sem passageiro lido, não casa", () => {
    expect(casarVaga(undefined, vagas)).toBeNull();
  });
});
