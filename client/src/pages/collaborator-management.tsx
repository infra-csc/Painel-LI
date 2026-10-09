/**
 * Colaboradores — prestadores, motoristas e colaboradores internos.
 *
 * Desde 25/09 a página só compõe (tinha 939 linhas): lista/filtros/paginação em
 * `components/collaborators/use-collaborators-list`, seleção + diálogos +
 * mutations em `use-collaborator-actions`, e cada bloco visual no seu arquivo
 * (faixa de situação, barra de filtros, tabela, ficha e diálogos de decisão).
 *
 * 07/10 (redesenho): a casca da família Passagens/Hospedagem — barra da tela
 * grudada e sangrando até as margens (título, o resumo do cadastro e as
 * ações), conteúdo em até 1560px; a faixa de situação no lugar dos cinco
 * cartões; esqueleto com a geometria real; erro e lista vazia no mesmo desenho.
 */
import type { ReactNode } from "react";
import { AlertCircle, RotateCw, SearchX, Upload, UserPlus, Users } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { apiErrorMessage, apiErrorStatus } from "@/lib/api-error";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission, hasRole } from "@/lib/role-utils";
import { ROLE_GROUPS } from "@shared/roles";
import CollaboratorModal from "@/components/modals/collaborator-modal";
import BulkUploadModal from "@/components/modals/bulk-upload-modal";
import { PageHeader } from "@/components/common/page-header";
import { usePageTitle } from "@/components/common/use-page-title";
import { useCollaboratorsList } from "@/components/collaborators/use-collaborators-list";
import { useCollaboratorActions } from "@/components/collaborators/use-collaborator-actions";
import { CollaboratorsStats } from "@/components/collaborators/collaborators-stats";
import { CollaboratorsFilterBar } from "@/components/collaborators/collaborators-filter-bar";
import { CollaboratorsTable, CollaboratorsPagination } from "@/components/collaborators/collaborators-table";
import { CollaboratorDetailsDialog } from "@/components/collaborators/collaborator-details-dialog";
import { CollaboratorApprovalDialog, CollaboratorInactivateDialog } from "@/components/collaborators/collaborator-decision-dialogs";

const NOME_DA_SITUACAO: Record<string, string> = { pendente: "pendentes", aprovado: "aprovados", rejeitado: "rejeitados", inativo: "inativos" };
const NOME_DO_TIPO: Record<string, string> = { freela: "freela", casa: "da casa", local: "locais" };

export default function CollaboratorManagement() {
  usePageTitle("Colaboradores");
  const { toast } = useToast();
  const { user } = useAuth();
  // A lista literal deixava de fora papéis legados que o servidor aceita
  // ("compras", "viagens", "Administrador"...): o botão sumia para quem podia agir.
  // Inativar/reativar: POST /api/collaborators/:id/(in|re)activate → só admin e compras.
  const canManage = hasRole(user, "admin", "purchasing");
  // Criar/importar/editar/aprovar: espelha POST/PATCH /api/collaborators
  // (cadastro + área de função). RH só visualiza.
  const canEdit = hasPermission(user, "canEditCollaborators");
  // Espelha a projeção do GET /api/collaborators (ROLE_GROUPS.dadosPessoais):
  // quem fica de fora não recebe documento, nascimento, telefone, endereço nem
  // anexo — a coluna e as seções correspondentes somem em vez de mostrar "—".
  const podeVerDadosPessoais = hasRole(user, ...ROLE_GROUPS.dadosPessoais);

  const lista = useCollaboratorsList();
  const a = useCollaboratorActions({ user, toast, podeVerDadosPessoais });
  const { collaborators, isLoading, isError, error, refetch, filtered, paginated, currentPage, totalPages, setPage, hasFilters, clearFilters, filters, counts } = lista;

  // Sem nenhum cadastro, as ações moram no próprio vazio (ali elas são o assunto) — a barra não repete.
  const semNenhumCadastro = !isLoading && (collaborators?.length ?? 0) === 0 && !hasFilters;
  const acoesDaBarra = canEdit && !semNenhumCadastro ? (
    <>
      <Button variant="outline" onClick={() => a.setBulkUploadModal(true)} className="h-[34px] rounded-lg px-3 text-sm font-medium" data-testid="col-importar">
        <Upload className="w-4 h-4 mr-1.5" aria-hidden="true" /> Importar
      </Button>
      <Button onClick={() => a.setShowAddModal(true)} className="h-[34px] rounded-lg px-3.5 text-sm font-semibold bg-primary hover:bg-primary-hover text-primary-foreground" data-testid="col-novo">
        <UserPlus className="w-4 h-4 mr-1.5" aria-hidden="true" /> Novo colaborador
      </Button>
    </>
  ) : null;

  // A barra da tela aparece em todos os estados (carregando, erro, vazio): a
  // pessoa sempre sabe onde está, e nada "pula" quando os dados chegam.
  const casca = (conteudo: ReactNode, subtitulo: ReactNode, acoes: ReactNode = acoesDaBarra) => (
    <div className="-mx-[var(--page-gutter)] -mt-[var(--page-gutter)]">
      <PageHeader variant="bar" title="Colaboradores" subtitle={subtitulo} className="mx-0 mt-0" actions={acoes} />
      <div className="px-[var(--page-gutter)] pt-5 pb-6">
        <div className="flex flex-col gap-4 max-w-[1560px] mx-auto">{conteudo}</div>
      </div>
    </div>
  );

  if (isLoading) {
    // Esqueleto com a geometria real: faixa de situação, filtros e as primeiras linhas.
    return casca(
      <div role="status" aria-live="polite" aria-busy="true" aria-label="Carregando colaboradores" className="flex flex-col gap-4">
        <span className="sr-only">Carregando colaboradores…</span>
        <div aria-hidden="true" className="grid grid-cols-2 sm:grid-cols-4 rounded-xl border border-border bg-card overflow-hidden">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`px-3.5 pt-3 pb-3.5 space-y-2 ${i % 2 === 1 ? "border-l border-border" : ""} ${i >= 2 ? "border-t sm:border-t-0 sm:border-l border-border" : ""}`}>
              <div className="pas-osso h-3 w-20" />
              <div className="pas-osso h-5 w-28" />
            </div>
          ))}
        </div>
        <div aria-hidden="true" className="flex flex-col sm:flex-row gap-2">
          <div className="pas-osso h-[34px] sm:flex-[1_1_220px] sm:max-w-[340px] rounded-lg" />
          <div className="pas-osso h-[34px] w-[300px] max-w-full rounded-lg" />
        </div>
        {/* Tabela onde ela cabe; cartões (como a lista real) no tablet e no celular. */}
        <div aria-hidden="true" className="grid grid-cols-1 sm:grid-cols-2 gap-2 lg:hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card px-3.5 py-3 space-y-3">
              <div className="flex items-center gap-3">
                <div className="pas-osso h-10 w-10 shrink-0" style={{ borderRadius: 9999 }} />
                <div className="flex-1 space-y-1.5"><div className="pas-osso h-3.5 w-3/5" /><div className="pas-osso h-2.5 w-2/5" /></div>
              </div>
              <div className="flex gap-1.5"><div className="pas-osso h-[22px] w-12" /><div className="pas-osso h-[22px] w-20" /></div>
            </div>
          ))}
        </div>
        <div aria-hidden="true" className="hidden lg:block rounded-xl border border-border bg-card overflow-hidden">
          <div className="h-10 bg-surface-muted border-b border-border" />
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5 border-b border-border last:border-0">
              <div className="pas-osso h-9 w-9 shrink-0" style={{ borderRadius: 9999 }} />
              <div className="flex-1 space-y-1.5"><div className="pas-osso h-3.5 w-2/5" /><div className="pas-osso h-2.5 w-1/4" /></div>
              <div className="pas-osso h-3.5 w-24 hidden md:block" />
              <div className="pas-osso h-[22px] w-14 hidden md:block" />
              <div className="pas-osso h-3.5 w-28 hidden lg:block" />
              <div className="pas-osso h-[22px] w-20" />
            </div>
          ))}
        </div>
      </div>,
      <span>Carregando…</span>,
    );
  }

  // Só troca a tela pelo erro quando NÃO há dados em cache: com
  // refetchOnWindowFocus ligado, um refetch falho em segundo plano não pode
  // apagar uma lista que o usuário está usando.
  if (isError && !collaborators) {
    const status = apiErrorStatus(error);
    const msg = status === 401 ? "Sua sessão expirou. Entre novamente para ver os colaboradores."
      : status === 403 ? "Você não tem permissão para ver os colaboradores."
      : apiErrorMessage(error, "Verifique sua conexão e tente novamente.");
    return casca(
      /* Antes, uma falha de rede caía no estado vazio e dizia "nenhum colaborador". */
      <div role="alert" className="pas-entra flex flex-col items-center text-center rounded-xl border border-danger/25 bg-card px-6 py-14" data-testid="col-erro">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-danger-soft text-danger mb-3" aria-hidden="true">
          <AlertCircle className="w-5 h-5" />
        </span>
        <h2 className="m-0 text-base font-semibold text-foreground">
          {status === 401 || status === 403 ? "Sessão expirada ou sem permissão" : "Não foi possível carregar os colaboradores"}
        </h2>
        <p className="m-0 mt-1.5 max-w-[440px] text-sm leading-relaxed text-muted-foreground">{msg}</p>
        <Button variant="outline" className="mt-5 rounded-lg" onClick={() => refetch()}>
          <RotateCw className="w-4 h-4 mr-1.5" aria-hidden="true" />Tentar novamente
        </Button>
      </div>,
      null,
      null,
    );
  }

  // ── Resumo da barra: o cadastro inteiro (era o cartão "Total" + os de tipo). ──
  const resumo = counts.totalCount === 0
    ? "nenhum cadastro ainda"
    : (
      <span data-testid="col-resumo">
        <span className="font-medium text-slate-700 tabular-nums">{counts.totalCount}</span> {counts.totalCount === 1 ? "cadastrado" : "cadastrados"}
        <span className="hidden md:inline">
          <span aria-hidden="true"> · </span><span className="tabular-nums">{counts.freelaCount}</span> freela
          <span aria-hidden="true"> · </span><span className="tabular-nums">{counts.casaCount}</span> da casa
          <span aria-hidden="true"> · </span><span className="tabular-nums">{counts.localCount}</span> {counts.localCount === 1 ? "local" : "locais"}
        </span>
      </span>
    );

  // ── Vazio: sem nenhum cadastro × recorte sem resultado. ──
  const semNenhum = (collaborators?.length ?? 0) === 0;
  const oQueFiltra = [
    filters.status !== "all" ? NOME_DA_SITUACAO[filters.status] ?? filters.status : null,
    filters.type !== "all" ? NOME_DO_TIPO[filters.type] ?? filters.type : null,
    filters.search.trim() ? `“${filters.search.trim()}”` : null,
  ].filter(Boolean).join(" · ");
  const vazio = semNenhum && !hasFilters ? (
    <div className="pas-entra flex flex-col items-center text-center rounded-xl border border-border bg-card px-6 py-14" data-testid="col-vazio">
      <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-brand-soft text-primary mb-3" aria-hidden="true">
        <Users className="w-5 h-5" />
      </span>
      <h2 className="m-0 text-base font-semibold text-foreground">Nenhum colaborador cadastrado</h2>
      <p className="m-0 mt-1.5 max-w-[440px] text-sm leading-relaxed text-muted-foreground">
        {canEdit
          ? "Cadastre um por um ou importe uma planilha CSV com vários de uma vez."
          : "Os cadastros feitos pela Produção, Compras e áreas de função aparecem aqui."}
      </p>
      {canEdit && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button variant="outline" className="rounded-lg" onClick={() => a.setBulkUploadModal(true)}>
            <Upload className="w-4 h-4 mr-1.5" aria-hidden="true" />Importar planilha
          </Button>
          <Button className="rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground" onClick={() => a.setShowAddModal(true)}>
            <UserPlus className="w-4 h-4 mr-1.5" aria-hidden="true" />Novo colaborador
          </Button>
        </div>
      )}
    </div>
  ) : (
    <div className="pas-entra flex flex-col items-center text-center rounded-xl border border-dashed border-border bg-card px-6 py-12" data-testid="col-vazio">
      <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-muted text-muted-foreground mb-3" aria-hidden="true">
        <SearchX className="w-5 h-5" />
      </span>
      <h2 className="m-0 text-base font-semibold text-foreground">Nenhum colaborador neste recorte</h2>
      <p className="m-0 mt-1.5 max-w-[460px] text-sm leading-relaxed text-muted-foreground">
        {oQueFiltra ? <>Filtrando por <span className="font-medium text-slate-700">{oQueFiltra}</span>. </> : null}
        {canEdit ? "Ajuste os filtros — ou, se a pessoa ainda não existe, cadastre." : "Ajuste os filtros para ver mais cadastros."}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {hasFilters && (
          <Button variant="outline" className="rounded-lg" onClick={clearFilters} data-testid="col-vazio-limpar">Limpar filtros</Button>
        )}
        {canEdit && (
          <Button variant="ghost" className="rounded-lg text-primary hover:bg-brand-soft hover:text-primary" onClick={() => a.setShowAddModal(true)}>
            <UserPlus className="w-4 h-4 mr-1.5" aria-hidden="true" />Novo colaborador
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <TooltipProvider>
      {casca(
        <>
          {(!semNenhum || hasFilters) && (
            <CollaboratorsStats porStatus={lista.porStatus} ativa={filters.status} onEscolher={(s) => lista.setFilter("status", s)} />
          )}
          {(!semNenhum || hasFilters) && <CollaboratorsFilterBar lista={lista} podeVerDadosPessoais={podeVerDadosPessoais} />}

          <CollaboratorsTable
            rows={paginated}
            podeVerDadosPessoais={podeVerDadosPessoais}
            canEdit={canEdit}
            canManage={canManage}
            updatePending={a.updateMutation.isPending}
            reactivatePending={a.reactivateMutation.isPending}
            acoes={a}
            onReactivate={(id) => a.reactivateMutation.mutate(id)}
            emptyState={vazio}
            rodape={filtered.length > 0 && (
              <CollaboratorsPagination total={filtered.length} currentPage={currentPage} totalPages={totalPages} setPage={setPage} />
            )}
          />
        </>,
        resumo,
      )}

      <CollaboratorDetailsDialog
        open={a.showDetailsModal}
        onOpenChange={a.setShowDetailsModal}
        c={a.selectedCollaborator}
        podeVerDadosPessoais={podeVerDadosPessoais}
        canEdit={canEdit}
        onApprove={a.handleApprove}
        onReject={a.handleReject}
        onEdit={a.handleEdit}
      />
      <CollaboratorApprovalDialog a={a} podeVerDadosPessoais={podeVerDadosPessoais} />
      <CollaboratorInactivateDialog a={a} />

      <BulkUploadModal open={a.showBulkUploadModal} onClose={() => a.setBulkUploadModal(false)} />
      <CollaboratorModal open={a.showAddModal} onClose={() => a.setShowAddModal(false)} />
      <CollaboratorModal open={a.showEditModal} onClose={() => a.setShowEditModal(false)} collaborator={a.selectedCollaborator} isEdit={true} />
    </TooltipProvider>
  );
}
