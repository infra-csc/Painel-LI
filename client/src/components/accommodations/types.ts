import type { SortField, SortConfig } from "@/components/common/sortable-header";
import type { Ticket, User } from "@shared/schema";
import { DEFAULT_PERIOD, type PeriodConfig } from "@/components/scaling/scaling-period";

/** Colunas ordenáveis da tabela de Hospedagens: as compartilhadas + 'hotelName'. */
export type AccSortField = SortField | "hotelName";
export type AccSortConfig = SortConfig<AccSortField>;

/** Rascunho editável do modal (e do lote). Datas "YYYY-MM-DD", horas "HH:mm". */
export interface AccommodationDraft {
  hotelName: string;
  hotelLocation: string;
  reservationNumber: string;
  accommodationObservations: string;
  attachmentIds: string[];
  checkInDate: string;
  checkInTime: string;
  checkOutDate: string;
  checkOutTime: string;
}

export const EMPTY_DRAFT: AccommodationDraft = {
  hotelName: "",
  hotelLocation: "",
  reservationNumber: "",
  accommodationObservations: "",
  attachmentIds: [],
  checkInDate: "",
  checkInTime: "",
  checkOutDate: "",
  checkOutTime: "",
};

/** Campos do lote — só o que faz sentido aplicar a várias inclusões de uma vez. */
export type BatchDraft = Partial<Pick<AccommodationDraft,
  "hotelName" | "hotelLocation" | "accommodationObservations" | "checkInDate" | "checkInTime" | "checkOutDate" | "checkOutTime">>;

/** Corpo do POST/PATCH em /api/accommodations. */
export interface AccommodationPayload {
  teamInclusionId: string;
  hotelName: string | null;
  hotelLocation: string | null;
  reservationNumber?: string | null;
  accommodationObservations: string | null;
  attachmentIds?: string[];
  checkInDate: string | null;
  checkInTime: string | null;
  checkOutDate: string | null;
  checkOutTime: string | null;
  updatedBy?: string;
}

export type AccommodationStatusFilter = "all" | "pending" | "processed";
export type InclusionStatusFilter = "active" | "all" | "cancelado";

export interface AccommodationFilters {
  eventId: string;
  functionId: string[];
  collaboratorId: string;
  searchId: string;
  accommodationStatus: AccommodationStatusFilter;
  inclusionStatus: InclusionStatusFilter;
  /** Período da vaga — o mesmo filtro da Escalação (04/09), com "Já terminou". */
  periodo: PeriodConfig;
}

export const DEFAULT_FILTERS: AccommodationFilters = {
  eventId: "all",
  functionId: [],
  collaboratorId: "all",
  searchId: "",
  accommodationStatus: "all",
  inclusionStatus: "active",
  periodo: DEFAULT_PERIOD,
};

/**
 * Solicitação de troca normalizada em camelCase. A API devolve as linhas em
 * snake_case (SQL cru com joins), então normalizamos UMA vez ao receber.
 */
export interface NormalizedSwap {
  id: string;
  teamInclusionId: string;
  status: "pendente" | "aprovado" | "rejeitado" | string;
  currentCollaboratorId: string | null;
  newCollaboratorId: string | null;
  currentCollaboratorName: string | null;
  newCollaboratorName: string | null;
  requestedByName: string | null;
  reason: string | null;
  reviewComment: string | null;
  createdAt: string | null;
}

/** Só o que a tela usa de passagem e de usuário. */
export type TicketLite = Pick<Ticket, "id" | "teamInclusionId" | "purchaseDate" | "actualDepartureDate">;
export type UserLite = Pick<User, "id" | "name">;

/** Erro de API como o apiRequest lança (status + body.message). */
export interface ApiError {
  status?: number;
  body?: { message?: string };
  message?: string;
}
