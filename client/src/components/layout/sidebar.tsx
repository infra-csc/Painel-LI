import { Link, useLocation } from "wouter";
import {
  UserPlus, Calendar, CalendarDays, Wrench, Users,
  Plane, Hotel, LogOut,
  Menu, X, ChevronLeft, ChevronRight,
  Sun, Moon, LayoutGrid, Minimize2,
  Calculator, BarChart3, TrendingUp, ShieldCheck, FileText, Settings2,
  Search, Settings, Wallet
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
const ACTIVE_BG     = "#EFF6FF";
const ACTIVE_COLOR  = "#1D4ED8";
const ACTIVE_BAR    = "#1D4ED8";
const INACTIVE_ICON = "#64748B";
const INACTIVE_TEXT = "#334155";
const LABEL_COLOR   = "#94a3b8";
const HOVER_BG      = "#EFF6FF";
const HOVER_TEXT    = "#1D4ED8";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Menu groups ──────────────────────────────────────────────────────────────
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
    // Cadastros — icons from prompt
    { id: "user-registration", path: "/user-registration", label: "Cadastro de Usuários", icon: UserPlus,    permission: "canAccessScreen0"      as const },
    { id: "events",            path: "/events",            label: "Eventos",               icon: Calendar,    permission: "canAccessAdminUsers"    as const },
    { id: "calendar",          path: "/calendar",          label: "Calendário",            icon: CalendarDays,permission: "canAccessCalendar"       as const },
    { id: "functions",         path: "/functions",         label: "Funções",               icon: Wrench,      permission: "canAccessScreen0"        as const },
    { id: "collaborators",     path: "/collaborators",     label: "Colaboradores",         icon: Users,       permission: "canAccessCollaborators"  as const },
    // Operacional
    { id: "team-inclusion",    path: "/team-inclusion",    label: "Inclusão de Equipe",    icon: Users,       permission: "canAccessScreen1"        as const },
    { id: "scaling",           path: "/scaling",           label: "Escalação",             icon: BarChart3,   permission: "canAccessScreen2"        as const },
    { id: "tickets",           path: "/tickets",           label: "Compra de Passagem",    icon: Plane,       permission: "canAccessScreen3"        as const },
    { id: "accommodations",    path: "/accommodations",    label: "Hospedagem",            icon: Hotel,       permission: "canAccessScreen3"        as const },
    // Financeiro
    { id: "budget-planned",    path: "/budget-planned",    label: "Planejado",             icon: Calculator,  permission: "canAccessScreen0"        as const },
    { id: "budget-actual",     path: "/budget-actual",     label: "Realizado",             icon: Wallet,      permission: "canAccessScreen0"        as const },
    { id: "budget-comparison", path: "/budget-comparison", label: "Comparativo",           icon: TrendingUp,  permission: "canAccessScreen5"        as const },
    { id: "rh-control",        path: "/rh-control",        label: "Controle RH",           icon: ShieldCheck, permission: "canAccessScreen5"        as const },
    { id: "invoices",          path: "/invoices",          label: "Notas Fiscais",         icon: FileText,    permission: "canAccessScreen0"        as const },
    { id: "approval",          path: "/approval",          label: "Aprovação",             icon: ShieldCheck, permission: "canAccessScreen5"        as const },
    // Gestão
    { id: "consultation",      path: "/consultation",      label: "Consulta Geral",        icon: Search,      permission: "canAccessScreen6"        as const },
    { id: "admin-users",       path: "/admin-users",       label: "Usuários",              icon: Users,       permission: "canAccessAdminUsers"     as const },
    { id: "system-settings",   path: "/system-settings",   label: "Valores Padrão",        icon: Settings2,   permission: "canAccessAdminUsers"     as const },
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
    const [hovered, setHovered] = useState(false);
    const Icon = tab.icon;

    const active = isActive || (!isActive && hovered);
    const bg = isActive ? ACTIVE_BG : hovered ? HOVER_BG : undefined;
    const textColor = isActive ? ACTIVE_COLOR : hovered ? HOVER_TEXT : INACTIVE_TEXT;
    const iconColor = isActive ? ACTIVE_COLOR : hovered ? HOVER_TEXT : INACTIVE_ICON;

    const btn = (
      <Link href={tab.path}>
        <button
          onClick={() => setMobileOpen(false)}
          data-testid={`sidebar-${tab.id}`}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className={cn(
            "relative w-full flex items-center gap-2.5 px-3 py-[8px] rounded-lg text-[13px] transition-colors duration-100 text-left",
            isCompact && "justify-center px-0"
          )}
          style={{ background: bg, color: textColor }}
        >
          {/* Active 3px left bar */}
          {isActive && (
            <span
              className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full"
              style={{ width: 3, height: 22, background: ACTIVE_BAR }}
            />
          )}

          <Icon
            className="flex-shrink-0 transition-colors duration-100"
            style={{
              width: 16, height: 16,
              color: iconColor,
              strokeWidth: isActive ? 2 : 1.5,
            }}
          />

          {!isCompact && (
            <span className="truncate leading-tight" style={{ fontWeight: isActive ? 600 : 400 }}>
              {tab.label}
            </span>
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
                className="hidden lg:flex fixed top-1/2 -translate-y-1/2 left-0 z-50 items-center justify-center text-white"
                style={{
                  width: 28, height: 48,
                  background: ACTIVE_COLOR,
                  borderRadius: "0 8px 8px 0",
                  boxShadow: "2px 0 12px rgba(29,78,216,0.25)",
                }}
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
            "fixed left-0 top-0 h-full z-40 flex flex-col transition-all duration-300 ease-in-out bg-white dark:bg-slate-900",
            mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
            (isCollapsed || isFocusMode) && "lg:-translate-x-full"
          )}
          style={{
            width: isCompact ? 56 : 260,
            borderRight: "1px solid #E2E8F0",
          }}
        >

          {/* ── Logo / header ── */}
          <div
            className="shrink-0 flex items-center justify-between px-5"
            style={{ height: 64, borderBottom: "1px solid #E2E8F0" }}
          >
            {isCompact ? (
              <div
                className="flex items-center justify-center w-8 h-8 rounded-lg select-none mx-auto"
                style={{ background: ACTIVE_COLOR }}
              >
                <span className="text-white font-bold text-sm leading-none">N</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2.5 select-none">
                  <div
                    className="flex items-center justify-center w-8 h-8 rounded-lg"
                    style={{ background: ACTIVE_COLOR }}
                  >
                    <span className="text-white font-bold text-sm leading-none">N</span>
                  </div>
                  <span className="font-bold text-[15px] text-slate-900 dark:text-white tracking-tight">
                    Norte
                  </span>
                </div>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="hidden lg:flex w-7 h-7 items-center justify-center rounded-md transition-colors shrink-0 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                      onClick={toggleCollapsed}
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">Recolher</TooltipContent>
                </Tooltip>
              </>
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
                      className="px-3 mb-1.5 uppercase select-none"
                      style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: LABEL_COLOR }}
                    >
                      {group.title}
                    </p>
                  ) : (
                    idx > 0 && <div className="border-t border-slate-100 dark:border-slate-800 mx-2 mb-3" />
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

          {/* ── Footer / profile block ── */}
          <div style={{ borderTop: "1px solid #E2E8F0" }} className="shrink-0 px-4 py-4">
            {/* User info */}
            <div className={cn("flex items-center gap-3 mb-3", isCompact && "justify-center")}>
              <div
                className="flex-shrink-0 flex items-center justify-center rounded-full text-white font-bold select-none"
                style={{
                  width: 36, height: 36, fontSize: 12,
                  background: "linear-gradient(135deg, #6d28d9, #4338ca)",
                }}
              >
                {initials(userName)}
              </div>
              {!isCompact && (
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 truncate leading-tight">
                    {user?.name}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate leading-tight">
                    {user?.email}
                  </p>
                </div>
              )}
            </div>

            {/* Bottom action row */}
            <div className={cn("flex items-center", isCompact ? "justify-center gap-1" : "justify-between")}>
              {/* Left: utility icons */}
              <div className="flex items-center gap-0.5">
                <SidebarIconBtn icon={Minimize2} label="Compactar" onClick={toggleCompact} compact={isCompact} />
                <SidebarIconBtn icon={LayoutGrid} label="Modo foco" onClick={enterFocusMode} compact={isCompact} />
                <SidebarIconBtn
                  icon={theme === "light" ? Moon : Sun}
                  label={theme === "light" ? "Tema escuro" : "Tema claro"}
                  onClick={toggleTheme}
                  compact={isCompact}
                />
              </div>

              {/* Right: logout */}
              <SidebarIconBtn icon={LogOut} label="Sair" onClick={logout} danger compact={isCompact} />
            </div>
          </div>
        </aside>
      </>
    </TooltipProvider>
  );
}

// ─── Utility icon button ──────────────────────────────────────────────────────
function SidebarIconBtn({
  icon: Icon, label, onClick, danger, compact,
}: {
  icon: React.ElementType; label: string; onClick: () => void; danger?: boolean; compact?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
          style={{
            color: hovered ? (danger ? "#ef4444" : "#334155") : "#94a3b8",
            background: hovered ? (danger ? "#fef2f2" : "#f1f5f9") : undefined,
          }}
        >
          <Icon style={{ width: 15, height: 15, strokeWidth: 1.5 }} />
        </button>
      </TooltipTrigger>
      <TooltipContent side={compact ? "right" : "top"} className="text-xs">{label}</TooltipContent>
    </Tooltip>
  );
}
