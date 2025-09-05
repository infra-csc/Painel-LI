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
    return phases[phase as keyof typeof phases] || "📋";
  };

  const getPhaseLabel = (phase: string) => {
    const labels = {
      inclusao: "Inclusão",
      escalacao: "Escalação",
      passagem: "Passagem",
      fechamento: "Fechamento",
      aprovacao: "Aprovação"
    };
    return labels[phase as keyof typeof labels] || phase;
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getTicket = (inclusionId: string) => {
    return tickets?.find(ticket => ticket.teamInclusionId === inclusionId);
  };

  const getFinancial = (inclusionId: string) => {
    return financial?.find(fin => fin.teamInclusionId === inclusionId);
  };

  const getTotalValue = (inclusion: TeamInclusion) => {
    const ticket = getTicket(inclusion.id);
    const financialRecord = getFinancial(inclusion.id);
    
    // Se foi aprovado, usar valores reais; senão usar valores planejados
    if (inclusion.status === "aprovado") {
      const ticketValue = ticket?.value || 0;
      const dailyRatesValue = (financialRecord?.actualValue || 0);
      const feeValue = financialRecord?.actualFee || 0;
      return (ticketValue + dailyRatesValue + feeValue) / 100;
    } else {
      // Valores planejados: soma de passagens + diárias (considerando agrupamentos)
      const plannedDailyValue = ((inclusion.dailyValue || 0) * inclusion.dailyRates) / 100;
      const plannedTicketValue = inclusion.needsTicket ? (ticket?.value || 0) / 100 : 0;
      return plannedDailyValue + plannedTicketValue;
    }
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
        
        <div className="space-y-6">
          <div className="bg-card rounded-lg shadow-sm border border-border p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-foreground mb-2">📋 Log Detalhado de Registros</h2>
                <p className="text-muted-foreground">Visualize todas as informações completas dos registros com detalhes de cada etapa do processo.</p>
              </div>
              <div className="flex gap-3">
                <div className="text-sm font-medium text-green-600 bg-green-50 px-3 py-2 rounded-lg">
                  ✅ {teamInclusions?.filter(ti => ti.status === "aprovado").length || 0} aprovados
                </div>
                <div className="text-sm font-medium text-blue-600 bg-blue-50 px-3 py-2 rounded-lg">
                  📊 {teamInclusions?.length || 0} total
                </div>
              </div>
            </div>
            <div className="mt-4 flex gap-2 items-center">
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

          {/* Timeline Log Detalhado */}
          <div className="bg-card rounded-lg shadow-sm border border-border">
            <div className="px-6 py-4 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                🔍 Timeline Completo - Log Detalhado dos Registros
                <Badge variant="outline" className="ml-2">{filteredInclusions.length} registros</Badge>
              </h3>
            </div>
            
            <div className="p-6">
              {filteredInclusions?.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  📄 Nenhum registro encontrado para os filtros selecionados
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredInclusions?.map((inclusion) => {
                    const ticket = getTicket(inclusion.id);
                    const financialRecord = getFinancial(inclusion.id);
                    const totalValue = getTotalValue(inclusion);
                    const phases = ['inclusao', 'escalacao', 'passagem', 'fechamento', 'aprovacao'];
                    const currentPhaseIndex = phases.indexOf(inclusion.phase);
                    const progress = inclusion.status === "aprovado" ? 100 : ((currentPhaseIndex + 1) / phases.length) * 100;
                    
                    return (
                      <Card
                        key={inclusion.id}
                        className="hover:shadow-md transition-all"
                        data-testid={`log-entry-${inclusion.id}`}
                      >
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="p-1.5 bg-primary/10 rounded-full">
                                <span className="text-lg">{getPhaseIcon(inclusion.phase)}</span>
                              </div>
                              <div>
                                <CardTitle className="text-base flex items-center gap-2">
                                  #{inclusion.inclusionNumber || 'N/A'}
                                  <StatusBadge status={inclusion.status} />
                                </CardTitle>
                                <p className="text-xs text-muted-foreground">
                                  {getPhaseLabel(inclusion.phase)} • {formatDate(inclusion.createdAt?.toString())}
                                </p>
                              </div>
                            </div>
                            
                            <div className="text-right">
                              <div className="text-lg font-bold text-primary">
                                {formatCurrency(totalValue)}
                              </div>
                              <div className="w-20 bg-gray-200 rounded-full h-1.5">
                                <div 
                                  className="bg-primary h-1.5 rounded-full transition-all" 
                                  style={{ width: `${progress}%` }}
                                ></div>
                              </div>
                            </div>
                          </div>
                        </CardHeader>

                        <CardContent className="pt-2">
                          {/* Grid de Informações Compactas */}
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                          
                          {/* Informações Básicas */}
                          <div className="space-y-1.5">
                            <h4 className="font-medium text-foreground text-xs mb-1">🎪 Evento</h4>
                            <div className="space-y-1">
                              <div className="text-xs">
                                <span className="text-muted-foreground block">Evento:</span>
                                <span className="font-medium">{getEventName(inclusion.eventId)}</span>
                              </div>
                              <div className="text-xs">
                                <span className="text-muted-foreground block">Função:</span>
                                <span className="font-medium">{getFunctionName(inclusion.functionId)}</span>
                              </div>
                              <div className="text-xs">
                                <span className="text-muted-foreground block">Colaborador:</span>
                                <span className="font-medium">{getCollaboratorName(inclusion.collaboratorId || undefined)}</span>
                                {(() => {
                                  const collaborator = collaborators?.find(c => c.id === inclusion.collaboratorId);
                                  if (collaborator?.approvedBy) {
                                    return (
                                      <div className="text-xs text-green-600 mt-1">
                                        ✅ Aprovado por {getUserName(collaborator.approvedBy)}
                                        {collaborator.approvedAt && ` em ${formatDate(collaborator.approvedAt.toString())}`}
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                              {inclusion.area && (
                                <div>
                                  <span className="text-muted-foreground">Área:</span>
                                  <div className="font-medium">{inclusion.area}</div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Informações de Cronograma */}
                          <div className="space-y-3">
                            <h4 className="font-medium text-foreground border-b border-border pb-1">📅 Cronograma</h4>
                            <div className="space-y-2 text-sm">
                              <div>
                                <span className="text-muted-foreground">📋 Período Planejado:</span>
                                <div className="font-medium">
                                  {formatDate(inclusion.scheduleStartDate)} → {formatDate(inclusion.scheduleEndDate)}
                                </div>
                              </div>
                              {(inclusion.actualStartDate || inclusion.actualEndDate) && (
                                <div>
                                  <span className="text-muted-foreground">✅ Período Real:</span>
                                  <div className="font-medium">
                                    {formatDate(inclusion.actualStartDate)} → {formatDate(inclusion.actualEndDate)}
                                  </div>
                                </div>
                              )}
                              <div>
                                <span className="text-muted-foreground">💰 Diárias:</span>
                                <div className="font-medium">
                                  Planejadas: {inclusion.dailyRates} 
                                  {inclusion.actualDailyRates && ` • Realizadas: ${inclusion.actualDailyRates}`}
                                </div>
                              </div>
                              <div>
                                <span className="text-muted-foreground">💵 Valor por diária:</span>
                                <div className="font-medium text-green-600">
                                  {formatCurrency((inclusion.dailyValue || 0) / 100)}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Informações de Voo */}
                          {inclusion.needsTicket && (
                            <div className="space-y-3">
                              <h4 className="font-medium text-foreground border-b border-border pb-1">✈️ Informações de Voo</h4>
                              <div className="space-y-2 text-sm">
                                {ticket ? (
                                  <>
                                    <div>
                                      <span className="text-muted-foreground">🛫 Rota:</span>
                                      <div className="font-medium">{ticket.departureAirport} → {ticket.destinationAirport}</div>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">📅 Ida:</span>
                                      <div className="font-medium">
                                        {formatDate(ticket.actualDepartureDate)} 
                                        {ticket.actualDepartureTime && ` às ${ticket.actualDepartureTime}`}
                                      </div>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">📅 Volta:</span>
                                      <div className="font-medium">
                                        {formatDate(ticket.actualReturnDate)} 
                                        {ticket.actualReturnTime && ` às ${ticket.actualReturnTime}`}
                                      </div>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">💸 Valor:</span>
                                      <div className="font-medium text-green-600">
                                        {formatCurrency(ticket.value ? ticket.value / 100 : 0)}
                                      </div>
                                    </div>
                                    {ticket.purchaseOrderNumber && (
                                      <div>
                                        <span className="text-muted-foreground">🧾 Ordem de Compra:</span>
                                        <div className="font-medium font-mono">{ticket.purchaseOrderNumber}</div>
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <div className="text-orange-600 font-medium">
                                    ⏳ Passagem ainda não adquirida
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Informações Financeiras */}
                          {financialRecord && (
                            <div className="space-y-3">
                              <h4 className="font-medium text-foreground border-b border-border pb-1">💰 Detalhes Financeiros</h4>
                              <div className="space-y-2 text-sm">
                                <div>
                                  <span className="text-muted-foreground">💵 Valor Planejado:</span>
                                  <div className="font-medium">
                                    {formatCurrency((financialRecord.plannedValue || 0) / 100)}
                                  </div>
                                </div>
                                {financialRecord.actualValue && (
                                  <div>
                                    <span className="text-muted-foreground">✅ Valor Real:</span>
                                    <div className="font-medium text-green-600">
                                      {formatCurrency(financialRecord.actualValue / 100)}
                                    </div>
                                  </div>
                                )}
                                {financialRecord.actualFee && (
                                  <div>
                                    <span className="text-muted-foreground">🎯 Cachê:</span>
                                    <div className="font-medium text-blue-600">
                                      {formatCurrency(financialRecord.actualFee / 100)}
                                    </div>
                                  </div>
                                )}
                                <div>
                                  <span className="text-muted-foreground">📊 Status:</span>
                                  <div className="font-medium">
                                    {financialRecord.approved ? "✅ Aprovado" : "⏳ Pendente"}
                                  </div>
                                </div>
                                {financialRecord.updatedBy && (
                                  <div>
                                    <span className="text-muted-foreground">✏️ Última edição:</span>
                                    <div className="font-medium text-blue-600 text-xs">
                                      {getUserName(financialRecord.updatedBy)}
                                      {financialRecord.updatedAt && ` em ${formatDate(financialRecord.updatedAt.toString())}`}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Observações */}
                          {(inclusion.observations || inclusion.actualObservations) && (
                            <div className="space-y-3">
                              <h4 className="font-medium text-foreground border-b border-border pb-1">📝 Observações</h4>
                              <div className="space-y-2 text-sm">
                                {inclusion.observations && (
                                  <div>
                                    <span className="text-muted-foreground">📋 Planejamento:</span>
                                    <div className="font-medium bg-muted/30 p-2 rounded text-xs">
                                      {inclusion.observations}
                                    </div>
                                  </div>
                                )}
                                {inclusion.actualObservations && (
                                  <div>
                                    <span className="text-muted-foreground">✅ Realizadas:</span>
                                    <div className="font-medium bg-green-50 dark:bg-green-900/30 p-2 rounded text-xs">
                                      {inclusion.actualObservations}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Informações de Auditoria */}
                          <div className="space-y-3">
                            <h4 className="font-medium text-foreground border-b border-border pb-1">👤 Auditoria & Responsáveis</h4>
                            <div className="space-y-2 text-sm">
                              <div>
                                <span className="text-muted-foreground">👨‍💼 Responsável pela Função:</span>
                                <div className="font-medium">{getUserName(inclusion.userId)}</div>
                              </div>
                              <div>
                                <span className="text-muted-foreground">📝 Criado por:</span>
                                <div className="font-medium">{getUserName(inclusion.userId)}</div>
                              </div>
                              {inclusion.updatedBy && (
                                <div>
                                  <span className="text-muted-foreground">✏️ Última edição por:</span>
                                  <div className="font-medium text-blue-600">{getUserName(inclusion.updatedBy)}</div>
                                </div>
                              )}
                              {financialRecord?.approvedBy && (
                                <div>
                                  <span className="text-muted-foreground">✅ Aprovação Financeira:</span>
                                  <div className="font-medium text-green-600">
                                    {getUserName(financialRecord.approvedBy)} 
                                    {financialRecord.approvedAt && ` em ${formatDate(financialRecord.approvedAt.toString())}`}
                                  </div>
                                </div>
                              )}
                              <div>
                                <span className="text-muted-foreground">📅 Última Atualização:</span>
                                <div className="font-medium">
                                  {formatDate(inclusion.updatedAt?.toString())}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Marcadores especiais */}
                          <div className="space-y-3">
                            <h4 className="font-medium text-foreground border-b border-border pb-1">🏷️ Marcadores</h4>
                            <div className="flex flex-wrap gap-2 text-sm">
                              {inclusion.emergencyRecord && (
                                <Badge variant="destructive" className="text-xs">
                                  🚨 Emergencial
                                </Badge>
                              )}
                              {inclusion.needsTicket && (
                                <Badge variant="secondary" className="text-xs">
                                  ✈️ Precisa Passagem
                                </Badge>
                              )}
                              {inclusion.dailyValue > 0 && (
                                <Badge variant="outline" className="text-xs">
                                  💰 R$ {(inclusion.dailyValue / 100).toFixed(2)}/dia
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>

                          {/* Actions */}
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

      {/* Summary Modal - Simplified */}
      <Dialog open={showSummaryModal} onOpenChange={setShowSummaryModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>📋 Resumo Completo do Registro</DialogTitle>
          </DialogHeader>
          {summaryInclusionId && (() => {
            const inclusion = teamInclusions?.find(i => i.id === summaryInclusionId);
            const ticket = getTicket(summaryInclusionId);
            const financialRecord = getFinancial(summaryInclusionId);
            
            if (!inclusion) return <div>Registro não encontrado</div>;
            
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium">Evento</h4>
                    <p>{getEventName(inclusion.eventId)}</p>
                  </div>
                  <div>
                    <h4 className="font-medium">Função</h4>
                    <p>{getFunctionName(inclusion.functionId)}</p>
                  </div>
                  <div>
                    <h4 className="font-medium">Colaborador</h4>
                    <p>{getCollaboratorName(inclusion.collaboratorId || undefined)}</p>
                  </div>
                  <div>
                    <h4 className="font-medium">Status</h4>
                    <StatusBadge status={inclusion.status} />
                  </div>
                </div>
                
                {ticket && (
                  <div>
                    <h4 className="font-medium">Informações de Voo</h4>
                    <p>{ticket.departureAirport} → {ticket.destinationAirport}</p>
                    <p>Valor: {formatCurrency(ticket.value ? ticket.value / 100 : 0)}</p>
                  </div>
                )}
                
                {financialRecord && (
                  <div>
                    <h4 className="font-medium">Informações Financeiras</h4>
                    <p>Planejado: {formatCurrency((financialRecord.plannedValue || 0) / 100)}</p>
                    {financialRecord.actualValue && (
                      <p>Real: {formatCurrency(financialRecord.actualValue / 100)}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}