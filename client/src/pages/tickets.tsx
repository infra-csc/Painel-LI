import { useState, useMemo } from "react";
import { fixEncoding } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plane, Bus, Truck, Save, Eye, FileText, ChevronDown, ChevronRight, MessageCircle, Edit, CheckCircle, Clock, Ticket as TicketIcon, CreditCard, Paperclip, NotebookPen, ClipboardCheck } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { isReadOnly, canEdit, canPerformActions } from "@/lib/interactions";
import { canView, canEdit as canEditScreen } from "@/lib/permissions";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import type { TeamInclusion, Event, Function, Collaborator, Ticket, Comment } from "@shared/schema";

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
  
  const [sortConfig, setSortConfig] = useState<SortConfig | null>({ field: 'id', direction: 'desc' });
  const [selectedInclusion, setSelectedInclusion] = useState<TeamInclusion | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [selectedTickets, setSelectedTickets] = useState<string[]>([]); // IDs dos tickets selecionados
  const [editingTicketId, setEditingTicketId] = useState<string | null>(null); // ID do ticket sendo editado
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    basic: false,
    dates: true,
    additional: false
  });
  const [showCommentsModal, setShowCommentsModal] = useState(false);
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
          { field: 'value', label: 'Valor da Passagem' },
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
                        <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-tight">Valor Total *</Label>
                        <div className="flex h-[34px] rounded-lg overflow-hidden border border-slate-200 focus-within:ring-2 focus-within:ring-[#0033CC]/20">
                          <span className="flex items-center px-2.5 bg-slate-50 text-slate-500 font-semibold text-xs border-r border-slate-200 shrink-0">R$</span>
                          <input
                            type="number" step="0.01" placeholder="0,00"
                            value={ticketData["quick"]?.value || ""}
                            onChange={(e) => handleTicketDataChange("quick", "value", e.target.value)}
                            className="flex-1 px-3 text-sm font-bold bg-white border-0 outline-none w-full"
                            data-testid="input-quick-value"
                          />
                        </div>
                      </div>
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
                        <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-tight">Cartão (Final 4)</Label>
                        <Input placeholder="0000" maxLength={4}
                          value={ticketData["quick"]?.cardLastFourDigits || ""}
                          onChange={(e) => handleTicketDataChange("quick", "cardLastFourDigits", e.target.value.replace(/\D/g,'').slice(0,4))}
                          className="h-[34px] bg-slate-50 border-slate-200 rounded-lg text-xs"
                          data-testid="input-quick-card-digits"
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
                    const hasValue = !!(q?.value);
                    const hasLoc = !!(q?.purchaseOrderNumber);
                    const hasOrigin = !!(q?.departureCityOrigin && q?.departureAirport);
                    const hasDestination = !!(q?.departureCityDestination && q?.destinationAirport);
                    const hasDates = !!(q?.actualDepartureDate && q?.actualDepartureTime);
                    const attachCount = q?.attachmentIds?.length || 0;

                    // 3-state logic: green=done, yellow=partial, red=empty
                    const financialStatus = hasValue && hasLoc ? 'done' : hasValue || hasLoc ? 'partial' : 'empty';
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
                                {financialStatus === 'done' ? 'Valor e LOC preenchidos' : financialStatus === 'partial' ? 'Parcialmente preenchidos' : 'Valor e LOC pendentes'}
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
                        className={`transition-colors group border-b border-slate-100 last:border-0 ${rowIdx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}`}
                        style={{
                          opacity: inclusion.status === 'cancelado' ? 0.5 : 1,
                          borderLeft: inclusion.status === 'cancelado'
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
                                <span className="text-[14px] font-[500] text-[#1a1a2e]">{name}</span>
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

        {/* Modal de Detalhes da Passagem */}
        <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 p-0 gap-0">
            {selectedInclusion && (
              <div>
                <DialogHeader className="bg-white px-6 pt-5 pb-4 border-b border-slate-100 sticky top-0 z-10">
                  <DialogTitle className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-[9px] bg-[#0033CC] flex items-center justify-center text-white shrink-0"
                      style={{ boxShadow: "0 4px 12px #0033CC40" }}
                    >
                      <Plane className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[15px] font-bold text-slate-900 leading-tight truncate">
                        Passagem #{selectedInclusion.inclusionNumber} — {getEventName(selectedInclusion.eventId)}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {isReadOnly(selectedInclusion, user) ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[11px] font-bold border border-amber-200">
                            Somente Leitura
                          </span>
                        ) : getTicket(selectedInclusion.id) ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-[11px] font-bold border border-green-200">
                            <CheckCircle className="w-3 h-3" /> Passagem Comprada
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 text-[11px] font-bold border border-orange-200">
                            <Clock className="w-3 h-3" /> Pendente
                          </span>
                        )}
                      </div>
                    </div>
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-6 px-6 py-5">
                  {/* Informações Gerais */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 border-b border-slate-100 px-4 py-2.5 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                      <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Informações Gerais</span>
                    </div>
                    <div className="p-4 grid grid-cols-2 gap-4">
                      <div>
                        <label style={{display:'block',fontSize:11,textTransform:'uppercase',color:'#94A3B8',letterSpacing:'0.05em',marginBottom:4}}>Colaborador</label>
                        <p style={{fontSize:15,fontWeight:600,color:'#1E293B'}}>{getCollaboratorName(selectedInclusion.collaboratorId || undefined)}</p>
                      </div>
                      <div>
                        <label style={{display:'block',fontSize:11,textTransform:'uppercase',color:'#94A3B8',letterSpacing:'0.05em',marginBottom:4}}>Função</label>
                        <p style={{fontSize:15,fontWeight:600,color:'#1E293B'}}>{getFunctionName(selectedInclusion.functionId)}</p>
                      </div>
                      {(() => {
                        const collaborator = getCollaborator(selectedInclusion.collaboratorId || undefined);
                        if (!collaborator) return null;
                        return (
                          <>
                            <div>
                              <label style={{display:'block',fontSize:11,textTransform:'uppercase',color:'#94A3B8',letterSpacing:'0.05em',marginBottom:4}}>Documento</label>
                              <p style={{fontSize:15,fontWeight:600,color:'#1E293B'}}>
                                {collaborator.documentType?.toUpperCase() || 'N/A'}: {collaborator.officialDocument || 'N/A'}
                              </p>
                            </div>
                            <div>
                              <label style={{display:'block',fontSize:11,textTransform:'uppercase',color:'#94A3B8',letterSpacing:'0.05em',marginBottom:4}}>Data de Nascimento</label>
                              <p style={{fontSize:15,fontWeight:600,color:'#1E293B'}}>
                                {collaborator.birthDate ? formatDate(collaborator.birthDate) : 'N/A'}
                              </p>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Sugestões de Viagem - SEMPRE VISÍVEL */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-indigo-50 border-b border-indigo-100 px-4 py-2.5 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                      <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-600">Sugestões de Viagem</span>
                      <span className="text-[10px] text-indigo-400 font-normal">(da inclusão de equipe)</span>
                    </div>
                    <div className="p-4">
                    {(() => {
                      const travelInfo = extractTravelInfoFromObservations(selectedInclusion.observations || undefined, selectedInclusion);
                      const notInformed = (v: string) => v === 'N/A' || v === 'Não definido' || v === 'Não informado';
                      const emptyBadge = <span style={{display:'inline-flex',padding:'2px 10px',borderRadius:999,background:'#F1F5F9',color:'#94A3B8',fontSize:12,fontWeight:500}}>Não informado</span>;
                      return (
                        <div className="grid grid-cols-2 gap-4">
                          {/* IDA */}
                          <div style={{borderLeft:'3px solid #3B5BDB',background:'#EEF2FF',borderRadius:8,padding:12}}>
                            <div style={{fontSize:12,fontWeight:700,color:'#3B5BDB',marginBottom:8}}>🛫 IDA</div>
                            <div className="space-y-2">
                              <div>
                                <span style={{fontSize:11,color:'#64748B',display:'block'}}>Data</span>
                                {notInformed(travelInfo.ida) ? emptyBadge : <span style={{fontSize:14,fontWeight:600,color:'#1E293B'}}>{formatSuggestionDate(travelInfo.ida)}</span>}
                              </div>
                              <div>
                                <span style={{fontSize:11,color:'#64748B',display:'block'}}>Horário</span>
                                {notInformed(travelInfo.chegada) ? emptyBadge : <span style={{fontSize:14,fontWeight:600,color:'#1E293B'}}>{travelInfo.chegada}</span>}
                              </div>
                            </div>
                          </div>
                          {/* VOLTA */}
                          <div style={{borderLeft:'3px solid #F59E0B',background:'#FFF7ED',borderRadius:8,padding:12}}>
                            <div style={{fontSize:12,fontWeight:700,color:'#B45309',marginBottom:8}}>🛬 VOLTA</div>
                            <div className="space-y-2">
                              <div>
                                <span style={{fontSize:11,color:'#64748B',display:'block'}}>Data</span>
                                {notInformed(travelInfo.retorno) ? emptyBadge : <span style={{fontSize:14,fontWeight:600,color:'#1E293B'}}>{formatSuggestionDate(travelInfo.retorno)}</span>}
                              </div>
                              <div>
                                <span style={{fontSize:11,color:'#64748B',display:'block'}}>Horário</span>
                                {notInformed(travelInfo.horario) ? emptyBadge : <span style={{fontSize:14,fontWeight:600,color:'#1E293B'}}>{travelInfo.horario}</span>}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                    </div>
                  </div>

                  {(() => {
                    const ticket = getTicket(selectedInclusion.id);
                    const data = ticketData[selectedInclusion.id] || {};
                    
                    return ticket && editingTicketId !== selectedInclusion.id ? (
                      /* Passagem já processada */
                      <div className="space-y-4">
                        {/* Cabeçalho da Passagem Comprada */}
                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                          <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-2.5 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-700">Passagem Comprada</span>
                          </div>
                          <div className="p-4">
                          
                          {/* Informações Gerais da Compra */}
                          {ticket.transportType === 'van' ? (
                            <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-slate-100 rounded-lg">
                              <Truck className="w-4 h-4 text-slate-500" />
                              <span className="text-sm font-semibold text-slate-700">Van / Transporte Terrestre</span>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                              <div>
                                <Label className="text-xs text-green-600 font-medium">💰 Valor</Label>
                                <p className="font-bold text-lg text-green-700">{formatCurrency((ticket.value || 0) / 100)}</p>
                              </div>
                              <div>
                                <Label className="text-xs text-green-600 font-medium">📅 Data da Compra</Label>
                                <p className="font-medium">{ticket.purchaseDate ? formatDate(ticket.purchaseDate) : "-"}</p>
                              </div>
                              {ticket.purchaseOrderNumber && (
                                <div>
                                  <Label className="text-xs text-green-600 font-medium">
                                    {ticket.transportType === 'rodoviario' ? '🎫 Bilhete' : '📋 LOC'}
                                  </Label>
                                  <p className="font-medium">{ticket.purchaseOrderNumber}</p>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Detalhes — adaptados por tipo de transporte */}
                          {ticket.transportType === 'van' ? (
                            /* VAN: apenas empresa e observações */
                            <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 space-y-3">
                              <div className="flex items-center gap-2 mb-2">
                                <Truck className="w-4 h-4 text-slate-500" />
                                <span className="text-sm font-semibold text-slate-700">Dados da Van</span>
                              </div>
                              <div>
                                <Label className="text-xs text-slate-500 font-medium uppercase tracking-wide">Empresa / Identificação</Label>
                                <p className="font-semibold text-slate-800 mt-0.5">{ticket.purchaseOrderNumber || "-"}</p>
                              </div>
                              {ticket.ticketObservations && (
                                <div>
                                  <Label className="text-xs text-slate-500 font-medium uppercase tracking-wide">Observações</Label>
                                  <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap">{ticket.ticketObservations}</p>
                                </div>
                              )}
                            </div>
                          ) : ticket.transportType === 'rodoviario' ? (
                            /* RODOVIÁRIO: cidades, terminais, datas */
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              {/* IDA */}
                              <div className="bg-white p-4 rounded-lg border border-green-200">
                                <h4 className="font-medium text-green-700 mb-3 flex items-center gap-2">
                                  <Bus className="w-4 h-4" /> EMBARQUE
                                </h4>
                                <div className="space-y-2 text-sm">
                                  {ticket.departureCityOrigin && (
                                    <div>
                                      <Label className="text-xs text-slate-500">Cidade Origem</Label>
                                      <p className="font-medium">{ticket.departureCityOrigin}</p>
                                    </div>
                                  )}
                                  {ticket.departureAirport && (
                                    <div>
                                      <Label className="text-xs text-slate-500">Terminal / Rodoviária</Label>
                                      <p className="font-medium">{ticket.departureAirport}</p>
                                    </div>
                                  )}
                                  {ticket.departureCityDestination && (
                                    <div>
                                      <Label className="text-xs text-slate-500">Cidade Destino</Label>
                                      <p className="font-medium">{ticket.departureCityDestination}</p>
                                    </div>
                                  )}
                                  {ticket.destinationAirport && (
                                    <div>
                                      <Label className="text-xs text-slate-500">Terminal Destino</Label>
                                      <p className="font-medium">{ticket.destinationAirport}</p>
                                    </div>
                                  )}
                                  {ticket.actualDepartureDate && (
                                    <div>
                                      <Label className="text-xs text-slate-500">Data</Label>
                                      <p className="font-medium text-blue-600">{formatDate(ticket.actualDepartureDate)}</p>
                                    </div>
                                  )}
                                  {ticket.actualDepartureTime && (
                                    <div>
                                      <Label className="text-xs text-slate-500">Horário</Label>
                                      <div className="bg-green-100 px-3 py-2 rounded-md border-l-4 border-green-500 mt-0.5">
                                        <span className="text-lg font-bold text-green-800">{ticket.actualDepartureTime}</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                              {/* VOLTA */}
                              {(ticket.actualReturnDate || ticket.returnCityOrigin) && (
                                <div className="bg-white p-4 rounded-lg border border-orange-200">
                                  <h4 className="font-medium text-orange-600 mb-3 flex items-center gap-2">
                                    <Bus className="w-4 h-4" /> DESEMBARQUE
                                  </h4>
                                  <div className="space-y-2 text-sm">
                                    {ticket.returnCityOrigin && (
                                      <div>
                                        <Label className="text-xs text-slate-500">Cidade Origem</Label>
                                        <p className="font-medium">{ticket.returnCityOrigin}</p>
                                      </div>
                                    )}
                                    {ticket.returnOriginAirport && (
                                      <div>
                                        <Label className="text-xs text-slate-500">Terminal / Rodoviária</Label>
                                        <p className="font-medium">{ticket.returnOriginAirport}</p>
                                      </div>
                                    )}
                                    {ticket.returnCityDestination && (
                                      <div>
                                        <Label className="text-xs text-slate-500">Cidade Destino</Label>
                                        <p className="font-medium">{ticket.returnCityDestination}</p>
                                      </div>
                                    )}
                                    {ticket.returnDestinationAirport && (
                                      <div>
                                        <Label className="text-xs text-slate-500">Terminal Destino</Label>
                                        <p className="font-medium">{ticket.returnDestinationAirport}</p>
                                      </div>
                                    )}
                                    {ticket.actualReturnDate && (
                                      <div>
                                        <Label className="text-xs text-slate-500">Data</Label>
                                        <p className="font-medium text-blue-600">{formatDate(ticket.actualReturnDate)}</p>
                                      </div>
                                    )}
                                    {ticket.actualReturnTime && (
                                      <div>
                                        <Label className="text-xs text-slate-500">Horário</Label>
                                        <div className="bg-orange-100 px-3 py-2 rounded-md border-l-4 border-orange-400 mt-0.5">
                                          <span className="text-lg font-bold text-orange-700">{ticket.actualReturnTime}</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            /* AÉREO: aeroportos, datas */
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              {/* Trecho de IDA */}
                              <div className="bg-white p-4 rounded-lg border border-green-200">
                                <h4 className="font-medium text-green-700 mb-3 flex items-center gap-2">
                                  🛫 IDA
                                </h4>
                                <div className="space-y-2">
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Aeroporto Origem</Label>
                                    <p className="font-medium uppercase">{ticket.departureAirport || "-"}</p>
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Aeroporto Destino</Label>
                                    <p className="font-medium uppercase">{ticket.destinationAirport || "-"}</p>
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Data</Label>
                                    <p className="font-medium text-blue-600 mb-2">
                                      {ticket.actualDepartureDate ? formatDate(ticket.actualDepartureDate) : "-"}
                                    </p>
                                    <Label className="text-xs text-muted-foreground">Horário</Label>
                                    <div className="bg-green-100 px-3 py-2 rounded-md border-l-4 border-green-500">
                                      <span className="text-lg font-bold text-green-800">
                                        {ticket.actualDepartureTime || "--:--"}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              {/* Trecho de VOLTA */}
                              {(ticket.actualReturnDate || ticket.actualReturnTime) && (
                                <div className="bg-white p-4 rounded-lg border border-green-200">
                                  <h4 className="font-medium text-green-700 mb-3 flex items-center gap-2">
                                    🛬 VOLTA
                                  </h4>
                                  <div className="space-y-2">
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Aeroporto Origem</Label>
                                      <p className="font-medium uppercase">{ticket.destinationAirport || "-"}</p>
                                    </div>
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Aeroporto Destino</Label>
                                      <p className="font-medium uppercase">{ticket.departureAirport || "-"}</p>
                                    </div>
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Data</Label>
                                      <p className="font-medium text-blue-600 mb-2">
                                        {ticket.actualReturnDate ? formatDate(ticket.actualReturnDate) : "-"}
                                      </p>
                                      <Label className="text-xs text-muted-foreground">Horário</Label>
                                      <div className="bg-green-100 px-3 py-2 rounded-md border-l-4 border-green-500">
                                        <span className="text-lg font-bold text-green-800">
                                          {ticket.actualReturnTime || "--:--"}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Informações Adicionais */}
                          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                            {ticket.cardLastFourDigits && (
                              <div>
                                <Label className="text-xs text-green-600 dark:text-green-300 font-medium">💳 Cartão Utilizado</Label>
                                <p className="font-medium font-mono">****{ticket.cardLastFourDigits}</p>
                              </div>
                            )}
                            
                            {ticket.attachmentIds && ticket.attachmentIds.length > 0 && (
                              <div className="md:col-span-2">
                                <Label className="text-xs text-green-600 dark:text-green-300 font-medium mb-2 block">📎 Anexos da Passagem</Label>
                                <div className="flex flex-wrap gap-2">
                                  {ticket.attachmentIds.map((attachmentId, index) => (
                                    <div 
                                      key={attachmentId} 
                                      className="flex items-center gap-2 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 px-3 py-2 rounded-lg text-sm hover:bg-blue-100 dark:hover:bg-blue-900 cursor-pointer transition-colors"
                                      onClick={async () => {
                                        // Função para visualizar anexo com chamada real para API
                                        const handleViewAttachment = async (attachmentId: string, attachmentIndex: number) => {
                                          try {
                                            // Buscar informações do anexo via API
                                            const response = await fetch(`/api/attachments/${attachmentId}`);
                                            const attachmentData = await response.json();
                                            
                                            if (response.ok) {
                                              // Mostrar informações reais do anexo
                                              toast({
                                                title: `📎 Anexo ${attachmentIndex + 1}`,
                                                description: `Nome: ${attachmentData.name}\\nTipo: ${attachmentData.type}\\nTamanho: ${attachmentData.size}\\nID: ${attachmentId}\\n\\n${attachmentData.message}`,
                                              });
                                              
                                              // Abrir anexo se disponível
                                              if (attachmentData.viewUrl && attachmentData.viewUrl !== "#") {
                                                // Determinar se abrir inline ou fazer download
                                                const isViewable = attachmentData.type?.includes('pdf') || 
                                                                 attachmentData.type?.includes('image');
                                                
                                                if (isViewable) {
                                                  // Abrir para visualização inline
                                                  window.open(attachmentData.viewUrl, '_blank');
                                                } else {
                                                  // Fazer download direto
                                                  window.open(attachmentData.downloadUrl, '_blank');
                                                }
                                              } else {
                                                // Se não há URL válida, explicar ao usuário
                                                toast({
                                                  title: "Anexo não disponível",
                                                  description: "Este anexo foi criado antes da implementação do sistema de storage. Não é possível visualizar ou baixar.",
                                                  variant: "destructive",
                                                });
                                              }
                                            } else {
                                              throw new Error(attachmentData.message || 'Erro ao buscar anexo');
                                            }
                                          } catch (error) {
                                            toast({
                                              title: "Erro ao abrir anexo",
                                              description: `Não foi possível abrir o anexo: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
                                              variant: "destructive",
                                            });
                                          }
                                        };
                                        
                                        await handleViewAttachment(attachmentId, index);
                                      }}
                                    >
                                      <FileText className="w-4 h-4 text-blue-600" />
                                      <span className="font-medium text-blue-700 dark:text-blue-300">
                                        Anexo {index + 1}
                                      </span>
                                      <span className="text-xs text-blue-500 dark:text-blue-400 font-mono">
                                        {attachmentId.slice(-8)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Botão de Edição */}
                          <div className="mt-6 flex justify-end">
                            {!isReadOnly(selectedInclusion, user) && canEditScreen(user, 'tickets') && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  // Mudar para modo de edição
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
                                  // Forçar re-render para modo de edição
                                  setEditingTicketId(selectedInclusion.id);
                                }}
                                className="flex items-center gap-2"
                              >
                                <Edit className="w-4 h-4" />
                                Editar Passagem
                              </Button>
                            )}
                          </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Formulário para registrar passagem */
                      <div className="space-y-6">
                        {/* Período de Trabalho - RECOLHIDO */}
                        <details className="p-3 bg-accent/30 rounded-lg border border-border">
                          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                            Período de Trabalho
                          </summary>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 pt-3 border-t border-border">
                            <div>
                              <Label className="text-xs text-muted-foreground">Data Início</Label>
                              <p className="text-sm font-medium">{formatDate(selectedInclusion.scheduleStartDate)}</p>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Data Fim</Label>
                              <p className="text-sm font-medium">{formatDate(selectedInclusion.scheduleEndDate)}</p>
                            </div>
                          </div>
                        </details>


                        {/* Seção de Dados da Compra */}
                        <div className="space-y-6">
                          {/* Tipo de Transporte e Configurações */}
                          <div className="bg-purple-50 dark:bg-purple-950 p-4 rounded-lg border-l-4 border-purple-500">
                            <h4 className="font-medium mb-4 text-purple-800 dark:text-purple-200 flex items-center gap-2">
                              🚀 Tipo de Transporte
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <Label htmlFor={`transportType-${selectedInclusion.id}`} className="text-sm font-medium text-purple-700 dark:text-purple-300">
                                  Tipo de Transporte *
                                </Label>
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
                                  <SelectTrigger className="mt-1" data-testid={`select-transport-type-${selectedInclusion.id}`}>
                                    <SelectValue placeholder="Selecione" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="aereo">✈️ Aérea</SelectItem>
                                    <SelectItem value="rodoviario">🚌 Rodoviária</SelectItem>
                                    <SelectItem value="van">🚐 Van</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex items-center gap-3 mt-6">
                                <button
                                  role="switch"
                                  aria-checked={data.isOneWay || false}
                                  onClick={() => !isReadOnly(selectedInclusion, user) && canEditScreen(user, 'tickets') && handleTicketDataChange(selectedInclusion.id, "isOneWay", !(data.isOneWay || false))}
                                  style={{
                                    width: 44, height: 24, borderRadius: 12, border: 'none', cursor: isReadOnly(selectedInclusion, user) ? 'not-allowed' : 'pointer',
                                    background: data.isOneWay ? '#3B5BDB' : '#CBD5E1', position: 'relative', transition: 'background 0.2s', flexShrink: 0, padding: 0
                                  }}
                                >
                                  <span style={{
                                    position: 'absolute', top: 2, left: data.isOneWay ? 22 : 2,
                                    width: 20, height: 20, borderRadius: '50%', background: '#fff',
                                    transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                                  }} />
                                </button>
                                <label style={{fontSize:14,fontWeight:500,color:'#7C3AED',cursor:'pointer'}}
                                  onClick={() => !isReadOnly(selectedInclusion, user) && canEditScreen(user, 'tickets') && handleTicketDataChange(selectedInclusion.id, "isOneWay", !(data.isOneWay || false))}>
                                  Apenas ida (sem volta)
                                </label>
                              </div>
                            </div>
                          </div>

                          {/* VAN: formulário simplificado */}
                          {data.transportType === 'van' && (
                            <div className="bg-slate-50 p-4 rounded-lg border-l-4 border-slate-400 space-y-4">
                              <h4 className="font-medium text-slate-800 flex items-center gap-2">
                                🚐 Dados da Van
                              </h4>
                              <div>
                                <Label htmlFor={`vanCompany-${selectedInclusion.id}`} className="text-sm font-medium">
                                  Nome da Empresa *
                                </Label>
                                <Input
                                  id={`vanCompany-${selectedInclusion.id}`}
                                  placeholder="Ex: Transluz Transportes"
                                  value={data.purchaseOrderNumber || ""}
                                  onChange={(e) => handleTicketDataChange(selectedInclusion.id, "purchaseOrderNumber", e.target.value)}
                                  className="mt-1"
                                  disabled={isReadOnly(selectedInclusion, user) || !canEditScreen(user, 'tickets')}
                                />
                              </div>
                              <div>
                                <Label htmlFor={`vanObs-${selectedInclusion.id}`} className="text-sm font-medium">
                                  Observação
                                </Label>
                                <Textarea
                                  id={`vanObs-${selectedInclusion.id}`}
                                  placeholder="Horário de saída, ponto de encontro, número de vagas..."
                                  value={data.ticketObservations || ""}
                                  onChange={(e) => handleTicketDataChange(selectedInclusion.id, "ticketObservations", e.target.value)}
                                  className="mt-1 h-24 resize-none"
                                  disabled={isReadOnly(selectedInclusion, user) || !canEditScreen(user, 'tickets')}
                                />
                              </div>
                            </div>
                          )}

                          {/* Informações Gerais, Viagem e Adicionais: ocultos na van */}
                          {data.transportType !== 'van' && (<>
                          <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg border-l-4 border-green-500">
                            <h4 className="font-medium mb-4 text-green-800 dark:text-green-200 flex items-center gap-2">
                              💰 Informações da Compra
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div>
                                <Label htmlFor={`value-${selectedInclusion.id}`} className="text-sm font-medium text-green-700 dark:text-green-300">
                                  Valor da Passagem (R$) *
                                </Label>
                                <Input
                                  id={`value-${selectedInclusion.id}`}
                                  type="number"
                                  step="0.01"
                                  placeholder="0.00"
                                  value={data.value || ""}
                                  onChange={(e) => handleTicketDataChange(selectedInclusion.id, "value", e.target.value)}
                                  className="mt-1"
                                  data-testid={`input-value-${selectedInclusion.id}`}
                                  disabled={isReadOnly(selectedInclusion, user) || !canEditScreen(user, 'tickets')}
                                />
                              </div>
                              <div>
                                <Label htmlFor={`purchaseOrderNumber-${selectedInclusion.id}`} className="text-sm font-medium text-green-700 dark:text-green-300">
                                  LOC *
                                </Label>
                                <Input
                                  id={`purchaseOrderNumber-${selectedInclusion.id}`}
                                  placeholder="Número da LOC"
                                  value={data.purchaseOrderNumber || ""}
                                  onChange={(e) => handleTicketDataChange(selectedInclusion.id, "purchaseOrderNumber", e.target.value)}
                                  data-testid={`input-purchase-order-${selectedInclusion.id}`}
                                  disabled={isReadOnly(selectedInclusion, user) || !canEditScreen(user, 'tickets')}
                                />
                              </div>
                              <div>
                                <Label htmlFor={`purchaseDate-${selectedInclusion.id}`} className="text-sm font-medium text-green-700 dark:text-green-300">
                                  Data da Compra *
                                </Label>
                                <Input
                                  id={`purchaseDate-${selectedInclusion.id}`}
                                  type="date"
                                  value={data.purchaseDate || ""}
                                  onChange={(e) => handleTicketDataChange(selectedInclusion.id, "purchaseDate", e.target.value)}
                                  className="mt-1"
                                  data-testid={`input-purchase-date-${selectedInclusion.id}`}
                                  disabled={isReadOnly(selectedInclusion, user) || !canEditScreen(user, 'tickets')}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Informações de Viagem - Agrupadas por Trecho */}
                          <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg border-l-4 border-blue-500">
                            <h4 className="font-medium mb-4 text-blue-800 dark:text-blue-200 flex items-center gap-2">
                              {data.transportType === "van" ? "🚐" : data.transportType === "rodoviario" ? "🚌" : "✈️"} Informações de Viagem
                            </h4>
                            
                            {/* Agrupamento por Trecho - Ida e Volta */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              {/* Trecho de IDA */}
                              <div className="bg-white dark:bg-blue-900/30 p-4 rounded-lg border border-blue-200 dark:border-blue-700">
                                <h5 className="font-medium text-blue-700 dark:text-blue-300 mb-4 flex items-center gap-2">
                                  {data.transportType === "van" ? "🚐" : data.transportType === "rodoviario" ? "🚌" : "🛫"} IDA
                                </h5>
                                <div className="space-y-3">
                                  {/* Cidades */}
                                  <div>
                                    <Label htmlFor={`departureCityOrigin-${selectedInclusion.id}`} className="text-sm font-medium">
                                      Cidade Origem *
                                    </Label>
                                    <Input
                                      id={`departureCityOrigin-${selectedInclusion.id}`}
                                      placeholder="Ex: São Paulo"
                                      value={data.departureCityOrigin || ""}
                                      onChange={(e) => handleTicketDataChange(selectedInclusion.id, "departureCityOrigin", e.target.value)}
                                      className="mt-1"
                                      data-testid={`input-departure-city-origin-${selectedInclusion.id}`}
                                      disabled={isReadOnly(selectedInclusion, user) || !canEditScreen(user, 'tickets')}
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor={`departureCityDestination-${selectedInclusion.id}`} className="text-sm font-medium flex items-center gap-1.5">
                                      Cidade Destino *
                                      <span className="text-[10px] font-medium bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full normal-case">Local do evento</span>
                                    </Label>
                                    <Input
                                      id={`departureCityDestination-${selectedInclusion.id}`}
                                      placeholder="Ex: Rio de Janeiro"
                                      value={data.departureCityDestination || ""}
                                      onChange={(e) => handleTicketDataChange(selectedInclusion.id, "departureCityDestination", e.target.value)}
                                      className="mt-1"
                                      data-testid={`input-departure-city-destination-${selectedInclusion.id}`}
                                      disabled={isReadOnly(selectedInclusion, user) || !canEditScreen(user, 'tickets')}
                                    />
                                  </div>
                                  {/* Aeroportos/Rodoviárias */}
                                  <div>
                                    <Label htmlFor={`departureAirport-${selectedInclusion.id}`} className="text-sm font-medium">
                                      {data.transportType === "van" ? "Local de Saída" : data.transportType === "rodoviario" ? "Rodoviária Origem" : "Aeroporto Origem"} *
                                    </Label>
                                    <Input
                                      id={`departureAirport-${selectedInclusion.id}`}
                                      placeholder={data.transportType === "van" ? "Ex: Endereço de saída" : data.transportType === "rodoviario" ? "Ex: Terminal Rodoviário" : "Ex: GRU, CGH, BSB"}
                                      value={data.departureAirport || ""}
                                      onChange={(e) => handleTicketDataChange(selectedInclusion.id, "departureAirport", e.target.value)}
                                      className="mt-1"
                                      data-testid={`input-departure-airport-${selectedInclusion.id}`}
                                      disabled={isReadOnly(selectedInclusion, user) || !canEditScreen(user, 'tickets')}
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor={`destinationAirport-${selectedInclusion.id}`} className="text-sm font-medium">
                                      {data.transportType === "van" ? "Local de Chegada" : data.transportType === "rodoviario" ? "Rodoviária Destino" : "Aeroporto Destino"} *
                                    </Label>
                                    <Input
                                      id={`destinationAirport-${selectedInclusion.id}`}
                                      placeholder={data.transportType === "van" ? "Ex: Endereço de chegada" : data.transportType === "rodoviario" ? "Ex: Terminal Rodoviário" : "Ex: SDU, GIG, RJ"}
                                      value={data.destinationAirport || ""}
                                      onChange={(e) => handleTicketDataChange(selectedInclusion.id, "destinationAirport", e.target.value)}
                                      className="mt-1"
                                      data-testid={`input-destination-airport-${selectedInclusion.id}`}
                                      disabled={isReadOnly(selectedInclusion, user) || !canEditScreen(user, 'tickets')}
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor={`actualDepartureDate-${selectedInclusion.id}`} className="text-sm font-medium">
                                      Data de Ida *
                                    </Label>
                                    <Input
                                      id={`actualDepartureDate-${selectedInclusion.id}`}
                                      type="date"
                                      value={data.actualDepartureDate || ""}
                                      onChange={(e) => handleTicketDataChange(selectedInclusion.id, "actualDepartureDate", e.target.value)}
                                      className="mt-1"
                                      data-testid={`input-departure-date-${selectedInclusion.id}`}
                                      disabled={isReadOnly(selectedInclusion, user) || !canEditScreen(user, 'tickets')}
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor={`actualDepartureTime-${selectedInclusion.id}`} className="text-sm font-medium">
                                      Horário de Ida *
                                    </Label>
                                    <Input
                                      id={`actualDepartureTime-${selectedInclusion.id}`}
                                      type="time"
                                      placeholder="Ex: 08:30"
                                      value={data.actualDepartureTime || ""}
                                      onChange={(e) => handleTicketDataChange(selectedInclusion.id, "actualDepartureTime", e.target.value)}
                                      className="mt-1"
                                      data-testid={`input-departure-time-${selectedInclusion.id}`}
                                      disabled={isReadOnly(selectedInclusion, user) || !canEditScreen(user, 'tickets')}
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Trecho de VOLTA - Condicional */}
                              {!data.isOneWay && (
                                <div className="bg-white dark:bg-blue-900/30 p-4 rounded-lg border border-blue-200 dark:border-blue-700">
                                  <h5 className="font-medium text-blue-700 dark:text-blue-300 mb-4 flex items-center gap-2">
                                    {data.transportType === "van" ? "🚐" : data.transportType === "rodoviario" ? "🚌" : "🛬"} VOLTA
                                  </h5>
                                  <div className="space-y-3">
                                    {/* Cidades */}
                                    <div>
                                      <Label htmlFor={`returnCityOrigin-${selectedInclusion.id}`} className="text-sm font-medium flex items-center gap-1.5">
                                        Cidade Origem *
                                        <span className="text-[10px] font-medium bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full normal-case">Local do evento</span>
                                      </Label>
                                      <Input
                                        id={`returnCityOrigin-${selectedInclusion.id}`}
                                        placeholder="Ex: Rio de Janeiro"
                                        value={data.returnCityOrigin || ""}
                                        onChange={(e) => handleTicketDataChange(selectedInclusion.id, "returnCityOrigin", e.target.value)}
                                        className="mt-1"
                                        data-testid={`input-return-city-origin-${selectedInclusion.id}`}
                                        disabled={isReadOnly(selectedInclusion, user) || !canEditScreen(user, 'tickets')}
                                      />
                                    </div>
                                    <div>
                                      <Label htmlFor={`returnCityDestination-${selectedInclusion.id}`} className="text-sm font-medium">
                                        Cidade Destino *
                                      </Label>
                                      <Input
                                        id={`returnCityDestination-${selectedInclusion.id}`}
                                        placeholder="Ex: São Paulo"
                                        value={data.returnCityDestination || ""}
                                        onChange={(e) => handleTicketDataChange(selectedInclusion.id, "returnCityDestination", e.target.value)}
                                        className="mt-1"
                                        data-testid={`input-return-city-destination-${selectedInclusion.id}`}
                                        disabled={isReadOnly(selectedInclusion, user) || !canEditScreen(user, 'tickets')}
                                      />
                                    </div>
                                    {/* Aeroportos/Rodoviárias */}
                                    <div>
                                      <Label htmlFor={`returnOriginAirport-${selectedInclusion.id}`} className="text-sm font-medium">
                                        {data.transportType === "van" ? "Local de Saída (Volta)" : data.transportType === "rodoviario" ? "Rodoviária Origem" : "Aeroporto Origem"} *
                                      </Label>
                                      <Input
                                        id={`returnOriginAirport-${selectedInclusion.id}`}
                                        placeholder={data.transportType === "van" ? "Ex: Endereço de saída" : data.transportType === "rodoviario" ? "Ex: Terminal Rodoviário" : "Ex: SDU, GIG, GRU"}
                                        value={data.returnOriginAirport || ""}
                                        onChange={(e) => handleTicketDataChange(selectedInclusion.id, "returnOriginAirport", e.target.value)}
                                        className="mt-1"
                                        data-testid={`input-return-origin-airport-${selectedInclusion.id}`}
                                        disabled={isReadOnly(selectedInclusion, user) || !canEditScreen(user, 'tickets')}
                                      />
                                    </div>
                                    <div>
                                      <Label htmlFor={`returnDestinationAirport-${selectedInclusion.id}`} className="text-sm font-medium">
                                        {data.transportType === "van" ? "Local de Chegada (Volta)" : data.transportType === "rodoviario" ? "Rodoviária Destino" : "Aeroporto Destino"} *
                                      </Label>
                                      <Input
                                        id={`returnDestinationAirport-${selectedInclusion.id}`}
                                        placeholder={data.transportType === "van" ? "Ex: Endereço de chegada" : data.transportType === "rodoviario" ? "Ex: Terminal Rodoviário" : "Ex: GRU, CGH, BSB"}
                                        value={data.returnDestinationAirport || ""}
                                        onChange={(e) => handleTicketDataChange(selectedInclusion.id, "returnDestinationAirport", e.target.value)}
                                        className="mt-1"
                                        data-testid={`input-return-destination-airport-${selectedInclusion.id}`}
                                        disabled={isReadOnly(selectedInclusion, user) || !canEditScreen(user, 'tickets')}
                                      />
                                    </div>
                                    <div>
                                      <Label htmlFor={`actualReturnDate-${selectedInclusion.id}`} className="text-sm font-medium">
                                        Data de Volta *
                                      </Label>
                                      <Input
                                        id={`actualReturnDate-${selectedInclusion.id}`}
                                        type="date"
                                        value={data.actualReturnDate || ""}
                                        onChange={(e) => handleTicketDataChange(selectedInclusion.id, "actualReturnDate", e.target.value)}
                                        className="mt-1"
                                        data-testid={`input-return-date-${selectedInclusion.id}`}
                                        disabled={isReadOnly(selectedInclusion, user) || !canEditScreen(user, 'tickets')}
                                      />
                                    </div>
                                    <div>
                                      <Label htmlFor={`actualReturnTime-${selectedInclusion.id}`} className="text-sm font-medium">
                                        Horário de Volta *
                                      </Label>
                                      <Input
                                        id={`actualReturnTime-${selectedInclusion.id}`}
                                        type="time"
                                        placeholder="Ex: 18:45"
                                        value={data.actualReturnTime || ""}
                                        onChange={(e) => handleTicketDataChange(selectedInclusion.id, "actualReturnTime", e.target.value)}
                                        className="mt-1"
                                        data-testid={`input-return-time-${selectedInclusion.id}`}
                                        disabled={isReadOnly(selectedInclusion, user) || !canEditScreen(user, 'tickets')}
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Informações Adicionais */}
                          <div className="bg-gray-50 dark:bg-gray-950 p-4 rounded-lg border-l-4 border-gray-500">
                            <h4 className="font-medium mb-4 text-gray-800 dark:text-gray-200 flex items-center gap-2">
                              💳 Informações Adicionais
                            </h4>
                            <div className="space-y-4">
                              <div>
                                <Label htmlFor={`cardLastFourDigits-${selectedInclusion.id}`} className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                  Últimos 4 Dígitos do Cartão (Opcional)
                                </Label>
                                <Input
                                  id={`cardLastFourDigits-${selectedInclusion.id}`}
                                  placeholder="1234"
                                  maxLength={4}
                                  value={data.cardLastFourDigits || ""}
                                  onChange={(e) => handleTicketDataChange(selectedInclusion.id, "cardLastFourDigits", e.target.value.replace(/\D/g, '').slice(0, 4))}
                                  className="mt-1"
                                  data-testid={`input-card-digits-${selectedInclusion.id}`}
                                  disabled={isReadOnly(selectedInclusion, user) || !canEditScreen(user, 'tickets')}
                                />
                              </div>
                              <div>
                                <Label htmlFor={`ticketObservations-${selectedInclusion.id}`} className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                  Observações sobre a Passagem (Opcional)
                                </Label>
                                <Textarea
                                  id={`ticketObservations-${selectedInclusion.id}`}
                                  placeholder="Informações adicionais sobre a passagem..."
                                  value={data.ticketObservations || ""}
                                  onChange={(e) => handleTicketDataChange(selectedInclusion.id, "ticketObservations", e.target.value)}
                                  className="mt-1 h-20 resize-none"
                                  data-testid={`textarea-ticket-observations-${selectedInclusion.id}`}
                                  disabled={isReadOnly(selectedInclusion, user) || !canEditScreen(user, 'tickets')}
                                />
                              </div>
                            </div>
                          </div>
                          </>)}
                        </div>

                        {/* Campo de Anexos */}
                        <div className="mt-4">
                          <AttachmentUpload
                            attachmentIds={data.attachmentIds || []}
                            onAttachmentsChange={(attachmentIds) => 
                              handleTicketDataChange(selectedInclusion.id, "attachmentIds", attachmentIds)
                            }
                            disabled={createTicketMutation.isPending || isReadOnly(selectedInclusion, user)}
                          />
                        </div>


                        {/* Seção de Comentários */}
                        <div className="space-y-3" style={{borderTop:'1px solid #E2E8F0',paddingTop:16}}>
                          <div className="flex items-center justify-between">
                            <h4 style={{fontSize:14,fontWeight:600,color:'#1E293B',display:'flex',alignItems:'center',gap:6}}>
                              <MessageCircle className="w-4 h-4" style={{color:'#64748B'}} />
                              Comentários
                            </h4>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setShowCommentsModal(true)}
                              style={{borderColor:'#3B5BDB',color:'#3B5BDB'}}
                              className="flex items-center gap-2"
                            >
                              <MessageCircle className="w-4 h-4" />
                              {isReadOnly(selectedInclusion, user) ? "Ver Comentários" : "Ver/Adicionar Comentários"}
                            </Button>
                          </div>
                          
                          <div className="rounded-lg p-3" style={{background:'#F8FAFC',border:'1px solid #E2E8F0'}}>
                            {comments && comments.length > 0 ? (
                              <div className="space-y-2">
                                <p className="text-sm font-medium text-muted-foreground">
                                  Últimos comentários ({comments.length} total):
                                </p>
                                {comments.slice(-2).map((comment) => (
                                  <div key={comment.id} className="text-sm">
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <span>{users?.find(u => u.id === comment.userId)?.name || 'Usuário'}</span>
                                      <span>•</span>
                                      <span>{comment.createdAt ? new Date(comment.createdAt).toLocaleDateString('pt-BR') : ''}</span>
                                      <span>•</span>
                                      <span className="capitalize">{comment.phase}</span>
                                    </div>
                                    <p className="text-foreground mt-1">
                                      {comment.content.length > 100 
                                        ? `${comment.content.substring(0, 100)}...` 
                                        : comment.content
                                      }
                                    </p>
                                  </div>
                                ))}
                                {comments.length > 2 && (
                                  <p className="text-xs text-muted-foreground cursor-pointer hover:underline"
                                     onClick={() => setShowCommentsModal(true)}>
                                    Ver todos os {comments.length} comentários →
                                  </p>
                                )}
                              </div>
                            ) : (
                              <div style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'12px 0',gap:8}}>
                                <MessageCircle style={{width:28,height:28,color:'#CBD5E1'}} />
                                <p style={{fontSize:13,color:'#94A3B8',textAlign:'center'}}>Nenhum comentário registrado para esta inclusão.</p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Botões */}
                        <div className="flex gap-3 justify-end" style={{borderTop:'1px solid #E2E8F0',paddingTop:16}}>
                          <Button variant="outline" style={{border:'1px solid #E2E8F0',color:'#64748B'}} onClick={() => {
                            setShowModal(false);
                            setEditingTicketId(null);
                          }}>
                            Cancelar
                          </Button>
                          
                          {selectedInclusion?.status !== 'hospedagem' && !isReadOnly(selectedInclusion, user) && (
                            <>
                              {/* Botões de edição - apenas para usuários com permissão */}
                              {canEditScreen(user, 'tickets') && (
                                <>
                                  {/* Botão Salvar - para dados parciais */}
                                  <Button
                                style={{background:'#64748B',color:'#fff'}}
                                onClick={async () => {
                                  try {
                                    if (editingTicketId || getTicket(selectedInclusion.id)) {
                                      // Atualizar ticket existente com dados parciais
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
                                      // Criar novo ticket com dados parciais (se pelo menos um campo estiver preenchido)
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

                                    toast({
                                      title: "Sucesso",
                                      description: "Dados salvos com sucesso",
                                    });

                                    setShowModal(false);
                                    setEditingTicketId(null);
                                  } catch (error) {
                                    toast({
                                      title: "Erro",
                                      description: "Erro ao salvar dados",
                                      variant: "destructive",
                                    });
                                  }
                                }}
                                disabled={createTicketMutation.isPending || updateTicketMutation.isPending}
                              >
                                {(createTicketMutation.isPending || updateTicketMutation.isPending) ? "Salvando..." : "Salvar"}
                              </Button>

                              {/* Botão Registrar Passagem - para dados obrigatórios */}
                              <Button
                                onClick={async () => {
                                  const isVanModal = data.transportType === 'van';
                                  const isRodoModal = data.transportType === 'rodoviario';

                                  // Validar campos obrigatórios por tipo de transporte
                                  let baseFields: string[];
                                  if (isVanModal) {
                                    baseFields = ['purchaseOrderNumber'];
                                  } else if (isRodoModal) {
                                    // Rodoviária: apenas terminais e datas obrigatórios (valor e bilhete são opcionais)
                                    baseFields = ['departureAirport', 'actualDepartureDate', 'actualDepartureTime'];
                                  } else {
                                    // Aéreo: todos os campos obrigatórios
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
                                      // Atualizar ticket existente
                                      const ticket = getTicket(selectedInclusion.id);
                                      if (ticket) {
                                        await updateTicketMutation.mutateAsync({
                                          id: ticket.id,
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
                                      // Criar novo ticket
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

                                      // Atualizar team inclusion status - passagem agora é independente de hospedagem
                                      const needsAccommodation = selectedInclusion.needsAccommodation;
                                      const accommodation = accommodations?.find(acc => acc.teamInclusionId === selectedInclusion.id);
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
                                        id: selectedInclusion.id,
                                        data: {
                                          status: newStatus,
                                          phase: newPhase
                                        }
                                      });
                                    }

                                    // Mostrar modal de sucesso
                                    setSuccessMessage(editingTicketId ? "Passagem atualizada com sucesso!" : "Passagem registrada com sucesso!");
                                    setShowSuccessModal(true);
                                  } catch (error) {
                                    // Error is already handled by the mutation
                                  }
                                }}
                                disabled={createTicketMutation.isPending || updateTicketMutation.isPending}
                                style={{background:'#3B5BDB',color:'#fff'}}
                              >
                                {(createTicketMutation.isPending || updateTicketMutation.isPending) 
                                  ? (editingTicketId ? "Atualizando..." : "Registrando...") 
                                  : <><span style={{marginRight:6}}>✓</span>{editingTicketId ? "Atualizar Passagem" : "Registrar Passagem"}</>
                                }
                              </Button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Modal de sucesso — overlay central sobre o modal principal */}
            {showSuccessModal && (
              <div className="absolute inset-0 z-50 flex items-center justify-center rounded-lg" style={{background:'rgba(0,0,0,0.35)'}}>
                <div className="bg-white rounded-2xl shadow-2xl flex flex-col items-center px-10 py-8 max-w-xs w-full mx-4" style={{boxShadow:'0 8px 40px rgba(0,0,0,0.18)'}}>
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{background:'#DCFCE7'}}>
                    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                      <circle cx="18" cy="18" r="18" fill="#16A34A" fillOpacity="0.12"/>
                      <path d="M10 18.5L15.5 24L26 13" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 mb-1">Sucesso</h3>
                  <p className="text-sm text-slate-500 text-center mb-6">{successMessage}</p>
                  <button
                    onClick={() => {
                      setShowSuccessModal(false);
                      setShowModal(false);
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
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Modal de Comentários */}
        <CommentsModal
          open={showCommentsModal}
          onClose={() => setShowCommentsModal(false)}
          teamInclusionId={selectedInclusion?.id || ""}
        />
    </>
  );
}