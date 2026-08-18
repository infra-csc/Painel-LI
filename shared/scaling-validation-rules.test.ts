import { describe, it, expect } from "vitest";
import {
  SUGESTAO_PHASE, SUGESTAO_STATUS, SUGGESTION_ACTIONS,
  nextSuggestionState, toInclusaoState, isSuggestionInclusion, availableSuggestionActions,
  requestStatusForAction, parseProposedChanges, diffInclusion,
  canValidateInclusion, canApproveRequest, daysPending,
} from "./scaling-validation-rules";

const sug = (status: string) => ({ status, phase: SUGESTAO_PHASE });
const INCLUSAO = { phase: "inclusao", status: "planejado" };

describe("isSuggestionInclusion / toInclusaoState", () => {
  it("phase 'sugestao' é sugestão; demais não", () => {
    expect(isSuggestionInclusion({ phase: "sugestao" })).toBe(true);
    expect(isSuggestionInclusion({ phase: "inclusao" })).toBe(false);
    expect(isSuggestionInclusion(null)).toBe(false);
  });
  it("estado final é inclusao/planejado", () => {
    expect(toInclusaoState()).toEqual(INCLUSAO);
  });
});

describe("nextSuggestionState — transições válidas", () => {
  it("validar sem pedido vira IMEDIATAMENTE inclusao/planejado", () => {
    expect(nextSuggestionState(sug(SUGESTAO_STATUS.PENDENTE), "validar")).toEqual(INCLUSAO);
  });
  it("pedir_ajuste -> sugestao_ajuste", () => {
    expect(nextSuggestionState(sug(SUGESTAO_STATUS.PENDENTE), "pedir_ajuste")).toEqual(sug(SUGESTAO_STATUS.AJUSTE));
  });
  it("aprovar_pedido (ajuste/inclusão) aplica e vai para inclusão", () => {
    expect(nextSuggestionState(sug(SUGESTAO_STATUS.AJUSTE), "aprovar_pedido")).toEqual(INCLUSAO);
    expect(nextSuggestionState(sug(SUGESTAO_STATUS.AJUSTE), "aprovar_pedido", { requestType: "ajuste" })).toEqual(INCLUSAO);
  });
  it("aprovar_pedido de EXCLUSÃO deixa a vaga registrada como negada", () => {
    expect(nextSuggestionState(sug(SUGESTAO_STATUS.AJUSTE), "aprovar_pedido", { requestType: "exclusao" }))
      .toEqual(sug(SUGESTAO_STATUS.NEGADA));
  });
  it("reajustar_reenviar / negar_reenviar -> sugestao_pendente", () => {
    expect(nextSuggestionState(sug(SUGESTAO_STATUS.AJUSTE), "reajustar_reenviar")).toEqual(sug(SUGESTAO_STATUS.PENDENTE));
    expect(nextSuggestionState(sug(SUGESTAO_STATUS.AJUSTE), "negar_reenviar")).toEqual(sug(SUGESTAO_STATUS.PENDENTE));
  });
  it("reajustar_aprovar_direto / negar_aprovar_direto -> inclusão", () => {
    expect(nextSuggestionState(sug(SUGESTAO_STATUS.AJUSTE), "reajustar_aprovar_direto")).toEqual(INCLUSAO);
    expect(nextSuggestionState(sug(SUGESTAO_STATUS.AJUSTE), "negar_aprovar_direto")).toEqual(INCLUSAO);
  });
  it("aprovar_direto_bypass (vaga nunca validada) -> inclusão", () => {
    expect(nextSuggestionState(sug(SUGESTAO_STATUS.PENDENTE), "aprovar_direto_bypass")).toEqual(INCLUSAO);
  });
  it("reprovar_bypass -> sugestao_negada (fica registrada, não some)", () => {
    const r = nextSuggestionState(sug(SUGESTAO_STATUS.PENDENTE), "reprovar_bypass");
    expect(r).toEqual(sug(SUGESTAO_STATUS.NEGADA));
    expect(r.phase).toBe("sugestao"); // continua na tabela, mesma fase
  });
  it("ciclo completo: pedir ajuste -> reenviar -> validar", () => {
    const s1 = nextSuggestionState(sug(SUGESTAO_STATUS.PENDENTE), "pedir_ajuste");
    const s2 = nextSuggestionState(s1, "negar_reenviar");
    expect(s2).toEqual(sug(SUGESTAO_STATUS.PENDENTE));
    expect(nextSuggestionState(s2, "validar")).toEqual(INCLUSAO);
  });
});

describe("nextSuggestionState — transições inválidas (erro pt-BR)", () => {
  it("validar quando já está com pedido de ajuste", () => {
    expect(() => nextSuggestionState(sug(SUGESTAO_STATUS.AJUSTE), "validar")).toThrow(/Transição inválida/);
  });
  it("aprovar_pedido sem pedido (pendente)", () => {
    expect(() => nextSuggestionState(sug(SUGESTAO_STATUS.PENDENTE), "aprovar_pedido")).toThrow(/Transição inválida/);
  });
  it("qualquer ação sobre vaga negada", () => {
    expect(() => nextSuggestionState(sug(SUGESTAO_STATUS.NEGADA), "validar")).toThrow(/Negada/);
    expect(() => nextSuggestionState(sug(SUGESTAO_STATUS.NEGADA), "aprovar_direto_bypass")).toThrow();
  });
  it("vaga fora da fase sugestao", () => {
    expect(() => nextSuggestionState(INCLUSAO, "validar")).toThrow(/não está na etapa de Validação de Escala/);
  });
  it("nenhum estado negado/inclusão tem ações disponíveis", () => {
    expect(availableSuggestionActions(sug(SUGESTAO_STATUS.NEGADA))).toEqual([]);
    expect(availableSuggestionActions(INCLUSAO)).toEqual([]);
    expect(availableSuggestionActions(sug(SUGESTAO_STATUS.PENDENTE)))
      .toEqual(["validar", "pedir_ajuste", "aprovar_direto_bypass", "reprovar_bypass"]);
    expect(SUGGESTION_ACTIONS).toHaveLength(9);
  });
});

describe("requestStatusForAction", () => {
  it("mapeia decisões do aprovador para status do pedido", () => {
    expect(requestStatusForAction("aprovar_pedido")).toBe("aprovado");
    expect(requestStatusForAction("reajustar_reenviar")).toBe("reenviado_validacao");
    expect(requestStatusForAction("reajustar_aprovar_direto")).toBe("reajustado");
    expect(requestStatusForAction("negar_reenviar")).toBe("negado");
    expect(requestStatusForAction("negar_aprovar_direto")).toBe("negado");
    expect(requestStatusForAction("validar")).toBeNull();
  });
});

describe("parseProposedChanges", () => {
  it("aceita string JSON e objeto", () => {
    const obj = { v: 1, dailyRates: 3 };
    expect(parseProposedChanges(JSON.stringify(obj), "ajuste")).toEqual(obj);
    expect(parseProposedChanges(obj, "ajuste")).toEqual(obj);
  });
  it("rejeita quantity em ajuste e aceita em inclusao", () => {
    expect(() => parseProposedChanges({ v: 1, quantity: 2 }, "ajuste")).toThrow(/não aceita quantidade/);
    expect(parseProposedChanges({ v: 1, quantity: 2, workDays: ["2026-09-01"] }, "inclusao").quantity).toBe(2);
    expect(() => parseProposedChanges({ v: 1, quantity: 0, workDays: ["2026-09-01"] }, "inclusao")).toThrow(/Quantidade mínima/);
  });
  it("inclusao exige workDays (min 1) e assume quantity = 1 por padrão", () => {
    expect(() => parseProposedChanges({ v: 1 }, "inclusao")).toThrow(/dias de trabalho/);
    expect(() => parseProposedChanges({ v: 1, quantity: 2 }, "inclusao")).toThrow(/dias de trabalho/);
    expect(() => parseProposedChanges({ v: 1, workDays: [] }, "inclusao")).toThrow(/ao menos um dia/);
    expect(() => parseProposedChanges(null, "inclusao")).toThrow(/dias de trabalho/);
    const ok = parseProposedChanges({ v: 1, workDays: ["2026-09-02", "2026-09-01"] }, "inclusao");
    expect(ok.quantity).toBe(1);
    expect(ok.workDays).toHaveLength(2);
  });
  it("ajuste precisa de ao menos um campo; exclusão aceita vazio e rejeita campos", () => {
    expect(() => parseProposedChanges({ v: 1 }, "ajuste")).toThrow(/ao menos um campo/);
    expect(parseProposedChanges(null, "exclusao")).toEqual({ v: 1 });
    expect(parseProposedChanges("", "exclusao")).toEqual({ v: 1 });
    expect(() => parseProposedChanges({ v: 1, dailyRates: 2 }, "exclusao")).toThrow(/não carrega/);
  });
  it("rejeita versão desconhecida, JSON inválido, campo estranho e formatos", () => {
    expect(() => parseProposedChanges({ v: 2, dailyRates: 1 }, "ajuste")).toThrow(/inválido/);
    expect(() => parseProposedChanges("{nope", "ajuste")).toThrow(/JSON válido/);
    expect(() => parseProposedChanges({ v: 1, foo: 1 }, "ajuste")).toThrow(/inválido/);
    expect(() => parseProposedChanges({ v: 1, flightDepartureDate: "18/08/2026" }, "ajuste")).toThrow(/Data inválida/);
    expect(() => parseProposedChanges({ v: 1, transportModeIda: "jato" }, "ajuste")).toThrow(/inválido/);
    expect(parseProposedChanges({ v: 1, transportModeIda: "aereo", flightDepartureSuggestedTime: "08:30" }, "ajuste").transportModeIda).toBe("aereo");
  });
});

describe("diffInclusion", () => {
  const current = {
    workDays: ["2026-09-02", "2026-09-01"],
    dailyRates: 2,
    flightDepartureDate: new Date("2026-08-31T00:00:00Z"),
    flightReturnDate: "2026-09-03",
    transportModeIda: "aereo",
    needsTicket: true,
    needsAccommodation: null,
    observations: null,
  };
  it("só lista os campos que mudam", () => {
    const d = diffInclusion(current, {
      v: 1,
      workDays: ["2026-09-01", "2026-09-02"], // mesma lista, ordem diferente
      dailyRates: 3,                            // muda
      flightDepartureDate: "2026-08-31",         // igual (Date x string)
      flightReturnDate: "2026-09-04",            // muda
      transportModeIda: "aereo",                 // igual
      needsTicket: true,                         // igual
      needsAccommodation: false,                 // null ~ false: igual
    });
    expect(d.map((e) => e.field)).toEqual(["dailyRates", "flightReturnDate"]);
    expect(d[0]).toEqual({ field: "dailyRates", label: "Diárias", from: 2, to: 3 });
    expect(d[1]).toEqual({ field: "flightReturnDate", label: "Data de volta", from: "2026-09-03", to: "2026-09-04" });
  });
  it("campos ausentes no pedido não entram; quantity é ignorado; lista vazia quando nada muda", () => {
    expect(diffInclusion(current, { v: 1, quantity: 3 })).toEqual([]);
    expect(diffInclusion(current, { v: 1, dailyRates: 2 })).toEqual([]);
    const d = diffInclusion(current, { v: 1, transportModeVolta: "van", observations: "chega cedo" });
    expect(d.map((e) => e.field)).toEqual(["transportModeVolta", "observations"]);
    expect(d[0].from).toBeNull();
  });
});

describe("permissões", () => {
  it("canValidateInclusion: admin ou validador", () => {
    expect(canValidateInclusion("validador", false)).toBe(true);
    expect(canValidateInclusion("aprovador", false)).toBe(false);
    expect(canValidateInclusion(null, false)).toBe(false);
    expect(canValidateInclusion(null, true)).toBe(true);
  });
  it("canApproveRequest: admin ou aprovador", () => {
    expect(canApproveRequest("aprovador", false)).toBe(true);
    expect(canApproveRequest("validador", false)).toBe(false);
    expect(canApproveRequest(null, true)).toBe(true);
  });
});

describe("daysPending", () => {
  const now = new Date("2026-08-18T12:00:00Z");
  it("conta dias inteiros desde o envio", () => {
    expect(daysPending(new Date("2026-08-15T09:00:00Z"), now)).toBe(3);
    expect(daysPending("2026-08-18T01:00:00Z", now)).toBe(0);
    expect(daysPending(new Date("2026-08-17T13:00:00Z"), now)).toBe(0); // 23h
  });
  it("sem envio, data inválida ou futura -> 0", () => {
    expect(daysPending(null, now)).toBe(0);
    expect(daysPending("nope", now)).toBe(0);
    expect(daysPending(new Date("2026-08-20T00:00:00Z"), now)).toBe(0);
  });
});
