/**
 * Aprovação de escala — o aprovador de cada função aprova as vagas validadas
 * pelas áreas e decide os pedidos de ajuste, inclusão e exclusão.
 *
 * Desde 25/09 a página só compõe (tinha 951 linhas): filtros/aba em
 * `page/use-approval-filters`, dados em `page/use-approval-data`, o overlay
 * (Sheet + diálogos + deep-link) em `page/use-approval-overlay`, as vagas
 * (aguardando aprovação / paradas) em `page/use-approval-vagas`, a barra, o
 * evento, o resumo e os filtros em `page/approval-filter-bar` e as abas em
 * `page/approval-tab-bar`.
 *
 * 07/10 (redesenho premium): barra de 56px grudada como na Validação e na
 * Escalação, evento numa linha, resumo numa faixa, abas segmentadas, busca e
 * status dentro da aba que eles filtram, listas que viram cartões abaixo de
 * 1280px, lote em barra escura flutuante e estados (carregando, vazio, erro,
 * sem acesso) no desenho do módulo. Lógica intacta.
 */
import { useMemo } from "react";
import { CheckCircle2, CloudOff, Inbox, SearchX, Stamp } from "lucide-react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ToastAction } from "@/components/ui/toast";
import { PageContainer } from "@/components/common/page-container";
import { usePageTitle } from "@/components/common/use-page-title";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { hasPermission } from "@/lib/role-utils";
import { apiErrorMessage } from "@/lib/utils";
import { useScalingEvent } from "@/lib/use-scaling-event";
import { normalizeRole } from "@shared/roles";
import { CHANGE_REQUEST_STATUS } from "@shared/scaling-validation-rules";
import type { ChangeRequestItem, ReviewBody } from "@/components/scaling-approval/types";
import { RequestQueue } from "@/components/scaling-approval/request-queue";
import { RequestDetailDialog } from "@/components/scaling-approval/request-detail-sheet";
import { ApproveRequestDialog, ReviewRequestDialog } from "@/components/scaling-approval/decision-dialogs";
import { StalledSuggestions } from "@/components/scaling-approval/stalled-suggestions";
import { AwaitingApproval } from "@/components/scaling-approval/awaiting-approval";
import { DecidedPanel } from "@/components/scaling-validation/decided-panel";
import { AcaoDoEstado, BotaoTentarDeNovo, EstadoDaValidacao } from "@/components/scaling-validation/validation-page/estados";
import { useDecisionMutations } from "@/components/scaling-approval/use-decisions";
import { BASE_PATH, contarPendentes, filtrarPedidos, useApprovalFilters, type ApprovalTab } from "@/components/scaling-approval/page/use-approval-filters";
import { useApprovalData } from "@/components/scaling-approval/page/use-approval-data";
import { useApprovalOverlay } from "@/components/scaling-approval/page/use-approval-overlay";
import { useApprovalVagas } from "@/components/scaling-approval/page/use-approval-vagas";
import { ApprovalHeader, ApprovalSummary, FilaToolbar } from "@/components/scaling-approval/page/approval-filter-bar";
import { ApprovalTabBar, MinhasFuncoesToggle, temFiltroMinhasFuncoes } from "@/components/scaling-approval/page/approval-tab-bar";
import { AcessoNegadoAprovacao, EsqueletoDaLista } from "@/components/scaling-approval/page/estados-da-aprovacao";

export default function ScalingApprovalPage() {
  usePageTitle("Aprovação de escala");
  const { user } = useAuth();
  const isAdmin = normalizeRole(user?.role) === "admin";
  const canAccess = hasPermission(user, "canAccessScalingApproval");
  /** Papel de DECISÃO (admin/logística/compras). Quem não tem só acompanha — a não ser que seja aprovador de alguma função (ver `isApprover`). */
  const canDecideByRole = hasPermission(user, "canEditScalingApproval");

  // ── Estado ──
  // A tela ABRE em "Todos os eventos" (regra do dono, 26/08): o combobox é
  // FILTRO. Sem `?eventId=` na URL, nada é pré-selecionado.
  const { eventId, setEventId, sanitize } = useScalingEvent(BASE_PATH, { allEventsDefault: true });
  const { toast } = useToast();
  const f = useApprovalFilters();

  // ── Dados ──
  const d = useApprovalData({ canAccess, canDecideByRole, isAdmin, userId: user?.id, eventId, statusFilter: f.statusFilter, sanitize });
  const { items, pendingItems, isApprover, readOnlyMode, listQuery, loadError, forbidden, functionNameById, userNameById, approverNamesByFunctionId, eventPeriodById, eventById, selectedEvent } = d;
  const ov = useApprovalOverlay({
    canAccess, eventId, items, pendingItems, listLoading: listQuery.isLoading, pendingLoading: d.pendingQuery.isLoading,
    statusFilter: f.statusFilter, setStatusFilter: f.setStatusFilter, setTab: f.setTab, tabPickedByUser: f.tabPickedByUser, toast,
  });
  const { overlay, dispatch, openRequest, closeAll, openDetail, openDetailWithMode, reviewKind } = ov;
  const v = useApprovalVagas({ canAccess, isApprover, isAdmin, eventId, openRequest });
  const { suggestionsQuery, vagaDoPedido, vagaFalhou, stalledRows, stalledRowsAll, awaitingRows, awaitingRowsAll, awaitingMine } = v;

  // ── Filtros locais + contadores ──
  const filtered = useMemo(() => filtrarPedidos(items, f), [items, f.typeFilter, f.search, f.lateOnly, f.mineOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => contarPendentes(pendingItems), [pendingItems]);

  // ── Decisões ──
  /** Próximo pendente da fila (na ordem visível), fora o que acabou de ser decidido. */
  const nextPendingAfter = (id: string | null) =>
    filtered.find((r) => r.id !== id && r.status === CHANGE_REQUEST_STATUS.PENDENTE && r.canDecide)
      ?? filtered.find((r) => r.id !== id && r.status === CHANGE_REQUEST_STATUS.PENDENTE)
      ?? null;
  const { approve, review, approveVagas, decideVaga, decideVagasMany, bypass, bypassMany } = useDecisionMutations({
    onSettledRequest: closeAll,
    onStale: closeAll,
    successAction: () => {
      const next = nextPendingAfter(overlay.id);
      if (!next) return undefined;
      return (
        <ToastAction
          altText="Abrir próximo pedido pendente"
          onClick={() => openDetail(next)}
          className="whitespace-nowrap border-border bg-card hover:bg-brand-soft hover:text-primary"
        >
          {/* Rótulo curto (07/10): com o aviso para Compras na descrição, o
              botão longo espremia o texto do toast numa coluna estreita. */}
          Próximo pendente
        </ToastAction>
      );
    },
  });
  /**
   * Um "ocupado" por fila (04/09): decidir uma vaga parada travava os botões
   * da fila de pedidos, e o lote de bypass (`bypassMany`) não travava nada —
   * dava para abrir um segundo lote com o primeiro ainda rodando.
   */
  const busyPedidos = approve.isPending || review.isPending;
  const busyParadas = bypass.isPending || bypassMany.isPending;
  /** As decisões sobre a VAGA validada têm o próprio "ocupado" — não travam a fila de pedidos. */
  const busyVagas = approveVagas.isPending || decideVaga.isPending || decideVagasMany.isPending;

  const submitReview = (body: ReviewBody) => {
    if (!openRequest || !reviewKind) return;
    review.mutate({ id: openRequest.id, kind: reviewKind, body, requestType: openRequest.requestType });
  };

  // ── Render ──
  if (!canAccess) {
    // Dentro do shell da tela (04/09): o bloco solto "Acesso negado" parecia
    // um erro do sistema. Com a barra da tela a pessoa sabe ONDE está.
    return (
      <PageContainer fluid>
        <header className="sticky top-[var(--sticky-top)] z-30 -mx-[var(--page-gutter)] -mt-[var(--page-gutter)] flex h-14 items-center border-b border-border bg-card px-[var(--page-gutter)]">
          <h1 className="flex items-center gap-2 text-base font-semibold tracking-[-0.01em] text-foreground">
            <Stamp className="h-[18px] w-[18px] text-primary" aria-hidden="true" /> Aprovação de escala
          </h1>
        </header>
        <AcessoNegadoAprovacao />
      </PageContainer>
    );
  }

  /** "Posso decidir" (contador + filtro) só faz sentido para quem decide alguma coisa. */
  const showMineFilter = !isAdmin && !readOnlyMode;
  const vagasErro = (
    <EstadoDaValidacao
      tom="erro"
      icone={<CloudOff aria-hidden="true" />}
      titulo="Não foi possível carregar as vagas"
      texto={apiErrorMessage(suggestionsQuery.error, "Verifique sua conexão e tente novamente.")}
      acao={<BotaoTentarDeNovo onClick={() => suggestionsQuery.refetch()} tentando={suggestionsQuery.isFetching} />}
      testId="aprovacao-vagas-erro"
    />
  );
  /** Barra das abas de vagas: só existe quando há o filtro "Só as minhas funções" a mostrar. */
  const barraDasVagas = (aba: "aprovacao" | "paradas") =>
    temFiltroMinhasFuncoes(aba, v) ? <div className="flex flex-wrap items-center gap-2"><MinhasFuncoesToggle tab={aba} v={v} /></div> : null;

  return (
    <PageContainer fluid className="pb-28">
      <ApprovalHeader d={d} v={v} eventId={eventId} setEventId={setEventId} isApprover={isApprover} readOnlyMode={readOnlyMode && !forbidden} />

      <ApprovalSummary f={f} d={d} v={v} counts={counts} isApprover={isApprover} showMineFilter={showMineFilter} />

      <Tabs value={f.tab} onValueChange={(val) => (val === "fila" ? f.openFilaTab() : f.switchTab(val as ApprovalTab))} className="space-y-4">
        <ApprovalTabBar f={f} v={v} counts={counts} isApprover={isApprover} showMineFilter={showMineFilter} filteredCount={filtered.length} itemsCount={items.length} filaIndisponivel={listQuery.isLoading || !!loadError} />

        {isApprover && (
          <TabsContent value="aprovacao" className="val-entra mt-0 space-y-3">
            {barraDasVagas("aprovacao")}
            {/* Sem evento a aba mostra as vagas de TODOS os eventos — o estado
                vazio só aparece quando está vazio DE VERDADE (regra do dono). */}
            {suggestionsQuery.isLoading ? (
              <EsqueletoDaLista label="Carregando vagas…" />
            ) : suggestionsQuery.error ? vagasErro : (
              awaitingRows.length === 0 && awaitingRowsAll.length > 0 ? (
                <EstadoDaValidacao
                  icone={<CheckCircle2 aria-hidden="true" />}
                  titulo="Nenhuma vaga aguardando aprovação nas suas funções"
                  texto={`Há ${awaitingRowsAll.length} ${awaitingRowsAll.length === 1 ? "vaga aguardando" : "vagas aguardando"} em funções de outros aprovadores. Desmarque "Só as minhas funções" para vê-las.`}
                  acao={<AcaoDoEstado principal={false} onClick={() => v.setOnlyMineAwaiting(false)}>Mostrar todas</AcaoDoEstado>}
                />
              ) : (
                <AwaitingApproval
                  rows={awaitingRows}
                  functionNameById={functionNameById}
                  userNameById={userNameById}
                  approverNamesFor={(row) => approverNamesByFunctionId.get(row.functionId) ?? []}
                  showEvent={!eventId}
                  busy={busyVagas}
                  // mutateAsync nos dois: os diálogos só fecham (e só jogam
                  // fora o comentário) quando o servidor confirma.
                  onApprove={(selectedRows) => approveVagas.mutateAsync({ ids: selectedRows.map((r) => r.id) })}
                  onDecide={(row, kind, comment) => decideVaga.mutateAsync({ inclusionId: row.id, kind, comment })}
                  onDecideMany={(rows, kind, comment) => decideVagasMany.mutateAsync({ ids: rows.map((r) => r.id), kind, comment })}
                />
              )
            )}
          </TabsContent>
        )}

        <TabsContent value="fila" className="val-entra mt-0 space-y-3">
          {!forbidden && <FilaToolbar f={f} counts={counts} showMineFilter={showMineFilter} />}
          {listQuery.isLoading ? (
            <EsqueletoDaLista label="Carregando pedidos…" />
          ) : loadError ? (
            forbidden ? (
              // 403 aqui = o perfil não vê a fila por papel E não é aprovador de
              // nenhuma função. Nada de mandar o usuário "virar aprovador": para
              // os perfis de leitura isso seria o oposto da matriz de permissões.
              <EstadoDaValidacao
                icone={<Inbox aria-hidden="true" />}
                titulo="Sem pedidos para você nesta tela"
                texto="Seu perfil não acompanha a fila de pedidos. Se você deveria decidir os pedidos de alguma função, fale com o administrador."
                testId="aprovacao-fila-sem-acesso"
              />
            ) : (
              <EstadoDaValidacao
                tom="erro"
                icone={<CloudOff aria-hidden="true" />}
                titulo="Não foi possível carregar os pedidos"
                texto={apiErrorMessage(loadError, "Verifique sua conexão e tente novamente.")}
                acao={<BotaoTentarDeNovo onClick={() => listQuery.refetch()} tentando={listQuery.isFetching} />}
                testId="aprovacao-fila-erro"
              />
            )
          ) : filtered.length === 0 ? (
            f.hasActiveFilters || items.length > 0 ? (
              // O botão diz o que faz (04/09): `clearFilters` não limpa tudo —
              // volta ao padrão da tela, que é "pendentes".
              <EstadoDaValidacao
                icone={<SearchX aria-hidden="true" />}
                titulo="Nenhum pedido com esses filtros"
                texto="Nenhum pedido bate com a busca e os recortes escolhidos."
                acao={<AcaoDoEstado principal={false} onClick={f.clearFilters}>Voltar aos pendentes</AcaoDoEstado>}
                testId="aprovacao-sem-resultado"
              />
            ) : awaitingMine.length > 0 ? (
              // Fila vazia MAS com vagas esperando o aprovador: "bom trabalho"
              // aqui era mentira — a outra fila dele estava cheia.
              <EstadoDaValidacao
                icone={<Stamp aria-hidden="true" />}
                titulo="Nenhum pedido pendente"
                texto={`Mas há ${awaitingMine.length} ${awaitingMine.length === 1 ? "vaga aguardando" : "vagas aguardando"} a sua aprovação.`}
                acao={<AcaoDoEstado onClick={() => f.switchTab("aprovacao")}>Ver vagas aguardando aprovação</AcaoDoEstado>}
              />
            ) : (
              <EstadoDaValidacao
                icone={<CheckCircle2 aria-hidden="true" />}
                titulo="Nenhum pedido pendente"
                texto={eventId ? "Não há pedidos aguardando decisão neste evento." : "Não há pedidos aguardando decisão. Bom trabalho!"}
                testId="aprovacao-fila-vazia"
              />
            )
          ) : (
            <RequestQueue
              items={filtered}
              onOpen={openDetail}
              showEvent={!eventId}
              eventPeriodById={eventPeriodById}
              busy={busyPedidos}
              // Decidir direto da fila: abre o pedido e já vai para o diálogo —
              // "Cancelar"/"Voltar" cai no detalhe, o mesmo caminho do Sheet.
              onApprove={(r: ChangeRequestItem) => openDetailWithMode(r, "approve")}
              onReajustar={(r: ChangeRequestItem) => openDetailWithMode(r, "reajustar")}
              onNegar={(r: ChangeRequestItem) => openDetailWithMode(r, "negar")}
            />
          )}
        </TabsContent>

        {isApprover && (
          <TabsContent value="paradas" className="val-entra mt-0 space-y-3">
            {barraDasVagas("paradas")}
            {/* Idem: "Vagas paradas" não exige mais escolher um evento. */}
            {suggestionsQuery.isLoading ? (
              <EsqueletoDaLista label="Carregando vagas…" />
            ) : suggestionsQuery.error ? vagasErro : (
              stalledRows.length === 0 && stalledRowsAll.length > 0 ? (
                <EstadoDaValidacao
                  icone={<CheckCircle2 aria-hidden="true" />}
                  titulo="Nenhuma vaga parada nas suas funções"
                  texto={`Há ${stalledRowsAll.length} ${stalledRowsAll.length === 1 ? "vaga parada" : "vagas paradas"} em funções de outros aprovadores. Desmarque "Só as minhas funções" para vê-las.`}
                  acao={<AcaoDoEstado principal={false} onClick={() => v.setOnlyMineStalled(false)}>Mostrar todas</AcaoDoEstado>}
                />
              ) : (
                <StalledSuggestions
                  rows={stalledRows}
                  functionNameById={functionNameById}
                  canActOn={(row) => row.canDecide === true}
                  approverNamesFor={(row) => approverNamesByFunctionId.get(row.functionId) ?? []}
                  showEvent={!eventId}
                  busy={busyParadas}
                  // mutateAsync: o diálogo de bypass só fecha quando o servidor responde.
                  onDecide={(row, kind, comment) => bypass.mutateAsync({ inclusionId: row.id, kind, comment })}
                  onDecideMany={(rows, kind, comment) => bypassMany.mutateAsync({ ids: rows.map((r) => r.id), kind, comment })}
                />
              )
            )}
          </TabsContent>
        )}

        {/* Histórico do que o aprovador já decidiu (28/08) — leitura pura. */}
        <TabsContent value="decididas" className="val-entra mt-0 space-y-3">
          <DecidedPanel eventId={eventId} functionNameById={functionNameById} podeLimpar={isAdmin} />
        </TabsContent>
      </Tabs>

      {/* Nível 2 — detalhe */}
      <RequestDetailDialog
        // Um overlay por vez: com um diálogo de decisão aberto, o detalhe sai
        // de cena (o diálogo já mostra o de/para e a consequência).
        open={overlay.mode === "sheet"}
        onOpenChange={(o) => { if (!o) closeAll(); }}
        request={openRequest}
        inclusion={vagaDoPedido}
        vagaFalhou={vagaFalhou}
        eventPeriod={openRequest ? eventPeriodById.get(openRequest.eventId) ?? null : null}
        busy={busyPedidos}
        onApprove={() => dispatch({ type: "mode", mode: "approve", origin: "detalhe" })}
        onReajustar={() => dispatch({ type: "mode", mode: "reajustar", origin: "detalhe" })}
        onNegar={() => dispatch({ type: "mode", mode: "negar", origin: "detalhe" })}
      />
      <ApproveRequestDialog
        open={overlay.mode === "approve"}
        onOpenChange={(o) => { if (!o) dispatch({ type: "back" }); }}
        request={openRequest}
        pending={approve.isPending}
        onConfirm={() => openRequest && approve.mutate({ id: openRequest.id })}
      />
      <ReviewRequestDialog
        open={reviewKind !== null}
        onOpenChange={(o) => { if (!o) dispatch({ type: "back" }); }}
        kind={reviewKind ?? "reajustar"}
        request={openRequest}
        inclusion={vagaDoPedido}
        vagaFalhou={vagaFalhou}
        event={openRequest ? eventById.get(openRequest.eventId) ?? selectedEvent : selectedEvent}
        pending={review.isPending}
        onSubmit={submitReview}
      />
    </PageContainer>
  );
}
