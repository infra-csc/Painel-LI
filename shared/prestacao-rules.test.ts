import { describe, it, expect } from "vitest";
import {
  isNfEligible, contaNosTotais, podeDecidirPrestacao, podeEnviarParaRevisao,
  prestacaoEstaTravada, podeAprovarNota, podeDevolverNota, podeFazerCheckin,
} from "./prestacao-rules";

describe("isNfEligible (NF libera no envio do Realizado)", () => {
  it("libera com o envio, ainda pendente de análise", () => {
    expect(isNfEligible({ sentForReview: true, rhStatus: "pendente" })).toBe(true);
  });

  it("libera quando aprovado", () => {
    expect(isNfEligible({ sentForReview: true, rhStatus: "aprovado" })).toBe(true);
    // aprovado zera sentForReview em alguns fluxos — segue elegível
    expect(isNfEligible({ sentForReview: false, rhStatus: "aprovado" })).toBe(true);
  });

  it("NÃO libera antes do envio", () => {
    expect(isNfEligible({ sentForReview: false, rhStatus: "pendente" })).toBe(false);
  });

  it("devolvido e rejeitado pausam a NF", () => {
    expect(isNfEligible({ sentForReview: false, rhStatus: "devolvido" })).toBe(false);
    expect(isNfEligible({ sentForReview: true, rhStatus: "rejeitado" })).toBe(false);
  });

  it("nulo/indefinido não é elegível", () => {
    expect(isNfEligible(null)).toBe(false);
    expect(isNfEligible(undefined)).toBe(false);
  });
});

describe("contaNosTotais", () => {
  it("item comum conta", () => {
    expect(contaNosTotais({})).toBe(true);
  });
  it("filho de divisão não duplica o total", () => {
    expect(contaNosTotais({ splitParentId: "abc" })).toBe(false);
  });
  it("quem não participou conta zero", () => {
    expect(contaNosTotais({ didNotAttend: true })).toBe(false);
  });
});

describe("podeDecidirPrestacao (máquina de estados do RH)", () => {
  it("decide o que está enviado e pendente", () => {
    expect(podeDecidirPrestacao({ sentForReview: true, rhStatus: "pendente" }).ok).toBe(true);
  });

  it("recusa item nunca enviado (evitava rhStatus aprovado com sentForReview false)", () => {
    const r = podeDecidirPrestacao({ sentForReview: false, rhStatus: "pendente" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/ainda não foi enviada/i);
  });

  it("recusa item já analisado (sem re-aprovar)", () => {
    expect(podeDecidirPrestacao({ sentForReview: true, rhStatus: "aprovado" }).ok).toBe(false);
    expect(podeDecidirPrestacao({ sentForReview: true, rhStatus: "devolvido" }).ok).toBe(false);
  });
});

describe("podeEnviarParaRevisao", () => {
  it("envia o que nunca foi enviado", () => {
    expect(podeEnviarParaRevisao({ sentForReview: false, rhStatus: "pendente" })).toBe(true);
  });
  it("reenvia devolvido e rejeitado", () => {
    expect(podeEnviarParaRevisao({ sentForReview: false, rhStatus: "devolvido" })).toBe(true);
    expect(podeEnviarParaRevisao({ sentForReview: false, rhStatus: "rejeitado" })).toBe(true);
  });
  it("aprovado é terminal", () => {
    expect(podeEnviarParaRevisao({ sentForReview: true, rhStatus: "aprovado" })).toBe(false);
  });
  it("não reenvia o que já está em análise", () => {
    expect(podeEnviarParaRevisao({ sentForReview: true, rhStatus: "pendente" })).toBe(false);
  });
});

describe("prestacaoEstaTravada", () => {
  it("trava em análise e aprovado", () => {
    expect(prestacaoEstaTravada({ sentForReview: true, rhStatus: "pendente" })).toBe(true);
    expect(prestacaoEstaTravada({ rhStatus: "aprovado" })).toBe(true);
  });
  it("libera devolvido para correção", () => {
    expect(prestacaoEstaTravada({ sentForReview: false, rhStatus: "devolvido" })).toBe(false);
  });
});

describe("podeAprovarNota", () => {
  it("aprova nota enviada com Realizado íntegro", () => {
    expect(podeAprovarNota({ status: "enviada" }, { rhStatus: "pendente", sentForReview: true }).ok).toBe(true);
  });

  it("recusa nota que não está enviada", () => {
    expect(podeAprovarNota({ status: "pendente" }).ok).toBe(false);
    expect(podeAprovarNota({ status: "aprovada" }).ok).toBe(false);
    expect(podeAprovarNota({ status: "devolvida" }).ok).toBe(false);
  });

  it("bloqueia quando o Realizado foi devolvido depois do envio da nota", () => {
    const r = podeAprovarNota({ status: "enviada" }, { rhStatus: "devolvido" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/devolvido/i);
  });

  it("bloqueia quando o Realizado foi recusado", () => {
    expect(podeAprovarNota({ status: "enviada" }, { rhStatus: "rejeitado" }).ok).toBe(false);
  });
});

describe("podeDevolverNota", () => {
  it("devolve nota enviada", () => {
    expect(podeDevolverNota({ status: "enviada" }).ok).toBe(true);
  });
  it("não devolve nota aprovada", () => {
    expect(podeDevolverNota({ status: "aprovada" }).ok).toBe(false);
  });
});

describe("podeFazerCheckin", () => {
  it("faz check-in de nota aprovada com data", () => {
    expect(podeFazerCheckin({ status: "aprovada", checkinAt: null }, "2026-08-13").ok).toBe(true);
  });

  it("recusa check-in em nota não aprovada (estado impossível anterior)", () => {
    const r = podeFazerCheckin({ status: "enviada" }, "2026-08-13");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/aprovada/i);
  });

  it("recusa check-in duplicado", () => {
    expect(podeFazerCheckin({ status: "aprovada", checkinAt: new Date() }, "2026-08-13").ok).toBe(false);
  });

  it("exige data de pagamento", () => {
    const r = podeFazerCheckin({ status: "aprovada", checkinAt: null }, null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/data de pagamento/i);
  });
});
