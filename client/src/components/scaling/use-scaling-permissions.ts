/**
 * Permissões da Escalação (25/09 — extraídas de use-scaling-data.ts): quem
 * gere/escala/confirma cada função, quem aprova cenotécnica, evento encerrado
 * e a troca de colaborador. Espelham as travas do servidor — nada aqui inventa
 * regra nova.
 */
import { useMemo } from "react";
import { hasRole, isAdmin } from "@/lib/role-utils";
import { isEventPast, canActOnPastEvent } from "@shared/event-window";
import { isCenotecnicaFunctionName } from "@shared/scaling-rules";
import type { TeamInclusion } from "@shared/schema";
import type { ScalingUser } from "./scaling-data-types";
import type { ScalingQueries } from "./use-scaling-queries";

export function useScalingPermissions({ user, q }: { user: ScalingUser; q: ScalingQueries }) {
  const { allFunctionManagers, escalaManagers, functionById, eventById, purchasedTicketByInclusion, accommodationByInclusion } = q;

  const userFunctionIds = useMemo(
    () => new Set((allFunctionManagers || []).filter(m => m.userId === user?.id).map(m => m.functionId)),
    [allFunctionManagers, user?.id],
  );

  /** Quem responde pela função, por extenso. Vazio quando não há responsável. */
  const responsaveisPorFuncao = useMemo(() => {
    const m = new Map<string, string[]>();
    (allFunctionManagers || []).forEach((fm) => {
      const nome = (fm.userName || "").trim();
      if (!nome) return;
      const lista = m.get(fm.functionId);
      if (lista) { if (!lista.includes(nome)) lista.push(nome); } else m.set(fm.functionId, [nome]);
    });
    return m;
  }, [allFunctionManagers]);
  const getResponsavelDaFuncao = (functionId: string): string | null => {
    const nomes = responsaveisPorFuncao.get(functionId);
    if (!nomes || nomes.length === 0) return null;
    return nomes.length === 1 ? nomes[0] : `${nomes[0]} e mais ${nomes.length - 1}`;
  };

  // Papéis via helpers que normalizam aliases legados (23/09) — comparar a
  // string crua escondia botões de quem tem "administrador"/"compras" no banco.
  const isAdminRole = isAdmin(user);
  const isAdminOrPurchasing = hasRole(user, "admin", "purchasing");

  /**
   * Funções CENOTÉCNICAS em que este usuário é 'aprovador' cadastrado no
   * módulo de Escala — espelha o que o servidor aceita no approve-production
   * (admin, flag canApproveCenotecnica ou aprovador da função da vaga, que
   * precisa ser cenotécnica).
   */
  const approverCenotecnicaFunctionIds = useMemo(() => {
    const ids = new Set<string>();
    (escalaManagers || []).forEach((m) => {
      if (m.userId !== user?.id || m.role !== "aprovador") return;
      if (isCenotecnicaFunctionName(functionById.get(m.functionId)?.name || "")) ids.add(m.functionId);
    });
    return ids;
  }, [escalaManagers, user?.id, functionById]);

  /** Pode aprovar (gestor) ESTA vaga de cenotécnica — a checagem exata do servidor. */
  const canApproveProductionFor = (inclusion: Pick<TeamInclusion, "functionId">): boolean =>
    isAdminRole || !!user?.canApproveCenotecnica || approverCenotecnicaFunctionIds.has(inclusion.functionId);
  /**
   * Flag geral (fila "Com o gestor", card do modal): verdadeira se a pessoa
   * pode aprovar ALGUMA função. Para a linha/ação use `canApproveProductionFor`.
   */
  const canApproveProduction = isAdminRole || !!user?.canApproveCenotecnica || approverCenotecnicaFunctionIds.size > 0;
  // Exportação XLSX carrega CPF/telefone/nascimento — só admin, Compras e RH/Financeiro
  const canExport = hasRole(user, "admin", "purchasing", "financial");

  // Espelha `podeEditarVagaAsync` do servidor (PATCH e /confirm da vaga):
  // admin, Compras e Logística Interna (production) editam qualquer função;
  // Área de Função só as funções em que é responsável (function_managers).
  // Antes `production` ficava de fora e o "Confirmar" sumia para a Logística.
  const canManageFunction = (functionId: string): boolean => {
    if (!user) return false;
    if (isAdminRole || hasRole(user, "purchasing", "production")) return true;
    return userFunctionIds.has(functionId);
  };

  const canConfirmEscalation = (inclusion: TeamInclusion): boolean => canManageFunction(inclusion.functionId);

  /**
   * Quem vê o botão "Escalar alguém" na linha (regra do dono, 01/09):
   * SÓ o administrador e o responsável por AQUELA função.
   *
   * É mais estrito que `canManageFunction`, que também libera Compras. Compras
   * continua podendo trocar colaborador pelo registro — o que muda é o atalho
   * da lista, que deixa de convidar quem não responde pela função a preencher
   * a vaga de outra pessoa.
   */
  const canScaleFunction = (functionId: string): boolean => {
    if (!user) return false;
    if (isAdminRole) return true;
    return userFunctionIds.has(functionId);
  };

  // Evento encerrado (regra do usuário, 20/08): a partir do dia seguinte ao
  // término, só o administrador age. Espelha a trava do servidor
  // (403 PAST_EVENT_BLOCK_MSG) — nenhum estado novo, só endDate + papel.
  const podeAgirEmEventoPassado = canActOnPastEvent(user?.role);
  const isPastEvent = (eventId: string | null | undefined): boolean =>
    !!eventId && isEventPast(eventById.get(eventId)?.endDate);
  const isEventLocked = (inclusion: TeamInclusion): boolean =>
    !podeAgirEmEventoPassado && isPastEvent(inclusion.eventId);

  // Alterar colaborador: a mesma permissão do PATCH (admin/Compras/Logística,
  // ou Área de Função responsável por AQUELA função — a API exige o cadastro em
  // function_managers, não basta o papel), e só até haver passagem comprada
  // (se needsTicket) ou hospedagem reservada (se needsAccommodation).
  const canEditCollaborator = (inclusion: TeamInclusion): boolean => {
    if (!user) return false;
    if (!canManageFunction(inclusion.functionId)) return false;
    const ticketPurchased = inclusion.needsTicket ? purchasedTicketByInclusion.has(inclusion.id) : false;
    const accommodationReserved = inclusion.needsAccommodation ? accommodationByInclusion.has(inclusion.id) : false;
    return !(ticketPurchased || accommodationReserved);
  };

  return {
    userFunctionIds, getResponsavelDaFuncao, isAdminRole, isAdminOrPurchasing,
    canApproveProductionFor, canApproveProduction, canExport,
    canManageFunction, canConfirmEscalation, canScaleFunction,
    podeAgirEmEventoPassado, isPastEvent, isEventLocked, canEditCollaborator,
  };
}
