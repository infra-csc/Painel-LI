/**
 * Validação inline de Salvar / Confirmar (modal e ações em massa).
 * Devolve o motivo pelo qual a ação está bloqueada (ou null). Usado para
 * desabilitar botão + tooltip + marcar campos; os handlers só repetem a
 * checagem como trava de segurança (toast fica para erro de servidor).
 */
import type { TeamInclusion } from "@shared/schema";
import { isEscalated } from "./scaling-utils";
import type { ScalingData } from "./use-scaling-data";

/** Valores editáveis relevantes para a validação. */
export interface ValidationValues {
  collaboratorId: string;
  atendimentoTipo: string;
  percurseiroTipo: string;
}

type Rules = Pick<
  ScalingData,
  "isAtendimentoInclusion" | "isPercursoInclusion" | "getCollaboratorConflicts" | "getCollaboratorName" | "getEventName" |
  "canEditCollaborator" | "canConfirmEscalation"
>;

export const ATENDIMENTO_MISSING_MSG = "Selecione o tipo de atendimento (Key Account ou Executivo de Contas).";
export const PERCURSEIRO_MISSING_MSG = "Defina o tipo do percurseiro (Tipo 1 ou Tipo 2)";

export const isAtendimentoMissing = (inclusion: TeamInclusion, values: ValidationValues, rules: Rules): boolean =>
  !!values.collaboratorId && rules.isAtendimentoInclusion(inclusion) && !values.atendimentoTipo;

/**
 * Percurso: o Tipo 1 × Tipo 2 é definido NO PLANEJADO (decisão do usuário,
 * 17/08) — a Escalação NÃO bloqueia por falta dele. Mantido como função para
 * religar facilmente se a regra mudar; hoje sempre false.
 */
export const isPercurseiroMissing = (_inclusion: TeamInclusion, _values: ValidationValues, _rules: Rules): boolean => false;

/** Valores gravados na escalação (sem edição) no formato da validação. */
export const valuesFromInclusion = (inclusion: TeamInclusion): ValidationValues => ({
  collaboratorId: inclusion.collaboratorId || "",
  atendimentoTipo: (inclusion as any).atendimentoTipo || "",
  percurseiroTipo: (inclusion as any).percurseiroTipo || "",
});

export const getCollaboratorConflictSummary = (inclusion: TeamInclusion, collaboratorId: string, rules: Rules): string | null => {
  if (!collaboratorId) return null;
  const { sameEvent, dateOverlap } = rules.getCollaboratorConflicts(collaboratorId, inclusion);
  if (sameEvent.length === 0 && dateOverlap.length === 0) return null;
  const conflict = sameEvent[0] || dateOverlap[0];
  const startStr = conflict.scheduleStartDate ? new Date(conflict.scheduleStartDate).toLocaleDateString("pt-BR") : "";
  const endStr = conflict.scheduleEndDate ? new Date(conflict.scheduleEndDate).toLocaleDateString("pt-BR") : "";
  const periodStr = startStr && endStr ? ` de ${startStr} a ${endStr}` : "";
  return `${rules.getCollaboratorName(collaboratorId)} já está escalado em "${rules.getEventName(conflict.eventId)}"${periodStr}.`;
};

export const getSaveBlockReason = (inclusion: TeamInclusion | null, values: ValidationValues, rules: Rules): string | null => {
  if (!inclusion) return "Nenhuma escalação selecionada.";
  if (inclusion.status === "cancelado") return "Escalação cancelada — reative para editar.";
  if (isEscalated(inclusion)) {
    if (!rules.canEditCollaborator(inclusion)) return "Alteração bloqueada: passagem comprada, hospedagem reservada ou sem permissão.";
  } else if (!rules.canConfirmEscalation(inclusion)) {
    return "Apenas o responsável pela função pode salvar alterações.";
  }
  if (isAtendimentoMissing(inclusion, values, rules)) return ATENDIMENTO_MISSING_MSG;
  if (isPercurseiroMissing(inclusion, values, rules)) return PERCURSEIRO_MISSING_MSG;
  return null;
};

export const getConfirmBlockReason = (inclusion: TeamInclusion | null, values: ValidationValues, rules: Rules): string | null => {
  if (!inclusion) return "Nenhuma escalação selecionada.";
  if (inclusion.status === "cancelado") return "Escalação cancelada — reative para confirmar.";
  if (!rules.canConfirmEscalation(inclusion)) return "Apenas o responsável pela função pode confirmar escalações.";
  if (!values.collaboratorId) return "Selecione um colaborador antes de confirmar.";
  if (isAtendimentoMissing(inclusion, values, rules)) return ATENDIMENTO_MISSING_MSG;
  if (isPercurseiroMissing(inclusion, values, rules)) return PERCURSEIRO_MISSING_MSG;
  const conflict = getCollaboratorConflictSummary(inclusion, values.collaboratorId, rules);
  if (conflict) return `Conflito de datas: ${conflict}`;
  return null;
};

/**
 * Motivo pelo qual a linha NÃO pode entrar na confirmação em massa (usa os
 * valores já gravados na escalação, sem edição). Null = elegível.
 */
export const getBulkConfirmBlockReason = (inclusion: TeamInclusion, rules: Rules): string | null => {
  if (inclusion.status === "cancelado") return "Escalação cancelada";
  if (isEscalated(inclusion)) return "Já confirmada";
  if (!rules.canConfirmEscalation(inclusion)) return "Sem permissão (apenas o responsável pela função)";
  if (!inclusion.collaboratorId) return "Sem colaborador";
  const values = valuesFromInclusion(inclusion);
  if (isAtendimentoMissing(inclusion, values, rules)) return "Sem tipo de atendimento";
  if (isPercurseiroMissing(inclusion, values, rules)) return PERCURSEIRO_MISSING_MSG;
  if (getCollaboratorConflictSummary(inclusion, inclusion.collaboratorId, rules)) return "Conflito de datas do colaborador";
  return null;
};
