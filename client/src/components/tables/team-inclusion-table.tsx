import { useState, useMemo } from "react";
import { formatDiarias, fixEncoding } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit, MessageCircle, History, Check, X, Trash2, Copy, Ban, LayoutGrid, Save, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import StatusBadge from "@/components/common/status-badge";
import CommentsModal from "@/components/modals/comments-modal";
import ConfirmModal, { type ConfirmVariant } from "@/components/common/confirm-modal";
import UniversalFilters from "@/components/common/universal-filters";
import SortableHeader, { type SortConfig, type SortField } from "@/components/common/sortable-header";
import type { TeamInclusion, Event, Function, Collaborator, SwapRequest } from "@shared/schema";
import { isReadOnly } from "@/lib/interactions";

// Convert ALL CAPS names to Title Case for better readability
// Uses split-by-space to avoid issues with accented chars (ã, ç, etc.)
const toTitleCase = (str: string) =>
  str.toLowerCase().split(' ').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');

// Helper: Mostrar "Escalado" apenas quando não precisa passagem nem hospedagem
const getDisplayStatus = (inclusion: TeamInclusion) => {
  if (inclusion.status === "escalado" && (inclusion.needsTicket || inclusion.needsAccommodation)) {
    if (inclusion.needsTicket) return "aguardando_passagem";
    if (inclusion.needsAccommodation) return "aguardando_hospedagem";
  }
  return inclusion.status;
};

export default function TeamInclusionTable() {
  const [selectedInclusion, setSelectedInclusion] = useState<string | null>(null);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingInclusion, setEditingInclusion] = useState<TeamInclusion | null>(null);
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editSelectedDays, setEditSelectedDays] = useState<Set<string>>(new Set());
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState({
    eventId: "all",
    functionId: "all",
    collaboratorId: "all",
    status: "all",
    escalationStatus: "all",
    searchId: "",
  });
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [confirmState, setConfirmState] = useState<{
    open: boolean; variant: ConfirmVariant; title: string; message: string; confirmLabel: string; onConfirm: () => void;
  }>({ open: false, variant: 'delete', title: '', message: '', confirmLabel: '', onConfirm: () => {} });
  const openConfirm = (cfg: Omit<typeof confirmState, 'open'>) => setConfirmState({ ...cfg, open: true });
  const closeConfirm = () => setConfirmState(prev => ({ ...prev, open: false }));
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: allSwapRequests } = useQuery<SwapRequest[]>({
    queryKey: ["/api/swap-requests"],
    queryFn: async () => {
      const r = await fetch("/api/swap-requests");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const approvedSwapInclusionIds = useMemo(() => {
    const ids = new Set<string>();
    allSwapRequests?.filter(s => s.status === 'aprovado').forEach(s => {
      const id = (s as any).team_inclusion_id || s.teamInclusionId;
      if (id) ids.add(id);
    });
    return ids;
  }, [allSwapRequests]);

  // Handle column sorting
  const handleSort = (field: SortField) => {
    setSortConfig(current => {
      if (current?.field === field) {
        return current.direction === 'asc' 
          ? { field, direction: 'desc' }
          : null; // Remove sorting on third click
      } else {
        return { field, direction: 'asc' };
      }
    });
  };

  const { data: teamInclusions, isLoading } = useQuery<TeamInclusion[]>({
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

  const getEventName = (eventId: string) => {
    return events?.find(e => e.id === eventId)?.name || "Evento não encontrado";
  };

  const getEventLocation = (eventId: string) => {
    return events?.find(e => e.id === eventId)?.location || "";
  };

  const getFunctionName = (functionId: string) => {
    return functions?.find(f => f.id === functionId)?.name || "Função não encontrada";
  };

  const getFunctionArea = (functionId: string) => {
    return "Área definida no cadastro"; // Simplified since responsibleArea was removed
  };

  const getCollaboratorName = (collaboratorId?: string) => {
    if (!collaboratorId) return "Não escalado";
    return fixEncoding(collaborators?.find(c => c.id === collaboratorId)?.fullName) || "Colaborador não encontrado";
  };

  const formatDate = (dateStr: string) => {
    // Parse manual para evitar problemas de timezone
    const [year, month, day] = dateStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  };

  const handleViewComments = (inclusionId: string) => {
    setSelectedInclusion(inclusionId);
    setShowCommentsModal(true);
  };

  // Normaliza qualquer valor de data para "YYYY-MM-DD"
  const normDay = (d: any): string => {
    if (!d) return '';
    if (typeof d === 'string') return d.split('T')[0];
    if (d instanceof Date) return d.toISOString().split('T')[0];
    return String(d).split('T')[0];
  };

  const generateDaysInRange = (start: string, end: string): string[] => {
    const s = normDay(start);
    const e = normDay(end);
    if (!s || !e) return [];
    const days: string[] = [];
    // Usar split YYYY-MM-DD diretamente para evitar conversão UTC
    const [sy, sm, sd] = s.split('-').map(Number);
    const [ey, em, ed] = e.split('-').map(Number);
    const cur = new Date(sy, sm - 1, sd);
    const endDate = new Date(ey, em - 1, ed);
    while (cur <= endDate) {
      const yy = cur.getFullYear();
      const mm = String(cur.getMonth() + 1).padStart(2, '0');
      const dd = String(cur.getDate()).padStart(2, '0');
      days.push(`${yy}-${mm}-${dd}`);
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  };

  const handleEdit = (inclusionId: string) => {
    const inclusion = teamInclusions?.find(i => i.id === inclusionId);
    if (inclusion) {
      const start = normDay(inclusion.scheduleStartDate) || "";
      const end = normDay(inclusion.scheduleEndDate) || "";
      setEditStartDate(start);
      setEditEndDate(end);
      // Normalize workDays para garantir formato YYYY-MM-DD
      const normalizedWorkDays = (inclusion.workDays || []).map(normDay).filter(Boolean);
      if (normalizedWorkDays.length > 0) {
        setEditSelectedDays(new Set(normalizedWorkDays));
      } else {
        // Nenhum workDay salvo — seleciona o range completo
        setEditSelectedDays(new Set(generateDaysInRange(start, end)));
      }
      setEditingInclusion(inclusion);
      setShowEditModal(true);
    }
  };

  const updateTeamInclusionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PATCH", `/api/team-inclusions/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Inclusão atualizada com sucesso",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
      setShowEditModal(false);
      setEditingInclusion(null);
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao atualizar inclusão",
        variant: "destructive",
      });
    },
  });


  const canCancelEscalation = (inclusion: TeamInclusion) => {
    // Pode cancelar em qualquer status, exceto quando já está cancelado
    return inclusion.status !== 'cancelado';
  };

  // ── Grade de diárias em lote ────────────────────────────────────────────────
  const [showBatchDiarias, setShowBatchDiarias] = useState(false);
  // inclusionId → array de dias selecionados (YYYY-MM-DD)
  const [batchDiariasSelections, setBatchDiariasSelections] = useState<Record<string, string[]>>({});
  const [batchTargetIds, setBatchTargetIds] = useState<string[]>([]);

  const openBatchDiarias = () => {
    // Usa as linhas selecionadas com checkbox; se nenhuma, usa todas as filtradas
    const targets = selectedRows.size > 0
      ? filteredAndSortedInclusions.filter(inc => selectedRows.has(inc.id))
      : filteredAndSortedInclusions;

    const initial: Record<string, string[]> = {};
    targets.forEach(inc => {
      const start = normDay(inc.scheduleStartDate);
      const end = normDay(inc.scheduleEndDate);
      const savedDays = (inc.workDays || []).map(normDay).filter(Boolean);
      initial[inc.id] = savedDays.length > 0 ? savedDays : generateDaysInRange(start, end);
    });
    setBatchDiariasSelections(initial);
    setBatchTargetIds(targets.map(i => i.id));
    setShowBatchDiarias(true);
  };

  const toggleBatchDay = (inclusionId: string, day: string) => {
    setBatchDiariasSelections(prev => {
      const cur = prev[inclusionId] ?? [];
      const next = cur.includes(day) ? cur.filter(d => d !== day) : [...cur, day];
      return { ...prev, [inclusionId]: next };
    });
  };

  const batchSaveDiariasMutation = useMutation({
    mutationFn: async (changes: Array<{ id: string; dailyRates: number; workDays: string[] }>) => {
      await Promise.all(
        changes.map(({ id, ...data }) =>
          apiRequest("PATCH", `/api/team-inclusions/${id}`, data).then(r => r.json())
        )
      );
    },
    onSuccess: () => {
      toast({ title: "Diárias salvas", description: "Todas as alterações foram aplicadas." });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
      setShowBatchDiarias(false);
    },
    onError: () => {
      toast({ title: "Erro", description: "Erro ao salvar as diárias.", variant: "destructive" });
    },
  });

  const handleSaveBatchDiarias = () => {
    const changes: Array<{ id: string; dailyRates: number; workDays: string[] }> = [];
    batchTargetIds.forEach(id => {
      const inc = filteredAndSortedInclusions.find(i => i.id === id);
      if (!inc) return;
      const newDays = [...(batchDiariasSelections[id] ?? [])].sort();
      const origDays = (inc.workDays || []).map(normDay).filter(Boolean).sort();
      const origDr = inc.dailyRates ?? 0;
      if (newDays.join(',') !== origDays.join(',') || newDays.length !== origDr) {
        changes.push({ id, dailyRates: newDays.length, workDays: newDays });
      }
    });
    if (changes.length === 0) {
      toast({ title: "Sem alterações", description: "Nenhum dia foi modificado." });
      return;
    }
    batchSaveDiariasMutation.mutate(changes);
  };
  // ────────────────────────────────────────────────────────────────────────────

  const canDeleteInclusion = (inclusion: TeamInclusion) => {
    // Só pode excluir antes da escalação (não pode ter comprado nada)
    const blockedStatuses = ['aguardando_producao', 'escalado', 'passagem_comprada', 'hospedagem_comprada', 'hospedagem_passagem_comprada'];
    return !blockedStatuses.includes(inclusion.status);
  };

  const deleteTeamInclusionMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/team-inclusions/${id}`);
      if (response.ok) {
        return { success: true };
      }
      throw new Error("Erro ao remover inclusão");
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Inclusão removida com sucesso",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao remover inclusão",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (inclusionId: string) => {
    openConfirm({
      variant: 'delete',
      title: 'Remover inclusão?',
      message: 'Esta ação não pode ser desfeita.',
      confirmLabel: 'Remover',
      onConfirm: () => { closeConfirm(); deleteTeamInclusionMutation.mutate(inclusionId); },
    });
  };

  const cancelEscalationMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("PATCH", `/api/team-inclusions/${id}`, {
        status: "cancelado",
        phase: "cancelado"
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Escalação cancelada com sucesso",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao cancelar escalação",
        variant: "destructive",
      });
    },
  });

  const handleCancelEscalation = (inclusionId: string) => {
    openConfirm({
      variant: 'cancel',
      title: 'Cancelar escalação?',
      message: 'Esta ação não pode ser desfeita.',
      confirmLabel: 'Cancelar escalação',
      onConfirm: () => { closeConfirm(); cancelEscalationMutation.mutate(inclusionId); },
    });
  };


  // Ações em lote
  const toggleRowSelection = (inclusionId: string) => {
    setSelectedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(inclusionId)) {
        newSet.delete(inclusionId);
      } else {
        newSet.add(inclusionId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedRows.size === filteredAndSortedInclusions.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filteredAndSortedInclusions.map(i => i.id)));
    }
  };

  const handleBulkDelete = () => {
    if (selectedRows.size === 0) {
      toast({ title: "Nenhuma seleção", description: "Selecione pelo menos uma inclusão para excluir.", variant: "destructive" });
      return;
    }

    const deletableIds = Array.from(selectedRows).filter(id => {
      const inclusion = teamInclusions?.find(i => i.id === id);
      return inclusion && canDeleteInclusion(inclusion);
    });

    if (deletableIds.length === 0) {
      toast({ title: "Não é possível excluir", description: "Nenhuma das inclusões selecionadas pode ser excluída (já foram confirmadas ou compradas).", variant: "destructive" });
      return;
    }

    const blockedCount = selectedRows.size - deletableIds.length;
    const confirmMessage = blockedCount > 0
      ? `${deletableIds.length} de ${selectedRows.size} inclusões podem ser excluídas. ${blockedCount} não podem ser excluídas (confirmadas/compradas). Deseja continuar?`
      : `${deletableIds.length} inclusão(ões) serão removidas permanentemente.`;

    openConfirm({
      variant: 'delete',
      title: 'Remover inclusões?',
      message: confirmMessage,
      confirmLabel: 'Remover',
      onConfirm: async () => {
        closeConfirm();
        let successCount = 0;
        let errorCount = 0;
        for (const id of deletableIds) {
          try {
            const response = await apiRequest("DELETE", `/api/team-inclusions/${id}`);
            if (response.ok) { successCount++; } else { errorCount++; }
          } catch { errorCount++; }
        }
        queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
        setSelectedRows(new Set());
        toast({
          title: successCount > 0 ? "Sucesso" : "Erro",
          description: `${successCount} inclusão(ões) excluída(s). ${errorCount > 0 ? `${errorCount} erro(s).` : ''}`,
          variant: errorCount > 0 ? "destructive" : "default",
        });
      },
    });
  };

  const handleBulkCancel = () => {
    if (selectedRows.size === 0) {
      toast({ title: "Nenhuma seleção", description: "Selecione pelo menos uma inclusão para cancelar.", variant: "destructive" });
      return;
    }

    openConfirm({
      variant: 'cancel',
      title: 'Cancelar escalações?',
      message: `${selectedRows.size} escalação(ões) selecionada(s) serão canceladas. Esta ação não pode ser desfeita.`,
      confirmLabel: 'Cancelar escalações',
      onConfirm: async () => {
        closeConfirm();
        let successCount = 0;
        let errorCount = 0;
        for (const id of Array.from(selectedRows)) {
          try {
            const response = await apiRequest("PATCH", `/api/team-inclusions/${id}`, { status: "cancelado", phase: "cancelado" });
            if (response.ok) { successCount++; } else { errorCount++; }
          } catch { errorCount++; }
        }
        queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
        setSelectedRows(new Set());
        toast({
          title: successCount > 0 ? "Sucesso" : "Erro",
          description: `${successCount} escalação(ões) cancelada(s). ${errorCount > 0 ? `${errorCount} erro(s).` : ''}`,
          variant: errorCount > 0 ? "destructive" : "default",
        });
      },
    });
  };

  // Filter and sort inclusions based on current filters
  const filteredAndSortedInclusions = useMemo(() => {
    const filtered = teamInclusions?.filter(inclusion => {
      if (filters.eventId !== "all" && inclusion.eventId !== filters.eventId) return false;
      if (filters.functionId !== "all" && inclusion.functionId !== filters.functionId) return false;
      if (filters.collaboratorId !== "all" && inclusion.collaboratorId !== filters.collaboratorId) return false;
      if (filters.status !== "all" && inclusion.status !== filters.status) return false;
      if (filters.escalationStatus === "pending" && (inclusion.collaboratorId || inclusion.status === "cancelado")) return false;
      if (filters.escalationStatus === "escalated" && (!inclusion.collaboratorId || inclusion.status === "cancelado")) return false;
      if (filters.escalationStatus === "cancelado" && inclusion.status !== "cancelado") return false;
      // Busca exata por ID (número de inclusão)
      if (filters.searchId) {
        const q = filters.searchId.replace(/#/g, '').trim().toLowerCase();
        const n = String(inclusion.inclusionNumber ?? '').toLowerCase();
        if (!n.includes(q)) return false;
      }
      return true;
    }) || [];

    // Apply custom sorting if configured
    if (sortConfig) {
      const { field, direction } = sortConfig;
      const multiplier = direction === 'asc' ? 1 : -1;
      
      return filtered.sort((a, b) => {
        switch (field) {
          case 'id':
            const idA = a.inclusionNumber || 0;
            const idB = b.inclusionNumber || 0;
            return (idA - idB) * multiplier;
          case 'event':
            const eventA = getEventName(a.eventId);
            const eventB = getEventName(b.eventId);
            return eventA.localeCompare(eventB, 'pt-BR') * multiplier;
          case 'function':
            const functionA = getFunctionName(a.functionId);
            const functionB = getFunctionName(b.functionId);
            return functionA.localeCompare(functionB, 'pt-BR') * multiplier;
          case 'collaborator':
            const collabA = getCollaboratorName(a.collaboratorId || undefined);
            const collabB = getCollaboratorName(b.collaboratorId || undefined);
            return collabA.localeCompare(collabB, 'pt-BR') * multiplier;
          case 'status':
            return a.status.localeCompare(b.status, 'pt-BR') * multiplier;
          case 'date':
            if (!a.scheduleStartDate && !b.scheduleStartDate) return 0;
            if (!a.scheduleStartDate) return 1 * multiplier;
            if (!b.scheduleStartDate) return -1 * multiplier;
            return (new Date(a.scheduleStartDate).getTime() - new Date(b.scheduleStartDate).getTime()) * multiplier;
          default:
            return 0;
        }
      });
    }
    
    // Default sorting: Event → Function → Date
    return filtered.sort((a, b) => {
      const eventA = getEventName(a.eventId);
      const eventB = getEventName(b.eventId);
      const eventComparison = eventA.localeCompare(eventB, 'pt-BR');
      if (eventComparison !== 0) return eventComparison;
      
      const functionA = getFunctionName(a.functionId);
      const functionB = getFunctionName(b.functionId);
      const functionComparison = functionA.localeCompare(functionB, 'pt-BR');
      if (functionComparison !== 0) return functionComparison;
      
      if (!a.scheduleStartDate && !b.scheduleStartDate) return 0;
      if (!a.scheduleStartDate) return 1;
      if (!b.scheduleStartDate) return -1;
      return new Date(a.scheduleStartDate).getTime() - new Date(b.scheduleStartDate).getTime();
    });
  }, [teamInclusions, filters, sortConfig, events, functions, collaborators]);

  // Totals base: only base filters (event, function, collaborator, searchId)
  // Ignores status AND escalationStatus so card counts never change when a card is clicked
  const totalsBase = useMemo(() => {
    return teamInclusions?.filter(inclusion => {
      if (filters.eventId !== "all" && inclusion.eventId !== filters.eventId) return false;
      if (filters.functionId !== "all" && inclusion.functionId !== filters.functionId) return false;
      if (filters.collaboratorId !== "all" && inclusion.collaboratorId !== filters.collaboratorId) return false;
      if (filters.searchId) {
        const q = filters.searchId.replace(/#/g, '').trim().toLowerCase();
        const n = String(inclusion.inclusionNumber ?? '').toLowerCase();
        if (!n.includes(q)) return false;
      }
      return true;
    }) || [];
  }, [teamInclusions, filters.eventId, filters.functionId, filters.collaboratorId, filters.searchId]);

  // Calculate real totals from totalsBase (ignores status filter so cards always show correct counts)
  const totals = {
    incluidos: totalsBase.length,
    pendentes: totalsBase.filter(i => !i.collaboratorId && i.status !== 'cancelado').length,
    escalados: totalsBase.filter(i => i.collaboratorId && i.status !== 'cancelado').length,
    aguardando_passagem: totalsBase.filter(i => i.needsTicket && i.status === 'passagem').length,
    hospedagem: totalsBase.filter(i => i.status === 'hospedagem').length,
    passagem_comprada: totalsBase.filter(i => i.status === 'passagem_comprada').length,
    hospedagem_comprada: totalsBase.filter(i => i.status === 'hospedagem_comprada').length,
    cancelados: totalsBase.filter(i => i.status === 'cancelado').length,
  };

  if (isLoading) {
    return (
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-muted rounded w-1/3"></div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <UniversalFilters filters={filters} onFiltersChange={setFilters} />

      {/* Totals Summary */}
      <div className="mb-6">
        <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
          {([
            { value: totals.incluidos,           label: "Total",          color: "text-blue-600",    border: "border-t-blue-400",    activeBg: "bg-blue-50",    filterType: "all",        filterValue: "all",                 testId: "total-incluidos" },
            { value: totals.pendentes,           label: "Pendentes",      color: "text-red-500",     border: "border-t-red-400",     activeBg: "bg-red-50",     filterType: "escalation", filterValue: "pending",             testId: "total-pendentes" },
            { value: totals.escalados,           label: "Escalados",      color: "text-green-600",   border: "border-t-green-500",   activeBg: "bg-green-50",   filterType: "escalation", filterValue: "escalated",           testId: "total-escalados" },
            { value: totals.aguardando_passagem, label: "Passagem",       color: "text-orange-600",  border: "border-t-orange-400",  activeBg: "bg-orange-50",  filterType: "status",     filterValue: "passagem",            testId: "total-passagem" },
            { value: totals.hospedagem,          label: "Hospedagem",     color: "text-purple-600",  border: "border-t-purple-400",  activeBg: "bg-purple-50",  filterType: "status",     filterValue: "hospedagem",          testId: "total-hospedagem" },
            { value: totals.passagem_comprada,   label: "Pass. Comprada", color: "text-emerald-600", border: "border-t-emerald-400", activeBg: "bg-emerald-50", filterType: "status",     filterValue: "passagem_comprada",   testId: "total-passagem-comprada" },
            { value: totals.hospedagem_comprada, label: "Hosp. Comprada", color: "text-indigo-600",  border: "border-t-indigo-400",  activeBg: "bg-indigo-50",  filterType: "status",     filterValue: "hospedagem_comprada", testId: "total-hospedagem-comprada" },
            { value: totals.cancelados,          label: "Cancelados",     color: "text-gray-400",    border: "border-t-gray-300",    activeBg: "bg-gray-50",    filterType: "escalation", filterValue: "cancelado",           testId: "total-cancelados" },
          ] as const).map(({ value, label, color, border, activeBg, filterType, filterValue, testId }) => {
            const isActive =
              filterType === "all"
                ? filters.status === "all" && filters.escalationStatus === "all"
                : filterType === "status"
                  ? filters.status === filterValue
                  : filters.escalationStatus === filterValue;

            const handleClick = () => {
              if (filterType === "all") {
                setFilters(f => ({ ...f, status: "all", escalationStatus: "all" }));
              } else if (filterType === "status") {
                setFilters(f => ({ ...f, status: isActive ? "all" : filterValue, escalationStatus: "all" }));
              } else {
                setFilters(f => ({ ...f, escalationStatus: isActive ? "all" : filterValue, status: "all" }));
              }
            };

            return (
              <div
                key={testId}
                onClick={handleClick}
                className={`border border-t-2 ${border} rounded-xl px-3 py-2.5 text-center cursor-pointer transition-all duration-150 select-none
                  ${isActive
                    ? `${activeBg} border-slate-200 shadow-sm`
                    : "bg-white border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5"}`}
                data-testid={testId}
              >
                <div className={`text-[22px] font-bold tabular-nums leading-none ${color}`}>{value}</div>
                <div className="text-[9px] uppercase tracking-widest text-slate-400 mt-1.5 leading-tight font-semibold">{label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Barra de ações em lote */}
      {selectedRows.size > 0 && hasPermission(user, 'canEditScreen1') && (
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-blue-900 dark:text-blue-100">
              {selectedRows.size} inclusão(ões) selecionada(s)
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={openBatchDiarias}
                className="border-blue-400 text-blue-700 hover:bg-blue-100 gap-1.5"
                data-testid="button-bulk-diarias"
              >
                <LayoutGrid className="w-4 h-4" />
                Editar diárias
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDelete}
                data-testid="button-bulk-delete"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Excluir Selecionadas
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkCancel}
                className="border-orange-500 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/20"
                data-testid="button-bulk-cancel"
              >
                <Ban className="w-4 h-4 mr-2" />
                Cancelar Selecionadas
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 flex items-center justify-between" style={{ background: "#F8FAFC", borderBottom: "2px solid #E2E8F0" }}>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-slate-700">Inclusões de Equipe</span>
            {filteredAndSortedInclusions.length > 0 && (
              <span className="text-xs text-slate-400">({filteredAndSortedInclusions.length})</span>
            )}
          </div>
          {hasPermission(user, 'canEditScreen1') && filteredAndSortedInclusions.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={openBatchDiarias}
              className="h-7 px-2.5 text-[11px] font-semibold text-blue-700 border-blue-200 hover:bg-blue-50 gap-1.5"
            >
              <LayoutGrid className="w-3 h-3" />
              Editar diárias em lote
            </Button>
          )}
        </div>
        
        <div>
          <table className="table-fixed w-full">
            <thead style={{ background: "#F8FAFC", borderBottom: "2px solid #E2E8F0" }}>
              <tr>
                <th className="w-[40px] px-2 py-3">
                  <Checkbox
                    checked={selectedRows.size === filteredAndSortedInclusions.length && filteredAndSortedInclusions.length > 0}
                    onCheckedChange={toggleSelectAll}
                    data-testid="checkbox-select-all"
                  />
                </th>
                <SortableHeader field="id" className="w-[80px] !px-2 text-[11px] uppercase tracking-widest text-slate-400 font-semibold" sortConfig={sortConfig} onSort={handleSort}>ID</SortableHeader>
                <SortableHeader field="event" className="w-[22%] !px-2 text-[11px] uppercase tracking-widest text-slate-400 font-semibold" sortConfig={sortConfig} onSort={handleSort}>Evento</SortableHeader>
                <SortableHeader field="function" className="w-[10%] !px-2 text-[11px] uppercase tracking-widest text-slate-400 font-semibold" sortConfig={sortConfig} onSort={handleSort}>Função</SortableHeader>
                <SortableHeader field="collaborator" className="w-[18%] !px-2 text-[11px] uppercase tracking-widest text-slate-400 font-semibold" sortConfig={sortConfig} onSort={handleSort}>Colaborador</SortableHeader>
                <SortableHeader field="date" className="w-[100px] !px-2 text-[11px] uppercase tracking-widest text-slate-400 font-semibold" sortConfig={sortConfig} onSort={handleSort}>Data/Diárias</SortableHeader>
                <SortableHeader field="status" className="w-[130px] !px-2 text-[11px] uppercase tracking-widest text-slate-400 font-semibold" sortConfig={sortConfig} onSort={handleSort}>Status</SortableHeader>
                <th className="w-[48px] px-2 py-3 text-center text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
                  Pass.
                </th>
                <th className="w-[64px] px-2 py-3 text-center text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
                  Hosp.
                </th>
                <th className="w-[100px] whitespace-nowrap pl-4 pr-2 py-3 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedInclusions?.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-12 text-center text-slate-400 text-sm">
                    Nenhuma inclusão de equipe encontrada
                  </td>
                </tr>
              ) : (
                filteredAndSortedInclusions?.map((inclusion, idx) => {
                  const isCanceled = inclusion.status === 'cancelado';
                  return (
                  <tr
                    key={inclusion.id}
                    className={`border-b border-slate-100 transition-colors ${isCanceled ? 'opacity-40' : ''} ${idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'} hover:bg-blue-50/40`}
                    data-testid={`row-inclusion-${inclusion.id}`}
                  >
                    <td className="px-2 py-3">
                      <Checkbox
                        checked={selectedRows.has(inclusion.id)}
                        onCheckedChange={() => toggleRowSelection(inclusion.id)}
                        data-testid={`checkbox-row-${inclusion.id}`}
                      />
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <div className="text-sm font-mono text-foreground font-medium truncate">
                          #{inclusion.inclusionNumber || 'N/A'}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="p-1 h-5 w-5 flex-shrink-0"
                          onClick={() => {
                            const text = inclusion.inclusionNumber?.toString() || inclusion.id;
                            navigator.clipboard.writeText(text);
                            toast({
                              title: "Sucesso",
                              description: "ID copiado para a área de transferência",
                            });
                          }}
                          data-testid={`button-copy-id-${inclusion.id}`}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <div className="text-sm font-medium text-slate-800 whitespace-normal break-words">
                        {getEventName(inclusion.eventId)}
                      </div>
                      <div className="text-xs text-slate-400">
                        {getEventLocation(inclusion.eventId)}
                      </div>
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap">
                      <div className="text-sm text-slate-700 truncate">
                        {getFunctionName(inclusion.functionId)}
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      {inclusion.collaboratorId ? (
                        <div
                          className="text-sm text-slate-800 font-medium whitespace-normal break-words leading-snug"
                          title={toTitleCase(getCollaboratorName(inclusion.collaboratorId) || "")}
                        >
                          {toTitleCase(getCollaboratorName(inclusion.collaboratorId) || "")}
                        </div>
                      ) : (
                        <span className="inline-flex items-center text-[11px] font-medium bg-slate-100 text-slate-400 rounded-full px-2 py-0.5">Não escalado</span>
                      )}
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap">
                      <div className="text-xs text-foreground">
                        {inclusion.scheduleStartDate && inclusion.scheduleEndDate
                          ? `${formatDate(inclusion.scheduleStartDate)} - ${formatDate(inclusion.scheduleEndDate)}`
                          : "Não definidas"}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {formatDiarias(inclusion.dailyRates)}
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <StatusBadge status={getDisplayStatus(inclusion)} />
                      {approvedSwapInclusionIds.has(inclusion.id) && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-[10px] font-bold border border-green-200 mt-1">
                          <ArrowLeftRight className="w-2.5 h-2.5" />Troca aprovada
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-center">
                      {inclusion.needsTicket ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100" title="Precisa de passagem">
                          <Check className="w-3 h-3 text-green-600 shrink-0" />
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100" title="Não precisa de passagem">
                          <X className="w-3 h-3 text-slate-400 shrink-0" />
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-center">
                      {inclusion.needsAccommodation ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100" title="Precisa de hospedagem">
                          <Check className="w-3 h-3 text-green-600 shrink-0" />
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100" title="Não precisa de hospedagem">
                          <X className="w-3 h-3 text-slate-400 shrink-0" />
                        </span>
                      )}
                    </td>
                    <td className="w-[100px] whitespace-nowrap pl-4 pr-2 py-3 text-right text-sm font-medium">
                      <div className={`flex items-center justify-end gap-1 ${isCanceled ? 'opacity-50' : ''} [&>button]:hover:scale-110 [&>button]:transition-transform`}>
                        {/* Para registros cancelados, permitir apenas comentários se não for edição */}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleViewComments(inclusion.id)}
                          className="text-blue-600 hover:text-blue-900 h-8 w-8 p-0 shrink-0"
                          data-testid={`button-comments-${inclusion.id}`}
                        >
                          <MessageCircle className="w-4 h-4" />
                        </Button>
                        {hasPermission(user, 'canEditScreen1') && (
                          <>
                            {isReadOnly(inclusion) ? (
                              // Para cancelados ou comprados, só mostrar botão de excluir se permitido
                              // Compras e Produção podem cancelar mesmo após compra de passagem/hospedagem
                              <>
                                {canDeleteInclusion(inclusion) && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleDelete(inclusion.id)}
                                    className="text-red-600 hover:text-red-900 h-8 w-8 p-0 shrink-0"
                                    data-testid={`button-delete-${inclusion.id}`}
                                    title="Excluir registro"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                                {canCancelEscalation(inclusion) && (user?.role === 'purchasing' || user?.role === 'production' || user?.role === 'admin') && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleCancelEscalation(inclusion.id)}
                                    className="text-orange-600 hover:text-orange-900 h-8 w-8 p-0 shrink-0"
                                    data-testid={`button-cancel-${inclusion.id}`}
                                    title="Cancelar Escalação"
                                  >
                                    <Ban className="w-4 h-4" />
                                  </Button>
                                )}
                              </>
                            ) : (
                              // Para status editáveis, mostrar botões de editar, excluir e cancelar
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleEdit(inclusion.id)}
                                  className="text-green-600 hover:text-green-900 h-8 w-8 p-0 shrink-0"
                                  data-testid={`button-edit-${inclusion.id}`}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                {canDeleteInclusion(inclusion) && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleDelete(inclusion.id)}
                                    className="text-red-600 hover:text-red-900 h-8 w-8 p-0 shrink-0"
                                    data-testid={`button-delete-${inclusion.id}`}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                                {canCancelEscalation(inclusion) && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleCancelEscalation(inclusion.id)}
                                    className="text-orange-600 hover:text-orange-900 h-8 w-8 p-0 shrink-0"
                                    data-testid={`button-cancel-${inclusion.id}`}
                                    title="Cancelar Escalação"
                                  >
                                    <Ban className="w-4 h-4" />
                                  </Button>
                                )}
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CommentsModal
        open={showCommentsModal}
        onClose={() => setShowCommentsModal(false)}
        teamInclusionId={selectedInclusion || ""}
      />
      
      {/* Modal de Edição */}
      {showEditModal && editingInclusion && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6">

            {/* Header */}
            <div className="-mx-6 -mt-6 px-6 py-4 rounded-t-2xl mb-6 flex items-center gap-3" style={{ background: "#F8FAFC", borderBottom: "2px solid #E2E8F0" }}>
              <div className="w-9 h-9 rounded-[9px] bg-[#0033CC] flex items-center justify-center shrink-0" style={{ boxShadow: "0 4px 12px #0033CC40" }}>
                <Edit className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-[15px] font-bold text-slate-900 leading-tight">Editar Inclusão</h2>
                <p className="text-xs text-slate-400 mt-0.5">#{editingInclusion.inclusionNumber}</p>
              </div>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const selectedDaysArr = Array.from(editSelectedDays).sort();
              const derivedStart = selectedDaysArr.length > 0 ? selectedDaysArr[0] : editStartDate;
              const derivedEnd = selectedDaysArr.length > 0 ? selectedDaysArr[selectedDaysArr.length - 1] : editEndDate;
              const data = {
                functionId: formData.get('functionId') as string,
                status: formData.get('status') as string,
                dailyRates: selectedDaysArr.length,
                needsTicket: formData.get('needsTicket') === 'true',
                needsAccommodation: formData.get('needsAccommodation') === 'true',
                scheduleStartDate: derivedStart,
                scheduleEndDate: derivedEnd,
                workDays: selectedDaysArr,
                flightDepartureDate: formData.get('ida') as string || null,
                flightArrivalSuggestedTime: formData.get('chegada') as string || null,
                flightReturnDate: formData.get('retorno') as string || null,
                flightReturnSuggestedTime: formData.get('horarioRetorno') as string || null,
                collaboratorId: editingInclusion.collaboratorId,
                eventId: editingInclusion.eventId,
                area: editingInclusion.area,
              };
              updateTeamInclusionMutation.mutate({ id: editingInclusion.id, data });
            }}>
              <div className="grid grid-cols-2 gap-6">
                {/* Coluna Esquerda */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Função *</label>
                    <select
                      name="functionId"
                      defaultValue={editingInclusion.functionId}
                      className="border border-slate-200 rounded-xl bg-white px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 w-full transition-all"
                      required
                    >
                      {functions?.map((func) => (
                        <option key={func.id} value={func.id}>{func.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Status *</label>
                    <select
                      name="status"
                      defaultValue={editingInclusion.status}
                      className="border border-slate-200 rounded-xl bg-white px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 w-full transition-all"
                      required
                    >
                      <option value="incluido">Incluído</option>
                      <option value="reaberto">Reaberto</option>
                      <option value="aguardando_producao">Aguardando Produção</option>
                      <option value="escalado">Escalado</option>
                      <option value="aguardando_passagem">Aguardando Passagem</option>
                      <option value="aguardando_hospedagem">Aguardando Hospedagem</option>
                      <option value="passagem_comprada">Passagem Comprada</option>
                      <option value="hospedagem_comprada">Hospedagem Comprada</option>
                      <option value="hospedagem_passagem_comprada">Hospedagem e Passagem Comprada</option>
                      <option value="cancelado">Cancelado</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Data Início *</label>
                      <input
                        type="date"
                        value={editStartDate}
                        onChange={(e) => {
                          const newStart = e.target.value;
                          setEditStartDate(newStart);
                          setEditEndDate(cur => {
                            if (newStart && cur) {
                              const allDays = generateDaysInRange(newStart, cur);
                              setEditSelectedDays(prev => {
                                const kept = allDays.filter(d => prev.has(d));
                                return new Set(kept.length > 0 ? kept : allDays);
                              });
                            }
                            return cur;
                          });
                        }}
                        className="border border-slate-200 rounded-xl bg-white px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 w-full transition-all"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Data Fim *</label>
                      <input
                        type="date"
                        value={editEndDate}
                        onChange={(e) => {
                          const newEnd = e.target.value;
                          setEditEndDate(newEnd);
                          setEditStartDate(cur => {
                            if (cur && newEnd) {
                              const allDays = generateDaysInRange(cur, newEnd);
                              setEditSelectedDays(prev => {
                                const kept = allDays.filter(d => prev.has(d));
                                return new Set(kept.length > 0 ? kept : allDays);
                              });
                            }
                            return cur;
                          });
                        }}
                        className="border border-slate-200 rounded-xl bg-white px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 w-full transition-all"
                        required
                      />
                    </div>
                  </div>

                  {/* Seletor de dias individuais */}
                  {editStartDate && editEndDate && (() => {
                    const allDays = generateDaysInRange(editStartDate, editEndDate);
                    if (allDays.length === 0) return null;
                    const selectedCount = allDays.filter(d => editSelectedDays.has(d)).length;
                    const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
                    return (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                            Dias trabalhados
                          </label>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-blue-700 bg-blue-50 rounded-lg px-2 py-0.5">{selectedCount} dia{selectedCount !== 1 ? 's' : ''}</span>
                            <button type="button" onClick={() => {
                              setEditSelectedDays(new Set(allDays));
                              if (allDays.length > 0) {
                                setEditStartDate(allDays[0]);
                                setEditEndDate(allDays[allDays.length - 1]);
                              }
                            }}
                              className="text-[10px] text-slate-400 hover:text-blue-600 underline">todos</button>
                            <button type="button" onClick={() => setEditSelectedDays(new Set())}
                              className="text-[10px] text-slate-400 hover:text-red-500 underline">nenhum</button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {allDays.map(day => {
                            const d = new Date(day + 'T12:00:00');
                            const isSelected = editSelectedDays.has(day);
                            const wd = weekdays[d.getDay()];
                            const dayNum = d.getDate();
                            const mon = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.','');
                            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                            return (
                              <button
                                key={day}
                                type="button"
                                onClick={() => setEditSelectedDays(prev => {
                                  const next = new Set(prev);
                                  if (next.has(day)) next.delete(day); else next.add(day);
                                  const sorted = Array.from(next).sort();
                                  if (sorted.length > 0) {
                                    setEditStartDate(sorted[0]);
                                    setEditEndDate(sorted[sorted.length - 1]);
                                  }
                                  return next;
                                })}
                                className={`flex flex-col items-center px-2 py-1 rounded-lg border text-[11px] font-semibold transition-all min-w-[38px] ${
                                  isSelected
                                    ? isWeekend ? 'bg-orange-500 text-white border-orange-500' : 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-slate-400 border-slate-200 line-through'
                                }`}
                              >
                                <span className="text-[9px] font-normal">{wd}</span>
                                <span>{dayNum}</span>
                                <span className="text-[9px] font-normal">{mon}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Precisa de Passagem?</label>
                    <select
                      name="needsTicket"
                      defaultValue={editingInclusion.needsTicket ? 'true' : 'false'}
                      className="border border-slate-200 rounded-xl bg-white px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 w-full transition-all"
                    >
                      <option value="false">Não</option>
                      <option value="true">Sim</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Precisa de Hospedagem?</label>
                    <select
                      name="needsAccommodation"
                      defaultValue={editingInclusion.needsAccommodation ? 'true' : 'false'}
                      className="border border-slate-200 rounded-xl bg-white px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 w-full transition-all"
                    >
                      <option value="false">Não</option>
                      <option value="true">Sim</option>
                    </select>
                  </div>
                </div>

                {/* Coluna Direita - Sugestões de Viagem */}
                <div>
                  <div className="bg-gradient-to-br from-blue-50 to-slate-50 border border-blue-100 rounded-2xl p-5">
                    <h4 className="text-sm font-bold text-blue-700 flex items-center gap-2 mb-1">
                      ✈️ Sugestões de Viagem
                    </h4>
                    <p className="text-xs text-blue-400 mb-4">Essas informações aparecerão como sugestões na tela de escalação</p>

                    <div className="grid grid-cols-2 gap-3">
                      {/* Card IDA */}
                      <div className="bg-white rounded-xl border border-blue-100 p-3 shadow-sm">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-2">IDA</p>
                        <div className="space-y-2">
                          <div>
                            <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">Dia</label>
                            <input
                              type="date"
                              name="ida"
                              defaultValue={editingInclusion.flightDepartureDate || ''}
                              className="border border-slate-200 rounded-lg bg-white px-2 py-1.5 text-sm w-full focus:ring-2 focus:ring-blue-200"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">Horário</label>
                            <input
                              type="text"
                              name="chegada"
                              defaultValue={editingInclusion.flightArrivalSuggestedTime || ''}
                              placeholder="Ex: 9h, manhã"
                              className="border border-slate-200 rounded-lg bg-white px-2 py-1.5 text-sm w-full focus:ring-2 focus:ring-blue-200"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Card RETORNO */}
                      <div className="bg-white rounded-xl border border-blue-100 p-3 shadow-sm">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">RETORNO</p>
                        <div className="space-y-2">
                          <div>
                            <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">Dia</label>
                            <input
                              type="date"
                              name="retorno"
                              defaultValue={editingInclusion.flightReturnDate || ''}
                              className="border border-slate-200 rounded-lg bg-white px-2 py-1.5 text-sm w-full focus:ring-2 focus:ring-blue-200"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">Horário</label>
                            <input
                              type="text"
                              name="horarioRetorno"
                              defaultValue={editingInclusion.flightReturnSuggestedTime || ''}
                              placeholder="Ex: 18h, final da tarde"
                              className="border border-slate-200 rounded-lg bg-white px-2 py-1.5 text-sm w-full focus:ring-2 focus:ring-blue-200"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-blue-100/60 rounded-lg px-3 py-2 text-xs text-blue-600 mt-3 flex items-start gap-1.5">
                      <span className="font-semibold">Dica:</span>
                      <span>Use descrições claras como "sábado", "9h", "domingo", "18h" ou datas específicas</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Rodapé */}
              <div className="border-t border-slate-100 pt-4 mt-4 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingInclusion(null);
                  }}
                  className="border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl px-6 py-2.5 text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={updateTeamInclusionMutation.isPending}
                  className="text-white rounded-lg px-6 py-2.5 text-sm font-semibold transition-all disabled:opacity-50"
                  style={{ background: "#0033CC", boxShadow: "0 2px 8px #0033CC40" }}
                >
                  {updateTeamInclusionMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Grade de diárias em lote ── */}
      {showBatchDiarias && (() => {
        const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        const targets = batchTargetIds
          .map(id => filteredAndSortedInclusions.find(i => i.id === id))
          .filter(Boolean) as typeof filteredAndSortedInclusions;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh]">

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                    <LayoutGrid className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-[14px] font-bold text-slate-900 leading-tight">Edição de Diárias em Lote</h2>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {targets.length} inclusão(ões) — selecione os dias de cada uma; a quantidade será calculada automaticamente
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowBatchDiarias(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Rows */}
              <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
                {targets.map((inc, idx) => {
                  const selectedDays = batchDiariasSelections[inc.id] ?? [];
                  const start = normDay(inc.scheduleStartDate);
                  const end = normDay(inc.scheduleEndDate);
                  const allDays = generateDaysInRange(start, end);
                  const origDays = (inc.workDays || []).map(normDay).filter(Boolean).sort();
                  const newDays = [...selectedDays].sort();
                  const changed = newDays.join(',') !== origDays.join(',') || newDays.length !== (inc.dailyRates ?? 0);

                  return (
                    <div
                      key={inc.id}
                      className={`px-6 py-4 transition-colors ${changed ? 'bg-blue-50/50' : idx % 2 === 1 ? 'bg-slate-50/30' : 'bg-white'}`}
                    >
                      {/* Info row */}
                      <div className="flex items-center gap-4 mb-3">
                        <span className="text-[10px] font-mono text-slate-400 w-10 shrink-0">#{inc.inclusionNumber ?? '—'}</span>
                        <span className="text-[12px] font-semibold text-slate-800 w-40 shrink-0 truncate">
                          {inc.collaboratorId
                            ? fixEncoding(getCollaboratorName(inc.collaboratorId))
                            : <span className="text-slate-400 italic font-normal">Não escalado</span>}
                        </span>
                        <span className="text-[12px] text-slate-500 w-32 shrink-0 truncate">{getFunctionName(inc.functionId)}</span>
                        <div className="flex items-center gap-1.5 ml-auto shrink-0">
                          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${changed ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                            {selectedDays.length} dia{selectedDays.length !== 1 ? 's' : ''}
                          </span>
                          {allDays.length > 0 && (
                            <>
                              <button
                                type="button"
                                onClick={() => setBatchDiariasSelections(prev => ({ ...prev, [inc.id]: allDays }))}
                                className="text-[10px] text-slate-400 hover:text-blue-600 underline"
                              >todos</button>
                              <button
                                type="button"
                                onClick={() => setBatchDiariasSelections(prev => ({ ...prev, [inc.id]: [] }))}
                                className="text-[10px] text-slate-400 hover:text-red-500 underline"
                              >nenhum</button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Day picker */}
                      {allDays.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 ml-14">
                          {allDays.map(day => {
                            const d = new Date(day + 'T12:00:00');
                            const isSelected = selectedDays.includes(day);
                            const wd = weekdays[d.getDay()];
                            const dayNum = d.getDate();
                            const mon = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
                            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                            return (
                              <button
                                key={day}
                                type="button"
                                onClick={() => toggleBatchDay(inc.id, day)}
                                className={`flex flex-col items-center px-2 py-1 rounded-lg border text-[11px] font-semibold transition-all min-w-[38px] ${
                                  isSelected
                                    ? isWeekend
                                      ? 'bg-orange-500 text-white border-orange-500'
                                      : 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-slate-400 border-slate-200 line-through'
                                }`}
                              >
                                <span className="text-[9px] font-normal">{wd}</span>
                                <span>{dayNum}</span>
                                <span className="text-[9px] font-normal">{mon}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="ml-14 text-[11px] text-slate-400 italic">Sem período definido nesta inclusão</p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="border-t border-slate-100 px-6 py-4 flex items-center justify-between shrink-0">
                <p className="text-[11px] text-slate-400">
                  Linhas em <span className="text-blue-600 font-semibold">azul</span> têm dias alterados. Status das escalações não será modificado.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowBatchDiarias(false)}
                    className="border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl px-5 py-2 text-sm font-medium transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSaveBatchDiarias}
                    disabled={batchSaveDiariasMutation.isPending}
                    className="flex items-center gap-2 text-white rounded-xl px-5 py-2 text-sm font-semibold transition-all disabled:opacity-50"
                    style={{ background: "#0033CC", boxShadow: "0 2px 8px #0033CC40" }}
                  >
                    <Save className="w-3.5 h-3.5" />
                    {batchSaveDiariasMutation.isPending ? 'Salvando...' : 'Salvar alterações'}
                  </button>
                </div>
              </div>

            </div>
          </div>
        );
      })()}

      <ConfirmModal
        open={confirmState.open}
        variant={confirmState.variant}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        onConfirm={confirmState.onConfirm}
        onCancel={closeConfirm}
      />
    </>
  );
}