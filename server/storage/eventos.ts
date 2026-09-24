/** Eventos (tabela events). */
import { eq, and, ne, exists, isNull, inArray } from "drizzle-orm";
import { db } from "../db";
import { events, teamInclusions, type Event, type InsertEvent } from "@shared/schema";
import { idsUnicos } from "./_comum";

export async function getEvents(includeDeleted = false): Promise<Event[]> {
  if (includeDeleted) return await db.select().from(events);
  return await db.select().from(events).where(ne(events.status, "excluído"));
}

export async function getEvent(id: string): Promise<Event | undefined> {
  const [event] = await db.select().from(events).where(eq(events.id, id));
  return event;
}

export async function getEventsByIds(ids: string[]): Promise<Event[]> {
  const unique = idsUnicos(ids);
  if (unique.length === 0) return [];
  return await db.select().from(events).where(inArray(events.id, unique));
}

export async function getEventsWithInclusions(): Promise<Event[]> {
  // Buscar eventos que têm inclusões usando EXISTS (sem duplicatas por JOIN).
  // Vagas ainda em Validação de Escala (phase 'sugestao') e vagas EXCLUÍDAS
  // (soft delete, 23/09) não contam — um evento cujas vagas foram todas
  // removidas aparecia como modelo de escalação com grade vazia.
  return await db
    .select()
    .from(events)
    .where(
      and(
        ne(events.status, "excluído"),
        exists(
          db.select({ id: teamInclusions.id })
            .from(teamInclusions)
            .where(and(
              eq(teamInclusions.eventId, events.id),
              ne(teamInclusions.phase, "sugestao"),
              isNull(teamInclusions.deletedAt),
            ))
        )
      )
    );
}

export async function createEvent(eventData: InsertEvent): Promise<Event> {
  const [event] = await db.insert(events).values(eventData).returning();
  return event;
}

export async function updateEvent(id: string, eventData: Partial<InsertEvent>): Promise<Event> {
  const [event] = await db.update(events).set(eventData).where(eq(events.id, id)).returning();
  return event;
}

export async function deleteEvent(id: string): Promise<void> {
  await db.delete(events).where(eq(events.id, id));
}
