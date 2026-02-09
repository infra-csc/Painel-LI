import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ClipboardCheck, Edit, Trash2, Copy, Calendar, Car, Utensils, Moon, Sun, Briefcase, ChevronDown, ChevronUp, ArrowRight, Search, ArrowUpDown, Users, DollarSign } from "lucide-react";
import type { Event, Function, Collaborator, BudgetActual, BudgetPlanned } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";

export default function BudgetActualPage() {
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [editingItem, setEditingItem] = useState<BudgetActual | null>(null);
  const [editFormData, setEditFormData] = useState<{
    dailyQuantity: number;
    dailyValue: number;
    weekdayLunch: number;
    weekdayDinner: number;
    weekendLunch: number;
    weekendDinner: number;
    mobility: number;
  } | null>(null);
  const [collapsedCards, setCollapsedCards] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<string>("value");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterFunction, setFilterFunction] = useState<string>("all");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: events } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: functions } = useQuery<Function[]>({ queryKey: ["/api/functions"] });
  const { data: collaborators } = useQuery<Collaborator[]>({ queryKey: ["/api/collaborators"] });
  const { data: budgetActual, isLoading } = useQuery<BudgetActual[]>({
    queryKey: ["/api/budget-actual", selectedEventId],
    queryFn: async () => {
      const url = selectedEventId ? `/api/budget-actual?eventId=${selectedEventId}` : "/api/budget-actual";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch budget actual");
      return res.json();
    },
    enabled: !!selectedEventId,
  });

  const { data: budgetPlanned } = useQuery<BudgetPlanned[]>({
    queryKey: ["/api/budget-planned", selectedEventId],
    queryFn: async () => {
      const res = await fetch(`/api/budget-planned?eventId=${selectedEventId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch budget planned");
      return res.json();
    },
    enabled: !!selectedEventId,
  });

  const getPlannedRef = (item: BudgetActual): BudgetPlanned | undefined => {
    if (!budgetPlanned) return undefined;
    if (item.plannedId) {
      const byId = budgetPlanned.find(p => p.id === item.plannedId);
      if (byId) return byId;
    }
    if (item.collaboratorId && item.functionId) {
      return budgetPlanned.find(p =>
        p.collaboratorId === item.collaboratorId &&
        p.functionId === item.functionId &&
        p.eventId === item.eventId
      );
    }
    if (item.collaboratorId) {
      return budgetPlanned.find(p =>
        p.collaboratorId === item.collaboratorId &&
        p.eventId === item.eventId
      );
    }
    return undefined;
  };

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/budget-actual/${id}`, {
        ...data,
        updatedBy: user?.id,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Execução atualizada" });
      qc.invalidateQueries({ queryKey: ["/api/budget-actual"] });
      setEditingItem(null);
      setEditFormData(null);
    },
    onError: () => {
      toast({ title: "Erro", description: "Erro ao atualizar execução", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/budget-actual/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Execução removida" });
      qc.invalidateQueries({ queryKey: ["/api/budget-actual"] });
      setConfirmDeleteId(null);
    },
    onError: () => {
      toast({ title: "Erro", description: "Erro ao remover execução", variant: "destructive" });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/budget-actual/${id}/duplicate`, { userId: user?.id });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Execução duplicada" });
      qc.invalidateQueries({ queryKey: ["/api/budget-actual"] });
    },
    onError: () => {
      toast({ title: "Erro", description: "Erro ao duplicar execução", variant: "destructive" });
    },
  });

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
  };

  const getCollaboratorName = (id?: string | null) => {
    if (!id) return "Não definido";
    return collaborators?.find(c => c.id === id)?.fullName || "Não definido";
  };

  const getFunctionName = (id?: string | null) => {
    if (!id) return "-";
    return functions?.find(f => f.id === id)?.name || "-";
  };

  const selectedEvent = events?.find(e => e.id === selectedEventId);

  const toggleCollapse = (id: string) => {
    setCollapsedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  const openEditModal = (item: BudgetActual) => {
    setEditingItem(item);
    setEditFormData({
      dailyQuantity: item.dailyQuantity,
      dailyValue: item.dailyValue,
      weekdayLunch: item.weekdayLunch,
      weekdayDinner: item.weekdayDinner,
      weekendLunch: item.weekendLunch,
      weekendDinner: item.weekendDinner,
      mobility: item.mobility,
    });
  };

  const saveEdit = () => {
    if (!editingItem || !editFormData) return;
    const totalValue = (editFormData.dailyQuantity * editFormData.dailyValue) +
      editFormData.weekdayLunch + editFormData.weekdayDinner +
      editFormData.weekendLunch + editFormData.weekendDinner +
      editFormData.mobility;
    updateMutation.mutate({
      id: editingItem.id,
      data: { ...editFormData, totalValue },
    });
  };

  const filteredItems = useMemo(() => {
    if (!budgetActual) return [];
    let items = [...budgetActual].filter(item => item.eventId === selectedEventId);

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      items = items.filter(item => {
        const name = getCollaboratorName(item.collaboratorId).toLowerCase();
        const fn = getFunctionName(item.functionId).toLowerCase();
        return name.includes(term) || fn.includes(term);
      });
    }

    if (filterType !== "all") {
      items = items.filter(item => item.collaboratorType === filterType);
    }

    if (filterFunction !== "all") {
      items = items.filter(item => item.functionId === filterFunction);
    }

    if (sortBy === "value") {
      items.sort((a, b) => b.totalValue - a.totalValue);
    } else if (sortBy === "name") {
      items.sort((a, b) => getCollaboratorName(a.collaboratorId).localeCompare(getCollaboratorName(b.collaboratorId)));
    }

    return items;
  }, [budgetActual, selectedEventId, searchTerm, filterType, filterFunction, sortBy, collaborators, functions]);

  const totalRealizado = filteredItems.reduce((sum, item) => sum + item.totalValue, 0);
  const totalCasa = filteredItems.filter(i => i.collaboratorType === 'casa').reduce((s, i) => s + i.totalValue, 0);
  const totalFreela = filteredItems.filter(i => i.collaboratorType === 'freela').reduce((s, i) => s + i.totalValue, 0);

  return (
    <div className="space-y-4 pb-24">
      {/* Header compacto */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <ClipboardCheck className="w-5 h-5 text-purple-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Orçamento Realizado</h1>
            <p className="text-xs text-gray-400 dark:text-gray-500">Registro da execução real — escalas enviadas do Planejado</p>
          </div>
        </div>
        {selectedEventId && filteredItems.length > 0 && (
          <Badge className="text-[10px] h-5 px-2.5 bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-50">
            Em preenchimento
          </Badge>
        )}
      </div>

      {/* Seletor de Evento */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block uppercase tracking-wider">Evento</label>
        <Select value={selectedEventId} onValueChange={v => { setSelectedEventId(v); setCollapsedCards(new Set()); }}>
          <SelectTrigger className="w-full md:w-96">
            <SelectValue placeholder="Selecione um evento para visualizar" />
          </SelectTrigger>
          <SelectContent>
            {events?.map(event => (
              <SelectItem key={event.id} value={event.id}>{event.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedEventId ? (
        <div className="text-center py-16">
          <ClipboardCheck className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">Selecione um evento</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Escolha um evento acima para ver as execuções realizadas</p>
        </div>
      ) : isLoading ? (
        <div className="text-center py-16 text-gray-500">Carregando...</div>
      ) : filteredItems.length === 0 && !searchTerm && filterType === "all" ? (
        /* Estado vazio */
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <ClipboardCheck className="w-16 h-16 text-gray-200 dark:text-gray-700 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">Nenhuma execução disponível</h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6 max-w-md mx-auto">
            Envie escalas do Planejado para iniciar o Realizado deste evento
          </p>
          <Link href="/budget-planned">
            <Button className="bg-blue-600 hover:bg-blue-700">
              <ArrowRight className="w-4 h-4 mr-2" />
              Ir para Planejado
            </Button>
          </Link>
        </div>
      ) : (
        <>
          {/* Banner do Total - saturação reduzida */}
          <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-xl px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-purple-500 text-[10px] font-medium uppercase tracking-wider mb-0.5">Total Realizado</div>
                <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">{formatCurrency(totalRealizado)}</div>
              </div>
              <div className="flex gap-5 text-xs">
                <div className="text-center">
                  <div className="text-gray-400 mb-0.5">Casa</div>
                  <div className="font-semibold text-gray-600 dark:text-gray-300">{formatCurrency(totalCasa)}</div>
                </div>
                <div className="text-center">
                  <div className="text-gray-400 mb-0.5">Freela</div>
                  <div className="font-semibold text-gray-600 dark:text-gray-300">{formatCurrency(totalFreela)}</div>
                </div>
                <div className="text-center">
                  <div className="text-gray-400 mb-0.5">Execuções</div>
                  <div className="font-semibold text-gray-600 dark:text-gray-300">{filteredItems.length}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Filtros padronizados */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <Input
                placeholder="Buscar colaborador..."
                className="pl-9 h-8 text-xs"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={filterFunction} onValueChange={setFilterFunction}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue placeholder="Função" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas funções</SelectItem>
                {functions?.map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-28 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="casa">Casa</SelectItem>
                <SelectItem value="freela">Freela</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <ArrowUpDown className="w-3 h-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="value">Ordenar: Maior valor</SelectItem>
                <SelectItem value="name">Ordenar: Nome A-Z</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-[11px] text-gray-400 ml-auto">
              {filteredItems.length} {filteredItems.length === 1 ? 'execução' : 'execuções'}
            </div>
          </div>

          {/* Cards de execução */}
          <div className="space-y-3.5">
            {filteredItems.map(item => {
              const isCollapsed = collapsedCards.has(item.id);
              const isCasa = item.collaboratorType === 'casa';
              const totalAlimentacao = item.weekdayLunch + item.weekdayDinner + item.weekendLunch + item.weekendDinner;
              const isFromPlanned = !!item.plannedId || item.observations?.includes('Enviado do planejado');
              const isDuplicated = item.observations?.includes('Duplicado no Realizado');

              const getStatusBadge = () => {
                if (isFromPlanned) {
                  return <Badge className="text-[10px] h-[18px] px-1.5 font-normal bg-green-50 text-green-600 border border-green-200 hover:bg-green-50">Enviado do Planejado</Badge>;
                }
                if (isDuplicated) {
                  return <Badge className="text-[10px] h-[18px] px-1.5 font-normal bg-purple-50 text-purple-600 border border-purple-200 hover:bg-purple-50">Duplicado</Badge>;
                }
                return <Badge className="text-[10px] h-[18px] px-1.5 font-normal bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-50">Criado no Realizado</Badge>;
              };

              return (
                <div key={item.id} className={`bg-white dark:bg-gray-800 rounded-lg border overflow-hidden ${
                  isCasa ? 'border-l-[3px] border-l-blue-400 border-gray-200 dark:border-gray-700' : 'border-l-[3px] border-l-orange-400 border-gray-200 dark:border-gray-700'
                }`}>
                  {/* Header do card */}
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                        {getCollaboratorName(item.collaboratorId)}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Badge variant="secondary" className="text-[10px] h-[18px] px-1.5 font-medium">
                          {getFunctionName(item.functionId)}
                        </Badge>
                        <Badge className={`text-[10px] h-[18px] px-1.5 font-medium ${
                          isCasa
                            ? 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-50'
                            : 'bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-50'
                        }`}>
                          {isCasa ? 'Casa' : 'Freela'}
                        </Badge>
                        {getStatusBadge()}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                        onClick={() => openEditModal(item)} title="Editar execução">
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-purple-500 hover:text-purple-700 hover:bg-purple-50"
                        onClick={() => duplicateMutation.mutate(item.id)} title="Duplicar escala"
                        disabled={duplicateMutation.isPending}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => setConfirmDeleteId(item.id)} title="Remover execução">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-gray-600"
                        onClick={() => toggleCollapse(item.id)} title={isCollapsed ? "Expandir" : "Recolher"}>
                        {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  </div>

                  {/* Corpo - grid organizado */}
                  {!isCollapsed && (
                    <div className="px-4 pb-2 text-sm">
                      <div className="grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-1 items-center">
                        <Calendar className="w-3 h-3 text-blue-400" />
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600 dark:text-gray-400">Diárias</span>
                          <span className="text-[11px] text-gray-400">{item.dailyQuantity} × {formatCurrency(item.dailyValue)}</span>
                        </div>
                        <span className="font-semibold text-gray-700 dark:text-gray-300 text-right tabular-nums">{formatCurrency(item.dailyQuantity * item.dailyValue)}</span>

                        <Car className="w-3 h-3 text-purple-400" />
                        <span className="text-gray-600 dark:text-gray-400">Mobilidade</span>
                        <span className="font-medium text-gray-600 dark:text-gray-400 text-right tabular-nums">{formatCurrency(item.mobility)}</span>

                        <Utensils className="w-3 h-3 text-orange-400" />
                        <span className="text-gray-600 dark:text-gray-400">Alimentação</span>
                        <span className="font-medium text-gray-600 dark:text-gray-400 text-right tabular-nums">{formatCurrency(totalAlimentacao)}</span>
                      </div>
                    </div>
                  )}

                  {/* Total - sempre visível */}
                  <div className="flex justify-between items-center px-4 py-2 border-t border-gray-100 dark:border-gray-700">
                    <span className="text-gray-400 text-[10px] uppercase tracking-wider font-medium">Total</span>
                    <span className="font-bold text-base text-purple-700 dark:text-purple-300 tabular-nums">{formatCurrency(item.totalValue)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Rodapé fixo */}
      {selectedEventId && filteredItems.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700 px-6 py-2.5 z-40">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-[10px] uppercase text-gray-400 font-medium tracking-wider">Total Realizado</div>
                <div className="text-lg font-bold text-purple-700 dark:text-purple-300 tabular-nums">{formatCurrency(totalRealizado)}</div>
              </div>
              <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />
              <div className="text-[11px] text-gray-400">
                {filteredItems.length} {filteredItems.length === 1 ? 'execução' : 'execuções'}
              </div>
            </div>
            <div className="text-[11px] text-gray-400">
              Valores podem ser alterados antes da revisão
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edição */}
      <Dialog open={!!editingItem && !!editFormData} onOpenChange={() => { setEditingItem(null); setEditFormData(null); }}>
        <DialogContent className="max-w-[680px] w-[95vw] p-0 gap-0 rounded-xl overflow-hidden border-0 shadow-xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Editar Execução Real</DialogTitle>
          </DialogHeader>

          {editingItem && editFormData && (() => {
            const modalTotal = (editFormData.dailyQuantity * editFormData.dailyValue) +
              editFormData.mobility + editFormData.weekdayLunch + editFormData.weekdayDinner +
              editFormData.weekendLunch + editFormData.weekendDinner;
            const totalAlimentacao = editFormData.weekdayLunch + editFormData.weekdayDinner + editFormData.weekendLunch + editFormData.weekendDinner;
            const isFromPlanned = !!editingItem.plannedId || editingItem.observations?.includes('Enviado do planejado');
            const planned = getPlannedRef(editingItem);
            const plannedDailySubtotal = planned ? planned.dailyQuantity * planned.dailyValue : 0;
            const plannedAlimentacao = planned ? planned.weekdayLunch + planned.weekdayDinner + planned.weekendLunch + planned.weekendDinner : 0;
            const plannedTotal = planned ? planned.totalValue : 0;
            const hasDivergence = planned && plannedTotal !== modalTotal;

            const PRef = ({ value }: { value: number }) => (
              <span className="text-[10px] text-gray-400 tabular-nums block mt-0.5">Planejado: {formatCurrency(value)}</span>
            );

            return (
              <>
                {/* Header compacto */}
                <div className="bg-white dark:bg-gray-800 px-6 py-3.5 border-b border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">{getCollaboratorName(editingItem.collaboratorId)}</h2>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Badge variant="secondary" className="text-[10px] h-[18px] px-1.5">{getFunctionName(editingItem.functionId)}</Badge>
                        <Badge className={`text-[10px] h-[18px] px-1.5 ${editingItem.collaboratorType === 'casa' ? 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-50' : 'bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-50'}`}>
                          {editingItem.collaboratorType === 'casa' ? 'Casa' : 'Freela'}
                        </Badge>
                        <Badge className={`text-[10px] h-[18px] px-1.5 font-normal ${isFromPlanned ? 'bg-green-50 text-green-600 border border-green-200 hover:bg-green-50' : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-50'}`}>
                          {isFromPlanned ? 'Enviado do Planejado' : 'Criado no Realizado'}
                        </Badge>
                      </div>
                    </div>
                    {planned && (
                      <Badge className={`text-[10px] h-[18px] px-2 font-normal ${hasDivergence ? 'bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-50' : 'bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-50'}`}>
                        {hasDivergence ? 'Difere do planejado' : 'Conforme planejado'}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2">
                    Execução real do evento — os valores planejados abaixo servem apenas como referência
                  </p>
                </div>

                {/* Corpo */}
                <div className="max-h-[56vh] overflow-y-auto px-6 py-5 space-y-5 bg-gray-50/80 dark:bg-gray-900">

                  {/* Diárias */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-blue-500" />
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Diárias</span>
                      </div>
                      {planned && (
                        <span className="text-[10px] text-gray-400 tabular-nums">
                          Planejado: {planned.dailyQuantity} × {formatCurrency(planned.dailyValue)} = {formatCurrency(plannedDailySubtotal)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-end gap-3">
                      <div className="flex-1">
                        <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1 block">Quantidade</label>
                        <Input
                          type="number" className="h-9 text-sm"
                          value={editFormData.dailyQuantity}
                          onChange={e => setEditFormData({...editFormData, dailyQuantity: parseInt(e.target.value) || 0})}
                        />
                        {planned && <span className="text-[10px] text-gray-400 block mt-0.5">Planejado: {planned.dailyQuantity}</span>}
                      </div>
                      <div className="text-gray-300 dark:text-gray-600 text-base pb-1.5">&times;</div>
                      <div className="flex-1">
                        <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1 block">Valor unitário (R$)</label>
                        <Input
                          type="number" step="0.01" className="h-9 text-sm"
                          value={(editFormData.dailyValue / 100).toFixed(2)}
                          onChange={e => setEditFormData({...editFormData, dailyValue: Math.round(parseFloat(e.target.value) * 100) || 0})}
                        />
                        {planned && <PRef value={planned.dailyValue} />}
                      </div>
                      <div className="text-gray-300 dark:text-gray-600 text-base pb-1.5">=</div>
                      <div className="bg-blue-50/80 dark:bg-blue-950/20 rounded-lg px-4 py-2 text-right min-w-[110px]">
                        <div className="text-lg font-bold text-blue-700 dark:text-blue-300 tabular-nums">{formatCurrency(editFormData.dailyQuantity * editFormData.dailyValue)}</div>
                        {planned && <div className="text-[10px] text-gray-400 tabular-nums">Plan. {formatCurrency(plannedDailySubtotal)}</div>}
                      </div>
                    </div>
                  </div>

                  {/* Mobilidade */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Car className="w-3.5 h-3.5 text-purple-500" />
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Mobilidade</span>
                      </div>
                      {planned && <span className="text-[10px] text-gray-400 tabular-nums">Planejado: {formatCurrency(planned.mobility)}</span>}
                    </div>
                    <div className="flex items-end gap-4">
                      <div className="flex-1">
                        <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1 block">Total do período (R$)</label>
                        <Input
                          type="number" step="0.01" className="h-9 text-sm"
                          value={(editFormData.mobility / 100).toFixed(2)}
                          onChange={e => setEditFormData({...editFormData, mobility: Math.round(parseFloat(e.target.value) * 100) || 0})}
                        />
                        {planned && <PRef value={planned.mobility} />}
                      </div>
                      <div className="flex-1">
                        <label className="text-[11px] text-gray-400 mb-1 block">Por dia</label>
                        <div className="h-9 flex items-center px-3 rounded-md bg-gray-50 dark:bg-gray-700/30 border border-gray-100 dark:border-gray-600 text-xs text-gray-400 tabular-nums">
                          {editFormData.dailyQuantity > 0 ? formatCurrency(Math.round(editFormData.mobility / editFormData.dailyQuantity)) : 'R$ 0,00'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Alimentação */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Utensils className="w-3.5 h-3.5 text-orange-400" />
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Alimentação</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {planned && <span className="text-[10px] text-gray-400 tabular-nums">Plan. {formatCurrency(plannedAlimentacao)}</span>}
                        <span className="text-xs font-bold text-orange-500 tabular-nums">{formatCurrency(totalAlimentacao)}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {/* Dias Úteis */}
                      <div className="bg-blue-50/30 dark:bg-blue-950/10 rounded-lg p-3 border border-blue-100/80 dark:border-blue-900/40">
                        <div className="flex items-center gap-1.5 mb-2.5">
                          <Briefcase className="w-3 h-3 text-blue-400" />
                          <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-300">Dias Úteis</span>
                        </div>
                        <div className="space-y-2.5">
                          <div>
                            <div className="flex items-center gap-1 mb-0.5">
                              <Sun className="w-2.5 h-2.5 text-amber-400" />
                              <label className="text-[10px] font-medium text-gray-500">Almoço (R$)</label>
                            </div>
                            <Input
                              type="number" step="0.01" className="h-8 text-xs"
                              value={(editFormData.weekdayLunch / 100).toFixed(2)}
                              onChange={e => setEditFormData({...editFormData, weekdayLunch: Math.round(parseFloat(e.target.value) * 100) || 0})}
                            />
                            {planned && <PRef value={planned.weekdayLunch} />}
                          </div>
                          <div>
                            <div className="flex items-center gap-1 mb-0.5">
                              <Moon className="w-2.5 h-2.5 text-indigo-400" />
                              <label className="text-[10px] font-medium text-gray-500">Jantar (R$)</label>
                            </div>
                            <Input
                              type="number" step="0.01" className="h-8 text-xs"
                              value={(editFormData.weekdayDinner / 100).toFixed(2)}
                              onChange={e => setEditFormData({...editFormData, weekdayDinner: Math.round(parseFloat(e.target.value) * 100) || 0})}
                            />
                            {planned && <PRef value={planned.weekdayDinner} />}
                          </div>
                        </div>
                        <div className="mt-2 pt-1.5 border-t border-blue-100/60 dark:border-blue-800/40 flex items-center justify-between">
                          <span className="text-[9px] text-blue-400 font-medium uppercase tracking-wider">Subtotal</span>
                          <div className="text-right">
                            <span className="text-[11px] font-bold text-blue-600 dark:text-blue-300 tabular-nums">{formatCurrency(editFormData.weekdayLunch + editFormData.weekdayDinner)}</span>
                            {planned && <div className="text-[9px] text-gray-400 tabular-nums">Plan. {formatCurrency(planned.weekdayLunch + planned.weekdayDinner)}</div>}
                          </div>
                        </div>
                      </div>

                      {/* Fins de Semana */}
                      <div className="bg-amber-50/30 dark:bg-amber-950/10 rounded-lg p-3 border border-amber-100/80 dark:border-amber-900/40">
                        <div className="flex items-center gap-1.5 mb-2.5">
                          <Sun className="w-3 h-3 text-amber-400" />
                          <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-300">Fins de Semana</span>
                        </div>
                        <div className="space-y-2.5">
                          <div>
                            <div className="flex items-center gap-1 mb-0.5">
                              <Sun className="w-2.5 h-2.5 text-amber-400" />
                              <label className="text-[10px] font-medium text-gray-500">Almoço (R$)</label>
                            </div>
                            <Input
                              type="number" step="0.01" className="h-8 text-xs"
                              value={(editFormData.weekendLunch / 100).toFixed(2)}
                              onChange={e => setEditFormData({...editFormData, weekendLunch: Math.round(parseFloat(e.target.value) * 100) || 0})}
                            />
                            {planned && <PRef value={planned.weekendLunch} />}
                          </div>
                          <div>
                            <div className="flex items-center gap-1 mb-0.5">
                              <Moon className="w-2.5 h-2.5 text-indigo-400" />
                              <label className="text-[10px] font-medium text-gray-500">Jantar (R$)</label>
                            </div>
                            <Input
                              type="number" step="0.01" className="h-8 text-xs"
                              value={(editFormData.weekendDinner / 100).toFixed(2)}
                              onChange={e => setEditFormData({...editFormData, weekendDinner: Math.round(parseFloat(e.target.value) * 100) || 0})}
                            />
                            {planned && <PRef value={planned.weekendDinner} />}
                          </div>
                        </div>
                        <div className="mt-2 pt-1.5 border-t border-amber-100/60 dark:border-amber-800/40 flex items-center justify-between">
                          <span className="text-[9px] text-amber-500 font-medium uppercase tracking-wider">Subtotal</span>
                          <div className="text-right">
                            <span className="text-[11px] font-bold text-amber-600 dark:text-amber-300 tabular-nums">{formatCurrency(editFormData.weekendLunch + editFormData.weekendDinner)}</span>
                            {planned && <div className="text-[9px] text-gray-400 tabular-nums">Plan. {formatCurrency(planned.weekendLunch + planned.weekendDinner)}</div>}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer fixo */}
                <div className="px-6 py-3.5 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] uppercase text-gray-400 font-medium tracking-wider mb-0.5">Total da execução</div>
                      <div className="text-2xl font-bold text-purple-700 dark:text-purple-300 tabular-nums">{formatCurrency(modalTotal)}</div>
                      {planned && <div className="text-[11px] text-gray-400 tabular-nums mt-0.5">Planejado: {formatCurrency(plannedTotal)}</div>}
                    </div>
                    <div className="flex gap-2.5">
                      <Button variant="outline" className="h-9 px-4 text-sm" onClick={() => { setEditingItem(null); setEditFormData(null); }}>Cancelar</Button>
                      <Button onClick={saveEdit} disabled={updateMutation.isPending} className="h-9 px-5 text-sm bg-purple-600 hover:bg-purple-700">
                        Salvar Alterações
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação de Exclusão */}
      <Dialog open={!!confirmDeleteId} onOpenChange={() => setConfirmDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar Remoção</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Tem certeza que deseja remover esta execução? Esta ação não pode ser desfeita.
          </p>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => confirmDeleteId && deleteMutation.mutate(confirmDeleteId)}
              disabled={deleteMutation.isPending}
            >
              Remover
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
