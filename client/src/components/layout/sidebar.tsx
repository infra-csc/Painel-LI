import { Link, useLocation } from "wouter";
import {
  Users, UserCheck, Plane, Hotel, CheckCircle, Search,
  UserPlus, Settings, Wrench, UserCog, Calendar, LogOut,
  Menu, X, ChevronLeft, ChevronRight, Minimize2, Maximize2,
  Sun, Moon, Focus, Calculator, ClipboardCheck, BarChart3, Shield
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/contexts/sidebar-context";
import { useTheme } from "@/contexts/theme-context";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger
} from "@/components/ui/tooltip";
import norteLogo from "@assets/image_1770316785096.png";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Nav config ─────────────────────────────────────────────────────────────
const menuGroups = [
  { title: "Cadastros",   items: ["user-registration", "events", "functions", "collaborators"] },
  { title: "Operacional", items: ["team-inclusion", "scaling", "tickets", "accommodations"] },
  { title: "Financeiro",  items: ["budget-planned", "budget-actual", "budget-comparison", "rh-control"] },
  { title: "Gestão",      items: ["approval", "consultation", "admin-users"] },
];

// ─── Sidebar ─────────────────────────────────────────────────────────────────
export default function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isCollapsed, isCompact, isFocusMode, toggleCollapsed, toggleCompact, enterFocusMode } = useSidebar();
  const { theme, toggleTheme } = useTheme();

  const allTabs = [
    { id: "user-registration", path: "/user-registration", label: "Cadastro de Usuários", icon: UserPlus,       permission: "canAccessScreen0" as const },
    { id: "events",            path: "/events",            label: "Eventos",               icon: Calendar,       permission: "canAccessAdminUsers" as const },
    { id: "functions",         path: "/functions",         label: "Funções",               icon: Wrench,         permission: "canAccessScreen0" as const },
    { id: "collaborators",     path: "/collaborators",     label: "Colaboradores",         icon: UserCog,        permission: "canAccessCollaborators" as const },
    { id: "team-inclusion",    path: "/team-inclusion",    label: "Inclusão de Equipe",    icon: Users,          permission: "canAccessScreen1" as const },
    { id: "scaling",           path: "/scaling",           label: "Escalação",             icon: UserCheck,      permission: "canAccessScreen2" as const },
    { id: "tickets",           path: "/tickets",           label: "Compra de Passagem",    icon: Plane,          permission: "canAccessScreen3" as const },
    { id: "accommodations",    path: "/accommodations",    label: "Hospedagem",            icon: Hotel,          permission: "canAccessScreen3" as const },
    { id: "budget-planned",    path: "/budget-planned",    label: "Planejado",             icon: Calculator,     permission: "canAccessScreen0" as const },
    { id: "budget-actual",     path: "/budget-actual",     label: "Realizado",             icon: ClipboardCheck, permission: "canAccessScreen0" as const },
    { id: "budget-comparison", path: "/budget-comparison", label: "Comparativo",           icon: BarChart3,      permission: "canAccessScreen5" as const },
    { id: "rh-control",        path: "/rh-control",        label: "Controle RH",           icon: Shield,         permission: "canAccessScreen5" as const },
    { id: "approval",          path: "/approval",          label: "Aprovação",             icon: CheckCircle,    permission: "canAccessScreen5" as const },
    { id: "consultation",      path: "/consultation",      label: "Consulta Geral",        icon: Search,         permission: "canAccessScreen6" as const },
    { id: "admin-users",       path: "/admin-users",       label: "Usuários",              icon: Settings,       permission: "canAccessAdminUsers" as const },
    { id: "system-settings",   path: "/system-settings",   label: "Configurações",         icon: Settings,       permission: "canAccessAdminUsers" as const },
  ];

  const tabs = allTabs.filter(tab =>
    hasPermission(user, tab.permission) &&
    tab.id !== "closure" &&
    tab.id !== "approval"
  );

  const getGroupTabs = (ids: string[]) => tabs.filter(t => ids.includes(t.id));
  const userName = user?.name || "Usuário";

  // ── Nav item ─────────────────────────────────────────────────────────────
  function NavItem({ tab }: { tab: typeof tabs[0] }) {
    const Icon = tab.icon;
    const isActive = location === tab.path;

    const btn = (
      <Link href={tab.path}>
        <button
          onClick={() => setMobileOpen(false)}
          data-testid={`sidebar-${tab.id}`}
          className={cn(
            "relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
            isCompact && "justify-center px-0",
            isActive
              ? "bg-blue-50 text-blue-700"
              : "text-slate-600 hover:bg-slate-50 hover:text-blue-700"
          )}
        >
          {/* Active left accent */}
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 rounded-r-full" />
          )}
          <Icon className={cn(
            "flex-shrink-0 w-[18px] h-[18px] transition-colors duration-150",
            isActive
              ? "text-blue-600"
              : "text-blue-400/70 group-hover:text-blue-600"
          )} />
          {!isCompact && <span className="truncate leading-tight">{tab.label}</span>}
        </button>
      </Link>
    );

    if (isCompact) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{btn}</TooltipTrigger>
          <TooltipContent side="right" className="text-xs">{tab.label}</TooltipContent>
        </Tooltip>
      );
    }
    return btn;
  }

  return (
    <TooltipProvider delayDuration={150}>
      <>
        {/* Mobile hamburger */}
        <button
          className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-md border border-gray-200"
          onClick={() => setMobileOpen(v => !v)}
        >
          {mobileOpen ? <X className="w-5 h-5 text-slate-600" /> : <Menu className="w-5 h-5 text-slate-600" />}
        </button>

        {/* Mobile overlay */}
        {mobileOpen && (
          <div className="lg:hidden fixed inset-0 bg-black/30 z-40" onClick={() => setMobileOpen(false)} />
        )}

        {/* Re-expand tab when fully collapsed (desktop) */}
        {isCollapsed && !isFocusMode && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="hidden lg:flex fixed top-1/2 -translate-y-1/2 left-0 z-50 w-5 h-12 bg-white border border-l-0 border-slate-200 rounded-r-lg items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors shadow-sm"
                onClick={toggleCollapsed}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">Expandir menu</TooltipContent>
          </Tooltip>
        )}

        {/* ── Sidebar ── */}
        {/* Left accent stripe on the sidebar itself */}
        <aside className={cn(
          "fixed left-0 top-0 h-full z-40 flex flex-col transition-all duration-300 ease-in-out shadow-sm",
          "bg-white border-r border-slate-100 border-l-[3px] border-l-blue-600",
          isCompact ? "w-16" : "w-60",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          (isCollapsed || isFocusMode) && "lg:-translate-x-full"
        )}>

          {/* ── Logo — dark brand header ── */}
          <div className={cn(
            "bg-[#0f172a] shrink-0 flex items-center",
            isCompact ? "h-14 justify-center px-3" : "h-14 px-4 justify-between"
          )}>
            {isCompact ? (
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-base select-none shadow-md">
                N
              </div>
            ) : (
              <div className="flex-1 flex items-center min-w-0 pr-2">
                <img
                  src={norteLogo}
                  alt="Norte"
                  className="w-36 object-cover object-top"
                  style={{
                    clipPath: "inset(0 0 25% 0)",
                    filter: "brightness(0) invert(1)",
                  }}
                />
              </div>
            )}

            {/* Collapse chevron — white on dark header */}
            {!isCompact && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="hidden lg:flex w-6 h-6 items-center justify-center rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                    onClick={toggleCollapsed}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">Recolher menu</TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* ── Nav ── */}
          <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2">
            {menuGroups.map((group, idx) => {
              const groupTabs = getGroupTabs(group.items);
              if (groupTabs.length === 0) return null;

              return (
                <div key={group.title} className={cn(idx > 0 && "mt-5")}>
                  {!isCompact ? (
                    /* Group label — blue/indigo tint instead of flat gray */
                    <p className="text-[10px] font-bold text-blue-400/80 uppercase tracking-widest px-3 mb-1.5 select-none">
                      {group.title}
                    </p>
                  ) : (
                    idx > 0 && <div className="border-t border-slate-100 mx-2 mb-3" />
                  )}
                  <ul className="space-y-0.5">
                    {groupTabs.map(tab => (
                      <li key={tab.id}>
                        <NavItem tab={tab} />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </nav>

          {/* ── Footer ── */}
          <div className="border-t border-slate-100 px-2 py-3 space-y-2 shrink-0">
            {/* User info */}
            <div className={cn("flex items-center gap-2.5 px-1 min-w-0", isCompact && "justify-center px-0")}>
              {/* Blue/indigo gradient avatar */}
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0",
                "bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm shadow-blue-200"
              )}>
                {initials(userName)}
              </div>
              {!isCompact && (
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-700 truncate leading-tight">{user?.name}</p>
                  <p className="text-[10px] text-slate-400 truncate leading-tight">{user?.email}</p>
                </div>
              )}
            </div>

            {/* Action icon row */}
            <div className={cn("flex items-center gap-1", isCompact ? "flex-col" : "px-1")}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={toggleCompact}
                    className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    {isCompact ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side={isCompact ? "right" : "top"} className="text-xs">
                  {isCompact ? "Expandir" : "Compactar"}
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={enterFocusMode}
                    className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <Focus className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side={isCompact ? "right" : "top"} className="text-xs">Modo foco</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={toggleTheme}
                    className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    {theme === "light" ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side={isCompact ? "right" : "top"} className="text-xs">
                  {theme === "light" ? "Tema escuro" : "Tema claro"}
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Logout */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={logout}
                  className={cn(
                    "flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors duration-150",
                    isCompact && "justify-center px-0"
                  )}
                >
                  <LogOut className="w-[18px] h-[18px] shrink-0" />
                  {!isCompact && <span>Sair</span>}
                </button>
              </TooltipTrigger>
              {isCompact && (
                <TooltipContent side="right" className="text-xs">Sair</TooltipContent>
              )}
            </Tooltip>
          </div>
        </aside>
      </>
    </TooltipProvider>
  );
}
