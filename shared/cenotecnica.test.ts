import { describe, expect, it } from "vitest";
import { ehCenotecnica, ehSupervisorDeCenotecnica, normalizarNomeDeFuncao, TERMOS_CENOTECNICA } from "./cenotecnica";
import { isCenotecnicaFunction } from "./alimentacao";
import { isCenotecnicaFunctionName } from "./scaling-rules";

describe("ehCenotecnica — uma lista de termos para os dois usos", () => {
  it("casa os termos sem caixa e sem acento", () => {
    for (const nome of ["Cenotécnica", "cenotecnica", "CENOTÉCNICA Local", "Ceno", "Cenotecnica Freela"]) {
      expect(ehCenotecnica(nome, { incluiSupCeno: true }), nome).toBe(true);
      expect(ehCenotecnica(nome, { incluiSupCeno: false }), nome).toBe(true);
    }
  });

  it("não casa funções fora da lista", () => {
    for (const nome of ["Atendimento", "Coordenador de Percurso", "Produtor", "Montagem", "", null, undefined]) {
      expect(ehCenotecnica(nome, { incluiSupCeno: true }), String(nome)).toBe(false);
      expect(ehCenotecnica(nome, { incluiSupCeno: false }), String(nome)).toBe(false);
    }
  });

  it("Sup Ceno: entra só com incluiSupCeno (gestor), fica fora na alimentação", () => {
    for (const nome of ["Sup Ceno", "SUP CENO 2", "Supervisor de Cenotecnica", "Supervisor de Cenotécnica"]) {
      expect(ehSupervisorDeCenotecnica(nome), nome).toBe(true);
      expect(ehCenotecnica(nome, { incluiSupCeno: true }), nome).toBe(true);
      expect(ehCenotecnica(nome, { incluiSupCeno: false }), nome).toBe(false);
    }
    expect(ehSupervisorDeCenotecnica("Cenotécnica")).toBe(false);
    expect(ehSupervisorDeCenotecnica("Supervisor de Montagem")).toBe(false);
  });

  it("normalizarNomeDeFuncao tira caixa, acento e espaços das pontas", () => {
    expect(normalizarNomeDeFuncao("  Cenotécnica ")).toBe("cenotecnica");
    expect(normalizarNomeDeFuncao(null)).toBe("");
  });

  it("a lista de termos é a única fonte (sem acento — a normalização cuida disso)", () => {
    expect(TERMOS_CENOTECNICA).toEqual(["cenotecnica", "ceno"]);
  });
});

describe("os dois wrappers antigos leem a mesma lista", () => {
  it("fluxo do gestor = incluiSupCeno: true", () => {
    expect(isCenotecnicaFunctionName("Cenotécnica")).toBe(true);
    expect(isCenotecnicaFunctionName("Sup Ceno")).toBe(true);
    expect(isCenotecnicaFunctionName("Ceno Local")).toBe(true);
    expect(isCenotecnicaFunctionName("Atendimento")).toBe(false);
  });

  it("alimentação = incluiSupCeno: false (Sup Ceno = produtor, regra atual do dono)", () => {
    expect(isCenotecnicaFunction("Cenotécnica")).toBe(true);
    expect(isCenotecnicaFunction("Ceno Local")).toBe(true);
    expect(isCenotecnicaFunction("Sup Ceno")).toBe(false);
    expect(isCenotecnicaFunction("Atendimento")).toBe(false);
  });

  it("fora o supervisor, as duas respostas coincidem para qualquer nome", () => {
    const nomes = ["Cenotécnica", "cenotecnica", "Ceno", "Ceno Local", "Produtor", "Kit", "Percurseiro", "Key Account", "", null];
    for (const nome of nomes) {
      expect(isCenotecnicaFunction(nome), String(nome)).toBe(isCenotecnicaFunctionName(nome));
    }
  });
});
