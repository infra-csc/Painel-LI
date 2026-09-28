/**
 * Colaboradores — prestadores, motoristas e colaboradores internos.
 *
 * Desde 25/09 a página só compõe (tinha 939 linhas): lista/filtros/paginação em
 * `components/collaborators/use-collaborators-list`, seleção + diálogos +
 * mutations em `use-collaborator-actions`, e cada bloco visual no seu arquivo
 * (stats, barra de filtros, tabela, diálogos de detalhes e de decisão).
 */
import { AlertCircle, Upload, UserPlus, Users } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { apiErrorMessage, apiErrorStatus } from "@/lib/api-error";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission, hasRole } from "@/lib/role-utils";
import CollaboratorModal from "@/components/modals/collaborator-modal";
import BulkUploadModal from "@/components/modals/bulk-upload-modal";
import { PageHeader } from "@/components/common/page-header";
import { PageContainer } from "@/components/common/page-container";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { usePageTitle } from "@/components/common/use-page-title";
import { useCollaboratorsList } from "@/components/collaborators/use-collaborators-list";
import { useCollaboratorActions } from "@/components/collaborators/use-collaborator-actions";
import { CollaboratorsStats } from "@/components/collaborators/collaborators-stats";
import { CollaboratorsFilterBar } from "@/components/collaborators/collaborators-filter-bar";
import { CollaboratorsTable, CollaboratorsPagination } from "@/components/collaborators/collaborators-table";
import { CollaboratorDetailsDialog } from "@/components/collaborators/collaborator-details-dialog";
import { CollaboratorApprovalDialog, CollaboratorInactivateDialog } from "@/components/collaborators/collaborator-decision-dialogs";

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
  // Espelha a projeção do GET /api/collaborators: Logística e Área de Função
  // não recebem documento, nascimento, telefone, endereço nem anexo — a coluna
  // e as seções correspondentes somem em vez de mostrar "—".
  const podeVerDadosPessoais = hasRole(user, "admin", "purchasing", "financial");

  const lista = useCollaboratorsList();
  const a = useCollaboratorActions({ user, toast, podeVerDadosPessoais });
  const { collaborators, isLoading, isError, error, refetch, filtered, paginated, currentPage, totalPages, setPage, hasFilters, clearFilters } = lista;

  if (isLoading) {
    return (
      <PageContainer>
        <PageHeader icon={Users} title="Colaboradores" subtitle="Gerencie prestadores, motoristas e colaboradores internos" />
        <LoadingState count={8} label="Carregando colaboradores…" />
      </PageContainer>
    );
  }

  // Só troca a tela pelo erro quando NÃO há dados em cache: com
  // refetchOnWindowFocus ligado, um refetch falho em segundo plano não pode
  // apagar uma lista que o usuário está usando.
  if (isError && !collaborators) {
    const msg = apiErrorStatus(error) === 401 ? "Sua sessão expirou. Entre novamente para ver os colaboradores."
      : apiErrorStatus(error) === 403 ? "Você não tem permissão para ver os colaboradores."
      : apiErrorMessage(error, "Verifique sua conexão e tente novamente.");
    return (
      /* Antes, uma falha de rede caía no estado vazio e dizia "nenhum colaborador". */
      <div role="alert" className="bg-card rounded-xl border border-danger/25 shadow-1 py-16 px-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-danger-soft flex items-center justify-center mx-auto mb-3">
          <AlertCircle className="w-6 h-6 text-danger-strong" aria-hidden="true" />
        </div>
        <p className="text-sm font-semibold text-slate-700">Não foi possível carregar os colaboradores</p>
        <p className="text-xs text-muted-foreground mt-1 mb-4">{msg}</p>
        <button onClick={() => refetch()} className="h-9 px-4 text-xs font-semibold text-slate-600 border border-border rounded-lg hover:bg-surface-muted transition-colors">
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <PageContainer>
        <PageHeader
          icon={Users}
          title="Colaboradores"
          subtitle="Gerencie prestadores, motoristas e colaboradores internos"
          actions={canEdit && (
            <>
              <button
                onClick={() => a.setBulkUploadModal(true)}
                className="h-9 px-3.5 flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-border hover:border-slate-300 hover:bg-surface-muted rounded-lg transition-colors bg-card"
              >
                <Upload className="w-3.5 h-3.5" aria-hidden="true" /> Importar
              </button>
              <button
                onClick={() => a.setShowAddModal(true)}
                className="h-9 px-4 flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold rounded-lg transition-all shadow-1"
              >
                <UserPlus className="w-3.5 h-3.5" aria-hidden="true" /> Novo colaborador
              </button>
            </>
          )}
        />

        <CollaboratorsStats counts={lista.counts} />

        {/* ── Main card ── */}
        <div className="bg-card rounded-xl border border-border shadow-1 overflow-hidden">
          <CollaboratorsFilterBar lista={lista} podeVerDadosPessoais={podeVerDadosPessoais} />

          {filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Users}
                variant={hasFilters ? "filtered" : "default"}
                title="Nenhum colaborador encontrado"
                description={canEdit ? "Tente ajustar os filtros ou cadastre um novo colaborador." : "Tente ajustar os filtros."}
                onClearFilters={hasFilters ? clearFilters : undefined}
                className="border-0 py-14"
              />
            </div>
          ) : (
            <CollaboratorsTable
              rows={paginated}
              podeVerDadosPessoais={podeVerDadosPessoais}
              canEdit={canEdit}
              canManage={canManage}
              updatePending={a.updateMutation.isPending}
              reactivatePending={a.reactivateMutation.isPending}
              acoes={a}
              onReactivate={(id) => a.reactivateMutation.mutate(id)}
            />
          )}

          {filtered.length > 0 && (
            <CollaboratorsPagination total={filtered.length} currentPage={currentPage} totalPages={totalPages} setPage={setPage} />
          )}
        </div>

        <CollaboratorDetailsDialog
          open={a.showDetailsModal}
          onOpenChange={a.setShowDetailsModal}
          c={a.selectedCollaborator}
          podeVerDadosPessoais={podeVerDadosPessoais}
          canEdit={canEdit}
          onApprove={a.handleApprove}
          onReject={a.handleReject}
        />
        <CollaboratorApprovalDialog a={a} podeVerDadosPessoais={podeVerDadosPessoais} />
        <CollaboratorInactivateDialog a={a} />

        <BulkUploadModal open={a.showBulkUploadModal} onClose={() => a.setBulkUploadModal(false)} />
        <CollaboratorModal open={a.showAddModal} onClose={() => a.setShowAddModal(false)} />
        <CollaboratorModal open={a.showEditModal} onClose={() => a.setShowEditModal(false)} collaborator={a.selectedCollaborator} isEdit={true} />
      </PageContainer>
    </TooltipProvider>
  );
}
