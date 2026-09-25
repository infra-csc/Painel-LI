/**
 * Consultas, índices memoizados, filtros/ordenação e permissões da Escalação.
 * Extraído de pages/scaling.tsx — regra de negócio preservada.
 *
 * Desde 25/09 este hook só COMPÕE (tinha 693 linhas): as consultas e índices
 * vivem em `use-scaling-queries`, as permissões em `use-scaling-permissions`,
 * o filtro+ordenação em `scaling-data-filter` (função pura) e o modal em
 * `use-inclusion-details`. Os tipos moram em `scaling-data-types`. O objeto
 * devolvido é o mesmo de antes — nada de quem importa `ScalingData` mudou.
 */
import { tipoDeConflitoDeAgenda } from "./scaling-utils";
import { useMemo } from "react";
import type { SortConfig } from "@/components/common/sortable-header";
import { fixEncoding } from "@/lib/utils";
import { hasRole } from "@/lib/role-utils";
import { isSuggestionInclusion } from "@shared/scaling-validation-rules";
import { isAtendimentoFunction } from "@shared/atendimento";
import { isPercursoFunction } from "@shared/calculation-rules";
import { isCenotecnicaFunctionName } from "@shared/scaling-rules";
import type { TeamInclusion } from "@shared/schema";
import { ACTIVE_CONFLICT_STATUSES, ALREADY_HANDLED_SWAP_STATUSES } from "./scaling-utils";
import type { ScalingFilters, ScalingUser } from "./scaling-data-types";
import { useScalingQueries } from "./use-scaling-queries";
import { useScalingPermissions } from "./use-scaling-permissions";
import { filtrarEOrdenarVagas } from "./scaling-data-filter";

export { DEFAULT_SCALING_FILTERS, type ScalingFilters, type ScalingUser, type PendingChangeRequest } from "./scaling-data-types";
export { useInclusionDetails, type InclusionDetails } from "./use-inclusion-details";

export function useScalingData(opts: {
  filters: ScalingFilters;
  sortConfig: SortConfig | null;
  user: ScalingUser;
}) {
  const { filters, sortConfig, user } = opts;

  const q = useScalingQueries({ filters, user });
  const {
    teamInclusions, events, functions, collaborators, tickets, accommodations,
    isLoading, isFetchingInclusions, isErrorInclusions, inclusionsError,
    eventById, functionById, collaboratorById, ticketByInclusion, purchasedTicketByInclusion,
    accommodationByInclusion, pendingChangeByInclusion, pendingSwapByInclusion, approvedSwapInclusionIds, firstSwapByInclusion,
    commentCountByInclusion,
  } = q;

  // ── Permissões ──────────────────────────────────────────────────────────
  const p = useScalingPermissions({ user, q });
  const { userFunctionIds, isAdminOrPurchasing } = p;

  // ── Nomes ────────────────────────────────────────────────────────────────
  const getEventName = (eventId: string | null) =>
    (eventId && eventById.get(eventId)?.name) || "Evento não encontrado";
  const getFunctionName = (functionId: string | null) =>
    (functionId && functionById.get(functionId)?.name) || "Função não encontrada";
  const getCollaboratorName = (collaboratorId?: string | null) => {
    if (!collaboratorId) return "Não escalado";
    return fixEncoding(collaboratorById.get(collaboratorId)?.fullName) || "Colaborador não encontrado";
  };
  const getCollaboratorCity = (collaboratorId?: string | null) =>
    (collaboratorId && collaboratorById.get(collaboratorId)?.city) || null;
  const getTicket = (inclusionId: string) => ticketByInclusion.get(inclusionId);
  const getPurchasedTicket = (inclusionId: string) => purchasedTicketByInclusion.get(inclusionId);
  const getAccommodation = (inclusionId: string) => accommodationByInclusion.get(inclusionId);
  const isCenotecnicaFunction = (functionId: string | null) => isCenotecnicaFunctionName(getFunctionName(functionId));
  const isAtendimentoInclusion = (inclusion: TeamInclusion) => isAtendimentoFunction(getFunctionName(inclusion.functionId));
  const isPercursoInclusion = (inclusion: TeamInclusion) => isPercursoFunction(getFunctionName(inclusion.functionId));

  // ── Recorte de permissão de visualização ─────────────────────────────────
  const filteredTeamInclusions = useMemo(() => (teamInclusions || []).filter(ti => {
    // Cinto e suspensório: o servidor já não manda excluídas quando o toggle
    // está desligado, mas o cache pode conter as da consulta anterior enquanto
    // a nova não chega (é o `placeholderData` que segura a lista na tela).
    if (!filters.showDeleted && ti.deletedAt) return false;
    // `?phase=all` (recorte da área de função) traz as vagas ainda em
    // Validação de Escala — esta tela nunca as mostrou.
    if (isSuggestionInclusion(ti)) return false;
    const linkedEvent = eventById.get(ti.eventId);
    if (!linkedEvent || linkedEvent.status === "excluído" || linkedEvent.status === "excluido") return false;
    // Todo papel conhecido vê tudo; papel desconhecido só as funções que gere.
    if (hasRole(user, "admin", "production", "function_area", "purchasing", "financial")) return true;
    return userFunctionIds.has(ti.functionId);
  }), [teamInclusions, eventById, user, userFunctionIds, filters.showDeleted]);

  // ── Filtros + ordenação ─────────────────────────────────────────────────
  const scalingInclusions = useMemo(
    () => filtrarEOrdenarVagas(filteredTeamInclusions, filters, sortConfig, {
      getEventName, getFunctionName, getCollaboratorName, getCollaboratorCity, purchasedTicketByInclusion, accommodationByInclusion,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredTeamInclusions, filters, sortConfig, eventById, functionById, collaboratorById, purchasedTicketByInclusion, accommodationByInclusion],
  );

  // Trocas pendentes sobre as quais o usuário PODE agir
  const isActionablePendingSwap = (inclusion: TeamInclusion) => {
    const swap = pendingSwapByInclusion.get(inclusion.id);
    if (!swap) return false;
    if (ALREADY_HANDLED_SWAP_STATUSES.has(inclusion.status ?? "")) return false;
    if (isAdminOrPurchasing) return true;
    return !!user?.id && swap.requestedBy === user.id;
  };

  // Base NÃO filtrada (só o recorte de permissão) — o banner conta o total real
  const pendingSwapInclusionsAll = useMemo(
    () => filteredTeamInclusions.filter(isActionablePendingSwap),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredTeamInclusions, pendingSwapByInclusion, isAdminOrPurchasing, user?.id],
  );
  const pendingSwapInclusionsInView = useMemo(
    () => scalingInclusions.filter(isActionablePendingSwap),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scalingInclusions, pendingSwapByInclusion, isAdminOrPurchasing, user?.id],
  );

  const pendingProductionApprovals = useMemo(
    () => filteredTeamInclusions.filter(i => i.status === "aguardando_producao"),
    [filteredTeamInclusions],
  );
  const pendingProductionApprovalsInView = useMemo(
    () => scalingInclusions.filter(i => i.status === "aguardando_producao"),
    [scalingInclusions],
  );

  // Conflitos de escalação de um colaborador (mesmo evento / datas sobrepostas).
  // Índices memoizados (auditoria 28/08): a tela chama isto para CADA linha ao
  // montar o mapa de bloqueios — varrer a lista inteira por chamada era O(n²).
  const inclusionById = useMemo(
    () => new Map((teamInclusions ?? []).map(ti => [ti.id, ti])),
    [teamInclusions],
  );
  const activeInclusionsByCollaborator = useMemo(() => {
    const idx = new Map<string, TeamInclusion[]>();
    for (const ti of teamInclusions ?? []) {
      if (!ti.collaboratorId || !ACTIVE_CONFLICT_STATUSES.includes(ti.status)) continue;
      const lista = idx.get(ti.collaboratorId);
      if (lista) lista.push(ti); else idx.set(ti.collaboratorId, [ti]);
    }
    return idx;
  }, [teamInclusions]);
  const getCollaboratorConflicts = (collaboratorId: string, refInclusion: TeamInclusion | null | undefined) => {
    if (!collaboratorId || !teamInclusions) return { sameEvent: [] as TeamInclusion[], dateOverlap: [] as TeamInclusion[], mesmoDia: [] as TeamInclusion[] };
    // Prefere a versão fresca da lista (como o find original), cai no objeto passado
    const ref = (refInclusion?.id && inclusionById.get(refInclusion.id)) || refInclusion;
    const others = (activeInclusionsByCollaborator.get(collaboratorId) ?? []).filter(ti => ti.id !== ref?.id);
    const sameEvent = others.filter(ti => ref && ti.eventId === ref.eventId);
    // Só BLOQUEIA quando dividem 2+ dias; um dia só em comum (duas viagens no
    // mesmo dia) vira aviso — dono, 18/09.
    const dateOverlap = others.filter(ti => ref && tipoDeConflitoDeAgenda(ti, ref) === "sobreposicao");
    const mesmoDia = others.filter(ti => ref && ti.eventId !== ref.eventId && tipoDeConflitoDeAgenda(ti, ref) === "mesmo_dia");
    return { sameEvent, dateOverlap, mesmoDia };
  };

  const hasActiveFilters =
    filters.eventId.length > 0 ||
    filters.functionId.length > 0 ||
    filters.collaboratorId.length > 0 ||
    filters.escalationStatus.length > 0 ||
    filters.ticketStatus.length > 0 ||
    filters.accommodationStatus.length > 0 ||
    filters.searchId.trim() !== "";

  return {
    // dados crus
    teamInclusions, events, functions, collaborators, tickets, accommodations,
    isLoading, isFetchingInclusions, isErrorInclusions, inclusionsError,
    // índices
    eventById, functionById, collaboratorById, ticketByInclusion, purchasedTicketByInclusion,
    accommodationByInclusion, pendingChangeByInclusion, pendingSwapByInclusion, approvedSwapInclusionIds, firstSwapByInclusion,
    commentCountByInclusion, getResponsavelDaFuncao: p.getResponsavelDaFuncao,
    // listas
    filteredTeamInclusions, scalingInclusions,
    pendingSwapInclusionsAll, pendingSwapInclusionsInView,
    pendingProductionApprovals, pendingProductionApprovalsInView,
    hasActiveFilters,
    // permissões
    isAdminRole: p.isAdminRole, isAdminOrPurchasing, canApproveProduction: p.canApproveProduction, canApproveProductionFor: p.canApproveProductionFor,
    canExport: p.canExport, userFunctionIds,
    canManageFunction: p.canManageFunction, canConfirmEscalation: p.canConfirmEscalation, canEditCollaborator: p.canEditCollaborator, canScaleFunction: p.canScaleFunction,
    podeAgirEmEventoPassado: p.podeAgirEmEventoPassado, isPastEvent: p.isPastEvent, isEventLocked: p.isEventLocked,
    // helpers
    getEventName, getFunctionName, getCollaboratorName, getCollaboratorCity,
    getTicket, getPurchasedTicket, getAccommodation, isCenotecnicaFunction, isAtendimentoInclusion, isPercursoInclusion,
    getCollaboratorConflicts,
  };
}

export type ScalingData = ReturnType<typeof useScalingData>;
