/**
 * "Desfazer emissão" numa passagem que é só o carimbo (22/10).
 *
 * Caso real: vaga #4401 (Blue Run Ribeirão Preto, kit). Às 04:18 Compras
 * clicou "Marcar como emitida" numa vaga SEM passagem — a rota criou uma linha
 * só com o carimbo e a vaga foi para "passagem comprada". Às 04:19 clicou
 * "Desfazer emissão": só o carimbo saiu; a linha vazia ficou e a vaga seguiu
 * "passagem comprada", com uma passagem registrada que não existia.
 *
 * Regra: linha que é só o carimbo (shared/passagem-so-com-carimbo.ts) sai
 * inteira no desfazer, e a vaga volta para "Comprar" (escalado, ou
 * hospedagem_comprada se tiver hospedagem). Passagem com dados só perde o
 * carimbo, como antes. Tudo na auditoria.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { faseParaStatus } from "@shared/vaga-status";
import {
  agenteLogado,
  criarApp,
  criarColaborador,
  criarEvento,
  criarVaga,
  mutacao,
  type Contexto,
  type TestAgent,
} from "./harness";

let ctx: Contexto;

beforeAll(async () => {
  ctx = await criarApp();
});

/** Datas um ano à frente: a passagem só aceita anos próximos e o evento não pode estar encerrado. */
const PERIODO = { scheduleStartDate: "2027-10-10", scheduleEndDate: "2027-10-12" };

const emitir = (agent: TestAgent, inclusionIds: string[], emitida: boolean) =>
  mutacao(agent.post("/api/tickets/emitidas")).send({ inclusionIds, emitida });

const passagensDa = (vagaId: string) => ctx.db.select().from(ctx.schema.tickets).where(eq(ctx.schema.tickets.teamInclusionId, vagaId));
const statusDa = async (vagaId: string) => (await ctx.storage.getTeamInclusion(vagaId))?.status;
const logsDe = (entityType: string, entityId: string) => ctx.db.select().from(ctx.schema.systemLogs)
  .where(and(eq(ctx.schema.systemLogs.entityType, entityType), eq(ctx.schema.systemLogs.entityId, entityId)));

async function vagaEscalada(status = "escalado") {
  const { agent, user } = await agenteLogado("purchasing");
  const evento = await criarEvento({ name: "Blue Run - Ribeirão Preto", startDate: "2027-10-10", endDate: "2027-10-14" });
  const colaborador = await criarColaborador();
  const vaga = await criarVaga({ userId: user.id, eventId: evento.id, collaboratorId: colaborador.id, status, phase: faseParaStatus(status) ?? "escalacao", ...PERIODO });
  return { agent, user, vaga };
}

async function comprarPassagem(agent: TestAgent, vagaId: string) {
  const res = await mutacao(agent.post("/api/tickets")).send({
    teamInclusionId: vagaId, transportType: "aereo", value: 91000, purchaseOrderNumber: "OC-4401", locator: "ABC123",
    actualDepartureDate: "2027-10-09", actualDepartureTime: "18:55",
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as { id: string };
}

describe("POST /api/tickets/emitidas — desfazer numa passagem só com o carimbo", () => {
  it("vaga sem passagem: marcar e desfazer não deixa passagem e a vaga volta para escalado (vaga #4401)", async () => {
    const { agent, vaga } = await vagaEscalada();

    const marca = await emitir(agent, [vaga.id], true);
    expect(marca.status).toBe(200);
    const [carimbo] = await passagensDa(vaga.id);
    expect(carimbo?.emittedAt).toBeTruthy();
    expect(await statusDa(vaga.id)).toBe("passagem_comprada");

    const desfaz = await emitir(agent, [vaga.id], false);
    expect(desfaz.status).toBe(200);
    expect(desfaz.body).toMatchObject({ ok: [vaga.id], removidas: [vaga.id], statusPorVaga: { [vaga.id]: "escalado" } });
    expect(await passagensDa(vaga.id)).toHaveLength(0);
    const depois = await ctx.storage.getTeamInclusion(vaga.id);
    expect(depois?.status).toBe("escalado");
    expect(depois?.phase).toBe(faseParaStatus("escalado"));

    // Auditoria: o delete da passagem com o registro que saiu, e o update da vaga.
    const logsDaPassagem = await logsDe("ticket", carimbo.id);
    const apagou = logsDaPassagem.find((l) => l.action === "delete");
    expect(apagou).toBeTruthy();
    expect(JSON.stringify(apagou?.newData ?? apagou?.previousData)).toContain(vaga.id);
    const logsDaVaga = await logsDe("team_inclusion", vaga.id);
    expect(logsDaVaga.some((l) => l.action === "update" && JSON.stringify(l.newData).includes("escalado"))).toBe(true);

    // De novo: sem passagem para desmarcar.
    const outra = await emitir(agent, [vaga.id], false);
    expect(outra.body.pulados).toEqual([{ id: vaga.id, motivo: "sem passagem para desmarcar" }]);
  });

  it("vaga com hospedagem: volta para hospedagem_comprada", async () => {
    const { agent, vaga } = await vagaEscalada("hospedagem_comprada");
    await ctx.db.insert(ctx.schema.accommodations).values({ teamInclusionId: vaga.id, hotelName: "Hotel Stream Ribeirão" });

    expect((await emitir(agent, [vaga.id], true)).status).toBe(200);
    expect(await statusDa(vaga.id)).toBe("hospedagem_passagem_comprada");

    const desfaz = await emitir(agent, [vaga.id], false);
    expect(desfaz.status).toBe(200);
    expect(desfaz.body.statusPorVaga).toEqual({ [vaga.id]: "hospedagem_comprada" });
    expect(await passagensDa(vaga.id)).toHaveLength(0);
    expect(await statusDa(vaga.id)).toBe("hospedagem_comprada");
  });

  it("passagem com dados: desfazer só tira o carimbo", async () => {
    const { agent, vaga } = await vagaEscalada();
    const passagem = await comprarPassagem(agent, vaga.id);
    expect(await statusDa(vaga.id)).toBe("passagem_comprada");

    expect((await emitir(agent, [vaga.id], true)).status).toBe(200);
    const desfaz = await emitir(agent, [vaga.id], false);
    expect(desfaz.status).toBe(200);
    expect(desfaz.body).toMatchObject({ ok: [vaga.id], removidas: [], statusPorVaga: {} });

    const [linha] = await passagensDa(vaga.id);
    expect(linha?.id).toBe(passagem.id);
    expect(linha?.emittedAt).toBeNull();
    expect(linha?.emittedBy).toBeNull();
    expect(linha?.locator).toBe("ABC123");
    expect(await statusDa(vaga.id)).toBe("passagem_comprada");
    expect((await logsDe("ticket", passagem.id)).some((l) => l.action === "desfazer_emissao")).toBe(true);
  });

  it("linha criada pelo carimbo e preenchida depois tem dado: fica", async () => {
    const { agent, vaga } = await vagaEscalada();
    expect((await emitir(agent, [vaga.id], true)).status).toBe(200);
    const [carimbo] = await passagensDa(vaga.id);
    const edita = await mutacao(agent.patch(`/api/tickets/${carimbo.id}`)).send({ ticketObservations: "Bilhete por e-mail" });
    expect(edita.status).toBe(200);

    const desfaz = await emitir(agent, [vaga.id], false);
    expect(desfaz.body.removidas).toEqual([]);
    const [linha] = await passagensDa(vaga.id);
    expect(linha?.emittedAt).toBeNull();
    expect(await statusDa(vaga.id)).toBe("passagem_comprada");
  });

  it("lote com as duas situações: a vazia sai e a vaga volta; a com dados só perde o carimbo", async () => {
    const { agent, user } = await agenteLogado("purchasing");
    const evento = await criarEvento({ name: "Blue Run - Ribeirão Preto", startDate: "2027-10-10", endDate: "2027-10-14" });
    const semPassagem = await criarVaga({ userId: user.id, eventId: evento.id, collaboratorId: (await criarColaborador()).id, status: "escalado", phase: "escalacao", ...PERIODO });
    const comPassagem = await criarVaga({ userId: user.id, eventId: evento.id, collaboratorId: (await criarColaborador()).id, status: "escalado", phase: "escalacao", ...PERIODO });
    const passagem = await comprarPassagem(agent, comPassagem.id);

    const marca = await emitir(agent, [semPassagem.id, comPassagem.id], true);
    expect(marca.status).toBe(200);
    expect(marca.body.ok).toEqual([semPassagem.id, comPassagem.id]);
    expect(await statusDa(semPassagem.id)).toBe("passagem_comprada");

    const desfaz = await emitir(agent, [semPassagem.id, comPassagem.id], false);
    expect(desfaz.status).toBe(200);
    expect(desfaz.body).toMatchObject({
      ok: [semPassagem.id, comPassagem.id],
      removidas: [semPassagem.id],
      statusPorVaga: { [semPassagem.id]: "escalado" },
    });

    expect(await passagensDa(semPassagem.id)).toHaveLength(0);
    expect(await statusDa(semPassagem.id)).toBe("escalado");
    const [linha] = await passagensDa(comPassagem.id);
    expect(linha?.id).toBe(passagem.id);
    expect(linha?.emittedAt).toBeNull();
    expect(await statusDa(comPassagem.id)).toBe("passagem_comprada");
  });
});
