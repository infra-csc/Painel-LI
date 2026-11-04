/**
 * Fornecedor e forma de pagamento da reserva de hotel (04/11) — rotas do Espelho.
 * A regra da forma vale no servidor, e separar, mover e refazer sugestões não perdem o canal.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { agenteLogado, criarApp, criarColaborador, criarEvento, criarFuncao, criarUsuario, criarVaga, mutacao, type Contexto } from "./harness";

let ctx: Contexto;
beforeAll(async () => { ctx = await criarApp(); });

async function quarto(eventId: string, extra: Record<string, unknown> = {}): Promise<string> {
  const [g] = await ctx.db.insert(ctx.schema.hotelRoomGroups).values({
    eventId, hotelName: "Hotel A", roomType: "double", genderRule: "male", checkInDate: "2099-10-10", checkOutDate: "2099-10-12", suggested: true, confirmed: false, ...extra,
  }).returning();
  return g.id;
}
const ler = async (id: string) => (await ctx.db.select().from(ctx.schema.hotelRoomGroups).where(eq(ctx.schema.hotelRoomGroups.id, id)))[0];

describe("PATCH /api/hotel-room-groups/:id — canal da reserva", () => {
  it("agência e site gravam a forma sozinhos; trocar para direto zera até escolher; tirar limpa os dois", async () => {
    const evento = await criarEvento();
    const id = await quarto(evento.id);
    const { agent } = await agenteLogado("purchasing");
    const patch = (corpo: object) => mutacao(agent.patch(`/api/hotel-room-groups/${id}`)).send(corpo);

    expect((await patch({ fornecedor: "lca" })).status).toBe(200);
    expect(await ler(id)).toMatchObject({ fornecedor: "lca", formaPagamento: "faturado" });
    await patch({ fornecedor: "airbnb" });
    expect(await ler(id)).toMatchObject({ fornecedor: "airbnb", formaPagamento: "cartao" });
    await patch({ fornecedor: "direto" });
    expect(await ler(id)).toMatchObject({ fornecedor: "direto", formaPagamento: null });
    await patch({ formaPagamento: "pix" });
    expect(await ler(id)).toMatchObject({ fornecedor: "direto", formaPagamento: "pix" });
    await patch({ fornecedor: null, formaPagamento: null });
    expect(await ler(id)).toMatchObject({ fornecedor: null, formaPagamento: null });
  });

  it("recusa forma que o fornecedor não aceita e fornecedor desconhecido, sem gravar nada", async () => {
    const evento = await criarEvento();
    const id = await quarto(evento.id, { fornecedor: "direto", formaPagamento: "pix" });
    const { agent } = await agenteLogado("purchasing");
    expect((await mutacao(agent.patch(`/api/hotel-room-groups/${id}`)).send({ formaPagamento: "cartao" })).status).toBe(400);
    expect((await mutacao(agent.patch(`/api/hotel-room-groups/${id}`)).send({ fornecedor: "booking" })).status).toBe(400);
    expect(await ler(id)).toMatchObject({ fornecedor: "direto", formaPagamento: "pix" });
  });

  it("quarto confirmado também aceita; quem não é da logística leva 403", async () => {
    const evento = await criarEvento();
    const id = await quarto(evento.id, { confirmed: true });
    const { agent } = await agenteLogado("purchasing");
    expect((await mutacao(agent.patch(`/api/hotel-room-groups/${id}`)).send({ fornecedor: "onfly" })).status).toBe(200);
    expect(await ler(id)).toMatchObject({ fornecedor: "onfly", formaPagamento: "faturado", confirmed: true });
    const fora = await agenteLogado("function_area");
    expect((await mutacao(fora.agent.patch(`/api/hotel-room-groups/${id}`)).send({ fornecedor: "lca" })).status).toBe(403);
    expect(await ler(id)).toMatchObject({ fornecedor: "onfly" });
  });

  it("dois quartos do mesmo hotel e evento podem ter canais diferentes", async () => {
    const evento = await criarEvento();
    const [a, b] = [await quarto(evento.id), await quarto(evento.id)];
    const { agent } = await agenteLogado("purchasing");
    await mutacao(agent.patch(`/api/hotel-room-groups/${a}`)).send({ fornecedor: "direto", formaPagamento: "faturado" });
    await mutacao(agent.patch(`/api/hotel-room-groups/${b}`)).send({ fornecedor: "flytour" });
    expect(await ler(a)).toMatchObject({ hotelName: "Hotel A", fornecedor: "direto", formaPagamento: "faturado" });
    expect(await ler(b)).toMatchObject({ hotelName: "Hotel A", fornecedor: "flytour", formaPagamento: "faturado" });
  });

  it("separar o quarto: os novos continuam com o canal da reserva", async () => {
    const evento = await criarEvento();
    const id = await quarto(evento.id, { fornecedor: "flytour", formaPagamento: "faturado" });
    const [c1, c2] = [await criarColaborador(), await criarColaborador()];
    await ctx.db.insert(ctx.schema.hotelRoomGroupMembers).values([
      { hotelRoomGroupId: id, collaboratorId: c1.id, confirmed: false },
      { hotelRoomGroupId: id, collaboratorId: c2.id, confirmed: false },
    ]);
    const { agent } = await agenteLogado("purchasing");
    expect((await mutacao(agent.post(`/api/hotel-room-groups/${id}/separar`)).send({})).status).toBe(200);
    const todos = await ctx.db.select().from(ctx.schema.hotelRoomGroups).where(eq(ctx.schema.hotelRoomGroups.eventId, evento.id));
    expect(todos).toHaveLength(2);
    for (const q of todos) expect(q).toMatchObject({ fornecedor: "flytour", formaPagamento: "faturado" });
  });

  it("refazer sugestões: o quarto refeito continua com o canal de quem estava nele", async () => {
    const evento = await criarEvento();
    const dono = await criarUsuario("admin");
    const funcao = await criarFuncao();
    const { collaborators, teamInclusions, accommodations, hotelRoomGroupMembers, hotelRoomGroups } = ctx.schema;
    const pessoas = [await criarColaborador(), await criarColaborador()];
    for (const c of pessoas) {
      await ctx.db.update(collaborators).set({ gender: "male" }).where(eq(collaborators.id, c.id));
      const vaga = await criarVaga({ eventId: evento.id, functionId: funcao.id, collaboratorId: c.id, userId: dono.id });
      await ctx.db.update(teamInclusions).set({ status: "hospedagem_passagem_comprada", phase: "hospedagem", needsAccommodation: true }).where(eq(teamInclusions.id, vaga.id));
      await ctx.db.insert(accommodations).values({ teamInclusionId: vaga.id, hotelName: "Hotel A", checkInDate: "2099-10-10", checkOutDate: "2099-10-12", hotelStatus: "reservada" });
    }
    const id = await quarto(evento.id, { fornecedor: "direto", formaPagamento: "pix" });
    await ctx.db.insert(hotelRoomGroupMembers).values(pessoas.map((c) => ({ hotelRoomGroupId: id, collaboratorId: c.id, confirmed: false })));
    const { agent } = await agenteLogado("purchasing");
    const r = await mutacao(agent.post(`/api/events/${evento.id}/recalculate-logistics-suggestions`)).send({});
    expect(r.status, r.text).toBe(200);
    const depois = await ctx.db.select().from(hotelRoomGroups).where(eq(hotelRoomGroups.eventId, evento.id));
    expect(depois.length).toBeGreaterThan(0);
    expect(depois.some((q) => q.id === id)).toBe(false);
    for (const q of depois) expect(q).toMatchObject({ fornecedor: "direto", formaPagamento: "pix" });
  });
});
