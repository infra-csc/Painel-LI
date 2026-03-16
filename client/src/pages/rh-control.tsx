import { useState, useMemo, useEffect, useRef } from "react";
import { formatDias } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/(?:^|\s)\S/g, a => a.toUpperCase());
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
  const [filterInvoiceStatus, setFilterInvoiceStatus] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showConcluded, setShowConcluded] = useState(false);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [approvingInvoiceId, setApprovingInvoiceId] = useState<string | null>(null);
  const [nfApprovalDate, setNfApprovalDate] = useState("");
  const [nfApproving, setNfApproving] = useState(false);
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
  const { data: allInvoices = [] } = useQuery<any[]>({ queryKey: ["/api/invoices"] });

  const isLoading = loadingPlanned || loadingActual || loadingInclusions;

  const getInvoiceForActual = (actualId: string | undefined): any | undefined =>
    actualId ? (allInvoices as any[]).find((inv: any) => inv.budgetActualId === actualId) : undefined;

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

  const invoiceCounts = useMemo(() => {
    const approvedActuals = (allActual || []).filter(a => a.rhStatus === "aprovado" && !a.splitParentId);
    const approvedIds = new Set(approvedActuals.map(a => a.id));
    const relevant = (allInvoices as any[]).filter(inv => approvedIds.has(inv.budgetActualId));
    const enviada  = relevant.filter(inv => inv.status === "enviada").length;
    const devolvida = relevant.filter(inv => inv.status === "devolvida").length;
    const aprovada  = relevant.filter(inv => inv.status === "aprovada").length;
    const sentIds   = new Set(relevant.filter(inv => inv.status !== "pendente").map(inv => inv.budgetActualId));
    const pending   = approvedActuals.filter(a => !sentIds.has(a.id)).length;
    return { pending, enviada, devolvida, aprovada };
  }, [allActual, allInvoices]);

  const RH_STATUSES: PrestacaoStatus[] = ["prestacao_recebida", "planejamento_pendente"];

  const filteredItems = useMemo(() => {
    return prestacaoItems.filter(item => {
      if (filterStatus === "rh_action") {
        if (!RH_STATUSES.includes(item.status)) return false;
      } else if (filterStatus !== "all") {
        if (item.status !== filterStatus) return false;
      } else {
        // "Concluído" = aprovada_faturamento + NF aprovada
        if (filterInvoiceStatus === "all") {
          const inv = item.actual ? getInvoiceForActual(item.actual.id) : null;
          const invStatus = inv?.status ?? "pendente";
          const isConcluded = item.status === "aprovada_faturamento" && invStatus === "aprovada";
          if (showConcluded && !isConcluded) return false;
          if (!showConcluded && isConcluded) return false;
        }
      }
      if (filterEvent !== "all" && item.event.id !== filterEvent) return false;
      if (filterFunction !== "all" && item.functionId !== filterFunction) return false;
      if (filterCollaborator === "a_definir" && item.collaboratorId) return false;
      if (filterCollaborator === "definido" && !item.collaboratorId) return false;
      if (filterInvoiceStatus !== "all") {
        if (!item.actual || item.actual.rhStatus !== "aprovado") return false;
        const inv = getInvoiceForActual(item.actual.id);
        const invStatus = inv?.status || "pendente";
        if (invStatus !== filterInvoiceStatus) return false;
      }
      if (searchTerm) {
        const name = getCollaboratorName(item.collaboratorId).toLowerCase();
        if (!name.includes(searchTerm.toLowerCase())) return false;
      }
      return true;
    });
  }, [prestacaoItems, filterEvent, filterStatus, filterFunction, filterCollaborator, filterInvoiceStatus, searchTerm, showConcluded, collaborators, allInvoices]);

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

  const hasActiveFilters = filterEvent !== "all" || filterFunction !== "all" || filterCollaborator !== "all" || (filterStatus !== "all" && filterStatus !== "rh_action") || filterInvoiceStatus !== "all" || searchTerm !== "";
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
    "Nota fiscal enviada pelo colaborador e aprovada pelo RH",
  ];

  const renderTimeline = (item: PrestacaoItem) => {
    const step = getTimelineStep(item);
    const isConcluded = item.status === "aprovada_faturamento" || item.status === "recusada";

    const nfEligible = item.status === "aprovada_faturamento";
    const nfInv = nfEligible && item.actual ? getInvoiceForActual(item.actual.id) : undefined;
    const nfStatus = nfInv?.status || "pendente";
    const nfCompleted = nfStatus === "aprovada";
    const nfRecusada = nfStatus === "recusada";
    const nfEnviada = nfStatus === "enviada";
    const nfDevolvida = nfStatus === "devolvida";
    const nfDateStr = nfCompleted && nfInv?.approvedAt
      ? new Date(nfInv.approvedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
      : (nfEnviada || nfDevolvida) && nfInv?.createdAt
      ? new Date(nfInv.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
      : null;
    const nfTooltip = nfCompleted ? "Nota fiscal aprovada"
      : nfRecusada ? "Nota fiscal recusada"
      : nfEnviada ? "Nota fiscal enviada — aguardando aprovação do RH"
      : nfDevolvida ? "Nota fiscal devolvida para correção"
      : nfEligible ? "Aguardando envio da nota fiscal"
      : "Disponível após aprovação do comparativo";

    const mainSteps = ["Escalação", "Planejado", "Realizado", "Aprovação"];

    return (
      <TooltipProvider delayDuration={200}>
        <div className="flex items-start w-full px-1 py-1">
          {/* Steps 0–3 with connectors (connector always follows each step) */}
          {mainSteps.map((label, i) => {
            const isCompleted = isConcluded ? true : i < step;
            const isCurrent = !isConcluded && i === step;
            const isFuture = !isCompleted && !isCurrent;
            const dateStr = getStepDate(item, i);
            const responsibleName = getStepResponsible(item, i);
            const connectorColor = i === 3
              ? nfEligible ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-gray-200 dark:bg-gray-700'
              : isCompleted ? 'bg-blue-300 dark:bg-blue-700' : 'bg-gray-200 dark:bg-gray-700';
            return (
              <div key={label} className="flex items-start flex-1 min-w-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex flex-col items-center flex-shrink-0 cursor-default w-14">
                      <div className="relative flex items-center justify-center">
                        {isCurrent && <span className="absolute w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 animate-ping opacity-60" />}
                        <div className={`relative w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                          isCompleted ? 'bg-blue-600 shadow-sm shadow-blue-200 dark:shadow-blue-900'
                          : isCurrent ? 'bg-white dark:bg-gray-800 border-2 border-blue-500'
                          : 'bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600'
                        }`}>
                          {isCompleted && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                          {isCurrent && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                        </div>
                      </div>
                      <span className={`text-[10px] font-semibold mt-1.5 whitespace-nowrap ${
                        isCompleted || isCurrent ? 'text-blue-600 dark:text-blue-400' : 'text-slate-300 dark:text-slate-600'
                      }`}>{label}</span>
                      {(isCompleted || isCurrent) && dateStr
                        ? <span className="text-[9px] text-slate-400 whitespace-nowrap">{dateStr}</span>
                        : isFuture ? <span className="text-[9px] text-slate-300 dark:text-slate-600 italic">Pendente</span>
                        : null}
                      {(isCompleted || isCurrent) && responsibleName
                        ? <span className="text-[9px] text-slate-400 whitespace-nowrap mt-0.5 max-w-[56px] truncate">{responsibleName}</span>
                        : null}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-[200px]">
                    <p className="font-semibold">{label}</p>
                    <p className="text-gray-400">{STEP_TOOLTIPS[i]}</p>
                  </TooltipContent>
                </Tooltip>
                {/* Connector — always shown from each main step to the next */}
                <div className={`h-px flex-1 mt-3 rounded-full mx-1 transition-all ${connectorColor}`} />
              </div>
            );
          })}

          {/* NF step — rendered outside the map so it always appears */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex flex-col items-center flex-shrink-0 cursor-default w-14">
                <div className="relative flex items-center justify-center">
                  {nfEnviada && <span className="absolute w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/30 animate-ping opacity-60" />}
                  <div className={`relative w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                    nfCompleted ? 'bg-emerald-500 shadow-sm shadow-emerald-200'
                    : nfRecusada ? 'bg-red-500'
                    : nfEnviada ? 'bg-white dark:bg-gray-800 border-2 border-amber-400'
                    : nfDevolvida ? 'bg-white dark:bg-gray-800 border-2 border-orange-400'
                    : 'bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600'
                  }`}>
                    {nfCompleted && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                    {nfRecusada && <XCircle className="w-3 h-3 text-white" strokeWidth={2} />}
                    {nfEnviada && <div className="w-2 h-2 rounded-full bg-amber-400" />}
                    {nfDevolvida && <div className="w-2 h-2 rounded-full bg-orange-400" />}
                  </div>
                </div>
                <span className={`text-[10px] font-semibold mt-1.5 whitespace-nowrap ${
                  nfCompleted ? 'text-emerald-600 dark:text-emerald-400'
                  : nfEnviada ? 'text-amber-600 dark:text-amber-400'
                  : nfDevolvida ? 'text-orange-600 dark:text-orange-400'
                  : nfRecusada ? 'text-red-600 dark:text-red-400'
                  : 'text-slate-400 dark:text-slate-500'
                }`}>Nota Fiscal</span>
                {nfDateStr
                  ? <span className="text-[9px] text-slate-400 whitespace-nowrap">{nfDateStr}</span>
                  : <span className="text-[9px] text-slate-400 dark:text-slate-500 italic">{nfEligible ? "Pendente" : "—"}</span>}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs max-w-[200px]">
              <p className="font-semibold">Nota Fiscal</p>
              <p className="text-gray-400">{nfTooltip}</p>
            </TooltipContent>
          </Tooltip>
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
    const colName = item.collaboratorId ? toTitleCase(getCollaboratorName(item.collaboratorId)) : 'A Definir';
    const nfEligible = item.status === "aprovada_faturamento";
    const nfInvCard = nfEligible && item.actual ? getInvoiceForActual(item.actual.id) : undefined;
    const nfStatus = nfInvCard?.status || "pendente";

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
            {nfEligible && (() => {
              if (nfStatus === "aprovada") {
                const approvedDateStr = nfInvCard?.paymentDate
                  ? new Date(nfInvCard.paymentDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
                  : nfInvCard?.approvedAt
                  ? new Date(nfInvCard.approvedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
                  : "";
                return (
                  <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1">
                    NF Aprovada{approvedDateStr ? ` · ${approvedDateStr}` : ""}
                  </span>
                );
              }
              if (nfStatus === "enviada") {
                const isApprovingThis = approvingInvoiceId === nfInvCard?.id;
                if (isApprovingThis) {
                  return (
                    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                      <input
                        type="date"
                        value={nfApprovalDate}
                        onChange={e => setNfApprovalDate(e.target.value)}
                        className="h-7 text-[11px] px-2 rounded-md border border-violet-300 focus:outline-none focus:ring-1 focus:ring-violet-400 bg-white"
                        placeholder="Data pagamento"
                      />
                      <button
                        disabled={!nfApprovalDate || nfApproving}
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!nfApprovalDate || !nfInvCard?.id) return;
                          setNfApproving(true);
                          try {
                            await apiRequest("POST", `/api/invoices/${nfInvCard.id}/approve`, { paymentDate: nfApprovalDate });
                            await queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
                            setApprovingInvoiceId(null);
                            setNfApprovalDate("");
                          } finally {
                            setNfApproving(false);
                          }
                        }}
                        className="text-[11px] font-semibold h-7 px-2.5 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white transition-colors"
                      >
                        {nfApproving ? "..." : "Confirmar"}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setApprovingInvoiceId(null); setNfApprovalDate(""); }}
                        className="text-[11px] h-7 px-2 rounded-md border border-gray-200 text-slate-500 hover:bg-gray-50 transition-colors"
                      >✕</button>
                    </div>
                  );
                }
                return (
                  <button
                    className="text-[11px] font-semibold h-7 px-3 rounded-md bg-violet-600 hover:bg-violet-700 text-white transition-colors"
                    onClick={(e) => { e.stopPropagation(); setApprovingInvoiceId(nfInvCard?.id || null); setNfApprovalDate(""); }}
                  >
                    Aprovar NF
                  </button>
                );
              }
              if (nfStatus === "devolvida") {
                return <span className="text-[10px] font-medium text-orange-500 border border-orange-200 rounded-md px-2 py-1">NF devolvida</span>;
              }
              return <span className="text-[10px] text-slate-400 border border-dashed border-gray-200 rounded-md px-2 py-1">Aguardando NF</span>;
            })()}
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
          </div>
        </div>

        {/* Expanded body */}
        {isExpanded && (
          <div className="border-t border-gray-100 dark:border-gray-700 px-4 pb-4 pt-4 space-y-4">

            {/* Stepper */}
            <div className="rounded-lg bg-slate-50 dark:bg-gray-900/30 px-3 py-3">
              {renderTimeline(item)}
            </div>

            {/* Financial panels — only when planned exists */}
            {item.planned && (() => {
              const hasActual = !!item.actual;

              if (!hasActual) {
                /* Variation: stepper-only (no financial data yet) */
                return null;
              }

              const diff = item.actual!.totalValue - item.planned.totalValue;
              const isNegative = diff < 0;
              const isZero = diff === 0;
              const pct = item.planned.totalValue > 0
                ? Math.abs(diff / item.planned.totalValue * 100).toFixed(1)
                : "0";

              return (
                <div className="space-y-3">
                  {/* Diff strip */}
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-900/30 px-4 py-2.5 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-medium">Diferença apurada</span>
                    <div className="text-right">
                      <span className={`text-sm font-bold tabular-nums ${
                        isZero ? 'text-slate-400' : isNegative ? 'text-emerald-600' : 'text-red-600'
                      }`}>
                        {isZero ? 'R$ 0,00' : `${isNegative ? '−' : '+'} ${fmt(Math.abs(diff))}`}
                      </span>
                      {!isZero && (
                        <p className="text-[9px] text-slate-400">
                          {isNegative ? `economia de ${pct}%` : `+${pct}% do planejado`}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Two panels */}
                  <div className="grid grid-cols-2 divide-x divide-gray-100 dark:divide-gray-700 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    {/* Planejado */}
                    <div className="p-3">
                      <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Planejado</p>
                      <p className="text-base font-bold tabular-nums text-slate-800 dark:text-slate-200 mb-2">{fmt(item.planned.totalValue)}</p>
                      <div className="space-y-1 text-[10px]">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Diárias</span>
                          <span className="tabular-nums text-slate-600 dark:text-slate-300">{item.planned.dailyQuantity}× {fmt(item.planned.dailyValue)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Alimentação</span>
                          <span className="tabular-nums text-slate-600 dark:text-slate-300">{fmt(item.planned.weekdayLunch + item.planned.weekdayDinner + item.planned.weekendLunch + item.planned.weekendDinner)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Mobilidade</span>
                          <span className="tabular-nums text-slate-600 dark:text-slate-300">{fmt(item.planned.mobility + item.planned.transport)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Realizado */}
                    <div className="p-3">
                      <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Realizado</p>
                      <p className="text-base font-bold tabular-nums text-slate-800 dark:text-slate-200 mb-2">{fmt(item.actual!.totalValue)}</p>
                      <div className="space-y-1 text-[10px]">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Diárias</span>
                          <span className="tabular-nums text-slate-600 dark:text-slate-300">{item.actual!.dailyQuantity}× {fmt(item.actual!.dailyValue)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Alimentação</span>
                          <span className="tabular-nums text-slate-600 dark:text-slate-300">{fmt(item.actual!.weekdayLunch + item.actual!.weekdayDinner + item.actual!.weekendLunch + item.actual!.weekendDinner)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Mobilidade</span>
                          <span className="tabular-nums text-slate-600 dark:text-slate-300">{fmt(item.actual!.mobility + item.actual!.transport)}</span>
                        </div>
                      </div>
                      {item.actual!.changeReason && (
                        <p className="text-[9px] text-slate-400 italic mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                          {item.actual!.changeReason}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* RH comment */}
            {item.actual?.rhComment && (
              <div className="px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-700">
                <p className="text-[10px] font-semibold text-slate-400 mb-1">Comentário do RH</p>
                <p className="text-xs text-slate-600 dark:text-slate-300">{item.actual.rhComment}</p>
                {item.actual.rhActionAt && (
                  <p className="text-[10px] text-slate-400 mt-1">
                    {formatDateTime(item.actual.rhActionAt)} — {getUserName(item.actual.rhActionBy)}
                  </p>
                )}
              </div>
            )}

            {/* Action button */}
            {navTarget && (
              <button
                onClick={() => navigate(navTarget.path)}
                className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  item.status === "prestacao_recebida" || item.status === "planejamento_pendente"
                    ? "bg-blue-600 hover:bg-blue-700 text-white"
                    : "border border-gray-200 dark:border-gray-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-700"
                }`}
              >
                {item.status === "prestacao_recebida" ? "Analisar comparativo" : navTarget.label}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {/* NF action button — only when approved for billing */}
            {item.status === "aprovada_faturamento" && item.actual && (() => {
              const nfInv = getInvoiceForActual(item.actual!.id);
              const nfStatus = nfInv?.status || "pendente";
              if (nfStatus === "enviada") {
                return (
                  <button
                    onClick={() => navigate(`/invoices?event=${item.event.id}`)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Aprovar nota fiscal
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                );
              }
              if (nfStatus === "devolvida") {
                return (
                  <button
                    onClick={() => navigate(`/invoices?event=${item.event.id}`)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold border border-orange-200 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/20 transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Nota devolvida — ver notas fiscais
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                );
              }
              if (nfStatus === "pendente") {
                return (
                  <div className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs text-slate-400 border border-dashed border-gray-200 dark:border-gray-700">
                    <FileText className="w-3.5 h-3.5" />
                    Aguardando envio da nota fiscal
                  </div>
                );
              }
              return null;
            })()}
          </div>
        )}
      </div>
    );
  };

  const totalItems = prestacaoItems.length;
  const concludedCount = prestacaoItems.filter(item => {
    if (item.status !== "aprovada_faturamento") return false;
    const inv = item.actual ? getInvoiceForActual(item.actual.id) : null;
    return inv?.status === "aprovada";
  }).length;
  const totalForProgress = prestacaoItems.filter(item => !item.planned?.didNotAttend).length;
  const progressPct = totalForProgress > 0 ? Math.round(concludedCount / totalForProgress * 100) : 0;

  return (
    <div className="space-y-5 max-w-5xl mx-auto pb-24">

      {/* ── Page header ── */}
      <div className="flex items-center gap-3">
        <Shield className="w-5 h-5 text-slate-400" />
        <div>
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Controle de Prestações de Contas</h1>
          <p className="text-xs text-slate-400 mt-0.5">Escalação → Planejado → Realizado → Aprovação → Nota Fiscal</p>
        </div>
      </div>

      {/* ── Metric cards ── */}
      {(() => {
        const rhPlan = statusCounts.planejamento_pendente || 0;
        const rhComp = statusCounts.prestacao_recebida || 0;
        const rhNf   = invoiceCounts.enviada;
        const rhTotal = rhPlan + rhComp + rhNf;

        const colReal = (statusCounts.aguardando_prestacao || 0) + (statusCounts.devolvida_para_ajuste || 0);
        const colNfDev = invoiceCounts.devolvida;
        const colNfPend = invoiceCounts.pending;
        const colTotal = colReal + colNfDev + colNfPend;

        const emAndamento = (statusCounts.aguardando_prestacao || 0) + invoiceCounts.enviada;

        const recusada = statusCounts.recusada || 0;

        const cardBase = "relative bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 overflow-hidden flex flex-col";
        const strip = "absolute top-0 left-0 right-0 h-1 rounded-t-xl";
        const bigNum = "text-4xl font-bold tabular-nums mt-1 mb-2";
        const sub = "flex flex-wrap gap-x-1 gap-y-0.5 text-[11px] text-slate-400 leading-relaxed";
        const dot = <span className="text-slate-300 select-none"> ·</span>;
        const metric = (label: string, val: number, accentCls: string, last = false) => (
          <span key={label} className="whitespace-nowrap">
            <span className={val > 0 ? accentCls : ""}>{val} {label}</span>
            {!last && dot}
          </span>
        );

        return (
          <div className="grid grid-cols-4 gap-4">
            {/* Card 1 — Aguardando RH */}
            <div className={cardBase}>
              <div className={`${strip} bg-red-500`} />
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Aguardando RH</span>
              </div>
              <div className={`${bigNum} text-red-600 dark:text-red-400`}>
                {isLoading ? <span className="inline-block w-12 h-9 bg-gray-200 rounded animate-pulse" /> : rhTotal}
              </div>
              <div className={sub}>
                {metric("Planejamento", rhPlan, "font-medium text-red-500")}
                {metric("Comparativo", rhComp, "font-medium text-red-500")}
                {metric("Nota Fiscal", rhNf, "font-medium text-red-500", true)}
              </div>
            </div>

            {/* Card 2 — Aguardando Colaborador */}
            <div className={cardBase}>
              <div className={`${strip} bg-blue-500`} />
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Aguardando Colaborador</span>
              </div>
              <div className={`${bigNum} text-blue-600 dark:text-blue-400`}>
                {isLoading ? <span className="inline-block w-12 h-9 bg-gray-200 rounded animate-pulse" /> : colTotal}
              </div>
              <div className={sub}>
                {metric("Realizado", colReal, "font-medium text-blue-500")}
                {metric("NF devolvida", colNfDev, "font-medium text-blue-500")}
                {metric("Ag. NF", colNfPend, "font-medium text-blue-500", true)}
              </div>
            </div>

            {/* Card 3 — Em andamento */}
            <div className={cardBase}>
              <div className={`${strip} bg-amber-400`} />
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Em andamento</span>
              </div>
              <div className={`${bigNum} text-amber-600 dark:text-amber-400`}>
                {isLoading ? <span className="inline-block w-12 h-9 bg-gray-200 rounded animate-pulse" /> : emAndamento}
              </div>
              <div className={sub}>
                {metric("Ag. realização", statusCounts.aguardando_prestacao || 0, "font-medium text-amber-600")}
                {metric("NF em análise", invoiceCounts.enviada, "font-medium text-amber-600", true)}
              </div>
            </div>

            {/* Card 4 — Concluídos */}
            <div className={cardBase}>
              <div className={`${strip} bg-emerald-500`} />
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Concluídos</span>
              </div>
              <div className={`${bigNum} text-emerald-600 dark:text-emerald-400`}>
                {isLoading ? <span className="inline-block w-12 h-9 bg-gray-200 rounded animate-pulse" /> : concludedCount}
              </div>
              <div className={sub}>
                <span className="whitespace-nowrap">de {totalForProgress} total</span>
                {recusada > 0 && (
                  <span className="whitespace-nowrap text-red-400">{dot}{recusada} recusado{recusada !== 1 ? "s" : ""}</span>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Pending action banner ── */}
      {!isLoading && rhActionCount > 0 && !isRhFilterActive && (
        <div className="flex items-center justify-between gap-4 px-4 py-3.5 rounded-lg border-l-4 border-l-orange-400 border border-amber-100 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/20">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              <span className="font-bold text-orange-500">{rhActionCount}</span>
              {" "}pendência{rhActionCount !== 1 ? 's' : ''} aguardando ação do RH
            </p>
            <div className="flex items-center gap-3 mt-2">
              <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden max-w-[200px]">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${progressPct}%`,
                    background: "linear-gradient(to right, #ef4444, #f97316, #10b981)",
                  }}
                />
              </div>
              <span className="text-[11px] text-slate-500 whitespace-nowrap">
                {concludedCount} de {totalForProgress} concluído{concludedCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <button
            className="text-xs font-semibold px-3 py-1.5 rounded-md border border-orange-300 text-orange-600 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950/30 transition-colors shrink-0"
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
              onClick={() => { setFilterEvent("all"); setFilterFunction("all"); setFilterCollaborator("all"); setFilterStatus("all"); setFilterInvoiceStatus("all"); setSearchTerm(""); }}>
              Limpar
            </Button>
          )}
        </div>

        {showFilters && (
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={filterEvent} onValueChange={setFilterEvent}>
              <SelectTrigger className="h-9 text-sm w-auto min-w-[192px] border border-slate-200 rounded-lg bg-white text-slate-700 hover:border-blue-300 transition-colors focus:ring-2 focus:ring-blue-200"><SelectValue placeholder="Evento" /></SelectTrigger>
              <SelectContent className="bg-white border border-slate-200 rounded-xl shadow-lg min-w-[220px]">
                <SelectItem value="all" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Todos os eventos</SelectItem>
                {events?.filter(e => eventIdsWithInclusions.has(e.id)).map(e => <SelectItem key={e.id} value={e.id} className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterFunction} onValueChange={setFilterFunction}>
              <SelectTrigger className="h-9 text-sm w-auto min-w-[176px] border border-slate-200 rounded-lg bg-white text-slate-700 hover:border-blue-300 transition-colors focus:ring-2 focus:ring-blue-200"><SelectValue placeholder="Função" /></SelectTrigger>
              <SelectContent className="bg-white border border-slate-200 rounded-xl shadow-lg min-w-[200px]">
                <SelectItem value="all" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Todas as funções</SelectItem>
                {usedFunctionIds.map(fid => <SelectItem key={fid} value={fid!} className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">{getFunctionName(fid)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterCollaborator} onValueChange={setFilterCollaborator}>
              <SelectTrigger className="h-9 text-sm w-auto min-w-[192px] border border-slate-200 rounded-lg bg-white text-slate-700 hover:border-blue-300 transition-colors focus:ring-2 focus:ring-blue-200"><SelectValue placeholder="Colaborador" /></SelectTrigger>
              <SelectContent className="bg-white border border-slate-200 rounded-xl shadow-lg min-w-[220px]">
                <SelectItem value="all" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Todos os colaboradores</SelectItem>
                <SelectItem value="definido" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Com colaborador</SelectItem>
                <SelectItem value="a_definir" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Colaborador a definir</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as PrestacaoStatus)}>
              <SelectTrigger className="h-9 text-sm w-auto min-w-[220px] border border-slate-200 rounded-lg bg-white text-slate-700 hover:border-blue-300 transition-colors focus:ring-2 focus:ring-blue-200"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent className="bg-white border border-slate-200 rounded-xl shadow-lg min-w-[240px]">
                <SelectItem value="all" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Todos os status</SelectItem>
                <SelectItem value="planejamento_pendente" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Aguardando planejamento</SelectItem>
                <SelectItem value="aguardando_prestacao" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Aguardando realizado</SelectItem>
                <SelectItem value="prestacao_recebida" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Análise pendente</SelectItem>
                <SelectItem value="devolvida_para_ajuste" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Devolvida para ajuste</SelectItem>
                <SelectItem value="aprovada_faturamento" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Aprovada para faturamento</SelectItem>
                <SelectItem value="recusada" className="hover:bg-blue-50 hover:text-blue-700 cursor-pointer focus:bg-blue-50 focus:text-blue-700 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 data-[state=checked]:font-medium">Recusada</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterInvoiceStatus} onValueChange={setFilterInvoiceStatus}>
              <SelectTrigger className={`h-9 text-sm w-auto min-w-[200px] border rounded-lg bg-white transition-colors focus:ring-2 focus:ring-violet-200 ${filterInvoiceStatus !== "all" ? 'border-violet-300 text-violet-700' : 'border-slate-200 text-slate-700 hover:border-violet-300'}`}><SelectValue placeholder="Nota Fiscal" /></SelectTrigger>
              <SelectContent className="bg-white border border-slate-200 rounded-xl shadow-lg min-w-[220px]">
                <SelectItem value="all" className="hover:bg-violet-50 hover:text-violet-700 cursor-pointer focus:bg-violet-50 focus:text-violet-700 data-[state=checked]:bg-violet-50 data-[state=checked]:text-violet-700 data-[state=checked]:font-medium">Todas as notas</SelectItem>
                <SelectItem value="pendente" className="hover:bg-violet-50 hover:text-violet-700 cursor-pointer focus:bg-violet-50 focus:text-violet-700 data-[state=checked]:bg-violet-50 data-[state=checked]:text-violet-700 data-[state=checked]:font-medium">Aguardando nota</SelectItem>
                <SelectItem value="enviada" className="hover:bg-violet-50 hover:text-violet-700 cursor-pointer focus:bg-violet-50 focus:text-violet-700 data-[state=checked]:bg-violet-50 data-[state=checked]:text-violet-700 data-[state=checked]:font-medium">Aguardando aprovação RH</SelectItem>
                <SelectItem value="devolvida" className="hover:bg-violet-50 hover:text-violet-700 cursor-pointer focus:bg-violet-50 focus:text-violet-700 data-[state=checked]:bg-violet-50 data-[state=checked]:text-violet-700 data-[state=checked]:font-medium">Devolvida</SelectItem>
                <SelectItem value="aprovada" className="hover:bg-violet-50 hover:text-violet-700 cursor-pointer focus:bg-violet-50 focus:text-violet-700 data-[state=checked]:bg-violet-50 data-[state=checked]:text-violet-700 data-[state=checked]:font-medium">Aprovada</SelectItem>
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
             showConcluded ? "Nenhum item com nota fiscal aprovada ainda." :
             "Todos os itens estão em dia. Ative 'Concluídos' para ver os itens com NF aprovada."}
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
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {statuses.prestacao_recebida ? <span className="w-2 h-2 rounded-full bg-blue-400" /> : null}
                          {statuses.planejamento_pendente ? <span className="w-2 h-2 rounded-full bg-amber-400" /> : null}
                          {statuses.devolvida_para_ajuste ? <span className="w-2 h-2 rounded-full bg-orange-400" /> : null}
                          {statuses.aguardando_prestacao ? <span className="w-2 h-2 rounded-full bg-slate-300" /> : null}
                          {statuses.aprovada_faturamento ? <span className="w-2 h-2 rounded-full bg-emerald-400" /> : null}
                          {statuses.recusada ? <span className="w-2 h-2 rounded-full bg-red-400" /> : null}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="text-[11px] space-y-1 p-2.5">
                        <div className="font-semibold text-gray-600 mb-1.5">Etapas presentes</div>
                        {statuses.prestacao_recebida ? <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" /><span className="text-blue-600">Comparativo ({statuses.prestacao_recebida})</span></div> : null}
                        {statuses.planejamento_pendente ? <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" /><span className="text-amber-600">Planejamento pendente ({statuses.planejamento_pendente})</span></div> : null}
                        {statuses.devolvida_para_ajuste ? <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" /><span className="text-orange-600">Devolvida ({statuses.devolvida_para_ajuste})</span></div> : null}
                        {statuses.aguardando_prestacao ? <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" /><span className="text-slate-500">Aguardando prestação ({statuses.aguardando_prestacao})</span></div> : null}
                        {statuses.aprovada_faturamento ? <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" /><span className="text-emerald-600">Aprovada ({statuses.aprovada_faturamento})</span></div> : null}
                        {statuses.recusada ? <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400 shrink-0" /><span className="text-red-600">Recusada ({statuses.recusada})</span></div> : null}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
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
