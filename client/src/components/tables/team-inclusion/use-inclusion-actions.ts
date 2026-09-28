/**
 * Ações da tabela de inclusões (25/09 — extraídas da tabela): excluir e
 * cancelar (uma e em lote), copiar ID, comentários e o diálogo de confirmação.
 */
import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TeamInclusion } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage, apiErrorStatus } from "@/lib/api-error";
import { PAST_EVENT_BLOCK_MSG } from "@/lib/event-lock";
import { canDeleteInclusion, type ConfirmState } from "./inclusion-shared";
import type { TeamInclusionData } from "./use-team-inclusion-data";

export function useInclusionActions(data: Pick<TeamInclusionData, "inclusionById" | "selectedRows" | "setSelectedRows" | "isEventLocked">) {
  const { inclusionById, selectedRows, setSelectedRows, isEventLocked } = data;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedInclusion, setSelectedInclusion] = useState<string | null>(null);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>({ open: false, variant: 'delete', title: '', message: '', confirmLabel: '', onConfirm: () => {} });
  const openConfirm = (cfg: Omit<ConfirmState, 'open'>) => setConfirmState({ ...cfg, open: true });
  const closeConfirm = () => setConfirmState(prev => ({ ...prev, open: false }));

  const handleViewComments = (inclusionId: string) => {
    setSelectedInclusion(inclusionId);
    setShowCommentsModal(true);
  };

  const deleteTeamInclusionMutation = useMutation({
    mutationFn: async (id: string) => {
      // apiRequest já lança em resposta não-ok (com .status/.body)
      await apiRequest("DELETE", `/api/team-inclusions/${id}`);
      return { success: true };
    },
    onSuccess: () => {
      toast({ variant: "success", title: "Inclusão removida" });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    },
    onError: (err: unknown) => {
      toast({
        title: apiErrorStatus(err) === 401 ? "Sessão expirada" : "Não foi possível remover a inclusão",
        description: apiErrorMessage(err, "Tente de novo em instantes."),
        variant: "destructive",
      });
    },
  });

  const handleDelete = (inclusionId: string) => {
    openConfirm({
      variant: 'delete',
      title: 'Remover inclusão?',
      message: 'Esta ação não pode ser desfeita.',
      confirmLabel: 'Remover',
      onConfirm: () => { closeConfirm(); deleteTeamInclusionMutation.mutate(inclusionId); },
    });
  };

  // Contrato 23/09: cancelar é `POST /api/team-inclusions/:id/cancel` (o
  // servidor decide a transição; 409 já cancelada; 403 com passagem emitida,
  // só o administrador). `logisticaParaRevisar` = passagem/hospedagem já
  // registradas — Compras precisa saber.
  const cancelEscalationMutation = useMutation({
    mutationFn: async (id: string): Promise<{ message?: string; inclusion?: TeamInclusion; logisticaParaRevisar?: boolean }> => {
      const response = await apiRequest("POST", `/api/team-inclusions/${id}/cancel`, {});
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        variant: "success",
        title: "Vaga cancelada",
        description: data?.logisticaParaRevisar
          ? "Passagem ou hospedagem já registradas — Compras deve revisar a logística."
          : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    },
    onError: (err: unknown) => {
      toast({
        title: apiErrorStatus(err) === 401 ? "Sessão expirada" : "Não foi possível cancelar a escalação",
        description: apiErrorMessage(err, "Tente de novo em instantes."),
        variant: "destructive",
      });
    },
  });

  const handleCancelEscalation = (inclusionId: string) => {
    openConfirm({
      variant: 'cancel',
      title: 'Cancelar escalação?',
      message: 'Esta ação não pode ser desfeita.',
      confirmLabel: 'Cancelar escalação',
      onConfirm: () => { closeConfirm(); cancelEscalationMutation.mutate(inclusionId); },
    });
  };

  const handleBulkDelete = () => {
    if (selectedRows.size === 0) {
      toast({ title: "Nenhuma seleção", description: "Selecione pelo menos uma inclusão para excluir.", variant: "destructive" });
      return;
    }

    const deletableIds = Array.from(selectedRows).filter(id => {
      const inclusion = inclusionById.get(id);
      return !!inclusion && canDeleteInclusion(inclusion) && !isEventLocked(inclusion);
    });

    if (deletableIds.length === 0) {
      toast({ title: "Não é possível excluir", description: "Nenhuma das inclusões selecionadas pode ser excluída (já foram confirmadas ou compradas).", variant: "destructive" });
      return;
    }

    const blockedCount = selectedRows.size - deletableIds.length;
    const confirmMessage = blockedCount > 0
      ? `${deletableIds.length} de ${selectedRows.size} inclusões podem ser excluídas. ${blockedCount} não podem ser excluídas (confirmadas/compradas). Deseja continuar?`
      : `${deletableIds.length} inclusão(ões) serão removidas permanentemente.`;

    openConfirm({
      variant: 'delete',
      title: 'Remover inclusões?',
      message: confirmMessage,
      confirmLabel: 'Remover',
      onConfirm: async () => {
        closeConfirm();
        let successCount = 0;
        let errorCount = 0;
        for (const id of deletableIds) {
          try {
            await apiRequest("DELETE", `/api/team-inclusions/${id}`);
            successCount++;
          } catch { errorCount++; }
        }
        queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
        setSelectedRows(new Set());
        toast({
          title: errorCount === 0 ? "Inclusões excluídas" : (successCount > 0 ? "Concluído parcialmente" : "Nenhuma inclusão excluída"),
          description: `${successCount} inclusão(ões) excluída(s). ${errorCount > 0 ? `${errorCount} não foi(ram) excluída(s).` : ''}`,
          variant: errorCount > 0 ? "destructive" : "success",
        });
      },
    });
  };

  const handleBulkCancel = () => {
    if (selectedRows.size === 0) {
      toast({ title: "Nenhuma seleção", description: "Selecione pelo menos uma inclusão para cancelar.", variant: "destructive" });
      return;
    }

    // Evento encerrado: o servidor recusaria com 403 — não tenta
    const cancelableIds = Array.from(selectedRows).filter(id => {
      const inclusion = inclusionById.get(id);
      return !!inclusion && !isEventLocked(inclusion);
    });
    if (cancelableIds.length === 0) {
      toast({ title: "Evento encerrado", description: PAST_EVENT_BLOCK_MSG, variant: "destructive" });
      return;
    }

    openConfirm({
      variant: 'cancel',
      title: 'Cancelar escalações?',
      message: `${cancelableIds.length} escalação(ões) selecionada(s) serão canceladas. Esta ação não pode ser desfeita.`,
      confirmLabel: 'Cancelar escalações',
      onConfirm: async () => {
        closeConfirm();
        let successCount = 0;
        let errorCount = 0;
        let logisticaCount = 0;
        for (const id of cancelableIds) {
          try {
            const r = await apiRequest("POST", `/api/team-inclusions/${id}/cancel`, {});
            const body = await r.json().catch(() => ({}));
            if (body?.logisticaParaRevisar) logisticaCount++;
            successCount++;
          } catch { errorCount++; }
        }
        queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
        setSelectedRows(new Set());
        toast({
          title: errorCount === 0 ? "Vagas canceladas" : (successCount > 0 ? "Concluído parcialmente" : "Nenhuma vaga cancelada"),
          description: `${successCount} vaga(s) cancelada(s). ${errorCount > 0 ? `${errorCount} não foi(ram) cancelada(s).` : ''}${logisticaCount > 0 ? ` ${logisticaCount} com passagem/hospedagem registradas — Compras deve revisar.` : ''}`,
          variant: errorCount > 0 ? "destructive" : "success",
        });
      },
    });
  };

  const aoCopiarId = useCallback(async (text: string) => {
    // Só avisa "copiado" depois de realmente copiar — a API falha em contexto
    // não seguro e o toast mentia para o usuário.
    try {
      await navigator.clipboard.writeText(text);
      toast({ variant: "success", title: "ID copiado", description: "Já está na área de transferência." });
    } catch {
      toast({ title: "Não foi possível copiar", description: `Copie manualmente: ${text}`, variant: "destructive" });
    }
  }, [toast]);

  return {
    selectedInclusion, showCommentsModal, setShowCommentsModal, handleViewComments,
    confirmState, closeConfirm, handleDelete, handleCancelEscalation, handleBulkDelete, handleBulkCancel, aoCopiarId,
  };
}

export type InclusionActions = ReturnType<typeof useInclusionActions>;
