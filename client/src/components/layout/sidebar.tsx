import { Link, useLocation } from "wouter";
import { 
  Users, 
  UserCheck, 
  Plane, 
  Hotel, 
  CheckCircle, 
  Search, 
  UserPlus, 
  Settings, 
  Wrench, 
  UserCog, 
  Calendar,
  LogOut,
  Menu,
  X
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";
import norteLogo from "@assets/image_1770316785096.png";

export default function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const allTabs = [
    {
      id: "user-registration",
      path: "/user-registration",
      label: "Cadastro de Usuários",
      icon: UserPlus,
      permission: "canAccessScreen0" as const,
    },
    {
      id: "events",
      path: "/events",
      label: "Eventos",
      icon: Calendar,
      permission: "canAccessAdminUsers" as const,
    },
    {
      id: "functions",
      path: "/functions",
      label: "Funções",
      icon: Wrench,
      permission: "canAccessScreen0" as const,
    },
    {
      id: "team-inclusion",
      path: "/team-inclusion",
      label: "Inclusão de Equipe",
      icon: Users,
      permission: "canAccessScreen1" as const,
    },
    {
      id: "scaling",
      path: "/scaling",
      label: "Escalação",
      icon: UserCheck,
      permission: "canAccessScreen2" as const,
    },
    {
      id: "tickets",
      path: "/tickets",
      label: "Compra de Passagem",
      icon: Plane,
      permission: "canAccessScreen3" as const,
    },
    {
      id: "accommodations",
      path: "/accommodations",
      label: "Hospedagem",
      icon: Hotel,
      permission: "canAccessScreen3" as const,
    },
    {
      id: "approval",
      path: "/approval",
      label: "Aprovação",
      icon: CheckCircle,
      permission: "canAccessScreen5" as const,
    },
    {
      id: "consultation",
      path: "/consultation",
      label: "Consulta Geral",
      icon: Search,
      permission: "canAccessScreen6" as const,
    },
    {
      id: "admin-users",
      path: "/admin-users",
      label: "Gerenciamento de Usuários",
      icon: Settings,
      permission: "canAccessAdminUsers" as const,
    },
    {
      id: "collaborators",
      path: "/collaborators",
      label: "Colaboradores",
      icon: UserCog,
      permission: "canAccessCollaborators" as const,
    },
  ];

  const tabs = allTabs.filter(tab => 
    hasPermission(user, tab.permission) && 
    tab.id !== "closure" && 
    tab.id !== "approval"
  );

  const handleLogout = () => {
    logout();
  };

  return (
    <>
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-md shadow-md border"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {isOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside className={cn(
        "fixed left-0 top-0 h-full bg-white border-r border-gray-200 z-40 transition-transform duration-300 flex flex-col",
        "w-64",
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="p-4 border-b border-gray-200">
          <div className="h-14 overflow-hidden flex items-start justify-center">
            <img 
              src={norteLogo} 
              alt="Norte Logo" 
              className="h-16 w-auto object-cover object-top"
              style={{ marginTop: '-2px' }}
            />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-4">
          <ul className="space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = location === tab.path;
              
              return (
                <li key={tab.id}>
                  <Link href={tab.path}>
                    <button
                      onClick={() => setIsOpen(false)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                        isActive 
                          ? "bg-blue-600 text-white" 
                          : "text-gray-700 hover:bg-gray-100"
                      )}
                      data-testid={`sidebar-${tab.id}`}
                    >
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      <span className="truncate">{tab.label}</span>
                    </button>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center gap-3 mb-3 px-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-medium">
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full justify-start gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4" />
            Sair
          </Button>
        </div>
      </aside>
    </>
  );
}
