/**
 * Rooming list em PDF (09/10): a rota só audita e, quando pedido por quem vê
 * dados pessoais, devolve o CPF dos hóspedes DAQUELE hotel. O CPF nunca entra
 * no log de auditoria.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { agenteLogado, criarApp, criarColaborador, criarEvento, mutacao, unico, type Contexto } from "./harness";

let ctx: Contexto;
beforeAll(async () => { ctx = await criarApp(); });

async function quarto(eventId: string, hotelName: string | null, colaboradorIds: string[]) {
  const [grupo] = await ctx.db.insert(ctx.schema.hotelRoomGroups).values({
    eventId, hotelName, roomType: "double", genderRule: "none", checkInDate: "2099-10-10", checkOutDate: "2099-10-12", suggested: true, confirmed: false,
  }).returning();
  for (const collaboratorId of colaboradorIds) await ctx.db.insert(ctx.schema.hotelRoomGroupMembers).values({ hotelRoomGroupId: grupo.id, collaboratorId });
  return grupo;
}

/** Colaborador com CPF de 11 dígitos (o do harness tem documento fictício). */
async function comCpf(cpf: string) {
  const c = await criarColaborador({ fullName: `Hóspede ${unico()}` });
  await ctx.db.update(ctx.schema.collaborators).set({ officialDocument: cpf, documentType: "cpf" }).where(eq(ctx.schema.collaborators.id, c.id));
  return c;
}

describe("POST /api/events/:id/operational-mirror/rooming-list", () => {
  it("admin com CPF: só os hóspedes do hotel pedido; auditoria sem CPF", async () => {
    const evento = await criarEvento();
    const sufixo = String(Date.now()).slice(-6);
    const a = await comCpf(`11122${sufixo}`);
    const b = await criarColaborador(); // documento não é CPF de 11 dígitos
    const outro = await comCpf(`99988${sufixo}`);
    await quarto(evento.id, "Hotel Rio", [a.id, b.id]);
    await quarto(evento.id, "Outro Hotel", [outro.id]);

    const { agent } = await agenteLogado("admin");
    const res = await mutacao(agent.post(`/api/events/${evento.id}/operational-mirror/rooming-list`)).send({ hotel: " hotel  rio ", incluirCpf: true });
    expect(res.status).toBe(200);
    expect(res.body.cpfs).toEqual({ [a.id]: `11122${sufixo}` });

    const logs = await ctx.db.select().from(ctx.schema.systemLogs)
      .where(and(eq(ctx.schema.systemLogs.entityId, evento.id), eq(ctx.schema.systemLogs.action, "export")));
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs[0])).not.toContain(`11122${sufixo}`);
    expect(JSON.stringify(logs[0].newData)).toContain("rooming list");
  });

  it("sem CPF pedido: nada de CPF na resposta; Produção não pode pedir CPF", async () => {
    const evento = await criarEvento();
    const a = await comCpf(`33344${String(Date.now()).slice(-6)}`);
    await quarto(evento.id, "Hotel Rio", [a.id]);

    const { agent } = await agenteLogado("production");
    const sem = await mutacao(agent.post(`/api/events/${evento.id}/operational-mirror/rooming-list`)).send({ hotel: "Hotel Rio", incluirCpf: false });
    expect(sem.status).toBe(200);
    expect(sem.body.cpfs).toEqual({});
    const com = await mutacao(agent.post(`/api/events/${evento.id}/operational-mirror/rooming-list`)).send({ hotel: "Hotel Rio", incluirCpf: true });
    expect(com.status).toBe(403);
  });

  it("hotel sem quartos no evento → 404; sem hotel → 400", async () => {
    const evento = await criarEvento();
    const { agent } = await agenteLogado("admin");
    expect((await mutacao(agent.post(`/api/events/${evento.id}/operational-mirror/rooming-list`)).send({ hotel: "Nenhum" })).status).toBe(404);
    expect((await mutacao(agent.post(`/api/events/${evento.id}/operational-mirror/rooming-list`)).send({ hotel: "" })).status).toBe(400);
  });
});
