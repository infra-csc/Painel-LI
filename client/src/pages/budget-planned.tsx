import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Calculator, Plus, Edit, Trash2, FileText, DollarSign } from "lucide-react";
import type { Event, Function, Collaborator, BudgetPlanned, FunctionValue } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";

export default function BudgetPlannedPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BudgetPlanned | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: events } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: functions } = useQuery<Function[]>({ queryKey: ["/api/functions"] });
  const { data: collaborators } = useQuery<Collaborator[]>({ queryKey: ["/api/collaborators"] });
  const { data: functionValues } = useQuery<FunctionValue[]>({ queryKey: ["/api/function-values"] });
  const { data: budgetPlanned, isLoading } = useQuery<BudgetPlanned[]>({
    queryKey: ["/api/budget-planned", selectedEventId],
    queryFn: async () => {
      const url = selectedEventId ? `/api/budget-planned?eventId=${selectedEventId}` : "/api/budget-planned";
      const res = await fetch(url);
      return res.json();
    },
  });

  const [formData, setFormData] = useState({
    eventId: "",
    collaboratorId: "",
    functionId: "",
    collaboratorType: "freela",
    dailyQuantity: 0,
    dailyValue: 0,
    costAssistance: 0,
    weekdayLunch: 0,
    weekdayDinner: 0,
    weekendLunch: 0,
    weekendDinner: 0,
    mobility: 0,
    transport: 0,
    observations: "",
  });

  const calculateTotal = () => {
    const dailyTotal = formData.dailyQuantity * formData.dailyValue;
    return dailyTotal + formData.costAssistance + formData.weekdayLunch + formData.weekdayDinner + 
           formData.weekendLunch + formData.weekendDinner + formData.mobility + formData.transport;
  };

  const applyFunctionValues = (functionId: string) => {
    const fv = functionValues?.find(v => v.functionId === functionId);
    if (fv) {
      setFormData(prev => ({
        ...prev,
        functionId,
        dailyValue: fv.dailyValue,
        costAssistance: fv.costAssistance,
        weekdayLunch: fv.weekdayLunch,
        weekdayDinner: fv.weekdayDinner,
        weekendLunch: fv.weekendLunch,
        weekendDinner: fv.weekendDinner,
        mobility: fv.mobility,
        transport: fv.transport,
      }));
    } else {
      setFormData(prev => ({ ...prev, functionId }));
    }
  };

  const applyCollaboratorType = (collaboratorId: string) => {
    const collab = collaborators?.find(c => c.id === collaboratorId);
    if (collab) {
      setFormData(prev => ({
        ...prev,
        collaboratorId,
        collaboratorType: collab.type,
      }));
    }
  };

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/budget-planned", {
        ...data,
        totalValue: calculateTotal(),
        createdBy: user?.id,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Planejamento criado com sucesso" });
      qc.invalidateQueries({ queryKey: ["/api/budget-planned"] });
      setIsModalOpen(false);
      resetForm();
    },
    onError: () => {
      toast({ title: "Erro", description: "Erro ao criar planejamento", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/budget-planned/${id}`, {
        ...data,
        totalValue: calculateTotal(),
        updatedBy: user?.id,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Planejamento atualizado com sucesso" });
      qc.invalidateQueries({ queryKey: ["/api/budget-planned"] });
      setIsModalOpen(false);
      resetForm();
    },
    onError: () => {
      toast({ title: "Erro", description: "Erro ao atualizar planejamento", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/budget-planned/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Planejamento excluído com sucesso" });
      qc.invalidateQueries({ queryKey: ["/api/budget-planned"] });
    },
    onError: () => {
      toast({ title: "Erro", description: "Erro ao excluir planejamento", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      eventId: selectedEventId || "",
      collaboratorId: "",
      functionId: "",
      collaboratorType: "freela",
      dailyQuantity: 0,
      dailyValue: 0,
      costAssistance: 0,
      weekdayLunch: 0,
      weekdayDinner: 0,
      weekendLunch: 0,
      weekendDinner: 0,
      mobility: 0,
      transport: 0,
      observations: "",
    });
    setEditingItem(null);
  };

  const openCreateModal = () => {
    resetForm();
    setFormData(prev => ({ ...prev, eventId: selectedEventId }));
    setIsModalOpen(true);
  };

  const openEditModal = (item: BudgetPlanned) => {
    setEditingItem(item);
    setFormData({
      eventId: item.eventId,
      collaboratorId: item.collaboratorId || "",
      functionId: item.functionId || "",
      collaboratorType: item.collaboratorType || "freela",
      dailyQuantity: item.dailyQuantity,
      dailyValue: item.dailyValue,
      costAssistance: item.costAssistance,
      weekdayLunch: item.weekdayLunch,
      weekdayDinner: item.weekdayDinner,
      weekendLunch: item.weekendLunch,
      weekendDinner: item.weekendDinner,
      mobility: item.mobility,
      transport: item.transport,
      observations: item.observations || "",
    });
    setIsModalOpen(true);
  };

  const handleSubmit = () => {
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
  };

  const groupedByEvent = useMemo(() => {
    if (!budgetPlanned || !events) return [];
    
    const grouped: Record<string, { event: Event; items: BudgetPlanned[]; total: number }> = {};
    
    budgetPlanned.forEach(item => {
      if (!grouped[item.eventId]) {
        const event = events.find(e => e.id === item.eventId);
        if (event) {
          grouped[item.eventId] = { event, items: [], total: 0 };
        }
      }
      if (grouped[item.eventId]) {
        grouped[item.eventId].items.push(item);
        grouped[item.eventId].total += item.totalValue;
      }
    });
    
    return Object.values(grouped);
  }, [budgetPlanned, events]);

  const getCollaboratorName = (id?: string | null) => {
    if (!id) return "-";
    return collaborators?.find(c => c.id === id)?.fullName || "-";
  };

  const getFunctionName = (id?: string | null) => {
    if (!id) return "-";
    return functions?.find(f => f.id === id)?.name || "-";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Planejado</h1>
          <p className="text-gray-500 dark:text-gray-400">Orçamento previsto por evento</p>
        </div>
        <Button onClick={openCreateModal} disabled={!selectedEventId}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Planejamento
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Filtrar por Evento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedEventId} onValueChange={setSelectedEventId}>
            <SelectTrigger className="w-full md:w-80">
              <SelectValue placeholder="Selecione um evento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os eventos</SelectItem>
              {events?.map(event => (
                <SelectItem key={event.id} value={event.id}>
                  {event.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-center py-8">Carregando...</div>
      ) : (
        groupedByEvent.map(({ event, items, total }) => (
          <Card key={event.id}>
            <CardHeader className="bg-blue-50 dark:bg-blue-950">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-blue-600" />
                  {event.name}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-green-600" />
                  <span className="text-lg font-bold text-green-600">{formatCurrency(total)}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Função</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Diárias</TableHead>
                    <TableHead className="text-right">Valor Diária</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map(item => (
                    <TableRow key={item.id}>
                      <TableCell>{getCollaboratorName(item.collaboratorId)}</TableCell>
                      <TableCell>{getFunctionName(item.functionId)}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded text-xs ${item.collaboratorType === 'casa' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                          {item.collaboratorType === 'casa' ? 'Casa' : 'Freela'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{item.dailyQuantity}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.dailyValue)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(item.totalValue)}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded text-xs ${
                          item.status === 'aprovado_rh' ? 'bg-green-100 text-green-800' :
                          item.status === 'rejeitado_rh' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {item.status === 'aprovado_rh' ? 'Aprovado' : item.status === 'rejeitado_rh' ? 'Rejeitado' : 'Pendente'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => openEditModal(item)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(item.id)}>
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Editar Planejamento" : "Novo Planejamento"}</DialogTitle>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Evento</Label>
              <Select value={formData.eventId} onValueChange={v => setFormData(p => ({ ...p, eventId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {events?.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Colaborador</Label>
              <Select value={formData.collaboratorId} onValueChange={applyCollaboratorType}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {collaborators?.filter(c => c.status === 'aprovado').map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Função</Label>
              <Select value={formData.functionId} onValueChange={applyFunctionValues}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione (aplica valores automáticos)" />
                </SelectTrigger>
                <SelectContent>
                  {functions?.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={formData.collaboratorType} onValueChange={v => setFormData(p => ({ ...p, collaboratorType: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="casa">Casa (só fds)</SelectItem>
                  <SelectItem value="freela">Freela (todos os dias)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Quantidade de Diárias</Label>
              <Input type="number" value={formData.dailyQuantity} onChange={e => setFormData(p => ({ ...p, dailyQuantity: parseInt(e.target.value) || 0 }))} />
            </div>

            <div className="space-y-2">
              <Label>Valor da Diária (R$)</Label>
              <Input type="number" step="0.01" value={formData.dailyValue / 100} onChange={e => setFormData(p => ({ ...p, dailyValue: Math.round(parseFloat(e.target.value) * 100) || 0 }))} />
            </div>

            <div className="space-y-2">
              <Label>Ajuda de Custo (R$)</Label>
              <Input type="number" step="0.01" value={formData.costAssistance / 100} onChange={e => setFormData(p => ({ ...p, costAssistance: Math.round(parseFloat(e.target.value) * 100) || 0 }))} />
            </div>

            <div className="space-y-2">
              <Label>Mobilidade (R$)</Label>
              <Input type="number" step="0.01" value={formData.mobility / 100} onChange={e => setFormData(p => ({ ...p, mobility: Math.round(parseFloat(e.target.value) * 100) || 0 }))} />
            </div>

            <div className="space-y-2">
              <Label>Translado (R$)</Label>
              <Input type="number" step="0.01" value={formData.transport / 100} onChange={e => setFormData(p => ({ ...p, transport: Math.round(parseFloat(e.target.value) * 100) || 0 }))} />
            </div>

            <div className="space-y-2">
              <Label>Almoço Semana (R$)</Label>
              <Input type="number" step="0.01" value={formData.weekdayLunch / 100} onChange={e => setFormData(p => ({ ...p, weekdayLunch: Math.round(parseFloat(e.target.value) * 100) || 0 }))} />
            </div>

            <div className="space-y-2">
              <Label>Jantar Semana (R$)</Label>
              <Input type="number" step="0.01" value={formData.weekdayDinner / 100} onChange={e => setFormData(p => ({ ...p, weekdayDinner: Math.round(parseFloat(e.target.value) * 100) || 0 }))} />
            </div>

            <div className="space-y-2">
              <Label>Almoço FDS (R$)</Label>
              <Input type="number" step="0.01" value={formData.weekendLunch / 100} onChange={e => setFormData(p => ({ ...p, weekendLunch: Math.round(parseFloat(e.target.value) * 100) || 0 }))} />
            </div>

            <div className="space-y-2">
              <Label>Jantar FDS (R$)</Label>
              <Input type="number" step="0.01" value={formData.weekendDinner / 100} onChange={e => setFormData(p => ({ ...p, weekendDinner: Math.round(parseFloat(e.target.value) * 100) || 0 }))} />
            </div>

            <div className="col-span-2 space-y-2">
              <Label>Observações</Label>
              <Textarea value={formData.observations} onChange={e => setFormData(p => ({ ...p, observations: e.target.value }))} />
            </div>
          </div>

          <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="font-medium">Total Calculado:</span>
              <span className="text-xl font-bold text-green-600">{formatCurrency(calculateTotal())}</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editingItem ? "Atualizar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
