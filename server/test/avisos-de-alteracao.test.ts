/**
 * Aviso de alteração para Compras (02/10): "quando o Pedro aprovar alteração
 * de data/horário, preciso saber o que mudou e em qual prova".
 *
 * Cobre: ajuste aprovado em vaga JÁ ESCALADA com passagem → nasce o aviso (com
 * o de → para em texto); sem passagem ou só observação → não nasce; "Já atuei"
 * resolve uma vez só (409 na segunda) e registra no histórico da vaga.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  agenteLogado,
  criarApp,
  criarColaborador,
  criarEvento,
  criarVaga,
  mutacao,
  type Contexto,
  type TestAgent,
} from "./harness";

let ctx: Contexto;

beforeAll(async () => {
  ctx = await criarApp();
});

async function vagaEscalada(userId: string, eventId: string) {
  const colab = await criarColaborador({ fullName: "Bruna Teixeira Lopes" });
  return criarVaga({ userId, eventId, collaboratorId: colab.id, status: "escalado", phase: "escalacao" });
}

async function comprarPassagem(agent: TestAgent, vagaId: string) {
  const res = await mutacao(agent.post("/api/tickets")).send({
    teamInclusionId: vagaId, transportType: "aereo", value: 85000, purchaseOrderNumber: "ABC123",
    actualDepartureDate: "2027-10-10", actualDepartureTime: "08:00",
  });
  expect(res.status).toBe(200);
}

async function pedirEAprovar(agent: TestAgent, vaga: { id: string; eventId: string; functionId: string }, proposed: Record<string, unknown>) {
  const pedido = await mutacao(agent.post("/api/scaling-change-requests")).send({
    teamInclusionId: vaga.id, eventId: vaga.eventId, functionId: vaga.functionId, area: null,
    requestType: "ajuste", proposedChanges: { v: 1, ...proposed }, reason: "Voo antecipado pela produção",
  });
  expect([200, 201]).toContain(pedido.status);
  const id = pedido.body.id ?? pedido.body.request?.id;
  const aprova = await mutacao(agent.patch(`/api/scaling-change-requests/${id}/approve`)).send({ comment: "Ok, pode remarcar" });
  expect(aprova.status).toBe(200);
  return aprova.body as { avisoParaCompras: string | null };
}

describe("Aviso de alteração para Compras (02/10)", () => {
  it("ajuste de data aprovado em vaga com passagem → aviso com o de → para, e Já atuei resolve uma vez", async () => {
    const { agent, user } = await agenteLogado("admin");
    const evento = await criarEvento({ name: "Night Run Curitiba" });
    const vaga = await vagaEscalada(user.id, evento.id);
    await comprarPassagem(agent, vaga.id);

    const aprovado = await pedirEAprovar(agent, vaga, { flightDepartureDate: "2099-10-09", flightDepartureSuggestedTime: "06:00" });
    expect(aprovado.avisoParaCompras).toBe("Passagem");

    const lista = await agent.get(`/api/avisos-de-alteracao?eventId=${evento.id}`);
    expect(lista.status).toBe(200);
    expect(lista.body).toHaveLength(1);
    const aviso = lista.body[0];
    expect(aviso.eventName).toBe("Night Run Curitiba");
    expect(aviso.collaboratorName).toBe("Bruna Teixeira Lopes");
    expect(aviso.afetaPassagem).toBe(true);
    expect(aviso.motivo).toBe("Voo antecipado pela produção");
    expect(aviso.comentarioDoAprovador).toBe("Ok, pode remarcar");
    expect(aviso.mudancas).toEqual(expect.arrayContaining([
      expect.objectContaining({ campo: "flightDepartureDate", para: "09/10/2099" }),
      expect.objectContaining({ campo: "flightDepartureSuggestedTime", para: "06:00" }),
    ]));

    const resolve = await mutacao(agent.post(`/api/avisos-de-alteracao/${aviso.id}/resolver`)).send({ resolucao: "Remarcado com a LATAM" });
    expect(resolve.status).toBe(200);
    expect(resolve.body.resolucao).toBe("Remarcado com a LATAM");
    const deNovo = await mutacao(agent.post(`/api/avisos-de-alteracao/${aviso.id}/resolver`)).send({});
    expect(deNovo.status).toBe(409);

    expect((await agent.get(`/api/avisos-de-alteracao?eventId=${evento.id}`)).body).toHaveLength(0);
    expect((await agent.get(`/api/avisos-de-alteracao?situacao=resolvido&eventId=${evento.id}`)).body).toHaveLength(1);
    const logs = await ctx.storage.getTeamInclusionLogs(vaga.id);
    expect(logs.some((l) => l.action === "aviso_de_alteracao_resolvido" && l.details?.includes("Remarcado com a LATAM"))).toBe(true);
    expect(logs.some((l) => l.action === "change_request_approved" && l.details?.includes("Compras avisada"))).toBe(true);
  });

  it("vaga sem passagem nem hospedagem → nada para Compras refazer, não nasce aviso", async () => {
    const { agent, user } = await agenteLogado("admin");
    const evento = await criarEvento();
    const vaga = await vagaEscalada(user.id, evento.id);
    const aprovado = await pedirEAprovar(agent, vaga, { flightDepartureDate: "2099-10-09" });
    expect(aprovado.avisoParaCompras).toBeNull();
    expect((await agent.get(`/api/avisos-de-alteracao?eventId=${evento.id}`)).body).toHaveLength(0);
  });

  it("só observação mudou → não mexe na passagem, não nasce aviso", async () => {
    const { agent, user } = await agenteLogado("admin");
    const evento = await criarEvento();
    const vaga = await vagaEscalada(user.id, evento.id);
    await comprarPassagem(agent, vaga.id);
    const aprovado = await pedirEAprovar(agent, vaga, { observations: "Levar crachá" });
    expect(aprovado.avisoParaCompras).toBeNull();
  });

  it("quem não é da logística não lê nem resolve avisos (403)", async () => {
    const { agent } = await agenteLogado("function_area");
    expect((await agent.get("/api/avisos-de-alteracao")).status).toBe(403);
  });
});
