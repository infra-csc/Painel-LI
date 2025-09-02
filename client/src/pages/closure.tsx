import { useState, useMemo } from "react";
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
import SimpleFilters from "@/components/common/simple-filters";
import { Calculator, Save, DollarSign, Plus, Search, Copy } from "lucide-react";
import type { TeamInclusion, Event, Function, Collaborator, Financial, Ticket } from "@shared/schema";

export default function Closure() {
  const [financialData, setFinancialData] = useState<Record<string, any>>({});
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [searchId, setSearchId] = useState<string>("");
  const [filters, setFilters] = useState({
    eventId: "all",
    functionId: "all",
    collaboratorId: "all",
  });
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
    inclusion => {
      const statusMatch = inclusion.status === "fechamento" && inclusion.collaboratorId;
      const idMatch = !searchId || 
        (inclusion.inclusionNumber && inclusion.inclusionNumber.toString().includes(searchId)) ||
        inclusion.id.toLowerCase().includes(searchId.toLowerCase());
      
      // Apply universal filters (only event, function, and collaborator)
      if (filters.eventId !== "all" && inclusion.eventId !== filters.eventId) return false;
      if (filters.functionId !== "all" && inclusion.functionId !== filters.functionId) return false;
      if (filters.collaboratorId !== "all" && inclusion.collaboratorId !== filters.collaboratorId) return false;
      
      return statusMatch && idMatch;
    }
  ) || [];

  // Group inclusions by collaborator + event for unified closure
  const groupedClosureInclusions = useMemo(() => {
    const groups = new Map<string, TeamInclusion[]>();
    
    closureInclusions.forEach(inclusion => {
      if (!inclusion.collaboratorId) return;
      
      const groupKey = `${inclusion.collaboratorId}-${inclusion.eventId}-${inclusion.functionId}`;
      
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(inclusion);
    });
    
    // Convert to array of grouped items
    return Array.from(groups.entries()).map(([groupKey, inclusions]) => {
      const firstInclusion = inclusions[0];
      const totalDailyRates = inclusions.reduce((sum, inc) => sum + inc.dailyRates, 0);
      const totalDailyValue = inclusions.reduce((sum, inc) => sum + (inc.dailyValue * inc.dailyRates), 0);
      
      return {
        groupKey,
        inclusions,
        representative: {
          ...firstInclusion,
          dailyRates: totalDailyRates,
          dailyValue: Math.round(totalDailyValue / totalDailyRates), // Average daily value
        },
        totalDailyValue,
        ids: inclusions.map(inc => inc.id),
        inclusionNumbers: inclusions.map(inc => inc.inclusionNumber).filter(Boolean),
      };
    });
  }, [closureInclusions]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copiado",
      description: `${label} copiado para a área de transferência`,
    });
  };

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

  // Calculate date range for a group (earliest start, latest end)
  const getGroupDateRange = (inclusions: TeamInclusion[]) => {
    const startDates = inclusions.map(inc => inc.scheduleStartDate).filter(Boolean);
    const endDates = inclusions.map(inc => inc.scheduleEndDate).filter(Boolean);
    
    if (startDates.length === 0 || endDates.length === 0) {
      return { startDate: null, endDate: null };
    }
    
    // Find earliest start date and latest end date
    const earliestStart = startDates.sort()[0];
    const latestEnd = endDates.sort().reverse()[0];
    
    return { startDate: earliestStart, endDate: latestEnd };
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
    return (ticketValue / 100) + (plannedDailyValue / 100);
  };

  const calculateDailyRates = (startDate: string, endDate: string): number => {
    if (!startDate || !endDate) return 0;
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start > end) return 0;
    
    // Calculate difference in days (inclusive)
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
    
    return diffDays;
  };

  const handleFinancialDataChange = (groupKey: string, field: string, value: any) => {
    setFinancialData(prev => {
      const currentData = prev[groupKey] || {};
      const updatedData = {
        ...prev,
        [groupKey]: {
          ...currentData,
          [field]: value
        }
      };
      
      // Auto-calculate daily rates when dates change
      if (field === 'actualStartDate' || field === 'actualEndDate') {
        const startDate = field === 'actualStartDate' ? value : currentData.actualStartDate;
        const endDate = field === 'actualEndDate' ? value : currentData.actualEndDate;
        
        if (startDate && endDate) {
          const calculatedDays = calculateDailyRates(startDate, endDate);
          updatedData[groupKey].actualDailyRatesCount = calculatedDays.toString();
        }
      }
      
      return updatedData;
    });
  };

  const calculateProgress = (inclusion: TeamInclusion) => {
    const data = financialData[inclusion.id] || {};
    let completed = 0;
    let total = 4; // start date, end date, daily count, daily value
    
    // Check required fields
    if (data.actualStartDate) completed++;
    if (data.actualEndDate) completed++;
    if (data.actualDailyRatesCount) completed++;
    if (data.actualDailyRates) completed++;
    
    return { completed, total };
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
        actualDailyRates: parseInt(data.actualDailyRatesCount || "0"), // Quantity of daily rates
        actualValue: Math.round(parseFloat(data.actualDailyRates) * 100), // Total value in cents
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

  // New function for handling grouped closure
  const handleFinancialClosureGroup = async (group: any) => {
    const data = financialData[group.groupKey] || {};
    
    if (!data.actualDailyRates) {
      toast({
        title: "Erro",
        description: "Preencha o valor total das diárias realizadas",
        variant: "destructive",
      });
      return;
    }

    try {
      // Process all inclusions in the group
      for (const inclusion of group.inclusions) {
        // Create the financial record for each inclusion
        await createFinancialMutation.mutateAsync({
          teamInclusionId: inclusion.id,
          actualDailyRates: Math.round(parseFloat(data.actualDailyRates) / group.inclusions.length), // Distribute evenly
          actualValue: Math.round(parseFloat(data.actualDailyRates) * 100), // Total value in cents
          actualFee: 0, // Fee field removed as per user request
          observations: data.observations || null
        });

        // Update each team inclusion status to approval phase
        await updateTeamInclusionMutation.mutateAsync({
          id: inclusion.id,
          data: {
            status: "aprovacao",
            phase: "aprovacao"
          }
        });
      }

      toast({
        title: "Sucesso",
        description: `Fechamento financeiro registrado para ${group.inclusions.length} escalação(ões) agrupadas!`,
      });

      // Clear the form data for this group
      setFinancialData(prev => {
        const newData = { ...prev };
        delete newData[group.groupKey];
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
            <div className="mt-4 flex gap-2 items-center">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <input
                  type="text"
                  placeholder="Buscar por número..."
                  value={searchId}
                  onChange={(e) => setSearchId(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-search-id"
                />
              </div>
              {searchId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSearchId("")}
                  data-testid="button-clear-search"
                >
                  Limpar
                </Button>
              )}
            </div>
          </div>

          <SimpleFilters filters={filters} onFiltersChange={setFilters} />

          {groupedClosureInclusions.length === 0 ? (
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
              {groupedClosureInclusions.map((group) => {
                const inclusion = group.representative;
                const financial = getFinancial(inclusion.id);
                const ticket = getTicket(inclusion.id);
                const data = financialData[group.groupKey] || {};
                
                return (
                  <Card key={group.groupKey} className="border-border" data-testid={`card-closure-${group.groupKey}`}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <div>
                          <div className="mb-3">
                            {group.inclusions.length > 1 ? (
                              <div className="p-3 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950 dark:to-orange-950 border-2 border-amber-300 dark:border-amber-700 rounded-lg shadow-sm">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <span className="flex items-center gap-1 text-amber-700 dark:text-amber-300 text-sm font-bold">
                                      🔗 FECHAMENTO AGRUPADO
                                    </span>
                                    <span className="px-3 py-1 bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 text-xs rounded-full font-bold">
                                      {group.inclusions.length} ESCALAÇÕES
                                    </span>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="p-1 h-6 w-6 hover:bg-amber-200 dark:hover:bg-amber-800"
                                    onClick={() => copyToClipboard(group.inclusionNumbers.join(', '), "IDs")}
                                    data-testid={`button-copy-id-${group.groupKey}`}
                                  >
                                    <Copy className="w-3 h-3" />
                                  </Button>
                                </div>
                                <div className="text-sm text-amber-700 dark:text-amber-300 font-medium">
                                  <strong>🆔 IDs Unificados:</strong> 
                                  <span className="font-mono bg-amber-100 dark:bg-amber-900 px-2 py-1 rounded ml-2 text-amber-900 dark:text-amber-100">
                                    #{group.inclusionNumbers.join(', #')}
                                  </span>
                                </div>
                                <div className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                                  ℹ️ <strong>Mesmo colaborador + evento = um fechamento unificado</strong>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-mono text-muted-foreground">
                                  🆔 ID: #{group.inclusionNumbers[0] || 'N/A'}
                                </span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="p-1 h-6 w-6"
                                  onClick={() => copyToClipboard(group.inclusionNumbers.join(', '), "IDs")}
                                  data-testid={`button-copy-id-${group.groupKey}`}
                                >
                                  <Copy className="w-3 h-3" />
                                </Button>
                              </div>
                            )}
                          </div>
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
                            <p className="font-medium">{ticket ? formatCurrency((ticket.value || 0) / 100) : "R$ 0,00"}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Total Geral</Label>
                            <p className="font-medium text-lg">
                              {formatCurrency(((financial.actualDailyRates || 0) + (financial.actualFee || 0)) / 100 + ((ticket?.value || 0) / 100))}
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
                              {(() => {
                                const dateRange = getGroupDateRange(group.inclusions);
                                return (
                                  <>
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Data Início Planejada</Label>
                                      <p className="font-medium">
                                        {dateRange.startDate ? formatDate(dateRange.startDate) : "N/A"}
                                      </p>
                                      {group.inclusions.length > 1 && (
                                        <p className="text-xs text-muted-foreground mt-1">
                                          (Primeira data do grupo)
                                        </p>
                                      )}
                                    </div>
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Data Fim Planejada</Label>
                                      <p className="font-medium">
                                        {dateRange.endDate ? formatDate(dateRange.endDate) : "N/A"}
                                      </p>
                                      {group.inclusions.length > 1 && (
                                        <p className="text-xs text-muted-foreground mt-1">
                                          (Última data do grupo)
                                        </p>
                                      )}
                                    </div>
                                  </>
                                );
                              })()}
                              <div>
                                <Label className="text-xs text-muted-foreground">Diárias Planejadas</Label>
                                <p className="font-medium">{inclusion.dailyRates} diárias</p>
                              </div>
                            </div>
                          </div>
                          
                          {/* Actual work data input fields */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {(() => {
                              const dateRange = getGroupDateRange(group.inclusions);
                              return (
                                <>
                                  <div>
                                    <Label htmlFor={`actualStartDate-${group.groupKey}`}>Data de Início do Trabalho *</Label>
                                    <Input
                                      id={`actualStartDate-${group.groupKey}`}
                                      type="date"
                                      value={data.actualStartDate || (dateRange.startDate ? dateRange.startDate : "")}
                                      onChange={(e) => handleFinancialDataChange(group.groupKey, "actualStartDate", e.target.value)}
                                      data-testid={`input-actual-start-date-${group.groupKey}`}
                                    />
                                    {group.inclusions.length > 1 && (
                                      <p className="text-xs text-muted-foreground mt-1">
                                        Padrão: primeira data do grupo
                                      </p>
                                    )}
                                  </div>
                                  <div>
                                    <Label htmlFor={`actualEndDate-${group.groupKey}`}>Data Final do Trabalho *</Label>
                                    <Input
                                      id={`actualEndDate-${group.groupKey}`}
                                      type="date"
                                      value={data.actualEndDate || (dateRange.endDate ? dateRange.endDate : "")}
                                      onChange={(e) => handleFinancialDataChange(group.groupKey, "actualEndDate", e.target.value)}
                                      data-testid={`input-actual-end-date-${group.groupKey}`}
                                    />
                                    {group.inclusions.length > 1 && (
                                      <p className="text-xs text-muted-foreground mt-1">
                                        Padrão: última data do grupo
                                      </p>
                                    )}
                                  </div>
                                </>
                              );
                            })()}
                            <div>
                              <Label htmlFor={`actualDailyRates-${group.groupKey}`}>Quantidade de Diárias / Cachê a Pagar *</Label>
                              <Input
                                id={`actualDailyRates-${inclusion.id}`}
                                type="number"
                                min="0"
                                placeholder={`Planejado: ${inclusion.dailyRates}`}
                                value={data.actualDailyRatesCount || ""}
                                readOnly
                                data-testid={`input-daily-rates-count-${inclusion.id}`}
                                className="bg-muted/50 cursor-not-allowed"
                              />
                              {data.actualStartDate && data.actualEndDate && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Calculado automaticamente: {calculateDailyRates(data.actualStartDate, data.actualEndDate)} dias
                                </p>
                              )}
                            </div>
                            <div>
                              <Label htmlFor={`actualDailyValue-${inclusion.id}`}>Valor Total das Diárias Realizadas *</Label>
                              <Input
                                id={`actualDailyValue-${inclusion.id}`}
                                type="number"
                                step="0.01"
                                placeholder="0,00"
                                value={data.actualDailyRates || ""}
                                onChange={(e) => handleFinancialDataChange(group.groupKey, "actualDailyRates", e.target.value)}
                                data-testid={`input-daily-rates-${group.groupKey}`}
                              />
                            </div>
                            <div className="md:col-span-2">
                              <Label htmlFor={`observations-${group.groupKey}`}>Observações sobre o Realizado</Label>
                              <Textarea
                                id={`observations-${group.groupKey}`}
                                rows={3}
                                placeholder="Explicações adicionais sobre o que foi realizado, mudanças, etc..."
                                value={data.observations || ""}
                                onChange={(e) => handleFinancialDataChange(group.groupKey, "observations", e.target.value)}
                                data-testid={`textarea-observations-${group.groupKey}`}
                              />
                            </div>
                            <div className="md:col-span-2 flex justify-end">
                              <Button
                                onClick={() => handleFinancialClosureGroup(group)}
                                disabled={createFinancialMutation.isPending}
                                data-testid={`button-close-${group.groupKey}`}
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
