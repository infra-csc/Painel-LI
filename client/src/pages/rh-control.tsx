import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import {
  Shield, Search, CheckCircle, XCircle, RotateCcw, Clock,
  FileText, ChevronDown, ChevronUp, MessageSquare,
  AlertTriangle, Users, Zap, Calendar, Filter,
  ChevronRight, Sparkles, ExternalLink, ArrowRight
} from "lucide-react";
import type { Event, Function, Collaborator, BudgetActual, BudgetPlanned, User, TeamInclusion } from "@shared/schema";

type ExecutionStatus = "aguardando_preenchimento" | "enviado_para_rh" | "devolvido_para_ajuste" | "aprovado_rh" | "recusado_rh" | "all";

interface ExecutionItem {
  planned: BudgetPlanned;
  actual: BudgetActual | null;
  event: Event;
  status: ExecutionStatus;
  lastActivityDate: Date | null;
  isRecent: boolean;
}

interface EventGroup {
  event: Event;
  items: ExecutionItem[];
  actionNeeded: number;
  recentCount: number;
}

const STATUS_PRIORITY: Record<string, number> = {
  enviado_para_rh: 0,
  devolvido_para_ajuste: 1,
  aguardando_preenchimento: 2,
  recusado_rh: 3,
  aprovado_rh: 4,
};

const RECENT_HOURS = 48;

function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Agora";
  if (diffMin < 60) return `${diffMin}min atrás`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h atrás`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "Ontem";
  if (diffD < 7) return `${diffD}d atrás`;
  return new Date(date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default function RhControlPage() {
  const [filterEvent, setFilterEvent] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<ExecutionStatus>("all");
  const [filterFunction, setFilterFunction] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const { data: events } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: functions } = useQuery<Function[]>({ queryKey: ["/api/functions"] });
  const { data: collaborators } = useQuery<Collaborator[]>({ queryKey: ["/api/collaborators"] });
  const { data: users } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: allTeamInclusions, isLoading: loadingInclusions } = useQuery<TeamInclusion[]>({
    queryKey: ["/api/team-inclusions"],
    queryFn: async () => {
      const res = await fetch("/api/team-inclusions", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
  const { data: allPlanned, isLoading: loadingPlanned } = useQuery<BudgetPlanned[]>({
    queryKey: ["/api/budget-planned"],
  });
  const { data: allActual, isLoading: loadingActual } = useQuery<BudgetActual[]>({
    queryKey: ["/api/budget-actual"],
  });

  const eventIdsWithInclusions = useMemo(() => {
    if (!allTeamInclusions) return new Set<string>();
    return new Set(allTeamInclusions.map(ti => ti.eventId));
  }, [allTeamInclusions]);

  const isLoading = loadingPlanned || loadingActual || loadingInclusions;

  const getCollaboratorName = (id?: string | null) =>
    id ? collaborators?.find(c => c.id === id)?.fullName || "-" : "-";

  const getFunctionName = (id?: string | null) =>
    id ? functions?.find(f => f.id === id)?.name || "-" : "-";

  const getUserName = (id?: string | null) =>
    id ? users?.find(u => u.id === id)?.name || "-" : "-";

  const fmt = (cents: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

  const formatDateTime = (d: Date | string | null | undefined) => {
    if (!d) return "-";
    const date = new Date(d);
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) + " " +
      date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  const executionItems = useMemo((): ExecutionItem[] => {
    if (!allPlanned || !events || eventIdsWithInclusions.size === 0) return [];
    const now = new Date();
    const recentThreshold = new Date(now.getTime() - RECENT_HOURS * 60 * 60 * 1000);
    const items: ExecutionItem[] = [];

    for (const planned of allPlanned) {
      if (!eventIdsWithInclusions.has(planned.eventId)) continue;
      const event = events.find(e => e.id === planned.eventId);
      if (!event) continue;

      const matchingActual = allActual?.find(a =>
        (a.plannedId === planned.id) ||
        (a.collaboratorId === planned.collaboratorId && a.functionId === planned.functionId && a.eventId === planned.eventId)
      ) || null;

      let status: ExecutionStatus = "aguardando_preenchimento";
      if (matchingActual) {
        const rhStatus = matchingActual.rhStatus || "pendente";
        if (rhStatus === "aprovado") status = "aprovado_rh";
        else if (rhStatus === "rejeitado") status = "recusado_rh";
        else if (rhStatus === "devolvido") status = "devolvido_para_ajuste";
        else if (matchingActual.sentForReview) status = "enviado_para_rh";
        else status = "aguardando_preenchimento";
      }

      const lastActivityDate = matchingActual?.rhActionAt
        ? new Date(matchingActual.rhActionAt)
        : matchingActual?.updatedAt
        ? new Date(matchingActual.updatedAt)
        : planned.updatedAt
        ? new Date(planned.updatedAt)
        : null;

      const isRecent = lastActivityDate ? lastActivityDate >= recentThreshold : false;

      items.push({ planned, actual: matchingActual, event, status, lastActivityDate, isRecent });
    }

    items.sort((a, b) => {
      const pa = STATUS_PRIORITY[a.status] ?? 99;
      const pb = STATUS_PRIORITY[b.status] ?? 99;
      if (pa !== pb) return pa - pb;
      const da = a.lastActivityDate?.getTime() ?? 0;
      const db = b.lastActivityDate?.getTime() ?? 0;
      return db - da;
    });

    return items;
  }, [allPlanned, allActual, events, eventIdsWithInclusions]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { aguardando_preenchimento: 0, enviado_para_rh: 0, devolvido_para_ajuste: 0, aprovado_rh: 0, recusado_rh: 0 };
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

  const recentItems = useMemo(() => {
    return filteredItems.filter(i => i.isRecent);
  }, [filteredItems]);

  const eventGroups = useMemo((): EventGroup[] => {
    const map = new Map<string, EventGroup>();
    for (const item of filteredItems) {
      const eid = item.event.id;
      if (!map.has(eid)) {
        map.set(eid, { event: item.event, items: [], actionNeeded: 0, recentCount: 0 });
      }
      const g = map.get(eid)!;
      g.items.push(item);
      if (item.status === "enviado_para_rh" || item.status === "devolvido_para_ajuste") g.actionNeeded++;
      if (item.isRecent) g.recentCount++;
    }
    const groups = Array.from(map.values());
    groups.sort((a, b) => b.actionNeeded - a.actionNeeded || b.recentCount - a.recentCount);
    return groups;
  }, [filteredItems]);

  const didAutoExpand = useRef(false);
  useEffect(() => {
    if (eventGroups.length > 0 && !didAutoExpand.current) {
      didAutoExpand.current = true;
      const toExpand = eventGroups.filter(g => g.actionNeeded > 0).map(g => g.event.id);
      if (toExpand.length > 0) {
        setExpandedEvents(new Set(toExpand));
      } else if (eventGroups.length <= 3) {
        setExpandedEvents(new Set(eventGroups.map(g => g.event.id)));
      }
    }
  }, [eventGroups]);

  const usedFunctionIds = useMemo(() => {
    const ids = new Set(executionItems.map(i => i.planned.functionId).filter(Boolean));
    return Array.from(ids);
  }, [executionItems]);

  const toggleExpand = (id: string) => {
    const next = new Set(expandedCards);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpandedCards(next);
  };

  const toggleEventExpand = (eventId: string) => {
    const next = new Set(expandedEvents);
    if (next.has(eventId)) next.delete(eventId); else next.add(eventId);
    setExpandedEvents(next);
  };

  const expandAllEvents = () => {
    setExpandedEvents(new Set(eventGroups.map(g => g.event.id)));
  };

  const collapseAllEvents = () => {
    setExpandedEvents(new Set());
  };

  const statusConfig: Record<ExecutionStatus, { label: string; shortLabel: string; description: string; actionPage: string; icon: any; color: string; bg: string; border: string; iconColor: string; badgeCls: string }> = {
    aguardando_preenchimento: {
      label: "Aguardando preenchimento",
      shortLabel: "Aguardando",
      description: "O responsável pela função precisa preencher os valores realizados na página Realizado",
      actionPage: "Realizado",
      icon: FileText,
      color: "text-slate-700 dark:text-slate-300",
      bg: "bg-slate-50 dark:bg-slate-900/40",
      border: "border-slate-200 dark:border-slate-700",
      iconColor: "text-slate-400",
      badgeCls: "bg-slate-100 text-slate-600 border-slate-200",
    },
    enviado_para_rh: {
      label: "Enviado para o RH",
      shortLabel: "No RH",
      description: "O responsável preencheu os valores e enviou para análise do RH",
      actionPage: "RH",
      icon: Clock,
      color: "text-blue-700 dark:text-blue-300",
      bg: "bg-blue-50 dark:bg-blue-950/30",
      border: "border-blue-200 dark:border-blue-800",
      iconColor: "text-blue-500",
      badgeCls: "bg-blue-100 text-blue-700 border-blue-200",
    },
    devolvido_para_ajuste: {
      label: "Devolvido pelo RH",
      shortLabel: "Devolvido",
      description: "O RH devolveu para correção — o responsável pela função precisa ajustar na página Realizado",
      actionPage: "Realizado",
      icon: RotateCcw,
      color: "text-orange-700 dark:text-orange-300",
      bg: "bg-orange-50 dark:bg-orange-950/30",
      border: "border-orange-200 dark:border-orange-800",
      iconColor: "text-orange-500",
      badgeCls: "bg-orange-100 text-orange-700 border-orange-200",
    },
    aprovado_rh: {
      label: "Aprovado pelo RH",
      shortLabel: "Aprovado",
      description: "O RH aprovou esta execução — pronto para faturamento",
      actionPage: "",
      icon: CheckCircle,
      color: "text-emerald-700 dark:text-emerald-300",
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      border: "border-emerald-200 dark:border-emerald-800",
      iconColor: "text-emerald-500",
      badgeCls: "bg-emerald-100 text-emerald-700 border-emerald-200",
    },
    recusado_rh: {
      label: "Recusado pelo RH",
      shortLabel: "Recusado",
      description: "O RH recusou esta execução — não será faturada",
      actionPage: "",
      icon: XCircle,
      color: "text-red-700 dark:text-red-300",
      bg: "bg-red-50 dark:bg-red-950/30",
      border: "border-red-200 dark:border-red-800",
      iconColor: "text-red-500",
      badgeCls: "bg-red-100 text-red-700 border-red-200",
    },
    all: {
      label: "Todos",
      shortLabel: "Todos",
      description: "",
      actionPage: "",
      icon: Users,
      color: "text-gray-700",
      bg: "bg-gray-50",
      border: "border-gray-200",
      iconColor: "text-gray-400",
      badgeCls: "bg-gray-100 text-gray-600 border-gray-200",
    },
  };

  const actionNeededTotal = statusCounts.enviado_para_rh + statusCounts.devolvido_para_ajuste;
  const hasActiveFilters = filterEvent !== "all" || filterFunction !== "all" || filterStatus !== "all" || searchTerm !== "";

  const handleCardClick = (item: ExecutionItem) => {
    navigate("/budget-actual");
  };

  const getActionHint = (item: ExecutionItem): string | null => {
    if (item.status === "aguardando_preenchimento") return "Ir para Realizado — preencher valores";
    if (item.status === "devolvido_para_ajuste") return "Ir para Realizado — corrigir valores";
    return null;
  };

  const renderExecutionCard = (item: ExecutionItem) => {
    const config = statusConfig[item.status];
    const isExpanded = expandedCards.has(item.planned.id);
    const isResubmitted = item.actual?.resubmitted;
    const actionHint = getActionHint(item);
    const isClickable = !!actionHint;

    return (
      <div
        key={item.planned.id}
        className={`rounded-lg border overflow-hidden transition-all bg-white dark:bg-gray-800 ${
          item.status === "enviado_para_rh" ? 'border-blue-200 dark:border-blue-800 shadow-sm shadow-blue-100/50' :
          item.status === "devolvido_para_ajuste" ? 'border-orange-200 dark:border-orange-800' :
          item.status === "aprovado_rh" ? 'border-emerald-200 dark:border-emerald-800' :
          item.status === "recusado_rh" ? 'border-red-200 dark:border-red-800' :
          'border-gray-200 dark:border-gray-700'
        }`}
      >
        <div
          className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-750 transition-colors"
          onClick={() => toggleExpand(item.planned.id)}
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap border ${config.badgeCls}`}>
              <config.icon className="w-3 h-3" />
              {config.shortLabel}
            </div>
            {isResubmitted && (
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 border border-violet-200 dark:border-violet-800 text-[9px] font-semibold text-violet-700 dark:text-violet-400">
                <RotateCcw className="w-2.5 h-2.5" /> Reenviado
              </span>
            )}
            {item.isRecent && (
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                <Sparkles className="w-2.5 h-2.5" /> Novo
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
                <span className="font-medium text-gray-500">{item.event.name}</span>
                <span className="text-gray-300">·</span>
                <span>{getFunctionName(item.planned.functionId)}</span>
                {item.actual?.updatedBy && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span>Resp: {getUserName(item.actual.updatedBy)}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right hidden sm:block">
              <span className="text-[9px] uppercase text-gray-400 tracking-wider block">Última atividade</span>
              <span className={`text-[10px] font-medium ${
                item.lastActivityDate && (new Date().getTime() - item.lastActivityDate.getTime()) < 24 * 60 * 60 * 1000
                  ? 'text-amber-600' : 'text-gray-500'
              }`}>
                {timeAgo(item.lastActivityDate)}
              </span>
            </div>
            {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </div>
        </div>

        {isExpanded && (
          <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3 space-y-3 bg-gray-50/50 dark:bg-gray-900/30">
            <div className={`flex items-start gap-2 p-2.5 rounded-lg border ${config.bg} ${config.border}`}>
              <config.icon className={`w-4 h-4 mt-0.5 shrink-0 ${config.iconColor}`} />
              <div>
                <p className={`text-xs font-semibold ${config.color}`}>{config.label}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{config.description}</p>
              </div>
            </div>

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
                item.status === 'aprovado_rh' ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-800' :
                item.status === 'recusado_rh' ? 'bg-red-50/60 dark:bg-red-950/20 border-red-100 dark:border-red-800' :
                'bg-orange-50/60 dark:bg-orange-950/20 border-orange-100 dark:border-orange-800'
              }`}>
                <div className="flex items-start gap-1.5">
                  <MessageSquare className={`w-3 h-3 mt-0.5 shrink-0 ${
                    item.status === 'aprovado_rh' ? 'text-emerald-400' :
                    item.status === 'recusado_rh' ? 'text-red-400' : 'text-orange-400'
                  }`} />
                  <div>
                    <span className={`text-[9px] uppercase font-medium tracking-wider ${
                      item.status === 'aprovado_rh' ? 'text-emerald-500' :
                      item.status === 'recusado_rh' ? 'text-red-500' : 'text-orange-500'
                    }`}>Comentário do RH</span>
                    <p className={`text-[10px] mt-0.5 ${
                      item.status === 'aprovado_rh' ? 'text-emerald-700 dark:text-emerald-300' :
                      item.status === 'recusado_rh' ? 'text-red-700 dark:text-red-300' : 'text-orange-700 dark:text-orange-300'
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

            {item.status === "aprovado_rh" && item.actual?.rhActionAt && (
              <div className="flex items-center gap-2 text-[10px] text-emerald-600 pt-1">
                <CheckCircle className="w-3.5 h-3.5" />
                <span className="font-medium">Aprovado pelo RH para faturamento</span>
                <span className="text-gray-400">em {formatDateTime(item.actual.rhActionAt)}</span>
              </div>
            )}

            {isClickable && (
              <button
                onClick={() => handleCardClick(item)}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-300 text-xs font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {actionHint}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto pb-24">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-100 dark:bg-indigo-900/40 p-2.5 rounded-lg">
            <Shield className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-indigo-900 dark:text-indigo-100">Controle de Execuções</h1>
            <p className="text-sm text-gray-500">Visão geral do andamento de todas as execuções</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3">
        {(["enviado_para_rh", "devolvido_para_ajuste", "aguardando_preenchimento", "aprovado_rh", "recusado_rh"] as ExecutionStatus[]).map(status => {
          const config = statusConfig[status];
          const count = statusCounts[status] || 0;
          const isActive = filterStatus === status;
          const needsAttention = status === "enviado_para_rh" || status === "devolvido_para_ajuste";
          return (
            <button
              key={status}
              onClick={() => setFilterStatus(isActive ? "all" : status)}
              className={`rounded-xl border-2 p-3 text-left transition-all relative ${
                isActive
                  ? `${config.bg} ${config.border} ring-2 ring-offset-1`
                  : `bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:border-gray-200`
              }`}
            >
              {needsAttention && count > 0 && !isActive && (
                <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              )}
              <div className="flex items-center justify-between mb-1">
                <config.icon className={`w-4 h-4 ${config.iconColor}`} />
                <span className={`text-2xl font-bold tabular-nums ${isActive ? config.color : 'text-gray-800 dark:text-gray-200'}`}>
                  {isLoading ? <span className="inline-block w-6 h-6 bg-gray-200 rounded animate-pulse" /> : count}
                </span>
              </div>
              <span className={`text-[10px] font-medium uppercase tracking-wider ${isActive ? config.color : 'text-gray-400'}`}>
                {config.shortLabel}
              </span>
            </button>
          );
        })}
      </div>

      {!isLoading && actionNeededTotal > 0 && filterStatus === "all" && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            <span className="font-semibold">{actionNeededTotal} execuç{actionNeededTotal === 1 ? 'ão precisa' : 'ões precisam'} de atenção</span>
            {" "}— {statusCounts.enviado_para_rh > 0 && <>{statusCounts.enviado_para_rh} enviada{statusCounts.enviado_para_rh !== 1 ? 's' : ''} para o RH</>}
            {statusCounts.enviado_para_rh > 0 && statusCounts.devolvido_para_ajuste > 0 && ", "}
            {statusCounts.devolvido_para_ajuste > 0 && <>{statusCounts.devolvido_para_ajuste} devolvida{statusCounts.devolvido_para_ajuste !== 1 ? 's' : ''} para ajuste</>}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto text-amber-700 border-amber-300 hover:bg-amber-100 text-xs h-7"
            onClick={() => setFilterStatus("enviado_para_rh")}
          >
            Ver pendentes
          </Button>
        </div>
      )}

      <div className="space-y-2">
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
          <Button
            variant="outline"
            size="sm"
            className={`h-8 text-xs gap-1.5 ${hasActiveFilters ? 'border-indigo-300 text-indigo-700 bg-indigo-50' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-3.5 h-3.5" />
            Filtros
            {hasActiveFilters && (
              <span className="bg-indigo-600 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                {[filterEvent !== "all", filterFunction !== "all", filterStatus !== "all"].filter(Boolean).length}
              </span>
            )}
          </Button>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-gray-400 hover:text-gray-600"
              onClick={() => { setFilterEvent("all"); setFilterFunction("all"); setFilterStatus("all"); setSearchTerm(""); }}
            >
              Limpar
            </Button>
          )}
        </div>

        {showFilters && (
          <div className="flex items-center gap-2 px-1">
            <Select value={filterEvent} onValueChange={setFilterEvent}>
              <SelectTrigger className="h-8 text-xs w-48 border-gray-200">
                <SelectValue placeholder="Evento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os eventos</SelectItem>
                {events?.filter(e => eventIdsWithInclusions.has(e.id)).map(e => (
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
              <SelectTrigger className="h-8 text-xs w-52 border-gray-200">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="aguardando_preenchimento">Aguardando preenchimento</SelectItem>
                <SelectItem value="enviado_para_rh">Enviado para o RH</SelectItem>
                <SelectItem value="devolvido_para_ajuste">Devolvido pelo RH</SelectItem>
                <SelectItem value="aprovado_rh">Aprovado pelo RH</SelectItem>
                <SelectItem value="recusado_rh">Recusado pelo RH</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white dark:bg-gray-800 p-6">
              <div className="animate-pulse space-y-3">
                <div className="h-4 bg-gray-200 rounded w-56"></div>
                <div className="h-3 bg-gray-100 rounded w-80"></div>
                <div className="flex gap-2">
                  <div className="h-6 bg-gray-100 rounded w-20"></div>
                  <div className="h-6 bg-gray-100 rounded w-16"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white dark:bg-gray-800 p-12 text-center">
          <Shield className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Nenhuma execução encontrada</p>
          <p className="text-sm text-gray-400 mt-1">
            {hasActiveFilters ? "Ajuste os filtros para ver mais resultados." : "Aguarde novas inclusões de orçamento."}
          </p>
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 text-xs"
              onClick={() => { setFilterEvent("all"); setFilterFunction("all"); setFilterStatus("all"); setSearchTerm(""); }}
            >
              Limpar filtros
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {recentItems.length > 0 && filterStatus === "all" && !hasActiveFilters && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  Execuções recentes
                </h2>
                <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full font-medium">
                  últimas {RECENT_HOURS}h
                </span>
                <span className="text-[10px] text-amber-600 font-semibold">
                  {recentItems.length} ite{recentItems.length === 1 ? 'm' : 'ns'}
                </span>
              </div>
              <div className="space-y-1.5">
                {recentItems.slice(0, 5).map(item => renderExecutionCard(item))}
                {recentItems.length > 5 && (
                  <p className="text-[10px] text-gray-400 text-center py-1">
                    +{recentItems.length - 5} execuç{recentItems.length - 5 === 1 ? 'ão' : 'ões'} recente{recentItems.length - 5 === 1 ? '' : 's'} abaixo nos eventos
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-500" />
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  Por evento
                </h2>
                <span className="text-[10px] text-gray-400 font-medium">
                  {eventGroups.length} evento{eventGroups.length !== 1 ? 's' : ''} · {filteredItems.length} execuç{filteredItems.length === 1 ? 'ão' : 'ões'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-6 text-[10px] text-gray-400" onClick={expandAllEvents}>
                  Expandir tudo
                </Button>
                <Button variant="ghost" size="sm" className="h-6 text-[10px] text-gray-400" onClick={collapseAllEvents}>
                  Recolher tudo
                </Button>
              </div>
            </div>

            {eventGroups.map(group => {
              const isOpen = expandedEvents.has(group.event.id);
              return (
                <div key={group.event.id} className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50/80 dark:hover:bg-gray-750 transition-colors"
                    onClick={() => toggleEventExpand(group.event.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                      <div className="text-left min-w-0">
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{group.event.name}</p>
                        <p className="text-[10px] text-gray-400">{group.items.length} execuç{group.items.length === 1 ? 'ão' : 'ões'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {group.recentCount > 0 && (
                        <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[9px] font-semibold text-amber-600">
                          <Sparkles className="w-2.5 h-2.5" /> {group.recentCount} nov{group.recentCount === 1 ? 'a' : 'as'}
                        </span>
                      )}
                      {group.actionNeeded > 0 && (
                        <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-[9px] font-semibold text-blue-700">
                          <Zap className="w-2.5 h-2.5" /> {group.actionNeeded} pendente{group.actionNeeded !== 1 ? 's' : ''}
                        </span>
                      )}
                      {(() => {
                        const statuses = group.items.reduce((acc, i) => {
                          acc[i.status] = (acc[i.status] || 0) + 1;
                          return acc;
                        }, {} as Record<string, number>);
                        return (
                          <div className="flex items-center gap-1">
                            {statuses.enviado_para_rh ? <span className="w-2 h-2 rounded-full bg-blue-500" title={`${statuses.enviado_para_rh} enviado para o RH`} /> : null}
                            {statuses.devolvido_para_ajuste ? <span className="w-2 h-2 rounded-full bg-orange-500" title={`${statuses.devolvido_para_ajuste} devolvido para ajuste`} /> : null}
                            {statuses.aprovado_rh ? <span className="w-2 h-2 rounded-full bg-emerald-500" title={`${statuses.aprovado_rh} aprovado pelo RH`} /> : null}
                            {statuses.recusado_rh ? <span className="w-2 h-2 rounded-full bg-red-500" title={`${statuses.recusado_rh} recusado pelo RH`} /> : null}
                            {statuses.aguardando_preenchimento ? <span className="w-2 h-2 rounded-full bg-slate-400" title={`${statuses.aguardando_preenchimento} aguardando preenchimento`} /> : null}
                          </div>
                        );
                      })()}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-gray-100 dark:border-gray-700 px-3 py-2 space-y-1.5 bg-gray-50/30 dark:bg-gray-900/20">
                      {group.items.map(item => renderExecutionCard(item))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
