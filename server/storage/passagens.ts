/** Passagens (tabela tickets). */
import { eq, and, exists } from "drizzle-orm";
import { db } from "../db";
import { tickets, teamInclusions, type Ticket, type InsertTicket } from "@shared/schema";

export async function getTickets(eventId?: string): Promise<Ticket[]> {
  if (!eventId) return await db.select().from(tickets);
  // Só as passagens de vagas do evento — a tela de Passagens por evento não
  // precisa baixar a tabela inteira (23/09).
  return await db.select().from(tickets).where(exists(
    db.select({ id: teamInclusions.id }).from(teamInclusions)
      .where(and(eq(teamInclusions.id, tickets.teamInclusionId), eq(teamInclusions.eventId, eventId))),
  ));
}

export async function getTicket(id: string): Promise<Ticket | undefined> {
  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id));
  return ticket;
}

/**
 * Passagens de UMA vaga (ida e volta podem ser linhas separadas).
 *
 * Existe para a janela do pedido de ajuste (`shared/scaling-change-window`):
 * a pergunta "já compraram a passagem desta vaga?" não pode custar um
 * `getTickets()` da tabela inteira a cada abertura de modal.
 */
export async function getTicketsByInclusionId(teamInclusionId: string): Promise<Ticket[]> {
  return await db.select().from(tickets).where(eq(tickets.teamInclusionId, teamInclusionId));
}

export async function createTicket(ticketData: InsertTicket): Promise<Ticket> {
  const [ticket] = await db.insert(tickets).values(ticketData).returning();
  return ticket;
}

export async function updateTicket(id: string, ticketData: Partial<InsertTicket>): Promise<Ticket> {
  const [ticket] = await db.update(tickets).set(ticketData).where(eq(tickets.id, id)).returning();
  return ticket;
}
