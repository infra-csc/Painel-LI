/**
 * Pedido de ajuste em vaga JÁ ESCALADA — regras do dono, 07/10:
 *  - "pedir ajuste pode até depois da passagem" (passagem comprada não bloqueia);
 *  - "pedir ajuste para todos que são responsáveis da função normal"
 *    (function_managers), qualquer que seja o papel — relato: Leandro, Produção,
 *    não via o botão.
 * Na Validação de Escala (vaga em sugestão) continua só o validador.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  agenteLogado,
  criarApp,
  criarColaborador,
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

async function cenario() {
  const { agent: admin, user: adminUser } = await agenteLogado("admin");
  const evento = await criarEvento();
  const funcao = await criarFuncao();
  const colab = await criarColaborador({ fullName: "Marcos Vinicius Prado" });
  const vaga = await criarVaga({ userId: adminUser.id, eventId: evento.id, functionId: funcao.id, collaboratorId: colab.id, status: "escalado", phase: "escalacao" });
  const passagem = await mutacao(admin.post("/api/tickets")).send({
    teamInclusionId: vaga.id, transportType: "aereo", value: 91000, purchaseOrderNumber: "OC-1", ticketStatus: "comprada",
    actualDepartureDate: "2099-10-10", actualDepartureTime: "08:00",
  });
  expect(passagem.status).toBe(200);
  return { evento, funcao, vaga };
}

const pedir = (agent: TestAgent, v: { id: string; eventId: string; functionId: string }) =>
  mutacao(agent.post("/api/scaling-change-requests")).send({
    teamInclusionId: v.id, eventId: v.eventId, functionId: v.functionId, area: null,
    requestType: "ajuste", proposedChanges: { v: 1, flightDepartureDate: "2099-10-09" }, reason: "Chegar um dia antes",
  });

describe("Pedir ajuste em vaga escalada (07/10)", () => {
  it("responsável da função (Produção) vê e abre o pedido mesmo com a passagem comprada", async () => {
    const { vaga } = await cenario();
    const { agent, user } = await agenteLogado("production");
    await ctx.storage.addManagerToFunction({ functionId: vaga.functionId, userId: user.id });

    const janela = await agent.get(`/api/team-inclusions/${vaga.id}/change-window`);
    expect(janela.status).toBe(200);
    expect(janela.body.canRequest).toBe(true);
    expect(janela.body.allowed).toBe(true);
    expect(janela.body.passagemComprada).toBe(true);

    const res = await pedir(agent, vaga);
    expect([200, 201]).toContain(res.status);
  });

  it("Produção que NÃO é responsável da função não abre pedido (e a tela não oferece)", async () => {
    const { vaga } = await cenario();
    const { agent } = await agenteLogado("production");
    const janela = await agent.get(`/api/team-inclusions/${vaga.id}/change-window`);
    expect(janela.body.canRequest).toBe(false);
    expect((await pedir(agent, vaga)).status).toBe(403);
  });

  it("validador da área também pede depois da passagem comprada (antes era só o admin)", async () => {
    const { vaga } = await cenario();
    const { agent, user } = await agenteLogado("function_area");
    await ctx.storage.addScalingManager({ functionId: vaga.functionId, userId: user.id, role: "validador" });
    const res = await pedir(agent, vaga);
    expect([200, 201]).toContain(res.status);
  });

  it("na Validação de Escala (vaga em sugestão) o responsável comum continua sem pedir", async () => {
    const { agent: admin, user: adminUser } = await agenteLogado("admin");
    void admin;
    const evento = await criarEvento();
    const funcao = await criarFuncao();
    const vaga = await criarVaga({ userId: adminUser.id, eventId: evento.id, functionId: funcao.id, status: "sugestao_pendente", phase: "sugestao" });
    const { agent, user } = await agenteLogado("production");
    await ctx.storage.addManagerToFunction({ functionId: funcao.id, userId: user.id });
    expect((await agent.get(`/api/team-inclusions/${vaga.id}/change-window`)).body.canRequest).toBe(false);
    expect((await pedir(agent, vaga)).status).toBe(403);
  });
});
