import { useState, useMemo, useEffect, useRef } from "react";
import { fixEncoding, parseBrNumber } from "@/lib/utils";
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
  AlertCircle, Check, Minus, GitFork, ClipboardList, X, UserX, Pencil
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { EventSearchSelect } from "@/components/event-select";
import { useSearch } from "wouter";
import type { Event, Function, Collaborator, BudgetActual, BudgetPlanned, BudgetComparison, BudgetNote, TeamInclusion } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useSidebar } from "@/contexts/sidebar-context";
import { BudgetChat, BudgetNotesBadge, BudgetNotesSnippet } from "@/components/budget-chat";
import { ActivityTimeline, PlannedEditedBadge } from "@/components/activity-timeline";

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
  // Seleção por id do BudgetActual (não por índice): filtrar/ordenar deslocava os índices
  // e o RH acabava aprovando itens errados
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [confirmAdjustOpen, setConfirmAdjustOpen] = useState(false);
  const [editingActual, setEditingActual] = useState<BudgetActual | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [splitDetail, setSplitDetail] = useState<{
    actual: BudgetActual;
    planned: BudgetPlanned | null;
    propPlanned: BudgetPlanned | null;
    isParent: boolean;
    allGroupDays: string[];
  } | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const { isCollapsed, isCompact, isFocusMode } = useSidebar();
  const qc = useQueryClient();

  const { data: events } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: functions } = useQuery<Function[]>({ queryKey: ["/api/functions"] });
  const { data: collaborators } = useQuery<Collaborator[]>({ queryKey: ["/api/collaborators"] });
  const { data: allTeamInclusions = [] } = useQuery<TeamInclusion[]>({ queryKey: ["/api/team-inclusions"] });

  const { data: comparison, isLoading: isLoadingComparison } = useQuery<BudgetComparison | null>({
    queryKey: ["/api/budget-comparison", selectedEventId],
    queryFn: async () => {
      if (!selectedEventId) return null;
      const res = await fetch(`/api/budget-comparison?eventId=${selectedEventId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!selectedEventId,
  });

  const { data: eventNotes = [] } = useQuery<BudgetNote[]>({
    queryKey: ["/api/budget-notes/by-event", "actual", selectedEventId],
    queryFn: async () => {
      const res = await fetch(`/api/budget-notes/by-event?entityType=actual&eventId=${selectedEventId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch event notes");
      return res.json();
    },
    enabled: !!selectedEventId,
  });

  const { data: plannedLogs = [] } = useQuery<any[]>({
    queryKey: ['/api/activity-logs/by-event', 'budget_planned', selectedEventId],
    queryFn: async () => {
      const res = await fetch(`/api/activity-logs/by-event?entityType=budget_planned&eventId=${selectedEventId}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedEventId,
    staleTime: 60_000,
  });

  const { data: budgetPlanned, isLoading: isLoadingPlanned } = useQuery<BudgetPlanned[]>({
    queryKey: ["/api/budget-planned", selectedEventId],
    queryFn: async () => {
      const res = await fetch(`/api/budget-planned?eventId=${selectedEventId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedEventId,
  });

  const { data: budgetActual, isLoading: isLoadingActual } = useQuery<BudgetActual[]>({
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
    onError: (err: any) => {
      toast({
        title: "Erro ao processar a ação",
        description: err?.body?.message || "Não foi possível concluir a ação do RH. Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const isRhOrAdmin = user?.role === 'admin' || user?.role === 'financial';

  const patchActualMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, number> }) => {
      const res = await apiRequest("PATCH", `/api/budget-actual/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/budget-actual"] });
      qc.invalidateQueries({ queryKey: ["/api/budget-comparison"] });
      setEditingActual(null);
      toast({ title: "Realizado atualizado pelo RH", className: "bg-amber-50 border-amber-200 text-amber-800" });
    },
    onError: () => toast({ title: "Erro ao salvar", variant: "destructive" }),
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
      rhAdjustNote: (actual as any).rhAdjustNote || '',
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
    const data: Record<string, any> = { rhAdjustNote: editForm.rhAdjustNote?.trim() || null };
    (Object.keys(parsed) as Array<keyof typeof parsed>).forEach(k => {
      if (parsed[k] !== (orig as any)[k]) data[k] = parsed[k];
    });
    const anyNumericChange = Object.keys(data).some(k => k !== 'rhAdjustNote');
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
    const actionMap: Record<string, string> = { approve: 'aprovado', reject: 'rejeitado', return: 'devolvido' };
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

  const fmt = (cents: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

  const fmtDate = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00");
    const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${d.getDate()}/${monthNames[d.getMonth()]} (${dayNames[d.getDay()]})`;
  };

  const fmtDateShort = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00");
    const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${d.getDate()}/${monthNames[d.getMonth()]}`;
  };

  const getCollaboratorName = (id?: string | null) =>
    id ? fixEncoding(collaborators?.find(c => c.id === id)?.fullName) || "-" : "-";

  const getFunctionName = (id?: string | null) =>
    id ? functions?.find(f => f.id === id)?.name || "-" : "-";

  const selectedEvent = events?.find(e => e.id === selectedEventId);

  // Helper: count days from workedDays array or return 0
  const getWorkedDayCount = (item: BudgetActual): number => {
    const wd = (item.workedDays as string[] | null) || [];
    return wd.length;
  };

  // Returns true if a YYYY-MM-DD string is Saturday or Sunday
  const isWknd = (d: string) => { const day = new Date(d + 'T12:00:00').getDay(); return day === 0 || day === 6; };

  // Helper: scale a planned record proportionally using real weekday/weekend counts from the split group
  const proportionalPlanned = (planned: BudgetPlanned, item: BudgetActual, allGroupDays: string[]): BudgetPlanned => {
    const myDays = (item.workedDays as string[] | null) || [];
    if (myDays.length === 0 || allGroupDays.length === 0) return planned;
    if (myDays.length >= allGroupDays.length) return planned;

    const origWkdays = allGroupDays.filter(d => !isWknd(d)).length;
    const origWknds  = allGroupDays.filter(d =>  isWknd(d)).length;
    const myWkdays   = myDays.filter(d => !isWknd(d)).length;
    const myWknds    = myDays.filter(d =>  isWknd(d)).length;

    const wkdayRatio = origWkdays > 0 ? myWkdays / origWkdays : 0;
    const wkndRatio  = origWknds  > 0 ? myWknds  / origWknds  : 0;
    const dayRatio   = myDays.length / allGroupDays.length;

    const propDiarias      = myDays.length * planned.dailyValue;
    const propWkdayLunch   = Math.round(planned.weekdayLunch  * wkdayRatio);
    const propWkdayDinner  = Math.round(planned.weekdayDinner * wkdayRatio);
    const propWkndLunch    = Math.round(planned.weekendLunch   * wkndRatio);
    const propWkndDinner   = Math.round(planned.weekendDinner  * wkndRatio);
    const propMobility     = Math.round(planned.mobility       * dayRatio);
    const propTransport    = Math.round(planned.transport      * dayRatio);

    return {
      ...planned,
      dailyQuantity: myDays.length,
      weekdayLunch:  propWkdayLunch,
      weekdayDinner: propWkdayDinner,
      weekendLunch:  propWkndLunch,
      weekendDinner: propWkndDinner,
      mobility:      propMobility,
      transport:     propTransport,
      totalValue:    propDiarias + propWkdayLunch + propWkdayDinner + propWkndLunch + propWkndDinner + propMobility + propTransport,
    };
  };

  const comparisonData = useMemo(() => {
    if (!budgetPlanned || !budgetActual) return [];
    const sentActual = budgetActual.filter(a => a.sentForReview);

    // Build map: parentId → split children (regardless of sentForReview on children)
    const splitChildrenMap = new Map<string, BudgetActual[]>();
    budgetActual.forEach(a => {
      if (a.splitParentId) {
        const arr = splitChildrenMap.get(a.splitParentId) || [];
        arr.push(a);
        splitChildrenMap.set(a.splitParentId, arr);
      }
    });

    const data: Array<{
      collaboratorId: string | null;
      collaboratorType: string | null;
      functionId: string | null;
      planned: BudgetPlanned | null;
      actual: BudgetActual;
      variance: number;
      isSplit: boolean;
      splitChildren: BudgetActual[];
      groupActualTotal: number;
    }> = [];

    // Only process non-child items (parents and standalone items)
    sentActual.filter(a => !a.splitParentId).forEach(a => {
      const matchingPlanned = a.plannedId
        ? budgetPlanned.find(p => p.id === a.plannedId)
        : budgetPlanned.find(p => p.collaboratorId === a.collaboratorId && p.functionId === a.functionId && p.eventId === a.eventId);

      const children = splitChildrenMap.get(a.id) || [];
      const isSplit = children.length > 0;
      // If the planned record is marked as not attended, their values are excluded from totals
      const isNotAttendedPlanned = !!(matchingPlanned as any)?.didNotAttend;
      const groupActualTotal = isNotAttendedPlanned ? 0 : (a.totalValue + children.reduce((s, c) => s + c.totalValue, 0));

      data.push({
        collaboratorId: a.collaboratorId,
        collaboratorType: a.collaboratorType,
        functionId: a.functionId,
        planned: matchingPlanned || null,
        actual: a,
        // For split groups: variance is based on the group total vs original full planned; 0 if not attended
        variance: isNotAttendedPlanned ? 0 : (matchingPlanned ? (groupActualTotal - matchingPlanned.totalValue) : groupActualTotal),
        isSplit,
        splitChildren: children,
        groupActualTotal,
      });
    });
    return data;
  }, [budgetPlanned, budgetActual]);

  // Guarda contra POSTs de recálculo desnecessários ao navegar: hash simples de
  // [eventId, nº de prestações enviadas, soma dos totalValue enviados]
  const lastCalcHashRef = useRef<string>("");
  useEffect(() => {
    if (!selectedEventId || isLoadingComparison || comparisonData.length === 0 || calculateMutation.isPending) return;
    const hash = `${selectedEventId}|${comparisonData.length}|${comparisonData.reduce((s, r) => s + r.groupActualTotal, 0)}`;
    if (hash === lastCalcHashRef.current) return; // nada mudou desde a última observação
    const isFirstObservationForEvent = !lastCalcHashRef.current.startsWith(`${selectedEventId}|`);
    lastCalcHashRef.current = hash;
    // Calcula quando ainda não existe comparativo; recalcula apenas se os actuals mudaram de fato
    if (!comparison || !isFirstObservationForEvent) {
      calculateMutation.mutate(selectedEventId);
    }
  }, [selectedEventId, comparison, isLoadingComparison, comparisonData]);

  // Limpa a seleção quando busca/filtro/ordenação mudam — itens selecionados podem sair da lista visível
  useEffect(() => {
    setSelectedItems(new Set());
  }, [searchTerm, filterFunction, filterType, sortBy]);

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
    else sorted.sort((a, b) => b.groupActualTotal - a.groupActualTotal);
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
    // Always recompute from grouped data to avoid double-counting split children
    const totalPlanned = comparisonData.reduce((s, r) => s + (r.planned?.totalValue || 0), 0);
    const totalActual = comparisonData.reduce((s, r) => s + r.groupActualTotal, 0);
    return { totalPlanned, totalActual, difference: totalActual - totalPlanned };
  }, [comparisonData]);

  const toggleExpand = (idx: number) => {
    setExpandedCards(prev => { const s = new Set(prev); if (s.has(idx)) s.delete(idx); else s.add(idx); return s; });
  };

  const rhComment = comparison?.approvalObservation || comparison?.rejectionReason || comparison?.returnReason;
  const isReadOnly = false;

  const CategoryBlock = ({ title, icon: Icon, iconColor, bgColor, stripColor, rows, badge }: {
    title: string;
    icon: any;
    iconColor: string;
    bgColor: string;
    stripColor: string;
    rows: Array<{ label: string; planned: number; actual: number; isQuantity?: boolean }>;
    badge?: string;
  }) => {
    const currencyRows = rows.filter(r => !r.isQuantity);
    const subtotalPlanned = currencyRows.reduce((s, r) => s + r.planned, 0);
    const subtotalActual  = currencyRows.reduce((s, r) => s + r.actual,  0);
    const subtotalDiff    = subtotalActual - subtotalPlanned;
    const hasAnyDiff      = rows.some(r => r.planned !== r.actual);
    const fmtVal = (v: number, isQty?: boolean) => isQty ? String(v) : fmt(v);

    return (
      <div className="rounded-xl border border-slate-100 overflow-hidden bg-slate-50/50">
        {/* Category header */}
        <div className={`flex items-center justify-between px-3 ${bgColor} border-b border-slate-100`} style={{ height: 32 }}>
          <div className="flex items-center gap-1.5">
            <div className={`w-4 h-4 rounded flex items-center justify-center ${stripColor}`}>
              <Icon className="w-2.5 h-2.5 text-white" />
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wide ${iconColor}`}>{title}</span>
            {badge && (
              <span className="text-[9px] font-medium text-slate-400 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-full leading-none">
                {badge}
              </span>
            )}
            {hasAnyDiff && (
              <span className="flex items-center gap-0.5 text-[8px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full leading-none">
                <AlertTriangle className="w-2 h-2" /> Divergência
              </span>
            )}
          </div>
          <span className={`text-[12px] font-semibold tabular-nums ${iconColor}`}>{fmt(subtotalActual)}</span>
        </div>

        {/* Rows */}
        <div className="divide-y divide-slate-100 bg-white">
          {rows.map((row, i) => {
            const diff  = row.actual - row.planned;
            const isDiff = diff !== 0;
            return (
              <div key={i} className="grid grid-cols-4 gap-2 px-3 text-[12px] items-center" style={{ height: 32 }}>
                <span className="text-slate-500 font-medium text-[11px]">{row.label}</span>
                <span className="text-right tabular-nums text-blue-600 font-medium text-[11px]">{fmtVal(row.planned, row.isQuantity)}</span>
                <span className={`text-right tabular-nums font-medium text-[11px] ${isDiff ? 'text-violet-700' : 'text-violet-400'}`}>
                  {fmtVal(row.actual, row.isQuantity)}
                </span>
                <div className="text-right">
                  {diff === 0 ? (
                    <span className="text-slate-300 tabular-nums text-[11px]">—</span>
                  ) : (
                    <span className={`tabular-nums font-semibold text-[10px] ${diff > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
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
          <div className={`grid grid-cols-4 gap-2 px-3 text-[11px] items-center border-t border-slate-100 ${subtotalDiff > 0 ? 'bg-red-50/40' : subtotalDiff < 0 ? 'bg-emerald-50/40' : 'bg-slate-50'}`} style={{ height: 28 }}>
            <span className="text-slate-400 uppercase text-[9px] tracking-wider font-semibold">Subtotal</span>
            <span className="text-right tabular-nums text-blue-700 font-semibold">{fmt(subtotalPlanned)}</span>
            <span className={`text-right tabular-nums font-semibold ${subtotalDiff !== 0 ? 'text-violet-700' : 'text-violet-500'}`}>{fmt(subtotalActual)}</span>
            <div className="text-right">
              {subtotalDiff === 0 ? (
                <span className="text-slate-300 tabular-nums">—</span>
              ) : (
                <span className={`tabular-nums text-[10px] font-semibold ${subtotalDiff > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
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
          <div className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0" style={{background:'#059669', boxShadow:'0 4px 14px rgba(5,150,105,0.4)'}}>
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-[18px] font-bold text-gray-900">Comparativo Planejado × Realizado</h1>
            <p className="text-xs text-gray-400">Análise e aprovação do RH para faturamento</p>
          </div>
        </div>
        {selectedEventId && (
          <EventSearchSelect value={selectedEventId} onValueChange={v => { setSelectedEventId(v); setExpandedCards(new Set()); setSelectedItems(new Set()); }} events={events} />
        )}
      </div>

      {/* ── No event selected ── */}
      {!selectedEventId && (
        <div className="rounded-2xl border border-emerald-100 shadow-md">
          <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 rounded-2xl px-8 py-20 flex flex-col items-center justify-center text-center">
            {/* Ícone flutuante */}
            <div className="relative w-24 h-24 mx-auto mb-8">
              <div className="absolute inset-0 rounded-2xl shadow-lg shadow-emerald-200 flex items-center justify-center rotate-3" style={{background:'linear-gradient(135deg,#059669 0%,#10b981 100%)'}}>
                <BarChart3 className="w-10 h-10 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-blue-500 rounded-xl flex items-center justify-center shadow-md">
                <DollarSign className="w-4 h-4 text-white" />
              </div>
            </div>

            <h2 className="text-2xl font-extrabold text-gray-900 mb-3">Selecione um evento</h2>
            <p className="text-sm text-gray-400 max-w-xs mx-auto leading-relaxed">
              Analise as diferenças entre o planejado e o realizado. O RH revisa e aprova os valores para faturamento.
            </p>

            <div className="max-w-sm w-full mx-auto mt-8">
              <EventSearchSelect value={selectedEventId} onValueChange={v => { setSelectedEventId(v); setExpandedCards(new Set()); setSelectedItems(new Set()); }} events={events} />
            </div>
          </div>
        </div>
      )}

      {selectedEventId && selectedEvent && (
        <>
          {/* ── Stepper ── */}
          {(() => {
            const currentStep = 3;
            const steps = [
              { label: "Escalação", desc: "Inclusões confirmadas" },
              { label: "Planejamento RH", desc: "Valores previstos" },
              { label: "Prestação de contas", desc: "Resp. preenche o realizado" },
              { label: "Aprovação RH", desc: "Análise e aprovação final" },
              { label: "Nota Fiscal", desc: "Envio da nota" },
            ];
            return (
              <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4">
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
                              <div className="absolute inset-0 rounded-full opacity-30 animate-ping" style={{background:'#059669'}} />
                            )}
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold relative`}
                              style={{
                                background: isDone ? '#059669' : isActive ? '#059669' : '#F1F5F9',
                                color: (isDone || isActive) ? '#fff' : '#94A3B8',
                              }}>
                              {isDone ? <Check className="w-3.5 h-3.5" /> : (i + 1)}
                            </div>
                          </div>
                          <div className="min-w-0">
                            <div className="text-[11px] font-semibold leading-tight" style={{color: (isDone || isActive) ? '#059669' : '#94A3B8'}}>{step.label}</div>
                            <div className="text-[9px] text-slate-400 leading-tight mt-0.5">{step.desc}</div>
                          </div>
                        </div>
                        {!isLast && (
                          <div className={`flex-1 h-[2px] mx-3 rounded-full`} style={{background: isDone ? '#059669' : '#E2E8F0'}} />
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
              sentCount > 0 && { icon: Send, count: sentCount, label: `para análise`, bg: 'bg-blue-50', border: 'border-blue-200', iconColor: 'text-blue-500', numColor: 'text-blue-700', textColor: 'text-blue-500/70' },
              approvedCount > 0 && { icon: CheckCircle, count: approvedCount, label: `aprovado${approvedCount !== 1 ? 's' : ''}`, bg: 'bg-emerald-50', border: 'border-emerald-200', iconColor: 'text-emerald-500', numColor: 'text-emerald-700', textColor: 'text-emerald-600/70' },
              rejectedCount > 0 && { icon: XCircle, count: rejectedCount, label: `recusado${rejectedCount !== 1 ? 's' : ''}`, bg: 'bg-red-50', border: 'border-red-200', iconColor: 'text-red-500', numColor: 'text-red-700', textColor: 'text-red-600/70' },
              returnedCount > 0 && { icon: RotateCcw, count: returnedCount, label: `devolvido${returnedCount !== 1 ? 's' : ''}`, bg: 'bg-orange-50', border: 'border-orange-200', iconColor: 'text-orange-500', numColor: 'text-orange-700', textColor: 'text-orange-600/70' },
              pendingCount > 0 && { icon: Clock, count: pendingCount, label: `pendente${pendingCount !== 1 ? 's' : ''}`, bg: 'bg-amber-50', border: 'border-amber-200', iconColor: 'text-amber-500', numColor: 'text-amber-700', textColor: 'text-amber-600/70' },
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
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200">
                  <ListChecks className="w-3 h-3 text-slate-400" />
                  <span className="text-sm font-bold text-slate-600">{totalActualItems}</span>
                  <span className="text-[10px] text-slate-400">total</span>
                </div>
              </div>
            );
          })()}

          {/* ── 3 Metric cards ── */}
          <div className="grid grid-cols-3 gap-3">
            {/* Planejado */}
            <div className="rounded-xl border border-blue-100 p-5" style={{background:'#F0F7FF'}}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] uppercase text-slate-500 font-medium tracking-widest">Total Planejado</p>
                <div className="w-7 h-7 rounded-lg bg-blue-100/60 flex items-center justify-center">
                  <DollarSign className="w-3.5 h-3.5 text-blue-500" />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900 tabular-nums">{fmt(totals.totalPlanned)}</p>
              <p className="text-[10px] text-slate-400 font-light mt-1.5">Orçamento aprovado para o evento</p>
            </div>

            {/* Realizado */}
            <div className="rounded-xl border border-purple-100 p-5" style={{background:'#F5F3FF'}}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] uppercase text-slate-500 font-medium tracking-widest">Total Realizado</p>
                <div className="w-7 h-7 rounded-lg bg-violet-100/60 flex items-center justify-center">
                  <BarChart3 className="w-3.5 h-3.5 text-violet-500" />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900 tabular-nums">{fmt(totals.totalActual)}</p>
              <p className="text-[10px] text-slate-400 font-light mt-1.5">Valores prestados e enviados</p>
            </div>

            {/* Diferença */}
            <div className={`rounded-xl border p-5 ${
              totals.difference === 0 ? 'border-slate-100 bg-slate-50' :
              totals.difference < 0 ? 'border-emerald-100 bg-emerald-50' :
              'border-red-100'
            }`} style={totals.difference > 0 ? {background:'#FEF2F2'} : {}}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] uppercase text-slate-500 font-medium tracking-widest">Diferença</p>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                  totals.difference === 0 ? 'bg-slate-100/60' :
                  totals.difference < 0 ? 'bg-emerald-100/60' : 'bg-red-100/60'
                }`}>
                  {totals.difference === 0 ? <Minus className="w-3.5 h-3.5 text-slate-400" /> :
                   totals.difference < 0 ? <TrendingDown className="w-3.5 h-3.5 text-emerald-500" /> :
                   <TrendingUp className="w-3.5 h-3.5 text-red-400" />}
                </div>
              </div>
              <p className={`text-2xl font-bold tabular-nums ${
                totals.difference === 0 ? 'text-slate-400' :
                totals.difference < 0 ? 'text-emerald-700' : 'text-red-600'
              }`}>
                {totals.difference > 0 ? '+' : totals.difference < 0 ? '−' : ''}{fmt(Math.abs(totals.difference))}
              </p>
              <div className="flex items-center gap-1.5 mt-1.5">
                <p className={`text-[10px] font-light ${
                  totals.difference === 0 ? 'text-slate-400' :
                  totals.difference < 0 ? 'text-emerald-600' : 'text-red-500'
                }`}>
                  {totals.difference === 0 ? 'Sem diferença' : totals.difference < 0 ? 'Economia' : 'Acima do planejado'}
                </p>
                {totals.totalPlanned > 0 && totals.difference !== 0 && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    totals.difference < 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {Math.abs(totals.difference / totals.totalPlanned * 100).toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── Info banner ── */}
          <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl">
            <Info className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span className="text-[11px] text-slate-500">
              Valores referentes apenas às prestações enviadas para revisão pelo responsável de função
            </span>
          </div>

          {/* ── RH comment banner ── */}
          {rhComment && (
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 flex items-start gap-2.5">
              <MessageSquare className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Comentário do RH</span>
                <p className="text-sm text-slate-700 mt-0.5">{rhComment}</p>
              </div>
            </div>
          )}

          {/* ── Detalhamento section ── */}
          <div>
            <div className="mb-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-black text-slate-800">Detalhamento por Prestação</h2>
                  <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{sortedData.length}</span>
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
                  {isRhOrAdmin && !isReadOnly && (
                    <Button
                      size="sm" variant="ghost"
                      className="text-xs h-7 gap-1 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                      onClick={() => {
                        const selectableIds = sortedData
                          .filter(row => (row.actual.rhStatus || 'pendente') === 'pendente')
                          .map(row => row.actual.id);
                        if (selectedItems.size > 0) setSelectedItems(new Set());
                        else setSelectedItems(new Set(selectableIds));
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
                  <SelectTrigger className="h-9 text-sm w-auto min-w-[160px] border border-slate-200 rounded-lg bg-white text-slate-700 hover:border-blue-300 transition-colors focus:ring-2 focus:ring-blue-200"><SelectValue placeholder="Função" /></SelectTrigger>
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
                    <SelectItem value="freela" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Freela</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortBy} onValueChange={(v: 'difference' | 'total') => setSortBy(v)}>
                  <SelectTrigger className="h-9 text-sm w-auto min-w-[160px] border border-slate-200 rounded-lg bg-white text-slate-700 hover:border-blue-300 transition-colors focus:ring-2 focus:ring-blue-200"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-white border border-slate-200 rounded-xl shadow-lg min-w-[180px]">
                    <SelectItem value="difference" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Maior diferença</SelectItem>
                    <SelectItem value="total" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Maior valor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Cards */}
            {(isLoadingPlanned || isLoadingActual) ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-slate-400">Carregando prestações...</p>
              </div>
            ) : sortedData.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-12 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                  <BarChart3 className="w-6 h-6 text-slate-300" />
                </div>
                <p className="font-semibold text-slate-500">Nenhuma prestação enviada para revisão</p>
                <p className="text-sm text-slate-400 mt-1">As prestações aparecerão aqui após serem preenchidas e enviadas no Orçamento Realizado.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sortedData.map((row, idx) => {
                  const isExpanded = expandedCards.has(idx);
                  const p = row.planned;
                  const a = row.actual;
                  const plannedTotal = p?.totalValue || 0;
                  const actualTotal = row.groupActualTotal;
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
                    aprovado: { bg: 'bg-emerald-100', border: 'border-emerald-200', text: 'text-emerald-700', icon: CheckCircle, label: 'Aprovado', cardBg: 'bg-emerald-50/40', cardBorder: 'border-emerald-200' },
                    rejeitado: { bg: 'bg-red-100', border: 'border-red-200', text: 'text-red-700', icon: XCircle, label: 'Recusado', cardBg: 'bg-red-50/40', cardBorder: 'border-red-200' },
                    devolvido: { bg: 'bg-orange-100', border: 'border-orange-200', text: 'text-orange-700', icon: RotateCcw, label: 'Devolvido', cardBg: 'bg-orange-50/40', cardBorder: 'border-orange-200' },
                  };
                  const decidedStyle = statusStyles[itemRhStatus];

                  const colName = getCollaboratorName(row.collaboratorId);
                  const cardKey = `${row.collaboratorId}-${row.functionId}`;

                  const isNotAttended = !!(row.planned as any)?.didNotAttend;

                  // Period from team inclusion
                  const cardTi = allTeamInclusions.find(t =>
                    t.eventId === selectedEventId &&
                    t.collaboratorId === row.collaboratorId &&
                    t.functionId === row.functionId
                  );
                  const tiStart = (cardTi as any)?.actualStartDate || (cardTi as any)?.scheduleStartDate;
                  const tiEnd   = (cardTi as any)?.actualEndDate   || (cardTi as any)?.scheduleEndDate;
                  const fmtPeriodDate = (d: string) => {
                    const dt = new Date(d + "T12:00:00");
                    return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
                  };
                  const periodLabel = tiStart && tiEnd ? `${fmtPeriodDate(tiStart)} – ${fmtPeriodDate(tiEnd)}` : null;

                  return (
                    <div
                      key={idx}
                      data-card-id={cardKey}
                      className={`rounded-xl border overflow-hidden transition-all duration-200 ${
                        isNotAttended ? 'bg-slate-50 border-slate-300 border-dashed opacity-75' :
                        highlightCardId === cardKey ? 'ring-2 ring-emerald-400 shadow-lg shadow-emerald-100' :
                        isDecided ? `${decidedStyle.cardBg} ${decidedStyle.cardBorder}` :
                        selectedItems.has(a.id) ? 'bg-white border-emerald-400 ring-1 ring-emerald-300/60 shadow-md shadow-emerald-100/60' :
                        'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {/* Status stripe on top */}
                      {isDecided && (
                        <div className={`h-[2.5px] ${itemRhStatus === 'aprovado' ? 'bg-emerald-400' : itemRhStatus === 'rejeitado' ? 'bg-red-400' : 'bg-orange-400'}`} />
                      )}

                      {/* Card header row — collapsible */}
                      <div
                        className="flex items-center justify-between px-4 py-3 cursor-pointer"
                        onClick={() => toggleExpand(idx)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleExpand(idx);
                          }
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {isRhOrAdmin && !isReadOnly && !isDecided && (
                            <Checkbox
                              checked={selectedItems.has(a.id)}
                              onCheckedChange={(checked) => {
                                const next = new Set(selectedItems);
                                if (checked) next.add(a.id); else next.delete(a.id);
                                setSelectedItems(next);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="shrink-0 border-slate-300 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                            />
                          )}

                          {/* Avatar */}
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white text-[11px] font-black flex-shrink-0 ${avatarColor(colName)}`}>
                            {initials(colName)}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-semibold text-slate-800 truncate">{colName}</span>
                              {row.isSplit && (
                                <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-purple-50 text-[10px] font-semibold text-purple-700 shrink-0">
                                  <GitFork className="w-2.5 h-2.5" /> Dividida
                                </span>
                              )}
                              {isDecided && decidedStyle && (
                                <span className={`flex items-center gap-1 text-[10px] font-semibold px-3 py-1 rounded-full ${decidedStyle.bg} ${decidedStyle.text} shrink-0`}>
                                  <decidedStyle.icon className="w-2.5 h-2.5" /> {decidedStyle.label}
                                </span>
                              )}
                              {isResubmitted && (
                                <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-violet-50 text-[10px] font-semibold text-violet-700 shrink-0">
                                  <RotateCcw className="w-2.5 h-2.5" /> Reenviado
                                </span>
                              )}
                              {isNotAttended && (
                                <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-slate-100 text-[10px] font-semibold text-slate-500 shrink-0">
                                  <UserX className="w-2.5 h-2.5" /> Não participou
                                </span>
                              )}
                              {eventNotes.length > 0 && (
                                <BudgetNotesBadge notes={eventNotes} entityId={a.id} />
                              )}
                              {row.planned && (
                                <PlannedEditedBadge logs={plannedLogs} entityId={(row.planned as any).id} />
                              )}
                            </div>
                            {eventNotes.length > 0 && (
                              <BudgetNotesSnippet notes={eventNotes} entityId={a.id} />
                            )}
                            {/* Not-attended reason snippet */}
                            {isNotAttended && (row.planned as any)?.didNotAttendReason && (
                              <p className="text-[10px] italic mt-0.5 text-slate-400 leading-snug max-w-xs truncate">
                                {(row.planned as any).didNotAttendReason}
                              </p>
                            )}
                            {/* RH comment snippet */}
                            {isDecided && a.rhComment && (itemRhStatus === 'rejeitado' || itemRhStatus === 'devolvido') && (
                              <p className={`text-[10px] italic mt-0.5 leading-snug max-w-xs truncate ${itemRhStatus === 'rejeitado' ? 'text-red-500' : 'text-orange-500'}`}>
                                "{a.rhComment}"
                              </p>
                            )}
                            <div className="flex items-center gap-1.5 mt-0.5 overflow-hidden">
                              <span className="text-[10px] text-slate-400 truncate shrink min-w-0">{getFunctionName(row.functionId)}</span>
                              <span className="text-slate-300 shrink-0">·</span>
                              <span className={`text-[10px] font-semibold shrink-0 ${row.collaboratorType === 'casa' ? 'text-blue-500' : 'text-orange-500'}`}>
                                {row.collaboratorType === 'casa' ? 'Casa' : 'Freela'}
                              </span>
                              {periodLabel && (
                                <>
                                  <span className="text-slate-300 shrink-0">·</span>
                                  <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">{periodLabel}</span>
                                </>
                              )}
                              {row.isSplit && (
                                <>
                                  <span className="text-slate-300 shrink-0">·</span>
                                  <span className="text-[10px] text-purple-500 font-medium truncate shrink min-w-0">
                                    {[a, ...row.splitChildren].map(c => getCollaboratorName(c.collaboratorId)).join(' + ')}
                                  </span>
                                </>
                              )}
                              {hasDiff && !hasJustification && !row.isSplit && (
                                <>
                                  <span className="text-slate-300 shrink-0">·</span>
                                  <span className="flex items-center gap-0.5 text-[9px] text-amber-500 font-medium shrink-0">
                                    <AlertTriangle className="w-2.5 h-2.5" /> Sem justificativa
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {/* Mini values strip */}
                          <div className="flex items-center divide-x divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
                            {/* Plan. — referência discreta */}
                            <div className="px-3 py-1.5 text-center w-28">
                              <span className="text-[9px] uppercase font-medium text-slate-400 tracking-wider block leading-tight">Plan.</span>
                              <span className="text-sm tabular-nums text-slate-400 font-light">{fmt(plannedTotal)}</span>
                            </div>
                            {/* Real. — protagonista */}
                            <div className="px-3 py-1.5 text-center w-28" style={{background:'#F5F3FF'}}>
                              <span className="text-[9px] uppercase font-medium text-slate-500 tracking-wider block leading-tight">Real.</span>
                              <span className="text-base tabular-nums text-slate-900 font-bold">{fmt(actualTotal)}</span>
                            </div>
                            {/* Dif. — alerta imediato */}
                            <div className={`px-3 py-1.5 text-center w-28 ${hasDiff ? (diff > 0 ? 'bg-red-50' : 'bg-emerald-50') : ''}`}>
                              <span className="text-[9px] uppercase font-medium text-slate-400 tracking-wider block leading-tight">Dif.</span>
                              {hasDiff ? (
                                <span className={`text-sm tabular-nums font-bold ${diff > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                  {diff > 0 ? '+' : '−'}{fmt(Math.abs(diff))}
                                </span>
                              ) : (
                                <span className="text-sm text-slate-300 tabular-nums font-normal">—</span>
                              )}
                            </div>
                          </div>
                          {isRhOrAdmin && !['aprovado', 'rejeitado'].includes(a.rhStatus || '') && (
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-amber-50 transition-colors"
                                    onClick={(e) => { e.stopPropagation(); openEditModal(a); }}
                                    title="Editar realizado (RH)"
                                  >
                                    <Pencil className="w-3.5 h-3.5 text-amber-500" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="text-xs">Editar realizado (RH)</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          <ChevronDown className={`w-4 h-4 text-slate-400 hover:text-slate-700 transition-all duration-200 cursor-pointer ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                      </div>

                      {/* Expanded body */}
                      {isExpanded && (
                        <div className="border-t border-slate-100 bg-slate-50">
                          <div className="p-6 space-y-4">

                            {/* ── Not attended notice ── */}
                            {isNotAttended && (
                              <div className="flex items-start gap-2.5 bg-slate-100 rounded-xl px-4 py-3 border border-slate-200">
                                <UserX className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                                <div>
                                  <p className="text-sm font-semibold text-slate-600">Colaborador não participou do evento</p>
                                  <p className="text-[11px] text-slate-400 mt-0.5">Os valores do Realizado e a Diferença são excluídos dos totais. O Planejado permanece para referência.</p>
                                  {(row.planned as any)?.didNotAttendReason && <p className="text-[11px] text-slate-500 mt-1 italic">Motivo: {(row.planned as any).didNotAttendReason}</p>}
                                </div>
                              </div>
                            )}

                            {/* ── Split group sub-rows ── */}
                            {row.isSplit && (
                              <div className="rounded-xl border border-purple-200 overflow-hidden">
                                <div className="h-[3px] bg-purple-500" />
                                <div className="flex items-center gap-1.5 px-3 py-2 bg-purple-50/80 border-b border-purple-100">
                                  <div className="w-4 h-4 rounded bg-purple-500 flex items-center justify-center">
                                    <GitFork className="w-2.5 h-2.5 text-white" />
                                  </div>
                                  <span className="text-[10px] font-black uppercase tracking-wide text-purple-700">
                                    Detalhamento por Colaborador
                                  </span>
                                </div>
                                <div className="grid grid-cols-6 gap-2 px-3 py-1.5 bg-slate-50 border-b border-slate-100">
                                  <span className="text-[9px] uppercase text-slate-400 font-semibold tracking-wider col-span-2">Colaborador</span>
                                  <span className="text-[9px] uppercase text-blue-500 font-bold tracking-wider text-right">Plan. prop.</span>
                                  <span className="text-[9px] uppercase text-violet-500 font-bold tracking-wider text-right">Realizado</span>
                                  <span className="text-[9px] uppercase text-slate-400 font-semibold tracking-wider text-right">Diferença</span>
                                  <span className="text-[9px] uppercase text-slate-300 font-semibold tracking-wider text-center"></span>
                                </div>
                                {[a, ...row.splitChildren].map((colItem, ci) => {
                                  const isParent = ci === 0;
                                  const colItemName = getCollaboratorName(colItem.collaboratorId);
                                  const allGroupDays = [...(a.workedDays as string[] || []), ...row.splitChildren.flatMap(c => (c.workedDays as string[] || []))].sort();
                                  const colProp = p ? proportionalPlanned(p, colItem, allGroupDays) : null;
                                  const colPlanned = colProp?.totalValue || 0;
                                  const colActual = colItem.totalValue;
                                  const colDiff = colActual - colPlanned;
                                  const colDays = getWorkedDayCount(colItem);
                                  return (
                                    <div key={ci} className={`grid grid-cols-6 gap-2 px-3 py-2.5 items-center text-[11px] border-b border-slate-50 ${ci % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}`}>
                                      <div className="col-span-2 flex items-center gap-2 min-w-0">
                                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-white text-[9px] font-black flex-shrink-0 ${avatarColor(colItemName)}`}>
                                          {initials(colItemName)}
                                        </div>
                                        <div className="min-w-0">
                                          <p className="font-semibold text-slate-700 truncate text-[11px]">{colItemName}</p>
                                          <div className="flex items-center gap-1">
                                            <span className={`text-[9px] font-bold px-1 py-0 rounded-full ${isParent ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                                              {isParent ? 'Titular' : 'Divisão'}
                                            </span>
                                            {colDays > 0 && (
                                              <span className="text-[9px] text-slate-400">{colDays}d</span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                      <span className="text-right tabular-nums text-blue-600 font-medium">{fmt(colPlanned)}</span>
                                      <span className="text-right tabular-nums text-violet-600 font-semibold">{fmt(colActual)}</span>
                                      <div className="text-right">
                                        {colDiff === 0 ? (
                                          <span className="text-slate-300 tabular-nums">—</span>
                                        ) : (
                                          <span className={`tabular-nums font-bold text-[10px] ${colDiff > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                            {colDiff > 0 ? '+' : '−'}{fmt(Math.abs(colDiff))}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex justify-center">
                                        <button
                                          onClick={e => {
                                            e.stopPropagation();
                                            setSplitDetail({ actual: colItem, planned: p, propPlanned: colProp, isParent, allGroupDays });
                                          }}
                                          className="w-6 h-6 rounded-md flex items-center justify-center bg-slate-100 hover:bg-purple-100 text-slate-400 hover:text-purple-600 transition-colors"
                                          title="Ver detalhes completos"
                                        >
                                          <ClipboardList className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                                <div className={`grid grid-cols-6 gap-2 px-3 py-2 text-[11px] items-center border-t-2 border-slate-100 font-bold ${diff > 0 ? 'bg-red-50/40' : diff < 0 ? 'bg-emerald-50/40' : 'bg-slate-50'}`}>
                                  <span className="text-slate-500 uppercase text-[9px] tracking-wider col-span-2">Total do Grupo</span>
                                  <span className="text-right tabular-nums text-blue-700">{fmt(plannedTotal)}</span>
                                  <span className="text-right tabular-nums text-violet-700">{fmt(actualTotal)}</span>
                                  <div className="text-right col-span-2">
                                    {diff === 0 ? (
                                      <span className="text-slate-300 tabular-nums">—</span>
                                    ) : (
                                      <span className={`tabular-nums text-[10px] ${diff > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                        {diff > 0 ? '+' : '−'}{fmt(Math.abs(diff))}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* ── Detail blocks (only for non-split) ── */}
                            {!row.isSplit && <>
                            {/* Shared column headers — shown once above all sections */}
                            <div className="grid grid-cols-4 gap-2 px-3 border border-slate-100 rounded-lg bg-slate-50/80" style={{ height: 28 }}>
                              <span className="text-[9px] uppercase text-slate-400 font-semibold tracking-wider flex items-center">Item</span>
                              <span className="text-[9px] uppercase text-[#0033CC] font-semibold tracking-wider flex items-center justify-end">Planejado</span>
                              <span className="text-[9px] uppercase text-[#6d28d9] font-semibold tracking-wider flex items-center justify-end">Realizado</span>
                              <span className="text-[9px] uppercase text-slate-400 font-semibold tracking-wider flex items-center justify-end">Diferença</span>
                            </div>
                            <CategoryBlock
                              title="Diárias"
                              icon={Calendar}
                              iconColor="text-indigo-700"
                              bgColor="bg-indigo-50/60"
                              stripColor="bg-indigo-500"
                              rows={[
                                { label: "Qtd. Diárias", planned: p?.dailyQuantity || 0, actual: a.dailyQuantity, isQuantity: true },
                                { label: "Valor Unitário", planned: p?.dailyValue || 0, actual: a.dailyValue },
                                { label: "Subtotal Diárias", planned: dailyPlanned, actual: dailyActual },
                              ]}
                            />

                            <CategoryBlock
                              title="Alimentação"
                              icon={Utensils}
                              iconColor="text-orange-700"
                              bgColor="bg-orange-50/60"
                              stripColor="bg-orange-400"
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
                              iconColor="text-violet-700"
                              bgColor="bg-violet-50/60"
                              stripColor="bg-violet-500"
                              rows={[
                                { label: "Mobilidade", planned: p?.mobility || 0, actual: a.mobility },
                              ]}
                            />
                            </>}

                            {/* Expanded card footer — compact single row */}
                            <div className={`flex items-center gap-0 rounded-xl border-2 overflow-hidden ${
                              diff > 0 ? 'border-red-100' : diff < 0 ? 'border-emerald-100' : 'border-slate-100'
                            }`} style={{ height: 44 }}>
                              <div className="flex-1 flex items-center justify-center gap-2 bg-white border-r border-slate-100 h-full">
                                <span className="text-[9px] uppercase text-slate-400 font-semibold tracking-widest">Planejado</span>
                                <span className="text-[14px] font-semibold text-slate-500 tabular-nums">{fmt(plannedTotal)}</span>
                              </div>
                              <div className="flex-1 flex items-center justify-center gap-2 h-full" style={{ background: '#F5F3FF' }}>
                                <span className="text-[9px] uppercase text-violet-500 font-bold tracking-widest">Realizado</span>
                                <span className="text-[16px] font-extrabold text-violet-700 tabular-nums">{fmt(actualTotal)}</span>
                              </div>
                              <div className={`flex-1 flex items-center justify-center gap-2 h-full ${
                                diff > 0 ? 'bg-red-50' : diff < 0 ? 'bg-emerald-50' : 'bg-slate-50'
                              }`}>
                                <span className="text-[9px] uppercase text-slate-400 font-semibold tracking-widest">Diferença</span>
                                {diff === 0 ? (
                                  <span className="text-[14px] text-slate-300 tabular-nums">—</span>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-[14px] font-bold tabular-nums ${diff > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                      {diff > 0 ? '+' : '−'}{fmt(Math.abs(diff))}
                                    </span>
                                    {plannedTotal > 0 && (
                                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                        diff > 0 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
                                      }`}>
                                        {Math.abs(diff / plannedTotal * 100).toFixed(1)}%
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Justification */}
                            {a.changeReason && (
                              <div className="p-3 rounded-xl bg-white border border-slate-100 flex items-start gap-2">
                                <MessageSquare className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                                <div>
                                  <span className="text-[9px] uppercase text-slate-400 font-bold tracking-wider">Justificativa do Responsável</span>
                                  <p className="text-xs text-slate-600 mt-0.5">{a.changeReason}</p>
                                </div>
                              </div>
                            )}

                            {/* RH comment per item */}
                            {a.rhComment && (
                              <div className={`p-3 rounded-xl border flex items-start gap-2 ${
                                itemRhStatus === 'aprovado' ? 'bg-emerald-50/60 border-emerald-100' :
                                itemRhStatus === 'rejeitado' ? 'bg-red-50/60 border-red-100' :
                                'bg-orange-50/60 border-orange-100'
                              }`}>
                                <MessageSquare className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${itemRhStatus === 'aprovado' ? 'text-emerald-500' : itemRhStatus === 'rejeitado' ? 'text-red-500' : 'text-orange-500'}`} />
                                <div>
                                  <span className={`text-[9px] uppercase font-bold tracking-wider ${itemRhStatus === 'aprovado' ? 'text-emerald-500' : itemRhStatus === 'rejeitado' ? 'text-red-500' : 'text-orange-500'}`}>
                                    Comentário do RH
                                  </span>
                                  <p className={`text-xs mt-0.5 ${itemRhStatus === 'aprovado' ? 'text-emerald-700' : itemRhStatus === 'rejeitado' ? 'text-red-700' : 'text-orange-700'}`}>
                                    {a.rhComment}
                                  </p>
                                </div>
                              </div>
                            )}

                            {rhComment && !a.rhComment && (
                              <div className="p-3 rounded-xl bg-orange-50/60 border border-orange-100 flex items-start gap-2">
                                <MessageSquare className="w-3.5 h-3.5 text-orange-500 mt-0.5 flex-shrink-0" />
                                <div>
                                  <span className="text-[9px] uppercase text-orange-500 font-bold tracking-wider">Comentário do RH (geral)</span>
                                  <p className="text-xs text-orange-700 mt-0.5">{rhComment}</p>
                                </div>
                              </div>
                            )}

                            {/* ── Observação do ajuste do RH ── */}
                            {(a as any).rhAdjustNote && (
                              <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 flex items-start gap-2">
                                <MessageSquare className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                                <div>
                                  <span className="text-[9px] uppercase text-amber-600 font-bold tracking-wider">Observação do Ajuste (RH)</span>
                                  <p className="text-xs text-amber-800 mt-0.5">{(a as any).rhAdjustNote}</p>
                                </div>
                              </div>
                            )}

                            {/* ── Aviso: planejamento alterado pelo RH ── */}
                            {row.planned && (() => {
                              const planId = (row.planned as any).id;
                              const hasEdits = plannedLogs.some(l => l.entity_id === planId && l.action === 'update');
                              if (!hasEdits) return null;
                              const last = plannedLogs
                                .filter(l => l.entity_id === planId && l.action === 'update')
                                .sort((x: any, y: any) => new Date(y.created_at || 0).getTime() - new Date(x.created_at || 0).getTime())[0];
                              return (
                                <div className="flex items-start gap-2 p-3 rounded-xl border border-amber-200 bg-amber-50">
                                  <span className="text-amber-500 text-base leading-none shrink-0">⚠️</span>
                                  <div>
                                    <p className="text-[11px] font-semibold text-amber-800">Orçamento Planejado foi alterado pelo RH</p>
                                    {last && <p className="text-[10px] text-amber-600 mt-0.5">Última edição por {last.user_name || '?'} — os valores de referência podem ter mudado após o envio.</p>}
                                  </div>
                                </div>
                              );
                            })()}

                            {/* ── Chat de Auditoria ── */}
                            <BudgetChat
                              entityType="actual"
                              entityId={a.id}
                              eventId={a.eventId}
                              linkedEntityType={a.plannedId ? "planned" : undefined}
                              linkedEntityId={a.plannedId || undefined}
                            />

                            {/* ── Histórico de alterações ── */}
                            <ActivityTimeline entityType="budget_actual" entityId={a.id} />
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

      {/* ── Fixed RH Decision footer — apenas RH/admin decide ── */}
      {isRhOrAdmin && comparison && !isReadOnly && comparisonData.length > 0 && sortedData.some(r => (r.actual.rhStatus || 'pendente') === 'pendente') && (
        <div className={`fixed bottom-0 right-0 z-40 px-6 pb-4 pt-3 bg-white/95 backdrop-blur-sm border-t border-slate-200 shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.08)] transition-all duration-300 ${(isCollapsed || isFocusMode) ? 'left-0' : isCompact ? 'left-14' : 'left-[260px]'}`}>
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-black text-slate-800">Decisão do RH</h3>
              <p className={`text-xs mt-0.5 transition-colors ${selectedItems.size > 0 ? 'text-emerald-600 font-medium' : 'text-slate-400'}`}>
                {selectedItems.size > 0
                  ? <>{selectedItems.size} selecionado{selectedItems.size !== 1 ? 's' : ''} para ação</>
                  : <>Selecione os itens pendentes acima para tomar uma decisão</>
                }
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Secondary actions */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      className="h-9 text-sm px-4 rounded-xl font-semibold bg-red-50 hover:bg-red-100 text-red-600 border-none shadow-none disabled:opacity-40"
                      onClick={() => setActionModal({ type: 'reject' })}
                      disabled={selectedItems.size === 0}
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1.5" /> Recusar{selectedItems.size > 0 ? ` (${selectedItems.size})` : ''}
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
                      className="h-9 text-sm px-4 rounded-xl font-semibold bg-amber-100 hover:bg-amber-200 text-amber-700 border border-amber-200 shadow-none disabled:opacity-40"
                      onClick={() => setActionModal({ type: 'return' })}
                      disabled={selectedItems.size === 0}
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Devolver{selectedItems.size > 0 ? ` (${selectedItems.size})` : ''}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs max-w-[180px] text-center">
                    Solicita correção — responsável pode editar e reenviar
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {/* Divider */}
              <div className="w-px h-6 bg-slate-200 mx-1" />
              {/* Primary approve action */}
              {(() => {
                const selectedRhAdjustedFields = sortedData
                  .filter(row => selectedItems.has(row.actual.id))
                  .reduce((total, row) => {
                    const allActuals = [row.actual, ...(row.isSplit ? row.splitChildren : [])];
                    return total + allActuals.reduce((n, a) => {
                      const f = (a as any).rhAdjustedFields;
                      return n + (f ? Object.keys(JSON.parse(f)).length : 0);
                    }, 0);
                  }, 0);
                const hasAdjusted = selectedRhAdjustedFields > 0;
                return (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          className="h-9 text-sm px-5 rounded-xl text-white font-bold bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-100 disabled:opacity-40"
                          onClick={() => {
                            if (hasAdjusted) {
                              setConfirmAdjustOpen(true);
                            } else {
                              setActionModal({ type: 'approve' });
                            }
                          }}
                          disabled={selectedItems.size === 0}
                        >
                          <CheckCircle className="w-4 h-4 mr-1.5" />
                          {hasAdjusted
                            ? `Aprovar com ajustes (${selectedRhAdjustedFields} campo${selectedRhAdjustedFields !== 1 ? 's' : ''})`
                            : selectedItems.size > 0 ? `Aprovar e Finalizar (${selectedItems.size})` : 'Aprovar e Finalizar'}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs max-w-[180px] text-center">
                        Aprova e envia para faturamento
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal edição do realizado pelo RH ── */}
      <Dialog open={!!editingActual} onOpenChange={(open) => { if (!open) setEditingActual(null); }}>
        <DialogContent style={{display:'flex', flexDirection:'column', maxHeight:'90vh', maxWidth:'480px'}} className="rounded-2xl p-0 gap-0">
          {editingActual && (
            <>
              <div className="px-6 pt-5 pb-4 border-b border-slate-100 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                    <Pencil className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-bold text-slate-900">Editar Realizado</h3>
                    <p className="text-[11px] text-amber-600 font-medium">Ajuste do RH — ficará registrado no histórico</p>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-4">
                {/* Diárias */}
                <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 space-y-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Diárias</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-500 font-medium block mb-1">Quantidade</label>
                      <Input
                        type="number" min={0}
                        value={editForm.dailyQuantity}
                        onChange={e => setEditForm(f => ({...f, dailyQuantity: e.target.value}))}
                        className="h-8 text-sm text-right tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 font-medium block mb-1">Valor/dia (R$)</label>
                      <Input
                        type="text" inputMode="decimal"
                        value={editForm.dailyValue}
                        onChange={e => setEditForm(f => ({...f, dailyValue: e.target.value}))}
                        onFocus={e => e.target.select()}
                        className="h-8 text-sm text-right tabular-nums"
                      />
                    </div>
                  </div>
                </div>
                {/* Alimentação */}
                <div className="rounded-xl border border-orange-100 bg-orange-50/40 p-4 space-y-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-orange-600">Alimentação</span>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: 'weekdayLunch', label: 'Almoço (Sem.)' },
                      { key: 'weekdayDinner', label: 'Jantar (Sem.)' },
                      { key: 'weekendLunch', label: 'Almoço (FdS)' },
                      { key: 'weekendDinner', label: 'Jantar (FdS)' },
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <label className="text-[11px] text-slate-500 font-medium block mb-1">{label}</label>
                        <Input
                          type="text" inputMode="decimal"
                          value={editForm[key]}
                          onChange={e => setEditForm(f => ({...f, [key]: e.target.value}))}
                          onFocus={e => e.target.select()}
                          className="h-8 text-sm text-right tabular-nums"
                        />
                      </div>
                    ))}
                  </div>
                </div>
                {/* Mobilidade */}
                <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-4 space-y-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-violet-600">Mobilidade</span>
                  <div>
                    <label className="text-[11px] text-slate-500 font-medium block mb-1">Total (R$)</label>
                    <Input
                      type="text" inputMode="decimal"
                      value={editForm.mobility}
                      onChange={e => setEditForm(f => ({...f, mobility: e.target.value}))}
                      onFocus={e => e.target.select()}
                      className="h-8 text-sm text-right tabular-nums"
                    />
                  </div>
                </div>
                {/* Observação do ajuste */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Observação do Ajuste</span>
                    <span className="text-[10px] text-slate-400">(opcional)</span>
                  </div>
                  <textarea
                    rows={3}
                    placeholder="Descreva o motivo do ajuste nos valores..."
                    value={editForm.rhAdjustNote || ''}
                    onChange={e => setEditForm(f => ({...f, rhAdjustNote: e.target.value}))}
                    className="w-full text-[13px] text-slate-700 border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-amber-300/50 focus:border-amber-400 bg-white placeholder:text-slate-300"
                  />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-slate-100 flex gap-3 shrink-0">
                <Button variant="outline" className="flex-1 rounded-xl h-9 text-sm" onClick={() => setEditingActual(null)}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1 rounded-xl h-9 text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white"
                  onClick={saveEditModal}
                  disabled={patchActualMutation.isPending}
                >
                  {patchActualMutation.isPending ? 'Salvando...' : 'Salvar ajuste'}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Modal confirmação de aprovação com ajustes ── */}
      <Dialog open={confirmAdjustOpen} onOpenChange={setConfirmAdjustOpen}>
        <DialogContent className="max-w-sm rounded-2xl p-6 gap-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <span className="text-lg">⚠</span>
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-slate-900">Aprovação com ajustes</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Revise antes de confirmar</p>
              </div>
            </div>
            <p className="text-[13px] text-slate-600 leading-relaxed">
              Você está aprovando itens com valores ajustados pelo RH em relação ao realizado do colaborador.
            </p>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1 rounded-xl h-9 text-sm"
                onClick={() => setConfirmAdjustOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 rounded-xl h-9 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => {
                  setConfirmAdjustOpen(false);
                  setActionModal({ type: 'approve' });
                }}
              >
                <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                Confirmar aprovação
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!splitDetail} onOpenChange={() => setSplitDetail(null)}>
        <DialogContent className="max-w-xl rounded-2xl p-0 overflow-hidden gap-0">
          {splitDetail && (() => {
            const sd = splitDetail;
            const sdName = getCollaboratorName(sd.actual.collaboratorId);
            const sdFn = getFunctionName(sd.actual.functionId);
            const myDays = (sd.actual.workedDays as string[] | null) || [];
            const allDays = sd.allGroupDays;
            const totalGroupDays = allDays.length;
            const myDayCount = myDays.length;
            const pp = sd.propPlanned;
            const fa = sd.actual;

            const dailyPlan = pp ? pp.dailyQuantity * pp.dailyValue : 0;
            const dailyAct = fa.dailyQuantity * fa.dailyValue;
            const mealPlan = pp ? (pp.weekdayLunch + pp.weekdayDinner + pp.weekendLunch + pp.weekendDinner) : 0;
            const mealAct = fa.weekdayLunch + fa.weekdayDinner + fa.weekendLunch + fa.weekendDinner;
            const mobPlan = pp ? (pp.mobility + pp.transport) : 0;
            const mobAct = fa.mobility + fa.transport;
            const totalPlan = pp?.totalValue || 0;
            const totalAct = fa.totalValue;
            const totalDiff = totalAct - totalPlan;

            // Sub-row inside a section (zebra handled by caller)
            const SubRow = ({ label, planned, actual, rowIndex }: { label: string; planned: number; actual: number; rowIndex: number }) => {
              const d = actual - planned;
              return (
                <div className={`grid grid-cols-4 gap-4 px-4 py-2 items-center ${rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}`}>
                  <div className="flex items-center gap-1.5 pl-3">
                    <span className="text-slate-300 text-[10px] select-none">└</span>
                    <span className="text-[10px] text-slate-400">{label}</span>
                  </div>
                  <span className="text-right tabular-nums text-[11px] text-blue-500">{fmt(planned)}</span>
                  <span className={`text-right tabular-nums text-[11px] ${d !== 0 ? 'text-violet-600' : 'text-violet-400'}`}>{fmt(actual)}</span>
                  <div className="text-right">
                    {d === 0 ? <span className="text-slate-300 text-[10px]">—</span> : (
                      <span className={`text-[10px] font-semibold ${d > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                        {d > 0 ? '+' : '−'}{fmt(Math.abs(d))}
                      </span>
                    )}
                  </div>
                </div>
              );
            };

            // Section block with colored header
            const SectionBlock = ({ title, icon: Icon, headerBg, iconColor, titleColor, subtotalPlan, subtotalAct, children }: {
              title: string; icon: any; headerBg: string; iconColor: string; titleColor: string;
              subtotalPlan: number; subtotalAct: number; children: React.ReactNode;
            }) => {
              const d = subtotalAct - subtotalPlan;
              return (
                <div className="rounded-xl overflow-hidden border border-slate-100">
                  <div className={`flex items-center gap-1.5 px-4 py-2 border-b border-white/40 ${headerBg}`}>
                    <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
                    <span className={`text-[10px] font-bold tracking-wide ${titleColor}`}>{title}</span>
                  </div>
                  <div className={`grid grid-cols-4 gap-4 px-4 py-2 ${headerBg}`}>
                    <span className={`text-[10px] font-semibold ${titleColor} opacity-70`}>Total</span>
                    <span className="text-right tabular-nums text-[11px] text-blue-600 font-semibold">{fmt(subtotalPlan)}</span>
                    <span className={`text-right tabular-nums text-[11px] font-semibold ${d !== 0 ? 'text-violet-700' : 'text-violet-500'}`}>{fmt(subtotalAct)}</span>
                    <div className="text-right">
                      {d === 0
                        ? <span className="text-slate-300 text-[10px]">—</span>
                        : <span className={`text-[11px] font-bold tabular-nums ${d > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                            {d > 0 ? '+' : '−'}{fmt(Math.abs(d))}
                          </span>
                      }
                    </div>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {children}
                  </div>
                </div>
              );
            };

            let subRowIdx = 0;

            return (
              <>
                {/* ── Modal header — dark purple gradient ── */}
                <div className="bg-gradient-to-br from-violet-600 to-purple-700 px-6 py-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3.5">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white text-sm font-black shadow-lg ring-2 ring-white/20 ${avatarColor(sdName)}`}>
                        {initials(sdName)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="text-base font-black text-white">{sdName}</span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${sd.isParent
                            ? 'bg-blue-200/30 text-blue-100 ring-1 ring-blue-200/40'
                            : 'bg-purple-200/30 text-purple-100 ring-1 ring-purple-200/40'}`}>
                            {sd.isParent ? 'Titular' : 'Divisão'}
                          </span>
                        </div>
                        <p className="text-[11px] text-purple-200">{sdFn}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSplitDetail(null)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Period info — two blocks side by side */}
                  {allDays.length > 0 && (() => {
                    const origWkdays = allDays.filter(d => !isWknd(d)).length;
                    const origWknds  = allDays.filter(d =>  isWknd(d)).length;
                    const myWkdays   = myDays.filter(d => !isWknd(d)).length;
                    const myWknds    = myDays.filter(d =>  isWknd(d)).length;
                    const wkdayStr = (n: number) => n > 0 ? `${n} útil${n !== 1 ? 'is' : ''}` : '';
                    const wkndStr  = (n: number) => n > 0 ? `${n} f${n !== 1 ? 'ds' : 'ds'}` : '';
                    const joinParts = (...parts: string[]) => parts.filter(Boolean).join(' + ');
                    return (
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <div className="bg-white/10 rounded-xl px-3 py-2.5 flex items-start gap-2">
                          <Calendar className="w-3.5 h-3.5 text-purple-200 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-[9px] uppercase font-bold tracking-wider text-purple-200 mb-0.5">Vaga original</p>
                            <p className="text-[11px] text-white font-medium leading-snug">
                              {fmtDateShort(allDays[0])} a {fmtDateShort(allDays[allDays.length - 1])}
                            </p>
                            <p className="text-[10px] text-purple-200">
                              {totalGroupDays} dia{totalGroupDays !== 1 ? 's' : ''}
                              {' · '}{joinParts(wkdayStr(origWkdays), wkndStr(origWknds))}
                            </p>
                          </div>
                        </div>
                        {myDays.length > 0 && (
                          <div className="bg-white/10 rounded-xl px-3 py-2.5 flex items-start gap-2">
                            <GitFork className="w-3.5 h-3.5 text-purple-200 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-[9px] uppercase font-bold tracking-wider text-purple-200 mb-0.5">Dias atribuídos</p>
                              <p className="text-[11px] text-white font-medium leading-snug">
                                {myDays.length === 1
                                  ? fmtDate(myDays[0])
                                  : `${fmtDateShort(myDays[0])} a ${fmtDateShort(myDays[myDays.length - 1])}`}
                              </p>
                              <p className="text-[10px] text-purple-200">
                                {myDayCount} dia{myDayCount !== 1 ? 's' : ''}
                                {' · '}{joinParts(wkdayStr(myWkdays), wkndStr(myWknds))}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* ── Table body ── */}
                <div className="px-5 py-4 space-y-3 bg-white max-h-[50vh] overflow-y-auto">
                  <div className="grid grid-cols-4 gap-4 px-4 pb-2 border-b-2 border-slate-100">
                    <span className="text-[9px] uppercase text-slate-400 font-bold tracking-wider">Item</span>
                    <span className="text-[9px] uppercase text-blue-500 font-bold tracking-wider text-right">Planejado</span>
                    <span className="text-[9px] uppercase text-violet-500 font-bold tracking-wider text-right">Realizado</span>
                    <span className="text-[9px] uppercase text-gray-400 font-bold tracking-wider text-right">Diferença</span>
                  </div>

                  {/* Diárias */}
                  <SectionBlock
                    title="Diárias"
                    icon={Calendar}
                    headerBg="bg-blue-50/80"
                    iconColor="text-blue-600"
                    titleColor="text-blue-700"
                    subtotalPlan={dailyPlan}
                    subtotalAct={dailyAct}
                  >
                    {(pp || fa.dailyQuantity > 0) && (
                      <SubRow
                        rowIndex={subRowIdx++}
                        label={`${pp?.dailyQuantity || 0} diária(s) × ${fmt(pp?.dailyValue || 0)}/dia → ${fa.dailyQuantity} × ${fmt(fa.dailyValue)}`}
                        planned={dailyPlan}
                        actual={dailyAct}
                      />
                    )}
                  </SectionBlock>

                  {/* Alimentação */}
                  <SectionBlock
                    title="Alimentação"
                    icon={Utensils}
                    headerBg="bg-orange-50/80"
                    iconColor="text-orange-600"
                    titleColor="text-orange-700"
                    subtotalPlan={mealPlan}
                    subtotalAct={mealAct}
                  >
                    {(pp?.weekdayLunch || fa.weekdayLunch) ? <SubRow rowIndex={subRowIdx++} label="Almoço (dias úteis)" planned={pp?.weekdayLunch || 0} actual={fa.weekdayLunch} /> : null}
                    {(pp?.weekdayDinner || fa.weekdayDinner) ? <SubRow rowIndex={subRowIdx++} label="Jantar (dias úteis)" planned={pp?.weekdayDinner || 0} actual={fa.weekdayDinner} /> : null}
                    {(pp?.weekendLunch || fa.weekendLunch) ? <SubRow rowIndex={subRowIdx++} label="Almoço (fins de sem.)" planned={pp?.weekendLunch || 0} actual={fa.weekendLunch} /> : null}
                    {(pp?.weekendDinner || fa.weekendDinner) ? <SubRow rowIndex={subRowIdx++} label="Jantar (fins de sem.)" planned={pp?.weekendDinner || 0} actual={fa.weekendDinner} /> : null}
                  </SectionBlock>

                  {/* Mobilidade */}
                  <SectionBlock
                    title="Mobilidade"
                    icon={Car}
                    headerBg="bg-violet-50/80"
                    iconColor="text-violet-600"
                    titleColor="text-violet-700"
                    subtotalPlan={mobPlan}
                    subtotalAct={mobAct}
                  >
                    {(pp?.mobility || fa.mobility) ? (() => {
                      const pIda   = (pp as any)?.mobilityIda   ?? Math.ceil((pp?.mobility  || 0) / 2);
                      const pVolta = (pp as any)?.mobilityVolta  ?? Math.floor((pp?.mobility || 0) / 2);
                      const aIda   = (fa as any).mobilityIda     ?? Math.ceil(fa.mobility  / 2);
                      const aVolta = (fa as any).mobilityVolta   ?? Math.floor(fa.mobility / 2);
                      return (
                        <>
                          <SubRow rowIndex={subRowIdx++} label="Ida" planned={pIda} actual={aIda} />
                          <SubRow rowIndex={subRowIdx++} label="Volta" planned={pVolta} actual={aVolta} />
                        </>
                      );
                    })() : null}
                    {(pp?.transport || fa.transport) ? <SubRow rowIndex={subRowIdx++} label="Translado" planned={pp?.transport || 0} actual={fa.transport} /> : null}
                  </SectionBlock>

                  {/* Total row */}
                  <div className={`grid grid-cols-4 gap-4 px-4 py-3.5 rounded-xl border-2 font-semibold ${
                    totalDiff > 0 ? 'bg-red-50 border-red-100'
                    : totalDiff < 0 ? 'bg-emerald-50 border-emerald-100'
                    : 'bg-slate-50 border-slate-100'
                  }`}>
                    <span className="text-[12px] font-black uppercase tracking-wide text-slate-700">TOTAL</span>
                    <span className="text-right tabular-nums text-blue-700 text-[13px] font-black">{fmt(totalPlan)}</span>
                    <span className="text-right tabular-nums text-violet-700 text-[13px] font-black">{fmt(totalAct)}</span>
                    <div className="text-right">
                      {totalDiff === 0
                        ? <span className="text-slate-300 tabular-nums text-[13px] font-black">—</span>
                        : <span className={`tabular-nums text-[13px] font-black ${totalDiff > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                            {totalDiff > 0 ? '+' : '−'}{fmt(Math.abs(totalDiff))}
                          </span>
                      }
                    </div>
                  </div>
                </div>

                {/* ── Footer ── */}
                <div className="px-5 pb-5 pt-3 bg-white space-y-3 border-t border-slate-100">
                  {((!sd.isParent && totalGroupDays > 0) || (sd.isParent && totalGroupDays > 0 && myDayCount < totalGroupDays)) && (
                    <div className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border ${sd.isParent
                      ? 'bg-blue-50 border-blue-100' : 'bg-purple-50 border-purple-100'}`}>
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${sd.isParent ? 'bg-blue-100' : 'bg-purple-100'}`}>
                        <GitFork className={`w-3 h-3 ${sd.isParent ? 'text-blue-500' : 'text-purple-500'}`} />
                      </div>
                      <span className={`text-[11px] font-medium ${sd.isParent ? 'text-blue-700' : 'text-purple-700'}`}>
                        {sd.isParent ? 'Titular cobriu' : 'Este colaborador cobriu'} <strong>{myDayCount}</strong> de <strong>{totalGroupDays}</strong> dias da vaga original
                        {totalGroupDays > 0 && <span className={`ml-1.5 font-bold text-[10px] px-1.5 py-0.5 rounded-full ${sd.isParent ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                          {Math.round(myDayCount / totalGroupDays * 100)}%
                        </span>}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-end">
                    <Button
                      onClick={() => setSplitDetail(null)}
                      className="h-9 px-6 text-sm rounded-xl text-white"
                      style={{background: '#6d28d9'}}
                    >
                      Fechar
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Action confirmation modal ── */}
      <Dialog open={!!actionModal} onOpenChange={() => { setActionModal(null); setActionNote(""); }}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              {actionModal?.type === 'approve' && (
                <><div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0"><CheckCircle className="w-4 h-4 text-emerald-600" /></div> Aprovar para Faturamento</>
              )}
              {actionModal?.type === 'reject' && (
                <><div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center shrink-0"><XCircle className="w-4 h-4 text-red-600" /></div> <span className="text-red-700">Recusar prestação</span></>
              )}
              {actionModal?.type === 'return' && (
                <><div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0"><RotateCcw className="w-4 h-4 text-amber-600" /></div> <span className="text-amber-700">Devolver para correção</span></>
              )}
            </DialogTitle>
            <p className="text-[11px] text-slate-500 mt-1 pl-1 leading-relaxed">
              {sortedData.filter(row => selectedItems.has(row.actual.id)).map(row => getCollaboratorName(row.collaboratorId).split(' ')[0]).join(', ')}
            </p>
          </DialogHeader>
          <div className="space-y-4">
            {/* Collaborator chips */}
            <div className={`rounded-xl p-3 border ${actionModal?.type === 'reject' ? 'bg-red-50/60 border-red-100' : actionModal?.type === 'return' ? 'bg-amber-50/60 border-amber-100' : 'bg-slate-50 border-slate-100'}`}>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">
                {selectedItems.size} colaborador{selectedItems.size !== 1 ? 'es' : ''} afetado{selectedItems.size !== 1 ? 's' : ''}
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                {sortedData.filter(row => selectedItems.has(row.actual.id)).map(row => {
                  const n = getCollaboratorName(row.collaboratorId);
                  return (
                    <div key={row.actual.id} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-semibold text-white ${avatarColor(n)}`}>
                      {initials(n)} <span className="opacity-90">{n}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Comment field — o comentário é aplicado a todos os itens selecionados */}
            <div>
              <label className="text-sm font-medium text-slate-700">
                Comentário{' '}
                <span className="text-slate-400 font-normal">
                  (opcional{selectedItems.size > 1 ? ` — será aplicado a todos os ${selectedItems.size} colaboradores selecionados` : ''})
                </span>
              </label>
              <Textarea
                className="mt-1.5 rounded-xl text-sm resize-none"
                value={actionNote}
                onChange={e => setActionNote(e.target.value)}
                placeholder={
                  actionModal?.type === 'approve'
                    ? 'Adicionar um comentário...'
                    : actionModal?.type === 'reject'
                    ? 'Adicione um motivo para o colaborador (opcional)...'
                    : 'Descreva o que precisa ser corrigido (opcional)...'
                }
                rows={3}
                autoFocus={actionModal?.type !== 'approve'}
              />
              {actionModal?.type !== 'approve' && actionNote.trim() && (
                <p className="text-[10px] text-gray-400 mt-1.5 italic">
                  Este comentário ficará visível para o(s) colaborador(es) no card de prestação.
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 mt-1">
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
