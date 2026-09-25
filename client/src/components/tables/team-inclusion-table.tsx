/**
 * Tabela de Inclusões de Equipe (25/09).
 *
 * Só orquestra: hooks de dados/ações/edição/lote e os blocos em
 * ./team-inclusion/*. Tinha 1.700 linhas num componente só.
 */
import { useRef, useCallback } from "react";
import { formatDiarias } from "@/lib/utils";
import { rotuloEmpreita, vagaComEmpreita } from "@shared/cenotecnica-empreita";
import { LayoutGrid, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission, hasRole } from "@/lib/role-utils";
import CommentsModal from "@/components/modals/comments-modal";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import UniversalFilters from "@/components/common/universal-filters";
import SortableHeader from "@/components/common/sortable-header";
import { isReadOnly } from "@/lib/interactions";
import { PastEventBanner } from "@/lib/event-lock";
import { apiErrorMessage } from "@/lib/api-error";
import { toTitleCase } from "@/lib/format";
import { useLinhasVirtuais, EspacadorLinha } from "@/components/common/virtual-rows";
import { COLUNAS_TABELA, canCancelEscalation, canDeleteInclusion, formatDate, getDisplayStatus } from "./team-inclusion/inclusion-shared";
import { InclusionRow } from "./team-inclusion/inclusion-row";
import { useTeamInclusionData } from "./team-inclusion/use-team-inclusion-data";
import { useInclusionActions } from "./team-inclusion/use-inclusion-actions";
import { useEditInclusion } from "./team-inclusion/use-edit-inclusion";
import { useBulkDays } from "./team-inclusion/use-bulk-days";
import { TotalsCards } from "./team-inclusion/totals-cards";
import { BulkActionsBar } from "./team-inclusion/bulk-actions-bar";
import { EditInclusionDialog } from "./team-inclusion/edit-inclusion-dialog";
import { BulkDaysDialog } from "./team-inclusion/bulk-days-dialog";

const TH = "!px-2 text-2xs uppercase tracking-widest text-muted-foreground font-semibold";

export default function TeamInclusionTable() {
  const { user } = useAuth();
  const data = useTeamInclusionData();
  const {
    filters, setFilters, sortConfig, handleSort, selectedRows, approvedSwapInclusionIds,
    isLoading, isError, error, functions, inclusionById, getEventName, getEventLocation, getFunctionName, getCollaboratorName,
    eventLock, isEventLocked, eventLockReason, filteredAndSortedInclusions, totals,
    toggleRowSelection, toggleSelectAll, selectedVisibleCount, allVisibleSelected,
  } = data;
  const actions = useInclusionActions(data);
  const edit = useEditInclusion(inclusionById);
  const bulk = useBulkDays(data);

  // ── Virtualização (23/09) ──────────────────────────────────────────────────
  // ~4.500 linhas × 10 colunas iam para o DOM de uma vez. Agora só o que cabe
  // no contêiner de rolagem (+ overscan) é renderizado; abaixo de 60 linhas a
  // lista é renderizada inteira (sem overhead). Os hooks ficam ANTES dos
  // retornos antecipados de carregando/erro.
  const scrollRef = useRef<HTMLDivElement>(null);
  const linhasVirtuais = useLinhasVirtuais(filteredAndSortedInclusions, {
    scrollRef,
    alturaEstimada: 57,
    overscan: 12,
  });

  // Callbacks ESTÁVEIS para a linha memoizada: leem o handler mais recente via
  // ref, então `React.memo` da linha não é furado a cada render da tabela.
  const acoesRef = useRef({ handleEdit: edit.handleEdit, handleDelete: actions.handleDelete, handleCancelEscalation: actions.handleCancelEscalation, handleViewComments: actions.handleViewComments, toggleRowSelection });
  acoesRef.current = { handleEdit: edit.handleEdit, handleDelete: actions.handleDelete, handleCancelEscalation: actions.handleCancelEscalation, handleViewComments: actions.handleViewComments, toggleRowSelection };
  const aoEditar = useCallback((id: string) => acoesRef.current.handleEdit(id), []);
  const aoExcluir = useCallback((id: string) => acoesRef.current.handleDelete(id), []);
  const aoCancelar = useCallback((id: string) => acoesRef.current.handleCancelEscalation(id), []);
  const aoVerComentarios = useCallback((id: string) => acoesRef.current.handleViewComments(id), []);
  const aoAlternarSelecao = useCallback((id: string) => acoesRef.current.toggleRowSelection(id), []);
  const podeEditarTela = hasPermission(user, 'canEditScreen1');
  const podeCancelarPorPapel = hasRole(user, "purchasing", "production", "admin");

  if (isLoading) {
    return (
      <div className="bg-card rounded-lg shadow-1 border border-border p-6">
        <div className="animate-pulse motion-reduce:animate-none space-y-4">
          <div className="h-4 bg-muted rounded w-1/3"></div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Falha de rede/sessão NÃO pode virar "nenhuma inclusão encontrada"
  if (isError) {
    return (
      <div className="bg-card rounded-xl border border-danger/25 p-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-danger-soft flex items-center justify-center mx-auto mb-3">
          <AlertCircle className="w-6 h-6 text-danger-strong" aria-hidden="true" />
        </div>
        <h3 className="text-base font-bold text-slate-700 mb-1">Não foi possível carregar as inclusões</h3>
        <p className="text-sm text-muted-foreground">{apiErrorMessage(error, "Verifique sua conexão e tente novamente.")}</p>
      </div>
    );
  }

  return (
    <>
      <UniversalFilters filters={filters} onFiltersChange={(f) => setFilters({ ...f, status: f.status ?? [] })} />

      {/* Evento encerrado: banner discreto quando o filtro aponta para um evento
          já terminado e o usuário não é o administrador. */}
      <PastEventBanner
        show={filters.eventId.length === 1 && eventLock.isReadOnlyPastEvent(filters.eventId[0])}
        className="mb-4"
      />

      <TotalsCards totals={totals} filters={filters} setFilters={setFilters} />

      {/* Barra de ações em lote */}
      {selectedRows.size > 0 && podeEditarTela && (
        <BulkActionsBar
          selectedCount={selectedRows.size} selectedVisibleCount={selectedVisibleCount}
          onBatchDays={bulk.openBatchDiarias} onBulkDelete={actions.handleBulkDelete} onBulkCancel={actions.handleBulkCancel}
        />
      )}

      {/* Table */}
      <div className="bg-card rounded-xl border border-border shadow-1 overflow-hidden">
        <div className="px-5 py-3.5 flex items-center justify-between bg-surface-muted border-b-2 border-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-700">Inclusões de Equipe</span>
            {filteredAndSortedInclusions.length > 0 && (
              <span className="text-xs text-muted-foreground">({filteredAndSortedInclusions.length})</span>
            )}
          </div>
          {podeEditarTela && filteredAndSortedInclusions.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={bulk.openBatchDiarias}
              className="h-7 px-2.5 text-2xs font-semibold text-primary border-primary/25 hover:bg-brand-soft gap-1.5"
            >
              <LayoutGrid className="w-3 h-3" aria-hidden="true" />
              Editar diárias em lote
            </Button>
          )}
        </div>

        {/* Contêiner que rola (base da virtualização): cabeçalho fixo dentro
            dele; altura = viewport − barra do topo − filtros/cards/rodapé. */}
        <div
          ref={scrollRef}
          className="overflow-auto max-h-[calc(100vh-var(--sticky-top,3.5rem)-14rem)]"
          data-testid="team-inclusion-scroll"
        >
          <table className="table-fixed w-full">
          <caption className="sr-only">Inclusões de equipe: colaborador, função, período, diárias e status de cada vaga</caption>
            <thead className="bg-surface-muted sticky top-0 z-10 shadow-[inset_0_-2px_0_0_var(--border)]">
              <tr>
                <th scope="col" className="w-[40px] px-2 py-3">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Selecionar todas as inclusões exibidas"
                    data-testid="checkbox-select-all"
                  />
                </th>
                <SortableHeader field="id" className={`w-[80px] ${TH}`} sortConfig={sortConfig} onSort={handleSort}>ID</SortableHeader>
                <SortableHeader field="event" className={`w-[22%] ${TH}`} sortConfig={sortConfig} onSort={handleSort}>Evento</SortableHeader>
                <SortableHeader field="function" className={`w-[10%] ${TH}`} sortConfig={sortConfig} onSort={handleSort}>Função</SortableHeader>
                <SortableHeader field="collaborator" className={`w-[18%] ${TH}`} sortConfig={sortConfig} onSort={handleSort}>Colaborador</SortableHeader>
                <SortableHeader field="date" className={`w-[100px] ${TH}`} sortConfig={sortConfig} onSort={handleSort}>Data/Diárias</SortableHeader>
                <SortableHeader field="status" className={`w-[130px] ${TH}`} sortConfig={sortConfig} onSort={handleSort}>Status</SortableHeader>
                <th scope="col" className="w-[48px] px-2 py-3 text-center text-2xs font-semibold text-muted-foreground uppercase tracking-widest">
                  Pass.
                </th>
                <th scope="col" className="w-[64px] px-2 py-3 text-center text-2xs font-semibold text-muted-foreground uppercase tracking-widest">
                  Hosp.
                </th>
                <th scope="col" className="w-[100px] whitespace-nowrap pl-4 pr-2 py-3 text-right text-2xs font-semibold text-muted-foreground uppercase tracking-widest">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody aria-rowcount={filteredAndSortedInclusions.length + 1}>
              {filteredAndSortedInclusions.length === 0 ? (
                <tr>
                  <td colSpan={COLUNAS_TABELA} className="px-6 py-12 text-center text-muted-foreground text-sm">
                    Nenhuma inclusão de equipe encontrada
                  </td>
                </tr>
              ) : (
                <>
                  <EspacadorLinha altura={linhasVirtuais.espacoAntes} colunas={COLUNAS_TABELA} />
                  {linhasVirtuais.linhas.map(({ item: inclusion, index, medir }) => {
                    const empreita = !inclusion.collaboratorId && vagaComEmpreita(inclusion);
                    return (
                      <InclusionRow
                        key={inclusion.id}
                        ref={medir}
                        index={index}
                        id={inclusion.id}
                        inclusionNumber={inclusion.inclusionNumber ?? null}
                        eventName={getEventName(inclusion.eventId)}
                        eventLocation={getEventLocation(inclusion.eventId)}
                        functionName={getFunctionName(inclusion.functionId)}
                        collaboratorName={inclusion.collaboratorId ? toTitleCase(getCollaboratorName(inclusion.collaboratorId) || "") : null}
                        empreitaEmpresa={empreita ? String(inclusion.empreitaEmpresa ?? "") : null}
                        empreitaTitulo={empreita ? rotuloEmpreita(inclusion) : ""}
                        displayStatus={getDisplayStatus(inclusion)}
                        isCanceled={inclusion.status === 'cancelado'}
                        periodo={inclusion.scheduleStartDate && inclusion.scheduleEndDate
                          ? `${formatDate(inclusion.scheduleStartDate)} - ${formatDate(inclusion.scheduleEndDate)}`
                          : "Não definidas"}
                        diarias={formatDiarias(inclusion.dailyRates)}
                        needsTicket={!!inclusion.needsTicket}
                        needsAccommodation={!!inclusion.needsAccommodation}
                        selected={selectedRows.has(inclusion.id)}
                        locked={isEventLocked(inclusion)}
                        lockReason={eventLockReason(inclusion) ?? null}
                        canEditScreen={podeEditarTela}
                        readOnly={isReadOnly(inclusion)}
                        canDelete={canDeleteInclusion(inclusion)}
                        canCancel={canCancelEscalation(inclusion)}
                        cancelByRole={podeCancelarPorPapel}
                        swapApproved={approvedSwapInclusionIds.has(inclusion.id)}
                        onToggleSelect={aoAlternarSelecao}
                        onCopyId={actions.aoCopiarId}
                        onComments={aoVerComentarios}
                        onEdit={aoEditar}
                        onDelete={aoExcluir}
                        onCancel={aoCancelar}
                      />
                    );
                  })}
                  <EspacadorLinha altura={linhasVirtuais.espacoDepois} colunas={COLUNAS_TABELA} />
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CommentsModal
        open={actions.showCommentsModal}
        onClose={() => actions.setShowCommentsModal(false)}
        teamInclusionId={actions.selectedInclusion || ""}
      />

      <EditInclusionDialog edit={edit} functions={functions} />
      <BulkDaysDialog bulk={bulk} getCollaboratorName={getCollaboratorName} getFunctionName={getFunctionName} />

      <ConfirmDialog
        open={actions.confirmState.open}
        onOpenChange={(o) => { if (!o) actions.closeConfirm(); }}
        tone={actions.confirmState.variant === "confirm" ? "default" : "danger"}
        title={actions.confirmState.title}
        description={actions.confirmState.message}
        confirmLabel={actions.confirmState.confirmLabel}
        onConfirm={actions.confirmState.onConfirm}
      />
    </>
  );
}
