import { Link, useLocation } from "wouter";
import {
  Users, UserCheck, Plane, Hotel, CheckCircle, Search,
  UserPlus, Settings, Wrench, UserCog, Calendar, CalendarDays, LogOut,
  Menu, X, ChevronLeft, ChevronRight,
  Sun, Moon, LayoutGrid, Minimize2, Maximize2, Focus,
  Calculator, ClipboardCheck, BarChart3, Shield, FileText, TrendingUp
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

// ─── Brand colors ─────────────────────────────────────────────────────────────
const BRAND_BLUE   = "#0033CC";
const ACTIVE_BG    = "#EFF6FF";
const ACTIVE_TEXT  = "#0033CC";
const INACTIVE_TXT = "#334155";
const LABEL_TXT    = "#94a3b8";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Icon badge ───────────────────────────────────────────────────────────────
function IconBadge({
  icon: Icon, color, active,
}: {
  icon: React.ElementType; color: string; active?: boolean;
}) {
  return (
    <span
      className="flex-shrink-0 flex items-center justify-center rounded-[6px]"
      style={{
        width: 24, height: 24,
        background: active ? BRAND_BLUE : color,
        transition: "background 0.15s",
      }}
    >
      <Icon className="text-white" style={{ width: 13, height: 13 }} strokeWidth={2} />
    </span>
  );
}

// ─── Nav groups ───────────────────────────────────────────────────────────────
const menuGroups = [
  { title: "Cadastros",   items: ["user-registration", "events", "calendar", "functions", "collaborators"] },
  { title: "Operacional", items: ["team-inclusion", "scaling", "tickets", "accommodations"] },
  { title: "Financeiro",  items: ["budget-planned", "budget-actual", "budget-comparison", "rh-control", "invoices", "system-settings"] },
  { title: "Gestão",      items: ["approval", "consultation", "admin-users"] },
];

export default function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isCollapsed, isCompact, isFocusMode, toggleCollapsed, toggleCompact, enterFocusMode } = useSidebar();
  const { theme, toggleTheme } = useTheme();

  const allTabs = [
    // Cadastros
    { id: "user-registration", path: "/user-registration", label: "Cadastro de Usuários", icon: UserPlus,       color: "#3b82f6", permission: "canAccessScreen0"      as const },
    { id: "events",            path: "/events",            label: "Eventos",               icon: Calendar,       color: "#f97316", permission: "canAccessAdminUsers"    as const },
    { id: "calendar",          path: "/calendar",          label: "Calendário",            icon: CalendarDays,   color: "#0ea5e9", permission: "canAccessCalendar"       as const },
    { id: "functions",         path: "/functions",         label: "Funções",               icon: Wrench,         color: "#fb923c", permission: "canAccessScreen0"        as const },
    { id: "collaborators",     path: "/collaborators",     label: "Colaboradores",         icon: UserCog,        color: "#64748b", permission: "canAccessCollaborators"  as const },
    // Operacional
    { id: "team-inclusion",    path: "/team-inclusion",    label: "Inclusão de Equipe",    icon: Users,          color: "#f97316", permission: "canAccessScreen1"        as const },
    { id: "scaling",           path: "/scaling",           label: "Escalação",             icon: ClipboardCheck, color: "#94a3b8", permission: "canAccessScreen2"        as const },
    { id: "tickets",           path: "/tickets",           label: "Compra de Passagem",    icon: Plane,          color: "#ef4444", permission: "canAccessScreen3"        as const },
    { id: "accommodations",    path: "/accommodations",    label: "Hospedagem",            icon: Hotel,          color: "#0ea5e9", permission: "canAccessScreen3"        as const },
    // Financeiro
    { id: "budget-planned",    path: "/budget-planned",    label: "Planejado",             icon: BarChart3,      color: "#f97316", permission: "canAccessScreen0"        as const },
    { id: "budget-actual",     path: "/budget-actual",     label: "Realizado",             icon: Calculator,     color: "#6366f1", permission: "canAccessScreen0"        as const },
    { id: "budget-comparison", path: "/budget-comparison", label: "Comparativo",           icon: TrendingUp,     color: "#f43f5e", permission: "canAccessScreen5"        as const },
    { id: "rh-control",        path: "/rh-control",        label: "Controle RH",           icon: Shield,         color: "#8b5cf6", permission: "canAccessScreen5"        as const },
    { id: "invoices",          path: "/invoices",          label: "Notas Fiscais",         icon: FileText,       color: "#f97316", permission: "canAccessScreen0"        as const },
    { id: "approval",          path: "/approval",          label: "Aprovação",             icon: CheckCircle,    color: "#10b981", permission: "canAccessScreen5"        as const },
    { id: "consultation",      path: "/consultation",      label: "Consulta Geral",        icon: Search,         color: "#64748b", permission: "canAccessScreen6"        as const },
    { id: "admin-users",       path: "/admin-users",       label: "Usuários",              icon: Settings,       color: "#64748b", permission: "canAccessAdminUsers"     as const },
    { id: "system-settings",   path: "/system-settings",   label: "Valores Padrão",        icon: Settings,       color: "#94a3b8", permission: "canAccessAdminUsers"     as const },
  ];

  const tabs = allTabs.filter(tab =>
    hasPermission(user, tab.permission) &&
    tab.id !== "closure" &&
    tab.id !== "approval"
  );

  const getGroupTabs = (ids: string[]) => tabs.filter(t => ids.includes(t.id));
  const userName = user?.name || "Usuário";

  // ── Nav Item ─────────────────────────────────────────────────────────────
  function NavItem({ tab }: { tab: typeof tabs[0] }) {
    const isActive = location === tab.path;

    const btn = (
      <Link href={tab.path}>
        <button
          onClick={() => setMobileOpen(false)}
          data-testid={`sidebar-${tab.id}`}
          className={cn(
            "relative w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13px] transition-all duration-150 text-left",
            isCompact && "justify-center px-0",
          )}
          style={{
            background: isActive ? ACTIVE_BG : undefined,
            color: isActive ? ACTIVE_TEXT : INACTIVE_TXT,
            fontWeight: isActive ? 600 : 400,
          }}
          onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#f8fafc"; }}
          onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = ""; }}
        >
          {/* Active 3px left bar */}
          {isActive && (
            <span
              className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[22px] rounded-r-full"
              style={{ background: BRAND_BLUE }}
            />
          )}

          <IconBadge icon={tab.icon} color={tab.color} active={isActive} />

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

        {/* Re-expand button when collapsed */}
        {isCollapsed && !isFocusMode && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="hidden lg:flex fixed top-1/2 -translate-y-1/2 left-0 z-50 items-center justify-center text-white transition-colors duration-150"
                style={{
                  width: 28, height: 48,
                  background: BRAND_BLUE,
                  borderRadius: "0 8px 8px 0",
                  boxShadow: "2px 0 12px rgba(0,51,204,0.3)",
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = "0.9")}
                onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
                onClick={toggleCollapsed}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">Expandir menu</TooltipContent>
          </Tooltip>
        )}

        {/* ── Sidebar ── */}
        <aside
          className={cn(
            "fixed left-0 top-0 h-full z-40 flex flex-col transition-all duration-300 ease-in-out",
            "bg-white dark:bg-slate-900",
            mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
            (isCollapsed || isFocusMode) && "lg:-translate-x-full"
          )}
          style={{
            width: isCompact ? 56 : 260,
            borderRight: "1px solid #E2E8F0",
          }}
        >

          {/* ── Logo area ── */}
          <div
            className="shrink-0 flex items-center justify-between px-5"
            style={{ height: 64, borderBottom: "1px solid #E2E8F0" }}
          >
            {/* "N" branded mark */}
            {isCompact ? (
              <div
                className="flex items-center justify-center w-8 h-8 rounded-lg select-none"
                style={{ background: BRAND_BLUE }}
              >
                <span className="text-white font-bold text-base leading-none">N</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 select-none">
                <div
                  className="flex items-center justify-center w-8 h-8 rounded-lg"
                  style={{ background: BRAND_BLUE }}
                >
                  <span className="text-white font-bold text-base leading-none">N</span>
                </div>
                <span
                  className="font-bold text-[15px] tracking-tight"
                  style={{ color: "#0f172a" }}
                >
                  Norte
                </span>
              </div>
            )}

            {/* Collapse chevron */}
            {!isCompact && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="hidden lg:flex w-7 h-7 items-center justify-center rounded-md transition-colors shrink-0"
                    style={{ background: "#f1f5f9", color: "#64748b" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#e2e8f0"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "#f1f5f9"; }}
                    onClick={toggleCollapsed}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">Recolher</TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* ── Nav ── */}
          <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-3">
            {menuGroups.map((group, idx) => {
              const groupTabs = getGroupTabs(group.items);
              if (groupTabs.length === 0) return null;

              return (
                <div key={group.title} className={cn(idx > 0 && "mt-6")}>
                  {!isCompact ? (
                    <p
                      className="px-2.5 mb-2 select-none"
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        color: LABEL_TXT,
                      }}
                    >
                      {group.title}
                    </p>
                  ) : (
                    idx > 0 && <div className="border-t border-slate-100 dark:border-slate-800 mx-1 mb-3" />
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
          <div
            className="shrink-0 px-4 py-4"
            style={{ borderTop: "1px solid #E2E8F0" }}
          >
            {/* User block */}
            <div className={cn("flex items-center gap-3 mb-3", isCompact && "justify-center")}>
              <div
                className="flex-shrink-0 flex items-center justify-center rounded-full text-white text-[12px] font-bold select-none"
                style={{
                  width: 36, height: 36,
                  background: "linear-gradient(135deg, #6d28d9, #4f46e5)",
                }}
              >
                {initials(userName)}
              </div>
              {!isCompact && (
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold truncate" style={{ color: "#0f172a" }}>{user?.name}</p>
                  <p className="text-[11px] truncate" style={{ color: "#64748b" }}>{user?.email}</p>
                </div>
              )}
            </div>

            {/* Action row */}
            {isCompact ? (
              <div className="flex flex-col items-center gap-1">
                <ActionBtn icon={Minimize2} label="Compactar" onClick={toggleCompact} />
                <ActionBtn icon={Moon} label="Tema" onClick={toggleTheme} />
                <ActionBtn icon={LogOut} label="Sair" onClick={logout} danger />
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={toggleCompact}
                        className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
                        style={{ color: "#94a3b8" }}
                        onMouseEnter={e => { e.currentTarget.style.color = "#334155"; e.currentTarget.style.background = "#f1f5f9"; }}
                        onMouseLeave={e => { e.currentTarget.style.color = "#94a3b8"; e.currentTarget.style.background = ""; }}
                      >
                        <Minimize2 className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">Compactar</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={enterFocusMode}
                        className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
                        style={{ color: "#94a3b8" }}
                        onMouseEnter={e => { e.currentTarget.style.color = "#334155"; e.currentTarget.style.background = "#f1f5f9"; }}
                        onMouseLeave={e => { e.currentTarget.style.color = "#94a3b8"; e.currentTarget.style.background = ""; }}
                      >
                        <LayoutGrid className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">Modo foco</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={toggleTheme}
                        className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
                        style={{ color: "#94a3b8" }}
                        onMouseEnter={e => { e.currentTarget.style.color = "#334155"; e.currentTarget.style.background = "#f1f5f9"; }}
                        onMouseLeave={e => { e.currentTarget.style.color = "#94a3b8"; e.currentTarget.style.background = ""; }}
                      >
                        {theme === "light" ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {theme === "light" ? "Tema escuro" : "Tema claro"}
                    </TooltipContent>
                  </Tooltip>
                </div>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={logout}
                      className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
                      style={{ color: "#94a3b8" }}
                      onMouseEnter={e => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.background = "#fef2f2"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "#94a3b8"; e.currentTarget.style.background = ""; }}
                    >
                      <LogOut className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">Sair</TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>
        </aside>
      </>
    </TooltipProvider>
  );
}

// Small reusable icon button for compact footer
function ActionBtn({
  icon: Icon, label, onClick, danger,
}: {
  icon: React.ElementType; label: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className="w-8 h-8 flex items-center justify-center rounded-md transition-colors"
          style={{ color: "#94a3b8" }}
          onMouseEnter={e => {
            e.currentTarget.style.color = danger ? "#ef4444" : "#334155";
            e.currentTarget.style.background = danger ? "#fef2f2" : "#f1f5f9";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = "#94a3b8";
            e.currentTarget.style.background = "";
          }}
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">{label}</TooltipContent>
    </Tooltip>
  );
}
