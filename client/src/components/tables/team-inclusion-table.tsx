import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit, MessageCircle, History, Check, X, Trash2, Copy, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import StatusBadge from "@/components/common/status-badge";
import CommentsModal from "@/components/modals/comments-modal";
import UniversalFilters from "@/components/common/universal-filters";
import SortableHeader, { type SortConfig, type SortField } from "@/components/common/sortable-header";
import type { TeamInclusion, Event, Function, Collaborator } from "@shared/schema";
import { isReadOnly } from "@/lib/interactions";

export default function TeamInclusionTable() {
  const [selectedInclusion, setSelectedInclusion] = useState<string | null>(null);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingInclusion, setEditingInclusion] = useState<TeamInclusion | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState({
    eventId: "all",
    functionId: "all",
    collaboratorId: "all",
    status: "all",
    escalationStatus: "all",
    searchId: "",
  });
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

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

  const getEventName = (eventId: string) => {
    return events?.find(e => e.id === eventId)?.name || "Evento não encontrado";
  };

  const getEventLocation = (eventId: string) => {
    return events?.find(e => e.id === eventId)?.location || "";
  };

  const getFunctionName = (functionId: string) => {
    return functions?.find(f => f.id === functionId)?.name || "Função não encontrada";
  };

  const getFunctionArea = (functionId: string) => {
    return "Área definida no cadastro"; // Simplified since responsibleArea was removed
  };

  const getCollaboratorName = (collaboratorId?: string) => {
    if (!collaboratorId) return "Não escalado";
    return collaborators?.find(c => c.id === collaboratorId)?.fullName || "Colaborador não encontrado";
  };

  const formatDate = (dateStr: string) => {
    // Parse manual para evitar problemas de timezone
    const [year, month, day] = dateStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  };

  const handleViewComments = (inclusionId: string) => {
    setSelectedInclusion(inclusionId);
    setShowCommentsModal(true);
  };

  const handleEdit = (inclusionId: string) => {
    const inclusion = teamInclusions?.find(i => i.id === inclusionId);
    if (inclusion) {
      setEditingInclusion(inclusion);
      setShowEditModal(true);
    }
  };

  const updateTeamInclusionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PATCH", `/api/team-inclusions/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Inclusão atualizada com sucesso",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
      setShowEditModal(false);
      setEditingInclusion(null);
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao atualizar inclusão",
        variant: "destructive",
      });
    },
  });


  const canCancelEscalation = (inclusion: TeamInclusion) => {
    // Pode cancelar em qualquer status, exceto quando já está cancelado
    return inclusion.status !== 'cancelado';
  };

  const canDeleteInclusion = (inclusion: TeamInclusion) => {
    // Só pode excluir antes da escalação (não pode ter comprado nada)
    const blockedStatuses = ['escalado', 'passagem_comprada', 'hospedagem_comprada', 'hospedagem_passagem_comprada'];
    return !blockedStatuses.includes(inclusion.status);
  };

  const deleteTeamInclusionMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/team-inclusions/${id}`);
      if (response.ok) {
        return { success: true };
      }
      throw new Error("Erro ao remover inclusão");
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Inclusão removida com sucesso",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao remover inclusão",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (inclusionId: string) => {
    if (window.confirm('Tem certeza que deseja remover esta inclusão?')) {
      deleteTeamInclusionMutation.mutate(inclusionId);
    }
  };

  const cancelEscalationMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("PATCH", `/api/team-inclusions/${id}`, {
        status: "cancelado",
        phase: "cancelado"
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Escalação cancelada com sucesso",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao cancelar escalação",
        variant: "destructive",
      });
    },
  });

  const handleCancelEscalation = (inclusionId: string) => {
    if (window.confirm('Tem certeza que deseja cancelar a escalação? Esta ação não pode ser desfeita.')) {
      cancelEscalationMutation.mutate(inclusionId);
    }
  };


  // Ações em lote
  const toggleRowSelection = (inclusionId: string) => {
    setSelectedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(inclusionId)) {
        newSet.delete(inclusionId);
      } else {
        newSet.add(inclusionId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedRows.size === filteredAndSortedInclusions.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filteredAndSortedInclusions.map(i => i.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedRows.size === 0) {
      toast({
        title: "Nenhuma seleção",
        description: "Selecione pelo menos uma inclusão para excluir.",
        variant: "destructive",
      });
      return;
    }

    // Filtrar apenas as inclusões que podem ser excluídas
    const deletableIds = Array.from(selectedRows).filter(id => {
      const inclusion = teamInclusions?.find(i => i.id === id);
      return inclusion && canDeleteInclusion(inclusion);
    });

    if (deletableIds.length === 0) {
      toast({
        title: "Não é possível excluir",
        description: "Nenhuma das inclusões selecionadas pode ser excluída (já foram confirmadas ou compradas).",
        variant: "destructive",
      });
      return;
    }

    const blockedCount = selectedRows.size - deletableIds.length;
    const confirmMessage = blockedCount > 0
      ? `${deletableIds.length} de ${selectedRows.size} inclusões podem ser excluídas. ${blockedCount} não podem ser excluídas (confirmadas/compradas). Deseja continuar?`
      : `Tem certeza que deseja excluir ${deletableIds.length} inclusão(ões) selecionada(s)?`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const id of deletableIds) {
      try {
        const response = await apiRequest("DELETE", `/api/team-inclusions/${id}`);
        if (response.ok) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        errorCount++;
      }
    }

    queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    setSelectedRows(new Set());

    toast({
      title: successCount > 0 ? "Sucesso" : "Erro",
      description: `${successCount} inclusão(ões) excluída(s). ${errorCount > 0 ? `${errorCount} erro(s).` : ''}`,
      variant: errorCount > 0 ? "destructive" : "default",
    });
  };

  const handleBulkCancel = async () => {
    if (selectedRows.size === 0) {
      toast({
        title: "Nenhuma seleção",
        description: "Selecione pelo menos uma inclusão para cancelar.",
        variant: "destructive",
      });
      return;
    }

    if (!window.confirm(`Tem certeza que deseja cancelar ${selectedRows.size} escalação(ões) selecionada(s)?`)) {
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const id of Array.from(selectedRows)) {
      try {
        const response = await apiRequest("PATCH", `/api/team-inclusions/${id}`, {
          status: "cancelado",
          phase: "cancelado"
        });
        if (response.ok) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        errorCount++;
      }
    }

    queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    setSelectedRows(new Set());

    toast({
      title: successCount > 0 ? "Sucesso" : "Erro",
      description: `${successCount} escalação(ões) cancelada(s). ${errorCount > 0 ? `${errorCount} erro(s).` : ''}`,
      variant: errorCount > 0 ? "destructive" : "default",
    });
  };

  // Filter and sort inclusions based on current filters
  const filteredAndSortedInclusions = useMemo(() => {
    const filtered = teamInclusions?.filter(inclusion => {
      if (filters.eventId !== "all" && inclusion.eventId !== filters.eventId) return false;
      if (filters.functionId !== "all" && inclusion.functionId !== filters.functionId) return false;
      if (filters.collaboratorId !== "all" && inclusion.collaboratorId !== filters.collaboratorId) return false;
      if (filters.status !== "all" && inclusion.status !== filters.status) return false;
      if (filters.escalationStatus === "pending" && inclusion.collaboratorId) return false;
      if (filters.escalationStatus === "escalated" && !inclusion.collaboratorId) return false;
      // Busca exata por ID (número de inclusão)
      if (filters.searchId && !(
        inclusion.inclusionNumber && inclusion.inclusionNumber.toString() === filters.searchId
      )) return false;
      return true;
    }) || [];

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
          case 'status':
            return a.status.localeCompare(b.status, 'pt-BR') * multiplier;
          case 'date':
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
  }, [teamInclusions, filters, sortConfig, events, functions, collaborators]);

  // Calculate real totals
  const totals = {
    incluidos: filteredAndSortedInclusions.length,
    pendentes: filteredAndSortedInclusions.filter(i => !i.collaboratorId && i.status !== 'cancelado').length,
    escalados: filteredAndSortedInclusions.filter(i => i.collaboratorId && i.status !== 'cancelado').length,
    aguardando_passagem: filteredAndSortedInclusions.filter(i => i.needsTicket && i.status === 'passagem').length,
    hospedagem: filteredAndSortedInclusions.filter(i => i.status === 'hospedagem').length,
    passagem_comprada: filteredAndSortedInclusions.filter(i => i.status === 'passagem_comprada').length,
    hospedagem_comprada: filteredAndSortedInclusions.filter(i => i.status === 'hospedagem_comprada').length,
    cancelados: filteredAndSortedInclusions.filter(i => i.status === 'cancelado').length,
  };

  if (isLoading) {
    return (
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-muted rounded w-1/3"></div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <UniversalFilters filters={filters} onFiltersChange={setFilters} />

      {/* Totals Summary */}
      <div className="bg-card rounded-lg shadow-sm border border-border p-6 mb-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Resumo dos Totais</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-primary" data-testid="total-incluidos">{totals.incluidos}</div>
            <div className="text-sm text-muted-foreground">Total</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-500" data-testid="total-pendentes">{totals.pendentes}</div>
            <div className="text-sm text-muted-foreground">Pendentes</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600" data-testid="total-escalados">{totals.escalados}</div>
            <div className="text-sm text-muted-foreground">Escalados</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600" data-testid="total-passagem">{totals.aguardando_passagem}</div>
            <div className="text-sm text-muted-foreground">Passagem</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600" data-testid="total-hospedagem">{totals.hospedagem}</div>
            <div className="text-sm text-muted-foreground">Hospedagem</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-emerald-600" data-testid="total-passagem-comprada">{totals.passagem_comprada}</div>
            <div className="text-sm text-muted-foreground">Passagem Comprada</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-emerald-600" data-testid="total-hospedagem-comprada">{totals.hospedagem_comprada}</div>
            <div className="text-sm text-muted-foreground">Hospedagem Comprada</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-500" data-testid="total-cancelados">{totals.cancelados}</div>
            <div className="text-sm text-muted-foreground">Cancelados</div>
          </div>
        </div>
      </div>

      {/* Barra de ações em lote */}
      {selectedRows.size > 0 && hasPermission(user, 'canEditScreen1') && (
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-blue-900 dark:text-blue-100">
              {selectedRows.size} inclusão(ões) selecionada(s)
            </div>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDelete}
                data-testid="button-bulk-delete"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Excluir Selecionadas
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkCancel}
                className="border-orange-500 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/20"
                data-testid="button-bulk-cancel"
              >
                <Ban className="w-4 h-4 mr-2" />
                Cancelar Selecionadas
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-card rounded-lg shadow-sm border border-border">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">Lista de Inclusões de Equipe</h3>
        </div>
        
        <div>
          <table className="w-full table-fixed">
            <thead className="bg-muted">
              <tr>
                <th className="w-12 px-3 py-3">
                  <Checkbox
                    checked={selectedRows.size === filteredAndSortedInclusions.length && filteredAndSortedInclusions.length > 0}
                    onCheckedChange={toggleSelectAll}
                    data-testid="checkbox-select-all"
                  />
                </th>
                <SortableHeader field="id" className="w-20" sortConfig={sortConfig} onSort={handleSort}>ID</SortableHeader>
                <SortableHeader field="event" className="w-36" sortConfig={sortConfig} onSort={handleSort}>Evento</SortableHeader>
                <SortableHeader field="function" className="w-32" sortConfig={sortConfig} onSort={handleSort}>Função</SortableHeader>
                <SortableHeader field="collaborator" className="w-32" sortConfig={sortConfig} onSort={handleSort}>Colaborador</SortableHeader>
                <SortableHeader field="date" className="w-32" sortConfig={sortConfig} onSort={handleSort}>Data/Diárias</SortableHeader>
                <SortableHeader field="status" className="w-24" sortConfig={sortConfig} onSort={handleSort}>Status</SortableHeader>
                <th className="w-16 px-3 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Pass.
                </th>
                <th className="w-40 px-3 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {filteredAndSortedInclusions?.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-muted-foreground">
                    Nenhuma inclusão de equipe encontrada
                  </td>
                </tr>
              ) : (
                filteredAndSortedInclusions?.map((inclusion) => {
                  const isCanceled = inclusion.status === 'cancelado';
                  return (
                  <tr key={inclusion.id} className={`transition-colors ${isCanceled ? 'opacity-60' : 'hover:bg-accent/50'}`} data-testid={`row-inclusion-${inclusion.id}`}>
                    <td className="px-3 py-4">
                      <Checkbox
                        checked={selectedRows.has(inclusion.id)}
                        onCheckedChange={() => toggleRowSelection(inclusion.id)}
                        data-testid={`checkbox-row-${inclusion.id}`}
                      />
                    </td>
                    <td className="px-3 py-4">
                      <div className="flex items-center gap-1 truncate">
                        <div className="text-sm font-mono text-foreground font-medium truncate">
                          #{inclusion.inclusionNumber || 'N/A'}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="p-1 h-5 w-5 flex-shrink-0"
                          onClick={() => {
                            const text = inclusion.inclusionNumber?.toString() || inclusion.id;
                            navigator.clipboard.writeText(text);
                            toast({
                              title: "Sucesso",
                              description: "ID copiado para a área de transferência",
                            });
                          }}
                          data-testid={`button-copy-id-${inclusion.id}`}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                    <td className="px-3 py-4">
                      <div className="truncate">
                        <div className="text-sm font-medium text-foreground truncate">
                          {getEventName(inclusion.eventId)}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {getEventLocation(inclusion.eventId)}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4">
                      <div className="text-sm text-foreground truncate">
                        {getFunctionName(inclusion.functionId)}
                      </div>
                    </td>
                    <td className="px-3 py-4">
                      <div className="text-sm text-foreground truncate">
                        {getCollaboratorName(inclusion.collaboratorId || undefined) || "Não escalado"}
                      </div>
                    </td>
                    <td className="px-3 py-4">
                      <div className="text-xs text-foreground">
                        {inclusion.scheduleStartDate && inclusion.scheduleEndDate
                          ? `${formatDate(inclusion.scheduleStartDate)} - ${formatDate(inclusion.scheduleEndDate)}`
                          : "Não definidas"}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {inclusion.dailyRates} diárias
                      </div>
                    </td>
                    <td className="px-3 py-4">
                      <StatusBadge status={inclusion.status} />
                    </td>
                    <td className="px-3 py-4 text-center">
                      {inclusion.needsTicket ? (
                        <span className="text-green-600 font-bold text-lg" title="Precisa de passagem">
                          ✓
                        </span>
                      ) : (
                        <span className="text-red-500 font-bold text-lg" title="Não precisa de passagem">
                          ✗
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-4 text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-1">
                        {/* Para registros cancelados, permitir apenas comentários se não for edição */}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleViewComments(inclusion.id)}
                          className="text-blue-600 hover:text-blue-900 h-8 w-8 p-0 shrink-0"
                          data-testid={`button-comments-${inclusion.id}`}
                        >
                          <MessageCircle className="w-4 h-4" />
                        </Button>
                        {hasPermission(user, 'canEditScreen1') && (
                          <>
                            {isReadOnly(inclusion) ? (
                              // Para cancelados ou comprados, só mostrar botão de excluir se permitido
                              <>
                                {canDeleteInclusion(inclusion) && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleDelete(inclusion.id)}
                                    className="text-red-600 hover:text-red-900 h-8 w-8 p-0 shrink-0"
                                    data-testid={`button-delete-${inclusion.id}`}
                                    title="Excluir registro"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                              </>
                            ) : (
                              // Para status editáveis, mostrar botões de editar, excluir e cancelar
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleEdit(inclusion.id)}
                                  className="text-green-600 hover:text-green-900 h-8 w-8 p-0 shrink-0"
                                  data-testid={`button-edit-${inclusion.id}`}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                {canDeleteInclusion(inclusion) && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleDelete(inclusion.id)}
                                    className="text-red-600 hover:text-red-900 h-8 w-8 p-0 shrink-0"
                                    data-testid={`button-delete-${inclusion.id}`}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                                {canCancelEscalation(inclusion) && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleCancelEscalation(inclusion.id)}
                                    className="text-orange-600 hover:text-orange-900 h-8 w-8 p-0 shrink-0"
                                    data-testid={`button-cancel-${inclusion.id}`}
                                    title="Cancelar Escalação"
                                  >
                                    <Ban className="w-4 h-4" />
                                  </Button>
                                )}
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CommentsModal
        open={showCommentsModal}
        onClose={() => setShowCommentsModal(false)}
        teamInclusionId={selectedInclusion || ""}
      />
      
      {/* Modal de Edição */}
      {showEditModal && editingInclusion && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg w-[800px] max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Editar Inclusão #{editingInclusion.inclusionNumber}</h2>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const startDate = formData.get('scheduleStartDate') as string;
              const endDate = formData.get('scheduleEndDate') as string;
              
              // Calcular diárias automaticamente
              const start = new Date(startDate);
              const end = new Date(endDate);
              const timeDiff = end.getTime() - start.getTime();
              const dailyRates = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1; // +1 para incluir ambos os dias
              
              const data = {
                functionId: formData.get('functionId') as string,
                status: formData.get('status') as string,
                dailyRates: dailyRates,
                needsTicket: formData.get('needsTicket') === 'true',
                needsAccommodation: formData.get('needsAccommodation') === 'true',
                scheduleStartDate: startDate,
                scheduleEndDate: endDate,
                // Sugestões de viagem
                flightDepartureDate: formData.get('ida') as string || null,
                flightArrivalSuggestedTime: formData.get('chegada') as string || null,
                flightReturnDate: formData.get('retorno') as string || null,
                flightReturnSuggestedTime: formData.get('horarioRetorno') as string || null,
                // PRESERVAR CAMPOS ESSENCIAIS que não aparecem no formulário
                collaboratorId: editingInclusion.collaboratorId,
                eventId: editingInclusion.eventId,
                area: editingInclusion.area,
              };
              updateTeamInclusionMutation.mutate({ id: editingInclusion.id, data });
            }}>
              <div className="grid grid-cols-2 gap-6">
                {/* Coluna Esquerda */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Função *</label>
                    <select
                      name="functionId"
                      defaultValue={editingInclusion.functionId}
                      className="w-full p-2 border rounded"
                      required
                    >
                      {functions?.map((func) => (
                        <option key={func.id} value={func.id}>
                          {func.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Status *</label>
                    <select
                      name="status"
                      defaultValue={editingInclusion.status}
                      className="w-full p-2 border rounded"
                      required
                    >
                      <option value="incluido">Incluído</option>
                      <option value="reaberto">Reaberto</option>
                      <option value="escalado">Escalado</option>
                      <option value="aguardando_passagem">Aguardando Passagem</option>
                      <option value="aguardando_hospedagem">Aguardando Hospedagem</option>
                      <option value="passagem_comprada">Passagem Comprada</option>
                      <option value="hospedagem_comprada">Hospedagem Comprada</option>
                      <option value="hospedagem_passagem_comprada">Hospedagem e Passagem Comprada</option>
                      <option value="cancelado">Cancelado</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Data Início *</label>
                    <input
                      type="date"
                      name="scheduleStartDate"
                      defaultValue={editingInclusion.scheduleStartDate || ""}
                      className="w-full p-2 border rounded"
                      onChange={(e) => {
                        const startDate = e.target.value;
                        const endDateInput = e.target.form?.querySelector('input[name="scheduleEndDate"]') as HTMLInputElement;
                        const dailyRatesDisplay = e.target.form?.querySelector('#dailyRatesDisplay') as HTMLInputElement;
                        
                        if (startDate && endDateInput?.value && dailyRatesDisplay) {
                          const start = new Date(startDate);
                          const end = new Date(endDateInput.value);
                          const timeDiff = end.getTime() - start.getTime();
                          const days = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;
                          dailyRatesDisplay.value = days > 0 ? days.toString() : '1';
                        }
                      }}
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Data Fim *</label>
                    <input
                      type="date"
                      name="scheduleEndDate"
                      defaultValue={editingInclusion.scheduleEndDate || ""}
                      className="w-full p-2 border rounded"
                      onChange={(e) => {
                        const endDate = e.target.value;
                        const startDateInput = e.target.form?.querySelector('input[name="scheduleStartDate"]') as HTMLInputElement;
                        const dailyRatesDisplay = e.target.form?.querySelector('#dailyRatesDisplay') as HTMLInputElement;
                        
                        if (endDate && startDateInput?.value && dailyRatesDisplay) {
                          const start = new Date(startDateInput.value);
                          const end = new Date(endDate);
                          const timeDiff = end.getTime() - start.getTime();
                          const days = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;
                          dailyRatesDisplay.value = days > 0 ? days.toString() : '1';
                        }
                      }}
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Quantidade de Diárias (Calculado)</label>
                    <input
                      type="text"
                      id="dailyRatesDisplay"
                      defaultValue={editingInclusion.dailyRates.toString()}
                      className="w-full p-2 border rounded bg-gray-100 text-gray-600"
                      readOnly
                    />
                    <small className="text-xs text-gray-500">Calculado automaticamente baseado nas datas</small>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Precisa de Passagem?</label>
                    <select
                      name="needsTicket"
                      defaultValue={editingInclusion.needsTicket ? 'true' : 'false'}
                      className="w-full p-2 border rounded"
                    >
                      <option value="false">Não</option>
                      <option value="true">Sim</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Precisa de Hospedagem?</label>
                    <select
                      name="needsAccommodation"
                      defaultValue={editingInclusion.needsAccommodation ? 'true' : 'false'}
                      className="w-full p-2 border rounded"
                    >
                      <option value="false">Não</option>
                      <option value="true">Sim</option>
                    </select>
                  </div>
                </div>

                {/* Coluna Direita - Sugestões de Viagem */}
                <div className="space-y-4">
                  <div className="border rounded-lg p-4 bg-blue-50 dark:bg-blue-950/30">
                    <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-3">
                      Sugestões de Viagem <span className="text-xs opacity-60">(para escalação)</span>
                    </h4>
                    <div className="text-xs text-muted-foreground mb-3">
                      Essas informações aparecerão como sugestões na tela de escalação
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium mb-1">Dia de Ida</label>
                        <input
                          type="date"
                          name="ida"
                          defaultValue={editingInclusion.flightDepartureDate || ''}
                          className="w-full p-2 border rounded text-sm"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium mb-1">Horário de Chegada</label>
                        <input
                          type="text"
                          name="chegada"
                          defaultValue={editingInclusion.flightArrivalSuggestedTime || ''}
                          placeholder="Ex: 9h, manhã"
                          className="w-full p-2 border rounded text-sm bg-white"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium mb-1">Dia de Retorno</label>
                        <input
                          type="date"
                          name="retorno"
                          defaultValue={editingInclusion.flightReturnDate || ''}
                          className="w-full p-2 border rounded text-sm"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium mb-1">Horário de Partida</label>
                        <input
                          type="text"
                          name="horarioRetorno"
                          defaultValue={editingInclusion.flightReturnSuggestedTime || ''}
                          placeholder="Ex: 18h, final da tarde"
                          className="w-full p-2 border rounded text-sm bg-white"
                        />
                      </div>
                    </div>
                    
                    <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-950/20 rounded text-xs text-blue-700 dark:text-blue-300">
                      <strong>Dica:</strong> Use descrições claras como "sábado", "9h", "domingo", "18h" ou datas específicas
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-2 mt-6 pt-4 border-t">
                <button
                  type="submit"
                  disabled={updateTeamInclusionMutation.isPending}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {updateTeamInclusionMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingInclusion(null);
                  }}
                  className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}