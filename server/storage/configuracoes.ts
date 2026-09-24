/** Configurações do sistema (tabela system_settings, chave → valor). */
import { db } from "../db";
import { systemSettings, type SystemSetting } from "@shared/schema";

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
