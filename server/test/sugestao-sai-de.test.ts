/**
 * "Sai de" na Sugestão de escala (09/10 — dono: "ter a opção de colocar de
 * onde sai o colaborador"). O envio em lote grava a cidade da linha em
 * `team_inclusions.city` (o "Sai de" que a Escalação mostra), com a régua do
 * "Sai de" opcional (vazio vale; preenchido, 2 a 120 caracteres). Os pedidos
 * de inclusão/ajuste da Validação levam a cidade no de/para.
 *
 * Rodar: `npx vitest run server/test/sugestao-sai-de.test.ts`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { agenteLogado, criarApp, criarEvento, criarFuncao, criarVaga, mutacao, type Contexto } from "./harness";

let ctx: Contexto;

beforeAll(async () => {
  ctx = await criarApp();
});

const DIAS = ["2099-10-10", "2099-10-11"];

describe("POST /api/scaling-suggestions/bulk — Sai de (09/10)", () => {
  it("grava a cidade da linha; vazio/só espaços vira null; vem direto de outro evento não leva cidade", async () => {
    const { agent } = await agenteLogado("admin");
    const evento = await criarEvento();
    const outro = await criarEvento({ name: "Carreta BH", startDate: "2099-10-01", endDate: "2099-10-05" });
    const funcao = await criarFuncao();

    const res = await mutacao(agent.post("/api/scaling-suggestions/bulk")).send({
      eventId: evento.id,
      rows: [
        { functionId: funcao.id, workDays: DIAS, city: "  Rio de Janeiro - RJ " },
        { functionId: funcao.id, workDays: DIAS, city: "São Paulo - SP" },
        { functionId: funcao.id, workDays: DIAS, city: "   " },
        { functionId: funcao.id, workDays: DIAS },
        { functionId: funcao.id, workDays: DIAS, city: "Belo Horizonte - MG", idaVemDoEventoId: outro.id },
      ],
    });
    expect(res.status).toBe(201);

    const vagas = (await ctx.storage.getTeamInclusions(false, "sugestao", { eventId: evento.id }))
      .sort((a, b) => (a.rowOrder ?? 0) - (b.rowOrder ?? 0));
    expect(vagas.map((v) => v.city)).toEqual(["Rio de Janeiro - RJ", "São Paulo - SP", null, null, null]);
    expect(vagas[4].idaVemDoEventoId).toBe(outro.id);
  });

  it("cidade de 1 letra ou com mais de 120 caracteres → 400 e nada é criado", async () => {
    const { agent } = await agenteLogado("admin");
    const evento = await criarEvento();
    const funcao = await criarFuncao();

    for (const city of ["R", "x".repeat(121)]) {
      const res = await mutacao(agent.post("/api/scaling-suggestions/bulk")).send({
        eventId: evento.id, rows: [{ functionId: funcao.id, workDays: DIAS, city }],
      });
      expect(res.status).toBe(400);
    }
    expect(await ctx.storage.getTeamInclusions(false, "sugestao", { eventId: evento.id })).toHaveLength(0);
  });
});

describe("Pedidos da Validação — Sai de no de/para (09/10)", () => {
  it("ajuste com cidade nova → de/para 'Ida · sai de' e, aprovado, a vaga sai da cidade pedida", async () => {
    const { agent, user } = await agenteLogado("admin");
    const evento = await criarEvento();
    const funcao = await criarFuncao();
    const vaga = await criarVaga({ eventId: evento.id, functionId: funcao.id, userId: user.id, status: "sugestao_pendente", phase: "sugestao" });

    const pedido = await mutacao(agent.post("/api/scaling-change-requests")).send({
      teamInclusionId: vaga.id, eventId: evento.id, functionId: funcao.id, area: null,
      requestType: "ajuste", proposedChanges: { v: 1, city: "Salvador - BA" }, reason: "A equipe é de Salvador",
    });
    expect([200, 201]).toContain(pedido.status);
    const id = pedido.body.id ?? pedido.body.request?.id;

    const fila = await agent.get(`/api/scaling-change-requests?eventId=${evento.id}`);
    expect(fila.status).toBe(200);
    const item = (fila.body as Array<{ id: string; diff: Array<{ field: string; label: string; to: unknown }> }>).find((r) => r.id === id);
    expect(item?.diff).toEqual([expect.objectContaining({ field: "city", label: "Ida · sai de", to: "Salvador - BA" })]);

    const aprova = await mutacao(agent.patch(`/api/scaling-change-requests/${id}/approve`)).send({});
    expect(aprova.status).toBe(200);
    expect((await ctx.storage.getTeamInclusion(vaga.id))?.city).toBe("Salvador - BA");
  });

  it("inclusão com cidade → a vaga criada na aprovação já nasce com o Sai de", async () => {
    const { agent } = await agenteLogado("admin");
    const evento = await criarEvento();
    const funcao = await criarFuncao();

    const pedido = await mutacao(agent.post("/api/scaling-change-requests")).send({
      eventId: evento.id, functionId: funcao.id, area: null, requestType: "inclusao",
      proposedChanges: { v: 1, quantity: 2, workDays: DIAS, dailyRates: 2, city: "Recife - PE" },
      reason: "Faltou a equipe de Recife",
    });
    expect([200, 201]).toContain(pedido.status);
    const id = pedido.body.id ?? pedido.body.request?.id;
    const aprova = await mutacao(agent.patch(`/api/scaling-change-requests/${id}/approve`)).send({});
    expect(aprova.status).toBe(200);

    const criadas = (await ctx.storage.getTeamInclusions(false, undefined, { eventId: evento.id }));
    expect(criadas).toHaveLength(2);
    expect(criadas.every((v) => v.city === "Recife - PE")).toBe(true);
  });

  it("cidade inválida no pedido → 400 em pt-BR", async () => {
    const { agent, user } = await agenteLogado("admin");
    const evento = await criarEvento();
    const funcao = await criarFuncao();
    const vaga = await criarVaga({ eventId: evento.id, functionId: funcao.id, userId: user.id, status: "sugestao_pendente", phase: "sugestao" });

    const res = await mutacao(agent.post("/api/scaling-change-requests")).send({
      teamInclusionId: vaga.id, eventId: evento.id, functionId: funcao.id, area: null,
      requestType: "ajuste", proposedChanges: { v: 1, city: "R" }, reason: "teste",
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/muito curta/);
  });
});
