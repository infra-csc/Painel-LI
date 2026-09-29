/**
 * Validação de Escala — observação opcional de quem valida (24/09).
 *
 * `POST /api/scaling-suggestions/validate` aceita `validationNote` (um texto
 * para todo o lote). Cobre: gravação e leitura nos GETs que o aprovador usa,
 * o log com a linha "Observação:", os limites (1000 caracteres, só espaços) e
 * o reset quando a vaga volta para a área (devolvida pelo aprovador).
 *
 * Rodar: `npm run test:rotas` (ou `npx vitest run server/test`).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  agenteLogado,
  criarApp,
  criarEvento,
  criarFuncao,
  criarVaga,
  mutacao,
  type Contexto,
  type TestAgent,
} from "./harness";

let ctx: Contexto;

beforeAll(async () => {
  ctx = await criarApp();
});

const DETALHE_FIXO = "Vaga validada pela área — segue para aprovação do aprovador";

/** Usuário de área cadastrado como VALIDADOR da função (scaling_function_managers). */
async function validadorDe(functionId: string): Promise<{ agent: TestAgent; userId: string }> {
  const { agent, user } = await agenteLogado("function_area");
  await ctx.storage.addScalingManager({ functionId, userId: user.id, role: "validador" });
  return { agent, userId: user.id };
}

/** Vaga em `sugestao_pendente` num evento futuro (padrão do harness). */
async function vagaPendente(o: { eventId: string; functionId: string; userId: string }) {
  return criarVaga({ ...o, status: "sugestao_pendente", phase: "sugestao" });
}

async function logsDe(vagaId: string) {
  return ctx.storage.getTeamInclusionLogs(vagaId);
}

describe("POST /api/scaling-suggestions/validate — observação da validação", () => {
  it("com observação → 200, gravada na vaga, visível nos GETs do aprovador e no log", async () => {
    const evento = await criarEvento();
    const funcao = await criarFuncao();
    const { agent, userId } = await validadorDe(funcao.id);
    const vaga = await vagaPendente({ eventId: evento.id, functionId: funcao.id, userId });
    const nota = "Confirmar se a diária inclui o deslocamento — combinado com o produtor.";

    const res = await mutacao(agent.post("/api/scaling-suggestions/validate"))
      .send({ inclusionIds: [vaga.id], validationNote: `  ${nota}  ` });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: [vaga.id], skipped: [] });

    // Banco: estado + carimbo + observação (já sem os espaços das pontas).
    const noBanco = await ctx.storage.getTeamInclusion(vaga.id);
    expect(noBanco?.status).toBe("sugestao_validada");
    expect(noBanco?.validatedBy).toBe(userId);
    expect(noBanco?.validationNote).toBe(nota);

    // Lista da Validação/Aprovação (select explícito do storage).
    const lista = await agent.get(`/api/scaling-suggestions?eventId=${evento.id}`);
    expect(lista.status).toBe(200);
    const linha = (lista.body as Array<{ id: string; validationNote: string | null }>).find((r) => r.id === vaga.id);
    expect(linha?.validationNote).toBe(nota);

    // Vaga pelo id (usada pela Aprovação para reajustar).
    const uma = await agent.get(`/api/team-inclusions/${vaga.id}`);
    expect(uma.status).toBe(200);
    expect(uma.body.validationNote).toBe(nota);

    // Histórico da vaga: texto fixo + linha própria da observação.
    const log = (await logsDe(vaga.id)).find((l) => l.action === "suggestion_validated");
    expect(log?.details).toBe(`${DETALHE_FIXO}\nObservação: ${nota}`);
  });

  it("sem observação → validationNote null e log sem a linha 'Observação:'", async () => {
    const evento = await criarEvento();
    const funcao = await criarFuncao();
    const { agent, userId } = await validadorDe(funcao.id);
    const vaga = await vagaPendente({ eventId: evento.id, functionId: funcao.id, userId });

    const res = await mutacao(agent.post("/api/scaling-suggestions/validate")).send({ inclusionIds: [vaga.id] });
    expect(res.status).toBe(200);
    expect(res.body.ok).toEqual([vaga.id]);

    const noBanco = await ctx.storage.getTeamInclusion(vaga.id);
    expect(noBanco?.status).toBe("sugestao_validada");
    expect(noBanco?.validationNote).toBeNull();

    const log = (await logsDe(vaga.id)).find((l) => l.action === "suggestion_validated");
    expect(log?.details).toBe(DETALHE_FIXO);
    expect(log?.details).not.toContain("Observação:");
  });

  it("observação só com espaços → gravada como null", async () => {
    const evento = await criarEvento();
    const funcao = await criarFuncao();
    const { agent, userId } = await validadorDe(funcao.id);
    const vaga = await vagaPendente({ eventId: evento.id, functionId: funcao.id, userId });

    const res = await mutacao(agent.post("/api/scaling-suggestions/validate"))
      .send({ inclusionIds: [vaga.id], validationNote: "   \n\t  " });
    expect(res.status).toBe(200);
    expect(res.body.ok).toEqual([vaga.id]);

    const noBanco = await ctx.storage.getTeamInclusion(vaga.id);
    expect(noBanco?.validationNote).toBeNull();
    const log = (await logsDe(vaga.id)).find((l) => l.action === "suggestion_validated");
    expect(log?.details).toBe(DETALHE_FIXO);
  });

  it("observação com 1001 caracteres → 400 em pt-BR e a vaga continua pendente", async () => {
    const evento = await criarEvento();
    const funcao = await criarFuncao();
    const { agent, userId } = await validadorDe(funcao.id);
    const vaga = await vagaPendente({ eventId: evento.id, functionId: funcao.id, userId });

    const res = await mutacao(agent.post("/api/scaling-suggestions/validate"))
      .send({ inclusionIds: [vaga.id], validationNote: "x".repeat(1001) });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("A observação da validação pode ter no máximo 1000 caracteres");

    const noBanco = await ctx.storage.getTeamInclusion(vaga.id);
    expect(noBanco?.status).toBe("sugestao_pendente");
    expect(noBanco?.validationNote).toBeNull();
    expect((await logsDe(vaga.id)).some((l) => l.action === "suggestion_validated")).toBe(false);
  });

  it("exatamente 1000 caracteres → aceita", async () => {
    const evento = await criarEvento();
    const funcao = await criarFuncao();
    const { agent, userId } = await validadorDe(funcao.id);
    const vaga = await vagaPendente({ eventId: evento.id, functionId: funcao.id, userId });
    const nota = "y".repeat(1000);

    const res = await mutacao(agent.post("/api/scaling-suggestions/validate"))
      .send({ inclusionIds: [vaga.id], validationNote: nota });
    expect(res.status).toBe(200);
    expect((await ctx.storage.getTeamInclusion(vaga.id))?.validationNote).toBe(nota);
  });

  it("lote: a mesma observação vale para todas as vagas validadas", async () => {
    const evento = await criarEvento();
    const funcao = await criarFuncao();
    const { agent, userId } = await validadorDe(funcao.id);
    const v1 = await vagaPendente({ eventId: evento.id, functionId: funcao.id, userId });
    const v2 = await vagaPendente({ eventId: evento.id, functionId: funcao.id, userId });

    const res = await mutacao(agent.post("/api/scaling-suggestions/validate"))
      .send({ inclusionIds: [v1.id, v2.id], validationNote: "Vale para as duas" });
    expect(res.status).toBe(200);
    expect([...res.body.ok].sort()).toEqual([v1.id, v2.id].sort());
    for (const id of [v1.id, v2.id]) {
      expect((await ctx.storage.getTeamInclusion(id))?.validationNote).toBe("Vale para as duas");
    }
  });

  it("vaga devolvida pelo aprovador → volta a pendente com validationNote zerada", async () => {
    const evento = await criarEvento();
    const funcao = await criarFuncao();
    const { agent: validador, userId } = await validadorDe(funcao.id);
    const vaga = await vagaPendente({ eventId: evento.id, functionId: funcao.id, userId });

    const valida = await mutacao(validador.post("/api/scaling-suggestions/validate"))
      .send({ inclusionIds: [vaga.id], validationNote: "Observação da primeira validação" });
    expect(valida.status).toBe(200);
    expect((await ctx.storage.getTeamInclusion(vaga.id))?.validationNote).toBe("Observação da primeira validação");

    // Admin decide em qualquer função: devolve para a área com comentário.
    const { agent: admin } = await agenteLogado("admin");
    const devolve = await mutacao(admin.patch(`/api/scaling-suggestions/${vaga.id}/devolver`))
      .send({ comment: "Revisar as datas" });
    expect(devolve.status).toBe(200);

    const noBanco = await ctx.storage.getTeamInclusion(vaga.id);
    expect(noBanco?.status).toBe("sugestao_pendente");
    expect(noBanco?.validatedAt).toBeNull();
    expect(noBanco?.validatedBy).toBeNull();
    expect(noBanco?.validationNote).toBeNull();

    // Revalidar sem observação: a antiga não volta.
    const revalida = await mutacao(validador.post("/api/scaling-suggestions/validate")).send({ inclusionIds: [vaga.id] });
    expect(revalida.status).toBe(200);
    expect(revalida.body.ok).toEqual([vaga.id]);
    expect((await ctx.storage.getTeamInclusion(vaga.id))?.validationNote).toBeNull();
  });

  it("vaga reprovada pelo aprovador → validationNote zerada junto com o carimbo", async () => {
    const evento = await criarEvento();
    const funcao = await criarFuncao();
    const { agent: validador, userId } = await validadorDe(funcao.id);
    const vaga = await vagaPendente({ eventId: evento.id, functionId: funcao.id, userId });

    await mutacao(validador.post("/api/scaling-suggestions/validate"))
      .send({ inclusionIds: [vaga.id], validationNote: "Some na reprovação" });
    const { agent: admin } = await agenteLogado("admin");
    const reprova = await mutacao(admin.patch(`/api/scaling-suggestions/${vaga.id}/reprovar`))
      .send({ comment: "Não precisa desta vaga" });
    expect(reprova.status).toBe(200);

    const noBanco = await ctx.storage.getTeamInclusion(vaga.id);
    expect(noBanco?.validationNote).toBeNull();
    expect(noBanco?.validatedAt).toBeNull();
  });

  it("quem não é validador da função não grava observação (vaga pulada)", async () => {
    const evento = await criarEvento();
    const funcao = await criarFuncao();
    const { agent, user } = await agenteLogado("function_area");
    const vaga = await vagaPendente({ eventId: evento.id, functionId: funcao.id, userId: user.id });

    const res = await mutacao(agent.post("/api/scaling-suggestions/validate"))
      .send({ inclusionIds: [vaga.id], validationNote: "Não deveria gravar" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toEqual([]);
    expect(res.body.skipped).toEqual([{ id: vaga.id, reason: "Sem permissão para validar esta função" }]);
    expect((await ctx.storage.getTeamInclusion(vaga.id))?.validationNote).toBeNull();
  });
});

describe("POST /api/team-inclusions — validationNote é campo de fluxo, não do cadastro", () => {
  it("o corpo de criação ignora validationNote (insertTeamInclusionSchema a omite)", async () => {
    const { insertTeamInclusionSchema } = ctx.schema;
    const parsed = insertTeamInclusionSchema.parse({
      eventId: "e", functionId: "f", userId: "u", dailyRates: 1, validationNote: "x",
    } as Record<string, unknown>);
    expect("validationNote" in parsed).toBe(false);
    expect("validationNote" in ctx.schema.teamInclusionRowSchema.shape).toBe(true);
  });
});

// Dono, 30/09: "permitir após evento". A vaga #4643 (evento terminou 27/09)
// voltou do aprovador em 29/09 e a área recebia "Evento encerrado — só o
// administrador". Na Validação, vagas que já existem seguem o fluxo depois do
// fim do evento; o que CRIA vagas continua só com o administrador.
describe("Validação de Escala depois do fim do evento (VALIDACAO_APOS_EVENTO)", () => {
  const EVENTO_ENCERRADO = { startDate: "2020-03-10", endDate: "2020-03-12" };

  it("a área valida vaga de evento encerrado → 200 e a vaga vai para o aprovador", async () => {
    const evento = await criarEvento(EVENTO_ENCERRADO);
    const funcao = await criarFuncao();
    const { agent, userId } = await validadorDe(funcao.id);
    const vaga = await vagaPendente({ eventId: evento.id, functionId: funcao.id, userId });

    const res = await mutacao(agent.post("/api/scaling-suggestions/validate"))
      .send({ inclusionIds: [vaga.id], validationNote: "Henrique aprovou. Local de qui a sab." });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: [vaga.id], skipped: [] });
    const noBanco = await ctx.storage.getTeamInclusion(vaga.id);
    expect(noBanco?.status).toBe("sugestao_validada");
    expect(noBanco?.validationNote).toBe("Henrique aprovou. Local de qui a sab.");
  });

  it("a área pede ajuste de vaga de evento encerrado → aceito", async () => {
    const evento = await criarEvento(EVENTO_ENCERRADO);
    const funcao = await criarFuncao();
    const { agent, userId } = await validadorDe(funcao.id);
    const vaga = await vagaPendente({ eventId: evento.id, functionId: funcao.id, userId });

    const res = await mutacao(agent.post("/api/scaling-change-requests")).send({
      teamInclusionId: vaga.id, eventId: evento.id, functionId: funcao.id, area: null,
      requestType: "ajuste", proposedChanges: { v: 1, observations: "Chega um dia antes" }, reason: "Combinado com o produtor",
    });
    expect([200, 201]).toContain(res.status);
    expect((await ctx.storage.getTeamInclusion(vaga.id))?.status).toBe("sugestao_ajuste");
  });

  it("o aprovador (não admin) aprova vaga validada de evento encerrado → vira Inclusão", async () => {
    const evento = await criarEvento(EVENTO_ENCERRADO);
    const funcao = await criarFuncao();
    const { agent: validador, userId } = await validadorDe(funcao.id);
    const vaga = await vagaPendente({ eventId: evento.id, functionId: funcao.id, userId });
    expect((await mutacao(validador.post("/api/scaling-suggestions/validate")).send({ inclusionIds: [vaga.id] })).status).toBe(200);

    const { agent: aprovador, user } = await agenteLogado("production");
    await ctx.storage.addScalingManager({ functionId: funcao.id, userId: user.id, role: "aprovador" });
    const res = await mutacao(aprovador.patch(`/api/scaling-suggestions/${vaga.id}/aprovar`)).send({});
    expect(res.status).toBe(200);
    expect((await ctx.storage.getTeamInclusion(vaga.id))?.phase).not.toBe("sugestao");
  });

  it("pedido de INCLUSÃO (cria vaga nova) em evento encerrado continua só com o administrador → 403", async () => {
    const evento = await criarEvento(EVENTO_ENCERRADO);
    const funcao = await criarFuncao();
    const { agent } = await validadorDe(funcao.id);

    const res = await mutacao(agent.post("/api/scaling-change-requests")).send({
      eventId: evento.id, functionId: funcao.id, area: null, requestType: "inclusao",
      proposedChanges: { v: 1, quantity: 1, workDays: [EVENTO_ENCERRADO.startDate], dailyRates: 1 },
      reason: "Faltou uma pessoa",
    });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Evento encerrado/);
  });
});
