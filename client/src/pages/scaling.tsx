import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import NavigationTabs from "@/components/layout/navigation-tabs";
import WorkflowIndicator from "@/components/layout/workflow-indicator";
import StatusBadge from "@/components/common/status-badge";
import { User, Eye, Save } from "lucide-react";
import UniversalFilters from "@/components/common/universal-filters";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TeamInclusion, Event, Function, Collaborator } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";

export default function Scaling() {
  const [filters, setFilters] = useState({
    eventId: "all",
    functionId: "all",
    collaboratorId: "all",
    status: "all",
    hasTicket: "all",
    searchId: "",
  });
  
  const [selectedInclusion, setSelectedInclusion] = useState<TeamInclusion | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState({
    collaboratorId: "",
    observations: "",
    dailyValue: 0,
  });
  
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: teamInclusions, isLoading } = useQuery<TeamInclusion[]>({
    queryKey: ["/api/team-inclusions"],
  });

  const { data: events } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const { data: functions } = useQuery<Function[]>({
    queryKey: ["/api/functions"],
  });

  // Filtrar teamInclusions - administradores veem tudo, outros apenas suas funções
  const userFunctionIds = functions?.filter(f => f.userId === user?.id).map(f => f.id) || [];
  const filteredTeamInclusions = teamInclusions?.filter(ti => {
    // Administradores veem todas as inclusões (verificando diferentes formatos de role)
    if (user?.role === 'administrador' || user?.role === 'admin' || user?.role === 'administrator') return true;
    // Outros usuários veem apenas suas funções atribuídas
    return userFunctionIds.includes(ti.functionId);
  }) || [];

  const { data: collaborators } = useQuery<Collaborator[]>({
    queryKey: ["/api/collaborators"],
  });

  // Filter inclusions - now shows all phases to keep records visible
  const scalingInclusions = filteredTeamInclusions?.filter(
    inclusion => {
      const idMatch = !filters.searchId || 
        (inclusion.inclusionNumber && inclusion.inclusionNumber.toString().includes(filters.searchId)) ||
        inclusion.id.toLowerCase().includes(filters.searchId.toLowerCase());
      
      // Apply universal filters
      if (filters.eventId !== "all" && inclusion.eventId !== filters.eventId) return false;
      if (filters.functionId !== "all" && inclusion.functionId !== filters.functionId) return false;
      if (filters.collaboratorId !== "all" && inclusion.collaboratorId !== filters.collaboratorId) return false;
      if (filters.hasTicket === "with" && !inclusion.needsTicket) return false;
      if (filters.hasTicket === "without" && inclusion.needsTicket) return false;
      
      return idMatch;
    }
  ) || [];

  // Helper function to determine if escalation is completed
  const isEscalated = (inclusion: TeamInclusion) => {
    return inclusion.collaboratorId && (
      inclusion.status === "escalacao" || 
      inclusion.status === "passagem" || 
      inclusion.status === "fechamento" || 
      inclusion.status === "aprovacao" || 
      inclusion.status === "aprovado"
    );
  };

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
      setShowModal(false);
      setSelectedInclusion(null);
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao atualizar escalação",
        variant: "destructive",
      });
    },
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const handleRowClick = (inclusion: TeamInclusion) => {
    setSelectedInclusion(inclusion);
    setModalData({
      collaboratorId: inclusion.collaboratorId || "",
      observations: inclusion.observations || "",
      dailyValue: 0, // Always start empty, user must input value
    });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!selectedInclusion) return;

    updateTeamInclusionMutation.mutate({
      id: selectedInclusion.id,
      data: {
        collaboratorId: modalData.collaboratorId,
        observations: modalData.observations,
        dailyValue: modalData.dailyValue ? Math.round(modalData.dailyValue * 100) : null, // Store in cents
      }
    });
  };

  const getEventName = (eventId: string) => {
    return events?.find(e => e.id === eventId)?.name || "Evento não encontrado";
  };

  const getFunctionName = (functionId: string) => {
    return functions?.find(f => f.id === functionId)?.name || "Função não encontrada";
  };

  const getCollaboratorName = (collaboratorId?: string) => {
    if (!collaboratorId) return "Não definido";
    return collaborators?.find(c => c.id === collaboratorId)?.fullName || "Colaborador não encontrado";
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "N/A";
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
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
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <NavigationTabs activeTab="scaling" />
        <WorkflowIndicator currentPhase="escalacao" />
        
        <div className="bg-card rounded-lg shadow-sm border border-border">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-2xl font-bold text-foreground">Escalação - Visualização</h2>
            <p className="text-muted-foreground mt-1">
              Lista de escalações com informações detalhadas
            </p>
          </div>

          <UniversalFilters filters={filters} onFiltersChange={setFilters} />

          {scalingInclusions.length === 0 ? (
            <div className="p-12 text-center">
              <User className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                Nenhuma escalação encontrada
              </h3>
              <p className="text-muted-foreground">
                Não há registros de escalação para exibir com os filtros atuais.
              </p>
            </div>
          ) : (() => {
            const withoutTicket = scalingInclusions.filter(inclusion => !inclusion.needsTicket);
            const withTicket = scalingInclusions.filter(inclusion => inclusion.needsTicket);
            
            return (
              <Tabs defaultValue={withoutTicket.length > 0 ? "without-ticket" : "with-ticket"} className="w-full">
                <div className="px-6 py-4 border-b border-border">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger 
                      value="without-ticket" 
                      className="flex items-center gap-2"
                      disabled={withoutTicket.length === 0}
                    >
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      Sem Passagem ({withoutTicket.length})
                    </TabsTrigger>
                    <TabsTrigger 
                      value="with-ticket" 
                      className="flex items-center gap-2"
                      disabled={withTicket.length === 0}
                    >
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      Com Passagem ({withTicket.length})
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* Aba: Escalações SEM passagem */}
                <TabsContent value="without-ticket" className="mt-0">
                  {withoutTicket.length === 0 ? (
                    <div className="p-12 text-center">
                      <User className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-foreground mb-2">
                        Nenhuma escalação sem passagem
                      </h3>
                      <p className="text-muted-foreground">
                        Não há registros de escalações que não necessitam de passagens.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-muted">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              ID
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Evento
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Função
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Colaborador
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Data Início e Fim
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Quantidade de Diárias
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Escalação
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-card divide-y divide-border">
                          {withoutTicket.map((inclusion) => (
                            <tr 
                              key={inclusion.id} 
                              className="hover:bg-accent/30 transition-colors cursor-pointer"
                              onClick={() => handleRowClick(inclusion)}
                            >
                              <td className="px-4 py-4 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <div className="text-sm font-mono text-foreground">
                                    #{inclusion.inclusionNumber || 'N/A'}
                                  </div>
                                  <Eye className="w-4 h-4 text-muted-foreground" />
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <div className="text-sm font-medium text-foreground">
                                  {getEventName(inclusion.eventId)}
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <div className="text-sm font-medium text-foreground">
                                  {getFunctionName(inclusion.functionId)}
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <div className="text-sm text-foreground">
                                  {getCollaboratorName(inclusion.collaboratorId)}
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <div className="text-sm text-foreground">
                                  {formatDate(inclusion.scheduleStartDate)} a {formatDate(inclusion.scheduleEndDate)}
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <div className="text-sm text-foreground font-medium">
                                  {inclusion.dailyRates} diárias
                                </div>
                              </td>
                              <td className="px-3 py-4">
                                {isEscalated(inclusion) ? (
                                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm rounded-full">
                                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                    Escalado
                                  </div>
                                ) : (
                                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 text-sm rounded-full">
                                    <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                                    Pendente
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>

                {/* Aba: Escalações COM passagem */}
                <TabsContent value="with-ticket" className="mt-0">
                  {withTicket.length === 0 ? (
                    <div className="p-12 text-center">
                      <User className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-foreground mb-2">
                        Nenhuma escalação com passagem
                      </h3>
                      <p className="text-muted-foreground">
                        Não há registros de escalações que necessitam de passagens.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-muted">
                          <tr>
                            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              ID
                            </th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Função / Evento
                            </th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Colaborador
                            </th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Período / Diárias
                            </th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Passagens
                            </th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Horários
                            </th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Escalação
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-card divide-y divide-border">
                          {withTicket.map((inclusion) => (
                            <tr 
                              key={inclusion.id} 
                              className="hover:bg-accent/30 transition-colors cursor-pointer"
                              onClick={() => handleRowClick(inclusion)}
                            >
                              <td className="px-3 py-4 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <div className="text-sm font-mono text-foreground">
                                    #{inclusion.inclusionNumber || 'N/A'}
                                  </div>
                                  <Eye className="w-4 h-4 text-muted-foreground" />
                                </div>
                              </td>
                              <td className="px-3 py-4">
                                <div className="text-sm font-medium text-foreground">
                                  {getFunctionName(inclusion.functionId)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {getEventName(inclusion.eventId)}
                                </div>
                              </td>
                              <td className="px-3 py-4">
                                <div className="text-sm text-foreground">
                                  {getCollaboratorName(inclusion.collaboratorId)}
                                </div>
                              </td>
                              <td className="px-3 py-4">
                                <div className="text-sm text-foreground">
                                  {formatDate(inclusion.scheduleStartDate)} a {formatDate(inclusion.scheduleEndDate)}
                                </div>
                                <div className="text-xs text-muted-foreground font-medium">
                                  {inclusion.dailyRates} diárias
                                </div>
                              </td>
                              <td className="px-3 py-4">
                                <div className="text-sm text-foreground">
                                  <div>Ida: {formatDate(inclusion.flightDepartureDate) || "N/A"}</div>
                                  <div>Retorno: {formatDate(inclusion.flightReturnDate) || "N/A"}</div>
                                </div>
                              </td>
                              <td className="px-3 py-4">
                                <div className="text-sm text-foreground">
                                  <div>Partida: {inclusion.flightDepartureSuggestedTime || "N/A"}</div>
                                  <div>Retorno: {inclusion.flightReturnSuggestedTime || "N/A"}</div>
                                </div>
                              </td>
                              <td className="px-3 py-4">
                                {isEscalated(inclusion) ? (
                                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm rounded-full">
                                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                    Escalado
                                  </div>
                                ) : (
                                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 text-sm rounded-full">
                                    <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                                    Pendente
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            );
          })()}
        </div>
      </div>

      {/* Modal de Detalhes da Escalação */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Detalhes da Escalação #{selectedInclusion?.inclusionNumber || 'N/A'}
            </DialogTitle>
          </DialogHeader>
          
          {selectedInclusion && (
            <div className="space-y-6">
              {/* Informações Básicas */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Evento</Label>
                  <div className="text-sm text-muted-foreground mt-1">
                    {getEventName(selectedInclusion.eventId)}
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">ID</Label>
                  <div className="text-sm text-muted-foreground mt-1 font-mono">
                    #{selectedInclusion.inclusionNumber || 'N/A'}
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Função</Label>
                  <div className="text-sm text-muted-foreground mt-1">
                    {getFunctionName(selectedInclusion.functionId)}
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Status da Escalação</Label>
                  <div className="mt-1">
                    {isEscalated(selectedInclusion) ? (
                      <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm rounded-full">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        Escalado
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-2 px-3 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 text-sm rounded-full">
                        <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                        Pendente
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Seleção de Colaborador */}
              <div>
                <Label htmlFor="collaborator" className="text-sm font-medium">
                  Colaborador *
                </Label>
                <Select 
                  value={modalData.collaboratorId} 
                  onValueChange={(value) => setModalData(prev => ({...prev, collaboratorId: value}))}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Selecione um colaborador" />
                  </SelectTrigger>
                  <SelectContent>
                    {collaborators?.map((collaborator) => (
                      <SelectItem key={collaborator.id} value={collaborator.id}>
                        {collaborator.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Informações de Data */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Data de Início</Label>
                  <div className="text-sm text-muted-foreground mt-1">
                    {formatDate(selectedInclusion.scheduleStartDate)}
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Data de Fim</Label>
                  <div className="text-sm text-muted-foreground mt-1">
                    {formatDate(selectedInclusion.scheduleEndDate)}
                  </div>
                </div>
              </div>

              {/* Informações de Passagem (só se needsTicket for true) */}
              {selectedInclusion.needsTicket && (
                <div className="border rounded-lg p-4 bg-blue-50 dark:bg-blue-950/30">
                  <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-3">
                    Informações de Passagem
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium">Data de Partida</Label>
                      <div className="text-sm text-muted-foreground mt-1">
                        {formatDate(selectedInclusion.flightDepartureDate) || "Não definida"}
                      </div>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Data de Retorno</Label>
                      <div className="text-sm text-muted-foreground mt-1">
                        {formatDate(selectedInclusion.flightReturnDate) || "Não definida"}
                      </div>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Horário Sugerido - Partida</Label>
                      <div className="text-sm text-muted-foreground mt-1">
                        {selectedInclusion.flightDepartureSuggestedTime || "Não definido"}
                      </div>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Horário Sugerido - Retorno</Label>
                      <div className="text-sm text-muted-foreground mt-1">
                        {selectedInclusion.flightReturnSuggestedTime || "Não definido"}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Valores e Diárias */}
              <div className="border rounded-lg p-4 bg-green-50 dark:bg-green-950/30">
                <h4 className="text-sm font-semibold text-green-700 dark:text-green-300 mb-3">
                  Valores
                </h4>
                <div className="grid grid-cols-3 gap-4 items-end">
                  <div>
                    <Label htmlFor="dailyValue" className="text-sm font-medium">
                      Valor da Diária (R$)
                    </Label>
                    <Input
                      id="dailyValue"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={modalData.dailyValue || ""}
                      onChange={(e) => setModalData(prev => ({...prev, dailyValue: parseFloat(e.target.value) || 0}))}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Quantidade de Diárias</Label>
                    <div className="text-lg font-semibold text-foreground mt-2 px-3 py-2 bg-muted rounded">
                      {selectedInclusion.dailyRates}
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Valor Total</Label>
                    <div className="text-lg font-bold text-green-600 dark:text-green-400 mt-2 px-3 py-2 bg-background rounded border">
                      {formatCurrency((modalData.dailyValue || 0) * selectedInclusion.dailyRates)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Observações */}
              <div>
                <Label htmlFor="observations" className="text-sm font-medium">
                  Observações
                </Label>
                <Textarea
                  id="observations"
                  rows={3}
                  placeholder="Digite observações sobre a escalação..."
                  value={modalData.observations}
                  onChange={(e) => setModalData(prev => ({...prev, observations: e.target.value}))}
                  className="mt-2"
                />
                {selectedInclusion.observations && (
                  <div className="mt-2 p-3 bg-muted rounded text-sm">
                    <span className="text-xs text-muted-foreground block mb-1">
                      Observação da Inclusão Original:
                    </span>
                    {selectedInclusion.observations}
                  </div>
                )}
              </div>

              {/* Botões */}
              <div className="flex gap-3 justify-end pt-4 border-t">
                <Button variant="outline" onClick={() => setShowModal(false)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleSave}
                  disabled={updateTeamInclusionMutation.isPending}
                  className="flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {updateTeamInclusionMutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}