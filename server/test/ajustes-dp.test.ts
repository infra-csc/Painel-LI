/**
 * Ajustes pedidos pelo DP (28/10) — rotas sobre o PGlite.
 *
 *  - "Voltar ao Planejado": permissões (DP/admin; produção não), motivo
 *    obrigatório, bloqueio com OC e com NF, a prestação e as divisões saem,
 *    a linha do Planejado volta a pendente, o crédito automático do Flash de
 *    um comparativo APROVADO é desfeito (os das outras prestações ficam) e a
 *    auditoria leva a cópia do que saiu;
 *  - PATCH /api/budget-actual: zerar a mobilidade zera ida e volta (caso Lucas);
 *  - 1,5 diária na vaga (rota dedicada) e o VR do colaborador.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { agenteLogado, criarApp, criarColaborador, criarEvento, criarFuncao, criarVaga, mutacao, type Contexto } from "./harness";

let ctx: Contexto;
beforeAll(async () => { ctx = await criarApp(); });

async function prestacao(extra: Record<string, unknown> = {}) {
  const evento = await criarEvento();
  const funcao = await criarFuncao();
  const colab = await criarColaborador();
  const planejado = await ctx.storage.createBudgetPlanned({
    eventId: evento.id, collaboratorId: colab.id, functionId: funcao.id, collaboratorType: "freela",
    dailyQuantity: 3, dailyValue: 54_000, mobility: 11_600, mobilityIda: 5_800, mobilityVolta: 5_800, totalValue: 173_600,
    status: "pre_aprovado",
  } as any);
  const [actual] = await ctx.db.insert(ctx.schema.budgetActual).values({
    plannedId: planejado.id, eventId: evento.id, collaboratorId: colab.id, functionId: funcao.id, collaboratorType: "freela",
    dailyQuantity: 3, dailyValue: 54_000, mobility: 11_600, mobilityIda: 5_800, mobilityVolta: 5_800, totalValue: 173_600,
    sentForReview: true, rhStatus: "pendente", ...extra,
  } as any).returning();
  return { evento, funcao, colab, planejado, actual };
}

describe("POST /api/budget-actual/:id/voltar-ao-planejado", () => {
  it("produção não volta (403); sem motivo, 400", async () => {
    const { actual } = await prestacao();
    const { agent: prod } = await agenteLogado("production");
    expect((await mutacao(prod.post(`/api/budget-actual/${actual.id}/voltar-ao-planejado`)).send({ motivo: "ajuste da mobilidade" })).status).toBe(403);
    const { agent: dp } = await agenteLogado("financial");
    expect((await mutacao(dp.post(`/api/budget-actual/${actual.id}/voltar-ao-planejado`)).send({ motivo: "  " })).status).toBe(400);
  });

  it("com OC registrada ou com nota fiscal não volta (409, com o código)", async () => {
    const { agent } = await agenteLogado("financial");
    const comOc = await prestacao({ ocNumero: "OC-123", ocRegistradaEm: new Date() });
    const r1 = await mutacao(agent.post(`/api/budget-actual/${comOc.actual.id}/voltar-ao-planejado`)).send({ motivo: "ajuste da mobilidade" });
    expect(r1.status).toBe(409);
    expect(r1.body.codigo).toBe("com_oc");

    const comNf = await prestacao();
    await ctx.db.insert(ctx.schema.invoices).values({
      eventId: comNf.evento.id, collaboratorId: comNf.colab.id, functionId: comNf.funcao.id, budgetActualId: comNf.actual.id,
    } as any);
    const r2 = await mutacao(agent.post(`/api/budget-actual/${comNf.actual.id}/voltar-ao-planejado`)).send({ motivo: "ajuste da mobilidade" });
    expect(r2.status).toBe(409);
    expect(r2.body.codigo).toBe("com_nf");
    expect(await ctx.storage.getBudgetActualById(comNf.actual.id)).toBeTruthy();
  });

  // 28/10: a trava de evento encerrado é da escala — o DP corrige honorário depois do evento.
  it("evento já encerrado: o DP volta assim mesmo (200)", async () => {
    const { evento, actual } = await prestacao();
    await ctx.db.update(ctx.schema.events).set({ startDate: "2026-01-02", endDate: "2026-01-04" }).where(eq(ctx.schema.events.id, evento.id));
    const { agent } = await agenteLogado("financial");
    const r = await mutacao(agent.post(`/api/budget-actual/${actual.id}/voltar-ao-planejado`)).send({ motivo: "ajuste da mobilidade" });
    expect(r.status, r.text).toBe(200);
  });

  it("divisão (filha) não volta sozinha (409)", async () => {
    const { agent } = await agenteLogado("financial");
    const { evento, funcao, actual } = await prestacao();
    const outro = await criarColaborador();
    const [filha] = await ctx.db.insert(ctx.schema.budgetActual).values({
      splitParentId: actual.id, plannedId: actual.plannedId, eventId: evento.id, collaboratorId: outro.id, functionId: funcao.id,
    } as any).returning();
    const r = await mutacao(agent.post(`/api/budget-actual/${filha.id}/voltar-ao-planejado`)).send({ motivo: "ajuste da mobilidade" });
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe("divisao");
  });

  it("DP volta: prestação e divisões saem, a linha pede a pré-aprovação, o Flash do comparativo aprovado é desfeito e tudo vai para a auditoria", async () => {
    const { agent, user } = await agenteLogado("financial");
    const { evento, funcao, colab, planejado, actual } = await prestacao();
    const outro = await criarColaborador();
    const [filha] = await ctx.db.insert(ctx.schema.budgetActual).values({
      splitParentId: actual.id, plannedId: actual.plannedId, eventId: evento.id, collaboratorId: outro.id, functionId: funcao.id,
      mobility: 2_900, sentForReview: true, rhStatus: "pendente",
    } as any).returning();
    // Outra prestação do evento, que continua com o crédito dela.
    const terceiro = await criarColaborador();
    const [fica] = await ctx.db.insert(ctx.schema.budgetActual).values({
      eventId: evento.id, collaboratorId: terceiro.id, functionId: funcao.id, mobility: 5_800, mobilityIda: 2_900, mobilityVolta: 2_900,
      totalValue: 5_800, sentForReview: true, rhStatus: "aprovado",
    } as any).returning();
    // Comparativo aprovado → crédito automático (regra 19/08).
    const comparativo = await ctx.storage.createBudgetComparison({ eventId: evento.id, status: "pendente" } as any);
    const aprovar = await mutacao(agent.post(`/api/budget-comparison/${comparativo.id}/approve`)).send({});
    expect(aprovar.status).toBe(200);
    const flashAntes = await ctx.db.select().from(ctx.schema.flashMovements).where(eq(ctx.schema.flashMovements.eventId, evento.id));
    expect(flashAntes.some((m) => m.sourceRef === actual.id)).toBe(true);
    expect(flashAntes.some((m) => m.sourceRef === fica.id)).toBe(true);

    const r = await mutacao(agent.post(`/api/budget-actual/${actual.id}/voltar-ao-planejado`)).send({ motivo: "Empreita sem mobilidade — recalcular" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, plannedId: planejado.id, divisoesRemovidas: 1, comparativoAprovado: true });
    expect(r.body.flash.removidos).toBeGreaterThanOrEqual(2);

    expect(await ctx.storage.getBudgetActualById(actual.id)).toBeUndefined();
    expect(await ctx.storage.getBudgetActualById(filha.id)).toBeUndefined();
    expect(await ctx.storage.getBudgetActualById(fica.id)).toBeTruthy();
    const linha = await ctx.storage.getBudgetPlannedById(planejado.id);
    expect(linha?.status).toBe("pendente");
    expect(linha?.approvedBy).toBeNull();

    const flashDepois = await ctx.db.select().from(ctx.schema.flashMovements).where(eq(ctx.schema.flashMovements.eventId, evento.id));
    expect(flashDepois.some((m) => m.sourceRef === actual.id || m.sourceRef === filha.id)).toBe(false);
    expect(flashDepois.some((m) => m.sourceRef === fica.id)).toBe(true);
    expect((await ctx.storage.getBudgetComparison(evento.id))?.status).toBe("aprovado");

    const [log] = await ctx.db.select().from(ctx.schema.systemLogs).where(and(
      eq(ctx.schema.systemLogs.entityType, "budget_actual"), eq(ctx.schema.systemLogs.entityId, actual.id), eq(ctx.schema.systemLogs.action, "delete"),
    ));
    expect(log).toBeTruthy();
    expect(log.userId).toBe(user.id);
    const copia = JSON.stringify(log.newData);
    expect(copia).toContain("Empreita sem mobilidade");
    expect(copia).toContain(filha.id);
    expect(copia).toContain(colab.id);
  });

  it("lançamento direto no Realizado (sem Planejado) não volta (409)", async () => {
    const { agent } = await agenteLogado("admin");
    const evento = await criarEvento();
    const [direto] = await ctx.db.insert(ctx.schema.budgetActual).values({ eventId: evento.id } as any).returning();
    const r = await mutacao(agent.post(`/api/budget-actual/${direto.id}/voltar-ao-planejado`)).send({ motivo: "teste de lançamento" });
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe("sem_planejado");
  });
});

describe("PATCH /api/budget-actual/:id — mobilidade coerente (caso Lucas)", () => {
  it("zerar só o total zera ida e volta", async () => {
    const { agent } = await agenteLogado("financial");
    const { actual } = await prestacao({ sentForReview: false });
    const r = await mutacao(agent.patch(`/api/budget-actual/${actual.id}`)).send({ mobility: 0, totalValue: 162_000 });
    expect(r.status).toBe(200);
    expect([r.body.mobility, r.body.mobilityIda, r.body.mobilityVolta]).toEqual([0, 0, 0]);
  });

  it("mandar só ida/volta recalcula o total da mobilidade e o da prestação", async () => {
    const { agent } = await agenteLogado("financial");
    const { actual } = await prestacao({ sentForReview: false });
    const r = await mutacao(agent.patch(`/api/budget-actual/${actual.id}`)).send({ mobilityIda: 0, mobilityVolta: 0 });
    expect(r.status).toBe(200);
    expect(r.body.mobility).toBe(0);
    expect(r.body.totalValue).toBe(173_600 - 11_600);
  });
});

describe("1,5 diária na vaga e VR do colaborador (28/10)", () => {
  it("PATCH /dias-meia-extra grava só dias de trabalho; dia fora → 400; produção pode", async () => {
    const { agent, user } = await agenteLogado("production");
    const vaga = await criarVaga({ userId: user.id }); // 10–12/10/2099
    const ok = await mutacao(agent.patch(`/api/team-inclusions/${vaga.id}/dias-meia-extra`)).send({ diasMeiaExtra: ["2099-10-12", "2099-10-11", "2099-10-12"] });
    expect(ok.status).toBe(200);
    expect(ok.body.diasMeiaExtra).toEqual(["2099-10-11", "2099-10-12"]);
    const fora = await mutacao(agent.patch(`/api/team-inclusions/${vaga.id}/dias-meia-extra`)).send({ diasMeiaExtra: ["2099-10-20"] });
    expect(fora.status).toBe(400);
    const lixo = await mutacao(agent.patch(`/api/team-inclusions/${vaga.id}/dias-meia-extra`)).send({ diasMeiaExtra: "2099-10-11" });
    expect(lixo.status).toBe(400);
  });

  it("PATCH /api/collaborators/:id/vr: DP grava na casa; freela recusa; Compras edita; perfil Honorários não", async () => {
    const { agent: dp } = await agenteLogado("financial");
    const casa = await criarColaborador();
    await ctx.storage.updateCollaborator(casa.id, { type: "casa" });
    const r = await mutacao(dp.patch(`/api/collaborators/${casa.id}/vr`)).send({ vrDiarioCents: 4_050 });
    expect(r.status).toBe(200);
    expect(r.body.vrDiarioCents).toBe(4_050);
    const freela = await criarColaborador();
    expect((await mutacao(dp.patch(`/api/collaborators/${freela.id}/vr`)).send({ vrDiarioCents: 4_050 })).status).toBe(400);
    const { agent: compras } = await agenteLogado("purchasing");
    const tirar = await mutacao(compras.patch(`/api/collaborators/${casa.id}/vr`)).send({ vrDiarioCents: null });
    expect(tirar.status).toBe(200);
    expect(tirar.body.vrDiarioCents).toBeNull();
    const { agent: hon } = await agenteLogado("honorarios");
    expect((await mutacao(hon.patch(`/api/collaborators/${casa.id}/vr`)).send({ vrDiarioCents: 100 })).status).toBe(403);
  });

  it("Aplicar padrões no Planejado usa o VR do colaborador da casa", async () => {
    const { agent, user } = await agenteLogado("financial");
    const evento = await criarEvento({ startDate: "2099-10-12", endDate: "2099-10-14" });
    const funcao = await criarFuncao({ name: `Produção ${Date.now()}` });
    const casa = await criarColaborador();
    await ctx.storage.updateCollaborator(casa.id, { type: "casa", vrDiarioCents: 4_050 });
    await criarVaga({ userId: user.id, eventId: evento.id, functionId: funcao.id, collaboratorId: casa.id, status: "confirmado", needsTicket: false, scheduleStartDate: "2099-10-12", scheduleEndDate: "2099-10-14" });
    await ctx.storage.createBudgetPlanned({ eventId: evento.id, collaboratorId: casa.id, functionId: funcao.id, collaboratorType: "casa" } as any);
    const r = await mutacao(agent.post(`/api/budget-planned/apply-defaults?eventId=${evento.id}`)).send({});
    expect(r.status).toBe(200);
    const [linha] = await ctx.storage.getBudgetPlanned(evento.id);
    // 12–14/10/2099 = seg a qua: 3 dias úteis; VR R$ 40,50 cobre o almoço de R$ 40,00.
    expect(linha.weekdayLunch).toBe(0);
    expect(linha.weekdayDinner).toBe(3 * 4_000);
  });
});
