/**
 * Casamento voucher → vaga (28/08). Gravar passagem na vaga errada é caro de
 * desfazer, então na dúvida a função devolve null e a tela pede a escolha.
 */
import { describe, it, expect } from "vitest";
import { casarVaga, pontuarSemelhanca, ordenarPorSemelhanca } from "./voucher-match";

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

describe("pontuarSemelhanca e ordenação das vagas", () => {
  it("nome igual pontua 1", () => {
    expect(pontuarSemelhanca("ROBSON DA SILVA MIRANDA", "Robson da Silva Miranda")).toBe(1);
  });

  it("preposições não contam (o voucher às vezes as omite)", () => {
    expect(pontuarSemelhanca("ROBSON SILVA MIRANDA", "Robson da Silva Miranda")).toBe(1);
  });

  it("nome parcial pontua entre 0 e 1", () => {
    const s = pontuarSemelhanca("ROBSON MIRANDA", "Robson da Silva Miranda");
    expect(s).toBeGreaterThan(0.5);
    expect(s).toBeLessThan(1);
  });

  it("pessoas diferentes pontuam baixo", () => {
    expect(pontuarSemelhanca("MARIA DAS DORES", "Robson da Silva Miranda")).toBe(0);
  });

  it("ordena as vagas da mais parecida para a menos parecida", () => {
    const ordenadas = ordenarPorSemelhanca("ROBSON DA SILVA MIRANDA", vagas);
    expect(ordenadas[0].vaga.id).toBe("a");
    expect(ordenadas[0].score).toBe(1);
    expect(ordenadas[ordenadas.length - 1].score).toBe(0);
  });

  it("sem passageiro, mantém a lista sem pontuar", () => {
    const r = ordenarPorSemelhanca(undefined, vagas);
    expect(r.map(o => o.vaga.id)).toEqual(["a", "b", "c"]);
    expect(r.every(o => o.score === 0)).toBe(true);
  });
});
