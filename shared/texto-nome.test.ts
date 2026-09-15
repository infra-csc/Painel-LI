import { describe, it, expect } from "vitest";
import { corrigirTextoDeNome, pareceComErro } from "./texto-nome";

describe("conserto de nomes com erro de codificação (15/09)", () => {
  it("tira o Â que sobrou do espaço especial", () => {
    expect(corrigirTextoDeNome("PRISCILA ELIAS DA SILVAÂ")).toBe("PRISCILA ELIAS DA SILVA");
    expect(corrigirTextoDeNome("MARIA DAÂ SILVA")).toBe("MARIA DA SILVA");
  });

  it("devolve a letra acentuada que virou duas", () => {
    expect(corrigirTextoDeNome("AntÃ´nio Janderson")).toBe("Antônio Janderson");
    expect(corrigirTextoDeNome("Carlos AndrÃ© Carvalho")).toBe("Carlos André Carvalho");
    expect(corrigirTextoDeNome("SÃ£o Paulo")).toBe("São Paulo");
    expect(corrigirTextoDeNome("CONCEIÃÃO")).toBe("CONCEIÇÃO");
    expect(corrigirTextoDeNome("GonÃ§alves")).toBe("Gonçalves");
  });

  it("recupera o ÇÃO que perdeu o Ç", () => {
    expect(corrigirTextoDeNome("ADEMIR DA CONCEIÃÃO FILHO")).toBe("ADEMIR DA CONCEIÇÃO FILHO");
  });

  it("arruma espaços sem mexer em maiúsculas", () => {
    expect(corrigirTextoDeNome("  João  da Silva ")).toBe("João da Silva");
    expect(corrigirTextoDeNome("sÃO ")).toBe("sÃO");
  });

  it("não mexe em acento correto", () => {
    for (const certo of ["SÃO PAULO", "JOÃO", "Ângela", "CÂMARA", "MÃE", "IRMÃS", "Atílio Alves de Barros", "RIBEIRÃO PRETO"]) {
      expect(corrigirTextoDeNome(certo)).toBe(certo);
      expect(pareceComErro(certo)).toBe(false);
    }
  });

  it("aponta para revisão o que perdeu informação", () => {
    expect(corrigirTextoDeNome("BRASÃLIA")).toBe("BRASÃLIA");
    expect(pareceComErro("BRASÃLIA")).toBe(true);
    expect(pareceComErro("Jos�")).toBe(true);
  });
});
