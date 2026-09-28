/**
 * Dados do espelho operacional (25/09 — extraído da página).
 *
 * Carrega a resposta do servidor e deriva, UMA vez por carga, o que todas as
 * visões leem: pendência por linha, resumo do evento, grupos confirmados,
 * colaboradores por id. Antes cada parte contava do seu jeito e os números
 * divergiam entre si.
 */
import { useMemo, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Event } from "@shared/schema";
import {
  isHotelTotalDerived,
  type MirrorRow, type MirrorResponse, type MirrorCollaborator,
} from "@shared/operational-mirror-types";
import {
  blocosAbertos, contextoDaLinha, resumoDoEvento, temSugestaoAConfirmar,
  type BlocoDeCusto, type GruposConfirmados,
} from "@shared/mirror-pendencia";
import type { PendenciaDaLinha, PendenciaDe } from "./mirror-shared";

export function mirrorQueryKey(eventId: string) {
  return ["/api/events", eventId, "operational-mirror"];
}

export function useMirrorData(eventId: string, sanearEventoEmFoco: (ids: string[]) => void) {
  const { data: events } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  // Evento em foco que não existe mais (excluído) é descartado assim que a lista chega (23/09).
  useEffect(() => { if (events?.length) sanearEventoEmFoco(events.map(e => e.id)); }, [events, sanearEventoEmFoco]);
  const mirrorKey = mirrorQueryKey(eventId);
  const { data, isLoading, isError, error } = useQuery<MirrorResponse>({ queryKey: mirrorKey, enabled: !!eventId && eventId !== "all" });

  const totals = data?.totals;
  const ev = data?.event;
  const rows: MirrorRow[] = useMemo(() => data?.rows ?? [], [data]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.function.area || r.function.name || "(sem departamento)"));
    return Array.from(set).sort();
  }, [rows]);

  const hotels = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => { if (r.accommodation?.hotelName) set.add(r.accommodation.hotelName); });
    return Array.from(set).sort();
  }, [rows]);

  /**
   * Grupos já confirmados por alguém. É o que separa SUGESTAO de DADO na grade:
   * o valor do Uber e o tipo de quarto vinham calculados pelo sistema e eram
   * lidos como decisão tomada. Agora dizem "a confirmar" até alguém confirmar
   * na visão correspondente.
   */
  const uberConfirmados = useMemo(
    () => new Set((data?.uberGroups ?? []).filter((g) => g.confirmed).map((g) => g.id)),
    [data?.uberGroups],
  );
  const quartosConfirmados = useMemo(
    () => new Set((data?.roomGroups ?? []).filter((g) => g.confirmed).map((g) => g.id)),
    [data?.roomGroups],
  );
  const confirmados = useMemo<GruposConfirmados>(() => ({ uber: uberConfirmados, quartos: quartosConfirmados }), [uberConfirmados, quartosConfirmados]);

  /**
   * A pendência de cada pessoa pela regra de BLOCO (shared/mirror-pendencia).
   *
   * Calculada uma vez por carga: faixa, placar, chips, grade, Departamentos e
   * Pessoas leem daqui — a mesma resposta em todo lugar.
   */
  const pendenciaPorLinha = useMemo(() => {
    const m = new Map<string, PendenciaDaLinha>();
    for (const r of rows) {
      const ctx = contextoDaLinha(r, confirmados);
      m.set(r.teamInclusionId, { abertos: blocosAbertos(r, ctx), sugestao: temSugestaoAConfirmar(r, ctx), ctx });
    }
    return m;
  }, [rows, confirmados]);
  const pendenciaDe: PendenciaDe = useCallback(
    (r: MirrorRow) => pendenciaPorLinha.get(r.teamInclusionId) ?? { abertos: [] as BlocoDeCusto[], sugestao: false, ctx: contextoDaLinha(r, confirmados) },
    [pendenciaPorLinha, confirmados],
  );
  const resumo = useMemo(() => resumoDoEvento(rows, confirmados), [rows, confirmados]);

  // Colaboradores por id — os grupos de quarto/Uber vêm do servidor só com collaboratorId.
  const collabById = useMemo(() => {
    const m = new Map<string, MirrorCollaborator>();
    rows.forEach((r) => { if (r.collaborator.id) m.set(r.collaborator.id, r.collaborator); });
    return m;
  }, [rows]);
  // Linhas cujo total de hotel é DERIVADO (diária × diárias, sem totalCents informado).
  const derivedHotelCount = useMemo(() => rows.filter(isHotelTotalDerived).length, [rows]);

  // Uma falha de rede/sessão deixava a tela em branco abaixo do seletor, como se o
  // evento não tivesse dados. Agora a causa é dita em voz alta.
  const loadErrorMessage = (() => {
    if (!isError) return null;
    const err = error as { status?: number; body?: { message?: string } } | null;
    if (err?.status === 401) return "Sua sessão expirou. Entre novamente para ver o espelho operacional.";
    if (err?.status === 403) return "Você não tem permissão para consultar o espelho deste evento.";
    return err?.body?.message || "Não foi possível carregar o espelho operacional. Verifique sua conexão e tente novamente.";
  })();

  return {
    events, mirrorKey, data, isLoading, loadErrorMessage,
    totals, ev, rows, departments, hotels, confirmados, pendenciaDe, resumo, collabById, derivedHotelCount,
  };
}

export type MirrorData = ReturnType<typeof useMirrorData>;
