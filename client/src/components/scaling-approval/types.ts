import type { ScalingChangeRequest } from "@shared/schema";
import type { ChangeRequestType, InclusionDiffEntry, ProposedChanges } from "@shared/scaling-validation-rules";
import type { SuggestionRow } from "@/components/scaling-validation/types";

/** Item devolvido por GET /api/scaling-change-requests (pedido enriquecido pelo servidor). */
export type ChangeRequestItem = ScalingChangeRequest & {
  functionName: string | null;
  eventName: string | null;
  inclusionNumber: number | null;
  inclusionState: { phase: string; status: string } | null;
  proposed: ProposedChanges | null;
  diff: InclusionDiffEntry[];
  canDecide: boolean;
};

export type RequestType = ChangeRequestType;

/**
 * Linha do GET /api/scaling-suggestions vista pela Aprovação: o servidor
 * anexa `canDecide` (admin ou aprovador da função) por linha — é o que decide
 * se os botões de bypass aparecem em "Vagas paradas".
 */
export type StalledRow = SuggestionRow;

/** Body de PATCH /api/scaling-change-requests/:id/reajustar | /negar */
export interface ReviewBody {
  comment: string;
  then: "reenviar_validacao" | "aprovar_direto";
  editedChanges?: ProposedChanges;
}

export const APPROVAL_QUERY_KEYS = {
  requests: "/api/scaling-change-requests",
  suggestions: "/api/scaling-suggestions",
  teamInclusions: "/api/team-inclusions",
  eventView: "/api/scaling-suggestions/event-view",
} as const;
