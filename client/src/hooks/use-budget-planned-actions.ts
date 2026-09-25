/**
 * Ações (mutations) do Planejado — 25/09 (modularização).
 *
 * Extraído de budget-planned.tsx: enviar para o Realizado (individual e lote,
 * com sucesso parcial), marcar/restaurar "não participou" e aplicar valores
 * padrão. Também guarda o estado dos diálogos que essas ações fecham
 * (confirmação de envio, ausência, restauração), porque os `onSuccess` os
 * resetam — mantê-los na página exigiria repassar setters em cadeia.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { apiRequest } from "@/lib/queryClient";
import type { BudgetActual, BudgetPlanned as BudgetPlannedRow } from "@shared/schema";
import type { CalculatedBudget, ConfirmSend, NotAttendedModalState, RestoreModalState } from "@/components/budget/types";
import { CHAVE_CONTROLE_RH } from "@/components/rh/prestacao-utils";

export interface EntradaDasAcoesDoPlanejado {
  selectedEventId: string;
  userId: string | undefined;
  allBudgetPlanned: BudgetPlannedRow[] | undefined;
  calculatedBudgets: CalculatedBudget[];
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  sentToActual: Set<string>;
  isCardNotAttended: (b: CalculatedBudget) => boolean;
  clearDraftEntries: (ids: string[]) => void;
}

type Enviado = { id: string; result: BudgetActual };

export function useBudgetPlannedActions(e: EntradaDasAcoesDoPlanejado) {
  const { selectedEventId, userId, allBudgetPlanned, calculatedBudgets, selectedIds, setSelectedIds, sentToActual, isCardNotAttended, clearDraftEntries } = e;
  const { toast } = useToast();
  const qc = useQueryClient();

  // Confirmação de envio unificada (cards, envio individual e planilha)
  const [confirmSend, setConfirmSend] = useState<ConfirmSend | null>(null);
  const [notAttendedModal, setNotAttendedModal] = useState<NotAttendedModalState | null>(null);
  const [notAttendedReason, setNotAttendedReason] = useState("");
  const [restoreModal, setRestoreModal] = useState<RestoreModalState | null>(null);
  const [isApplyingDefaults, setIsApplyingDefaults] = useState(false);

  const toggleNotAttendedMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/budget-planned/${id}/toggle-not-attended`, { reason });
      return res.json();
    },
    onSuccess: (data: BudgetPlannedRow, { id }) => {
      qc.invalidateQueries({ queryKey: ["/api/budget-planned", selectedEventId] });
      qc.invalidateQueries({ queryKey: ["/api/budget-comparison"] });
      qc.invalidateQueries({ queryKey: [CHAVE_CONTROLE_RH] });
      setNotAttendedModal(null);
      setNotAttendedReason("");
      if (data.didNotAttend) {
        // Remove de seleção se estava selecionado
        const plan = allBudgetPlanned?.find(p => p.id === id);
        const budget = plan && calculatedBudgets.find(b => b.inclusion.collaboratorId === plan.collaboratorId && b.inclusion.functionId === plan.functionId);
        if (budget) setSelectedIds(prev => { const s = new Set(Array.from(prev)); s.delete(budget.inclusion.id); return s; });
        toast({ title: "Colaborador marcado como não participou" });
      } else {
        toast({ title: "Participação restaurada", variant: "success" });
      }
    },
    onError: (err: unknown) => toast({ title: "Não foi possível atualizar a participação", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" }),
  });

  const createAndMarkNotAttendedMutation = useMutation({
    mutationFn: async ({ budget, reason }: { budget: CalculatedBudget; reason: string }) => {
      // Dias persistidos = dias que efetivamente recebem diária (casa: só fds)
      const totalDias = budget.diasComDiaria ?? (budget.weekdays + budget.weekends);
      const weightedDailyValue = totalDias > 0
        ? Math.round(budget.subtotalDiarias / totalDias)
        : budget.valorDiaria;
      const plannedData = {
        eventId: budget.inclusion.eventId,
        collaboratorId: budget.inclusion.collaboratorId,
        functionId: budget.inclusion.functionId,
        collaboratorType: budget.collaborator?.type || "freela",
        dailyQuantity: totalDias,
        dailyValue: weightedDailyValue,
        costAssistance: 0,
        weekdayLunch: budget.almocoSemana,
        weekdayDinner: budget.jantarSemana,
        weekendLunch: budget.almocoFds,
        weekendDinner: budget.jantarFds,
        mobility: budget.mobilidade,
        mobilityIda: budget.mobilidadeIda,
        mobilityVolta: budget.mobilidadeVolta,
        transport: 0,
        totalValue: budget.totalFinal,
        createdBy: userId,
      };
      const res = await apiRequest("POST", "/api/budget-planned", plannedData);
      const created = await res.json();
      const toggleRes = await apiRequest("POST", `/api/budget-planned/${created.id}/toggle-not-attended`, { reason });
      return toggleRes.json();
    },
    onSuccess: (_, { budget }) => {
      qc.invalidateQueries({ queryKey: ["/api/budget-planned", selectedEventId] });
      qc.invalidateQueries({ queryKey: [CHAVE_CONTROLE_RH] });
      setNotAttendedModal(null);
      setNotAttendedReason("");
      setSelectedIds(prev => { const s = new Set(Array.from(prev)); s.delete(budget.inclusion.id); return s; });
      toast({ title: "Colaborador marcado como não participou" });
    },
    onError: (err: unknown) => toast({ title: "Não foi possível marcar como não participou", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" }),
  });

  const savePlannedAndSendToActual = async (budget: CalculatedBudget, obsLabel: string): Promise<Enviado> => {
    // Dias persistidos = dias que efetivamente recebem diária (casa: só fds);
    // Realizado/Comparativo leem dailyQuantity.
    const totalDias = budget.diasComDiaria;
    const weightedDailyValue = totalDias > 0
      ? Math.round(budget.subtotalDiarias / totalDias)
      : budget.valorDiaria;
    const plannedData = {
      eventId: budget.inclusion.eventId,
      collaboratorId: budget.inclusion.collaboratorId,
      functionId: budget.inclusion.functionId,
      collaboratorType: budget.collaborator?.type || "freela",
      dailyQuantity: totalDias,
      dailyValue: weightedDailyValue,
      costAssistance: 0,
      weekdayLunch: budget.almocoSemana,
      weekdayDinner: budget.jantarSemana,
      weekendLunch: budget.almocoFds,
      weekendDinner: budget.jantarFds,
      mobility: budget.mobilidade,
      mobilityIda: budget.mobilidadeIda,
      mobilityVolta: budget.mobilidadeVolta,
      transport: 0,
      totalValue: budget.totalFinal,
      createdBy: userId,
    };

    // Reutiliza registro planejado já existente (ex: marcado como "não participou" antes de enviar)
    const existingPlan = allBudgetPlanned?.find(
      p => p.collaboratorId === budget.inclusion.collaboratorId && p.functionId === budget.inclusion.functionId
    );

    let savedPlanned: BudgetPlannedRow;
    if (existingPlan) {
      const patchRes = await apiRequest("PATCH", `/api/budget-planned/${existingPlan.id}`, {
        ...plannedData,
        didNotAttend: existingPlan.didNotAttend,
        didNotAttendReason: existingPlan.didNotAttendReason,
      });
      savedPlanned = await patchRes.json();
    } else {
      const plannedRes = await apiRequest("POST", "/api/budget-planned", plannedData);
      savedPlanned = await plannedRes.json();
    }

    const actualRes = await apiRequest("POST", "/api/budget-actual", {
      ...plannedData,
      plannedId: savedPlanned.id,
      paymentStatus: "pendente",
      observations: obsLabel,
    });
    return { id: budget.inclusion.id, result: await actualRes.json() };
  };

  // Resposta imediata após o envio SEM estado paralelo: grava o registro
  // criado no cache de `existingActuals` (fonte única de `sentToActual`) e a
  // invalidação logo depois confirma com o servidor.
  const marcarEnviados = (enviados: Enviado[]) => {
    const novos = enviados.map(x => x.result).filter(r => r && r.collaboratorId);
    if (novos.length === 0) return;
    qc.setQueryData<BudgetActual[]>(["/api/budget-actual", selectedEventId], (old) => [...(old ?? []), ...novos]);
  };

  const sendToActualMutation = useMutation({
    mutationFn: async (budget: CalculatedBudget) => {
      return savePlannedAndSendToActual(budget, "Enviado do planejado");
    },
    onSuccess: (data, variables) => {
      marcarEnviados([data]);
      clearDraftEntries([data.id]);
      setConfirmSend(null);
      const wasEdited = !!variables.hasOverride;
      // O envio individual JÁ cria o registro no Realizado — o texto diz isso.
      toast({
        title: "Enviado para o Realizado!",
        description: wasEdited
          ? "Enviado para a prestação de contas — os valores editados foram junto."
          : "Os valores calculados foram enviados para a prestação de contas.",
      });
      qc.invalidateQueries({ queryKey: ["/api/budget-actual"] });
      qc.invalidateQueries({ queryKey: ["/api/budget-planned"] });
      qc.invalidateQueries({ queryKey: [CHAVE_CONTROLE_RH] });
    },
    onError: () => {
      toast({ title: "Erro ao enviar", description: "Não foi possível enviar para o Realizado.", variant: "destructive" });
    },
  });

  const sendSelectedToActualMutation = useMutation({
    mutationFn: async () => {
      // "Não participou" NUNCA vai para o Realizado, mesmo se um id ausente
      // sobrou na seleção por algum caminho antigo.
      const toSend = calculatedBudgets.filter(b =>
        selectedIds.has(b.inclusion.id) && !sentToActual.has(b.inclusion.id) && !isCardNotAttended(b)
      );
      const results: Enviado[] = [];
      let failedCount = 0;
      for (const budget of toSend) {
        try {
          results.push(await savePlannedAndSendToActual(budget, "Enviado do planejado (lote)"));
        } catch {
          failedCount++;
        }
      }
      if (failedCount > 0) {
        // Propaga os sucessos parciais para o onError registrá-los mesmo com falhas
        throw Object.assign(new Error("Envio parcial"), { sent: results, failedCount });
      }
      return results;
    },
    onSuccess: (data) => {
      marcarEnviados(data);
      clearDraftEntries(data.map(d => d.id));
      setSelectedIds(new Set());
      setConfirmSend(null);
      toast({ title: "Planejamento enviado com sucesso!", description: `${data.length} ${data.length === 1 ? "colaborador enviado" : "colaboradores enviados"} para a prestação de contas.` });
      qc.invalidateQueries({ queryKey: ["/api/budget-actual"] });
      qc.invalidateQueries({ queryKey: ["/api/budget-planned"] });
      qc.invalidateQueries({ queryKey: [CHAVE_CONTROLE_RH] });
    },
    onError: (err) => {
      // Erro "Envio parcial" montado acima com os sucessos anexados.
      const parcial = err as Partial<{ sent: Enviado[]; failedCount: number }>;
      const sent = parcial.sent ?? [];
      const failedCount = parcial.failedCount ?? 0;
      if (sent.length > 0) {
        // Sucessos parciais contam: marca como enviados e tira da seleção para
        // que uma nova tentativa reenvie apenas os que falharam.
        marcarEnviados(sent);
        clearDraftEntries(sent.map(d => d.id));
        setSelectedIds(prev => { const s = new Set(Array.from(prev)); sent.forEach(d => s.delete(d.id)); return s; });
        qc.invalidateQueries({ queryKey: ["/api/budget-actual"] });
        qc.invalidateQueries({ queryKey: ["/api/budget-planned"] });
        qc.invalidateQueries({ queryKey: [CHAVE_CONTROLE_RH] });
      }
      toast({
        title: "Erro ao enviar",
        description: sent.length > 0
          ? `${sent.length} de ${sent.length + failedCount} enviados com sucesso; ${failedCount} ${failedCount === 1 ? "falhou" : "falharam"}. Tente novamente para reenviar os pendentes.`
          : "Não foi possível enviar para o Realizado.",
        variant: "destructive",
      });
    },
  });

  const handleApplyDefaults = async () => {
    setIsApplyingDefaults(true);
    try {
      // Contrato 23/09: o servidor exige o evento (400 sem `eventId`).
      if (!selectedEventId) {
        toast({ title: "Selecione um evento", description: "Os padrões são aplicados por evento.", variant: "destructive" });
        return;
      }
      const res = await apiRequest("POST", `/api/budget-planned/apply-defaults?eventId=${selectedEventId}`, {});
      const data = await res.json();
      const count = data.updated ?? 0;
      qc.invalidateQueries({ queryKey: ["/api/budget-planned"] });
      qc.invalidateQueries({ queryKey: [CHAVE_CONTROLE_RH] });
      toast({
        title: count > 0 ? `${count} planejamento${count !== 1 ? "s" : ""} atualizado${count !== 1 ? "s" : ""}` : "Nenhum planejamento pendente",
        description: count > 0
          ? "Valores padrão aplicados aos orçamentos ainda não enviados."
          : "Todos os orçamentos já foram enviados ou não há registros pendentes.",
      });
    } catch (err) {
      toast({ title: "Não foi possível aplicar os valores", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" });
    } finally {
      setIsApplyingDefaults(false);
    }
  };

  return {
    confirmSend, setConfirmSend,
    notAttendedModal, setNotAttendedModal, notAttendedReason, setNotAttendedReason,
    restoreModal, setRestoreModal,
    isApplyingDefaults, handleApplyDefaults,
    toggleNotAttendedMutation, createAndMarkNotAttendedMutation,
    sendToActualMutation, sendSelectedToActualMutation,
  };
}

export type AcoesDoPlanejado = ReturnType<typeof useBudgetPlannedActions>;

export default useBudgetPlannedActions;
