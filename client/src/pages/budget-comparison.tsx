import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Checkbox } from "@/components/ui/checkbox";
import {
  BarChart3, CheckCircle, XCircle, RotateCcw,
  TrendingUp, TrendingDown, DollarSign,
  Calendar, MessageSquare,
  ChevronDown, ChevronUp, AlertTriangle, Search, CheckSquare, Square,
  Send, Clock, ListChecks
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { EventSelect, EventSelectCTA } from "@/components/event-select";
import type { Event, Function, Collaborator, BudgetActual, BudgetPlanned, BudgetComparison } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";

export default function BudgetComparisonPage() {
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [actionModal, setActionModal] = useState<{ type: 'approve' | 'reject' | 'return' } | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [sortBy, setSortBy] = useState<'difference' | 'total'>('difference');
  const [searchTerm, setSearchTerm] = useState("");
  const [filterFunction, setFilterFunction] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
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

  const rhActionMutation = useMutation({
    mutationFn: async ({ itemIds, action, comment }: { itemIds: string[]; action: string; comment: string }) => {
      const res = await apiRequest("POST", `/api/budget-actual/rh-action`, {
        itemIds,
        action,
        comment,
        actionBy: user?.id,
      });
      return res.json();
    },
    onSuccess: (_, variables) => {
      const labels: Record<string, { title: string; cls: string }> = {
        aprovado: { title: "Aprovado para faturamento", cls: "bg-emerald-50 border-emerald-200 text-emerald-800" },
        rejeitado: { title: "Execução recusada", cls: "bg-red-50 border-red-200 text-red-800" },
        devolvido: { title: "Devolvido para ajustes", cls: "bg-amber-50 border-amber-200 text-amber-800" },
      };
      const info = labels[variables.action];
      toast({ title: info?.title || "Ação realizada", className: info?.cls });
      qc.invalidateQueries({ queryKey: ["/api/budget-actual"] });
      qc.invalidateQueries({ queryKey: ["/api/budget-comparison"] });
      setActionModal(null);
      setActionNote("");
      setSelectedItems(new Set());
    },
  });

  const handleAction = () => {
    if (!actionModal) return;
    const actionMap: Record<string, string> = { approve: 'aprovado', reject: 'rejeitado', return: 'devolvido' };
    const rhAction = actionMap[actionModal.type];
    const selectedActualIds = Array.from(selectedItems).map(idx => sortedData[idx]?.actual?.id).filter(Boolean) as string[];
    if (selectedActualIds.length === 0) return;
    rhActionMutation.mutate({ itemIds: selectedActualIds, action: rhAction, comment: actionNote });
  };

  const fmt = (cents: number) =>
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

  useEffect(() => {
    if (selectedEventId && !comparison && comparisonData.length > 0 && !calculateMutation.isPending) {
      calculateMutation.mutate(selectedEventId);
    }
  }, [selectedEventId, comparison, comparisonData.length]);

  const filteredData = useMemo(() => {
    let data = [...comparisonData];
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      data = data.filter(r => {
        const name = getCollaboratorName(r.collaboratorId).toLowerCase();
        return name.includes(term);
      });
    }
    if (filterFunction !== "all") {
      data = data.filter(r => r.functionId === filterFunction);
    }
    if (filterType !== "all") {
      data = data.filter(r => r.collaboratorType === filterType);
    }
    return data;
  }, [comparisonData, searchTerm, filterFunction, filterType]);

  const sortedData = useMemo(() => {
    const sorted = [...filteredData];
    if (sortBy === 'difference') {
      sorted.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
    } else {
      sorted.sort((a, b) => b.actual.totalValue - a.actual.totalValue);
    }
    return sorted;
  }, [filteredData, sortBy]);

  const usedFunctionIds = useMemo(() => {
    const ids = new Set(comparisonData.map(r => r.functionId).filter(Boolean));
    return Array.from(ids);
  }, [comparisonData]);

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
  const isReadOnly = false;

  const formatDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const rhComment = comparison?.approvalObservation || comparison?.rejectionReason || comparison?.returnReason;

  const CategoryBlock = ({ title, rows }: {
    title: string;
    rows: Array<{ label: string; planned: number; actual: number; isQuantity?: boolean }>;
  }) => {
    const currencyRows = rows.filter(r => !r.isQuantity);
    const subtotalPlanned = currencyRows.reduce((s, r) => s + r.planned, 0);
    const subtotalActual = currencyRows.reduce((s, r) => s + r.actual, 0);
    const subtotalDiff = subtotalActual - subtotalPlanned;
    const hasAnyDiff = rows.some(r => r.planned !== r.actual);
    const fmtVal = (v: number, isQty?: boolean) => isQty ? String(v) : fmt(v);

    return (
      <div className={`rounded-lg border p-3 ${hasAnyDiff ? 'border-amber-200/70 bg-amber-50/20 dark:bg-amber-950/10' : 'border-gray-100 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-800/50'}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{title}</span>
          {hasAnyDiff && <AlertTriangle className="w-3 h-3 text-amber-400" />}
        </div>

        <div className="space-y-1.5">
          {rows.map((row, i) => {
            const diff = row.actual - row.planned;
            const isDiff = diff !== 0;
            return (
              <div key={i} className="grid grid-cols-4 gap-2 text-[12px] items-center">
                <span className="text-gray-700 dark:text-gray-200 font-medium">{row.label}</span>
                <span className="text-right tabular-nums text-blue-600 dark:text-blue-400 font-medium">{fmtVal(row.planned, row.isQuantity)}</span>
                <span className={`text-right tabular-nums font-semibold ${
                  isDiff ? 'text-orange-600 dark:text-orange-400' : 'text-purple-600 dark:text-purple-400'
                }`}>{fmtVal(row.actual, row.isQuantity)}</span>
                <span className={`text-right tabular-nums text-[11px] font-semibold ${
                  diff > 0 ? 'text-red-600' : diff < 0 ? 'text-emerald-600' : 'text-gray-400'
                }`}>
                  {diff === 0 ? '—' : row.isQuantity ? `${diff > 0 ? '+' : ''}${diff}` : `${diff > 0 ? '+' : ''}${fmt(diff)}`}
                </span>
              </div>
            );
          })}
        </div>

        {currencyRows.length > 0 && (
          <div className="grid grid-cols-4 gap-2 text-[11px] items-center mt-2 pt-2 border-t border-gray-200/60 dark:border-gray-600/40 font-semibold">
            <span className="text-gray-600 dark:text-gray-300">Subtotal</span>
            <span className="text-right tabular-nums text-blue-600">{fmt(subtotalPlanned)}</span>
            <span className={`text-right tabular-nums ${subtotalDiff !== 0 ? 'text-orange-600' : 'text-purple-600'}`}>{fmt(subtotalActual)}</span>
            <span className={`text-right tabular-nums text-[10px] ${
              subtotalDiff > 0 ? 'text-red-500' : subtotalDiff < 0 ? 'text-emerald-500' : 'text-gray-400'
            }`}>
              {subtotalDiff === 0 ? '—' : `${subtotalDiff > 0 ? '+' : ''}${fmt(subtotalDiff)}`}
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5 max-w-5xl mx-auto pb-24">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-100 dark:bg-emerald-900/40 p-2 rounded-lg">
            <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-emerald-900 dark:text-emerald-100">Comparativo Planejado × Realizado</h1>
            <p className="text-sm text-gray-500">Análise e aprovação do RH para faturamento</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {selectedEventId && (
            <EventSelect value={selectedEventId} onValueChange={v => { setSelectedEventId(v); setExpandedCards(new Set()); setSelectedItems(new Set()); }} events={events} />
          )}
        </div>
      </div>

      {!selectedEventId && (
        <div className="rounded-xl border-2 border-dashed border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-16 text-center">
          <div className="bg-emerald-100 dark:bg-emerald-900/50 rounded-2xl p-5 w-fit mx-auto mb-5">
            <BarChart3 className="w-14 h-14 text-emerald-500 dark:text-emerald-400" />
          </div>
          <h2 className="text-xl font-semibold text-emerald-900 dark:text-emerald-100 mb-2">Selecione um evento</h2>
          <p className="text-emerald-600/70 dark:text-emerald-400/70 text-sm max-w-md mx-auto mb-6">
            Analise as diferenças entre o planejado e o realizado. O RH revisa e aprova os valores para faturamento.
          </p>
          <EventSelectCTA value={selectedEventId} onValueChange={v => { setSelectedEventId(v); setExpandedCards(new Set()); setSelectedItems(new Set()); }} events={events} accentColor="emerald" />
        </div>
      )}

      {selectedEventId && selectedEvent && (
        <>
          {budgetActual && budgetActual.length > 0 && (() => {
            const totalActualItems = budgetActual.length;
            const sentCount = budgetActual.filter(a => a.sentForReview && a.rhStatus === 'pendente').length;
            const approvedCount = budgetActual.filter(a => a.rhStatus === 'aprovado').length;
            const rejectedCount = budgetActual.filter(a => a.rhStatus === 'rejeitado').length;
            const returnedCount = budgetActual.filter(a => a.rhStatus === 'devolvido').length;
            const pendingCount = budgetActual.filter(a => !a.sentForReview && a.rhStatus === 'pendente').length;
            const chips = [
              sentCount > 0 && { icon: Send, count: sentCount, label: `para análise`, bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200 dark:border-blue-800', iconColor: 'text-blue-500', numColor: 'text-blue-700 dark:text-blue-400', textColor: 'text-blue-600/70 dark:text-blue-500/70' },
              approvedCount > 0 && { icon: CheckCircle, count: approvedCount, label: `aprovado${approvedCount !== 1 ? 's' : ''}`, bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800', iconColor: 'text-emerald-500', numColor: 'text-emerald-700 dark:text-emerald-400', textColor: 'text-emerald-600/70 dark:text-emerald-500/70' },
              rejectedCount > 0 && { icon: XCircle, count: rejectedCount, label: `recusado${rejectedCount !== 1 ? 's' : ''}`, bg: 'bg-red-50 dark:bg-red-950/30', border: 'border-red-200 dark:border-red-800', iconColor: 'text-red-500', numColor: 'text-red-700 dark:text-red-400', textColor: 'text-red-600/70 dark:text-red-500/70' },
              returnedCount > 0 && { icon: RotateCcw, count: returnedCount, label: `devolvido${returnedCount !== 1 ? 's' : ''}`, bg: 'bg-orange-50 dark:bg-orange-950/30', border: 'border-orange-200 dark:border-orange-800', iconColor: 'text-orange-500', numColor: 'text-orange-700 dark:text-orange-400', textColor: 'text-orange-600/70 dark:text-orange-500/70' },
              pendingCount > 0 && { icon: Clock, count: pendingCount, label: `pendente${pendingCount !== 1 ? 's' : ''}`, bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800', iconColor: 'text-amber-500', numColor: 'text-amber-700 dark:text-amber-400', textColor: 'text-amber-600/70 dark:text-amber-500/70' },
            ].filter(Boolean) as Array<{ icon: any; count: number; label: string; bg: string; border: string; iconColor: string; numColor: string; textColor: string }>;
            return (
              <div className="flex items-center gap-2.5 flex-wrap">
                {chips.map((chip, i) => (
                  <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${chip.bg} ${chip.border}`}>
                    <chip.icon className={`w-3 h-3 ${chip.iconColor}`} />
                    <span className={`text-sm font-semibold ${chip.numColor}`}>{chip.count}</span>
                    <span className={`text-[10px] ${chip.textColor}`}>{chip.label}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 dark:bg-slate-800/40 dark:border-slate-700">
                  <ListChecks className="w-3 h-3 text-slate-400" />
                  <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{totalActualItems}</span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">total</span>
                </div>
              </div>
            );
          })()}

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
              <p className="text-[10px] uppercase text-blue-400 font-medium tracking-wider">Total Planejado</p>
              <p className="text-xl font-bold text-blue-700 dark:text-blue-300 tabular-nums mt-1">{fmt(totals.totalPlanned)}</p>
            </div>
            <div className="rounded-lg border border-purple-200 bg-purple-50/50 dark:bg-purple-950/20 p-4">
              <p className="text-[10px] uppercase text-purple-400 font-medium tracking-wider">Total Realizado</p>
              <p className="text-xl font-bold text-purple-700 dark:text-purple-300 tabular-nums mt-1">{fmt(totals.totalActual)}</p>
            </div>
            <div className={`rounded-lg border p-4 ${totals.difference <= 0
              ? 'border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20'
              : 'border-red-200 bg-red-50/50 dark:bg-red-950/20'
            }`}>
              <p className={`text-[10px] uppercase font-medium tracking-wider ${totals.difference <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                Diferença
              </p>
              <p className={`text-xl font-bold tabular-nums mt-1 ${totals.difference <= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                {totals.difference > 0 ? '+' : ''}{fmt(totals.difference)}
              </p>
              <p className={`text-[10px] mt-0.5 ${totals.difference <= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {totals.difference === 0 ? 'Sem diferença' : totals.difference < 0 ? 'Economia' : 'Acima do previsto'}
              </p>
            </div>
          </div>

          <p className="text-[10px] text-gray-400 text-center -mt-2">
            Valores referentes apenas às execuções enviadas para revisão
          </p>

          <div>
            <div className="mb-3 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  Detalhamento por Execução
                  <span className="text-gray-400 font-normal ml-2">({sortedData.length})</span>
                </h2>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => {
                    if (expandedCards.size === sortedData.length) {
                      setExpandedCards(new Set());
                    } else {
                      setExpandedCards(new Set(sortedData.map((_, i) => i)));
                    }
                  }}>
                    {expandedCards.size === sortedData.length ? 'Recolher todos' : 'Expandir todos'}
                  </Button>
                  {!isReadOnly && (
                    <Button size="sm" variant="ghost" className="text-xs h-7 gap-1" onClick={() => {
                      const selectableIndices = sortedData
                        .map((row, i) => ({ i, status: row.actual.rhStatus || 'pendente' }))
                        .filter(x => x.status === 'pendente')
                        .map(x => x.i);
                      if (selectedItems.size > 0) {
                        setSelectedItems(new Set());
                      } else {
                        setSelectedItems(new Set(selectableIndices));
                      }
                    }}>
                      {selectedItems.size > 0 ? (
                        <><CheckSquare className="w-3.5 h-3.5" /> Limpar seleção</>
                      ) : (
                        <><Square className="w-3.5 h-3.5" /> Selecionar todos</>
                      )}
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <Input
                    placeholder="Buscar por nome..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="h-8 pl-8 text-xs"
                  />
                </div>
                <Select value={filterFunction} onValueChange={setFilterFunction}>
                  <SelectTrigger className="h-8 text-xs w-40 border-gray-200">
                    <SelectValue placeholder="Função" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as funções</SelectItem>
                    {usedFunctionIds.map(fid => (
                      <SelectItem key={fid} value={fid!}>{getFunctionName(fid)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="h-8 text-xs w-28 border-gray-200">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="casa">Casa</SelectItem>
                    <SelectItem value="freelancer">Freela</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortBy} onValueChange={(v: 'difference' | 'total') => setSortBy(v)}>
                  <SelectTrigger className="h-8 text-xs w-40 border-gray-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="difference">Maior diferença</SelectItem>
                    <SelectItem value="total">Maior valor</SelectItem>
                  </SelectContent>
                </Select>
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

                  const dailyPlanned = p ? p.dailyQuantity * p.dailyValue : 0;
                  const dailyActual = a.dailyQuantity * a.dailyValue;
                  const mealPlanned = p ? (p.weekdayLunch + p.weekdayDinner + p.weekendLunch + p.weekendDinner) : 0;
                  const mealActual = a.weekdayLunch + a.weekdayDinner + a.weekendLunch + a.weekendDinner;
                  const mobilityPlanned = p ? (p.mobility + p.transport) : 0;
                  const mobilityActual = a.mobility + a.transport;

                  const itemRhStatus = a.rhStatus || 'pendente';
                  const isDecided = itemRhStatus === 'aprovado' || itemRhStatus === 'rejeitado' || itemRhStatus === 'devolvido';
                  const isResubmitted = a.resubmitted;

                  const statusStyles: Record<string, { bg: string; border: string; text: string; icon: any; label: string }> = {
                    aprovado: { bg: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-300 dark:border-emerald-700', text: 'text-emerald-700 dark:text-emerald-400', icon: CheckCircle, label: 'Aprovado' },
                    rejeitado: { bg: 'bg-red-50 dark:bg-red-950/40', border: 'border-red-300 dark:border-red-700', text: 'text-red-700 dark:text-red-400', icon: XCircle, label: 'Recusado' },
                    devolvido: { bg: 'bg-orange-50 dark:bg-orange-950/40', border: 'border-orange-300 dark:border-orange-700', text: 'text-orange-700 dark:text-orange-400', icon: RotateCcw, label: 'Devolvido' },
                  };
                  const decidedStyle = statusStyles[itemRhStatus];

                  return (
                    <div
                      key={idx}
                      className={`rounded-lg border overflow-hidden transition-all ${
                        isDecided
                          ? `${decidedStyle.bg} ${decidedStyle.border} opacity-80`
                          : selectedItems.has(idx)
                            ? 'bg-white dark:bg-gray-800 border-emerald-400 ring-1 ring-emerald-200 dark:ring-emerald-800'
                            : `bg-white dark:bg-gray-800 ${diff > 0 ? 'border-red-200/60' : diff < 0 ? 'border-emerald-200/60' : 'border-gray-200'}`
                      }`}
                    >
                      <div
                        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50/80 dark:hover:bg-gray-750 transition-colors"
                        onClick={() => toggleExpand(idx)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {!isReadOnly && !isDecided && (
                            <Checkbox
                              checked={selectedItems.has(idx)}
                              onCheckedChange={(checked) => {
                                const next = new Set(selectedItems);
                                if (checked) next.add(idx); else next.delete(idx);
                                setSelectedItems(next);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="shrink-0 border-gray-300 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                            />
                          )}
                          {isDecided && decidedStyle && (
                            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${decidedStyle.text} ${decidedStyle.bg} border ${decidedStyle.border}`}>
                              <decidedStyle.icon className="w-3 h-3" />
                              {decidedStyle.label}
                            </div>
                          )}
                          <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                              {getCollaboratorName(row.collaboratorId)}
                            </span>
                            {isResubmitted && (
                              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 border border-violet-200 dark:border-violet-800 text-[9px] font-semibold text-violet-700 dark:text-violet-400">
                                <RotateCcw className="w-2.5 h-2.5" /> Reenviado
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-gray-400">{getFunctionName(row.functionId)}</span>
                            <span className="text-gray-300 dark:text-gray-600">·</span>
                            <span className={`text-[10px] font-medium ${row.collaboratorType === 'casa' ? 'text-blue-500' : 'text-orange-500'}`}>
                              {row.collaboratorType === 'casa' ? 'Casa' : 'Freela'}
                            </span>
                          </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 shrink-0">
                          <div className="grid grid-cols-3 gap-x-4 text-right min-w-[280px]">
                            <div>
                              <span className="text-[9px] uppercase text-gray-400 tracking-wider block">Planejado</span>
                              <span className="text-xs tabular-nums text-blue-600">{fmt(plannedTotal)}</span>
                            </div>
                            <div>
                              <span className="text-[9px] uppercase text-gray-400 tracking-wider block">Realizado</span>
                              <span className="text-xs tabular-nums text-purple-600 font-medium">{fmt(actualTotal)}</span>
                            </div>
                            <div>
                              <span className="text-[9px] uppercase text-gray-400 tracking-wider block">Diferença</span>
                              {hasDiff ? (
                                <span className={`text-xs tabular-nums font-semibold ${diff > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                  {diff > 0 ? '+' : ''}{fmt(diff)}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-300 tabular-nums">{fmt(0)}</span>
                              )}
                            </div>
                          </div>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="px-4 pb-4 border-t-2 border-emerald-100 dark:border-emerald-900 pt-3 space-y-3 bg-emerald-50/40 dark:bg-emerald-950/20">
                          <div className="flex items-center gap-1.5">
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

                          <div className="grid grid-cols-4 gap-2 text-[10px] uppercase tracking-wider font-semibold px-0.5">
                            <span></span>
                            <span className="text-right text-blue-500">Planejado</span>
                            <span className="text-right text-purple-500">Realizado</span>
                            <span className="text-right text-gray-500">Diferença</span>
                          </div>

                          <CategoryBlock
                            title="Diárias"
                            rows={[
                              { label: "Qtd. Diárias", planned: p?.dailyQuantity || 0, actual: a.dailyQuantity, isQuantity: true },
                              { label: "Valor Unitário", planned: p?.dailyValue || 0, actual: a.dailyValue },
                              { label: "Subtotal Diárias", planned: dailyPlanned, actual: dailyActual },
                            ]}
                          />

                          <CategoryBlock
                            title="Alimentação"
                            rows={[
                              { label: "Almoço (Sem.)", planned: p?.weekdayLunch || 0, actual: a.weekdayLunch },
                              { label: "Jantar (Sem.)", planned: p?.weekdayDinner || 0, actual: a.weekdayDinner },
                              { label: "Almoço (FdS)", planned: p?.weekendLunch || 0, actual: a.weekendLunch },
                              { label: "Jantar (FdS)", planned: p?.weekendDinner || 0, actual: a.weekendDinner },
                            ]}
                          />

                          <CategoryBlock
                            title="Mobilidade"
                            rows={[
                              { label: "Mobilidade", planned: p?.mobility || 0, actual: a.mobility },
                              { label: "Translado", planned: p?.transport || 0, actual: a.transport },
                            ]}
                          />

                          <div className={`rounded-lg border-2 p-4 ${
                            diff > 0 ? 'border-red-300 bg-red-50/50 dark:bg-red-950/20'
                              : diff < 0 ? 'border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20'
                              : 'border-gray-300 bg-gray-50/50 dark:bg-gray-800'
                          }`}>
                            <div className="grid grid-cols-3 gap-4 text-center">
                              <div>
                                <span className="text-[9px] uppercase text-gray-400 font-medium tracking-wider block mb-1">Total Planejado</span>
                                <span className="text-lg font-bold text-blue-700 dark:text-blue-300 tabular-nums">{fmt(plannedTotal)}</span>
                              </div>
                              <div>
                                <span className="text-[9px] uppercase text-gray-400 font-medium tracking-wider block mb-1">Total Realizado</span>
                                <span className="text-lg font-bold text-purple-700 dark:text-purple-300 tabular-nums">{fmt(actualTotal)}</span>
                              </div>
                              <div>
                                <span className={`text-[9px] uppercase font-medium tracking-wider block mb-1 ${
                                  diff > 0 ? 'text-red-400' : diff < 0 ? 'text-emerald-400' : 'text-gray-400'
                                }`}>Diferença</span>
                                <span className={`text-lg font-bold tabular-nums ${
                                  diff > 0 ? 'text-red-600' : diff < 0 ? 'text-emerald-600' : 'text-gray-500'
                                }`}>
                                  {diff > 0 ? '+' : ''}{fmt(diff)}
                                </span>
                                {hasDiff && (
                                  <span className={`block text-[10px] mt-0.5 ${diff > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                    {diff > 0 ? 'Acima do previsto' : 'Economia'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {a.changeReason && (
                            <div className="p-2.5 rounded-md bg-gray-50 dark:bg-gray-750 border border-gray-100 dark:border-gray-700">
                              <div className="flex items-start gap-1.5">
                                <span className="text-xs mt-0.5">💬</span>
                                <div>
                                  <span className="text-[9px] uppercase text-gray-400 font-medium tracking-wider">Justificativa do Responsável</span>
                                  <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-0.5">{a.changeReason}</p>
                                </div>
                              </div>
                            </div>
                          )}

                          {a.rhComment && (
                            <div className={`p-2.5 rounded-md border ${
                              itemRhStatus === 'aprovado' ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-800' :
                              itemRhStatus === 'rejeitado' ? 'bg-red-50/60 dark:bg-red-950/20 border-red-100 dark:border-red-800' :
                              'bg-orange-50/60 dark:bg-orange-950/20 border-orange-100 dark:border-orange-800'
                            }`}>
                              <div className="flex items-start gap-1.5">
                                <span className="text-xs mt-0.5">💬</span>
                                <div>
                                  <span className={`text-[9px] uppercase font-medium tracking-wider ${
                                    itemRhStatus === 'aprovado' ? 'text-emerald-500' :
                                    itemRhStatus === 'rejeitado' ? 'text-red-500' : 'text-orange-500'
                                  }`}>Comentário do RH</span>
                                  <p className={`text-[11px] mt-0.5 ${
                                    itemRhStatus === 'aprovado' ? 'text-emerald-700 dark:text-emerald-300' :
                                    itemRhStatus === 'rejeitado' ? 'text-red-700 dark:text-red-300' : 'text-orange-700 dark:text-orange-300'
                                  }`}>{a.rhComment}</p>
                                </div>
                              </div>
                            </div>
                          )}

                          {rhComment && !a.rhComment && (
                            <div className="p-2.5 rounded-md bg-orange-50/60 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-800">
                              <div className="flex items-start gap-1.5">
                                <span className="text-xs mt-0.5">💬</span>
                                <div>
                                  <span className="text-[9px] uppercase text-orange-500 font-medium tracking-wider">Comentário do RH (geral)</span>
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

      {comparison && !isReadOnly && comparisonData.length > 0 && sortedData.some(r => (r.actual.rhStatus || 'pendente') === 'pendente') && (
        <div className="rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">Decisão do RH</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {selectedItems.size > 0
                  ? <>{selectedItems.size} selecionado{selectedItems.size !== 1 ? 's' : ''} para ação</>
                  : <>Selecione os itens pendentes acima para tomar uma decisão</>
                }
              </p>
            </div>
            <div className="flex gap-2.5">
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white h-10 text-sm px-5 shadow-sm disabled:opacity-40"
                onClick={() => setActionModal({ type: 'approve' })}
                disabled={selectedItems.size === 0}
              >
                <CheckCircle className="w-4 h-4 mr-1.5" /> Aprovar{selectedItems.size > 0 ? ` (${selectedItems.size})` : ''}
              </Button>
              <Button
                variant="outline"
                className="text-orange-600 border-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950/30 h-10 text-sm px-4 disabled:opacity-40"
                onClick={() => setActionModal({ type: 'return' })}
                disabled={selectedItems.size === 0}
              >
                <RotateCcw className="w-4 h-4 mr-1.5" /> Devolver{selectedItems.size > 0 ? ` (${selectedItems.size})` : ''}
              </Button>
              <Button
                variant="outline"
                className="text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 h-10 text-sm px-4 disabled:opacity-40"
                onClick={() => setActionModal({ type: 'reject' })}
                disabled={selectedItems.size === 0}
              >
                <XCircle className="w-4 h-4 mr-1.5" /> Recusar{selectedItems.size > 0 ? ` (${selectedItems.size})` : ''}
              </Button>
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
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 max-h-32 overflow-y-auto">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1.5">
                {selectedItems.size} colaborador{selectedItems.size !== 1 ? 'es' : ''} selecionado{selectedItems.size !== 1 ? 's' : ''}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Array.from(selectedItems).map(idx => {
                  const row = sortedData[idx];
                  if (!row) return null;
                  return (
                    <Badge key={idx} variant="secondary" className="text-[10px]">
                      {getCollaboratorName(row.collaboratorId)}
                    </Badge>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-600 dark:text-gray-300">
                Comentário (opcional)
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
              disabled={rhActionMutation.isPending}
              className={
                actionModal?.type === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' :
                actionModal?.type === 'reject' ? 'bg-red-600 hover:bg-red-700' :
                'bg-orange-600 hover:bg-orange-700'
              }
            >
              {rhActionMutation.isPending ? 'Processando...' :
               actionModal?.type === 'approve' ? 'Aprovar' :
               actionModal?.type === 'reject' ? 'Recusar' : 'Devolver'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
