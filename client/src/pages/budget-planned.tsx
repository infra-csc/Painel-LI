/**
 * Orçamento PLANEJADO — página de composição (25/09, modularização);
 * redesenho 08/10.
 *
 * Dados (inalterados): `useBudgetQueries` (consultas), `useBudgetDraft`
 * (rascunho por usuário/evento — no servidor desde 08/10), `useBudgetEngine` (cálculo via
 * @shared/budget-engine), `useBudgetFilters` (busca/filtro/seleção),
 * `useBudgetEditModal` e `useBudgetPlannedActions` (mutations).
 *
 * Apresentação (08/10) — a mesma casca das telas irmãs (Passagens,
 * Hospedagem, Espelho): barra de contexto de 56px grudada com o título, o
 * evento como seletor (nome + datas · colaboradores) e as ações; conteúdo até
 * 1560px com o resumo do evento num painel só, a fila de situações que conta
 * e recorta, a barra de filtros (que agora vale e aparece nas duas vistas),
 * a lista (cards ou planilha) e a barra de seleção que sobe do rodapé com a
 * ação forte: "Enviar ao Realizado (N)".
 *
 * 26/10 (Módulo de Honorários, Fase 0): a tela é "Pré-aprovação de
 * valores". Ata de 22/10: "nenhum registro é liberado para a Produção sem a
 * pré-aprovação do DP" — o DP pré-aprova (linha, seleção ou o evento
 * inteiro, com a prévia do total) e só o pré-aprovado vai ao Realizado; o
 * valor que muda depois volta a pedir a pré-aprovação. O evento ganhou o
 * interruptor "não exibir valores ao colaborador" (ligado até a OC) e a
 * lista de eventos abre sem o legado (antes da data de corte).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearch } from "wouter";
import { AlertCircle, BadgeCheck, Calculator, CloudOff, ListChecks, RefreshCw, RotateCw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EventSearchSelect } from "@/components/event-select";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import { PageHeader } from "@/components/common/page-header";
import { usePageTitle } from "@/components/common/use-page-title";
import { useAuth } from "@/hooks/use-auth";
import { useBudgetQueries } from "@/hooks/use-budget-queries";
import { useBudgetDraft } from "@/hooks/use-budget-draft";
import { useBudgetEngine } from "@/hooks/use-budget-engine";
import { useBudgetFilters } from "@/hooks/use-budget-filters";
import { useBudgetEditModal } from "@/hooks/use-budget-edit-modal";
import { useBudgetPlannedActions } from "@/hooks/use-budget-planned-actions";
import { useEventoEmFoco } from "@/lib/use-evento-em-foco";
import { isRhOrAdmin } from "@/lib/role-utils";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Event } from "@shared/schema";
import { BudgetOverviewCards } from "@/components/budget/budget-overview-cards";
import { BudgetFilters, FilaDoPlanejado, type VistaDoPlanejado } from "@/components/budget/budget-filters";
import { BudgetCards, EsqueletoDosCards } from "@/components/budget/budget-cards";
import { BudgetSheet } from "@/components/budget/budget-sheet";
import { BudgetEditModal } from "@/components/budget/budget-edit-modal";
import { ConfirmSendDialog } from "@/components/budget/confirm-send-dialog";
import { NaoParticipouDialog, RestoreParticipacaoDialog } from "@/components/budget/nao-participou-dialog";
import { EnviarParaRealizadoBar } from "@/components/budget/enviar-para-realizado-bar";
import { TEXTO_RASCUNHO_LOCAL } from "@/components/budget/selo-do-rascunho";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ddmm, nomeDaVaga as nomeDaVagaDe, type CalculatedBudget } from "@/components/budget/types";
import { usarHonorarioAprovado } from "@/components/budget/honorario-no-planejado";
import {
  DesfazerPreAprovacaoDialog, OcultarValoresDoEvento, PreAprovarDialog,
  type PedidoDePreAprovacao, type PlanejadoDaTela,
} from "@/components/budget/pre-aprovacao";
import { useFiltroDoLegado } from "@/components/honorarios/use-honorarios";
import { pedePreAprovacao, podeLiberarParaProducao } from "@shared/pre-aprovacao";
import { useSituacaoContratualNoEvento } from "@/components/contratos/pecas";

/** "09/10 – 11/10/2026" (ou só o dia de início). */
function periodoDoEvento(e: Event | undefined): string {
  if (!e?.startDate) return "";
  const ano = e.startDate.slice(0, 4);
  if (!e.endDate || e.endDate === e.startDate) return `${ddmm(e.startDate)}/${ano}`;
  return `${ddmm(e.startDate)} – ${ddmm(e.endDate)}/${e.endDate.slice(0, 4)}`;
}

export default function BudgetPlannedPage() {
  usePageTitle("Pré-aprovação de valores");
  // Abre sem os eventos legados (antes da data de corte), com filtro para ver (26/10).
  const legado = useFiltroDoLegado();
  const searchString = useSearch();
  const { urlCollaboratorId, urlFunctionId } = useMemo(() => {
    const p = new URLSearchParams(searchString);
    return {
      urlCollaboratorId: p.get("collaborator") || "",
      urlFunctionId: p.get("function") || "",
    };
  }, [searchString]);
  const [highlightCardId, setHighlightCardId] = useState<string>("");

  // Evento em foco (23/09): antes lia `?event=` só na montagem e nunca escrevia —
  // trocar de tela pedia o evento de novo e o link copiado não carregava o contexto.
  const { eventId: selectedEventId, setEventId: setSelectedEventId, sanitize: sanearEventoEmFoco } = useEventoEmFoco();
  // `user` precisa existir antes do rascunho: a chave dele inclui o id (23/09).
  const { user } = useAuth();
  const usuarioId = user?.id ?? "";
  const qc = useQueryClient();

  const [collapsedCards, setCollapsedCards] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<VistaDoPlanejado>("overview");
  // "Atualizar padrões" grava nos registros do servidor: pede confirmação (08/10).
  const [confirmarPadroes, setConfirmarPadroes] = useState(false);

  // Quem grava no Planejado e envia ao Realizado é quem o SERVIDOR aceita
  // (requireFinWrite: admin e Financeiro/RH) — decisão do dono, 08/10: a tela
  // liberava a edição para a Produção (que levava 403 ao salvar) e escondia do
  // RH no card e no modal, embora a Planilha deixasse. Agora é uma regra só
  // para editar, selecionar, enviar e "Atualizar padrões".
  const podeGravar = isRhOrAdmin(user);
  const canEdit = podeGravar;
  const canMarkNotAttended = podeGravar;

  const q = useBudgetQueries(selectedEventId, {
    planned: true, actual: true, inclusions: true, notes: "planned", functionValues: true, tickets: true, settings: true,
    honorarios: true,
  });
  const { events, functions, collaborators, functionValues, systemSettings, selectedEvent, getCollaboratorName, getFunctionName, functionNameById, ticketByInclusion } = q;
  // Evento em foco que não existe mais (excluído) é descartado assim que a lista chega (23/09).
  useEffect(() => { if (events?.length) sanearEventoEmFoco(events.map(e => e.id)); }, [events, sanearEventoEmFoco]);
  // Busca diretamente os eventos que têm escalação — sem carregar todas as escalações
  const { data: eventsWithInclusions } = useQuery<Event[]>({ queryKey: ["/api/events-with-inclusions"] });

  // Gerar valores padrão automaticamente se não existirem
  useEffect(() => {
    if (functionValues && functionValues.length === 0 && functions && functions.length > 0) {
      apiRequest("POST", "/api/function-values/generate-defaults", {})
        .then(() => qc.invalidateQueries({ queryKey: ["/api/function-values"] }))
        .catch(() => {});
    }
  }, [functionValues, functions, qc]);

  const didScrollToCard = useRef(false);
  useEffect(() => {
    if (didScrollToCard.current || !q.teamInclusions || !urlCollaboratorId || !urlFunctionId) return;
    const target = q.teamInclusions.find(
      ti => ti.collaboratorId === urlCollaboratorId && ti.functionId === urlFunctionId && !ti.deletedAt
    );
    if (target) {
      didScrollToCard.current = true;
      // A rolagem até o card fica no efeito de `highlightCardId` (após a
      // virtualização, o card pode ainda não estar no DOM neste momento).
      setHighlightCardId(target.id);
      setTimeout(() => setHighlightCardId(""), 4000);
    }
  }, [q.teamInclusions, urlCollaboratorId, urlFunctionId]);

  const draft = useBudgetDraft(selectedEventId, usuarioId);
  // Contrato ativo do CNPJ (Fase 0): só o DP pergunta; para os outros o mapa vem vazio.
  // No legado o contrato não entra (fluxo antigo): sem selo.
  const situacaoContratual = useSituacaoContratualNoEvento(selectedEvent && legado.ehLegado(selectedEvent) ? null : selectedEventId);
  const { budgetOverrides, setBudgetOverrides, draftRestored, setDraftRestored } = draft;
  const nAjustes = Object.keys(budgetOverrides).length;
  const eventoLegado = legado.ehLegado(selectedEvent);

  const motor = useBudgetEngine({
    teamInclusions: q.teamInclusions, functionValues, collaborators, functionNamesById: functionNameById, systemSettings,
    ticketByInclusion, eventLocation: selectedEvent?.location ?? null, budgetOverrides,
    allBudgetPlanned: q.budgetPlanned, existingActuals: q.budgetActual, honorarios: q.honorarios,
    // 27/10: evento legado (antes da data de corte) vai ao Realizado sem a pré-aprovação.
    eventoLegado,
  });
  const { calculatedBudgets, sentToActual, notAttendedIds, isCardNotAttended, situacaoDaVaga, plannedByVaga, actualsByCollabFunc, totalGeral, stats } = motor;

  const filtros = useBudgetFilters({ calculatedBudgets, getCollaboratorName, getFunctionName, sentToActual, notAttendedIds, situacaoDaVaga });
  const { filteredBudgets, selectableFiltered, selectedIds, setSelectedIds } = filtros;

  const nomeDaVaga = useCallback((b: CalculatedBudget) => nomeDaVagaDe(b.inclusion, getCollaboratorName), [getCollaboratorName]);

  const modal = useBudgetEditModal({
    selectedEventId, systemSettings, allBudgetPlanned: q.budgetPlanned, getCollaboratorName, getFunctionName, setBudgetOverrides, setDraftRestored,
  });

  const acoes = useBudgetPlannedActions({
    selectedEventId, userId: user?.id, allBudgetPlanned: q.budgetPlanned, calculatedBudgets, selectedIds, setSelectedIds,
    sentToActual, isCardNotAttended, clearDraftEntries: draft.clearDraftEntries, situacaoDaVaga, plannedByVaga,
  });
  const { toggleNotAttendedMutation, createAndMarkNotAttendedMutation, sendToActualMutation, sendSelectedToActualMutation } = acoes;

  // ── Pré-aprovação do DP (26/10) ──
  const { setPedidoDePreAprovacao, setDesfazer } = acoes;
  /** Separa o que pede a pré-aprovação do que fica de fora (e por quê) para a prévia. */
  const montarPedido = useCallback((base: CalculatedBudget[], origem: PedidoDePreAprovacao["origem"], recorte?: string): PedidoDePreAprovacao => {
    const alvos: CalculatedBudget[] = [];
    const deFora = { enviados: 0, ausentes: 0, jaPreAprovados: 0 };
    for (const b of base) {
      const s = situacaoDaVaga(b);
      if (s === "enviado") deFora.enviados++;
      else if (s === "nao_participou") deFora.ausentes++;
      else if (s === "pre_aprovado") deFora.jaPreAprovados++;
      else if (pedePreAprovacao(s)) alvos.push(b);
      // "legado" (27/10): fluxo antigo, não pede a pré-aprovação — fica de fora do lote.
    }
    return { alvos, origem, deFora, recorte };
  }, [situacaoDaVaga]);
  const preAprovarUm = useCallback((b: CalculatedBudget) => setPedidoDePreAprovacao(montarPedido([b], "linha")), [montarPedido, setPedidoDePreAprovacao]);
  const preAprovarVarios = useCallback((lista: CalculatedBudget[]) => setPedidoDePreAprovacao(montarPedido(lista, "selecao")), [montarPedido, setPedidoDePreAprovacao]);
  const desfazerUm = useCallback((b: CalculatedBudget) => {
    const planejado = plannedByVaga.get(b.inclusion.id) as PlanejadoDaTela | undefined;
    if (!planejado) return;
    setDesfazer({ planejado, nome: nomeDaVagaDe(b.inclusion, getCollaboratorName), funcao: getFunctionName(b.inclusion.functionId), valor: b.totalFinal });
  }, [plannedByVaga, setDesfazer, getCollaboratorName, getFunctionName]);
  // O que o lote do evento pré-aprova: o recorte visível (sem filtro = o evento inteiro).
  const aPreAprovarVisiveis = useMemo(
    () => filtros.filteredBudgets.filter(b => pedePreAprovacao(situacaoDaVaga(b))),
    [filtros.filteredBudgets, situacaoDaVaga],
  );
  // O que já pode ir ao Realizado: pré-aprovado — ou legado, pelo fluxo antigo (27/10).
  const preAprovadosVisiveis = useMemo(
    () => filtros.filteredBudgets.filter(b => podeLiberarParaProducao(situacaoDaVaga(b))),
    [filtros.filteredBudgets, situacaoDaVaga],
  );
  const preAprovarEvento = () => setPedidoDePreAprovacao(montarPedido(
    filtros.algumFiltro ? filtros.filteredBudgets : calculatedBudgets,
    "evento",
    filtros.algumFiltro ? "filtros ligados" : undefined,
  ));

  const toggleCollapse = useCallback((id: string) => {
    setCollapsedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  }, []);
  const { setConfirmSend } = acoes;
  const enviarLote = useCallback((ids: string[]) => setConfirmSend({ ids, source: "batch" }), [setConfirmSend]);
  const enviarUm = useCallback((id: string) => setConfirmSend({ ids: [id], source: "single" }), [setConfirmSend]);

  const isSending = sendToActualMutation.isPending || sendSelectedToActualMutation.isPending;

  // "Usar o honorário aprovado" (21/10): tira só o ajuste da mão de obra — o
  // override do usuário vence o honorário até ele escolher voltar.
  const usarHonorario = useCallback((id: string) => {
    setBudgetOverrides(prev => usarHonorarioAprovado(prev, id));
    setDraftRestored(false);
  }, [setBudgetOverrides, setDraftRestored]);

  // Estados da lista: TODAS as consultas que a conta usa (antes só escalações
  // e valores — com o Planejado/Realizado fora do ar a tela mostrava tudo
  // como "pendente", inclusive o que já tinha ido).
  const carregando = !!selectedEventId && (q.estado.isLoading || q.qFunctionValues.isLoading);
  const comErro = !!selectedEventId && !carregando && (q.estado.isError || q.qFunctionValues.isError);
  const tentarDeNovo = () => { q.estado.retry(); if (q.qFunctionValues.isError) q.qFunctionValues.refetch(); };

  const nSel = selectedIds.size;
  const totalSelecionado = useMemo(
    () => calculatedBudgets.reduce((s, b) => (selectedIds.has(b.inclusion.id) ? s + b.totalFinal : s), 0),
    [calculatedBudgets, selectedIds],
  );
  // Da seleção: quem já pode ir ao Realizado e quem ainda pede a pré-aprovação.
  const { selPreAprovados, selAPreAprovar } = useMemo(() => {
    const pre: CalculatedBudget[] = [];
    const pedem: CalculatedBudget[] = [];
    for (const b of calculatedBudgets) {
      if (!selectedIds.has(b.inclusion.id)) continue;
      const s = situacaoDaVaga(b);
      if (podeLiberarParaProducao(s)) pre.push(b);
      else if (pedePreAprovacao(s)) pedem.push(b);
    }
    return { selPreAprovados: pre, selAPreAprovar: pedem };
  }, [calculatedBudgets, selectedIds, situacaoDaVaga]);
  const todosEnviados = stats.total > 0 && stats.progressoEnvio >= 100;
  const temLista = !!selectedEventId && !carregando && !comErro && calculatedBudgets.length > 0;
  const allSelected = selectableFiltered.length > 0 && selectableFiltered.every(b => selectedIds.has(b.inclusion.id));

  // ── Barra de contexto ──
  const detalheDoEvento = selectedEvent
    ? [periodoDoEvento(selectedEvent), temLista ? `${calculatedBudgets.length} ${calculatedBudgets.length === 1 ? "colaborador" : "colaboradores"}` : null, selectedEvent.location]
        .filter(Boolean).join(" · ")
    : undefined;

  const acoesDaBarra = (
    <>
      {podeGravar && (
        <MotivoDesabilitado motivo="Aplica os valores da Tabela de valores a todos os orçamentos ainda não enviados" desabilitado={acoes.isApplyingDefaults}>
          <Button
            variant="outline"
            onClick={() => setConfirmarPadroes(true)}
            disabled={acoes.isApplyingDefaults}
            className="pas-alvo shrink-0 h-[34px] rounded-lg px-3 text-sm font-medium gap-1.5"
            data-testid="planejado-atualizar-padroes"
          >
            <RefreshCw className={`w-4 h-4 text-muted-foreground ${acoes.isApplyingDefaults ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
            {acoes.isApplyingDefaults ? "Atualizando…" : <><span className="hidden xl:inline">Atualizar padrões</span><span className="xl:hidden">Padrões</span></>}
          </Button>
        </MotivoDesabilitado>
      )}
      {/* 1º passo (26/10): o DP pré-aprova — o recorte visível ou o evento inteiro, com prévia. */}
      {podeGravar && temLista && aPreAprovarVisiveis.length > 0 && nSel === 0 && (
        <Button
          type="button"
          onClick={preAprovarEvento}
          className="pas-alvo shrink-0 h-[34px] rounded-lg px-3 text-sm font-semibold gap-1.5 bg-success-strong hover:bg-success-strong/90 text-white"
          data-testid="planejado-pre-aprovar-evento"
        >
          <BadgeCheck className="w-4 h-4" aria-hidden="true" />
          Pré-aprovar<span className="max-[1480px]:hidden">{filtros.algumFiltro ? " o recorte" : " o evento"}</span> ({aPreAprovarVisiveis.length})
        </Button>
      )}
      {/* 2º passo: só o pré-aprovado vai ao Realizado (liberado para a Produção). */}
      {podeGravar && temLista && !todosEnviados && (nSel > 0 || preAprovadosVisiveis.length > 0) && (
        <Button
          type="button"
          variant={nSel > 0 || aPreAprovarVisiveis.length === 0 ? "default" : "outline"}
          onClick={() => (nSel > 0 ? enviarLote(Array.from(selectedIds)) : filtros.setSelectedIds(new Set(preAprovadosVisiveis.map(b => b.inclusion.id))))}
          disabled={nSel > 0 && selPreAprovados.length === 0}
          title={nSel > 0 && selPreAprovados.length === 0 ? "Nenhum selecionado tem a pré-aprovação do DP" : undefined}
          className={`pas-alvo shrink-0 h-[34px] rounded-lg px-3 text-sm font-medium gap-1.5 ${nSel > 0 || aPreAprovarVisiveis.length === 0 ? "bg-primary hover:bg-primary-hover text-primary-foreground" : ""}`}
          data-testid="planejado-acao-principal"
        >
          {nSel > 0 ? <Send className="w-4 h-4" aria-hidden="true" /> : <ListChecks className="w-4 h-4" aria-hidden="true" />}
          {nSel > 0 ? `Enviar ao Realizado (${selPreAprovados.length})` : <>{eventoLegado ? "Selecionar a enviar" : "Selecionar pré-aprovados"}<span className="max-sm:hidden"> ({preAprovadosVisiveis.length})</span></>}
        </Button>
      )}
    </>
  );

  const barra = (
    <PageHeader
      variant="bar"
      title="Pré-aprovação de valores"
      // No celular a barra tem três andares: grudada, comia um quarto da tela (como no Espelho).
      className="mx-0 mt-0 gap-x-3 max-sm:static"
      subtitle={selectedEventId ? undefined : "orçamento previsto por colaborador, calculado das escalações confirmadas"}
      // Sem evento, quem escolhe é o seletor grande do centro — a barra não repete.
      context={selectedEventId ? <>
        <span aria-hidden="true" className="hidden sm:block w-px h-5 bg-border shrink-0" />
        <EventSearchSelect
          variante="barra"
          value={selectedEventId}
          onValueChange={setSelectedEventId}
          events={eventsWithInclusions}
          detalhe={detalheDoEvento}
          legado={legado}
        />
      </> : undefined}
      actions={acoesDaBarra}
    />
  );

  // ── Conteúdo ──
  let conteudo: ReactNode;
  if (!selectedEventId) {
    conteudo = (
      <div className="pas-entra flex flex-col items-center text-center rounded-xl border border-border bg-card px-6 py-16" data-testid="planejado-sem-evento">
        <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-soft text-primary mb-3.5" aria-hidden="true">
          <Calculator className="w-5 h-5" />
        </span>
        <h2 className="m-0 text-base font-semibold text-foreground">Selecione um evento</h2>
        <p className="m-0 mt-1.5 max-w-[460px] text-sm leading-relaxed text-muted-foreground">
          Valores previstos a partir das escalações confirmadas. Diárias, alimentação e mobilidade são calculadas automaticamente — o DP confere, ajusta o que precisar e pré-aprova; só o pré-aprovado vai ao Realizado.
        </p>
        <div className="mt-5 w-full max-w-sm text-left">
          <EventSearchSelect value={selectedEventId} onValueChange={setSelectedEventId} events={eventsWithInclusions} className="sm:w-full" legado={legado} />
        </div>
      </div>
    );
  } else if (carregando) {
    // Esqueleto com a geometria real: resumo, fila, filtros e os primeiros cards.
    conteudo = (
      <div role="status" aria-live="polite" aria-busy="true" aria-label="Carregando o planejado" className="flex flex-col gap-4">
        <span className="sr-only">Carregando o planejado…</span>
        <div aria-hidden="true" className="pla-resumo pla-resumo-medido rounded-xl border border-border bg-card overflow-hidden">
          <div className="pla-resumo-grade">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className={`px-4 py-3.5 space-y-2 ${i === 0 ? "pla-resumo-total" : ""}`}>
                <div className="pas-osso h-3 w-20" /><div className={`pas-osso ${i === 0 ? "h-7 w-40" : "h-5 w-24"}`} /><div className="pas-osso h-2.5 w-16" />
              </div>
            ))}
          </div>
          <div className="h-10 border-t border-border bg-surface-muted/60" />
        </div>
        <div aria-hidden="true" className="grid grid-cols-2 sm:grid-cols-4 rounded-xl border border-border bg-card overflow-hidden">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`px-3.5 pt-3 pb-3.5 space-y-2 ${i > 0 ? "sm:border-l border-border" : ""}`}>
              <div className="pas-osso h-3 w-20" /><div className="pas-osso h-5 w-28" />
            </div>
          ))}
        </div>
        <div aria-hidden="true" className="flex gap-2">
          <div className="pas-osso h-[34px] w-[200px] rounded-lg hidden sm:block" />
          <div className="pas-osso h-[34px] flex-[1_1_220px] max-w-[320px] rounded-lg" />
          <div className="pas-osso h-[34px] w-[160px] rounded-lg hidden sm:block" />
          <div className="pas-osso h-[34px] w-[96px] rounded-lg hidden sm:block" />
        </div>
        <EsqueletoDosCards />
      </div>
    );
  } else if (comErro) {
    conteudo = (
      <div role="alert" className="pas-entra flex flex-col items-center text-center rounded-xl border border-danger/25 bg-card px-6 py-14" data-testid="planejado-erro">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-danger-soft text-danger mb-3" aria-hidden="true">
          <AlertCircle className="w-5 h-5" />
        </span>
        <h2 className="m-0 text-base font-semibold text-foreground">Não foi possível carregar o planejado</h2>
        <p className="m-0 mt-1.5 max-w-[460px] text-sm leading-relaxed text-muted-foreground">
          As escalações, os valores ou os envios deste evento não chegaram — sem eles a conta sairia errada. Verifique sua conexão e tente de novo; nada do que você ajustou foi perdido.
        </p>
        <Button variant="outline" className="mt-5 rounded-lg" onClick={tentarDeNovo} data-testid="planejado-tentar-novamente">
          <RotateCw className="w-4 h-4 mr-1.5" aria-hidden="true" />Tentar novamente
        </Button>
      </div>
    );
  } else {
    conteudo = (
      <>
        {/* "Não exibir valores" ao colaborador (26/10): do evento, padrão ligado, até a OC. */}
        {/* No legado o colaborador não usa o app (fluxo antigo): o interruptor não se aplica. */}
        {selectedEvent && !legado.ehLegado(selectedEvent) && (
          <div className="rounded-xl border border-border bg-card px-4 py-3">
            <OcultarValoresDoEvento evento={selectedEvent} podeMudar={podeGravar} />
          </div>
        )}
        {calculatedBudgets.length > 0 && <BudgetOverviewCards selectedEvent={selectedEvent} totalGeral={totalGeral} stats={stats} vagasNaTela={calculatedBudgets.length} />}

        {/* ── Rascunho restaurado: ajustes salvos que ainda não foram enviados.
             Desde 08/10 o rascunho mora no servidor e volta em qualquer
             computador; sem servidor, volta o que este navegador guardou. ── */}
        {draftRestored && nAjustes > 0 && (
          <div role="status" className="pas-entra flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-warning/25 bg-warning-soft px-4 py-2.5" data-testid="planejado-rascunho">
            <span className="w-1.5 h-1.5 rounded-full bg-warning-strong shrink-0" aria-hidden="true" />
            <p className="m-0 min-w-0 flex-1 text-xs text-warning">
              <span className="font-semibold">Rascunho de edições restaurado.</span>{" "}
              {draft.draftStatus === "local"
                ? (nAjustes === 1 ? "1 ajuste guardado neste navegador voltou" : `${nAjustes} ajustes guardados neste navegador voltaram`)
                : (nAjustes === 1 ? "1 ajuste do seu rascunho voltou" : `${nAjustes} ajustes do seu rascunho voltaram`)} — eles só valem quando forem pré-aprovados e enviados ao Realizado.
            </p>
            <button
              type="button"
              onClick={() => { setBudgetOverrides({}); setDraftRestored(false); }}
              className="pas-alvo inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs font-semibold text-warning hover:bg-warning/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Descartar rascunho de edições restaurado"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />Descartar
            </button>
          </div>
        )}

        {/* Servidor fora: o rascunho continua, mas só neste navegador (aviso discreto, nas duas vistas). */}
        {draft.draftStatus === "local" && nAjustes > 0 && (
          <p role="status" className="pas-entra m-0 flex items-center gap-2 text-xs text-warning" data-testid="planejado-rascunho-local">
            <CloudOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            {TEXTO_RASCUNHO_LOCAL}.
          </p>
        )}

        {calculatedBudgets.length > 0 && <FilaDoPlanejado filtros={filtros} />}
        {calculatedBudgets.length > 0 && (
          <BudgetFilters filtros={filtros} vista={podeGravar ? activeTab : "overview"} onVista={setActiveTab} total={calculatedBudgets.length} semPlanilha={!podeGravar} />
        )}

        {activeTab === "overview" || !podeGravar || calculatedBudgets.length === 0 ? (
          <BudgetCards
            filteredBudgets={filteredBudgets}
            totalCalculated={calculatedBudgets.length}
            isLoading={false}
            isError={false}
            onRetry={tentarDeNovo}
            highlightCardId={highlightCardId}
            sentToActual={sentToActual}
            selectedIds={selectedIds}
            collapsedCards={collapsedCards}
            plannedByVaga={plannedByVaga}
            actualsByCollabFunc={actualsByCollabFunc}
            eventNotes={q.eventNotes}
            nomeDaVaga={nomeDaVaga}
            getFunctionName={getFunctionName}
            canEdit={canEdit}
            canMarkNotAttended={canMarkNotAttended}
            restorePending={toggleNotAttendedMutation.isPending}
            onToggleSelect={filtros.toggleCardSelection}
            onToggleCollapse={toggleCollapse}
            onEdit={modal.openEditModal}
            onSend={enviarUm}
            onNotAttended={acoes.setNotAttendedModal}
            onRestore={acoes.setRestoreModal}
            onUsarHonorario={usarHonorario}
            situacaoDaVaga={situacaoDaVaga}
            onPreAprovar={preAprovarUm}
            onDesfazerPreAprovacao={desfazerUm}
            situacaoContratual={situacaoContratual}
            selectableCount={selectableFiltered.length}
            allSelected={allSelected}
            onSelectAll={(v) => (v ? filtros.selectAllCards() : filtros.clearSelection())}
            algumFiltro={filtros.algumFiltro}
            onLimparFiltros={filtros.limparFiltros}
          />
        ) : (
          <BudgetSheet
            filteredBudgets={filteredBudgets}
            selectableFiltered={selectableFiltered}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            onToggleSelect={filtros.toggleRowSelection}
            sentToActual={sentToActual}
            isCardNotAttended={isCardNotAttended}
            actualsByCollabFunc={actualsByCollabFunc}
            budgetOverrides={budgetOverrides}
            setBudgetOverrides={setBudgetOverrides}
            setDraftRestored={setDraftRestored}
            draftStatus={draft.draftStatus}
            draftSavedAt={draft.draftSavedAt}
            totalGeral={totalGeral}
            nomeDaVaga={nomeDaVaga}
            getFunctionName={getFunctionName}
            isAdmin={isRhOrAdmin(user)}
            onSend={enviarLote}
            situacaoDaVaga={situacaoDaVaga}
            onPreAprovar={preAprovarVarios}
            algumFiltro={filtros.algumFiltro}
            onLimparFiltros={filtros.limparFiltros}
          />
        )}

        {/* Barra de seleção: acompanha a rolagem no rodapé da lista. */}
        {podeGravar && <EnviarParaRealizadoBar
          selectedIds={selectedIds}
          totalSelecionado={totalSelecionado}
          onSend={enviarLote}
          onLimpar={filtros.clearSelection}
          isSending={isSending}
          nPreAprovados={selPreAprovados.length}
          nAPreAprovar={selAPreAprovar.length}
          onPreAprovar={() => preAprovarVarios(selAPreAprovar)}
        />}
      </>
    );
  }

  return (
    <>
      {/* Margens pela variável do layout: a barra sangra até as bordas da
          página e o conteúdo fica em até 1560px — a casca das telas irmãs. */}
      <div className="-mx-[var(--page-gutter)] -mt-[var(--page-gutter)]">
        {barra}
        <div className="px-[var(--page-gutter)] pt-5 pb-6">
          <div className="flex flex-col gap-4 max-w-[1560px] mx-auto">{conteudo}</div>
        </div>
      </div>

      {/* "Atualizar padrões" grava no servidor: confirma antes (08/10). */}
      <ConfirmDialog
        open={confirmarPadroes}
        onOpenChange={setConfirmarPadroes}
        icon={RefreshCw}
        title="Atualizar com os valores padrão?"
        description="Os valores padrão da Tabela de valores serão aplicados a todos os orçamentos deste evento que ainda não foram enviados ao Realizado. Os já enviados não mudam; pré-aprovado cujo valor mudar volta a pedir a pré-aprovação do DP."
        confirmLabel="Atualizar padrões"
        pending={acoes.isApplyingDefaults}
        testId="planejado-confirmar-padroes"
        onConfirm={() => { acoes.handleApplyDefaults(); setConfirmarPadroes(false); }}
      />

      {/* Modal de Edição */}
      <BudgetEditModal ctrl={modal} />
      {modal.DialogoDescarteEdicao}

      {/* ── Confirmação de envio UNIFICADA (cards, individual e planilha) ── */}
      <ConfirmSendDialog
        confirmSend={acoes.confirmSend}
        onClose={() => acoes.setConfirmSend(null)}
        calculatedBudgets={calculatedBudgets}
        sentToActual={sentToActual}
        isCardNotAttended={isCardNotAttended}
        getCollaboratorName={getCollaboratorName}
        getFunctionName={getFunctionName}
        isSending={isSending}
        onSendSingle={b => sendToActualMutation.mutate(b)}
        onSendSelected={() => sendSelectedToActualMutation.mutate()}
        situacaoDaVaga={situacaoDaVaga}
      />

      {/* ── Pré-aprovação do DP (26/10): linha, seleção ou evento, com prévia ── */}
      <PreAprovarDialog
        pedido={acoes.pedidoDePreAprovacao}
        onClose={() => acoes.setPedidoDePreAprovacao(null)}
        onConfirm={(alvos) => acoes.preAprovarMutation.mutate(alvos)}
        pending={acoes.preAprovarMutation.isPending}
        nomeDaVaga={nomeDaVaga}
        getFunctionName={getFunctionName}
        situacaoDe={situacaoDaVaga}
      />
      <DesfazerPreAprovacaoDialog
        alvo={acoes.desfazer}
        onClose={() => acoes.setDesfazer(null)}
        onConfirm={(id) => acoes.desfazerPreAprovacaoMutation.mutate(id)}
        pending={acoes.desfazerPreAprovacaoMutation.isPending}
      />

      {/* ── Modal de confirmação de restauração ── */}
      <RestoreParticipacaoDialog
        modal={acoes.restoreModal}
        onClose={() => acoes.setRestoreModal(null)}
        isPending={toggleNotAttendedMutation.isPending}
        onConfirm={id => toggleNotAttendedMutation.mutate({ id, reason: "" })}
      />

      <NaoParticipouDialog
        modal={acoes.notAttendedModal}
        reason={acoes.notAttendedReason}
        setReason={acoes.setNotAttendedReason}
        onClose={() => { acoes.setNotAttendedModal(null); acoes.setNotAttendedReason(""); }}
        isPending={toggleNotAttendedMutation.isPending || createAndMarkNotAttendedMutation.isPending}
        onConfirm={(m, reason) => {
          if (m.id) {
            toggleNotAttendedMutation.mutate({ id: m.id, reason });
          } else if (m.budget) {
            createAndMarkNotAttendedMutation.mutate({ budget: m.budget, reason });
          }
        }}
      />
    </>
  );
}
