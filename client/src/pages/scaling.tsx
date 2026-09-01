/**
 * Escalação — redesenho de 01/09.
 *
 * A tela é uma **fila de trabalho**, não um relatório. O que saiu e por quê:
 *
 * - O cabeçalho de 76px ("Escalação - Visualização" + "Lista de escalações com
 *   informações detalhadas" + um ícone num quadrado azul com sombra) dizia o
 *   que o breadcrumb já dizia. Virou uma barra de contexto de 56px que carrega
 *   o resumo real do recorte e o seletor de aba.
 * - Quatro faixas empurravam a primeira linha para depois de ~460px em 1080p.
 *   Os dois banners viraram a fila de trabalho, que conta E filtra.
 * - Nenhuma funcionalidade saiu: exportar, seleção em massa, trocas, pedidos
 *   de ajuste, evento encerrado e o modal continuam onde estavam.
 *
 * Só composição: dados e permissões em use-scaling-data, mutations em
 * use-scaling-mutations, o modal em inclusion-details-dialog, os números das
 * Análises em scaling-analytics-data.
 */
import { useState, useMemo, useEffect, useCallback } from "react";
import { markSwapSeen, getSeenState } from "@/lib/seenSwaps";
import { AlertTriangle, CloudOff, Download, FilterX, List, Lock, TrendingUp, Users } from "lucide-react";
import { type SortConfig, type SortField } from "@/components/common/sortable-header";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { canView } from "@/lib/permissions";
import { PastEventBanner } from "@/lib/event-lock";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import type { TeamInclusion, Comment } from "@shared/schema";
import ScalingTable from "@/components/scaling/scaling-table";
import ScalingWorkQueue from "@/components/scaling/scaling-work-queue";
import ScalingFilterBar from "@/components/scaling/scaling-filter-bar";
import ScalingAnalytics from "@/components/scaling/scaling-analytics";
import InclusionDetailsDialog, { type DetailsTab } from "@/components/scaling/inclusion-details-dialog";
import ScalingSuccessDialog, { type ScalingSuccessInfo } from "@/components/scaling/scaling-success-dialog";
import { SentToProductionDialog, type SentToProductionInfo } from "@/components/scaling/production-approval-card";
import AttachmentLightbox from "@/components/scaling/attachment-lightbox";
import ConfirmDialog from "@/components/scaling/confirm-dialog";
import BulkConfirmBar from "@/components/scaling/bulk-confirm-bar";
import { useScalingData, useInclusionDetails, DEFAULT_SCALING_FILTERS, type ScalingFilters } from "@/components/scaling/use-scaling-data";
import { useScalingMutations, type InclusionSavePayload } from "@/components/scaling/use-scaling-mutations";
import { useAttachments } from "@/components/scaling/use-attachments";
import { exportScalingPdf, exportScalingXlsxColunas } from "@/components/scaling/export-scaling-xlsx";
import { ExportColumnsDialog, type ExportScope } from "@/components/scaling/export-columns-dialog";
import { getSaveBlockReason, getConfirmBlockReason, getBulkConfirmBlockReason } from "@/components/scaling/scaling-validation";
import { describeLoadError, modalDataFromInclusion, type ModalData } from "@/components/scaling/scaling-utils";
import { DEFAULT_PERIOD, fazTesteDePeriodo, temRecorteDePeriodo, type PeriodConfig } from "@/components/scaling/scaling-period";
import { ordenarEscalacoes } from "@/components/scaling/scaling-sort";
import { getScalingStatusLabel } from "@/components/scaling/scaling-status";
import {
  FLAG_GROUPS, contarFlagsAtivas, fazTesteDeFlags, normalizarBusca, testeDaFila,
  QUEUE_META, type QueueContext, type QueueKey,
} from "@/components/scaling/scaling-queue";
import type { AnalyticsContext } from "@/components/scaling/scaling-analytics-data";

const EMPTY_MODAL: ModalData = { collaboratorId: "", observations: "", dailyValue: 0, city: "", departureFromSP: true, atendimentoTipo: "", percurseiroTipo: "" };

/** Um estado vazio da página, sempre com a causa e o que fazer a seguir. */
function EstadoVazio({ icone, titulo, texto, acao }: {
  icone: React.ReactNode; titulo: string; texto: string; acao?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-card px-8 py-11 text-center">
      <div className="flex justify-center text-slate-400" aria-hidden="true">{icone}</div>
      <p className="mt-2.5 text-[15px] font-semibold text-slate-900">{titulo}</p>
      <p className="mx-auto mt-1.5 max-w-[440px] text-[13px] leading-relaxed text-muted-foreground">{texto}</p>
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  );
}

export default function Scaling() {
  const { user } = useAuth();
  const { toast } = useToast();

  // ── Estado da tela ──────────────────────────────────────────────────────
  // Nada disso vai para o localStorage, e a decisão é deliberada: filtro
  // persistido faz o usuário abrir a tela filtrado sem perceber. A ABA também
  // não persiste — quem abre a Escalação vem trabalhar na fila.
  const [aba, setAba] = useState<"fila" | "analises">("fila");
  const [fila, setFila] = useState<QueueKey | null>(null);
  const [busca, setBusca] = useState("");
  const [eventos, setEventos] = useState<Record<string, boolean>>({});
  const [periodo, setPeriodo] = useState<PeriodConfig>(DEFAULT_PERIOD);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [verExcluidos, setVerExcluidos] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>({ field: "id", direction: "desc" });

  // Modal de detalhes
  const [selectedInclusion, setSelectedInclusion] = useState<TeamInclusion | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalInitialTab, setModalInitialTab] = useState<DetailsTab>("resumo");
  const [modalData, setModalData] = useState<ModalData>(EMPTY_MODAL);
  const [abrirEscolhaDeColaborador, setAbrirEscolhaDeColaborador] = useState(false);
  const [successInfo, setSuccessInfo] = useState<ScalingSuccessInfo | null>(null);
  const [sentToProductionInfo, setSentToProductionInfo] = useState<SentToProductionInfo | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  /** Direção da navegação que espera a confirmação de descarte. */
  const [descartePendente, setDescartePendente] = useState<-1 | 1 | null>(null);

  /**
   * "Hoje" de verdade: esta tela fica aberta na mesa de alguém por dias, e um
   * `new Date()` congelado na montagem manteria "faltam 3 dias" na terça
   * seguinte. O relógio só dispara re-render quando o DIA vira — não de minuto
   * em minuto.
   */
  const [hoje, setHoje] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => {
      setHoje((atual) => (atual.toDateString() === new Date().toDateString() ? atual : new Date()));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

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
  // O hook recebe só o que muda a CONSULTA (excluídas) e o recorte de evento;
  // busca, período, grupos e fila são aplicados aqui, porque os contadores do
  // popover precisam das listas intermediárias.
  const eventosMarcados = useMemo(() => Object.keys(eventos).filter((k) => eventos[k]), [eventos]);
  const hookFilters = useMemo<ScalingFilters>(
    () => ({ ...DEFAULT_SCALING_FILTERS, eventId: eventosMarcados, showDeleted: verExcluidos }),
    [eventosMarcados, verExcluidos],
  );
  // O hook recebe sortConfig NULO de propósito: ordenar é a última etapa,
  // aplicada aqui sobre a lista já recortada. Deixá-la no hook fazia cada
  // clique num cabeçalho invalidar as camadas de filtro e os contadores da
  // fila — que não dependem da ordem — e a tela congelava ~1,8s por clique.
  const data = useScalingData({ filters: hookFilters, sortConfig: null, user });
  const {
    teamInclusions, isLoading, isErrorInclusions, inclusionsError,
    scalingInclusions, pendingSwapByInclusion, canApproveProduction, canExport, isAdminOrPurchasing,
    getEventName, getFunctionName, getCollaboratorName, getCollaboratorCity,
    getTicket, getAccommodation, getPurchasedTicket, firstSwapByInclusion,
  } = data;
  const details = useInclusionDetails(selectedInclusion?.id);

  // Comentários de TODAS as inclusões — só sob demanda (Exportar)
  const { refetch: refetchAllComments } = useQuery<Comment[]>({
    queryKey: ["/api/all-comments"],
    queryFn: async () => (await apiRequest("GET", "/api/all-comments")).json(),
    enabled: false,
  });

  // ── Contexto compartilhado pela fila, pelos filtros e pelas Análises ─────
  /**
   * Motivo de bloqueio por linha, memoizado.
   *
   * Depende de `filteredTeamInclusions` (o recorte de permissão) e NÃO da
   * lista já ordenada: ordenar não muda quem pode ser confirmado, e usar a
   * lista ordenada fazia este mapa — 3.700 avaliações que varrem conflito de
   * agenda — ser refeito a cada clique num cabeçalho de coluna.
   */
  const bulkBlockReasonById = useMemo(
    () => new Map(data.filteredTeamInclusions.map(i => [i.id, getBulkConfirmBlockReason(i, data)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.filteredTeamInclusions, teamInclusions, data.functionById, data.eventById, data.collaboratorById, data.userFunctionIds, user?.id, user?.role],
  );
  const getSelectBlockReason = useCallback(
    (inclusion: TeamInclusion) => bulkBlockReasonById.get(inclusion.id) ?? getBulkConfirmBlockReason(inclusion, data),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bulkBlockReasonById],
  );

  const queueContext = useMemo<QueueContext>(() => ({
    temNome: (i) => !!i.collaboratorId,
    temTroca: (i) => pendingSwapByInclusion.has(i.id),
    temPedido: (i) => !!data.pendingChangeByInclusion?.get(i.id),
    bloqueioParaConfirmar: getSelectBlockReason,
    temPassagemComprada: (i) => data.purchasedTicketByInclusion.has(i.id),
    temHospedagemReservada: (i) => data.accommodationByInclusion.has(i.id),
    ehCenoEmpreita: (i) => data.isCenotecnicaFunction(i.functionId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [pendingSwapByInclusion, data.pendingChangeByInclusion, data.purchasedTicketByInclusion, data.accommodationByInclusion, getSelectBlockReason]);

  const analyticsContext = useMemo<AnalyticsContext>(() => ({
    temNome: queueContext.temNome,
    temTroca: queueContext.temTroca,
    temPedido: queueContext.temPedido,
    getEventName, getFunctionName, getCollaboratorName,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [queueContext, data.eventById, data.functionById, data.collaboratorById]);

  // ── As camadas do recorte ───────────────────────────────────────────────
  // Cada uma serve de base ao contador do filtro seguinte: o número ao lado de
  // uma opção responde "quantas sobram se eu marcar ISTO mantendo o resto".
  const testePeriodo = useMemo(() => fazTesteDePeriodo(periodo, hoje), [periodo, hoje]);
  const comPeriodo = useMemo(() => scalingInclusions.filter(testePeriodo), [scalingInclusions, testePeriodo]);

  const comBusca = useMemo(() => {
    const q = normalizarBusca(busca.replace(/#/g, ""));
    if (!q) return comPeriodo;
    return comPeriodo.filter((i) =>
      String(i.inclusionNumber ?? "").includes(q) ||
      normalizarBusca(getCollaboratorName(i.collaboratorId)).includes(q) ||
      normalizarBusca(getFunctionName(i.functionId)).includes(q) ||
      normalizarBusca(getEventName(i.eventId)).includes(q) ||
      normalizarBusca(i.city ?? getCollaboratorCity(i.collaboratorId) ?? "").includes(q),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comPeriodo, busca, data.collaboratorById, data.functionById, data.eventById]);

  const testeFlags = useMemo(() => fazTesteDeFlags(flags, queueContext), [flags, queueContext]);
  const comFlags = useMemo(() => comBusca.filter(testeFlags), [comBusca, testeFlags]);

  const contagensDaFila = useMemo(() => {
    const out = {} as Record<QueueKey, number>;
    // A fila conta sobre o recorte de evento/período/excluídas — não sobre a
    // busca nem sobre os grupos: ela precisa dizer quanto trabalho EXISTE,
    // não quanto sobrou do filtro que você acabou de montar.
    for (const { key } of QUEUE_META) out[key] = comPeriodo.filter(testeDaFila(key, queueContext)).length;
    return out;
  }, [comPeriodo, queueContext]);

  const daFila = useMemo(
    () => (fila ? comFlags.filter(testeDaFila(fila, queueContext)) : comFlags),
    [comFlags, fila, queueContext],
  );

  const visibleRows = useMemo(
    () => ordenarEscalacoes(daFila, sortConfig, {
      getEventName, getFunctionName, getCollaboratorName, getScalingStatusLabel,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [daFila, sortConfig, data.eventById, data.functionById, data.collaboratorById],
  );

  const opcoesDeEvento = useMemo(() => {
    const conta = new Map<string, number>();
    for (const i of data.filteredTeamInclusions) {
      if (!verExcluidos && (i.status === "cancelado" || i.deletedAt)) continue;
      conta.set(i.eventId, (conta.get(i.eventId) ?? 0) + 1);
    }
    return Array.from(conta.entries()).map(([id, n]) => ({ id, nome: getEventName(id), n }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.filteredTeamInclusions, verExcluidos, data.eventById]);

  const temRecorte = eventosMarcados.length > 0 || temRecorteDePeriodo(periodo) || contarFlagsAtivas(flags) > 0 || busca.trim() !== "" || !!fila;

  // Seleção: descarta IDs que saíram da lista ou deixaram de ser elegíveis
  useEffect(() => {
    if (selectedIds.size === 0 || !teamInclusions) return;
    const byId = new Map(teamInclusions.map(i => [i.id, i]));
    const next = new Set(Array.from(selectedIds).filter(id => { const i = byId.get(id); return !!i && !getBulkConfirmBlockReason(i, data); }));
    if (next.size !== selectedIds.size) setSelectedIds(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamInclusions]);

  const handleSort = (field: SortField) => {
    setSortConfig(current => {
      if (current?.field === field) return current.direction === "asc" ? { field, direction: "desc" } : null;
      return { field, direction: "asc" };
    });
  };

  const limpaFiltros = () => {
    setBusca(""); setEventos({}); setPeriodo(DEFAULT_PERIOD); setFlags({}); setFila(null);
  };

  // ── Modal: abrir / navegar ──────────────────────────────────────────────
  const markInclusionSwapSeen = (inclusionId: string) => {
    if (!user) return;
    const swap = firstSwapByInclusion.get(inclusionId);
    if (!swap || swap.requestedBy !== user.id) return;
    if (swap.status === "pendente") markSwapSeen(user.id, swap.id, "pending");
    else if (["aprovado", "rejeitado"].includes(swap.status)) markSwapSeen(user.id, swap.id, "responded");
  };

  const openInclusion = useCallback((inclusion: TeamInclusion, tab: DetailsTab = "resumo", escolherColaborador = false) => {
    setSelectedInclusion(inclusion);
    setModalData(modalDataFromInclusion(inclusion));
    setModalInitialTab(tab);
    setAbrirEscolhaDeColaborador(escolherColaborador);
    setShowModal(true);
    markInclusionSwapSeen(inclusion.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstSwapByInclusion, user?.id]);

  const handleViewComments = (e: React.MouseEvent, inclusion: TeamInclusion) => {
    e.stopPropagation();
    openInclusion(inclusion, "comentarios");
  };

  /** "Escalar alguém" na linha: abre o modal já com a escolha do nome aberta. */
  const handleEscalar = (e: React.MouseEvent, inclusion: TeamInclusion) => {
    e.stopPropagation();
    openInclusion(inclusion, "resumo", true);
  };

  const navIndex = selectedInclusion ? visibleRows.findIndex(i => i.id === selectedInclusion.id) : -1;
  const modalIsDirty = !!selectedInclusion && JSON.stringify(modalData) !== JSON.stringify(modalDataFromInclusion(selectedInclusion));
  const navigate = useCallback((direction: -1 | 1) => {
    if (navIndex < 0) return;
    const next = visibleRows[navIndex + direction];
    if (!next) return;
    // window.confirm() aparece fora da janela, com a cara do navegador e sem
    // dizer o que se perde. Perguntar sobre trabalho não salvo merece a mesma
    // linguagem do resto da tela.
    if (modalIsDirty) { setDescartePendente(direction); return; }
    openInclusion(next, "resumo");
  }, [navIndex, visibleRows, openInclusion, modalIsDirty]);

  const confirmarDescarte = () => {
    const direcao = descartePendente;
    setDescartePendente(null);
    if (direcao === null || navIndex < 0) return;
    const next = visibleRows[navIndex + direcao];
    if (next) openInclusion(next, "resumo");
  };

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
        toast({ title: "Alterações salvas", description: `Escalação #${inclusionNumber ?? "—"} · ${collabName}` });
        navigate(1);
        return;
      }
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
    if (modalData.dailyValue && modalData.dailyValue > 0) payload.dailyValue = Math.round(modalData.dailyValue * 100);
    return payload;
  };

  const handleSave = (thenNext: boolean) => {
    if (!selectedInclusion || mutations.saveInclusion.isPending) return;
    if (getSaveBlockReason(selectedInclusion, modalData, data)) return;
    mutations.saveInclusion.mutate({ id: selectedInclusion.id, data: buildPayload(selectedInclusion), action: "save", thenNext });
  };

  const handleConfirm = () => {
    if (!selectedInclusion || mutations.saveInclusion.isPending) return;
    if (getConfirmBlockReason(selectedInclusion, modalData, data)) return;
    // status/fase são decididos no servidor (POST /confirm)
    mutations.saveInclusion.mutate({ id: selectedInclusion.id, data: buildPayload(selectedInclusion), action: "confirm" });
  };

  // ── Exportar ────────────────────────────────────────────────────────────
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const abrirExportar = () => {
    if (!canExport) {
      toast({ title: "Sem permissão", description: "Somente administradores, Compras e RH/Financeiro podem exportar.", variant: "destructive" });
      return;
    }
    if (visibleRows.filter(i => i.status !== "cancelado" && !i.deletedAt).length === 0) {
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
    if (visibleRows.length === 0) {
      toast({ title: "Erro", description: "Não há escalações para exportar", variant: "destructive" });
      return;
    }
    const noScope = (i: TeamInclusion) =>
      scope === "transporte" ? !!i.needsTicket
      : scope === "hospedagem" ? !!i.needsAccommodation
      : scope === "sem-passagem" ? !i.needsTicket
      : true;
    const activeInclusions = visibleRows.filter(i => i.status !== "cancelado" && !i.deletedAt && noScope(i));
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
    const { fileName, rowCount } = await exportScalingXlsxColunas(entrada, colunas);
    toast({ title: "Sucesso", description: `Arquivo ${fileName} exportado com ${rowCount} escalações ativas!` });
  };

  // ── Seleção múltipla ────────────────────────────────────────────────────
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
  if (!canView(user, "scaling")) {
    return (
      <div className="rounded-xl border border-border bg-card px-8 py-12 text-center">
        <div className="flex justify-center text-slate-400" aria-hidden="true"><Lock className="w-7 h-7" /></div>
        <p className="mt-3 text-[16px] font-semibold text-slate-900">Acesso negado</p>
        <p className="mx-auto mt-1.5 max-w-[440px] text-[13px] leading-relaxed text-muted-foreground">
          Seu papel não tem permissão para abrir a Escalação. Se você precisa desta tela para trabalhar,
          peça acesso ao administrador do painel.
        </p>
      </div>
    );
  }

  const eventoEncerrado = eventosMarcados.length === 1 && !data.podeAgirEmEventoPassado && data.isPastEvent(eventosMarcados[0]);
  const somenteLeitura = eventoEncerrado;

  // O resumo do topo e a contagem da barra falam do MESMO universo (o recorte
  // de evento, período e excluídas). Contar vivas aqui e todas ali punha dois
  // números diferentes na mesma tela para o mesmo recorte.
  const resumoTopo = (() => {
    if (comPeriodo.length === 0) return "nenhuma vaga no recorte";
    const semNome = comPeriodo.filter(i => !i.collaboratorId && i.status !== "cancelado").length;
    const nEventos = new Set(comPeriodo.map(i => i.eventId)).size;
    return [
      `${comPeriodo.length} ${comPeriodo.length === 1 ? "vaga" : "vagas"} em ${nEventos} ${nEventos === 1 ? "evento" : "eventos"}`,
      semNome > 0 ? `${semNome} sem nome` : null,
    ].filter(Boolean).join(" · ");
  })();

  const contagem = temRecorte && visibleRows.length !== comPeriodo.length
    ? `${visibleRows.length} de ${comPeriodo.length} vagas`
    : `${visibleRows.length} ${visibleRows.length === 1 ? "vaga" : "vagas"}`;

  const nomesDosFiltrosAtivos = [
    busca.trim() ? `“${busca.trim()}”` : null,
    eventosMarcados.length ? `${eventosMarcados.length} ${eventosMarcados.length === 1 ? "evento" : "eventos"}` : null,
    temRecorteDePeriodo(periodo) ? "período" : null,
    contarFlagsAtivas(flags) ? FLAG_GROUPS.flatMap(g => g.opcoes).filter(o => flags[o.key]).map(o => o.label).join(", ") : null,
    fila ? QUEUE_META.find(q => q.key === fila)?.label.toLowerCase() ?? null : null,
  ].filter(Boolean).join(" · ");

  const tableProps = {
    sortConfig,
    onSort: handleSort,
    onRowClick: (i: TeamInclusion) => openInclusion(i, "resumo"),
    onViewComments: handleViewComments,
    onEscalar: handleEscalar,
    getFunctionName, getEventName, getCollaboratorName, getCollaboratorCity, getTicket, getAccommodation,
    pendingSwapByInclusion,
    pendingChangeByInclusion: data.pendingChangeByInclusion,
    approvedSwapInclusionIds: data.approvedSwapInclusionIds,
    seenSwapIds,
    currentUserId: user?.id,
    isAdminOrPurchasing,
    canManageFunction: data.canManageFunction,
    canApproveProduction,
    isEventLocked: data.isEventLocked,
    commentCountByInclusion: data.commentCountByInclusion,
    getResponsavelDaFuncao: data.getResponsavelDaFuncao,
    temPassagemComprada: queueContext.temPassagemComprada,
    readOnly: somenteLeitura,
    selectedIds,
    getSelectBlockReason,
    onToggleSelect: toggleSelect,
    onToggleAllVisible: toggleAllVisible,
  };

  return (
    <div className="-mx-6 -mt-6">
      {/* Barra de contexto: 56px no lugar dos 76px de cabeçalho que repetiam o
          que o breadcrumb já dizia. Aqui mora o resumo REAL do recorte. */}
      <div className="sticky top-0 z-25 flex items-center gap-4 h-14 px-6 bg-card border-b border-border">
        <span className="text-[15px] font-semibold text-slate-900 whitespace-nowrap">Escalação</span>
        <div aria-hidden="true" className="w-px h-5 bg-border" />
        <span className="min-w-0 text-[12px] text-muted-foreground truncate" data-testid="resumo-topo">{resumoTopo}</span>

        <div role="tablist" aria-label="Modo da tela" className="inline-flex gap-0.5 p-[3px] rounded-[9px] border border-border bg-background shrink-0">
          {([["fila", "Fila de trabalho", List], ["analises", "Análises", TrendingUp]] as const).map(([k, label, Icone]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={aba === k}
              onClick={() => setAba(k)}
              data-testid={`aba-${k}`}
              className={`inline-flex items-center gap-1.5 h-7 px-[11px] rounded-md text-[13px] whitespace-nowrap transition-colors ${
                aba === k
                  ? "bg-card border border-border shadow-[0_1px_2px_rgba(2,8,23,.06)] text-primary font-semibold"
                  : "border border-transparent text-muted-foreground font-medium hover:text-primary"
              }`}
            >
              <Icone className="w-[15px] h-[15px]" aria-hidden="true" />{label}
            </button>
          ))}
        </div>

        {canExport && (
          <button
            type="button"
            onClick={abrirExportar}
            title="Escolha as colunas e o formato (Excel ou PDF). O arquivo pode conter dados pessoais dos colaboradores."
            data-testid="button-export-excel"
            className="ml-auto inline-flex items-center gap-1.5 h-[34px] px-3 rounded-lg bg-primary text-[13px] font-medium text-white hover:bg-primary-hover shrink-0"
          >
            <Download className="w-4 h-4" aria-hidden="true" /> Exportar
          </button>
        )}
      </div>

      <main className="px-6 pt-5">
        <div className="flex flex-col gap-4 max-w-[1560px] mx-auto">
          <PastEventBanner show={eventoEncerrado} />

          {isErrorInclusions && !teamInclusions ? (
            <EstadoVazio
              icone={<CloudOff className="w-7 h-7" />}
              titulo="Não foi possível carregar as escalações"
              texto={`${describeLoadError(inclusionsError)} Nada do que você escalou foi perdido.`}
            />
          ) : isLoading ? (
            <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando escalações">
              <div className="h-[84px] rounded-xl border border-border bg-card animate-pulse" />
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="h-[34px] bg-background border-b border-border" />
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-[52px] border-b border-slate-100 animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
                ))}
              </div>
            </div>
          ) : aba === "analises" ? (
            <ScalingAnalytics
              linhas={comPeriodo}
              ctx={analyticsContext}
              hoje={hoje}
              onVerVagasDoEvento={(eventId) => {
                // Mantém o período e limpa o resto: "ver as vagas deste evento"
                // não pode cair numa lista ainda filtrada por outra coisa.
                setEventos({ [eventId]: true });
                setFlags({}); setFila(null); setBusca(""); setAba("fila");
              }}
              onVerFuncao={(nome) => { setFila("escalar"); setFlags({}); setBusca(nome); setAba("fila"); }}
              onAbrirLinha={(i) => { setAba("fila"); openInclusion(i, "resumo"); }}
            />
          ) : (
            <>
              <ScalingWorkQueue contagens={contagensDaFila} ativa={fila} onEscolher={setFila} />

              <ScalingFilterBar
                busca={busca} onBusca={setBusca}
                eventos={eventos} onEventos={setEventos} opcoesDeEvento={opcoesDeEvento}
                periodo={periodo} onPeriodo={setPeriodo} linhasSemPeriodo={scalingInclusions} hoje={hoje}
                flags={flags} onFlags={setFlags} linhasSemFlags={comBusca} queueContext={queueContext}
                verExcluidos={verExcluidos} onVerExcluidos={setVerExcluidos}
                contagem={contagem}
              />

              {scalingInclusions.length === 0 && !temRecorte ? (
                <EstadoVazio
                  icone={<Users className="w-7 h-7" />}
                  titulo="Nenhuma vaga para escalar"
                  texto="As vagas chegam da Inclusão de Equipe quando as funções do evento abrem. Assim que uma for criada, ela aparece aqui."
                />
              ) : visibleRows.length === 0 ? (
                <EstadoVazio
                  icone={<FilterX className="w-7 h-7" />}
                  titulo="Nenhuma escalação nesse recorte"
                  texto={`Filtrando por ${nomesDosFiltrosAtivos || "este recorte"} não sobra nenhuma linha.`}
                  acao={
                    <button
                      type="button"
                      onClick={limpaFiltros}
                      className="h-[34px] px-3.5 rounded-lg bg-primary text-[13px] font-medium text-white hover:bg-primary-hover"
                      data-testid="button-limpar-filtros"
                    >
                      Limpar filtros
                    </button>
                  }
                />
              ) : (
                <ScalingTable rows={visibleRows} {...tableProps} />
              )}

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
            </>
          )}
        </div>
      </main>

      <InclusionDetailsDialog
        open={showModal}
        onOpenChange={setShowModal}
        modal={!successInfo}
        inclusion={selectedInclusion}
        initialTab={modalInitialTab}
        abrirEscolhaDeColaborador={abrirEscolhaDeColaborador}
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
        quantasLinhas={visibleRows.filter(i => i.status !== "cancelado" && !i.deletedAt).length}
        comFiltro={temRecorte}
        onExport={async (colunas, formato, scope) => {
          setExporting(true);
          try { await handleExportToExcel(colunas, formato, scope); setExportOpen(false); }
          finally { setExporting(false); }
        }}
      />
      <ScalingSuccessDialog info={successInfo} onClose={() => setSuccessInfo(null)} />
      <SentToProductionDialog info={sentToProductionInfo} onClose={() => setSentToProductionInfo(null)} />
      <AttachmentLightbox item={lightbox} onClose={() => setLightbox(null)} />

      <ConfirmDialog
        open={descartePendente !== null}
        onOpenChange={(o) => { if (!o) setDescartePendente(null); }}
        icon={(props) => <AlertTriangle {...props} />}
        tone="orange"
        title="Descartar alterações?"
        description="Você mudou esta escalação e ainda não salvou. Ir para a próxima descarta o que foi digitado."
        cancelLabel="Continuar editando"
        confirmLabel="Descartar e sair"
        pendingLabel="Descartando…"
        isPending={false}
        onConfirm={confirmarDescarte}
        testId="dialog-descartar-alteracoes"
      />
    </div>
  );
}
