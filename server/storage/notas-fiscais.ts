/** Notas fiscais (tabela invoices). */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { invoices, type Invoice } from "@shared/schema";

/** Linha da NF como o Drizzle grava — inclui `history` (jsonb), que o zod do corpo não tem. */
type InsertInvoice = typeof invoices.$inferInsert;

export async function getInvoices(eventId?: string): Promise<Invoice[]> {
  if (eventId) {
    return await db.select().from(invoices).where(eq(invoices.eventId, eventId));
  }
  return await db.select().from(invoices);
}

export async function getInvoice(id: string): Promise<Invoice | undefined> {
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
  return invoice;
}

export async function createInvoice(invoice: InsertInvoice): Promise<Invoice> {
  const [created] = await db.insert(invoices).values(invoice).returning();
  return created;
}

export async function updateInvoice(id: string, invoice: Partial<Invoice>): Promise<Invoice> {
  const [updated] = await db.update(invoices)
    .set({ ...invoice, updatedAt: new Date() })
    .where(eq(invoices.id, id))
    .returning();
  return updated;
}
