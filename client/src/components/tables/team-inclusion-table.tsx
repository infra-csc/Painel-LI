import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Edit, MessageCircle, History, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusBadge from "@/components/common/status-badge";
import CommentsModal from "@/components/modals/comments-modal";
import type { TeamInclusion, Event, Function, Collaborator } from "@shared/schema";

export default function TeamInclusionTable() {
  const [selectedInclusion, setSelectedInclusion] = useState<string | null>(null);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [filters, setFilters] = useState({
    eventId: "all",
    functionId: "all",
    status: "all",
  });

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
    return functions?.find(f => f.id === functionId)?.responsibleArea || "";
  };

  const getCollaboratorName = (collaboratorId?: string) => {
    if (!collaboratorId) return "";
    return collaborators?.find(c => c.id === collaboratorId)?.fullName || "";
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  };

  const handleViewComments = (inclusionId: string) => {
    setSelectedInclusion(inclusionId);
    setShowCommentsModal(true);
  };

  const clearFilters = () => {
    setFilters({ eventId: "all", functionId: "all", status: "all" });
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
      {/* Filters */}
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex flex-wrap gap-4">
            <div className="min-w-0 flex-1 max-w-xs">
              <label className="block text-sm font-medium text-foreground mb-1">Evento</label>
              <Select value={filters.eventId} onValueChange={(value) => setFilters(prev => ({ ...prev, eventId: value === 'all' ? '' : value }))}>

                <SelectTrigger data-testid="filter-event">
                  <SelectValue placeholder="Todos os eventos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os eventos</SelectItem>
                  {events?.map((event) => (
                    <SelectItem key={event.id} value={event.id}>
                      {event.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="min-w-0 flex-1 max-w-xs">
              <label className="block text-sm font-medium text-foreground mb-1">Função</label>
              <Select value={filters.functionId} onValueChange={(value) => setFilters(prev => ({ ...prev, functionId: value === 'all' ? '' : value }))}>

                <SelectTrigger data-testid="filter-function">
                  <SelectValue placeholder="Todas as funções" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as funções</SelectItem>
                  {functions?.map((func) => (
                    <SelectItem key={func.id} value={func.id}>
                      {func.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0 flex-1 max-w-xs">
              <label className="block text-sm font-medium text-foreground mb-1">Status</label>
              <Select value={filters.status} onValueChange={(value) => setFilters(prev => ({ ...prev, status: value === 'all' ? '' : value }))}>

                <SelectTrigger data-testid="filter-status">
                  <SelectValue placeholder="Todos os status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="planejado">Planejado</SelectItem>
                  <SelectItem value="escalacao">Em Escalação</SelectItem>
                  <SelectItem value="passagem">Aguardando Passagem</SelectItem>
                  <SelectItem value="fechamento">Fechamento</SelectItem>
                  <SelectItem value="aprovado">Aprovado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <Button variant="secondary" onClick={clearFilters} data-testid="button-clear-filters">
            Limpar Filtros
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg shadow-sm border border-border">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">Lista de Inclusões de Equipe</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Evento
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Função
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Colaborador
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Data da Escala
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Diárias
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Passagem
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {teamInclusions?.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">
                    Nenhuma inclusão de equipe encontrada
                  </td>
                </tr>
              ) : (
                teamInclusions?.map((inclusion) => (
                  <tr key={inclusion.id} className="hover:bg-accent/50 transition-colors" data-testid={`row-inclusion-${inclusion.id}`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-foreground">
                        {getEventName(inclusion.eventId)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {getEventLocation(inclusion.eventId)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-foreground">
                        {getFunctionName(inclusion.functionId)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {getFunctionArea(inclusion.functionId)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-foreground">
                        {getCollaboratorName(inclusion.collaboratorId || undefined) || "Não escalado"}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-foreground">
                        {formatDate(inclusion.scheduleStartDate)} - {formatDate(inclusion.scheduleEndDate)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                      {inclusion.dailyRates} diárias
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        inclusion.needsTicket 
                          ? "bg-green-100 text-green-800" 
                          : "bg-red-100 text-red-800"
                      }`}>
                        {inclusion.needsTicket ? <Check className="w-3 h-3 mr-1" /> : <X className="w-3 h-3 mr-1" />}
                        {inclusion.needsTicket ? "Sim" : "Não"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={inclusion.status} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end items-center space-x-2">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          data-testid={`button-edit-${inclusion.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleViewComments(inclusion.id)}
                          data-testid={`button-comments-${inclusion.id}`}
                        >
                          <MessageCircle className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          data-testid={`button-history-${inclusion.id}`}
                        >
                          <History className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {teamInclusions && teamInclusions.length > 0 && (
          <div className="px-6 py-4 border-t border-border">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Mostrando <span className="font-medium">1</span> a <span className="font-medium">{teamInclusions.length}</span> de <span className="font-medium">{teamInclusions.length}</span> resultados
              </p>
            </div>
          </div>
        )}
      </div>

      <CommentsModal 
        open={showCommentsModal}
        onClose={() => setShowCommentsModal(false)}
        teamInclusionId={selectedInclusion || ""}
      />
    </>
  );
}
