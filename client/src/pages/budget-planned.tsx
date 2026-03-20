import { useState, useMemo, useEffect, useRef } from "react";
import { formatDias, formatDiarias, formatDiasUteis, formatFds, fixEncoding } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Calculator, Users, Calendar, RefreshCw, Edit, Send, CheckCheck, Car, Utensils, Coffee, Moon, Sun, Search, ArrowUpDown, Home, UserCheck, TrendingUp, DollarSign, Briefcase, ChevronDown, ChevronUp, BarChart3, RotateCcw, Lock, UserX, Undo2 } from "lucide-react";
import { isRhOrAdmin } from "@/lib/permissions";
import { Textarea } from "@/components/ui/textarea";
import { EventSearchSelect } from "@/components/event-select";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Event, Function, Collaborator, TeamInclusion, FunctionValue } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useSearch } from "wouter";

interface BudgetEdit {
  inclusionId: string;
  qtdDiarias: number;
  valorDiaria: number;
  valorDiariaUtil: number;
  valorDiariaFds: number;
  mobilidade: number;
  mobilidadeIda: number;
  mobilidadeVolta: number;
  almocoSemana: number;
  jantarSemana: number;
  almocoFds: number;
  jantarFds: number;
}

interface CalculatedBudget {
  inclusion: TeamInclusion;
  collaborator?: Collaborator;
  functionValue?: FunctionValue | null;
  qtdDiarias: number;
  valorDiaria: number;
  valorDiariaUtil: number;
  valorDiariaFds: number;
  subtotalDiarias: number;
  subtotalDiariasUtil: number;
  subtotalDiariasFds: number;
  mobilidade: number;
  mobilidadeIda: number;
  mobilidadeVolta: number;
  almocoSemana: number;
  jantarSemana: number;
  almocoFds: number;
  jantarFds: number;
  unitAlmocoSemana: number;
  unitJantarSemana: number;
  unitAlmocoFds: number;
  unitJantarFds: number;
  ajudaCusto: number;
  totalFinal: number;
  weekdays: number;
  weekends: number;
  hasOverride: boolean;
}

const CARD_BORDER_COLORS = {
  default: "border-l-4 border-l-blue-500",
  selected: "border-l-4 border-l-green-500",
  sent: "border-l-4 border-l-green-500",
};

export default function BudgetPlannedPage() {
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
  const [editingBudget, setEditingBudget] = useState<BudgetEdit | null>(null);
  const [editingBudgetInfo, setEditingBudgetInfo] = useState<{ name: string; functionName: string; type: string; weekdays: number; weekends: number; period: string } | null>(null);
  const [budgetOverrides, setBudgetOverrides] = useState<Record<string, BudgetEdit>>({});
  const [sentToActual, setSentToActual] = useState<Set<string>>(new Set());
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [confirmSendSingle, setConfirmSendSingle] = useState<CalculatedBudget | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterFunction, setFilterFunction] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("name_asc");
  const [collapsedCards, setCollapsedCards] = useState<Set<string>>(new Set());
  const [notAttendedModal, setNotAttendedModal] = useState<{ id?: string; budget?: any; name: string; functionName: string } | null>(null);
  const [notAttendedReason, setNotAttendedReason] = useState("");
  const [restoreModal, setRestoreModal] = useState<{ id: string; name: string; functionName: string } | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();

  const canEdit = user?.role === "admin" || user?.role === "production";
  const canMarkNotAttended = isRhOrAdmin(user);

  const toggleCardSelection = (id: string) => {
    setSelectedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const selectAllCards = () => {
    const pending = calculatedBudgets.filter(b => {
      if (sentToActual.has(b.inclusion.id)) return false;
      const plan = allBudgetPlanned?.find((p: any) => p.collaboratorId === b.inclusion.collaboratorId && p.functionId === b.inclusion.functionId);
      if ((plan as any)?.didNotAttend) return false;
      return true;
    });
    setSelectedCards(new Set(pending.map(b => b.inclusion.id)));
  };

  const clearSelection = () => {
    setSelectedCards(new Set());
  };

  const toggleCollapse = (id: string) => {
    setCollapsedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  const { data: events } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: functions } = useQuery<Function[]>({ queryKey: ["/api/functions"] });
  const { data: collaborators } = useQuery<Collaborator[]>({ queryKey: ["/api/collaborators"] });
  const { data: functionValues, isLoading: isLoadingFunctionValues } = useQuery<FunctionValue[]>({ queryKey: ["/api/function-values"] });
  const { data: systemSettings } = useQuery<Record<string, number>>({
    queryKey: ["/api/system-settings"],
    queryFn: async () => {
      const res = await fetch("/api/system-settings", { credentials: "include" });
      return res.json();
    },
  });

  const { data: existingActuals } = useQuery<any[]>({
    queryKey: ["/api/budget-actual", selectedEventId],
    queryFn: async () => {
      const res = await fetch(`/api/budget-actual?eventId=${selectedEventId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch budget actual");
      return res.json();
    },
    enabled: !!selectedEventId,
  });

  const { data: allBudgetPlanned } = useQuery<any[]>({
    queryKey: ["/api/budget-planned", selectedEventId],
    queryFn: async () => {
      const res = await fetch(`/api/budget-planned?eventId=${selectedEventId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch budget planned");
      return res.json();
    },
    enabled: !!selectedEventId,
  });

  const toggleNotAttendedMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/budget-planned/${id}/toggle-not-attended`, { reason });
      return res.json();
    },
    onSuccess: (data: any, { id }) => {
      qc.invalidateQueries({ queryKey: ["/api/budget-planned", selectedEventId] });
      qc.invalidateQueries({ queryKey: ["/api/budget-comparison"] });
      setNotAttendedModal(null);
      setNotAttendedReason("");
      if (data.didNotAttend) {
        // Remove de seleção se estava selecionado
        const budget = calculatedBudgets.find(b => allBudgetPlanned?.find((p: any) => p.id === id && p.collaboratorId === b.inclusion.collaboratorId && p.functionId === b.inclusion.functionId));
        if (budget) setSelectedCards(prev => { const s = new Set(Array.from(prev)); s.delete(budget.inclusion.id); return s; });
        toast({ title: "Colaborador marcado como não participou", className: "bg-gray-50 border-gray-200 text-gray-800" });
      } else {
        toast({ title: "Participação restaurada", className: "bg-emerald-50 border-emerald-200 text-emerald-800" });
      }
    },
    onError: () => toast({ title: "Erro ao atualizar participação", variant: "destructive" }),
  });

  const createAndMarkNotAttendedMutation = useMutation({
    mutationFn: async ({ budget, reason }: { budget: any; reason: string }) => {
      const weightedDailyValue = budget.qtdDiarias > 0
        ? Math.round(budget.subtotalDiarias / budget.qtdDiarias)
        : budget.valorDiariaUtil;
      const plannedData = {
        eventId: budget.inclusion.eventId,
        collaboratorId: budget.inclusion.collaboratorId,
        functionId: budget.inclusion.functionId,
        collaboratorType: budget.collaborator?.type || "freela",
        dailyQuantity: budget.qtdDiarias,
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
        createdBy: user?.id,
      };
      const res = await apiRequest("POST", "/api/budget-planned", plannedData);
      const created = await res.json();
      const toggleRes = await apiRequest("POST", `/api/budget-planned/${created.id}/toggle-not-attended`, { reason });
      return toggleRes.json();
    },
    onSuccess: (_, { budget }) => {
      qc.invalidateQueries({ queryKey: ["/api/budget-planned", selectedEventId] });
      setNotAttendedModal(null);
      setNotAttendedReason("");
      setSelectedCards(prev => { const s = new Set(Array.from(prev)); s.delete(budget.inclusion.id); return s; });
      toast({ title: "Colaborador marcado como não participou", className: "bg-gray-50 border-gray-200 text-gray-800" });
    },
    onError: () => toast({ title: "Erro ao marcar como não participou", variant: "destructive" }),
  });

  const { data: allTeamInclusions } = useQuery<TeamInclusion[]>({
    queryKey: ["/api/team-inclusions"],
    queryFn: async () => {
      const res = await fetch("/api/team-inclusions", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch team inclusions");
      return res.json();
    },
  });

  const eventsWithInclusions = useMemo(() => {
    if (!events || !allTeamInclusions) return undefined;
    const eventIdsWithInclusions = new Set(allTeamInclusions.map(ti => ti.eventId));
    return events.filter(e => eventIdsWithInclusions.has(e.id));
  }, [events, allTeamInclusions]);

  const { data: teamInclusions, isLoading: isLoadingInclusions } = useQuery<TeamInclusion[]>({
    queryKey: ["/api/team-inclusions", selectedEventId],
    queryFn: async () => {
      const url = selectedEventId ? `/api/team-inclusions?eventId=${selectedEventId}` : "/api/team-inclusions";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch team inclusions");
      return res.json();
    },
    enabled: !!selectedEventId,
  });

  // Gerar valores padrão automaticamente se não existirem
  useEffect(() => {
    if (functionValues && functionValues.length === 0 && functions && functions.length > 0) {
      apiRequest("POST", "/api/function-values/generate-defaults", {})
        .then(() => qc.invalidateQueries({ queryKey: ["/api/function-values"] }))
        .catch(() => {});
    }
  }, [functionValues, functions, qc]);

  const didScrollToCard = useRef(false);
  useEffect(() => {
    if (didScrollToCard.current || !teamInclusions || !urlCollaboratorId || !urlFunctionId) return;
    const target = teamInclusions.find(
      ti => ti.collaboratorId === urlCollaboratorId && ti.functionId === urlFunctionId && !ti.deletedAt
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
  }, [teamInclusions, urlCollaboratorId, urlFunctionId]);

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

  const getFunctionValue = (functionId: string | null) => {
    if (!functionId) return null;
    return functionValues?.find(fv => fv.functionId === functionId);
  };

  const selectedEvent = events?.find(e => e.id === selectedEventId);

  function formatEventDate(dateStr: string | null | undefined): string {
    if (!dateStr) return "";
    const months = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    const [year, month, day] = dateStr.split("-");
    return `${parseInt(day)} de ${months[parseInt(month) - 1]} de ${year}`;
  }

  const countWeekdaysAndWeekends = (startDate: string | null, qtdDiarias: number): { weekdays: number; weekends: number } => {
    if (!startDate || qtdDiarias <= 0) return { weekdays: 0, weekends: 0 };
    const start = new Date(startDate + 'T00:00:00');
    if (isNaN(start.getTime())) return { weekdays: 0, weekends: 0 };

    let weekdays = 0;
    let weekends = 0;
    const current = new Date(start);
    let daysLeft = qtdDiarias;

    while (daysLeft > 0) {
      const day = current.getDay();
      if (day === 0 || day === 6) {
        weekends++;
      } else {
        weekdays++;
      }
      current.setDate(current.getDate() + 1);
      daysLeft--;
    }

    return { weekdays, weekends };
  };

  // Filtrar apenas escalações CONFIRMADAS
  const confirmedInclusions = useMemo(() => {
    if (!teamInclusions) return [];
    return teamInclusions.filter(inc => 
      inc.status === "confirmado" || 
      inc.status === "escalacao" || 
      inc.status === "passagem" ||
      inc.status === "passagem_comprada" ||
      inc.status === "hospedagem" ||
      inc.status === "hospedagem_comprada" ||
      inc.status === "hospedagem_passagem_comprada" ||
      inc.status === "aprovado"
    );
  }, [teamInclusions]);

  useEffect(() => {
    if (existingActuals && confirmedInclusions) {
      const sentIds = new Set<string>();
      confirmedInclusions.forEach(inc => {
        const hasActual = existingActuals.some(a =>
          a.collaboratorId === inc.collaboratorId && a.functionId === inc.functionId
        );
        if (hasActual) sentIds.add(inc.id);
      });
      setSentToActual(sentIds);
    }
  }, [existingActuals, confirmedInclusions]);

  // Calcular orçamento automaticamente baseado nas escalações confirmadas
  const calculatedBudgets = useMemo(() => {
    if (!confirmedInclusions || !functionValues) return [];
    
    return confirmedInclusions.map(inclusion => {
      const fv = getFunctionValue(inclusion.functionId);
      const collab = collaborators?.find(c => c.id === inclusion.collaboratorId);
      const override = budgetOverrides[inclusion.id];
      
      // Calcular dias reais a partir do intervalo de datas (igual ao que a escalação mostra)
      let weekdays = 0;
      let weekends = 0;
      let qtdDiarias: number;

      if (inclusion.scheduleStartDate && inclusion.scheduleEndDate) {
        // Usar intervalo completo start→end: mesma lógica que o "Período de Trabalho" na escalação
        const startD = new Date(inclusion.scheduleStartDate + 'T12:00:00');
        const endD = new Date(inclusion.scheduleEndDate + 'T12:00:00');
        const cur = new Date(startD);
        while (cur <= endD) {
          const day = cur.getDay();
          if (day === 0 || day === 6) weekends++;
          else weekdays++;
          cur.setDate(cur.getDate() + 1);
        }
        const totalFromRange = weekdays + weekends;
        qtdDiarias = override?.qtdDiarias ?? totalFromRange;
      } else {
        qtdDiarias = override?.qtdDiarias ?? inclusion.dailyRates ?? 0;
        const result = countWeekdaysAndWeekends(inclusion.scheduleStartDate, qtdDiarias);
        weekdays = result.weekdays;
        weekends = result.weekends;
      }

      const defaultDailyValueWeekday = systemSettings?.default_daily_value_weekday ?? systemSettings?.default_daily_value ?? 5000;
      const defaultDailyValueWeekend = systemSettings?.default_daily_value_weekend ?? systemSettings?.default_daily_value ?? 5000;
      const inclusionDailyValue = inclusion.dailyValue ?? defaultDailyValueWeekday;
      const valorDiaria = override?.valorDiaria ?? fv?.dailyValue ?? inclusionDailyValue;
      const valorDiariaUtil = override?.valorDiariaUtil ?? inclusionDailyValue ?? defaultDailyValueWeekday;
      const valorDiariaFds = override?.valorDiariaFds ?? (inclusion.dailyValue ?? defaultDailyValueWeekend);
      
      const subtotalDiariasUtil = weekdays * valorDiariaUtil;
      const subtotalDiariasFds = weekends * valorDiariaFds;
      const subtotalDiarias = subtotalDiariasUtil + subtotalDiariasFds;
      
      const mobilidade = override?.mobilidade ?? fv?.mobility ?? (systemSettings?.default_mobility ?? 2500);
      const mobilidadeIda = override?.mobilidadeIda ?? (fv as any)?.mobilityIda ?? Math.ceil(mobilidade / 2);
      const mobilidadeVolta = override?.mobilidadeVolta ?? (fv as any)?.mobilityVolta ?? Math.floor(mobilidade / 2);
      const unitAlmocoSemana = fv?.weekdayLunch || (systemSettings?.default_weekday_lunch ?? 3500);
      const unitJantarSemana = fv?.weekdayDinner || (systemSettings?.default_weekday_dinner ?? 4000);
      const unitAlmocoFds = fv?.weekendLunch || (systemSettings?.default_weekend_lunch ?? 4000);
      const unitJantarFds = fv?.weekendDinner || (systemSettings?.default_weekend_dinner ?? 4500);
      const almocoSemana = override?.almocoSemana ?? (unitAlmocoSemana * weekdays);
      const jantarSemana = override?.jantarSemana ?? (unitJantarSemana * weekdays);
      const almocoFds = override?.almocoFds ?? (unitAlmocoFds * weekends);
      const jantarFds = override?.jantarFds ?? (unitJantarFds * weekends);
      
      const ajudaCusto = mobilidade + almocoSemana + jantarSemana + almocoFds + jantarFds;
      const totalFinal = subtotalDiarias + ajudaCusto;
      
      return {
        inclusion,
        collaborator: collab,
        functionValue: fv,
        qtdDiarias,
        valorDiaria,
        valorDiariaUtil,
        valorDiariaFds,
        subtotalDiarias,
        subtotalDiariasUtil,
        subtotalDiariasFds,
        mobilidade,
        mobilidadeIda,
        mobilidadeVolta,
        almocoSemana,
        jantarSemana,
        almocoFds,
        jantarFds,
        unitAlmocoSemana,
        unitJantarSemana,
        unitAlmocoFds,
        unitJantarFds,
        ajudaCusto,
        totalFinal,
        weekdays,
        weekends,
        hasOverride: !!override,
      };
    });
  }, [confirmedInclusions, functionValues, collaborators, budgetOverrides, systemSettings]);

  // Set de chaves "collaboratorId|functionId" para cards marcados como "não participou"
  const notAttendedKeys = useMemo(() => {
    const keys = new Set<string>();
    (allBudgetPlanned || []).forEach((p: any) => {
      if (p.didNotAttend) keys.add(`${p.collaboratorId}|${p.functionId}`);
    });
    return keys;
  }, [allBudgetPlanned]);

  const isCardNotAttended = (b: typeof calculatedBudgets[0]) =>
    notAttendedKeys.has(`${b.inclusion.collaboratorId}|${b.inclusion.functionId}`);

  const totalGeral = useMemo(() => {
    return calculatedBudgets
      .filter(b => !notAttendedKeys.has(`${b.inclusion.collaboratorId}|${b.inclusion.functionId}`))
      .reduce((sum, b) => sum + b.totalFinal, 0);
  }, [calculatedBudgets, notAttendedKeys]);

  // Estatísticas de resumo
  const stats = useMemo(() => {
    const activeBudgets = calculatedBudgets.filter(b => !notAttendedKeys.has(`${b.inclusion.collaboratorId}|${b.inclusion.functionId}`));
    const total = activeBudgets.length;
    const isCasa = (type?: string) => type === 'casa' || type === 'local';
    const isFreela = (type?: string) => type === 'freela' || !type;
    const totalCasa = activeBudgets.filter(b => isCasa(b.collaborator?.type)).length;
    const totalFreela = activeBudgets.filter(b => isFreela(b.collaborator?.type)).length;
    const valorCasa = activeBudgets.filter(b => isCasa(b.collaborator?.type)).reduce((sum, b) => sum + b.totalFinal, 0);
    const valorFreela = activeBudgets.filter(b => isFreela(b.collaborator?.type)).reduce((sum, b) => sum + b.totalFinal, 0);
    const media = total > 0 ? totalGeral / total : 0;
    const totalDias = activeBudgets.reduce((sum, b) => sum + b.qtdDiarias, 0);
    const mediaPorDia = totalDias > 0 ? totalGeral / totalDias : 0;
    const enviados = calculatedBudgets.filter(b => sentToActual.has(b.inclusion.id)).length;
    const progressoEnvio = calculatedBudgets.length > 0 ? (enviados / calculatedBudgets.length) * 100 : 0;
    
    return { total, totalCasa, totalFreela, valorCasa, valorFreela, media, mediaPorDia, enviados, progressoEnvio };
  }, [calculatedBudgets, totalGeral, sentToActual, notAttendedKeys]);

  // Funções únicas para filtro
  const uniqueFunctions = useMemo(() => {
    const funcs = new Set<string>();
    calculatedBudgets.forEach(b => {
      if (b.inclusion.functionId) {
        const fname = getFunctionName(b.inclusion.functionId);
        if (fname !== '-') funcs.add(fname);
      }
    });
    return Array.from(funcs).sort();
  }, [calculatedBudgets, functions]);

  // Filtrar e ordenar budgets
  const filteredBudgets = useMemo(() => {
    let result = [...calculatedBudgets];
    
    // Filtro por busca
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(b => 
        getCollaboratorName(b.inclusion.collaboratorId).toLowerCase().includes(term)
      );
    }
    
    // Filtro por função
    if (filterFunction !== 'all') {
      result = result.filter(b => 
        getFunctionName(b.inclusion.functionId) === filterFunction
      );
    }
    
    // Filtro por tipo
    if (filterType !== 'all') {
      result = result.filter(b => 
        (filterType === 'casa' && b.collaborator?.type === 'casa') ||
        (filterType === 'freela' && (b.collaborator?.type === 'freela' || !b.collaborator?.type))
      );
    }
    
    result.sort((a, b) => {
      switch (sortBy) {
        case 'name_asc':
          return getCollaboratorName(a.inclusion.collaboratorId).localeCompare(getCollaboratorName(b.inclusion.collaboratorId));
        case 'name_desc':
          return getCollaboratorName(b.inclusion.collaboratorId).localeCompare(getCollaboratorName(a.inclusion.collaboratorId));
        case 'days_desc':
          return b.qtdDiarias - a.qtdDiarias;
        case 'days_asc':
          return a.qtdDiarias - b.qtdDiarias;
        case 'function':
          return getFunctionName(a.inclusion.functionId).localeCompare(getFunctionName(b.inclusion.functionId));
        default:
          return getCollaboratorName(a.inclusion.collaboratorId).localeCompare(getCollaboratorName(b.inclusion.collaboratorId));
      }
    });
    
    return result;
  }, [calculatedBudgets, searchTerm, filterFunction, filterType, sortBy]);

  // Obter cor da função
  const getCardBorderColor = (inclusionId: string) => {
    if (selectedCards.has(inclusionId) || sentToActual.has(inclusionId)) {
      return CARD_BORDER_COLORS.selected;
    }
    return CARD_BORDER_COLORS.default;
  };


  const [originalModalTotal, setOriginalModalTotal] = useState<number>(0);
  const [defaultBudgetValues, setDefaultBudgetValues] = useState<BudgetEdit | null>(null);

  const openEditModal = (budget: typeof calculatedBudgets[0]) => {
    const startDate = budget.inclusion.scheduleStartDate;
    const endDate = budget.inclusion.scheduleEndDate;
    const formatDate = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '-';
    const period = startDate && endDate ? `${formatDate(startDate)} a ${formatDate(endDate)}` : '-';
    
    setEditingBudgetInfo({
      name: getCollaboratorName(budget.inclusion.collaboratorId),
      functionName: getFunctionName(budget.inclusion.functionId),
      type: budget.collaborator?.type === 'casa' || budget.collaborator?.type === 'local' ? 'Casa' : 'Freela',
      weekdays: budget.weekdays,
      weekends: budget.weekends,
      period,
    });

    const fv = getFunctionValue(budget.inclusion.functionId);
    const inclusionDailyValue = budget.inclusion.dailyValue ?? 5000;
    const defMob = (fv?.mobility ?? 2500) * budget.qtdDiarias;
    const defaultVals: BudgetEdit = {
      inclusionId: budget.inclusion.id,
      qtdDiarias: budget.qtdDiarias,
      valorDiaria: fv?.dailyValue ?? inclusionDailyValue,
      valorDiariaUtil: inclusionDailyValue,
      valorDiariaFds: inclusionDailyValue,
      mobilidade: defMob,
      mobilidadeIda: (fv as any)?.mobilityIda ?? Math.ceil(defMob / 2),
      mobilidadeVolta: (fv as any)?.mobilityVolta ?? Math.floor(defMob / 2),
      almocoSemana: (fv?.weekdayLunch || 3500) * budget.weekdays,
      jantarSemana: (fv?.weekdayDinner || 4000) * budget.weekdays,
      almocoFds: (fv?.weekendLunch || 4000) * budget.weekends,
      jantarFds: (fv?.weekendDinner || 4500) * budget.weekends,
    };
    setDefaultBudgetValues(defaultVals);

    const editVals: BudgetEdit = {
      inclusionId: budget.inclusion.id,
      qtdDiarias: budget.qtdDiarias,
      valorDiaria: budget.valorDiaria,
      valorDiariaUtil: budget.valorDiariaUtil,
      valorDiariaFds: budget.valorDiariaFds,
      mobilidade: budget.mobilidade,
      mobilidadeIda: budget.mobilidadeIda,
      mobilidadeVolta: budget.mobilidadeVolta,
      almocoSemana: budget.almocoSemana,
      jantarSemana: budget.jantarSemana,
      almocoFds: budget.almocoFds,
      jantarFds: budget.jantarFds,
    };
    setEditingBudget(editVals);
    setOriginalModalTotal(budget.totalFinal);
  };

  const saveEdit = () => {
    if (!editingBudget) return;
    setBudgetOverrides(prev => ({
      ...prev,
      [editingBudget.inclusionId]: editingBudget,
    }));
    setEditingBudget(null);
    toast({ title: "Sucesso", description: "Valores atualizados" });
  };

  const savePlannedAndSendToActual = async (budget: typeof calculatedBudgets[0], obsLabel: string) => {
    const weightedDailyValue = budget.qtdDiarias > 0 
      ? Math.round(budget.subtotalDiarias / budget.qtdDiarias) 
      : budget.valorDiariaUtil;
    const plannedData = {
      eventId: budget.inclusion.eventId,
      collaboratorId: budget.inclusion.collaboratorId,
      functionId: budget.inclusion.functionId,
      collaboratorType: budget.collaborator?.type || "freela",
      dailyQuantity: budget.qtdDiarias,
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
      createdBy: user?.id,
    };

    // Reutiliza registro planejado já existente (ex: marcado como "não participou" antes de enviar)
    const existingPlan = allBudgetPlanned?.find(
      (p: any) => p.collaboratorId === budget.inclusion.collaboratorId && p.functionId === budget.inclusion.functionId
    );

    let savedPlanned: any;
    if (existingPlan) {
      const patchRes = await apiRequest("PATCH", `/api/budget-planned/${existingPlan.id}`, {
        ...plannedData,
        didNotAttend: (existingPlan as any).didNotAttend,
        didNotAttendReason: (existingPlan as any).didNotAttendReason,
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

  const sendToActualMutation = useMutation({
    mutationFn: async (budget: typeof calculatedBudgets[0]) => {
      return savePlannedAndSendToActual(budget, "Enviado do planejado");
    },
    onSuccess: (data) => {
      setSentToActual(prev => { const s = new Set(Array.from(prev)); s.add(data.id); return s; });
      toast({ title: "Sucesso", description: "Enviado para o Realizado" });
      qc.invalidateQueries({ queryKey: ["/api/budget-actual"] });
      qc.invalidateQueries({ queryKey: ["/api/budget-planned"] });
    },
    onError: () => {
      toast({ title: "Erro", description: "Erro ao enviar para o Realizado", variant: "destructive" });
    },
  });

  const sendSelectedToActualMutation = useMutation({
    mutationFn: async () => {
      const toSend = calculatedBudgets.filter(b => 
        selectedCards.has(b.inclusion.id) && !sentToActual.has(b.inclusion.id)
      );
      const results = [];
      for (const budget of toSend) {
        const result = await savePlannedAndSendToActual(budget, "Enviado do planejado (lote)");
        results.push(result);
      }
      return results;
    },
    onSuccess: (data) => {
      setSentToActual(prev => { const s = new Set(Array.from(prev)); data.forEach(d => s.add(d.id)); return s; });
      setSelectedCards(new Set());
      toast({ title: "Sucesso", description: `${data.length} itens enviados para o Realizado` });
      qc.invalidateQueries({ queryKey: ["/api/budget-actual"] });
      qc.invalidateQueries({ queryKey: ["/api/budget-planned"] });
    },
    onError: () => {
      toast({ title: "Erro", description: "Erro ao enviar para o Realizado", variant: "destructive" });
    },
  });

  const pendingCount = calculatedBudgets.filter(b => !sentToActual.has(b.inclusion.id) && !notAttendedKeys.has(`${b.inclusion.collaboratorId}|${b.inclusion.functionId}`)).length;

  // Avatar color based on first letter
  const avatarColor = (name: string) => {
    const colors = [
      "bg-indigo-500","bg-violet-500","bg-emerald-500","bg-amber-500",
      "bg-rose-500","bg-sky-500","bg-teal-500","bg-orange-500",
    ];
    return colors[(name.charCodeAt(0) || 0) % colors.length];
  };

  return (
    <div className="space-y-5 max-w-5xl mx-auto pb-24">

      {/* ── Cabeçalho ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[10px] bg-[#0033CC] flex items-center justify-center shrink-0" style={{boxShadow:'0 4px 14px #0033CC50'}}>
            <Calculator className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-[18px] font-bold text-gray-900">Orçamento Planejado</h1>
            <p className="text-xs text-gray-400">Cálculo automático das escalações confirmadas</p>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <EventSearchSelect value={selectedEventId} onValueChange={setSelectedEventId} events={eventsWithInclusions} />
          {selectedEvent?.startDate && (
            <span style={{ fontSize: 11, color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Calendar className="w-3 h-3" style={{ color: '#94A3B8' }} />
              {formatEventDate(selectedEvent.startDate)}
            </span>
          )}
        </div>
      </div>

      {/* ── Tela 1: Seleção de evento ── */}
      {!selectedEventId ? (
        <div className="rounded-2xl overflow-hidden border border-blue-100 dark:border-blue-900 shadow-sm">
          <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-violet-50 dark:from-blue-950/40 dark:via-indigo-950/30 dark:to-violet-950/20 px-8 py-16 text-center">
            {/* Ilustração */}
            <div className="relative w-24 h-24 mx-auto mb-6">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-400 to-indigo-600 rounded-2xl shadow-lg shadow-indigo-200 dark:shadow-indigo-900/40 flex items-center justify-center rotate-3">
                <Calculator className="w-10 h-10 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-emerald-400 rounded-xl flex items-center justify-center shadow-md">
                <DollarSign className="w-4 h-4 text-white" />
              </div>
            </div>

            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Selecione um evento</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto mb-8">
              Visualize o orçamento previsto com base nas escalações confirmadas. Valores calculados automaticamente.
            </p>

            <div className="max-w-sm mx-auto">
              <EventSearchSelect value={selectedEventId} onValueChange={setSelectedEventId} events={eventsWithInclusions} />
            </div>

          </div>
        </div>
      ) : (
          <>
            {/* ── Banner Total Planejado ── */}
            <div className="rounded-xl overflow-hidden shadow-sm flex" style={{border:'1px solid #0033CC30'}}>
              {/* Esquerda — azul sólido */}
              <div className="px-6 py-4 flex flex-col justify-center gap-0.5" style={{background:'linear-gradient(135deg, #0033CC 0%, #0044FF 100%)', minWidth:240}}>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-white">Total Planejado</p>
                {selectedEvent?.startDate && (
                  <p className="flex items-center gap-1 text-[11px] text-white/70">
                    <Calendar className="w-3 h-3 shrink-0" />
                    {formatEventDate(selectedEvent.startDate)}
                  </p>
                )}
                <div className="text-[28px] font-black text-white leading-tight mt-0.5">{formatCurrency(totalGeral)}</div>
              </div>
              {/* Direita — stats em fundo azul muito claro */}
              <div className="flex-1 px-6 py-4 flex items-center gap-6" style={{background:'#F0F4FF'}}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{background:'#0033CC18'}}>
                    <Users className="w-4 h-4" style={{color:'#0033CC'}} />
                  </div>
                  <div>
                    <div className="text-[20px] font-black leading-none" style={{color:'#0033CC'}}>{stats.total}</div>
                    <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mt-0.5">Colaboradores</div>
                  </div>
                </div>
                <div className="w-px h-9" style={{background:'#0033CC20'}} />
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-emerald-100">
                    <Send className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <div className="text-[20px] font-black text-emerald-600 leading-none">{stats.enviados}</div>
                    <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mt-0.5">Enviados</div>
                  </div>
                </div>
                <div className="w-px h-9" style={{background:'#0033CC20'}} />
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{background:'#0033CC18'}}>
                    <TrendingUp className="w-4 h-4" style={{color:'#0033CC'}} />
                  </div>
                  <div>
                    <div className="text-[20px] font-black leading-none" style={{color:'#0033CC'}}>{Math.round(stats.progressoEnvio)}%</div>
                    <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mt-0.5">Progresso</div>
                  </div>
                </div>
                {stats.total > 0 && (
                  <>
                    <div className="w-px h-9" style={{background:'#0033CC20'}} />
                    <div className="flex-1">
                      <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Envio</div>
                      <div className="h-2 rounded-full overflow-hidden" style={{background:'#0033CC20'}}>
                        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{width:`${stats.progressoEnvio}%`}} />
                      </div>
                      <div className="text-[9px] text-slate-400 mt-1">{stats.enviados} de {stats.total} enviados</div>
                    </div>
                  </>
                )}
              </div>
            </div>


            {/* ── Timeline de etapas ── */}
            {(() => {
              const currentStep = 1;
              const steps = [
                { label: "Escalação", desc: "Inclusões confirmadas" },
                { label: "Planejamento RH", desc: "Valores previstos" },
                { label: "Prestação", desc: "Resp. preenche realizado" },
                { label: "Aprovação RH", desc: "Análise e aprovação" },
              ];
              return (
                <div className="bg-white border border-slate-200 rounded-xl px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Etapa atual</span>
                    {selectedCards.size > 0 && (
                      <Button 
                        size="sm"
                        onClick={() => setConfirmSendOpen(true)}
                        disabled={sendSelectedToActualMutation.isPending}
                        className="h-7 text-xs px-3"
                        style={{background:'#0033CC'}}
                      >
                        <Send className="w-3 h-3 mr-1.5" />
                        Enviar {selectedCards.size} selecionados
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center">
                    {steps.map((step, i) => {
                      const isDone = i < currentStep;
                      const isActive = i === currentStep;
                      const isLast = i === steps.length - 1;
                      return (
                        <div key={i} className="flex items-center flex-1">
                          <div className="flex flex-col items-center gap-1.5">
                            <div
                              className={`rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${
                                isDone ? 'w-8 h-8 bg-emerald-500 text-white shadow-md shadow-emerald-200' :
                                isActive ? 'w-9 h-9 text-white' :
                                'w-8 h-8 bg-gray-100 text-gray-300'
                              }`}
                              style={isActive ? { background:'#0033CC', boxShadow: "0 0 0 4px rgba(0,51,204,0.15)" } : undefined}
                            >
                              {isDone ? (
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (i + 1)}
                            </div>
                            <div className="text-center">
                              <div className={`text-[11px] font-semibold leading-tight ${
                                isDone ? 'text-emerald-600' :
                                isActive ? 'text-[#0033CC]' :
                                'text-gray-400'
                              }`}>{step.label}</div>
                              <div className="text-[9px] text-gray-400 mt-0.5 hidden sm:block">{step.desc}</div>
                            </div>
                          </div>
                          {!isLast && (
                            <div className={`flex-1 h-[3px] mx-2 rounded-full mb-5 ${
                              isDone ? 'bg-emerald-300' : 'bg-gray-100'
                            }`} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* ── Cards de métricas ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Casa */}
              <div className="rounded-xl border border-slate-200 shadow-sm overflow-hidden bg-white">
                <div className="h-0.5 bg-blue-500" />
                <div className="px-4 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <Home className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-0.5">Casa</div>
                    <div className="text-[18px] font-black text-slate-800 leading-none truncate">{formatCurrency(stats.valorCasa)}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{stats.totalCasa} colab.</div>
                  </div>
                </div>
              </div>

              {/* Freela */}
              <div className="rounded-xl border border-slate-200 shadow-sm overflow-hidden bg-white">
                <div className="h-0.5 bg-orange-500" />
                <div className="px-4 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                    <UserCheck className="w-4 h-4 text-orange-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-0.5">Freela</div>
                    <div className="text-[18px] font-black text-slate-800 leading-none truncate">{formatCurrency(stats.valorFreela)}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{stats.totalFreela} colab.</div>
                  </div>
                </div>
              </div>

              {/* Custo médio / colaborador */}
              <div className="rounded-xl border border-slate-200 shadow-sm overflow-hidden bg-white">
                <div className="h-0.5 bg-violet-500" />
                <div className="px-4 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4 text-violet-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-0.5">Médio / Pessoa</div>
                    <div className="text-[18px] font-black text-violet-600 leading-none truncate">{formatCurrency(stats.media)}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">por colaborador</div>
                  </div>
                </div>
              </div>

              {/* Custo médio / dia */}
              <div className="rounded-xl border border-slate-200 shadow-sm overflow-hidden bg-white">
                <div className="h-0.5 bg-teal-500" />
                <div className="px-4 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center shrink-0">
                    <BarChart3 className="w-4 h-4 text-teal-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-0.5">Médio / Dia</div>
                    <div className="text-[18px] font-black text-teal-600 leading-none truncate">{formatCurrency(stats.mediaPorDia)}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">por dia trabalhado</div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Filtros e Busca ── */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-[#FAFBFF] flex flex-wrap items-center gap-2.5">
                {pendingCount > 0 && (
                  <Checkbox 
                    checked={selectedCards.size === pendingCount && pendingCount > 0}
                    onCheckedChange={(checked) => checked ? selectAllCards() : clearSelection()}
                    className="shrink-0"
                  />
                )}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar por nome..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-8 pl-8 pr-3 w-44 bg-white border border-gray-200 rounded-lg text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20 transition-all"
                  />
                </div>
                
                <Select value={filterFunction} onValueChange={setFilterFunction}>
                  <SelectTrigger className="w-auto min-w-[150px] h-8 text-xs shrink-0 border border-gray-200 rounded-lg bg-white text-slate-700 focus:ring-1 focus:ring-blue-400/20 focus:border-blue-400">
                    <SelectValue placeholder="Função" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-slate-200 rounded-xl shadow-lg min-w-[180px]">
                    <SelectItem value="all">Todas as funções</SelectItem>
                    {uniqueFunctions.map(f => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-28 h-8 text-xs shrink-0 border border-gray-200 rounded-lg bg-white text-slate-700 focus:ring-1 focus:ring-blue-400/20 focus:border-blue-400">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-slate-200 rounded-xl shadow-lg min-w-[140px]">
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="casa">Casa</SelectItem>
                    <SelectItem value="freela">Freela</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-auto min-w-[130px] h-8 text-xs shrink-0 border border-gray-200 rounded-lg bg-white text-slate-700 focus:ring-1 focus:ring-blue-400/20 focus:border-blue-400">
                    <SelectValue placeholder="Ordenar" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-slate-200 rounded-xl shadow-lg min-w-[160px]">
                    <SelectItem value="name_asc">Nome A-Z</SelectItem>
                    <SelectItem value="name_desc">Nome Z-A</SelectItem>
                    <SelectItem value="days_desc">Mais Dias</SelectItem>
                    <SelectItem value="days_asc">Menos Dias</SelectItem>
                    <SelectItem value="function">Por Função</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex-1" />
                <span className="text-[11px] text-slate-400 font-medium bg-white border border-gray-200 px-2.5 py-1 rounded-lg">
                  {filteredBudgets.length} resultado{filteredBudgets.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* ── Cards de Colaboradores ── */}
            {isLoadingInclusions || isLoadingFunctionValues ? (
              <div className="flex items-center justify-center py-20">
                <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
              </div>
            ) : filteredBudgets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
                <Users className="w-16 h-16 text-gray-200 dark:text-gray-700 mb-4" />
                <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300">
                  {calculatedBudgets.length === 0 ? 'Nenhuma escalação confirmada' : 'Nenhum resultado encontrado'}
                </h3>
                <p className="text-sm text-gray-400 mt-1">
                  {calculatedBudgets.length === 0 ? 'Apenas escalações confirmadas aparecem aqui' : 'Tente ajustar os filtros'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredBudgets.map((budget) => {
                  const isSent = sentToActual.has(budget.inclusion.id);
                  const isSelected = selectedCards.has(budget.inclusion.id);
                  const isCollapsed = collapsedCards.has(budget.inclusion.id);
                  const isCasa = budget.collaborator?.type === 'casa' || budget.collaborator?.type === 'local';
                  const name = getCollaboratorName(budget.inclusion.collaboratorId);
                  const initials = name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase();
                  const planRecord = allBudgetPlanned?.find(
                    p => p.collaboratorId === budget.inclusion.collaboratorId && p.functionId === budget.inclusion.functionId
                  );
                  const isNotAttended = !!planRecord?.didNotAttend;
                  
                  return (
                    <div 
                      key={budget.inclusion.id}
                      data-card-id={budget.inclusion.id}
                      className={`rounded-xl border shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col group ${
                        isNotAttended ? 'bg-slate-50 opacity-75 border-dashed border-slate-300' :
                        highlightCardId === budget.inclusion.id ? 'bg-white ring-2 ring-[#0033CC] shadow-blue-100' :
                        isSelected ? 'bg-white ring-2 ring-emerald-400 border-emerald-200' : 
                        isSent ? 'bg-white border-indigo-200 opacity-85' :
                        budget.hasOverride ? 'bg-white border-amber-200' : 'bg-white border-slate-200'
                      }`}
                    >
                      {/* stripe top */}
                      <div className={`h-[3px] ${isSelected ? 'bg-emerald-400' : isSent ? 'bg-indigo-400' : isNotAttended ? 'bg-slate-300' : 'bg-[#0033CC]'}`} />
                      {/* ── Header do card ── */}
                      <div className={`flex items-center justify-between px-4 py-3 ${
                        isSent ? 'bg-indigo-50/40' : 'bg-slate-50/60'
                      }`}>
                        <div className="flex items-center gap-3">
                          {/* Checkbox / lock */}
                          {!isSent ? (
                            <Checkbox 
                              checked={isSelected}
                              disabled={isNotAttended}
                              onCheckedChange={() => !isNotAttended && toggleCardSelection(budget.inclusion.id)}
                            />
                          ) : (
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Lock className="w-4 h-4 text-indigo-400 shrink-0 cursor-default" />
                                </TooltipTrigger>
                                <TooltipContent side="right" className="text-xs">
                                  Aguardando prestação de contas
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}

                          {/* Avatar */}
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm ${avatarColor(name)}`}>
                            {initials || '?'}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm truncate">
                                {name}
                              </span>
                              {budget.hasOverride && (
                                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Valores personalizados" />
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-medium rounded-md">
                                {getFunctionName(budget.inclusion.functionId)}
                              </Badge>
                              <Badge className={`text-[10px] h-5 px-1.5 font-medium rounded-md ${
                                isCasa 
                                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/50 dark:text-blue-300' 
                                  : 'bg-orange-100 text-orange-700 hover:bg-orange-100 dark:bg-orange-900/50 dark:text-orange-300'
                              }`}>
                                {isCasa ? 'Casa' : 'Freela'}
                              </Badge>
                              {isSent && (
                                <Badge className="text-[10px] h-5 px-1.5 font-medium rounded-md bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600">
                                  No Realizado
                                </Badge>
                              )}
                              {isNotAttended && (
                                <Badge className="text-[10px] h-5 px-1.5 font-medium rounded-md bg-gray-200 text-gray-500 border border-gray-300 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600 flex items-center gap-0.5">
                                  <UserX className="w-2.5 h-2.5" />Não participou
                                </Badge>
                              )}
                            </div>
                            {isNotAttended && planRecord?.didNotAttendReason && (
                              <p className="text-[10px] text-gray-400 italic mt-0.5">{planRecord.didNotAttendReason}</p>
                            )}
                          </div>
                        </div>

                        {/* Ações */}
                        <div className="flex items-center gap-0.5">
                          {/* Não participou — visível para RH/Admin apenas em cards não enviados */}
                          {canMarkNotAttended && !isSent && (
                            isNotAttended ? (
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"
                                      onClick={() => planRecord && setRestoreModal({ id: planRecord.id, name, functionName: getFunctionName(budget.inclusion.functionId) })}
                                      disabled={toggleNotAttendedMutation.isPending}>
                                      <Undo2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="left" className="text-xs">Restaurar participação</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                      onClick={() => setNotAttendedModal({
                                        id: planRecord?.id,
                                        budget: planRecord ? undefined : budget,
                                        name,
                                        functionName: getFunctionName(budget.inclusion.functionId)
                                      })}>
                                      <UserX className="w-3.5 h-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="left" className="text-xs">Marcar como não participou</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )
                          )}
                          <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                          {canEdit && !isSent && !isNotAttended && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg" title="Editar valores" onClick={() => openEditModal(budget)}>
                              <Edit className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {!isSent && !isNotAttended && (
                            <Button 
                              variant="ghost" size="icon" 
                              className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg"
                              title="Enviar para realização"
                              onClick={() => setConfirmSendSingle(budget)}
                            >
                              <Send className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button 
                            variant="ghost" size="icon" 
                            className="h-8 w-8 text-gray-400 hover:text-gray-600 rounded-lg"
                            title={isCollapsed ? "Expandir" : "Recolher"}
                            onClick={() => toggleCollapse(budget.inclusion.id)}
                          >
                            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                          </Button>
                          </div>
                        </div>
                      </div>
                      
                      {/* ── Corpo colapsável ── */}
                      {!isCollapsed && (
                        <div className="px-4 pt-3 pb-2 text-sm flex-1 flex flex-col gap-1">
                          {/* Período */}
                          {budget.inclusion.scheduleStartDate && budget.inclusion.scheduleEndDate && (
                            <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(budget.inclusion.scheduleStartDate + 'T00:00:00').toLocaleDateString('pt-BR')} → {new Date(budget.inclusion.scheduleEndDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                            </div>
                          )}

                          {/* Itens em duas colunas */}
                          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                                <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                                <span className="text-xs">Diárias</span>
                              </div>
                              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{formatCurrency(budget.subtotalDiarias)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                                <Car className="w-3.5 h-3.5 text-violet-400" />
                                <span className="text-xs">Mobilidade</span>
                              </div>
                              <div className="text-right">
                                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{formatCurrency(budget.mobilidade)}</span>
                                {(budget.mobilidadeIda > 0 || budget.mobilidadeVolta > 0) && (
                                  <div className="text-[9px] text-violet-400 tabular-nums">
                                    {formatCurrency(budget.mobilidadeIda)} · {formatCurrency(budget.mobilidadeVolta)}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                                <Utensils className="w-3.5 h-3.5 text-orange-400" />
                                <span className="text-xs">Alimentação</span>
                              </div>
                              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{formatCurrency(budget.almocoSemana + budget.jantarSemana + budget.almocoFds + budget.jantarFds)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                                <Coffee className="w-3.5 h-3.5 text-amber-400" />
                                <span className="text-xs">Ajuda de custo</span>
                              </div>
                              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{formatCurrency(budget.ajudaCusto)}</span>
                            </div>
                          </div>

                          {/* Detalhe diárias */}
                          {(budget.weekdays > 0 || budget.weekends > 0) && (
                            <div className="mt-1 pl-5 space-y-0.5">
                              {budget.weekdays > 0 && (
                                <div className="text-[10px] text-gray-400">{formatDiasUteis(budget.weekdays)} × {formatCurrency(budget.valorDiariaUtil)}</div>
                              )}
                              {budget.weekends > 0 && (
                                <div className="text-[10px] text-gray-400">{formatFds(budget.weekends)} × {formatCurrency(budget.valorDiariaFds)}</div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* ── Total ── */}
                      <div className="flex justify-between items-center px-4 py-3 bg-slate-50 border-t border-slate-100 mt-auto">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Planejado</span>
                        <span className="text-[16px] font-black text-[#0033CC]">{formatCurrency(isNotAttended ? 0 : budget.totalFinal)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

      {/* Modal de Edição */}
      <Dialog open={!!editingBudget} onOpenChange={() => { setEditingBudget(null); setEditingBudgetInfo(null); }}>
        <DialogContent className="max-w-[680px] w-[95vw] p-0 gap-0 rounded-2xl overflow-hidden border-0 shadow-2xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Editar Orçamento Planejado</DialogTitle>
          </DialogHeader>
          
          {editingBudget && editingBudgetInfo && (() => {
            const noWeekdays = editingBudgetInfo.weekdays === 0;
            const noWeekends = editingBudgetInfo.weekends === 0;
            const subtotalDiariasUtil = editingBudgetInfo.weekdays * editingBudget.valorDiariaUtil;
            const subtotalDiariasFds = editingBudgetInfo.weekends * editingBudget.valorDiariaFds;
            const totalDiarias = subtotalDiariasUtil + subtotalDiariasFds;
            const effectiveAlmocoSemana = noWeekdays ? 0 : editingBudget.almocoSemana;
            const effectiveJantarSemana = noWeekdays ? 0 : editingBudget.jantarSemana;
            const effectiveAlmocoFds = noWeekends ? 0 : editingBudget.almocoFds;
            const effectiveJantarFds = noWeekends ? 0 : editingBudget.jantarFds;
            const modalTotal = totalDiarias + 
              editingBudget.mobilidade + effectiveAlmocoSemana + effectiveJantarSemana + 
              effectiveAlmocoFds + effectiveJantarFds;
            const totalAlimentacao = effectiveAlmocoSemana + effectiveJantarSemana + effectiveAlmocoFds + effectiveJantarFds;
            const diff = modalTotal - originalModalTotal;
            const hasChanges = diff !== 0;
            const modalInitials = editingBudgetInfo.name.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();

            const restoreDefaults = () => {
              if (defaultBudgetValues) {
                setEditingBudget({ ...defaultBudgetValues });
              }
            };

            const inputCls = "h-9 text-sm w-[88px] text-right font-semibold border-slate-200 focus:border-[#0033CC] focus:ring-2 focus:ring-[#0033CC]/10 rounded-lg bg-white";

            return (
            <>
              {/* ── Header ── */}
              <div className="px-6 pt-5 pb-4 border-b border-slate-100 bg-white">
                <div className="flex items-start gap-4">
                  {/* Avatar azul */}
                  <div className="w-11 h-11 rounded-[10px] flex items-center justify-center text-white font-black text-base shrink-0" style={{background:'#0033CC', boxShadow:'0 4px 12px #0033CC40'}}>
                    {modalInitials}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h2 className="text-[17px] font-bold text-slate-800 leading-tight">{editingBudgetInfo.name}</h2>
                    <p className="text-xs text-slate-400 mt-0.5">{editingBudgetInfo.functionName}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        editingBudgetInfo.type === 'Casa' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'
                      }`}>
                        {editingBudgetInfo.type}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-slate-400">
                        <Calendar className="w-3 h-3" />
                        {editingBudgetInfo.period}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md">
                        <Briefcase className="w-3 h-3" />
                        {editingBudgetInfo.weekdays} dias úteis
                      </span>
                      <span className="flex items-center gap-1 text-[11px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-md">
                        <Sun className="w-3 h-3" />
                        {editingBudgetInfo.weekends} fins de semana
                      </span>
                    </div>
                  </div>

                  <Button
                    variant="ghost" size="sm"
                    className="text-xs text-slate-400 hover:text-red-500 hover:bg-red-50 h-8 px-2.5 gap-1.5 shrink-0 mr-6 rounded-lg"
                    onClick={restoreDefaults}
                  >
                    <RotateCcw className="w-3 h-3" />
                    Restaurar
                  </Button>
                </div>
              </div>

              {/* ── Corpo ── */}
              <div className="max-h-[55vh] overflow-y-auto px-5 py-4 space-y-3" style={{background:'#F8FAFC'}}>

                {/* ── BLOCO: Diárias ── */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50 border-b border-blue-100">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-md bg-[#0033CC] flex items-center justify-center">
                        <Calendar className="w-3 h-3 text-white" />
                      </div>
                      <span className="text-[11px] font-black text-slate-600 uppercase tracking-widest">Diárias</span>
                    </div>
                    <span className="text-sm font-black text-[#0033CC]">{formatCurrency(totalDiarias)}</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {/* Dias Úteis */}
                    <div className="flex items-center px-4 py-3 gap-3">
                      <div className="flex items-center gap-2 flex-1">
                        <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <div>
                          <div className="text-xs font-semibold text-slate-700">Dias Úteis</div>
                          <div className="text-[10px] text-slate-400">{formatDias(editingBudgetInfo.weekdays)}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-400 font-medium">R$</span>
                        <Input
                          type="number" step="1" className={inputCls}
                          value={noWeekdays ? 0 : editingBudget.valorDiariaUtil / 100}
                          disabled={noWeekdays}
                          onChange={e => setEditingBudget({...editingBudget, valorDiariaUtil: Math.round(parseFloat(e.target.value) * 100) || 0})}
                        />
                        <span className="text-[10px] text-slate-400">/dia</span>
                      </div>
                      <div className="text-right w-24 shrink-0">
                        <span className="text-sm font-bold text-slate-800">{formatCurrency(subtotalDiariasUtil)}</span>
                      </div>
                    </div>
                    {/* Fim de Semana */}
                    <div className="flex items-center px-4 py-3 gap-3 bg-amber-50/40">
                      <div className="flex items-center gap-2 flex-1">
                        <Sun className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <div>
                          <div className="text-xs font-semibold text-slate-700">Fim de Semana</div>
                          <div className="text-[10px] text-slate-400">{formatDias(editingBudgetInfo.weekends)}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-400 font-medium">R$</span>
                        <Input
                          type="number" step="1" className={inputCls}
                          value={noWeekends ? 0 : editingBudget.valorDiariaFds / 100}
                          disabled={noWeekends}
                          onChange={e => setEditingBudget({...editingBudget, valorDiariaFds: Math.round(parseFloat(e.target.value) * 100) || 0})}
                        />
                        <span className="text-[10px] text-slate-400">/dia</span>
                      </div>
                      <div className="text-right w-24 shrink-0">
                        <span className="text-sm font-bold text-slate-800">{formatCurrency(subtotalDiariasFds)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── BLOCO: Mobilidade ── */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-violet-50 border-b border-violet-100">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-md bg-violet-500 flex items-center justify-center">
                        <Car className="w-3 h-3 text-white" />
                      </div>
                      <span className="text-[11px] font-black text-slate-600 uppercase tracking-widest">Mobilidade</span>
                      <span className="text-[10px] text-violet-400">ida e volta</span>
                    </div>
                    <span className="text-sm font-black text-violet-600">{formatCurrency(editingBudget.mobilidadeIda + editingBudget.mobilidadeVolta)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 px-4 py-3">
                    <div>
                      <div className="text-[10px] text-slate-400 font-medium mb-1.5">Ida (R$)</div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-400">R$</span>
                        <Input
                          type="number" step="0.01" className={inputCls}
                          value={editingBudget.mobilidadeIda / 100}
                          onChange={e => {
                            const ida = Math.round(parseFloat(e.target.value) * 100) || 0;
                            setEditingBudget({...editingBudget, mobilidadeIda: ida, mobilidade: ida + editingBudget.mobilidadeVolta});
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-medium mb-1.5">Volta (R$)</div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-400">R$</span>
                        <Input
                          type="number" step="0.01" className={inputCls}
                          value={editingBudget.mobilidadeVolta / 100}
                          onChange={e => {
                            const volta = Math.round(parseFloat(e.target.value) * 100) || 0;
                            setEditingBudget({...editingBudget, mobilidadeVolta: volta, mobilidade: editingBudget.mobilidadeIda + volta});
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── BLOCO: Alimentação ── */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-orange-50 border-b border-orange-100">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-md bg-orange-500 flex items-center justify-center">
                        <Utensils className="w-3 h-3 text-white" />
                      </div>
                      <span className="text-[11px] font-black text-slate-600 uppercase tracking-widest">Alimentação</span>
                    </div>
                    <span className="text-sm font-black text-orange-600">{formatCurrency(totalAlimentacao)}</span>
                  </div>

                  {/* Sub-seção: Dias Úteis */}
                  <div className="px-4 pt-3 pb-2.5">
                    <div className="flex items-center gap-1.5 mb-2.5">
                      <Briefcase className="w-3 h-3 text-slate-400" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dias Úteis ({editingBudgetInfo.weekdays})</span>
                    </div>
                    <div className="space-y-2 pl-3">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-600 w-14 shrink-0">Almoço</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-400">R$</span>
                          <Input
                            type="number" step="1" className={inputCls}
                            value={noWeekdays ? 0 : Math.round(editingBudget.almocoSemana / 100)}
                            disabled={noWeekdays}
                            onChange={e => setEditingBudget({...editingBudget, almocoSemana: Math.round(parseFloat(e.target.value) * 100) || 0})}
                          />
                          <span className="text-[10px] text-slate-400">total</span>
                        </div>
                        <span className="text-[10px] text-slate-300 ml-auto">
                          {editingBudgetInfo.weekdays > 0 ? formatCurrency(Math.round(editingBudget.almocoSemana / editingBudgetInfo.weekdays)) : 'R$ 0'}/dia
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-600 w-14 shrink-0">Jantar</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-400">R$</span>
                          <Input
                            type="number" step="1" className={inputCls}
                            value={noWeekdays ? 0 : Math.round(editingBudget.jantarSemana / 100)}
                            disabled={noWeekdays}
                            onChange={e => setEditingBudget({...editingBudget, jantarSemana: Math.round(parseFloat(e.target.value) * 100) || 0})}
                          />
                          <span className="text-[10px] text-slate-400">total</span>
                        </div>
                        <span className="text-[10px] text-slate-300 ml-auto">
                          {editingBudgetInfo.weekdays > 0 ? formatCurrency(Math.round(editingBudget.jantarSemana / editingBudgetInfo.weekdays)) : 'R$ 0'}/dia
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mx-4 border-t border-dashed border-slate-100" />

                  {/* Sub-seção: Fins de Semana */}
                  <div className="px-4 pt-2.5 pb-3 bg-amber-50/30">
                    <div className="flex items-center gap-1.5 mb-2.5">
                      <Sun className="w-3 h-3 text-amber-400" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fim de Semana ({editingBudgetInfo.weekends})</span>
                    </div>
                    <div className="space-y-2 pl-3">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-600 w-14 shrink-0">Almoço</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-400">R$</span>
                          <Input
                            type="number" step="1" className={inputCls}
                            value={noWeekends ? 0 : Math.round(editingBudget.almocoFds / 100)}
                            disabled={noWeekends}
                            onChange={e => setEditingBudget({...editingBudget, almocoFds: Math.round(parseFloat(e.target.value) * 100) || 0})}
                          />
                          <span className="text-[10px] text-slate-400">total</span>
                        </div>
                        <span className="text-[10px] text-slate-300 ml-auto">
                          {editingBudgetInfo.weekends > 0 ? formatCurrency(Math.round(editingBudget.almocoFds / editingBudgetInfo.weekends)) : 'R$ 0'}/dia
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-600 w-14 shrink-0">Jantar</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-400">R$</span>
                          <Input
                            type="number" step="1" className={inputCls}
                            value={noWeekends ? 0 : Math.round(editingBudget.jantarFds / 100)}
                            disabled={noWeekends}
                            onChange={e => setEditingBudget({...editingBudget, jantarFds: Math.round(parseFloat(e.target.value) * 100) || 0})}
                          />
                          <span className="text-[10px] text-slate-400">total</span>
                        </div>
                        <span className="text-[10px] text-slate-300 ml-auto">
                          {editingBudgetInfo.weekends > 0 ? formatCurrency(Math.round(editingBudget.jantarFds / editingBudgetInfo.weekends)) : 'R$ 0'}/dia
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Footer ── */}
              <div className="px-5 py-4 border-t border-slate-100 bg-white">
                <div className="flex items-center justify-between gap-4">
                  {/* Total */}
                  <div className="rounded-xl px-4 py-3 min-w-[190px]" style={{background:'#EEF2FF', border:'1px solid #0033CC20'}}>
                    <div className="text-[9px] uppercase font-black tracking-widest mb-0.5" style={{color:'#0033CC99'}}>Total Planejado</div>
                    <div className="text-[22px] font-black leading-none transition-all" style={{color:'#0033CC'}}>{formatCurrency(modalTotal)}</div>
                    <div className="text-[9px] text-slate-400 mt-1 leading-tight">
                      Diárias {formatCurrency(totalDiarias)} · Alim. {formatCurrency(totalAlimentacao)} · Mob. {formatCurrency(editingBudget.mobilidade)}
                    </div>
                    {hasChanges && (
                      <div className={`text-[10px] font-bold mt-1 ${diff > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                        {diff > 0 ? '▲' : '▼'} {formatCurrency(Math.abs(diff))} vs original
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      className="h-10 px-4 text-slate-500 hover:text-slate-700 rounded-xl"
                      onClick={() => { setEditingBudget(null); setEditingBudgetInfo(null); }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={saveEdit}
                      disabled={!hasChanges}
                      className="h-10 px-5 text-white font-semibold rounded-xl gap-2 transition-all shadow-md"
                      style={{background:'#0033CC', boxShadow:'0 4px 12px #0033CC40'}}
                    >
                      <CheckCheck className="w-4 h-4" />
                      {hasChanges ? `Salvar (${diff > 0 ? '+' : ''}${formatCurrency(diff)})` : 'Salvar'}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          );})()}
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação - Envio em Lote */}
      <Dialog open={confirmSendOpen} onOpenChange={setConfirmSendOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Send className="w-5 h-5 text-green-600" />
              Confirmar Envio
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-gray-600 dark:text-gray-400">
              Você está prestes a enviar <strong className="text-green-600">{selectedCards.size} itens</strong> para o Realizado.
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Esta ação não pode ser desfeita. Os valores serão registrados como orçamento realizado.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmSendOpen(false)}>Cancelar</Button>
            <Button 
              onClick={() => {
                sendSelectedToActualMutation.mutate();
                setConfirmSendOpen(false);
              }}
              disabled={sendSelectedToActualMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              Confirmar Envio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação - Envio Individual */}
      <Dialog open={!!confirmSendSingle} onOpenChange={() => setConfirmSendSingle(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Send className="w-5 h-5 text-green-600" />
              Confirmar Envio
            </DialogTitle>
          </DialogHeader>
          {confirmSendSingle && (
            <div className="py-4">
              <p className="text-gray-600 dark:text-gray-400">
                Enviar orçamento de <strong className="text-green-600">{getCollaboratorName(confirmSendSingle.inclusion.collaboratorId)}</strong> para o Realizado?
              </p>
              <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span>Total:</span>
                  <span className="font-bold text-green-600">{formatCurrency(confirmSendSingle.totalFinal)}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmSendSingle(null)}>Cancelar</Button>
            <Button 
              onClick={() => {
                if (confirmSendSingle) {
                  sendToActualMutation.mutate(confirmSendSingle as typeof calculatedBudgets[0]);
                  setConfirmSendSingle(null);
                }
              }}
              disabled={sendToActualMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              Confirmar Envio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal de confirmação de restauração ── */}
      <Dialog open={!!restoreModal} onOpenChange={() => setRestoreModal(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                <Undo2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span>Restaurar participação</span>
            </DialogTitle>
          </DialogHeader>
          {restoreModal && (
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-gray-900 rounded-xl px-4 py-3 flex items-center gap-3 border border-gray-100 dark:border-gray-700">
                <div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{restoreModal.name}</p>
                  <p className="text-[10px] text-gray-400">{restoreModal.functionName}</p>
                </div>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                O colaborador voltará a ser contabilizado normalmente nos totais financeiros do planejado.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" className="rounded-xl" onClick={() => setRestoreModal(null)}>
                  Cancelar
                </Button>
                <Button
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                  onClick={() => {
                    toggleNotAttendedMutation.mutate({ id: restoreModal.id, reason: "" });
                    setRestoreModal(null);
                  }}
                  disabled={toggleNotAttendedMutation.isPending}
                >
                  <Undo2 className="w-3.5 h-3.5 mr-1.5" />
                  {toggleNotAttendedMutation.isPending ? 'Restaurando...' : 'Restaurar'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!notAttendedModal} onOpenChange={() => { setNotAttendedModal(null); setNotAttendedReason(""); }}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <div className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                <UserX className="w-4 h-4 text-gray-500" />
              </div>
              <span>Marcar como não participou</span>
            </DialogTitle>
          </DialogHeader>
          {notAttendedModal && (
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-gray-900 rounded-xl px-4 py-3 flex items-center gap-3 border border-gray-100 dark:border-gray-700">
                <div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{notAttendedModal.name}</p>
                  <p className="text-[10px] text-gray-400">{notAttendedModal.functionName}</p>
                </div>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                Este colaborador será excluído do cálculo financeiro do planejado. Os valores não serão contabilizados nos totais.
              </p>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Motivo <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <Textarea
                  className="mt-1.5 rounded-xl text-sm resize-none"
                  value={notAttendedReason}
                  onChange={e => setNotAttendedReason(e.target.value)}
                  placeholder='Ex: "Desistência", "Problema de saúde", "Substituído"...'
                  rows={2}
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" className="rounded-xl" onClick={() => { setNotAttendedModal(null); setNotAttendedReason(""); }}>
                  Cancelar
                </Button>
                <Button
                  className="rounded-xl bg-gray-700 hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-500 text-white shadow-sm"
                  onClick={() => {
                    if (notAttendedModal.id) {
                      toggleNotAttendedMutation.mutate({ id: notAttendedModal.id, reason: notAttendedReason });
                    } else if (notAttendedModal.budget) {
                      createAndMarkNotAttendedMutation.mutate({ budget: notAttendedModal.budget, reason: notAttendedReason });
                    }
                  }}
                  disabled={toggleNotAttendedMutation.isPending || createAndMarkNotAttendedMutation.isPending}
                >
                  <UserX className="w-3.5 h-3.5 mr-1.5" />
                  {(toggleNotAttendedMutation.isPending || createAndMarkNotAttendedMutation.isPending) ? 'Confirmando...' : 'Confirmar'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
