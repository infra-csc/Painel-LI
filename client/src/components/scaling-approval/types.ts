import type { ScalingChangeRequest } from "@shared/schema";
import type { ChangeRequestType, InclusionDiffEntry, ProposedChanges } from "@shared/scaling-validation-rules";

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
