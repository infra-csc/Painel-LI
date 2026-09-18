import { describe, it, expect } from "vitest";
import { descreverLog, formatarValor, resumoParaGravar, type NomesParaLog } from "./log-auditoria";

const nomes: NomesParaLog = {
  evento: (id) => ({ ev1: "Girl Power Brasília - 2026" } as Record<string, string>)[id],
  funcao: (id) => ({ f1: "produção" } as Record<string, string>)[id],
  colaborador: (id) => ({ c1: "Maria Silva" } as Record<string, string>)[id],
  usuario: (id) => ({ u1: "Edney Siqueira" } as Record<string, string>)[id],
};

describe("log de auditoria em português (18/09)", () => {
  it("evento marcado como excluído vira “excluiu o evento”, com antes → depois", () => {
    const d = descreverLog({
      action: "update", entityType: "event", entityName: "Girl Power Brasília - 2026",
      previousData: JSON.stringify({ status: "planejado", createdAt: "2026-08-03T19:39:10.571Z" }),
      newData: JSON.stringify({ status: "excluído", createdAt: "2026-08-03T19:39:10.571Z" }),
    }, nomes);
    expect(d.frase).toBe("excluiu o evento “Girl Power Brasília - 2026”");
    expect(d.acao).toBe("Exclusão");
    expect(d.tom).toBe("excluir");
    // createdAt igual não aparece — e nem é campo visível.
    expect(d.mudancas).toEqual([{ campo: "Situação", antes: "Planejado", depois: "Excluído" }]);
    expect(d.resumo).toBe("Situação: Planejado → Excluído");
  });

  it("reativar um evento excluído tem verbo próprio", () => {
    const d = descreverLog({
      action: "update", entityType: "event", entityName: "X",
      previousData: JSON.stringify({ status: "excluído" }), newData: JSON.stringify({ status: "planejado" }),
    });
    expect(d.frase).toBe("reativou o evento “X”");
  });

  it("vaga: número mesmo com nome gravado quebrado, e contexto com nomes no lugar de ids", () => {
    const d = descreverLog({
      action: "update", entityType: "team_inclusion", entityName: "Inclusão #undefined",
      previousData: JSON.stringify({ collaboratorId: null, dailyValue: 25000, eventId: "ev1", functionId: "f1", inclusionNumber: 3748 }),
      newData: JSON.stringify({ collaboratorId: "c1", dailyValue: 30000, eventId: "ev1", functionId: "f1", inclusionNumber: 3748 }),
    }, nomes);
    expect(d.frase).toBe("alterou a vaga #3748");
    expect(d.contexto).toEqual(["Girl Power Brasília - 2026", "produção", "Maria Silva"]);
    expect(d.mudancas).toEqual([
      { campo: "Colaborador", antes: "—", depois: "Maria Silva" },
      { campo: "Valor da diária", antes: "R$ 250,00", depois: "R$ 300,00" },
    ]);
  });

  it("criação lista os dados preenchidos, sem os técnicos", () => {
    const d = descreverLog({
      action: "create", entityType: "team_inclusion", entityName: "Inclusão #3750",
      newData: JSON.stringify({ id: "x", inclusionNumber: 3750, status: "planejado", needsTicket: true, createdAt: "2026-08-03T19:00:00Z", rowOrder: 3 }),
    });
    expect(d.frase).toBe("criou a vaga #3750");
    expect(d.dados.map((x) => x.campo)).toEqual(["Nº da vaga", "Situação", "Precisa de passagem"]);
    expect(d.dados.find((x) => x.campo === "Precisa de passagem")?.valor).toBe("Sim");
    expect(d.resumo).toBe("3 campos preenchidos");
  });

  it("verbos com “de” se juntam ao alvo", () => {
    const d = descreverLog({ action: "confirm", entityType: "team_inclusion", entityName: "Inclusão #10", newData: "{}" });
    expect(d.frase).toBe("confirmou a escalação da vaga #10");
  });

  it("casos especiais: comentário no evento, sugestões enviadas, responsável de função", () => {
    expect(descreverLog({ action: "create", entityType: "event_comment", entityName: "event_comment", newData: JSON.stringify({ eventId: "ev1", content: "oi" }) }, nomes).frase)
      .toBe("comentou no evento “Girl Power Brasília - 2026”");
    expect(descreverLog({ action: "suggestion_sent", entityType: "team_inclusion", newData: JSON.stringify({ count: 12, eventName: "Girl Power Brasília - 2026" }) }).frase)
      .toBe("enviou 12 vagas para a Validação de Escala — evento “Girl Power Brasília - 2026”");
    expect(descreverLog({ action: "create", entityType: "scaling_function_manager", entityName: "scaling_function_manager", newData: JSON.stringify({ userId: "u1", functionId: "f1", role: "validador" }) }, nomes).frase)
      .toBe("cadastrou Edney Siqueira como validador da função “produção”");
  });

  it("ação, módulo ou campo desconhecido: português genérico, nunca o código (nada em inglês)", () => {
    const d = descreverLog({
      action: "something_new", entityType: "brand_new_thing", entityName: "Y",
      previousData: JSON.stringify({ someField: "a", _userId: "u" }), newData: JSON.stringify({ someField: "b", _userId: "v" }),
    });
    expect(d.acao).toBe("Outra ação");
    expect(d.modulo).toBe("Outro registro");
    expect(d.frase).toBe("registrou uma ação no registro “Y”");
    // _userId é interno e some; o campo sem nome vira "Outro campo".
    expect(d.mudancas).toEqual([{ campo: "Outro campo", antes: "a", depois: "b" }]);
  });

  it("nada em inglês: reativar, configurações, códigos, aeroportos e cidades", () => {
    expect(descreverLog({ action: "reactivate", entityType: "team_inclusion", entityName: "Inclusão #9" }).frase).toBe("reativou a vaga #9");
    const cfg = descreverLog({
      action: "update", entityType: "system_settings",
      previousData: JSON.stringify({ default_daily_value_weekday: 25000 }), newData: JSON.stringify({ default_daily_value_weekday: 27000 }),
    });
    expect(cfg.mudancas).toEqual([{ campo: "Diária padrão (dia útil)", antes: "R$ 250,00", depois: "R$ 270,00" }]);
    expect(formatarValor("atendimentoTipo", "executivo_contas")).toBe("Executivo de Contas");
    expect(formatarValor("transportModeIda", "onibus")).toBe("Ônibus");
    expect(formatarValor("collaboratorType", "casa")).toBe("Da casa");
    expect(formatarValor("status", "reenviado_validacao")).toBe("Reenviado para validação");
    expect(formatarValor("status", "algum_codigo_novo")).toBe("Algum codigo novo");
    expect(formatarValor("role", "validador")).toBe("Validador");
    expect(formatarValor("departureAirport", "gru")).toBe("GRU");
    expect(formatarValor("departureCityDestination", "recife")).toBe("Recife");
    expect(formatarValor("reason", "stands")).toBe("stands"); // texto livre não é mexido
  });

  it("formata datas, horários, perfis e listas", () => {
    expect(formatarValor("startDate", "2026-11-04")).toBe("04/11/2026");
    expect(formatarValor("reviewedAt", "2026-09-15T19:51:45.656Z")).toBe("15/09/2026 às 16:51");
    expect(formatarValor("role", "purchasing")).toBe("Compras");
    expect(formatarValor("attachmentIds", ["a", "b"])).toBe("2 arquivos");
    expect(formatarValor("status", "sugestao_pendente")).toBe("Aguardando validação da área");
  });

  it("ajustes da amostra real: “de uma vaga”, gestor por nome, códigos que não são nome", () => {
    expect(descreverLog({ action: "suggestion_send_canceled", entityType: "team_inclusion", entityName: "Inclusão #undefined", newData: "{}" }).frase)
      .toBe("cancelou o envio de uma vaga");
    const g = descreverLog({
      action: "approve_production", entityType: "team_inclusion", entityName: "Inclusão #1",
      previousData: JSON.stringify({ approvedByProduction: null }), newData: JSON.stringify({ approvedByProduction: "u1" }),
    }, nomes);
    expect(g.mudancas[0]).toEqual({ campo: "Aprovada pelo gestor", antes: "—", depois: "Edney Siqueira" });
    expect(descreverLog({ action: "emitir", entityType: "ticket", entityName: "Passagem #14917bcf" }).frase).toBe("marcou como emitida a passagem");
    expect(descreverLog({
      action: "create", entityType: "budget_actual", entityName: "Prestação #44c70432",
      newData: JSON.stringify({ collaboratorId: "c1", eventId: "ev1" }),
    }, nomes).frase).toBe("criou a prestação de contas “Maria Silva”");
    expect(formatarValor("status", "reajustado")).toBe("Devolvido para reajuste");
  });

  it("resumo que o servidor grava fala português e ignora os técnicos", () => {
    expect(resumoParaGravar("update", ["status", "createdAt", "updatedAt"])).toBe("Alterou: Situação");
    expect(resumoParaGravar("create", ["id", "name"])).toBe("Registro criado");
  });
});
