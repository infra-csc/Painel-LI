/**
 * Validação de escala — a página (25/09).
 *
 * Só orquestra: dados/escopo (`useValidationData`), seleção
 * (`useValidationSelection`), ações (`useValidationActions`) e os blocos em
 * components/scaling-validation/validation-page/*. Tinha 1.300 linhas.
 */
import { useState } from "react";
import { Link } from "wouter";
import { ClipboardCheck, CloudOff, Eye, History, Info, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PageContainer } from "@/components/common/page-container";
import { EmptyState } from "@/components/common/empty-state";
import { usePageTitle } from "@/components/common/use-page-title";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { apiErrorMessage, cn } from "@/lib/utils";
import { scalingHref, useScalingEvent } from "@/lib/use-scaling-event";
import { ALL_EVENTS_ROW_LIMIT } from "@shared/scaling-validation-rules";
import { SuggestionsList } from "@/components/scaling-validation/suggestions-list";
import { SECTION_TITLE } from "@/components/scaling-validation/logistics-chips";
import { ScheduleBoard } from "@/components/scaling-validation/schedule-board";
import { AdjustRequestDialog, DeleteRequestDialog, IncludeRequestDialog } from "@/components/scaling-validation/change-request-dialogs";
import { SuggestionDetailDrawer } from "@/components/scaling-validation/suggestion-detail-drawer";
import { DecidedPanel } from "@/components/scaling-validation/decided-panel";
import type { ApiError } from "@/components/scaling-validation/types";
import { BASE_PATH, eventos, vagas, type ValidationTab } from "@/components/scaling-validation/validation-page/validation-shared";
import { ValidationSkeleton } from "@/components/scaling-validation/validation-page/action-with-hint";
import { useValidationData } from "@/components/scaling-validation/validation-page/use-validation-data";
import { useValidationSelection } from "@/components/scaling-validation/validation-page/use-validation-selection";
import { useValidationActions } from "@/components/scaling-validation/validation-page/use-validation-actions";
import { ValidationHeader } from "@/components/scaling-validation/validation-page/validation-header";
import { ValidationSummary } from "@/components/scaling-validation/validation-page/validation-summary";
import { ValidationToolbar } from "@/components/scaling-validation/validation-page/validation-toolbar";
import { BulkActionBar } from "@/components/scaling-validation/validation-page/bulk-action-bar";
import { ValidateDialog } from "@/components/scaling-validation/validation-page/validate-dialog";

export default function ScalingValidationPage() {
  usePageTitle("Validação de escala");
  const { user } = useAuth();
  // A tela ABRE em "Todos os eventos" (regra do dono, 26/08): o combobox virou
  // FILTRO. Sem `?eventId=` na URL, nada é pré-selecionado.
  const { eventId, setEventId, sanitize } = useScalingEvent(BASE_PATH, { allEventsDefault: true });
  const [tab, setTab] = useState<ValidationTab>("lista");

  const d = useValidationData({ user, eventId, sanitize });
  const sel = useValidationSelection(d, eventId);
  const act = useValidationActions(d, sel, eventId);
  const {
    isAdmin, canAccess, loadingFunctions, functions, permissoesCarregando, suggestionsQuery, rows, truncated, eventsInList,
    selectedEvent, eventOfRow, functionNameById, requestableFunctions, readOnlyMode, approverNamesByFunctionId, approverNamesFor,
    sortConfig, onSort, filteredRows, hasActiveFilters, filtroDasDecididas, clearFilters,
  } = d;
  const { selectableVisible, effectiveSelectedSet, hiddenSelectedCount, anyEditable, toggle, toggleAll, applyToggleAll, confirmSelectAll, setConfirmSelectAll } = sel;
  const { topRef, detailRow, setDetailId, requestTarget, setRequestTargetId, pulseIds, onRequestSent, flushAfterDrawer, openDetail, validateOne, validateAndNext, nextValidatableAfter, openAdjust, openDelete } = act;

  /** Aba efetiva: sem evento, o quadro "Escala" não existe — cai na Lista. */
  const boardTab: ValidationTab = !eventId && tab === "escala" ? "lista" : tab;

  // ── Render ──
  if (!canAccess) {
    return (
      <PageContainer>
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="text-lg font-semibold text-foreground mb-2">Acesso negado</h3>
          <p className="text-muted-foreground text-sm">Você não tem permissão para acessar a Validação de Escala.</p>
        </div>
      </PageContainer>
    );
  }

  const loadError = suggestionsQuery.error as ApiError | null;
  const includeDisabledReason = !eventId
    ? "Selecione um evento primeiro"
    : loadingFunctions ? "Carregando funções…"
      : requestableFunctions.length === 0 ? (isAdmin ? "Nenhuma função cadastrada" : "Você não é validador de nenhuma função")
        : null;

  /** Vaga já aprovada saiu da sugestão: quem ajusta é a Escalação (tela 2). */
  const approvedGoesToScaling = (
    <p className="text-center text-xs text-muted-foreground">
      Vagas já aprovadas saem desta tela e são ajustadas na{" "}
      {hasPermission(user, "canAccessScreen2")
        ? <Link href="/scaling" className="text-primary underline-offset-2 hover:underline">Escalação</Link>
        : <span className="font-semibold">Escalação</span>}.
    </p>
  );

  /** Texto ao lado das abas — um por aba, para a aba "Decididas" não herdar a frase do quadro. */
  const contadorDaAba = (() => {
    switch (boardTab) {
      case "lista":
        return `${filteredRows.length} de ${vagas(rows.length)}${!eventId && eventsInList > 0 ? ` · ${eventos(eventsInList)}` : ""}`;
      case "escala":
        return "Quadro de todas as áreas (somente leitura)";
      case "decididas":
        return "Decisões já tomadas pelo aprovador (somente leitura)";
    }
  })();

  return (
    <PageContainer fluid className="pb-24">
      <div ref={topRef} aria-hidden="true" />
      <ValidationHeader d={d} eventId={eventId} setEventId={setEventId} includeDisabledReason={includeDisabledReason} onInclude={() => act.setIncludeOpen(true)} />

      {/* Resumo — soma SEMPRE o conjunto exibido (um evento ou todos). Card
          com faixa de cabeçalho (04/09), como os cartões do detalhe da
          inclusão: os seis números soltos na página pareciam parte dos
          filtros. Funil de um lado, recortes do outro — "Atrasadas" e
          "Minhas pendentes" são fatias de "Aguardando validação", não etapas,
          e lado a lado com o funil pareciam somar com ele. */}
      {rows.length > 0 && <ValidationSummary d={d} eventId={eventId} anyEditable={anyEditable} />}

      {/* Teto do modo "todos os eventos": a lista foi cortada, o filtro é a saída. */}
      {truncated && (
        <p role="status" className="flex items-start gap-2 rounded-xl border border-warning/25 bg-warning-soft px-3 py-2 text-xs text-warning">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            <span className="font-semibold">Mostrando as {ALL_EVENTS_ROW_LIMIT} vagas que esperam há mais tempo</span> — há outras fora da lista.
            Escolha um evento no filtro acima para ver a lista completa dele.
          </span>
        </p>
      )}

      {suggestionsQuery.isLoading || permissoesCarregando ? (
        <ValidationSkeleton label={loadingFunctions ? "Carregando funções…" : "Carregando escala sugerida…"} />
      ) : loadError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/25 bg-danger-soft px-3.5 py-2.5">
          <CloudOff className="w-4 h-4 shrink-0 text-danger" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-danger">Não foi possível carregar a escala</p>
            <p className="text-xs text-danger">{apiErrorMessage(loadError, "Verifique sua conexão e tente novamente.")}</p>
          </div>
          <Button variant="outline" size="sm" className="ml-auto rounded-lg" onClick={() => suggestionsQuery.refetch()}>Tentar novamente</Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="space-y-2">
          <EmptyState
            title={eventId ? "Nenhuma vaga sugerida neste evento" : "Nenhuma vaga em validação"}
            description={eventId
              ? "A logística ainda não enviou a escala sugerida deste evento, ou todas as vagas já foram aprovadas e seguiram para a Inclusão de Equipe. Você pode pedir a inclusão de uma vaga nova a qualquer momento."
              : "Nenhum evento tem vaga aguardando validação, pedido em aberto ou vaga esperando aprovação. Para pedir a inclusão de uma vaga nova, escolha um evento no filtro acima."}
            // O botão "Incluir escalação" já está no cabeçalho; aqui o mesmo
            // caminho vira um link, para não haver dois botões primários iguais.
            action={!readOnlyMode && eventId && !includeDisabledReason ? (
              <Button type="button" variant="link" size="sm" className="h-auto p-0 text-primary" onClick={() => act.setIncludeOpen(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Pedir uma vaga nova
              </Button>
            ) : undefined}
          />
          {hasPermission(user, "canAccessScalingEventView") && (
            <p className="text-center">
              <Link href={scalingHref("/scaling-event-view", eventId)} className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-primary underline-offset-2 hover:underline">
                <History className="w-3 h-3" aria-hidden="true" /> {eventId ? "Ver histórico completo do evento" : "Ver o histórico da escala"}
              </Link>
            </p>
          )}
          {/* Fila vazia costuma significar TUDO APROVADO — e era justamente
              quando as Decididas ficavam inalcançáveis (o vazio engolia as
              abas). O histórico aparece aqui mesmo, sem aba. */}
          <div className="pt-3">
            <h3 className={cn("mb-2 flex items-center gap-1.5", SECTION_TITLE)}>
              <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" /> Decididas
            </h3>
            <DecidedPanel eventId={eventId} functionNameById={functionNameById} podeLimpar={isAdmin} />
          </div>
        </div>
      ) : (
        <Tabs value={boardTab} onValueChange={(v) => setTab(v as ValidationTab)} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList className="rounded-xl">
              <TabsTrigger value="lista" className="rounded-lg">Lista</TabsTrigger>
              {/* O quadro é função × dia DE UM evento: sem evento escolhido ele
                  somaria dias de eventos diferentes na mesma coluna. */}
              {eventId && <TabsTrigger value="escala" className="rounded-lg">Escala</TabsTrigger>}
              <TabsTrigger value="decididas" className="rounded-lg">Decididas</TabsTrigger>
            </TabsList>
            <p className="text-xs text-muted-foreground" aria-live="polite">{contadorDaAba}</p>
          </div>

          <TabsContent value="lista" className="space-y-3 mt-0">
            <ValidationToolbar d={d} anyEditable={anyEditable} />

            {hiddenSelectedCount > 0 && (
              <p role="status" className="flex items-center gap-2 rounded-xl border border-warning/25 bg-warning-soft px-3 py-2 text-xs text-warning">
                <Eye className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                {hiddenSelectedCount} {hiddenSelectedCount === 1 ? "vaga selecionada ficou oculta" : "vagas selecionadas ficaram ocultas"} pelo filtro — {hiddenSelectedCount === 1 ? "ela continua" : "elas continuam"} na seleção.
              </p>
            )}

            {filteredRows.length === 0 ? (
              <EmptyState variant="filtered" title="Nenhuma vaga com esses filtros" onClearFilters={hasActiveFilters ? clearFilters : undefined} />
            ) : (
              <SuggestionsList
                rows={filteredRows}
                functionNameById={functionNameById}
                selectableIds={selectableVisible}
                selectedIds={effectiveSelectedSet}
                onToggle={toggle}
                onToggleAll={toggleAll}
                showSelection={anyEditable}
                sortConfig={sortConfig}
                onSort={onSort}
                onOpenDetail={openDetail}
                onValidate={validateOne}
                onAdjust={openAdjust}
                onDelete={openDelete}
                highlightIds={pulseIds}
                approverNamesFor={approverNamesFor}
                // "Todos os eventos": a lista agrupa por evento e cada card
                // ganha a linha do evento; com filtro, a barra já diz qual é.
                showEvent={!eventId}
              />
            )}
            {approvedGoesToScaling}
          </TabsContent>

          <TabsContent value="escala" className="mt-0 space-y-2">
            {/* O quadro soma TODAS as vagas do evento, sempre — quem chega da
                Lista com filtro ligado precisa saber que os números aqui não
                são os da lista filtrada (04/09). */}
            {hasActiveFilters && (
              <p role="status" className="flex items-center gap-2 rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs text-slate-600">
                <Info className="w-3.5 h-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                O quadro sempre soma todas as áreas — os filtros da Lista não valem aqui.
              </p>
            )}
            <ScheduleBoard rows={rows} functionNameById={functionNameById} rangeStart={selectedEvent?.startDate} rangeEnd={selectedEvent?.endDate} />
            <p className="text-2xs text-muted-foreground">Quadro de todas as áreas, somente leitura — vagas negadas não entram na soma.</p>
          </TabsContent>

          {/* Histórico do que já foi decidido (28/08): a vaga aprovada sumia da
              tela e a área não sabia se tinha dado certo. Leitura pura. */}
          <TabsContent value="decididas" className="mt-0 space-y-3">
            <ValidationToolbar d={d} anyEditable={anyEditable} />
            <DecidedPanel eventId={eventId} functionNameById={functionNameById} filtro={filtroDasDecididas} podeLimpar={isAdmin} />
          </TabsContent>
        </Tabs>
      )}

      <BulkActionBar sel={sel} act={act} />

      {/* Confirmar "selecionar todas" acima do teto */}
      {/* ConfirmDialog único (23/09) — mesma moldura da Sugestão e da Escalação. */}
      <ConfirmDialog
        open={confirmSelectAll}
        onOpenChange={setConfirmSelectAll}
        title={`Selecionar ${vagas(selectableVisible.size)}?`}
        description={<>
          Você vai marcar {vagas(selectableVisible.size)} de uma vez{!eventId && eventsInList > 1 ? `, de ${eventos(eventsInList)}` : ""}.
          A validação em lote ainda pede confirmação, mas confira a lista antes — é fácil validar o que não devia num lote grande.
        </>}
        cancelLabel="Voltar"
        confirmLabel={`Selecionar ${vagas(selectableVisible.size)}`}
        onConfirm={() => { applyToggleAll(false); setConfirmSelectAll(false); }}
      />

      <ValidateDialog sel={sel} act={act} eventId={eventId} functionNameById={functionNameById} />

      <AdjustRequestDialog
        open={act.adjustOpen} onOpenChange={(o) => { act.setAdjustOpen(o); if (!o) setRequestTargetId(null); }}
        inclusion={requestTarget} event={eventOfRow(requestTarget)}
        functionName={requestTarget ? functionNameById.get(requestTarget.functionId) : undefined} onSent={onRequestSent}
      />
      <DeleteRequestDialog
        open={act.deleteOpen} onOpenChange={(o) => { act.setDeleteOpen(o); if (!o) setRequestTargetId(null); }}
        inclusion={requestTarget}
        functionName={requestTarget ? functionNameById.get(requestTarget.functionId) : undefined} onSent={onRequestSent}
      />
      <IncludeRequestDialog open={act.includeOpen} onOpenChange={act.setIncludeOpen} event={selectedEvent} functions={requestableFunctions} onSent={onRequestSent} />
      <SuggestionDetailDrawer
        open={!!detailRow} onOpenChange={(o) => { if (!o) setDetailId(null); }}
        // Drawer fechado de vez: agora dá para abrir o diálogo que esperava
        // (o setTimeout deixa o Radix devolver o foco antes).
        onClosed={() => setTimeout(flushAfterDrawer, 0)}
        row={detailRow} event={eventOfRow(detailRow)}
        functionName={detailRow ? functionNameById.get(detailRow.functionId) : undefined}
        approverNames={functions && detailRow ? approverNamesByFunctionId.get(detailRow.functionId) ?? [] : undefined}
        // ‹ › e as setas do teclado andam nesta lista — a filtrada e ordenada
        // que está na tela, não em todas as vagas do evento.
        list={filteredRows}
        onNavigate={openDetail}
        // Fora do modo leitura o rodapé do drawer repete as ações da linha.
        onValidate={anyEditable ? validateOne : undefined}
        onValidateAndNext={anyEditable ? validateAndNext : undefined}
        hasNextValidatable={!!detailRow && !!nextValidatableAfter(detailRow)}
        onAdjust={anyEditable ? openAdjust : undefined}
        onDelete={anyEditable ? openDelete : undefined}
      />
    </PageContainer>
  );
}
