// Compra de Passagens — página. Estado de UI, validação compartilhada e o
// upsert idempotente ficam aqui; dados/índices em use-tickets-data; a UI em
// components/tickets/**. Regras do formulário: @/lib/ticket-form.
import { useState, useMemo, useEffect, useCallback, useDeferredValue, useRef, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { AlertCircle, Stamp, FileUp, Layers, Lock, RotateCw, X } from "lucide-react";
import { type SortConfig, type SortField } from "@/components/common/sortable-header";
import { usePageTitle } from "@/components/common/use-page-title";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { toastSucessoDaVaga } from "@/components/common/toast-sucesso";
import { hasPermission, isAdmin } from "@/lib/role-utils";
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
import { contarPorOpcao, passaNosFiltrosBase } from "@/components/tickets/tickets-filtering";
import { DEFAULT_PERIOD } from "@/components/scaling/scaling-period";
import { BlocoDeAvisos, BotaoAvisosResolvidos } from "@/components/avisos-de-alteracao/bloco-de-avisos";
import { useAvisosPendentes, type AvisoDeAlteracao } from "@/components/avisos-de-alteracao/use-avisos-de-alteracao";
import TicketsWorkQueue, { type FilaDePassagens } from "@/components/tickets/tickets-work-queue";
import TicketsFilterBar from "@/components/tickets/tickets-filter-bar";
import QuickBatchPanel from "@/components/tickets/quick-batch-panel";
import VoucherLoteDialog from "@/components/tickets/voucher-lote-dialog";
import TicketsTable from "@/components/tickets/tickets-table";
import TicketModal from "@/components/tickets/ticket-modal";
import {
  DiscardChangesDialog, ChronologyWarningsDialog, BatchConfirmDialog, BatchResultDialog,
} from "@/components/tickets/ticket-dialogs";
import { DEFAULT_TICKET_FILTERS } from "@/components/tickets/types";
import { AbasDePassagens, abaDaUrl, comAba, type AbaDePassagens } from "@/components/tickets/analises/abas-de-passagens";
import AnalisesDePassagens from "@/components/tickets/analises/analises-de-passagens";
import { mesmaVisao, visaoDaUrl, type VisaoDaAnalise } from "@/components/tickets/analises/url-da-analise";
import type {
  TicketFilters, TicketFormState, FieldErrorsState, BatchResult, FormFieldHelpers, TicketFormHandlers,
} from "@/components/tickets/types";

// Chaves preenchidas automaticamente ao abrir o modal — não contam como
// "alteração" para o "Descartar alterações?".
const AUTO_FILLED_KEYS = ["transportType", "departureCityDestination", "returnCityOrigin", "departureCityOrigin", "returnCityDestination", "purchaseDate"];

export default function Tickets() {
  usePageTitle("Passagens");
  const { user } = useAuth();
  const { toast } = useToast();
  const search = useSearch();
  const [location, setLocation] = useLocation();

  const initial = useMemo(() => filtersFromSearch(typeof window !== "undefined" ? window.location.search : search), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [filters, setFilters] = useState<TicketFilters>(initial.filters);
  const [showOnlyPendingSwaps, setShowOnlyPendingSwaps] = useState(initial.swaps);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>({ field: "id", direction: "desc" });
  // Lista | Análises (07/10) — a aba Análises é SÓ do admin; para os outros
  // papéis a tela é sempre a Lista e `?aba=` nem chega à URL.
  const ehAdmin = isAdmin(user);
  const [abaEscolhida, setAba] = useState<AbaDePassagens>(() => abaDaUrl(typeof window !== "undefined" ? window.location.search : search));
  const aba: AbaDePassagens = ehAdmin ? abaEscolhida : "lista";
  // Filtros e alternadores da aba Análises (`an_*` na URL): recarregar ou
  // compartilhar o link abre a mesma visão. Ficam na memória ao ir para a
  // Lista — voltar às Análises devolve o que estava.
  const [visaoAnalise, setVisaoAnalise] = useState<VisaoDaAnalise>(() => visaoDaUrl(typeof window !== "undefined" ? window.location.search : search));

  // Persiste filtros (e a aba) na URL (replace — não polui o histórico).
  useEffect(() => {
    const qs = comAba(searchFromFilters(filters, showOnlyPendingSwaps), aba, visaoAnalise);
    const current = (typeof window !== "undefined" ? window.location.search : "").replace(/^\?/, "");
    if (qs !== current) setLocation(`${location}${qs ? `?${qs}` : ""}`, { replace: true });
  }, [filters, showOnlyPendingSwaps, aba, visaoAnalise]); // eslint-disable-line react-hooks/exhaustive-deps
  // URL mudou por fora (link do menu, voltar do navegador): re-sincroniza o estado.
  useEffect(() => {
    const fromUrl = filtersFromSearch(search);
    if (JSON.stringify(fromUrl.filters) !== JSON.stringify(filters)) setFilters(fromUrl.filters);
    if (fromUrl.swaps !== showOnlyPendingSwaps) setShowOnlyPendingSwaps(fromUrl.swaps);
    const abaNaUrl = abaDaUrl(search);
    if (abaNaUrl !== abaEscolhida) setAba(abaNaUrl);
    // Só a URL das Análises carrega a visão; a da Lista não a apaga.
    if (abaNaUrl === "analises") {
      const visaoNaUrl = visaoDaUrl(search);
      if (!mesmaVisao(visaoNaUrl, visaoAnalise)) setVisaoAnalise(visaoNaUrl);
    }
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Análises → Lista já filtrada pelo evento clicado (todas as situações: a análise conta as canceladas também). */
  const verEventoNaLista = useCallback((eventId: string) => {
    setShowOnlyPendingSwaps(false);
    setFilters({ ...DEFAULT_TICKET_FILTERS, eventId, inclusionStatus: "all" });
    setAba("lista");
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }, []);

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
  const [selectedTickets, setSelectedTickets] = useState<string[]>([]);
  const [editingTicketId, setEditingTicketId] = useState<string | null>(null);
  const [batchExpanded, setBatchExpanded] = useState(false);
  const painelLoteRef = useRef<HTMLDivElement | null>(null);
  const [voucherLoteAberto, setVoucherLoteAberto] = useState(false);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [modalActiveTab, setModalActiveTab] = useState("resumo");

  // 28/09: a barra de filtros recebe `filters` na hora (a tecla aparece já);
  // a lista e os contadores dos popovers recalculam com a versão adiada —
  // digitar um nome não trava enquanto o React refaz o pipeline inteiro.
  const filtrosAplicados = useDeferredValue(filters);
  const data = useTicketsData({ filters: filtrosAplicados, showOnlyPendingSwaps, sortConfig, user });
  const {
    events, functions, collaborators, eventById, accommodationByInclusion,
    getTicket, getEventName, getFunctionName, getCollaboratorName,
    ticketInclusions, filteredTicketInclusions, pendingTicketSwapsCount, selectableInclusionIds, kpis, isPurchasingRole,
  } = data;
  // Espelha POST/PATCH /api/tickets (admin, production, purchasing) — mesma flag do modal.
  const canEdit = hasPermission(user, "canRegisterTickets");

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
  /** Datas de cada evento para o período "Data do evento" (02/10). */
  const datasDoEvento = useCallback((id: string | null | undefined) => (id ? data.eventById.get(id) : undefined), [data.eventById]);

  const opcoesDosFiltros = useMemo(() => {
    const todas = data.teamInclusions ?? [];
    const ctx = { eventById: data.eventById, collaboratorById: data.collaboratorById, hoje: data.hoje };
    const completar = data.completarPipeline;
    // Base do contador do período: tudo aplicado, menos o próprio período.
    const f = filtrosAplicados;
    const semPeriodo = completar(todas.filter((i) => passaNosFiltrosBase(i, { ...f, periodo: DEFAULT_PERIOD }, ctx)), f);
    const porEvento = contarPorOpcao(todas, f, "eventId", ctx, completar);
    const porFuncao = contarPorOpcao(todas, f, "functionId", ctx, completar);
    const porColaborador = contarPorOpcao(todas, f, "collaboratorId", ctx, completar);
    // Só entra no popover quem tem ao menos uma linha no recorte: uma lista de
    // 900 colaboradores em que 890 devolvem zero não ajuda a escolher.
    return {
      semPeriodo,
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
  }, [data.teamInclusions, data.eventById, data.collaboratorById, data.completarPipeline, data.hoje, events, functions, collaborators, filtrosAplicados]);

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
    errCls: (scope, field) => (fieldErrors[scope]?.[field] ? " border-danger-strong focus-visible:ring-danger/25 bg-danger-soft/40" : ""),
    fieldErrorMsg: (scope, field) => {
      const msg = fieldErrors[scope]?.[field];
      return msg ? <p className="text-2xs text-danger-strong mt-1 leading-snug" role="alert">{msg}</p> : null;
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

  // ── Alterações aprovadas para remarcar (07/10) ──
  // O aviso pode ser de uma prova fora do recorte de evento atual (a lista e
  // as passagens vêm só do evento filtrado): aí o filtro passa para a prova
  // do aviso e o modal abre assim que a vaga chega.
  const avisos = useAvisosPendentes("passagem");
  const [abrirDepois, setAbrirDepois] = useState<string | null>(null);
  const abrirPeloAviso = useCallback((aviso: AvisoDeAlteracao) => {
    const inc = data.teamInclusions?.find((i) => i.id === aviso.teamInclusionId);
    if (inc) { openModal(inc); return; }
    setAbrirDepois(aviso.teamInclusionId);
    setFilters((prev) => ({ ...prev, eventId: aviso.eventId }));
    // A lista muda de recorte por baixo do modal — dizer por quê.
    toast({ title: `Mostrando ${aviso.eventName ?? "a prova do aviso"}`, description: "O filtro de evento mudou para abrir a vaga desta alteração." });
  }, [data.teamInclusions, openModal, toast]);
  useEffect(() => {
    if (!abrirDepois || data.isLoading) return;
    const inc = data.teamInclusions?.find((i) => i.id === abrirDepois);
    if (inc) { setAbrirDepois(null); openModal(inc); }
  }, [abrirDepois, data.isLoading, data.teamInclusions, openModal]);

  const closeModalDiscarding = () => {
    setDiscardTarget(null);
    setShowModal(false);
    setEditingTicketId(null);
    setEditSnapshot(null);
    if (selectedInclusion) clearScope(selectedInclusion.id);
  };
  // Antes rodava ao fechar o modal "Sucesso" + OK; desde 23/09 o sucesso é um
  // toast, então a limpeza acontece logo depois de registrar.
  const aposSucesso = (inclusionId: string) => {
    setEditingTicketId(null);
    clearScope(inclusionId);
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
        toastSucessoDaVaga((isEditing || mode === "updated") ? "Passagem atualizada" : "Passagem registrada", {
          inclusionNumber: inc.inclusionNumber ?? null,
          eventName: getEventName(inc.eventId),
          collaboratorName: inc.collaboratorId ? getCollaboratorName(inc.collaboratorId) : "—",
          functionName: inc.functionId ? getFunctionName(inc.functionId) : "—",
        });
        setEditSnapshot(null);
        setShowModal(false);
        aposSucesso(inc.id);
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
          ? "Se a área pedir ajuste de data depois disso e o aprovador aprovar, Compras recebe o aviso para remarcar. O preenchimento dos dados continua liberado."
          : "As passagens voltaram para \"não emitida\".",
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
  // A barra da tela aparece em todos os estados (carregando, erro, sem
  // acesso): a pessoa sempre sabe onde está, e nada "pula" quando os dados chegam.
  // Lista | Análises: só existe para o admin (o componente some para os outros).
  // Celular (07/10): eram 3 linhas (título, resumo, abas + ações quebradas).
  // Agora são 2 — título + abas em cima, as ações inteiras embaixo. O resumo
  // sai só no celular do admin (a fila logo abaixo traz os mesmos números);
  // no tablet e no desktop nada muda. Os outros papéis ficam como eram.
  const barra = (subtitulo: ReactNode, acoes?: ReactNode) => (
    <PageHeader
      variant="bar"
      title="Passagens"
      subtitle={ehAdmin ? <span className="hidden sm:inline">{subtitulo}</span> : subtitulo}
      className="mx-0 mt-0"
      context={ehAdmin ? <AbasDePassagens aba={aba} onAba={setAba} className="sm:hidden" /> : undefined}
      tabs={ehAdmin ? <AbasDePassagens aba={aba} onAba={setAba} className="hidden sm:inline-flex" /> : undefined}
      actions={acoes}
    />
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
      <div className="pas-entra flex flex-col items-center text-center rounded-xl border border-border bg-card px-6 py-14" data-testid="passagens-sem-acesso">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-muted text-muted-foreground mb-3" aria-hidden="true">
          <Lock className="w-5 h-5" />
        </span>
        <h2 className="m-0 text-base font-semibold text-foreground">Acesso negado</h2>
        <p className="m-0 mt-1.5 max-w-[420px] text-sm leading-relaxed text-muted-foreground">
          Você não tem permissão para acessar esta tela. Se precisa registrar passagens, peça ao administrador para liberar o seu perfil.
        </p>
      </div>,
    );
  }
  // Aba Análises (só admin): não depende da lista de vagas — abre mesmo
  // enquanto ela carrega ou se ela falhar.
  if (aba === "analises") {
    return casca(
      <AnalisesDePassagens visao={visaoAnalise} onVisao={setVisaoAnalise} onVerEvento={verEventoNaLista} />,
      <span>Quanto e quando gastamos com passagens</span>,
    );
  }
  if (data.isLoading) {
    // Esqueleto com a geometria real: fila, filtros e as primeiras linhas.
    return casca(
      <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-4">
        <span className="sr-only">Carregando passagens…</span>
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
  if (data.loadError) {
    const isAuthError = data.loadError.status === 401 || data.loadError.status === 403;
    return casca(
      <div role="alert" className="pas-entra flex flex-col items-center text-center rounded-xl border border-danger/25 bg-card px-6 py-14">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-danger-soft text-danger mb-3" aria-hidden="true">
          <AlertCircle className="w-5 h-5" />
        </span>
        <h2 className="m-0 text-base font-semibold text-foreground">{isAuthError ? "Sessão expirada ou sem permissão" : "Não foi possível carregar as passagens"}</h2>
        <p className="m-0 mt-1.5 max-w-[440px] text-sm leading-relaxed text-muted-foreground">
          {isAuthError ? "Entre novamente para continuar. Nenhum dado foi perdido." : (data.loadError.body?.message || "Verifique sua conexão e tente novamente.")}
        </p>
        <Button variant="outline" onClick={data.retryLoad} className="mt-5 rounded-lg">
          <RotateCw className="w-4 h-4 mr-1.5" aria-hidden="true" />Tentar novamente
        </Button>
      </div>,
    );
  }

  /** Algum recorte ligado (filtros da barra ou o de trocas da fila)? */
  const temFiltro = showOnlyPendingSwaps || JSON.stringify(filters) !== JSON.stringify(DEFAULT_TICKET_FILTERS);
  const limparFiltros = () => { setFilters(DEFAULT_TICKET_FILTERS); setShowOnlyPendingSwaps(false); };
  const nSel = effectiveSelectedTickets.length;
  /** Abre o painel de lote e leva a pessoa até ele (a seleção costuma estar lá embaixo). */
  const abrirLote = () => {
    setBatchExpanded(true);
    setTimeout(() => painelLoteRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  return (
    <>
      {/* Margens pela variável do layout (23/09): `-mx-6` fixo estourava a
          largura em 375px (o layout dá 16px ali) e deixava fresta em 1024+. */}
      <div className="-mx-[var(--page-gutter)] -mt-[var(--page-gutter)]">
        {/* Barra de contexto (PageHeader `bar`, 25/09): o resumo do recorte
            ("Total geral" do KPI antigo) e as ações da tela. 07/10: "Aplicar em
            lote" saiu de uma faixa própria de 56px para cá — o painel continua
            o mesmo, só abre daqui (ou da barra de seleção). */}
        {barra(
          <span data-testid="resumo-passagens">{resumoTopo}</span>,
          <>
            <BotaoAvisosResolvidos tipo="passagem" />
            <Button
              type="button"
              variant="outline"
              onClick={() => (batchExpanded ? setBatchExpanded(false) : abrirLote())}
              aria-expanded={batchExpanded}
              aria-controls="painel-lote-passagens"
              className={`shrink-0 h-[34px] rounded-lg text-sm font-medium ${batchExpanded ? "border-primary/40 bg-brand-soft text-primary hover:bg-brand-soft" : ""}`}
              data-testid="abrir-lote"
            >
              <Layers className="w-4 h-4 mr-1.5" aria-hidden="true" />
              <span className="sm:hidden">Lote</span>
              <span className="hidden sm:inline">Aplicar em lote</span>
            </Button>
            {canEdit && (
              <Button
                type="button"
                onClick={() => setVoucherLoteAberto(true)}
                className="shrink-0 h-[34px] rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-medium"
                data-testid="abrir-voucher-lote"
              >
                <FileUp className="w-4 h-4 mr-1.5" aria-hidden="true" />
                {/* No celular o rótulo encurta para os dois botões caberem numa fileira. */}
                {/* Admin tem as abas Lista | Análises na mesma barra (07/10): o
                    rótulo curto vai até 1536px para a barra caber em uma linha. */}
                <span className={ehAdmin ? "2xl:hidden" : "sm:hidden"}>Vouchers (PDF)</span>
                <span className={ehAdmin ? "hidden 2xl:inline" : "hidden sm:inline"}>Registrar pelos vouchers (PDF)</span>
              </Button>
            )}
          </>,
        )}

      {/* `div`, não `main` (23/09): o `<main>` é um só e mora no layout. */}
      <div className="px-[var(--page-gutter)] pt-5 pb-6">
        <div className="flex flex-col gap-4 max-w-[1560px] mx-auto">
        {/* Evento encerrado: banner discreto quando o filtro aponta para um evento
            já terminado e o usuário não é o administrador. */}
        <PastEventBanner show={!!filteredEvent && data.isEventLocked({ eventId: filteredEvent.id })} />

        {/* Alterações aprovadas depois da compra (07/10): o trabalho mais urgente
            de Compras — fica acima de tudo, e só existe quando há. */}
        <BlocoDeAvisos tipo="passagem" onAbrir={abrirPeloAviso} />

        <TicketsWorkQueue
          kpis={kpis}
          trocasPendentes={pendingTicketSwapsCount}
          mostrarTrocas={isPurchasingRole}
          ativa={filaAtiva}
          onEscolher={escolherFila}
        />

        <div ref={painelLoteRef} id="painel-lote-passagens" className="scroll-mt-[calc(var(--sticky-top,3.5rem)+4.5rem)] empty:hidden">
          <QuickBatchPanel
            expanded={batchExpanded}
            onToggle={() => setBatchExpanded(v => !v)}
            quick={ticketData["quick"]}
            helpers={helpers}
            handlers={handlers}
            filteredEvent={filteredEvent}
            impactCtx={batchImpactCtx}
            selectedCount={nSel}
            canEdit={canEdit}
            isPending={isSubmitting}
            onClear={() => clearScope("quick")}
            onApply={handleApplyToSelected}
          />
        </div>

        <TicketsFilterBar
          filters={filters}
          onChange={setFilters}
          onClear={() => setShowOnlyPendingSwaps(false)}
          opcoesDeEvento={opcoesDosFiltros.eventos}
          opcoesDeFuncao={opcoesDosFiltros.funcoes}
          opcoesDeColaborador={opcoesDosFiltros.colaboradores}
          linhasSemPeriodo={opcoesDosFiltros.semPeriodo}
          hoje={data.hoje}
          datasDoEvento={datasDoEvento}
          count={filteredTicketInclusions.length}
          total={ticketInclusions.length}
          recorteDeFora={showOnlyPendingSwaps}
        />

        {/* `overflow-clip` (07/10): `hidden` prendia o cabeçalho grudado da tabela. */}
        <div className="bg-card rounded-xl border border-border overflow-clip">
          <TicketsTable
            data={data}
            filters={filtrosAplicados}
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
            vagasComAlteracao={avisos.porVaga}
            temFiltro={temFiltro}
            onLimparFiltros={limparFiltros}
            total={ticketInclusions.length}
          />
        </div>

        {/* Barra de seleção (07/10): era um bloco lá em cima, fora da vista de
            quem marcava a 40ª linha. Agora acompanha a rolagem no rodapé da
            lista. "Emitida" em lote é o aviso de "o bilhete saiu" para várias
            pessoas de uma vez — não preenche nada. Desde 07/10 não trava mais o pedido de ajuste (regra do dono); ajuste aprovado depois vira aviso para Compras. */}
        {nSel > 0 && (
          <div className="sticky bottom-3 z-20 pas-sobe" data-testid="barra-selecao">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-foreground text-background shadow-3 pl-4 pr-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2">
                  <p className="m-0 text-sm font-semibold tabular-nums" aria-live="polite">
                    {nSel} {nSel === 1 ? "passagem selecionada" : "passagens selecionadas"}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSelectedTickets([])}
                    className="inline-flex items-center gap-1 h-7 px-1.5 rounded-md text-xs font-medium text-background/75 hover:bg-background/10 hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/60"
                    data-testid="limpar-selecao"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />Limpar seleção
                  </button>
                </div>
                {podeEmitir && (
                  <p className="m-0 hidden lg:block text-2xs leading-4 text-background/65 truncate">
                    Marcar como emitida registra que o bilhete saiu. Os dados da passagem continuam podendo ser preenchidos depois.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {canEdit && !batchExpanded && (
                  <button
                    type="button"
                    onClick={abrirLote}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-background/25 text-xs font-semibold text-background hover:bg-background/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/60"
                  >
                    <Layers className="w-4 h-4" aria-hidden="true" />Preencher dados em lote
                  </button>
                )}
                {podeEmitir && (
                  <button
                    type="button"
                    onClick={marcarSelecionadasEmitidas}
                    disabled={emitirMutation.isPending}
                    title="Registra que o bilhete saiu. Os dados da passagem continuam podendo ser preenchidos depois."
                    className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-primary text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/60"
                    data-testid="marcar-emitidas-lote"
                  >
                    <Stamp className="w-4 h-4" aria-hidden="true" />
                    {emitirMutation.isPending ? "Marcando…" : `Marcar como emitida (${nSel})`}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        </div>
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
        onRequestClose={requestCloseModal}
        onStartEdit={startEdit}
        onCancelEdit={requestCancelEdit}
        onSubmit={submitModal}
        isSubmitting={isSubmitting}
      />

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
        getPassagemAtual={(id) => { const t = getTicket(id); return t ? ticketToFormValues(t) : null; }}
        onRegistrar={async (inclusion, form) => { await upsertTicketForInclusion(inclusion, form); }}
        registrando={isSubmitting}
      />
      <BatchResultDialog result={batchResult} onClose={() => setBatchResult(null)} />
    </>
  );
}
