/**
 * "Confirmar" o quarto (aba Quartos do Espelho) preenche a hospedagem da vaga
 * (23/10, dono: "no espelho operacional, quando colocarmos o hotel, refletir
 * na passagem" → "basicamente, quando confirmar, deve preencher lá na aba de
 * Hospedagem com os dados").
 *
 *  - Confirmar cria/atualiza a hospedagem de cada pessoa do quarto: hotel,
 *    check-in/out (o período no quarto, da passagem), tipo pela ocupação,
 *    diárias, valor pelos valores do hotel e "Divide o quarto com …"; o status
 *    da vaga anda pelo caminho de sempre; auditoria;
 *  - definir o hotel sem confirmar não preenche nada;
 *  - dado lançado à mão e diferente NÃO é sobrescrito (volta em `diferem`);
 *    "Usar os dados do quarto" (POST .../hospedagens) aplica;
 *  - reabrir não apaga; mover reabre; confirmar de novo atualiza;
 *  - permissão, evento encerrado, corpo inválido.
 *
 * Rodar: `npx vitest run server/test/hotel-na-hospedagem.test.ts --maxWorkers=1`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { agenteLogado, criarApp, criarColaborador, criarEvento, criarUsuario, criarVaga, mutacao, type Contexto } from "./harness";

let ctx: Contexto;
let donoDasVagas: string;
beforeAll(async () => {
  ctx = await criarApp();
  donoDasVagas = (await criarUsuario("admin")).id;
});

/** Vaga escalada que precisa de hospedagem, com a pessoa num quarto do evento. */
async function vagaNoQuarto(eventId: string, quartoId: string, extras: { status?: string; nome?: string } = {}) {
  const pessoa = await criarColaborador(extras.nome ? { fullName: extras.nome } : {});
  const vaga = await criarVaga({ eventId, userId: donoDasVagas, collaboratorId: pessoa.id, status: extras.status ?? "escalado", phase: "escalacao" });
  await ctx.db.update(ctx.schema.teamInclusions).set({ needsAccommodation: true }).where(eq(ctx.schema.teamInclusions.id, vaga.id));
  await ctx.db.insert(ctx.schema.hotelRoomGroupMembers).values({ hotelRoomGroupId: quartoId, collaboratorId: pessoa.id, confirmed: false });
  return { vaga, pessoa };
}

async function quarto(eventId: string, hotelName: string | null = "Hotel Ibis"): Promise<string> {
  const [g] = await ctx.db.insert(ctx.schema.hotelRoomGroups).values({
    eventId, hotelName, roomType: "double", genderRule: "male",
    checkInDate: "2099-10-10", checkOutDate: "2099-10-12", suggested: true, confirmed: false,
  }).returning();
  return g.id;
}

const hospedagens = (vagaId: string) =>
  ctx.db.select().from(ctx.schema.accommodations).where(eq(ctx.schema.accommodations.teamInclusionId, vagaId));
const statusDa = async (vagaId: string) =>
  (await ctx.db.select({ status: ctx.schema.teamInclusions.status }).from(ctx.schema.teamInclusions).where(eq(ctx.schema.teamInclusions.id, vagaId)))[0]?.status;

describe("Confirmar o quarto → hospedagem da vaga", () => {
  it("preenche hotel, datas (da passagem), tipo, diárias, valor e com quem divide; status anda; audita", async () => {
    const evento = await criarEvento();
    const q = await quarto(evento.id);
    const a = await vagaNoQuarto(evento.id, q, { nome: "Ana Souza" });
    const b = await vagaNoQuarto(evento.id, q, { status: "passagem_comprada", nome: "Bruno Lima" });
    // Passagem do Bruno: chega 09/10, volta 13/10 às 15h — o quarto segue a passagem.
    await ctx.db.insert(ctx.schema.tickets).values({
      teamInclusionId: b.vaga.id, transportType: "aereo",
      actualDepartureDate: "2099-10-09", actualDepartureTime: "10:00", actualArrivalTime: "12:00",
      actualReturnDate: "2099-10-13", actualReturnTime: "15:00",
    } as typeof ctx.schema.tickets.$inferInsert);
    const { agent } = await agenteLogado("purchasing");
    expect((await mutacao(agent.put(`/api/events/${evento.id}/operational-mirror/hotel-valores`)).send({ individualCentavos: 20000, duploCentavos: 30000 })).status).toBe(200);

    // Definir o hotel do evento NÃO preenche (só o Confirmar).
    expect((await mutacao(agent.patch(`/api/events/${evento.id}/operational-mirror/hotel`)).send({ hotelName: "Hotel Ibis" })).status).toBe(200);
    expect(await hospedagens(a.vaga.id)).toHaveLength(0);

    const res = await mutacao(agent.post(`/api/hotel-room-groups/${q}/confirm`)).send({});
    expect(res.status).toBe(200);
    expect(res.body.confirmed).toBe(true);
    expect(res.body.hospedagens).toMatchObject({ criadas: 2, atualizadas: 0, diferem: [], statusAlterados: 2 });

    // O valor de cada um é o mesmo que a aba Quartos calcula.
    const espelho = await agent.get(`/api/events/${evento.id}/operational-mirror`);
    const valorDe = (id: string) => espelho.body.rows.find((r: { teamInclusionId: string }) => r.teamInclusionId === id).hotelDosQuartos;

    const [ha] = await hospedagens(a.vaga.id);
    expect(ha).toMatchObject({
      hotelName: "Hotel Ibis", checkInDate: "2099-10-10", checkOutDate: "2099-10-12", roomType: "double",
      nightsCount: 2, totalCents: 30000, accommodationObservations: "Divide o quarto com Bruno Lima",
    });
    expect(valorDe(a.vaga.id).totalCentavos).toBe(30000);
    const [hb] = await hospedagens(b.vaga.id);
    expect(hb).toMatchObject({
      hotelName: "Hotel Ibis", checkInDate: "2099-10-09", checkOutDate: "2099-10-13", roomType: "double",
      nightsCount: 4, totalCents: valorDe(b.vaga.id).totalCentavos, accommodationObservations: "Divide o quarto com Ana Souza",
    });
    expect(await statusDa(a.vaga.id)).toBe("hospedagem_comprada");
    expect(await statusDa(b.vaga.id)).toBe("hospedagem_passagem_comprada");

    // O que o Espelho escreveu fica registrado (é o que separa do lançado à mão) e a tela recebe.
    const [registro] = await ctx.db.select().from(ctx.schema.hospedagensDoEspelho).where(eq(ctx.schema.hospedagensDoEspelho.accommodationId, ha.id));
    expect(registro).toMatchObject({ criadaPeloEspelho: true, hotelRoomGroupId: q, eventId: evento.id });
    expect(registro.campos).toMatchObject({ hotelName: "Hotel Ibis", roomType: "double", totalCents: 30000 });
    expect(espelho.body.rows.find((r: { teamInclusionId: string }) => r.teamInclusionId === a.vaga.id).hospedagemDoEspelho).toMatchObject({ hotelName: "Hotel Ibis" });

    const { systemLogs } = ctx.schema;
    const logs = await ctx.db.select().from(systemLogs).where(and(eq(systemLogs.entityType, "accommodation"), eq(systemLogs.entityId, ha.id)));
    expect(logs.map((l) => l.action)).toEqual(["create"]);
    const lote = await ctx.db.select().from(systemLogs).where(and(eq(systemLogs.entityType, "operational_mirror"), eq(systemLogs.entityId, evento.id)));
    expect(lote.some((l) => (l.newData as Record<string, unknown> | null)?.acao === "quarto confirmado → hospedagens")).toBe(true);

    // A hospedagem aparece na leitura de Passagens/Hospedagens.
    const lista = await agent.get(`/api/accommodations?eventId=${evento.id}`);
    expect(lista.status).toBe(200);
    expect(lista.body.map((h: { teamInclusionId: string; hotelName: string }) => [h.teamInclusionId, h.hotelName]).sort())
      .toEqual([[a.vaga.id, "Hotel Ibis"], [b.vaga.id, "Hotel Ibis"]].sort());

    // Preencher de novo: nada muda, nada duplica.
    const deNovo = await mutacao(agent.post(`/api/events/${evento.id}/operational-mirror/hospedagens`)).send({});
    expect(deNovo.status).toBe(200);
    expect(deNovo.body).toMatchObject({ criadas: 0, atualizadas: 0 });
    expect(await hospedagens(a.vaga.id)).toHaveLength(1);
  });

  it("dados lançados à mão diferentes não são sobrescritos; 'Usar os dados do quarto' aplica", async () => {
    const evento = await criarEvento();
    const q = await quarto(evento.id);
    const manual = await vagaNoQuarto(evento.id, q);
    const vazia = await vagaNoQuarto(evento.id, q);
    await ctx.db.insert(ctx.schema.accommodations).values([
      { teamInclusionId: manual.vaga.id, hotelName: "Mercure Centro", reservationNumber: "RES-1", checkInDate: "2099-10-09" },
      { teamInclusionId: vazia.vaga.id, hotelName: null, reservationNumber: "RES-2" },
    ]);
    const { agent } = await agenteLogado("purchasing");

    const res = await mutacao(agent.post(`/api/hotel-room-groups/${q}/confirm`)).send({});
    expect(res.status).toBe(200);
    expect(res.body.hospedagens.atualizadas).toBe(2);
    expect(res.body.hospedagens.diferem).toHaveLength(1);
    expect(res.body.hospedagens.diferem[0]).toMatchObject({ teamInclusionId: manual.vaga.id, nome: manual.pessoa.fullName });
    // Sem passagem nem datas sugeridas, a entrada do quarto JÁ vem da hospedagem (regra do Espelho): só o hotel difere.
    expect(res.body.hospedagens.diferem[0].diferencas.map((d: { campo: string }) => d.campo)).toEqual(["hotelName"]);
    // O lançado à mão fica; o vazio recebe o do quarto.
    expect((await hospedagens(manual.vaga.id))[0]).toMatchObject({ hotelName: "Mercure Centro", checkInDate: "2099-10-09", checkOutDate: "2099-10-12", roomType: "double", reservationNumber: "RES-1" });
    expect((await hospedagens(vazia.vaga.id))[0]).toMatchObject({ hotelName: "Hotel Ibis", reservationNumber: "RES-2", checkInDate: "2099-10-10" });

    const usar = await mutacao(agent.post(`/api/events/${evento.id}/operational-mirror/hospedagens`)).send({ usarDadosDoQuarto: [manual.vaga.id] });
    expect(usar.status).toBe(200);
    expect(usar.body).toMatchObject({ atualizadas: 1, diferem: [] });
    const [depois] = await hospedagens(manual.vaga.id);
    expect(depois).toMatchObject({ hotelName: "Hotel Ibis", checkInDate: "2099-10-09", reservationNumber: "RES-1" });
    const logs = await ctx.db.select().from(ctx.schema.systemLogs)
      .where(and(eq(ctx.schema.systemLogs.entityType, "accommodation"), eq(ctx.schema.systemLogs.entityId, depois.id)));
    expect(logs.map((l) => l.action)).toEqual(["update", "update"]);
  });

  it("reabrir não apaga; mover reabre os dois quartos; confirmar de novo atualiza só quem está no quarto confirmado", async () => {
    const evento = await criarEvento();
    const q1 = await quarto(evento.id);
    const q2 = await quarto(evento.id, "Novotel");
    const a = await vagaNoQuarto(evento.id, q1, { nome: "Carla Dias" });
    const b = await vagaNoQuarto(evento.id, q1, { nome: "Daniela Reis" });
    const { agent } = await agenteLogado("purchasing");
    expect((await mutacao(agent.post(`/api/hotel-room-groups/${q1}/confirm`)).send({})).status).toBe(200);

    // Reabrir: a hospedagem fica como estava.
    expect((await mutacao(agent.patch(`/api/hotel-room-groups/${q1}`)).send({ confirmed: false })).status).toBe(200);
    expect((await hospedagens(a.vaga.id))[0]).toMatchObject({ hotelName: "Hotel Ibis", roomType: "double" });

    // Mover a Daniela para o quarto 2 (Novotel): nada muda até confirmar.
    expect((await mutacao(agent.post(`/api/hotel-room-groups/mover`)).send({ collaboratorId: b.pessoa.id, deGrupoId: q1, paraGrupoId: q2 })).status).toBe(200);
    expect((await hospedagens(b.vaga.id))[0].hotelName).toBe("Hotel Ibis");

    const conf2 = await mutacao(agent.post(`/api/hotel-room-groups/${q2}/confirm`)).send({});
    expect(conf2.status).toBe(200);
    expect(conf2.body.hospedagens).toMatchObject({ atualizadas: 1, diferem: [] });
    expect((await hospedagens(b.vaga.id))[0]).toMatchObject({ hotelName: "Novotel", roomType: "single", accommodationObservations: null });
    // A Carla (quarto 1, ainda aberto) segue com os dados do último Confirmar.
    expect((await hospedagens(a.vaga.id))[0]).toMatchObject({ roomType: "double", accommodationObservations: "Divide o quarto com Daniela Reis" });

    // Confirmar o quarto 1 de novo (pelo PATCH, como a tela também pode): ela fica sozinha.
    expect((await mutacao(agent.patch(`/api/hotel-room-groups/${q1}`)).send({ confirmed: true })).status).toBe(200);
    expect((await hospedagens(a.vaga.id))[0]).toMatchObject({ roomType: "single", accommodationObservations: null });
  });

  it("quarto sem hotel, vaga que não precisa e vaga cancelada: nada é criado", async () => {
    const evento = await criarEvento();
    const semHotel = await quarto(evento.id, null);
    const s = await vagaNoQuarto(evento.id, semHotel);
    const q = await quarto(evento.id);
    const naoPrecisa = await vagaNoQuarto(evento.id, q);
    await ctx.db.update(ctx.schema.teamInclusions).set({ needsAccommodation: false }).where(eq(ctx.schema.teamInclusions.id, naoPrecisa.vaga.id));
    const cancelada = await vagaNoQuarto(evento.id, q, { status: "cancelado" });
    const { agent } = await agenteLogado("purchasing");
    const r1 = await mutacao(agent.post(`/api/hotel-room-groups/${semHotel}/confirm`)).send({});
    expect(r1.status).toBe(200);
    expect(r1.body.hospedagens).toMatchObject({ criadas: 0, semHotel: 1 });
    const r2 = await mutacao(agent.post(`/api/hotel-room-groups/${q}/confirm`)).send({});
    expect(r2.body.hospedagens).toMatchObject({ criadas: 0 });
    expect(await hospedagens(s.vaga.id)).toHaveLength(0);
    expect(await hospedagens(naoPrecisa.vaga.id)).toHaveLength(0);
    expect(await hospedagens(cancelada.vaga.id)).toHaveLength(0);
  });

  it("POST .../hospedagens: fora da logística → 403; corpo inválido → 400; evento encerrado → 403", async () => {
    const evento = await criarEvento();
    const { agent: area } = await agenteLogado("function_area");
    expect((await mutacao(area.post(`/api/events/${evento.id}/operational-mirror/hospedagens`)).send({})).status).toBe(403);
    const { agent } = await agenteLogado("purchasing");
    expect((await mutacao(agent.post(`/api/events/${evento.id}/operational-mirror/hospedagens`)).send({ usarDadosDoQuarto: "x" })).status).toBe(400);
    expect((await mutacao(agent.post(`/api/events/${evento.id}/operational-mirror/hospedagens`)).send({ usarDadosDoQuarto: [] })).status).toBe(400);
    const encerrado = await criarEvento({ startDate: "2020-01-01", endDate: "2020-01-05" });
    expect((await mutacao(agent.post(`/api/events/${encerrado.id}/operational-mirror/hospedagens`)).send({})).status).toBe(403);
  });
});

describe("Grade do Espelho: hotel lançado na célula anda o status", () => {
  it("accommodation.hotelName na grade → hospedagem_comprada", async () => {
    const evento = await criarEvento();
    const pessoa = await criarColaborador();
    const vaga = await criarVaga({ eventId: evento.id, userId: donoDasVagas, collaboratorId: pessoa.id, status: "escalado", phase: "escalacao" });
    const { agent } = await agenteLogado("purchasing");
    const res = await mutacao(agent.patch(`/api/events/${evento.id}/operational-mirror/rows/${vaga.id}`)).send({ field: "accommodation.hotelName", value: "Hotel Ibis" });
    expect(res.status).toBe(200);
    expect(await statusDa(vaga.id)).toBe("hospedagem_comprada");
  });
});
