import { useState, useEffect, useMemo } from "react";
import { formatDiarias, fixEncoding } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import StatusBadge from "@/components/common/status-badge";
import { CheckCircle, FileCheck, Filter, Search, Copy, AlertTriangle } from "lucide-react";
import type { TeamInclusion, Event, Function, Collaborator, Financial, Ticket } from "@shared/schema";

// Helper: Mostrar "Escalado" apenas quando não precisa passagem nem hospedagem
const getDisplayStatus = (inclusion: TeamInclusion) => {
  if (inclusion.status === "escalado" && (inclusion.needsTicket || inclusion.needsAccommodation)) {
    if (inclusion.needsTicket) return "aguardando_passagem";
    if (inclusion.needsAccommodation) return "aguardando_hospedagem";
  }
  return inclusion.status;
};

// Datas do banco vêm como "YYYY-MM-DD"; new Date("2026-08-13") é interpretado
// como UTC e exibia o dia anterior em Brasília. Parse local resolve.
const formatDateBr = (dateStr?: string | null) => {
  if (!dateStr) return "—";
  const [y, m, d] = String(dateStr).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "—";
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

// Preserva a semântica de Array.find (o primeiro registro vence) trocando
// buscas O(n) dentro do render por um índice O(1).
function indexBy<T>(rows: T[] | undefined, key: (row: T) => string | null | undefined) {
  const map = new Map<string, T>();
  for (const row of rows || []) {
    const k = key(row);
    if (k && !map.has(k)) map.set(k, row);
  }
  return map;
}

export default function Approval() {
  const [selectedInclusions, setSelectedInclusions] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState({
    eventId: "all",
    functionId: "all", 
    collaboratorId: "all"
  });
  const [searchInput, setSearchInput] = useState<string>("");
  const [searchId, setSearchId] = useState<string>("");

  useEffect(() => {
    if (searchInput === "") { setSearchId(""); return; }
    const t = setTimeout(() => setSearchId(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);
  const [isApproving, setIsApproving] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: teamInclusions, isLoading, isError, error, refetch, isFetching } = useQuery<TeamInclusion[]>({
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

  const { data: financials } = useQuery<Financial[]>({
    queryKey: ["/api/financial"],
  });

  const mutationErrorText = (e: any, fallback: string) => {
    if (e?.status === 401) return "Sua sessão expirou. Entre novamente para continuar.";
    if (e?.status === 403) return "Você não tem permissão para aprovar registros financeiros.";
    return e?.body?.message || e?.message || fallback;
  };

  const updateFinancialMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PATCH", `/api/financial/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financial"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    },
  });

  const updateTeamInclusionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PATCH", `/api/team-inclusions/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    },
  });

  const copyToClipboard = async (text: string, label: string) => {
    // writeText pode falhar (contexto não-seguro, permissão negada); avisar
    // "Copiado" sem ter copiado é feedback enganoso.
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copiado",
        description: `${label} copiado para a área de transferência`,
      });
    } catch {
      toast({
        title: "Não foi possível copiar",
        description: `Copie manualmente: ${text}`,
        variant: "destructive",
      });
    }
  };

  // Índices O(1) — antes cada linha e cada reduce refazia um find na lista inteira.
  const eventById = useMemo(() => indexBy(events, e => e.id), [events]);
  const functionById = useMemo(() => indexBy(functions, f => f.id), [functions]);
  const collaboratorById = useMemo(() => indexBy(collaborators, c => c.id), [collaborators]);
  const ticketByInclusion = useMemo(() => indexBy(tickets, t => t.teamInclusionId), [tickets]);
  const financialByInclusion = useMemo(() => indexBy(financials, f => f.teamInclusionId), [financials]);

  // Filter inclusions that are approved
  const approvalInclusions = useMemo(() => teamInclusions?.filter(inclusion => {
    if (inclusion.status !== "aprovado" || !inclusion.collaboratorId) return false;

    // Apply ID search filter
    if (searchId) {
      const q = searchId.replace(/#/g, '').trim().toLowerCase();
      const idMatch = String(inclusion.inclusionNumber ?? '').toLowerCase().includes(q) ||
        inclusion.id.toLowerCase().includes(q);
      if (!idMatch) return false;
    }

    // Apply filters
    if (filters.eventId !== "all" && inclusion.eventId !== filters.eventId) return false;
    if (filters.functionId !== "all" && inclusion.functionId !== filters.functionId) return false;
    if (filters.collaboratorId !== "all" && inclusion.collaboratorId !== filters.collaboratorId) return false;

    return true;
  }) || [], [teamInclusions, searchId, filters]);

  // A seleção precisa acompanhar a lista visível: com filtros ativos o contador
  // "X de Y selecionados" chegava a mostrar X maior que Y e o "selecionar todos"
  // nunca marcava.
  const visibleSelectedIds = useMemo(
    () => approvalInclusions.filter(inc => selectedInclusions.has(inc.id)).map(inc => inc.id),
    [approvalInclusions, selectedInclusions]
  );
  const selectedCount = visibleSelectedIds.length;
  const selectedRows = useMemo(
    () => (selectedCount > 0 ? approvalInclusions.filter(inc => selectedInclusions.has(inc.id)) : approvalInclusions),
    [approvalInclusions, selectedInclusions, selectedCount]
  );

  const getEventName = (eventId: string) => {
    return eventById.get(eventId)?.name || "Evento não encontrado";
  };

  const getFunctionName = (functionId: string) => {
    return functionById.get(functionId)?.name || "Função não encontrada";
  };


  const getCollaboratorName = (collaboratorId?: string) => {
    if (!collaboratorId) return "Não escalado";
    return fixEncoding(collaboratorById.get(collaboratorId)?.fullName) || "Colaborador não encontrado";
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getTicket = (inclusionId: string) => ticketByInclusion.get(inclusionId);

  const getFinancial = (inclusionId: string) => financialByInclusion.get(inclusionId);

  // A lista só contém inclusões com status "aprovado" (ver approvalInclusions),
  // então o antigo ramo "planejado" era inalcançável.
  const getTotalValue = (inclusion: TeamInclusion) => {
    const ticket = getTicket(inclusion.id);
    const financial = getFinancial(inclusion.id);
    const ticketValue = ticket?.value || 0;
    const dailyRatesValue = financial?.actualValue || 0;
    const feeValue = financial?.actualFee || 0;
    return (ticketValue + dailyRatesValue + feeValue) / 100;
  };

  // actualDailyRates pode ser 0 legitimamente — com "||" um fechamento de
  // zero diárias voltava a exibir o valor planejado.
  const realizedDailyRates = (inclusion: TeamInclusion) =>
    getFinancial(inclusion.id)?.actualDailyRates ?? inclusion.dailyRates;

  // O bloco "Planejado x Realizado" refazia os mesmos seis reduces (cada um
  // com finds internos) a cada render; agora é um cálculo só, memoizado.
  const summary = useMemo(() => {
    let plannedValue = 0;
    let realizedCents = 0;
    let plannedRates = 0;
    let realizedRates = 0;

    for (const inclusion of selectedRows) {
      plannedValue += (inclusion.dailyValue / 100) * inclusion.dailyRates;
      realizedCents += (financialByInclusion.get(inclusion.id)?.actualValue || 0)
        + (ticketByInclusion.get(inclusion.id)?.value || 0);
      plannedRates += inclusion.dailyRates;
      realizedRates += financialByInclusion.get(inclusion.id)?.actualDailyRates ?? inclusion.dailyRates;
    }

    const realizedValue = realizedCents / 100;
    return {
      plannedValue,
      realizedValue,
      valueDiff: realizedValue - plannedValue,
      plannedRates,
      realizedRates,
      ratesDiff: realizedRates - plannedRates,
    };
  }, [selectedRows, financialByInclusion, ticketByInclusion]);

  const handleInclusionSelect = (inclusionId: string, checked: boolean) => {
    const newSelected = new Set(selectedInclusions);
    if (checked) {
      newSelected.add(inclusionId);
    } else {
      newSelected.delete(inclusionId);
    }
    setSelectedInclusions(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedInclusions(new Set(approvalInclusions.map(inc => inc.id)));
    } else {
      setSelectedInclusions(new Set());
    }
  };

  const handleBulkApproval = async () => {
    if (isApproving) return; // trava de duplo clique
    if (selectedCount === 0) {
      toast({
        title: "Atenção",
        description: "Selecione pelo menos um registro para aprovação",
        variant: "destructive",
      });
      return;
    }

    const now = new Date();
    const targets = [...visibleSelectedIds];
    setIsApproving(true);

    const failed: string[] = [];
    let lastError: any = null;

    // O toast de sucesso só pode sair depois que o servidor confirmar: antes
    // ele aparecia imediatamente, mesmo quando todas as requisições falhavam.
    for (const inclusionId of targets) {
      try {
        const financial = getFinancial(inclusionId);
        if (financial) {
          await updateFinancialMutation.mutateAsync({
            id: financial.id,
            data: {
              approvedAt: now.toISOString(),
              // O identificador real do usuário logado — antes ia a string
              // literal "current-user-id", que viola a FK de approved_by.
              ...(user?.id ? { approvedBy: user.id } : {}),
            }
          });
        }

        await updateTeamInclusionMutation.mutateAsync({
          id: inclusionId,
          data: {
            status: "aprovado",
            phase: "concluido",
            progress: 100 // Set progress to 100% after approval
          }
        });
      } catch (e) {
        lastError = e;
        failed.push(inclusionId);
      }
    }

    setIsApproving(false);

    const okCount = targets.length - failed.length;
    if (failed.length === 0) {
      toast({
        title: "Sucesso",
        description: `${okCount} registro(s) aprovado(s) com sucesso`,
      });
      setSelectedInclusions(new Set());
    } else {
      toast({
        title: okCount > 0 ? "Aprovação parcial" : "Erro ao aprovar",
        description: okCount > 0
          ? `${okCount} aprovado(s), ${failed.length} com falha. ${mutationErrorText(lastError, "Tente novamente os que restaram.")}`
          : mutationErrorText(lastError, "Nenhum registro foi aprovado. Tente novamente."),
        variant: "destructive",
      });
      // Mantém selecionado apenas o que falhou, para o usuário tentar de novo.
      setSelectedInclusions(new Set(failed));
    }
  };

  if (isLoading) {
    return (
      <div className="bg-card rounded-lg shadow-sm border border-border p-6 animate-pulse">
        <div className="h-8 bg-muted rounded mb-4 w-1/3"></div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-muted rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  // Falha de rede/sessão não pode virar "nenhuma aprovação pendente".
  if (isError) {
    return (
      <div className="bg-card rounded-lg shadow-sm border border-border p-12 text-center">
        <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-2">Não foi possível carregar os registros</h3>
        <p className="text-muted-foreground mb-4">
          {(error as any)?.status === 401
            ? "Sua sessão expirou. Entre novamente para continuar."
            : (error as any)?.status === 403
            ? "Você não tem permissão para acessar a aprovação financeira."
            : (error as any)?.body?.message || "Verifique sua conexão e tente novamente."}
        </p>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? "Tentando..." : "Tentar novamente"}
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg shadow-sm border border-border">
          <div className="px-6 py-4 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-foreground">Aprovação Financeira</h2>
                <p className="text-muted-foreground mt-1">
                  Aprove os registros financeiros dos colaboradores em lote
                </p>
              </div>
              {approvalInclusions.length > 0 && (
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">
                      {selectedCount} de {approvalInclusions.length} selecionados
                    </span>
                    <div className="text-sm font-medium text-green-600 bg-green-50 px-2 py-1 rounded">
                      {teamInclusions?.filter(ti => ti.status === "aprovado").length || 0} aprovados
                    </div>
                  </div>
                  <Button
                    onClick={handleBulkApproval}
                    disabled={selectedCount === 0 || isApproving}
                    data-testid="button-bulk-approve"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {isApproving ? "Aprovando..." : "Aprovar Selecionados"}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="px-6 py-4 border-b border-border bg-muted/20">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Filtros:</span>
              </div>
              
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <input
                  type="text"
                  placeholder="Buscar por número..."
                  aria-label="Buscar registro por número de inclusão"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-64 pl-10 pr-4 py-2 border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-search-id"
                />
              </div>
              
              <div className="flex items-center gap-3 flex-wrap">
                <div className="min-w-[200px]">
                  <Select 
                    value={filters.eventId} 
                    onValueChange={(value) => setFilters(prev => ({ ...prev, eventId: value }))}
                  >
                    <SelectTrigger className="w-full border border-slate-200 rounded-lg bg-white text-sm text-slate-700 hover:border-blue-300 transition-colors focus:ring-2 focus:ring-blue-200">
                      <SelectValue placeholder="Todos os eventos" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border border-slate-200 rounded-xl shadow-lg min-w-[220px]">
                      <SelectItem value="all" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Todos os eventos</SelectItem>
                      {events?.filter(e => e.status !== 'excluido' && e.status !== 'excluído').map(event => (
                        <SelectItem key={event.id} value={event.id} className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">
                          {event.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="min-w-[180px]">
                  <Select 
                    value={filters.functionId} 
                    onValueChange={(value) => setFilters(prev => ({ ...prev, functionId: value }))}
                  >
                    <SelectTrigger className="w-full border border-slate-200 rounded-lg bg-white text-sm text-slate-700 hover:border-blue-300 transition-colors focus:ring-2 focus:ring-blue-200">
                      <SelectValue placeholder="Todas as funções" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border border-slate-200 rounded-xl shadow-lg min-w-[200px]">
                      <SelectItem value="all" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Todas as funções</SelectItem>
                      {functions?.map(func => (
                        <SelectItem key={func.id} value={func.id} className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">
                          {func.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="min-w-[200px]">
                  <Select 
                    value={filters.collaboratorId} 
                    onValueChange={(value) => setFilters(prev => ({ ...prev, collaboratorId: value }))}
                  >
                    <SelectTrigger className="w-full border border-slate-200 rounded-lg bg-white text-sm text-slate-700 hover:border-blue-300 transition-colors focus:ring-2 focus:ring-blue-200">
                      <SelectValue placeholder="Todos os colaboradores" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border border-slate-200 rounded-xl shadow-lg min-w-[220px]">
                      <SelectItem value="all" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Todos os colaboradores</SelectItem>
                      {collaborators?.map(collaborator => (
                        <SelectItem key={collaborator.id} value={collaborator.id} className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">
                          {fixEncoding(collaborator.fullName)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {approvalInclusions.length === 0 ? (
            <div className="p-12 text-center">
              <FileCheck className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                Nenhuma aprovação pendente
              </h3>
              <p className="text-muted-foreground">
                Não há registros para aprovação financeira ou todos já foram processados.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Planned vs Actual Analysis Summary */}
              <div className="p-4 bg-accent/50 rounded-lg">
                <h3 className="font-medium text-foreground mb-3">
                  Análise Planejado x Realizado
                  {selectedCount > 0 && (
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      ({selectedCount} registros selecionados)
                    </span>
                  )}
                </h3>

                {/* Comparativo de Valores */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {formatCurrency(summary.plannedValue)}
                    </div>
                    <div className="text-muted-foreground">Total Planejado</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {formatCurrency(summary.realizedValue)}
                    </div>
                    <div className="text-muted-foreground">Total Realizado</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${summary.valueDiff >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(summary.valueDiff)}
                    </div>
                    <div className="text-muted-foreground">Diferença</div>
                  </div>
                </div>

                {/* Comparativo de Diárias */}
                <div className="border-t pt-3">
                  <h4 className="text-sm font-medium text-foreground mb-2">Comparativo de Diárias</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="text-center">
                      <div className="text-xl font-bold text-blue-600">
                        {summary.plannedRates}
                      </div>
                      <div className="text-muted-foreground">Diárias Planejadas</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-bold text-green-600">
                        {summary.realizedRates}
                      </div>
                      <div className="text-muted-foreground">Diárias Realizadas</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-xl font-bold ${summary.ratesDiff >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {summary.ratesDiff > 0 ? '+' : ''}{summary.ratesDiff}
                      </div>
                      <div className="text-muted-foreground">Diferença</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-6 py-3 text-left">
                        <Checkbox
                          checked={approvalInclusions.length > 0 && selectedCount === approvalInclusions.length}
                          onCheckedChange={handleSelectAll}
                          aria-label="Selecionar todos os registros exibidos"
                          data-testid="checkbox-select-all"
                        />
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Evento / Função
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Colaborador
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Datas / Diárias
                      </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Valores Realizados
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Total
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                  {approvalInclusions.map((inclusion) => {
                    const financial = getFinancial(inclusion.id);
                    const ticket = getTicket(inclusion.id);
                    const totalValue = getTotalValue(inclusion);
                    
                    return (
                      <tr 
                        key={inclusion.id} 
                        className={`hover:bg-accent/50 transition-colors ${
                          selectedInclusions.has(inclusion.id) ? 'bg-accent/30' : ''
                        }`}
                        data-testid={`row-approval-${inclusion.id}`}
                      >
                        <td className="px-6 py-4">
                          <Checkbox
                            checked={selectedInclusions.has(inclusion.id)}
                            onCheckedChange={(checked) => handleInclusionSelect(inclusion.id, checked as boolean)}
                            aria-label={`Selecionar registro #${inclusion.inclusionNumber ?? inclusion.id}`}
                            data-testid={`checkbox-${inclusion.id}`}
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-mono text-foreground">
                              #{inclusion.inclusionNumber || 'N/A'}
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="p-1 h-6 w-6"
                              aria-label={`Copiar ID #${inclusion.inclusionNumber ?? inclusion.id}`}
                              onClick={() => copyToClipboard(inclusion.inclusionNumber?.toString() || inclusion.id, "ID")}
                              data-testid={`button-copy-id-${inclusion.id}`}
                            >
                              <Copy className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-foreground">
                            {getEventName(inclusion.eventId)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {getFunctionName(inclusion.functionId)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-foreground">
                            {getCollaboratorName(inclusion.collaboratorId || undefined)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="space-y-1">
                            <div className="text-xs font-medium text-blue-600">Planejado:</div>
                            <div className="text-sm text-foreground">
                              {formatDateBr(inclusion.scheduleStartDate)} - {formatDateBr(inclusion.scheduleEndDate)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatDiarias(inclusion.dailyRates)} × {formatCurrency(inclusion.dailyValue / 100)}
                            </div>
                            {inclusion.actualStartDate && (
                              <>
                                <div className="text-xs font-medium text-green-600 mt-2">Realizado:</div>
                                <div className="text-sm text-foreground">
                                  {formatDateBr(inclusion.actualStartDate)} - {formatDateBr(inclusion.actualEndDate || inclusion.scheduleEndDate)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {formatDiarias(realizedDailyRates(inclusion))}
                                  {financial?.actualDailyRates != null && financial.actualDailyRates !== inclusion.dailyRates && (
                                    <span className={`ml-2 font-medium ${
                                      financial.actualDailyRates > inclusion.dailyRates ? 'text-red-600' : 'text-green-600'
                                    }`}>
                                      ({financial.actualDailyRates > inclusion.dailyRates ? '+' : ''}{financial.actualDailyRates - inclusion.dailyRates})
                                    </span>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="space-y-2">
                            <div>
                              <div className="flex justify-between items-center">
                                <span className="text-xs text-blue-600">Planejado:</span>
                                <span className="text-sm font-medium">{formatCurrency((inclusion.dailyValue / 100) * inclusion.dailyRates)}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-xs text-green-600">Realizado:</span>
                                <span className="text-sm font-medium">{formatCurrency(
                                  (financial?.actualValue || 0) / 100
                                )}</span>
                              </div>
                              <div className="flex justify-between items-center border-t pt-1">
                                <span className="text-xs text-muted-foreground">Diferença:</span>
                                <span className={`text-sm font-medium ${
                                  (((financial?.actualValue || 0) / 100) - ((inclusion.dailyValue / 100) * inclusion.dailyRates)) >= 0 
                                    ? 'text-red-600' : 'text-green-600'
                                }`}>
                                  {formatCurrency(((financial?.actualValue || 0) / 100) - ((inclusion.dailyValue / 100) * inclusion.dailyRates))}
                                </span>
                              </div>
                            </div>
                            {ticket && (ticket.value || 0) > 0 && (
                              <div className="pt-1 border-t">
                                <div className="text-xs text-muted-foreground">Passagem: {formatCurrency((ticket.value || 0) / 100)}</div>
                              </div>
                            )}
                            {financial?.observations && (
                              <div className="pt-1 border-t">
                                <div className="text-xs text-muted-foreground">Obs: {financial.observations.substring(0, 30)}{financial.observations.length > 30 ? '...' : ''}</div>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-lg font-bold text-foreground">
                            {formatCurrency(totalValue)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <StatusBadge status={getDisplayStatus(inclusion)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
  );
}
