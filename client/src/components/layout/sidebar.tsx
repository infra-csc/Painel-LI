import { Link, useLocation } from "wouter";
import {
  UserPlus, Calendar, CalendarDays, Wrench, Users,
  Plane, Hotel, LogOut,
  Menu, X, ChevronLeft, ChevronRight,
  Sun, Moon, LayoutGrid, Minimize2,
  Calculator, BarChart3, TrendingUp, ShieldCheck, FileText, Settings,
  Search, Wallet, BedDouble
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

// ─── Brand tokens ─────────────────────────────────────────────────────────────
const ACTIVE_BG    = "#EFF6FF";
const ACTIVE_BLUE  = "#1D4ED8";
const LABEL_CLR    = "#94A3B8";
const TEXT_MAIN    = "#334155";
const TEXT_LABEL   = "#64748B";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Icon badge ───────────────────────────────────────────────────────────────
// Small rounded-square behind the icon — active = solid blue, inactive = item color
function IconBadge({
  icon: Icon, badgeColor, active,
}: {
  icon: React.ElementType; badgeColor: string; active: boolean;
}) {
  return (
    <span
      className="flex-shrink-0 inline-flex items-center justify-center rounded-[6px]"
      style={{
        width: 26,
        height: 26,
        background: active ? ACTIVE_BLUE : badgeColor,
        transition: "background 0.15s",
      }}
    >
      <Icon
        style={{ width: 14, height: 14, color: "#ffffff", strokeWidth: 1.5 }}
      />
    </span>
  );
}

// ─── Nav groups ───────────────────────────────────────────────────────────────
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

  // badge colors follow the reference image palette
  const allTabs = [
    // Cadastros
    { id: "user-registration", path: "/user-registration", label: "Cadastro de Usuários", icon: UserPlus,    badgeColor: "#3b82f6", permission: "canAccessScreen0"      as const },
    { id: "events",            path: "/events",            label: "Eventos",               icon: Calendar,    badgeColor: "#f97316", permission: "canAccessAdminUsers"    as const },
    { id: "calendar",          path: "/calendar",          label: "Calendário",            icon: CalendarDays,badgeColor: "#0ea5e9", permission: "canAccessCalendar"       as const },
    { id: "functions",         path: "/functions",         label: "Funções",               icon: Wrench,      badgeColor: "#fb923c", permission: "canAccessScreen0"        as const },
    { id: "collaborators",     path: "/collaborators",     label: "Colaboradores",         icon: Users,       badgeColor: "#64748b", permission: "canAccessCollaborators"  as const },
    // Operacional
    { id: "team-inclusion",    path: "/team-inclusion",    label: "Inclusão de Equipe",    icon: Users,       badgeColor: "#f97316", permission: "canAccessScreen1"        as const },
    { id: "scaling",           path: "/scaling",           label: "Escalação",             icon: BarChart3,   badgeColor: "#94a3b8", permission: "canAccessScreen2"        as const },
    { id: "tickets",           path: "/tickets",           label: "Compra de Passagem",    icon: Plane,       badgeColor: "#ef4444", permission: "canAccessScreen3"        as const },
    { id: "accommodations",    path: "/accommodations",    label: "Hospedagem",            icon: BedDouble,   badgeColor: "#0ea5e9", permission: "canAccessScreen3"        as const },
    // Financeiro
    { id: "budget-planned",    path: "/budget-planned",    label: "Planejado",             icon: Calculator,  badgeColor: "#f97316", permission: "canAccessScreen0"        as const },
    { id: "budget-actual",     path: "/budget-actual",     label: "Realizado",             icon: Wallet,      badgeColor: "#6366f1", permission: "canAccessScreen0"        as const },
    { id: "budget-comparison", path: "/budget-comparison", label: "Comparativo",           icon: TrendingUp,  badgeColor: "#f43f5e", permission: "canAccessScreen5"        as const },
    { id: "rh-control",        path: "/rh-control",        label: "Controle RH",           icon: ShieldCheck, badgeColor: "#8b5cf6", permission: "canAccessScreen5"        as const },
    { id: "invoices",          path: "/invoices",          label: "Notas Fiscais",         icon: FileText,    badgeColor: "#f97316", permission: "canAccessScreen0"        as const },
    { id: "system-settings",   path: "/system-settings",   label: "Valores Padrão",        icon: Settings,    badgeColor: "#94a3b8", permission: "canAccessAdminUsers"     as const },
    // Gestão
    { id: "consultation",      path: "/consultation",      label: "Consulta Geral",        icon: Search,      badgeColor: "#64748b", permission: "canAccessScreen6"        as const },
    { id: "admin-users",       path: "/admin-users",       label: "Usuários",              icon: Users,       badgeColor: "#64748b", permission: "canAccessAdminUsers"     as const },
  ];

  const tabs = allTabs.filter(tab => hasPermission(user, tab.permission));
  const getGroupTabs = (ids: string[]) => tabs.filter(t => ids.includes(t.id));
  const userName = user?.name || "Usuário";

  // ── Nav Item ─────────────────────────────────────────────────────────────
  function NavItem({ tab }: { tab: typeof tabs[0] }) {
    const isActive = location === tab.path;
    const [hovered, setHovered] = useState(false);

    const rowBg    = isActive ? ACTIVE_BG : hovered ? "#f8fafc" : undefined;
    const textClr  = isActive || hovered ? ACTIVE_BLUE : TEXT_MAIN;
    const fontW    = isActive ? 600 : 400;

    const btn = (
      <Link href={tab.path}>
        <button
          onClick={() => setMobileOpen(false)}
          data-testid={`sidebar-${tab.id}`}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className={cn(
            "relative w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13px] transition-colors duration-100 text-left",
            isCompact && "justify-center px-0"
          )}
          style={{ background: rowBg, color: textClr, fontWeight: fontW }}
        >
          {/* Active left 3px bar */}
          {isActive && (
            <span
              className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full"
              style={{ width: 3, height: 22, background: ACTIVE_BLUE }}
            />
          )}

          <IconBadge icon={tab.icon} badgeColor={tab.badgeColor} active={isActive} />

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

        {mobileOpen && (
          <div className="lg:hidden fixed inset-0 bg-black/30 z-40" onClick={() => setMobileOpen(false)} />
        )}

        {/* Re-expand strip */}
        {isCollapsed && !isFocusMode && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="hidden lg:flex fixed top-1/2 -translate-y-1/2 left-0 z-50 items-center justify-center text-white"
                style={{
                  width: 28, height: 48,
                  background: ACTIVE_BLUE,
                  borderRadius: "0 8px 8px 0",
                  boxShadow: "2px 0 10px rgba(29,78,216,0.25)",
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
            "fixed left-0 top-0 h-full z-40 flex flex-col bg-white dark:bg-slate-900 transition-all duration-300 ease-in-out",
            mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
            (isCollapsed || isFocusMode) && "lg:-translate-x-full"
          )}
          style={{ width: isCompact ? 56 : 260, borderRight: "1px solid #E2E8F0" }}
        >

          {/* ── Logo ── */}
          <div
            className="shrink-0 flex items-center justify-between px-4"
            style={{ height: 72, borderBottom: "1px solid #E2E8F0" }}
          >
            {isCompact ? (
              <div className="mx-auto w-9 h-9 rounded-xl flex items-center justify-center select-none" style={{ background: ACTIVE_BLUE }}>
                <span className="text-white font-bold text-base leading-none">N</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2.5 select-none">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: ACTIVE_BLUE }}>
                    <span className="text-white font-bold text-base leading-none">N</span>
                  </div>
                  <div className="leading-tight">
                    <p className="font-bold text-[14px] text-slate-900 dark:text-white">Norte</p>
                    <p className="text-[10px]" style={{ color: TEXT_LABEL }}>Marketing Digital</p>
                  </div>
                </div>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="hidden lg:flex w-7 h-7 items-center justify-center rounded-md transition-colors shrink-0"
                      style={{ background: "#f1f5f9", color: "#94a3b8" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#e2e8f0")}
                      onMouseLeave={e => (e.currentTarget.style.background = "#f1f5f9")}
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
          <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-3">
            {menuGroups.map((group, idx) => {
              const groupTabs = getGroupTabs(group.items);
              if (groupTabs.length === 0) return null;

              return (
                <div key={group.title} style={{ marginTop: idx > 0 ? 24 : 0 }}>
                  {!isCompact ? (
                    <p
                      className="px-2.5 select-none"
                      style={{
                        fontSize: 11, fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        color: LABEL_CLR,
                        marginBottom: 8,
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
          <div className="shrink-0 px-4 py-4" style={{ borderTop: "1px solid #E2E8F0" }}>

            {/* Profile block */}
            <div className={cn("flex items-center gap-3 mb-3", isCompact && "justify-center")}>
              <div
                className="flex-shrink-0 inline-flex items-center justify-center rounded-full text-white font-bold select-none"
                style={{
                  width: 36, height: 36, fontSize: 12,
                  background: "linear-gradient(135deg, #7c3aed, #4338ca)",
                }}
              >
                {initials(userName)}
              </div>
              {!isCompact && (
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold truncate leading-tight" style={{ color: "#0f172a" }}>
                    {user?.name}
                  </p>
                  <p className="text-[11px] truncate leading-tight" style={{ color: TEXT_LABEL }}>
                    {user?.email}
                  </p>
                </div>
              )}
            </div>

            {/* Action icons */}
            <div className={cn("flex items-center", isCompact ? "justify-center gap-1 flex-col" : "justify-between")}>
              <div className="flex items-center gap-0.5">
                <FooterBtn icon={Minimize2}   label="Compactar"                      onClick={toggleCompact}  compact={isCompact} />
                <FooterBtn icon={LayoutGrid}  label="Modo foco"                      onClick={enterFocusMode} compact={isCompact} />
                <FooterBtn
                  icon={theme === "light" ? Moon : Sun}
                  label={theme === "light" ? "Tema escuro" : "Tema claro"}
                  onClick={toggleTheme}
                  compact={isCompact}
                />
              </div>
              <FooterBtn icon={LogOut} label="Sair" onClick={logout} danger compact={isCompact} />
            </div>
          </div>

        </aside>
      </>
    </TooltipProvider>
  );
}

// ─── Footer icon button ───────────────────────────────────────────────────────
function FooterBtn({
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
            color:      hovered ? (danger ? "#ef4444" : "#334155") : "#94a3b8",
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
