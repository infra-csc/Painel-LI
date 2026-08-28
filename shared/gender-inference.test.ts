import { describe, it, expect } from "vitest";
import { inferirGenero, primeiroNome, normalizarNome } from "./gender-inference";

describe("normalização", () => {
  it("conserta o mojibake que existe na base (JoÃ£o → joao)", () => {
    expect(normalizarNome("JoÃ£o")).toBe("joao");
    expect(normalizarNome("FÃ¡bio")).toBe("fabio");
  });
  it("usa só o primeiro nome", () => {
    expect(primeiroNome("ANA CLAUDIA MOTTA ALVES")).toBe("ana");
    expect(primeiroNome("Robson da Silva Miranda")).toBe("robson");
  });
});

describe("nomes conhecidos (alta confiança)", () => {
  it("identifica mulheres", () => {
    for (const n of ["ANA CLAUDIA MOTTA", "Patrícia Fernanda", "NAIARA DAIANE", "Beatriz Souza", "Ruth Lima"]) {
      expect(inferirGenero(n)).toEqual({ genero: "female", confianca: "alta" });
    }
  });
  it("identifica homens", () => {
    for (const n of ["ROBSON DA SILVA", "JoÃ£o Pedro", "Rubem Ismael", "Murilo Vischi", "Renan Bicudo"]) {
      expect(inferirGenero(n)).toEqual({ genero: "male", confianca: "alta" });
    }
  });
});

describe("terminação (média confiança)", () => {
  it("nome desconhecido terminado em -a é tratado como feminino", () => {
    const r = inferirGenero("Marilza dos Santos");
    expect(r.genero).toBe("female");
    expect(r.confianca).toBe("media");
  });
  it("nome desconhecido terminado em -o é tratado como masculino", () => {
    const r = inferirGenero("Genivaldo Pereira");
    expect(r.genero).toBe("male");
    expect(r.confianca).toBe("media");
  });
});

describe("o que NÃO se arrisca", () => {
  it("nomes que servem para os dois ficam sem palpite", () => {
    for (const n of ["Alex Souza", "Ariel Campos", "Jean Carlos", "Yuri Alberto"]) {
      expect(inferirGenero(n)).toEqual({ genero: null, confianca: null });
    }
  });
  it("cadastros que não são pessoas ficam sem palpite", () => {
    for (const n of ["TESTE", "ARENA", "GRIFFE", "TBH"]) {
      expect(inferirGenero(n).genero).toBeNull();
    }
  });
  it("vazio não vira palpite", () => {
    expect(inferirGenero("")).toEqual({ genero: null, confianca: null });
    expect(inferirGenero("  ")).toEqual({ genero: null, confianca: null });
  });
  it("terminação em consoante não é chutada", () => {
    expect(inferirGenero("Kevlyn Xavier").genero).toBeNull();
  });
});
