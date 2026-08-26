import { describe, it, expect } from "vitest";
import { SUGESTAO_PHASE, SUGESTAO_STATUS } from "@shared/scaling-validation-rules";
import { AWAITING_APPROVAL_LOCK, canActOn, canRequestChange, canValidate, lockReason } from "./types";

type Row = Parameters<typeof canActOn>[0];

const row = (over: Partial<Row> = {}): Row => ({
  canEdit: true,
  pendingRequest: null,
  phase: SUGESTAO_PHASE,
  status: SUGESTAO_STATUS.PENDENTE,
  ...over,
});

describe("ações da área sobre a vaga", () => {
  it("vaga pendente: valida e pede ajuste", () => {
    const r = row();
    expect(canValidate(r)).toBe(true);
    expect(canRequestChange(r)).toBe(true);
    expect(lockReason(r)).toBeNull();
  });

  it("vaga validada não aceita mais nada da área — está com o aprovador", () => {
    const r = row({ status: SUGESTAO_STATUS.VALIDADA });
    expect(canValidate(r)).toBe(false);
    // Regra do dono (26/08): "não posso editar enquanto estiver para aprovação,
    // apenas incluir uma nova escalação". Ajuste e exclusão saem de cena.
    expect(canRequestChange(r)).toBe(false);
    expect(canActOn(r)).toBe(false);
    expect(lockReason(r)).toBe(AWAITING_APPROVAL_LOCK);
  });

  it("pedido pendente trava a vaga (pendente ou validada)", () => {
    const pending = { id: "req-1" } as unknown as Row["pendingRequest"];
    for (const status of [SUGESTAO_STATUS.PENDENTE, SUGESTAO_STATUS.VALIDADA]) {
      const r = row({ status, pendingRequest: pending });
      expect(canActOn(r)).toBe(false);
      expect(lockReason(r)).toBe("Há um pedido pendente para esta vaga");
    }
  });

  it("sem permissão de validador a vaga fica bloqueada", () => {
    expect(lockReason(row({ canEdit: false }))).toBe("Você não valida esta função");
  });

  it("vaga fora da fase de sugestão não tem ação", () => {
    const r = row({ phase: "inclusao", status: "planejado" });
    expect(canActOn(r)).toBe(false);
    expect(lockReason(r)).toBe("Sem ações disponíveis nesta etapa");
  });
});

// A devolução da vaga pelo aprovador não é mais inferida por heurística: o GET
// devolve `lastVagaDecision` (ver `pickLastVagaDecision`, testado em
// shared/scaling-validation-rules.test.ts).
