import type { QueryClient } from "@tanstack/react-query";
import type { TeamInclusion, ScalingChangeRequest, Function as FunctionType, TeamInclusionLog } from "@shared/schema";
import {
  SUGESTAO_STATUS, availableSuggestionActions,
  describeLastDecision as describeLastDecisionShared,
  describeVagaDecision as describeVagaDecisionShared,
  type LastDecisionInfo, type LastDecisionTone, type LastVagaDecisionInfo,
} from "@shared/scaling-validation-rules";
import { toIsoDate } from "@/lib/dates";

/** Linha devolvida por GET /api/scaling-suggestions?eventId= */
export type SuggestionRow = Omit<TeamInclusion, "workDays"> & {
  /** Dias de trabalho como "YYYY-MM-DD" (o servidor pode mandar ISO completo — use `workDaysOf`). */
  workDays: string[] | null;
  canEdit: boolean;
  /** Admin/aprovador da função — pode decidir pedidos desta vaga (Aprovação de Escala). */
  canDecide: boolean;
  daysPending: number;
  pendingRequest: ScalingChangeRequest | null;
  /** Última decisão do aprovador (pedido mais recente já resolvido) — a vaga "voltou". */
  lastDecision: LastDecisionInfo | null;
  /**
   * Última decisão do aprovador sobre a VAGA em si — aprovar/reprovar/devolver
   * a vaga validada não cria pedido; o servidor lê de `team_inclusion_logs`.
   */
  lastVagaDecision: LastVagaDecisionInfo | null;
};

/** GET /api/functions devolve cada função com os responsáveis embutidos. */
export type FunctionWithManagers = FunctionType & {
  managers?: { userId: string; userName: string; role: "validador" | "aprovador" }[];
};

/** GET /api/team-inclusions/:id/logs */
export type InclusionLog = TeamInclusionLog;

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
export const TEAM_INCLUSIONS_QUERY_KEY = "/api/team-inclusions";

/** Invalida tudo que enxerga vagas/pedidos do módulo (lista, visão por evento, aprovação, inclusões). */
export function invalidateScalingQueries(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: [SUGGESTIONS_QUERY_KEY] });
  qc.invalidateQueries({ queryKey: [`${SUGGESTIONS_QUERY_KEY}/event-view`] });
  qc.invalidateQueries({ queryKey: [CHANGE_REQUESTS_QUERY_KEY] });
  qc.invalidateQueries({ queryKey: [TEAM_INCLUSIONS_QUERY_KEY] });
}

// ── Datas ────────────────────────────────────────────────────────────────────

/** string ISO / Date → "YYYY-MM-DD" (Date pelo horário local; string por recorte, sem fuso). Vazio → "". */
export function ymd(v: string | Date | null | undefined): string {
  if (!v) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : toIsoDate(v);
  return String(v).slice(0, 10);
}

/** Dias de trabalho normalizados ("YYYY-MM-DD"), ordenados. */
export function workDaysOf(row: Pick<SuggestionRow, "workDays">): string[] {
  return (row.workDays ?? []).map(ymd).filter(Boolean).sort();
}

// ── Regras de seleção (puras) ────────────────────────────────────────────────

/** Estado da vaga no formato que a máquina do shared entende. */
type ActionableRow = Pick<SuggestionRow, "canEdit" | "pendingRequest" | "status" | "phase">;
const actionsOf = (r: ActionableRow) => availableSuggestionActions({ status: r.status, phase: r.phase });

/** A vaga aceita a ação `validar` do usuário (só vaga ainda pendente)? */
export function canValidate(r: ActionableRow): boolean {
  return r.canEdit && !r.pendingRequest && actionsOf(r).includes("validar");
}

/**
 * A vaga aceita pedido de ajuste/exclusão? A máquina permite `pedir_ajuste`
 * também em `sugestao_validada` — enquanto o aprovador não decidiu, a área
 * ainda consegue corrigir o que validou.
 */
export function canRequestChange(r: ActionableRow): boolean {
  return r.canEdit && !r.pendingRequest && actionsOf(r).includes("pedir_ajuste");
}

/**
 * A vaga aceita ALGUMA ação do usuário nesta tela (validar / pedir ajuste /
 * pedir exclusão)? É o que torna a linha selecionável — quais botões ficam
 * ativos depende de `canValidate` / `canRequestChange`.
 */
export function canActOn(r: ActionableRow): boolean {
  return canValidate(r) || canRequestChange(r);
}

/** Motivo (pt-BR) de a linha não ser selecionável; null quando é. */
export function lockReason(r: ActionableRow): string | null {
  if (canActOn(r)) return null;
  if (!r.canEdit) return "Você não valida esta função";
  if (r.pendingRequest) return "Há um pedido pendente para esta vaga";
  if (r.status === SUGESTAO_STATUS.VALIDADA) return "Validada — aguardando o aprovador";
  return "Sem ações disponíveis nesta etapa";
}

// ── Última decisão do aprovador ──────────────────────────────────────────────

export type DecisionTone = LastDecisionTone;
export interface DecisionDescription {
  /** Rótulo curto para badge (sem o comentário do aprovador). */
  title: string;
  /** Texto completo do shared (título + ": comentário", quando houver). */
  fullTitle: string;
  tone: DecisionTone;
}

/** Separa o título curto do comentário que o shared anexa depois de ": ". */
function splitDecision(
  fullTitle: string, tone: DecisionTone, comment: string | null,
): DecisionDescription {
  const trimmed = comment?.trim();
  const suffix = trimmed ? `: ${trimmed}` : "";
  const short = suffix && fullTitle.endsWith(suffix) ? fullTitle.slice(0, -suffix.length) : fullTitle;
  return { title: short, fullTitle, tone };
}

/** Envelope do `describeLastDecision` do shared: rótulo curto para badge + texto completo para tooltip/drawer. */
export function describeLastDecision(info: LastDecisionInfo | null | undefined): DecisionDescription | null {
  if (!info) return null;
  const { title, tone } = describeLastDecisionShared(info);
  return splitDecision(title, tone, info.comment);
}

/**
 * Idem para a decisão sobre a VAGA (aprovar/reprovar/devolver), que não passa
 * por `scaling_change_requests` — vem do `lastVagaDecision` do GET.
 */
export function describeVagaDecision(info: LastVagaDecisionInfo | null | undefined): DecisionDescription | null {
  if (!info) return null;
  const { title, tone } = describeVagaDecisionShared(info);
  return splitDecision(title, tone, info.comment);
}

export const DECISION_TONE_CLASS: Record<DecisionTone, string> = {
  warn: "bg-amber-50 text-amber-800 border-amber-300",
  danger: "bg-red-50 text-red-700 border-red-200",
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
  info: "bg-violet-50 text-violet-700 border-violet-200",
};
