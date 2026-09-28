/**
 * Orçamento REALIZADO — página de composição (25/09, modularização).
 *
 * Até 24/09 este arquivo tinha ~2.600 linhas. Agora:
 *  - dados: `useBudgetQueries` (consultas), `useBudgetActualData` (índices,
 *    filtros, totais, seleção), `useBudgetActualEditor` (estado do modal, com
 *    viagem/alimentação DERIVADAS) e `useBudgetActualActions` (mutations);
 *  - apresentação: components/budget/actual-* e edit-actual-*.
 * Nada de comportamento mudou — só o lugar onde cada pedaço vive.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearch } from "wouter";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EventSearchSelect } from "@/components/event-select";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { usePageTitle } from "@/components/common/use-page-title";
import { QueryError } from "@/components/common/query-state";
import { useAuth } from "@/hooks/use-auth";
import { useBudgetQueries } from "@/hooks/use-budget-queries";
import { useBudgetActualData } from "@/hooks/use-budget-actual-data";
import { useBudgetActualEditor } from "@/hooks/use-budget-actual-editor";
import { useBudgetActualActions } from "@/hooks/use-budget-actual-actions";
import { useSidebar } from "@/contexts/sidebar-context";
import { useEventoEmFoco } from "@/lib/use-evento-em-foco";
import { useQuery } from "@tanstack/react-query";
import { normalizeRole } from "@shared/roles";
import type { Event } from "@shared/schema";
import { ActualStepper, ActualTotalBanner, DevolvedBanner } from "@/components/budget/actual-overview";
import { ActualFilters } from "@/components/budget/actual-filters";
import { ActualGroupList } from "@/components/budget/actual-group-list";
import { EditActualModal } from "@/components/budget/edit-actual-modal";
import { SendForReviewBar, SendForReviewDialog } from "@/components/budget/send-for-review-bar";
import { DeleteActualDialog, SplitDialog } from "@/components/budget/actual-dialogs";

export default function BudgetActualPage() {
  usePageTitle("Realizado");
  const searchString = useSearch();
  const { urlCollaboratorId, urlFunctionId } = useMemo(() => {
    const p = new URLSearchParams(searchString);
    return {
      urlCollaboratorId: p.get("collaborator") || "",
      urlFunctionId: p.get("function") || "",
    };
  }, [searchString]);
  const [highlightCardId, setHighlightCardId] = useState<string>("");

  // Evento em foco (23/09): compartilhado com Planejado, Comparativo, Controle RH e Notas.
  const { eventId: selectedEventId, setEventId: setSelectedEventId, sanitize: sanearEventoEmFoco } = useEventoEmFoco();
  const [collapsedCards, setCollapsedCards] = useState<Set<string>>(new Set());
  const { user } = useAuth();
  const { sidebarWidth } = useSidebar();

  const q = useBudgetQueries(selectedEventId, {
    planned: true, actual: true, comparison: true, inclusions: true, notes: "actual", notesStaleTime: 30000,
    plannedLogs: true, tickets: true, settings: true,
  });
  const { events, functions, collaborators, budgetActual, budgetPlanned, comparison: budgetComparison, teamInclusions, selectedEvent, getCollaboratorName, getFunctionName, functionNameById, ticketByInclusion, estado: estadoEvento } = q;
  const isLoading = q.qActual.isLoading;
  // Evento em foco que não existe mais (excluído) é descartado assim que a lista chega (23/09).
  useEffect(() => { if (events?.length) sanearEventoEmFoco(events.map(e => e.id)); }, [events, sanearEventoEmFoco]);
  // Busca diretamente os eventos que têm planejamento — sem carregar todos os registros
  const qEventsWithPlanned = useQuery<Event[]>({ queryKey: ["/api/events-with-planned"] });
  const eventsWithPlanned = qEventsWithPlanned.data;

  const rhComment = budgetComparison?.status === "devolvido" ? budgetComparison.returnReason :
                    budgetComparison?.status === "rejeitado" ? budgetComparison.rejectionReason : null;

  // `normalizeRole` (23/09): papéis legados ("financeiro", "administrador")
  // perdiam os botões do RH nesta tela.
  const papel = normalizeRole(user?.role);
  const isRhOrAdmin = papel === "admin" || papel === "financial";

  const didScrollToCard = useRef(false);
  useEffect(() => {
    if (didScrollToCard.current || !budgetActual || !urlCollaboratorId || !urlFunctionId) return;
    const target = budgetActual.find(
      a => a.collaboratorId === urlCollaboratorId && a.functionId === urlFunctionId
    );
    if (target) {
      didScrollToCard.current = true;
      setHighlightCardId(target.id);
      setTimeout(() => {
        const el = document.querySelector(`[data-card-id="${target.id}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 300);
      setTimeout(() => setHighlightCardId(""), 4000);
    }
  }, [budgetActual, urlCollaboratorId, urlFunctionId]);

  const dados = useBudgetActualData({ selectedEventId, budgetActual, budgetPlanned, teamInclusions, selectedEvent, getCollaboratorName, getFunctionName });
  const { filteredItems, selectedCards, setSelectedCards, totalRealizado, prestacaoCount, pendingCount, pendingFiltered, sentForReview } = dados;

  const editor = useBudgetActualEditor({
    getItemInclusion: dados.getItemInclusion, getItemDayCounts: dados.getItemDayCounts, getPlannedRef: dados.getPlannedRef,
    getFunctionName, functionNameById, ticketByInclusion, actualsPorGrupo: dados.actualsPorGrupo, systemSettings: q.systemSettings,
  });
  const acoes = useBudgetActualActions({ userId: user?.id, onSaved: editor.aoSalvar });
  const { sendForReviewMutation, updateMutation, deleteMutation, splitMutation } = acoes;

  const salvarPrestacao = () => {
    const payload = editor.montarPayloadParaSalvar();
    if (payload) updateMutation.mutate(payload);
  };

  const toggleCollapse = useCallback((id: string) => {
    setCollapsedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  }, []);
  const trocarEvento = (v: string) => { setSelectedEventId(v); setCollapsedCards(new Set()); };
  const limparFiltros = () => { dados.setSearchTerm(""); dados.setFilterType("all"); dados.setFilterFunction("all"); };

  const allSentForReview = sentForReview;
  const eventItems = useMemo(() => (budgetActual || []).filter(a => a.eventId === selectedEventId), [budgetActual, selectedEventId]);

  return (
    <div className="space-y-7 max-w-5xl mx-auto pb-36">

      {/* ── Cabeçalho ── */}
      <PageHeader
        icon={ClipboardCheck}
        title="Realizado"
        subtitle="Prestação de contas — escalas enviadas do Planejado"
        actions={selectedEventId && (
          <EventSearchSelect value={selectedEventId} onValueChange={trocarEvento} events={eventsWithPlanned} />
        )}
      />

      {/* ── Banner: prestações devolvidas pelo RH ── */}
      {selectedEventId && <DevolvedBanner devolvedItems={dados.devolvedItems} getCollaboratorName={getCollaboratorName} />}

      {/* ── Tela 1: Seleção de evento ── */}
      {!selectedEventId ? (
        <EmptyState
          live={false}
          icon={ClipboardCheck}
          title="Selecione um evento"
          description="Registre a prestação de contas com os valores efetivamente gastos em cada escala."
          className="py-20"
          action={
            <div className="w-full max-w-sm text-left">
              {qEventsWithPlanned.isError ? (
                <QueryError error={qEventsWithPlanned.error} onRetry={() => qEventsWithPlanned.refetch()} title="Não foi possível carregar os eventos" />
              ) : (
                <EventSearchSelect value={selectedEventId} onValueChange={trocarEvento} events={eventsWithPlanned} />
              )}
            </div>
          }
        />
      ) : estadoEvento.isError ? (
        <QueryError error={estadoEvento.error} onRetry={estadoEvento.retry} title="Não foi possível carregar o Realizado deste evento" />
      ) : isLoading || estadoEvento.isLoading ? (
        <div className="flex items-center justify-center py-20" role="status" aria-label="Carregando…">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredItems.length === 0 && !dados.buscaAplicada && dados.filterType === "all" && dados.filterFunction === "all" ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <ClipboardCheck className="w-16 h-16 text-slate-200 mx-auto mb-4" aria-hidden="true" />
          <h3 className="text-base font-semibold text-slate-700 mb-2">Nenhuma prestação disponível</h3>
          <p className="text-muted-foreground text-sm mb-6 max-w-md mx-auto">
            Envie escalas do Planejado para iniciar o Realizado deste evento
          </p>
          <Link href="/budget-planned">
            <Button className="bg-primary hover:bg-primary-hover">
              <ArrowRight className="w-4 h-4 mr-2" aria-hidden="true" />
              Ir para Planejado
            </Button>
          </Link>
        </div>
      ) : (
        <>
          <ActualStepper eventItems={eventItems} />
          <ActualTotalBanner
            filteredItems={filteredItems}
            prestacaoCount={prestacaoCount}
            totalRealizado={totalRealizado}
            totalPlanejado={dados.totalPlanejado}
            totalDifference={dados.totalDifference}
            selectedEventId={selectedEventId}
          />
          <ActualFilters dados={dados} functions={functions} />
          <ActualGroupList
            dados={dados}
            getCollaboratorName={getCollaboratorName}
            getFunctionName={getFunctionName}
            eventNotes={q.eventNotes}
            plannedLogs={q.plannedLogs}
            collapsedCards={collapsedCards}
            highlightCardId={highlightCardId}
            isRhOrAdmin={isRhOrAdmin}
            splitPending={splitMutation.isPending}
            onToggleCollapse={toggleCollapse}
            onEdit={editor.openEditModal}
            onSplit={acoes.setSplittingItem}
            onDelete={acoes.setConfirmDeleteId}
            onClearFilters={limparFiltros}
          />
        </>
      )}

      {selectedEventId && filteredItems.length > 0 && (
        <SendForReviewBar
          sidebarWidth={sidebarWidth}
          totalRealizado={totalRealizado}
          prestacaoCount={prestacaoCount}
          pendingCount={pendingCount}
          selectedCount={selectedCards.size}
          allSentForReview={allSentForReview}
          isPending={sendForReviewMutation.isPending}
          onClearSelection={() => setSelectedCards(new Set())}
          // Passa pela mesma confirmação do "Enviar todas" (não preenchidos + aviso de NF)
          onSendSelected={() => { if (selectedEventId) acoes.setConfirmSend("selected"); }}
          onSendAll={() => { if (selectedEventId) acoes.setConfirmSend("all"); }}
        />
      )}

      <EditActualModal
        editor={editor}
        budgetActual={budgetActual}
        plannedLogs={q.plannedLogs}
        rhComment={rhComment}
        getCollaboratorName={getCollaboratorName}
        getFunctionName={getFunctionName}
        getItemInclusion={dados.getItemInclusion}
        getItemDayCounts={dados.getItemDayCounts}
        getPlannedRef={dados.getPlannedRef}
        proportionalPlanned={dados.proportionalPlanned}
        isSaving={updateMutation.isPending}
        onSave={salvarPrestacao}
      />

      {/* ── Confirmação: enviar para revisão (todas visíveis ou selecionadas) ── */}
      <SendForReviewDialog
        confirmSend={acoes.confirmSend}
        onClose={() => acoes.setConfirmSend(null)}
        pendingFiltered={pendingFiltered}
        selectedCards={selectedCards}
        onConfirm={(targets) => {
          if (selectedEventId && targets.length > 0) {
            sendForReviewMutation.mutate({ eventId: selectedEventId, itemIds: targets.map(t => t.id) });
            if (acoes.confirmSend === "selected") setSelectedCards(new Set());
          }
          acoes.setConfirmSend(null);
        }}
      />

      <DeleteActualDialog
        confirmDeleteId={acoes.confirmDeleteId}
        onClose={() => acoes.setConfirmDeleteId(null)}
        isPending={deleteMutation.isPending}
        onConfirm={id => deleteMutation.mutate(id)}
      />

      {/* ── Split Escalação Modal ── */}
      <SplitDialog
        splittingItem={acoes.splittingItem}
        budgetActual={budgetActual}
        collaborators={collaborators}
        teamInclusion={acoes.splittingItem ? dados.getItemInclusion(acoes.splittingItem) : undefined}
        selectedEvent={selectedEvent}
        isPending={splitMutation.isPending}
        onClose={() => acoes.setSplittingItem(null)}
        onConfirm={(id, payload) => splitMutation.mutate({ id, payload })}
      />
    </div>
  );
}
