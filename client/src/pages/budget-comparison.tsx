/**
 * COMPARATIVO Planejado × Realizado — página de composição (25/09,
 * modularização); redesenho 08/10.
 *
 * Dados (inalterados): `useBudgetQueries`, `useBudgetComparisonData` (base do
 * comparativo, filtros, totais, seleção) e `useComparisonActions` (mutations
 * + estado dos modais).
 *
 * Apresentação (08/10) — a etapa seguinte do Planejado e do Realizado, com a
 * MESMA casca: barra de contexto de 56px grudada com o título, o evento como
 * seletor (datas · prestações · local) e a situação do comparativo à direita;
 * conteúdo até 1560px com o comentário do RH, o resumo num painel só, o
 * fechamento (Flash) para quem decide, a fila de situações que conta e
 * recorta, a barra de filtros, a tabela de prestações e a barra de decisão
 * que sobe do rodapé quando há seleção. O rodapé fixo de antes (e a folga de
 * 8rem que ele exigia) saiu; carregando, erro e vazio são estados da página.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearch } from "wouter";
import { AlertCircle, ArrowRight, BarChart3, CheckCheck, Clock, RotateCw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EventSearchSelect } from "@/components/event-select";
import { PageHeader } from "@/components/common/page-header";
import { usePageTitle } from "@/components/common/use-page-title";
import { useAuth } from "@/hooks/use-auth";
import { useBudgetQueries } from "@/hooks/use-budget-queries";
import { useBudgetComparisonData } from "@/hooks/use-budget-comparison-data";
import { useComparisonActions } from "@/hooks/use-budget-comparison-actions";
import { useEventoEmFoco } from "@/lib/use-evento-em-foco";
import { normalizeRole } from "@shared/roles";
import type { Event } from "@shared/schema";
import { ComentarioDoComparativo, FechamentoCard, ResumoDoComparativo } from "@/components/budget/comparison-header";
import { ComparisonFilters, FilaDoComparativo } from "@/components/budget/comparison-filters";
import { ComparisonList } from "@/components/budget/comparison-list";
import { ConfirmAdjustDialog, RhActionDialog, RhDecisionBar } from "@/components/budget/rh-decision-bar";
import { RhEditActualDialog } from "@/components/budget/rh-edit-actual-dialog";
import { SplitDetailDialog } from "@/components/budget/split-detail-dialog";
import { ReopenComparisonDialog } from "@/components/budget/reopen-comparison-dialog";
import { ddmm } from "@/components/budget/types";

const SEM_ESCALACOES: never[] = [];

/** "11/09 – 12/09/2026" (ou só o dia de início) — o mesmo do Planejado e do Realizado. */
function periodoDoEvento(e: Event | undefined): string {
  if (!e?.startDate) return "";
  const ano = e.startDate.slice(0, 4);
  if (!e.endDate || e.endDate === e.startDate) return `${ddmm(e.startDate)}/${ano}`;
  return `${ddmm(e.startDate)} – ${ddmm(e.endDate)}/${e.endDate.slice(0, 4)}`;
}

/** Pílula de situação da barra (34px, a altura dos botões da família). */
function Situacao({ tom, icone: Icone, children, testid, onClick, title }: { tom: string; icone: typeof Clock; children: ReactNode; testid: string; onClick?: () => void; title?: string }) {
  const cls = `inline-flex items-center gap-1.5 h-[34px] px-3 rounded-lg text-sm font-medium whitespace-nowrap ${tom}`;
  // Com ação, o selo leva até onde se age (não repete a ação forte).
  if (onClick) {
    return (
      <button type="button" onClick={onClick} title={title} className={`pas-alvo ${cls} transition-[filter] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`} data-testid={testid}>
        <Icone className="w-4 h-4" aria-hidden="true" />{children}
      </button>
    );
  }
  return <span className={cls} data-testid={testid}><Icone className="w-4 h-4" aria-hidden="true" />{children}</span>;
}

/** Leva o foco ao botão de aprovar o comparativo (painel de fechamento). */
function irParaFechamento() {
  const b = document.querySelector<HTMLButtonElement>("[data-testid=\"button-aprovar-comparativo\"]");
  if (!b) return;
  b.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  b.focus({ preventScroll: true });
}

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
    budgetPlanned, budgetActual, comparison, allTeamInclusions: q.teamInclusions ?? SEM_ESCALACOES, getCollaboratorName, getFunctionName,
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

  // ── Estados ──
  const carregando = !!selectedEventId && q.estado.isLoading;
  const comErro = !!selectedEventId && !carregando && q.estado.isError;
  const vazio = !!selectedEventId && !carregando && !comErro && comparisonData.length === 0;
  const temLista = !!selectedEventId && !carregando && !comErro && !vazio && !!selectedEvent;
  const temPendente = sortedData.some(r => (r.actual.rhStatus || "pendente") === "pendente");
  const fechamentoPronto = !!comparison && comparison.status !== "aprovado" && dados.allItemsApproved;

  // ── Barra de contexto ──
  const detalheDoEvento = selectedEvent
    ? [periodoDoEvento(selectedEvent), temLista ? `${comparisonData.length} ${comparisonData.length === 1 ? "prestação" : "prestações"}` : null, selectedEvent.location]
        .filter(Boolean).join(" · ")
    : undefined;

  // A barra diz em que pé o comparativo está; a ação forte mora no contexto
  // (fechamento, seleção) — não se repete aqui.
  const nParaAnalise = comparisonData.filter(r => r.actual.sentForReview && (r.actual.rhStatus || "pendente") === "pendente").length;
  const situacaoDaBarra = !temLista ? null
    : comparison?.status === "aprovado" ? <Situacao tom="bg-success-soft text-success" icone={CheckCheck} testid="comparativo-situacao">Comparativo aprovado</Situacao>
    : fechamentoPronto ? <Situacao tom="bg-brand-soft text-primary" icone={Wallet} testid="comparativo-situacao" onClick={isRhOrAdmin ? irParaFechamento : undefined} title="Ir para o fechamento do comparativo">Pronto para fechar</Situacao>
    : nParaAnalise > 0 ? <Situacao tom="bg-info-soft text-info" icone={Clock} testid="comparativo-situacao" onClick={() => dados.setStatusFilter("para_analise")} title="Mostrar só as prestações para análise">{nParaAnalise} para análise</Situacao>
    : null;

  const barra = (
    <PageHeader
      variant="bar"
      title="Comparativo"
      // No celular a barra tem três andares: grudada, comia um quarto da tela (como no Planejado).
      className="mx-0 mt-0 gap-x-3 max-sm:static"
      subtitle={selectedEventId ? undefined : "planejado × realizado — a análise formal do RH"}
      context={selectedEventId ? <>
        <span aria-hidden="true" className="hidden sm:block w-px h-5 bg-border shrink-0" />
        <EventSearchSelect variante="barra" value={selectedEventId} onValueChange={trocarEvento} events={events} detalhe={detalheDoEvento} />
      </> : undefined}
      actions={situacaoDaBarra}
    />
  );

  // ── Conteúdo ──
  let conteudo: ReactNode;
  if (!selectedEventId) {
    conteudo = (
      <div className="pas-entra flex flex-col items-center text-center rounded-xl border border-border bg-card px-6 py-16" data-testid="comparativo-sem-evento">
        <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-soft text-primary mb-3.5" aria-hidden="true">
          <BarChart3 className="w-5 h-5" />
        </span>
        <h2 className="m-0 text-base font-semibold text-foreground">Selecione um evento</h2>
        <p className="m-0 mt-1.5 max-w-[460px] text-sm leading-relaxed text-muted-foreground">
          Compare o planejado com o realizado de cada prestação. O RH revisa, aprova os valores e, no fechamento, credita alimentação e mobilidade no Flash.
        </p>
        <div className="mt-5 w-full max-w-sm text-left">
          <EventSearchSelect value={selectedEventId} onValueChange={trocarEvento} events={events} className="sm:w-full" />
        </div>
      </div>
    );
  } else if (carregando) {
    // Esqueleto com a geometria real: resumo, fila, filtros e as primeiras linhas.
    conteudo = (
      <div role="status" aria-live="polite" aria-busy="true" aria-label="Carregando o comparativo" className="flex flex-col gap-4" data-testid="comparativo-carregando">
        <span className="sr-only">Carregando o comparativo…</span>
        <div aria-hidden="true" className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-2 lg:grid-cols-[1.5fr_repeat(4,1fr)]">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className={`px-4 py-3.5 space-y-2 ${i === 0 ? "col-span-2 lg:col-span-1" : ""}`}>
                <div className="pas-osso h-3 w-20" /><div className={`pas-osso ${i === 0 ? "h-7 w-40" : "h-5 w-24"}`} /><div className="pas-osso h-2.5 w-16" />
              </div>
            ))}
          </div>
          <div className="h-10 border-t border-border bg-surface-muted/60" />
        </div>
        <div aria-hidden="true" className="grid grid-cols-2 sm:grid-cols-4 rounded-xl border border-border bg-card overflow-hidden">
          {[0, 1, 2, 3].map((i) => (
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
        <div aria-hidden="true" className="rounded-xl border border-border bg-card overflow-hidden">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-border last:border-b-0">
              <div className="pas-osso w-4 h-4 rounded" />
              <div className="flex-1 space-y-1.5"><div className="pas-osso h-3.5 w-48 max-w-[60%]" /><div className="pas-osso h-2.5 w-32 max-w-[40%]" /></div>
              <div className="pas-osso h-5 w-20 hidden md:block" />
              <div className="pas-osso h-4 w-20 hidden sm:block" /><div className="pas-osso h-4 w-20" /><div className="pas-osso h-4 w-20 hidden sm:block" />
            </div>
          ))}
        </div>
      </div>
    );
  } else if (comErro) {
    conteudo = (
      <div role="alert" className="pas-entra flex flex-col items-center text-center rounded-xl border border-danger/25 bg-card px-6 py-14" data-testid="comparativo-erro">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-danger-soft text-danger mb-3" aria-hidden="true">
          <AlertCircle className="w-5 h-5" />
        </span>
        <h2 className="m-0 text-base font-semibold text-foreground">Não foi possível carregar o comparativo deste evento</h2>
        <p className="m-0 mt-1.5 max-w-[460px] text-sm leading-relaxed text-muted-foreground">
          O planejado, o realizado ou o comparativo deste evento não chegaram — sem eles as diferenças sairiam erradas. Verifique sua conexão e tente de novo.
        </p>
        <Button variant="outline" className="mt-5 rounded-lg" onClick={q.estado.retry} data-testid="comparativo-tentar-novamente">
          <RotateCw className="w-4 h-4 mr-1.5" aria-hidden="true" />Tentar novamente
        </Button>
      </div>
    );
  } else if (vazio) {
    conteudo = (
      <div className="pas-entra flex flex-col items-center text-center rounded-xl border border-border bg-card px-6 py-14" data-testid="comparativo-vazio">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-muted text-muted-foreground mb-3" aria-hidden="true">
          <BarChart3 className="w-5 h-5" />
        </span>
        <h2 className="m-0 text-base font-semibold text-foreground">Nenhuma prestação enviada para revisão</h2>
        <p className="m-0 mt-1.5 max-w-[460px] text-sm leading-relaxed text-muted-foreground">
          As prestações aparecem aqui depois de preenchidas e enviadas no Realizado.
          {dados.naoEnviadas > 0 && <> Este evento tem <strong className="font-semibold text-foreground">{dados.naoEnviadas} {dados.naoEnviadas === 1 ? "prestação ainda não enviada" : "prestações ainda não enviadas"}</strong>.</>}
        </p>
        <Button asChild variant="outline" className="mt-5 rounded-lg gap-1.5">
          <Link href="/budget-actual">Ir para o Realizado<ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>
        </Button>
      </div>
    );
  } else if (temLista) {
    conteudo = (
      <>
        {/* Aprovado: o comentário vai no painel de fechamento (quem decide o vê lá). */}
        {!(isRhOrAdmin && comparison?.status === "aprovado") && <ComentarioDoComparativo rhComment={dados.rhComment} comparison={comparison} />}
        <ResumoDoComparativo
          selectedEvent={selectedEvent}
          budgetActual={budgetActual || []}
          comparisonData={comparisonData}
          totals={dados.totals}
          naoEnviadas={dados.naoEnviadas}
        />
        {/* ── Fechamento do comparativo (crédito no Flash — regra 19/08) ── */}
        {isRhOrAdmin && comparison && (
          <FechamentoCard
            comparison={comparison}
            allItemsApproved={dados.allItemsApproved}
            realizadoChangedAfterApproval={dados.realizadoChangedAfterApproval}
            resyncPending={acoes.resyncFlashMutation.isPending}
            reopenPending={acoes.reopenComparisonMutation.isPending}
            approvePending={acoes.approveComparisonMutation.isPending}
            onResync={() => comparison && acoes.resyncFlashMutation.mutate(comparison.id)}
            onReopen={() => { acoes.setReopenReason(""); acoes.setReopenReasonError(false); acoes.setReopenOpen(true); }}
            onApprove={() => comparison && acoes.approveComparisonMutation.mutate(comparison.id)}
            observacao={comparison.status === "aprovado" ? dados.rhComment : null}
          />
        )}
        <FilaDoComparativo dados={dados} />
        <ComparisonFilters dados={dados} />
        <ComparisonList
          dados={dados}
          selectedEventId={selectedEventId}
          highlightCardId={highlightCardId}
          eventNotes={q.eventNotes}
          plannedLogs={q.plannedLogs}
          isRhOrAdmin={isRhOrAdmin}
          getCollaboratorName={getCollaboratorName}
          getFunctionName={getFunctionName}
          onEdit={acoes.openEditModal}
          onSplitDetail={acoes.setSplitDetail}
        />

        {/* ── Decisão do RH: barra de seleção que sobe do rodapé — apenas RH/admin decide ── */}
        {isRhOrAdmin && comparison && temPendente && (
          <RhDecisionBar
            sortedData={sortedData}
            selectedItems={selectedItems}
            selectedTotals={selectedTotals}
            acoes={acoes}
            onClearSelection={() => setSelectedItems(new Set())}
          />
        )}
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

      {/* ── Ajuste do realizado pelo RH ── */}
      <RhEditActualDialog acoes={acoes} getCollaboratorName={getCollaboratorName} getFunctionName={getFunctionName} />

      {/* ── Aprovação com ajustes do RH (lista o que mudou) ── */}
      <ConfirmAdjustDialog
        open={acoes.confirmAdjustOpen}
        onOpenChange={acoes.setConfirmAdjustOpen}
        onConfirm={() => { acoes.setConfirmAdjustOpen(false); acoes.setActionModal({ type: "approve" }); }}
        sortedData={sortedData}
        selectedItems={selectedItems}
        getCollaboratorName={getCollaboratorName}
      />

      <SplitDetailDialog splitDetail={acoes.splitDetail} onClose={() => acoes.setSplitDetail(null)} getCollaboratorName={getCollaboratorName} getFunctionName={getFunctionName} />

      {/* ── Confirmação da decisão (aprovar/recusar/devolver) ── */}
      <RhActionDialog acoes={acoes} sortedData={sortedData} selectedItems={selectedItems} selectedTotals={selectedTotals} getCollaboratorName={getCollaboratorName} />

      {/* ── Reabrir o comparativo aprovado (apaga os créditos do Flash) ── */}
      <ReopenComparisonDialog acoes={acoes} comparison={comparison} />
    </>
  );
}
