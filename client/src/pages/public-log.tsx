import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Activity, User, Eye, Clock, Filter } from "lucide-react";
import type { SystemLog } from "@shared/schema";

export default function PublicLog() {
  const [filters, setFilters] = useState({
    search: "",
    entityType: "all",
    action: "all",
    days: 30
  });
  
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const { data: logs, isLoading } = useQuery<SystemLog[]>({
    queryKey: ["/api/public/logs", filters],
    retry: false,
  });

  const filteredLogs = logs?.filter(log => {
    const searchMatch = !filters.search || 
      log.details.toLowerCase().includes(filters.search.toLowerCase()) ||
      log.entityName?.toLowerCase().includes(filters.search.toLowerCase()) ||
      log.userName?.toLowerCase().includes(filters.search.toLowerCase()) ||
      log.logNumber?.toString().includes(filters.search);
    
    const entityMatch = filters.entityType === "all" || log.entityType === filters.entityType;
    const actionMatch = filters.action === "all" || log.action === filters.action;
    
    // Filter by days
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - filters.days);
    const dateMatch = new Date(log.createdAt) >= daysAgo;
    
    return searchMatch && entityMatch && actionMatch && dateMatch;
  }) || [];

  const getActionIcon = (action: string) => {
    const icons = {
      create: "✅",
      update: "📝", 
      delete: "🗑️",
      approve: "✔️",
      reject: "❌",
      assign: "👤",
      complete: "🏁",
      register: "📋"
    };
    return icons[action as keyof typeof icons] || "🔄";
  };

  const getActionColor = (action: string) => {
    const colors = {
      create: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
      update: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
      delete: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
      approve: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300", 
      reject: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
      assign: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
      complete: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
      register: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
    };
    return colors[action as keyof typeof colors] || "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
  };

  const getEntityTypeIcon = (entityType: string) => {
    const icons = {
      user: "👤",
      event: "🎪",
      function: "🔧",
      collaborator: "👥",
      team_inclusion: "📋",
      ticket: "✈️",
      financial: "💰",
      comment: "💬"
    };
    return icons[entityType as keyof typeof icons] || "📄";
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit", 
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  };

  const getTimeAgo = (dateStr: string) => {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
      return `há ${diffDays} dia${diffDays > 1 ? 's' : ''}`;
    } else if (diffHours > 0) {
      return `há ${diffHours} hora${diffHours > 1 ? 's' : ''}`;
    } else {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return `há ${diffMinutes} minuto${diffMinutes > 1 ? 's' : ''}`;
    }
  };

  const toggleLogDetails = (logId: string) => {
    setExpandedLog(expandedLog === logId ? null : logId);
  };

  // Get unique values for filters
  const entityTypes = Array.from(new Set(logs?.map(log => log.entityType) || []));
  const actions = Array.from(new Set(logs?.map(log => log.action) || []));

  return (
    <div className="min-h-screen bg-background">
      {/* Header Público */}
      <div className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-3">
            <Activity className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold text-foreground">Log Público do Sistema</h1>
              <p className="text-muted-foreground mt-1">
                Acompanhe todas as atividades e mudanças em tempo real
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Filtros */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filtros de Busca
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Buscar</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    type="text"
                    placeholder="Número, detalhes, usuário..."
                    value={filters.search}
                    onChange={(e) => setFilters({...filters, search: e.target.value})}
                    className="pl-10"
                    data-testid="input-search"
                  />
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-2 block">Tipo de Entidade</label>
                <select
                  value={filters.entityType}
                  onChange={(e) => setFilters({...filters, entityType: e.target.value})}
                  className="w-full h-10 px-3 border border-border rounded-md bg-background text-foreground"
                  data-testid="select-entity-type"
                >
                  <option value="all">Todos os Tipos</option>
                  {entityTypes.map(type => (
                    <option key={type} value={type}>
                      {getEntityTypeIcon(type)} {type.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-2 block">Ação</label>
                <select
                  value={filters.action}
                  onChange={(e) => setFilters({...filters, action: e.target.value})}
                  className="w-full h-10 px-3 border border-border rounded-md bg-background text-foreground"
                  data-testid="select-action"
                >
                  <option value="all">Todas as Ações</option>
                  {actions.map(action => (
                    <option key={action} value={action}>
                      {getActionIcon(action)} {action}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-2 block">Período</label>
                <select
                  value={filters.days}
                  onChange={(e) => setFilters({...filters, days: parseInt(e.target.value)})}
                  className="w-full h-10 px-3 border border-border rounded-md bg-background text-foreground"
                  data-testid="select-days"
                >
                  <option value={7}>Últimos 7 dias</option>
                  <option value={30}>Últimos 30 dias</option>
                  <option value={90}>Últimos 90 dias</option>
                  <option value={365}>Último ano</option>
                </select>
              </div>
            </div>
            
            {(filters.search || filters.entityType !== "all" || filters.action !== "all") && (
              <div className="mt-4 flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => setFilters({search: "", entityType: "all", action: "all", days: 30})}
                  data-testid="button-clear-filters"
                >
                  Limpar Filtros
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                  <Activity className="w-6 h-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-muted-foreground">Total de Eventos</p>
                  <p className="text-2xl font-semibold">{filteredLogs.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-full">
                  <User className="w-6 h-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-muted-foreground">Usuários Ativos</p>
                  <p className="text-2xl font-semibold">
                    {new Set(filteredLogs.filter(log => log.userName).map(log => log.userName)).size}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-full">
                  <Clock className="w-6 h-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-muted-foreground">Último Evento</p>
                  <p className="text-sm font-semibold">
                    {filteredLogs[0] ? getTimeAgo(filteredLogs[0].createdAt) : 'N/A'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-full">
                  <Eye className="w-6 h-6 text-orange-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-muted-foreground">Tipos Diferentes</p>
                  <p className="text-2xl font-semibold">{entityTypes.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Timeline de Logs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Timeline de Atividades ({filteredLogs.length} eventos)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <div className="animate-pulse text-muted-foreground">Carregando logs...</div>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                Nenhum log encontrado para os filtros selecionados
              </div>
            ) : (
              <div className="space-y-4">
                {filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex gap-4 p-4 border border-border rounded-lg hover:bg-accent/50 transition-colors"
                    data-testid={`log-entry-${log.logNumber}`}
                  >
                    {/* Timeline indicator */}
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-lg">
                        {getEntityTypeIcon(log.entityType)}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Badge className={`${getActionColor(log.action)} text-xs font-medium`}>
                            {getActionIcon(log.action)} {log.action.toUpperCase()}
                          </Badge>
                          <span className="text-sm font-mono text-muted-foreground">#{log.logNumber}</span>
                          <Badge variant="outline" className="text-xs">
                            {log.entityType.replace('_', ' ')}
                          </Badge>
                        </div>
                        
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{getTimeAgo(log.createdAt)}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleLogDetails(log.id)}
                            className="h-6 w-6 p-0"
                            data-testid={`button-expand-${log.id}`}
                          >
                            <Eye className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>

                      <div className="mt-2">
                        <p className="text-foreground font-medium">{log.details}</p>
                        {log.entityName && (
                          <p className="text-sm text-muted-foreground mt-1">
                            Entidade: {log.entityName}
                          </p>
                        )}
                        {log.userName && (
                          <p className="text-sm text-muted-foreground">
                            Por: {log.userName}
                          </p>
                        )}
                      </div>

                      {/* Detalhes expandidos */}
                      {expandedLog === log.id && (
                        <div className="mt-4 p-3 bg-muted/30 rounded-lg border-l-4 border-primary">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div>
                              <strong>Timestamp:</strong>
                              <div className="font-mono text-muted-foreground">{formatDateTime(log.createdAt)}</div>
                            </div>
                            
                            {log.ipAddress && (
                              <div>
                                <strong>IP Address:</strong>
                                <div className="font-mono text-muted-foreground">{log.ipAddress}</div>
                              </div>
                            )}
                            
                            {log.previousData && (
                              <div className="md:col-span-2">
                                <strong>Dados Anteriores:</strong>
                                <pre className="mt-1 p-2 bg-red-50 dark:bg-red-950/30 border rounded text-xs overflow-x-auto">
                                  {JSON.stringify(JSON.parse(log.previousData), null, 2)}
                                </pre>
                              </div>
                            )}
                            
                            {log.newData && (
                              <div className="md:col-span-2">
                                <strong>Novos Dados:</strong>
                                <pre className="mt-1 p-2 bg-green-50 dark:bg-green-950/30 border rounded text-xs overflow-x-auto">
                                  {JSON.stringify(JSON.parse(log.newData), null, 2)}
                                </pre>
                              </div>
                            )}
                            
                            {log.userAgent && (
                              <div className="md:col-span-2">
                                <strong>User Agent:</strong>
                                <div className="text-xs text-muted-foreground break-all">{log.userAgent}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer público */}
        <div className="text-center text-sm text-muted-foreground mt-8 py-4 border-t border-border">
          Sistema de Log Público - Atualizado em tempo real
        </div>
      </div>
    </div>
  );
}