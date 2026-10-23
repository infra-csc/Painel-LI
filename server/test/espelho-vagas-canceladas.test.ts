/**
 * Vagas canceladas no Espelho Operacional (23/10) — caso Night Run Curitiba.
 *
 * O evento mudou de data (15–18/10 → 28/10–01/11): as vagas antigas foram
 * canceladas com a passagem das datas antigas ainda registrada, e as novas
 * foram criadas. O "Quarto 1" juntou Andrew (cancelada, 14/10→19/10) com
 * Matheus (nova, 28/10→02/11). Aqui: a vaga cancelada sai dos quartos, do Uber
 * e das linhas, mas aparece no bloco "Vagas canceladas com custo" e o dinheiro
 * continua no custo do evento.
 *
 * Rodar: `npx vitest run server/test/espelho-vagas-canceladas.test.ts --maxWorkers=1`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { agenteLogado, criarApp, criarColaborador, criarEvento, criarFuncao, criarUsuario, criarVaga, mutacao, type Contexto } from "./harness";

let ctx: Contexto;
beforeAll(async () => { ctx = await criarApp(); });

/** Vaga com hospedagem, passagem e status pedido — direto no banco. */
async function vagaComViagem(o: {
  eventId: string; functionId: string; collaboratorId: string; userId: string; status: string;
  escala: [string, string]; passagem: [string, string]; valor: number; hospedagem?: [string, string];
}) {
  const vaga = await criarVaga({ eventId: o.eventId, functionId: o.functionId, collaboratorId: o.collaboratorId, userId: o.userId, scheduleStartDate: o.escala[0], scheduleEndDate: o.escala[1] });
  const { teamInclusions, tickets, accommodations } = ctx.schema;
  await ctx.db.update(teamInclusions).set({ status: o.status, phase: o.status === "cancelado" ? "cancelado" : "hospedagem", needsAccommodation: true }).where(eq(teamInclusions.id, vaga.id));
  await ctx.db.insert(tickets).values({
    teamInclusionId: vaga.id, departureAirport: "GRU", destinationAirport: "CWB", actualDepartureDate: o.passagem[0], actualDepartureTime: "09:00",
    returnOriginAirport: "CWB", returnDestinationAirport: "GRU", actualReturnDate: o.passagem[1], actualReturnTime: "15:00",
    value: o.valor, ticketStatus: "comprada", locator: "ABC123", purchaseOrderNumber: "OC-1",
  });
  if (o.hospedagem) {
    await ctx.db.insert(accommodations).values({ teamInclusionId: vaga.id, checkInDate: o.hospedagem[0], checkOutDate: o.hospedagem[1], dailyRate: 30000, nightsCount: 4, totalCents: 120000, hotelStatus: "reservada" });
  }
  return vaga;
}

async function cenario() {
  const evento = await criarEvento({ name: "Night Run - Curitiba", startDate: "2099-10-28", endDate: "2099-11-01" });
  const dono = await criarUsuario("admin");
  const funcao = await criarFuncao();
  const andrew = await criarColaborador({ fullName: "Andrew Souza da Silva" });
  const matheus = await criarColaborador({ fullName: "Matheus da Fonte Costa" });
  await ctx.db.update(ctx.schema.collaborators).set({ gender: "male" }).where(eq(ctx.schema.collaborators.id, andrew.id));
  await ctx.db.update(ctx.schema.collaborators).set({ gender: "male" }).where(eq(ctx.schema.collaborators.id, matheus.id));
  const base = { eventId: evento.id, functionId: funcao.id, userId: dono.id };
  // Datas antigas (15–18/10): as duas vagas foram canceladas com a passagem ainda registrada.
  const andrewAntiga = await vagaComViagem({ ...base, collaboratorId: andrew.id, status: "cancelado", escala: ["2099-10-15", "2099-10-18"], passagem: ["2099-10-14", "2099-10-19"], valor: 98000, hospedagem: ["2099-10-14", "2099-10-19"] });
  const matheusAntiga = await vagaComViagem({ ...base, collaboratorId: matheus.id, status: "cancelado", escala: ["2099-10-15", "2099-10-18"], passagem: ["2099-10-14", "2099-10-19"], valor: 98000 });
  // A vaga nova de Matheus (28/10–01/11).
  const matheusNova = await vagaComViagem({ ...base, collaboratorId: matheus.id, status: "hospedagem_passagem_comprada", escala: ["2099-10-28", "2099-11-01"], passagem: ["2099-10-28", "2099-11-02"], valor: 105000, hospedagem: ["2099-10-29", "2099-11-01"] });
  return { evento, andrew, matheus, andrewAntiga, matheusAntiga, matheusNova };
}

type Membro = { collaboratorId: string };
type Grupo = { id: string; confirmed: boolean; members: Membro[]; foraDoEspelho?: { collaboratorId: string; nome: string; motivo: string }[] };

describe("Espelho: vaga cancelada fora das listas, dentro do custo", () => {
  it("Refazer sugestões não junta a cancelada com a nova; quartos, Uber e linhas só com vagas ativas", async () => {
    const c = await cenario();
    const { agent } = await agenteLogado("purchasing");
    const r = await mutacao(agent.post(`/api/events/${c.evento.id}/recalculate-logistics-suggestions`)).send({});
    expect(r.status).toBe(200);

    const res = await agent.get(`/api/events/${c.evento.id}/operational-mirror`);
    expect(res.status).toBe(200);
    const corpo = res.body;
    // Linhas: só a vaga nova.
    expect(corpo.rows.map((x: { teamInclusionId: string }) => x.teamInclusionId)).toEqual([c.matheusNova.id]);
    expect(corpo.rows[0].datasDoQuarto).toMatchObject({ checkIn: "2099-10-28", checkOut: "2099-11-02" });
    // Quartos: Matheus sozinho, com as datas da vaga nova; Andrew em quarto nenhum.
    const quartos = corpo.roomGroups as Grupo[];
    expect(quartos).toHaveLength(1);
    expect(quartos[0].members.map((m) => m.collaboratorId)).toEqual([c.matheus.id]);
    expect(quartos[0]).toMatchObject({ checkInDate: "2099-10-28", checkOutDate: "2099-11-02", roomType: "single" });
    // Uber: ninguém com a passagem antiga.
    const noUber = (corpo.uberGroups as Grupo[]).flatMap((g) => g.members.map((m) => m.collaboratorId));
    expect(noUber).not.toContain(c.andrew.id);
    const datasDosCarros = (corpo.uberGroups as { date: string }[]).map((g) => g.date);
    expect(datasDosCarros.every((d) => d >= "2099-10-28")).toBe(true);
    // Pendências e Departamentos: nada da cancelada.
    expect(corpo.pendingCount).toBe(corpo.rows[0].pendencies.length);

    // Bloco das canceladas: as duas antigas, com o que custaram.
    const canceladas = corpo.vagasCanceladas as { teamInclusionId: string; totalCentavos: number; revisar: boolean; passagem: { ida: string; volta: string; viva: boolean } }[];
    expect(canceladas.map((v) => v.teamInclusionId).sort()).toEqual([c.andrewAntiga.id, c.matheusAntiga.id].sort());
    const deAndrew = canceladas.find((v) => v.teamInclusionId === c.andrewAntiga.id)!;
    expect(deAndrew).toMatchObject({ totalCentavos: 98000 + 120000, revisar: true, passagem: { ida: "2099-10-14", volta: "2099-10-19", viva: true } });
    // O custo continua somando (como antes), separado em `canceladas`.
    expect(corpo.totals.canceladas).toMatchObject({ vagas: 2, revisar: 2, tickets: 98000 * 2, hotel: 120000, total: 98000 * 2 + 120000 });
    expect(corpo.totals.tickets).toBe(98000 * 2 + 105000);
    expect(corpo.totals.hotel).toBe(120000 + 120000);
    expect(corpo.totals.grand).toBe(98000 * 2 + 105000 + 240000);
    const dep = corpo.totals.byDepartment[0];
    expect(dep).toMatchObject({ total: corpo.totals.grand, canceladas: 98000 * 2 + 120000 });
  });

  it("quarto CONFIRMADO gravado com a cancelada: a pessoa sai na leitura, o quarto avisa; quarto/carro só dela some; o banco fica", async () => {
    const c = await cenario();
    const { hotelRoomGroups, hotelRoomGroupMembers, uberGroups, uberGroupMembers } = ctx.schema;
    const [misto] = await ctx.db.insert(hotelRoomGroups).values({
      eventId: c.evento.id, hotelName: null, roomType: "double", genderRule: "male", checkInDate: "2099-10-14", checkOutDate: "2099-11-02", suggested: false, confirmed: true,
    }).returning();
    await ctx.db.insert(hotelRoomGroupMembers).values([
      { hotelRoomGroupId: misto.id, collaboratorId: c.andrew.id, confirmed: true },
      { hotelRoomGroupId: misto.id, collaboratorId: c.matheus.id, confirmed: true },
    ]);
    const [soDele] = await ctx.db.insert(hotelRoomGroups).values({
      eventId: c.evento.id, hotelName: null, roomType: "single", genderRule: "male", checkInDate: "2099-10-14", checkOutDate: "2099-10-19", suggested: false, confirmed: true,
    }).returning();
    await ctx.db.insert(hotelRoomGroupMembers).values({ hotelRoomGroupId: soDele.id, collaboratorId: c.andrew.id, confirmed: true });
    const [carro] = await ctx.db.insert(uberGroups).values({
      eventId: c.evento.id, groupName: "Ida GRU 2099-10-14", direction: "ida", origin: "Norte", destination: "GRU", date: "2099-10-14", time: "06:00", suggested: false, confirmed: true, status: "confirmado",
    }).returning();
    await ctx.db.insert(uberGroupMembers).values({ uberGroupId: carro.id, collaboratorId: c.andrew.id, confirmed: true });

    const { agent } = await agenteLogado("production");
    const res = await agent.get(`/api/events/${c.evento.id}/operational-mirror`);
    expect(res.status).toBe(200);
    const quartos = res.body.roomGroups as Grupo[];
    expect(quartos.map((q) => q.id)).toEqual([misto.id]);
    expect(quartos[0].members.map((m) => m.collaboratorId)).toEqual([c.matheus.id]);
    expect(quartos[0].foraDoEspelho).toEqual([{ collaboratorId: c.andrew.id, nome: "Andrew Souza da Silva", motivo: "cancelada" }]);
    expect(res.body.suggestedRoomCount).toBe(1);
    expect((res.body.uberGroups as Grupo[]).map((g) => g.id)).not.toContain(carro.id);

    // Nada foi apagado do banco: limpar fica para reabrir/refazer.
    const gravados = await ctx.db.select().from(hotelRoomGroupMembers).where(eq(hotelRoomGroupMembers.hotelRoomGroupId, misto.id));
    expect(gravados).toHaveLength(2);
    const carroNoBanco = await ctx.db.select().from(uberGroups).where(eq(uberGroups.id, carro.id));
    expect(carroNoBanco).toHaveLength(1);

    // Mover: quem só tem vaga cancelada não ocupa lugar. O quarto [Andrew
    // (cancelada), Bruno] recebe Matheus como DUPLO — antes contava 3 e
    // recusava ("triplo só para cenotécnica").
    const bruno = await criarColaborador({ fullName: "Bruno Ativo" });
    await ctx.db.update(ctx.schema.collaborators).set({ gender: "male" }).where(eq(ctx.schema.collaborators.id, bruno.id));
    await criarVaga({ eventId: c.evento.id, collaboratorId: bruno.id, userId: (await criarUsuario("admin")).id, scheduleStartDate: "2099-10-28", scheduleEndDate: "2099-11-01" });
    const [comBruno] = await ctx.db.insert(hotelRoomGroups).values({
      eventId: c.evento.id, hotelName: null, roomType: "double", genderRule: "male", checkInDate: "2099-10-28", checkOutDate: "2099-11-02", suggested: true, confirmed: false,
    }).returning();
    await ctx.db.insert(hotelRoomGroupMembers).values([
      { hotelRoomGroupId: comBruno.id, collaboratorId: c.andrew.id },
      { hotelRoomGroupId: comBruno.id, collaboratorId: bruno.id },
    ]);
    const mover = await mutacao(agent.post("/api/hotel-room-groups/mover")).send({ collaboratorId: c.matheus.id, deGrupoId: misto.id, paraGrupoId: comBruno.id });
    expect(mover.status).toBe(200);
    const [destino] = await ctx.db.select().from(hotelRoomGroups).where(eq(hotelRoomGroups.id, comBruno.id));
    expect(destino.roomType).toBe("double");
    const depois = await agent.get(`/api/events/${c.evento.id}/operational-mirror`);
    const noDestino = (depois.body.roomGroups as Grupo[]).find((g) => g.id === comBruno.id)!;
    expect(noDestino.members.map((m) => m.collaboratorId).sort()).toEqual([bruno.id, c.matheus.id].sort());
    // O quarto de origem ficou só com Andrew (cancelada) → some da tela.
    expect((depois.body.roomGroups as Grupo[]).map((g) => g.id)).not.toContain(misto.id);
  });

  it("vaga cancelada sem passagem, hospedagem nem valor não entra no bloco", async () => {
    const evento = await criarEvento();
    const dono = await criarUsuario("admin");
    const vaga = await criarVaga({ eventId: evento.id, collaboratorId: (await criarColaborador()).id, userId: dono.id });
    await ctx.db.update(ctx.schema.teamInclusions).set({ status: "cancelado", phase: "cancelado" }).where(eq(ctx.schema.teamInclusions.id, vaga.id));
    const { agent } = await agenteLogado("purchasing");
    const res = await agent.get(`/api/events/${evento.id}/operational-mirror`);
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(0);
    expect(res.body.vagasCanceladas).toEqual([]);
    expect(res.body.totals.canceladas).toMatchObject({ vagas: 0, revisar: 0, total: 0 });
  });
});
