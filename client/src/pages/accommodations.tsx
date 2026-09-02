import { useState, useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCheck, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { canView, canEdit as canEditScreen } from "@/lib/permissions";
import { useEventLock, PastEventBanner } from "@/lib/event-lock";
import { hasRoleIn } from "@shared/roles";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { fixEncoding } from "@/lib/utils";
import type { TeamInclusion } from "@shared/schema";
import type { OpcaoDeFiltro } from "@/components/common/filter-popover";
import AccommodationModal from "@/components/accommodations/accommodation-modal";
import AccommodationsTable from "@/components/accommodations/accommodations-table";
import AccommodationsFilterBar from "@/components/accommodations/accommodations-filter-bar";
import AccommodationsWorkQueue from "@/components/accommodations/accommodations-work-queue";
import {
  BatchConfirmDialog, BatchResultDialog, BatchSelectionBar, type BatchResult,
} from "@/components/accommodations/accommodations-batch";
import { useAccommodationsData } from "@/components/accommodations/use-accommodations-data";
import { contarPorOpcao } from "@/components/accommodations/accommodations-filtering";
import {
  contadoresDaFila, pertenceAoBloco, type BlocoDaFila,
} from "@/components/accommodations/accommodations-queue";
import {
  DEFAULT_FILTERS,
  type AccommodationDraft, type AccommodationFilters, type AccommodationPayload, type AccSortConfig, type AccSortField,
  type ApiError, type BatchDraft,
} from "@/components/accommodations/types";
import { isCheckOutAfterCheckIn, isPostPurchaseStatus, toDateInput, toTitleCase } from "@/components/accommodations/utils";

interface SuccessInfo {
  message: string;
  inclusionNumber: number | null;
  eventName: string;
  collaboratorName: string;
  functionName: string;
}

/** Como a lista está ordenada agora, em palavras, para o rodapé. */
const NOME_DA_ORDEM: Record<string, string> = {
  id: "nº da inclusão", event: "evento", collaborator: "colaborador",
  date: "check-in", hotelName: "hotel", function: "função",
};

export default function Accommodations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Estado da tela ──
  const [filters, setFilters] = useState<AccommodationFilters>(DEFAULT_FILTERS);
  const [blocoAtivo, setBlocoAtivo] = useState<BlocoDaFila | null>(null);
  const [sortConfig, setSortConfig] = useState<AccSortConfig | null>({ field: "id", direction: "desc" });
  const [selectedInclusion, setSelectedInclusion] = useState<TeamInclusion | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successInfo, setSuccessInfo] = useState<SuccessInfo | null>(null);
  const [batchDraft, setBatchDraft] = useState<BatchDraft>({});
  const [selectedForBatch, setSelectedForBatch] = useState<string[]>([]);
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const [batchApplying, setBatchApplying] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);

  // Admin ou Compras — aceita aliases legados ("administrador", "compras"...)
  const isPurchasingRole = hasRoleIn(user?.role, ["admin", "purchasing"]);
  const canEditField = canEditScreen(user, "accommodations");
  // Evento encerrado (regra 19/08): hospedagem depende da escalação — depois do
  // término só o administrador age (o servidor devolve 403).
  const eventLock = useEventLock();

  // ── Dados ──
  // O recorte de troca virou um bloco da fila, aplicado aqui embaixo junto dos
  // outros três; o hook devolve a lista sem ele para os contadores da fila
  // poderem contar todos os blocos ao mesmo tempo.
  const {
    teamInclusions, events, functions, collaborators, tickets, users,
    isLoading, loadError,
    accommodationMap, eventById, functionById, collaboratorById,
    pendingSwapByInclusion, filteredData, selectableInclusionIds,
    teamInclusionsWithAccommodation,
  } = useAccommodationsData({ filters, sortConfig, showOnlyPendingSwaps: false });

  const hoje = useMemo(() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }, []);

  const ctxFila = useMemo(
    () => ({ eventById, accommodationMap, pendingSwapByInclusion, hoje }),
    [eventById, accommodationMap, pendingSwapByInclusion, hoje],
  );

  // Contadores da fila sobre a lista JÁ filtrada mas SEM o recorte do bloco:
  // com o próprio bloco aplicado, os outros três mostrariam zero e o número
  // deixaria de servir para escolher o próximo trabalho.
  const resumoDaFila = useMemo(() => contadoresDaFila(filteredData, ctxFila), [filteredData, ctxFila]);

  const linhasVisiveis = useMemo(
    () => (blocoAtivo ? filteredData.filter((i) => pertenceAoBloco(blocoAtivo, i, ctxFila)) : filteredData),
    [filteredData, blocoAtivo, ctxFila],
  );

  // ── Contadores cruzados dos popovers ──
  // "Quantas linhas sobram se eu marcar ISTO mantendo o resto do recorte" — pela
  // MESMA regra que monta a lista, para o número prometido ser o entregue.
  const ctxFiltro = useMemo(
    () => ({ eventById, collaboratorById, accommodationMap, pendingSwapByInclusion, showOnlyPendingSwaps: false }),
    [eventById, collaboratorById, accommodationMap, pendingSwapByInclusion],
  );

  const opcoesDeEvento = useMemo<OpcaoDeFiltro[]>(() => {
    const n = contarPorOpcao(teamInclusionsWithAccommodation, filters, "eventId", ctxFiltro);
    return (events ?? [])
      .filter((e) => e.status !== "excluido" && e.status !== "excluído")
      .map((e) => ({ id: e.id, nome: e.name, n: n.get(e.id) ?? 0 }));
  }, [events, teamInclusionsWithAccommodation, filters, ctxFiltro]);

  const opcoesDeFuncao = useMemo<OpcaoDeFiltro[]>(() => {
    const n = contarPorOpcao(teamInclusionsWithAccommodation, filters, "functionId", ctxFiltro);
    return (functions ?? [])
      .map((f) => ({ id: f.id, nome: f.name, n: n.get(f.id) ?? 0 }));
  }, [functions, teamInclusionsWithAccommodation, filters, ctxFiltro]);

  const opcoesDeColaborador = useMemo<OpcaoDeFiltro[]>(() => {
    const n = contarPorOpcao(teamInclusionsWithAccommodation, filters, "collaboratorId", ctxFiltro);
    return (collaborators ?? [])
      .map((c) => ({ id: c.id, nome: toTitleCase(c.fullName) || "—", n: n.get(c.id) ?? 0 }));
  }, [collaborators, teamInclusionsWithAccommodation, filters, ctxFiltro]);

  // A seleção sobrevive à troca de filtros e a registros feitos em outra aba; o
  // contador e o botão de lote usam só o que ainda é aplicável.
  // Linhas de evento encerrado não entram no lote: o POST/PATCH tomaria 403.
  const selectableAtivos = useMemo(
    () => new Set(
      linhasVisiveis.filter((inc) => selectableInclusionIds.has(inc.id) && !eventLock.isLockedInclusion(inc)).map((inc) => inc.id),
    ),
    [linhasVisiveis, selectableInclusionIds, eventLock],
  );
  const effectiveSelectedForBatch = selectedForBatch.filter((id) => selectableAtivos.has(id));
  const allSelectableSelected =
    selectableAtivos.size > 0 && Array.from(selectableAtivos).every((id) => selectedForBatch.includes(id));

  // ── Handlers de filtro/ordenação/seleção ──
  const patchFilters = useCallback((patch: Partial<AccommodationFilters>) => setFilters((prev) => ({ ...prev, ...patch })), []);
  const clearFilters = () => { setFilters(DEFAULT_FILTERS); setBlocoAtivo(null); };
  const hasActiveFilters =
    filters.eventId !== "all" || filters.functionId.length > 0 || filters.collaboratorId !== "all" ||
    filters.searchId.trim() !== "" || filters.accommodationStatus !== "all" || filters.inclusionStatus !== "active" ||
    blocoAtivo !== null;

  const handleSort = (field: AccSortField) => {
    setSortConfig((current) => {
      if (current?.field === field) return current.direction === "asc" ? { field, direction: "desc" } : null; // 3º clique remove
      return { field, direction: "asc" };
    });
  };

  const toggleRowSelection = (id: string) =>
    setSelectedForBatch((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  // Marcar todos = só os pendentes visíveis (canceladas não têm checkbox).
  const toggleAllSelection = () =>
    setSelectedForBatch(allSelectableSelected ? [] : Array.from(selectableAtivos));

  // ── Modal ──
  const openModal = (inclusion: TeamInclusion) => {
    if (inclusion.status === "cancelado") return;
    setSelectedInclusion(inclusion);
    setShowModal(true);
  };
  const closeModal = () => setShowModal(false);

  // ── Registro de UMA hospedagem: cria o registro e avança o status da inclusão.
  // Compartilhado pelo modal (via mutation) e pelo lote (chamada direta).
  const registerAccommodation = async (payload: AccommodationPayload) => {
    const created = await apiRequest("POST", "/api/accommodations", payload);

    const inclusion = teamInclusions?.find((inc) => inc.id === payload.teamInclusionId);
    const ticket = tickets?.find((t) => t.teamInclusionId === payload.teamInclusionId);
    const ticketPurchased = !!ticket && !!(ticket.purchaseDate || ticket.actualDepartureDate);
    // Precisa de passagem E já comprada → ambos comprados; senão só hospedagem.
    const newStatus = inclusion?.needsTicket && ticketPurchased ? "hospedagem_passagem_comprada" : "hospedagem_comprada";

    try {
      await apiRequest("PATCH", `/api/team-inclusions/${payload.teamInclusionId}`, { status: newStatus, phase: "hospedagem", updatedBy: user?.id });
    } catch (err) {
      // A hospedagem JÁ foi criada: o toast genérico fazia o usuário tentar de novo e duplicar.
      const e = err as ApiError;
      e.body = {
        message: e?.body?.message
          ? `Hospedagem registrada, mas o status da inclusão não foi atualizado: ${e.body.message}`
          : "Hospedagem registrada, mas não foi possível atualizar o status da inclusão.",
      };
      throw e;
    }
    return created;
  };

  const createMutation = useMutation({
    mutationFn: registerAccommodation,
    // onSettled: mesmo quando o PATCH de status falha a hospedagem já existe.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accommodations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    },
    onError: (error: ApiError) => toast({ variant: "destructive", title: "Erro", description: error?.body?.message || "Erro ao registrar hospedagem" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: AccommodationPayload }) => apiRequest("PATCH", `/api/accommodations/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/accommodations"] }),
    onError: (error: ApiError) => toast({ variant: "destructive", title: "Erro", description: error?.body?.message || "Erro ao atualizar hospedagem" }),
  });

  const handleModalSave = async (draft: AccommodationDraft) => {
    if (!selectedInclusion) return;
    const accommodation = accommodationMap.get(selectedInclusion.id);
    const payload: AccommodationPayload = {
      teamInclusionId: selectedInclusion.id,
      hotelName: draft.hotelName || null,
      hotelLocation: draft.hotelLocation || null,
      reservationNumber: draft.reservationNumber || null,
      accommodationObservations: draft.accommodationObservations || null,
      attachmentIds: draft.attachmentIds || [],
      checkInDate: draft.checkInDate || null,
      checkInTime: draft.checkInTime || null,
      checkOutDate: draft.checkOutDate || null,
      checkOutTime: draft.checkOutTime || null,
      updatedBy: user?.id,
    };
    if (accommodation) await updateMutation.mutateAsync({ id: accommodation.id, data: payload });
    else await createMutation.mutateAsync(payload);

    const collaborator = selectedInclusion.collaboratorId ? collaboratorById.get(selectedInclusion.collaboratorId) : undefined;
    setSuccessInfo({
      message: accommodation ? "Hospedagem atualizada com sucesso!" : "Hospedagem registrada com sucesso!",
      inclusionNumber: selectedInclusion.inclusionNumber ?? null,
      eventName: eventById.get(selectedInclusion.eventId)?.name ?? "—",
      collaboratorName: collaborator ? (fixEncoding(collaborator.fullName) || "—") : "—",
      functionName: functionById.get(selectedInclusion.functionId)?.name ?? "—",
    });
    closeModal();
    setShowSuccessModal(true);
  };

  // ── Lote ──
  const setBatchField = <K extends keyof BatchDraft>(field: K, value: NonNullable<BatchDraft[K]>) =>
    setBatchDraft((prev) => ({ ...prev, [field]: value }));

  const inclusoesDoLote = useMemo(
    () => effectiveSelectedForBatch
      .map((id) => linhasVisiveis.find((i) => i.id === id))
      .filter((i): i is TeamInclusion => !!i),
    [effectiveSelectedForBatch, linhasVisiveis],
  );

  // Passo 1: valida (mesma régua do modal) e abre a confirmação.
  const handleApplyToSelected = () => {
    if (effectiveSelectedForBatch.length === 0 || batchApplying) return;
    setShowBatchConfirm(true);
  };

  // Passo 2: registra uma a uma e invalida as queries UMA vez ao final.
  const runBatch = async () => {
    if (batchApplying) return;
    const err = !batchDraft.hotelName || !batchDraft.hotelLocation
      ? "Preencha os campos obrigatórios: Nome do Hotel e Localização"
      : !isCheckOutAfterCheckIn(batchDraft) ? "O check-out deve ser igual ou posterior ao check-in." : null;
    if (err) { toast({ title: "Erro", description: err, variant: "destructive" }); return; }

    setShowBatchConfirm(false);
    setBatchApplying(true);
    let successCount = 0;
    const errors: string[] = [];
    const processedIds: string[] = [];
    try {
      for (const inclusionId of effectiveSelectedForBatch) {
        const inclusion = linhasVisiveis.find((inc) => inc.id === inclusionId);
        if (!inclusion) continue;
        if (accommodationMap.get(inclusion.id)) { errors.push(`Hospedagem #${inclusion.inclusionNumber} já foi processada`); continue; }
        try {
          await registerAccommodation({
            teamInclusionId: inclusion.id,
            hotelName: batchDraft.hotelName || null,
            hotelLocation: batchDraft.hotelLocation || null,
            accommodationObservations: batchDraft.accommodationObservations || null,
            // Datas do lote quando informadas; senão o período de trabalho de cada inclusão.
            checkInDate: batchDraft.checkInDate || toDateInput(inclusion.scheduleStartDate) || null,
            checkInTime: batchDraft.checkInTime || null,
            checkOutDate: batchDraft.checkOutDate || toDateInput(inclusion.scheduleEndDate) || null,
            checkOutTime: batchDraft.checkOutTime || null,
            updatedBy: user?.id,
          });
          successCount++;
          processedIds.push(inclusion.id);
        } catch (error) {
          errors.push(`#${inclusion.inclusionNumber}: ${(error as ApiError)?.body?.message || "falha ao registrar"}`);
        }
      }
      // O resultado vira diálogo: uma lista de falhas dentro de um toast que
      // some em segundos é a mesma coisa que não mostrar as falhas.
      setBatchResult({ registradas: successCount, falhas: errors });
      // Tira da fila só o que realmente foi registrado.
      if (processedIds.length > 0) setSelectedForBatch((prev) => prev.filter((id) => !processedIds.includes(id)));
    } catch {
      toast({ title: "Erro", description: "Erro inesperado ao processar hospedagens em lote", variant: "destructive" });
    } finally {
      setBatchApplying(false);
      queryClient.invalidateQueries({ queryKey: ["/api/accommodations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    }
  };

  // ── Estados de tela ──
  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="Carregando hospedagens">
        <div className="h-14 bg-muted rounded-xl" />
        <div className="h-[76px] bg-muted rounded-xl" />
        <div className="h-[34px] bg-muted rounded-lg w-2/3" />
        <div className="h-64 bg-muted rounded-xl" />
      </div>
    );
  }

  if (!canView(user, "accommodations")) {
    return (
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Acesso Negado</h3>
        <p className="text-muted-foreground">Você não tem permissão para acessar esta tela.</p>
      </div>
    );
  }

  // Sessão expirada ou rede fora: mostrar o motivo em vez de "nenhuma inclusão".
  if (loadError) {
    const isAuthError = loadError.status === 401 || loadError.status === 403;
    return (
      <div className="bg-card rounded-2xl border border-[#FECACA] shadow-sm p-8 text-center" role="alert">
        <div className="w-14 h-14 rounded-2xl bg-[#FEF2F2] flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-7 h-7 text-[#B91C1C]" aria-hidden="true" />
        </div>
        <h3 className="text-[15px] font-bold text-slate-700 mb-1">
          {isAuthError ? "Sessão expirada ou sem permissão" : "Não foi possível carregar as hospedagens"}
        </h3>
        <p className="text-[13px] text-[#64748B] mb-4">
          {isAuthError ? "Entre novamente para continuar. Nenhum dado foi perdido." : (loadError.body?.message || "Verifique sua conexão e tente novamente.")}
        </p>
        <Button variant="outline" className="rounded-lg" onClick={() => {
          ["/api/team-inclusions", "/api/events", "/api/functions", "/api/collaborators", "/api/accommodations"]
            .forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
        }}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  // Permissões do registro aberto no modal.
  const selectedAccommodation = selectedInclusion ? accommodationMap.get(selectedInclusion.id) : undefined;
  const isPostPurchase = isPostPurchaseStatus(selectedInclusion?.status);
  // Antes de registrar: quem edita a tela. Depois: SÓ Compras/admin (decisão do usuário).
  const eventLocked = eventLock.isLockedInclusion(selectedInclusion);
  const canEditRecord = !!selectedInclusion && !!user && canEditField && !eventLocked
    && selectedInclusion.status !== "cancelado" && (!isPostPurchase || isPurchasingRole);
  const lockedForRole = isPostPurchase && !isPurchasingRole && selectedInclusion?.status !== "cancelado";

  const eventosNoRecorte = new Set(linhasVisiveis.map((i) => i.eventId)).size;
  const semReserva = linhasVisiveis.filter((i) => !accommodationMap.get(i.id) && i.status !== "cancelado").length;
  const ordenacao = sortConfig
    ? `ordenado por ${NOME_DA_ORDEM[sortConfig.field] ?? sortConfig.field}`
    : "sem ordenação";

  return (
    <div className="space-y-4">
      {/*
        Barra de contexto: onde estou, o que estou vendo e a ação primária.
        Substitui o cabeçalho de 76px cujo subtítulo repetia o nome do menu.
      */}
      <div className="sticky top-0 z-20 h-14 -mx-1 px-1 bg-background/95 backdrop-blur flex items-center gap-3">
        <h1 className="text-[15px] font-semibold text-slate-900 whitespace-nowrap">Hospedagem</h1>
        <span className="w-px h-5 bg-border shrink-0" aria-hidden="true" />
        <p className="text-[12px] text-[#64748B] truncate" data-testid="resumo-do-recorte">
          {linhasVisiveis.length} {linhasVisiveis.length === 1 ? "vaga" : "vagas"} em {eventosNoRecorte}{" "}
          {eventosNoRecorte === 1 ? "evento" : "eventos"} · {semReserva} sem reserva
        </p>
        {canEditField && (
          /*
           * Sem nada marcado o botão não fica inerte: ele marca as pendentes
           * visíveis, que é o passo que faltava para o lote existir. Um botão
           * primário permanentemente desabilitado só ensina a ignorá-lo.
           */
          <button
            type="button"
            onClick={() => (effectiveSelectedForBatch.length > 0 ? handleApplyToSelected() : toggleAllSelection())}
            disabled={selectableAtivos.size === 0}
            className="ml-auto shrink-0 h-[34px] px-3.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors"
            data-testid="button-batch-primary"
          >
            <ListChecks className="w-4 h-4" aria-hidden="true" />
            {effectiveSelectedForBatch.length > 0
              ? `Aplicar em lote (${effectiveSelectedForBatch.length})`
              : `Selecionar pendentes (${selectableAtivos.size})`}
          </button>
        )}
      </div>

      {/*
        A fila de trabalho no lugar dos três cards de resumo e do banner de
        trocas: aqui cada bloco conta E leva ao trabalho.
      */}
      <AccommodationsWorkQueue resumo={resumoDaFila} ativo={blocoAtivo} onEscolher={setBlocoAtivo} />

      <AccommodationsFilterBar
        filters={filters}
        onChange={patchFilters}
        onClear={clearFilters}
        opcoesDeEvento={opcoesDeEvento}
        opcoesDeFuncao={opcoesDeFuncao}
        opcoesDeColaborador={opcoesDeColaborador}
        sortConfig={sortConfig}
        onSortChange={setSortConfig}
        count={linhasVisiveis.length}
        total={teamInclusionsWithAccommodation.length}
      />

      {/* Evento encerrado: banner discreto quando o filtro aponta para um evento
          já terminado e o usuário não é o administrador. */}
      <PastEventBanner show={filters.eventId !== "all" && eventLock.isReadOnlyPastEvent(filters.eventId)} />

      <AccommodationsTable
        rows={linhasVisiveis}
        accommodationMap={accommodationMap} eventById={eventById} functionById={functionById} collaboratorById={collaboratorById}
        pendingSwapByInclusion={pendingSwapByInclusion}
        sortConfig={sortConfig} onSort={handleSort}
        selectedIds={selectedForBatch} selectableIds={selectableAtivos} allSelectableSelected={allSelectableSelected}
        onToggleRow={toggleRowSelection} onToggleAll={toggleAllSelection}
        canEdit={canEditField} onOpen={openModal}
        hasActiveFilters={hasActiveFilters} onClearFilters={clearFilters}
        total={teamInclusionsWithAccommodation.length} ordenacao={ordenacao}
      />

      <BatchSelectionBar
        selectedCount={effectiveSelectedForBatch.length}
        canEdit={canEditField}
        applying={batchApplying}
        onClear={() => setSelectedForBatch([])}
        onApply={handleApplyToSelected}
      />

      <BatchConfirmDialog
        open={showBatchConfirm}
        onOpenChange={setShowBatchConfirm}
        draft={batchDraft}
        onChange={setBatchField}
        onClearDraft={() => setBatchDraft({})}
        inclusoes={inclusoesDoLote}
        collaboratorById={collaboratorById}
        applying={batchApplying}
        onConfirm={runBatch}
      />

      <BatchResultDialog resultado={batchResult} onClose={() => setBatchResult(null)} />

      <AccommodationModal
        open={showModal} onClose={closeModal} modal={!showSuccessModal}
        inclusion={selectedInclusion} accommodation={selectedAccommodation}
        event={selectedInclusion ? eventById.get(selectedInclusion.eventId) : undefined}
        func={selectedInclusion ? functionById.get(selectedInclusion.functionId) : undefined}
        collaborator={selectedInclusion?.collaboratorId ? collaboratorById.get(selectedInclusion.collaboratorId) : undefined}
        collaboratorById={collaboratorById} users={users}
        canEditRecord={canEditRecord} isPurchasingRole={isPurchasingRole && !eventLocked} lockedForRole={lockedForRole} isPostPurchase={isPostPurchase}
        eventLocked={eventLocked} eventLockMessage={eventLock.lockReason(selectedInclusion?.eventId)}
        isSaving={createMutation.isPending || updateMutation.isPending} onSave={handleModalSave}
      />

      {/* Sucesso */}
      <AlertDialog open={showSuccessModal} onOpenChange={(open) => { if (!open) { setShowSuccessModal(false); setSuccessInfo(null); } }}>
        <AlertDialogContent className="max-w-[440px]" data-testid="dialog-accommodation-success">
          <AlertDialogHeader className="items-center text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mb-1 bg-green-100">
              <CheckCheck className="w-7 h-7 text-green-600" aria-hidden="true" />
            </div>
            <AlertDialogTitle className="text-lg font-bold text-slate-800">Sucesso</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-slate-500 text-center">{successInfo?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col items-center">
            {successInfo?.inclusionNumber != null && (
              <span className="mb-4 px-3 py-0.5 rounded-full text-sm font-bold bg-brand-soft text-primary">#{successInfo.inclusionNumber}</span>
            )}
            <div className="w-full border-t border-slate-100 mb-4" />
            <div className="w-full space-y-2">
              {[["Evento", successInfo?.eventName], ["Colaborador", successInfo?.collaboratorName], ["Função", successInfo?.functionName]].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-4 text-sm">
                  <span className="text-slate-400 font-medium shrink-0">{label}</span>
                  <span className="text-slate-700 font-semibold text-right">{value}</span>
                </div>
              ))}
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogAction className="w-full rounded-xl bg-primary hover:bg-primary-hover" data-testid="button-success-ok">OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
