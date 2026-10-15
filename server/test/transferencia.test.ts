/**
 * Transferência de colaborador entre vagas (14/09; 05/10 também para vaga com alguém).
 *
 * Dono, 05/10: "só quero tirar a Jaqueline e colocar a Aline sem trocar a vaga
 * dela" — a Aline está escalada em outra prova no mesmo período. Aprovada a
 * transferência, a Aline sai da vaga de origem (que fica aberta) e entra no
 * lugar da Jaqueline, que sai da escala. Passagens de quem saiu de cada vaga
 * viram histórico (o custo continua no evento).
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

async function comprarPassagem(agent: TestAgent, vagaId: string, valorCentavos: number, loc: string) {
  const res = await mutacao(agent.post("/api/tickets")).send({
    teamInclusionId: vagaId, transportType: "aereo", value: valorCentavos, purchaseOrderNumber: loc,
    actualDepartureDate: "2027-10-10", actualDepartureTime: "08:00",
  });
  expect(res.status).toBe(200);
  return res.body as { id: string };
}

/** Duas provas no mesmo período: Jaqueline numa, Aline na outra. */
async function cenario(agent: TestAgent, userId: string, o: { destinoComAlguem: boolean }) {
  const runningHour = await criarEvento();
  const maceio = await criarEvento();
  const jaque = await criarColaborador({ fullName: "Jaqueline Keiko Oshiro" });
  const aline = await criarColaborador({ fullName: "Aline Candido Da Silva" });
  const destino = await criarVaga({
    userId, eventId: runningHour.id, status: "escalado", phase: "escalacao",
    collaboratorId: o.destinoComAlguem ? jaque.id : null,
  });
  const origem = await criarVaga({ userId, eventId: maceio.id, collaboratorId: aline.id, status: "escalado", phase: "escalacao" });
  return { jaque, aline, destino, origem };
}

describe("Transferência para vaga que já tem alguém (05/10)", () => {
  it("a pessoa vem da outra vaga, quem estava aqui sai da escala e as passagens de quem saiu viram histórico", async () => {
    const { agent, user } = await agenteLogado("admin");
    const { jaque, aline, destino, origem } = await cenario(agent, user.id, { destinoComAlguem: true });
    const passJaque = await comprarPassagem(agent, destino.id, 120000, "JAQ001");
    const passAline = await comprarPassagem(agent, origem.id, 98000, "ALI001");

    const pedido = await mutacao(agent.post("/api/swap-requests")).send({
      teamInclusionId: destino.id, newCollaboratorId: aline.id, reason: "Jaqueline não pode mais ir",
      newCity: "São Paulo - SP", kind: "transferencia", pairedInclusionId: origem.id,
    });
    expect(pedido.status).toBe(201);
    expect(pedido.body.current_collaborator_id ?? pedido.body.currentCollaboratorId).toBe(jaque.id);
    // Até aprovar, nada muda.
    expect((await ctx.storage.getTeamInclusion(destino.id))?.collaboratorId).toBe(jaque.id);
    expect((await ctx.storage.getTeamInclusion(origem.id))?.collaboratorId).toBe(aline.id);

    const aprova = await mutacao(agent.patch(`/api/swap-requests/${pedido.body.id}/approve`)).send({});
    expect(aprova.status).toBe(200);
    expect(aprova.body.passagensParaHistorico).toBe(2);

    const d = await ctx.storage.getTeamInclusion(destino.id);
    const o = await ctx.storage.getTeamInclusion(origem.id);
    expect(d?.collaboratorId).toBe(aline.id);
    expect(d?.city).toBe("São Paulo - SP");
    expect(o?.collaboratorId).toBeNull();
    expect(o?.status).toBe("escalacao");
    // Jaqueline não foi para lugar nenhum.
    const vagasDaJaque = (await ctx.storage.getTeamInclusionsByCollaborator(jaque.id)).filter((v) => !v.deletedAt);
    expect(vagasDaJaque).toHaveLength(0);

    // Passagem de cada um vira histórico da vaga de onde saiu, com o valor intacto.
    const pj = await ctx.storage.getTicket(passJaque.id);
    expect(pj?.archivedAt).toBeTruthy();
    expect(pj?.archivedCollaboratorId).toBe(jaque.id);
    expect(pj?.value).toBe(120000);
    const pa = await ctx.storage.getTicket(passAline.id);
    expect(pa?.archivedAt).toBeTruthy();
    expect(pa?.archivedCollaboratorId).toBe(aline.id);
    // A vaga de destino volta a pedir passagem (a de quem entrou).
    expect(d?.status).not.toBe("passagem_comprada");

    // Histórico da vaga de destino conta quem saiu.
    const logs = await ctx.storage.getTeamInclusionLogs(destino.id);
    const aprovado = logs.find((l) => l.action === "swap_approved");
    expect(aprovado?.details).toContain("no lugar de Jaqueline Keiko Oshiro");
  });

  it("se quem estava na vaga mudou depois do pedido, a aprovação recusa (409) e nada muda", async () => {
    const { agent, user } = await agenteLogado("admin");
    const { jaque, aline, destino, origem } = await cenario(agent, user.id, { destinoComAlguem: true });
    const pedido = await mutacao(agent.post("/api/swap-requests")).send({
      teamInclusionId: destino.id, newCollaboratorId: aline.id, reason: "Jaqueline não pode mais ir",
      newCity: "São Paulo - SP", kind: "transferencia", pairedInclusionId: origem.id,
    });
    expect(pedido.status).toBe(201);
    const outro = await criarColaborador({ fullName: "Outra Pessoa" });
    await ctx.storage.updateTeamInclusion(destino.id, { collaboratorId: outro.id } as never);

    const aprova = await mutacao(agent.patch(`/api/swap-requests/${pedido.body.id}/approve`)).send({});
    expect(aprova.status).toBe(409);
    expect((await ctx.storage.getTeamInclusion(origem.id))?.collaboratorId).toBe(aline.id);
    expect((await ctx.storage.getTeamInclusion(destino.id))?.collaboratorId).toBe(outro.id);
    expect(jaque.id).toBeTruthy();
  });

  it("transferência para vaga aberta continua como antes", async () => {
    const { agent, user } = await agenteLogado("admin");
    const { aline, destino, origem } = await cenario(agent, user.id, { destinoComAlguem: false });
    const pedido = await mutacao(agent.post("/api/swap-requests")).send({
      teamInclusionId: destino.id, newCollaboratorId: aline.id, reason: "Vaga aberta precisa dela",
      newCity: "Maceió - AL", kind: "transferencia", pairedInclusionId: origem.id,
    });
    expect(pedido.status).toBe(201);
    const aprova = await mutacao(agent.patch(`/api/swap-requests/${pedido.body.id}/approve`)).send({});
    expect(aprova.status).toBe(200);
    expect((await ctx.storage.getTeamInclusion(destino.id))?.collaboratorId).toBe(aline.id);
    expect((await ctx.storage.getTeamInclusion(origem.id))?.collaboratorId).toBeNull();
  });
});
