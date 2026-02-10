import { useState, useMemo, useEffect } from "react";
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
import { Calculator, Users, Calendar, RefreshCw, Edit, Send, CheckCheck, Car, Utensils, Coffee, Moon, Sun, Search, ArrowUpDown, Home, UserCheck, TrendingUp, DollarSign, Briefcase, ChevronDown, ChevronUp, BarChart3 } from "lucide-react";
import { EventSelect, EventSelectCTA } from "@/components/event-select";
import { Progress } from "@/components/ui/progress";
import type { Event, Function, Collaborator, TeamInclusion, FunctionValue } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";

interface BudgetEdit {
  inclusionId: string;
  qtdDiarias: number;
  valorDiaria: number;
  mobilidade: number;
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
  subtotalDiarias: number;
  mobilidade: number;
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
  const [selectedEventId, setSelectedEventId] = useState<string>("");
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
  const [sortBy, setSortBy] = useState<string>("value");
  const [collapsedCards, setCollapsedCards] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();

  const canEdit = user?.role === "admin" || user?.role === "production";

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
    const pending = calculatedBudgets.filter(b => !sentToActual.has(b.inclusion.id));
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

  const getFunctionValue = (functionId: string | null) => {
    if (!functionId) return null;
    return functionValues?.find(fv => fv.functionId === functionId);
  };

  const selectedEvent = events?.find(e => e.id === selectedEventId);

  const countWeekdaysAndWeekends = (startDate: string | null, endDate: string | null): { weekdays: number; weekends: number } => {
    if (!startDate || !endDate) return { weekdays: 0, weekends: 0 };
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return { weekdays: 0, weekends: 0 };
    
    let weekdays = 0;
    let weekends = 0;
    const current = new Date(start);
    
    while (current <= end) {
      const day = current.getDay();
      if (day === 0 || day === 6) {
        weekends++;
      } else {
        weekdays++;
      }
      current.setDate(current.getDate() + 1);
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

  // Calcular orçamento automaticamente baseado nas escalações confirmadas
  const calculatedBudgets = useMemo(() => {
    if (!confirmedInclusions || !functionValues) return [];
    
    return confirmedInclusions.map(inclusion => {
      const fv = getFunctionValue(inclusion.functionId);
      const collab = collaborators?.find(c => c.id === inclusion.collaboratorId);
      const override = budgetOverrides[inclusion.id];
      
      const qtdDiarias = override?.qtdDiarias ?? inclusion.dailyRates ?? 0;
      const valorDiaria = override?.valorDiaria ?? fv?.dailyValue ?? 25000;
      const subtotalDiarias = qtdDiarias * valorDiaria;
      
      const { weekdays, weekends } = countWeekdaysAndWeekends(
        inclusion.scheduleStartDate, 
        inclusion.scheduleEndDate
      );
      
      const mobilidade = override?.mobilidade ?? fv?.mobility ?? 2500;
      const unitAlmocoSemana = fv?.weekdayLunch || 3500;
      const unitJantarSemana = fv?.weekdayDinner || 4000;
      const unitAlmocoFds = fv?.weekendLunch || 4000;
      const unitJantarFds = fv?.weekendDinner || 4500;
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
        subtotalDiarias,
        mobilidade,
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
  }, [confirmedInclusions, functionValues, collaborators, budgetOverrides]);

  const totalGeral = useMemo(() => {
    return calculatedBudgets.reduce((sum, b) => sum + b.totalFinal, 0);
  }, [calculatedBudgets]);

  // Estatísticas de resumo
  const stats = useMemo(() => {
    const total = calculatedBudgets.length;
    const isCasa = (type?: string) => type === 'casa' || type === 'local';
    const isFreela = (type?: string) => type === 'freela' || !type;
    const totalCasa = calculatedBudgets.filter(b => isCasa(b.collaborator?.type)).length;
    const totalFreela = calculatedBudgets.filter(b => isFreela(b.collaborator?.type)).length;
    const valorCasa = calculatedBudgets.filter(b => isCasa(b.collaborator?.type)).reduce((sum, b) => sum + b.totalFinal, 0);
    const valorFreela = calculatedBudgets.filter(b => isFreela(b.collaborator?.type)).reduce((sum, b) => sum + b.totalFinal, 0);
    const media = total > 0 ? totalGeral / total : 0;
    const totalDias = calculatedBudgets.reduce((sum, b) => sum + b.qtdDiarias, 0);
    const mediaPorDia = totalDias > 0 ? totalGeral / totalDias : 0;
    const enviados = calculatedBudgets.filter(b => sentToActual.has(b.inclusion.id)).length;
    const progressoEnvio = total > 0 ? (enviados / total) * 100 : 0;
    
    return { total, totalCasa, totalFreela, valorCasa, valorFreela, media, mediaPorDia, enviados, progressoEnvio };
  }, [calculatedBudgets, totalGeral, sentToActual]);

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
    
    // Ordenação
    result.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return getCollaboratorName(a.inclusion.collaboratorId).localeCompare(getCollaboratorName(b.inclusion.collaboratorId));
        case 'value':
          return b.totalFinal - a.totalFinal;
        case 'function':
          return getFunctionName(a.inclusion.functionId).localeCompare(getFunctionName(b.inclusion.functionId));
        default:
          return 0;
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
    setEditingBudget({
      inclusionId: budget.inclusion.id,
      qtdDiarias: budget.qtdDiarias,
      valorDiaria: budget.valorDiaria,
      mobilidade: budget.mobilidade,
      almocoSemana: budget.almocoSemana,
      jantarSemana: budget.jantarSemana,
      almocoFds: budget.almocoFds,
      jantarFds: budget.jantarFds,
    });
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
    const plannedData = {
      eventId: budget.inclusion.eventId,
      collaboratorId: budget.inclusion.collaboratorId,
      functionId: budget.inclusion.functionId,
      collaboratorType: budget.collaborator?.type || "freela",
      dailyQuantity: budget.qtdDiarias,
      dailyValue: budget.valorDiaria,
      costAssistance: 0,
      weekdayLunch: budget.almocoSemana,
      weekdayDinner: budget.jantarSemana,
      weekendLunch: budget.almocoFds,
      weekendDinner: budget.jantarFds,
      mobility: budget.mobilidade,
      transport: 0,
      totalValue: budget.totalFinal,
      createdBy: user?.id,
    };

    const plannedRes = await apiRequest("POST", "/api/budget-planned", plannedData);
    const savedPlanned = await plannedRes.json();

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

  const pendingCount = calculatedBudgets.filter(b => !sentToActual.has(b.inclusion.id)).length;

  return (
    <div className="space-y-5 max-w-5xl mx-auto pb-24">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 dark:bg-blue-900/40 p-2 rounded-lg">
            <Calculator className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-blue-900 dark:text-blue-100">Orçamento Planejado</h1>
            <p className="text-sm text-gray-500">Cálculo automático das escalações confirmadas</p>
          </div>
        </div>
        <EventSelect value={selectedEventId} onValueChange={setSelectedEventId} events={events} />
      </div>

      {!selectedEventId ? (
        <div className="rounded-xl border-2 border-dashed border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-16 text-center">
          <div className="bg-blue-100 dark:bg-blue-900/50 rounded-2xl p-5 w-fit mx-auto mb-5">
            <Calculator className="w-14 h-14 text-blue-500 dark:text-blue-400" />
          </div>
          <h2 className="text-xl font-semibold text-blue-900 dark:text-blue-100 mb-2">Selecione um evento</h2>
          <p className="text-blue-600/70 dark:text-blue-400/70 text-sm max-w-md mx-auto mb-6">
            Visualize o orçamento previsto com base nas escalações confirmadas. Os valores são calculados automaticamente a partir das funções e períodos de trabalho.
          </p>
          <EventSelectCTA value={selectedEventId} onValueChange={setSelectedEventId} events={events} accentColor="blue" />
        </div>
      ) : (
          <>
            {/* Total Geral Destacado */}
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl p-5 mb-4 shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign className="w-5 h-5 text-green-200" />
                    <span className="text-green-100 text-sm font-medium uppercase tracking-wider">Total Geral do Evento</span>
                  </div>
                  <div className="text-4xl font-bold text-white">{formatCurrency(totalGeral)}</div>
                  <div className="text-green-200 text-sm mt-1">{stats.total} colaboradores confirmados</div>
                </div>
              </div>
            </div>

            {/* Cards de Resumo Secundários */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg border p-3.5 shadow-sm">
                <div className="flex items-center gap-2 text-gray-500 text-xs mb-1.5">
                  <Home className="w-3.5 h-3.5 text-blue-500" />
                  <span>Casa</span>
                </div>
                <div className="text-lg font-bold text-gray-800 dark:text-gray-200">{stats.totalCasa} <span className="text-xs font-normal text-gray-400">colab.</span></div>
                <div className="text-sm text-blue-600 font-medium">{formatCurrency(stats.valorCasa)}</div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg border p-3.5 shadow-sm">
                <div className="flex items-center gap-2 text-gray-500 text-xs mb-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-orange-500" />
                  <span>Freela</span>
                </div>
                <div className="text-lg font-bold text-gray-800 dark:text-gray-200">{stats.totalFreela} <span className="text-xs font-normal text-gray-400">colab.</span></div>
                <div className="text-sm text-orange-600 font-medium">{formatCurrency(stats.valorFreela)}</div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg border p-3.5 shadow-sm">
                <div className="flex items-center gap-2 text-gray-500 text-xs mb-1.5">
                  <Users className="w-3.5 h-3.5 text-purple-500" />
                  <span>Custo Médio / Colaborador</span>
                </div>
                <div className="text-lg font-bold text-purple-600">{formatCurrency(stats.media)}</div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg border p-3.5 shadow-sm">
                <div className="flex items-center gap-2 text-gray-500 text-xs mb-1.5">
                  <BarChart3 className="w-3.5 h-3.5 text-teal-500" />
                  <span>Custo Médio / Dia</span>
                </div>
                <div className="text-lg font-bold text-teal-600">{formatCurrency(stats.mediaPorDia)}</div>
              </div>
            </div>

            {/* Barra de Progresso de Envio */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border p-3 shadow-sm mb-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 shrink-0">
                  <Send className="w-3.5 h-3.5" />
                  <span>Envio para Realizado</span>
                </div>
                <div className="flex-1 max-w-md">
                  <div className="relative h-6 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 flex items-center justify-center ${
                        stats.progressoEnvio === 0 ? 'bg-gray-200 dark:bg-gray-600' : 
                        stats.progressoEnvio === 100 ? 'bg-green-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${Math.max(stats.progressoEnvio, stats.total > 0 ? 35 : 0)}%` }}
                    >
                      <span className={`text-xs font-semibold ${stats.progressoEnvio === 0 ? 'text-gray-500 dark:text-gray-400' : 'text-white'}`}>
                        {stats.enviados} de {stats.total} enviados
                      </span>
                    </div>
                    {stats.progressoEnvio === 0 && stats.total > 0 && (
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-gray-500 dark:text-gray-400">
                        {stats.enviados} de {stats.total} enviados
                      </span>
                    )}
                  </div>
                </div>
                {selectedCards.size > 0 && (
                  <Button 
                    size="sm"
                    onClick={() => setConfirmSendOpen(true)}
                    disabled={sendSelectedToActualMutation.isPending}
                    className="bg-green-600 hover:bg-green-700 shrink-0"
                  >
                    <Send className="w-3 h-3 mr-1.5" />
                    Enviar selecionados ({selectedCards.size})
                  </Button>
                )}
              </div>
            </div>

            {/* Filtros e Busca em Linha Única */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border p-3 shadow-sm mb-4">
              <div className="flex items-center gap-3">
                {pendingCount > 0 && (
                  <Checkbox 
                    checked={selectedCards.size === pendingCount && pendingCount > 0}
                    onCheckedChange={(checked) => checked ? selectAllCards() : clearSelection()}
                    className="shrink-0"
                  />
                )}
                <div className="relative flex-1 min-w-[160px]">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input 
                    placeholder="Buscar por nome..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
                
                <Select value={filterFunction} onValueChange={setFilterFunction}>
                  <SelectTrigger className="w-40 h-9 shrink-0">
                    <SelectValue placeholder="Função" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas Funções</SelectItem>
                    {uniqueFunctions.map(f => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-32 h-9 shrink-0">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="casa">Casa</SelectItem>
                    <SelectItem value="freela">Freela</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-36 h-9 shrink-0">
                    <ArrowUpDown className="w-3.5 h-3.5 mr-1" />
                    <SelectValue placeholder="Ordenar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="value">Maior Custo</SelectItem>
                    <SelectItem value="name">Por Nome</SelectItem>
                    <SelectItem value="function">Por Função</SelectItem>
                  </SelectContent>
                </Select>

                <span className="text-xs text-gray-400 shrink-0">{filteredBudgets.length} resultados</span>
              </div>
            </div>

            {/* Conteúdo */}
            {isLoadingInclusions || isLoadingFunctionValues ? (
              <div className="flex items-center justify-center py-20">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            ) : filteredBudgets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <Users className="w-16 h-16 text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300">
                  {calculatedBudgets.length === 0 ? 'Nenhuma escalação confirmada' : 'Nenhum resultado encontrado'}
                </h3>
                <p className="text-gray-500 mt-1">
                  {calculatedBudgets.length === 0 ? 'Apenas escalações com status confirmado aparecem aqui' : 'Tente ajustar os filtros de busca'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredBudgets.map((budget) => {
                  const isSent = sentToActual.has(budget.inclusion.id);
                  const isSelected = selectedCards.has(budget.inclusion.id);
                  const isCollapsed = collapsedCards.has(budget.inclusion.id);
                  const isCasa = budget.collaborator?.type === 'casa' || budget.collaborator?.type === 'local';
                  
                  return (
                    <div 
                      key={budget.inclusion.id} 
                      className={`bg-white dark:bg-gray-800 rounded-xl border shadow-sm hover:shadow-md transition-all overflow-hidden ${
                        isSelected ? 'ring-2 ring-green-500 border-green-300' : 
                        isSent ? 'border-green-200 dark:border-green-800' :
                        budget.hasOverride ? 'border-yellow-200 dark:border-yellow-800' : 'border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      {/* Cabeçalho do Card */}
                      <div className={`flex items-center justify-between px-4 py-3 ${
                        isSent ? 'bg-green-50 dark:bg-green-950/30' : 'bg-gray-50 dark:bg-gray-700/50'
                      }`}>
                        <div className="flex items-center gap-3">
                          {!isSent ? (
                            <Checkbox 
                              checked={isSelected}
                              onCheckedChange={() => toggleCardSelection(budget.inclusion.id)}
                            />
                          ) : (
                            <CheckCheck className="w-5 h-5 text-green-600" />
                          )}
                          <div>
                            <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                              {getCollaboratorName(budget.inclusion.collaboratorId)}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-medium">
                                {getFunctionName(budget.inclusion.functionId)}
                              </Badge>
                              <Badge className={`text-[10px] h-5 px-1.5 font-medium ${
                                isCasa 
                                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/50 dark:text-blue-300' 
                                  : 'bg-orange-100 text-orange-700 hover:bg-orange-100 dark:bg-orange-900/50 dark:text-orange-300'
                              }`}>
                                {isCasa ? 'Casa' : 'Freela'}
                              </Badge>
                              {budget.hasOverride && (
                                <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" title="Valores personalizados" />
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {canEdit && !isSent && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50" onClick={() => openEditModal(budget)}>
                              <Edit className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {!isSent && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                              onClick={() => setConfirmSendSingle(budget)}
                            >
                              <Send className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 text-gray-400 hover:text-gray-600"
                            onClick={() => toggleCollapse(budget.inclusion.id)}
                          >
                            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>
                      
                      {/* Corpo do Card - Colapsável */}
                      {!isCollapsed && (
                        <div className="px-4 py-3 space-y-1.5 text-sm">
                          <div className="flex justify-between items-center py-1.5">
                            <div className="flex items-center gap-2">
                              <Calendar className="w-3.5 h-3.5 text-blue-500" />
                              <span className="text-gray-600 dark:text-gray-400">Diárias</span>
                              <span className="text-xs text-gray-400">{budget.qtdDiarias} x {formatCurrency(budget.valorDiaria)}</span>
                            </div>
                            <span className="font-semibold text-gray-700 dark:text-gray-300">{formatCurrency(budget.subtotalDiarias)}</span>
                          </div>
                          <div className="flex justify-between items-center py-1.5">
                            <div className="flex items-center gap-2">
                              <Car className="w-3.5 h-3.5 text-purple-500" />
                              <span className="text-gray-600 dark:text-gray-400">Mobilidade</span>
                            </div>
                            <span className="font-medium text-gray-600 dark:text-gray-400">{formatCurrency(budget.mobilidade)}</span>
                          </div>
                          <div className="flex justify-between items-center py-1.5">
                            <div className="flex items-center gap-2">
                              <Utensils className="w-3.5 h-3.5 text-orange-500" />
                              <span className="text-gray-600 dark:text-gray-400">Alimentação</span>
                            </div>
                            <span className="font-medium text-gray-600 dark:text-gray-400">{formatCurrency(budget.almocoSemana + budget.jantarSemana + budget.almocoFds + budget.jantarFds)}</span>
                          </div>
                          
                          <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
                          
                          <div className="flex justify-between items-center py-1 text-orange-600 dark:text-orange-400">
                            <span className="text-xs font-medium uppercase tracking-wide">Ajuda de Custo</span>
                            <span className="font-semibold text-sm">{formatCurrency(budget.ajudaCusto)}</span>
                          </div>
                        </div>
                      )}

                      {/* Total - Sempre visível */}
                      <div className="flex justify-between items-center px-4 py-2.5 bg-green-50 dark:bg-green-950/30 border-t border-green-100 dark:border-green-900">
                        <span className="font-bold text-green-800 dark:text-green-300 text-xs uppercase tracking-wider">Total</span>
                        <span className="font-bold text-lg text-green-700 dark:text-green-300">{formatCurrency(budget.totalFinal)}</span>
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
        <DialogContent className="max-w-[700px] w-[95vw] p-0 gap-0 rounded-2xl overflow-hidden border-0 shadow-2xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Editar Orçamento</DialogTitle>
          </DialogHeader>
          
          {editingBudget && editingBudgetInfo && (() => {
            const modalTotal = (editingBudget.qtdDiarias * editingBudget.valorDiaria) + 
              editingBudget.mobilidade + editingBudget.almocoSemana + editingBudget.jantarSemana + 
              editingBudget.almocoFds + editingBudget.jantarFds;
            const totalAlimentacao = editingBudget.almocoSemana + editingBudget.jantarSemana + editingBudget.almocoFds + editingBudget.jantarFds;
            
            return (
            <>
              {/* Header compacto */}
              <div className="bg-white dark:bg-gray-800 px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{editingBudgetInfo.name}</h2>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant="secondary" className="text-xs h-5 px-2">{editingBudgetInfo.functionName}</Badge>
                      <Badge className={`text-xs h-5 px-2 ${editingBudgetInfo.type === 'Casa' ? 'bg-blue-100 text-blue-700 hover:bg-blue-100' : 'bg-orange-100 text-orange-700 hover:bg-orange-100'}`}>
                        {editingBudgetInfo.type}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right text-xs text-gray-500 dark:text-gray-400 pr-6">
                    <div className="flex items-center gap-1.5 justify-end">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{editingBudgetInfo.period}</span>
                    </div>
                    <div className="mt-1 text-gray-400">
                      {editingBudgetInfo.weekdays} úteis + {editingBudgetInfo.weekends} fds
                    </div>
                  </div>
                </div>
              </div>

              {/* Corpo */}
              <div className="max-h-[58vh] overflow-y-auto px-6 py-5 space-y-4 bg-gray-50 dark:bg-gray-900">
                
                {/* Diárias - Seção principal */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <Calendar className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Diárias</span>
                  </div>
                  <div className="flex items-end gap-4">
                    <div className="flex-1">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Quantidade</label>
                      <Input 
                        type="number" className="h-10 text-sm"
                        value={editingBudget.qtdDiarias} 
                        onChange={e => setEditingBudget({...editingBudget, qtdDiarias: parseInt(e.target.value) || 0})}
                      />
                    </div>
                    <div className="text-gray-300 dark:text-gray-600 text-lg font-light pb-2">&times;</div>
                    <div className="flex-1">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Valor unitário (R$)</label>
                      <Input 
                        type="number" step="0.01" className="h-10 text-sm"
                        value={(editingBudget.valorDiaria / 100).toFixed(2)} 
                        onChange={e => setEditingBudget({...editingBudget, valorDiaria: Math.round(parseFloat(e.target.value) * 100) || 0})}
                      />
                    </div>
                    <div className="text-gray-300 dark:text-gray-600 text-lg font-light pb-2">=</div>
                    <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg px-4 py-2 text-right min-w-[120px]">
                      <div className="text-xl font-bold text-blue-700 dark:text-blue-300">{formatCurrency(editingBudget.qtdDiarias * editingBudget.valorDiaria)}</div>
                    </div>
                  </div>
                </div>

                {/* Mobilidade */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <Car className="w-4 h-4 text-purple-600" />
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Mobilidade</span>
                  </div>
                  <div className="flex items-end gap-4">
                    <div className="flex-1">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Total do período (R$)</label>
                      <Input 
                        type="number" step="0.01" className="h-10 text-sm"
                        value={(editingBudget.mobilidade / 100).toFixed(2)} 
                        onChange={e => setEditingBudget({...editingBudget, mobilidade: Math.round(parseFloat(e.target.value) * 100) || 0})}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-1.5 block">Por dia (R$)</label>
                      <div className="h-10 flex items-center px-3 rounded-md bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400">
                        {editingBudget.qtdDiarias > 0 ? formatCurrency(Math.round(editingBudget.mobilidade / editingBudget.qtdDiarias)) : 'R$ 0,00'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Alimentação */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Utensils className="w-4 h-4 text-orange-500" />
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Alimentação</span>
                    </div>
                    <span className="text-sm font-bold text-orange-600">{formatCurrency(totalAlimentacao)}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Dias Úteis */}
                    <div className="bg-blue-50/40 dark:bg-blue-950/15 rounded-lg p-3 border border-blue-100 dark:border-blue-900/50">
                      <div className="flex items-center gap-1.5 mb-3">
                        <Briefcase className="w-3.5 h-3.5 text-blue-500" />
                        <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                          Dias Úteis ({editingBudgetInfo.weekdays})
                        </span>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <div className="flex items-center gap-1 mb-1">
                            <Sun className="w-3 h-3 text-amber-500" />
                            <label className="text-[11px] font-medium text-amber-700 dark:text-amber-400">Almoço</label>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <Input 
                              type="number" step="0.01" className="h-8 text-xs"
                              value={(editingBudget.almocoSemana / 100).toFixed(2)} 
                              onChange={e => setEditingBudget({...editingBudget, almocoSemana: Math.round(parseFloat(e.target.value) * 100) || 0})}
                            />
                            <div className="h-8 flex items-center px-2 rounded-md bg-white/60 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700 text-xs text-amber-600">
                              {editingBudgetInfo.weekdays > 0 ? formatCurrency(Math.round(editingBudget.almocoSemana / editingBudgetInfo.weekdays)) : 'R$ 0'}/dia
                            </div>
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center gap-1 mb-1">
                            <Moon className="w-3 h-3 text-indigo-500" />
                            <label className="text-[11px] font-medium text-indigo-700 dark:text-indigo-400">Jantar</label>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <Input 
                              type="number" step="0.01" className="h-8 text-xs"
                              value={(editingBudget.jantarSemana / 100).toFixed(2)} 
                              onChange={e => setEditingBudget({...editingBudget, jantarSemana: Math.round(parseFloat(e.target.value) * 100) || 0})}
                            />
                            <div className="h-8 flex items-center px-2 rounded-md bg-white/60 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700 text-xs text-indigo-600">
                              {editingBudgetInfo.weekdays > 0 ? formatCurrency(Math.round(editingBudget.jantarSemana / editingBudgetInfo.weekdays)) : 'R$ 0'}/dia
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="mt-2.5 pt-2 border-t border-blue-100 dark:border-blue-800/50 flex items-center justify-between">
                        <span className="text-[10px] text-blue-500 font-medium uppercase">Subtotal</span>
                        <span className="text-xs font-bold text-blue-700 dark:text-blue-300">{formatCurrency(editingBudget.almocoSemana + editingBudget.jantarSemana)}</span>
                      </div>
                    </div>

                    {/* Fins de Semana */}
                    <div className="bg-amber-50/40 dark:bg-amber-950/15 rounded-lg p-3 border border-amber-100 dark:border-amber-900/50">
                      <div className="flex items-center gap-1.5 mb-3">
                        <Sun className="w-3.5 h-3.5 text-amber-500" />
                        <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                          Fins de Semana ({editingBudgetInfo.weekends})
                        </span>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <div className="flex items-center gap-1 mb-1">
                            <Sun className="w-3 h-3 text-amber-500" />
                            <label className="text-[11px] font-medium text-amber-700 dark:text-amber-400">Almoço</label>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <Input 
                              type="number" step="0.01" className="h-8 text-xs"
                              value={(editingBudget.almocoFds / 100).toFixed(2)} 
                              onChange={e => setEditingBudget({...editingBudget, almocoFds: Math.round(parseFloat(e.target.value) * 100) || 0})}
                            />
                            <div className="h-8 flex items-center px-2 rounded-md bg-white/60 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700 text-xs text-amber-600">
                              {editingBudgetInfo.weekends > 0 ? formatCurrency(Math.round(editingBudget.almocoFds / editingBudgetInfo.weekends)) : 'R$ 0'}/dia
                            </div>
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center gap-1 mb-1">
                            <Moon className="w-3 h-3 text-indigo-500" />
                            <label className="text-[11px] font-medium text-indigo-700 dark:text-indigo-400">Jantar</label>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <Input 
                              type="number" step="0.01" className="h-8 text-xs"
                              value={(editingBudget.jantarFds / 100).toFixed(2)} 
                              onChange={e => setEditingBudget({...editingBudget, jantarFds: Math.round(parseFloat(e.target.value) * 100) || 0})}
                            />
                            <div className="h-8 flex items-center px-2 rounded-md bg-white/60 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700 text-xs text-indigo-600">
                              {editingBudgetInfo.weekends > 0 ? formatCurrency(Math.round(editingBudget.jantarFds / editingBudgetInfo.weekends)) : 'R$ 0'}/dia
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="mt-2.5 pt-2 border-t border-amber-100 dark:border-amber-800/50 flex items-center justify-between">
                        <span className="text-[10px] text-amber-600 font-medium uppercase">Subtotal</span>
                        <span className="text-xs font-bold text-amber-700 dark:text-amber-300">{formatCurrency(editingBudget.almocoFds + editingBudget.jantarFds)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer fixo com Total Geral */}
              <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-xl px-5 py-3">
                      <div className="text-[10px] uppercase text-green-600 dark:text-green-400 font-semibold tracking-wider mb-0.5">Total Geral</div>
                      <div className="text-2xl font-bold text-green-700 dark:text-green-300">{formatCurrency(modalTotal)}</div>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="outline" className="h-10 px-5" onClick={() => { setEditingBudget(null); setEditingBudgetInfo(null); }}>Cancelar</Button>
                    <Button onClick={saveEdit} className="h-10 px-6 bg-blue-600 hover:bg-blue-700 shadow-md">Salvar Alterações</Button>
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
    </div>
  );
}
