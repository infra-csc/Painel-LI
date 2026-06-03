import { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { formatDiarias, fixEncoding, formatDateRange } from "@/lib/utils";
import { markSwapSeen, getSeenState } from "@/lib/seenSwaps";
import { useQuery, useMutation } from "@tanstack/react-query";
import StatusBadge from "@/components/common/status-badge";
import { User, Eye, Save, FileSpreadsheet, Download, X, ExternalLink, Clock, Plane, Bus, Check, CalendarDays, Users, MessageSquare, History, ChevronDown, ChevronUp, FileText, Image as ImageIcon, File, HelpCircle, ArrowLeftRight, ArrowRight, AlertCircle, RotateCcw } from "lucide-react";
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
import type { TeamInclusion, Event, Function, Collaborator, Comment, Ticket, Accommodation, TeamInclusionLog, SwapRequest } from "@shared/schema";
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
    accommodationStatus: string;
    searchId: string;
    showDeleted: boolean;
  }>({
    eventId: "all",
    functionId: [],
    collaboratorId: "all",
    escalationStatus: "all",
    ticketStatus: "all",
    accommodationStatus: "all",
    searchId: "",
    showDeleted: false,
  });
  
  const [sortConfig, setSortConfig] = useState<SortConfig | null>({ field: 'id', direction: 'desc' });
  
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

  // Estados para o modal redesenhado
  const [modalActiveTab, setModalActiveTab] = useState("resumo");
  const [showAllLogs, setShowAllLogs] = useState(false);

  // Estado para lightbox de imagens
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);

  // Estado para modal de solicitação de troca
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [swapNewCollaboratorId, setSwapNewCollaboratorId] = useState("");
  const [swapReason, setSwapReason] = useState("");
  const [swapSuccess, setSwapSuccess] = useState(false);
  const [swapSubmitAttempted, setSwapSubmitAttempted] = useState(false);
  const [showCancelSwapConfirm, setShowCancelSwapConfirm] = useState(false);

  // Atalho para localizar trocas pendentes na lista de escalação
  const [showOnlyPendingSwaps, setShowOnlyPendingSwaps] = useState(false);
  const [scalingTab, setScalingTab] = useState<string>("without-ticket");
  const tabInitialized = useRef(false);

  // Cache de metadados de anexos { [id]: { name, type, viewUrl, downloadUrl } }
  const [attachmentMeta, setAttachmentMeta] = useState<Record<string, { name?: string; type?: string; viewUrl?: string; downloadUrl?: string }>>({});
  
  const { user } = useAuth();
  const { toast } = useToast();

  // IDs de trocas pendentes já visualizadas pelo solicitante
  const [seenSwapIds, setSeenSwapIds] = useState<Set<string>>(() => {
    if (!user) return new Set<string>();
    const state = getSeenState(user.id);
    return new Set(Object.entries(state).filter(([, v]: [string, any]) => v.pendingSeen).map(([k]) => k));
  });

  useEffect(() => {
    const handler = () => {
      if (!user) return;
      const state = getSeenState(user.id);
      setSeenSwapIds(new Set(Object.entries(state).filter(([, v]: [string, any]) => v.pendingSeen).map(([k]) => k)));
    };
    window.addEventListener('swapSeenUpdated', handler);
    return () => window.removeEventListener('swapSeenUpdated', handler);
  }, [user]);

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

  // Query global de swap requests — para badges nas linhas da tabela
  const { data: allSwapRequests } = useQuery<SwapRequest[]>({
    queryKey: ["/api/swap-requests"],
    queryFn: async () => {
      const r = await fetch("/api/swap-requests");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const pendingSwapByInclusion = useMemo(() => {
    const map = new Map<string, SwapRequest>();
    allSwapRequests?.filter(s => s.status === 'pendente').forEach(s => {
      const inclId = (s as any).team_inclusion_id || (s as any).teamInclusionId;
      if (inclId) map.set(inclId, s);
    });
    return map;
  }, [allSwapRequests]);

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

  // Query para buscar swap requests da inclusão selecionada
  const { data: swapRequests } = useQuery<SwapRequest[]>({
    queryKey: ["/api/swap-requests/inclusion", selectedInclusion?.id],
    queryFn: async () => {
      if (!selectedInclusion?.id) return [];
      const r = await fetch(`/api/swap-requests/inclusion/${selectedInclusion.id}`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!selectedInclusion?.id,
  });

  const pendingSwap = swapRequests?.find(s => s.status === 'pendente');
  const latestSwap = swapRequests?.[0]; // mais recente (pode ser rejeitado/cancelado)

  // Mutation para criar swap request
  const createSwapRequestMutation = useMutation({
    mutationFn: async (data: { teamInclusionId: string; newCollaboratorId: string; reason: string }) => {
      const r = await apiRequest("POST", "/api/swap-requests", data);
      return r.json();
    },
    onSuccess: () => {
      setSwapSuccess(true);
      queryClient.invalidateQueries({ queryKey: ["/api/swap-requests/inclusion", selectedInclusion?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/swap-requests"] });
    },
    onError: async (err: any) => {
      const msg = await err?.response?.json?.().catch(() => null);
      toast({ title: "Erro", description: msg?.message || "Erro ao criar solicitação", variant: "destructive" });
    },
  });

  // Mutation para cancelar swap request
  const cancelSwapMutation = useMutation({
    mutationFn: async (swapId: string) => {
      const r = await apiRequest("PATCH", `/api/swap-requests/${swapId}/cancel`, {});
      return r.json();
    },
    onSuccess: () => {
      setShowCancelSwapConfirm(false);
      toast({ title: "Solicitação cancelada", description: "A solicitação de troca foi cancelada com sucesso." });
      queryClient.invalidateQueries({ queryKey: ["/api/swap-requests/inclusion", selectedInclusion?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/swap-requests"] });
    },
    onError: async (err: any) => {
      const msg = await err?.response?.json?.().catch(() => null);
      toast({ title: "Erro", description: msg?.message || "Erro ao cancelar solicitação", variant: "destructive" });
    },
  });

  // Mutation para aprovar escalação sem passagem/hospedagem (Compras/admin)
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const approveEscalationMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("PATCH", `/api/team-inclusions/${id}`, { status: "aprovado", phase: "aprovado" });
      return r.json();
    },
    onSuccess: () => {
      setShowApproveConfirm(false);
      setShowModal(false);
      toast({ title: "Escalação aprovada", description: "A escalação foi aprovada com sucesso." });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    },
    onError: async (err: any) => {
      const msg = await err?.response?.json?.().catch(() => null);
      toast({ title: "Erro", description: msg?.message || "Erro ao aprovar escalação", variant: "destructive" });
    },
  });

  // Mutation para reativar escalação cancelada (admin only)
  const [showReactivateConfirm, setShowReactivateConfirm] = useState(false);
  const reactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("PATCH", `/api/team-inclusions/${id}/reactivate`, {});
      return r.json();
    },
    onSuccess: (data) => {
      setShowReactivateConfirm(false);
      setShowModal(false);
      toast({ title: "Escalação reativada", description: "A escalação foi reativada e voltou ao status Pendente." });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    },
    onError: async (err: any) => {
      const msg = await err?.response?.json?.().catch(() => null);
      toast({ title: "Erro", description: msg?.message || "Erro ao reativar escalação", variant: "destructive" });
    },
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
      inclusion.status === "aprovacao" ||
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
      inclusion.status === "aprovacao" ||
      inclusion.status === "aprovado" ||
      inclusion.status === "concluido"
    );
  };

  // Detecta conflitos de escalação para um colaborador
  const getCollaboratorConflicts = (collaboratorId: string, excludeInclusionId?: string) => {
    if (!collaboratorId || !teamInclusions) return { sameEvent: [] as TeamInclusion[], dateOverlap: [] as TeamInclusion[] };
    const active = ['escalado', 'passagem', 'passagem_comprada', 'hospedagem', 'hospedagem_comprada', 'aprovacao', 'aprovado'];
    const others = teamInclusions.filter(ti =>
      ti.collaboratorId === collaboratorId &&
      ti.id !== excludeInclusionId &&
      active.includes(ti.status)
    );
    const ref = teamInclusions.find(ti => ti.id === excludeInclusionId) || selectedInclusion;
    const sameEvent = others.filter(ti => ref && ti.eventId === ref.eventId);
    const dateOverlap = others.filter(ti => {
      if (!ref?.scheduleStartDate || !ref?.scheduleEndDate) return false;
      if (!ti.scheduleStartDate || !ti.scheduleEndDate) return false;
      return new Date(ti.scheduleStartDate) <= new Date(ref.scheduleEndDate) &&
             new Date(ti.scheduleStartDate) <= new Date(ref.scheduleEndDate) &&
             new Date(ref.scheduleStartDate) <= new Date(ti.scheduleEndDate);
    });
    return { sameEvent, dateOverlap };
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

        // Apply accommodation status filter
        if (filters.accommodationStatus !== "all") {
          const hasAccommodation = getAccommodation(inclusion.id) !== undefined;
          if (filters.accommodationStatus === "reserved" && !hasAccommodation) return false;
          if (filters.accommodationStatus === "not-reserved" && hasAccommodation) return false;
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

  // Inclusões visíveis com troca pendente — usado pelo atalho/banner
  const pendingSwapInclusionsInView = useMemo(
    () => scalingInclusions.filter(i => pendingSwapByInclusion.has(i.id)),
    [scalingInclusions, pendingSwapByInclusion]
  );

  // Define a aba inicial assim que os dados carregam (preserva o comportamento antigo)
  useEffect(() => {
    if (tabInitialized.current) return;
    if (scalingInclusions.length > 0) {
      const hasWithout = scalingInclusions.some(i => !i.needsTicket);
      setScalingTab(hasWithout ? "without-ticket" : "with-ticket");
      tabInitialized.current = true;
    }
  }, [scalingInclusions]);

  // Garante saída do filtro caso não haja mais trocas pendentes na visão atual
  useEffect(() => {
    if (showOnlyPendingSwaps && pendingSwapInclusionsInView.length === 0) {
      setShowOnlyPendingSwaps(false);
    }
  }, [showOnlyPendingSwaps, pendingSwapInclusionsInView.length]);

  // Enquanto filtrando, mantém o usuário numa aba que contém a troca pendente
  useEffect(() => {
    if (!showOnlyPendingSwaps) return;
    const hasWithout = pendingSwapInclusionsInView.some(i => !i.needsTicket);
    const hasWith = pendingSwapInclusionsInView.some(i => i.needsTicket);
    if (scalingTab === "without-ticket" && !hasWithout && hasWith) setScalingTab("with-ticket");
    else if (scalingTab === "with-ticket" && !hasWith && hasWithout) setScalingTab("without-ticket");
  }, [showOnlyPendingSwaps, scalingTab, pendingSwapInclusionsInView]);

  // Liga o filtro de trocas pendentes e leva o usuário à aba que contém a troca
  const goToPendingSwaps = () => {
    setShowOnlyPendingSwaps(true);
    const match = pendingSwapInclusionsInView[0];
    if (match) setScalingTab(match.needsTicket ? "with-ticket" : "without-ticket");
  };

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
      const collabId = updatedInclusion.collaboratorId || modalData.collaboratorId || selectedInclusion?.collaboratorId;
      setSuccessInfo({
        message: msg,
        inclusionNumber: updatedInclusion.inclusionNumber ?? selectedInclusion?.inclusionNumber ?? null,
        eventName: events?.find(e => e.id === (updatedInclusion.eventId || selectedInclusion?.eventId))?.name ?? "—",
        collaboratorName: collabId ? getCollaboratorName(collabId) : "—",
        functionName: updatedInclusion.functionId ? getFunctionName(updatedInclusion.functionId) : (selectedInclusion?.functionId ? getFunctionName(selectedInclusion.functionId) : "—"),
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

      // Dados reais da passagem (se existir)
      const ticket = tickets?.find(t => t.teamInclusionId === inclusion.id && t.purchaseDate !== null)
        || tickets?.find(t => t.teamInclusionId === inclusion.id);
      const ticketAny = ticket as any;

      const tipoTransporte = ticket?.transportType
        ? ({ aereo: 'Aéreo', rodoviario: 'Rodoviário', van: 'Van' }[ticket.transportType] || ticket.transportType)
        : 'N/A';
      const passagemLoc = ticket?.purchaseOrderNumber || 'N/A';
      const passagemDataCompra = ticket?.purchaseDate ? formatDate(ticket.purchaseDate) : 'N/A';
      const passagemValor = ticket?.value ? (ticket.value / 100).toFixed(2) : 'N/A';

      const idaCidadeOrigem = ticket?.departureCityOrigin || 'N/A';
      const idaAeroportoOrigem = ticket?.departureAirport || 'N/A';
      const idaCidadeDestino = ticket?.departureCityDestination || 'N/A';
      const idaAeroportoDestino = ticket?.destinationAirport || 'N/A';
      const idaData = ticket?.actualDepartureDate ? formatDate(ticket.actualDepartureDate) : dataVooIda;
      const idaHorario = ticket?.actualDepartureTime || horarioSugeridoIda;

      const voltaCidadeOrigem = ticket?.returnCityOrigin || 'N/A';
      const voltaAeroportoOrigem = ticketAny?.returnOriginAirport || 'N/A';
      const voltaCidadeDestino = ticket?.returnCityDestination || 'N/A';
      const voltaAeroportoDestino = ticketAny?.returnDestinationAirport || 'N/A';
      const voltaData = ticket?.actualReturnDate ? formatDate(ticket.actualReturnDate) : dataVooVolta;
      const voltaHorario = ticket?.actualReturnTime || horarioSugeridoVolta;

      return {
        'ID': `#${inclusion.inclusionNumber || 'N/A'}`,
        'Evento': event?.name || 'N/A',
        'Local do Evento': event?.location || 'N/A',
        'Início do Evento': event?.startDate ? formatDate(event.startDate) : 'N/A',
        'Fim do Evento': event?.endDate ? formatDate(event.endDate) : 'N/A',
        'Função': func?.name || 'N/A',
        'Área': inclusion.area || 'N/A',
        'Colaborador': fixEncoding(collaborator?.fullName) || 'Não escalado',
        'Tipo': collaborator?.type ? (collaborator.type === 'local' ? 'CASA' : collaborator.type.toUpperCase()) : 'N/A',
        'CPF Colaborador': cpfColaborador,
        'Data Nascimento': collaborator?.birthDate ? formatDate(collaborator.birthDate) : 'N/A',
        'Telefone Colaborador': collaborator?.phone || 'N/A',
        'Cidade Colaborador': collaborator?.city || 'N/A',
        'Período Agendado - Início': inclusion.scheduleStartDate ? formatDate(inclusion.scheduleStartDate) : 'N/A',
        'Período Agendado - Fim': inclusion.scheduleEndDate ? formatDate(inclusion.scheduleEndDate) : 'N/A',
        'Período Real - Início': inclusion.actualStartDate ? formatDate(inclusion.actualStartDate) : 'N/A',
        'Período Real - Fim': inclusion.actualEndDate ? formatDate(inclusion.actualEndDate) : 'N/A',
        'Precisa Passagem': inclusion.needsTicket ? 'Sim' : 'Não',
        'Tipo de Transporte': tipoTransporte,
        'Passagem LOC': passagemLoc,
        'Passagem Data Compra': passagemDataCompra,
        'Passagem Valor (R$)': passagemValor,
        'Ida - Cidade Origem': idaCidadeOrigem,
        'Ida - Aeroporto Origem': idaAeroportoOrigem,
        'Ida - Cidade Destino': idaCidadeDestino,
        'Ida - Aeroporto Destino': idaAeroportoDestino,
        'Ida - Data': idaData,
        'Ida - Horário': idaHorario,
        'Horário Sugerido Ida': horarioSugeridoIda,
        'Volta - Cidade Origem': voltaCidadeOrigem,
        'Volta - Aeroporto Origem': voltaAeroportoOrigem,
        'Volta - Cidade Destino': voltaCidadeDestino,
        'Volta - Aeroporto Destino': voltaAeroportoDestino,
        'Volta - Data': voltaData,
        'Volta - Horário': voltaHorario,
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
      { wch: 12 },  // Tipo
      { wch: 18 },  // CPF
      { wch: 15 },  // Data Nascimento
      { wch: 15 },  // Telefone
      { wch: 20 },  // Cidade
      { wch: 18 },  // Período Agendado - Início
      { wch: 18 },  // Período Agendado - Fim
      { wch: 18 },  // Período Real - Início
      { wch: 18 },  // Período Real - Fim
      { wch: 15 },  // Precisa Passagem
      { wch: 16 },  // Tipo de Transporte
      { wch: 15 },  // Passagem LOC
      { wch: 18 },  // Passagem Data Compra
      { wch: 18 },  // Passagem Valor
      { wch: 20 },  // Ida - Cidade Origem
      { wch: 18 },  // Ida - Aeroporto Origem
      { wch: 20 },  // Ida - Cidade Destino
      { wch: 18 },  // Ida - Aeroporto Destino
      { wch: 15 },  // Ida - Data
      { wch: 12 },  // Ida - Horário
      { wch: 18 },  // Horário Sugerido Ida
      { wch: 20 },  // Volta - Cidade Origem
      { wch: 18 },  // Volta - Aeroporto Origem
      { wch: 20 },  // Volta - Cidade Destino
      { wch: 18 },  // Volta - Aeroporto Destino
      { wch: 15 },  // Volta - Data
      { wch: 12 },  // Volta - Horário
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

  const markInclusionSwapSeen = (inclusionId: string) => {
    if (!user) return;
    const swap = allSwapRequests?.find(s => {
      const inclId = (s as any).team_inclusion_id || s.teamInclusionId;
      return inclId === inclusionId;
    });
    if (!swap) return;
    const requestedBy = (swap as any).requested_by || swap.requestedBy;
    if (requestedBy === user.id) {
      if (swap.status === 'pendente') markSwapSeen(user.id, swap.id, 'pending');
      else if (['aprovado', 'rejeitado'].includes(swap.status)) markSwapSeen(user.id, swap.id, 'responded');
    }
  };

  const handleRowClick = (inclusion: TeamInclusion) => {
    setSelectedInclusion(inclusion);
    setModalData({
      collaboratorId: inclusion.collaboratorId || "",
      observations: inclusion.observations || "",
      dailyValue: 0,
    });
    setShowModal(true);
    markInclusionSwapSeen(inclusion.id);
  };

  const handleViewComments = (e: React.MouseEvent, inclusion: TeamInclusion) => {
    e.stopPropagation();
    setSelectedInclusion(inclusion);
    setModalData({
      collaboratorId: inclusion.collaboratorId || "",
      observations: inclusion.observations || "",
      dailyValue: 0,
    });
    setShowModal(true);
    markInclusionSwapSeen(inclusion.id);
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

    // Se não precisa de passagem nem hospedagem → vai direto para aprovação de Compras
    const noLogistics = !selectedInclusion.needsTicket && !selectedInclusion.needsAccommodation;
    const nextStatus = noLogistics ? "aprovacao" : "escalado";
    const nextPhase = noLogistics ? "aprovacao" : "escalacao";

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
    setModalActiveTab("resumo");
    setShowAllLogs(false);
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
        showTicketFilter={true}
        showAccommodationFilter={true}
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
      />


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
            const withoutTicketBase = scalingInclusions.filter(inclusion => !inclusion.needsTicket);
            const withTicketBase = scalingInclusions.filter(inclusion => inclusion.needsTicket);
            const withoutTicket = showOnlyPendingSwaps
              ? withoutTicketBase.filter(inclusion => pendingSwapByInclusion.has(inclusion.id))
              : withoutTicketBase;
            const withTicket = showOnlyPendingSwaps
              ? withTicketBase.filter(inclusion => pendingSwapByInclusion.has(inclusion.id))
              : withTicketBase;
            
            // Count pending escalations (excluding canceled ones)
            const withoutTicketPending = withoutTicket.filter(inclusion => !isEscalated(inclusion) && inclusion.status !== "cancelado").length;
            const withTicketPending = withTicket.filter(inclusion => !isEscalated(inclusion) && inclusion.status !== "cancelado").length;
            
            return (
              <Tabs value={scalingTab} onValueChange={setScalingTab} className="w-full">
                {pendingSwapInclusionsInView.length > 0 && (
                  <div className="mb-3 flex items-center gap-3 rounded-xl border border-purple-200 bg-purple-50 px-4 py-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                      <ArrowLeftRight className="w-4 h-4 text-purple-600" />
                    </div>
                    <p className="text-[13px] font-medium text-purple-800 flex-1 min-w-0">
                      {pendingSwapInclusionsInView.length === 1
                        ? "1 solicitação de troca de colaborador aguardando análise"
                        : `${pendingSwapInclusionsInView.length} solicitações de troca de colaborador aguardando análise`}
                    </p>
                    {showOnlyPendingSwaps ? (
                      <button
                        type="button"
                        onClick={() => setShowOnlyPendingSwaps(false)}
                        className="shrink-0 text-[12px] font-semibold text-purple-700 hover:text-purple-900 underline underline-offset-2"
                        data-testid="button-clear-pending-swaps"
                      >
                        Mostrar todos
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={goToPendingSwaps}
                        className="shrink-0 rounded-lg bg-purple-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-purple-700 transition-colors"
                        data-testid="button-show-pending-swaps"
                      >
                        Ver trocas pendentes
                      </button>
                    )}
                  </div>
                )}
                <TabsList className="grid grid-cols-2 gap-4 h-auto bg-transparent p-0 w-full mb-2">
                  {/* Card: Sem Passagem */}
                  <TabsTrigger
                    value="without-ticket"
                    disabled={withoutTicket.length === 0}
                    className="group relative overflow-hidden rounded-2xl border-2 border-slate-200 bg-white hover:border-orange-200 hover:bg-orange-50/20 data-[state=active]:border-[#F97316] data-[state=active]:bg-orange-50/60 data-[state=active]:shadow-lg data-[state=active]:shadow-orange-100 transition-all duration-200 disabled:opacity-40 text-left p-0 h-auto"
                  >
                    {/* Faixa superior — só aparece quando ativo */}
                    <div className="absolute top-0 inset-x-0 h-[3px] bg-[#F97316] rounded-t-[14px] opacity-0 group-data-[state=active]:opacity-100 transition-opacity duration-200" />
                    {/* Checkmark */}
                    <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[#F97316] items-center justify-center shadow hidden group-data-[state=active]:flex">
                      <Check className="w-3 h-3 text-white" strokeWidth={3.5} />
                    </span>
                    <div className="flex items-center gap-3.5 px-4 pt-4 pb-4">
                      <div className="w-10 h-10 rounded-xl bg-orange-100 group-data-[state=active]:bg-orange-200/60 flex items-center justify-center shrink-0 transition-colors duration-200">
                        <Clock className="w-[18px] h-[18px] text-[#F97316]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h3 className="text-[14px] font-bold text-slate-800 leading-tight">Sem Passagem</h3>
                          <span className="px-2 py-0.5 rounded-full bg-orange-100 text-[#F97316] text-[11px] font-black tabular-nums group-data-[state=active]:bg-orange-200/70">
                            {withoutTicket.length}
                          </span>
                        </div>
                        <p className="text-[11px] font-medium leading-tight text-orange-400 group-[&:not([data-state=active])]:text-slate-400">
                          {withoutTicketPending > 0 && filters.escalationStatus !== "pending"
                            ? `${withoutTicketPending} pendente${withoutTicketPending !== 1 ? 's' : ''} de escalação`
                            : 'Nenhum pendente'}
                        </p>
                      </div>
                    </div>
                  </TabsTrigger>

                  {/* Card: Com Passagem */}
                  <TabsTrigger
                    value="with-ticket"
                    disabled={withTicket.length === 0}
                    className="group relative overflow-hidden rounded-2xl border-2 border-slate-200 bg-white hover:border-green-200 hover:bg-green-50/20 data-[state=active]:border-[#16A34A] data-[state=active]:bg-green-50/60 data-[state=active]:shadow-lg data-[state=active]:shadow-green-100 transition-all duration-200 disabled:opacity-40 text-left p-0 h-auto"
                  >
                    {/* Faixa superior — só aparece quando ativo */}
                    <div className="absolute top-0 inset-x-0 h-[3px] bg-[#16A34A] rounded-t-[14px] opacity-0 group-data-[state=active]:opacity-100 transition-opacity duration-200" />
                    {/* Checkmark */}
                    <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[#16A34A] items-center justify-center shadow hidden group-data-[state=active]:flex">
                      <Check className="w-3 h-3 text-white" strokeWidth={3.5} />
                    </span>
                    <div className="flex items-center gap-3.5 px-4 pt-4 pb-4">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 group-data-[state=active]:bg-green-100 flex items-center justify-center shrink-0 transition-colors duration-200 text-[15px]">✈️</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h3 className="text-[14px] font-bold text-slate-800 leading-tight">Com Transporte</h3>
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-black tabular-nums group-data-[state=active]:bg-green-100 group-data-[state=active]:text-green-700 transition-colors duration-200">
                            {withTicket.length}
                          </span>
                        </div>
                        <p className="text-[11px] font-medium text-slate-400 leading-tight">Aéreo · Rodoviário · Van</p>
                        <p className="text-[11px] font-medium text-green-500 group-[&:not([data-state=active])]:text-slate-400 leading-tight">
                          {withTicketPending > 0 && filters.escalationStatus !== "pending"
                            ? `${withTicketPending} pendente${withTicketPending !== 1 ? 's' : ''} de escalação`
                            : 'Todos escalados'}
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
                                className={`group/row transition-colors cursor-pointer ${rowIdx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'} hover:bg-blue-50/50 ${inclusion.status === 'cancelado' ? 'opacity-50' : ''}`}
                                onClick={() => handleRowClick(inclusion)}
                              >
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-bold text-[#2563EB] bg-blue-50 px-2.5 py-1 rounded-lg font-mono border border-blue-100">
                                      #{inclusion.inclusionNumber || 'N/A'}
                                    </span>
                                    <button
                                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 bg-slate-50 border border-slate-200 hover:bg-[#2563EB] hover:text-white hover:border-[#2563EB] transition-all duration-150"
                                      onClick={(e) => handleViewComments(e, inclusion)}
                                      title="Ver detalhes"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="text-[13px] font-bold text-slate-800 leading-tight">
                                    {getFunctionName(inclusion.functionId)}
                                  </div>
                                  <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md bg-blue-50 text-[#2563EB] text-[10px] font-semibold border border-blue-100/80">
                                    <CalendarDays className="w-2.5 h-2.5 shrink-0" />
                                    <span className="break-words truncate max-w-[200px]">{getEventName(inclusion.eventId)}</span>
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  {inclusion.collaboratorId ? (() => {
                                    const name = getCollaboratorName(inclusion.collaboratorId);
                                    const parts = name.trim().split(/\s+/);
                                    const ini = parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
                                    return (
                                      <div className="flex items-center gap-2">
                                        <div className="w-7 h-7 rounded-lg bg-[#2563EB] text-white flex items-center justify-center text-[10px] font-black shrink-0">{ini}</div>
                                        <span className="text-[12px] font-medium text-slate-700 leading-snug">{name}</span>
                                      </div>
                                    );
                                  })() : (
                                    <div className="flex items-center gap-2">
                                      <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0">N/E</div>
                                      <span className="text-[12px] italic text-slate-400">Não escalado</span>
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="text-[12px] font-semibold text-slate-800 whitespace-nowrap">
                                    {formatDateRange(inclusion.scheduleStartDate, inclusion.scheduleEndDate)}
                                  </div>
                                  <div className="text-[11px] text-slate-400 mt-0.5">
                                    {formatDiarias(inclusion.dailyRates)}
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex flex-col gap-1.5">
                                    {/* Status da escalação */}
                                    <div>
                                      {inclusion.status === "cancelado" ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold">
                                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />Cancelado
                                        </span>
                                      ) : isEscalated(inclusion) ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold">
                                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />Escalado
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 text-[10px] font-bold">
                                          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />Pendente
                                        </span>
                                      )}
                                    </div>
                                    {/* Status do transporte e hospedagem */}
                                    <div className="flex flex-wrap gap-1">
                                      {(() => {
                                        const ticket = getTicket(inclusion.id);
                                        if (!ticket) return null;
                                        if (ticket.transportType === 'van') return (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-semibold border border-blue-100">
                                            🚐 Van
                                          </span>
                                        );
                                        if (ticket.transportType === 'rodoviario') return (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-semibold border border-blue-100">
                                            <Bus className="w-2.5 h-2.5" />Rodoviária
                                          </span>
                                        );
                                        return (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-semibold border border-blue-100">
                                            <Plane className="w-2.5 h-2.5" />Passagem
                                          </span>
                                        );
                                      })()}
                                      {(() => {
                                        const accommodation = getAccommodation(inclusion.id);
                                        const accommodationInfo = formatAccommodationInfo(accommodation);
                                        return accommodationInfo && (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 text-[10px] font-semibold border border-purple-100">
                                            🏨 Hotel{accommodationInfo.hasAttachments && ' 📎'}
                                          </span>
                                        );
                                      })()}
                                      {(() => {
                                        const swap = pendingSwapByInclusion.get(inclusion.id);
                                        if (!swap) return null;
                                        if (seenSwapIds.has(swap.id)) return null;
                                        const requestedBy = (swap as any).requested_by || swap.requestedBy;
                                        const isAdminOrPurchasing = user?.role && ['admin', 'administrator', 'administrador', 'purchasing'].includes(user.role);
                                        const noLogistics = !inclusion.needsTicket && !inclusion.needsAccommodation;
                                        // Compras/admin vê badge em escalações sem passagem/hospedagem; demais apenas se for o solicitante
                                        if (!isAdminOrPurchasing && requestedBy !== user?.id) return null;
                                        if (isAdminOrPurchasing && !noLogistics && requestedBy !== user?.id) return null;
                                        return (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 text-[10px] font-bold border border-amber-200">
                                            <ArrowLeftRight className="w-2.5 h-2.5" />Troca pendente
                                          </span>
                                        );
                                      })()}
                                    </div>
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
                                className={`group/row transition-colors cursor-pointer ${rowIdx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'} hover:bg-blue-50/50 ${inclusion.status === 'cancelado' ? 'opacity-50' : ''}`}
                                onClick={() => handleRowClick(inclusion)}
                              >
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-bold text-[#2563EB] bg-blue-50 px-2.5 py-1 rounded-lg font-mono border border-blue-100">
                                      #{inclusion.inclusionNumber || 'N/A'}
                                    </span>
                                    <button
                                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 bg-slate-50 border border-slate-200 hover:bg-[#2563EB] hover:text-white hover:border-[#2563EB] transition-all duration-150"
                                      onClick={(e) => handleViewComments(e, inclusion)}
                                      title="Ver detalhes"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="text-[13px] font-bold text-slate-800 leading-tight">
                                    {getFunctionName(inclusion.functionId)}
                                  </div>
                                  <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md bg-blue-50 text-[#2563EB] text-[10px] font-semibold border border-blue-100/80">
                                    <CalendarDays className="w-2.5 h-2.5 shrink-0" />
                                    <span className="break-words truncate max-w-[200px]">{getEventName(inclusion.eventId)}</span>
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  {inclusion.collaboratorId ? (() => {
                                    const name = getCollaboratorName(inclusion.collaboratorId);
                                    const parts = name.trim().split(/\s+/);
                                    const ini = parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
                                    return (
                                      <div className="flex items-center gap-2">
                                        <div className="w-7 h-7 rounded-lg bg-[#2563EB] text-white flex items-center justify-center text-[10px] font-black shrink-0">{ini}</div>
                                        <span className="text-[12px] font-medium text-slate-700 leading-snug">{name}</span>
                                      </div>
                                    );
                                  })() : (
                                    <div className="flex items-center gap-2">
                                      <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0">N/E</div>
                                      <span className="text-[12px] italic text-slate-400">Não escalado</span>
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="text-[12px] font-semibold text-slate-800 whitespace-nowrap">
                                    {formatDateRange(inclusion.scheduleStartDate, inclusion.scheduleEndDate)}
                                  </div>
                                  <div className="text-[11px] text-slate-400 mt-0.5">
                                    {formatDiarias(inclusion.dailyRates)}
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex flex-col gap-1.5">
                                    {/* Status da escalação */}
                                    <div>
                                      {inclusion.status === "cancelado" ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold">
                                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />Cancelado
                                        </span>
                                      ) : isEscalated(inclusion) ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold">
                                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />Escalado
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 text-[10px] font-bold">
                                          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />Pendente
                                        </span>
                                      )}
                                    </div>
                                    {/* Status do transporte e hospedagem */}
                                    <div className="flex flex-wrap gap-1">
                                      {(() => {
                                        const ticket = getTicket(inclusion.id);
                                        if (!ticket) return null;
                                        if (ticket.transportType === 'van') return (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-semibold border border-blue-100">
                                            🚐 Van
                                          </span>
                                        );
                                        if (ticket.transportType === 'rodoviario') return (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-semibold border border-blue-100">
                                            <Bus className="w-2.5 h-2.5" />Rodoviária
                                          </span>
                                        );
                                        return (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-semibold border border-blue-100">
                                            <Plane className="w-2.5 h-2.5" />Passagem
                                          </span>
                                        );
                                      })()}
                                      {(() => {
                                        const accommodation = getAccommodation(inclusion.id);
                                        const accommodationInfo = formatAccommodationInfo(accommodation);
                                        return accommodationInfo && (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 text-[10px] font-semibold border border-purple-100">
                                            🏨 Hotel{accommodationInfo.hasAttachments && ' 📎'}
                                          </span>
                                        );
                                      })()}
                                      {(() => {
                                        const swap = pendingSwapByInclusion.get(inclusion.id);
                                        if (!swap) return null;
                                        const requestedBy = (swap as any).requested_by || swap.requestedBy;
                                        if (requestedBy !== user?.id) return null;
                                        if (seenSwapIds.has(swap.id)) return null;
                                        return (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 text-[10px] font-bold border border-amber-200">
                                            <ArrowLeftRight className="w-2.5 h-2.5" />Troca pendente
                                          </span>
                                        );
                                      })()}
                                    </div>
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

      {/* Modal de Detalhes da Escalação — redesenhado com abas */}
      <Dialog open={showModal} onOpenChange={setShowModal} modal={!showSuccessModal}>
        <DialogContent className="!max-w-[1180px] w-[95vw] max-h-[88vh] !flex !flex-col p-0 gap-0 overflow-hidden">
          {/* ── Header ── */}
          <div className="px-6 pt-5 pb-4 border-b border-slate-100 shrink-0 flex items-center gap-4 pr-14" style={{ background: 'linear-gradient(to right, #f8faff 0%, #ffffff 60%)' }}>
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center text-white shrink-0"
              style={{ background: 'linear-gradient(135deg, #3b7ef8 0%, #1d4ed8 100%)', boxShadow: '0 4px 16px #2563EB30' }}
            >
              <Users style={{ width: 20, height: 20 }} />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-[17px] font-bold text-slate-900 leading-tight m-0 p-0">
                Detalhes da Escalação
              </DialogTitle>
              <div className="text-[12px] text-slate-400 mt-0.5 truncate">
                <span className="font-mono font-bold text-slate-500">#{selectedInclusion?.inclusionNumber || 'N/A'}</span>
                <span className="mx-1.5 text-slate-300">·</span>
                {selectedInclusion ? getCollaboratorName(selectedInclusion.collaboratorId) : ''}
              </div>
            </div>
            {selectedInclusion && (
              selectedInclusion.status === 'cancelado' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-500 text-[11px] font-bold rounded-full shrink-0 border border-slate-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />Cancelado
                </span>
              ) : isEscalated(selectedInclusion) ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 text-[11px] font-bold rounded-full shrink-0 border border-green-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />Escalado
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-orange-600 text-[11px] font-bold rounded-full shrink-0 border border-orange-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />Pendente
                </span>
              )
            )}
          </div>

          {selectedInclusion && (() => {
            const accommodation = getAccommodation(selectedInclusion.id);
            const tabTrigger = "relative rounded-none border-b-2 border-transparent data-[state=active]:border-[#2563EB] data-[state=active]:text-[#2563EB] text-slate-500 bg-transparent data-[state=active]:bg-transparent px-4 pb-3 pt-2 text-sm font-medium shadow-none hover:text-slate-700 transition-colors";
            const lbl = "text-[10px] uppercase tracking-[0.12em] text-slate-400 font-black mb-1";
            const val = "text-[13px] font-semibold text-slate-700";
            const renderAttachments = (ids: string[] | null | undefined, label: string) => {
              if (!ids || ids.length === 0) {
                return (
                  <div className="flex items-center gap-2.5 py-3 px-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                    <File className="w-4 h-4 text-slate-300" />
                    <span className="text-sm text-slate-400">Nenhum anexo disponível.</span>
                  </div>
                );
              }
              return (
                <div className="space-y-2">
                  {ids.map((attachmentId, index) => (
                    <div
                      key={attachmentId}
                      className="flex items-center gap-3 bg-white border border-slate-200 hover:border-[#2563EB] hover:bg-blue-50 rounded-xl px-4 py-3 cursor-pointer transition-all group"
                      onClick={() => openAttachment(attachmentId, `${label} ${index + 1}`)}
                    >
                      <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4 text-[#2563EB]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold text-slate-700">{label} {index + 1}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">Documento anexado · clique para visualizar</div>
                      </div>
                      <Eye className="w-4 h-4 text-slate-300 group-hover:text-[#2563EB] transition-colors flex-shrink-0" />
                    </div>
                  ))}
                </div>
              );
            };
            return (
              <>
                {/* ── Abas ── */}
                <Tabs value={modalActiveTab} onValueChange={setModalActiveTab} className="flex-1 flex flex-col overflow-hidden min-h-0">
                  <div className="px-6 border-b border-slate-100 shrink-0">
                    <TabsList className="bg-transparent p-0 h-auto gap-0 rounded-none -mb-px">
                      <TabsTrigger value="resumo" className={tabTrigger}>Resumo</TabsTrigger>
                      <TabsTrigger value="passagem" className={tabTrigger}>
                        Passagem
                        {selectedTicket
                          ? <span className="ml-1.5 bg-green-100 text-green-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">✓</span>
                          : selectedInclusion.needsTicket
                            ? <span className="ml-1.5 bg-amber-100 text-amber-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">!</span>
                            : null}
                      </TabsTrigger>
                      <TabsTrigger value="hospedagem" className={tabTrigger}>
                        Hospedagem
                        {accommodation
                          ? <span className="ml-1.5 bg-green-100 text-green-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">✓</span>
                          : selectedInclusion.needsAccommodation
                            ? <span className="ml-1.5 bg-amber-100 text-amber-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">!</span>
                            : null}
                      </TabsTrigger>
                      <TabsTrigger value="comentarios" className={tabTrigger}>
                        Comentários e Histórico
                        {comments && comments.length > 0 && (
                          <span className="ml-1.5 bg-[#2563EB] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{comments.length}</span>
                        )}
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  {/* Área de conteúdo das abas */}
                  <div className="flex-1 overflow-y-auto min-h-0">

                    {/* ══ ABA: RESUMO ══ */}
                    <TabsContent value="resumo" className="m-0 p-6">
                      <div className="grid grid-cols-3 gap-5">

                        {/* Col 1: Informações Básicas */}
                        <div className="space-y-4">
                          <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 space-y-3">
                            <div>
                              <div className={lbl}>Evento</div>
                              <div className="text-[13px] font-semibold text-[#2563EB] leading-snug">{getEventName(selectedInclusion.eventId)}</div>
                            </div>
                            <div>
                              <div className={lbl}>ID</div>
                              <div className="text-[13px] font-bold text-slate-700 font-mono">#{selectedInclusion.inclusionNumber || 'N/A'}</div>
                            </div>
                            <div>
                              <div className={lbl}>Função</div>
                              <div className={val}>{getFunctionName(selectedInclusion.functionId)}</div>
                            </div>
                            <div>
                              <div className={lbl}>Status</div>
                              {selectedInclusion.status === 'cancelado' ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-500 text-[11px] font-bold rounded-full">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />Cancelado
                                </span>
                              ) : selectedInclusion.status === 'aprovacao' ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-100 text-blue-700 text-[11px] font-bold rounded-full">
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />Aguardando aprovação
                                </span>
                              ) : selectedInclusion.status === 'aprovado' ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 text-emerald-700 text-[11px] font-bold rounded-full">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Aprovado
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
                            {(selectedInclusion.needsTicket || selectedInclusion.needsAccommodation) && (
                              <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
                                {selectedInclusion.needsTicket && (
                                  selectedTicket ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-lg border border-blue-100">
                                      <Plane style={{ width: 9, height: 9 }} />Passagem registrada
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-600 text-[10px] font-bold rounded-lg border border-amber-200">
                                      <Plane style={{ width: 9, height: 9 }} />Passagem pendente
                                    </span>
                                  )
                                )}
                                {selectedInclusion.needsAccommodation && (
                                  accommodation ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-50 text-purple-700 text-[10px] font-bold rounded-lg border border-purple-100">
                                      🏨 Hospedagem registrada
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-600 text-[10px] font-bold rounded-lg border border-amber-200">
                                      🏨 Hospedagem pendente
                                    </span>
                                  )
                                )}
                              </div>
                            )}
                            {(() => {
                              const isAdminOrPurchasing = user?.role && ['admin', 'administrator', 'administrador', 'purchasing'].includes(user.role);
                              if (!isAdminOrPurchasing) return null;
                              if (!pendingSwap) return null;
                              return (
                                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
                                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-600 text-[10px] font-bold rounded-lg border border-amber-200">
                                    <ArrowLeftRight style={{ width: 9, height: 9 }} />Troca pendente
                                  </span>
                                </div>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Col 2: Colaborador */}
                        <div className="space-y-4">
                          <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-1.5">
                              <span className={lbl} style={{marginBottom:0}}>Colaborador <span className="text-red-400">*</span></span>
                              {(() => {
                                const ticketPurchased = selectedInclusion.needsTicket
                                  ? tickets?.some(t => t.teamInclusionId === selectedInclusion.id && t.purchaseDate !== null) : false;
                                const accommodationReserved = selectedInclusion.needsAccommodation
                                  ? accommodations?.some(a => a.teamInclusionId === selectedInclusion.id) : false;
                                const blocked = !canEditCollaborator(selectedInclusion);
                                const blockReason = ticketPurchased && accommodationReserved
                                  ? "passagem comprada e hospedagem reservada"
                                  : ticketPurchased ? "passagem já comprada"
                                  : accommodationReserved ? "hospedagem já reservada"
                                  : null;
                                return (
                                  <div className="relative group inline-flex items-center">
                                    <HelpCircle className="w-3.5 h-3.5 text-slate-400 hover:text-[#2563EB] cursor-help transition-colors" />
                                    <div className="pointer-events-none absolute left-0 top-6 z-[9999] w-72 bg-slate-800 text-white rounded-xl px-4 py-3 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity">
                                      <div className="absolute left-3 -top-1.5 border-[6px] border-transparent border-b-slate-800" />
                                      <div className="text-[12px] font-bold text-white mb-1.5">Troca de colaborador</div>
                                      <div className="text-[11px] text-slate-300 leading-relaxed">
                                        A alteração é liberada enquanto não houver passagem comprada ou hospedagem reservada vinculada a esta escalação.
                                      </div>
                                      {blocked && blockReason && (
                                        <div className="mt-2 pt-2 border-t border-slate-600 text-[11px] text-amber-300 font-medium">
                                          Bloqueio atual: {blockReason}.
                                        </div>
                                      )}
                                      {blocked && !blockReason && (
                                        <div className="mt-2 pt-2 border-t border-slate-600 text-[11px] text-amber-300 font-medium">
                                          Você não tem permissão para alterar nesta escalação.
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}
                              </div>
                              {/* Badge tipo do colaborador — lado direito do header */}
                              {(() => {
                                const collab = collaborators?.find(c => c.id === (modalData.collaboratorId || selectedInclusion.collaboratorId));
                                if (!collab) return null;
                                const typeMap: Record<string, { label: string; cls: string }> = {
                                  casa:   { label: 'Casa',   cls: 'bg-blue-50 text-blue-700 border-blue-100' },
                                  freela: { label: 'Freela', cls: 'bg-violet-50 text-violet-700 border-violet-100' },
                                  local:  { label: 'Local',  cls: 'bg-orange-50 text-orange-700 border-orange-100' },
                                };
                                const t = typeMap[collab.type] ?? { label: collab.type ?? '—', cls: 'bg-slate-100 text-slate-600 border-slate-200' };
                                return (
                                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border shrink-0 ${t.cls}`}>
                                    {t.label}
                                  </span>
                                );
                              })()}
                            </div>
                            {(!canEditCollaborator(selectedInclusion) || isEscalationConfirmed(selectedInclusion)) ? (
                              <div className="space-y-2">
                                <div className="border border-slate-200 rounded-xl bg-white px-3 py-2.5">
                                  <div className="text-sm font-medium text-slate-700">{getCollaboratorName(modalData.collaboratorId)}</div>
                                </div>
                                {/* Card de status de troca */}
                                {(() => {
                                  const swap = pendingSwap || (latestSwap && ['rejeitado', 'aprovado'].includes(latestSwap.status) ? latestSwap : null);
                                  if (!swap) return null;

                                  const isAdminOrPurchasing = user?.role && ['admin', 'administrator', 'administrador', 'purchasing'].includes(user.role);
                                  const canCancel = swap.status === 'pendente' && (isAdminOrPurchasing || (swap as any).requested_by === user?.id);

                                  const variants: Record<string, { bg: string; border: string; icon: React.ReactNode; title: string; badge: string; badgeClass: string; msg: string; textColor: string }> = {
                                    pendente: {
                                      bg: 'bg-amber-50/80', border: 'border-amber-200',
                                      icon: <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />,
                                      title: 'Troca solicitada', badge: 'Aguardando aprovação',
                                      badgeClass: 'bg-amber-100 text-amber-700 border-amber-200',
                                      msg: 'O colaborador atual será mantido até a aprovação.',
                                      textColor: 'text-slate-700',
                                    },
                                    aprovado: {
                                      bg: 'bg-green-50/80', border: 'border-green-200',
                                      icon: <Check className="w-3.5 h-3.5 text-green-600 shrink-0" />,
                                      title: 'Troca aprovada', badge: 'Aprovada por Compras',
                                      badgeClass: 'bg-green-100 text-green-700 border-green-200',
                                      msg: 'A alteração do colaborador foi liberada.',
                                      textColor: 'text-slate-700',
                                    },
                                    rejeitado: {
                                      bg: 'bg-red-50/70', border: 'border-red-200',
                                      icon: <X className="w-3.5 h-3.5 text-red-500 shrink-0" />,
                                      title: 'Troca recusada', badge: 'Reprovada por Compras',
                                      badgeClass: 'bg-red-100 text-red-700 border-red-200',
                                      msg: 'A escala permanece com o colaborador atual.',
                                      textColor: 'text-slate-700',
                                    },
                                  };

                                  const v = variants[swap.status] || variants.pendente;

                                  const reviewedAt = (swap as any).reviewed_at || swap.reviewedAt;
                                  const reviewedByName = (swap as any).reviewed_by_name || swap.reviewedByName;
                                  const currentCollabName = getCollaboratorName((swap as any).current_collaborator_id || (swap as any).currentCollaboratorId);
                                  const newCollabName = getCollaboratorName((swap as any).new_collaborator_id || (swap as any).newCollaboratorId);
                                  const isResolved = swap.status === 'aprovado' || swap.status === 'rejeitado';

                                  return (
                                    <div className={`rounded-xl border ${v.border} ${v.bg} px-3 py-2.5 space-y-2`}>
                                      {/* Cabeçalho */}
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-1.5">
                                          {v.icon}
                                          <span className={`text-[12px] font-semibold ${v.textColor}`}>{v.title}</span>
                                        </div>
                                        <span className={`text-[10px] font-medium border rounded-full px-2 py-px leading-tight ${v.badgeClass}`}>{v.badge}</span>
                                      </div>

                                      {/* Prova da alteração (aprovado/rejeitado) */}
                                      {isResolved ? (
                                        <div className="bg-white/70 rounded-lg border border-slate-100 p-2 space-y-1.5">
                                          {/* Mudança de colaborador */}
                                          <div className="flex items-center gap-1.5 text-[11px]">
                                            <span className="text-slate-500 line-through">{currentCollabName || '—'}</span>
                                            <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                                            <span className={`font-semibold ${swap.status === 'aprovado' ? 'text-green-700' : 'text-slate-500'}`}>{newCollabName || '—'}</span>
                                          </div>
                                          {/* Quem resolveu e quando */}
                                          {reviewedByName && (
                                            <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                              <Check className="w-2.5 h-2.5 shrink-0" />
                                              <span>{swap.status === 'aprovado' ? 'Aprovado' : 'Recusado'} por <span className="font-medium text-slate-600">{reviewedByName}</span>
                                              {reviewedAt && <> · {new Date(reviewedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</>}
                                              </span>
                                            </div>
                                          )}
                                          {/* Motivo da solicitação */}
                                          <div className="flex items-start gap-1 text-[10px] text-slate-400">
                                            <span className="shrink-0">Motivo:</span>
                                            <span className="text-slate-500 leading-snug">{swap.reason}</span>
                                          </div>
                                          {/* Comentário de revisão */}
                                          {(swap as any).review_comment && (
                                            <div className="flex items-start gap-1 text-[10px] text-slate-400">
                                              <span className="shrink-0">Obs.:</span>
                                              <span className="text-slate-500 leading-snug italic">{(swap as any).review_comment}</span>
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="space-y-1">
                                          <p className="text-[10.5px] text-slate-500 leading-snug">Aguardando análise do time de Compras.</p>
                                          <div className="flex items-start gap-1.5 text-[11px]">
                                            <span className="text-slate-400 shrink-0">Novo colaborador:</span>
                                            <span className="font-medium text-slate-700">{newCollabName}</span>
                                          </div>
                                          <div className="flex items-start gap-1.5 text-[11px]">
                                            <span className="text-slate-400 shrink-0">Motivo:</span>
                                            <span className="text-slate-600 leading-snug">{swap.reason}</span>
                                          </div>
                                        </div>
                                      )}

                                      {/* Rodapé */}
                                      <div className="flex items-center justify-between pt-0.5">
                                        <p className="text-[10px] text-slate-400 italic leading-tight">{v.msg}</p>
                                        {canCancel && (
                                          <button
                                            type="button"
                                            onClick={() => setShowCancelSwapConfirm(true)}
                                            className="text-[10px] text-slate-400 hover:text-red-500 transition-colors underline underline-offset-2 shrink-0"
                                          >
                                            Cancelar solicitação
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })()}
                                {/* Botão Solicitar Troca — só aparece se escalado, tem colaborador, sem pendência */}
                                {isEscalationConfirmed(selectedInclusion) && selectedInclusion.collaboratorId && !pendingSwap && (
                                  <div className="space-y-1">
                                    <button
                                      type="button"
                                      title="Após aprovado pelo time de Compras, a alteração do colaborador será liberada."
                                      onClick={() => { setSwapNewCollaboratorId(""); setSwapReason(""); setShowSwapModal(true); }}
                                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50/60 text-blue-700 text-[12px] font-medium transition-all hover:bg-blue-100 hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-1 active:bg-blue-100"
                                    >
                                      <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
                                      Solicitar troca
                                    </button>
                                    <p className="text-center text-[10px] text-slate-400 leading-tight">Requer aprovação de Compras</p>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <CollaboratorCombobox
                                  collaborators={collaborators}
                                  value={modalData.collaboratorId}
                                  onValueChange={(value) => setModalData(prev => ({ ...prev, collaboratorId: value }))}
                                  placeholder="Selecione um colaborador"
                                  testId="select-collaborator-escalation"
                                  hideAll={true}
                                />
                                {/* Alerta de conflito de escalação */}
                                {(() => {
                                  if (!modalData.collaboratorId) return null;
                                  const { sameEvent, dateOverlap } = getCollaboratorConflicts(modalData.collaboratorId, selectedInclusion?.id);
                                  if (!sameEvent.length && !dateOverlap.length) return null;
                                  return (
                                    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                                      <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                                      <div className="text-[11px] text-amber-700 leading-snug">
                                        <span className="font-semibold">Colaborador já escalado</span>
                                        {sameEvent.length > 0 && <span> neste evento</span>}
                                        {sameEvent.length > 0 && dateOverlap.length > 0 && <span> e</span>}
                                        {dateOverlap.length > 0 && sameEvent.length === 0 && <span> em evento com datas sobrepostas</span>}
                                        {dateOverlap.length > 0 && sameEvent.length > 0 && <span> em datas sobrepostas</span>}
                                        .
                                      </div>
                                    </div>
                                  );
                                })()}
                                {/* Botão Solicitar Troca também no branch editável */}
                                {isEscalationConfirmed(selectedInclusion) && selectedInclusion.collaboratorId && !pendingSwap && (
                                  <div className="space-y-1">
                                    <button
                                      type="button"
                                      title="Após aprovado pelo time de Compras, a alteração do colaborador será liberada."
                                      onClick={() => { setSwapNewCollaboratorId(""); setSwapReason(""); setShowSwapModal(true); }}
                                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50/60 text-blue-700 text-[12px] font-medium transition-all hover:bg-blue-100 hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-1 active:bg-blue-100"
                                    >
                                      <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
                                      Solicitar troca
                                    </button>
                                    <p className="text-center text-[10px] text-slate-400 leading-tight">Requer aprovação de Compras</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Col 3: Período de Trabalho */}
                        <div>
                          <div className="border border-slate-200 rounded-2xl overflow-hidden">
                            <div className="bg-[#2563EB]/5 border-b border-slate-200 px-4 py-2.5 flex items-center gap-2">
                              <CalendarDays className="w-4 h-4 text-[#2563EB]" />
                              <span className="text-[11px] font-black text-[#2563EB] uppercase tracking-[0.12em]">Período de Trabalho</span>
                            </div>
                            <div className="p-4">
                              <div className="grid grid-cols-2 gap-3 mb-4">
                                <div>
                                  <div className={lbl}>Início</div>
                                  <div className={val}>{formatDateWithWeekday(selectedInclusion.scheduleStartDate)}</div>
                                </div>
                                <div>
                                  <div className={lbl}>Término</div>
                                  <div className={val}>{formatDateWithWeekday(selectedInclusion.scheduleEndDate)}</div>
                                </div>
                              </div>
                              {selectedInclusion.scheduleStartDate && selectedInclusion.scheduleEndDate && (() => {
                                const startDate = parseISO(selectedInclusion.scheduleStartDate);
                                const endDate = parseISO(selectedInclusion.scheduleEndDate);
                                const allDays = eachDayOfInterval({ start: startDate, end: endDate });
                                const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
                                return (
                                  <div>
                                    <div className={lbl + " mb-2"}>{allDays.length} {allDays.length === 1 ? 'dia' : 'dias'} no período</div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {allDays.map((day, index) => {
                                        const weekend = isWeekend(day);
                                        return (
                                          <div key={index} className={`flex flex-col items-center rounded-xl border text-center px-2 py-1.5 min-w-[40px] ${weekend ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-200'}`}>
                                            <div className={`text-[9px] uppercase font-bold ${weekend ? 'text-orange-400' : 'text-slate-400'}`}>
                                              {format(day, 'EEE', { locale: ptBR })}
                                            </div>
                                            <div className={`text-[15px] font-bold leading-tight ${weekend ? 'text-orange-600' : 'text-slate-700'}`}>
                                              {format(day, 'dd', { locale: ptBR })}
                                            </div>
                                            <div className={`text-[8px] ${weekend ? 'text-orange-300' : 'text-slate-300'}`}>
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
                        </div>

                      </div>

                      {/* Observações da escalação */}
                      {selectedInclusion.observations && (
                        <div className="mt-5">
                          <div className="border border-slate-200 rounded-2xl overflow-hidden">
                            <div className="bg-slate-50 border-b border-slate-100 px-4 py-2.5 flex items-center gap-2">
                              <MessageSquare className="w-4 h-4 text-slate-400" />
                              <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.12em]">Observações</span>
                            </div>
                            <div className="px-4 py-3">
                              <p className="text-[13px] text-slate-600 leading-relaxed whitespace-pre-line">{selectedInclusion.observations}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* ── Aprovação de Compras (sem passagem/hospedagem) ── */}
                      {(selectedInclusion.status === 'aprovacao' || selectedInclusion.status === 'escalado') &&
                        !selectedInclusion.needsTicket && !selectedInclusion.needsAccommodation && (
                        <div className="mt-5">
                          <div className="border border-blue-200 rounded-2xl overflow-hidden">
                            <div className="bg-blue-50 border-b border-blue-100 px-4 py-2.5 flex items-center gap-2">
                              <Check className="w-4 h-4 text-blue-600" />
                              <span className="text-[11px] font-black text-blue-700 uppercase tracking-[0.12em]">Aprovação de Compras</span>
                            </div>
                            <div className="p-4">
                              {(user?.role === 'purchasing' || user?.role === 'admin' || user?.role === 'administrator' || user?.role === 'administrador') ? (
                                <div className="space-y-3">
                                  <p className="text-[12px] text-slate-600 leading-relaxed">
                                    Esta escalação não requer passagem nem hospedagem. Revise as informações e aprove para liberar o colaborador.
                                  </p>
                                  <Button
                                    onClick={() => setShowApproveConfirm(true)}
                                    disabled={approveEscalationMutation.isPending}
                                    className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-9 text-[13px] font-semibold"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    {approveEscalationMutation.isPending ? "Aprovando..." : "Aprovar escalação"}
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-3 py-2">
                                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                                    <Clock className="w-4 h-4 text-blue-500" />
                                  </div>
                                  <div>
                                    <p className="text-[12px] font-semibold text-slate-700">Aguardando aprovação de Compras</p>
                                    <p className="text-[11px] text-slate-400 mt-0.5">O time de Compras precisa aprovar esta escalação.</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Seção de Anexos no Resumo */}
                      {(() => {
                        const ticketIds = selectedTicket?.attachmentIds || [];
                        const accommodationIds = accommodation?.attachmentIds || [];
                        const allAttachments = [
                          ...ticketIds.map(id => ({ id, label: 'Passagem' })),
                          ...accommodationIds.map(id => ({ id, label: 'Hospedagem' })),
                        ];
                        if (allAttachments.length === 0) return null;
                        const visible = allAttachments.slice(0, 3);
                        const hasMore = allAttachments.length > 3;
                        return (
                          <div className="mt-5">
                            <div className="border border-slate-200 rounded-2xl overflow-hidden">
                              <div className="bg-slate-50 border-b border-slate-100 px-4 py-2.5 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-slate-400" />
                                <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.12em]">Anexos</span>
                                <span className="bg-slate-200 text-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{allAttachments.length}</span>
                              </div>
                              <div className="p-4 space-y-2">
                                {visible.map(({ id, label }, index) => (
                                  <div
                                    key={id}
                                    className="flex items-center gap-3 bg-white border border-slate-200 hover:border-[#2563EB] hover:bg-blue-50 rounded-xl px-3 py-2.5 cursor-pointer transition-all group"
                                    onClick={() => openAttachment(id, `${label} · Anexo ${index + 1}`)}
                                  >
                                    <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
                                      <FileText className="w-3.5 h-3.5 text-[#2563EB]" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-[12px] font-semibold text-slate-700">{label} · Anexo {index + 1}</div>
                                      <div className="text-[10px] text-slate-400">Documento anexado</div>
                                    </div>
                                    <Eye className="w-3.5 h-3.5 text-slate-300 group-hover:text-[#2563EB] transition-colors flex-shrink-0" />
                                  </div>
                                ))}
                                {hasMore && (
                                  <button
                                    className="w-full text-center text-[12px] text-[#2563EB] font-semibold py-1.5 hover:bg-blue-50 rounded-lg transition-colors"
                                    onClick={() => setModalActiveTab('passagem')}
                                  >
                                    Ver todos os {allAttachments.length} anexos →
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </TabsContent>

                    {/* ══ ABA: PASSAGEM ══ */}
                    <TabsContent value="passagem" className="m-0 p-6">
                      {!selectedInclusion.needsTicket ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                          <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-dashed border-slate-200 flex items-center justify-center mb-3">
                            <Plane className="w-5 h-5 text-slate-300" />
                          </div>
                          <div className="text-[13px] font-semibold text-slate-500 mb-1">Sem passagem necessária</div>
                          <div className="text-[11px] text-slate-400">Esta escalação não requer passagem aérea, rodoviária ou van.</div>
                        </div>
                      ) : !selectedTicket ? (
                        <div className="space-y-4">
                          <div className="flex flex-col items-center justify-center py-8 text-center">
                            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-dashed border-amber-200 flex items-center justify-center mb-3">
                              <Plane className="w-5 h-5 text-amber-300" />
                            </div>
                            <div className="text-[13px] font-semibold text-slate-600 mb-1">Nenhuma passagem registrada</div>
                            <div className="text-[11px] text-slate-400">Aguardando registro de passagem para esta escalação.</div>
                          </div>
                          {/* Datas Sugeridas */}
                          <div className="border border-blue-200 rounded-2xl overflow-hidden">
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
                                    <div className="bg-white border border-blue-100 rounded-xl p-3">
                                      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-400 mb-2">🛫 IDA</div>
                                      <div className="space-y-1.5">
                                        <div><div className="text-[10px] text-slate-400">Data</div><div className="text-[12px] font-semibold text-slate-700">{formatSuggestionDate(travelInfo.ida)}</div></div>
                                        <div><div className="text-[10px] text-slate-400">Horário sugerido</div><div className="text-[12px] font-semibold text-slate-700">{travelInfo.chegada !== 'N/A' && travelInfo.chegada !== 'Não definido' ? travelInfo.chegada : '—'}</div></div>
                                      </div>
                                    </div>
                                    <div className="bg-white border border-blue-100 rounded-xl p-3">
                                      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-400 mb-2">🛬 VOLTA</div>
                                      <div className="space-y-1.5">
                                        <div><div className="text-[10px] text-slate-400">Data</div><div className="text-[12px] font-semibold text-slate-700">{formatSuggestionDate(travelInfo.retorno)}</div></div>
                                        <div><div className="text-[10px] text-slate-400">Horário sugerido</div><div className="text-[12px] font-semibold text-slate-700">{travelInfo.horario !== 'N/A' && travelInfo.horario !== 'Não definido' ? travelInfo.horario : '—'}</div></div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {/* Resumo Superior */}
                          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                            <div className="border-b border-slate-100 px-4 py-3 flex items-center gap-3" style={{ background: 'linear-gradient(to right, #f0f7ff, #ffffff)' }}>
                              <span className="text-xl">
                                {selectedTicket.transportType === 'van' ? '🚐' : selectedTicket.transportType === 'rodoviario' ? '🚌' : '✈️'}
                              </span>
                              <div>
                                <div className="text-[12px] font-black text-[#2563EB] uppercase tracking-[0.12em]">
                                  {selectedTicket.transportType === 'van' ? 'Van' : selectedTicket.transportType === 'rodoviario' ? 'Transporte Rodoviário' : 'Passagem Aérea'}
                                </div>
                                {selectedTicket.purchaseDate && (
                                  <div className="text-[11px] text-slate-400 mt-0.5">Comprada em {formatDate(selectedTicket.purchaseDate)}</div>
                                )}
                              </div>
                              {selectedTicket.purchaseDate && (
                                <span className="ml-auto inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 text-[10px] font-bold rounded-full border border-green-200">
                                  ✓ Comprada
                                </span>
                              )}
                            </div>
                            <div className="px-4 py-3 flex flex-wrap gap-6">
                              {selectedTicket.purchaseOrderNumber && (
                                <div>
                                  <div className={lbl}>{selectedTicket.transportType === 'van' ? 'Empresa / OC' : 'Ordem de Compra'}</div>
                                  <div className="text-[13px] font-bold text-slate-700 font-mono">{selectedTicket.purchaseOrderNumber}</div>
                                </div>
                              )}
                              {selectedTicket.cardLastFourDigits && (
                                <div>
                                  <div className={lbl}>Cartão</div>
                                  <div className="text-[13px] font-semibold text-slate-700 font-mono">****{selectedTicket.cardLastFourDigits}</div>
                                </div>
                              )}
                            </div>
                          </div>

                          {selectedTicket.transportType === 'van' ? (
                            /* ── Van: só observações se preenchidas ── */
                            selectedTicket.ticketObservations ? (
                              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                                <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500 mb-2">Observações</div>
                                <div className="text-sm text-slate-700 whitespace-pre-line">{selectedTicket.ticketObservations}</div>
                              </div>
                            ) : null
                          ) : (
                            /* ── Aéreo / Rodoviário: IDA + VOLTA ── */
                            <div className="grid grid-cols-2 gap-4">
                              {/* IDA */}
                              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                                <div className="text-[11px] font-black uppercase tracking-[0.12em] mb-3 flex items-center gap-1.5" style={{ color: '#2563EB' }}>
                                  {selectedTicket.transportType === 'rodoviario' ? '🚌' : '🛫'} IDA
                                </div>
                                <div className="space-y-2.5">
                                  {selectedTicket.transportType === 'rodoviario' && selectedTicket.departureAirport && (
                                    <div>
                                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Rodoviária de Origem</div>
                                      <div className="text-sm font-medium text-slate-700">{selectedTicket.departureAirport}</div>
                                    </div>
                                  )}
                                  {selectedTicket.departureCityOrigin && (
                                    <div>
                                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Cidade de Origem</div>
                                      <div className="text-sm font-medium text-slate-700">{selectedTicket.departureCityOrigin}</div>
                                    </div>
                                  )}
                                  {selectedTicket.transportType === 'aereo' && selectedTicket.departureAirport && (
                                    <div>
                                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Aeroporto de Origem</div>
                                      <div className="text-sm font-medium text-slate-700">{selectedTicket.departureAirport}</div>
                                    </div>
                                  )}
                                  {selectedTicket.transportType === 'rodoviario' && selectedTicket.destinationAirport && (
                                    <div>
                                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Rodoviária de Destino</div>
                                      <div className="text-sm font-medium text-slate-700">{selectedTicket.destinationAirport}</div>
                                    </div>
                                  )}
                                  {selectedTicket.departureCityDestination && (
                                    <div>
                                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Cidade de Destino</div>
                                      <div className="text-sm font-medium text-slate-700">{selectedTicket.departureCityDestination}</div>
                                    </div>
                                  )}
                                  {selectedTicket.transportType === 'aereo' && selectedTicket.destinationAirport && (
                                    <div>
                                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Aeroporto de Destino</div>
                                      <div className="text-sm font-medium text-slate-700">{selectedTicket.destinationAirport}</div>
                                    </div>
                                  )}
                                  {selectedTicket.actualDepartureDate && (
                                    <div>
                                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Data</div>
                                      <div className="text-sm font-semibold text-[#2563EB]">{formatDate(selectedTicket.actualDepartureDate)}</div>
                                    </div>
                                  )}
                                  {selectedTicket.actualDepartureTime ? (
                                    <div>
                                      <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Horário</div>
                                      <div className="bg-green-50 border-l-4 border-green-400 rounded-lg px-3 py-2">
                                        <span className="text-lg font-bold text-green-700">{selectedTicket.actualDepartureTime}</span>
                                      </div>
                                    </div>
                                  ) : (
                                    <div>
                                      <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Horário</div>
                                      <div className="bg-slate-50 border-l-4 border-slate-200 rounded-lg px-3 py-2">
                                        <span className="text-lg font-bold text-slate-300">--:--</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* VOLTA */}
                              {(selectedTicket.actualReturnDate || selectedTicket.actualReturnTime || selectedTicket.returnCityOrigin || selectedTicket.returnCityDestination) ? (
                                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                                  <div className="text-[11px] font-black uppercase tracking-[0.12em] mb-3 flex items-center gap-1.5" style={{ color: '#2563EB' }}>
                                    {selectedTicket.transportType === 'rodoviario' ? '🚌' : '🛬'} VOLTA
                                  </div>
                                  <div className="space-y-2.5">
                                    {selectedTicket.returnCityOrigin && (
                                      <div>
                                        <div className="text-[10px] text-slate-400 uppercase tracking-wider">Cidade de Origem</div>
                                        <div className="text-sm font-medium text-slate-700">{selectedTicket.returnCityOrigin}</div>
                                      </div>
                                    )}
                                    {selectedTicket.transportType === 'aereo' && (selectedTicket as any).returnOriginAirport && (
                                      <div>
                                        <div className="text-[10px] text-slate-400 uppercase tracking-wider">Aeroporto de Origem</div>
                                        <div className="text-sm font-bold text-slate-700 uppercase font-mono">{(selectedTicket as any).returnOriginAirport}</div>
                                      </div>
                                    )}
                                    {selectedTicket.returnCityDestination && (
                                      <div>
                                        <div className="text-[10px] text-slate-400 uppercase tracking-wider">Cidade de Destino</div>
                                        <div className="text-sm font-medium text-slate-700">{selectedTicket.returnCityDestination}</div>
                                      </div>
                                    )}
                                    {selectedTicket.transportType === 'aereo' && (selectedTicket as any).returnDestinationAirport && (
                                      <div>
                                        <div className="text-[10px] text-slate-400 uppercase tracking-wider">Aeroporto de Destino</div>
                                        <div className="text-sm font-bold text-slate-700 uppercase font-mono">{(selectedTicket as any).returnDestinationAirport}</div>
                                      </div>
                                    )}
                                    {selectedTicket.actualReturnDate && (
                                      <div>
                                        <div className="text-[10px] text-slate-400 uppercase tracking-wider">Data</div>
                                        <div className="text-sm font-semibold text-[#2563EB]">{formatDate(selectedTicket.actualReturnDate)}</div>
                                      </div>
                                    )}
                                    {selectedTicket.actualReturnTime ? (
                                      <div>
                                        <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Horário</div>
                                        <div className="bg-green-50 border-l-4 border-green-400 rounded-lg px-3 py-2">
                                          <span className="text-lg font-bold text-green-700">{selectedTicket.actualReturnTime}</span>
                                        </div>
                                      </div>
                                    ) : (
                                      <div>
                                        <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Horário</div>
                                        <div className="bg-slate-50 border-l-4 border-slate-200 rounded-lg px-3 py-2">
                                          <span className="text-lg font-bold text-slate-300">--:--</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-4 flex items-center justify-center">
                                  <div className="text-center">
                                    <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400 mb-1">
                                      {selectedTicket.transportType === 'rodoviario' ? '🚌' : '🛬'} VOLTA
                                    </div>
                                    <div className="text-xs text-slate-300">Sem informações de volta</div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Observações (só para não-van) */}
                          {selectedTicket.ticketObservations && selectedTicket.transportType !== 'van' && (
                            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                              <div className={lbl + " mb-1"}>Observações</div>
                              <div className="text-sm text-slate-700 whitespace-pre-line">{selectedTicket.ticketObservations}</div>
                            </div>
                          )}

                          {/* Anexos da Passagem */}
                          <div>
                            <div className={lbl + " mb-2"}>📎 Anexos</div>
                            {renderAttachments(selectedTicket.attachmentIds, 'Passagem')}
                          </div>
                        </div>
                      )}
                    </TabsContent>

                    {/* ══ ABA: HOSPEDAGEM ══ */}
                    <TabsContent value="hospedagem" className="m-0 p-6">
                      {!selectedInclusion.needsAccommodation ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                          <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-dashed border-slate-200 flex items-center justify-center mb-3 text-xl">🏨</div>
                          <div className="text-[13px] font-semibold text-slate-500 mb-1">Sem hospedagem necessária</div>
                          <div className="text-[11px] text-slate-400">Esta escalação não requer reserva de hotel.</div>
                        </div>
                      ) : !accommodation ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-dashed border-amber-200 flex items-center justify-center mb-3 text-xl">🏨</div>
                          <div className="text-[13px] font-semibold text-slate-600 mb-1">Nenhuma hospedagem registrada</div>
                          <div className="text-[11px] text-slate-400">Aguardando registro de hospedagem para esta escalação.</div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                            <div className="border-b border-green-100 px-4 py-3 flex items-center gap-3" style={{ background: 'linear-gradient(to right, #f0fdf4, #ffffff)' }}>
                              <span className="text-xl">🏨</span>
                              <div>
                                <div className="text-[12px] font-black text-green-700 uppercase tracking-[0.12em]">Hospedagem Reservada</div>
                                <div className="text-[13px] font-bold text-slate-800 mt-0.5">{accommodation.hotelName || 'Hotel não informado'}</div>
                              </div>
                              {accommodation.reservationNumber && (
                                <span className="ml-auto text-[11px] font-bold text-slate-500 font-mono bg-slate-100 px-2.5 py-1 rounded-full">LOC: {accommodation.reservationNumber}</span>
                              )}
                            </div>
                            <div className="p-4">
                              <div className="grid grid-cols-2 gap-4">
                                {accommodation.hotelLocation && (
                                  <div>
                                    <div className={lbl}>Localização</div>
                                    <div className={val}>{accommodation.hotelLocation}</div>
                                  </div>
                                )}
                                <div>
                                  <div className={lbl}>Check-in</div>
                                  <div className={val}>
                                    {accommodation.checkInDate ? formatDateWithWeekday(accommodation.checkInDate) : 'Não informado'}
                                    {accommodation.checkInTime && ` às ${accommodation.checkInTime}`}
                                  </div>
                                </div>
                                <div>
                                  <div className={lbl}>Check-out</div>
                                  <div className={val}>
                                    {accommodation.checkOutDate ? formatDateWithWeekday(accommodation.checkOutDate) : 'Não informado'}
                                    {accommodation.checkOutTime && ` às ${accommodation.checkOutTime}`}
                                  </div>
                                </div>
                                {accommodation.dailyRate && (
                                  <div>
                                    <div className={lbl}>Valor da Diária</div>
                                    <div className={val}>R$ {(accommodation.dailyRate / 100).toFixed(2)}</div>
                                  </div>
                                )}
                              </div>
                              {accommodation.accommodationObservations && (
                                <div className="mt-4 pt-4 border-t border-slate-100">
                                  <div className={lbl}>Observações</div>
                                  <div className="text-sm text-slate-700 mt-0.5 whitespace-pre-line">{accommodation.accommodationObservations}</div>
                                </div>
                              )}
                            </div>
                          </div>
                          {/* Anexos */}
                          <div>
                            <div className={lbl + " mb-2"}>📎 Anexos</div>
                            {renderAttachments(accommodation.attachmentIds, 'Hospedagem')}
                          </div>
                        </div>
                      )}
                    </TabsContent>

                    {/* ══ ABA: COMENTÁRIOS E HISTÓRICO ══ */}
                    <TabsContent value="comentarios" className="m-0 p-6">
                      <div className="grid grid-cols-2 gap-6">

                        {/* Coluna Esquerda: Comentários */}
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 mb-1">
                            <MessageSquare className="w-4 h-4 text-slate-400" />
                            <span className="text-[12px] font-black text-slate-600 uppercase tracking-[0.1em]">Comentários</span>
                            {comments && comments.length > 0 && (
                              <span className="bg-[#2563EB] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{comments.length}</span>
                            )}
                          </div>

                          {comments && comments.length > 0 ? (
                            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                              {comments.map((comment) => (
                                <div key={comment.id} className="bg-white border border-slate-200 p-3 rounded-xl shadow-sm">
                                  <div className="flex justify-between items-center mb-1.5">
                                    <div className="flex items-center gap-2">
                                      <div className="w-5 h-5 rounded-full bg-[#2563EB] text-white flex items-center justify-center text-[9px] font-black shrink-0">
                                        {getUserName(comment.userId).charAt(0).toUpperCase()}
                                      </div>
                                      <div className="text-[12px] font-bold text-slate-700">{getUserName(comment.userId)}</div>
                                    </div>
                                    <div className="text-[10px] text-slate-400 shrink-0 ml-2">{formatDateTime(comment.createdAt)}</div>
                                  </div>
                                  <div className="text-[12px] text-slate-600 leading-relaxed">{comment.content}</div>
                                  {comment.phase && (
                                    <div className="mt-1.5 pt-1.5 border-t border-slate-50">
                                      <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[9px] font-bold text-slate-500">{getPhaseLabel(comment.phase)}</span>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center py-8">
                              <MessageSquare className="w-6 h-6 text-slate-200 mx-auto mb-2" />
                              <div className="text-[12px] text-slate-400">Nenhum comentário registrado.</div>
                            </div>
                          )}

                          {/* Adicionar comentário */}
                          <div className="pt-1 space-y-2">
                            <Textarea
                              rows={2}
                              placeholder="Escreva um comentário..."
                              value={newComment}
                              onChange={(e) => setNewComment(e.target.value)}
                              className="w-full border border-slate-200 rounded-xl bg-white text-[13px] p-3 resize-none min-h-[70px] focus:ring-2 focus:ring-blue-100 focus:border-[#2563EB] transition-all"
                              data-testid="textarea-comment-inline"
                              disabled={!selectedInclusion || isReadOnly(selectedInclusion) || !canConfirmEscalation(selectedInclusion)}
                            />
                            <div className="flex justify-end">
                              <Button
                                onClick={handleAddComment}
                                disabled={addCommentMutation.isPending || !newComment.trim() || !selectedInclusion || isReadOnly(selectedInclusion)}
                                style={{ background: '#2563EB' }}
                                className="flex items-center gap-2 text-white rounded-xl px-5 py-2 h-9 text-sm font-bold hover:opacity-90"
                                data-testid="button-add-comment-inline"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                {addCommentMutation.isPending ? "Enviando..." : "Enviar"}
                              </Button>
                            </div>
                          </div>
                        </div>

                        {/* Coluna Direita: Histórico */}
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <History className="w-4 h-4 text-slate-400" />
                            <span className="text-[12px] font-black text-slate-600 uppercase tracking-[0.1em]">Histórico</span>
                            {inclusionLogs && inclusionLogs.length > 0 && (
                              <span className="text-[10px] text-slate-400">{inclusionLogs.length} entr.</span>
                            )}
                          </div>
                          {!inclusionLogs || inclusionLogs.length === 0 ? (
                            <div className="bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center py-8">
                              <History className="w-6 h-6 text-slate-200 mx-auto mb-2" />
                              <div className="text-[12px] text-slate-400">Nenhum histórico encontrado.</div>
                            </div>
                          ) : (
                            <div>
                              <div className="border-l-2 border-slate-100 ml-3 pl-4 space-y-2 max-h-72 overflow-y-auto">
                                {inclusionLogs
                                  .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
                                  .slice(0, showAllLogs ? undefined : 5)
                                  .map((log) => {
                                    const actionLabels: Record<string, string> = {
                                      'status_changed': '🔄 Status Alterado',
                                      'collaborator_changed': '👤 Colaborador Alterado',
                                      'dates_changed': '📅 Período Alterado',
                                      'travel_dates_changed': '✈️ Datas de Viagem',
                                      'observations_changed': '📝 Observações',
                                      'created': '✨ Criado',
                                      'confirmed': '✅ Confirmado',
                                      'reopened': '🔓 Reaberto',
                                    };
                                    return (
                                      <div key={log.id} className="flex gap-3">
                                        <div className="w-2.5 h-2.5 bg-[#2563EB] rounded-full -ml-[1.3rem] mt-2.5 flex-shrink-0 ring-4 ring-white" />
                                        <div className="flex-1 min-w-0 bg-white border border-slate-100 rounded-xl px-3 py-2 shadow-sm">
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="text-[11px] font-bold text-slate-700">{actionLabels[log.action] || log.action}</div>
                                            <div className="text-[10px] text-slate-400 whitespace-nowrap flex-shrink-0">{log.createdAt && formatDateTime(log.createdAt)}</div>
                                          </div>
                                          {log.details && <div className="text-[11px] text-slate-500 mt-0.5">{log.details}</div>}
                                          <div className="text-[10px] font-semibold mt-1" style={{ color: '#2563EB' }}>↳ {log.userName}</div>
                                        </div>
                                      </div>
                                    );
                                  })}
                              </div>
                              {!showAllLogs && inclusionLogs.length > 5 && (
                                <button
                                  onClick={() => setShowAllLogs(true)}
                                  className="text-xs font-medium mt-2 ml-7 hover:underline"
                                  style={{ color: '#2563EB' }}
                                >
                                  Ver todos ({inclusionLogs.length - 5} mais)
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                      </div>
                    </TabsContent>

                  </div>
                </Tabs>

                {/* ── Footer ── */}
                <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0 bg-white">
                  {/* Botão Reativar — só aparece para admin em escalações canceladas */}
                  {selectedInclusion?.status === 'cancelado' &&
                    (user?.role === 'admin' || user?.role === 'administrator' || user?.role === 'administrador') && (
                    <Button
                      onClick={() => setShowReactivateConfirm(true)}
                      disabled={reactivateMutation.isPending}
                      className="mr-auto flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-4 py-2 text-sm font-semibold"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reativar escalação
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => setShowModal(false)}
                    className="border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl px-5 py-2 text-sm font-medium"
                  >
                    Fechar
                  </Button>
                  {!isReadOnly(selectedInclusion) && (
                    <>
                      {(canEditCollaborator(selectedInclusion) || !isEscalated(selectedInclusion)) && (
                        <Button
                          variant="secondary"
                          onClick={handleSave}
                          disabled={(() => {
                            if (!selectedInclusion) return true;
                            if (updateTeamInclusionMutation.isPending) return true;
                            if (selectedInclusion.status === 'cancelado') return true;
                            if (isEscalated(selectedInclusion)) return !canEditCollaborator(selectedInclusion);
                            if (!canConfirmEscalation(selectedInclusion)) return true;
                            return false;
                          })()}
                          className="flex items-center gap-2 border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl px-5 py-2 text-sm font-medium"
                        >
                          <Save className="w-4 h-4" />
                          {updateTeamInclusionMutation.isPending ? "Salvando..." : "Salvar Alterações"}
                        </Button>
                      )}
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
                          style={{ background: '#2563EB', boxShadow: '0 4px 14px #2563EB50' }}
                          className="flex items-center gap-2 text-white rounded-xl px-6 py-2 h-10 text-sm font-bold hover:opacity-90 transition-opacity"
                        >
                          <Check className="w-4 h-4" />
                          {updateTeamInclusionMutation.isPending ? "Confirmando..." : "Confirmar Escalação"}
                        </Button>
                      )}
                    </>
                  )}
                  {!isEscalated(selectedInclusion) && !isReadOnly(selectedInclusion) && !canConfirmEscalation(selectedInclusion) && (
                    <div className="text-sm text-muted-foreground bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-center">
                      ⚠️ Apenas o responsável pela função pode confirmar escalações
                    </div>
                  )}
                </div>
              </>
            );
          })()}

        </DialogContent>
      </Dialog>

      {/* Modal de sucesso — portal no body para escapar do transform do Dialog */}
      {showSuccessModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{background:'rgba(0,0,0,0.45)'}}>
          <div className="bg-white rounded-2xl shadow-2xl flex flex-col items-center px-8 py-7 w-full mx-4" style={{boxShadow:'0 8px 40px rgba(0,0,0,0.18)', maxWidth: 440}}>
            <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{background:'#DCFCE7'}}>
              <svg width="32" height="32" viewBox="0 0 36 36" fill="none">
                <circle cx="18" cy="18" r="18" fill="#16A34A" fillOpacity="0.12"/>
                <path d="M10 18.5L15.5 24L26 13" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-1">Sucesso</h3>
            <p className="text-sm text-slate-500 text-center mb-3">{successInfo?.message}</p>
            {successInfo?.inclusionNumber != null && (
              <span className="mb-4 px-3 py-0.5 rounded-full text-sm font-bold" style={{background:'#EEF2FF', color:'#4F46E5'}}>#{successInfo.inclusionNumber}</span>
            )}
            <div className="w-full border-t border-slate-100 mb-4"/>
            <div className="w-full space-y-2 mb-5">
              <div className="flex items-start justify-between gap-4 text-sm">
                <span className="text-slate-400 font-medium shrink-0">Evento</span>
                <span className="text-slate-700 font-semibold text-right">{successInfo?.eventName}</span>
              </div>
              <div className="flex items-start justify-between gap-4 text-sm">
                <span className="text-slate-400 font-medium shrink-0">Colaborador</span>
                <span className="text-slate-700 font-semibold text-right">{successInfo?.collaboratorName}</span>
              </div>
              <div className="flex items-start justify-between gap-4 text-sm">
                <span className="text-slate-400 font-medium shrink-0">Função</span>
                <span className="text-slate-700 font-semibold text-right">{successInfo?.functionName}</span>
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

      {/* ── Modal formulário de troca ── */}
      <Dialog open={showSwapModal && !swapSuccess} onOpenChange={(open) => { if (!open) { setShowSwapModal(false); setSwapNewCollaboratorId(""); setSwapReason(""); setSwapSubmitAttempted(false); } }}>
        <DialogContent className="max-w-[700px] p-0 gap-0 rounded-2xl overflow-hidden">
          {selectedInclusion && (() => {
            const currentCollabName = getCollaboratorName(selectedInclusion.collaboratorId || undefined);
            const newCollabName = swapNewCollaboratorId ? getCollaboratorName(swapNewCollaboratorId) : null;
            const isSameCollab = !!(swapNewCollaboratorId && swapNewCollaboratorId === selectedInclusion.collaboratorId);
            const reasonTooShort = swapReason.trim().length > 0 && swapReason.trim().length < 10;
            const reasonEmpty = swapSubmitAttempted && !swapReason.trim();
            const collabEmpty = swapSubmitAttempted && !swapNewCollaboratorId;
            const canSubmit = !!swapNewCollaboratorId && !isSameCollab && swapReason.trim().length >= 10 && !createSwapRequestMutation.isPending;

            const statusLabels: Record<string, string> = {
              rascunho: "Rascunho", planejado: "Planejado", confirmado: "Confirmado",
              pendente: "Pendente", reaberto: "Reaberto", escalacao: "Escalado",
              passagem: "Aguardando passagem", passagem_comprada: "Passagem comprada",
              hospedagem: "Aguardando hospedagem", hospedagem_comprada: "Hospedagem reservada",
              hospedagem_passagem_comprada: "Passagem e hospedagem prontas",
              aprovacao: "Em aprovação", aprovado: "Aprovado", cancelado: "Cancelado",
            };
            const statusLabel = statusLabels[selectedInclusion.status] || selectedInclusion.status;
            const hasTicket = selectedInclusion.needsTicket;
            const hasAccommodation = selectedInclusion.needsAccommodation;
            const startDate = selectedInclusion.scheduleStartDate ? format(parseISO(selectedInclusion.scheduleStartDate), "dd/MM/yyyy", { locale: ptBR }) : null;
            const endDate = selectedInclusion.scheduleEndDate ? format(parseISO(selectedInclusion.scheduleEndDate), "dd/MM/yyyy", { locale: ptBR }) : null;
            const periodo = startDate && endDate ? `${startDate} a ${endDate}` : startDate || endDate || "—";

            return (
              <>
                {/* ── Header ── */}
                <div className="px-6 pt-5 pb-4 border-b border-slate-100" style={{ background: 'linear-gradient(135deg, #f0f7ff 0%, #ffffff 55%)' }}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0" style={{ boxShadow: '0 3px 10px #2563EB30' }}>
                      <ArrowLeftRight style={{ width: 17, height: 17, color: '#fff' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <DialogTitle className="text-[15px] font-bold text-slate-900 leading-tight">Solicitar troca de colaborador</DialogTitle>
                      <p className="text-[12px] text-slate-400 mt-0.5">A troca só será efetivada após aprovação do time de Compras.</p>
                    </div>
                  </div>

                  {/* Resumo da escala — 4 colunas compactas */}
                  <div className="bg-white rounded-xl border border-slate-200 px-4 py-2.5 shadow-sm grid grid-cols-4 gap-3">
                    <div>
                      <div className="text-[9px] text-slate-400 font-medium uppercase tracking-wide mb-0.5">Evento</div>
                      <div className="text-[11px] font-semibold text-slate-700 truncate" title={getEventName(selectedInclusion.eventId)}>{getEventName(selectedInclusion.eventId)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-slate-400 font-medium uppercase tracking-wide mb-0.5">Função</div>
                      <div className="text-[11px] font-semibold text-slate-700 truncate" title={getFunctionName(selectedInclusion.functionId)}>{getFunctionName(selectedInclusion.functionId)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-slate-400 font-medium uppercase tracking-wide mb-0.5">Período</div>
                      <div className="text-[11px] font-medium text-slate-600">{periodo}</div>
                    </div>
                    <div className="flex flex-col">
                      <div className="text-[9px] text-slate-400 font-medium uppercase tracking-wide mb-0.5">Status</div>
                      <div className="flex items-start">
                        <span className="text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-100 rounded-full px-2 py-px leading-[18px]">{statusLabel}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Body ── */}
                <div className="px-6 py-4 space-y-3">

                  {/* Linha de comparação atual → novo (compacta) */}
                  <div className="flex items-center gap-3 bg-slate-50 rounded-xl border border-slate-200 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] uppercase tracking-wide font-semibold text-slate-400 mb-0.5">Colaborador atual</div>
                      <div className="text-[13px] font-semibold text-slate-800 leading-snug" style={{ wordBreak: 'break-word' }}>{currentCollabName}</div>
                    </div>
                    <div className="w-7 h-7 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center shrink-0">
                      <ArrowLeftRight className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0 text-right">
                      <div className="text-[9px] uppercase tracking-wide font-semibold text-slate-400 mb-0.5">Novo colaborador</div>
                      {newCollabName
                        ? <div className="text-[13px] font-semibold text-blue-700 leading-snug" style={{ wordBreak: 'break-word' }}>{newCollabName}</div>
                        : <div className="text-[12px] text-slate-300 italic">Ainda não selecionado</div>
                      }
                    </div>
                  </div>

                  {/* Campos: colaborador + motivo lado a lado */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 mb-1.5 block">Novo colaborador</label>
                      <CollaboratorCombobox
                        collaborators={(collaborators || []).filter(c => c.id !== selectedInclusion.collaboratorId)}
                        value={swapNewCollaboratorId}
                        onValueChange={(v) => { setSwapNewCollaboratorId(v); setSwapSubmitAttempted(false); }}
                        placeholder="Selecione o colaborador"
                        hideAll={true}
                      />
                      {collabEmpty && <p className="text-[10px] text-red-500 mt-1">Selecione um novo colaborador.</p>}
                      {isSameCollab && <p className="text-[10px] text-red-500 mt-1">Precisa ser diferente do atual.</p>}
                      {(() => {
                        if (!swapNewCollaboratorId) return null;
                        const { sameEvent, dateOverlap } = getCollaboratorConflicts(swapNewCollaboratorId, selectedInclusion?.id);
                        if (!sameEvent.length && !dateOverlap.length) return null;
                        return (
                          <div className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 mt-1">
                            <AlertCircle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-[10px] text-amber-700 leading-snug">
                              <span className="font-semibold">Já escalado</span>
                              {sameEvent.length > 0 && <span> neste evento</span>}
                              {sameEvent.length > 0 && dateOverlap.length > 0 && <span> e</span>}
                              {dateOverlap.length > 0 && sameEvent.length === 0 && <span> em datas sobrepostas</span>}
                              {dateOverlap.length > 0 && sameEvent.length > 0 && <span> em datas sobrepostas</span>}
                              .
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">Motivo da troca <span className="text-red-500">*</span></label>
                        <span className={`text-[10px] ${swapReason.trim().length >= 10 ? "text-green-500" : "text-slate-300"}`}>{swapReason.trim().length}/10</span>
                      </div>
                      <Textarea
                        value={swapReason}
                        onChange={(e) => { setSwapReason(e.target.value); setSwapSubmitAttempted(false); }}
                        placeholder="Informe o motivo da troca. Ex: colaborador indisponível, ajuste operacional ou substituição solicitada."
                        className="resize-none text-[12px] rounded-xl"
                        rows={3}
                        style={{ minHeight: 82 }}
                      />
                      {(reasonEmpty || reasonTooShort) && (
                        <p className="text-[10px] text-red-500 mt-1">{reasonEmpty ? "Informe um motivo." : "Mínimo de 10 caracteres."}</p>
                      )}
                      {!reasonEmpty && !reasonTooShort && <p className="text-[10px] text-slate-400 mt-1">Mínimo de 10 caracteres.</p>}
                    </div>
                  </div>

                </div>

                {/* ── Footer ── */}
                <div className="px-6 pb-5 pt-3 flex gap-3 border-t border-slate-100">
                  <Button
                    variant="outline"
                    className="flex-1 rounded-xl h-10 text-[13px] font-medium"
                    onClick={() => { setShowSwapModal(false); setSwapSubmitAttempted(false); }}
                    disabled={createSwapRequestMutation.isPending}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="flex-1 h-10 text-[13px] font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-all"
                    disabled={!canSubmit}
                    onClick={() => {
                      setSwapSubmitAttempted(true);
                      if (!selectedInclusion || !canSubmit) return;
                      createSwapRequestMutation.mutate({
                        teamInclusionId: selectedInclusion.id,
                        newCollaboratorId: swapNewCollaboratorId,
                        reason: swapReason.trim(),
                      });
                    }}
                  >
                    {createSwapRequestMutation.isPending ? "Enviando..." : "Enviar para aprovação"}
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Modal de confirmação pós-envio ── */}
      <Dialog open={swapSuccess} onOpenChange={(open) => { if (!open) { setSwapSuccess(false); setShowSwapModal(false); setSwapNewCollaboratorId(""); setSwapReason(""); setSwapSubmitAttempted(false); } }}>
        <DialogContent className="max-w-[480px] p-0 gap-0 rounded-2xl overflow-hidden">
          {selectedInclusion && (() => {
            const currentCollabName = getCollaboratorName(selectedInclusion.collaboratorId || undefined);
            const newCollabName = swapNewCollaboratorId ? getCollaboratorName(swapNewCollaboratorId) : null;
            const hasTicket = selectedInclusion.needsTicket;
            const hasAccommodation = selectedInclusion.needsAccommodation;
            return (
              <div className="px-8 py-8">
                {/* Ícone de sucesso */}
                <div className="flex flex-col items-center text-center mb-6">
                  <div className="w-14 h-14 rounded-full bg-green-50 border border-green-100 flex items-center justify-center mb-4">
                    <svg width="28" height="28" viewBox="0 0 36 36" fill="none">
                      <circle cx="18" cy="18" r="17" stroke="#16A34A" strokeWidth="1.5" strokeOpacity="0.25"/>
                      <path d="M10 19L15.5 24.5L26 13" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <DialogTitle className="text-[16px] font-bold text-slate-900 mb-1">Solicitação enviada para aprovação</DialogTitle>
                  <p className="text-[12px] text-slate-400 leading-relaxed">A troca foi enviada para análise do time de Compras.</p>
                </div>

                {/* Resumo compacto */}
                <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 mb-4 space-y-3">
                  {/* Topo: evento + função + badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] uppercase tracking-wide font-semibold text-slate-400 mb-0.5">Escala</div>
                      <div className="text-[12px] font-semibold text-slate-800 leading-tight truncate">{getEventName(selectedInclusion.eventId)}</div>
                      <div className="text-[11px] text-slate-500 leading-tight">Função: {getFunctionName(selectedInclusion.functionId)}</div>
                    </div>
                    <span className="text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-1 shrink-0 leading-tight">Aguardando aprovação</span>
                  </div>

                  {/* Comparação atual → solicitado */}
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] uppercase tracking-wide font-semibold text-slate-400 mb-0.5">Colaborador atual</div>
                      <div className="text-[12px] font-semibold text-slate-700 leading-snug">{currentCollabName}</div>
                    </div>
                    <div className="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0">
                      <ArrowLeftRight className="w-3 h-3 text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0 text-right">
                      <div className="text-[9px] uppercase tracking-wide font-semibold text-slate-400 mb-0.5">Colaborador solicitado</div>
                      <div className="text-[12px] font-semibold text-blue-600 leading-snug">{newCollabName || "—"}</div>
                    </div>
                  </div>
                </div>

                {/* Mensagem principal */}
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-3.5 py-2.5 mb-5">
                  <p className="text-[11px] text-blue-800 leading-relaxed">
                    <span className="font-semibold">A escala continuará com o colaborador atual</span> até que a troca seja aprovada pelo time de Compras.
                  </p>
                </div>

                {/* Botão */}
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-10 font-semibold text-[13px]"
                  onClick={() => { setSwapSuccess(false); setShowSwapModal(false); setSwapNewCollaboratorId(""); setSwapReason(""); setSwapSubmitAttempted(false); }}
                >
                  Entendi
                </Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Dialog de confirmação de cancelamento de troca ── */}
      <Dialog open={showCancelSwapConfirm} onOpenChange={(open) => { if (!open) setShowCancelSwapConfirm(false); }}>
        <DialogContent className="max-w-[400px] p-0 gap-0 rounded-2xl overflow-hidden">
          <div className="px-6 py-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
                <X className="w-4 h-4 text-red-500" />
              </div>
              <div>
                <DialogTitle className="text-[14px] font-bold text-slate-900 leading-tight mb-0.5">Cancelar solicitação de troca?</DialogTitle>
                <p className="text-[12px] text-slate-500 leading-relaxed">A solicitação será cancelada e o colaborador atual será mantido. Uma nova solicitação poderá ser feita.</p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1 rounded-xl h-9 text-[12px] border-slate-200 text-slate-600 hover:bg-slate-50"
                onClick={() => setShowCancelSwapConfirm(false)}
                disabled={cancelSwapMutation.isPending}
              >
                Manter solicitação
              </Button>
              <Button
                className="flex-1 rounded-xl h-9 text-[12px] bg-red-500 hover:bg-red-600 text-white"
                onClick={() => { if (pendingSwap) cancelSwapMutation.mutate(pendingSwap.id); }}
                disabled={cancelSwapMutation.isPending}
              >
                {cancelSwapMutation.isPending ? "Cancelando..." : "Sim, cancelar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Confirm: Aprovar escalação (sem passagem/hospedagem) ── */}
      <Dialog open={showApproveConfirm} onOpenChange={(open) => { if (!open) setShowApproveConfirm(false); }}>
        <DialogContent className="max-w-[400px] p-0 gap-0 rounded-2xl overflow-hidden">
          <div className="px-6 py-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                <Check className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <DialogTitle className="text-[14px] font-bold text-slate-900 leading-tight mb-0.5">Aprovar escalação?</DialogTitle>
                <p className="text-[12px] text-slate-500 leading-relaxed">
                  A escalação será marcada como <span className="font-semibold text-slate-700">Aprovada</span>. Essa ação não pode ser desfeita sem cancelar a escalação.
                </p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1 rounded-xl h-9 text-[12px] border-slate-200 text-slate-600 hover:bg-slate-50"
                onClick={() => setShowApproveConfirm(false)}
                disabled={approveEscalationMutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 rounded-xl h-9 text-[12px] bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => { if (selectedInclusion) approveEscalationMutation.mutate(selectedInclusion.id); }}
                disabled={approveEscalationMutation.isPending}
              >
                {approveEscalationMutation.isPending ? "Aprovando..." : "Sim, aprovar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Confirm: Reativar escalação ── */}
      <Dialog open={showReactivateConfirm} onOpenChange={(open) => { if (!open) setShowReactivateConfirm(false); }}>
        <DialogContent className="max-w-[400px] p-0 gap-0 rounded-2xl overflow-hidden">
          <div className="px-6 py-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                <RotateCcw className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <DialogTitle className="text-[14px] font-bold text-slate-900 leading-tight mb-0.5">Reativar escalação?</DialogTitle>
                <p className="text-[12px] text-slate-500 leading-relaxed">
                  A escalação voltará ao status <span className="font-semibold text-slate-700">Pendente</span> e ficará disponível novamente para edição e confirmação.
                </p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1 rounded-xl h-9 text-[12px] border-slate-200 text-slate-600 hover:bg-slate-50"
                onClick={() => setShowReactivateConfirm(false)}
                disabled={reactivateMutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 rounded-xl h-9 text-[12px] bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => { if (selectedInclusion) reactivateMutation.mutate(selectedInclusion.id); }}
                disabled={reactivateMutation.isPending}
              >
                {reactivateMutation.isPending ? "Reativando..." : "Sim, reativar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}