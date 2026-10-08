/**
 * Grade de diárias em lote (25/09 — extraída da tabela): alvos, dias por vaga,
 * PATCH em lote (só `workDays`) e a proteção de descarte.
 */
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TeamInclusion } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage, apiErrorStatus } from "@/lib/api-error";
import { useConfirmarDescarte } from "@/lib/use-confirmar-descarte";
import { diasDoLoteMudaram, savedOrRangeDays } from "./inclusion-shared";
import type { TeamInclusionData } from "./use-team-inclusion-data";

export function useBulkDays(data: Pick<TeamInclusionData, "inclusionById" | "selectedRows" | "filteredAndSortedInclusions" | "isEventLocked">) {
  const { inclusionById, selectedRows, filteredAndSortedInclusions, isEventLocked } = data;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showBatchDiarias, setShowBatchDiarias] = useState(false);
  // inclusionId → array de dias selecionados (YYYY-MM-DD)
  const [batchDiariasSelections, setBatchDiariasSelections] = useState<Record<string, string[]>>({});
  const [batchTargetIds, setBatchTargetIds] = useState<string[]>([]);
  // Os dias com que cada vaga ABRIU no diálogo: a régua do "alterada".
  const [batchInitial, setBatchInitial] = useState<Record<string, string[]>>({});

  const openBatchDiarias = () => {
    // Usa as linhas selecionadas com checkbox; se nenhuma, usa todas as filtradas
    // Evento encerrado fica de fora: o PATCH das diárias tomaria 403
    const editaveis = filteredAndSortedInclusions.filter(inc => !isEventLocked(inc));
    const targets = selectedRows.size > 0
      ? editaveis.filter(inc => selectedRows.has(inc.id))
      : editaveis;

    const initial: Record<string, string[]> = {};
    targets.forEach(inc => { initial[inc.id] = savedOrRangeDays(inc); });
    setBatchDiariasSelections(initial);
    setBatchInitial(initial);
    setBatchTargetIds(targets.map(i => i.id));
    setShowBatchDiarias(true);
  };

  const toggleBatchDay = (inclusionId: string, day: string) => {
    setBatchDiariasSelections(prev => {
      const cur = prev[inclusionId] ?? [];
      const next = cur.includes(day) ? cur.filter(d => d !== day) : [...cur, day];
      return { ...prev, [inclusionId]: next };
    });
  };
  const setDays = (inclusionId: string, days: string[]) => setBatchDiariasSelections(prev => ({ ...prev, [inclusionId]: days }));

  // Contrato 23/09: só `workDays` vai no PATCH — o servidor calcula
  // `dailyRates = workDays.length` (nada de status/phase/dailyRates no corpo).
  const batchSaveDiariasMutation = useMutation({
    mutationFn: async (changes: Array<{ id: string; dailyRates: number; workDays: string[] }>) => {
      await Promise.all(
        changes.map(({ id, workDays }) =>
          apiRequest("PATCH", `/api/team-inclusions/${id}`, { workDays }).then(r => r.json())
        )
      );
    },
    onSuccess: () => {
      toast({ title: "Diárias salvas", description: "Todas as alterações foram aplicadas." });
      setShowBatchDiarias(false);
    },
    onError: (err: unknown) => {
      toast({
        title: apiErrorStatus(err) === 401 ? "Sessão expirada" : "Não foi possível salvar as diárias",
        // Promise.all: parte das linhas pode ter sido gravada antes da falha
        description: apiErrorMessage(err, "Erro ao salvar as diárias. Algumas linhas podem ter sido gravadas — confira a lista."),
        variant: "destructive",
      });
    },
    // Invalida em qualquer desfecho: no erro parcial a tela ficava com dados velhos
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    },
  });

  // Alterada = os dias marcados diferem dos que o diálogo abriu (não do
  // `workDays` salvo): sem edição, nenhuma vaga é marcada nem regravada.
  const changedIds = useMemo(
    () => new Set(batchTargetIds.filter(id => diasDoLoteMudaram(batchInitial[id] ?? [], batchDiariasSelections[id] ?? []))),
    [batchTargetIds, batchInitial, batchDiariasSelections],
  );

  const handleSaveBatchDiarias = () => {
    const changes: Array<{ id: string; dailyRates: number; workDays: string[] }> = [];
    changedIds.forEach(id => {
      // Resolve na lista completa: mudar o filtro com o modal aberto descartava
      // silenciosamente as linhas que saíam da visão.
      if (!inclusionById.get(id)) return;
      const newDays = [...(batchDiariasSelections[id] ?? [])].sort();
      changes.push({ id, dailyRates: newDays.length, workDays: newDays });
    });
    if (changes.length === 0) {
      toast({ title: "Sem alterações", description: "Nenhum dia foi modificado." });
      return;
    }
    batchSaveDiariasMutation.mutate(changes);
  };

  // A grade em lote está "suja" quando alguma vaga foi alterada no diálogo.
  const batchDirty = changedIds.size > 0;

  const descarteLote = useConfirmarDescarte(batchDirty, { salvando: batchSaveDiariasMutation.isPending });
  const targets = batchTargetIds.map(id => inclusionById.get(id)).filter(Boolean) as TeamInclusion[];
  const fechar = () => setShowBatchDiarias(false);

  return {
    showBatchDiarias, fechar, openBatchDiarias, targets, batchDiariasSelections, changedIds, toggleBatchDay, setDays,
    handleSaveBatchDiarias, isPending: batchSaveDiariasMutation.isPending, descarteLote,
  };
}

export type BulkDays = ReturnType<typeof useBulkDays>;
