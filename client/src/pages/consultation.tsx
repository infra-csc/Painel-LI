import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import NavigationTabs from "@/components/layout/navigation-tabs";
import { Search, Eye, Calendar, User, Settings, ChevronDown, ChevronRight, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";

interface SystemLog {
  id: string;
  logNumber: number;
  action: string;
  entityType: string;
  entityId: string;
  entityName: string;
  details: string;
  previousData: string | null;
  newData: string | null;
  userId: string | null;
  userName: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface LogsResponse {
  logs: SystemLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export default function SystemLogsPage() {
  const { user } = useAuth();
  const [filters, setFilters] = useState({
    entityType: "all",
    action: "all",
    days: "30",
  });
  const [page, setPage] = useState(1);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  // Check if user can access this screen (admin only)
  if (!hasPermission(user, 'canAccessScreen6')) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-card rounded-lg shadow-sm border border-border p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Acesso Negado</h3>
            <p className="text-muted-foreground">Você não tem permissão para acessar os logs do sistema. Apenas administradores podem acessar esta funcionalidade.</p>
          </div>
        </div>
      </div>
    );
  }

  const { data: logsResponse, isLoading, error } = useQuery<LogsResponse>({
    queryKey: ["/api/system-logs", filters, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
        ...Object.fromEntries(
          Object.entries(filters).filter(([_, value]) => value !== "all")
        ),
      });
      const response = await fetch(`/api/system-logs?${params}`);
      if (!response.ok) {
        throw new Error("Erro ao carregar logs");
      }
      return response.json();
    },
  });

  const toggleExpanded = (logId: string) => {
    const newExpanded = new Set(expandedLogs);
    if (newExpanded.has(logId)) {
      newExpanded.delete(logId);
    } else {
      newExpanded.add(logId);
    }
    setExpandedLogs(newExpanded);
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("pt-BR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const getActionBadgeVariant = (action: string) => {
    const variants: { [key: string]: "default" | "secondary" | "destructive" | "outline" } = {
      create: "default",
      update: "secondary",
      delete: "destructive",
      approve: "default",
      reject: "destructive",
      login: "outline",
      reset_password: "secondary",
    };
    return variants[action] || "outline";
  };

  const getEntityTypeLabel = (entityType: string) => {
    const labels: { [key: string]: string } = {
      user: "Usuário",
      event: "Evento",
      function: "Função",
      collaborator: "Colaborador",
      team_inclusion: "Inclusão de Equipe",
      ticket: "Passagem",
      financial: "Financeiro",
      comment: "Comentário",
    };
    return labels[entityType] || entityType;
  };

  const getActionLabel = (action: string) => {
    const labels: { [key: string]: string } = {
      create: "Criação",
      update: "Atualização",
      delete: "Exclusão",
      approve: "Aprovação",
      reject: "Rejeição",
      login: "Login",
      reset_password: "Reset de Senha",
    };
    return labels[action] || action;
  };

  const renderDataDiff = (log: SystemLog) => {
    if (!log.previousData && !log.newData) return null;

    try {
      const previous = log.previousData ? JSON.parse(log.previousData) : null;
      const current = log.newData ? JSON.parse(log.newData) : null;

      if (!previous && current) {
        // Creation
        return (
          <div className="mt-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-md border border-green-200 dark:border-green-800">
            <h5 className="font-medium text-green-800 dark:text-green-200 mb-2">Dados Criados:</h5>
            <pre className="text-xs text-green-700 dark:text-green-300 whitespace-pre-wrap overflow-x-auto">
              {JSON.stringify(current, null, 2)}
            </pre>
          </div>
        );
      }

      if (previous && !current) {
        // Deletion
        return (
          <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-md border border-red-200 dark:border-red-800">
            <h5 className="font-medium text-red-800 dark:text-red-200 mb-2">Dados Removidos:</h5>
            <pre className="text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap overflow-x-auto">
              {JSON.stringify(previous, null, 2)}
            </pre>
          </div>
        );
      }

      if (previous && current) {
        // Update
        return (
          <div className="mt-2 space-y-3">
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-md border border-red-200 dark:border-red-800">
              <h5 className="font-medium text-red-800 dark:text-red-200 mb-2">Dados Anteriores:</h5>
              <pre className="text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap overflow-x-auto">
                {JSON.stringify(previous, null, 2)}
              </pre>
            </div>
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-md border border-green-200 dark:border-green-800">
              <h5 className="font-medium text-green-800 dark:text-green-200 mb-2">Dados Atuais:</h5>
              <pre className="text-xs text-green-700 dark:text-green-300 whitespace-pre-wrap overflow-x-auto">
                {JSON.stringify(current, null, 2)}
              </pre>
            </div>
          </div>
        );
      }
    } catch (error) {
      return (
        <div className="mt-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-md border border-yellow-200 dark:border-yellow-800">
          <p className="text-xs text-yellow-700 dark:text-yellow-300">Erro ao exibir dados: {String(error)}</p>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationTabs activeTab="consultation" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Logs de Auditoria do Sistema
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              Registro completo de todas as atividades realizadas no sistema pelos usuários.
            </p>
          </CardHeader>
          
          <CardContent>
            {/* Filtros */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Tipo de Entidade</label>
                <Select
                  value={filters.entityType}
                  onValueChange={(value) => {
                    setFilters(prev => ({ ...prev, entityType: value }));
                    setPage(1);
                  }}
                  data-testid="select-entity-type"
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as Entidades</SelectItem>
                    <SelectItem value="user">Usuário</SelectItem>
                    <SelectItem value="event">Evento</SelectItem>
                    <SelectItem value="function">Função</SelectItem>
                    <SelectItem value="collaborator">Colaborador</SelectItem>
                    <SelectItem value="team_inclusion">Inclusão de Equipe</SelectItem>
                    <SelectItem value="ticket">Passagem</SelectItem>
                    <SelectItem value="financial">Financeiro</SelectItem>
                    <SelectItem value="comment">Comentário</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Ação</label>
                <Select
                  value={filters.action}
                  onValueChange={(value) => {
                    setFilters(prev => ({ ...prev, action: value }));
                    setPage(1);
                  }}
                  data-testid="select-action"
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as Ações</SelectItem>
                    <SelectItem value="create">Criação</SelectItem>
                    <SelectItem value="update">Atualização</SelectItem>
                    <SelectItem value="delete">Exclusão</SelectItem>
                    <SelectItem value="approve">Aprovação</SelectItem>
                    <SelectItem value="reject">Rejeição</SelectItem>
                    <SelectItem value="login">Login</SelectItem>
                    <SelectItem value="reset_password">Reset de Senha</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Período</label>
                <Select
                  value={filters.days}
                  onValueChange={(value) => {
                    setFilters(prev => ({ ...prev, days: value }));
                    setPage(1);
                  }}
                  data-testid="select-days"
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Últimas 24 horas</SelectItem>
                    <SelectItem value="7">Últimos 7 dias</SelectItem>
                    <SelectItem value="30">Últimos 30 dias</SelectItem>
                    <SelectItem value="90">Últimos 90 dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Ações</label>
                <Button
                  variant="outline"
                  onClick={() => {
                    setFilters({ entityType: "all", action: "all", days: "30" });
                    setPage(1);
                  }}
                  className="w-full"
                  data-testid="button-clear-filters"
                >
                  <Filter className="h-4 w-4 mr-2" />
                  Limpar Filtros
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Resultados */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                Registros de Atividade
                {logsResponse && (
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    ({logsResponse.pagination.total} total)
                  </span>
                )}
              </CardTitle>
            </div>
          </CardHeader>
          
          <CardContent>
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4 mb-4">
                <p className="text-red-800 dark:text-red-200">
                  Erro ao carregar logs: {error instanceof Error ? error.message : "Erro desconhecido"}
                </p>
              </div>
            )}

            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                      <Skeleton className="h-6 w-20" />
                    </div>
                    <Skeleton className="h-3 w-full" />
                  </div>
                ))}
              </div>
            ) : logsResponse?.logs.length === 0 ? (
              <div className="text-center py-8">
                <Search className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground">Nenhum log encontrado com os filtros aplicados.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {logsResponse?.logs.map((log) => (
                  <Collapsible key={log.id}>
                    <div className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant={getActionBadgeVariant(log.action)} data-testid={`badge-action-${log.action}`}>
                              {getActionLabel(log.action)}
                            </Badge>
                            <Badge variant="outline" data-testid={`badge-entity-${log.entityType}`}>
                              {getEntityTypeLabel(log.entityType)}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              #{log.logNumber}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                            <div className="space-y-1">
                              <p className="font-medium text-foreground">Data/Hora</p>
                              <p className="text-muted-foreground" data-testid={`text-datetime-${log.id}`}>
                                {formatDateTime(log.createdAt)}
                              </p>
                            </div>
                            
                            <div className="space-y-1">
                              <p className="font-medium text-foreground">Usuário</p>
                              <p className="text-muted-foreground" data-testid={`text-user-${log.id}`}>
                                {log.userName || "Sistema"}
                              </p>
                            </div>
                            
                            <div className="space-y-1">
                              <p className="font-medium text-foreground">Entidade</p>
                              <p className="text-muted-foreground truncate" data-testid={`text-entity-${log.id}`}>
                                {log.entityName}
                              </p>
                            </div>
                            
                            <div className="space-y-1">
                              <p className="font-medium text-foreground">Descrição</p>
                              <p className="text-muted-foreground" data-testid={`text-details-${log.id}`}>
                                {log.details}
                              </p>
                            </div>
                          </div>
                        </div>
                        
                        {(log.previousData || log.newData) && (
                          <CollapsibleTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleExpanded(log.id)}
                              data-testid={`button-expand-${log.id}`}
                            >
                              {expandedLogs.has(log.id) ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                          </CollapsibleTrigger>
                        )}
                      </div>
                      
                      <CollapsibleContent>
                        {renderDataDiff(log)}
                        
                        {(log.ipAddress || log.userAgent) && (
                          <div className="mt-3 pt-3 border-t border-border">
                            <h5 className="font-medium text-sm mb-2">Informações Técnicas:</h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-muted-foreground">
                              {log.ipAddress && (
                                <div>
                                  <span className="font-medium">IP:</span> {log.ipAddress}
                                </div>
                              )}
                              {log.userAgent && (
                                <div className="truncate">
                                  <span className="font-medium">User Agent:</span> {log.userAgent}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                ))}
              </div>
            )}

            {/* Paginação */}
            {logsResponse && logsResponse.pagination.pages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <div className="text-sm text-muted-foreground">
                  Página {logsResponse.pagination.page} de {logsResponse.pagination.pages}
                  {" "} • {logsResponse.pagination.total} registros
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page - 1)}
                    disabled={page <= 1}
                    data-testid="button-prev-page"
                  >
                    Anterior
                  </Button>
                  
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, logsResponse.pagination.pages) }).map((_, i) => {
                      const pageNum = Math.max(1, page - 2) + i;
                      if (pageNum > logsResponse.pagination.pages) return null;
                      
                      return (
                        <Button
                          key={pageNum}
                          variant={pageNum === page ? "default" : "outline"}
                          size="sm"
                          onClick={() => setPage(pageNum)}
                          className="w-8 h-8 p-0"
                          data-testid={`button-page-${pageNum}`}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={page >= logsResponse.pagination.pages}
                    data-testid="button-next-page"
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}