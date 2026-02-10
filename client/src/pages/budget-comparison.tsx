import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  BarChart3, RefreshCw, CheckCircle, XCircle, RotateCcw,
  TrendingUp, TrendingDown, DollarSign, ArrowRight,
  Calendar, MessageSquare,
  ChevronDown, ChevronUp, AlertTriangle, Minus
} from "lucide-react";
import type { Event, Function, Collaborator, BudgetActual, BudgetPlanned, BudgetComparison } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";

export default function BudgetComparisonPage() {
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [actionModal, setActionModal] = useState<{ type: 'approve' | 'reject' | 'return' } | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [sortBy, setSortBy] = useState<'difference' | 'total'>('difference');
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: events } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: functions } = useQuery<Function[]>({ queryKey: ["/api/functions"] });
  const { data: collaborators } = useQuery<Collaborator[]>({ queryKey: ["/api/collaborators"] });

  const { data: comparison } = useQuery<BudgetComparison | null>({
    queryKey: ["/api/budget-comparison", selectedEventId],
    queryFn: async () => {
      if (!selectedEventId) return null;
      const res = await fetch(`/api/budget-comparison?eventId=${selectedEventId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!selectedEventId,
  });

  const { data: budgetPlanned } = useQuery<BudgetPlanned[]>({
    queryKey: ["/api/budget-planned", selectedEventId],
    queryFn: async () => {
      const res = await fetch(`/api/budget-planned?eventId=${selectedEventId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedEventId,
  });

  const { data: budgetActual } = useQuery<BudgetActual[]>({
    queryKey: ["/api/budget-actual", selectedEventId],
    queryFn: async () => {
      const res = await fetch(`/api/budget-actual?eventId=${selectedEventId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedEventId,
  });

  const calculateMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const res = await apiRequest("POST", `/api/budget-comparison/calculate/${eventId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Comparativo recalculado", className: "bg-emerald-50 border-emerald-200 text-emerald-800" });
      qc.invalidateQueries({ queryKey: ["/api/budget-comparison"] });
    },
    onError: () => {
      toast({ title: "Erro ao calcular", variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const res = await apiRequest("POST", `/api/budget-comparison/${id}/approve`, {
        approvedBy: user?.id,
        approvalObservation: note,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Aprovado para faturamento", className: "bg-emerald-50 border-emerald-200 text-emerald-800" });
      qc.invalidateQueries({ queryKey: ["/api/budget-comparison"] });
      setActionModal(null);
      setActionNote("");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const res = await apiRequest("POST", `/api/budget-comparison/${id}/reject`, {
        approvedBy: user?.id,
        rejectionReason: note,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Execução recusada", className: "bg-red-50 border-red-200 text-red-800" });
      qc.invalidateQueries({ queryKey: ["/api/budget-comparison"] });
      setActionModal(null);
      setActionNote("");
    },
  });

  const returnMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const res = await apiRequest("POST", `/api/budget-comparison/${id}/return`, {
        approvedBy: user?.id,
        returnReason: note,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Devolvido para ajustes", className: "bg-amber-50 border-amber-200 text-amber-800" });
      qc.invalidateQueries({ queryKey: ["/api/budget-comparison"] });
      setActionModal(null);
      setActionNote("");
    },
  });

  const handleAction = () => {
    if (!actionModal || !comparison) return;
    const id = comparison.id;
    switch (actionModal.type) {
      case 'approve':
        approveMutation.mutate({ id, note: actionNote });
        break;
      case 'reject':
        if (!actionNote.trim()) { toast({ title: "Informe o motivo da recusa", variant: "destructive" }); return; }
        rejectMutation.mutate({ id, note: actionNote });
        break;
      case 'return':
        if (!actionNote.trim()) { toast({ title: "Informe o motivo da devolução", variant: "destructive" }); return; }
        returnMutation.mutate({ id, note: actionNote });
        break;
    }
  };

  const formatCurrency = (cents: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

  const getCollaboratorName = (id?: string | null) =>
    id ? collaborators?.find(c => c.id === id)?.fullName || "-" : "-";

  const getFunctionName = (id?: string | null) =>
    id ? functions?.find(f => f.id === id)?.name || "-" : "-";

  const selectedEvent = events?.find(e => e.id === selectedEventId);

  const comparisonData = useMemo(() => {
    if (!budgetPlanned || !budgetActual) return [];

    const sentActual = budgetActual.filter(a => a.sentForReview);

    const data: Array<{
      collaboratorId: string | null;
      collaboratorType: string | null;
      functionId: string | null;
      planned: BudgetPlanned | null;
      actual: BudgetActual;
      variance: number;
    }> = [];

    sentActual.forEach(a => {
      const matchingPlanned = a.plannedId
        ? budgetPlanned.find(p => p.id === a.plannedId)
        : budgetPlanned.find(p => p.collaboratorId === a.collaboratorId && p.functionId === a.functionId && p.eventId === a.eventId);

      data.push({
        collaboratorId: a.collaboratorId,
        collaboratorType: a.collaboratorType,
        functionId: a.functionId,
        planned: matchingPlanned || null,
        actual: a,
        variance: matchingPlanned ? (a.totalValue - matchingPlanned.totalValue) : a.totalValue,
      });
    });

    return data;
  }, [budgetPlanned, budgetActual]);

  const sortedData = useMemo(() => {
    const sorted = [...comparisonData];
    if (sortBy === 'difference') {
      sorted.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
    } else {
      sorted.sort((a, b) => b.actual.totalValue - a.actual.totalValue);
    }
    return sorted;
  }, [comparisonData, sortBy]);

  const totals = useMemo(() => {
    if (comparison && comparison.totalPlanned > 0) {
      return {
        totalPlanned: comparison.totalPlanned,
        totalActual: comparison.totalActual,
        difference: comparison.totalActual - comparison.totalPlanned,
      };
    }
    const totalPlanned = comparisonData.reduce((s, r) => s + (r.planned?.totalValue || 0), 0);
    const totalActual = comparisonData.reduce((s, r) => s + r.actual.totalValue, 0);
    return { totalPlanned, totalActual, difference: totalActual - totalPlanned };
  }, [comparisonData, comparison]);

  const toggleExpand = (idx: number) => {
    setExpandedCards(prev => {
      const s = new Set(prev);
      if (s.has(idx)) s.delete(idx); else s.add(idx);
      return s;
    });
  };

  const statusConfig: Record<string, { label: string; color: string; bg: string; border: string; icon: string }> = {
    pendente: { label: "Aguardando aprovação", color: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200", icon: "🟡" },
    devolvido: { label: "Devolvido para ajustes", color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", icon: "🔄" },
    aprovado: { label: "Aprovado para faturamento", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", icon: "🟢" },
    rejeitado: { label: "Recusado", color: "text-red-700", bg: "bg-red-50", border: "border-red-200", icon: "🔴" },
  };

  const currentStatus = comparison?.status || "pendente";
  const statusInfo = statusConfig[currentStatus] || statusConfig.pendente;
  const isReadOnly = currentStatus === "aprovado" || currentStatus === "rejeitado";

  const formatDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const rhComment = comparison?.approvalObservation || comparison?.rejectionReason || comparison?.returnReason;

  const CompareRow = ({ label, plannedVal, actualVal, isDifferent }: { label: string; plannedVal: string; actualVal: string; isDifferent?: boolean }) => (
    <div className={`flex items-center text-[11px] py-1.5 px-2 rounded ${isDifferent ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''}`}>
      <div className={`w-[35%] ${isDifferent ? 'text-gray-700 dark:text-gray-200 font-medium' : 'text-gray-400 dark:text-gray-500'}`}>
        {label}
      </div>
      <div className={`w-[28%] text-right tabular-nums ${isDifferent ? 'text-gray-600' : 'text-gray-400'}`}>{plannedVal}</div>
      <div className="w-[6%] flex justify-center">
        {isDifferent
          ? <ArrowRight className="w-3 h-3 text-amber-400" />
          : <Minus className="w-2.5 h-2.5 text-gray-200" />
        }
      </div>
      <div className={`w-[28%] text-right tabular-nums ${isDifferent ? 'font-semibold text-gray-800 dark:text-gray-100' : 'text-gray-400'}`}>{actualVal}</div>
      {isDifferent && <div className="w-[3%] flex justify-end"><AlertTriangle className="w-3 h-3 text-amber-400" /></div>}
    </div>
  );

  const isValDiff = (a: number | undefined, b: number | undefined) => (a || 0) !== (b || 0);

  return (
    <div className="space-y-5 max-w-5xl mx-auto pb-32">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Comparativo Planejado × Realizado</h1>
          <p className="text-sm text-gray-500">Análise e aprovação do RH para faturamento</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedEventId} onValueChange={v => { setSelectedEventId(v); setExpandedCards(new Set()); }}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Selecione um evento" />
            </SelectTrigger>
            <SelectContent>
              {events?.map(event => (
                <SelectItem key={event.id} value={event.id}>{event.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedEventId && (
            <Button size="sm" variant="outline" onClick={() => calculateMutation.mutate(selectedEventId)} disabled={calculateMutation.isPending}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${calculateMutation.isPending ? 'animate-spin' : ''}`} />
              Recalcular
            </Button>
          )}
        </div>
      </div>

      {!selectedEventId && (
        <div className="rounded-lg border border-gray-200 bg-white dark:bg-gray-800 p-12 text-center">
          <BarChart3 className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">Selecione um evento</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Escolha um evento acima para analisar o comparativo</p>
        </div>
      )}

      {selectedEventId && selectedEvent && (
        <>
          <div className={`rounded-lg border p-4 ${statusInfo.bg} ${statusInfo.border}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{statusInfo.icon}</span>
                  <span className={`text-sm font-semibold ${statusInfo.color}`}>{statusInfo.label}</span>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-500">
                  <span className="font-medium text-gray-700 dark:text-gray-200">{selectedEvent.name}</span>
                  {selectedEvent.startDate && selectedEvent.endDate && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(selectedEvent.startDate)} a {formatDate(selectedEvent.endDate)}
                    </span>
                  )}
                  <span className="text-gray-400">•</span>
                  <span>{sortedData.length} execuç{sortedData.length === 1 ? 'ão' : 'ões'} enviada{sortedData.length === 1 ? '' : 's'}</span>
                </div>
              </div>
            </div>
          </div>

          {rhComment && (
            <div className="rounded-lg border border-gray-200 bg-white dark:bg-gray-800 p-3">
              <div className="flex items-start gap-2">
                <span className="text-sm mt-0.5">💬</span>
                <div>
                  <span className="text-[10px] uppercase text-gray-400 font-medium tracking-wider">Comentário do RH</span>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">{rhComment}</p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase text-blue-400 font-medium tracking-wider">Total Planejado</p>
                  <p className="text-xl font-bold text-blue-700 dark:text-blue-300 tabular-nums mt-1">{formatCurrency(totals.totalPlanned)}</p>
                </div>
                <DollarSign className="w-6 h-6 text-blue-200" />
              </div>
            </div>

            <div className="rounded-lg border border-purple-200 bg-purple-50/50 dark:bg-purple-950/20 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase text-purple-400 font-medium tracking-wider">Total Realizado</p>
                  <p className="text-xl font-bold text-purple-700 dark:text-purple-300 tabular-nums mt-1">{formatCurrency(totals.totalActual)}</p>
                </div>
                <DollarSign className="w-6 h-6 text-purple-200" />
              </div>
            </div>

            <div className={`rounded-lg border p-4 ${totals.difference <= 0
              ? 'border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20'
              : 'border-red-200 bg-red-50/50 dark:bg-red-950/20'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-[10px] uppercase font-medium tracking-wider ${totals.difference <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    Diferença
                  </p>
                  <p className={`text-xl font-bold tabular-nums mt-1 ${totals.difference <= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                    {totals.difference > 0 ? '+' : ''}{formatCurrency(totals.difference)}
                  </p>
                  <p className={`text-[10px] mt-0.5 ${totals.difference <= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {totals.difference === 0 ? 'Sem diferença' : totals.difference < 0 ? 'Economia' : 'Acima do previsto'}
                  </p>
                </div>
                {totals.difference <= 0
                  ? <TrendingDown className="w-6 h-6 text-emerald-200" />
                  : <TrendingUp className="w-6 h-6 text-red-200" />
                }
              </div>
            </div>
          </div>

          <p className="text-[10px] text-gray-400 text-center -mt-2">
            Valores referentes apenas às execuções enviadas para revisão
          </p>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Detalhamento por Execução
                <span className="text-gray-400 font-normal ml-2">({sortedData.length})</span>
              </h2>
              <div className="flex items-center gap-2">
                <Select value={sortBy} onValueChange={(v: 'difference' | 'total') => setSortBy(v)}>
                  <SelectTrigger className="h-7 text-[11px] w-40 border-gray-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="difference">Maior diferença</SelectItem>
                    <SelectItem value="total">Maior valor</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => {
                  if (expandedCards.size === sortedData.length) {
                    setExpandedCards(new Set());
                  } else {
                    setExpandedCards(new Set(sortedData.map((_, i) => i)));
                  }
                }}>
                  {expandedCards.size === sortedData.length ? 'Recolher todos' : 'Expandir todos'}
                </Button>
              </div>
            </div>

            {sortedData.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-white dark:bg-gray-800 p-8 text-center">
                <BarChart3 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">Nenhuma execução enviada para revisão neste evento.</p>
                <p className="text-sm text-gray-400 mt-1">As execuções aparecerão aqui após serem preenchidas e enviadas no Orçamento Realizado.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sortedData.map((row, idx) => {
                  const isExpanded = expandedCards.has(idx);
                  const p = row.planned;
                  const a = row.actual;
                  const plannedTotal = p?.totalValue || 0;
                  const actualTotal = a.totalValue;
                  const diff = actualTotal - plannedTotal;
                  const hasJustification = !!a.changeReason;
                  const hasDiff = diff !== 0;

                  return (
                    <div
                      key={idx}
                      className={`rounded-lg border bg-white dark:bg-gray-800 overflow-hidden transition-all ${
                        diff > 0 ? 'border-red-200/60' : diff < 0 ? 'border-emerald-200/60' : 'border-gray-200'
                      }`}
                    >
                      <div
                        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50/80 dark:hover:bg-gray-750 transition-colors"
                        onClick={() => toggleExpand(idx)}
                      >
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                            {getCollaboratorName(row.collaboratorId)}
                          </span>
                        </div>

                        <div className="flex items-center gap-4 shrink-0">
                          <div className="grid grid-cols-3 gap-x-4 text-right min-w-[280px]">
                            <div>
                              <span className="text-[9px] uppercase text-gray-400 tracking-wider block">Planejado</span>
                              <span className="text-xs tabular-nums text-blue-600">{formatCurrency(plannedTotal)}</span>
                            </div>
                            <div>
                              <span className="text-[9px] uppercase text-gray-400 tracking-wider block">Realizado</span>
                              <span className="text-xs tabular-nums text-purple-600 font-medium">{formatCurrency(actualTotal)}</span>
                            </div>
                            <div>
                              <span className="text-[9px] uppercase text-gray-400 tracking-wider block">Diferença</span>
                              {hasDiff ? (
                                <span className={`text-xs tabular-nums font-semibold ${diff > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                  {diff > 0 ? '+' : ''}{formatCurrency(diff)}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-300 tabular-nums">{formatCurrency(0)}</span>
                              )}
                            </div>
                          </div>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3">
                          <div className="flex items-center gap-1.5 mb-3">
                            <Badge variant="secondary" className="text-[9px] h-[16px] px-1.5">{getFunctionName(row.functionId)}</Badge>
                            <Badge className={`text-[9px] h-[16px] px-1.5 ${row.collaboratorType === 'casa' ? 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-50' : 'bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-50'}`}>
                              {row.collaboratorType === 'casa' ? 'Casa' : 'Freela'}
                            </Badge>
                            {!p && <Badge className="text-[9px] h-[16px] px-1.5 bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-50">Sem planejado</Badge>}
                            {hasDiff && !hasJustification && (
                              <span className="text-[9px] text-amber-500 flex items-center gap-0.5 ml-1 opacity-70">
                                <AlertTriangle className="w-2.5 h-2.5" /> Sem justificativa
                              </span>
                            )}
                          </div>

                          <div className="flex items-center text-[9px] uppercase tracking-wider text-gray-400 font-medium pb-1.5 mb-1 px-2">
                            <div className="w-[35%]">Item</div>
                            <div className="w-[28%] text-right">Planejado</div>
                            <div className="w-[6%]"></div>
                            <div className="w-[28%] text-right">Realizado</div>
                            <div className="w-[3%]"></div>
                          </div>

                          <div className="space-y-0.5">
                            <CompareRow
                              label="Qtd. Diárias"
                              plannedVal={p ? String(p.dailyQuantity) : '-'}
                              actualVal={String(a.dailyQuantity)}
                              isDifferent={isValDiff(p?.dailyQuantity, a.dailyQuantity)}
                            />
                            <CompareRow
                              label="Valor Diária"
                              plannedVal={p ? formatCurrency(p.dailyValue) : '-'}
                              actualVal={formatCurrency(a.dailyValue)}
                              isDifferent={isValDiff(p?.dailyValue, a.dailyValue)}
                            />
                            <CompareRow
                              label="Subtotal Diárias"
                              plannedVal={p ? formatCurrency(p.dailyQuantity * p.dailyValue) : '-'}
                              actualVal={formatCurrency(a.dailyQuantity * a.dailyValue)}
                              isDifferent={isValDiff(p ? p.dailyQuantity * p.dailyValue : undefined, a.dailyQuantity * a.dailyValue)}
                            />

                            <div className="pt-2 mt-1">
                              <span className="text-[9px] uppercase text-gray-400 font-medium tracking-wider px-2">Alimentação</span>
                            </div>
                            <CompareRow label="Almoço (Sem.)" plannedVal={p ? formatCurrency(p.weekdayLunch) : '-'} actualVal={formatCurrency(a.weekdayLunch)} isDifferent={isValDiff(p?.weekdayLunch, a.weekdayLunch)} />
                            <CompareRow label="Jantar (Sem.)" plannedVal={p ? formatCurrency(p.weekdayDinner) : '-'} actualVal={formatCurrency(a.weekdayDinner)} isDifferent={isValDiff(p?.weekdayDinner, a.weekdayDinner)} />
                            <CompareRow label="Almoço (FdS)" plannedVal={p ? formatCurrency(p.weekendLunch) : '-'} actualVal={formatCurrency(a.weekendLunch)} isDifferent={isValDiff(p?.weekendLunch, a.weekendLunch)} />
                            <CompareRow label="Jantar (FdS)" plannedVal={p ? formatCurrency(p.weekendDinner) : '-'} actualVal={formatCurrency(a.weekendDinner)} isDifferent={isValDiff(p?.weekendDinner, a.weekendDinner)} />
                            <CompareRow
                              label="Subtotal Alim."
                              plannedVal={p ? formatCurrency(p.weekdayLunch + p.weekdayDinner + p.weekendLunch + p.weekendDinner) : '-'}
                              actualVal={formatCurrency(a.weekdayLunch + a.weekdayDinner + a.weekendLunch + a.weekendDinner)}
                              isDifferent={isValDiff(
                                p ? p.weekdayLunch + p.weekdayDinner + p.weekendLunch + p.weekendDinner : undefined,
                                a.weekdayLunch + a.weekdayDinner + a.weekendLunch + a.weekendDinner
                              )}
                            />

                            <div className="pt-2 mt-1">
                              <span className="text-[9px] uppercase text-gray-400 font-medium tracking-wider px-2">Outros</span>
                            </div>
                            <CompareRow label="Mobilidade" plannedVal={p ? formatCurrency(p.mobility) : '-'} actualVal={formatCurrency(a.mobility)} isDifferent={isValDiff(p?.mobility, a.mobility)} />
                            <CompareRow label="Translado" plannedVal={p ? formatCurrency(p.transport) : '-'} actualVal={formatCurrency(a.transport)} isDifferent={isValDiff(p?.transport, a.transport)} />
                          </div>

                          <div className="flex items-center text-xs font-semibold pt-2.5 mt-2 border-t border-gray-200 dark:border-gray-600 px-2">
                            <div className="w-[35%] text-gray-700 dark:text-gray-200">TOTAL</div>
                            <div className="w-[28%] text-right text-blue-700 tabular-nums">{formatCurrency(plannedTotal)}</div>
                            <div className="w-[6%] flex justify-center"><ArrowRight className="w-3 h-3 text-gray-300" /></div>
                            <div className="w-[28%] text-right text-purple-700 tabular-nums">{formatCurrency(actualTotal)}</div>
                            <div className="w-[3%]"></div>
                          </div>

                          {hasDiff && (
                            <div className={`flex items-center justify-end mt-1.5 text-xs font-medium tabular-nums px-2 ${diff > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                              Diferença: {diff > 0 ? '+' : ''}{formatCurrency(diff)}
                            </div>
                          )}

                          {a.changeReason && (
                            <div className="mt-3 p-2.5 rounded-md bg-gray-50 dark:bg-gray-750 border border-gray-100 dark:border-gray-700">
                              <div className="flex items-start gap-1.5">
                                <span className="text-xs mt-0.5">💬</span>
                                <div>
                                  <span className="text-[9px] uppercase text-gray-400 font-medium tracking-wider">Justificativa do Responsável</span>
                                  <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-0.5">{a.changeReason}</p>
                                </div>
                              </div>
                            </div>
                          )}

                          {rhComment && (
                            <div className="mt-2 p-2.5 rounded-md bg-orange-50/60 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-800">
                              <div className="flex items-start gap-1.5">
                                <span className="text-xs mt-0.5">💬</span>
                                <div>
                                  <span className="text-[9px] uppercase text-orange-500 font-medium tracking-wider">Comentário do RH</span>
                                  <p className="text-[11px] text-orange-700 dark:text-orange-300 mt-0.5">{rhComment}</p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {comparison && !isReadOnly && sortedData.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700 shadow-lg">
          <div className="max-w-5xl mx-auto px-6 py-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Decisão do RH</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">{sortedData.length} execuç{sortedData.length === 1 ? 'ão' : 'ões'} para análise</p>
              </div>
              <div className="flex gap-2">
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 text-xs px-4" onClick={() => setActionModal({ type: 'approve' })}>
                  <CheckCircle className="w-3.5 h-3.5 mr-1.5" /> Aprovar para faturamento
                </Button>
                <Button variant="outline" className="text-orange-600 border-orange-300 hover:bg-orange-50 h-9 text-xs px-4" onClick={() => setActionModal({ type: 'return' })}>
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Devolver para ajustes
                </Button>
                <Button variant="outline" className="text-red-600 border-red-300 hover:bg-red-50 h-9 text-xs px-4" onClick={() => setActionModal({ type: 'reject' })}>
                  <XCircle className="w-3.5 h-3.5 mr-1.5" /> Recusar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Dialog open={!!actionModal} onOpenChange={() => { setActionModal(null); setActionNote(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {actionModal?.type === 'approve' && <><CheckCircle className="w-5 h-5 text-emerald-600" /> Aprovar para Faturamento</>}
              {actionModal?.type === 'reject' && <><XCircle className="w-5 h-5 text-red-600" /> Recusar Execução</>}
              {actionModal?.type === 'return' && <><RotateCcw className="w-5 h-5 text-orange-600" /> Devolver para Ajustes</>}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-600 dark:text-gray-300">
                {actionModal?.type === 'approve' ? 'Comentário (opcional)' : 'Motivo *'}
              </label>
              <Textarea
                className="mt-1.5"
                value={actionNote}
                onChange={e => setActionNote(e.target.value)}
                placeholder={
                  actionModal?.type === 'approve' ? 'Adicionar um comentário...' :
                  actionModal?.type === 'reject' ? 'Informe o motivo da recusa...' :
                  'Informe o que precisa ser corrigido...'
                }
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setActionModal(null); setActionNote(""); }}>Cancelar</Button>
            <Button
              onClick={handleAction}
              disabled={approveMutation.isPending || rejectMutation.isPending || returnMutation.isPending}
              className={
                actionModal?.type === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' :
                actionModal?.type === 'reject' ? 'bg-red-600 hover:bg-red-700' :
                'bg-orange-600 hover:bg-orange-700'
              }
            >
              {(approveMutation.isPending || rejectMutation.isPending || returnMutation.isPending) ? 'Processando...' :
               actionModal?.type === 'approve' ? 'Aprovar' :
               actionModal?.type === 'reject' ? 'Recusar' : 'Devolver'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
