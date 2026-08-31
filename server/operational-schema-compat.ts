import { sql } from "drizzle-orm";
import { hotelRoomGroupMembers, uberGroups } from "@shared/schema";

/**
 * Leitura compatível com publicações anteriores às colunas logísticas de 28/31-08.
 * A conversão da linha em JSON permite consultar uma chave inexistente sem o
 * PostgreSQL rejeitar a query inteira.
 */
export const uberGroupSelectCompat = {
  id: uberGroups.id,
  eventId: uberGroups.eventId,
  groupName: uberGroups.groupName,
  direction: uberGroups.direction,
  origin: uberGroups.origin,
  destination: uberGroups.destination,
  date: uberGroups.date,
  time: uberGroups.time,
  suggestedTime: sql<string | null>`to_jsonb(${uberGroups})->>'suggested_time'`,
  manualTime: sql<string | null>`to_jsonb(${uberGroups})->>'manual_time'`,
  estimatedTotalCents: uberGroups.estimatedTotalCents,
  notes: uberGroups.notes,
  titularCollaboratorId: sql<string | null>`to_jsonb(${uberGroups})->>'titular_collaborator_id'`,
  status: uberGroups.status,
  suggested: uberGroups.suggested,
  confirmed: uberGroups.confirmed,
  createdAt: uberGroups.createdAt,
  updatedAt: uberGroups.updatedAt,
};

export const hotelRoomGroupMemberSelectCompat = {
  id: hotelRoomGroupMembers.id,
  hotelRoomGroupId: hotelRoomGroupMembers.hotelRoomGroupId,
  collaboratorId: hotelRoomGroupMembers.collaboratorId,
  checkInDate: sql<string | null>`to_jsonb(${hotelRoomGroupMembers})->>'check_in_date'`,
  checkOutDate: sql<string | null>`to_jsonb(${hotelRoomGroupMembers})->>'check_out_date'`,
  confirmed: hotelRoomGroupMembers.confirmed,
  notes: hotelRoomGroupMembers.notes,
};