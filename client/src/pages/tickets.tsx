import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import NavigationTabs from "@/components/layout/navigation-tabs";
import WorkflowIndicator from "@/components/layout/workflow-indicator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import StatusBadge from "@/components/common/status-badge";
import { Plane, Save, FileText } from "lucide-react";
import type { TeamInclusion, Event, Function, Collaborator, Ticket } from "@shared/schema";

export default function Tickets() {
  const [ticketData, setTicketData] = useState<Record<string, any>>({});
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

  const createTicketMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/tickets", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Passagem registrada com sucesso",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao registrar passagem",
        variant: "destructive",
      });
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

  // Filter inclusions that need tickets (escalated and marked as needing tickets)
  const ticketInclusions = teamInclusions?.filter(
    inclusion => inclusion.status === "passagem" && inclusion.needsTicket && inclusion.collaboratorId
  ) || [];

  // Group inclusions by collaborator + event for unified ticket purchase
  const groupedTicketInclusions = useMemo(() => {
    const groups = new Map<string, TeamInclusion[]>();
    
    ticketInclusions.forEach(inclusion => {
      if (!inclusion.collaboratorId) return;
      
      const groupKey = `${inclusion.collaboratorId}-${inclusion.eventId}`;
      
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(inclusion);
    });
    
    // Convert to array of grouped items
    return Array.from(groups.entries()).map(([groupKey, inclusions]) => {
      const firstInclusion = inclusions[0];
      
      // Calculate first start date and last end date
      const startDates = inclusions
        .filter(inc => inc.scheduleStartDate)
        .map(inc => new Date(inc.scheduleStartDate!));
      const endDates = inclusions
        .filter(inc => inc.scheduleEndDate)
        .map(inc => new Date(inc.scheduleEndDate!));
      
      const earliestStartDate = startDates.length > 0 
        ? new Date(Math.min(...startDates.map(d => d.getTime())))
        : new Date(firstInclusion.scheduleStartDate!);
      const latestEndDate = endDates.length > 0 
        ? new Date(Math.max(...endDates.map(d => d.getTime())))
        : new Date(firstInclusion.scheduleEndDate!);
      
      return {
        groupKey,
        inclusions,
        representative: firstInclusion,
        ids: inclusions.map(inc => inc.id),
        inclusionNumbers: inclusions.map(inc => inc.inclusionNumber).filter(Boolean),
        earliestStartDate: earliestStartDate.toISOString().split('T')[0],
        latestEndDate: latestEndDate.toISOString().split('T')[0],
      };
    });
  }, [ticketInclusions]);

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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("pt-BR");
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getTicket = (inclusionId: string) => {
    return tickets?.find(ticket => ticket.teamInclusionId === inclusionId);
  };

  const handleTicketDataChange = (inclusionId: string, field: string, value: any) => {
    setTicketData(prev => ({
      ...prev,
      [inclusionId]: {
        ...prev[inclusionId],
        [field]: value
      }
    }));
  };

  const handlePurchaseTicket = (inclusion: TeamInclusion) => {
    const data = ticketData[inclusion.id] || {};
    
    // Validar apenas os campos realmente obrigatórios (marcados com * na interface)
    const requiredFields = [
      { field: 'value', label: 'Valor da Passagem' },
      { field: 'departureAirport', label: 'Aeroporto Origem' },
      { field: 'destinationAirport', label: 'Aeroporto Destino' },
      { field: 'actualDepartureDate', label: 'Data de Ida' },
      { field: 'actualDepartureTime', label: 'Horário de Ida' },
      { field: 'actualReturnTime', label: 'Horário de Volta' },
      { field: 'purchaseOrderNumber', label: 'Ordem de Compra' }
    ];
    
    const missingFields = requiredFields.filter(({ field }) => !data[field] || data[field] === '');
    
    if (missingFields.length > 0) {
      toast({
        title: "Erro",
        description: `Preencha os campos obrigatórios: ${missingFields.map(f => f.label).join(', ')}`,
        variant: "destructive",
      });
      return;
    }

    createTicketMutation.mutate({
      teamInclusionId: inclusion.id,
      value: Math.round(parseFloat(data.value) * 100), // Convert to cents
      purchaseDate: data.purchaseDate || new Date().toISOString().split('T')[0],
      actualDepartureDate: data.actualDepartureDate || inclusion.flightDepartureDate,
      actualDepartureTime: data.actualDepartureTime || inclusion.flightDepartureSuggestedTime,
      actualReturnDate: data.actualReturnDate || inclusion.flightReturnDate,
      actualReturnTime: data.actualReturnTime || inclusion.flightReturnSuggestedTime,
      departureAirport: data.departureAirport,
      destinationAirport: data.destinationAirport,
      purchaseOrderNumber: data.purchaseOrderNumber || null,
      fileUrl: data.fileUrl || null
    });

    // Update team inclusion status to closure phase
    updateTeamInclusionMutation.mutate({
      id: inclusion.id,
      data: {
        status: "fechamento",
        phase: "fechamento"
      }
    });
  };

  // New function for handling grouped ticket purchase
  const handlePurchaseTicketGroup = async (group: any) => {
    const data = ticketData[group.groupKey] || {};
    
    // Validar apenas os campos realmente obrigatórios (marcados com * na interface)
    const requiredFields = [
      { field: 'value', label: 'Valor da Passagem' },
      { field: 'departureAirport', label: 'Aeroporto Origem' },
      { field: 'destinationAirport', label: 'Aeroporto Destino' },
      { field: 'actualDepartureDate', label: 'Data de Ida' },
      { field: 'actualDepartureTime', label: 'Horário de Ida' },
      { field: 'actualReturnTime', label: 'Horário de Volta' },
      { field: 'purchaseOrderNumber', label: 'Ordem de Compra' }
    ];
    
    const missingFields = requiredFields.filter(({ field }) => !data[field] || data[field] === '');
    
    if (missingFields.length > 0) {
      toast({
        title: "Erro",
        description: `Preencha os campos obrigatórios: ${missingFields.map(f => f.label).join(', ')}`,
        variant: "destructive",
      });
      return;
    }

    try {
      // Create one ticket record for the group (using the representative inclusion)
      const representative = group.representative;
      
      await createTicketMutation.mutateAsync({
        teamInclusionId: representative.id,
        value: Math.round(parseFloat(data.value) * 100), // Convert to cents
        purchaseDate: data.purchaseDate || new Date().toISOString().split('T')[0],
        actualDepartureDate: data.actualDepartureDate || representative.flightDepartureDate,
        actualDepartureTime: data.actualDepartureTime || representative.flightDepartureSuggestedTime,
        actualReturnDate: data.actualReturnDate || representative.flightReturnDate,
        actualReturnTime: data.actualReturnTime || representative.flightReturnSuggestedTime,
        departureAirport: data.departureAirport,
        destinationAirport: data.destinationAirport,
        purchaseOrderNumber: data.purchaseOrderNumber || null,
        fileUrl: data.fileUrl || null
      });

      // Update all team inclusions in the group to closure phase
      for (const inclusion of group.inclusions) {
        await updateTeamInclusionMutation.mutateAsync({
          id: inclusion.id,
          data: {
            status: "fechamento",
            phase: "fechamento"
          }
        });
      }

      toast({
        title: "Sucesso",
        description: `Passagem registrada para ${group.inclusions.length} escalação(ões) agrupadas!`,
      });

      // Clear the form data for this group
      setTicketData(prev => {
        const newData = { ...prev };
        delete newData[group.groupKey];
        return newData;
      });

    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao registrar passagem",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <NavigationTabs activeTab="tickets" />
          <WorkflowIndicator currentPhase="passagem" />
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
        <NavigationTabs activeTab="tickets" />
        <WorkflowIndicator currentPhase="passagem" />
        
        <div className="bg-card rounded-lg shadow-sm border border-border">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-2xl font-bold text-foreground">Compra de Passagem</h2>
            <p className="text-muted-foreground mt-1">
              Registre as informações de compra de passagens para colaboradores escalados
            </p>
          </div>

          {ticketInclusions.length === 0 ? (
            <div className="p-12 text-center">
              <Plane className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                Nenhuma passagem pendente
              </h3>
              <p className="text-muted-foreground">
                Não há colaboradores escalados que necessitem de passagens ou todas já foram processadas.
              </p>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {groupedTicketInclusions.map((group) => {
                const inclusion = group.representative;
                const ticket = getTicket(inclusion.id);
                const data = ticketData[group.groupKey] || {};
                
                return (
                  <Card key={group.groupKey} className="border-border" data-testid={`card-ticket-${group.groupKey}`}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-foreground">
                            {getEventName(inclusion.eventId)} - {getFunctionName(inclusion.functionId)}
                          </h3>
                          <p className="text-sm text-muted-foreground mt-1">
                            Colaborador: {getCollaboratorName(inclusion.collaboratorId || undefined)}
                          </p>
                          {group.inclusions.length > 1 && (
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-xs text-muted-foreground">
                                IDs: #{group.inclusionNumbers.join(", #")}
                              </span>
                              <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs rounded-md">
                                {group.inclusions.length} escalações agrupadas
                              </span>
                            </div>
                          )}
                        </div>
                        <StatusBadge status={inclusion.status} />
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {ticket ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
                          <div>
                            <Label className="text-xs text-muted-foreground">Valor da Passagem</Label>
                            <p className="font-medium">{formatCurrency((ticket.value || 0) / 100)}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Data da Compra</Label>
                            <p className="font-medium">{ticket.purchaseDate ? formatDate(ticket.purchaseDate) : "-"}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Aeroporto Origem</Label>
                            <p className="font-medium">{ticket.departureAirport || "-"}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Aeroporto Destino</Label>
                            <p className="font-medium">{ticket.destinationAirport || "-"}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Ida</Label>
                            <p className="font-medium">
                              {ticket.actualDepartureDate ? formatDate(ticket.actualDepartureDate) : "-"} 
                              {ticket.actualDepartureTime && ` às ${ticket.actualDepartureTime}`}
                            </p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Volta</Label>
                            <p className="font-medium">
                              {ticket.actualReturnDate ? formatDate(ticket.actualReturnDate) : "-"} 
                              {ticket.actualReturnTime && ` às ${ticket.actualReturnTime}`}
                            </p>
                          </div>
                          {ticket.purchaseOrderNumber && (
                            <div>
                              <Label className="text-xs text-muted-foreground">Ordem de Compra</Label>
                              <p className="font-medium">{ticket.purchaseOrderNumber}</p>
                            </div>
                          )}
                          <div className="md:col-span-2 lg:col-span-3">
                            <span className="text-sm text-green-600 font-medium flex items-center">
                              <FileText className="w-4 h-4 mr-1" />
                              Passagem registrada com sucesso
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {/* Work Period Information */}
                          <div className="p-4 bg-accent/50 rounded-lg">
                            <h4 className="font-medium text-foreground mb-3">Período de Trabalho</h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div>
                                <Label className="text-xs text-muted-foreground">Data Início</Label>
                                <p className="font-medium">{formatDate(group.earliestStartDate)}</p>
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">Data Fim</Label>
                                <p className="font-medium">{formatDate(group.latestEndDate)}</p>
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">Valor da Diária</Label>
                                <div className="flex gap-2 items-center">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    placeholder="0.00"
                                    value={data.dailyValue || (inclusion.dailyValue ? inclusion.dailyValue / 100 : "") || ""}
                                    onChange={(e) => handleTicketDataChange(group.groupKey, "dailyValue", parseFloat(e.target.value) || 0)}
                                    className="max-w-[120px]"
                                    data-testid={`input-daily-value-${group.groupKey}`}
                                  />
                                  <span className="text-sm text-muted-foreground">R$</span>
                                </div>
                                <div className="text-sm text-muted-foreground mt-1">
                                  {group.inclusions.reduce((sum, inc) => sum + inc.dailyRates, 0)} diárias × {formatCurrency((data.dailyValue || (inclusion.dailyValue ? inclusion.dailyValue / 100 : 0)))} = {formatCurrency((data.dailyValue || (inclusion.dailyValue ? inclusion.dailyValue / 100 : 0)) * group.inclusions.reduce((sum, inc) => sum + inc.dailyRates, 0))}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          <div>
                            <Label htmlFor={`value-${group.groupKey}`}>Valor da Passagem *</Label>
                            <Input
                              id={`value-${group.groupKey}`}
                              type="number"
                              step="0.01"
                              placeholder="0,00"
                              value={data.value || ""}
                              onChange={(e) => handleTicketDataChange(group.groupKey, "value", e.target.value)}
                              data-testid={`input-value-${group.groupKey}`}
                            />
                          </div>
                          <div>
                            <Label htmlFor={`purchaseDate-${group.groupKey}`}>Data da Compra *</Label>
                            <Input
                              id={`purchaseDate-${group.groupKey}`}
                              type="date"
                              value={data.purchaseDate || new Date().toISOString().split('T')[0]}
                              onChange={(e) => handleTicketDataChange(group.groupKey, "purchaseDate", e.target.value)}
                              data-testid={`input-purchase-date-${group.groupKey}`}
                            />
                          </div>
                          <div>
                            <Label htmlFor={`departureAirport-${group.groupKey}`}>Aeroporto Origem *</Label>
                            <Input
                              id={`departureAirport-${group.groupKey}`}
                              placeholder="Ex: GRU"
                              value={data.departureAirport || ""}
                              onChange={(e) => handleTicketDataChange(group.groupKey, "departureAirport", e.target.value)}
                              data-testid={`input-departure-airport-${group.groupKey}`}
                            />
                          </div>
                          <div>
                            <Label htmlFor={`destinationAirport-${inclusion.id}`}>Aeroporto Destino *</Label>
                            <Input
                              id={`destinationAirport-${inclusion.id}`}
                              placeholder="Ex: RJ"
                              value={data.destinationAirport || ""}
                              onChange={(e) => handleTicketDataChange(group.groupKey, "destinationAirport", e.target.value)}
                              data-testid={`input-destination-airport-${group.groupKey}`}
                            />
                          </div>
                          <div>
                            <Label htmlFor={`actualDepartureDate-${group.groupKey}`}>Data de Ida *</Label>
                            <Input
                              id={`actualDepartureDate-${group.groupKey}`}
                              type="date"
                              value={data.actualDepartureDate || inclusion.flightDepartureDate || ""}
                              onChange={(e) => handleTicketDataChange(group.groupKey, "actualDepartureDate", e.target.value)}
                              data-testid={`input-departure-date-${group.groupKey}`}
                            />
                          </div>
                          <div>
                            <Label htmlFor={`actualDepartureTime-${group.groupKey}`}>Horário de Ida *</Label>
                            <Input
                              id={`actualDepartureTime-${group.groupKey}`}
                              type="time"
                              value={data.actualDepartureTime || inclusion.flightDepartureSuggestedTime || ""}
                              onChange={(e) => handleTicketDataChange(group.groupKey, "actualDepartureTime", e.target.value)}
                              data-testid={`input-departure-time-${group.groupKey}`}
                            />
                          </div>
                          <div>
                            <Label htmlFor={`actualReturnDate-${group.groupKey}`}>Data de Volta</Label>
                            <Input
                              id={`actualReturnDate-${group.groupKey}`}
                              type="date"
                              value={data.actualReturnDate || inclusion.flightReturnDate || ""}
                              onChange={(e) => handleTicketDataChange(group.groupKey, "actualReturnDate", e.target.value)}
                              data-testid={`input-return-date-${group.groupKey}`}
                            />
                          </div>
                          <div>
                            <Label htmlFor={`actualReturnTime-${group.groupKey}`}>Horário de Volta *</Label>
                            <Input
                              id={`actualReturnTime-${group.groupKey}`}
                              type="time"
                              value={data.actualReturnTime || inclusion.flightReturnSuggestedTime || ""}
                              onChange={(e) => handleTicketDataChange(group.groupKey, "actualReturnTime", e.target.value)}
                              data-testid={`input-return-time-${group.groupKey}`}
                            />
                          </div>
                          <div>
                            <Label htmlFor={`purchaseOrderNumber-${group.groupKey}`}>Ordem de Compra *</Label>
                            <Input
                              id={`purchaseOrderNumber-${group.groupKey}`}
                              placeholder="Número da OC"
                              value={data.purchaseOrderNumber || ""}
                              onChange={(e) => handleTicketDataChange(group.groupKey, "purchaseOrderNumber", e.target.value)}
                              data-testid={`input-po-number-${group.groupKey}`}
                            />
                          </div>
                          <div className="md:col-span-2 lg:col-span-3">
                            <Label htmlFor={`fileUrl-${group.groupKey}`}>Link do Arquivo (Opcional)</Label>
                            <Input
                              id={`fileUrl-${group.groupKey}`}
                              placeholder="URL do arquivo da passagem"
                              value={data.fileUrl || ""}
                              onChange={(e) => handleTicketDataChange(group.groupKey, "fileUrl", e.target.value)}
                              data-testid={`input-file-url-${group.groupKey}`}
                            />
                          </div>
                          <div className="md:col-span-2 lg:col-span-3 flex justify-end">
                            <Button
                              onClick={() => handlePurchaseTicketGroup(group)}
                              disabled={createTicketMutation.isPending}
                              data-testid={`button-purchase-${group.groupKey}`}
                            >
                              <Save className="w-4 h-4 mr-2" />
                              {createTicketMutation.isPending ? "Registrando..." : "Registrar Passagem"}
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
    </div>
  );
}
