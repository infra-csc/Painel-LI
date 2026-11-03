/**
 * Trocar a função pelo Pedir ajuste (03/11, dono: "ativação local" → casa).
 * O pedido leva a função nova; o aprovador aceita e a vaga muda. Vaga já no
 * Realizado não troca: a prestação guarda a função dela.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { agenteLogado, criarApp, criarColaborador, criarEvento, criarFuncao, criarVaga, mutacao, type Contexto } from "./harness";

let ctx: Contexto;
beforeAll(async () => { ctx = await criarApp(); });

async function cenario() {
  const { agent, user } = await agenteLogado("admin");
  const evento = await criarEvento({ startDate: "2099-10-10", endDate: "2099-10-12" });
  const de = await criarFuncao();
  const para = await criarFuncao();
  const colab = await criarColaborador();
  const vaga = await criarVaga({ userId: user.id, eventId: evento.id, functionId: de.id, collaboratorId: colab.id, status: "planejado", needsTicket: false });
  const pedir = (functionId: string) => mutacao(agent.post("/api/scaling-change-requests")).send({
    teamInclusionId: vaga.id, eventId: evento.id, functionId: de.id, requestType: "ajuste",
    reason: "Colaborador é da casa", proposedChanges: { v: 1, functionId },
  });
  return { agent, evento, de, para, colab, vaga, pedir };
}

describe("Pedido de ajuste com troca de função", () => {
  it("aprovado: a vaga passa para a função nova; antes disso, nada muda", async () => {
    const { agent, vaga, para, pedir } = await cenario();
    const r = await pedir(para.id);
    expect(r.status, r.text).toBe(201);
    expect((await ctx.storage.getTeamInclusion(vaga.id))?.functionId).toBe(vaga.functionId);
    const a = await mutacao(agent.patch(`/api/scaling-change-requests/${r.body.id}/approve`)).send({ comment: "ok" });
    expect(a.status, a.text).toBe(200);
    expect((await ctx.storage.getTeamInclusion(vaga.id))?.functionId).toBe(para.id);
  });

  it("função que não existe → 400", async () => {
    const { pedir } = await cenario();
    expect((await pedir("nao-existe")).status).toBe(400);
  });

  it("vaga já no Realizado → 409, ao pedir e ao aprovar", async () => {
    const c = await cenario();
    const r = await c.pedir(c.para.id);
    expect(r.status, r.text).toBe(201);
    await ctx.db.insert(ctx.schema.budgetActual).values({ eventId: c.evento.id, collaboratorId: c.colab.id, functionId: c.de.id, collaboratorType: "casa" } as never);
    const a = await mutacao(c.agent.patch(`/api/scaling-change-requests/${r.body.id}/approve`)).send({ comment: "ok" });
    expect(a.status).toBe(409);
    expect(a.body.message).toContain("Realizado");
    expect((await ctx.storage.getTeamInclusion(c.vaga.id))?.functionId).toBe(c.de.id);
  });

  it("pedido de inclusão não troca função", async () => {
    const { agent, evento, de, para } = await cenario();
    const r = await mutacao(agent.post("/api/scaling-change-requests")).send({
      eventId: evento.id, functionId: de.id, requestType: "inclusao", reason: "Falta gente",
      proposedChanges: { v: 1, workDays: ["2099-10-10"], functionId: para.id },
    });
    expect(r.status).toBe(400);
  });
});
