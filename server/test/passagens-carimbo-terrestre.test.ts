/**
 * "Marcar como emitida" numa vaga que vai de carro/van (22/10).
 *
 * Caso real: Blue Run - Campinas, vagas #4705, #4706, #4707, #4711 e #4724
 * (kit, Sugestão "van - 20h" / "14h carro"). Às 19:18 Compras disse que
 * "finalizou como VAN"; o que rodou foi o carimbo: cada vaga sem passagem
 * ganhou uma linha de passagem só com o carimbo — uma passagem AÉREA em
 * branco —, foi para "passagem comprada", e `transportes_terrestres` ficou
 * vazia.
 *
 * Regra (shared/carimbo-sem-passagem.ts): vaga sem passagem que indica
 * carro/van é pulada, sem linha e sem mudar o status; já registrada como
 * carro/van em todas as pernas, também. Registrar o carro/van depois numa
 * vaga com a linha vazia apaga a linha.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { MOTIVO_JA_TERRESTRE, MOTIVO_VAI_DE_TERRESTRE } from "@shared/carimbo-sem-passagem";
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

const PERIODO = { scheduleStartDate: "2027-10-10", scheduleEndDate: "2027-10-12" };

const emitir = (agent: TestAgent, inclusionIds: string[], emitida = true) =>
  mutacao(agent.post("/api/tickets/emitidas")).send({ inclusionIds, emitida });
const passagensDa = (vagaId: string) => ctx.db.select().from(ctx.schema.tickets).where(eq(ctx.schema.tickets.teamInclusionId, vagaId));
const statusDa = async (vagaId: string) => (await ctx.storage.getTeamInclusion(vagaId))?.status;

async function vagaDeCampinas(agent: { user: { id: string } }, eventoId: string, sugestao: Record<string, string | null> = {}) {
  const vaga = await criarVaga({ userId: agent.user.id, eventId: eventoId, collaboratorId: (await criarColaborador()).id, status: "escalado", phase: "escalacao", ...PERIODO });
  if (Object.keys(sugestao).length > 0) {
    await ctx.db.update(ctx.schema.teamInclusions).set(sugestao).where(eq(ctx.schema.teamInclusions.id, vaga.id));
  }
  return vaga;
}

async function cenario() {
  const logado = await agenteLogado("purchasing");
  const evento = await criarEvento({ name: "Blue Run - Campinas", location: "Campinas - SP", startDate: "2027-10-10", endDate: "2027-10-14" });
  return { ...logado, evento };
}

describe("POST /api/tickets/emitidas — vaga sem passagem que vai de carro/van", () => {
  it("Sugestão de volta '14h carro' (vaga #4724): pulada, nenhuma linha criada, status inalterado", async () => {
    const c = await cenario();
    const vaga = await vagaDeCampinas(c, c.evento.id, { flightReturnSuggestedTime: "14h carro" });

    const res = await emitir(c.agent, [vaga.id]);
    expect(res.status).toBe(200);
    expect(res.body.ok).toEqual([]);
    expect(res.body.pulados).toEqual([{ id: vaga.id, motivo: MOTIVO_VAI_DE_TERRESTRE, tipo: "terrestre", pernas: ["volta"] }]);
    expect(res.body.statusPorVaga).toEqual({});
    expect(await passagensDa(vaga.id)).toHaveLength(0);
    expect(await statusDa(vaga.id)).toBe("escalado");
  });

  it("vaga aérea: carimba como hoje (linha só com o carimbo, vaga em passagem comprada)", async () => {
    const c = await cenario();
    const vaga = await vagaDeCampinas(c, c.evento.id, { flightDepartureSuggestedTime: "09:30", flightReturnSuggestedTime: "18h" });

    const res = await emitir(c.agent, [vaga.id]);
    expect(res.status).toBe(200);
    expect(res.body.ok).toEqual([vaga.id]);
    expect(res.body.pulados).toEqual([]);
    const [linha] = await passagensDa(vaga.id);
    expect(linha?.emittedAt).toBeTruthy();
    expect(linha?.transportType).toBeNull();
    expect(await statusDa(vaga.id)).toBe("passagem_comprada");
  });

  it("Validação de Escala com transportModeIda 'van': pulada", async () => {
    const c = await cenario();
    const vaga = await vagaDeCampinas(c, c.evento.id, { transportModeIda: "van", transportModeVolta: "van" });
    const res = await emitir(c.agent, [vaga.id]);
    expect(res.body.pulados).toEqual([{ id: vaga.id, motivo: MOTIVO_VAI_DE_TERRESTRE, tipo: "terrestre", pernas: ["ida", "volta"] }]);
    expect(await passagensDa(vaga.id)).toHaveLength(0);
  });

  it("já registrada como carro/van nas duas pernas: pulada, 'já registrada como carro/van'", async () => {
    const c = await cenario();
    const vaga = await vagaDeCampinas(c, c.evento.id, { flightReturnSuggestedTime: "14h carro" });
    const reg = await mutacao(c.agent.post("/api/transportes-terrestres")).send({ itens: [
      { teamInclusionId: vaga.id, trecho: "ida", modo: "carro", valorCentavos: 15_000 },
      { teamInclusionId: vaga.id, trecho: "volta", modo: "carro", valorCentavos: 15_000 },
    ] });
    expect(reg.status, JSON.stringify(reg.body)).toBe(200);
    expect(await statusDa(vaga.id)).toBe("passagem_comprada");

    const res = await emitir(c.agent, [vaga.id]);
    expect(res.body.pulados).toEqual([{ id: vaga.id, motivo: MOTIVO_JA_TERRESTRE, tipo: "ja_terrestre", pernas: [] }]);
    expect(await passagensDa(vaga.id)).toHaveLength(0);
  });

  it("só a volta registrada de carro e a ida aérea: carimba (a passagem aérea da ida)", async () => {
    const c = await cenario();
    const vaga = await vagaDeCampinas(c, c.evento.id, { flightReturnSuggestedTime: "14h carro" });
    const reg = await mutacao(c.agent.post("/api/transportes-terrestres")).send({ itens: [{ teamInclusionId: vaga.id, trecho: "volta", modo: "carro", valorCentavos: 15_000 }] });
    expect(reg.status).toBe(200);

    const res = await emitir(c.agent, [vaga.id]);
    expect(res.body.ok).toEqual([vaga.id]);
    expect(await passagensDa(vaga.id)).toHaveLength(1);
  });

  it("lote das 5 de Campinas + 1 aérea: só a aérea ganha a linha", async () => {
    const c = await cenario();
    const vans = await Promise.all([1, 2, 3, 4].map(() => vagaDeCampinas(c, c.evento.id, { flightArrivalSuggestedTime: "van - 20h", flightReturnSuggestedTime: "van - 20h" })));
    const carro = await vagaDeCampinas(c, c.evento.id, { flightReturnSuggestedTime: "14h carro" });
    const aerea = await vagaDeCampinas(c, c.evento.id);
    const ids = [...vans.map((v) => v.id), carro.id, aerea.id];

    const res = await emitir(c.agent, ids);
    expect(res.status).toBe(200);
    expect(res.body.ok).toEqual([aerea.id]);
    expect(res.body.pulados.map((p: { id: string }) => p.id)).toEqual([...vans.map((v) => v.id), carro.id]);
    for (const v of [...vans, carro]) {
      expect(await passagensDa(v.id)).toHaveLength(0);
      expect(await statusDa(v.id)).toBe("escalado");
    }
    expect(await passagensDa(aerea.id)).toHaveLength(1);
  });

  it("vaga com passagem de verdade e Sugestão de carro: a passagem é carimbada como sempre", async () => {
    const c = await cenario();
    const vaga = await vagaDeCampinas(c, c.evento.id, { flightReturnSuggestedTime: "14h carro" });
    const compra = await mutacao(c.agent.post("/api/tickets")).send({
      teamInclusionId: vaga.id, transportType: "aereo", value: 91000, purchaseOrderNumber: "OC-1", locator: "ABC123",
      actualDepartureDate: "2027-10-09", actualDepartureTime: "18:55",
    });
    expect(compra.status, JSON.stringify(compra.body)).toBe(200);
    const res = await emitir(c.agent, [vaga.id]);
    expect(res.body.ok).toEqual([vaga.id]);
    const [linha] = await passagensDa(vaga.id);
    expect(linha?.emittedAt).toBeTruthy();
  });
});

describe("POST /api/transportes-terrestres — a passagem em branco do carimbo sai", () => {
  it("vaga com a linha só do carimbo: registrar carro/van nas duas pernas apaga a linha (auditada) e a vaga segue coberta", async () => {
    const c = await cenario();
    const vaga = await vagaDeCampinas(c, c.evento.id);
    // A linha em branco como ficou em produção (criada antes desta correção).
    expect((await emitir(c.agent, [vaga.id])).body.ok).toEqual([vaga.id]);
    const [vazia] = await passagensDa(vaga.id);
    expect(vazia).toBeTruthy();

    const reg = await mutacao(c.agent.post("/api/transportes-terrestres")).send({ itens: [
      { teamInclusionId: vaga.id, trecho: "ida", modo: "van", empresa: "Transluz", valorCentavos: 10_000 },
      { teamInclusionId: vaga.id, trecho: "volta", modo: "van", empresa: "Transluz", valorCentavos: 10_000 },
    ] });
    expect(reg.status, JSON.stringify(reg.body)).toBe(200);
    expect(reg.body.vaziasRemovidas).toEqual([vaga.id]);
    expect(await passagensDa(vaga.id)).toHaveLength(0);
    expect(await statusDa(vaga.id)).toBe("passagem_comprada");
    const logs = await ctx.db.select().from(ctx.schema.systemLogs)
      .where(and(eq(ctx.schema.systemLogs.entityType, "ticket"), eq(ctx.schema.systemLogs.entityId, vazia.id)));
    expect(logs.some((l) => l.action === "delete")).toBe(true);
  });

  it("só uma perna terrestre: a linha fica (pode ser o bilhete da outra perna)", async () => {
    const c = await cenario();
    const vaga = await vagaDeCampinas(c, c.evento.id);
    await emitir(c.agent, [vaga.id]);
    const reg = await mutacao(c.agent.post("/api/transportes-terrestres")).send({ itens: [{ teamInclusionId: vaga.id, trecho: "volta", modo: "carro", valorCentavos: 10_000 }] });
    expect(reg.status).toBe(200);
    expect(reg.body.vaziasRemovidas).toEqual([]);
    expect(await passagensDa(vaga.id)).toHaveLength(1);
  });

  it("passagem com dado nunca é apagada", async () => {
    const c = await cenario();
    const vaga = await vagaDeCampinas(c, c.evento.id);
    await emitir(c.agent, [vaga.id]);
    const [linha] = await passagensDa(vaga.id);
    await mutacao(c.agent.patch(`/api/tickets/${linha.id}`)).send({ ticketObservations: "Bilhete por e-mail" });
    // Com dado na linha, a perna sem data continua livre para o terrestre.
    const reg = await mutacao(c.agent.post("/api/transportes-terrestres")).send({ itens: [
      { teamInclusionId: vaga.id, trecho: "ida", modo: "carro", valorCentavos: 10_000 },
      { teamInclusionId: vaga.id, trecho: "volta", modo: "carro", valorCentavos: 10_000 },
    ] });
    expect(reg.status).toBe(200);
    expect(reg.body.vaziasRemovidas).toEqual([]);
    expect(await passagensDa(vaga.id)).toHaveLength(1);
  });
});
