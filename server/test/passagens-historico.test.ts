/**
 * Passagem de quem SAI numa troca aprovada vira HISTÓRICO (dono, 01/10: "eu
 * comprei mas vamos trocar o colaborador — aquela passagem fica de histórico,
 * e o custo mantém na prova").
 *
 * Cobre: a passagem não é apagada nem editada; deixa de ser a atual da vaga
 * (GET /api/tickets, status da vaga); aparece em /api/tickets/historico com o
 * nome de quem era; não aceita edição; e o valor continua no custo do evento
 * (Espelho). Troca simples e permuta.
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
    actualDepartureDate: "2099-10-09", actualDepartureTime: "18:55",
  });
  expect(res.status).toBe(200);
  return res.body as { id: string };
}

describe("Passagem vira histórico quando a troca é aprovada (01/10)", () => {
  it("troca simples: a passagem de quem saiu vai para o histórico, sai da lista atual, não aceita edição e o custo continua no evento", async () => {
    const { agent, user } = await agenteLogado("admin");
    const evento = await criarEvento();
    const igor = await criarColaborador({ fullName: "Igor Pinheiro Dos Santos" });
    const jaque = await criarColaborador({ fullName: "Jaqueline Keiko Oshiro" });
    const vaga = await criarVaga({ userId: user.id, eventId: evento.id, collaboratorId: igor.id, status: "escalado", phase: "escalacao" });
    const passagem = await comprarPassagem(agent, vaga.id, 161971, "LHNUVI");
    expect((await ctx.storage.getTeamInclusion(vaga.id))?.status).toBe("passagem_comprada");

    const pedido = await mutacao(agent.post("/api/swap-requests")).send({
      teamInclusionId: vaga.id, newCollaboratorId: jaque.id, reason: "Mudança de data", newCity: "São Paulo - SP",
    });
    expect(pedido.status).toBe(201);
    const aprova = await mutacao(agent.patch(`/api/swap-requests/${pedido.body.id}/approve`)).send({});
    expect(aprova.status).toBe(200);
    expect(aprova.body.passagensParaHistorico).toBe(1);

    // A linha continua no banco, com de quem era e o motivo.
    const noBanco = await ctx.storage.getTicket(passagem.id);
    expect(noBanco?.archivedAt).toBeTruthy();
    expect(noBanco?.archivedCollaboratorId).toBe(igor.id);
    expect(noBanco?.archivedReason).toContain("Igor Pinheiro Dos Santos → Jaqueline Keiko Oshiro");
    expect(noBanco?.value).toBe(161971);

    // Não é mais a passagem atual: some da lista e o status da vaga volta a pedir passagem.
    const atuais = await agent.get(`/api/tickets?eventId=${evento.id}`);
    expect((atuais.body as Array<{ id: string }>).some((t) => t.id === passagem.id)).toBe(false);
    expect((await ctx.storage.getTeamInclusion(vaga.id))?.status).toBe("escalado");

    // Histórico da vaga, com o nome de quem era.
    const hist = await agent.get(`/api/tickets/historico?teamInclusionId=${vaga.id}`);
    expect(hist.status).toBe(200);
    expect(hist.body).toHaveLength(1);
    expect(hist.body[0].archivedCollaboratorName).toBe("Igor Pinheiro Dos Santos");
    expect(hist.body[0].purchaseOrderNumber).toBe("LHNUVI");

    // Histórico não se edita.
    const edita = await mutacao(agent.patch(`/api/tickets/${passagem.id}`)).send({ value: 1 });
    expect(edita.status).toBe(409);

    // Compras compra a passagem de quem entrou; o custo do evento soma as duas.
    await comprarPassagem(agent, vaga.id, 90500, "NOVO01");
    const espelho = await agent.get(`/api/events/${evento.id}/operational-mirror`);
    expect(espelho.status).toBe(200);
    expect(espelho.body.totals.ticketsHistorico).toBe(161971);
    expect(espelho.body.totals.tickets).toBe(161971 + 90500);
    const linha = (espelho.body.rows as Array<{ teamInclusionId: string; ticket: { value: number } | null }>).find((r) => r.teamInclusionId === vaga.id);
    expect(linha?.ticket?.value).toBe(90500); // a linha mostra só a passagem atual
  });

  it("permuta: as passagens das DUAS vagas vão para o histórico, cada uma com o nome de quem era", async () => {
    const { agent, user } = await agenteLogado("admin");
    const evSp = await criarEvento({ name: "Smart Fit SP" });
    const evCwb = await criarEvento({ name: "Night Run CWB" });
    const jaque = await criarColaborador({ fullName: "Jaqueline Keiko Oshiro" });
    const igor = await criarColaborador({ fullName: "Igor Pinheiro Dos Santos" });
    const vagaSp = await criarVaga({ userId: user.id, eventId: evSp.id, collaboratorId: jaque.id, status: "escalado", phase: "escalacao" });
    const vagaCwb = await criarVaga({ userId: user.id, eventId: evCwb.id, collaboratorId: igor.id, status: "escalado", phase: "escalacao" });
    await comprarPassagem(agent, vagaCwb.id, 161971, "LHNUVI");

    const pedido = await mutacao(agent.post("/api/swap-requests")).send({
      teamInclusionId: vagaSp.id, newCollaboratorId: igor.id, reason: "Mudança de data de Night CWB", newCity: "São Paulo - SP",
      kind: "permuta", pairedInclusionId: vagaCwb.id, pairedNewCity: "São Paulo - SP",
    });
    expect(pedido.status).toBe(201);
    const aprova = await mutacao(agent.patch(`/api/swap-requests/${pedido.body.id}/approve`)).send({});
    expect(aprova.status).toBe(200);
    expect(aprova.body.passagensParaHistorico).toBe(1);

    const hist = await agent.get(`/api/tickets/historico?eventId=${evCwb.id}`);
    expect(hist.body).toHaveLength(1);
    expect(hist.body[0].archivedCollaboratorName).toBe("Igor Pinheiro Dos Santos");
    expect((await ctx.storage.getTeamInclusion(vagaCwb.id))?.collaboratorId).toBe(jaque.id);
    expect((await ctx.storage.getTeamInclusion(vagaCwb.id))?.status).toBe("escalado");
  });

  it("histórico sem vaga nem evento → 400", async () => {
    const { agent } = await agenteLogado("purchasing");
    expect((await agent.get("/api/tickets/historico")).status).toBe(400);
  });
});
