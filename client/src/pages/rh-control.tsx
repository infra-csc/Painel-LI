import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import {
  Shield, Search, CheckCircle, XCircle, RotateCcw, Clock,
  FileText, Eye, ChevronDown, ChevronUp, MessageSquare,
  Send, AlertTriangle, Users
} from "lucide-react";
import type { Event, Function, Collaborator, BudgetActual, BudgetPlanned, User } from "@shared/schema";

type ExecutionStatus = "aguardando" | "em_revisao" | "devolvido" | "aprovado" | "recusado" | "all";

interface ExecutionItem {
  planned: BudgetPlanned;
  actual: BudgetActual | null;
  event: Event;
  status: ExecutionStatus;
}

export default function RhControlPage() {
  const [filterEvent, setFilterEvent] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<ExecutionStatus>("all");
  const [filterFunction, setFilterFunction] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [actionModal, setActionModal] = useState<{ type: 'approve' | 'reject' | 'return'; item: ExecutionItem } | null>(null);
  const [actionNote, setActionNote] = useState("");
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: events } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: functions } = useQuery<Function[]>({ queryKey: ["/api/functions"] });
  const { data: collaborators } = useQuery<Collaborator[]>({ queryKey: ["/api/collaborators"] });
  const { data: users } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: allPlanned, isLoading: loadingPlanned } = useQuery<BudgetPlanned[]>({
    queryKey: ["/api/budget-planned"],
  });
  const { data: allActual, isLoading: loadingActual } = useQuery<BudgetActual[]>({
    queryKey: ["/api/budget-actual"],
  });

  const isLoading = loadingPlanned || loadingActual;

  const rhActionMutation = useMutation({
    mutationFn: async ({ itemIds, action, comment }: { itemIds: string[]; action: string; comment: string }) => {
      const res = await apiRequest("POST", `/api/budget-actual/rh-action`, {
        itemIds,
        action,
        comment,
        actionBy: user?.id,
      });
      return res.json();
    },
    onSuccess: (_, variables) => {
      const labels: Record<string, { title: string; cls: string }> = {
        aprovado: { title: "Aprovado para faturamento", cls: "bg-emerald-50 border-emerald-200 text-emerald-800" },
        rejeitado: { title: "Execução recusada", cls: "bg-red-50 border-red-200 text-red-800" },
        devolvido: { title: "Devolvido para ajustes", cls: "bg-amber-50 border-amber-200 text-amber-800" },
      };
      const info = labels[variables.action];
      toast({ title: info?.title || "Ação realizada", className: info?.cls });
      qc.invalidateQueries({ queryKey: ["/api/budget-actual"] });
      setActionModal(null);
      setActionNote("");
    },
  });

  const handleAction = () => {
    if (!actionModal) return;
    const actionMap: Record<string, string> = { approve: 'aprovado', reject: 'rejeitado', return: 'devolvido' };
    const rhAction = actionMap[actionModal.type];
    const actualId = actionModal.item.actual?.id;
    if (!actualId) return;
    rhActionMutation.mutate({ itemIds: [actualId], action: rhAction, comment: actionNote });
  };

  const getCollaboratorName = (id?: string | null) =>
    id ? collaborators?.find(c => c.id === id)?.fullName || "-" : "-";

  const getFunctionName = (id?: string | null) =>
    id ? functions?.find(f => f.id === id)?.name || "-" : "-";

  const getEventName = (id?: string | null) =>
    id ? events?.find(e => e.id === id)?.name || "-" : "-";

  const getUserName = (id?: string | null) =>
    id ? users?.find(u => u.id === id)?.name || "-" : "-";

  const fmt = (cents: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

  const executionItems = useMemo((): ExecutionItem[] => {
    if (!allPlanned || !events) return [];
    const items: ExecutionItem[] = [];

    for (const planned of allPlanned) {
      const event = events.find(e => e.id === planned.eventId);
      if (!event) continue;

      const matchingActual = allActual?.find(a =>
        (a.plannedId === planned.id) ||
        (a.collaboratorId === planned.collaboratorId && a.functionId === planned.functionId && a.eventId === planned.eventId)
      ) || null;

      let status: ExecutionStatus = "aguardando";
      if (matchingActual) {
        const rhStatus = matchingActual.rhStatus || "pendente";
        if (rhStatus === "aprovado") {
          status = "aprovado";
        } else if (rhStatus === "rejeitado") {
          status = "recusado";
        } else if (rhStatus === "devolvido") {
          status = "devolvido";
        } else if (matchingActual.sentForReview) {
          status = "em_revisao";
        } else {
          status = "aguardando";
        }
      }

      items.push({ planned, actual: matchingActual, event, status });
    }

    return items;
  }, [allPlanned, allActual, events]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { aguardando: 0, em_revisao: 0, devolvido: 0, aprovado: 0, recusado: 0 };
    executionItems.forEach(item => { counts[item.status] = (counts[item.status] || 0) + 1; });
    return counts;
  }, [executionItems]);

  const filteredItems = useMemo(() => {
    return executionItems.filter(item => {
      if (filterEvent !== "all" && item.planned.eventId !== filterEvent) return false;
      if (filterStatus !== "all" && item.status !== filterStatus) return false;
      if (filterFunction !== "all" && item.planned.functionId !== filterFunction) return false;
      if (searchTerm) {
        const name = getCollaboratorName(item.planned.collaboratorId).toLowerCase();
        if (!name.includes(searchTerm.toLowerCase())) return false;
      }
      return true;
    });
  }, [executionItems, filterEvent, filterStatus, filterFunction, searchTerm, collaborators]);

  const usedFunctionIds = useMemo(() => {
    const ids = new Set(executionItems.map(i => i.planned.functionId).filter(Boolean));
    return Array.from(ids);
  }, [executionItems]);

  const toggleExpand = (id: string) => {
    const next = new Set(expandedCards);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpandedCards(next);
  };

  const statusConfig: Record<ExecutionStatus, { label: string; icon: any; color: string; bg: string; border: string; iconColor: string }> = {
    aguardando: { label: "Aguardando realizado", icon: FileText, color: "text-slate-700 dark:text-slate-300", bg: "bg-slate-50 dark:bg-slate-900/40", border: "border-slate-200 dark:border-slate-700", iconColor: "text-slate-400" },
    em_revisao: { label: "Em revisão", icon: Clock, color: "text-blue-700 dark:text-blue-300", bg: "bg-blue-50 dark:bg-blue-950/30", border: "border-blue-200 dark:border-blue-800", iconColor: "text-blue-500" },
    devolvido: { label: "Devolvido", icon: RotateCcw, color: "text-orange-700 dark:text-orange-300", bg: "bg-orange-50 dark:bg-orange-950/30", border: "border-orange-200 dark:border-orange-800", iconColor: "text-orange-500" },
    aprovado: { label: "Aprovado", icon: CheckCircle, color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-950/30", border: "border-emerald-200 dark:border-emerald-800", iconColor: "text-emerald-500" },
    recusado: { label: "Recusado", icon: XCircle, color: "text-red-700 dark:text-red-300", bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-200 dark:border-red-800", iconColor: "text-red-500" },
    all: { label: "Todos", icon: Users, color: "text-gray-700", bg: "bg-gray-50", border: "border-gray-200", iconColor: "text-gray-400" },
  };

  const formatDateTime = (d: Date | string | null | undefined) => {
    if (!d) return "-";
    const date = new Date(d);
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) + " " +
      date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto pb-24">
      <div className="flex items-center gap-3">
        <div className="bg-indigo-100 dark:bg-indigo-900/40 p-2.5 rounded-lg">
          <Shield className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-indigo-900 dark:text-indigo-100">Controle de Execuções – RH</h1>
          <p className="text-sm text-gray-500">Acompanhamento do fluxo entre Planejado, Realizado e Aprovação</p>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3">
        {(["aguardando", "em_revisao", "devolvido", "aprovado", "recusado"] as ExecutionStatus[]).map(status => {
          const config = statusConfig[status];
          const count = statusCounts[status];
          const isActive = filterStatus === status;
          return (
            <button
              key={status}
              onClick={() => setFilterStatus(isActive ? "all" : status)}
              className={`rounded-xl border-2 p-3 text-left transition-all ${
                isActive
                  ? `${config.bg} ${config.border} ring-2 ring-offset-1 ring-${config.border.split('-')[1]}-300`
                  : `bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:border-gray-200`
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <config.icon className={`w-4 h-4 ${config.iconColor}`} />
                <span className={`text-2xl font-bold tabular-nums ${isActive ? config.color : 'text-gray-800 dark:text-gray-200'}`}>
                  {isLoading ? <span className="inline-block w-6 h-6 bg-gray-200 rounded animate-pulse" /> : count}
                </span>
              </div>
              <span className={`text-[10px] font-medium uppercase tracking-wider ${isActive ? config.color : 'text-gray-400'}`}>
                {config.label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <Input
            placeholder="Buscar por colaborador..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Select value={filterEvent} onValueChange={setFilterEvent}>
          <SelectTrigger className="h-8 text-xs w-48 border-gray-200">
            <SelectValue placeholder="Evento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os eventos</SelectItem>
            {events?.map(e => (
              <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterFunction} onValueChange={setFilterFunction}>
          <SelectTrigger className="h-8 text-xs w-40 border-gray-200">
            <SelectValue placeholder="Função" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as funções</SelectItem>
            {usedFunctionIds.map(fid => (
              <SelectItem key={fid} value={fid!}>{getFunctionName(fid)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as ExecutionStatus)}>
          <SelectTrigger className="h-8 text-xs w-44 border-gray-200">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="aguardando">Aguardando realizado</SelectItem>
            <SelectItem value="em_revisao">Em revisão</SelectItem>
            <SelectItem value="devolvido">Devolvido</SelectItem>
            <SelectItem value="aprovado">Aprovado</SelectItem>
            <SelectItem value="recusado">Recusado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white dark:bg-gray-800 p-12 text-center">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-gray-200 rounded w-48 mx-auto"></div>
            <div className="h-3 bg-gray-100 rounded w-64 mx-auto"></div>
          </div>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white dark:bg-gray-800 p-12 text-center">
          <Shield className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Nenhuma execução encontrada</p>
          <p className="text-sm text-gray-400 mt-1">Ajuste os filtros ou aguarde novas inclusões.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] text-gray-400">{filteredItems.length} execuç{filteredItems.length === 1 ? 'ão' : 'ões'}</p>
          {filteredItems.map(item => {
            const config = statusConfig[item.status];
            const isExpanded = expandedCards.has(item.planned.id);
            const isResubmitted = item.actual?.resubmitted;
            const lastActionDate = item.actual?.rhActionAt || item.actual?.updatedAt || item.planned.updatedAt;
            const lastActionBy = item.actual?.rhActionBy || item.actual?.updatedBy || item.planned.updatedBy;

            return (
              <div
                key={item.planned.id}
                className={`rounded-lg border overflow-hidden transition-all bg-white dark:bg-gray-800 ${
                  item.status === "em_revisao" ? 'border-blue-200 dark:border-blue-800' :
                  item.status === "devolvido" ? 'border-orange-200 dark:border-orange-800' :
                  item.status === "aprovado" ? 'border-emerald-200 dark:border-emerald-800' :
                  item.status === "recusado" ? 'border-red-200 dark:border-red-800' :
                  'border-gray-200 dark:border-gray-700'
                }`}
              >
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-750 transition-colors"
                  onClick={() => toggleExpand(item.planned.id)}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap border ${config.bg} ${config.border} ${config.color}`}>
                      <config.icon className={`w-3 h-3 ${config.iconColor}`} />
                      {config.label}
                    </div>
                    {isResubmitted && (
                      <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 border border-violet-200 dark:border-violet-800 text-[9px] font-semibold text-violet-700 dark:text-violet-400">
                        <RotateCcw className="w-2.5 h-2.5" /> Reenviado
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                          {getCollaboratorName(item.planned.collaboratorId)}
                        </span>
                        <span className={`text-[10px] font-medium ${item.planned.collaboratorType === 'casa' ? 'text-blue-500' : 'text-orange-500'}`}>
                          {item.planned.collaboratorType === 'casa' ? 'Casa' : 'Freela'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-gray-400">
                        <span className="font-medium text-gray-500">{getEventName(item.planned.eventId)}</span>
                        <span className="text-gray-300">·</span>
                        <span>{getFunctionName(item.planned.functionId)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right hidden sm:block">
                      <span className="text-[9px] uppercase text-gray-400 tracking-wider block">Última ação</span>
                      <span className="text-[10px] text-gray-500">{formatDateTime(lastActionDate)}</span>
                    </div>
                    <div className="text-right hidden sm:block">
                      <span className="text-[9px] uppercase text-gray-400 tracking-wider block">Por</span>
                      <span className="text-[10px] text-gray-500 truncate max-w-[100px] block">{getUserName(lastActionBy)}</span>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3 space-y-3 bg-gray-50/50 dark:bg-gray-900/30">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-lg border border-blue-100 dark:border-blue-900 bg-blue-50/30 dark:bg-blue-950/20 p-3">
                        <p className="text-[9px] uppercase text-blue-400 font-semibold tracking-wider mb-2">Planejado</p>
                        <div className="space-y-1 text-[11px]">
                          <div className="flex justify-between"><span className="text-gray-500">Diárias</span><span className="tabular-nums text-blue-700 dark:text-blue-300">{item.planned.dailyQuantity}x {fmt(item.planned.dailyValue)}</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">Alimentação</span><span className="tabular-nums text-blue-700 dark:text-blue-300">{fmt(item.planned.weekdayLunch + item.planned.weekdayDinner + item.planned.weekendLunch + item.planned.weekendDinner)}</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">Mobilidade</span><span className="tabular-nums text-blue-700 dark:text-blue-300">{fmt(item.planned.mobility + item.planned.transport)}</span></div>
                          <div className="flex justify-between border-t border-blue-100 dark:border-blue-800 pt-1 mt-1"><span className="font-semibold text-gray-600">Total</span><span className="font-bold tabular-nums text-blue-700 dark:text-blue-300">{fmt(item.planned.totalValue)}</span></div>
                        </div>
                      </div>

                      {item.actual ? (
                        <div className="rounded-lg border border-purple-100 dark:border-purple-900 bg-purple-50/30 dark:bg-purple-950/20 p-3">
                          <p className="text-[9px] uppercase text-purple-400 font-semibold tracking-wider mb-2">Realizado</p>
                          <div className="space-y-1 text-[11px]">
                            <div className="flex justify-between"><span className="text-gray-500">Diárias</span><span className="tabular-nums text-purple-700 dark:text-purple-300">{item.actual.dailyQuantity}x {fmt(item.actual.dailyValue)}</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">Alimentação</span><span className="tabular-nums text-purple-700 dark:text-purple-300">{fmt(item.actual.weekdayLunch + item.actual.weekdayDinner + item.actual.weekendLunch + item.actual.weekendDinner)}</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">Mobilidade</span><span className="tabular-nums text-purple-700 dark:text-purple-300">{fmt(item.actual.mobility + item.actual.transport)}</span></div>
                            <div className="flex justify-between border-t border-purple-100 dark:border-purple-800 pt-1 mt-1"><span className="font-semibold text-gray-600">Total</span><span className="font-bold tabular-nums text-purple-700 dark:text-purple-300">{fmt(item.actual.totalValue)}</span></div>
                          </div>
                          {item.actual.changeReason && (
                            <div className="mt-2 p-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                              <div className="flex items-start gap-1">
                                <MessageSquare className="w-3 h-3 text-gray-400 mt-0.5 shrink-0" />
                                <div>
                                  <span className="text-[9px] uppercase text-gray-400 font-medium tracking-wider">Justificativa</span>
                                  <p className="text-[10px] text-gray-600 dark:text-gray-300">{item.actual.changeReason}</p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20 p-3 flex items-center justify-center">
                          <div className="text-center">
                            <FileText className="w-6 h-6 text-gray-300 mx-auto mb-1" />
                            <p className="text-[10px] text-gray-400">Realizado não preenchido</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {item.actual?.rhComment && (
                      <div className={`p-2.5 rounded-md border ${
                        item.status === 'aprovado' ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-800' :
                        item.status === 'recusado' ? 'bg-red-50/60 dark:bg-red-950/20 border-red-100 dark:border-red-800' :
                        'bg-orange-50/60 dark:bg-orange-950/20 border-orange-100 dark:border-orange-800'
                      }`}>
                        <div className="flex items-start gap-1.5">
                          <MessageSquare className={`w-3 h-3 mt-0.5 shrink-0 ${
                            item.status === 'aprovado' ? 'text-emerald-400' :
                            item.status === 'recusado' ? 'text-red-400' : 'text-orange-400'
                          }`} />
                          <div>
                            <span className={`text-[9px] uppercase font-medium tracking-wider ${
                              item.status === 'aprovado' ? 'text-emerald-500' :
                              item.status === 'recusado' ? 'text-red-500' : 'text-orange-500'
                            }`}>Comentário do RH</span>
                            <p className={`text-[10px] mt-0.5 ${
                              item.status === 'aprovado' ? 'text-emerald-700 dark:text-emerald-300' :
                              item.status === 'recusado' ? 'text-red-700 dark:text-red-300' : 'text-orange-700 dark:text-orange-300'
                            }`}>{item.actual.rhComment}</p>
                            {item.actual.rhActionAt && (
                              <span className="text-[9px] text-gray-400 mt-1 block">
                                {formatDateTime(item.actual.rhActionAt)} — {getUserName(item.actual.rhActionBy)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {item.status === "em_revisao" && (
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 px-3"
                          onClick={(e) => { e.stopPropagation(); setActionModal({ type: 'approve', item }); }}
                        >
                          <CheckCircle className="w-3.5 h-3.5 mr-1" /> Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-orange-600 border-orange-300 hover:bg-orange-50 text-xs h-8 px-3"
                          onClick={(e) => { e.stopPropagation(); setActionModal({ type: 'return', item }); }}
                        >
                          <RotateCcw className="w-3.5 h-3.5 mr-1" /> Devolver
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-300 hover:bg-red-50 text-xs h-8 px-3"
                          onClick={(e) => { e.stopPropagation(); setActionModal({ type: 'reject', item }); }}
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1" /> Recusar
                        </Button>
                      </div>
                    )}

                    {item.status === "aprovado" && (
                      <div className="flex items-center gap-2 text-[10px] text-emerald-600 pt-1">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span className="font-medium">Aprovado para faturamento</span>
                        {item.actual?.rhActionAt && <span className="text-gray-400">em {formatDateTime(item.actual.rhActionAt)}</span>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!actionModal} onOpenChange={() => { setActionModal(null); setActionNote(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {actionModal?.type === 'approve' && <><CheckCircle className="w-5 h-5 text-emerald-600" /> Aprovar para Faturamento</>}
              {actionModal?.type === 'reject' && <><XCircle className="w-5 h-5 text-red-600" /> Recusar Execução</>}
              {actionModal?.type === 'return' && <><RotateCcw className="w-5 h-5 text-orange-600" /> Devolver para Ajustes</>}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {actionModal && (
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Execução</p>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  {getCollaboratorName(actionModal.item.planned.collaboratorId)}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {getEventName(actionModal.item.planned.eventId)} · {getFunctionName(actionModal.item.planned.functionId)}
                </p>
              </div>
            )}
            <div>
              <label className="text-sm text-gray-600 dark:text-gray-300">Comentário (opcional)</label>
              <p className="text-[10px] text-gray-400 mb-1.5">Este comentário será visível para o responsável pela função</p>
              <Textarea
                value={actionNote}
                onChange={e => setActionNote(e.target.value)}
                placeholder={
                  actionModal?.type === 'approve' ? 'Adicionar um comentário...' :
                  actionModal?.type === 'reject' ? 'Informe o motivo da recusa...' :
                  'Informe o que precisa ser corrigido...'
                }
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setActionModal(null); setActionNote(""); }}>Cancelar</Button>
            <Button
              onClick={handleAction}
              disabled={rhActionMutation.isPending}
              className={
                actionModal?.type === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' :
                actionModal?.type === 'reject' ? 'bg-red-600 hover:bg-red-700' :
                'bg-orange-600 hover:bg-orange-700'
              }
            >
              {rhActionMutation.isPending ? 'Processando...' :
                actionModal?.type === 'approve' ? 'Aprovar' :
                actionModal?.type === 'reject' ? 'Recusar' : 'Devolver'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
