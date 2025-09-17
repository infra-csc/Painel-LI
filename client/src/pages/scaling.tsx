import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import NavigationTabs from "@/components/layout/navigation-tabs";
import WorkflowIndicator from "@/components/layout/workflow-indicator";
import StatusBadge from "@/components/common/status-badge";
import { User, Eye, Save } from "lucide-react";
import UniversalFilters from "@/components/common/universal-filters";
import SortableHeader, { type SortConfig, type SortField } from "@/components/common/sortable-header";
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
import { isReadOnly } from "@/lib/interactions";
import { canView, canEdit } from "@/lib/permissions";

export default function Scaling() {
  const [filters, setFilters] = useState({
    eventId: "all",
    functionId: "all",
    collaboratorId: "all",
    escalationStatus: "all",
    ticketStatus: "all", // all, purchased, not-purchased
    searchId: "",
  });
  
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  
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

  // Handle column sorting
  const handleSort = (field: SortField) => {
    setSortConfig(current => {
      if (current?.field === field) {
        return current.direction === 'asc' 
          ? { field, direction: 'desc' }
          : null; // Remove sorting on third click
      } else {
        return { field, direction: 'asc' };
      }
    });
  };

  const { data: teamInclusions, isLoading } = useQuery<TeamInclusion[]>({
    queryKey: ["/api/team-inclusions"],
  });

  const { data: events } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const { data: functions } = useQuery<Function[]>({
    queryKey: ["/api/functions"],
  });

  // Query para buscar managers de todas as funções
  const { data: allFunctionManagers } = useQuery<{ functionId: string; userId: string }[]>({
    queryKey: ["/api/function-managers"],
    queryFn: async () => {
      if (!functions) return [];
      const managersPromises = functions.map(async (func) => {
        const response = await fetch(`/api/functions/${func.id}/managers`);
        const managers = await response.json();
        return managers.map((manager: any) => ({
          functionId: func.id,
          userId: manager.userId
        }));
      });
      const managersArrays = await Promise.all(managersPromises);
      return managersArrays.flat();
    },
    enabled: !!functions,
  });

  // Filtrar teamInclusions baseado nas permissões de visualização
  const userFunctionIds = allFunctionManagers?.filter(m => m.userId === user?.id).map(m => m.functionId) || [];
  const filteredTeamInclusions = teamInclusions?.filter(ti => {
    // Administradores veem todas as inclusões (verificando diferentes formatos de role)
    if (user?.role === 'administrador' || user?.role === 'admin' || user?.role === 'administrator') return true;
    // Usuários "Logística Interna" (production) também veem todas as inclusões
    if (user?.role === 'production') return true;
    // Outros usuários veem apenas suas funções atribuídas como managers
    return userFunctionIds.includes(ti.functionId);
  }) || [];

  const { data: collaborators } = useQuery<Collaborator[]>({
    queryKey: ["/api/collaborators"],
  });

  const { data: tickets } = useQuery<Ticket[]>({
    queryKey: ["/api/tickets"],
  });

  // Definir selectedTicket no nível do componente
  const selectedTicket = useMemo(() => (
    selectedInclusion && tickets ? tickets.find(t => t.teamInclusionId === selectedInclusion.id) : undefined
  ), [selectedInclusion?.id, tickets]);

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

  // Helper functions for getting names
  const getEventName = (eventId: string | null) => {
    if (!eventId) return "Evento não encontrado";
    return events?.find(e => e.id === eventId)?.name || "Evento não encontrado";
  };

  const getFunctionName = (functionId: string | null) => {
    if (!functionId) return "Função não encontrada";
    return functions?.find(f => f.id === functionId)?.name || "Função não encontrada";
  };

  const getCollaboratorName = (collaboratorId?: string | null) => {
    if (!collaboratorId) return "Não escalado";
    return collaborators?.find(c => c.id === collaboratorId)?.fullName || "Colaborador não encontrado";
  };

  // Check if user can manage function (is responsible for it)
  const canManageFunction = (functionId: string) => {
    if (!user || !allFunctionManagers) return false;
    
    // Check new permission system first
    if (!canEdit(user as any, 'scaling')) return false;
    
    // Admins can manage all functions
    if (user.role === 'administrador' || user.role === 'admin' || user.role === 'administrator') return true;
    
    // Check if user is a manager of this specific function (existing logic)
    return allFunctionManagers.some(manager => manager.functionId === functionId && manager.userId === user.id);
  };

  // Check if user can confirm escalation (only responsible for function)
  const canConfirmEscalation = (inclusion: TeamInclusion) => {
    return canManageFunction(inclusion.functionId);
  };

  // Check if user can access this screen
  if (!canView(user as any, 'scaling')) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-card rounded-lg shadow-sm border border-border p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Acesso Negado</h3>
            <p className="text-muted-foreground">Você não tem permissão para acessar esta tela.</p>
          </div>
        </div>
      </div>
    );
  }

  // Filter and sort inclusions using memoization
  const scalingInclusions = useMemo(() => {
    const filtered = filteredTeamInclusions?.filter(
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
          const isCanceled = inclusion.status === "cancelado";
          if (filters.escalationStatus === "pending" && (escalated || isCanceled)) return false;
          if (filters.escalationStatus === "escalated" && (!escalated || isCanceled)) return false;
          if (filters.escalationStatus === "cancelado" && !isCanceled) return false;
        }

        // Apply ticket status filter
        if (filters.ticketStatus !== "all") {
          const hasTicket = getTicket(inclusion.id) !== undefined;
          if (filters.ticketStatus === "purchased" && !hasTicket) return false;
          if (filters.ticketStatus === "not-purchased" && hasTicket) return false;
        }
        
        return idMatch;
      }
    ) || [];

    // Apply custom sorting if configured
    if (sortConfig) {
      const { field, direction } = sortConfig;
      const multiplier = direction === 'asc' ? 1 : -1;
      
      return filtered.sort((a, b) => {
        switch (field) {
          case 'id':
            const idA = a.inclusionNumber || 0;
            const idB = b.inclusionNumber || 0;
            return (idA - idB) * multiplier;
          case 'event':
            const eventA = getEventName(a.eventId);
            const eventB = getEventName(b.eventId);
            return eventA.localeCompare(eventB, 'pt-BR') * multiplier;
          case 'function':
            const functionA = getFunctionName(a.functionId);
            const functionB = getFunctionName(b.functionId);
            return functionA.localeCompare(functionB, 'pt-BR') * multiplier;
          case 'collaborator':
            const collabA = getCollaboratorName(a.collaboratorId);
            const collabB = getCollaboratorName(b.collaboratorId);
            return collabA.localeCompare(collabB, 'pt-BR') * multiplier;
          case 'period':
            if (!a.scheduleStartDate && !b.scheduleStartDate) return 0;
            if (!a.scheduleStartDate) return 1 * multiplier;
            if (!b.scheduleStartDate) return -1 * multiplier;
            return (new Date(a.scheduleStartDate).getTime() - new Date(b.scheduleStartDate).getTime()) * multiplier;
          default:
            return 0;
        }
      });
    }
    
    // Default sorting: Event → Function → Date
    return filtered.sort((a, b) => {
      const eventA = getEventName(a.eventId);
      const eventB = getEventName(b.eventId);
      const eventComparison = eventA.localeCompare(eventB, 'pt-BR');
      if (eventComparison !== 0) return eventComparison;
      
      const functionA = getFunctionName(a.functionId);
      const functionB = getFunctionName(b.functionId);
      const functionComparison = functionA.localeCompare(functionB, 'pt-BR');
      if (functionComparison !== 0) return functionComparison;
      
      if (!a.scheduleStartDate && !b.scheduleStartDate) return 0;
      if (!a.scheduleStartDate) return 1;
      if (!b.scheduleStartDate) return -1;
      return new Date(a.scheduleStartDate).getTime() - new Date(b.scheduleStartDate).getTime();
    });
  }, [filteredTeamInclusions, filters, sortConfig, events, functions, collaborators]);

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
      observations: inclusion.observations || "", // Preservar observações existentes
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
      observations: inclusion.observations || "", // Preservar observações existentes
      dailyValue: 0,
    });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!selectedInclusion) return;
    if (!canConfirmEscalation(selectedInclusion)) {
      toast({
        title: "Erro",
        description: "Você não tem permissão para salvar alterações nesta função",
        variant: "destructive",
      });
      return;
    }

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
    if (!canConfirmEscalation(selectedInclusion)) {
      toast({
        title: "Erro",
        description: "Você não tem permissão para confirmar escalações nesta função",
        variant: "destructive",
      });
      return;
    }

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


  const getCollaborator = (collaboratorId?: string | null) => {
    if (!collaboratorId) return null;
    return collaborators?.find(c => c.id === collaboratorId) || null;
  };


  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "N/A";
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  };

  // Função específica para formatar datas nas sugestões de viagem
  const formatSuggestionDate = (dateStr: string | null | undefined) => {
    if (!dateStr || dateStr === 'N/A' || dateStr === 'Não definido' || dateStr === 'Não informado') {
      return 'Não informado';
    }
    
    // Se já está no formato DD/MM/YYYY, retorna como está
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
      return dateStr;
    }
    
    // Se está no formato YYYY-MM-DD, converte para DD/MM/YYYY
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(dateStr)) {
      const [year, month, day] = dateStr.split('-');
      return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
    }
    
    // Para outros formatos, tenta extrair números que possam ser datas
    const dateMatch = dateStr.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (dateMatch) {
      const [, year, month, day] = dateMatch;
      return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
    }
    
    // Se não conseguir formatar, retorna o valor original
    return dateStr;
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

  // Função para extrair dados de passagem das observações ou dos campos específicos
  const extractTravelInfoFromObservations = (observations: string | undefined, inclusion?: TeamInclusion) => {
    // Primeiro tenta extrair das observações
    if (observations && observations.trim()) {
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
    }
    
    // Se as observações estão vazias, usa os campos específicos da inclusão
    if (inclusion) {
      return {
        ida: inclusion.flightDepartureSuggestedTime || 'Não informado',
        retorno: 'Não informado', // Campo retorno não existe nos campos específicos
        chegada: 'Não informado', // Campo chegada não existe nos campos específicos  
        horario: inclusion.flightReturnSuggestedTime || 'Não informado'
      };
    }
    
    // Fallback se não tem nem observações nem inclusão
    return { ida: 'Não informado', retorno: 'Não informado', chegada: 'Não informado', horario: 'Não informado' };
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
          
          {/* Filtro específico para status de passagem */}
          <div className="px-6 pb-4">
            <div className="flex items-center gap-4">
              <div className="w-64">
                <label className="block text-sm font-medium text-foreground mb-1">
                  Status da Passagem
                </label>
                <Select 
                  value={filters.ticketStatus} 
                  onValueChange={(value) => setFilters({ ...filters, ticketStatus: value })}
                >
                  <SelectTrigger data-testid="select-ticket-status">
                    <SelectValue placeholder="Selecionar status da passagem" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="purchased">✈️ Passagens Compradas</SelectItem>
                    <SelectItem value="not-purchased">❌ Passagens Não Compradas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

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
            
            // Count pending escalations (excluding canceled ones)
            const withoutTicketPending = withoutTicket.filter(inclusion => !isEscalated(inclusion) && inclusion.status !== "cancelado").length;
            const withTicketPending = withTicket.filter(inclusion => !isEscalated(inclusion) && inclusion.status !== "cancelado").length;
            
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
                            <SortableHeader field="id" sortConfig={sortConfig} onSort={handleSort}>ID</SortableHeader>
                            <SortableHeader field="function" sortConfig={sortConfig} onSort={handleSort}>Função / Evento</SortableHeader>
                            <SortableHeader field="collaborator" sortConfig={sortConfig} onSort={handleSort}>Colaborador</SortableHeader>
                            <SortableHeader field="period" sortConfig={sortConfig} onSort={handleSort}>Período / Diárias</SortableHeader>
                            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Escalação
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-card divide-y divide-border">
                          {withoutTicket.map((inclusion) => (
                            <tr 
                              key={inclusion.id} 
                              className={`hover:bg-accent/30 transition-colors cursor-pointer ${inclusion.status === 'cancelado' ? 'opacity-60' : ''}`}
                              onClick={() => handleRowClick(inclusion)}
                            >
                              <td className="px-3 py-4 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <div className="text-sm font-mono text-foreground">
                                    #{inclusion.inclusionNumber || 'N/A'}
                                  </div>
                                  <div>
                                    <Eye 
                                      className="w-4 h-4 transition-colors text-blue-600 hover:text-blue-800 cursor-pointer"
                                      onClick={(e) => handleViewComments(e, inclusion)}
                                    />
                                  </div>
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
                                <div className="flex flex-col gap-1">
                                  {inclusion.status === "cancelado" ? (
                                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300 text-sm rounded-full">
                                      <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                                      Cancelado
                                    </div>
                                  ) : isEscalated(inclusion) ? (
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
                                  {getTicket(inclusion.id) && (
                                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full">
                                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                      ✈️ Passagem Comprada
                                    </div>
                                  )}
                                </div>
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
                            <SortableHeader field="id" sortConfig={sortConfig} onSort={handleSort}>ID</SortableHeader>
                            <SortableHeader field="function" sortConfig={sortConfig} onSort={handleSort}>Função / Evento</SortableHeader>
                            <SortableHeader field="collaborator" sortConfig={sortConfig} onSort={handleSort}>Colaborador</SortableHeader>
                            <SortableHeader field="period" sortConfig={sortConfig} onSort={handleSort}>Período / Diárias</SortableHeader>
                            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Escalação
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-card divide-y divide-border">
                          {withTicket.map((inclusion) => (
                            <tr 
                              key={inclusion.id} 
                              className={`hover:bg-accent/30 transition-colors cursor-pointer ${inclusion.status === 'cancelado' ? 'opacity-60' : ''}`}
                              onClick={() => handleRowClick(inclusion)}
                            >
                              <td className="px-3 py-4 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <div className="text-sm font-mono text-foreground">
                                    #{inclusion.inclusionNumber || 'N/A'}
                                  </div>
                                  <div>
                                    <Eye 
                                      className="w-4 h-4 transition-colors text-blue-600 hover:text-blue-800 cursor-pointer"
                                      onClick={(e) => handleViewComments(e, inclusion)}
                                    />
                                  </div>
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
                                <div className="flex flex-col gap-1">
                                  {inclusion.status === "cancelado" ? (
                                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300 text-sm rounded-full">
                                      <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                                      Cancelado
                                    </div>
                                  ) : isEscalated(inclusion) ? (
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
                                  {getTicket(inclusion.id) && (
                                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full">
                                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                      ✈️ Passagem Comprada
                                    </div>
                                  )}
                                </div>
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
                {isEscalationConfirmed(selectedInclusion) ? (
                  // Colaborador fixo quando já escalado
                  <div className="mt-2 px-3 py-2 bg-muted rounded-md border">
                    <div className="text-sm font-medium">
                      {getCollaboratorName(modalData.collaboratorId)}
                    </div>
                  </div>
                ) : (
                  // Select normal quando ainda não escalado
                  <Select 
                    value={modalData.collaboratorId} 
                    onValueChange={(value) => setModalData(prev => ({...prev, collaboratorId: value}))}
                    disabled={(() => {
                      if (!selectedInclusion) return true;
                      if (isReadOnly(selectedInclusion)) return true;
                      if (!canConfirmEscalation(selectedInclusion)) return true;
                      return false;
                    })()}
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
                )}
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
              {selectedInclusion?.needsTicket && (
                <section className="space-y-4">
                  {selectedTicket ? (
                    <>
                      {/* Informações Gerais da Compra */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div>
                          <Label className="text-xs text-green-600 dark:text-green-300 font-medium">💰 Valor</Label>
                          <p className="font-bold text-lg text-green-700 dark:text-green-300">{formatCurrency((selectedTicket.value || 0) / 100)}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-green-600 dark:text-green-300 font-medium">📅 Data da Compra</Label>
                          <p className="font-medium">{selectedTicket.purchaseDate ? formatDate(selectedTicket.purchaseDate) : "-"}</p>
                        </div>
                        {selectedTicket.purchaseOrderNumber && (
                          <div>
                            <Label className="text-xs text-green-600 dark:text-green-300 font-medium">📋 Ordem de Compra</Label>
                            <p className="font-medium">{selectedTicket.purchaseOrderNumber}</p>
                          </div>
                        )}
                      </div>

                      {/* Detalhes dos Voos - Agrupados por Trecho */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Trecho de IDA */}
                        <div className="bg-white dark:bg-green-900/30 p-4 rounded-lg border border-green-200 dark:border-green-700">
                          <h4 className="font-medium text-green-700 dark:text-green-300 mb-3 flex items-center gap-2">
                            🛫 IDA
                          </h4>
                          <div className="space-y-2">
                            <div>
                              <Label className="text-xs text-muted-foreground">Origem</Label>
                              <p className="font-medium">{selectedTicket.departureAirport || "-"}</p>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Destino</Label>
                              <p className="font-medium">{selectedTicket.destinationAirport || "-"}</p>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Data</Label>
                              <p className="font-medium text-blue-600 dark:text-blue-400 mb-2">
                                {selectedTicket.actualDepartureDate ? formatDate(selectedTicket.actualDepartureDate) : "-"}
                              </p>
                              <Label className="text-xs text-muted-foreground">Horário</Label>
                              <div className="bg-green-100 dark:bg-green-800 px-3 py-2 rounded-md border-l-4 border-green-500">
                                <span className="text-lg font-bold text-green-800 dark:text-green-100">
                                  {selectedTicket.actualDepartureTime || "--:--"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Trecho de VOLTA */}
                        <div className="bg-white dark:bg-green-900/30 p-4 rounded-lg border border-green-200 dark:border-green-700">
                          <h4 className="font-medium text-green-700 dark:text-green-300 mb-3 flex items-center gap-2">
                            🛬 VOLTA
                          </h4>
                          <div className="space-y-2">
                            <div>
                              <Label className="text-xs text-muted-foreground">Origem</Label>
                              <p className="font-medium">{selectedTicket.destinationAirport || "-"}</p>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Destino</Label>
                              <p className="font-medium">{selectedTicket.departureAirport || "-"}</p>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Data</Label>
                              <p className="font-medium text-blue-600 dark:text-blue-400 mb-2">
                                {selectedTicket.actualReturnDate ? formatDate(selectedTicket.actualReturnDate) : "-"}
                              </p>
                              <Label className="text-xs text-muted-foreground">Horário</Label>
                              <div className="bg-green-100 dark:bg-green-800 px-3 py-2 rounded-md border-l-4 border-green-500">
                                <span className="text-lg font-bold text-green-800 dark:text-green-100">
                                  {selectedTicket.actualReturnTime || "--:--"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Status: Passagem Não Comprada */}
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
                    </>
                  )}

                  {/* Sugestões de Viagem - MENOR DESTAQUE QUANDO PASSAGEM JÁ COMPRADA */}
                  <details className={`border rounded-lg ${selectedTicket ? 'bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-700' : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-700'}`} 
                           open={!selectedTicket}>
                    <summary className={`p-3 cursor-pointer font-medium text-sm ${selectedTicket ? 'text-gray-600 dark:text-gray-400' : 'text-blue-700 dark:text-blue-300'} hover:bg-opacity-80 transition-colors`}>
                      <span className="flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        {selectedTicket ? 'Ver Sugestões Originais (referência)' : 'Sugestões de Viagem'}
                        <span className="text-xs opacity-60">(vindas da inclusão de equipe)</span>
                      </span>
                    </summary>
                    <div className="p-4 pt-2">
                      {(() => {
                        const travelInfo = extractTravelInfoFromObservations(selectedInclusion.observations || undefined, selectedInclusion);
                        return (
                          <div className="space-y-3">
                            {/* Viagem de IDA - Versão Compacta */}
                            <div className={`border rounded-md p-3 ${selectedTicket ? 'bg-gray-100 dark:bg-gray-800/50 border-gray-300' : 'bg-blue-25 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800'}`}>
                              <div className="flex items-center gap-2 mb-2">
                                <svg className="w-3 h-3 text-current" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                </svg>
                                <span className="text-xs font-medium">🛫 IDA</span>
                              </div>
                              <div className="grid grid-cols-2 gap-3 text-xs">
                                <div>
                                  <span className="text-muted-foreground">Data:</span>
                                  <div className="font-medium">{formatSuggestionDate(travelInfo.ida)}</div>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Horário:</span>
                                  <div className="font-medium">{travelInfo.chegada !== 'N/A' && travelInfo.chegada !== 'Não definido' ? travelInfo.chegada : 'Não informado'}</div>
                                </div>
                              </div>
                            </div>

                            {/* Viagem de VOLTA - Versão Compacta */}
                            <div className={`border rounded-md p-3 ${selectedTicket ? 'bg-gray-100 dark:bg-gray-800/50 border-gray-300' : 'bg-blue-25 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800'}`}>
                              <div className="flex items-center gap-2 mb-2">
                                <svg className="w-3 h-3 text-current" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
                                </svg>
                                <span className="text-xs font-medium">🛬 VOLTA</span>
                              </div>
                              <div className="grid grid-cols-2 gap-3 text-xs">
                                <div>
                                  <span className="text-muted-foreground">Data:</span>
                                  <div className="font-medium">{formatSuggestionDate(travelInfo.retorno)}</div>
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
                </section>
              )}

              {/* Seção de Anexos da Passagem */}
              {selectedTicket?.attachmentIds && selectedTicket.attachmentIds.length > 0 && (
                  <div className="border-t pt-4">
                    <h3 className="text-lg font-medium mb-3">Anexos da Passagem</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {selectedTicket.attachmentIds.map((attachmentId, index) => (
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
              )}

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
                      disabled={(() => {
                        if (!selectedInclusion) return true;
                        if (isReadOnly(selectedInclusion)) return true;
                        if (!canConfirmEscalation(selectedInclusion)) return true;
                        if (isEscalated(selectedInclusion)) return true;
                        return false;
                      })()}
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
                      disabled={!selectedInclusion || isReadOnly(selectedInclusion) || !canConfirmEscalation(selectedInclusion)}
                    />
                    <Button 
                      onClick={handleAddComment}
                      disabled={addCommentMutation.isPending || !newComment.trim() || !selectedInclusion || isReadOnly(selectedInclusion)}
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
                {selectedInclusion && !isEscalated(selectedInclusion) && !isReadOnly(selectedInclusion) && (
                  <>
                    <Button 
                      variant="secondary"
                      onClick={handleSave}
                      disabled={(() => {
                        if (!selectedInclusion) return true;
                        if (updateTeamInclusionMutation.isPending) return true;
                        if (selectedInclusion.status === 'cancelado') return true;
                        if (!canConfirmEscalation(selectedInclusion)) return true;
                        return false;
                      })()}
                      className="flex items-center gap-2 bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-300"
                    >
                      <Save className="w-4 h-4" />
                      {updateTeamInclusionMutation.isPending ? "Salvando..." : "Salvar"}
                    </Button>
                    <Button 
                      onClick={handleConfirmEscalation}
                      disabled={(() => {
                        if (!selectedInclusion) return true;
                        if (updateTeamInclusionMutation.isPending) return true;
                        if (selectedInclusion.status === 'cancelado') return true;
                        if (!canConfirmEscalation(selectedInclusion)) return true;
                        return false;
                      })()}
                      className="flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      {updateTeamInclusionMutation.isPending ? "Confirmando..." : "Confirmar Escalação"}
                    </Button>
                  </>
                )}
                
                {/* Mensagem informativa quando usuário não tem permissão */}
                {selectedInclusion && !isEscalated(selectedInclusion) && !isReadOnly(selectedInclusion) && !canConfirmEscalation(selectedInclusion) && (
                  <div className="text-sm text-muted-foreground bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-3 text-center">
                    ⚠️ Apenas o responsável pela função pode confirmar escalações
                  </div>
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