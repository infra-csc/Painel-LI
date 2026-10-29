/**
 * Dobra de turno no Realizado (29/10) — rotas sobre o PGlite.
 *
 *  - PATCH /api/budget-actual/:id aceita `diasDobra` com o mesmo saneamento do
 *    ½: só dias ativos da prestação, sem repetir; a dobra tira o ½ do mesmo
 *    dia; tirar o dia (workedDays) tira a dobra; o motivo da mudança diz
 *    "Dobra de turno em dd/mm"; a auditoria guarda a lista;
 *  - prestação enviada ao DP: só o DP mexe (a rota já é só do financeiro);
 *  - depois do 1º check-out final, a dobra marcada entra na BASE do recálculo
 *    (refeito depois da devolução, o 2º check-out final não a perde).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { agenteLogado, criarApp, criarColaborador, criarEvento, criarFuncao, mutacao, type Contexto } from "./harness";

let ctx: Contexto;
beforeAll(async () => { ctx = await criarApp(); });

// Freela seg 02/11 a qua 04/11/2026, diária R$ 100, sem alimentação nem mobilidade.
const DIAS = ["2026-11-02", "2026-11-03", "2026-11-04"];

async function prestacao(extra: Record<string, unknown> = {}) {
  const evento = await criarEvento({ startDate: "2026-11-02", endDate: "2026-11-04" });
  const funcao = await criarFuncao();
  const colab = await criarColaborador();
  const [actual] = await ctx.db.insert(ctx.schema.budgetActual).values({
    eventId: evento.id, collaboratorId: colab.id, functionId: funcao.id, collaboratorType: "freela",
    dailyQuantity: 3, dailyValue: 10_000, totalValue: 30_000, workedDays: DIAS, sentForReview: false, rhStatus: "pendente", ...extra,
  } as any).returning();
  return actual;
}

describe("PATCH /api/budget-actual/:id — dobra de turno (29/10)", () => {
  it("grava só dias ativos, sem repetir; a dobra tira o ½ do dia; o motivo diz a dobra", async () => {
    const { agent } = await agenteLogado("financial");
    const actual = await prestacao({ diasMeiaExtra: ["2026-11-03", "2026-11-04"], changeReason: "Ficou até a desmontagem" });
    const r = await mutacao(agent.patch(`/api/budget-actual/${actual.id}`)).send({
      diasDobra: ["2026-11-03", "2026-11-03", "2026-11-09", "lixo"], dailyQuantity: 4, totalValue: 40_000,
    });
    expect(r.status).toBe(200);
    expect(r.body.diasDobra).toEqual(["2026-11-03"]);
    expect(r.body.diasMeiaExtra).toEqual(["2026-11-04"]);
    expect(r.body.changeReason).toBe("Ficou até a desmontagem · Dobra de turno em 03/11 (2 diárias no dia)");
    expect(r.body.dailyQuantity).toBe(4);
    // A auditoria leva a lista (o histórico mostra "Dobra de turno marcada em 03/11").
    const logs = await agent.get(`/api/activity-logs?entityType=budget_actual&entityId=${actual.id}`);
    expect(JSON.stringify(logs.body)).toContain("diasDobra");
  });

  it("tirar o dia dos trabalhados tira a dobra dele; tirar a dobra tira o trecho do motivo", async () => {
    const { agent } = await agenteLogado("financial");
    const actual = await prestacao({ diasDobra: ["2026-11-03"], dailyQuantity: 4, totalValue: 40_000, changeReason: "Dobra de turno em 03/11 (2 diárias no dia)" });
    const r = await mutacao(agent.patch(`/api/budget-actual/${actual.id}`)).send({ workedDays: ["2026-11-02", "2026-11-04"] });
    expect(r.status).toBe(200);
    expect(r.body.diasDobra).toEqual([]);
    expect(r.body.changeReason).toBeNull();
  });

  it("prestação enviada ao DP: a produção não mexe (403); o DP marca", async () => {
    const actual = await prestacao({ sentForReview: true });
    const producao = await agenteLogado("production");
    const negado = await mutacao(producao.agent.patch(`/api/budget-actual/${actual.id}`)).send({ diasDobra: ["2026-11-02"] });
    expect(negado.status).toBe(403);
    const dp = await agenteLogado("financial");
    const ok = await mutacao(dp.agent.patch(`/api/budget-actual/${actual.id}`)).send({ diasDobra: ["2026-11-02"], dailyQuantity: 4, totalValue: 40_000 });
    expect(ok.status).toBe(200);
    expect(ok.body.diasDobra).toEqual(["2026-11-02"]);
    // O DP mexeu na quantidade: fica como ajuste do DP (de → para).
    expect(ok.body.rhAdjusted).toBe(true);
  });

  it("depois do 1º check-out final (devolvida), a dobra marcada entra na base do recálculo", async () => {
    const { agent } = await agenteLogado("financial");
    const base = {
      dailyQuantity: 3, dailyValue: 10_000, totalValue: 30_000, weekdayLunch: 0, weekdayDinner: 0, weekendLunch: 0, weekendDinner: 0,
      mobility: 0, transport: 0, workedDays: DIAS, diasMeiaExtra: null,
    };
    const actual = await prestacao({ rhStatus: "devolvido", checkoutFinalEm: new Date(), baseCheckoutFinal: base });
    const r = await mutacao(agent.patch(`/api/budget-actual/${actual.id}`)).send({ diasDobra: ["2026-11-03"], dailyQuantity: 4, totalValue: 40_000 });
    expect(r.status).toBe(200);
    const [linha] = await ctx.db.select().from(ctx.schema.budgetActual).where(eq(ctx.schema.budgetActual.id, actual.id));
    expect(linha.baseCheckoutFinal).toMatchObject({ totalValue: 40_000, dailyQuantity: 4, dailyValue: 10_000, diasDobra: ["2026-11-03"] });
    // Tirar a dobra tira da base também.
    await mutacao(agent.patch(`/api/budget-actual/${actual.id}`)).send({ diasDobra: [], dailyQuantity: 3, totalValue: 30_000 });
    const [depois] = await ctx.db.select().from(ctx.schema.budgetActual).where(eq(ctx.schema.budgetActual.id, actual.id));
    expect(depois.baseCheckoutFinal).toMatchObject({ totalValue: 30_000, dailyQuantity: 3, diasDobra: null });
  });

  it("PATCH sem mexer na dobra não toca no motivo nem na base", async () => {
    const { agent } = await agenteLogado("financial");
    const actual = await prestacao({ diasDobra: ["2026-11-03"], changeReason: "Motivo antigo" });
    const r = await mutacao(agent.patch(`/api/budget-actual/${actual.id}`)).send({ diasDobra: ["2026-11-03"], observations: "ok" });
    expect(r.status).toBe(200);
    expect(r.body.changeReason).toBe("Motivo antigo");
    expect(r.body.baseCheckoutFinal).toBeNull();
  });
});

describe("POST /api/budget-actual/:id/split — ½ e dobra (29/10)", () => {
  it("o titular fica só com o ½ e a dobra dos dias que continuam com ele; a dobra que fica conta 1 diária", async () => {
    const { agent } = await agenteLogado("financial");
    const actual = await prestacao({ diasDobra: ["2026-11-02"], diasMeiaExtra: ["2026-11-04"], dailyQuantity: 4, totalValue: 40_000 });
    const novo = await criarColaborador();
    const r = await mutacao(agent.post(`/api/budget-actual/${actual.id}/split`)).send({
      collaboratorId: novo.id, collaboratorType: "freela", workedDays: ["2026-11-04"], parentWorkedDays: ["2026-11-02", "2026-11-03"],
      dailyValue: 10_000, dailyQuantity: 1, weekdayLunch: 0, weekdayDinner: 0, weekendLunch: 0, weekendDinner: 0, mobility: 0,
      parentValues: { dailyQuantity: 2, weekdayLunch: 0, weekdayDinner: 0, weekendLunch: 0, weekendDinner: 0, mobility: 0 },
    });
    expect(r.status).toBe(201);
    const [pai] = await ctx.db.select().from(ctx.schema.budgetActual).where(eq(ctx.schema.budgetActual.id, actual.id));
    expect(pai.diasDobra).toEqual(["2026-11-02"]);
    expect(pai.diasMeiaExtra).toBeNull();
    expect(pai.dailyQuantity).toBe(3);
    expect(r.body.diasDobra ?? null).toBeNull();
  });
});
