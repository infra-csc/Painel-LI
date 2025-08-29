import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import NavigationTabs from "@/components/layout/navigation-tabs";
import WorkflowIndicator from "@/components/layout/workflow-indicator";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import StatusBadge from "@/components/common/status-badge";
import CollaboratorModal from "@/components/modals/collaborator-modal";
import { Plus, User, Save } from "lucide-react";
import type { TeamInclusion, Event, Function, Collaborator } from "@shared/schema";

export default function Scaling() {
  const [selectedCollaborators, setSelectedCollaborators] = useState<Record<string, string>>({});
  const [observations, setObservations] = useState<Record<string, string>>({});
  const [showCollaboratorModal, setShowCollaboratorModal] = useState(false);
  const [currentArea, setCurrentArea] = useState<string>("");
  const [currentEventName, setCurrentEventName] = useState<string>("");
  const [currentFunctionName, setCurrentFunctionName] = useState<string>("");
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

  const updateTeamInclusionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PATCH", `/api/team-inclusions/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Escalação atualizada com sucesso",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao atualizar escalação",
        variant: "destructive",
      });
    },
  });

  const createEscalationMutation = useMutation({
    mutationFn: async (baseInclusion: TeamInclusion) => {
      // Calculate daily rates
      const startDate = new Date(baseInclusion.scheduleStartDate);
      const endDate = new Date(baseInclusion.scheduleEndDate);
      const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

      const payload = {
        eventId: baseInclusion.eventId,
        functionId: baseInclusion.functionId,
        area: baseInclusion.area,
        scheduleStartDate: baseInclusion.scheduleStartDate,
        scheduleEndDate: baseInclusion.scheduleEndDate,
        dailyRates: diffDays,
        dailyValue: baseInclusion.dailyValue,
        needsTicket: baseInclusion.needsTicket,
        flightDepartureDate: baseInclusion.flightDepartureDate,
        flightDepartureSuggestedTime: baseInclusion.flightDepartureSuggestedTime,
        flightReturnDate: baseInclusion.flightReturnDate,
        flightReturnSuggestedTime: baseInclusion.flightReturnSuggestedTime,
        status: "planejado",
        phase: "escalacao",
        collaboratorId: null,
        observations: null
      };

      const response = await apiRequest("POST", "/api/team-inclusions", payload);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Nova escalação adicionada com sucesso",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao adicionar nova escalação",
        variant: "destructive",
      });
    },
  });

  // Filter inclusions that are in planning phase or scaling phase
  const scalingInclusions = teamInclusions?.filter(
    inclusion => inclusion.status === "planejado" || inclusion.status === "escalacao"
  ) || [];

  // Group inclusions by event
  const groupedByEvent = scalingInclusions.reduce((acc, inclusion) => {
    const eventId = inclusion.eventId;
    if (!acc[eventId]) {
      acc[eventId] = [];
    }
    acc[eventId].push(inclusion);
    return acc;
  }, {} as Record<string, TeamInclusion[]>);

  const eventIds = Object.keys(groupedByEvent);

  const getEventName = (eventId: string) => {
    return events?.find(e => e.id === eventId)?.name || "Evento não encontrado";
  };

  const getFunctionName = (functionId: string) => {
    return functions?.find(f => f.id === functionId)?.name || "Função não encontrada";
  };


  const getCollaboratorName = (collaboratorId?: string) => {
    if (!collaboratorId) return "";
    return collaborators?.find(c => c.id === collaboratorId)?.fullName || "";
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  };

  const handleCollaboratorSelect = (inclusionId: string, collaboratorId: string) => {
    setSelectedCollaborators(prev => ({
      ...prev,
      [inclusionId]: collaboratorId
    }));
  };

  const handleObservationChange = (inclusionId: string, observation: string) => {
    setObservations(prev => ({
      ...prev,
      [inclusionId]: observation
    }));
  };

  const handleConfirmScaling = (inclusion: TeamInclusion) => {
    const collaboratorId = selectedCollaborators[inclusion.id] || inclusion.collaboratorId;
    const observation = observations[inclusion.id] || inclusion.observations;

    if (!collaboratorId) {
      toast({
        title: "Erro",
        description: "Selecione um colaborador antes de confirmar a escalação",
        variant: "destructive",
      });
      return;
    }

    // If the inclusion doesn't need a ticket, skip ticket phase and go directly to closure
    const needsTicket = inclusion.needsTicket;
    const nextStatus = needsTicket ? "passagem" : "fechamento";
    const nextPhase = needsTicket ? "passagem" : "fechamento";

    updateTeamInclusionMutation.mutate({
      id: inclusion.id,
      data: {
        collaboratorId,
        observations: observation,
        status: nextStatus,
        phase: nextPhase
      }
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <NavigationTabs activeTab="scaling" />
          <WorkflowIndicator currentPhase="escalacao" />
          <div className="bg-card rounded-lg shadow-sm border border-border p-6 animate-pulse">
            <div className="h-8 bg-muted rounded mb-4 w-1/3"></div>
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 bg-muted rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <NavigationTabs activeTab="scaling" />
          <WorkflowIndicator currentPhase="escalacao" />
          
          <div className="bg-card rounded-lg shadow-sm border border-border">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-2xl font-bold text-foreground">Tela 2 - Escalação</h2>
              <p className="text-muted-foreground mt-1">
                Selecione colaboradores para as funções e confirme as escalações
              </p>
            </div>

            {scalingInclusions.length === 0 ? (
              <div className="p-12 text-center">
                <User className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">
                  Nenhuma escalação pendente
                </h3>
                <p className="text-muted-foreground">
                  Todas as inclusões de equipe já foram escaladas ou não há registros para escalar.
                </p>
              </div>
            ) : eventIds.length === 1 ? (
              // Single event - show directly without tabs
              <div>
                <div className="px-6 py-4 border-b border-border bg-muted/30">
                  <h3 className="text-lg font-semibold text-foreground">
                    {getEventName(eventIds[0])}
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Função
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Datas / Diárias
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Colaborador
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Observação
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-card divide-y divide-border">
                      {groupedByEvent[eventIds[0]].map((inclusion) => (
                      <tr key={inclusion.id} className="hover:bg-accent/50 transition-colors" data-testid={`row-scaling-${inclusion.id}`}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-foreground">
                            {getFunctionName(inclusion.functionId)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Área: {inclusion.area}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-foreground">
                            {formatDate(inclusion.scheduleStartDate)} - {formatDate(inclusion.scheduleEndDate)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {inclusion.dailyRates} diárias
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2 items-center max-w-xs">
                            <Select 
                              value={selectedCollaborators[inclusion.id] || inclusion.collaboratorId || ""} 
                              onValueChange={(value) => handleCollaboratorSelect(inclusion.id, value)}
                              disabled={inclusion.status === "escalacao"}
                            >
                              <SelectTrigger className="flex-1 min-w-[180px]" data-testid={`select-collaborator-${inclusion.id}`}>
                                <SelectValue placeholder="Selecione Colaborador" />
                              </SelectTrigger>
                              <SelectContent>
                                {collaborators?.map((collaborator) => (
                                  <SelectItem key={collaborator.id} value={collaborator.id}>
                                    {collaborator.fullName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="p-1 h-8 w-8 shrink-0"
                              onClick={() => {
                                setCurrentArea(inclusion.area);
                                setCurrentEventName(getEventName(inclusion.eventId));
                                setCurrentFunctionName(getFunctionName(inclusion.functionId));
                                setShowCollaboratorModal(true);
                              }}
                              data-testid={`button-add-collaborator-${inclusion.id}`}
                            >
                              <Plus className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-2">
                            {inclusion.observations && (
                              <div className="p-2 bg-muted rounded text-sm">
                                <span className="text-xs text-muted-foreground block mb-1">Observação da Tela 1:</span>
                                {inclusion.observations}
                              </div>
                            )}
                            <Textarea
                              rows={2}
                              placeholder="Nova observação da escalação..."
                              value={observations[inclusion.id] || ""}
                              onChange={(e) => handleObservationChange(inclusion.id, e.target.value)}
                              disabled={inclusion.status === "escalacao"}
                              className="min-w-0 max-w-xs"
                              data-testid={`textarea-observation-${inclusion.id}`}
                            />
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <StatusBadge status={inclusion.status} />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          {inclusion.status === "planejado" && (
                            <div className="flex gap-2 items-center justify-end">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => createEscalationMutation.mutate(inclusion)}
                                disabled={createEscalationMutation.isPending}
                                data-testid={`button-add-escalation-${inclusion.id}`}
                              >
                                <Plus className="w-4 h-4 mr-1" />
                                {createEscalationMutation.isPending ? "Adicionando..." : "Adicionar Escalação"}
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleConfirmScaling(inclusion)}
                                disabled={updateTeamInclusionMutation.isPending}
                                data-testid={`button-confirm-${inclusion.id}`}
                              >
                                <Save className="w-4 h-4 mr-1" />
                                {updateTeamInclusionMutation.isPending ? "Confirmando..." : "Confirmar Escalação"}
                              </Button>
                            </div>
                          )}
                          {inclusion.status === "escalacao" && (
                            <span className="text-sm text-muted-foreground">Escalado</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              // Multiple events - show tabs
              <Tabs defaultValue={eventIds[0]} className="w-full">
                <div className="px-6 py-4 border-b border-border">
                  <TabsList className="grid w-full grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {eventIds.map((eventId) => (
                      <TabsTrigger key={eventId} value={eventId} className="text-sm">
                        {getEventName(eventId)}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
                {eventIds.map((eventId) => (
                  <TabsContent key={eventId} value={eventId} className="mt-0">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-muted">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Função
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Datas / Diárias
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Colaborador
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Observação
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Status
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Ações
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-card divide-y divide-border">
                          {groupedByEvent[eventId].map((inclusion) => (
                            <tr key={inclusion.id} className="hover:bg-accent/50 transition-colors" data-testid={`row-scaling-${inclusion.id}`}>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-foreground">
                                  {getFunctionName(inclusion.functionId)}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  Área: {inclusion.area}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-foreground">
                                  {formatDate(inclusion.scheduleStartDate)} - {formatDate(inclusion.scheduleEndDate)}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {inclusion.dailyRates} diárias
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex gap-2 items-center max-w-xs">
                                  <Select 
                                    value={selectedCollaborators[inclusion.id] || inclusion.collaboratorId || ""} 
                                    onValueChange={(value) => handleCollaboratorSelect(inclusion.id, value)}
                                    disabled={inclusion.status === "escalacao"}
                                  >
                                    <SelectTrigger className="flex-1 min-w-[180px]" data-testid={`select-collaborator-${inclusion.id}`}>
                                      <SelectValue placeholder="Selecione Colaborador" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {collaborators?.map((collaborator) => (
                                        <SelectItem key={collaborator.id} value={collaborator.id}>
                                          {collaborator.fullName}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="p-1 h-8 w-8 shrink-0"
                                    onClick={() => {
                                      setCurrentArea(inclusion.area);
                                      setCurrentEventName(getEventName(inclusion.eventId));
                                      setCurrentFunctionName(getFunctionName(inclusion.functionId));
                                      setShowCollaboratorModal(true);
                                    }}
                                    data-testid={`button-add-collaborator-${inclusion.id}`}
                                  >
                                    <Plus className="w-4 h-4" />
                                  </Button>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="space-y-2">
                                  <Textarea
                                    placeholder="Observações sobre a escalação (opcional)"
                                    value={observations[inclusion.id] || inclusion.observations || ""}
                                    onChange={(e) => handleObservationChange(inclusion.id, e.target.value)}
                                    className="w-full h-20 text-sm resize-none"
                                    disabled={inclusion.status === "escalacao"}
                                    data-testid={`textarea-observation-${inclusion.id}`}
                                  />
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <StatusBadge status={inclusion.status} />
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-right">
                                {inclusion.status === "planejado" && (
                                  <div className="flex gap-2 items-center justify-end">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => createEscalationMutation.mutate(inclusion)}
                                      disabled={createEscalationMutation.isPending}
                                      data-testid={`button-add-escalation-${inclusion.id}`}
                                    >
                                      <Plus className="w-4 h-4 mr-1" />
                                      {createEscalationMutation.isPending ? "Adicionando..." : "Adicionar Escalação"}
                                    </Button>
                                    <Button
                                      size="sm"
                                      onClick={() => handleConfirmScaling(inclusion)}
                                      disabled={updateTeamInclusionMutation.isPending}
                                      data-testid={`button-confirm-${inclusion.id}`}
                                    >
                                      <Save className="w-4 h-4 mr-1" />
                                      {updateTeamInclusionMutation.isPending ? "Confirmando..." : "Confirmar Escalação"}
                                    </Button>
                                  </div>
                                )}
                                {inclusion.status === "escalacao" && (
                                  <span className="text-sm text-muted-foreground">Escalado</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </div>
        </div>
      </div>

      <CollaboratorModal 
        open={showCollaboratorModal} 
        onClose={() => setShowCollaboratorModal(false)}
        defaultArea={currentArea}
        eventName={currentEventName}
        functionName={currentFunctionName}
      />
    </>
  );
}