/**
 * Regras da reunião de 29/10 nas rotas — sobre o PGlite.
 *
 *  - PATCH /api/team-inclusions/:id/dias-carregamento: só dias de trabalho, sem
 *    repetir; tirar o dia da escala tira a marca;
 *  - domingo da Night: é pago, mas não aparece para marcar nem trava o
 *    check-out final (montarPrestacao).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { agenteLogado, criarApp, criarColaborador, criarEvento, criarFuncao, criarVaga, mutacao, type Contexto } from "./harness";
import { eq } from "drizzle-orm";
import { lerConfiguracaoDoBanco, montarPrestacao, permissaoDeConfirmar } from "../presenca-servico";
import { expurgarSelfies } from "../expurgo-selfies";

let ctx: Contexto;
beforeAll(async () => { ctx = await criarApp(); });

async function vagaDeTresDias(p: { name?: string; start?: string; end?: string } = {}) {
  const { user } = await agenteLogado("admin");
  const evento = await criarEvento({ name: p.name, startDate: p.start ?? "2026-11-12", endDate: p.end ?? "2026-11-15" });
  const vaga = await criarVaga({ userId: user.id, eventId: evento.id });
  await ctx.storage.updateTeamInclusion(vaga.id, {
    scheduleStartDate: p.start ?? "2026-11-12", scheduleEndDate: "2026-11-14",
    workDays: ["2026-11-12", "2026-11-13", "2026-11-14"], dailyRates: 3,
  } as never);
  return { evento, vaga };
}

describe("PATCH /api/team-inclusions/:id/dias-carregamento", () => {
  it("grava os dias sem repetir, em ordem", async () => {
    const { agent } = await agenteLogado("production");
    const { vaga } = await vagaDeTresDias();
    const r = await mutacao(agent.patch(`/api/team-inclusions/${vaga.id}/dias-carregamento`)).send({ diasCarregamento: ["2026-11-14", "2026-11-13", "2026-11-14"] });
    expect(r.status, r.text).toBe(200);
    expect(r.body.diasCarregamento).toEqual(["2026-11-13", "2026-11-14"]);
  });

  it("dia fora dos dias de trabalho → 400; formato errado → 400", async () => {
    const { agent } = await agenteLogado("production");
    const { vaga } = await vagaDeTresDias();
    const fora = await mutacao(agent.patch(`/api/team-inclusions/${vaga.id}/dias-carregamento`)).send({ diasCarregamento: ["2026-11-20"] });
    expect(fora.status).toBe(400);
    expect(fora.body.message).toContain("20/11");
    const lixo = await mutacao(agent.patch(`/api/team-inclusions/${vaga.id}/dias-carregamento`)).send({ diasCarregamento: "ontem" });
    expect(lixo.status).toBe(400);
  });

  it("tirar o dia da escala tira a marca", async () => {
    const { agent } = await agenteLogado("admin");
    const { vaga } = await vagaDeTresDias();
    await mutacao(agent.patch(`/api/team-inclusions/${vaga.id}/dias-carregamento`)).send({ diasCarregamento: ["2026-11-13", "2026-11-14"] });
    const r = await mutacao(agent.patch(`/api/team-inclusions/${vaga.id}`)).send({ workDays: ["2026-11-12", "2026-11-13"] });
    expect(r.status, r.text).toBe(200);
    expect(r.body.diasCarregamento).toEqual(["2026-11-13"]);
  });
});

describe("Domingo da Night na presença", () => {
  async function prestacao(nome: string, tipo: string) {
    const { user } = await agenteLogado("admin");
    const evento = await criarEvento({ name: nome, startDate: "2026-11-13", endDate: "2026-11-15" });
    const funcao = await criarFuncao({ name: `kit ${Math.random().toString(36).slice(2, 8)}` });
    const colab = await criarColaborador();
    const vaga = await criarVaga({ userId: user.id, eventId: evento.id, functionId: funcao.id, collaboratorId: colab.id });
    await ctx.storage.updateTeamInclusion(vaga.id, { scheduleStartDate: "2026-11-13", scheduleEndDate: "2026-11-14", workDays: ["2026-11-13", "2026-11-14"], dailyRates: 2 } as never);
    const [actual] = await ctx.db.insert(ctx.schema.budgetActual).values({
      eventId: evento.id, collaboratorId: colab.id, functionId: funcao.id, collaboratorType: tipo,
      dailyQuantity: 2, dailyValue: 15_000, totalValue: 30_000, workedDays: ["2026-11-13", "2026-11-14", "2026-11-15"], sentForReview: false, rhStatus: "pendente",
    } as never).returning();
    return actual;
  }

  it("casa em Night: o domingo fica fora dos dias de marcar e das pendências, mas continua pago", async () => {
    const actual = await prestacao("Night Run Teste 2026", "casa");
    const m = await montarPrestacao(actual.id, await lerConfiguracaoDoBanco());
    expect(m?.dias).toEqual(["2026-11-13", "2026-11-14"]);
    expect(m?.pendentes).toEqual(["2026-11-13", "2026-11-14"]);
    expect(m?.calculo.diasPagos).toContain("2026-11-15");
  });

  it("freela ou evento que não é Night: domingo gravado segue pedindo presença", async () => {
    const freela = await prestacao("Night Run Teste 2026", "freela");
    expect((await montarPrestacao(freela.id, await lerConfiguracaoDoBanco()))?.dias).toContain("2026-11-15");
    const outro = await prestacao("Maratona Teste", "casa");
    expect((await montarPrestacao(outro.id, await lerConfiguracaoDoBanco()))?.pendentes).toContain("2026-11-15");
  });
});


describe("Segunda revisão de 03/11", () => {
  async function night(tipo: string) {
    const { agent, user } = await agenteLogado("admin");
    const evento = await criarEvento({ name: "Night Run Revisão 2026", startDate: "2026-11-13", endDate: "2026-11-15" });
    const funcao = await criarFuncao({ name: `kit ${Math.random().toString(36).slice(2, 8)}` });
    const colab = await criarColaborador();
    const vaga = await criarVaga({ userId: user.id, eventId: evento.id, functionId: funcao.id, collaboratorId: colab.id });
    await ctx.storage.updateTeamInclusion(vaga.id, { scheduleStartDate: "2026-11-13", scheduleEndDate: "2026-11-14", workDays: ["2026-11-13", "2026-11-14"], dailyRates: 2 } as never);
    const [actual] = await ctx.db.insert(ctx.schema.budgetActual).values({
      eventId: evento.id, collaboratorId: colab.id, functionId: funcao.id, collaboratorType: tipo,
      dailyQuantity: 2, dailyValue: 15_000, totalValue: 30_000, workedDays: ["2026-11-13", "2026-11-14", "2026-11-15"], sentForReview: false, rhStatus: "pendente",
    } as never).returning();
    return { agent, evento, funcao, colab, vaga, actual };
  }

  it("carregamento com a vaga já no Realizado: não marca, a prestação guarda a janta dela", async () => {
    const { agent, vaga } = await night("casa");
    const r = await mutacao(agent.patch(`/api/team-inclusions/${vaga.id}/dias-carregamento`)).send({ diasCarregamento: ["2026-11-13"] });
    expect(r.status).toBe(409);
    expect(r.body.message).toContain("Realizado");
  });

  it("falta no sábado tira também o domingo; sem falta, o domingo segue pago", async () => {
    const { actual } = await night("casa");
    const config = await lerConfiguracaoDoBanco();
    expect((await montarPrestacao(actual.id, config))?.calculo.diasPagos).toContain("2026-11-15");
    await ctx.db.insert(ctx.schema.presencaOcorrencias).values({ actualId: actual.id, tipo: "falta", dia: "2026-11-14", criadoPor: "x" } as never);
    const pagos = (await montarPrestacao(actual.id, config))?.calculo.diasPagos ?? [];
    expect(pagos).not.toContain("2026-11-14");
    expect(pagos).not.toContain("2026-11-15");
  });

  it("filho da divisão usa a vaga do titular: o domingo da Night não pede presença", async () => {
    const { evento, funcao, actual } = await night("casa");
    const outro = await criarColaborador();
    const [filho] = await ctx.db.insert(ctx.schema.budgetActual).values({
      eventId: evento.id, collaboratorId: outro.id, functionId: funcao.id, collaboratorType: "casa", splitParentId: actual.id,
      dailyQuantity: 1, dailyValue: 15_000, totalValue: 15_000, workedDays: ["2026-11-14", "2026-11-15"], sentForReview: false, rhStatus: "pendente",
    } as never).returning();
    const m = await montarPrestacao(filho.id, await lerConfiguracaoDoBanco());
    expect(m?.dias).toEqual(["2026-11-14"]);
    expect(m?.calculo.diasPagos).toContain("2026-11-15");
  });

  it("confirmada e aprovada: o portal não refaz a confirmação", async () => {
    const { actual } = await night("freela");
    await ctx.db.update(ctx.schema.budgetActual).set({ rhStatus: "aprovado", sentForReview: true } as never).where(eq(ctx.schema.budgetActual.id, actual.id));
    await ctx.db.insert(ctx.schema.presencaConfirmacoes).values({ actualId: actual.id, collaboratorId: actual.collaboratorId, confirmadoPor: "colaborador", diasConfirmados: ["2026-11-13"] } as never);
    const m = await montarPrestacao(actual.id, await lerConfiguracaoDoBanco());
    expect(permissaoDeConfirmar(m!, "2026-12-01").ok).toBe(false);
  });

  it("expurgo apaga a localização, inclusive de presença sem foto", async () => {
    const { actual } = await night("freela");
    await ctx.db.update(ctx.schema.budgetActual).set({ pagoEm: "2020-01-01" } as never).where(eq(ctx.schema.budgetActual.id, actual.id));
    await ctx.db.insert(ctx.schema.presencas).values({ actualId: actual.id, eventId: actual.eventId, collaboratorId: actual.collaboratorId, dia: "2026-11-13", checkinEm: new Date(), checkinLat: "-23.5", checkinLng: "-46.6", checkinPrecisaoM: 10 } as never);
    await expurgarSelfies({ simular: false, ator: null, origem: "manual" });
    const [p] = await ctx.db.select().from(ctx.schema.presencas).where(eq(ctx.schema.presencas.actualId, actual.id));
    expect(p).toMatchObject({ checkinLat: null, checkinLng: null, checkinPrecisaoM: null });
  });
});
