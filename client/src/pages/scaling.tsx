/**
 * Escalação — redesenho de 01/09.
 *
 * A tela é uma **fila de trabalho**, não um relatório. O que saiu e por quê:
 *
 * - O cabeçalho de 76px ("Escalação - Visualização" + "Lista de escalações com
 *   informações detalhadas" + um ícone num quadrado azul com sombra) dizia o
 *   que o breadcrumb já dizia. Virou uma barra de contexto de 56px que carrega
 *   o resumo real do recorte e o seletor de aba.
 * - Quatro faixas empurravam a primeira linha para depois de ~460px em 1080p.
 *   Os dois banners viraram a fila de trabalho, que conta E filtra.
 * - Nenhuma funcionalidade saiu: exportar, seleção em massa, trocas, pedidos
 *   de ajuste, evento encerrado e o modal continuam onde estavam.
 *
 * Só composição (25/09: tinha 1.034 linhas, agora só liga as peças):
 * - filtros num estado só ......... scaling-page/use-scaling-filters
 * - camadas do recorte ............ scaling-page/use-scaling-recorte
 * - modal, navegação e salvar ..... scaling-page/use-scaling-modal
 * - exportar ...................... scaling-page/use-scaling-export
 * - dados e permissões ............ use-scaling-data · mutations em use-scaling-mutations
 */
import { useMemo } from "react";
import { AlertTriangle, CloudOff } from "lucide-react";
import type { TeamInclusion } from "@shared/schema";
import { ScheduleBoard } from "@/components/scaling-validation/schedule-board";
import { usePageTitle } from "@/components/common/use-page-title";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { PastEventBanner } from "@/lib/event-lock";
import ScalingFilterBar from "@/components/scaling/scaling-filter-bar";
import ScalingAnalytics from "@/components/scaling/scaling-analytics";
import InclusionDetailsDialog from "@/components/scaling/inclusion-details-dialog";
import { SentToProductionDialog } from "@/components/scaling/production-approval-card";
import AttachmentLightbox from "@/components/scaling/attachment-lightbox";
import ScalingCoverageDialog from "@/components/scaling/scaling-coverage-dialog";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useScalingData, DEFAULT_SCALING_FILTERS, type ScalingFilters } from "@/components/scaling/use-scaling-data";
import { ExportColumnsDialog } from "@/components/scaling/export-columns-dialog";
import { describeLoadError } from "@/components/scaling/scaling-utils";
import { useScalingFilters } from "@/components/scaling/scaling-page/use-scaling-filters";
import { useScalingRecorte } from "@/components/scaling/scaling-page/use-scaling-recorte";
import { useScalingModal } from "@/components/scaling/scaling-page/use-scaling-modal";
import { useScalingExport } from "@/components/scaling/scaling-page/use-scaling-export";
import { useConfirmarRapido } from "@/components/scaling/scaling-page/use-confirmar-rapido";
import { useScalingSelection } from "@/components/scaling/scaling-page/use-scaling-selection";
import { ScalingHeaderBar } from "@/components/scaling/scaling-page/scaling-header-bar";
import { ScalingQueue } from "@/components/scaling/scaling-page/scaling-queue";
import { AcessoNegado, EsqueletoDaLista, EstadoVazio } from "@/components/scaling/scaling-page/estados-da-pagina";

export default function Scaling() {
  usePageTitle("Escalação");
  const { user } = useAuth();
  const { toast } = useToast();

  const filtros = useScalingFilters();
  const { aba, fila, eventosMarcados, verExcluidos, hoje, temRecorte } = filtros;

  // ── Dados ───────────────────────────────────────────────────────────────
  // O hook recebe só o que muda a CONSULTA (excluídas) e o recorte de evento;
  // busca, período, grupos e fila são aplicados no recorte, porque os
  // contadores do popover precisam das listas intermediárias.
  const hookFilters = useMemo<ScalingFilters>(
    () => ({ ...DEFAULT_SCALING_FILTERS, eventId: eventosMarcados, showDeleted: verExcluidos }),
    [eventosMarcados, verExcluidos],
  );
  // O hook recebe sortConfig NULO de propósito: ordenar é a última etapa,
  // aplicada sobre a lista já recortada. Deixá-la no hook fazia cada clique
  // num cabeçalho invalidar as camadas de filtro e os contadores da fila —
  // que não dependem da ordem — e a tela congelava ~1,8s por clique.
  const data = useScalingData({ filters: hookFilters, sortConfig: null, user });
  const {
    teamInclusions, isLoading, isFetchingInclusions, isErrorInclusions, inclusionsError,
    scalingInclusions, pendingSwapByInclusion, canApproveProduction, canExport, isAdminOrPurchasing,
    getEventName, getFunctionName, getCollaboratorName, getCollaboratorCity, getTicket, getAccommodation,
  } = data;

  const r = useScalingRecorte({ data, filtros, user });
  const modal = useScalingModal({ user, toast, data, visibleRows: r.visibleRows });
  const exportar = useScalingExport({ aba, canExport, visibleRows: r.visibleRows, data, details: modal.details, toast });
  const rapido = useConfirmarRapido({ queueContext: r.queueContext, getCollaboratorName, getFunctionName, toast, setSentToProductionInfo: modal.setSentToProductionInfo });
  const sel = useScalingSelection(data);

  // Permissão de acesso à tela — depois de todos os hooks
  if (!hasPermission(user, "canAccessScreen2")) return <AcessoNegado />;

  const eventoEncerrado = eventosMarcados.length === 1 && !data.podeAgirEmEventoPassado && data.isPastEvent(eventosMarcados[0]);
  const somenteLeitura = eventoEncerrado;
  const eventoUnico = eventosMarcados.length === 1 ? data.eventById.get(eventosMarcados[0]) : undefined;

  const tableProps = {
    podeConfirmarRapido: rapido.podeConfirmarRapido,
    onConfirmarRapido: rapido.confirmarRapido,
    confirmandoId: rapido.confirmandoId,
    sortConfig: filtros.sortConfig,
    onSort: filtros.handleSort,
    onRowClick: (i: TeamInclusion) => modal.openInclusion(i, "resumo"),
    onViewComments: modal.handleViewComments,
    onEscalar: modal.handleEscalar,
    getFunctionName, getEventName, getCollaboratorName, getCollaboratorCity, getTicket, getAccommodation,
    pendingSwapByInclusion,
    pendingChangeByInclusion: data.pendingChangeByInclusion,
    approvedSwapInclusionIds: data.approvedSwapInclusionIds,
    seenSwapIds: modal.seenSwapIds,
    currentUserId: user?.id,
    isAdminOrPurchasing,
    // A tabela recebe a regra ESTRITA (admin ou responsável pela função): o
    // botão "Escalar alguém" não deve convidar quem não responde pela vaga.
    canManageFunction: data.canScaleFunction,
    canApproveProduction,
    isEventLocked: data.isEventLocked,
    commentCountByInclusion: data.commentCountByInclusion,
    getResponsavelDaFuncao: data.getResponsavelDaFuncao,
    temPassagemComprada: r.queueContext.temPassagemComprada,
    readOnly: somenteLeitura,
    selectedIds: sel.selectedIds,
    getSelectBlockReason: r.getSelectBlockReason,
    onToggleSelect: sel.toggleSelect,
    onToggleAllVisible: sel.toggleAllVisible,
  };

  return (
    // Margens pela variável do layout (23/09): `-mx-6` fixo estourava a largura
    // em 375px (o layout dá 16px ali) e deixava fresta em 1024+.
    <div className="-mx-[var(--page-gutter)] -mt-[var(--page-gutter)]">
      <ScalingHeaderBar resumoTopo={r.resumoTopo} aba={aba} onAba={filtros.setAba} canExport={canExport} onExportar={exportar.abrirExportar} />

      {/* `div`, não `main` (23/09): o `<main>` é um só e mora no layout. */}
      <div className="px-[var(--page-gutter)] pt-5">
        <div className="flex flex-col gap-4 max-w-[1560px] mx-auto">
          <PastEventBanner show={eventoEncerrado} />

          {isErrorInclusions && !teamInclusions ? (
            <EstadoVazio
              icone={<CloudOff className="w-7 h-7" aria-hidden="true" />}
              titulo="Não foi possível carregar as escalações"
              texto={`${describeLoadError(inclusionsError)} Nada do que você escalou foi perdido.`}
            />
          ) : isLoading && !teamInclusions ? (
            <EsqueletoDaLista />
          ) : (
            <>
            {/*
              A MESMA barra de filtros das duas abas (04/09).
              Ela só existia na Fila, e as Análises liam a lista filtrada
              apenas pelo período — então o "Exportar" daqui levava tudo, sem
              como recortar. Agora o que se vê nas Análises e o que sai no
              relatório são o mesmo recorte.
            */}
            <ScalingFilterBar
              busca={filtros.busca} onBusca={filtros.setBusca}
              eventos={filtros.eventos} onEventos={filtros.setEventos} opcoesDeEvento={r.opcoesDeEvento}
              funcoes={filtros.funcoes} onFuncoes={filtros.setFuncoes} opcoesDeFuncao={r.opcoesDeFuncao}
              periodo={filtros.periodo} onPeriodo={filtros.setPeriodo} linhasSemPeriodo={scalingInclusions} hoje={hoje} datasDoEvento={r.datasDoEvento}
              flags={filtros.flags} onFlags={filtros.setFlags} linhasSemFlags={r.comBusca} queueContext={r.queueContext}
              verExcluidos={verExcluidos} onVerExcluidos={filtros.setVerExcluidos}
              recorteEventos={filtros.recorteEventos} onRecorteEventos={filtros.setRecorteEventos} contagemPorRecorte={r.contagemPorRecorte}
              contagem={r.contagem}
            />

            {aba === "escala" ? (
              <div className="space-y-2" data-testid="aba-escala-quadro">
                <ScheduleBoard
                  rows={r.linhasDoQuadro}
                  functionNameById={r.nomesDasFuncoes}
                  rangeStart={eventoUnico?.startDate ?? undefined}
                  rangeEnd={eventoUnico?.endDate ?? undefined}
                />
                <p className="text-2xs text-muted-foreground">
                  Quadro do recorte atual, somente leitura — vagas canceladas não entram na soma.
                  {eventosMarcados.length !== 1 ? " Escolha um evento no filtro para ver o período inteiro dele." : ""}
                </p>
              </div>
            ) : aba === "analises" ? (
              <ScalingAnalytics
                linhas={r.comFlags}
                sugestoes={r.sugestoesDoRecorte}
                ctx={r.analyticsContext}
                hoje={hoje}
                onVerVagasDoEvento={filtros.verVagasDoEvento}
                onVerFuncao={filtros.verFuncao}
                onAbrirLinha={(i) => { filtros.setAba("fila"); modal.openInclusion(i, "resumo"); }}
              />
            ) : (
              <ScalingQueue
                contagens={r.contagensDaFila} total={r.comPeriodo.length} fila={fila} onFila={filtros.setFila}
                mostrarGestor={canApproveProduction} mostrarTrocas={isAdminOrPurchasing}
                isFetching={isFetchingInclusions}
                semVagas={scalingInclusions.length === 0 && !temRecorte}
                visibleRows={r.visibleRows}
                nomesDosFiltrosAtivos={r.nomesDosFiltrosAtivos}
                onLimparFiltros={filtros.limpaFiltros}
                tableProps={tableProps}
                selectedInclusions={sel.selectedInclusions}
                setSelectedIds={sel.setSelectedIds}
              />
            )}
            </>
          )}
        </div>
      </div>

      <InclusionDetailsDialog
        open={modal.showModal}
        onOpenChange={modal.setShowModal}
        modal
        inclusion={modal.selectedInclusion}
        initialTab={modal.modalInitialTab}
        abrirEscolhaDeColaborador={modal.abrirEscolhaDeColaborador}
        modalData={modal.modalData}
        setModalData={modal.setModalData}
        data={data}
        details={modal.details}
        mutations={modal.mutations}
        user={user}
        openAttachment={modal.openAttachment}
        navIndex={modal.navIndex}
        navTotal={r.visibleRows.length}
        onNavigate={modal.navigate}
        onSave={modal.handleSave}
        onConfirm={modal.handleConfirm}
      />

      <ExportColumnsDialog
        open={exportar.exportOpen}
        onOpenChange={exportar.setExportOpen}
        exporting={exportar.exporting}
        quantasLinhas={exportar.quantasLinhas}
        comFiltro={temRecorte}
        onExport={exportar.onExport}
      />
      <SentToProductionDialog info={modal.sentToProductionInfo} onClose={() => modal.setSentToProductionInfo(null)} />
      <AttachmentLightbox item={modal.lightbox} onClose={() => modal.setLightbox(null)} />

      <ScalingCoverageDialog
        open={exportar.coberturaOpen}
        onOpenChange={exportar.setCoberturaOpen}
        linhas={r.linhasDoRelatorio}
        ctx={r.analyticsContext}
        hoje={hoje}
        recorte={r.nomesDosFiltrosDoRecorte}
      />

      <ConfirmDialog
        open={modal.descartePendente !== null}
        onOpenChange={(o) => { if (!o) modal.setDescartePendente(null); }}
        icon={(props) => <AlertTriangle {...props} aria-hidden="true" />}
        tone="danger"
        title="Descartar alterações?"
        description="Você mudou esta escalação e ainda não salvou. Ir para a próxima descarta o que foi digitado."
        cancelLabel="Continuar editando"
        confirmLabel="Descartar e sair"
        pending={false}
        onConfirm={modal.confirmarDescarte}
        testId="dialog-descartar-alteracoes"
      />
    </div>
  );
}
