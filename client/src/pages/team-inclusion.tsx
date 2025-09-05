import Header from "@/components/layout/header";
import NavigationTabs from "@/components/layout/navigation-tabs";
import WorkflowIndicator from "@/components/layout/workflow-indicator";
import GridTeamInclusionForm from "@/components/forms/grid-team-inclusion-form";
import TeamInclusionTable from "@/components/tables/team-inclusion-table";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";

export default function TeamInclusion() {
  const { user } = useAuth();

  // Check if user can access this screen
  if (!hasPermission(user, 'canAccessScreen1')) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-card rounded-lg shadow-sm border border-border p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Acesso Negado</h3>
            <p className="text-muted-foreground">Você não tem permissão para acessar esta tela.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <NavigationTabs activeTab="team-inclusion" />
        <WorkflowIndicator currentPhase="inclusao" />
        
        <div className="space-y-6">
          <GridTeamInclusionForm />
          <TeamInclusionTable />
        </div>
        
      </div>
    </div>
  );
}
