/**
 * "O hotel tem: Individual · Duplo · Triplo" na aba Quartos do Espelho (22/10,
 * dono: "no espelho ter a opção de colocar se o hotel não tem duplo ou triplo").
 *
 *  - PUT /api/events/:id/operational-mirror/hotel-valores grava `temDuplo` /
 *    `temTriplo` (hotel_tarifas_evento) e o GET do Espelho devolve em
 *    `valoresDoHotel.tipos`;
 *  - "Refazer sugestões" monta só o que o hotel tem e não mexe nos confirmados;
 *  - "Mover" recusa juntar num tipo que o hotel não tem.
 *
 * Rodar: `npx vitest run server/test/tipos-do-hotel.test.ts --maxWorkers=1`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  agenteLogado, criarApp, criarColaborador, criarEvento, criarFuncao, criarVaga, mutacao, unico, type Contexto,
} from "./harness";

let ctx: Contexto;
beforeAll(async () => { ctx = await criarApp(); });

const urlDosValores = (eventId: string) => `/api/events/${eventId}/operational-mirror/hotel-valores`;

/** N cenotécnicos com hospedagem e passagem 09→13 (as mesmas datas). */
async function equipeDeCeno(eventId: string, userId: string, n: number) {
  const ceno = await criarFuncao({ name: `Cenotécnica ${unico()}` });
  const pessoas = [];
  for (let i = 0; i < n; i++) {
    const c = await criarColaborador();
    const vaga = await criarVaga({ userId, eventId, functionId: ceno.id, collaboratorId: c.id, status: "escalado", phase: "escalacao" });
    await ctx.db.update(ctx.schema.teamInclusions).set({ needsAccommodation: true }).where(eq(ctx.schema.teamInclusions.id, vaga.id));
    await ctx.db.insert(ctx.schema.tickets).values({
      teamInclusionId: vaga.id, transportType: "aereo",
      actualDepartureDate: "2099-10-09", actualDepartureTime: "08:00", actualArrivalTime: "09:00",
      actualReturnDate: "2099-10-13", actualReturnTime: "11:00",
    });
    pessoas.push({ c, vaga });
  }
  return pessoas;
}

async function tamanhosDosQuartos(eventId: string) {
  const { hotelRoomGroups, hotelRoomGroupMembers } = ctx.schema;
  const grupos = await ctx.db.select().from(hotelRoomGroups).where(eq(hotelRoomGroups.eventId, eventId));
  const tamanhos = [];
  for (const g of grupos) {
    const membros = await ctx.db.select().from(hotelRoomGroupMembers).where(eq(hotelRoomGroupMembers.hotelRoomGroupId, g.id));
    tamanhos.push({ n: membros.length, tipo: g.roomType, confirmado: g.confirmed });
  }
  return tamanhos.sort((x, y) => y.n - x.n);
}

describe("PUT hotel-valores — temDuplo / temTriplo", () => {
  it("grava por evento, devolve no Espelho e registra na auditoria; padrão é ter os dois", async () => {
    const { agent } = await agenteLogado("purchasing");
    const evento = await criarEvento();

    const antes = await agent.get(`/api/events/${evento.id}/operational-mirror`);
    expect(antes.status).toBe(200);
    expect(antes.body.valoresDoHotel.tipos).toEqual({ duplo: true, triplo: true });

    const r = await mutacao(agent.put(urlDosValores(evento.id))).send({ temTriplo: false });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ temDuplo: true, temTriplo: false });
    const depois = await agent.get(`/api/events/${evento.id}/operational-mirror`);
    expect(depois.body.valoresDoHotel.tipos).toEqual({ duplo: true, triplo: false });

    // A tarifa gravada do tipo desmarcado fica guardada; mudar só a opção não apaga nada.
    await mutacao(agent.put(urlDosValores(evento.id))).send({ triploCentavos: 27000 });
    await mutacao(agent.put(urlDosValores(evento.id))).send({ temDuplo: false, temTriplo: true });
    const [linha] = await ctx.db.select().from(ctx.schema.hotelTarifasEvento).where(eq(ctx.schema.hotelTarifasEvento.eventId, evento.id));
    expect(linha).toMatchObject({ temDuplo: false, temTriplo: true, triploCentavos: 27000 });

    const { systemLogs } = ctx.schema;
    const logs = await ctx.db.select().from(systemLogs).where(and(eq(systemLogs.entityType, "hotel_valores"), eq(systemLogs.entityId, evento.id)));
    expect(logs).toHaveLength(3);
    expect(logs.some((l) => JSON.stringify([l.details, l.newData]).includes("apartamentos do hotel"))).toBe(true);
  });

  it("valor que não é booleano → 400 sem gravar; papel fora da logística → 403", async () => {
    const evento = await criarEvento();
    const { agent } = await agenteLogado("admin");
    for (const corpo of [{ temDuplo: "false" }, { temTriplo: 0 }, { temTriplo: null }]) {
      const r = await mutacao(agent.put(urlDosValores(evento.id))).send(corpo);
      expect(r.status).toBe(400);
    }
    const [linha] = await ctx.db.select().from(ctx.schema.hotelTarifasEvento).where(eq(ctx.schema.hotelTarifasEvento.eventId, evento.id));
    expect(linha).toBeUndefined();
    const { agent: area } = await agenteLogado("function_area");
    expect((await mutacao(area.put(urlDosValores(evento.id))).send({ temTriplo: false })).status).toBe(403);
  });
});

describe("Refazer sugestões com o que o hotel tem", () => {
  it("sem triplo: 5 cenotécnicos → 2 + 2 + 1; sem duplo: 3 + 1 + 1; sem os dois: 5 individuais", async () => {
    const { agent, user } = await agenteLogado("admin");
    const evento = await criarEvento();
    await equipeDeCeno(evento.id, user.id, 5);
    const refazer = async () => {
      const r = await mutacao(agent.post(`/api/events/${evento.id}/recalculate-logistics-suggestions`)).send({});
      expect(r.status).toBe(200);
      return (await tamanhosDosQuartos(evento.id)).map((q) => `${q.n}:${q.tipo}`);
    };

    expect(await refazer()).toEqual(["3:triple", "2:double"]);

    await mutacao(agent.put(urlDosValores(evento.id))).send({ temTriplo: false });
    expect(await refazer()).toEqual(["2:double", "2:double", "1:single"]);

    await mutacao(agent.put(urlDosValores(evento.id))).send({ temDuplo: false, temTriplo: true });
    expect(await refazer()).toEqual(["3:triple", "1:single", "1:single"]);

    await mutacao(agent.put(urlDosValores(evento.id))).send({ temDuplo: false, temTriplo: false });
    expect(await refazer()).toEqual(["1:single", "1:single", "1:single", "1:single", "1:single"]);
  });

  it("quarto CONFIRMADO que excede fica como está; só os não confirmados são refeitos", async () => {
    const { agent, user } = await agenteLogado("admin");
    const evento = await criarEvento();
    await equipeDeCeno(evento.id, user.id, 5);
    await mutacao(agent.post(`/api/events/${evento.id}/recalculate-logistics-suggestions`)).send({});
    const { hotelRoomGroups } = ctx.schema;
    const [triplo] = await ctx.db.select().from(hotelRoomGroups).where(and(eq(hotelRoomGroups.eventId, evento.id), eq(hotelRoomGroups.roomType, "triple")));
    expect((await mutacao(agent.post(`/api/hotel-room-groups/${triplo.id}/confirm`)).send({})).status).toBe(200);

    await mutacao(agent.put(urlDosValores(evento.id))).send({ temTriplo: false });
    await mutacao(agent.post(`/api/events/${evento.id}/recalculate-logistics-suggestions`)).send({});
    const quartos = await tamanhosDosQuartos(evento.id);
    expect(quartos.map((q) => `${q.n}:${q.tipo}:${q.confirmado ? "c" : "s"}`)).toEqual(["3:triple:c", "2:double:s"]);
  });
});

describe("Mover — não junta num tipo que o hotel não tem", () => {
  async function quarto(eventId: string, ids: string[], roomType: string) {
    const [g] = await ctx.db.insert(ctx.schema.hotelRoomGroups).values({
      eventId, hotelName: "Hotel Rio", roomType, genderRule: "none", checkInDate: "2099-10-10", checkOutDate: "2099-10-12", suggested: true, confirmed: false,
    }).returning();
    for (const collaboratorId of ids) await ctx.db.insert(ctx.schema.hotelRoomGroupMembers).values({ hotelRoomGroupId: g.id, collaboratorId });
    return g;
  }
  const membros = async (id: string) =>
    (await ctx.db.select().from(ctx.schema.hotelRoomGroupMembers).where(eq(ctx.schema.hotelRoomGroupMembers.hotelRoomGroupId, id))).length;

  it("sem duplo: individual + individual → 400; com duplo de novo, passa", async () => {
    const { agent, user } = await agenteLogado("purchasing");
    const evento = await criarEvento();
    const [a, b] = await equipeDeCeno(evento.id, user.id, 2);
    const qa = await quarto(evento.id, [a.c.id], "single");
    const qb = await quarto(evento.id, [b.c.id], "single");
    await mutacao(agent.put(urlDosValores(evento.id))).send({ temDuplo: false });

    const r = await mutacao(agent.post("/api/hotel-room-groups/mover")).send({ collaboratorId: a.c.id, deGrupoId: qa.id, paraGrupoId: qb.id });
    expect(r.status).toBe(400);
    expect(r.body.message).toBe("O hotel não tem apartamento duplo.");
    expect(await membros(qb.id)).toBe(1);

    await mutacao(agent.put(urlDosValores(evento.id))).send({ temDuplo: true });
    const ok = await mutacao(agent.post("/api/hotel-room-groups/mover")).send({ collaboratorId: a.c.id, deGrupoId: qa.id, paraGrupoId: qb.id });
    expect(ok.status).toBe(200);
  });

  it("sem triplo: terceiro cenotécnico no duplo → 400; sem duplo, tirar um do triplo (o passo do meio de uma troca) é permitido", async () => {
    const { agent, user } = await agenteLogado("purchasing");
    const evento = await criarEvento();
    const [a, b, c] = await equipeDeCeno(evento.id, user.id, 3);
    const duplo = await quarto(evento.id, [a.c.id, b.c.id], "double");
    const single = await quarto(evento.id, [c.c.id], "single");
    await mutacao(agent.put(urlDosValores(evento.id))).send({ temTriplo: false });
    const r = await mutacao(agent.post("/api/hotel-room-groups/mover")).send({ collaboratorId: c.c.id, deGrupoId: single.id, paraGrupoId: duplo.id });
    expect(r.status).toBe(400);
    expect(r.body.message).toBe("O hotel não tem apartamento triplo.");

    await mutacao(agent.put(urlDosValores(evento.id))).send({ temDuplo: false, temTriplo: true });
    const triplo = await quarto(evento.id, [a.c.id, b.c.id, c.c.id], "triple");
    const sai = await mutacao(agent.post("/api/hotel-room-groups/mover")).send({ collaboratorId: c.c.id, deGrupoId: triplo.id, paraGrupoId: null });
    expect(sai.status).toBe(200);
    expect(await membros(triplo.id)).toBe(2);
  });
});
