/**
 * Orçamento REALIZADO — página de composição (25/09, modularização);
 * redesenho 08/10.
 *
 * Dados (inalterados): `useBudgetQueries` (consultas), `useBudgetActualData`
 * (índices, filtros, totais, seleção), `useBudgetActualEditor` (estado do
 * modal, com viagem/alimentação DERIVADAS) e `useBudgetActualActions`
 * (mutations).
 *
 * Apresentação (08/10) — o passo seguinte do Planejado, com a MESMA casca:
 * barra de contexto de 56px grudada com o título, o evento como seletor
 * (nome + datas · prestações) e a ação forte ("Enviar para revisão (N)");
 * conteúdo até 1560px com o aviso de devolvidas, o resumo do evento num painel
 * só (total, planejado, diferença, casa/freela, aprovação e etapas), a fila de
 * situações que conta e recorta, a barra de filtros, a grade de extratos e a
 * barra de seleção que sobe do rodapé. O rodapé fixo de antes (e a folga de
 * 9rem que ele exigia) saiu.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearch } from "wouter";
import { AlertCircle, ArrowRight, CheckCheck, ClipboardCheck, RotateCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EventSearchSelect } from "@/components/event-select";
import { PageHeader } from "@/components/common/page-header";
import { usePageTitle } from "@/components/common/use-page-title";
import { QueryError } from "@/components/common/query-state";
import { useAuth } from "@/hooks/use-auth";
import { useBudgetQueries } from "@/hooks/use-budget-queries";
import { useBudgetActualData } from "@/hooks/use-budget-actual-data";
import { useBudgetActualEditor } from "@/hooks/use-budget-actual-editor";
import { useBudgetActualActions } from "@/hooks/use-budget-actual-actions";
import { useEventoEmFoco } from "@/lib/use-evento-em-foco";
import { useQuery } from "@tanstack/react-query";
import { normalizeRole } from "@shared/roles";
import type { Event } from "@shared/schema";
import { DevolvedBanner, ResumoDoRealizado } from "@/components/budget/actual-overview";
import { ActualFilters, FilaDoRealizado } from "@/components/budget/actual-filters";
import { ActualGroupList } from "@/components/budget/actual-group-list";
import { EditActualModal } from "@/components/budget/edit-actual-modal";
import { SendForReviewBar, SendForReviewDialog } from "@/components/budget/send-for-review-bar";
import { DeleteActualDialog, SplitDialog } from "@/components/budget/actual-dialogs";
import { EsqueletoDosCards } from "@/components/budget/budget-cards";
import { ddmm, formatCurrency } from "@/components/budget/types";

/** "11/09 – 12/09/2026" (ou só o dia de início) — o mesmo do Planejado. */
function periodoDoEvento(e: Event | undefined): string {
  if (!e?.startDate) return "";
  const ano = e.startDate.slice(0, 4);
  if (!e.endDate || e.endDate === e.startDate) return `${ddmm(e.startDate)}/${ano}`;
  return `${ddmm(e.startDate)} – ${ddmm(e.endDate)}/${e.endDate.slice(0, 4)}`;
}

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

  const q = useBudgetQueries(selectedEventId, {
    planned: true, actual: true, comparison: true, inclusions: true, notes: "actual", notesStaleTime: 30000,
    plannedLogs: true, tickets: true, settings: true,
  });
  const { events, collaborators, budgetActual, budgetPlanned, comparison: budgetComparison, teamInclusions, selectedEvent, getCollaboratorName, getFunctionName, functionNameById, ticketByInclusion, estado: estadoEvento } = q;
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
  const { filteredItems, selectedCards, setSelectedCards, pendingFiltered, sentForReview } = dados;

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

  const allSentForReview = sentForReview;
  const nSel = selectedCards.size;
  const totalSelecionado = useMemo(
    () => filteredItems.reduce((s, i) => (selectedCards.has(i.id) ? s + i.totalValue : s), 0),
    [filteredItems, selectedCards],
  );
  const itemParaRemover = acoes.confirmDeleteId ? budgetActual?.find(a => a.id === acoes.confirmDeleteId) : undefined;

  // ── Estados ──
  const carregando = !!selectedEventId && (isLoading || estadoEvento.isLoading);
  const comErro = !!selectedEventId && !carregando && estadoEvento.isError;
  const semPrestacoes = !!selectedEventId && !carregando && !comErro && dados.eventItems.length === 0;
  const temLista = !!selectedEventId && !carregando && !comErro && !semPrestacoes;

  // ── Barra de contexto ──
  const detalheDoEvento = selectedEvent
    ? [periodoDoEvento(selectedEvent), temLista ? `${dados.eventItems.length} ${dados.eventItems.length === 1 ? "prestação" : "prestações"}` : null, selectedEvent.location]
        .filter(Boolean).join(" · ")
    : undefined;

  const acoesDaBarra = temLista ? (
    allSentForReview ? (
      <span className="inline-flex items-center gap-1.5 h-[34px] px-3 rounded-lg bg-success-soft text-sm font-medium text-success" data-testid="realizado-tudo-enviado">
        <CheckCheck className="w-4 h-4" aria-hidden="true" />Tudo enviado para revisão
      </span>
    ) : (
      /* A ação forte da tela: com marcadas, envia as marcadas; sem, as
         pendentes visíveis (sempre com a confirmação, que diz quantas e quanto). */
      <Button
        type="button"
        // Sem pendente no recorte (ex.: fila em "Aprovadas") o botão fica neutro, não um azul apagado.
        variant={nSel === 0 && pendingFiltered.length === 0 ? "outline" : "default"}
        onClick={() => acoes.setConfirmSend(nSel > 0 ? "selected" : "all")}
        disabled={(nSel === 0 && pendingFiltered.length === 0) || sendForReviewMutation.isPending}
        title={nSel === 0 && pendingFiltered.length === 0 ? "Nenhuma prestação pendente neste recorte" : undefined}
        className={`pas-alvo shrink-0 h-[34px] rounded-lg px-3 text-sm font-medium gap-1.5 ${nSel === 0 && pendingFiltered.length === 0 ? "" : "bg-primary hover:bg-primary-hover text-primary-foreground"}`}
        data-testid="realizado-acao-principal"
      >
        <Send className="w-4 h-4" aria-hidden="true" />
        {nSel > 0
          ? `Enviar selecionadas (${nSel})`
          : <>Enviar para revisão{pendingFiltered.length > 0 ? ` (${pendingFiltered.length})` : ""}</>}
      </Button>
    )
  ) : null;

  const barra = (
    <PageHeader
      variant="bar"
      title="Realizado"
      // No celular a barra tem três andares: grudada, comia um quarto da tela (como no Planejado).
      className="mx-0 mt-0 gap-x-3 max-sm:static"
      subtitle={selectedEventId ? undefined : "prestação de contas das escalas enviadas do Planejado"}
      // Sem evento, quem escolhe é o seletor grande do centro — a barra não repete.
      context={selectedEventId ? <>
        <span aria-hidden="true" className="hidden sm:block w-px h-5 bg-border shrink-0" />
        <EventSearchSelect
          variante="barra"
          value={selectedEventId}
          onValueChange={trocarEvento}
          events={eventsWithPlanned}
          detalhe={detalheDoEvento}
        />
      </> : undefined}
      actions={acoesDaBarra}
    />
  );

  // ── Conteúdo ──
  let conteudo: ReactNode;
  if (!selectedEventId) {
    conteudo = (
      <div className="pas-entra flex flex-col items-center text-center rounded-xl border border-border bg-card px-6 py-16" data-testid="realizado-sem-evento">
        <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-soft text-primary mb-3.5" aria-hidden="true">
          <ClipboardCheck className="w-5 h-5" />
        </span>
        <h2 className="m-0 text-base font-semibold text-foreground">Selecione um evento</h2>
        <p className="m-0 mt-1.5 max-w-[460px] text-sm leading-relaxed text-muted-foreground">
          Registre a prestação de contas com os valores efetivamente gastos em cada escala — diárias, alimentação e mobilidade — e envie para a análise do RH.
        </p>
        <div className="mt-5 w-full max-w-sm text-left">
          {qEventsWithPlanned.isError ? (
            <QueryError error={qEventsWithPlanned.error} onRetry={() => qEventsWithPlanned.refetch()} title="Não foi possível carregar os eventos" />
          ) : (
            <EventSearchSelect value={selectedEventId} onValueChange={trocarEvento} events={eventsWithPlanned} className="sm:w-full" />
          )}
        </div>
      </div>
    );
  } else if (carregando) {
    // Esqueleto com a geometria real: resumo, fila, filtros e os primeiros cards.
    conteudo = (
      <div role="status" aria-live="polite" aria-busy="true" aria-label="Carregando o realizado" className="flex flex-col gap-4" data-testid="realizado-carregando">
        <span className="sr-only">Carregando o realizado…</span>
        <div aria-hidden="true" className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-2 md:grid-cols-[1.5fr_repeat(4,1fr)]">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className={`px-4 py-3.5 space-y-2 ${i === 0 ? "col-span-2 md:col-span-1" : ""}`}>
                <div className="pas-osso h-3 w-20" /><div className={`pas-osso ${i === 0 ? "h-7 w-40" : "h-5 w-24"}`} /><div className="pas-osso h-2.5 w-16" />
              </div>
            ))}
          </div>
          <div className="h-10 border-t border-border bg-surface-muted/60" />
        </div>
        <div aria-hidden="true" className="grid grid-cols-2 sm:grid-cols-5 rounded-xl border border-border bg-card overflow-hidden">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={`px-3.5 pt-3 pb-3.5 space-y-2 ${i > 0 ? "sm:border-l border-border" : ""}`}>
              <div className="pas-osso h-3 w-20" /><div className="pas-osso h-5 w-24" />
            </div>
          ))}
        </div>
        <div aria-hidden="true" className="flex gap-2">
          <div className="pas-osso h-[34px] flex-[1_1_220px] max-w-[320px] rounded-lg" />
          <div className="pas-osso h-[34px] w-[160px] rounded-lg hidden sm:block" />
          <div className="pas-osso h-[34px] w-[96px] rounded-lg hidden sm:block" />
        </div>
        <EsqueletoDosCards />
      </div>
    );
  } else if (comErro) {
    conteudo = (
      <div role="alert" className="pas-entra flex flex-col items-center text-center rounded-xl border border-danger/25 bg-card px-6 py-14" data-testid="realizado-erro">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-danger-soft text-danger mb-3" aria-hidden="true">
          <AlertCircle className="w-5 h-5" />
        </span>
        <h2 className="m-0 text-base font-semibold text-foreground">Não foi possível carregar o Realizado deste evento</h2>
        <p className="m-0 mt-1.5 max-w-[460px] text-sm leading-relaxed text-muted-foreground">
          As prestações, o planejado ou a escalação deste evento não chegaram — sem eles os valores e as diferenças sairiam errados. Verifique sua conexão e tente de novo.
        </p>
        <Button variant="outline" className="mt-5 rounded-lg" onClick={estadoEvento.retry} data-testid="realizado-tentar-novamente">
          <RotateCw className="w-4 h-4 mr-1.5" aria-hidden="true" />Tentar novamente
        </Button>
      </div>
    );
  } else if (semPrestacoes) {
    conteudo = (
      <div className="pas-entra flex flex-col items-center text-center rounded-xl border border-border bg-card px-6 py-14" data-testid="realizado-vazio">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-muted text-muted-foreground mb-3" aria-hidden="true">
          <ClipboardCheck className="w-5 h-5" />
        </span>
        <h2 className="m-0 text-base font-semibold text-foreground">Nenhuma prestação ainda</h2>
        <p className="m-0 mt-1.5 max-w-[460px] text-sm leading-relaxed text-muted-foreground">
          As prestações nascem quando o orçamento de cada colaborador é enviado do Planejado. Envie as escalas deste evento para começar.
        </p>
        <Button asChild variant="outline" className="mt-5 rounded-lg gap-1.5">
          <Link href="/budget-planned">Ir para o Planejado<ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>
        </Button>
      </div>
    );
  } else {
    conteudo = (
      <>
        <DevolvedBanner
          devolvedItems={dados.devolvedItems}
          getCollaboratorName={getCollaboratorName}
          onVer={dados.situacao === "devolvidas" ? undefined : () => dados.setSituacao("devolvidas")}
        />
        <ResumoDoRealizado selectedEvent={selectedEvent} eventItems={dados.eventItems} totais={dados.totaisDoEvento} />
        <FilaDoRealizado dados={dados} />
        <ActualFilters dados={dados} />
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
          onClearFilters={dados.limparFiltros}
        />

        {/* Barra de seleção: acompanha a rolagem no rodapé da lista. */}
        <SendForReviewBar
          selectedCount={nSel}
          totalSelecionado={totalSelecionado}
          isPending={sendForReviewMutation.isPending}
          onClearSelection={() => setSelectedCards(new Set())}
          // Passa pela mesma confirmação do "Enviar todas" (não preenchidos + aviso de NF)
          onSendSelected={() => { if (selectedEventId) acoes.setConfirmSend("selected"); }}
        />
      </>
    );
  }

  return (
    <>
      {/* Margens pela variável do layout: a barra sangra até as bordas da
          página e o conteúdo fica em até 1560px — a casca do Planejado. */}
      <div className="-mx-[var(--page-gutter)] -mt-[var(--page-gutter)]">
        {barra}
        <div className="px-[var(--page-gutter)] pt-5 pb-6">
          <div className="flex flex-col gap-4 max-w-[1560px] mx-auto">{conteudo}</div>
        </div>
      </div>

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
        nome={itemParaRemover ? getCollaboratorName(itemParaRemover.collaboratorId) : undefined}
        detalhe={itemParaRemover ? `${getFunctionName(itemParaRemover.functionId)} · ${formatCurrency(itemParaRemover.totalValue)}` : undefined}
        onClose={() => acoes.setConfirmDeleteId(null)}
        isPending={deleteMutation.isPending}
        onConfirm={id => deleteMutation.mutate(id)}
      />

      {/* ── Divisão de escalação (modal compartilhado com a Escalação) ── */}
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
    </>
  );
}
