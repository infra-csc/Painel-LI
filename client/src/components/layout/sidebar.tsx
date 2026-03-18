import { Link, useLocation } from "wouter";
import {
  UserPlus, Calendar, CalendarDays, Wrench, Users,
  Plane, BedDouble, LogOut,
  Menu, X, ChevronLeft, ChevronRight,
  Sun, Moon, LayoutGrid, Minimize2,
  ClipboardCheck, BarChart3, TrendingUp, ShieldCheck, FileText, Settings,
  Search, Wallet, Clipboard, Maximize
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

// ─── Menu groups ──────────────────────────────────────────────────────────────
const menuGroups = [
  { title: "Cadastros",   items: ["user-registration", "events", "calendar", "functions", "collaborators"] },
  { title: "Operacional", items: ["team-inclusion", "scaling", "tickets", "accommodations"] },
  { title: "Financeiro",  items: ["budget-planned", "budget-actual", "budget-comparison", "rh-control", "invoices", "system-settings"] },
  { title: "Gestão",      items: ["consultation", "admin-users"] },
];

export default function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isCollapsed, isCompact, isFocusMode, toggleCollapsed, toggleCompact, enterFocusMode } = useSidebar();
  const { theme, toggleTheme } = useTheme();

  // icon color = color when inactive; when active all icons become #1E40AF
  const allTabs = [
    // Cadastros
    { id: "user-registration", path: "/user-registration", label: "Cadastro de Usuários", icon: UserPlus,       color: "#3b82f6", permission: "canAccessScreen0"      as const },
    { id: "events",            path: "/events",            label: "Eventos",               icon: Calendar,       color: "#F97316", permission: "canAccessAdminUsers"    as const },
    { id: "calendar",          path: "/calendar",          label: "Calendário",            icon: CalendarDays,   color: "#3B82F6", permission: "canAccessCalendar"       as const },
    { id: "functions",         path: "/functions",         label: "Funções",               icon: Wrench,         color: "#FB923C", permission: "canAccessScreen0"        as const },
    { id: "collaborators",     path: "/collaborators",     label: "Colaboradores",         icon: Users,          color: "#64748B", permission: "canAccessCollaborators"  as const },
    // Operacional
    { id: "team-inclusion",    path: "/team-inclusion",    label: "Inclusão de Equipe",    icon: UserPlus,       color: "#F97316", permission: "canAccessScreen1"        as const },
    { id: "scaling",           path: "/scaling",           label: "Escalação",             icon: Clipboard,      color: "#94A3B8", permission: "canAccessScreen2"        as const },
    { id: "tickets",           path: "/tickets",           label: "Compra de Passagem",    icon: Plane,          color: "#F97316", permission: "canAccessScreen3"        as const },
    { id: "accommodations",    path: "/accommodations",    label: "Hospedagem",            icon: BedDouble,      color: "#64748B", permission: "canAccessScreen3"        as const },
    // Financeiro
    { id: "budget-planned",    path: "/budget-planned",    label: "Planejado",             icon: LayoutGrid,     color: "#F97316", permission: "canAccessScreen0"        as const },
    { id: "budget-actual",     path: "/budget-actual",     label: "Realizado",             icon: ClipboardCheck, color: "#3b82f6", permission: "canAccessScreen0"        as const },
    { id: "budget-comparison", path: "/budget-comparison", label: "Comparativo",           icon: BarChart3,      color: "#F43F5E", permission: "canAccessScreen5"        as const },
    { id: "rh-control",        path: "/rh-control",        label: "Controle RH",           icon: ShieldCheck,    color: "#6366F1", permission: "canAccessScreen5"        as const },
    { id: "invoices",          path: "/invoices",          label: "Notas Fiscais",         icon: FileText,       color: "#F97316", permission: "canAccessScreen0"        as const },
    { id: "system-settings",   path: "/system-settings",   label: "Valores Padrão",        icon: Settings,       color: "#6B7280", permission: "canAccessAdminUsers"     as const },
    // Gestão
    { id: "consultation",      path: "/consultation",      label: "Consulta Geral",        icon: Search,         color: "#6B7280", permission: "canAccessScreen6"        as const },
    { id: "admin-users",       path: "/admin-users",       label: "Usuários",              icon: Users,          color: "#6B7280", permission: "canAccessAdminUsers"     as const },
  ];

  const tabs = allTabs.filter(tab => hasPermission(user, tab.permission));
  const getGroupTabs = (ids: string[]) => tabs.filter(t => ids.includes(t.id));
  const userName = user?.name || "Usuário";

  // ── Nav Item ─────────────────────────────────────────────────────────────
  function NavItem({ tab }: { tab: typeof tabs[0] }) {
    const isActive = location === tab.path;
    const Icon = tab.icon;

    const btn = (
      <Link href={tab.path}>
        <button
          onClick={() => setMobileOpen(false)}
          data-testid={`sidebar-${tab.id}`}
          className={cn(
            "group relative w-full flex items-center gap-2.5 px-3 py-[6px] rounded-[6px] text-[13px] transition-colors duration-100 text-left",
            isCompact && "justify-center px-0 py-2",
            isActive
              ? "bg-[#EEF2FF]"
              : "hover:bg-slate-50"
          )}
        >
          {/* Active 3px left bar */}
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[#1E40AF]" />
          )}

          {/* Filled icon badge */}
          <span
            className="flex-shrink-0 inline-flex items-center justify-center rounded-[5px]"
            style={{
              width: 22,
              height: 22,
              background: isActive ? "#1E40AF" : tab.color,
            }}
          >
            <Icon
              style={{
                width: 13,
                height: 13,
                color: "#ffffff",
                strokeWidth: 1.75,
              }}
            />
          </span>

          {!isCompact && (
            <span
              className="truncate leading-tight"
              style={{
                color: isActive ? "#1E40AF" : "#374151",
                fontWeight: isActive ? 600 : 400,
              }}
            >
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

        {mobileOpen && (
          <div className="lg:hidden fixed inset-0 bg-black/30 z-40" onClick={() => setMobileOpen(false)} />
        )}

        {/* Re-expand tab when collapsed */}
        {isCollapsed && !isFocusMode && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="hidden lg:flex fixed top-1/2 -translate-y-1/2 left-0 z-50 items-center justify-center text-white"
                style={{
                  width: 28, height: 48,
                  background: "#1E40AF",
                  borderRadius: "0 8px 8px 0",
                  boxShadow: "2px 0 10px rgba(30,64,175,0.2)",
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
            "fixed left-0 top-0 h-screen z-40 flex flex-col bg-white dark:bg-slate-900 transition-all duration-300 ease-in-out",
            mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
            (isCollapsed || isFocusMode) && "lg:-translate-x-full"
          )}
          style={{ width: isCompact ? 56 : 260, borderRight: "1px solid #E2E8F0" }}
        >

          {/* ── Logo ── */}
          <div
            className="shrink-0 flex items-center justify-between px-5"
            style={{ height: 64, borderBottom: "1px solid #E2E8F0" }}
          >
            {/* Plain "N" letter — no background box */}
            <span
              className="select-none leading-none"
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "#1E3A8A",
                fontFamily: "Inter, system-ui, sans-serif",
                letterSpacing: "-0.03em",
              }}
            >
              N
            </span>

            {!isCompact && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="hidden lg:flex w-6 h-6 items-center justify-center rounded-md transition-colors text-slate-400 hover:text-slate-600 hover:bg-slate-100"
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
          <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-3">
            {menuGroups.map((group, idx) => {
              const groupTabs = getGroupTabs(group.items);
              if (groupTabs.length === 0) return null;

              return (
                <div key={group.title} style={{ marginTop: idx > 0 ? 20 : 0 }}>
                  {!isCompact && (
                    <p
                      className="px-3 mb-1.5 select-none uppercase"
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        color: "#9CA3AF",
                      }}
                    >
                      {group.title}
                    </p>
                  )}
                  {isCompact && idx > 0 && (
                    <div className="border-t border-slate-100 dark:border-slate-800 mx-2 mb-3" />
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
          <div className="shrink-0">
            {/* hr separator */}
            <div style={{ borderTop: "1px solid #E5E7EB" }} />

            <div className="px-4 py-3">
              {/* User row: avatar + name/email */}
              <div className={cn("flex items-center gap-3 mb-3", isCompact && "justify-center")}>
                <div
                  className="flex-shrink-0 inline-flex items-center justify-center rounded-full text-white font-bold select-none"
                  style={{
                    width: 36, height: 36, fontSize: 12,
                    background: "#7C3AED",
                  }}
                >
                  {initials(userName)}
                </div>
                {!isCompact && (
                  <div className="min-w-0 flex-1">
                    <p className="truncate leading-tight font-semibold" style={{ fontSize: 13, color: "#111827" }}>
                      {user?.name}
                    </p>
                    <p className="truncate leading-tight" style={{ fontSize: 11, color: "#6B7280" }}>
                      {user?.email}
                    </p>
                  </div>
                )}
              </div>

              {/* 4 icons row */}
              <div className={cn(
                "flex items-center",
                isCompact ? "flex-col gap-1 items-center" : "justify-between px-0.5"
              )}>
                <FooterIcon icon={Maximize}  label="Tela cheia"   onClick={toggleCompact}  compact={isCompact} />
                <FooterIcon icon={LayoutGrid} label="Modo foco"   onClick={enterFocusMode} compact={isCompact} />
                <FooterIcon
                  icon={theme === "light" ? Moon : Sun}
                  label={theme === "light" ? "Modo escuro" : "Modo claro"}
                  onClick={toggleTheme}
                  compact={isCompact}
                />
                <FooterIcon icon={LogOut}    label="Sair"         onClick={logout}         compact={isCompact} danger />
              </div>
            </div>
          </div>
        </aside>
      </>
    </TooltipProvider>
  );
}

// ─── Footer icon button ───────────────────────────────────────────────────────
function FooterIcon({
  icon: Icon, label, onClick, danger, compact,
}: {
  icon: React.ElementType; label: string; onClick: () => void; danger?: boolean; compact?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          onMouseEnter={() => setHov(true)}
          onMouseLeave={() => setHov(false)}
          className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
          style={{
            color:      hov ? (danger ? "#EF4444" : "#374151") : "#9CA3AF",
            background: hov ? (danger ? "#FEF2F2" : "#F3F4F6") : undefined,
          }}
        >
          <Icon style={{ width: 16, height: 16, strokeWidth: 1.5 }} />
        </button>
      </TooltipTrigger>
      <TooltipContent side={compact ? "right" : "top"} className="text-xs">{label}</TooltipContent>
    </Tooltip>
  );
}
