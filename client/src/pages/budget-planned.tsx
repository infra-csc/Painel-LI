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
import { Calculator, Users, Calendar, MapPin, RefreshCw, Edit, Send, CheckCheck } from "lucide-react";
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
  ajudaCusto: number;
  totalFinal: number;
  hasOverride: boolean;
}

export default function BudgetPlannedPage() {
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [editingBudget, setEditingBudget] = useState<BudgetEdit | null>(null);
  const [budgetOverrides, setBudgetOverrides] = useState<Record<string, BudgetEdit>>({});
  const [sentToActual, setSentToActual] = useState<Set<string>>(new Set());
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [confirmSendSingle, setConfirmSendSingle] = useState<CalculatedBudget | null>(null);
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
      
      const mobilidade = override?.mobilidade ?? fv?.mobility ?? 2500;
      const almocoSemana = override?.almocoSemana ?? ((fv?.weekdayLunch || 3500) * qtdDiarias);
      const jantarSemana = override?.jantarSemana ?? ((fv?.weekdayDinner || 4000) * qtdDiarias);
      const almocoFds = override?.almocoFds ?? ((fv?.weekendLunch || 4000) * Math.ceil(qtdDiarias / 5));
      const jantarFds = override?.jantarFds ?? ((fv?.weekendDinner || 4500) * Math.ceil(qtdDiarias / 5));
      
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
        ajudaCusto,
        totalFinal,
        hasOverride: !!override,
      };
    });
  }, [confirmedInclusions, functionValues, collaborators, budgetOverrides]);

  const totalGeral = useMemo(() => {
    return calculatedBudgets.reduce((sum, b) => sum + b.totalFinal, 0);
  }, [calculatedBudgets]);

  const openEditModal = (budget: typeof calculatedBudgets[0]) => {
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
            {/* Resumo do Evento */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-4 mb-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-gray-400" />
                  <div>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{selectedEvent?.name}</span>
                    <span className="text-gray-500 ml-2 text-sm">{selectedEvent?.location}</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-6">
                  <div className="text-center px-4 border-r">
                    <div className="text-2xl font-bold text-blue-600">{calculatedBudgets.length}</div>
                    <div className="text-xs text-gray-500 uppercase">Confirmados</div>
                  </div>
                  <div className="text-center px-4">
                    <div className="text-2xl font-bold text-green-600">{formatCurrency(totalGeral)}</div>
                    <div className="text-xs text-gray-500 uppercase">Total</div>
                  </div>
                  
                  {pendingCount > 0 && (
                    <div className="flex items-center gap-2 pl-4 border-l">
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
                          className="bg-purple-600 hover:bg-purple-700"
                        >
                          <Send className="w-3 h-3 mr-1" />
                          Enviar ({selectedCards.size})
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Conteúdo */}
            {isLoadingInclusions || isLoadingFunctionValues ? (
              <div className="flex items-center justify-center py-20">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            ) : calculatedBudgets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <Users className="w-16 h-16 text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300">Nenhuma escalação confirmada</h3>
                <p className="text-gray-500 mt-1">Apenas escalações com status confirmado aparecem aqui</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {calculatedBudgets.map((budget) => (
                  <div 
                    key={budget.inclusion.id} 
                    className={`bg-white dark:bg-gray-800 rounded-lg border shadow-sm hover:shadow-md transition-all ${
                      selectedCards.has(budget.inclusion.id) 
                        ? 'ring-2 ring-purple-500 border-purple-400' 
                        : sentToActual.has(budget.inclusion.id)
                          ? 'border-green-300 bg-green-50/50 dark:bg-green-950/20'
                          : budget.hasOverride 
                            ? 'border-yellow-300 bg-yellow-50/30' 
                            : 'border-gray-200'
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
                          <div className="font-medium text-sm text-gray-900 dark:text-gray-100">
                            {getCollaboratorName(budget.inclusion.collaboratorId)}
                          </div>
                          <div className="text-xs text-gray-500">{getFunctionName(budget.inclusion.functionId)}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {budget.hasOverride && (
                          <Badge className="text-xs bg-yellow-100 text-yellow-700 border-yellow-300">Editado</Badge>
                        )}
                        {canEdit && !sentToActual.has(budget.inclusion.id) && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditModal(budget)}>
                            <Edit className="w-3 h-3" />
                          </Button>
                        )}
                        {!sentToActual.has(budget.inclusion.id) && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 text-purple-600"
                            onClick={() => setConfirmSendSingle(budget)}
                          >
                            <Send className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    {/* Corpo do Card - Compacto */}
                    <div className="p-3 space-y-2 text-xs">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Diárias:</span>
                          <span className="font-medium">{budget.qtdDiarias} x {formatCurrency(budget.valorDiaria)}</span>
                        </div>
                        <div className="flex justify-between text-blue-600 font-medium">
                          <span>Subtotal:</span>
                          <span>{formatCurrency(budget.subtotalDiarias)}</span>
                        </div>
                      </div>
                      
                      <div className="bg-gray-50 dark:bg-gray-700/50 rounded p-2 grid grid-cols-2 gap-1">
                        <div className="flex justify-between"><span className="text-gray-500">Mobilidade:</span><span>{formatCurrency(budget.mobilidade)}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Alm. Sem:</span><span>{formatCurrency(budget.almocoSemana)}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Jan. Sem:</span><span>{formatCurrency(budget.jantarSemana)}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Alm. FDS:</span><span>{formatCurrency(budget.almocoFds)}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Jan. FDS:</span><span>{formatCurrency(budget.jantarFds)}</span></div>
                        <div className="flex justify-between text-orange-600 font-medium"><span>Ajuda:</span><span>{formatCurrency(budget.ajudaCusto)}</span></div>
                      </div>
                      
                      <div className="flex justify-between items-center bg-green-100 dark:bg-green-900/50 p-2 rounded font-bold">
                        <span className="text-green-800 dark:text-green-300">TOTAL</span>
                        <span className="text-green-700 dark:text-green-300 text-sm">{formatCurrency(budget.totalFinal)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal de Edição - Melhorado */}
      <Dialog open={!!editingBudget} onOpenChange={() => setEditingBudget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Editar Valores do Orçamento</DialogTitle>
          </DialogHeader>
          
          {editingBudget && (
            <div className="space-y-6 py-4">
              {/* Diárias */}
              <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-4">
                <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-3">Diárias</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-sm text-gray-600">Quantidade</Label>
                    <Input 
                      type="number" 
                      className="text-lg font-medium"
                      value={editingBudget.qtdDiarias} 
                      onChange={e => setEditingBudget({...editingBudget, qtdDiarias: parseInt(e.target.value) || 0})}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm text-gray-600">Valor Unitário (R$)</Label>
                    <Input 
                      type="number" 
                      step="0.01"
                      className="text-lg font-medium"
                      value={(editingBudget.valorDiaria / 100).toFixed(2)} 
                      onChange={e => setEditingBudget({...editingBudget, valorDiaria: Math.round(parseFloat(e.target.value) * 100) || 0})}
                    />
                  </div>
                </div>
                <div className="mt-2 text-right text-sm text-blue-700 dark:text-blue-300">
                  Subtotal: {formatCurrency(editingBudget.qtdDiarias * editingBudget.valorDiaria)}
                </div>
              </div>

              {/* Mobilidade */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-3">Mobilidade</h4>
                <div className="space-y-1">
                  <Label className="text-sm text-gray-600">Valor Total (R$)</Label>
                  <Input 
                    type="number" 
                    step="0.01"
                    className="text-lg font-medium max-w-xs"
                    value={(editingBudget.mobilidade / 100).toFixed(2)} 
                    onChange={e => setEditingBudget({...editingBudget, mobilidade: Math.round(parseFloat(e.target.value) * 100) || 0})}
                  />
                </div>
              </div>

              {/* Alimentação */}
              <div className="bg-orange-50 dark:bg-orange-950 rounded-lg p-4">
                <h4 className="font-semibold text-orange-800 dark:text-orange-200 mb-3">Alimentação</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Dias de Semana</div>
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-500">Almoço (R$)</Label>
                      <Input 
                        type="number" 
                        step="0.01"
                        value={(editingBudget.almocoSemana / 100).toFixed(2)} 
                        onChange={e => setEditingBudget({...editingBudget, almocoSemana: Math.round(parseFloat(e.target.value) * 100) || 0})}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-500">Jantar (R$)</Label>
                      <Input 
                        type="number" 
                        step="0.01"
                        value={(editingBudget.jantarSemana / 100).toFixed(2)} 
                        onChange={e => setEditingBudget({...editingBudget, jantarSemana: Math.round(parseFloat(e.target.value) * 100) || 0})}
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Fim de Semana</div>
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-500">Almoço (R$)</Label>
                      <Input 
                        type="number" 
                        step="0.01"
                        value={(editingBudget.almocoFds / 100).toFixed(2)} 
                        onChange={e => setEditingBudget({...editingBudget, almocoFds: Math.round(parseFloat(e.target.value) * 100) || 0})}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-500">Jantar (R$)</Label>
                      <Input 
                        type="number" 
                        step="0.01"
                        value={(editingBudget.jantarFds / 100).toFixed(2)} 
                        onChange={e => setEditingBudget({...editingBudget, jantarFds: Math.round(parseFloat(e.target.value) * 100) || 0})}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Total Estimado */}
              <div className="bg-green-100 dark:bg-green-900 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-green-800 dark:text-green-200">Total Estimado:</span>
                  <span className="text-2xl font-bold text-green-700 dark:text-green-300">
                    {formatCurrency(
                      (editingBudget.qtdDiarias * editingBudget.valorDiaria) + 
                      editingBudget.mobilidade + 
                      editingBudget.almocoSemana + 
                      editingBudget.jantarSemana + 
                      editingBudget.almocoFds + 
                      editingBudget.jantarFds
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingBudget(null)}>Cancelar</Button>
            <Button onClick={saveEdit} className="bg-blue-600 hover:bg-blue-700">Salvar Alterações</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação - Envio em Lote */}
      <Dialog open={confirmSendOpen} onOpenChange={setConfirmSendOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Send className="w-5 h-5 text-purple-600" />
              Confirmar Envio
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-gray-600 dark:text-gray-400">
              Você está prestes a enviar <strong className="text-purple-600">{selectedCards.size} itens</strong> para o Realizado.
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
              <Send className="w-5 h-5 text-purple-600" />
              Confirmar Envio
            </DialogTitle>
          </DialogHeader>
          {confirmSendSingle && (
            <div className="py-4">
              <p className="text-gray-600 dark:text-gray-400">
                Enviar orçamento de <strong className="text-purple-600">{getCollaboratorName(confirmSendSingle.inclusion.collaboratorId)}</strong> para o Realizado?
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
