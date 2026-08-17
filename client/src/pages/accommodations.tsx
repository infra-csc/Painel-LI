import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Hotel, AlertCircle, CheckCheck, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { canView, canEdit as canEditScreen } from "@/lib/permissions";
import { hasRoleIn } from "@shared/roles";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { fixEncoding } from "@/lib/utils";
import type { TeamInclusion } from "@shared/schema";
import AccommodationModal from "@/components/accommodations/accommodation-modal";
import AccommodationsTable from "@/components/accommodations/accommodations-table";
import BatchPanel from "@/components/accommodations/batch-panel";
import SummaryCards from "@/components/accommodations/summary-cards";
import { useAccommodationsData } from "@/components/accommodations/use-accommodations-data";
import {
  DEFAULT_FILTERS,
  type AccommodationDraft, type AccommodationFilters, type AccommodationPayload, type AccSortConfig, type AccSortField,
  type ApiError, type BatchDraft,
} from "@/components/accommodations/types";
import { isCheckOutAfterCheckIn, isPostPurchaseStatus, toDateInput } from "@/components/accommodations/utils";

interface SuccessInfo {
  message: string;
  inclusionNumber: number | null;
  eventName: string;
  collaboratorName: string;
  functionName: string;
}

export default function Accommodations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Estado da tela ──
  const [filters, setFilters] = useState<AccommodationFilters>(DEFAULT_FILTERS);
  const [showOnlyPendingSwaps, setShowOnlyPendingSwaps] = useState(false);
  const [sortConfig, setSortConfig] = useState<AccSortConfig | null>({ field: "id", direction: "desc" });
  const [selectedInclusion, setSelectedInclusion] = useState<TeamInclusion | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successInfo, setSuccessInfo] = useState<SuccessInfo | null>(null);
  const [batchExpanded, setBatchExpanded] = useState(false);
  const [batchDraft, setBatchDraft] = useState<BatchDraft>({});
  const [selectedForBatch, setSelectedForBatch] = useState<string[]>([]);
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const [batchApplying, setBatchApplying] = useState(false);

  // Admin ou Compras — aceita aliases legados ("administrador", "compras"...)
  const isPurchasingRole = hasRoleIn(user?.role, ["admin", "purchasing"]);
  const canEditField = canEditScreen(user, "accommodations");

  // ── Dados ──
  const {
    teamInclusions, events, functions, collaborators, tickets, users,
    isLoading, loadError,
    accommodationMap, eventById, functionById, collaboratorById,
    pendingSwapByInclusion, filteredData, pendingSwapsCount, selectableInclusionIds, counts,
  } = useAccommodationsData({ filters, sortConfig, showOnlyPendingSwaps, isPurchasingRole });

  // A seleção sobrevive à troca de filtros e a registros feitos em outra aba; o
  // contador e o botão de lote usam só o que ainda é aplicável.
  const effectiveSelectedForBatch = selectedForBatch.filter((id) => selectableInclusionIds.has(id));
  const allSelectableSelected =
    selectableInclusionIds.size > 0 && Array.from(selectableInclusionIds).every((id) => selectedForBatch.includes(id));

  // ── Handlers de filtro/ordenação/seleção ──
  const patchFilters = useCallback((patch: Partial<AccommodationFilters>) => setFilters((prev) => ({ ...prev, ...patch })), []);
  const clearFilters = () => { setFilters(DEFAULT_FILTERS); setShowOnlyPendingSwaps(false); };
  const hasActiveFilters =
    filters.eventId !== "all" || filters.functionId.length > 0 || filters.collaboratorId !== "all" ||
    filters.searchId.trim() !== "" || filters.accommodationStatus !== "all" || filters.inclusionStatus !== "active" ||
    showOnlyPendingSwaps;

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
    setSelectedForBatch(allSelectableSelected ? [] : Array.from(selectableInclusionIds));

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

  // Passo 1: valida (mesma régua do modal) e abre a confirmação.
  const handleApplyToSelected = () => {
    if (effectiveSelectedForBatch.length === 0 || batchApplying) return;
    const err = !batchDraft.hotelName || !batchDraft.hotelLocation
      ? "Preencha os campos obrigatórios: Nome do Hotel e Localização"
      : !isCheckOutAfterCheckIn(batchDraft) ? "O check-out deve ser igual ou posterior ao check-in." : null;
    if (err) { toast({ title: "Erro", description: err, variant: "destructive" }); return; }
    setShowBatchConfirm(true);
  };

  // Passo 2: registra uma a uma e invalida as queries UMA vez ao final.
  const runBatch = async () => {
    if (batchApplying) return;
    setShowBatchConfirm(false);
    setBatchApplying(true);
    let successCount = 0;
    const errors: string[] = [];
    const processedIds: string[] = [];
    try {
      for (const inclusionId of effectiveSelectedForBatch) {
        const inclusion = filteredData.find((inc) => inc.id === inclusionId);
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
      if (successCount > 0) toast({ title: "Sucesso", description: `${successCount} hospedagem(ns) registrada(s) com sucesso!` });
      if (errors.length > 0) toast({ title: "Alguns erros ocorreram", description: errors.join(" · "), variant: "destructive" });
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
      <div className="animate-pulse">
        <div className="h-8 bg-muted rounded w-1/4 mb-4" />
        <div className="h-64 bg-muted rounded" />
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
      <div className="bg-white rounded-xl border border-red-200 shadow-sm p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-7 h-7 text-red-400" />
        </div>
        <h3 className="text-[15px] font-bold text-slate-700 mb-1">
          {isAuthError ? "Sessão expirada ou sem permissão" : "Não foi possível carregar as hospedagens"}
        </h3>
        <p className="text-[13px] text-slate-400 mb-4">
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
  const canEditRecord = !!selectedInclusion && !!user && canEditField
    && selectedInclusion.status !== "cancelado" && (!isPostPurchase || isPurchasingRole);
  const lockedForRole = isPostPurchase && !isPurchasingRole && selectedInclusion?.status !== "cancelado";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-[10px] bg-primary shadow-lg shadow-blue-200 flex items-center justify-center shrink-0">
          <Hotel className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-[18px] font-bold tracking-tight text-slate-900">Hospedagens</h1>
          <p className="text-xs text-slate-400">Registre e acompanhe as hospedagens dos colaboradores escalados.</p>
        </div>
      </div>

      <SummaryCards counts={counts} activeStatus={filters.accommodationStatus} onSelectStatus={(s) => patchFilters({ accommodationStatus: s })} />

      {/* Banner: trocas pendentes aguardando análise de Compras. Com o filtro ligado
          o banner continua visível mesmo sem resultados — ele é o único controle do toggle. */}
      {isPurchasingRole && (pendingSwapsCount > 0 || showOnlyPendingSwaps) && (
        <button type="button" onClick={() => setShowOnlyPendingSwaps((v) => !v)} aria-pressed={showOnlyPendingSwaps} data-testid="banner-pending-swaps"
          className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 border text-left transition-colors ${showOnlyPendingSwaps ? "bg-amber-100 border-amber-400" : "bg-amber-50 border-amber-200 hover:bg-amber-100"}`}>
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
            <ArrowLeftRight className="w-4 h-4 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-amber-800 leading-snug">
              {pendingSwapsCount === 0 ? "Nenhuma troca pendente nos filtros atuais"
                : pendingSwapsCount === 1 ? "1 solicitação de troca de colaborador aguarda sua análise"
                : `${pendingSwapsCount} solicitações de troca de colaborador aguardam sua análise`}
            </p>
            <p className="text-[11px] text-amber-600 mt-0.5">
              {showOnlyPendingSwaps ? "Mostrando apenas linhas com troca pendente — clique para ver todas" : "Clique aqui para filtrar e ver apenas as linhas com troca pendente"}
            </p>
          </div>
          <span className="shrink-0 text-[11px] font-bold bg-amber-200 text-amber-800 px-2.5 py-1 rounded-full">
            {showOnlyPendingSwaps ? "Filtro ativo" : `${pendingSwapsCount} pendente${pendingSwapsCount !== 1 ? "s" : ""}`}
          </span>
        </button>
      )}

      <BatchPanel
        expanded={batchExpanded} onToggle={() => setBatchExpanded((v) => !v)}
        draft={batchDraft} onChange={setBatchField} onClear={() => setBatchDraft({})}
        selectedCount={effectiveSelectedForBatch.length} canEdit={canEditField} applying={batchApplying}
        onApply={handleApplyToSelected} confirmOpen={showBatchConfirm} onConfirmOpenChange={setShowBatchConfirm} onConfirm={runBatch}
      />

      <AccommodationsTable
        rows={filteredData} events={events} functions={functions} collaborators={collaborators}
        accommodationMap={accommodationMap} eventById={eventById} functionById={functionById} collaboratorById={collaboratorById}
        pendingSwapByInclusion={pendingSwapByInclusion}
        filters={filters} onFiltersChange={patchFilters} onClearFilters={clearFilters} hasActiveFilters={hasActiveFilters}
        sortConfig={sortConfig} onSort={handleSort}
        batchMode={batchExpanded} selectedIds={selectedForBatch} selectableIds={selectableInclusionIds} allSelectableSelected={allSelectableSelected}
        onToggleRow={toggleRowSelection} onToggleAll={toggleAllSelection}
        canEdit={canEditField} onOpen={openModal} counts={counts}
      />

      <AccommodationModal
        open={showModal} onClose={closeModal} modal={!showSuccessModal}
        inclusion={selectedInclusion} accommodation={selectedAccommodation}
        event={selectedInclusion ? eventById.get(selectedInclusion.eventId) : undefined}
        func={selectedInclusion ? functionById.get(selectedInclusion.functionId) : undefined}
        collaborator={selectedInclusion?.collaboratorId ? collaboratorById.get(selectedInclusion.collaboratorId) : undefined}
        collaboratorById={collaboratorById} users={users}
        canEditRecord={canEditRecord} isPurchasingRole={isPurchasingRole} lockedForRole={lockedForRole} isPostPurchase={isPostPurchase}
        isSaving={createMutation.isPending || updateMutation.isPending} onSave={handleModalSave}
      />

      {/* Sucesso */}
      <AlertDialog open={showSuccessModal} onOpenChange={(open) => { if (!open) { setShowSuccessModal(false); setSuccessInfo(null); } }}>
        <AlertDialogContent className="max-w-[440px]" data-testid="dialog-accommodation-success">
          <AlertDialogHeader className="items-center text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mb-1 bg-green-100">
              <CheckCheck className="w-7 h-7 text-green-600" />
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
