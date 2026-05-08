import { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { formatDiarias, fixEncoding, formatDateRange } from "@/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import StatusBadge from "@/components/common/status-badge";
import { User, Eye, Save, FileSpreadsheet, Download, X, ExternalLink, Clock, Plane, Bus, Check, CalendarDays, Users, MessageSquare, History, ChevronDown, ChevronUp, FileText, Image as ImageIcon, File } from "lucide-react";
import UniversalFilters from "@/components/common/universal-filters";
import SortableHeader, { type SortConfig, type SortField } from "@/components/common/sortable-header";
import CollaboratorCombobox from "@/components/ui/collaborator-combobox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TeamInclusion, Event, Function, Collaborator, Comment, Ticket, Accommodation, TeamInclusionLog } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import CommentsModal from "@/components/modals/comments-modal";
import { isReadOnly } from "@/lib/interactions";
import { canView, canEdit } from "@/lib/permissions";
import * as XLSX from 'xlsx';
import { eachDayOfInterval, parseISO, format, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Scaling() {
  const [filters, setFilters] = useState<{
    eventId: string;
    functionId: string[];
    collaboratorId: string;
    escalationStatus: string;
    ticketStatus: string;
    searchId: string;
    showDeleted: boolean;
  }>({
    eventId: "all",
    functionId: [],
    collaboratorId: "all",
    escalationStatus: "all",
    ticketStatus: "all", // all, purchased, not-purchased
    searchId: "",
    showDeleted: false,
  });
  
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  
  const [selectedInclusion, setSelectedInclusion] = useState<TeamInclusion | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{message:string;inclusionNumber:number|null;eventName:string;collaboratorName:string;functionName:string}|null>(null);
  const pendingScalingAction = useRef<'save'|'confirm'>('save');
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

  // Estado para lightbox de imagens
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);

  // Cache de metadados de anexos { [id]: { name, type, viewUrl, downloadUrl } }
  const [attachmentMeta, setAttachmentMeta] = useState<Record<string, { name?: string; type?: string; viewUrl?: string; downloadUrl?: string }>>({});
  
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
    queryKey: ["/api/team-inclusions", filters.showDeleted],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.showDeleted) {
        params.append('includeDeleted', 'true');
      }
      const response = await fetch(`/api/team-inclusions?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch team inclusions');
      return response.json();
    },
  });

  const { data: events } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const { data: functions } = useQuery<Function[]>({
    queryKey: ["/api/functions"],
  });

  // Query para buscar managers de todas as funções — uma única requisição
  const { data: allFunctionManagers } = useQuery<{ functionId: string; userId: string }[]>({
    queryKey: ["/api/function-managers/all"],
  });

  // Filtrar teamInclusions baseado nas permissões de visualização
  const userFunctionIds = allFunctionManagers?.filter(m => m.userId === user?.id).map(m => m.functionId) || [];
  const filteredTeamInclusions = teamInclusions?.filter(ti => {
    // Ocultar escalações vinculadas a eventos excluídos
    const linkedEvent = events?.find(e => e.id === ti.eventId);
    if (!linkedEvent || linkedEvent.status === 'excluído') return false;
    // Administradores veem todas as inclusões (verificando diferentes formatos de role)
    if (user?.role === 'administrador' || user?.role === 'admin' || user?.role === 'administrator') return true;
    // Usuários "Logística Interna" (production) veem todas as inclusões
    if (user?.role === 'production') return true;
    // Usuários "Área De Função" (function_area) veem todas as inclusões
    if (user?.role === 'function_area') return true;
    // Usuários "Compras" (purchasing) veem todas as inclusões
    if (user?.role === 'purchasing') return true;
    // Usuários "RH/Financeiro" (financial) veem todas as inclusões
    if (user?.role === 'financial') return true;
    // Outros usuários veem apenas suas funções atribuídas como managers
    return userFunctionIds.includes(ti.functionId);
  }) || [];

  const { data: collaborators } = useQuery<Collaborator[]>({
    queryKey: ["/api/collaborators"],
  });

  const { data: accommodations } = useQuery<Accommodation[]>({
    queryKey: ["/api/accommodations"],
  });


  const { data: tickets } = useQuery<Ticket[]>({
    queryKey: ["/api/tickets"],
  });

  // Query lazy — só busca quando o usuário clica em Exportar
  const { data: allComments, refetch: refetchAllComments } = useQuery<Comment[]>({
    queryKey: ["/api/all-comments"],
    queryFn: async () => {
      const response = await fetch('/api/all-comments');
      if (!response.ok) return [];
      return response.json();
    },
    enabled: false,
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

  // Query para buscar histórico de logs da inclusão selecionada
  const { data: inclusionLogs } = useQuery<TeamInclusionLog[]>({
    queryKey: ["/api/team-inclusions", selectedInclusion?.id, "logs"],
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
      inclusion.status === "escalado" || 
      inclusion.status === "passagem" || 
      inclusion.status === "passagem_comprada" ||
      inclusion.status === "hospedagem" || 
      inclusion.status === "hospedagem_comprada" ||
      inclusion.status === "aprovado" ||
      inclusion.status === "concluido"
    );
  };

  // Helper function to determine if escalation is confirmed (após confirmar escalação)
  const isEscalationConfirmed = (inclusion: TeamInclusion) => {
    return inclusion.collaboratorId && (
      inclusion.status === "escalado" ||
      inclusion.status === "passagem" || 
      inclusion.status === "passagem_comprada" ||
      inclusion.status === "hospedagem" || 
      inclusion.status === "hospedagem_comprada" ||
      inclusion.status === "aprovado" ||
      inclusion.status === "concluido"
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
    return fixEncoding(collaborators?.find(c => c.id === collaboratorId)?.fullName) || "Colaborador não encontrado";
  };

  // Helper function to get accommodation for an inclusion
  const getAccommodation = (inclusionId: string) => {
    return accommodations?.find(a => a.teamInclusionId === inclusionId);
  };

  // Helper function to format accommodation data
  const formatAccommodationInfo = (accommodation: Accommodation | undefined) => {
    if (!accommodation) return null;
    
    const checkinDate = accommodation.checkInDate ? new Date(accommodation.checkInDate).toLocaleDateString('pt-BR') : '';
    const checkoutDate = accommodation.checkOutDate ? new Date(accommodation.checkOutDate).toLocaleDateString('pt-BR') : '';
    const dates = checkinDate && checkoutDate ? `${checkinDate} - ${checkoutDate}` : '';
    
    return {
      hotel: accommodation.hotelName || 'Hotel não informado',
      location: accommodation.hotelLocation || '',
      dates,
      hasAttachments: accommodation.attachmentIds && accommodation.attachmentIds.length > 0
    };
  };

  // Check if user can manage function (is responsible for it)
  const canManageFunction = (functionId: string) => {
    if (!user) return false;
    
    // Admins and purchasing can manage all functions
    if (user.role === 'administrador' || user.role === 'admin' || user.role === 'administrator' || user.role === 'purchasing') return true;
    
    // Check if user is a manager of this specific function
    return allFunctionManagers?.some(manager => manager.functionId === functionId && manager.userId === user.id) ?? false;
  };

  // Check if user can confirm escalation (only responsible for function)
  const canConfirmEscalation = (inclusion: TeamInclusion) => {
    return canManageFunction(inclusion.functionId);
  };

  // Check if user can edit collaborator (admin or function_area, only until ticket/accommodation is purchased)
  // Regras:
  // - Se needsTicket = true (com ou sem hospedagem) → bloqueia após passagem comprada
  // - Se needsTicket = false E needsAccommodation = true → bloqueia após hospedagem comprada
  // - Se não precisa de nenhum → sempre pode editar
  const canEditCollaborator = (inclusion: TeamInclusion) => {
    if (!user) return false;
    
    // Check if user is admin, purchasing, function_area or manages the function
    const hasRole = user.role === 'admin' || user.role === 'administrator' || user.role === 'administrador' || user.role === 'function_area' || user.role === 'purchasing';
    const isManager = canManageFunction(inclusion.functionId);
    if (!hasRole && !isManager) return false;
    
    // BLOQUEIA SE HÁ COMPRA EFETIVA (passagem OU hospedagem):
    const ticketPurchased = inclusion.needsTicket
      ? tickets?.some(t => t.teamInclusionId === inclusion.id && t.purchaseDate !== null)
      : false;

    const accommodationReserved = inclusion.needsAccommodation
      ? accommodations?.some(a => a.teamInclusionId === inclusion.id)
      : false;

    if (ticketPurchased || accommodationReserved) return false;

    return true;
  };

  // Check if user can access this screen
  if (!canView(user, 'scaling')) {
    return (
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Acesso Negado</h3>
        <p className="text-muted-foreground">Você não tem permissão para acessar esta tela.</p>
      </div>
    );
  }

  // Filter and sort inclusions using memoization
  const scalingInclusions = useMemo(() => {
    const filtered = filteredTeamInclusions?.filter(
      inclusion => {
        // Busca por ID, nome de colaborador ou função
        const q = filters.searchId.replace(/#/g, '').trim().toLowerCase();
        const collaboratorName = inclusion.collaboratorId ? getCollaboratorName(inclusion.collaboratorId).toLowerCase() : '';
        const functionName = getFunctionName(inclusion.functionId).toLowerCase();
        const idMatch = !filters.searchId || (
          String(inclusion.inclusionNumber ?? '').toLowerCase().includes(q) ||
          collaboratorName.includes(q) ||
          functionName.includes(q)
        );
        
        // Apply universal filters
        if (filters.eventId !== "all" && inclusion.eventId !== filters.eventId) return false;
        if (filters.functionId.length > 0 && !filters.functionId.includes(inclusion.functionId)) return false;
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
    onSuccess: (updatedInclusion) => {
      // CRITICAL: Update selectedInclusion with fresh data from backend
      if (selectedInclusion && updatedInclusion.id === selectedInclusion.id) {
        setSelectedInclusion(updatedInclusion);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
      queryClient.refetchQueries({ queryKey: ["/api/team-inclusions"] });
      // Show success modal instead of toast
      const msg = pendingScalingAction.current === 'confirm' ? "Escalação confirmada com sucesso!" : "Alterações salvas com sucesso!";
      const inc = selectedInclusion;
      setSuccessInfo({
        message: msg,
        inclusionNumber: inc?.inclusionNumber ?? null,
        eventName: events?.find(e => e.id === inc?.eventId)?.name ?? "—",
        collaboratorName: inc?.collaboratorId ? getCollaboratorName(inc.collaboratorId) : "—",
        functionName: inc?.functionId ? getFunctionName(inc.functionId) : "—",
      });
      setShowModal(false);
      setShowSuccessModal(true);
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

  const handleExportToExcel = async () => {
    if (!scalingInclusions || scalingInclusions.length === 0) {
      toast({
        title: "Erro",
        description: "Não há escalações para exportar",
        variant: "destructive",
      });
      return;
    }

    const activeInclusions = scalingInclusions.filter(inclusion => 
      inclusion.status !== "cancelado" && !inclusion.deletedAt
    );

    if (activeInclusions.length === 0) {
      toast({
        title: "Erro",
        description: "Não há escalações ativas para exportar",
        variant: "destructive",
      });
      return;
    }

    // Buscar comentários sob demanda (lazy) só agora que o usuário clicou em exportar
    const { data: freshComments } = await refetchAllComments();

    const exportData = activeInclusions.map(inclusion => {
      const event = events?.find(e => e.id === inclusion.eventId);
      const func = functions?.find(f => f.id === inclusion.functionId);
      const collaborator = collaborators?.find(c => c.id === inclusion.collaboratorId);
      
      const confirmationStatus = inclusion.status === "cancelado" 
        ? "Cancelado" 
        : isEscalated(inclusion) 
        ? "Confirmado" 
        : "Pendente";

      // Calcular valor total (valor da diária em centavos / 100 * quantidade)
      const dailyValueInReais = (inclusion.dailyValue || 0) / 100;
      const totalValue = dailyValueInReais * (inclusion.dailyRates || 0);

      // Buscar comentários desta inclusão
      const inclusionComments = freshComments?.filter(c => c.teamInclusionId === inclusion.id) || [];
      const commentsText = inclusionComments.length > 0
        ? inclusionComments.map(c => {
            const commentUser = users?.find(u => u.id === c.userId);
            const userName = commentUser?.name || 'Usuário';
            const date = c.createdAt ? new Date(c.createdAt).toLocaleDateString('pt-BR') : '';
            return `[${date} - ${userName}] ${c.content}`;
          }).join(' | ')
        : 'N/A';

      // Extrair informações de viagem do campo observações (dados antigos)
      let dataVooIda = inclusion.flightDepartureDate ? formatDate(inclusion.flightDepartureDate) : 'N/A';
      let horarioSugeridoIda = inclusion.flightArrivalSuggestedTime || 'N/A';
      let dataVooVolta = inclusion.flightReturnDate ? formatDate(inclusion.flightReturnDate) : 'N/A';
      let horarioSugeridoVolta = inclusion.flightReturnSuggestedTime || 'N/A';
      let observacoesLimpas = inclusion.observations || '';

      // Se as observações contêm dados de viagem no formato antigo, extrair
      if (observacoesLimpas && observacoesLimpas.includes('Ida:') && observacoesLimpas.includes('Chegada:')) {
        const idaMatch = observacoesLimpas.match(/Ida:\s*([^|]+)/);
        const chegadaMatch = observacoesLimpas.match(/Chegada:\s*([^|]+)/);
        const retornoMatch = observacoesLimpas.match(/Retorno:\s*([^|]+)/);
        const horarioMatch = observacoesLimpas.match(/Horário:\s*([^|]+)/);

        if (idaMatch && idaMatch[1].trim()) {
          dataVooIda = idaMatch[1].trim();
        }
        if (chegadaMatch && chegadaMatch[1].trim()) {
          horarioSugeridoIda = chegadaMatch[1].trim();
        }
        if (retornoMatch && retornoMatch[1].trim()) {
          dataVooVolta = retornoMatch[1].trim();
        }
        if (horarioMatch && horarioMatch[1].trim()) {
          horarioSugeridoVolta = horarioMatch[1].trim();
        }

        // Limpar as observações (remover dados de viagem)
        observacoesLimpas = '';
      }

      // Extrair apenas CPF do colaborador
      let cpfColaborador = 'N/A';
      if (collaborator) {
        if (collaborator.documentType === 'cpf') {
          cpfColaborador = collaborator.officialDocument;
        } else if (collaborator.secondaryDocumentType === 'cpf') {
          cpfColaborador = collaborator.secondaryDocument || 'N/A';
        }
      }

      return {
        'ID': `#${inclusion.inclusionNumber || 'N/A'}`,
        'Evento': event?.name || 'N/A',
        'Local do Evento': event?.location || 'N/A',
        'Início do Evento': event?.startDate ? formatDate(event.startDate) : 'N/A',
        'Fim do Evento': event?.endDate ? formatDate(event.endDate) : 'N/A',
        'Função': func?.name || 'N/A',
        'Área': inclusion.area || 'N/A',
        'Colaborador': fixEncoding(collaborator?.fullName) || 'Não escalado',
        'CPF Colaborador': cpfColaborador,
        'Data Nascimento': collaborator?.birthDate ? formatDate(collaborator.birthDate) : 'N/A',
        'Telefone Colaborador': collaborator?.phone || 'N/A',
        'Cidade Colaborador': collaborator?.city || 'N/A',
        'Período Agendado - Início': inclusion.scheduleStartDate ? formatDate(inclusion.scheduleStartDate) : 'N/A',
        'Período Agendado - Fim': inclusion.scheduleEndDate ? formatDate(inclusion.scheduleEndDate) : 'N/A',
        'Período Real - Início': inclusion.actualStartDate ? formatDate(inclusion.actualStartDate) : 'N/A',
        'Período Real - Fim': inclusion.actualEndDate ? formatDate(inclusion.actualEndDate) : 'N/A',
        'Precisa Passagem': inclusion.needsTicket ? 'Sim' : 'Não',
        'Data Voo Ida': dataVooIda,
        'Horário Sugerido Ida': horarioSugeridoIda,
        'Data Voo Volta': dataVooVolta,
        'Horário Sugerido Volta': horarioSugeridoVolta,
        'Precisa Hospedagem': inclusion.needsAccommodation ? 'Sim' : 'Não',
        'Diárias Planejadas': inclusion.dailyRates ?? 0,
        'Diárias Reais': inclusion.actualDailyRates ?? 'N/A',
        'Valor da Diária (R$)': dailyValueInReais.toFixed(2),
        'Valor Total (R$)': totalValue.toFixed(2),
        'Status': confirmationStatus,
        'Fase Atual': inclusion.phase || 'N/A',
        'Registro Emergencial': inclusion.emergencyRecord ? 'Sim' : 'Não',
        'Observações': observacoesLimpas,
        'Observações Reais': inclusion.actualObservations || '',
        'Comentários': commentsText
      };
    });

    // Criar workbook e worksheet
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Ajustar largura das colunas para melhor visualização
    const colWidths = [
      { wch: 10 },  // ID
      { wch: 30 },  // Evento
      { wch: 25 },  // Local do Evento
      { wch: 15 },  // Início do Evento
      { wch: 15 },  // Fim do Evento
      { wch: 25 },  // Função
      { wch: 20 },  // Área
      { wch: 30 },  // Colaborador
      { wch: 18 },  // Documento
      { wch: 15 },  // Data Nascimento
      { wch: 15 },  // Telefone
      { wch: 20 },  // Cidade
      { wch: 18 },  // Período Agendado - Início
      { wch: 18 },  // Período Agendado - Fim
      { wch: 18 },  // Período Real - Início
      { wch: 18 },  // Período Real - Fim
      { wch: 15 },  // Precisa Passagem
      { wch: 15 },  // Data Voo Ida
      { wch: 18 },  // Horário Sugerido Ida
      { wch: 15 },  // Data Voo Volta
      { wch: 18 },  // Horário Sugerido Volta
      { wch: 18 },  // Precisa Hospedagem
      { wch: 18 },  // Diárias Planejadas
      { wch: 15 },  // Diárias Reais
      { wch: 18 },  // Valor da Diária
      { wch: 18 },  // Valor Total
      { wch: 15 },  // Status
      { wch: 15 },  // Fase Atual
      { wch: 20 },  // Registro Emergencial
      { wch: 40 },  // Observações
      { wch: 40 },  // Observações Reais
      { wch: 60 }   // Comentários
    ];
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Escalações');

    // Gerar nome do arquivo com data atual
    const today = new Date();
    const dateStr = `${today.getDate().toString().padStart(2, '0')}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getFullYear()}`;
    const fileName = `Escalacoes_${dateStr}.xlsx`;

    // Baixar arquivo
    XLSX.writeFile(wb, fileName);

    toast({
      title: "Sucesso",
      description: `Arquivo ${fileName} exportado com ${exportData.length} escalações ativas!`,
    });
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
      // CRÍTICO: Preservar campos de necessidade de passagem/hospedagem
      needsTicket: selectedInclusion.needsTicket,
      needsAccommodation: selectedInclusion.needsAccommodation,
    };
    
    // Só incluir dailyValue se foi especificamente editado
    if (modalData.dailyValue && modalData.dailyValue > 0) {
      updateData.dailyValue = Math.round(modalData.dailyValue * 100); // Store in cents
    }
    
    pendingScalingAction.current = 'save';
    updateTeamInclusionMutation.mutate({
      id: selectedInclusion.id,
      data: updateData
    });
  };

  const handleConfirmEscalation = () => {
    if (!selectedInclusion) return;
    
    console.log("🔍 [CONFIRM DEBUG] Starting confirmation process");
    console.log("🔍 [CONFIRM DEBUG] selectedInclusion:", {
      id: selectedInclusion.id,
      status: selectedInclusion.status,
      needsTicket: selectedInclusion.needsTicket,
      needsAccommodation: selectedInclusion.needsAccommodation,
      collaboratorId: selectedInclusion.collaboratorId
    });
    console.log("🔍 [CONFIRM DEBUG] modalData.collaboratorId:", modalData.collaboratorId);
    
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

    // Na tela de Escalação, confirmar SEMPRE muda para "escalado"
    // As outras telas (Passagens/Hospedagem) controlam seus próprios workflows
    const nextStatus = "escalado";
    const nextPhase = "escalacao";

    console.log("🔍 [CONFIRM DEBUG] Calculated next status:", nextStatus);
    console.log("🔍 [CONFIRM DEBUG] Calculated next phase:", nextPhase);

    const updateData: any = {
      collaboratorId: modalData.collaboratorId,
      observations: modalData.observations,
      status: nextStatus,
      phase: nextPhase,
      // CRÍTICO: Preservar campos de necessidade de passagem/hospedagem
      needsTicket: selectedInclusion.needsTicket,
      needsAccommodation: selectedInclusion.needsAccommodation,
      _userId: user?.id // Add userId for backend authentication
    };
    
    // Só incluir dailyValue se foi especificamente editado
    if (modalData.dailyValue && modalData.dailyValue > 0) {
      updateData.dailyValue = Math.round(modalData.dailyValue * 100); // Store in cents
    }
    
    console.log("🔍 [CONFIRM DEBUG] Update data being sent:", updateData);
    
    pendingScalingAction.current = 'confirm';
    updateTeamInclusionMutation.mutate({
      id: selectedInclusion.id,
      data: updateData
    });
  };


  const getCollaborator = (collaboratorId?: string | null) => {
    if (!collaboratorId) return null;
    return collaborators?.find(c => c.id === collaboratorId) || null;
  };


  // Formata data com dia da semana
  const formatDateWithWeekday = (dateStr: string | null | undefined) => {
    if (!dateStr) return "N/A";
    try {
      const date = new Date(dateStr + 'T00:00:00'); // Adiciona hora para evitar problemas de timezone
      return new Intl.DateTimeFormat("pt-BR", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(date);
    } catch {
      return dateStr;
    }
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "N/A";
    // Remove timestamp se houver (ex: "2025-11-06T00:00:00.000Z" -> "2025-11-06")
    const cleanDate = dateStr.split('T')[0];
    const [year, month, day] = cleanDate.split('-');
    return `${day}/${month}/${year}`;
  };

  // Função para obter o período de trabalho baseado nas datas de agendamento
  const getWorkPeriod = (inclusion: TeamInclusion) => {
    return {
      start: formatDate(inclusion.scheduleStartDate),
      end: formatDate(inclusion.scheduleEndDate)
    };
  };

  // Função específica para formatar datas nas sugestões de viagem com dia da semana
  const formatSuggestionDate = (dateStr: string | null | undefined) => {
    if (!dateStr || dateStr === 'N/A' || dateStr === 'Não definido' || dateStr === 'Não informado') {
      return 'Não informado';
    }
    
    // Se está no formato YYYY-MM-DD, converte com dia da semana
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(dateStr)) {
      return formatDateWithWeekday(dateStr);
    }
    
    // Se já está no formato DD/MM/YYYY, tenta converter para incluir dia da semana
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
      const [day, month, year] = dateStr.split('/');
      const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      return formatDateWithWeekday(isoDate);
    }
    
    // Para outros formatos, tenta extrair números que possam ser datas
    const dateMatch = dateStr.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (dateMatch) {
      const [, year, month, day] = dateMatch;
      const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      return formatDateWithWeekday(isoDate);
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

  // Função para extrair dados de passagem dos campos específicos (prioridade) ou das observações (legado)
  const extractTravelInfoFromObservations = (observations: string | undefined, inclusion?: TeamInclusion) => {
    // PRIORIDADE: Usar campos específicos da inclusão (novos dados)
    if (inclusion && (inclusion.flightDepartureDate || inclusion.flightArrivalSuggestedTime || 
        inclusion.flightReturnDate || inclusion.flightReturnSuggestedTime)) {
      return {
        ida: inclusion.flightDepartureDate || 'Não informado',
        retorno: inclusion.flightReturnDate || 'Não informado',
        chegada: inclusion.flightArrivalSuggestedTime || 'Não informado',
        horario: inclusion.flightReturnSuggestedTime || 'Não informado'
      };
    }
    
    // FALLBACK: Tentar extrair das observações (compatibilidade com dados antigos)
    if (observations && observations.trim()) {
      const idaMatch = observations.match(/Ida:\s*([^|]*?)(?:\s*\||\s*$)/);
      const retornoMatch = observations.match(/Retorno:\s*([^|]*?)(?:\s*\||\s*$)/);
      const chegadaMatch = observations.match(/Chegada:\s*([^|]*?)(?:\s*\||\s*$)/);
      const horarioMatch = observations.match(/Horário:\s*([^|]*?)(?:\s*\||\s*$)/);
      
      if (idaMatch || retornoMatch || chegadaMatch || horarioMatch) {
        return {
          ida: (idaMatch && idaMatch[1].trim()) ? idaMatch[1].trim() : 'Não definido',
          retorno: (retornoMatch && retornoMatch[1].trim()) ? retornoMatch[1].trim() : 'Não definido', 
          chegada: (chegadaMatch && chegadaMatch[1].trim()) ? chegadaMatch[1].trim() : 'Não definido',
          horario: (horarioMatch && horarioMatch[1].trim()) ? horarioMatch[1].trim() : 'Não definido'
        };
      }
    }
    
    // Se não tem nenhum dado
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
      case "hospedagem":
        return "Hospedagem";
      case "aprovado":
        return "Aprovado";
      default:
        return phase;
    }
  };

  // Pre-fetch metadata for all attachment IDs when modal opens
  useEffect(() => {
    if (!showModal || !selectedInclusion) return;
    const acc = accommodations?.find(a => a.teamInclusionId === selectedInclusion.id);
    const ticket = tickets?.find(t => t.teamInclusionId === selectedInclusion.id && t.purchaseDate !== null);
    const ids = [
      ...(acc?.attachmentIds || []),
      ...(ticket?.attachmentIds || []),
    ].filter(id => !attachmentMeta[id]);
    ids.forEach(async (id) => {
      try {
        const res = await fetch(`/api/attachments/${id}`);
        if (res.ok) {
          const data = await res.json();
          setAttachmentMeta(prev => ({ ...prev, [id]: data }));
        }
      } catch (_) {}
    });
  }, [showModal, selectedInclusion]);

  // Detecta tipo de arquivo pelo nome/mimetype e retorna badge info
  const getFileBadge = (name?: string, type?: string) => {
    const n = (name || '').toLowerCase();
    if (n.match(/\.(jpe?g|png|gif|webp|bmp|svg)$/) || (type || '').includes('image')) {
      const ext = (name?.split('.').pop() || 'IMG').toUpperCase();
      return { ext, cls: 'bg-blue-100 text-blue-600' };
    }
    if (n.match(/\.pdf$/) || (type || '').includes('pdf')) {
      return { ext: 'PDF', cls: 'bg-red-100 text-red-600' };
    }
    if (n.match(/\.(xlsx?|csv|ods)$/) || (type || '').includes('spreadsheet') || (type || '').includes('excel') || (type || '').includes('csv')) {
      const ext = (name?.split('.').pop() || 'XLS').toUpperCase();
      return { ext, cls: 'bg-green-100 text-green-600' };
    }
    const ext = (name?.split('.').pop() || 'ARQ').toUpperCase();
    return { ext, cls: 'bg-slate-100 text-slate-600' };
  };

  const isImageFile = (name?: string, type?: string) => {
    return (name || '').toLowerCase().match(/\.(jpe?g|png|gif|webp|bmp)$/) || (type || '').includes('image/');
  };

  const isPdfFile = (name?: string, type?: string) => {
    return (name || '').toLowerCase().endsWith('.pdf') || (type || '').includes('pdf');
  };

  // Abre anexo: lightbox para imagens, nova aba para PDFs, Google Docs Viewer para outros
  const openAttachment = async (attachmentId: string, fallbackLabel: string) => {
    try {
      let data = attachmentMeta[attachmentId];
      if (!data) {
        const res = await fetch(`/api/attachments/${attachmentId}`);
        if (!res.ok) throw new Error('Erro ao buscar anexo');
        data = await res.json();
        setAttachmentMeta(prev => ({ ...prev, [attachmentId]: data! }));
      }
      const url = data?.viewUrl;
      if (!url || url === '#') {
        toast({ title: 'Anexo não disponível', description: 'O arquivo ainda não possui URL de visualização.', variant: 'destructive' });
        return;
      }
      if (isImageFile(data?.name, data?.type)) {
        setShowModal(false);
        setLightbox({ url, name: data?.name || fallbackLabel });
      } else if (isPdfFile(data?.name, data?.type)) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        const viewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
        window.open(viewerUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      toast({ title: 'Erro', description: `Não foi possível abrir o anexo: ${err instanceof Error ? err.message : 'Erro desconhecido'}`, variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="bg-card rounded-lg shadow-sm border border-border p-6 animate-pulse">
        <div className="h-8 bg-muted rounded mb-4 w-1/3"></div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-12 bg-muted rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-5">
        <div className="w-14 h-14 bg-[#0033CC] rounded-3xl flex items-center justify-center text-white shadow-xl shadow-blue-900/20 shrink-0">
          <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>conveyor_belt</span>
        </div>
        <div>
          <h2 className="text-[28px] font-bold tracking-tight text-slate-900 leading-tight">Escalação - Visualização</h2>
          <p className="text-sm text-slate-500 font-medium mt-0.5">Lista de escalações com informações detalhadas</p>
        </div>
      </div>

      <UniversalFilters
        filters={filters}
        onFiltersChange={setFilters}
        hideStatusFilter={true}
        rightActions={
          <Button
            onClick={handleExportToExcel}
            variant="outline"
            className="flex items-center gap-2 border border-green-200 text-green-600 bg-green-50 hover:bg-green-100 rounded-xl px-3 h-10 text-sm font-medium transition-colors whitespace-nowrap"
            data-testid="button-export-excel"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Exportar
          </Button>
        }
      >
        <div className="w-56">
          <label className="block text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-1">
            Status da Passagem
          </label>
          <Select
            value={filters.ticketStatus}
            onValueChange={(value) => setFilters({ ...filters, ticketStatus: value })}
          >
            <SelectTrigger className="!h-9 py-0 border border-slate-200 rounded-lg bg-white text-sm text-slate-700 [&>span]:text-slate-700 [&>span]:font-normal focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-all" data-testid="select-ticket-status">
              <SelectValue placeholder="Status da passagem" />
            </SelectTrigger>
            <SelectContent className="bg-white border border-slate-200 rounded-xl shadow-lg min-w-[220px]">
              <SelectItem value="all" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Todos</SelectItem>
              <SelectItem value="purchased" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">✈️ Passagens Compradas</SelectItem>
              <SelectItem value="not-purchased" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">❌ Passagens Não Compradas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </UniversalFilters>


          {scalingInclusions.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <Users className="w-7 h-7 text-slate-300" />
              </div>
              <h3 className="text-[15px] font-bold text-slate-600 mb-1">
                Nenhuma escalação encontrada
              </h3>
              <p className="text-[13px] text-slate-400">
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
                <TabsList className="grid grid-cols-2 gap-4 h-auto bg-transparent p-0 w-full mb-2">
                  {/* Card: Sem Passagem */}
                  <TabsTrigger
                    value="without-ticket"
                    disabled={withoutTicket.length === 0}
                    className="group relative overflow-hidden rounded-3xl border-2 border-slate-200 bg-white shadow-sm hover:shadow-md data-[state=active]:border-[#F97316] data-[state=active]:bg-orange-50/40 data-[state=active]:shadow-lg data-[state=active]:shadow-orange-900/10 transition-all duration-200 disabled:opacity-40 text-left p-0 h-auto"
                  >
                    {/* Faixa superior laranja */}
                    <div className="absolute top-0 inset-x-0 h-1.5 bg-[#F97316] rounded-t-[22px]" />
                    {/* Checkmark no canto superior direito */}
                    <span className="absolute top-2.5 right-3 w-5 h-5 rounded-full bg-[#F97316] items-center justify-center shadow-md hidden group-data-[state=active]:flex">
                      <Check className="w-3 h-3 text-white" strokeWidth={3} />
                    </span>
                    <div className="flex items-center gap-3 px-4 pt-6 pb-4">
                      {/* Ícone em círculo */}
                      <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                        <Clock className="w-5 h-5 text-[#F97316]" />
                      </div>
                      {/* Textos */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="text-base font-bold text-slate-900 leading-tight">Sem Passagem</h3>
                          <span className="px-1.5 py-0.5 rounded-full bg-orange-100 text-[#F97316] text-[11px] font-black leading-none">
                            {withoutTicket.length}
                          </span>
                        </div>
                        <p className="text-[11px] font-semibold mt-0.5 text-orange-400">
                          {withoutTicketPending > 0 && filters.escalationStatus !== "pending"
                            ? `${withoutTicketPending} pendente${withoutTicketPending !== 1 ? 's' : ''} de escalação`
                            : <span className="text-slate-300">Nenhum pendente</span>}
                        </p>
                      </div>
                    </div>
                  </TabsTrigger>

                  {/* Card: Com Passagem */}
                  <TabsTrigger
                    value="with-ticket"
                    disabled={withTicket.length === 0}
                    className="group relative overflow-hidden rounded-3xl border-2 border-slate-200 bg-white shadow-sm hover:shadow-md data-[state=active]:border-[#22C55E] data-[state=active]:bg-green-50/40 data-[state=active]:shadow-lg data-[state=active]:shadow-green-900/10 transition-all duration-200 disabled:opacity-40 text-left p-0 h-auto"
                  >
                    {/* Faixa superior verde */}
                    <div className="absolute top-0 inset-x-0 h-1.5 bg-[#22C55E] rounded-t-[22px]" />
                    {/* Checkmark no canto superior direito */}
                    <span className="absolute top-2.5 right-3 w-5 h-5 rounded-full bg-[#22C55E] items-center justify-center shadow-md hidden group-data-[state=active]:flex">
                      <Check className="w-3 h-3 text-white" strokeWidth={3} />
                    </span>
                    <div className="flex items-center gap-3 px-4 pt-6 pb-4">
                      {/* Ícones dos 3 tipos de transporte */}
                      <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                        <div className="flex flex-col items-center justify-center gap-0" style={{lineHeight: 1}}>
                          <span className="text-[10px] leading-none">✈️</span>
                          <span className="flex gap-0.5 mt-0.5">
                            <span className="text-[9px] leading-none">🚌</span>
                            <span className="text-[9px] leading-none">🚐</span>
                          </span>
                        </div>
                      </div>
                      {/* Textos */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="text-base font-bold text-slate-900 leading-tight">Com Transporte</h3>
                          <span className="px-1.5 py-0.5 rounded-full bg-green-100 text-[#22C55E] text-[11px] font-black leading-none">
                            {withTicket.length}
                          </span>
                        </div>
                        <p className="text-[10px] font-medium text-slate-400 mt-0.5 mb-0.5">Aéreo · Rodoviário · Van</p>
                        <p className="text-[11px] font-semibold text-green-400">
                          {withTicketPending > 0 && filters.escalationStatus !== "pending"
                            ? `${withTicketPending} pendente${withTicketPending !== 1 ? 's' : ''} de escalação`
                            : <span className="text-slate-300">Todos escalados</span>}
                        </p>
                      </div>
                    </div>
                  </TabsTrigger>
                </TabsList>

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
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mt-4">
                      <div className="overflow-x-auto">
                        <table className="table-fixed w-full">
                          <colgroup>
                            <col style={{width: "100px"}} />
                            <col style={{width: "28%"}} />
                            <col style={{width: "22%"}} />
                            <col style={{width: "150px"}} />
                            <col style={{width: "220px"}} />
                          </colgroup>
                          <thead style={{ background: "#F8FAFC", borderBottom: "2px solid #E2E8F0" }}>
                            <tr>
                              <SortableHeader field="id" sortConfig={sortConfig} onSort={handleSort}>ID</SortableHeader>
                              <SortableHeader field="function" sortConfig={sortConfig} onSort={handleSort}>Função / Evento</SortableHeader>
                              <SortableHeader field="collaborator" sortConfig={sortConfig} onSort={handleSort}>Colaborador</SortableHeader>
                              <SortableHeader field="period" className="whitespace-nowrap" sortConfig={sortConfig} onSort={handleSort}>Período / Diárias</SortableHeader>
                              <th className="w-[220px] min-w-[220px] px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">
                                Status
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {withoutTicket.map((inclusion, rowIdx) => (
                              <tr
                                key={inclusion.id}
                                className={`transition-colors cursor-pointer ${rowIdx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'} hover:bg-blue-50/30 ${inclusion.status === 'cancelado' ? 'opacity-50' : ''}`}
                                onClick={() => handleRowClick(inclusion)}
                              >
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-[#0033CC] bg-blue-50 px-2 py-1 rounded-lg">
                                      #{inclusion.inclusionNumber || 'N/A'}
                                    </span>
                                    <Eye
                                      className="w-4 h-4 text-slate-300 hover:text-blue-500 transition-colors cursor-pointer"
                                      onClick={(e) => handleViewComments(e, inclusion)}
                                    />
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="text-[14px] font-semibold text-[#111827] leading-tight">
                                    {getFunctionName(inclusion.functionId)}
                                  </div>
                                  <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#1D4ED8] text-[11px] font-semibold">
                                    <CalendarDays className="w-3 h-3 shrink-0" />
                                    <span className="break-words">{getEventName(inclusion.eventId)}</span>
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  {inclusion.collaboratorId ? (() => {
                                    const name = getCollaboratorName(inclusion.collaboratorId);
                                    const parts = name.trim().split(/\s+/);
                                    const ini = parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
                                    return (
                                      <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-lg bg-[#0033CC] text-white flex items-center justify-center text-[10px] font-black shrink-0">{ini}</div>
                                        <span className="text-[13px] font-normal text-[#374151]">{name}</span>
                                      </div>
                                    );
                                  })() : (
                                    <div className="flex items-center gap-2.5">
                                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0">N/E</div>
                                      <span className="text-sm italic text-slate-400">Não escalado</span>
                                    </div>
                                  )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm font-semibold text-slate-800 whitespace-nowrap">
                                    {formatDateRange(inclusion.scheduleStartDate, inclusion.scheduleEndDate)}
                                  </div>
                                  <div className="text-[11px] text-slate-400">
                                    {formatDiarias(inclusion.dailyRates)}
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex flex-row flex-wrap gap-1.5">
                                    {inclusion.status === "cancelado" ? (
                                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold">
                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />Cancelado
                                      </span>
                                    ) : isEscalated(inclusion) ? (
                                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-[11px] font-bold">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />Escalado
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-50 text-orange-600 text-[11px] font-bold">
                                        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />Pendente
                                      </span>
                                    )}
                                    {(() => {
                                      const ticket = getTicket(inclusion.id);
                                      if (!ticket) return null;
                                      if (ticket.transportType === 'van') return (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 text-[11px] font-bold">
                                          🚐 Van registrada
                                        </span>
                                      );
                                      if (ticket.transportType === 'rodoviario') return (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 text-[11px] font-bold">
                                          <Bus className="w-3 h-3" />Rodoviária comprada
                                        </span>
                                      );
                                      return (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 text-[11px] font-bold">
                                          <Plane className="w-3 h-3" />Passagem comprada
                                        </span>
                                      );
                                    })()}
                                    {(() => {
                                      const accommodation = getAccommodation(inclusion.id);
                                      const accommodationInfo = formatAccommodationInfo(accommodation);
                                      return accommodationInfo && (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-50 text-purple-600 text-[11px] font-bold">
                                          🏨 Hospedagem comprada{accommodationInfo.hasAttachments && ' 📎'}
                                        </span>
                                      );
                                    })()}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Aba: Escalações COM passagem */}
                <TabsContent value="with-ticket" className="mt-0">
                  {withTicket.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-10 text-center mt-4">
                      <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center mx-auto mb-3">
                        <Plane className="w-6 h-6 text-green-300" />
                      </div>
                      <h3 className="text-[14px] font-bold text-slate-500 mb-1">
                        Nenhuma escalação com passagem
                      </h3>
                      <p className="text-[12px] text-slate-400">
                        Não há escalações que necessitam de passagens nos filtros atuais.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mt-4">
                      <div className="overflow-x-auto">
                        <table className="table-fixed w-full">
                          <colgroup>
                            <col style={{width: "100px"}} />
                            <col style={{width: "28%"}} />
                            <col style={{width: "22%"}} />
                            <col style={{width: "150px"}} />
                            <col style={{width: "220px"}} />
                          </colgroup>
                          <thead style={{ background: "#F8FAFC", borderBottom: "2px solid #E2E8F0" }}>
                            <tr>
                              <SortableHeader field="id" sortConfig={sortConfig} onSort={handleSort}>ID</SortableHeader>
                              <SortableHeader field="function" sortConfig={sortConfig} onSort={handleSort}>Função / Evento</SortableHeader>
                              <SortableHeader field="collaborator" sortConfig={sortConfig} onSort={handleSort}>Colaborador</SortableHeader>
                              <SortableHeader field="period" className="whitespace-nowrap" sortConfig={sortConfig} onSort={handleSort}>Período / Diárias</SortableHeader>
                              <th className="w-[220px] min-w-[220px] px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">
                                Status
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {withTicket.map((inclusion, rowIdx) => (
                              <tr
                                key={inclusion.id}
                                className={`transition-colors cursor-pointer ${rowIdx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'} hover:bg-blue-50/30 ${inclusion.status === 'cancelado' ? 'opacity-50' : ''}`}
                                onClick={() => handleRowClick(inclusion)}
                              >
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-[#0033CC] bg-blue-50 px-2 py-1 rounded-lg">
                                      #{inclusion.inclusionNumber || 'N/A'}
                                    </span>
                                    <Eye
                                      className="w-4 h-4 text-slate-300 hover:text-blue-500 transition-colors cursor-pointer"
                                      onClick={(e) => handleViewComments(e, inclusion)}
                                    />
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="text-[14px] font-semibold text-[#111827] leading-tight">
                                    {getFunctionName(inclusion.functionId)}
                                  </div>
                                  <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#1D4ED8] text-[11px] font-semibold">
                                    <CalendarDays className="w-3 h-3 shrink-0" />
                                    <span className="break-words">{getEventName(inclusion.eventId)}</span>
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  {inclusion.collaboratorId ? (() => {
                                    const name = getCollaboratorName(inclusion.collaboratorId);
                                    const parts = name.trim().split(/\s+/);
                                    const ini = parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
                                    return (
                                      <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-lg bg-[#0033CC] text-white flex items-center justify-center text-[10px] font-black shrink-0">{ini}</div>
                                        <span className="text-[13px] font-normal text-[#374151]">{name}</span>
                                      </div>
                                    );
                                  })() : (
                                    <div className="flex items-center gap-2.5">
                                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0">N/E</div>
                                      <span className="text-sm italic text-slate-400">Não escalado</span>
                                    </div>
                                  )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm font-semibold text-slate-800 whitespace-nowrap">
                                    {formatDateRange(inclusion.scheduleStartDate, inclusion.scheduleEndDate)}
                                  </div>
                                  <div className="text-[11px] text-slate-400">
                                    {formatDiarias(inclusion.dailyRates)}
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex flex-row flex-wrap gap-1.5">
                                    {inclusion.status === "cancelado" ? (
                                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold">
                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />Cancelado
                                      </span>
                                    ) : isEscalated(inclusion) ? (
                                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-[11px] font-bold">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />Escalado
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-50 text-orange-600 text-[11px] font-bold">
                                        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />Pendente
                                      </span>
                                    )}
                                    {(() => {
                                      const ticket = getTicket(inclusion.id);
                                      if (!ticket) return null;
                                      if (ticket.transportType === 'van') return (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 text-[11px] font-bold">
                                          🚐 Van registrada
                                        </span>
                                      );
                                      if (ticket.transportType === 'rodoviario') return (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 text-[11px] font-bold">
                                          <Bus className="w-3 h-3" />Rodoviária comprada
                                        </span>
                                      );
                                      return (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 text-[11px] font-bold">
                                          <Plane className="w-3 h-3" />Passagem comprada
                                        </span>
                                      );
                                    })()}
                                    {(() => {
                                      const accommodation = getAccommodation(inclusion.id);
                                      const accommodationInfo = formatAccommodationInfo(accommodation);
                                      return accommodationInfo && (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-50 text-purple-600 text-[11px] font-bold">
                                          🏨 Hospedagem comprada{accommodationInfo.hasAttachments && ' 📎'}
                                        </span>
                                      );
                                    })()}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            );
          })()}

      {/* Modal de Detalhes da Escalação */}
      <Dialog open={showModal} onOpenChange={setShowModal} modal={!showSuccessModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 p-0 gap-0">
          <DialogHeader className="bg-white -mx-0 px-6 pt-6 pb-4 border-b border-slate-100 mb-0 sticky top-0 z-10">
            <DialogTitle className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-[9px] bg-[#0033CC] flex items-center justify-center text-white shrink-0"
                style={{ boxShadow: "0 4px 12px #0033CC40" }}
              >
                <Users className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
              </div>
              <div>
                <div className="text-[17px] font-bold text-slate-900 leading-tight">Detalhes da Escalação</div>
                <div className="text-[12px] font-medium text-slate-400 mt-0.5">
                  #{selectedInclusion?.inclusionNumber || 'N/A'} · {selectedInclusion ? getEventName(selectedInclusion.eventId) : ''}
                </div>
              </div>
            </DialogTitle>
          </DialogHeader>
          
          {selectedInclusion && (
            <div className="space-y-5 px-6 py-5">
              {/* Informações Básicas */}
              <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4">
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400 font-black mb-1">Evento</div>
                    <div className="text-[13px] font-semibold text-[#0033CC]">
                      {getEventName(selectedInclusion.eventId)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400 font-black mb-1">ID</div>
                    <div className="text-[13px] font-bold text-slate-700 font-mono">
                      #{selectedInclusion.inclusionNumber || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400 font-black mb-1">Função</div>
                    <div className="text-[13px] font-semibold text-slate-700">
                      {getFunctionName(selectedInclusion.functionId)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400 font-black mb-1">Status</div>
                    {selectedInclusion.status === 'cancelado' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-500 text-[11px] font-bold rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />Cancelado
                      </span>
                    ) : isEscalated(selectedInclusion) ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-100 text-green-700 text-[11px] font-bold rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />Escalado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-orange-50 text-orange-600 text-[11px] font-bold rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />Pendente
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Seleção de Colaborador */}
              <div>
                <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wide mb-1.5">
                  Colaborador <span className="text-red-400">*</span>
                </label>
                {!canEditCollaborator(selectedInclusion) ? (
                  // Colaborador fixo quando não pode editar (passagem/hospedagem comprada ou sem permissão)
                  <div className="mt-2 border border-slate-200 rounded-xl bg-slate-50 px-3 py-2.5 w-full">
                    <div className="text-sm font-medium text-slate-700">
                      {getCollaboratorName(modalData.collaboratorId)}
                    </div>
                    {(() => {
                      const ticketPurchased = selectedInclusion.needsTicket
                        ? tickets?.some(t => t.teamInclusionId === selectedInclusion.id && t.purchaseDate !== null)
                        : false;
                      const accommodationReserved = selectedInclusion.needsAccommodation
                        ? accommodations?.some(a => a.teamInclusionId === selectedInclusion.id)
                        : false;

                      if (ticketPurchased && accommodationReserved) {
                        return (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-xs text-amber-700 flex items-center gap-1 mt-1">
                            ⚠️ Não é possível alterar - passagem comprada e hospedagem reservada
                          </div>
                        );
                      }
                      if (ticketPurchased) {
                        return (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-xs text-amber-700 flex items-center gap-1 mt-1">
                            ⚠️ Não é possível alterar - passagem já comprada
                          </div>
                        );
                      }
                      if (accommodationReserved) {
                        return (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-xs text-amber-700 flex items-center gap-1 mt-1">
                            ⚠️ Não é possível alterar - hospedagem já reservada
                          </div>
                        );
                      }
                      // Sem permissão de role
                      return (
                        <div className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                          ⚠️ Você não tem permissão para alterar o colaborador
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  // CollaboratorCombobox para buscar colaborador quando ainda não escalado OU pode editar
                  <div className="mt-2">
                    <CollaboratorCombobox
                      collaborators={collaborators}
                      value={modalData.collaboratorId}
                      onValueChange={(value) => setModalData(prev => ({...prev, collaboratorId: value}))}
                      placeholder="Selecione um colaborador"
                      testId="select-collaborator-escalation"
                    />
                    {isEscalationConfirmed(selectedInclusion) && canEditCollaborator(selectedInclusion) && (
                      <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        {selectedInclusion.needsTicket 
                          ? "ℹ️ Você pode alterar o colaborador até a passagem ser comprada"
                          : selectedInclusion.needsAccommodation
                            ? "ℹ️ Você pode alterar o colaborador até a hospedagem ser reservada"
                            : "ℹ️ Você pode alterar o colaborador (escalação confirmada)"
                        }
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Período de Trabalho com Calendário Visual */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                {/* Header */}
                <div className="bg-[#0033CC]/5 border-b border-slate-200 px-4 py-2.5 flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-[#0033CC]" />
                  <span className="text-[11px] font-black text-[#0033CC] uppercase tracking-[0.12em]">Período de Trabalho</span>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 mb-1">Início</div>
                      <div className="text-[13px] font-semibold text-slate-700">
                        {formatDateWithWeekday(selectedInclusion.scheduleStartDate)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 mb-1">Término</div>
                      <div className="text-[13px] font-semibold text-slate-700">
                        {formatDateWithWeekday(selectedInclusion.scheduleEndDate)}
                      </div>
                    </div>
                  </div>

                  {/* Calendário Visual Mini */}
                  {selectedInclusion.scheduleStartDate && selectedInclusion.scheduleEndDate && (() => {
                    const startDate = parseISO(selectedInclusion.scheduleStartDate);
                    const endDate = parseISO(selectedInclusion.scheduleEndDate);
                    const allDays = eachDayOfInterval({ start: startDate, end: endDate });
                    const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
                    
                    return (
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 mb-2">
                          {allDays.length} {allDays.length === 1 ? 'dia' : 'dias'} no período
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {allDays.map((day, index) => {
                            const weekend = isWeekend(day);
                            const weekday = format(day, 'EEE', { locale: ptBR });
                            
                            return (
                              <div 
                                key={index}
                                className={`flex flex-col items-center justify-center rounded-xl border text-center px-2.5 py-2 min-w-[46px] ${
                                  weekend
                                    ? 'bg-orange-50 border-orange-200'
                                    : 'bg-white border-slate-200'
                                }`}
                              >
                                <div className={`text-[9px] uppercase font-bold ${weekend ? 'text-orange-400' : 'text-slate-400'}`}>
                                  {weekday}
                                </div>
                                <div className={`text-[16px] font-bold leading-tight ${weekend ? 'text-orange-600' : 'text-slate-700'}`}>
                                  {format(day, 'dd', { locale: ptBR })}
                                </div>
                                <div className={`text-[9px] ${weekend ? 'text-orange-300' : 'text-slate-300'}`}>
                                  {format(day, 'MMM', { locale: ptBR })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>





              {/* Informações de Passagem - só para inclusões que necessitam de passagem */}
              {selectedInclusion?.needsTicket && (
                <section className="space-y-4">
                  {selectedTicket ? (
                    <>
                      {/* Título da seção quando passagem comprada */}
                      <h3 className="text-lg font-semibold text-green-700 mb-4 flex items-center gap-2">
                        {selectedTicket.transportType === 'van' ? '🚐 Van Registrada' : selectedTicket.transportType === 'rodoviario' ? '🚌 Rodoviária Comprada' : '✈️ Passagem Aérea Comprada'}
                      </h3>

                      {/* Informações Gerais da Compra */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        {selectedTicket.transportType !== 'van' && selectedTicket.purchaseDate && (
                          <div>
                            <Label className="text-xs text-green-600 font-medium">📅 Data da Compra</Label>
                            <p className="font-medium">{formatDate(selectedTicket.purchaseDate)}</p>
                          </div>
                        )}
                        {selectedTicket.purchaseOrderNumber && (
                          <div>
                            <Label className="text-xs text-green-600 font-medium">
                              {selectedTicket.transportType === 'van' ? '🏢 Nome da Empresa' : '📋 Ordem de Compra'}
                            </Label>
                            <p className="font-medium">{selectedTicket.purchaseOrderNumber}</p>
                          </div>
                        )}
                      </div>

                      {/* Conteúdo específico por tipo */}
                      {selectedTicket.transportType === 'van' ? (
                        /* Van: mostra só observações */
                        selectedTicket.ticketObservations ? (
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                            <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Observação</div>
                            <div className="text-sm text-slate-700">{selectedTicket.ticketObservations}</div>
                          </div>
                        ) : (
                          <div className="text-sm text-slate-400 italic">Nenhuma observação registrada.</div>
                        )
                      ) : (
                        /* Aéreo / Rodoviário: grid IDA + VOLTA */
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {/* Trecho de IDA */}
                          <div className="bg-white border border-slate-200 rounded-xl p-4 flex-1">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-blue-600 mb-3 flex items-center gap-2">
                              {selectedTicket.transportType === 'rodoviario' ? '🚌' : '🛫'} IDA
                            </h4>
                            <div className="space-y-2">
                              <div>
                                <div className="text-xs text-slate-400 uppercase tracking-wider">
                                  {selectedTicket.transportType === 'rodoviario' ? 'Cidade de Origem' : 'Origem'}
                                </div>
                                <div className="text-sm font-medium text-slate-700">{selectedTicket.departureAirport || "-"}</div>
                              </div>
                              <div>
                                <div className="text-xs text-slate-400 uppercase tracking-wider">
                                  {selectedTicket.transportType === 'rodoviario' ? 'Cidade de Destino' : 'Destino'}
                                </div>
                                <div className="text-sm font-medium text-slate-700">{selectedTicket.destinationAirport || "-"}</div>
                              </div>
                              <div>
                                <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Data</div>
                                <div className="text-sm font-medium text-blue-600 mb-2">
                                  {selectedTicket.actualDepartureDate ? formatDate(selectedTicket.actualDepartureDate) : "-"}
                                </div>
                                <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Horário</div>
                                {selectedTicket.actualDepartureTime ? (
                                  <div className="bg-green-50 border-l-4 border-green-400 rounded-lg px-3 py-2">
                                    <span className="text-lg font-bold text-green-700">{selectedTicket.actualDepartureTime}</span>
                                  </div>
                                ) : (
                                  <div className="bg-slate-50 border-l-4 border-slate-200 rounded-lg px-3 py-2">
                                    <span className="text-lg font-bold text-slate-300">--:--</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Trecho de VOLTA */}
                          <div className="bg-white border border-slate-200 rounded-xl p-4 flex-1">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-blue-600 mb-3 flex items-center gap-2">
                              {selectedTicket.transportType === 'rodoviario' ? '🚌' : '🛬'} VOLTA
                            </h4>
                            <div className="space-y-2">
                              <div>
                                <div className="text-xs text-slate-400 uppercase tracking-wider">
                                  {selectedTicket.transportType === 'rodoviario' ? 'Cidade de Origem' : 'Origem'}
                                </div>
                                <div className="text-sm font-medium text-slate-700">{selectedTicket.destinationAirport || "-"}</div>
                              </div>
                              <div>
                                <div className="text-xs text-slate-400 uppercase tracking-wider">
                                  {selectedTicket.transportType === 'rodoviario' ? 'Cidade de Destino' : 'Destino'}
                                </div>
                                <div className="text-sm font-medium text-slate-700">{selectedTicket.departureAirport || "-"}</div>
                              </div>
                              <div>
                                <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Data</div>
                                <div className="text-sm font-medium text-blue-600 mb-2">
                                  {selectedTicket.actualReturnDate ? formatDate(selectedTicket.actualReturnDate) : "-"}
                                </div>
                                <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Horário</div>
                                {selectedTicket.actualReturnTime ? (
                                  <div className="bg-green-50 border-l-4 border-green-400 rounded-lg px-3 py-2">
                                    <span className="text-lg font-bold text-green-700">{selectedTicket.actualReturnTime}</span>
                                  </div>
                                ) : (
                                  <div className="bg-slate-50 border-l-4 border-slate-200 rounded-lg px-3 py-2">
                                    <span className="text-lg font-bold text-slate-300">--:--</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {/* Status: Passagem Não Comprada */}
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
                        <span className="text-amber-500 text-lg">⚠️</span>
                        <div className="text-sm font-medium text-amber-700">Passagem ainda não foi comprada</div>
                      </div>
                    </>
                  )}

                  {/* Datas de Viagem Sugeridas - só se ainda não comprou a passagem */}
                  {!selectedTicket && (
                    <div className="border border-blue-200 rounded-xl overflow-hidden">
                      <div className="bg-blue-50 border-b border-blue-200 px-4 py-2.5 flex items-center gap-2">
                        <Plane className="w-3.5 h-3.5 text-blue-500" />
                        <span className="text-[11px] font-black text-blue-600 uppercase tracking-[0.12em]">Datas Sugeridas</span>
                        <span className="text-[10px] text-blue-400 font-normal ml-1">· da inclusão de equipe</span>
                      </div>
                      <div className="p-4">
                        {(() => {
                          const travelInfo = extractTravelInfoFromObservations(selectedInclusion.observations || undefined, selectedInclusion);
                          return (
                            <div className="grid grid-cols-2 gap-3">
                              {/* IDA */}
                              <div className="bg-white border border-blue-100 rounded-xl p-3">
                                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-400 mb-2 flex items-center gap-1">
                                  🛫 IDA
                                </div>
                                <div className="space-y-2">
                                  <div>
                                    <div className="text-[10px] text-slate-400">Data</div>
                                    <div className="text-[12px] font-semibold text-slate-700">{formatSuggestionDate(travelInfo.ida)}</div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] text-slate-400">Horário sugerido</div>
                                    <div className="text-[12px] font-semibold text-slate-700">{travelInfo.chegada !== 'N/A' && travelInfo.chegada !== 'Não definido' ? travelInfo.chegada : '—'}</div>
                                  </div>
                                </div>
                              </div>
                              {/* VOLTA */}
                              <div className="bg-white border border-blue-100 rounded-xl p-3">
                                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-400 mb-2 flex items-center gap-1">
                                  🛬 VOLTA
                                </div>
                                <div className="space-y-2">
                                  <div>
                                    <div className="text-[10px] text-slate-400">Data</div>
                                    <div className="text-[12px] font-semibold text-slate-700">{formatSuggestionDate(travelInfo.retorno)}</div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] text-slate-400">Horário sugerido</div>
                                    <div className="text-[12px] font-semibold text-slate-700">{travelInfo.horario !== 'N/A' && travelInfo.horario !== 'Não definido' ? travelInfo.horario : '—'}</div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </section>
              )}

              {/* Seção de Anexos da Passagem */}
              {selectedTicket?.attachmentIds && selectedTicket.attachmentIds.length > 0 && (
                <div className="border-t pt-4">
                  <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-2">📎 Anexos da Passagem</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {selectedTicket.attachmentIds.map((attachmentId, index) => {
                      const fallback = `Anexo ${index + 1} da Passagem`;
                      return (
                        <div
                          key={attachmentId}
                          className="bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer transition-all"
                          onClick={() => openAttachment(attachmentId, fallback)}
                        >
                          <div className="bg-blue-100 text-blue-600 rounded-lg w-7 h-7 flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {index + 1}
                          </div>
                          <span className="flex-1 text-sm text-slate-400">Clique para visualizar</span>
                          <Eye className="w-4 h-4 text-blue-400 flex-shrink-0" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Seção de Hospedagem */}
              {(() => {
                const accommodation = getAccommodation(selectedInclusion.id);
                if (!accommodation) return null;
                return (
                  <div className="border-t pt-4">
                    <h3 className="text-base font-semibold text-slate-800 mb-3">🏨 Dados da Hospedagem</h3>
                    <div className="bg-green-50 border border-green-100 rounded-2xl p-4 mb-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Hotel */}
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-slate-400">Hotel</div>
                          <div className="text-sm font-semibold text-slate-700 mt-0.5">{accommodation.hotelName || 'Não informado'}</div>
                        </div>
                        
                        {/* Localização */}
                        {accommodation.hotelLocation && (
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-slate-400">Localização</div>
                            <div className="text-sm font-semibold text-slate-700 mt-0.5">{accommodation.hotelLocation}</div>
                          </div>
                        )}
                        
                        {/* Check-in */}
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-slate-400">Check-in</div>
                          <div className="text-sm font-semibold text-slate-700 mt-0.5">
                            {accommodation.checkInDate ? formatDateWithWeekday(accommodation.checkInDate) : 'Não informado'}
                            {accommodation.checkInTime && ` às ${accommodation.checkInTime}`}
                          </div>
                        </div>
                        
                        {/* Check-out */}
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-slate-400">Check-out</div>
                          <div className="text-sm font-semibold text-slate-700 mt-0.5">
                            {accommodation.checkOutDate ? formatDateWithWeekday(accommodation.checkOutDate) : 'Não informado'}
                            {accommodation.checkOutTime && ` às ${accommodation.checkOutTime}`}
                          </div>
                        </div>
                        
                        {/* Valor da diária */}
                        {accommodation.dailyRate && (
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-slate-400">Valor da Diária</div>
                            <div className="text-sm font-semibold text-slate-700 mt-0.5">R$ {(accommodation.dailyRate / 100).toFixed(2)}</div>
                          </div>
                        )}
                        
                      </div>
                      
                      {/* Observações */}
                      {accommodation.accommodationObservations && (
                        <div className="mt-4 pt-4 border-t border-green-100">
                          <div className="text-[10px] uppercase tracking-wider text-slate-400">Observações</div>
                          <div className="text-sm font-semibold text-slate-700 mt-0.5">{accommodation.accommodationObservations}</div>
                        </div>
                      )}
                    </div>
                    
                    {/* Anexos da Hospedagem */}
                    {accommodation.attachmentIds && accommodation.attachmentIds.length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-2">📎 Anexos da Hospedagem</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {accommodation.attachmentIds.map((attachmentId, index) => {
                            const fallback = `Anexo ${index + 1} da Hospedagem`;
                            return (
                            <div
                              key={attachmentId}
                              className="bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer transition-all"
                              onClick={() => openAttachment(attachmentId, fallback)}
                            >
                              <div className="bg-blue-100 text-blue-600 rounded-lg w-7 h-7 flex items-center justify-center text-xs font-bold flex-shrink-0">
                                {index + 1}
                              </div>
                              <span className="flex-1 text-sm text-slate-400">Clique para visualizar</span>
                              <Eye className="w-4 h-4 text-blue-400 flex-shrink-0" />
                            </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Seção de Comentários */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-slate-500" />
                  <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.12em]">Comentários</span>
                  {comments && comments.length > 0 && (
                    <span className="ml-auto bg-[#0033CC] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{comments.length}</span>
                  )}
                </div>
                <div className="p-4">
                
                {/* Lista de comentários existentes */}
                {comments && comments.length > 0 ? (
                  <div className="space-y-3 max-h-60 overflow-y-auto mb-4">
                    {comments.map((comment) => (
                      <div key={comment.id} className="bg-slate-50 border border-slate-100 p-3 rounded-xl">
                        <div className="flex justify-between items-start mb-2">
                          <div className="text-sm font-medium text-slate-700">
                            {getUserName(comment.userId)}
                          </div>
                          <div className="text-xs text-slate-400">
                            {formatDateTime(comment.createdAt)}
                          </div>
                        </div>
                        <div className="text-sm text-slate-700 mb-2">
                          {comment.content}
                        </div>
                        <div className="text-xs text-slate-400">
                          {getPhaseLabel(comment.phase)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-sm text-center py-8 mb-4">
                    Nenhum comentário registrado para esta inclusão.
                  </div>
                )}

                {/* Formulário para adicionar novo comentário */}
                <div className="border-t border-slate-100 pt-3">
                  <div className="flex space-x-3">
                    <Textarea 
                      rows={2}
                      placeholder="Adicionar comentário..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      className="flex-1 border border-slate-200 rounded-xl bg-white text-sm p-3 resize-none focus:ring-2 focus:ring-blue-200 min-h-[72px]"
                      data-testid="textarea-comment-inline"
                      disabled={!selectedInclusion || isReadOnly(selectedInclusion) || !canConfirmEscalation(selectedInclusion)}
                    />
                    <Button 
                      onClick={handleAddComment}
                      disabled={addCommentMutation.isPending || !newComment.trim() || !selectedInclusion || isReadOnly(selectedInclusion)}
                      style={{ background: "#0033CC", boxShadow: "0 3px 10px #0033CC40" }}
                      className="text-white rounded-xl px-5 py-2 text-sm font-semibold hover:opacity-90 transition-opacity shrink-0"
                      data-testid="button-add-comment-inline"
                    >
                      {addCommentMutation.isPending ? "Enviando..." : "Enviar"}
                    </Button>
                  </div>
                </div>
                </div>
              </div>

              {/* Seção de Histórico de Alterações */}
              {inclusionLogs && inclusionLogs.length > 0 && (
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex items-center gap-2">
                    <History className="w-4 h-4 text-slate-400" />
                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.12em]">Histórico de Alterações</span>
                    <span className="ml-auto text-[10px] text-slate-400">{inclusionLogs.length} {inclusionLogs.length === 1 ? 'entrada' : 'entradas'}</span>
                  </div>
                  <div className="p-4">
                  
                  <div className="border-l-2 border-slate-100 ml-3 pl-4 space-y-4 max-h-80 overflow-y-auto">
                    {inclusionLogs
                      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
                      .map((log, index) => {
                        const actionLabels: Record<string, string> = {
                          'status_changed': '🔄 Status Alterado',
                          'collaborator_changed': '👤 Colaborador Alterado',
                          'dates_changed': '📅 Período Alterado',
                          'travel_dates_changed': '✈️ Datas de Viagem Alteradas',
                          'observations_changed': '📝 Observações Atualizadas',
                          'created': '✨ Criado',
                          'confirmed': '✅ Confirmado',
                          'reopened': '🔓 Reaberto',
                        };
                        
                        return (
                          <div key={log.id} className="flex gap-3">
                            <div className="w-3 h-3 bg-blue-500 rounded-full -ml-[1.4rem] mt-1 flex-shrink-0 ring-4 ring-white"></div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="text-sm font-semibold text-slate-700">
                                  {actionLabels[log.action] || log.action}
                                </div>
                                <div className="text-xs text-slate-400 ml-auto whitespace-nowrap flex-shrink-0">
                                  {log.createdAt && formatDateTime(log.createdAt)}
                                </div>
                              </div>
                              <div className="text-xs text-slate-500 mt-0.5">
                                {log.details}
                              </div>
                              <div className="text-xs text-blue-500 font-medium mt-0.5">
                                por {log.userName}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                  </div>
                </div>
              )}

              {/* Botões */}
              <div className="flex gap-3 justify-end pt-4 border-t border-slate-100 mt-2">
                <Button variant="outline" onClick={() => setShowModal(false)} className="border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl px-5 py-2 text-sm font-medium">
                  Cancelar
                </Button>
                {selectedInclusion && !isReadOnly(selectedInclusion) && (
                  <>
                    {/* Botão Salvar - disponível para quem pode editar colaborador OU confirmar escalação */}
                    {(canEditCollaborator(selectedInclusion) || !isEscalated(selectedInclusion)) && (
                      <Button 
                        variant="secondary"
                        onClick={handleSave}
                        disabled={(() => {
                          if (!selectedInclusion) return true;
                          if (updateTeamInclusionMutation.isPending) return true;
                          if (selectedInclusion.status === 'cancelado') return true;
                          // Se já foi escalado, só pode salvar se pode editar colaborador
                          if (isEscalated(selectedInclusion)) {
                            return !canEditCollaborator(selectedInclusion);
                          }
                          // Se não foi escalado, precisa ser responsável pela função
                          if (!canConfirmEscalation(selectedInclusion)) return true;
                          return false;
                        })()}
                        className="flex items-center gap-2 border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl px-5 py-2 text-sm font-medium"
                      >
                        <Save className="w-4 h-4" />
                        {updateTeamInclusionMutation.isPending ? "Salvando..." : "Salvar Alterações"}
                      </Button>
                    )}
                    
                    {/* Botão Confirmar Escalação - só antes de escalar */}
                    {!isEscalated(selectedInclusion) && (
                      <Button 
                        onClick={handleConfirmEscalation}
                        disabled={(() => {
                          if (!selectedInclusion) return true;
                          if (updateTeamInclusionMutation.isPending) return true;
                          if (selectedInclusion.status === 'cancelado') return true;
                          if (!canConfirmEscalation(selectedInclusion)) return true;
                          return false;
                        })()}
                        style={{ background: "#0033CC", boxShadow: "0 4px 14px #0033CC50" }}
                        className="flex items-center gap-2 text-white rounded-xl px-6 py-2 h-10 text-sm font-bold hover:opacity-90 transition-opacity"
                      >
                        <Check className="w-4 h-4" />
                        {updateTeamInclusionMutation.isPending ? "Confirmando..." : "Confirmar Escalação"}
                      </Button>
                    )}
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

      {/* Modal de sucesso — portal no body para escapar do transform do Dialog */}
      {showSuccessModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{background:'rgba(0,0,0,0.45)'}}>
          <div className="bg-white rounded-2xl shadow-2xl flex flex-col items-center px-8 py-7 max-w-sm w-full mx-4" style={{boxShadow:'0 8px 40px rgba(0,0,0,0.18)'}}>
            <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{background:'#DCFCE7'}}>
              <svg width="32" height="32" viewBox="0 0 36 36" fill="none">
                <circle cx="18" cy="18" r="18" fill="#16A34A" fillOpacity="0.12"/>
                <path d="M10 18.5L15.5 24L26 13" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-1">Sucesso</h3>
            <p className="text-sm text-slate-500 text-center mb-4">{successInfo?.message}</p>
            <div className="w-full border-t border-slate-100 mb-4"/>
            <div className="w-full space-y-2 mb-5">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400 font-medium">Evento</span>
                <span className="text-slate-700 font-semibold text-right max-w-[180px] truncate">{successInfo?.eventName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400 font-medium">Colaborador</span>
                <span className="text-slate-700 font-semibold text-right max-w-[180px] truncate">
                  {successInfo?.collaboratorName}
                  {successInfo?.inclusionNumber != null && <span className="ml-1 text-slate-400 font-normal">#{successInfo.inclusionNumber}</span>}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400 font-medium">Função</span>
                <span className="text-slate-700 font-semibold text-right max-w-[180px] truncate">{successInfo?.functionName}</span>
              </div>
            </div>
            <button
              onClick={() => { setShowSuccessModal(false); setSuccessInfo(null); }}
              className="w-full py-2.5 rounded-xl font-semibold text-white text-sm"
              style={{background:'#2563EB'}}
            >
              OK
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Lightbox de imagens — renderizado via Portal fora do Dialog para evitar focus trap */}
      {lightbox && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          onMouseDown={() => setLightbox(null)}
        >
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" />
          <div
            className="relative z-10 bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-w-5xl w-full max-h-[90vh]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between flex-shrink-0">
              <span className="text-sm font-semibold text-slate-700">Visualizando anexo</span>
              <div className="flex items-center gap-2">
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={async () => {
                    try {
                      const res = await fetch(lightbox.url);
                      const blob = await res.blob();
                      const blobUrl = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = blobUrl;
                      a.download = lightbox.name;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(blobUrl);
                    } catch {
                      window.open(lightbox.url, '_blank');
                    }
                  }}
                  className="border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Baixar
                </button>
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => window.open(lightbox.url, '_blank', 'noopener,noreferrer')}
                  className="border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Abrir em outra aba
                </button>
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => setLightbox(null)}
                  className="hover:bg-slate-100 rounded-lg p-1.5 text-slate-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* Área de conteúdo */}
            <div className="bg-slate-50 overflow-auto flex items-center justify-center min-h-[70vh]">
              <img
                src={lightbox.url}
                alt="Visualização do anexo"
                className="w-full object-contain"
                style={{ minHeight: '70vh' }}
              />
            </div>
          </div>
        </div>,
        document.body
      )}

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