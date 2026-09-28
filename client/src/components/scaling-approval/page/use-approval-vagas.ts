/**
 * Vagas da Aprovação (25/09 — extraído de pages/scaling-approval.tsx): as
 * sugestões do recorte (aguardando aprovação e paradas na área), os filtros
 * "só as minhas funções" e a vaga inteira do pedido aberto no detalhe.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { TeamInclusion } from "@shared/schema";
import { ALL_EVENTS_ROW_LIMIT, STALLED_DAYS, SUGESTAO_STATUS } from "@shared/scaling-validation-rules";
import { SUGGESTIONS_QUERY_KEY } from "@/components/scaling-validation/types";
import { APPROVAL_QUERY_KEYS, type ChangeRequestItem, type StalledRow } from "../types";
import { daysAwaiting } from "../awaiting-approval";

export function useApprovalVagas({ canAccess, isApprover, isAdmin, eventId, openRequest }: {
  canAccess: boolean; isApprover: boolean; isAdmin: boolean; eventId: string; openRequest: ChangeRequestItem | null;
}) {
  const [onlyMineStalled, setOnlyMineStalled] = useState(true);
  /** "Vagas aguardando aprovação": mostra todas por padrão (as de outros aprovadores ficam com o cadeado). */
  const [onlyMineAwaiting, setOnlyMineAwaiting] = useState(false);

  /**
   * O pedido aberto age sobre uma vaga que EXISTE (ajuste ou exclusão)? Aí o
   * detalhe precisa dela inteira. A exclusão entrou em 04/09: o aprovador
   * tirava da escala uma vaga que nunca tinha visto — só "#12" e um motivo.
   */
  const pedidoSobreVaga = !!openRequest && (openRequest.requestType === "ajuste" || openRequest.requestType === "exclusao") && !!openRequest.teamInclusionId;
  /** Evento da vaga que o detalhe aberto precisa (vaga inteira / formulário editável do ajuste). */
  const sheetEventId = pedidoSobreVaga ? openRequest.eventId : "";
  /**
   * Quem DECIDE carrega as vagas SEMPRE — com evento escolhido ou em "Todos os
   * eventos" (aí o servidor devolve as vagas em validação de todos, com teto).
   *
   * Antes a busca dependia de haver evento selecionado, e o contador
   * "Aguardando aprovação" caía para 0 no padrão da tela: o aprovador via
   * "nenhum pedido pendente — bom trabalho" com 15 vagas validadas esperando
   * decisão. A tela MENTIA; é o caso que esta query resolve.
   *
   * Quem não decide continua buscando só o que o Sheet aberto precisa.
   */
  const suggestionsEventId = isApprover ? eventId : sheetEventId;
  const suggestionsEnabled = canAccess && (isApprover || !!sheetEventId);
  const suggestionsQuery = useQuery<StalledRow[]>({
    queryKey: [SUGGESTIONS_QUERY_KEY, suggestionsEventId || "__todos__"],
    queryFn: async () =>
      (await apiRequest(
        "GET",
        suggestionsEventId ? `${SUGGESTIONS_QUERY_KEY}?eventId=${encodeURIComponent(suggestionsEventId)}` : SUGGESTIONS_QUERY_KEY,
      )).json(),
    enabled: suggestionsEnabled,
    staleTime: 15_000,
  });
  /**
   * Enquanto as vagas carregam, NENHUM contador pode mostrar 0 — repetir a
   * mentira em outra forma. Os tiles mostram "…" enquanto isto for true.
   */
  const loadingAwaiting = suggestionsEnabled && (suggestionsQuery.isLoading || (isApprover && !suggestionsQuery.data && !suggestionsQuery.error));
  /** O servidor cortou a lista de vagas? (só existe teto no modo "todos"). */
  const suggestionsTruncated = !suggestionsEventId && (suggestionsQuery.data?.length ?? 0) >= ALL_EVENTS_ROW_LIMIT;
  /** Quantos eventos estão representados nas vagas exibidas (modo "todos"). */
  const eventsInSuggestions = useMemo(
    () => new Set((suggestionsQuery.data ?? []).map((r) => r.eventId)).size,
    [suggestionsQuery.data],
  );
  const openInclusion = useMemo(
    () => (openRequest?.teamInclusionId ? (suggestionsQuery.data ?? []).find((s) => s.id === openRequest.teamInclusionId) ?? null : null),
    [suggestionsQuery.data, openRequest?.teamInclusionId],
  );
  /**
   * Vaga já escalada não está na lista de sugestões — ela só traz a fase
   * "sugestao". O reajuste de um pedido vindo da Escalação ficava travado em
   * "aguarde a vaga carregar" para sempre, e o aprovador não conseguia editar.
   * Quando a lista não tem a vaga, ela é buscada pelo id.
   */
  const idDaVagaFaltante = pedidoSobreVaga && !openInclusion ? openRequest.teamInclusionId : null;
  const vagaPorIdQuery = useQuery<TeamInclusion>({
    queryKey: [APPROVAL_QUERY_KEYS.teamInclusions, "uma", idDaVagaFaltante],
    queryFn: async () => (await apiRequest("GET", `${APPROVAL_QUERY_KEYS.teamInclusions}/${idDaVagaFaltante}`)).json(),
    enabled: !!idDaVagaFaltante,
    staleTime: 15_000,
  });
  const vagaDoPedido: TeamInclusion | null = openInclusion ?? (idDaVagaFaltante ? (vagaPorIdQuery.data ?? null) : null);
  const vagaFalhou = !!idDaVagaFaltante && vagaPorIdQuery.isError;

  const stalledRowsAll = useMemo(
    () => (suggestionsQuery.data ?? [])
      .filter((s) => s.status === SUGESTAO_STATUS.PENDENTE && !s.pendingRequest && s.daysPending >= STALLED_DAYS)
      .sort((a, b) => b.daysPending - a.daysPending || (a.inclusionNumber ?? 0) - (b.inclusionNumber ?? 0)),
    [suggestionsQuery.data],
  );
  // Filtro "Só as minhas funções" (irrelevante para admin, que decide todas).
  const showOnlyMineStalled = !isAdmin;
  const stalledRows = useMemo(
    () => (showOnlyMineStalled && onlyMineStalled ? stalledRowsAll.filter((s) => s.canDecide === true) : stalledRowsAll),
    [stalledRowsAll, showOnlyMineStalled, onlyMineStalled],
  );

  /**
   * Vagas que a área validou e agora aguardam a decisão do aprovador
   * (sugestao_validada). Mais antigas no topo — é a fila que segura a escala.
   */
  const awaitingRowsAll = useMemo(
    () => (suggestionsQuery.data ?? [])
      .filter((s) => s.status === SUGESTAO_STATUS.VALIDADA)
      .sort((a, b) => daysAwaiting(b) - daysAwaiting(a) || (a.inclusionNumber ?? 0) - (b.inclusionNumber ?? 0)),
    [suggestionsQuery.data],
  );
  /**
   * As que dependem de VOCÊ (`canDecide` por linha vem do servidor; admin
   * decide todas). O tile diz "aguardando SUA aprovação" — contar as dos
   * outros aprovadores ali era prometer 15 decisões a quem tinha 3.
   */
  const awaitingMine = useMemo(() => awaitingRowsAll.filter((s) => s.canDecide === true), [awaitingRowsAll]);
  const awaitingOthers = awaitingRowsAll.length - awaitingMine.length;
  const awaitingRows = useMemo(
    () => (showOnlyMineStalled && onlyMineAwaiting ? awaitingMine : awaitingRowsAll),
    [awaitingRowsAll, awaitingMine, showOnlyMineStalled, onlyMineAwaiting],
  );

  /**
   * Em falha de carregamento nenhum contador pode mostrar 0: seria a mesma
   * mentira que o 0 durante o carregamento, só que sem nem a chance de virar
   * número. O cartão diz que falhou e leva para a aba, que traz o "tentar de
   * novo"; a faixa de recortes some — não há fila para recortar.
   */
  const erroVagas = !!suggestionsQuery.error;

  return {
    suggestionsQuery, loadingAwaiting, suggestionsTruncated, eventsInSuggestions, vagaDoPedido, vagaFalhou, erroVagas,
    onlyMineStalled, setOnlyMineStalled, onlyMineAwaiting, setOnlyMineAwaiting, showOnlyMineStalled,
    stalledRowsAll, stalledRows, awaitingRowsAll, awaitingMine, awaitingOthers, awaitingRows,
  };
}

export type ApprovalVagas = ReturnType<typeof useApprovalVagas>;
