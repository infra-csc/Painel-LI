/** Hospedagem (tabela accommodations). */
import { eq, and, exists } from "drizzle-orm";
import { db } from "../db";
import { accommodations, teamInclusions, type Accommodation, type InsertAccommodation } from "@shared/schema";

export async function getAccommodations(eventId?: string): Promise<Accommodation[]> {
  if (!eventId) return await db.select().from(accommodations);
  return await db.select().from(accommodations).where(exists(
    db.select({ id: teamInclusions.id }).from(teamInclusions)
      .where(and(eq(teamInclusions.id, accommodations.teamInclusionId), eq(teamInclusions.eventId, eventId))),
  ));
}

export async function getAccommodation(id: string): Promise<Accommodation | undefined> {
  const [accommodation] = await db.select().from(accommodations).where(eq(accommodations.id, id));
  return accommodation;
}

/** Hospedagens de UMA vaga (mesmo motivo de `getTicketsByInclusionId`). */
export async function getAccommodationsByInclusionId(teamInclusionId: string): Promise<Accommodation[]> {
  return await db.select().from(accommodations).where(eq(accommodations.teamInclusionId, teamInclusionId));
}

export async function createAccommodation(accommodationData: InsertAccommodation): Promise<Accommodation> {
  const [accommodation] = await db.insert(accommodations).values(accommodationData).returning();
  return accommodation;
}

export async function updateAccommodation(id: string, accommodationData: Partial<InsertAccommodation>): Promise<Accommodation> {
  const [accommodation] = await db.update(accommodations).set(accommodationData).where(eq(accommodations.id, id)).returning();
  return accommodation;
}
