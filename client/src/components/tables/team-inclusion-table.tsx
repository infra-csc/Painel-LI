import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit, MessageCircle, History, Check, X, Trash2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import StatusBadge from "@/components/common/status-badge";
import CommentsModal from "@/components/modals/comments-modal";
import UniversalFilters from "@/components/common/universal-filters";
import type { TeamInclusion, Event, Function, Collaborator } from "@shared/schema";

export default function TeamInclusionTable() {
  const [selectedInclusion, setSelectedInclusion] = useState<string | null>(null);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingInclusion, setEditingInclusion] = useState<TeamInclusion | null>(null);
  const [filters, setFilters] = useState({
    eventId: "all",
    functionId: "all",
    collaboratorId: "all",
    status: "all",
    hasTicket: "all",
    searchId: "",
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

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
    if (!collaboratorId) return "";
    return collaborators?.find(c => c.id === collaboratorId)?.fullName || "";
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

  const canEditInclusion = (status: string) => {
    // Pode editar até a confirmação de escalação (antes da passagem)
    // Status que NÃO permitem edição: passagem, fechamento, aprovacao, aprovado
    const nonEditableStatuses = ['passagem', 'fechamento', 'aprovacao', 'aprovado'];
    return !nonEditableStatuses.includes(status);
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

  // Filter and sort inclusions based on current filters
  // Sort by Event → Function → Date
  const filteredAndSortedInclusions = teamInclusions?.filter(inclusion => {
    if (filters.eventId !== "all" && inclusion.eventId !== filters.eventId) return false;
    if (filters.functionId !== "all" && inclusion.functionId !== filters.functionId) return false;
    if (filters.collaboratorId !== "all" && inclusion.collaboratorId !== filters.collaboratorId) return false;
    if (filters.status !== "all" && inclusion.status !== filters.status) return false;
    if (filters.hasTicket === "with" && !inclusion.needsTicket) return false;
    if (filters.hasTicket === "without" && inclusion.needsTicket) return false;
    if (filters.searchId && !(
      (inclusion.inclusionNumber && inclusion.inclusionNumber.toString().includes(filters.searchId)) ||
      inclusion.id.toLowerCase().includes(filters.searchId.toLowerCase())
    )) return false;
    return true;
  }).sort((a, b) => {
    // 1. Ordenar por Evento
    const eventA = getEventName(a.eventId);
    const eventB = getEventName(b.eventId);
    const eventComparison = eventA.localeCompare(eventB, 'pt-BR');
    if (eventComparison !== 0) return eventComparison;
    
    // 2. Ordenar por Função
    const functionA = getFunctionName(a.functionId);
    const functionB = getFunctionName(b.functionId);
    const functionComparison = functionA.localeCompare(functionB, 'pt-BR');
    if (functionComparison !== 0) return functionComparison;
    
    // 3. Ordenar por Data (scheduleStartDate)
    if (!a.scheduleStartDate && !b.scheduleStartDate) return 0;
    if (!a.scheduleStartDate) return 1;
    if (!b.scheduleStartDate) return -1;
    return new Date(a.scheduleStartDate).getTime() - new Date(b.scheduleStartDate).getTime();
  }) || [];

  // Calculate real totals
  const totals = {
    incluidos: filteredAndSortedInclusions.length,
    em_escalacao: filteredAndSortedInclusions.filter(i => i.status === 'escalacao').length,
    aguardando_passagem: filteredAndSortedInclusions.filter(i => i.needsTicket && i.status === 'passagem').length,
    aprovados: filteredAndSortedInclusions.filter(i => i.status === 'aprovado').length,
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-primary" data-testid="total-incluidos">{totals.incluidos}</div>
            <div className="text-sm text-muted-foreground">Incluídos</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600" data-testid="total-escalacao">{totals.em_escalacao}</div>
            <div className="text-sm text-muted-foreground">Em Escalação</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600" data-testid="total-aguardando">{totals.aguardando_passagem}</div>
            <div className="text-sm text-muted-foreground">Aguardando Passagem</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600" data-testid="total-aprovados">{totals.aprovados}</div>
            <div className="text-sm text-muted-foreground">Aprovados</div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg shadow-sm border border-border">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">Lista de Inclusões de Equipe</h3>
        </div>
        
        <div>
          <table className="w-full table-fixed">
            <thead className="bg-muted">
              <tr>
                <th className="w-20 px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  ID
                </th>
                <th className="w-36 px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Evento
                </th>
                <th className="w-32 px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Função
                </th>
                <th className="w-32 px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Colaborador
                </th>
                <th className="w-32 px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Data/Diárias
                </th>
                <th className="w-24 px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
                <th className="w-16 px-3 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Pass.
                </th>
                <th className="w-20 px-3 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {filteredAndSortedInclusions?.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-muted-foreground">
                    Nenhuma inclusão de equipe encontrada
                  </td>
                </tr>
              ) : (
                filteredAndSortedInclusions?.map((inclusion) => (
                  <tr key={inclusion.id} className="hover:bg-accent/50 transition-colors" data-testid={`row-inclusion-${inclusion.id}`}>
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
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleViewComments(inclusion.id)}
                          className="text-blue-600 hover:text-blue-900"
                          data-testid={`button-comments-${inclusion.id}`}
                        >
                          <MessageCircle className="w-4 h-4" />
                        </Button>
                        {hasPermission(user, 'canEditScreen1') && canEditInclusion(inclusion.status) && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEdit(inclusion.id)}
                              className="text-green-600 hover:text-green-900"
                              data-testid={`button-edit-${inclusion.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(inclusion.id)}
                              className="text-red-600 hover:text-red-900"
                              data-testid={`button-delete-${inclusion.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
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
                dailyRates: dailyRates,
                needsTicket: formData.get('needsTicket') === 'true',
                scheduleStartDate: startDate,
                scheduleEndDate: endDate,
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
                    <label className="block text-sm font-medium mb-1">Data Início *</label>
                    <input
                      type="date"
                      name="scheduleStartDate"
                      defaultValue={editingInclusion.scheduleStartDate}
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
                      defaultValue={editingInclusion.scheduleEndDate}
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