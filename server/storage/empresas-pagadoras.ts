/** Empresas pagadoras (tabela payment_companies). */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { paymentCompanies, type PaymentCompany, type InsertPaymentCompany } from "@shared/schema";

export async function getPaymentCompanies(): Promise<PaymentCompany[]> {
  return db.select().from(paymentCompanies).orderBy(paymentCompanies.name);
}

export async function createPaymentCompany(company: InsertPaymentCompany): Promise<PaymentCompany> {
  const [created] = await db.insert(paymentCompanies).values(company).returning();
  return created;
}

export async function deletePaymentCompany(id: number): Promise<void> {
  await db.delete(paymentCompanies).where(eq(paymentCompanies.id, id));
}
