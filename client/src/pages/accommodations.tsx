// Hospedagem — página. Estado de UI, o registro (modal e lote) e as guardas
// de tela ficam aqui; dados/índices em use-accommodations-data; a UI em
// components/accommodations/**.
//
// 07/10 (redesenho): a mesma casca de Passagens — barra da tela sangrando até
// as margens, conteúdo em até 1560px, esqueleto com a geometria real, erro e
// sem-acesso no mesmo desenho — e o aviso de alteração para Compras: o bloco
// "Alterações aprovadas para rever a hospedagem" acima da fila, o sinal na
// linha da vaga e o aviso no topo do modal (com "Abrir hospedagem" e "Já atuei").
import { useState, useCallback, useMemo, useEffect, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Layers, ListChecks, Lock, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BlocoDeAvisos, BotaoAvisosResolvidos } from "@/components/avisos-de-alteracao/bloco-de-avisos";
import { useAvisosPendentes, type AvisoDeAlteracao } from "@/components/avisos-de-alteracao/use-avisos-de-alteracao";
import { useToast } from "@/hooks/use-toast";
import { toastSucessoDaVaga } from "@/components/common/toast-sucesso";
import { hasPermission } from "@/lib/role-utils";
import { useEventLock, PastEventBanner } from "@/lib/event-lock";
import { hasRoleIn } from "@shared/roles";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import { aplicarStatusDaVagaNoCache } from "@/hooks/use-vaga-acoes";
import { fixEncoding } from "@/lib/utils";
import type { Accommodation, TeamInclusion } from "@shared/schema";
import type { OpcaoDeFiltro } from "@/components/common/filter-popover";
import { usePageTitle } from "@/components/common/use-page-title";
import { PageHeader } from "@/components/common/page-header";
import AccommodationModal from "@/components/accommodations/accommodation-modal";
import AccommodationsTable from "@/components/accommodations/accommodations-table";
import AccommodationsFilterBar from "@/components/accommodations/accommodations-filter-bar";
import AccommodationsWorkQueue from "@/components/accommodations/accommodations-work-queue";
import {
  BatchConfirmDialog, BatchResultDialog, BatchSelectionBar, type BatchResult,
} from "@/components/accommodations/accommodations-batch";
import { useAccommodationsData } from "@/components/accommodations/use-accommodations-data";
import { contarPorOpcao, passaNosFiltros } from "@/components/accommodations/accommodations-filtering";
import { DEFAULT_PERIOD, temRecorteDePeriodo } from "@/components/scaling/scaling-period";
import {
  contadoresDaFila, pertenceAoBloco, type BlocoDaFila,
} from "@/components/accommodations/accommodations-queue";
import {
  DEFAULT_FILTERS,
  type AccommodationDraft, type AccommodationFilters, type AccommodationPayload, type AccSortConfig, type AccSortField,
  type BatchDraft,
} from "@/components/accommodations/types";
import { isCheckOutAfterCheckIn, isPostPurchaseStatus, toDateInput, toTitleCase } from "@/components/accommodations/utils";


/** `POST/PATCH /api/accommodations` devolvem a hospedagem + o status resultante da vaga (24/09). */
type HospedagemComStatusDaVaga = Accommodation & { inclusionStatus?: string };

/** Como a lista está ordenada agora, em palavras, para o rodapé. */
const NOME_DA_ORDEM: Record<string, string> = {
  id: "nº da inclusão", event: "evento", collaborator: "colaborador",
  date: "check-in", hotelName: "hotel", function: "função",
};

export default function Accommodations() {
  usePageTitle("Hospedagem");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Estado da tela ──
  const [filters, setFilters] = useState<AccommodationFilters>(DEFAULT_FILTERS);
  const [blocoAtivo, setBlocoAtivo] = useState<BlocoDaFila | null>(null);
  const [sortConfig, setSortConfig] = useState<AccSortConfig | null>({ field: "id", direction: "desc" });
  const [selectedInclusion, setSelectedInclusion] = useState<TeamInclusion | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [batchDraft, setBatchDraft] = useState<BatchDraft>({});
  const [selectedForBatch, setSelectedForBatch] = useState<string[]>([]);
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const [batchApplying, setBatchApplying] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);

  // Admin ou Compras — aceita aliases legados ("administrador", "compras"...)
  const isPurchasingRole = hasRoleIn(user?.role, ["admin", "purchasing"]);
  // Espelha POST/PATCH /api/accommodations (admin, production, purchasing) — RH só vê.
  const canEditField = hasPermission(user, "canEditScreen4");
  // Evento encerrado (regra 19/08): hospedagem depende da escalação — depois do
  // término só o administrador age (o servidor devolve 403).
  const eventLock = useEventLock();

  // ── Dados ──
  // O recorte de troca virou um bloco da fila, aplicado aqui embaixo junto dos
  // outros três; o hook devolve a lista sem ele para os contadores da fila
  // poderem contar todos os blocos ao mesmo tempo.
  const {
    teamInclusions, events, functions, collaborators, users,
    isLoading, loadError,
    accommodationMap, eventById, functionById, collaboratorById,
    pendingSwapByInclusion, approvedSwapInclusionIds, filteredData, selectableInclusionIds,
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
  const hojeData = useMemo(() => new Date(), []);
  const ctxFiltro = useMemo(
    () => ({ eventById, collaboratorById, accommodationMap, pendingSwapByInclusion, showOnlyPendingSwaps: false, hoje: hojeData }),
    [eventById, collaboratorById, accommodationMap, pendingSwapByInclusion, hojeData],
  );

  /**
   * O bloco da fila também recorta a lista, e por isso entra no contador.
   *
   * Sem ele o popover prometia sobre a lista inteira enquanto a tela mostrava
   * o recorte do bloco: com "Urgente" ligado, 114 linhas na tela e 1.824
   * prometidas nos números ao lado das opções.
   */
  const refinarPeloBloco = useCallback(
    (linhas: TeamInclusion[]) => (blocoAtivo ? linhas.filter((i) => pertenceAoBloco(blocoAtivo, i, ctxFila)) : linhas),
    [blocoAtivo, ctxFila],
  );

  // Base do contador do período: tudo aplicado (inclusive o bloco), menos o próprio período.
  const linhasSemPeriodo = useMemo(
    () => refinarPeloBloco(teamInclusionsWithAccommodation.filter((i) => passaNosFiltros(i, { ...filters, periodo: DEFAULT_PERIOD }, ctxFiltro))),
    [teamInclusionsWithAccommodation, filters, ctxFiltro, refinarPeloBloco],
  );

  const opcoesDeEvento = useMemo<OpcaoDeFiltro[]>(() => {
    const n = contarPorOpcao(teamInclusionsWithAccommodation, filters, "eventId", ctxFiltro, refinarPeloBloco);
    return (events ?? [])
      .filter((e) => e.status !== "excluido" && e.status !== "excluído")
      .map((e) => ({ id: e.id, nome: e.name, n: n.get(e.id) ?? 0 }));
  }, [events, teamInclusionsWithAccommodation, filters, ctxFiltro, refinarPeloBloco]);

  const opcoesDeFuncao = useMemo<OpcaoDeFiltro[]>(() => {
    const n = contarPorOpcao(teamInclusionsWithAccommodation, filters, "functionId", ctxFiltro, refinarPeloBloco);
    return (functions ?? [])
      .map((f) => ({ id: f.id, nome: f.name, n: n.get(f.id) ?? 0 }));
  }, [functions, teamInclusionsWithAccommodation, filters, ctxFiltro, refinarPeloBloco]);

  const opcoesDeColaborador = useMemo<OpcaoDeFiltro[]>(() => {
    const n = contarPorOpcao(teamInclusionsWithAccommodation, filters, "collaboratorId", ctxFiltro, refinarPeloBloco);
    return (collaborators ?? [])
      .map((c) => ({ id: c.id, nome: toTitleCase(c.fullName) || "—", n: n.get(c.id) ?? 0 }));
  }, [collaborators, teamInclusionsWithAccommodation, filters, ctxFiltro, refinarPeloBloco]);

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
  /** Filtros da barra (sem o bloco da fila) — o vazio diz se são eles que escondem vagas. */
  const filtrosDaBarra =
    filters.eventId !== "all" || filters.functionId.length > 0 || filters.collaboratorId !== "all" ||
    filters.searchId.trim() !== "" || filters.accommodationStatus !== "all" || filters.inclusionStatus !== "active" ||
    temRecorteDePeriodo(filters.periodo);
  const hasActiveFilters = filtrosDaBarra || blocoAtivo !== null;

  const handleSort = (field: AccSortField) => {
    setSortConfig((current) => {
      if (current?.field === field) return current.direction === "asc" ? { field, direction: "desc" } : null; // 3º clique remove
      return { field, direction: "asc" };
    });
  };

  // useCallback (07/10): a linha é memo() — sem referência estável, TODAS as
  // linhas repintavam a cada marcação.
  const toggleRowSelection = useCallback((id: string) =>
    setSelectedForBatch((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]), []);
  // Marcar todos = só os pendentes visíveis (canceladas não têm checkbox).
  const toggleAllSelection = () =>
    setSelectedForBatch(allSelectableSelected ? [] : Array.from(selectableAtivos));

  // ── Modal ──
  const openModal = useCallback((inclusion: TeamInclusion) => {
    if (inclusion.status === "cancelado") return;
    setSelectedInclusion(inclusion);
    setShowModal(true);
  }, []);
  const closeModal = () => setShowModal(false);

  // ── Alterações aprovadas para rever a hospedagem (07/10) ──
  // O mesmo comportamento de Passagens: o aviso pode ser de uma prova fora do
  // recorte de evento atual (a lista e as hospedagens vêm só do evento
  // filtrado); aí o filtro passa para a prova do aviso e o modal abre assim
  // que a vaga chega.
  const avisos = useAvisosPendentes("hospedagem");
  const [abrirDepois, setAbrirDepois] = useState<string | null>(null);
  const abrirPeloAviso = useCallback((aviso: AvisoDeAlteracao) => {
    const inc = teamInclusions?.find((i) => i.id === aviso.teamInclusionId);
    if (inc) { openModal(inc); return; }
    setAbrirDepois(aviso.teamInclusionId);
    setFilters((prev) => ({ ...prev, eventId: aviso.eventId }));
    // A lista muda de recorte por baixo do modal — dizer por quê.
    toast({ title: `Mostrando ${aviso.eventName ?? "a prova do aviso"}`, description: "O filtro de evento mudou para abrir a vaga desta alteração." });
  }, [teamInclusions, openModal, toast]);
  useEffect(() => {
    if (!abrirDepois || isLoading) return;
    const inc = teamInclusions?.find((i) => i.id === abrirDepois);
    if (inc) { setAbrirDepois(null); openModal(inc); }
  }, [abrirDepois, isLoading, teamInclusions, openModal]);

  // ── Registro de UMA hospedagem. Compartilhado pelo modal (via mutation) e
  // pelo lote (chamada direta). O status da vaga (hospedagem_comprada /
  // hospedagem_passagem_comprada) é DERIVADO pelo servidor (24/09) e volta em
  // `inclusionStatus` — o segundo PATCH de status não existe mais.
  const registerAccommodation = async (payload: AccommodationPayload) => {
    const created = (await (await apiRequest("POST", "/api/accommodations", payload)).json()) as HospedagemComStatusDaVaga;
    aplicarStatusDaVagaNoCache(queryClient, payload.teamInclusionId, created?.inclusionStatus);
    return created;
  };

  const createMutation = useMutation({
    mutationFn: registerAccommodation,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accommodations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    },
    onError: (error: unknown) => toast({ variant: "destructive", title: "Não foi possível registrar a hospedagem", description: apiErrorMessage(error, "Tente de novo em instantes.") }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: AccommodationPayload }) =>
      (await (await apiRequest("PATCH", `/api/accommodations/${id}`, data)).json()) as HospedagemComStatusDaVaga,
    onSuccess: (updated, vars) => {
      aplicarStatusDaVagaNoCache(queryClient, vars.data.teamInclusionId, updated?.inclusionStatus);
      queryClient.invalidateQueries({ queryKey: ["/api/accommodations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    },
    onError: (error: unknown) => toast({ variant: "destructive", title: "Não foi possível atualizar a hospedagem", description: apiErrorMessage(error, "Tente de novo em instantes.") }),
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
    // Toast de sucesso (23/09) no lugar do modal bloqueante "Sucesso" + OK.
    toastSucessoDaVaga(accommodation ? "Hospedagem atualizada" : "Hospedagem registrada", {
      inclusionNumber: selectedInclusion.inclusionNumber ?? null,
      eventName: eventById.get(selectedInclusion.eventId)?.name ?? "—",
      collaboratorName: collaborator ? (fixEncoding(collaborator.fullName) || "—") : "—",
      functionName: functionById.get(selectedInclusion.functionId)?.name ?? "—",
    });
    closeModal();
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
      ? "Preencha os campos obrigatórios: Nome do hotel e Localização"
      : !isCheckOutAfterCheckIn(batchDraft) ? "O check-out deve ser igual ou posterior ao check-in." : null;
    if (err) { toast({ title: "Preencha o lote antes de aplicar", description: err, variant: "destructive" }); return; }

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
          errors.push(`#${inclusion.inclusionNumber}: ${apiErrorMessage(error, "falha ao registrar")}`);
        }
      }
      // O resultado vira diálogo: uma lista de falhas dentro de um toast que
      // some em segundos é a mesma coisa que não mostrar as falhas.
      setBatchResult({ registradas: successCount, falhas: errors });
      // Tira da fila só o que realmente foi registrado.
      if (processedIds.length > 0) setSelectedForBatch((prev) => prev.filter((id) => !processedIds.includes(id)));
    } catch {
      toast({ title: "Falha ao processar o lote de hospedagens", description: "Parte das hospedagens pode ter sido registrada — confira a lista.", variant: "destructive" });
    } finally {
      setBatchApplying(false);
      queryClient.invalidateQueries({ queryKey: ["/api/accommodations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
    }
  };

  // ── Guardas de tela ──
  // A barra da tela aparece em todos os estados (carregando, erro, sem
  // acesso): a pessoa sempre sabe onde está, e nada "pula" quando os dados
  // chegam. A mesma casca de Passagens.
  const barra = (subtitulo: ReactNode, acoes?: ReactNode) => (
    <PageHeader variant="bar" title="Hospedagem" subtitle={subtitulo} className="mx-0 mt-0" actions={acoes} />
  );
  const casca = (conteudo: ReactNode, subtitulo: ReactNode = null) => (
    <div className="-mx-[var(--page-gutter)] -mt-[var(--page-gutter)]">
      {barra(subtitulo)}
      <div className="px-[var(--page-gutter)] pt-5 pb-6">
        <div className="flex flex-col gap-4 max-w-[1560px] mx-auto">{conteudo}</div>
      </div>
    </div>
  );

  if (!hasPermission(user, "canAccessScreen3")) {
    return casca(
      <div className="pas-entra flex flex-col items-center text-center rounded-xl border border-border bg-card px-6 py-14" data-testid="hospedagem-sem-acesso">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-muted text-muted-foreground mb-3" aria-hidden="true">
          <Lock className="w-5 h-5" />
        </span>
        <h2 className="m-0 text-base font-semibold text-foreground">Acesso negado</h2>
        <p className="m-0 mt-1.5 max-w-[420px] text-sm leading-relaxed text-muted-foreground">
          Você não tem permissão para acessar esta tela. Se precisa registrar hospedagens, peça ao administrador para liberar o seu perfil.
        </p>
      </div>,
    );
  }

  if (isLoading) {
    // Esqueleto com a geometria real: fila, filtros e as primeiras linhas.
    return casca(
      <div role="status" aria-live="polite" aria-busy="true" aria-label="Carregando hospedagens" className="flex flex-col gap-4">
        <span className="sr-only">Carregando hospedagens…</span>
        <div aria-hidden="true" className="grid grid-cols-2 sm:grid-cols-4 rounded-xl border border-border bg-card overflow-hidden">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`px-3.5 pt-3 pb-3.5 space-y-2 ${i > 0 ? "sm:border-l border-border" : ""}`}>
              <div className="pas-osso h-3 w-20" />
              <div className="pas-osso h-5 w-28" />
            </div>
          ))}
        </div>
        <div aria-hidden="true" className="flex gap-2">
          <div className="pas-osso h-[34px] flex-[1_1_220px] max-w-[320px] rounded-lg" />
          <div className="pas-osso h-[34px] w-[164px] rounded-lg hidden sm:block" />
          <div className="pas-osso h-[34px] w-[152px] rounded-lg hidden sm:block" />
          <div className="pas-osso h-[34px] w-[176px] rounded-lg hidden md:block" />
        </div>
        <div aria-hidden="true" className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="h-10 bg-surface-muted border-b border-border" />
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-border last:border-0">
              <div className="pas-osso h-[22px] w-12" />
              <div className="flex-1 space-y-1.5"><div className="pas-osso h-3.5 w-3/5" /><div className="pas-osso h-2.5 w-2/5" /></div>
              <div className="pas-osso h-3.5 w-24 hidden md:block" />
              <div className="pas-osso h-3.5 w-32 hidden md:block" />
              <div className="pas-osso h-[22px] w-20" />
            </div>
          ))}
        </div>
      </div>,
      <span>Carregando…</span>,
    );
  }

  // Sessão expirada ou rede fora: mostrar o motivo em vez de "nenhuma inclusão".
  if (loadError) {
    const isAuthError = loadError.status === 401 || loadError.status === 403;
    return casca(
      <div role="alert" className="pas-entra flex flex-col items-center text-center rounded-xl border border-danger/25 bg-card px-6 py-14">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-danger-soft text-danger mb-3" aria-hidden="true">
          <AlertCircle className="w-5 h-5" />
        </span>
        <h2 className="m-0 text-base font-semibold text-foreground">
          {isAuthError ? "Sessão expirada ou sem permissão" : "Não foi possível carregar as hospedagens"}
        </h2>
        <p className="m-0 mt-1.5 max-w-[440px] text-sm leading-relaxed text-muted-foreground">
          {isAuthError ? "Entre novamente para continuar. Nenhum dado foi perdido." : (loadError.body?.message || "Verifique sua conexão e tente novamente.")}
        </p>
        <Button variant="outline" className="mt-5 rounded-lg" onClick={() => {
          ["/api/team-inclusions", "/api/events", "/api/functions", "/api/collaborators", "/api/accommodations"]
            .forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
        }}>
          <RotateCw className="w-4 h-4 mr-1.5" aria-hidden="true" />Tentar novamente
        </Button>
      </div>,
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
  const nSel = effectiveSelectedForBatch.length;

  return (
    <>
      {/* Margens pela variável do layout: a barra sangra até as bordas da
          página e o conteúdo fica em até 1560px — a mesma casca de Passagens. */}
      <div className="-mx-[var(--page-gutter)] -mt-[var(--page-gutter)]">
        {/* Barra de contexto (PageHeader `bar`): o resumo do recorte e as ações. */}
        {barra(
          <span data-testid="resumo-do-recorte">
            {linhasVisiveis.length === 0
              ? "nenhuma vaga neste recorte"
              : <>
                  {linhasVisiveis.length} {linhasVisiveis.length === 1 ? "vaga" : "vagas"} em {eventosNoRecorte}{" "}
                  {eventosNoRecorte === 1 ? "evento" : "eventos"}{semReserva > 0 ? ` · ${semReserva} sem reserva` : ""}
                </>}
          </span>,
          <>
            <BotaoAvisosResolvidos tipo="hospedagem" />
            {canEditField && (
              /*
               * Sem nada marcado o botão não fica inerte: ele marca as pendentes
               * visíveis, que é o passo que faltava para o lote existir. Com
               * marcadas, vira a ação principal (cheio) e abre a confirmação.
               */
              <Button
                type="button"
                variant={nSel > 0 ? "default" : "outline"}
                onClick={() => (nSel > 0 ? handleApplyToSelected() : toggleAllSelection())}
                disabled={selectableAtivos.size === 0}
                title={selectableAtivos.size === 0 ? "Nenhuma vaga pendente neste recorte" : undefined}
                className={`shrink-0 h-[34px] rounded-lg text-sm font-medium ${nSel > 0 ? "bg-primary hover:bg-primary-hover text-primary-foreground" : ""}`}
                data-testid="button-batch-primary"
              >
                {nSel > 0 ? <Layers className="w-4 h-4 mr-1.5" aria-hidden="true" /> : <ListChecks className="w-4 h-4 mr-1.5" aria-hidden="true" />}
                {nSel > 0 ? `Aplicar em lote (${nSel})` : selectableAtivos.size > 0 ? `Selecionar pendentes (${selectableAtivos.size})` : "Selecionar pendentes"}
              </Button>
            )}
          </>,
        )}

        {/* `div`, não `main`: o `<main>` é um só e mora no layout. */}
        <div className="px-[var(--page-gutter)] pt-5 pb-6">
          <div className="flex flex-col gap-4 max-w-[1560px] mx-auto">
            {/* Evento encerrado: banner discreto quando o filtro aponta para um
                evento já terminado e o usuário não é o administrador. */}
            <PastEventBanner show={filters.eventId !== "all" && eventLock.isReadOnlyPastEvent(filters.eventId)} />

            {/* Alterações aprovadas depois do registro (07/10): o trabalho mais
                urgente de Compras — fica acima de tudo, e só existe quando há. */}
            <BlocoDeAvisos tipo="hospedagem" onAbrir={abrirPeloAviso} />

            {/* A fila de trabalho no lugar dos três cards de resumo e do banner
                de trocas: aqui cada bloco conta E leva ao trabalho. */}
            <AccommodationsWorkQueue resumo={resumoDaFila} ativo={blocoAtivo} onEscolher={setBlocoAtivo} />

            <AccommodationsFilterBar
              filters={filters}
              onChange={patchFilters}
              onClear={clearFilters}
              opcoesDeEvento={opcoesDeEvento}
              opcoesDeFuncao={opcoesDeFuncao}
              opcoesDeColaborador={opcoesDeColaborador}
              linhasSemPeriodo={linhasSemPeriodo}
              hoje={hojeData}
              sortConfig={sortConfig}
              onSortChange={setSortConfig}
              count={linhasVisiveis.length}
              total={teamInclusionsWithAccommodation.length}
              recorteDeFora={blocoAtivo !== null}
            />

            <AccommodationsTable
              rows={linhasVisiveis}
              accommodationMap={accommodationMap} eventById={eventById} functionById={functionById} collaboratorById={collaboratorById}
              pendingSwapByInclusion={pendingSwapByInclusion}
              approvedSwapInclusionIds={approvedSwapInclusionIds}
              vagasComAlteracao={avisos.porVaga}
              ctxFila={ctxFila}
              sortConfig={sortConfig} onSort={handleSort}
              selectedIds={selectedForBatch} selectableIds={selectableAtivos} allSelectableSelected={allSelectableSelected}
              onToggleRow={toggleRowSelection} onToggleAll={toggleAllSelection}
              canEdit={canEditField} onOpen={openModal}
              hasActiveFilters={hasActiveFilters} onClearFilters={clearFilters}
              total={teamInclusionsWithAccommodation.length} ordenacao={ordenacao}
              bloco={blocoAtivo} statusDaHospedagem={filters.accommodationStatus} filtrosDaBarra={filtrosDaBarra}
            />

            {/* Barra de seleção: acompanha a rolagem no rodapé da lista. */}
            <BatchSelectionBar
              selectedCount={nSel}
              canEdit={canEditField}
              applying={batchApplying}
              onClear={() => setSelectedForBatch([])}
              onApply={handleApplyToSelected}
            />
          </div>
        </div>
      </div>

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
        open={showModal} onClose={closeModal}
        inclusion={selectedInclusion} accommodation={selectedAccommodation}
        event={selectedInclusion ? eventById.get(selectedInclusion.eventId) : undefined}
        func={selectedInclusion ? functionById.get(selectedInclusion.functionId) : undefined}
        collaborator={selectedInclusion?.collaboratorId ? collaboratorById.get(selectedInclusion.collaboratorId) : undefined}
        collaboratorById={collaboratorById} users={users}
        canEditRecord={canEditRecord} isPurchasingRole={isPurchasingRole && !eventLocked} lockedForRole={lockedForRole} isPostPurchase={isPostPurchase}
        eventLocked={eventLocked} eventLockMessage={eventLock.lockReason(selectedInclusion?.eventId)}
        isSaving={createMutation.isPending || updateMutation.isPending} onSave={handleModalSave}
      />
    </>
  );
}
