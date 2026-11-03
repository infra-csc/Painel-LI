/**
 * Conferência automática (deck de 29/10) — rotas sobre o PGlite.
 *
 *  - "Enviar para revisão" e check-out final: sem divergência, a prestação sai
 *    aprovada e já aparece em Ordens de compra; com divergência, fica com o DP;
 *  - o que fica gravado: os campos da decisão do DP, sem autor, com a marca;
 *  - auditoria, Painel de honorários e histórico dizem "Conferência automática";
 *  - idempotência e a guarda de estado do UPDATE.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { agenteLogado, criarApp, criarColaborador, criarEvento, criarFuncao, criarVaga, mutacao, type Contexto } from "./harness";
import { CONFERENCIA_AUTOMATICA } from "@shared/conferencia-automatica";

let ctx: Contexto;
let aplicarConferenciaAutomatica: typeof import("../conferencia-automatica-servico").aplicarConferenciaAutomatica;

beforeAll(async () => {
  ctx = await criarApp();
  ({ aplicarConferenciaAutomatica } = await import("../conferencia-automatica-servico"));
});

// A escala padrão do harness: sex 10/10 a dom 12/10/2099.
const DIAS = ["2099-10-10", "2099-10-11", "2099-10-12"];
const VALORES = { dailyQuantity: 3, dailyValue: 10_000, mobility: 5_800, mobilityIda: 2_900, mobilityVolta: 2_900, totalValue: 35_800 };

interface Opcoes {
  evento?: { startDate: string; endDate: string };
  planejado?: Record<string, unknown>;
  realizado?: Record<string, unknown>;
  semPresenca?: boolean;
  semConfirmacao?: boolean;
}

/** Uma prestação igual ao Planejado pré-aprovado, com presença e confirmação completas. */
async function cenario(o: Opcoes = {}) {
  const { user } = await agenteLogado("financial");
  const evento = await criarEvento(o.evento ?? { startDate: DIAS[0], endDate: DIAS[2] });
  const funcao = await criarFuncao();
  const colab = await criarColaborador();
  await criarVaga({ eventId: evento.id, functionId: funcao.id, collaboratorId: colab.id, userId: user.id });
  const [planejado] = await ctx.db.insert(ctx.schema.budgetPlanned).values({
    eventId: evento.id, collaboratorId: colab.id, functionId: funcao.id, collaboratorType: "freela", status: "pre_aprovado", ...VALORES, ...o.planejado,
  } as never).returning();
  const [actual] = await ctx.db.insert(ctx.schema.budgetActual).values({
    plannedId: planejado.id, eventId: evento.id, collaboratorId: colab.id, functionId: funcao.id, collaboratorType: "freela", ...VALORES, ...o.realizado,
  } as never).returning();
  if (!o.semPresenca) {
    await ctx.db.insert(ctx.schema.presencas).values(DIAS.map((dia) => ({
      actualId: actual.id, eventId: evento.id, collaboratorId: colab.id, dia, checkinEm: new Date(`${dia}T12:00:00Z`), checkoutEm: new Date(`${dia}T21:00:00Z`),
    })) as never);
  }
  if (!o.semConfirmacao) {
    await ctx.db.insert(ctx.schema.presencaConfirmacoes).values({
      actualId: actual.id, confirmadoPor: "colaborador", collaboratorId: colab.id, diasConfirmados: DIAS,
    } as never);
  }
  return { evento, actual, colab };
}

const relida = async (id: string) => (await ctx.db.select().from(ctx.schema.budgetActual).where(eq(ctx.schema.budgetActual.id, id)))[0];

async function enviar(eventId: string) {
  const { agent, user } = await agenteLogado("financial");
  const r = await mutacao(agent.post("/api/budget-actual/send-for-review")).send({ eventId });
  expect(r.status).toBe(200);
  return { r, agent, user };
}

async function esperarNoDp(id: string) {
  const a = await relida(id);
  expect(a.rhStatus).toBe("pendente");
  expect(a.sentForReview).toBe(true);
  expect(a.rhComment).toBeNull();
}

describe("POST /api/budget-actual/send-for-review — conferência automática", () => {
  it("sem divergência: aprovada com os campos da decisão do DP, sem autor, com a marca", async () => {
    const { evento, actual } = await cenario();
    const { r, user } = await enviar(evento.id);
    expect(r.body).toEqual({ updated: 1, conferidasAutomaticamente: 1 });
    const a = await relida(actual.id);
    expect(a.rhStatus).toBe("aprovado");
    expect(a.sentForReview).toBe(true);
    expect(a.rhComment).toBe(CONFERENCIA_AUTOMATICA);
    expect(a.rhActionBy).toBeNull();
    expect(a.rhActionAt).toBeTruthy();
    expect(a.updatedBy).toBe(user.id);
  });

  it("vai direto para Ordens de compra, com a OC liberada e a marca", async () => {
    const { evento, actual } = await cenario();
    const { agent } = await enviar(evento.id);
    const oc = await agent.get(`/api/ordens-de-compra?eventId=${evento.id}`);
    expect(oc.status).toBe(200);
    const linha = oc.body.linhas.find((l: { actualId: string }) => l.actualId === actual.id);
    expect(linha.conferenciaAutomatica).toBe(true);
    expect(linha.valorAprovado).toBe(VALORES.totalValue);
    expect(linha.acoes.registrarOc).toBe(true);
    expect(linha.rhActionAt).toBeTruthy();
  });

  it("auditoria e histórico em nome da conferência automática, depois do envio", async () => {
    const { evento, actual } = await cenario();
    const { agent, user } = await enviar(evento.id);
    const logs = await agent.get(`/api/activity-logs?entityType=budget_actual&entityId=${actual.id}`);
    expect(logs.status).toBe(200);
    const aprovacao = logs.body.find((l: { action: string }) => l.action === "approve");
    expect(aprovacao.user_name).toBe(CONFERENCIA_AUTOMATICA);
    expect(aprovacao.user_id).toBeNull();
    expect(JSON.stringify(aprovacao.new_data)).toContain(CONFERENCIA_AUTOMATICA);
    const envio = logs.body.find((l: { action: string }) => l.action === "send_review");
    expect(envio.user_id).toBe(user.id);
    expect(new Date(aprovacao.created_at).getTime()).toBeGreaterThanOrEqual(new Date(envio.created_at).getTime());
  });

  it("o Painel de honorários mostra a conferência no lugar do nome e não pede ação do DP", async () => {
    const { evento, actual } = await cenario();
    const { agent } = await enviar(evento.id);
    const painel = await agent.get(`/api/rh/controle?eventId=${evento.id}&recorte=todos`);
    expect(painel.status).toBe(200);
    const linha = painel.body.itens.find((l: { actual: { id: string } | null }) => l.actual?.id === actual.id);
    expect(linha.rhActionByName).toBe(CONFERENCIA_AUTOMATICA);
    expect(linha.status).toBe("aprovada_faturamento");
    expect(linha.rhPrecisaAgir).toBe(false);
    expect(linha.trilha.estados.validado).toBe("feita");
    expect(linha.trilha.proxima).toBe("oc_emitida");
  });

  it("idempotente: reenviar não muda nada nem repete a auditoria", async () => {
    const { evento, actual } = await cenario();
    const { agent } = await enviar(evento.id);
    const antes = await relida(actual.id);
    const r = await mutacao(agent.post("/api/budget-actual/send-for-review")).send({ eventId: evento.id });
    expect(r.body).toEqual({ updated: 0, conferidasAutomaticamente: 0 });
    expect((await relida(actual.id)).rhActionAt).toEqual(antes.rhActionAt);
    const logs = await agent.get(`/api/activity-logs?entityType=budget_actual&entityId=${actual.id}`);
    expect(logs.body.filter((l: { action: string }) => l.action === "approve")).toHaveLength(1);
  });

  it("guarda de estado: não sobrescreve a decisão do DP tomada no meio", async () => {
    const { actual } = await cenario();
    const { user, agent } = await agenteLogado("financial");
    const lida = { ...(await relida(actual.id)), sentForReview: true };
    await ctx.db.update(ctx.schema.budgetActual).set({ sentForReview: true }).where(eq(ctx.schema.budgetActual.id, actual.id));
    const decisao = await mutacao(agent.post("/api/budget-actual/rh-action")).send({ itemIds: [actual.id], action: "devolvido", comment: "Confira" });
    expect(decisao.body.updated).toBe(1);
    // A linha lida antes da decisão ainda parece qualificar: o UPDATE guardado a recusa.
    const aprovadas = await ctx.db.transaction((tx) => aplicarConferenciaAutomatica(tx, [lida], user.id));
    expect(aprovadas).toEqual([]);
    const a = await relida(actual.id);
    expect(a.rhStatus).toBe("devolvido");
    expect(a.rhComment).toBe("Confira");
  });

  it("a aprovação automática não fica na fila de decisão do DP", async () => {
    const { evento, actual } = await cenario();
    const { agent } = await enviar(evento.id);
    const r = await mutacao(agent.post("/api/budget-actual/rh-action")).send({ itemIds: [actual.id], action: "rejeitado", comment: "x" });
    expect(r.body.updated).toBe(0);
    expect(r.body.skipped).toEqual([actual.id]);
  });

  it("devolvida pelo DP e reenviada igual: vai ao DP", async () => {
    const { evento, actual } = await cenario();
    await ctx.db.update(ctx.schema.budgetActual).set({ rhStatus: "devolvido", rhActionAt: new Date(), rhComment: "Confira" }).where(eq(ctx.schema.budgetActual.id, actual.id));
    const { r } = await enviar(evento.id);
    expect(r.body).toEqual({ updated: 1, conferidasAutomaticamente: 0 });
    const a = await relida(actual.id);
    expect(a.rhStatus).toBe("pendente");
    expect(a.resubmitted).toBe(true);
  });

  it("evento legado: segue para o DP como antes", async () => {
    const { evento, actual } = await cenario({ evento: { startDate: "2019-10-10", endDate: "2019-10-12" } });
    const { r } = await enviar(evento.id);
    expect(r.body.conferidasAutomaticamente).toBe(0);
    await esperarNoDp(actual.id);
  });

  it.each<[string, Opcoes]>([
    ["valor diferente", { realizado: { totalValue: 40_000, dailyValue: 11_400 } }],
    ["diária a menos", { realizado: { dailyQuantity: 2 } }],
    ["outros dias", { realizado: { workedDays: DIAS.slice(0, 2) } }],
    ["dobra de turno", { realizado: { diasDobra: [DIAS[0]] } }],
    ["½ a mais", { realizado: { diasMeiaExtra: [DIAS[0]] } }],
    ["ajustada pelo DP", { realizado: { rhAdjusted: true } }],
    ["Planejado sem pré-aprovação", { planejado: { status: "pendente" } }],
    ["não participou", { realizado: { didNotAttend: true } }],
    ["sem presença", { semPresenca: true }],
    ["sem a confirmação", { semConfirmacao: true }],
  ])("com divergência (%s): fica com o DP", async (_nome, opcoes) => {
    const { evento, actual } = await cenario(opcoes);
    const { r } = await enviar(evento.id);
    expect(r.body).toEqual({ updated: 1, conferidasAutomaticamente: 0 });
    await esperarNoDp(actual.id);
  });

  it("ocorrência ativa: fica com o DP; removida, deixa de contar", async () => {
    const ativa = await cenario();
    await ctx.db.insert(ctx.schema.presencaOcorrencias).values({ actualId: ativa.actual.id, tipo: "horas_extras", dia: DIAS[0], horas: "2", criadoPor: "teste" } as never);
    expect((await enviar(ativa.evento.id)).r.body.conferidasAutomaticamente).toBe(0);

    const removida = await cenario();
    await ctx.db.insert(ctx.schema.presencaOcorrencias).values({ actualId: removida.actual.id, tipo: "horas_extras", dia: DIAS[0], horas: "2", criadoPor: "teste", removidoEm: new Date() } as never);
    expect((await enviar(removida.evento.id)).r.body.conferidasAutomaticamente).toBe(1);
  });

  it("vaga dividida: o titular e o filho ficam com o DP", async () => {
    const { evento, actual, colab } = await cenario();
    const [filho] = await ctx.db.insert(ctx.schema.budgetActual).values({
      splitParentId: actual.id, plannedId: actual.plannedId, eventId: evento.id, collaboratorId: colab.id, functionId: actual.functionId, collaboratorType: "freela", ...VALORES,
    } as never).returning();
    const { r } = await enviar(evento.id);
    expect(r.body).toEqual({ updated: 2, conferidasAutomaticamente: 0 });
    await esperarNoDp(actual.id);
    await esperarNoDp(filho.id);
  });

  it("no mesmo envio, cada linha decide por si", async () => {
    const { evento, actual } = await cenario();
    const outra = await criarColaborador();
    const funcao = await criarFuncao();
    const [divergente] = await ctx.db.insert(ctx.schema.budgetActual).values({
      eventId: evento.id, collaboratorId: outra.id, functionId: funcao.id, collaboratorType: "freela", ...VALORES,
    } as never).returning();
    const { r } = await enviar(evento.id);
    expect(r.body).toEqual({ updated: 2, conferidasAutomaticamente: 1 });
    expect((await relida(actual.id)).rhStatus).toBe("aprovado");
    await esperarNoDp(divergente.id);
  });
});

describe("POST /api/presenca/:id/checkout-final — conferência automática", () => {
  it("sem divergência: sai aprovada e a resposta diz que foi automática", async () => {
    const { actual } = await cenario();
    const { agent } = await agenteLogado("financial");
    const r = await mutacao(agent.post(`/api/presenca/${actual.id}/checkout-final`)).send({ valorFinal: VALORES.totalValue });
    expect(r.status).toBe(200);
    expect(r.body.realizado.rhStatus).toBe("aprovado");
    expect(r.body.realizado.conferenciaAutomatica).toBe(true);
    const a = await relida(actual.id);
    expect(a.rhComment).toBe(CONFERENCIA_AUTOMATICA);
    expect(a.rhActionBy).toBeNull();
    expect(a.checkoutFinalEm).toBeTruthy();
    const logs = await agent.get(`/api/activity-logs?entityType=budget_actual&entityId=${actual.id}`);
    expect(logs.body.map((l: { action: string }) => l.action).sort()).toEqual(["approve", "send_review", "update"]);
  });

  it("valor final ajustado: fica com o DP", async () => {
    const { actual } = await cenario();
    const { agent } = await agenteLogado("financial");
    const r = await mutacao(agent.post(`/api/presenca/${actual.id}/checkout-final`)).send({ valorFinal: VALORES.totalValue + 1_000 });
    expect(r.status).toBe(200);
    expect(r.body.realizado.rhStatus).toBe("pendente");
    expect(r.body.realizado.conferenciaAutomatica).toBe(false);
    expect(r.body.realizado.sentForReview).toBe(true);
  });

  it("sem a confirmação do colaborador (com justificativa): fica com o DP", async () => {
    const { actual } = await cenario({ semConfirmacao: true });
    const { agent } = await agenteLogado("financial");
    const r = await mutacao(agent.post(`/api/presenca/${actual.id}/checkout-final`)).send({ valorFinal: VALORES.totalValue, justificativa: "O colaborador não respondeu" });
    expect(r.status).toBe(200);
    expect(r.body.realizado.rhStatus).toBe("pendente");
  });

  it("falta lançada: fica com o DP", async () => {
    const { actual } = await cenario();
    await ctx.db.insert(ctx.schema.presencaOcorrencias).values({ actualId: actual.id, tipo: "falta", dia: DIAS[0], criadoPor: "teste" } as never);
    const { agent } = await agenteLogado("financial");
    const r = await mutacao(agent.post(`/api/presenca/${actual.id}/checkout-final`)).send({ valorFinal: VALORES.totalValue });
    expect(r.status).toBe(200);
    expect(r.body.realizado.rhStatus).toBe("pendente");
  });
});

describe("Depois da conferência automática (revisão de 03/11)", () => {
  async function aprovada() {
    const c = await cenario();
    const { agent } = await agenteLogado("financial");
    const r = await mutacao(agent.post("/api/budget-actual/send-for-review")).send({ eventId: c.evento.id });
    expect(r.body.conferidasAutomaticamente).toBe(1);
    return { ...c, agent };
  }

  it("o DP reabre: a prestação volta para a conferência, sem aprovar sozinha de novo", async () => {
    const { actual, agent } = await aprovada();
    const r = await mutacao(agent.post(`/api/budget-actual/${actual.id}/reabrir-conferencia`)).send({});
    expect(r.status, r.text).toBe(200);
    const depois = await relida(actual.id);
    expect(depois).toMatchObject({ rhStatus: "pendente", rhComment: null, rhActionBy: null, sentForReview: true });
    const decisao = await mutacao(agent.post("/api/budget-actual/rh-action")).send({ itemIds: [actual.id], action: "devolvido", comment: "conferir" });
    expect(decisao.body.updated).toBe(1);
  });

  it("não reabre com OC, nem aprovação de pessoa, nem sem ser DP", async () => {
    const { actual, agent } = await aprovada();
    const produtor = await agenteLogado("production");
    expect((await mutacao(produtor.agent.post(`/api/budget-actual/${actual.id}/reabrir-conferencia`)).send({})).status).toBe(403);
    await ctx.db.update(ctx.schema.budgetActual).set({ ocNumero: "OC-1" } as never).where(eq(ctx.schema.budgetActual.id, actual.id));
    expect((await mutacao(agent.post(`/api/budget-actual/${actual.id}/reabrir-conferencia`)).send({})).status).toBe(409);
    const humana = await cenario();
    await ctx.db.update(ctx.schema.budgetActual).set({ sentForReview: true, rhStatus: "aprovado", rhComment: "ok" } as never).where(eq(ctx.schema.budgetActual.id, humana.actual.id));
    expect((await mutacao(agent.post(`/api/budget-actual/${humana.actual.id}/reabrir-conferencia`)).send({})).status).toBe(409);
  });

  it("evento só com conferência automática aparece como comparativo a fechar; aprovado, sai", async () => {
    const { evento, agent } = await aprovada();
    const antes = await agent.get("/api/budget-comparison/a-fechar");
    expect(antes.status, antes.text).toBe(200);
    expect(antes.body.eventos.map((e: { eventId: string }) => e.eventId)).toContain(evento.id);
    await ctx.db.insert(ctx.schema.budgetComparison).values({ eventId: evento.id, status: "aprovado" } as never);
    const depois = await agent.get("/api/budget-comparison/a-fechar");
    expect(depois.body.eventos.map((e: { eventId: string }) => e.eventId)).not.toContain(evento.id);
    const produtor = await agenteLogado("production");
    expect((await produtor.agent.get("/api/budget-comparison/a-fechar")).status).toBe(403);
  });
});

describe("Reabrir com o comparativo aprovado (segunda revisão de 03/11)", () => {
  it("não reabre: o crédito do Flash já saiu; a edição do DP tira o selo", async () => {
    const c = await cenario();
    const { agent } = await agenteLogado("financial");
    const r = await mutacao(agent.post("/api/budget-actual/send-for-review")).send({ eventId: c.evento.id });
    expect(r.body.conferidasAutomaticamente).toBe(1);
    const ajuste = await mutacao(agent.patch(`/api/budget-actual/${c.actual.id}`)).send({ totalValue: (await relida(c.actual.id)).totalValue + 100 });
    expect(ajuste.status, ajuste.text).toBe(200);
    expect((await relida(c.actual.id)).rhAdjusted).toBe(true);
    await ctx.db.update(ctx.schema.budgetActual).set({ rhAdjusted: false, rhAdjustedFields: null } as never).where(eq(ctx.schema.budgetActual.id, c.actual.id));
    await ctx.db.insert(ctx.schema.budgetComparison).values({ eventId: c.evento.id, status: "aprovado" } as never);
    const reabrir = await mutacao(agent.post(`/api/budget-actual/${c.actual.id}/reabrir-conferencia`)).send({});
    expect(reabrir.status).toBe(409);
    expect(reabrir.body.message).toContain("comparativo");
  });
});
