/**
 * Validação de escala — a página (25/09).
 *
 * Só orquestra: dados/escopo (`useValidationData`), seleção
 * (`useValidationSelection`), ações (`useValidationActions`) e os blocos em
 * components/scaling-validation/validation-page/*. Tinha 1.300 linhas.
 *
 * 07/10 (redesenho premium): barra da tela grudada (título, passos do módulo,
 * "Incluir escalação"), resumo numa faixa só, abas segmentadas, filtros sem
 * moldura, lista que vira cartões abaixo de 1280px e estados (vazio, erro,
 * sem acesso, carregando) no desenho da Escalação. Lógica intacta.
 */
import { useState } from "react";
import { Link } from "wouter";
import { CalendarDays, ClipboardCheck, CloudOff, Eye, History, Inbox, Info, List, Plus, SearchX } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PageContainer } from "@/components/common/page-container";
import { usePageTitle } from "@/components/common/use-page-title";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { apiErrorMessage, cn } from "@/lib/utils";
import { scalingHref, useScalingEvent } from "@/lib/use-scaling-event";
import { ALL_EVENTS_ROW_LIMIT, SUGESTAO_STATUS } from "@shared/scaling-validation-rules";
import { VALIDATION_NOTE_MAX } from "@/components/scaling-validation/validation-note";
import { SuggestionsList } from "@/components/scaling-validation/suggestions-list";
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
import { AcaoDoEstado, AcessoNegadoValidacao, BotaoTentarDeNovo, EstadoDaValidacao } from "@/components/scaling-validation/validation-page/estados";

/** Aba segmentada (07/10) — o mesmo desenho das abas da Escalação. */
const ABA = "val-alvo h-8 gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-[color,background-color,box-shadow] duration-150 hover:text-foreground data-[state=active]:bg-card data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:shadow-1 data-[state=active]:ring-1 data-[state=active]:ring-border focus-visible:ring-offset-0";
/** Aviso em faixa (lista cortada, seleção oculta, quadro sem filtro). */
const AVISO = "val-entra flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-xs leading-relaxed";

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
        <AcessoNegadoValidacao />
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
    <p className="pt-1 text-center text-xs text-muted-foreground">
      Vagas já aprovadas saem desta tela e são ajustadas na{" "}
      {hasPermission(user, "canAccessScreen2")
        ? <Link href="/scaling" className="font-medium text-primary underline-offset-2 hover:underline">Escalação</Link>
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
    <PageContainer fluid className="pb-28">
      <ValidationHeader d={d} eventId={eventId} setEventId={setEventId} includeDisabledReason={includeDisabledReason} onInclude={() => act.setIncludeOpen(true)} />
      {/* Âncora do "voltar ao topo" depois de validar — logo abaixo da barra
          grudada; o scroll-margin grande faz a página parar no topo de verdade. */}
      <div ref={topRef} aria-hidden="true" className="scroll-mt-[60vh]" />

      {/* Resumo — soma SEMPRE o conjunto exibido (um evento ou todos). Funil de
          um lado, recorte do outro — "Minhas pendentes" é fatia de
          "Aguardando validação", não etapa, e lado a lado com o funil parecia
          somar com ele. */}
      {rows.length > 0 && <ValidationSummary d={d} eventId={eventId} anyEditable={anyEditable} />}

      {/* Teto do modo "todos os eventos": a lista foi cortada, o filtro é a saída. */}
      {truncated && (
        <p role="status" className={cn(AVISO, "border-warning/30 bg-warning-soft text-warning")}>
          <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-semibold">Mostrando as {ALL_EVENTS_ROW_LIMIT} vagas que esperam há mais tempo</span> — há outras fora da lista.
            Escolha um evento no filtro acima para ver a lista completa dele.
          </span>
        </p>
      )}

      {suggestionsQuery.isLoading || permissoesCarregando ? (
        <ValidationSkeleton label={loadingFunctions ? "Carregando funções…" : "Carregando escala sugerida…"} />
      ) : loadError ? (
        <EstadoDaValidacao
          tom="erro"
          icone={<CloudOff aria-hidden="true" />}
          titulo="Não foi possível carregar a escala"
          texto={apiErrorMessage(loadError, "Verifique sua conexão e tente novamente.")}
          acao={<BotaoTentarDeNovo onClick={() => suggestionsQuery.refetch()} tentando={suggestionsQuery.isFetching} />}
          testId="validacao-erro"
        />
      ) : rows.length === 0 ? (
        <div className="space-y-6">
          <EstadoDaValidacao
            icone={<Inbox aria-hidden="true" />}
            titulo={eventId ? "Nenhuma vaga sugerida neste evento" : "Nenhuma vaga em validação"}
            texto={eventId
              ? "A logística ainda não enviou a escala sugerida deste evento, ou todas as vagas já foram aprovadas e seguiram para a Inclusão de Equipe. Você pode pedir a inclusão de uma vaga nova a qualquer momento."
              : "Nenhum evento tem vaga aguardando validação, pedido em aberto ou vaga esperando aprovação. Para pedir a inclusão de uma vaga nova, escolha um evento no filtro acima."}
            // O botão "Incluir escalação" já está na barra da tela; aqui o mesmo
            // caminho é secundário, para não haver dois botões primários iguais.
            acao={(!readOnlyMode && eventId && !includeDisabledReason) || hasPermission(user, "canAccessScalingEventView") ? (
              <>
                {!readOnlyMode && eventId && !includeDisabledReason && (
                  <AcaoDoEstado principal={false} onClick={() => act.setIncludeOpen(true)}>
                    <Plus className="h-4 w-4" aria-hidden="true" /> Pedir uma vaga nova
                  </AcaoDoEstado>
                )}
                {hasPermission(user, "canAccessScalingEventView") && (
                  <Link href={scalingHref("/scaling-event-view", eventId)} className="val-alvo inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-primary transition-colors hover:bg-brand-soft/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <History className="h-4 w-4" aria-hidden="true" /> {eventId ? "Ver histórico completo do evento" : "Ver o histórico da escala"}
                  </Link>
                )}
              </>
            ) : undefined}
            testId="validacao-vazia"
          />
          {/* Fila vazia costuma significar TUDO APROVADO — e era justamente
              quando as Decididas ficavam inalcançáveis (o vazio engolia as
              abas). O histórico aparece aqui mesmo, sem aba. */}
          <section aria-labelledby="val-decididas-vazio" className="space-y-2.5">
            <h3 id="val-decididas-vazio" className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Decididas
              <span className="font-normal text-muted-foreground">· o que o aprovador já aprovou ou negou</span>
            </h3>
            <DecidedPanel eventId={eventId} functionNameById={functionNameById} podeLimpar={isAdmin} />
          </section>
        </div>
      ) : (
        <Tabs value={boardTab} onValueChange={(v) => setTab(v as ValidationTab)} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <TabsList className="h-auto gap-0.5 rounded-lg border border-border bg-background p-[3px]">
              <TabsTrigger value="lista" className={ABA}><List className="h-[15px] w-[15px]" aria-hidden="true" />Lista</TabsTrigger>
              {/* O quadro é função × dia DE UM evento: sem evento escolhido ele
                  somaria dias de eventos diferentes na mesma coluna. */}
              {eventId && <TabsTrigger value="escala" className={ABA}><CalendarDays className="h-[15px] w-[15px]" aria-hidden="true" />Escala</TabsTrigger>}
              <TabsTrigger value="decididas" className={ABA}><ClipboardCheck className="h-[15px] w-[15px]" aria-hidden="true" />Decididas</TabsTrigger>
            </TabsList>
            <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">{contadorDaAba}</p>
          </div>

          <TabsContent value="lista" className="val-entra mt-0 space-y-3">
            <ValidationToolbar d={d} anyEditable={anyEditable} />

            {hiddenSelectedCount > 0 && (
              <p role="status" className={cn(AVISO, "border-warning/30 bg-warning-soft text-warning")}>
                <Eye className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{hiddenSelectedCount} {hiddenSelectedCount === 1 ? "vaga selecionada ficou oculta" : "vagas selecionadas ficaram ocultas"} pelo filtro — {hiddenSelectedCount === 1 ? "ela continua" : "elas continuam"} na seleção.</span>
              </p>
            )}

            {filteredRows.length === 0 ? (
              <EstadoDaValidacao
                icone={<SearchX aria-hidden="true" />}
                titulo="Nenhuma vaga com esses filtros"
                texto="A busca, as funções marcadas ou o indicador do resumo escondem todas as vagas. Tire um filtro para ver o resto."
                acao={hasActiveFilters ? <AcaoDoEstado principal={false} onClick={clearFilters}>Limpar filtros</AcaoDoEstado> : undefined}
                testId="validacao-sem-resultado"
              />
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

          <TabsContent value="escala" className="val-entra mt-0 space-y-2.5">
            {/* O quadro soma TODAS as vagas do evento, sempre — quem chega da
                Lista com filtro ligado precisa saber que os números aqui não
                são os da lista filtrada (04/09). */}
            {hasActiveFilters && (
              <p role="status" className={cn(AVISO, "border-border bg-surface-muted text-slate-600")}>
                <Info className="mt-px h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                O quadro sempre soma todas as áreas — os filtros da Lista não valem aqui.
              </p>
            )}
            <ScheduleBoard rows={rows} functionNameById={functionNameById} rangeStart={selectedEvent?.startDate} rangeEnd={selectedEvent?.endDate} />
            <p className="text-2xs text-muted-foreground">Quadro de todas as áreas, somente leitura — vagas negadas não entram na soma.</p>
          </TabsContent>

          {/* Histórico do que já foi decidido (28/08): a vaga aprovada sumia da
              tela e a área não sabia se tinha dado certo. Leitura pura. */}
          <TabsContent value="decididas" className="val-entra mt-0 space-y-3">
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
        onValidarEmVez={requestTarget?.status === SUGESTAO_STATUS.PENDENTE ? (motivo) => {
          const id = requestTarget.id;
          act.setAdjustOpen(false);
          // Depois do fechamento do ajuste: dois diálogos Radix trocando o
          // foco no mesmo tick deixam a página com o scroll travado.
          setTimeout(() => act.openValidateConfirm([id], motivo.slice(0, VALIDATION_NOTE_MAX)), 0);
        } : undefined}
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
