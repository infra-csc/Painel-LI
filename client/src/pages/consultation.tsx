import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import NavigationTabs from "@/components/layout/navigation-tabs";
import WorkflowIndicator from "@/components/layout/workflow-indicator";
import UniversalFilters from "@/components/common/universal-filters";
import StatusBadge from "@/components/common/status-badge";
import { Eye, MessageCircle, Search, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import CommentsModal from "@/components/modals/comments-modal";
import type { TeamInclusion, Event, Function, Collaborator, Ticket, Financial } from "@shared/schema";

export default function Consultation() {
  const [selectedInclusion, setSelectedInclusion] = useState<string | null>(null);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryInclusionId, setSummaryInclusionId] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    eventId: "all",
    functionId: "all",
    collaboratorId: "all",
    status: "all",
    hasTicket: "all",
    searchId: "",
  });
  const [searchId, setSearchId] = useState<string>("");

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

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    // Note: toast notification would be added here if available
    console.log(`${label} copiado: ${text}`);
  };

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
    if (filters.hasTicket === "with" && !inclusion.needsTicket) return false;
    if (filters.hasTicket === "without" && inclusion.needsTicket) return false;
    return true;
  }) || [];

  // Group inclusions by collaborator + event for better visualization
  const groupedInclusions = useMemo(() => {
    if (!filteredInclusions) return [];
    
    const groups = new Map<string, {
      groupKey: string;
      inclusions: TeamInclusion[];
      representative: TeamInclusion;
      inclusionNumbers: number[];
    }>();

    filteredInclusions.forEach(inclusion => {
      const groupKey = `${inclusion.collaboratorId || 'no-collaborator'}-${inclusion.eventId}`;
      
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          groupKey,
          inclusions: [],
          representative: inclusion,
          inclusionNumbers: []
        });
      }
      
      const group = groups.get(groupKey)!;
      group.inclusions.push(inclusion);
      if (inclusion.inclusionNumber) {
        group.inclusionNumbers.push(inclusion.inclusionNumber);
      }
    });

    return Array.from(groups.values());
  }, [filteredInclusions]);

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

  // Group inclusions by phase for progress visualization
  const inclusionsByPhase = filteredInclusions.reduce((acc, inclusion) => {
    if (!acc[inclusion.phase]) {
      acc[inclusion.phase] = [];
    }
    acc[inclusion.phase].push(inclusion);
    return acc;
  }, {} as Record<string, TeamInclusion[]>);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <NavigationTabs activeTab="consultation" />
        
        <div className="space-y-6">
          <div className="bg-card rounded-lg shadow-sm border border-border p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-foreground mb-2">Consulta Geral</h2>
                <p className="text-muted-foreground">Acompanhe o andamento e status de todos os registros em todas as fases.</p>
              </div>
              <div className="text-sm font-medium text-green-600 bg-green-50 px-3 py-2 rounded-lg">
                {teamInclusions?.filter(ti => ti.status === "aprovado").length || 0} registros aprovados
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

          {/* Phase Overview */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {['inclusao', 'escalacao', 'passagem', 'fechamento', 'aprovacao'].map((phase) => {
              const count = inclusionsByPhase[phase]?.length || 0;
              return (
                <Card key={phase} className="text-center">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      {getPhaseIcon(phase)} {getPhaseLabel(phase)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-primary" data-testid={`phase-count-${phase}`}>
                      {count}
                    </div>
                    <div className="text-xs text-muted-foreground">registros</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Detailed Table */}
          <div className="bg-card rounded-lg shadow-sm border border-border">
            <div className="px-6 py-4 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground">Todos os Registros - Visão Geral</h3>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      ID
                    </th>
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
                      Fase Atual
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Valor Total
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Progresso
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                  {filteredInclusions?.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-12 text-center text-muted-foreground">
                        Nenhum registro encontrado
                      </td>
                    </tr>
                  ) : (
                    groupedInclusions?.map((group) => {
                      const inclusion = group.representative;
                      const isGrouped = group.inclusions.length > 1;
                      const phases = ['inclusao', 'escalacao', 'passagem', 'fechamento', 'aprovacao'];
                      let progress;
                      if (inclusion.status === "aprovado") {
                        progress = 100;
                      } else {
                        const currentPhaseIndex = phases.indexOf(inclusion.phase);
                        progress = ((currentPhaseIndex + 1) / phases.length) * 100;
                      }

                      return (
                        <tr key={group.groupKey} className={`hover:bg-accent/50 transition-colors ${isGrouped ? 'bg-gradient-to-r from-green-50/30 to-blue-50/30 dark:from-green-950/30 dark:to-blue-950/30' : ''}`} data-testid={`consultation-row-${group.groupKey}`}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {isGrouped ? (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <div className="p-2 bg-gradient-to-r from-green-100 to-blue-100 dark:from-green-900 dark:to-blue-900 border-2 border-green-300 dark:border-green-700 rounded-lg">
                                    <div className="flex items-center gap-1 text-green-700 dark:text-green-300 text-xs font-bold">
                                      🔗 GRUPO
                                    </div>
                                    <div className="text-xs font-mono text-green-900 dark:text-green-100">
                                      #{group.inclusionNumbers.join(', #')}
                                    </div>
                                  </div>
                                  <div className="px-2 py-1 bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200 text-xs rounded-full font-bold">
                                    {group.inclusions.length} IDs
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="p-1 h-6 w-6 hover:bg-green-200 dark:hover:bg-green-800"
                                    onClick={() => copyToClipboard(group.inclusionNumbers.join(', '), "IDs")}
                                    data-testid={`button-copy-id-${group.groupKey}`}
                                  >
                                    <Copy className="w-3 h-3" />
                                  </Button>
                                </div>
                                <div className="text-xs text-green-600 dark:text-green-400">
                                  ℹ️ Mesmo colaborador + evento
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-mono text-foreground">
                                  #{inclusion.inclusionNumber || 'N/A'}
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="p-1 h-6 w-6"
                                  onClick={() => copyToClipboard(inclusion.inclusionNumber?.toString() || inclusion.id, "ID")}
                                  data-testid={`button-copy-id-${group.groupKey}`}
                                >
                                  <Copy className="w-3 h-3" />
                                </Button>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-foreground">
                              {getEventName(inclusion.eventId)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-foreground">
                              {getFunctionName(inclusion.functionId)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-foreground">
                              {getCollaboratorName(inclusion.collaboratorId || undefined)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <span className="mr-2">{getPhaseIcon(inclusion.phase)}</span>
                              <span className="text-sm text-foreground">{getPhaseLabel(inclusion.phase)}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <StatusBadge status={inclusion.status} />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {isGrouped ? (
                              <div>
                                <div className="text-sm font-bold text-green-700 dark:text-green-300">
                                  {formatCurrency(group.inclusions.reduce((sum, inc) => sum + getTotalValue(inc), 0))}
                                </div>
                                <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                                  Total do Grupo
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {group.inclusions.reduce((sum, inc) => sum + inc.dailyRates, 0)} diárias totais
                                </div>
                              </div>
                            ) : (
                              <div>
                                <div className="text-sm font-medium text-foreground">
                                  {formatCurrency(getTotalValue(inclusion))}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {inclusion.status === "aprovado" ? "Valor Real" : "Valor Planejado"}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {inclusion.dailyRates} diárias
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-primary h-2 rounded-full" 
                                style={{ width: `${progress}%` }}
                                data-testid={`progress-${inclusion.id}`}
                              ></div>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {Math.round(progress)}% completo
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleViewComments(inclusion.id)}
                                className="text-blue-600 hover:text-blue-900"
                                data-testid={`button-comments-${inclusion.id}`}
                              >
                                <MessageCircle className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleViewSummary(inclusion.id)}
                                className="text-green-600 hover:text-green-900"
                                data-testid={`button-view-${inclusion.id}`}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
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
        </div>
      </div>

      {/* Summary Modal */}
      <Dialog open={showSummaryModal} onOpenChange={setShowSummaryModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Resumo Completo do Registro</DialogTitle>
          </DialogHeader>
          {summaryInclusionId && (() => {
            const inclusion = teamInclusions?.find(i => i.id === summaryInclusionId);
            const ticket = getTicket(summaryInclusionId);
            const financialRecord = getFinancial(summaryInclusionId);
            
            if (!inclusion) return <div>Registro não encontrado</div>;
            
            return (
              <div className="space-y-6">
                {/* Basic Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Informações Básicas</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Evento</label>
                        <div className="text-sm">{getEventName(inclusion.eventId)}</div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Função</label>
                        <div className="text-sm">{getFunctionName(inclusion.functionId)}</div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Colaborador</label>
                        <div className="text-sm">{getCollaboratorName(inclusion.collaboratorId || undefined)}</div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Área</label>
                        <div className="text-sm">{inclusion.area}</div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Status e Progresso</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Fase Atual</label>
                        <div className="flex items-center mt-1">
                          <span className="mr-2">{getPhaseIcon(inclusion.phase)}</span>
                          <Badge variant="outline">{getPhaseLabel(inclusion.phase)}</Badge>
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Status</label>
                        <div className="mt-1">
                          <StatusBadge status={inclusion.status} />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Precisa de Passagem</label>
                        <div className="text-sm">{inclusion.needsTicket ? "Sim" : "Não"}</div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Dates and Daily Rates */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Datas e Diárias</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="font-medium text-blue-600 mb-2">Planejado</h4>
                        <div className="space-y-2">
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Período</label>
                            <div className="text-sm">{formatDate(inclusion.scheduleStartDate)} - {formatDate(inclusion.scheduleEndDate)}</div>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Diárias</label>
                            <div className="text-sm">{inclusion.dailyRates} × {formatCurrency(inclusion.dailyValue / 100)}</div>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Total Planejado</label>
                            <div className="text-sm font-medium">{formatCurrency((inclusion.dailyValue / 100) * inclusion.dailyRates)}</div>
                          </div>
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="font-medium text-green-600 mb-2">Realizado</h4>
                        <div className="space-y-2">
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Período</label>
                            <div className="text-sm">
                              {(() => {
                                // Se há datas reais definidas, usar essas datas
                                if (inclusion.actualStartDate && inclusion.actualEndDate) {
                                  return `${formatDate(inclusion.actualStartDate)} - ${formatDate(inclusion.actualEndDate)}`;
                                }
                                // Se há dados financeiros mas não há datas reais, usar datas planejadas
                                else if (financialRecord) {
                                  return `${formatDate(inclusion.scheduleStartDate)} - ${formatDate(inclusion.scheduleEndDate)}`;
                                }
                                // Se não há nada, mostrar "Não informado"
                                else {
                                  return "Não informado";
                                }
                              })()}
                            </div>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Diárias</label>
                            <div className="text-sm">
                              {financialRecord ? (
                                <span className="font-medium text-green-600">
                                  {(() => {
                                    // Mostrar quantidade de diárias realizadas e valor total realizado
                                    const actualDays = financialRecord.actualDailyRates || inclusion.dailyRates;
                                    const totalValue = (financialRecord.actualValue || 0) / 100;
                                    const dailyValue = actualDays > 0 ? totalValue / actualDays : 0;
                                    return `${actualDays} × ${formatCurrency(dailyValue)}`;
                                  })()}
                                </span>
                              ) : (
                                "Aguardando execução"
                              )}
                            </div>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Total Realizado</label>
                            <div className="text-sm font-medium">
                              {financialRecord 
                                ? formatCurrency((financialRecord.actualValue || 0) / 100)
                                : "R$ 0,00"
                              }
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Financial Information */}
                {financialRecord && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Dados Financeiros</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Diárias Realizadas</label>
                          <div className="text-lg font-medium">{formatCurrency(
                            (financialRecord.actualValue || 0) / 100
                          )}</div>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Taxa Realizada</label>
                          <div className="text-lg font-medium">{formatCurrency((financialRecord.actualFee || 0) / 100)}</div>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Total Financeiro</label>
                          <div className="text-lg font-medium text-green-600">
                            {formatCurrency(((financialRecord.actualValue || 0) / 100) + ((financialRecord.actualFee || 0) / 100))}
                          </div>
                        </div>
                      </div>
                      {financialRecord.observations && (
                        <div className="mt-4">
                          <label className="text-sm font-medium text-muted-foreground">Observações Financeiras</label>
                          <div className="text-sm mt-1 p-2 bg-muted rounded">{financialRecord.observations}</div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Ticket Information */}
                {ticket && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Informações da Passagem</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Valor da Passagem</label>
                          <div className="text-lg font-medium text-blue-600">{formatCurrency((ticket.value || 0) / 100)}</div>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Data de Compra</label>
                          <div className="text-sm">{ticket.purchaseDate || "Não informado"}</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Total Summary */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Resumo de Valores</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Quantidade de Diárias:</span>
                        <span className="font-medium text-blue-600">
                          {financialRecord ? (financialRecord.actualDailyRates || inclusion.dailyRates) : inclusion.dailyRates} diárias
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Valor das Diárias:</span>
                        <span className="font-medium">{formatCurrency(
                          financialRecord?.actualValue 
                            ? (financialRecord.actualValue / 100)
                            : (inclusion.dailyValue / 100) * inclusion.dailyRates
                        )}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Taxa:</span>
                        <span className="font-medium">{formatCurrency((financialRecord?.actualFee || 0) / 100)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Passagem:</span>
                        <span className="font-medium">{formatCurrency((ticket?.value || 0) / 100)}</span>
                      </div>
                      <div className="border-t pt-2 flex justify-between items-center">
                        <span className="font-medium">Total Geral:</span>
                        <span className="text-lg font-bold text-green-600">{formatCurrency(getTotalValue(inclusion))}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Observations */}
                {inclusion.observations && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Observações Gerais</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-sm p-3 bg-muted rounded">{inclusion.observations}</div>
                    </CardContent>
                  </Card>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <CommentsModal
        open={showCommentsModal}
        onClose={() => setShowCommentsModal(false)}
        teamInclusionId={selectedInclusion || ""}
      />
    </div>
  );
}