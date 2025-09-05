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
    // For now, just show a toast - edit functionality can be implemented later
    toast({
      title: "Função em desenvolvimento",
      description: "A edição de inclusões será implementada em breve",
    });
  };

  const canEditInclusion = (status: string) => {
    // Pode editar apenas até a confirmação de escalação
    // Status que permitem edição: inclusao, escalacao
    // Status que NÃO permitem edição: passagem, fechamento, aprovacao, aprovado
    const editableStatuses = ['inclusao', 'escalacao'];
    return editableStatuses.includes(status);
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
                <th className="w-28 px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Data Escala
                </th>
                <th className="w-28 px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Período
                </th>
                <th className="w-16 px-3 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Ticket
                </th>
                <th className="w-24 px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Status
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
                    </td>
                    <td className="px-3 py-4">
                      <div className="text-xs text-foreground">
                        {inclusion.dailyRates} dias
                      </div>
                    </td>
                    <td className="px-3 py-4 text-center">
                      {inclusion.needsTicket ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          S
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                          N
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-4">
                      <StatusBadge status={inclusion.status} />
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
                        {hasPermission(user, 'canEditScreen1') && (
                          <>
                            {canEditInclusion(inclusion.status) && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEdit(inclusion.id)}
                                className="text-green-600 hover:text-green-900"
                                data-testid={`button-edit-${inclusion.id}`}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                            )}
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
    </>
  );
}