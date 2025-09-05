import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import NavigationTabs from "@/components/layout/navigation-tabs";
import WorkflowIndicator from "@/components/layout/workflow-indicator";
import UniversalFilters from "@/components/common/universal-filters";
import StatusBadge from "@/components/common/status-badge";
import { Eye, MessageCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import CommentsModal from "@/components/modals/comments-modal";
import type { TeamInclusion, Event, Function, Collaborator, Ticket, Financial } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";

export default function Consultation() {
  const { user } = useAuth();
  const [selectedInclusion, setSelectedInclusion] = useState<string | null>(null);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryInclusionId, setSummaryInclusionId] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    eventId: "all",
    functionId: "all",
    collaboratorId: "all",
    status: "all",
    escalationStatus: "all",
    searchId: "",
  });
  const [searchId, setSearchId] = useState<string>("");

  // Check if user can access this screen
  if (!hasPermission(user, 'canAccessScreen6')) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-card rounded-lg shadow-sm border border-border p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Acesso Negado</h3>
            <p className="text-muted-foreground">Você não tem permissão para acessar esta tela.</p>
          </div>
        </div>
      </div>
    );
  }

  const { data: teamInclusions } = useQuery<TeamInclusion[]>({
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

  const { data: financial } = useQuery<Financial[]>({
    queryKey: ["/api/financial"],
  });

  const { data: users } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  // Filter inclusions based on current filters
  const filteredInclusions = teamInclusions?.filter(inclusion => {
    // Apply ID search filter first (using inclusion number)
    const idMatch = !searchId || 
      (inclusion.inclusionNumber && inclusion.inclusionNumber.toString().includes(searchId)) ||
      inclusion.id.toLowerCase().includes(searchId.toLowerCase());
    if (!idMatch) return false;
    
    if (filters.eventId !== "all" && inclusion.eventId !== filters.eventId) return false;
    if (filters.functionId !== "all" && inclusion.functionId !== filters.functionId) return false;
    if (filters.collaboratorId !== "all" && inclusion.collaboratorId !== filters.collaboratorId) return false;
    if (filters.status !== "all" && inclusion.status !== filters.status) return false;
    return true;
  }) || [];

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

  const getUserName = (userId?: string) => {
    if (!userId) return "N/A";
    return users?.find(u => u.id === userId)?.name || "Usuário não encontrado";
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "N/A";
    // Parse manual para evitar problemas de timezone
    const [year, month, day] = dateStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    return date.toLocaleDateString("pt-BR");
  };

  const getPhaseIcon = (phase: string) => {
    const phases = {
      inclusao: "👥",
      escalacao: "✅", 
      passagem: "✈️",
      fechamento: "📊",
      aprovacao: "✔️"
    };
    return phases[phase as keyof typeof phases] || "📄";
  };

  const getPhaseLabel = (phase: string) => {
    const phases = {
      inclusao: "Inclusão",
      escalacao: "Escalação", 
      passagem: "Passagem",
      fechamento: "Fechamento",
      aprovacao: "Aprovação"
    };
    return phases[phase as keyof typeof phases] || phase;
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value / 100);
  };

  const getTicket = (inclusionId: string): Ticket | undefined => {
    return tickets?.find(ticket => ticket.teamInclusionId === inclusionId);
  };

  const getFinancial = (inclusionId: string): Financial | undefined => {
    return financial?.find(fin => fin.teamInclusionId === inclusionId);
  };

  const getTotalValue = (inclusion: TeamInclusion): number => {
    const ticket = getTicket(inclusion.id);
    const financialRecord = getFinancial(inclusion.id);
    
    let total = 0;
    if (ticket?.value) total += ticket.value;
    if (financialRecord?.actualValue) total += financialRecord.actualValue;
    if (inclusion.dailyValue > 0) {
      const startDate = new Date(inclusion.scheduleStartDate);
      const endDate = new Date(inclusion.scheduleEndDate);
      const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      total += inclusion.dailyValue * days;
    }
    
    return total;
  };

  const handleViewComments = (inclusionId: string) => {
    setSelectedInclusion(inclusionId);
    setShowCommentsModal(true);
  };

  const handleViewSummary = (inclusionId: string) => {
    setSummaryInclusionId(inclusionId);
    setShowSummaryModal(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <NavigationTabs activeTab="consultation" />
        <WorkflowIndicator currentPhase="consulta" />
        
        <div className="space-y-4">
          <div className="bg-card rounded-lg shadow-sm border border-border p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-foreground mb-2">📋 Log Detalhado de Registros</h2>
                <p className="text-muted-foreground text-sm">Visualize todas as informações completas dos registros.</p>
              </div>
              <div className="flex gap-3">
                <div className="text-sm font-medium text-green-600 bg-green-50 px-2 py-1 rounded">
                  ✅ {teamInclusions?.filter(ti => ti.status === "aprovado").length || 0} aprovados
                </div>
                <div className="text-sm font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded">
                  📊 {teamInclusions?.length || 0} total
                </div>
              </div>
            </div>
            <div className="mt-3 flex gap-2 items-center">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <input
                  type="text"
                  placeholder="Buscar por número..."
                  value={searchId}
                  onChange={(e) => setSearchId(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-search-id"
                />
              </div>
              {searchId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSearchId("")}
                  data-testid="button-clear-search"
                >
                  Limpar
                </Button>
              )}
            </div>
          </div>

          <UniversalFilters filters={filters} onFiltersChange={setFilters} />

          {/* Cards Compactos */}
          <div className="bg-card rounded-lg shadow-sm border border-border">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                🔍 Timeline Completo - Log dos Registros
                <Badge variant="outline" className="ml-2 text-xs">{filteredInclusions.length} registros</Badge>
              </h3>
            </div>
            
            <div className="p-4">
              {filteredInclusions?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  📄 Nenhum registro encontrado para os filtros selecionados
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredInclusions?.map((inclusion) => {
                    const ticket = getTicket(inclusion.id);
                    const financialRecord = getFinancial(inclusion.id);
                    const totalValue = getTotalValue(inclusion);
                    const phases = ['inclusao', 'escalacao', 'passagem', 'fechamento', 'aprovacao'];
                    const currentPhaseIndex = phases.indexOf(inclusion.phase);
                    const progress = inclusion.status === "aprovado" ? 100 : ((currentPhaseIndex + 1) / phases.length) * 100;
                    
                    return (
                      <Card key={inclusion.id} className="hover:shadow-md transition-all">
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{getPhaseIcon(inclusion.phase)}</span>
                              <CardTitle className="text-sm font-bold">#{inclusion.inclusionNumber || 'N/A'}</CardTitle>
                              <StatusBadge status={inclusion.status} />
                              <span className="text-xs text-muted-foreground">{getPhaseLabel(inclusion.phase)}</span>
                            </div>
                            <div className="text-right">
                              <div className="text-base font-bold text-primary">{formatCurrency(totalValue)}</div>
                              <div className="w-16 bg-gray-200 rounded-full h-1">
                                <div 
                                  className="bg-primary h-1 rounded-full transition-all" 
                                  style={{ width: `${progress}%` }}
                                ></div>
                              </div>
                            </div>
                          </div>
                        </CardHeader>

                        <CardContent className="pt-0">
                          {/* Informações Principais - Consistentes */}
                          <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                            <div>
                              <div className="font-medium text-foreground">{getEventName(inclusion.eventId)}</div>
                              <div className="text-muted-foreground">{getFunctionName(inclusion.functionId)}</div>
                            </div>
                            <div>
                              <div className="font-medium text-foreground">{getCollaboratorName(inclusion.collaboratorId || undefined)}</div>
                              <div className="text-muted-foreground">{formatDate(inclusion.createdAt?.toString())}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">
                                {formatDate(inclusion.scheduleStartDate)} - {formatDate(inclusion.scheduleEndDate)}
                              </div>
                              {inclusion.dailyValue > 0 && (
                                <div className="text-green-600 text-xs">R$ {(inclusion.dailyValue / 100).toFixed(2)}/dia</div>
                              )}
                            </div>
                          </div>

                          {/* Só mostrar extras se realmente existir */}
                          {ticket && (
                            <div className="bg-green-50 px-2 py-1 rounded text-xs mb-1">
                              <span className="font-medium text-green-700">✈️ Passagem:</span> {formatCurrency(ticket.value || 0)} • {ticket.departureAirport} → {ticket.destinationAirport}
                            </div>
                          )}

                          {financialRecord && (
                            <div className="bg-purple-50 px-2 py-1 rounded text-xs mb-1">
                              <span className="font-medium text-purple-700">💰 Financeiro:</span> {formatCurrency(financialRecord.actualValue || 0)}
                            </div>
                          )}

                          {/* Badges simples */}
                          <div className="flex flex-wrap gap-1">
                            {inclusion.needsTicket && (
                              <Badge variant="outline" className="text-xs">🎫 Precisa Passagem</Badge>
                            )}
                            {inclusion.emergencyRecord && (
                              <Badge variant="destructive" className="text-xs">🚨 Urgente</Badge>
                            )}
                          </div>

                          <div className="flex items-center justify-end gap-1 pt-2 border-t border-border/30">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleViewComments(inclusion.id)}
                              className="text-blue-600 hover:text-blue-900 text-xs px-2"
                              data-testid={`button-comments-${inclusion.id}`}
                            >
                              <MessageCircle className="w-3 h-3 mr-1" />
                              Comentários
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleViewSummary(inclusion.id)}
                              className="text-green-600 hover:text-green-900 text-xs px-2"
                              data-testid={`button-view-${inclusion.id}`}
                            >
                              <Eye className="w-3 h-3 mr-1" />
                              Resumo
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Comments Modal */}
      <CommentsModal
        open={showCommentsModal}
        onClose={() => setShowCommentsModal(false)}
        teamInclusionId={selectedInclusion || ""}
      />

      {/* Summary Modal - Completo com todos os dados */}
      <Dialog open={showSummaryModal} onOpenChange={setShowSummaryModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>📋 Log Completo do Registro</DialogTitle>
          </DialogHeader>
          {summaryInclusionId && (() => {
            const inclusion = teamInclusions?.find(i => i.id === summaryInclusionId);
            const ticket = getTicket(summaryInclusionId);
            const financialRecord = getFinancial(summaryInclusionId);
            const totalValue = inclusion ? getTotalValue(inclusion) : 0;
            const phases = ['inclusao', 'escalacao', 'passagem', 'fechamento', 'aprovacao'];
            const currentPhaseIndex = inclusion ? phases.indexOf(inclusion.phase) : 0;
            const progress = inclusion?.status === "aprovado" ? 100 : ((currentPhaseIndex + 1) / phases.length) * 100;
            
            if (!inclusion) return <div>Registro não encontrado</div>;
            
            return (
              <div className="space-y-4">
                {/* Header com Progress */}
                <div className="bg-gradient-to-r from-primary/10 to-primary/5 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{getPhaseIcon(inclusion.phase)}</span>
                      <div>
                        <h3 className="text-lg font-bold">#{inclusion.inclusionNumber || 'N/A'}</h3>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={inclusion.status} />
                          <span className="text-sm text-muted-foreground">{getPhaseLabel(inclusion.phase)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-primary">{formatCurrency(totalValue)}</div>
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-primary h-2 rounded-full transition-all" 
                          style={{ width: `${progress}%` }}
                        ></div>
                      </div>
                      <div className="text-xs text-muted-foreground">{Math.round(progress)}% completo</div>
                    </div>
                  </div>
                </div>

                {/* Informações Básicas */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-card p-3 rounded border">
                    <h4 className="font-medium text-foreground border-b pb-1 mb-2">🎪 Evento e Função</h4>
                    <div className="space-y-1 text-sm">
                      <div><span className="text-muted-foreground">Evento:</span> <strong>{getEventName(inclusion.eventId)}</strong></div>
                      <div><span className="text-muted-foreground">Função:</span> <strong>{getFunctionName(inclusion.functionId)}</strong></div>
                      {inclusion.area && (
                        <div><span className="text-muted-foreground">Área:</span> {inclusion.area}</div>
                      )}
                    </div>
                  </div>

                  <div className="bg-card p-3 rounded border">
                    <h4 className="font-medium text-foreground border-b pb-1 mb-2">👤 Colaborador</h4>
                    <div className="space-y-1 text-sm">
                      <div><strong>{getCollaboratorName(inclusion.collaboratorId || undefined)}</strong></div>
                      {(() => {
                        const collaborator = collaborators?.find(c => c.id === inclusion.collaboratorId);
                        if (collaborator?.approvedBy) {
                          return (
                            <div className="text-green-600">
                              ✅ Aprovado por {getUserName(collaborator.approvedBy)}
                              {collaborator.approvedAt && (
                                <div>em {formatDate(collaborator.approvedAt.toString())}</div>
                              )}
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>

                  <div className="bg-card p-3 rounded border">
                    <h4 className="font-medium text-foreground border-b pb-1 mb-2">📅 Cronograma</h4>
                    <div className="space-y-1 text-sm">
                      <div><span className="text-muted-foreground">Início:</span> {formatDate(inclusion.scheduleStartDate)}</div>
                      <div><span className="text-muted-foreground">Fim:</span> {formatDate(inclusion.scheduleEndDate)}</div>
                      {inclusion.dailyValue > 0 && (
                        <div><span className="text-muted-foreground">Diária:</span> R$ {(inclusion.dailyValue / 100).toFixed(2)}/dia</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Auditoria */}
                <div className="bg-gray-50 p-3 rounded border">
                  <h4 className="font-medium text-foreground border-b pb-1 mb-2">🔍 Histórico de Alterações</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Criado em:</span> {formatDate(inclusion.createdAt?.toString())} por <strong>{getUserName(inclusion.userId)}</strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Última atualização:</span> {formatDate(inclusion.updatedAt?.toString())}
                      {inclusion.updatedBy && <span> por <strong>{getUserName(inclusion.updatedBy)}</strong></span>}
                    </div>
                  </div>
                </div>

                {/* Sugestões de Voo */}
                {(inclusion.flightDepartureDate || inclusion.flightReturnDate) && (
                  <div className="bg-blue-50 p-3 rounded border">
                    <h4 className="font-medium text-blue-800 border-b border-blue-200 pb-1 mb-2">✈️ Sugestões de Voo</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      {inclusion.flightDepartureDate && (
                        <div>
                          <span className="text-muted-foreground">Ida sugerida:</span> <strong>{formatDate(inclusion.flightDepartureDate)}</strong>
                          {inclusion.flightDepartureSuggestedTime && <div>às {inclusion.flightDepartureSuggestedTime}</div>}
                        </div>
                      )}
                      {inclusion.flightReturnDate && (
                        <div>
                          <span className="text-muted-foreground">Volta sugerida:</span> <strong>{formatDate(inclusion.flightReturnDate)}</strong>
                          {inclusion.flightReturnSuggestedTime && <div>às {inclusion.flightReturnSuggestedTime}</div>}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Passagem Comprada */}
                {ticket && (
                  <div className="bg-green-50 p-3 rounded border">
                    <h4 className="font-medium text-green-800 border-b border-green-200 pb-1 mb-2">✈️ Passagem Comprada</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <div><span className="text-muted-foreground">Valor:</span> <strong>{formatCurrency(ticket.value || 0)}</strong></div>
                        <div><span className="text-muted-foreground">Data da compra:</span> {formatDate(ticket.purchaseDate)}</div>
                        {ticket.purchaseOrderNumber && (
                          <div><span className="text-muted-foreground">Ordem de Compra:</span> {ticket.purchaseOrderNumber}</div>
                        )}
                        {ticket.cardLastFourDigits && (
                          <div><span className="text-muted-foreground">Cartão:</span> ****{ticket.cardLastFourDigits}</div>
                        )}
                      </div>
                      <div>
                        <div><span className="text-muted-foreground">Aeroportos:</span> <strong>{ticket.departureAirport} → {ticket.destinationAirport}</strong></div>
                        {ticket.actualDepartureDate && (
                          <div>
                            <span className="text-muted-foreground">Ida real:</span> {formatDate(ticket.actualDepartureDate)}
                            {ticket.actualDepartureTime && ` às ${ticket.actualDepartureTime}`}
                          </div>
                        )}
                        {ticket.actualReturnDate && (
                          <div>
                            <span className="text-muted-foreground">Volta real:</span> {formatDate(ticket.actualReturnDate)}
                            {ticket.actualReturnTime && ` às ${ticket.actualReturnTime}`}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Registro Financeiro */}
                {financialRecord && (
                  <div className="bg-purple-50 p-3 rounded border">
                    <h4 className="font-medium text-purple-800 border-b border-purple-200 pb-1 mb-2">💰 Registro Financeiro</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <div><span className="text-muted-foreground">Valor:</span> <strong>{formatCurrency(financialRecord.actualValue || 0)}</strong></div>
                        <div><span className="text-muted-foreground">Método de pagamento:</span> {financialRecord.paymentMethod}</div>
                        {financialRecord.transactionDate && (
                          <div><span className="text-muted-foreground">Data da transação:</span> {formatDate(financialRecord.transactionDate)}</div>
                        )}
                      </div>
                      <div>
                        {financialRecord.purchaseOrderNumber && (
                          <div><span className="text-muted-foreground">Ordem de Compra:</span> {financialRecord.purchaseOrderNumber}</div>
                        )}
                        {financialRecord.cardLastFourDigits && (
                          <div><span className="text-muted-foreground">Cartão:</span> ****{financialRecord.cardLastFourDigits}</div>
                        )}
                        {financialRecord.description && (
                          <div><span className="text-muted-foreground">Descrição:</span> {financialRecord.description}</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Marcadores Especiais */}
                <div className="flex flex-wrap gap-2">
                  {inclusion.emergencyRecord && (
                    <Badge variant="destructive">🚨 Registro Emergencial</Badge>
                  )}
                  {inclusion.needsTicket && (
                    <Badge variant="secondary">✈️ Necessita Passagem</Badge>
                  )}
                  {inclusion.dailyValue > 0 && (
                    <Badge variant="outline">💰 Com Diária</Badge>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}