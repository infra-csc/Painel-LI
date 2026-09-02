// Compra de Passagens — página. Estado de UI, validação compartilhada e o
// upsert idempotente ficam aqui; dados/índices em use-tickets-data; a UI em
// components/tickets/**. Regras do formulário: @/lib/ticket-form.
import { useState, useMemo, useEffect, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { AlertCircle, Stamp, FileUp } from "lucide-react";
import { type SortConfig, type SortField } from "@/components/common/sortable-header";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { canView, canEdit as canEditScreen } from "@/lib/permissions";
import { apiRequest } from "@/lib/queryClient";
import { PastEventBanner } from "@/lib/event-lock";
import { useAuth } from "@/hooks/use-auth";
import {
  getMissingRequiredFields,
  getInvalidFields,
  validateTicketChronology,
  hasUnsavedTicketInput,
  ticketToFormValues,
  periodDays,
  type TicketFormValues,
  type PlannedImpactContext,
} from "@/lib/ticket-form";
import { refeicaoCents } from "@shared/alimentacao";
import type { TeamInclusion, Ticket } from "@shared/schema";
import { useTicketsData, toTitleCase } from "@/components/tickets/use-tickets-data";
import { useTicketUpsert } from "@/components/tickets/use-ticket-upsert";
import { filtersFromSearch, searchFromFilters } from "@/components/tickets/filters-url";
import { contarPorOpcao } from "@/components/tickets/tickets-filtering";
import TicketsWorkQueue, { type FilaDePassagens } from "@/components/tickets/tickets-work-queue";
import TicketsFilterBar from "@/components/tickets/tickets-filter-bar";
import QuickBatchPanel from "@/components/tickets/quick-batch-panel";
import VoucherLoteDialog from "@/components/tickets/voucher-lote-dialog";
import TicketsTable from "@/components/tickets/tickets-table";
import TicketModal from "@/components/tickets/ticket-modal";
import {
  TicketSuccessDialog, DiscardChangesDialog, ChronologyWarningsDialog, BatchConfirmDialog, BatchResultDialog,
} from "@/components/tickets/ticket-dialogs";
import type {
  TicketFilters, TicketFormState, FieldErrorsState, BatchResult, SuccessInfo, FormFieldHelpers, TicketFormHandlers,
} from "@/components/tickets/types";

// Chaves preenchidas automaticamente ao abrir o modal — não contam como
// "alteração" para o "Descartar alterações?".
const AUTO_FILLED_KEYS = ["transportType", "departureCityDestination", "returnCityOrigin", "departureCityOrigin", "returnCityDestination", "purchaseDate"];

export default function Tickets() {
  const { user } = useAuth();
  const { toast } = useToast();
  const search = useSearch();
  const [location, setLocation] = useLocation();

  const initial = useMemo(() => filtersFromSearch(typeof window !== "undefined" ? window.location.search : search), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [filters, setFilters] = useState<TicketFilters>(initial.filters);
  const [showOnlyPendingSwaps, setShowOnlyPendingSwaps] = useState(initial.swaps);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>({ field: "id", direction: "desc" });

  // Persiste filtros na URL (replace — não polui o histórico).
  useEffect(() => {
    const qs = searchFromFilters(filters, showOnlyPendingSwaps);
    const current = (typeof window !== "undefined" ? window.location.search : "").replace(/^\?/, "");
    if (qs !== current) setLocation(`${location}${qs ? `?${qs}` : ""}`, { replace: true });
  }, [filters, showOnlyPendingSwaps]); // eslint-disable-line react-hooks/exhaustive-deps
  // URL mudou por fora (link do menu, voltar do navegador): re-sincroniza o estado.
  useEffect(() => {
    const fromUrl = filtersFromSearch(search);
    if (JSON.stringify(fromUrl.filters) !== JSON.stringify(filters)) setFilters(fromUrl.filters);
    if (fromUrl.swaps !== showOnlyPendingSwaps) setShowOnlyPendingSwaps(fromUrl.swaps);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  // Formulários e erros inline por escopo ("quick" ou inclusionId).
  const [ticketData, setTicketData] = useState<TicketFormState>({});
  const [fieldErrors, setFieldErrors] = useState<FieldErrorsState>({});
  const [pendingWarnings, setPendingWarnings] = useState<{ warnings: string[]; onConfirm: () => void } | null>(null);
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  // "Descartar alterações?" — ao fechar o modal ou ao cancelar a edição.
  const [discardTarget, setDiscardTarget] = useState<null | "close" | "edit">(null);
  const [editSnapshot, setEditSnapshot] = useState<string | null>(null);

  const [selectedInclusion, setSelectedInclusion] = useState<TeamInclusion | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successInfo, setSuccessInfo] = useState<SuccessInfo | null>(null);
  const [selectedTickets, setSelectedTickets] = useState<string[]>([]);
  const [editingTicketId, setEditingTicketId] = useState<string | null>(null);
  const [batchExpanded, setBatchExpanded] = useState(false);
  const [voucherLoteAberto, setVoucherLoteAberto] = useState(false);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [modalActiveTab, setModalActiveTab] = useState("resumo");

  const data = useTicketsData({ filters, showOnlyPendingSwaps, sortConfig, user });
  const {
    events, functions, collaborators, eventById, accommodationByInclusion,
    getTicket, getEventName, getFunctionName, getCollaboratorName, getCollaborator,
    ticketInclusions, filteredTicketInclusions, pendingTicketSwapsCount, selectableInclusionIds, kpis, isPurchasingRole,
  } = data;
  const canEdit = canEditScreen(user, "tickets");

  /**
   * Qual bloco da fila está aceso. Deriva dos filtros que a tela já tinha —
   * não é estado novo, e por isso a URL, o "Limpar" e o botão de voltar do
   * navegador continuam funcionando sem saber que a fila existe.
   */
  const filaAtiva: FilaDePassagens =
    showOnlyPendingSwaps ? "troca"
    : filters.ticketStatus === "pending" ? "comprar"
    : filters.ticketStatus === "no_arrival" ? "sem-chegada"
    : filters.ticketStatus === "processed" ? "compradas"
    : null;

  const escolherFila = (k: FilaDePassagens) => {
    // Um bloco por vez: acender "Comprar" apaga o recorte de trocas, e
    // vice-versa. Dois recortes somados devolveriam lista vazia sem explicar.
    setShowOnlyPendingSwaps(k === "troca");
    setFilters(prev => ({
      ...prev,
      ticketStatus:
        k === "comprar" ? "pending"
        : k === "sem-chegada" ? "no_arrival"
        : k === "compradas" ? "processed"
        : "all",
    }));
  };

  /**
   * Opções dos filtros, cada uma com quantas linhas deixaria. A contagem sai
   * de `tickets-filtering.ts` — a MESMA regra que monta a lista, para o número
   * não poder divergir do que a pessoa vê depois de escolher.
   */
  const opcoesDosFiltros = useMemo(() => {
    const todas = data.teamInclusions ?? [];
    const ctx = { eventById: data.eventById, collaboratorById: data.collaboratorById };
    const completar = data.completarPipeline;
    const porEvento = contarPorOpcao(todas, filters, "eventId", ctx, completar);
    const porFuncao = contarPorOpcao(todas, filters, "functionId", ctx, completar);
    const porColaborador = contarPorOpcao(todas, filters, "collaboratorId", ctx, completar);
    // Só entra no popover quem tem ao menos uma linha no recorte: uma lista de
    // 900 colaboradores em que 890 devolvem zero não ajuda a escolher.
    return {
      eventos: (events ?? [])
        .filter(e => e.status !== "excluido" && e.status !== "excluído" && porEvento.has(e.id))
        .map(e => ({ id: e.id, nome: e.name, n: porEvento.get(e.id) ?? 0 })),
      funcoes: (functions ?? [])
        .filter(f => porFuncao.has(f.id))
        .map(f => ({ id: f.id, nome: f.name, n: porFuncao.get(f.id) ?? 0 })),
      colaboradores: (collaborators ?? [])
        .filter(c => porColaborador.has(c.id))
        .map(c => ({ id: c.id, nome: toTitleCase(c.fullName), n: porColaborador.get(c.id) ?? 0 })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.teamInclusions, data.eventById, data.collaboratorById, data.completarPipeline, events, functions, collaborators, filters]);

  /**
   * O resumo da barra de contexto. É onde o cartão "Total geral" foi parar:
   * diz quantas vagas o recorte tem, em quantos eventos, e quantas ainda
   * esperam compra — a informação que fazia a pessoa somar os cartões.
   */
  const resumoTopo = (() => {
    const n = filteredTicketInclusions.length;
    if (n === 0) return "nenhuma vaga neste recorte";
    const nEventos = new Set(filteredTicketInclusions.map(i => i.eventId)).size;
    return [
      `${n} ${n === 1 ? "vaga" : "vagas"} em ${nEventos} ${nEventos === 1 ? "evento" : "eventos"}`,
      kpis.aguardando > 0 ? `${kpis.aguardando} aguardando compra` : null,
    ].filter(Boolean).join(" · ");
  })();

  const handleSort = (field: SortField) => {
    setSortConfig(current => {
      if (current?.field === field) return current.direction === "asc" ? { field, direction: "desc" } : null;
      return { field, direction: "asc" };
    });
  };

  const { upsertTicketForInclusion, isSubmitting, batchRunning } = useTicketUpsert({
    getTicket, accommodationByInclusion, onTicketUpdated: () => setEditingTicketId(null),
  });

  // ── Formulário: handlers/helpers compartilhados (lote e modal) ──
  const handlers = useMemo<TicketFormHandlers>(() => ({
    onFieldChange: (scope, field, value) => {
      setTicketData(prev => ({ ...prev, [scope]: { ...prev[scope], [field]: value } }));
      // Corrigiu o campo → some o erro inline dele.
      setFieldErrors(prev => {
        if (!prev[scope]?.[field]) return prev;
        const { [field]: _removed, ...rest } = prev[scope];
        return { ...prev, [scope]: rest };
      });
    },
    onPatch: (scope, patch) => {
      setTicketData(prev => ({ ...prev, [scope]: { ...prev[scope], ...patch } }));
      setFieldErrors(prev => {
        if (!prev[scope]) return prev;
        const rest = { ...prev[scope] };
        for (const k of Object.keys(patch)) delete rest[k];
        return { ...prev, [scope]: rest };
      });
    },
  }), []);

  const helpers = useMemo<FormFieldHelpers>(() => ({
    errCls: (scope, field) => (fieldErrors[scope]?.[field] ? " border-red-400 focus-visible:ring-red-300 bg-red-50/40" : ""),
    fieldErrorMsg: (scope, field) => {
      const msg = fieldErrors[scope]?.[field];
      return msg ? <p className="text-[10px] text-red-500 mt-1 leading-snug" role="alert">{msg}</p> : null;
    },
  }), [fieldErrors]);

  const clearScope = (scope: string) => {
    setTicketData(prev => { const d = { ...prev }; delete d[scope]; return d; });
    setFieldErrors(prev => { const d = { ...prev }; delete d[scope]; return d; });
  };

  // ── Validação compartilhada: erros inline + toast (lista); avisos → "continuar mesmo assim" ──
  // Reprovou? Além do toast (que some sozinho), a tela PULA para a aba Dados e
  // rola até o primeiro campo em vermelho — sem isso, quem estava com o scroll
  // no meio do formulário via "nada acontecer" (relato do dono, 28/08).
  const revealFirstError = (scope: string) => {
    if (scope === "quick") return; // painel de lote tem o próprio layout, sem abas
    setModalActiveTab("dados");
    setTimeout(() => {
      document.querySelector('[role="alert"]')?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
  };
  const validateTicketForm = (
    scope: string,
    form: TicketFormValues,
    ctx: { scheduleStartDate?: string | null; scheduleEndDate?: string | null },
    proceed: () => void,
  ) => {
    const missing = getMissingRequiredFields(form || {});
    const invalidos = getInvalidFields(form || {});
    const chrono = validateTicketChronology(form || {}, ctx);
    const errors: Record<string, string> = { ...chrono.errors };
    for (const m of missing) errors[m.field] = `${m.label} é obrigatório`;
    for (const inv of invalidos) errors[inv.field] = inv.label;
    setFieldErrors(prev => ({ ...prev, [scope]: errors }));

    const list = (items: string[]) => <ul className="list-disc pl-4 space-y-0.5">{items.map((i, k) => <li key={k}>{i}</li>)}</ul>;
    if (missing.length > 0) {
      toast({ title: "Campos obrigatórios", description: list(missing.map(f => f.label)), variant: "destructive" });
      revealFirstError(scope);
      return;
    }
    if (invalidos.length > 0) {
      toast({ title: "Confira o preenchimento", description: list(invalidos.map(f => f.label)), variant: "destructive" });
      revealFirstError(scope);
      return;
    }
    const chronoMsgs = Object.values(chrono.errors);
    if (chronoMsgs.length > 0) {
      toast({ title: "Datas inconsistentes", description: list(chronoMsgs), variant: "destructive" });
      revealFirstError(scope);
      return;
    }
    if (chrono.warnings.length > 0) { setPendingWarnings({ warnings: chrono.warnings, onConfirm: proceed }); return; }
    proceed();
  };

  // ── Modal ──
  // useCallback (auditoria 28/08): TicketRow é memo() e recebe onOpen — sem
  // referência estável, TODAS as linhas repintavam a cada tecla digitada.
  const openModal = useCallback((inclusion: TeamInclusion) => {
    setSelectedInclusion(inclusion);
    setShowModal(true);
    setModalActiveTab("resumo");
    const eventLocation = eventById.get(inclusion.eventId)?.location;
    // Prefill de origem: "Sai de" da inclusão ou cidade do colaborador.
    const originCity = inclusion.city || (inclusion.collaboratorId ? data.collaboratorById.get(inclusion.collaboratorId)?.city : undefined) || "";
    setTicketData(prev => ({
      ...prev,
      [inclusion.id]: {
        ...prev[inclusion.id],
        ...(eventLocation ? {
          departureCityDestination: prev[inclusion.id]?.departureCityDestination || eventLocation,
          returnCityOrigin: prev[inclusion.id]?.returnCityOrigin || eventLocation,
        } : {}),
        ...(originCity ? {
          departureCityOrigin: prev[inclusion.id]?.departureCityOrigin || originCity,
          returnCityDestination: prev[inclusion.id]?.returnCityDestination || originCity,
        } : {}),
      },
    }));
  }, [eventById, data.collaboratorById]);

  const closeModalDiscarding = () => {
    setDiscardTarget(null);
    setShowModal(false);
    setEditingTicketId(null);
    setEditSnapshot(null);
    if (selectedInclusion) clearScope(selectedInclusion.id);
  };
  const closeSuccessModal = () => {
    setShowSuccessModal(false);
    setSuccessInfo(null);
    setEditingTicketId(null);
    if (selectedInclusion) clearScope(selectedInclusion.id);
  };
  const isModalDirty = () => {
    if (!selectedInclusion) return false;
    const ticket = getTicket(selectedInclusion.id);
    const isFormMode = !ticket || editingTicketId === selectedInclusion.id;
    // Em edição o formulário nasce cheio: "sujo" é diferir do snapshot inicial.
    return editingTicketId === selectedInclusion.id
      ? JSON.stringify(ticketData[selectedInclusion.id] ?? {}) !== editSnapshot
      : isFormMode && hasUnsavedTicketInput(ticketData[selectedInclusion.id], AUTO_FILLED_KEYS);
  };
  // Rascunho não existe: ao fechar com dados não salvos, pergunta antes.
  const requestCloseModal = () => {
    if (!selectedInclusion) { setShowModal(false); return; }
    if (isModalDirty()) { setDiscardTarget("close"); return; }
    closeModalDiscarding();
  };
  // "Cancelar" em edição volta ao modo visualização (não fecha o modal).
  const cancelEditToView = () => {
    setDiscardTarget(null);
    setEditingTicketId(null);
    setEditSnapshot(null);
    if (selectedInclusion) clearScope(selectedInclusion.id);
  };
  const requestCancelEdit = () => {
    if (isModalDirty()) { setDiscardTarget("edit"); return; }
    cancelEditToView();
  };
  const startEdit = (ticket: Ticket) => {
    if (!selectedInclusion) return;
    const prefill = ticketToFormValues(ticket);
    setTicketData(prev => ({ ...prev, [selectedInclusion.id]: prefill }));
    setEditSnapshot(JSON.stringify(prefill));
    setEditingTicketId(selectedInclusion.id);
    setModalActiveTab("dados");
  };
  const submitModal = () => {
    if (!selectedInclusion || isSubmitting) return;
    const inc = selectedInclusion;
    const form = ticketData[inc.id] || {};
    const isEditing = !!editingTicketId;
    validateTicketForm(inc.id, form, { scheduleStartDate: inc.scheduleStartDate, scheduleEndDate: inc.scheduleEndDate }, async () => {
      try {
        const mode = await upsertTicketForInclusion(inc, form);
        setSuccessInfo({
          message: (isEditing || mode === "updated") ? "Passagem atualizada com sucesso!" : "Passagem registrada com sucesso!",
          inclusionNumber: inc.inclusionNumber ?? null,
          eventName: getEventName(inc.eventId),
          collaboratorName: inc.collaboratorId ? getCollaboratorName(inc.collaboratorId) : "—",
          functionName: inc.functionId ? getFunctionName(inc.functionId) : "—",
        });
        setEditSnapshot(null);
        setShowModal(false);
        setShowSuccessModal(true);
      } catch { /* erro já exibido pelo toast da mutation */ }
    });
  };

  // ── Seleção / lote ──
  // A seleção sobrevive à troca de filtros; o contador usa só o que ainda é aplicável.
  const effectiveSelectedTickets = useMemo(
    () => selectedTickets.filter(id => selectableInclusionIds.has(id)),
    [selectedTickets, selectableInclusionIds],
  );
  const toggleTicketSelection = useCallback((id: string) => {
    setSelectedTickets(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  }, []);
  const allSelectableSelected = selectableInclusionIds.size > 0 && Array.from(selectableInclusionIds).every(id => selectedTickets.includes(id));
  const toggleAllTickets = () => setSelectedTickets(allSelectableSelected ? [] : Array.from(selectableInclusionIds));

  // ── Passagem EMITIDA (regra do dono, 26/08) ──
  // Carimbo de quem compra: a partir dele a área não pede mais ajuste naquela
  // vaga. Marcar NÃO exige passagem preenchida — quem preenche completa depois.
  // Só ADMIN e COMPRAS veem a ação (o servidor recusa o resto).
  const queryClient = useQueryClient();
  const podeEmitir = isPurchasingRole;
  const emitirMutation = useMutation({
    mutationFn: async ({ inclusionIds, emitida }: { inclusionIds: string[]; emitida: boolean }) =>
      (await apiRequest("POST", "/api/tickets/emitidas", { inclusionIds, emitida })).json() as Promise<{ ok: string[]; pulados: { id: string; motivo: string }[] }>,
    onSuccess: (res, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      const n = res.ok?.length ?? 0;
      toast({
        title: vars.emitida
          ? `${n} passagem(ns) marcada(s) como emitida(s)`
          : `${n} passagem(ns) voltaram para "não emitida"`,
        description: vars.emitida
          ? "A área não pode mais pedir ajuste nessas vagas. O preenchimento dos dados continua liberado."
          : "A janela de pedido de ajuste foi reaberta nessas vagas.",
      });
    },
    onError: () => toast({ title: "Não foi possível marcar as passagens", description: "Tente novamente.", variant: "destructive" }),
  });
  const toggleEmitida = useCallback((inclusion: TeamInclusion, emitida: boolean) => {
    emitirMutation.mutate({ inclusionIds: [inclusion.id], emitida });
  }, [emitirMutation]);
  const marcarSelecionadasEmitidas = () => {
    if (effectiveSelectedTickets.length === 0) return;
    emitirMutation.mutate({ inclusionIds: effectiveSelectedTickets, emitida: true });
  };

  const filteredEvent = filters.eventId !== "all" ? eventById.get(filters.eventId) : undefined;
  // Impacto do lote: sem período individual, usa as datas do evento filtrado (se houver) e valores padrão de refeição
  // do perfil "demais" (o lote mistura funções; o valor exato por pessoa aparece no modal individual).
  const batchImpactCtx = useMemo<PlannedImpactContext>(() => ({
    workDays: filteredEvent ? periodDays(filteredEvent.startDate, filteredEvent.endDate) : null,
    eventLocation: filteredEvent?.location ?? null,
    ...refeicaoCents("demais", data.systemSettings),
  }), [filteredEvent, data.systemSettings]);

  const handleApplyToSelected = () => {
    const quick = ticketData["quick"];
    if (!quick || effectiveSelectedTickets.length === 0 || isSubmitting) return;
    validateTicketForm("quick", quick, { scheduleStartDate: filteredEvent?.startDate ?? null, scheduleEndDate: filteredEvent?.endDate ?? null }, () => setShowBatchConfirm(true));
  };
  const runBatchApply = async () => {
    const quick = ticketData["quick"];
    setShowBatchConfirm(false);
    if (!quick || effectiveSelectedTickets.length === 0) return;
    let created = 0, updated = 0;
    const failures: string[] = [];
    const processedIds: string[] = [];
    batchRunning.current = true;
    try {
      for (const inclusionId of effectiveSelectedTickets) {
        const inclusion = filteredTicketInclusions.find(inc => inc.id === inclusionId);
        if (!inclusion) continue;
        try {
          const mode = await upsertTicketForInclusion(inclusion, quick);
          if (mode === "created") created++; else updated++;
          processedIds.push(inclusion.id);
        } catch (error) {
          const msg = (error as { body?: { message?: string } })?.body?.message || "falha ao registrar";
          failures.push(`#${inclusion.inclusionNumber ?? "?"} · ${getCollaboratorName(inclusion.collaboratorId)}: ${msg}`);
        }
      }
    } finally {
      batchRunning.current = false;
    }
    // Tira da fila só o que realmente foi registrado.
    if (processedIds.length > 0) setSelectedTickets(prev => prev.filter(id => !processedIds.includes(id)));
    if (failures.length > 0) {
      toast({
        title: `${failures.length} falha${failures.length !== 1 ? "s" : ""} no lote`,
        description: <ul className="list-disc pl-4 space-y-0.5 max-h-40 overflow-y-auto">{failures.map((f, i) => <li key={i}>{f}</li>)}</ul>,
        variant: "destructive",
      });
    }
    setBatchResult({ created, updated, failures });
  };
  const batchNames = effectiveSelectedTickets
    .map(id => filteredTicketInclusions.find(inc => inc.id === id))
    .filter((inc): inc is TeamInclusion => !!inc)
    .map(inc => `#${inc.inclusionNumber ?? "?"} ${toTitleCase(getCollaboratorName(inc.collaboratorId))}`);

  // ── Guardas de tela ──
  if (!canView(user, "tickets")) {
    return (
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Acesso Negado</h3>
        <p className="text-muted-foreground">Você não tem permissão para acessar esta tela.</p>
      </div>
    );
  }
  if (data.isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-muted rounded w-1/4 mb-4"></div>
        <div className="h-64 bg-muted rounded"></div>
      </div>
    );
  }
  if (data.loadError) {
    const isAuthError = data.loadError.status === 401 || data.loadError.status === 403;
    return (
      <div className="bg-white rounded-xl border border-red-200 shadow-sm p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4"><AlertCircle className="w-7 h-7 text-red-400" /></div>
        <h3 className="text-[15px] font-bold text-slate-700 mb-1">{isAuthError ? "Sessão expirada ou sem permissão" : "Não foi possível carregar as passagens"}</h3>
        <p className="text-[13px] text-slate-400 mb-4">
          {isAuthError ? "Entre novamente para continuar. Nenhum dado foi perdido." : (data.loadError.body?.message || "Verifique sua conexão e tente novamente.")}
        </p>
        <Button variant="outline" onClick={data.retryLoad} className="rounded-lg">Tentar novamente</Button>
      </div>
    );
  }

  return (
    <>
      <div className="-mx-6 -mt-6">
        {/* Barra de contexto: 56px no lugar do bloco de ~76px que repetia o que
            o breadcrumb já dizia. O "Total geral" do KPI vira o resumo daqui —
            nenhum número se perdeu. */}
        <div className="sticky top-0 z-25 flex items-center gap-4 h-14 px-6 bg-card border-b border-border">
          <span className="text-[15px] font-semibold text-slate-900 whitespace-nowrap">Passagens</span>
          <div aria-hidden="true" className="w-px h-5 bg-border" />
          <span className="min-w-0 text-[12px] text-muted-foreground truncate" data-testid="resumo-passagens">{resumoTopo}</span>
          {canEdit && (
            <Button
              type="button"
              onClick={() => setVoucherLoteAberto(true)}
              className="ml-auto shrink-0 h-[34px] rounded-lg bg-primary hover:bg-primary-hover text-white text-[13px] font-medium"
              data-testid="abrir-voucher-lote"
            >
              <FileUp className="w-4 h-4 mr-1.5" aria-hidden="true" />
              Registrar pelos vouchers (PDF)
            </Button>
          )}
        </div>

      <main className="px-6 pt-5 pb-6">
        <div className="flex flex-col gap-4 max-w-[1560px] mx-auto">
        {/* Evento encerrado: banner discreto quando o filtro aponta para um evento
            já terminado e o usuário não é o administrador. */}
        <PastEventBanner show={!!filteredEvent && data.isEventLocked({ eventId: filteredEvent.id })} />

        <TicketsWorkQueue
          kpis={kpis}
          trocasPendentes={pendingTicketSwapsCount}
          mostrarTrocas={isPurchasingRole}
          ativa={filaAtiva}
          onEscolher={escolherFila}
        />
        {/* Emitidas em lote: aparece assim que há linhas marcadas, acima do
            painel de aplicar dados. É o aviso de "o bilhete saiu" para várias
            pessoas de uma vez — não preenche nada, só fecha a janela de ajuste. */}
        {podeEmitir && effectiveSelectedTickets.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
            <Stamp className="w-4 h-4 text-violet-600 shrink-0" aria-hidden="true" />
            <p className="text-[13px] text-violet-900 mr-auto">
              <strong>{effectiveSelectedTickets.length}</strong>{" "}
              {effectiveSelectedTickets.length === 1 ? "passagem selecionada" : "passagens selecionadas"} — marcar como emitida trava o pedido de ajuste da área.
              <span className="block text-[11px] text-violet-700/80">Os dados da passagem continuam podendo ser preenchidos depois.</span>
            </p>
            <Button
              type="button"
              onClick={marcarSelecionadasEmitidas}
              disabled={emitirMutation.isPending}
              className="rounded-lg bg-violet-600 hover:bg-violet-700 text-white"
              data-testid="marcar-emitidas-lote"
            >
              <Stamp className="w-4 h-4 mr-1.5" aria-hidden="true" />
              {emitirMutation.isPending ? "Marcando…" : `Marcar como emitida (${effectiveSelectedTickets.length})`}
            </Button>
          </div>
        )}

        <QuickBatchPanel
          expanded={batchExpanded}
          onToggle={() => setBatchExpanded(v => !v)}
          quick={ticketData["quick"]}
          helpers={helpers}
          handlers={handlers}
          filteredEvent={filteredEvent}
          impactCtx={batchImpactCtx}
          selectedCount={effectiveSelectedTickets.length}
          canEdit={canEdit}
          isPending={isSubmitting}
          onClear={() => clearScope("quick")}
          onApply={handleApplyToSelected}
        />

        <TicketsFilterBar
          filters={filters}
          onChange={setFilters}
          onClear={() => setShowOnlyPendingSwaps(false)}
          opcoesDeEvento={opcoesDosFiltros.eventos}
          opcoesDeFuncao={opcoesDosFiltros.funcoes}
          opcoesDeColaborador={opcoesDosFiltros.colaboradores}
          count={filteredTicketInclusions.length}
          total={ticketInclusions.length}
        />

        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <TicketsTable
            data={data}
            filters={filters}
            sortConfig={sortConfig}
            onSort={handleSort}
            selectedTickets={selectedTickets}
            allSelectableSelected={allSelectableSelected}
            onToggleAll={toggleAllTickets}
            onToggleSelect={toggleTicketSelection}
            onOpen={openModal}
            canEdit={canEdit}
            onToggleEmitida={podeEmitir ? toggleEmitida : undefined}
            emitindo={emitirMutation.isPending}
          />
        </div>
        </div>
      </main>
      </div>

      <TicketModal
        open={showModal}
        inclusion={selectedInclusion}
        data={data}
        user={user}
        form={(selectedInclusion && ticketData[selectedInclusion.id]) || {}}
        helpers={helpers}
        handlers={handlers}
        editingTicketId={editingTicketId}
        activeTab={modalActiveTab}
        onTabChange={setModalActiveTab}
        showCommentsModal={showCommentsModal}
        onShowCommentsModal={setShowCommentsModal}
        successOpen={showSuccessModal}
        onRequestClose={requestCloseModal}
        onStartEdit={startEdit}
        onCancelEdit={requestCancelEdit}
        onSubmit={submitModal}
        isSubmitting={isSubmitting}
      />

      <TicketSuccessDialog open={showSuccessModal} info={successInfo} onClose={closeSuccessModal} />
      <DiscardChangesDialog
        open={!!discardTarget}
        backToView={discardTarget === "edit"}
        onCancel={() => setDiscardTarget(null)}
        onDiscard={discardTarget === "edit" ? cancelEditToView : closeModalDiscarding}
      />
      <ChronologyWarningsDialog
        warnings={pendingWarnings?.warnings ?? null}
        onCancel={() => setPendingWarnings(null)}
        onConfirm={() => { const fn = pendingWarnings?.onConfirm; setPendingWarnings(null); fn?.(); }}
      />
      <BatchConfirmDialog open={showBatchConfirm} quick={ticketData["quick"] || {}} names={batchNames} onCancel={() => setShowBatchConfirm(false)} onConfirm={runBatchApply} />
      <VoucherLoteDialog
        open={voucherLoteAberto}
        onOpenChange={setVoucherLoteAberto}
        inclusions={ticketInclusions}
        getCollaboratorName={getCollaboratorName}
        getEventName={getEventName}
        onRegistrar={async (inclusion, form) => { await upsertTicketForInclusion(inclusion, form); }}
        registrando={isSubmitting}
      />
      <BatchResultDialog result={batchResult} onClose={() => setBatchResult(null)} />
    </>
  );
}
