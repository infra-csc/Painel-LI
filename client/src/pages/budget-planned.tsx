import { useState, useMemo, useEffect, useRef } from "react";
import { formatDias, formatDiarias, formatDiasUteis, formatFds, fixEncoding, parseBrNumber } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ActivityTimeline } from "@/components/activity-timeline";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Calculator, Users, Calendar, RefreshCw, Edit, Send, CheckCheck, Check, Car, Utensils, Coffee, Moon, Sun, Search, ArrowUpDown, Home, UserCheck, TrendingUp, DollarSign, Briefcase, ChevronDown, ChevronUp, BarChart3, RotateCcw, Lock, UserX, Undo2, Zap, Eye } from "lucide-react";
import { isRhOrAdmin } from "@/lib/permissions";
import { Textarea } from "@/components/ui/textarea";
import { EventSearchSelect } from "@/components/event-select";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Event, Function, Collaborator, TeamInclusion, FunctionValue, BudgetNote } from "@shared/schema";
import { isAtendimentoFunction, atendimentoDailyCents, mobilidadeTrechoCents } from "@shared/atendimento";
import { calcDeflatedDailies, deflationFactorsFromSettings } from "@shared/calculation-rules";
import { useAuth } from "@/hooks/use-auth";
import { useSearch } from "wouter";
import { BudgetChat, BudgetNotesBadge, BudgetNotesSnippet } from "@/components/budget-chat";

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

// Rascunho de edições persistido por evento — sobrevive a F5 e à troca de evento
const draftStorageKey = (eventId: string) => `budget-overrides-draft:${eventId}`;
function readDraft(eventId: string): Record<string, BudgetEdit> {
  if (!eventId) return {};
  try {
    const raw = localStorage.getItem(draftStorageKey(eventId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    // rascunho corrompido ou localStorage indisponível — começa vazio
    return {};
  }
}

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
  const [editingBudgetPlannedId, setEditingBudgetPlannedId] = useState<string | null>(null);
  const [budgetOverrides, setBudgetOverrides] = useState<Record<string, BudgetEdit>>(() => readDraft(selectedEventId));
  // Evento dono do rascunho em memória — impede salvar o rascunho de um evento
  // na chave de outro durante a troca de evento.
  const draftEventRef = useRef(selectedEventId);
  const [sentToActual, setSentToActual] = useState<Set<string>>(new Set());
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [confirmSendSingle, setConfirmSendSingle] = useState<CalculatedBudget | null>(null);
  const [inlineSendConfirm, setInlineSendConfirm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterFunction, setFilterFunction] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("name_asc");
  const [collapsedCards, setCollapsedCards] = useState<Set<string>>(new Set());
  const [notAttendedModal, setNotAttendedModal] = useState<{ id?: string; budget?: any; name: string; functionName: string } | null>(null);
  const [notAttendedReason, setNotAttendedReason] = useState("");
  const [activeTab, setActiveTab] = useState<'overview' | 'sheet'>('overview');
  const [isApplyingDefaults, setIsApplyingDefaults] = useState(false);
  const [modalTab, setModalTab] = useState<'custos' | 'observacoes' | 'historico'>('custos');
  const [modalViewMode, setModalViewMode] = useState(false);
  const [sheetInputValues, setSheetInputValues] = useState<Record<string, string>>({});
  const [confirmReset, setConfirmReset] = useState(false);
  const [batchPopover, setBatchPopover] = useState<{ field: 'vdia'|'alim'|'mob'; value: string; onlyPending: boolean } | null>(null);
  const [batchApplied, setBatchApplied] = useState<Set<'vdia'|'alim'|'mob'>>(new Set());
  const [batchHistory, setBatchHistory] = useState<{ fields: ('vdia'|'alim'|'mob')[]; prev: Record<string, any> } | null>(null);
  const batchPopoverRef = useRef<HTMLDivElement>(null);
  const [restoredFeedback, setRestoredFeedback] = useState<string | null>(null);
  const [restoreModal, setRestoreModal] = useState<{ id: string; name: string; functionName: string; startDate?: string; endDate?: string } | null>(null);
  const [subtotalOpenId, setSubtotalOpenId] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [advancedBatch, setAdvancedBatch] = useState<{
    target: 'all'|'casa'|'freela'|'selected';
    field: 'vdiaUtil'|'vdiaFds'|'alimUtil'|'alimFds'|'mob';
    value: string;
  } | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();

  const canEdit = user?.role === "admin" || user?.role === "production";
  const canMarkNotAttended = isRhOrAdmin(user);

  // Carrega o rascunho salvo ao trocar de evento
  useEffect(() => {
    if (draftEventRef.current === selectedEventId) return;
    draftEventRef.current = selectedEventId;
    setBudgetOverrides(readDraft(selectedEventId));
  }, [selectedEventId]);

  // Salva o rascunho a cada mudança, sempre na chave do evento dono do rascunho
  useEffect(() => {
    const eventId = draftEventRef.current;
    if (!eventId) return;
    try {
      if (Object.keys(budgetOverrides).length === 0) {
        localStorage.removeItem(draftStorageKey(eventId));
      } else {
        localStorage.setItem(draftStorageKey(eventId), JSON.stringify(budgetOverrides));
      }
    } catch {
      // localStorage cheio ou indisponível — o rascunho segue apenas em memória
    }
  }, [budgetOverrides]);

  // Remove do rascunho os itens já enviados com sucesso para o Realizado
  const clearDraftEntries = (ids: string[]) => {
    setBudgetOverrides(prev => {
      const next = { ...prev };
      ids.forEach(id => delete next[id]);
      return next;
    });
  };

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
  const { data: functionValues, isLoading: isLoadingFunctionValues, isError: isErrorFunctionValues, refetch: refetchFunctionValues } = useQuery<FunctionValue[]>({ queryKey: ["/api/function-values"] });
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

  const { data: eventNotes = [] } = useQuery<BudgetNote[]>({
    queryKey: ["/api/budget-notes/by-event", "planned", selectedEventId],
    queryFn: async () => {
      const res = await fetch(`/api/budget-notes/by-event?entityType=planned&eventId=${selectedEventId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch event notes");
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

  // Busca diretamente os eventos que têm escalação — sem carregar todas as escalações
  const { data: eventsWithInclusions } = useQuery<Event[]>({
    queryKey: ["/api/events-with-inclusions"],
  });

  const { data: teamInclusions, isLoading: isLoadingInclusions, isError: isErrorInclusions, refetch: refetchInclusions } = useQuery<TeamInclusion[]>({
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
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Math.round(cents) / 100);
  };

  // Maps id→nome pré-computados: os getters eram Array.find O(n) chamados
  // dentro do comparador de ordenação e por card, O(n²) com listas grandes.
  const collaboratorNamesById = useMemo(() => {
    const m = new Map<string, string>();
    collaborators?.forEach(c => m.set(c.id, fixEncoding(c.fullName) || "Não definido"));
    return m;
  }, [collaborators]);

  const functionNamesById = useMemo(() => {
    const m = new Map<string, string>();
    functions?.forEach(f => m.set(f.id, f.name));
    return m;
  }, [functions]);

  const getCollaboratorName = (id?: string | null) => {
    if (!id) return "Não definido";
    return collaboratorNamesById.get(id) || "Não definido";
  };

  const toTitleCase = (str: string) => {
    const lower = new Set(['de', 'da', 'das', 'do', 'dos', 'e', 'em', 'a', 'o', 'ao', 'aos']);
    return str.toLowerCase().split(' ').map((word, i) =>
      i === 0 || !lower.has(word) ? word.charAt(0).toUpperCase() + word.slice(1) : word
    ).join(' ');
  };

  const getFunctionName = (id?: string | null) => {
    if (!id) return "-";
    return functionNamesById.get(id) || "-";
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
      inc.status === "escalado" ||
      inc.status === "aprovacao" ||
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

      const ss = systemSettings as Record<string, number> | undefined;
      const collabIsCasa = collab?.type === 'casa' || collab?.type === 'local';
      
      // Daily rates: use type-specific function values for weekday/weekend
      // fv.dailyValue = casa weekday, fv.dailyValueWeekend = casa weekend
      // fv.dailyValueFreela = freela weekday, fv.dailyValueFreelaWeekend = freela weekend
      const fvAny = fv as any;
      const fvDailyWd = collabIsCasa ? (fvAny?.dailyValue ?? 0) : (fvAny?.dailyValueFreela ?? 0);
      const fvDailyWe = collabIsCasa ? (fvAny?.dailyValueWeekend ?? fvAny?.dailyValue ?? 0) : (fvAny?.dailyValueFreelaWeekend ?? fvAny?.dailyValueFreela ?? 0);

      const defaultDailyValueWeekday = collabIsCasa
        ? (ss?.default_daily_value_weekday ?? ss?.default_daily_value ?? 5000)
        : (ss?.default_daily_value_weekday_freela ?? ss?.default_daily_value_weekday ?? ss?.default_daily_value ?? 5000);
      const defaultDailyValueWeekend = collabIsCasa
        ? (ss?.default_daily_value_weekend ?? ss?.default_daily_value ?? 5000)
        : (ss?.default_daily_value_weekend_freela ?? ss?.default_daily_value_weekend ?? ss?.default_daily_value ?? 5000);

      const inclusionDailyValue = inclusion.dailyValue ?? defaultDailyValueWeekday;
      // Atendimento (Key Account x Executivo de Contas): a diária é plana (mesmo
      // valor útil e fds), definida pelo tipo escolhido na escalação e editável
      // no Valores Padrão. Tem prioridade sobre fv/inclusion/default — inclusive
      // corrige o dailyValue sujo de R$50/dia da grade antiga.
      const isAtend = isAtendimentoFunction(getFunctionName(inclusion.functionId));
      const atendVal = isAtend ? atendimentoDailyCents((inclusion as any).atendimentoTipo, ss) : null;
      // Diária FIXA por função — sem distinção útil/fds (decisão de negócio):
      // um único valor aplicado a todos os dias. Prioridade: override manual >
      // atendimento (tipo) > valor da função (útil, senão fds) > inclusão > default.
      const fvDaily = fvDailyWd > 0 ? fvDailyWd : (fvDailyWe > 0 ? fvDailyWe : 0);
      // Diária plana: enquanto o modal ainda mostra dois campos (útil/fds),
      // editar QUALQUER um deles vira o valor único — nada é ignorado.
      const valorDiaria = override?.valorDiaria ?? override?.valorDiariaUtil ?? override?.valorDiariaFds ?? atendVal
        ?? (fvDaily > 0 ? fvDaily : null) ?? inclusionDailyValue ?? defaultDailyValueWeekday;
      const valorDiariaUtil = valorDiaria;
      const valorDiariaFds = valorDiaria;
      
      // Deflação por período (slide): 100% até 4 dias, 90% do 5º ao 8º, 80% do
      // 9º em diante — fatores editáveis no Valores Padrão. Aplicada sobre a
      // diária plana, por contagem total de dias.
      const totalDiasDiaria = weekdays + weekends;
      const deflated = calcDeflatedDailies(valorDiaria, totalDiasDiaria, deflationFactorsFromSettings(ss));
      const subtotalDiarias = deflated.totalCents;
      // Distribui o total deflacionado entre útil/fds só para exibição (a diária
      // é plana; a deflação é por dia, não por útil/fds).
      const subtotalDiariasUtil = totalDiasDiaria > 0 ? Math.round(subtotalDiarias * weekdays / totalDiasDiaria) : 0;
      const subtotalDiariasFds = subtotalDiarias - subtotalDiariasUtil;
      
      // Food/mobility: use type-specific system defaults (casa or freela keys)
      const sysAlmSem = collabIsCasa
        ? (ss?.default_weekday_lunch ?? 3500)
        : (ss?.default_weekday_lunch_freela ?? ss?.default_weekday_lunch ?? 3500);
      const sysJanSem = collabIsCasa
        ? (ss?.default_weekday_dinner ?? 4000)
        : (ss?.default_weekday_dinner_freela ?? ss?.default_weekday_dinner ?? 4000);
      const sysAlmFds = collabIsCasa
        ? (ss?.default_weekend_lunch ?? 4000)
        : (ss?.default_weekend_lunch_freela ?? ss?.default_weekend_lunch ?? 4000);
      const sysJanFds = collabIsCasa
        ? (ss?.default_weekend_dinner ?? 4500)
        : (ss?.default_weekend_dinner_freela ?? ss?.default_weekend_dinner ?? 4500);
      // Mobilidade automatizada por horário de voo (slide "Ajuda de custo"):
      // R$58/trecho para voos de madrugada (parte 23h30–9h30 OU chega 20h–5h),
      // R$29/trecho caso contrário; 0 se a pessoa não voa (sem passagem).
      // Vale para casa e freela. No Planejado usamos os horários sugeridos da
      // escalação; o Realizado pode refinar com os horários reais da passagem.
      const voa = !!inclusion.needsTicket;
      const sysMobIda = voa ? mobilidadeTrechoCents(inclusion.flightDepartureSuggestedTime, inclusion.flightArrivalSuggestedTime) : 0;
      const sysMobVolta = voa ? mobilidadeTrechoCents(inclusion.flightReturnSuggestedTime, null) : 0;
      const sysMobTotal = sysMobIda + sysMobVolta;
      const sysMob = sysMobTotal;
      const mobilidade = override?.mobilidade ?? sysMob;
      const mobilidadeIda = override?.mobilidadeIda ?? sysMobIda;
      const mobilidadeVolta = override?.mobilidadeVolta ?? sysMobVolta;
      const almocoSemana = override?.almocoSemana ?? (sysAlmSem * weekdays);
      const jantarSemana = override?.jantarSemana ?? (sysJanSem * weekdays);
      const almocoFds = override?.almocoFds ?? (sysAlmFds * weekends);
      const jantarFds = override?.jantarFds ?? (sysJanFds * weekends);
      // unit values for tooltip display
      const unitAlmocoSemana = sysAlmSem;
      const unitJantarSemana = sysJanSem;
      const unitAlmocoFds = sysAlmFds;
      const unitJantarFds = sysJanFds;
      
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

  // Registros indexados por "colaborador|função" — evita .find() O(n) por card/linha.
  // O primeiro registro vence, preservando a semântica do Array.find original.
  const plannedByCollabFunc = useMemo(() => {
    const m = new Map<string, any>();
    (allBudgetPlanned || []).forEach((p: any) => {
      const key = `${p.collaboratorId}|${p.functionId}`;
      if (!m.has(key)) m.set(key, p);
    });
    return m;
  }, [allBudgetPlanned]);

  const actualsByCollabFunc = useMemo(() => {
    const m = new Map<string, any>();
    (existingActuals || []).forEach((a: any) => {
      if (a.splitParentId) return;
      const key = `${a.collaboratorId}|${a.functionId}`;
      if (!m.has(key)) m.set(key, a);
    });
    return m;
  }, [existingActuals]);

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
    // Mesmo denominador de `total` (só ativos) — incluir "não participou" aqui
    // impedia o progresso de chegar a 100%.
    const enviados = activeBudgets.filter(b => sentToActual.has(b.inclusion.id)).length;
    const progressoEnvio = total > 0 ? (enviados / total) * 100 : 0;
    
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
  }, [calculatedBudgets, searchTerm, filterFunction, filterType, sortBy, collaboratorNamesById, functionNamesById]);


  const [originalModalTotal, setOriginalModalTotal] = useState<number>(0);
  // Valores originais campo a campo — comparar só o total esconderia edições
  // que se compensam (ex.: +50 no almoço e -50 no jantar).
  const [originalModalValues, setOriginalModalValues] = useState<BudgetEdit | null>(null);
  const [defaultBudgetValues, setDefaultBudgetValues] = useState<BudgetEdit | null>(null);

  const openEditModal = (budget: typeof calculatedBudgets[0], viewMode = false) => {
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
    setOriginalModalValues(editVals);
    setOriginalModalTotal(budget.totalFinal);
    const planRec = allBudgetPlanned?.find(
      (p: any) => p.collaboratorId === budget.inclusion.collaboratorId && p.functionId === budget.inclusion.functionId
    );
    setEditingBudgetPlannedId(planRec?.id ?? null);
    setModalViewMode(viewMode);
    setModalTab('custos');
  };

  const saveEdit = () => {
    if (!editingBudget) return;
    setBudgetOverrides(prev => ({
      ...prev,
      [editingBudget.inclusionId]: editingBudget,
    }));
    setEditingBudget(null);
    setEditingBudgetPlannedId(null);
    toast({ title: "Valores ajustados", description: "As alterações serão aplicadas no envio para o Realizado." });
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
      clearDraftEntries([data.id]);
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
      const results: { id: string; result: any }[] = [];
      let failedCount = 0;
      for (const budget of toSend) {
        try {
          results.push(await savePlannedAndSendToActual(budget, "Enviado do planejado (lote)"));
        } catch {
          failedCount++;
        }
      }
      if (failedCount > 0) {
        // Propaga os sucessos parciais para o onError registrá-los mesmo com falhas
        throw Object.assign(new Error("Envio parcial"), { sent: results, failedCount });
      }
      return results;
    },
    onSuccess: (data) => {
      setSentToActual(prev => { const s = new Set(Array.from(prev)); data.forEach(d => s.add(d.id)); return s; });
      clearDraftEntries(data.map(d => d.id));
      setSelectedCards(new Set());
      setConfirmSendOpen(false);
      toast({ title: "Planejamento enviado com sucesso!", description: `${data.length} ${data.length === 1 ? 'colaborador enviado' : 'colaboradores enviados'} para o Realizado.` });
      qc.invalidateQueries({ queryKey: ["/api/budget-actual"] });
      qc.invalidateQueries({ queryKey: ["/api/budget-planned"] });
    },
    onError: (err) => {
      const sent = ((err as any)?.sent ?? []) as { id: string }[];
      const failedCount = ((err as any)?.failedCount ?? 0) as number;
      if (sent.length > 0) {
        // Sucessos parciais contam: marca como enviados e tira da seleção para
        // que uma nova tentativa reenvie apenas os que falharam.
        setSentToActual(prev => { const s = new Set(Array.from(prev)); sent.forEach(d => s.add(d.id)); return s; });
        clearDraftEntries(sent.map(d => d.id));
        setSelectedCards(prev => { const s = new Set(Array.from(prev)); sent.forEach(d => s.delete(d.id)); return s; });
        qc.invalidateQueries({ queryKey: ["/api/budget-actual"] });
        qc.invalidateQueries({ queryKey: ["/api/budget-planned"] });
      }
      toast({
        title: "Erro ao enviar",
        description: sent.length > 0
          ? `${sent.length} de ${sent.length + failedCount} enviados com sucesso; ${failedCount} ${failedCount === 1 ? 'falhou' : 'falharam'}. Tente novamente para reenviar os pendentes.`
          : "Não foi possível enviar para o Realizado.",
        variant: "destructive",
      });
    },
  });

  const pendingCount = calculatedBudgets.filter(b => !sentToActual.has(b.inclusion.id) && !notAttendedKeys.has(`${b.inclusion.collaboratorId}|${b.inclusion.functionId}`)).length;

  const handleApplyDefaults = async () => {
    setIsApplyingDefaults(true);
    try {
      const res = await apiRequest("POST", "/api/budget-planned/apply-defaults", {});
      const data = await res.json();
      const count = data.updated ?? 0;
      qc.invalidateQueries({ queryKey: ["/api/budget-planned"] });
      toast({
        title: count > 0 ? `${count} planejamento${count !== 1 ? 's' : ''} atualizado${count !== 1 ? 's' : ''}` : "Nenhum planejamento pendente",
        description: count > 0
          ? "Valores padrão aplicados aos orçamentos ainda não enviados."
          : "Todos os orçamentos já foram enviados ou não há registros pendentes.",
      });
    } catch {
      toast({ title: "Erro ao aplicar valores", variant: "destructive" });
    } finally {
      setIsApplyingDefaults(false);
    }
  };

  // Handler para edição inline na planilha
  const handleSheetEdit = (budget: CalculatedBudget, field: 'qtdDiarias' | 'valorDia' | 'valorDiaFds' | 'alimentacao' | 'alimentacaoUtil' | 'alimentacaoFds' | 'mobilidade', rawValue: string) => {
    const parsed = parseBrNumber(rawValue);
    // qtdDiarias é contagem de dias — não faz sentido fracionária. Antes o
    // parseFloat truncava na vírgula por acidente; agora é explícito.
    const val = field === 'qtdDiarias' ? Math.max(0, Math.round(parsed)) : parsed;
    const valCents = Math.round(val * 100);
    const existingOvr = budgetOverrides[budget.inclusion.id];

    const dias = Math.max(1, budget.qtdDiarias);

    // NÃO limpar o override quando o valor digitado coincide com o padrão.
    //
    // Antes, digitar um valor igual ao padrão calculado apagava o override e a
    // célula voltava sozinha ao valor de origem. O caso mais visível era zerar
    // um campo: valCents = 0 e, quando o padrão daquele campo também era 0, a
    // edição era descartada como "não mudou nada". Daí o relato de que os
    // valores de alimentação e mobilidade "não estabilizam" e voltam ao zerar.
    //
    // Zerar é uma decisão legítima do usuário e precisa ser gravada como
    // override. Para voltar ao padrão já existem três caminhos explícitos: o
    // ↩ de cada célula, o "Restaurar" da linha e o "Restaurar Padrão em Todos".

    const base: BudgetEdit = existingOvr || {
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
    const updated = { ...base };
    if (field === 'qtdDiarias') { updated.qtdDiarias = val; }
    else if (field === 'valorDia') { updated.valorDiariaUtil = valCents; }
    else if (field === 'valorDiaFds') { updated.valorDiariaFds = valCents; }
    else if (field === 'alimentacao') {
      // valCents é por dia → converter para total do período
      const totalCents = valCents * dias;
      const existingTotal = budget.almocoSemana + budget.jantarSemana + budget.almocoFds + budget.jantarFds;
      if (existingTotal === 0) {
        const q = Math.round(totalCents / 4);
        updated.almocoSemana = q; updated.jantarSemana = q; updated.almocoFds = q; updated.jantarFds = totalCents - q * 3;
      } else {
        // Resto do arredondamento vai no último componente para a soma bater
        // exatamente com o total digitado (mesma técnica dos ramos Útil/FDS).
        const f = totalCents / existingTotal;
        updated.almocoSemana = Math.round(budget.almocoSemana * f);
        updated.jantarSemana = Math.round(budget.jantarSemana * f);
        updated.almocoFds = Math.round(budget.almocoFds * f);
        updated.jantarFds = totalCents - updated.almocoSemana - updated.jantarSemana - updated.almocoFds;
      }
    } else if (field === 'alimentacaoUtil') {
      // valCents é por dia útil → propaga sobre almocoSemana + jantarSemana
      const totalCents = valCents * Math.max(1, budget.weekdays);
      const existingWd = budget.almocoSemana + budget.jantarSemana;
      if (existingWd === 0) {
        updated.almocoSemana = Math.round(totalCents / 2);
        updated.jantarSemana = totalCents - Math.round(totalCents / 2);
      } else {
        const f = totalCents / existingWd;
        updated.almocoSemana = Math.round(budget.almocoSemana * f);
        updated.jantarSemana = totalCents - Math.round(budget.almocoSemana * f);
      }
    } else if (field === 'alimentacaoFds') {
      // valCents é por dia de fim de semana → propaga sobre almocoFds + jantarFds
      const totalCents = valCents * Math.max(1, budget.weekends);
      const existingWe = budget.almocoFds + budget.jantarFds;
      if (existingWe === 0) {
        updated.almocoFds = Math.round(totalCents / 2);
        updated.jantarFds = totalCents - Math.round(totalCents / 2);
      } else {
        const f = totalCents / existingWe;
        updated.almocoFds = Math.round(budget.almocoFds * f);
        updated.jantarFds = totalCents - Math.round(budget.almocoFds * f);
      }
    } else if (field === 'mobilidade') {
      // valCents é o total (Ida + Volta) — não multiplica por dias
      updated.mobilidade = valCents;
      updated.mobilidadeIda = Math.round(valCents / 2);
      updated.mobilidadeVolta = valCents - Math.round(valCents / 2);
    }
    setBudgetOverrides(prev => ({ ...prev, [budget.inclusion.id]: updated }));
  };

  const applyBatchEdit = (field: 'vdia'|'alim'|'mob', rawValue: string, onlyPending: boolean) => {
    // Precisa do mesmo parser do handleSheetEdit: com parseFloat, um "0,50"
    // virava 0 e a edição em lote saía daqui sem aplicar nada, em silêncio.
    const val = parseBrNumber(rawValue);
    // Zerar é decisão legítima (ver comentário no handleSheetEdit) — rejeita
    // apenas negativo ou não numérico.
    if (!Number.isFinite(val) || val < 0) {
      toast({ title: "Valor inválido", description: "Informe um valor igual ou maior que zero.", variant: "destructive" });
      return;
    }
    const domainField = field === 'vdia' ? 'valorDia' : field === 'alim' ? 'alimentacao' : 'mobilidade';
    const prevOverrides = { ...budgetOverrides };
    const targets = filteredBudgets.filter(b => {
      const isSent = sentToActual.has(b.inclusion.id);
      const isNotAttended = isCardNotAttended(b);
      if (isNotAttended) return false;
      if (onlyPending && isSent) return false;
      return true;
    });
    targets.forEach(b => handleSheetEdit(b, domainField as any, rawValue));
    setBatchApplied(prev => { const next = new Set(prev); next.add(field); return next; });
    setBatchHistory({ fields: [field], prev: prevOverrides });
  };

  const undoBatch = () => {
    if (!batchHistory) return;
    setBudgetOverrides(batchHistory.prev);
    setBatchApplied(prev => {
      const next = new Set(prev);
      batchHistory.fields.forEach(f => next.delete(f));
      return next;
    });
    setBatchHistory(null);
  };

  const applyAdvancedBatch = () => {
    if (!advancedBatch) return;
    const { target, field, value } = advancedBatch;
    // Mesmo motivo do applyBatchEdit: guarda precisa entender vírgula e
    // aceitar zero — rejeita apenas negativo ou não numérico.
    const val = parseBrNumber(value);
    if (!Number.isFinite(val) || val < 0) {
      toast({ title: "Valor inválido", description: "Informe um valor igual ou maior que zero.", variant: "destructive" });
      return;
    }
    const domainField =
      field === 'vdiaUtil' ? 'valorDia' :
      field === 'vdiaFds' ? 'valorDiaFds' :
      field === 'alimUtil' ? 'alimentacaoUtil' :
      field === 'alimFds' ? 'alimentacaoFds' : 'mobilidade';
    const targets = filteredBudgets.filter(b => {
      if (isCardNotAttended(b)) return false;
      if (sentToActual.has(b.inclusion.id)) return false;
      const isCasa = b.collaborator?.type === 'casa' || b.collaborator?.type === 'local';
      if (target === 'casa' && !isCasa) return false;
      if (target === 'freela' && isCasa) return false;
      if (target === 'selected' && !selectedRows.has(b.inclusion.id)) return false;
      return true;
    });
    if (targets.length === 0) return;
    const prevOverrides = { ...budgetOverrides };
    targets.forEach(b => handleSheetEdit(b, domainField as any, value));
    // Marca o flag do campo realmente editado — antes era sempre 'vdia',
    // mesmo em edições de alimentação/mobilidade.
    const batchFlag: 'vdia' | 'alim' | 'mob' =
      field === 'vdiaUtil' || field === 'vdiaFds' ? 'vdia' :
      field === 'mob' ? 'mob' : 'alim';
    setBatchApplied(prev => { const next = new Set(prev); next.add(batchFlag); return next; });
    setBatchHistory({ fields: [batchFlag], prev: prevOverrides });
    setAdvancedBatch(null);
    toast({ title: `Lote aplicado`, description: `${targets.length} colaborador${targets.length !== 1 ? 'es' : ''} atualizados` });
  };

  // Close batch popover on outside click
  useEffect(() => {
    if (!batchPopover) return;
    const handler = (e: MouseEvent) => {
      if (batchPopoverRef.current && !batchPopoverRef.current.contains(e.target as Node)) {
        setBatchPopover(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [batchPopover]);

  useEffect(() => {
    if (!subtotalOpenId) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const popover = document.getElementById(`subtotal-popover-${subtotalOpenId}`);
      if (popover && !popover.contains(target)) {
        setSubtotalOpenId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [subtotalOpenId]);

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
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          {isRhOrAdmin(user) && (
            <button
              onClick={handleApplyDefaults}
              disabled={isApplyingDefaults}
              title="Aplica os valores padrão configurados em Sistema a todos os orçamentos ainda não enviados"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 13px', borderRadius: 9, fontSize: 12, fontWeight: 600,
                border: '1.5px solid #D1D5DB', background: '#fff',
                color: isApplyingDefaults ? '#9CA3AF' : '#374151',
                cursor: isApplyingDefaults ? 'not-allowed' : 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)', whiteSpace: 'nowrap',
                transition: 'all .15s',
              }}
              onMouseEnter={e => { if (!isApplyingDefaults) { (e.currentTarget as HTMLElement).style.borderColor = '#3B4FE4'; (e.currentTarget as HTMLElement).style.color = '#3B4FE4'; } }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#D1D5DB'; (e.currentTarget as HTMLElement).style.color = isApplyingDefaults ? '#9CA3AF' : '#374151'; }}
            >
              <RefreshCw style={{ width: 13, height: 13, animation: isApplyingDefaults ? 'spin 1s linear infinite' : 'none' }} />
              {isApplyingDefaults ? 'Atualizando...' : 'Atualizar padrões'}
            </button>
          )}
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
              // Etapa derivada do progresso real: com tudo enviado, o RH concluiu
              // o planejamento e a bola passa para a Prestação.
              const currentStep = stats.total > 0 && stats.progressoEnvio >= 100 ? 2 : 1;
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
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="rounded-2xl bg-white cursor-default" style={{borderTop:'3px solid #3B82F6', boxShadow:'0 1px 8px rgba(0,0,0,0.05)'}}>
                      <div className="px-5 py-4 pb-4">
                        <div className="flex items-center gap-2.5 mb-3">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{background:'rgba(37,99,235,0.08)'}}>
                            <Home style={{width:13, height:13, color:'#2563EB'}} />
                          </div>
                          <span style={{fontSize:9, fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:'#94A3B8'}}>Casa</span>
                        </div>
                        <div style={{fontSize:17, fontWeight:500, color:'#2563EB', letterSpacing:'-0.02em', fontVariantNumeric:'tabular-nums', lineHeight:1}}>
                          {formatCurrency(stats.valorCasa)}
                        </div>
                        <div className="flex items-center gap-1 mt-2">
                          <span style={{fontSize:10, color:'#94A3B8', fontWeight:400}}>{stats.totalCasa} colaborador{stats.totalCasa !== 1 ? 'es' : ''}</span>
                        </div>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-[180px] text-center">Colaboradores que trabalham no próprio estado</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Freela */}
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="rounded-2xl bg-white cursor-default" style={{borderTop:'3px solid #F97316', boxShadow:'0 1px 8px rgba(0,0,0,0.05)'}}>
                      <div className="px-5 py-4 pb-4">
                        <div className="flex items-center gap-2.5 mb-3">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{background:'rgba(234,88,12,0.08)'}}>
                            <UserCheck style={{width:13, height:13, color:'#EA580C'}} />
                          </div>
                          <span style={{fontSize:9, fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:'#94A3B8'}}>Freela</span>
                        </div>
                        <div style={{fontSize:17, fontWeight:500, color:'#EA580C', letterSpacing:'-0.02em', fontVariantNumeric:'tabular-nums', lineHeight:1}}>
                          {formatCurrency(stats.valorFreela)}
                        </div>
                        <div className="flex items-center gap-1 mt-2">
                          <span style={{fontSize:10, color:'#94A3B8', fontWeight:400}}>{stats.totalFreela} colaborador{stats.totalFreela !== 1 ? 'es' : ''}</span>
                        </div>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-[180px] text-center">Colaboradores contratados por evento</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Médio / Pessoa */}
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="rounded-2xl bg-white cursor-default" style={{borderTop:'3px solid #7C3AED', boxShadow:'0 1px 8px rgba(0,0,0,0.05)'}}>
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
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-[180px] text-center">Média de custo por colaborador neste evento</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Médio / Dia */}
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="rounded-2xl bg-white cursor-default" style={{borderTop:'3px solid #0D9488', boxShadow:'0 1px 8px rgba(0,0,0,0.05)'}}>
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
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-[180px] text-center">Média de custo por dia trabalhado neste evento</TooltipContent>
                </Tooltip>
              </TooltipProvider>

            </div>

            {/* ── Seletor de Abas ── */}
            <div className="flex items-center gap-1 border-b border-slate-100">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px ${activeTab === 'overview' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              >
                Visão Geral
              </button>
              <button
                onClick={() => setActiveTab('sheet')}
                className={`px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px ${activeTab === 'sheet' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              >
                Planilha de Edição
              </button>
            </div>

            {activeTab === 'overview' ? (<>
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
            ) : (isErrorInclusions || isErrorFunctionValues) ? (
              <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
                <RefreshCw className="w-16 h-16 text-gray-200 dark:text-gray-700 mb-4" />
                <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300">Erro ao carregar os dados</h3>
                <p className="text-sm text-gray-400 mt-1">Não foi possível buscar as escalações deste evento</p>
                <Button
                  variant="outline"
                  className="mt-4 gap-2"
                  onClick={() => { if (isErrorInclusions) refetchInclusions(); if (isErrorFunctionValues) refetchFunctionValues(); }}
                >
                  <RefreshCw className="w-4 h-4" />
                  Tentar novamente
                </Button>
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
                  const collabFuncKey = `${budget.inclusion.collaboratorId}|${budget.inclusion.functionId}`;
                  const planRecord = plannedByCollabFunc.get(collabFuncKey);
                  const isNotAttended = !!planRecord?.didNotAttend;
                  const cardActual = actualsByCollabFunc.get(collabFuncKey);
                  
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
                              <span className="font-medium text-slate-800 text-[14px] truncate">{name}</span>
                              {budget.hasOverride && (
                                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Valores personalizados" />
                              )}
                              {cardActual?.rhAdjusted && (
                                <TooltipProvider delayDuration={200}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="text-[12px] shrink-0 cursor-default" style={{color:'#D97706'}}>✏</span>
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="text-xs">RH ajustou o realizado deste colaborador</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
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
                          {isSent && (
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" onClick={() => openEditModal(budget, true)}>
                                    <Eye className="w-3.5 h-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="text-xs">Visualizar detalhes e observações</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          {!isSent && (
                            <Button 
                              variant="ghost" size="icon" 
                              className="h-8 w-8 rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              title="Enviar para o Realizado"
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
                      {planRecord && eventNotes.length > 0 && (
                        <div className="px-4 pb-2 flex flex-col gap-1">
                          <BudgetNotesBadge notes={eventNotes} entityId={planRecord.id} />
                          <BudgetNotesSnippet notes={eventNotes} entityId={planRecord.id} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            </>) : (
            <>
              {/* ── Planilha de Edição ── */}
              {/* Toolbar */}
              <div className="flex items-center justify-between px-1 py-1">
                <span className="text-[11px] text-slate-400 font-medium">{filteredBudgets.length} colaborador{filteredBudgets.length !== 1 ? 'es' : ''}</span>
                {confirmReset ? (
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-slate-500">Isso substituirá todos os valores. Confirmar?</span>
                    <button
                      onClick={() => {
                        setBudgetOverrides(prev => {
                          const updated = { ...prev };
                          filteredBudgets.forEach(b => { delete updated[b.inclusion.id]; });
                          return updated;
                        });
                        setConfirmReset(false);
                      }}
                      className="px-2.5 py-1 rounded-md bg-[#0033CC] text-white font-semibold text-[11px] hover:bg-[#0022aa] transition-colors"
                    >
                      Sim, aplicar
                    </button>
                    <button
                      onClick={() => setConfirmReset(false)}
                      className="px-2.5 py-1 rounded-md border border-slate-200 text-slate-500 font-medium text-[11px] hover:bg-slate-50 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAdvancedBatch({ target: 'all', field: 'vdiaUtil', value: '' })}
                      className="text-[11px] px-3 py-1.5 rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 transition-colors flex items-center gap-1.5 font-medium"
                    >
                      ✏ Edição em Lote
                    </button>
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => setConfirmReset(true)}
                            className="text-[11px] px-3 py-1.5 rounded-lg text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-100 transition-colors flex items-center gap-1.5 font-medium"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Restaurar Padrão em Todos
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="text-xs max-w-[240px] text-center">
                          Limpa todos os ajustes manuais e recalcula automaticamente: identifica se o colaborador é Casa ou Freela, usa os valores da função (Útil/FDS) e os defaults do sistema
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )}
              </div>

              {/* Advanced Batch Modal */}
              {advancedBatch && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" style={{background:'rgba(0,0,0,0.35)'}}>
                  <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 w-[420px] max-w-[95vw]">
                    <div className="flex items-center justify-between mb-5">
                      <span className="text-[15px] font-bold text-slate-800">Edição em Lote</span>
                      <button onClick={() => setAdvancedBatch(null)} className="text-slate-400 hover:text-slate-600">✕</button>
                    </div>
                    {/* Target */}
                    <div className="mb-4">
                      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Quem será afetado</div>
                      <div className="grid grid-cols-2 gap-2">
                        {(['all','casa','freela','selected'] as const).map(t => (
                          <button key={t} onClick={() => setAdvancedBatch(p => p ? {...p, target: t} : p)}
                            className={`text-[12px] px-3 py-2 rounded-lg border font-medium transition-colors ${advancedBatch.target === t ? 'border-[#0033CC] bg-blue-50 text-[#0033CC]' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                            {t === 'all' ? 'Todos' : t === 'casa' ? 'Somente CASA' : t === 'freela' ? 'Somente FREELA' : `Selecionados (${selectedRows.size})`}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Field */}
                    <div className="mb-4">
                      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">O que alterar</div>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          ['vdiaUtil','Diária Útil','#2563EB'],
                          ['vdiaFds','Diária FDS','#F97316'],
                          ['alimUtil','Alimentação Útil','#2563EB'],
                          ['alimFds','Alimentação FDS','#F97316'],
                          ['mob','Mobilidade','#6D28D9'],
                        ] as const).map(([f, label, color]) => (
                          <button key={f} onClick={() => setAdvancedBatch(p => p ? {...p, field: f} : p)}
                            className={`text-[12px] px-3 py-2 rounded-lg border font-medium transition-colors text-left ${advancedBatch.field === f ? 'border-current' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                            style={advancedBatch.field === f ? {borderColor: color, background:'#F8FAFC', color} : {}}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Value */}
                    <div className="mb-5">
                      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Novo valor (R$/dia)</div>
                      <div className="flex items-center gap-2 border border-slate-300 rounded-lg px-3 py-2 focus-within:border-[#0033CC] focus-within:shadow-[0_0_0_2px_rgba(0,51,204,0.1)]">
                        <span className="text-slate-400 text-sm font-medium">R$</span>
                        <input
                          type="text" inputMode="decimal" placeholder="0,00"
                          value={advancedBatch.value}
                          onChange={e => setAdvancedBatch(p => p ? {...p, value: e.target.value} : p)}
                          onKeyDown={e => { if (e.key === 'Enter') applyAdvancedBatch(); }}
                          autoFocus
                          className="flex-1 text-right text-[14px] font-mono font-semibold outline-none bg-transparent text-slate-800"
                        />
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => setAdvancedBatch(null)} className="flex-1 h-10 text-[13px] border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 font-medium transition-colors">Cancelar</button>
                      <button onClick={applyAdvancedBatch}
                        className="flex-1 h-10 text-[13px] rounded-xl text-white font-bold transition-colors"
                        style={{background:'#0033CC'}}>
                        Aplicar Ajuste
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tabela */}
              {(() => {
                const colSpanTotal = 7;

                return (
                <div ref={batchPopoverRef} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-200">
                          {/* Checkbox select-all */}
                          <th className="w-10 px-3 py-2.5 bg-slate-50/80">
                            <Checkbox
                              checked={filteredBudgets.length > 0 && filteredBudgets.every(b => selectedRows.has(b.inclusion.id))}
                              onCheckedChange={v => {
                                setSelectedRows(v
                                  ? new Set(filteredBudgets.filter(b => !sentToActual.has(b.inclusion.id)).map(b => b.inclusion.id))
                                  : new Set()
                                );
                              }}
                              className="w-3.5 h-3.5"
                            />
                          </th>
                          {/* Colaborador / Função / Período */}
                          <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] min-w-[260px] bg-slate-50/80" style={{color:'#888'}}>Colaborador · Função · Período</th>

                          {/* Diárias (qty) — read-only */}
                          <th className="text-center px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] w-20" style={{background:'#F1F5F9', color:'#94A3B8'}}>
                            <div className="flex items-center justify-center gap-1">
                              <Lock style={{width:10, height:10, color:'#CBD5E1', flexShrink:0}} />
                              <span>Dias</span>
                            </div>
                          </th>

                          {/* Diária R$/dia — batch edit */}
                          <th className="text-right px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] w-36 relative" style={{background:'#F8FAFC', color:'#374151'}}>
                            <div className="flex items-center justify-end gap-1">
                              <div className="flex flex-col items-end leading-tight gap-0.5">
                                <span className="text-[11px] font-semibold text-slate-600">Diária R$/dia</span>
                                <div className="flex items-center gap-2 text-[9px] font-medium" style={{color:'#94A3B8'}}>
                                  <span><span className="inline-block w-1.5 h-1.5 rounded-full mr-0.5" style={{background:'#2563EB', verticalAlign:'middle'}} />Útil</span>
                                  <span><span className="inline-block w-1.5 h-1.5 rounded-full mr-0.5" style={{background:'#F97316', verticalAlign:'middle'}} />FDS</span>
                                </div>
                              </div>
                              <button
                                onClick={() => setBatchPopover(batchPopover?.field === 'vdia' ? null : { field: 'vdia', value: '', onlyPending: true })}
                                className={`text-[10px] transition-colors cursor-pointer ${batchApplied.has('vdia') ? 'text-[#3B4FE4]' : 'text-slate-300 hover:text-slate-500'}`}
                                title="Editar em lote"
                              >✏</button>
                            </div>
                            {batchPopover?.field === 'vdia' && (
                              <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl border border-slate-200 shadow-xl p-3 w-56 text-left" style={{minWidth:'220px'}}>
                                <div className="text-[11px] font-semibold text-slate-600 mb-2">Aplicar R$/dia para todos</div>
                                <input
                                  type="text" inputMode="decimal" placeholder="0,00"
                                  value={batchPopover.value}
                                  onChange={e => setBatchPopover(p => p ? {...p, value: e.target.value} : p)}
                                  autoFocus
                                  className="w-full h-8 border border-slate-200 rounded-md px-2 text-right text-[12px] font-mono outline-none focus:border-[#3B4FE4] focus:shadow-[0_0_0_2px_rgba(59,79,228,0.12)] mb-2"
                                />
                                <label className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-3 cursor-pointer">
                                  <Checkbox checked={batchPopover.onlyPending} onCheckedChange={v => setBatchPopover(p => p ? {...p, onlyPending: !!v} : p)} className="w-3.5 h-3.5" />
                                  Apenas Pendentes
                                </label>
                                <div className="flex gap-2">
                                  <button onClick={() => setBatchPopover(null)} className="flex-1 h-7 text-[11px] border border-slate-200 rounded-md text-slate-500 hover:bg-slate-50 transition-colors">Cancelar</button>
                                  <button onClick={() => { applyBatchEdit('vdia', batchPopover.value, batchPopover.onlyPending); setBatchPopover(null); }} className="flex-1 h-7 text-[11px] rounded-md text-white font-semibold" style={{background:'#3B4FE4'}}>Aplicar</button>
                                </div>
                              </div>
                            )}
                          </th>

                          {/* Alim. R$/dia — batch edit */}
                          <th className="text-right px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] w-36 relative" style={{background:'#F8FAFC', color:'#374151'}}>
                            <div className="flex items-center justify-end gap-1">
                              <div className="flex flex-col items-end leading-tight gap-0.5">
                                <span className="text-[11px] font-semibold text-slate-600">Alim. R$/dia</span>
                                <div className="flex items-center gap-2 text-[9px] font-medium" style={{color:'#94A3B8'}}>
                                  <span><span className="inline-block w-1.5 h-1.5 rounded-full mr-0.5" style={{background:'#2563EB', verticalAlign:'middle'}} />Útil</span>
                                  <span><span className="inline-block w-1.5 h-1.5 rounded-full mr-0.5" style={{background:'#F97316', verticalAlign:'middle'}} />FDS</span>
                                </div>
                              </div>
                              <button
                                onClick={() => setBatchPopover(batchPopover?.field === 'alim' ? null : { field: 'alim', value: '', onlyPending: true })}
                                className={`text-[10px] transition-colors cursor-pointer ${batchApplied.has('alim') ? 'text-[#3B4FE4]' : 'text-slate-300 hover:text-slate-500'}`}
                                title="Editar em lote"
                              >✏</button>
                            </div>
                            {batchPopover?.field === 'alim' && (
                              <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl border border-slate-200 shadow-xl p-3 w-56 text-left" style={{minWidth:'220px'}}>
                                <div className="text-[11px] font-semibold text-slate-600 mb-2">Alim. R$/dia — aplicar para todos</div>
                                <input
                                  type="text" inputMode="decimal" placeholder="0,00"
                                  value={batchPopover.value}
                                  onChange={e => setBatchPopover(p => p ? {...p, value: e.target.value} : p)}
                                  autoFocus
                                  className="w-full h-8 border border-slate-200 rounded-md px-2 text-right text-[12px] font-mono outline-none focus:border-[#3B4FE4] focus:shadow-[0_0_0_2px_rgba(59,79,228,0.12)] mb-2"
                                />
                                <label className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-3 cursor-pointer">
                                  <Checkbox checked={batchPopover.onlyPending} onCheckedChange={v => setBatchPopover(p => p ? {...p, onlyPending: !!v} : p)} className="w-3.5 h-3.5" />
                                  Apenas Pendentes
                                </label>
                                <div className="flex gap-2">
                                  <button onClick={() => setBatchPopover(null)} className="flex-1 h-7 text-[11px] border border-slate-200 rounded-md text-slate-500 hover:bg-slate-50 transition-colors">Cancelar</button>
                                  <button onClick={() => { applyBatchEdit('alim', batchPopover.value, batchPopover.onlyPending); setBatchPopover(null); }} className="flex-1 h-7 text-[11px] rounded-md text-white font-semibold" style={{background:'#3B4FE4'}}>Aplicar</button>
                                </div>
                              </div>
                            )}
                          </th>

                          {/* Mobilidade — batch edit */}
                          <th className="text-right px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] w-28 relative" style={{background:'#F8FAFC', color:'#374151'}}>
                              <div className="flex items-center justify-end gap-1">
                                <span className="text-slate-600">Mob. R$ total</span>
                                <button
                                  onClick={() => setBatchPopover(batchPopover?.field === 'mob' ? null : { field: 'mob', value: '', onlyPending: true })}
                                  className={`text-[10px] transition-colors cursor-pointer ${batchApplied.has('mob') ? 'text-[#3B4FE4]' : 'text-slate-300 hover:text-slate-500'}`}
                                  title="Editar em lote"
                                >✏</button>
                              </div>
                              {batchPopover?.field === 'mob' && (
                                <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl border border-slate-200 shadow-xl p-3 w-56 text-left" style={{minWidth:'220px'}}>
                                  <div className="text-[11px] font-semibold text-slate-600 mb-2">Mob. R$/dia — aplicar para todos</div>
                                  <input
                                    type="text" inputMode="decimal" placeholder="0,00"
                                    value={batchPopover.value}
                                    onChange={e => setBatchPopover(p => p ? {...p, value: e.target.value} : p)}
                                    autoFocus
                                    className="w-full h-8 border border-slate-200 rounded-md px-2 text-right text-[12px] font-mono outline-none focus:border-[#3B4FE4] focus:shadow-[0_0_0_2px_rgba(59,79,228,0.12)] mb-2"
                                  />
                                  <label className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-3 cursor-pointer">
                                    <Checkbox checked={batchPopover.onlyPending} onCheckedChange={v => setBatchPopover(p => p ? {...p, onlyPending: !!v} : p)} className="w-3.5 h-3.5" />
                                    Apenas Pendentes
                                  </label>
                                  <div className="flex gap-2">
                                    <button onClick={() => setBatchPopover(null)} className="flex-1 h-7 text-[11px] border border-slate-200 rounded-md text-slate-500 hover:bg-slate-50 transition-colors">Cancelar</button>
                                    <button onClick={() => { applyBatchEdit('mob', batchPopover.value, batchPopover.onlyPending); setBatchPopover(null); }} className="flex-1 h-7 text-[11px] rounded-md text-white font-semibold" style={{background:'#3B4FE4'}}>Aplicar</button>
                                  </div>
                                </div>
                              )}
                            </th>
                          <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] w-28 bg-blue-50/60 text-[#3B4FE4]">Subtotal</th>
                        </tr>

                        {/* Banner de edição em lote */}
                        {batchApplied.size > 0 && (
                          <tr>
                            <td colSpan={colSpanTotal} style={{background:'#EEF2FF', padding:'4px 16px'}}>
                              <div className="flex items-center gap-2 text-[11px]" style={{color:'#3B4FE4'}}>
                                <span>✏ {Array.from(batchApplied).map(f => f === 'vdia' ? 'R$/dia' : f === 'alim' ? 'Alimentação' : 'Mobilidade').join(' e ')} editado{batchApplied.size > 1 ? 's' : ''} em lote</span>
                                {batchHistory && (
                                  <>
                                    <span style={{color:'#a5b4fc'}}>·</span>
                                    <button onClick={undoBatch} className="cursor-pointer font-semibold px-2 py-0.5 rounded text-[10px] transition-colors hover:opacity-80" style={{background:'#3B4FE4', color:'#fff'}}>Desfazer</button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredBudgets.length === 0 ? (
                          <tr>
                            <td colSpan={colSpanTotal} className="px-4 py-12 text-center text-sm text-slate-400">Nenhum colaborador encontrado</td>
                          </tr>
                        ) : filteredBudgets.map((budget, rowIdx) => {
                          const isSent = sentToActual.has(budget.inclusion.id);
                          const isNotAttended = isCardNotAttended(budget);
                          const hasOvr = budget.hasOverride;
                          const name = getCollaboratorName(budget.inclusion.collaboratorId);
                          const funcName = getFunctionName(budget.inclusion.functionId);
                          const prevBudgetCollab = rowIdx > 0 ? filteredBudgets[rowIdx - 1].inclusion.collaboratorId : null;
                          const isNewCollab = prevBudgetCollab !== budget.inclusion.collaboratorId;
                          const isCasaTypeHdr = budget.collaborator?.type === 'casa' || budget.collaborator?.type === 'local';
                          const foodTotal = (budget.almocoSemana + budget.jantarSemana + budget.almocoFds + budget.jantarFds) / 100;
                          const foodPerDay = foodTotal / Math.max(1, budget.qtdDiarias);
                          const mobTotal = budget.mobilidade / 100;
                          const disabled = isSent || isNotAttended;
                          const matchingActual = actualsByCollabFunc.get(`${budget.inclusion.collaboratorId}|${budget.inclusion.functionId}`);
                          const sid = budget.inclusion.id;
                          const prevBudget = rowIdx > 0 ? filteredBudgets[rowIdx - 1] : null;
                          const isSameCollab = prevBudget?.inclusion.collaboratorId === budget.inclusion.collaboratorId;
                          const buf = (field: string, fallback: string) =>
                            sheetInputValues[`${sid}:${field}`] ?? fallback;
                          const setbuf = (field: string, val: string) =>
                            setSheetInputValues(prev => ({ ...prev, [`${sid}:${field}`]: val }));
                          const clearbuf = (field: string) =>
                            setSheetInputValues(prev => { const n = {...prev}; delete n[`${sid}:${field}`]; return n; });
                          const commitBlur = (field: 'qtdDiarias'|'valorDia'|'valorDiaFds'|'alimentacao'|'alimentacaoUtil'|'alimentacaoFds'|'mobilidade', key: string) => (e: React.FocusEvent<HTMLInputElement>) => {
                            handleSheetEdit(budget, field, e.target.value);
                            clearbuf(key);
                          };

                          // Per-field override detection
                          const ovr = budgetOverrides[sid];
                          const vdiaEdited = ovr?.valorDiariaUtil !== undefined;
                          const vdiaFdsEdited = ovr?.valorDiariaFds !== undefined;
                          const alimUtilEdited = ovr?.almocoSemana !== undefined || ovr?.jantarSemana !== undefined;
                          const alimFdsEdited = ovr?.almocoFds !== undefined || ovr?.jantarFds !== undefined;
                          const alimEdited = alimUtilEdited || alimFdsEdited;
                          const mobEdited = ovr?.mobilidade !== undefined;

                          // Tipo: Casa ou Freela
                          const isCasaType = budget.collaborator?.type === 'casa' || budget.collaborator?.type === 'local';

                          // Default values for tooltips (use system defaults — same as what pending records show)
                          const fv = budget.functionValue;
                          // Atendimento: o "padrão" é a tarifa do tipo escolhido (plana)
                          const atendDefault = isAtendimentoFunction(getFunctionName(budget.inclusion.functionId))
                            ? atendimentoDailyCents((budget.inclusion as any).atendimentoTipo, systemSettings as any)
                            : null;
                          const defaultVDia = atendDefault ?? (isCasaType
                            ? (fv?.dailyValue ?? systemSettings?.default_daily_value_weekday ?? systemSettings?.default_daily_value ?? 5000)
                            : (fv?.dailyValueFreela ?? systemSettings?.default_daily_value_weekday_freela ?? systemSettings?.default_daily_value ?? 5000));
                          const defaultVDiaFds = atendDefault ?? (isCasaType
                            ? (fv?.dailyValueWeekend ?? systemSettings?.default_daily_value_weekend ?? systemSettings?.default_daily_value ?? 5000)
                            : (fv?.dailyValueFreelaWeekend ?? systemSettings?.default_daily_value_weekend_freela ?? systemSettings?.default_daily_value ?? 5000));
                          const defaultAlimTotal = ((systemSettings?.default_weekday_lunch ?? 3500) + (systemSettings?.default_weekday_dinner ?? 4000)) * budget.weekdays
                                            + ((systemSettings?.default_weekend_lunch ?? 4000) + (systemSettings?.default_weekend_dinner ?? 4500)) * budget.weekends;
                          const defaultAlim = Math.round(defaultAlimTotal / Math.max(1, budget.qtdDiarias));
                          // Mobilidade agora é automatizada por horário de voo — o "padrão" é o próprio valor calculado
                          const defaultMob = budget.mobilidade;
                          const tipoLabel = isCasaType ? 'Casa' : 'Freela';
                          const tipoIcon = isCasaType ? '🏠' : '⚡';

                          const inputBase = `h-7 text-right font-mono tabular-nums text-[12px] rounded px-2 outline-none transition-all
                            ${disabled
                              ? 'bg-transparent text-slate-300 cursor-not-allowed'
                              : 'bg-transparent border border-transparent text-slate-700 focus:bg-white focus:border-[#2563EB] focus:shadow-[0_0_0_2px_rgba(37,99,235,0.12)]'}`;

                          const restoreField = (field: 'valorDia'|'valorDiaFds'|'alimentacao'|'alimentacaoUtil'|'alimentacaoFds'|'mobilidade') => {
                            if (!ovr) return;
                            const updated = { ...ovr };
                            if (field === 'valorDia') { delete (updated as any).valorDiariaUtil; }
                            else if (field === 'valorDiaFds') { delete (updated as any).valorDiariaFds; }
                            else if (field === 'alimentacao') { delete (updated as any).almocoSemana; delete (updated as any).jantarSemana; delete (updated as any).almocoFds; delete (updated as any).jantarFds; }
                            else if (field === 'alimentacaoUtil') { delete (updated as any).almocoSemana; delete (updated as any).jantarSemana; }
                            else if (field === 'alimentacaoFds') { delete (updated as any).almocoFds; delete (updated as any).jantarFds; }
                            else if (field === 'mobilidade') { delete (updated as any).mobilidade; delete (updated as any).mobilidadeIda; delete (updated as any).mobilidadeVolta; }
                            const hasAny = Object.keys(updated).filter(k => k !== 'inclusionId' && k !== 'qtdDiarias').length > 0;
                            if (!hasAny && !updated.qtdDiarias) {
                              setBudgetOverrides(prev => { const n = {...prev}; delete n[sid]; return n; });
                            } else {
                              setBudgetOverrides(prev => ({ ...prev, [sid]: updated }));
                            }
                          };

                          return (
                            <tr
                              key={budget.inclusion.id}
                              style={{
                                background: isSent ? '#FAFAFA' : undefined,
                                borderTop: isNewCollab && rowIdx > 0 ? '2px solid #CBD5E1' : undefined,
                              }}
                              className={`group transition-colors ${isSent ? '' : isNotAttended ? 'opacity-40' : 'hover:bg-blue-50/20'} ${hasOvr && !isSent ? 'bg-amber-50/20' : ''}`}
                            >
                              {/* Checkbox */}
                              <td style={{width:40, paddingLeft:12, verticalAlign:'middle'}}>
                                <Checkbox
                                  checked={selectedRows.has(sid)}
                                  onCheckedChange={v => setSelectedRows(prev => { const next = new Set(prev); v ? next.add(sid) : next.delete(sid); return next; })}
                                  className="w-3.5 h-3.5"
                                  disabled={isSent}
                                />
                              </td>

                              {/* Colaborador + Função + Período — coluna rica com avatar */}
                              <td className="pl-4 pr-4 py-3" style={{minWidth:'280px', verticalAlign:'middle'}}>
                                <div className="flex items-start gap-3">
                                  {/* Avatar com iniciais */}
                                  {isNewCollab && (() => {
                                    const initials = name.split(' ').filter(Boolean).slice(0,2).map((w:string) => w[0]).join('').toUpperCase();
                                    return (
                                      <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5"
                                        style={isCasaTypeHdr
                                          ? {background:'#DBEAFE', color:'#1D4ED8'}
                                          : {background:'#FEE2E2', color:'#B91C1C'}}>
                                        {initials}
                                      </div>
                                    );
                                  })()}
                                  {!isNewCollab && <div className="shrink-0 w-8" />}

                                  <div className="flex-1 min-w-0">
                                    {isNewCollab && (
                                      <div className="flex items-center gap-1.5 mb-0.5">
                                        <span style={{fontSize:13, fontWeight:600, color:'#111827', letterSpacing:'-0.01em'}}>{toTitleCase(name)}</span>
                                        {hasOvr && !isSent && (
                                          <TooltipProvider delayDuration={150}>
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{background:'#F97316', boxShadow:'0 0 0 2px #FFF'}} />
                                              </TooltipTrigger>
                                              <TooltipContent side="top" className="text-xs">Valores editados manualmente pelo RH</TooltipContent>
                                            </Tooltip>
                                          </TooltipProvider>
                                        )}
                                        <span className="inline-flex items-center justify-center text-[10px] font-semibold rounded-full"
                                          style={{
                                            ...(isCasaTypeHdr ? {background:'#EFF6FF', color:'#1D4ED8'} : {background:'#FFF1F2', color:'#BE123C'}),
                                            padding: '2px 8px',
                                            minWidth: 44,
                                          }}>
                                          {isCasaTypeHdr ? 'Casa' : 'Freela'}
                                        </span>
                                      </div>
                                    )}
                                    {/* Linha 2: Função | Período */}
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className={`text-[11px] ${isNotAttended ? 'line-through text-slate-400' : 'text-slate-500'}`}>
                                        {funcName}
                                      </span>
                                      {budget.inclusion.scheduleStartDate && (
                                        <span className="text-[11px]" style={{color:'#9CA3AF'}}>
                                          · {new Date(budget.inclusion.scheduleStartDate + 'T12:00:00').toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})}
                                          {budget.inclusion.scheduleEndDate && budget.inclusion.scheduleStartDate !== budget.inclusion.scheduleEndDate && (
                                            <> → {new Date(budget.inclusion.scheduleEndDate + 'T12:00:00').toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})}</>
                                          )}
                                        </span>
                                      )}
                                      {matchingActual?.rhAdjusted && (
                                        <TooltipProvider delayDuration={200}>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <span className="inline-flex items-center shrink-0 cursor-default" style={{color:'#D97706'}}>✏</span>
                                            </TooltipTrigger>
                                            <TooltipContent side="right" className="text-xs">RH ajustou o realizado deste colaborador</TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      )}
                                    </div>
                                    {/* Linha 3: Status discreto */}
                                    <div className="mt-0.5">
                                      {isSent ? (
                                        <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-px rounded-full" style={{background:'#DCFCE7', color:'#16A34A'}}>
                                          <Check className="w-2 h-2" />Enviado
                                        </span>
                                      ) : !isNotAttended ? (
                                        <span className="inline-flex items-center text-[9px] font-semibold px-1.5 py-px rounded-full" style={{background:'#FEF3C7', color:'#92400E'}}>
                                          Pendente
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* Diárias qty — somente leitura */}
                              <td className="px-3 py-3 text-center" style={{background:'#F8FAFC', verticalAlign:'middle'}}>
                                <TooltipProvider delayDuration={200}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="text-[13px] font-semibold tabular-nums font-mono text-slate-600 cursor-default select-none">
                                        {budget.weekdays + budget.weekends}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs max-w-[220px]">
                                      <div className="flex flex-col gap-0.5">
                                        {budget.weekdays > 0 && <span><span style={{color:'#2563EB'}}>●</span> Útil: {budget.weekdays}×</span>}
                                        {budget.weekends > 0 && <span><span style={{color:'#F97316'}}>●</span> FDS: {budget.weekends}×</span>}
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </td>

                              {/* Diária R$/dia — Útil + FDS empilhados */}
                              <td className="px-4 py-3" style={{minWidth:'120px', verticalAlign:'middle'}}>
                                {/* Útil */}
                                <div className="flex items-center justify-end gap-1 mb-1.5 rounded-md px-1 -mx-1" style={{background:'rgba(37,99,235,0.05)'}}>
                                  <TooltipProvider delayDuration={150}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <input
                                          type="text" inputMode="decimal"
                                          disabled={disabled}
                                          value={buf('vdia', (budget.valorDiariaUtil / 100).toFixed(2))}
                                          onChange={e => setbuf('vdia', e.target.value)}
                                          onBlur={commitBlur('valorDia', 'vdia')}
                                          onFocus={e => e.target.select()}
                                          className={`${inputBase} flex-1 min-w-0 ${!disabled && vdiaEdited ? 'font-bold' : ''}`}
                                          style={!disabled && vdiaEdited ? {color:'#2563EB', borderColor:'#93C5FD'} : !disabled ? {color:'#1e40af'} : {}}
                                        />
                                      </TooltipTrigger>
                                      {!disabled && (
                                        <TooltipContent side="top" className="text-xs">
                                          {vdiaEdited ? `Editado · padrão: R$ ${(defaultVDia / 100).toFixed(2).replace('.', ',')}` : `Padrão da função ${funcName} (dia útil)`}
                                        </TooltipContent>
                                      )}
                                    </Tooltip>
                                  </TooltipProvider>
                                  {vdiaEdited && !disabled && (() => {
                                    const fbKey = `${sid}:vdia`;
                                    const restored = restoredFeedback === fbKey;
                                    return (
                                      <TooltipProvider delayDuration={restored ? 0 : 150}>
                                        <Tooltip open={restored ? true : undefined}>
                                          <TooltipTrigger asChild>
                                            <button onClick={() => { restoreField('valorDia'); setRestoredFeedback(fbKey); setTimeout(() => setRestoredFeedback(r => r === fbKey ? null : r), 2000); }}
                                              className={`text-[10px] shrink-0 ${restored ? 'text-emerald-500' : 'text-slate-400 hover:text-[#2563EB]'}`}>↩</button>
                                          </TooltipTrigger>
                                          <TooltipContent side="top" className="text-xs">{restored ? 'Restaurado ✓' : 'Restaurar padrão'}</TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    );
                                  })()}
                                </div>
                                {/* FDS */}
                                <div className="flex items-center justify-end gap-1 rounded-md px-1 -mx-1" style={{background:'#FFF8F2'}}>
                                  <TooltipProvider delayDuration={150}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <input
                                          type="text" inputMode="decimal"
                                          disabled={disabled}
                                          value={buf('vdiaFds', (budget.valorDiariaFds / 100).toFixed(2))}
                                          onChange={e => setbuf('vdiaFds', e.target.value)}
                                          onBlur={(e) => { handleSheetEdit(budget, 'valorDiaFds', e.target.value); clearbuf('vdiaFds'); }}
                                          onFocus={e => e.target.select()}
                                          className={`${inputBase} flex-1 min-w-0 ${!disabled && vdiaFdsEdited ? 'font-bold' : ''}`}
                                          style={!disabled && vdiaFdsEdited ? {color:'#F97316', borderColor:'#FED7AA'} : !disabled ? {color:'#C2410C'} : {}}
                                        />
                                      </TooltipTrigger>
                                      {!disabled && (
                                        <TooltipContent side="top" className="text-xs">
                                          {vdiaFdsEdited ? `Editado · padrão: R$ ${(defaultVDiaFds / 100).toFixed(2).replace('.', ',')}` : `Padrão da função ${funcName} (fim de semana)`}
                                        </TooltipContent>
                                      )}
                                    </Tooltip>
                                  </TooltipProvider>
                                  {vdiaFdsEdited && !disabled && (() => {
                                    const fbKey = `${sid}:vdiaFds`;
                                    const restored = restoredFeedback === fbKey;
                                    return (
                                      <TooltipProvider delayDuration={restored ? 0 : 150}>
                                        <Tooltip open={restored ? true : undefined}>
                                          <TooltipTrigger asChild>
                                            <button onClick={() => { restoreField('valorDiaFds'); setRestoredFeedback(fbKey); setTimeout(() => setRestoredFeedback(r => r === fbKey ? null : r), 2000); }}
                                              className={`text-[10px] shrink-0 ${restored ? 'text-emerald-500' : 'text-slate-400 hover:text-[#F97316]'}`}>↩</button>
                                          </TooltipTrigger>
                                          <TooltipContent side="top" className="text-xs">{restored ? 'Restaurado ✓' : 'Restaurar padrão'}</TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    );
                                  })()}
                                </div>
                              </td>

                              {/* Alim. R$/dia — Útil + FDS empilhados */}
                              <td className="px-4 py-3" style={{minWidth:'120px', verticalAlign:'middle'}}>
                                {/* Útil */}
                                <div className="flex items-center justify-end gap-1 mb-1.5 rounded-md px-1 -mx-1" style={{background:'rgba(37,99,235,0.05)'}}>
                                  <TooltipProvider delayDuration={150}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <input
                                          type="text" inputMode="decimal"
                                          disabled={disabled || budget.weekdays === 0}
                                          value={budget.weekdays === 0 ? '—' : buf('alimUtil', ((budget.almocoSemana + budget.jantarSemana) / Math.max(1, budget.weekdays) / 100).toFixed(2))}
                                          onChange={e => setbuf('alimUtil', e.target.value)}
                                          onBlur={commitBlur('alimentacaoUtil', 'alimUtil')}
                                          onFocus={e => e.target.select()}
                                          className={`${inputBase} flex-1 min-w-0 ${!disabled && budget.weekdays > 0 && alimUtilEdited ? 'font-bold' : ''}`}
                                          style={!disabled && budget.weekdays > 0 && alimUtilEdited ? {color:'#2563EB', borderColor:'#93C5FD'} : !disabled && budget.weekdays > 0 ? {color:'#1e3a8a'} : {color:'#CBD5E1'}}
                                        />
                                      </TooltipTrigger>
                                      {!disabled && budget.weekdays > 0 && (
                                        <TooltipContent side="top" className="text-xs">
                                          {alimUtilEdited
                                            ? `Editado · padrão: R$ ${((budget.unitAlmocoSemana + budget.unitJantarSemana) / 100).toFixed(2).replace('.', ',')} /dia útil`
                                            : `Almoço + Jantar por dia útil`}
                                        </TooltipContent>
                                      )}
                                    </Tooltip>
                                  </TooltipProvider>
                                  {alimUtilEdited && !disabled && budget.weekdays > 0 && (() => {
                                    const fbKey = `${sid}:alimUtil`;
                                    const restored = restoredFeedback === fbKey;
                                    return (
                                      <TooltipProvider delayDuration={restored ? 0 : 150}>
                                        <Tooltip open={restored ? true : undefined}>
                                          <TooltipTrigger asChild>
                                            <button onClick={() => { restoreField('alimentacaoUtil'); setRestoredFeedback(fbKey); setTimeout(() => setRestoredFeedback(r => r === fbKey ? null : r), 2000); }}
                                              className={`text-[10px] shrink-0 ${restored ? 'text-emerald-500' : 'text-slate-400 hover:text-[#2563EB]'}`}>↩</button>
                                          </TooltipTrigger>
                                          <TooltipContent side="top" className="text-xs">{restored ? 'Restaurado ✓' : 'Restaurar padrão'}</TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    );
                                  })()}
                                </div>
                                {/* FDS */}
                                <div className="flex items-center justify-end gap-1 rounded-md px-1 -mx-1" style={{background:'#FFF8F2'}}>
                                  <TooltipProvider delayDuration={150}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <input
                                          type="text" inputMode="decimal"
                                          disabled={disabled || budget.weekends === 0}
                                          value={budget.weekends === 0 ? '—' : buf('alimFds', ((budget.almocoFds + budget.jantarFds) / Math.max(1, budget.weekends) / 100).toFixed(2))}
                                          onChange={e => setbuf('alimFds', e.target.value)}
                                          onBlur={commitBlur('alimentacaoFds', 'alimFds')}
                                          onFocus={e => e.target.select()}
                                          className={`${inputBase} flex-1 min-w-0 ${!disabled && budget.weekends > 0 && alimFdsEdited ? 'font-bold' : ''}`}
                                          style={!disabled && budget.weekends > 0 && alimFdsEdited ? {color:'#F97316', borderColor:'#FDBA74'} : !disabled && budget.weekends > 0 ? {color:'#92400e'} : {color:'#CBD5E1'}}
                                        />
                                      </TooltipTrigger>
                                      {!disabled && budget.weekends > 0 && (
                                        <TooltipContent side="top" className="text-xs">
                                          {alimFdsEdited
                                            ? `Editado · padrão: R$ ${((budget.unitAlmocoFds + budget.unitJantarFds) / 100).toFixed(2).replace('.', ',')} /dia FDS`
                                            : `Almoço + Jantar por dia de fim de semana`}
                                        </TooltipContent>
                                      )}
                                    </Tooltip>
                                  </TooltipProvider>
                                  {alimFdsEdited && !disabled && budget.weekends > 0 && (() => {
                                    const fbKey = `${sid}:alimFds`;
                                    const restored = restoredFeedback === fbKey;
                                    return (
                                      <TooltipProvider delayDuration={restored ? 0 : 150}>
                                        <Tooltip open={restored ? true : undefined}>
                                          <TooltipTrigger asChild>
                                            <button onClick={() => { restoreField('alimentacaoFds'); setRestoredFeedback(fbKey); setTimeout(() => setRestoredFeedback(r => r === fbKey ? null : r), 2000); }}
                                              className={`text-[10px] shrink-0 ${restored ? 'text-emerald-500' : 'text-slate-400 hover:text-[#F97316]'}`}>↩</button>
                                          </TooltipTrigger>
                                          <TooltipContent side="top" className="text-xs">{restored ? 'Restaurado ✓' : 'Restaurar padrão'}</TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    );
                                  })()}
                                </div>
                              </td>

                              {/* Mobilidade — coluna individual */}
                              <td className="px-4 py-3 text-right" style={{verticalAlign:'middle'}}>
                                  <div className="flex items-center justify-end gap-1">
                                    <TooltipProvider delayDuration={150}>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <input
                                            type="text" inputMode="decimal"
                                            disabled={disabled}
                                            value={buf('mob', mobTotal.toFixed(2))}
                                            onChange={e => setbuf('mob', e.target.value)}
                                            onBlur={commitBlur('mobilidade', 'mob')}
                                            onFocus={e => e.target.select()}
                                            className={`${inputBase} w-[80px] ${!disabled && mobEdited ? 'text-[#3B4FE4] font-bold' : !disabled ? 'text-slate-900' : ''}`}
                                          />
                                        </TooltipTrigger>
                                        {!disabled && (
                                          <TooltipContent side="top" className="text-xs">
                                            {mobEdited
                                              ? `Editado · padrão: R$ ${(defaultMob / 100).toFixed(2).replace('.', ',')} (total Ida+Volta)`
                                              : `Total Ida+Volta · padrão: R$ ${(defaultMob / 100).toFixed(2).replace('.', ',')}`}
                                          </TooltipContent>
                                        )}
                                      </Tooltip>
                                    </TooltipProvider>
                                    {mobEdited && !disabled && (() => {
                                      const fbKey = `${sid}:mob`;
                                      const restored = restoredFeedback === fbKey;
                                      return (
                                        <TooltipProvider delayDuration={restored ? 0 : 150}>
                                          <Tooltip open={restored ? true : undefined}>
                                            <TooltipTrigger asChild>
                                              <button
                                                onClick={() => {
                                                  restoreField('mobilidade');
                                                  setRestoredFeedback(fbKey);
                                                  setTimeout(() => setRestoredFeedback(r => r === fbKey ? null : r), 2000);
                                                }}
                                                className={`text-[10px] transition-colors cursor-pointer shrink-0 ${restored ? 'text-emerald-500' : 'text-slate-400 hover:text-[#3B4FE4]'}`}
                                              >↩</button>
                                            </TooltipTrigger>
                                            <TooltipContent side="top" className="text-xs">
                                              {restored ? 'Restaurado ✓' : 'Restaurar valor padrão da função'}
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      );
                                    })()}
                                  </div>
                                </td>

                              {/* Subtotal — clicável → Memória de Cálculo */}
                              <td className="px-4 py-3 text-right bg-blue-50/20" style={{position:'relative', verticalAlign:'middle'}}>
                                <button
                                  onClick={() => setSubtotalOpenId(subtotalOpenId === sid ? null : sid)}
                                  className={`text-[14px] font-mono font-bold tabular-nums transition-colors ${isNotAttended ? 'text-slate-300 line-through cursor-default' : 'cursor-pointer hover:opacity-80'}`}
                                  style={isNotAttended ? {} : {color:'#0033CC'}}
                                  disabled={isNotAttended}
                                >
                                  {formatCurrency(budget.totalFinal)}
                                </button>
                                {matchingActual?.rhAdjusted && isSent && (
                                  <div className="text-[11px] font-mono font-semibold tabular-nums mt-0.5" style={{color:'#D97706'}}>
                                    {formatCurrency(matchingActual.totalValue)} ✏
                                  </div>
                                )}
                                {/* Popover de Memória de Cálculo */}
                                {subtotalOpenId === sid && !isNotAttended && (() => {
                                  const wdFood = budget.weekdays > 0 ? (budget.almocoSemana + budget.jantarSemana) / Math.max(1, budget.weekdays) : 0;
                                  const weFood = budget.weekends > 0 ? (budget.almocoFds + budget.jantarFds) / Math.max(1, budget.weekends) : 0;
                                  const wdTotal = budget.weekdays * (budget.valorDiariaUtil + Math.round(wdFood));
                                  const weTotal = budget.weekends * (budget.valorDiariaFds + Math.round(weFood));
                                  const fmt = (v: number) => (v / 100).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
                                  return (
                                    <div
                                      id={`subtotal-popover-${sid}`}
                                      onClick={e => e.stopPropagation()}
                                      style={{
                                        position:'absolute', right:0, top:'100%', zIndex:60,
                                        background:'#fff', border:'1px solid #E2E8F0',
                                        borderRadius:12, boxShadow:'0 8px 24px rgba(0,0,0,0.12)',
                                        padding:'14px 16px', minWidth:270, textAlign:'left',
                                      }}
                                    >
                                      <div style={{fontSize:11, fontWeight:700, color:'#0033CC', marginBottom:10, letterSpacing:'0.05em', textTransform:'uppercase'}}>
                                        Memória de Cálculo · {toTitleCase(name)}
                                      </div>
                                      <div style={{fontSize:11, color:'#64748B', marginBottom:8}}>
                                        {budget.qtdDiarias} {budget.qtdDiarias === 1 ? 'dia' : 'dias'}
                                        {budget.inclusion.scheduleStartDate && budget.inclusion.scheduleEndDate && ` · ${new Date(budget.inclusion.scheduleStartDate + 'T12:00:00').toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})} → ${new Date(budget.inclusion.scheduleEndDate + 'T12:00:00').toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})}`}
                                      </div>
                                      <table style={{width:'100%', borderCollapse:'collapse', fontSize:12}}>
                                        <tbody>
                                          {budget.weekdays > 0 && (
                                            <tr>
                                              <td style={{paddingBottom:4, color:'#2563EB', fontWeight:600}}>{budget.weekdays} Dia{budget.weekdays > 1 ? 's' : ''} Útil{budget.weekdays > 1 ? 'eis' : ''}</td>
                                              <td style={{paddingBottom:4, textAlign:'right', color:'#374151', fontFamily:'monospace'}}>{fmt(wdTotal)}</td>
                                            </tr>
                                          )}
                                          {budget.weekdays > 0 && (
                                            <tr>
                                              <td colSpan={2} style={{paddingBottom:8, color:'#9CA3AF', fontSize:10, paddingLeft:8}}>
                                                Diária {fmt(budget.valorDiariaUtil)} + Alim. {fmt(Math.round(wdFood))} por dia
                                              </td>
                                            </tr>
                                          )}
                                          {budget.weekends > 0 && (
                                            <tr>
                                              <td style={{paddingBottom:4, color:'#F97316', fontWeight:600}}>{budget.weekends} Fim{budget.weekends > 1 ? 's' : ''} de Semana</td>
                                              <td style={{paddingBottom:4, textAlign:'right', color:'#374151', fontFamily:'monospace'}}>{fmt(weTotal)}</td>
                                            </tr>
                                          )}
                                          {budget.weekends > 0 && (
                                            <tr>
                                              <td colSpan={2} style={{paddingBottom:8, color:'#9CA3AF', fontSize:10, paddingLeft:8}}>
                                                Diária {fmt(budget.valorDiariaFds)} + Alim. {fmt(Math.round(weFood))} por dia
                                              </td>
                                            </tr>
                                          )}
                                          {budget.mobilidade > 0 && (
                                            <tr>
                                              <td style={{paddingBottom:4, color:'#6D28D9', fontWeight:600}}>Mobilidade (total)</td>
                                              <td style={{paddingBottom:4, textAlign:'right', color:'#374151', fontFamily:'monospace'}}>{fmt(budget.mobilidade)}</td>
                                            </tr>
                                          )}
                                        </tbody>
                                        <tfoot>
                                          <tr style={{borderTop:'2px solid #E2E8F0'}}>
                                            <td style={{paddingTop:8, fontWeight:700, color:'#0033CC', fontSize:13}}>Total</td>
                                            <td style={{paddingTop:8, textAlign:'right', fontWeight:700, color:'#0033CC', fontFamily:'monospace', fontSize:13}}>{fmt(budget.totalFinal)}</td>
                                          </tr>
                                        </tfoot>
                                      </table>
                                      <button
                                        onClick={() => setSubtotalOpenId(null)}
                                        style={{marginTop:10, fontSize:10, color:'#94A3B8', cursor:'pointer', background:'none', border:'none', display:'block', textAlign:'center', width:'100%'}}
                                      >fechar</button>
                                    </div>
                                  );
                                })()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {filteredBudgets.length > 0 && (() => {
                        const totalDiariasCols = filteredBudgets.reduce((s, b) => s + b.subtotalDiarias, 0);
                        const totalAlimCols = filteredBudgets.reduce((s, b) => s + b.almocoSemana + b.jantarSemana + b.almocoFds + b.jantarFds, 0);
                        const totalMobCols = filteredBudgets.reduce((s, b) => s + b.mobilidade, 0);
                        return (
                          <tfoot>
                            <tr style={{background:'#F0F4FF', borderTop:'2px solid #3B4FE4'}}>
                              <td style={{width:40}} />
                              <td className="px-4 py-2.5">
                                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{color:'#888'}}>
                                  TOTAL ({filteredBudgets.length})
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <span className="text-[12px] font-mono font-semibold text-slate-500 tabular-nums">
                                  {filteredBudgets.reduce((s, b) => s + b.qtdDiarias, 0)} dias
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <span className="text-[12px] font-mono font-semibold text-slate-500 tabular-nums">
                                  {formatCurrency(totalDiariasCols)}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <span className="text-[12px] font-mono font-semibold text-slate-500 tabular-nums">
                                  {formatCurrency(totalAlimCols)}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <span className="text-[12px] font-mono font-semibold text-slate-500 tabular-nums">
                                  {formatCurrency(totalMobCols)}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <span className="text-[15px] font-extrabold font-mono tabular-nums" style={{color:'#3B4FE4'}}>{formatCurrency(totalGeral)}</span>
                              </td>
                            </tr>
                          </tfoot>
                        );
                      })()}
                    </table>
                  </div>
                </div>
                );
              })()}

              {/* ── Rodapé de Ações da Planilha ── */}
              {(() => {
                const pendingSheet = filteredBudgets.filter(b => !sentToActual.has(b.inclusion.id) && !isCardNotAttended(b));
                const hasEdits = pendingSheet.some(b => b.hasOverride);
                const isAdmin = isRhOrAdmin(user);
                const hasPending = pendingSheet.length > 0;
                return (
                  <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      {hasPending && (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border" style={{background:'#FEF3C7', color:'#D97706', borderColor:'#FDE68A'}}>
                          ⏱ {pendingSheet.length} {pendingSheet.length === 1 ? 'pendente' : 'pendentes'}
                        </span>
                      )}
                      {hasEdits && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
                          Valores editados
                        </span>
                      )}
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-3">
                        {hasEdits && !inlineSendConfirm && (
                          <button
                            onClick={() => setBudgetOverrides(prev => {
                              const updated = { ...prev };
                              filteredBudgets.forEach(b => { delete updated[b.inclusion.id]; });
                              return updated;
                            })}
                            className="text-[12px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 px-3 py-2 rounded-lg transition-colors"
                          >
                            Descartar Alterações
                          </button>
                        )}
                        {inlineSendConfirm ? (
                          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50" style={{animation:'fadeIn 0.15s ease'}}>
                            <span className="text-[12px] font-medium text-slate-700 whitespace-nowrap">
                              Enviar para {pendingSheet.length} colaborador{pendingSheet.length !== 1 ? 'es' : ''}?
                            </span>
                            <button
                              onClick={() => setInlineSendConfirm(false)}
                              className="text-[12px] font-medium text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-white/60 transition-colors"
                            >
                              Cancelar
                            </button>
                            <button
                              disabled={sendSelectedToActualMutation.isPending}
                              onClick={() => {
                                sendSelectedToActualMutation.mutate();
                                setInlineSendConfirm(false);
                              }}
                              className="h-8 flex items-center gap-1.5 text-[12px] font-semibold text-white px-3 rounded-lg bg-[#059669] hover:bg-[#047857] transition-colors shadow-sm"
                            >
                              {sendSelectedToActualMutation.isPending ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <Send className="w-3 h-3" />
                              )}
                              Confirmar envio
                            </button>
                          </div>
                        ) : (
                          <button
                            disabled={!hasPending}
                            onClick={() => {
                              if (!hasPending) return;
                              setSelectedCards(new Set(pendingSheet.map(b => b.inclusion.id)));
                              setInlineSendConfirm(true);
                            }}
                            className={`h-10 flex items-center gap-2 text-[13px] font-semibold text-white px-5 rounded-lg shadow-md transition-all
                              ${hasPending
                                ? `bg-[#059669] hover:bg-[#047857] ${hasEdits ? 'shadow-emerald-200 ring-2 ring-emerald-400 ring-offset-1' : 'shadow-emerald-100'}`
                                : 'bg-slate-300 cursor-not-allowed opacity-50 shadow-none'}
                            `}
                          >
                            <Send className="w-4 h-4" />
                            Enviar Planejamento
                            {hasPending && (
                              <span className="ml-1 w-5 h-5 rounded-full bg-white/25 flex items-center justify-center text-[11px] font-bold leading-none">
                                {pendingSheet.length}
                              </span>
                            )}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
            )}
          </>
        )}

      {/* Modal de Edição */}
      <Dialog open={!!editingBudget} onOpenChange={() => { setEditingBudget(null); setEditingBudgetInfo(null); setEditingBudgetPlannedId(null); setModalViewMode(false); }}>
        <DialogContent className="max-w-[680px] w-[95vw] p-0 gap-0 rounded-2xl overflow-hidden border-0 shadow-2xl" style={{display:'flex', flexDirection:'column', maxHeight:'90vh'}}>
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
            // Campo a campo: edições que se compensam no total também contam
            const hasChanges = !!originalModalValues && (Object.keys(editingBudget) as (keyof BudgetEdit)[])
              .some(k => editingBudget[k] !== originalModalValues![k]);
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
              <div className="px-5 py-3.5 relative shrink-0" style={{background:'linear-gradient(135deg, #0033CC 0%, #1a4fd8 100%)'}}>
                <div className="flex items-center gap-3">
                  {/* Avatar 40px */}
                  <div className="w-10 h-10 rounded-[10px] flex items-center justify-center font-black text-[15px] shrink-0" style={{background:'rgba(255,255,255,0.15)', color:'#fff', border:'1.5px solid rgba(255,255,255,0.25)'}}>
                    {modalInitials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-[16px] font-bold text-white leading-tight truncate">{editingBudgetInfo.name}</h2>
                    <p className="text-[12px] text-white/70">{editingBudgetInfo.functionName}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <span className="inline-flex items-center h-[22px] text-[11px] font-bold px-2 rounded-md" style={{background:'rgba(255,255,255,0.15)', color:'#fff'}}>
                        {editingBudgetInfo.type}
                      </span>
                      <span className="inline-flex items-center gap-1 h-[22px] text-[11px] text-white/70">
                        <Calendar className="w-3 h-3" />
                        {editingBudgetInfo.period}
                      </span>
                      <span className="inline-flex items-center gap-1 h-[22px] text-[11px] px-2 rounded-md" style={{background:'rgba(255,255,255,0.12)', color:'rgba(255,255,255,0.85)'}}>
                        <Briefcase className="w-3 h-3" />
                        {editingBudgetInfo.weekdays}d úteis
                      </span>
                      <span className="inline-flex items-center gap-1 h-[22px] text-[11px] px-2 rounded-md" style={{background:'rgba(255,200,0,0.2)', color:'rgba(255,220,80,1)'}}>
                        <Sun className="w-3 h-3" />
                        {editingBudgetInfo.weekends} fds
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Banner modo visualização ── */}
              {modalViewMode && (
                <div className="flex items-center gap-2.5 px-5 py-2.5 bg-amber-50 border-b border-amber-200 shrink-0">
                  <Eye className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <p className="text-[11px] font-semibold text-amber-700">
                    Modo de Visualização — Edição de valores bloqueada para esta fase
                  </p>
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
                    onClick={() => setModalTab(id)}
                    className={[
                      'flex-1 h-10 text-[13px] font-medium transition-colors',
                      modalTab === id
                        ? 'text-[#0033CC] border-b-2 border-[#0033CC] bg-blue-50/40'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* ── Corpo (aba Custos) ── */}
              {modalTab === 'custos' && (
              <div className="flex-1 overflow-y-auto min-h-0" style={{background:'#F8FAFC'}}>
              <div className="px-4 py-3 space-y-2.5" style={modalViewMode ? {opacity:0.72, userSelect:'none'} : {}}>

                {/* ── BLOCO: Diárias ── */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="flex items-center justify-between px-3.5 py-2 bg-blue-50 border-b border-blue-100">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-md bg-[#0033CC] flex items-center justify-center">
                        <Calendar className="w-2.5 h-2.5 text-white" />
                      </div>
                      <span className="text-[11px] font-bold text-[#0033CC] uppercase tracking-wider">Diárias</span>
                    </div>
                    <span className="text-[13px] font-bold text-[#0033CC]">{formatCurrency(totalDiarias)}</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {/* Dias Úteis */}
                    <div className="flex items-center px-3.5 py-2 gap-3">
                      <div className="flex items-center gap-1.5 flex-1">
                        <Briefcase className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="text-[12px] font-medium text-slate-700">Dias Úteis</span>
                        <span className="text-[10px] text-slate-400">({editingBudgetInfo.weekdays})</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-400">R$</span>
                        <Input
                          type="number" step="1" className={inputCls}
                          value={noWeekdays ? 0 : editingBudget.valorDiariaUtil / 100}
                          disabled={noWeekdays || modalViewMode}
                          onChange={e => setEditingBudget({...editingBudget, valorDiariaUtil: Math.round(parseFloat(e.target.value) * 100) || 0})}
                        />
                        <span className="text-[10px] text-slate-400">/dia</span>
                      </div>
                      <span className="text-[13px] font-bold text-slate-700 w-20 text-right shrink-0">{formatCurrency(subtotalDiariasUtil)}</span>
                    </div>
                    {/* Fim de Semana */}
                    <div className="flex items-center px-3.5 py-2 gap-3 bg-amber-50/30">
                      <div className="flex items-center gap-1.5 flex-1">
                        <Sun className="w-3 h-3 text-amber-500 shrink-0" />
                        <span className="text-[12px] font-medium text-slate-700">Fim de Semana</span>
                        <span className="text-[10px] text-slate-400">({editingBudgetInfo.weekends})</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-400">R$</span>
                        <Input
                          type="number" step="1" className={inputCls}
                          value={noWeekends ? 0 : editingBudget.valorDiariaFds / 100}
                          disabled={noWeekends || modalViewMode}
                          onChange={e => setEditingBudget({...editingBudget, valorDiariaFds: Math.round(parseFloat(e.target.value) * 100) || 0})}
                        />
                        <span className="text-[10px] text-slate-400">/dia</span>
                      </div>
                      <span className="text-[13px] font-bold text-slate-700 w-20 text-right shrink-0">{formatCurrency(subtotalDiariasFds)}</span>
                    </div>
                  </div>
                </div>

                {/* ── BLOCO: Mobilidade ── */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="flex items-center justify-between px-3.5 py-2 bg-violet-50 border-b border-violet-100">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-md bg-violet-500 flex items-center justify-center">
                        <Car className="w-2.5 h-2.5 text-white" />
                      </div>
                      <span className="text-[11px] font-bold text-violet-700 uppercase tracking-wider">Mobilidade</span>
                      <span className="text-[10px] text-violet-400">ida e volta</span>
                    </div>
                    <span className="text-[13px] font-bold text-violet-600">{formatCurrency(editingBudget.mobilidadeIda + editingBudget.mobilidadeVolta)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 px-3.5 py-2.5">
                    <div>
                      <div className="text-[10px] text-slate-400 font-medium mb-1">Ida (R$)</div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-400">R$</span>
                        <Input
                          type="number" step="0.01" className={inputCls}
                          value={editingBudget.mobilidadeIda / 100}
                          disabled={modalViewMode}
                          onChange={e => {
                            const ida = Math.round(parseFloat(e.target.value) * 100) || 0;
                            setEditingBudget({...editingBudget, mobilidadeIda: ida, mobilidade: ida + editingBudget.mobilidadeVolta});
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-medium mb-1">Volta (R$)</div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-400">R$</span>
                        <Input
                          type="number" step="0.01" className={inputCls}
                          value={editingBudget.mobilidadeVolta / 100}
                          disabled={modalViewMode}
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
                  <div className="flex items-center justify-between px-3.5 py-2 bg-orange-50 border-b border-orange-100">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-md bg-orange-500 flex items-center justify-center">
                        <Utensils className="w-2.5 h-2.5 text-white" />
                      </div>
                      <span className="text-[11px] font-bold text-orange-700 uppercase tracking-wider">Alimentação</span>
                    </div>
                    <span className="text-[13px] font-bold text-orange-600">{formatCurrency(totalAlimentacao)}</span>
                  </div>

                  {/* Sub-seção: Dias Úteis */}
                  <div className="px-3.5 pt-2 pb-1.5">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Briefcase className="w-3 h-3 text-slate-400" />
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Dias Úteis ({editingBudgetInfo.weekdays})</span>
                    </div>
                    <div className="space-y-1.5 pl-3">
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-slate-600 w-12 shrink-0">Almoço</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-slate-400">R$</span>
                          <Input
                            type="number" step="0.01" className={inputCls}
                            value={noWeekdays ? 0 : editingBudget.almocoSemana / 100}
                            disabled={noWeekdays || modalViewMode}
                            onChange={e => setEditingBudget({...editingBudget, almocoSemana: Math.round(parseFloat(e.target.value) * 100) || 0})}
                          />
                          <span className="text-[10px] text-slate-400">total</span>
                        </div>
                        <span className="text-[10px] text-slate-300 ml-auto">
                          {editingBudgetInfo.weekdays > 0 ? formatCurrency(Math.round(editingBudget.almocoSemana / editingBudgetInfo.weekdays)) : 'R$ 0'}/dia
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-slate-600 w-12 shrink-0">Jantar</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-slate-400">R$</span>
                          <Input
                            type="number" step="0.01" className={inputCls}
                            value={noWeekdays ? 0 : editingBudget.jantarSemana / 100}
                            disabled={noWeekdays || modalViewMode}
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

                  <div className="mx-3.5 border-t border-dashed border-slate-100" />

                  {/* Sub-seção: Fins de Semana */}
                  <div className="px-3.5 pt-2 pb-2.5 bg-amber-50/30">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Sun className="w-3 h-3 text-amber-400" />
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Fim de Semana ({editingBudgetInfo.weekends})</span>
                    </div>
                    <div className="space-y-1.5 pl-3">
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-slate-600 w-12 shrink-0">Almoço</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-slate-400">R$</span>
                          <Input
                            type="number" step="0.01" className={inputCls}
                            value={noWeekends ? 0 : editingBudget.almocoFds / 100}
                            disabled={noWeekends || modalViewMode}
                            onChange={e => setEditingBudget({...editingBudget, almocoFds: Math.round(parseFloat(e.target.value) * 100) || 0})}
                          />
                          <span className="text-[10px] text-slate-400">total</span>
                        </div>
                        <span className="text-[10px] text-slate-300 ml-auto">
                          {editingBudgetInfo.weekends > 0 ? formatCurrency(Math.round(editingBudget.almocoFds / editingBudgetInfo.weekends)) : 'R$ 0'}/dia
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-slate-600 w-12 shrink-0">Jantar</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-slate-400">R$</span>
                          <Input
                            type="number" step="0.01" className={inputCls}
                            value={noWeekends ? 0 : editingBudget.jantarFds / 100}
                            disabled={noWeekends || modalViewMode}
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
              </div>
              )}

              {/* ── Aba: Observações ── */}
              {modalTab === 'observacoes' && (
                <div className="flex-1 overflow-y-auto min-h-0" style={{background:'#F8FAFC'}}>
                  {editingBudgetPlannedId ? (
                    <BudgetChat
                      entityType="planned"
                      entityId={editingBudgetPlannedId}
                      eventId={selectedEventId}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-[12px]">
                      Salve o planejamento primeiro para habilitar observações.
                    </div>
                  )}
                </div>
              )}

              {/* ── Aba: Histórico ── */}
              {modalTab === 'historico' && (
                <div className="flex-1 overflow-y-auto min-h-0" style={{background:'#F8FAFC'}}>
                  {editingBudgetPlannedId ? (
                    <ActivityTimeline entityType="budget_planned" entityId={editingBudgetPlannedId} defaultOpen={true} />
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-[12px]">
                      Salve o planejamento primeiro para ver o histórico.
                    </div>
                  )}
                </div>
              )}

              {/* ── Footer ── */}
              <div className="shrink-0" style={{borderTop:'1px solid #e5e7eb', background:'#F8FAFC'}}>
                {/* Faixa de total */}
                <div className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">Total Planejado</div>
                    <div className="text-[22px] font-extrabold leading-none mt-0.5 transition-all" style={{color:'#3B4FE4'}}>{formatCurrency(modalTotal)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-slate-500 leading-tight">
                      Diárias <span className="font-semibold text-slate-600">{formatCurrency(totalDiarias)}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                      Alimentação <span className="font-semibold text-slate-600">{formatCurrency(totalAlimentacao)}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                      Mobilidade <span className="font-semibold text-slate-600">{formatCurrency(editingBudget.mobilidade)}</span>
                    </div>
                    {diff !== 0 && (
                      <div className={`text-[10px] font-bold mt-1 ${diff > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                        {diff > 0 ? '▲' : '▼'} {formatCurrency(Math.abs(diff))} vs original
                      </div>
                    )}
                  </div>
                </div>
                {/* Botões */}
                <div className="px-5 pb-3 flex justify-between items-center gap-2" style={{borderTop:'1px solid #e5e7eb', paddingTop:'10px', background:'white'}}>
                  <div>
                    {!modalViewMode && hasChanges && (
                      <button
                        onClick={restoreDefaults}
                        className="flex items-center gap-1 text-[11px] font-medium text-[#0033CC] hover:text-[#0022aa] transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Restaurar padrão
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      className="h-9 px-4 text-slate-500 hover:text-slate-700 rounded-lg text-sm"
                      onClick={() => { setEditingBudget(null); setEditingBudgetInfo(null); }}
                    >
                      Cancelar
                    </Button>
                    {!modalViewMode && (
                      <Button
                        onClick={saveEdit}
                        disabled={!hasChanges}
                        className="h-9 px-5 text-white font-semibold rounded-lg gap-2 text-sm"
                        style={{background: hasChanges ? '#0033CC' : undefined, boxShadow: hasChanges ? '0 4px 12px #0033CC40' : 'none'}}
                      >
                        <CheckCheck className="w-4 h-4" />
                        {hasChanges && diff !== 0 ? `Salvar (${diff > 0 ? '+' : ''}${formatCurrency(diff)})` : 'Salvar'}
                      </Button>
                    )}
                  </div>
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
            <p className="text-center text-[12px] font-normal text-slate-400 leading-relaxed">
              As informações de custos e logística serão enviadas para aprovação. Deseja prosseguir?
            </p>
            {/* Linha do total */}
            <div className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl"
              style={{background:'#F8FAFC', border:'1px solid #E2E8F0'}}>
              <span className="text-[11px] font-normal text-slate-400">Total a ser enviado</span>
              <span className="text-[14px] font-medium tabular-nums" style={{color:'#059669'}}>
                {formatCurrency(totalSelecionado)}
              </span>
            </div>
            {/* Botões */}
            <div className="flex gap-2 w-full">
              <button
                className="flex-1 h-10 rounded-xl text-[13px] font-medium text-slate-500 transition-colors"
                style={{background:'rgba(241,245,249,0.6)'}}
                onClick={() => setConfirmSendOpen(false)}
                disabled={sendSelectedToActualMutation.isPending}
              >
                Voltar
              </button>
              <button
                className="flex-1 h-10 rounded-xl text-[13px] font-medium text-white flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-70"
                style={{background:'#059669', boxShadow:'0 2px 10px rgba(5,150,105,0.3)'}}
                disabled={sendSelectedToActualMutation.isPending}
                onClick={() => sendSelectedToActualMutation.mutate()}
              >
                {sendSelectedToActualMutation.isPending ? (
                  <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Enviando...</>
                ) : (
                  <><Check className="w-3.5 h-3.5" />Confirmar Envio</>
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
            return (
              <div className="bg-white flex flex-col items-center px-6 pt-7 pb-6 gap-4"
                style={{animation:'modalIn 0.2s cubic-bezier(0.34,1.56,0.64,1) both'}}>
                {/* Ícone Send */}
                <div className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{background:'#ECFDF5', border:'1.5px solid #A7F3D0'}}>
                  <Send style={{color:'#059669', width:20, height:20}} />
                </div>
                {/* Título + colaborador */}
                <div className="text-center space-y-1">
                  <h2 className="text-[15px] font-medium text-slate-800">
                    Enviar para o Realizado?
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
                    background: '#F0FDF4',
                  }}>
                    <span className="text-[12px] font-medium text-slate-600">Total planejado</span>
                    <span className="text-[15px] font-medium" style={{color:'#059669'}}>{formatCurrency(confirmSendSingle.totalFinal)}</span>
                  </div>
                </div>
                {/* Mensagem de apoio */}
                <p className="text-center text-[12px] font-normal text-slate-400 leading-relaxed">
                  Os valores calculados serão enviados diretamente para o Realizado. Esta ação não pode ser desfeita.
                </p>
                {/* Linha do total */}
                <div className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl"
                  style={{background:'#F8FAFC', border:'1px solid #E2E8F0'}}>
                  <span className="text-[11px] font-normal text-slate-400">Total a ser enviado</span>
                  <span className="text-[14px] font-medium tabular-nums" style={{color:'#059669'}}>
                    {formatCurrency(confirmSendSingle.totalFinal)}
                  </span>
                </div>
                {/* Botões */}
                <div className="flex gap-2 w-full">
                  <button
                    className="flex-1 h-10 rounded-xl text-[13px] font-medium text-slate-500 transition-colors"
                    style={{background:'rgba(241,245,249,0.6)'}}
                    onClick={() => setConfirmSendSingle(null)}
                    disabled={sendToActualMutation.isPending}
                  >
                    Voltar
                  </button>
                  <button
                    className="flex-1 h-10 rounded-xl text-[13px] font-medium text-white flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-70"
                    style={{background:'#059669', boxShadow:'0 2px 10px rgba(5,150,105,0.3)'}}
                    disabled={sendToActualMutation.isPending}
                    onClick={() => sendToActualMutation.mutate(confirmSendSingle as typeof calculatedBudgets[0])}
                  >
                    {sendToActualMutation.isPending ? (
                      <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Enviando...</>
                    ) : (
                      <><Check className="w-3.5 h-3.5" />Confirmar Envio</>
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
          // sticky no container da página: acompanha a largura do conteúdo e o
          // recuo do layout em qualquer estado do sidebar (expandido/compacto/oculto),
          // ao contrário do antigo `position: fixed; left: 256` hardcoded.
          position: 'sticky',
          bottom: 0,
          zIndex: 40,
          borderRadius: '14px 14px 0 0',
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
