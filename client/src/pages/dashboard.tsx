import { useLocation } from "wouter";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
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

  return <DashboardSummary />;
}
