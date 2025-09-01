import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import NavigationTabs from "@/components/layout/navigation-tabs";
import WorkflowIndicator from "@/components/layout/workflow-indicator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import StatusBadge from "@/components/common/status-badge";
import CollaboratorModal from "@/components/modals/collaborator-modal";
import { Calculator, Save, DollarSign, Plus } from "lucide-react";
import type { TeamInclusion, Event, Function, Collaborator, Financial, Ticket } from "@shared/schema";

export default function Closure() {
  const [financialData, setFinancialData] = useState<Record<string, any>>({});
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: teamInclusions, isLoading } = useQuery<TeamInclusion[]>({
    queryKey: ["/api/team-inclusions"],
  });

  const { data: events } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const { data: functions } = useQuery<Function[]>({
    queryKey: ["/api/functions"],
  });

  const { data: collaborators } = useQuery<Collaborator[]>({
    queryKey: ["/api/collaborators"],
  });

  const { data: tickets } = useQuery<Ticket[]>({
    queryKey: ["/api/tickets"],
  });

  const { data: financials } = useQuery<Financial[]>({
    queryKey: ["/api/financial"],
  });

  const createFinancialMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/financial", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financial"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    },
  });

  const updateTeamInclusionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PATCH", `/api/team-inclusions/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    },
  });

  // Filter inclusions that need financial closure
  const closureInclusions = teamInclusions?.filter(
    inclusion => inclusion.status === "fechamento" && inclusion.collaboratorId
  ) || [];

  const getEventName = (eventId: string) => {
    return events?.find(e => e.id === eventId)?.name || "Evento não encontrado";
  };

  const getFunctionName = (functionId: string) => {
    return functions?.find(f => f.id === functionId)?.name || "Função não encontrada";
  };

  const getCollaboratorName = (collaboratorId?: string) => {
    if (!collaboratorId) return "Não escalado";
    return collaborators?.find(c => c.id === collaboratorId)?.fullName || "Colaborador não encontrado";
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    // Parse manual para evitar problemas de timezone
    const [year, month, day] = dateStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    return date.toLocaleDateString("pt-BR");
  };

  const getTicket = (inclusionId: string) => {
    return tickets?.find(ticket => ticket.teamInclusionId === inclusionId);
  };

  const getFinancial = (inclusionId: string) => {
    return financials?.find(financial => financial.teamInclusionId === inclusionId);
  };

  const calculateTotalValue = (inclusion: TeamInclusion) => {
    const ticket = getTicket(inclusion.id);
    const ticketValue = ticket?.value || 0;
    const plannedDailyValue = inclusion.dailyValue * inclusion.dailyRates;
    return ticketValue + plannedDailyValue;
  };

  const handleFinancialDataChange = (inclusionId: string, field: string, value: any) => {
    setFinancialData(prev => ({
      ...prev,
      [inclusionId]: {
        ...prev[inclusionId],
        [field]: value
      }
    }));
  };

  const handleFinancialClosure = async (inclusion: TeamInclusion) => {
    const data = financialData[inclusion.id] || {};
    
    if (!data.actualDailyRates) {
      toast({
        title: "Erro",
        description: "Preencha o valor total das diárias realizadas",
        variant: "destructive",
      });
      return;
    }

    try {
      // First create the financial record
      await createFinancialMutation.mutateAsync({
        teamInclusionId: inclusion.id,
        actualDailyRates: Math.round(parseFloat(data.actualDailyRates) * 100), // Convert to cents and round
        actualFee: 0, // Fee field removed as per user request
        observations: data.observations || null
      });

      // Then update team inclusion status to approval phase
      await updateTeamInclusionMutation.mutateAsync({
        id: inclusion.id,
        data: {
          status: "aprovacao",
          phase: "aprovacao"
        }
      });

      // Show success message only if both operations succeed
      toast({
        title: "Sucesso",
        description: "Fechamento financeiro registrado com sucesso",
      });

      // Clear the form data for this inclusion
      setFinancialData(prev => {
        const newData = { ...prev };
        delete newData[inclusion.id];
        return newData;
      });

    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao registrar fechamento financeiro",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <NavigationTabs activeTab="closure" />
          <WorkflowIndicator currentPhase="fechamento" />
          <div className="bg-card rounded-lg shadow-sm border border-border p-6 animate-pulse">
            <div className="h-8 bg-muted rounded mb-4 w-1/3"></div>
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-32 bg-muted rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <NavigationTabs activeTab="closure" />
        <WorkflowIndicator currentPhase="fechamento" />
        
        <div className="bg-card rounded-lg shadow-sm border border-border">
          <div className="px-6 py-4 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-foreground">Logística Interna/Realizado</h2>
                <p className="text-muted-foreground mt-1">
                  Registre os dados reais de trabalho executado para cada colaborador
                </p>
              </div>
              <Button 
                variant="outline" 
                className="ml-4"
                onClick={() => setShowEmergencyModal(true)}
                data-testid="button-add-emergency"
              >
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Colaborador Emergencial
              </Button>
            </div>
          </div>

          {closureInclusions.length === 0 ? (
            <div className="p-12 text-center">
              <Calculator className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                Nenhum fechamento pendente
              </h3>
              <p className="text-muted-foreground">
                Não há registros para fechamento financeiro ou todos já foram processados.
              </p>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {closureInclusions.map((inclusion) => {
                const financial = getFinancial(inclusion.id);
                const ticket = getTicket(inclusion.id);
                const data = financialData[inclusion.id] || {};
                
                return (
                  <Card key={inclusion.id} className="border-border" data-testid={`card-closure-${inclusion.id}`}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-foreground">
                            {getEventName(inclusion.eventId)} - {getFunctionName(inclusion.functionId)}
                          </h3>
                          <p className="text-sm text-muted-foreground mt-1">
                            Colaborador: {getCollaboratorName(inclusion.collaboratorId || undefined)}
                          </p>
                        </div>
                        <StatusBadge status={inclusion.status} />
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {financial ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
                          <div>
                            <Label className="text-xs text-muted-foreground">Diárias Realizadas</Label>
                            <p className="font-medium">{formatCurrency(financial.actualDailyRates || 0)}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Taxa Realizada</Label>
                            <p className="font-medium">{formatCurrency(financial.actualFee || 0)}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Valor da Passagem</Label>
                            <p className="font-medium">{ticket ? formatCurrency(ticket.value || 0) : "R$ 0,00"}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Total Geral</Label>
                            <p className="font-medium text-lg">
                              {formatCurrency((financial.actualDailyRates || 0) + (financial.actualFee || 0) + (ticket?.value || 0))}
                            </p>
                          </div>
                          {financial.observations && (
                            <div className="md:col-span-2 lg:col-span-3">
                              <Label className="text-xs text-muted-foreground">Observações</Label>
                              <p className="font-medium">{financial.observations}</p>
                            </div>
                          )}
                          <div className="md:col-span-2 lg:col-span-3">
                            <span className="text-sm text-green-600 font-medium flex items-center">
                              <DollarSign className="w-4 h-4 mr-1" />
                              Fechamento financeiro registrado com sucesso
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {/* Work Period Information */}
                          <div className="p-4 bg-accent/50 rounded-lg">
                            <h4 className="font-medium text-foreground mb-3">Informações do Trabalho</h4>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                              <div>
                                <Label className="text-xs text-muted-foreground">Data Início Planejada</Label>
                                <p className="font-medium">{formatDate(inclusion.scheduleStartDate)}</p>
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">Data Fim Planejada</Label>
                                <p className="font-medium">{formatDate(inclusion.scheduleEndDate)}</p>
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">Diárias Planejadas</Label>
                                <p className="font-medium">{inclusion.dailyRates} diárias</p>
                              </div>
                              <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded border-l-4 border-blue-500">
                                <Label className="text-xs font-medium text-blue-700 dark:text-blue-300">Valor da Diária</Label>
                                <p className="font-bold text-lg text-blue-800 dark:text-blue-200">
                                  {formatCurrency(inclusion.dailyValue / 100)}
                                </p>
                                <p className="text-xs text-blue-600 dark:text-blue-400">
                                  Total: {formatCurrency((inclusion.dailyValue / 100) * inclusion.dailyRates)}
                                </p>
                              </div>
                            </div>
                          </div>
                          
                          {/* Actual work data input fields */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <Label htmlFor={`actualStartDate-${inclusion.id}`}>Data de Início do Trabalho *</Label>
                              <Input
                                id={`actualStartDate-${inclusion.id}`}
                                type="date"
                                value={data.actualStartDate || (inclusion.scheduleStartDate ? inclusion.scheduleStartDate : "")}
                                onChange={(e) => handleFinancialDataChange(inclusion.id, "actualStartDate", e.target.value)}
                                data-testid={`input-actual-start-date-${inclusion.id}`}
                              />
                            </div>
                            <div>
                              <Label htmlFor={`actualEndDate-${inclusion.id}`}>Data Final do Trabalho *</Label>
                              <Input
                                id={`actualEndDate-${inclusion.id}`}
                                type="date"
                                value={data.actualEndDate || (inclusion.scheduleEndDate ? inclusion.scheduleEndDate : "")}
                                onChange={(e) => handleFinancialDataChange(inclusion.id, "actualEndDate", e.target.value)}
                                data-testid={`input-actual-end-date-${inclusion.id}`}
                              />
                            </div>
                            <div>
                              <Label htmlFor={`actualDailyRates-${inclusion.id}`}>Quantidade de Diárias / Cachê a Pagar *</Label>
                              <Input
                                id={`actualDailyRates-${inclusion.id}`}
                                type="number"
                                min="0"
                                placeholder={`Planejado: ${inclusion.dailyRates}`}
                                value={data.actualDailyRatesCount || ""}
                                onChange={(e) => handleFinancialDataChange(inclusion.id, "actualDailyRatesCount", e.target.value)}
                                data-testid={`input-daily-rates-count-${inclusion.id}`}
                              />
                            </div>
                            <div>
                              <Label htmlFor={`actualDailyValue-${inclusion.id}`}>Valor Total das Diárias Realizadas *</Label>
                              <Input
                                id={`actualDailyValue-${inclusion.id}`}
                                type="number"
                                step="0.01"
                                placeholder="0,00"
                                value={data.actualDailyRates || ""}
                                onChange={(e) => handleFinancialDataChange(inclusion.id, "actualDailyRates", e.target.value)}
                                data-testid={`input-daily-rates-${inclusion.id}`}
                              />
                            </div>
                            <div className="md:col-span-2">
                              <Label htmlFor={`observations-${inclusion.id}`}>Observações sobre o Realizado</Label>
                              <Textarea
                                id={`observations-${inclusion.id}`}
                                rows={3}
                                placeholder="Explicações adicionais sobre o que foi realizado, mudanças, etc..."
                                value={data.observations || ""}
                                onChange={(e) => handleFinancialDataChange(inclusion.id, "observations", e.target.value)}
                                data-testid={`textarea-observations-${inclusion.id}`}
                              />
                            </div>
                            <div className="md:col-span-2 flex justify-end">
                              <Button
                                onClick={() => handleFinancialClosure(inclusion)}
                                disabled={createFinancialMutation.isPending}
                                data-testid={`button-close-${inclusion.id}`}
                              >
                                <Save className="w-4 h-4 mr-2" />
                                {createFinancialMutation.isPending ? "Registrando..." : "Registrar Fechamento"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <CollaboratorModal 
        open={showEmergencyModal} 
        onClose={() => setShowEmergencyModal(false)}
        defaultArea=""
        eventName="Colaborador Emergencial"
        functionName="Emergência"
        isEmergency={true}
      />
    </div>
  );
}
