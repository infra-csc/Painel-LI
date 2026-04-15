import { useState, useMemo, useRef, useEffect } from "react";
import { formatDias, formatDiasUteis, formatFds, fixEncoding } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ClipboardCheck, Edit, Trash2, Copy, Calendar, Car, Utensils, Moon, Sun, Briefcase, ChevronDown, ChevronUp, ArrowRight, ArrowLeft, Search, ArrowUpDown, Users, DollarSign, CheckCircle2, Send, BarChart3, Lock, TrendingDown, TrendingUp, AlertTriangle, Info, Eye, Clock, AlertCircle, CheckCheck, UserPlus, GitFork, Plus, Check } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { EventSearchSelect } from "@/components/event-select";
import { SplitVagaModal } from "@/components/split-vaga-modal";
import { BudgetChat, BudgetNotesBadge, BudgetNotesSnippet } from "@/components/budget-chat";
import { ActivityTimeline, PlannedEditedBadge } from "@/components/activity-timeline";
import type { Event, Function, Collaborator, BudgetActual, BudgetPlanned, TeamInclusion, BudgetComparison, BudgetNote } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useSidebar } from "@/contexts/sidebar-context";
import { Link, useSearch } from "wouter";

function CurrencyInput({ value, onChange, className, disabled }: {
  value: number;
  onChange: (cents: number) => void;
  className?: string;
  disabled?: boolean;
}) {
  const [display, setDisplay] = useState(() => (value / 100).toFixed(2).replace('.', ','));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDisplay((value / 100).toFixed(2).replace('.', ','));
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setDisplay(raw);
    const normalized = raw.replace(',', '.');
    const parsed = parseFloat(normalized);
    if (!isNaN(parsed)) {
      onChange(Math.round(parsed * 100));
    }
  };

  const handleBlur = () => {
    const normalized = display.replace(',', '.');
    const parsed = parseFloat(normalized);
    if (!isNaN(parsed)) {
      const cents = Math.round(parsed * 100);
      onChange(cents);
      setDisplay((cents / 100).toFixed(2).replace('.', ','));
    } else {
      setDisplay((value / 100).toFixed(2).replace('.', ','));
    }
  };

  const handleFocus = () => {
    setTimeout(() => inputRef.current?.select(), 0);
  };

  return (
    <Input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      className={`bg-slate-50 border-slate-200 rounded-lg font-medium focus-visible:ring-2 focus-visible:ring-violet-300/60 focus-visible:border-violet-300 transition-colors ${className ?? ''}`}
      value={display}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      disabled={disabled}
    />
  );
}

export default function BudgetActualPage() {
  const searchString = useSearch();
  const { urlEventId, urlCollaboratorId, urlFunctionId } = useMemo(() => {
    const p = new URLSearchParams(searchString);
    return {
      urlEventId: p.get("event") || "",
      urlCollaboratorId: p.get("collaborator") || "",
      urlFunctionId: p.get("function") || "",
    };
  }, [searchString]);
  const [highlightCardId, setHighlightCardId] = useState<string>("");

  const [selectedEventId, setSelectedEventId] = useState<string>(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get("event") || "";
  });
  const [editingItem, setEditingItem] = useState<BudgetActual | null>(null);
  const [editFormData, setEditFormData] = useState<{
    valorDiariaUtil: number;
    valorDiariaFds: number;
    weekdayLunch: number;
    weekdayDinner: number;
    weekendLunch: number;
    weekendDinner: number;
    mobilityIda: number;
    mobilityVolta: number;
  } | null>(null);
  type DayEntry = { date: string; valueCents: number; active: boolean; isWeekend: boolean };
  const [editDayEntries, setEditDayEntries] = useState<DayEntry[]>([]);
  const [showAddDay, setShowAddDay] = useState(false);
  const [collapsedCards, setCollapsedCards] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<string>("adjusted");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterFunction, setFilterFunction] = useState<string>("all");
  const [modalActualTab, setModalActualTab] = useState<'custos' | 'observacoes' | 'historico'>('custos');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [splittingItem, setSplittingItem] = useState<BudgetActual | null>(null);
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const { user } = useAuth();
  const { isCollapsed, isCompact, isFocusMode } = useSidebar();
  const qc = useQueryClient();

  const { data: events } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: functions } = useQuery<Function[]>({ queryKey: ["/api/functions"] });
  const { data: collaborators } = useQuery<Collaborator[]>({ queryKey: ["/api/collaborators"] });

  // Busca diretamente os eventos que têm planejamento — sem carregar todos os registros
  const { data: eventsWithPlanned } = useQuery<Event[]>({
    queryKey: ["/api/events-with-planned"],
  });

  const { data: budgetActual, isLoading } = useQuery<BudgetActual[]>({
    queryKey: ["/api/budget-actual", selectedEventId],
    queryFn: async () => {
      const url = selectedEventId ? `/api/budget-actual?eventId=${selectedEventId}` : "/api/budget-actual";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch budget actual");
      return res.json();
    },
    enabled: !!selectedEventId,
  });

  const { data: teamInclusions } = useQuery<TeamInclusion[]>({
    queryKey: ["/api/team-inclusions", selectedEventId],
    queryFn: async () => {
      const res = await fetch(`/api/team-inclusions?eventId=${selectedEventId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch team inclusions");
      return res.json();
    },
    enabled: !!selectedEventId,
  });

  const { data: budgetComparison } = useQuery<BudgetComparison | null>({
    queryKey: ["/api/budget-comparison", selectedEventId],
    queryFn: async () => {
      if (!selectedEventId) return null;
      const res = await fetch(`/api/budget-comparison?eventId=${selectedEventId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!selectedEventId,
  });

  const rhComment = budgetComparison?.status === 'devolvido' ? budgetComparison.returnReason :
                    budgetComparison?.status === 'rejeitado' ? budgetComparison.rejectionReason : null;

  const isRhOrAdmin = user?.role === 'admin' || user?.role === 'financial';

  const { data: eventNotes = [] } = useQuery<BudgetNote[]>({
    queryKey: ["/api/budget-notes/by-event", "actual", selectedEventId],
    queryFn: async () => {
      const res = await fetch(`/api/budget-notes/by-event?entityType=actual&eventId=${selectedEventId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedEventId,
    staleTime: 30000,
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

  const didScrollToCard = useRef(false);
  useEffect(() => {
    if (didScrollToCard.current || !budgetActual || !urlCollaboratorId || !urlFunctionId) return;
    const target = budgetActual.find(
      a => a.collaboratorId === urlCollaboratorId && a.functionId === urlFunctionId
    );
    if (target) {
      didScrollToCard.current = true;
      setHighlightCardId(target.id);
      setTimeout(() => {
        const el = document.querySelector(`[data-card-id="${target.id}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 300);
      setTimeout(() => setHighlightCardId(""), 4000);
    }
  }, [budgetActual, urlCollaboratorId, urlFunctionId]);

  const sentForReview = useMemo(() => {
    if (!budgetActual || budgetActual.length === 0) return false;
    return budgetActual.every(a => a.sentForReview);
  }, [budgetActual]);

  const sendForReviewMutation = useMutation({
    mutationFn: async ({ eventId, itemIds }: { eventId: string; itemIds?: string[] }) => {
      const res = await apiRequest("POST", "/api/budget-actual/send-for-review", { eventId, itemIds });
      return res.json();
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["/api/budget-actual", variables.eventId] });
      toast({
        title: "Enviado para revisão",
        description: "O orçamento realizado foi enviado para conferência.",
        className: "bg-emerald-50 border-emerald-200 text-emerald-800",
      });
    },
    onError: () => {
      toast({ title: "Erro ao enviar", variant: "destructive" });
    },
  });

  const { data: budgetPlanned } = useQuery<BudgetPlanned[]>({
    queryKey: ["/api/budget-planned", selectedEventId],
    queryFn: async () => {
      const res = await fetch(`/api/budget-planned?eventId=${selectedEventId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch budget planned");
      return res.json();
    },
    enabled: !!selectedEventId,
  });

  const getPlannedRef = (item: BudgetActual): BudgetPlanned | undefined => {
    if (!budgetPlanned) return undefined;
    if (item.plannedId) {
      const byId = budgetPlanned.find(p => p.id === item.plannedId);
      if (byId) return byId;
    }
    if (item.collaboratorId && item.functionId) {
      return budgetPlanned.find(p =>
        p.collaboratorId === item.collaboratorId &&
        p.functionId === item.functionId &&
        p.eventId === item.eventId
      );
    }
    if (item.collaboratorId) {
      return budgetPlanned.find(p =>
        p.collaboratorId === item.collaboratorId &&
        p.eventId === item.eventId
      );
    }
    return undefined;
  };

  const hasItemDivergence = (item: BudgetActual): boolean => {
    const planned = getPlannedRef(item);
    if (!planned) return false;
    return planned.totalValue !== item.totalValue;
  };

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/budget-actual/${id}`, {
        ...data,
        updatedBy: user?.id,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "✓ Prestação salva com sucesso",
        description: "Os valores foram salvos e já estão atualizados na listagem.",
        className: "bg-emerald-50 border-emerald-300 text-emerald-800 shadow-lg",
      });
      qc.invalidateQueries({ queryKey: ["/api/budget-actual"] });
      setEditingItem(null);
      setEditFormData(null);
    },
    onError: () => {
      toast({ title: "Erro", description: "Erro ao atualizar prestação", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/budget-actual/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Prestação removida" });
      qc.invalidateQueries({ queryKey: ["/api/budget-actual"] });
      setConfirmDeleteId(null);
    },
    onError: () => {
      toast({ title: "Erro", description: "Erro ao remover prestação", variant: "destructive" });
    },
  });

  const splitMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) => {
      const res = await apiRequest("POST", `/api/budget-actual/${id}/split`, payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Vaga dividida", description: "O novo colaborador foi atribuído com sucesso." });
      setSplittingItem(null);
      qc.invalidateQueries({ queryKey: ["/api/budget-actual"] });
    },
    onError: () => {
      toast({ title: "Erro", description: "Erro ao dividir a vaga", variant: "destructive" });
    },
  });

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
  };

  const getCollaboratorName = (id?: string | null) => {
    if (!id) return "Não definido";
    return fixEncoding(collaborators?.find(c => c.id === id)?.fullName) || "Não definido";
  };

  const getFunctionName = (id?: string | null) => {
    if (!id) return "-";
    return functions?.find(f => f.id === id)?.name || "-";
  };

  const selectedEvent = events?.find(e => e.id === selectedEventId);

  const countWeekdaysAndWeekends = (startDate: string | null | undefined, endDate: string | null | undefined): { weekdays: number; weekends: number } => {
    if (!startDate || !endDate) return { weekdays: 0, weekends: 0 };
    let start = new Date(startDate + 'T00:00:00');
    let end = new Date(endDate + 'T00:00:00');
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return { weekdays: 0, weekends: 0 };
    if (end < start) { const tmp = start; start = end; end = tmp; }
    let weekdays = 0, weekends = 0;
    const current = new Date(start);
    while (current <= end) {
      const day = current.getDay();
      if (day === 0 || day === 6) weekends++;
      else weekdays++;
      current.setDate(current.getDate() + 1);
    }
    return { weekdays, weekends };
  };

  const getItemInclusion = (item: BudgetActual): TeamInclusion | undefined => {
    if (!teamInclusions || !item.collaboratorId) return undefined;
    return teamInclusions.find(ti =>
      ti.collaboratorId === item.collaboratorId &&
      ti.eventId === item.eventId
    );
  };

  const isWeekendDate = (d: string) => { const day = new Date(d + 'T12:00:00').getDay(); return day === 0 || day === 6; };

  const getItemDayCounts = (item: BudgetActual): { weekdays: number; weekends: number; startDate: string | null; endDate: string | null } => {
    // When workedDays is set (after a split), derive counts from it for accuracy
    const wd = item.workedDays as string[] | null | undefined;
    if (wd && wd.length > 0) {
      const weekdays = wd.filter(d => !isWeekendDate(d)).length;
      const weekends = wd.filter(d => isWeekendDate(d)).length;
      const sorted = [...wd].sort();
      return { weekdays, weekends, startDate: sorted[0] || null, endDate: sorted[sorted.length - 1] || null };
    }
    const inclusion = getItemInclusion(item);
    if (inclusion?.scheduleStartDate && inclusion?.scheduleEndDate) {
      const counts = countWeekdaysAndWeekends(inclusion.scheduleStartDate, inclusion.scheduleEndDate);
      return { ...counts, startDate: inclusion.scheduleStartDate, endDate: inclusion.scheduleEndDate };
    }
    if (selectedEvent?.startDate && selectedEvent?.endDate) {
      const counts = countWeekdaysAndWeekends(selectedEvent.startDate, selectedEvent.endDate);
      return { ...counts, startDate: selectedEvent.startDate, endDate: selectedEvent.endDate };
    }
    return { weekdays: 0, weekends: 0, startDate: null, endDate: null };
  };

  const toggleSelect = (id: string) => {
    setSelectedCards(prev => {
      const s = new Set(Array.from(prev));
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const selectAll = () => {
    if (selectedCards.size === filteredItems.length) {
      setSelectedCards(new Set());
    } else {
      setSelectedCards(new Set(filteredItems.map(i => i.id)));
    }
  };

  const toggleCollapse = (id: string) => {
    setCollapsedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  const openEditModal = (item: BudgetActual) => {
    setModalActualTab('custos');
    setEditingItem(item);
    const days = getItemDayCounts(item);
    const storedSubtotalDiarias = item.totalValue - item.weekdayLunch - item.weekdayDinner - item.weekendLunch - item.weekendDinner - item.mobility;
    const totalDays = days.weekdays + days.weekends;

    let valorUtil = 0;
    let valorFds = 0;

    const isUnfilled = totalDays === 0 || storedSubtotalDiarias <= 0;

    if (!isUnfilled) {
      // Restore from saved actual values
      if (days.weekdays === 0) {
        valorUtil = 0;
        valorFds = Math.round(storedSubtotalDiarias / days.weekends);
      } else if (days.weekends === 0) {
        valorFds = 0;
        valorUtil = Math.round(storedSubtotalDiarias / days.weekdays);
      } else {
        // Use dailyValue approach: util rate = stored/weekdays, fds = remainder
        valorUtil = Math.round(storedSubtotalDiarias / (days.weekdays + days.weekends));
        valorFds = Math.round((storedSubtotalDiarias - days.weekdays * valorUtil) / days.weekends);
      }
    } else {
      // Actual not yet filled — pre-fill from planned values so user has a starting point
      const plannedRef = getPlannedRef(item);
      if (plannedRef && plannedRef.dailyValue > 0) {
        const plannedSub = plannedRef.totalValue - plannedRef.weekdayLunch - plannedRef.weekdayDinner - plannedRef.weekendLunch - plannedRef.weekendDinner - plannedRef.mobility;
        if (days.weekdays === 0 && days.weekends > 0) {
          valorUtil = 0;
          valorFds = Math.round(plannedSub / days.weekends);
        } else if (days.weekends === 0 && days.weekdays > 0) {
          valorFds = 0;
          valorUtil = Math.round(plannedSub / days.weekdays);
        } else if (days.weekdays > 0 && days.weekends > 0) {
          valorUtil = plannedRef.dailyValue;
          valorFds = Math.round((plannedSub - days.weekdays * valorUtil) / days.weekends);
        }
      }
    }

    // Mobility and food: ALWAYS use planned values when a planned reference exists
    const plannedRef = getPlannedRef(item);
    let initIda: number;
    let initVolta: number;
    if (plannedRef) {
      initIda = (plannedRef as any).mobilityIda ?? Math.ceil(plannedRef.mobility / 2);
      initVolta = (plannedRef as any).mobilityVolta ?? Math.floor(plannedRef.mobility / 2);
    } else if (item.mobility > 0) {
      const storedIda = (item as any).mobilityIda;
      initIda = typeof storedIda === 'number' ? storedIda : Math.ceil(item.mobility / 2);
      const storedVolta = (item as any).mobilityVolta;
      initVolta = typeof storedVolta === 'number' ? storedVolta : Math.floor(item.mobility / 2);
    } else {
      initIda = 0;
      initVolta = 0;
    }

    setEditFormData({
      valorDiariaUtil: valorUtil,
      valorDiariaFds: valorFds,
      weekdayLunch:   plannedRef ? plannedRef.weekdayLunch   : item.weekdayLunch,
      weekdayDinner:  plannedRef ? plannedRef.weekdayDinner  : item.weekdayDinner,
      weekendLunch:   plannedRef ? plannedRef.weekendLunch   : item.weekendLunch,
      weekendDinner:  plannedRef ? plannedRef.weekendDinner  : item.weekendDinner,
      mobilityIda:    initIda,
      mobilityVolta:  initVolta,
    });

    // Build per-day entries from date range
    const workedDaysList = item.workedDays as string[] | null | undefined;
    const dayEntries: { date: string; valueCents: number; active: boolean; isWeekend: boolean }[] = [];
    if (days.startDate && days.endDate) {
      const cur = new Date(days.startDate + 'T00:00:00');
      const endD = new Date(days.endDate + 'T00:00:00');
      while (cur <= endD) {
        const dateStr = cur.toISOString().split('T')[0];
        const isWknd = isWeekendDate(dateStr);
        const active = !workedDaysList || workedDaysList.length === 0 || workedDaysList.includes(dateStr);
        dayEntries.push({ date: dateStr, valueCents: isWknd ? valorFds : valorUtil, active, isWeekend: isWknd });
        cur.setDate(cur.getDate() + 1);
      }
    }
    setEditDayEntries(dayEntries);
  };

  const saveEdit = () => {
    if (!editingItem || !editFormData) return;
    const activeDays = editDayEntries.filter(d => d.active);
    const subtotalDiarias = activeDays.reduce((sum, d) => sum + d.valueCents, 0);
    const qtdDiarias = activeDays.length;
    const dailyValue = qtdDiarias > 0 ? Math.round(subtotalDiarias / qtdDiarias) : editFormData.valorDiariaUtil;
    const totalMobility = editFormData.mobilityIda + editFormData.mobilityVolta;
    const totalValue = subtotalDiarias + editFormData.weekdayLunch + editFormData.weekdayDinner +
      editFormData.weekendLunch + editFormData.weekendDinner + totalMobility;
    updateMutation.mutate({
      id: editingItem.id,
      data: {
        dailyQuantity: qtdDiarias,
        dailyValue,
        weekdayLunch: editFormData.weekdayLunch,
        weekdayDinner: editFormData.weekdayDinner,
        weekendLunch: editFormData.weekendLunch,
        weekendDinner: editFormData.weekendDinner,
        mobility: totalMobility,
        mobilityIda: editFormData.mobilityIda,
        mobilityVolta: editFormData.mobilityVolta,
        totalValue,
      },
    });
  };

  const filteredItems = useMemo(() => {
    if (!budgetActual) return [];
    let items = [...budgetActual].filter(item => item.eventId === selectedEventId);

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      items = items.filter(item => {
        const name = getCollaboratorName(item.collaboratorId).toLowerCase();
        const fn = getFunctionName(item.functionId).toLowerCase();
        return name.includes(term) || fn.includes(term);
      });
    }

    if (filterType !== "all") {
      items = items.filter(item => item.collaboratorType === filterType);
    }

    if (filterFunction !== "all") {
      items = items.filter(item => item.functionId === filterFunction);
    }

    if (sortBy === "adjusted") {
      items.sort((a, b) => {
        const aDiverges = hasItemDivergence(a) ? 1 : 0;
        const bDiverges = hasItemDivergence(b) ? 1 : 0;
        if (aDiverges !== bDiverges) return bDiverges - aDiverges;
        return b.totalValue - a.totalValue;
      });
    } else if (sortBy === "value") {
      items.sort((a, b) => b.totalValue - a.totalValue);
    } else if (sortBy === "name") {
      items.sort((a, b) => getCollaboratorName(a.collaboratorId).localeCompare(getCollaboratorName(b.collaboratorId)));
    }

    return items;
  }, [budgetActual, selectedEventId, searchTerm, filterType, filterFunction, sortBy, collaborators, functions, budgetPlanned]);

  // ── Split group computation ─────────────────────────────────────────────
  // Map from parentId → list of split children in the filtered set
  const splitGroupsMap = useMemo(() => {
    const map = new Map<string, BudgetActual[]>();
    for (const item of filteredItems) {
      if (item.splitParentId) {
        const arr = map.get(item.splitParentId) || [];
        arr.push(item);
        map.set(item.splitParentId, arr);
      }
    }
    return map;
  }, [filteredItems]);

  // Ordered render list: parents first, children follow immediately after their parent; standalone items unchanged
  const orderedRenderItems = useMemo(() => {
    const result: BudgetActual[] = [];
    const childrenSeen = new Set<string>();
    for (const item of filteredItems) {
      if (item.splitParentId) continue; // will be inserted after parent
      result.push(item);
      const children = splitGroupsMap.get(item.id) || [];
      for (const child of children) {
        result.push(child);
        childrenSeen.add(child.id);
      }
    }
    // Orphaned children (whose parent isn't in filteredItems) rendered at end
    for (const item of filteredItems) {
      if (item.splitParentId && !childrenSeen.has(item.id)) result.push(item);
    }
    return result;
  }, [filteredItems, splitGroupsMap]);

  const totalRealizado = filteredItems.reduce((sum, item) => sum + item.totalValue, 0);
  const totalCasa = filteredItems.filter(i => i.collaboratorType === 'casa').reduce((s, i) => s + i.totalValue, 0);
  const totalFreela = filteredItems.filter(i => i.collaboratorType === 'freela').reduce((s, i) => s + i.totalValue, 0);
  const totalPlanejado = useMemo(() => {
    return filteredItems
      .filter(item => !item.splitParentId)
      .reduce((sum, item) => {
        const planned = getPlannedRef(item);
        return sum + (planned ? planned.totalValue : item.totalValue);
      }, 0);
  }, [filteredItems, budgetPlanned]);
  const prestacaoCount = filteredItems.filter(item => !item.splitParentId).length;
  const pendingCount = filteredItems.filter(item => !item.splitParentId && !item.sentForReview).length;
  const totalDifference = totalRealizado - totalPlanejado;
  const diffLabel = totalDifference === 0
    ? { text: "Dentro do planejado", color: "text-gray-500" }
    : totalDifference < 0
      ? { text: `- ${formatCurrency(Math.abs(totalDifference))} abaixo do planejado`, color: "text-emerald-600" }
      : { text: `+ ${formatCurrency(totalDifference)} acima do planejado`, color: "text-red-500" };

  const hasAnyEditable = useMemo(() => {
    if (!budgetActual) return true;
    const eventItems = budgetActual.filter(a => a.eventId === selectedEventId);
    return eventItems.some(item => !item.sentForReview);
  }, [budgetActual, selectedEventId]);
  const allSentForReview = sentForReview;

  // Avatar color helper
  const avatarColorAct = (name: string) => {
    const colors = ["bg-violet-500","bg-purple-500","bg-indigo-500","bg-rose-500","bg-emerald-500","bg-amber-500","bg-sky-500","bg-teal-500"];
    return colors[(name.charCodeAt(0) || 0) % colors.length];
  };

  const formatWorkedDays = (days: string[]) => {
    if (!days || days.length === 0) return null;
    const DAY = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const MON = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return [...days].sort().map(d => {
      const dt = new Date(d + 'T12:00:00');
      return `${dt.getDate()}/${MON[dt.getMonth()]} (${DAY[dt.getDay()]})`;
    }).join(' · ');
  };

  const getGroupOriginalPeriod = (parentItem: BudgetActual) => {
    const MON = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const fmt = (d: string) => { const dt = new Date(d + 'T12:00:00'); return `${dt.getDate()}/${MON[dt.getMonth()]}`; };
    const inclusion = getItemInclusion(parentItem);
    const start = inclusion?.scheduleStartDate || selectedEvent?.startDate;
    const end = inclusion?.scheduleEndDate || selectedEvent?.endDate;
    if (!start || !end) return null;
    return `${fmt(start)} a ${fmt(end)}`;
  };

  const renderSingleCard = (cardItem: BudgetActual, { isGParent = false, isGChild = false }: { isGParent?: boolean; isGChild?: boolean } = {}) => {
    const isCollapsed = collapsedCards.has(cardItem.id);
    const isCasa = cardItem.collaboratorType === 'casa';
    const totalAlimentacao = cardItem.weekdayLunch + cardItem.weekdayDinner + cardItem.weekendLunch + cardItem.weekendDinner;
    const isDuplicated = cardItem.observations?.includes('Duplicado no Realizado');
    const diverges = isGChild ? false : hasItemDivergence(cardItem);
    const cardDays = getItemDayCounts(cardItem);
    const cardSubtotalDiarias = cardItem.totalValue - cardItem.weekdayLunch - cardItem.weekdayDinner - cardItem.weekendLunch - cardItem.weekendDinner - cardItem.mobility;
    const cardTotalDays = cardDays.weekdays + cardDays.weekends;
    let cardValorUtil = 0; let cardValorFds = 0;
    if (cardTotalDays > 0 && cardSubtotalDiarias > 0) {
      if (cardDays.weekdays === 0) { cardValorFds = Math.round(cardSubtotalDiarias / cardDays.weekends); }
      else if (cardDays.weekends === 0) { cardValorUtil = Math.round(cardSubtotalDiarias / cardDays.weekdays); }
      else {
        const tw = cardDays.weekdays + cardDays.weekends * 2;
        cardValorUtil = Math.round(cardSubtotalDiarias / tw);
        cardValorFds = Math.round((cardSubtotalDiarias - cardDays.weekdays * cardValorUtil) / cardDays.weekends);
      }
    }
    const isSelected = selectedCards.has(cardItem.id);
    const isItemLocked = !!cardItem.sentForReview;
    const isItemEditable = !cardItem.sentForReview;
    const hasBeenEdited = !!(cardItem.updatedAt && cardItem.createdAt && new Date(cardItem.updatedAt).getTime() > new Date(cardItem.createdAt).getTime() + 1000);
    const fmtDT = (d: string | Date) => {
      const dt = new Date(d);
      return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    };
    const statusBadge = cardItem.sentForReview
      ? cardItem.rhStatus === "aprovado" ? <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200"><CheckCheck className="w-2.5 h-2.5" /> Aprovado</span>
        : cardItem.rhStatus === "devolvido" ? <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-700 border border-amber-200"><AlertCircle className="w-2.5 h-2.5" /> Devolvido</span>
        : cardItem.rhStatus === "rejeitado" ? <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-red-100 text-red-700 border border-red-200"><AlertCircle className="w-2.5 h-2.5" /> Recusado</span>
        : <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-700 border border-blue-200"><Clock className="w-2.5 h-2.5" /> Em revisão</span>
      : isDuplicated ? <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-violet-100 text-violet-700 border border-violet-200"><Copy className="w-2.5 h-2.5" /> Duplicado</span>
      : hasBeenEdited ? <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200"><CheckCircle2 className="w-2.5 h-2.5" /> Salvo {fmtDT(cardItem.updatedAt!)}</span>
      : <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-gray-100 text-gray-500 border border-gray-200">Não preenchido</span>;
    const collabName = getCollaboratorName(cardItem.collaboratorId);
    const initials = collabName.split(' ').filter(Boolean).slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();
    const avatarBg = avatarColorAct(collabName);
    const workedDaysStr = formatWorkedDays((cardItem.workedDays as string[]) || []);
    const isInGroup = isGParent || isGChild;

    // Proportional planned for split cards using real weekday/weekend counts from the group
    const cardPlanned = (() => {
      let rawPlan: BudgetPlanned | undefined;
      let parentItem: BudgetActual | undefined;
      if (isGChild) {
        parentItem = budgetActual?.find(a => a.id === cardItem.splitParentId);
        rawPlan = parentItem ? getPlannedRef(parentItem) : undefined;
      } else {
        rawPlan = getPlannedRef(cardItem);
      }
      if (!rawPlan) return undefined;
      if (!isInGroup) return rawPlan;

      // Collect all worked days for the entire split group
      const parentId = cardItem.splitParentId || cardItem.id;
      const allGroupItems = budgetActual?.filter(a => a.id === parentId || a.splitParentId === parentId) || [];
      const allGroupDays = [...new Set(allGroupItems.flatMap(a => (a.workedDays as string[] | null) || []))].sort();
      const myDays = (cardItem.workedDays as string[] | null) || [];

      if (myDays.length === 0 || allGroupDays.length === 0 || myDays.length >= allGroupDays.length) return rawPlan;

      const origWkdays = allGroupDays.filter(d => !isWeekendDate(d)).length;
      const origWknds  = allGroupDays.filter(d =>  isWeekendDate(d)).length;
      const myWkdays   = myDays.filter(d => !isWeekendDate(d)).length;
      const myWknds    = myDays.filter(d =>  isWeekendDate(d)).length;

      const wkdayRatio = origWkdays > 0 ? myWkdays / origWkdays : 0;
      const wkndRatio  = origWknds  > 0 ? myWknds  / origWknds  : 0;
      const dayRatio   = myDays.length / allGroupDays.length;

      const propDiarias     = myDays.length * rawPlan.dailyValue;
      const propWkdayLunch  = Math.round(rawPlan.weekdayLunch  * wkdayRatio);
      const propWkdayDinner = Math.round(rawPlan.weekdayDinner * wkdayRatio);
      const propWkndLunch   = Math.round(rawPlan.weekendLunch   * wkndRatio);
      const propWkndDinner  = Math.round(rawPlan.weekendDinner  * wkndRatio);
      const propMobility    = Math.round(rawPlan.mobility       * dayRatio);
      const propTransport   = Math.round(rawPlan.transport      * dayRatio);

      return {
        ...rawPlan,
        dailyQuantity: myDays.length,
        weekdayLunch:  propWkdayLunch,
        weekdayDinner: propWkdayDinner,
        weekendLunch:  propWkndLunch,
        weekendDinner: propWkndDinner,
        mobility:      propMobility,
        transport:     propTransport,
        totalValue:    propDiarias + propWkdayLunch + propWkdayDinner + propWkndLunch + propWkndDinner + propMobility + propTransport,
      } as BudgetPlanned;
    })();

    const stripeColor = isSelected ? '#7c3aed'
      : cardItem.rhStatus === 'aprovado' ? '#059669'
      : cardItem.rhStatus === 'devolvido' ? '#d97706'
      : cardItem.rhStatus === 'rejeitado' ? '#ef4444'
      : cardItem.sentForReview ? '#2563eb'
      : diverges ? '#f59e0b'
      : '#6d28d9';

    return (
      <div
        data-card-id={cardItem.id}
        className={[
          'rounded-3xl border overflow-hidden transition-all duration-300 bg-white flex flex-col',
          isInGroup ? 'border-l-[3px] border-l-purple-300' : '',
          highlightCardId === cardItem.id ? 'ring-2 ring-violet-400 shadow-[0_8px_32px_rgba(109,40,217,0.14)]'
            : isSelected ? 'ring-2 ring-violet-300 border-violet-200 shadow-md'
            : diverges ? 'border-amber-200 shadow-sm'
            : isInGroup ? 'border-purple-200 shadow-sm'
            : 'border-slate-200 shadow-sm',
          !isSelected ? 'hover:-translate-y-1 hover:shadow-xl hover:shadow-purple-100/60 hover:border-purple-200' : '',
        ].join(' ')}
      >
          <div className="h-[3px]" style={{background: stripeColor}} />

          {/* Card Header */}
          <div className={`flex items-center justify-between px-4 py-3 ${isItemLocked ? 'bg-indigo-50/40' : 'bg-slate-50/60'}`}>
            <div className="flex items-center gap-3">
              {isItemLocked ? (
                <TooltipProvider><Tooltip><TooltipTrigger asChild>
                  <Lock className="w-4 h-4 text-slate-300 flex-shrink-0 cursor-default" />
                </TooltipTrigger><TooltipContent side="right" className="text-xs">Prestação bloqueada para edição</TooltipContent></Tooltip></TooltipProvider>
              ) : isItemEditable ? (
                <button onClick={() => toggleSelect(cardItem.id)} className="flex-shrink-0">
                  <div className={`w-4 h-4 rounded border-[1.5px] flex items-center justify-center transition-colors ${isSelected ? 'bg-violet-600 border-violet-600' : 'border-slate-300 hover:border-violet-400'}`}>
                    {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </div>
                </button>
              ) : null}
              <div className={`w-9 h-9 rounded-[8px] ${avatarBg} flex items-center justify-center flex-shrink-0`}>
                <span className="text-white text-[12px] font-bold">{initials || '?'}</span>
              </div>
              <div>
                <span className="font-medium text-slate-800 text-[14px]">{collabName}</span>
                <div className="flex items-center gap-1.5 mt-0.5 overflow-hidden">
                  <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md truncate shrink min-w-0">{getFunctionName(cardItem.functionId)}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${isCasa ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>{isCasa ? 'Casa' : 'Freela'}</span>
                  <span className="shrink-0">{statusBadge}</span>
                  {cardItem.rhAdjusted && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 whitespace-nowrap" style={{background:'#FEF3C7', color:'#D97706', border:'1px solid #FDE68A'}}>
                      ⚠ Realizado ajustado pelo RH
                    </span>
                  )}
                  {diverges && <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-600 shrink-0 whitespace-nowrap">Divergência</span>}
                  {isGParent && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-700 shrink-0 whitespace-nowrap">Titular</span>}
                  {isGChild && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-600 flex items-center gap-0.5 shrink-0 whitespace-nowrap"><GitFork className="w-2.5 h-2.5" />Divisão</span>}
                  {cardItem.plannedId && <PlannedEditedBadge logs={plannedLogs} entityId={cardItem.plannedId} />}
                </div>
                {workedDaysStr && isInGroup && (
                  <div className="flex items-center gap-1 mt-1">
                    <Calendar className="w-3 h-3 text-purple-400 flex-shrink-0" />
                    <span className="text-[10px] text-purple-600 leading-tight">{workedDaysStr}</span>
                  </div>
                )}
                <BudgetNotesSnippet notes={eventNotes} entityId={cardItem.id} />
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-blue-50 transition-colors"
                onClick={() => openEditModal(cardItem)}
                title="Ver observações"
              >
                <BudgetNotesBadge notes={eventNotes} entityId={cardItem.id} />
              </button>
              {isItemEditable ? (
                <>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" onClick={() => openEditModal(cardItem)} title="Editar"><Edit className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg" onClick={() => setSplittingItem(cardItem)} title="Dividir" disabled={splitMutation.isPending}><GitFork className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg" onClick={() => setConfirmDeleteId(cardItem.id)} title="Remover"><Trash2 className="w-3.5 h-3.5" /></Button>
                </>
              ) : (
                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg" onClick={() => openEditModal(cardItem)} title="Visualizar"><Eye className="w-3.5 h-3.5" /></Button>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-600 rounded-lg" onClick={() => toggleCollapse(cardItem.id)}>
                {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>

          {/* Card Body */}
          {!isCollapsed && (() => {
            const planned = cardPlanned;
            const plannedAlim = planned ? (planned.weekdayLunch + planned.weekdayDinner + planned.weekendLunch + planned.weekendDinner) : 0;
            const plannedDiarias = planned ? (planned.totalValue - plannedAlim - planned.mobility) : 0;
            const rhFields: Record<string, {from: number; to: number; label: string}> =
              cardItem.rhAdjustedFields ? JSON.parse(cardItem.rhAdjustedFields as string) : {};
            const diffInline = (actual: number, plan: number) => {
              if (!planned) return null;
              const d = actual - plan;
              if (Math.abs(d) <= 1) return null;
              return <span className={`text-[10px] tabular-nums font-bold ml-1 ${d < 0 ? 'text-emerald-600' : 'text-red-500'}`}>{d > 0 ? '+' : '−'}{formatCurrency(Math.abs(d))}</span>;
            };
            const hasRhFields = Object.keys(rhFields).length > 0;
            return (
              <div className="px-4 py-3 border-t border-slate-100 space-y-3">
                {/* Banner laranja para não-RH quando RH ajustou */}
                {!isRhOrAdmin && cardItem.rhAdjusted && (
                  <div className="flex items-start justify-between gap-3 px-3 py-2.5 rounded-xl" style={{background:'#FFFBEB', border:'1px solid #FDE68A'}}>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px]">⚠</span>
                      <span className="text-[11px] font-medium" style={{color:'#92400E'}}>
                        O RH ajustou alguns valores do seu realizado. Veja o histórico para detalhes.
                      </span>
                    </div>
                    <a href="#historico" className="shrink-0 text-[11px] font-semibold px-2 py-1 rounded-lg whitespace-nowrap" style={{background:'#F59E0B', color:'white'}}>
                      Ver alterações
                    </a>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  {/* Diárias */}
                  <div className="rounded-xl p-2.5 border border-blue-100 bg-blue-50/50">
                    <div className="flex items-center gap-1 mb-2">
                      <div className="w-3.5 h-3.5 rounded bg-blue-500 flex items-center justify-center shrink-0"><Calendar className="w-2 h-2 text-white" /></div>
                      <span className="text-[9px] font-semibold text-blue-700 uppercase tracking-wide">Diárias</span>
                    </div>
                    <div className="flex items-baseline gap-0.5">
                      <span className="text-[14px] font-medium text-slate-800 tabular-nums">{formatCurrency(cardSubtotalDiarias)}</span>
                      {diffInline(cardSubtotalDiarias, plannedDiarias)}
                    </div>
                    {planned && Math.abs(cardSubtotalDiarias - plannedDiarias) > 1 && <div className="text-[9px] text-slate-400 tabular-nums mt-0.5">plan: {formatCurrency(plannedDiarias)}</div>}
                    <div className="mt-1.5 space-y-0.5">
                      {cardDays.weekdays > 0 && <div className="text-[10px] text-blue-600 tabular-nums">{formatDiasUteis(cardDays.weekdays)} × {formatCurrency(cardValorUtil)}</div>}
                      {cardDays.weekends > 0 && <div className="text-[10px] text-indigo-500 tabular-nums">{formatFds(cardDays.weekends)} × {formatCurrency(cardValorFds)}</div>}
                    </div>
                  </div>
                  {/* Alimentação */}
                  <div className="rounded-xl p-2.5 border border-orange-100 bg-orange-50/50">
                    <div className="flex items-center gap-1 mb-2">
                      <div className="w-3.5 h-3.5 rounded bg-orange-400 flex items-center justify-center shrink-0"><Utensils className="w-2 h-2 text-white" /></div>
                      <span className="text-[9px] font-semibold text-orange-700 uppercase tracking-wide">Alimentação</span>
                    </div>
                    <div className="flex items-baseline gap-0.5">
                      <span className="text-[14px] font-medium text-slate-800 tabular-nums">{formatCurrency(totalAlimentacao)}</span>
                      {diffInline(totalAlimentacao, plannedAlim)}
                    </div>
                    {planned && Math.abs(totalAlimentacao - plannedAlim) > 1 && <div className="text-[9px] text-slate-400 tabular-nums mt-0.5">plan: {formatCurrency(plannedAlim)}</div>}
                    {(() => {
                      const semana = cardItem.weekdayLunch + cardItem.weekdayDinner;
                      const fds = cardItem.weekendLunch + cardItem.weekendDinner;
                      const wkd = cardDays.weekdays;
                      const wke = cardDays.weekends;
                      if (semana === 0 && fds === 0) return null;
                      const perWkd = wkd > 0 && semana > 0 ? Math.round(semana / wkd) : 0;
                      const perWke = wke > 0 && fds > 0 ? Math.round(fds / wke) : 0;
                      return (
                        <div className="mt-1.5 space-y-0.5">
                          {wkd > 0 && semana > 0 && <div className="text-[10px] text-orange-600 tabular-nums">{formatDiasUteis(wkd)} × {formatCurrency(perWkd)}</div>}
                          {wke > 0 && fds > 0 && <div className="text-[10px] text-amber-500 tabular-nums">{formatFds(wke)} × {formatCurrency(perWke)}</div>}
                        </div>
                      );
                    })()}
                  </div>
                  {/* Mobilidade */}
                  <div className="rounded-xl p-2.5 border border-violet-100 bg-violet-50/50">
                    <div className="flex items-center gap-1 mb-2">
                      <div className="w-3.5 h-3.5 rounded bg-violet-500 flex items-center justify-center shrink-0"><Car className="w-2 h-2 text-white" /></div>
                      <span className="text-[9px] font-semibold text-violet-700 uppercase tracking-wide">Mobilidade</span>
                    </div>
                    <div className="flex items-baseline gap-0.5">
                      <span className="text-[14px] font-medium text-slate-800 tabular-nums">{formatCurrency(cardItem.mobility)}</span>
                      {diffInline(cardItem.mobility, planned?.mobility ?? 0)}
                    </div>
                    {(() => {
                      const ida = (cardItem as any).mobilityIda;
                      const volta = (cardItem as any).mobilityVolta;
                      if (typeof ida === 'number' && (ida > 0 || volta > 0)) {
                        return <div className="text-[9px] text-violet-400 tabular-nums mt-0.5">Ida: {formatCurrency(ida)} · Volta: {formatCurrency(volta ?? 0)}</div>;
                      }
                      return planned && Math.abs(cardItem.mobility - (planned?.mobility ?? 0)) > 1
                        ? <div className="text-[9px] text-slate-400 tabular-nums mt-0.5">plan: {formatCurrency(planned.mobility)}</div>
                        : null;
                    })()}
                  </div>
                </div>

                {/* Campos ajustados pelo RH — inline */}
                {hasRhFields && (
                  <div className="rounded-xl px-3 py-2.5 space-y-1" style={{background:'#FFFBEB', border:'1px solid #FDE68A'}}>
                    <span className="text-[9px] font-bold uppercase tracking-widest" style={{color:'#92400E'}}>Ajustes do RH</span>
                    {Object.values(rhFields).map((f, i) => (
                      <div key={i} className="flex items-center gap-1 text-[11px]" style={{color:'#6B7280'}}>
                        <span>·</span>
                        <span>{f.label}:</span>
                        <span className="tabular-nums line-through" style={{color:'#9CA3AF'}}>{formatCurrency(f.from)}</span>
                        <span>→</span>
                        <span className="tabular-nums font-semibold" style={{color:'#D97706'}}>{formatCurrency(f.to)}</span>
                        <span className="text-[9px]" style={{color:'#D97706'}}>(RH)</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        {/* Card Footer */}
        {(() => {
          const planned = cardPlanned;
          const diff = planned ? cardItem.totalValue - planned.totalValue : 0;
          return (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/40 mt-auto">
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest">Total Realizado</span>
                <span className="text-[17px] font-medium tabular-nums text-violet-700" style={{letterSpacing:'-0.02em'}}>{formatCurrency(cardItem.totalValue)}</span>
              </div>
              <div>
                {!planned ? null
                  : Math.abs(diff) <= 1 ? (
                    <span className="text-[10px] font-medium text-slate-400 px-2.5 py-1 rounded-lg bg-slate-100">Dentro do previsto</span>
                  ) : diff < 0 ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums text-emerald-700 px-2.5 py-1 rounded-lg bg-emerald-100">
                      <TrendingDown className="w-3 h-3" />− {formatCurrency(Math.abs(diff))}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums text-red-600 px-2.5 py-1 rounded-lg bg-red-50">
                      <TrendingUp className="w-3 h-3" />+ {formatCurrency(diff)}
                    </span>
                  )
                }
              </div>
            </div>
          );
        })()}
      </div>
    );
  };

  return (
    <div className="space-y-7 max-w-5xl mx-auto pb-36">

      {/* ── Cabeçalho ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[10px] bg-[#6d28d9] flex items-center justify-center shrink-0" style={{boxShadow:'0 4px 14px #6d28d950'}}>
            <ClipboardCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-[18px] font-bold text-gray-900">Orçamento Realizado</h1>
            <p className="text-xs text-gray-400">Prestação de contas — escalas enviadas do Planejado</p>
          </div>
        </div>
        {selectedEventId && (
          <div className="flex items-center gap-3">
            <EventSearchSelect value={selectedEventId} onValueChange={v => { setSelectedEventId(v); setCollapsedCards(new Set()); }} events={eventsWithPlanned} />
          </div>
        )}
      </div>

      {/* ── Tela 1: Seleção de evento ── */}
      {!selectedEventId ? (
        <div className="rounded-2xl border border-violet-100 shadow-md">
          <div className="bg-gradient-to-br from-violet-50 via-purple-50 to-fuchsia-50 rounded-2xl px-8 py-20 flex flex-col items-center justify-center text-center">
            {/* Ícone */}
            <div className="relative w-24 h-24 mx-auto mb-8">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl shadow-lg shadow-violet-200 flex items-center justify-center rotate-3">
                <ClipboardCheck className="w-10 h-10 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-emerald-400 rounded-xl flex items-center justify-center shadow-md">
                <CheckCircle2 className="w-4 h-4 text-white" />
              </div>
            </div>

            <h2 className="text-2xl font-extrabold text-gray-900 mb-3">Selecione um evento</h2>
            <p className="text-sm text-gray-400 max-w-xs mx-auto leading-relaxed">
              Registre a prestação de contas com os valores efetivamente gastos em cada escala.
            </p>

            <div className="max-w-sm w-full mx-auto mt-8">
              <EventSearchSelect value={selectedEventId} onValueChange={v => { setSelectedEventId(v); setCollapsedCards(new Set()); }} events={eventsWithPlanned} />
            </div>
          </div>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredItems.length === 0 && !searchTerm && filterType === "all" ? (
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <ClipboardCheck className="w-16 h-16 text-gray-200 dark:text-gray-700 mx-auto mb-4" />
          <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-2">Nenhuma prestação disponível</h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6 max-w-md mx-auto">
            Envie escalas do Planejado para iniciar o Realizado deste evento
          </p>
          <Link href="/budget-planned">
            <Button className="bg-indigo-600 hover:bg-indigo-700">
              <ArrowRight className="w-4 h-4 mr-2" />
              Ir para Planejado
            </Button>
          </Link>
        </div>
      ) : (
        <>
          {/* ── Stepper ── */}
          {(() => {
            const currentStep = 2;
            const steps = [
              { label: "Escalação", desc: "Inclusões confirmadas" },
              { label: "Planejamento RH", desc: "Valores previstos" },
              { label: "Prestação", desc: "Resp. preenche realizado" },
              { label: "Aprovação RH", desc: "Análise e aprovação" },
            ];
            return (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-5 py-4">
                <div className="flex items-center">
                  {steps.map((step, i) => {
                    const isDone = i < currentStep;
                    const isActive = i === currentStep;
                    const isLast = i === steps.length - 1;
                    return (
                      <div key={i} className="flex items-center flex-1">
                        <div className="flex flex-col items-center gap-1.5">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${
                            isDone ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200 dark:shadow-emerald-900/40' :
                            isActive ? 'bg-violet-600 text-white shadow-lg shadow-violet-300 dark:shadow-violet-900/50 ring-4 ring-violet-100 dark:ring-violet-900/40' :
                            'bg-gray-100 dark:bg-gray-700 text-gray-300 dark:text-gray-500'
                          }`}>
                            {isDone ? (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (i + 1)}
                          </div>
                          <div className="text-center">
                            <div className={`text-[11px] font-semibold leading-tight ${
                              isDone ? 'text-emerald-600 dark:text-emerald-400' :
                              isActive ? 'text-violet-700 dark:text-violet-300' :
                              'text-gray-400'
                            }`}>{step.label}</div>
                            <div className="text-[9px] text-gray-400 mt-0.5 hidden sm:block">{step.desc}</div>
                          </div>
                        </div>
                        {!isLast && (
                          <div className={`flex-1 h-[3px] mx-2 rounded-full mb-5 ${
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

          {/* ── Banner Total Realizado ── */}
          {(() => {
            const nAprovadas  = filteredItems.filter(i => i.rhStatus === 'aprovado').length;
            const nRevisao    = filteredItems.filter(i => i.sentForReview && !['aprovado','devolvido','rejeitado'].includes(i.rhStatus || '')).length;
            const nDevolvidas = filteredItems.filter(i => i.rhStatus === 'devolvido').length;
            const pctAprovado = prestacaoCount > 0 ? Math.round((nAprovadas / prestacaoCount) * 100) : 0;
            return (
              <div style={{
                background: 'rgba(255,255,255,0.88)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(109,40,217,0.12)',
                borderRadius: 20,
                boxShadow: '0 4px 24px rgba(109,40,217,0.07), 0 1px 4px rgba(0,0,0,0.04)',
                overflow: 'hidden',
              }}>
                {/* Faixa accent roxo topo */}
                <div style={{height: 3, background: 'linear-gradient(90deg, #5b21b6 0%, #7c3aed 60%, #059669 100%)'}} />
                <div className="flex items-stretch">
                  {/* Esquerda — total */}
                  <div className="px-7 py-5 flex flex-col justify-center gap-1 relative overflow-hidden" style={{
                    background: 'linear-gradient(135deg, #5b21b6 0%, #6d28d9 50%, #7c3aed 100%)',
                    minWidth: 230,
                  }}>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/60">Total Realizado</p>
                    <div className="text-[30px] font-semibold text-white leading-none mt-1.5" style={{letterSpacing:'-0.03em'}}>
                      {formatCurrency(totalRealizado)}
                    </div>
                    {totalPlanejado > 0 && (
                      <div className="text-[10px] text-white/40 mt-0.5 tabular-nums">
                        Planejado: {formatCurrency(totalPlanejado)}
                      </div>
                    )}
                    <div className={`text-[10px] mt-1.5 font-medium flex items-center gap-1 ${totalDifference === 0 ? 'text-white/45' : totalDifference < 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                      {totalDifference < 0 && <TrendingDown className="w-3 h-3" />}
                      {totalDifference > 0 && <TrendingUp className="w-3 h-3" />}
                      {!selectedEventId ? 'Selecione um evento' : totalDifference === 0 ? '= planejado' : `${totalDifference > 0 ? '+' : ''}${formatCurrency(totalDifference)} vs planejado`}
                    </div>
                  </div>
                  {/* Separador */}
                  <div style={{width:1, background:'rgba(109,40,217,0.1)'}} />
                  {/* Direita — KPIs + barra */}
                  <div className="flex-1 px-6 py-5 flex flex-col justify-between">
                    <div className="flex items-start gap-0">
                      <div className="flex-1 flex flex-col items-center gap-1 px-3">
                        <div className="text-[26px] font-bold leading-none tracking-tight text-violet-700">{prestacaoCount}</div>
                        <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400 flex items-center gap-1"><Users className="w-3 h-3" />Prestações</div>
                      </div>
                      <div style={{width:1, height:36, background:'rgba(109,40,217,0.08)'}} />
                      <div className="flex-1 flex flex-col items-center gap-1 px-3">
                        <div className="text-[26px] font-bold leading-none tracking-tight text-blue-600">{nRevisao}</div>
                        <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" />Em Revisão</div>
                      </div>
                      <div style={{width:1, height:36, background:'rgba(109,40,217,0.08)'}} />
                      <div className="flex-1 flex flex-col items-center gap-1 px-3">
                        <div className="text-[26px] font-bold leading-none tracking-tight text-emerald-600">{nAprovadas}</div>
                        <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Aprovadas</div>
                      </div>
                      {nDevolvidas > 0 && (
                        <>
                          <div style={{width:1, height:36, background:'rgba(109,40,217,0.08)'}} />
                          <div className="flex-1 flex flex-col items-center gap-1 px-3">
                            <div className="text-[26px] font-bold leading-none tracking-tight text-amber-600">{nDevolvidas}</div>
                            <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" />Devolvidas</div>
                          </div>
                        </>
                      )}
                    </div>
                    {prestacaoCount > 0 && (
                      <div className="mt-4">
                        <div className="h-2 rounded-full overflow-hidden" style={{background:'rgba(109,40,217,0.25)'}}>
                          <div className="h-full bg-emerald-400 rounded-full transition-all duration-500" style={{width:`${pctAprovado}%`}} />
                        </div>
                        <div className="text-[9px] text-slate-400 mt-1.5 font-light">{nAprovadas} de {prestacaoCount} aprovadas</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Filtros ── */}
          <div className="flex flex-wrap items-center gap-3 px-0">
            {/* Busca */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-300" />
              <input
                type="text"
                placeholder="Buscar colaborador..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                  height: 34, paddingLeft: 26, paddingRight: 12, width: 200,
                  background: '#F8FAFC', border: 'none',
                  borderBottom: `1.5px solid ${searchTerm ? '#6d28d9' : '#E2E8F0'}`,
                  borderRadius: '6px 6px 0 0',
                  fontSize: 12, color: '#334155', outline: 'none',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => (e.currentTarget.style.borderBottomColor = '#6d28d9')}
                onBlur={e => (e.currentTarget.style.borderBottomColor = searchTerm ? '#6d28d9' : '#E2E8F0')}
              />
            </div>

            {/* Função */}
            <Select value={filterFunction} onValueChange={setFilterFunction}>
              <SelectTrigger className="w-auto min-w-[150px] h-[34px] text-xs shrink-0 bg-[#F8FAFC] border-0 border-b border-slate-200 rounded-none rounded-t-md text-slate-600 shadow-none focus:ring-0">
                <SelectValue placeholder="Função" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl shadow-xl border border-slate-100 min-w-[180px] p-1.5" style={{backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', background:'rgba(255,255,255,0.96)'}}>
                <SelectItem value="all" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-violet-50 data-[highlighted]:text-violet-600 data-[highlighted]:border-l-violet-500 focus:bg-violet-50 focus:text-violet-600">Todas as funções</SelectItem>
                {[...(functions ?? [])].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })).map(f => (
                  <SelectItem key={f.id} value={f.id} className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-violet-50 data-[highlighted]:text-violet-600 data-[highlighted]:border-l-violet-500 focus:bg-violet-50 focus:text-violet-600">{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Tipo */}
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-28 h-[34px] text-xs shrink-0 bg-[#F8FAFC] border-0 border-b border-slate-200 rounded-none rounded-t-md text-slate-600 shadow-none focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-2xl shadow-xl border border-slate-100 min-w-[130px] p-1.5" style={{backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', background:'rgba(255,255,255,0.96)'}}>
                <SelectItem value="all" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-violet-50 data-[highlighted]:text-violet-600 data-[highlighted]:border-l-violet-500 focus:bg-violet-50 focus:text-violet-600">Todos</SelectItem>
                <SelectItem value="casa" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-violet-50 data-[highlighted]:text-violet-600 data-[highlighted]:border-l-violet-500 focus:bg-violet-50 focus:text-violet-600">Casa</SelectItem>
                <SelectItem value="freela" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-violet-50 data-[highlighted]:text-violet-600 data-[highlighted]:border-l-violet-500 focus:bg-violet-50 focus:text-violet-600">Freela</SelectItem>
              </SelectContent>
            </Select>

            {/* Ordenação */}
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-auto min-w-[150px] h-[34px] text-xs shrink-0 bg-[#F8FAFC] border-0 border-b border-slate-200 rounded-none rounded-t-md text-slate-600 shadow-none focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-2xl shadow-xl border border-slate-100 min-w-[160px] p-1.5" style={{backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', background:'rgba(255,255,255,0.96)'}}>
                <SelectItem value="adjusted" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-violet-50 data-[highlighted]:text-violet-600 data-[highlighted]:border-l-violet-500 focus:bg-violet-50 focus:text-violet-600">Ajustadas primeiro</SelectItem>
                <SelectItem value="value" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-violet-50 data-[highlighted]:text-violet-600 data-[highlighted]:border-l-violet-500 focus:bg-violet-50 focus:text-violet-600">Maior valor</SelectItem>
                <SelectItem value="name" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-violet-50 data-[highlighted]:text-violet-600 data-[highlighted]:border-l-violet-500 focus:bg-violet-50 focus:text-violet-600">Nome A-Z</SelectItem>
              </SelectContent>
            </Select>

            {/* Contador */}
            <div className="flex-1" />
            <span style={{fontSize:11, color:'#94A3B8', fontWeight:600, background:'#F8FAFC', borderRadius:8, padding:'4px 10px'}}>
              {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'itens'}
            </span>
          </div>

          {hasAnyEditable && filteredItems.length > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={selectAll}
                className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                  selectedCards.size === filteredItems.length && selectedCards.size > 0
                    ? 'bg-purple-600 border-purple-600'
                    : selectedCards.size > 0
                      ? 'bg-purple-200 border-purple-400'
                      : 'border-gray-300 dark:border-gray-600'
                }`}>
                  {selectedCards.size > 0 && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      {selectedCards.size === filteredItems.length
                        ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        : <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
                      }
                    </svg>
                  )}
                </div>
                {selectedCards.size > 0
                  ? `${selectedCards.size} selecionada${selectedCards.size > 1 ? 's' : ''}`
                  : 'Selecionar todas'
                }
              </button>
              {selectedCards.size > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px] text-gray-400 hover:text-gray-600"
                  onClick={() => setSelectedCards(new Set())}
                >
                  Limpar
                </Button>
              )}
            </div>
          )}

          <div className="space-y-5">
            {orderedRenderItems.map((item) => {
              const isGroupParent = !item.splitParentId && splitGroupsMap.has(item.id);
              const isGroupChild = !!item.splitParentId;
              const groupChildren = splitGroupsMap.get(item.id) || [];
              const groupTotal = isGroupParent
                ? item.totalValue + groupChildren.reduce((s, c) => s + c.totalValue, 0)
                : 0;
              const groupPlannedTotal = isGroupParent ? getPlannedRef(item)?.totalValue : undefined;

              if (isGroupChild) return null;

              if (!isGroupParent) {
                return <div key={item.id}>{renderSingleCard(item)}</div>;
              }

              const origPeriod = getGroupOriginalPeriod(item);
              return (
                <div key={item.id} className="rounded-2xl border-2 border-purple-200 dark:border-purple-800/50 overflow-hidden bg-purple-50/20 dark:bg-purple-950/10">
                  {/* Group banner */}
                  <div className="bg-gradient-to-r from-purple-600 to-violet-600 px-4 py-2.5 flex items-center gap-3">
                    <GitFork className="w-3.5 h-3.5 text-white/80 flex-shrink-0" />
                    <span className="text-[12px] font-semibold text-white flex-1">
                      Escalação dividida · {groupChildren.length + 1} colaboradores{origPeriod && ` · Período: ${origPeriod}`}
                    </span>
                    <span className="text-[12px] font-bold text-white tabular-nums">Total: {formatCurrency(groupTotal)}</span>
                  </div>
                  {/* Cards */}
                  <div className="p-2 space-y-0">
                    {renderSingleCard(item, { isGParent: true })}
                    {groupChildren.map((child) => (
                      <div key={child.id}>
                        <div className="flex justify-center py-1.5">
                          <div className="border-l-2 border-dashed border-purple-300 dark:border-purple-700 h-4" />
                        </div>
                        {renderSingleCard(child, { isGChild: true })}
                      </div>
                    ))}
                  </div>
                  {/* Group total footer */}
                  <div className="mx-2 mb-2 flex items-center justify-between px-3 py-2 bg-purple-100/60 dark:bg-purple-900/20 rounded-xl">
                    <div className="flex items-center gap-2">
                      <GitFork className="w-3.5 h-3.5 text-purple-500" />
                      <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold uppercase tracking-wider">Total da escalação</span>
                      {groupPlannedTotal !== undefined && (
                        <span className="text-[10px] text-purple-400/70 tabular-nums">plan: {formatCurrency(groupPlannedTotal)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {groupPlannedTotal !== undefined && Math.abs(groupTotal - groupPlannedTotal) > 1 && (
                        <span className={`text-[11px] font-semibold tabular-nums ${groupTotal - groupPlannedTotal < 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {groupTotal - groupPlannedTotal > 0 ? '+' : ''}{formatCurrency(groupTotal - groupPlannedTotal)}
                        </span>
                      )}
                      <span className="text-[15px] font-semibold text-purple-700 dark:text-purple-300 tabular-nums">{formatCurrency(groupTotal)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {selectedEventId && filteredItems.length > 0 && (
        <div className={`fixed bottom-0 right-0 z-40 px-6 py-3 bg-white/95 backdrop-blur-md border-t border-slate-200 transition-all duration-300 ${(isCollapsed || isFocusMode) ? 'left-0' : isCompact ? 'left-14' : 'left-[260px]'}`} style={{boxShadow:'0 -4px 20px #6d28d910'}}>
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <div className="text-[9px] uppercase tracking-widest font-semibold text-violet-400">Total Realizado</div>
                <div className="text-[18px] font-semibold tabular-nums leading-tight text-violet-700">{formatCurrency(totalRealizado)}</div>
              </div>
              <div className="h-8 w-px bg-slate-200" />
              <div className="text-[11px] text-slate-400">
                {prestacaoCount} {prestacaoCount === 1 ? 'prestação' : 'prestações'}
                {pendingCount < prestacaoCount && pendingCount > 0 && (
                  <span className="ml-1 text-amber-600 font-medium">· {pendingCount} pendente{pendingCount !== 1 ? 's' : ''}</span>
                )}
                {pendingCount === 0 && prestacaoCount > 0 && (
                  <span className="ml-1 text-emerald-600 font-medium">· todas enviadas</span>
                )}
                {selectedCards.size > 0 && (
                  <span className="ml-2 font-semibold text-violet-600">· {selectedCards.size} selecionada{selectedCards.size > 1 ? 's' : ''}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {allSentForReview ? (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-1.5 text-xs text-emerald-600 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Enviado para revisão
                </div>
              ) : selectedCards.size > 0 ? (
                <>
                  <button onClick={() => setSelectedCards(new Set())} className="text-xs text-slate-400 hover:text-slate-600">Limpar</button>
                  <Button
                    size="sm"
                    className="h-9 px-5 text-xs font-semibold rounded-xl text-white gap-1.5"
                    style={{background:'#059669', boxShadow:'0 4px 12px #05966940'}}
                    disabled={sendForReviewMutation.isPending}
                    onClick={() => {
                      if (!selectedEventId) return;
                      sendForReviewMutation.mutate({ eventId: selectedEventId, itemIds: Array.from(selectedCards) });
                      setSelectedCards(new Set());
                    }}
                  >
                    <Send className="w-3.5 h-3.5" />
                    Enviar selecionadas
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-xs text-slate-400 hidden sm:block">Selecione ou envie todas</span>
                  <Button
                    size="sm"
                    className="h-9 px-5 text-xs font-semibold rounded-xl text-white gap-1.5"
                    style={{background:'#059669', boxShadow:'0 4px 12px #05966940'}}
                    disabled={sendForReviewMutation.isPending}
                    onClick={() => {
                      if (!selectedEventId) return;
                      sendForReviewMutation.mutate({ eventId: selectedEventId });
                    }}
                  >
                    <Send className="w-3.5 h-3.5" />
                    Enviar todas
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <Dialog open={!!editingItem && !!editFormData} onOpenChange={() => { setEditingItem(null); setEditFormData(null); setShowAddDay(false); }}>
        <DialogContent className="max-w-[680px] w-[95vw] p-0 gap-0 rounded-3xl overflow-hidden shadow-2xl" style={{border:'1px solid rgba(0,0,0,0.06)', display:'flex', flexDirection:'column', maxHeight:'90vh'}}>
          <DialogHeader className="sr-only">
            <DialogTitle>Editar Prestação de Contas</DialogTitle>
          </DialogHeader>

          {editingItem && editFormData && (() => {
            const isReadOnly = !!editingItem.sentForReview;
            const itemDays = getItemDayCounts(editingItem);
            const activeDayEntries = editDayEntries.filter(d => d.active);
            const subtotalDiariasRaw = activeDayEntries.reduce((sum, d) => sum + d.valueCents, 0);
            const modalMobility = editFormData.mobilityIda + editFormData.mobilityVolta;
            const modalTotalRaw = subtotalDiariasRaw + modalMobility + editFormData.weekdayLunch + editFormData.weekdayDinner +
              editFormData.weekendLunch + editFormData.weekendDinner;
            const modalTotal = Math.abs(modalTotalRaw - editingItem.totalValue) <= 1 ? editingItem.totalValue : modalTotalRaw;
            const totalAlimentacao = editFormData.weekdayLunch + editFormData.weekdayDinner + editFormData.weekendLunch + editFormData.weekendDinner;
            const isFromPlanned = !!editingItem.plannedId || editingItem.observations?.includes('Enviado do planejado');
            const rawPlannedModal = (() => {
              const own = getPlannedRef(editingItem);
              if (own) return own;
              // Split child: no planned for the new collaborator — fall back to parent's planned
              if (editingItem.splitParentId) {
                const parent = budgetActual?.find(a => a.id === editingItem.splitParentId);
                return parent ? getPlannedRef(parent) : undefined;
              }
              return undefined;
            })();
            // For split children: scale using real weekday/weekend counts from the group
            const planned = (() => {
              if (!rawPlannedModal) return undefined;
              if (!editingItem.splitParentId) return rawPlannedModal;

              const parentId = editingItem.splitParentId;
              const allGroupItems = budgetActual?.filter(a => a.id === parentId || a.splitParentId === parentId) || [];
              const allGroupDays = [...new Set(allGroupItems.flatMap(a => (a.workedDays as string[] | null) || []))].sort();
              const myDays = (editingItem.workedDays as string[] | null) || [];

              if (myDays.length === 0 || allGroupDays.length === 0 || myDays.length >= allGroupDays.length) return rawPlannedModal;

              const origWkdays = allGroupDays.filter(d => !isWeekendDate(d)).length;
              const origWknds  = allGroupDays.filter(d =>  isWeekendDate(d)).length;
              const myWkdays   = myDays.filter(d => !isWeekendDate(d)).length;
              const myWknds    = myDays.filter(d =>  isWeekendDate(d)).length;

              const wkdayRatio = origWkdays > 0 ? myWkdays / origWkdays : 0;
              const wkndRatio  = origWknds  > 0 ? myWknds  / origWknds  : 0;
              const dayRatio   = myDays.length / allGroupDays.length;

              const propDiarias     = myDays.length * rawPlannedModal.dailyValue;
              const propWkdayLunch  = Math.round(rawPlannedModal.weekdayLunch  * wkdayRatio);
              const propWkdayDinner = Math.round(rawPlannedModal.weekdayDinner * wkdayRatio);
              const propWkndLunch   = Math.round(rawPlannedModal.weekendLunch   * wkndRatio);
              const propWkndDinner  = Math.round(rawPlannedModal.weekendDinner  * wkndRatio);
              const propMobility    = Math.round(rawPlannedModal.mobility       * dayRatio);
              const propTransport   = Math.round(rawPlannedModal.transport      * dayRatio);

              return {
                ...rawPlannedModal,
                dailyQuantity: myDays.length,
                weekdayLunch:  propWkdayLunch,
                weekdayDinner: propWkdayDinner,
                weekendLunch:  propWkndLunch,
                weekendDinner: propWkndDinner,
                mobility:      propMobility,
                transport:     propTransport,
                totalValue:    propDiarias + propWkdayLunch + propWkdayDinner + propWkndLunch + propWkndDinner + propMobility + propTransport,
              } as BudgetPlanned;
            })();
            const plannedSubDiarias = planned ? planned.totalValue - planned.weekdayLunch - planned.weekdayDinner - planned.weekendLunch - planned.weekendDinner - planned.mobility : 0;
            let plannedValorUtil = 0;
            let plannedValorFds = 0;
            if (planned && plannedSubDiarias > 0) {
              if (itemDays.weekdays === 0 && itemDays.weekends > 0) {
                plannedValorFds = Math.round(plannedSubDiarias / itemDays.weekends);
              } else if (itemDays.weekdays > 0 && itemDays.weekends === 0) {
                plannedValorUtil = Math.round(plannedSubDiarias / itemDays.weekdays);
              } else if (itemDays.weekdays > 0 && itemDays.weekends > 0) {
                const tw = itemDays.weekdays + itemDays.weekends * 2;
                plannedValorUtil = Math.round(plannedSubDiarias / tw);
                plannedValorFds = Math.round((plannedSubDiarias - itemDays.weekdays * plannedValorUtil) / itemDays.weekends);
              }
            }
            const plannedTotal = planned ? planned.totalValue : 0;
            const rawDifference = modalTotal - plannedTotal;
            const hasDivergence = planned && Math.abs(rawDifference) > 1;
            const difference = Math.abs(rawDifference) <= 1 ? 0 : rawDifference;
            const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const pctChange = plannedTotal > 0 ? ((modalTotal - plannedTotal) / plannedTotal * 100) : 0;

            const diffDiarias = subtotalDiariasRaw - plannedSubDiarias;
            const pctDiarias = plannedSubDiarias > 0 ? ((subtotalDiariasRaw - plannedSubDiarias) / plannedSubDiarias * 100) : 0;

            const isFieldChanged = (current: number, plannedVal: number) => planned && current !== plannedVal;

            const statusBadge = !planned ? null : !hasDivergence
              ? { label: 'Dentro do planejado', bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800', icon: <CheckCircle2 className="w-3 h-3" /> }
              : difference > 0
                ? { label: 'Acima do planejado', bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-700 dark:text-red-300', border: 'border-red-200 dark:border-red-800', icon: <TrendingUp className="w-3 h-3" /> }
                : { label: 'Abaixo do planejado', bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800', icon: <TrendingDown className="w-3 h-3" /> };

            return (
              <>
                {/* ── Header ── */}
                <div style={{background:'linear-gradient(135deg, #1d4ed8 0%, #3b5fe4 100%)'}} className="shrink-0">
                  <div className="flex items-center gap-3" style={{padding:'14px 20px'}}>
                    {(() => {
                      const mName = getCollaboratorName(editingItem.collaboratorId);
                      const mInit = mName.split(' ').filter(Boolean).slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();
                      return (
                        <div className="rounded-[10px] bg-white/20 border border-white/30 flex items-center justify-center flex-shrink-0" style={{width:38,height:38}}>
                          <span className="text-white text-[14px] font-bold">{mInit || '?'}</span>
                        </div>
                      );
                    })()}
                    <div className="flex-1 min-w-0">
                      <h2 className="font-bold text-white truncate leading-tight" style={{fontSize:15}}>{getCollaboratorName(editingItem.collaboratorId)}</h2>
                      <p className="text-[11px] text-white/70">{getFunctionName(editingItem.functionId)}</p>
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        <span className={`inline-flex items-center text-[11px] font-bold px-2 rounded-md ${editingItem.collaboratorType === 'casa' ? 'bg-blue-400/30 text-blue-100' : 'bg-orange-400/30 text-orange-100'}`} style={{height:20}}>
                          {editingItem.collaboratorType === 'casa' ? 'Casa' : 'Freela'}
                        </span>
                        {(itemDays.startDate || itemDays.endDate) && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-white/70" style={{height:20}}>
                            <Calendar className="w-3 h-3" />
                            {itemDays.startDate && itemDays.endDate
                              ? `${new Date(itemDays.startDate+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})} → ${new Date(itemDays.endDate+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}`
                              : itemDays.startDate
                                ? new Date(itemDays.startDate+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})
                                : new Date(itemDays.endDate!+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})
                            }
                          </span>
                        )}
                        {itemDays.weekdays > 0 && (
                          <span className="inline-flex items-center text-[11px] px-2 rounded-md" style={{height:20, background:'rgba(255,255,255,0.12)', color:'rgba(255,255,255,0.85)'}}>
                            {itemDays.weekdays}d úteis{itemDays.weekends > 0 ? ` · ${itemDays.weekends} fds` : ''}
                          </span>
                        )}
                        {isReadOnly && (
                          <span className="inline-flex items-center text-[11px] px-2 rounded-md bg-white/15 text-white gap-1" style={{height:20}}>
                            <Lock className="w-2.5 h-2.5" /> Bloqueado
                          </span>
                        )}
                        {editingItem.plannedId && plannedLogs.some(l => l.entity_id === editingItem.plannedId && l.action === 'update') && (
                          <span className="inline-flex items-center text-[11px] px-2 rounded-md bg-amber-400/25 text-amber-200 border border-amber-300/30 gap-1 font-semibold" style={{height:20}}>
                            ⚠️ Planejado alterado pelo RH
                          </span>
                        )}
                      </div>
                    </div>
                    {planned && statusBadge && (
                      <div className="flex items-center gap-1 px-2 rounded-lg text-[11px] font-semibold border flex-shrink-0 mr-6" style={{height:22, background:'transparent', color:'rgba(255,255,255,0.9)', borderColor:'rgba(255,255,255,0.35)'}}>
                        {statusBadge.icon}
                        {statusBadge.label}
                      </div>
                    )}
                  </div>
                  {rhComment && (
                    <div className="mt-2.5 p-2 rounded-xl bg-white/10 border border-white/20">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-300 mt-0.5 flex-shrink-0" />
                        <div>
                          <span className="text-[9px] uppercase text-amber-300 font-bold tracking-wider">Comentário do RH</span>
                          <p className="text-[11px] text-white/80 mt-0.5">{rhComment}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Read-only banner ── */}
                {isReadOnly && (
                  <div className="flex items-center gap-2.5 px-5 py-2 bg-amber-50 border-b border-amber-200 shrink-0">
                    <Lock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    <span className="text-xs font-medium text-amber-700">Valores enviados para revisão — somente leitura</span>
                  </div>
                )}

                {/* ── Barra de Abas ── */}
                <div className="flex border-b border-slate-200 bg-white shrink-0">
                  {([
                    { id: 'custos',      label: 'Custos' },
                    { id: 'observacoes', label: 'Observações' },
                    { id: 'historico',   label: 'Histórico' },
                  ] as const).map(({ id, label }) => (
                    <button
                      key={id}
                      onClick={() => setModalActualTab(id)}
                      className={[
                        'flex-1 h-10 text-[13px] font-medium transition-colors',
                        modalActualTab === id
                          ? 'text-[#1d4ed8] border-b-2 border-[#1d4ed8] bg-blue-50/40'
                          : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50',
                      ].join(' ')}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* ── Aba: Custos ── */}
                {modalActualTab === 'custos' && (
                <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5 space-y-4 bg-slate-50" style={{maxHeight:'52vh'}}>

                  {/* ── Diárias — editável ── */}
                  <div className="rounded-xl border border-slate-200 overflow-hidden" style={{borderLeft:'3px solid #3B4FE4', background:'#FAFBFF'}}>
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-blue-100" style={{background:'rgba(59,79,228,0.05)'}}>
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-md bg-[#3B4FE4] flex items-center justify-center">
                          <Calendar className="w-3 h-3 text-white" />
                        </div>
                        <span className="text-[11px] font-semibold text-[#3B4FE4] uppercase tracking-wide">Diárias</span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{background:'#EEF2FF', color:'#3B4FE4'}}>
                          {activeDayEntries.length} {activeDayEntries.length === 1 ? 'dia ativo' : 'dias ativos'}
                        </span>
                      </div>
                      <span className="text-[13px] font-bold font-mono text-[#3B4FE4] tabular-nums">{formatCurrency(subtotalDiariasRaw)}</span>
                    </div>
                    {/* Col headers */}
                    <div className="grid grid-cols-[auto_1fr_auto_auto] gap-2 bg-slate-50 px-4 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                      <span className="w-5" />
                      <span>Data</span>
                      <span className="text-right">Planejado</span>
                      <span className="text-right pr-1">Realizado</span>
                    </div>
                    {/* Day rows */}
                    <div className="max-h-48 overflow-y-auto divide-y divide-slate-50">
                      {editDayEntries.length === 0 && (
                        <div className="px-4 py-6 text-center text-[11px] text-slate-400">
                          Nenhuma data no período da escalação
                        </div>
                      )}
                      {editDayEntries.map((entry, idx) => {
                        const date = new Date(entry.date + 'T00:00:00');
                        const dayLabel = date.toLocaleDateString('pt-BR', { weekday: 'short' });
                        const dateLabel = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                        const plannedVal = entry.isWeekend ? plannedValorFds : plannedValorUtil;
                        const isChanged = planned && plannedVal > 0 && entry.active && entry.valueCents !== plannedVal;
                        return (
                          <div
                            key={entry.date}
                            className={`grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 px-4 py-2 transition-colors
                              ${!entry.active ? 'opacity-40 bg-slate-50/60' : 'hover:bg-blue-50/20'}`}
                          >
                            {/* Toggle */}
                            <button
                              type="button"
                              disabled={isReadOnly}
                              onClick={() => setEditDayEntries(prev => prev.map((e, i) => i === idx ? { ...e, active: !e.active } : e))}
                              className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors
                                ${entry.active ? 'bg-[#3B4FE4] text-white' : 'bg-slate-200 text-slate-400'}
                                ${isReadOnly ? 'cursor-not-allowed' : 'cursor-pointer hover:opacity-80'}`}
                            >
                              {entry.active && <Check className="w-2.5 h-2.5" />}
                            </button>
                            {/* Date + label */}
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-[12px] font-semibold text-slate-700 tabular-nums">{dateLabel}</span>
                              <span className="text-[10px] text-slate-400 capitalize">{dayLabel}</span>
                              {entry.isWeekend && (
                                <span className="text-[9px] font-semibold text-amber-600 bg-amber-50 border border-amber-100 px-1.5 rounded-full shrink-0">FDS</span>
                              )}
                            </div>
                            {/* Planned reference */}
                            <div className="text-right">
                              {planned && plannedVal > 0
                                ? <span className="text-[10px] text-slate-400 font-mono tabular-nums">{formatCurrency(plannedVal)}</span>
                                : <span className="text-[10px] text-slate-200">—</span>}
                            </div>
                            {/* Actual value input */}
                            <CurrencyInput
                              key={entry.date}
                              value={entry.valueCents}
                              onChange={v => setEditDayEntries(prev => prev.map((e, i) => i === idx ? { ...e, valueCents: v } : e))}
                              disabled={!entry.active || isReadOnly}
                              className={`text-right w-24 font-mono tabular-nums border rounded-[6px] font-semibold
                                focus:border-[#3B4FE4] focus:ring-2 focus:ring-[#3B4FE4]/15 focus:bg-white
                                ${!entry.active || isReadOnly
                                  ? 'bg-slate-50 border-slate-200 opacity-40 cursor-not-allowed'
                                  : isChanged
                                    ? 'bg-amber-50 border-amber-200'
                                    : 'bg-white border-[#e5e7eb] cursor-text'}`}
                              style={{height:38, fontSize:14}}
                            />
                          </div>
                        );
                      })}
                    </div>
                    {/* Add extra day */}
                    {!isReadOnly && (
                      <div className="px-4 py-2 border-t border-slate-100 bg-white">
                        {showAddDay ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="date"
                              autoFocus
                              className="h-7 text-xs border border-[#3B4FE4] rounded-lg px-2 text-slate-700 bg-blue-50 focus:outline-none focus:ring-2 focus:ring-[#3B4FE4]/20"
                              onChange={e => {
                                const newDate = e.target.value;
                                if (!newDate) return;
                                if (!editDayEntries.some(d => d.date === newDate)) {
                                  const isWknd = isWeekendDate(newDate);
                                  const refVal = isWknd
                                    ? (editDayEntries.find(de => de.isWeekend)?.valueCents ?? editDayEntries[0]?.valueCents ?? 0)
                                    : (editDayEntries.find(de => !de.isWeekend)?.valueCents ?? editDayEntries[0]?.valueCents ?? 0);
                                  setEditDayEntries(prev =>
                                    [...prev, { date: newDate, valueCents: refVal, active: true, isWeekend: isWknd }]
                                      .sort((a, b) => a.date.localeCompare(b.date))
                                  );
                                }
                                setShowAddDay(false);
                              }}
                              onBlur={() => setShowAddDay(false)}
                              onKeyDown={e => { if (e.key === 'Escape') setShowAddDay(false); }}
                            />
                            <span className="text-[10px] text-slate-400">Esc para cancelar</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setShowAddDay(true)}
                            className="flex items-center gap-1.5 text-[11px] font-semibold text-[#3B4FE4] hover:text-[#2233cc] transition-colors py-0.5"
                          >
                            <Plus className="w-3 h-3" />
                            Adicionar Dia Extra
                          </button>
                        )}
                      </div>
                    )}
                    {/* Divergence bar */}
                    {planned && Math.abs(diffDiarias) > 1 && (
                      <div className={`px-4 py-1.5 text-center border-t border-slate-100 ${diffDiarias < 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                        <span className={`text-[11px] font-semibold tabular-nums ${diffDiarias < 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {diffDiarias > 0 ? '+' : '−'}{formatCurrency(Math.abs(diffDiarias))}
                          {plannedSubDiarias > 0 && <span className="ml-1 opacity-70">({diffDiarias > 0 ? '+' : ''}{pctDiarias.toFixed(0)}%)</span>}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* ── Mobilidade — somente leitura ── */}
                  <div
                    className="rounded-xl border border-slate-200 overflow-hidden"
                    style={{borderLeft:'3px solid #e5e7eb', background:'#F8FAFC'}}
                    title="Este valor é definido pelo RH e não pode ser alterado nesta etapa"
                  >
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100" style={{background:'#F1F5F9'}}>
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-md bg-slate-400 flex items-center justify-center">
                          <Car className="w-3 h-3 text-white" />
                        </div>
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Mobilidade</span>
                        <span className="text-[9px] font-medium text-slate-400 flex items-center gap-0.5">
                          <Lock className="w-2.5 h-2.5" />
                          Definido pelo RH
                        </span>
                      </div>
                      <span className="text-[13px] font-bold text-slate-500 tabular-nums font-mono">{formatCurrency(modalMobility)}</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <ArrowRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
                          <span className="text-[12px] text-slate-500">Ida</span>
                        </div>
                        <span className="text-[13px] font-mono tabular-nums" style={{color:'#666'}}>{formatCurrency(editFormData.mobilityIda)}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-2.5" style={{background:'#F8FAFC'}}>
                        <div className="flex items-center gap-2">
                          <ArrowLeft className="w-3 h-3 text-slate-400 flex-shrink-0" />
                          <span className="text-[12px] text-slate-500">Volta</span>
                        </div>
                        <span className="text-[13px] font-mono tabular-nums" style={{color:'#666'}}>{formatCurrency(editFormData.mobilityVolta)}</span>
                      </div>
                    </div>
                  </div>

                  {/* ── Alimentação — somente leitura ── */}
                  <div
                    className="rounded-xl border border-slate-200 overflow-hidden"
                    style={{borderLeft:'3px solid #e5e7eb', background:'#F8FAFC'}}
                    title="Este valor é definido pelo RH e não pode ser alterado nesta etapa"
                  >
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100" style={{background:'#F1F5F9'}}>
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-md bg-slate-400 flex items-center justify-center">
                          <Utensils className="w-3 h-3 text-white" />
                        </div>
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Alimentação</span>
                        <span className="text-[9px] font-medium text-slate-400 flex items-center gap-0.5">
                          <Lock className="w-2.5 h-2.5" />
                          Definido pelo RH
                        </span>
                      </div>
                      <span className="text-[13px] font-bold text-slate-500 tabular-nums font-mono">{formatCurrency(totalAlimentacao)}</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {editFormData.weekdayLunch > 0 && (
                        <div className="flex items-center justify-between px-4 py-2">
                          <div className="flex items-center gap-1.5">
                            <Sun className="w-3 h-3 text-amber-400 flex-shrink-0" />
                            <span className="text-[12px] text-slate-500">Almoço <span className="text-slate-400">(dias úteis)</span></span>
                          </div>
                          <span className="text-[13px] font-mono tabular-nums cursor-not-allowed" style={{color:'#666'}}>{formatCurrency(editFormData.weekdayLunch)}</span>
                        </div>
                      )}
                      {editFormData.weekdayDinner > 0 && (
                        <div className="flex items-center justify-between px-4 py-2">
                          <div className="flex items-center gap-1.5">
                            <Moon className="w-3 h-3 text-indigo-400 flex-shrink-0" />
                            <span className="text-[12px] text-slate-500">Jantar <span className="text-slate-400">(dias úteis)</span></span>
                          </div>
                          <span className="text-[13px] font-mono tabular-nums cursor-not-allowed" style={{color:'#666'}}>{formatCurrency(editFormData.weekdayDinner)}</span>
                        </div>
                      )}
                      {editFormData.weekendLunch > 0 && (
                        <div className="flex items-center justify-between px-4 py-2">
                          <div className="flex items-center gap-1.5">
                            <Sun className="w-3 h-3 text-amber-300 flex-shrink-0" />
                            <span className="text-[12px] text-slate-500">Almoço <span className="text-slate-400">(fins de semana)</span></span>
                          </div>
                          <span className="text-[13px] font-mono tabular-nums cursor-not-allowed" style={{color:'#666'}}>{formatCurrency(editFormData.weekendLunch)}</span>
                        </div>
                      )}
                      {editFormData.weekendDinner > 0 && (
                        <div className="flex items-center justify-between px-4 py-2">
                          <div className="flex items-center gap-1.5">
                            <Moon className="w-3 h-3 text-indigo-300 flex-shrink-0" />
                            <span className="text-[12px] text-slate-500">Jantar <span className="text-slate-400">(fins de semana)</span></span>
                          </div>
                          <span className="text-[13px] font-mono tabular-nums cursor-not-allowed" style={{color:'#666'}}>{formatCurrency(editFormData.weekendDinner)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                )}

                {/* ── Aba: Observações ── */}
                {modalActualTab === 'observacoes' && (
                  <div className="flex-1 overflow-y-auto min-h-0 bg-slate-50/40" style={{maxHeight:'52vh'}}>
                    {editingItem && (
                      <BudgetChat
                        entityType="actual"
                        entityId={editingItem.id}
                        linkedEntityType={editingItem.plannedId ? "planned" : undefined}
                        linkedEntityId={editingItem.plannedId || undefined}
                      />
                    )}
                  </div>
                )}

                {/* ── Aba: Histórico ── */}
                {modalActualTab === 'historico' && (
                  <div className="flex-1 overflow-y-auto min-h-0 bg-slate-50/40" style={{maxHeight:'52vh'}}>
                    {editingItem && (
                      <ActivityTimeline entityType="budget_actual" entityId={editingItem.id} defaultOpen={true} />
                    )}
                  </div>
                )}

                {/* ── Footer ── */}
                <div className="border-t border-slate-200 bg-white shrink-0">
                  {/* Linha Planejado / Realizado / Diferença */}
                  <div className="flex items-center divide-x divide-slate-100" style={{height:52}}>
                    {planned ? (
                      <>
                        <div className="flex-1 flex flex-col items-center justify-center px-3">
                          <span className="text-[10px] uppercase text-slate-400 font-semibold tracking-wider">Planejado</span>
                          <span className="text-[15px] font-bold text-slate-600 tabular-nums">{formatCurrency(plannedTotal)}</span>
                        </div>
                        <div className="flex-1 flex flex-col items-center justify-center px-3">
                          <span className="text-[10px] uppercase font-semibold tracking-wider" style={{color:'#7C3AED'}}>Realizado</span>
                          <span className="text-[15px] font-bold tabular-nums" style={{color:'#7C3AED'}}>{formatCurrency(modalTotal)}</span>
                        </div>
                        <div className="flex-1 flex flex-col items-center justify-center px-3">
                          <span className="text-[10px] uppercase text-slate-400 font-semibold tracking-wider">Diferença</span>
                          {Math.abs(difference) <= 1 ? (
                            <span className="text-[15px] font-bold text-slate-300">—</span>
                          ) : (
                            <span className={`text-[15px] font-bold tabular-nums ${difference > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                              {difference > 0 ? '▲ ' : '▼ '}{formatCurrency(Math.abs(difference))}
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center px-3">
                        <span className="text-[10px] uppercase text-slate-400 font-semibold tracking-wider">Total da prestação</span>
                        <span className="text-[15px] font-bold tabular-nums" style={{color:'#7C3AED'}}>{formatCurrency(modalTotal)}</span>
                      </div>
                    )}
                  </div>
                  {/* Botões */}
                  <div className="px-5 pb-4 flex items-center justify-end gap-3">
                    {isReadOnly ? (
                      <Button variant="ghost" className="h-10 px-6 text-sm rounded-xl text-slate-600 hover:text-slate-800 hover:bg-slate-100" onClick={() => { setEditingItem(null); setEditFormData(null); setShowAddDay(false); }}>
                        Fechar
                      </Button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="text-[13px] text-slate-400 hover:text-slate-600 transition-colors px-2"
                          onClick={() => { setEditingItem(null); setEditFormData(null); setShowAddDay(false); }}
                        >
                          Cancelar
                        </button>
                        <Button
                          onClick={saveEdit}
                          disabled={updateMutation.isPending}
                          className="h-10 px-5 text-[13px] font-semibold rounded-xl text-white shadow-sm"
                          style={{background: '#3B4FE4'}}
                        >
                          <Check className="w-4 h-4 mr-1.5" />
                          {updateMutation.isPending ? 'Salvando...' : 'Salvar Prestação'}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDeleteId} onOpenChange={() => setConfirmDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar Remoção</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Tem certeza que deseja remover esta prestação? Esta ação não pode ser desfeita.
          </p>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => confirmDeleteId && deleteMutation.mutate(confirmDeleteId)}
              disabled={deleteMutation.isPending}
            >
              Remover
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Split Escalação Modal ── */}
      {splittingItem && (() => {
        const takenDays = (budgetActual || [])
          .filter((a: any) => a.splitParentId === splittingItem.id)
          .flatMap((a: any) => (a.workedDays as string[]) || []);
        return (
          <SplitVagaModal
            item={splittingItem}
            collaborators={collaborators || []}
            teamInclusion={getItemInclusion(splittingItem)}
            takenDays={takenDays}
            onClose={() => setSplittingItem(null)}
            isPending={splitMutation.isPending}
            onConfirm={(payload) => {
              splitMutation.mutate({ id: splittingItem.id, payload });
            }}
          />
        );
      })()}
    </div>
  );
}
