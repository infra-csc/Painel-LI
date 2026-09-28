/**
 * COMPARATIVO Planejado × Realizado — página de composição (25/09,
 * modularização). Até 24/09 este arquivo tinha ~2.500 linhas. Agora:
 *  - dados: `useBudgetQueries`, `useBudgetComparisonData` (base do
 *    comparativo, filtros, totais, seleção) e `useComparisonActions`
 *    (mutations + estado dos modais);
 *  - apresentação: components/budget/comparison-*, rh-decision-bar,
 *    rh-edit-actual-dialog, split-detail-dialog, reopen-comparison-dialog.
 * Nada de comportamento mudou — só o lugar onde cada pedaço vive.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearch } from "wouter";
import { BarChart3 } from "lucide-react";
import { EventSearchSelect } from "@/components/event-select";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { usePageTitle } from "@/components/common/use-page-title";
import { useAuth } from "@/hooks/use-auth";
import { useBudgetQueries } from "@/hooks/use-budget-queries";
import { useBudgetComparisonData } from "@/hooks/use-budget-comparison-data";
import { useComparisonActions } from "@/hooks/use-budget-comparison-actions";
import { useSidebar } from "@/contexts/sidebar-context";
import { useEventoEmFoco } from "@/lib/use-evento-em-foco";
import { normalizeRole } from "@shared/roles";
import { ComparisonHeader } from "@/components/budget/comparison-header";
import { ComparisonList } from "@/components/budget/comparison-list";
import { ConfirmAdjustDialog, RhActionDialog, RhDecisionBar } from "@/components/budget/rh-decision-bar";
import { RhEditActualDialog } from "@/components/budget/rh-edit-actual-dialog";
import { SplitDetailDialog } from "@/components/budget/split-detail-dialog";
import { ReopenComparisonDialog } from "@/components/budget/reopen-comparison-dialog";

const SEM_ESCALACOES: never[] = [];

export default function BudgetComparisonPage() {
  usePageTitle("Comparativo");
  const searchString = useSearch();
  const { urlCollaboratorId, urlFunctionId } = useMemo(() => {
    const p = new URLSearchParams(searchString);
    return {
      urlCollaboratorId: p.get("collaborator") || "",
      urlFunctionId: p.get("function") || "",
    };
  }, [searchString]);
  const [highlightCardId, setHighlightCardId] = useState<string>("");

  // Evento em foco (23/09): compartilhado com Planejado, Realizado, Controle RH e Notas.
  const { eventId: selectedEventId, setEventId: setSelectedEventId, sanitize: sanearEventoEmFoco } = useEventoEmFoco();
  const { user } = useAuth();
  const { sidebarWidth } = useSidebar();

  const q = useBudgetQueries(selectedEventId, {
    planned: true, actual: true, comparison: true, inclusions: true, notes: "actual", plannedLogs: true, fallbackColaborador: "-",
  });
  const { events, budgetPlanned, budgetActual, comparison, selectedEvent, getCollaboratorName, getFunctionName } = q;
  // Evento em foco que não existe mais (excluído) é descartado assim que a lista chega (23/09).
  useEffect(() => { if (events?.length) sanearEventoEmFoco(events.map(e => e.id)); }, [events, sanearEventoEmFoco]);

  // `normalizeRole` (23/09): papéis legados ("financeiro", "administrador")
  // perdiam os botões do RH nesta tela.
  const papel = normalizeRole(user?.role);
  const isRhOrAdmin = papel === "admin" || papel === "financial";

  const dados = useBudgetComparisonData({
    budgetPlanned, budgetActual, comparison, allTeamInclusions: q.teamInclusions ?? SEM_ESCALACOES, getCollaboratorName,
  });
  const { comparisonData, sortedData, selectedItems, setSelectedItems, setExpandedCards, selectedTotals } = dados;

  const acoes = useComparisonActions({
    selectedEventId, userId: user?.id, comparison, isLoadingComparison: q.qComparison.isLoading,
    comparisonData, sortedData, selectedItems, setSelectedItems,
  });

  const didScrollToCard = useRef(false);
  useEffect(() => {
    if (didScrollToCard.current || !sortedData.length || !urlCollaboratorId || !urlFunctionId) return;
    const idx = sortedData.findIndex(r => r.collaboratorId === urlCollaboratorId && r.functionId === urlFunctionId);
    if (idx >= 0) {
      didScrollToCard.current = true;
      const targetId = sortedData[idx].actual.id;
      const cardKey = `${urlCollaboratorId}-${urlFunctionId}`;
      setHighlightCardId(cardKey);
      setExpandedCards(prev => { const next = new Set(Array.from(prev)); next.add(targetId); return next; });
      setTimeout(() => {
        const el = document.querySelector(`[data-card-id="${cardKey}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
      setTimeout(() => setHighlightCardId(""), 4000);
    }
  }, [sortedData, urlCollaboratorId, urlFunctionId, setExpandedCards]);

  const trocarEvento = (v: string) => { setSelectedEventId(v); setExpandedCards(new Set()); setSelectedItems(new Set()); };

  return (
    <div className="space-y-5 max-w-5xl mx-auto pb-32">
      {/* ── Page header ── */}
      <PageHeader
        icon={BarChart3}
        title="Comparativo"
        subtitle="Planejado × Realizado — análise formal do RH; a NF é liberada no envio do Realizado"
        actions={selectedEventId && (
          <EventSearchSelect value={selectedEventId} onValueChange={trocarEvento} events={events} />
        )}
      />

      {/* ── No event selected ── */}
      {!selectedEventId && (
        <EmptyState
          live={false}
          icon={BarChart3}
          title="Selecione um evento"
          description="Analise as diferenças entre o planejado e o realizado. O RH revisa e aprova os valores para faturamento."
          className="py-20"
          action={
            <div className="w-full max-w-sm text-left">
              <EventSearchSelect value={selectedEventId} onValueChange={trocarEvento} events={events} />
            </div>
          }
        />
      )}

      {selectedEventId && selectedEvent && (
        <>
          <ComparisonHeader
            budgetActual={budgetActual}
            comparisonData={comparisonData}
            statusFilter={dados.statusFilter}
            setStatusFilter={dados.setStatusFilter}
            totals={dados.totals}
            rhComment={dados.rhComment}
            isRhOrAdmin={isRhOrAdmin}
            comparison={comparison}
            fechamento={{
              allItemsApproved: dados.allItemsApproved,
              realizadoChangedAfterApproval: dados.realizadoChangedAfterApproval,
              resyncPending: acoes.resyncFlashMutation.isPending,
              reopenPending: acoes.reopenComparisonMutation.isPending,
              approvePending: acoes.approveComparisonMutation.isPending,
              onResync: () => comparison && acoes.resyncFlashMutation.mutate(comparison.id),
              onReopen: () => { acoes.setReopenReason(""); acoes.setReopenReasonError(false); acoes.setReopenOpen(true); },
              onApprove: () => comparison && acoes.approveComparisonMutation.mutate(comparison.id),
            }}
          />

          {/* ── Detalhamento section ── */}
          <ComparisonList
            dados={dados}
            selectedEventId={selectedEventId}
            isLoading={q.qPlanned.isLoading || q.qActual.isLoading || q.qComparison.isLoading}
            isError={q.qPlanned.isError || q.qActual.isError || q.qComparison.isError}
            onRetry={() => { if (q.qPlanned.isError) q.qPlanned.refetch(); if (q.qActual.isError) q.qActual.refetch(); if (q.qComparison.isError) q.qComparison.refetch(); }}
            highlightCardId={highlightCardId}
            eventNotes={q.eventNotes}
            plannedLogs={q.plannedLogs}
            isRhOrAdmin={isRhOrAdmin}
            getCollaboratorName={getCollaboratorName}
            getFunctionName={getFunctionName}
            onEdit={acoes.openEditModal}
            onSplitDetail={acoes.setSplitDetail}
          />
        </>
      )}

      {/* ── Fixed RH Decision footer — apenas RH/admin decide ── */}
      {isRhOrAdmin && comparison && comparisonData.length > 0 && sortedData.some(r => (r.actual.rhStatus || "pendente") === "pendente") && (
        <RhDecisionBar sidebarWidth={sidebarWidth} sortedData={sortedData} selectedItems={selectedItems} selectedTotals={selectedTotals} acoes={acoes} />
      )}

      {/* ── Modal edição do realizado pelo RH ── */}
      <RhEditActualDialog acoes={acoes} />

      {/* ── Modal confirmação de aprovação com ajustes ── */}
      <ConfirmAdjustDialog
        open={acoes.confirmAdjustOpen}
        onOpenChange={acoes.setConfirmAdjustOpen}
        onConfirm={() => { acoes.setConfirmAdjustOpen(false); acoes.setActionModal({ type: "approve" }); }}
      />

      <SplitDetailDialog splitDetail={acoes.splitDetail} onClose={() => acoes.setSplitDetail(null)} getCollaboratorName={getCollaboratorName} getFunctionName={getFunctionName} />

      {/* ── Action confirmation modal ── */}
      <RhActionDialog acoes={acoes} sortedData={sortedData} selectedItems={selectedItems} selectedTotals={selectedTotals} getCollaboratorName={getCollaboratorName} />

      {/* ── Reabrir o comparativo aprovado (estorno do Flash) ── */}
      <ReopenComparisonDialog acoes={acoes} comparison={comparison} />
    </div>
  );
}
