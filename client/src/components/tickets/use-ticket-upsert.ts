// Mutations de passagem + upsert idempotente (usado pelo modal e pelo lote).
import { useRef, type MutableRefObject } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import { aplicarStatusDaVagaNoCache, TEAM_INCLUSIONS_KEY } from "@/hooks/use-vaga-acoes";
import { buildTicketPayload, type TicketFormValues } from "@/lib/ticket-form";
import type { TeamInclusion, Ticket, Accommodation } from "@shared/schema";

interface UseTicketUpsertArgs {
  getTicket: (inclusionId: string) => Ticket | undefined;
  /**
   * Sem uso desde 24/09: o status da vaga (passagem_comprada /
   * hospedagem_passagem_comprada) é derivado pelo SERVIDOR ao registrar a
   * passagem. Mantido opcional para não quebrar quem ainda passa.
   */
  accommodationByInclusion?: Map<string, Accommodation>;
  /** Chamado quando um PATCH de passagem conclui (a página sai do modo edição). */
  onTicketUpdated?: () => void;
}

export type UpsertMode = "created" | "updated";

/**
 * `POST/PATCH /api/tickets` devolvem a passagem + o status resultante da vaga (24/09)
 * e, num trecho direto (09/10), a volta que a vaga anterior ainda tem registrada.
 */
type TicketComStatusDaVaga = Ticket & {
  inclusionStatus?: string;
  voltaParaCancelar?: { inclusionId: string; numero: number; eventName: string; quando: string };
};

export function useTicketUpsert({ getTicket, onTicketUpdated }: UseTicketUpsertArgs) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // Durante o lote, as falhas são consolidadas numa lista ao final — sem um toast por item.
  const batchRunning: MutableRefObject<boolean> = useRef(false);
  // O modal mostra o bloqueio de viagem (409 "viagem_cruzada") no próprio
  // formulário, com a saída — o toast repetiria a mesma frase por cima.
  const silenciarViagemCruzada = useRef(false);

  const mutationError = (fallback: string) => (err: unknown) => {
    if (batchRunning.current) return;
    if (silenciarViagemCruzada.current && (err as { body?: { code?: string } } | null)?.body?.code === "viagem_cruzada") return;
    toast({ title: "Passagem não salva", description: apiErrorMessage(err, fallback), variant: "destructive" });
  };

  // O servidor já recalculou o status da vaga: reflete no cache na hora e
  // confirma com o refetch (o segundo PATCH de status não existe mais).
  const refletirStatusDaVaga = (ticket: TicketComStatusDaVaga | undefined) => {
    if (ticket?.teamInclusionId && ticket.inclusionStatus) {
      aplicarStatusDaVagaNoCache(queryClient, ticket.teamInclusionId, ticket.inclusionStatus);
    }
    queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
    queryClient.invalidateQueries({ queryKey: [TEAM_INCLUSIONS_KEY] });
    // Pendências: viagens que se cruzam / datas impossíveis (09/10).
    queryClient.invalidateQueries({ queryKey: ["shell", "viagens-e-datas"] });
    // Trecho direto: a vaga de onde a pessoa sai ainda tem volta registrada.
    const volta = ticket?.voltaParaCancelar;
    if (volta) {
      toast({
        title: `A vaga #${volta.numero} ainda tem volta registrada`,
        description: `${volta.eventName}: volta em ${volta.quando}. Com o trecho direto ela não é mais usada — edite a passagem de lá para tirar a volta (e cancele o bilhete, se já foi emitido).`,
      });
    }
  };

  const createTicketMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      (await apiRequest("POST", "/api/tickets", payload)).json() as Promise<TicketComStatusDaVaga>,
    onSuccess: refletirStatusDaVaga,
    onError: mutationError("Erro ao registrar passagem"),
  });
  const updateTicketMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      (await apiRequest("PATCH", `/api/tickets/${id}`, payload)).json() as Promise<TicketComStatusDaVaga>,
    onSuccess: (ticket) => {
      refletirStatusDaVaga(ticket);
      onTicketUpdated?.();
    },
    onError: mutationError("Erro ao atualizar passagem"),
  });

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
    if (existing) {
      await updateTicketMutation.mutateAsync({ id: existing.id, payload: buildTicketPayload(form) });
      return "updated";
    }
    await createTicketMutation.mutateAsync(buildTicketPayload(form, { teamInclusionId: inclusion.id }));
    return "created";
  };

  return {
    upsertTicketForInclusion,
    isSubmitting: createTicketMutation.isPending || updateTicketMutation.isPending,
    batchRunning,
    silenciarViagemCruzada,
  };
}
