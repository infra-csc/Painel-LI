/**
 * Rascunho do Planejado (08/10): os ajustes manuais da tela Planejado
 * (overrides esparsos por vaga) até o envio ao Realizado, por evento +
 * usuário. Antes viviam só no localStorage — trocar de computador perdia tudo.
 * Quem decide QUAL usuário é a rota (sempre o da sessão).
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { rascunhosDoPlanejado, type RascunhoDoPlanejado } from "@shared/schema";

export async function getRascunhoDoPlanejado(eventId: string, userId: string): Promise<RascunhoDoPlanejado | undefined> {
  const [linha] = await db.select().from(rascunhosDoPlanejado)
    .where(and(eq(rascunhosDoPlanejado.eventId, eventId), eq(rascunhosDoPlanejado.userId, userId)));
  return linha;
}

/** Grava (ou substitui) o rascunho inteiro; `updated_at` é a hora do banco. */
export async function salvarRascunhoDoPlanejado(
  eventId: string,
  userId: string,
  overrides: Record<string, Record<string, unknown>>,
): Promise<RascunhoDoPlanejado> {
  const [linha] = await db.insert(rascunhosDoPlanejado)
    .values({ eventId, userId, overrides })
    .onConflictDoUpdate({
      target: [rascunhosDoPlanejado.eventId, rascunhosDoPlanejado.userId],
      set: { overrides, updatedAt: sql`now()` },
    })
    .returning();
  return linha;
}

export async function apagarRascunhoDoPlanejado(eventId: string, userId: string): Promise<void> {
  await db.delete(rascunhosDoPlanejado)
    .where(and(eq(rascunhosDoPlanejado.eventId, eventId), eq(rascunhosDoPlanejado.userId, userId)));
}
