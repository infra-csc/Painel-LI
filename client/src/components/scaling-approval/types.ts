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
  /**
   * Pedido em PAR (09/10 — "vai direto de um evento para o outro"): o outro
   * lado, decidido junto (aprovar/negar um decide os dois; não há reajuste).
   */
  par?: {
    requestId: string; status: string; teamInclusionId: string | null; inclusionNumber: number | null;
    eventId: string; eventName: string | null; functionName: string | null; diff: InclusionDiffEntry[];
  } | null;
};

export type RequestType = ChangeRequestType;

/**
 * Linha do GET /api/scaling-suggestions vista pela Aprovação: o servidor
 * anexa `canDecide` (admin ou aprovador da função) por linha — é o que decide
 * se os botões de bypass aparecem em "Vagas paradas".
 */
export type StalledRow = SuggestionRow;

/**
 * Decisões do aprovador sobre a VAGA já validada pela área que exigem
 * comentário (PATCH /api/scaling-suggestions/:id/reprovar | /devolver). A
 * aprovação vai pelo lote (POST /aprovar-lote).
 */
export type VagaDecisionKind = "reprovar" | "devolver";

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
