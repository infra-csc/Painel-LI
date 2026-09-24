/**
 * Testes de rota — logística e espelho (24/09): status da vaga DERIVADO ao
 * registrar passagem/hospedagem, PATCH com status igual (no-op) e mover pessoa
 * de quarto entre eventos. Rodar: `npm run test:rotas`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  agenteLogado,
  criarApp,
  criarColaborador,
  criarEvento,
  criarVaga,
  mutacao,
  type Contexto,
} from "./harness";

let ctx: Contexto;

beforeAll(async () => {
  ctx = await criarApp();
});

/** Vaga já confirmada ('escalado'), com colaborador — ponto de partida da logística. */
async function vagaEscalada(userId: string) {
  const colab = await criarColaborador();
  const vaga = await criarVaga({ userId, collaboratorId: colab.id, status: "escalado", phase: "escalacao", needsTicket: true });
  return { vaga, colab };
}

describe("POST /api/tickets e POST /api/accommodations: status derivado da vaga", () => {
  it("passagem em vaga 'escalado' → 'passagem_comprada' (inclusionStatus na resposta e no banco)", async () => {
    const { agent, user } = await agenteLogado("purchasing");
    const { vaga } = await vagaEscalada(user.id);
    const res = await mutacao(agent.post("/api/tickets")).send({
      teamInclusionId: vaga.id, transportType: "aereo", ticketStatus: "comprada", purchaseOrderNumber: "OC-123",
    });
    expect(res.status).toBe(200);
    expect(res.body.teamInclusionId).toBe(vaga.id);
    expect(res.body.updatedBy).toBe(user.id);
    expect(res.body.inclusionStatus).toBe("passagem_comprada");
    const noBanco = await ctx.storage.getTeamInclusion(vaga.id);
    expect(noBanco?.status).toBe("passagem_comprada");
    expect(noBanco?.phase).toBe("passagem");
  });

  it("hospedagem depois da passagem → 'hospedagem_passagem_comprada'", async () => {
    const { agent, user } = await agenteLogado("admin");
    const { vaga } = await vagaEscalada(user.id);
    expect((await mutacao(agent.post("/api/tickets")).send({ teamInclusionId: vaga.id, transportType: "aereo" })).body.inclusionStatus).toBe("passagem_comprada");

    const res = await mutacao(agent.post("/api/accommodations")).send({
      teamInclusionId: vaga.id, hotelName: "Hotel Central", hotelStatus: "reservada", checkInDate: "2099-10-10", checkOutDate: "2099-10-12",
    });
    expect(res.status).toBe(200);
    expect(res.body.inclusionStatus).toBe("hospedagem_passagem_comprada");
    const noBanco = await ctx.storage.getTeamInclusion(vaga.id);
    expect(noBanco?.status).toBe("hospedagem_passagem_comprada");
    expect(noBanco?.phase).toBe("hospedagem");
  });

  it("hospedagem SEM nome de hotel não conta: a vaga continua 'escalado'", async () => {
    const { agent, user } = await agenteLogado("admin");
    const { vaga } = await vagaEscalada(user.id);
    const res = await mutacao(agent.post("/api/accommodations")).send({ teamInclusionId: vaga.id, hotelStatus: "pendente" });
    expect(res.status).toBe(200);
    expect(res.body.inclusionStatus).toBeUndefined();
    expect((await ctx.storage.getTeamInclusion(vaga.id))?.status).toBe("escalado");
  });

  it("passagem em vaga só 'planejado' (não confirmada) grava a passagem mas não muda o status", async () => {
    const { agent, user } = await agenteLogado("admin");
    const vaga = await criarVaga({ userId: user.id });
    const res = await mutacao(agent.post("/api/tickets")).send({ teamInclusionId: vaga.id, transportType: "rodoviario" });
    expect(res.status).toBe(200);
    expect(res.body.inclusionStatus).toBeUndefined();
    expect((await ctx.storage.getTeamInclusion(vaga.id))?.status).toBe("planejado");
  });

  it("passagem por function_area → 403", async () => {
    const admin = await agenteLogado("admin");
    const { vaga } = await vagaEscalada(admin.user.id);
    const { agent } = await agenteLogado("function_area");
    const res = await mutacao(agent.post("/api/tickets")).send({ teamInclusionId: vaga.id, transportType: "aereo" });
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/team-inclusions/:id com status no corpo", () => {
  it("status igual ao atual ('passagem_comprada') → 200 no-op; outro campo do corpo é salvo", async () => {
    const { agent, user } = await agenteLogado("admin");
    const { vaga } = await vagaEscalada(user.id);
    expect((await mutacao(agent.post("/api/tickets")).send({ teamInclusionId: vaga.id, transportType: "aereo" })).body.inclusionStatus).toBe("passagem_comprada");

    const res = await mutacao(agent.patch(`/api/team-inclusions/${vaga.id}`)).send({ status: "passagem_comprada", phase: "passagem", observations: "cliente antigo manda o status" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("passagem_comprada");
    expect(res.body.phase).toBe("passagem");
    expect(res.body.observations).toBe("cliente antigo manda o status");
    expect((await ctx.storage.getTeamInclusion(vaga.id))?.status).toBe("passagem_comprada");
  });

  it("status diferente do atual → 400 (rotas dedicadas) e nada muda", async () => {
    const { agent, user } = await agenteLogado("admin");
    const { vaga } = await vagaEscalada(user.id);
    const res = await mutacao(agent.patch(`/api/team-inclusions/${vaga.id}`)).send({ status: "hospedagem_comprada", observations: "x" });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("rotas dedicadas");
    const noBanco = await ctx.storage.getTeamInclusion(vaga.id);
    expect(noBanco?.status).toBe("escalado");
    expect(noBanco?.observations).toBeNull();
  });
});

describe("POST /api/hotel-room-groups/mover", () => {
  async function quarto(eventId: string, colaboradorIds: string[]) {
    const [grupo] = await ctx.db.insert(ctx.schema.hotelRoomGroups).values({
      eventId, hotelName: "Hotel Central", roomType: "double", genderRule: "mixed", checkInDate: "2099-10-10", checkOutDate: "2099-10-12", suggested: false, confirmed: false,
    }).returning();
    for (const collaboratorId of colaboradorIds) {
      await ctx.db.insert(ctx.schema.hotelRoomGroupMembers).values({ hotelRoomGroupId: grupo.id, collaboratorId });
    }
    return grupo;
  }
  const membrosDe = (grupoId: string) =>
    ctx.db.select().from(ctx.schema.hotelRoomGroupMembers).where(eq(ctx.schema.hotelRoomGroupMembers.hotelRoomGroupId, grupoId));

  it("para quarto de OUTRO evento → 400 e a pessoa fica onde estava", async () => {
    const { agent } = await agenteLogado("purchasing");
    const eventoA = await criarEvento();
    const eventoB = await criarEvento();
    const pessoa = await criarColaborador();
    const origem = await quarto(eventoA.id, [pessoa.id]);
    const destino = await quarto(eventoB.id, []);

    const res = await mutacao(agent.post("/api/hotel-room-groups/mover")).send({ collaboratorId: pessoa.id, deGrupoId: origem.id, paraGrupoId: destino.id });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("outro evento");
    expect((await membrosDe(origem.id)).map((m) => m.collaboratorId)).toEqual([pessoa.id]);
    expect(await membrosDe(destino.id)).toHaveLength(0);
  });

  it("para quarto do MESMO evento → 200; quarto de origem vazio deixa de existir", async () => {
    const { agent } = await agenteLogado("purchasing");
    const evento = await criarEvento();
    const pessoa = await criarColaborador();
    const outra = await criarColaborador();
    const origem = await quarto(evento.id, [pessoa.id]);
    const destino = await quarto(evento.id, [outra.id]);

    const res = await mutacao(agent.post("/api/hotel-room-groups/mover")).send({ collaboratorId: pessoa.id, deGrupoId: origem.id, paraGrupoId: destino.id });
    expect(res.status).toBe(200);
    expect(res.body.destinoId).toBe(destino.id);
    expect((await membrosDe(destino.id)).map((m) => m.collaboratorId).sort()).toEqual([pessoa.id, outra.id].sort());
    const [origemDepois] = await ctx.db.select().from(ctx.schema.hotelRoomGroups).where(eq(ctx.schema.hotelRoomGroups.id, origem.id));
    expect(origemDepois).toBeUndefined();
  });

  it("em evento encerrado por purchasing → 403", async () => {
    const { agent } = await agenteLogado("purchasing");
    const encerrado = await criarEvento({ startDate: "2020-01-01", endDate: "2020-01-05" });
    const pessoa = await criarColaborador();
    const origem = await quarto(encerrado.id, [pessoa.id]);
    const res = await mutacao(agent.post("/api/hotel-room-groups/mover")).send({ collaboratorId: pessoa.id, deGrupoId: origem.id, paraGrupoId: null });
    expect(res.status).toBe(403);
    expect((await membrosDe(origem.id))).toHaveLength(1);
  });
});
