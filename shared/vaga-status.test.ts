import { describe, it, expect } from "vitest";
import {
  ACTIVE_CONFLICT_STATUSES,
  CONFIRMED_STATUSES,
  FASES_DA_VAGA,
  STATUS_DA_VAGA,
  STATUS_LEGADOS,
  TRANSICOES,
  ehStatusConfirmado,
  ehSugestao,
  faseParaStatus,
  normalizarStatus,
  podeConfirmar,
  podeTransitar,
  rotuloDoStatus,
  temLogisticaComprada,
} from "./vaga-status";
import { SUGESTAO_STATUS_VALUES } from "./scaling-validation-rules";

describe("vaga-status: domínio", () => {
  it("canônicos e legados não se misturam", () => {
    for (const legado of STATUS_LEGADOS) {
      expect(STATUS_DA_VAGA as readonly string[]).not.toContain(legado);
    }
  });

  it("todos os status de sugestão da máquina estão no domínio", () => {
    for (const s of SUGESTAO_STATUS_VALUES) expect(STATUS_DA_VAGA as readonly string[]).toContain(s);
  });

  it("normalizarStatus: canônico volta igual, legado vira equivalente, lixo vira null", () => {
    expect(normalizarStatus("escalado")).toBe("escalado");
    expect(normalizarStatus("pendente")).toBe("planejado");
    expect(normalizarStatus("incluido")).toBe("planejado");
    expect(normalizarStatus("confirmado")).toBe("escalado");
    expect(normalizarStatus("aguardando_passagem")).toBe("passagem");
    expect(normalizarStatus("xyz")).toBeNull();
    expect(normalizarStatus(null)).toBeNull();
  });
});

describe("vaga-status: contrato das listas (23/09)", () => {
  it("CONFIRMED_STATUSES contém hospedagem_passagem_comprada (faltava em 3 das 5 listas)", () => {
    expect(CONFIRMED_STATUSES.has("hospedagem_passagem_comprada")).toBe(true);
  });

  it("CONFIRMED_STATUSES é a união das listas antigas", () => {
    for (const s of ["escalado", "aguardando_producao", "passagem", "passagem_comprada", "hospedagem", "hospedagem_comprada", "hospedagem_passagem_comprada", "aprovacao", "aprovado", "concluido"]) {
      expect(CONFIRMED_STATUSES.has(s)).toBe(true);
    }
    for (const s of ["planejado", "reaberto", "escalacao", "cancelado", "sugestao_pendente", "pendente"]) {
      expect(CONFIRMED_STATUSES.has(s)).toBe(false);
    }
  });

  it("ACTIVE_CONFLICT_STATUSES = confirmados + legados de confirmação, sem cancelado nem sugestão", () => {
    for (const s of Array.from(CONFIRMED_STATUSES)) expect(ACTIVE_CONFLICT_STATUSES).toContain(s);
    expect(ACTIVE_CONFLICT_STATUSES).toContain("confirmado");
    expect(ACTIVE_CONFLICT_STATUSES).toContain("aguardando_passagem");
    expect(ACTIVE_CONFLICT_STATUSES).toContain("aguardando_hospedagem");
    expect(ACTIVE_CONFLICT_STATUSES).not.toContain("cancelado");
    expect(ACTIVE_CONFLICT_STATUSES).not.toContain("planejado");
    for (const s of SUGESTAO_STATUS_VALUES) expect(ACTIVE_CONFLICT_STATUSES).not.toContain(s);
    // o cliente usa .includes — precisa continuar sendo array
    expect(Array.isArray(ACTIVE_CONFLICT_STATUSES)).toBe(true);
  });

  it("ehStatusConfirmado conta legados; temLogisticaComprada só as três compras", () => {
    expect(ehStatusConfirmado("confirmado")).toBe(true);
    expect(ehStatusConfirmado("reaberto")).toBe(false);
    expect(temLogisticaComprada("passagem_comprada")).toBe(true);
    expect(temLogisticaComprada("hospedagem_comprada")).toBe(true);
    expect(temLogisticaComprada("hospedagem_passagem_comprada")).toBe(true);
    expect(temLogisticaComprada("passagem")).toBe(false);
    expect(temLogisticaComprada("escalado")).toBe(false);
  });

  it("ehSugestao aceita status ou fase", () => {
    expect(ehSugestao("sugestao")).toBe(true);
    expect(ehSugestao("sugestao_pendente")).toBe(true);
    expect(ehSugestao("sugestao_negada")).toBe(true);
    expect(ehSugestao("inclusao")).toBe(false);
    expect(ehSugestao("planejado")).toBe(false);
    expect(ehSugestao(null)).toBe(false);
  });
});

describe("podeConfirmar", () => {
  it("aceita vaga só salva (planejado, reaberto, escalacao) e legados equivalentes", () => {
    for (const s of ["planejado", "reaberto", "escalacao", "pendente", "incluido"]) {
      expect(podeConfirmar(s)).toEqual({ ok: true });
    }
  });

  it("recusa passagem_comprada (não regride a compra) e cancelado", () => {
    const compra = podeConfirmar("passagem_comprada");
    expect(compra.ok).toBe(false);
    if (!compra.ok) expect(compra.motivo).toMatch(/Solicitação de Troca/);
    const cancelada = podeConfirmar("cancelado");
    expect(cancelada).toEqual({ ok: false, motivo: "Escalação cancelada — reative para confirmar." });
  });

  it("recusa qualquer status já confirmado e os legados de confirmação", () => {
    for (const s of Array.from(CONFIRMED_STATUSES).concat(["confirmado", "aguardando_passagem", "aguardando_hospedagem"])) {
      expect(podeConfirmar(s).ok).toBe(false);
    }
  });

  it("recusa sugestões (inclusive sugestao_aprovada) apontando a tela de Validação", () => {
    for (const s of SUGESTAO_STATUS_VALUES) {
      const r = podeConfirmar(s);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motivo).toMatch(/Validação/);
    }
  });

  it("recusa status desconhecido e vazio", () => {
    expect(podeConfirmar("xyz").ok).toBe(false);
    expect(podeConfirmar(null).ok).toBe(false);
  });
});

describe("TRANSICOES / podeTransitar", () => {
  it("cobre todos os status canônicos e só aponta para canônicos", () => {
    for (const s of STATUS_DA_VAGA) {
      expect(TRANSICOES[s]).toBeDefined();
      for (const destino of TRANSICOES[s]) expect(STATUS_DA_VAGA as readonly string[]).toContain(destino);
    }
  });

  it("cancelado só transita para reaberto", () => {
    expect(TRANSICOES.cancelado).toEqual(["reaberto"]);
    expect(podeTransitar("cancelado", "reaberto")).toEqual({ ok: true });
    for (const s of STATUS_DA_VAGA) {
      if (s === "reaberto" || s === "cancelado") continue;
      expect(podeTransitar("cancelado", s).ok).toBe(false);
    }
  });

  it("nunca grava legado como destino (cancelado → pendente era o bug do reativar)", () => {
    expect(podeTransitar("cancelado", "pendente").ok).toBe(false);
    expect(podeTransitar("planejado", "confirmado").ok).toBe(false);
  });

  it("compra registrada não volta para escalado", () => {
    const r = podeTransitar("passagem_comprada", "escalado");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/compra/);
    expect(podeTransitar("hospedagem_passagem_comprada", "aguardando_producao").ok).toBe(false);
  });

  it("fluxo feliz: planejado → escalado → passagem_comprada → hospedagem_passagem_comprada → aprovado → concluido", () => {
    expect(podeTransitar("planejado", "escalado").ok).toBe(true);
    expect(podeTransitar("escalado", "passagem_comprada").ok).toBe(true);
    expect(podeTransitar("passagem_comprada", "hospedagem_passagem_comprada").ok).toBe(true);
    expect(podeTransitar("hospedagem_passagem_comprada", "aprovado").ok).toBe(true);
    expect(podeTransitar("aprovado", "concluido").ok).toBe(true);
  });

  it("cenotécnica: planejado → aguardando_producao → escalado | escalacao (reprovado)", () => {
    expect(podeTransitar("planejado", "aguardando_producao").ok).toBe(true);
    expect(podeTransitar("aguardando_producao", "escalado").ok).toBe(true);
    expect(podeTransitar("aguardando_producao", "escalacao").ok).toBe(true);
    expect(podeTransitar("aguardando_producao", "passagem_comprada").ok).toBe(false);
  });

  it("mesmo status é idempotente; origem legada usa o canônico; origem lixo recusa", () => {
    expect(podeTransitar("escalado", "escalado")).toEqual({ ok: true });
    expect(podeTransitar("pendente", "escalado").ok).toBe(true);
    expect(podeTransitar("xyz", "escalado").ok).toBe(false);
  });

  it("sugestões seguem a máquina de scaling-validation-rules", () => {
    expect([...TRANSICOES.sugestao_pendente].sort()).toEqual(["planejado", "sugestao_ajuste", "sugestao_negada", "sugestao_validada"]);
    expect([...TRANSICOES.sugestao_validada].sort()).toEqual(["planejado", "sugestao_pendente"]);
    expect([...TRANSICOES.sugestao_ajuste].sort()).toEqual(["planejado", "sugestao_negada", "sugestao_pendente"]);
    expect(TRANSICOES.sugestao_negada).toEqual([]);
    expect(TRANSICOES.sugestao_aprovada).toEqual(["planejado"]);
  });
});

describe("faseParaStatus", () => {
  it("devolve uma fase do domínio para todo status canônico e legado", () => {
    for (const s of [...STATUS_DA_VAGA, ...STATUS_LEGADOS]) {
      const fase = faseParaStatus(s);
      expect(fase).not.toBeNull();
      expect(FASES_DA_VAGA as readonly string[]).toContain(fase);
    }
  });

  it("pares conhecidos", () => {
    expect(faseParaStatus("cancelado")).toBe("cancelado");
    expect(faseParaStatus("sugestao_pendente")).toBe("sugestao");
    expect(faseParaStatus("passagem_comprada")).toBe("passagem");
    expect(faseParaStatus("hospedagem_passagem_comprada")).toBe("hospedagem");
    expect(faseParaStatus("planejado")).toBe("inclusao");
    expect(faseParaStatus("reaberto")).toBe("inclusao");
    expect(faseParaStatus("aguardando_producao")).toBe("escalacao");
    expect(faseParaStatus("aprovado")).toBe("aprovado");
    expect(faseParaStatus("concluido")).toBe("aprovado");
    expect(faseParaStatus("pendente")).toBe("inclusao");
    expect(faseParaStatus("xyz")).toBeNull();
  });
});

describe("rotuloDoStatus", () => {
  it("escalacao (vaga sem ninguém) é 'Vaga aberta', não 'Escalado'", () => {
    expect(rotuloDoStatus("escalacao")).toBe("Vaga aberta");
    expect(rotuloDoStatus("escalado")).toBe("Escalado");
  });

  it("tem rótulo para todo status canônico e legado; lixo volta como veio", () => {
    for (const s of [...STATUS_DA_VAGA, ...STATUS_LEGADOS]) {
      expect(rotuloDoStatus(s)).not.toBe(s);
      expect(rotuloDoStatus(s).length).toBeGreaterThan(0);
    }
    expect(rotuloDoStatus("xyz")).toBe("xyz");
    expect(rotuloDoStatus(null)).toBe("—");
  });
});
