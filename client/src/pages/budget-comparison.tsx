import { useState, useMemo, useEffect, useRef } from "react";
import { fixEncoding } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  BarChart3, CheckCircle, XCircle, RotateCcw,
  TrendingUp, TrendingDown, DollarSign,
  Calendar, MessageSquare, Info,
  ChevronDown, ChevronUp, AlertTriangle, Search, CheckSquare, Square,
  Send, Clock, ListChecks, Briefcase, Utensils, Car, Users,
  AlertCircle, Check, Minus
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { EventSelect, EventSelectCTA } from "@/components/event-select";
import { useSearch } from "wouter";
import type { Event, Function, Collaborator, BudgetActual, BudgetPlanned, BudgetComparison } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";

const AVATAR_COLORS = [
  'bg-violet-500','bg-blue-500','bg-emerald-500','bg-orange-500',
  'bg-pink-500','bg-indigo-500','bg-amber-500','bg-teal-500',
  'bg-cyan-500','bg-rose-500',
];

function avatarColor(name: string) {
  const idx = name.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export default function BudgetComparisonPage() {
  const searchString = useSearch();
  const { urlCollaboratorId, urlFunctionId } = useMemo(() => {
    const p = new URLSearchParams(searchString);
    return {
      urlCollaboratorId: p.get("collaborator") || "",
      urlFunctionId: p.get("function") || "",
    };
  }, [searchString]);
  const [highlightCardId, setHighlightCardId] = useState<string>("");

  const [selectedEventId, setSelectedEventId] = useState<string>(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get("event") || "";
  });
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
        rejeitado: { title: "Prestação recusada", cls: "bg-red-50 border-red-200 text-red-800" },
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
    id ? fixEncoding(collaborators?.find(c => c.id === id)?.fullName) || "-" : "-";

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
      data = data.filter(r => getCollaboratorName(r.collaboratorId).toLowerCase().includes(term));
    }
    if (filterFunction !== "all") data = data.filter(r => r.functionId === filterFunction);
    if (filterType !== "all") data = data.filter(r => r.collaboratorType === filterType);
    return data;
  }, [comparisonData, searchTerm, filterFunction, filterType]);

  const sortedData = useMemo(() => {
    const sorted = [...filteredData];
    if (sortBy === 'difference') sorted.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
    else sorted.sort((a, b) => b.actual.totalValue - a.actual.totalValue);
    return sorted;
  }, [filteredData, sortBy]);

  const didScrollToCard = useRef(false);
  useEffect(() => {
    if (didScrollToCard.current || !sortedData.length || !urlCollaboratorId || !urlFunctionId) return;
    const idx = sortedData.findIndex(r => r.collaboratorId === urlCollaboratorId && r.functionId === urlFunctionId);
    if (idx >= 0) {
      didScrollToCard.current = true;
      const cardKey = `${urlCollaboratorId}-${urlFunctionId}`;
      setHighlightCardId(cardKey);
      setExpandedCards(prev => { const next = new Set(Array.from(prev)); next.add(idx); return next; });
      setTimeout(() => {
        const el = document.querySelector(`[data-card-id="${cardKey}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
      setTimeout(() => setHighlightCardId(""), 4000);
    }
  }, [sortedData, urlCollaboratorId, urlFunctionId]);

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
    setExpandedCards(prev => { const s = new Set(prev); if (s.has(idx)) s.delete(idx); else s.add(idx); return s; });
  };

  const rhComment = comparison?.approvalObservation || comparison?.rejectionReason || comparison?.returnReason;
  const isReadOnly = false;

  const CategoryBlock = ({ title, icon: Icon, iconColor, bgColor, rows }: {
    title: string;
    icon: any;
    iconColor: string;
    bgColor: string;
    rows: Array<{ label: string; planned: number; actual: number; isQuantity?: boolean }>;
  }) => {
    const currencyRows = rows.filter(r => !r.isQuantity);
    const subtotalPlanned = currencyRows.reduce((s, r) => s + r.planned, 0);
    const subtotalActual = currencyRows.reduce((s, r) => s + r.actual, 0);
    const subtotalDiff = subtotalActual - subtotalPlanned;
    const hasAnyDiff = rows.some(r => r.planned !== r.actual);
    const fmtVal = (v: number, isQty?: boolean) => isQty ? String(v) : fmt(v);

    return (
      <div className={`rounded-xl border overflow-hidden ${hasAnyDiff ? 'border-amber-200/60' : 'border-gray-100 dark:border-gray-700'}`}>
        {/* Category header */}
        <div className={`flex items-center justify-between px-3 py-2 ${bgColor}`}>
          <div className="flex items-center gap-1.5">
            <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
            <span className={`text-[10px] font-bold tracking-wide ${iconColor}`}>{title}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {hasAnyDiff && (
              <span className="flex items-center gap-0.5 text-[9px] font-semibold text-amber-600 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded-full">
                <AlertTriangle className="w-2.5 h-2.5" /> Divergência
              </span>
            )}
          </div>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-4 gap-2 px-3 py-1.5 bg-gray-50/80 dark:bg-gray-900/60 border-b border-gray-100 dark:border-gray-700">
          <span className="text-[9px] uppercase text-gray-400 font-semibold tracking-wider"></span>
          <span className="text-[9px] uppercase text-blue-500 font-bold tracking-wider text-right">Planejado</span>
          <span className="text-[9px] uppercase text-violet-500 font-bold tracking-wider text-right">Realizado</span>
          <span className="text-[9px] uppercase text-gray-400 font-semibold tracking-wider text-right">Diferença</span>
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-50 dark:divide-gray-800">
          {rows.map((row, i) => {
            const diff = row.actual - row.planned;
            const isDiff = diff !== 0;
            return (
              <div key={i} className={`grid grid-cols-4 gap-2 px-3 py-2 text-[11px] items-center ${i % 2 === 1 ? 'bg-gray-50/40 dark:bg-gray-800/30' : ''}`}>
                <span className="text-gray-600 dark:text-gray-300 font-medium">{row.label}</span>
                <span className="text-right tabular-nums text-blue-600 dark:text-blue-400">{fmtVal(row.planned, row.isQuantity)}</span>
                <span className={`text-right tabular-nums font-semibold ${isDiff ? 'text-violet-700 dark:text-violet-300' : 'text-violet-500 dark:text-violet-400'}`}>
                  {fmtVal(row.actual, row.isQuantity)}
                </span>
                <div className="text-right">
                  {diff === 0 ? (
                    <span className="text-gray-300 dark:text-gray-600 tabular-nums">—</span>
                  ) : (
                    <span className={`tabular-nums font-bold text-[10px] ${diff > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {row.isQuantity ? `${diff > 0 ? '+' : ''}${diff}` : `${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff))}`}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Subtotal */}
        {currencyRows.length > 0 && (
          <div className={`grid grid-cols-4 gap-2 px-3 py-2 text-[11px] items-center border-t-2 border-gray-100 dark:border-gray-700 font-bold ${subtotalDiff > 0 ? 'bg-red-50/40 dark:bg-red-950/10' : subtotalDiff < 0 ? 'bg-emerald-50/40 dark:bg-emerald-950/10' : 'bg-gray-50/60 dark:bg-gray-800/40'}`}>
            <span className="text-gray-500 dark:text-gray-400 uppercase text-[9px] tracking-wider">Subtotal</span>
            <span className="text-right tabular-nums text-blue-700 dark:text-blue-300">{fmt(subtotalPlanned)}</span>
            <span className={`text-right tabular-nums ${subtotalDiff !== 0 ? 'text-violet-700 dark:text-violet-300' : 'text-violet-600'}`}>{fmt(subtotalActual)}</span>
            <div className="text-right">
              {subtotalDiff === 0 ? (
                <span className="text-gray-300 tabular-nums">—</span>
              ) : (
                <span className={`tabular-nums text-[10px] ${subtotalDiff > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {subtotalDiff > 0 ? '+' : '−'}{fmt(Math.abs(subtotalDiff))}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5 max-w-5xl mx-auto pb-32">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-200 dark:shadow-emerald-900/40">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black text-gray-900 dark:text-gray-100 whitespace-nowrap">Comparativo Planejado × Realizado</h1>
            <p className="text-xs text-gray-400 mt-0.5">Análise e aprovação do RH para faturamento</p>
          </div>
        </div>
        {selectedEventId && (
          <EventSelect value={selectedEventId} onValueChange={v => { setSelectedEventId(v); setExpandedCards(new Set()); setSelectedItems(new Set()); }} events={events} />
        )}
      </div>

      {/* ── No event selected ── */}
      {!selectedEventId && (
        <div className="rounded-2xl border-2 border-dashed border-emerald-200 dark:border-emerald-800 bg-gradient-to-b from-emerald-50/60 to-teal-50/30 dark:from-emerald-950/20 dark:to-teal-950/10 p-16 text-center">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mx-auto mb-5 shadow-xl shadow-emerald-200 dark:shadow-emerald-900/40">
            <BarChart3 className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-xl font-black text-emerald-900 dark:text-emerald-100 mb-2">Selecione um evento</h2>
          <p className="text-emerald-600/70 dark:text-emerald-400/70 text-sm max-w-md mx-auto mb-6">
            Analise as diferenças entre o planejado e o realizado. O RH revisa e aprova os valores para faturamento.
          </p>
          <EventSelectCTA value={selectedEventId} onValueChange={v => { setSelectedEventId(v); setExpandedCards(new Set()); setSelectedItems(new Set()); }} events={events} accentColor="emerald" />
        </div>
      )}

      {selectedEventId && selectedEvent && (
        <>
          {/* ── Stepper ── */}
          {(() => {
            const currentStep = 3;
            const steps = [
              { label: "Escalação", desc: "Inclusões confirmadas" },
              { label: "Planejamento (RH)", desc: "Valores previstos definidos" },
              { label: "Prestação de contas", desc: "Resp. preenche o realizado" },
              { label: "Aprovação (RH)", desc: "Análise e aprovação final" },
            ];
            return (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-5 py-4">
                <div className="flex items-center justify-between">
                  {steps.map((step, i) => {
                    const isDone = i < currentStep;
                    const isActive = i === currentStep;
                    const isLast = i === steps.length - 1;
                    return (
                      <div key={i} className="flex items-center flex-1">
                        <div className="flex items-center gap-2">
                          <div className="relative flex-shrink-0">
                            {isActive && (
                              <div className="absolute inset-0 rounded-full bg-emerald-400 opacity-30 animate-ping" />
                            )}
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold relative ${
                              isDone ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200 dark:shadow-emerald-900/30' :
                              isActive ? 'bg-emerald-600 text-white ring-2 ring-emerald-200 dark:ring-emerald-700 shadow-lg shadow-emerald-300 dark:shadow-emerald-900/40' :
                              'bg-gray-100 dark:bg-gray-700 text-gray-400'
                            }`}>
                              {isDone ? <Check className="w-4 h-4" /> : (i + 1)}
                            </div>
                          </div>
                          <div className="min-w-0">
                            <div className={`text-[11px] font-semibold leading-tight ${
                              isDone ? 'text-emerald-600 dark:text-emerald-400' :
                              isActive ? 'text-emerald-700 dark:text-emerald-300' :
                              'text-gray-400'
                            }`}>{step.label}</div>
                            <div className="text-[9px] text-gray-400 leading-tight mt-0.5">{step.desc}</div>
                          </div>
                        </div>
                        {!isLast && (
                          <div className={`flex-1 h-[2px] mx-3 rounded-full ${
                            isDone ? 'bg-gradient-to-r from-emerald-400 to-emerald-300' : 'bg-gray-100 dark:bg-gray-700'
                          }`} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ── Status pills ── */}
          {budgetActual && budgetActual.length > 0 && (() => {
            const totalActualItems = budgetActual.length;
            const sentCount = budgetActual.filter(a => a.sentForReview && a.rhStatus === 'pendente').length;
            const approvedCount = budgetActual.filter(a => a.rhStatus === 'aprovado').length;
            const rejectedCount = budgetActual.filter(a => a.rhStatus === 'rejeitado').length;
            const returnedCount = budgetActual.filter(a => a.rhStatus === 'devolvido').length;
            const pendingCount = budgetActual.filter(a => !a.sentForReview && a.rhStatus === 'pendente').length;
            const chips = [
              sentCount > 0 && { icon: Send, count: sentCount, label: `para análise`, bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200 dark:border-blue-800', iconColor: 'text-blue-500', numColor: 'text-blue-700 dark:text-blue-400', textColor: 'text-blue-600/70' },
              approvedCount > 0 && { icon: CheckCircle, count: approvedCount, label: `aprovado${approvedCount !== 1 ? 's' : ''}`, bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800', iconColor: 'text-emerald-500', numColor: 'text-emerald-700 dark:text-emerald-400', textColor: 'text-emerald-600/70' },
              rejectedCount > 0 && { icon: XCircle, count: rejectedCount, label: `recusado${rejectedCount !== 1 ? 's' : ''}`, bg: 'bg-red-50 dark:bg-red-950/30', border: 'border-red-200 dark:border-red-800', iconColor: 'text-red-500', numColor: 'text-red-700 dark:text-red-400', textColor: 'text-red-600/70' },
              returnedCount > 0 && { icon: RotateCcw, count: returnedCount, label: `devolvido${returnedCount !== 1 ? 's' : ''}`, bg: 'bg-orange-50 dark:bg-orange-950/30', border: 'border-orange-200 dark:border-orange-800', iconColor: 'text-orange-500', numColor: 'text-orange-700 dark:text-orange-400', textColor: 'text-orange-600/70' },
              pendingCount > 0 && { icon: Clock, count: pendingCount, label: `pendente${pendingCount !== 1 ? 's' : ''}`, bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800', iconColor: 'text-amber-500', numColor: 'text-amber-700 dark:text-amber-400', textColor: 'text-amber-600/70' },
            ].filter(Boolean) as Array<{ icon: any; count: number; label: string; bg: string; border: string; iconColor: string; numColor: string; textColor: string }>;
            return (
              <div className="flex items-center gap-2 flex-wrap">
                {chips.map((chip, i) => (
                  <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${chip.bg} ${chip.border}`}>
                    <chip.icon className={`w-3 h-3 ${chip.iconColor}`} />
                    <span className={`text-sm font-bold ${chip.numColor}`}>{chip.count}</span>
                    <span className={`text-[10px] ${chip.textColor}`}>{chip.label}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 dark:bg-slate-800/40 dark:border-slate-700">
                  <ListChecks className="w-3 h-3 text-slate-400" />
                  <span className="text-sm font-bold text-slate-600 dark:text-slate-300">{totalActualItems}</span>
                  <span className="text-[10px] text-slate-400">total</span>
                </div>
              </div>
            );
          })()}

          {/* ── 3 Metric cards ── */}
          <div className="grid grid-cols-3 gap-4">
            {/* Planejado */}
            <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50/60 dark:from-blue-950/30 dark:to-indigo-950/20 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase text-blue-400 font-bold tracking-widest">Total Planejado</p>
                <div className="w-7 h-7 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                  <DollarSign className="w-3.5 h-3.5 text-blue-500" />
                </div>
              </div>
              <p className="text-2xl font-black text-blue-700 dark:text-blue-300 tabular-nums">{fmt(totals.totalPlanned)}</p>
              <p className="text-[10px] text-blue-400/70 mt-1">Orçamento aprovado para o evento</p>
            </div>

            {/* Realizado */}
            <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-purple-50/60 dark:from-violet-950/30 dark:to-purple-950/20 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase text-violet-400 font-bold tracking-widest">Total Realizado</p>
                <div className="w-7 h-7 rounded-xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
                  <BarChart3 className="w-3.5 h-3.5 text-violet-500" />
                </div>
              </div>
              <p className="text-2xl font-black text-violet-700 dark:text-violet-300 tabular-nums">{fmt(totals.totalActual)}</p>
              <p className="text-[10px] text-violet-400/70 mt-1">Valores prestados e enviados</p>
            </div>

            {/* Diferença */}
            <div className={`rounded-2xl border p-4 ${
              totals.difference === 0 ? 'border-gray-200 bg-gray-50 dark:bg-gray-800/60' :
              totals.difference < 0 ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50/60 dark:from-emerald-950/30 dark:to-teal-950/20' :
              'border-red-200 bg-gradient-to-br from-red-50 to-rose-50/60 dark:from-red-950/30 dark:to-rose-950/20'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <p className={`text-[10px] uppercase font-bold tracking-widest ${totals.difference === 0 ? 'text-gray-400' : totals.difference < 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  Diferença
                </p>
                <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${totals.difference === 0 ? 'bg-gray-100 dark:bg-gray-700' : totals.difference < 0 ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-red-100 dark:bg-red-900/40'}`}>
                  {totals.difference === 0 ? <Minus className="w-3.5 h-3.5 text-gray-400" /> :
                   totals.difference < 0 ? <TrendingDown className="w-3.5 h-3.5 text-emerald-500" /> :
                   <TrendingUp className="w-3.5 h-3.5 text-red-500" />}
                </div>
              </div>
              <p className={`text-2xl font-black tabular-nums ${totals.difference === 0 ? 'text-gray-500' : totals.difference < 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                {totals.difference > 0 ? '+' : totals.difference < 0 ? '−' : ''}{fmt(Math.abs(totals.difference))}
              </p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <p className={`text-[10px] ${totals.difference === 0 ? 'text-gray-400' : totals.difference < 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {totals.difference === 0 ? 'Sem diferença' : totals.difference < 0 ? 'Economia em relação ao previsto' : 'Acima do planejado'}
                </p>
                {totals.totalPlanned > 0 && totals.difference !== 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    totals.difference < 0
                      ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                      : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                  }`}>
                    {Math.abs(totals.difference / totals.totalPlanned * 100).toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── Info banner ── */}
          <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 rounded-xl">
            <Info className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
            <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
              Valores referentes apenas às prestações enviadas para revisão pelo responsável de função
            </span>
          </div>

          {/* ── RH comment banner ── */}
          {rhComment && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3.5 flex items-start gap-2.5">
              <MessageSquare className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-[10px] uppercase text-gray-400 font-bold tracking-wider">Comentário do RH</span>
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">{rhComment}</p>
              </div>
            </div>
          )}

          {/* ── Detalhamento section ── */}
          <div>
            <div className="mb-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-black text-gray-800 dark:text-gray-200">Detalhamento por Prestação</h2>
                  <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">{sortedData.length}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm" variant="ghost"
                    className="text-xs h-7 gap-1 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                    onClick={() => {
                      if (expandedCards.size === sortedData.length) setExpandedCards(new Set());
                      else setExpandedCards(new Set(sortedData.map((_, i) => i)));
                    }}
                  >
                    {expandedCards.size === sortedData.length ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {expandedCards.size === sortedData.length ? 'Recolher todos' : 'Expandir todos'}
                  </Button>
                  {!isReadOnly && (
                    <Button
                      size="sm" variant="ghost"
                      className="text-xs h-7 gap-1 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                      onClick={() => {
                        const selectableIndices = sortedData
                          .map((row, i) => ({ i, status: row.actual.rhStatus || 'pendente' }))
                          .filter(x => x.status === 'pendente').map(x => x.i);
                        if (selectedItems.size > 0) setSelectedItems(new Set());
                        else setSelectedItems(new Set(selectableIndices));
                      }}
                    >
                      {selectedItems.size > 0 ? <><CheckSquare className="w-3 h-3" /> Limpar</> : <><Square className="w-3 h-3" /> Selecionar todos</>}
                    </Button>
                  )}
                </div>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <Input placeholder="Buscar por nome..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="h-8 pl-8 text-xs rounded-xl border-gray-200" />
                </div>
                <Select value={filterFunction} onValueChange={setFilterFunction}>
                  <SelectTrigger className="h-9 text-sm w-40 border border-slate-200 rounded-lg bg-white text-slate-700 hover:border-blue-300 transition-colors focus:ring-2 focus:ring-blue-200"><SelectValue placeholder="Função" /></SelectTrigger>
                  <SelectContent className="bg-white border border-slate-200 rounded-xl shadow-lg min-w-[180px]">
                    <SelectItem value="all" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Todas as funções</SelectItem>
                    {usedFunctionIds.map(fid => <SelectItem key={fid} value={fid!} className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">{getFunctionName(fid)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="h-9 text-sm w-28 border border-slate-200 rounded-lg bg-white text-slate-700 hover:border-blue-300 transition-colors focus:ring-2 focus:ring-blue-200"><SelectValue placeholder="Tipo" /></SelectTrigger>
                  <SelectContent className="bg-white border border-slate-200 rounded-xl shadow-lg min-w-[140px]">
                    <SelectItem value="all" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Todos</SelectItem>
                    <SelectItem value="casa" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Casa</SelectItem>
                    <SelectItem value="freelancer" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Freela</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortBy} onValueChange={(v: 'difference' | 'total') => setSortBy(v)}>
                  <SelectTrigger className="h-9 text-sm w-40 border border-slate-200 rounded-lg bg-white text-slate-700 hover:border-blue-300 transition-colors focus:ring-2 focus:ring-blue-200"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-white border border-slate-200 rounded-xl shadow-lg min-w-[180px]">
                    <SelectItem value="difference" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Maior diferença</SelectItem>
                    <SelectItem value="total" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Maior valor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Cards */}
            {sortedData.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-12 text-center">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center mx-auto mb-3">
                  <BarChart3 className="w-6 h-6 text-gray-300 dark:text-gray-500" />
                </div>
                <p className="font-semibold text-gray-500 dark:text-gray-400">Nenhuma prestação enviada para revisão</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">As prestações aparecerão aqui após serem preenchidas e enviadas no Orçamento Realizado.</p>
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

                  const statusStyles: Record<string, { bg: string; border: string; text: string; icon: any; label: string; cardBg: string; cardBorder: string }> = {
                    aprovado: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', border: 'border-emerald-200 dark:border-emerald-700', text: 'text-emerald-700 dark:text-emerald-400', icon: CheckCircle, label: 'Aprovado', cardBg: 'bg-emerald-50/40 dark:bg-emerald-950/20', cardBorder: 'border-emerald-200 dark:border-emerald-700' },
                    rejeitado: { bg: 'bg-red-100 dark:bg-red-900/30', border: 'border-red-200 dark:border-red-700', text: 'text-red-700 dark:text-red-400', icon: XCircle, label: 'Recusado', cardBg: 'bg-red-50/40 dark:bg-red-950/20', cardBorder: 'border-red-200 dark:border-red-700' },
                    devolvido: { bg: 'bg-orange-100 dark:bg-orange-900/30', border: 'border-orange-200 dark:border-orange-700', text: 'text-orange-700 dark:text-orange-400', icon: RotateCcw, label: 'Devolvido', cardBg: 'bg-orange-50/40 dark:bg-orange-950/20', cardBorder: 'border-orange-200 dark:border-orange-700' },
                  };
                  const decidedStyle = statusStyles[itemRhStatus];

                  const colName = getCollaboratorName(row.collaboratorId);
                  const cardKey = `${row.collaboratorId}-${row.functionId}`;

                  return (
                    <div
                      key={idx}
                      data-card-id={cardKey}
                      className={`rounded-2xl border overflow-hidden transition-all duration-200 ${
                        highlightCardId === cardKey ? 'ring-2 ring-emerald-400 shadow-lg shadow-emerald-100 dark:shadow-emerald-900/30' :
                        isDecided ? `${decidedStyle.cardBg} ${decidedStyle.cardBorder}` :
                        selectedItems.has(idx) ? 'bg-white dark:bg-gray-800 border-emerald-400 ring-1 ring-emerald-300/60 dark:ring-emerald-700/60 shadow-md shadow-emerald-100/60' :
                        'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      {/* Card header row — collapsible */}
                      <div
                        className="flex items-center justify-between px-4 py-3.5 cursor-pointer group"
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

                          {/* Avatar */}
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white text-[11px] font-black flex-shrink-0 shadow-sm ${avatarColor(colName)}`}>
                            {initials(colName)}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate">{colName}</span>
                              {isDecided && decidedStyle && (
                                <span className={`flex items-center gap-0.5 text-[9px] font-bold px-2 py-0.5 rounded-full ${decidedStyle.bg} ${decidedStyle.border} border ${decidedStyle.text}`}>
                                  <decidedStyle.icon className="w-2.5 h-2.5" /> {decidedStyle.label}
                                </span>
                              )}
                              {isResubmitted && (
                                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 border border-violet-200 dark:border-violet-800 text-[9px] font-semibold text-violet-700 dark:text-violet-400">
                                  <RotateCcw className="w-2.5 h-2.5" /> Reenviado
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] text-gray-400">{getFunctionName(row.functionId)}</span>
                              <span className="text-gray-300 dark:text-gray-600">·</span>
                              <span className={`text-[10px] font-semibold ${row.collaboratorType === 'casa' ? 'text-blue-500' : 'text-orange-500'}`}>
                                {row.collaboratorType === 'casa' ? 'Casa' : 'Freela'}
                              </span>
                              {hasDiff && !hasJustification && (
                                <>
                                  <span className="text-gray-300 dark:text-gray-600">·</span>
                                  <span className="flex items-center gap-0.5 text-[9px] text-amber-500 font-medium">
                                    <AlertTriangle className="w-2.5 h-2.5" /> Sem justificativa
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 shrink-0">
                          <div className="grid grid-cols-3 gap-x-5 text-right">
                            <div>
                              <span className="text-[9px] uppercase text-blue-400 tracking-wider block font-semibold">Planejado</span>
                              <span className="text-xs tabular-nums text-blue-600 dark:text-blue-400 font-bold">{fmt(plannedTotal)}</span>
                            </div>
                            <div>
                              <span className="text-[9px] uppercase text-violet-400 tracking-wider block font-semibold">Realizado</span>
                              <span className="text-xs tabular-nums text-violet-600 dark:text-violet-400 font-bold">{fmt(actualTotal)}</span>
                            </div>
                            <div>
                              <span className="text-[9px] uppercase text-gray-400 tracking-wider block font-semibold">Diferença</span>
                              {hasDiff ? (
                                <span className={`text-xs tabular-nums font-black ${diff > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                  {diff > 0 ? '+' : '−'}{fmt(Math.abs(diff))}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-300 tabular-nums">—</span>
                              )}
                            </div>
                          </div>
                          <div className={`w-6 h-6 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                          </div>
                        </div>
                      </div>

                      {/* Expanded body */}
                      {isExpanded && (
                        <div className="border-t-2 border-emerald-100 dark:border-emerald-900/60 bg-gray-50/60 dark:bg-gray-900/40">
                          <div className="p-4 space-y-3">
                            <CategoryBlock
                              title="Diárias"
                              icon={Calendar}
                              iconColor="text-blue-600 dark:text-blue-400"
                              bgColor="bg-blue-50/60 dark:bg-blue-950/20"
                              rows={[
                                { label: "Qtd. Diárias", planned: p?.dailyQuantity || 0, actual: a.dailyQuantity, isQuantity: true },
                                { label: "Valor Unitário", planned: p?.dailyValue || 0, actual: a.dailyValue },
                                { label: "Subtotal Diárias", planned: dailyPlanned, actual: dailyActual },
                              ]}
                            />

                            <CategoryBlock
                              title="Alimentação"
                              icon={Utensils}
                              iconColor="text-orange-600 dark:text-orange-400"
                              bgColor="bg-orange-50/60 dark:bg-orange-950/20"
                              rows={[
                                { label: "Almoço (Sem.)", planned: p?.weekdayLunch || 0, actual: a.weekdayLunch },
                                { label: "Jantar (Sem.)", planned: p?.weekdayDinner || 0, actual: a.weekdayDinner },
                                { label: "Almoço (FdS)", planned: p?.weekendLunch || 0, actual: a.weekendLunch },
                                { label: "Jantar (FdS)", planned: p?.weekendDinner || 0, actual: a.weekendDinner },
                              ]}
                            />

                            <CategoryBlock
                              title="Mobilidade"
                              icon={Car}
                              iconColor="text-violet-600 dark:text-violet-400"
                              bgColor="bg-violet-50/60 dark:bg-violet-950/20"
                              rows={[
                                { label: "Mobilidade", planned: p?.mobility || 0, actual: a.mobility },
                                { label: "Translado", planned: p?.transport || 0, actual: a.transport },
                              ]}
                            />

                            {/* Expanded card footer — 3 columns with emerald border */}
                            <div className={`rounded-xl border-2 p-4 ${
                              diff > 0 ? 'border-red-200 bg-gradient-to-r from-red-50/60 to-rose-50/40 dark:from-red-950/20 dark:to-rose-950/10'
                              : diff < 0 ? 'border-emerald-200 bg-gradient-to-r from-emerald-50/60 to-teal-50/40 dark:from-emerald-950/20 dark:to-teal-950/10'
                              : 'border-gray-200 bg-gray-50/60 dark:bg-gray-800/40'
                            }`}>
                              <div className="grid grid-cols-3 gap-4 text-center">
                                <div>
                                  <span className="text-[9px] uppercase text-blue-400 font-bold tracking-widest block mb-1">Total Planejado</span>
                                  <span className="text-xl font-black text-blue-700 dark:text-blue-300 tabular-nums">{fmt(plannedTotal)}</span>
                                </div>
                                <div>
                                  <span className="text-[9px] uppercase text-violet-400 font-bold tracking-widest block mb-1">Total Realizado</span>
                                  <span className="text-xl font-black text-violet-700 dark:text-violet-300 tabular-nums">{fmt(actualTotal)}</span>
                                </div>
                                <div>
                                  <span className={`text-[9px] uppercase font-bold tracking-widest block mb-1 ${diff > 0 ? 'text-red-400' : diff < 0 ? 'text-emerald-400' : 'text-gray-400'}`}>
                                    Diferença
                                  </span>
                                  <span className={`text-xl font-black tabular-nums ${diff > 0 ? 'text-red-600' : diff < 0 ? 'text-emerald-600' : 'text-gray-500'}`}>
                                    {diff > 0 ? '+' : diff < 0 ? '−' : ''}{fmt(Math.abs(diff))}
                                  </span>
                                  {hasDiff && plannedTotal > 0 && (
                                    <span className={`block text-[10px] mt-0.5 font-semibold ${diff > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                      {diff > 0 ? 'Estouro' : 'Economia'} ({Math.abs(diff / plannedTotal * 100).toFixed(1)}%)
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Justification */}
                            {a.changeReason && (
                              <div className="p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 flex items-start gap-2">
                                <MessageSquare className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                                <div>
                                  <span className="text-[9px] uppercase text-gray-400 font-bold tracking-wider">Justificativa do Responsável</span>
                                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">{a.changeReason}</p>
                                </div>
                              </div>
                            )}

                            {/* RH comment per item */}
                            {a.rhComment && (
                              <div className={`p-3 rounded-xl border flex items-start gap-2 ${
                                itemRhStatus === 'aprovado' ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-800' :
                                itemRhStatus === 'rejeitado' ? 'bg-red-50/60 dark:bg-red-950/20 border-red-100 dark:border-red-800' :
                                'bg-orange-50/60 dark:bg-orange-950/20 border-orange-100 dark:border-orange-800'
                              }`}>
                                <MessageSquare className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${itemRhStatus === 'aprovado' ? 'text-emerald-500' : itemRhStatus === 'rejeitado' ? 'text-red-500' : 'text-orange-500'}`} />
                                <div>
                                  <span className={`text-[9px] uppercase font-bold tracking-wider ${itemRhStatus === 'aprovado' ? 'text-emerald-500' : itemRhStatus === 'rejeitado' ? 'text-red-500' : 'text-orange-500'}`}>
                                    Comentário do RH
                                  </span>
                                  <p className={`text-xs mt-0.5 ${itemRhStatus === 'aprovado' ? 'text-emerald-700 dark:text-emerald-300' : itemRhStatus === 'rejeitado' ? 'text-red-700 dark:text-red-300' : 'text-orange-700 dark:text-orange-300'}`}>
                                    {a.rhComment}
                                  </p>
                                </div>
                              </div>
                            )}

                            {rhComment && !a.rhComment && (
                              <div className="p-3 rounded-xl bg-orange-50/60 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-800 flex items-start gap-2">
                                <MessageSquare className="w-3.5 h-3.5 text-orange-500 mt-0.5 flex-shrink-0" />
                                <div>
                                  <span className="text-[9px] uppercase text-orange-500 font-bold tracking-wider">Comentário do RH (geral)</span>
                                  <p className="text-xs text-orange-700 dark:text-orange-300 mt-0.5">{rhComment}</p>
                                </div>
                              </div>
                            )}
                          </div>
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

      {/* ── Fixed RH Decision footer ── */}
      {comparison && !isReadOnly && comparisonData.length > 0 && sortedData.some(r => (r.actual.rhStatus || 'pendente') === 'pendente') && (
        <div className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-4 pt-3 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700 shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.1)]">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-black text-gray-800 dark:text-gray-100">Decisão do RH</h3>
              <p className={`text-xs mt-0.5 transition-colors ${selectedItems.size > 0 ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-gray-400'}`}>
                {selectedItems.size > 0
                  ? <>{selectedItems.size} selecionado{selectedItems.size !== 1 ? 's' : ''} para ação</>
                  : <>Selecione os itens pendentes acima para tomar uma decisão</>
                }
              </p>
            </div>
            <div className="flex gap-2.5">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      className={`text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/30 h-10 text-sm px-4 rounded-xl transition-all ${selectedItems.size > 0 ? '' : 'opacity-50'}`}
                      onClick={() => setActionModal({ type: 'reject' })}
                      disabled={selectedItems.size === 0}
                    >
                      <XCircle className="w-4 h-4 mr-1.5" /> Recusar{selectedItems.size > 0 ? ` (${selectedItems.size})` : ''}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs max-w-[180px] text-center">
                    Rejeita a prestação — responsável não poderá editar novamente
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      className={`text-amber-600 border-amber-200 hover:bg-amber-50 dark:hover:bg-amber-950/30 h-10 text-sm px-4 rounded-xl transition-all ${selectedItems.size > 0 ? '' : 'opacity-50'}`}
                      onClick={() => setActionModal({ type: 'return' })}
                      disabled={selectedItems.size === 0}
                    >
                      <RotateCcw className="w-4 h-4 mr-1.5" /> Devolver{selectedItems.size > 0 ? ` (${selectedItems.size})` : ''}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs max-w-[180px] text-center">
                    Solicita correção — responsável pode editar e reenviar
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      className={`h-10 text-sm px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-md shadow-emerald-200 dark:shadow-emerald-900/30 text-white transition-all ${selectedItems.size > 0 ? 'animate-none' : 'opacity-40'}`}
                      onClick={() => setActionModal({ type: 'approve' })}
                      disabled={selectedItems.size === 0}
                    >
                      <CheckCircle className="w-4 h-4 mr-1.5" /> Aprovar{selectedItems.size > 0 ? ` (${selectedItems.size})` : ''}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs max-w-[180px] text-center">
                    Aprova e envia para faturamento
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>
      )}

      {/* ── Action confirmation modal ── */}
      <Dialog open={!!actionModal} onOpenChange={() => { setActionModal(null); setActionNote(""); }}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              {actionModal?.type === 'approve' && <><div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center"><CheckCircle className="w-4 h-4 text-emerald-600" /></div> Aprovar para Faturamento</>}
              {actionModal?.type === 'reject' && <><div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center"><XCircle className="w-4 h-4 text-red-600" /></div> Recusar Prestação</>}
              {actionModal?.type === 'return' && <><div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center"><RotateCcw className="w-4 h-4 text-amber-600" /></div> Devolver para Ajustes</>}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-3 max-h-32 overflow-y-auto">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1.5">
                {selectedItems.size} colaborador{selectedItems.size !== 1 ? 'es' : ''} selecionado{selectedItems.size !== 1 ? 's' : ''}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Array.from(selectedItems).map(idx => {
                  const row = sortedData[idx];
                  if (!row) return null;
                  const n = getCollaboratorName(row.collaboratorId);
                  return (
                    <div key={idx} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-semibold text-white ${avatarColor(n)}`}>
                      {initials(n)} <span className="opacity-90">{n.split(' ')[0]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Comentário (opcional)</label>
              <Textarea
                className="mt-1.5 rounded-xl text-sm"
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
            <Button variant="ghost" className="rounded-xl" onClick={() => { setActionModal(null); setActionNote(""); }}>Cancelar</Button>
            <Button
              onClick={handleAction}
              disabled={rhActionMutation.isPending}
              className={`rounded-xl ${
                actionModal?.type === 'approve' ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700' :
                actionModal?.type === 'reject' ? 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700' :
                'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600'
              } text-white shadow-sm`}
            >
              {rhActionMutation.isPending ? 'Processando...' :
               actionModal?.type === 'approve' ? 'Confirmar aprovação' :
               actionModal?.type === 'reject' ? 'Confirmar recusa' : 'Devolver para ajuste'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
