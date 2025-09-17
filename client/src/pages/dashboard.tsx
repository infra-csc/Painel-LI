import { useLocation } from "wouter";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import Header from "@/components/layout/header";
import NavigationTabs from "@/components/layout/navigation-tabs";
import WorkflowIndicator from "@/components/layout/workflow-indicator";
import DashboardSummary from "@/components/common/dashboard-summary";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    // Find the first available screen for the user
    const availableRoutes = [
      { path: "/functions", permission: "canAccessScreen0" as const },
      { path: "/user-registration", permission: "canAccessScreen0" as const },
      { path: "/team-inclusion", permission: "canAccessScreen1" as const },
      { path: "/scaling", permission: "canAccessScreen2" as const },
      { path: "/tickets", permission: "canAccessScreen3" as const },
      { path: "/closure", permission: "canAccessScreen4" as const },
      { path: "/approval", permission: "canAccessScreen5" as const },
      { path: "/consultation", permission: "canAccessScreen6" as const },
    ];

    const firstAvailableRoute = availableRoutes.find(route => 
      hasPermission(user, route.permission)
    );

    if (firstAvailableRoute) {
      setLocation(firstAvailableRoute.path);
    } else {
      // Fallback to consultation if no other permissions
      setLocation("/consultation");
    }
  }, [setLocation, user]);

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
