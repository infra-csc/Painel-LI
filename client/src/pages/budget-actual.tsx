import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ClipboardCheck, Edit, Trash2, Copy, Calendar, Car, Utensils, Moon, Sun, Briefcase, ChevronDown, ChevronUp, ArrowRight, Search, ArrowUpDown, Users, DollarSign, CheckCircle2, Send, BarChart3, Lock, TrendingDown, TrendingUp, AlertTriangle, Info, Eye } from "lucide-react";
import { EventSelect, EventSelectCTA } from "@/components/event-select";
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
    mobility: number;
  } | null>(null);
  const [collapsedCards, setCollapsedCards] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<string>("adjusted");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterFunction, setFilterFunction] = useState<string>("all");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
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

  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/budget-actual/${id}/duplicate`, { userId: user?.id });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Prestação duplicada" });
      qc.invalidateQueries({ queryKey: ["/api/budget-actual"] });
    },
    onError: () => {
      toast({ title: "Erro", description: "Erro ao duplicar prestação", variant: "destructive" });
    },
  });

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
  };

  const getCollaboratorName = (id?: string | null) => {
    if (!id) return "Não definido";
    return collaborators?.find(c => c.id === id)?.fullName || "Não definido";
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

  const getItemDayCounts = (item: BudgetActual): { weekdays: number; weekends: number; startDate: string | null; endDate: string | null } => {
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

    setEditFormData({
      valorDiariaUtil: valorUtil,
      valorDiariaFds: valorFds,
      weekdayLunch: item.weekdayLunch,
      weekdayDinner: item.weekdayDinner,
      weekendLunch: item.weekendLunch,
      weekendDinner: item.weekendDinner,
      mobility: item.mobility,
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
    const totalValue = subtotalDiarias + editFormData.weekdayLunch + editFormData.weekdayDinner +
      editFormData.weekendLunch + editFormData.weekendDinner + editFormData.mobility;
    updateMutation.mutate({
      id: editingItem.id,
      data: {
        dailyQuantity: qtdDiarias,
        dailyValue,
        weekdayLunch: editFormData.weekdayLunch,
        weekdayDinner: editFormData.weekdayDinner,
        weekendLunch: editFormData.weekendLunch,
        weekendDinner: editFormData.weekendDinner,
        mobility: editFormData.mobility,
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

  const totalRealizado = filteredItems.reduce((sum, item) => sum + item.totalValue, 0);
  const totalCasa = filteredItems.filter(i => i.collaboratorType === 'casa').reduce((s, i) => s + i.totalValue, 0);
  const totalFreela = filteredItems.filter(i => i.collaboratorType === 'freela').reduce((s, i) => s + i.totalValue, 0);
  const totalPlanejado = useMemo(() => {
    return filteredItems.reduce((sum, item) => {
      const planned = getPlannedRef(item);
      return sum + (planned ? planned.totalValue : item.totalValue);
    }, 0);
  }, [filteredItems, budgetPlanned]);
  const totalDifference = totalRealizado - totalPlanejado;

  const hasAnyEditable = useMemo(() => {
    if (!budgetActual) return true;
    const eventItems = budgetActual.filter(a => a.eventId === selectedEventId);
    return eventItems.some(item => !item.sentForReview || item.rhStatus === "devolvido" || item.rhStatus === "rejeitado");
  }, [budgetActual, selectedEventId]);
  const allSentForReview = sentForReview;

  return (
    <div className="space-y-5 max-w-5xl mx-auto pb-24">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-purple-100 dark:bg-purple-900/40 p-2 rounded-lg">
            <ClipboardCheck className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-purple-900 dark:text-purple-100">Orçamento Realizado</h1>
            <p className="text-sm text-gray-500">Registro da prestação de contas — escalas enviadas do Planejado</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {selectedEventId && (
            <EventSelect value={selectedEventId} onValueChange={v => { setSelectedEventId(v); setCollapsedCards(new Set()); }} events={eventsWithPlanned} />
          )}
        </div>
      </div>

      {!selectedEventId ? (
        <div className="rounded-xl border-2 border-dashed border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20 p-16 text-center">
          <div className="bg-purple-100 dark:bg-purple-900/50 rounded-2xl p-5 w-fit mx-auto mb-5">
            <ClipboardCheck className="w-14 h-14 text-purple-500 dark:text-purple-400" />
          </div>
          <h2 className="text-xl font-semibold text-purple-900 dark:text-purple-100 mb-2">Selecione um evento</h2>
          <p className="text-purple-600/70 dark:text-purple-400/70 text-sm max-w-md mx-auto mb-6">
            Registre a prestação de contas. Aqui você preenche os valores efetivamente gastos em cada escala enviada do planejado.
          </p>
          <EventSelectCTA value={selectedEventId} onValueChange={v => { setSelectedEventId(v); setCollapsedCards(new Set()); }} events={eventsWithPlanned} accentColor="purple" />
        </div>
      ) : isLoading ? (
        <div className="text-center py-16 text-gray-500">Carregando...</div>
      ) : filteredItems.length === 0 && !searchTerm && filterType === "all" ? (
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <ClipboardCheck className="w-16 h-16 text-gray-200 dark:text-gray-700 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">Nenhuma prestação disponível</h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6 max-w-md mx-auto">
            Envie escalas do Planejado para iniciar o Realizado deste evento
          </p>
          <Link href="/budget-planned">
            <Button className="bg-blue-600 hover:bg-blue-700">
              <ArrowRight className="w-4 h-4 mr-2" />
              Ir para Planejado
            </Button>
          </Link>
        </div>
      ) : (
        <>
          {(() => {
            const eventItems = budgetActual?.filter(a => a.eventId === selectedEventId) || [];
            const allApproved = eventItems.length > 0 && eventItems.every(i => i.rhStatus === "aprovado");
            const anyDevolvido = eventItems.some(i => i.rhStatus === "devolvido");
            const anyRejeitado = eventItems.some(i => i.rhStatus === "rejeitado");
            const allSent = eventItems.length > 0 && eventItems.every(i => i.sentForReview);
            const anySent = eventItems.some(i => i.sentForReview);

            let currentStep = 0;
            if (allApproved) {
              currentStep = 3;
            } else if (allSent || anySent) {
              currentStep = 2;
            } else if (anyDevolvido || anyRejeitado) {
              currentStep = 1;
            } else {
              const hasEdited = eventItems.some(i => i.updatedAt && i.createdAt && new Date(i.updatedAt).getTime() > new Date(i.createdAt).getTime() + 1000);
              currentStep = hasEdited ? 1 : 0;
            }

            const steps = [
              { label: "Preencher valores", desc: "Informe o realizado" },
              { label: "Enviar ao RH", desc: "Envie para análise" },
              { label: "Análise do RH", desc: "Aguarde aprovação" },
              { label: "Aprovado", desc: "Prestação concluída" },
            ];

            const diffLabel = totalDifference === 0
              ? { text: "Dentro do planejado", color: "text-gray-500" }
              : totalDifference < 0
                ? { text: `- ${formatCurrency(Math.abs(totalDifference))} abaixo do planejado`, color: "text-emerald-600" }
                : { text: `+ ${formatCurrency(totalDifference)} acima do planejado`, color: "text-red-500" };

            return (
              <div className="space-y-3">
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-5 py-3.5">
                  <div className="flex items-center justify-between">
                    {steps.map((step, i) => {
                      const isDone = i < currentStep;
                      const isActive = i === currentStep;
                      const isLast = i === steps.length - 1;
                      return (
                        <div key={i} className="flex items-center flex-1">
                          <div className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                              isDone ? 'bg-emerald-500 text-white' :
                              isActive ? 'bg-purple-600 text-white ring-2 ring-purple-200 dark:ring-purple-800' :
                              'bg-gray-100 dark:bg-gray-700 text-gray-400'
                            }`}>
                              {isDone ? (
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (i + 1)}
                            </div>
                            <div className="min-w-0">
                              <div className={`text-[11px] font-medium leading-tight ${
                                isDone ? 'text-emerald-600 dark:text-emerald-400' :
                                isActive ? 'text-purple-700 dark:text-purple-300' :
                                'text-gray-400'
                              }`}>{step.label}</div>
                              <div className="text-[9px] text-gray-400 leading-tight mt-0.5">{step.desc}</div>
                            </div>
                          </div>
                          {!isLast && (
                            <div className={`flex-1 h-[2px] mx-3 rounded ${
                              isDone ? 'bg-emerald-300 dark:bg-emerald-600' : 'bg-gray-200 dark:bg-gray-700'
                            }`} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            );
          })()}

          {/* Bloco financeiro - oculto temporariamente para publicação */}
          {false && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-gray-400 text-[10px] font-medium uppercase tracking-wider mb-0.5">Total Realizado</div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{formatCurrency(totalRealizado)}</div>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[11px] text-gray-400 tabular-nums">Planejado: {formatCurrency(totalPlanejado)}</span>
                    <span className={`text-[11px] tabular-nums font-medium ${diffLabel.color}`}>
                      {diffLabel.text}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <Input
                placeholder="Buscar colaborador..."
                className="pl-9 h-8 text-xs"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={filterFunction} onValueChange={setFilterFunction}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue placeholder="Função" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas funções</SelectItem>
                {functions?.map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-28 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="casa">Casa</SelectItem>
                <SelectItem value="freela">Freela</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-44 h-8 text-xs">
                <ArrowUpDown className="w-3 h-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="adjusted">Ajustadas primeiro</SelectItem>
                <SelectItem value="value">Maior valor</SelectItem>
                <SelectItem value="name">Nome A-Z</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-[11px] text-gray-400 ml-auto">
              {filteredItems.length} {filteredItems.length === 1 ? 'prestação' : 'prestações'}
            </div>
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
            {filteredItems.map(item => {
              const isCollapsed = collapsedCards.has(item.id);
              const isCasa = item.collaboratorType === 'casa';
              const totalAlimentacao = item.weekdayLunch + item.weekdayDinner + item.weekendLunch + item.weekendDinner;
              const isFromPlanned = !!item.plannedId || item.observations?.includes('Enviado do planejado');
              const isDuplicated = item.observations?.includes('Duplicado no Realizado');
              const diverges = hasItemDivergence(item);
              const cardDays = getItemDayCounts(item);
              const cardSubtotalDiarias = item.totalValue - item.weekdayLunch - item.weekdayDinner - item.weekendLunch - item.weekendDinner - item.mobility;
              const cardTotalDays = cardDays.weekdays + cardDays.weekends;
              let cardValorUtil = 0;
              let cardValorFds = 0;
              if (cardTotalDays > 0 && cardSubtotalDiarias > 0) {
                if (cardDays.weekdays === 0) {
                  cardValorFds = Math.round(cardSubtotalDiarias / cardDays.weekends);
                } else if (cardDays.weekends === 0) {
                  cardValorUtil = Math.round(cardSubtotalDiarias / cardDays.weekdays);
                } else {
                  const tw = cardDays.weekdays + cardDays.weekends * 2;
                  cardValorUtil = Math.round(cardSubtotalDiarias / tw);
                  cardValorFds = Math.round((cardSubtotalDiarias - cardDays.weekdays * cardValorUtil) / cardDays.weekends);
                }
              }
              const isSelected = selectedCards.has(item.id);

              const isItemLocked = item.sentForReview && !["devolvido", "rejeitado"].includes(item.rhStatus || "");
              const isItemEditable = !item.sentForReview || item.rhStatus === "devolvido" || item.rhStatus === "rejeitado";

              const hasBeenEdited = item.updatedAt && item.createdAt && new Date(item.updatedAt).getTime() > new Date(item.createdAt).getTime() + 1000;
              const formatDateTime = (d: string | Date) => {
                const date = new Date(d);
                return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
              };

              const getStatusBadge = () => {
                if (item.sentForReview) {
                  if (item.rhStatus === "aprovado") {
                    return <Badge className="text-[10px] h-[18px] px-1.5 font-normal bg-green-50 text-green-600 border border-green-200 hover:bg-green-50">Aprovado</Badge>;
                  }
                  if (item.rhStatus === "devolvido") {
                    return <Badge className="text-[10px] h-[18px] px-1.5 font-normal bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-50">Devolvido</Badge>;
                  }
                  if (item.rhStatus === "rejeitado") {
                    return <Badge className="text-[10px] h-[18px] px-1.5 font-normal bg-red-50 text-red-600 border border-red-200 hover:bg-red-50">Recusado</Badge>;
                  }
                  return <Badge className="text-[10px] h-[18px] px-1.5 font-normal bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-50">Enviado para revisão</Badge>;
                }
                if (isDuplicated) {
                  return <Badge className="text-[10px] h-[18px] px-1.5 font-normal bg-purple-50 text-purple-600 border border-purple-200 hover:bg-purple-50">Duplicado</Badge>;
                }
                if (hasBeenEdited) {
                  return <Badge className="text-[10px] h-[18px] px-1.5 font-normal bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-50">Salvo {formatDateTime(item.updatedAt!)}</Badge>;
                }
                return <Badge className="text-[10px] h-[18px] px-1.5 font-normal bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-50">Não preenchido</Badge>;
              };

              return (
                <div key={item.id} data-card-id={item.id} className={`bg-white dark:bg-gray-800 rounded-lg border overflow-hidden transition-all duration-500 ${
                  highlightCardId === item.id ? 'ring-2 ring-indigo-400 shadow-lg shadow-indigo-100 dark:shadow-indigo-900/30' :
                  isSelected ? 'ring-1 ring-purple-300 border-purple-200 dark:border-purple-700' : ''
                } ${
                  isCasa ? 'border-l-[3px] border-l-blue-400 border-gray-200 dark:border-gray-700' : 'border-l-[3px] border-l-orange-400 border-gray-200 dark:border-gray-700'
                }`}>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      {isItemLocked ? (
                        <Lock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      ) : isItemEditable ? (
                        <button
                          onClick={() => toggleSelect(item.id)}
                          className="flex-shrink-0"
                        >
                          <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                            isSelected ? 'bg-purple-600 border-purple-600' : 'border-gray-300 dark:border-gray-600 hover:border-purple-400'
                          }`}>
                            {isSelected && (
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </button>
                      ) : null}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                            {getCollaboratorName(item.collaboratorId)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Badge variant="secondary" className="text-[10px] h-[18px] px-1.5 font-medium">
                            {getFunctionName(item.functionId)}
                          </Badge>
                          <Badge className={`text-[10px] h-[18px] px-1.5 font-medium ${
                            isCasa
                              ? 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-50'
                              : 'bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-50'
                          }`}>
                            {isCasa ? 'Casa' : 'Freela'}
                          </Badge>
                          {getStatusBadge()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {isItemEditable ? (
                        <>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                            onClick={() => openEditModal(item)} title="Editar prestação">
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-purple-500 hover:text-purple-700 hover:bg-purple-50"
                            onClick={() => duplicateMutation.mutate(item.id)} title="Duplicar escala"
                            disabled={duplicateMutation.isPending}>
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                            onClick={() => setConfirmDeleteId(item.id)} title="Remover prestação">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      ) : (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                          onClick={() => openEditModal(item)} title="Visualizar prestação">
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-gray-600"
                        onClick={() => toggleCollapse(item.id)} title={isCollapsed ? "Expandir" : "Recolher"}>
                        {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  </div>

                  {!isCollapsed && (() => {
                    const planned = getPlannedRef(item);
                    const plannedAlim = planned ? (planned.weekdayLunch + planned.weekdayDinner + planned.weekendLunch + planned.weekendDinner) : 0;
                    const plannedDiarias = planned ? (planned.totalValue - plannedAlim - planned.mobility) : 0;
                    const diffBadge = (actual: number, plan: number) => {
                      if (!planned) return null;
                      const d = actual - plan;
                      if (d === 0) return null;
                      return <span className={`text-[10px] tabular-nums font-medium ${d < 0 ? 'text-emerald-600' : 'text-red-500'}`}>{d > 0 ? '+' : '-'}{formatCurrency(Math.abs(d))}</span>;
                    };
                    return (
                      <div className="px-4 pb-2 text-sm">
                        <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 gap-y-1 items-center">
                          <Calendar className="w-3 h-3 text-blue-400" />
                          <span className="text-gray-600 dark:text-gray-400">Diárias</span>
                          <span className="font-semibold text-gray-700 dark:text-gray-300 text-right tabular-nums">{formatCurrency(cardSubtotalDiarias)}</span>
                          <span className="text-right">{diffBadge(cardSubtotalDiarias, plannedDiarias)}</span>

                          <span />
                          <div className="ml-1 space-y-0.5">
                            {cardDays.weekdays > 0 && (
                              <div className="text-[11px] text-gray-400">
                                {cardDays.weekdays} dias úteis × {formatCurrency(cardValorUtil)}
                              </div>
                            )}
                            {cardDays.weekends > 0 && (
                              <div className="text-[11px] text-gray-400">
                                {cardDays.weekends} fins de semana × {formatCurrency(cardValorFds)}
                              </div>
                            )}
                          </div>
                          <span />
                          <span />

                          <Utensils className="w-3 h-3 text-orange-400" />
                          <span className="text-gray-600 dark:text-gray-400">Alimentação</span>
                          <span className="font-medium text-gray-600 dark:text-gray-400 text-right tabular-nums">{formatCurrency(totalAlimentacao)}</span>
                          <span className="text-right">{diffBadge(totalAlimentacao, plannedAlim)}</span>

                          <Car className="w-3 h-3 text-purple-400" />
                          <span className="text-gray-600 dark:text-gray-400">Mobilidade</span>
                          <span className="font-medium text-gray-600 dark:text-gray-400 text-right tabular-nums">{formatCurrency(item.mobility)}</span>
                          <span className="text-right">{diffBadge(item.mobility, planned?.mobility ?? 0)}</span>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="flex justify-between items-center px-4 py-2 border-t border-gray-100 dark:border-gray-700">
                    <span className="text-gray-400 text-[10px] uppercase tracking-wider font-medium">Total</span>
                    <span className="font-bold text-base text-purple-700 dark:text-purple-300 tabular-nums">{formatCurrency(item.totalValue)}</span>
                  </div>

                  {(() => {
                    const planned = getPlannedRef(item);
                    if (!planned) return null;
                    const diff = item.totalValue - planned.totalValue;
                    return (
                      <div className="px-4 py-2 border-t border-dashed border-gray-100 dark:border-gray-700 flex items-center justify-between text-[11px]">
                        <span className="text-gray-400">Planejado: <span className="tabular-nums font-medium text-gray-500">{formatCurrency(planned.totalValue)}</span></span>
                        {diff === 0 ? (
                          <span className="text-gray-400">Sem diferença</span>
                        ) : (
                          <span className={`tabular-nums font-medium ${diff < 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {diff > 0 ? '+' : '-'} {formatCurrency(Math.abs(diff))}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </>
      )}

      {selectedEventId && filteredItems.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700 px-6 py-2.5 z-40">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-[10px] uppercase text-gray-400 font-medium tracking-wider">Total Realizado</div>
                <div className="text-lg font-bold text-purple-700 dark:text-purple-300 tabular-nums">{formatCurrency(totalRealizado)}</div>
              </div>
              <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />
              <div className="text-[11px] text-gray-400">
                {filteredItems.length} {filteredItems.length === 1 ? 'prestação' : 'prestações'}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {allSentForReview ? (
                <div className="text-[11px] text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Enviado para revisão
                </div>
              ) : selectedCards.size > 0 ? (
                <>
                  <div className="text-[11px] text-gray-500">
                    {selectedCards.size} {selectedCards.size === 1 ? 'prestação selecionada' : 'prestações selecionadas'}
                  </div>
                  <Button
                    size="sm"
                    className="h-8 px-4 text-xs bg-emerald-600 hover:bg-emerald-700"
                    disabled={sendForReviewMutation.isPending}
                    onClick={() => {
                      if (!selectedEventId) return;
                      sendForReviewMutation.mutate({ eventId: selectedEventId, itemIds: Array.from(selectedCards) });
                      setSelectedCards(new Set());
                    }}
                  >
                    <Send className="w-3 h-3 mr-1.5" />
                    Enviar selecionadas
                  </Button>
                </>
              ) : (
                <>
                  <div className="text-[11px] text-gray-400">
                    Selecione execuções ou envie todas para revisão
                  </div>
                  <Button
                    size="sm"
                    className="h-8 px-4 text-xs bg-emerald-600 hover:bg-emerald-700"
                    disabled={sendForReviewMutation.isPending}
                    onClick={() => {
                      if (!selectedEventId) return;
                      sendForReviewMutation.mutate({ eventId: selectedEventId });
                    }}
                  >
                    <Send className="w-3 h-3 mr-1.5" />
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
            const modalTotalRaw = subtotalDiariasRaw + editFormData.mobility + editFormData.weekdayLunch + editFormData.weekdayDinner +
              editFormData.weekendLunch + editFormData.weekendDinner;
            const modalTotal = Math.abs(modalTotalRaw - editingItem.totalValue) <= 1 ? editingItem.totalValue : modalTotalRaw;
            const subtotalDiarias = modalTotal - editFormData.mobility - editFormData.weekdayLunch - editFormData.weekdayDinner -
              editFormData.weekendLunch - editFormData.weekendDinner;
            const totalAlimentacao = editFormData.weekdayLunch + editFormData.weekdayDinner + editFormData.weekendLunch + editFormData.weekendDinner;
            const isFromPlanned = !!editingItem.plannedId || editingItem.observations?.includes('Enviado do planejado');
            const planned = getPlannedRef(editingItem);
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
                <div className="bg-white dark:bg-gray-800 px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 truncate">{getCollaboratorName(editingItem.collaboratorId)}</h2>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <Badge variant="secondary" className="text-[10px] h-[18px] px-1.5">{getFunctionName(editingItem.functionId)}</Badge>
                        <Badge className={`text-[10px] h-[18px] px-1.5 ${editingItem.collaboratorType === 'casa' ? 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-50' : 'bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-50'}`}>
                          {editingItem.collaboratorType === 'casa' ? 'Casa' : 'Freela'}
                        </Badge>
                      </div>
                    </div>
                    {planned && (
                      <div className="flex flex-col items-end gap-1.5 mr-6">
                        <span className="text-[10px] text-gray-400">Realizado com base no planejado</span>
                        {statusBadge && (
                          <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium ${statusBadge.bg} ${statusBadge.text} border ${statusBadge.border}`}>
                            {statusBadge.icon}
                            {statusBadge.label}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2">
                    {isReadOnly ? 'Visualização dos valores enviados. Não é possível editar.' : 'Informe os valores realmente executados.'}
                  </p>
                  {rhComment && (
                    <div className="mt-2.5 p-2.5 rounded-md bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-orange-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <span className="text-[9px] uppercase text-orange-500 font-semibold tracking-wider">Comentário do RH</span>
                          <p className="text-[11px] text-orange-700 dark:text-orange-300 mt-0.5">{rhComment}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="max-h-[56vh] overflow-y-auto px-6 py-5 space-y-4 bg-gray-50/80 dark:bg-gray-900">

                  {(itemDays.startDate || itemDays.endDate) && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-[11px] text-gray-500">
                          {itemDays.startDate && itemDays.endDate ? `${fmt(itemDays.startDate)} a ${fmt(itemDays.endDate)}` :
                           itemDays.startDate ? `Início: ${fmt(itemDays.startDate)}` : `Fim: ${fmt(itemDays.endDate!)}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-gray-400">
                        {itemDays.weekdays > 0 && <span>{itemDays.weekdays} {itemDays.weekdays === 1 ? 'dia útil' : 'dias úteis'}</span>}
                        {itemDays.weekends > 0 && <span>{itemDays.weekends} {itemDays.weekends === 1 ? 'fim de semana' : 'fins de semana'}</span>}
                        <span className="font-medium text-gray-500">{itemDays.weekdays + itemDays.weekends} dias</span>
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
                          <span className="text-sm font-bold text-gray-700 dark:text-gray-300 tabular-nums">{formatCurrency(subtotalDiariasFds)}</span>
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
                      </div>
                      <span className="text-sm font-bold text-purple-700 dark:text-purple-300 tabular-nums">{formatCurrency(editFormData.mobility)}</span>
                    </div>
                    <div className="p-4 space-y-3">
                      {planned && (() => {
                        const diffMob = editFormData.mobility - planned.mobility;
                        const pctMob = planned.mobility > 0 ? (diffMob / planned.mobility * 100) : 0;
                        const totalDays = itemDays.weekdays + itemDays.weekends;
                        const plannedDays = planned.dailyQuantity || totalDays;
                        return (
                          <div className="rounded-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
                            <div className="grid grid-cols-2 divide-x divide-gray-100 dark:divide-gray-700">
                              <div className="px-3 py-2 bg-gray-50/50 dark:bg-gray-800">
                                <div className="text-[9px] uppercase text-gray-400 font-semibold tracking-wider mb-1">Planejado</div>
                                <div className="text-xs font-bold text-gray-600 dark:text-gray-300 tabular-nums">{formatCurrency(planned.mobility)}</div>
                                {plannedDays > 0 && (
                                  <div className="text-[10px] text-gray-400 mt-0.5 tabular-nums">{formatCurrency(Math.round(planned.mobility / plannedDays))}/dia</div>
                                )}
                              </div>
                              <div className="px-3 py-2 bg-purple-50/30 dark:bg-purple-950/10">
                                <div className="text-[9px] uppercase text-purple-500 font-semibold tracking-wider mb-1">Realizado</div>
                                <div className="text-xs font-bold text-purple-700 dark:text-purple-300 tabular-nums">{formatCurrency(editFormData.mobility)}</div>
                                {totalDays > 0 && (
                                  <div className="text-[10px] text-purple-400 mt-0.5 tabular-nums">{formatCurrency(Math.round(editFormData.mobility / totalDays))}/dia</div>
                                )}
                              </div>
                            </div>
                            {Math.abs(diffMob) > 1 && (
                              <div className={`px-3 py-1.5 text-center border-t border-gray-100 dark:border-gray-700 ${diffMob < 0 ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : 'bg-red-50/50 dark:bg-red-950/20'}`}>
                                <span className={`text-[11px] font-medium tabular-nums ${diffMob < 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                  {diffMob > 0 ? '+' : '-'}{formatCurrency(Math.abs(diffMob))}
                                  {planned.mobility > 0 && <span className="ml-1 text-[10px]">({diffMob > 0 ? '+' : ''}{pctMob.toFixed(0)}%)</span>}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      <div className="grid grid-cols-2 gap-4">
                        <div className={`${isFieldChanged(editFormData.mobility, planned?.mobility ?? 0) ? 'bg-amber-50/40 dark:bg-amber-950/20 rounded-lg p-2 -m-2 border border-amber-200/60 dark:border-amber-800/40' : ''}`}>
                          <div className="flex items-center gap-1.5 mb-1">
                            <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Total do período (R$)</label>
                            {isFieldChanged(editFormData.mobility, planned?.mobility ?? 0) && (
                              <Badge className="text-[8px] h-[13px] px-1 bg-amber-100 text-amber-600 border-amber-200 hover:bg-amber-100">Alterado</Badge>
                            )}
                          </div>
                          <CurrencyInput
                            className={`h-9 text-sm ${isReadOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                            value={editFormData.mobility}
                            onChange={v => setEditFormData({...editFormData, mobility: v})}
                            disabled={isReadOnly}
                          />
                          {planned && (
                            <span className="text-[9px] text-gray-400 tabular-nums block mt-1">plan: {formatCurrency(planned.mobility)}</span>
                          )}
                        </div>
                        <div>
                          <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1 block">Por dia</label>
                          <div className="h-9 flex items-center px-3 rounded-md bg-gray-50 dark:bg-gray-700/30 border border-gray-100 dark:border-gray-600 text-xs text-gray-400 tabular-nums">
                            {(itemDays.weekdays + itemDays.weekends) > 0 ? formatCurrency(Math.round(editFormData.mobility / (itemDays.weekdays + itemDays.weekends))) : 'R$ 0,00'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-orange-50/60 dark:bg-orange-950/30 border-b border-orange-100 dark:border-orange-900/40">
                      <div className="flex items-center gap-2">
                        <Utensils className="w-3.5 h-3.5 text-orange-500" />
                        <span className="text-[11px] font-bold text-orange-700 dark:text-orange-300 uppercase tracking-wide">Alimentação</span>
                      </div>
                      <span className="text-sm font-bold text-orange-700 dark:text-orange-300 tabular-nums">{formatCurrency(totalAlimentacao)}</span>
                    </div>
                    <div className="p-4 space-y-3">
                      {planned && (() => {
                        const plannedAlim = planned.weekdayLunch + planned.weekdayDinner + planned.weekendLunch + planned.weekendDinner;
                        const diffAlim = totalAlimentacao - plannedAlim;
                        const pctAlim = plannedAlim > 0 ? (diffAlim / plannedAlim * 100) : 0;
                        return (
                          <div className="rounded-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
                            <div className="grid grid-cols-2 divide-x divide-gray-100 dark:divide-gray-700">
                              <div className="px-3 py-2 bg-gray-50/50 dark:bg-gray-800">
                                <div className="text-[9px] uppercase text-gray-400 font-semibold tracking-wider mb-1">Planejado</div>
                                <div className="text-xs font-bold text-gray-600 dark:text-gray-300 tabular-nums">{formatCurrency(plannedAlim)}</div>
                                <div className="text-[10px] text-gray-400 mt-0.5 tabular-nums">
                                  {planned.weekdayLunch + planned.weekdayDinner > 0 && <span>Úteis: {formatCurrency(planned.weekdayLunch + planned.weekdayDinner)}</span>}
                                  {planned.weekdayLunch + planned.weekdayDinner > 0 && planned.weekendLunch + planned.weekendDinner > 0 && <span> + </span>}
                                  {planned.weekendLunch + planned.weekendDinner > 0 && <span>FDS: {formatCurrency(planned.weekendLunch + planned.weekendDinner)}</span>}
                                </div>
                              </div>
                              <div className="px-3 py-2 bg-orange-50/30 dark:bg-orange-950/10">
                                <div className="text-[9px] uppercase text-orange-500 font-semibold tracking-wider mb-1">Realizado</div>
                                <div className="text-xs font-bold text-orange-700 dark:text-orange-300 tabular-nums">{formatCurrency(totalAlimentacao)}</div>
                                <div className="text-[10px] text-orange-400 mt-0.5 tabular-nums">
                                  {editFormData.weekdayLunch + editFormData.weekdayDinner > 0 && <span>Úteis: {formatCurrency(editFormData.weekdayLunch + editFormData.weekdayDinner)}</span>}
                                  {editFormData.weekdayLunch + editFormData.weekdayDinner > 0 && editFormData.weekendLunch + editFormData.weekendDinner > 0 && <span> + </span>}
                                  {editFormData.weekendLunch + editFormData.weekendDinner > 0 && <span>FDS: {formatCurrency(editFormData.weekendLunch + editFormData.weekendDinner)}</span>}
                                </div>
                              </div>
                            </div>
                            {Math.abs(diffAlim) > 1 && (
                              <div className={`px-3 py-1.5 text-center border-t border-gray-100 dark:border-gray-700 ${diffAlim < 0 ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : 'bg-red-50/50 dark:bg-red-950/20'}`}>
                                <span className={`text-[11px] font-medium tabular-nums ${diffAlim < 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                  {diffAlim > 0 ? '+' : '-'}{formatCurrency(Math.abs(diffAlim))}
                                  {plannedAlim > 0 && <span className="ml-1 text-[10px]">({diffAlim > 0 ? '+' : ''}{pctAlim.toFixed(0)}%)</span>}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-blue-50/30 dark:bg-blue-950/10 rounded-lg p-3 border border-blue-100/80 dark:border-blue-900/40">
                          <div className="flex items-center gap-1.5 mb-2.5">
                            <Briefcase className="w-3 h-3 text-blue-400" />
                            <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-300">Dias Úteis</span>
                          </div>
                          <div className="space-y-2.5">
                            <div className={`${isFieldChanged(editFormData.weekdayLunch, planned?.weekdayLunch ?? 0) ? 'bg-amber-50/40 rounded-lg p-1.5 -mx-1.5 border border-amber-200/50' : ''}`}>
                              <div className="flex items-center gap-1 mb-0.5">
                                <Sun className="w-2.5 h-2.5 text-amber-400" />
                                <label className="text-[10px] font-medium text-gray-500">Almoço Total (R$)</label>
                                {isFieldChanged(editFormData.weekdayLunch, planned?.weekdayLunch ?? 0) && (
                                  <Badge className="text-[8px] h-[13px] px-1 bg-amber-100 text-amber-600 border-amber-200 hover:bg-amber-100">Alterado</Badge>
                                )}
                              </div>
                              <CurrencyInput
                                className={`h-8 text-xs ${itemDays.weekdays === 0 || isReadOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                                value={editFormData.weekdayLunch}
                                onChange={v => setEditFormData({...editFormData, weekdayLunch: v})}
                                disabled={itemDays.weekdays === 0 || isReadOnly}
                              />
                              {itemDays.weekdays > 0 && (
                                <div className="text-[9px] text-gray-400 tabular-nums mt-0.5">{itemDays.weekdays} × {formatCurrency(Math.round(editFormData.weekdayLunch / itemDays.weekdays))} = {formatCurrency(editFormData.weekdayLunch)}</div>
                              )}
                              {planned && (
                                <span className="text-[9px] text-gray-400 tabular-nums block mt-1">plan: {formatCurrency(planned.weekdayLunch)}</span>
                              )}
                            </div>
                            <div className={`${isFieldChanged(editFormData.weekdayDinner, planned?.weekdayDinner ?? 0) ? 'bg-amber-50/40 rounded-lg p-1.5 -mx-1.5 border border-amber-200/50' : ''}`}>
                              <div className="flex items-center gap-1 mb-0.5">
                                <Moon className="w-2.5 h-2.5 text-indigo-400" />
                                <label className="text-[10px] font-medium text-gray-500">Jantar Total (R$)</label>
                                {isFieldChanged(editFormData.weekdayDinner, planned?.weekdayDinner ?? 0) && (
                                  <Badge className="text-[8px] h-[13px] px-1 bg-amber-100 text-amber-600 border-amber-200 hover:bg-amber-100">Alterado</Badge>
                                )}
                              </div>
                              <CurrencyInput
                                className={`h-8 text-xs ${itemDays.weekdays === 0 || isReadOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                                value={editFormData.weekdayDinner}
                                onChange={v => setEditFormData({...editFormData, weekdayDinner: v})}
                                disabled={itemDays.weekdays === 0 || isReadOnly}
                              />
                              {itemDays.weekdays > 0 && (
                                <div className="text-[9px] text-gray-400 tabular-nums mt-0.5">{itemDays.weekdays} × {formatCurrency(Math.round(editFormData.weekdayDinner / itemDays.weekdays))} = {formatCurrency(editFormData.weekdayDinner)}</div>
                              )}
                              {planned && (
                                <span className="text-[9px] text-gray-400 tabular-nums block mt-1">plan: {formatCurrency(planned.weekdayDinner)}</span>
                              )}
                            </div>
                          </div>
                          <div className="mt-2 pt-1.5 border-t border-blue-100/60 dark:border-blue-800/40 flex items-center justify-between">
                            <span className="text-[9px] text-blue-400 font-medium uppercase tracking-wider">Subtotal</span>
                            <span className="text-[11px] font-bold text-blue-600 dark:text-blue-300 tabular-nums">{formatCurrency(editFormData.weekdayLunch + editFormData.weekdayDinner)}</span>
                          </div>
                        </div>

                        <div className="bg-amber-50/30 dark:bg-amber-950/10 rounded-lg p-3 border border-amber-100/80 dark:border-amber-900/40">
                          <div className="flex items-center gap-1.5 mb-2.5">
                            <Sun className="w-3 h-3 text-amber-400" />
                            <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-300">Fins de Semana</span>
                          </div>
                          <div className="space-y-2.5">
                            <div className={`${isFieldChanged(editFormData.weekendLunch, planned?.weekendLunch ?? 0) ? 'bg-amber-50/40 rounded-lg p-1.5 -mx-1.5 border border-amber-200/50' : ''}`}>
                              <div className="flex items-center gap-1 mb-0.5">
                                <Sun className="w-2.5 h-2.5 text-amber-400" />
                                <label className="text-[10px] font-medium text-gray-500">Almoço Total (R$)</label>
                                {isFieldChanged(editFormData.weekendLunch, planned?.weekendLunch ?? 0) && (
                                  <Badge className="text-[8px] h-[13px] px-1 bg-amber-100 text-amber-600 border-amber-200 hover:bg-amber-100">Alterado</Badge>
                                )}
                              </div>
                              <CurrencyInput
                                className={`h-8 text-xs ${itemDays.weekends === 0 || isReadOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                                value={editFormData.weekendLunch}
                                onChange={v => setEditFormData({...editFormData, weekendLunch: v})}
                                disabled={itemDays.weekends === 0 || isReadOnly}
                              />
                              {itemDays.weekends > 0 && (
                                <div className="text-[9px] text-gray-400 tabular-nums mt-0.5">{itemDays.weekends} × {formatCurrency(Math.round(editFormData.weekendLunch / itemDays.weekends))} = {formatCurrency(editFormData.weekendLunch)}</div>
                              )}
                              {planned && (
                                <span className="text-[9px] text-gray-400 tabular-nums block mt-1">plan: {formatCurrency(planned.weekendLunch)}</span>
                              )}
                            </div>
                            <div className={`${isFieldChanged(editFormData.weekendDinner, planned?.weekendDinner ?? 0) ? 'bg-amber-50/40 rounded-lg p-1.5 -mx-1.5 border border-amber-200/50' : ''}`}>
                              <div className="flex items-center gap-1 mb-0.5">
                                <Moon className="w-2.5 h-2.5 text-indigo-400" />
                                <label className="text-[10px] font-medium text-gray-500">Jantar Total (R$)</label>
                                {isFieldChanged(editFormData.weekendDinner, planned?.weekendDinner ?? 0) && (
                                  <Badge className="text-[8px] h-[13px] px-1 bg-amber-100 text-amber-600 border-amber-200 hover:bg-amber-100">Alterado</Badge>
                                )}
                              </div>
                              <CurrencyInput
                                className={`h-8 text-xs ${itemDays.weekends === 0 || isReadOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                                value={editFormData.weekendDinner}
                                onChange={v => setEditFormData({...editFormData, weekendDinner: v})}
                                disabled={itemDays.weekends === 0 || isReadOnly}
                              />
                              {itemDays.weekends > 0 && (
                                <div className="text-[9px] text-gray-400 tabular-nums mt-0.5">{itemDays.weekends} × {formatCurrency(Math.round(editFormData.weekendDinner / itemDays.weekends))} = {formatCurrency(editFormData.weekendDinner)}</div>
                              )}
                              {planned && (
                                <span className="text-[9px] text-gray-400 tabular-nums block mt-1">plan: {formatCurrency(planned.weekendDinner)}</span>
                              )}
                            </div>
                          </div>
                          <div className="mt-2 pt-1.5 border-t border-amber-100/60 dark:border-amber-800/40 flex items-center justify-between">
                            <span className="text-[9px] text-amber-500 font-medium uppercase tracking-wider">Subtotal</span>
                            <span className="text-[11px] font-bold text-amber-600 dark:text-amber-300 tabular-nums">{formatCurrency(editFormData.weekendLunch + editFormData.weekendDinner)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-3.5 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                  {planned && Math.abs(difference) > 1 && (
                    <div className={`rounded-lg p-2.5 mb-3 flex items-center justify-center gap-2 ${difference < 0 ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800'}`}>
                      {difference < 0 ? (
                        <TrendingDown className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      ) : (
                        <TrendingUp className="w-4 h-4 text-red-500 flex-shrink-0" />
                      )}
                      <span className={`text-sm font-bold tabular-nums ${difference < 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                        {difference > 0 ? '+' : '-'}{formatCurrency(Math.abs(difference))}
                      </span>
                      {plannedTotal > 0 && (
                        <span className={`text-[10px] tabular-nums ${difference < 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                          ({difference > 0 ? '+' : ''}{pctChange.toFixed(1)}%)
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      {planned ? (
                        <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                          <div className="grid grid-cols-2 divide-x divide-gray-200 dark:divide-gray-700">
                            <div className="px-3 py-2.5 text-center">
                              <div className="text-[9px] uppercase text-gray-400 font-semibold tracking-wider mb-0.5">Planejado</div>
                              <div className="text-base font-bold text-gray-600 dark:text-gray-300 tabular-nums">{formatCurrency(plannedTotal)}</div>
                            </div>
                            <div className="px-3 py-2.5 text-center">
                              <div className="text-[9px] uppercase text-purple-500 font-semibold tracking-wider mb-0.5">Realizado</div>
                              <div className="text-base font-bold text-purple-700 dark:text-purple-300 tabular-nums">{formatCurrency(modalTotal)}</div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="text-[10px] uppercase text-gray-400 font-medium tracking-wider mb-0.5">Total da prestação</div>
                          <div className="text-2xl font-bold text-purple-700 dark:text-purple-300 tabular-nums">{formatCurrency(modalTotal)}</div>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2.5">
                      {isReadOnly ? (
                        <Button variant="outline" className="h-9 px-5 text-sm" onClick={() => { setEditingItem(null); setEditFormData(null); }}>Fechar</Button>
                      ) : (
                        <>
                          <Button variant="outline" className="h-9 px-4 text-sm" onClick={() => { setEditingItem(null); setEditFormData(null); }}>Cancelar</Button>
                          <Button onClick={saveEdit} disabled={updateMutation.isPending} className="h-9 px-5 text-sm bg-purple-600 hover:bg-purple-700">
                            {updateMutation.isPending ? 'Salvando...' : 'Salvar Prestação'}
                          </Button>
                        </>
                      )}
                    </div>
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
    </div>
  );
}
