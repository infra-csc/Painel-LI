import { useState, useMemo, useEffect, useRef, useDeferredValue, useCallback } from "react";
import { cn, fixEncoding, parseBrNumber } from "@/lib/utils";
import { formatarMoeda, avatarClasses } from "@/lib/format";
import { agruparPor, chaveComposta } from "@/lib/indices";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { apiRequest } from "@/lib/queryClient";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  BarChart3, CheckCircle, XCircle, RotateCcw,
  TrendingUp, TrendingDown, DollarSign,
  Calendar, MessageSquare, Info,
  ChevronDown, ChevronUp, AlertTriangle, Search, CheckSquare, Square,
  Send, Clock, ListChecks, Utensils, Car, AlertCircle, Check, Minus, GitFork, ClipboardList, X, UserX, Pencil, Wallet, RefreshCw
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { EventSearchSelect } from "@/components/event-select";
import { useSearch } from "wouter";
import { useEventoEmFoco } from "@/lib/use-evento-em-foco";
import type { Event, Function, Collaborator, BudgetActual, BudgetPlanned, BudgetComparison, BudgetNote, TeamInclusion } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { normalizeRole } from "@shared/roles";
import { PageHeader } from "@/components/common/page-header";
import { usePageTitle } from "@/components/common/use-page-title";
import { useSidebar } from "@/contexts/sidebar-context";
import { BudgetChat, BudgetNotesBadge, BudgetNotesSnippet } from "@/components/budget-chat";
import { ActivityTimeline, PlannedEditedBadge } from "@/components/activity-timeline";
import { diasComDiaria } from "@shared/calculation-rules";
import { EmptyState } from "@/components/common/empty-state";
import { RequiredMark } from "@/components/forms/required-mark";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";

const avatarColor = (name: string) => avatarClasses(name).join(" ");

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

// Formatador único de moeda (lib/format) — antes cada tela tinha o seu Intl.
const fmt = formatarMoeda;

// Parse seguro do JSON de rhAdjustedFields — retorna [] se ausente ou inválido
function parseAdjustedFields(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? Object.keys(parsed) : [];
  } catch {
    return [];
  }
}

// Classe padrão dos SelectItem (evita repetição da string em cada item)
const SELECT_ITEM_CLS = "hover:bg-brand-soft hover:text-primary-hover cursor-pointer focus:bg-brand-soft focus:text-primary-hover data-[state=checked]:bg-brand-soft data-[state=checked]:text-primary data-[state=checked]:font-medium";

// Forma dos registros de activity log retornados por /api/activity-logs/by-event
// (estruturalmente compatível com o ActivityLog interno de activity-timeline.tsx)
interface ActivityLogEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  created_at?: string | null;
  user_name?: string | null;
}

// ── Blocos de detalhamento (module scope para não remontar o DOM a cada render) ──

function CategoryBlock({ title, icon: Icon, iconColor, bgColor, stripColor, rows, badge }: {
  title: string;
  icon: LucideIcon;
  iconColor: string;
  bgColor: string;
  stripColor: string;
  rows: Array<{ label: string; planned: number; actual: number; isQuantity?: boolean }>;
  badge?: string;
}) {
  const currencyRows = rows.filter(r => !r.isQuantity);
  const subtotalPlanned = currencyRows.reduce((s, r) => s + r.planned, 0);
  const subtotalActual  = currencyRows.reduce((s, r) => s + r.actual,  0);
  const subtotalDiff    = subtotalActual - subtotalPlanned;
  const hasAnyDiff      = rows.some(r => r.planned !== r.actual);
  const fmtVal = (v: number, isQty?: boolean) => isQty ? String(v) : fmt(v);

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-surface-muted/50">
      {/* Category header */}
      <div className={`flex items-center justify-between px-3 ${bgColor} border-b border-border`} style={{ height: 32 }}>
        <div className="flex items-center gap-1.5">
          <div className={`w-4 h-4 rounded flex items-center justify-center ${stripColor}`}>
            <Icon className="w-2.5 h-2.5 text-white" />
          </div>
          <span className={`text-2xs font-bold uppercase tracking-wide ${iconColor}`}>{title}</span>
          {badge && (
            <span className="text-2xs font-medium text-muted-foreground bg-muted border border-border px-1.5 py-0.5 rounded-full leading-none">
              {badge}
            </span>
          )}
          {hasAnyDiff && (
            <span className="flex items-center gap-0.5 text-2xs font-semibold text-warning bg-warning-soft border border-warning/25 px-1.5 py-0.5 rounded-full leading-none">
              <AlertTriangle className="w-2 h-2" aria-hidden="true" /> Divergência
            </span>
          )}
        </div>
        <span className={`text-xs font-semibold tabular-nums ${iconColor}`}>{fmt(subtotalActual)}</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-border bg-card">
        {rows.map((row, i) => {
          const diff  = row.actual - row.planned;
          const isDiff = diff !== 0;
          return (
            <div key={i} className="grid grid-cols-4 gap-2 px-3 text-xs items-center" style={{ height: 32 }}>
              <span className="text-muted-foreground font-medium text-2xs">{row.label}</span>
              <span className="text-right tabular-nums text-primary font-medium text-2xs">{fmtVal(row.planned, row.isQuantity)}</span>
              <span className={`text-right tabular-nums font-medium text-2xs ${isDiff ? 'text-primary' : 'text-primary/70'}`}>
                {fmtVal(row.actual, row.isQuantity)}
              </span>
              <div className="text-right">
                {diff === 0 ? (
                  <span className="text-muted-foreground tabular-nums text-2xs">—</span>
                ) : (
                  <span className={`tabular-nums font-semibold text-2xs ${diff > 0 ? 'text-danger-strong' : 'text-success'}`}>
                    {row.isQuantity ? `${diff > 0 ? '+' : ''}${diff}` : `${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff))}`}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Subtotal */}
      {currencyRows.length > 0 && (
        <div className={`grid grid-cols-4 gap-2 px-3 text-2xs items-center border-t border-border ${subtotalDiff > 0 ? 'bg-danger-soft/40' : subtotalDiff < 0 ? 'bg-success-soft/40' : 'bg-surface-muted'}`} style={{ height: 28 }}>
          <span className="text-muted-foreground uppercase text-2xs tracking-wider font-semibold">Subtotal</span>
          <span className="text-right tabular-nums text-primary font-semibold">{fmt(subtotalPlanned)}</span>
          <span className={`text-right tabular-nums font-semibold ${subtotalDiff !== 0 ? 'text-primary' : 'text-primary'}`}>{fmt(subtotalActual)}</span>
          <div className="text-right">
            {subtotalDiff === 0 ? (
              <span className="text-muted-foreground tabular-nums">—</span>
            ) : (
              <span className={`tabular-nums text-2xs font-semibold ${subtotalDiff > 0 ? 'text-danger-strong' : 'text-success'}`}>
                {subtotalDiff > 0 ? '+' : '−'}{fmt(Math.abs(subtotalDiff))}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Sub-linha do modal de divisão (zebra controlada pelo chamador)
function SubRow({ label, planned, actual, rowIndex }: { label: string; planned: number; actual: number; rowIndex: number }) {
  const d = actual - planned;
  return (
    <div className={`grid grid-cols-4 gap-4 px-4 py-2 items-center ${rowIndex % 2 === 0 ? 'bg-card' : 'bg-surface-muted/70'}`}>
      <div className="flex items-center gap-1.5 pl-3">
        <span className="text-muted-foreground text-2xs select-none">└</span>
        <span className="text-2xs text-muted-foreground">{label}</span>
      </div>
      <span className="text-right tabular-nums text-2xs text-primary">{fmt(planned)}</span>
      <span className={`text-right tabular-nums text-2xs ${d !== 0 ? 'text-primary' : 'text-primary/70'}`}>{fmt(actual)}</span>
      <div className="text-right">
        {d === 0 ? <span className="text-muted-foreground text-2xs">—</span> : (
          <span className={`text-2xs font-semibold ${d > 0 ? 'text-danger-strong' : 'text-success-strong'}`}>
            {d > 0 ? '+' : '−'}{fmt(Math.abs(d))}
          </span>
        )}
      </div>
    </div>
  );
}

// Seção com cabeçalho colorido do modal de divisão
function SectionBlock({ title, icon: Icon, headerBg, iconColor, titleColor, subtotalPlan, subtotalAct, children }: {
  title: string; icon: LucideIcon; headerBg: string; iconColor: string; titleColor: string;
  subtotalPlan: number; subtotalAct: number; children: React.ReactNode;
}) {
  const d = subtotalAct - subtotalPlan;
  return (
    <div className="rounded-xl overflow-hidden border border-border">
      <div className={`flex items-center gap-1.5 px-4 py-2 border-b border-white/40 ${headerBg}`}>
        <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
        <span className={`text-2xs font-bold tracking-wide ${titleColor}`}>{title}</span>
      </div>
      <div className={`grid grid-cols-4 gap-4 px-4 py-2 ${headerBg}`}>
        <span className={`text-2xs font-semibold ${titleColor} opacity-70`}>Total</span>
        <span className="text-right tabular-nums text-2xs text-primary font-semibold">{fmt(subtotalPlan)}</span>
        <span className={`text-right tabular-nums text-2xs font-semibold ${d !== 0 ? 'text-primary' : 'text-primary'}`}>{fmt(subtotalAct)}</span>
        <div className="text-right">
          {d === 0
            ? <span className="text-muted-foreground text-2xs">—</span>
            : <span className={`text-2xs font-bold tabular-nums ${d > 0 ? 'text-danger-strong' : 'text-success-strong'}`}>
                {d > 0 ? '+' : '−'}{fmt(Math.abs(d))}
              </span>
          }
        </div>
      </div>
      <div className="divide-y divide-border">
        {children}
      </div>
    </div>
  );
}

/** Resumo do crédito/estorno automático no Flash devolvido pelas rotas do comparativo. */
type FlashCreditResumo = { ok?: boolean; movements?: number; collaborators?: number; created?: number; updated?: number; removed?: number; alimentacaoCents?: number; mobilidadeCents?: number };

export default function BudgetComparisonPage() {
  usePageTitle("Comparativo");
  const searchString = useSearch();
  const { urlCollaboratorId, urlFunctionId } = useMemo(() => {
    const p = new URLSearchParams(searchString);
    return {
      urlCollaboratorId: p.get("collaborator") || "",
      urlFunctionId: p.get("function") || "",
    };
  }, [searchString]);
  const [highlightCardId, setHighlightCardId] = useState<string>("");

  // Evento em foco (23/09): compartilhado com Planejado, Realizado, Controle RH e Notas.
  const { eventId: selectedEventId, setEventId: setSelectedEventId, sanitize: sanearEventoEmFoco } = useEventoEmFoco();
  const [actionModal, setActionModal] = useState<{ type: 'approve' | 'reject' | 'return' } | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [actionNoteError, setActionNoteError] = useState(false);
  // Expansão por id do BudgetActual (não por índice): mudar a ordenação com cards
  // abertos expandia outros cards — mesma correção já aplicada na seleção abaixo
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'difference' | 'total'>('difference');
  const [searchTerm, setSearchTerm] = useState("");
  const [filterFunction, setFilterFunction] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  // Filtro por status via chips do topo (toggle) — null = sem filtro.
  // "Não enviado" não é filtrável: esses itens não entram na base do comparativo.
  const [statusFilter, setStatusFilter] = useState<'para_analise' | 'aprovado' | 'rejeitado' | 'devolvido' | null>(null);
  // Seleção por id do BudgetActual (não por índice): filtrar/ordenar deslocava os índices
  // e o RH acabava aprovando itens errados
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [confirmAdjustOpen, setConfirmAdjustOpen] = useState(false);
  // Reabertura do comparativo aprovado (devolve o comparativo e ESTORNA o Flash)
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenReasonError, setReopenReasonError] = useState(false);
  const [editingActual, setEditingActual] = useState<BudgetActual | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [splitDetail, setSplitDetail] = useState<{
    actual: BudgetActual;
    planned: BudgetPlanned | null;
    propPlanned: BudgetPlanned | null;
    isParent: boolean;
    allGroupDays: string[];
  } | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const { sidebarWidth } = useSidebar();
  const qc = useQueryClient();

  const { data: events } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  // Evento em foco que não existe mais (excluído) é descartado assim que a lista chega (23/09).
  useEffect(() => { if (events?.length) sanearEventoEmFoco(events.map(e => e.id)); }, [events, sanearEventoEmFoco]);
  const { data: functions } = useQuery<Function[]>({ queryKey: ["/api/functions"] });
  const { data: collaborators } = useQuery<Collaborator[]>({ queryKey: ["/api/collaborators"] });
  // Só as escalações do evento em foco (`?eventId=`, contrato 23/09) — antes
  // baixava as ~4.500 de todos os eventos para achar o período de cada card.
  const { data: allTeamInclusions = [] } = useQuery<TeamInclusion[]>({
    queryKey: ["/api/team-inclusions", selectedEventId],
    queryFn: () => apiRequest("GET", `/api/team-inclusions?eventId=${selectedEventId}`).then(r => r.json()),
    enabled: !!selectedEventId,
  });
  // Escalação por evento+colaborador+função (primeira vence, como o `.find` antigo)
  const inclusaoPorChave = useMemo(
    () => agruparPor(allTeamInclusions, t => chaveComposta(t.eventId, t.collaboratorId, t.functionId)),
    [allTeamInclusions],
  );

  // Consultas do evento por `apiRequest` (23/09): checa `res.ok`, trata 401 e
  // HTML de servidor desatualizado. As chaves seguem com o id separado porque
  // as invalidações do app usam esse formato — por isso o `queryFn` fica.
  const { data: comparison, isLoading: isLoadingComparison, isError: isErrorComparison, refetch: refetchComparison } = useQuery<BudgetComparison | null>({
    queryKey: ["/api/budget-comparison", selectedEventId],
    queryFn: () => apiRequest("GET", `/api/budget-comparison?eventId=${selectedEventId}`).then(r => r.json()),
    enabled: !!selectedEventId,
  });

  const { data: eventNotes = [] } = useQuery<BudgetNote[]>({
    queryKey: ["/api/budget-notes/by-event", "actual", selectedEventId],
    queryFn: () => apiRequest("GET", `/api/budget-notes/by-event?entityType=actual&eventId=${selectedEventId}`).then(r => r.json()),
    enabled: !!selectedEventId,
  });

  const { data: plannedLogs = [] } = useQuery<ActivityLogEntry[]>({
    queryKey: ['/api/activity-logs/by-event', 'budget_planned', selectedEventId],
    // Lança em erro (23/09) em vez de devolver `[]` — mesma regra do Realizado.
    queryFn: () => apiRequest("GET", `/api/activity-logs/by-event?entityType=budget_planned&eventId=${selectedEventId}`).then(r => r.json()),
    enabled: !!selectedEventId,
    staleTime: 60_000,
  });

  const { data: budgetPlanned, isLoading: isLoadingPlanned, isError: isErrorPlanned, refetch: refetchPlanned } = useQuery<BudgetPlanned[]>({
    queryKey: ["/api/budget-planned", selectedEventId],
    queryFn: () => apiRequest("GET", `/api/budget-planned?eventId=${selectedEventId}`).then(r => r.json()),
    enabled: !!selectedEventId,
  });

  const { data: budgetActual, isLoading: isLoadingActual, isError: isErrorActual, refetch: refetchActual } = useQuery<BudgetActual[]>({
    queryKey: ["/api/budget-actual", selectedEventId],
    queryFn: () => apiRequest("GET", `/api/budget-actual?eventId=${selectedEventId}`).then(r => r.json()),
    enabled: !!selectedEventId,
  });

  const calculateMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const res = await apiRequest("POST", `/api/budget-comparison/calculate/${eventId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Comparativo recalculado", variant: "success" });
      qc.invalidateQueries({ queryKey: ["/api/budget-comparison"] });
    },
    onError: (err: unknown) => {
      toast({ title: "Não foi possível recalcular o comparativo", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" });
    },
  });

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
    onSuccess: (data: { skipped?: unknown[] }, variables) => {
      const labels: Record<string, { title: string; cls: string }> = {
        aprovado: { title: "Prestação aprovada — análise formal do RH", cls: "bg-success-soft border-success/25 text-success" },
        rejeitado: { title: "Prestação recusada", cls: "bg-danger-soft border-danger/25 text-danger" },
        devolvido: { title: "Devolvido para ajustes", cls: "bg-warning-soft border-warning/25 text-warning" },
      };
      const info = labels[variables.action];
      // O servidor pula itens que não estão enviados (ex.: filho de divisão
      // ainda pendente) — sem este aviso, o "sucesso" escondia itens de fora.
      const skipped = Array.isArray(data?.skipped) ? data.skipped.length : 0;
      if (skipped > 0) {
        toast({
          title: `${info?.title || "Ação realizada"} — ${skipped} ${skipped === 1 ? "item ficou de fora" : "itens ficaram de fora"}`,
          description: "Itens ainda não enviados para análise não entram na decisão. Peça o envio no Realizado e decida-os depois.",
          variant: "warning",
        });
      } else {
        toast({ title: info?.title || "Ação realizada", className: info?.cls });
      }
      qc.invalidateQueries({ queryKey: ["/api/budget-actual"] });
      qc.invalidateQueries({ queryKey: ["/api/budget-comparison"] });
      setActionModal(null);
      setActionNote("");
      setActionNoteError(false);
      setSelectedItems(new Set());
    },
    onError: (err: unknown) => {
      toast({
        title: "Erro ao processar a ação",
        description: apiErrorMessage(err, "Não foi possível concluir a ação do RH. Tente novamente."),
        variant: "destructive",
      });
    },
  });

  // `normalizeRole` (23/09): papéis legados ("financeiro", "administrador")
  // perdiam os botões do RH nesta tela.
  const papel = normalizeRole(user?.role);
  const isRhOrAdmin = papel === "admin" || papel === "financial";

  // Aprovação do COMPARATIVO (fechamento do evento). Decisão 19/08: é aqui que
  // alimentação e mobilidade de todas as prestações entram na Conta Corrente
  // Flash — a NF/OC depois só documenta. O servidor devolve o resumo em
  // `flashCredit`; se o crédito falhar, a aprovação continua valendo e o toast
  // avisa (política flashSync.ok=false herdada da regra anterior).
  const approveComparisonMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/budget-comparison/${id}/approve`, {});
      return res.json();
    },
    onSuccess: (data: { flashCredit?: FlashCreditResumo }) => {
      qc.invalidateQueries({ queryKey: ["/api/budget-comparison"] });
      qc.invalidateQueries({ queryKey: ["/api/flash-movements"] });
      const fc = data?.flashCredit;
      if (fc && fc.ok === false) {
        toast({
          title: "Comparativo aprovado — Flash NÃO creditado",
          description: "A aprovação foi salva, mas os créditos de alimentação e mobilidade não entraram na Conta Corrente Flash. Avise o RH e aprove novamente para refazer o crédito.",
          variant: "warning",
        });
        return;
      }
      const n = fc?.movements || 0;
      const pessoas = fc?.collaborators || 0;
      toast({
        title: "Comparativo aprovado",
        description: n > 0
          ? `${n} lançamento${n !== 1 ? 's' : ''} no Flash para ${pessoas} colaborador${pessoas !== 1 ? 'es' : ''} — alimentação ${fmt(fc?.alimentacaoCents || 0)} · mobilidade ${fmt(fc?.mobilidadeCents || 0)}.`
          : "Nenhum valor de alimentação ou mobilidade a creditar no Flash neste evento.",
        variant: "success",
      });
    },
    onError: (err: unknown) => {
      toast({
        title: "Erro ao aprovar o comparativo",
        description: apiErrorMessage(err, "Não foi possível aprovar o comparativo. Tente novamente."),
        variant: "destructive",
      });
    },
  });

  // RESSINCRONIZAR o Flash de um comparativo JÁ APROVADO. O Realizado pode
  // mudar depois da aprovação (o RH edita valores aqui mesmo, e o PATCH de
  // /api/budget-actual não trava item aprovado) — sem isto o saldo do Flash
  // ficava defasado sem caminho de correção. A rota /approve é IDEMPOTENTE:
  // reconcilia por (comparativo, prestação, categoria), criando, atualizando e
  // removendo o que mudou; não duplica lançamento nem muda o status.
  const resyncFlashMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/budget-comparison/${id}/approve`, {});
      return res.json();
    },
    onSuccess: (data: { flashCredit?: FlashCreditResumo }) => {
      qc.invalidateQueries({ queryKey: ["/api/budget-comparison"] });
      qc.invalidateQueries({ queryKey: ["/api/flash-movements"] });
      const fc = data?.flashCredit;
      if (fc && fc.ok === false) {
        toast({
          title: "Flash NÃO ressincronizado",
          description: "A Conta Corrente Flash continua com os valores antigos. Tente de novo em instantes.",
          variant: "destructive",
        });
        return;
      }
      const mudou = (fc?.created || 0) + (fc?.updated || 0) + (fc?.removed || 0);
      toast({
        title: mudou > 0 ? "Flash ressincronizado" : "Flash já estava em dia",
        description: mudou > 0
          ? `${fc?.created || 0} criado(s) · ${fc?.updated || 0} atualizado(s) · ${fc?.removed || 0} removido(s) — alimentação ${fmt(fc?.alimentacaoCents || 0)} · mobilidade ${fmt(fc?.mobilidadeCents || 0)}.`
          : "Nenhum lançamento precisou mudar: a Conta Corrente Flash já reflete o Realizado atual.",
        variant: "success",
      });
    },
    onError: (err: unknown) => {
      toast({
        title: "Erro ao ressincronizar o Flash",
        description: apiErrorMessage(err, "Não foi possível ressincronizar. Tente novamente."),
        variant: "destructive",
      });
    },
  });

  // REABRIR o comparativo aprovado. Usa /return ("devolvido") e não /reject:
  // reabrir é devolver o evento para ajuste, não recusar o trabalho — o RH
  // corrige o Realizado e aprova de novo. O servidor estorna (APAGA) os
  // lançamentos automáticos do Flash daquele evento no mesmo passo.
  // Até 19/08 este era o único caminho de estorno documentado nas mensagens do
  // servidor, mas NENHUM botão o chamava: os do rodapé decidem POR PRESTAÇÃO
  // (/api/budget-actual/rh-action). Este é o botão que faltava.
  const reopenComparisonMutation = useMutation({
    mutationFn: async ({ id, returnReason }: { id: string; returnReason: string }) => {
      const res = await apiRequest("POST", `/api/budget-comparison/${id}/return`, { returnReason });
      return res.json();
    },
    onSuccess: (data: { flashReverse?: FlashCreditResumo }) => {
      qc.invalidateQueries({ queryKey: ["/api/budget-comparison"] });
      qc.invalidateQueries({ queryKey: ["/api/flash-movements"] });
      setReopenOpen(false);
      setReopenReason("");
      setReopenReasonError(false);
      const fr = data?.flashReverse;
      if (fr && fr.ok === false) {
        toast({
          title: "Comparativo reaberto — Flash NÃO estornado",
          description: "O comparativo voltou para ajuste, mas os lançamentos automáticos continuam na Conta Corrente Flash. Reabra de novo para tentar o estorno.",
          variant: "warning",
        });
        return;
      }
      const n = fr?.removed || 0;
      toast({
        title: "Comparativo reaberto para ajuste",
        description: n > 0
          ? `${n} lançamento${n !== 1 ? 's' : ''} automático${n !== 1 ? 's' : ''} removido${n !== 1 ? 's' : ''} da Conta Corrente Flash. Ao aprovar de novo, o crédito é recriado.`
          : "Não havia lançamento automático no Flash para estornar neste evento.",
        variant: "warning",
      });
    },
    onError: (err: unknown) => {
      toast({
        title: "Erro ao reabrir o comparativo",
        description: apiErrorMessage(err, "Não foi possível reabrir o comparativo. Tente novamente."),
        variant: "destructive",
      });
    },
  });

  const patchActualMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, string | number | null> }) => {
      const res = await apiRequest("PATCH", `/api/budget-actual/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/budget-actual"] });
      qc.invalidateQueries({ queryKey: ["/api/budget-comparison"] });
      setEditingActual(null);
      toast({ title: "Realizado atualizado pelo RH", variant: "warning" });
    },
    onError: (err: unknown) => toast({ title: "Não foi possível salvar o Realizado", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" }),
  });

  const openEditModal = (actual: BudgetActual) => {
    setEditingActual(actual);
    setEditForm({
      dailyQuantity: String(actual.dailyQuantity),
      dailyValue: (actual.dailyValue / 100).toFixed(2),
      weekdayLunch: (actual.weekdayLunch / 100).toFixed(2),
      weekdayDinner: (actual.weekdayDinner / 100).toFixed(2),
      weekendLunch: (actual.weekendLunch / 100).toFixed(2),
      weekendDinner: (actual.weekendDinner / 100).toFixed(2),
      mobility: (actual.mobility / 100).toFixed(2),
      rhAdjustNote: actual.rhAdjustNote || '',
    });
  };

  const saveEditModal = () => {
    if (!editingActual) return;
    const orig = editingActual;
    // parseBrNumber trata "1.500,00" como 1500 (ponto de milhar + vírgula decimal)
    const toCents = (v: string) => Math.round(parseBrNumber(v) * 100);
    const parsed = {
      dailyQuantity: parseInt(editForm.dailyQuantity) || 0,
      dailyValue: toCents(editForm.dailyValue),
      weekdayLunch: toCents(editForm.weekdayLunch),
      weekdayDinner: toCents(editForm.weekdayDinner),
      weekendLunch: toCents(editForm.weekendLunch),
      weekendDinner: toCents(editForm.weekendDinner),
      mobility: toCents(editForm.mobility),
    };
    // Envia apenas o que foi realmente editado. Recalcular tudo alterava o total em centavos
    // sem o usuário mudar nada (dailyValue é uma média arredondada — qty×dailyValue não
    // reproduz o subtotal de diárias gravado dia a dia).
    const data: Record<string, string | number | null> = { rhAdjustNote: editForm.rhAdjustNote?.trim() || null };
    (Object.keys(parsed) as Array<keyof typeof parsed>).forEach(k => {
      if (parsed[k] !== orig[k]) data[k] = parsed[k];
    });
    const anyNumericChange = Object.keys(data).some(k => k !== 'rhAdjustNote');
    if (anyNumericChange) {
      const origMeals = orig.weekdayLunch + orig.weekdayDinner + orig.weekendLunch + orig.weekendDinner;
      const storedDiarias = orig.totalValue - origMeals - orig.mobility - orig.transport;
      const dailyChanged = parsed.dailyQuantity !== orig.dailyQuantity || parsed.dailyValue !== orig.dailyValue;
      const newDaily = dailyChanged ? parsed.dailyQuantity * parsed.dailyValue : storedDiarias;
      const newMeals = parsed.weekdayLunch + parsed.weekdayDinner + parsed.weekendLunch + parsed.weekendDinner;
      data.totalValue = newDaily + newMeals + parsed.mobility + orig.transport;
    }
    // Sem mudança numérica: totalValue original é preservado (não é enviado no PATCH)
    patchActualMutation.mutate({ id: orig.id, data });
  };

  const handleAction = () => {
    if (!actionModal) return;
    // Manual do Financeiro: ao devolver ou recusar, a observação é OBRIGATÓRIA
    // (o responsável de função a recebe na tela do Realizado). No aprovar segue opcional.
    if ((actionModal.type === 'reject' || actionModal.type === 'return') && !actionNote.trim()) {
      setActionNoteError(true);
      toast({
        title: "Observação obrigatória",
        description: actionModal.type === 'reject'
          ? "Para recusar, escreva o motivo da recusa — o responsável de função receberá esta observação."
          : "Para devolver, descreva o que precisa ser corrigido — o responsável de função receberá esta observação.",
        variant: "destructive",
      });
      return;
    }
    const actionMap: Record<string, string> = { approve: 'aprovado', reject: 'rejeitado', return: 'devolvido' };
    const rhAction = actionMap[actionModal.type];
    const selectedActualIds = sortedData
      .filter(row => selectedItems.has(row.actual.id))
      .flatMap(row => {
        const ids: string[] = [row.actual.id];
        if (row.isSplit) ids.push(...row.splitChildren.map(c => c.id));
        return ids;
      });
    if (selectedActualIds.length === 0) return;
    rhActionMutation.mutate({ itemIds: selectedActualIds, action: rhAction, comment: actionNote });
  };

  const fmtDate = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00");
    const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${d.getDate()}/${monthNames[d.getMonth()]} (${dayNames[d.getDay()]})`;
  };

  const fmtDateShort = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00");
    const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${d.getDate()}/${monthNames[d.getMonth()]}`;
  };

  // Índices O(1) para nomes (antes `.find` por linha e por comparador de ordenação)
  const collaboratorNameById = useMemo(() => {
    const m = new Map<string, string>();
    collaborators?.forEach(c => m.set(c.id, fixEncoding(c.fullName) || "-"));
    return m;
  }, [collaborators]);
  const functionNameById = useMemo(() => {
    const m = new Map<string, string>();
    functions?.forEach(f => m.set(f.id, f.name));
    return m;
  }, [functions]);
  const getCollaboratorName = useCallback((id?: string | null) =>
    id ? collaboratorNameById.get(id) || "-" : "-", [collaboratorNameById]);

  const getFunctionName = useCallback((id?: string | null) =>
    id ? functionNameById.get(id) || "-" : "-", [functionNameById]);

  const selectedEvent = events?.find(e => e.id === selectedEventId);

  // Helper: count days from workedDays array or return 0
  const getWorkedDayCount = (item: BudgetActual): number => {
    const wd = (item.workedDays as string[] | null) || [];
    return wd.length;
  };

  // Returns true if a YYYY-MM-DD string is Saturday or Sunday
  const isWknd = (d: string) => { const day = new Date(d + 'T12:00:00').getDay(); return day === 0 || day === 6; };

  // Helper: scale a planned record proportionally using real weekday/weekend counts from the split group
  const proportionalPlanned = (planned: BudgetPlanned, item: BudgetActual, allGroupDays: string[]): BudgetPlanned => {
    const myDays = (item.workedDays as string[] | null) || [];
    if (allGroupDays.length === 0) return planned;
    // Item que cedeu todos os dias na divisão: o planejado proporcional é ZERO —
    // devolver o rawPlan fazia o titular sem dias herdar o planejado cheio
    if (myDays.length === 0) {
      return {
        ...planned,
        dailyQuantity: 0,
        weekdayLunch: 0,
        weekdayDinner: 0,
        weekendLunch: 0,
        weekendDinner: 0,
        mobility: 0,
        transport: 0,
        totalValue: 0,
      };
    }
    if (myDays.length >= allGroupDays.length) return planned;

    const origWkdays = allGroupDays.filter(d => !isWknd(d)).length;
    const origWknds  = allGroupDays.filter(d =>  isWknd(d)).length;
    const myWkdays   = myDays.filter(d => !isWknd(d)).length;
    const myWknds    = myDays.filter(d =>  isWknd(d)).length;

    const wkdayRatio = origWkdays > 0 ? myWkdays / origWkdays : 0;
    const wkndRatio  = origWknds  > 0 ? myWknds  / origWknds  : 0;
    const dayRatio   = myDays.length / allGroupDays.length;

    // Regra 17/08: casa (CLT) só recebe diária nos fins de semana — mesma
    // função do Planejado (shared/calculation-rules) sobre os dias herdados
    const myDiasDiaria     = diasComDiaria(planned.collaboratorType, myWkdays, myWknds, getFunctionName(planned.functionId));
    const propDiarias      = myDiasDiaria * planned.dailyValue;
    const propWkdayLunch   = Math.round(planned.weekdayLunch  * wkdayRatio);
    const propWkdayDinner  = Math.round(planned.weekdayDinner * wkdayRatio);
    const propWkndLunch    = Math.round(planned.weekendLunch   * wkndRatio);
    const propWkndDinner   = Math.round(planned.weekendDinner  * wkndRatio);
    const propMobility     = Math.round(planned.mobility       * dayRatio);
    const propTransport    = Math.round(planned.transport      * dayRatio);

    return {
      ...planned,
      dailyQuantity: myDiasDiaria,
      weekdayLunch:  propWkdayLunch,
      weekdayDinner: propWkdayDinner,
      weekendLunch:  propWkndLunch,
      weekendDinner: propWkndDinner,
      mobility:      propMobility,
      transport:     propTransport,
      totalValue:    propDiarias + propWkdayLunch + propWkdayDinner + propWkndLunch + propWkndDinner + propMobility + propTransport,
    };
  };

  const comparisonData = useMemo(() => {
    if (!budgetPlanned || !budgetActual) return [];
    // Base do comparativo: itens enviados OU já decididos pelo RH. O servidor zera
    // sentForReview ao devolver/recusar — sem o segundo critério, devolvidos e
    // recusados sumiam da lista do RH.
    const sentActual = budgetActual.filter(a =>
      a.sentForReview || ['aprovado', 'devolvido', 'rejeitado'].includes(a.rhStatus || '')
    );

    // Build map: parentId → split children (regardless of sentForReview on children)
    const splitChildrenMap = new Map<string, BudgetActual[]>();
    budgetActual.forEach(a => {
      if (a.splitParentId) {
        const arr = splitChildrenMap.get(a.splitParentId) || [];
        arr.push(a);
        splitChildrenMap.set(a.splitParentId, arr);
      }
    });

    const data: Array<{
      collaboratorId: string | null;
      collaboratorType: string | null;
      functionId: string | null;
      planned: BudgetPlanned | null;
      actual: BudgetActual;
      variance: number;
      isSplit: boolean;
      splitChildren: BudgetActual[];
      groupActualTotal: number;
    }> = [];

    // Only process non-child items (parents and standalone items)
    sentActual.filter(a => !a.splitParentId).forEach(a => {
      const matchingPlanned = a.plannedId
        ? budgetPlanned.find(p => p.id === a.plannedId)
        : budgetPlanned.find(p => p.collaboratorId === a.collaboratorId && p.functionId === a.functionId && p.eventId === a.eventId);

      const children = splitChildrenMap.get(a.id) || [];
      const isSplit = children.length > 0;
      // If the planned record is marked as not attended, their values are excluded from totals
      const isNotAttendedPlanned = !!matchingPlanned?.didNotAttend;
      const groupActualTotal = isNotAttendedPlanned ? 0 : (a.totalValue + children.reduce((s, c) => s + c.totalValue, 0));

      data.push({
        collaboratorId: a.collaboratorId,
        collaboratorType: a.collaboratorType,
        functionId: a.functionId,
        planned: matchingPlanned || null,
        actual: a,
        // For split groups: variance is based on the group total vs original full planned; 0 if not attended
        variance: isNotAttendedPlanned ? 0 : (matchingPlanned ? (groupActualTotal - matchingPlanned.totalValue) : groupActualTotal),
        isSplit,
        splitChildren: children,
        groupActualTotal,
      });
    });
    return data;
  }, [budgetPlanned, budgetActual]);

  // Guarda contra POSTs de recálculo desnecessários ao navegar: hash por item
  // (`id:totalValue` de cada prestação, inclusive filhos de divisão) — soma agregada
  // perdia edições que se cancelavam entre itens
  const lastCalcHashRef = useRef<string>("");
  // `mutate` é estável no react-query v5; o objeto da mutation inteiro não é.
  const { mutate: calcularComparativo, isPending: calculando } = calculateMutation;
  useEffect(() => {
    if (!selectedEventId || isLoadingComparison || comparisonData.length === 0 || calculando) return;
    const itemsSignature = comparisonData
      .flatMap(r => [r.actual, ...r.splitChildren].map(i => `${i.id}:${i.totalValue}`))
      .sort()
      .join(',');
    const hash = `${selectedEventId}|${itemsSignature}`;
    if (hash === lastCalcHashRef.current) return; // nada mudou desde a última observação
    const isFirstObservationForEvent = !lastCalcHashRef.current.startsWith(`${selectedEventId}|`);
    lastCalcHashRef.current = hash;
    // Calcula quando ainda não existe comparativo; recalcula apenas se os actuals mudaram de fato
    if (!comparison || !isFirstObservationForEvent) {
      calcularComparativo(selectedEventId);
    }
  }, [selectedEventId, comparison, isLoadingComparison, comparisonData, calculando, calcularComparativo]);

  // Limpa a seleção quando busca/filtro mudam — itens selecionados podem sair da
  // lista visível. Ordenar não muda a visibilidade, então sortBy fica de fora.
  // `useDeferredValue` (23/09): refiltrar a cada tecla travava a digitação
  // nas listas grandes. O input continua controlado por `searchTerm`.
  const buscaAplicada = useDeferredValue(searchTerm);
  useEffect(() => {
    setSelectedItems(new Set());
  }, [buscaAplicada, filterFunction, filterType, statusFilter]);

  const filteredData = useMemo(() => {
    let data = [...comparisonData];
    if (buscaAplicada) {
      const term = buscaAplicada.toLowerCase();
      data = data.filter(r => getCollaboratorName(r.collaboratorId).toLowerCase().includes(term));
    }
    if (filterFunction !== "all") data = data.filter(r => r.functionId === filterFunction);
    if (filterType !== "all") data = data.filter(r => r.collaboratorType === filterType);
    if (statusFilter) {
      data = data.filter(r => {
        const st = r.actual.rhStatus || 'pendente';
        if (statusFilter === 'para_analise') return r.actual.sentForReview && st === 'pendente';
        return st === statusFilter;
      });
    }
    return data;
  }, [comparisonData, buscaAplicada, filterFunction, filterType, statusFilter, getCollaboratorName]);

  const sortedData = useMemo(() => {
    const sorted = [...filteredData];
    if (sortBy === 'difference') sorted.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
    else sorted.sort((a, b) => b.groupActualTotal - a.groupActualTotal);
    return sorted;
  }, [filteredData, sortBy]);

  const didScrollToCard = useRef(false);
  useEffect(() => {
    if (didScrollToCard.current || !sortedData.length || !urlCollaboratorId || !urlFunctionId) return;
    const idx = sortedData.findIndex(r => r.collaboratorId === urlCollaboratorId && r.functionId === urlFunctionId);
    if (idx >= 0) {
      didScrollToCard.current = true;
      const targetId = sortedData[idx].actual.id;
      const cardKey = `${urlCollaboratorId}-${urlFunctionId}`;
      setHighlightCardId(cardKey);
      setExpandedCards(prev => { const next = new Set(Array.from(prev)); next.add(targetId); return next; });
      setTimeout(() => {
        const el = document.querySelector(`[data-card-id="${cardKey}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
      setTimeout(() => setHighlightCardId(""), 4000);
    }
  }, [sortedData, urlCollaboratorId, urlFunctionId]);

  const usedFunctionIds = useMemo(() => {
    const ids = new Set(comparisonData.map(r => r.functionId).filter(Boolean));
    return Array.from(ids);
  }, [comparisonData]);

  const totals = useMemo(() => {
    // Always recompute from grouped data to avoid double-counting split children.
    // "Não participou" fica fora dos DOIS lados: o realizado já é zerado no
    // groupActualTotal e o planejado do ausente também não entra na soma.
    const totalPlanned = comparisonData.reduce(
      (s, r) => s + (r.planned && !r.planned.didNotAttend ? r.planned.totalValue : 0), 0);
    const totalActual = comparisonData.reduce((s, r) => s + r.groupActualTotal, 0);
    return { totalPlanned, totalActual, difference: totalActual - totalPlanned };
  }, [comparisonData]);

  const toggleExpand = (id: string) => {
    setExpandedCards(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  };

  // Totais do conjunto selecionado — exibidos no rodapé de decisão e no modal de confirmação
  const selectedTotals = useMemo(() => {
    const rows = sortedData.filter(r => selectedItems.has(r.actual.id));
    const planned = rows.reduce((s, r) => s + (r.planned?.totalValue || 0), 0);
    const actual = rows.reduce((s, r) => s + r.groupActualTotal, 0);
    return { planned, actual, diff: actual - planned };
  }, [sortedData, selectedItems]);

  const rhComment = comparison?.approvalObservation || comparison?.rejectionReason || comparison?.returnReason;

  // Fechamento do comparativo: só faz sentido quando todas as prestações do
  // evento já foram aprovadas item a item (mesmo critério do passo 4 do stepper).
  const allItemsApproved = useMemo(() => {
    const items = budgetActual || [];
    return items.length > 0 && items.every(i => i.rhStatus === 'aprovado');
  }, [budgetActual]);

  // O Realizado mudou DEPOIS da aprovação? O crédito do Flash é uma fotografia
  // do Realizado no momento em que o comparativo foi aprovado; como o RH pode
  // editar valores depois (aqui mesmo, no lápis do card), a foto envelhece.
  // Comparamos `budget_actual.updatedAt` com `comparison.approvedAt` —
  // 1s de tolerância porque a aprovação e a última gravação podem cair no mesmo
  // segundo sem que nada tenha mudado de fato.
  const realizadoChangedAfterApproval = useMemo(() => {
    if (!comparison || comparison.status !== 'aprovado' || !comparison.approvedAt) return false;
    const approvedMs = new Date(comparison.approvedAt as unknown as string).getTime();
    if (!Number.isFinite(approvedMs)) return false;
    return (budgetActual || []).some(i => {
      if (!i.updatedAt) return false;
      const ms = new Date(i.updatedAt as unknown as string).getTime();
      return Number.isFinite(ms) && ms > approvedMs + 1000;
    });
  }, [comparison, budgetActual]);

  return (
    <div className="space-y-5 max-w-5xl mx-auto pb-32">
      {/* ── Page header ── */}
      <PageHeader
        icon={BarChart3}
        title="Comparativo"
        subtitle="Planejado × Realizado — análise formal do RH; a NF é liberada no envio do Realizado"
        actions={selectedEventId && (
          <EventSearchSelect value={selectedEventId} onValueChange={v => { setSelectedEventId(v); setExpandedCards(new Set()); setSelectedItems(new Set()); }} events={events} />
        )}
      />

      {/* ── No event selected ── */}
      {!selectedEventId && (
        <EmptyState
          live={false}
          icon={BarChart3}
          title="Selecione um evento"
          description="Analise as diferenças entre o planejado e o realizado. O RH revisa e aprova os valores para faturamento."
          className="py-20"
          action={
            <div className="w-full max-w-sm text-left">
              <EventSearchSelect value={selectedEventId} onValueChange={v => { setSelectedEventId(v); setExpandedCards(new Set()); setSelectedItems(new Set()); }} events={events} />
            </div>
          }
        />
      )}

      {selectedEventId && selectedEvent && (
        <>
          {/* ── Stepper ── */}
          {(() => {
            // Passo atual calculado como no Realizado (não fixo): enquanto houver
            // item sem envio/decisão, ainda estamos na Prestação; tudo aprovado → NF
            const eventItems = budgetActual || [];
            const allSentOrDecided = eventItems.length > 0 && eventItems.every(i => i.sentForReview || ['aprovado', 'devolvido', 'rejeitado'].includes(i.rhStatus || ''));
            const allApproved = eventItems.length > 0 && eventItems.every(i => i.rhStatus === 'aprovado');
            const currentStep = allApproved ? 4 : allSentOrDecided ? 3 : 2;
            // Mesmos 4 passos e rótulos do Orçamento Realizado + etapa final de NF
            const steps = [
              { label: "Escalação", desc: "Inclusões confirmadas" },
              { label: "Planejamento RH", desc: "Valores previstos" },
              { label: "Prestação", desc: "Resp. preenche realizado" },
              { label: "Aprovação RH", desc: "Análise e aprovação" },
              { label: "Nota Fiscal", desc: "Liberada no envio do Realizado" },
            ];
            return (
              <div className="bg-card border border-border rounded-xl px-5 py-4">
                <div className="flex items-center justify-between">
                  {steps.map((step, i) => {
                    const isDone = i < currentStep;
                    const isActive = i === currentStep;
                    const isLast = i === steps.length - 1;
                    return (
                      <div key={i} className="flex items-center flex-1">
                        <div className="flex items-center gap-2">
                          <div className="relative flex-shrink-0">
                            {isActive && (
                              <div className="absolute inset-0 rounded-full opacity-30 animate-ping bg-success" />
                            )}
                            <div className={cn(`w-7 h-7 rounded-full flex items-center justify-center text-2xs font-bold relative`, (isDone ? "bg-success" : isActive ? "bg-success" : "bg-muted"), ((isDone || isActive) ? "text-white" : "text-muted-foreground"))}>
                              {isDone ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : (i + 1)}
                            </div>
                          </div>
                          <div className="min-w-0">
                            <div className={cn("text-2xs font-semibold leading-tight", ((isDone || isActive) ? "text-success" : "text-muted-foreground"))}>{step.label}</div>
                            <div className="text-2xs text-muted-foreground leading-tight mt-0.5">{step.desc}</div>
                          </div>
                        </div>
                        {!isLast && (
                          <div className={cn(`flex-1 h-[2px] mx-3 rounded-full`, (isDone ? "bg-success" : "bg-border"))} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ── Status pills ── */}
          {budgetActual && budgetActual.length > 0 && (() => {
            const totalActualItems = budgetActual.length;
            // Chips clicáveis contam sobre a MESMA base filtrada pelos cards
            // (comparisonData) — contar sobre budgetActual cru fazia o chip
            // prometer N itens e o filtro mostrar outro número
            const sentCount = comparisonData.filter(r => r.actual.sentForReview && (r.actual.rhStatus || 'pendente') === 'pendente').length;
            const approvedCount = comparisonData.filter(r => (r.actual.rhStatus || 'pendente') === 'aprovado').length;
            const rejectedCount = comparisonData.filter(r => (r.actual.rhStatus || 'pendente') === 'rejeitado').length;
            const returnedCount = comparisonData.filter(r => (r.actual.rhStatus || 'pendente') === 'devolvido').length;
            // "Não enviados" ficam fora da base do comparativo — o chip é apenas informativo
            const pendingCount = budgetActual.filter(a => !a.splitParentId && !a.sentForReview && (a.rhStatus || 'pendente') === 'pendente').length;
            type StatusFilterKey = 'para_analise' | 'aprovado' | 'rejeitado' | 'devolvido';
            const chips = [
              sentCount > 0 && { key: 'para_analise' as StatusFilterKey, icon: Send, count: sentCount, label: `para análise`, bg: 'bg-brand-soft', border: 'border-primary/25', iconColor: 'text-primary', numColor: 'text-primary', textColor: 'text-primary/70', ring: 'ring-ring' },
              approvedCount > 0 && { key: 'aprovado' as StatusFilterKey, icon: CheckCircle, count: approvedCount, label: `aprovado${approvedCount !== 1 ? 's' : ''}`, bg: 'bg-success-soft', border: 'border-success/25', iconColor: 'text-success-strong', numColor: 'text-success', textColor: 'text-success/70', ring: 'ring-success-strong' },
              rejectedCount > 0 && { key: 'rejeitado' as StatusFilterKey, icon: XCircle, count: rejectedCount, label: `recusado${rejectedCount !== 1 ? 's' : ''}`, bg: 'bg-danger-soft', border: 'border-danger/25', iconColor: 'text-danger-strong', numColor: 'text-danger', textColor: 'text-danger/70', ring: 'ring-danger-strong' },
              returnedCount > 0 && { key: 'devolvido' as StatusFilterKey, icon: RotateCcw, count: returnedCount, label: `devolvido${returnedCount !== 1 ? 's' : ''}`, bg: 'bg-warning-soft', border: 'border-warning/25', iconColor: 'text-warning-strong', numColor: 'text-warning', textColor: 'text-warning/70', ring: 'ring-warning-strong' },
            ].filter(Boolean) as Array<{ key: StatusFilterKey; icon: LucideIcon; count: number; label: string; bg: string; border: string; iconColor: string; numColor: string; textColor: string; ring: string }>;
            return (
              <div className="flex items-center gap-2 flex-wrap">
                {chips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    aria-pressed={statusFilter === chip.key}
                    onClick={() => setStatusFilter(prev => prev === chip.key ? null : chip.key)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-shadow cursor-pointer ${chip.bg} ${chip.border} ${statusFilter === chip.key ? `ring-2 ${chip.ring} shadow-1` : 'hover:shadow-1'}`}
                    title={statusFilter === chip.key ? 'Remover filtro' : 'Filtrar por este status'}
                  >
                    <chip.icon className={`w-3 h-3 ${chip.iconColor}`} />
                    <span className={`text-sm font-bold ${chip.numColor}`}>{chip.count}</span>
                    <span className={`text-2xs ${chip.textColor}`}>{chip.label}</span>
                  </button>
                ))}
                {pendingCount > 0 && (
                  <div
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-warning-soft border border-warning/25"
                    title="Prestações ainda não enviadas pelo responsável — não aparecem na lista abaixo"
                  >
                    <Clock className="w-3 h-3 text-warning-strong" aria-hidden="true" />
                    <span className="text-sm font-bold text-warning">{pendingCount}</span>
                    <span className="text-2xs text-warning/70">não enviado{pendingCount !== 1 ? 's' : ''}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-muted border border-border">
                  <ListChecks className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
                  <span className="text-sm font-bold text-slate-600">{totalActualItems}</span>
                  <span className="text-2xs text-muted-foreground">total</span>
                </div>
              </div>
            );
          })()}

          {/* ── 3 Metric cards ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Planejado */}
            <div className="rounded-xl border border-primary/25 p-5 bg-brand-soft">
              <div className="flex items-center justify-between mb-3">
                <p className="text-2xs uppercase text-muted-foreground font-medium tracking-widest">Total Planejado</p>
                <div className="w-7 h-7 rounded-lg bg-brand-soft/60 flex items-center justify-center">
                  <DollarSign className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                </div>
              </div>
              <p className="text-2xl font-bold text-foreground tabular-nums">{fmt(totals.totalPlanned)}</p>
              <p className="text-2xs text-muted-foreground font-light mt-1.5">Orçamento aprovado para o evento</p>
            </div>

            {/* Realizado */}
            <div className="rounded-xl border border-primary/25 p-5 bg-brand-soft">
              <div className="flex items-center justify-between mb-3">
                <p className="text-2xs uppercase text-muted-foreground font-medium tracking-widest">Total Realizado</p>
                <div className="w-7 h-7 rounded-lg bg-brand-soft/60 flex items-center justify-center">
                  <BarChart3 className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                </div>
              </div>
              <p className="text-2xl font-bold text-foreground tabular-nums">{fmt(totals.totalActual)}</p>
              <p className="text-2xs text-muted-foreground font-light mt-1.5">Valores prestados e enviados</p>
            </div>

            {/* Diferença */}
            <div className={`rounded-xl border p-5 ${
              totals.difference === 0 ? 'border-border bg-surface-muted' :
              totals.difference < 0 ? 'border-success/25 bg-success-soft' :
              'border-danger/25 bg-danger-soft'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-2xs uppercase text-muted-foreground font-medium tracking-widest">Diferença</p>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                  totals.difference === 0 ? 'bg-muted/60' :
                  totals.difference < 0 ? 'bg-success-soft/60' : 'bg-danger-soft/60'
                }`}>
                  {totals.difference === 0 ? <Minus className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" /> :
                   totals.difference < 0 ? <TrendingDown className="w-3.5 h-3.5 text-success-strong" aria-hidden="true" /> :
                   <TrendingUp className="w-3.5 h-3.5 text-danger-strong" aria-hidden="true" />}
                </div>
              </div>
              <p className={`text-2xl font-bold tabular-nums ${
                totals.difference === 0 ? 'text-muted-foreground' :
                totals.difference < 0 ? 'text-success' : 'text-danger'
              }`}>
                {totals.difference > 0 ? '+' : totals.difference < 0 ? '−' : ''}{fmt(Math.abs(totals.difference))}
              </p>
              <div className="flex items-center gap-1.5 mt-1.5">
                <p className={`text-2xs font-light ${
                  totals.difference === 0 ? 'text-muted-foreground' :
                  totals.difference < 0 ? 'text-success' : 'text-danger-strong'
                }`}>
                  {totals.difference === 0 ? 'Sem diferença' : totals.difference < 0 ? 'Economia' : 'Acima do planejado'}
                </p>
                {totals.totalPlanned > 0 && totals.difference !== 0 && (
                  <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${
                    totals.difference < 0 ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'
                  }`}>
                    {Math.abs(totals.difference / totals.totalPlanned * 100).toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── Info banner ── */}
          <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-muted border border-border rounded-xl">
            <Info className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" aria-hidden="true" />
            <span className="text-2xs text-muted-foreground">
              Valores referentes apenas às prestações enviadas para revisão pelo responsável de função
            </span>
          </div>

          {/* ── RH comment banner ── */}
          {rhComment && (
            <div className="rounded-xl border border-border bg-card p-3.5 flex items-start gap-2.5">
              <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" aria-hidden="true" />
              <div>
                <span className="text-2xs uppercase text-muted-foreground font-bold tracking-wider">Comentário do RH</span>
                <p className="text-sm text-slate-700 mt-0.5">{rhComment}</p>
              </div>
            </div>
          )}

          {/* ── Fechamento do comparativo (crédito no Flash — regra 19/08) ── */}
          {/* Comparativo APROVADO: o card aparece sempre (mesmo que alguma
              prestação tenha mudado de status depois), senão os botões de
              ressincronizar/estornar sumiriam justamente quando são precisos.
              `allItemsApproved` continua governando só a APROVAÇÃO inicial. */}
          {isRhOrAdmin && comparison && (comparison.status === 'aprovado' || allItemsApproved) && (
            comparison.status === 'aprovado' ? (
              <div className="rounded-xl border border-success/25 bg-success-soft p-3.5 space-y-3">
                <div className="flex items-start gap-2.5">
                  <Wallet className="w-4 h-4 text-success mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <div>
                    <span className="text-2xs uppercase text-success font-bold tracking-wider">Comparativo aprovado</span>
                    <p className="text-sm text-success mt-0.5">
                      Alimentação e mobilidade das prestações já foram creditadas na Conta Corrente Flash dos colaboradores. A nota fiscal apenas documenta o pagamento — não altera o saldo.
                    </p>
                  </div>
                </div>

                {/* Realizado editado depois da aprovação → o Flash ficou defasado */}
                {realizadoChangedAfterApproval && (
                  <div className="rounded-lg border border-warning/25 bg-warning-soft px-3 py-2.5 flex items-start gap-2" data-testid="alert-flash-defasado">
                    <AlertTriangle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" aria-hidden="true" />
                    <p className="text-xs text-warning">
                      <strong>O Realizado mudou depois da aprovação</strong> — os créditos no Flash ainda são os do momento em que o comparativo foi aprovado. Use <strong>Ressincronizar Flash</strong> para alinhar os lançamentos ao Realizado atual.
                    </p>
                  </div>
                )}

                {/* Correção e estorno: os dois caminhos que faltavam depois do aprovado */}
                <div className="flex flex-wrap items-center gap-2 pl-6">
                  <MotivoDesabilitado motivo="Reaplica a regra do crédito sobre o Realizado ATUAL. É idempotente: não duplica lançamento nem muda o status do comparativo." desabilitado={resyncFlashMutation.isPending || reopenComparisonMutation.isPending}>
                    <Button
                    variant="outline"
                    className={`h-8 text-xs px-3 rounded-lg font-semibold border-success/25 text-success hover:bg-success-soft ${realizadoChangedAfterApproval ? 'bg-card ring-2 ring-warning/25' : 'bg-card'}`}
                    onClick={() => resyncFlashMutation.mutate(comparison.id)}
                    disabled={resyncFlashMutation.isPending || reopenComparisonMutation.isPending}
                    data-testid="button-ressincronizar-flash"
                   
                  >
                    <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${resyncFlashMutation.isPending ? 'animate-spin' : ''}`} aria-hidden="true" />
                    {resyncFlashMutation.isPending ? 'Ressincronizando…' : 'Ressincronizar Flash'}
                  </Button>
                  </MotivoDesabilitado>
                  <MotivoDesabilitado motivo="Devolve o comparativo para ajuste e ESTORNA os lançamentos automáticos do Flash deste evento." desabilitado={reopenComparisonMutation.isPending || resyncFlashMutation.isPending}>
                    <Button
                    variant="outline"
                    className="h-8 text-xs px-3 rounded-lg font-semibold bg-card border-warning/25 text-warning hover:bg-warning-soft"
                    onClick={() => { setReopenReason(""); setReopenReasonError(false); setReopenOpen(true); }}
                    disabled={reopenComparisonMutation.isPending || resyncFlashMutation.isPending}
                    data-testid="button-reabrir-comparativo"
                   
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                    Reabrir comparativo (estorna o Flash)
                  </Button>
                  </MotivoDesabilitado>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-primary/25 bg-card p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <Wallet className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <div>
                    <span className="text-2xs uppercase text-muted-foreground font-bold tracking-wider">Fechamento do comparativo</span>
                    <p className="text-sm text-slate-700 mt-0.5">
                      Todas as prestações estão aprovadas. Ao aprovar o comparativo, <strong>alimentação e mobilidade</strong> de cada colaborador entram na Conta Corrente Flash (a diária não).
                    </p>
                  </div>
                </div>
                <Button
                  className="h-9 text-sm px-4 rounded-xl font-bold text-primary-foreground bg-primary hover:bg-primary-hover disabled:opacity-40"
                  onClick={() => approveComparisonMutation.mutate(comparison.id)}
                  disabled={approveComparisonMutation.isPending}
                >
                  <CheckCircle className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                  {approveComparisonMutation.isPending ? 'Aprovando…' : 'Aprovar comparativo e creditar o Flash'}
                </Button>
              </div>
            )
          )}

          {/* ── Detalhamento section ── */}
          <div>
            <div className="mb-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-black text-foreground">Detalhamento por Prestação</h2>
                  <span className="text-2xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{sortedData.length}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm" variant="ghost"
                    className="text-xs h-7 gap-1 rounded-lg text-muted-foreground hover:text-slate-700 hover:bg-muted"
                    onClick={() => {
                      // Interseção com os ids visíveis: comparar por size acumulado
                      // travava o botão quando havia ids expandidos fora do filtro
                      const allVisibleExpanded = sortedData.length > 0 && sortedData.every(r => expandedCards.has(r.actual.id));
                      if (allVisibleExpanded) setExpandedCards(new Set());
                      else setExpandedCards(new Set(sortedData.map(r => r.actual.id)));
                    }}
                  >
                    {sortedData.length > 0 && sortedData.every(r => expandedCards.has(r.actual.id)) ? <ChevronUp className="w-3 h-3" aria-hidden="true" /> : <ChevronDown className="w-3 h-3" aria-hidden="true" />}
                    {sortedData.length > 0 && sortedData.every(r => expandedCards.has(r.actual.id)) ? 'Recolher todos' : 'Expandir todos'}
                  </Button>
                  {isRhOrAdmin && (
                    <Button
                      size="sm" variant="ghost"
                      className="text-xs h-7 gap-1 rounded-lg text-muted-foreground hover:text-slate-700 hover:bg-muted"
                      onClick={() => {
                        const selectableIds = sortedData
                          .filter(row => (row.actual.rhStatus || 'pendente') === 'pendente')
                          .map(row => row.actual.id);
                        if (selectedItems.size > 0) setSelectedItems(new Set());
                        else setSelectedItems(new Set(selectableIds));
                      }}
                    >
                      {selectedItems.size > 0 ? <><CheckSquare className="w-3 h-3" aria-hidden="true" /> Limpar</> : <><Square className="w-3 h-3" aria-hidden="true" /> Selecionar todos</>}
                    </Button>
                  )}
                </div>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                  <Input placeholder="Buscar por nome…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="h-8 pl-8 text-xs rounded-xl border-border" />
                </div>
                <Select value={filterFunction} onValueChange={setFilterFunction}>
                  <SelectTrigger className="h-9 text-sm w-auto min-w-[160px] border border-border rounded-lg bg-card text-slate-700 hover:border-primary/40 transition-colors focus:ring-2 focus:ring-primary/25"><SelectValue placeholder="Função" /></SelectTrigger>
                  <SelectContent className="bg-card border border-border rounded-xl shadow-2 min-w-[180px]">
                    <SelectItem value="all" className={SELECT_ITEM_CLS}>Todas as funções</SelectItem>
                    {usedFunctionIds.map(fid => <SelectItem key={fid} value={fid!} className={SELECT_ITEM_CLS}>{getFunctionName(fid)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="h-9 text-sm w-28 border border-border rounded-lg bg-card text-slate-700 hover:border-primary/40 transition-colors focus:ring-2 focus:ring-primary/25"><SelectValue placeholder="Tipo" /></SelectTrigger>
                  <SelectContent className="bg-card border border-border rounded-xl shadow-2 min-w-[140px]">
                    <SelectItem value="all" className={SELECT_ITEM_CLS}>Todos</SelectItem>
                    <SelectItem value="casa" className={SELECT_ITEM_CLS}>Casa</SelectItem>
                    <SelectItem value="freela" className={SELECT_ITEM_CLS}>Freela</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortBy} onValueChange={(v: 'difference' | 'total') => setSortBy(v)}>
                  <SelectTrigger className="h-9 text-sm w-auto min-w-[160px] border border-border rounded-lg bg-card text-slate-700 hover:border-primary/40 transition-colors focus:ring-2 focus:ring-primary/25"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border border-border rounded-xl shadow-2 min-w-[180px]">
                    <SelectItem value="difference" className={SELECT_ITEM_CLS}>Maior diferença</SelectItem>
                    <SelectItem value="total" className={SELECT_ITEM_CLS}>Maior valor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Cards */}
            {(isLoadingPlanned || isLoadingActual || isLoadingComparison) ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-8 h-8 border-2 border-success-strong border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">Carregando prestações…</p>
              </div>
            ) : (isErrorPlanned || isErrorActual || isErrorComparison) ? (
              <div className="rounded-xl border-2 border-dashed border-danger/25 bg-danger-soft/50 p-12 text-center">
                <div className="w-12 h-12 rounded-xl bg-danger-soft flex items-center justify-center mx-auto mb-3">
                  <AlertCircle className="w-6 h-6 text-danger-strong" aria-hidden="true" />
                </div>
                <p className="font-semibold text-danger">Erro ao carregar as prestações</p>
                <p className="text-sm text-muted-foreground mt-1">Não foi possível carregar os dados do Planejado e do Realizado. Verifique sua conexão e tente novamente.</p>
                <Button
                  className="mt-4 h-9 px-5 rounded-xl text-sm font-semibold bg-card border border-danger/25 text-danger hover:bg-danger-soft shadow-none"
                  onClick={() => { if (isErrorPlanned) refetchPlanned(); if (isErrorActual) refetchActual(); if (isErrorComparison) refetchComparison(); }}
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Tentar novamente
                </Button>
              </div>
            ) : sortedData.length === 0 ? (
              (searchTerm || filterFunction !== 'all' || filterType !== 'all' || statusFilter) ? (
                <div className="rounded-xl border-2 border-dashed border-border bg-surface-muted p-12 text-center">
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                    <Search className="w-6 h-6 text-muted-foreground" aria-hidden="true" />
                  </div>
                  <p className="font-semibold text-muted-foreground">Nenhuma prestação corresponde aos filtros</p>
                  <p className="text-sm text-muted-foreground mt-1">Ajuste a busca ou os filtros para ver outras prestações.</p>
                  <Button
                    variant="ghost"
                    className="mt-3 h-8 px-4 rounded-xl text-xs text-muted-foreground hover:text-slate-700 hover:bg-muted"
                    onClick={() => { setSearchTerm(''); setFilterFunction('all'); setFilterType('all'); setStatusFilter(null); }}
                  >
                    Limpar filtros
                  </Button>
                </div>
              ) : (
                <div className="rounded-xl border-2 border-dashed border-border bg-surface-muted p-12 text-center">
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                    <BarChart3 className="w-6 h-6 text-muted-foreground" aria-hidden="true" />
                  </div>
                  <p className="font-semibold text-muted-foreground">Nenhuma prestação enviada para revisão</p>
                  <p className="text-sm text-muted-foreground mt-1">As prestações aparecerão aqui após serem preenchidas e enviadas no Orçamento Realizado.</p>
                </div>
              )
            ) : (
              <div className="space-y-2">
                {sortedData.map((row) => {
                  const p = row.planned;
                  const a = row.actual;
                  const isExpanded = expandedCards.has(a.id);
                  const plannedTotal = p?.totalValue || 0;
                  const actualTotal = row.groupActualTotal;
                  const diff = actualTotal - plannedTotal;
                  const hasJustification = !!a.changeReason;
                  const hasDiff = diff !== 0;

                  // Subtotal de diárias derivado do total gravado (total − alimentação −
                  // mobilidade − translado, como no Realizado): qty × média arredondada
                  // não reproduz o subtotal dia a dia e deixava o card sem fechar
                  const dailyPlanned = p ? p.totalValue - p.weekdayLunch - p.weekdayDinner - p.weekendLunch - p.weekendDinner - p.mobility - p.transport : 0;
                  const dailyActual = a.totalValue - a.weekdayLunch - a.weekdayDinner - a.weekendLunch - a.weekendDinner - a.mobility - a.transport;

                  const itemRhStatus = a.rhStatus || 'pendente';
                  const isDecided = itemRhStatus === 'aprovado' || itemRhStatus === 'rejeitado' || itemRhStatus === 'devolvido';
                  const isResubmitted = a.resubmitted;

                  const statusStyles: Record<string, { bg: string; border: string; text: string; icon: LucideIcon; label: string; cardBg: string; cardBorder: string }> = {
                    aprovado: { bg: 'bg-success-soft', border: 'border-success/25', text: 'text-success', icon: CheckCircle, label: 'Aprovado', cardBg: 'bg-success-soft/40', cardBorder: 'border-success/25' },
                    rejeitado: { bg: 'bg-danger-soft', border: 'border-danger/25', text: 'text-danger', icon: XCircle, label: 'Recusado', cardBg: 'bg-danger-soft/40', cardBorder: 'border-danger/25' },
                    devolvido: { bg: 'bg-warning-soft', border: 'border-warning/25', text: 'text-warning', icon: RotateCcw, label: 'Devolvido', cardBg: 'bg-warning-soft/40', cardBorder: 'border-warning/25' },
                  };
                  const decidedStyle = statusStyles[itemRhStatus];

                  const colName = getCollaboratorName(row.collaboratorId);
                  const cardKey = `${row.collaboratorId}-${row.functionId}`;

                  const isNotAttended = !!row.planned?.didNotAttend;

                  // Period from team inclusion
                  const cardTi = inclusaoPorChave.get(chaveComposta(selectedEventId, row.collaboratorId, row.functionId))?.[0];
                  const tiStart = cardTi?.actualStartDate || cardTi?.scheduleStartDate;
                  const tiEnd   = cardTi?.actualEndDate   || cardTi?.scheduleEndDate;
                  const fmtPeriodDate = (d: string) => {
                    const dt = new Date(d + "T12:00:00");
                    return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
                  };
                  const periodLabel = tiStart && tiEnd ? `${fmtPeriodDate(tiStart)} – ${fmtPeriodDate(tiEnd)}` : null;

                  return (
                    <div
                      key={a.id}
                      data-card-id={cardKey}
                      className={`rounded-xl border overflow-hidden transition-all duration-200 ${
                        isNotAttended ? 'bg-surface-muted border-slate-300 border-dashed opacity-75' :
                        highlightCardId === cardKey ? 'ring-2 ring-success-strong shadow-2 ' :
                        isDecided ? `${decidedStyle.cardBg} ${decidedStyle.cardBorder}` :
                        selectedItems.has(a.id) ? 'bg-card border-success-strong ring-1 ring-success/60 shadow-2 ' :
                        'bg-card border-border hover:border-slate-300'
                      }`}
                    >
                      {/* Status stripe on top */}
                      {isDecided && (
                        <div className={`h-[2.5px] ${itemRhStatus === 'aprovado' ? 'bg-success-strong' : itemRhStatus === 'rejeitado' ? 'bg-danger-strong' : 'bg-warning-strong'}`} />
                      )}

                      {/* Card header row — collapsible. O clique no header expande, mas o
                          role="button" acessível fica no chevron: controles interativos
                          (checkbox, lápis) não podem viver dentro de um elemento com role="button" */}
                      <div
                        className="flex flex-wrap items-center justify-between gap-y-2 px-4 py-3 cursor-pointer"
                        onClick={() => toggleExpand(a.id)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {isRhOrAdmin && !isDecided && (
                            <Checkbox
                              checked={selectedItems.has(a.id)}
                              aria-label={`Selecionar ${colName}`}
                              onCheckedChange={(checked) => {
                                const next = new Set(selectedItems);
                                if (checked) next.add(a.id); else next.delete(a.id);
                                setSelectedItems(next);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="shrink-0 border-slate-300 data-[state=checked]:bg-success data-[state=checked]:border-success"
                            />
                          )}

                          {/* Avatar */}
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-2xs font-black flex-shrink-0 ${avatarColor(colName)}`}>
                            {initials(colName)}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-semibold text-foreground truncate">{colName}</span>
                              {row.isSplit && (
                                <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-brand-soft text-2xs font-semibold text-primary shrink-0">
                                  <GitFork className="w-2.5 h-2.5" aria-hidden="true" /> Dividida
                                </span>
                              )}
                              {isDecided && decidedStyle && (
                                <span className={`flex items-center gap-1 text-2xs font-semibold px-3 py-1 rounded-full ${decidedStyle.bg} ${decidedStyle.text} shrink-0`}>
                                  <decidedStyle.icon className="w-2.5 h-2.5" /> {decidedStyle.label}
                                </span>
                              )}
                              {isResubmitted && (
                                <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-brand-soft text-2xs font-semibold text-primary shrink-0">
                                  <RotateCcw className="w-2.5 h-2.5" aria-hidden="true" /> Reenviado
                                </span>
                              )}
                              {isNotAttended && (
                                <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-muted text-2xs font-semibold text-muted-foreground shrink-0">
                                  <UserX className="w-2.5 h-2.5" aria-hidden="true" /> Não participou
                                </span>
                              )}
                              {eventNotes.length > 0 && (
                                <BudgetNotesBadge notes={eventNotes} entityId={a.id} />
                              )}
                              {row.planned && (
                                <PlannedEditedBadge logs={plannedLogs} entityId={row.planned.id} />
                              )}
                            </div>
                            {eventNotes.length > 0 && (
                              <BudgetNotesSnippet notes={eventNotes} entityId={a.id} />
                            )}
                            {/* Not-attended reason snippet */}
                            {isNotAttended && row.planned?.didNotAttendReason && (
                              <p className="text-2xs italic mt-0.5 text-muted-foreground leading-snug max-w-xs truncate">
                                {row.planned.didNotAttendReason}
                              </p>
                            )}
                            {/* RH comment snippet */}
                            {isDecided && a.rhComment && (itemRhStatus === 'rejeitado' || itemRhStatus === 'devolvido') && (
                              <p className={`text-2xs italic mt-0.5 leading-snug max-w-xs truncate ${itemRhStatus === 'rejeitado' ? 'text-danger-strong' : 'text-warning-strong'}`}>
                                "{a.rhComment}"
                              </p>
                            )}
                            <div className="flex items-center gap-1.5 mt-0.5 overflow-hidden">
                              <span className="text-2xs text-muted-foreground truncate shrink min-w-0">{getFunctionName(row.functionId)}</span>
                              <span className="text-muted-foreground shrink-0">·</span>
                              <span className={`text-2xs font-semibold shrink-0 ${row.collaboratorType === 'casa' ? 'text-primary' : 'text-warning-strong'}`}>
                                {row.collaboratorType === 'casa' ? 'Casa' : 'Freela'}
                              </span>
                              {periodLabel && (
                                <>
                                  <span className="text-muted-foreground shrink-0">·</span>
                                  <span className="text-2xs text-muted-foreground shrink-0 tabular-nums">{periodLabel}</span>
                                </>
                              )}
                              {row.isSplit && (
                                <>
                                  <span className="text-muted-foreground shrink-0">·</span>
                                  <span className="text-2xs text-primary font-medium truncate shrink min-w-0">
                                    {[a, ...row.splitChildren].map(c => getCollaboratorName(c.collaboratorId)).join(' + ')}
                                  </span>
                                </>
                              )}
                              {hasDiff && !hasJustification && !row.isSplit && (
                                <>
                                  <span className="text-muted-foreground shrink-0">·</span>
                                  <span className="flex items-center gap-0.5 text-2xs text-warning-strong font-medium shrink-0">
                                    <AlertTriangle className="w-2.5 h-2.5" aria-hidden="true" /> Sem justificativa
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 shrink-0">
                          {/* Mini values strip */}
                          <div className="flex items-center divide-x divide-border border border-border rounded-lg overflow-hidden">
                            {/* Plan. — referência discreta */}
                            <div className="px-2 sm:px-3 py-1.5 text-center w-20 sm:w-28">
                              <span className="text-2xs uppercase font-medium text-muted-foreground tracking-wider block leading-tight">Plan.</span>
                              <span className="text-sm tabular-nums text-muted-foreground font-light">{fmt(plannedTotal)}</span>
                            </div>
                            {/* Real. — protagonista */}
                            <div className="px-2 sm:px-3 py-1.5 text-center w-20 sm:w-28 bg-brand-soft">
                              <span className="text-2xs uppercase font-medium text-muted-foreground tracking-wider block leading-tight">Real.</span>
                              <span className="text-base tabular-nums text-foreground font-bold">{fmt(actualTotal)}</span>
                            </div>
                            {/* Dif. — alerta imediato */}
                            <div className={`px-2 sm:px-3 py-1.5 text-center w-20 sm:w-28 ${hasDiff ? (diff > 0 ? 'bg-danger-soft' : 'bg-success-soft') : ''}`}>
                              <span className="text-2xs uppercase font-medium text-muted-foreground tracking-wider block leading-tight">Dif.</span>
                              {hasDiff ? (
                                <span className={`text-sm tabular-nums font-bold ${diff > 0 ? 'text-danger' : 'text-success'}`}>
                                  {diff > 0 ? '+' : '−'}{fmt(Math.abs(diff))}
                                </span>
                              ) : (
                                <span className="text-sm text-muted-foreground tabular-nums font-normal">—</span>
                              )}
                            </div>
                          </div>
                          {/* Item devolvido está com o responsável — o RH não edita até o reenvio */}
                          {isRhOrAdmin && !['aprovado', 'rejeitado', 'devolvido'].includes(a.rhStatus || '') && (
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    aria-label={`Editar realizado de ${colName} (RH)`}
                                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-warning-soft transition-colors"
                                    onClick={(e) => { e.stopPropagation(); openEditModal(a); }}
                                  >
                                    <Pencil className="w-3.5 h-3.5 text-warning-strong" aria-hidden="true" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="text-xs">Editar realizado (RH)</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          <button
                            type="button"
                            aria-expanded={isExpanded}
                            aria-label={`${isExpanded ? 'Recolher' : 'Expandir'} detalhes de ${colName}`}
                            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
                            onClick={(e) => { e.stopPropagation(); toggleExpand(a.id); }}
                          >
                            <ChevronDown className={`w-4 h-4 text-muted-foreground hover:text-slate-700 transition-all duration-200 ${isExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                          </button>
                        </div>
                      </div>

                      {/* Expanded body */}
                      {isExpanded && (
                        <div className="border-t border-border bg-surface-muted">
                          <div className="p-6 space-y-4">

                            {/* ── Not attended notice ── */}
                            {isNotAttended && (
                              <div className="flex items-start gap-2.5 bg-muted rounded-xl px-4 py-3 border border-border">
                                <UserX className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" aria-hidden="true" />
                                <div>
                                  <p className="text-sm font-semibold text-slate-600">Colaborador não participou do evento</p>
                                  <p className="text-2xs text-muted-foreground mt-0.5">Planejado, Realizado e Diferença deste colaborador são excluídos dos totais. Os valores abaixo permanecem apenas para referência.</p>
                                  {row.planned?.didNotAttendReason && <p className="text-2xs text-muted-foreground mt-1 italic">Motivo: {row.planned.didNotAttendReason}</p>}
                                </div>
                              </div>
                            )}

                            {/* ── Split group sub-rows ── */}
                            {row.isSplit && (
                              <div className="rounded-xl border border-primary/25 overflow-hidden">
                                <div className="h-[3px] bg-primary" />
                                <div className="flex items-center gap-1.5 px-3 py-2 bg-brand-soft/80 border-b border-primary/25">
                                  <div className="w-4 h-4 rounded bg-primary flex items-center justify-center">
                                    <GitFork className="w-2.5 h-2.5 text-white" aria-hidden="true" />
                                  </div>
                                  <span className="text-2xs font-black uppercase tracking-wide text-primary">
                                    Detalhamento por Colaborador
                                  </span>
                                </div>
                                {/* Tabela larga: rola horizontalmente em telas estreitas */}
                                <div className="overflow-x-auto">
                                <div className="min-w-[560px]">
                                <div className="grid grid-cols-6 gap-2 px-3 py-1.5 bg-surface-muted border-b border-border">
                                  <span className="text-2xs uppercase text-muted-foreground font-semibold tracking-wider col-span-2">Colaborador</span>
                                  <span className="text-2xs uppercase text-primary font-bold tracking-wider text-right">Plan. prop.</span>
                                  <span className="text-2xs uppercase text-primary font-bold tracking-wider text-right">Realizado</span>
                                  <span className="text-2xs uppercase text-muted-foreground font-semibold tracking-wider text-right">Diferença</span>
                                  <span className="text-2xs uppercase text-muted-foreground font-semibold tracking-wider text-center"></span>
                                </div>
                                {[a, ...row.splitChildren].map((colItem, ci) => {
                                  const isParent = ci === 0;
                                  const colItemName = getCollaboratorName(colItem.collaboratorId);
                                  const allGroupDays = [...(a.workedDays as string[] || []), ...row.splitChildren.flatMap(c => (c.workedDays as string[] || []))].sort();
                                  const colProp = p ? proportionalPlanned(p, colItem, allGroupDays) : null;
                                  const colPlanned = colProp?.totalValue || 0;
                                  const colActual = colItem.totalValue;
                                  const colDiff = colActual - colPlanned;
                                  const colDays = getWorkedDayCount(colItem);
                                  return (
                                    <div key={ci} className={`grid grid-cols-6 gap-2 px-3 py-2.5 items-center text-2xs border-b border-border ${ci % 2 === 1 ? 'bg-surface-muted/50' : 'bg-card'}`}>
                                      <div className="col-span-2 flex items-center gap-2 min-w-0">
                                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-2xs font-black flex-shrink-0 ${avatarColor(colItemName)}`}>
                                          {initials(colItemName)}
                                        </div>
                                        <div className="min-w-0">
                                          <p className="font-semibold text-slate-700 truncate text-2xs">{colItemName}</p>
                                          <div className="flex items-center gap-1">
                                            <span className={`text-2xs font-bold px-1 py-0 rounded-full ${isParent ? 'bg-brand-soft text-primary' : 'bg-brand-soft text-primary'}`}>
                                              {isParent ? 'Titular' : 'Divisão'}
                                            </span>
                                            {colDays > 0 && (
                                              <span className="text-2xs text-muted-foreground">{colDays}d</span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                      <span className="text-right tabular-nums text-primary font-medium">{fmt(colPlanned)}</span>
                                      <span className="text-right tabular-nums text-primary font-semibold">{fmt(colActual)}</span>
                                      <div className="text-right">
                                        {colDiff === 0 ? (
                                          <span className="text-muted-foreground tabular-nums">—</span>
                                        ) : (
                                          <span className={`tabular-nums font-bold text-2xs ${colDiff > 0 ? 'text-danger' : 'text-success'}`}>
                                            {colDiff > 0 ? '+' : '−'}{fmt(Math.abs(colDiff))}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex justify-center">
                                        <button
                                          type="button"
                                          onClick={e => {
                                            e.stopPropagation();
                                            setSplitDetail({ actual: colItem, planned: p, propPlanned: colProp, isParent, allGroupDays });
                                          }}
                                          className="w-6 h-6 rounded-md flex items-center justify-center bg-muted hover:bg-brand-soft text-muted-foreground hover:text-primary-hover transition-colors"
                                          title="Ver detalhes completos"
                                          aria-label={`Ver detalhes completos de ${colItemName}`}
                                        >
                                          <ClipboardList className="w-3.5 h-3.5" aria-hidden="true" />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                                <div className={`grid grid-cols-6 gap-2 px-3 py-2 text-2xs items-center border-t-2 border-border font-bold ${diff > 0 ? 'bg-danger-soft/40' : diff < 0 ? 'bg-success-soft/40' : 'bg-surface-muted'}`}>
                                  <span className="text-muted-foreground uppercase text-2xs tracking-wider col-span-2">Total do Grupo</span>
                                  <span className="text-right tabular-nums text-primary">{fmt(plannedTotal)}</span>
                                  <span className="text-right tabular-nums text-primary">{fmt(actualTotal)}</span>
                                  <div className="text-right col-span-2">
                                    {diff === 0 ? (
                                      <span className="text-muted-foreground tabular-nums">—</span>
                                    ) : (
                                      <span className={`tabular-nums text-2xs ${diff > 0 ? 'text-danger' : 'text-success'}`}>
                                        {diff > 0 ? '+' : '−'}{fmt(Math.abs(diff))}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                </div>
                                </div>
                              </div>
                            )}

                            {/* ── Detail blocks (only for non-split) ── */}
                            {!row.isSplit && <>
                            {/* Shared column headers — shown once above all sections */}
                            <div className="grid grid-cols-4 gap-2 px-3 border border-border rounded-lg bg-surface-muted/80" style={{ height: 28 }}>
                              <span className="text-2xs uppercase text-muted-foreground font-semibold tracking-wider flex items-center">Item</span>
                              <span className="text-2xs uppercase text-primary font-semibold tracking-wider flex items-center justify-end">Planejado</span>
                              <span className="text-2xs uppercase text-primary font-semibold tracking-wider flex items-center justify-end">Realizado</span>
                              <span className="text-2xs uppercase text-muted-foreground font-semibold tracking-wider flex items-center justify-end">Diferença</span>
                            </div>
                            <CategoryBlock
                              title="Diárias"
                              icon={Calendar}
                              iconColor="text-primary"
                              bgColor="bg-brand-soft/60"
                              stripColor="bg-primary"
                              rows={[
                                { label: "Qtd. Diárias", planned: p?.dailyQuantity || 0, actual: a.dailyQuantity, isQuantity: true },
                                { label: "Valor Unitário", planned: p?.dailyValue || 0, actual: a.dailyValue },
                                { label: "Subtotal Diárias", planned: dailyPlanned, actual: dailyActual },
                              ]}
                            />

                            <CategoryBlock
                              title="Alimentação"
                              icon={Utensils}
                              iconColor="text-warning"
                              bgColor="bg-warning-soft/60"
                              stripColor="bg-warning-strong"
                              rows={[
                                { label: "Almoço (Sem.)", planned: p?.weekdayLunch || 0, actual: a.weekdayLunch },
                                { label: "Jantar (Sem.)", planned: p?.weekdayDinner || 0, actual: a.weekdayDinner },
                                { label: "Almoço (FdS)", planned: p?.weekendLunch || 0, actual: a.weekendLunch },
                                { label: "Jantar (FdS)", planned: p?.weekendDinner || 0, actual: a.weekendDinner },
                              ]}
                            />

                            <CategoryBlock
                              title="Mobilidade"
                              icon={Car}
                              iconColor="text-primary"
                              bgColor="bg-brand-soft/60"
                              stripColor="bg-primary"
                              rows={[
                                { label: "Mobilidade", planned: p?.mobility || 0, actual: a.mobility },
                                // Translado precisa aparecer aqui: o total do card o inclui,
                                // e sem esta linha os subtotais não fechavam com o total
                                { label: "Translado", planned: p?.transport || 0, actual: a.transport },
                              ]}
                            />
                            </>}

                            {/* Expanded card footer — compact single row */}
                            <div className={`flex items-center gap-0 rounded-xl border-2 overflow-hidden ${
                              diff > 0 ? 'border-danger/25' : diff < 0 ? 'border-success/25' : 'border-border'
                            }`} style={{ height: 44 }}>
                              <div className="flex-1 flex items-center justify-center gap-2 bg-card border-r border-border h-full">
                                <span className="text-2xs uppercase text-muted-foreground font-semibold tracking-widest">Planejado</span>
                                <span className="text-sm font-semibold text-muted-foreground tabular-nums">{fmt(plannedTotal)}</span>
                              </div>
                              <div className="flex-1 flex items-center justify-center gap-2 h-full bg-brand-soft">
                                <span className="text-2xs uppercase text-primary font-bold tracking-widest">Realizado</span>
                                <span className="text-base font-extrabold text-primary tabular-nums">{fmt(actualTotal)}</span>
                              </div>
                              <div className={`flex-1 flex items-center justify-center gap-2 h-full ${
                                diff > 0 ? 'bg-danger-soft' : diff < 0 ? 'bg-success-soft' : 'bg-surface-muted'
                              }`}>
                                <span className="text-2xs uppercase text-muted-foreground font-semibold tracking-widest">Diferença</span>
                                {diff === 0 ? (
                                  <span className="text-sm text-muted-foreground tabular-nums">—</span>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-sm font-bold tabular-nums ${diff > 0 ? 'text-danger' : 'text-success'}`}>
                                      {diff > 0 ? '+' : '−'}{fmt(Math.abs(diff))}
                                    </span>
                                    {plannedTotal > 0 && (
                                      <span className={`text-2xs font-bold px-1.5 py-0.5 rounded ${
                                        diff > 0 ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'
                                      }`}>
                                        {Math.abs(diff / plannedTotal * 100).toFixed(1)}%
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Justification */}
                            {a.changeReason && (
                              <div className="p-3 rounded-xl bg-card border border-border flex items-start gap-2">
                                <MessageSquare className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" aria-hidden="true" />
                                <div>
                                  <span className="text-2xs uppercase text-muted-foreground font-bold tracking-wider">Justificativa do Responsável</span>
                                  <p className="text-xs text-slate-600 mt-0.5">{a.changeReason}</p>
                                </div>
                              </div>
                            )}

                            {/* RH comment per item */}
                            {a.rhComment && (
                              <div className={`p-3 rounded-xl border flex items-start gap-2 ${
                                itemRhStatus === 'aprovado' ? 'bg-success-soft/60 border-success/25' :
                                itemRhStatus === 'rejeitado' ? 'bg-danger-soft/60 border-danger/25' :
                                'bg-warning-soft/60 border-warning/25'
                              }`}>
                                <MessageSquare className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${itemRhStatus === 'aprovado' ? 'text-success-strong' : itemRhStatus === 'rejeitado' ? 'text-danger-strong' : 'text-warning-strong'}`} aria-hidden="true" />
                                <div>
                                  <span className={`text-2xs uppercase font-bold tracking-wider ${itemRhStatus === 'aprovado' ? 'text-success-strong' : itemRhStatus === 'rejeitado' ? 'text-danger-strong' : 'text-warning-strong'}`}>
                                    Comentário do RH
                                  </span>
                                  <p className={`text-xs mt-0.5 ${itemRhStatus === 'aprovado' ? 'text-success' : itemRhStatus === 'rejeitado' ? 'text-danger' : 'text-warning'}`}>
                                    {a.rhComment}
                                  </p>
                                </div>
                              </div>
                            )}

                            {rhComment && !a.rhComment && (
                              <div className="p-3 rounded-xl bg-warning-soft/60 border border-warning/25 flex items-start gap-2">
                                <MessageSquare className="w-3.5 h-3.5 text-warning-strong mt-0.5 flex-shrink-0" aria-hidden="true" />
                                <div>
                                  <span className="text-2xs uppercase text-warning-strong font-bold tracking-wider">Comentário do RH (geral)</span>
                                  <p className="text-xs text-warning mt-0.5">{rhComment}</p>
                                </div>
                              </div>
                            )}

                            {/* ── Observação do ajuste do RH ── */}
                            {a.rhAdjustNote && (
                              <div className="p-3 rounded-xl bg-warning-soft/80 border border-warning/25 flex items-start gap-2">
                                <MessageSquare className="w-3.5 h-3.5 text-warning-strong mt-0.5 flex-shrink-0" aria-hidden="true" />
                                <div>
                                  <span className="text-2xs uppercase text-warning font-bold tracking-wider">Observação do Ajuste (RH)</span>
                                  <p className="text-xs text-warning mt-0.5">{a.rhAdjustNote}</p>
                                </div>
                              </div>
                            )}

                            {/* ── Aviso: planejamento alterado pelo RH ── */}
                            {row.planned && (() => {
                              const planId = row.planned?.id;
                              if (!planId) return null;
                              const hasEdits = plannedLogs.some(l => l.entity_id === planId && l.action === 'update');
                              if (!hasEdits) return null;
                              const last = plannedLogs
                                .filter(l => l.entity_id === planId && l.action === 'update')
                                .sort((x, y) => new Date(y.created_at || 0).getTime() - new Date(x.created_at || 0).getTime())[0];
                              return (
                                <div className="flex items-start gap-2 p-3 rounded-xl border border-warning/25 bg-warning-soft">
                                  <span aria-hidden="true" className="text-warning-strong text-base leading-none shrink-0">⚠️</span>
                                  <div>
                                    <p className="text-2xs font-semibold text-warning">Orçamento Planejado foi alterado pelo RH</p>
                                    {last && <p className="text-2xs text-warning mt-0.5">Última edição por {last.user_name || '?'} — os valores de referência podem ter mudado após o envio.</p>}
                                  </div>
                                </div>
                              );
                            })()}

                            {/* ── Chat de Auditoria ── */}
                            <BudgetChat
                              entityType="actual"
                              entityId={a.id}
                              eventId={a.eventId}
                              linkedEntityType={a.plannedId ? "planned" : undefined}
                              linkedEntityId={a.plannedId || undefined}
                            />

                            {/* ── Histórico de alterações ── */}
                            <ActivityTimeline entityType="budget_actual" entityId={a.id} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Fixed RH Decision footer — apenas RH/admin decide ── */}
      {isRhOrAdmin && comparison && comparisonData.length > 0 && sortedData.some(r => (r.actual.rhStatus || 'pendente') === 'pendente') && (
        <div className="fixed bottom-0 right-0 z-40 px-6 pb-4 pt-3 bg-card/95 backdrop-blur-sm border-t border-border shadow-2 transition-all duration-300" style={{ left: sidebarWidth }}>
          <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-black text-foreground">Decisão do RH</h3>
              <p className={`text-xs mt-0.5 transition-colors ${selectedItems.size > 0 ? 'text-success font-medium' : 'text-muted-foreground'}`}>
                {selectedItems.size > 0
                  ? <>
                      {selectedItems.size} selecionado{selectedItems.size !== 1 ? 's' : ''} para ação
                      <span className="text-muted-foreground font-normal tabular-nums">
                        {' '}· Plan. {fmt(selectedTotals.planned)} · Real. {fmt(selectedTotals.actual)} · Dif.{' '}
                        <span className={selectedTotals.diff > 0 ? 'text-danger-strong font-semibold' : selectedTotals.diff < 0 ? 'text-success font-semibold' : ''}>
                          {selectedTotals.diff > 0 ? '+' : selectedTotals.diff < 0 ? '−' : ''}{fmt(Math.abs(selectedTotals.diff))}
                        </span>
                      </span>
                    </>
                  : <>Selecione os itens pendentes acima para tomar uma decisão</>
                }
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Secondary actions */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      className="h-9 text-sm px-4 rounded-xl font-semibold bg-danger-soft hover:bg-danger-soft text-danger border-none shadow-none disabled:opacity-40"
                      onClick={() => setActionModal({ type: 'reject' })}
                      disabled={selectedItems.size === 0}
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Recusar{selectedItems.size > 0 ? ` (${selectedItems.size})` : ''}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs max-w-[180px] text-center">
                    Rejeita a prestação — o responsável poderá corrigir e reenviar
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      className="h-9 text-sm px-4 rounded-xl font-semibold bg-warning-soft hover:bg-warning/20 text-warning border border-warning/25 shadow-none disabled:opacity-40"
                      onClick={() => setActionModal({ type: 'return' })}
                      disabled={selectedItems.size === 0}
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Devolver{selectedItems.size > 0 ? ` (${selectedItems.size})` : ''}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs max-w-[180px] text-center">
                    Solicita correção — responsável pode editar e reenviar
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {/* Divider */}
              <div className="w-px h-6 bg-border mx-1" />
              {/* Primary approve action */}
              {(() => {
                const selectedRhAdjustedFields = sortedData
                  .filter(row => selectedItems.has(row.actual.id))
                  .reduce((total, row) => {
                    const allActuals = [row.actual, ...(row.isSplit ? row.splitChildren : [])];
                    return total + allActuals.reduce((n, a) => n + parseAdjustedFields(a.rhAdjustedFields).length, 0);
                  }, 0);
                const hasAdjusted = selectedRhAdjustedFields > 0;
                return (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          className="h-9 text-sm px-5 rounded-xl text-white font-bold bg-success hover:bg-success/90 shadow-2 disabled:opacity-40"
                          onClick={() => {
                            if (hasAdjusted) {
                              setConfirmAdjustOpen(true);
                            } else {
                              setActionModal({ type: 'approve' });
                            }
                          }}
                          disabled={selectedItems.size === 0}
                        >
                          <CheckCircle className="w-4 h-4 mr-1.5" aria-hidden="true" />
                          {hasAdjusted
                            ? `Aprovar com ajustes (${selectedRhAdjustedFields} campo${selectedRhAdjustedFields !== 1 ? 's' : ''})`
                            : selectedItems.size > 0 ? `Aprovar e Finalizar (${selectedItems.size})` : 'Aprovar e Finalizar'}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs max-w-[180px] text-center">
                        Aprova a prestação — análise formal do RH
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal edição do realizado pelo RH ── */}
      <Dialog open={!!editingActual} onOpenChange={(open) => { if (!open) setEditingActual(null); }}>
        <DialogContent style={{ maxHeight:'90vh', maxWidth:'480px' }} className="rounded-xl p-0 gap-0 flex flex-col">
          <DialogTitle className="sr-only">Editar Realizado — ajuste do RH</DialogTitle>
          {editingActual && (
            <>
              <div className="px-6 pt-5 pb-4 border-b border-border shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-warning-soft flex items-center justify-center shrink-0">
                    <Pencil className="w-3.5 h-3.5 text-warning" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-foreground">Editar Realizado</h3>
                    <p className="text-2xs text-warning font-medium">Ajuste do RH — ficará registrado no histórico</p>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-4">
                {/* Diárias */}
                <div className="rounded-xl border border-primary/25 bg-brand-soft/40 p-4 space-y-3">
                  <span className="text-2xs font-bold uppercase tracking-widest text-primary">Diárias</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-2xs text-muted-foreground font-medium block mb-1">Quantidade</label>
                      <Input
                        type="number" min={0}
                        value={editForm.dailyQuantity}
                        onChange={e => setEditForm(f => ({...f, dailyQuantity: e.target.value}))}
                        className="h-8 text-sm text-right tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="text-2xs text-muted-foreground font-medium block mb-1">Valor/dia (R$)</label>
                      <Input
                        type="text" inputMode="decimal"
                        value={editForm.dailyValue}
                        onChange={e => setEditForm(f => ({...f, dailyValue: e.target.value}))}
                        onFocus={e => e.target.select()}
                        className="h-8 text-sm text-right tabular-nums"
                      />
                    </div>
                  </div>
                </div>
                {/* Alimentação */}
                <div className="rounded-xl border border-warning/25 bg-warning-soft/40 p-4 space-y-3">
                  <span className="text-2xs font-bold uppercase tracking-widest text-warning">Alimentação</span>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: 'weekdayLunch', label: 'Almoço (Sem.)' },
                      { key: 'weekdayDinner', label: 'Jantar (Sem.)' },
                      { key: 'weekendLunch', label: 'Almoço (FdS)' },
                      { key: 'weekendDinner', label: 'Jantar (FdS)' },
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <label className="text-2xs text-muted-foreground font-medium block mb-1">{label}</label>
                        <Input
                          type="text" inputMode="decimal"
                          value={editForm[key]}
                          onChange={e => setEditForm(f => ({...f, [key]: e.target.value}))}
                          onFocus={e => e.target.select()}
                          className="h-8 text-sm text-right tabular-nums"
                        />
                      </div>
                    ))}
                  </div>
                </div>
                {/* Mobilidade */}
                <div className="rounded-xl border border-primary/25 bg-brand-soft/40 p-4 space-y-3">
                  <span className="text-2xs font-bold uppercase tracking-widest text-primary">Mobilidade</span>
                  <div>
                    <label className="text-2xs text-muted-foreground font-medium block mb-1">Total (R$)</label>
                    <Input
                      type="text" inputMode="decimal"
                      value={editForm.mobility}
                      onChange={e => setEditForm(f => ({...f, mobility: e.target.value}))}
                      onFocus={e => e.target.select()}
                      className="h-8 text-sm text-right tabular-nums"
                    />
                  </div>
                </div>
                {/* Observação do ajuste */}
                <div className="rounded-xl border border-border bg-surface-muted/60 p-4 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-2xs font-bold uppercase tracking-widest text-muted-foreground">Observação do Ajuste</span>
                    <span className="text-2xs text-muted-foreground">(opcional)</span>
                  </div>
                  <textarea
                    rows={3}
                    placeholder="Descreva o motivo do ajuste nos valores…"
                    value={editForm.rhAdjustNote || ''}
                    onChange={e => setEditForm(f => ({...f, rhAdjustNote: e.target.value}))}
                    className="w-full text-sm text-slate-700 border border-border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-warning/50 focus:border-warning-strong bg-card placeholder:text-muted-foreground"
                  />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-border flex gap-3 shrink-0">
                <Button variant="outline" className="flex-1 rounded-xl h-9 text-sm" onClick={() => setEditingActual(null)}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1 rounded-xl h-9 text-sm font-bold bg-warning-strong hover:bg-warning/90 text-white"
                  onClick={saveEditModal}
                  disabled={patchActualMutation.isPending}
                >
                  {patchActualMutation.isPending ? 'Salvando…' : 'Salvar ajuste'}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Modal confirmação de aprovação com ajustes ── */}
      <Dialog open={confirmAdjustOpen} onOpenChange={setConfirmAdjustOpen}>
        <DialogContent className="max-w-sm rounded-xl p-6 gap-4">
          <DialogTitle className="sr-only">Aprovação com ajustes</DialogTitle>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-warning-soft flex items-center justify-center shrink-0">
                <span className="text-lg">⚠</span>
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Aprovação com ajustes</h3>
                <p className="text-2xs text-muted-foreground mt-0.5">Revise antes de confirmar</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Você está aprovando itens com valores ajustados pelo RH em relação ao realizado do colaborador.
            </p>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1 rounded-xl h-9 text-sm"
                onClick={() => setConfirmAdjustOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 rounded-xl h-9 text-sm font-bold bg-success hover:bg-success/90 text-white"
                onClick={() => {
                  setConfirmAdjustOpen(false);
                  setActionModal({ type: 'approve' });
                }}
              >
                <CheckCircle className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                Confirmar aprovação
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!splitDetail} onOpenChange={() => setSplitDetail(null)}>
        <DialogContent className="max-w-xl rounded-xl p-0 overflow-hidden gap-0">
          <DialogTitle className="sr-only">Detalhes da prestação do colaborador na vaga dividida</DialogTitle>
          {splitDetail && (() => {
            const sd = splitDetail;
            const sdName = getCollaboratorName(sd.actual.collaboratorId);
            const sdFn = getFunctionName(sd.actual.functionId);
            const myDays = (sd.actual.workedDays as string[] | null) || [];
            const allDays = sd.allGroupDays;
            const totalGroupDays = allDays.length;
            const myDayCount = myDays.length;
            const pp = sd.propPlanned;
            const fa = sd.actual;

            const mealPlan = pp ? (pp.weekdayLunch + pp.weekdayDinner + pp.weekendLunch + pp.weekendDinner) : 0;
            const mealAct = fa.weekdayLunch + fa.weekdayDinner + fa.weekendLunch + fa.weekendDinner;
            // Derivado do total (não qty×média) para os subtotais fecharem com o TOTAL
            const dailyPlan = pp ? pp.totalValue - mealPlan - pp.mobility - pp.transport : 0;
            const dailyAct = fa.totalValue - mealAct - fa.mobility - fa.transport;
            const mobPlan = pp ? (pp.mobility + pp.transport) : 0;
            const mobAct = fa.mobility + fa.transport;
            const totalPlan = pp?.totalValue || 0;
            const totalAct = fa.totalValue;
            const totalDiff = totalAct - totalPlan;

            let subRowIdx = 0;

            return (
              <>
                {/* ── Modal header — dark purple gradient ── */}
                <div className="bg-primary px-6 py-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3.5">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-sm font-black shadow-2 ring-2 ring-white/20 ${avatarColor(sdName)}`}>
                        {initials(sdName)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="text-base font-black text-white">{sdName}</span>
                          <span className={`text-2xs font-bold px-2 py-0.5 rounded-full ${sd.isParent
                            ? 'bg-primary/30 text-primary-foreground/80 ring-1 ring-primary/40'
                            : 'bg-primary/30 text-primary-foreground/80 ring-1 ring-primary/40'}`}>
                            {sd.isParent ? 'Titular' : 'Divisão'}
                          </span>
                        </div>
                        <p className="text-2xs text-primary-foreground/80">{sdFn}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label="Fechar detalhes"
                      onClick={() => setSplitDetail(null)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center bg-card/10 hover:bg-card/20 text-white/70 hover:text-white transition-colors"
                    >
                      <X className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>

                  {/* Period info — two blocks side by side */}
                  {allDays.length > 0 && (() => {
                    const origWkdays = allDays.filter(d => !isWknd(d)).length;
                    const origWknds  = allDays.filter(d =>  isWknd(d)).length;
                    const myWkdays   = myDays.filter(d => !isWknd(d)).length;
                    const myWknds    = myDays.filter(d =>  isWknd(d)).length;
                    const wkdayStr = (n: number) => n > 0 ? `${n} útil${n !== 1 ? 'is' : ''}` : '';
                    const wkndStr  = (n: number) => n > 0 ? `${n} f${n !== 1 ? 'ds' : 'ds'}` : '';
                    const joinParts = (...parts: string[]) => parts.filter(Boolean).join(' + ');
                    return (
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <div className="bg-card/10 rounded-xl px-3 py-2.5 flex items-start gap-2">
                          <Calendar className="w-3.5 h-3.5 text-primary-foreground/80 mt-0.5 flex-shrink-0" aria-hidden="true" />
                          <div>
                            <p className="text-2xs uppercase font-bold tracking-wider text-primary-foreground/80 mb-0.5">Vaga original</p>
                            <p className="text-2xs text-white font-medium leading-snug">
                              {fmtDateShort(allDays[0])} a {fmtDateShort(allDays[allDays.length - 1])}
                            </p>
                            <p className="text-2xs text-primary-foreground/80">
                              {totalGroupDays} dia{totalGroupDays !== 1 ? 's' : ''}
                              {' · '}{joinParts(wkdayStr(origWkdays), wkndStr(origWknds))}
                            </p>
                          </div>
                        </div>
                        {myDays.length > 0 && (
                          <div className="bg-card/10 rounded-xl px-3 py-2.5 flex items-start gap-2">
                            <GitFork className="w-3.5 h-3.5 text-primary-foreground/80 mt-0.5 flex-shrink-0" aria-hidden="true" />
                            <div>
                              <p className="text-2xs uppercase font-bold tracking-wider text-primary-foreground/80 mb-0.5">Dias atribuídos</p>
                              <p className="text-2xs text-white font-medium leading-snug">
                                {myDays.length === 1
                                  ? fmtDate(myDays[0])
                                  : `${fmtDateShort(myDays[0])} a ${fmtDateShort(myDays[myDays.length - 1])}`}
                              </p>
                              <p className="text-2xs text-primary-foreground/80">
                                {myDayCount} dia{myDayCount !== 1 ? 's' : ''}
                                {' · '}{joinParts(wkdayStr(myWkdays), wkndStr(myWknds))}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* ── Table body ── */}
                <div className="px-5 py-4 space-y-3 bg-card max-h-[50vh] overflow-y-auto">
                  <div className="grid grid-cols-4 gap-4 px-4 pb-2 border-b-2 border-border">
                    <span className="text-2xs uppercase text-muted-foreground font-bold tracking-wider">Item</span>
                    <span className="text-2xs uppercase text-primary font-bold tracking-wider text-right">Planejado</span>
                    <span className="text-2xs uppercase text-primary font-bold tracking-wider text-right">Realizado</span>
                    <span className="text-2xs uppercase text-muted-foreground font-bold tracking-wider text-right">Diferença</span>
                  </div>

                  {/* Diárias */}
                  <SectionBlock
                    title="Diárias"
                    icon={Calendar}
                    headerBg="bg-brand-soft/80"
                    iconColor="text-primary"
                    titleColor="text-primary"
                    subtotalPlan={dailyPlan}
                    subtotalAct={dailyAct}
                  >
                    {(pp || fa.dailyQuantity > 0) && (
                      <SubRow
                        rowIndex={subRowIdx++}
                        label={`${pp?.dailyQuantity || 0} diária(s) × ${fmt(pp?.dailyValue || 0)}/dia → ${fa.dailyQuantity} × ${fmt(fa.dailyValue)}`}
                        planned={dailyPlan}
                        actual={dailyAct}
                      />
                    )}
                  </SectionBlock>

                  {/* Alimentação */}
                  <SectionBlock
                    title="Alimentação"
                    icon={Utensils}
                    headerBg="bg-warning-soft/80"
                    iconColor="text-warning"
                    titleColor="text-warning"
                    subtotalPlan={mealPlan}
                    subtotalAct={mealAct}
                  >
                    {(pp?.weekdayLunch || fa.weekdayLunch) ? <SubRow rowIndex={subRowIdx++} label="Almoço (dias úteis)" planned={pp?.weekdayLunch || 0} actual={fa.weekdayLunch} /> : null}
                    {(pp?.weekdayDinner || fa.weekdayDinner) ? <SubRow rowIndex={subRowIdx++} label="Jantar (dias úteis)" planned={pp?.weekdayDinner || 0} actual={fa.weekdayDinner} /> : null}
                    {(pp?.weekendLunch || fa.weekendLunch) ? <SubRow rowIndex={subRowIdx++} label="Almoço (fins de sem.)" planned={pp?.weekendLunch || 0} actual={fa.weekendLunch} /> : null}
                    {(pp?.weekendDinner || fa.weekendDinner) ? <SubRow rowIndex={subRowIdx++} label="Jantar (fins de sem.)" planned={pp?.weekendDinner || 0} actual={fa.weekendDinner} /> : null}
                  </SectionBlock>

                  {/* Mobilidade */}
                  <SectionBlock
                    title="Mobilidade"
                    icon={Car}
                    headerBg="bg-brand-soft/80"
                    iconColor="text-primary"
                    titleColor="text-primary"
                    subtotalPlan={mobPlan}
                    subtotalAct={mobAct}
                  >
                    {(pp?.mobility || fa.mobility) ? (() => {
                      const pIda   = pp?.mobilityIda   ?? Math.ceil((pp?.mobility  || 0) / 2);
                      const pVolta = pp?.mobilityVolta ?? Math.floor((pp?.mobility || 0) / 2);
                      const aIda   = fa.mobilityIda    ?? Math.ceil(fa.mobility  / 2);
                      const aVolta = fa.mobilityVolta  ?? Math.floor(fa.mobility / 2);
                      return (
                        <>
                          <SubRow rowIndex={subRowIdx++} label="Ida" planned={pIda} actual={aIda} />
                          <SubRow rowIndex={subRowIdx++} label="Volta" planned={pVolta} actual={aVolta} />
                        </>
                      );
                    })() : null}
                    {(pp?.transport || fa.transport) ? <SubRow rowIndex={subRowIdx++} label="Translado" planned={pp?.transport || 0} actual={fa.transport} /> : null}
                  </SectionBlock>

                  {/* Total row */}
                  <div className={`grid grid-cols-4 gap-4 px-4 py-3.5 rounded-xl border-2 font-semibold ${
                    totalDiff > 0 ? 'bg-danger-soft border-danger/25'
                    : totalDiff < 0 ? 'bg-success-soft border-success/25'
                    : 'bg-surface-muted border-border'
                  }`}>
                    <span className="text-xs font-black uppercase tracking-wide text-slate-700">TOTAL</span>
                    <span className="text-right tabular-nums text-primary text-sm font-black">{fmt(totalPlan)}</span>
                    <span className="text-right tabular-nums text-primary text-sm font-black">{fmt(totalAct)}</span>
                    <div className="text-right">
                      {totalDiff === 0
                        ? <span className="text-muted-foreground tabular-nums text-sm font-black">—</span>
                        : <span className={`tabular-nums text-sm font-black ${totalDiff > 0 ? 'text-danger' : 'text-success'}`}>
                            {totalDiff > 0 ? '+' : '−'}{fmt(Math.abs(totalDiff))}
                          </span>
                      }
                    </div>
                  </div>
                </div>

                {/* ── Footer ── */}
                <div className="px-5 pb-5 pt-3 bg-card space-y-3 border-t border-border">
                  {((!sd.isParent && totalGroupDays > 0) || (sd.isParent && totalGroupDays > 0 && myDayCount < totalGroupDays)) && (
                    <div className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border ${sd.isParent
                      ? 'bg-brand-soft border-primary/25' : 'bg-brand-soft border-primary/25'}`}>
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${sd.isParent ? 'bg-brand-soft' : 'bg-brand-soft'}`}>
                        <GitFork className={`w-3 h-3 ${sd.isParent ? 'text-primary' : 'text-primary'}`} aria-hidden="true" />
                      </div>
                      <span className={`text-2xs font-medium ${sd.isParent ? 'text-primary' : 'text-primary'}`}>
                        {sd.isParent ? 'Titular cobriu' : 'Este colaborador cobriu'} <strong>{myDayCount}</strong> de <strong>{totalGroupDays}</strong> dias da vaga original
                        {totalGroupDays > 0 && <span className={`ml-1.5 font-bold text-2xs px-1.5 py-0.5 rounded-full ${sd.isParent ? 'bg-brand-soft text-primary' : 'bg-brand-soft text-primary'}`}>
                          {Math.round(myDayCount / totalGroupDays * 100)}%
                        </span>}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-end">
                    <Button
                      onClick={() => setSplitDetail(null)}
                      className="h-9 px-6 text-sm rounded-xl text-white bg-primary-hover"
                    >
                      Fechar
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Action confirmation modal ── */}
      <Dialog open={!!actionModal} onOpenChange={() => { setActionModal(null); setActionNote(""); setActionNoteError(false); }}>
        <DialogContent className="max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              {actionModal?.type === 'approve' && (
                <><div className="w-8 h-8 rounded-xl bg-success-soft flex items-center justify-center shrink-0"><CheckCircle className="w-4 h-4 text-success" aria-hidden="true" /></div> Aprovar prestação</>
              )}
              {actionModal?.type === 'reject' && (
                <><div className="w-8 h-8 rounded-xl bg-danger-soft flex items-center justify-center shrink-0"><XCircle className="w-4 h-4 text-danger" aria-hidden="true" /></div> <span className="text-danger">Recusar prestação</span></>
              )}
              {actionModal?.type === 'return' && (
                <><div className="w-8 h-8 rounded-xl bg-warning-soft flex items-center justify-center shrink-0"><RotateCcw className="w-4 h-4 text-warning" aria-hidden="true" /></div> <span className="text-warning">Devolver para correção</span></>
              )}
            </DialogTitle>
            <p className="text-2xs text-muted-foreground mt-1 pl-1 leading-relaxed">
              {sortedData.filter(row => selectedItems.has(row.actual.id)).map(row => getCollaboratorName(row.collaboratorId).split(' ')[0]).join(', ')}
            </p>
          </DialogHeader>
          <div className="space-y-4">
            {/* Collaborator chips */}
            <div className={`rounded-xl p-3 border ${actionModal?.type === 'reject' ? 'bg-danger-soft/60 border-danger/25' : actionModal?.type === 'return' ? 'bg-warning-soft/60 border-warning/25' : 'bg-surface-muted border-border'}`}>
              <p className="text-2xs uppercase tracking-wider text-muted-foreground font-bold mb-2">
                {selectedItems.size} colaborador{selectedItems.size !== 1 ? 'es' : ''} afetado{selectedItems.size !== 1 ? 's' : ''}
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                {sortedData.filter(row => selectedItems.has(row.actual.id)).map(row => {
                  const n = getCollaboratorName(row.collaboratorId);
                  return (
                    <div key={row.actual.id} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-2xs font-semibold ${avatarColor(n)}`}>
                      {initials(n)} <span className="opacity-90">{n}</span>
                    </div>
                  );
                })}
              </div>
              {/* Totais do conjunto selecionado */}
              <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border/70">
                <div>
                  <p className="text-2xs uppercase tracking-wider text-muted-foreground font-bold">Planejado</p>
                  <p className="text-sm font-semibold text-primary tabular-nums">{fmt(selectedTotals.planned)}</p>
                </div>
                <div>
                  <p className="text-2xs uppercase tracking-wider text-muted-foreground font-bold">Realizado</p>
                  <p className="text-sm font-semibold text-primary tabular-nums">{fmt(selectedTotals.actual)}</p>
                </div>
                <div>
                  <p className="text-2xs uppercase tracking-wider text-muted-foreground font-bold">Diferença</p>
                  <p className={`text-sm font-semibold tabular-nums ${selectedTotals.diff > 0 ? 'text-danger' : selectedTotals.diff < 0 ? 'text-success' : 'text-muted-foreground'}`}>
                    {selectedTotals.diff > 0 ? '+' : selectedTotals.diff < 0 ? '−' : ''}{fmt(Math.abs(selectedTotals.diff))}
                  </p>
                </div>
              </div>
            </div>

            {/* Comment field — o comentário é aplicado a todos os itens selecionados.
                Manual do Financeiro: obrigatório ao devolver/recusar; opcional só no aprovar */}
            <div>
              <label className="text-sm font-medium text-slate-700">
                {actionModal?.type === 'approve' ? (
                  <>
                    Comentário{' '}
                    <span className="text-muted-foreground font-normal">
                      (opcional{selectedItems.size > 1 ? ` — será aplicado a todos os ${selectedItems.size} colaboradores selecionados` : ''})
                    </span>
                  </>
                ) : (
                  <>
                    Observação<RequiredMark />{' '}
                    <span className="text-muted-foreground font-normal">
                      (obrigatória{selectedItems.size > 1 ? ` — será aplicada a todos os ${selectedItems.size} colaboradores selecionados` : ''})
                    </span>
                  </>
                )}
              </label>
              <Textarea
                className={`mt-1.5 rounded-xl text-sm resize-none ${actionNoteError && actionModal?.type !== 'approve' && !actionNote.trim() ? 'border-danger-strong focus-visible:ring-danger/25' : ''}`}
                value={actionNote}
                onChange={e => { setActionNote(e.target.value); if (e.target.value.trim()) setActionNoteError(false); }}
                aria-required={actionModal?.type !== 'approve'}
                placeholder={
                  actionModal?.type === 'approve'
                    ? 'Adicionar um comentário…'
                    : actionModal?.type === 'reject'
                    ? 'Escreva o motivo da recusa (obrigatório)...'
                    : 'Descreva o que precisa ser corrigido (obrigatório)...'
                }
                rows={3}
                autoFocus={actionModal?.type !== 'approve'}
              />
              {actionNoteError && actionModal?.type !== 'approve' && !actionNote.trim() && (
                <p className="text-2xs text-danger font-medium mt-1.5">
                  A observação é obrigatória ao {actionModal?.type === 'reject' ? 'recusar' : 'devolver'} — o responsável de função a receberá na tela do Realizado.
                </p>
              )}
              {actionModal?.type !== 'approve' && actionNote.trim() && (
                <p className="text-2xs text-muted-foreground mt-1.5 italic">
                  Esta observação ficará visível para o(s) colaborador(es) no card de prestação.
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 mt-1">
            <Button variant="ghost" className="rounded-xl" onClick={() => { setActionModal(null); setActionNote(""); setActionNoteError(false); }}>Cancelar</Button>
            <Button
              onClick={handleAction}
              disabled={rhActionMutation.isPending}
              className={`rounded-xl ${
                actionModal?.type === 'approve' ? 'bg-success hover:bg-success/90' :
                actionModal?.type === 'reject' ? 'bg-danger hover:bg-danger/90' :
                'bg-warning hover:bg-warning/90'
              } text-white shadow-1`}
            >
              {rhActionMutation.isPending ? 'Processando…' :
               actionModal?.type === 'approve' ? 'Confirmar aprovação' :
               actionModal?.type === 'reject' ? 'Confirmar recusa' : 'Devolver para ajuste'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reabrir o comparativo aprovado (estorno do Flash) ── */}
      <AlertDialog open={reopenOpen} onOpenChange={(o) => { setReopenOpen(o); if (!o) { setReopenReason(""); setReopenReasonError(false); } }}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2.5 text-base">
              <div className="w-8 h-8 rounded-xl bg-warning-soft flex items-center justify-center shrink-0">
                <RotateCcw className="w-4 h-4 text-warning" aria-hidden="true" />
              </div>
              <span className="text-warning">Reabrir o comparativo?</span>
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2.5 text-sm text-slate-600">
                <p>
                  O comparativo volta para <strong>devolvido</strong> (em ajuste) e{' '}
                  <strong>todos os lançamentos automáticos do Flash deste evento são REMOVIDOS</strong> —
                  alimentação e mobilidade saem do saldo dos colaboradores.
                </p>
                <p>
                  Os lançamentos são apagados, não debitados: o extrato não fica com um par crédito/débito.
                  Ao aprovar o comparativo de novo, o crédito é recriado com os valores do Realizado daquele momento.
                </p>
                <p className="text-muted-foreground">
                  Lançamentos <strong>manuais</strong> do Flash não são tocados. As prestações continuam com o
                  status individual que já tinham.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div>
            <label className="text-2xs font-bold text-muted-foreground uppercase tracking-wider">
              Motivo da reabertura<RequiredMark />
            </label>
            <Textarea
              value={reopenReason}
              onChange={e => { setReopenReason(e.target.value); if (e.target.value.trim()) setReopenReasonError(false); }}
              rows={3}
              className={`mt-1.5 rounded-xl text-sm resize-none ${reopenReasonError ? 'border-danger-strong focus-visible:ring-danger/25' : ''}`}
              placeholder="Ex.: valor de mobilidade do João estava errado — corrigir e aprovar de novo"
              data-testid="input-motivo-reabertura"
            />
            {reopenReasonError && (
              <p className="text-2xs text-danger font-medium mt-1.5">
                Descreva o motivo — ele fica registrado no comparativo como motivo da devolução.
              </p>
            )}
          </div>

          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-warning hover:bg-warning/90 text-white"
              disabled={reopenComparisonMutation.isPending}
              onClick={(e) => {
                // O motivo é obrigatório (mesma regra da devolução por prestação):
                // sem ele, o AlertDialog não pode fechar sozinho.
                if (!reopenReason.trim()) {
                  e.preventDefault();
                  setReopenReasonError(true);
                  return;
                }
                if (!comparison) { e.preventDefault(); return; }
                e.preventDefault();
                reopenComparisonMutation.mutate({ id: comparison.id, returnReason: reopenReason.trim() });
              }}
              data-testid="button-confirmar-reabertura"
            >
              {reopenComparisonMutation.isPending ? 'Reabrindo…' : 'Reabrir e estornar o Flash'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
