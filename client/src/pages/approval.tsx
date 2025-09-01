import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import NavigationTabs from "@/components/layout/navigation-tabs";
import WorkflowIndicator from "@/components/layout/workflow-indicator";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import StatusBadge from "@/components/common/status-badge";
import { ProgressIndicator } from "@/components/ui/progress-indicator";
import { CheckCircle, XCircle, FileCheck, Filter } from "lucide-react";
import type { TeamInclusion, Event, Function, Collaborator, Financial, Ticket } from "@shared/schema";

export default function Approval() {
  const [selectedInclusions, setSelectedInclusions] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState({
    eventId: "all",
    functionId: "all", 
    collaboratorId: "all"
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

  const updateFinancialMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PATCH", `/api/financial/${id}`, data);
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

  // Filter inclusions that need approval
  const approvalInclusions = teamInclusions?.filter(inclusion => {
    if (inclusion.status !== "aprovacao" || !inclusion.collaboratorId) return false;
    
    // Apply filters
    if (filters.eventId !== "all" && inclusion.eventId !== filters.eventId) return false;
    if (filters.functionId !== "all" && inclusion.functionId !== filters.functionId) return false;
    if (filters.collaboratorId !== "all" && inclusion.collaboratorId !== filters.collaboratorId) return false;
    
    return true;
  }) || [];

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
    const date = new Date(dateStr);
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  };

  const getTicket = (inclusionId: string) => {
    return tickets?.find(ticket => ticket.teamInclusionId === inclusionId);
  };

  const getFinancial = (inclusionId: string) => {
    return financials?.find(financial => financial.teamInclusionId === inclusionId);
  };

  const calculateProgress = (inclusion: TeamInclusion) => {
    let completed = 0;
    let total = 3; // collaborator, financial data, ticket (if needed)
    
    // Check if collaborator is assigned
    if (inclusion.collaboratorId) completed++;
    
    // Check if financial data exists
    const financial = getFinancial(inclusion.id);
    if (financial) completed++;
    
    // Check if ticket exists (only count if ticket is needed)
    if (inclusion.needsTicket) {
      const ticket = getTicket(inclusion.id);
      if (ticket) completed++;
    } else {
      total--; // Don't count ticket if not needed
    }
    
    return { completed, total };
  };

  const getTotalValue = (inclusion: TeamInclusion) => {
    const ticket = getTicket(inclusion.id);
    const financial = getFinancial(inclusion.id);
    const ticketValue = ticket?.value || 0;
    const dailyRatesValue = financial?.actualDailyRates || 0;
    const feeValue = financial?.actualFee || 0;
    return ticketValue + dailyRatesValue + feeValue;
  };

  const handleInclusionSelect = (inclusionId: string, checked: boolean) => {
    const newSelected = new Set(selectedInclusions);
    if (checked) {
      newSelected.add(inclusionId);
    } else {
      newSelected.delete(inclusionId);
    }
    setSelectedInclusions(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedInclusions(new Set(approvalInclusions.map(inc => inc.id)));
    } else {
      setSelectedInclusions(new Set());
    }
  };

  const handleBulkApproval = () => {
    if (selectedInclusions.size === 0) {
      toast({
        title: "Atenção",
        description: "Selecione pelo menos um registro para aprovação",
        variant: "destructive",
      });
      return;
    }

    const now = new Date();
    const currentUserId = "current-user-id"; // This should come from auth context
    
    selectedInclusions.forEach(inclusionId => {
      const financial = getFinancial(inclusionId);
      if (financial) {
        updateFinancialMutation.mutate({
          id: financial.id,
          data: {
            approvedAt: now.toISOString(),
            approvedBy: currentUserId
          }
        });
      }
      
      updateTeamInclusionMutation.mutate({
        id: inclusionId,
        data: {
          status: "aprovado",
          phase: "concluido",
          progress: 100 // Set progress to 100% after approval
        }
      });
    });

    toast({
      title: "Sucesso",
      description: `${selectedInclusions.size} registro(s) aprovado(s) com sucesso`,
    });
    
    setSelectedInclusions(new Set());
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <NavigationTabs activeTab="approval" />
          <WorkflowIndicator currentPhase="aprovacao" />
          <div className="bg-card rounded-lg shadow-sm border border-border p-6 animate-pulse">
            <div className="h-8 bg-muted rounded mb-4 w-1/3"></div>
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 bg-muted rounded"></div>
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
        <NavigationTabs activeTab="approval" />
        <WorkflowIndicator currentPhase="aprovacao" />
        
        <div className="bg-card rounded-lg shadow-sm border border-border">
          <div className="px-6 py-4 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-foreground">Aprovação Financeira</h2>
                <p className="text-muted-foreground mt-1">
                  Aprove os registros financeiros dos colaboradores em lote
                </p>
              </div>
              {approvalInclusions.length > 0 && (
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">
                      {selectedInclusions.size} de {approvalInclusions.length} selecionados
                    </span>
                    <div className="text-sm font-medium text-green-600 bg-green-50 px-2 py-1 rounded">
                      {teamInclusions?.filter(ti => ti.status === "aprovado").length || 0} aprovados
                    </div>
                  </div>
                  <Button
                    onClick={handleBulkApproval}
                    disabled={selectedInclusions.size === 0 || updateFinancialMutation.isPending}
                    data-testid="button-bulk-approve"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {updateFinancialMutation.isPending ? "Aprovando..." : "Aprovar Selecionados"}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="px-6 py-4 border-b border-border bg-muted/20">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Filtros:</span>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="min-w-[200px]">
                  <Select 
                    value={filters.eventId} 
                    onValueChange={(value) => setFilters(prev => ({ ...prev, eventId: value }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Todos os eventos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os eventos</SelectItem>
                      {events?.map(event => (
                        <SelectItem key={event.id} value={event.id}>
                          {event.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="min-w-[180px]">
                  <Select 
                    value={filters.functionId} 
                    onValueChange={(value) => setFilters(prev => ({ ...prev, functionId: value }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Todas as funções" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as funções</SelectItem>
                      {functions?.map(func => (
                        <SelectItem key={func.id} value={func.id}>
                          {func.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="min-w-[200px]">
                  <Select 
                    value={filters.collaboratorId} 
                    onValueChange={(value) => setFilters(prev => ({ ...prev, collaboratorId: value }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Todos os colaboradores" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os colaboradores</SelectItem>
                      {collaborators?.map(collaborator => (
                        <SelectItem key={collaborator.id} value={collaborator.id}>
                          {collaborator.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {approvalInclusions.length === 0 ? (
            <div className="p-12 text-center">
              <FileCheck className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                Nenhuma aprovação pendente
              </h3>
              <p className="text-muted-foreground">
                Não há registros para aprovação financeira ou todos já foram processados.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Planned vs Actual Analysis Summary */}
              <div className="p-4 bg-accent/50 rounded-lg">
                <h3 className="font-medium text-foreground mb-3">
                  Análise Planejado x Realizado
                  {selectedInclusions.size > 0 && (
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      ({selectedInclusions.size} registros selecionados)
                    </span>
                  )}
                </h3>
                
                {/* Comparativo de Valores */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {formatCurrency((selectedInclusions.size > 0 ? 
                        approvalInclusions.filter(inc => selectedInclusions.has(inc.id)) : 
                        approvalInclusions
                      ).reduce((total, inclusion) => 
                        total + ((inclusion.dailyValue / 100) * inclusion.dailyRates), 0
                      ))}
                    </div>
                    <div className="text-muted-foreground">Total Planejado</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {formatCurrency((selectedInclusions.size > 0 ? 
                        approvalInclusions.filter(inc => selectedInclusions.has(inc.id)) : 
                        approvalInclusions
                      ).reduce((total, inclusion) => {
                        const financial = getFinancial(inclusion.id);
                        const ticket = getTicket(inclusion.id);
                        return total + (financial?.actualDailyRates || 0) + (ticket?.value || 0);
                      }, 0))}
                    </div>
                    <div className="text-muted-foreground">Total Realizado</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${
                      ((selectedInclusions.size > 0 ? 
                        approvalInclusions.filter(inc => selectedInclusions.has(inc.id)) : 
                        approvalInclusions
                      ).reduce((total, inclusion) => {
                        const financial = getFinancial(inclusion.id);
                        const ticket = getTicket(inclusion.id);
                        return total + (financial?.actualDailyRates || 0) + (ticket?.value || 0);
                      }, 0)) - ((selectedInclusions.size > 0 ? 
                        approvalInclusions.filter(inc => selectedInclusions.has(inc.id)) : 
                        approvalInclusions
                      ).reduce((total, inclusion) => 
                        total + ((inclusion.dailyValue / 100) * inclusion.dailyRates), 0
                      )) >= 0 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {formatCurrency(
                        ((selectedInclusions.size > 0 ? 
                          approvalInclusions.filter(inc => selectedInclusions.has(inc.id)) : 
                          approvalInclusions
                        ).reduce((total, inclusion) => {
                          const financial = getFinancial(inclusion.id);
                          const ticket = getTicket(inclusion.id);
                          return total + (financial?.actualDailyRates || 0) + (ticket?.value || 0);
                        }, 0)) - ((selectedInclusions.size > 0 ? 
                          approvalInclusions.filter(inc => selectedInclusions.has(inc.id)) : 
                          approvalInclusions
                        ).reduce((total, inclusion) => 
                          total + ((inclusion.dailyValue / 100) * inclusion.dailyRates), 0
                        ))
                      )}
                    </div>
                    <div className="text-muted-foreground">Diferença</div>
                  </div>
                </div>

                {/* Comparativo de Diárias */}
                <div className="border-t pt-3">
                  <h4 className="text-sm font-medium text-foreground mb-2">Comparativo de Diárias</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="text-center">
                      <div className="text-xl font-bold text-blue-600">
                        {(selectedInclusions.size > 0 ? 
                          approvalInclusions.filter(inc => selectedInclusions.has(inc.id)) : 
                          approvalInclusions
                        ).reduce((total, inclusion) => total + inclusion.dailyRates, 0)}
                      </div>
                      <div className="text-muted-foreground">Diárias Planejadas</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-bold text-green-600">
                        {(selectedInclusions.size > 0 ? 
                          approvalInclusions.filter(inc => selectedInclusions.has(inc.id)) : 
                          approvalInclusions
                        ).reduce((total, inclusion) => {
                          const financial = getFinancial(inclusion.id);
                          return total + (financial?.actualDailyRates || inclusion.dailyRates);
                        }, 0)}
                      </div>
                      <div className="text-muted-foreground">Diárias Realizadas</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-xl font-bold ${
                        ((selectedInclusions.size > 0 ? 
                          approvalInclusions.filter(inc => selectedInclusions.has(inc.id)) : 
                          approvalInclusions
                        ).reduce((total, inclusion) => {
                          const financial = getFinancial(inclusion.id);
                          return total + (financial?.actualDailyRates || inclusion.dailyRates);
                        }, 0)) - ((selectedInclusions.size > 0 ? 
                          approvalInclusions.filter(inc => selectedInclusions.has(inc.id)) : 
                          approvalInclusions
                        ).reduce((total, inclusion) => total + inclusion.dailyRates, 0)) >= 0 
                          ? 'text-red-600' : 'text-green-600'
                      }`}>
                        {(((selectedInclusions.size > 0 ? 
                          approvalInclusions.filter(inc => selectedInclusions.has(inc.id)) : 
                          approvalInclusions
                        ).reduce((total, inclusion) => {
                          const financial = getFinancial(inclusion.id);
                          return total + (financial?.actualDailyRates || inclusion.dailyRates);
                        }, 0)) - ((selectedInclusions.size > 0 ? 
                          approvalInclusions.filter(inc => selectedInclusions.has(inc.id)) : 
                          approvalInclusions
                        ).reduce((total, inclusion) => total + inclusion.dailyRates, 0))) > 0 ? '+' : ''}
                        {((selectedInclusions.size > 0 ? 
                          approvalInclusions.filter(inc => selectedInclusions.has(inc.id)) : 
                          approvalInclusions
                        ).reduce((total, inclusion) => {
                          const financial = getFinancial(inclusion.id);
                          return total + (financial?.actualDailyRates || inclusion.dailyRates);
                        }, 0)) - ((selectedInclusions.size > 0 ? 
                          approvalInclusions.filter(inc => selectedInclusions.has(inc.id)) : 
                          approvalInclusions
                        ).reduce((total, inclusion) => total + inclusion.dailyRates, 0))}
                      </div>
                      <div className="text-muted-foreground">Diferença</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-6 py-3 text-left">
                        <Checkbox
                          checked={selectedInclusions.size === approvalInclusions.length}
                          onCheckedChange={handleSelectAll}
                          data-testid="checkbox-select-all"
                        />
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Evento / Função
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Colaborador
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Datas / Diárias
                      </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Valores Realizados
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Total
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                  {approvalInclusions.map((inclusion) => {
                    const financial = getFinancial(inclusion.id);
                    const ticket = getTicket(inclusion.id);
                    const totalValue = getTotalValue(inclusion);
                    
                    return (
                      <tr 
                        key={inclusion.id} 
                        className={`hover:bg-accent/50 transition-colors ${
                          selectedInclusions.has(inclusion.id) ? 'bg-accent/30' : ''
                        }`}
                        data-testid={`row-approval-${inclusion.id}`}
                      >
                        <td className="px-6 py-4">
                          <Checkbox
                            checked={selectedInclusions.has(inclusion.id)}
                            onCheckedChange={(checked) => handleInclusionSelect(inclusion.id, checked as boolean)}
                            data-testid={`checkbox-${inclusion.id}`}
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-foreground">
                            {getEventName(inclusion.eventId)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {getFunctionName(inclusion.functionId)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-foreground">
                            {getCollaboratorName(inclusion.collaboratorId || undefined)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="space-y-1">
                            <div className="text-xs font-medium text-blue-600">Planejado:</div>
                            <div className="text-sm text-foreground">
                              {formatDate(inclusion.scheduleStartDate)} - {formatDate(inclusion.scheduleEndDate)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {inclusion.dailyRates} diárias × {formatCurrency(inclusion.dailyValue / 100)}
                            </div>
                            {inclusion.actualStartDate && (
                              <>
                                <div className="text-xs font-medium text-green-600 mt-2">Realizado:</div>
                                <div className="text-sm text-foreground">
                                  {formatDate(inclusion.actualStartDate)} - {formatDate(inclusion.actualEndDate || inclusion.scheduleEndDate)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {financial?.actualDailyRates || inclusion.dailyRates} diárias
                                  {financial?.actualDailyRates && financial.actualDailyRates !== inclusion.dailyRates && (
                                    <span className={`ml-2 font-medium ${
                                      financial.actualDailyRates > inclusion.dailyRates ? 'text-red-600' : 'text-green-600'
                                    }`}>
                                      ({financial.actualDailyRates > inclusion.dailyRates ? '+' : ''}{financial.actualDailyRates - inclusion.dailyRates})
                                    </span>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="space-y-2">
                            <div>
                              <div className="flex justify-between items-center">
                                <span className="text-xs text-blue-600">Planejado:</span>
                                <span className="text-sm font-medium">{formatCurrency((inclusion.dailyValue / 100) * inclusion.dailyRates)}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-xs text-green-600">Realizado:</span>
                                <span className="text-sm font-medium">{formatCurrency(financial?.actualDailyRates || 0)}</span>
                              </div>
                              <div className="flex justify-between items-center border-t pt-1">
                                <span className="text-xs text-muted-foreground">Diferença:</span>
                                <span className={`text-sm font-medium ${
                                  ((financial?.actualDailyRates || 0) - ((inclusion.dailyValue / 100) * inclusion.dailyRates)) >= 0 
                                    ? 'text-red-600' : 'text-green-600'
                                }`}>
                                  {formatCurrency((financial?.actualDailyRates || 0) - ((inclusion.dailyValue / 100) * inclusion.dailyRates))}
                                </span>
                              </div>
                            </div>
                            {ticket && (ticket.value || 0) > 0 && (
                              <div className="pt-1 border-t">
                                <div className="text-xs text-muted-foreground">Passagem: {formatCurrency(ticket.value || 0)}</div>
                              </div>
                            )}
                            {financial?.observations && (
                              <div className="pt-1 border-t">
                                <div className="text-xs text-muted-foreground">Obs: {financial.observations.substring(0, 30)}{financial.observations.length > 30 ? '...' : ''}</div>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-lg font-bold text-foreground">
                            {formatCurrency(totalValue)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="space-y-2">
                            <StatusBadge status={inclusion.status} />
                            <ProgressIndicator 
                              completed={calculateProgress(inclusion).completed}
                              total={calculateProgress(inclusion).total}
                              status={inclusion.status}
                              className="max-w-xs"
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
