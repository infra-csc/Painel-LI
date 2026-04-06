import { useState, useMemo, useEffect, useRef } from "react";
import { formatDias } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  Shield, Search, CheckCircle, XCircle, RotateCcw, Clock,
  FileText, FileCheck, ChevronDown, ChevronUp, MessageSquare,
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
  const [filterCheckinOnly, setFilterCheckinOnly] = useState(false);
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
  const [checkinInvoiceId, setCheckinInvoiceId] = useState<string | null>(null);
  const [doingCheckin, setDoingCheckin] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
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
    const enviada   = relevant.filter(inv => inv.status === "enviada").length;
    const devolvida = relevant.filter(inv => inv.status === "devolvida").length;
    const aprovada  = relevant.filter(inv => inv.status === "aprovada").length;
    const sentIds   = new Set(relevant.filter(inv => inv.status !== "pendente").map(inv => inv.budgetActualId));
    const pending   = approvedActuals.filter(a => !sentIds.has(a.id)).length;
    const checkinPending = relevant.filter(inv => inv.status === "aprovada" && !inv.checkinAt).length;
    const checkinDone    = relevant.filter(inv => inv.status === "aprovada" && !!inv.checkinAt).length;
    return { pending, enviada, devolvida, aprovada, checkinPending, checkinDone };
  }, [allActual, allInvoices]);

  const RH_STATUSES: PrestacaoStatus[] = ["prestacao_recebida", "planejamento_pendente"];

  const isCheckinPending = (item: PrestacaoItem): boolean => {
    if (item.status !== "aprovada_faturamento") return false;
    const inv = item.actual ? getInvoiceForActual(item.actual.id) : null;
    return inv?.status === "aprovada" && !inv?.checkinAt;
  };

  const filteredItems = useMemo(() => {
    return prestacaoItems.filter(item => {
      if (filterStatus === "rh_action") {
        const inv = item.actual ? getInvoiceForActual(item.actual.id) : null;
        const needsRhCheckin = item.status === "aprovada_faturamento" && inv?.status === "aprovada" && !inv?.checkinAt;
        const needsRhNfApproval = item.status === "aprovada_faturamento" && inv?.status === "enviada";
        if (!RH_STATUSES.includes(item.status) && !needsRhCheckin && !needsRhNfApproval) return false;
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
      if (filterCheckinOnly) {
        const inv = item.actual ? getInvoiceForActual(item.actual.id) : null;
        const isCheckinPending = item.status === "aprovada_faturamento" && inv?.status === "aprovada" && !inv?.checkinAt;
        if (!isCheckinPending) return false;
      }
      return true;
    });
  }, [prestacaoItems, filterEvent, filterStatus, filterFunction, filterCollaborator, filterInvoiceStatus, searchTerm, showConcluded, filterCheckinOnly, collaborators, allInvoices]);

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
      color: "text-amber-700",
      bg: "bg-amber-50",
      border: "border-amber-200",
      iconColor: "text-amber-500",
      badgeCls: "bg-amber-100 text-amber-700 border-amber-200",
      cardBorder: "border-amber-200",
    },
    aguardando_prestacao: {
      label: "Aguardando realizado",
      shortLabel: "Realizado",
      description: "Planejado criado — aguardando o responsável da função preencher o realizado",
      icon: Clock,
      color: "text-slate-600",
      bg: "bg-slate-50",
      border: "border-slate-200",
      iconColor: "text-slate-400",
      badgeCls: "bg-slate-100 text-slate-600 border-slate-200",
      cardBorder: "border-gray-200",
    },
    prestacao_recebida: {
      label: "Análise pendente",
      shortLabel: "Comparativo",
      description: "Realizado recebido — RH precisa analisar o comparativo para aprovar ou recusar",
      icon: Send,
      color: "text-blue-700",
      bg: "bg-blue-50",
      border: "border-blue-200",
      iconColor: "text-blue-500",
      badgeCls: "bg-blue-100 text-blue-700 border-blue-200",
      cardBorder: "border-blue-200 shadow-sm shadow-blue-100/50",
    },
    devolvida_para_ajuste: {
      label: "Devolvida para ajuste",
      shortLabel: "Devolvida",
      description: "O RH devolveu o realizado — aguardando o responsável da função corrigir e reenviar",
      icon: RotateCcw,
      color: "text-orange-700",
      bg: "bg-orange-50",
      border: "border-orange-200",
      iconColor: "text-orange-500",
      badgeCls: "bg-orange-100 text-orange-700 border-orange-200",
      cardBorder: "border-orange-200",
    },
    aprovada_faturamento: {
      label: "Aprovada para faturamento",
      shortLabel: "Aprovada",
      description: "O RH aprovou — pronta para faturamento",
      icon: CheckCircle,
      color: "text-emerald-700",
      bg: "bg-emerald-50",
      border: "border-emerald-200",
      iconColor: "text-emerald-500",
      badgeCls: "bg-emerald-100 text-emerald-700 border-emerald-200",
      cardBorder: "border-emerald-200",
    },
    recusada: {
      label: "Recusada",
      shortLabel: "Recusada",
      description: "O RH recusou — não será faturada",
      icon: Ban,
      color: "text-red-700",
      bg: "bg-red-50",
      border: "border-red-200",
      iconColor: "text-red-500",
      badgeCls: "bg-red-100 text-red-700 border-red-200",
      cardBorder: "border-red-200",
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

  const hasActiveFilters = filterEvent !== "all" || filterFunction !== "all" || filterCollaborator !== "all" || (filterStatus !== "all" && filterStatus !== "rh_action") || filterInvoiceStatus !== "all" || searchTerm !== "" || filterCheckinOnly;
  const isRhFilterActive = filterStatus === "rh_action";
  const rhReceivedCount = statusCounts.prestacao_recebida || 0;
  const rhPlanPendingCount = statusCounts.planejamento_pendente || 0;
  const rhNfPendingCount = invoiceCounts.enviada;
  const rhActionCount = rhReceivedCount + rhPlanPendingCount + rhNfPendingCount + (invoiceCounts.checkinPending || 0);

  const getTimelineStep = (item: PrestacaoItem): number => {
    // step = index of the CURRENT active step (steps before it are completed ✓)
    // 0=Escalação, 1=Planejado, 2=Realizado, 3=Aprovação
    if (item.status === "planejamento_pendente") return 1;   // Escalação ✓ → Planejado is current
    if (item.status === "aguardando_prestacao") return 2;    // Escalação+Planejado ✓ → Realizado is current
    if (item.status === "prestacao_recebida") return 3;      // Escalação+Planejado+Realizado ✓ → Aprovação is current
    if (item.status === "devolvida_para_ajuste") return 2;   // Returned to Realizado (correction needed)
    return 3; // concluded statuses use isConcluded=true → all steps marked ✓
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
    "Análise do comparativo pelo RH para liberação de pagamento",
    "Nota fiscal enviada pelo colaborador e aprovada pelo RH",
    "Check-in financeiro realizado pelo RH — encerra o processo",
  ];

  const renderTimeline = (item: PrestacaoItem) => {
    const step = getTimelineStep(item);
    const isConcluded = item.status === "aprovada_faturamento" || item.status === "recusada";

    const nfEligible = item.status === "aprovada_faturamento";
    const nfInv = nfEligible && item.actual ? getInvoiceForActual(item.actual.id) : undefined;
    const nfStatus = nfInv?.status || "pendente";
    const checkinDone = !!(nfInv?.checkinAt);
    const checkinEligible = nfStatus === "aprovada";
    const checkinDateStr = checkinDone && nfInv?.checkinAt
      ? new Date(nfInv.checkinAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
      : null;
    const nfCompleted = nfStatus === "aprovada";
    const nfRecusada = nfStatus === "recusada";
    const nfEnviada = nfStatus === "enviada";
    const nfDevolvida = nfStatus === "devolvida";
    const nfAwaitingSubmission = nfEligible && nfStatus === "pendente"; // comparativo approved, waiting collaborator to send NF
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

    const mainSteps = ["Escalação", "Planejado", "Realizado", "Comparativo"];

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
              ? nfCompleted ? 'bg-emerald-300' : nfEligible ? 'bg-amber-300' : 'bg-gray-200'
              : isCompleted ? 'bg-blue-300' : 'bg-gray-200';
            return (
              <div key={label} className="flex items-start flex-1 min-w-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex flex-col items-center flex-shrink-0 cursor-default w-14">
                      <div className="relative flex items-center justify-center">
                        {isCurrent && <span className="absolute w-7 h-7 rounded-full bg-blue-100 animate-ping opacity-60" />}
                        <div className={`relative w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                          isCompleted ? 'bg-blue-600 shadow-sm shadow-blue-200'
                          : isCurrent ? 'bg-white border-2 border-blue-500'
                          : 'bg-gray-100 border border-gray-200'
                        }`}>
                          {isCompleted && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                          {isCurrent && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                        </div>
                      </div>
                      <span className={`text-[10px] font-semibold mt-1.5 whitespace-nowrap ${
                        isCompleted || isCurrent ? 'text-blue-600' : 'text-slate-300'
                      }`}>{label}</span>
                      {(isCompleted || isCurrent) && dateStr
                        ? <span className="text-[9px] text-slate-400 whitespace-nowrap">{dateStr}</span>
                        : isFuture ? <span className="text-[9px] text-slate-300 italic">Pendente</span>
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

          {/* NF step */}
          <div className="flex items-start flex-1 min-w-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex flex-col items-center flex-shrink-0 cursor-default w-14">
                  <div className="relative flex items-center justify-center">
                    {(nfEnviada || nfAwaitingSubmission) && <span className="absolute w-7 h-7 rounded-full bg-amber-100 animate-ping opacity-60" />}
                    <div className={`relative w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                      nfCompleted ? 'bg-emerald-500 shadow-sm shadow-emerald-200'
                      : nfRecusada ? 'bg-red-500'
                      : nfEnviada ? 'bg-white border-2 border-amber-400'
                      : nfDevolvida ? 'bg-white border-2 border-orange-400'
                      : nfAwaitingSubmission ? 'bg-white border-2 border-amber-400'
                      : 'bg-gray-200 border border-gray-300'
                    }`}>
                      {nfCompleted && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                      {nfRecusada && <XCircle className="w-3 h-3 text-white" strokeWidth={2} />}
                      {nfEnviada && <div className="w-2 h-2 rounded-full bg-amber-400" />}
                      {nfDevolvida && <div className="w-2 h-2 rounded-full bg-orange-400" />}
                      {nfAwaitingSubmission && <div className="w-2 h-2 rounded-full bg-amber-300" />}
                    </div>
                  </div>
                  <span className={`text-[10px] font-semibold mt-1.5 whitespace-nowrap ${
                    nfCompleted ? 'text-emerald-600'
                    : nfEnviada || nfAwaitingSubmission ? 'text-amber-600'
                    : nfDevolvida ? 'text-orange-600'
                    : nfRecusada ? 'text-red-600'
                    : 'text-slate-400'
                  }`}>Nota Fiscal</span>
                  {nfDateStr
                    ? <span className="text-[9px] text-slate-400 whitespace-nowrap">{nfDateStr}</span>
                    : <span className="text-[9px] text-amber-500 italic font-medium">{nfEligible ? "Ag. envio" : "—"}</span>}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs max-w-[200px]">
                <p className="font-semibold">Nota Fiscal</p>
                <p className="text-gray-400">{nfTooltip}</p>
              </TooltipContent>
            </Tooltip>
            {/* Connector NF → Check-in */}
            <div className={`h-px flex-1 mt-3 rounded-full mx-1 transition-all ${checkinDone ? 'bg-emerald-300' : checkinEligible ? 'bg-violet-200' : 'bg-gray-200'}`} />
          </div>

          {/* Check-in step */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex flex-col items-center flex-shrink-0 cursor-default w-16">
                <div className="relative flex items-center justify-center">
                  {checkinEligible && !checkinDone && <span className="absolute w-7 h-7 rounded-full bg-violet-100 animate-ping opacity-60" />}
                  <div className={`relative w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                    checkinDone ? 'bg-emerald-500 shadow-sm shadow-emerald-200'
                    : checkinEligible ? 'bg-white border-2 border-violet-400'
                    : 'bg-gray-100 border border-gray-200'
                  }`}>
                    {checkinDone && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                    {checkinEligible && !checkinDone && <div className="w-2 h-2 rounded-full bg-violet-400" />}
                  </div>
                </div>
                <span className={`text-[10px] font-semibold mt-1.5 whitespace-nowrap ${
                  checkinDone ? 'text-emerald-600'
                  : checkinEligible ? 'text-violet-600'
                  : 'text-slate-300'
                }`}>Check-in</span>
                {checkinDateStr
                  ? <span className="text-[9px] text-slate-400 whitespace-nowrap">{checkinDateStr}</span>
                  : checkinEligible
                  ? <span className="text-[9px] text-violet-500 italic font-medium">Pendente</span>
                  : <span className="text-[9px] text-slate-300">—</span>}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs max-w-[200px]">
              <p className="font-semibold">Check-in Financeiro</p>
              <p className="text-gray-400">{STEP_TOOLTIPS[5]}</p>
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
      if (item.status === "aprovada_faturamento") {
        const nfInv = item.actual ? getInvoiceForActual(item.actual.id) : undefined;
        const nfSt = nfInv?.status || "pendente";
        // Green = NF approved (concluded); violet = NF in review; amber = pending/returned
        if (nfSt === "aprovada") return { border: "border-l-4 border-l-emerald-400", bg: "" };
        if (nfSt === "enviada") return { border: "border-l-4 border-l-blue-300", bg: "" };
        if (nfSt === "devolvida") return { border: "border-l-4 border-l-orange-300", bg: "" };
        return { border: "border-l-4 border-l-amber-300", bg: "" };
      }
      return { border: "border-l-4 border-l-red-400", bg: "" };
    }
    const days = getDiffDays(item.lastActivityDate);
    if (days > 30) return { border: "border-l-4 border-l-red-500", bg: "bg-red-50/20" };
    if (days > 7)  return { border: "border-l-4 border-l-amber-400", bg: "bg-amber-50/20" };
    if (days > 0)  return { border: "border-l-4 border-l-sky-400", bg: "" };
    return { border: "border-l-4 border-l-gray-200", bg: "" };
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
    const hasCheckin = !!nfInvCard?.checkinAt; // for the physical check-in button

    return (
      <div
        key={item.id}
        className={`rounded-lg bg-white border border-slate-100 overflow-hidden hover:shadow-sm transition-shadow ${borderStyle.border} ${borderStyle.bg}`}
      >
        {/* Card row */}
        <div
          className="flex items-center gap-3 px-4 py-2.5 cursor-pointer"
          onClick={() => toggleExpand(item.id)}
        >
          {/* Avatar */}
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${avatarColorRh(colName)}`}>
            {initialsRh(colName)}
          </div>

          {/* Name + meta */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-semibold text-slate-800 truncate">{colName}</span>
              {item.status === "aprovada_faturamento" ? (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
                  nfStatus === "aprovada"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : nfStatus === "enviada"
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : nfStatus === "devolvida"
                    ? "bg-orange-50 text-orange-700 border-orange-200"
                    : "bg-amber-50 text-amber-700 border-amber-200"
                }`}>
                  {nfStatus === "aprovada" ? "Concluído"
                    : nfStatus === "enviada" ? "NF em análise"
                    : nfStatus === "devolvida" ? "NF devolvida"
                    : "Ag. Nota Fiscal"}
                </span>
              ) : (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${config.badgeCls}`}>
                  {config.shortLabel}
                </span>
              )}
              {isResubmitted && (
                <span className="text-[9px] bg-violet-50 text-violet-600 border border-violet-200 font-medium px-1.5 py-0.5 rounded-full">Reenviado</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <p className="text-xs text-slate-500 truncate">
                {getFunctionName(item.functionId)}
                {item.planned?.collaboratorType && (
                  <span className="ml-1 text-slate-400">· {item.planned.collaboratorType === 'casa' ? 'Casa' : 'Freela'}</span>
                )}
              </p>
              {(() => {
                if (item.status === "aprovada_faturamento") return null;
                const today = new Date(); today.setHours(0, 0, 0, 0);
                const evEnd = item.event.endDate ? new Date(item.event.endDate) : null;
                const evStart = item.event.startDate ? new Date(item.event.startDate) : null;
                const isPending = item.status === "planejamento_pendente" || item.status === "prestacao_recebida";
                if (isPending) {
                  if (evEnd && evEnd < today) {
                    const dAgo = Math.floor((today.getTime() - evEnd.getTime()) / 864e5);
                    return (
                      <span className="text-[10px] font-semibold text-red-500 flex items-center gap-0.5 shrink-0">
                        <AlertTriangle className="w-2.5 h-2.5" /> Evento encerrado há {dAgo} dia{dAgo !== 1 ? 's' : ''}
                      </span>
                    );
                  }
                  if (evStart) {
                    const dUntil = Math.floor((evStart.getTime() - today.getTime()) / 864e5);
                    if (dUntil <= 14) {
                      return (
                        <span className="text-[10px] font-semibold text-orange-500 flex items-center gap-0.5 shrink-0">
                          <AlertTriangle className="w-2.5 h-2.5" /> Evento em {dUntil <= 0 ? 'andamento' : `${dUntil} dia${dUntil !== 1 ? 's' : ''}`}
                        </span>
                      );
                    }
                  }
                  return null;
                }
                if (days > 30) {
                  return (
                    <span className="text-[10px] font-semibold text-red-500 flex items-center gap-0.5 shrink-0">
                      <AlertTriangle className="w-2.5 h-2.5" /> {timeInStatus(item.lastActivityDate)}
                    </span>
                  );
                }
                return days > 0 ? <span className="text-[10px] text-slate-400 shrink-0">{timeInStatus(item.lastActivityDate)}</span> : null;
              })()}
            </div>
          </div>

          {/* Action button + chevron */}
          <div className="flex items-center gap-2 shrink-0">
            {needsRhAction && navTarget && !isExpanded && (
              <button
                className="text-[11px] font-semibold h-7 px-3 rounded-md text-white transition-colors"
                style={{ background: item.status === "prestacao_recebida" ? "#059669" : "#0033CC" }}
                onClick={(e) => { e.stopPropagation(); navigate(navTarget.path); }}
              >
                {item.status === "prestacao_recebida" ? "Analisar" : "Planejar"}
              </button>
            )}
            {nfEligible && !isExpanded && (() => {
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
                        className="text-[11px] font-semibold h-7 px-2.5 rounded-md disabled:opacity-50 text-white transition-colors"
                        style={{ background: '#059669' }}
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
                    className="text-[11px] font-semibold h-7 px-3 rounded-md text-white transition-colors"
                    style={{ background: '#6d28d9' }}
                    onClick={(e) => { e.stopPropagation(); setApprovingInvoiceId(nfInvCard?.id || null); setNfApprovalDate(""); }}
                  >
                    Aprovar NF
                  </button>
                );
              }
              if (nfStatus === "aprovada" && !hasCheckin) {
                const isDoingThis = checkinInvoiceId === nfInvCard?.id;
                if (isDoingThis) {
                  return (
                    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                      <button
                        disabled={doingCheckin}
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!nfInvCard?.id) return;
                          setDoingCheckin(true);
                          try {
                            await apiRequest("POST", `/api/invoices/${nfInvCard.id}/checkin`, { _userId: (user as any)?.id });
                            await queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
                            setCheckinInvoiceId(null);
                            toast({ title: "Check-in registrado com sucesso" });
                          } catch (err: any) {
                            toast({ title: "Erro ao registrar check-in", description: err?.message || "Tente novamente", variant: "destructive" });
                          } finally { setDoingCheckin(false); }
                        }}
                        className="text-[11px] font-semibold h-7 px-3 rounded-md disabled:opacity-50 text-white transition-colors"
                        style={{ background: '#059669' }}
                      >
                        {doingCheckin ? "..." : "Confirmar Check-in"}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setCheckinInvoiceId(null); }}
                        className="text-[11px] h-7 px-2 rounded-md border border-gray-200 text-slate-500 hover:bg-gray-50"
                      >✕</button>
                    </div>
                  );
                }
                return (
                  <button
                    className="text-[11px] font-semibold h-7 px-3 rounded-md text-white transition-colors flex items-center gap-1.5 shadow-sm"
                    style={{ background: '#7C3AED' }}
                    onClick={(e) => { e.stopPropagation(); setCheckinInvoiceId(nfInvCard?.id || null); }}
                  >
                    <CircleDot className="w-3 h-3" />
                    Fazer Check-in
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
          <div className="border-t border-slate-100 bg-slate-50/30 px-4 pb-4 pt-3 space-y-3">

            {/* Stepper */}
            <div className="rounded-lg bg-white border border-slate-100 px-4 py-3 shadow-sm">
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

              if (isZero) {
                return (
                  <div className="space-y-3">
                    <div className="rounded-lg px-4 py-2.5 flex items-center gap-2" style={{ background: '#F0FDF4', borderRadius: 6 }}>
                      <CheckCircle className="w-3.5 h-3.5 shrink-0" style={{ color: '#16A34A' }} />
                      <span style={{ fontSize: 12, color: '#16A34A' }}>
                        Sem diferença apurada — Planejado e realizado idênticos ({fmt(item.planned.totalValue)})
                      </span>
                    </div>
                    {/* Payment info after check-in — zero diff */}
                    {(() => {
                      const nfInvZ = item.actual ? getInvoiceForActual(item.actual.id) : null;
                      if (!nfInvZ?.checkinAt) return null;
                      const payDateZ = nfInvZ.paymentDate
                        ? new Date(nfInvZ.paymentDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
                        : null;
                      return (
                        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 flex items-center justify-between">
                          <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1.5">
                            <CheckCircle className="w-3.5 h-3.5" /> Check-in Financeiro Realizado
                          </span>
                          {payDateZ && <span className="text-[11px] text-emerald-600 font-medium">💳 Pagamento: {payDateZ}</span>}
                        </div>
                      );
                    })()}
                  </div>
                );
              }

              return (
                <div className="space-y-3">
                  {/* Diff strip */}
                  <div className="rounded-lg bg-slate-50 px-4 py-2.5 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-medium">Diferença apurada</span>
                    <div className="text-right">
                      <span className={`text-sm font-bold tabular-nums ${
                        isNegative ? 'text-emerald-600' : 'text-red-600'
                      }`}>
                        {`${isNegative ? '−' : '+'} ${fmt(Math.abs(diff))}`}
                      </span>
                      <p className="text-[9px] text-slate-400">
                        {isNegative ? `economia de ${pct}%` : `+${pct}% do planejado`}
                      </p>
                    </div>
                  </div>

                  {/* Payment info after check-in */}
                  {(() => {
                    const nfInvExp = item.actual ? getInvoiceForActual(item.actual.id) : null;
                    if (!nfInvExp) return null;
                    if (nfInvExp.checkinAt) {
                      const payDateStr = nfInvExp.paymentDate
                        ? new Date(nfInvExp.paymentDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
                        : null;
                      return (
                        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 flex items-center justify-between">
                          <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1.5">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Check-in Financeiro Realizado
                          </span>
                          {payDateStr && (
                            <span className="text-[11px] text-emerald-600 font-medium">
                              💳 Pagamento: {payDateStr}
                            </span>
                          )}
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Two panels */}
                  <div className="grid grid-cols-2 divide-x divide-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                    {/* Planejado */}
                    <div className="p-3">
                      <p className="text-[9px] font-semibold uppercase tracking-widest mb-2" style={{ color: '#0033CC' }}>Planejado</p>
                      <p className="text-base font-bold tabular-nums text-slate-800 mb-2">{fmt(item.planned.totalValue)}</p>
                      <div className="space-y-1 text-[10px]">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Diárias</span>
                          <span className="tabular-nums text-slate-600">{item.planned.dailyQuantity}× {fmt(item.planned.dailyValue)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Alimentação</span>
                          <span className="tabular-nums text-slate-600">{fmt(item.planned.weekdayLunch + item.planned.weekdayDinner + item.planned.weekendLunch + item.planned.weekendDinner)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Mobilidade</span>
                          <span className="tabular-nums text-slate-600">{fmt(item.planned.mobility + item.planned.transport)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Realizado */}
                    <div className="p-3">
                      <p className="text-[9px] font-semibold uppercase tracking-widest mb-2" style={{ color: '#6d28d9' }}>Realizado</p>
                      <p className="text-base font-bold tabular-nums text-slate-800 mb-2">{fmt(item.actual!.totalValue)}</p>
                      <div className="space-y-1 text-[10px]">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Diárias</span>
                          <span className="tabular-nums text-slate-600">{item.actual!.dailyQuantity}× {fmt(item.actual!.dailyValue)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Alimentação</span>
                          <span className="tabular-nums text-slate-600">{fmt(item.actual!.weekdayLunch + item.actual!.weekdayDinner + item.actual!.weekendLunch + item.actual!.weekendDinner)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Mobilidade</span>
                          <span className="tabular-nums text-slate-600">{fmt(item.actual!.mobility + item.actual!.transport)}</span>
                        </div>
                      </div>
                      {item.actual!.changeReason && (
                        <p className="text-[9px] text-slate-400 italic mt-2 pt-2 border-t border-gray-100">
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
              <div className="px-3 py-2.5 rounded-lg bg-slate-50 border border-gray-200">
                <p className="text-[10px] font-semibold text-slate-400 mb-1">Comentário do RH</p>
                <p className="text-xs text-slate-600">{item.actual.rhComment}</p>
                {item.actual.rhActionAt && (
                  <p className="text-[10px] text-slate-400 mt-1">
                    {formatDateTime(item.actual.rhActionAt)} — {getUserName(item.actual.rhActionBy)}
                  </p>
                )}
              </div>
            )}

            {/* Action footer */}
            {(navTarget || (item.status === "aprovada_faturamento" && item.actual)) && (
              <div className="flex items-center justify-between pt-1">
                {/* NF status info */}
                {item.status === "aprovada_faturamento" && item.actual && (() => {
                  const nfInv = getInvoiceForActual(item.actual!.id);
                  const nfStatus = nfInv?.status || "pendente";
                  if (nfStatus === "pendente") {
                    return (
                      <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <FileText className="w-3.5 h-3.5" />
                        Aguardando envio da nota fiscal
                      </span>
                    );
                  }
                  if (nfStatus === "devolvida") {
                    return (
                      <span className="flex items-center gap-1.5 text-[11px] text-orange-500 font-medium">
                        <FileText className="w-3.5 h-3.5" />
                        Nota devolvida
                      </span>
                    );
                  }
                  return <span />;
                })()}
                {!(item.status === "aprovada_faturamento" && item.actual) && <span />}

                {/* Primary / secondary nav button */}
                <div className="flex items-center gap-2 ml-auto">
                  {navTarget && (() => {
                    const isPrimary = item.status === "prestacao_recebida" || item.status === "planejamento_pendente";
                    const bg = item.status === "prestacao_recebida" ? "#059669" : "#0033CC";
                    return (
                      <button
                        onClick={() => navigate(navTarget.path)}
                        className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          isPrimary ? "text-white shadow-sm" : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                        style={isPrimary ? { background: bg } : undefined}
                      >
                        {item.status === "prestacao_recebida" ? "Analisar comparativo" : navTarget.label}
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    );
                  })()}

                  {item.status === "aprovada_faturamento" && item.actual && (() => {
                    const nfInv = getInvoiceForActual(item.actual!.id);
                    const nfStatus = nfInv?.status || "pendente";
                    if (nfStatus === "enviada") {
                      return (
                        <button
                          onClick={() => navigate(`/invoices?event=${item.event.id}&tab=aprovacao`)}
                          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white shadow-sm transition-colors"
                          style={{ background: '#6d28d9' }}
                        >
                          <FileText className="w-3 h-3" />
                          Aprovar nota fiscal
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      );
                    }
                    if (nfStatus === "devolvida") {
                      return (
                        <button
                          onClick={() => navigate(`/invoices?event=${item.event.id}`)}
                          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold border border-orange-200 text-orange-600 hover:bg-orange-50 transition-colors"
                        >
                          Ver notas fiscais
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      );
                    }
                    // nfStatus "aprovada" — show link to invoices page (to view NF and do physical check-in)
                    if (nfStatus === "aprovada") {
                      return (
                        <button
                          onClick={() => navigate(`/invoices?event=${item.event.id}`)}
                          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors"
                        >
                          <FileCheck className="w-3 h-3" />
                          Ver nota fiscal
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      );
                    }
                    // nfStatus "pendente" — navTarget block renders "Ver detalhes"
                    return null;
                  })()}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const totalItems = prestacaoItems.length;
  // "Concluído" = invoice approved + check-in done (directly from invoice data)
  const concludedCount = invoiceCounts.aprovada; // NF aprovada = fluxo concluído
  const totalForProgress = prestacaoItems.filter(item => !item.planned?.didNotAttend).length;
  const progressPct = totalForProgress > 0 ? Math.round(concludedCount / totalForProgress * 100) : 0;

  return (
    <div className="space-y-5 max-w-5xl mx-auto pb-24">

      {/* ── Page header ── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="h-[3px]" style={{ background: '#059669' }} />
        <div className="flex items-center gap-4 px-6 py-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#059669' }}>
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Controle de Prestações de Contas</h1>
            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
              {[
                { label: "Escalação", color: "#64748b" },
                { label: "Planejado", color: "#0033CC" },
                { label: "Realizado", color: "#6d28d9" },
                { label: "Aprovação", color: "#059669" },
                { label: "Nota Fiscal", color: "#6d28d9" },
                { label: "Check-in", color: "#059669" },
              ].map((step, i, arr) => (
                <span key={step.label} className="flex items-center gap-1">
                  <span className="text-xs font-semibold" style={{ color: step.color }}>{step.label}</span>
                  {i < arr.length - 1 && <span className="text-slate-300 text-xs">→</span>}
                </span>
              ))}
            </div>
          </div>
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

        // "Em andamento" = approved actuals in NF/invoicing stage (excluding check-in which is in Aguardando RH)
        const nfAgNf    = invoiceCounts.pending;         // NF not yet submitted
        const nfAnalise = invoiceCounts.enviada;         // NF under RH review
        const nfDevNf   = invoiceCounts.devolvida;       // NF returned for correction
        const emAndamento = nfAgNf + nfAnalise + nfDevNf;
        const recusada = statusCounts.recusada || 0;
        const chk = invoiceCounts.checkinPending || 0;   // NF approved, RH check-in pending

        const MetricLine = ({ label, val, color }: { label: string; val: number; color: string }) => (
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold tabular-nums w-7 text-right shrink-0" style={{ color: val > 0 ? color : '#ccc' }}>{val}</span>
            <span className="text-xs" style={{ color: val > 0 ? '#475569' : '#ccc' }}>{label}</span>
          </div>
        );

        const MetricCard = ({
          stripColor, icon: Icon, iconColor, title, value, children,
        }: {
          stripColor: string; icon: any; iconColor: string; title: string; value: number; children: any;
        }) => (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="h-[3px]" style={{ background: stripColor }} />
            <div className="p-5 flex flex-col flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-4 h-4" style={{ color: iconColor }} />
                <span className="text-xs font-semibold text-slate-600">{title}</span>
              </div>
              <div className="text-4xl font-bold tabular-nums mt-1 mb-3" style={{ color: iconColor }}>
                {isLoading ? <span className="inline-block w-12 h-9 bg-gray-200 rounded animate-pulse" /> : value}
              </div>
              <div className="space-y-1">
                {children}
              </div>
            </div>
          </div>
        );

        return (
          <div className="grid grid-cols-4 gap-4">
            <MetricCard stripColor="#ef4444" icon={AlertTriangle} iconColor="#ef4444" title="Aguardando RH" value={rhTotal}>
              <MetricLine label="Planejamento" val={rhPlan} color="#ef4444" />
              <MetricLine label="Comparativo"  val={rhComp} color="#ef4444" />
              <MetricLine label="Nota Fiscal"  val={rhNf}   color="#ef4444" />
            </MetricCard>

            <MetricCard stripColor="#0033CC" icon={Users} iconColor="#0033CC" title="Aguardando Colaborador" value={colTotal}>
              <MetricLine label="Realizado"    val={colReal}   color="#0033CC" />
              <MetricLine label="NF devolvida" val={colNfDev}  color="#0033CC" />
              <MetricLine label="Ag. NF"       val={colNfPend} color="#0033CC" />
            </MetricCard>

            <MetricCard stripColor="#d97706" icon={Clock} iconColor="#d97706" title="Nota Fiscal" value={emAndamento}>
              <MetricLine label="Ag. envio"    val={nfAgNf}    color="#d97706" />
              <MetricLine label="Em análise"   val={nfAnalise} color="#d97706" />
              <MetricLine label="NF devolvida" val={nfDevNf}   color="#d97706" />
            </MetricCard>

            <MetricCard stripColor="#059669" icon={CheckCircle} iconColor="#059669" title="Concluídos" value={concludedCount}>
              <MetricLine label={`de ${totalForProgress} total`} val={concludedCount} color="#059669" />
              {chk > 0 && <MetricLine label={`ag. check-in físico`} val={chk} color="#7C3AED" />}
              {recusada > 0 && <MetricLine label={`recusado${recusada !== 1 ? 's' : ''}`} val={recusada} color="#ef4444" />}
            </MetricCard>
          </div>
        );
      })()}

      {/* ── Pending action banner ── */}
      {!isLoading && rhActionCount > 0 && !isRhFilterActive && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="h-[3px]" style={{ background: '#f97316' }} />
          <div className="flex items-center gap-5 px-5 py-4">
            {/* Count badge */}
            <div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center font-bold text-xl text-white" style={{ background: '#f97316' }}>
              {rhActionCount}
            </div>

            {/* Text + progress */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800">
                {rhActionCount} pendência{rhActionCount !== 1 ? 's' : ''} aguardando ação do RH
              </p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {rhPlanPendingCount > 0 && (
                  <button
                    onClick={() => { setFilterStatus("planejamento_pendente"); setFilterCheckinOnly(false); }}
                    className="text-[10px] text-slate-500 hover:text-slate-700 cursor-pointer"
                    style={{ textDecoration: 'underline', textDecorationStyle: 'dashed', background: 'none', border: 'none', padding: 0 }}
                  >· {rhPlanPendingCount} planejamento{rhPlanPendingCount > 1 ? 's' : ''}</button>
                )}
                {rhReceivedCount > 0 && (
                  <button
                    onClick={() => { setFilterStatus("prestacao_recebida"); setFilterCheckinOnly(false); }}
                    className="text-[10px] text-slate-500 hover:text-slate-700 cursor-pointer"
                    style={{ textDecoration: 'underline', textDecorationStyle: 'dashed', background: 'none', border: 'none', padding: 0 }}
                  >· {rhReceivedCount} comparativo{rhReceivedCount > 1 ? 's' : ''}</button>
                )}
                {rhNfPendingCount > 0 && (
                  <button
                    onClick={() => { setFilterInvoiceStatus("enviada"); setFilterStatus("all"); setFilterCheckinOnly(false); }}
                    className="text-[10px] text-violet-600 hover:text-violet-800 cursor-pointer"
                    style={{ textDecoration: 'underline', textDecorationStyle: 'dashed', background: 'none', border: 'none', padding: 0 }}
                  >· {rhNfPendingCount} nota{rhNfPendingCount > 1 ? 's fiscais' : ' fiscal'}</button>
                )}
                {(invoiceCounts.checkinPending || 0) > 0 && (
                  <button
                    onClick={() => { setFilterCheckinOnly(true); setFilterStatus("all"); }}
                    className="text-[10px] text-violet-600 font-medium hover:text-violet-800 cursor-pointer"
                    style={{ textDecoration: 'underline', textDecorationStyle: 'dashed', background: 'none', border: 'none', padding: 0 }}
                  >· {invoiceCounts.checkinPending} check-in{(invoiceCounts.checkinPending || 0) > 1 ? 's' : ''}</button>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1.5">
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden max-w-[240px]">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${progressPct}%`, background: "#f97316" }}
                  />
                </div>
                <span className="text-xs text-slate-500 whitespace-nowrap">
                  Progresso geral: <span className="font-semibold text-slate-700">{concludedCount}</span> de {totalForProgress} itens
                </span>
              </div>
            </div>

            {/* CTA */}
            <button
              className="text-xs font-bold px-4 py-2 rounded-lg text-white transition-colors shrink-0 shadow-sm"
              style={{ background: '#f97316' }}
              onClick={() => {
                setFilterEvent("all");
                setFilterFunction("all");
                setFilterCollaborator("all");
                setFilterInvoiceStatus("all");
                setSearchTerm("");
                setFilterStatus("rh_action");
                setFilterCheckinOnly(false);
                setShowConcluded(false);
                setTimeout(() => document.getElementById("rh-listing")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
              }}
            >
              Ver pendências
            </button>
          </div>
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
              className="h-8 pl-9 text-xs border-gray-200"
            />
          </div>

          <button
            className={`h-8 px-3 text-xs rounded-md border flex items-center gap-1.5 transition-colors ${
              showConcluded ? 'border-blue-300 text-blue-700 bg-blue-50' : 'border-gray-200 text-slate-500 hover:border-gray-300 bg-white'
            }`}
            onClick={() => setShowConcluded(!showConcluded)}
          >
            <div className={`w-7 h-4 rounded-full relative flex items-center transition-all ${showConcluded ? 'bg-blue-600' : 'bg-gray-200'}`}>
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
              onClick={() => { setFilterEvent("all"); setFilterFunction("all"); setFilterCollaborator("all"); setFilterStatus("all"); setFilterInvoiceStatus("all"); setSearchTerm(""); setFilterCheckinOnly(false); }}>
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
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-slate-50 border border-gray-200 text-xs text-slate-500">
          <Shield className="w-3.5 h-3.5 text-slate-400" />
          Mostrando apenas pendências do RH ({rhActionCount} ite{rhActionCount === 1 ? 'm' : 'ns'})
          <button className="ml-auto text-blue-600 hover:text-blue-800 font-medium" onClick={() => { setFilterStatus("all"); setFilterCheckinOnly(false); }}>Limpar</button>
        </div>
      )}
      {filterCheckinOnly && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-violet-50 border border-violet-200 text-xs text-violet-700">
          <CircleDot className="w-3.5 h-3.5 text-violet-500" />
          Mostrando apenas check-ins pendentes ({filteredItems.length} ite{filteredItems.length === 1 ? 'm' : 'ns'})
          <button className="ml-auto text-violet-600 hover:text-violet-800 font-medium" onClick={() => setFilterCheckinOnly(false)}>Limpar</button>
        </div>
      )}
      {(filterStatus !== "all" && filterStatus !== "rh_action") && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-slate-50 border border-gray-200 text-xs text-slate-500">
          <Shield className="w-3.5 h-3.5 text-slate-400" />
          Filtro ativo: {filterStatus === "planejamento_pendente" ? "Planejamento pendente" : filterStatus === "prestacao_recebida" ? "Comparativo recebido" : filterStatus} ({filteredItems.length} ite{filteredItems.length === 1 ? 'm' : 'ns'})
          <button className="ml-auto text-blue-600 hover:text-blue-800 font-medium" onClick={() => { setFilterStatus("all"); setFilterCheckinOnly(false); }}>Limpar</button>
        </div>
      )}

      {/* ── Content ── */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-lg border border-gray-200 bg-white px-4 py-3 animate-pulse flex items-center gap-3">
              <div className="w-8 h-8 bg-gray-200 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-gray-200 rounded w-32" />
                <div className="h-2.5 bg-gray-100 rounded w-48" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div id="rh-listing" className="rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center">
          <Shield className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-500">Nenhum item encontrado</p>
          <p className="text-xs text-slate-400 mt-1">
            {hasActiveFilters ? "Ajuste os filtros para ver mais resultados." :
             showConcluded ? "Nenhum item com nota fiscal aprovada ainda." :
             "Todos os itens estão em dia. Ative 'Concluídos' para ver os itens com NF aprovada."}
          </p>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" className="mt-3 text-xs"
              onClick={() => { setFilterEvent("all"); setFilterFunction("all"); setFilterCollaborator("all"); setFilterStatus("all"); setSearchTerm(""); setFilterCheckinOnly(false); }}>
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
              <span className="text-xs font-medium text-slate-600">Por evento</span>
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
            // Split aprovada_faturamento: only truly concluded when NF is approved
            const nfApprovedCount = group.items.filter(i => {
              if (i.status !== "aprovada_faturamento" || !i.actual) return false;
              const inv = getInvoiceForActual(i.actual.id);
              return inv?.status === "aprovada" && !!inv?.checkinAt;
            }).length;
            const checkinPendingGroupCount = group.items.filter(i => {
              if (i.status !== "aprovada_faturamento" || !i.actual) return false;
              const inv = getInvoiceForActual(i.actual.id);
              return inv?.status === "aprovada" && !inv?.checkinAt;
            }).length;
            const agNfCount = (statuses.aprovada_faturamento || 0) - nfApprovedCount - checkinPendingGroupCount;
            return (
              <div key={group.event.id} className="rounded-xl bg-white border border-slate-200 overflow-hidden shadow-sm">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50/60 transition-colors"
                  onClick={() => toggleEventExpand(group.event.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${isOpen ? 'rotate-90' : ''}`} />
                    <div className="text-left min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{group.event.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-400">{group.items.length} ite{group.items.length === 1 ? 'm' : 'ns'}</span>
                        {group.actionNeeded > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200">
                            {group.actionNeeded} pendente{group.actionNeeded !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1 shrink-0">
                          {statuses.prestacao_recebida ? <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">{statuses.prestacao_recebida} comp.</span> : null}
                          {statuses.planejamento_pendente ? <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">{statuses.planejamento_pendente} plan.</span> : null}
                          {statuses.devolvida_para_ajuste ? <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200">{statuses.devolvida_para_ajuste} dev.</span> : null}
                          {statuses.aguardando_prestacao ? <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">{statuses.aguardando_prestacao} ag.</span> : null}
                          {agNfCount > 0 ? <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-200">{agNfCount} ag.NF</span> : null}
                          {checkinPendingGroupCount > 0 ? <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-300">{checkinPendingGroupCount} chk.</span> : null}
                          {nfApprovedCount > 0 ? <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">{nfApprovedCount} conc.</span> : null}
                          {statuses.recusada ? <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">{statuses.recusada} rec.</span> : null}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="text-[11px] space-y-1 p-2.5">
                        <div className="font-semibold text-gray-600 mb-1.5">Etapas presentes</div>
                        {statuses.prestacao_recebida ? <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" /><span className="text-blue-600">Comparativo ({statuses.prestacao_recebida})</span></div> : null}
                        {statuses.planejamento_pendente ? <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" /><span className="text-amber-600">Planejamento pendente ({statuses.planejamento_pendente})</span></div> : null}
                        {statuses.devolvida_para_ajuste ? <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" /><span className="text-orange-600">Devolvida ({statuses.devolvida_para_ajuste})</span></div> : null}
                        {statuses.aguardando_prestacao ? <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" /><span className="text-slate-500">Aguardando prestação ({statuses.aguardando_prestacao})</span></div> : null}
                        {agNfCount > 0 ? <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-400 shrink-0" /><span className="text-violet-600">Aguardando Nota Fiscal ({agNfCount})</span></div> : null}
                        {nfApprovedCount > 0 ? <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" /><span className="text-emerald-600">Concluído ({nfApprovedCount})</span></div> : null}
                        {statuses.recusada ? <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400 shrink-0" /><span className="text-red-600">Recusada ({statuses.recusada})</span></div> : null}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 px-3 py-2 space-y-1.5 bg-slate-50/40">
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
