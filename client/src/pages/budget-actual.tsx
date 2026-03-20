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
import { ClipboardCheck, Edit, Trash2, Copy, Calendar, Car, Utensils, Moon, Sun, Briefcase, ChevronDown, ChevronUp, ArrowRight, Search, ArrowUpDown, Users, DollarSign, CheckCircle2, Send, BarChart3, Lock, TrendingDown, TrendingUp, AlertTriangle, Info, Eye, Clock, AlertCircle, CheckCheck, UserPlus, GitFork } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { EventSearchSelect } from "@/components/event-select";
import { SplitVagaModal } from "@/components/split-vaga-modal";
import type { Event, Function, Collaborator, BudgetActual, BudgetPlanned, TeamInclusion, BudgetComparison } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
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
      className={className}
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
  const [collapsedCards, setCollapsedCards] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<string>("adjusted");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterFunction, setFilterFunction] = useState<string>("all");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [splittingItem, setSplittingItem] = useState<BudgetActual | null>(null);
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: events } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: functions } = useQuery<Function[]>({ queryKey: ["/api/functions"] });
  const { data: collaborators } = useQuery<Collaborator[]>({ queryKey: ["/api/collaborators"] });

  const { data: allBudgetPlanned } = useQuery<BudgetPlanned[]>({
    queryKey: ["/api/budget-planned"],
  });

  const eventsWithPlanned = useMemo(() => {
    if (!events || !allBudgetPlanned) return undefined;
    const eventIdsWithPlanned = new Set(allBudgetPlanned.map(bp => bp.eventId));
    return events.filter(e => eventIdsWithPlanned.has(e.id));
  }, [events, allBudgetPlanned]);

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
    setEditingItem(item);
    const days = getItemDayCounts(item);
    const storedSubtotalDiarias = item.totalValue - item.weekdayLunch - item.weekdayDinner - item.weekendLunch - item.weekendDinner - item.mobility;
    const totalDays = days.weekdays + days.weekends;

    let valorUtil = days.weekdays > 0 ? 5000 : 0;
    let valorFds = days.weekends > 0 ? 10000 : 0;

    if (totalDays === 0 || storedSubtotalDiarias <= 0) {
      valorUtil = 0;
      valorFds = 0;
    } else if (days.weekdays === 0) {
      valorUtil = 0;
      valorFds = Math.round(storedSubtotalDiarias / days.weekends);
    } else if (days.weekends === 0) {
      valorFds = 0;
      valorUtil = Math.round(storedSubtotalDiarias / days.weekdays);
    } else {
      const totalWeightedDays = days.weekdays + days.weekends * 2;
      valorUtil = Math.round(storedSubtotalDiarias / totalWeightedDays);
      valorFds = Math.round((storedSubtotalDiarias - days.weekdays * valorUtil) / days.weekends);
    }

    // mobilityIda/mobilityVolta: use stored values if available; otherwise split 50/50 from mobility
    const storedIda = (item as any).mobilityIda;
    const storedVolta = (item as any).mobilityVolta;
    const hasBreakdown = typeof storedIda === 'number' && (storedIda > 0 || storedVolta > 0);
    const initIda = hasBreakdown ? storedIda : Math.ceil(item.mobility / 2);
    const initVolta = hasBreakdown ? (typeof storedVolta === 'number' ? storedVolta : 0) : Math.floor(item.mobility / 2);
    setEditFormData({
      valorDiariaUtil: valorUtil,
      valorDiariaFds: valorFds,
      weekdayLunch: item.weekdayLunch,
      weekdayDinner: item.weekdayDinner,
      weekendLunch: item.weekendLunch,
      weekendDinner: item.weekendDinner,
      mobilityIda: initIda,
      mobilityVolta: initVolta,
    });
  };

  const saveEdit = () => {
    if (!editingItem || !editFormData) return;
    const days = getItemDayCounts(editingItem);
    const subtotalDiariasUtil = days.weekdays * editFormData.valorDiariaUtil;
    const subtotalDiariasFds = days.weekends * editFormData.valorDiariaFds;
    const subtotalDiarias = subtotalDiariasUtil + subtotalDiariasFds;
    const qtdDiarias = days.weekdays + days.weekends;
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
  const totalDifference = totalRealizado - totalPlanejado;
  const diffLabel = totalDifference === 0
    ? { text: "Dentro do planejado", color: "text-gray-500" }
    : totalDifference < 0
      ? { text: `- ${formatCurrency(Math.abs(totalDifference))} abaixo do planejado`, color: "text-emerald-600" }
      : { text: `+ ${formatCurrency(totalDifference)} acima do planejado`, color: "text-red-500" };

  const hasAnyEditable = useMemo(() => {
    if (!budgetActual) return true;
    const eventItems = budgetActual.filter(a => a.eventId === selectedEventId);
    return eventItems.some(item => !item.sentForReview || item.rhStatus === "devolvido" || item.rhStatus === "rejeitado");
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
    const isItemLocked = !!(cardItem.sentForReview && !["devolvido", "rejeitado"].includes(cardItem.rhStatus || ""));
    const isItemEditable = !cardItem.sentForReview || cardItem.rhStatus === "devolvido" || cardItem.rhStatus === "rejeitado";
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

    return (
      <div
        data-card-id={cardItem.id}
        className={[
          'rounded-2xl border overflow-hidden transition-all duration-300 bg-white dark:bg-gray-800',
          isInGroup ? 'border-l-4 border-l-purple-400' : '',
          highlightCardId === cardItem.id ? 'ring-2 ring-violet-400 shadow-lg shadow-violet-100 dark:shadow-violet-900/30'
            : isSelected ? 'ring-2 ring-violet-300 border-violet-200 dark:border-violet-700 shadow-md shadow-violet-50'
            : diverges ? 'border-amber-200 dark:border-amber-800/50'
            : isInGroup ? 'border-purple-200 dark:border-purple-800/50'
            : 'border-gray-200 dark:border-gray-700',
        ].join(' ')}
      >
        {/* Card Header */}
        <div className="flex items-center justify-between px-3 py-1.5">
          <div className="flex items-center gap-3">
            {isItemLocked ? (
              <TooltipProvider><Tooltip><TooltipTrigger asChild>
                <Lock className="w-4 h-4 text-gray-400 flex-shrink-0 cursor-default" />
              </TooltipTrigger><TooltipContent side="right" className="text-xs">Prestação bloqueada para edição</TooltipContent></Tooltip></TooltipProvider>
            ) : isItemEditable ? (
              <button onClick={() => toggleSelect(cardItem.id)} className="flex-shrink-0">
                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-violet-600 border-violet-600' : 'border-gray-300 dark:border-gray-600 hover:border-violet-400'}`}>
                  {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                </div>
              </button>
            ) : null}
            <div className={`w-9 h-9 rounded-xl ${avatarBg} flex items-center justify-center flex-shrink-0 shadow-sm`}>
              <span className="text-white text-xs font-bold">{initials || '?'}</span>
            </div>
            <div>
              <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{collabName}</span>
              <div className="flex items-center flex-wrap gap-1.5 mt-0.5">
                <Badge variant="secondary" className="text-[10px] h-[18px] px-1.5 font-medium">{getFunctionName(cardItem.functionId)}</Badge>
                <Badge className={`text-[10px] h-[18px] px-1.5 font-medium ${isCasa ? 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-50' : 'bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-50'}`}>{isCasa ? 'Casa' : 'Freela'}</Badge>
                {statusBadge}
                {diverges && <Badge className="text-[10px] h-[18px] px-1.5 font-medium bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-50">Divergência</Badge>}
                {isGParent && <Badge className="text-[10px] h-[18px] px-1.5 font-medium bg-purple-100 text-purple-700 border border-purple-300 hover:bg-purple-100">Titular</Badge>}
                {isGChild && <Badge className="text-[10px] h-[18px] px-1.5 font-medium bg-purple-50 text-purple-600 border border-purple-200 hover:bg-purple-50 flex items-center gap-0.5"><GitFork className="w-2.5 h-2.5" />Divisão</Badge>}
              </div>
              {workedDaysStr && isInGroup && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Calendar className="w-3 h-3 text-purple-400 flex-shrink-0" />
                  <span className="text-[10px] text-purple-600 dark:text-purple-400 leading-tight">{workedDaysStr}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            {isItemEditable ? (
              <>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500 hover:text-blue-700 hover:bg-blue-50" onClick={() => openEditModal(cardItem)} title="Editar prestação"><Edit className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-purple-500 hover:text-purple-700 hover:bg-purple-50" onClick={() => setSplittingItem(cardItem)} title="Dividir escalação" disabled={splitMutation.isPending}><GitFork className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => setConfirmDeleteId(cardItem.id)} title="Remover"><Trash2 className="w-3.5 h-3.5" /></Button>
              </>
            ) : (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-500 hover:text-gray-700 hover:bg-gray-50" onClick={() => openEditModal(cardItem)} title="Visualizar"><Eye className="w-3.5 h-3.5" /></Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-gray-600" onClick={() => toggleCollapse(cardItem.id)}>
              {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>
        {/* Card Body */}
        {!isCollapsed && (() => {
          const planned = cardPlanned;
          const plannedAlim = planned ? (planned.weekdayLunch + planned.weekdayDinner + planned.weekendLunch + planned.weekendDinner) : 0;
          const plannedDiarias = planned ? (planned.totalValue - plannedAlim - planned.mobility) : 0;
          const diffInline = (actual: number, plan: number) => {
            if (!planned) return null;
            const d = actual - plan;
            if (Math.abs(d) <= 1) return null;
            return <span className={`text-[10px] tabular-nums font-semibold ml-1.5 ${d < 0 ? 'text-emerald-600' : 'text-red-500'}`}>{d > 0 ? '+' : '−'}{formatCurrency(Math.abs(d))}</span>;
          };
          return (
            <div className="px-2.5 pb-2 border-t border-gray-100 dark:border-gray-700/60 pt-2">
              <div className="grid grid-cols-2 gap-1.5">
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/20 rounded-lg p-2 border border-blue-100 dark:border-blue-900/40 h-full flex flex-col justify-between">
                  <div className="flex items-center gap-1 mb-1">
                    <div className="w-3.5 h-3.5 rounded bg-blue-500 flex items-center justify-center"><Calendar className="w-2 h-2 text-white" /></div>
                    <span className="text-[9px] font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider">Diárias</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-[13px] font-medium text-gray-900 dark:text-gray-100 tabular-nums">{formatCurrency(cardSubtotalDiarias)}</span>
                    {diffInline(cardSubtotalDiarias, plannedDiarias)}
                  </div>
                  {planned && Math.abs(cardSubtotalDiarias - plannedDiarias) > 1 && <div className="text-[9px] text-gray-400 tabular-nums mt-0.5">plan: {formatCurrency(plannedDiarias)}</div>}
                  <div className="mt-1 space-y-0.5">
                    {cardDays.weekdays > 0 && <div className="text-[10px] text-blue-600 dark:text-blue-400 tabular-nums">{formatDiasUteis(cardDays.weekdays)} × {formatCurrency(cardValorUtil)}</div>}
                    {cardDays.weekends > 0 && <div className="text-[10px] text-indigo-500 dark:text-indigo-400 tabular-nums">{formatFds(cardDays.weekends)} × {formatCurrency(cardValorFds)}</div>}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/20 rounded-lg p-2 border border-orange-100 dark:border-orange-900/40">
                    <div className="flex items-center gap-1 mb-1">
                      <div className="w-3.5 h-3.5 rounded bg-orange-400 flex items-center justify-center"><Utensils className="w-2 h-2 text-white" /></div>
                      <span className="text-[9px] font-semibold text-orange-700 dark:text-orange-300 uppercase tracking-wider">Alimentação</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-[13px] font-medium text-gray-900 dark:text-gray-100 tabular-nums">{formatCurrency(totalAlimentacao)}</span>
                      {diffInline(totalAlimentacao, plannedAlim)}
                    </div>
                    {planned && Math.abs(totalAlimentacao - plannedAlim) > 1 && <div className="text-[9px] text-gray-400 tabular-nums mt-0.5">plan: {formatCurrency(plannedAlim)}</div>}
                  </div>
                  <div className="bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/20 rounded-lg p-2 border border-violet-100 dark:border-violet-900/40">
                    <div className="flex items-center gap-1 mb-1">
                      <div className="w-3.5 h-3.5 rounded bg-violet-500 flex items-center justify-center"><Car className="w-2 h-2 text-white" /></div>
                      <span className="text-[9px] font-semibold text-violet-700 dark:text-violet-300 uppercase tracking-wider">Mobilidade</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-[13px] font-medium text-gray-900 dark:text-gray-100 tabular-nums">{formatCurrency(cardItem.mobility)}</span>
                      {diffInline(cardItem.mobility, planned?.mobility ?? 0)}
                    </div>
                    {(() => {
                      const ida = (cardItem as any).mobilityIda;
                      const volta = (cardItem as any).mobilityVolta;
                      if (typeof ida === 'number' && (ida > 0 || volta > 0)) {
                        return <div className="text-[9px] text-violet-400 dark:text-violet-500 tabular-nums mt-0.5">Ida: {formatCurrency(ida)} · Volta: {formatCurrency(volta ?? 0)}</div>;
                      }
                      return planned && Math.abs(cardItem.mobility - (planned?.mobility ?? 0)) > 1
                        ? <div className="text-[9px] text-gray-400 tabular-nums mt-0.5">plan: {formatCurrency(planned.mobility)}</div>
                        : null;
                    })()}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
        {/* Card Footer */}
        {(() => {
          const planned = cardPlanned;
          const diff = planned ? cardItem.totalValue - planned.totalValue : 0;
          return (
            <div className={`flex items-center justify-between px-3 py-2 border-t ${planned && Math.abs(diff) > 1 ? (diff < 0 ? 'border-emerald-100 bg-emerald-50/60 dark:bg-emerald-950/20 dark:border-emerald-900/40' : 'border-amber-100 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-900/40') : 'border-gray-100 dark:border-gray-700/60'}`}>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Total</span>
                {planned && <span className="text-[10px] text-gray-400 tabular-nums">plan: {formatCurrency(planned.totalValue)}</span>}
              </div>
              <div className="flex items-center gap-2">
                {planned && Math.abs(diff) > 1 && <span className={`text-xs font-semibold tabular-nums ${diff < 0 ? 'text-emerald-600' : 'text-amber-600'}`}>{diff > 0 ? '+' : ''}{formatCurrency(diff)}</span>}
                <span className="text-[16px] font-black tabular-nums text-violet-700">{formatCurrency(cardItem.totalValue)}</span>
              </div>
            </div>
          );
        })()}
      </div>
    );
  };

  return (
    <div className="space-y-5 max-w-5xl mx-auto pb-24">

      {/* ── Cabeçalho ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[10px] flex items-center justify-center" style={{background:'#6d28d9', boxShadow:'0 4px 14px #6d28d950'}}>
            <ClipboardCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Orçamento Realizado</h1>
            <p className="text-xs text-slate-400">Prestação de contas — escalas enviadas do Planejado</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <EventSearchSelect value={selectedEventId} onValueChange={v => { setSelectedEventId(v); setCollapsedCards(new Set()); }} events={eventsWithPlanned} />
        </div>
      </div>

      {!selectedEventId ? (
        /* ── Tela 1: Seleção de evento ── */
        <div className="rounded-2xl overflow-hidden border border-violet-100 dark:border-violet-900 shadow-sm">
          <div className="bg-gradient-to-br from-violet-50 via-purple-50 to-fuchsia-50 dark:from-violet-950/40 dark:via-purple-950/30 dark:to-fuchsia-950/20 px-8 py-16 text-center">
            <div className="relative w-24 h-24 mx-auto mb-6">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl shadow-lg shadow-violet-200 dark:shadow-violet-900/40 flex items-center justify-center -rotate-3">
                <ClipboardCheck className="w-10 h-10 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-emerald-400 rounded-xl flex items-center justify-center shadow-md">
                <CheckCircle2 className="w-4 h-4 text-white" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Selecione um evento</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto mb-8">
              Registre a prestação de contas. Preencha os valores efetivamente gastos em cada escala.
            </p>
            <div className="max-w-sm mx-auto">
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
            const nAprovadas = filteredItems.filter(i => i.rhStatus === 'aprovado').length;
            const nRevisao   = filteredItems.filter(i => i.sentForReview && !['aprovado','devolvido','rejeitado'].includes(i.rhStatus || '')).length;
            const nDevolvidas = filteredItems.filter(i => i.rhStatus === 'devolvido').length;
            const nPendentes = filteredItems.filter(i => !i.sentForReview).length;
            return (
              <div className="rounded-2xl overflow-hidden flex shadow-md" style={{boxShadow:'0 4px 20px #7c3aed18'}}>
                {/* Esquerda — total violeta sólido */}
                <div className="px-6 py-5 flex flex-col justify-center min-w-[220px]" style={{background:'linear-gradient(135deg, #6d28d9 0%, #7c3aed 100%)'}}>
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/70 mb-1">Total Realizado</p>
                  <div className="text-[30px] font-black text-white tabular-nums leading-none">{formatCurrency(totalRealizado)}</div>
                  <div className="text-[11px] text-white/60 mt-1.5 tabular-nums">Planejado: {formatCurrency(totalPlanejado)}</div>
                </div>
                {/* Direita — 4 stats */}
                <div className="flex-1 px-6 py-4 flex items-center gap-0" style={{background:'#F5F3FF'}}>
                  {[
                    { label: 'Total', value: String(prestacaoCount), color: '#6d28d9' },
                    { label: 'Pendentes', value: String(nPendentes), color: '#64748b' },
                    { label: 'Em Revisão', value: String(nRevisao), color: '#2563eb' },
                    { label: 'Aprovadas', value: String(nAprovadas), color: '#059669' },
                    { label: 'Devolvidas', value: String(nDevolvidas), color: '#d97706' },
                  ].map((s, i) => (
                    <div key={s.label} className="flex-1 flex items-start gap-3">
                      {i > 0 && <div className="w-px self-stretch bg-violet-100 mr-3" />}
                      <div>
                        <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{s.label}</div>
                        <div className="text-[22px] font-black leading-none" style={{color: s.color}}>{s.value}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* ── Filtros ── */}
          <div className="rounded-xl border border-slate-200 bg-[#FAFBFF] px-4 py-2.5 flex items-center gap-2.5 flex-wrap">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
              <Input
                placeholder="Buscar colaborador..."
                className="pl-8 h-8 text-xs rounded-lg border-slate-200 bg-white"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={filterFunction} onValueChange={setFilterFunction}>
              <SelectTrigger className="w-auto min-w-[150px] h-8 text-xs border border-slate-200 rounded-lg bg-white text-slate-700">
                <SelectValue placeholder="Função" />
              </SelectTrigger>
              <SelectContent className="bg-white border border-slate-200 rounded-xl shadow-lg min-w-[180px]">
                <SelectItem value="all">Todas funções</SelectItem>
                {[...(functions ?? [])].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })).map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-24 h-8 text-xs border border-slate-200 rounded-lg bg-white text-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white border border-slate-200 rounded-xl shadow-lg min-w-[130px]">
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="casa">Casa</SelectItem>
                <SelectItem value="freela">Freela</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-auto min-w-[160px] h-8 text-xs border border-slate-200 rounded-lg bg-white text-slate-700">
                <ArrowUpDown className="w-3 h-3 mr-1 text-slate-400" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white border border-slate-200 rounded-xl shadow-lg min-w-[180px]">
                <SelectItem value="adjusted">Ajustadas primeiro</SelectItem>
                <SelectItem value="value">Maior valor</SelectItem>
                <SelectItem value="name">Nome A-Z</SelectItem>
              </SelectContent>
            </Select>
            {/* Contador */}
            <span className="ml-auto text-[11px] text-slate-400 bg-white border border-gray-200 px-2.5 py-1 rounded-lg">
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

          <div className="space-y-3.5">
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
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 px-6 py-3 z-40" style={{boxShadow:'0 -4px 20px #6d28d910'}}>
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <div className="text-[9px] uppercase tracking-widest font-black text-violet-400">Total Realizado</div>
                <div className="text-[18px] font-black tabular-nums leading-tight text-violet-700">{formatCurrency(totalRealizado)}</div>
              </div>
              <div className="h-8 w-px bg-slate-200" />
              <div className="text-[11px] text-slate-400">
                {prestacaoCount} {prestacaoCount === 1 ? 'prestação' : 'prestações'}
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

      <Dialog open={!!editingItem && !!editFormData} onOpenChange={() => { setEditingItem(null); setEditFormData(null); }}>
        <DialogContent className="max-w-[680px] w-[95vw] p-0 gap-0 rounded-xl overflow-hidden border-0 shadow-xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Editar Prestação de Contas</DialogTitle>
          </DialogHeader>

          {editingItem && editFormData && (() => {
            const isReadOnly = editingItem.sentForReview && !["devolvido", "rejeitado"].includes(editingItem.rhStatus || "");
            const itemDays = getItemDayCounts(editingItem);
            const subtotalDiariasUtil = itemDays.weekdays * editFormData.valorDiariaUtil;
            const subtotalDiariasFds = itemDays.weekends * editFormData.valorDiariaFds;
            const subtotalDiariasRaw = subtotalDiariasUtil + subtotalDiariasFds;
            const modalMobility = editFormData.mobilityIda + editFormData.mobilityVolta;
            const modalTotalRaw = subtotalDiariasRaw + modalMobility + editFormData.weekdayLunch + editFormData.weekdayDinner +
              editFormData.weekendLunch + editFormData.weekendDinner;
            const modalTotal = Math.abs(modalTotalRaw - editingItem.totalValue) <= 1 ? editingItem.totalValue : modalTotalRaw;
            const subtotalDiarias = modalTotal - modalMobility - editFormData.weekdayLunch - editFormData.weekdayDinner -
              editFormData.weekendLunch - editFormData.weekendDinner;
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

            const diffDiarias = subtotalDiarias - plannedSubDiarias;
            const pctDiarias = plannedSubDiarias > 0 ? ((subtotalDiarias - plannedSubDiarias) / plannedSubDiarias * 100) : 0;

            const isFieldChanged = (current: number, plannedVal: number) => planned && current !== plannedVal;

            const statusBadge = !planned ? null : !hasDivergence
              ? { label: 'Dentro do planejado', bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800', icon: <CheckCircle2 className="w-3 h-3" /> }
              : difference > 0
                ? { label: 'Acima do planejado', bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-700 dark:text-red-300', border: 'border-red-200 dark:border-red-800', icon: <TrendingUp className="w-3 h-3" /> }
                : { label: 'Abaixo do planejado', bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800', icon: <TrendingDown className="w-3 h-3" /> };

            return (
              <>
                {/* ── Modal Header ── */}
                <div className="bg-gradient-to-br from-violet-600 to-purple-700 px-6 pt-5 pb-5">
                  <div className="flex items-start gap-4">
                    {(() => {
                      const mName = getCollaboratorName(editingItem.collaboratorId);
                      const mInit = mName.split(' ').filter(Boolean).slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();
                      const mBg = avatarColorAct(mName);
                      return (
                        <div className={`w-12 h-12 rounded-2xl ${mBg} border-2 border-white/30 flex items-center justify-center flex-shrink-0 shadow-lg`}>
                          <span className="text-white text-sm font-bold">{mInit || '?'}</span>
                        </div>
                      );
                    })()}
                    <div className="flex-1 min-w-0">
                      <h2 className="text-base font-bold text-white truncate">{getCollaboratorName(editingItem.collaboratorId)}</h2>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className="text-[10px] text-violet-200 bg-white/15 px-2 py-0.5 rounded-full">{getFunctionName(editingItem.functionId)}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${editingItem.collaboratorType === 'casa' ? 'bg-blue-400/30 text-blue-100' : 'bg-orange-400/30 text-orange-100'}`}>
                          {editingItem.collaboratorType === 'casa' ? 'Casa' : 'Freela'}
                        </span>
                        {isReadOnly && (
                          <span className="text-[10px] bg-white/15 text-white px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5" /> Bloqueado
                          </span>
                        )}
                      </div>
                      {!isReadOnly && (
                        <p className="text-xs text-violet-200 mt-1.5">Informe os valores realmente executados</p>
                      )}
                    </div>
                    {planned && statusBadge && (
                      <div className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold ${statusBadge.bg} ${statusBadge.text} border ${statusBadge.border} flex-shrink-0 mr-8`}>
                        {statusBadge.icon}
                        {statusBadge.label}
                      </div>
                    )}
                  </div>
                  {rhComment && (
                    <div className="mt-3 p-2.5 rounded-xl bg-white/10 border border-white/20">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-300 mt-0.5 flex-shrink-0" />
                        <div>
                          <span className="text-[9px] uppercase text-amber-300 font-semibold tracking-wider">Comentário do RH</span>
                          <p className="text-[11px] text-white/80 mt-0.5">{rhComment}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Read-only warning banner ── */}
                {isReadOnly && (
                  <div className="flex items-center gap-2.5 px-6 py-2.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800">
                    <Lock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                      Valores enviados para revisão — somente leitura
                    </span>
                  </div>
                )}

                <div className="max-h-[52vh] overflow-y-auto px-6 py-5 space-y-4 bg-gray-50/80 dark:bg-gray-900">

                  {/* ── Period pill ── */}
                  {(itemDays.startDate || itemDays.endDate) && (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                          <Calendar className="w-3.5 h-3.5 text-gray-500" />
                        </div>
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                          {itemDays.startDate && itemDays.endDate ? `${fmt(itemDays.startDate)} até ${fmt(itemDays.endDate)}` :
                           itemDays.startDate ? `Início: ${fmt(itemDays.startDate)}` : `Fim: ${fmt(itemDays.endDate!)}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {itemDays.weekdays > 0 && (
                          <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                            {itemDays.weekdays} {itemDays.weekdays === 1 ? 'dia útil' : 'dias úteis'}
                          </span>
                        )}
                        {itemDays.weekends > 0 && (
                          <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                            {itemDays.weekends} {itemDays.weekends === 1 ? 'fim de sem.' : 'fins de sem.'}
                          </span>
                        )}
                        <span className="text-[10px] font-bold text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                          {formatDias(itemDays.weekdays + itemDays.weekends)}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50/60 dark:bg-blue-950/30 border-b border-blue-100 dark:border-blue-900/40">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-blue-500" />
                        <span className="text-[11px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wide">Diárias</span>
                      </div>
                      <span className="text-sm font-bold text-blue-700 dark:text-blue-300 tabular-nums">{formatCurrency(subtotalDiarias)}</span>
                    </div>
                    <div className="p-4 space-y-3">
                      {planned && (
                        <div className="rounded-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
                          <div className="grid grid-cols-2 divide-x divide-gray-100 dark:divide-gray-700">
                            <div className="px-3 py-2 bg-gray-50/50 dark:bg-gray-800">
                              <div className="text-[9px] uppercase text-gray-400 font-semibold tracking-wider mb-1">Planejado</div>
                              <div className="text-xs font-bold text-gray-600 dark:text-gray-300 tabular-nums">{formatCurrency(plannedSubDiarias)}</div>
                              <div className="text-[10px] text-gray-400 mt-0.5 tabular-nums">
                                {itemDays.weekdays > 0 && <span>{itemDays.weekdays} × {formatCurrency(plannedValorUtil)}</span>}
                                {itemDays.weekdays > 0 && itemDays.weekends > 0 && <span> + </span>}
                                {itemDays.weekends > 0 && <span>{itemDays.weekends} × {formatCurrency(plannedValorFds)}</span>}
                              </div>
                            </div>
                            <div className="px-3 py-2 bg-blue-50/30 dark:bg-blue-950/10">
                              <div className="text-[9px] uppercase text-blue-500 font-semibold tracking-wider mb-1">Realizado</div>
                              <div className="text-xs font-bold text-blue-700 dark:text-blue-300 tabular-nums">{formatCurrency(subtotalDiarias)}</div>
                              <div className="text-[10px] text-blue-400 mt-0.5 tabular-nums">
                                {itemDays.weekdays > 0 && <span>{itemDays.weekdays} × {formatCurrency(editFormData.valorDiariaUtil)}</span>}
                                {itemDays.weekdays > 0 && itemDays.weekends > 0 && <span> + </span>}
                                {itemDays.weekends > 0 && <span>{itemDays.weekends} × {formatCurrency(editFormData.valorDiariaFds)}</span>}
                              </div>
                            </div>
                          </div>
                          {Math.abs(diffDiarias) > 1 && (
                            <div className={`px-3 py-1.5 text-center border-t border-gray-100 dark:border-gray-700 ${diffDiarias < 0 ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : 'bg-red-50/50 dark:bg-red-950/20'}`}>
                              <span className={`text-[11px] font-medium tabular-nums ${diffDiarias < 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {diffDiarias > 0 ? '+' : '-'}{formatCurrency(Math.abs(diffDiarias))}
                                {plannedSubDiarias > 0 && <span className="ml-1 text-[10px]">({diffDiarias > 0 ? '+' : ''}{pctDiarias.toFixed(0)}%)</span>}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <Briefcase className="w-3.5 h-3.5 text-blue-500" />
                          <div>
                            <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">Dias Úteis</div>
                            <div className="text-[10px] text-gray-400">{itemDays.weekdays} {itemDays.weekdays === 1 ? 'dia' : 'dias'}</div>
                          </div>
                        </div>
                        <div className={`flex items-center gap-2 ${isFieldChanged(editFormData.valorDiariaUtil, plannedValorUtil) ? 'bg-amber-50/60 dark:bg-amber-950/20 rounded-lg px-2 py-1 border border-amber-200/60 dark:border-amber-800/40' : ''}`}>
                          <div>
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-gray-400 font-medium">R$</span>
                              <CurrencyInput
                                className={`h-9 text-sm w-24 text-center font-medium ${itemDays.weekdays === 0 || isReadOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                                value={editFormData.valorDiariaUtil}
                                onChange={v => setEditFormData({...editFormData, valorDiariaUtil: v})}
                                disabled={itemDays.weekdays === 0 || isReadOnly}
                              />
                              <span className="text-[10px] text-gray-400">/dia</span>
                            </div>
                            {isFieldChanged(editFormData.valorDiariaUtil, plannedValorUtil) && (
                              <div className="flex items-center gap-1 mt-1.5">
                                <Badge className="text-[8px] h-[13px] px-1 bg-amber-100 text-amber-600 border-amber-200 hover:bg-amber-100">Alterado</Badge>
                                <span className="text-[9px] text-gray-400 tabular-nums">plan: {formatCurrency(plannedValorUtil)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-right min-w-[90px]">
                          <span className="text-sm font-bold text-gray-700 dark:text-gray-300 tabular-nums">{formatCurrency(subtotalDiariasUtil)}</span>
                          {itemDays.weekdays > 0 && (
                            <div className="text-[10px] text-gray-400 tabular-nums">{itemDays.weekdays} × {formatCurrency(editFormData.valorDiariaUtil)}</div>
                          )}
                        </div>
                      </div>

                      <Separator className="my-1" />

                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <Sun className="w-3.5 h-3.5 text-amber-500" />
                          <div>
                            <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">Fim de Semana</div>
                            <div className="text-[10px] text-gray-400">{itemDays.weekends} {itemDays.weekends === 1 ? 'dia' : 'dias'}</div>
                          </div>
                        </div>
                        <div className={`flex items-center gap-2 ${isFieldChanged(editFormData.valorDiariaFds, plannedValorFds) ? 'bg-amber-50/60 dark:bg-amber-950/20 rounded-lg px-2 py-1 border border-amber-200/60 dark:border-amber-800/40' : ''}`}>
                          <div>
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-gray-400 font-medium">R$</span>
                              <CurrencyInput
                                className={`h-9 text-sm w-24 text-center font-medium ${itemDays.weekends === 0 || isReadOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                                value={editFormData.valorDiariaFds}
                                onChange={v => setEditFormData({...editFormData, valorDiariaFds: v})}
                                disabled={itemDays.weekends === 0 || isReadOnly}
                              />
                              <span className="text-[10px] text-gray-400">/dia</span>
                            </div>
                            {isFieldChanged(editFormData.valorDiariaFds, plannedValorFds) && (
                              <div className="flex items-center gap-1 mt-1.5">
                                <Badge className="text-[8px] h-[13px] px-1 bg-amber-100 text-amber-600 border-amber-200 hover:bg-amber-100">Alterado</Badge>
                                <span className="text-[9px] text-gray-400 tabular-nums">plan: {formatCurrency(plannedValorFds)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-right min-w-[90px]">
                          <span className={`text-sm font-bold tabular-nums ${itemDays.weekends === 0 ? 'text-gray-300 dark:text-gray-600' : 'text-gray-700 dark:text-gray-300'}`}>{formatCurrency(subtotalDiariasFds)}</span>
                          {itemDays.weekends > 0 && (
                            <div className="text-[10px] text-gray-400 tabular-nums">{itemDays.weekends} × {formatCurrency(editFormData.valorDiariaFds)}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-purple-50/60 dark:bg-purple-950/30 border-b border-purple-100 dark:border-purple-900/40">
                      <div className="flex items-center gap-2">
                        <Car className="w-3.5 h-3.5 text-purple-500" />
                        <span className="text-[11px] font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wide">Mobilidade</span>
                        <span className="text-[10px] text-purple-400 dark:text-purple-500">ida e volta</span>
                      </div>
                      <span className="text-sm font-bold text-purple-700 dark:text-purple-300 tabular-nums">{formatCurrency(modalMobility)}</span>
                    </div>
                    <div className="p-4 space-y-3">
                      {/* Planned vs Actual comparison bar */}
                      {planned && (() => {
                        const diffMob = modalMobility - planned.mobility;
                        const pctMob = planned.mobility > 0 ? (diffMob / planned.mobility * 100) : 0;
                        const plannedIda = (planned as any).mobilityIda ?? Math.ceil(planned.mobility / 2);
                        const plannedVolta = (planned as any).mobilityVolta ?? Math.floor(planned.mobility / 2);
                        return (
                          <div className="rounded-lg border border-gray-100 dark:border-gray-700 overflow-hidden text-[11px]">
                            <div className="grid grid-cols-3 bg-gray-50/60 dark:bg-gray-800 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100 dark:border-gray-700">
                              <span></span><span className="text-center">Planejado</span><span className="text-right">Realizado</span>
                            </div>
                            <div className="px-3 py-1.5 grid grid-cols-3 items-center border-b border-gray-50 dark:border-gray-700/50">
                              <span className="text-gray-500">└ Ida</span>
                              <span className="text-center tabular-nums text-blue-500">{formatCurrency(plannedIda)}</span>
                              <span className="text-right tabular-nums text-purple-600 dark:text-purple-300">{formatCurrency(editFormData.mobilityIda)}</span>
                            </div>
                            <div className="px-3 py-1.5 grid grid-cols-3 items-center bg-gray-50/40 dark:bg-gray-800/40">
                              <span className="text-gray-500">└ Volta</span>
                              <span className="text-center tabular-nums text-blue-500">{formatCurrency(plannedVolta)}</span>
                              <span className="text-right tabular-nums text-purple-600 dark:text-purple-300">{formatCurrency(editFormData.mobilityVolta)}</span>
                            </div>
                            {Math.abs(diffMob) > 1 && (
                              <div className={`px-3 py-1.5 text-center border-t border-gray-100 dark:border-gray-700 ${diffMob < 0 ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : 'bg-red-50/50 dark:bg-red-950/20'}`}>
                                <span className={`font-medium tabular-nums ${diffMob < 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                  Total: {formatCurrency(planned.mobility)} → {formatCurrency(modalMobility)}
                                  {' '}<span className={`font-bold ${diffMob < 0 ? 'text-emerald-600' : 'text-red-500'}`}>({diffMob > 0 ? '+' : ''}{pctMob.toFixed(0)}%)</span>
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      {/* Two input fields: Ida + Volta */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="flex items-center gap-1.5 mb-1">
                            <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Ida (R$)</label>
                            {planned && isFieldChanged(editFormData.mobilityIda, ((planned as any).mobilityIda ?? Math.ceil(planned.mobility / 2))) && (
                              <Badge className="text-[8px] h-[13px] px-1 bg-amber-100 text-amber-600 border-amber-200 hover:bg-amber-100">Alt.</Badge>
                            )}
                          </div>
                          <CurrencyInput
                            className={`h-9 text-sm ${isReadOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                            value={editFormData.mobilityIda}
                            onChange={v => setEditFormData({...editFormData, mobilityIda: v})}
                            disabled={isReadOnly}
                          />
                          {planned && <span className="text-[9px] text-gray-400 tabular-nums block mt-1">plan: {formatCurrency((planned as any).mobilityIda ?? Math.ceil(planned.mobility / 2))}</span>}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 mb-1">
                            <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Volta (R$)</label>
                            {planned && isFieldChanged(editFormData.mobilityVolta, ((planned as any).mobilityVolta ?? Math.floor(planned.mobility / 2))) && (
                              <Badge className="text-[8px] h-[13px] px-1 bg-amber-100 text-amber-600 border-amber-200 hover:bg-amber-100">Alt.</Badge>
                            )}
                          </div>
                          <CurrencyInput
                            className={`h-9 text-sm ${isReadOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                            value={editFormData.mobilityVolta}
                            onChange={v => setEditFormData({...editFormData, mobilityVolta: v})}
                            disabled={isReadOnly}
                          />
                          {planned && <span className="text-[9px] text-gray-400 tabular-nums block mt-1">plan: {formatCurrency((planned as any).mobilityVolta ?? Math.floor(planned.mobility / 2))}</span>}
                        </div>
                      </div>
                      {/* Auto-computed total */}
                      <div className="flex items-center justify-between text-[11px] text-gray-500 px-1">
                        <span>Total mobilidade</span>
                        <span className="font-semibold text-purple-600 tabular-nums">{formatCurrency(modalMobility)}</span>
                      </div>
                    </div>
                  </div>

                  {/* ── Alimentação 2×2 Grid ── */}
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/20 border-b border-orange-100 dark:border-orange-900/40">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-orange-400 flex items-center justify-center">
                          <Utensils className="w-3.5 h-3.5 text-white" />
                        </div>
                        <span className="text-xs font-bold text-orange-700 dark:text-orange-300 uppercase tracking-wider">Alimentação</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {planned && (() => {
                          const plannedAlim = planned.weekdayLunch + planned.weekdayDinner + planned.weekendLunch + planned.weekendDinner;
                          const diffAlim = totalAlimentacao - plannedAlim;
                          if (Math.abs(diffAlim) <= 1) return null;
                          return (
                            <span className={`text-[10px] font-bold tabular-nums ${diffAlim < 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                              {diffAlim > 0 ? '+' : '−'}{formatCurrency(Math.abs(diffAlim))}
                            </span>
                          );
                        })()}
                        <span className="text-sm font-black text-orange-700 dark:text-orange-300 tabular-nums border-l border-orange-200 dark:border-orange-800 pl-2 ml-0.5">{formatCurrency(totalAlimentacao)}</span>
                      </div>
                    </div>

                    {/* 2×2 Grid: Columns = Dias Úteis / Fins de Semana; Rows = Almoço / Jantar */}
                    <div className="p-3">
                      {/* Column headers */}
                      <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 mb-2">
                        <div />
                        <div className="text-center">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                            <Briefcase className="w-2.5 h-2.5" /> Dias Úteis
                          </span>
                        </div>
                        <div className="text-center">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                            <Sun className="w-2.5 h-2.5" /> Fins de Sem.
                          </span>
                        </div>
                      </div>

                      {/* Row 1: Almoço */}
                      <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 mb-2">
                        <div className="flex items-center gap-1">
                          <Sun className="w-3 h-3 text-amber-400" />
                          <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-400">Almoço</span>
                        </div>
                        <div className={`rounded-xl p-2 border ${isFieldChanged(editFormData.weekdayLunch, planned?.weekdayLunch ?? 0) ? 'border-amber-300 bg-amber-50/60 dark:bg-amber-950/20' : 'border-gray-100 dark:border-gray-700 bg-gray-50/50'}`}>
                          <CurrencyInput
                            className={`h-8 text-xs text-center w-full ${itemDays.weekdays === 0 || isReadOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                            value={editFormData.weekdayLunch}
                            onChange={v => setEditFormData({...editFormData, weekdayLunch: v})}
                            disabled={itemDays.weekdays === 0 || isReadOnly}
                          />
                          {isFieldChanged(editFormData.weekdayLunch, planned?.weekdayLunch ?? 0) && (
                            <div className="text-[9px] text-gray-400 tabular-nums text-center mt-0.5">plan: {formatCurrency(planned!.weekdayLunch)}</div>
                          )}
                        </div>
                        <div className={`rounded-xl p-2 border ${isFieldChanged(editFormData.weekendLunch, planned?.weekendLunch ?? 0) ? 'border-amber-300 bg-amber-50/60 dark:bg-amber-950/20' : 'border-gray-100 dark:border-gray-700 bg-gray-50/50'}`}>
                          <CurrencyInput
                            className={`h-8 text-xs text-center w-full ${itemDays.weekends === 0 || isReadOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                            value={editFormData.weekendLunch}
                            onChange={v => setEditFormData({...editFormData, weekendLunch: v})}
                            disabled={itemDays.weekends === 0 || isReadOnly}
                          />
                          {isFieldChanged(editFormData.weekendLunch, planned?.weekendLunch ?? 0) && (
                            <div className="text-[9px] text-gray-400 tabular-nums text-center mt-0.5">plan: {formatCurrency(planned!.weekendLunch)}</div>
                          )}
                        </div>
                      </div>

                      {/* Row 2: Jantar */}
                      <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 mb-3">
                        <div className="flex items-center gap-1">
                          <Moon className="w-3 h-3 text-indigo-400" />
                          <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-400">Jantar</span>
                        </div>
                        <div className={`rounded-xl p-2 border ${isFieldChanged(editFormData.weekdayDinner, planned?.weekdayDinner ?? 0) ? 'border-amber-300 bg-amber-50/60 dark:bg-amber-950/20' : 'border-gray-100 dark:border-gray-700 bg-gray-50/50'}`}>
                          <CurrencyInput
                            className={`h-8 text-xs text-center w-full ${itemDays.weekdays === 0 || isReadOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                            value={editFormData.weekdayDinner}
                            onChange={v => setEditFormData({...editFormData, weekdayDinner: v})}
                            disabled={itemDays.weekdays === 0 || isReadOnly}
                          />
                          {isFieldChanged(editFormData.weekdayDinner, planned?.weekdayDinner ?? 0) && (
                            <div className="text-[9px] text-gray-400 tabular-nums text-center mt-0.5">plan: {formatCurrency(planned!.weekdayDinner)}</div>
                          )}
                        </div>
                        <div className={`rounded-xl p-2 border ${isFieldChanged(editFormData.weekendDinner, planned?.weekendDinner ?? 0) ? 'border-amber-300 bg-amber-50/60 dark:bg-amber-950/20' : 'border-gray-100 dark:border-gray-700 bg-gray-50/50'}`}>
                          <CurrencyInput
                            className={`h-8 text-xs text-center w-full ${itemDays.weekends === 0 || isReadOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                            value={editFormData.weekendDinner}
                            onChange={v => setEditFormData({...editFormData, weekendDinner: v})}
                            disabled={itemDays.weekends === 0 || isReadOnly}
                          />
                          {isFieldChanged(editFormData.weekendDinner, planned?.weekendDinner ?? 0) && (
                            <div className="text-[9px] text-gray-400 tabular-nums text-center mt-0.5">plan: {formatCurrency(planned!.weekendDinner)}</div>
                          )}
                        </div>
                      </div>

                      {/* Subtotal row */}
                      <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 border-t border-gray-100 dark:border-gray-700 pt-2">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider self-center">Subtotal</span>
                        <div className="text-center">
                          <span className="text-xs font-black text-blue-600 dark:text-blue-300 tabular-nums">{formatCurrency(editFormData.weekdayLunch + editFormData.weekdayDinner)}</span>
                        </div>
                        <div className="text-center">
                          <span className="text-xs font-black text-amber-600 dark:text-amber-300 tabular-nums">{formatCurrency(editFormData.weekendLunch + editFormData.weekendDinner)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Modal Footer ── */}
                <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                  {/* 3-column totals bar */}
                  {planned ? (
                    <div className="grid grid-cols-3 divide-x divide-gray-200 dark:divide-gray-700">
                      <div className="px-4 py-3 text-center">
                        <div className="text-[9px] uppercase text-gray-400 font-bold tracking-widest mb-1">Planejado</div>
                        <div className="text-sm font-black text-gray-600 dark:text-gray-300 tabular-nums">{formatCurrency(plannedTotal)}</div>
                      </div>
                      <div className="px-4 py-3 text-center bg-violet-50/50 dark:bg-violet-950/20">
                        <div className="text-[9px] uppercase text-violet-500 font-bold tracking-widest mb-1">Realizado</div>
                        <div className="text-sm font-black text-violet-700 dark:text-violet-300 tabular-nums">{formatCurrency(modalTotal)}</div>
                      </div>
                      <div className={`px-4 py-3 text-center ${Math.abs(difference) <= 1 ? 'bg-gray-50/60' : difference < 0 ? 'bg-emerald-50/60 dark:bg-emerald-950/20' : 'bg-red-50/60 dark:bg-red-950/20'}`}>
                        <div className="text-[9px] uppercase text-gray-400 font-bold tracking-widest mb-1">Diferença</div>
                        {Math.abs(difference) <= 1 ? (
                          <div className="text-sm font-black text-gray-400 tabular-nums">—</div>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            {difference < 0 ? <TrendingDown className="w-3.5 h-3.5 text-emerald-500" /> : <TrendingUp className="w-3.5 h-3.5 text-red-500" />}
                            <span className={`text-sm font-black tabular-nums ${difference < 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                              {difference > 0 ? '+' : '−'}{formatCurrency(Math.abs(difference))}
                            </span>
                          </div>
                        )}
                        {plannedTotal > 0 && Math.abs(difference) > 1 && (
                          <div className={`text-[10px] tabular-nums font-semibold ${difference < 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                            {difference > 0 ? '+' : ''}{pctChange.toFixed(1)}%
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="px-6 py-3 flex items-center justify-between">
                      <div>
                        <div className="text-[10px] uppercase text-gray-400 font-semibold tracking-wider">Total da prestação</div>
                        <div className="text-xl font-black text-violet-700 dark:text-violet-300 tabular-nums">{formatCurrency(modalTotal)}</div>
                      </div>
                    </div>
                  )}

                  {/* Action row */}
                  <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-700/60 flex items-center justify-end gap-3">
                    {isReadOnly ? (
                      <Button variant="ghost" className="h-10 px-6 text-sm rounded-xl text-gray-600 hover:text-gray-800 hover:bg-gray-100" onClick={() => { setEditingItem(null); setEditFormData(null); }}>
                        Fechar
                      </Button>
                    ) : (
                      <>
                        <Button variant="ghost" className="h-9 px-4 text-sm text-gray-400 hover:text-gray-600 rounded-xl" onClick={() => { setEditingItem(null); setEditFormData(null); }}>
                          Cancelar
                        </Button>
                        <Button
                          onClick={saveEdit}
                          disabled={updateMutation.isPending}
                          className="h-10 px-6 text-sm rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-md shadow-violet-200 dark:shadow-violet-900/30"
                        >
                          <CheckCheck className="w-4 h-4 mr-2" />
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
