import { useState, useMemo, useEffect, useRef } from "react";
import { formatDias } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import {
  Shield, Search, CheckCircle, XCircle, RotateCcw, Clock,
  FileText, ChevronDown, ChevronUp, MessageSquare,
  AlertTriangle, Users, Calendar, Filter,
  ChevronRight, Eye, ArrowRight, ClipboardList,
  Send, CircleDot, Ban, ExternalLink, TrendingDown, TrendingUp, Check
} from "lucide-react";

const RH_AVATAR_COLORS = [
  'bg-sky-500','bg-violet-500','bg-emerald-500','bg-orange-500',
  'bg-pink-500','bg-indigo-500','bg-amber-600','bg-teal-500','bg-rose-500','bg-cyan-500',
];
function avatarColorRh(name: string) {
  const idx = name.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % RH_AVATAR_COLORS.length;
  return RH_AVATAR_COLORS[idx];
}
function initialsRh(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}
import type { Event, Function, Collaborator, BudgetActual, BudgetPlanned, User, TeamInclusion } from "@shared/schema";

type PrestacaoStatus =
  | "planejamento_pendente"
  | "aguardando_prestacao"
  | "prestacao_recebida"
  | "devolvida_para_ajuste"
  | "aprovada_faturamento"
  | "recusada"
  | "all"
  | "rh_action";

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
  if (diffMin < 60) return `Há ${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Há ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "Há 1 dia";
  return `Há ${formatDias(diffD)}`;
}

type UrgencyLevel = "neutral" | "low" | "medium" | "critical";

function getUrgencyLevel(date: Date | string | null | undefined): UrgencyLevel {
  if (!date) return "neutral";
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffDays = diffMs / (24 * 60 * 60 * 1000);
  if (diffDays >= 7) return "critical";
  if (diffDays >= 3) return "medium";
  if (diffDays >= 1) return "low";
  return "neutral";
}

function getDiffDays(date: Date | string | null | undefined): number {
  if (!date) return 0;
  const now = new Date();
  const d = new Date(date);
  return (now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000);
}

const CONCLUDED_STATUSES: PrestacaoStatus[] = ["aprovada_faturamento", "recusada"];
const ACTIONABLE_STATUSES: PrestacaoStatus[] = ["planejamento_pendente", "aguardando_prestacao", "prestacao_recebida", "devolvida_para_ajuste"];

export default function RhControlPage() {
  const [filterEvent, setFilterEvent] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<PrestacaoStatus>("all");
  const [filterFunction, setFilterFunction] = useState<string>("all");
  const [filterCollaborator, setFilterCollaborator] = useState<string>("all");
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

  const RH_STATUSES: PrestacaoStatus[] = ["prestacao_recebida", "planejamento_pendente"];

  const filteredItems = useMemo(() => {
    return prestacaoItems.filter(item => {
      if (filterStatus === "rh_action") {
        if (!RH_STATUSES.includes(item.status)) return false;
      } else if (filterStatus !== "all") {
        if (item.status !== filterStatus) return false;
      } else {
        if (!showConcluded && CONCLUDED_STATUSES.includes(item.status)) return false;
      }
      if (filterEvent !== "all" && item.event.id !== filterEvent) return false;
      if (filterFunction !== "all" && item.functionId !== filterFunction) return false;
      if (filterCollaborator === "a_definir" && item.collaboratorId) return false;
      if (filterCollaborator === "definido" && !item.collaboratorId) return false;
      if (searchTerm) {
        const name = getCollaboratorName(item.collaboratorId).toLowerCase();
        if (!name.includes(searchTerm.toLowerCase())) return false;
      }
      return true;
    });
  }, [prestacaoItems, filterEvent, filterStatus, filterFunction, filterCollaborator, searchTerm, showConcluded, collaborators]);

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
    groups.sort((a, b) => {
      if (b.actionNeeded !== a.actionNeeded) return b.actionNeeded - a.actionNeeded;
      const maxStalledA = Math.max(...a.items.map(i => getDiffDays(i.lastActivityDate)), 0);
      const maxStalledB = Math.max(...b.items.map(i => getDiffDays(i.lastActivityDate)), 0);
      return maxStalledB - maxStalledA;
    });
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
    return Array.from(ids).sort((a, b) => {
      const nameA = getFunctionName(a).toLowerCase();
      const nameB = getFunctionName(b).toLowerCase();
      return nameA.localeCompare(nameB, 'pt-BR');
    });
  }, [prestacaoItems, functions]);

  const hasItemsWithoutCollaborator = useMemo(() => {
    return prestacaoItems.some(i => !i.collaboratorId);
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
      label: "Aguardando planejamento",
      shortLabel: "Planejamento",
      description: "Escalação confirmada — RH precisa criar o planejamento de valores",
      icon: ClipboardList,
      color: "text-amber-700 dark:text-amber-300",
      bg: "bg-amber-50 dark:bg-amber-950/30",
      border: "border-amber-200 dark:border-amber-800",
      iconColor: "text-amber-500",
      badgeCls: "bg-amber-100 text-amber-700 border-amber-200",
      cardBorder: "border-amber-200 dark:border-amber-800",
    },
    aguardando_prestacao: {
      label: "Aguardando realizado",
      shortLabel: "Realizado",
      description: "Planejado criado — aguardando o responsável da função preencher o realizado",
      icon: Clock,
      color: "text-slate-700 dark:text-slate-300",
      bg: "bg-slate-50 dark:bg-slate-900/40",
      border: "border-slate-200 dark:border-slate-700",
      iconColor: "text-slate-400",
      badgeCls: "bg-slate-100 text-slate-600 border-slate-200",
      cardBorder: "border-gray-200 dark:border-gray-700",
    },
    prestacao_recebida: {
      label: "Análise pendente",
      shortLabel: "Comparativo",
      description: "Realizado recebido — RH precisa analisar o comparativo para aprovar ou recusar",
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
      description: "O RH devolveu o realizado — aguardando o responsável da função corrigir e reenviar",
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
      description: "O RH aprovou — pronta para faturamento",
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
      description: "O RH recusou — não será faturada",
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
    rh_action: {
      label: "Pendências do RH", shortLabel: "Pendências RH", description: "",
      icon: Shield, color: "text-blue-700", bg: "bg-blue-50",
      border: "border-blue-200", iconColor: "text-blue-500",
      badgeCls: "bg-blue-100 text-blue-700 border-blue-200",
      cardBorder: "border-blue-200",
    },
  };

  const hasActiveFilters = filterEvent !== "all" || filterFunction !== "all" || filterCollaborator !== "all" || (filterStatus !== "all" && filterStatus !== "rh_action") || searchTerm !== "";
  const isRhFilterActive = filterStatus === "rh_action";
  const rhReceivedCount = statusCounts.prestacao_recebida || 0;
  const rhPlanPendingCount = statusCounts.planejamento_pendente || 0;
  const rhActionCount = rhReceivedCount + rhPlanPendingCount;

  const getTimelineStep = (item: PrestacaoItem): number => {
    if (item.status === "planejamento_pendente") return 0;
    if (item.status === "aguardando_prestacao") return 1;
    if (item.status === "prestacao_recebida" || item.status === "devolvida_para_ajuste") return 2;
    return 3;
  };

  const getStepDate = (item: PrestacaoItem, stepIndex: number): string | null => {
    if (stepIndex === 0 && item.teamInclusion?.createdAt) {
      return new Date(item.teamInclusion.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    }
    if (stepIndex === 1 && item.planned?.createdAt) {
      return new Date(item.planned.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    }
    if (stepIndex === 2 && item.actual?.updatedAt) {
      return new Date(item.actual.updatedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    }
    if (stepIndex === 3 && item.actual?.rhActionAt) {
      return new Date(item.actual.rhActionAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    }
    return null;
  };

  const getStepResponsible = (item: PrestacaoItem, stepIndex: number): string | null => {
    if (stepIndex === 0 && item.teamInclusion?.updatedBy) {
      const name = getUserName(item.teamInclusion.updatedBy);
      return name !== "-" ? name : null;
    }
    if (stepIndex === 1 && item.planned?.createdBy) {
      const name = getUserName(item.planned.createdBy);
      return name !== "-" ? name : null;
    }
    if (stepIndex === 2 && item.actual) {
      const name = getUserName(item.actual.createdBy || item.actual.updatedBy);
      return name !== "-" ? name : null;
    }
    if (stepIndex === 3 && item.actual?.rhActionBy) {
      const name = getUserName(item.actual.rhActionBy);
      return name !== "-" ? name : null;
    }
    return null;
  };

  const STEP_TOOLTIPS = [
    "Equipe definida e confirmada para o evento",
    "Valores planejados pelo RH",
    "Valores realizados preenchidos pelo responsável da função",
    "Análise final do RH para liberação de pagamento",
  ];

  const renderTimeline = (item: PrestacaoItem) => {
    const step = getTimelineStep(item);
    const isConcluded = item.status === "aprovada_faturamento" || item.status === "recusada";
    const steps = [
      { label: "Escalação", color: "bg-cyan-500", text: "text-cyan-600 dark:text-cyan-400", line: "bg-cyan-400" },
      { label: "Planejado", color: "bg-blue-500", text: "text-blue-600 dark:text-blue-400", line: "bg-blue-400" },
      { label: "Realizado", color: "bg-purple-500", text: "text-purple-600 dark:text-purple-400", line: "bg-purple-400" },
      { label: "Aprovação", color: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", line: "bg-emerald-400" },
    ];
    return (
      <TooltipProvider delayDuration={200}>
        <div className="flex items-start gap-0 w-full">
          {steps.map((s, i) => {
            const isCompleted = isConcluded ? true : i < step;
            const isCurrent = !isConcluded && i === step;
            const isFuture = !isCompleted && !isCurrent;
            const dateStr = getStepDate(item, i);
            const responsibleName = getStepResponsible(item, i);
            return (
              <div key={s.label} className="flex items-start flex-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex flex-col items-center gap-0 flex-shrink-0 min-w-[56px] cursor-default">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                        isCompleted ? `${s.color} shadow-sm` :
                        isCurrent ? `border-2 border-current ${s.text} bg-white dark:bg-gray-800 shadow-sm` :
                        'bg-gray-200 dark:bg-gray-700'
                      }`}>
                        {isCompleted && <CheckCircle className="w-3 h-3 text-white" />}
                        {isCurrent && <CircleDot className="w-3 h-3" />}
                      </div>
                      <span className={`text-[9px] font-semibold whitespace-nowrap mt-1 ${
                        isCompleted || isCurrent ? s.text : 'text-gray-300 dark:text-gray-500'
                      }`}>{s.label}</span>
                      {(isCompleted || isCurrent) && dateStr ? (
                        <span className="text-[8px] text-gray-400 dark:text-gray-500 whitespace-nowrap">{dateStr}</span>
                      ) : isFuture ? (
                        <span className="text-[8px] text-gray-300 dark:text-gray-600 whitespace-nowrap italic">Pendente</span>
                      ) : null}
                      {(isCompleted || isCurrent) && responsibleName ? (
                        <span className="text-[8px] text-gray-500 dark:text-gray-400 whitespace-nowrap mt-0.5 max-w-[80px] truncate">
                          {responsibleName}
                        </span>
                      ) : null}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-[200px]">
                    <p className="font-semibold">{s.label}</p>
                    <p className="text-gray-400">{STEP_TOOLTIPS[i]}</p>
                  </TooltipContent>
                </Tooltip>
                {i < steps.length - 1 && (
                  <div className={`h-0.5 flex-1 mx-0.5 mt-2.5 rounded-full transition-all ${
                    isCompleted ? s.line : 'bg-gray-200 dark:bg-gray-700'
                  }`} />
                )}
              </div>
            );
          })}
        </div>
      </TooltipProvider>
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
    if (item.status === "prestacao_recebida") {
      return { label: "Analisar comparativo", path: buildNavPath("/budget-comparison", item), icon: Eye };
    }
    if (item.status === "devolvida_para_ajuste") {
      return { label: "Ver realizado", path: buildNavPath("/budget-actual", item), icon: ExternalLink };
    }
    if (item.status === "aguardando_prestacao") {
      return { label: "Ver planejado", path: buildNavPath("/budget-planned", item), icon: ExternalLink };
    }
    if (item.status === "aprovada_faturamento" || item.status === "recusada") {
      return { label: "Ver detalhes", path: buildNavPath("/budget-comparison", item), icon: ExternalLink };
    }
    return null;
  };

  const getLeftBorderStyle = (item: PrestacaoItem): { border: string; bg: string } => {
    if (CONCLUDED_STATUSES.includes(item.status)) {
      if (item.status === "aprovada_faturamento") return { border: "border-l-4 border-l-emerald-400", bg: "" };
      return { border: "border-l-4 border-l-red-400", bg: "" };
    }
    const days = getDiffDays(item.lastActivityDate);
    if (days > 30) return { border: "border-l-4 border-l-red-500", bg: "bg-red-50/20 dark:bg-red-950/10" };
    if (days > 7)  return { border: "border-l-4 border-l-amber-400", bg: "bg-amber-50/20 dark:bg-amber-950/10" };
    if (days > 0)  return { border: "border-l-4 border-l-sky-400", bg: "" };
    return { border: "border-l-4 border-l-gray-200 dark:border-l-gray-700", bg: "" };
  };

  const renderPrestacaoCard = (item: PrestacaoItem) => {
    const config = statusConfig[item.status];
    const isExpanded = expandedCards.has(item.id);
    const isResubmitted = item.actual?.resubmitted;
    const navTarget = getNavigationTarget(item);
    const needsRhAction = item.status === "prestacao_recebida" || item.status === "planejamento_pendente";
    const days = getDiffDays(item.lastActivityDate);
    const borderStyle = getLeftBorderStyle(item);
    const colName = item.collaboratorId ? getCollaboratorName(item.collaboratorId) : 'A Definir';

    return (
      <div
        key={item.id}
        className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm hover:shadow transition-shadow"
      >
        {/* Card row */}
        <div
          className="flex items-center gap-3 px-4 py-3 cursor-pointer"
          onClick={() => toggleExpand(item.id)}
        >
          {/* Avatar */}
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 ${avatarColorRh(colName)}`}>
            {initialsRh(colName)}
          </div>

          {/* Name + meta */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{colName}</span>
              {isResubmitted && (
                <span className="text-[9px] text-slate-400 font-medium">· Reenviado</span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 truncate mt-0.5">
              {item.event.name} · {getFunctionName(item.functionId)}
              {item.planned?.collaboratorType && (
                <span className="ml-1 text-slate-300">· {item.planned.collaboratorType === 'casa' ? 'Casa' : 'Freela'}</span>
              )}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${config.badgeCls}`}>
                {config.shortLabel}
              </span>
              {days > 30 ? (
                <span className="text-[10px] font-semibold text-red-500 flex items-center gap-0.5">
                  <AlertTriangle className="w-2.5 h-2.5" /> {timeInStatus(item.lastActivityDate)}
                </span>
              ) : (
                <span className="text-[10px] text-slate-400">{timeInStatus(item.lastActivityDate)}</span>
              )}
            </div>
          </div>

          {/* Action button + chevron */}
          <div className="flex items-center gap-2 shrink-0">
            {needsRhAction && navTarget && (
              <button
                className="text-[11px] font-semibold h-7 px-3 rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                onClick={(e) => { e.stopPropagation(); navigate(navTarget.path); }}
              >
                {item.status === "prestacao_recebida" ? "Analisar" : "Planejar"}
              </button>
            )}
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
          </div>
        </div>

        {/* Expanded body */}
        {isExpanded && (
          <div className="border-t border-gray-100 dark:border-gray-700 px-4 pb-4 pt-3 space-y-3">
            <div className="px-2 py-2 rounded-lg bg-slate-50 dark:bg-gray-900/30">
              {renderTimeline(item)}
            </div>

            {item.planned && (
              <>
                {item.actual && (() => {
                  const diff = item.actual.totalValue - item.planned.totalValue;
                  const isNegative = diff < 0;
                  const isZero = diff === 0;
                  const pct = item.planned.totalValue > 0 ? Math.abs(diff / item.planned.totalValue * 100).toFixed(1) : "0";
                  return (
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900/20 px-4 py-3 flex items-center justify-between">
                      <span className="text-xs text-slate-500">Diferença apurada</span>
                      <div className="text-right">
                        <p className={`text-base font-bold tabular-nums ${isZero ? "text-slate-400" : isNegative ? "text-emerald-600" : "text-red-600"}`}>
                          {isZero ? "R$ 0,00" : `${isNegative ? '−' : '+'} ${fmt(Math.abs(diff))}`}
                        </p>
                        {!isZero && (
                          <p className="text-[10px] text-slate-400">{isNegative ? `Economia de ${pct}%` : `+${pct}% do planejado`}</p>
                        )}
                      </div>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Planejado</p>
                    <p className="text-base font-bold tabular-nums text-slate-800 dark:text-slate-200 mb-1.5">{fmt(item.planned.totalValue)}</p>
                    <div className="space-y-0.5 text-[10px] text-slate-400">
                      <div className="flex justify-between"><span>Diárias</span><span className="tabular-nums">{item.planned.dailyQuantity}× {fmt(item.planned.dailyValue)}</span></div>
                      <div className="flex justify-between"><span>Alimentação</span><span className="tabular-nums">{fmt(item.planned.weekdayLunch + item.planned.weekdayDinner + item.planned.weekendLunch + item.planned.weekendDinner)}</span></div>
                      <div className="flex justify-between"><span>Mobilidade</span><span className="tabular-nums">{fmt(item.planned.mobility + item.planned.transport)}</span></div>
                    </div>
                  </div>

                  {item.actual ? (
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Realizado</p>
                      <p className="text-base font-bold tabular-nums text-slate-800 dark:text-slate-200 mb-1.5">{fmt(item.actual.totalValue)}</p>
                      <div className="space-y-0.5 text-[10px] text-slate-400">
                        <div className="flex justify-between"><span>Diárias</span><span className="tabular-nums">{item.actual.dailyQuantity}× {fmt(item.actual.dailyValue)}</span></div>
                        <div className="flex justify-between"><span>Alimentação</span><span className="tabular-nums">{fmt(item.actual.weekdayLunch + item.actual.weekdayDinner + item.actual.weekendLunch + item.actual.weekendDinner)}</span></div>
                        <div className="flex justify-between"><span>Mobilidade</span><span className="tabular-nums">{fmt(item.actual.mobility + item.actual.transport)}</span></div>
                      </div>
                      {item.actual.changeReason && (
                        <p className="text-[9px] text-slate-400 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 italic">{item.actual.changeReason}</p>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 p-3 flex items-center justify-center">
                      <div className="text-center">
                        <FileText className="w-5 h-5 text-gray-300 mx-auto mb-1" />
                        <p className="text-[10px] text-slate-400">Realizado não preenchido</p>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {item.actual?.rhComment && (
              <div className="px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-700">
                <p className="text-[10px] font-semibold text-slate-400 mb-1">Comentário do RH</p>
                <p className="text-xs text-slate-600 dark:text-slate-300">{item.actual.rhComment}</p>
                {item.actual.rhActionAt && (
                  <p className="text-[10px] text-slate-400 mt-1">{formatDateTime(item.actual.rhActionAt)} — {getUserName(item.actual.rhActionBy)}</p>
                )}
              </div>
            )}

            {navTarget && (
              <button
                onClick={() => navigate(navTarget.path)}
                className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  needsRhAction
                    ? "bg-blue-600 hover:bg-blue-700 text-white"
                    : "border border-gray-200 dark:border-gray-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-700"
                }`}
              >
                {item.status === "prestacao_recebida" ? "Analisar comparativo" : navTarget.label}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const totalItems = prestacaoItems.length;
  const concludedCount = (statusCounts.aprovada_faturamento || 0) + (statusCounts.recusada || 0);
  const progressPct = totalItems > 0 ? Math.round(concludedCount / totalItems * 100) : 0;

  return (
    <div className="space-y-5 max-w-5xl mx-auto pb-24">

      {/* ── Page header ── */}
      <div className="flex items-center gap-3">
        <Shield className="w-5 h-5 text-slate-400" />
        <div>
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Controle de Prestações de Contas</h1>
          <p className="text-xs text-slate-400 mt-0.5">Escalação → Planejado → Realizado → Aprovação</p>
        </div>
      </div>

      {/* ── Metric cards ── */}
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            label: "Pendências do RH",
            icon: Shield,
            statuses: ["planejamento_pendente", "prestacao_recebida"] as PrestacaoStatus[],
            accent: true,
          },
          {
            label: "Em andamento",
            icon: Clock,
            statuses: ["aguardando_prestacao", "devolvida_para_ajuste"] as PrestacaoStatus[],
            accent: false,
          },
          {
            label: "Finalizadas",
            icon: CheckCircle,
            statuses: ["aprovada_faturamento", "recusada"] as PrestacaoStatus[],
            accent: false,
          },
        ].map(({ label, icon: Icon, statuses: cardStatuses, accent }) => (
          <div key={label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <Icon className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-medium text-slate-500">{label}</span>
              {accent && rhActionCount > 0 && (
                <span className="ml-auto text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">{rhActionCount}</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {cardStatuses.map(status => {
                const cfg = statusConfig[status];
                const count = statusCounts[status] || 0;
                const isActive = filterStatus === status;
                return (
                  <button key={status} onClick={() => setFilterStatus(isActive ? "all" : status)}
                    className={`rounded-lg border p-2.5 text-left transition-all ${isActive ? `${cfg.bg} ${cfg.border} ring-1 ring-offset-1` : 'border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600'}`}
                  >
                    <span className={`text-xl font-bold tabular-nums block mb-0.5 ${accent && count > 0 ? 'text-red-600' : 'text-slate-800 dark:text-slate-200'}`}>
                      {isLoading ? <span className="inline-block w-5 h-5 bg-gray-200 rounded animate-pulse" /> : count}
                    </span>
                    <span className="text-[10px] text-slate-400">{cfg.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Pending action banner ── */}
      {!isLoading && rhActionCount > 0 && !isRhFilterActive && (
        <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-lg border-l-2 border-l-amber-400 border border-amber-100 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/20">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {rhActionCount} pendência{rhActionCount !== 1 ? 's' : ''} aguardando ação do RH
            </p>
            <div className="flex items-center gap-2 mt-1.5">
              <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden max-w-[160px]">
                <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
              </div>
              <span className="text-[10px] text-slate-400">{progressPct}% concluído</span>
            </div>
          </div>
          <button
            className="text-xs font-semibold px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors shrink-0"
            onClick={() => {
              setFilterStatus("rh_action");
              setShowConcluded(false);
              setTimeout(() => document.getElementById("rh-listing")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
            }}
          >
            Ver pendências
          </button>
        </div>
      )}

      {/* ── Search + filters ── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <Input
              placeholder="Buscar por colaborador..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="h-8 pl-9 text-xs border-gray-200 dark:border-gray-700"
            />
          </div>

          <button
            className={`h-8 px-3 text-xs rounded-md border flex items-center gap-1.5 transition-colors ${
              showConcluded ? 'border-blue-300 text-blue-700 bg-blue-50 dark:bg-blue-950/30' : 'border-gray-200 dark:border-gray-700 text-slate-500 hover:border-gray-300 bg-white dark:bg-gray-800'
            }`}
            onClick={() => setShowConcluded(!showConcluded)}
          >
            <div className={`w-7 h-4 rounded-full relative flex items-center transition-all ${showConcluded ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'}`}>
              <div className={`w-3 h-3 rounded-full bg-white shadow transition-transform ${showConcluded ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
            </div>
            Concluídos
            {concludedCount > 0 && <span className="text-[9px] text-slate-400">({concludedCount})</span>}
          </button>

          <Button variant="outline" size="sm"
            className={`h-8 text-xs gap-1.5 ${hasActiveFilters ? 'border-blue-300 text-blue-700 bg-blue-50' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-3.5 h-3.5" />
            Filtros
            {hasActiveFilters && (
              <span className="bg-blue-600 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                {[filterEvent !== "all", filterFunction !== "all", filterCollaborator !== "all", filterStatus !== "all"].filter(Boolean).length}
              </span>
            )}
          </Button>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-8 text-xs text-slate-400 hover:text-slate-600"
              onClick={() => { setFilterEvent("all"); setFilterFunction("all"); setFilterCollaborator("all"); setFilterStatus("all"); setSearchTerm(""); }}>
              Limpar
            </Button>
          )}
        </div>

        {showFilters && (
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={filterEvent} onValueChange={setFilterEvent}>
              <SelectTrigger className="h-8 text-xs w-48 border-gray-200"><SelectValue placeholder="Evento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os eventos</SelectItem>
                {events?.filter(e => eventIdsWithInclusions.has(e.id)).map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterFunction} onValueChange={setFilterFunction}>
              <SelectTrigger className="h-8 text-xs w-40 border-gray-200"><SelectValue placeholder="Função" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as funções</SelectItem>
                {usedFunctionIds.map(fid => <SelectItem key={fid} value={fid!}>{getFunctionName(fid)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterCollaborator} onValueChange={setFilterCollaborator}>
              <SelectTrigger className="h-8 text-xs w-48 border-gray-200"><SelectValue placeholder="Colaborador" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os colaboradores</SelectItem>
                <SelectItem value="definido">Com colaborador</SelectItem>
                <SelectItem value="a_definir">Colaborador a definir</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as PrestacaoStatus)}>
              <SelectTrigger className="h-8 text-xs w-52 border-gray-200"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="planejamento_pendente">Aguardando planejamento</SelectItem>
                <SelectItem value="aguardando_prestacao">Aguardando realizado</SelectItem>
                <SelectItem value="prestacao_recebida">Análise pendente</SelectItem>
                <SelectItem value="devolvida_para_ajuste">Devolvida para ajuste</SelectItem>
                <SelectItem value="aprovada_faturamento">Aprovada para faturamento</SelectItem>
                <SelectItem value="recusada">Recusada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {isRhFilterActive && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-slate-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700 text-xs text-slate-500">
          <Shield className="w-3.5 h-3.5 text-slate-400" />
          Mostrando apenas pendências do RH ({rhActionCount} ite{rhActionCount === 1 ? 'm' : 'ns'})
          <button className="ml-auto text-blue-600 hover:text-blue-800 font-medium" onClick={() => setFilterStatus("all")}>Limpar</button>
        </div>
      )}

      {/* ── Content ── */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-lg border border-gray-200 bg-white dark:bg-gray-800 px-4 py-3 animate-pulse flex items-center gap-3">
              <div className="w-8 h-8 bg-gray-200 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-gray-200 rounded w-32" />
                <div className="h-2.5 bg-gray-100 rounded w-48" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div id="rh-listing" className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-12 text-center">
          <Shield className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-500">Nenhum item encontrado</p>
          <p className="text-xs text-slate-400 mt-1">
            {hasActiveFilters ? "Ajuste os filtros para ver mais resultados." :
             showConcluded ? "Nenhum item concluído ainda." :
             "Todos os itens estão em dia. Ative 'Concluídos' para ver os finalizados."}
          </p>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" className="mt-3 text-xs"
              onClick={() => { setFilterEvent("all"); setFilterFunction("all"); setFilterCollaborator("all"); setFilterStatus("all"); setSearchTerm(""); }}>
              Limpar filtros
            </Button>
          )}
        </div>
      ) : (
        <div id="rh-listing" className="space-y-2">
          {/* Section header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Por evento</span>
              <span className="text-[10px] text-slate-400">
                {eventGroups.length} evento{eventGroups.length !== 1 ? 's' : ''} · {filteredItems.length} ite{filteredItems.length === 1 ? 'm' : 'ns'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button className="text-[10px] text-blue-600 hover:text-blue-800 font-medium" onClick={expandAllEvents}>Expandir tudo</button>
              <button className="text-[10px] text-slate-400 hover:text-slate-600 font-medium" onClick={collapseAllEvents}>Recolher tudo</button>
            </div>
          </div>

          {/* Event groups */}
          {eventGroups.map(group => {
            const isOpen = expandedEvents.has(group.event.id);
            const statuses = group.items.reduce((acc, i) => { acc[i.status] = (acc[i.status] || 0) + 1; return acc; }, {} as Record<string, number>);
            return (
              <div key={group.event.id} className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800 shadow-sm">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-gray-750 transition-colors"
                  onClick={() => toggleEventExpand(group.event.id)}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${isOpen ? 'rotate-90' : ''}`} />
                    <div className="text-left min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{group.event.name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {group.items.length} ite{group.items.length === 1 ? 'm' : 'ns'}
                        {group.actionNeeded > 0 && (
                          <span className="ml-1.5 text-amber-600 font-semibold">{group.actionNeeded} pendente{group.actionNeeded !== 1 ? 's' : ''}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {statuses.prestacao_recebida ? <span className="w-2 h-2 rounded-full bg-blue-400" /> : null}
                    {statuses.planejamento_pendente ? <span className="w-2 h-2 rounded-full bg-amber-400" /> : null}
                    {statuses.devolvida_para_ajuste ? <span className="w-2 h-2 rounded-full bg-orange-400" /> : null}
                    {statuses.aguardando_prestacao ? <span className="w-2 h-2 rounded-full bg-slate-300" /> : null}
                    {statuses.aprovada_faturamento ? <span className="w-2 h-2 rounded-full bg-emerald-400" /> : null}
                    {statuses.recusada ? <span className="w-2 h-2 rounded-full bg-red-400" /> : null}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 dark:border-gray-700 px-3 py-2 space-y-1.5 bg-slate-50/50 dark:bg-gray-900/20">
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
