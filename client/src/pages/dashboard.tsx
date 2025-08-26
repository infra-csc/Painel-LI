import { useLocation } from "wouter";
import { useEffect } from "react";
import Header from "@/components/layout/header";
import NavigationTabs from "@/components/layout/navigation-tabs";
import WorkflowIndicator from "@/components/layout/workflow-indicator";
import DashboardSummary from "@/components/common/dashboard-summary";

export default function Dashboard() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Redirect to team inclusion page
    setLocation("/team-inclusion");
  }, [setLocation]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <NavigationTabs activeTab="team-inclusion" />
        <WorkflowIndicator currentPhase="inclusao" />
        <DashboardSummary />
      </div>
    </div>
  );
}
