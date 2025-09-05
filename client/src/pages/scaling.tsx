import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import NavigationTabs from "@/components/layout/navigation-tabs";
import WorkflowIndicator from "@/components/layout/workflow-indicator";
import StatusBadge from "@/components/common/status-badge";
import { User } from "lucide-react";
import UniversalFilters from "@/components/common/universal-filters";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  
  const { user } = useAuth();

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
                            <tr key={inclusion.id} className="hover:bg-accent/30 transition-colors">
                              <td className="px-4 py-4 whitespace-nowrap">
                                <div className="text-sm font-mono text-foreground">
                                  #{inclusion.inclusionNumber || 'N/A'}
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
                              <td className="px-4 py-4">
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
                              Datas de Passagens
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Horários Sugeridos
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Escalação
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-card divide-y divide-border">
                          {withTicket.map((inclusion) => (
                            <tr key={inclusion.id} className="hover:bg-accent/30 transition-colors">
                              <td className="px-4 py-4 whitespace-nowrap">
                                <div className="text-sm font-mono text-foreground">
                                  #{inclusion.inclusionNumber || 'N/A'}
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
                                <div className="text-sm text-foreground">
                                  <div>Ida: {formatDate(inclusion.flightDepartureDate) || "N/A"}</div>
                                  <div>Retorno: {formatDate(inclusion.flightReturnDate) || "N/A"}</div>
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <div className="text-sm text-foreground">
                                  <div>Partida: {inclusion.flightDepartureSuggestedTime || "N/A"}</div>
                                  <div>Retorno: {inclusion.flightReturnSuggestedTime || "N/A"}</div>
                                </div>
                              </td>
                              <td className="px-4 py-4">
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
                              <td className="px-4 py-4 whitespace-nowrap">
                                <StatusBadge status={inclusion.status} />
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
    </div>
  );
}