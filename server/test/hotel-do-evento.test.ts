/**
 * Hotel do evento e PDF sem hotel (15/10) — rotas da aba Quartos do Espelho.
 *
 *  - PATCH /api/events/:id/operational-mirror/hotel aplica o hotel a todos os
 *    quartos numa transação: pula confirmados, só troca quarto em OUTRO hotel
 *    com `trocarOutros`, leva junto quem seguia o hotel antigo; logística
 *    apenas; trava de evento encerrado; auditoria.
 *  - POST .../rooming-list com `semHotel: true` (o PDF dos quartos sem hotel).
 *
 * Rodar: `npx vitest run server/test/hotel-do-evento.test.ts --maxWorkers=1`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { agenteLogado, criarApp, criarColaborador, criarEvento, mutacao, type Contexto } from "./harness";

let ctx: Contexto;
beforeAll(async () => { ctx = await criarApp(); });

async function quarto(eventId: string, hotelName: string | null, confirmed = false): Promise<string> {
  const { hotelRoomGroups } = ctx.schema;
  const [g] = await ctx.db.insert(hotelRoomGroups).values({
    eventId, hotelName, roomType: "single", genderRule: "male",
    checkInDate: "2099-10-10", checkOutDate: "2099-10-12", suggested: true, confirmed,
  }).returning();
  return g.id;
}

async function hoteis(eventId: string): Promise<Record<string, string | null>> {
  const { hotelRoomGroups } = ctx.schema;
  const linhas = await ctx.db.select().from(hotelRoomGroups).where(eq(hotelRoomGroups.eventId, eventId));
  return Object.fromEntries(linhas.map((l) => [l.id, l.hotelName]));
}

describe("PATCH /api/events/:id/operational-mirror/hotel", () => {
  it("aplica aos sem hotel e aos que seguiam o hotel antigo; pula confirmado; outro hotel só com trocarOutros; audita", async () => {
    const evento = await criarEvento();
    const a1 = await quarto(evento.id, "Hotel A");
    const a2 = await quarto(evento.id, "Hotel A");
    const sem = await quarto(evento.id, null);
    const outro = await quarto(evento.id, "Hotel X");
    const confirmado = await quarto(evento.id, null, true);
    const { agent } = await agenteLogado("purchasing");

    const res = await mutacao(agent.patch(`/api/events/${evento.id}/operational-mirror/hotel`)).send({ hotelName: "  Hotel   B " });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ hotel: "Hotel B", aplicados: 3, confirmadosMantidos: 1, outrosMantidos: 1, totalDeQuartos: 5 });
    expect(await hoteis(evento.id)).toEqual({ [a1]: "Hotel B", [a2]: "Hotel B", [sem]: "Hotel B", [outro]: "Hotel X", [confirmado]: null });

    const todos = await mutacao(agent.patch(`/api/events/${evento.id}/operational-mirror/hotel`)).send({ hotelName: "Hotel B", trocarOutros: true });
    expect(todos.status).toBe(200);
    expect(todos.body).toMatchObject({ aplicados: 1, confirmadosMantidos: 1, outrosMantidos: 0 });
    expect((await hoteis(evento.id))[outro]).toBe("Hotel B");
    expect((await hoteis(evento.id))[confirmado]).toBeNull();

    const { systemLogs } = ctx.schema;
    const logs = await ctx.db.select().from(systemLogs)
      .where(and(eq(systemLogs.entityType, "hotel_room_group"), eq(systemLogs.entityId, evento.id)));
    expect(logs.length).toBe(2);
  });

  it("nome vazio → 400; papel fora da logística → 403", async () => {
    const evento = await criarEvento();
    const q = await quarto(evento.id, null);
    const { agent } = await agenteLogado("admin");
    const vazio = await mutacao(agent.patch(`/api/events/${evento.id}/operational-mirror/hotel`)).send({ hotelName: "   " });
    expect(vazio.status).toBe(400);

    const { agent: area } = await agenteLogado("function_area");
    const negado = await mutacao(area.patch(`/api/events/${evento.id}/operational-mirror/hotel`)).send({ hotelName: "Hotel C" });
    expect(negado.status).toBe(403);
    expect((await hoteis(evento.id))[q]).toBeNull();
  });

  it("evento encerrado → 403 (mesma trava da edição de hotel do quarto)", async () => {
    const encerrado = await criarEvento({ startDate: "2020-01-01", endDate: "2020-01-05" });
    const q = await quarto(encerrado.id, null);
    const { agent } = await agenteLogado("purchasing");
    const res = await mutacao(agent.patch(`/api/events/${encerrado.id}/operational-mirror/hotel`)).send({ hotelName: "Hotel C" });
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("Evento encerrado");
    expect((await hoteis(encerrado.id))[q]).toBeNull();
  });
});

describe("Quarto novo nasce no hotel do evento", () => {
  it("separar um quarto sem hotel: os novos ganham o hotel do evento", async () => {
    const evento = await criarEvento();
    await quarto(evento.id, "Hotel A");
    await quarto(evento.id, "Hotel A");
    const dividido = await quarto(evento.id, null);
    const { hotelRoomGroupMembers } = ctx.schema;
    const [c1, c2] = [await criarColaborador(), await criarColaborador()];
    await ctx.db.insert(hotelRoomGroupMembers).values([
      { hotelRoomGroupId: dividido, collaboratorId: c1.id, confirmed: false },
      { hotelRoomGroupId: dividido, collaboratorId: c2.id, confirmed: false },
    ]);
    const { agent } = await agenteLogado("purchasing");
    const res = await mutacao(agent.post(`/api/hotel-room-groups/${dividido}/separar`)).send({});
    expect(res.status).toBe(200);
    // 2 quartos de antes + o separado (novo); o que sobrou do original fica sem hotel.
    const depois = await hoteis(evento.id);
    expect(Object.values(depois).filter((h) => h === "Hotel A")).toHaveLength(3);
    expect(depois[dividido]).toBeNull();
  });
});

describe("POST .../rooming-list com semHotel", () => {
  it("quartos sem hotel → 200 e auditoria; todos com hotel → 404; sem hotel e sem semHotel → 400", async () => {
    const evento = await criarEvento();
    await quarto(evento.id, null);
    const { agent } = await agenteLogado("purchasing");
    const ok = await mutacao(agent.post(`/api/events/${evento.id}/operational-mirror/rooming-list`)).send({ semHotel: true, nomeDoHotelNoPdf: "Hotel Provisório" });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ cpfs: {} });

    const faltando = await mutacao(agent.post(`/api/events/${evento.id}/operational-mirror/rooming-list`)).send({});
    expect(faltando.status).toBe(400);

    const cheio = await criarEvento();
    await quarto(cheio.id, "Hotel A");
    const nenhum = await mutacao(agent.post(`/api/events/${cheio.id}/operational-mirror/rooming-list`)).send({ semHotel: true });
    expect(nenhum.status).toBe(404);
  });
});
