import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { BarChart3, RefreshCw, CheckCircle, XCircle, RotateCcw, TrendingUp, TrendingDown, Minus, DollarSign, ArrowRight } from "lucide-react";
import type { Event, Function, Collaborator, BudgetActual, BudgetPlanned, BudgetComparison } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";

export default function BudgetComparisonPage() {
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [actionModal, setActionModal] = useState<{ type: 'approve' | 'reject' | 'return'; id: string } | null>(null);
  const [actionNote, setActionNote] = useState("");
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: events } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: functions } = useQuery<Function[]>({ queryKey: ["/api/functions"] });
  const { data: collaborators } = useQuery<Collaborator[]>({ queryKey: ["/api/collaborators"] });
  
  const { data: comparison, isLoading: isLoadingComparison } = useQuery<BudgetComparison | null>({
    queryKey: ["/api/budget-comparison", selectedEventId],
    queryFn: async () => {
      if (!selectedEventId) return null;
      const res = await fetch(`/api/budget-comparison?eventId=${selectedEventId}`);
      return res.json();
    },
    enabled: !!selectedEventId,
  });

  const { data: budgetPlanned } = useQuery<BudgetPlanned[]>({
    queryKey: ["/api/budget-planned", selectedEventId],
    queryFn: async () => {
      const res = await fetch(`/api/budget-planned?eventId=${selectedEventId}`);
      return res.json();
    },
    enabled: !!selectedEventId,
  });

  const { data: budgetActual } = useQuery<BudgetActual[]>({
    queryKey: ["/api/budget-actual", selectedEventId],
    queryFn: async () => {
      const res = await fetch(`/api/budget-actual?eventId=${selectedEventId}`);
      return res.json();
    },
    enabled: !!selectedEventId,
  });

  const calculateMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const res = await apiRequest("POST", `/api/budget-comparison/calculate/${eventId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Comparativo calculado com sucesso" });
      qc.invalidateQueries({ queryKey: ["/api/budget-comparison"] });
    },
    onError: () => {
      toast({ title: "Erro", description: "Erro ao calcular comparativo", variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const res = await apiRequest("POST", `/api/budget-comparison/${id}/approve`, {
        approvedBy: user?.id,
        approvalObservation: note,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Comparativo aprovado" });
      qc.invalidateQueries({ queryKey: ["/api/budget-comparison"] });
      setActionModal(null);
      setActionNote("");
    },
    onError: () => {
      toast({ title: "Erro", description: "Erro ao aprovar", variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const res = await apiRequest("POST", `/api/budget-comparison/${id}/reject`, {
        approvedBy: user?.id,
        rejectionReason: note,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Comparativo rejeitado" });
      qc.invalidateQueries({ queryKey: ["/api/budget-comparison"] });
      setActionModal(null);
      setActionNote("");
    },
    onError: () => {
      toast({ title: "Erro", description: "Erro ao rejeitar", variant: "destructive" });
    },
  });

  const returnMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const res = await apiRequest("POST", `/api/budget-comparison/${id}/return`, {
        approvedBy: user?.id,
        returnReason: note,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Comparativo devolvido para correção" });
      qc.invalidateQueries({ queryKey: ["/api/budget-comparison"] });
      setActionModal(null);
      setActionNote("");
    },
    onError: () => {
      toast({ title: "Erro", description: "Erro ao devolver", variant: "destructive" });
    },
  });

  const handleAction = () => {
    if (!actionModal) return;
    
    if ((actionModal.type === 'reject' || actionModal.type === 'return') && !actionNote.trim()) {
      toast({ title: "Atenção", description: "Informe o motivo", variant: "destructive" });
      return;
    }

    switch (actionModal.type) {
      case 'approve':
        approveMutation.mutate({ id: actionModal.id, note: actionNote });
        break;
      case 'reject':
        rejectMutation.mutate({ id: actionModal.id, note: actionNote });
        break;
      case 'return':
        returnMutation.mutate({ id: actionModal.id, note: actionNote });
        break;
    }
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
  };

  const getCollaboratorName = (id?: string | null) => {
    if (!id) return "-";
    return collaborators?.find(c => c.id === id)?.fullName || "-";
  };

  const getFunctionName = (id?: string | null) => {
    if (!id) return "-";
    return functions?.find(f => f.id === id)?.name || "-";
  };

  const selectedEvent = events?.find(e => e.id === selectedEventId);

  const comparisonData = useMemo(() => {
    if (!budgetPlanned || !budgetActual) return [];

    const data: Array<{
      collaboratorId: string | null;
      functionId: string | null;
      planned: BudgetPlanned | null;
      actual: BudgetActual | null;
      variance: number;
    }> = [];

    const processedActual = new Set<string>();

    budgetPlanned.forEach(p => {
      const matchingActual = budgetActual.find(a => a.plannedId === p.id);
      if (matchingActual) {
        processedActual.add(matchingActual.id);
      }
      data.push({
        collaboratorId: p.collaboratorId,
        functionId: p.functionId,
        planned: p,
        actual: matchingActual || null,
        variance: matchingActual ? (p.totalValue - matchingActual.totalValue) : p.totalValue,
      });
    });

    budgetActual.forEach(a => {
      if (!processedActual.has(a.id)) {
        data.push({
          collaboratorId: a.collaboratorId,
          functionId: a.functionId,
          planned: null,
          actual: a,
          variance: -a.totalValue,
        });
      }
    });

    return data;
  }, [budgetPlanned, budgetActual]);

  const changesLog = comparison?.changesLog ? JSON.parse(comparison.changesLog) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Comparativo</h1>
          <p className="text-gray-500 dark:text-gray-400">Planejado vs Realizado - Aprovação RH</p>
        </div>
        {selectedEventId && (
          <Button onClick={() => calculateMutation.mutate(selectedEventId)} disabled={calculateMutation.isPending}>
            <RefreshCw className={`w-4 h-4 mr-2 ${calculateMutation.isPending ? 'animate-spin' : ''}`} />
            Recalcular
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Selecionar Evento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedEventId} onValueChange={setSelectedEventId}>
            <SelectTrigger className="w-full md:w-80">
              <SelectValue placeholder="Selecione um evento" />
            </SelectTrigger>
            <SelectContent>
              {events?.map(event => (
                <SelectItem key={event.id} value={event.id}>
                  {event.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedEventId && comparison && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Total Planejado</p>
                    <p className="text-2xl font-bold text-blue-600">{formatCurrency(comparison.totalPlanned)}</p>
                  </div>
                  <DollarSign className="w-8 h-8 text-blue-200" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Total Realizado</p>
                    <p className="text-2xl font-bold text-purple-600">{formatCurrency(comparison.totalActual)}</p>
                  </div>
                  <DollarSign className="w-8 h-8 text-purple-200" />
                </div>
              </CardContent>
            </Card>

            <Card className={comparison.variance >= 0 ? 'border-green-200 bg-green-50 dark:bg-green-950' : 'border-red-200 bg-red-50 dark:bg-red-950'}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Variação</p>
                    <p className={`text-2xl font-bold ${comparison.variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(Math.abs(comparison.variance))}
                    </p>
                    <p className={`text-sm ${comparison.variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {comparison.variance >= 0 ? 'Economia' : 'Acima do previsto'}
                    </p>
                  </div>
                  {comparison.variance >= 0 ? (
                    <TrendingDown className="w-8 h-8 text-green-300" />
                  ) : (
                    <TrendingUp className="w-8 h-8 text-red-300" />
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Status</p>
                    <p className={`text-lg font-bold ${
                      comparison.status === 'aprovado' ? 'text-green-600' :
                      comparison.status === 'rejeitado' ? 'text-red-600' :
                      comparison.status === 'devolvido' ? 'text-orange-600' :
                      'text-yellow-600'
                    }`}>
                      {comparison.status === 'aprovado' ? 'Aprovado' :
                       comparison.status === 'rejeitado' ? 'Rejeitado' :
                       comparison.status === 'devolvido' ? 'Devolvido' :
                       'Pendente'}
                    </p>
                  </div>
                  {comparison.status === 'pendente' && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="text-green-600 border-green-600" onClick={() => setActionModal({ type: 'approve', id: comparison.id })}>
                        <CheckCircle className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline" className="text-red-600 border-red-600" onClick={() => setActionModal({ type: 'reject', id: comparison.id })}>
                        <XCircle className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline" className="text-orange-600 border-orange-600" onClick={() => setActionModal({ type: 'return', id: comparison.id })}>
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {(comparison.rejectionReason || comparison.returnReason || comparison.approvalObservation) && (
            <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950">
              <CardHeader>
                <CardTitle className="text-orange-700">Observações do RH</CardTitle>
              </CardHeader>
              <CardContent>
                {comparison.approvalObservation && <p className="text-green-700">{comparison.approvalObservation}</p>}
                {comparison.rejectionReason && <p className="text-red-700">Motivo da recusa: {comparison.rejectionReason}</p>}
                {comparison.returnReason && <p className="text-orange-700">Motivo da devolução: {comparison.returnReason}</p>}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Detalhamento por Colaborador</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Função</TableHead>
                    <TableHead className="text-right">Planejado</TableHead>
                    <TableHead className="text-center"></TableHead>
                    <TableHead className="text-right">Realizado</TableHead>
                    <TableHead className="text-right">Variação</TableHead>
                    <TableHead>Alterações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comparisonData.map((row, idx) => {
                    const change = changesLog.find((c: any) => c.collaboratorId === row.collaboratorId);
                    return (
                      <TableRow key={idx} className={row.variance < 0 ? 'bg-red-50 dark:bg-red-950' : row.variance > 0 ? 'bg-green-50 dark:bg-green-950' : ''}>
                        <TableCell>{getCollaboratorName(row.collaboratorId)}</TableCell>
                        <TableCell>{getFunctionName(row.functionId)}</TableCell>
                        <TableCell className="text-right">{row.planned ? formatCurrency(row.planned.totalValue) : '-'}</TableCell>
                        <TableCell className="text-center">
                          <ArrowRight className="w-4 h-4 text-gray-400 mx-auto" />
                        </TableCell>
                        <TableCell className="text-right">{row.actual ? formatCurrency(row.actual.totalValue) : '-'}</TableCell>
                        <TableCell className="text-right">
                          <span className={`font-medium ${row.variance > 0 ? 'text-green-600' : row.variance < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                            {row.variance > 0 ? '+' : ''}{formatCurrency(row.variance)}
                          </span>
                        </TableCell>
                        <TableCell>
                          {row.actual?.changeReason && (
                            <span className="text-sm text-orange-600" title={row.actual.changeReason}>
                              {row.actual.changeReason.substring(0, 30)}...
                            </span>
                          )}
                          {change?.changes?.map((c: string, i: number) => (
                            <span key={i} className="block text-xs text-gray-500">{c}</span>
                          ))}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={!!actionModal} onOpenChange={() => { setActionModal(null); setActionNote(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionModal?.type === 'approve' ? 'Aprovar Comparativo' :
               actionModal?.type === 'reject' ? 'Rejeitar Comparativo' :
               'Devolver para Correção'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>
                {actionModal?.type === 'approve' ? 'Observação (opcional)' :
                 actionModal?.type === 'reject' ? 'Motivo da Recusa *' :
                 'Motivo da Devolução *'}
              </Label>
              <Textarea
                value={actionNote}
                onChange={e => setActionNote(e.target.value)}
                placeholder={
                  actionModal?.type === 'approve' ? 'Adicione uma observação se necessário...' :
                  actionModal?.type === 'reject' ? 'Informe o motivo da recusa...' :
                  'Informe o que precisa ser corrigido...'
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setActionModal(null); setActionNote(""); }}>Cancelar</Button>
            <Button
              onClick={handleAction}
              className={
                actionModal?.type === 'approve' ? 'bg-green-600 hover:bg-green-700' :
                actionModal?.type === 'reject' ? 'bg-red-600 hover:bg-red-700' :
                'bg-orange-600 hover:bg-orange-700'
              }
              disabled={approveMutation.isPending || rejectMutation.isPending || returnMutation.isPending}
            >
              {actionModal?.type === 'approve' ? 'Aprovar' :
               actionModal?.type === 'reject' ? 'Rejeitar' :
               'Devolver'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
