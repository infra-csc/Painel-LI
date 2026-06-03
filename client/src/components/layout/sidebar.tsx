import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";
import logoImg from "@assets/image_1776349526988.png";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { useState, useMemo, useEffect } from "react";
import { getSeenState } from "@/lib/seenSwaps";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/contexts/sidebar-context";
import { useTheme } from "@/contexts/theme-context";
import { useQuery } from "@tanstack/react-query";

function MI({ name, filled, style }: {
  name: string;
  filled?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className="material-symbols-outlined select-none"
      style={{
        fontSize: 18,
        lineHeight: 1,
        fontVariationSettings: filled
          ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
          : "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24",
        ...style,
      }}
    >
      {name}
    </span>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const BLUE = "#0033CC";
const ORANGE = "#ff4d00";
const ORANGE70 = "#e04400";
const BLUE70 = "#1a4db5";

const allTabs = [
  { id: "user-registration", path: "/user-registration", label: "Cadastro de Usuários", icon: "person_add",              iconColor: BLUE,      iconBg: "#DBEAFE", permission: "canAccessCadastros"     as const },
  { id: "events",            path: "/events",            label: "Eventos",               icon: "event",                   iconColor: ORANGE,    iconBg: "#FFE4D9", permission: "canAccessCadastros"     as const },
  { id: "calendar",          path: "/calendar",          label: "Calendário",            icon: "calendar_month",          iconColor: BLUE70,    iconBg: "#EEF2FF", permission: "canAccessCalendar"      as const },
  { id: "functions",         path: "/functions",         label: "Funções",               icon: "work",                    iconColor: ORANGE70,  iconBg: "#FFE8DF", permission: "canAccessCadastros"     as const },
  { id: "collaborators",     path: "/collaborators",     label: "Colaboradores",         icon: "badge",                   iconColor: BLUE70,    iconBg: "#EEF2FF", permission: "canAccessCollaborators" as const },
  { id: "team-inclusion",    path: "/team-inclusion",    label: "Inclusão de Equipe",    icon: "group_add",               iconColor: ORANGE70,  iconBg: "#FFE8DF", permission: "canAccessScreen1"       as const },
  { id: "scaling",           path: "/scaling",           label: "Escalação",             icon: "assignment_ind",          iconColor: BLUE70,    iconBg: "#EEF2FF", permission: "canAccessScreen2"       as const },
  { id: "tickets",           path: "/tickets",           label: "Passagem",              icon: "confirmation_number",     iconColor: ORANGE70,  iconBg: "#FFE8DF", permission: "canAccessScreen3"       as const },
  { id: "accommodations",    path: "/accommodations",    label: "Hospedagem",            icon: "bed",                     iconColor: BLUE70,    iconBg: "#EEF2FF", permission: "canAccessScreen3"       as const },
  { id: "operational-mirror", path: "/operational-mirror", label: "Espelho Operacional",  icon: "table_view",              iconColor: ORANGE70,  iconBg: "#FFE8DF", permission: "canAccessScreen3"       as const },
  { id: "budget-planned",    path: "/budget-planned",    label: "Planejado",             icon: "pending_actions",         iconColor: ORANGE70,  iconBg: "#FFE8DF", permission: "canAccessFinanceiro"    as const },
  { id: "budget-actual",     path: "/budget-actual",     label: "Realizado",             icon: "account_balance_wallet",  iconColor: BLUE70,    iconBg: "#EEF2FF", permission: "canAccessFinanceiro"    as const },
  { id: "budget-comparison", path: "/budget-comparison", label: "Comparativo",           icon: "query_stats",             iconColor: ORANGE70,  iconBg: "#FFE8DF", permission: "canAccessScreen5"       as const },
  { id: "rh-control",        path: "/rh-control",        label: "Controle RH",           icon: "groups",                  iconColor: BLUE70,    iconBg: "#EEF2FF", permission: "canAccessScreen5"       as const },
  { id: "invoices",          path: "/invoices",          label: "Notas Fiscais",         icon: "receipt_long",            iconColor: ORANGE70,  iconBg: "#FFE8DF", permission: "canAccessFinanceiro"    as const },
  { id: "system-settings",   path: "/system-settings",   label: "Valores Padrão",        icon: "settings_suggest",        iconColor: BLUE70,    iconBg: "#EEF2FF", permission: "canAccessFinanceiro"    as const },
  { id: "consultation",      path: "/consultation",      label: "Consulta Geral",        icon: "manage_search",           iconColor: BLUE70,    iconBg: "#EEF2FF", permission: "canAccessScreen6"       as const },
  { id: "admin-users",       path: "/admin-users",       label: "Usuários",              icon: "manage_accounts",         iconColor: BLUE70,    iconBg: "#EEF2FF", permission: "canAccessAdminUsers"    as const },
];

const menuGroups = [
  { title: "Cadastros",   ids: ["user-registration", "events", "calendar", "functions", "collaborators"] },
  { title: "Operacional", ids: ["team-inclusion", "scaling", "tickets", "accommodations", "operational-mirror"] },
  { title: "Financeiro",  ids: ["budget-planned", "budget-actual", "budget-comparison", "rh-control", "invoices", "system-settings"] },
  { title: "Gestão",      ids: ["consultation", "admin-users"] },
];

export default function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isCollapsed, isFocusMode, toggleCollapsed, toggleCompact, enterFocusMode } = useSidebar();
  const { theme, toggleTheme } = useTheme();

  const tabs = allTabs.filter(t => hasPermission(user, t.permission));
  const getGroup = (ids: string[]) => tabs.filter(t => ids.includes(t.id));
  const userName = user?.name || "Usuário";
  const sidebarHidden = isCollapsed || isFocusMode;

  const isPurchasing = user?.role && ['admin', 'administrator', 'administrador', 'purchasing'].includes(user.role);

  const [seenState, setSeenState] = useState<Record<string, any>>(() =>
    user ? getSeenState(user.id) : {}
  );

  useEffect(() => {
    const handler = () => {
      if (user) setSeenState(getSeenState(user.id));
    };
    window.addEventListener('swapSeenUpdated', handler);
    return () => window.removeEventListener('swapSeenUpdated', handler);
  }, [user]);

  const { data: swapRequests } = useQuery<any[]>({
    queryKey: ["/api/swap-requests"],
    queryFn: async () => {
      const r = await fetch("/api/swap-requests");
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  const { data: teamInclusions } = useQuery<any[]>({
    queryKey: ["/api/team-inclusions"],
    enabled: !!isPurchasing,
  });

  // Mapa de teamInclusionId → status da inclusão
  const inclusionStatusMap = useMemo(() => {
    const map: Record<string, string> = {};
    (teamInclusions ?? []).forEach(ti => { map[ti.id] = ti.status; });
    return map;
  }, [teamInclusions]);

  // Passagem: swaps de inclusões com passagem comprada (com ou sem hospedagem)
  const ticketSwapCount = useMemo(() => {
    if (!isPurchasing || !swapRequests) return 0;
    const ticketStatuses = ['passagem_comprada', 'hospedagem_passagem_comprada'];
    return swapRequests.filter(s => {
      if (s.status !== 'pendente') return false;
      const inclId = (s as any).team_inclusion_id || s.teamInclusionId;
      return ticketStatuses.includes(inclusionStatusMap[inclId]);
    }).length;
  }, [swapRequests, isPurchasing, inclusionStatusMap]);

  // Hospedagem: swaps de inclusões com hospedagem comprada SEM passagem
  const accommodationSwapCount = useMemo(() => {
    if (!isPurchasing || !swapRequests) return 0;
    return swapRequests.filter(s => {
      if (s.status !== 'pendente') return false;
      const inclId = (s as any).team_inclusion_id || s.teamInclusionId;
      return inclusionStatusMap[inclId] === 'hospedagem_comprada';
    }).length;
  }, [swapRequests, isPurchasing, inclusionStatusMap]);

  // Para compras: trocas pendentes de escalações SEM passagem/hospedagem já comprada → badge na aba Escalação
  const scalingSwapCount = useMemo(() => {
    if (!isPurchasing || !swapRequests) return 0;
    const alreadyHandledStatuses = new Set(['passagem_comprada', 'hospedagem_passagem_comprada', 'hospedagem_comprada']);
    return swapRequests.filter(s => {
      if (s.status !== 'pendente') return false;
      const inclId = (s as any).team_inclusion_id || s.teamInclusionId;
      const st = inclusionStatusMap[inclId];
      // Só conta quando a inclusão já foi carregada e ainda não teve logística tratada.
      // Sem este guard, status indefinido (inclusão não carregada/inexistente) gera badge fantasma.
      return !!st && !alreadyHandledStatuses.has(st);
    }).length;
  }, [swapRequests, isPurchasing, inclusionStatusMap]);

  // Para quem solicitou (não-compras): badge em Escalação
  //   - troca pendente que ainda não foi visualizada
  //   - resposta (aprovada/rejeitada nas últimas 48h) que ainda não foi visualizada
  const myScalingSwapsCount = useMemo(() => {
    if (!swapRequests || !user || isPurchasing) return 0;
    let count = 0;
    swapRequests.forEach(s => {
      const requestedBy = (s as any).requested_by || s.requestedBy;
      if (requestedBy !== user.id) return;
      if (s.status === 'pendente' && !seenState[s.id]?.pendingSeen) {
        count++;
      } else if (['aprovado', 'rejeitado'].includes(s.status) && !seenState[s.id]?.respondedSeen) {
        const reviewedAt = (s as any).reviewed_at || s.reviewedAt;
        if (reviewedAt && (Date.now() - new Date(reviewedAt).getTime()) < 48 * 60 * 60 * 1000) count++;
      }
    });
    return count;
  }, [swapRequests, user, isPurchasing, seenState]);

  // Mapa tab id → badge count
  // Compras vê trocas pendentes em Passagem/Hospedagem (some ao agir) + Escalação (sem logística)
  // Solicitante vê badge em Escalação (some ao visualizar)
  const tabBadgeCount: Record<string, number> = {
    tickets: ticketSwapCount,
    accommodations: accommodationSwapCount,
    scaling: isPurchasing ? scalingSwapCount : myScalingSwapsCount,
  };

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow border border-slate-200"
        onClick={() => setMobileOpen(v => !v)}
      >
        {mobileOpen ? <X className="w-5 h-5 text-slate-600" /> : <Menu className="w-5 h-5 text-slate-600" />}
      </button>
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/30 z-40" onClick={() => setMobileOpen(false)} />
      )}

      {/* Re-open tab */}
      {sidebarHidden && (
        <button
          className="hidden lg:flex fixed top-1/2 -translate-y-1/2 left-0 z-50 items-center justify-center text-white rounded-r-lg"
          style={{ width: 24, height: 44, background: BLUE }}
          onClick={toggleCollapsed}
        >
          <MI name="chevron_right" style={{ fontSize: 16, color: "#fff" }} />
        </button>
      )}

      {/* ── Aside ── */}
      <aside
        className={cn(
          "fixed left-0 top-0 h-screen flex flex-col shrink-0 z-40 transition-transform duration-300",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          sidebarHidden && "lg:-translate-x-full"
        )}
        style={{
          width: 248,
          fontFamily: "'Inter', sans-serif",
          background: "rgba(248, 250, 255, 0.80)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          borderRight: "1px solid rgba(0, 51, 204, 0.09)",
          boxShadow: "4px 0 28px rgba(0, 51, 204, 0.05)",
        }}
      >

        {/* ── Logo ── */}
        <div style={{ padding: "16px 16px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, overflow: "hidden",
              background: "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <img src={logoImg} alt="Norte" style={{ width: 24, height: 24, objectFit: "contain" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: BLUE, letterSpacing: "-0.01em" }}>Norte</span>
              <span style={{ fontSize: 10, color: "#94A3B8", fontWeight: 400 }}>Logística Interna</span>
            </div>
          </div>
          <button
            onClick={toggleCollapsed}
            className="hidden lg:flex"
            style={{
              width: 28, height: 28, borderRadius: 6, background: "#EEF2FF",
              alignItems: "center", justifyContent: "center", border: "none",
              cursor: "pointer", color: "#64748B", flexShrink: 0,
            }}
          >
            <MI name="chevron_left" style={{ fontSize: 16 }} />
          </button>
        </div>

        {/* ── Nav ── */}
        <nav style={{ flex: 1, overflowY: "auto", padding: "10px 10px", display: "flex", flexDirection: "column", gap: 20 }}>
          {menuGroups.map(group => {
            const items = getGroup(group.ids);
            if (!items.length) return null;
            return (
              <div key={group.title}>
                {/* Group label */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, padding: "0 6px" }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#B0BACC", letterSpacing: "0.07em", textTransform: "uppercase" }}>
                    {group.title}
                  </span>
                </div>

                {/* Items */}
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {items.map(tab => {
                    const isActive = location === tab.path;
                    return (
                      <Link key={tab.id} href={tab.path}>
                        <div
                          role="button"
                          onClick={() => setMobileOpen(false)}
                          style={{
                            display: "flex", alignItems: "center", gap: 9,
                            padding: "7px 10px", borderRadius: 8, cursor: "pointer",
                            transition: "all 0.18s cubic-bezier(0.4, 0, 0.2, 1)",
                            position: "relative",
                            background: isActive ? "#EEF2FF" : "transparent",
                            color: isActive ? BLUE : "#4B5563",
                          }}
                          className={cn(
                            "group",
                            !isActive && "hover:bg-blue-50/60 hover:translate-x-[3px]",
                            isActive && "hover:translate-x-[1px]",
                          )}
                        >
                          {/* Active left bar */}
                          {isActive && (
                            <span style={{
                              position: "absolute", left: 0, top: "20%", bottom: "20%",
                              width: 3, borderRadius: "0 3px 3px 0", background: BLUE,
                            }} />
                          )}

                          {/* Icon */}
                          <span
                            className="transition-transform duration-[180ms] group-hover:scale-110"
                            style={{
                              width: 24, height: 24, flexShrink: 0,
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                            <MI
                              name={tab.icon}
                              filled={true}
                              style={{ color: isActive ? BLUE : tab.iconColor, fontSize: 18 }}
                            />
                          </span>

                          <span style={{
                            fontSize: 13,
                            fontWeight: isActive ? 600 : 400,
                            color: isActive ? BLUE : "#374151",
                            letterSpacing: isActive ? "-0.01em" : "normal",
                            flex: 1,
                          }}>
                            {tab.label}
                          </span>

                          {/* Badge de trocas — contextual por tela */}
                          {(tabBadgeCount[tab.id] ?? 0) > 0 && (
                            <span style={{
                              minWidth: 18, height: 18, borderRadius: 9,
                              background: "#EF4444", color: "#fff",
                              fontSize: 10, fontWeight: 700,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              padding: "0 5px", flexShrink: 0,
                              lineHeight: 1,
                            }}>
                              {tabBadgeCount[tab.id] > 99 ? "99+" : tabBadgeCount[tab.id]}
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* ── Footer ── */}
        <div style={{ padding: "12px 10px", background: "#F5F7FF" }}>

          {/* User card */}
          <div style={{
            display: "flex", alignItems: "center", gap: 9,
            padding: "8px 10px", borderRadius: 8, marginBottom: 8,
            background: "white",
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, background: BLUE,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "white", fontSize: 12, fontWeight: 700, flexShrink: 0,
            }}>
              {initials(userName)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "#1E293B", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user?.name}
              </p>
              <p style={{ fontSize: 10, color: "#94A3B8", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user?.email}
              </p>
            </div>
          </div>

          {/* Action row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px" }}>
            <div style={{ display: "flex", gap: 2 }}>
              {[
                { icon: "open_in_full", action: toggleCompact,  title: "Expandir" },
                { icon: "grid_view",    action: enterFocusMode, title: "Modo foco" },
                { icon: theme === "light" ? "dark_mode" : "light_mode", action: toggleTheme, title: theme === "light" ? "Modo escuro" : "Modo claro" },
              ].map(btn => (
                <button
                  key={btn.icon}
                  onClick={btn.action}
                  title={btn.title}
                  style={{
                    width: 30, height: 30, borderRadius: 6, border: "none",
                    background: "transparent", cursor: "pointer", display: "flex",
                    alignItems: "center", justifyContent: "center", color: "#94A3B8",
                    transition: "all 0.15s",
                  }}
                  className="hover:bg-slate-100 hover:text-[#0033CC]"
                >
                  <MI name={btn.icon} style={{ fontSize: 17 }} />
                </button>
              ))}
            </div>
            <button
              onClick={logout}
              title="Sair"
              style={{
                width: 30, height: 30, borderRadius: 6, border: "none",
                background: "transparent", cursor: "pointer", display: "flex",
                alignItems: "center", justifyContent: "center", color: "#94A3B8",
                transition: "all 0.15s",
              }}
              className="hover:bg-red-50 hover:text-red-500"
            >
              <MI name="logout" style={{ fontSize: 17 }} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
