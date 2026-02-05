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
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Calculator, Users, Calendar, MapPin, RefreshCw, CheckCircle2, Edit } from "lucide-react";
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

export default function BudgetPlannedPage() {
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [editingBudget, setEditingBudget] = useState<BudgetEdit | null>(null);
  const [budgetOverrides, setBudgetOverrides] = useState<Record<string, BudgetEdit>>({});
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();

  const canEdit = user?.role === "administrador" || user?.role === "rh";

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

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Orçamento Planejado</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Escalações confirmadas - cálculo automático</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="w-5 h-5 text-blue-600" />
            Selecione o Evento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedEventId} onValueChange={setSelectedEventId}>
            <SelectTrigger className="w-full md:w-96">
              <SelectValue placeholder="Escolha um evento para ver o orçamento" />
            </SelectTrigger>
            <SelectContent>
              {events?.map(event => (
                <SelectItem key={event.id} value={event.id}>
                  <div className="flex items-center gap-2">
                    <span>{event.name}</span>
                    <span className="text-xs text-gray-500">- {event.location}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedEventId && selectedEvent && (
        <>
          <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border-blue-200 dark:border-blue-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="bg-blue-600 text-white p-3 rounded-lg">
                    <Calculator className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{selectedEvent.name}</h2>
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <MapPin className="w-4 h-4" />
                      {selectedEvent.location}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <div className="text-sm text-gray-500">Confirmados</div>
                    <div className="text-2xl font-bold text-blue-600">{calculatedBudgets.length}</div>
                  </div>
                  <Separator orientation="vertical" className="h-12" />
                  <div className="text-center">
                    <div className="text-sm text-gray-500">Total Planejado</div>
                    <div className="text-2xl font-bold text-green-600">{formatCurrency(totalGeral)}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {isLoadingInclusions || isLoadingFunctionValues ? (
            <div className="text-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-gray-400" />
              <p className="mt-2 text-gray-500">Calculando orçamento...</p>
            </div>
          ) : calculatedBudgets.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center">
                <Users className="w-12 h-12 mx-auto text-gray-300" />
                <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">Nenhuma escalação confirmada</h3>
                <p className="mt-2 text-gray-500">Apenas escalações com status "confirmado" aparecem aqui</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {calculatedBudgets.map((budget) => (
                <Card 
                  key={budget.inclusion.id} 
                  className={`transition-all hover:shadow-md ${budget.hasOverride ? 'border-yellow-400 bg-yellow-50/50 dark:bg-yellow-950/30' : 'border-gray-200'}`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base font-semibold">
                          {getCollaboratorName(budget.inclusion.collaboratorId)}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-1 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {getFunctionName(budget.inclusion.functionId)}
                          </Badge>
                          {budget.hasOverride && (
                            <Badge variant="secondary" className="text-xs bg-yellow-200 text-yellow-800">
                              Editado
                            </Badge>
                          )}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-1">
                        {canEdit && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditModal(budget)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                        )}
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Qtd Diárias:</span>
                        <span className="font-medium">{budget.qtdDiarias}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Valor Diária:</span>
                        <span className="font-medium">{formatCurrency(budget.valorDiaria)}</span>
                      </div>
                      <div className="flex justify-between bg-blue-50 dark:bg-blue-950 p-1.5 rounded">
                        <span className="text-blue-700 dark:text-blue-300">Subtotal Diárias:</span>
                        <span className="font-medium text-blue-700 dark:text-blue-300">{formatCurrency(budget.subtotalDiarias)}</span>
                      </div>
                      <Separator className="my-1" />
                      <div className="flex justify-between">
                        <span className="text-gray-500">Mobilidade:</span>
                        <span className="font-medium">{formatCurrency(budget.mobilidade)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Almoço Semana:</span>
                        <span className="font-medium">{formatCurrency(budget.almocoSemana)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Jantar Semana:</span>
                        <span className="font-medium">{formatCurrency(budget.jantarSemana)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Almoço FDS:</span>
                        <span className="font-medium">{formatCurrency(budget.almocoFds)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Jantar FDS:</span>
                        <span className="font-medium">{formatCurrency(budget.jantarFds)}</span>
                      </div>
                      <div className="flex justify-between bg-orange-50 dark:bg-orange-950 p-1.5 rounded">
                        <span className="text-orange-700 dark:text-orange-300">Ajuda de Custo:</span>
                        <span className="font-medium text-orange-700 dark:text-orange-300">{formatCurrency(budget.ajudaCusto)}</span>
                      </div>
                      <Separator className="my-1" />
                      <div className="flex justify-between items-center bg-green-100 dark:bg-green-900 p-2 rounded">
                        <span className="text-green-800 dark:text-green-200 font-bold">TOTAL:</span>
                        <span className="text-lg font-bold text-green-700 dark:text-green-300">
                          {formatCurrency(budget.totalFinal)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {!selectedEventId && (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <Calendar className="w-12 h-12 mx-auto text-gray-300" />
            <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">Selecione um evento</h3>
            <p className="mt-2 text-gray-500">Escolha um evento acima para ver o orçamento das escalações confirmadas</p>
          </CardContent>
        </Card>
      )}

      {/* Modal de Edição */}
      <Dialog open={!!editingBudget} onOpenChange={() => setEditingBudget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Valores do Planejado</DialogTitle>
          </DialogHeader>
          
          {editingBudget && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Qtd Diárias</Label>
                  <Input 
                    type="number" 
                    value={editingBudget.qtdDiarias} 
                    onChange={e => setEditingBudget({...editingBudget, qtdDiarias: parseInt(e.target.value) || 0})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Valor Diária (R$)</Label>
                  <Input 
                    type="number" 
                    step="0.01"
                    value={editingBudget.valorDiaria / 100} 
                    onChange={e => setEditingBudget({...editingBudget, valorDiaria: Math.round(parseFloat(e.target.value) * 100) || 0})}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Mobilidade (R$)</Label>
                <Input 
                  type="number" 
                  step="0.01"
                  value={editingBudget.mobilidade / 100} 
                  onChange={e => setEditingBudget({...editingBudget, mobilidade: Math.round(parseFloat(e.target.value) * 100) || 0})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Almoço Semana (R$)</Label>
                  <Input 
                    type="number" 
                    step="0.01"
                    value={editingBudget.almocoSemana / 100} 
                    onChange={e => setEditingBudget({...editingBudget, almocoSemana: Math.round(parseFloat(e.target.value) * 100) || 0})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Jantar Semana (R$)</Label>
                  <Input 
                    type="number" 
                    step="0.01"
                    value={editingBudget.jantarSemana / 100} 
                    onChange={e => setEditingBudget({...editingBudget, jantarSemana: Math.round(parseFloat(e.target.value) * 100) || 0})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Almoço FDS (R$)</Label>
                  <Input 
                    type="number" 
                    step="0.01"
                    value={editingBudget.almocoFds / 100} 
                    onChange={e => setEditingBudget({...editingBudget, almocoFds: Math.round(parseFloat(e.target.value) * 100) || 0})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Jantar FDS (R$)</Label>
                  <Input 
                    type="number" 
                    step="0.01"
                    value={editingBudget.jantarFds / 100} 
                    onChange={e => setEditingBudget({...editingBudget, jantarFds: Math.round(parseFloat(e.target.value) * 100) || 0})}
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingBudget(null)}>Cancelar</Button>
            <Button onClick={saveEdit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
