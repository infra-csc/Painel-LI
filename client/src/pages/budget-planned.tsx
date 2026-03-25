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
import { Calculator, Users, Calendar, RefreshCw, Edit, Send, CheckCheck, Car, Utensils, Coffee, Moon, Sun, Search, ArrowUpDown, Home, UserCheck, TrendingUp, DollarSign, Briefcase, ChevronDown, ChevronUp, BarChart3, RotateCcw, Lock, UserX, Undo2, Save } from "lucide-react";
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
  const [restoreModal, setRestoreModal] = useState<{ id: string; name: string; functionName: string; startDate?: string; endDate?: string } | null>(null);
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

  const totalSelecionado = useMemo(() => {
    return calculatedBudgets
      .filter(b => selectedCards.has(b.inclusion.id) && !sentToActual.has(b.inclusion.id))
      .reduce((sum, b) => sum + b.totalFinal, 0);
  }, [calculatedBudgets, selectedCards, sentToActual]);

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
    onSuccess: (data, variables) => {
      setSentToActual(prev => { const s = new Set(Array.from(prev)); s.add(data.id); return s; });
      setConfirmSendSingle(null);
      const wasEdited = !!(variables as any).hasOverride;
      toast({
        title: wasEdited ? "Planejamento salvo com sucesso!" : "Enviado para o Realizado!",
        description: wasEdited
          ? "Os valores editados foram registrados. Envie o lote quando estiver pronto."
          : "Os valores calculados foram enviados diretamente.",
      });
      qc.invalidateQueries({ queryKey: ["/api/budget-actual"] });
      qc.invalidateQueries({ queryKey: ["/api/budget-planned"] });
    },
    onError: () => {
      toast({ title: "Erro ao enviar", description: "Não foi possível enviar para o Realizado.", variant: "destructive" });
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
      setConfirmSendOpen(false);
      toast({ title: "Planejamento enviado com sucesso!", description: `${data.length} ${data.length === 1 ? 'colaborador enviado' : 'colaboradores enviados'} para o Realizado.` });
      qc.invalidateQueries({ queryKey: ["/api/budget-actual"] });
      qc.invalidateQueries({ queryKey: ["/api/budget-planned"] });
    },
    onError: () => {
      toast({ title: "Erro ao enviar", description: "Não foi possível enviar para o Realizado.", variant: "destructive" });
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
    <div className="space-y-7 max-w-5xl mx-auto pb-32">

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
        {selectedEventId && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <EventSearchSelect value={selectedEventId} onValueChange={setSelectedEventId} events={eventsWithInclusions} />
            {selectedEvent?.startDate && (
              <span style={{ fontSize: 11, color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Calendar className="w-3 h-3" style={{ color: '#94A3B8' }} />
                {formatEventDate(selectedEvent.startDate)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Tela 1: Seleção de evento ── */}
      {!selectedEventId ? (
        <div className="rounded-2xl border border-blue-100 shadow-md">
          <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-violet-50 rounded-2xl px-8 py-20 flex flex-col items-center justify-center text-center">
            {/* Ícone */}
            <div className="relative w-24 h-24 mx-auto mb-8">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-400 to-indigo-600 rounded-2xl shadow-lg shadow-indigo-200 flex items-center justify-center rotate-3">
                <Calculator className="w-10 h-10 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-emerald-400 rounded-xl flex items-center justify-center shadow-md">
                <DollarSign className="w-4 h-4 text-white" />
              </div>
            </div>

            <h2 className="text-2xl font-extrabold text-gray-900 mb-3">Selecione um evento</h2>
            <p className="text-sm text-gray-400 max-w-xs mx-auto leading-relaxed">
              Visualize o orçamento previsto com base nas escalações confirmadas. Valores calculados automaticamente.
            </p>

            <div className="max-w-sm w-full mx-auto mt-8">
              <EventSearchSelect value={selectedEventId} onValueChange={setSelectedEventId} events={eventsWithInclusions} />
            </div>
          </div>
        </div>
      ) : (
          <>
            {/* ── Dashboard Bar Superior ── */}
            <div style={{
              background: 'rgba(255,255,255,0.85)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(0,51,204,0.12)',
              borderRadius: 20,
              boxShadow: '0 4px 24px rgba(0,51,204,0.07), 0 1px 4px rgba(0,0,0,0.04)',
              overflow: 'hidden',
            }}>
              {/* Faixa accent azul topo */}
              <div style={{height: 3, background: 'linear-gradient(90deg, #0033CC 0%, #4F7BF5 50%, #059669 100%)'}} />

              <div className="flex items-stretch">
                {/* Total Planejado — hero section */}
                <div className="px-7 py-5 flex flex-col justify-center gap-1 relative overflow-hidden" style={{
                  background: 'linear-gradient(135deg, #1D4ED8 0%, #2563EB 50%, #3B82F6 100%)',
                  minWidth: 230,
                }}>
                  <p className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-white/60 relative">Total Planejado</p>
                  {selectedEvent?.startDate && (
                    <p className="flex items-center gap-1 text-[10px] text-white/40 relative">
                      <Calendar className="w-2.5 h-2.5 shrink-0" />
                      {formatEventDate(selectedEvent.startDate)}
                    </p>
                  )}
                  <div className="text-[30px] font-semibold text-white leading-none tracking-tight mt-1.5 relative"
                    style={{letterSpacing: '-0.03em'}}>
                    {formatCurrency(totalGeral)}
                  </div>
                </div>

                {/* Separador vertical */}
                <div style={{width: 1, background: 'rgba(0,51,204,0.1)'}} />

                {/* Stats */}
                <div className="flex-1 px-6 py-5 flex items-center gap-0">
                  {/* Colaboradores */}
                  <div className="flex-1 flex flex-col items-center gap-1 px-4">
                    <div className="text-[26px] font-black leading-none tracking-tight" style={{color:'#0033CC'}}>{stats.total}</div>
                    <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
                      <Users className="w-3 h-3" />Colaboradores
                    </div>
                  </div>

                  <div style={{width:1, height:36, background:'rgba(0,51,204,0.08)'}} />

                  {/* Casa */}
                  <div className="flex-1 flex flex-col items-center gap-1 px-4">
                    <div className="text-[26px] font-black leading-none tracking-tight" style={{color:'#2563EB'}}>{stats.totalCasa}</div>
                    <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
                      <Home className="w-3 h-3" />Casa
                    </div>
                  </div>

                  <div style={{width:1, height:36, background:'rgba(0,51,204,0.08)'}} />

                  {/* Freela */}
                  <div className="flex-1 flex flex-col items-center gap-1 px-4">
                    <div className="text-[26px] font-black leading-none tracking-tight" style={{color:'#EA580C'}}>{stats.totalFreela}</div>
                    <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
                      <UserCheck className="w-3 h-3" />Freela
                    </div>
                  </div>

                  <div style={{width:1, height:36, background:'rgba(0,51,204,0.08)'}} />

                  {/* Período do evento */}
                  <div className="flex-1 flex flex-col items-center gap-1 px-4">
                    {selectedEvent?.startDate && selectedEvent?.endDate ? (
                      <div className="flex flex-col items-center gap-0">
                        <div className="text-[14px] font-black leading-none tracking-tight tabular-nums" style={{color:'#0D9488'}}>
                          {new Date(selectedEvent.startDate + 'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
                        </div>
                        <div className="text-[9px] font-bold text-slate-300 leading-none my-0.5">→</div>
                        <div className="text-[14px] font-black leading-none tracking-tight tabular-nums" style={{color:'#0D9488'}}>
                          {new Date(selectedEvent.endDate + 'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
                        </div>
                      </div>
                    ) : (
                      <div className="text-[14px] font-black leading-none tracking-tight text-slate-300">—</div>
                    )}
                    <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
                      <Calendar className="w-3 h-3" />Período
                    </div>
                  </div>
                </div>
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
                <div className="bg-white rounded-2xl px-6 py-5" style={{border:'1px solid #E8EEFF', boxShadow:'0 2px 12px rgba(0,51,204,0.04)'}}>
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Etapa atual</span>
                      <div className="text-[13px] font-bold text-[#0033CC] mt-0.5">{steps[currentStep].label}</div>
                    </div>
                  </div>
                  <div className="flex items-center">
                    {steps.map((step, i) => {
                      const isDone = i < currentStep;
                      const isActive = i === currentStep;
                      const isLast = i === steps.length - 1;
                      return (
                        <div key={i} className="flex items-center flex-1">
                          <div className="flex flex-col items-center gap-2">
                            {/* Bolinha */}
                            <div style={{position: 'relative', flexShrink: 0}}>
                              {/* Ping no step ativo */}
                              {isActive && (
                                <span className="stepper-ping" style={{
                                  position: 'absolute', inset: -4,
                                  borderRadius: '50%',
                                  border: '2px solid rgba(0,51,204,0.35)',
                                  animation: 'stepperPing 1.6s ease-out infinite',
                                }} />
                              )}
                              <div style={
                                isDone ? {
                                  width: 32, height: 32, borderRadius: '50%',
                                  background: 'linear-gradient(135deg, #059669, #34d399)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  boxShadow: '0 2px 8px rgba(5,150,105,0.30)',
                                } : isActive ? {
                                  width: 36, height: 36, borderRadius: '50%',
                                  background: 'linear-gradient(135deg, #0033CC, #1a4fd8)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  boxShadow: '0 0 0 4px rgba(0,51,204,0.10), 0 0 18px rgba(0,51,204,0.22)',
                                } : {
                                  width: 32, height: 32, borderRadius: '50%',
                                  background: '#F1F5F9',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }
                              }>
                                {isDone ? (
                                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                ) : (
                                  <span style={{
                                    fontSize: 12, fontWeight: 800,
                                    color: isActive ? '#fff' : '#CBD5E1',
                                  }}>{i + 1}</span>
                                )}
                              </div>
                            </div>
                            {/* Labels */}
                            <div className="text-center">
                              <div style={{
                                fontSize: 11, fontWeight: 700, lineHeight: 1.2,
                                color: isDone ? '#059669' : isActive ? '#0033CC' : '#CBD5E1',
                              }}>{step.label}</div>
                              <div style={{fontSize: 9, color: '#CBD5E1', marginTop: 2}}>{step.desc}</div>
                            </div>
                          </div>
                          {!isLast && (
                            <div style={{
                              flex: 1, height: 3, marginBottom: 28, marginLeft: 6, marginRight: 6,
                              borderRadius: 9999,
                              background: isDone
                                ? 'linear-gradient(90deg, #34d399, #059669)'
                                : '#F1F5F9',
                            }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* ── KPI Cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

              {/* Casa */}
              <div className="rounded-2xl bg-white" style={{
                borderTop: '3px solid #3B82F6',
                boxShadow: '0 1px 8px rgba(0,0,0,0.05)',
              }}>
                <div className="px-5 py-4 pb-4">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{background:'rgba(37,99,235,0.08)'}}>
                      <Home style={{width:13, height:13, color:'#2563EB'}} />
                    </div>
                    <span style={{fontSize:9, fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:'#94A3B8'}}>Casa</span>
                  </div>
                  <div style={{fontSize:17, fontWeight:500, color:'#1E293B', letterSpacing:'-0.02em', fontVariantNumeric:'tabular-nums', lineHeight:1}}>
                    {formatCurrency(stats.valorCasa)}
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    <span style={{fontSize:10, color:'#94A3B8', fontWeight:400}}>
                      {stats.totalCasa} colaborador{stats.totalCasa !== 1 ? 'es' : ''}
                    </span>
                  </div>
                </div>
              </div>

              {/* Freela */}
              <div className="rounded-2xl bg-white" style={{
                borderTop: '3px solid #F97316',
                boxShadow: '0 1px 8px rgba(0,0,0,0.05)',
              }}>
                <div className="px-5 py-4 pb-4">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{background:'rgba(234,88,12,0.08)'}}>
                      <UserCheck style={{width:13, height:13, color:'#EA580C'}} />
                    </div>
                    <span style={{fontSize:9, fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:'#94A3B8'}}>Freela</span>
                  </div>
                  <div style={{fontSize:17, fontWeight:500, color:'#1E293B', letterSpacing:'-0.02em', fontVariantNumeric:'tabular-nums', lineHeight:1}}>
                    {formatCurrency(stats.valorFreela)}
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    <span style={{fontSize:10, color:'#94A3B8', fontWeight:400}}>
                      {stats.totalFreela} colaborador{stats.totalFreela !== 1 ? 'es' : ''}
                    </span>
                  </div>
                </div>
              </div>

              {/* Médio / Pessoa */}
              <div className="rounded-2xl bg-white" style={{
                borderTop: '3px solid #7C3AED',
                boxShadow: '0 1px 8px rgba(0,0,0,0.05)',
              }}>
                <div className="px-5 py-4 pb-4">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{background:'rgba(124,58,237,0.08)'}}>
                      <Users style={{width:13, height:13, color:'#7C3AED'}} />
                    </div>
                    <span style={{fontSize:9, fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:'#94A3B8'}}>Médio / Pessoa</span>
                  </div>
                  <div style={{fontSize:17, fontWeight:500, color:'#7C3AED', letterSpacing:'-0.02em', fontVariantNumeric:'tabular-nums', lineHeight:1}}>
                    {formatCurrency(stats.media)}
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    <span style={{fontSize:10, color:'#94A3B8', fontWeight:400}}>por colaborador</span>
                  </div>
                </div>
              </div>

              {/* Médio / Dia */}
              <div className="rounded-2xl bg-white" style={{
                borderTop: '3px solid #0D9488',
                boxShadow: '0 1px 8px rgba(0,0,0,0.05)',
              }}>
                <div className="px-5 py-4 pb-4">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{background:'rgba(13,148,136,0.08)'}}>
                      <BarChart3 style={{width:13, height:13, color:'#0D9488'}} />
                    </div>
                    <span style={{fontSize:9, fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:'#94A3B8'}}>Médio / Dia</span>
                  </div>
                  <div style={{fontSize:17, fontWeight:500, color:'#0D9488', letterSpacing:'-0.02em', fontVariantNumeric:'tabular-nums', lineHeight:1}}>
                    {formatCurrency(stats.mediaPorDia)}
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    <span style={{fontSize:10, color:'#94A3B8', fontWeight:400}}>por dia trabalhado</span>
                  </div>
                </div>
              </div>

            </div>

            {/* ── Filtros e Busca — minimal ── */}
            <div className="flex flex-wrap items-center gap-3 px-0">
              {pendingCount > 0 && (
                <Checkbox 
                  checked={selectedCards.size === pendingCount && pendingCount > 0}
                  onCheckedChange={(checked) => checked ? selectAllCards() : clearSelection()}
                  className="shrink-0"
                />
              )}

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-300" />
                <input
                  type="text"
                  placeholder="Buscar por nome..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    height: 34, paddingLeft: 28, paddingRight: 12, width: 180,
                    background: '#F8FAFC', border: 'none',
                    borderBottom: `1.5px solid ${searchTerm ? '#0033CC' : '#E2E8F0'}`,
                    borderRadius: '6px 6px 0 0',
                    fontSize: 12, color: '#334155', outline: 'none',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => (e.currentTarget.style.borderBottomColor = '#0033CC')}
                  onBlur={e => (e.currentTarget.style.borderBottomColor = searchTerm ? '#0033CC' : '#E2E8F0')}
                />
              </div>

              <Select value={filterFunction} onValueChange={setFilterFunction}>
                <SelectTrigger className="w-auto min-w-[140px] h-[34px] text-xs shrink-0 bg-[#F8FAFC] border-0 border-b border-slate-200 rounded-none rounded-t-md text-slate-600 shadow-none focus:ring-0 focus:border-b-[#0033CC]">
                  <SelectValue placeholder="Função" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl shadow-xl border border-slate-100 min-w-[180px] p-1.5" style={{backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', background:'rgba(255,255,255,0.96)'}}>
                  <SelectItem value="all" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-600 data-[highlighted]:border-l-blue-500 focus:bg-blue-50 focus:text-blue-600">Todas as funções</SelectItem>
                  {uniqueFunctions.map(f => (
                    <SelectItem key={f} value={f} className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-600 data-[highlighted]:border-l-blue-500 focus:bg-blue-50 focus:text-blue-600">{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-28 h-[34px] text-xs shrink-0 bg-[#F8FAFC] border-0 border-b border-slate-200 rounded-none rounded-t-md text-slate-600 shadow-none focus:ring-0">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl shadow-xl border border-slate-100 min-w-[140px] p-1.5" style={{backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', background:'rgba(255,255,255,0.96)'}}>
                  <SelectItem value="all" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-600 data-[highlighted]:border-l-blue-500 focus:bg-blue-50 focus:text-blue-600">Todos</SelectItem>
                  <SelectItem value="casa" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-600 data-[highlighted]:border-l-blue-500 focus:bg-blue-50 focus:text-blue-600">Casa</SelectItem>
                  <SelectItem value="freela" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-600 data-[highlighted]:border-l-blue-500 focus:bg-blue-50 focus:text-blue-600">Freela</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-auto min-w-[120px] h-[34px] text-xs shrink-0 bg-[#F8FAFC] border-0 border-b border-slate-200 rounded-none rounded-t-md text-slate-600 shadow-none focus:ring-0">
                  <SelectValue placeholder="Ordenar" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl shadow-xl border border-slate-100 min-w-[160px] p-1.5" style={{backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', background:'rgba(255,255,255,0.96)'}}>
                  <SelectItem value="name_asc" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-600 data-[highlighted]:border-l-blue-500 focus:bg-blue-50 focus:text-blue-600">Nome A-Z</SelectItem>
                  <SelectItem value="name_desc" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-600 data-[highlighted]:border-l-blue-500 focus:bg-blue-50 focus:text-blue-600">Nome Z-A</SelectItem>
                  <SelectItem value="days_desc" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-600 data-[highlighted]:border-l-blue-500 focus:bg-blue-50 focus:text-blue-600">Mais Dias</SelectItem>
                  <SelectItem value="days_asc" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-600 data-[highlighted]:border-l-blue-500 focus:bg-blue-50 focus:text-blue-600">Menos Dias</SelectItem>
                  <SelectItem value="function" className="rounded-xl text-xs cursor-pointer border-l-[3px] border-l-transparent data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-600 data-[highlighted]:border-l-blue-500 focus:bg-blue-50 focus:text-blue-600">Por Função</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex-1" />
              <span style={{
                fontSize: 11, color: '#94A3B8', fontWeight: 600,
                background: '#F8FAFC', borderRadius: 8, padding: '4px 10px',
              }}>
                {filteredBudgets.length} resultado{filteredBudgets.length !== 1 ? 's' : ''}
              </span>
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
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
                      className={`rounded-2xl border transition-all duration-500 ease-in-out overflow-hidden flex flex-col group h-full ${
                        isNotAttended ? 'bg-slate-50 border-slate-200 shadow-sm' :
                        highlightCardId === budget.inclusion.id ? 'bg-white ring-2 ring-[#0033CC] shadow-[0_8px_32px_rgba(0,51,204,0.14)]' :
                        isSelected ? 'bg-white ring-2 ring-emerald-400 border-emerald-200 shadow-md' : 
                        isSent ? 'bg-white border-indigo-200 opacity-85 shadow-sm' :
                        budget.hasOverride ? 'bg-white border-amber-200 shadow-sm' : 'bg-white border-slate-200 shadow-sm'
                      } ${!isNotAttended && !isSelected ? 'hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-100/60 hover:border-blue-200' : ''}`}
                    >
                      {/* stripe top */}
                      <div className={`h-[3px] ${isSelected ? 'bg-emerald-400' : isSent ? 'bg-blue-400' : isNotAttended ? 'bg-slate-300' : 'bg-[#0033CC]'}`} />
                      {/* ── Header do card — estado INATIVO (Não Participou) ── */}
                      {isNotAttended ? (
                        <div className="px-4 py-3 bg-white">
                          {/* Linha superior: avatar + nome + botão restaurar */}
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-[8px] flex items-center justify-center text-slate-400 text-[12px] font-bold shrink-0 bg-slate-200">
                              {initials || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="font-medium text-slate-600 text-[14px] truncate block">{name}</span>
                              <span className="text-[11px] text-slate-400">{getFunctionName(budget.inclusion.functionId)}</span>
                            </div>
                            {canMarkNotAttended && planRecord && (
                              <button
                                className="flex items-center gap-1.5 px-3 h-9 rounded-xl text-[12px] font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all shrink-0 disabled:opacity-60 shadow-sm shadow-blue-200"
                                onClick={() => setRestoreModal({
                                  id: planRecord.id, name,
                                  functionName: getFunctionName(budget.inclusion.functionId),
                                  startDate: budget.inclusion.scheduleStartDate ?? undefined,
                                  endDate: budget.inclusion.scheduleEndDate ?? undefined,
                                })}
                                disabled={toggleNotAttendedMutation.isPending}
                              >
                                <Undo2 style={{width:14, height:14}} />
                                Restaurar
                              </button>
                            )}
                          </div>

                          {/* Linha inferior: data + badge motivo */}
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            {/* Data do período */}
                            {budget.inclusion.scheduleStartDate && budget.inclusion.scheduleEndDate && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md"
                                style={{background:'#F1F5F9', fontSize:10, fontWeight:400, color:'#64748B'}}>
                                <Calendar style={{width:10, height:10, color:'#94A3B8', flexShrink:0}} />
                                {new Date(budget.inclusion.scheduleStartDate+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
                                <span style={{color:'#CBD5E1'}}>–</span>
                                {new Date(budget.inclusion.scheduleEndDate+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
                              </span>
                            )}
                            {/* Badge ausência */}
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium"
                              style={{background:'#FEF9C3', color:'#92400E', border:'1px solid #FDE68A'}}>
                              <UserX style={{width:10, height:10}} />
                              Não participou
                            </span>
                            {/* Motivo */}
                            {planRecord?.didNotAttendReason && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium"
                                style={{background:'#FFFBEB', color:'#B45309', border:'1px solid #FDE68A'}}>
                                "{planRecord.didNotAttendReason}"
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                      /* ── Header do card — estado ATIVO ── */
                      <div className={`flex items-center justify-between px-4 py-3 ${
                        isSent ? 'bg-indigo-50/40' : 'bg-slate-50/60'
                      }`}>
                        <div className="flex items-center gap-3">
                          {/* Checkbox / lock */}
                          {!isSent ? (
                            <Checkbox 
                              checked={isSelected}
                              onCheckedChange={() => toggleCardSelection(budget.inclusion.id)}
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
                          <div className={`w-9 h-9 rounded-[8px] flex items-center justify-center text-white text-[12px] font-bold shrink-0 ${avatarColor(name)}`}>
                            {initials || '?'}
                          </div>

                          <div className="min-w-0 flex-1 flex flex-col gap-y-1">
                            {/* Linha 1: nome + dot */}
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-800 text-[14px] truncate">{name}</span>
                              {budget.hasOverride && (
                                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Valores personalizados" />
                              )}
                            </div>
                            {/* Linha 2: badge de data */}
                            {budget.inclusion.scheduleStartDate && budget.inclusion.scheduleEndDate && (
                              <span className="inline-flex items-center gap-1 self-start px-1.5 py-0.5 rounded-md"
                                style={{background:'#F1F5F9', fontSize:10, fontWeight:400, color:'#64748B', letterSpacing:'0.01em'}}>
                                <Calendar style={{width:10, height:10, color:'#94A3B8', flexShrink:0}} />
                                {new Date(budget.inclusion.scheduleStartDate + 'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
                                <span style={{color:'#CBD5E1'}}>–</span>
                                {new Date(budget.inclusion.scheduleEndDate + 'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
                              </span>
                            )}
                            {/* Linha 3: badges de função/tipo */}
                            <div className="flex items-center gap-1 overflow-hidden flex-wrap">
                              <span className="text-[10px] font-semibold text-slate-600 bg-slate-200 px-2 py-0.5 rounded-full truncate shrink min-w-0">{getFunctionName(budget.inclusion.functionId)}</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${isCasa ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>{isCasa ? 'Casa' : 'Freela'}</span>
                              {isSent && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap"
                                  style={{background:'#EFF6FF', color:'#2563EB', border:'1px solid #BFDBFE'}}>
                                  <CheckCheck style={{width:10,height:10}} />
                                  Salvo
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Ações */}
                        <div className="flex items-center gap-0.5">
                          {canMarkNotAttended && !isSent && (
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg"
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
                          )}
                          <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                          {canEdit && !isSent && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg" title="Editar valores" onClick={() => openEditModal(budget)}>
                              <Edit className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {!isSent && (
                            <Button 
                              variant="ghost" size="icon" 
                              className={`h-8 w-8 rounded-lg ${budget.hasOverride ? 'text-blue-600 hover:text-blue-700 hover:bg-blue-50' : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'}`}
                              title={budget.hasOverride ? "Salvar planejamento editado" : "Enviar para o Realizado"}
                              onClick={() => setConfirmSendSingle(budget)}
                            >
                              {budget.hasOverride ? <Save className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
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
                      )}
                      
                      {/* ── Corpo colapsável ── */}
                      {!isCollapsed && (
                        <div className={`px-4 pt-3 pb-3 flex-1 flex flex-col gap-3 transition-all duration-500${isNotAttended ? ' opacity-25 grayscale pointer-events-none select-none' : ''}`}>
                          {/* 3 blocos — hierarquia tipográfica + altura mínima consistente */}
                          <div className="flex flex-col gap-2">
                            {/* ── Diárias ── */}
                            <div className="rounded-xl flex items-stretch" style={{background:'#EEF2FF', minHeight: 50}}>
                              {/* Esquerda: ícone + label + total */}
                              <div className="flex items-center px-3 py-2.5 shrink-0" style={{minWidth: 112}}>
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-1">
                                    <Calendar className="w-2.5 h-2.5 shrink-0" style={{color:'#0033CC'}} />
                                    <span className="text-[9px] font-semibold uppercase tracking-[0.1em]" style={{color:'#0033CC'}}>Diárias</span>
                                  </div>
                                  <span className="tabular-nums font-medium text-[14px] leading-none" style={{color:'#1E293B', letterSpacing:'-0.01em', textDecoration: isNotAttended ? 'line-through' : 'none'}}>{formatCurrency(budget.subtotalDiarias)}</span>
                                </div>
                              </div>
                              {/* Separador */}
                              <div style={{width: 1, background: 'rgba(0,51,204,0.07)', margin: '9px 0'}} />
                              {/* Direita: detalhes */}
                              <div className="flex-1 flex flex-col justify-center gap-1 px-3 py-2.5">
                                {budget.weekdays > 0 && (
                                  <div className="flex items-center justify-between gap-x-2">
                                    <span className="text-[11px] leading-tight font-normal flex-1" style={{color:'#94A3B8', minWidth:'fit-content'}}>{formatDiasUteis(budget.weekdays)}</span>
                                    <span className="font-normal tabular-nums text-[11px] leading-tight shrink-0 tracking-wide" style={{color:'#3B5FCC'}}>{formatCurrency(budget.valorDiariaUtil)}</span>
                                  </div>
                                )}
                                {budget.weekends > 0 && (
                                  <div className="flex items-center justify-between gap-x-2">
                                    <span className="text-[11px] leading-tight font-normal flex-1" style={{color:'#94A3B8', minWidth:'fit-content'}}>{formatFds(budget.weekends)}</span>
                                    <span className="font-normal tabular-nums text-[11px] leading-tight shrink-0 tracking-wide" style={{color:'#6d28d9'}}>{formatCurrency(budget.valorDiariaFds)}</span>
                                  </div>
                                )}
                                {budget.weekdays === 0 && budget.weekends === 0 && (
                                  <span className="text-[11px] font-normal" style={{color:'#CBD5E1'}}>—</span>
                                )}
                              </div>
                            </div>

                            {/* ── Alimentação ── */}
                            <div className="rounded-xl flex items-stretch" style={{background:'#FFF7ED', minHeight: 50}}>
                              <div className="flex items-center px-3 py-2.5 shrink-0" style={{minWidth: 112}}>
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-1">
                                    <Utensils className="w-2.5 h-2.5 shrink-0" style={{color:'#EA580C'}} />
                                    <span className="text-[9px] font-semibold uppercase tracking-[0.1em]" style={{color:'#EA580C'}}>Alimentação</span>
                                  </div>
                                  <span className="tabular-nums font-medium text-[14px] leading-none" style={{color:'#1E293B', letterSpacing:'-0.01em', textDecoration: isNotAttended ? 'line-through' : 'none'}}>{formatCurrency(budget.almocoSemana + budget.jantarSemana + budget.almocoFds + budget.jantarFds)}</span>
                                </div>
                              </div>
                              <div style={{width: 1, background: 'rgba(234,88,12,0.08)', margin: '9px 0'}} />
                              <div className="flex-1 flex flex-col justify-center gap-1 px-3 py-2.5">
                                {(budget.almocoSemana > 0 || budget.jantarSemana > 0) && (
                                  <div className="flex items-center justify-between gap-x-2">
                                    <span className="text-[11px] leading-tight font-normal flex-1" style={{color:'#94A3B8', minWidth:'fit-content'}}>Semana</span>
                                    <span className="font-normal tabular-nums text-[11px] leading-tight shrink-0 tracking-wide" style={{color:'#C2410C'}}>{formatCurrency(budget.almocoSemana + budget.jantarSemana)}</span>
                                  </div>
                                )}
                                {(budget.almocoFds > 0 || budget.jantarFds > 0) && (
                                  <div className="flex items-center justify-between gap-x-2">
                                    <span className="text-[11px] leading-tight font-normal flex-1" style={{color:'#94A3B8', minWidth:'fit-content'}}>Fim de semana</span>
                                    <span className="font-normal tabular-nums text-[11px] leading-tight shrink-0 tracking-wide" style={{color:'#C2410C'}}>{formatCurrency(budget.almocoFds + budget.jantarFds)}</span>
                                  </div>
                                )}
                                {budget.almocoSemana === 0 && budget.jantarSemana === 0 && budget.almocoFds === 0 && budget.jantarFds === 0 && (
                                  <span className="text-[11px] font-normal" style={{color:'#CBD5E1'}}>—</span>
                                )}
                              </div>
                            </div>

                            {/* ── Mobilidade ── */}
                            <div className="rounded-xl flex items-stretch" style={{background:'#F5F3FF', minHeight: 50}}>
                              <div className="flex items-center px-3 py-2.5 shrink-0" style={{minWidth: 112}}>
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-1">
                                    <Car className="w-2.5 h-2.5 shrink-0" style={{color:'#6d28d9'}} />
                                    <span className="text-[9px] font-semibold uppercase tracking-[0.1em]" style={{color:'#6d28d9'}}>Mobilidade</span>
                                  </div>
                                  <span className="tabular-nums font-medium text-[14px] leading-none" style={{color:'#1E293B', letterSpacing:'-0.01em', textDecoration: isNotAttended ? 'line-through' : 'none'}}>{formatCurrency(budget.mobilidade)}</span>
                                </div>
                              </div>
                              <div style={{width: 1, background: 'rgba(109,40,217,0.08)', margin: '9px 0'}} />
                              <div className="flex-1 flex flex-col justify-center gap-1 px-3 py-2.5">
                                {budget.mobilidadeIda > 0 && (
                                  <div className="flex items-center justify-between gap-x-2">
                                    <span className="text-[11px] leading-tight font-normal flex-1" style={{color:'#94A3B8', minWidth:'fit-content'}}>Ida</span>
                                    <span className="font-normal tabular-nums text-[11px] leading-tight shrink-0 tracking-wide" style={{color:'#6d28d9'}}>{formatCurrency(budget.mobilidadeIda)}</span>
                                  </div>
                                )}
                                {budget.mobilidadeVolta > 0 && (
                                  <div className="flex items-center justify-between gap-x-2">
                                    <span className="text-[11px] leading-tight font-normal flex-1" style={{color:'#94A3B8', minWidth:'fit-content'}}>Volta</span>
                                    <span className="font-normal tabular-nums text-[11px] leading-tight shrink-0 tracking-wide" style={{color:'#6d28d9'}}>{formatCurrency(budget.mobilidadeVolta)}</span>
                                  </div>
                                )}
                                {budget.mobilidadeIda === 0 && budget.mobilidadeVolta === 0 && (
                                  <span className="text-[11px] font-normal" style={{color:'#CBD5E1'}}>—</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* ── Rodapé Total ── */}
                      <div
                        className={`transition-all duration-500${isNotAttended ? ' opacity-30 grayscale' : ''}`}
                        style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '10px 16px',
                          background: isNotAttended ? '#F8FAFC' : '#F5F7FF',
                          borderTop: isNotAttended ? '1px solid #E2E8F0' : '1px solid rgba(224,231,255,0.8)',
                          marginTop: 'auto',
                        }}>
                        <span style={{fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: isNotAttended ? '#94A3B8' : '#C7D2FE'}}>
                          {isNotAttended ? 'Não contabilizado' : 'Total Planejado'}
                        </span>
                        <span style={{
                          fontSize: 16, fontWeight: 500, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums',
                          color: isNotAttended ? '#94A3B8' : '#0033CC',
                          textDecoration: isNotAttended ? 'line-through' : 'none',
                        }}>
                          {formatCurrency(budget.totalFinal)}
                        </span>
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
              <div className="px-6 pt-5 pb-5 relative" style={{background:'linear-gradient(135deg, #0033CC 0%, #1a4fd8 100%)'}}>
                {/* botão restaurar */}
                <button
                  onClick={restoreDefaults}
                  className="absolute top-4 right-10 flex items-center gap-1 text-[11px] font-semibold text-white/60 hover:text-white/90 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Restaurar
                </button>

                <div className="flex items-center gap-4">
                  {/* Avatar branco */}
                  <div className="w-12 h-12 rounded-[12px] flex items-center justify-center font-black text-[17px] shrink-0" style={{background:'rgba(255,255,255,0.15)', color:'#fff', border:'1.5px solid rgba(255,255,255,0.25)'}}>
                    {modalInitials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-[18px] font-bold text-white leading-tight">{editingBudgetInfo.name}</h2>
                    <p className="text-[12px] text-white/70 mt-0.5">{editingBudgetInfo.functionName}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-2.5">
                      <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md" style={{background:'rgba(255,255,255,0.15)', color:'#fff'}}>
                        {editingBudgetInfo.type}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-white/70">
                        <Calendar className="w-3 h-3" />
                        {editingBudgetInfo.period}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md" style={{background:'rgba(255,255,255,0.12)', color:'rgba(255,255,255,0.85)'}}>
                        <Briefcase className="w-3 h-3" />
                        {editingBudgetInfo.weekdays}d úteis
                      </span>
                      <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md" style={{background:'rgba(255,200,0,0.2)', color:'rgba(255,220,80,1)'}}>
                        <Sun className="w-3 h-3" />
                        {editingBudgetInfo.weekends} fds
                      </span>
                    </div>
                  </div>
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
              <div className="border-t border-slate-100 bg-white">
                {/* Faixa de total */}
                <div className="px-5 py-3 flex items-center justify-between" style={{background:'#EEF2FF'}}>
                  <div>
                    <div className="text-[9px] uppercase font-black tracking-widest" style={{color:'#0033CC80'}}>Total Planejado</div>
                    <div className="text-[24px] font-black leading-none mt-0.5 transition-all" style={{color:'#0033CC'}}>{formatCurrency(modalTotal)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] text-slate-400 leading-tight">
                      Diárias <span className="font-semibold text-slate-600">{formatCurrency(totalDiarias)}</span>
                    </div>
                    <div className="text-[9px] text-slate-400 mt-0.5 leading-tight">
                      Alimentação <span className="font-semibold text-slate-600">{formatCurrency(totalAlimentacao)}</span>
                    </div>
                    <div className="text-[9px] text-slate-400 mt-0.5 leading-tight">
                      Mobilidade <span className="font-semibold text-slate-600">{formatCurrency(editingBudget.mobilidade)}</span>
                    </div>
                    {hasChanges && (
                      <div className={`text-[10px] font-bold mt-1 ${diff > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                        {diff > 0 ? '▲' : '▼'} {formatCurrency(Math.abs(diff))} vs original
                      </div>
                    )}
                  </div>
                </div>
                {/* Botões */}
                <div className="px-5 py-3 flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    className="h-9 px-4 text-slate-500 hover:text-slate-700 rounded-lg text-sm"
                    onClick={() => { setEditingBudget(null); setEditingBudgetInfo(null); }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={saveEdit}
                    disabled={!hasChanges}
                    className="h-9 px-5 text-white font-semibold rounded-lg gap-2 text-sm"
                    style={{background:'#0033CC', boxShadow: hasChanges ? '0 4px 12px #0033CC40' : 'none'}}
                  >
                    <CheckCheck className="w-4 h-4" />
                    {hasChanges ? `Salvar (${diff > 0 ? '+' : ''}${formatCurrency(diff)})` : 'Salvar'}
                  </Button>
                </div>
              </div>
            </>
          );})()}
        </DialogContent>
      </Dialog>

      {/* ── Modal Envio em Lote ── */}
      <Dialog open={confirmSendOpen} onOpenChange={v => { if (!sendSelectedToActualMutation.isPending) setConfirmSendOpen(v); }}>
        <DialogContent className="max-w-sm p-0 gap-0 rounded-3xl overflow-hidden shadow-2xl" style={{border:'1px solid rgba(0,0,0,0.06)'}}>
          <DialogHeader className="sr-only"><DialogTitle>Enviar Planejamento</DialogTitle></DialogHeader>
          <div className="bg-white flex flex-col items-center px-6 pt-7 pb-6 gap-4"
            style={{animation:'modalIn 0.2s cubic-bezier(0.34,1.56,0.64,1) both'}}>
            {/* Ícone */}
            <div className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{background:'#EFF6FF', border:'1.5px solid #BFDBFE'}}>
              <Send style={{color:'#2563EB', width:20, height:20}} />
            </div>
            {/* Título */}
            <div className="text-center space-y-1">
              <h2 className="text-[15px] font-medium text-slate-800">Enviar Planejamento?</h2>
              <p className="text-[12px] font-normal text-slate-400">
                {selectedCards.size} {selectedCards.size === 1 ? 'colaborador selecionado' : 'colaboradores selecionados'}
              </p>
            </div>
            {/* Resumo */}
            <div className="w-full rounded-2xl overflow-hidden" style={{border:'1px solid #E2E8F0'}}>
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-400" />
                  <span className="text-[12px] font-normal text-slate-500">Colaboradores</span>
                </div>
                <span className="text-[13px] font-medium text-slate-700">{selectedCards.size} {selectedCards.size === 1 ? 'pessoa' : 'pessoas'}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3" style={{borderTop:'1px solid #F1F5F9', background:'#F8FAFF'}}>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-normal text-slate-500">Valor total</span>
                </div>
                <span className="text-[15px] font-medium" style={{color:'#2563EB'}}>{formatCurrency(totalSelecionado)}</span>
              </div>
            </div>
            {/* Mensagem */}
            <p className="text-center text-[13px] font-normal text-slate-400 leading-relaxed">
              As informações de custos e logística serão enviadas para aprovação. Deseja prosseguir?
            </p>
            {/* Botões */}
            <div className="flex gap-2 w-full pt-1">
              <button
                className="flex-1 h-10 rounded-xl text-[13px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                onClick={() => setConfirmSendOpen(false)}
                disabled={sendSelectedToActualMutation.isPending}
              >
                Voltar
              </button>
              <button
                className="flex-1 h-10 rounded-xl text-[13px] font-medium text-white flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-70"
                disabled={sendSelectedToActualMutation.isPending}
                onClick={() => sendSelectedToActualMutation.mutate()}
              >
                {sendSelectedToActualMutation.isPending ? (
                  <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Enviando...</>
                ) : (
                  <><Send className="w-3.5 h-3.5" />Enviar</>
                )}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal Salvar Planejamento Individual ── */}
      <Dialog open={!!confirmSendSingle} onOpenChange={v => { if (!sendToActualMutation.isPending) { if (!v) setConfirmSendSingle(null); } }}>
        <DialogContent className="max-w-sm p-0 gap-0 rounded-3xl overflow-hidden shadow-2xl" style={{border:'1px solid rgba(0,0,0,0.06)'}}>
          <DialogHeader className="sr-only"><DialogTitle>Salvar Planejamento</DialogTitle></DialogHeader>
          {confirmSendSingle && (() => {
            const isEdited = !!confirmSendSingle.hasOverride;
            return (
              <div className="bg-white flex flex-col items-center px-6 pt-7 pb-6 gap-4"
                style={{animation:'modalIn 0.2s cubic-bezier(0.34,1.56,0.64,1) both'}}>
                {/* Ícone: Save (editado) ou Send (envio direto) */}
                <div className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={isEdited
                    ? {background:'#EFF6FF', border:'1.5px solid #BFDBFE'}
                    : {background:'#ECFDF5', border:'1.5px solid #A7F3D0'}
                  }>
                  {isEdited
                    ? <Save style={{color:'#2563EB', width:20, height:20}} />
                    : <Send style={{color:'#059669', width:20, height:20}} />
                  }
                </div>
                {/* Título + colaborador */}
                <div className="text-center space-y-1">
                  <h2 className="text-[15px] font-medium text-slate-800">
                    {isEdited ? 'Salvar Planejamento?' : 'Enviar para o Realizado?'}
                  </h2>
                  <p className="text-[12px] font-normal text-slate-400">
                    {getCollaboratorName(confirmSendSingle.inclusion.collaboratorId)} · {getFunctionName(confirmSendSingle.inclusion.functionId)}
                  </p>
                </div>
                {/* Resumo de custos */}
                <div className="w-full rounded-2xl overflow-hidden" style={{border:'1px solid #E2E8F0'}}>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-[12px] font-normal text-slate-500">Diárias</span>
                    <span className="text-[12px] font-medium text-slate-600">{formatCurrency(confirmSendSingle.subtotalDiarias)}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3" style={{borderTop:'1px solid #F1F5F9'}}>
                    <span className="text-[12px] font-normal text-slate-500">Alimentação</span>
                    <span className="text-[12px] font-medium text-slate-600">{formatCurrency(confirmSendSingle.almocoSemana + confirmSendSingle.jantarSemana + confirmSendSingle.almocoFds + confirmSendSingle.jantarFds)}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3" style={{borderTop:'1px solid #F1F5F9'}}>
                    <span className="text-[12px] font-normal text-slate-500">Mobilidade</span>
                    <span className="text-[12px] font-medium text-slate-600">{formatCurrency(confirmSendSingle.mobilidade)}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3" style={{
                    borderTop:'1px solid #F1F5F9',
                    background: isEdited ? '#F8FAFF' : '#F0FDF4',
                  }}>
                    <span className="text-[12px] font-medium text-slate-600">Total planejado</span>
                    <span className="text-[15px] font-medium" style={{color: isEdited ? '#2563EB' : '#059669'}}>{formatCurrency(confirmSendSingle.totalFinal)}</span>
                  </div>
                </div>
                {/* Mensagem de apoio */}
                <p className="text-center text-[13px] font-normal text-slate-400 leading-relaxed">
                  {isEdited
                    ? 'As alterações nos custos e logística deste colaborador serão salvas. Você poderá enviar o lote completo para aprovação mais tarde.'
                    : 'Os valores calculados serão enviados diretamente para o Realizado. Esta ação não pode ser desfeita.'
                  }
                </p>
                {/* Botões */}
                <div className="flex gap-2 w-full pt-1">
                  <button
                    className="flex-1 h-10 rounded-xl text-[13px] font-medium text-slate-500 bg-transparent border border-slate-200 hover:bg-slate-50 transition-colors"
                    onClick={() => setConfirmSendSingle(null)}
                    disabled={sendToActualMutation.isPending}
                  >
                    {isEdited ? 'Continuar Editando' : 'Voltar'}
                  </button>
                  <button
                    className="flex-1 h-10 rounded-xl text-[13px] font-medium text-white flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-70"
                    style={{background: isEdited ? '#2563EB' : '#059669'}}
                    disabled={sendToActualMutation.isPending}
                    onClick={() => sendToActualMutation.mutate(confirmSendSingle as typeof calculatedBudgets[0])}
                  >
                    {sendToActualMutation.isPending ? (
                      <><RefreshCw className="w-3.5 h-3.5 animate-spin" />{isEdited ? 'Salvando...' : 'Enviando...'}</>
                    ) : isEdited ? (
                      <><Save className="w-3.5 h-3.5" />Confirmar e Salvar</>
                    ) : (
                      <><Send className="w-3.5 h-3.5" />Confirmar Envio</>
                    )}
                  </button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Modal de confirmação de restauração ── */}
      <Dialog open={!!restoreModal} onOpenChange={() => setRestoreModal(null)}>
        <DialogContent className="max-w-sm p-0 gap-0 rounded-3xl overflow-hidden shadow-2xl" style={{border:'1px solid rgba(0,0,0,0.06)'}}>
          <DialogHeader className="sr-only">
            <DialogTitle>Restaurar Planejamento</DialogTitle>
          </DialogHeader>
          {restoreModal && (
            <div className="bg-white flex flex-col items-center px-6 pt-7 pb-6 gap-4"
              style={{animation:'modalIn 0.2s cubic-bezier(0.34,1.56,0.64,1) both'}}>

              {/* Ícone — círculo azul claro */}
              <div className="w-11 h-11 rounded-full flex items-center justify-center"
                style={{background:'#EFF6FF', border:'1.5px solid #BFDBFE'}}>
                <Undo2 style={{color:'#2563EB', width:18, height:18}} />
              </div>

              {/* Título + subtítulo */}
              <div className="text-center space-y-1">
                <h2 className="text-[15px] font-medium text-slate-800 leading-snug">Restaurar Planejamento?</h2>
                <p className="text-[12px] font-normal" style={{color:'#94A3B8'}}>{restoreModal.name} · {restoreModal.functionName}</p>
                {restoreModal.startDate && restoreModal.endDate && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md mt-1"
                    style={{background:'#EFF6FF', fontSize:11, fontWeight:500, color:'#2563EB', border:'1px solid #BFDBFE'}}>
                    <Calendar style={{width:10, height:10}} />
                    {new Date(restoreModal.startDate+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
                    {' – '}
                    {new Date(restoreModal.endDate+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
                  </span>
                )}
              </div>

              {/* Texto explicativo */}
              <p className="text-center text-[13px] font-normal text-slate-400 leading-relaxed">
                Deseja incluir novamente este colaborador nos cálculos? Todos os valores de diárias, alimentação e mobilidade serão reativados.
              </p>

              {/* Botões */}
              <div className="flex gap-2 w-full pt-1">
                <button
                  className="flex-1 h-10 rounded-xl text-[13px] font-medium text-slate-600 bg-slate-100 transition-colors hover:bg-slate-200"
                  onClick={() => setRestoreModal(null)}
                >
                  Voltar
                </button>
                <button
                  className="flex-1 h-10 rounded-xl text-[13px] font-medium text-white flex items-center justify-center gap-1.5 transition-all disabled:opacity-60 bg-blue-600 hover:bg-blue-700"
                  onClick={() => {
                    toggleNotAttendedMutation.mutate({ id: restoreModal.id, reason: "" });
                    setRestoreModal(null);
                  }}
                  disabled={toggleNotAttendedMutation.isPending}
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  {toggleNotAttendedMutation.isPending ? 'Restaurando...' : 'Restaurar'}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!notAttendedModal} onOpenChange={() => { setNotAttendedModal(null); setNotAttendedReason(""); }}>
        <DialogContent className="max-w-sm p-0 gap-0 rounded-3xl overflow-hidden shadow-2xl" style={{border:'1px solid rgba(0,0,0,0.06)'}}>
          <DialogHeader className="sr-only">
            <DialogTitle>Confirmar Ausência</DialogTitle>
          </DialogHeader>

          {notAttendedModal && (
            <div className="bg-white flex flex-col items-center px-6 pt-7 pb-6 gap-4"
              style={{animation:'modalIn 0.2s cubic-bezier(0.34,1.56,0.64,1) both'}}>

              {/* Ícone centralizado — círculo rose claro */}
              <div className="w-11 h-11 rounded-full flex items-center justify-center"
                style={{background:'#FFF1F2', border:'1.5px solid #FECDD3'}}>
                <UserX className="w-4.5 h-4.5" style={{color:'#F43F5E', width:18, height:18}} />
              </div>

              {/* Título + subtítulo */}
              <div className="text-center space-y-1">
                <h2 className="text-[15px] font-medium text-slate-800 leading-snug">Confirmar Ausência?</h2>
                <p className="text-[12px] font-normal" style={{color:'#94A3B8'}}>{notAttendedModal.name} · {notAttendedModal.functionName}</p>
              </div>

              {/* Texto explicativo */}
              <p className="text-center text-[13px] font-normal text-slate-400 leading-relaxed">
                Você está marcando que este colaborador não participou deste evento. Os cálculos de diárias e custos associados serão removidos dos totais.
              </p>

              {/* Campo motivo */}
              <div className="w-full">
                <label className="text-[10px] font-medium uppercase tracking-widest text-slate-400 block mb-1.5">
                  Motivo <span className="normal-case tracking-normal font-normal text-slate-300">(opcional)</span>
                </label>
                <Textarea
                  className="w-full rounded-xl text-[13px] resize-none border-slate-200 focus:border-rose-300 focus:ring-2 focus:ring-rose-50 placeholder:text-slate-300"
                  value={notAttendedReason}
                  onChange={e => setNotAttendedReason(e.target.value)}
                  placeholder='Ex: "Desistência", "Problema de saúde", "Substituído"...'
                  rows={2}
                  autoFocus
                />
              </div>

              {/* Botões */}
              <div className="flex gap-2 w-full pt-1">
                <button
                  className="flex-1 h-10 rounded-xl text-[13px] font-medium text-slate-600 bg-slate-100 transition-colors hover:bg-slate-200"
                  onClick={() => { setNotAttendedModal(null); setNotAttendedReason(""); }}
                >
                  Voltar
                </button>
                <button
                  className="flex-1 h-10 rounded-xl text-[13px] font-medium text-white flex items-center justify-center gap-1.5 transition-all disabled:opacity-60 bg-rose-500 hover:bg-rose-600"
                  onClick={() => {
                    if (notAttendedModal.id) {
                      toggleNotAttendedMutation.mutate({ id: notAttendedModal.id, reason: notAttendedReason });
                    } else if (notAttendedModal.budget) {
                      createAndMarkNotAttendedMutation.mutate({ budget: notAttendedModal.budget, reason: notAttendedReason });
                    }
                  }}
                  disabled={toggleNotAttendedMutation.isPending || createAndMarkNotAttendedMutation.isPending}
                >
                  <UserX className="w-3.5 h-3.5" />
                  {(toggleNotAttendedMutation.isPending || createAndMarkNotAttendedMutation.isPending) ? 'Confirmando...' : 'Confirmar'}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Sticky Footer — Barra de Progresso do Envio ── */}
      {selectedEventId && calculatedBudgets.length > 0 && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 256,
          right: 0,
          zIndex: 40,
          background: 'rgba(255,255,255,0.82)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderTop: '1px solid rgba(226,232,240,0.7)',
          boxShadow: '0 -2px 20px rgba(0,0,0,0.05)',
        }}>
          <div style={{maxWidth: 1024, margin: '0 auto', padding: '9px 24px', display: 'flex', alignItems: 'center', gap: 24}}>

            {/* Esquerda: Total do Evento — label empilhado + valor */}
            <div style={{flexShrink: 0, paddingRight: 24, borderRight: '1px solid #E2E8F0'}}>
              <div style={{fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94A3B8', marginBottom: 3}}>
                Valor Total do Evento
              </div>
              <div style={{
                fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em',
                color: '#0033CC', fontVariantNumeric: 'tabular-nums',
                fontFeatureSettings: '"tnum"', lineHeight: 1,
              }}>
                {formatCurrency(totalGeral)}
              </div>
            </div>

            {/* Centro: progresso do envio */}
            <div style={{flex: 1}}>
              <div style={{display:'flex', alignItems:'center', gap: 10}}>
                <div style={{flex: 1, height: 4, borderRadius: 9999, overflow: 'hidden', background: 'rgba(226,232,240,0.8)'}}>
                  <div style={{
                    height: '100%', borderRadius: 9999,
                    transition: 'width 0.7s cubic-bezier(0.4, 0, 0.2, 1)',
                    width: `${stats.progressoEnvio}%`,
                    background: stats.progressoEnvio >= 100
                      ? '#059669'
                      : 'linear-gradient(90deg, #0033CC 0%, #4F7BF5 60%, #059669 100%)',
                    boxShadow: stats.progressoEnvio >= 100
                      ? '0 0 6px rgba(5,150,105,0.45)'
                      : 'none',
                  }} />
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 400, letterSpacing: '0.01em', whiteSpace: 'nowrap',
                  color: stats.progressoEnvio >= 100 ? '#059669' : '#94A3B8',
                }}>
                  {stats.enviados}/{stats.total}
                  {stats.progressoEnvio >= 100 && <span style={{marginLeft: 4}}>✓</span>}
                </span>
              </div>
            </div>

            {/* Direita: botão de ação */}
            {stats.progressoEnvio >= 100 ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 18px', borderRadius: 12,
                background: '#F0FDF4', border: '1px solid #BBF7D0', flexShrink: 0,
              }}>
                <CheckCheck className="w-4 h-4" style={{color:'#059669'}} />
                <span style={{fontSize: 13, fontWeight: 700, color: '#059669'}}>Todos Enviados</span>
              </div>
            ) : (
              <button
                onClick={() => selectedCards.size > 0 ? setConfirmSendOpen(true) : undefined}
                disabled={selectedCards.size === 0}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  height: 38, paddingLeft: 18, paddingRight: 18,
                  borderRadius: 12, border: 'none', cursor: selectedCards.size > 0 ? 'pointer' : 'not-allowed',
                  flexShrink: 0,
                  background: selectedCards.size > 0 ? '#059669' : '#E2E8F0',
                  color: selectedCards.size > 0 ? '#fff' : '#94A3B8',
                  boxShadow: selectedCards.size > 0 ? '0 4px 14px rgba(5,150,105,0.35)' : 'none',
                  fontSize: 13, fontWeight: 600,
                  transition: 'all 0.2s ease',
                  opacity: selectedCards.size === 0 ? 0.7 : 1,
                }}
              >
                <Send style={{width: 14, height: 14}} />
                {selectedCards.size > 0
                  ? `Enviar Planejamento (${selectedCards.size})`
                  : 'Selecione colaboradores'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
