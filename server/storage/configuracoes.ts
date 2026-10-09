/** Configurações do sistema (tabela system_settings, chave → valor). */
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { functionValues, systemSettings, type FunctionValue, type SystemSetting } from "@shared/schema";

export async function getSystemSettings(): Promise<SystemSetting[]> {
  return await db.select().from(systemSettings);
}

export async function upsertSystemSetting(key: string, value: string, updatedBy?: string): Promise<SystemSetting> {
  // UPSERT atômico pela unique de `key` (23/09): o SELECT-depois-INSERT
  // anterior corria com outro salvamento e um dos dois caía em 23505.
  const [row] = await db.insert(systemSettings)
    .values({ key, value, updatedBy: updatedBy ?? null })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value, updatedAt: new Date(), updatedBy: updatedBy ?? null },
    })
    .returning();
  return row;
}

/** Diária por função no salvamento em lote: só as células que a pessoa mudou (centavos). */
export interface FuncaoNoLote {
  functionId: string;
  dailyValue?: number;
  dailyValueWeekend?: number;
  dailyValueFreela?: number;
  dailyValueFreelaWeekend?: number;
}

/**
 * Salvamento ÚNICO da tela Valores padrão (08/10): tarifas (system_settings) +
 * diárias por função (function_values) numa transação só. Antes eram um PUT e
 * N PATCH/POST em paralelo no navegador — uma falha no meio deixava parte
 * gravada, fora do histórico e sem aviso do que entrou.
 *
 * Função sem linha ganha uma (as colunas não enviadas ficam no default 0 —
 * para o freela, 0 = "usa o valor casa"); função com linha recebe SÓ as
 * colunas enviadas. SELECT + INSERT/UPDATE em vez de ON CONFLICT para não
 * depender do índice único de function_id existir em todo banco.
 */
export async function salvarValoresPadraoEmLote(
  settings: ReadonlyArray<readonly [string, number]>,
  funcoes: readonly FuncaoNoLote[],
  updatedBy: string,
): Promise<{ antes: FunctionValue[]; depois: FunctionValue[] }> {
  return await db.transaction(async (tx) => {
    for (const [key, val] of settings) {
      const value = String(val);
      await tx.insert(systemSettings)
        .values({ key, value, updatedBy })
        .onConflictDoUpdate({ target: systemSettings.key, set: { value, updatedAt: new Date(), updatedBy } });
    }
    const ids = funcoes.map(f => f.functionId);
    const antes = ids.length > 0
      ? await tx.select().from(functionValues).where(inArray(functionValues.functionId, ids))
      : [];
    const depois: FunctionValue[] = [];
    for (const { functionId, ...campos } of funcoes) {
      const existente = antes.find(v => v.functionId === functionId);
      const [row] = existente
        ? await tx.update(functionValues).set({ ...campos, updatedAt: new Date() }).where(eq(functionValues.id, existente.id)).returning()
        : await tx.insert(functionValues).values({ functionId, ...campos }).returning();
      depois.push(row);
    }
    return { antes, depois };
  });
}
