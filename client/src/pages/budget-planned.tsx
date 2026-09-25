/**
 * Orçamento PLANEJADO — página de composição (25/09, modularização).
 *
 * Até 24/09 este arquivo tinha ~4.300 linhas com consultas, motor, rascunho,
 * planilha, cards, modal e diálogos misturados. Agora:
 *  - dados: `useBudgetQueries` (consultas), `useBudgetDraft` (rascunho por
 *    usuário/evento), `useBudgetEngine` (cálculo via @shared/budget-engine),
 *    `useBudgetFilters` (busca/filtro/seleção), `useBudgetEditModal` e
 *    `useBudgetPlannedActions` (mutations);
 *  - apresentação: components/budget/** (BudgetOverviewCards, BudgetFilters,
 *    BudgetCards, BudgetSheet, BudgetEditModal, diálogos e a barra de envio).
 * Nada de comportamento mudou — só o lugar onde cada pedaço vive.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearch } from "wouter";
import { Calculator, Calendar, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EventSearchSelect } from "@/components/event-select";
import { EmptyState } from "@/components/common/empty-state";
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
import { normalizeRole } from "@shared/roles";
import type { Event } from "@shared/schema";
import { BudgetOverviewCards } from "@/components/budget/budget-overview-cards";
import { BudgetFilters } from "@/components/budget/budget-filters";
import { BudgetCards } from "@/components/budget/budget-cards";
import { BudgetSheet } from "@/components/budget/budget-sheet";
import { BudgetEditModal } from "@/components/budget/budget-edit-modal";
import { ConfirmSendDialog } from "@/components/budget/confirm-send-dialog";
import { NaoParticipouDialog, RestoreParticipacaoDialog } from "@/components/budget/nao-participou-dialog";
import { EnviarParaRealizadoBar } from "@/components/budget/enviar-para-realizado-bar";
import { formatEventDate, nomeDaVaga as nomeDaVagaDe, type CalculatedBudget } from "@/components/budget/types";

export default function BudgetPlannedPage() {
  usePageTitle("Planejado");
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
  const [activeTab, setActiveTab] = useState<"overview" | "sheet">("overview");

  // `normalizeRole` (23/09): papéis legados ("administrador", "producao")
  // perdiam a edição nesta tela.
  const papel = normalizeRole(user?.role);
  const canEdit = papel === "admin" || papel === "production";
  const canMarkNotAttended = isRhOrAdmin(user);

  const q = useBudgetQueries(selectedEventId, {
    planned: true, actual: true, inclusions: true, notes: "planned", functionValues: true, tickets: true, settings: true,
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
  const { budgetOverrides, setBudgetOverrides, draftRestored, setDraftRestored } = draft;

  const motor = useBudgetEngine({
    teamInclusions: q.teamInclusions, functionValues, collaborators, functionNamesById: functionNameById, systemSettings,
    ticketByInclusion, eventLocation: selectedEvent?.location ?? null, budgetOverrides,
    allBudgetPlanned: q.budgetPlanned, existingActuals: q.budgetActual,
  });
  const { calculatedBudgets, sentToActual, notAttendedKeys, isCardNotAttended, plannedByCollabFunc, actualsByCollabFunc, totalGeral, stats } = motor;

  const filtros = useBudgetFilters({ calculatedBudgets, getCollaboratorName, getFunctionName, sentToActual, notAttendedKeys });
  const { filteredBudgets, selectableFiltered, selectedIds, setSelectedIds } = filtros;

  const nomeDaVaga = useCallback((b: CalculatedBudget) => nomeDaVagaDe(b.inclusion, getCollaboratorName), [getCollaboratorName]);

  const modal = useBudgetEditModal({
    selectedEventId, systemSettings, allBudgetPlanned: q.budgetPlanned, getCollaboratorName, getFunctionName, setBudgetOverrides, setDraftRestored,
  });

  const acoes = useBudgetPlannedActions({
    selectedEventId, userId: user?.id, allBudgetPlanned: q.budgetPlanned, calculatedBudgets, selectedIds, setSelectedIds,
    sentToActual, isCardNotAttended, clearDraftEntries: draft.clearDraftEntries,
  });
  const { toggleNotAttendedMutation, createAndMarkNotAttendedMutation, sendToActualMutation, sendSelectedToActualMutation } = acoes;

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

  return (
    <div className="space-y-7 max-w-5xl mx-auto pb-32">

      {/* ── Cabeçalho ── */}
      <PageHeader
        icon={Calculator}
        title="Planejado"
        subtitle="Orçamento planejado por colaborador — cálculo automático das escalações confirmadas"
        actions={<>
          {isRhOrAdmin(user) && (
            <MotivoDesabilitado motivo="Aplica os valores padrão configurados em Sistema a todos os orçamentos ainda não enviados" desabilitado={acoes.isApplyingDefaults}>
              <Button
              variant="outline"
              size="sm"
              onClick={acoes.handleApplyDefaults}
              disabled={acoes.isApplyingDefaults}
              className="gap-1.5 text-xs font-semibold rounded-lg whitespace-nowrap hover:text-primary hover:border-primary"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${acoes.isApplyingDefaults ? "animate-spin" : ""}`} aria-hidden="true" />
              {acoes.isApplyingDefaults ? "Atualizando…" : "Atualizar padrões"}
            </Button>
            </MotivoDesabilitado>
          )}
          {selectedEventId && (
            /* Tokens no lugar de `style={{}}`/hex (23/09), ao ligar o seletor ao evento em foco. */
            <div className="flex flex-col items-end gap-1">
              <EventSearchSelect value={selectedEventId} onValueChange={setSelectedEventId} events={eventsWithInclusions} />
              {selectedEvent?.startDate && (
                <span className="flex items-center gap-1 text-2xs text-muted-foreground">
                  <Calendar className="w-3 h-3" aria-hidden="true" />
                  {formatEventDate(selectedEvent.startDate)}
                </span>
              )}
            </div>
          )}
        </>}
      />

      {/* ── Tela 1: Seleção de evento ── */}
      {!selectedEventId ? (
        <EmptyState
          live={false}
          icon={Calculator}
          title="Selecione um evento"
          description="Visualize o orçamento previsto com base nas escalações confirmadas. Valores calculados automaticamente."
          className="py-20"
          action={
            <div className="w-full max-w-sm text-left">
              <EventSearchSelect value={selectedEventId} onValueChange={setSelectedEventId} events={eventsWithInclusions} />
            </div>
          }
        />
      ) : (
          <>
            <BudgetOverviewCards selectedEvent={selectedEvent} totalGeral={totalGeral} stats={stats} />

            {/* ── Aviso de rascunho restaurado ── */}
            {draftRestored && Object.keys(budgetOverrides).length > 0 && (
              <div role="status" className="flex items-center gap-2 px-3 py-2 rounded-lg text-2xs bg-warning-soft border border-warning/25 text-warning">
                <span className="w-1.5 h-1.5 rounded-full bg-warning-strong shrink-0" />
                <span>Rascunho de edições restaurado</span>
                <span className="text-warning-strong">·</span>
                <button
                  onClick={() => { setBudgetOverrides({}); setDraftRestored(false); }}
                  className="font-semibold underline underline-offset-2 hover:text-warning transition-colors"
                  aria-label="Descartar rascunho de edições restaurado"
                >
                  Descartar
                </button>
              </div>
            )}

            {/* ── Seletor de Abas ── */}
            <div className="flex items-center gap-1 border-b border-border">
              <button
                onClick={() => setActiveTab("overview")}
                className={`px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px ${activeTab === "overview" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-slate-600"}`}
              >
                Visão Geral
              </button>
              <button
                onClick={() => setActiveTab("sheet")}
                className={`px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px ${activeTab === "sheet" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-slate-600"}`}
              >
                Planilha de Edição
              </button>
            </div>

            {activeTab === "overview" ? (<>
              <BudgetFilters filtros={filtros} />
              <BudgetCards
                filteredBudgets={filteredBudgets}
                totalCalculated={calculatedBudgets.length}
                isLoading={q.qInclusions.isLoading || q.qFunctionValues.isLoading}
                isError={q.qInclusions.isError || q.qFunctionValues.isError}
                onRetry={() => { if (q.qInclusions.isError) q.qInclusions.refetch(); if (q.qFunctionValues.isError) q.qFunctionValues.refetch(); }}
                highlightCardId={highlightCardId}
                sentToActual={sentToActual}
                selectedIds={selectedIds}
                collapsedCards={collapsedCards}
                plannedByCollabFunc={plannedByCollabFunc}
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
              />
            </>) : (
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
                totalGeral={totalGeral}
                nomeDaVaga={nomeDaVaga}
                getFunctionName={getFunctionName}
                isAdmin={isRhOrAdmin(user)}
                onSend={enviarLote}
              />
            )}
          </>
        )}

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

      {/* ── Sticky Footer — Barra de Progresso do Envio ── */}
      {selectedEventId && calculatedBudgets.length > 0 && (
        <EnviarParaRealizadoBar totalGeral={totalGeral} stats={stats} selectedIds={selectedIds} onSend={enviarLote} />
      )}
    </div>
  );
}
