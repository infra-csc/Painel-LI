/**
 * Tipos dos dados da Escalação (25/09 — extraídos de use-scaling-data.ts),
 * num módulo sem hooks para as consultas, as permissões e o filtro importarem
 * sem ciclo.
 */
import type { User } from "@shared/schema";

/** Filtros de seleção múltipla (28/08): lista vazia = "todos". */
export interface ScalingFilters {
  eventId: string[];
  functionId: string[];
  collaboratorId: string[];
  escalationStatus: string[];
  ticketStatus: string[];
  accommodationStatus: string[];
  searchId: string;
  showDeleted: boolean;
}

export const DEFAULT_SCALING_FILTERS: ScalingFilters = {
  eventId: [],
  functionId: [],
  collaboratorId: [],
  escalationStatus: [],
  ticketStatus: [],
  accommodationStatus: [],
  searchId: "",
  showDeleted: false,
};

/** User do auth (o schema já expõe canApproveCenotecnica — sem `as any`). */
export type ScalingUser = User | null | undefined;

/** Pedido de ajuste/exclusão em aberto de uma vaga (GET pending-by-inclusion). */
export interface PendingChangeRequest {
  teamInclusionId: string;
  requestType: string;
  reason: string | null;
  requestedByName: string | null;
  createdAt: string | null;
}
