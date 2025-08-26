import Header from "@/components/layout/header";
import NavigationTabs from "@/components/layout/navigation-tabs";
import WorkflowIndicator from "@/components/layout/workflow-indicator";

export default function Scaling() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <NavigationTabs activeTab="scaling" />
        <WorkflowIndicator currentPhase="escalacao" />
        
        <div className="bg-card rounded-lg shadow-sm border border-border p-6">
          <h2 className="text-2xl font-bold text-foreground mb-4">Tela 2 - Escalação</h2>
          <p className="text-muted-foreground">Funcionalidade de escalação será implementada aqui.</p>
        </div>
      </div>
    </div>
  );
}
