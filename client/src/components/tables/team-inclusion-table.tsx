import { useState, useMemo, useRef, useCallback, memo, forwardRef } from "react";
import { formatDiarias, fixEncoding } from "@/lib/utils";
import { rotuloEmpreita, vagaComEmpreita } from "@shared/cenotecnica-empreita";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit, MessageCircle, Check, X, Trash2, Copy, Ban, LayoutGrid, Save, ArrowLeftRight, AlertCircle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import { useAuth } from "@/hooks/use-auth";
import { useSwapRequests } from "@/hooks/use-swap-requests";
import { hasPermission, hasRole } from "@/lib/role-utils";
import { StatusBadge, StatusPorChaveBadge } from "@/components/common/status-badge";
import CommentsModal from "@/components/modals/comments-modal";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
// Variante do pedido de confirmação (23/09): delete/cancel = destrutivo, confirm = neutro.
type ConfirmVariant = "delete" | "cancel" | "confirm";
import UniversalFilters from "@/components/common/universal-filters";
import SortableHeader, { type SortConfig, type SortField } from "@/components/common/sortable-header";
import type { TeamInclusion, Event, Function, Collaborator } from "@shared/schema";
import { isReadOnly } from "@/lib/interactions";
import { useEventLock, PastEventBanner, PAST_EVENT_BLOCK_MSG } from "@/lib/event-lock";

import { toTitleCase } from "@/lib/format";
import { useLinhasVirtuais, EspacadorLinha } from "@/components/common/virtual-rows";

// Helper: Mostrar "Escalado" apenas quando não precisa passagem nem hospedagem
const getDisplayStatus = (inclusion: TeamInclusion) => {
  if (inclusion.status === "escalado" && (inclusion.needsTicket || inclusion.needsAccommodation)) {
    if (inclusion.needsTicket) return "aguardando_passagem";
    if (inclusion.needsAccommodation) return "aguardando_hospedagem";
  }
  return inclusion.status;
};

// Nº de colunas da tabela (checkbox + 9 dados/ações) — usado pelos espaçadores da virtualização.
const COLUNAS_TABELA = 10;

interface InclusionRowProps {
  index: number;
  id: string;
  inclusionNumber: number | null;
  eventName: string;
  eventLocation: string;
  functionName: string;
  /** Nome já em Title Case; `null` = vaga sem colaborador. */
  collaboratorName: string | null;
  /** Empresa da empreita quando a vaga não tem colaborador; `null` = não é empreita. */
  empreitaEmpresa: string | null;
  empreitaTitulo: string;
  displayStatus: string;
  isCanceled: boolean;
  periodo: string;
  diarias: string;
  needsTicket: boolean;
  needsAccommodation: boolean;
  selected: boolean;
  locked: boolean;
  lockReason: string | null;
  canEditScreen: boolean;
  readOnly: boolean;
  canDelete: boolean;
  canCancel: boolean;
  cancelByRole: boolean;
  swapApproved: boolean;
  onToggleSelect: (id: string) => void;
  onCopyId: (text: string) => void;
  onComments: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onCancel: (id: string) => void;
}

// Linha memoizada com props PRIMITIVAS (23/09): só a linha cujo dado mudou
// re-renderiza (marcar um checkbox não repinta as outras 4.499). O `ref` é o
// medidor da virtualização (altura real da linha); `data-index` é lido por ele.
const InclusionRow = memo(forwardRef<HTMLTableRowElement, InclusionRowProps>(function InclusionRow({
  index, id, inclusionNumber, eventName, eventLocation, functionName, collaboratorName,
  empreitaEmpresa, empreitaTitulo, displayStatus, isCanceled, periodo, diarias,
  needsTicket, needsAccommodation, selected, locked, lockReason, canEditScreen, readOnly,
  canDelete, canCancel, cancelByRole, swapApproved,
  onToggleSelect, onCopyId, onComments, onEdit, onDelete, onCancel,
}, ref) {
  const numero = inclusionNumber ?? '';
  return (
    <tr
      ref={ref}
      data-index={index}
      aria-rowindex={index + 2}
      className={`border-b border-border transition-colors ${isCanceled ? 'opacity-40' : ''} ${index % 2 === 1 ? 'bg-surface-muted/40' : 'bg-card'} hover:bg-brand-soft/40`}
      data-testid={`row-inclusion-${id}`}
    >
      <td className="px-2 py-3">
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelect(id)}
          disabled={locked}
          title={lockReason ?? undefined}
          aria-label={`Selecionar inclusão #${numero}`}
          data-testid={`checkbox-row-${id}`}
        />
      </td>
      <td className="px-2 py-3 whitespace-nowrap">
        <div className="flex items-center gap-1">
          <div className="text-sm font-mono text-foreground font-medium truncate">
            #{inclusionNumber || 'N/A'}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="p-1 h-5 w-5 flex-shrink-0"
            title="Copiar ID"
            aria-label={`Copiar ID da inclusão #${numero}`}
            onClick={() => onCopyId(inclusionNumber?.toString() || id)}
            data-testid={`button-copy-id-${id}`}
          >
            <Copy className="w-3 h-3" />
          </Button>
        </div>
      </td>
      <td className="px-2 py-3">
        <div className="text-sm font-medium text-foreground whitespace-normal break-words">
          {eventName}
        </div>
        <div className="text-xs text-muted-foreground">
          {eventLocation}
        </div>
      </td>
      <td className="px-2 py-3 whitespace-nowrap">
        <div className="text-sm text-slate-700 truncate">
          {functionName}
        </div>
      </td>
      <td className="px-2 py-3">
        {collaboratorName !== null ? (
          <div
            className="text-sm text-foreground font-medium whitespace-normal break-words leading-snug"
            title={collaboratorName}
          >
            {collaboratorName}
          </div>
        ) : empreitaEmpresa !== null ? (
          <div className="text-sm text-foreground font-medium whitespace-normal break-words leading-snug" title={empreitaTitulo}>
            <StatusBadge tone="info" className="mr-1.5 uppercase tracking-wide">Empreita</StatusBadge>
            {empreitaEmpresa}
          </div>
        ) : (
          <StatusBadge tone="neutral">Não escalado</StatusBadge>
        )}
      </td>
      <td className="px-2 py-3 whitespace-nowrap">
        <div className="text-xs text-foreground">{periodo}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{diarias}</div>
      </td>
      <td className="px-2 py-3">
        <StatusPorChaveBadge status={displayStatus} />
        {swapApproved && (
          <StatusBadge tone="success" icon={ArrowLeftRight} className="mt-1">Troca aprovada</StatusBadge>
        )}
      </td>
      <td className="px-2 py-3 text-center">
        {needsTicket ? (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-success-soft" title="Precisa de passagem">
            <Check className="w-3 h-3 text-success shrink-0" />
          </span>
        ) : (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-muted" title="Não precisa de passagem">
            <X className="w-3 h-3 text-muted-foreground shrink-0" />
          </span>
        )}
      </td>
      <td className="px-2 py-3 text-center">
        {needsAccommodation ? (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-success-soft" title="Precisa de hospedagem">
            <Check className="w-3 h-3 text-success shrink-0" />
          </span>
        ) : (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-muted" title="Não precisa de hospedagem">
            <X className="w-3 h-3 text-muted-foreground shrink-0" />
          </span>
        )}
      </td>
      <td className="w-[100px] whitespace-nowrap pl-4 pr-2 py-3 text-right text-sm font-medium">
        <div className={`flex items-center justify-end gap-1 ${isCanceled ? 'opacity-50' : ''} [&>button]:hover:scale-110 [&>button]:transition-transform`}>
          {/* Para registros cancelados, permitir apenas comentários se não for edição */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onComments(id)}
            className="text-primary hover:text-primary-hover h-8 w-8 p-0 shrink-0"
            title="Comentários"
            aria-label={`Ver comentários da inclusão #${numero}`}
            data-testid={`button-comments-${id}`}
          >
            <MessageCircle className="w-4 h-4" />
          </Button>
          {canEditScreen && locked && (
            <span
              className="inline-flex items-center justify-center h-8 w-8 text-warning-strong shrink-0"
              title={lockReason ?? PAST_EVENT_BLOCK_MSG}
              aria-label={lockReason ?? PAST_EVENT_BLOCK_MSG}
              data-testid={`lock-past-event-${id}`}
            >
              <Lock className="w-4 h-4" />
            </span>
          )}
          {canEditScreen && !locked && (
            readOnly ? (
              // Para cancelados ou comprados, só mostrar botão de excluir se permitido.
              // Compras e Produção podem cancelar mesmo após compra de passagem/hospedagem.
              <>
                {canDelete && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDelete(id)}
                    className="text-danger hover:text-danger h-8 w-8 p-0 shrink-0"
                    data-testid={`button-delete-${id}`}
                    title="Excluir registro"
                    aria-label={`Excluir inclusão #${numero}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
                {canCancel && cancelByRole && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onCancel(id)}
                    className="text-warning hover:text-warning h-8 w-8 p-0 shrink-0"
                    data-testid={`button-cancel-${id}`}
                    title="Cancelar Escalação"
                    aria-label={`Cancelar escalação da inclusão #${numero}`}
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
                  onClick={() => onEdit(id)}
                  className="text-success hover:text-success h-8 w-8 p-0 shrink-0"
                  data-testid={`button-edit-${id}`}
                  title="Editar inclusão"
                  aria-label={`Editar inclusão #${numero}`}
                >
                  <Edit className="w-4 h-4" />
                </Button>
                {canDelete && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDelete(id)}
                    className="text-danger hover:text-danger h-8 w-8 p-0 shrink-0"
                    data-testid={`button-delete-${id}`}
                    title="Excluir registro"
                    aria-label={`Excluir inclusão #${numero}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
                {canCancel && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onCancel(id)}
                    className="text-warning hover:text-warning h-8 w-8 p-0 shrink-0"
                    data-testid={`button-cancel-${id}`}
                    title="Cancelar Escalação"
                    aria-label={`Cancelar escalação da inclusão #${numero}`}
                  >
                    <Ban className="w-4 h-4" />
                  </Button>
                )}
              </>
            )
          )}
        </div>
      </td>
    </tr>
  );
}));

export default function TeamInclusionTable() {
  const [selectedInclusion, setSelectedInclusion] = useState<string | null>(null);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingInclusion, setEditingInclusion] = useState<TeamInclusion | null>(null);
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editSelectedDays, setEditSelectedDays] = useState<Set<string>>(new Set());
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  // Seleção múltipla (28/08): listas; vazia = todos. Também conserta o filtro
  // de Funções, que comparava string com a lista do multi-select e zerava a tela.
  const [filters, setFilters] = useState({
    eventId: [] as string[],
    functionId: [] as string[],
    collaboratorId: [] as string[],
    status: [] as string[],
    escalationStatus: [] as string[],
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

  // Hook único das trocas (23/09): mesmo cache normalizado da casca e das outras telas.
  const { data: allSwapRequests } = useSwapRequests();

  const approvedSwapInclusionIds = useMemo(() => {
    const ids = new Set<string>();
    allSwapRequests?.filter(s => s.status === 'aprovado').forEach(s => {
      if (s.teamInclusionId) ids.add(s.teamInclusionId);
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

  // Com UM evento marcado no filtro, busca só as vagas dele (`?eventId=`,
  // contrato 23/09) — a chave leva o id para o cache ser por evento e as
  // invalidações por prefixo (`["/api/team-inclusions"]`) continuarem valendo.
  const eventoFiltrado = filters.eventId.length === 1 ? filters.eventId[0] : null;
  const { data: teamInclusions, isLoading, isError, error } = useQuery<TeamInclusion[]>({
    queryKey: eventoFiltrado ? ["/api/team-inclusions", eventoFiltrado] : ["/api/team-inclusions"],
    queryFn: () => apiRequest("GET", eventoFiltrado ? `/api/team-inclusions?eventId=${eventoFiltrado}` : "/api/team-inclusions").then(r => r.json()),
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

  // Índices O(1) — antes cada célula e cada comparação de ordenação varria a
  // lista inteira. O primeiro registro vence, exatamente como o Array.find.
  const eventById = useMemo(() => {
    const m = new Map<string, Event>();
    (events || []).forEach(e => { if (!m.has(e.id)) m.set(e.id, e); });
    return m;
  }, [events]);

  const functionById = useMemo(() => {
    const m = new Map<string, Function>();
    (functions || []).forEach(f => { if (!m.has(f.id)) m.set(f.id, f); });
    return m;
  }, [functions]);

  const collaboratorById = useMemo(() => {
    const m = new Map<string, Collaborator>();
    (collaborators || []).forEach(c => { if (!m.has(c.id)) m.set(c.id, c); });
    return m;
  }, [collaborators]);

  const inclusionById = useMemo(() => {
    const m = new Map<string, TeamInclusion>();
    (teamInclusions || []).forEach(i => { if (!m.has(i.id)) m.set(i.id, i); });
    return m;
  }, [teamInclusions]);

  const getEventName = (eventId: string) => {
    return eventById.get(eventId)?.name || "Evento não encontrado";
  };

  const getEventLocation = (eventId: string) => {
    return eventById.get(eventId)?.location || "";
  };

  const getFunctionName = (functionId: string) => {
    return functionById.get(functionId)?.name || "Função não encontrada";
  };

  const getCollaboratorName = (collaboratorId?: string) => {
    if (!collaboratorId) return "Não escalado";
    return fixEncoding(collaboratorById.get(collaboratorId)?.fullName) || "Colaborador não encontrado";
  };

  const formatDate = (dateStr: string) => {
    // Parse manual para evitar problemas de timezone (e recorta timestamp se houver)
    const [year, month, day] = String(dateStr).split('T')[0].split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (isNaN(date.getTime())) return String(dateStr);
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
    const inclusion = inclusionById.get(inclusionId);
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
      toast({ variant: "success", title: "Inclusão atualizada" });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
      setShowEditModal(false);
      setEditingInclusion(null);
    },
    onError: (err: any) => {
      toast({
        title: err?.status === 401 ? "Sessão expirada" : "Não foi possível atualizar a inclusão",
        description: apiErrorMessage(err, "Tente de novo em instantes."),
        variant: "destructive",
      });
    },
  });


  const canCancelEscalation = (inclusion: TeamInclusion) => {
    // Pode cancelar em qualquer status, exceto quando já está cancelado
    return inclusion.status !== 'cancelado';
  };

  // Evento encerrado (regra do usuário, 19/08): a partir do dia seguinte ao
  // término, só o administrador mexe. Espelha o 403 do servidor —
  // editar/excluir/cancelar somem e a linha não entra nas ações em lote.
  const eventLock = useEventLock();
  const isEventLocked = (inclusion: TeamInclusion) => eventLock.isLockedInclusion(inclusion);
  // Motivo exato do bloqueio (encerrado x evento fora da lista) para tooltips.
  const eventLockReason = (inclusion: TeamInclusion) => eventLock.lockReason(inclusion.eventId);

  // ── Grade de diárias em lote ────────────────────────────────────────────────
  const [showBatchDiarias, setShowBatchDiarias] = useState(false);
  // inclusionId → array de dias selecionados (YYYY-MM-DD)
  const [batchDiariasSelections, setBatchDiariasSelections] = useState<Record<string, string[]>>({});
  const [batchTargetIds, setBatchTargetIds] = useState<string[]>([]);

  const openBatchDiarias = () => {
    // Usa as linhas selecionadas com checkbox; se nenhuma, usa todas as filtradas
    // Evento encerrado fica de fora: o PATCH das diárias tomaria 403
    const editaveis = filteredAndSortedInclusions.filter(inc => !isEventLocked(inc));
    const targets = selectedRows.size > 0
      ? editaveis.filter(inc => selectedRows.has(inc.id))
      : editaveis;

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

  // Contrato 23/09: só `workDays` vai no PATCH — o servidor calcula
  // `dailyRates = workDays.length` (nada de status/phase/dailyRates no corpo).
  const batchSaveDiariasMutation = useMutation({
    mutationFn: async (changes: Array<{ id: string; dailyRates: number; workDays: string[] }>) => {
      await Promise.all(
        changes.map(({ id, workDays }) =>
          apiRequest("PATCH", `/api/team-inclusions/${id}`, { workDays }).then(r => r.json())
        )
      );
    },
    onSuccess: () => {
      toast({ title: "Diárias salvas", description: "Todas as alterações foram aplicadas." });
      setShowBatchDiarias(false);
    },
    onError: (err: any) => {
      toast({
        title: err?.status === 401 ? "Sessão expirada" : "Não foi possível salvar as diárias",
        // Promise.all: parte das linhas pode ter sido gravada antes da falha
        description: apiErrorMessage(err, "Erro ao salvar as diárias. Algumas linhas podem ter sido gravadas — confira a lista."),
        variant: "destructive",
      });
    },
    // Invalida em qualquer desfecho: no erro parcial a tela ficava com dados velhos
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    },
  });

  const handleSaveBatchDiarias = () => {
    const changes: Array<{ id: string; dailyRates: number; workDays: string[] }> = [];
    batchTargetIds.forEach(id => {
      // Resolve na lista completa: mudar o filtro com o modal aberto descartava
      // silenciosamente as linhas que saíam da visão.
      const inc = inclusionById.get(id);
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
      // apiRequest já lança em resposta não-ok (com .status/.body)
      await apiRequest("DELETE", `/api/team-inclusions/${id}`);
      return { success: true };
    },
    onSuccess: () => {
      toast({ variant: "success", title: "Inclusão removida" });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    },
    onError: (err: any) => {
      toast({
        title: err?.status === 401 ? "Sessão expirada" : "Não foi possível remover a inclusão",
        description: apiErrorMessage(err, "Tente de novo em instantes."),
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

  // Contrato 23/09: cancelar é `POST /api/team-inclusions/:id/cancel` (o
  // servidor decide a transição; 409 já cancelada; 403 com passagem emitida,
  // só o administrador). `logisticaParaRevisar` = passagem/hospedagem já
  // registradas — Compras precisa saber.
  const cancelEscalationMutation = useMutation({
    mutationFn: async (id: string): Promise<{ message?: string; inclusion?: TeamInclusion; logisticaParaRevisar?: boolean }> => {
      const response = await apiRequest("POST", `/api/team-inclusions/${id}/cancel`, {});
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        variant: "success",
        title: "Vaga cancelada",
        description: data?.logisticaParaRevisar
          ? "Passagem ou hospedagem já registradas — Compras deve revisar a logística."
          : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    },
    onError: (err: any) => {
      toast({
        title: err?.status === 401 ? "Sessão expirada" : "Não foi possível cancelar a escalação",
        description: apiErrorMessage(err, "Tente de novo em instantes."),
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
    // Opera SOMENTE sobre as linhas visíveis: comparar/limpar a seleção inteira
    // descartava silenciosamente itens marcados sob outro filtro — justamente os
    // que a barra anuncia como "fora dos filtros atuais".
    // Linhas de evento encerrado nunca entram na seleção (o servidor recusaria)
    const visibleIds = filteredAndSortedInclusions.filter(i => !isEventLocked(i)).map(i => i.id);
    const todosVisiveisMarcados = visibleIds.length > 0 && visibleIds.every(id => selectedRows.has(id));
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (todosVisiveisMarcados) visibleIds.forEach(id => next.delete(id));
      else visibleIds.forEach(id => next.add(id));
      return next;
    });
  };

  const handleBulkDelete = () => {
    if (selectedRows.size === 0) {
      toast({ title: "Nenhuma seleção", description: "Selecione pelo menos uma inclusão para excluir.", variant: "destructive" });
      return;
    }

    const deletableIds = Array.from(selectedRows).filter(id => {
      const inclusion = inclusionById.get(id);
      return !!inclusion && canDeleteInclusion(inclusion) && !isEventLocked(inclusion);
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
            await apiRequest("DELETE", `/api/team-inclusions/${id}`);
            successCount++;
          } catch { errorCount++; }
        }
        queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
        setSelectedRows(new Set());
        toast({
          title: errorCount === 0 ? "Inclusões excluídas" : (successCount > 0 ? "Concluído parcialmente" : "Nenhuma inclusão excluída"),
          description: `${successCount} inclusão(ões) excluída(s). ${errorCount > 0 ? `${errorCount} não foi(ram) excluída(s).` : ''}`,
          variant: errorCount > 0 ? "destructive" : "success",
        });
      },
    });
  };

  const handleBulkCancel = () => {
    if (selectedRows.size === 0) {
      toast({ title: "Nenhuma seleção", description: "Selecione pelo menos uma inclusão para cancelar.", variant: "destructive" });
      return;
    }

    // Evento encerrado: o servidor recusaria com 403 — não tenta
    const cancelableIds = Array.from(selectedRows).filter(id => {
      const inclusion = inclusionById.get(id);
      return !!inclusion && !isEventLocked(inclusion);
    });
    if (cancelableIds.length === 0) {
      toast({ title: "Evento encerrado", description: PAST_EVENT_BLOCK_MSG, variant: "destructive" });
      return;
    }

    openConfirm({
      variant: 'cancel',
      title: 'Cancelar escalações?',
      message: `${cancelableIds.length} escalação(ões) selecionada(s) serão canceladas. Esta ação não pode ser desfeita.`,
      confirmLabel: 'Cancelar escalações',
      onConfirm: async () => {
        closeConfirm();
        let successCount = 0;
        let errorCount = 0;
        let logisticaCount = 0;
        for (const id of cancelableIds) {
          try {
            const r = await apiRequest("POST", `/api/team-inclusions/${id}/cancel`, {});
            const body = await r.json().catch(() => ({}));
            if (body?.logisticaParaRevisar) logisticaCount++;
            successCount++;
          } catch { errorCount++; }
        }
        queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
        setSelectedRows(new Set());
        toast({
          title: errorCount === 0 ? "Vagas canceladas" : (successCount > 0 ? "Concluído parcialmente" : "Nenhuma vaga cancelada"),
          description: `${successCount} vaga(s) cancelada(s). ${errorCount > 0 ? `${errorCount} não foi(ram) cancelada(s).` : ''}${logisticaCount > 0 ? ` ${logisticaCount} com passagem/hospedagem registradas — Compras deve revisar.` : ''}`,
          variant: errorCount > 0 ? "destructive" : "success",
        });
      },
    });
  };

  // Filter and sort inclusions based on current filters
  const filteredAndSortedInclusions = useMemo(() => {
    const filtered = teamInclusions?.filter(inclusion => {
      // Valores marcados no mesmo filtro somam (OU); entre filtros continua E.
      if (filters.eventId.length > 0 && !filters.eventId.includes(inclusion.eventId)) return false;
      if (filters.functionId.length > 0 && !filters.functionId.includes(inclusion.functionId)) return false;
      if (filters.collaboratorId.length > 0 && (!inclusion.collaboratorId || !filters.collaboratorId.includes(inclusion.collaboratorId))) return false;
      if (filters.status.length > 0 && !filters.status.includes(inclusion.status)) return false;
      if (filters.escalationStatus.length > 0) {
        const isCanceled = inclusion.status === "cancelado";
        const matches = filters.escalationStatus.some((v) =>
          v === "pending" ? (!inclusion.collaboratorId && !vagaComEmpreita(inclusion as any) && !isCanceled)
          : v === "escalated" ? ((!!inclusion.collaboratorId || vagaComEmpreita(inclusion as any)) && !isCanceled)
          : v === "cancelado" ? isCanceled
          : false,
        );
        if (!matches) return false;
      }
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
  }, [teamInclusions, filters, sortConfig, eventById, functionById, collaboratorById]);

  // Totals base: only base filters (event, function, collaborator, searchId)
  // Ignores status AND escalationStatus so card counts never change when a card is clicked
  const totalsBase = useMemo(() => {
    return teamInclusions?.filter(inclusion => {
      if (filters.eventId.length > 0 && !filters.eventId.includes(inclusion.eventId)) return false;
      if (filters.functionId.length > 0 && !filters.functionId.includes(inclusion.functionId)) return false;
      if (filters.collaboratorId.length > 0 && (!inclusion.collaboratorId || !filters.collaboratorId.includes(inclusion.collaboratorId))) return false;
      if (filters.searchId) {
        const q = filters.searchId.replace(/#/g, '').trim().toLowerCase();
        const n = String(inclusion.inclusionNumber ?? '').toLowerCase();
        if (!n.includes(q)) return false;
      }
      return true;
    }) || [];
  }, [teamInclusions, filters.eventId, filters.functionId, filters.collaboratorId, filters.searchId]);

  // Calculate real totals from totalsBase (ignores status filter so cards always show correct counts)
  // Cada contador usa EXATAMENTE o mesmo predicado que o clique no card aplica na
  // lista — antes o card "Passagem" também exigia needsTicket e mostrava um número
  // menor do que a quantidade de linhas exibidas ao clicar nele.
  const totals = {
    incluidos: totalsBase.length,
    pendentes: totalsBase.filter(i => !i.collaboratorId && !vagaComEmpreita(i as any) && i.status !== 'cancelado').length,
    escalados: totalsBase.filter(i => (i.collaboratorId || vagaComEmpreita(i as any)) && i.status !== 'cancelado').length,
    aguardando_passagem: totalsBase.filter(i => i.status === 'passagem').length,
    hospedagem: totalsBase.filter(i => i.status === 'hospedagem').length,
    passagem_comprada: totalsBase.filter(i => i.status === 'passagem_comprada').length,
    hospedagem_comprada: totalsBase.filter(i => i.status === 'hospedagem_comprada').length,
    cancelados: totalsBase.filter(i => i.status === 'cancelado').length,
  };

  // Quantas das linhas VISÍVEIS estão marcadas. Comparar só os tamanhos deixava o
  // "selecionar tudo" marcado quando a seleção antiga tinha o mesmo total de outra visão.
  const selectedVisibleCount = filteredAndSortedInclusions.reduce(
    (acc, i) => acc + (selectedRows.has(i.id) ? 1 : 0),
    0,
  );
  // Linhas de evento encerrado não são selecionáveis — não podem impedir que o
  // "selecionar tudo" apareça marcado.
  const selectableVisibleCount = filteredAndSortedInclusions.filter(i => !isEventLocked(i)).length;
  const allVisibleSelected =
    selectableVisibleCount > 0 && selectedVisibleCount === selectableVisibleCount;

  // ── Virtualização (23/09) ──────────────────────────────────────────────────
  // ~4.500 linhas × 10 colunas iam para o DOM de uma vez. Agora só o que cabe
  // no contêiner de rolagem (+ overscan) é renderizado; abaixo de 60 linhas a
  // lista é renderizada inteira (sem overhead). Os hooks ficam ANTES dos
  // retornos antecipados de carregando/erro.
  const scrollRef = useRef<HTMLDivElement>(null);
  const linhasVirtuais = useLinhasVirtuais(filteredAndSortedInclusions, {
    scrollRef,
    alturaEstimada: 57,
    overscan: 12,
  });

  // Callbacks ESTÁVEIS para a linha memoizada: leem o handler mais recente via
  // ref, então `React.memo` da linha não é furado a cada render da tabela.
  const acoesRef = useRef({ handleEdit, handleDelete, handleCancelEscalation, handleViewComments, toggleRowSelection });
  acoesRef.current = { handleEdit, handleDelete, handleCancelEscalation, handleViewComments, toggleRowSelection };
  const aoEditar = useCallback((id: string) => acoesRef.current.handleEdit(id), []);
  const aoExcluir = useCallback((id: string) => acoesRef.current.handleDelete(id), []);
  const aoCancelar = useCallback((id: string) => acoesRef.current.handleCancelEscalation(id), []);
  const aoVerComentarios = useCallback((id: string) => acoesRef.current.handleViewComments(id), []);
  const aoAlternarSelecao = useCallback((id: string) => acoesRef.current.toggleRowSelection(id), []);
  const aoCopiarId = useCallback(async (text: string) => {
    // Só avisa "copiado" depois de realmente copiar — a API falha em contexto
    // não seguro e o toast mentia para o usuário.
    try {
      await navigator.clipboard.writeText(text);
      toast({ variant: "success", title: "ID copiado", description: "Já está na área de transferência." });
    } catch {
      toast({ title: "Não foi possível copiar", description: `Copie manualmente: ${text}`, variant: "destructive" });
    }
  }, [toast]);
  const podeEditarTela = hasPermission(user, 'canEditScreen1');
  const podeCancelarPorPapel = hasRole(user, "purchasing", "production", "admin");

  if (isLoading) {
    return (
      <div className="bg-card rounded-lg shadow-1 border border-border p-6">
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

  // Falha de rede/sessão NÃO pode virar "nenhuma inclusão encontrada"
  if (isError) {
    return (
      <div className="bg-card rounded-xl border border-danger/25 p-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-danger-soft flex items-center justify-center mx-auto mb-3">
          <AlertCircle className="w-6 h-6 text-danger-strong" />
        </div>
        <h3 className="text-base font-bold text-slate-700 mb-1">Não foi possível carregar as inclusões</h3>
        <p className="text-sm text-muted-foreground">{apiErrorMessage(error, "Verifique sua conexão e tente novamente.")}</p>
      </div>
    );
  }

  return (
    <>
      <UniversalFilters filters={filters} onFiltersChange={setFilters} />

      {/* Evento encerrado: banner discreto quando o filtro aponta para um evento
          já terminado e o usuário não é o administrador. */}
      <PastEventBanner
        show={filters.eventId.length === 1 && eventLock.isReadOnlyPastEvent(filters.eventId[0])}
        className="mb-4"
      />

      {/* Totals Summary */}
      <div className="mb-6">
        <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
          {([
            { value: totals.incluidos,           label: "Total",          color: "text-primary",    border: "border-t-primary",    activeBg: "bg-brand-soft",    filterType: "all",        filterValue: "all",                 testId: "total-incluidos" },
            { value: totals.pendentes,           label: "Pendentes",      color: "text-danger-strong",     border: "border-t-danger-strong",     activeBg: "bg-danger-soft",     filterType: "escalation", filterValue: "pending",             testId: "total-pendentes" },
            { value: totals.escalados,           label: "Escalados",      color: "text-success",   border: "border-t-success-strong",   activeBg: "bg-success-soft",   filterType: "escalation", filterValue: "escalated",           testId: "total-escalados" },
            { value: totals.aguardando_passagem, label: "Passagem",       color: "text-warning",  border: "border-t-warning-strong",  activeBg: "bg-warning-soft",  filterType: "status",     filterValue: "passagem",            testId: "total-passagem" },
            { value: totals.hospedagem,          label: "Hospedagem",     color: "text-primary",  border: "border-t-primary",  activeBg: "bg-brand-soft",  filterType: "status",     filterValue: "hospedagem",          testId: "total-hospedagem" },
            { value: totals.passagem_comprada,   label: "Pass. Comprada", color: "text-success", border: "border-t-success-strong", activeBg: "bg-success-soft", filterType: "status",     filterValue: "passagem_comprada",   testId: "total-passagem-comprada" },
            { value: totals.hospedagem_comprada, label: "Hosp. Comprada", color: "text-primary",  border: "border-t-primary",  activeBg: "bg-brand-soft",  filterType: "status",     filterValue: "hospedagem_comprada", testId: "total-hospedagem-comprada" },
            { value: totals.cancelados,          label: "Cancelados",     color: "text-muted-foreground",    border: "border-t-slate-300",    activeBg: "bg-surface-muted",    filterType: "escalation", filterValue: "cancelado",           testId: "total-cancelados" },
          ] as const).map(({ value, label, color, border, activeBg, filterType, filterValue, testId }) => {
            // Cards continuam sendo atalho de UM recorte por vez; o multi fica
            // por conta dos dropdowns da barra.
            const isActive =
              filterType === "all"
                ? filters.status.length === 0 && filters.escalationStatus.length === 0
                : filterType === "status"
                  ? filters.status.length === 1 && filters.status[0] === filterValue
                  : filters.escalationStatus.length === 1 && filters.escalationStatus[0] === filterValue;

            const handleClick = () => {
              if (filterType === "all") {
                setFilters(f => ({ ...f, status: [], escalationStatus: [] }));
              } else if (filterType === "status") {
                setFilters(f => ({ ...f, status: isActive ? [] : [filterValue], escalationStatus: [] }));
              } else {
                setFilters(f => ({ ...f, escalationStatus: isActive ? [] : [filterValue], status: [] }));
              }
            };

            return (
              <div
                key={testId}
                role="button"
                tabIndex={0}
                aria-pressed={isActive}
                aria-label={`${label}: ${value}. Filtrar por ${label}`}
                onClick={handleClick}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleClick();
                  }
                }}
                className={`border border-t-2 ${border} rounded-xl px-3 py-2.5 text-center cursor-pointer transition-all duration-150 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring
                  ${isActive
                    ? `${activeBg} border-border shadow-1`
                    : "bg-card border-border shadow-1 hover:shadow-2 hover:-translate-y-0.5"}`}
                data-testid={testId}
              >
                <div className={`text-2xl font-bold tabular-nums leading-none ${color}`}>{value}</div>
                <div className="text-2xs uppercase tracking-widest text-muted-foreground mt-1.5 leading-tight font-semibold">{label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Barra de ações em lote */}
      {selectedRows.size > 0 && hasPermission(user, 'canEditScreen1') && (
        <div className="bg-brand-soft border border-primary/25 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-primary">
              {selectedRows.size} inclusão(ões) selecionada(s)
              {selectedRows.size > selectedVisibleCount && (
                <span className="ml-1 font-normal text-primary/80">
                  ({selectedRows.size - selectedVisibleCount} fora dos filtros atuais)
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={openBatchDiarias}
                className="border-primary text-primary hover:bg-brand-soft gap-1.5"
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
                className="border-warning-strong text-warning hover:bg-warning-soft"
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
      <div className="bg-card rounded-xl border border-border shadow-1 overflow-hidden">
        <div className="px-5 py-3.5 flex items-center justify-between bg-surface-muted border-b-2 border-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-700">Inclusões de Equipe</span>
            {filteredAndSortedInclusions.length > 0 && (
              <span className="text-xs text-muted-foreground">({filteredAndSortedInclusions.length})</span>
            )}
          </div>
          {hasPermission(user, 'canEditScreen1') && filteredAndSortedInclusions.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={openBatchDiarias}
              className="h-7 px-2.5 text-2xs font-semibold text-primary border-primary/25 hover:bg-brand-soft gap-1.5"
            >
              <LayoutGrid className="w-3 h-3" />
              Editar diárias em lote
            </Button>
          )}
        </div>
        
        {/* Contêiner que rola (base da virtualização): cabeçalho fixo dentro
            dele; altura = viewport − barra do topo − filtros/cards/rodapé. */}
        <div
          ref={scrollRef}
          className="overflow-auto max-h-[calc(100vh-var(--sticky-top,3.5rem)-14rem)]"
          data-testid="team-inclusion-scroll"
        >
          <table className="table-fixed w-full">
            <thead className="bg-surface-muted sticky top-0 z-10 shadow-[inset_0_-2px_0_0_var(--border)]">
              <tr>
                <th className="w-[40px] px-2 py-3">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Selecionar todas as inclusões exibidas"
                    data-testid="checkbox-select-all"
                  />
                </th>
                <SortableHeader field="id" className="w-[80px] !px-2 text-2xs uppercase tracking-widest text-muted-foreground font-semibold" sortConfig={sortConfig} onSort={handleSort}>ID</SortableHeader>
                <SortableHeader field="event" className="w-[22%] !px-2 text-2xs uppercase tracking-widest text-muted-foreground font-semibold" sortConfig={sortConfig} onSort={handleSort}>Evento</SortableHeader>
                <SortableHeader field="function" className="w-[10%] !px-2 text-2xs uppercase tracking-widest text-muted-foreground font-semibold" sortConfig={sortConfig} onSort={handleSort}>Função</SortableHeader>
                <SortableHeader field="collaborator" className="w-[18%] !px-2 text-2xs uppercase tracking-widest text-muted-foreground font-semibold" sortConfig={sortConfig} onSort={handleSort}>Colaborador</SortableHeader>
                <SortableHeader field="date" className="w-[100px] !px-2 text-2xs uppercase tracking-widest text-muted-foreground font-semibold" sortConfig={sortConfig} onSort={handleSort}>Data/Diárias</SortableHeader>
                <SortableHeader field="status" className="w-[130px] !px-2 text-2xs uppercase tracking-widest text-muted-foreground font-semibold" sortConfig={sortConfig} onSort={handleSort}>Status</SortableHeader>
                <th className="w-[48px] px-2 py-3 text-center text-2xs font-semibold text-muted-foreground uppercase tracking-widest">
                  Pass.
                </th>
                <th className="w-[64px] px-2 py-3 text-center text-2xs font-semibold text-muted-foreground uppercase tracking-widest">
                  Hosp.
                </th>
                <th className="w-[100px] whitespace-nowrap pl-4 pr-2 py-3 text-right text-2xs font-semibold text-muted-foreground uppercase tracking-widest">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody aria-rowcount={filteredAndSortedInclusions.length + 1}>
              {filteredAndSortedInclusions.length === 0 ? (
                <tr>
                  <td colSpan={COLUNAS_TABELA} className="px-6 py-12 text-center text-muted-foreground text-sm">
                    Nenhuma inclusão de equipe encontrada
                  </td>
                </tr>
              ) : (
                <>
                  <EspacadorLinha altura={linhasVirtuais.espacoAntes} colunas={COLUNAS_TABELA} />
                  {linhasVirtuais.linhas.map(({ item: inclusion, index, medir }) => {
                    const empreita = !inclusion.collaboratorId && vagaComEmpreita(inclusion as any);
                    return (
                      <InclusionRow
                        key={inclusion.id}
                        ref={medir}
                        index={index}
                        id={inclusion.id}
                        inclusionNumber={inclusion.inclusionNumber ?? null}
                        eventName={getEventName(inclusion.eventId)}
                        eventLocation={getEventLocation(inclusion.eventId)}
                        functionName={getFunctionName(inclusion.functionId)}
                        collaboratorName={inclusion.collaboratorId ? toTitleCase(getCollaboratorName(inclusion.collaboratorId) || "") : null}
                        empreitaEmpresa={empreita ? String((inclusion as any).empreitaEmpresa ?? "") : null}
                        empreitaTitulo={empreita ? rotuloEmpreita(inclusion as any) : ""}
                        displayStatus={getDisplayStatus(inclusion)}
                        isCanceled={inclusion.status === 'cancelado'}
                        periodo={inclusion.scheduleStartDate && inclusion.scheduleEndDate
                          ? `${formatDate(inclusion.scheduleStartDate)} - ${formatDate(inclusion.scheduleEndDate)}`
                          : "Não definidas"}
                        diarias={formatDiarias(inclusion.dailyRates)}
                        needsTicket={!!inclusion.needsTicket}
                        needsAccommodation={!!inclusion.needsAccommodation}
                        selected={selectedRows.has(inclusion.id)}
                        locked={isEventLocked(inclusion)}
                        lockReason={eventLockReason(inclusion) ?? null}
                        canEditScreen={podeEditarTela}
                        readOnly={isReadOnly(inclusion)}
                        canDelete={canDeleteInclusion(inclusion)}
                        canCancel={canCancelEscalation(inclusion)}
                        cancelByRole={podeCancelarPorPapel}
                        swapApproved={approvedSwapInclusionIds.has(inclusion.id)}
                        onToggleSelect={aoAlternarSelecao}
                        onCopyId={aoCopiarId}
                        onComments={aoVerComentarios}
                        onEdit={aoEditar}
                        onDelete={aoExcluir}
                        onCancel={aoCancelar}
                      />
                    );
                  })}
                  <EspacadorLinha altura={linhasVirtuais.espacoDepois} colunas={COLUNAS_TABELA} />
                </>
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
          <div className="bg-card rounded-xl shadow-3 max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6">

            {/* Header */}
            <div className="-mx-6 -mt-6 px-6 py-4 rounded-t-xl mb-6 flex items-center gap-3 bg-surface-muted border-b-2 border-border">
              <div className="w-9 h-9 rounded-lg bg-primary shadow-2 flex items-center justify-center shrink-0">
                <Edit className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground leading-tight">Editar Inclusão</h2>
                <p className="text-xs text-muted-foreground mt-0.5">#{editingInclusion.inclusionNumber}</p>
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
                // `status` NÃO vai no corpo (23/09): o select do modal não tinha
                // planejado/aprovado/escalacao e gravava o valor inexistente
                // "incluido". O status é só do fluxo no servidor.
                // `dailyRates` não vai no corpo (contrato 23/09): o servidor
                // calcula = workDays.length.
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
                    <label htmlFor="edit-function-id" className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Função *</label>
                    <select
                      id="edit-function-id"
                      name="functionId"
                      defaultValue={editingInclusion.functionId}
                      className="border border-border rounded-xl bg-card px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/25 focus:border-primary w-full transition-all"
                      required
                    >
                      {functions?.map((func) => (
                        <option key={func.id} value={func.id}>{func.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    {/* Somente leitura (23/09): o status é decidido pelo fluxo
                        (escalação, gestor, compras) — o select antigo não tinha
                        planejado/aprovado/escalacao e gravava "incluido". */}
                    <span className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Status</span>
                    <div className="flex items-center min-h-[42px]" data-testid="edit-status-readonly">
                      <StatusPorChaveBadge status={getDisplayStatus(editingInclusion)} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="edit-start-date" className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Data Início *</label>
                      <input
                        id="edit-start-date"
                        type="date"
                        value={editStartDate}
                        onChange={(e) => {
                          // Antes o recálculo dos dias acontecia DENTRO do updater de
                          // outro setState (função impura, executada duas vezes em dev).
                          const newStart = e.target.value;
                          setEditStartDate(newStart);
                          if (newStart && editEndDate) {
                            const allDays = generateDaysInRange(newStart, editEndDate);
                            setEditSelectedDays(prev => {
                              const kept = allDays.filter(d => prev.has(d));
                              return new Set(kept.length > 0 ? kept : allDays);
                            });
                          }
                        }}
                        className="border border-border rounded-xl bg-card px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/25 focus:border-primary w-full transition-all"
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="edit-end-date" className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Data Fim *</label>
                      <input
                        id="edit-end-date"
                        type="date"
                        value={editEndDate}
                        onChange={(e) => {
                          const newEnd = e.target.value;
                          setEditEndDate(newEnd);
                          if (editStartDate && newEnd) {
                            const allDays = generateDaysInRange(editStartDate, newEnd);
                            setEditSelectedDays(prev => {
                              const kept = allDays.filter(d => prev.has(d));
                              return new Set(kept.length > 0 ? kept : allDays);
                            });
                          }
                        }}
                        className="border border-border rounded-xl bg-card px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/25 focus:border-primary w-full transition-all"
                        required
                      />
                    </div>
                  </div>
                  {editStartDate && editEndDate && editEndDate < editStartDate && (
                    <p className="text-2xs font-semibold text-danger-strong -mt-2">
                      A data de fim não pode ser anterior à data de início.
                    </p>
                  )}

                  {/* Seletor de dias individuais */}
                  {editStartDate && editEndDate && (() => {
                    const allDays = generateDaysInRange(editStartDate, editEndDate);
                    if (allDays.length === 0) return null;
                    const selectedCount = allDays.filter(d => editSelectedDays.has(d)).length;
                    const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
                    return (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            Dias trabalhados
                          </label>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-primary bg-brand-soft rounded-lg px-2 py-0.5">{selectedCount} dia{selectedCount !== 1 ? 's' : ''}</span>
                            <button type="button" onClick={() => {
                              setEditSelectedDays(new Set(allDays));
                            }}
                              className="text-2xs text-muted-foreground hover:text-primary-hover underline">todos</button>
                            <button type="button" onClick={() => setEditSelectedDays(new Set())}
                              className="text-2xs text-muted-foreground hover:text-danger-strong underline">nenhum</button>
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
                                  return next;
                                })}
                                className={`flex flex-col items-center px-2 py-1 rounded-lg border text-2xs font-semibold transition-all min-w-[38px] ${
                                  isSelected
                                    ? isWeekend ? 'bg-warning-strong text-primary-foreground border-warning-strong' : 'bg-primary text-primary-foreground border-primary'
                                    : 'bg-card text-muted-foreground border-border line-through'
                                }`}
                              >
                                <span className="text-2xs font-normal">{wd}</span>
                                <span>{dayNum}</span>
                                <span className="text-2xs font-normal">{mon}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  <div>
                    <label htmlFor="edit-needs-ticket" className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Precisa de Passagem?</label>
                    <select
                      id="edit-needs-ticket"
                      name="needsTicket"
                      defaultValue={editingInclusion.needsTicket ? 'true' : 'false'}
                      className="border border-border rounded-xl bg-card px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/25 focus:border-primary w-full transition-all"
                    >
                      <option value="false">Não</option>
                      <option value="true">Sim</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="edit-needs-accommodation" className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Precisa de Hospedagem?</label>
                    <select
                      id="edit-needs-accommodation"
                      name="needsAccommodation"
                      defaultValue={editingInclusion.needsAccommodation ? 'true' : 'false'}
                      className="border border-border rounded-xl bg-card px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/25 focus:border-primary w-full transition-all"
                    >
                      <option value="false">Não</option>
                      <option value="true">Sim</option>
                    </select>
                  </div>
                </div>

                {/* Coluna Direita - Sugestões de Viagem */}
                <div>
                  <div className="bg-brand-soft border border-primary/25 rounded-xl p-5">
                    <h4 className="text-sm font-bold text-primary flex items-center gap-2 mb-1">
                      ✈️ Sugestões de Viagem
                    </h4>
                    <p className="text-xs text-primary/70 mb-4">Essas informações aparecerão como sugestões na tela de escalação</p>

                    <div className="grid grid-cols-2 gap-3">
                      {/* Card IDA */}
                      <div className="bg-card rounded-xl border border-primary/25 p-3 shadow-1">
                        <p className="text-2xs font-bold uppercase tracking-wider text-primary mb-2">IDA</p>
                        <div className="space-y-2">
                          <div>
                            <label className="block text-2xs uppercase tracking-wider text-muted-foreground mb-1">Dia</label>
                            <input
                              type="date"
                              name="ida"
                              defaultValue={editingInclusion.flightDepartureDate || ''}
                              className="border border-border rounded-lg bg-card px-2 py-1.5 text-sm w-full focus:ring-2 focus:ring-primary/25"
                            />
                          </div>
                          <div>
                            <label className="block text-2xs uppercase tracking-wider text-muted-foreground mb-1">Horário</label>
                            <input
                              type="text"
                              name="chegada"
                              defaultValue={editingInclusion.flightArrivalSuggestedTime || ''}
                              placeholder="Ex: 9h, manhã"
                              className="border border-border rounded-lg bg-card px-2 py-1.5 text-sm w-full focus:ring-2 focus:ring-primary/25"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Card RETORNO */}
                      <div className="bg-card rounded-xl border border-primary/25 p-3 shadow-1">
                        <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground mb-2">RETORNO</p>
                        <div className="space-y-2">
                          <div>
                            <label className="block text-2xs uppercase tracking-wider text-muted-foreground mb-1">Dia</label>
                            <input
                              type="date"
                              name="retorno"
                              defaultValue={editingInclusion.flightReturnDate || ''}
                              className="border border-border rounded-lg bg-card px-2 py-1.5 text-sm w-full focus:ring-2 focus:ring-primary/25"
                            />
                          </div>
                          <div>
                            <label className="block text-2xs uppercase tracking-wider text-muted-foreground mb-1">Horário</label>
                            <input
                              type="text"
                              name="horarioRetorno"
                              defaultValue={editingInclusion.flightReturnSuggestedTime || ''}
                              placeholder="Ex: 18h, final da tarde"
                              className="border border-border rounded-lg bg-card px-2 py-1.5 text-sm w-full focus:ring-2 focus:ring-primary/25"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-brand-soft/60 rounded-lg px-3 py-2 text-xs text-primary mt-3 flex items-start gap-1.5">
                      <span className="font-semibold">Dica:</span>
                      <span>Use descrições claras como "sábado", "9h", "domingo", "18h" ou datas específicas</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Rodapé */}
              <div className="border-t border-border pt-4 mt-4 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingInclusion(null);
                  }}
                  className="border border-border text-slate-600 hover:bg-surface-muted rounded-xl px-6 py-2.5 text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={updateTeamInclusionMutation.isPending}
                  className="text-primary-foreground rounded-lg px-6 py-2.5 text-sm font-semibold transition-all disabled:opacity-50 bg-primary hover:bg-primary-hover shadow-1"
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
          .map(id => inclusionById.get(id))
          .filter(Boolean) as TeamInclusion[];

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-card rounded-xl shadow-3 w-full max-w-5xl flex flex-col max-h-[90vh]">

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-brand-soft flex items-center justify-center shrink-0">
                    <LayoutGrid className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-foreground leading-tight">Edição de Diárias em Lote</h2>
                    <p className="text-2xs text-muted-foreground mt-0.5">
                      {targets.length} inclusão(ões) — selecione os dias de cada uma; a quantidade será calculada automaticamente
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Fechar edição de diárias em lote"
                  title="Fechar"
                  onClick={() => setShowBatchDiarias(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-slate-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Rows */}
              <div className="overflow-y-auto flex-1 divide-y divide-border">
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
                      className={`px-6 py-4 transition-colors ${changed ? 'bg-brand-soft/50' : idx % 2 === 1 ? 'bg-surface-muted/30' : 'bg-card'}`}
                    >
                      {/* Info row */}
                      <div className="flex items-center gap-4 mb-3">
                        <span className="text-2xs font-mono text-muted-foreground w-10 shrink-0">#{inc.inclusionNumber ?? '—'}</span>
                        <span className="text-xs font-semibold text-foreground w-40 shrink-0 truncate">
                          {inc.collaboratorId
                            ? fixEncoding(getCollaboratorName(inc.collaboratorId))
                            : <span className="text-muted-foreground italic font-normal">Não escalado</span>}
                        </span>
                        <span className="text-xs text-muted-foreground w-32 shrink-0 truncate">{getFunctionName(inc.functionId)}</span>
                        <div className="flex items-center gap-1.5 ml-auto shrink-0">
                          <span className={`text-2xs font-bold px-2.5 py-0.5 rounded-full ${changed ? 'bg-primary text-primary-foreground' : 'bg-muted text-slate-600'}`}>
                            {selectedDays.length} dia{selectedDays.length !== 1 ? 's' : ''}
                          </span>
                          {allDays.length > 0 && (
                            <>
                              <button
                                type="button"
                                onClick={() => setBatchDiariasSelections(prev => ({ ...prev, [inc.id]: allDays }))}
                                className="text-2xs text-muted-foreground hover:text-primary-hover underline"
                              >todos</button>
                              <button
                                type="button"
                                onClick={() => setBatchDiariasSelections(prev => ({ ...prev, [inc.id]: [] }))}
                                className="text-2xs text-muted-foreground hover:text-danger-strong underline"
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
                                className={`flex flex-col items-center px-2 py-1 rounded-lg border text-2xs font-semibold transition-all min-w-[38px] ${
                                  isSelected
                                    ? isWeekend
                                      ? 'bg-warning-strong text-primary-foreground border-warning-strong'
                                      : 'bg-primary text-primary-foreground border-primary'
                                    : 'bg-card text-muted-foreground border-border line-through'
                                }`}
                              >
                                <span className="text-2xs font-normal">{wd}</span>
                                <span>{dayNum}</span>
                                <span className="text-2xs font-normal">{mon}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="ml-14 text-2xs text-muted-foreground italic">Sem período definido nesta inclusão</p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="border-t border-border px-6 py-4 flex items-center justify-between shrink-0">
                <p className="text-2xs text-muted-foreground">
                  Linhas em <span className="text-primary font-semibold">azul</span> têm dias alterados. Status das escalações não será modificado.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowBatchDiarias(false)}
                    className="border border-border text-slate-600 hover:bg-surface-muted rounded-xl px-5 py-2 text-sm font-medium transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSaveBatchDiarias}
                    disabled={batchSaveDiariasMutation.isPending}
                    className="flex items-center gap-2 text-primary-foreground rounded-xl px-5 py-2 text-sm font-semibold transition-all disabled:opacity-50 bg-primary hover:bg-primary-hover shadow-1"
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

      <ConfirmDialog
        open={confirmState.open}
        onOpenChange={(o) => { if (!o) closeConfirm(); }}
        tone={confirmState.variant === "confirm" ? "default" : "danger"}
        title={confirmState.title}
        description={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        onConfirm={confirmState.onConfirm}
      />
    </>
  );
}