import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plane, Save, Eye, FileText, ChevronDown, ChevronRight } from "lucide-react";
import Header from "@/components/layout/header";
import NavigationTabs from "@/components/layout/navigation-tabs";
import SimpleFilters from "@/components/common/simple-filters";
import StatusBadge from "@/components/common/status-badge";
import AttachmentUpload from "@/components/ui/attachment-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { TeamInclusion, Event, Function, Collaborator, Ticket } from "@shared/schema";

export default function Tickets() {
  const [filters, setFilters] = useState({
    eventId: "all",
    functionId: "all", 
    collaboratorId: "all",
    searchId: "",
    ticketStatus: "all", // all, pending, processed
  });
  const [selectedInclusion, setSelectedInclusion] = useState<TeamInclusion | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedTickets, setSelectedTickets] = useState<string[]>([]); // IDs dos tickets selecionados
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    basic: true,
    dates: true,
    additional: false
  });
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

  const { data: tickets } = useQuery<Ticket[]>({
    queryKey: ["/api/tickets"],
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

  // Filter inclusions that need tickets - show all that need tickets (pending or processed)
  const ticketInclusions = teamInclusions?.filter(
    inclusion => {
      // Show all inclusions that need tickets and have collaborators assigned
      // This includes both "passagem" (pending) and "fechamento"+ (processed)
      const needsTicketMatch = inclusion.needsTicket && inclusion.collaboratorId && 
        (inclusion.status === "passagem" || 
         inclusion.status === "fechamento" || 
         inclusion.status === "aprovacao" || 
         inclusion.status === "aprovado");
      
      if (!needsTicketMatch) return false;
      
      // Apply simple filters (event, function, collaborator, and search ID)
      if (filters.eventId !== "all" && inclusion.eventId !== filters.eventId) return false;
      if (filters.functionId !== "all" && inclusion.functionId !== filters.functionId) return false;
      if (filters.collaboratorId !== "all" && inclusion.collaboratorId !== filters.collaboratorId) return false;
      if (filters.searchId && !(
        (inclusion.inclusionNumber && inclusion.inclusionNumber.toString().includes(filters.searchId)) ||
        inclusion.id.toLowerCase().includes(filters.searchId.toLowerCase())
      )) return false;
      
      return true;
    }
  ) || [];

  // Apply ticket status filter directly to individual inclusions
  const filteredTicketInclusions = useMemo(() => {
    return ticketInclusions.filter(inclusion => {
      if (filters.ticketStatus !== "all") {
        const hasTicket = getTicket(inclusion.id);
        if (filters.ticketStatus === "pending" && hasTicket) return false;
        if (filters.ticketStatus === "processed" && !hasTicket) return false;
      }
      return true;
    });
  }, [ticketInclusions, filters.ticketStatus, tickets]);

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
      { field: 'departureAirport', label: 'Aeroporto Origem' },
      { field: 'destinationAirport', label: 'Aeroporto Destino' },
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
            actualDepartureTime: quickData.actualDepartureTime || null,
            actualReturnDate: quickData.actualReturnDate,
            actualReturnTime: quickData.actualReturnTime || null,
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
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Total de passagens</div>
                <div className="text-2xl font-bold text-primary">{ticketInclusions.length}</div>
                <div className="text-sm text-green-600">
                  {ticketInclusions.filter(inc => getTicket(inc.id)).length} compradas
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Mostrando: {filteredTicketInclusions.length}
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
                    Preencha os dados comuns e selecione as passagens na tabela para aplicar
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
                        !ticketData["quick"] || 
                        Object.keys(ticketData["quick"]).length === 0 ||
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
                >
                  <option value="all">Todos</option>
                  <option value="pending">Pendentes</option>
                  <option value="processed">Compradas</option>
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
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Evento / Função
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Colaborador
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Destino
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Data Ida
                    </th>
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
                          {!ticket ? (
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
                        <td className="px-4 py-4 whitespace-nowrap cursor-pointer" onClick={() => handleViewTicketDetails(inclusion)}>
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-mono text-foreground">
                              <span>#{inclusion.inclusionNumber || 'N/A'}</span>
                            </div>
                            <Eye 
                              className="w-4 h-4 text-blue-600 hover:text-blue-800 cursor-pointer transition-colors" 
                              />
                          </div>
                        </td>
                        <td className="px-4 py-4 cursor-pointer" onClick={() => handleViewTicketDetails(inclusion)}>
                          <div className="text-sm font-medium text-foreground">
                            {getEventName(inclusion.eventId)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {getFunctionName(inclusion.functionId)}
                          </div>
                        </td>
                        <td className="px-4 py-4 cursor-pointer" onClick={() => handleViewTicketDetails(inclusion)}>
                          <div className="text-sm font-medium text-foreground">
                            {getCollaboratorName(inclusion.collaboratorId || undefined)}
                          </div>
                        </td>
                        <td className="px-4 py-4 cursor-pointer" onClick={() => handleViewTicketDetails(inclusion)}>
                          <div className="text-sm font-medium text-blue-700 dark:text-blue-300">
                            {getEventLocation(inclusion.eventId)}
                          </div>
                        </td>
                        <td className="px-4 py-4 cursor-pointer" onClick={() => handleViewTicketDetails(inclusion)}>
                          {(() => {
                            const departureDate = inclusion.flightDepartureDate || inclusion.scheduleStartDate;
                            const isUrgent = isDateUrgent(departureDate);
                            return (
                              <div className={`text-sm font-medium ${isUrgent ? 'text-red-600 bg-red-50 px-2 py-1 rounded' : 'text-foreground'}`}>
                                {formatDate(departureDate)}
                                {isUrgent && <div className="text-xs">URGENTE!</div>}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-4 cursor-pointer" onClick={() => handleViewTicketDetails(inclusion)}>
                          <div className="text-sm font-medium text-foreground">
                            {inclusion.flightReturnDate ? formatDate(inclusion.flightReturnDate) : formatDate(inclusion.scheduleEndDate)}
                          </div>
                        </td>
                        <td className="px-4 py-4 cursor-pointer" onClick={() => handleViewTicketDetails(inclusion)}>
                          <div className="text-xs text-blue-700 dark:text-blue-300">
                            <div className="mb-1">
                              <span className="font-medium">Ida:</span> {inclusion.flightDepartureDate ? formatDate(inclusion.flightDepartureDate) : "N/A"}
                              {inclusion.flightDepartureSuggestedTime && <div className="text-xs text-gray-600">às {inclusion.flightDepartureSuggestedTime}</div>}
                            </div>
                            <div>
                              <span className="font-medium">Volta:</span> {inclusion.flightReturnDate ? formatDate(inclusion.flightReturnDate) : "N/A"}
                              {inclusion.flightReturnSuggestedTime && <div className="text-xs text-gray-600">às {inclusion.flightReturnSuggestedTime}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 cursor-pointer" onClick={() => handleViewTicketDetails(inclusion)}>
                          {ticket ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Comprada
                            </span>
                          ) : (
                            <StatusBadge status={inclusion.status} />
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

        {/* Modal de Detalhes da Passagem */}
        <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            {selectedInclusion && (
              <div>
                <DialogHeader>
                  <DialogTitle>
                    Detalhes da Passagem - {getEventName(selectedInclusion.eventId)}
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-6 mt-6">
                  {/* Informações Básicas */}
                  <div className="bg-muted p-4 rounded-lg">
                    <h3 className="font-medium mb-3">Informações Gerais</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground">Colaborador</Label>
                        <p className="font-medium">{getCollaboratorName(selectedInclusion.collaboratorId)}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Função</Label>
                        <p className="font-medium">{getFunctionName(selectedInclusion.functionId)}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Sugestão de Ida</Label>
                        <p className="font-medium text-blue-700 dark:text-blue-300">
                          {selectedInclusion.flightDepartureDate ? formatDate(selectedInclusion.flightDepartureDate) : "Não definido"}
                          {selectedInclusion.flightDepartureSuggestedTime && ` às ${selectedInclusion.flightDepartureSuggestedTime}`}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Sugestão de Volta</Label>
                        <p className="font-medium text-blue-700 dark:text-blue-300">
                          {selectedInclusion.flightReturnDate ? formatDate(selectedInclusion.flightReturnDate) : "Não definido"}
                          {selectedInclusion.flightReturnSuggestedTime && ` às ${selectedInclusion.flightReturnSuggestedTime}`}
                        </p>
                      </div>
                    </div>
                  </div>

                  {(() => {
                    const ticket = getTicket(selectedInclusion.id);
                    const data = ticketData[selectedInclusion.id] || {};
                    
                    return ticket ? (
                      /* Passagem já processada */
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                        <div>
                          <Label className="text-xs text-muted-foreground">Valor da Passagem</Label>
                          <p className="font-medium">{formatCurrency((ticket.value || 0) / 100)}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Data da Compra</Label>
                          <p className="font-medium">{ticket.purchaseDate ? formatDate(ticket.purchaseDate) : "-"}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Aeroporto Origem</Label>
                          <p className="font-medium">{ticket.departureAirport || "-"}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Aeroporto Destino</Label>
                          <p className="font-medium">{ticket.destinationAirport || "-"}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Ida</Label>
                          <p className="font-medium">
                            {ticket.actualDepartureDate ? formatDate(ticket.actualDepartureDate) : "-"} 
                            {ticket.actualDepartureTime && ` às ${ticket.actualDepartureTime}`}
                          </p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Volta</Label>
                          <p className="font-medium">
                            {ticket.actualReturnDate ? formatDate(ticket.actualReturnDate) : "-"} 
                            {ticket.actualReturnTime && ` às ${ticket.actualReturnTime}`}
                          </p>
                        </div>
                        {ticket.purchaseOrderNumber && (
                          <div>
                            <Label className="text-xs text-muted-foreground">Ordem de Compra</Label>
                            <p className="font-medium">{ticket.purchaseOrderNumber}</p>
                          </div>
                        )}
                        {ticket.cardLastFourDigits && (
                          <div>
                            <Label className="text-xs text-muted-foreground">Últimos 4 Dígitos do Cartão</Label>
                            <p className="font-medium font-mono">****{ticket.cardLastFourDigits}</p>
                          </div>
                        )}
                        {ticket.attachmentIds && ticket.attachmentIds.length > 0 && (
                          <div className="md:col-span-2 lg:col-span-3">
                            <Label className="text-xs text-muted-foreground">IDs dos Anexos</Label>
                            <div className="space-y-2 mt-1">
                              {ticket.attachmentIds.map((attachmentId, index) => (
                                <div key={attachmentId} className="font-mono text-sm bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded text-green-700 dark:text-green-300 flex items-center justify-between">
                                  <span>ID: {attachmentId}</span>
                                  <span className="text-xs opacity-70">Anexo {index + 1}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="md:col-span-2 lg:col-span-3">
                          <span className="text-sm text-green-600 font-medium flex items-center">
                            <FileText className="w-4 h-4 mr-1" />
                            Passagem registrada com sucesso
                          </span>
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


                        {/* Formulário de Compra */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor={`value-${selectedInclusion.id}`} className="text-sm font-medium">
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
                            />
                          </div>
                          <div>
                            <Label htmlFor={`departureAirport-${selectedInclusion.id}`} className="text-sm font-medium">
                              Aeroporto Origem *
                            </Label>
                            <Input
                              id={`departureAirport-${selectedInclusion.id}`}
                              placeholder="Ex: GRU"
                              value={data.departureAirport || ""}
                              onChange={(e) => handleTicketDataChange(selectedInclusion.id, "departureAirport", e.target.value)}
                            />
                          </div>
                          <div>
                            <Label htmlFor={`destinationAirport-${selectedInclusion.id}`} className="text-sm font-medium">
                              Aeroporto Destino *
                            </Label>
                            <Input
                              id={`destinationAirport-${selectedInclusion.id}`}
                              placeholder="Ex: RJ"
                              value={data.destinationAirport || ""}
                              onChange={(e) => handleTicketDataChange(selectedInclusion.id, "destinationAirport", e.target.value)}
                            />
                          </div>
                          <div>
                            <Label htmlFor={`purchaseOrderNumber-${selectedInclusion.id}`} className="text-sm font-medium">
                              Ordem de Compra *
                            </Label>
                            <Input
                              id={`purchaseOrderNumber-${selectedInclusion.id}`}
                              placeholder="Número da OC"
                              value={data.purchaseOrderNumber || ""}
                              onChange={(e) => handleTicketDataChange(selectedInclusion.id, "purchaseOrderNumber", e.target.value)}
                            />
                          </div>
                          <div>
                            <Label htmlFor={`cardLastFourDigits-${selectedInclusion.id}`} className="text-sm font-medium">
                              Últimos 4 Dígitos do Cartão
                            </Label>
                            <Input
                              id={`cardLastFourDigits-${selectedInclusion.id}`}
                              placeholder="1234"
                              maxLength={4}
                              value={data.cardLastFourDigits || ""}
                              onChange={(e) => handleTicketDataChange(selectedInclusion.id, "cardLastFourDigits", e.target.value.replace(/\D/g, '').slice(0, 4))}
                              className="mt-1"
                              data-testid={`input-card-digits-${selectedInclusion.id}`}
                            />
                          </div>
                        </div>

                        {/* Campo de Anexos */}
                        <div className="mt-4">
                          <AttachmentUpload
                            attachmentIds={data.attachmentIds || []}
                            onAttachmentsChange={(attachmentIds) => 
                              handleTicketDataChange(selectedInclusion.id, "attachmentIds", attachmentIds)
                            }
                            disabled={createTicketMutation.isPending}
                          />
                        </div>

                        {/* Botões */}
                        <div className="flex gap-3 justify-end pt-4 border-t">
                          <Button variant="outline" onClick={() => setShowModal(false)}>
                            Cancelar
                          </Button>
                          <Button
                            onClick={async () => {
                              // Validar campos obrigatórios
                              if (!data.value || !data.departureAirport || !data.destinationAirport || !data.purchaseOrderNumber) {
                                toast({
                                  title: "Erro",
                                  description: "Preencha todos os campos obrigatórios",
                                  variant: "destructive",
                                });
                                return;
                              }

                              try {
                                await createTicketMutation.mutateAsync({
                                  teamInclusionId: selectedInclusion.id,
                                  value: Math.round(parseFloat(data.value) * 100),
                                  purchaseDate: data.purchaseDate || new Date().toISOString().split('T')[0],
                                  actualDepartureDate: data.actualDepartureDate || null,
                                  actualDepartureTime: data.actualDepartureTime || null,
                                  actualReturnDate: data.actualReturnDate || null,
                                  actualReturnTime: data.actualReturnTime || null,
                                  departureAirport: data.departureAirport,
                                  destinationAirport: data.destinationAirport,
                                  purchaseOrderNumber: data.purchaseOrderNumber,
                                  fileUrl: data.fileUrl || null,
                                  attachmentIds: data.attachmentIds && data.attachmentIds.length > 0 ? data.attachmentIds : null,
                                  cardLastFourDigits: data.cardLastFourDigits || null
                                });

                                // Atualizar team inclusion para fechamento
                                await updateTeamInclusionMutation.mutateAsync({
                                  id: selectedInclusion.id,
                                  data: {
                                    status: "fechamento",
                                    phase: "fechamento"
                                  }
                                });

                                setShowModal(false);
                              } catch (error) {
                                // Error is already handled by the mutation
                              }
                            }}
                            disabled={createTicketMutation.isPending}
                          >
                            {createTicketMutation.isPending ? "Registrando..." : "Registrar Passagem"}
                          </Button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}