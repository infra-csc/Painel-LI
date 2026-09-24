import GridTeamInclusionForm from "@/components/forms/grid-team-inclusion-form";
import TeamInclusionTable from "@/components/tables/team-inclusion-table";
import EventModal from "@/components/modals/event-modal";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { useState, useEffect } from "react";
import { Plus, Loader2, UserPlus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/common/page-header";
import { usePageTitle } from "@/components/common/use-page-title";

export default function TeamInclusion() {
  const { user } = useAuth();
  const [showEventModal, setShowEventModal] = useState(false);
  const [tableReady, setTableReady] = useState(false);

  usePageTitle("Inclusão de equipe");

  // Adia a montagem da tabela pesada para a página aparecer imediatamente
  useEffect(() => {
    const id = setTimeout(() => setTableReady(true), 80);
    return () => clearTimeout(id);
  }, []);

  // Prefetch antecipado das queries mais pesadas para que já estejam em voo
  // quando os componentes filhos montarem (não bloqueia a renderização).
  // staleTime alinhado ao padrão global (60s) para não servir dados velhos.
  // As vagas NÃO entram mais aqui (24/09): a lista exige recorte por evento
  // (`?eventId=`) e é a tabela, que conhece o evento escolhido, quem a pede.
  const PREFETCH_STALE = 60_000;
  useQuery({ queryKey: ["/api/events"], staleTime: PREFETCH_STALE });
  useQuery({ queryKey: ["/api/collaborators"], staleTime: PREFETCH_STALE });
  useQuery({ queryKey: ["/api/functions"], staleTime: PREFETCH_STALE });

  // Check if user can access this screen
  // Espelha GET /api/team-inclusions (admin, production, purchasing, financial; function_area não entra).
  if (!hasPermission(user, "canAccessScreen1")) {
    return (
      <div className="bg-card rounded-lg shadow-1 border border-border p-6">
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
        title="Inclusão de equipe"
        subtitle="Monte a grade de funções e gerencie as inclusões do evento"
        actions={
          hasPermission(user, "canEditScreen1") && (
            <button
              onClick={() => setShowEventModal(true)}
              className="h-9 px-4 flex items-center gap-1.5 text-sm font-semibold text-primary-foreground rounded-lg transition-colors bg-primary hover:bg-primary-hover shadow-1"
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
          <div className="rounded-xl border border-border bg-card p-6 flex items-center gap-3 text-slate-400 text-sm" role="status" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />
            Carregando lista de inclusões…
          </div>
        )}
      </div>

      {/* "Novo Evento": mesmo modal da tela Eventos (empresa pagadora, CNPJ,
          validações e invalidação de cache idênticos — nada de formulário paralelo). */}
      <EventModal open={showEventModal} onClose={() => setShowEventModal(false)} />
    </>
  );
}
