/**
 * Sugestão de escala — a página (25/09).
 *
 * Só orquestra os hooks (rascunho/período, edição da grade, colagem, envio) e
 * os blocos em components/scaling-validation/suggestion-page/*. Tinha 1.900
 * linhas e 30 useState num componente só.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, EyeOff, ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { LoadingState } from "@/components/common/loading-state";
import { usePageTitle } from "@/components/common/use-page-title";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { apiErrorMessage } from "@/lib/utils";
import { useScalingEvent } from "@/lib/use-scaling-event";
import type { Event, Function as FunctionType } from "@shared/schema";
import { SuggestionGrid } from "@/components/scaling-validation/suggestion-grid";
import { ScalingModuleNav } from "@/components/scaling-validation/scaling-module-nav";
import { ContextBar } from "@/components/scaling-validation/context-bar";
import { StateBanner } from "@/components/scaling-validation/state-banner";
import { CopyEventDialog } from "@/components/scaling-validation/copy-event-dialog";
import { sortFunctionsByOrder } from "@/components/scaling-validation/scaling-grid-utils";
import { useSuggestionDraft } from "@/components/scaling-validation/suggestion-page/use-suggestion-draft";
import { useSuggestionGridEdit } from "@/components/scaling-validation/suggestion-page/use-suggestion-grid-edit";
import { useSuggestionPaste } from "@/components/scaling-validation/suggestion-page/use-suggestion-paste";
import { useSuggestionSend } from "@/components/scaling-validation/suggestion-page/use-suggestion-send";
import { SuggestionBanners, type BannerKind } from "@/components/scaling-validation/suggestion-page/suggestion-banners";
import { SuggestionToolbar } from "@/components/scaling-validation/suggestion-page/suggestion-toolbar";
import { ReviewPanel } from "@/components/scaling-validation/suggestion-page/review-panel";
import { SemEvento, PeriodoInvalido } from "@/components/scaling-validation/suggestion-page/suggestion-empty-state";
import { SendBar } from "@/components/scaling-validation/suggestion-page/send-bar";
import { AddFunctionDialog } from "@/components/scaling-validation/suggestion-page/add-function-dialog";
import { PasteDialog } from "@/components/scaling-validation/suggestion-page/paste-dialog";
import { SuggestionConfirmDialogs } from "@/components/scaling-validation/suggestion-page/suggestion-confirm-dialogs";

export default function ScalingSuggestionPage() {
  usePageTitle("Sugestão de escala");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { eventId, setEventId, sanitize } = useScalingEvent("/scaling-suggestion");
  const [confirmClear, setConfirmClear] = useState(false);
  const eventTriggerRef = useRef<HTMLButtonElement>(null);

  const canAccess = hasPermission(user, "canAccessScalingSuggestion");
  // Modo leitura: entra na tela (compras/financeiro), mas só Produção/Admin montam e enviam.
  const readOnly = !hasPermission(user, "canEditScalingSuggestion");

  const { data: events, isLoading: loadingEvents, error: eventsError } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: functions, isLoading: loadingFunctions, error: functionsError, refetch: refetchFunctions } = useQuery<FunctionType[]>({ queryKey: ["/api/functions"] });

  const activeEvents = useMemo(
    () => (events ?? []).filter((e) => e.status !== "excluido" && e.status !== "excluído"),
    [events],
  );
  useEffect(() => { if (events) sanitize(activeEvents.map((e) => e.id)); }, [events, activeEvents, sanitize]);
  const selectedEvent = useMemo(() => activeEvents.find((e) => e.id === eventId), [activeEvents, eventId]);
  const sortedFunctions = useMemo(() => sortFunctionsByOrder(functions ?? []), [functions]);
  const areaByFunctionId = useMemo(
    () => new Map((functions ?? []).map((f) => [f.id, f.responsibleArea ?? ""] as const)),
    [functions],
  );

  // O rascunho avisa quando um evento novo carregou; o hook de envio é quem zera
  // o estado pós-envio. Como um depende do outro, a ligação passa por um ref.
  const resetAfterEventChangeRef = useRef<() => void>(() => {});
  const draft = useSuggestionDraft({
    eventId, selectedEvent, userId: user?.id, readOnly, toast,
    onEventLoaded: () => resetAfterEventChangeRef.current(),
  });
  const edit = useSuggestionGridEdit(draft, sortedFunctions);
  const send = useSuggestionSend({ draft, eventId, selectedEvent, canAccess, readOnly, toast });
  resetAfterEventChangeRef.current = send.resetAfterEventChange;
  const paste = useSuggestionPaste({ draft, functions, selectedEvent, userId: user?.id, readOnly, presentFunctionIds: edit.presentFunctionIds, toast });

  const { rows, dates, periodError, draftSavedAt, hasContent, draftLoadedFor } = draft;
  const { busy, sent, sentCheckFailed, sentSummary, records, issuesByRow, pendencias } = send;

  const gridReady = !!eventId && dates.length > 0;
  /** O estado vazio "escolha o evento" abre o seletor da barra pelo ref (sem querySelector). */
  const focusEventPicker = () => { eventTriggerRef.current?.click(); };
  // Grade de OUTRO evento ainda em memória (o usuário limpou o seletor): o
  // nome vem do último evento carregado — o rascunho dele já foi gravado no flush.
  const parkedEventName = !eventId && rows.length > 0
    ? activeEvents.find((e) => e.id === draftLoadedFor.current)?.name ?? null
    : null;
  const clearGrid = () => { draft.clearGrid(); setConfirmClear(false); };

  // ── UMA faixa de estado por vez (nunca três empilhadas) ──
  const banner: BannerKind | null =
    sentCheckFailed ? "sentCheckFailed"
      : functionsError ? "functionsError"
        : sent ? "sent"
          // Sem evento escolhido não há o que avisar (nem o que cancelar): o
          // aviso fala de UM evento e a ação de cancelar exige o eventId.
          : (!!eventId && sentSummary.total > 0) ? "jaEnviado"
            : readOnly ? "leitura"
              : null;

  // ── Render ──
  if (!canAccess) {
    return (
      <PageContainer>
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="text-lg font-semibold text-foreground mb-2">Acesso negado</h3>
          <p className="text-muted-foreground text-sm">Você não tem permissão para sugerir escala.</p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer fluid>
      {/* h1 = nome da tela (o mesmo do menu e da aba); "nova" é o que se faz nela, vai no subtítulo. */}
      <PageHeader
        icon={ListPlus}
        title="Sugestão de escala"
        subtitle="Nova sugestão: monte a escala por função e dia e envie para as áreas validarem. Cada pessoa vira 1 vaga com seus dias de trabalho."
        actions={<ScalingModuleNav current="suggestion" eventId={eventId} />}
      />

      {eventsError ? (
        <StateBanner
          tone="red" icon={AlertTriangle} role="alert"
          title="Não foi possível carregar eventos e funções"
          detail={<>{apiErrorMessage(eventsError, "Verifique sua conexão e tente novamente.")} O rascunho local da grade está intacto — nada se perdeu.</>}
          actions={
            <Button variant="outline" size="sm" className="rounded-lg h-8 bg-card" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/events"] })}>
              Tentar novamente
            </Button>
          }
        />
      ) : loadingEvents || loadingFunctions ? (
        <LoadingState count={3} label="Carregando eventos e funções…" />
      ) : (
        <>
          {/* Barra de contexto: evento · período do evento · GRADE · comentários (disclosure) */}
          <ContextBar
            events={activeEvents}
            eventId={eventId}
            onEventChange={setEventId}
            selectedEvent={selectedEvent}
            periodStart={draft.periodStart}
            periodEnd={draft.periodEnd}
            onPeriodChange={draft.requestPeriod}
            bounds={draft.bounds}
            daysCount={dates.length}
            onEventPeriod={draft.applyEventPeriod}
            onShrink={draft.shrinkOneDay}
            canShrink={dates.length > 1}
            onGrow={draft.growOneDay}
            canGrow={draft.canGrow}
            periodInvalid={!!periodError}
            disabled={busy}
            observations={draft.eventObservations}
            onObservationsChange={draft.setEventObservations}
            eventTestId="scaling-suggestion-event"
            eventTriggerRef={eventTriggerRef}
          />

          {/* Uma faixa de estado por vez */}
          <SuggestionBanners banner={banner} send={send} eventId={eventId} readOnly={readOnly} functionsError={functionsError} refetchFunctions={refetchFunctions} />

          {/* Grade */}
          <section className="space-y-3" aria-labelledby="sug-grade">
            <SuggestionToolbar
              eventId={eventId} rowsCount={rows.length} summary={send.summary} vagasLabel={send.vagasLabel} overLimit={send.overLimit}
              liveText={send.liveText} gridReady={gridReady} busy={busy} readOnly={readOnly} functionsError={!!functionsError} hasContent={hasContent}
              onPaste={paste.openPaste} onCopyEvent={() => paste.setShowCopyEvent(true)} onAddFunction={edit.openAddFunction} onClear={() => setConfirmClear(true)}
            />

            {/* Erro de período: inline, em vermelho, acima da grade. */}
            {periodError && (
              <p id="sug-period-error" role="alert" className="flex items-start gap-1.5 text-xs text-danger">
                <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" /> {periodError}
              </p>
            )}

            {gridReady && (
              <ReviewPanel pendencias={pendencias} showAll={send.showAllReview} onToggleShowAll={() => send.setShowAllReview((v) => !v)} onFocusRow={(id) => send.focusRow(id, "logistica")} />
            )}

            {!eventId ? (
              <SemEvento parkedEventName={parkedEventName} readOnly={readOnly} busy={busy} functionsError={!!functionsError}
                onPickEvent={focusEventPicker} onCopyEvent={() => paste.setShowCopyEvent(true)} />
            ) : dates.length === 0 ? (
              <PeriodoInvalido canReset={!!selectedEvent && !readOnly} onEventPeriod={draft.applyEventPeriod} />
            ) : (
              /* Modo leitura: a grade fica travada (disabled nos controles) e
                 o rótulo diz isso em palavras — o "esmaecido" de antes parecia
                 tela carregando. */
              <div className="space-y-2" aria-disabled={readOnly || undefined}>
                {readOnly && (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <EyeOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    Grade em modo leitura — os campos não aceitam edição.
                  </p>
                )}
                <SuggestionGrid
                  rows={rows} dates={dates} issuesByRow={issuesByRow} areaByFunctionId={areaByFunctionId}
                  onChangeRow={edit.changeRow} onChangeQty={edit.changeQty}
                  onDuplicateRow={edit.duplicateRow} onRemoveRow={edit.removeRow}
                  onPaste={paste.openPaste} onAddFunction={edit.openAddFunction}
                  disabled={busy}
                  openRowId={send.openRowId} onOpenRowChange={send.setOpenRowId}
                  vagasTotal={records.length}
                />
              </div>
            )}
          </section>

          {/* Barra de envio (sticky) + prévia sob demanda */}
          {gridReady && !sent && <SendBar send={send} draftSavedAt={draftSavedAt} />}
        </>
      )}

      <AddFunctionDialog edit={edit} sortedFunctions={sortedFunctions} />

      {/* Copiar de outro evento (usa o GET existente do outro evento) */}
      <CopyEventDialog
        open={paste.showCopyEvent}
        onOpenChange={paste.setShowCopyEvent}
        events={activeEvents}
        currentEventId={eventId}
        onSelectDestination={setEventId}
        functions={functions ?? []}
        dates={dates}
        existingRows={rows}
        onApply={paste.applyCopy}
      />

      <PasteDialog paste={paste} dates={dates} sortedFunctions={sortedFunctions} presentFunctionIds={edit.presentFunctionIds} />

      <SuggestionConfirmDialogs
        draft={draft} edit={edit} paste={paste} send={send} selectedEvent={selectedEvent}
        confirmClear={confirmClear} setConfirmClear={setConfirmClear} onClearGrid={clearGrid}
      />
    </PageContainer>
  );
}
