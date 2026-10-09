/**
 * Quartos do Espelho (09/10, Night Run 1ª Etapa Rio): cenotécnica em quarto
 * TRIPLO, lotação e tipo no "Mover", e datas do quarto vindas da PASSAGEM.
 * Rodar: `npx vitest run server/test/quartos-triplo-e-datas.test.ts --maxWorkers=1`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  agenteLogado,
  criarApp,
  criarColaborador,
  criarEvento,
  criarFuncao,
  criarVaga,
  mutacao,
  unico,
  type Contexto,
} from "./harness";

let ctx: Contexto;

beforeAll(async () => {
  ctx = await criarApp();
});

async function quarto(eventId: string, colaboradorIds: string[], roomType = "double") {
  const [grupo] = await ctx.db.insert(ctx.schema.hotelRoomGroups).values({
    eventId, hotelName: "Hotel Rio", roomType, genderRule: "none", checkInDate: "2099-10-10", checkOutDate: "2099-10-12", suggested: true, confirmed: false,
  }).returning();
  for (const collaboratorId of colaboradorIds) {
    await ctx.db.insert(ctx.schema.hotelRoomGroupMembers).values({ hotelRoomGroupId: grupo.id, collaboratorId });
  }
  return grupo;
}
const grupo = async (id: string) =>
  (await ctx.db.select().from(ctx.schema.hotelRoomGroups).where(eq(ctx.schema.hotelRoomGroups.id, id)))[0];
const membrosDe = async (grupoId: string) =>
  (await ctx.db.select().from(ctx.schema.hotelRoomGroupMembers).where(eq(ctx.schema.hotelRoomGroupMembers.hotelRoomGroupId, grupoId))).map((m) => m.collaboratorId);

/** Pessoas escaladas no evento com a função dada. */
async function equipe(eventId: string, userId: string, funcaoId: string, n: number) {
  const pessoas = [];
  for (let i = 0; i < n; i++) {
    const c = await criarColaborador();
    const vaga = await criarVaga({ userId, eventId, functionId: funcaoId, collaboratorId: c.id, status: "escalado", phase: "escalacao" });
    pessoas.push({ c, vaga });
  }
  return pessoas;
}

describe("POST /api/hotel-room-groups/mover — lotação e tipo do quarto", () => {
  it("terceiro cenotécnico entra no duplo de cenotécnica → vira TRIPLO; origem individual some", async () => {
    const { agent, user } = await agenteLogado("purchasing");
    const evento = await criarEvento();
    const ceno = await criarFuncao({ name: `Cenotécnica ${unico()}` });
    const [a, b, c] = await equipe(evento.id, user.id, ceno.id, 3);
    const duplo = await quarto(evento.id, [a.c.id, b.c.id]);
    const single = await quarto(evento.id, [c.c.id], "single");

    const res = await mutacao(agent.post("/api/hotel-room-groups/mover")).send({ collaboratorId: c.c.id, deGrupoId: single.id, paraGrupoId: duplo.id });
    expect(res.status).toBe(200);
    expect((await grupo(duplo.id)).roomType).toBe("triple");
    expect((await membrosDe(duplo.id)).sort()).toEqual([a.c.id, b.c.id, c.c.id].sort());
    expect(await grupo(single.id)).toBeUndefined();
  });

  it("terceiro de OUTRA função num duplo → 400 com o motivo, e nada muda", async () => {
    const { agent, user } = await agenteLogado("purchasing");
    const evento = await criarEvento();
    const ceno = await criarFuncao({ name: `Cenotécnica ${unico()}` });
    const sup = await criarFuncao({ name: `Sup Ceno ${unico()}` });
    const [a, b] = await equipe(evento.id, user.id, ceno.id, 2);
    const [s] = await equipe(evento.id, user.id, sup.id, 1);
    const duplo = await quarto(evento.id, [a.c.id, b.c.id]);
    const single = await quarto(evento.id, [s.c.id], "single");

    const res = await mutacao(agent.post("/api/hotel-room-groups/mover")).send({ collaboratorId: s.c.id, deGrupoId: single.id, paraGrupoId: duplo.id });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Quarto triplo só para a equipe de cenotécnica — os três ocupantes precisam ser de cenotécnica.");
    expect(await membrosDe(duplo.id)).toHaveLength(2);
    expect(await membrosDe(single.id)).toEqual([s.c.id]);
    expect((await grupo(duplo.id)).roomType).toBe("double");
  });

  it("quarto com 3 não recebe o quarto ocupante → 400", async () => {
    const { agent, user } = await agenteLogado("purchasing");
    const evento = await criarEvento();
    const ceno = await criarFuncao({ name: `Cenotécnica ${unico()}` });
    const [a, b, c, d] = await equipe(evento.id, user.id, ceno.id, 4);
    const triplo = await quarto(evento.id, [a.c.id, b.c.id, c.c.id], "triple");
    const single = await quarto(evento.id, [d.c.id], "single");

    const res = await mutacao(agent.post("/api/hotel-room-groups/mover")).send({ collaboratorId: d.c.id, deGrupoId: single.id, paraGrupoId: triplo.id });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Um quarto comporta no máximo 3 pessoas.");
    expect(await membrosDe(triplo.id)).toHaveLength(3);
  });

  it("sair de um triplo para quarto novo: origem vira DUPLO, o novo é single", async () => {
    const { agent, user } = await agenteLogado("purchasing");
    const evento = await criarEvento();
    const ceno = await criarFuncao({ name: `cenotecnica ${unico()}` });
    const [a, b, c] = await equipe(evento.id, user.id, ceno.id, 3);
    const triplo = await quarto(evento.id, [a.c.id, b.c.id, c.c.id], "triple");

    const res = await mutacao(agent.post("/api/hotel-room-groups/mover")).send({ collaboratorId: c.c.id, deGrupoId: triplo.id, paraGrupoId: null });
    expect(res.status).toBe(200);
    expect((await grupo(triplo.id)).roomType).toBe("double");
    expect((await grupo(res.body.destinoId)).roomType).toBe("single");
  });

  it("duplo de duas funções quaisquer continua permitido e o tipo acompanha", async () => {
    const { agent, user } = await agenteLogado("purchasing");
    const evento = await criarEvento();
    const kit = await criarFuncao({ name: `Kit ${unico()}` });
    const [a, b] = await equipe(evento.id, user.id, kit.id, 2);
    const sa = await quarto(evento.id, [a.c.id], "double"); // rótulo antigo errado
    const sb = await quarto(evento.id, [b.c.id], "single");

    const res = await mutacao(agent.post("/api/hotel-room-groups/mover")).send({ collaboratorId: a.c.id, deGrupoId: sa.id, paraGrupoId: sb.id });
    expect(res.status).toBe(200);
    expect((await grupo(sb.id)).roomType).toBe("double");
  });
});

describe("recalcular sugestões — triplo de cenotécnica e datas da passagem", () => {
  it("5 cenotécnicos com as mesmas datas → 1 triplo + 1 duplo; datas da passagem; aviso da hospedagem divergente", async () => {
    const { agent, user } = await agenteLogado("admin");
    const evento = await criarEvento();
    const ceno = await criarFuncao({ name: `Cenotécnica ${unico()}` });
    const pessoas = await equipe(evento.id, user.id, ceno.id, 5);
    for (const { vaga } of pessoas) {
      await ctx.db.update(ctx.schema.teamInclusions).set({ needsAccommodation: true }).where(eq(ctx.schema.teamInclusions.id, vaga.id));
      // Passagem 09→13 (volta 11:00); diária/escala 10→12; hospedagem reservada 10→12.
      await ctx.db.insert(ctx.schema.tickets).values({
        teamInclusionId: vaga.id, transportType: "aereo",
        actualDepartureDate: "2099-10-09", actualDepartureTime: "08:00", actualArrivalTime: "09:00",
        actualReturnDate: "2099-10-13", actualReturnTime: "11:00",
      });
      await ctx.db.insert(ctx.schema.accommodations).values({
        teamInclusionId: vaga.id, hotelName: "Hotel Rio", checkInDate: "2099-10-10", checkOutDate: "2099-10-12",
      });
    }

    const res = await mutacao(agent.post(`/api/events/${evento.id}/recalculate-logistics-suggestions`)).send({});
    expect(res.status).toBe(200);
    const grupos = await ctx.db.select().from(ctx.schema.hotelRoomGroups).where(eq(ctx.schema.hotelRoomGroups.eventId, evento.id));
    expect(grupos.map((g) => g.roomType).sort()).toEqual(["double", "triple"]);
    for (const g of grupos) {
      expect([g.checkInDate, g.checkOutDate]).toEqual(["2099-10-09", "2099-10-13"]);
      expect(g.notes).toBeNull(); // mesmas datas, sem observação
    }

    const espelho = await agent.get(`/api/events/${evento.id}/operational-mirror`);
    expect(espelho.status).toBe(200);
    const linha = espelho.body.rows.find((r: { teamInclusionId: string }) => r.teamInclusionId === pessoas[0].vaga.id);
    expect(linha.datasDoQuarto).toMatchObject({
      checkIn: "2099-10-09", checkOut: "2099-10-13", origemEntrada: "passagem", origemSaida: "passagem",
    });
    expect(linha.datasDoQuarto.divergencia.texto).toBe("Hospedagem reservada 10/10→12/10, passagem 09/10→13/10 — conferir");
  });
});
