import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plane, Save, Eye, FileText, ChevronDown, ChevronRight, MessageCircle, Edit } from "lucide-react";
import Header from "@/components/layout/header";
import NavigationTabs from "@/components/layout/navigation-tabs";
import SimpleFilters from "@/components/common/simple-filters";
import StatusBadge from "@/components/common/status-badge";
import SortableHeader, { type SortConfig, type SortField } from "@/components/common/sortable-header";
import AttachmentUpload from "@/components/ui/attachment-upload";
import CommentsModal from "@/components/modals/comments-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { isReadOnly, canEdit, canPerformActions } from "@/lib/interactions";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import type { TeamInclusion, Event, Function, Collaborator, Ticket, Comment } from "@shared/schema";

export default function Tickets() {
  const { user } = useAuth();
  const [filters, setFilters] = useState({
    eventId: "all",
    functionId: "all", 
    collaboratorId: "all",
    searchId: "",
    ticketStatus: "all", // all, pending, processed
    inclusionStatus: "active", // all, active (excludes cancelado)
  });
  
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [selectedInclusion, setSelectedInclusion] = useState<TeamInclusion | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedTickets, setSelectedTickets] = useState<string[]>([]); // IDs dos tickets selecionados
  const [editingTicketId, setEditingTicketId] = useState<string | null>(null); // ID do ticket sendo editado
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    basic: true,
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

  const updateTicketMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PATCH", `/api/tickets/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Passagem atualizada com sucesso",
      });
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
    return collaborators?.find(c => c.id === collaboratorId)?.fullName || "Colaborador não encontrado";
  };

  const getCollaborator = (collaboratorId?: string) => {
    if (!collaboratorId) return null;
    return collaborators?.find(c => c.id === collaboratorId) || null;
  };

  const getEventLocation = (eventId: string) => {
    const event = events?.find(e => e.id === eventId);
    return event?.location || "Destino não informado";
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
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    return date.toLocaleDateString("pt-BR");
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  // Função para extrair dados de passagem das observações ou dos campos específicos
  const extractTravelInfoFromObservations = (observations: string | undefined, inclusion?: any) => {
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

  // Filter inclusions that need tickets - show all that need tickets (pending or processed)
  const ticketInclusions = teamInclusions?.filter(
    inclusion => {
      // Show all inclusions that need tickets and have collaborators assigned
      // This includes both "passagem" (pending) and "fechamento"+ (processed)
      const needsTicketMatch = inclusion.needsTicket && inclusion.collaboratorId && 
        (inclusion.status === "aguardando_passagem" ||
         inclusion.status === "passagem" || 
         inclusion.status === "fechamento" || 
         inclusion.status === "aprovacao" || 
         inclusion.status === "aprovado" ||
         inclusion.status === "cancelado");
      
      if (!needsTicketMatch) return false;
      
      // Apply simple filters (event, function, collaborator, and search ID)
      if (filters.eventId !== "all" && inclusion.eventId !== filters.eventId) return false;
      if (filters.functionId !== "all" && inclusion.functionId !== filters.functionId) return false;
      if (filters.collaboratorId !== "all" && inclusion.collaboratorId !== filters.collaboratorId) return false;
      if (filters.searchId && !(
        (inclusion.inclusionNumber && inclusion.inclusionNumber.toString().includes(filters.searchId)) ||
        inclusion.id.toLowerCase().includes(filters.searchId.toLowerCase())
      )) return false;
      
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
      return `${inc.eventId}|${inc.functionId}|${collaboratorBusinessId || ''}`;
    };
    
    const statusPriority: Record<string, number> = {
      'aprovado': 6,
      'aprovacao': 5,
      'fechamento': 4,
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

    // Validar campos obrigatórios
    const requiredFields = [
      { field: 'value', label: 'Valor da Passagem' },
      { field: 'departureAirport', label: 'Aeroporto Ida' },
      { field: 'destinationAirport', label: 'Aeroporto Volta' },
      { field: 'purchaseOrderNumber', label: 'Ordem de Compra' },
      { field: 'actualDepartureDate', label: 'Data de Ida' },
      { field: 'actualDepartureTime', label: 'Horário de Ida' },
      { field: 'actualReturnDate', label: 'Data de Volta' },
      { field: 'actualReturnTime', label: 'Horário de Volta' }
    ];
    
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
            value: Math.round(parseFloat(quickData.value) * 100),
            purchaseDate: quickData.purchaseDate || new Date().toISOString().split('T')[0],
            actualDepartureDate: quickData.actualDepartureDate || null,
            actualDepartureTime: quickData.actualDepartureTime,
            actualReturnDate: quickData.actualReturnDate,
            actualReturnTime: quickData.actualReturnTime,
            departureAirport: quickData.departureAirport,
            destinationAirport: quickData.destinationAirport,
            purchaseOrderNumber: quickData.purchaseOrderNumber || null,
            fileUrl: quickData.fileUrl || null,
            attachmentIds: quickData.attachmentIds && quickData.attachmentIds.length > 0 ? quickData.attachmentIds : null,
            cardLastFourDigits: quickData.cardLastFourDigits || null
          });

          // Atualizar team inclusion para fechamento
          await updateTeamInclusionMutation.mutateAsync({
            id: inclusion.id,
            data: {
              status: "fechamento",
              phase: "fechamento"
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-muted rounded w-1/4 mb-4"></div>
            <div className="h-64 bg-muted rounded"></div>
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
        
        <div className="bg-card rounded-lg shadow-sm border border-border mb-6">
          <div className="px-6 py-4 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-foreground mb-2">✈️ Compra de Passagens</h2>
                <p className="text-muted-foreground">Gerencie a compra de passagens aéreas para os colaboradores escalados.</p>
              </div>
              <div className="flex gap-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">{filteredTicketInclusions.length}</div>
                  <div className="text-xs text-muted-foreground">passagens</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">{filteredTicketInclusions.filter(inc => getTicket(inc.id)).length}</div>
                  <div className="text-xs text-muted-foreground">compradas</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-600">{filteredTicketInclusions.filter(inc => !getTicket(inc.id)).length}</div>
                  <div className="text-xs text-muted-foreground">pendentes</div>
                </div>
              </div>
            </div>
          </div>

          {/* Seção de Registro Rápido */}
          <div className="px-6 py-4 border-b border-border bg-accent/20">
            <div 
              className="flex items-center gap-2 cursor-pointer mb-4"
              onClick={() => toggleSection('basic')}
            >
              {expandedSections.basic ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <h3 className="text-lg font-semibold text-foreground">📋 Registro Rápido em Lote</h3>
              <span className="text-sm text-muted-foreground">(Aplicar mesmos dados a múltiplas passagens)</span>
            </div>

            {expandedSections.basic && (
              <>
                {/* Grade Ultra-compacta */}
                <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-8 lg:grid-cols-10 gap-1 mb-4">
                  <div className="col-span-2">
                    <Label className="text-[10px] font-medium">Valor *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="2500.50"
                      value={ticketData["quick"]?.value || ""}
                      onChange={(e) => handleTicketDataChange("quick", "value", e.target.value)}
                      className="h-6 text-xs px-1"
                      data-testid="input-quick-value"
                    />
                  </div>
                  <div className="col-span-1">
                    <Label className="text-[10px] font-medium">OC *</Label>
                    <Input
                      placeholder="123"
                      value={ticketData["quick"]?.purchaseOrderNumber || ""}
                      onChange={(e) => handleTicketDataChange("quick", "purchaseOrderNumber", e.target.value)}
                      className="h-6 text-xs px-1"
                      data-testid="input-quick-purchase-order"
                    />
                  </div>
                  <div className="col-span-1">
                    <Label className="text-[10px] font-medium">Orig *</Label>
                    <Input
                      placeholder="GRU"
                      value={ticketData["quick"]?.departureAirport || ""}
                      onChange={(e) => handleTicketDataChange("quick", "departureAirport", e.target.value)}
                      className="h-6 text-xs px-1"
                      data-testid="input-quick-departure-airport"
                    />
                  </div>
                  <div className="col-span-1">
                    <Label className="text-[10px] font-medium">Dest *</Label>
                    <Input
                      placeholder="CGH"
                      value={ticketData["quick"]?.destinationAirport || ""}
                      onChange={(e) => handleTicketDataChange("quick", "destinationAirport", e.target.value)}
                      className="h-6 text-xs px-1"
                      data-testid="input-quick-destination-airport"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] font-medium">Ida *</Label>
                    <Input
                      type="date"
                      value={ticketData["quick"]?.actualDepartureDate || ""}
                      onChange={(e) => handleTicketDataChange("quick", "actualDepartureDate", e.target.value)}
                      className="h-6 text-xs px-1"
                      data-testid="input-quick-departure-date"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] font-medium">H.Ida *</Label>
                    <Input
                      type="time"
                      value={ticketData["quick"]?.actualDepartureTime || ""}
                      onChange={(e) => handleTicketDataChange("quick", "actualDepartureTime", e.target.value)}
                      className="h-6 text-xs px-1"
                      data-testid="input-quick-departure-time"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] font-medium">Volta *</Label>
                    <Input
                      type="date"
                      value={ticketData["quick"]?.actualReturnDate || ""}
                      onChange={(e) => handleTicketDataChange("quick", "actualReturnDate", e.target.value)}
                      className="h-6 text-xs px-1"
                      data-testid="input-quick-return-date"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] font-medium">H.Volta *</Label>
                    <Input
                      type="time"
                      value={ticketData["quick"]?.actualReturnTime || ""}
                      onChange={(e) => handleTicketDataChange("quick", "actualReturnTime", e.target.value)}
                      className="h-6 text-xs px-1"
                      data-testid="input-quick-return-time"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] font-medium">Compra</Label>
                    <Input
                      type="date"
                      value={ticketData["quick"]?.purchaseDate || new Date().toISOString().split('T')[0]}
                      onChange={(e) => handleTicketDataChange("quick", "purchaseDate", e.target.value)}
                      className="h-6 text-xs px-1"
                      data-testid="input-quick-purchase-date"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] font-medium">Cartão</Label>
                    <Input
                      placeholder="1234"
                      maxLength={4}
                      value={ticketData["quick"]?.cardLastFourDigits || ""}
                      onChange={(e) => handleTicketDataChange("quick", "cardLastFourDigits", e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="h-6 text-xs px-1"
                      data-testid="input-quick-card-digits"
                    />
                  </div>
                </div>

                {/* Campo de Anexos na Tela Principal */}
                <div className="mt-4">
                  <AttachmentUpload
                    attachmentIds={ticketData["quick"]?.attachmentIds || []}
                    onAttachmentsChange={(attachmentIds) => 
                      handleTicketDataChange("quick", "attachmentIds", attachmentIds)
                    }
                    disabled={false}
                  />
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Preencha os dados comuns (pode ser parcial) e selecione as passagens na tabela para aplicar
                    {selectedTickets.length > 0 && (
                      <span className="text-blue-600 font-medium ml-2">
                        ({selectedTickets.length} passagens selecionadas)
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleApplyToSelected}
                      disabled={
                        selectedTickets.length === 0 || 
                        createTicketMutation.isPending
                      }
                      data-testid="button-apply-to-selected"
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {createTicketMutation.isPending ? "Aplicando..." : `Aplicar a ${selectedTickets.length} Passagens`}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // Limpar campos do registro rápido
                        setTicketData(prev => {
                          const newData = { ...prev };
                          delete newData["quick"];
                          return newData;
                        });
                      }}
                      disabled={!ticketData["quick"] || Object.keys(ticketData["quick"]).length === 0}
                      data-testid="button-clear-quick"
                    >
                      Limpar Campos
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>

          <SimpleFilters filters={filters} onFiltersChange={setFilters} />
          
          {/* Filtro de Status de Passagem */}
          <div className="px-6 py-4 border-b border-border">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-foreground">Status da Passagem:</label>
                <select
                  value={filters.ticketStatus}
                  onChange={(e) => setFilters(prev => ({ ...prev, ticketStatus: e.target.value }))}
                  className="px-3 py-1 border border-border rounded bg-background text-foreground text-sm"
                  data-testid="filter-ticket-status"
                >
                  <option value="all">Todos</option>
                  <option value="pending">Pendentes</option>
                  <option value="processed">Compradas</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-foreground">Status da Inclusão:</label>
                <select
                  value={filters.inclusionStatus}
                  onChange={(e) => setFilters(prev => ({ ...prev, inclusionStatus: e.target.value }))}
                  className="px-3 py-1 border border-border rounded bg-background text-foreground text-sm"
                  data-testid="filter-inclusion-status"
                >
                  <option value="active">Ativas</option>
                  <option value="all">Todas</option>
                  <option value="cancelado">Canceladas</option>
                </select>
              </div>
            </div>
          </div>

          {filteredTicketInclusions.length === 0 ? (
            <div className="p-12 text-center">
              <Plane className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                {filters.ticketStatus === "pending" ? "Nenhuma passagem pendente" : 
                 filters.ticketStatus === "processed" ? "Nenhuma passagem comprada" : 
                 "Nenhuma passagem encontrada"}
              </h3>
              <p className="text-muted-foreground">
                {filters.ticketStatus === "pending" 
                  ? "Todas as passagens foram compradas ou não há colaboradores escalados."
                  : filters.ticketStatus === "processed"
                  ? "Nenhuma passagem foi comprada ainda."
                  : "Não há colaboradores escalados que necessitem de passagens."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      <input
                        type="checkbox"
                        checked={selectedTickets.length > 0}
                        onChange={toggleAllTickets}
                        className="rounded border-gray-300 mr-2"
                        data-testid="checkbox-select-all"
                      />
                      Seleção
                    </th>
                    <SortableHeader field="id" sortConfig={sortConfig} onSort={handleSort}>ID</SortableHeader>
                    <SortableHeader field="function" sortConfig={sortConfig} onSort={handleSort}>Evento / Função</SortableHeader>
                    <SortableHeader field="collaborator" sortConfig={sortConfig} onSort={handleSort}>Colaborador</SortableHeader>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Destino
                    </th>
                    <SortableHeader field="diarias" sortConfig={sortConfig} onSort={handleSort}>Data Ida</SortableHeader>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Data Volta
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Voos Sugeridos
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                  {filteredTicketInclusions.map((inclusion) => {
                    const ticket = getTicket(inclusion.id);
                    return (
                      <tr 
                        key={inclusion.id} 
                        className="hover:bg-muted/50 transition-colors"
                      >
                        <td className="px-4 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          {!ticket && inclusion.status !== 'cancelado' ? (
                            <input
                              type="checkbox"
                              checked={selectedTickets.includes(inclusion.id)}
                              onChange={() => toggleTicketSelection(inclusion.id)}
                              className="rounded border-gray-300"
                              data-testid={`checkbox-ticket-${inclusion.id}`}
                            />
                          ) : (
                            <div className="w-4 h-4"></div>
                          )}
                        </td>
                        <td className={`px-4 py-4 whitespace-nowrap ${inclusion.status === 'cancelado' ? 'opacity-60' : 'cursor-pointer'}`} onClick={inclusion.status === 'cancelado' ? undefined : () => handleViewTicketDetails(inclusion)}>
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-mono text-foreground">
                              <span>#{inclusion.inclusionNumber || 'N/A'}</span>
                            </div>
                            <div title={inclusion.status === 'cancelado' ? 'Não é possível interagir com registros cancelados' : ''}>
                              <Eye 
                                className={`w-4 h-4 transition-colors ${inclusion.status === 'cancelado' ? 'text-gray-400 cursor-not-allowed' : 'text-blue-600 hover:text-blue-800 cursor-pointer'}`}
                              />
                            </div>
                          </div>
                        </td>
                        <td className={`px-4 py-4 cursor-pointer ${inclusion.status === 'cancelado' ? 'opacity-60' : ''}`} onClick={() => handleViewTicketDetails(inclusion)}>
                          <div className="text-sm font-medium text-foreground">
                            {getEventName(inclusion.eventId)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {getFunctionName(inclusion.functionId)}
                          </div>
                        </td>
                        <td className={`px-4 py-4 cursor-pointer ${inclusion.status === 'cancelado' ? 'opacity-60' : ''}`} onClick={() => handleViewTicketDetails(inclusion)}>
                          <div className="text-sm font-medium text-foreground">
                            {getCollaboratorName(inclusion.collaboratorId || undefined)}
                          </div>
                        </td>
                        <td className={`px-4 py-4 cursor-pointer ${inclusion.status === 'cancelado' ? 'opacity-60' : ''}`} onClick={() => handleViewTicketDetails(inclusion)}>
                          <div className="text-sm font-medium text-blue-700 dark:text-blue-300">
                            {getEventLocation(inclusion.eventId)}
                          </div>
                        </td>
                        <td className={`px-4 py-4 cursor-pointer ${inclusion.status === 'cancelado' ? 'opacity-60' : ''}`} onClick={() => handleViewTicketDetails(inclusion)}>
                          {ticket ? (
                            <div className="text-sm font-medium text-foreground">
                              {ticket.actualDepartureDate ? (
                                <div>
                                  <div>{formatDate(ticket.actualDepartureDate)}</div>
                                  {(ticket.departureAirport || ticket.actualDepartureTime) && (
                                    <div className="text-xs text-blue-600">
                                      {ticket.departureAirport && ticket.actualDepartureTime 
                                        ? `${ticket.departureAirport} às ${ticket.actualDepartureTime}`
                                        : ticket.departureAirport || `às ${ticket.actualDepartureTime}`
                                      }
                                    </div>
                                  )}
                                </div>
                              ) : "-"}
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground">
                              -
                            </div>
                          )}
                        </td>
                        <td className={`px-4 py-4 cursor-pointer ${inclusion.status === 'cancelado' ? 'opacity-60' : ''}`} onClick={() => handleViewTicketDetails(inclusion)}>
                          {ticket ? (
                            <div className="text-sm font-medium text-foreground">
                              {ticket.actualReturnDate ? (
                                <div>
                                  <div>{formatDate(ticket.actualReturnDate)}</div>
                                  {(ticket.destinationAirport || ticket.actualReturnTime) && (
                                    <div className="text-xs text-blue-600">
                                      {ticket.destinationAirport && ticket.actualReturnTime 
                                        ? `${ticket.destinationAirport} às ${ticket.actualReturnTime}`
                                        : ticket.destinationAirport || `às ${ticket.actualReturnTime}`
                                      }
                                    </div>
                                  )}
                                </div>
                              ) : "-"}
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground">
                              -
                            </div>
                          )}
                        </td>
                        <td className={`px-4 py-4 cursor-pointer ${inclusion.status === 'cancelado' ? 'opacity-60' : ''}`} onClick={() => handleViewTicketDetails(inclusion)}>
                          {(() => {
                            const travelInfo = extractTravelInfoFromObservations(inclusion.observations || undefined);
                            return (
                              <div className="text-xs text-blue-700 dark:text-blue-300">
                                <div className="mb-1">
                                  <span className="font-medium">Ida:</span> {travelInfo.ida !== 'Não definido' ? travelInfo.ida : "N/A"}
                                  {travelInfo.chegada !== 'Não definido' && <div className="text-xs text-gray-600">Chegada: {travelInfo.chegada}</div>}
                                </div>
                                <div>
                                  <span className="font-medium">Volta:</span> {travelInfo.retorno !== 'Não definido' ? travelInfo.retorno : "N/A"}
                                  {travelInfo.horario !== 'Não definido' && <div className="text-xs text-gray-600">Horário: {travelInfo.horario}</div>}
                                </div>
                              </div>
                            );
                          })()}
                        </td>
                        <td className={`px-4 py-4 cursor-pointer ${inclusion.status === 'cancelado' ? 'opacity-60' : ''}`} onClick={() => handleViewTicketDetails(inclusion)}>
                          <div className="flex flex-col gap-1">
                            {(() => {
                              if (inclusion.status === "cancelado") {
                                // For cancelled inclusions, show the ticket-specific status
                                if (ticket) {
                                  // Had a ticket, so show "Comprada"
                                  return (
                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                      Comprada
                                    </span>
                                  );
                                } else {
                                  // No ticket, so show "Aguardando Passagem"
                                  return <StatusBadge status="passagem" />;
                                }
                              } else if (ticket) {
                                return (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    Comprada
                                  </span>
                                );
                              } else {
                                return <StatusBadge status={inclusion.status} />;
                              }
                            })()}
                            {inclusion.status === "cancelado" && (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                Cancelado
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal de Detalhes da Passagem */}
        <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            {selectedInclusion && (
              <div>
                <DialogHeader>
                  <DialogTitle>
                    Detalhes da Passagem #{selectedInclusion.inclusionNumber} - {getEventName(selectedInclusion.eventId)}
                    {isReadOnly(selectedInclusion) && <span className="ml-2 text-sm text-red-600">(Somente Leitura)</span>}
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-6 mt-6">
                  {/* Informações Básicas */}
                  <div className="bg-muted p-4 rounded-lg">
                    <h3 className="font-medium mb-3">Informações Gerais</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground">Colaborador</Label>
                        <p className="font-medium">{getCollaboratorName(selectedInclusion.collaboratorId || undefined)}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Função</Label>
                        <p className="font-medium">{getFunctionName(selectedInclusion.functionId)}</p>
                      </div>
                      
                      {/* Dados do Documento do Colaborador */}
                      {(() => {
                        const collaborator = getCollaborator(selectedInclusion.collaboratorId || undefined);
                        if (!collaborator) return null;
                        
                        return (
                          <>
                            <div>
                              <Label className="text-xs text-muted-foreground">Documento</Label>
                              <p className="font-medium">
                                {collaborator.documentType?.toUpperCase() || 'N/A'}: {collaborator.officialDocument || 'N/A'}
                              </p>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Data de Nascimento</Label>
                              <p className="font-medium">
                                {collaborator.birthDate ? formatDate(collaborator.birthDate) : 'N/A'}
                              </p>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Sugestões de Viagem - Mesmo formato da Escalação */}
                  <details className="border rounded-lg bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-700" open>
                    <summary className="p-3 cursor-pointer font-medium text-sm text-blue-700 dark:text-blue-300 hover:bg-opacity-80 transition-colors">
                      <span className="flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        Sugestões de Viagem
                        <span className="text-xs opacity-60">(vindas da inclusão de equipe)</span>
                      </span>
                    </summary>
                    <div className="p-4 pt-2">
                      {(() => {
                        const travelInfo = extractTravelInfoFromObservations(selectedInclusion.observations || undefined, selectedInclusion);
                        return (
                          <div className="space-y-3">
                            {/* Viagem de IDA */}
                            <div className="border rounded-md p-3 bg-blue-25 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800">
                              <div className="flex items-center gap-2 mb-2">
                                <svg className="w-3 h-3 text-current" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                </svg>
                                <span className="text-xs font-medium">🛫 IDA</span>
                              </div>
                              <div className="grid grid-cols-2 gap-3 text-xs">
                                <div>
                                  <span className="text-muted-foreground">Data:</span>
                                  <div className="font-medium">{travelInfo.ida !== 'N/A' && travelInfo.ida !== 'Não definido' && travelInfo.ida !== 'Não informado' ? travelInfo.ida : 'Não informado'}</div>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Horário:</span>
                                  <div className="font-medium">{travelInfo.chegada !== 'N/A' && travelInfo.chegada !== 'Não definido' && travelInfo.chegada !== 'Não informado' ? travelInfo.chegada : 'Não informado'}</div>
                                </div>
                              </div>
                            </div>

                            {/* Viagem de VOLTA */}
                            <div className="border rounded-md p-3 bg-blue-25 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800">
                              <div className="flex items-center gap-2 mb-2">
                                <svg className="w-3 h-3 text-current" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
                                </svg>
                                <span className="text-xs font-medium">🛬 VOLTA</span>
                              </div>
                              <div className="grid grid-cols-2 gap-3 text-xs">
                                <div>
                                  <span className="text-muted-foreground">Data:</span>
                                  <div className="font-medium">{travelInfo.retorno !== 'N/A' && travelInfo.retorno !== 'Não definido' && travelInfo.retorno !== 'Não informado' ? travelInfo.retorno : 'Não informado'}</div>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Horário:</span>
                                  <div className="font-medium">{travelInfo.horario !== 'N/A' && travelInfo.horario !== 'Não definido' && travelInfo.horario !== 'Não informado' ? travelInfo.horario : 'Não informado'}</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </details>

                  {(() => {
                    const ticket = getTicket(selectedInclusion.id);
                    const data = ticketData[selectedInclusion.id] || {};
                    
                    return ticket && editingTicketId !== selectedInclusion.id ? (
                      /* Passagem já processada */
                      <div className="space-y-6">
                        {/* Cabeçalho da Passagem Comprada */}
                        <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg border-l-4 border-green-500">
                          <h3 className="font-medium mb-4 text-green-800 dark:text-green-200 flex items-center gap-2">
                            <FileText className="w-4 h-4" />
                            ✅ Passagem Comprada
                          </h3>
                          
                          {/* Informações Gerais da Compra */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                            <div>
                              <Label className="text-xs text-green-600 dark:text-green-300 font-medium">💰 Valor</Label>
                              <p className="font-bold text-lg text-green-700 dark:text-green-300">{formatCurrency((ticket.value || 0) / 100)}</p>
                            </div>
                            <div>
                              <Label className="text-xs text-green-600 dark:text-green-300 font-medium">📅 Data da Compra</Label>
                              <p className="font-medium">{ticket.purchaseDate ? formatDate(ticket.purchaseDate) : "-"}</p>
                            </div>
                            {ticket.purchaseOrderNumber && (
                              <div>
                                <Label className="text-xs text-green-600 dark:text-green-300 font-medium">📋 Ordem de Compra</Label>
                                <p className="font-medium">{ticket.purchaseOrderNumber}</p>
                              </div>
                            )}
                          </div>

                          {/* Detalhes dos Voos */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Voo de Ida */}
                            <div className="bg-white dark:bg-green-900/30 p-4 rounded-lg border border-green-200 dark:border-green-700">
                              <h4 className="font-medium text-green-700 dark:text-green-300 mb-3 flex items-center gap-2">
                                🛫 Voo de Ida
                              </h4>
                              <div className="space-y-2">
                                <div>
                                  <Label className="text-xs text-muted-foreground">Aeroporto Ida</Label>
                                  <p className="font-medium">{ticket.departureAirport || "-"}</p>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground">Data e Horário</Label>
                                  <p className="font-medium text-blue-600 dark:text-blue-400">
                                    {ticket.actualDepartureDate ? formatDate(ticket.actualDepartureDate) : "-"}
                                    {ticket.actualDepartureTime && (
                                      <span className="ml-2 bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded text-sm">
                                        {ticket.actualDepartureTime}
                                      </span>
                                    )}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Voo de Volta */}
                            <div className="bg-white dark:bg-green-900/30 p-4 rounded-lg border border-green-200 dark:border-green-700">
                              <h4 className="font-medium text-green-700 dark:text-green-300 mb-3 flex items-center gap-2">
                                🛬 Voo de Volta
                              </h4>
                              <div className="space-y-2">
                                <div>
                                  <Label className="text-xs text-muted-foreground">Aeroporto Volta</Label>
                                  <p className="font-medium">{ticket.destinationAirport || "-"}</p>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground">Data e Horário</Label>
                                  <p className="font-medium text-blue-600 dark:text-blue-400">
                                    {ticket.actualReturnDate ? formatDate(ticket.actualReturnDate) : "-"}
                                    {ticket.actualReturnTime && (
                                      <span className="ml-2 bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded text-sm">
                                        {ticket.actualReturnTime}
                                      </span>
                                    )}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>

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
                            {!isReadOnly(selectedInclusion) && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  // Mudar para modo de edição
                                  setTicketData(prev => ({
                                    ...prev,
                                    [selectedInclusion.id]: {
                                      value: ((ticket.value || 0) / 100).toString(),
                                      departureAirport: ticket.departureAirport || "",
                                      destinationAirport: ticket.destinationAirport || "",
                                      purchaseOrderNumber: ticket.purchaseOrderNumber || "",
                                      actualDepartureDate: ticket.actualDepartureDate || "",
                                      actualReturnDate: ticket.actualReturnDate || "",
                                      actualDepartureTime: ticket.actualDepartureTime || "",
                                      actualReturnTime: ticket.actualReturnTime || "",
                                      cardLastFourDigits: ticket.cardLastFourDigits || "",
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
                    ) : (
                      /* Formulário para registrar passagem */
                      <div className="space-y-6">
                        {/* Período de Trabalho */}
                        <div className="p-4 bg-accent/50 rounded-lg">
                          <h4 className="font-medium text-foreground mb-3">Período de Trabalho</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <Label className="text-xs text-muted-foreground">Data Início</Label>
                              <p className="font-medium">{formatDate(selectedInclusion.scheduleStartDate)}</p>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Data Fim</Label>
                              <p className="font-medium">{formatDate(selectedInclusion.scheduleEndDate)}</p>
                            </div>
                          </div>
                        </div>


                        {/* Seção de Dados da Compra */}
                        <div className="space-y-6">
                          {/* Informações Gerais */}
                          <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg border-l-4 border-green-500">
                            <h4 className="font-medium mb-4 text-green-800 dark:text-green-200 flex items-center gap-2">
                              💰 Informações da Compra
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                  disabled={isReadOnly(selectedInclusion)}
                                />
                              </div>
                              <div>
                                <Label htmlFor={`purchaseOrderNumber-${selectedInclusion.id}`} className="text-sm font-medium text-green-700 dark:text-green-300">
                                  Ordem de Compra *
                                </Label>
                                <Input
                                  id={`purchaseOrderNumber-${selectedInclusion.id}`}
                                  placeholder="Número da OC"
                                  value={data.purchaseOrderNumber || ""}
                                  onChange={(e) => handleTicketDataChange(selectedInclusion.id, "purchaseOrderNumber", e.target.value)}
                                  disabled={isReadOnly(selectedInclusion)}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Informações dos Aeroportos */}
                          <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg border-l-4 border-blue-500">
                            <h4 className="font-medium mb-4 text-blue-800 dark:text-blue-200 flex items-center gap-2">
                              ✈️ Aeroportos
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <Label htmlFor={`departureAirport-${selectedInclusion.id}`} className="text-sm font-medium text-blue-700 dark:text-blue-300">
                                  Aeroporto Ida *
                                </Label>
                                <Input
                                  id={`departureAirport-${selectedInclusion.id}`}
                                  placeholder="Ex: GRU, CGH, BSB"
                                  value={data.departureAirport || ""}
                                  onChange={(e) => handleTicketDataChange(selectedInclusion.id, "departureAirport", e.target.value)}
                                  disabled={isReadOnly(selectedInclusion)}
                                />
                              </div>
                              <div>
                                <Label htmlFor={`destinationAirport-${selectedInclusion.id}`} className="text-sm font-medium text-blue-700 dark:text-blue-300">
                                  Aeroporto Volta *
                                </Label>
                                <Input
                                  id={`destinationAirport-${selectedInclusion.id}`}
                                  placeholder="Ex: SDU, GIG, RJ"
                                  value={data.destinationAirport || ""}
                                  onChange={(e) => handleTicketDataChange(selectedInclusion.id, "destinationAirport", e.target.value)}
                                  disabled={isReadOnly(selectedInclusion)}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Dados dos Voos */}
                          <div className="bg-orange-50 dark:bg-orange-950 p-4 rounded-lg border-l-4 border-orange-500">
                            <h4 className="font-medium mb-4 text-orange-800 dark:text-orange-200 flex items-center gap-2">
                              🗓️ Datas e Horários dos Voos
                            </h4>
                            
                            {/* Voo de Ida */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                              <div className="bg-white dark:bg-orange-900/30 p-4 rounded-lg border border-orange-200 dark:border-orange-700">
                                <h5 className="font-medium text-orange-700 dark:text-orange-300 mb-3 flex items-center gap-2">
                                  🛫 Voo de Ida
                                </h5>
                                <div className="space-y-3">
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
                                      disabled={isReadOnly(selectedInclusion)}
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
                                      disabled={isReadOnly(selectedInclusion)}
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Voo de Volta */}
                              <div className="bg-white dark:bg-orange-900/30 p-4 rounded-lg border border-orange-200 dark:border-orange-700">
                                <h5 className="font-medium text-orange-700 dark:text-orange-300 mb-3 flex items-center gap-2">
                                  🛬 Voo de Volta
                                </h5>
                                <div className="space-y-3">
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
                                      disabled={isReadOnly(selectedInclusion)}
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
                                      disabled={isReadOnly(selectedInclusion)}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Informações Adicionais */}
                          <div className="bg-gray-50 dark:bg-gray-950 p-4 rounded-lg border-l-4 border-gray-500">
                            <h4 className="font-medium mb-4 text-gray-800 dark:text-gray-200 flex items-center gap-2">
                              💳 Informações Adicionais
                            </h4>
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
                                disabled={isReadOnly(selectedInclusion)}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Campo de Anexos */}
                        <div className="mt-4">
                          <AttachmentUpload
                            attachmentIds={data.attachmentIds || []}
                            onAttachmentsChange={(attachmentIds) => 
                              handleTicketDataChange(selectedInclusion.id, "attachmentIds", attachmentIds)
                            }
                            disabled={createTicketMutation.isPending || isReadOnly(selectedInclusion)}
                          />
                        </div>


                        {/* Seção de Comentários */}
                        <div className="space-y-4 border-t pt-4">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium text-foreground">Comentários</h4>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setShowCommentsModal(true)}
                              className="flex items-center gap-2"
                            >
                              <MessageCircle className="w-4 h-4" />
                              {isReadOnly(selectedInclusion) ? "Ver Comentários" : "Ver/Adicionar Comentários"}
                            </Button>
                          </div>
                          
                          {/* Últimos comentários */}
                          <div className="bg-muted/50 rounded-lg p-3">
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
                              <p className="text-sm text-muted-foreground">
                                Nenhum comentário registrado para esta inclusão.
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Botões */}
                        <div className="flex gap-3 justify-end pt-4 border-t">
                          <Button variant="outline" onClick={() => {
                            setShowModal(false);
                            setEditingTicketId(null);
                          }}>
                            Cancelar
                          </Button>
                          
                          {selectedInclusion?.status !== 'fechamento' && !isReadOnly(selectedInclusion) && (
                            <>
                              {/* Botão Salvar - para dados parciais */}
                              <Button
                                variant="secondary"
                                onClick={async () => {
                                  try {
                                    if (editingTicketId || getTicket(selectedInclusion.id)) {
                                      // Atualizar ticket existente com dados parciais
                                      const ticketToUpdate = getTicket(selectedInclusion.id);
                                      if (ticketToUpdate) {
                                        await updateTicketMutation.mutateAsync({
                                          id: ticketToUpdate.id,
                                          data: {
                                            value: data.value ? Math.round(parseFloat(data.value) * 100) : ticketToUpdate.value,
                                            actualDepartureDate: data.actualDepartureDate || ticketToUpdate.actualDepartureDate,
                                            actualDepartureTime: data.actualDepartureTime || ticketToUpdate.actualDepartureTime,
                                            actualReturnDate: data.actualReturnDate || ticketToUpdate.actualReturnDate,
                                            actualReturnTime: data.actualReturnTime || ticketToUpdate.actualReturnTime,
                                            departureAirport: data.departureAirport || ticketToUpdate.departureAirport,
                                            destinationAirport: data.destinationAirport || ticketToUpdate.destinationAirport,
                                            purchaseOrderNumber: data.purchaseOrderNumber || ticketToUpdate.purchaseOrderNumber,
                                            cardLastFourDigits: data.cardLastFourDigits || ticketToUpdate.cardLastFourDigits,
                                            attachmentIds: data.attachmentIds && data.attachmentIds.length > 0 ? data.attachmentIds : ticketToUpdate.attachmentIds
                                          }
                                        });
                                      }
                                    } else if (data.value || data.departureAirport || data.destinationAirport || data.purchaseOrderNumber) {
                                      // Criar novo ticket com dados parciais (se pelo menos um campo estiver preenchido)
                                      await createTicketMutation.mutateAsync({
                                        teamInclusionId: selectedInclusion.id,
                                        value: data.value ? Math.round(parseFloat(data.value) * 100) : 0,
                                        purchaseDate: data.purchaseDate || new Date().toISOString().split('T')[0],
                                        actualDepartureDate: data.actualDepartureDate || null,
                                        actualDepartureTime: data.actualDepartureTime || null,
                                        actualReturnDate: data.actualReturnDate || null,
                                        actualReturnTime: data.actualReturnTime || null,
                                        departureAirport: data.departureAirport || "",
                                        destinationAirport: data.destinationAirport || "",
                                        purchaseOrderNumber: data.purchaseOrderNumber || "",
                                        fileUrl: data.fileUrl || null,
                                        attachmentIds: data.attachmentIds && data.attachmentIds.length > 0 ? data.attachmentIds : null,
                                        cardLastFourDigits: data.cardLastFourDigits || null
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
                                  // Validar campos obrigatórios
                                  if (!data.value || !data.departureAirport || !data.destinationAirport || !data.purchaseOrderNumber || !data.actualDepartureDate || !data.actualReturnDate || !data.actualDepartureTime || !data.actualReturnTime) {
                                    toast({
                                      title: "Erro",
                                      description: "Preencha todos os campos obrigatórios (incluindo horários)",
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
                                          value: Math.round(parseFloat(data.value) * 100),
                                          actualDepartureDate: data.actualDepartureDate,
                                          actualDepartureTime: data.actualDepartureTime,
                                          actualReturnDate: data.actualReturnDate,
                                          actualReturnTime: data.actualReturnTime,
                                          departureAirport: data.departureAirport,
                                          destinationAirport: data.destinationAirport,
                                          purchaseOrderNumber: data.purchaseOrderNumber,
                                          cardLastFourDigits: data.cardLastFourDigits || null,
                                          attachmentIds: data.attachmentIds && data.attachmentIds.length > 0 ? data.attachmentIds : null
                                        }
                                        });
                                      }
                                    } else {
                                      // Criar novo ticket
                                      await createTicketMutation.mutateAsync({
                                        teamInclusionId: selectedInclusion.id,
                                        value: Math.round(parseFloat(data.value) * 100),
                                        purchaseDate: data.purchaseDate || new Date().toISOString().split('T')[0],
                                        actualDepartureDate: data.actualDepartureDate,
                                        actualDepartureTime: data.actualDepartureTime,
                                        actualReturnDate: data.actualReturnDate,
                                        actualReturnTime: data.actualReturnTime,
                                        departureAirport: data.departureAirport,
                                        destinationAirport: data.destinationAirport,
                                        purchaseOrderNumber: data.purchaseOrderNumber,
                                        fileUrl: data.fileUrl || null,
                                        attachmentIds: data.attachmentIds && data.attachmentIds.length > 0 ? data.attachmentIds : null,
                                        cardLastFourDigits: data.cardLastFourDigits || null
                                      });

                                      // Atualizar team inclusion para fechamento (só quando criar novo)
                                      await updateTeamInclusionMutation.mutateAsync({
                                        id: selectedInclusion.id,
                                        data: {
                                          status: "fechamento",
                                          phase: "fechamento"
                                        }
                                      });
                                    }

                                    setShowModal(false);
                                    setEditingTicketId(null);
                                    
                                    // Limpar dados do formulário
                                    setTicketData(prev => {
                                      const newData = { ...prev };
                                      delete newData[selectedInclusion.id];
                                      return newData;
                                    });
                                  } catch (error) {
                                    // Error is already handled by the mutation
                                  }
                                }}
                                disabled={createTicketMutation.isPending || updateTicketMutation.isPending}
                              >
                                {(createTicketMutation.isPending || updateTicketMutation.isPending) 
                                  ? (editingTicketId ? "Atualizando..." : "Registrando...") 
                                  : (editingTicketId ? "Atualizar Passagem" : "Registrar Passagem")
                                }
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })()}
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
      </div>
    </div>
  );
}