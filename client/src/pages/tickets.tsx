// Compra de Passagens — página. Estado de UI, validação compartilhada e o
// upsert idempotente ficam aqui; dados/índices em use-tickets-data; a UI em
// components/tickets/**. Regras do formulário: @/lib/ticket-form.
import { useState, useMemo, useEffect, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { Plane, AlertCircle } from "lucide-react";
import { type SortConfig, type SortField } from "@/components/common/sortable-header";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { canView, canEdit as canEditScreen } from "@/lib/permissions";
import { PastEventBanner } from "@/lib/event-lock";
import { useAuth } from "@/hooks/use-auth";
import {
  getMissingRequiredFields,
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
import { TicketsKpis, PendingSwapsBanner } from "@/components/tickets/tickets-kpis";
import TicketsFilterBar from "@/components/tickets/tickets-filter-bar";
import QuickBatchPanel from "@/components/tickets/quick-batch-panel";
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
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [modalActiveTab, setModalActiveTab] = useState("resumo");

  const data = useTicketsData({ filters, showOnlyPendingSwaps, sortConfig, user });
  const {
    events, functions, collaborators, eventById, accommodationByInclusion,
    getTicket, getEventName, getFunctionName, getCollaboratorName, getCollaborator,
    filteredTicketInclusions, pendingTicketSwapsCount, selectableInclusionIds, kpis, isPurchasingRole,
  } = data;
  const canEdit = canEditScreen(user, "tickets");

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
  const validateTicketForm = (
    scope: string,
    form: TicketFormValues,
    ctx: { scheduleStartDate?: string | null; scheduleEndDate?: string | null },
    proceed: () => void,
  ) => {
    const missing = getMissingRequiredFields(form || {});
    const chrono = validateTicketChronology(form || {}, ctx);
    const errors: Record<string, string> = { ...chrono.errors };
    for (const m of missing) errors[m.field] = `${m.label} é obrigatório`;
    setFieldErrors(prev => ({ ...prev, [scope]: errors }));

    const list = (items: string[]) => <ul className="list-disc pl-4 space-y-0.5">{items.map((i, k) => <li key={k}>{i}</li>)}</ul>;
    if (missing.length > 0) {
      toast({ title: "Campos obrigatórios", description: list(missing.map(f => f.label)), variant: "destructive" });
      return;
    }
    const chronoMsgs = Object.values(chrono.errors);
    if (chronoMsgs.length > 0) {
      toast({ title: "Datas inconsistentes", description: list(chronoMsgs), variant: "destructive" });
      return;
    }
    if (chrono.warnings.length > 0) { setPendingWarnings({ warnings: chrono.warnings, onConfirm: proceed }); return; }
    proceed();
  };

  // ── Modal ──
  const openModal = (inclusion: TeamInclusion) => {
    setSelectedInclusion(inclusion);
    setShowModal(true);
    setModalActiveTab("resumo");
    const eventLocation = eventById.get(inclusion.eventId)?.location;
    // Prefill de origem: "Sai de" da inclusão ou cidade do colaborador.
    const originCity = inclusion.city || getCollaborator(inclusion.collaboratorId)?.city || "";
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
  };

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

  const filteredEvent = filters.eventId !== "all" ? eventById.get(filters.eventId) : undefined;
  // Impacto do lote: sem período individual, usa as datas do evento filtrado (se houver) e valores padrão de refeição
  // do perfil "demais" (o lote mistura funções; o valor exato por pessoa aparece no modal individual).
  const batchImpactCtx = useMemo<PlannedImpactContext>(() => ({
    workDays: filteredEvent ? periodDays(filteredEvent.startDate, filteredEvent.endDate) : null,
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
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center gap-5">
          <div className="w-10 h-10 bg-[#0033CC] rounded-[10px] flex items-center justify-center shrink-0" style={{ boxShadow: "0 4px 14px #0033CC50" }}>
            <Plane className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-[18px] font-bold tracking-tight text-slate-900 leading-tight">Compra de Passagens</h1>
            <p className="text-[13px] text-slate-400 mt-0.5">Gerencie a compra de passagens para os colaboradores escalados.</p>
          </div>
        </div>

        <TicketsKpis kpis={kpis} />
        {/* Evento encerrado: banner discreto quando o filtro aponta para um evento
            já terminado e o usuário não é o administrador. */}
        <PastEventBanner show={!!filteredEvent && data.isEventLocked({ eventId: filteredEvent.id })} />
        {isPurchasingRole && (
          <PendingSwapsBanner count={pendingTicketSwapsCount} active={showOnlyPendingSwaps} onToggle={() => setShowOnlyPendingSwaps(v => !v)} />
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

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <TicketsFilterBar
            filters={filters}
            onChange={setFilters}
            onClear={() => setShowOnlyPendingSwaps(false)}
            events={events}
            functions={functions}
            collaborators={collaborators}
            count={filteredTicketInclusions.length}
          />

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
          />
        </div>
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
      <BatchResultDialog result={batchResult} onClose={() => setBatchResult(null)} />
    </>
  );
}
