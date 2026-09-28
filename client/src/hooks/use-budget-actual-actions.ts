/**
 * Ações (mutations) do Orçamento Realizado — 25/09 (modularização).
 *
 * Extraído de budget-actual.tsx: enviar para revisão, salvar prestação,
 * remover e dividir vaga, com os mesmos toasts e invalidações. Guarda também
 * o estado dos diálogos que essas ações fecham.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { apiRequest } from "@/lib/queryClient";
import type { BudgetActual, InsertBudgetActual } from "@shared/schema";
import { CHAVE_CONTROLE_RH } from "@/components/rh/prestacao-utils";

export function useBudgetActualActions(args: { userId: string | undefined; onSaved: () => void }) {
  const { userId, onSaved } = args;
  const { toast } = useToast();
  const qc = useQueryClient();

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // Confirmação de envio: 'all' = pendentes visíveis no filtro; 'selected' = seleção atual
  const [confirmSend, setConfirmSend] = useState<null | "all" | "selected">(null);
  const [splittingItem, setSplittingItem] = useState<BudgetActual | null>(null);

  const sendForReviewMutation = useMutation({
    mutationFn: async ({ eventId, itemIds }: { eventId: string; itemIds?: string[] }) => {
      const res = await apiRequest("POST", "/api/budget-actual/send-for-review", { eventId, itemIds });
      return res.json();
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["/api/budget-actual", variables.eventId] });
      qc.invalidateQueries({ queryKey: [CHAVE_CONTROLE_RH] });
      toast({
        title: "Enviado para revisão",
        description: "O orçamento realizado foi enviado para conferência e a emissão de NF foi liberada para os itens enviados.",
        variant: "success",
      });
    },
    onError: (err: unknown) => {
      toast({ title: "Não foi possível enviar a prestação", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertBudgetActual> }) => {
      const res = await apiRequest("PATCH", `/api/budget-actual/${id}`, {
        ...data,
        updatedBy: userId,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Prestação salva",
        description: "Os valores foram salvos e já estão atualizados na listagem.",
        variant: "success",
      });
      qc.invalidateQueries({ queryKey: ["/api/budget-actual"] });
      qc.invalidateQueries({ queryKey: [CHAVE_CONTROLE_RH] });
      onSaved();
    },
    onError: (err: unknown) => {
      toast({ title: "Não foi possível atualizar a prestação", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/budget-actual/${id}`);
    },
    onSuccess: () => {
      toast({ variant: "success", title: "Prestação removida" });
      qc.invalidateQueries({ queryKey: ["/api/budget-actual"] });
      qc.invalidateQueries({ queryKey: [CHAVE_CONTROLE_RH] });
      setConfirmDeleteId(null);
    },
    onError: (err: unknown) => {
      toast({ title: "Não foi possível remover a prestação", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" });
    },
  });

  const splitMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) => {
      // O servidor recalcula `totalValue` (do pai e do filho) na divisão
      // (contrato 23/09) — o client não manda nem depende desse campo.
      const { totalValue: _t, parentValues, ...resto } = payload as { totalValue?: number; parentValues?: Record<string, unknown> } & Record<string, unknown>;
      const { totalValue: _pt, ...paiSemTotal } = parentValues ?? {};
      const corpo = { ...resto, parentValues: paiSemTotal };
      const res = await apiRequest("POST", `/api/budget-actual/${id}/split`, corpo);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Vaga dividida", description: "O novo colaborador foi atribuído com sucesso." });
      setSplittingItem(null);
      qc.invalidateQueries({ queryKey: ["/api/budget-actual"] });
      qc.invalidateQueries({ queryKey: [CHAVE_CONTROLE_RH] });
    },
    onError: (err: unknown) => {
      toast({ title: "Não foi possível dividir a vaga", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" });
    },
  });

  return {
    confirmDeleteId, setConfirmDeleteId, confirmSend, setConfirmSend, splittingItem, setSplittingItem,
    sendForReviewMutation, updateMutation, deleteMutation, splitMutation,
  };
}

export type AcoesDoRealizado = ReturnType<typeof useBudgetActualActions>;

export default useBudgetActualActions;
