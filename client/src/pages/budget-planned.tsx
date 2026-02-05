import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Calculator, DollarSign, Users, Calendar, MapPin, RefreshCw, CheckCircle2, Settings2 } from "lucide-react";
import type { Event, Function, Collaborator, TeamInclusion, FunctionValue, BudgetPlanned } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";

export default function BudgetPlannedPage() {
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: events } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: functions } = useQuery<Function[]>({ queryKey: ["/api/functions"] });
  const { data: collaborators } = useQuery<Collaborator[]>({ queryKey: ["/api/collaborators"] });
  const { data: functionValues } = useQuery<FunctionValue[]>({ queryKey: ["/api/function-values"] });
  
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

  const { data: budgetPlanned } = useQuery<BudgetPlanned[]>({
    queryKey: ["/api/budget-planned", selectedEventId],
    queryFn: async () => {
      const url = selectedEventId ? `/api/budget-planned?eventId=${selectedEventId}` : "/api/budget-planned";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch budget planned");
      return res.json();
    },
    enabled: !!selectedEventId,
  });

  const generateDefaultsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/function-values/generate-defaults", {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Sucesso", description: `${data.created} valores padrão criados` });
      qc.invalidateQueries({ queryKey: ["/api/function-values"] });
    },
    onError: () => {
      toast({ title: "Erro", description: "Erro ao gerar valores padrão", variant: "destructive" });
    },
  });

  const generateBudgetMutation = useMutation({
    mutationFn: async () => {
      if (!teamInclusions || !functionValues) throw new Error("Dados não carregados");
      
      const created = [];
      for (const inclusion of teamInclusions) {
        const existing = budgetPlanned?.find(
          bp => bp.eventId === inclusion.eventId && 
                bp.collaboratorId === inclusion.collaboratorId &&
                bp.functionId === inclusion.functionId
        );
        
        if (!existing) {
          const fv = functionValues.find(v => v.functionId === inclusion.functionId);
          const collab = collaborators?.find(c => c.id === inclusion.collaboratorId);
          const collabType = collab?.type || "freela";
          
          const dailyQty = inclusion.dailyRates || 0;
          const dailyValue = fv?.dailyValue || 25000;
          const costAssistance = fv?.costAssistance || 7000;
          const mobility = fv?.mobility || 2500;
          
          let weekdayLunch = 0, weekdayDinner = 0, weekendLunch = 0, weekendDinner = 0;
          if (collabType === "freela") {
            weekdayLunch = (fv?.weekdayLunch || 3500) * dailyQty;
            weekdayDinner = (fv?.weekdayDinner || 4000) * dailyQty;
          }
          weekendLunch = (fv?.weekendLunch || 4000) * Math.ceil(dailyQty / 5);
          weekendDinner = (fv?.weekendDinner || 4500) * Math.ceil(dailyQty / 5);
          
          const totalValue = (dailyQty * dailyValue) + costAssistance + weekdayLunch + weekdayDinner + weekendLunch + weekendDinner + mobility;
          
          const res = await apiRequest("POST", "/api/budget-planned", {
            eventId: inclusion.eventId,
            collaboratorId: inclusion.collaboratorId,
            functionId: inclusion.functionId,
            collaboratorType: collabType,
            dailyQuantity: dailyQty,
            dailyValue: dailyValue,
            costAssistance: costAssistance,
            weekdayLunch: weekdayLunch,
            weekdayDinner: weekdayDinner,
            weekendLunch: weekendLunch,
            weekendDinner: weekendDinner,
            mobility: mobility,
            transport: 0,
            totalValue: totalValue,
            observations: `Gerado automaticamente da escalação #${inclusion.inclusionNumber}`,
            createdBy: user?.id,
          });
          created.push(await res.json());
        }
      }
      return { created: created.length };
    },
    onSuccess: (data) => {
      toast({ title: "Sucesso", description: `${data.created} itens de orçamento criados` });
      qc.invalidateQueries({ queryKey: ["/api/budget-planned"] });
    },
    onError: () => {
      toast({ title: "Erro", description: "Erro ao gerar orçamento", variant: "destructive" });
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

  const getFunctionValue = (functionId: string | null) => {
    if (!functionId) return null;
    return functionValues?.find(fv => fv.functionId === functionId);
  };

  const selectedEvent = events?.find(e => e.id === selectedEventId);
  
  const totalPlanned = useMemo(() => {
    return budgetPlanned?.reduce((sum, bp) => sum + bp.totalValue, 0) || 0;
  }, [budgetPlanned]);

  const inclusionsWithBudget = useMemo(() => {
    if (!teamInclusions) return [];
    return teamInclusions.map(inc => {
      const budget = budgetPlanned?.find(
        bp => bp.eventId === inc.eventId && 
              bp.collaboratorId === inc.collaboratorId &&
              bp.functionId === inc.functionId
      );
      return { inclusion: inc, budget };
    });
  }, [teamInclusions, budgetPlanned]);

  const hasAllBudgets = inclusionsWithBudget.every(item => item.budget);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Orçamento Planejado</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Baseado nas escalações da inclusão de equipe</p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => generateDefaultsMutation.mutate()}
          disabled={generateDefaultsMutation.isPending}
        >
          <Settings2 className="w-4 h-4 mr-2" />
          Configurar Valores Padrão
        </Button>
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
              <SelectValue placeholder="Escolha um evento para ver as escalações" />
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
                    <div className="text-sm text-gray-500">Escalações</div>
                    <div className="text-2xl font-bold text-blue-600">{teamInclusions?.length || 0}</div>
                  </div>
                  <Separator orientation="vertical" className="h-12" />
                  <div className="text-center">
                    <div className="text-sm text-gray-500">Total Planejado</div>
                    <div className="text-2xl font-bold text-green-600">{formatCurrency(totalPlanned)}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {!hasAllBudgets && teamInclusions && teamInclusions.length > 0 && (
            <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <RefreshCw className="w-5 h-5 text-orange-600" />
                  <span className="text-orange-800 dark:text-orange-200">
                    Existem {inclusionsWithBudget.filter(i => !i.budget).length} escalações sem orçamento calculado
                  </span>
                </div>
                <Button 
                  onClick={() => generateBudgetMutation.mutate()}
                  disabled={generateBudgetMutation.isPending}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  <Calculator className="w-4 h-4 mr-2" />
                  Gerar Orçamento Automático
                </Button>
              </CardContent>
            </Card>
          )}

          {isLoadingInclusions ? (
            <div className="text-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-gray-400" />
              <p className="mt-2 text-gray-500">Carregando escalações...</p>
            </div>
          ) : teamInclusions && teamInclusions.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center">
                <Users className="w-12 h-12 mx-auto text-gray-300" />
                <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">Nenhuma escalação encontrada</h3>
                <p className="mt-2 text-gray-500">Adicione colaboradores na tela de Inclusão de Equipe primeiro</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {inclusionsWithBudget.map(({ inclusion, budget }) => {
                const fv = getFunctionValue(inclusion.functionId);
                const dailyValue = fv?.dailyValue || 25000;
                const estimatedTotal = budget?.totalValue || ((inclusion.dailyRates || 0) * dailyValue + (fv?.costAssistance || 0));
                
                return (
                  <Card 
                    key={inclusion.id} 
                    className={`transition-all hover:shadow-md ${budget ? 'border-green-200 bg-green-50/50 dark:bg-green-950/30' : 'border-gray-200'}`}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base font-semibold">
                            {getCollaboratorName(inclusion.collaboratorId)}
                          </CardTitle>
                          <CardDescription className="flex items-center gap-1 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {getFunctionName(inclusion.functionId)}
                            </Badge>
                          </CardDescription>
                        </div>
                        {budget && (
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="pt-2">
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Diárias:</span>
                          <span className="font-medium">{inclusion.dailyRates || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Valor/dia:</span>
                          <span className="font-medium">{formatCurrency(dailyValue)}</span>
                        </div>
                        {fv && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Ajuda de custo:</span>
                            <span className="font-medium">{formatCurrency(fv.costAssistance)}</span>
                          </div>
                        )}
                        <Separator className="my-2" />
                        <div className="flex justify-between items-center">
                          <span className="text-gray-700 dark:text-gray-300 font-medium">Total:</span>
                          <span className="text-lg font-bold text-green-600">
                            {formatCurrency(estimatedTotal)}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {!selectedEventId && (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <Calendar className="w-12 h-12 mx-auto text-gray-300" />
            <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">Selecione um evento</h3>
            <p className="mt-2 text-gray-500">Escolha um evento acima para ver as escalações e calcular o orçamento</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
