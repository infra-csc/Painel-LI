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
import type { TeamInclusion, Event, Function, Collaborator, Comment, Ticket } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import CommentsModal from "@/components/modals/comments-modal";

export default function Scaling() {
  const [filters, setFilters] = useState({
    eventId: "all",
    functionId: "all",
    collaboratorId: "all",
    escalationStatus: "all",
    searchId: "",
  });
  
  const [selectedInclusion, setSelectedInclusion] = useState<TeamInclusion | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState({
    collaboratorId: "",
    observations: "",
    dailyValue: 0,
  });
  
  // Estados para o modal de comentários
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [selectedInclusionForComments, setSelectedInclusionForComments] = useState<string | null>(null);
  
  // Estado para novo comentário inline
  const [newComment, setNewComment] = useState("");
  
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

  const { data: tickets } = useQuery<Ticket[]>({
    queryKey: ["/api/tickets"],
  });

  // Query para buscar comentários da inclusão selecionada
  const { data: comments } = useQuery<Comment[]>({
    queryKey: ["/api/comments", selectedInclusion?.id],
    enabled: !!selectedInclusion?.id,
  });

  // Mutation para adicionar comentário inline
  const addCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!user || !selectedInclusion) throw new Error("User or inclusion not found");
      
      const payload = {
        teamInclusionId: selectedInclusion.id,
        userId: user.id,
        content,
        phase: "escalacao",
      };

      const response = await apiRequest("POST", "/api/comments", payload);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Comentário adicionado com sucesso",
      });
      setNewComment("");
      queryClient.invalidateQueries({ queryKey: ["/api/comments", selectedInclusion?.id] });
    },
    onError: () => {
      toast({
        title: "Erro", 
        description: "Erro ao adicionar comentário",
        variant: "destructive",
      });
    },
  });

  const handleAddComment = () => {
    if (newComment.trim()) {
      addCommentMutation.mutate(newComment.trim());
    }
  };

  // Função para buscar ticket de uma inclusão
  const getTicket = (inclusionId: string): Ticket | undefined => {
    return tickets?.find(ticket => ticket.teamInclusionId === inclusionId);
  };

  const { data: users } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

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

  // Helper function to determine if escalation is confirmed (após confirmar escalação)
  const isEscalationConfirmed = (inclusion: TeamInclusion) => {
    return inclusion.collaboratorId && (
      inclusion.status === "escalado" ||
      inclusion.status === "passagem" || 
      inclusion.status === "fechamento" || 
      inclusion.status === "aprovacao" || 
      inclusion.status === "aprovado"
    );
  };

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
      
      // Apply escalation status filter
      if (filters.escalationStatus !== "all") {
        const escalated = isEscalated(inclusion);
        if (filters.escalationStatus === "pending" && escalated) return false;
        if (filters.escalationStatus === "escalated" && !escalated) return false;
      }
      
      return idMatch;
    }
  ) || [];

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
      observations: "", // 🔧 Campo vazio - usuário deve inserir observações manualmente
      dailyValue: 0, // Always start empty, user must input value
    });
    setShowModal(true);
  };

  const handleViewComments = (e: React.MouseEvent, inclusion: TeamInclusion) => {
    e.stopPropagation(); // Evita que o click na linha seja acionado
    // Abrir o modal da escalação com os dados da inclusão
    setSelectedInclusion(inclusion);
    setModalData({
      collaboratorId: inclusion.collaboratorId || "",
      observations: "", // 🔧 Campo vazio - usuário deve inserir observações manualmente
      dailyValue: 0,
    });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!selectedInclusion) return;

    const updateData: any = {
      collaboratorId: modalData.collaboratorId,
      observations: modalData.observations,
    };
    
    // Só incluir dailyValue se foi especificamente editado
    if (modalData.dailyValue && modalData.dailyValue > 0) {
      updateData.dailyValue = Math.round(modalData.dailyValue * 100); // Store in cents
    }
    
    updateTeamInclusionMutation.mutate({
      id: selectedInclusion.id,
      data: updateData
    });
  };

  const handleConfirmEscalation = () => {
    if (!selectedInclusion) return;

    if (!modalData.collaboratorId) {
      toast({
        title: "Erro",
        description: "Selecione um colaborador antes de confirmar a escalação",
        variant: "destructive",
      });
      return;
    }

    // If the inclusion doesn't need a ticket, skip ticket phase and go directly to closure
    const needsTicket = selectedInclusion.needsTicket;
    const nextStatus = needsTicket ? "passagem" : "fechamento";
    const nextPhase = needsTicket ? "passagem" : "fechamento";

    const updateData: any = {
      collaboratorId: modalData.collaboratorId,
      observations: modalData.observations,
      status: nextStatus,
      phase: nextPhase
    };
    
    // Só incluir dailyValue se foi especificamente editado
    if (modalData.dailyValue && modalData.dailyValue > 0) {
      updateData.dailyValue = Math.round(modalData.dailyValue * 100); // Store in cents
    }
    
    updateTeamInclusionMutation.mutate({
      id: selectedInclusion.id,
      data: updateData
    });
  };

  const getEventName = (eventId: string) => {
    return events?.find(e => e.id === eventId)?.name || "Evento não encontrado";
  };

  const getFunctionName = (functionId: string) => {
    return functions?.find(f => f.id === functionId)?.name || "Função não encontrada";
  };

  const getCollaboratorName = (collaboratorId?: string | null) => {
    if (!collaboratorId) return "Não definido";
    return collaborators?.find(c => c.id === collaboratorId)?.fullName || "Colaborador não encontrado";
  };

  const getCollaborator = (collaboratorId?: string | null) => {
    if (!collaboratorId) return null;
    return collaborators?.find(c => c.id === collaboratorId) || null;
  };


  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "N/A";
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  };

  const formatDateTime = (date: Date | null) => {
    if (!date) return "N/A";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  };

  const getUserName = (userId: string): string => {
    if (user?.id === userId) {
      return "Você";
    }
    const commentUser = users?.find(u => u.id === userId);
    return commentUser?.name || "Usuário";
  };

  // Função para extrair dados de passagem das observações
  const extractTravelInfoFromObservations = (observations: string | undefined) => {
    if (!observations) return { ida: 'N/A', retorno: 'N/A', chegada: 'N/A', horario: 'N/A' };
    
    const idaMatch = observations.match(/Ida:\s*([^|]*?)(?:\s*\||\s*$)/);
    const retornoMatch = observations.match(/Retorno:\s*([^|]*?)(?:\s*\||\s*$)/);
    const chegadaMatch = observations.match(/Chegada:\s*([^|]*?)(?:\s*\||\s*$)/);
    const horarioMatch = observations.match(/Horário:\s*([^|]*?)(?:\s*\||\s*$)/);
    
    return {
      ida: (idaMatch && idaMatch[1].trim()) ? idaMatch[1].trim() : 'Não definido',
      retorno: (retornoMatch && retornoMatch[1].trim()) ? retornoMatch[1].trim() : 'Não definido', 
      chegada: (chegadaMatch && chegadaMatch[1].trim()) ? chegadaMatch[1].trim() : 'Não definido',
      horario: (horarioMatch && horarioMatch[1].trim()) ? horarioMatch[1].trim() : 'Não definido'
    };
  };

  const getPhaseLabel = (phase: string) => {
    switch (phase) {
      case "inclusao":
        return "Inclusão de Equipe";
      case "escalacao":
        return "Escalação";
      case "passagem":
        return "Compra de Passagem";
      case "fechamento":
        return "Fechamento";
      case "aprovacao":
        return "Aprovação";
      default:
        return phase;
    }
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

          <UniversalFilters filters={filters} onFiltersChange={setFilters} hideStatusFilter={true} />

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
            
            // Count pending escalations
            const withoutTicketPending = withoutTicket.filter(inclusion => !isEscalated(inclusion)).length;
            const withTicketPending = withTicket.filter(inclusion => !isEscalated(inclusion)).length;
            
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
                      <span>Sem Passagem ({withoutTicket.length})</span>
                      {withoutTicketPending > 0 && filters.escalationStatus !== "pending" && (
                        <span className="ml-1 px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 text-xs rounded-full font-medium">
                          {withoutTicketPending} pendente{withoutTicketPending !== 1 ? 's' : ''}
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger 
                      value="with-ticket" 
                      className="flex items-center gap-2"
                      disabled={withTicket.length === 0}
                    >
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span>Com Passagem ({withTicket.length})</span>
                      {withTicketPending > 0 && filters.escalationStatus !== "pending" && (
                        <span className="ml-1 px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 text-xs rounded-full font-medium">
                          {withTicketPending} pendente{withTicketPending !== 1 ? 's' : ''}
                        </span>
                      )}
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
                              <td className="px-3 py-4 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <div className="text-sm font-mono text-foreground">
                                    #{inclusion.inclusionNumber || 'N/A'}
                                  </div>
                                  <Eye 
                                    className="w-4 h-4 text-blue-600 hover:text-blue-800 cursor-pointer transition-colors" 
                                    onClick={(e) => handleViewComments(e, inclusion)}

                                  />
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
                                  <Eye 
                                    className="w-4 h-4 text-blue-600 hover:text-blue-800 cursor-pointer transition-colors" 
                                    onClick={(e) => handleViewComments(e, inclusion)}

                                  />
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
                    {collaborators?.filter(c => c.status === 'aprovado').map((collaborator) => (
                      <SelectItem key={collaborator.id} value={collaborator.id}>
                        {collaborator.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Dados do Colaborador Selecionado - só após escalação confirmada */}
              {modalData.collaboratorId && isEscalationConfirmed(selectedInclusion) && (() => {
                const collaborator = getCollaborator(modalData.collaboratorId);
                if (!collaborator) return null;
                return (
                  <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-3">
                      Dados do Colaborador
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground">Documento</Label>
                        <p className="text-sm font-medium">
                          {collaborator.documentType?.toUpperCase() || 'DOC'}: {collaborator.officialDocument || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Data de Nascimento</Label>
                        <p className="text-sm font-medium">
                          {collaborator.birthDate ? formatDate(collaborator.birthDate) : 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}

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





              {/* Informações de Passagem - só para inclusões que necessitam de passagem */}
              {selectedInclusion.needsTicket && (() => {
                const ticket = getTicket(selectedInclusion.id);
                return (
                  <div className="space-y-4">
                    {/* Status e Dados da Passagem Comprada - PRIORIDADE QUANDO COMPRADA */}
                    <div className={`border rounded-lg p-4 ${ticket ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' : 'bg-amber-50 dark:bg-amber-950/30'}`}>
                      <h4 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${ticket ? 'text-green-700 dark:text-green-300' : 'text-amber-700 dark:text-amber-300'}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Status da Passagem
                      </h4>
                      
                      {ticket ? (
                        <>
                          {/* Status: Passagem Comprada */}
                          <div className="flex items-center gap-2 mb-4">
                            <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm rounded-full">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                              Passagem Comprada
                            </div>
                            <span className="text-xs text-muted-foreground">
                              Valor: {formatCurrency((ticket.value || 0) / 100)}
                            </span>
                          </div>

                          {/* Dados Reais da Passagem - DESTAQUE PRINCIPAL */}
                          <div className="bg-white dark:bg-gray-900 border-2 border-green-300 dark:border-green-700 rounded-lg p-4 shadow-sm">
                            <Label className="text-base font-semibold text-green-700 dark:text-green-300 mb-4 block">
                              ✈️ Dados Reais da Passagem Comprada
                            </Label>
                            <div className="grid grid-cols-2 gap-6">
                              <div>
                                <div className="space-y-3">
                                  <div className="text-sm">
                                    <span className="font-semibold text-foreground">Data Ida:</span>{' '}
                                    <span className="text-muted-foreground">
                                      {ticket.actualDepartureDate ? formatDate(ticket.actualDepartureDate) : 'Não informado'}
                                    </span>
                                  </div>
                                  <div className="text-sm">
                                    <span className="font-semibold text-foreground">Horário Ida:</span>{' '}
                                    <span className="text-muted-foreground">
                                      {ticket.actualDepartureTime || 'Não informado'}
                                    </span>
                                  </div>
                                  <div className="text-sm">
                                    <span className="font-semibold text-foreground">Aeroporto Origem:</span>{' '}
                                    <span className="text-muted-foreground">
                                      {ticket.departureAirport || 'Não informado'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div>
                                <div className="space-y-3">
                                  <div className="text-sm">
                                    <span className="font-semibold text-foreground">Data Retorno:</span>{' '}
                                    <span className="text-muted-foreground">
                                      {ticket.actualReturnDate ? formatDate(ticket.actualReturnDate) : 'Não informado'}
                                    </span>
                                  </div>
                                  <div className="text-sm">
                                    <span className="font-semibold text-foreground">Horário Retorno:</span>{' '}
                                    <span className="text-muted-foreground">
                                      {ticket.actualReturnTime || 'Não informado'}
                                    </span>
                                  </div>
                                  <div className="text-sm">
                                    <span className="font-semibold text-foreground">Aeroporto Destino:</span>{' '}
                                    <span className="text-muted-foreground">
                                      {ticket.destinationAirport || 'Não informado'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </>
                      ) : (
                        /* Status: Passagem Não Comprada */
                        <div className="flex items-center gap-2">
                          <div className="inline-flex items-center gap-2 px-3 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 text-sm rounded-full">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            Passagem Pendente
                          </div>
                          <span className="text-sm text-muted-foreground">
                            Passagem ainda não foi comprada
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Sugestões de Viagem - MENOR DESTAQUE QUANDO PASSAGEM JÁ COMPRADA */}
                    <details className={`border rounded-lg ${ticket ? 'bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-700' : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-700'}`} 
                             open={!ticket}>
                      <summary className={`p-3 cursor-pointer font-medium text-sm ${ticket ? 'text-gray-600 dark:text-gray-400' : 'text-blue-700 dark:text-blue-300'} hover:bg-opacity-80 transition-colors`}>
                        <span className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                          {ticket ? 'Ver Sugestões Originais (referência)' : 'Sugestões de Viagem'}
                          <span className="text-xs opacity-60">(vindas da inclusão de equipe)</span>
                        </span>
                      </summary>
                      <div className="p-4 pt-2">
                        {(() => {
                          const travelInfo = extractTravelInfoFromObservations(selectedInclusion.observations || undefined);
                          return (
                            <div className="space-y-3">
                              {/* Viagem de IDA - Versão Compacta */}
                              <div className={`border rounded-md p-3 ${ticket ? 'bg-gray-100 dark:bg-gray-800/50 border-gray-300' : 'bg-blue-25 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800'}`}>
                                <div className="flex items-center gap-2 mb-2">
                                  <svg className="w-3 h-3 text-current" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                  </svg>
                                  <span className="text-xs font-medium">🛫 IDA</span>
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-xs">
                                  <div>
                                    <span className="text-muted-foreground">Data:</span>
                                    <div className="font-medium">{travelInfo.ida !== 'N/A' && travelInfo.ida !== 'Não definido' ? travelInfo.ida : 'Não informado'}</div>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Horário:</span>
                                    <div className="font-medium">{travelInfo.chegada !== 'N/A' && travelInfo.chegada !== 'Não definido' ? travelInfo.chegada : 'Não informado'}</div>
                                  </div>
                                </div>
                              </div>

                              {/* Viagem de VOLTA - Versão Compacta */}
                              <div className={`border rounded-md p-3 ${ticket ? 'bg-gray-100 dark:bg-gray-800/50 border-gray-300' : 'bg-blue-25 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800'}`}>
                                <div className="flex items-center gap-2 mb-2">
                                  <svg className="w-3 h-3 text-current" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
                                  </svg>
                                  <span className="text-xs font-medium">🛬 VOLTA</span>
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-xs">
                                  <div>
                                    <span className="text-muted-foreground">Data:</span>
                                    <div className="font-medium">{travelInfo.retorno !== 'N/A' && travelInfo.retorno !== 'Não definido' ? travelInfo.retorno : 'Não informado'}</div>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Horário:</span>
                                    <div className="font-medium">{travelInfo.horario !== 'N/A' && travelInfo.horario !== 'Não definido' ? travelInfo.horario : 'Não informado'}</div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </details>
                  </div>
                );
              })()}

              {/* Seção de Anexos da Passagem */}
              {(() => {
                const ticket = getTicket(selectedInclusion.id);
                return ticket?.attachmentIds && ticket.attachmentIds.length > 0 && (
                  <div className="border-t pt-4">
                    <h3 className="text-lg font-medium mb-3">Anexos da Passagem</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {ticket.attachmentIds.map((attachmentId, index) => (
                        <div 
                          key={attachmentId} 
                          className="flex items-center gap-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 px-4 py-3 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900 cursor-pointer transition-colors"
                          onClick={async () => {
                            try {
                              // Buscar informações do anexo
                              const response = await fetch(`/api/attachments/${attachmentId}`);
                              const attachmentData = await response.json();
                              
                              if (response.ok) {
                                toast({
                                  title: `📎 Anexo ${index + 1}`,
                                  description: `Nome: ${attachmentData.name || 'Anexo da passagem'}\\nTipo: ${attachmentData.type || 'N/A'}\\nTamanho: ${attachmentData.size || 'N/A'}`,
                                });
                                
                                // Abrir anexo se disponível
                                if (attachmentData.viewUrl && attachmentData.viewUrl !== "#") {
                                  const isViewable = attachmentData.type?.includes('pdf') || 
                                                   attachmentData.type?.includes('image');
                                  
                                  if (isViewable) {
                                    window.open(attachmentData.viewUrl, '_blank');
                                  } else {
                                    // Download para outros tipos
                                    const link = document.createElement('a');
                                    link.href = attachmentData.downloadUrl || attachmentData.viewUrl;
                                    link.download = attachmentData.name || `anexo-${index + 1}`;
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                  }
                                }
                              } else {
                                throw new Error(attachmentData.message || 'Erro ao buscar anexo');
                              }
                            } catch (error) {
                              console.error('Erro ao abrir anexo:', error);
                              toast({
                                title: "Erro",
                                description: `Não foi possível abrir o anexo: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
                                variant: "destructive",
                              });
                            }
                          }}
                        >
                          <div className="flex-shrink-0">
                            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-800 rounded-full flex items-center justify-center">
                              <span className="text-blue-600 dark:text-blue-300 font-medium text-sm">
                                {index + 1}
                              </span>
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-blue-900 dark:text-blue-100">
                              Anexo {index + 1} da Passagem
                            </div>
                            <div className="text-xs text-blue-700 dark:text-blue-300">
                              Clique para visualizar
                            </div>
                          </div>
                          <div className="flex-shrink-0">
                            <Eye className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Seção de Comentários */}
              {/* Valores e Diárias - Movido para antes dos comentários */}
              <div className="border rounded-lg p-3 bg-muted/30 mb-4">
                <h4 className="text-xs font-medium text-muted-foreground mb-2">
                  Valores
                </h4>
                <div className="grid grid-cols-3 gap-3 items-end">
                  <div>
                    <Label htmlFor="dailyValue" className="text-xs font-medium">
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
                      className="mt-1 text-xs h-8"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Quantidade de Diárias</Label>
                    <div className="text-sm font-semibold text-foreground mt-1 px-2 py-1 bg-muted rounded text-center">
                      {selectedInclusion.dailyRates}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">Valor Total</Label>
                    <div className="text-xs text-muted-foreground mt-1 font-medium">
                      {formatCurrency((modalData.dailyValue || 0) * selectedInclusion.dailyRates)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-lg font-medium mb-3">Comentários</h3>
                
                {/* Lista de comentários existentes */}
                {comments && comments.length > 0 ? (
                  <div className="space-y-3 max-h-60 overflow-y-auto mb-4">
                    {comments.map((comment) => (
                      <div key={comment.id} className="bg-muted p-3 rounded-lg">
                        <div className="flex justify-between items-start mb-2">
                          <div className="text-sm font-medium text-foreground">
                            {getUserName(comment.userId)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatDateTime(comment.createdAt)}
                          </div>
                        </div>
                        <div className="text-sm text-foreground mb-2">
                          {comment.content}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {getPhaseLabel(comment.phase)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground text-center py-4 bg-muted rounded-lg mb-4">
                    Nenhum comentário registrado para esta inclusão.
                  </div>
                )}

                {/* Formulário para adicionar novo comentário */}
                <div className="border-t border-border pt-4">
                  <div className="flex space-x-3">
                    <Textarea 
                      rows={2}
                      placeholder="Adicionar comentário..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      className="flex-1"
                      data-testid="textarea-comment-inline"
                    />
                    <Button 
                      onClick={handleAddComment}
                      disabled={addCommentMutation.isPending || !newComment.trim()}
                      className="flex items-center gap-2"
                      data-testid="button-add-comment-inline"
                    >
                      {addCommentMutation.isPending ? "Enviando..." : "Enviar"}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Botões */}
              <div className="flex gap-3 justify-end pt-4 border-t">
                <Button variant="outline" onClick={() => setShowModal(false)}>
                  Cancelar
                </Button>
                {!isEscalated(selectedInclusion) && (
                  <>
                    <Button 
                      variant="secondary"
                      onClick={handleSave}
                      disabled={updateTeamInclusionMutation.isPending}
                      className="flex items-center gap-2 bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-300"
                    >
                      <Save className="w-4 h-4" />
                      {updateTeamInclusionMutation.isPending ? "Salvando..." : "Salvar"}
                    </Button>
                    <Button 
                      onClick={handleConfirmEscalation}
                      disabled={updateTeamInclusionMutation.isPending}
                      className="flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      {updateTeamInclusionMutation.isPending ? "Confirmando..." : "Confirmar Escalação"}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Comentários */}
      {selectedInclusionForComments && (
        <CommentsModal
          open={showCommentsModal}
          onClose={() => {
            setShowCommentsModal(false);
            setSelectedInclusionForComments(null);
          }}
          teamInclusionId={selectedInclusionForComments}
        />
      )}

    </div>
  );
}