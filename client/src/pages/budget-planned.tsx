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
import { Calculator, Users, Calendar, RefreshCw, Edit, Send, CheckCheck, Car, Utensils, Coffee, Moon, Sun, Search, ArrowUpDown, Home, UserCheck, TrendingUp, DollarSign } from "lucide-react";
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
  const [sortBy, setSortBy] = useState<string>("name");
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
    const enviados = calculatedBudgets.filter(b => sentToActual.has(b.inclusion.id)).length;
    const progressoEnvio = total > 0 ? (enviados / total) * 100 : 0;
    
    return { total, totalCasa, totalFreela, valorCasa, valorFreela, media, enviados, progressoEnvio };
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

  const sendToActualMutation = useMutation({
    mutationFn: async (budget: typeof calculatedBudgets[0]) => {
      const res = await apiRequest("POST", "/api/budget-actual", {
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
        paymentStatus: "pendente",
        observations: "Enviado do planejado",
        createdBy: user?.id,
      });
      return { id: budget.inclusion.id, result: await res.json() };
    },
    onSuccess: (data) => {
      setSentToActual(prev => new Set([...prev, data.id]));
      toast({ title: "Sucesso", description: "Enviado para o Realizado" });
      qc.invalidateQueries({ queryKey: ["/api/budget-actual"] });
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
        const res = await apiRequest("POST", "/api/budget-actual", {
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
          paymentStatus: "pendente",
          observations: "Enviado do planejado (lote)",
          createdBy: user?.id,
        });
        results.push({ id: budget.inclusion.id, result: await res.json() });
      }
      return results;
    },
    onSuccess: (data) => {
      setSentToActual(prev => new Set([...prev, ...data.map(d => d.id)]));
      setSelectedCards(new Set());
      toast({ title: "Sucesso", description: `${data.length} itens enviados para o Realizado` });
      qc.invalidateQueries({ queryKey: ["/api/budget-actual"] });
    },
    onError: () => {
      toast({ title: "Erro", description: "Erro ao enviar para o Realizado", variant: "destructive" });
    },
  });

  const pendingCount = calculatedBudgets.filter(b => !sentToActual.has(b.inclusion.id)).length;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header fixo */}
      <div className="bg-white dark:bg-gray-800 border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 p-2 rounded-lg">
                <Calculator className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Orçamento Planejado</h1>
                <p className="text-xs text-gray-500">Cálculo automático das escalações confirmadas</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                <SelectTrigger className="w-64 bg-white dark:bg-gray-700">
                  <SelectValue placeholder="Selecione o evento..." />
                </SelectTrigger>
                <SelectContent>
                  {events?.map(event => (
                    <SelectItem key={event.id} value={event.id}>
                      {event.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {!selectedEventId ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="bg-gray-100 dark:bg-gray-800 rounded-full p-6 mb-4">
              <Calendar className="w-12 h-12 text-gray-400" />
            </div>
            <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300">Selecione um Evento</h2>
            <p className="text-gray-500 mt-2 text-center max-w-md">
              Escolha um evento no seletor acima para visualizar o orçamento planejado das escalações confirmadas.
            </p>
          </div>
        ) : (
          <>
            {/* Cards de Resumo */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg border-l-4 border-l-green-500 border p-4 shadow-sm">
                <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                  <DollarSign className="w-4 h-4 text-green-500" />
                  Total Geral
                </div>
                <div className="text-2xl font-bold text-green-600">{formatCurrency(totalGeral)}</div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg border-l-4 border-l-purple-500 border p-4 shadow-sm">
                <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                  <Users className="w-4 h-4 text-purple-500" />
                  Colaboradores
                </div>
                <div className="text-2xl font-bold text-purple-600">{stats.total}</div>
                <div className="text-xs text-gray-500">Média: {formatCurrency(stats.media)}</div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg border-l-4 border-l-blue-500 border p-4 shadow-sm">
                <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                  <Home className="w-4 h-4 text-blue-500" />
                  Casa
                </div>
                <div className="text-2xl font-bold text-blue-600">{stats.totalCasa}</div>
                <div className="text-xs text-gray-500">{formatCurrency(stats.valorCasa)}</div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg border-l-4 border-l-orange-500 border p-4 shadow-sm">
                <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                  <UserCheck className="w-4 h-4 text-orange-500" />
                  Freela
                </div>
                <div className="text-2xl font-bold text-orange-600">{stats.totalFreela}</div>
                <div className="text-xs text-gray-500">{formatCurrency(stats.valorFreela)}</div>
              </div>
            </div>

            {/* Barra de Progresso de Envio */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border p-3 shadow-sm mb-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <TrendingUp className="w-4 h-4" />
                  <span>Progresso de Envio para Realizado</span>
                </div>
                <span className="text-sm font-medium">{stats.enviados} de {stats.total}</span>
              </div>
              <Progress value={stats.progressoEnvio} className="h-2" />
            </div>

            {/* Filtros e Busca */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border p-3 shadow-sm mb-4">
              <div className="flex flex-wrap items-center gap-3">
                {/* Busca */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input 
                    placeholder="Buscar por nome..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
                
                {/* Filtro Função */}
                <Select value={filterFunction} onValueChange={setFilterFunction}>
                  <SelectTrigger className="w-40 h-9">
                    <SelectValue placeholder="Função" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas Funções</SelectItem>
                    {uniqueFunctions.map(f => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {/* Filtro Tipo */}
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-32 h-9">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="casa">Casa</SelectItem>
                    <SelectItem value="freela">Freela</SelectItem>
                  </SelectContent>
                </Select>
                
                {/* Ordenação */}
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-36 h-9">
                    <ArrowUpDown className="w-3.5 h-3.5 mr-1" />
                    <SelectValue placeholder="Ordenar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Por Nome</SelectItem>
                    <SelectItem value="value">Por Valor</SelectItem>
                    <SelectItem value="function">Por Função</SelectItem>
                  </SelectContent>
                </Select>

                {/* Ações em Lote */}
                {pendingCount > 0 && (
                  <div className="flex items-center gap-2 ml-auto">
                    <Button 
                      variant="outline"
                      size="sm"
                      onClick={selectedCards.size > 0 ? clearSelection : selectAllCards}
                    >
                      {selectedCards.size > 0 ? "Limpar" : "Selecionar Todos"}
                    </Button>
                    {selectedCards.size > 0 && (
                        <Button 
                          size="sm"
                          onClick={() => setConfirmSendOpen(true)}
                          disabled={sendSelectedToActualMutation.isPending}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <Send className="w-3 h-3 mr-1" />
                          Enviar ({selectedCards.size})
                        </Button>
                      )}
                  </div>
                )}
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
                {filteredBudgets.map((budget) => (
                  <div 
                    key={budget.inclusion.id} 
                    className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-all ${getCardBorderColor(budget.inclusion.id)} ${
                      selectedCards.has(budget.inclusion.id) 
                        ? 'ring-2 ring-green-500' 
                        : sentToActual.has(budget.inclusion.id)
                          ? 'bg-green-50/50 dark:bg-green-950/20'
                          : budget.hasOverride 
                            ? 'bg-yellow-50/30' 
                            : ''
                    }`}
                  >
                    {/* Cabeçalho do Card */}
                    <div className="flex items-center justify-between p-3 border-b bg-gray-50 dark:bg-gray-700/50 rounded-t-lg">
                      <div className="flex items-center gap-2">
                        {!sentToActual.has(budget.inclusion.id) && (
                          <Checkbox 
                            checked={selectedCards.has(budget.inclusion.id)}
                            onCheckedChange={() => toggleCardSelection(budget.inclusion.id)}
                          />
                        )}
                        {sentToActual.has(budget.inclusion.id) && (
                          <CheckCheck className="w-4 h-4 text-green-600" />
                        )}
                        <div>
                          <span className="font-semibold text-gray-900 dark:text-gray-100">
                            {getCollaboratorName(budget.inclusion.collaboratorId)}
                          </span>
                          <div className="text-xs text-gray-500">
                            {getFunctionName(budget.inclusion.functionId)}
                            <span className="mx-1">•</span>
                            <span className={budget.collaborator?.type === 'casa' || budget.collaborator?.type === 'local' ? 'text-blue-600' : 'text-orange-600'}>
                              {budget.collaborator?.type === 'casa' || budget.collaborator?.type === 'local' ? 'Casa' : 'Freela'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {budget.hasOverride && (
                          <span className="w-2 h-2 rounded-full bg-yellow-500" title="Valores personalizados" />
                        )}
                        {canEdit && !sentToActual.has(budget.inclusion.id) && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50" onClick={() => openEditModal(budget)}>
                            <Edit className="w-3 h-3" />
                          </Button>
                        )}
                        {!sentToActual.has(budget.inclusion.id) && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                            onClick={() => setConfirmSendSingle(budget)}
                          >
                            <Send className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    {/* Corpo do Card */}
                    <div className="p-3 space-y-2 text-sm">
                      <div className="flex justify-between items-center pb-2 border-b">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-blue-500" />
                          <span className="text-gray-500">Diárias: {budget.qtdDiarias} x {formatCurrency(budget.valorDiaria)}</span>
                        </div>
                        <span className="font-bold text-blue-600">{formatCurrency(budget.subtotalDiarias)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <Car className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-gray-500">Mobilidade</span>
                        </div>
                        <span className="font-medium">{formatCurrency(budget.mobilidade)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <Utensils className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-gray-500">Alimentação</span>
                        </div>
                        <span className="font-medium">{formatCurrency(budget.almocoSemana + budget.jantarSemana + budget.almocoFds + budget.jantarFds)}</span>
                      </div>
                      <div className="flex justify-between items-center pt-1 border-t text-orange-600 font-medium">
                        <span>Ajuda de Custo</span>
                        <span>{formatCurrency(budget.ajudaCusto)}</span>
                      </div>
                      <div className="flex justify-between items-center bg-green-100 dark:bg-green-900/50 p-2 rounded">
                        <span className="font-bold text-green-800 dark:text-green-300">TOTAL</span>
                        <span className="font-bold text-lg text-green-700 dark:text-green-300">{formatCurrency(budget.totalFinal)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal de Edição */}
      <Dialog open={!!editingBudget} onOpenChange={() => { setEditingBudget(null); setEditingBudgetInfo(null); }}>
        <DialogContent className="max-w-[680px] w-[95vw] p-0 gap-0 rounded-2xl overflow-hidden border-0 shadow-2xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Editar Orçamento</DialogTitle>
          </DialogHeader>
          
          {editingBudget && editingBudgetInfo && (
            <>
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-8 py-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-blue-200 text-xs font-medium uppercase tracking-wider mb-1">Editar Orçamento</p>
                    <h2 className="text-xl font-bold">{editingBudgetInfo.name}</h2>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-blue-100 text-sm">{editingBudgetInfo.functionName}</span>
                      <span className="bg-white/20 text-white px-2.5 py-0.5 rounded-md text-xs font-medium">{editingBudgetInfo.type}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-blue-200 text-xs">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{editingBudgetInfo.period}</span>
                      <span className="text-blue-300/50">|</span>
                      <span>{editingBudgetInfo.weekdays} dias úteis</span>
                      <span className="text-blue-300/50">|</span>
                      <span>{editingBudgetInfo.weekends} fins de semana</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Corpo */}
              <div className="max-h-[55vh] overflow-y-auto px-8 py-6 space-y-6 bg-white dark:bg-gray-900">
                
                {/* Diárias */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                      <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wide">Diárias</h3>
                  </div>
                  <div className="grid grid-cols-3 gap-4 items-end">
                    <div>
                      <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">Quantidade</label>
                      <Input 
                        type="number" className="h-11 text-base"
                        value={editingBudget.qtdDiarias} 
                        onChange={e => setEditingBudget({...editingBudget, qtdDiarias: parseInt(e.target.value) || 0})}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">Valor unitário (R$)</label>
                      <Input 
                        type="number" step="0.01" className="h-11 text-base"
                        value={(editingBudget.valorDiaria / 100).toFixed(2)} 
                        onChange={e => setEditingBudget({...editingBudget, valorDiaria: Math.round(parseFloat(e.target.value) * 100) || 0})}
                      />
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg px-4 py-2.5 text-right">
                      <div className="text-[10px] uppercase text-blue-500 dark:text-blue-400 font-medium tracking-wider">Subtotal</div>
                      <div className="text-lg font-bold text-blue-700 dark:text-blue-300">{formatCurrency(editingBudget.qtdDiarias * editingBudget.valorDiaria)}</div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800" />

                {/* Mobilidade */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
                      <Car className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    </div>
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wide">Mobilidade</h3>
                  </div>
                  <div className="grid grid-cols-3 gap-4 items-end">
                    <div>
                      <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">Valor total (R$)</label>
                      <Input 
                        type="number" step="0.01" className="h-11 text-base"
                        value={(editingBudget.mobilidade / 100).toFixed(2)} 
                        onChange={e => setEditingBudget({...editingBudget, mobilidade: Math.round(parseFloat(e.target.value) * 100) || 0})}
                      />
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg px-4 py-2.5 text-right col-span-2">
                      <div className="text-[10px] uppercase text-slate-400 font-medium tracking-wider">Valor por dia</div>
                      <div className="text-base font-semibold text-slate-600 dark:text-slate-300">
                        {editingBudget.qtdDiarias > 0 ? formatCurrency(Math.round(editingBudget.mobilidade / editingBudget.qtdDiarias)) : '—'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800" />

                {/* Alimentação */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center">
                      <Utensils className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                    </div>
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wide">Alimentação</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-5">
                    {/* Dias Úteis */}
                    <div className="bg-slate-50 dark:bg-slate-800/30 rounded-xl p-4">
                      <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 text-center">
                        Dias Úteis ({editingBudgetInfo.weekdays} dias)
                      </div>
                      <div className="space-y-3">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Almoço (R$)</label>
                            <span className="text-[10px] text-slate-400">{editingBudgetInfo.weekdays > 0 ? formatCurrency(Math.round(editingBudget.almocoSemana / editingBudgetInfo.weekdays)) : '—'}/dia</span>
                          </div>
                          <Input 
                            type="number" step="0.01" className="h-11 text-base"
                            value={(editingBudget.almocoSemana / 100).toFixed(2)} 
                            onChange={e => setEditingBudget({...editingBudget, almocoSemana: Math.round(parseFloat(e.target.value) * 100) || 0})}
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Jantar (R$)</label>
                            <span className="text-[10px] text-slate-400">{editingBudgetInfo.weekdays > 0 ? formatCurrency(Math.round(editingBudget.jantarSemana / editingBudgetInfo.weekdays)) : '—'}/dia</span>
                          </div>
                          <Input 
                            type="number" step="0.01" className="h-11 text-base"
                            value={(editingBudget.jantarSemana / 100).toFixed(2)} 
                            onChange={e => setEditingBudget({...editingBudget, jantarSemana: Math.round(parseFloat(e.target.value) * 100) || 0})}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Fins de Semana */}
                    <div className="bg-slate-50 dark:bg-slate-800/30 rounded-xl p-4">
                      <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 text-center">
                        Fins de Semana ({editingBudgetInfo.weekends} dias)
                      </div>
                      <div className="space-y-3">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Almoço (R$)</label>
                            <span className="text-[10px] text-slate-400">{editingBudgetInfo.weekends > 0 ? formatCurrency(Math.round(editingBudget.almocoFds / editingBudgetInfo.weekends)) : '—'}/dia</span>
                          </div>
                          <Input 
                            type="number" step="0.01" className="h-11 text-base"
                            value={(editingBudget.almocoFds / 100).toFixed(2)} 
                            onChange={e => setEditingBudget({...editingBudget, almocoFds: Math.round(parseFloat(e.target.value) * 100) || 0})}
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Jantar (R$)</label>
                            <span className="text-[10px] text-slate-400">{editingBudgetInfo.weekends > 0 ? formatCurrency(Math.round(editingBudget.jantarFds / editingBudgetInfo.weekends)) : '—'}/dia</span>
                          </div>
                          <Input 
                            type="number" step="0.01" className="h-11 text-base"
                            value={(editingBudget.jantarFds / 100).toFixed(2)} 
                            onChange={e => setEditingBudget({...editingBudget, jantarFds: Math.round(parseFloat(e.target.value) * 100) || 0})}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-8 py-5 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
                <div className="bg-green-50 dark:bg-green-900/30 rounded-xl px-5 py-3">
                  <div className="text-[10px] uppercase text-green-600 dark:text-green-400 font-semibold tracking-wider">Total Geral</div>
                  <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                    {formatCurrency(
                      (editingBudget.qtdDiarias * editingBudget.valorDiaria) + 
                      editingBudget.mobilidade + 
                      editingBudget.almocoSemana + 
                      editingBudget.jantarSemana + 
                      editingBudget.almocoFds + 
                      editingBudget.jantarFds
                    )}
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="h-11 px-5" onClick={() => { setEditingBudget(null); setEditingBudgetInfo(null); }}>Cancelar</Button>
                  <Button onClick={saveEdit} className="h-11 px-6 bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/25">Salvar Alterações</Button>
                </div>
              </div>
            </>
          )}
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
                  sendToActualMutation.mutate(confirmSendSingle);
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
