import Header from "@/components/layout/header";
import NavigationTabs from "@/components/layout/navigation-tabs";
import WorkflowIndicator from "@/components/layout/workflow-indicator";
import TeamInclusionForm from "@/components/forms/team-inclusion-form";
import TeamInclusionTable from "@/components/tables/team-inclusion-table";
import DashboardSummary from "@/components/common/dashboard-summary";

export default function TeamInclusion() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <NavigationTabs activeTab="team-inclusion" />
        <WorkflowIndicator currentPhase="inclusao" />
        
        <div className="space-y-6">
          <TeamInclusionForm />
          <TeamInclusionTable />
        </div>
        
        <DashboardSummary />
      </div>
    </div>
  );
}
