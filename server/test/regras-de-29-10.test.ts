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
import { lerConfiguracaoDoBanco, montarPrestacao } from "../presenca-servico";

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

