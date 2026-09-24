/**
 * Testes de rota — módulo financeiro (24/09): Planejado (aplicar padrões),
 * Realizado (duplicar do planejado, dividir vaga, decisão do RH em lote) e
 * Comparativo (decisões e o crédito automático do Flash).
 *
 * Cada cenário cria os próprios dados (evento, função, colaborador, vaga,
 * planejado/realizado) direto no banco pelo harness; a chamada em teste passa
 * pelo HTTP como o client faz. Rodar: `npm run test:rotas`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { calcularPlanejadoDaVaga, linhaDoPlanejado } from "@shared/budget-engine";
import {
  agenteLogado,
  criarApp,
  criarColaborador,
  criarEvento,
  criarFuncao,
  criarUsuario,
  criarVaga,
  mutacao,
  unico,
  type Contexto,
} from "./harness";

let ctx: Contexto;

beforeAll(async () => {
  ctx = await criarApp();
});

/** Prestação (budget_actual) direto no banco — a API não deixa nascer "em análise". */
async function criarPrestacao(o: {
  eventId: string; collaboratorId: string | null; functionId: string; createdBy: string;
  sentForReview?: boolean; rhStatus?: string;
  dailyQuantity?: number; dailyValue?: number; mobility?: number; weekdayLunch?: number;
}) {
  const [row] = await ctx.db.insert(ctx.schema.budgetActual).values({
    eventId: o.eventId,
    collaboratorId: o.collaboratorId,
    functionId: o.functionId,
    collaboratorType: "freela",
    dailyQuantity: o.dailyQuantity ?? 3,
    dailyValue: o.dailyValue ?? 10_000,
    mobility: o.mobility ?? 0,
    weekdayLunch: o.weekdayLunch ?? 0,
    totalValue: (o.dailyQuantity ?? 3) * (o.dailyValue ?? 10_000) + (o.mobility ?? 0) + (o.weekdayLunch ?? 0),
    sentForReview: o.sentForReview ?? false,
    rhStatus: o.rhStatus ?? "pendente",
    createdBy: o.createdBy,
  }).returning();
  return row;
}

// ── Planejado ───────────────────────────────────────────────────────────────
describe("POST /api/budget-planned/apply-defaults", () => {
  it("sem eventId → 400", async () => {
    const { agent } = await agenteLogado("admin");
    const res = await mutacao(agent.post("/api/budget-planned/apply-defaults")).send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("eventId");
  });

  it("evento encerrado por RH → 403 (só o administrador reaplica)", async () => {
    const { agent } = await agenteLogado("financial");
    const encerrado = await criarEvento({ startDate: "2020-01-01", endDate: "2020-01-05" });
    const res = await mutacao(agent.post("/api/budget-planned/apply-defaults")).send({ eventId: encerrado.id });
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("Evento encerrado");
  });

  it("por admin → 200 e o totalValue gravado é o de calcularPlanejadoDaVaga (vaga comum e percurseiro)", async () => {
    const { agent, user } = await agenteLogado("admin");
    // Fora de SP para a mobilidade não zerar por regra de local
    const evento = await criarEvento({ location: "Curitiba - PR" });
    const funcaoComum = await criarFuncao();
    const funcaoPercurso = await criarFuncao({ name: `Percurseiro ${unico()}` });
    const colabComum = await criarColaborador();
    const colabPercurso = await criarColaborador();
    const vagaComum = await criarVaga({ eventId: evento.id, functionId: funcaoComum.id, collaboratorId: colabComum.id, userId: user.id, needsTicket: true });
    const vagaPercurso = await criarVaga({ eventId: evento.id, functionId: funcaoPercurso.id, collaboratorId: colabPercurso.id, userId: user.id, needsTicket: true });

    // Planejados "zerados": a rota tem que reescrevê-los com a fórmula única
    const planejados = await Promise.all([vagaComum, vagaPercurso].map((v) =>
      ctx.storage.createBudgetPlanned({ eventId: evento.id, collaboratorId: v.collaboratorId, functionId: v.functionId, collaboratorType: "freela", totalValue: 0 } as any),
    ));

    const res = await mutacao(agent.post("/api/budget-planned/apply-defaults")).send({ eventId: evento.id });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ updated: 2 });

    // Expectativa montada com os MESMOS helpers de shared/ que a rota usa
    const cfg: Record<string, number> = {};
    for (const st of await ctx.storage.getSystemSettings()) {
      const v = parseInt(st.value, 10);
      if (Number.isFinite(v)) cfg[st.key] = v;
    }
    const esperado = (vaga: typeof vagaComum, functionName: string) => linhaDoPlanejado(calcularPlanejadoDaVaga({
      vaga, functionName, collaboratorType: "freela", functionValue: null, settings: cfg, eventLocation: evento.location, ticket: null,
    }));
    const espComum = esperado(vagaComum, funcaoComum.name);
    const espPercurso = esperado(vagaPercurso, funcaoPercurso.name);

    const gravados = await ctx.storage.getBudgetPlanned(evento.id);
    const gravadoComum = gravados.find((p) => p.id === planejados[0].id)!;
    const gravadoPercurso = gravados.find((p) => p.id === planejados[1].id)!;

    expect(gravadoComum.totalValue).toBe(espComum.totalValue);
    expect(gravadoComum.dailyQuantity).toBe(espComum.dailyQuantity);
    expect(gravadoComum.mobility).toBe(espComum.mobility);
    expect(gravadoPercurso.totalValue).toBe(espPercurso.totalValue);
    expect(gravadoPercurso.dailyQuantity).toBe(espPercurso.dailyQuantity);
    // Sanidade: as duas regras produzem totais diferentes e maiores que zero
    // (percurseiro é pacote fechado, sem alimentação/mobilidade separadas)
    expect(espComum.totalValue).toBeGreaterThan(0);
    expect(espPercurso.totalValue).toBeGreaterThan(0);
    expect(espComum.totalValue).not.toBe(espPercurso.totalValue);
    expect(gravadoPercurso.mobility).toBe(0);
    expect(gravadoComum.updatedBy).toBe(user.id);
  });
});

// ── Realizado ───────────────────────────────────────────────────────────────
describe("POST /api/budget-actual/duplicate-from-planned/:eventId", () => {
  it("duas vezes → 1ª 201 com as prestações, 2ª 409 e nada duplicado", async () => {
    const { agent } = await agenteLogado("admin");
    const evento = await criarEvento();
    const funcao = await criarFuncao();
    const colab = await criarColaborador();
    await ctx.storage.createBudgetPlanned({ eventId: evento.id, collaboratorId: colab.id, functionId: funcao.id, collaboratorType: "freela", dailyQuantity: 2, dailyValue: 5000, totalValue: 10_000 } as any);

    const primeira = await mutacao(agent.post(`/api/budget-actual/duplicate-from-planned/${evento.id}`)).send({});
    expect(primeira.status).toBe(201);
    expect(primeira.body).toHaveLength(1);
    expect(primeira.body[0].totalValue).toBe(10_000);
    expect(primeira.body[0].sentForReview).toBe(false);

    const segunda = await mutacao(agent.post(`/api/budget-actual/duplicate-from-planned/${evento.id}`)).send({});
    expect(segunda.status).toBe(409);
    expect(segunda.body.message).toContain("já tem prestações");

    expect(await ctx.storage.getBudgetActual(evento.id)).toHaveLength(1);
  });
});

describe("POST /api/budget-actual/:id/split", () => {
  it("ignora totalValue do corpo: o filho grava a soma calculada dos unitários", async () => {
    const { agent, user } = await agenteLogado("admin");
    const evento = await criarEvento();
    const funcao = await criarFuncao();
    const colab = await criarColaborador();
    const outro = await criarColaborador();
    const pai = await criarPrestacao({ eventId: evento.id, collaboratorId: colab.id, functionId: funcao.id, createdBy: user.id, dailyQuantity: 3, dailyValue: 10_000, mobility: 500 });

    const res = await mutacao(agent.post(`/api/budget-actual/${pai.id}/split`)).send({
      collaboratorId: outro.id,
      workedDays: ["2099-10-10"],
      parentWorkedDays: ["2099-10-11", "2099-10-12"],
      dailyQuantity: 1,
      dailyValue: 10_000,
      mobility: 700,
      weekdayLunch: 300,
      totalValue: 999_999, // o corpo tenta mandar o total — tem que ser ignorado
    });
    expect(res.status).toBe(201);
    expect(res.body.splitParentId).toBe(pai.id);
    expect(res.body.collaboratorId).toBe(outro.id);
    expect(res.body.totalValue).toBe(1 * 10_000 + 300 + 700);
    expect(res.body.workedDays).toEqual(["2099-10-10"]);

    const filho = await ctx.storage.getBudgetActualById(res.body.id);
    expect(filho?.totalValue).toBe(11_000);
    const paiDepois = await ctx.storage.getBudgetActualById(pai.id);
    expect(paiDepois?.workedDays).toEqual(["2099-10-11", "2099-10-12"]);
  });

  it("item já enviado para revisão → 400 (imutável)", async () => {
    const { agent, user } = await agenteLogado("admin");
    const evento = await criarEvento();
    const funcao = await criarFuncao();
    const colab = await criarColaborador();
    const outro = await criarColaborador();
    const pai = await criarPrestacao({ eventId: evento.id, collaboratorId: colab.id, functionId: funcao.id, createdBy: user.id, sentForReview: true });
    const res = await mutacao(agent.post(`/api/budget-actual/${pai.id}/split`)).send({ collaboratorId: outro.id, workedDays: ["2099-10-10"] });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("dividir");
  });
});

describe("POST /api/budget-actual/rh-action", () => {
  it("em lote grava UMA linha de auditoria por item aprovado (system_logs)", async () => {
    const { agent, user } = await agenteLogado("financial");
    const evento = await criarEvento();
    const funcao = await criarFuncao();
    const [c1, c2, c3] = await Promise.all([criarColaborador(), criarColaborador(), criarColaborador()]);
    const emAnalise1 = await criarPrestacao({ eventId: evento.id, collaboratorId: c1.id, functionId: funcao.id, createdBy: user.id, sentForReview: true });
    const emAnalise2 = await criarPrestacao({ eventId: evento.id, collaboratorId: c2.id, functionId: funcao.id, createdBy: user.id, sentForReview: true });
    // Nunca enviada: não pode ser decidida — entra em `skipped` e não gera log
    const naoEnviada = await criarPrestacao({ eventId: evento.id, collaboratorId: c3.id, functionId: funcao.id, createdBy: user.id, sentForReview: false });
    const ids = [emAnalise1.id, emAnalise2.id, naoEnviada.id];

    const logsDe = () => ctx.db.select().from(ctx.schema.systemLogs).where(and(
      eq(ctx.schema.systemLogs.entityType, "budget_actual"),
      eq(ctx.schema.systemLogs.action, "approve"),
      inArray(ctx.schema.systemLogs.entityId, ids),
    ));
    expect(await logsDe()).toHaveLength(0);

    const res = await mutacao(agent.post("/api/budget-actual/rh-action")).send({ itemIds: ids, action: "aprovado", comment: "ok" });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);
    expect(res.body.skipped).toEqual([naoEnviada.id]);

    const logs = await logsDe();
    expect(logs).toHaveLength(2);
    expect(logs.map((l) => l.entityId).sort()).toEqual([emAnalise1.id, emAnalise2.id].sort());
    for (const l of logs) {
      expect(l.userId).toBe(user.id);
      expect(l.userName).toBe(user.name);
    }
    expect((await ctx.storage.getBudgetActualById(emAnalise1.id))?.rhStatus).toBe("aprovado");
    expect((await ctx.storage.getBudgetActualById(naoEnviada.id))?.rhStatus).toBe("pendente");
  });

  it("ação desconhecida → 400", async () => {
    const { agent } = await agenteLogado("financial");
    const res = await mutacao(agent.post("/api/budget-actual/rh-action")).send({ itemIds: ["x"], action: "pago" });
    expect(res.status).toBe(400);
  });
});

// ── Comparativo ─────────────────────────────────────────────────────────────
describe("Comparativo: /api/budget-comparison/:id/{approve,reject}", () => {
  async function comparativoPendente() {
    const evento = await criarEvento();
    const comparison = await ctx.storage.createBudgetComparison({ eventId: evento.id, status: "pendente" } as any);
    return { evento, comparison };
  }

  it("reject sem rejectionReason → 400 e o status não muda", async () => {
    const { agent } = await agenteLogado("financial");
    const { comparison } = await comparativoPendente();
    const res = await mutacao(agent.post(`/api/budget-comparison/${comparison.id}/reject`)).send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("motivo");
    expect((await ctx.storage.getBudgetComparison(comparison.eventId))?.status).toBe("pendente");
  });

  it("approve → 200 'aprovado'; aprovar de novo → 409", async () => {
    const { agent, user } = await agenteLogado("financial");
    const { comparison } = await comparativoPendente();
    const res = await mutacao(agent.post(`/api/budget-comparison/${comparison.id}/approve`)).send({ approvalObservation: "ok" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("aprovado");
    expect(res.body.approvedBy).toBe(user.id);
    expect(res.body.flashCredit?.ok).toBe(true);

    const denovo = await mutacao(agent.post(`/api/budget-comparison/${comparison.id}/approve`)).send({});
    expect(denovo.status).toBe(409);
    expect(denovo.body.message).toContain("aprovado");
  });

  /**
   * Comportamento IMPLEMENTADO (server/routes/orcamento-comparativo.ts):
   * recusar aceita as origens pendente/aprovado/devolvido — recusar um
   * comparativo APROVADO responde 200 e ESTORNA (apaga) os créditos
   * automáticos do Flash (server/flash-credit.ts). O briefing de QA esperava
   * 409 sem estorno; a rota e o comentário dela dizem o contrário, então o
   * teste fixa o que o código faz hoje e o relatório aponta a divergência.
   */
  it("reject de comparativo aprovado → 200 'rejeitado' e os créditos automáticos do Flash são apagados", async () => {
    const { agent, user } = await agenteLogado("financial");
    const { evento, comparison } = await comparativoPendente();
    const funcao = await criarFuncao();
    const colab = await criarColaborador();
    // Prestação em análise com alimentação + mobilidade: gera 2 lançamentos
    await criarPrestacao({ eventId: evento.id, collaboratorId: colab.id, functionId: funcao.id, createdBy: user.id, sentForReview: true, weekdayLunch: 1500, mobility: 2900 });

    const lancamentos = () => ctx.db.select().from(ctx.schema.flashMovements).where(and(
      eq(ctx.schema.flashMovements.eventId, evento.id),
      eq(ctx.schema.flashMovements.sourceType, "comparativo"),
    ));

    const aprovacao = await mutacao(agent.post(`/api/budget-comparison/${comparison.id}/approve`)).send({});
    expect(aprovacao.status).toBe(200);
    expect(aprovacao.body.flashCredit).toMatchObject({ ok: true, created: 2, alimentacaoCents: 1500, mobilidadeCents: 2900 });
    expect(await lancamentos()).toHaveLength(2);

    const recusa = await mutacao(agent.post(`/api/budget-comparison/${comparison.id}/reject`)).send({ rejectionReason: "valores errados" });
    expect(recusa.status).toBe(200);
    expect(recusa.body.status).toBe("rejeitado");
    expect(recusa.body.rejectionReason).toBe("valores errados");
    expect(recusa.body.flashReverse).toEqual({ ok: true, removed: 2 });
    expect(await lancamentos()).toHaveLength(0);

    // Rejeitado de novo → 409 (recusar só parte de pendente/aprovado/devolvido)
    const denovo = await mutacao(agent.post(`/api/budget-comparison/${comparison.id}/reject`)).send({ rejectionReason: "x" });
    expect(denovo.status).toBe(409);
  });

  it("decisão por function_area → 403", async () => {
    const { agent } = await agenteLogado("function_area");
    const { comparison } = await comparativoPendente();
    const res = await mutacao(agent.post(`/api/budget-comparison/${comparison.id}/approve`)).send({});
    expect(res.status).toBe(403);
  });
});

// Usado só para o tipo — evita "declared but never read" se o harness mudar.
void criarUsuario;
