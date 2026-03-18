import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";
import logoImg from "@assets/image_1773859034680.png";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/contexts/sidebar-context";
import { useTheme } from "@/contexts/theme-context";

// ─── Material Symbol icon component ──────────────────────────────────────────
function MI({ name, filled, className, style }: {
  name: string;
  filled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={cn("material-symbols-outlined select-none", className)}
      style={{
        fontSize: 20,
        fontVariationSettings: filled
          ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
          : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
        ...style,
      }}
    >
      {name}
    </span>
  );
}

// ─── Initials helper ──────────────────────────────────────────────────────────
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Nav items ────────────────────────────────────────────────────────────────
// iconColor: "orange" = #ff4d00, "blue" = #0025d2 at 70%
const ORANGE = "#ff4d00";
const ORANGE70 = "rgba(255,77,0,0.7)";
const BLUE70 = "rgba(0,37,210,0.7)";
const ACTIVE_BLUE = "#0025d2";

const allTabs = [
  // Cadastros
  { id: "user-registration", path: "/user-registration", label: "Cadastro de Usuários", icon: "person_add",           iconColor: ACTIVE_BLUE,  permission: "canAccessScreen0"     as const },
  { id: "events",            path: "/events",            label: "Eventos",               icon: "event",               iconColor: ORANGE,       permission: "canAccessAdminUsers"  as const },
  { id: "calendar",          path: "/calendar",          label: "Calendário",            icon: "calendar_month",      iconColor: BLUE70,       permission: "canAccessCalendar"    as const },
  { id: "functions",         path: "/functions",         label: "Funções",               icon: "work",                iconColor: ORANGE70,     permission: "canAccessScreen0"     as const },
  { id: "collaborators",     path: "/collaborators",     label: "Colaboradores",         icon: "badge",               iconColor: BLUE70,       permission: "canAccessCollaborators" as const },
  // Operacional
  { id: "team-inclusion",    path: "/team-inclusion",    label: "Inclusão de Equipe",    icon: "group_add",           iconColor: ORANGE70,     permission: "canAccessScreen1"     as const },
  { id: "scaling",           path: "/scaling",           label: "Escalação",             icon: "assignment_ind",      iconColor: BLUE70,       permission: "canAccessScreen2"     as const },
  { id: "tickets",           path: "/tickets",           label: "Compra de Passagem",    icon: "confirmation_number", iconColor: ORANGE70,     permission: "canAccessScreen3"     as const },
  { id: "accommodations",    path: "/accommodations",    label: "Hospedagem",            icon: "bed",                 iconColor: BLUE70,       permission: "canAccessScreen3"     as const },
  // Financeiro
  { id: "budget-planned",    path: "/budget-planned",    label: "Planejado",             icon: "pending_actions",     iconColor: ORANGE70,     permission: "canAccessScreen0"     as const },
  { id: "budget-actual",     path: "/budget-actual",     label: "Realizado",             icon: "account_balance_wallet", iconColor: BLUE70,   permission: "canAccessScreen0"     as const },
  { id: "budget-comparison", path: "/budget-comparison", label: "Comparativo",           icon: "query_stats",         iconColor: ORANGE70,     permission: "canAccessScreen5"     as const },
  { id: "rh-control",        path: "/rh-control",        label: "Controle RH",           icon: "groups",              iconColor: BLUE70,       permission: "canAccessScreen5"     as const },
  { id: "invoices",          path: "/invoices",          label: "Notas Fiscais",         icon: "receipt_long",        iconColor: ORANGE70,     permission: "canAccessScreen0"     as const },
  { id: "system-settings",   path: "/system-settings",   label: "Valores Padrão",        icon: "settings_suggest",    iconColor: BLUE70,       permission: "canAccessAdminUsers"  as const },
  // Gestão
  { id: "consultation",      path: "/consultation",      label: "Consulta Geral",        icon: "manage_search",       iconColor: BLUE70,       permission: "canAccessScreen6"     as const },
  { id: "admin-users",       path: "/admin-users",       label: "Usuários",              icon: "manage_accounts",     iconColor: BLUE70,       permission: "canAccessAdminUsers"  as const },
];

const menuGroups = [
  { title: "Cadastros",   ids: ["user-registration", "events", "calendar", "functions", "collaborators"] },
  { title: "Operacional", ids: ["team-inclusion", "scaling", "tickets", "accommodations"] },
  { title: "Financeiro",  ids: ["budget-planned", "budget-actual", "budget-comparison", "rh-control", "invoices", "system-settings"] },
  { title: "Gestão",      ids: ["consultation", "admin-users"] },
];

// ─── Sidebar ─────────────────────────────────────────────────────────────────
export default function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isCollapsed, isFocusMode, toggleCollapsed, toggleCompact, enterFocusMode } = useSidebar();
  const { theme, toggleTheme } = useTheme();

  const tabs = allTabs.filter(t => hasPermission(user, t.permission));
  const getGroup = (ids: string[]) => tabs.filter(t => ids.includes(t.id));
  const userName = user?.name || "Usuário";

  const sidebarHidden = (isCollapsed || isFocusMode);

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow border border-slate-200"
        onClick={() => setMobileOpen(v => !v)}
      >
        {mobileOpen
          ? <X className="w-5 h-5 text-slate-600" />
          : <Menu className="w-5 h-5 text-slate-600" />}
      </button>
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/30 z-40" onClick={() => setMobileOpen(false)} />
      )}

      {/* Re-open tab */}
      {sidebarHidden && (
        <button
          className="hidden lg:flex fixed top-1/2 -translate-y-1/2 left-0 z-50 items-center justify-center text-white rounded-r-lg"
          style={{ width: 28, height: 48, background: ACTIVE_BLUE }}
          onClick={toggleCollapsed}
        >
          <MI name="chevron_right" style={{ fontSize: 18, color: "#fff" }} />
        </button>
      )}

      {/* ── Aside ── */}
      <aside
        className={cn(
          "fixed left-0 top-0 h-screen flex flex-col shrink-0 z-40 transition-transform duration-300",
          "bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          sidebarHidden && "lg:-translate-x-full"
        )}
        style={{ width: 260 }}
      >

        {/* Logo row */}
        <div className="px-5 py-4 flex items-center justify-between shrink-0" style={{ borderBottom: "1px solid #F1F5F9" }}>
          <div className="flex items-center gap-3 min-w-0">
            <img src={logoImg} alt="Norte" className="h-9 w-9 object-contain shrink-0" />
            <div className="min-w-0">
              <p className="font-bold text-slate-900 dark:text-white text-[13px] leading-tight truncate">Norte</p>
              <p className="text-[10px] text-slate-400 leading-tight truncate">Sistema de Logística Interna</p>
            </div>
          </div>
          <button
            className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors hidden lg:flex"
            onClick={toggleCollapsed}
          >
            <MI name="chevron_left" style={{ fontSize: 18 }} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-4 py-2" style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          {menuGroups.map(group => {
            const items = getGroup(group.ids);
            if (!items.length) return null;
            return (
              <div key={group.title}>
                <p className="px-3 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
                  {group.title}
                </p>
                <div className="space-y-1">
                  {items.map(tab => {
                    const isActive = location === tab.path;
                    return (
                      <Link key={tab.id} href={tab.path}>
                        <div
                          role="button"
                          onClick={() => setMobileOpen(false)}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors cursor-pointer",
                            isActive
                              ? "font-semibold"
                              : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                          )}
                          style={isActive ? {
                            backgroundColor: "rgba(0,37,210,0.08)",
                            color: ACTIVE_BLUE,
                          } : undefined}
                        >
                          <MI
                            name={tab.icon}
                            filled={isActive}
                            style={{ color: isActive ? ACTIVE_BLUE : tab.iconColor }}
                          />
                          <span className="text-[14px]">{tab.label}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
          {/* Avatar + name + email */}
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0"
              style={{ background: ACTIVE_BLUE }}
            >
              {initials(userName)}
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">{user?.name}</span>
              <span className="text-[11px] text-slate-500 truncate">{user?.email}</span>
            </div>
          </div>

          {/* 4 action icons */}
          <div className="flex items-center justify-between mt-4 px-1">
            <div className="flex gap-4">
              <button
                className="text-slate-400 hover:text-[#0025d2] transition-colors"
                onClick={toggleCompact}
                title="Expandir"
              >
                <MI name="open_in_full" />
              </button>
              <button
                className="text-slate-400 hover:text-[#0025d2] transition-colors"
                onClick={enterFocusMode}
                title="Modo foco"
              >
                <MI name="grid_view" />
              </button>
              <button
                className="text-slate-400 hover:text-[#0025d2] transition-colors"
                onClick={toggleTheme}
                title={theme === "light" ? "Modo escuro" : "Modo claro"}
              >
                <MI name={theme === "light" ? "dark_mode" : "light_mode"} />
              </button>
            </div>
            <button
              className="text-slate-400 hover:text-red-500 transition-colors"
              onClick={logout}
              title="Sair"
            >
              <MI name="logout" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
