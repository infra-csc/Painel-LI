import { describe, it, expect } from "vitest";
import {
  SUGESTAO_PHASE, SUGESTAO_STATUS, SUGGESTION_ACTIONS, SUGGESTION_ACTION_LABELS,
  nextSuggestionState, toInclusaoState, isSuggestionInclusion, availableSuggestionActions,
  requestStatusForAction, parseProposedChanges, diffInclusion,
  canValidateInclusion, canApproveRequest, daysPending,
  STALLED_DAYS, DANGER_DAYS, pendingSeverity, describeLastDecision, type LastDecisionInfo,
  describeVagaDecision, type LastVagaDecisionInfo, daysAwaitingApproval,
  CHANGE_REQUEST_STATUS, CHANGE_REQUEST_STATUS_VALUES,
  CANCELABLE_SUGESTAO_STATUS, isCancelableSuggestion, summarizeCancelableSuggestions,
  isRequestCanceledByCancelSend, CANCEL_SEND_REQUEST_STATUS, CANCEL_SEND_REQUEST_COMMENT,
  isRealYmd, isValidHhmm, ymdSchema, hhmmSchema, VAGA_STATE_CHANGED_MSG,
  DEFAULT_APPROVER_SETTING_KEY, approverSource, canApproveInFunction, usesDefaultApprover,
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
  it("validar NÃO aprova: para em sugestao_validada aguardando o aprovador", () => {
    expect(nextSuggestionState(sug(SUGESTAO_STATUS.PENDENTE), "validar")).toEqual(sug(SUGESTAO_STATUS.VALIDADA));
  });
  it("aprovar_vaga (aprovador) leva a vaga validada para inclusao/planejado", () => {
    expect(nextSuggestionState(sug(SUGESTAO_STATUS.VALIDADA), "aprovar_vaga")).toEqual(INCLUSAO);
  });
  it("reprovar_vaga DEVOLVE para a área (não mata a vaga)", () => {
    // Regra do dono (26/08): reprovar e devolver terminam no mesmo lugar — a
    // vaga volta a pendente e a área pode mexer de novo. O que separa os dois é
    // o comentário obrigatório do aprovador, no histórico.
    const r = nextSuggestionState(sug(SUGESTAO_STATUS.VALIDADA), "reprovar_vaga");
    expect(r).toEqual(sug(SUGESTAO_STATUS.PENDENTE));
    expect(r.phase).toBe("sugestao");
  });
  it("devolver_validacao -> volta para sugestao_pendente", () => {
    expect(nextSuggestionState(sug(SUGESTAO_STATUS.VALIDADA), "devolver_validacao")).toEqual(sug(SUGESTAO_STATUS.PENDENTE));
  });
  it("caminho completo: pendente -> validada -> aprovada -> Inclusão", () => {
    const validada = nextSuggestionState(sug(SUGESTAO_STATUS.PENDENTE), "validar");
    expect(validada).toEqual(sug(SUGESTAO_STATUS.VALIDADA));
    expect(nextSuggestionState(validada, "aprovar_vaga")).toEqual(INCLUSAO);
  });
  it("devolvida pelo aprovador, a área valida de novo e aí sim vira Inclusão", () => {
    const validada = nextSuggestionState(sug(SUGESTAO_STATUS.PENDENTE), "validar");
    const devolvida = nextSuggestionState(validada, "devolver_validacao");
    expect(devolvida).toEqual(sug(SUGESTAO_STATUS.PENDENTE));
    const revalidada = nextSuggestionState(devolvida, "validar");
    expect(revalidada).toEqual(sug(SUGESTAO_STATUS.VALIDADA));
    expect(nextSuggestionState(revalidada, "aprovar_vaga")).toEqual(INCLUSAO);
  });
  it("pedir_ajuste -> sugestao_ajuste, SÓ antes de validar", () => {
    expect(nextSuggestionState(sug(SUGESTAO_STATUS.PENDENTE), "pedir_ajuste")).toEqual(sug(SUGESTAO_STATUS.AJUSTE));
    // Validada está na mesa do aprovador (regra do dono, 26/08): a área não
    // mexe mais na vaga — se faltar algo, pede uma escalação nova.
    expect(() => nextSuggestionState(sug(SUGESTAO_STATUS.VALIDADA), "pedir_ajuste")).toThrow(/Transição inválida/);
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
  it("ciclo completo: pedir ajuste -> reenviar -> validar -> aprovar", () => {
    const s1 = nextSuggestionState(sug(SUGESTAO_STATUS.PENDENTE), "pedir_ajuste");
    const s2 = nextSuggestionState(s1, "negar_reenviar");
    expect(s2).toEqual(sug(SUGESTAO_STATUS.PENDENTE));
    const s3 = nextSuggestionState(s2, "validar");
    expect(s3).toEqual(sug(SUGESTAO_STATUS.VALIDADA));
    expect(nextSuggestionState(s3, "aprovar_vaga")).toEqual(INCLUSAO);
  });
});

describe("nextSuggestionState — transições inválidas (erro pt-BR)", () => {
  it("validar quando já está com pedido de ajuste", () => {
    expect(() => nextSuggestionState(sug(SUGESTAO_STATUS.AJUSTE), "validar")).toThrow(/Transição inválida/);
  });
  it("a área não valida duas vezes: validar em sugestao_validada é inválido", () => {
    expect(() => nextSuggestionState(sug(SUGESTAO_STATUS.VALIDADA), "validar")).toThrow(/Transição inválida/);
  });
  it("bypass NÃO vale em sugestao_validada (lá o caminho é aprovar_vaga/reprovar_vaga)", () => {
    expect(() => nextSuggestionState(sug(SUGESTAO_STATUS.VALIDADA), "aprovar_direto_bypass")).toThrow(/Transição inválida/);
    expect(() => nextSuggestionState(sug(SUGESTAO_STATUS.VALIDADA), "reprovar_bypass")).toThrow(/Transição inválida/);
  });
  it("ações do aprovador sobre vaga NÃO validada são inválidas", () => {
    for (const a of ["aprovar_vaga", "reprovar_vaga", "devolver_validacao"] as const) {
      expect(() => nextSuggestionState(sug(SUGESTAO_STATUS.PENDENTE), a)).toThrow(/Transição inválida/);
      expect(() => nextSuggestionState(sug(SUGESTAO_STATUS.AJUSTE), a)).toThrow(/Transição inválida/);
      expect(() => nextSuggestionState(sug(SUGESTAO_STATUS.NEGADA), a)).toThrow(/Transição inválida/);
      expect(() => nextSuggestionState(INCLUSAO, a)).toThrow(/não está na etapa de Validação de Escala/);
    }
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
    expect(SUGGESTION_ACTIONS).toHaveLength(12);
  });
  it("em sugestao_validada: SÓ as ações do aprovador (a área não mexe mais)", () => {
    expect(availableSuggestionActions(sug(SUGESTAO_STATUS.VALIDADA)))
      .toEqual(["aprovar_vaga", "reprovar_vaga", "devolver_validacao"]);
  });
  it("todas as ações têm rótulo pt-BR", () => {
    for (const a of SUGGESTION_ACTIONS) {
      expect(SUGGESTION_ACTION_LABELS[a]).toBeTruthy();
    }
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
  it("decisões sobre a VAGA (não sobre um pedido) não mexem em pedido nenhum", () => {
    expect(requestStatusForAction("aprovar_vaga")).toBeNull();
    expect(requestStatusForAction("reprovar_vaga")).toBeNull();
    expect(requestStatusForAction("devolver_validacao")).toBeNull();
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

describe("pendingSeverity", () => {
  it("2 dias -> ok, 3 -> warn (STALLED_DAYS), 7 -> danger (DANGER_DAYS)", () => {
    expect(STALLED_DAYS).toBe(3);
    expect(DANGER_DAYS).toBe(7);
    expect(pendingSeverity(0)).toBe("ok");
    expect(pendingSeverity(2)).toBe("ok");
    expect(pendingSeverity(3)).toBe("warn");
    expect(pendingSeverity(6)).toBe("warn");
    expect(pendingSeverity(7)).toBe("danger");
    expect(pendingSeverity(30)).toBe("danger");
  });
});

describe("describeLastDecision", () => {
  const base: LastDecisionInfo = {
    requestId: "req-1", requestType: "ajuste", status: "reenviado_validacao",
    comment: null, byName: "Aprovador", at: "2026-08-18T12:00:00.000Z",
  };
  it("reajuste devolvido para a área -> warn, com o comentário no título", () => {
    expect(describeLastDecision({ ...base, comment: "Ajustei as datas" })).toEqual({
      title: "Devolvida pelo aprovador (reajuste): Ajustei as datas", tone: "warn",
    });
    expect(describeLastDecision(base).title).toBe("Devolvida pelo aprovador (reajuste)");
  });
  it("pedido de inclusão devolvido -> vaga criada pelo aprovador (warn)", () => {
    const r = describeLastDecision({ ...base, requestType: "inclusao", comment: "  " });
    expect(r.tone).toBe("warn");
    expect(r.title).toMatch(/pedido de inclusão devolvido/);
    expect(r.title).not.toMatch(/:\s*$/); // comentário só espaços não entra
  });
  it("pedido negado, vaga mantida -> danger", () => {
    expect(describeLastDecision({ ...base, requestType: "exclusao", status: "negado", comment: "Precisamos da vaga" })).toEqual({
      title: "Pedido negado, vaga mantida: Precisamos da vaga", tone: "danger",
    });
    expect(describeLastDecision({ ...base, requestType: "inclusao", status: "negado" })).toEqual({
      title: "Pedido de inclusão negado", tone: "danger",
    });
  });
  it("aprovado / reajustado -> ok; pendente -> info", () => {
    expect(describeLastDecision({ ...base, status: "aprovado" })).toEqual({ title: "Pedido de ajuste aprovado", tone: "ok" });
    expect(describeLastDecision({ ...base, status: "reajustado" }).tone).toBe("ok");
    expect(describeLastDecision({ ...base, status: "pendente" }).tone).toBe("info");
  });
});

describe("describeVagaDecision", () => {
  const base: LastVagaDecisionInfo = {
    action: "devolvida", comment: null, byName: "Aprovador", at: "2026-08-19T12:00:00.000Z",
  };
  it("devolvida -> warn, com o comentário do aprovador no título", () => {
    expect(describeVagaDecision({ ...base, comment: "Revise as datas" })).toEqual({
      title: "Devolvida pelo aprovador para nova validação: Revise as datas", tone: "warn",
    });
    expect(describeVagaDecision(base).title).toBe("Devolvida pelo aprovador para nova validação");
  });
  it("comentário só com espaços não entra no título", () => {
    const r = describeVagaDecision({ ...base, comment: "   " });
    expect(r.title).toBe("Devolvida pelo aprovador para nova validação");
    expect(r.title).not.toMatch(/:\s*$/);
  });
  it("reprovada -> danger; aprovada -> ok", () => {
    expect(describeVagaDecision({ ...base, action: "reprovada", comment: "Vaga duplicada" })).toEqual({
      // O título diz o próximo passo: reprovada volta para a área corrigir.
      title: "Reprovada pelo aprovador — corrija e valide de novo: Vaga duplicada", tone: "danger",
    });
    expect(describeVagaDecision({ ...base, action: "aprovada" })).toEqual({
      title: "Vaga aprovada pelo aprovador", tone: "ok",
    });
  });
});

// ---------------------------------------------------------------------------
// matchesCreatedFromRequest (server/scaling-validation.ts)
// ---------------------------------------------------------------------------
// A regra é pura, mas mora no server (junto de pickLastDecision, seu único
// consumidor). O módulo importa server/db.ts, que exige DATABASE_URL só para
// construir o Pool — nenhuma conexão é aberta em import. Daí o stub + import
// dinâmico.
process.env.DATABASE_URL ||= "postgres://vitest:vitest@localhost:5432/vitest";
const {
  matchesCreatedFromRequest, pickLastVagaDecision, pickLastDecision, commentFromLogDetails,
  VAGA_DECISION_LOG_ACTIONS, VAGA_DECISION_SKEW_MS,
} = await import("../server/scaling-validation");

describe("matchesCreatedFromRequest — vagas 2..N de um pedido de inclusão devolvido", () => {
  const AT = new Date("2026-08-18T12:00:00.000Z");
  // A vaga nasceu do pedido: o handler usa o MESMO Date em reviewedAt e suggestionSentAt.
  const vaga = {
    id: "vaga-2",
    eventId: "ev-1",
    functionId: "fn-1",
    suggestionSentAt: AT,
  };
  const pedido = {
    resolvedInclusionId: "vaga-1", // só a PRIMEIRA vaga do lote fica apontada
    requestType: "inclusao",
    status: "reenviado_validacao",
    eventId: "ev-1",
    functionId: "fn-1",
    reviewedAt: AT,
  };

  it("vínculo explícito: resolvedInclusionId aponta para a vaga", () => {
    expect(matchesCreatedFromRequest({ ...vaga, id: "vaga-1" }, pedido)).toBe(true);
    // …e nem precisa das demais pistas
    expect(matchesCreatedFromRequest(
      { id: "vaga-1", eventId: "outro", functionId: "outra", suggestionSentAt: null },
      pedido,
    )).toBe(true);
  });

  it("vagas 2..N casam por evento + função + suggestionSentAt == reviewedAt", () => {
    expect(matchesCreatedFromRequest(vaga, pedido)).toBe(true);
    expect(matchesCreatedFromRequest({ ...vaga, id: "vaga-7" }, pedido)).toBe(true);
  });

  it("aceita datas serializadas (ISO) dos dois lados", () => {
    expect(matchesCreatedFromRequest(
      { ...vaga, suggestionSentAt: AT.toISOString() },
      { ...pedido, reviewedAt: AT.toISOString() as any },
    )).toBe(true);
  });

  it("não casa vaga de outro evento / outra função", () => {
    expect(matchesCreatedFromRequest({ ...vaga, eventId: "ev-2" }, pedido)).toBe(false);
    expect(matchesCreatedFromRequest({ ...vaga, functionId: "fn-2" }, pedido)).toBe(false);
  });

  it("não casa por 1 milissegundo de diferença", () => {
    expect(matchesCreatedFromRequest(
      { ...vaga, suggestionSentAt: new Date(AT.getTime() + 1) },
      pedido,
    )).toBe(false);
  });

  it("só vale para pedido de INCLUSÃO resolvido como reenviado_validacao", () => {
    expect(matchesCreatedFromRequest(vaga, { ...pedido, requestType: "ajuste" })).toBe(false);
    expect(matchesCreatedFromRequest(vaga, { ...pedido, requestType: "exclusao" })).toBe(false);
    expect(matchesCreatedFromRequest(vaga, { ...pedido, status: "negado" })).toBe(false);
    expect(matchesCreatedFromRequest(vaga, { ...pedido, status: "aprovado" })).toBe(false);
    expect(matchesCreatedFromRequest(vaga, { ...pedido, status: "pendente" })).toBe(false);
  });

  it("datas ausentes nunca casam (null == null não é vínculo)", () => {
    expect(matchesCreatedFromRequest({ ...vaga, suggestionSentAt: null }, { ...pedido, reviewedAt: null })).toBe(false);
    expect(matchesCreatedFromRequest({ ...vaga, suggestionSentAt: null }, pedido)).toBe(false);
    expect(matchesCreatedFromRequest(vaga, { ...pedido, reviewedAt: null })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// pickLastVagaDecision (server/scaling-validation.ts)
// ---------------------------------------------------------------------------
// A decisão do aprovador sobre a VAGA (aprovar/reprovar/devolver) não cria
// pedido: autor, comentário e instante ficam em team_inclusion_logs.

describe("commentFromLogDetails", () => {
  it("volta null quando o log não tem comentário", () => {
    expect(commentFromLogDetails("Vaga devolvida pelo aprovador para nova validação da área")).toBeNull();
    expect(commentFromLogDetails(null)).toBeNull();
    expect(commentFromLogDetails("")).toBeNull();
  });
  it("recorta o comentário depois da marca", () => {
    expect(commentFromLogDetails("Vaga devolvida. Comentário: Revise as datas")).toBe("Revise as datas");
  });
  it("comentário que contém a própria marca fica inteiro", () => {
    expect(commentFromLogDetails("Vaga devolvida. Comentário: veja o que ele disse. Comentário: errado"))
      .toBe("veja o que ele disse. Comentário: errado");
  });
  it("comentário vazio/só espaços vira null", () => {
    expect(commentFromLogDetails("Vaga devolvida. Comentário:    ")).toBeNull();
  });
});

describe("pickLastVagaDecision — decisão da vaga vinda dos logs", () => {
  const SENT = new Date("2026-08-19T12:00:00.000Z");
  const vaga = { id: "vaga-1", suggestionSentAt: SENT };
  const log = (over: Partial<any> = {}) => ({
    teamInclusionId: "vaga-1",
    action: "suggestion_returned",
    details: "Vaga devolvida pelo aprovador para nova validação da área. Comentário: Revise as datas",
    userName: "Ana Aprovadora",
    createdAt: SENT,
    ...over,
  });

  it("as ações lidas são exatamente as três decisões de vaga", () => {
    expect([...VAGA_DECISION_LOG_ACTIONS].sort())
      .toEqual(["suggestion_approved", "suggestion_rejected", "suggestion_returned"]);
  });

  it("devolução: mesmo instante do reset de suggestionSentAt ainda conta", () => {
    expect(pickLastVagaDecision(vaga, [log()])).toEqual({
      action: "devolvida",
      comment: "Revise as datas",
      byName: "Ana Aprovadora",
      at: SENT.toISOString(),
    });
  });

  it("aceita a folga de relógio entre o app (suggestionSentAt) e o banco (createdAt)", () => {
    const antes = new Date(SENT.getTime() - VAGA_DECISION_SKEW_MS + 1);
    expect(pickLastVagaDecision(vaga, [log({ createdAt: antes })])?.action).toBe("devolvida");
  });

  it("decisão anterior ao suggestionSentAt atual já foi superada", () => {
    const velho = new Date(SENT.getTime() - VAGA_DECISION_SKEW_MS - 1);
    expect(pickLastVagaDecision(vaga, [log({ createdAt: velho })])).toBeNull();
  });

  it("fica com a decisão mais recente", () => {
    const nova = new Date(SENT.getTime() + 60_000);
    const found = pickLastVagaDecision(vaga, [
      log(),
      log({ action: "suggestion_rejected", details: "Vaga reprovada. Comentário: Duplicada", createdAt: nova }),
    ]);
    expect(found).toEqual({
      action: "reprovada", comment: "Duplicada", byName: "Ana Aprovadora", at: nova.toISOString(),
    });
  });

  it("ignora log de outra vaga e ação que não é decisão de vaga", () => {
    expect(pickLastVagaDecision(vaga, [log({ teamInclusionId: "vaga-2" })])).toBeNull();
    expect(pickLastVagaDecision(vaga, [log({ action: "suggestion_validated" })])).toBeNull();
    expect(pickLastVagaDecision(vaga, [])).toBeNull();
  });

  it("aprovação em lote (log sem comentário) devolve comment null", () => {
    const found = pickLastVagaDecision(vaga, [log({
      action: "suggestion_approved",
      details: "Vaga aprovada pelo aprovador após validação da área — virou Inclusão",
    })]);
    expect(found).toMatchObject({ action: "aprovada", comment: null });
  });

  it("aceita datas serializadas (ISO) dos dois lados", () => {
    const found = pickLastVagaDecision(
      { id: "vaga-1", suggestionSentAt: SENT.toISOString() },
      [log({ createdAt: SENT.toISOString() })],
    );
    expect(found?.at).toBe(SENT.toISOString());
  });

  it("vaga sem suggestionSentAt aceita qualquer decisão registrada", () => {
    const found = pickLastVagaDecision({ id: "vaga-1", suggestionSentAt: null }, [log()]);
    expect(found?.action).toBe("devolvida");
  });
});

// ---------------------------------------------------------------------------
// Piso do estado atual: revalidar apaga a decisão que a área JÁ RESOLVEU
// ---------------------------------------------------------------------------
// `/validate` não reseta `suggestionSentAt` (só a devolução reseta) — sem o
// piso em `validatedAt` a linha mostrava "Validada pela área — aguardando
// aprovação" E "Devolvida pelo aprovador" ao mesmo tempo, para sempre.

describe("pickLastVagaDecision — devolução some quando a área revalida", () => {
  const DEVOLVIDA_EM = new Date("2026-08-19T12:00:00.000Z");
  const REVALIDADA_EM = new Date("2026-08-19T18:00:00.000Z");
  // A devolução resetou suggestionSentAt para o próprio instante da devolução.
  const base = { id: "vaga-1", suggestionSentAt: DEVOLVIDA_EM };
  const devolucao = {
    teamInclusionId: "vaga-1",
    action: "suggestion_returned",
    details: "Vaga devolvida pelo aprovador para nova validação da área. Comentário: Revise as datas",
    userName: "Ana Aprovadora",
    createdAt: DEVOLVIDA_EM,
  };

  it("devolvida e AINDA pendente: a área precisa ver a devolução", () => {
    const found = pickLastVagaDecision(
      { ...base, status: SUGESTAO_STATUS.PENDENTE, validatedAt: null },
      [devolucao],
    );
    expect(found?.action).toBe("devolvida");
    expect(found?.comment).toBe("Revise as datas");
  });

  it("devolvida e REVALIDADA: nenhuma decisão aparece", () => {
    expect(pickLastVagaDecision(
      { ...base, status: SUGESTAO_STATUS.VALIDADA, validatedAt: REVALIDADA_EM },
      [devolucao],
    )).toBeNull();
  });

  it("validação ANTERIOR à devolução não esconde nada (o piso pega o mais recente)", () => {
    const validadaAntes = new Date(DEVOLVIDA_EM.getTime() - 3_600_000);
    expect(pickLastVagaDecision(
      { ...base, status: SUGESTAO_STATUS.PENDENTE, validatedAt: validadaAntes },
      [devolucao],
    )?.action).toBe("devolvida");
  });

  it("validada sem carimbo validatedAt (linha antiga) cai no suggestionSentAt", () => {
    expect(pickLastVagaDecision(
      { ...base, status: SUGESTAO_STATUS.VALIDADA, validatedAt: null },
      [devolucao],
    )?.action).toBe("devolvida");
  });

  it("aceita datas serializadas (ISO) no validatedAt", () => {
    expect(pickLastVagaDecision(
      { ...base, status: SUGESTAO_STATUS.VALIDADA, validatedAt: REVALIDADA_EM.toISOString() },
      [devolucao],
    )).toBeNull();
  });
});

describe("pickLastDecision — pedido reenviado some quando a área revalida", () => {
  const DEVOLVIDO_EM = new Date("2026-08-19T12:00:00.000Z");
  const REVALIDADA_EM = new Date("2026-08-19T18:00:00.000Z");
  const vaga = { id: "vaga-1", eventId: "ev-1", functionId: "fn-1", suggestionSentAt: DEVOLVIDO_EM };
  const pedido = {
    id: "req-1",
    teamInclusionId: "vaga-1",
    requestType: "ajuste",
    status: "reajustado",
    reviewComment: "Confira as diárias",
    reviewedByName: "Ana Aprovadora",
    reviewedAt: DEVOLVIDO_EM,
    updatedAt: DEVOLVIDO_EM,
    createdAt: DEVOLVIDO_EM,
    resolvedInclusionId: null,
    eventId: "ev-1",
    functionId: "fn-1",
  } as any;

  it("vaga ainda pendente: a decisão do pedido explica o estado", () => {
    const found = pickLastDecision({ ...vaga, status: SUGESTAO_STATUS.PENDENTE, validatedAt: null }, [pedido]);
    expect(found).toMatchObject({ requestId: "req-1", status: "reajustado", comment: "Confira as diárias" });
  });

  it("área revalidou: a decisão do pedido não aparece mais", () => {
    expect(pickLastDecision(
      { ...vaga, status: SUGESTAO_STATUS.VALIDADA, validatedAt: REVALIDADA_EM },
      [pedido],
    )).toBeNull();
  });
});

describe("daysAwaitingApproval — o relógio da vaga validada é o validatedAt", () => {
  const NOW = new Date("2026-08-20T12:00:00.000Z");
  it("conta desde a validação da área, não desde o envio da logística", () => {
    const validatedAt = new Date("2026-08-18T12:00:00.000Z");
    expect(daysAwaitingApproval({ validatedAt, daysPending: 6 }, NOW)).toBe(2);
  });
  it("sem validatedAt cai no daysPending que veio do servidor", () => {
    expect(daysAwaitingApproval({ validatedAt: null, daysPending: 6 }, NOW)).toBe(6);
    expect(daysAwaitingApproval({}, NOW)).toBe(0);
  });
  it("aceita ISO e nunca devolve negativo", () => {
    expect(daysAwaitingApproval({ validatedAt: "2026-08-20T06:00:00.000Z" }, NOW)).toBe(0);
    expect(daysAwaitingApproval({ validatedAt: "2026-08-25T06:00:00.000Z" }, NOW)).toBe(0);
  });
});

// ── Cancelar envio (desfazer o /bulk de um evento inteiro) ──────────────────
// Regra do usuário (19/08): remove TODAS as vagas do evento que ainda estão no
// fluxo de sugestão — inclusive as que a área já validou e as com pedido em
// aberto. Nunca o que já virou Inclusão nem o que foi negado.

describe("isCancelableSuggestion — o que o Cancelar envio remove", () => {
  it("remove pendente, validada e com pedido de ajuste", () => {
    expect(isCancelableSuggestion(sug(SUGESTAO_STATUS.PENDENTE))).toBe(true);
    expect(isCancelableSuggestion(sug(SUGESTAO_STATUS.VALIDADA))).toBe(true);
    expect(isCancelableSuggestion(sug(SUGESTAO_STATUS.AJUSTE))).toBe(true);
  });
  it("NÃO remove o que já virou Inclusão (phase 'inclusao')", () => {
    expect(isCancelableSuggestion(INCLUSAO)).toBe(false);
    // nem uma linha com status de sugestão que já saiu da fase (dado antigo)
    expect(isCancelableSuggestion({ phase: "inclusao", status: SUGESTAO_STATUS.VALIDADA })).toBe(false);
  });
  it("NÃO remove as negadas (já saíram do fluxo, ficam no histórico)", () => {
    expect(isCancelableSuggestion(sug(SUGESTAO_STATUS.NEGADA))).toBe(false);
  });
  it("NÃO remove vaga já excluída nem entrada vazia", () => {
    expect(isCancelableSuggestion({ ...sug(SUGESTAO_STATUS.PENDENTE), deletedAt: new Date() })).toBe(false);
    expect(isCancelableSuggestion({ ...sug(SUGESTAO_STATUS.VALIDADA), deletedAt: "2026-08-19T10:00:00.000Z" })).toBe(false);
    expect(isCancelableSuggestion(null)).toBe(false);
    expect(isCancelableSuggestion(undefined)).toBe(false);
  });
  it("a lista de status cancelável não inclui negada nem a aprovada legada", () => {
    expect([...CANCELABLE_SUGESTAO_STATUS]).toEqual([
      SUGESTAO_STATUS.PENDENTE, SUGESTAO_STATUS.VALIDADA, SUGESTAO_STATUS.AJUSTE,
    ]);
  });
});

describe("summarizeCancelableSuggestions — resumo mostrado na confirmação", () => {
  const rows = [
    sug(SUGESTAO_STATUS.PENDENTE),
    sug(SUGESTAO_STATUS.PENDENTE),
    sug(SUGESTAO_STATUS.VALIDADA),
    sug(SUGESTAO_STATUS.AJUSTE),
    sug(SUGESTAO_STATUS.NEGADA),                       // fora: já saiu do fluxo
    INCLUSAO,                                          // fora: virou Inclusão
    { ...sug(SUGESTAO_STATUS.VALIDADA), deletedAt: new Date() }, // fora: já excluída
  ];
  it("conta só o que sai, agrupado por etapa", () => {
    expect(summarizeCancelableSuggestions(rows)).toEqual({
      total: 4, aguardando: 2, validadas: 1, comPedido: 1,
    });
  });
  it("o total é a soma dos grupos (nada é contado duas vezes)", () => {
    const s = summarizeCancelableSuggestions(rows);
    expect(s.aguardando + s.validadas + s.comPedido).toBe(s.total);
  });
  it("lista vazia / ausente vira resumo zerado", () => {
    const zero = { total: 0, aguardando: 0, validadas: 0, comPedido: 0 };
    expect(summarizeCancelableSuggestions([])).toEqual(zero);
    expect(summarizeCancelableSuggestions(null)).toEqual(zero);
    expect(summarizeCancelableSuggestions([INCLUSAO, sug(SUGESTAO_STATUS.NEGADA)])).toEqual(zero);
  });
});

describe("isRequestCanceledByCancelSend — pedidos encerrados junto", () => {
  const removidas = new Set(["vaga-1", "vaga-2"]);
  const pendente = (teamInclusionId: string | null) => ({ status: CHANGE_REQUEST_STATUS.PENDENTE, teamInclusionId });

  it("encerra o pedido pendente de uma vaga removida", () => {
    expect(isRequestCanceledByCancelSend(pendente("vaga-1"), removidas)).toBe(true);
  });
  it("encerra o pedido de INCLUSÃO pendente (sem vaga): pede vaga nova num envio que sumiu", () => {
    expect(isRequestCanceledByCancelSend(pendente(null), removidas)).toBe(true);
  });
  it("não encerra pedido de vaga que não saiu (ex.: já virou Inclusão)", () => {
    expect(isRequestCanceledByCancelSend(pendente("vaga-9"), removidas)).toBe(false);
  });
  it("não mexe em pedido já decidido — histórico não é reescrito", () => {
    for (const status of [CHANGE_REQUEST_STATUS.APROVADO, CHANGE_REQUEST_STATUS.NEGADO,
      CHANGE_REQUEST_STATUS.REAJUSTADO, CHANGE_REQUEST_STATUS.REENVIADO_VALIDACAO]) {
      expect(isRequestCanceledByCancelSend({ status, teamInclusionId: "vaga-1" }, removidas)).toBe(false);
      expect(isRequestCanceledByCancelSend({ status, teamInclusionId: null }, removidas)).toBe(false);
    }
    expect(isRequestCanceledByCancelSend(null, removidas)).toBe(false);
  });
  it("o pedido encerrado vai para um status que já existe no enum", () => {
    expect(CHANGE_REQUEST_STATUS_VALUES).toContain(CANCEL_SEND_REQUEST_STATUS);
    expect(CANCEL_SEND_REQUEST_STATUS).toBe(CHANGE_REQUEST_STATUS.NEGADO);
    expect(CANCEL_SEND_REQUEST_COMMENT).toMatch(/cancelad/i);
  });
});

describe("isRealYmd — datas de calendário REAIS (round-trip UTC)", () => {
  it("aceita datas que existem", () => {
    expect(isRealYmd("2026-01-31")).toBe(true);
    expect(isRealYmd("2026-02-28")).toBe(true);
    expect(isRealYmd("2028-02-29")).toBe(true); // bissexto
    expect(isRealYmd("2026-12-31")).toBe(true);
  });
  it("rejeita datas que o regex aceita mas não existem", () => {
    expect(isRealYmd("2027-02-29")).toBe(false); // 2027 não é bissexto
    expect(isRealYmd("2026-09-31")).toBe(false); // setembro tem 30
    expect(isRealYmd("2026-13-01")).toBe(false);
    expect(isRealYmd("2026-00-10")).toBe(false);
    expect(isRealYmd("2026-04-31")).toBe(false);
  });
  it("rejeita formato fora de AAAA-MM-DD", () => {
    expect(isRealYmd("26-01-01")).toBe(false);
    expect(isRealYmd("2026/01/01")).toBe(false);
    expect(isRealYmd("")).toBe(false);
  });
  it("ymdSchema devolve 'Data inexistente' para data impossível", () => {
    const r = ymdSchema.safeParse("2027-02-29");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe("Data inexistente");
    expect(ymdSchema.safeParse("2026-06-15").success).toBe(true);
  });
});

describe("isValidHhmm — horários reais (00:00–23:59)", () => {
  it("aceita horários válidos", () => {
    expect(isValidHhmm("00:00")).toBe(true);
    expect(isValidHhmm("23:59")).toBe(true);
    expect(isValidHhmm("07:30")).toBe(true);
  });
  it("rejeita o que o regex sozinho deixaria passar", () => {
    expect(isValidHhmm("24:00")).toBe(false);
    expect(isValidHhmm("23:60")).toBe(false);
    expect(isValidHhmm("99:99")).toBe(false);
  });
  it("rejeita formato fora de HH:MM", () => {
    expect(isValidHhmm("7:30")).toBe(false);
    expect(isValidHhmm("0730")).toBe(false);
  });
  it("hhmmSchema rejeita '24:00' com mensagem pt-BR", () => {
    const r = hhmmSchema.safeParse("24:00");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toMatch(/Horário inexistente/);
  });
});

describe("parseProposedChanges — datas/horários reais e tetos de entrada", () => {
  it("rejeita workDays com data inexistente", () => {
    expect(() => parseProposedChanges({ v: 1, workDays: ["2027-02-29"], quantity: 1 }, "inclusao"))
      .toThrow(/Data inexistente/);
    expect(() => parseProposedChanges({ v: 1, workDays: ["2026-09-31"] }, "ajuste"))
      .toThrow(/Data inexistente/);
  });
  it("rejeita flightDepartureDate inexistente e horário 24:00", () => {
    expect(() => parseProposedChanges({ v: 1, flightDepartureDate: "2026-11-31" }, "ajuste"))
      .toThrow(/Data inexistente/);
    expect(() => parseProposedChanges({ v: 1, flightDepartureSuggestedTime: "24:00" }, "ajuste"))
      .toThrow(/Horário inexistente/);
  });
  it("quantity tem teto de 50 vagas por pedido", () => {
    expect(() => parseProposedChanges({ v: 1, workDays: ["2026-06-01"], quantity: 51 }, "inclusao"))
      .toThrow(/máxima é 50/);
    const ok = parseProposedChanges({ v: 1, workDays: ["2026-06-01"], quantity: 50 }, "inclusao");
    expect(ok.quantity).toBe(50);
  });
  it("observations tem teto de 1000 caracteres", () => {
    expect(() => parseProposedChanges({ v: 1, observations: "x".repeat(1001) }, "ajuste"))
      .toThrow(/máximo 1000/);
    const ok = parseProposedChanges({ v: 1, observations: "x".repeat(1000) }, "ajuste");
    expect(ok.observations).toHaveLength(1000);
  });
});

describe("VAGA_STATE_CHANGED_MSG — corrida perdida vira 409 com texto pt-BR", () => {
  it("mensagem estável (o servidor a usa para mapear o 409)", () => {
    expect(VAGA_STATE_CHANGED_MSG).toBe("A vaga mudou de estado — recarregue a lista");
  });
});

describe("aprovador padrão do sistema (regra do dono, 26/08)", () => {
  it("a chave de system_settings é estável (migração + servidor + tela usam a mesma)", () => {
    expect(DEFAULT_APPROVER_SETTING_KEY).toBe("escala_aprovador_padrao");
  });

  it("função SEM aprovador cadastrado: o aprovador padrão decide", () => {
    const ctx = { roleForFunction: null, isDefaultApprover: true, functionHasApprover: false };
    expect(canApproveInFunction(ctx)).toBe(true);
    expect(approverSource(ctx)).toBe("padrao");
    expect(usesDefaultApprover(ctx)).toBe(true);
  });

  it("função SEM aprovador cadastrado: quem NÃO é o padrão continua sem decidir", () => {
    const ctx = { roleForFunction: null, isDefaultApprover: false, functionHasApprover: false };
    expect(canApproveInFunction(ctx)).toBe(false);
    expect(approverSource(ctx)).toBeNull();
  });

  it("validador da função não vira aprovador por causa do padrão", () => {
    expect(canApproveInFunction({ roleForFunction: "validador", isDefaultApprover: false, functionHasApprover: false })).toBe(false);
  });

  it("função COM aprovador cadastrado: o cadastrado decide igual a antes (origem 'cadastro')", () => {
    const ctx = { roleForFunction: "aprovador" as const, isDefaultApprover: false, functionHasApprover: true };
    expect(canApproveInFunction(ctx)).toBe(true);
    expect(approverSource(ctx)).toBe("cadastro");
    expect(usesDefaultApprover(ctx)).toBe(false);
    // O comportamento antigo continua valendo palavra por palavra.
    expect(canApproveRequest(ctx.roleForFunction, false)).toBe(true);
  });

  it("o padrão é aprovador GLOBAL: decide também em função que já tem aprovador", () => {
    expect(canApproveInFunction({ roleForFunction: null, isDefaultApprover: true, functionHasApprover: true })).toBe(true);
  });

  it("admin decide sempre e a origem é 'admin' (inalterado)", () => {
    for (const hasApprover of [true, false]) {
      const ctx = { roleForFunction: null, isAdmin: true, isDefaultApprover: false, functionHasApprover: hasApprover };
      expect(canApproveInFunction(ctx)).toBe(true);
      expect(approverSource(ctx)).toBe("admin");
    }
  });

  it("contexto vazio não dá permissão a ninguém", () => {
    expect(canApproveInFunction({})).toBe(false);
    expect(approverSource({})).toBeNull();
    // Sem saber se a função tem aprovador, não afirma que ela usa o padrão.
    expect(usesDefaultApprover({})).toBe(false);
  });
});
