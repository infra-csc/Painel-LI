import { Link, useLocation } from "wouter";
import { Users, UserCheck, Plane, Calculator, CheckCircle, Search, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";

interface NavigationTabsProps {
  activeTab: string;
}

export default function NavigationTabs({ activeTab }: NavigationTabsProps) {
  const [location] = useLocation();
  const { user } = useAuth();

  const allTabs = [
    {
      id: "user-registration",
      path: "/user-registration",
      label: "Tela 0 - Cadastro de Usuários",
      icon: UserPlus,
      permission: "canAccessScreen0" as const,
    },
    {
      id: "team-inclusion",
      path: "/team-inclusion",
      label: "Tela 1 - Inclusão de Equipe",
      icon: Users,
      permission: "canAccessScreen1" as const,
    },
    {
      id: "scaling",
      path: "/scaling",
      label: "Tela 2 - Escalação",
      icon: UserCheck,
      permission: "canAccessScreen2" as const,
    },
    {
      id: "tickets",
      path: "/tickets",
      label: "Tela 3 - Compra de Passagem",
      icon: Plane,
      permission: "canAccessScreen3" as const,
    },
    {
      id: "closure",
      path: "/closure",
      label: "Tela 4 - Fechamento",
      icon: Calculator,
      permission: "canAccessScreen4" as const,
    },
    {
      id: "approval",
      path: "/approval",
      label: "Tela 5 - Aprovação",
      icon: CheckCircle,
      permission: "canAccessScreen5" as const,
    },
    {
      id: "consultation",
      path: "/consultation",
      label: "Tela 6 - Consulta Geral",
      icon: Search,
      permission: "canAccessScreen6" as const,
    },
  ];

  // Filter tabs based on user permissions
  const tabs = allTabs.filter(tab => hasPermission(user, tab.permission));

  return (
    <div className="bg-card rounded-lg shadow-sm border border-border mb-8">
      <div className="border-b border-border">
        <nav className="flex space-x-8 px-6 overflow-x-auto" aria-label="Tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = location === tab.path;
            
            return (
              <Link key={tab.id} href={tab.path}>
                <button
                  className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center ${
                    isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  }`}
                  data-testid={`tab-${tab.id}`}
                >
                  <Icon className="w-4 h-4 mr-2" />
                  {tab.label}
                </button>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
