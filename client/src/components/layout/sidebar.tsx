import { Link, useLocation } from "wouter";
import { X } from "lucide-react";
import logoImg from "@assets/image_1776349526988.png";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { useState, useMemo, useEffect } from "react";
import { getSeenState } from "@/lib/seenSwaps";
import { cn } from "@/lib/utils";
import { useSidebar, SIDEBAR_W, SIDEBAR_COMPACT_W } from "@/contexts/sidebar-context";
import { useQuery } from "@tanstack/react-query";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

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
  { id: "user-registration", path: "/user-registration", label: "Cadastro de Usuários", icon: "person_add",              iconColor: BLUE,      iconBg: "#DBEAFE", permission: "canCreateUsers"         as const },
  { id: "events",            path: "/events",            label: "Eventos",               icon: "event",                   iconColor: ORANGE,    iconBg: "#FFE4D9", permission: "canAccessCadastros"     as const },
  { id: "calendar",          path: "/calendar",          label: "Calendário",            icon: "calendar_month",          iconColor: BLUE70,    iconBg: "#EEF2FF", permission: "canAccessCalendar"      as const },
  { id: "functions",         path: "/functions",         label: "Funções",               icon: "work",                    iconColor: ORANGE70,  iconBg: "#FFE8DF", permission: "canAccessCadastros"     as const },
  { id: "collaborators",     path: "/collaborators",     label: "Colaboradores",         icon: "badge",                   iconColor: BLUE70,    iconBg: "#EEF2FF", permission: "canAccessCollaborators" as const },
  { id: "team-inclusion",    path: "/team-inclusion",    label: "Inclusão de Equipe",    icon: "group_add",               iconColor: ORANGE70,  iconBg: "#FFE8DF", permission: "canAccessScreen1"       as const },
  { id: "scaling",           path: "/scaling",           label: "Escalação",             icon: "assignment_ind",          iconColor: BLUE70,    iconBg: "#EEF2FF", permission: "canAccessScreen2"       as const },
  { id: "tickets",           path: "/tickets",           label: "Passagens",           icon: "confirmation_number",     iconColor: ORANGE70,  iconBg: "#FFE8DF", permission: "canAccessScreen3"       as const },
  { id: "accommodations",    path: "/accommodations",    label: "Hospedagem",            icon: "bed",                     iconColor: BLUE70,    iconBg: "#EEF2FF", permission: "canAccessScreen3"       as const },
  { id: "operational-mirror", path: "/operational-mirror", label: "Espelho Operacional",  icon: "table_view",              iconColor: ORANGE70,  iconBg: "#FFE8DF", permission: "canAccessScreen3"       as const },
  { id: "baggage-control",   path: "/baggage-control",   label: "Controle de Bagagem",   icon: "luggage",                 iconColor: BLUE70,    iconBg: "#EEF2FF", permission: "canAccessBaggage"       as const },
  { id: "budget-planned",    path: "/budget-planned",    label: "Planejado",             icon: "pending_actions",         iconColor: ORANGE70,  iconBg: "#FFE8DF", permission: "canAccessFinanceiro"    as const },
  { id: "budget-actual",     path: "/budget-actual",     label: "Realizado",             icon: "account_balance_wallet",  iconColor: BLUE70,    iconBg: "#EEF2FF", permission: "canAccessFinanceiro"    as const },
  { id: "budget-comparison", path: "/budget-comparison", label: "Comparativo",           icon: "query_stats",             iconColor: ORANGE70,  iconBg: "#FFE8DF", permission: "canAccessScreen5"       as const },
  { id: "rh-control",        path: "/rh-control",        label: "Controle RH",           icon: "groups",                  iconColor: BLUE70,    iconBg: "#EEF2FF", permission: "canAccessScreen5"       as const },
  { id: "invoices",          path: "/invoices",          label: "Notas Fiscais",         icon: "receipt_long",            iconColor: ORANGE70,  iconBg: "#FFE8DF", permission: "canAccessFinanceiro"    as const },
  { id: "flash-account",     path: "/flash-account",     label: "Conta Corrente Flash",  icon: "savings",                 iconColor: BLUE70,    iconBg: "#EEF2FF", permission: "canAccessFinanceiro"    as const },
  { id: "calculation-rules", path: "/calculation-rules", label: "Regras de Cálculo",     icon: "calculate",               iconColor: ORANGE70,  iconBg: "#FFE8DF", permission: "canAccessFinanceiro"    as const },
  { id: "system-settings",   path: "/system-settings",   label: "Valores Padrão",        icon: "settings_suggest",        iconColor: BLUE70,    iconBg: "#EEF2FF", permission: "canAccessFinanceiro"    as const },
  { id: "consultation",      path: "/consultation",      label: "Consulta Geral",        icon: "manage_search",           iconColor: BLUE70,    iconBg: "#EEF2FF", permission: "canAccessScreen6"       as const },
  { id: "admin-users",       path: "/admin-users",       label: "Usuários",              icon: "manage_accounts",         iconColor: BLUE70,    iconBg: "#EEF2FF", permission: "canAccessAdminUsers"    as const },
];

const menuGroups = [
  { title: "Cadastros",   ids: ["user-registration", "events", "calendar", "functions", "collaborators"] },
  { title: "Operacional", ids: ["team-inclusion", "scaling", "tickets", "accommodations", "operational-mirror", "baggage-control"] },
  { title: "Financeiro",  ids: ["budget-planned", "budget-actual", "budget-comparison", "rh-control", "invoices", "flash-account", "calculation-rules", "system-settings"] },
  { title: "Gestão",      ids: ["consultation", "admin-users"] },
];


/** Botão-ícone quadrado usado no rodapé (ações). */
function IconBtn({ icon, label, onClick, danger, className }: {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
  className?: string;
}) {
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          style={{
            width: 30, height: 30, borderRadius: 6, border: "none",
            background: "transparent", cursor: "pointer", color: "#94A3B8",
            transition: "all 0.15s",
          }}
          className={cn(
            "items-center justify-center",
            danger ? "hover:bg-red-50 hover:text-red-500" : "hover:bg-slate-100 hover:text-[#0033CC]",
            className ?? "flex",
          )}
        >
          <MI name={icon} style={{ fontSize: 17 }} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={6}>{label}</TooltipContent>
    </Tooltip>
  );
}

export default function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const {
    isCollapsed, isCompact, isFocusMode, isDesktop, isMobileOpen,
    toggleCollapsed, toggleCompact, enterFocusMode, exitFocusMode, setMobileOpen,
  } = useSidebar();

  const tabs = allTabs.filter(t => hasPermission(user, t.permission));
  const getGroup = (ids: string[]) => tabs.filter(t => ids.includes(t.id));
  const userName = user?.name || "Usuário";
  const sidebarHidden = isCollapsed || isFocusMode;
  // Compacto só em desktop: no mobile a gaveta abre sempre com os rótulos.
  const compact = isCompact && isDesktop;
  const asideWidth = compact ? SIDEBAR_COMPACT_W : SIDEBAR_W;

  const closeMobile = () => setMobileOpen(false);

  // Esc fecha a gaveta mobile.
  useEffect(() => {
    if (!isMobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMobileOpen, setMobileOpen]);

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

  // Mapa de teamInclusionId → status da inclusão (fallback; o status já vem embutido no swap)
  const inclusionStatusMap = useMemo(() => {
    const map: Record<string, string> = {};
    (teamInclusions ?? []).forEach(ti => { map[ti.id] = ti.status; });
    return map;
  }, [teamInclusions]);

  // Status da inclusão do swap: prioriza o status embutido na resposta da API
  // (/api/swap-requests já faz JOIN com team_inclusions). Cai para o mapa só se
  // o backend antigo não tiver enviado. Swaps de inclusões excluídas são ignorados.
  const getSwapInclusionStatus = (s: any): string | undefined => {
    if (s.inclusion_deleted_at || s.inclusionDeletedAt) return undefined;
    const embedded = s.inclusion_status || s.inclusionStatus;
    if (embedded) return embedded;
    const inclId = s.team_inclusion_id || s.teamInclusionId;
    return inclusionStatusMap[inclId];
  };

  // Passagens: swaps de inclusões com passagem comprada (com ou sem hospedagem)
  const ticketSwapCount = useMemo(() => {
    if (!isPurchasing || !swapRequests) return 0;
    const ticketStatuses = ['passagem_comprada', 'hospedagem_passagem_comprada'];
    return swapRequests.filter(s => {
      if (s.status !== 'pendente') return false;
      const st = getSwapInclusionStatus(s);
      return !!st && ticketStatuses.includes(st);
    }).length;
  }, [swapRequests, isPurchasing, inclusionStatusMap]);

  // Hospedagem: swaps de inclusões com hospedagem comprada SEM passagem
  const accommodationSwapCount = useMemo(() => {
    if (!isPurchasing || !swapRequests) return 0;
    return swapRequests.filter(s => {
      if (s.status !== 'pendente') return false;
      return getSwapInclusionStatus(s) === 'hospedagem_comprada';
    }).length;
  }, [swapRequests, isPurchasing, inclusionStatusMap]);

  // Para compras: trocas pendentes de escalações SEM passagem/hospedagem já comprada → badge na aba Escalação
  const scalingSwapCount = useMemo(() => {
    if (!isPurchasing || !swapRequests) return 0;
    const alreadyHandledStatuses = new Set(['passagem_comprada', 'hospedagem_passagem_comprada', 'hospedagem_comprada']);
    return swapRequests.filter(s => {
      if (s.status !== 'pendente') return false;
      const st = getSwapInclusionStatus(s);
      // Só conta quando a inclusão existe e ainda não teve logística tratada.
      // Sem este guard, status indefinido (inclusão excluída/não carregada) gera badge fantasma.
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
  // Compras vê trocas pendentes em Passagens/Hospedagem (some ao agir) + Escalação (sem logística)
  // Solicitante vê badge em Escalação (some ao visualizar)
  const tabBadgeCount: Record<string, number> = {
    tickets: ticketSwapCount,
    accommodations: accommodationSwapCount,
    scaling: isPurchasing ? scalingSwapCount : myScalingSwapsCount,
  };

  const renderBadge = (count: number, floating: boolean) => {
    if (count <= 0) return null;
    return (
      <span
        aria-label={`${count} pendente(s)`}
        style={{
          minWidth: floating ? 16 : 18, height: floating ? 16 : 18, borderRadius: 9,
          background: "#EF4444", color: "#fff",
          fontSize: floating ? 9 : 10, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "0 4px", flexShrink: 0, lineHeight: 1,
          ...(floating
            ? { position: "absolute" as const, top: 2, right: 6, boxShadow: "0 0 0 2px #F8FAFF" }
            : {}),
        }}
      >
        {count > 99 ? "99+" : count}
      </span>
    );
  };

  return (
    <>
      {/* Overlay da gaveta mobile */}
      {isMobileOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/30 z-40" onClick={closeMobile} aria-hidden="true" />
      )}

      {/* Aba para reabrir o menu (oculto ou modo foco) */}
      {sidebarHidden && (
        <button
          type="button"
          className="hidden lg:flex fixed top-1/2 -translate-y-1/2 left-0 z-50 items-center justify-center text-white rounded-r-lg"
          style={{ width: 24, height: 44, background: BLUE }}
          onClick={isFocusMode ? exitFocusMode : toggleCollapsed}
          aria-label={isFocusMode ? "Sair do modo foco" : "Mostrar menu"}
          title={isFocusMode ? "Sair do modo foco" : "Mostrar menu"}
        >
          <MI name="chevron_right" style={{ fontSize: 16, color: "#fff" }} />
        </button>
      )}

      {/* ── Aside ── */}
      <aside
        id="app-sidebar"
        aria-label="Menu principal"
        className={cn(
          "fixed left-0 top-0 h-dvh flex flex-col shrink-0 z-40 transition-[transform,width] duration-300",
          isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          sidebarHidden && "lg:-translate-x-full"
        )}
        style={{
          width: asideWidth,
          fontFamily: "'Inter', sans-serif",
          background: "rgba(248, 250, 255, 0.80)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          borderRight: "1px solid rgba(0, 51, 204, 0.09)",
          boxShadow: "4px 0 28px rgba(0, 51, 204, 0.05)",
        }}
      >

        {/* ── Logo ── */}
        <div style={{
          padding: compact ? "14px 0 12px" : "16px 16px 14px",
          display: "flex", alignItems: "center",
          justifyContent: compact ? "center" : "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, overflow: "hidden",
              background: "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <img src={logoImg} alt="Norte" style={{ width: 24, height: 24, objectFit: "contain" }} />
            </div>
            {!compact && (
              <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: BLUE, letterSpacing: "-0.01em" }}>Norte</span>
                <span style={{ fontSize: 10, color: "#94A3B8", fontWeight: 400 }}>Logística Interna</span>
              </div>
            )}
          </div>
          {!compact && (
            <>
              {/* Desktop: ocultar menu */}
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label="Ocultar menu"
                title="Ocultar menu"
                className="hidden lg:flex"
                style={{
                  width: 28, height: 28, borderRadius: 6, background: "#EEF2FF",
                  alignItems: "center", justifyContent: "center", border: "none",
                  cursor: "pointer", color: "#64748B", flexShrink: 0,
                }}
              >
                <MI name="chevron_left" style={{ fontSize: 16 }} />
              </button>
              {/* Mobile: fechar gaveta */}
              <button
                type="button"
                onClick={closeMobile}
                aria-label="Fechar menu"
                className="flex lg:hidden"
                style={{
                  width: 28, height: 28, borderRadius: 6, background: "#EEF2FF",
                  alignItems: "center", justifyContent: "center", border: "none",
                  cursor: "pointer", color: "#64748B", flexShrink: 0,
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* ── Nav ── */}
        <nav
          aria-label="Páginas"
          style={{
            flex: 1, overflowY: "auto", overflowX: "hidden",
            padding: compact ? "6px 6px" : "10px 10px",
            display: "flex", flexDirection: "column", gap: compact ? 10 : 20,
          }}
        >
          {menuGroups.map((group, gi) => {
            const items = getGroup(group.ids);
            if (!items.length) return null;
            return (
              <div key={group.title}>
                {/* Group label (compacto: só um divisor entre grupos) */}
                {compact ? (
                  gi > 0 && <div style={{ height: 1, background: "rgba(0,51,204,0.10)", margin: "0 8px 8px" }} aria-hidden="true" />
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, padding: "0 6px" }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: "#B0BACC", letterSpacing: "0.07em", textTransform: "uppercase" }}>
                      {group.title}
                    </span>
                  </div>
                )}

                {/* Items */}
                <div style={{ display: "flex", flexDirection: "column", gap: compact ? 2 : 1 }}>
                  {items.map(tab => {
                    const isActive = location === tab.path;
                    const count = tabBadgeCount[tab.id] ?? 0;
                    const item = (
                      <Link
                        key={tab.id}
                        href={tab.path}
                        onClick={closeMobile}
                        aria-current={isActive ? "page" : undefined}
                        aria-label={compact ? tab.label : undefined}
                        style={{
                          display: "flex", alignItems: "center", gap: 9,
                          justifyContent: compact ? "center" : "flex-start",
                          padding: compact ? "8px 0" : "7px 10px",
                          borderRadius: 8, cursor: "pointer",
                          transition: "all 0.18s cubic-bezier(0.4, 0, 0.2, 1)",
                          position: "relative",
                          background: isActive ? "#EEF2FF" : "transparent",
                          color: isActive ? BLUE : "#4B5563",
                          textDecoration: "none",
                        }}
                        className={cn(
                          "group outline-none focus-visible:ring-2 focus-visible:ring-[#0033CC]/40",
                          !isActive && !compact && "hover:bg-blue-50/60 hover:translate-x-[3px]",
                          !isActive && compact && "hover:bg-blue-50/60",
                          isActive && !compact && "hover:translate-x-[1px]",
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

                        {!compact && (
                          <span style={{
                            fontSize: 13,
                            fontWeight: isActive ? 600 : 400,
                            color: isActive ? BLUE : "#374151",
                            letterSpacing: isActive ? "-0.01em" : "normal",
                            flex: 1,
                          }}>
                            {tab.label}
                          </span>
                        )}

                        {/* Badge de trocas — contextual por tela */}
                        {renderBadge(count, compact)}
                      </Link>
                    );

                    if (!compact) return item;
                    return (
                      <Tooltip key={tab.id} delayDuration={200}>
                        <TooltipTrigger asChild>{item}</TooltipTrigger>
                        <TooltipContent side="right" sideOffset={8}>
                          {tab.label}{count > 0 ? ` · ${count > 99 ? "99+" : count} pendente(s)` : ""}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* ── Footer ── */}
        <div style={{ padding: compact ? "10px 6px" : "12px 10px", background: "#F5F7FF" }}>

          {/* User card */}
          {compact ? (
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <div
                  tabIndex={0}
                  aria-label={`${userName}${user?.email ? ` (${user.email})` : ""}`}
                  style={{
                    width: 32, height: 32, borderRadius: 8, background: BLUE,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "white", fontSize: 12, fontWeight: 700, margin: "0 auto 8px",
                  }}
                >
                  {initials(userName)}
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                <div className="font-semibold">{user?.name}</div>
                <div className="text-xs opacity-80">{user?.email}</div>
              </TooltipContent>
            </Tooltip>
          ) : (
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
          )}

          {/* Action row (compacto: coluna) */}
          <div style={{
            display: "flex",
            flexDirection: compact ? "column" : "row",
            alignItems: "center",
            justifyContent: compact ? "center" : "space-between",
            padding: compact ? 0 : "0 4px",
            gap: compact ? 2 : 0,
          }}>
            <div style={{ display: "flex", flexDirection: compact ? "column" : "row", gap: 2, alignItems: "center" }}>
              {/* Compacto/expandido e modo foco só fazem sentido em desktop */}
              <IconBtn
                icon={isCompact ? "left_panel_open" : "left_panel_close"}
                label={isCompact ? "Expandir menu" : "Modo compacto"}
                onClick={toggleCompact}
                className="hidden lg:flex"
              />
              <IconBtn icon="grid_view" label="Modo foco" onClick={enterFocusMode} className="hidden lg:flex" />
              {compact && (
                <IconBtn icon="chevron_left" label="Ocultar menu" onClick={toggleCollapsed} className="hidden lg:flex" />
              )}
            </div>
            <IconBtn icon="logout" label="Sair" onClick={logout} danger />
          </div>
        </div>
      </aside>
    </>
  );
}
