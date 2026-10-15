/**
 * POST /api/uber-groups/mover — horário dos carros (09/10).
 *
 * A tela dizia "o horário do carro de origem e do destino é recalculado", mas
 * a rota só trocava a pessoa de carro. Agora os dois carros são recalculados
 * pela regra do "Refazer sugestões" (antecedência antes do voo mais cedo da
 * direção do carro) — menos carro confirmado ou com horário decidido à mão.
 *
 * Rodar: `npx vitest run server/test/uber-mover-horario.test.ts`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ANTECEDENCIA_MIN, horaDosMinutos, minutosDaHora } from "@shared/uber-routing";
import { agenteLogado, criarApp, criarColaborador, criarEvento, criarVaga, mutacao, type Contexto } from "./harness";

let ctx: Contexto;

beforeAll(async () => {
  ctx = await criarApp();
});

const DIA = "2099-10-09";
/** Horário do carro para o voo mais cedo dado (antecedência padrão). */
const carroPara = (voo: string) => horaDosMinutos(minutosDaHora(voo)! - ANTECEDENCIA_MIN);

/** Pessoa escalada no evento com voo de IDA no DIA, no horário dado. */
async function pessoaComVoo(eventId: string, userId: string, horaDoVoo: string) {
  const colab = await criarColaborador();
  const vaga = await criarVaga({ eventId, userId, collaboratorId: colab.id, status: "escalado", phase: "escalacao" });
  await ctx.db.insert(ctx.schema.tickets).values({
    teamInclusionId: vaga.id, departureAirport: "CGH", actualDepartureDate: DIA, actualDepartureTime: horaDoVoo,
  } as typeof ctx.schema.tickets.$inferInsert);
  return colab.id;
}

type Carro = Partial<typeof ctx.schema.uberGroups.$inferInsert>;
async function carro(eventId: string, membros: string[], campos: Carro) {
  const [g] = await ctx.db.insert(ctx.schema.uberGroups).values({
    eventId, direction: "ida", origin: "Norte", destination: "CGH", date: DIA, status: "sugerido", ...campos,
  }).returning();
  for (const collaboratorId of membros) await ctx.db.insert(ctx.schema.uberGroupMembers).values({ uberGroupId: g.id, collaboratorId });
  return g;
}

const lerCarro = async (id: string) => (await ctx.db.select().from(ctx.schema.uberGroups).where(eq(ctx.schema.uberGroups.id, id)))[0];

describe("POST /api/uber-groups/mover — horário", () => {
  it("recalcula origem e destino pelo voo mais cedo de quem fica em cada um", async () => {
    const { agent, user } = await agenteLogado("production");
    const evento = await criarEvento();
    const ana = await pessoaComVoo(evento.id, user.id, "08:00");
    const bia = await pessoaComVoo(evento.id, user.id, "06:00");
    const caio = await pessoaComVoo(evento.id, user.id, "10:00");
    const c1 = await carro(evento.id, [ana, bia], { time: carroPara("06:00"), suggestedTime: carroPara("06:00") });
    const c2 = await carro(evento.id, [caio], { time: carroPara("10:00"), suggestedTime: carroPara("10:00") });

    const res = await mutacao(agent.post("/api/uber-groups/mover")).send({ collaboratorId: bia, deGrupoId: c1.id, paraGrupoId: c2.id });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.horarioMantido).toEqual([]);

    // Origem fica só com o voo das 08:00; destino passa a ter o das 06:00.
    expect(await lerCarro(c1.id)).toMatchObject({ time: carroPara("08:00"), suggestedTime: carroPara("08:00") });
    expect(await lerCarro(c2.id)).toMatchObject({ time: carroPara("06:00"), suggestedTime: carroPara("06:00") });
  });

  it("carro novo nasce com o horário do voo de quem entra", async () => {
    const { agent, user } = await agenteLogado("production");
    const evento = await criarEvento();
    const ana = await pessoaComVoo(evento.id, user.id, "05:00");
    const bia = await pessoaComVoo(evento.id, user.id, "06:30");
    const c1 = await carro(evento.id, [ana, bia], { time: carroPara("05:00"), suggestedTime: carroPara("05:00") });

    const res = await mutacao(agent.post("/api/uber-groups/mover")).send({ collaboratorId: bia, deGrupoId: c1.id, paraGrupoId: null });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await lerCarro(res.body.destinoId)).toMatchObject({ time: carroPara("06:30"), suggestedTime: carroPara("06:30"), manualTime: null });
    expect((await lerCarro(c1.id)).time).toBe(carroPara("05:00"));
  });

  it("NÃO mexe em horário ajustado à mão (manualTime) nem em carro confirmado — e a resposta diz quais", async () => {
    const { agent, user } = await agenteLogado("production");
    const evento = await criarEvento();
    const ana = await pessoaComVoo(evento.id, user.id, "08:00");
    const bia = await pessoaComVoo(evento.id, user.id, "06:00");
    const caio = await pessoaComVoo(evento.id, user.id, "10:00");
    const c1 = await carro(evento.id, [ana, bia], { time: "02:45", suggestedTime: carroPara("06:00"), manualTime: "02:45" });
    const c2 = await carro(evento.id, [caio], { time: carroPara("10:00"), suggestedTime: carroPara("10:00"), confirmed: true, status: "confirmado" });

    const res = await mutacao(agent.post("/api/uber-groups/mover")).send({ collaboratorId: bia, deGrupoId: c1.id, paraGrupoId: c2.id });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.horarioMantido).toEqual(["origem", "destino"]);
    expect(await lerCarro(c1.id)).toMatchObject({ time: "02:45", manualTime: "02:45" });
    expect((await lerCarro(c2.id)).time).toBe(carroPara("10:00"));
  });

  it("sem marca: horário que não bate com o calculado é tratado como decisão humana; o que bate é recalculado", async () => {
    const { agent, user } = await agenteLogado("production");
    const evento = await criarEvento();
    const ana = await pessoaComVoo(evento.id, user.id, "08:00");
    const bia = await pessoaComVoo(evento.id, user.id, "06:00");
    const caio = await pessoaComVoo(evento.id, user.id, "10:00");
    // Carros antigos, sem suggestedTime: c1 tem um horário que a conta não dá
    // (alguém mudou `time` direto); c2 tem exatamente o calculado.
    const c1 = await carro(evento.id, [ana, bia], { time: "02:00", suggestedTime: null });
    const c2 = await carro(evento.id, [caio], { time: carroPara("10:00"), suggestedTime: null });

    const res = await mutacao(agent.post("/api/uber-groups/mover")).send({ collaboratorId: bia, deGrupoId: c1.id, paraGrupoId: c2.id });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.horarioMantido).toEqual(["origem"]);
    expect((await lerCarro(c1.id)).time).toBe("02:00");
    expect(await lerCarro(c2.id)).toMatchObject({ time: carroPara("06:00"), suggestedTime: carroPara("06:00") });
  });
});
