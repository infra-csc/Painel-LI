/**
 * Aprovação de escala — o aprovador de cada função aprova as vagas validadas
 * pelas áreas e decide os pedidos de ajuste, inclusão e exclusão.
 *
 * Desde 25/09 a página só compõe (tinha 951 linhas): filtros/aba em
 * `page/use-approval-filters`, dados em `page/use-approval-data`, o overlay
 * (Sheet + diálogos + deep-link) em `page/use-approval-overlay`, as vagas
 * (aguardando aprovação / paradas) em `page/use-approval-vagas`, a barra de
 * contexto em `page/approval-filter-bar` e a linha das abas em `page/approval-tab-bar`.
 */
import { useMemo } from "react";
import { CheckCircle2, EyeOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ToastAction } from "@/components/ui/toast";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
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
import { ScalingModuleNav } from "@/components/scaling-validation/scaling-module-nav";
import { DecidedPanel } from "@/components/scaling-validation/decided-panel";
import { useDecisionMutations } from "@/components/scaling-approval/use-decisions";
import { BASE_PATH, contarPendentes, filtrarPedidos, useApprovalFilters, type ApprovalTab } from "@/components/scaling-approval/page/use-approval-filters";
import { useApprovalData } from "@/components/scaling-approval/page/use-approval-data";
import { useApprovalOverlay } from "@/components/scaling-approval/page/use-approval-overlay";
import { useApprovalVagas } from "@/components/scaling-approval/page/use-approval-vagas";
import { ApprovalFilterBar } from "@/components/scaling-approval/page/approval-filter-bar";
import { ApprovalTabBar } from "@/components/scaling-approval/page/approval-tab-bar";

const SUBTITLE = "O aprovador de cada função aprova as vagas já validadas pelas áreas e decide os pedidos de ajuste, inclusão e exclusão abertos na Validação de Escala.";

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
          Abrir próximo pendente
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
    // um erro do sistema. Com cabeçalho e estado vazio a pessoa sabe ONDE está
    // e o que fazer a seguir.
    return (
      <PageContainer fluid>
        <PageHeader icon={ShieldCheck} title="Aprovação de escala" subtitle={SUBTITLE} />
        <EmptyState
          icon={ShieldCheck}
          title="Você não tem acesso à Aprovação de Escala"
          description="Esta tela é dos aprovadores de função e dos perfis de decisão. Se você deveria decidir pedidos ou vagas de alguma função, fale com o administrador."
        />
      </PageContainer>
    );
  }

  /** "Posso decidir" (contador + filtro) só faz sentido para quem decide alguma coisa. */
  const showMineFilter = !isAdmin && !readOnlyMode;
  const vagasErro = (
    <ErrorState title="Não foi possível carregar as vagas" description={apiErrorMessage(suggestionsQuery.error, "Tente novamente.")} onRetry={() => suggestionsQuery.refetch()} />
  );

  return (
    <PageContainer fluid>
      <PageHeader icon={ShieldCheck} title="Aprovação de escala" subtitle={SUBTITLE} actions={<ScalingModuleNav current="approval" eventId={eventId} />} />

      <ApprovalFilterBar f={f} d={d} v={v} counts={counts} eventId={eventId} setEventId={setEventId} isApprover={isApprover} showMineFilter={showMineFilter} />

      {readOnlyMode && !forbidden && (
        <div role="status" className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs text-slate-700">
          <EyeOff className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span><span className="font-semibold">Modo leitura</span> — você acompanha os pedidos, mas não decide. Quem decide é o aprovador de cada função.</span>
        </div>
      )}

      <Tabs value={f.tab} onValueChange={(val) => (val === "fila" ? f.openFilaTab() : f.switchTab(val as ApprovalTab))} className="space-y-3">
        <ApprovalTabBar f={f} v={v} counts={counts} isApprover={isApprover} showMineFilter={showMineFilter} filteredCount={filtered.length} itemsCount={items.length} />

        {isApprover && (
          <TabsContent value="aprovacao" className="mt-0 space-y-3">
            {/* Sem evento a aba mostra as vagas de TODOS os eventos — o estado
                vazio só aparece quando está vazio DE VERDADE (regra do dono). */}
            {suggestionsQuery.isLoading ? (
              <LoadingState count={4} label="Carregando vagas…" />
            ) : suggestionsQuery.error ? vagasErro : (
              awaitingRows.length === 0 && awaitingRowsAll.length > 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  title="Nenhuma vaga aguardando aprovação nas suas funções"
                  description={`Há ${awaitingRowsAll.length} vaga(s) aguardando em funções de outros aprovadores. Desmarque "Só as minhas funções" para vê-las.`}
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

        <TabsContent value="fila" className="mt-0 space-y-3">
          {listQuery.isLoading ? (
            <LoadingState count={6} label="Carregando pedidos…" />
          ) : loadError ? (
            <ErrorState
              // 403 aqui = o perfil não vê a fila por papel E não é aprovador de
              // nenhuma função. Nada de mandar o usuário "virar aprovador": para
              // os perfis de leitura isso seria o oposto da matriz de permissões.
              title={forbidden ? "Sem pedidos para você nesta tela" : "Não foi possível carregar os pedidos"}
              description={forbidden
                ? "Seu perfil não acompanha a fila de pedidos. Se você deveria decidir os pedidos de alguma função, fale com o administrador."
                : apiErrorMessage(loadError, "Verifique sua conexão e tente novamente.")}
              onRetry={forbidden ? undefined : () => listQuery.refetch()}
            />
          ) : filtered.length === 0 ? (
            f.hasActiveFilters || items.length > 0 ? (
              // O botão diz o que faz (04/09): `clearFilters` não limpa tudo —
              // volta ao padrão da tela, que é "pendentes". "Limpar filtros"
              // prometia uma lista sem recorte e entregava outra.
              <EmptyState
                variant="filtered"
                title="Nenhum pedido com esses filtros"
                description="Nenhum pedido bate com a busca e os recortes escolhidos."
                action={<Button type="button" variant="outline" size="sm" onClick={f.clearFilters}>Voltar aos pendentes</Button>}
              />
            ) : awaitingMine.length > 0 ? (
              // Fila vazia MAS com vagas esperando o aprovador: "bom trabalho"
              // aqui era mentira — a outra fila dele estava cheia.
              <EmptyState
                icon={ShieldCheck}
                title="Nenhum pedido pendente"
                description={`Mas há ${awaitingMine.length} ${awaitingMine.length === 1 ? "vaga aguardando" : "vagas aguardando"} a sua aprovação.`}
                action={<Button type="button" size="sm" className="rounded-lg" onClick={() => f.switchTab("aprovacao")}>Ver vagas aguardando aprovação</Button>}
              />
            ) : (
              <EmptyState icon={CheckCircle2} title="Nenhum pedido pendente" description={eventId ? "Não há pedidos aguardando decisão neste evento." : "Não há pedidos aguardando decisão. Bom trabalho!"} />
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
          <TabsContent value="paradas" className="mt-0 space-y-3">
            {/* Idem: "Vagas paradas" não exige mais escolher um evento. */}
            {suggestionsQuery.isLoading ? (
              <LoadingState count={4} label="Carregando vagas…" />
            ) : suggestionsQuery.error ? vagasErro : (
              stalledRows.length === 0 && stalledRowsAll.length > 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  title="Nenhuma vaga parada nas suas funções"
                  description={`Há ${stalledRowsAll.length} vaga(s) parada(s) em funções de outros aprovadores. Desmarque "Só as minhas funções" para vê-las.`}
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
        <TabsContent value="decididas" className="mt-0 space-y-3">
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
