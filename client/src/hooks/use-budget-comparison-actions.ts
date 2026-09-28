/**
 * Ações do COMPARATIVO (`useComparisonActions`) — 25/09 (modularização).
 *
 * Extraído de budget-comparison.tsx: recálculo automático, decisão do RH por
 * prestação (aprovar/recusar/devolver), aprovação do comparativo com crédito
 * no Flash, ressincronização e reabertura (estorno), edição do Realizado pelo
 * RH — mais o estado dos modais que essas ações abrem e fecham.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { apiRequest } from "@/lib/queryClient";
import { parseBrNumber } from "@/lib/utils";
import type { BudgetActual, BudgetComparison } from "@shared/schema";
import { fmt, type ActionType, type ComparisonRow, type FlashCreditResumo, type SplitDetailState } from "@/components/budget/comparison-utils";
import { CHAVE_CONTROLE_RH } from "@/components/rh/prestacao-utils";

export interface EntradaDasAcoesDoComparativo {
  selectedEventId: string;
  userId: string | undefined;
  comparison: BudgetComparison | null | undefined;
  isLoadingComparison: boolean;
  comparisonData: ComparisonRow[];
  sortedData: ComparisonRow[];
  selectedItems: Set<string>;
  setSelectedItems: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export function useComparisonActions(e: EntradaDasAcoesDoComparativo) {
  const { selectedEventId, userId, comparison, isLoadingComparison, comparisonData, sortedData, selectedItems, setSelectedItems } = e;
  const { toast } = useToast();
  const qc = useQueryClient();

  const [actionModal, setActionModal] = useState<{ type: ActionType } | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [actionNoteError, setActionNoteError] = useState(false);
  const [confirmAdjustOpen, setConfirmAdjustOpen] = useState(false);
  // Reabertura do comparativo aprovado (devolve o comparativo e ESTORNA o Flash)
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenReasonError, setReopenReasonError] = useState(false);
  const [editingActual, setEditingActual] = useState<BudgetActual | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [splitDetail, setSplitDetail] = useState<SplitDetailState | null>(null);

  const calculateMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const res = await apiRequest("POST", `/api/budget-comparison/calculate/${eventId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Comparativo recalculado", variant: "success" });
      qc.invalidateQueries({ queryKey: ["/api/budget-comparison"] });
    },
    onError: (err: unknown) => {
      toast({ title: "Não foi possível recalcular o comparativo", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" });
    },
  });

  const rhActionMutation = useMutation({
    mutationFn: async ({ itemIds, action, comment }: { itemIds: string[]; action: string; comment: string }) => {
      const res = await apiRequest("POST", `/api/budget-actual/rh-action`, {
        itemIds,
        action,
        comment,
        actionBy: userId,
      });
      return res.json();
    },
    onSuccess: (data: { skipped?: unknown[] }, variables) => {
      const labels: Record<string, { title: string; cls: string }> = {
        aprovado: { title: "Prestação aprovada — análise formal do RH", cls: "bg-success-soft border-success/25 text-success" },
        rejeitado: { title: "Prestação recusada", cls: "bg-danger-soft border-danger/25 text-danger" },
        devolvido: { title: "Devolvido para ajustes", cls: "bg-warning-soft border-warning/25 text-warning" },
      };
      const info = labels[variables.action];
      // O servidor pula itens que não estão enviados (ex.: filho de divisão
      // ainda pendente) — sem este aviso, o "sucesso" escondia itens de fora.
      const skipped = Array.isArray(data?.skipped) ? data.skipped.length : 0;
      if (skipped > 0) {
        toast({
          title: `${info?.title || "Ação realizada"} — ${skipped} ${skipped === 1 ? "item ficou de fora" : "itens ficaram de fora"}`,
          description: "Itens ainda não enviados para análise não entram na decisão. Peça o envio no Realizado e decida-os depois.",
          variant: "warning",
        });
      } else {
        toast({ title: info?.title || "Ação realizada", className: info?.cls });
      }
      qc.invalidateQueries({ queryKey: ["/api/budget-actual"] });
      qc.invalidateQueries({ queryKey: ["/api/budget-comparison"] });
      qc.invalidateQueries({ queryKey: [CHAVE_CONTROLE_RH] });
      setActionModal(null);
      setActionNote("");
      setActionNoteError(false);
      setSelectedItems(new Set());
    },
    onError: (err: unknown) => {
      toast({
        title: "Erro ao processar a ação",
        description: apiErrorMessage(err, "Não foi possível concluir a ação do RH. Tente novamente."),
        variant: "destructive",
      });
    },
  });

  // Aprovação do COMPARATIVO (fechamento do evento). Decisão 19/08: é aqui que
  // alimentação e mobilidade de todas as prestações entram na Conta Corrente
  // Flash — a NF/OC depois só documenta. O servidor devolve o resumo em
  // `flashCredit`; se o crédito falhar, a aprovação continua valendo e o toast
  // avisa (política flashSync.ok=false herdada da regra anterior).
  const approveComparisonMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/budget-comparison/${id}/approve`, {});
      return res.json();
    },
    onSuccess: (data: { flashCredit?: FlashCreditResumo }) => {
      qc.invalidateQueries({ queryKey: ["/api/budget-comparison"] });
      qc.invalidateQueries({ queryKey: ["/api/flash-movements"] });
      qc.invalidateQueries({ queryKey: [CHAVE_CONTROLE_RH] });
      const fc = data?.flashCredit;
      if (fc && fc.ok === false) {
        toast({
          title: "Comparativo aprovado — Flash NÃO creditado",
          description: "A aprovação foi salva, mas os créditos de alimentação e mobilidade não entraram na Conta Corrente Flash. Avise o RH e aprove novamente para refazer o crédito.",
          variant: "warning",
        });
        return;
      }
      const n = fc?.movements || 0;
      const pessoas = fc?.collaborators || 0;
      toast({
        title: "Comparativo aprovado",
        description: n > 0
          ? `${n} lançamento${n !== 1 ? "s" : ""} no Flash para ${pessoas} colaborador${pessoas !== 1 ? "es" : ""} — alimentação ${fmt(fc?.alimentacaoCents || 0)} · mobilidade ${fmt(fc?.mobilidadeCents || 0)}.`
          : "Nenhum valor de alimentação ou mobilidade a creditar no Flash neste evento.",
        variant: "success",
      });
    },
    onError: (err: unknown) => {
      toast({
        title: "Erro ao aprovar o comparativo",
        description: apiErrorMessage(err, "Não foi possível aprovar o comparativo. Tente novamente."),
        variant: "destructive",
      });
    },
  });

  // RESSINCRONIZAR o Flash de um comparativo JÁ APROVADO. O Realizado pode
  // mudar depois da aprovação (o RH edita valores aqui mesmo, e o PATCH de
  // /api/budget-actual não trava item aprovado) — sem isto o saldo do Flash
  // ficava defasado sem caminho de correção. A rota /approve é IDEMPOTENTE:
  // reconcilia por (comparativo, prestação, categoria), criando, atualizando e
  // removendo o que mudou; não duplica lançamento nem muda o status.
  const resyncFlashMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/budget-comparison/${id}/approve`, {});
      return res.json();
    },
    onSuccess: (data: { flashCredit?: FlashCreditResumo }) => {
      qc.invalidateQueries({ queryKey: ["/api/budget-comparison"] });
      qc.invalidateQueries({ queryKey: ["/api/flash-movements"] });
      qc.invalidateQueries({ queryKey: [CHAVE_CONTROLE_RH] });
      const fc = data?.flashCredit;
      if (fc && fc.ok === false) {
        toast({
          title: "Flash NÃO ressincronizado",
          description: "A Conta Corrente Flash continua com os valores antigos. Tente de novo em instantes.",
          variant: "destructive",
        });
        return;
      }
      const mudou = (fc?.created || 0) + (fc?.updated || 0) + (fc?.removed || 0);
      toast({
        title: mudou > 0 ? "Flash ressincronizado" : "Flash já estava em dia",
        description: mudou > 0
          ? `${fc?.created || 0} criado(s) · ${fc?.updated || 0} atualizado(s) · ${fc?.removed || 0} removido(s) — alimentação ${fmt(fc?.alimentacaoCents || 0)} · mobilidade ${fmt(fc?.mobilidadeCents || 0)}.`
          : "Nenhum lançamento precisou mudar: a Conta Corrente Flash já reflete o Realizado atual.",
        variant: "success",
      });
    },
    onError: (err: unknown) => {
      toast({
        title: "Erro ao ressincronizar o Flash",
        description: apiErrorMessage(err, "Não foi possível ressincronizar. Tente novamente."),
        variant: "destructive",
      });
    },
  });

  // REABRIR o comparativo aprovado. Usa /return ("devolvido") e não /reject:
  // reabrir é devolver o evento para ajuste, não recusar o trabalho — o RH
  // corrige o Realizado e aprova de novo. O servidor estorna (APAGA) os
  // lançamentos automáticos do Flash daquele evento no mesmo passo.
  // Até 19/08 este era o único caminho de estorno documentado nas mensagens do
  // servidor, mas NENHUM botão o chamava: os do rodapé decidem POR PRESTAÇÃO
  // (/api/budget-actual/rh-action). Este é o botão que faltava.
  const reopenComparisonMutation = useMutation({
    mutationFn: async ({ id, returnReason }: { id: string; returnReason: string }) => {
      const res = await apiRequest("POST", `/api/budget-comparison/${id}/return`, { returnReason });
      return res.json();
    },
    onSuccess: (data: { flashReverse?: FlashCreditResumo }) => {
      qc.invalidateQueries({ queryKey: ["/api/budget-comparison"] });
      qc.invalidateQueries({ queryKey: ["/api/flash-movements"] });
      qc.invalidateQueries({ queryKey: [CHAVE_CONTROLE_RH] });
      setReopenOpen(false);
      setReopenReason("");
      setReopenReasonError(false);
      const fr = data?.flashReverse;
      if (fr && fr.ok === false) {
        toast({
          title: "Comparativo reaberto — Flash NÃO estornado",
          description: "O comparativo voltou para ajuste, mas os lançamentos automáticos continuam na Conta Corrente Flash. Reabra de novo para tentar o estorno.",
          variant: "warning",
        });
        return;
      }
      const n = fr?.removed || 0;
      toast({
        title: "Comparativo reaberto para ajuste",
        description: n > 0
          ? `${n} lançamento${n !== 1 ? "s" : ""} automático${n !== 1 ? "s" : ""} removido${n !== 1 ? "s" : ""} da Conta Corrente Flash. Ao aprovar de novo, o crédito é recriado.`
          : "Não havia lançamento automático no Flash para estornar neste evento.",
        variant: "warning",
      });
    },
    onError: (err: unknown) => {
      toast({
        title: "Erro ao reabrir o comparativo",
        description: apiErrorMessage(err, "Não foi possível reabrir o comparativo. Tente novamente."),
        variant: "destructive",
      });
    },
  });

  const patchActualMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, string | number | null> }) => {
      const res = await apiRequest("PATCH", `/api/budget-actual/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/budget-actual"] });
      qc.invalidateQueries({ queryKey: ["/api/budget-comparison"] });
      qc.invalidateQueries({ queryKey: [CHAVE_CONTROLE_RH] });
      setEditingActual(null);
      toast({ title: "Realizado atualizado pelo RH", variant: "warning" });
    },
    onError: (err: unknown) => toast({ title: "Não foi possível salvar o Realizado", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" }),
  });

  const openEditModal = (actual: BudgetActual) => {
    setEditingActual(actual);
    setEditForm({
      dailyQuantity: String(actual.dailyQuantity),
      dailyValue: (actual.dailyValue / 100).toFixed(2),
      weekdayLunch: (actual.weekdayLunch / 100).toFixed(2),
      weekdayDinner: (actual.weekdayDinner / 100).toFixed(2),
      weekendLunch: (actual.weekendLunch / 100).toFixed(2),
      weekendDinner: (actual.weekendDinner / 100).toFixed(2),
      mobility: (actual.mobility / 100).toFixed(2),
      rhAdjustNote: actual.rhAdjustNote || "",
    });
  };

  const saveEditModal = () => {
    if (!editingActual) return;
    const orig = editingActual;
    // parseBrNumber trata "1.500,00" como 1500 (ponto de milhar + vírgula decimal)
    const toCents = (v: string) => Math.round(parseBrNumber(v) * 100);
    const parsed = {
      dailyQuantity: parseInt(editForm.dailyQuantity) || 0,
      dailyValue: toCents(editForm.dailyValue),
      weekdayLunch: toCents(editForm.weekdayLunch),
      weekdayDinner: toCents(editForm.weekdayDinner),
      weekendLunch: toCents(editForm.weekendLunch),
      weekendDinner: toCents(editForm.weekendDinner),
      mobility: toCents(editForm.mobility),
    };
    // Envia apenas o que foi realmente editado. Recalcular tudo alterava o total em centavos
    // sem o usuário mudar nada (dailyValue é uma média arredondada — qty×dailyValue não
    // reproduz o subtotal de diárias gravado dia a dia).
    const data: Record<string, string | number | null> = { rhAdjustNote: editForm.rhAdjustNote?.trim() || null };
    (Object.keys(parsed) as Array<keyof typeof parsed>).forEach(k => {
      if (parsed[k] !== orig[k]) data[k] = parsed[k];
    });
    const anyNumericChange = Object.keys(data).some(k => k !== "rhAdjustNote");
    if (anyNumericChange) {
      const origMeals = orig.weekdayLunch + orig.weekdayDinner + orig.weekendLunch + orig.weekendDinner;
      const storedDiarias = orig.totalValue - origMeals - orig.mobility - orig.transport;
      const dailyChanged = parsed.dailyQuantity !== orig.dailyQuantity || parsed.dailyValue !== orig.dailyValue;
      const newDaily = dailyChanged ? parsed.dailyQuantity * parsed.dailyValue : storedDiarias;
      const newMeals = parsed.weekdayLunch + parsed.weekdayDinner + parsed.weekendLunch + parsed.weekendDinner;
      data.totalValue = newDaily + newMeals + parsed.mobility + orig.transport;
    }
    // Sem mudança numérica: totalValue original é preservado (não é enviado no PATCH)
    patchActualMutation.mutate({ id: orig.id, data });
  };

  const handleAction = () => {
    if (!actionModal) return;
    // Manual do Financeiro: ao devolver ou recusar, a observação é OBRIGATÓRIA
    // (o responsável de função a recebe na tela do Realizado). No aprovar segue opcional.
    if ((actionModal.type === "reject" || actionModal.type === "return") && !actionNote.trim()) {
      setActionNoteError(true);
      toast({
        title: "Observação obrigatória",
        description: actionModal.type === "reject"
          ? "Para recusar, escreva o motivo da recusa — o responsável de função receberá esta observação."
          : "Para devolver, descreva o que precisa ser corrigido — o responsável de função receberá esta observação.",
        variant: "destructive",
      });
      return;
    }
    const actionMap: Record<string, string> = { approve: "aprovado", reject: "rejeitado", return: "devolvido" };
    const rhAction = actionMap[actionModal.type];
    const selectedActualIds = sortedData
      .filter(row => selectedItems.has(row.actual.id))
      .flatMap(row => {
        const ids: string[] = [row.actual.id];
        if (row.isSplit) ids.push(...row.splitChildren.map(c => c.id));
        return ids;
      });
    if (selectedActualIds.length === 0) return;
    rhActionMutation.mutate({ itemIds: selectedActualIds, action: rhAction, comment: actionNote });
  };

  const fecharActionModal = () => { setActionModal(null); setActionNote(""); setActionNoteError(false); };

  // Guarda contra POSTs de recálculo desnecessários ao navegar: hash por item
  // (`id:totalValue` de cada prestação, inclusive filhos de divisão) — soma agregada
  // perdia edições que se cancelavam entre itens
  const lastCalcHashRef = useRef<string>("");
  // `mutate` é estável no react-query v5; o objeto da mutation inteiro não é.
  const { mutate: calcularComparativo, isPending: calculando } = calculateMutation;
  useEffect(() => {
    if (!selectedEventId || isLoadingComparison || comparisonData.length === 0 || calculando) return;
    const itemsSignature = comparisonData
      .flatMap(r => [r.actual, ...r.splitChildren].map(i => `${i.id}:${i.totalValue}`))
      .sort()
      .join(",");
    const hash = `${selectedEventId}|${itemsSignature}`;
    if (hash === lastCalcHashRef.current) return; // nada mudou desde a última observação
    const isFirstObservationForEvent = !lastCalcHashRef.current.startsWith(`${selectedEventId}|`);
    lastCalcHashRef.current = hash;
    // Calcula quando ainda não existe comparativo; recalcula apenas se os actuals mudaram de fato
    if (!comparison || !isFirstObservationForEvent) {
      calcularComparativo(selectedEventId);
    }
  }, [selectedEventId, comparison, isLoadingComparison, comparisonData, calculando, calcularComparativo]);

  return {
    actionModal, setActionModal, actionNote, setActionNote, actionNoteError, setActionNoteError, fecharActionModal,
    confirmAdjustOpen, setConfirmAdjustOpen,
    reopenOpen, setReopenOpen, reopenReason, setReopenReason, reopenReasonError, setReopenReasonError,
    editingActual, setEditingActual, editForm, setEditForm, splitDetail, setSplitDetail,
    rhActionMutation, approveComparisonMutation, resyncFlashMutation, reopenComparisonMutation, patchActualMutation,
    openEditModal, saveEditModal, handleAction,
  };
}

export type AcoesDoComparativo = ReturnType<typeof useComparisonActions>;

export default useComparisonActions;
