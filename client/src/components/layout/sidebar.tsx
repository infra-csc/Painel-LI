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

const allTabs = [
  { id: "user-registration", path: "/user-registration", label: "Cadastro de Usuários", icon: "person_add", permission: "canCreateUsers"         as const },
  { id: "events",            path: "/events",            label: "Eventos",               icon: "event", permission: "canAccessCadastros"     as const },
  { id: "calendar",          path: "/calendar",          label: "Calendário",            icon: "calendar_month", permission: "canAccessCalendar"      as const },
  { id: "functions",         path: "/functions",         label: "Funções",               icon: "work", permission: "canAccessCadastros"     as const },
  { id: "collaborators",     path: "/collaborators",     label: "Colaboradores",         icon: "badge", permission: "canAccessCollaborators" as const },
  { id: "team-inclusion",    path: "/team-inclusion",    label: "Inclusão de Equipe",    icon: "group_add", permission: "canAccessScreen1"       as const },
  { id: "scaling",           path: "/scaling",           label: "Escalação",             icon: "assignment_ind", permission: "canAccessScreen2"       as const },
  { id: "tickets",           path: "/tickets",           label: "Passagens",           icon: "confirmation_number", permission: "canAccessScreen3"       as const },
  { id: "accommodations",    path: "/accommodations",    label: "Hospedagem",            icon: "bed", permission: "canAccessScreen3"       as const },
  { id: "operational-mirror", path: "/operational-mirror", label: "Espelho Operacional",  icon: "table_view", permission: "canAccessScreen3"       as const },
  { id: "baggage-control",   path: "/baggage-control",   label: "Controle de Bagagem",   icon: "luggage", permission: "canAccessBaggage"       as const },
  { id: "budget-planned",    path: "/budget-planned",    label: "Planejado",             icon: "pending_actions", permission: "canAccessFinanceiro"    as const },
  { id: "budget-actual",     path: "/budget-actual",     label: "Realizado",             icon: "account_balance_wallet", permission: "canAccessFinanceiro"    as const },
  { id: "budget-comparison", path: "/budget-comparison", label: "Comparativo",           icon: "query_stats", permission: "canAccessScreen5"       as const },
  { id: "rh-control",        path: "/rh-control",        label: "Controle RH",           icon: "groups", permission: "canAccessScreen5"       as const },
  { id: "invoices",          path: "/invoices",          label: "Notas Fiscais",         icon: "receipt_long", permission: "canAccessFinanceiro"    as const },
  { id: "flash-account",     path: "/flash-account",     label: "Conta Corrente Flash",  icon: "savings", permission: "canAccessFinanceiro"    as const },
  { id: "calculation-rules", path: "/calculation-rules", label: "Regras de Cálculo",     icon: "calculate", permission: "canAccessFinanceiro"    as const },
  { id: "system-settings",   path: "/system-settings",   label: "Valores Padrão",        icon: "settings_suggest", permission: "canAccessFinanceiro"    as const },
  { id: "consultation",      path: "/consultation",      label: "Log de auditoria",        icon: "manage_search", permission: "canAccessScreen6"       as const },
  { id: "admin-users",       path: "/admin-users",       label: "Usuários",              icon: "manage_accounts", permission: "canAccessAdminUsers"    as const },
];

// Cor por GRUPO (semântica: ajuda a se localizar no menu). O item ativo usa
// sempre o azul de marca. Antes a cor alternava azul/laranja por linha, sem
// significado; a versão só-cinza ficou apagada — esta é o meio-termo.
const menuGroups = [
  { title: "Cadastros",   iconClass: "text-primary",     ids: ["user-registration", "events", "calendar", "functions", "collaborators"] },
  { title: "Operacional", iconClass: "text-orange-500",  ids: ["team-inclusion", "scaling", "tickets", "accommodations", "operational-mirror", "baggage-control"] },
  { title: "Financeiro",  iconClass: "text-emerald-600", ids: ["budget-planned", "budget-actual", "budget-comparison", "rh-control", "invoices", "flash-account", "calculation-rules", "system-settings"] },
  { title: "Gestão",      iconClass: "text-violet-600",  ids: ["consultation", "admin-users"] },
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
          className={cn(
            "items-center justify-center w-[30px] h-[30px] rounded-md border-0 bg-transparent cursor-pointer text-slate-400 transition-all duration-150",
            danger ? "hover:bg-red-50 hover:text-red-500" : "hover:bg-slate-100 hover:text-primary",
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
        className={cn(
          "flex items-center justify-center shrink-0 rounded-full bg-red-500 text-white font-bold leading-none px-1",
          floating ? "absolute top-0.5 right-1.5 min-w-[16px] h-4 text-[9px] ring-2 ring-background" : "min-w-[18px] h-[18px] text-[10px]",
        )}
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
          className="hidden lg:flex fixed top-1/2 -translate-y-1/2 left-0 z-50 items-center justify-center w-6 h-11 bg-primary text-primary-foreground rounded-r-lg"
          onClick={isFocusMode ? exitFocusMode : toggleCollapsed}
          aria-label={isFocusMode ? "Sair do modo foco" : "Mostrar menu"}
          title={isFocusMode ? "Sair do modo foco" : "Mostrar menu"}
        >
          <MI name="chevron_right" style={{ fontSize: 16 }} />
        </button>
      )}

      {/* ── Aside ── */}
      <aside
        id="app-sidebar"
        aria-label="Menu principal"
        className={cn(
          "fixed left-0 top-0 h-dvh flex flex-col shrink-0 z-40 transition-[transform,width] duration-300",
          "font-sans bg-background/80 backdrop-blur-[18px] border-r border-primary/10 shadow-[4px_0_28px_hsl(226_100%_40%/0.05)]",
          isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          sidebarHidden && "lg:-translate-x-full"
        )}
        style={{ width: asideWidth }}
      >

        {/* ── Logo ── */}
        <div className={cn("flex items-center", compact ? "justify-center pt-3.5 pb-3" : "justify-between px-4 pt-4 pb-3.5")}>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg overflow-hidden bg-brand-soft shrink-0">
              <img src={logoImg} alt="Norte" className="w-6 h-6 object-contain" />
            </div>
            {!compact && (
              <div className="flex flex-col leading-[1.2]">
                <span className="text-sm font-bold text-primary tracking-tight">Norte</span>
                <span className="text-[10px] text-slate-400">Logística Interna</span>
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
                className="hidden lg:flex items-center justify-center w-7 h-7 rounded-md bg-brand-soft border-0 cursor-pointer text-slate-500 shrink-0 hover:text-primary"
              >
                <MI name="chevron_left" style={{ fontSize: 16 }} />
              </button>
              {/* Mobile: fechar gaveta */}
              <button
                type="button"
                onClick={closeMobile}
                aria-label="Fechar menu"
                className="flex lg:hidden items-center justify-center w-7 h-7 rounded-md bg-brand-soft border-0 cursor-pointer text-slate-500 shrink-0 hover:text-primary"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* ── Nav ── */}
        <nav
          aria-label="Páginas"
          className={cn("flex-1 overflow-y-auto overflow-x-hidden flex flex-col", compact ? "p-1.5 gap-2.5" : "p-2.5 gap-5")}
        >
          {menuGroups.map((group, gi) => {
            const items = getGroup(group.ids);
            if (!items.length) return null;
            return (
              <div key={group.title}>
                {/* Group label (compacto: só um divisor entre grupos) */}
                {compact ? (
                  gi > 0 && <div className="h-px bg-primary/10 mx-2 mb-2" aria-hidden="true" />
                ) : (
                  <div className="flex items-center gap-1.5 mb-1 px-1.5">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.07em]">
                      {group.title}
                    </span>
                  </div>
                )}

                {/* Items */}
                <div className={cn("flex flex-col", compact ? "gap-0.5" : "gap-px")}>
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
                        className={cn(
                          "group relative flex items-center gap-[9px] rounded-lg cursor-pointer no-underline transition-all duration-[180ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
                          "outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                          compact ? "justify-center py-2" : "justify-start py-[7px] px-2.5",
                          isActive ? "bg-brand-soft text-primary" : "bg-transparent text-slate-600",
                          !isActive && !compact && "hover:bg-brand-soft/60 hover:translate-x-[3px]",
                          !isActive && compact && "hover:bg-brand-soft/60",
                          isActive && !compact && "hover:translate-x-[1px]",
                        )}
                      >
                        {/* Active left bar */}
                        {isActive && (
                          <span className="absolute left-0 top-[20%] bottom-[20%] w-[3px] rounded-r-[3px] bg-primary" />
                        )}

                        {/* Icon */}
                        <span
                          className={cn(
                            "flex items-center justify-center w-6 h-6 shrink-0 transition-transform duration-[180ms] group-hover:scale-110",
                            isActive ? "text-primary" : group.iconClass,
                          )}>
                          <MI name={tab.icon} filled={true} style={{ fontSize: 18 }} />
                        </span>

                        {!compact && (
                          <span className={cn("flex-1 text-[13px]", isActive ? "font-semibold text-primary tracking-tight" : "font-normal text-slate-700")}>
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
        <div className={cn("bg-brand-soft/60", compact ? "py-2.5 px-1.5" : "py-3 px-2.5")}>

          {/* User card */}
          {compact ? (
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <div
                  tabIndex={0}
                  aria-label={`${userName}${user?.email ? ` (${user.email})` : ""}`}
                  className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground text-xs font-bold mx-auto mb-2"
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
            <div className="flex items-center gap-[9px] py-2 px-2.5 rounded-lg mb-2 bg-card">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground text-xs font-bold shrink-0">
                {initials(userName)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-800 m-0 truncate">{user?.name}</p>
                <p className="text-[10px] text-slate-400 m-0 truncate">{user?.email}</p>
              </div>
            </div>
          )}

          {/* Action row (compacto: coluna) */}
          <div className={cn("flex items-center", compact ? "flex-col justify-center gap-0.5" : "flex-row justify-between px-1")}>
            <div className={cn("flex items-center gap-0.5", compact ? "flex-col" : "flex-row")}>
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
