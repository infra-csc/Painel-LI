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
  AlertTriangle, Users, Calendar, Filter,
  ChevronRight, Eye, ArrowRight, ClipboardList,
  Send, CircleDot, Ban, ExternalLink
} from "lucide-react";
import type { Event, Function, Collaborator, BudgetActual, BudgetPlanned, User, TeamInclusion } from "@shared/schema";

type PrestacaoStatus =
  | "planejamento_pendente"
  | "aguardando_prestacao"
  | "prestacao_recebida"
  | "devolvida_para_ajuste"
  | "aprovada_faturamento"
  | "recusada"
  | "all";

interface PrestacaoItem {
  id: string;
  teamInclusion?: TeamInclusion;
  planned?: BudgetPlanned;
  actual?: BudgetActual;
  event: Event;
  collaboratorId?: string | null;
  functionId?: string | null;
  status: PrestacaoStatus;
  lastActivityDate: Date | null;
  responsavelAtual: string;
}

interface EventGroup {
  event: Event;
  items: PrestacaoItem[];
  actionNeeded: number;
}

const STATUS_ORDER: PrestacaoStatus[] = [
  "prestacao_recebida",
  "devolvida_para_ajuste",
  "planejamento_pendente",
  "aguardando_prestacao",
  "aprovada_faturamento",
  "recusada",
];

const STATUS_PRIORITY: Record<string, number> = {};
STATUS_ORDER.forEach((s, i) => { STATUS_PRIORITY[s] = i; });

function timeInStatus(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "há 1 dia";
  return `há ${diffD} dias`;
}

const CONCLUDED_STATUSES: PrestacaoStatus[] = ["aprovada_faturamento", "recusada"];
const ACTIONABLE_STATUSES: PrestacaoStatus[] = ["planejamento_pendente", "aguardando_prestacao", "prestacao_recebida", "devolvida_para_ajuste"];

export default function RhControlPage() {
  const [filterEvent, setFilterEvent] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<PrestacaoStatus>("all");
  const [filterFunction, setFilterFunction] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showConcluded, setShowConcluded] = useState(false);
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

  const resolveResponsavel = (id?: string | null): string => {
    if (!id) return "Responsável da função";
    return users?.find(u => u.id === id)?.name || "Responsável da função";
  };

  const prestacaoItems = useMemo((): PrestacaoItem[] => {
    if (!events) return [];
    const activeInclusions = (allTeamInclusions || []).filter(ti => !ti.deletedAt && ti.collaboratorId);
    const items: PrestacaoItem[] = [];
    const processedPlannedIds = new Set<string>();
    const seenKeys = new Set<string>();

    for (const ti of activeInclusions) {
      const event = events.find(e => e.id === ti.eventId);
      if (!event) continue;

      const matchingPlanned = allPlanned?.find(p =>
        p.eventId === ti.eventId &&
        p.collaboratorId === ti.collaboratorId &&
        p.functionId === ti.functionId
      );

      if (!matchingPlanned) {
        items.push({
          id: `ti-${ti.id}`,
          teamInclusion: ti,
          event,
          collaboratorId: ti.collaboratorId,
          functionId: ti.functionId,
          status: "planejamento_pendente",
          lastActivityDate: ti.createdAt ? new Date(ti.createdAt) : null,
          responsavelAtual: "RH",
        });
        continue;
      }

      const itemKey = `pl-${matchingPlanned.id}`;
      if (seenKeys.has(itemKey)) continue;
      seenKeys.add(itemKey);
      processedPlannedIds.add(matchingPlanned.id);

      const matchingActual = allActual?.find(a =>
        (a.plannedId === matchingPlanned.id) ||
        (a.collaboratorId === matchingPlanned.collaboratorId && a.functionId === matchingPlanned.functionId && a.eventId === matchingPlanned.eventId)
      ) || null;

      let status: PrestacaoStatus = "aguardando_prestacao";
      let responsavelAtual = "Responsável da função";
      let lastActivityDate: Date | null = matchingPlanned.updatedAt ? new Date(matchingPlanned.updatedAt) : null;

      if (matchingActual) {
        const rhStatus = matchingActual.rhStatus || "pendente";
        if (rhStatus === "aprovado") {
          status = "aprovada_faturamento";
          responsavelAtual = "Concluído";
          lastActivityDate = matchingActual.rhActionAt ? new Date(matchingActual.rhActionAt) : lastActivityDate;
        } else if (rhStatus === "rejeitado") {
          status = "recusada";
          responsavelAtual = "Concluído";
          lastActivityDate = matchingActual.rhActionAt ? new Date(matchingActual.rhActionAt) : lastActivityDate;
        } else if (rhStatus === "devolvido") {
          status = "devolvida_para_ajuste";
          lastActivityDate = matchingActual.rhActionAt ? new Date(matchingActual.rhActionAt) : lastActivityDate;
          responsavelAtual = resolveResponsavel(matchingActual.updatedBy || matchingPlanned.createdBy);
        } else if (matchingActual.sentForReview) {
          status = "prestacao_recebida";
          responsavelAtual = "RH";
          lastActivityDate = matchingActual.updatedAt ? new Date(matchingActual.updatedAt) : lastActivityDate;
        } else {
          status = "aguardando_prestacao";
          lastActivityDate = matchingActual.updatedAt ? new Date(matchingActual.updatedAt) : lastActivityDate;
          responsavelAtual = resolveResponsavel(matchingActual.updatedBy || matchingPlanned.createdBy);
        }
      } else {
        responsavelAtual = resolveResponsavel(matchingPlanned.createdBy);
      }

      items.push({
        id: itemKey,
        teamInclusion: ti,
        planned: matchingPlanned,
        actual: matchingActual || undefined,
        event,
        collaboratorId: matchingPlanned.collaboratorId,
        functionId: matchingPlanned.functionId,
        status,
        lastActivityDate,
        responsavelAtual,
      });
    }

    const orphanPlanned = (allPlanned || []).filter(p => !processedPlannedIds.has(p.id));
    for (const planned of orphanPlanned) {
      const event = events.find(e => e.id === planned.eventId);
      if (!event) continue;

      const itemKey = `pl-${planned.id}`;
      if (seenKeys.has(itemKey)) continue;
      seenKeys.add(itemKey);

      const matchingActual = allActual?.find(a =>
        (a.plannedId === planned.id) ||
        (a.collaboratorId === planned.collaboratorId && a.functionId === planned.functionId && a.eventId === planned.eventId)
      ) || null;

      let status: PrestacaoStatus = "aguardando_prestacao";
      let responsavelAtual = resolveResponsavel(planned.createdBy);
      let lastActivityDate: Date | null = planned.updatedAt ? new Date(planned.updatedAt) : null;

      if (matchingActual) {
        const rhStatus = matchingActual.rhStatus || "pendente";
        if (rhStatus === "aprovado") { status = "aprovada_faturamento"; responsavelAtual = "Concluído"; lastActivityDate = matchingActual.rhActionAt ? new Date(matchingActual.rhActionAt) : lastActivityDate; }
        else if (rhStatus === "rejeitado") { status = "recusada"; responsavelAtual = "Concluído"; lastActivityDate = matchingActual.rhActionAt ? new Date(matchingActual.rhActionAt) : lastActivityDate; }
        else if (rhStatus === "devolvido") { status = "devolvida_para_ajuste"; responsavelAtual = resolveResponsavel(matchingActual.updatedBy); lastActivityDate = matchingActual.rhActionAt ? new Date(matchingActual.rhActionAt) : lastActivityDate; }
        else if (matchingActual.sentForReview) { status = "prestacao_recebida"; responsavelAtual = "RH"; lastActivityDate = matchingActual.updatedAt ? new Date(matchingActual.updatedAt) : lastActivityDate; }
      }

      items.push({
        id: itemKey,
        planned,
        actual: matchingActual || undefined,
        event,
        collaboratorId: planned.collaboratorId,
        functionId: planned.functionId,
        status,
        lastActivityDate,
        responsavelAtual,
      });
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
  }, [allTeamInclusions, allPlanned, allActual, events, users]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    STATUS_ORDER.forEach(s => { counts[s] = 0; });
    prestacaoItems.forEach(item => { counts[item.status] = (counts[item.status] || 0) + 1; });
    return counts;
  }, [prestacaoItems]);

  const filteredItems = useMemo(() => {
    return prestacaoItems.filter(item => {
      if (filterStatus !== "all") {
        if (item.status !== filterStatus) return false;
      } else {
        if (!showConcluded && CONCLUDED_STATUSES.includes(item.status)) return false;
      }
      if (filterEvent !== "all" && item.event.id !== filterEvent) return false;
      if (filterFunction !== "all" && item.functionId !== filterFunction) return false;
      if (searchTerm) {
        const name = getCollaboratorName(item.collaboratorId).toLowerCase();
        if (!name.includes(searchTerm.toLowerCase())) return false;
      }
      return true;
    });
  }, [prestacaoItems, filterEvent, filterStatus, filterFunction, searchTerm, showConcluded, collaborators]);

  const eventGroups = useMemo((): EventGroup[] => {
    const map = new Map<string, EventGroup>();
    for (const item of filteredItems) {
      const eid = item.event.id;
      if (!map.has(eid)) {
        map.set(eid, { event: item.event, items: [], actionNeeded: 0 });
      }
      const g = map.get(eid)!;
      g.items.push(item);
      if (ACTIONABLE_STATUSES.includes(item.status)) g.actionNeeded++;
    }
    const groups = Array.from(map.values());
    groups.sort((a, b) => b.actionNeeded - a.actionNeeded);
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
    const ids = new Set(prestacaoItems.map(i => i.functionId).filter(Boolean));
    return Array.from(ids);
  }, [prestacaoItems]);

  const eventIdsWithInclusions = useMemo(() => {
    if (!allTeamInclusions) return new Set<string>();
    return new Set(allTeamInclusions.filter(ti => !ti.deletedAt).map(ti => ti.eventId));
  }, [allTeamInclusions]);

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

  const expandAllEvents = () => setExpandedEvents(new Set(eventGroups.map(g => g.event.id)));
  const collapseAllEvents = () => setExpandedEvents(new Set());

  const statusConfig: Record<PrestacaoStatus, {
    label: string; shortLabel: string; description: string;
    icon: any; color: string; bg: string; border: string;
    iconColor: string; badgeCls: string; cardBorder: string;
  }> = {
    planejamento_pendente: {
      label: "Planejamento pendente",
      shortLabel: "Plan. pendente",
      description: "Existe escalação, mas o RH ainda não criou o planejado",
      icon: ClipboardList,
      color: "text-amber-700 dark:text-amber-300",
      bg: "bg-amber-50 dark:bg-amber-950/30",
      border: "border-amber-200 dark:border-amber-800",
      iconColor: "text-amber-500",
      badgeCls: "bg-amber-100 text-amber-700 border-amber-200",
      cardBorder: "border-amber-200 dark:border-amber-800",
    },
    aguardando_prestacao: {
      label: "Aguardando prestação",
      shortLabel: "Aguardando",
      description: "Planejado criado — aguardando o responsável da função preencher a prestação de contas",
      icon: Clock,
      color: "text-slate-700 dark:text-slate-300",
      bg: "bg-slate-50 dark:bg-slate-900/40",
      border: "border-slate-200 dark:border-slate-700",
      iconColor: "text-slate-400",
      badgeCls: "bg-slate-100 text-slate-600 border-slate-200",
      cardBorder: "border-gray-200 dark:border-gray-700",
    },
    prestacao_recebida: {
      label: "Prestação recebida",
      shortLabel: "Recebida",
      description: "O responsável enviou a prestação de contas — aguardando análise do RH",
      icon: Send,
      color: "text-blue-700 dark:text-blue-300",
      bg: "bg-blue-50 dark:bg-blue-950/30",
      border: "border-blue-200 dark:border-blue-800",
      iconColor: "text-blue-500",
      badgeCls: "bg-blue-100 text-blue-700 border-blue-200",
      cardBorder: "border-blue-200 dark:border-blue-800 shadow-sm shadow-blue-100/50",
    },
    devolvida_para_ajuste: {
      label: "Devolvida para ajuste",
      shortLabel: "Devolvida",
      description: "O RH devolveu a prestação — aguardando o responsável da função corrigir e reenviar",
      icon: RotateCcw,
      color: "text-orange-700 dark:text-orange-300",
      bg: "bg-orange-50 dark:bg-orange-950/30",
      border: "border-orange-200 dark:border-orange-800",
      iconColor: "text-orange-500",
      badgeCls: "bg-orange-100 text-orange-700 border-orange-200",
      cardBorder: "border-orange-200 dark:border-orange-800",
    },
    aprovada_faturamento: {
      label: "Aprovada para faturamento",
      shortLabel: "Aprovada",
      description: "O RH aprovou esta prestação — pronta para faturamento",
      icon: CheckCircle,
      color: "text-emerald-700 dark:text-emerald-300",
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      border: "border-emerald-200 dark:border-emerald-800",
      iconColor: "text-emerald-500",
      badgeCls: "bg-emerald-100 text-emerald-700 border-emerald-200",
      cardBorder: "border-emerald-200 dark:border-emerald-800",
    },
    recusada: {
      label: "Recusada",
      shortLabel: "Recusada",
      description: "O RH recusou esta prestação — não será faturada",
      icon: Ban,
      color: "text-red-700 dark:text-red-300",
      bg: "bg-red-50 dark:bg-red-950/30",
      border: "border-red-200 dark:border-red-800",
      iconColor: "text-red-500",
      badgeCls: "bg-red-100 text-red-700 border-red-200",
      cardBorder: "border-red-200 dark:border-red-800",
    },
    all: {
      label: "Todos", shortLabel: "Todos", description: "",
      icon: Users, color: "text-gray-700", bg: "bg-gray-50",
      border: "border-gray-200", iconColor: "text-gray-400",
      badgeCls: "bg-gray-100 text-gray-600 border-gray-200",
      cardBorder: "border-gray-200",
    },
  };

  const hasActiveFilters = filterEvent !== "all" || filterFunction !== "all" || filterStatus !== "all" || searchTerm !== "";
  const rhActionCount = statusCounts.prestacao_recebida || 0;

  const getTimelineStep = (item: PrestacaoItem): number => {
    if (item.status === "planejamento_pendente") return 0;
    if (item.status === "aguardando_prestacao") return 1;
    if (item.status === "prestacao_recebida" || item.status === "devolvida_para_ajuste") return 2;
    return 3;
  };

  const renderTimeline = (item: PrestacaoItem) => {
    const step = getTimelineStep(item);
    const steps = [
      { label: "Escalação", color: "cyan", completed: "bg-cyan-600 border-cyan-600", current: "border-cyan-500 text-cyan-600", text: "text-cyan-600 dark:text-cyan-400", line: "bg-cyan-500" },
      { label: "Planejado", color: "blue", completed: "bg-blue-600 border-blue-600", current: "border-blue-500 text-blue-600", text: "text-blue-600 dark:text-blue-400", line: "bg-blue-500" },
      { label: "Prestação", color: "purple", completed: "bg-purple-600 border-purple-600", current: "border-purple-500 text-purple-600", text: "text-purple-600 dark:text-purple-400", line: "bg-purple-500" },
      { label: "Aprovação", color: "emerald", completed: "bg-emerald-600 border-emerald-600", current: "border-emerald-500 text-emerald-600", text: "text-emerald-600 dark:text-emerald-400", line: "bg-emerald-500" },
    ];
    return (
      <div className="flex items-center gap-0 w-full">
        {steps.map((s, i) => {
          const isCompleted = i < step;
          const isCurrent = i === step;
          const prevCompleted = i > 0 && i - 1 < step;
          return (
            <div key={s.label} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold border-2 ${
                  isCompleted ? `${s.completed} text-white` :
                  isCurrent ? `bg-white dark:bg-gray-800 ${s.current}` :
                  'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-400'
                }`}>
                  {isCompleted ? <CheckCircle className="w-3 h-3" /> : i + 1}
                </div>
                <span className={`text-[8px] font-medium whitespace-nowrap ${
                  isCompleted ? s.text :
                  isCurrent ? `${s.text} font-semibold` :
                  'text-gray-400'
                }`}>{s.label}</span>
              </div>
              {i < steps.length - 1 && (
                <div className={`h-0.5 flex-1 mx-1 ${
                  isCompleted ? s.line : 'bg-gray-200 dark:bg-gray-700'
                }`} />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const buildNavPath = (base: string, item: PrestacaoItem) => {
    const params = new URLSearchParams();
    params.set("event", item.event.id);
    if (item.collaboratorId) params.set("collaborator", item.collaboratorId);
    if (item.functionId) params.set("function", item.functionId);
    return `${base}?${params.toString()}`;
  };

  const getNavigationTarget = (item: PrestacaoItem): { label: string; path: string; icon: any } | null => {
    if (item.status === "planejamento_pendente") {
      return { label: "Ir para Planejado", path: buildNavPath("/budget-planned", item), icon: ArrowRight };
    }
    if (item.status === "prestacao_recebida" || item.status === "devolvida_para_ajuste") {
      return { label: "Analisar prestação", path: buildNavPath("/budget-actual", item), icon: Eye };
    }
    if (item.status === "aguardando_prestacao") {
      return { label: "Ver realizado", path: buildNavPath("/budget-actual", item), icon: ExternalLink };
    }
    if (item.status === "aprovada_faturamento" || item.status === "recusada") {
      return { label: "Ver detalhes", path: buildNavPath("/budget-actual", item), icon: ExternalLink };
    }
    return null;
  };

  const renderPrestacaoCard = (item: PrestacaoItem) => {
    const config = statusConfig[item.status];
    const isExpanded = expandedCards.has(item.id);
    const isResubmitted = item.actual?.resubmitted;
    const navTarget = getNavigationTarget(item);
    const needsRhAction = item.status === "prestacao_recebida";

    return (
      <div
        key={item.id}
        className={`rounded-lg border overflow-hidden transition-all bg-white dark:bg-gray-800 ${config.cardBorder}`}
      >
        <div
          className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-750 transition-colors ${
            needsRhAction ? 'bg-blue-50/30 dark:bg-blue-950/10' : ''
          }`}
          onClick={() => toggleExpand(item.id)}
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
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                  {item.collaboratorId ? getCollaboratorName(item.collaboratorId) : (item.planned?.collaboratorType === 'freela' ? 'Freela (a definir)' : '-')}
                </span>
                {item.planned?.collaboratorType && (
                  <span className={`text-[10px] font-medium ${item.planned.collaboratorType === 'casa' ? 'text-blue-500' : 'text-orange-500'}`}>
                    {item.planned.collaboratorType === 'casa' ? 'Casa' : 'Freela'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-gray-400">
                <span>{getFunctionName(item.functionId)}</span>
                <span className="text-gray-300">·</span>
                {item.responsavelAtual === "Concluído" ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-semibold text-[9px]">
                    <CheckCircle className="w-2.5 h-2.5" /> Concluído
                  </span>
                ) : item.responsavelAtual === "RH" ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-semibold text-[9px]">
                    <Clock className="w-2.5 h-2.5" /> Com o RH
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-semibold text-[9px]">
                    <Clock className="w-2.5 h-2.5" /> Com o Resp. Função
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right hidden sm:block">
              <span className="text-[9px] uppercase text-gray-400 tracking-wider block">Neste status</span>
              <span className={`text-[10px] font-medium ${
                item.lastActivityDate && (new Date().getTime() - item.lastActivityDate.getTime()) > 3 * 24 * 60 * 60 * 1000
                  ? 'text-red-500 font-semibold' :
                item.lastActivityDate && (new Date().getTime() - item.lastActivityDate.getTime()) > 24 * 60 * 60 * 1000
                  ? 'text-amber-600' : 'text-gray-500'
              }`}>
                {timeInStatus(item.lastActivityDate)}
              </span>
            </div>
            {needsRhAction && navTarget && (
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] h-7 px-3"
                onClick={(e) => { e.stopPropagation(); navigate(navTarget.path); }}
              >
                <Eye className="w-3 h-3 mr-1" /> Analisar
              </Button>
            )}
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

            <div className="py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700">
              {renderTimeline(item)}
            </div>

            {item.planned && (
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
                    <p className="text-[9px] uppercase text-purple-400 font-semibold tracking-wider mb-2">Prestação de contas</p>
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
                            <span className="text-[9px] uppercase text-gray-400 font-medium tracking-wider">Justificativa da divergência</span>
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
                      <p className="text-[10px] text-gray-400">Prestação não preenchida</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {item.actual?.rhComment && (
              <div className={`p-2.5 rounded-md border ${
                item.status === 'aprovada_faturamento' ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-800' :
                item.status === 'recusada' ? 'bg-red-50/60 dark:bg-red-950/20 border-red-100 dark:border-red-800' :
                'bg-orange-50/60 dark:bg-orange-950/20 border-orange-100 dark:border-orange-800'
              }`}>
                <div className="flex items-start gap-1.5">
                  <MessageSquare className={`w-3 h-3 mt-0.5 shrink-0 ${
                    item.status === 'aprovada_faturamento' ? 'text-emerald-400' :
                    item.status === 'recusada' ? 'text-red-400' : 'text-orange-400'
                  }`} />
                  <div>
                    <span className={`text-[9px] uppercase font-medium tracking-wider ${
                      item.status === 'aprovada_faturamento' ? 'text-emerald-500' :
                      item.status === 'recusada' ? 'text-red-500' : 'text-orange-500'
                    }`}>Comentário do RH</span>
                    <p className={`text-[10px] mt-0.5 ${
                      item.status === 'aprovada_faturamento' ? 'text-emerald-700 dark:text-emerald-300' :
                      item.status === 'recusada' ? 'text-red-700 dark:text-red-300' : 'text-orange-700 dark:text-orange-300'
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

            {item.status === "aprovada_faturamento" && item.actual?.rhActionAt && (
              <div className="flex items-center gap-2 text-[10px] text-emerald-600 pt-1">
                <CheckCircle className="w-3.5 h-3.5" />
                <span className="font-medium">Aprovada pelo RH para faturamento</span>
                <span className="text-gray-400">em {formatDateTime(item.actual.rhActionAt)}</span>
              </div>
            )}

            {navTarget && (
              <button
                onClick={() => navigate(navTarget.path)}
                className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-medium transition-colors ${
                  item.status === "planejamento_pendente"
                    ? "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                    : item.status === "prestacao_recebida"
                    ? "border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                    : "border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/30"
                }`}
              >
                <navTarget.icon className="w-3.5 h-3.5" />
                {navTarget.label}
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
            <h1 className="text-xl font-bold text-indigo-900 dark:text-indigo-100">Controle de Prestações de Contas</h1>
            <p className="text-sm text-gray-500">Fluxo: Escalação → Planejado → Prestação de Contas → Aprovação</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-2">
        {STATUS_ORDER.map(status => {
          const config = statusConfig[status];
          const count = statusCounts[status] || 0;
          const isActive = filterStatus === status;
          const needsRhAttention = status === "prestacao_recebida" || status === "planejamento_pendente";
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
              {needsRhAttention && count > 0 && !isActive && (
                <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              )}
              <div className="flex items-center justify-between mb-1">
                <config.icon className={`w-4 h-4 ${config.iconColor}`} />
                <span className={`text-2xl font-bold tabular-nums ${isActive ? config.color : 'text-gray-800 dark:text-gray-200'}`}>
                  {isLoading ? <span className="inline-block w-6 h-6 bg-gray-200 rounded animate-pulse" /> : count}
                </span>
              </div>
              <span className={`text-[9px] font-medium uppercase tracking-wider leading-tight block ${isActive ? config.color : 'text-gray-400'}`}>
                {config.shortLabel}
              </span>
            </button>
          );
        })}
      </div>

      {!isLoading && rhActionCount > 0 && filterStatus === "all" && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
          <Send className="w-4 h-4 text-blue-500 shrink-0" />
          <p className="text-sm text-blue-800 dark:text-blue-300">
            <span className="font-semibold">{rhActionCount} prestaç{rhActionCount === 1 ? 'ão' : 'ões'} aguardando sua análise</span>
          </p>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto text-blue-700 border-blue-300 hover:bg-blue-100 text-xs h-7"
            onClick={() => setFilterStatus("prestacao_recebida")}
          >
            Ver recebidas
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
            variant={showConcluded ? "default" : "outline"}
            size="sm"
            className={`h-8 text-xs gap-1.5 ${showConcluded ? 'bg-indigo-600 text-white' : ''}`}
            onClick={() => setShowConcluded(!showConcluded)}
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Concluídos
            {(statusCounts.aprovada_faturamento + statusCounts.recusada) > 0 && (
              <span className={`text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold ${
                showConcluded ? 'bg-white text-indigo-600' : 'bg-gray-200 text-gray-600'
              }`}>
                {statusCounts.aprovada_faturamento + statusCounts.recusada}
              </span>
            )}
          </Button>
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
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as PrestacaoStatus)}>
              <SelectTrigger className="h-8 text-xs w-52 border-gray-200">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="planejamento_pendente">Planejamento pendente</SelectItem>
                <SelectItem value="aguardando_prestacao">Aguardando prestação</SelectItem>
                <SelectItem value="prestacao_recebida">Prestação recebida</SelectItem>
                <SelectItem value="devolvida_para_ajuste">Devolvida para ajuste</SelectItem>
                <SelectItem value="aprovada_faturamento">Aprovada para faturamento</SelectItem>
                <SelectItem value="recusada">Recusada</SelectItem>
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
          <p className="text-gray-500 font-medium">Nenhuma prestação encontrada</p>
          <p className="text-sm text-gray-400 mt-1">
            {hasActiveFilters ? "Ajuste os filtros para ver mais resultados." :
             showConcluded ? "Nenhuma prestação concluída ainda." :
             "Todas as prestações estão em dia. Use o filtro 'Concluídos' para ver itens finalizados."}
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
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-500" />
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Por evento
              </h2>
              <span className="text-[10px] text-gray-400 font-medium">
                {eventGroups.length} evento{eventGroups.length !== 1 ? 's' : ''} · {filteredItems.length} prestaç{filteredItems.length === 1 ? 'ão' : 'ões'}
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
                      <p className="text-[10px] text-gray-400">{group.items.length} prestaç{group.items.length === 1 ? 'ão' : 'ões'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {group.actionNeeded > 0 && (
                      <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-[9px] font-semibold text-blue-700">
                        <CircleDot className="w-2.5 h-2.5" /> {group.actionNeeded} pendente{group.actionNeeded !== 1 ? 's' : ''}
                      </span>
                    )}
                    {(() => {
                      const statuses = group.items.reduce((acc, i) => {
                        acc[i.status] = (acc[i.status] || 0) + 1;
                        return acc;
                      }, {} as Record<string, number>);
                      return (
                        <div className="flex items-center gap-1">
                          {statuses.prestacao_recebida ? <span className="w-2 h-2 rounded-full bg-blue-500" title={`${statuses.prestacao_recebida} recebida(s)`} /> : null}
                          {statuses.planejamento_pendente ? <span className="w-2 h-2 rounded-full bg-amber-500" title={`${statuses.planejamento_pendente} plan. pendente`} /> : null}
                          {statuses.devolvida_para_ajuste ? <span className="w-2 h-2 rounded-full bg-orange-500" title={`${statuses.devolvida_para_ajuste} devolvida(s)`} /> : null}
                          {statuses.aguardando_prestacao ? <span className="w-2 h-2 rounded-full bg-slate-400" title={`${statuses.aguardando_prestacao} aguardando`} /> : null}
                          {statuses.aprovada_faturamento ? <span className="w-2 h-2 rounded-full bg-emerald-500" title={`${statuses.aprovada_faturamento} aprovada(s)`} /> : null}
                          {statuses.recusada ? <span className="w-2 h-2 rounded-full bg-red-500" title={`${statuses.recusada} recusada(s)`} /> : null}
                        </div>
                      );
                    })()}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 dark:border-gray-700 px-3 py-2 space-y-1.5 bg-gray-50/30 dark:bg-gray-900/20">
                    {group.items.map(item => renderPrestacaoCard(item))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
