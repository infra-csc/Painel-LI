/**
 * Edição de UMA inclusão (25/09 — extraída da tabela): estado do modal, dias
 * trabalhados, PATCH e a proteção de descarte.
 */
import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TeamInclusion, InsertTeamInclusion } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage, apiErrorStatus } from "@/lib/api-error";
import { useConfirmarDescarte } from "@/lib/use-confirmar-descarte";
import { generateDaysInRange, normDay } from "./inclusion-shared";

export function useEditInclusion(inclusionById: Map<string, TeamInclusion>) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingInclusion, setEditingInclusion] = useState<TeamInclusion | null>(null);
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editSelectedDays, setEditSelectedDays] = useState<Set<string>>(new Set());
  // O formulário de edição é não controlado (FormData): a "sujeira" vem de
  // qualquer `change` no <form> ou de clique nos dias — protege o Esc/clique fora.
  const [editDirty, setEditDirty] = useState(false);

  const handleEdit = (inclusionId: string) => {
    const inclusion = inclusionById.get(inclusionId);
    if (inclusion) {
      const start = normDay(inclusion.scheduleStartDate) || "";
      const end = normDay(inclusion.scheduleEndDate) || "";
      setEditStartDate(start);
      setEditEndDate(end);
      // Normalize workDays para garantir formato YYYY-MM-DD
      const normalizedWorkDays = (inclusion.workDays || []).map(normDay).filter(Boolean);
      if (normalizedWorkDays.length > 0) {
        setEditSelectedDays(new Set(normalizedWorkDays));
      } else {
        // Nenhum workDay salvo — seleciona o range completo
        setEditSelectedDays(new Set(generateDaysInRange(start, end)));
      }
      setEditingInclusion(inclusion);
      setEditDirty(false);
      setShowEditModal(true);
    }
  };

  const fecharEdicao = useCallback(() => {
    setShowEditModal(false);
    setEditingInclusion(null);
    setEditDirty(false);
  }, []);

  const updateTeamInclusionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertTeamInclusion> }) => {
      const response = await apiRequest("PATCH", `/api/team-inclusions/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({ variant: "success", title: "Inclusão atualizada" });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
      setShowEditModal(false);
      setEditingInclusion(null);
    },
    onError: (err: unknown) => {
      toast({
        title: apiErrorStatus(err) === 401 ? "Sessão expirada" : "Não foi possível atualizar a inclusão",
        description: apiErrorMessage(err, "Tente de novo em instantes."),
        variant: "destructive",
      });
    },
  });

  /** Mudou uma das datas: recalcula os dias mantendo o que ainda cabe no intervalo. */
  const changeStartDate = (newStart: string) => {
    // Antes o recálculo dos dias acontecia DENTRO do updater de
    // outro setState (função impura, executada duas vezes em dev).
    setEditStartDate(newStart);
    if (newStart && editEndDate) {
      const allDays = generateDaysInRange(newStart, editEndDate);
      setEditSelectedDays(prev => {
        const kept = allDays.filter(d => prev.has(d));
        return new Set(kept.length > 0 ? kept : allDays);
      });
    }
  };
  const changeEndDate = (newEnd: string) => {
    setEditEndDate(newEnd);
    if (editStartDate && newEnd) {
      const allDays = generateDaysInRange(editStartDate, newEnd);
      setEditSelectedDays(prev => {
        const kept = allDays.filter(d => prev.has(d));
        return new Set(kept.length > 0 ? kept : allDays);
      });
    }
  };
  const selectAllDays = (allDays: string[]) => { setEditDirty(true); setEditSelectedDays(new Set(allDays)); };
  const selectNoDays = () => { setEditDirty(true); setEditSelectedDays(new Set()); };
  const toggleDay = (day: string) => {
    setEditDirty(true);
    setEditSelectedDays(prev => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day); else next.add(day);
      return next;
    });
  };

  const submit = (formData: FormData) => {
    if (!editingInclusion) return;
    const selectedDaysArr = Array.from(editSelectedDays).sort();
    const derivedStart = selectedDaysArr.length > 0 ? selectedDaysArr[0] : editStartDate;
    const derivedEnd = selectedDaysArr.length > 0 ? selectedDaysArr[selectedDaysArr.length - 1] : editEndDate;
    const data = {
      functionId: formData.get('functionId') as string,
      // `status` NÃO vai no corpo (23/09): o select do modal não tinha
      // planejado/aprovado/escalacao e gravava o valor inexistente
      // "incluido". O status é só do fluxo no servidor.
      // `dailyRates` não vai no corpo (contrato 23/09): o servidor
      // calcula = workDays.length.
      needsTicket: formData.get('needsTicket') === 'true',
      needsAccommodation: formData.get('needsAccommodation') === 'true',
      scheduleStartDate: derivedStart,
      scheduleEndDate: derivedEnd,
      workDays: selectedDaysArr,
      flightDepartureDate: formData.get('ida') as string || null,
      flightArrivalSuggestedTime: formData.get('chegada') as string || null,
      flightReturnDate: formData.get('retorno') as string || null,
      flightReturnSuggestedTime: formData.get('horarioRetorno') as string || null,
      collaboratorId: editingInclusion.collaboratorId,
      eventId: editingInclusion.eventId,
      area: editingInclusion.area,
    };
    updateTeamInclusionMutation.mutate({ id: editingInclusion.id, data });
  };

  const descarteEdicao = useConfirmarDescarte(editDirty, { salvando: updateTeamInclusionMutation.isPending });

  return {
    showEditModal, editingInclusion, editStartDate, editEndDate, editSelectedDays, setEditDirty,
    handleEdit, fecharEdicao, changeStartDate, changeEndDate, selectAllDays, selectNoDays, toggleDay, submit,
    isPending: updateTeamInclusionMutation.isPending, descarteEdicao,
  };
}

export type EditInclusion = ReturnType<typeof useEditInclusion>;
