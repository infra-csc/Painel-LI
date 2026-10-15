/**
 * Sugestão de escala — a página (25/09).
 *
 * Só orquestra os hooks (rascunho/período, edição da grade, colagem, envio) e
 * os blocos em components/scaling-validation/suggestion-page/*. Tinha 1.900
 * linhas e 30 useState num componente só.
 *
 * 07/10 (redesenho premium): irmã da Validação e da Aprovação — a barra de
 * 56px grudada (título, passos do módulo, estado do rascunho), a linha do
 * evento sem moldura, o resumo da grade numa faixa (o período da grade + vagas,
 * pessoas-dia e pico), a grade na altura da tela e a barra de envio que diz o
 * que falta. Estados (carregando, erro, sem acesso, sem evento) no desenho da
 * Validação. Lógica intacta: os mesmos hooks, as mesmas consultas e mutações.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, EyeOff } from "lucide-react";
import { PageContainer } from "@/components/common/page-container";
import { usePageTitle } from "@/components/common/use-page-title";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { apiErrorMessage } from "@/lib/utils";
import { useScalingEvent } from "@/lib/use-scaling-event";
import type { Event, Function as FunctionType } from "@shared/schema";
import { SuggestionGrid } from "@/components/scaling-validation/suggestion-grid";
import { ContextBar } from "@/components/scaling-validation/context-bar";
import { CopyEventDialog } from "@/components/scaling-validation/copy-event-dialog";
import { sortFunctionsByOrder } from "@/components/scaling-validation/scaling-grid-utils";
import { useSuggestionDraft } from "@/components/scaling-validation/suggestion-page/use-suggestion-draft";
import { useSuggestionGridEdit } from "@/components/scaling-validation/suggestion-page/use-suggestion-grid-edit";
import { useSuggestionPaste } from "@/components/scaling-validation/suggestion-page/use-suggestion-paste";
import { useSuggestionSend } from "@/components/scaling-validation/suggestion-page/use-suggestion-send";
import { SuggestionHeader } from "@/components/scaling-validation/suggestion-page/suggestion-header";
import { GridSummary } from "@/components/scaling-validation/suggestion-page/grid-summary";
import { SuggestionBanners, type BannerKind } from "@/components/scaling-validation/suggestion-page/suggestion-banners";
import { SuggestionToolbar } from "@/components/scaling-validation/suggestion-page/suggestion-toolbar";
import { ReviewPanel } from "@/components/scaling-validation/suggestion-page/review-panel";
import {
  AcessoNegadoSugestao, ErroAoCarregar, EsqueletoDaSugestao, LeituraSemGrade, PeriodoInvalido, ProximosPassos, SemEvento,
} from "@/components/scaling-validation/suggestion-page/suggestion-empty-state";
import { SendBar } from "@/components/scaling-validation/suggestion-page/send-bar";
import { eventosParaTrecho as eventosDoTrecho } from "@/components/scaling-validation/trechos-da-perna";
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

  const { data: events, isLoading: loadingEvents, error: eventsError, isFetching: fetchingEvents } = useQuery<Event[]>({ queryKey: ["/api/events"] });
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

  // Período do evento × período da grade: o filete dos "dias do evento" no
  // cabeçalho da grade e o "Período do evento" do resumo (já aplicado = discreto).
  const eventStart = selectedEvent?.startDate ? String(selectedEvent.startDate).slice(0, 10) : "";
  const eventEnd = selectedEvent?.endDate ? String(selectedEvent.endDate).slice(0, 10) : "";
  // "Vem direto de / segue direto para" (09/10): os outros eventos, do mais próximo ao mais longe.
  const eventosParaTrecho = useMemo(() => eventosDoTrecho(activeEvents, selectedEvent), [activeEvents, selectedEvent]);
  const isEventPeriod = !!eventStart && draft.applied.start === eventStart && draft.applied.end === eventEnd;
  const gridHasMargin = !!eventStart && dates.some((d) => d < eventStart || d > eventEnd);

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
        <AcessoNegadoSugestao />
      </PageContainer>
    );
  }

  return (
    <PageContainer fluid className="pb-2">
      <SuggestionHeader eventId={eventId} readOnly={readOnly} sending={send.sendMutation.isPending} hasContent={hasContent} draftSavedAt={draftSavedAt} />

      {eventsError ? (
        <ErroAoCarregar
          mensagem={apiErrorMessage(eventsError, "Verifique sua conexão e tente novamente.")}
          tentando={fetchingEvents}
          onRetry={() => queryClient.invalidateQueries({ queryKey: ["/api/events"] })}
        />
      ) : loadingEvents || loadingFunctions ? (
        <EsqueletoDaSugestao label="Carregando eventos e funções…" />
      ) : (
        <>
          {/* Linha do evento: seletor · fatos do evento · recado para as áreas (disclosure) */}
          <ContextBar
            events={activeEvents}
            eventId={eventId}
            onEventChange={setEventId}
            selectedEvent={selectedEvent}
            disabled={busy}
            // Trocar de evento é leitura: só o envio em curso trava o seletor
            // (o modo leitura trava a edição, não a navegação entre eventos).
            eventPickerDisabled={send.sendMutation.isPending}
            observations={draft.eventObservations}
            onObservationsChange={draft.setEventObservations}
            eventTestId="scaling-suggestion-event"
            eventTriggerRef={eventTriggerRef}
          />

          {/* Uma faixa de estado por vez */}
          <SuggestionBanners banner={banner} send={send} eventId={eventId} readOnly={readOnly} functionsError={functionsError} refetchFunctions={refetchFunctions} />

          {!eventId ? (
            <SemEvento parkedEventName={parkedEventName} readOnly={readOnly} busy={busy} functionsError={!!functionsError}
              onPickEvent={focusEventPicker} onCopyEvent={() => paste.setShowCopyEvent(true)} />
          ) : sent && rows.length === 0 ? (
            // Recém-enviado: a faixa verde diz o quê; aqui, o que acontece agora.
            <ProximosPassos />
          ) : readOnly && rows.length === 0 ? (
            // Leitura: a grade é rascunho de quem monta — nada de caminhos desabilitados.
            <LeituraSemGrade temEnviadas={sentSummary.total > 0} />
          ) : (
            <>
              {/* Resumo da grade: o período (controle) + vagas, pessoas-dia e pico */}
              <div className="space-y-2">
                <GridSummary
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
                  isEventPeriod={isEventPeriod}
                  rows={rows}
                  dates={dates}
                  vagas={records.length}
                  pessoasDia={send.summary.pessoasDia}
                  linhas={send.summary.funcoes}
                  nearLimit={send.nearLimit}
                  overLimit={send.overLimit}
                />
                {/* Erro de período: inline, em vermelho, logo abaixo dos campos de data. */}
                {periodError && (
                  <p id="sug-period-error" role="alert" className="sug-entra flex items-start gap-1.5 text-xs font-medium text-danger">
                    <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {periodError}
                  </p>
                )}
              </div>

              {/* Grade */}
              <section className="space-y-3" aria-labelledby="sug-grade">
                <SuggestionToolbar
                  rowsCount={rows.length} liveText={send.liveText} gridReady={gridReady} busy={busy} readOnly={readOnly}
                  functionsError={!!functionsError} hasContent={hasContent} showEventLegend={gridHasMargin && rows.length > 0}
                  onPaste={paste.openPaste} onCopyEvent={() => paste.setShowCopyEvent(true)} onAddFunction={edit.openAddFunction} onClear={() => setConfirmClear(true)}
                />

                {gridReady && (
                  <ReviewPanel pendencias={pendencias} showAll={send.showAllReview} onToggleShowAll={() => send.setShowAllReview((v) => !v)} onFocusRow={(id) => send.focusRow(id, "logistica")} />
                )}

                {dates.length === 0 ? (
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
                      onCopyEvent={() => paste.setShowCopyEvent(true)}
                      startDisabled={!!functionsError}
                      disabled={busy}
                      openRowId={send.openRowId} onOpenRowChange={send.setOpenRowId}
                      vagasTotal={records.length}
                      eventStart={eventStart} eventEnd={eventEnd}
                      eventosParaTrecho={eventosParaTrecho}
                    />
                  </div>
                )}
              </section>

              {/* Barra de envio (sticky) + prévia sob demanda */}
              {gridReady && !sent && rows.length > 0 && <SendBar send={send} />}
            </>
          )}
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
