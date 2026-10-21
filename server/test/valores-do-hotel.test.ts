/**
 * Valores do hotel na aba Quartos (20/10) — rotas e o efeito no custo do Espelho.
 *
 *  - PUT /api/events/:id/operational-mirror/hotel-valores (tarifas + fatura);
 *  - PUT /api/hotel-room-groups/:id/valores (diária própria + valor pago);
 *  - PUT /api/events/:id/operational-mirror/late-checkout (por pessoa);
 *  - GET do Espelho: `valoresDoHotel` e o "Hotel" de cada pessoa calculado
 *    pelas noites (o total lançado à mão continua vencendo).
 *
 * Rodar: `npx vitest run server/test/valores-do-hotel.test.ts --maxWorkers=1`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { agenteLogado, criarApp, criarColaborador, criarEvento, criarUsuario, criarVaga, mutacao, type Contexto } from "./harness";

let ctx: Contexto;
beforeAll(async () => { ctx = await criarApp(); });

/** Evento com um duplo de chegada escalonada: A 10→13, B 11→13 (A fica sozinho na primeira noite). */
async function eventoComDuplo(datas: { inicio?: string; fim?: string } = {}) {
  const evento = await criarEvento(datas.inicio ? { startDate: datas.inicio, endDate: datas.fim } : {});
  const dono = await criarUsuario("admin");
  const [a, b, fora] = [await criarColaborador(), await criarColaborador(), await criarColaborador()];
  const vagaA = await criarVaga({ eventId: evento.id, collaboratorId: a.id, userId: dono.id });
  const vagaB = await criarVaga({ eventId: evento.id, collaboratorId: b.id, userId: dono.id });
  const { hotelRoomGroups, hotelRoomGroupMembers } = ctx.schema;
  const [quarto] = await ctx.db.insert(hotelRoomGroups).values({
    eventId: evento.id, hotelName: "Hotel A", roomType: "double", genderRule: "male",
    checkInDate: "2099-10-10", checkOutDate: "2099-10-13", suggested: true, confirmed: false,
  }).returning();
  await ctx.db.insert(hotelRoomGroupMembers).values([
    { hotelRoomGroupId: quarto.id, collaboratorId: a.id, checkInDate: "2099-10-10", checkOutDate: "2099-10-13", confirmed: false },
    { hotelRoomGroupId: quarto.id, collaboratorId: b.id, checkInDate: "2099-10-11", checkOutDate: "2099-10-13", confirmed: false },
  ]);
  return { evento, a, b, fora, vagaA, vagaB, quarto };
}

type Linha = { teamInclusionId: string; hotelDosQuartos?: { totalCentavos: number; completo: boolean } | null };
async function espelho(agent: Awaited<ReturnType<typeof agenteLogado>>["agent"], eventId: string) {
  const res = await agent.get(`/api/events/${eventId}/operational-mirror`);
  expect(res.status).toBe(200);
  const linha = (id: string) => (res.body.rows as Linha[]).find((r) => r.teamInclusionId === id)!;
  return { corpo: res.body, linha };
}

describe("tarifas do evento → custo de cada pessoa no Espelho", () => {
  it("grava tarifas e fatura (parcial), calcula por noite e o total lançado à mão continua vencendo", async () => {
    const { evento, vagaA, vagaB } = await eventoComDuplo();
    const { agent } = await agenteLogado("purchasing");

    // Sem tarifa: nada calculado, Espelho como antes.
    const antes = await espelho(agent, evento.id);
    expect(antes.corpo.valoresDoHotel).toMatchObject({ tarifas: { single: null, double: null, triple: null }, faturaCentavos: null });
    expect(antes.linha(vagaA.id).hotelDosQuartos).toBeUndefined();
    expect(antes.corpo.totals.hotel).toBe(0);

    const put = await mutacao(agent.put(`/api/events/${evento.id}/operational-mirror/hotel-valores`))
      .send({ individualCentavos: 10000, duploCentavos: 20000, triploCentavos: 27000 });
    expect(put.status).toBe(200);
    const fatura = await mutacao(agent.put(`/api/events/${evento.id}/operational-mirror/hotel-valores`)).send({ faturaCentavos: 80000 });
    expect(fatura.status).toBe(200);
    expect(fatura.body).toMatchObject({ individualCentavos: 10000, duploCentavos: 20000, faturaCentavos: 80000 });

    const depois = await espelho(agent, evento.id);
    expect(depois.corpo.valoresDoHotel).toMatchObject({ tarifas: { single: 10000, double: 20000, triple: 27000 }, faturaCentavos: 80000 });
    // 21/10: tarifa por APARTAMENTO. A: 1 noite sozinho (o Individual inteiro) + metade de 2 noites de Duplo; B: a outra metade.
    expect(depois.linha(vagaA.id).hotelDosQuartos).toEqual({ totalCentavos: 10000 + 2 * 20000 / 2, noites: 3, completo: true });
    expect(depois.linha(vagaB.id).hotelDosQuartos).toEqual({ totalCentavos: 2 * 20000 / 2, noites: 2, completo: true });
    expect(depois.corpo.totals.hotel).toBe(30000 + 20000);

    // HOTEL TT lançado à mão para B vence o calculado.
    await ctx.db.insert(ctx.schema.accommodations).values({ teamInclusionId: vagaB.id, totalCents: 50000 });
    const manual = await espelho(agent, evento.id);
    expect(manual.corpo.totals.hotel).toBe(30000 + 50000);

    const { systemLogs } = ctx.schema;
    const logs = await ctx.db.select().from(systemLogs).where(and(eq(systemLogs.entityType, "hotel_valores"), eq(systemLogs.entityId, evento.id)));
    expect(logs.length).toBe(2);
  });

  it("valores inválidos → 400 sem gravar; corpo vazio → 400", async () => {
    const { evento } = await eventoComDuplo();
    const { agent } = await agenteLogado("admin");
    const url = `/api/events/${evento.id}/operational-mirror/hotel-valores`;
    for (const corpo of [{ duploCentavos: -1 }, { duploCentavos: 138.5 }, { duploCentavos: "138" }, { triploCentavos: 10_000_001 }, {}]) {
      const r = await mutacao(agent.put(url)).send(corpo);
      expect(r.status).toBe(400);
    }
    const [linha] = await ctx.db.select().from(ctx.schema.hotelTarifasEvento).where(eq(ctx.schema.hotelTarifasEvento.eventId, evento.id));
    expect(linha).toBeUndefined();
    // null apaga: grava e depois limpa.
    expect((await mutacao(agent.put(url)).send({ duploCentavos: 13800 })).status).toBe(200);
    const limpo = await mutacao(agent.put(url)).send({ duploCentavos: null });
    expect(limpo.status).toBe(200);
    expect(limpo.body.duploCentavos).toBeNull();
  });

  it("papel fora da logística → 403; evento encerrado → 403", async () => {
    const { evento } = await eventoComDuplo();
    const { agent: area } = await agenteLogado("function_area");
    expect((await mutacao(area.put(`/api/events/${evento.id}/operational-mirror/hotel-valores`)).send({ duploCentavos: 1 })).status).toBe(403);
    const { agent: fin } = await agenteLogado("financial");
    expect((await mutacao(fin.put(`/api/events/${evento.id}/operational-mirror/hotel-valores`)).send({ duploCentavos: 1 })).status).toBe(403);

    const encerrado = await eventoComDuplo({ inicio: "2020-01-01", fim: "2020-01-05" });
    const { agent } = await agenteLogado("purchasing");
    const r = await mutacao(agent.put(`/api/events/${encerrado.evento.id}/operational-mirror/hotel-valores`)).send({ duploCentavos: 13800 });
    expect(r.status).toBe(403);
    expect(r.body.message).toContain("Evento encerrado");
  });
});

describe("diária própria e valor pago do quarto", () => {
  it("diária própria (o apartamento) vale em todas as noites do quarto, dividida entre quem dorme nele; os dois nulos voltam ao padrão (sem linha)", async () => {
    const { evento, vagaA, vagaB, quarto } = await eventoComDuplo();
    const { agent } = await agenteLogado("production");
    await mutacao(agent.put(`/api/events/${evento.id}/operational-mirror/hotel-valores`)).send({ individualCentavos: 10000, duploCentavos: 20000 });

    const r = await mutacao(agent.put(`/api/hotel-room-groups/${quarto.id}/valores`)).send({ diariaPropriaCentavos: 15000, valorPagoCentavos: 80000 });
    expect(r.status).toBe(200);
    const comPropria = await espelho(agent, evento.id);
    expect(comPropria.linha(vagaA.id).hotelDosQuartos?.totalCentavos).toBe(15000 + 2 * 15000 / 2);
    expect(comPropria.linha(vagaB.id).hotelDosQuartos?.totalCentavos).toBe(2 * 15000 / 2);
    expect(comPropria.corpo.valoresDoHotel.quartos).toEqual([{ quartoId: quarto.id, diariaPropriaCentavos: 15000, valorPagoCentavos: 80000 }]);

    // Só o pago muda; a diária fica.
    await mutacao(agent.put(`/api/hotel-room-groups/${quarto.id}/valores`)).send({ valorPagoCentavos: null });
    const { hotelValoresQuarto } = ctx.schema;
    let [linha] = await ctx.db.select().from(hotelValoresQuarto).where(eq(hotelValoresQuarto.hotelRoomGroupId, quarto.id));
    expect(linha).toMatchObject({ diariaPropriaCentavos: 15000, valorPagoCentavos: null, eventId: evento.id });

    await mutacao(agent.put(`/api/hotel-room-groups/${quarto.id}/valores`)).send({ diariaPropriaCentavos: null });
    [linha] = await ctx.db.select().from(hotelValoresQuarto).where(eq(hotelValoresQuarto.hotelRoomGroupId, quarto.id));
    expect(linha).toBeUndefined();
    expect((await espelho(agent, evento.id)).linha(vagaA.id).hotelDosQuartos?.totalCentavos).toBe(10000 + 2 * 20000 / 2);
  });

  it("quarto apagado leva os valores junto (cascade — é o que o Refazer sugestões faz com os não confirmados)", async () => {
    const { evento, quarto } = await eventoComDuplo();
    const { agent } = await agenteLogado("purchasing");
    await mutacao(agent.put(`/api/hotel-room-groups/${quarto.id}/valores`)).send({ diariaPropriaCentavos: 15000 });
    const { hotelRoomGroups, hotelValoresQuarto } = ctx.schema;
    await ctx.db.delete(hotelRoomGroups).where(eq(hotelRoomGroups.id, quarto.id));
    const restantes = await ctx.db.select().from(hotelValoresQuarto).where(eq(hotelValoresQuarto.eventId, evento.id));
    expect(restantes).toEqual([]);
  });

  it("valor inválido → 400; quarto inexistente → 404; fora da logística → 403", async () => {
    const { quarto } = await eventoComDuplo();
    const { agent } = await agenteLogado("purchasing");
    expect((await mutacao(agent.put(`/api/hotel-room-groups/${quarto.id}/valores`)).send({ diariaPropriaCentavos: -10 })).status).toBe(400);
    expect((await mutacao(agent.put(`/api/hotel-room-groups/${quarto.id}/valores`)).send({})).status).toBe(400);
    expect((await mutacao(agent.put(`/api/hotel-room-groups/nao-existe/valores`)).send({ diariaPropriaCentavos: 100 })).status).toBe(404);
    const { agent: area } = await agenteLogado("function_area");
    expect((await mutacao(area.put(`/api/hotel-room-groups/${quarto.id}/valores`)).send({ diariaPropriaCentavos: 100 })).status).toBe(403);
  });
});

describe("late check-out por pessoa", () => {
  it("marca com a parte da pessoa na última noite, com valor próprio, desmarca e volta a seguir a hospedagem", async () => {
    const { evento, a, vagaA } = await eventoComDuplo();
    const { agent } = await agenteLogado("purchasing");
    await mutacao(agent.put(`/api/events/${evento.id}/operational-mirror/hotel-valores`)).send({ individualCentavos: 10000, duploCentavos: 20000 });
    const url = `/api/events/${evento.id}/operational-mirror/late-checkout`;
    const base = 10000 + 2 * 20000 / 2;
    const parteDaUltimaNoite = 20000 / 2; // Duplo dividido por 2

    expect((await mutacao(agent.put(url)).send({ collaboratorId: a.id, ativo: true })).status).toBe(200);
    expect((await espelho(agent, evento.id)).linha(vagaA.id).hotelDosQuartos?.totalCentavos).toBe(base + parteDaUltimaNoite);

    expect((await mutacao(agent.put(url)).send({ collaboratorId: a.id, ativo: true, valorCentavos: 9000 })).status).toBe(200);
    expect((await espelho(agent, evento.id)).linha(vagaA.id).hotelDosQuartos?.totalCentavos).toBe(base + 9000);

    // A caixa da hospedagem marcada: sem escolha na aba Quartos, ela conta…
    await ctx.db.insert(ctx.schema.accommodations).values({ teamInclusionId: vagaA.id, lateCheckout: true });
    expect((await mutacao(agent.put(url)).send({ collaboratorId: a.id, ativo: false })).status).toBe(200);
    // …mas "não tem" escolhido na aba Quartos vence.
    expect((await espelho(agent, evento.id)).linha(vagaA.id).hotelDosQuartos?.totalCentavos).toBe(base);
    expect((await mutacao(agent.put(url)).send({ collaboratorId: a.id, ativo: null })).status).toBe(200);
    expect((await espelho(agent, evento.id)).linha(vagaA.id).hotelDosQuartos?.totalCentavos).toBe(base + parteDaUltimaNoite);
    const { hotelLateCheckouts } = ctx.schema;
    expect(await ctx.db.select().from(hotelLateCheckouts).where(eq(hotelLateCheckouts.eventId, evento.id))).toEqual([]);
  });

  it("pessoa fora dos quartos → 400; sem `ativo` → 400; fora da logística → 403", async () => {
    const { evento, a, fora } = await eventoComDuplo();
    const { agent } = await agenteLogado("purchasing");
    const url = `/api/events/${evento.id}/operational-mirror/late-checkout`;
    const semQuarto = await mutacao(agent.put(url)).send({ collaboratorId: fora.id, ativo: true });
    expect(semQuarto.status).toBe(400);
    expect(semQuarto.body.message).toContain("não está em nenhum quarto");
    expect((await mutacao(agent.put(url)).send({ collaboratorId: a.id })).status).toBe(400);
    expect((await mutacao(agent.put(url)).send({ collaboratorId: a.id, ativo: true, valorCentavos: -1 })).status).toBe(400);
    const { agent: area } = await agenteLogado("function_area");
    expect((await mutacao(area.put(url)).send({ collaboratorId: a.id, ativo: true })).status).toBe(403);
  });
});

describe("rooming list com valores (uso interno)", () => {
  it("registra comValores na auditoria", async () => {
    const { evento } = await eventoComDuplo();
    const { agent } = await agenteLogado("purchasing");
    const r = await mutacao(agent.post(`/api/events/${evento.id}/operational-mirror/rooming-list`)).send({ hotel: "Hotel A", comValores: true });
    expect(r.status).toBe(200);
    const { systemLogs } = ctx.schema;
    const [log] = await ctx.db.select().from(systemLogs).where(and(eq(systemLogs.entityType, "operational_mirror"), eq(systemLogs.entityId, evento.id)));
    expect((log.newData as Record<string, unknown>).comValores).toBe(true);
  });
});
