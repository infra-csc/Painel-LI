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
  X,
  ChevronLeft,
  ChevronRight,
  Minimize2,
  Maximize2,
  Sun,
  Moon,
  Focus,
  Calculator,
  ClipboardCheck,
  BarChart3
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/contexts/sidebar-context";
import { useTheme } from "@/contexts/theme-context";
import norteLogo from "@assets/image_1770316785096.png";

const iconColors: Record<string, string> = {
  "user-registration": "text-emerald-500",
  "events": "text-purple-500",
  "functions": "text-orange-500",
  "team-inclusion": "text-blue-500",
  "scaling": "text-cyan-500",
  "tickets": "text-rose-500",
  "accommodations": "text-amber-500",
  "approval": "text-green-500",
  "consultation": "text-indigo-500",
  "admin-users": "text-slate-500",
  "collaborators": "text-teal-500",
  "budget-planned": "text-blue-600",
  "budget-actual": "text-purple-600",
  "budget-comparison": "text-green-600",
};

const menuGroups = [
  {
    title: "Cadastros",
    items: ["user-registration", "events", "functions", "collaborators"]
  },
  {
    title: "Operacional",
    items: ["team-inclusion", "scaling", "tickets", "accommodations"]
  },
  // {
  //   title: "Financeiro",
  //   items: ["budget-planned", "budget-actual", "budget-comparison"]
  // },
  {
    title: "Gestão",
    items: ["approval", "consultation", "admin-users"]
  }
];

export default function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const { isCollapsed, isCompact, isFocusMode, toggleCollapsed, toggleCompact, enterFocusMode } = useSidebar();
  const { theme, toggleTheme } = useTheme();

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
      label: "Usuários",
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
    {
      id: "budget-planned",
      path: "/budget-planned",
      label: "Planejado",
      icon: Calculator,
      permission: "canAccessScreen0" as const,
    },
    {
      id: "budget-actual",
      path: "/budget-actual",
      label: "Realizado",
      icon: ClipboardCheck,
      permission: "canAccessScreen0" as const,
    },
    {
      id: "budget-comparison",
      path: "/budget-comparison",
      label: "Comparativo",
      icon: BarChart3,
      permission: "canAccessScreen5" as const,
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

  const getTabsForGroup = (groupItems: string[]) => {
    return tabs.filter(tab => groupItems.includes(tab.id));
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

      {isCollapsed && (
        <button
          className="hidden lg:flex fixed bottom-6 left-6 z-50 p-3 bg-blue-600 rounded-full shadow-lg items-center justify-center hover:bg-blue-700 transition-all duration-200 hover:scale-105"
          onClick={toggleCollapsed}
          title="Expandir menu"
        >
          <ChevronRight className="w-5 h-5 text-white" />
        </button>
      )}

      <aside className={cn(
        "fixed left-0 top-0 h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 z-40 transition-all duration-300 flex flex-col shadow-lg",
        isCompact ? "w-20" : "w-64",
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        (isCollapsed || isFocusMode) && "lg:-translate-x-full"
      )}>
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center gap-2">
          {!isCompact && (
            <div className="h-12 overflow-hidden flex items-center justify-center flex-1">
              <img 
                src={norteLogo} 
                alt="Norte Logo" 
                className="w-40 object-cover object-top"
                style={{ clipPath: 'inset(0 0 25% 0)' }}
              />
            </div>
          )}
          {isCompact && (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
                N
              </div>
            </div>
          )}
          <button
            className="hidden lg:flex p-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all duration-200 hover:scale-105"
            onClick={toggleCollapsed}
            title="Recolher menu"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          {menuGroups.map((group, groupIndex) => {
            const groupTabs = getTabsForGroup(group.items);
            if (groupTabs.length === 0) return null;
            
            return (
              <div key={group.title} className={cn(groupIndex > 0 && "mt-4")}>
                {!isCompact && (
                  <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-3 mb-2">
                    {group.title}
                  </p>
                )}
                {isCompact && groupIndex > 0 && (
                  <div className="border-t border-gray-200 dark:border-gray-700 my-2" />
                )}
                <ul className="space-y-1">
                  {groupTabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = location === tab.path;
                    const iconColor = iconColors[tab.id] || "text-gray-500";
                    
                    return (
                      <li key={tab.id}>
                        <Link href={tab.path}>
                          <button
                            onClick={() => {
                              setIsOpen(false);
                              if (isActive) {
                                toggleCollapsed();
                              }
                            }}
                            className={cn(
                              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 relative group",
                              isActive 
                                ? "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300" 
                                : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:translate-x-1",
                              isCompact && "justify-center px-2"
                            )}
                            data-testid={`sidebar-${tab.id}`}
                            title={isCompact ? tab.label : undefined}
                          >
                            {isActive && (
                              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-600 rounded-r-full" />
                            )}
                            <Icon className={cn(
                              "w-5 h-5 flex-shrink-0 transition-all duration-200",
                              isActive ? "text-blue-600" : iconColor,
                              "group-hover:scale-110"
                            )} />
                            {!isCompact && <span className="truncate">{tab.label}</span>}
                          </button>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="p-3 border-t border-gray-200 dark:border-gray-700">
          <div className="flex gap-2 mb-3">
            <button
              onClick={toggleCompact}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200"
              title={isCompact ? "Expandir menu" : "Modo compacto"}
            >
              {isCompact ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
              {!isCompact && <span>Compactar</span>}
            </button>
            <button
              onClick={enterFocusMode}
              className="flex items-center justify-center p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-blue-100 dark:hover:bg-blue-900 hover:text-blue-600 dark:hover:text-blue-400 transition-all duration-200"
              title="Modo foco (esconde a barra lateral)"
            >
              <Focus className="w-4 h-4" />
            </button>
            <button
              onClick={toggleTheme}
              className="flex items-center justify-center p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200"
              title={theme === "light" ? "Tema escuro" : "Tema claro"}
            >
              {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
          </div>
          
          <div className={cn(
            "flex items-center gap-3 mb-3 px-3",
            isCompact && "justify-center px-0"
          )}>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-sm font-medium shadow-md overflow-hidden">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                user?.name?.charAt(0).toUpperCase() || 'U'
              )}
            </div>
            {!isCompact && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{user?.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.email}</p>
              </div>
            )}
          </div>
          <Button
            variant="outline"
            className={cn(
              "w-full justify-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950 transition-all duration-200",
              !isCompact && "justify-start"
            )}
            onClick={handleLogout}
            title={isCompact ? "Sair" : undefined}
          >
            <LogOut className="w-4 h-4" />
            {!isCompact && "Sair"}
          </Button>
        </div>
      </aside>
    </>
  );
}
