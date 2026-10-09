/**
 * Dados e ações da tela de Eventos (28/09, extraídos de pages/events.tsx):
 * a lista (com excluídos), a contagem de escalações por evento, os
 * indicadores, os anos disponíveis e as mutações de excluir/restaurar — com o
 * estado do diálogo de confirmação, que pertence a essas ações.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Event, TeamInclusion } from "@shared/schema";
import { isSuggestionInclusion } from "@shared/scaling-validation-rules";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { listaDeVagasQuery, recorteDaListaDeVagas } from "@/hooks/use-vaga-acoes";
import { apiErrorMessage, apiErrorStatus } from "@/lib/api-error";
import { getEventStatus, parseLocalDate } from "@/lib/event-status";
import { apiRequest } from "@/lib/queryClient";
import type { EventsStats } from "./events-kpis";

export interface ConfirmacaoDeEvento {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  variant?: "delete" | "cancel" | "confirm";
  /** O evento da confirmação — o diálogo mostra qual é (nome, nº, período). */
  evento?: Event;
  onConfirm: () => void;
}

const CONFIRMACAO_FECHADA: ConfirmacaoDeEvento = { open: false, title: "", message: "", confirmLabel: "", variant: "delete", onConfirm: () => {} };

export function useEventsData() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: events, isLoading, isError, error, refetch } = useQuery<Event[]>({ queryKey: ["/api/events?includeDeleted=true"] });
  // Contagem de escalações por evento (todos os eventos): admin/produção/
  // compras/RH leem a fila inteira; quem não pode cai em `?phase=all` (24/09)
  // e as sugestões são descontadas abaixo.
  const { data: inclusions } = useQuery<TeamInclusion[]>(listaDeVagasQuery(recorteDaListaDeVagas({ user })));

  const loadErrorMsg = (err: unknown) =>
    apiErrorStatus(err) === 401 ? "Sua sessão expirou. Entre novamente para ver os eventos."
    : apiErrorStatus(err) === 403 ? "Você não tem permissão para ver os eventos."
    : apiErrorMessage(err, "Não foi possível carregar os eventos. Verifique sua conexão e tente novamente.");

  const escalacoes = useMemo(() => {
    const map: Record<string, number> = {};
    (inclusions ?? []).forEach(i => { if (i.eventId && !isSuggestionInclusion(i)) map[i.eventId] = (map[i.eventId] ?? 0) + 1; });
    return map;
  }, [inclusions]);

  const stats = useMemo<EventsStats>(() => {
    const list = events ?? [];
    return {
      total: list.filter(e => e.status !== "excluído").length,
      planejado: list.filter(e => getEventStatus(e) === "planejado").length,
      emAndamento: list.filter(e => getEventStatus(e) === "em andamento").length,
      concluido: list.filter(e => getEventStatus(e) === "concluído").length,
    };
  }, [events]);

  const availableYears = useMemo(() => {
    const yrs = new Set<number>();
    (events ?? []).forEach(e => { const d = parseLocalDate(e.startDate); if (d) yrs.add(d.getFullYear()); });
    return Array.from(yrs).sort((a, b) => b - a);
  }, [events]);

  const activeEvents = useMemo(() => (events ?? []).filter(e => e.status !== "excluído"), [events]);

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ["/api/events"] });
    await qc.invalidateQueries({ queryKey: ["/api/events?includeDeleted=true"] });
  };

  const deleteMutation = useMutation({
    mutationFn: async (ev: Event) => (await apiRequest("PUT", `/api/events/${ev.id}`, { status: "excluído" })).json(),
    onSuccess: async () => { await invalidate(); toast({ title: "Evento marcado como excluído." }); },
    onError: (err: unknown) => toast({ title: "Erro ao excluir", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" }),
  });
  const restoreMutation = useMutation({
    mutationFn: async (ev: Event) => (await apiRequest("PUT", `/api/events/${ev.id}`, { status: "planejado" })).json(),
    onSuccess: async () => { await invalidate(); toast({ title: "Evento restaurado." }); },
    onError: (err: unknown) => toast({ title: "Erro ao restaurar", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" }),
  });
  const isMutating = deleteMutation.isPending || restoreMutation.isPending;

  const [confirmState, setConfirmState] = useState<ConfirmacaoDeEvento>(CONFIRMACAO_FECHADA);
  const closeConfirm = () => setConfirmState(p => ({ ...p, open: false }));
  const confirmDelete = (ev: Event) => setConfirmState({
    open: true, title: "Excluir evento?", message: `"${ev.name}" será marcado como excluído.`, confirmLabel: "Excluir", variant: "delete", evento: ev,
    onConfirm: () => { closeConfirm(); if (!deleteMutation.isPending) deleteMutation.mutate(ev); },
  });
  const confirmRestore = (ev: Event) => setConfirmState({
    open: true, title: "Restaurar evento?", message: `"${ev.name}" voltará ao status Planejado.`, confirmLabel: "Restaurar", variant: "confirm", evento: ev,
    onConfirm: () => { closeConfirm(); if (!restoreMutation.isPending) restoreMutation.mutate(ev); },
  });

  return {
    events, isLoading, isError, error, refetch, loadErrorMsg,
    escalacoes, stats, availableYears, activeEvents,
    isMutating, confirmState, closeConfirm, confirmDelete, confirmRestore,
  };
}

export type EventsData = ReturnType<typeof useEventsData>;
