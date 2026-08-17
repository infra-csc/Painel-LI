import GridTeamInclusionForm from "@/components/forms/grid-team-inclusion-form";
import TeamInclusionTable from "@/components/tables/team-inclusion-table";
import EventModal from "@/components/modals/event-modal";
import { useAuth } from "@/hooks/use-auth";
import { canView, canEdit } from "@/lib/permissions";
import { useState, useEffect } from "react";
import { Plus, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

export default function TeamInclusion() {
  const { user } = useAuth();
  const [showEventModal, setShowEventModal] = useState(false);
  const [tableReady, setTableReady] = useState(false);

  // Adia a montagem da tabela pesada para a página aparecer imediatamente
  useEffect(() => {
    const id = setTimeout(() => setTableReady(true), 80);
    return () => clearTimeout(id);
  }, []);

  // Prefetch antecipado das queries mais pesadas para que já estejam em voo
  // quando os componentes filhos montarem (não bloqueia a renderização)
  useQuery({ queryKey: ["/api/team-inclusions"], staleTime: Infinity });
  useQuery({ queryKey: ["/api/events"], staleTime: Infinity });
  useQuery({ queryKey: ["/api/collaborators"], staleTime: Infinity });
  useQuery({ queryKey: ["/api/functions"], staleTime: Infinity });

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
      {/* Page Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-[10px] bg-[#0033CC] flex items-center justify-center shrink-0"
            style={{ boxShadow: "0 4px 14px #0033CC50" }}
          >
            <span
              className="material-symbols-outlined text-white text-xl"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              group_add
            </span>
          </div>
          <div>
            <h1 className="text-[18px] font-bold text-slate-900 leading-tight">Inclusão de Equipe</h1>
            <p className="text-xs text-slate-400 mt-0.5">Monte a grade de funções e gerencie as inclusões do evento</p>
          </div>
        </div>
        {canEdit(user as any, 'team_inclusion') && (
          <button
            onClick={() => setShowEventModal(true)}
            className="h-9 px-4 flex items-center gap-1.5 text-sm font-semibold text-white rounded-lg transition-all"
            style={{ background: "#0033CC", boxShadow: "0 2px 8px #0033CC40" }}
            data-testid="button-create-event"
          >
            <Plus className="h-4 w-4" />
            Novo Evento
          </button>
        )}
      </div>

      <div className="space-y-6">
        <GridTeamInclusionForm />
        {tableReady ? (
          <TeamInclusionTable />
        ) : (
          <div className="rounded-xl border border-slate-100 bg-white p-6 flex items-center gap-3 text-slate-400 text-sm">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
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
