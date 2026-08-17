import GridTeamInclusionForm from "@/components/forms/grid-team-inclusion-form";
import TeamInclusionTable from "@/components/tables/team-inclusion-table";
import EventModal from "@/components/modals/event-modal";
import { useAuth } from "@/hooks/use-auth";
import { canView, canEdit } from "@/lib/permissions";
import { useState, useEffect } from "react";
import { Plus, Loader2, UserPlus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/common/page-header";
import { usePageTitle } from "@/components/common/use-page-title";

export default function TeamInclusion() {
  const { user } = useAuth();
  const [showEventModal, setShowEventModal] = useState(false);
  const [tableReady, setTableReady] = useState(false);

  usePageTitle("Inclusão de Equipe");

  // Adia a montagem da tabela pesada para a página aparecer imediatamente
  useEffect(() => {
    const id = setTimeout(() => setTableReady(true), 80);
    return () => clearTimeout(id);
  }, []);

  // Prefetch antecipado das queries mais pesadas para que já estejam em voo
  // quando os componentes filhos montarem (não bloqueia a renderização).
  // staleTime alinhado ao padrão global (60s) para não servir dados velhos.
  const PREFETCH_STALE = 60_000;
  useQuery({ queryKey: ["/api/team-inclusions"], staleTime: PREFETCH_STALE });
  useQuery({ queryKey: ["/api/events"], staleTime: PREFETCH_STALE });
  useQuery({ queryKey: ["/api/collaborators"], staleTime: PREFETCH_STALE });
  useQuery({ queryKey: ["/api/functions"], staleTime: PREFETCH_STALE });

  // Check if user can access this screen
  if (!canView(user as any, 'team_inclusion')) {
    return (
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Acesso Negado</h3>
        <p className="text-muted-foreground">Você não tem permissão para acessar esta tela.</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        className="mb-6"
        icon={UserPlus}
        title="Inclusão de Equipe"
        subtitle="Monte a grade de funções e gerencie as inclusões do evento"
        actions={
          canEdit(user as any, 'team_inclusion') && (
            <button
              onClick={() => setShowEventModal(true)}
              className="h-9 px-4 flex items-center gap-1.5 text-sm font-semibold text-white rounded-lg transition-colors bg-primary hover:bg-primary-hover shadow-sm"
              data-testid="button-create-event"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Novo Evento
            </button>
          )
        }
      />

      <div className="space-y-6">
        <GridTeamInclusionForm />
        {tableReady ? (
          <TeamInclusionTable />
        ) : (
          <div className="rounded-xl border border-slate-100 bg-white p-6 flex items-center gap-3 text-slate-400 text-sm" role="status" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />
            Carregando lista de inclusões...
          </div>
        )}
      </div>

      {/* "Novo Evento": mesmo modal da tela Eventos (empresa pagadora, CNPJ,
          validações e invalidação de cache idênticos — nada de formulário paralelo). */}
      <EventModal open={showEventModal} onClose={() => setShowEventModal(false)} />
    </>
  );
}
