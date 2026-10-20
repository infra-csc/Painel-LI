/**
 * Passo único da tabela de empreita da cenotécnica (20/10): grava os valores
 * fechados do dono por cima dos do slide (com centavos), marca a versão,
 * registra no log e NÃO repete — nem por cima de uma edição posterior.
 * Rodar: `npm run test:rotas`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { criarApp, type Contexto } from "./harness";
import { CHAVE_DA_VERSAO_DA_TABELA_CENO, VERSAO_DA_TABELA_CENO, cenoEmpreitaSettingKey } from "@shared/cenotecnica-empreita";

let ctx: Contexto;
beforeAll(async () => {
  ctx = await criarApp();
});

async function valor(chave: string) {
  const { systemSettings } = ctx.schema;
  const [l] = await ctx.db.select().from(systemSettings).where(eq(systemSettings.key, chave));
  return l?.value ?? null;
}

describe("aplicarTabelaCenoDoDono — passo único na subida", () => {
  it("troca os valores do slide pelos fechados, marca a versão e audita; na segunda vez não faz nada", async () => {
    const { aplicarTabelaCenoDoDono } = await import("../tabela-ceno-do-dono");
    const { systemSettings, systemLogs } = ctx.schema;
    // Produção antes do deploy: a migração de 19/08 semeou os valores do slide.
    await ctx.db.insert(systemSettings).values([
      { key: cenoEmpreitaSettingKey("viagem", 3), value: "125763" },
      { key: cenoEmpreitaSettingKey("local_b", 2), value: "53750" },
    ]).onConflictDoUpdate({ target: systemSettings.key, set: { value: "125763" } });

    expect(await aplicarTabelaCenoDoDono()).toBe("aplicado");
    expect(await valor(cenoEmpreitaSettingKey("viagem", 3))).toBe("125700");
    expect(await valor(cenoEmpreitaSettingKey("local_b", 2))).toBe("53700");
    expect(await valor(cenoEmpreitaSettingKey("sp", 6))).toBe("210100");
    expect(await valor(cenoEmpreitaSettingKey("local_a", 4))).toBe("130700");
    expect(await valor(CHAVE_DA_VERSAO_DA_TABELA_CENO)).toBe(VERSAO_DA_TABELA_CENO);
    const logs = await ctx.db.select().from(systemLogs).where(eq(systemLogs.entityId, "ceno-empreita"));
    expect(logs).toHaveLength(1);

    // O admin edita depois: o próximo boot não desfaz.
    await ctx.db.update(systemSettings).set({ value: "130000" }).where(eq(systemSettings.key, cenoEmpreitaSettingKey("viagem", 3)));
    expect(await aplicarTabelaCenoDoDono()).toBe("ja_aplicado");
    expect(await valor(cenoEmpreitaSettingKey("viagem", 3))).toBe("130000");
  });
});
