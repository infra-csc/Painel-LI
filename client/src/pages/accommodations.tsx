import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Hotel, Save, Eye, ChevronDown, ChevronRight, MessageCircle, Edit } from "lucide-react";
import Header from "@/components/layout/header";
import NavigationTabs from "@/components/layout/navigation-tabs";
import SimpleFilters from "@/components/common/simple-filters";
import StatusBadge from "@/components/common/status-badge";
import SortableHeader, { type SortConfig, type SortField } from "@/components/common/sortable-header";
import CommentsModal from "@/components/modals/comments-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { isReadOnly, canEdit, canPerformActions } from "@/lib/interactions";
import { canView, canEdit as canEditScreen } from "@/lib/permissions";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import type { TeamInclusion, Event, Function, Collaborator, Accommodation, Comment } from "@shared/schema";

export default function Accommodations() {
  const { user } = useAuth();
  const [filters, setFilters] = useState({
    eventId: "all",
    functionId: "all", 
    collaboratorId: "all",
    searchId: "",
    accommodationStatus: "all", // all, pending, processed
    inclusionStatus: "active", // all, active (excludes cancelado)
  });
  
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [selectedInclusion, setSelectedInclusion] = useState<TeamInclusion | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedAccommodations, setSelectedAccommodations] = useState<string[]>([]); // IDs dos accommodations selecionados
  const [editingAccommodationId, setEditingAccommodationId] = useState<string | null>(null); // ID da accommodation sendo editado
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

  const { data: accommodations } = useQuery<Accommodation[]>({
    queryKey: ["/api/accommodations"],
  });

  const { data: users } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  // Filtrar team inclusions que precisam de hospedagem
  const teamInclusionsWithAccommodation = useMemo(() => {
    if (!teamInclusions) return [];
    return teamInclusions.filter(inclusion => inclusion.needsAccommodation === true);
  }, [teamInclusions]);

  // Criar map de accommodations por teamInclusionId
  const accommodationMap = useMemo(() => {
    if (!accommodations) return new Map();
    return new Map(accommodations.map(acc => [acc.teamInclusionId, acc]));
  }, [accommodations]);

  // Filtrar e ordenar dados
  const filteredData = useMemo(() => {
    let data = teamInclusionsWithAccommodation.filter(inclusion => {
      const matchesEvent = filters.eventId === "all" || inclusion.eventId === filters.eventId;
      const matchesFunction = filters.functionId === "all" || inclusion.functionId === filters.functionId;
      const matchesCollaborator = filters.collaboratorId === "all" || inclusion.collaboratorId === filters.collaboratorId;
      
      const matchesSearchId = filters.searchId === "" || 
        inclusion.inclusionNumber?.toString().toLowerCase().includes(filters.searchId.toLowerCase());

      const accommodation = accommodationMap.get(inclusion.id);
      const accommodationStatus = accommodation ? "processed" : "pending";
      const matchesAccommodationStatus = filters.accommodationStatus === "all" || 
        filters.accommodationStatus === accommodationStatus;

      const matchesInclusionStatus = filters.inclusionStatus === "all" || 
        (filters.inclusionStatus === "active" && inclusion.status !== "cancelado");

      return matchesEvent && matchesFunction && matchesCollaborator && matchesSearchId && 
             matchesAccommodationStatus && matchesInclusionStatus;
    });

    // Aplicar ordenação
    if (sortConfig) {
      data = data.sort((a, b) => {
        const aValue = getFieldValue(a, sortConfig.field);
        const bValue = getFieldValue(b, sortConfig.field);
        
        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;
        
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return data;
  }, [teamInclusionsWithAccommodation, accommodationMap, filters, sortConfig]);

  // Função auxiliar para obter valor de campo para ordenação
  const getFieldValue = (inclusion: TeamInclusion, field: string) => {
    const event = events?.find(e => e.id === inclusion.eventId);
    const func = functions?.find(f => f.id === inclusion.functionId);
    const collaborator = collaborators?.find(c => c.id === inclusion.collaboratorId);
    const accommodation = accommodationMap.get(inclusion.id);

    switch (field) {
      case 'eventName': return event?.name || '';
      case 'functionName': return func?.name || '';
      case 'collaboratorName': return collaborator?.fullName || '';
      case 'inclusionNumber': return inclusion.inclusionNumber || '';
      case 'checkInDate': return accommodation?.checkInDate || null;
      case 'checkOutDate': return accommodation?.checkOutDate || null;
      case 'hotelName': return accommodation?.hotelName || '';
      case 'hotelLocation': return accommodation?.hotelLocation || '';
      default: return '';
    }
  };

  // Mutations
  const createAccommodationMutation = useMutation({
    mutationFn: (accommodationData: any) => apiRequest("POST", "/api/accommodations", accommodationData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accommodations"] });
      toast({
        title: "✅ Sucesso",
        description: "Hospedagem criada com sucesso!",
      });
    },
    onError: (error: any) => {
      console.error("Erro ao criar hospedagem:", error);
      toast({
        variant: "destructive",
        title: "❌ Erro",
        description: error?.message || "Erro ao criar hospedagem",
      });
    },
  });

  const updateAccommodationMutation = useMutation({
    mutationFn: ({ id, data }: { id: string, data: any }) => apiRequest("PATCH", `/api/accommodations/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accommodations"] });
      setEditingAccommodationId(null);
      toast({
        title: "✅ Sucesso",
        description: "Hospedagem atualizada com sucesso!",
      });
    },
    onError: (error: any) => {
      console.error("Erro ao atualizar hospedagem:", error);
      toast({
        variant: "destructive",
        title: "❌ Erro",
        description: error?.message || "Erro ao atualizar hospedagem",
      });
    },
  });

  // Funções auxiliares
  const handleCreateAccommodation = (inclusion: TeamInclusion) => {
    if (!canPerformActions(inclusion)) {
      toast({
        variant: "destructive",
        title: "❌ Acesso Negado",
        description: "Você não tem permissão para criar hospedagem.",
      });
      return;
    }

    const accommodationData = {
      teamInclusionId: inclusion.id,
      updatedBy: user?.id,
    };

    createAccommodationMutation.mutate(accommodationData);
  };

  const handleUpdateAccommodation = (accommodationId: string, formData: FormData) => {
    const accommodation = accommodations?.find(acc => acc.id === accommodationId);
    const inclusion = accommodation ? teamInclusions?.find(inc => inc.id === accommodation.teamInclusionId) : null;
    
    if (!inclusion || !canPerformActions(inclusion)) {
      toast({
        variant: "destructive",
        title: "❌ Acesso Negado",  
        description: "Você não tem permissão para atualizar hospedagem.",
      });
      return;
    }

    const data = Object.fromEntries(formData.entries());
    
    // Converter campos de data vazios para null
    const cleanedData = {
      ...data,
      checkInDate: data.checkInDate || null,
      checkInTime: data.checkInTime || null,
      checkOutDate: data.checkOutDate || null,
      checkOutTime: data.checkOutTime || null,
      hotelLocation: data.hotelLocation || null,
      hotelName: data.hotelName || null,
      accommodationObservations: data.accommodationObservations || null,
      updatedBy: user?.id,
    };

    updateAccommodationMutation.mutate({
      id: accommodationId,
      data: cleanedData
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <Header />
        <NavigationTabs activeTab="accommodations" />
        <div className="flex items-center justify-center h-32">
          <div className="text-gray-500">Carregando hospedagem...</div>
        </div>
      </div>
    );
  }

  if (!canView(user, "tickets")) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <Header />
        <NavigationTabs activeTab="accommodations" />
        <div className="flex items-center justify-center h-32">
          <div className="text-red-500">Acesso não autorizado a esta funcionalidade.</div>
        </div>
      </div>
    );
  }

  const canEditField = canEditScreen(user, "tickets");

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Header />
      <NavigationTabs activeTab="accommodations" />
      
      <div className="container mx-auto px-4 py-6">
        <div className="bg-card rounded-lg shadow-sm border border-border mb-6">
          <div className="px-6 py-4 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-foreground mb-2">🏨 Hospedagem</h2>
                <p className="text-muted-foreground">Gerencie as reservas de hospedagem para os colaboradores escalados.</p>
              </div>
              <div className="flex gap-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">{filteredData.length}</div>
                  <div className="text-xs text-muted-foreground">hospedagens</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">{filteredData.filter(inc => accommodationMap.get(inc.id)).length}</div>
                  <div className="text-xs text-muted-foreground">processadas</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-600">{filteredData.filter(inc => !accommodationMap.get(inc.id)).length}</div>
                  <div className="text-xs text-muted-foreground">pendentes</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <SimpleFilters filters={filters} onFiltersChange={setFilters} />

        <div className="bg-card rounded-lg shadow-sm border border-border p-4 mb-6 flex gap-4 items-end">
          <div className="flex-1">
            <Label className="text-sm font-medium text-foreground">Status da Hospedagem:</Label>
            <Select
              value={filters.accommodationStatus}
              onValueChange={(value) => setFilters({ ...filters, accommodationStatus: value })}
            >
              <SelectTrigger className="mt-1" data-testid="select-accommodation-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="processed">Processado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <Label className="text-sm font-medium text-foreground">Status da Inclusão:</Label>
            <Select
              value={filters.inclusionStatus}
              onValueChange={(value) => setFilters({ ...filters, inclusionStatus: value })}
            >
              <SelectTrigger className="mt-1" data-testid="select-inclusion-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativas</SelectItem>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="cancelado">Canceladas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            onClick={() => setFilters({
              eventId: "all",
              functionId: "all", 
              collaboratorId: "all",
              searchId: "",
              accommodationStatus: "all",
              inclusionStatus: "active",
            })}
            data-testid="clear-filters"
          >
            Limpar Filtros
          </Button>
        </div>

        <div className="bg-card rounded-lg shadow-sm border border-border">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <Checkbox 
                      data-testid="select-all-accommodations"
                      checked={selectedAccommodations.length === filteredData.length && filteredData.length > 0}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedAccommodations(filteredData.map(item => accommodationMap.get(item.id)?.id).filter(Boolean));
                        } else {
                          setSelectedAccommodations([]);
                        }
                      }}
                    />
                  </th>
                  <SortableHeader 
                    field="id" 
                    sortConfig={sortConfig} 
                    onSort={handleSort}
                  >
                    ID
                  </SortableHeader>
                  <SortableHeader 
                    field="event" 
                    sortConfig={sortConfig} 
                    onSort={handleSort}
                  >
                    Evento
                  </SortableHeader>
                  <SortableHeader 
                    field="function" 
                    sortConfig={sortConfig} 
                    onSort={handleSort}
                  >
                    Função
                  </SortableHeader>
                  <SortableHeader 
                    field="collaborator" 
                    sortConfig={sortConfig} 
                    onSort={handleSort}
                  >
                    Colaborador
                  </SortableHeader>
                  <SortableHeader 
                    field="date" 
                    sortConfig={sortConfig} 
                    onSort={handleSort}
                  >
                    Check-in
                  </SortableHeader>
                  <SortableHeader 
                    field="status" 
                    sortConfig={sortConfig} 
                    onSort={handleSort}
                  >
                    Check-out
                  </SortableHeader>
                  <SortableHeader 
                    field="status" 
                    sortConfig={sortConfig} 
                    onSort={handleSort}
                  >
                    Hotel
                  </SortableHeader>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredData.map((inclusion) => {
                  const event = events?.find(e => e.id === inclusion.eventId);
                  const func = functions?.find(f => f.id === inclusion.functionId);
                  const collaborator = collaborators?.find(c => c.id === inclusion.collaboratorId);
                  const accommodation = accommodationMap.get(inclusion.id);
                  const hasAccommodation = !!accommodation;

                  return (
                    <tr 
                      key={inclusion.id} 
                      className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      data-testid={`accommodation-row-${inclusion.inclusionNumber}`}
                    >
                      <td className="px-4 py-3">
                        <Checkbox 
                          data-testid={`select-accommodation-${inclusion.inclusionNumber}`}
                          checked={accommodation ? selectedAccommodations.includes(accommodation.id) : false}
                          onCheckedChange={(checked) => {
                            if (!accommodation) return;
                            if (checked) {
                              setSelectedAccommodations([...selectedAccommodations, accommodation.id]);
                            } else {
                              setSelectedAccommodations(selectedAccommodations.filter(id => id !== accommodation.id));
                            }
                          }}
                          disabled={!accommodation}
                        />
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white" data-testid={`accommodation-id-${inclusion.inclusionNumber}`}>
                        {inclusion.inclusionNumber}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300" data-testid={`accommodation-event-${inclusion.inclusionNumber}`}>
                        {event?.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300" data-testid={`accommodation-function-${inclusion.inclusionNumber}`}>
                        {func?.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300" data-testid={`accommodation-collaborator-${inclusion.inclusionNumber}`}>
                        {collaborator?.fullName}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300" data-testid={`accommodation-checkin-${inclusion.inclusionNumber}`}>
                        {accommodation?.checkInDate && (
                          <div>
                            <div>{new Date(accommodation.checkInDate).toLocaleDateString('pt-BR')}</div>
                            {accommodation.checkInTime && (
                              <div className="text-xs text-gray-500">{accommodation.checkInTime}</div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300" data-testid={`accommodation-checkout-${inclusion.inclusionNumber}`}>
                        {accommodation?.checkOutDate && (
                          <div>
                            <div>{new Date(accommodation.checkOutDate).toLocaleDateString('pt-BR')}</div>
                            {accommodation.checkOutTime && (
                              <div className="text-xs text-gray-500">{accommodation.checkOutTime}</div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300" data-testid={`accommodation-hotel-${inclusion.inclusionNumber}`}>
                        {accommodation?.hotelName && (
                          <div>
                            <div>{accommodation.hotelName}</div>
                            {accommodation.hotelLocation && (
                              <div className="text-xs text-gray-500">{accommodation.hotelLocation}</div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3" data-testid={`accommodation-status-${inclusion.inclusionNumber}`}>
                        <StatusBadge 
                          status={hasAccommodation ? "processed" : "pending"} 
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {!hasAccommodation && canPerformActions(inclusion) && (
                            <Button
                              size="sm"
                              onClick={() => handleCreateAccommodation(inclusion)}
                              disabled={createAccommodationMutation.isPending}
                              data-testid={`create-accommodation-${inclusion.inclusionNumber}`}
                            >
                              <Hotel className="w-4 h-4 mr-1" />
                              Criar
                            </Button>
                          )}
                          
                          {hasAccommodation && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedInclusion(inclusion);
                                  setShowModal(true);
                                }}
                                data-testid={`view-accommodation-${inclusion.inclusionNumber}`}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedInclusion(inclusion);
                                  setShowCommentsModal(true);
                                }}
                                data-testid={`comments-accommodation-${inclusion.inclusionNumber}`}
                              >
                                <MessageCircle className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            
            {filteredData.length === 0 && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400" data-testid="no-accommodations">
                Nenhuma inclusão com hospedagem encontrada.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Detalhes da Hospedagem */}
      {showModal && selectedInclusion && (
        <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Hotel className="w-5 h-5" />
                Hospedagem - {selectedInclusion.inclusionNumber}
              </DialogTitle>
            </DialogHeader>
            
            <AccommodationDetailForm 
              inclusion={selectedInclusion}
              accommodation={accommodationMap.get(selectedInclusion.id)}
              events={events}
              functions={functions}
              collaborators={collaborators}
              users={users}
              canEditField={canEditField}
              editingAccommodationId={editingAccommodationId}
              setEditingAccommodationId={setEditingAccommodationId}
              onSubmit={handleUpdateAccommodation}
              expandedSections={expandedSections}
              setExpandedSections={setExpandedSections}
              isUpdating={updateAccommodationMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Modal de Comentários */}
      {showCommentsModal && selectedInclusion && (
        <CommentsModal
          open={showCommentsModal}
          onClose={() => setShowCommentsModal(false)}
          teamInclusionId={selectedInclusion.id}
        />
      )}
    </div>
  );
}

// Componente separado para o formulário de detalhes
function AccommodationDetailForm({
  inclusion,
  accommodation,
  events,
  functions,
  collaborators,
  users,
  canEditField,
  editingAccommodationId,
  setEditingAccommodationId,
  onSubmit,
  expandedSections,
  setExpandedSections,
  isUpdating
}: {
  inclusion: TeamInclusion;
  accommodation?: Accommodation;
  events?: Event[];
  functions?: Function[];
  collaborators?: Collaborator[];
  users?: any[];
  canEditField: boolean;
  editingAccommodationId: string | null;
  setEditingAccommodationId: (id: string | null) => void;
  onSubmit: (accommodationId: string, formData: FormData) => void;
  expandedSections: Record<string, boolean>;
  setExpandedSections: (sections: Record<string, boolean>) => void;
  isUpdating: boolean;
}) {
  const event = events?.find(e => e.id === inclusion.eventId);
  const func = functions?.find(f => f.id === inclusion.functionId);
  const collaborator = collaborators?.find(c => c.id === inclusion.collaboratorId);
  const isEditing = accommodation && editingAccommodationId === accommodation.id;
  const isReadOnlyMode = isReadOnly(inclusion);

  const toggleSection = (section: string) => {
    setExpandedSections({
      ...expandedSections,
      [section]: !expandedSections[section]
    });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!accommodation) return;
    
    const formData = new FormData(e.currentTarget);
    onSubmit(accommodation.id, formData);
  };

  if (!accommodation) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Nenhuma hospedagem encontrada para esta inclusão.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Informações da Inclusão */}
      <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
        <h3 className="font-semibold mb-2">Informações da Inclusão</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><strong>ID:</strong> {inclusion.inclusionNumber}</div>
          <div><strong>Evento:</strong> {event?.name}</div>
          <div><strong>Função:</strong> {func?.name}</div>
          <div><strong>Colaborador:</strong> {collaborator?.fullName}</div>
        </div>
      </div>

      {/* Formulário de Hospedagem */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Seção Básica */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
          <button
            type="button"
            onClick={() => toggleSection('basic')}
            className="flex items-center justify-between w-full p-3 text-left bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors rounded-t-lg"
          >
            <span className="font-medium">Informações Básicas</span>
            {expandedSections.basic ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          
          {expandedSections.basic && (
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="hotelName">Nome do Hotel</Label>
                  <Input
                    id="hotelName"
                    name="hotelName"
                    defaultValue={accommodation.hotelName || ""}
                    disabled={!canEditField || (!isEditing && !isReadOnlyMode)}
                    data-testid="input-hotel-name"
                  />
                </div>
                <div>
                  <Label htmlFor="hotelLocation">Localização do Hotel</Label>
                  <Input
                    id="hotelLocation"
                    name="hotelLocation"
                    defaultValue={accommodation.hotelLocation || ""}
                    disabled={!canEditField || (!isEditing && !isReadOnlyMode)}
                    data-testid="input-hotel-location"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Seção Datas */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
          <button
            type="button"
            onClick={() => toggleSection('dates')}
            className="flex items-center justify-between w-full p-3 text-left bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors rounded-t-lg"
          >
            <span className="font-medium">Datas e Horários</span>
            {expandedSections.dates ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          
          {expandedSections.dates && (
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="checkInDate">Data Check-in</Label>
                  <Input
                    id="checkInDate"
                    name="checkInDate"
                    type="date"
                    defaultValue={accommodation.checkInDate || ""}
                    disabled={!canEditField || (!isEditing && !isReadOnlyMode)}
                    data-testid="input-checkin-date"
                  />
                </div>
                <div>
                  <Label htmlFor="checkInTime">Hora Check-in</Label>
                  <Input
                    id="checkInTime"
                    name="checkInTime"
                    type="time"
                    defaultValue={accommodation.checkInTime || ""}
                    disabled={!canEditField || (!isEditing && !isReadOnlyMode)}
                    data-testid="input-checkin-time"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="checkOutDate">Data Check-out</Label>
                  <Input
                    id="checkOutDate"
                    name="checkOutDate"
                    type="date"
                    defaultValue={accommodation.checkOutDate || ""}
                    disabled={!canEditField || (!isEditing && !isReadOnlyMode)}
                    data-testid="input-checkout-date"
                  />
                </div>
                <div>
                  <Label htmlFor="checkOutTime">Hora Check-out</Label>
                  <Input
                    id="checkOutTime"
                    name="checkOutTime"
                    type="time"
                    defaultValue={accommodation.checkOutTime || ""}
                    disabled={!canEditField || (!isEditing && !isReadOnlyMode)}
                    data-testid="input-checkout-time"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Seção Adicional */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
          <button
            type="button"
            onClick={() => toggleSection('additional')}
            className="flex items-center justify-between w-full p-3 text-left bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors rounded-t-lg"
          >
            <span className="font-medium">Informações Adicionais</span>
            {expandedSections.additional ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          
          {expandedSections.additional && (
            <div className="p-4 space-y-4">
              <div>
                <Label htmlFor="accommodationObservations">Observações</Label>
                <Textarea
                  id="accommodationObservations"
                  name="accommodationObservations"
                  rows={3}
                  defaultValue={accommodation.accommodationObservations || ""}
                  disabled={!canEdit || (!isEditing && !isReadOnlyMode)}
                  data-testid="textarea-observations"
                />
              </div>
            </div>
          )}
        </div>

        {/* Botões de Ação */}
        <div className="flex justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
          {canEditField && !isReadOnlyMode && (
            <>
              {!isEditing ? (
                <Button
                  type="button"
                  onClick={() => setEditingAccommodationId(accommodation.id)}
                  data-testid="button-edit-accommodation"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Editar
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditingAccommodationId(null)}
                    disabled={isUpdating}
                    data-testid="button-cancel-edit"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={isUpdating}
                    data-testid="button-save-accommodation"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {isUpdating ? "Salvando..." : "Salvar"}
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </form>
    </div>
  );
}