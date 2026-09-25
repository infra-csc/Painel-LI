/**
 * Testes de rota — tipos do banco (25/09): jsonb lido/gravado como objeto no
 * servidor e devolvido como string ao client, horas "HH:MM" validadas,
 * usuário de sistema para a FK de team_inclusion_logs, timestamptz e
 * numeric(8,2). Rodar: `npm run test:rotas`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  agenteLogado,
  criarApp,
  criarColaborador,
  criarEvento,
  criarFuncao,
  criarVaga,
  mutacao,
  type Contexto,
} from "./harness";

let ctx: Contexto;

beforeAll(async () => {
  ctx = await criarApp();
});

describe("jsonb no servidor, string na borda", () => {
  it("system_logs.new_data é gravado como objeto e /api/system-logs devolve string JSON (como o client lê)", async () => {
    const { agent, user } = await agenteLogado("admin");
    const evento = await criarEvento();
    const res = await mutacao(agent.put(`/api/events/${evento.id}`)).send({ observations: "obs jsonb" });
    expect(res.status).toBe(200);

    const [log] = await ctx.db.select().from(ctx.schema.systemLogs)
      .where(eq(ctx.schema.systemLogs.entityId, evento.id));
    expect(log).toBeDefined();
    expect(log.userId).toBe(user.id);
    // No banco/servidor: objeto
    expect(typeof log.newData).toBe("object");
    expect((log.newData as Record<string, unknown>).observations).toBe("obs jsonb");

    // Na API: a string de sempre
    const lista = await agent.get(`/api/system-logs?entityType=event&search=${encodeURIComponent(evento.name)}`);
    expect(lista.status).toBe(200);
    const doEvento = (lista.body.logs as { entityId: string; newData: unknown }[]).find((l) => l.entityId === evento.id);
    expect(doEvento).toBeDefined();
    expect(typeof doEvento!.newData).toBe("string");
    expect(JSON.parse(doEvento!.newData as string).observations).toBe("obs jsonb");
  });

  it("invoices.history nasce como array e cresce por append atômico; a API devolve string", async () => {
    const { agent, user } = await agenteLogado("financial");
    const evento = await criarEvento();
    const funcao = await criarFuncao();
    const colab = await criarColaborador();
    const [prestacao] = await ctx.db.insert(ctx.schema.budgetActual).values({
      eventId: evento.id, collaboratorId: colab.id, functionId: funcao.id, collaboratorType: "freela",
      dailyQuantity: 1, dailyValue: 5000, totalValue: 5000, sentForReview: true, rhStatus: "pendente", createdBy: user.id,
    }).returning();
    const criada = await mutacao(agent.post("/api/invoices")).send({
      eventId: evento.id, collaboratorId: colab.id, functionId: funcao.id, budgetActualId: prestacao.id,
      oc: `OC-${prestacao.id.slice(0, 6)}`, attachmentUrl: "/api/attachments/ATT-1700000000000-ABC123XYZ/view",
      attachmentName: "nota.pdf", status: "enviada",
      // O corpo não manda histórico (omitido do schema): é ignorado
      history: "[{\"type\":\"forjado\"}]",
    });
    expect(criada.status).toBe(200);
    expect(typeof criada.body.history).toBe("string");
    expect(JSON.parse(criada.body.history).map((h: { type: string }) => h.type)).toEqual(["enviado"]);

    const aprovada = await mutacao(agent.post(`/api/invoices/${criada.body.id}/approve`)).send({});
    expect(aprovada.status).toBe(200);
    const noBanco = await ctx.storage.getInvoice(criada.body.id);
    expect(Array.isArray(noBanco?.history)).toBe(true);
    expect(noBanco!.history.map((h) => h.type)).toEqual(["enviado", "aprovado"]);
    expect(noBanco!.history[1].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("budget_comparison: variance_percent numérico e changes_log como lista tipada", async () => {
    const { agent, user } = await agenteLogado("financial");
    const evento = await criarEvento();
    const funcao = await criarFuncao();
    const colab = await criarColaborador();
    const [planejado] = await ctx.db.insert(ctx.schema.budgetPlanned).values({
      eventId: evento.id, collaboratorId: colab.id, functionId: funcao.id, collaboratorType: "freela",
      dailyQuantity: 2, dailyValue: 10_000, totalValue: 20_000, createdBy: user.id,
    }).returning();
    await ctx.db.insert(ctx.schema.budgetActual).values({
      plannedId: planejado.id, eventId: evento.id, collaboratorId: colab.id, functionId: funcao.id, collaboratorType: "freela",
      dailyQuantity: 3, dailyValue: 10_000, totalValue: 30_000, sentForReview: true, rhStatus: "pendente", createdBy: user.id,
      changeReason: "um dia a mais",
    });
    const res = await mutacao(agent.post(`/api/budget-comparison/calculate/${evento.id}`)).send({});
    expect(res.status).toBe(200);
    expect(res.body.variancePercent).toBe(50);
    expect(typeof res.body.changesLog).toBe("string");
    const log = JSON.parse(res.body.changesLog) as { collaboratorId: string; changes: string[]; reason: string }[];
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ collaboratorId: colab.id, reason: "um dia a mais" });
    expect(log[0].changes.join(" ")).toContain("Diárias: 2 → 3");

    const noBanco = await ctx.storage.getBudgetComparison(evento.id);
    expect(noBanco?.variancePercent).toBe(50);
    expect(Array.isArray(noBanco?.changesLog)).toBe(true);
  });

  it("scaling_change_requests.proposed_changes aceita string JSON do client e grava objeto", async () => {
    const { agent, user } = await agenteLogado("admin");
    const funcao = await criarFuncao();
    const vaga = await criarVaga({ functionId: funcao.id, userId: user.id, status: "sugestao_pendente", phase: "sugestao" });
    const res = await mutacao(agent.post("/api/scaling-change-requests")).send({
      teamInclusionId: vaga.id, eventId: vaga.eventId, functionId: funcao.id, requestType: "ajuste",
      reason: "chegar antes", proposedChanges: JSON.stringify({ v: 1, dailyRates: 4 }),
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const [pedido] = await ctx.db.select().from(ctx.schema.scalingChangeRequests)
      .where(eq(ctx.schema.scalingChangeRequests.teamInclusionId, vaga.id));
    expect(pedido.proposedChanges).toEqual({ v: 1, dailyRates: 4 });
    // Na API continua string (o client sempre mandou/recebeu assim)
    expect(typeof res.body.proposedChanges).toBe("string");
  });
});

describe("horas HH:MM", () => {
  it("POST /api/tickets recusa hora inválida e aceita '' como nulo", async () => {
    const { agent, user } = await agenteLogado("purchasing");
    const vaga = await criarVaga({ userId: user.id });
    const invalida = await mutacao(agent.post("/api/tickets")).send({ teamInclusionId: vaga.id, actualDepartureTime: "25:00" });
    expect(invalida.status).toBe(400);
    const textoLivre = await mutacao(agent.post("/api/tickets")).send({ teamInclusionId: vaga.id, actualArrivalTime: "de manhã" });
    expect(textoLivre.status).toBe(400);
    const ok = await mutacao(agent.post("/api/tickets")).send({ teamInclusionId: vaga.id, actualDepartureTime: "07:30", returnArrivalTime: "" });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.actualDepartureTime).toBe("07:30");
    expect(ok.body.returnArrivalTime).toBeNull();
  });

  it("PATCH /api/accommodations/:id recusa check-in fora de 00:00–23:59", async () => {
    const { agent, user } = await agenteLogado("purchasing");
    const vaga = await criarVaga({ userId: user.id });
    const criada = await mutacao(agent.post("/api/accommodations")).send({ teamInclusionId: vaga.id, checkInTime: "14:00" });
    expect(criada.status, JSON.stringify(criada.body)).toBe(200);
    const ruim = await mutacao(agent.patch(`/api/accommodations/${criada.body.id}`)).send({ teamInclusionId: vaga.id, checkOutTime: "12:60" });
    expect(ruim.status).toBe(400);
    const bom = await mutacao(agent.patch(`/api/accommodations/${criada.body.id}`)).send({ teamInclusionId: vaga.id, checkOutTime: "12:00" });
    expect(bom.status).toBe(200);
    expect(bom.body.checkOutTime).toBe("12:00");
  });

  it("PATCH /api/uber-groups/:id valida manualTime", async () => {
    const { agent } = await agenteLogado("production");
    const evento = await criarEvento();
    const [grupo] = await ctx.db.insert(ctx.schema.uberGroups).values({ eventId: evento.id, direction: "ida", time: "08:00", suggestedTime: "08:00" }).returning();
    const ruim = await mutacao(agent.patch(`/api/uber-groups/${grupo.id}`)).send({ manualTime: "8h" });
    expect(ruim.status).toBe(400);
    const bom = await mutacao(agent.patch(`/api/uber-groups/${grupo.id}`)).send({ manualTime: "07:15" });
    expect(bom.status, JSON.stringify(bom.body)).toBe(200);
    expect(bom.body.time).toBe("07:15");
    const limpo = await mutacao(agent.patch(`/api/uber-groups/${grupo.id}`)).send({ manualTime: null });
    expect(limpo.body.time).toBe("08:00");
  });
  // A normalização da célula do espelho ("14h" → "14:00") é função pura:
  // testada em server/operational-mirror.test.ts.
});

describe("integridade", () => {
  it("usuário 'system' existe e a alteração de vaga sem ator grava o log com FK válida", async () => {
    const sistema = await ctx.storage.getUser(ctx.schema.USUARIO_SISTEMA.id);
    expect(sistema).toMatchObject({ id: "system", email: "sistema@painel-li.local", isActive: false });

    const { user } = await agenteLogado("production");
    const vaga = await criarVaga({ userId: user.id });
    // Sem updatedBy → o log sai em nome do usuário de sistema
    await ctx.storage.updateTeamInclusion(vaga.id, { observations: "mudou sem ator" });
    const logs = await ctx.db.select().from(ctx.schema.teamInclusionLogs)
      .where(eq(ctx.schema.teamInclusionLogs.teamInclusionId, vaga.id));
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((l) => l.userId === "system")).toBe(true);
  });

  it("created_at/updated_at nascem preenchidos (NOT NULL) e como instantes (timestamptz)", async () => {
    const evento = await criarEvento();
    expect(evento.createdAt).toBeInstanceOf(Date);
    const { user } = await agenteLogado("production");
    const vaga = await criarVaga({ userId: user.id });
    expect(vaga.createdAt).toBeInstanceOf(Date);
    expect(vaga.updatedAt).toBeInstanceOf(Date);
    expect(Math.abs(vaga.createdAt.getTime() - Date.now())).toBeLessThan(60_000);
    // Booleanos sem terceiro estado
    expect(vaga.needsAccommodation).toBe(false);
    expect(vaga.emergencyRecord).toBe(false);
  });
});
