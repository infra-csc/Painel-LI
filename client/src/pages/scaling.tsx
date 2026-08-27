/**
 * Escalação — Visualização. Só composição: dados/permissões em
 * components/scaling/use-scaling-data, mutations em use-scaling-mutations,
 * modal em inclusion-details-dialog, ações em massa em bulk-confirm-bar.
 */
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { markSwapSeen, getSeenState } from "@/lib/seenSwaps";
import { User, FileSpreadsheet, Plane, Users, AlertCircle } from "lucide-react";
import UniversalFilters from "@/components/common/universal-filters";
import { type SortConfig, type SortField } from "@/components/common/sortable-header";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { canView } from "@/lib/permissions";
import { PastEventBanner } from "@/lib/event-lock";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import type { TeamInclusion, Comment } from "@shared/schema";
import ScalingTable from "@/components/scaling/scaling-table";
import ScalingTabCards from "@/components/scaling/scaling-tab-cards";
import { ProductionApprovalsBanner, PendingSwapsBanner } from "@/components/scaling/scaling-banners";
import InclusionDetailsDialog, { type DetailsTab } from "@/components/scaling/inclusion-details-dialog";
import ScalingSuccessDialog, { type ScalingSuccessInfo } from "@/components/scaling/scaling-success-dialog";
import { SentToProductionDialog, type SentToProductionInfo } from "@/components/scaling/production-approval-card";
import AttachmentLightbox from "@/components/scaling/attachment-lightbox";
import BulkConfirmBar from "@/components/scaling/bulk-confirm-bar";
import { useScalingData, useInclusionDetails, DEFAULT_SCALING_FILTERS, type ScalingFilters } from "@/components/scaling/use-scaling-data";
import { useScalingMutations, type InclusionSavePayload } from "@/components/scaling/use-scaling-mutations";
import { useAttachments } from "@/components/scaling/use-attachments";
import { exportScalingPdf, exportScalingXlsxColunas } from "@/components/scaling/export-scaling-xlsx";
import { ExportColumnsDialog, type ExportScope } from "@/components/scaling/export-columns-dialog";
import { getSaveBlockReason, getConfirmBlockReason, getBulkConfirmBlockReason } from "@/components/scaling/scaling-validation";
import { describeLoadError, isEscalated, modalDataFromInclusion, type ModalData } from "@/components/scaling/scaling-utils";

const EMPTY_MODAL: ModalData = { collaboratorId: "", observations: "", dailyValue: 0, city: "", departureFromSP: true, atendimentoTipo: "", percurseiroTipo: "" };

export default function Scaling() {
  const { user } = useAuth();
  const { toast } = useToast();

  // ── Estado da tela ──────────────────────────────────────────────────────
  const [filters, setFilters] = useState<ScalingFilters>(DEFAULT_SCALING_FILTERS);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>({ field: "id", direction: "desc" });
  const [showOnlyPendingSwaps, setShowOnlyPendingSwaps] = useState(false);
  const [scalingTab, setScalingTab] = useState<string>("without-ticket");
  const tabInitialized = useRef(false);

  // Modal de detalhes
  const [selectedInclusion, setSelectedInclusion] = useState<TeamInclusion | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalInitialTab, setModalInitialTab] = useState<DetailsTab>("resumo");
  const [modalData, setModalData] = useState<ModalData>(EMPTY_MODAL);
  const [successInfo, setSuccessInfo] = useState<ScalingSuccessInfo | null>(null);
  const [sentToProductionInfo, setSentToProductionInfo] = useState<SentToProductionInfo | null>(null);

  // Seleção múltipla (ações em massa)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // IDs de trocas pendentes já visualizadas pelo solicitante
  const readSeen = () => {
    if (!user) return new Set<string>();
    const state = getSeenState(user.id);
    return new Set(Object.entries(state).filter(([, v]: [string, any]) => v.pendingSeen).map(([k]) => k));
  };
  const [seenSwapIds, setSeenSwapIds] = useState<Set<string>>(readSeen);
  useEffect(() => {
    const handler = () => setSeenSwapIds(readSeen());
    window.addEventListener("swapSeenUpdated", handler);
    return () => window.removeEventListener("swapSeenUpdated", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ── Dados ───────────────────────────────────────────────────────────────
  const data = useScalingData({ filters, sortConfig, user });
  const {
    teamInclusions, isLoading, isErrorInclusions, inclusionsError,
    scalingInclusions, pendingSwapByInclusion,
    pendingSwapInclusionsAll, pendingSwapInclusionsInView,
    pendingProductionApprovals, pendingProductionApprovalsInView,
    canApproveProduction, canExport, isAdminOrPurchasing,
    getEventName, getFunctionName, getCollaboratorName, getCollaboratorCity,
    getTicket, getAccommodation, getPurchasedTicket, firstSwapByInclusion,
  } = data;
  const details = useInclusionDetails(selectedInclusion?.id);
  const hasActiveFilters = data.hasActiveFilters || showOnlyPendingSwaps;

  // Comentários de TODAS as inclusões — só sob demanda (Exportar)
  const { refetch: refetchAllComments } = useQuery<Comment[]>({
    queryKey: ["/api/all-comments"],
    queryFn: async () => (await apiRequest("GET", "/api/all-comments")).json(),
    enabled: false,
  });

  // ── Linhas visíveis (aba + atalho de trocas) ────────────────────────────
  const { withoutTicket, withTicket } = useMemo(() => {
    const filterSwaps = (rows: TeamInclusion[]) => showOnlyPendingSwaps ? rows.filter(i => pendingSwapByInclusion.has(i.id)) : rows;
    return {
      withoutTicket: filterSwaps(scalingInclusions.filter(i => !i.needsTicket)),
      withTicket: filterSwaps(scalingInclusions.filter(i => i.needsTicket)),
    };
  }, [scalingInclusions, showOnlyPendingSwaps, pendingSwapByInclusion]);
  const visibleRows = scalingTab === "with-ticket" ? withTicket : withoutTicket;
  const countPending = (rows: TeamInclusion[]) => rows.filter(i => !isEscalated(i) && i.status !== "cancelado").length;

  // Aba inicial assim que os dados carregam (preserva o comportamento antigo)
  useEffect(() => {
    if (tabInitialized.current) return;
    if (scalingInclusions.length > 0) {
      setScalingTab(scalingInclusions.some(i => !i.needsTicket) ? "without-ticket" : "with-ticket");
      tabInitialized.current = true;
    }
  }, [scalingInclusions]);

  // Sai do filtro caso não haja mais trocas pendentes na visão atual
  useEffect(() => {
    if (showOnlyPendingSwaps && pendingSwapInclusionsInView.length === 0) setShowOnlyPendingSwaps(false);
  }, [showOnlyPendingSwaps, pendingSwapInclusionsInView.length]);

  // Enquanto filtrando, mantém o usuário numa aba que contém a troca pendente
  useEffect(() => {
    if (!showOnlyPendingSwaps) return;
    const hasWithout = pendingSwapInclusionsInView.some(i => !i.needsTicket);
    const hasWith = pendingSwapInclusionsInView.some(i => i.needsTicket);
    if (scalingTab === "without-ticket" && !hasWithout && hasWith) setScalingTab("with-ticket");
    else if (scalingTab === "with-ticket" && !hasWith && hasWithout) setScalingTab("without-ticket");
  }, [showOnlyPendingSwaps, scalingTab, pendingSwapInclusionsInView]);

  // Seleção: descarta IDs que saíram da lista ou deixaram de ser elegíveis
  useEffect(() => {
    if (selectedIds.size === 0 || !teamInclusions) return;
    const byId = new Map(teamInclusions.map(i => [i.id, i]));
    const next = new Set(Array.from(selectedIds).filter(id => { const i = byId.get(id); return !!i && !getBulkConfirmBlockReason(i, data); }));
    if (next.size !== selectedIds.size) setSelectedIds(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamInclusions]);

  const goToPendingSwaps = () => {
    setShowOnlyPendingSwaps(true);
    const match = pendingSwapInclusionsInView[0];
    if (match) setScalingTab(match.needsTicket ? "with-ticket" : "without-ticket");
  };

  const handleSort = (field: SortField) => {
    setSortConfig(current => {
      if (current?.field === field) return current.direction === "asc" ? { field, direction: "desc" } : null;
      return { field, direction: "asc" };
    });
  };

  // ── Modal: abrir / navegar ──────────────────────────────────────────────
  const markInclusionSwapSeen = (inclusionId: string) => {
    if (!user) return;
    const swap = firstSwapByInclusion.get(inclusionId);
    if (!swap || swap.requestedBy !== user.id) return;
    if (swap.status === "pendente") markSwapSeen(user.id, swap.id, "pending");
    else if (["aprovado", "rejeitado"].includes(swap.status)) markSwapSeen(user.id, swap.id, "responded");
  };

  const openInclusion = useCallback((inclusion: TeamInclusion, tab: DetailsTab = "resumo") => {
    setSelectedInclusion(inclusion);
    setModalData(modalDataFromInclusion(inclusion));
    setModalInitialTab(tab);
    setShowModal(true);
    markInclusionSwapSeen(inclusion.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstSwapByInclusion, user?.id]);

  const handleViewComments = (e: React.MouseEvent, inclusion: TeamInclusion) => {
    e.stopPropagation();
    openInclusion(inclusion, "comentarios");
  };

  const navIndex = selectedInclusion ? visibleRows.findIndex(i => i.id === selectedInclusion.id) : -1;
  // Navegar (‹ › / atalhos) com edições não salvas pede confirmação — antes
  // descartava em silêncio (mesmo padrão do "Descartar alterações?" de Passagens).
  const modalIsDirty = !!selectedInclusion && JSON.stringify(modalData) !== JSON.stringify(modalDataFromInclusion(selectedInclusion));
  const navigate = useCallback((direction: -1 | 1) => {
    if (navIndex < 0) return;
    const next = visibleRows[navIndex + direction];
    if (!next) return;
    if (modalIsDirty && !window.confirm("Há alterações não salvas nesta escalação. Descartar e ir para a próxima?")) return;
    openInclusion(next, "resumo");
  }, [navIndex, visibleRows, openInclusion, modalIsDirty]);

  // ── Anexos / lightbox ───────────────────────────────────────────────────
  const prefetchAttachmentIds = useMemo(() => {
    if (!selectedInclusion) return [] as string[];
    return [
      ...(getAccommodation(selectedInclusion.id)?.attachmentIds || []),
      ...(getPurchasedTicket(selectedInclusion.id)?.attachmentIds || []),
    ];
  }, [selectedInclusion, getAccommodation, getPurchasedTicket]);
  const { openAttachment, lightbox, setLightbox } = useAttachments({
    prefetchIds: prefetchAttachmentIds,
    active: showModal && !!selectedInclusion,
    onBeforeOpenLightbox: () => setShowModal(false),
  });

  // ── Mutations ───────────────────────────────────────────────────────────
  const mutations = useScalingMutations({
    selectedInclusionId: selectedInclusion?.id,
    currentUserId: user?.id,
    setSelectedInclusion: (updater) => setSelectedInclusion(prev => updater(prev)),
    closeModal: () => setShowModal(false),
    onInclusionSaved: (updated, action, thenNext) => {
      const collabId = updated.collaboratorId || modalData.collaboratorId || selectedInclusion?.collaboratorId;
      const funcName = getFunctionName(updated.functionId || selectedInclusion?.functionId || null);
      const collabName = collabId ? getCollaboratorName(collabId) : "—";
      const inclusionNumber = updated.inclusionNumber ?? selectedInclusion?.inclusionNumber ?? null;
      if (thenNext) {
        // "Salvar e próxima": feedback leve e segue para a próxima da lista
        toast({ title: "Alterações salvas", description: `Escalação #${inclusionNumber ?? "—"} · ${collabName}` });
        navigate(1);
        return;
      }
      // Confirmada como cenotécnica → modal de aprovação pendente
      if (action === "confirm" && updated.status === "aguardando_producao") {
        setSentToProductionInfo({ collaboratorName: collabName, functionName: funcName, inclusionNumber });
        setShowModal(false);
        return;
      }
      setSuccessInfo({
        message: action === "confirm" ? "Escalação confirmada com sucesso!" : "Alterações salvas com sucesso!",
        inclusionNumber,
        eventName: data.eventById.get(updated.eventId || selectedInclusion?.eventId || "")?.name ?? "—",
        collaboratorName: collabName,
        functionName: funcName,
      });
      setShowModal(false);
    },
  });

  // ── Salvar / Confirmar ──────────────────────────────────────────────────
  const buildPayload = (inclusion: TeamInclusion): InclusionSavePayload => {
    const payload: InclusionSavePayload = {
      collaboratorId: modalData.collaboratorId,
      observations: modalData.observations,
      city: modalData.departureFromSP ? "São Paulo - SP" : (modalData.city || ""),
      atendimentoTipo: modalData.atendimentoTipo || null,
      percurseiroTipo: modalData.percurseiroTipo || null,
      // CRÍTICO: preservar campos de necessidade de passagem/hospedagem
      needsTicket: inclusion.needsTicket,
      needsAccommodation: inclusion.needsAccommodation,
    };
    // Só incluir dailyValue se foi especificamente editado (centavos)
    if (modalData.dailyValue && modalData.dailyValue > 0) payload.dailyValue = Math.round(modalData.dailyValue * 100);
    return payload;
  };

  const handleSave = (thenNext: boolean) => {
    if (!selectedInclusion || mutations.saveInclusion.isPending) return;
    if (getSaveBlockReason(selectedInclusion, modalData, data)) return; // botão já está desabilitado com o motivo
    mutations.saveInclusion.mutate({ id: selectedInclusion.id, data: buildPayload(selectedInclusion), action: "save", thenNext });
  };

  const handleConfirm = () => {
    if (!selectedInclusion || mutations.saveInclusion.isPending) return;
    if (getConfirmBlockReason(selectedInclusion, modalData, data)) return;
    // status/fase são decididos no servidor (POST /confirm)
    mutations.saveInclusion.mutate({ id: selectedInclusion.id, data: buildPayload(selectedInclusion), action: "confirm" });
  };

  // ── Exportar ────────────────────────────────────────────────────────────
  /** Modal de escolha de colunas (pedido do dono, 27/08) — Excel ou PDF. */
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  /** Abre o modal depois de checar permissão e se há o que exportar. */
  const abrirExportar = () => {
    if (!canExport) {
      toast({ title: "Sem permissão", description: "Somente administradores, Compras e RH/Financeiro podem exportar.", variant: "destructive" });
      return;
    }
    if (scalingInclusions.filter(i => i.status !== "cancelado" && !i.deletedAt).length === 0) {
      toast({ title: "Nada para exportar", description: "Não há escalações ativas na lista atual.", variant: "destructive" });
      return;
    }
    setExportOpen(true);
  };

  const handleExportToExcel = async (colunas?: string[], formato: "xlsx" | "pdf" = "xlsx", scope: ExportScope = "todas") => {
    // A planilha inclui CPF/telefone/nascimento — a trava fica aqui também
    if (!canExport) {
      toast({ title: "Sem permissão", description: "Somente administradores, Compras e RH/Financeiro podem exportar a planilha.", variant: "destructive" });
      return;
    }
    if (scalingInclusions.length === 0) {
      toast({ title: "Erro", description: "Não há escalações para exportar", variant: "destructive" });
      return;
    }
    // Recorte pedido no modal: a agência só quer quem voa; o hotel, quem dorme.
    const noScope = (i: TeamInclusion) =>
      scope === "transporte" ? !!i.needsTicket
      : scope === "hospedagem" ? !!i.needsAccommodation
      : scope === "sem-passagem" ? !i.needsTicket
      : true;
    const activeInclusions = scalingInclusions.filter(i => i.status !== "cancelado" && !i.deletedAt && noScope(i));
    if (activeInclusions.length === 0) {
      toast({
        title: "Nada nesse recorte",
        description: scope === "todas"
          ? "Não há escalações ativas para exportar."
          : "Nenhuma escalação ativa se encaixa no recorte escolhido — troque em “Quais linhas”.",
        variant: "destructive",
      });
      return;
    }
    const [{ data: freshComments, isError: commentsFailed }, { data: freshUsers }] = await Promise.all([
      refetchAllComments(),
      details.refetchUsers(),
    ]);
    if (commentsFailed) {
      toast({
        title: "Comentários indisponíveis",
        description: "Não foi possível carregar os comentários; a planilha será gerada sem essa coluna preenchida.",
        variant: "destructive",
      });
    }
    const entrada = {
      inclusions: activeInclusions,
      eventById: data.eventById,
      functionById: data.functionById,
      collaboratorById: data.collaboratorById,
      ticketByInclusion: data.ticketByInclusion,
      purchasedTicketByInclusion: data.purchasedTicketByInclusion,
      comments: freshComments || [],
      users: freshUsers || [],
    };
    if (formato === "pdf") {
      const { rowCount, opened } = exportScalingPdf(entrada, colunas);
      if (!opened) {
        toast({
          title: "O navegador bloqueou a janela",
          description: "Libere pop-ups para este site e tente de novo — o PDF sai pela janela de impressão.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "PDF pronto para salvar", description: `${rowCount} escalação(ões) na janela de impressão — escolha “Salvar como PDF”.` });
      return;
    }
    const { fileName, rowCount } = exportScalingXlsxColunas(entrada, colunas);
    toast({ title: "Sucesso", description: `Arquivo ${fileName} exportado com ${rowCount} escalações ativas!` });
  };

  // ── Seleção múltipla ────────────────────────────────────────────────────
  // Motivo de bloqueio por linha, memoizado (conflito de datas varre a lista inteira)
  const bulkBlockReasonById = useMemo(
    () => new Map(scalingInclusions.map(i => [i.id, getBulkConfirmBlockReason(i, data)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scalingInclusions, teamInclusions, data.functionById, data.eventById, data.collaboratorById, data.userFunctionIds, user?.id, user?.role],
  );
  const getSelectBlockReason = (inclusion: TeamInclusion) => bulkBlockReasonById.get(inclusion.id) ?? getBulkConfirmBlockReason(inclusion, data);
  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAllVisible = (ids: string[], select: boolean) => setSelectedIds(prev => {
    const next = new Set(prev);
    ids.forEach(id => { if (select) next.add(id); else next.delete(id); });
    return next;
  });
  const selectedInclusions = useMemo(
    () => (teamInclusions || []).filter(i => selectedIds.has(i.id)),
    [teamInclusions, selectedIds],
  );

  // Permissão de acesso à tela — depois de todos os hooks
  const canViewScaling = canView(user, "scaling");
  if (!canViewScaling) {
    return (
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Acesso Negado</h3>
        <p className="text-muted-foreground">Você não tem permissão para acessar esta tela.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-card rounded-lg shadow-sm border border-border p-6 animate-pulse">
        <div className="h-8 bg-muted rounded mb-4 w-1/3"></div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (<div key={i} className="h-12 bg-muted rounded"></div>))}
        </div>
      </div>
    );
  }

  const tableProps = {
    sortConfig,
    onSort: handleSort,
    onRowClick: (i: TeamInclusion) => openInclusion(i, "resumo"),
    onViewComments: handleViewComments,
    getFunctionName, getEventName, getCollaboratorName, getCollaboratorCity, getTicket, getAccommodation,
    pendingSwapByInclusion,
    // Selo "Em aprovação de ajuste" na linha (regra do dono, 26/08).
    pendingChangeByInclusion: data.pendingChangeByInclusion,
    approvedSwapInclusionIds: data.approvedSwapInclusionIds,
    seenSwapIds,
    currentUserId: user?.id,
    isAdminOrPurchasing,
    selectedIds,
    getSelectBlockReason,
    onToggleSelect: toggleSelect,
    onToggleAllVisible: toggleAllVisible,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-5">
        <div className="w-14 h-14 bg-[#0033CC] rounded-3xl flex items-center justify-center text-white shadow-xl shadow-blue-900/20 shrink-0">
          <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>conveyor_belt</span>
        </div>
        <div>
          <h2 className="text-[28px] font-bold tracking-tight text-slate-900 leading-tight">Escalação - Visualização</h2>
          <p className="text-sm text-slate-500 font-medium mt-0.5">Lista de escalações com informações detalhadas</p>
        </div>
      </div>

      {/* Evento encerrado: banner discreto quando o filtro aponta para um evento
          já terminado e o usuário não é o administrador (as ações da
          tela já vêm desabilitadas com o motivo no tooltip). */}
      <PastEventBanner show={filters.eventId !== "all" && !data.podeAgirEmEventoPassado && data.isPastEvent(filters.eventId)} />

      {canApproveProduction && (
        <ProductionApprovalsBanner pending={pendingProductionApprovals} inView={pendingProductionApprovalsInView} hasActiveFilters={hasActiveFilters} />
      )}

      <UniversalFilters
        filters={filters}
        onFiltersChange={setFilters}
        hideStatusFilter={true}
        showTicketFilter={true}
        showAccommodationFilter={true}
        rightActions={canExport ? (
          <Button
            onClick={abrirExportar}
            variant="outline"
            className="flex items-center gap-2 border border-green-200 text-green-600 bg-green-50 hover:bg-green-100 rounded-xl px-3 h-10 text-sm font-medium transition-colors whitespace-nowrap"
            data-testid="button-export-excel"
            title="Escolha as colunas e o formato (Excel ou PDF). O arquivo pode conter dados pessoais dos colaboradores."
          >
            <FileSpreadsheet className="w-4 h-4" />
            Exportar
          </Button>
        ) : undefined}
      />

      {isErrorInclusions && !teamInclusions ? (
        /* Falha de rede/sessão NÃO pode virar "nenhum dado" */
        <div className="bg-white rounded-2xl border border-red-200 p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7 text-red-400" />
          </div>
          <h3 className="text-[15px] font-bold text-slate-700 mb-1">Não foi possível carregar as escalações</h3>
          <p className="text-[13px] text-slate-500">{describeLoadError(inclusionsError)}</p>
        </div>
      ) : scalingInclusions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <Users className="w-7 h-7 text-slate-300" />
          </div>
          <h3 className="text-[15px] font-bold text-slate-600 mb-1">Nenhuma escalação encontrada</h3>
          <p className="text-[13px] text-slate-400">Não há registros de escalação para exibir com os filtros atuais.</p>
        </div>
      ) : (
        <Tabs value={scalingTab} onValueChange={setScalingTab} className="w-full">
          <PendingSwapsBanner
            all={pendingSwapInclusionsAll}
            inView={pendingSwapInclusionsInView}
            hasActiveFilters={hasActiveFilters}
            showOnlyPendingSwaps={showOnlyPendingSwaps}
            onShow={goToPendingSwaps}
            onClear={() => setShowOnlyPendingSwaps(false)}
          />
          <ScalingTabCards
            withoutCount={withoutTicket.length}
            withoutPending={countPending(withoutTicket)}
            withCount={withTicket.length}
            withPending={countPending(withTicket)}
          />

          <TabsContent value="without-ticket" className="mt-0">
            {withoutTicket.length === 0 ? (
              <div className="p-12 text-center">
                <User className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">Nenhuma escalação sem passagem</h3>
                <p className="text-muted-foreground">Não há registros de escalações que não necessitam de passagens.</p>
              </div>
            ) : (
              <ScalingTable rows={withoutTicket} {...tableProps} />
            )}
          </TabsContent>

          <TabsContent value="with-ticket" className="mt-0">
            {withTicket.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-10 text-center mt-4">
                <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center mx-auto mb-3">
                  <Plane className="w-6 h-6 text-green-300" />
                </div>
                <h3 className="text-[14px] font-bold text-slate-500 mb-1">Nenhuma escalação com passagem</h3>
                <p className="text-[12px] text-slate-400">Não há escalações que necessitam de passagens nos filtros atuais.</p>
              </div>
            ) : (
              <ScalingTable rows={withTicket} {...tableProps} />
            )}
          </TabsContent>

          <BulkConfirmBar
            selected={selectedInclusions}
            onClear={() => setSelectedIds(new Set())}
            getEventName={getEventName}
            getFunctionName={getFunctionName}
            getCollaboratorName={getCollaboratorName}
            onDone={(results) => {
              const okIds = new Set(results.filter(r => r.ok).map(r => r.inclusion.id));
              setSelectedIds(prev => new Set(Array.from(prev).filter(id => !okIds.has(id))));
              queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
            }}
          />
        </Tabs>
      )}

      <InclusionDetailsDialog
        open={showModal}
        onOpenChange={setShowModal}
        modal={!successInfo}
        inclusion={selectedInclusion}
        initialTab={modalInitialTab}
        modalData={modalData}
        setModalData={setModalData}
        data={data}
        details={details}
        mutations={mutations}
        user={user}
        openAttachment={openAttachment}
        navIndex={navIndex}
        navTotal={visibleRows.length}
        onNavigate={navigate}
        onSave={handleSave}
        onConfirm={handleConfirm}
      />

      <ExportColumnsDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        exporting={exporting}
        onExport={async (colunas, formato, scope) => {
          setExporting(true);
          try { await handleExportToExcel(colunas, formato, scope); setExportOpen(false); }
          finally { setExporting(false); }
        }}
      />
      <ScalingSuccessDialog info={successInfo} onClose={() => setSuccessInfo(null)} />
      <SentToProductionDialog info={sentToProductionInfo} onClose={() => setSentToProductionInfo(null)} />
      <AttachmentLightbox item={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}
