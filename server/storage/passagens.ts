/** Passagens (tabela tickets). */
import { eq, and, exists, isNull, isNotNull, desc, gte } from "drizzle-orm";
import { db } from "../db";
import { tickets, teamInclusions, collaborators, events, type Ticket, type InsertTicket } from "@shared/schema";

/**
 * Passagens ATUAIS (01/10): as que viraram histórico numa troca aprovada
 * (`archived_at`) ficam fora de tudo que pergunta "qual é a passagem desta
 * vaga" — status, fila de Compras, telas. O custo delas é lido à parte
 * (`getTicketHistory`).
 */
const atual = isNull(tickets.archivedAt);

export async function getTickets(eventId?: string, opts: { eventoTerminaDesde?: string } = {}): Promise<Ticket[]> {
  if (!eventId && !opts.eventoTerminaDesde) return await db.select().from(tickets).where(atual);
  // Só as passagens de vagas do evento — a tela de Passagens por evento não
  // precisa baixar a tabela inteira (23/09). `eventoTerminaDesde` (15/10, busca
  // de passagens): só as de eventos que terminam neste dia ou depois.
  const daVaga = eq(teamInclusions.id, tickets.teamInclusionId);
  const doEvento = eventId ? eq(teamInclusions.eventId, eventId) : undefined;
  const sub = opts.eventoTerminaDesde
    ? db.select({ id: teamInclusions.id }).from(teamInclusions)
      .innerJoin(events, eq(events.id, teamInclusions.eventId))
      .where(and(daVaga, doEvento, gte(events.endDate, opts.eventoTerminaDesde)))
    : db.select({ id: teamInclusions.id }).from(teamInclusions).where(and(daVaga, doEvento));
  return await db.select().from(tickets).where(and(atual, exists(sub)));
}

/** Por id: devolve também a de histórico (a rota decide o que pode fazer com ela). */
export async function getTicket(id: string): Promise<Ticket | undefined> {
  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id));
  return ticket;
}

/**
 * Passagens ATUAIS de UMA vaga (ida e volta podem ser linhas separadas).
 *
 * Existe para a janela do pedido de ajuste (`shared/scaling-change-window`):
 * a pergunta "já compraram a passagem desta vaga?" não pode custar um
 * `getTickets()` da tabela inteira a cada abertura de modal.
 */
export async function getTicketsByInclusionId(teamInclusionId: string): Promise<Ticket[]> {
  return await db.select().from(tickets).where(and(eq(tickets.teamInclusionId, teamInclusionId), atual));
}

export type PassagemDeHistorico = Ticket & { archivedCollaboratorName: string | null };

/** Passagens que viraram histórico (troca aprovada), de uma vaga ou de um evento. */
export async function getTicketHistory(filtro: { teamInclusionId?: string; eventId?: string }): Promise<PassagemDeHistorico[]> {
  const condicoes = [isNotNull(tickets.archivedAt)];
  if (filtro.teamInclusionId) condicoes.push(eq(tickets.teamInclusionId, filtro.teamInclusionId));
  if (filtro.eventId) {
    condicoes.push(exists(
      db.select({ id: teamInclusions.id }).from(teamInclusions)
        .where(and(eq(teamInclusions.id, tickets.teamInclusionId), eq(teamInclusions.eventId, filtro.eventId))),
    ));
  }
  const linhas = await db
    .select({ ticket: tickets, nome: collaborators.fullName })
    .from(tickets)
    .leftJoin(collaborators, eq(collaborators.id, tickets.archivedCollaboratorId))
    .where(and(...condicoes))
    .orderBy(desc(tickets.archivedAt));
  return linhas.map((l) => ({ ...l.ticket, archivedCollaboratorName: l.nome ?? null }));
}

export async function createTicket(ticketData: InsertTicket): Promise<Ticket> {
  const [ticket] = await db.insert(tickets).values(ticketData).returning();
  return ticket;
}

export async function updateTicket(id: string, ticketData: Partial<InsertTicket>): Promise<Ticket> {
  const [ticket] = await db.update(tickets).set(ticketData).where(eq(tickets.id, id)).returning();
  return ticket;
}
