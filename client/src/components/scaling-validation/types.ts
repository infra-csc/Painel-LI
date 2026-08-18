import type { TeamInclusion, ScalingChangeRequest, Function as FunctionType } from "@shared/schema";

/** Linha devolvida por GET /api/scaling-suggestions?eventId= */
export type SuggestionRow = TeamInclusion & {
  canEdit: boolean;
  daysPending: number;
  pendingRequest: ScalingChangeRequest | null;
};

/** GET /api/functions devolve cada função com os responsáveis embutidos. */
export type FunctionWithManagers = FunctionType & {
  managers?: { userId: string; userName: string; role: "validador" | "aprovador" }[];
};

/** Formato de erro lançado por apiRequest/getQueryFn. */
export interface ApiError extends Error {
  status?: number;
  body?: { message?: string } | null;
}

/** Retorno de POST /api/scaling-suggestions/validate */
export interface ValidateResult {
  ok: string[];
  skipped: { id: string; reason: string }[];
}

export const SUGGESTIONS_QUERY_KEY = "/api/scaling-suggestions";
export const CHANGE_REQUESTS_QUERY_KEY = "/api/scaling-change-requests";
