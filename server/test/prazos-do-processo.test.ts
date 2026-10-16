/**
 * Passo único dos prazos do processo do dono (16/10): grava os 7 dias novos
 * por cima do que o admin tinha salvo, marca a versão, registra no log e NÃO
 * repete — nem por cima de uma edição posterior do admin.
 * Rodar: `npm run test:rotas`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { agenteLogado, criarApp, mutacao, type Contexto } from "./harness";
import { CHAVE_DA_VERSAO_DOS_PRAZOS, VERSAO_DOS_PRAZOS } from "@shared/prazos-da-escala";

let ctx: Contexto;
beforeAll(async () => {
  ctx = await criarApp();
});

const NOVOS = { registro: 58, validacao: 51, aprovacao: 51, escalacao: 47, escalado: 44, passagem: 37, hotel: 30 };

async function logsDosPrazos() {
  const { systemLogs } = ctx.schema;
  return ctx.db.select().from(systemLogs).where(eq(systemLogs.entityId, "prazos-escala"));
}

describe("aplicarPrazosDoProcesso — passo único na subida", () => {
  it("troca os prazos antigos salvos pelo admin, marca a versão e audita; na segunda vez não faz nada", async () => {
    const { aplicarPrazosDoProcesso } = await import("../prazos-do-processo");
    const { agent } = await agenteLogado("admin");

    // Produção antes do deploy: o admin tinha salvo os dias da planilha de 18/09.
    const salvou = await mutacao(agent.put("/api/escala/prazos")).send({ registro: 32, validacao: 25, aprovacao: 24, escalacao: 17, escalado: 17, passagem: 10 });
    expect(salvou.status).toBe(200);
    expect(salvou.body.dias.registro).toBe(32);
    const logsAntes = (await logsDosPrazos()).length;

    expect(await aplicarPrazosDoProcesso()).toBe("aplicado");
    const lidos = await agent.get("/api/escala/prazos");
    expect(lidos.body.dias).toEqual(NOVOS);
    const versao = (await ctx.storage.getSystemSettings()).find((l) => l.key === CHAVE_DA_VERSAO_DOS_PRAZOS);
    expect(versao?.value).toBe(VERSAO_DOS_PRAZOS);

    const logs = await logsDosPrazos();
    expect(logs.length).toBe(logsAntes + 1);
    const ultimo = logs.find((l) => l.userName?.startsWith("Sistema"));
    expect(ultimo?.action).toBe("update");
    expect(ultimo?.previousData).toMatchObject({ prazo_dias_registro: 32, prazo_dias_passagem: 10, prazo_dias_hotel: null, prazos_escala_versao: null });
    expect(ultimo?.newData).toMatchObject({ prazo_dias_registro: 58, prazo_dias_passagem: 37, prazo_dias_hotel: 30, prazos_escala_versao: VERSAO_DOS_PRAZOS });

    // Segunda subida: nada muda, nada é registrado.
    expect(await aplicarPrazosDoProcesso()).toBe("ja_aplicado");
    expect((await logsDosPrazos()).length).toBe(logsAntes + 1);
  });

  it("depois de aplicado, a edição do admin vale e não é desfeita no próximo boot", async () => {
    const { aplicarPrazosDoProcesso } = await import("../prazos-do-processo");
    const { agent } = await agenteLogado("admin");
    await aplicarPrazosDoProcesso();

    expect((await mutacao(agent.put("/api/escala/prazos")).send({ hotel: 25, passagem: 40 })).status).toBe(200);
    expect(await aplicarPrazosDoProcesso()).toBe("ja_aplicado");
    const lidos = await agent.get("/api/escala/prazos");
    expect(lidos.body.dias).toEqual({ ...NOVOS, hotel: 25, passagem: 40 });
  });

  it("duas instâncias subindo juntas: só uma aplica", async () => {
    const { aplicarPrazosDoProcesso } = await import("../prazos-do-processo");
    const { systemSettings } = ctx.schema;
    // Volta a marca para uma versão antiga, como se fosse a primeira subida.
    await ctx.db.update(systemSettings).set({ value: "2026-01-01" }).where(eq(systemSettings.key, CHAVE_DA_VERSAO_DOS_PRAZOS));
    const resultados = await Promise.all([aplicarPrazosDoProcesso(), aplicarPrazosDoProcesso()]);
    expect(resultados.sort()).toEqual(["aplicado", "ja_aplicado"]);
  });
});
