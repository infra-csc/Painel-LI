import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { fixEncoding } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plane, Bus, Truck, Save, Eye, FileText, ChevronDown, ChevronRight, MessageCircle, Edit, CheckCircle, Clock, Ticket as TicketIcon, CreditCard, Paperclip, NotebookPen, ClipboardCheck, History, AlertCircle, ArrowLeftRight, ArrowRight, CheckCheck, XCircle } from "lucide-react";
import EventCombobox from "@/components/ui/event-combobox";
import CollaboratorCombobox from "@/components/ui/collaborator-combobox";
import FunctionMultiSelect from "@/components/ui/function-multi-select";
import SortableHeader, { type SortConfig, type SortField } from "@/components/common/sortable-header";
import AttachmentUpload from "@/components/ui/attachment-upload";
import CommentsModal from "@/components/modals/comments-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { isReadOnly, canEdit, canPerformActions } from "@/lib/interactions";
import { canView, canEdit as canEditScreen } from "@/lib/permissions";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import type { TeamInclusion, Event, Function, Collaborator, Ticket, Comment, TeamInclusionLog, SwapRequest } from "@shared/schema";

export default function Tickets() {
  const { user } = useAuth();
  const [filters, setFilters] = useState({
    eventId: "all",
    functionId: [] as string[], 
    collaboratorId: "all",
    searchId: "",
    ticketStatus: "all", // all, pending, processed
    inclusionStatus: "active", // all, active (excludes cancelado)
  });
  const [showOnlyPendingSwaps, setShowOnlyPendingSwaps] = useState(false);
  
  const [sortConfig, setSortConfig] = useState<SortConfig | null>({ field: 'id', direction: 'desc' });
  const [selectedInclusion, setSelectedInclusion] = useState<TeamInclusion | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{message:string;inclusionNumber:number|null;eventName:string;collaboratorName:string;functionName:string}|null>(null);
  const [selectedTickets, setSelectedTickets] = useState<string[]>([]); // IDs dos tickets selecionados
  const [editingTicketId, setEditingTicketId] = useState<string | null>(null); // ID do ticket sendo editado
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    basic: false,
    dates: true,
    additional: false
  });
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [modalActiveTab, setModalActiveTab] = useState<string>('resumo');
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [swapConfirmAction, setSwapConfirmAction] = useState<null | 'approve' | 'reject'>(null);
  const [swapRejectReason, setSwapRejectReason] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  const { data: collaborators } = useQuery<Collaborator[]>({
    queryKey: ["/api/collaborators"],
  });

  const { data: tickets } = useQuery<Ticket[]>({
    queryKey: ["/api/tickets"],
  });

  const { data: accommodations } = useQuery<any[]>({
    queryKey: ["/api/accommodations"],
  });

  const { data: users } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  // Buscar comentários para mostrar na modal
  const { data: comments } = useQuery<Comment[]>({
    queryKey: ["/api/comments", selectedInclusion?.id],
    enabled: !!selectedInclusion?.id,
  });

  const { data: inclusionLogs } = useQuery<TeamInclusionLog[]>({
    queryKey: ["/api/team-inclusions", selectedInclusion?.id, "logs"],
    enabled: !!selectedInclusion?.id,
  });

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
  const latestSwap = swapRequests?.find(s => ['aprovado', 'rejeitado'].includes(s.status));

  // Query global — para badges nas linhas da tabela (sem depender de inclusão selecionada)
  const { data: allSwapRequests } = useQuery<SwapRequest[]>({
    queryKey: ["/api/swap-requests"],
    queryFn: async () => {
      const r = await fetch("/api/swap-requests");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const pendingSwapByInclusion = useMemo(() => {
    const map = new Map<string, boolean>();
    allSwapRequests?.filter(s => s.status === 'pendente').forEach(s => {
      const id = (s as any).team_inclusion_id || s.teamInclusionId;
      if (id) map.set(id, true);
    });
    return map;
  }, [allSwapRequests]);

  const isPurchasingRole = user?.role && ['admin', 'administrator', 'administrador', 'purchasing'].includes(user.role);

  // Banner: trocas pendentes que exigem análise de Compras (qualquer status escalado)
  const pendingTicketSwapsCount = useMemo(() => {
    if (!isPurchasingRole || !allSwapRequests || !teamInclusions) return 0;
    const escalatedStatuses = new Set(['escalado', 'passagem', 'passagem_comprada', 'hospedagem', 'hospedagem_comprada', 'hospedagem_passagem_comprada', 'aprovacao', 'aprovado']);
    const inclStatusMap = new Map(teamInclusions.map(ti => [ti.id, ti.status]));
    return allSwapRequests.filter(s => {
      if (s.status !== 'pendente') return false;
      const inclId = (s as any).team_inclusion_id || s.teamInclusionId;
      return escalatedStatuses.has(inclStatusMap.get(inclId) ?? '');
    }).length;
  }, [isPurchasingRole, allSwapRequests, teamInclusions]);

  const approveSwapMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("PATCH", `/api/swap-requests/${id}/approve`, {});
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Troca aprovada", description: "O colaborador foi atualizado na escalação." });
      queryClient.invalidateQueries({ queryKey: ["/api/swap-requests/inclusion", selectedInclusion?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    },
    onError: async (err: any) => {
      const msg = await err?.response?.json?.().catch(() => null);
      toast({ title: "Erro", description: msg?.message || "Erro ao aprovar troca", variant: "destructive" });
    },
  });

  const rejectSwapMutation = useMutation({
    mutationFn: async ({ id, comment }: { id: string; comment?: string }) => {
      const r = await apiRequest("PATCH", `/api/swap-requests/${id}/reject`, { reviewComment: comment || "" });
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Troca rejeitada" });
      queryClient.invalidateQueries({ queryKey: ["/api/swap-requests/inclusion", selectedInclusion?.id] });
    },
    onError: async (err: any) => {
      const msg = await err?.response?.json?.().catch(() => null);
      toast({ title: "Erro", description: msg?.message || "Erro ao rejeitar troca", variant: "destructive" });
    },
  });

  const createTicketMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/tickets", data);
      return response.json();
    },
    onSuccess: () => {
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

  const updateTicketMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PATCH", `/api/tickets/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      setEditingTicketId(null);
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao atualizar passagem",
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

  const [ticketData, setTicketData] = useState<Record<string, any>>({});

  const getTicket = (inclusionId: string): Ticket | undefined => {
    return tickets?.find(ticket => ticket.teamInclusionId === inclusionId);
  };

  const getEventName = (eventId: string) => {
    return events?.find(e => e.id === eventId)?.name || "Evento não encontrado";
  };

  const getFunctionName = (functionId: string) => {
    return functions?.find(f => f.id === functionId)?.name || "Função não encontrada";
  };

  const getCollaboratorName = (collaboratorId?: string) => {
    if (!collaboratorId) return "Não escalado";
    return fixEncoding(collaborators?.find(c => c.id === collaboratorId)?.fullName) || "Colaborador não encontrado";
  };

  const getCollaborator = (collaboratorId?: string) => {
    if (!collaboratorId) return null;
    return collaborators?.find(c => c.id === collaboratorId) || null;
  };

  const getEventLocation = (eventId: string) => {
    const event = events?.find(e => e.id === eventId);
    return event?.location || "Destino não informado";
  };

  const toTitleCase = (str: string) => {
    if (!str) return str;
    const lower = str.toLowerCase();
    if (lower === 'não escalado') return 'Não escalado';
    return lower.replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const isDateUrgent = (dateStr: string) => {
    const today = new Date();
    const targetDate = new Date(dateStr);
    const diffTime = targetDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 7 && diffDays >= 0; // Próximos 7 dias
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "N/A";
    const [year, month, day] = dateStr.split('-');
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
  };

  // Função específica para formatar datas nas sugestões de viagem (similiar à do scaling)
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  // Função para extrair dados de passagem dos campos específicos (prioridade) ou das observações (legado)
  const extractTravelInfoFromObservations = (observations: string | undefined, inclusion?: any) => {
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

  // Filter inclusions that need tickets - now independent of accommodation and collaborator
  const ticketInclusions = teamInclusions?.filter(
    inclusion => {
      // Show all inclusions that need tickets (with or without collaborators)
      // This allows ticket purchase before name assignment
      
      // Se NÃO precisa de passagem, não mostra
      if (!inclusion.needsTicket) return false;
      
      // Se está cancelado, não mostra (a menos que o filtro esteja explicitamente em "cancelado")
      if (inclusion.status === "cancelado" && filters.inclusionStatus !== "cancelado") return false;
      
      // Se tem colaborador escalado, aparece INDEPENDENTE do status (workflow flexível)
      if (inclusion.collaboratorId) {
        // OK - Colaborador já foi atribuído, pode comprar passagem
      } else {
        // Se NÃO tem colaborador, só mostra se estiver nos status específicos
        const validStatusesWithoutCollaborator = [
          "reaberto", "escalado",
          "aguardando_passagem", "aguardando_hospedagem",
          "passagem", "hospedagem", "hospedagem_comprada",
          "aprovado", "passagem_comprada", "hospedagem_passagem_comprada"
        ];
        if (!validStatusesWithoutCollaborator.includes(inclusion.status)) {
          return false;
        }
      }
      
      // Apply simple filters (event, function, collaborator, and search ID)
      if (filters.eventId !== "all" && inclusion.eventId !== filters.eventId) return false;
      if (filters.functionId.length > 0 && !filters.functionId.includes(inclusion.functionId)) return false;
      if (filters.collaboratorId !== "all" && inclusion.collaboratorId !== filters.collaboratorId) return false;
      if (filters.searchId) {
        const q = filters.searchId.replace(/#/g, '').trim().toLowerCase();
        const colName = (collaborators?.find(c => c.id === inclusion.collaboratorId)?.fullName ?? '').toLowerCase();
        if (!(String(inclusion.inclusionNumber ?? '').toLowerCase().includes(q) ||
          inclusion.id.toLowerCase().includes(q) ||
          colName.includes(q))) return false;
      }
      
      // Filter by inclusion status - by default, hide cancelled inclusions
      if (filters.inclusionStatus === "active" && inclusion.status === "cancelado") return false;
      if (filters.inclusionStatus === "cancelado" && inclusion.status !== "cancelado") return false;
      
      return true;
    }
  ) || [];

  // Deduplicate inclusions by collaborator+event+function to avoid duplicates
  const deduplicatedInclusions = useMemo(() => {
    const deduplicationMap = new Map<string, TeamInclusion>();
    
    // Helper function to normalize official documents for consistent deduplication
    const normalizeDocument = (doc?: string): string => {
      if (!doc) return '';
      // Strip non-alphanumeric characters and convert to uppercase for consistent comparison
      return doc.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    };
    
    const makeKey = (inc: TeamInclusion) => {
      const collaborator = getCollaborator(inc.collaboratorId || undefined);
      // Use normalized official document (CPF/RG) as the business identity to deduplicate 
      // collaborators with same document but different IDs
      const normalizedDoc = normalizeDocument(collaborator?.officialDocument);
      const collaboratorBusinessId = normalizedDoc || inc.collaboratorId || '';
      
      // If no collaborator, use inclusion ID to keep each unnamed inclusion separate
      if (!collaboratorBusinessId) {
        return `${inc.eventId}|${inc.functionId}|unassigned-${inc.id}`;
      }
      
      return `${inc.eventId}|${inc.functionId}|${collaboratorBusinessId}`;
    };
    
    const statusPriority: Record<string, number> = {
      'hospedagem_passagem_comprada': 7,  // Highest priority - both purchased
      'aprovado': 6,
      'passagem_comprada': 5,
      'hospedagem': 4,
      'passagem': 3,
      'aguardando_passagem': 2,
      'cancelado': 1  // Lowest priority so active records are kept over canceled ones
    };
    
    for (const inclusion of ticketInclusions) {
      const key = makeKey(inclusion);
      const existing = deduplicationMap.get(key);
      
      if (!existing) {
        deduplicationMap.set(key, inclusion);
      } else {
        const currentPriority = statusPriority[inclusion.status] ?? 0;
        const existingPriority = statusPriority[existing.status] ?? 0;
        
        // Determine which is newer: higher status priority first
        let isNewer = currentPriority > existingPriority;
        
        // If same priority, use inclusionNumber (higher number = more recent)
        if (currentPriority === existingPriority) {
          const currentNumber = inclusion.inclusionNumber ?? 0;
          const existingNumber = existing.inclusionNumber ?? 0;
          
          if (currentNumber !== existingNumber) {
            isNewer = currentNumber > existingNumber;
          } else {
            // If inclusionNumber is same, prefer the one with latest updatedAt
            const currentUpdated = inclusion.updatedAt || inclusion.createdAt || inclusion.id;
            const existingUpdated = existing.updatedAt || existing.createdAt || existing.id;
            isNewer = currentUpdated > existingUpdated;
          }
        }
        
        if (isNewer) {
          deduplicationMap.set(key, inclusion);
        }
      }
    }
    
    
    return Array.from(deduplicationMap.values());
  }, [ticketInclusions, collaborators]);

  // Apply ticket status filter to deduplicated inclusions and apply sorting
  const filteredTicketInclusions = useMemo(() => {
    const filtered = deduplicatedInclusions.filter(inclusion => {
      if (showOnlyPendingSwaps && !pendingSwapByInclusion.has(inclusion.id)) return false;
      if (filters.ticketStatus !== "all") {
        const hasTicket = getTicket(inclusion.id);
        if (filters.ticketStatus === "pending" && hasTicket) return false;
        if (filters.ticketStatus === "processed" && !hasTicket) return false;
      }
      return true;
    });

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
            const collabA = getCollaboratorName(a.collaboratorId || undefined);
            const collabB = getCollaboratorName(b.collaboratorId || undefined);
            return collabA.localeCompare(collabB, 'pt-BR') * multiplier;
          case 'diarias':
            if (!a.scheduleStartDate && !b.scheduleStartDate) return 0;
            if (!a.scheduleStartDate) return 1 * multiplier;
            if (!b.scheduleStartDate) return -1 * multiplier;
            return (new Date(a.scheduleStartDate).getTime() - new Date(b.scheduleStartDate).getTime()) * multiplier;
          default:
            return 0;
        }
      });
    }
    
    return filtered;
  }, [deduplicatedInclusions, filters.ticketStatus, tickets, sortConfig, events, functions, collaborators]);

  const handleTicketDataChange = (inclusionId: string, field: string, value: any) => {
    setTicketData(prev => ({
      ...prev,
      [inclusionId]: {
        ...prev[inclusionId],
        [field]: value
      }
    }));
  };

  const handleViewTicketDetails = (inclusion: TeamInclusion) => {
    setSelectedInclusion(inclusion);
    setShowModal(true);
    setModalActiveTab('resumo');
    const eventLocation = events?.find(e => e.id === inclusion.eventId)?.location;
    if (eventLocation) {
      setTicketData(prev => ({
        ...prev,
        [inclusion.id]: {
          ...prev[inclusion.id],
          departureCityDestination: prev[inclusion.id]?.departureCityDestination || eventLocation,
          returnCityOrigin: prev[inclusion.id]?.returnCityOrigin || eventLocation,
        }
      }));
    }
  };

  // Toggle seleção de ticket
  const toggleTicketSelection = (inclusionId: string) => {
    setSelectedTickets(prev => {
      if (prev.includes(inclusionId)) {
        return prev.filter(id => id !== inclusionId);
      } else {
        return [...prev, inclusionId];
      }
    });
  };

  // Selecionar/deselecionar todos os tickets
  const toggleAllTickets = () => {
    const pendingInclusions = filteredTicketInclusions.filter(inclusion => 
      !getTicket(inclusion.id)
    );
    const allPendingIds = pendingInclusions.map(inclusion => inclusion.id);
    
    if (selectedTickets.length === allPendingIds.length) {
      setSelectedTickets([]); // Deselecionar todos
    } else {
      setSelectedTickets(allPendingIds); // Selecionar todos pendentes
    }
  };

  // Toggle seções expansíveis
  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Aplicar dados do registro rápido às passagens selecionadas
  const handleApplyToSelected = async () => {
    const quickData = ticketData["quick"];
    if (!quickData || selectedTickets.length === 0) return;

    const isVanQuick = quickData.transportType === 'van';

    // Validar campos obrigatórios
    const baseRequiredFields = isVanQuick
      ? [{ field: 'purchaseOrderNumber', label: 'Nome da Empresa' }]
      : [
          { field: 'departureAirport', label: quickData.transportType === 'rodoviario' ? 'Rodoviária Ida' : 'Aeroporto Ida' },
          { field: 'destinationAirport', label: quickData.transportType === 'rodoviario' ? 'Rodoviária Volta' : 'Aeroporto Volta' },
          { field: 'purchaseOrderNumber', label: 'LOC' },
          { field: 'actualDepartureDate', label: 'Data de Ida' },
          { field: 'actualDepartureTime', label: 'Horário de Ida' }
        ];
    
    // Adicionar campos de volta apenas se não for "apenas ida" e não for van
    const requiredFields = (!isVanQuick && !quickData.isOneWay) ? [
      ...baseRequiredFields,
      { field: 'actualReturnDate', label: 'Data de Volta' },
      { field: 'actualReturnTime', label: 'Horário de Volta' }
    ] : baseRequiredFields;
    
    const missingFields = requiredFields.filter(({ field }) => {
      let value = quickData[field];
      return !value || value === '';
    });
    
    if (missingFields.length > 0) {
      toast({
        title: "Erro",
        description: `Preencha os campos obrigatórios: ${missingFields.map(f => f.label).join(', ')}`,
        variant: "destructive",
      });
      return;
    }

    try {
      let successCount = 0;
      const errors: string[] = [];

      for (const inclusionId of selectedTickets) {
        const inclusion = filteredTicketInclusions.find(inc => inc.id === inclusionId);
        if (!inclusion) continue;

        // Verificar se não tem ticket já
        if (getTicket(inclusion.id)) {
          errors.push(`Passagem #${inclusion.inclusionNumber} já foi comprada`);
          continue;
        }

        try {
          // Criar ticket com os dados comuns completos
          await createTicketMutation.mutateAsync({
            teamInclusionId: inclusion.id,
            transportType: quickData.transportType || "aereo",
            value: isVanQuick ? null : Math.round(parseFloat(quickData.value) * 100),
            purchaseDate: quickData.purchaseDate || new Date().toISOString().split('T')[0],
            actualDepartureDate: isVanQuick ? null : (quickData.actualDepartureDate || null),
            actualDepartureTime: isVanQuick ? null : quickData.actualDepartureTime,
            actualReturnDate: isVanQuick ? null : (quickData.isOneWay ? null : quickData.actualReturnDate),
            actualReturnTime: isVanQuick ? null : (quickData.isOneWay ? null : quickData.actualReturnTime),
            departureCityOrigin: isVanQuick ? null : (quickData.departureCityOrigin || null),
            departureCityDestination: isVanQuick ? null : (quickData.departureCityDestination || null),
            returnCityOrigin: isVanQuick ? null : (quickData.isOneWay ? null : quickData.returnCityOrigin || null),
            returnCityDestination: isVanQuick ? null : (quickData.isOneWay ? null : quickData.returnCityDestination || null),
            departureAirport: isVanQuick ? null : quickData.departureAirport,
            destinationAirport: isVanQuick ? null : quickData.destinationAirport,
            purchaseOrderNumber: quickData.purchaseOrderNumber || null,
            fileUrl: quickData.fileUrl || null,
            attachmentIds: quickData.attachmentIds && quickData.attachmentIds.length > 0 ? quickData.attachmentIds : null,
            cardLastFourDigits: isVanQuick ? null : (quickData.cardLastFourDigits || null),
            ticketObservations: quickData.ticketObservations || null
          });

          // Atualizar team inclusion status - passagem agora é independente de hospedagem
          const needsAccommodation = inclusion.needsAccommodation;
          const accommodation = accommodations?.find(acc => acc.teamInclusionId === inclusion.id);
          const accommodationPurchased = accommodation && accommodation.hotelName;
          
          let newStatus = "passagem_comprada";
          let newPhase = "passagem";
          
          // Se precisa hospedagem E hospedagem já foi comprada, marcar como ambos comprados
          if (needsAccommodation && accommodationPurchased) {
            newStatus = "hospedagem_passagem_comprada";
            newPhase = "hospedagem";
          }
          // Senão, apenas marcar passagem como comprada (independente se precisa ou não de hospedagem)
          
          await updateTeamInclusionMutation.mutateAsync({
            id: inclusion.id,
            data: {
              status: newStatus,
              phase: newPhase
            }
          });

          successCount++;
        } catch (error) {
          errors.push(`Erro na passagem #${inclusion.inclusionNumber}`);
        }
      }

      if (successCount > 0) {
        toast({
          title: "Sucesso",
          description: `${successCount} passagem(ns) registrada(s) com os mesmos dados e anexos!`,
        });
      }

      if (errors.length > 0) {
        toast({
          title: "Alguns erros ocorreram",
          description: errors.join(", "),
          variant: "destructive",
        });
      }

      // Limpar seleções
      setSelectedTickets([]);
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao aplicar dados às passagens selecionadas",
        variant: "destructive",
      });
    }
  };

  // Check if user can access this screen
  if (!canView(user, 'tickets')) {
    return (
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Acesso Negado</h3>
        <p className="text-muted-foreground">Você não tem permissão para acessar esta tela.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-muted rounded w-1/4 mb-4"></div>
        <div className="h-64 bg-muted rounded"></div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center gap-5">
            <div
              className="w-10 h-10 bg-[#0033CC] rounded-[10px] flex items-center justify-center shrink-0"
              style={{ boxShadow: "0 4px 14px #0033CC50" }}
            >
              <Plane className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-[18px] font-bold tracking-tight text-slate-900 leading-tight">Compra de Passagens</h1>
              <p className="text-[13px] text-slate-400 mt-0.5">Gerencie a compra de passagens para os colaboradores escalados.</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total Geral",  value: filteredTicketInclusions.length, stripe: "bg-slate-700",   iconBg: "bg-slate-100",  iconTx: "text-slate-600",  valTx: "#374151",  Icon: TicketIcon },
              { label: "Compradas",    value: filteredTicketInclusions.filter(inc => getTicket(inc.id)).length,  stripe: "bg-emerald-500", iconBg: "bg-emerald-50", iconTx: "text-emerald-600", valTx: "#059669", Icon: CheckCircle },
              { label: "Aguardando",   value: filteredTicketInclusions.filter(inc => !getTicket(inc.id)).length, stripe: "bg-amber-400",   iconBg: "bg-amber-50",   iconTx: "text-amber-500",  valTx: "#D97706",  Icon: Clock },
            ].map(card => (
              <div key={card.label} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className={`h-0.5 w-full ${card.stripe}`} />
                <div className="px-4 py-3 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${card.iconBg} ${card.iconTx}`}>
                    <card.Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase leading-none mb-1">{card.label}</p>
                    <p className="text-[22px] font-bold leading-none" style={{ color: card.valTx }}>{card.value}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Banner: trocas pendentes aguardando análise de Compras */}
          {isPurchasingRole && pendingTicketSwapsCount > 0 && (
            <button
              onClick={() => setShowOnlyPendingSwaps(v => !v)}
              className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 border text-left transition-colors ${showOnlyPendingSwaps ? 'bg-amber-100 border-amber-400' : 'bg-amber-50 border-amber-200 hover:bg-amber-100'}`}
            >
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                <ArrowLeftRight className="w-4 h-4 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-amber-800 leading-snug">
                  {pendingTicketSwapsCount === 1
                    ? '1 solicitação de troca de colaborador aguarda sua análise'
                    : `${pendingTicketSwapsCount} solicitações de troca de colaborador aguardam sua análise`}
                </p>
                <p className="text-[11px] text-amber-600 mt-0.5">
                  {showOnlyPendingSwaps
                    ? 'Mostrando apenas linhas com troca pendente — clique para ver todas'
                    : 'Clique aqui para filtrar e ver apenas as linhas com troca pendente'}
                </p>
              </div>
              <span className="shrink-0 text-[11px] font-bold bg-amber-200 text-amber-800 px-2.5 py-1 rounded-full">
                {showOnlyPendingSwaps ? 'Filtro ativo' : `${pendingTicketSwapsCount} pendente${pendingTicketSwapsCount !== 1 ? 's' : ''}`}
              </span>
            </button>
          )}

          {/* Seção de Registro Rápido */}
          <div
            className="bg-white rounded-xl border border-slate-200 shadow-sm flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors overflow-hidden"
            onClick={() => toggleSection('basic')}
          >
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-amber-500" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-slate-800">Aplicar em Lote</p>
                <p className="text-[11px] text-slate-400">Aplicar mesmos dados a múltiplas passagens</p>
              </div>
            </div>
            <div className="pr-4">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${expandedSections.basic ? 'bg-amber-50 text-amber-500' : 'bg-slate-50 text-slate-400'}`}>
                {expandedSections.basic
                  ? <ChevronDown className="w-4 h-4" />
                  : <ChevronRight className="w-4 h-4" />}
              </div>
            </div>
          </div>

          {expandedSections.basic && (
            <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden" style={{boxShadow:'0 2px 12px rgba(0,0,0,0.06)'}}>
              {/* Cabeçalho interno */}
              <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-[13px] font-semibold text-slate-900">Aplicar em Lote</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Insira os dados da operação para múltiplos passageiros simultaneamente.</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {/* Tipo de transporte como pills */}
                  <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5" data-testid="select-quick-transport-type">
                    {[
                      { value: 'aereo', label: 'Aérea', Icon: Plane },
                      { value: 'rodoviario', label: 'Rodoviária', Icon: Bus },
                      { value: 'van', label: 'Van', Icon: Truck },
                    ].map(opt => {
                      const active = (ticketData["quick"]?.transportType || 'aereo') === opt.value;
                      return (
                        <button key={opt.value} type="button"
                          onClick={() => {
                            if (opt.value === 'rodoviario' && filters.eventId !== 'all') {
                              const ev = events?.find(e => e.id === filters.eventId);
                              setTicketData(prev => ({
                                ...prev,
                                quick: {
                                  ...prev.quick,
                                  transportType: opt.value,
                                  actualDepartureDate: ev?.startDate || prev.quick?.actualDepartureDate || '',
                                  actualReturnDate: ev?.endDate || prev.quick?.actualReturnDate || '',
                                }
                              }));
                            } else {
                              handleTicketDataChange("quick", "transportType", opt.value);
                            }
                          }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all ${active ? 'bg-white shadow-sm text-[#0033CC]' : 'text-slate-400 hover:text-slate-600'}`}>
                          <opt.Icon className="w-3.5 h-3.5" />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  {/* Toggle apenas ida */}
                  <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
                    <span className="text-[12px] font-semibold text-slate-600 select-none whitespace-nowrap">Apenas ida</span>
                    <button
                      type="button" role="switch"
                      aria-checked={ticketData["quick"]?.isOneWay || false}
                      data-testid="checkbox-quick-one-way"
                      onClick={() => handleTicketDataChange("quick", "isOneWay", !(ticketData["quick"]?.isOneWay || false))}
                      className="relative inline-flex items-center rounded-full transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#0033CC] focus:ring-offset-1 shrink-0"
                      style={{ width:40, height:22, backgroundColor: ticketData["quick"]?.isOneWay ? '#0033CC' : '#CBD5E1' }}
                    >
                      <span className="inline-block w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ease-in-out"
                        style={{ transform: ticketData["quick"]?.isOneWay ? 'translateX(20px)' : 'translateX(2px)' }} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Barra de progresso */}
              {(() => {
                const q = ticketData["quick"];
                const isOneWay = !!(q?.isOneWay);
                const allFields = [
                  !!(q?.transportType), !!(q?.value), !!(q?.purchaseOrderNumber),
                  !!(q?.departureCityOrigin), !!(q?.departureCityDestination),
                  !!(q?.departureAirport), !!(q?.destinationAirport),
                  !!(q?.actualDepartureDate), !!(q?.actualDepartureTime),
                  ...(isOneWay ? [] : [
                    !!(q?.returnCityOrigin), !!(q?.returnCityDestination),
                    !!(q?.returnOriginAirport), !!(q?.returnDestinationAirport),
                    !!(q?.actualReturnDate), !!(q?.actualReturnTime),
                  ])
                ];
                const filled = allFields.filter(Boolean).length;
                const total = allFields.length;
                const pct = Math.round((filled / total) * 100);
                const barColor = pct === 100 ? '#22C55E' : pct >= 50 ? '#F59E0B' : '#0033CC';
                return (
                  <div className="px-4 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center gap-3">
                    <div className="flex-1 h-1 rounded-full bg-slate-200 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width:`${pct}%`, backgroundColor: barColor }} />
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[11px] font-black" style={{color: barColor}}>{filled}</span>
                      <span className="text-[11px] font-medium text-slate-400">/ {total}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Corpo principal: 8 + 4 colunas */}
              <div className="grid grid-cols-12 gap-3 p-3">

                {/* Coluna esquerda (8 cols) */}
                <div className="col-span-12 lg:col-span-8 space-y-2">

                  {/* VAN: formulário simplificado */}
                  {ticketData["quick"]?.transportType === 'van' && (
                    <div className="space-y-3">
                      <section className="rounded-xl overflow-hidden border border-slate-200">
                        <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                          <div className="w-5 h-5 rounded-md bg-[#0033CC] flex items-center justify-center shrink-0">
                            <Truck className="w-3 h-3 text-white" />
                          </div>
                          <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-600">Dados da Van</h4>
                        </div>
                        <div className="p-3 bg-white space-y-3">
                          <div className="space-y-1.5">
                            <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-tight">Nome da Empresa *</Label>
                            <Input
                              placeholder="Ex: Transluz Transportes"
                              value={ticketData["quick"]?.purchaseOrderNumber || ""}
                              onChange={(e) => handleTicketDataChange("quick", "purchaseOrderNumber", e.target.value)}
                              className="h-[34px] bg-slate-50 border-slate-200 rounded-lg text-xs"
                              data-testid="input-quick-van-company"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-tight">Observação</Label>
                            <Textarea
                              placeholder="Horário de saída, ponto de encontro, número de vagas..."
                              value={ticketData["quick"]?.ticketObservations || ""}
                              onChange={(e) => handleTicketDataChange("quick", "ticketObservations", e.target.value)}
                              className="text-xs resize-none bg-slate-50 border-slate-200 rounded-lg"
                              style={{ height: 80 }}
                              data-testid="textarea-quick-van-observations"
                            />
                          </div>
                        </div>
                      </section>
                    </div>
                  )}

                  {/* Card: Dados Financeiros */}
                  {ticketData["quick"]?.transportType !== 'van' && (<>
                  <section className="rounded-xl overflow-hidden border border-slate-200">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                      <div className="w-5 h-5 rounded-md bg-[#0033CC] flex items-center justify-center shrink-0">
                        <CreditCard className="w-3 h-3 text-white" />
                      </div>
                      <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-600">Dados Financeiros</h4>
                    </div>
                    <div className="p-3 bg-white grid grid-cols-2 gap-x-3 gap-y-2">
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-tight">
                          {ticketData["quick"]?.transportType === "rodoviario" ? "Número do Bilhete *" : ticketData["quick"]?.transportType === "van" ? "Número da Van *" : "LOC / Reserva *"}
                        </Label>
                        <Input placeholder={ticketData["quick"]?.transportType === "rodoviario" ? "Ex: 012345678" : ticketData["quick"]?.transportType === "van" ? "Ex: VAN-001" : "Ex: AX782Q"}
                          value={ticketData["quick"]?.purchaseOrderNumber || ""}
                          onChange={(e) => handleTicketDataChange("quick", "purchaseOrderNumber", e.target.value)}
                          className="h-[34px] bg-slate-50 border-slate-200 rounded-lg text-xs font-mono"
                          data-testid="input-quick-purchase-order"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-tight">Data da Compra</Label>
                        <Input type="date"
                          value={ticketData["quick"]?.purchaseDate || new Date().toISOString().split('T')[0]}
                          onChange={(e) => handleTicketDataChange("quick", "purchaseDate", e.target.value)}
                          className="h-[34px] bg-slate-50 border-slate-200 rounded-lg text-xs"
                          data-testid="input-quick-purchase-date"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-tight">Valor da Passagem</Label>
                        <Input placeholder="0,00" type="text" inputMode="decimal"
                          value={ticketData["quick"]?.value || ""}
                          onChange={(e) => handleTicketDataChange("quick", "value", e.target.value.replace(',', '.'))}
                          className="h-[34px] bg-slate-50 border-slate-200 rounded-lg text-xs"
                          data-testid="input-quick-ticket-value"
                        />
                      </div>
                    </div>
                  </section>

                  {/* Cards de voo: Ida | Volta */}
                  <div className="grid grid-cols-2 gap-5">

                    {/* Trecho de Ida / Embarque */}
                    {(() => {
                      const qType = ticketData["quick"]?.transportType;
                      const isRodo = qType === "rodoviario";
                      const isVan = qType === "van";
                      const isGround = isRodo || isVan;
                      return (
                        <section className="rounded-xl overflow-hidden border border-slate-200">
                          <div className="flex items-center gap-2 px-3 py-2.5 bg-[#EEF2FF] border-b border-blue-100">
                            <div className="w-5 h-5 rounded-md bg-[#0033CC] flex items-center justify-center shrink-0">
                              {isVan ? <Truck className="w-3 h-3 text-white" /> : isRodo ? <Bus className="w-3 h-3 text-white" /> : <Plane className="w-3 h-3 text-white" />}
                            </div>
                            <h4 className="text-[11px] font-black uppercase tracking-widest text-[#0033CC]">
                              {isVan ? "Trajeto da Van" : isRodo ? "Embarque" : "Trecho de Ida"}
                            </h4>
                          </div>
                          <div className="p-3 bg-white space-y-2">
                            {(isRodo || isVan) ? (
                              <>
                                {/* Rodoviário/Van: Cidade Origem */}
                                <div className="space-y-1.5">
                                  <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-tight">Cidade de Origem *</Label>
                                  <Input placeholder="Ex: São Paulo"
                                    value={ticketData["quick"]?.departureCityOrigin || ""}
                                    onChange={(e) => handleTicketDataChange("quick", "departureCityOrigin", e.target.value)}
                                    className="h-[34px] bg-slate-50 border-slate-200 rounded-lg text-xs"
                                    data-testid="input-quick-departure-city-origin"
                                  />
                                </div>
                                {/* Terminal de Origem (usa campo departureAirport) */}
                                <div className="space-y-1.5">
                                  <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-tight">Terminal / Rodoviária *</Label>
                                  <Input placeholder="Ex: Rodoviária do Tietê"
                                    value={ticketData["quick"]?.departureAirport || ""}
                                    onChange={(e) => handleTicketDataChange("quick", "departureAirport", e.target.value)}
                                    className="h-[34px] bg-slate-50 border-slate-200 rounded-lg text-xs"
                                    data-testid="input-quick-departure-airport"
                                  />
                                </div>
                                {/* Cidade Destino */}
                                <div className="space-y-1.5">
                                  <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-tight">
                                    Cidade de Destino *
                                  </Label>
                                  <Input placeholder="Ex: Rio de Janeiro"
                                    value={ticketData["quick"]?.departureCityDestination || ""}
                                    onChange={(e) => handleTicketDataChange("quick", "departureCityDestination", e.target.value)}
                                    className="h-[34px] border-slate-200 rounded-lg text-xs bg-slate-50"
                                    data-testid="input-quick-departure-city-destination"
                                  />
                                </div>
                                {/* Terminal de Destino (usa campo destinationAirport) */}
                                <div className="space-y-1.5">
                                  <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-tight">Terminal / Rodoviária Destino</Label>
                                  <Input placeholder="Ex: Rodoviária Novo Rio"
                                    value={ticketData["quick"]?.destinationAirport || ""}
                                    onChange={(e) => handleTicketDataChange("quick", "destinationAirport", e.target.value)}
                                    className="h-[34px] bg-slate-50 border-slate-200 rounded-lg text-xs"
                                    data-testid="input-quick-destination-airport"
                                  />
                                </div>
                                {/* Data + Horário */}
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1.5">
                                    <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-tight">Data *</Label>
                                    <Input type="date"
                                      value={ticketData["quick"]?.actualDepartureDate || ""}
                                      onChange={(e) => handleTicketDataChange("quick", "actualDepartureDate", e.target.value)}
                                      className="h-[34px] bg-slate-50 border-slate-200 rounded-lg text-xs"
                                      data-testid="input-quick-departure-date"
                                    />
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-tight">Horário *</Label>
                                    <Input type="time"
                                      value={ticketData["quick"]?.actualDepartureTime || ""}
                                      onChange={(e) => handleTicketDataChange("quick", "actualDepartureTime", e.target.value)}
                                      className="h-[34px] bg-slate-50 border-slate-200 rounded-lg text-xs"
                                      data-testid="input-quick-departure-time"
                                    />
                                  </div>
                                </div>
                                {/* Poltrona + Classe */}
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1.5">
                                    <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-tight">Poltrona <span className="text-slate-300 normal-case">(opcional)</span></Label>
                                    <Input placeholder="Ex: 42A"
                                      value={ticketData["quick"]?.busPoltrona || ""}
                                      onChange={(e) => handleTicketDataChange("quick", "busPoltrona", e.target.value)}
                                      className="h-[34px] bg-slate-50 border-slate-200 rounded-lg text-xs"
                                    />
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-tight">Classe</Label>
                                    <Select
                                      value={ticketData["quick"]?.busClasse || "convencional"}
                                      onValueChange={(v) => handleTicketDataChange("quick", "busClasse", v)}
                                    >
                                      <SelectTrigger className="h-[34px] bg-slate-50 border-slate-200 rounded-lg text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="convencional">Convencional</SelectItem>
                                        <SelectItem value="executivo">Executivo</SelectItem>
                                        <SelectItem value="leito">Leito</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                              </>
                            ) : (
                              <>
                                {/* Aéreo: Cidade + IATA na mesma linha */}
                                <div className="space-y-1.5">
                                  <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-tight">Origem *</Label>
                                  <div className="flex gap-2">
                                    <Input placeholder="Ex: São Paulo"
                                      value={ticketData["quick"]?.departureCityOrigin || ""}
                                      onChange={(e) => handleTicketDataChange("quick", "departureCityOrigin", e.target.value)}
                                      className="h-[34px] bg-slate-50 border-slate-200 rounded-lg text-xs flex-1"
                                      data-testid="input-quick-departure-city-origin"
                                    />
                                    <Input placeholder="GRU"
                                      value={ticketData["quick"]?.departureAirport || ""}
                                      onChange={(e) => handleTicketDataChange("quick", "departureAirport", e.target.value)}
                                      className="h-[34px] bg-slate-50 border-slate-200 rounded-lg text-[10px] font-bold uppercase text-center"
                                      style={{width:56,fontSize:10,fontWeight:700}}
                                      data-testid="input-quick-departure-airport"
                                    />
                                  </div>
                                </div>
                                <div className="space-y-1.5">
                                  <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-tight">Destino *</Label>
                                  <div className="flex gap-2">
                                    <Input placeholder="Ex: Manaus"
                                      value={ticketData["quick"]?.departureCityDestination || ""}
                                      onChange={(e) => handleTicketDataChange("quick", "departureCityDestination", e.target.value)}
                                      className="h-[34px] bg-slate-50 border-slate-200 rounded-lg text-xs flex-1"
                                      data-testid="input-quick-departure-city-destination"
                                    />
                                    <Input placeholder="MAO"
                                      value={ticketData["quick"]?.destinationAirport || ""}
                                      onChange={(e) => handleTicketDataChange("quick", "destinationAirport", e.target.value)}
                                      className="h-[34px] bg-slate-50 border-slate-200 rounded-lg text-[10px] font-bold uppercase text-center"
                                      style={{width:56,fontSize:10,fontWeight:700}}
                                      data-testid="input-quick-destination-airport"
                                    />
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1.5">
                                    <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-tight">Data *</Label>
                                    <Input type="date"
                                      value={ticketData["quick"]?.actualDepartureDate || ""}
                                      onChange={(e) => handleTicketDataChange("quick", "actualDepartureDate", e.target.value)}
                                      className="h-[34px] bg-slate-50 border-slate-200 rounded-lg text-xs"
                                      data-testid="input-quick-departure-date"
                                    />
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-tight">Horário *</Label>
                                    <Input type="time"
                                      value={ticketData["quick"]?.actualDepartureTime || ""}
                                      onChange={(e) => handleTicketDataChange("quick", "actualDepartureTime", e.target.value)}
                                      className="h-[34px] bg-slate-50 border-slate-200 rounded-lg text-xs"
                                      data-testid="input-quick-departure-time"
                                    />
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </section>
                      );
                    })()}

                    {/* Trecho de Volta / Desembarque — com animação */}
                    <div style={{
                      overflow:'hidden',
                      transition:'all 0.3s ease',
                      opacity: ticketData["quick"]?.isOneWay ? 0 : 1,
                      maxHeight: ticketData["quick"]?.isOneWay ? '0px' : '800px',
                      pointerEvents: ticketData["quick"]?.isOneWay ? 'none' : 'auto',
                    }}>
                      {(() => {
                        const qTypeVolta = ticketData["quick"]?.transportType;
                        const isRodo = qTypeVolta === "rodoviario";
                        const isVan = qTypeVolta === "van";
                        return (
                          <section className="rounded-xl overflow-hidden border border-slate-200">
                            <div className="flex items-center gap-2 px-3 py-2.5 bg-[#FFF7ED] border-b border-orange-100">
                              <div className="w-5 h-5 rounded-md bg-[#F97316] flex items-center justify-center shrink-0">
                                {isVan ? <Truck className="w-3 h-3 text-white" /> : isRodo ? <Bus className="w-3 h-3 text-white" /> : <Plane className="w-3 h-3 text-white rotate-180" />}
                              </div>
                              <h4 className="text-[11px] font-black uppercase tracking-widest text-[#F97316]">
                                {isVan ? "Volta da Van" : isRodo ? "Desembarque" : "Trecho de Volta"}
                              </h4>
                            </div>
                            <div className="p-3 bg-white space-y-2">
                              {(isRodo || isVan) ? (
                                <>
                                  {/* Rodoviário/Van: Cidade Origem */}
                                  <div className="space-y-1.5">
                                    <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-tight">
                                      Cidade de Origem *
                                    </Label>
                                    <Input placeholder="Ex: Rio de Janeiro"
                                      value={ticketData["quick"]?.returnCityOrigin || ""}
                                      onChange={(e) => handleTicketDataChange("quick", "returnCityOrigin", e.target.value)}
                                      className="h-[34px] border-slate-200 rounded-lg text-xs bg-slate-50"
                                      data-testid="input-quick-return-city-origin"
                                    />
                                  </div>
                                  {/* Terminal de Origem volta (usa returnOriginAirport) */}
                                  <div className="space-y-1.5">
                                    <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-tight">Terminal / Rodoviária *</Label>
                                    <Input placeholder="Ex: Rodoviária Novo Rio"
                                      value={ticketData["quick"]?.returnOriginAirport || ""}
                                      onChange={(e) => handleTicketDataChange("quick", "returnOriginAirport", e.target.value)}
                                      className="h-[34px] bg-slate-50 border-slate-200 rounded-lg text-xs"
                                      data-testid="input-quick-return-origin-airport"
                                    />
                                  </div>
                                  {/* Cidade Destino volta */}
                                  <div className="space-y-1.5">
                                    <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-tight">Cidade de Destino *</Label>
                                    <Input placeholder="Ex: São Paulo"
                                      value={ticketData["quick"]?.returnCityDestination || ""}
                                      onChange={(e) => handleTicketDataChange("quick", "returnCityDestination", e.target.value)}
                                      className="h-[34px] bg-slate-50 border-slate-200 rounded-lg text-xs"
                                      data-testid="input-quick-return-city-destination"
                                    />
                                  </div>
                                  {/* Terminal de Destino volta (usa returnDestinationAirport) */}
                                  <div className="space-y-1.5">
                                    <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-tight">Terminal / Rodoviária Destino</Label>
                                    <Input placeholder="Ex: Rodoviária do Tietê"
                                      value={ticketData["quick"]?.returnDestinationAirport || ""}
                                      onChange={(e) => handleTicketDataChange("quick", "returnDestinationAirport", e.target.value)}
                                      className="h-[34px] bg-slate-50 border-slate-200 rounded-lg text-xs"
                                      data-testid="input-quick-return-destination-airport"
                                    />
                                  </div>
                                  {/* Data + Horário */}
                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                      <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-tight">Data *</Label>
                                      <Input type="date"
                                        value={ticketData["quick"]?.actualReturnDate || ""}
                                        onChange={(e) => handleTicketDataChange("quick", "actualReturnDate", e.target.value)}
                                        className="h-[34px] bg-slate-50 border-slate-200 rounded-lg text-xs"
                                        data-testid="input-quick-return-date"
                                      />
                                    </div>
                                    <div className="space-y-1.5">
                                      <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-tight">Horário *</Label>
                                      <Input type="time"
                                        value={ticketData["quick"]?.actualReturnTime || ""}
                                        onChange={(e) => handleTicketDataChange("quick", "actualReturnTime", e.target.value)}
                                        className="h-[34px] bg-slate-50 border-slate-200 rounded-lg text-xs"
                                        data-testid="input-quick-return-time"
                                      />
                                    </div>
                                  </div>
                                  {/* Poltrona + Classe volta */}
                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                      <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-tight">Poltrona <span className="text-slate-300 normal-case">(opcional)</span></Label>
                                      <Input placeholder="Ex: 12B"
                                        value={ticketData["quick"]?.busPoltronaVolta || ""}
                                        onChange={(e) => handleTicketDataChange("quick", "busPoltronaVolta", e.target.value)}
                                        className="h-[34px] bg-slate-50 border-slate-200 rounded-lg text-xs"
                                      />
                                    </div>
                                    <div className="space-y-1.5">
                                      <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-tight">Classe</Label>
                                      <Select
                                        value={ticketData["quick"]?.busClasseVolta || "convencional"}
                                        onValueChange={(v) => handleTicketDataChange("quick", "busClasseVolta", v)}
                                      >
                                        <SelectTrigger className="h-[34px] bg-slate-50 border-slate-200 rounded-lg text-xs">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="convencional">Convencional</SelectItem>
                                          <SelectItem value="executivo">Executivo</SelectItem>
                                          <SelectItem value="leito">Leito</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="space-y-1.5">
                                    <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-tight">Origem *</Label>
                                    <div className="flex gap-2">
                                      <Input placeholder="Ex: Manaus"
                                        value={ticketData["quick"]?.returnCityOrigin || ""}
                                        onChange={(e) => handleTicketDataChange("quick", "returnCityOrigin", e.target.value)}
                                        className="h-[34px] bg-slate-50 border-slate-200 rounded-lg text-xs flex-1"
                                        data-testid="input-quick-return-city-origin"
                                      />
                                      <Input placeholder="MAO"
                                        value={ticketData["quick"]?.returnOriginAirport || ""}
                                        onChange={(e) => handleTicketDataChange("quick", "returnOriginAirport", e.target.value)}
                                        className="h-[34px] bg-slate-50 border-slate-200 rounded-lg text-[10px] font-bold uppercase text-center"
                                        style={{width:56,fontSize:10,fontWeight:700}}
                                        data-testid="input-quick-return-origin-airport"
                                      />
                                    </div>
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-tight">Destino *</Label>
                                    <div className="flex gap-2">
                                      <Input placeholder="Ex: São Paulo"
                                        value={ticketData["quick"]?.returnCityDestination || ""}
                                        onChange={(e) => handleTicketDataChange("quick", "returnCityDestination", e.target.value)}
                                        className="h-[34px] bg-slate-50 border-slate-200 rounded-lg text-xs flex-1"
                                        data-testid="input-quick-return-city-destination"
                                      />
                                      <Input placeholder="GRU"
                                        value={ticketData["quick"]?.returnDestinationAirport || ""}
                                        onChange={(e) => handleTicketDataChange("quick", "returnDestinationAirport", e.target.value)}
                                        className="h-[34px] bg-slate-50 border-slate-200 rounded-lg text-[10px] font-bold uppercase text-center"
                                        style={{width:56,fontSize:10,fontWeight:700}}
                                        data-testid="input-quick-return-destination-airport"
                                      />
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                      <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-tight">Data *</Label>
                                      <Input type="date"
                                        value={ticketData["quick"]?.actualReturnDate || ""}
                                        onChange={(e) => handleTicketDataChange("quick", "actualReturnDate", e.target.value)}
                                        className="h-[34px] bg-slate-50 border-slate-200 rounded-lg text-xs"
                                        data-testid="input-quick-return-date"
                                      />
                                    </div>
                                    <div className="space-y-1.5">
                                      <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-tight">Horário *</Label>
                                      <Input type="time"
                                        value={ticketData["quick"]?.actualReturnTime || ""}
                                        onChange={(e) => handleTicketDataChange("quick", "actualReturnTime", e.target.value)}
                                        className="h-[34px] bg-slate-50 border-slate-200 rounded-lg text-xs"
                                        data-testid="input-quick-return-time"
                                      />
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          </section>
                        );
                      })()}
                    </div>
                  </div>
                  </>)}
                </div>

                {/* Coluna direita (4 cols) */}
                <div className="col-span-12 lg:col-span-4 space-y-2">

                  {/* Anexos */}
                  <section className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border-b border-slate-100">
                      <div className="w-5 h-5 rounded-md bg-[#0033CC] flex items-center justify-center shrink-0">
                        <Paperclip className="w-3 h-3 text-white" />
                      </div>
                      <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-600">Anexos</h4>
                    </div>
                    <div className="p-3">
                      <AttachmentUpload
                        attachmentIds={ticketData["quick"]?.attachmentIds || []}
                        onAttachmentsChange={(attachmentIds) => handleTicketDataChange("quick", "attachmentIds", attachmentIds)}
                        disabled={!canEditScreen(user, 'tickets')}
                      />
                    </div>
                  </section>

                  {/* Observações */}
                  <section className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border-b border-slate-100">
                      <div className="w-5 h-5 rounded-md bg-[#0033CC] flex items-center justify-center shrink-0">
                        <NotebookPen className="w-3 h-3 text-white" />
                      </div>
                      <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-600">Observações</h4>
                    </div>
                    <div className="p-3">
                      <Textarea
                        placeholder="Adicione notas relevantes sobre este lote de passagens..."
                        value={ticketData["quick"]?.ticketObservations || ""}
                        onChange={(e) => handleTicketDataChange("quick", "ticketObservations", e.target.value)}
                        className="text-xs resize-none bg-slate-50 border-slate-200 rounded-lg"
                        style={{height:60}}
                        data-testid="textarea-quick-ticket-observations"
                      />
                    </div>
                  </section>

                  {/* Status da operação */}
                  {(() => {
                    const q = ticketData["quick"];
                                        const hasLoc = !!(q?.purchaseOrderNumber);
                    const hasOrigin = !!(q?.departureCityOrigin && q?.departureAirport);
                    const hasDestination = !!(q?.departureCityDestination && q?.destinationAirport);
                    const hasDates = !!(q?.actualDepartureDate && q?.actualDepartureTime);
                    const attachCount = q?.attachmentIds?.length || 0;

                    // 3-state logic: green=done, yellow=partial, red=empty
                    const financialStatus = hasLoc ? 'done' : 'empty';
                    const idaStatus = hasOrigin && hasDestination && hasDates ? 'done' : hasOrigin || hasDestination ? 'partial' : 'empty';
                    const attachStatus = attachCount > 0 ? 'done' : 'empty';
                    const selectionStatus = selectedTickets.length > 0 ? 'done' : 'empty';

                    const dot = (status: 'done'|'partial'|'empty') => {
                      const map = { done: 'bg-green-500', partial: 'bg-yellow-400', empty: 'bg-red-400' };
                      const pulse = status === 'partial' ? 'animate-pulse' : '';
                      return <div className={`w-2 h-2 rounded-full shrink-0 ${map[status]} ${pulse}`} />;
                    };
                    const textColor = (status: 'done'|'partial'|'empty') =>
                      status === 'done' ? 'text-slate-700' : status === 'partial' ? 'text-yellow-700' : 'text-slate-400';

                    return (
                      <div className="rounded-xl border border-slate-200 overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border-b border-slate-100">
                          <div className="w-5 h-5 rounded-md bg-slate-500 flex items-center justify-center shrink-0">
                            <ClipboardCheck className="w-3 h-3 text-white" />
                          </div>
                          <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-600">Status da Operação</h4>
                        </div>
                        <ul className="p-3 space-y-2 bg-white">
                          <li className="flex items-center gap-2">
                            {dot(financialStatus)}
                            <div className="flex-1 min-w-0">
                              <p className={`text-[11px] font-semibold ${textColor(financialStatus)}`}>Dados financeiros</p>
                              <p className="text-[10px] text-slate-400">
                                {financialStatus === 'done' ? 'LOC preenchida' : 'LOC pendente'}
                              </p>
                            </div>
                          </li>
                          <li className="flex items-center gap-2">
                            {dot(idaStatus)}
                            <div className="flex-1 min-w-0">
                              <p className={`text-[11px] font-semibold ${textColor(idaStatus)}`}>
                                {q?.transportType === "rodoviario" ? "Trecho de embarque" : q?.transportType === "van" ? "Trajeto da van" : "Trecho de ida"}
                              </p>
                              <p className="text-[10px] text-slate-400">
                                {idaStatus === 'done' ? 'Origem, destino e data OK' : idaStatus === 'partial' ? 'Informações incompletas' : 'Nenhum campo preenchido'}
                              </p>
                            </div>
                          </li>
                          <li className="flex items-center gap-2">
                            {dot(attachStatus)}
                            <div className="flex-1 min-w-0">
                              <p className={`text-[11px] font-semibold ${textColor(attachStatus)}`}>Arquivos anexados</p>
                              <p className="text-[10px] text-slate-400">{attachCount > 0 ? `${attachCount} arquivo(s)` : 'Nenhum (opcional)'}</p>
                            </div>
                          </li>
                          <li className="flex items-center gap-2">
                            {dot(selectionStatus)}
                            <div className="flex-1 min-w-0">
                              <p className={`text-[11px] font-semibold ${textColor(selectionStatus)}`}>Passagens selecionadas</p>
                              <p className="text-[10px] text-slate-400">
                                {selectedTickets.length > 0 ? `${selectedTickets.length} na fila` : 'Selecione na tabela'}
                              </p>
                            </div>
                          </li>
                        </ul>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Rodapé de ação */}
              <div className="border-t border-slate-100 px-4 py-2 bg-slate-50 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {/* Badge de passageiros */}
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all ${selectedTickets.length > 0 ? 'bg-[#0033CC] text-white shadow-md shadow-blue-200' : 'bg-slate-200 text-slate-400'}`}>
                    <span className="material-symbols-outlined" style={{fontSize:16}}>group</span>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-widest opacity-70 leading-none mb-0.5">Passageiros</p>
                      <p className="text-[18px] font-black leading-none">{selectedTickets.length}</p>
                    </div>
                  </div>

                  <div className="h-7 w-px bg-slate-200" />

                  {/* Pill de status */}
                  {(() => {
                    const q = ticketData["quick"];
                    const ready = selectedTickets.length > 0 && !!(q?.value) && !!(q?.purchaseOrderNumber) && !!(q?.departureAirport) && !!(q?.destinationAirport) && !!(q?.actualDepartureDate);
                    const partial = !ready && (selectedTickets.length > 0 || !!(q?.value));
                    if (ready) return (
                      <span className="flex items-center gap-1.5 px-4 py-1.5 bg-green-100 text-green-700 rounded-full text-[11px] font-bold uppercase tracking-wide">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        Pronto para processar
                      </span>
                    );
                    if (partial) return (
                      <span className="flex items-center gap-1.5 px-4 py-1.5 bg-yellow-100 text-yellow-700 rounded-full text-[11px] font-bold uppercase tracking-wide">
                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                        Em andamento
                      </span>
                    );
                    return (
                      <span className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-100 text-slate-400 rounded-full text-[11px] font-bold uppercase tracking-wide">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                        Aguardando dados
                      </span>
                    );
                  })()}
                </div>

                <div className="flex items-center gap-3">
                  {canEditScreen(user, 'tickets') && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setTicketData(prev => { const d = {...prev}; delete d["quick"]; return d; }); }}
                        disabled={!ticketData["quick"] || Object.keys(ticketData["quick"]).length === 0}
                        className="h-[34px] rounded-lg border-slate-200 text-[12px] text-slate-500 hover:text-slate-700"
                        data-testid="button-clear-quick"
                      >
                        Limpar
                      </Button>
                      <Button
                        onClick={handleApplyToSelected}
                        disabled={selectedTickets.length === 0 || createTicketMutation.isPending}
                        data-testid="button-apply-to-selected"
                        className="h-[34px] px-5 font-bold rounded-lg text-[12px] flex items-center gap-2 transition-all"
                        style={{
                          background: selectedTickets.length === 0 ? '#E2E8F0' : '#0033CC',
                          color: selectedTickets.length === 0 ? '#94A3B8' : 'white',
                          boxShadow: selectedTickets.length > 0 ? '0 4px 14px rgba(0,51,204,0.3)' : 'none',
                          cursor: selectedTickets.length === 0 ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <span className="material-symbols-outlined" style={{fontSize:18}}>rocket_launch</span>
                        {createTicketMutation.isPending
                          ? "Aplicando..."
                          : `Aplicar a ${selectedTickets.length} Passageiro${selectedTickets.length !== 1 ? 's' : ''}`}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

            {/* ── Barra de filtros ── */}
            <div className="px-5 py-3 border-b border-gray-100 bg-[#FAFBFF] flex flex-wrap items-center justify-between gap-y-2 gap-x-3">

              {/* ── Lado Esquerdo: Busca + Filtros de contexto ── */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Buscar por nome/número */}
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" style={{fontSize:14}}>search</span>
                  <input
                    type="text"
                    placeholder="Nome ou número..."
                    value={filters.searchId ?? ""}
                    onChange={(e) => setFilters(prev => ({ ...prev, searchId: e.target.value }))}
                    className="h-8 pl-8 pr-3 w-44 bg-white border border-gray-200 rounded-lg text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20 transition-all"
                    data-testid="input-search-id"
                  />
                </div>

                {/* Evento */}
                <div className="w-44">
                  <EventCombobox
                    events={events?.filter(e => e.status !== 'excluido' && e.status !== 'excluído')}
                    value={filters.eventId}
                    onValueChange={(value) => setFilters(prev => ({ ...prev, eventId: value }))}
                    placeholder="Evento"
                    testId="filter-event"
                  />
                </div>

                {/* Funções */}
                <div className="w-44">
                  <FunctionMultiSelect
                    functions={functions}
                    selectedIds={Array.isArray(filters.functionId) ? filters.functionId : []}
                    onSelectedChange={(selectedIds) => setFilters(prev => ({ ...prev, functionId: selectedIds }))}
                    placeholder="Funções"
                    testId="filter-function"
                  />
                </div>

                {/* Colaborador */}
                <div className="w-44">
                  <CollaboratorCombobox
                    collaborators={collaborators}
                    value={filters.collaboratorId}
                    onValueChange={(value) => setFilters(prev => ({ ...prev, collaboratorId: value }))}
                    placeholder="Colaborador"
                    testId="filter-collaborator"
                  />
                </div>
              </div>

              {/* ── Lado Direito: Status + Contagem + Limpar ── */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Status Passagem */}
                <select
                  value={filters.ticketStatus}
                  onChange={(e) => setFilters(prev => ({ ...prev, ticketStatus: e.target.value }))}
                  className="h-8 px-2 pr-7 bg-white border border-gray-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20 transition-all"
                  data-testid="filter-ticket-status"
                >
                  <option value="all">Todos os status</option>
                  <option value="pending">Pendentes</option>
                  <option value="processed">Compradas</option>
                </select>

                {/* Status Inclusão */}
                <select
                  value={filters.inclusionStatus}
                  onChange={(e) => setFilters(prev => ({ ...prev, inclusionStatus: e.target.value }))}
                  className="h-8 px-2 pr-7 bg-white border border-gray-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20 transition-all"
                  data-testid="filter-inclusion-status"
                >
                  <option value="active">Inclusões ativas</option>
                  <option value="all">Todas</option>
                  <option value="cancelado">Canceladas</option>
                </select>

                {/* Contagem */}
                <span className="text-[11px] text-slate-400 font-medium bg-white border border-gray-200 px-2.5 py-1 rounded-lg whitespace-nowrap">
                  {filteredTicketInclusions.length} registro{filteredTicketInclusions.length !== 1 ? 's' : ''}
                </span>

                {/* Limpar */}
                <button
                  onClick={() => setFilters({ eventId: "all", functionId: [], collaboratorId: "all", searchId: "", ticketStatus: "all", inclusionStatus: "active" })}
                  className="h-8 px-3 flex items-center gap-1.5 text-xs font-medium text-slate-500 border border-gray-200 hover:border-red-200 hover:text-red-500 hover:bg-red-50 rounded-lg bg-white transition-colors whitespace-nowrap"
                  data-testid="button-clear-filters"
                >
                  <span className="material-symbols-outlined" style={{fontSize:13}}>close</span>
                  Limpar
                </button>
              </div>
            </div>
          {filteredTicketInclusions.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
                <Plane className="w-7 h-7 text-blue-200" />
              </div>
              <h3 className="text-[15px] font-bold text-slate-600 mb-1">
                {filters.ticketStatus === "pending" ? "Nenhuma passagem pendente" : 
                 filters.ticketStatus === "processed" ? "Nenhuma passagem comprada" : 
                 "Nenhuma passagem encontrada"}
              </h3>
              <p className="text-[13px] text-slate-400">
                {filters.ticketStatus === "pending" 
                  ? "Todas as passagens foram compradas ou não há colaboradores escalados."
                  : filters.ticketStatus === "processed"
                  ? "Nenhuma passagem foi comprada ainda."
                  : "Não há colaboradores escalados que necessitem de passagens."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead style={{ background: "#F8FAFC", borderBottom: "2px solid #E2E8F0" }}>
                  <tr>
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selectedTickets.length > 0}
                        onChange={toggleAllTickets}
                        className="rounded border-gray-300 accent-blue-600"
                        data-testid="checkbox-select-all"
                      />
                    </th>
                    <th className="px-3 py-3 text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 w-[64px]">ID</th>
                    <SortableHeader field="function" sortConfig={sortConfig} onSort={handleSort}>Evento / Função</SortableHeader>
                    <SortableHeader field="collaborator" sortConfig={sortConfig} onSort={handleSort}>Colaborador</SortableHeader>
                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">Destino</th>
                    <SortableHeader field="diarias" sortConfig={sortConfig} onSort={handleSort}>Datas e Horários</SortableHeader>
                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">Sugestões</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 text-center">Status</th>
                    <th className="py-3 text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 text-center w-[72px]">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTicketInclusions.map((inclusion, rowIdx) => {
                    const ticket = getTicket(inclusion.id);
                    return (
                      <tr
                        key={inclusion.id}
                        className={`transition-colors group border-b border-slate-100 last:border-0 ${pendingSwapByInclusion.has(inclusion.id) ? 'bg-amber-50/40' : rowIdx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}`}
                        style={{
                          opacity: inclusion.status === 'cancelado' ? 0.5 : 1,
                          borderLeft: pendingSwapByInclusion.has(inclusion.id)
                            ? '3px solid #F59E0B'
                            : inclusion.status === 'cancelado'
                            ? '3px solid #E2E8F0'
                            : ticket
                            ? '3px solid #22C55E'
                            : '3px solid #F97316'
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '#EEF2FF33';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLTableRowElement).style.backgroundColor =
                            rowIdx % 2 === 1 ? '#F8FAFC80' : '#ffffff';
                        }}
                      >
                        {/* Checkbox — só para PENDENTES */}
                        <td className="px-4 py-3 whitespace-nowrap w-10" onClick={(e) => e.stopPropagation()}>
                          {!ticket && inclusion.status !== 'cancelado' ? (
                            <input
                              type="checkbox"
                              checked={selectedTickets.includes(inclusion.id)}
                              onChange={() => toggleTicketSelection(inclusion.id)}
                              className="rounded border-gray-300 accent-blue-600"
                              data-testid={`checkbox-ticket-${inclusion.id}`}
                            />
                          ) : (
                            <div className="w-4 h-4" />
                          )}
                        </td>

                        {/* ID */}
                        <td className={`px-3 py-3 w-[64px] ${inclusion.status === 'cancelado' ? 'opacity-60' : 'cursor-pointer'}`} onClick={inclusion.status === 'cancelado' ? undefined : () => handleViewTicketDetails(inclusion)}>
                          <span style={{display:'inline-block',background:'#EEF2FF',color:'#3B4FE4',fontSize:13,fontWeight:600,borderRadius:6,padding:'4px 8px',whiteSpace:'nowrap'}}>
                            #{inclusion.inclusionNumber || 'N/A'}
                          </span>
                        </td>

                        {/* Evento / Função */}
                        <td className={`px-4 py-3 cursor-pointer ${inclusion.status === 'cancelado' ? 'opacity-60' : ''}`} onClick={() => handleViewTicketDetails(inclusion)}>
                          {(() => {
                            const eventName = getEventName(inclusion.eventId);
                            const notFound = eventName === 'Evento não encontrado';
                            return (
                              <>
                                {notFound ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-500 text-[11px] font-semibold rounded-md">
                                    ⚠ Não encontrado
                                  </span>
                                ) : (
                                  <p style={{fontSize:14,fontWeight:600,color:'#1a1a2e'}}>{eventName}</p>
                                )}
                                <p style={{fontSize:12,color:'#999',marginTop:2}}>{getFunctionName(inclusion.functionId)}</p>
                              </>
                            );
                          })()}
                        </td>

                        {/* Colaborador — avatar com iniciais */}
                        <td className={`px-4 py-3 cursor-pointer ${inclusion.status === 'cancelado' ? 'opacity-60' : ''}`} onClick={() => handleViewTicketDetails(inclusion)}>
                          {(() => {
                            const rawName = getCollaboratorName(inclusion.collaboratorId || undefined);
                            const name = toTitleCase(rawName);
                            const initials = rawName === 'Não escalado' ? '?' : rawName.split(' ').filter(Boolean).slice(0,2).map(n => n[0]).join('').toUpperCase();
                            return (
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0" style={{background:'#E8EFFE',color:'#3B4FE4'}}>{initials}</div>
                                <div>
                                  <span className="text-[14px] font-[500] text-[#1a1a2e]">{name}</span>
                                  {pendingSwapByInclusion.has(inclusion.id) && (
                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-100 mt-0.5">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 animate-pulse" />
                                      <span className="text-[10px] font-medium text-amber-600">Troca pendente</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </td>

                        {/* Destino — adapta por tipo de transporte */}
                        <td className={`px-4 py-3 cursor-pointer ${inclusion.status === 'cancelado' ? 'opacity-60' : ''}`} onClick={() => handleViewTicketDetails(inclusion)}>
                          {ticket ? (
                            ticket.transportType === 'van' ? (
                              /* VAN: empresa + destino do evento */
                              <div className="flex flex-col gap-0.5">
                                <p className="text-[14px] font-semibold text-[#111827]">{getEventLocation(inclusion.eventId)}</p>
                                {ticket.purchaseOrderNumber && (
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <span className="material-symbols-outlined text-slate-400" style={{fontSize:12}}>directions_bus</span>
                                    <span className="text-[11px] font-medium text-[#6B7280]">{ticket.purchaseOrderNumber}</span>
                                  </div>
                                )}
                              </div>
                            ) : ticket.transportType === 'rodoviario' ? (
                              /* RODOVIÁRIO: cidades de origem/destino */
                              <div className="flex flex-col gap-0.5">
                                <p className="text-[14px] font-semibold text-[#111827]">{getEventLocation(inclusion.eventId)}</p>
                                {(ticket.departureCityOrigin || ticket.departureCityDestination) && (
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <span className="material-symbols-outlined text-slate-400" style={{fontSize:12}}>directions_bus</span>
                                    <span className="text-[11px] font-medium text-[#6B7280]">{ticket.departureCityOrigin || '—'}</span>
                                    <span className="text-[10px] text-slate-300">→</span>
                                    <span className="text-[11px] font-medium text-[#6B7280]">{ticket.departureCityDestination || '—'}</span>
                                  </div>
                                )}
                                {(ticket.returnCityOrigin || ticket.returnCityDestination) && !ticket.isOneWay && (
                                  <div className="flex items-center gap-1">
                                    <span className="material-symbols-outlined text-slate-400" style={{fontSize:12}}>directions_bus</span>
                                    <span className="text-[11px] font-medium text-[#6B7280]">{ticket.returnCityOrigin || '—'}</span>
                                    <span className="text-[10px] text-slate-300">→</span>
                                    <span className="text-[11px] font-medium text-[#6B7280]">{ticket.returnCityDestination || '—'}</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              /* AÉREO: aeroportos */
                              <div className="flex flex-col gap-0.5">
                                <p className="text-[14px] font-semibold text-[#111827]">{getEventLocation(inclusion.eventId)}</p>
                                {(ticket.departureAirport || ticket.destinationAirport) && (
                                  <>
                                    <div className="flex items-center gap-1 mt-0.5">
                                      <span className="material-symbols-outlined text-slate-400" style={{fontSize:12}}>flight_takeoff</span>
                                      <span className="text-[11px] font-medium text-[#6B7280] uppercase">{ticket.departureAirport || '—'}</span>
                                      <span className="text-[10px] text-slate-300">→</span>
                                      <span className="text-[11px] font-medium text-[#6B7280] uppercase">{ticket.destinationAirport || '—'}</span>
                                    </div>
                                    {!ticket.isOneWay && (
                                      <div className="flex items-center gap-1">
                                        <span className="material-symbols-outlined text-slate-400" style={{fontSize:12}}>flight_land</span>
                                        <span className="text-[11px] font-medium text-[#6B7280] uppercase">{ticket.destinationAirport || '—'}</span>
                                        <span className="text-[10px] text-slate-300">→</span>
                                        <span className="text-[11px] font-medium text-[#6B7280] uppercase">{ticket.departureAirport || '—'}</span>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            )
                          ) : (
                            <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                              <span className="material-symbols-outlined text-slate-400" style={{fontSize:16}}>location_on</span>
                              <span>{getEventLocation(inclusion.eventId)}</span>
                            </div>
                          )}
                        </td>

                        {/* Datas e Horários — adapta ícones por tipo */}
                        <td className={`px-4 py-3 cursor-pointer whitespace-nowrap ${inclusion.status === 'cancelado' ? 'opacity-60' : ''}`} onClick={() => handleViewTicketDetails(inclusion)}>
                          {ticket ? (
                            ticket.transportType === 'van' ? (
                              /* VAN: sem datas, só confirmação */
                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-bold text-[#16A34A] tracking-wide">✓ Van confirmada</span>
                              </div>
                            ) : (
                              /* AÉREO / RODOVIÁRIO: datas e horários */
                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-bold text-[#16A34A] tracking-wide mb-0.5">
                                  {ticket.transportType === 'rodoviario' ? '✓ Passagem confirmada' : '✓ Passagem confirmada'}
                                </span>
                                <div className="flex items-center gap-2 text-xs">
                                  {ticket.transportType === 'rodoviario'
                                    ? <span className="material-symbols-outlined text-[#16A34A]" style={{fontSize:13}}>directions_bus</span>
                                    : <span className="material-symbols-outlined text-[#16A34A]" style={{fontSize:13}}>flight_takeoff</span>
                                  }
                                  <span className="font-bold text-slate-700">{ticket.actualDepartureDate ? formatDate(ticket.actualDepartureDate) : '—'}</span>
                                  {ticket.actualDepartureTime && <span className="text-slate-400 font-medium">{ticket.actualDepartureTime}</span>}
                                </div>
                                {!ticket.isOneWay && (
                                  <div className="flex items-center gap-2 text-xs">
                                    {ticket.transportType === 'rodoviario'
                                      ? <span className="material-symbols-outlined text-[#22C55E]" style={{fontSize:13}}>directions_bus</span>
                                      : <span className="material-symbols-outlined text-[#22C55E]" style={{fontSize:13}}>flight_land</span>
                                    }
                                    <span className="font-bold text-slate-700">{ticket.actualReturnDate ? formatDate(ticket.actualReturnDate) : '—'}</span>
                                    {ticket.actualReturnTime && <span className="text-slate-400 font-medium">{ticket.actualReturnTime}</span>}
                                  </div>
                                )}
                              </div>
                            )
                          ) : (
                            <span className="text-sm text-slate-300 italic">Não comprada</span>
                          )}
                        </td>

                        {/* Voos Sugeridos */}
                        <td className={`px-4 py-3 cursor-pointer ${inclusion.status === 'cancelado' ? 'opacity-60' : ''}`} onClick={() => handleViewTicketDetails(inclusion)}>
                          {(() => {
                            const travelInfo = extractTravelInfoFromObservations(inclusion.observations || undefined, inclusion);
                            const idaVazia = travelInfo.ida === 'Não definido' || travelInfo.ida === 'Não informado';
                            const voltaVazia = travelInfo.retorno === 'Não definido' || travelInfo.retorno === 'Não informado';
                            if (idaVazia && voltaVazia) {
                              return <span className="text-[11px] text-slate-300 italic">—</span>;
                            }
                            return (
                              <div className="flex flex-col gap-0.5" title="Horário sugerido — ainda não confirmado">
                                <span className="text-[9px] font-black uppercase tracking-widest text-amber-500 mb-0.5">Sugestão</span>
                                {!idaVazia && (
                                  <div className="flex items-center gap-1 text-[11px] flex-nowrap">
                                    <span className="material-symbols-outlined text-amber-400 shrink-0" style={{fontSize:11}}>flight_takeoff</span>
                                    <span className="font-semibold text-slate-700 whitespace-nowrap">{formatSuggestionDate(travelInfo.ida)}</span>
                                    {travelInfo.chegada !== 'Não definido' && travelInfo.chegada !== 'Não informado' && (
                                      <span className="text-slate-400 whitespace-nowrap">{travelInfo.chegada}</span>
                                    )}
                                  </div>
                                )}
                                {!voltaVazia && (
                                  <div className="flex items-center gap-1 text-[11px] flex-nowrap">
                                    <span className="material-symbols-outlined text-amber-400 shrink-0" style={{fontSize:11}}>flight_land</span>
                                    <span className="font-semibold text-slate-700 whitespace-nowrap">{formatSuggestionDate(travelInfo.retorno)}</span>
                                    {travelInfo.horario !== 'Não definido' && travelInfo.horario !== 'Não informado' && (
                                      <span className="text-slate-400 whitespace-nowrap">{travelInfo.horario}</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </td>

                        {/* Status */}
                        <td className={`px-4 py-3 cursor-pointer text-center ${inclusion.status === 'cancelado' ? 'opacity-60' : ''}`} onClick={() => handleViewTicketDetails(inclusion)}>
                          {inclusion.status === 'cancelado' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-400 text-[10px] font-bold tracking-wide rounded-md">
                              Cancelado
                            </span>
                          ) : ticket ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold tracking-wide rounded-md" style={{background:'#DCFCE7',color:'#15803D'}}>
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                              Comprada
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold tracking-wide rounded-md" style={{background:'#FEF9C3',color:'#B45309'}}>
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                              Pendente
                            </span>
                          )}
                        </td>

                        {/* Ações — ícone-apenas, largura fixa 72px */}
                        <td className="py-3 text-center whitespace-nowrap w-[72px]">
                          {inclusion.status !== 'cancelado' && (
                            ticket ? (
                              <button
                                onClick={() => handleViewTicketDetails(inclusion)}
                                data-testid={`view-ticket-${inclusion.inclusionNumber}`}
                                title="Visualizar passagem"
                                className="w-8 h-8 rounded-full flex items-center justify-center mx-auto transition-colors"
                                style={{background:'#F1F5F9',color:'#94A3B8'}}
                                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background='#EEF2FF'; (e.currentTarget as HTMLButtonElement).style.color='#3B4FE4'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background='#F1F5F9'; (e.currentTarget as HTMLButtonElement).style.color='#94A3B8'; }}
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            ) : canEditScreen(user, "tickets") ? (
                              <button
                                onClick={() => handleViewTicketDetails(inclusion)}
                                data-testid={`buy-ticket-${inclusion.inclusionNumber}`}
                                title="Registrar passagem"
                                className="w-8 h-8 flex items-center justify-center mx-auto transition-colors"
                                style={{background:'#EEF2FF',color:'#3B4FE4',border:'none',borderRadius:8,cursor:'pointer'}}
                                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background='#3B4FE4'; (e.currentTarget as HTMLButtonElement).style.color='#fff'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background='#EEF2FF'; (e.currentTarget as HTMLButtonElement).style.color='#3B4FE4'; }}
                              >
                                <Plane className="w-4 h-4" />
                              </button>
                            ) : null
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          </div>
        </div>

        {/* Modal de Detalhes da Passagem — com abas */}
        <Dialog open={showModal} onOpenChange={(open) => { setShowModal(open); if (!open) setEditingTicketId(null); }} modal={!showSuccessModal}>
          <DialogContent className="!max-w-[1100px] w-[95vw] max-h-[88vh] !flex !flex-col p-0 gap-0 overflow-hidden">
            {selectedInclusion && (() => {
              const lbl = "text-[10px] uppercase tracking-[0.12em] text-slate-400 font-black mb-1";
              const val = "text-[13px] font-semibold text-slate-700";
              const tabTrigger = "relative rounded-none border-b-2 border-transparent data-[state=active]:border-[#2563EB] data-[state=active]:text-[#2563EB] text-slate-500 bg-transparent data-[state=active]:bg-transparent px-4 pb-3 pt-2 text-sm font-medium shadow-none hover:text-slate-700 transition-colors";
              const ticket = getTicket(selectedInclusion.id);
              const data = ticketData[selectedInclusion.id] || {};
              const collaborator = getCollaborator(selectedInclusion.collaboratorId || undefined);
              const roMode = isReadOnly(selectedInclusion, user);
              const canEditTicket = canEditScreen(user, 'tickets');
              const isFormMode = !ticket || editingTicketId === selectedInclusion.id;
              return (
                <>
                  {/* ─── HEADER ─── */}
                  <div className="px-6 pt-5 pb-4 border-b border-slate-100 shrink-0 flex items-center gap-4 pr-14" style={{ background: 'linear-gradient(to right, #f8faff 0%, #ffffff 60%)' }}>
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center text-white shrink-0"
                      style={{ background: 'linear-gradient(135deg, #3b7ef8 0%, #1d4ed8 100%)', boxShadow: '0 4px 16px #2563EB30' }}
                    >
                      <Plane style={{ width: 20, height: 20 }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <DialogTitle className="text-[17px] font-bold text-slate-900 leading-tight m-0 p-0">
                        Registro de Passagem
                      </DialogTitle>
                      <div className="text-[12px] text-slate-400 mt-0.5 truncate">
                        <span className="font-mono font-bold text-slate-500">#{selectedInclusion.inclusionNumber || 'N/A'}</span>
                        <span className="mx-1.5 text-slate-300">·</span>
                        {getCollaboratorName(selectedInclusion.collaboratorId || undefined)}
                      </div>
                    </div>
                    {roMode ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 text-[11px] font-bold rounded-full shrink-0 border border-amber-200">
                        Somente Leitura
                      </span>
                    ) : ticket && editingTicketId !== selectedInclusion.id ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 text-[11px] font-bold rounded-full shrink-0 border border-green-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />Comprada
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-orange-600 text-[11px] font-bold rounded-full shrink-0 border border-orange-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />Pendente
                      </span>
                    )}
                  </div>

                  {/* ─── ABAS ─── */}
                  <Tabs value={modalActiveTab} onValueChange={setModalActiveTab} className="flex-1 flex flex-col overflow-hidden min-h-0">
                    <div className="px-6 border-b border-slate-100 shrink-0">
                      <TabsList className="bg-transparent p-0 h-auto gap-0 rounded-none -mb-px">
                        <TabsTrigger value="resumo" className={tabTrigger}>Resumo</TabsTrigger>
                        <TabsTrigger value="dados" className={tabTrigger}>
                          Dados da Passagem
                          {ticket && editingTicketId !== selectedInclusion.id
                            ? <span className="ml-1.5 bg-green-100 text-green-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">✓</span>
                            : <span className="ml-1.5 bg-amber-100 text-amber-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">!</span>
                          }
                        </TabsTrigger>
                        <TabsTrigger value="complementos" className={tabTrigger}>Complementos e Histórico</TabsTrigger>
                      </TabsList>
                    </div>

                    {/* ── Área de conteúdo das abas ── */}
                    <div className="flex-1 overflow-y-auto min-h-0">

                      {/* ══ ABA: RESUMO ══ */}
                      <TabsContent value="resumo" className="m-0 p-6">
                        <div className="grid grid-cols-3 gap-5">

                          {/* Col 1: Informações Básicas */}
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
                              <div className={lbl}>Passagem</div>
                              {ticket ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-lg border border-blue-100">
                                  <Plane style={{ width: 9, height: 9 }} />Registrada
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-600 text-[10px] font-bold rounded-lg border border-amber-200">
                                  <Plane style={{ width: 9, height: 9 }} />Pendente
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Col 2: Colaborador */}
                          <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 space-y-3">
                            <div>
                              <div className={lbl}>Colaborador</div>
                              <div className={val}>{getCollaboratorName(selectedInclusion.collaboratorId || undefined)}</div>
                            </div>
                            {collaborator && (<>
                              <div>
                                <div className={lbl}>Documento</div>
                                <div className="text-[13px] font-semibold text-slate-700 font-mono">{collaborator.documentType?.toUpperCase() || 'N/A'}: {collaborator.officialDocument || 'N/A'}</div>
                              </div>
                              <div>
                                <div className={lbl}>Data de Nascimento</div>
                                <div className={val}>{collaborator.birthDate ? formatDate(collaborator.birthDate) : 'N/A'}</div>
                              </div>
                              <div>
                                <div className={lbl}>Tipo</div>
                                <div className={val}>{collaborator.type || '—'}</div>
                              </div>
                            </>)}
                            {/* Badge de status de troca — painel completo fica abaixo do grid */}
                            {(pendingSwap || latestSwap) && (() => {
                              const swap = pendingSwap || latestSwap!;
                              const swapStatus = (swap as any).status || swap.status;
                              if (swapStatus === 'pendente') return (
                                <div title="Há uma solicitação de troca de colaborador aguardando análise de Compras.">
                                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-50 border border-amber-100 text-[11px] text-amber-700 cursor-default">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                                    Troca solicitada · <span className="font-semibold">Aguardando análise</span>
                                  </span>
                                </div>
                              );
                              if (swapStatus === 'aprovado') return (
                                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-green-50 border border-green-100 text-[11px] text-green-700">
                                  <CheckCheck className="w-3 h-3 shrink-0" />Troca aprovada por Compras
                                </span>
                              );
                              if (swapStatus === 'rejeitado') return (
                                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-50 border border-red-100 text-[11px] text-red-700">
                                  <XCircle className="w-3 h-3 shrink-0" />Troca rejeitada por Compras
                                </span>
                              );
                              return null;
                            })()}
                          </div>

                          {/* Col 3: Período + Sugestões */}
                          <div className="space-y-3">
                            <div className="border border-slate-200 rounded-2xl overflow-hidden">
                              <div className="bg-[#2563EB]/5 border-b border-slate-200 px-4 py-2.5 flex items-center gap-2">
                                <span className="text-[11px] font-black text-[#2563EB] uppercase tracking-[0.12em]">Período de Trabalho</span>
                              </div>
                              <div className="p-4">
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <div className={lbl}>Início</div>
                                    <div className={val}>{selectedInclusion.scheduleStartDate ? formatDate(selectedInclusion.scheduleStartDate) : '—'}</div>
                                  </div>
                                  <div>
                                    <div className={lbl}>Término</div>
                                    <div className={val}>{selectedInclusion.scheduleEndDate ? formatDate(selectedInclusion.scheduleEndDate) : '—'}</div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Sugestões de Viagem */}
                            {(() => {
                              const travelInfo = extractTravelInfoFromObservations(selectedInclusion.observations || undefined, selectedInclusion);
                              const notEmpty = (v: string) => v && v !== 'N/A' && v !== 'Não definido' && v !== 'Não informado';
                              return (
                                <div className="border border-blue-200 rounded-2xl overflow-hidden">
                                  <div className="bg-blue-50 border-b border-blue-200 px-4 py-2.5 flex items-center gap-2">
                                    <Plane className="w-3.5 h-3.5 text-blue-500" />
                                    <span className="text-[11px] font-black text-blue-600 uppercase tracking-[0.12em]">Datas Sugeridas</span>
                                  </div>
                                  <div className="p-4 grid grid-cols-2 gap-2">
                                    <div className="bg-white border border-blue-100 rounded-xl p-2.5">
                                      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-400 mb-1.5">🛫 IDA</div>
                                      <div className="text-[11px] text-slate-500">Data</div>
                                      <div className="text-[12px] font-semibold text-slate-700">{notEmpty(travelInfo.ida) ? formatSuggestionDate(travelInfo.ida) : '—'}</div>
                                      <div className="text-[11px] text-slate-500 mt-1">Horário</div>
                                      <div className="text-[12px] font-semibold text-slate-700">{notEmpty(travelInfo.chegada) ? travelInfo.chegada : '—'}</div>
                                    </div>
                                    <div className="bg-white border border-blue-100 rounded-xl p-2.5">
                                      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-400 mb-1.5">🛬 VOLTA</div>
                                      <div className="text-[11px] text-slate-500">Data</div>
                                      <div className="text-[12px] font-semibold text-slate-700">{notEmpty(travelInfo.retorno) ? formatSuggestionDate(travelInfo.retorno) : '—'}</div>
                                      <div className="text-[11px] text-slate-500 mt-1">Horário</div>
                                      <div className="text-[12px] font-semibold text-slate-700">{notEmpty(travelInfo.horario) ? travelInfo.horario : '—'}</div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>

                        </div>

                        {/* ══ PAINEL DE ANÁLISE DE TROCA ══ */}
                        {pendingSwap && (() => {
                          const swap = pendingSwap;
                          const swapCreatedAt = (swap as any).created_at || swap.createdAt;
                          const formatSwapDT = (dt: any) => {
                            if (!dt) return '—';
                            const d = new Date(dt);
                            const day = String(d.getDate()).padStart(2,'0');
                            const mon = String(d.getMonth()+1).padStart(2,'0');
                            const hrs = String(d.getHours()).padStart(2,'0');
                            const min = String(d.getMinutes()).padStart(2,'0');
                            return `${day}/${mon}/${d.getFullYear()} às ${hrs}:${min}`;
                          };
                          const currentCollabName = toTitleCase(getCollaboratorName(selectedInclusion.collaboratorId || undefined));
                          const requestedCollabName = toTitleCase(getCollaboratorName((swap as any).new_collaborator_id));
                          const requestedByName = (swap as any).requested_by_name || '—';
                          const hasTicketPurchased = ['passagem_comprada', 'hospedagem_passagem_comprada'].includes(selectedInclusion.status);
                          return (
                            <div className="mt-5 rounded-2xl border border-slate-200 shadow-sm bg-white overflow-hidden">
                              <div className="flex items-start justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">
                                <div>
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <ArrowLeftRight className="w-4 h-4 text-slate-400" />
                                    <span className="text-[13px] font-bold text-slate-700">Solicitação de troca de colaborador</span>
                                  </div>
                                  <p className="text-[11px] text-slate-400 pl-6">
                                    Solicitado por <span className="font-medium text-slate-500">{requestedByName}</span> em {formatSwapDT(swapCreatedAt)}
                                  </p>
                                </div>
                                <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full border border-amber-200 whitespace-nowrap shrink-0 mt-0.5">Aguardando análise</span>
                              </div>
                              <div className="p-5 space-y-4">
                                <div className="flex items-stretch gap-3">
                                  <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 min-w-0">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.08em] mb-1.5">Colaborador atual</p>
                                    <p className="text-[14px] font-semibold text-slate-700 leading-snug">{currentCollabName}</p>
                                  </div>
                                  <div className="flex items-center justify-center shrink-0 px-1">
                                    <ArrowRight className="w-5 h-5 text-slate-300" />
                                  </div>
                                  <div className="flex-1 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 min-w-0">
                                    <p className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.08em] mb-1.5">Colaborador solicitado</p>
                                    <p className="text-[14px] font-semibold text-blue-700 leading-snug">{requestedCollabName}</p>
                                  </div>
                                  <div className="w-px bg-slate-200 shrink-0" />
                                  <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 min-w-0">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.08em] mb-1.5">Motivo da solicitação</p>
                                    <p className="text-[13px] text-slate-600 leading-snug">{swap.reason || '—'}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-4 flex-wrap">
                                  {hasTicketPurchased && (
                                    <div className="flex items-center gap-2 flex-1 min-w-0 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                                      <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                      <p className="text-[11px] text-amber-700 leading-snug">Esta escala possui passagem comprada. Revise os impactos antes de aprovar a troca.</p>
                                    </div>
                                  )}
                                  {isPurchasingRole && (
                                    <div className="flex flex-col items-start gap-1.5 shrink-0">
                                      <p className="text-[10px] text-slate-400">A aprovação libera a alteração do colaborador nesta escala.</p>
                                      <div className="flex gap-2">
                                        <button
                                          onClick={() => setSwapConfirmAction('approve')}
                                          disabled={approveSwapMutation.isPending || rejectSwapMutation.isPending}
                                          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-semibold px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                                        >
                                          <CheckCheck className="w-3.5 h-3.5" />Aprovar troca
                                        </button>
                                        <button
                                          onClick={() => { setSwapConfirmAction('reject'); setSwapRejectReason(''); }}
                                          disabled={approveSwapMutation.isPending || rejectSwapMutation.isPending}
                                          className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[12px] font-semibold px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                                        >
                                          <XCircle className="w-3.5 h-3.5" />Rejeitar troca
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </TabsContent>

                      {/* ══ ABA: DADOS DA PASSAGEM ══ */}
                      <TabsContent value="dados" className="m-0 p-6">
                        {ticket && editingTicketId !== selectedInclusion.id ? (
                          /* VIEW MODE */
                          <div className="space-y-4">
                            {/* Header do ticket */}
                            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                              <div className="border-b border-slate-100 px-4 py-3 flex items-center gap-3" style={{ background: 'linear-gradient(to right, #f0f7ff, #ffffff)' }}>
                                <span className="text-xl">
                                  {ticket.transportType === 'van' ? '🚐' : ticket.transportType === 'rodoviario' ? '🚌' : '✈️'}
                                </span>
                                <div>
                                  <div className="text-[12px] font-black text-[#2563EB] uppercase tracking-[0.12em]">
                                    {ticket.transportType === 'van' ? 'Van' : ticket.transportType === 'rodoviario' ? 'Transporte Rodoviário' : 'Passagem Aérea'}
                                  </div>
                                  {ticket.purchaseDate && (
                                    <div className="text-[11px] text-slate-400 mt-0.5">Comprada em {formatDate(ticket.purchaseDate)}</div>
                                  )}
                                </div>
                                {ticket.purchaseOrderNumber && (
                                  <span className="ml-auto text-[11px] font-bold text-slate-500 font-mono bg-slate-100 px-2.5 py-1 rounded-full">
                                    {ticket.transportType === 'van' ? 'Empresa: ' : ticket.transportType === 'rodoviario' ? 'Bilhete: ' : 'LOC: '}{ticket.purchaseOrderNumber}
                                  </span>
                                )}
                              </div>
                              {ticket.transportType !== 'van' && (
                                <div className="px-4 py-3 flex flex-wrap gap-6">
                                  {ticket.purchaseDate && (
                                    <div>
                                      <div className={lbl}>Data da Compra</div>
                                      <div className={val}>{formatDate(ticket.purchaseDate)}</div>
                                    </div>
                                  )}
                                  {ticket.value != null && ticket.value > 0 && (
                                    <div>
                                      <div className={lbl}>Valor da Passagem</div>
                                      <div className="text-[13px] font-semibold text-slate-700">
                                        {(ticket.value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                              {ticket.transportType === 'van' && ticket.ticketObservations && (
                                <div className="p-4">
                                  <div className={lbl}>Observações</div>
                                  <div className="text-sm text-slate-700 whitespace-pre-wrap">{ticket.ticketObservations}</div>
                                </div>
                              )}
                            </div>

                            {/* IDA + VOLTA */}
                            {ticket.transportType !== 'van' && (
                              <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                                  <div className="text-[11px] font-black uppercase tracking-[0.12em] mb-3 flex items-center gap-1.5" style={{ color: '#2563EB' }}>
                                    {ticket.transportType === 'rodoviario' ? '🚌' : '🛫'} IDA
                                  </div>
                                  <div className="space-y-2.5">
                                    {ticket.departureCityOrigin && <div><div className={lbl}>Cidade Origem</div><div className="text-sm font-medium text-slate-700">{ticket.departureCityOrigin}</div></div>}
                                    {ticket.departureAirport && <div><div className={lbl}>{ticket.transportType === 'rodoviario' ? 'Rodoviária Origem' : 'Aeroporto Origem'}</div><div className="text-[13px] font-bold text-slate-700 uppercase font-mono">{ticket.departureAirport}</div></div>}
                                    {ticket.departureCityDestination && <div><div className={lbl}>Cidade Destino</div><div className="text-sm font-medium text-slate-700">{ticket.departureCityDestination}</div></div>}
                                    {ticket.destinationAirport && <div><div className={lbl}>{ticket.transportType === 'rodoviario' ? 'Rodoviária Destino' : 'Aeroporto Destino'}</div><div className="text-[13px] font-bold text-slate-700 uppercase font-mono">{ticket.destinationAirport}</div></div>}
                                    {ticket.actualDepartureDate && <div><div className={lbl}>Data</div><div className="text-[13px] font-semibold text-[#2563EB]">{formatDate(ticket.actualDepartureDate)}</div></div>}
                                    {ticket.actualDepartureTime && (
                                      <div>
                                        <div className={lbl}>Horário</div>
                                        <div className="bg-green-50 border-l-4 border-green-400 rounded-lg px-3 py-2">
                                          <span className="text-lg font-bold text-green-700">{ticket.actualDepartureTime}</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {(ticket.actualReturnDate || ticket.returnCityOrigin) ? (
                                  <div className="bg-white border border-slate-200 rounded-2xl p-4">
                                    <div className="text-[11px] font-black uppercase tracking-[0.12em] mb-3 flex items-center gap-1.5" style={{ color: '#2563EB' }}>
                                      {ticket.transportType === 'rodoviario' ? '🚌' : '🛬'} VOLTA
                                    </div>
                                    <div className="space-y-2.5">
                                      {ticket.returnCityOrigin && <div><div className={lbl}>Cidade Origem</div><div className="text-sm font-medium text-slate-700">{ticket.returnCityOrigin}</div></div>}
                                      {ticket.returnOriginAirport && <div><div className={lbl}>{ticket.transportType === 'rodoviario' ? 'Rodoviária Origem' : 'Aeroporto Origem'}</div><div className="text-[13px] font-bold text-slate-700 uppercase font-mono">{ticket.returnOriginAirport}</div></div>}
                                      {ticket.returnCityDestination && <div><div className={lbl}>Cidade Destino</div><div className="text-sm font-medium text-slate-700">{ticket.returnCityDestination}</div></div>}
                                      {ticket.returnDestinationAirport && <div><div className={lbl}>{ticket.transportType === 'rodoviario' ? 'Rodoviária Destino' : 'Aeroporto Destino'}</div><div className="text-[13px] font-bold text-slate-700 uppercase font-mono">{ticket.returnDestinationAirport}</div></div>}
                                      {ticket.actualReturnDate && <div><div className={lbl}>Data</div><div className="text-[13px] font-semibold text-[#2563EB]">{formatDate(ticket.actualReturnDate)}</div></div>}
                                      {ticket.actualReturnTime && (
                                        <div>
                                          <div className={lbl}>Horário</div>
                                          <div className="bg-green-50 border-l-4 border-green-400 rounded-lg px-3 py-2">
                                            <span className="text-lg font-bold text-green-700">{ticket.actualReturnTime}</span>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-4 flex items-center justify-center">
                                    <div className="text-center">
                                      <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400 mb-1">
                                        {ticket.transportType === 'rodoviario' ? '🚌' : '🛬'} VOLTA
                                      </div>
                                      <div className="text-xs text-slate-300">Apenas ida / sem informações de volta</div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Obs view */}
                            {ticket.ticketObservations && ticket.transportType !== 'van' && (
                              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                                <div className={lbl + " mb-1"}>Observações</div>
                                <div className="text-sm text-slate-700 whitespace-pre-wrap">{ticket.ticketObservations}</div>
                              </div>
                            )}

                            {/* Datas Sugeridas (view mode) */}
                            {(() => {
                              const travelInfo = extractTravelInfoFromObservations(selectedInclusion.observations || undefined, selectedInclusion);
                              const notEmpty = (v: string) => v && v !== 'N/A' && v !== 'Não definido' && v !== 'Não informado';
                              const hasAny = notEmpty(travelInfo.ida) || notEmpty(travelInfo.retorno) || notEmpty(travelInfo.chegada) || notEmpty(travelInfo.horario);
                              if (!hasAny) return null;
                              return (
                                <div className="border border-blue-200 rounded-2xl overflow-hidden">
                                  <div className="bg-blue-50 border-b border-blue-200 px-4 py-2.5 flex items-center gap-2">
                                    <Plane className="w-3.5 h-3.5 text-blue-500" />
                                    <span className="text-[11px] font-black text-blue-600 uppercase tracking-[0.12em]">Datas Sugeridas</span>
                                  </div>
                                  <div className="p-3 grid grid-cols-2 gap-2">
                                    <div className="bg-white border border-blue-100 rounded-xl p-2.5">
                                      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-400 mb-1.5">🛫 IDA</div>
                                      <div className="text-[11px] text-slate-500">Data</div>
                                      <div className="text-[12px] font-semibold text-slate-700">{notEmpty(travelInfo.ida) ? formatSuggestionDate(travelInfo.ida) : '—'}</div>
                                      <div className="text-[11px] text-slate-500 mt-1">Horário</div>
                                      <div className="text-[12px] font-semibold text-slate-700">{notEmpty(travelInfo.chegada) ? travelInfo.chegada : '—'}</div>
                                    </div>
                                    <div className="bg-white border border-blue-100 rounded-xl p-2.5">
                                      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-400 mb-1.5">🛬 VOLTA</div>
                                      <div className="text-[11px] text-slate-500">Data</div>
                                      <div className="text-[12px] font-semibold text-slate-700">{notEmpty(travelInfo.retorno) ? formatSuggestionDate(travelInfo.retorno) : '—'}</div>
                                      <div className="text-[11px] text-slate-500 mt-1">Horário</div>
                                      <div className="text-[12px] font-semibold text-slate-700">{notEmpty(travelInfo.horario) ? travelInfo.horario : '—'}</div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Anexos (view mode) */}
                            {ticket.attachmentIds && ticket.attachmentIds.length > 0 && (
                              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                                <div className="bg-slate-50 border-b border-slate-100 px-4 py-2.5 flex items-center gap-2">
                                  <FileText className="w-4 h-4 text-slate-400" />
                                  <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.12em]">Anexos</span>
                                  <span className="ml-auto text-[10px] text-slate-400">{ticket.attachmentIds.length} arquivo(s)</span>
                                </div>
                                <div className="p-4 space-y-2">
                                  {ticket.attachmentIds.map((attachmentId, index) => (
                                    <div
                                      key={attachmentId}
                                      className="flex items-center gap-3 bg-white border border-slate-200 hover:border-[#2563EB] hover:bg-blue-50 rounded-xl px-4 py-3 cursor-pointer transition-all group"
                                      onClick={async () => {
                                        try {
                                          const response = await fetch(`/api/attachments/${attachmentId}`);
                                          const attachmentData = await response.json();
                                          if (response.ok && attachmentData.viewUrl && attachmentData.viewUrl !== "#") {
                                            const isViewable = attachmentData.type?.includes('pdf') || attachmentData.type?.includes('image');
                                            window.open(isViewable ? attachmentData.viewUrl : attachmentData.downloadUrl, '_blank');
                                          } else {
                                            toast({ title: "Anexo não disponível", variant: "destructive" });
                                          }
                                        } catch {
                                          toast({ title: "Erro ao abrir anexo", variant: "destructive" });
                                        }
                                      }}
                                    >
                                      <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
                                        <FileText className="w-4 h-4 text-[#2563EB]" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-[13px] font-semibold text-slate-700">Arquivo {index + 1}</div>
                                        <div className="text-[10px] text-slate-400 mt-0.5">Documento anexado · clique para visualizar</div>
                                      </div>
                                      <Eye className="w-4 h-4 text-slate-300 group-hover:text-[#2563EB] transition-colors flex-shrink-0" />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          /* FORM MODE */
                          <div className="space-y-4">

                            {/* Configuração — horizontal compacto */}
                            <div className="bg-white border border-slate-200 rounded-2xl p-4">
                              <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500 mb-3">Configuração</div>
                              <div className="flex items-end gap-6 flex-wrap">
                                <div className="flex-1 min-w-[180px]">
                                  <Label className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1 block">Modalidade *</Label>
                                  <Select
                                    value={data.transportType || "aereo"}
                                    onValueChange={(value) => {
                                      const eventLocation = getEventLocation(selectedInclusion.eventId);
                                      const hasGoodLocation = eventLocation && eventLocation !== 'Destino não informado';
                                      setTicketData(prev => ({
                                        ...prev,
                                        [selectedInclusion.id]: {
                                          ...prev[selectedInclusion.id],
                                          transportType: value,
                                          departureCityDestination: prev[selectedInclusion.id]?.departureCityDestination || (hasGoodLocation ? eventLocation : ''),
                                          returnCityOrigin: prev[selectedInclusion.id]?.returnCityOrigin || (hasGoodLocation ? eventLocation : ''),
                                          ...(value === 'rodoviario' ? {
                                            actualDepartureDate: selectedInclusion.scheduleStartDate || prev[selectedInclusion.id]?.actualDepartureDate || '',
                                            actualReturnDate: selectedInclusion.scheduleEndDate || prev[selectedInclusion.id]?.actualReturnDate || '',
                                          } : {}),
                                        }
                                      }));
                                    }}
                                  >
                                    <SelectTrigger data-testid={`select-transport-type-${selectedInclusion.id}`}>
                                      <SelectValue placeholder="Selecione" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="aereo">✈️ Aérea</SelectItem>
                                      <SelectItem value="rodoviario">🚌 Rodoviária</SelectItem>
                                      <SelectItem value="van">🚐 Van</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                {data.transportType !== 'van' && (
                                  <div className="flex items-center gap-2.5 pb-1">
                                    <button
                                      role="switch"
                                      aria-checked={data.isOneWay || false}
                                      onClick={() => !roMode && canEditTicket && handleTicketDataChange(selectedInclusion.id, "isOneWay", !(data.isOneWay || false))}
                                      style={{
                                        width: 40, height: 22, borderRadius: 11, border: 'none', cursor: roMode ? 'not-allowed' : 'pointer',
                                        background: data.isOneWay ? '#2563EB' : '#CBD5E1', position: 'relative', transition: 'background 0.2s', flexShrink: 0, padding: 0
                                      }}
                                    >
                                      <span style={{
                                        position: 'absolute', top: 2, left: data.isOneWay ? 20 : 2,
                                        width: 18, height: 18, borderRadius: '50%', background: '#fff',
                                        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                                      }} />
                                    </button>
                                    <label
                                      className="text-[13px] font-medium text-slate-600 cursor-pointer select-none"
                                      onClick={() => !roMode && canEditTicket && handleTicketDataChange(selectedInclusion.id, "isOneWay", !(data.isOneWay || false))}
                                    >
                                      Apenas ida
                                    </label>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* VAN */}
                            {data.transportType === 'van' && (
                              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4">
                                <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Dados da Van</div>
                                <div>
                                  <Label htmlFor={`vanCompany-${selectedInclusion.id}`} className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1 block">Nome da Empresa *</Label>
                                  <Input
                                    id={`vanCompany-${selectedInclusion.id}`}
                                    placeholder="Ex: Transluz Transportes"
                                    value={data.purchaseOrderNumber || ""}
                                    onChange={(e) => handleTicketDataChange(selectedInclusion.id, "purchaseOrderNumber", e.target.value)}
                                    disabled={roMode || !canEditTicket}
                                  />
                                </div>
                              </div>
                            )}

                            {/* Aéreo / Rodoviário */}
                            {data.transportType !== 'van' && (
                              <>
                                {/* Informações da Compra */}
                                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                                  <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500 mb-3">Informações da Compra</div>
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <Label htmlFor={`purchaseOrderNumber-${selectedInclusion.id}`} className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1 block">
                                        {data.transportType === 'rodoviario' ? 'Bilhete' : 'LOC'} *
                                      </Label>
                                      <Input
                                        id={`purchaseOrderNumber-${selectedInclusion.id}`}
                                        placeholder={data.transportType === 'rodoviario' ? 'Número do bilhete' : 'Número da LOC'}
                                        value={data.purchaseOrderNumber || ""}
                                        onChange={(e) => handleTicketDataChange(selectedInclusion.id, "purchaseOrderNumber", e.target.value)}
                                        data-testid={`input-purchase-order-${selectedInclusion.id}`}
                                        disabled={roMode || !canEditTicket}
                                      />
                                    </div>
                                    <div>
                                      <Label htmlFor={`purchaseDate-${selectedInclusion.id}`} className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1 block">Data da Compra *</Label>
                                      <Input
                                        id={`purchaseDate-${selectedInclusion.id}`}
                                        type="date"
                                        value={data.purchaseDate || ""}
                                        onChange={(e) => handleTicketDataChange(selectedInclusion.id, "purchaseDate", e.target.value)}
                                        data-testid={`input-purchase-date-${selectedInclusion.id}`}
                                        disabled={roMode || !canEditTicket}
                                      />
                                    </div>
                                  </div>
                                  <div className="mt-3">
                                    <Label htmlFor={`value-${selectedInclusion.id}`} className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1 block">Valor da Passagem</Label>
                                    <Input
                                      id={`value-${selectedInclusion.id}`}
                                      placeholder="0,00"
                                      type="text"
                                      inputMode="decimal"
                                      value={data.value || ""}
                                      onChange={(e) => handleTicketDataChange(selectedInclusion.id, "value", e.target.value.replace(',', '.'))}
                                      className="max-w-[160px]"
                                      data-testid={`input-ticket-value-${selectedInclusion.id}`}
                                      disabled={roMode || !canEditTicket}
                                    />
                                  </div>
                                </div>

                                {/* Viagem: IDA + VOLTA lado a lado */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                  {/* IDA */}
                                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                                    <div className="text-[11px] font-black uppercase tracking-[0.12em] flex items-center gap-1.5" style={{ color: '#2563EB' }}>
                                      {data.transportType === "rodoviario" ? '🚌' : '🛫'} IDA
                                    </div>
                                    <div>
                                      <Label className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1 block">Cidade Origem *</Label>
                                      <Input id={`departureCityOrigin-${selectedInclusion.id}`} placeholder="Ex: São Paulo" value={data.departureCityOrigin || ""} onChange={(e) => handleTicketDataChange(selectedInclusion.id, "departureCityOrigin", e.target.value)} data-testid={`input-departure-city-origin-${selectedInclusion.id}`} disabled={roMode || !canEditTicket} />
                                    </div>
                                    <div>
                                      <Label className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1 block flex items-center gap-1.5">
                                        Cidade Destino *
                                        <span className="text-[10px] font-medium bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-full normal-case">Local do evento</span>
                                      </Label>
                                      <Input id={`departureCityDestination-${selectedInclusion.id}`} placeholder="Ex: Rio de Janeiro" value={data.departureCityDestination || ""} onChange={(e) => handleTicketDataChange(selectedInclusion.id, "departureCityDestination", e.target.value)} data-testid={`input-departure-city-destination-${selectedInclusion.id}`} disabled={roMode || !canEditTicket} />
                                    </div>
                                    <div>
                                      <Label className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1 block">
                                        {data.transportType === "rodoviario" ? "Rodoviária Origem" : "Aeroporto Origem"} *
                                      </Label>
                                      <Input id={`departureAirport-${selectedInclusion.id}`} placeholder={data.transportType === "rodoviario" ? "Ex: Terminal Rodoviário" : "Ex: GRU, CGH, BSB"} value={data.departureAirport || ""} onChange={(e) => handleTicketDataChange(selectedInclusion.id, "departureAirport", e.target.value)} data-testid={`input-departure-airport-${selectedInclusion.id}`} disabled={roMode || !canEditTicket} />
                                    </div>
                                    <div>
                                      <Label className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1 block">
                                        {data.transportType === "rodoviario" ? "Rodoviária Destino" : "Aeroporto Destino"} *
                                      </Label>
                                      <Input id={`destinationAirport-${selectedInclusion.id}`} placeholder={data.transportType === "rodoviario" ? "Ex: Terminal Rodoviário" : "Ex: SDU, GIG, RJ"} value={data.destinationAirport || ""} onChange={(e) => handleTicketDataChange(selectedInclusion.id, "destinationAirport", e.target.value)} data-testid={`input-destination-airport-${selectedInclusion.id}`} disabled={roMode || !canEditTicket} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <Label className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1 block">Data *</Label>
                                        <Input id={`actualDepartureDate-${selectedInclusion.id}`} type="date" value={data.actualDepartureDate || ""} onChange={(e) => handleTicketDataChange(selectedInclusion.id, "actualDepartureDate", e.target.value)} data-testid={`input-departure-date-${selectedInclusion.id}`} disabled={roMode || !canEditTicket} />
                                      </div>
                                      <div>
                                        <Label className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1 block">Horário *</Label>
                                        <Input id={`actualDepartureTime-${selectedInclusion.id}`} type="time" value={data.actualDepartureTime || ""} onChange={(e) => handleTicketDataChange(selectedInclusion.id, "actualDepartureTime", e.target.value)} data-testid={`input-departure-time-${selectedInclusion.id}`} disabled={roMode || !canEditTicket} />
                                      </div>
                                    </div>
                                  </div>

                                  {/* VOLTA */}
                                  {!data.isOneWay ? (
                                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                                      <div className="text-[11px] font-black uppercase tracking-[0.12em] flex items-center gap-1.5" style={{ color: '#B45309' }}>
                                        {data.transportType === "rodoviario" ? '🚌' : '🛬'} VOLTA
                                      </div>
                                      <div>
                                        <Label className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1 block flex items-center gap-1.5">
                                          Cidade Origem *
                                          <span className="text-[10px] font-medium bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-full normal-case">Local do evento</span>
                                        </Label>
                                        <Input id={`returnCityOrigin-${selectedInclusion.id}`} placeholder="Ex: Rio de Janeiro" value={data.returnCityOrigin || ""} onChange={(e) => handleTicketDataChange(selectedInclusion.id, "returnCityOrigin", e.target.value)} data-testid={`input-return-city-origin-${selectedInclusion.id}`} disabled={roMode || !canEditTicket} />
                                      </div>
                                      <div>
                                        <Label className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1 block">Cidade Destino *</Label>
                                        <Input id={`returnCityDestination-${selectedInclusion.id}`} placeholder="Ex: São Paulo" value={data.returnCityDestination || ""} onChange={(e) => handleTicketDataChange(selectedInclusion.id, "returnCityDestination", e.target.value)} data-testid={`input-return-city-destination-${selectedInclusion.id}`} disabled={roMode || !canEditTicket} />
                                      </div>
                                      <div>
                                        <Label className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1 block">
                                          {data.transportType === "rodoviario" ? "Rodoviária Origem" : "Aeroporto Origem"} *
                                        </Label>
                                        <Input id={`returnOriginAirport-${selectedInclusion.id}`} placeholder={data.transportType === "rodoviario" ? "Ex: Terminal Rodoviário" : "Ex: SDU, GIG, GRU"} value={data.returnOriginAirport || ""} onChange={(e) => handleTicketDataChange(selectedInclusion.id, "returnOriginAirport", e.target.value)} data-testid={`input-return-origin-airport-${selectedInclusion.id}`} disabled={roMode || !canEditTicket} />
                                      </div>
                                      <div>
                                        <Label className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1 block">
                                          {data.transportType === "rodoviario" ? "Rodoviária Destino" : "Aeroporto Destino"} *
                                        </Label>
                                        <Input id={`returnDestinationAirport-${selectedInclusion.id}`} placeholder={data.transportType === "rodoviario" ? "Ex: Terminal Rodoviário" : "Ex: GRU, CGH, BSB"} value={data.returnDestinationAirport || ""} onChange={(e) => handleTicketDataChange(selectedInclusion.id, "returnDestinationAirport", e.target.value)} data-testid={`input-return-destination-airport-${selectedInclusion.id}`} disabled={roMode || !canEditTicket} />
                                      </div>
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <Label className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1 block">Data *</Label>
                                          <Input id={`actualReturnDate-${selectedInclusion.id}`} type="date" value={data.actualReturnDate || ""} onChange={(e) => handleTicketDataChange(selectedInclusion.id, "actualReturnDate", e.target.value)} data-testid={`input-return-date-${selectedInclusion.id}`} disabled={roMode || !canEditTicket} />
                                        </div>
                                        <div>
                                          <Label className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1 block">Horário *</Label>
                                          <Input id={`actualReturnTime-${selectedInclusion.id}`} type="time" value={data.actualReturnTime || ""} onChange={(e) => handleTicketDataChange(selectedInclusion.id, "actualReturnTime", e.target.value)} data-testid={`input-return-time-${selectedInclusion.id}`} disabled={roMode || !canEditTicket} />
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-4 flex items-center justify-center">
                                      <div className="text-center">
                                        <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400 mb-1">
                                          {data.transportType === "rodoviario" ? '🚌' : '🛬'} VOLTA
                                        </div>
                                        <div className="text-xs text-slate-300">Apenas ida selecionada</div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </>
                            )}

                            {/* Datas Sugeridas — visíveis durante o preenchimento */}
                            {(() => {
                              const travelInfo = extractTravelInfoFromObservations(selectedInclusion.observations || undefined, selectedInclusion);
                              const notEmpty = (v: string) => v && v !== 'N/A' && v !== 'Não definido' && v !== 'Não informado';
                              const hasAny = notEmpty(travelInfo.ida) || notEmpty(travelInfo.retorno) || notEmpty(travelInfo.chegada) || notEmpty(travelInfo.horario);
                              if (!hasAny) return null;
                              return (
                                <div className="border border-blue-200 rounded-2xl overflow-hidden">
                                  <div className="bg-blue-50 border-b border-blue-200 px-4 py-2.5 flex items-center gap-2">
                                    <Plane className="w-3.5 h-3.5 text-blue-500" />
                                    <span className="text-[11px] font-black text-blue-600 uppercase tracking-[0.12em]">Datas Sugeridas</span>
                                    <span className="ml-auto text-[10px] text-blue-400 font-medium">Referência para preenchimento</span>
                                  </div>
                                  <div className="p-3 grid grid-cols-2 gap-2">
                                    <div className="bg-white border border-blue-100 rounded-xl p-2.5">
                                      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-400 mb-1.5">🛫 IDA</div>
                                      <div className="text-[11px] text-slate-500">Data</div>
                                      <div className="text-[12px] font-semibold text-slate-700">{notEmpty(travelInfo.ida) ? formatSuggestionDate(travelInfo.ida) : '—'}</div>
                                      <div className="text-[11px] text-slate-500 mt-1">Horário</div>
                                      <div className="text-[12px] font-semibold text-slate-700">{notEmpty(travelInfo.chegada) ? travelInfo.chegada : '—'}</div>
                                    </div>
                                    <div className="bg-white border border-blue-100 rounded-xl p-2.5">
                                      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-400 mb-1.5">🛬 VOLTA</div>
                                      <div className="text-[11px] text-slate-500">Data</div>
                                      <div className="text-[12px] font-semibold text-slate-700">{notEmpty(travelInfo.retorno) ? formatSuggestionDate(travelInfo.retorno) : '—'}</div>
                                      <div className="text-[11px] text-slate-500 mt-1">Horário</div>
                                      <div className="text-[12px] font-semibold text-slate-700">{notEmpty(travelInfo.horario) ? travelInfo.horario : '—'}</div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Observações */}
                            <div className="bg-white border border-slate-200 rounded-2xl p-4">
                              <Label htmlFor={`ticketObservations-${selectedInclusion.id}`} className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-1 block">Observações sobre a Passagem</Label>
                              <Textarea
                                id={`ticketObservations-${selectedInclusion.id}`}
                                placeholder="Informações adicionais sobre a passagem..."
                                value={data.ticketObservations || ""}
                                onChange={(e) => handleTicketDataChange(selectedInclusion.id, "ticketObservations", e.target.value)}
                                className="h-24 resize-none"
                                data-testid={`textarea-ticket-observations-${selectedInclusion.id}`}
                                disabled={roMode || !canEditTicket}
                              />
                            </div>

                            {/* Anexos */}
                            <div className="border border-slate-200 rounded-2xl overflow-hidden">
                              <div className="bg-slate-50 border-b border-slate-100 px-4 py-2.5 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-slate-400" />
                                <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.12em]">Anexos</span>
                              </div>
                              <div className="p-4">
                                <AttachmentUpload
                                  attachmentIds={data.attachmentIds || []}
                                  onAttachmentsChange={(attachmentIds) => handleTicketDataChange(selectedInclusion.id, "attachmentIds", attachmentIds)}
                                  disabled={createTicketMutation.isPending || roMode}
                                />
                              </div>
                            </div>
                          </div>
                        )}

                      </TabsContent>

                      {/* ══ ABA: COMPLEMENTOS ══ */}
                      <TabsContent value="complementos" className="m-0 p-6">
                        <div className="grid grid-cols-2 gap-6">

                          {/* Coluna Esquerda: Comentários */}
                          <div className="space-y-4">
                            <div className="border border-slate-200 rounded-2xl overflow-hidden">
                              <div className="bg-slate-50 border-b border-slate-100 px-4 py-2.5 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <MessageCircle className="w-4 h-4 text-slate-400" />
                                  <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.12em]">Comentários</span>
                                  {comments && comments.length > 0 && (
                                    <span className="bg-[#2563EB] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{comments.length}</span>
                                  )}
                                </div>
                                <button onClick={() => setShowCommentsModal(true)} className="flex items-center gap-1.5 text-[12px] font-semibold text-blue-600 hover:text-blue-700 transition-colors">
                                  <MessageCircle className="w-3.5 h-3.5" />
                                  {roMode ? "Ver" : "Ver/Adicionar"}
                                </button>
                              </div>
                              <div className="p-4">
                                {comments && comments.length > 0 ? (
                                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                    {comments.map((comment) => (
                                      <div key={comment.id} className="bg-white border border-slate-200 p-3 rounded-xl shadow-sm">
                                        <div className="flex justify-between items-center mb-1.5">
                                          <div className="flex items-center gap-2">
                                            <div className="w-5 h-5 rounded-full bg-[#2563EB] text-white flex items-center justify-center text-[9px] font-black shrink-0">
                                              {(users?.find(u => u.id === comment.userId)?.name || 'U').charAt(0).toUpperCase()}
                                            </div>
                                            <div className="text-[12px] font-bold text-slate-700">{users?.find(u => u.id === comment.userId)?.name || 'Usuário'}</div>
                                          </div>
                                          <div className="text-[10px] text-slate-400">{comment.createdAt ? new Date(comment.createdAt).toLocaleDateString('pt-BR') : ''}</div>
                                        </div>
                                        <div className="text-[12px] text-slate-600 leading-relaxed">{comment.content}</div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center py-8">
                                    <MessageCircle className="w-6 h-6 text-slate-200 mx-auto mb-2" />
                                    <div className="text-[12px] text-slate-400">Nenhum comentário registrado.</div>
                                  </div>
                                )}
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
                                        'ticket_created': '🎫 Passagem Criada',
                                        'ticket_updated': '✏️ Passagem Atualizada',
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
                                              <div className="text-[10px] text-slate-400 whitespace-nowrap flex-shrink-0">
                                                {log.createdAt && new Date(log.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                              </div>
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

                  {/* ─── FOOTER ─── */}
                  <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0 bg-white">
                    {!isFormMode ? (
                      /* View mode footer */
                      <>
                        <Button
                          variant="outline"
                          onClick={() => { setShowModal(false); setEditingTicketId(null); }}
                          className="border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl px-5 py-2 text-sm font-medium"
                        >
                          Fechar
                        </Button>
                        {!roMode && canEditTicket && selectedInclusion?.status !== 'hospedagem' && ticket && (
                          <Button
                            variant="outline"
                            onClick={() => {
                              setTicketData(prev => ({
                                ...prev,
                                [selectedInclusion.id]: {
                                  transportType: ticket.transportType || "aereo",
                                  isOneWay: !ticket.actualReturnDate && !ticket.actualReturnTime,
                                  value: ((ticket.value || 0) / 100).toString(),
                                  departureAirport: ticket.departureAirport || "",
                                  destinationAirport: ticket.destinationAirport || "",
                                  departureCityOrigin: ticket.departureCityOrigin || "",
                                  departureCityDestination: ticket.departureCityDestination || "",
                                  returnCityOrigin: ticket.returnCityOrigin || "",
                                  returnCityDestination: ticket.returnCityDestination || "",
                                  purchaseOrderNumber: ticket.purchaseOrderNumber || "",
                                  actualDepartureDate: ticket.actualDepartureDate || "",
                                  actualReturnDate: ticket.actualReturnDate || "",
                                  actualDepartureTime: ticket.actualDepartureTime || "",
                                  actualReturnTime: ticket.actualReturnTime || "",
                                  cardLastFourDigits: ticket.cardLastFourDigits || "",
                                  ticketObservations: ticket.ticketObservations || "",
                                  attachmentIds: ticket.attachmentIds || []
                                }
                              }));
                              setEditingTicketId(selectedInclusion.id);
                              setModalActiveTab('dados');
                            }}
                            className="flex items-center gap-2 border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl px-5 py-2 text-sm font-medium"
                          >
                            <Edit className="w-4 h-4" />
                            Editar Passagem
                          </Button>
                        )}
                      </>
                    ) : (
                      /* Form mode footer */
                      <>
                        <Button
                          variant="ghost"
                          onClick={() => { setShowModal(false); setEditingTicketId(null); }}
                          className="text-slate-500 hover:text-slate-700 rounded-xl px-5 py-2 text-sm font-medium"
                        >
                          Cancelar
                        </Button>
                        {!roMode && canEditTicket && selectedInclusion?.status !== 'hospedagem' && (
                          <>
                            {/* Salvar rascunho */}
                            <Button
                              variant="outline"
                              onClick={async () => {
                                try {
                                  if (editingTicketId || getTicket(selectedInclusion.id)) {
                                    const ticketToUpdate = getTicket(selectedInclusion.id);
                                    if (ticketToUpdate) {
                                      await updateTicketMutation.mutateAsync({
                                        id: ticketToUpdate.id,
                                        data: {
                                          transportType: data.transportType || ticketToUpdate.transportType || "aereo",
                                          value: data.value ? Math.round(parseFloat(data.value) * 100) : ticketToUpdate.value,
                                          actualDepartureDate: data.actualDepartureDate || ticketToUpdate.actualDepartureDate,
                                          actualDepartureTime: data.actualDepartureTime || ticketToUpdate.actualDepartureTime,
                                          actualReturnDate: data.isOneWay ? null : data.actualReturnDate || ticketToUpdate.actualReturnDate,
                                          actualReturnTime: data.isOneWay ? null : data.actualReturnTime || ticketToUpdate.actualReturnTime,
                                          departureCityOrigin: data.departureCityOrigin || ticketToUpdate.departureCityOrigin,
                                          departureCityDestination: data.departureCityDestination || ticketToUpdate.departureCityDestination,
                                          returnCityOrigin: data.isOneWay ? null : data.returnCityOrigin || ticketToUpdate.returnCityOrigin,
                                          returnCityDestination: data.isOneWay ? null : data.returnCityDestination || ticketToUpdate.returnCityDestination,
                                          departureAirport: data.departureAirport || ticketToUpdate.departureAirport,
                                          destinationAirport: data.destinationAirport || ticketToUpdate.destinationAirport,
                                          purchaseOrderNumber: data.purchaseOrderNumber || ticketToUpdate.purchaseOrderNumber,
                                          cardLastFourDigits: data.cardLastFourDigits || ticketToUpdate.cardLastFourDigits,
                                          ticketObservations: data.ticketObservations || ticketToUpdate.ticketObservations,
                                          attachmentIds: data.attachmentIds && data.attachmentIds.length > 0 ? data.attachmentIds : ticketToUpdate.attachmentIds
                                        }
                                      });
                                    }
                                  } else if (data.value || data.departureAirport || data.destinationAirport || data.purchaseOrderNumber) {
                                    await createTicketMutation.mutateAsync({
                                      teamInclusionId: selectedInclusion.id,
                                      transportType: data.transportType || "aereo",
                                      value: data.value ? Math.round(parseFloat(data.value) * 100) : 0,
                                      purchaseDate: data.purchaseDate || new Date().toISOString().split('T')[0],
                                      actualDepartureDate: data.actualDepartureDate || null,
                                      actualDepartureTime: data.actualDepartureTime || null,
                                      actualReturnDate: data.isOneWay ? null : data.actualReturnDate || null,
                                      actualReturnTime: data.isOneWay ? null : data.actualReturnTime || null,
                                      departureCityOrigin: data.departureCityOrigin || null,
                                      departureCityDestination: data.departureCityDestination || null,
                                      returnCityOrigin: data.isOneWay ? null : data.returnCityOrigin || null,
                                      returnCityDestination: data.isOneWay ? null : data.returnCityDestination || null,
                                      departureAirport: data.departureAirport || "",
                                      destinationAirport: data.destinationAirport || "",
                                      purchaseOrderNumber: data.purchaseOrderNumber || "",
                                      fileUrl: data.fileUrl || null,
                                      attachmentIds: data.attachmentIds && data.attachmentIds.length > 0 ? data.attachmentIds : null,
                                      cardLastFourDigits: data.cardLastFourDigits || null,
                                      ticketObservations: data.ticketObservations || null
                                    });
                                  }
                                  toast({ title: "Sucesso", description: "Dados salvos com sucesso" });
                                  setShowModal(false);
                                  setEditingTicketId(null);
                                } catch (error) {
                                  toast({ title: "Erro", description: "Erro ao salvar dados", variant: "destructive" });
                                }
                              }}
                              disabled={createTicketMutation.isPending || updateTicketMutation.isPending}
                              className="border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl px-5 py-2 text-sm font-medium"
                            >
                              {(createTicketMutation.isPending || updateTicketMutation.isPending) ? "Salvando..." : "Salvar"}
                            </Button>

                            {/* Registrar/Atualizar Passagem */}
                            <Button
                              onClick={async () => {
                                const isVanModal = data.transportType === 'van';
                                const isRodoModal = data.transportType === 'rodoviario';
                                let baseFields: string[];
                                if (isVanModal) {
                                  baseFields = ['purchaseOrderNumber'];
                                } else if (isRodoModal) {
                                  baseFields = ['departureAirport', 'actualDepartureDate', 'actualDepartureTime'];
                                } else {
                                  baseFields = ['value', 'departureAirport', 'destinationAirport', 'purchaseOrderNumber', 'actualDepartureDate', 'actualDepartureTime'];
                                }
                                const requiredFieldsModal = (!isVanModal && !data.isOneWay)
                                  ? [...baseFields, 'actualReturnDate', 'actualReturnTime']
                                  : baseFields;
                                const missingModalFields = requiredFieldsModal.filter(field => !data[field as keyof typeof data] || data[field as keyof typeof data] === '');
                                if (missingModalFields.length > 0) {
                                  toast({
                                    title: "Erro",
                                    description: isVanModal
                                      ? "Preencha o campo Nome da Empresa"
                                      : isRodoModal
                                      ? "Preencha os campos obrigatórios: Rodoviária Origem (ida), datas e horários"
                                      : "Preencha todos os campos obrigatórios (Aeroporto Ida/Volta, valor, LOC, datas e horários)",
                                    variant: "destructive",
                                  });
                                  return;
                                }
                                try {
                                  if (editingTicketId) {
                                    const ticketEx = getTicket(selectedInclusion.id);
                                    if (ticketEx) {
                                      await updateTicketMutation.mutateAsync({
                                        id: ticketEx.id,
                                        data: {
                                          transportType: data.transportType || "aereo",
                                          value: isVanModal ? null : Math.round(parseFloat(data.value) * 100),
                                          actualDepartureDate: isVanModal ? null : data.actualDepartureDate,
                                          actualDepartureTime: isVanModal ? null : data.actualDepartureTime,
                                          actualReturnDate: isVanModal ? null : (data.isOneWay ? null : data.actualReturnDate),
                                          actualReturnTime: isVanModal ? null : (data.isOneWay ? null : data.actualReturnTime),
                                          departureCityOrigin: isVanModal ? null : (data.departureCityOrigin || null),
                                          departureCityDestination: isVanModal ? null : (data.departureCityDestination || null),
                                          returnCityOrigin: isVanModal ? null : (data.isOneWay ? null : data.returnCityOrigin || null),
                                          returnCityDestination: isVanModal ? null : (data.isOneWay ? null : data.returnCityDestination || null),
                                          departureAirport: isVanModal ? null : data.departureAirport,
                                          destinationAirport: isVanModal ? null : data.destinationAirport,
                                          purchaseOrderNumber: data.purchaseOrderNumber,
                                          cardLastFourDigits: isVanModal ? null : (data.cardLastFourDigits || null),
                                          ticketObservations: data.ticketObservations || null,
                                          attachmentIds: data.attachmentIds && data.attachmentIds.length > 0 ? data.attachmentIds : null
                                        }
                                      });
                                    }
                                  } else {
                                    await createTicketMutation.mutateAsync({
                                      teamInclusionId: selectedInclusion.id,
                                      transportType: data.transportType || "aereo",
                                      value: isVanModal ? null : Math.round(parseFloat(data.value) * 100),
                                      purchaseDate: data.purchaseDate || new Date().toISOString().split('T')[0],
                                      actualDepartureDate: isVanModal ? null : data.actualDepartureDate,
                                      actualDepartureTime: isVanModal ? null : data.actualDepartureTime,
                                      actualReturnDate: isVanModal ? null : (data.isOneWay ? null : data.actualReturnDate),
                                      actualReturnTime: isVanModal ? null : (data.isOneWay ? null : data.actualReturnTime),
                                      departureCityOrigin: isVanModal ? null : (data.departureCityOrigin || null),
                                      departureCityDestination: isVanModal ? null : (data.departureCityDestination || null),
                                      returnCityOrigin: isVanModal ? null : (data.isOneWay ? null : data.returnCityOrigin || null),
                                      returnCityDestination: isVanModal ? null : (data.isOneWay ? null : data.returnCityDestination || null),
                                      departureAirport: isVanModal ? null : data.departureAirport,
                                      destinationAirport: isVanModal ? null : data.destinationAirport,
                                      purchaseOrderNumber: data.purchaseOrderNumber,
                                      fileUrl: data.fileUrl || null,
                                      attachmentIds: data.attachmentIds && data.attachmentIds.length > 0 ? data.attachmentIds : null,
                                      cardLastFourDigits: isVanModal ? null : (data.cardLastFourDigits || null),
                                      ticketObservations: data.ticketObservations || null
                                    });
                                    const needsAccommodation = selectedInclusion.needsAccommodation;
                                    const accommodation = accommodations?.find(acc => acc.teamInclusionId === selectedInclusion.id);
                                    const accommodationPurchased = accommodation && accommodation.hotelName;
                                    let newStatus = "passagem_comprada";
                                    let newPhase = "passagem";
                                    if (needsAccommodation && accommodationPurchased) {
                                      newStatus = "hospedagem_passagem_comprada";
                                      newPhase = "hospedagem";
                                    }
                                    await updateTeamInclusionMutation.mutateAsync({ id: selectedInclusion.id, data: { status: newStatus, phase: newPhase } });
                                  }
                                  const inc = selectedInclusion;
                                  setSuccessInfo({
                                    message: editingTicketId ? "Passagem atualizada com sucesso!" : "Passagem registrada com sucesso!",
                                    inclusionNumber: inc?.inclusionNumber ?? null,
                                    eventName: events?.find(e => e.id === inc?.eventId)?.name ?? "—",
                                    collaboratorName: inc?.collaboratorId ? getCollaboratorName(inc.collaboratorId) : "—",
                                    functionName: inc?.functionId ? getFunctionName(inc.functionId) : "—",
                                  });
                                  setShowModal(false);
                                  setShowSuccessModal(true);
                                } catch (error) {
                                  // Error is already handled by the mutation
                                }
                              }}
                              disabled={createTicketMutation.isPending || updateTicketMutation.isPending}
                              style={{ background: '#2563EB' }}
                              className="text-white rounded-xl px-5 py-2 text-sm font-bold hover:opacity-90 flex items-center gap-2"
                            >
                              {(createTicketMutation.isPending || updateTicketMutation.isPending)
                                ? (editingTicketId ? "Atualizando..." : "Registrando...")
                                : <><CheckCircle className="w-4 h-4" /> {editingTicketId ? "Atualizar Passagem" : "Registrar Passagem"}</>
                              }
                            </Button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>
        {/* Modal de sucesso — fora do Dialog para não desmontar quando Dialog fecha */}
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
                onClick={() => {
                  setShowSuccessModal(false);
                  setSuccessInfo(null);
                  setEditingTicketId(null);
                  if (selectedInclusion) {
                    setTicketData(prev => {
                      const newData = { ...prev };
                      delete newData[selectedInclusion.id];
                      return newData;
                    });
                  }
                }}
                className="w-full py-2.5 rounded-xl font-semibold text-white text-sm transition-all"
                style={{background:'#2563EB'}}
              >
                OK
              </button>
            </div>
          </div>,
          document.body
        )}

        {/* Modal de Comentários */}
        <CommentsModal
          open={showCommentsModal}
          onClose={() => setShowCommentsModal(false)}
          teamInclusionId={selectedInclusion?.id || ""}
        />

        {/* Modal confirmação — Aprovar troca */}
        {swapConfirmAction === 'approve' && pendingSwap && (
          <Dialog open onOpenChange={() => setSwapConfirmAction(null)}>
            <DialogContent className="max-w-[400px] gap-4">
              <DialogHeader>
                <DialogTitle className="text-[16px] font-bold text-slate-800">Aprovar troca de colaborador?</DialogTitle>
              </DialogHeader>
              <p className="text-[13px] text-slate-600">Ao confirmar, a alteração do colaborador será liberada para esta escala.</p>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 text-[12px]">
                <div className="flex items-start gap-2">
                  <span className="text-slate-400 font-medium shrink-0">Colaborador atual:</span>
                  <span className="font-semibold text-slate-700">{toTitleCase(getCollaboratorName(selectedInclusion?.collaboratorId || undefined))}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-slate-400 font-medium shrink-0">Colaborador solicitado:</span>
                  <span className="font-semibold text-blue-700">{toTitleCase(getCollaboratorName((pendingSwap as any).new_collaborator_id))}</span>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setSwapConfirmAction(null)} className="px-4 py-2 text-[12px] font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                <button
                  onClick={() => { approveSwapMutation.mutate((pendingSwap as any).id); setSwapConfirmAction(null); }}
                  disabled={approveSwapMutation.isPending}
                  className="px-4 py-2 text-[12px] font-semibold bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >Confirmar aprovação</button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Modal confirmação — Rejeitar troca */}
        {swapConfirmAction === 'reject' && pendingSwap && (
          <Dialog open onOpenChange={() => { setSwapConfirmAction(null); setSwapRejectReason(''); }}>
            <DialogContent className="max-w-[400px] gap-4">
              <DialogHeader>
                <DialogTitle className="text-[16px] font-bold text-slate-800">Rejeitar troca de colaborador?</DialogTitle>
              </DialogHeader>
              <p className="text-[13px] text-slate-600">A solicitação será recusada e a escala continuará com o colaborador atual.</p>
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Motivo da rejeição <span className="text-red-400">*</span></label>
                <textarea
                  value={swapRejectReason}
                  onChange={e => setSwapRejectReason(e.target.value)}
                  className="mt-1.5 w-full border border-slate-200 rounded-xl p-2.5 text-[13px] text-slate-700 resize-none focus:outline-none focus:ring-1 focus:ring-slate-300"
                  rows={3}
                  placeholder="Descreva o motivo da rejeição..."
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setSwapConfirmAction(null); setSwapRejectReason(''); }} className="px-4 py-2 text-[12px] font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                <button
                  onClick={() => {
                    if (!swapRejectReason.trim()) return;
                    rejectSwapMutation.mutate({ id: (pendingSwap as any).id, comment: swapRejectReason });
                    setSwapConfirmAction(null);
                    setSwapRejectReason('');
                  }}
                  disabled={rejectSwapMutation.isPending || !swapRejectReason.trim()}
                  className="px-4 py-2 text-[12px] font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >Confirmar rejeição</button>
              </div>
            </DialogContent>
          </Dialog>
        )}
    </>
  );
}
