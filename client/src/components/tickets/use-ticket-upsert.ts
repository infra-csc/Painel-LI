// Mutations de passagem + upsert idempotente (usado pelo modal e pelo lote).
import { useRef, type MutableRefObject } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { buildTicketPayload, type TicketFormValues } from "@/lib/ticket-form";
import type { TeamInclusion, Ticket, Accommodation } from "@shared/schema";

interface UseTicketUpsertArgs {
  getTicket: (inclusionId: string) => Ticket | undefined;
  accommodationByInclusion: Map<string, Accommodation>;
  /** Chamado quando um PATCH de passagem conclui (a página sai do modo edição). */
  onTicketUpdated?: () => void;
}

export type UpsertMode = "created" | "updated";

export function useTicketUpsert({ getTicket, accommodationByInclusion, onTicketUpdated }: UseTicketUpsertArgs) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // Durante o lote, as falhas são consolidadas numa lista ao final — sem um toast por item.
  const batchRunning: MutableRefObject<boolean> = useRef(false);

  const mutationError = (fallback: string) => (err: { body?: { message?: string } }) => {
    if (batchRunning.current) return;
    toast({ title: "Erro", description: err?.body?.message || fallback, variant: "destructive" });
  };

  const createTicketMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => (await apiRequest("POST", "/api/tickets", payload)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    },
    onError: mutationError("Erro ao registrar passagem"),
  });
  const updateTicketMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) => (await apiRequest("PATCH", `/api/tickets/${id}`, payload)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      onTicketUpdated?.();
    },
    onError: mutationError("Erro ao atualizar passagem"),
  });
  const updateTeamInclusionMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: { status: string; phase: string } }) => (await apiRequest("PATCH", `/api/team-inclusions/${id}`, payload)).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] }); },
    // Sem isto, a passagem era criada e a falha em atualizar o status passava silenciosamente.
    onError: mutationError("Passagem registrada, mas não foi possível atualizar o status da inclusão"),
  });

  // Status resultante ao registrar: hospedagem já comprada + passagem → hospedagem_passagem_comprada.
  const statusAfterTicket = (inclusion: TeamInclusion) => {
    const acc = accommodationByInclusion.get(inclusion.id);
    if (inclusion.needsAccommodation && acc?.hotelName) return { status: "hospedagem_passagem_comprada", phase: "hospedagem" };
    return { status: "passagem_comprada", phase: "passagem" };
  };

  // Idempotente: se já existe passagem (falha parcial, refetch atrasado, duas
  // abas), atualiza em vez de duplicar. Consulta a lista fresca antes de decidir.
  const upsertTicketForInclusion = async (inclusion: TeamInclusion, form: TicketFormValues): Promise<UpsertMode> => {
    let existing = getTicket(inclusion.id);
    if (!existing) {
      try {
        const fresh = await queryClient.fetchQuery<Ticket[]>({ queryKey: ["/api/tickets"], staleTime: 0 });
        existing = fresh?.find(t => t.teamInclusionId === inclusion.id);
      } catch { /* sem rede: segue com o cache */ }
    }
    let mode: UpsertMode;
    if (existing) {
      await updateTicketMutation.mutateAsync({ id: existing.id, payload: buildTicketPayload(form) });
      mode = "updated";
    } else {
      await createTicketMutation.mutateAsync(buildTicketPayload(form, { teamInclusionId: inclusion.id }));
      mode = "created";
    }
    // Ao criar aplica sempre; ao atualizar só corrige status que ainda não reflete a compra.
    const target = statusAfterTicket(inclusion);
    const frozen = ["aprovado", "cancelado", "hospedagem_passagem_comprada"];
    if (mode === "created" || (!frozen.includes(inclusion.status) && inclusion.status !== target.status)) {
      await updateTeamInclusionMutation.mutateAsync({ id: inclusion.id, payload: target });
    }
    return mode;
  };

  return {
    upsertTicketForInclusion,
    isSubmitting: createTicketMutation.isPending || updateTicketMutation.isPending,
    batchRunning,
  };
}
