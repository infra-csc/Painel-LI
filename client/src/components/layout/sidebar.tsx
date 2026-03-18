import { Link, useLocation } from "wouter";
import {
  Users, UserCheck, Plane, Hotel, CheckCircle, Search,
  UserPlus, Settings, Wrench, UserCog, Calendar, CalendarDays, LogOut,
  Menu, X, ChevronLeft, ChevronRight, Minimize2, Maximize2,
  Sun, Moon, Focus, Calculator, ClipboardCheck, BarChart3, Shield, FileText,
  LayoutGrid, Maximize
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Icon badge component ─────────────────────────────────────────────────────
function IconBadge({ icon: Icon, color }: { icon: React.ElementType; color: string }) {
  return (
    <span
      className="flex-shrink-0 flex items-center justify-center w-[22px] h-[22px] rounded-md"
      style={{ background: color }}
    >
      <Icon className="w-[13px] h-[13px] text-white" strokeWidth={2} />
    </span>
  );
}

// ─── Nav config ───────────────────────────────────────────────────────────────
const ACTIVE_BG = "#EEF2FF";
const ACTIVE_TEXT = "#1e40af";
const ACTIVE_BORDER = "#3b82f6";

const menuGroups = [
  { title: "Cadastros",   items: ["user-registration", "events", "calendar", "functions", "collaborators"] },
  { title: "Operacional", items: ["team-inclusion", "scaling", "tickets", "accommodations"] },
  { title: "Financeiro",  items: ["budget-planned", "budget-actual", "budget-comparison", "rh-control", "invoices", "system-settings"] },
  { title: "Gestão",      items: ["approval", "consultation", "admin-users"] },
];

// ─── Sidebar ──────────────────────────────────────────────────────────────────
export default function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isCollapsed, isCompact, isFocusMode, toggleCollapsed, toggleCompact, enterFocusMode } = useSidebar();
  const { theme, toggleTheme } = useTheme();

  const allTabs = [
    { id: "user-registration", path: "/user-registration", label: "Cadastro de Usuários", icon: UserPlus,       iconColor: "#3b82f6", permission: "canAccessScreen0" as const },
    { id: "events",            path: "/events",            label: "Eventos",               icon: Calendar,       iconColor: "#f97316", permission: "canAccessAdminUsers" as const },
    { id: "calendar",          path: "/calendar",          label: "Calendário",            icon: CalendarDays,   iconColor: "#60a5fa", permission: "canAccessCalendar" as const },
    { id: "functions",         path: "/functions",         label: "Funções",               icon: Wrench,         iconColor: "#fb923c", permission: "canAccessScreen0" as const },
    { id: "collaborators",     path: "/collaborators",     label: "Colaboradores",         icon: UserCog,        iconColor: "#64748b", permission: "canAccessCollaborators" as const },
    { id: "team-inclusion",    path: "/team-inclusion",    label: "Inclusão de Equipe",    icon: Users,          iconColor: "#f97316", permission: "canAccessScreen1" as const },
    { id: "scaling",           path: "/scaling",           label: "Escalação",             icon: ClipboardCheck, iconColor: "#94a3b8", permission: "canAccessScreen2" as const },
    { id: "tickets",           path: "/tickets",           label: "Compra de Passagem",    icon: Plane,          iconColor: "#ef4444", permission: "canAccessScreen3" as const },
    { id: "accommodations",    path: "/accommodations",    label: "Hospedagem",            icon: Hotel,          iconColor: "#60a5fa", permission: "canAccessScreen3" as const },
    { id: "budget-planned",    path: "/budget-planned",    label: "Planejado",             icon: BarChart3,      iconColor: "#f97316", permission: "canAccessScreen0" as const },
    { id: "budget-actual",     path: "/budget-actual",     label: "Realizado",             icon: Calculator,     iconColor: "#6366f1", permission: "canAccessScreen0" as const },
    { id: "budget-comparison", path: "/budget-comparison", label: "Comparativo",           icon: BarChart3,      iconColor: "#f43f5e", permission: "canAccessScreen5" as const },
    { id: "rh-control",        path: "/rh-control",        label: "Controle RH",           icon: Shield,         iconColor: "#8b5cf6", permission: "canAccessScreen5" as const },
    { id: "invoices",          path: "/invoices",          label: "Notas Fiscais",         icon: FileText,       iconColor: "#f97316", permission: "canAccessScreen0" as const },
    { id: "approval",          path: "/approval",          label: "Aprovação",             icon: CheckCircle,    iconColor: "#10b981", permission: "canAccessScreen5" as const },
    { id: "consultation",      path: "/consultation",      label: "Consulta Geral",        icon: Search,         iconColor: "#64748b", permission: "canAccessScreen6" as const },
    { id: "admin-users",       path: "/admin-users",       label: "Usuários",              icon: Settings,       iconColor: "#64748b", permission: "canAccessAdminUsers" as const },
    { id: "system-settings",   path: "/system-settings",   label: "Valores Padrão",        icon: Settings,       iconColor: "#94a3b8", permission: "canAccessAdminUsers" as const },
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
    const isActive = location === tab.path;

    const btn = (
      <Link href={tab.path}>
        <button
          onClick={() => setMobileOpen(false)}
          data-testid={`sidebar-${tab.id}`}
          className={cn(
            "relative w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13.5px] transition-all duration-150",
            isCompact && "justify-center px-0",
            isActive
              ? "font-medium"
              : "font-normal text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-800 dark:hover:text-slate-200"
          )}
          style={isActive ? { background: ACTIVE_BG, color: ACTIVE_TEXT } : undefined}
        >
          {/* Active left accent bar */}
          {isActive && (
            <span
              className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
              style={{ background: ACTIVE_BORDER }}
            />
          )}

          {/* Icon badge */}
          <IconBadge icon={tab.icon} color={isActive ? ACTIVE_BORDER : tab.iconColor} />

          {!isCompact && (
            <span className="truncate leading-tight">{tab.label}</span>
          )}
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
          className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-md border border-slate-200"
          onClick={() => setMobileOpen(v => !v)}
        >
          {mobileOpen ? <X className="w-5 h-5 text-slate-600" /> : <Menu className="w-5 h-5 text-slate-600" />}
        </button>

        {/* Mobile overlay */}
        {mobileOpen && (
          <div className="lg:hidden fixed inset-0 bg-black/30 z-40" onClick={() => setMobileOpen(false)} />
        )}

        {/* Re-expand tab when fully collapsed */}
        {isCollapsed && !isFocusMode && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="hidden lg:flex fixed top-1/2 -translate-y-1/2 left-0 z-50 items-center justify-center text-white transition-colors duration-150"
                style={{
                  width: 28, height: 48,
                  background: "#3b82f6",
                  borderRadius: "0 8px 8px 0",
                  boxShadow: "2px 0 12px rgba(59,130,246,0.35)",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#2563eb")}
                onMouseLeave={e => (e.currentTarget.style.background = "#3b82f6")}
                onClick={toggleCollapsed}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">Expandir menu</TooltipContent>
          </Tooltip>
        )}

        {/* ── Sidebar ── */}
        <aside className={cn(
          "fixed left-0 top-0 h-full z-40 flex flex-col transition-all duration-300 ease-in-out",
          "bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800",
          isCompact ? "w-14" : "w-[220px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          (isCollapsed || isFocusMode) && "lg:-translate-x-full"
        )}>

          {/* ── Logo area ── */}
          <div className={cn(
            "shrink-0 flex items-center border-b border-slate-100 dark:border-slate-800",
            isCompact ? "h-14 justify-center px-3" : "h-14 px-4 justify-between"
          )}>
            {/* "N" wordmark */}
            <div
              className="select-none leading-none"
              style={{
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontWeight: 700,
                fontSize: isCompact ? 26 : 28,
                color: "#0f172a",
                letterSpacing: "-0.02em",
              }}
            >
              N
            </div>

            {/* Collapse chevron */}
            {!isCompact && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="hidden lg:flex w-7 h-7 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors shrink-0"
                    onClick={toggleCollapsed}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">Recolher menu</TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* ── Nav ── */}
          <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2.5">
            {menuGroups.map((group, idx) => {
              const groupTabs = getGroupTabs(group.items);
              if (groupTabs.length === 0) return null;

              return (
                <div key={group.title} className={cn(idx > 0 && "mt-5")}>
                  {!isCompact ? (
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] px-2 mb-1.5 text-slate-400 dark:text-slate-500 select-none">
                      {group.title}
                    </p>
                  ) : (
                    idx > 0 && <div className="border-t border-slate-100 dark:border-slate-800 mx-1 mb-2.5" />
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
          <div className="border-t border-slate-100 dark:border-slate-800 px-3 py-3 shrink-0">
            {/* User row */}
            <div className={cn("flex items-center gap-2.5 mb-3", isCompact && "justify-center")}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[13px] font-bold shrink-0 bg-gradient-to-br from-violet-500 to-indigo-600 shadow-sm select-none">
                {initials(userName)}
              </div>
              {!isCompact && (
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 truncate leading-tight">{user?.name}</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate leading-tight">{user?.email}</p>
                </div>
              )}
            </div>

            {/* Action icons row */}
            <div className={cn("flex items-center", isCompact ? "flex-col gap-1.5 items-center" : "justify-between")}>
              {/* Left icons */}
              <div className="flex items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={toggleCompact}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      {isCompact ? <Maximize className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
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
                      className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side={isCompact ? "right" : "top"} className="text-xs">Modo foco</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={toggleTheme}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      {theme === "light" ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side={isCompact ? "right" : "top"} className="text-xs">
                    {theme === "light" ? "Tema escuro" : "Tema claro"}
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* Logout — right side */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={logout}
                    className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side={isCompact ? "right" : "top"} className="text-xs">Sair</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </aside>
      </>
    </TooltipProvider>
  );
}
