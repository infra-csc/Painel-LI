/**
 * Testes de rota — salvamento em lote da tela Valores padrão (08/10):
 * PUT /api/system-settings/lote grava tarifas + diárias por função numa
 * transação só (antes: um PUT e N PATCH/POST em paralelo no navegador, com
 * salvamento parcial quando um deles falhava). Rodar: `npm run test:rotas`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { agenteLogado, criarApp, criarFuncao, mutacao, type Contexto } from "./harness";

let ctx: Contexto;

beforeAll(async () => {
  ctx = await criarApp();
});

async function valorDoSetting(key: string): Promise<string | undefined> {
  const linhas = await ctx.storage.getSystemSettings();
  return linhas.find(l => l.key === key)?.value;
}

async function linhaDaFuncao(functionId: string) {
  const [row] = await ctx.db.select().from(ctx.schema.functionValues).where(eq(ctx.schema.functionValues.functionId, functionId));
  return row;
}

describe("PUT /api/system-settings/lote", () => {
  it("sem papel financeiro → 403 e nada gravado", async () => {
    const { agent } = await agenteLogado("production");
    const res = await mutacao(agent.put("/api/system-settings/lote")).send({ settings: { alimentacao_almoco: 99 } });
    expect(res.status).toBe(403);
    expect(await valorDoSetting("alimentacao_almoco")).toBeUndefined();
  });

  it("grava tarifas e diárias por função juntas; na função existente só as colunas enviadas", async () => {
    const { agent } = await agenteLogado("admin");
    const existente = await criarFuncao();
    const nova = await criarFuncao();
    // Freela 0 = "usa o valor casa" — não pode virar valor explícito ao mudar o casa.
    await ctx.storage.createFunctionValue({
      functionId: existente.id, dailyValue: 10_000, dailyValueWeekend: 12_000,
      dailyValueFreela: 0, dailyValueFreelaWeekend: 0,
      costAssistance: 0, mobility: 0, transport: 0, weekdayLunch: 0, weekdayDinner: 0, weekendLunch: 0, weekendDinner: 0,
    });

    const res = await mutacao(agent.put("/api/system-settings/lote")).send({
      settings: { casa_diaria_produtor: "480.5", deflacao_fator_5_8: 85 },
      funcoes: [
        { functionId: existente.id, dailyValue: 15_000 },
        { functionId: nova.id, dailyValue: 20_000, dailyValueFreelaWeekend: 30_000 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ settings: 2, funcoes: 2 });

    expect(await valorDoSetting("casa_diaria_produtor")).toBe("48050");
    expect(await valorDoSetting("deflacao_fator_5_8")).toBe("85");

    const a = await linhaDaFuncao(existente.id);
    expect(a).toMatchObject({ dailyValue: 15_000, dailyValueWeekend: 12_000, dailyValueFreela: 0, dailyValueFreelaWeekend: 0 });
    const b = await linhaDaFuncao(nova.id);
    expect(b).toMatchObject({ dailyValue: 20_000, dailyValueWeekend: 0, dailyValueFreela: 0, dailyValueFreelaWeekend: 30_000 });
  });

  it("função inexistente → 400 e NENHUMA tarifa gravada", async () => {
    const { agent } = await agenteLogado("admin");
    const res = await mutacao(agent.put("/api/system-settings/lote")).send({
      settings: { freela_diaria_viagem: 999 },
      funcoes: [{ functionId: "nao-existe", dailyValue: 1 }],
    });
    expect(res.status).toBe(400);
    expect(await valorDoSetting("freela_diaria_viagem")).toBeUndefined();
  });

  it("valor inválido (tarifa ou centavos) → 400 sem gravar nada", async () => {
    const { agent } = await agenteLogado("admin");
    const f = await criarFuncao();
    const r1 = await mutacao(agent.put("/api/system-settings/lote")).send({ settings: { percurseiro_fee_pct: 150 }, funcoes: [{ functionId: f.id, dailyValue: 100 }] });
    expect(r1.status).toBe(400);
    const r2 = await mutacao(agent.put("/api/system-settings/lote")).send({ settings: { alimentacao_jantar: 50 }, funcoes: [{ functionId: f.id, dailyValue: 10.5 }] });
    expect(r2.status).toBe(400);
    expect(await valorDoSetting("percurseiro_fee_pct")).toBeUndefined();
    expect(await valorDoSetting("alimentacao_jantar")).toBeUndefined();
    expect(await linhaDaFuncao(f.id)).toBeUndefined();
  });

  it("falha no meio da transação desfaz as tarifas já gravadas (atômico)", async () => {
    // Pula a checagem da rota de propósito: a FK de function_id estoura DENTRO
    // da transação, depois do upsert da tarifa.
    await expect(ctx.storage.salvarValoresPadraoEmLote(
      [["alimentacao_jantar_ceno", 7_700]],
      [{ functionId: "funcao-que-nao-existe", dailyValue: 1 }],
      (await agenteLogado("admin")).user.id,
    )).rejects.toBeTruthy();
    expect(await valorDoSetting("alimentacao_jantar_ceno")).toBeUndefined();
  });
});
