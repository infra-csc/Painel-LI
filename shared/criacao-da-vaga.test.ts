import { describe, it, expect } from "vitest";
import { ONDE_A_VAGA_NASCEU, origemDaCriacao } from "./criacao-da-vaga";

const CRIADA = "2026-09-09T10:05:00.000Z";
const base = { vagaId: "v1", createdAt: CRIADA, logs: [], auditorias: [] };

describe("quem criou a vaga e por onde (14/09)", () => {
  it("pedido de inclusão aprovado: quem aprovou, pela Aprovação de Escala", () => {
    const r = origemDaCriacao({ ...base, logs: [{ action: "created_from_change_request", userName: "Pedro", createdAt: CRIADA }] });
    expect(r).toEqual({ por: "Pedro", onde: ONDE_A_VAGA_NASCEU.pedido });
  });

  it("registro novo de criação na vaga manda", () => {
    const r = origemDaCriacao({ ...base, logs: [{ action: "created", details: "Pela tela Inclusão de Equipe", userName: "Agatha", createdAt: CRIADA }] });
    expect(r).toEqual({ por: "Agatha", onde: "tela Inclusão de Equipe" });
  });

  it("Sugestão de Escala: o log de envio feito na criação", () => {
    const r = origemDaCriacao({ ...base, logs: [{ action: "suggestion_sent", userName: "Logística", createdAt: "2026-09-09T10:05:01.000Z" }] });
    expect(r).toEqual({ por: "Logística", onde: ONDE_A_VAGA_NASCEU.sugestao });
  });

  it("envio de sugestão muito depois (reenvio) não conta como criação", () => {
    const r = origemDaCriacao({ ...base, logs: [{ action: "suggestion_sent", userName: "Logística", createdAt: "2026-09-12T10:00:00.000Z" }] });
    expect(r).toEqual({ por: null, onde: null });
  });

  it("escalação de emergência: auditoria com o id exato e sem lote", () => {
    const r = origemDaCriacao({ ...base, auditorias: [{ entityId: "v1", action: "create", userName: "RH", newData: '{"id":"v1"}', createdAt: CRIADA }] });
    expect(r).toEqual({ por: "RH", onde: ONDE_A_VAGA_NASCEU.emergencia });
  });

  it("grade antiga: a auditoria do lote mais perto da hora da criação", () => {
    const r = origemDaCriacao({
      ...base,
      auditorias: [
        { entityId: "outra", action: "create", userName: "Longe", newData: '{"count":3}', createdAt: "2026-09-09T10:06:50.000Z" },
        { entityId: "primeira", action: "create", userName: "Agatha", newData: '{"count":8}', createdAt: "2026-09-09T10:05:02.000Z" },
      ],
    });
    expect(r).toEqual({ por: "Agatha", onde: ONDE_A_VAGA_NASCEU.inclusao });
  });

  it("auditoria de lote fora da janela não vale", () => {
    const r = origemDaCriacao({ ...base, auditorias: [{ entityId: "x", action: "create", userName: "Outro dia", newData: '{"count":2}', createdAt: "2026-09-10T10:05:00.000Z" }] });
    expect(r).toEqual({ por: null, onde: null });
  });
});
