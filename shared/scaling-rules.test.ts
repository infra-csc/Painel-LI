import { describe, it, expect } from "vitest";
import { nextStatusOnConfirm, isCenotecnicaFunctionName } from "./scaling-rules";

describe("isCenotecnicaFunctionName", () => {
  it("reconhece as variações usadas no cadastro de funções", () => {
    expect(isCenotecnicaFunctionName("Cenotécnica")).toBe(true);
    expect(isCenotecnicaFunctionName("cenotecnica")).toBe(true);
    expect(isCenotecnicaFunctionName("Sup Ceno")).toBe(true);
    expect(isCenotecnicaFunctionName("SUP CENO 2")).toBe(true);
  });

  it("não confunde outras funções", () => {
    expect(isCenotecnicaFunctionName("Atendimento")).toBe(false);
    expect(isCenotecnicaFunctionName("Coordenador de Percurso")).toBe(false);
    expect(isCenotecnicaFunctionName(null)).toBe(false);
    expect(isCenotecnicaFunctionName(undefined)).toBe(false);
    expect(isCenotecnicaFunctionName("")).toBe(false);
  });
});

describe("nextStatusOnConfirm", () => {
  it("cenotécnica sempre vai para aguardando_producao, mesmo com logística", () => {
    expect(nextStatusOnConfirm({ functionName: "Cenotécnica", needsTicket: true, needsAccommodation: true }))
      .toEqual({ status: "aguardando_producao", phase: "escalacao" });
    expect(nextStatusOnConfirm({ functionName: "Sup Ceno", needsTicket: false, needsAccommodation: false }))
      .toEqual({ status: "aguardando_producao", phase: "escalacao" });
  });

  it("sem passagem e sem hospedagem vai direto para aprovado", () => {
    expect(nextStatusOnConfirm({ functionName: "Atendimento", needsTicket: false, needsAccommodation: false }))
      .toEqual({ status: "aprovado", phase: "aprovado" });
    // null/undefined contam como "não precisa"
    expect(nextStatusOnConfirm({ functionName: "Staff", needsTicket: null, needsAccommodation: undefined }))
      .toEqual({ status: "aprovado", phase: "aprovado" });
  });

  it("com passagem ou hospedagem fica escalado na fase de escalação", () => {
    expect(nextStatusOnConfirm({ functionName: "Staff", needsTicket: true, needsAccommodation: false }))
      .toEqual({ status: "escalado", phase: "escalacao" });
    expect(nextStatusOnConfirm({ functionName: "Staff", needsTicket: false, needsAccommodation: true }))
      .toEqual({ status: "escalado", phase: "escalacao" });
    expect(nextStatusOnConfirm({ functionName: "Staff", needsTicket: true, needsAccommodation: true }))
      .toEqual({ status: "escalado", phase: "escalacao" });
  });
});
