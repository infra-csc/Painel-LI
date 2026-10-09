/**
 * Tabela de Inclusões de Equipe (25/09).
 *
 * Só orquestra: hooks de ações/edição/lote e os blocos em ./team-inclusion/*.
 * Tinha 1.700 linhas num componente só.
 *
 * 07/10 (redesenho, família Passagens/Hospedagem/Eventos): a seção "Vagas
 * incluídas" tem título com a contagem do recorte, a faixa de resumo (os oito
 * totais, em dois grupos), a barra de filtros comum e a lista. A lista rola
 * por dentro com o cabeçalho grudado (a grade de montagem fica acima e muda de
 * altura — a virtualização precisa de um contêiner próprio); abaixo da
 * largura da tabela, a MESMA linha vira cartão por CSS. Seleção ganha a barra
 * que sobe do rodapé; excluir e cancelar dizem QUAL vaga. Os dados vêm da
 * página (`useTeamInclusionData`), que também escreve o resumo na barra da tela.
 */
import { useRef, useCallback, useState } from "react";
import { formatDiarias } from "@/lib/utils";
import { rotuloEmpreita, vagaComEmpreita } from "@shared/cenotecnica-empreita";
import { Ban, ChevronDown, ChevronUp, ChevronsUpDown, CloudOff, LayoutGrid, ListPlus, RotateCw, SearchX, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission, hasRole } from "@/lib/role-utils";
import CommentsModal from "@/components/modals/comments-modal";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import UniversalFilters from "@/components/common/universal-filters";
import type { SortField } from "@/components/common/sortable-header";
import { useLarguraUtil } from "@/components/common/use-largura-util";
import { isReadOnly } from "@/lib/interactions";
import { PastEventBanner } from "@/lib/event-lock";
import { apiErrorMessage } from "@/lib/api-error";
import { toTitleCase } from "@/lib/format";
import { useLinhasVirtuais, EspacadorLinha } from "@/components/common/virtual-rows";
import { COLUNAS_TABELA, canCancelEscalation, canDeleteInclusion, formatDate, getDisplayStatus } from "./team-inclusion/inclusion-shared";
import { InclusionRow } from "./team-inclusion/inclusion-row";
import type { TeamInclusionData } from "./team-inclusion/use-team-inclusion-data";
import { useInclusionActions } from "./team-inclusion/use-inclusion-actions";
import { useEditInclusion } from "./team-inclusion/use-edit-inclusion";
import { useBulkDays } from "./team-inclusion/use-bulk-days";
import { TotalsCards } from "./team-inclusion/totals-cards";
import { BulkActionsBar } from "./team-inclusion/bulk-actions-bar";
import { EditInclusionDialog } from "./team-inclusion/edit-inclusion-dialog";
import { BulkDaysDialog } from "./team-inclusion/bulk-days-dialog";

const TH = "px-2.5 py-2.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground text-left";
/** Abaixo disto a tabela vira cartão (largura ÚTIL, não da janela — o menu lateral muda). */
const LARGURA_MINIMA_DA_TABELA = 900;

/** Esqueleto com a geometria real: título, faixa de resumo, barra e as primeiras linhas. */
export function EsqueletoDasVagas() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" aria-label="Carregando as vagas" className="flex flex-col gap-3" data-testid="esqueleto-vagas">
      <span className="sr-only">Carregando as vagas…</span>
      <div aria-hidden="true" className="grid grid-cols-1 2xl:grid-cols-2 gap-2.5">
        {[0, 1].map((g) => (
          <div key={g} className="grid grid-cols-2 sm:grid-cols-4 rounded-xl border border-border bg-card overflow-hidden">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`px-3.5 pt-3 pb-3.5 space-y-2 ${i > 0 ? "sm:border-l border-border" : ""} ${i % 2 === 1 ? "border-l" : ""} ${i >= 2 ? "border-t sm:border-t-0" : ""}`}>
                <div className="pas-osso h-3 w-20" />
                <div className="pas-osso h-5 w-24" />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="flex gap-1.5">
        <div className="pas-osso h-[34px] flex-[1_1_200px] max-w-[300px] rounded-lg" />
        <div className="pas-osso h-[34px] w-[160px] rounded-lg hidden sm:block" />
        <div className="pas-osso h-[34px] w-[150px] rounded-lg hidden sm:block" />
        <div className="pas-osso h-[34px] w-[180px] rounded-lg hidden md:block" />
        <div className="pas-osso h-[34px] w-[92px] rounded-lg" />
      </div>
      <div aria-hidden="true" className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="h-10 bg-surface-muted border-b border-border" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-border last:border-0">
            <div className="pas-osso h-4 w-4 rounded" />
            <div className="pas-osso h-[22px] w-11" />
            <div className="flex-1 space-y-1.5"><div className="pas-osso h-3.5 w-2/5" /><div className="pas-osso h-2.5 w-3/5" /></div>
            <div className="pas-osso h-3.5 w-32 hidden md:block" />
            <div className="pas-osso h-3.5 w-20 hidden md:block" />
            <div className="pas-osso h-[22px] w-28 hidden md:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TeamInclusionTable({ data }: { data: TeamInclusionData }) {
  const { user } = useAuth();
  const {
    filters, setFilters, sortConfig, handleSort, selectedRows, setSelectedRows, approvedSwapInclusionIds,
    teamInclusions, isLoading, isError, error, refetch, isFetching, functions, inclusionById,
    getEventName, getEventLocation, getFunctionName, getCollaboratorName,
    eventLock, isEventLocked, eventLockReason, filteredAndSortedInclusions, totals, opcoesDosFiltros,
    toggleRowSelection, toggleSelectAll, selectedVisibleCount, allVisibleSelected,
  } = data;
  const actions = useInclusionActions(data);
  const edit = useEditInclusion(inclusionById);
  const bulk = useBulkDays(data);

  // Tabela × cartão pela largura útil da seção (medida, não media query).
  const { ref: refLargura, largura } = useLarguraUtil<HTMLElement>();
  const modoCartao = largura !== null && largura < LARGURA_MINIMA_DA_TABELA;
  const compacta = !modoCartao && largura !== null && largura < 1240;

  // ── Virtualização (23/09) ──────────────────────────────────────────────────
  // ~4.500 linhas iam para o DOM de uma vez. Agora só o que cabe no contêiner
  // de rolagem (+ overscan) é renderizado; abaixo de 60 linhas a lista é
  // renderizada inteira (sem overhead). Os hooks ficam ANTES de qualquer ramo.
  const scrollRef = useRef<HTMLDivElement>(null);
  const linhasVirtuais = useLinhasVirtuais(filteredAndSortedInclusions, {
    scrollRef,
    alturaEstimada: modoCartao ? 150 : 58,
    overscan: 12,
  });

  // Qual vaga a confirmação está pedindo (para o diálogo dizer QUAL é).
  const [alvo, setAlvo] = useState<string | null>(null);

  // Callbacks ESTÁVEIS para a linha memoizada: leem o handler mais recente via
  // ref, então `React.memo` da linha não é furado a cada render da tabela.
  const acoesRef = useRef({ handleEdit: edit.handleEdit, handleDelete: actions.handleDelete, handleCancelEscalation: actions.handleCancelEscalation, handleViewComments: actions.handleViewComments, toggleRowSelection });
  acoesRef.current = { handleEdit: edit.handleEdit, handleDelete: actions.handleDelete, handleCancelEscalation: actions.handleCancelEscalation, handleViewComments: actions.handleViewComments, toggleRowSelection };
  const aoEditar = useCallback((id: string) => acoesRef.current.handleEdit(id), []);
  const aoExcluir = useCallback((id: string) => { setAlvo(id); acoesRef.current.handleDelete(id); }, []);
  const aoCancelar = useCallback((id: string) => { setAlvo(id); acoesRef.current.handleCancelEscalation(id); }, []);
  const aoVerComentarios = useCallback((id: string) => acoesRef.current.handleViewComments(id), []);
  const aoAlternarSelecao = useCallback((id: string) => acoesRef.current.toggleRowSelection(id), []);
  const podeEditarTela = hasPermission(user, 'canEditScreen1');
  const podeCancelarPorPapel = hasRole(user, "purchasing", "production", "admin");

  const total = teamInclusions?.length ?? 0;
  const n = filteredAndSortedInclusions.length;
  const algumFiltro = !!(filters.searchId || filters.eventId.length || filters.functionId.length || filters.collaboratorId.length || filters.status.length || filters.escalationStatus.length || filters.showDeleted);
  const limparFiltros = () => setFilters({ eventId: [], functionId: [], collaboratorId: [], status: [], escalationStatus: [], searchId: "", showDeleted: false });

  // Ordenar: botão de 26px no cabeçalho (o mesmo de Hospedagem).
  const sortBtn = (field: SortField, label: string) => (
    <button
      type="button"
      onClick={() => handleSort(field)}
      className={`group/ordem inline-flex items-center gap-1 h-[26px] rounded-sm uppercase tracking-[inherit] hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${sortConfig?.field === field ? "text-primary" : ""}`}
      data-testid={`header-${field}`}
      aria-label={`Ordenar por ${label}`}
    >
      {label}
      {sortConfig?.field === field
        ? (sortConfig.direction === "asc" ? <ChevronUp className="w-3 h-3" aria-hidden="true" /> : <ChevronDown className="w-3 h-3" aria-hidden="true" />)
        : <ChevronsUpDown className="w-3 h-3 opacity-0 transition-opacity group-hover/ordem:opacity-50" aria-hidden="true" />}
    </button>
  );
  const ariaSort = (field: SortField) =>
    sortConfig?.field === field ? (sortConfig.direction === "asc" ? "ascending" : "descending") : undefined;

  // ── Confirmação: o diálogo mostra QUAL vaga (ou quantas, no lote) ──
  const vagaAlvo = alvo ? inclusionById.get(alvo) : undefined;
  const detalhes = vagaAlvo ? (
    <div className="space-y-0.5">
      <p className="m-0 font-semibold text-sm leading-5">
        <span className="font-mono text-primary">#{vagaAlvo.inclusionNumber ?? "—"}</span> · {getFunctionName(vagaAlvo.functionId)}
        {vagaAlvo.collaboratorId ? ` · ${toTitleCase(getCollaboratorName(vagaAlvo.collaboratorId) || "")}` : ""}
      </p>
      <p className="m-0 text-muted-foreground">
        {getEventName(vagaAlvo.eventId)}
        {vagaAlvo.scheduleStartDate && vagaAlvo.scheduleEndDate ? ` · ${formatDate(vagaAlvo.scheduleStartDate)} – ${formatDate(vagaAlvo.scheduleEndDate)}` : ""}
      </p>
    </div>
  ) : undefined;

  // ── Corpo da seção ──
  let corpo: React.ReactNode;
  if (isLoading) {
    corpo = <EsqueletoDasVagas />;
  } else if (isError) {
    // Falha de rede/sessão NÃO pode virar "nenhuma inclusão encontrada"
    corpo = (
      <div role="alert" className="pas-entra flex flex-col items-center text-center rounded-xl border border-danger/25 bg-card px-6 py-12" data-testid="erro-vagas">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-danger-soft text-danger mb-3" aria-hidden="true">
          <CloudOff className="w-5 h-5" />
        </span>
        <h3 className="m-0 text-base font-semibold text-foreground">Não foi possível carregar as inclusões</h3>
        <p className="m-0 mt-1.5 max-w-[440px] text-sm leading-relaxed text-muted-foreground">{apiErrorMessage(error, "Verifique sua conexão e tente novamente.")}</p>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="mt-5 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-muted disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RotateCw className={`w-4 h-4 ${isFetching ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
          {isFetching ? "Tentando…" : "Tentar novamente"}
        </button>
      </div>
    );
  } else if (total === 0 && !algumFiltro) {
    // Nenhuma vaga ainda: uma faixa de zeros e filtros sem o que filtrar só
    // empurram o convite para baixo — fica o vazio, sozinho.
    corpo = (
      <div className="pas-entra flex flex-col items-center text-center rounded-xl border border-dashed border-border bg-card px-6 py-12" data-testid="vazio-vagas">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-brand-soft text-primary mb-3" aria-hidden="true">
          <ListPlus className="w-5 h-5" />
        </span>
        <h3 className="m-0 text-base font-semibold text-foreground">Nenhuma vaga incluída ainda</h3>
        <p className="m-0 mt-1.5 max-w-[440px] text-sm leading-relaxed text-muted-foreground">
          {podeEditarTela
            ? "Escolha o evento e o período na grade acima, diga quantas pessoas de cada função trabalham em cada dia e crie as vagas."
            : "Quando a Logística montar as vagas de um evento, elas aparecem aqui."}
        </p>
      </div>
    );
  } else {
    corpo = (
      <>
        {/* A faixa de resumo: cada bloco conta E filtra (reclicar desliga). */}
        <TotalsCards totals={totals} filters={filters} setFilters={setFilters} />

        <UniversalFilters
          filters={filters}
          onFiltersChange={(f) => setFilters({ ...f, status: f.status ?? [] } as typeof filters)}
          opcoes={opcoesDosFiltros}
        />

        {/* Evento encerrado: banner discreto quando o filtro aponta para um evento
            já terminado e o usuário não é o administrador. */}
        <PastEventBanner show={filters.eventId.length === 1 && eventLock.isReadOnlyPastEvent(filters.eventId[0])} />

        {n === 0 ? (
          <div className="pas-entra flex flex-col items-center text-center rounded-xl border border-border bg-card px-6 py-12" data-testid="sem-resultado-vagas">
            <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-muted text-muted-foreground mb-3" aria-hidden="true">
              <SearchX className="w-5 h-5" />
            </span>
            <h3 className="m-0 text-base font-semibold text-foreground">Nenhuma inclusão de equipe encontrada</h3>
            <p className="m-0 mt-1.5 max-w-[440px] text-sm leading-relaxed text-muted-foreground">
              Nenhuma vaga bate com a busca e os filtros de agora. Ajuste ou limpe para ver as {total} {total === 1 ? "vaga" : "vagas"}.
            </p>
            <button
              type="button"
              onClick={limparFiltros}
              className="mt-4 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-card text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="button-clear-filters-empty"
            >
              Limpar filtros
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {/* Contêiner que rola (base da virtualização): cabeçalho grudado
                dentro dele; com a página rolada até aqui, a lista ocupa a
                tela inteira abaixo da barra (56px). Virtualizada, tem altura
                mínima: sem ela o cartão (sem cabeçalho) media 0 e nenhuma
                linha era desenhada. */}
            <div
              ref={scrollRef}
              className={`overflow-auto overscroll-contain max-h-[calc(100dvh-var(--sticky-top,3.5rem)-3.5rem-2rem)] ${linhasVirtuais.ativo ? "min-h-[min(480px,60dvh)]" : ""} ${modoCartao ? "inc-cartao" : compacta ? "inc-tabela inc-compacta" : "inc-tabela"}`}
              data-testid="team-inclusion-scroll"
            >
              <table className={`w-full text-left border-collapse ${modoCartao ? "" : "table-fixed"}`}>
                <caption className="sr-only">Inclusões de equipe: vaga (função e evento), colaborador, período, diárias, logística e situação de cada vaga</caption>
                {!modoCartao && (
                  <colgroup>
                    <col style={{ width: 40 }} />
                    <col style={{ width: 84 }} />
                    <col />
                    <col style={{ width: compacta ? "19%" : "20%" }} />
                    <col style={{ width: 118 }} />
                    <col style={{ width: compacta ? 76 : 212 }} />
                    <col style={{ width: compacta ? 172 : 210 }} />
                    <col style={{ width: compacta ? 136 : 148 }} />
                  </colgroup>
                )}
                <thead className="inc-cabecalho">
                  <tr>
                    <th scope="col" className="pl-3 pr-1 py-2.5">
                      {podeEditarTela && (
                        <Checkbox
                          checked={allVisibleSelected}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Selecionar todas as inclusões exibidas"
                          data-testid="checkbox-select-all"
                        />
                      )}
                    </th>
                    <th scope="col" aria-sort={ariaSort("id")} className={`${TH} !px-1.5 whitespace-nowrap`}>{sortBtn("id", "ID")}</th>
                    <th scope="col" aria-sort={ariaSort("function") ?? ariaSort("event")} className={`${TH} whitespace-nowrap`}>
                      <span className="inline-flex items-center gap-1.5">
                        {sortBtn("function", "Função")}
                        <span className="h-3 w-px bg-border" aria-hidden="true" />
                        {sortBtn("event", "Evento")}
                      </span>
                    </th>
                    <th scope="col" aria-sort={ariaSort("collaborator")} className={`${TH} whitespace-nowrap`}>{sortBtn("collaborator", "Colaborador")}</th>
                    <th scope="col" aria-sort={ariaSort("date")} className={`${TH} whitespace-nowrap`}>{sortBtn("date", "Período")}</th>
                    <th scope="col" className={`${TH} whitespace-nowrap`} title="Precisa de passagem / hospedagem">{compacta ? "Precisa" : "Precisa de"}</th>
                    <th scope="col" aria-sort={ariaSort("status")} className={`${TH} whitespace-nowrap`}>{sortBtn("status", "Situação")}</th>
                    <th scope="col" className="pl-1 pr-3 py-2.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground text-right">Ações</th>
                  </tr>
                </thead>
                <tbody aria-rowcount={n + 1}>
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
                          ? `${formatDate(inclusion.scheduleStartDate)} – ${formatDate(inclusion.scheduleEndDate)}`
                          : "Não definidas"}
                        diarias={formatDiarias(inclusion.dailyRates)}
                        needsTicket={!!inclusion.needsTicket}
                        needsAccommodation={!!inclusion.needsAccommodation}
                        selected={selectedRows.has(inclusion.id)}
                        locked={isEventLocked(inclusion)}
                        lockReason={eventLockReason(inclusion) ?? null}
                        canEditScreen={podeEditarTela}
                        // Admin e Compras editam vaga já comprada (regra do servidor, podeEditarVaga); cancelada segue só leitura.
                        readOnly={inclusion.status === "cancelado" || isReadOnly(inclusion, user)}
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
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Barra de ações em lote: sobe do rodapé com a primeira marcada. */}
        {selectedRows.size > 0 && podeEditarTela && (
          <BulkActionsBar
            selectedCount={selectedRows.size} selectedVisibleCount={selectedVisibleCount}
            onBatchDays={bulk.openBatchDiarias}
            onBulkDelete={() => { setAlvo(null); actions.handleBulkDelete(); }}
            onBulkCancel={() => { setAlvo(null); actions.handleBulkCancel(); }}
            onClear={() => setSelectedRows(new Set())}
          />
        )}
      </>
    );
  }

  const mostraCabecalho = !isLoading && !isError && !(total === 0 && !algumFiltro);
  return (
    <section ref={refLargura} aria-labelledby="inc-vagas-titulo" className="flex flex-col gap-3 scroll-mt-[calc(var(--sticky-top,3.5rem)+4.5rem)]" id="vagas-incluidas" data-testid="secao-vagas">
      {/* Título da seção: o que é, quantas no recorte e a ação da lista inteira. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-h-[34px]">
        <h2 id="inc-vagas-titulo" className="m-0 text-[15px] font-semibold text-foreground">Vagas incluídas</h2>
        {mostraCabecalho && (
          <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite" data-testid="contagem-vagas">
            {n !== total ? `${n} de ${total} ${total === 1 ? "vaga" : "vagas"}` : `${n} ${n === 1 ? "vaga" : "vagas"}`}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {/* No cartão não há cabeçalho de tabela: o "selecionar todas" vem para cá. */}
          {mostraCabecalho && modoCartao && podeEditarTela && n > 0 && (
            <label className="inline-flex items-center gap-2 h-[34px] px-2.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-muted cursor-pointer">
              <Checkbox checked={allVisibleSelected} onCheckedChange={toggleSelectAll} aria-label="Selecionar todas as inclusões exibidas" />
              Todas
            </label>
          )}
          {mostraCabecalho && podeEditarTela && n > 0 && (
            <button
              type="button"
              onClick={bulk.openBatchDiarias}
              className="pas-alvo inline-flex items-center gap-1.5 h-[34px] px-3 rounded-lg border border-border bg-card text-sm font-medium text-slate-700 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title={selectedRows.size > 0 ? "Editar os dias das vagas selecionadas" : "Editar os dias de todas as vagas da lista (as de evento encerrado ficam de fora)"}
            >
              <LayoutGrid className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              Editar diárias em lote
            </button>
          )}
        </div>
      </div>

      {corpo}

      <CommentsModal
        open={actions.showCommentsModal}
        onClose={() => actions.setShowCommentsModal(false)}
        teamInclusionId={actions.selectedInclusion || ""}
      />

      <EditInclusionDialog edit={edit} functions={functions} getEventName={getEventName} getCollaboratorName={getCollaboratorName} />
      <BulkDaysDialog bulk={bulk} getCollaboratorName={getCollaboratorName} getFunctionName={getFunctionName} />

      <ConfirmDialog
        open={actions.confirmState.open}
        onOpenChange={(o) => { if (!o) actions.closeConfirm(); }}
        tone={actions.confirmState.variant === "confirm" ? "default" : "danger"}
        icon={actions.confirmState.variant === "cancel" ? Ban : Trash2}
        title={actions.confirmState.title}
        description={actions.confirmState.message}
        confirmLabel={actions.confirmState.confirmLabel}
        cancelLabel="Voltar"
        detalhes={detalhes}
        onConfirm={actions.confirmState.onConfirm}
        testId="confirm-inclusao"
      />
    </section>
  );
}
