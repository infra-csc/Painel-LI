import { Link, useLocation } from "wouter";
import { Users, UserCheck, Plane, Calculator, CheckCircle } from "lucide-react";

interface NavigationTabsProps {
  activeTab: string;
}

export default function NavigationTabs({ activeTab }: NavigationTabsProps) {
  const [location] = useLocation();

  const tabs = [
    {
      id: "team-inclusion",
      path: "/team-inclusion",
      label: "Tela 1 - Inclusão de Equipe",
      icon: Users,
    },
    {
      id: "scaling",
      path: "/scaling",
      label: "Tela 2 - Escalação",
      icon: UserCheck,
    },
    {
      id: "tickets",
      path: "/tickets",
      label: "Tela 3 - Compra de Passagem",
      icon: Plane,
    },
    {
      id: "closure",
      path: "/closure",
      label: "Tela 4 - Fechamento",
      icon: Calculator,
    },
    {
      id: "approval",
      path: "/approval",
      label: "Tela 5 - Aprovação",
      icon: CheckCircle,
    },
  ];

  return (
    <div className="bg-card rounded-lg shadow-sm border border-border mb-8">
      <div className="border-b border-border">
        <nav className="flex space-x-8 px-6" aria-label="Tabs">
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
