/**
 * MENU LATERAL — quatro modos:
 *   • expandido (248px): busca, favoritos, grupos recolhíveis, passos do fluxo da Escala;
 *   • compacto (56px): só ícones, com tooltip e divisor entre grupos;
 *   • oculto (modo foco): some e deixa só a aba azul na borda esquerda;
 *   • gaveta (< lg): 272px sobre um véu escuro, com bloco do usuário e "Sair".
 *
 * A lista de telas, os grupos e as permissões vivem em `nav-items.ts` — este
 * arquivo só desenha. Badges vêm de `use-shell-data.ts` (dado real ou nada).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import logoImg from "@assets/image_1776349526988.png";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { SIDEBAR_W, SIDEBAR_COMPACT_W } from "@/contexts/sidebar-context";
import { SIMULATION_BANNER_H } from "./simulation-banner";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { MI, initials } from "./mi";
import { useShellMode } from "./use-shell-mode";
import { useShellData } from "./use-shell-data";
import { visibleGroups, tabById, subgroupEdges, iconClassFor, type NavGroup, type NavTab } from "./nav-items";
import { getFavorites, setFavorites, getClosedGroups, setClosedGroups, SHELL_PREFS_EVENT } from "./shell-prefs";

/** Largura da gaveta no mobile (o desenho pede 272px, mais folgada que a de desktop). */
const DRAWER_W = 272;

/** Busca sem acento e sem caixa — "calendario" acha "Calendário". */
const DIACRITICS = /[̀-ͯ]/g;
function normalize(s: string) {
  return s.normalize("NFD").replace(DIACRITICS, "").toLowerCase();
}

function Badge({ count, floating }: { count: number; floating?: boolean }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} pendente(s)`}
      className={cn(
        "flex items-center justify-center shrink-0 rounded-full bg-red-500 text-white font-bold leading-none px-1",
        floating ? "absolute top-0.5 right-1.5 min-w-[16px] h-4 text-[9px] ring-2 ring-card" : "min-w-[18px] h-[18px] text-[10px]",
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** Botão de texto do rodapé do menu expandido ("Compacto" / "Foco"). */
function FooterBtn({ icon, label, title, onClick }: { icon: string; label: string; title: string; onClick: () => void }) {
  return (
    <Tooltip delayDuration={400}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className="inline-flex items-center gap-1.5 h-[30px] px-2 rounded-lg border-0 bg-transparent text-xs text-slate-500 cursor-pointer transition-colors hover:bg-brand-soft hover:text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <MI name={icon} size={16} />
          {label}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>{title}</TooltipContent>
    </Tooltip>
  );
}

export default function Sidebar() {
  const [location, navigate] = useLocation();
  const { user, logout, simulation } = useAuth();
  const simActive = !!simulation?.active;
  const {
    mode, hidden, isDesktop, isMobileOpen, setMobileOpen,
    setExpandido, setCompacto, setOculto,
  } = useShellMode();
  const { tabBadgeCount } = useShellData();

  const compact = mode === "compacto" && isDesktop;
  const drawer = !isDesktop;
  const asideWidth = drawer ? DRAWER_W : compact ? SIDEBAR_COMPACT_W : SIDEBAR_W;
  const userName = user?.name || "Usuário";
  const currentPath = location.split("?")[0];

  const groups = useMemo(() => visibleGroups(user), [user]);

  // ── Preferências locais (favoritos e grupos recolhidos) ──
  const [favorites, setFavs] = useState<string[]>(() => getFavorites(user?.id));
  const [closed, setClosed] = useState<string[]>(() => getClosedGroups(user?.id));
  useEffect(() => {
    const sync = () => { setFavs(getFavorites(user?.id)); setClosed(getClosedGroups(user?.id)); };
    sync();
    window.addEventListener(SHELL_PREFS_EVENT, sync);
    return () => window.removeEventListener(SHELL_PREFS_EVENT, sync);
  }, [user?.id]);

  const toggleFavorite = (id: string) => {
    const next = favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id];
    setFavs(next);
    setFavorites(user?.id, next);
  };
  const toggleGroup = (title: string) => {
    const next = closed.includes(title) ? closed.filter((t) => t !== title) : [...closed, title];
    setClosed(next);
    setClosedGroups(user?.id, next);
  };

  // ── Busca no menu ──
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const q = normalize(query.trim());
  const matches = (tab: NavTab) => !q || normalize(tab.label).includes(q);
  const filtered = useMemo(
    () => groups.map((g) => ({ ...g, items: g.items.filter(matches) })).filter((g) => g.items.length > 0),
    [groups, q],
  );
  const searching = q.length > 0;
  const nothingFound = searching && filtered.length === 0;

  const closeMobile = () => setMobileOpen(false);

  // Esc fecha a gaveta mobile.
  useEffect(() => {
    if (!isMobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMobileOpen, setMobileOpen]);

  // Trocar de tela fecha a gaveta e zera a busca do menu.
  useEffect(() => { setQuery(""); }, [currentPath]);

  const badgeOf = (id: string) => tabBadgeCount[id] ?? 0;

  /** Uma linha do menu (expandido ou gaveta). */
  const renderItem = (tab: NavTab, group: NavGroup, opts: { big?: boolean; showStar?: boolean }) => {
    const isActive = currentPath === tab.path;
    const count = badgeOf(tab.id);
    const fav = favorites.includes(tab.id);
    return (
      <div key={tab.id} className="group relative flex items-center">
        {isActive && <span aria-hidden="true" className="absolute left-0 top-[20%] bottom-[20%] w-[3px] rounded-r-[3px] bg-primary" />}
        <Link
          href={tab.path}
          onClick={closeMobile}
          aria-current={isActive ? "page" : undefined}
          className={cn(
            "flex flex-1 min-w-0 items-center gap-[9px] rounded-lg no-underline transition-colors duration-150",
            "outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            opts.big ? "py-[9px] px-2.5" : "py-[7px] px-2.5",
            isActive ? "bg-brand-soft" : "bg-transparent hover:bg-brand-soft/60",
          )}
        >
          <span className={cn("flex items-center justify-center w-[22px] h-[22px] shrink-0", isActive ? "text-primary" : iconClassFor(group, tab.id))}>
            <MI name={tab.icon} filled size={18} />
          </span>
          <span className={cn(
            "flex-1 min-w-0 truncate",
            opts.big ? "text-sm" : "text-[13px]",
            isActive ? "font-semibold text-primary" : "font-normal text-slate-700",
          )}>
            {tab.label}
          </span>
          <Badge count={count} />
        </Link>
        {opts.showStar && (
          <Tooltip delayDuration={400}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => toggleFavorite(tab.id)}
                aria-pressed={fav}
                aria-label={fav ? `Remover ${tab.label} dos favoritos` : `Fixar ${tab.label} nos favoritos`}
                className={cn(
                  "inline-flex items-center justify-center w-[18px] h-[18px] mr-1.5 ml-1 shrink-0 border-0 bg-transparent p-0 cursor-pointer rounded",
                  "outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  fav ? "text-amber-500" : "text-slate-200 hover:text-amber-400",
                )}
              >
                <MI name="star" filled={fav} size={14} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={6}>{fav ? "Remover dos favoritos" : "Fixar nos favoritos"}</TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  };

  // ── Conteúdo do menu (expandido e gaveta compartilham a lista) ──
  const navContent = (
    <>
      {/* Favoritos — só fora da busca, para não competir com o resultado */}
      {!searching && favorites.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 px-2 pb-1">
            <MI name="star" filled size={13} className="text-amber-500" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-400">Favoritos</span>
          </div>
          <div className="flex flex-col gap-px">
            {favorites.map((id) => {
              const tab = tabById(id);
              if (!tab) return null;
              const found = groups.find((g) => g.items.some((i) => i.id === id));
              if (!found) return null; // favorito de uma tela que este papel não acessa
              return renderItem(tab, found.group, { big: drawer, showStar: !drawer });
            })}
          </div>
        </div>
      )}

      {filtered.map(({ group, items }) => {
        const isClosed = !searching && closed.includes(group.title);
        const groupBadge = items.reduce((acc, t) => acc + badgeOf(t.id), 0);
        return (
          <div key={group.title}>
            <button
              type="button"
              onClick={() => toggleGroup(group.title)}
              aria-expanded={!isClosed}
              className="flex items-center gap-1.5 w-full px-2 pt-0.5 pb-1 border-0 bg-transparent cursor-pointer rounded outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <MI name={isClosed ? "chevron_right" : "expand_more"} size={14} className="text-slate-300" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-400">{group.title}</span>
              <span className="flex-1" />
              {isClosed && groupBadge > 0 && (
                <span className="flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-100 text-red-700 text-[9px] font-bold">
                  {groupBadge > 99 ? "99+" : groupBadge}
                </span>
              )}
            </button>
            {!isClosed && (
              <div className="flex flex-col gap-px">
                {items.map((tab, ti) => {
                  const row = renderItem(tab, group, { big: drawer, showStar: !drawer });
                  // Sub-rótulo discreto antes do 1º item do subgrupo (ex.: "Escala")
                  // e separador fino depois do último — sem numeração de etapa.
                  const { start, end } = subgroupEdges(group, items, ti);
                  if (!start && !end) return row;
                  return (
                    <div key={`${tab.id}-sub`} className="flex flex-col">
                      {start && (
                        <span className="flex items-center gap-1.5 px-2.5 pt-1.5 pb-0.5">
                          <span className={cn("text-[10px] font-semibold tracking-wide", group.subgroup!.labelClass)}>{group.subgroup!.label}</span>
                          <span aria-hidden="true" className="flex-1 h-px bg-slate-100" />
                        </span>
                      )}
                      {row}
                      {end && <div aria-hidden="true" className="h-px bg-slate-100 mx-2.5 my-1" />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {nothingFound && (
        <p className="m-2 text-xs text-slate-400 text-center">Nenhuma tela com “{query.trim()}”.</p>
      )}
    </>
  );

  return (
    <>
      {/* Véu da gaveta mobile */}
      {isMobileOpen && (
        <div className="lg:hidden fixed inset-0 bg-slate-950/35 z-40" onClick={closeMobile} aria-hidden="true" />
      )}

      {/* Aba para reabrir o menu (modo foco / oculto) */}
      {hidden && (
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="hidden lg:flex fixed top-1/2 -translate-y-1/2 left-0 z-50 items-center justify-center w-[22px] h-11 border-0 bg-primary text-primary-foreground rounded-r-lg cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              onClick={setExpandido}
              aria-label="Mostrar o menu"
            >
              <MI name="chevron_right" size={16} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={6}>Mostrar o menu (⌘\)</TooltipContent>
        </Tooltip>
      )}

      <aside
        id="app-sidebar"
        aria-label="Menu principal"
        className={cn(
          "fixed left-0 top-0 h-dvh flex flex-col shrink-0 z-40 font-sans bg-card border-r border-border",
          "transition-[transform,width] duration-300",
          isMobileOpen ? "translate-x-0 shadow-[12px_0_32px_rgba(2,8,23,0.18)]" : "-translate-x-full lg:translate-x-0",
          hidden && "lg:-translate-x-full",
        )}
        style={{
          width: asideWidth,
          ...(simActive ? { top: SIMULATION_BANNER_H, height: `calc(100dvh - ${SIMULATION_BANNER_H}px)` } : {}),
        }}
      >
        {/* ── Cabeçalho ── */}
        <div className={cn(
          "flex items-center border-b border-slate-100",
          compact ? "justify-center pt-3 pb-2.5" : "justify-between gap-2 pl-3 pr-3 pt-3 pb-2.5",
        )}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg overflow-hidden bg-brand-soft shrink-0">
              <img src={logoImg} alt="Norte" className="w-[22px] h-[22px] object-contain" />
            </div>
            {!compact && (
              <div className="flex flex-col leading-[1.2] min-w-0">
                <span className="text-sm font-bold text-primary tracking-tight">Norte</span>
                <span className="text-[10px] text-slate-400 truncate">Logística Interna</span>
              </div>
            )}
          </div>
          {!compact && (
            <>
              <Tooltip delayDuration={400}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={setCompacto}
                    aria-label="Recolher o menu"
                    className="hidden lg:flex items-center justify-center w-7 h-7 shrink-0 rounded-lg bg-background border border-border text-slate-500 cursor-pointer transition-colors hover:text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <MI name="left_panel_close" size={16} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={6}>Recolher o menu (⌘\)</TooltipContent>
              </Tooltip>
              <button
                type="button"
                onClick={closeMobile}
                aria-label="Fechar menu"
                className="flex lg:hidden items-center justify-center w-8 h-8 shrink-0 rounded-lg bg-background border border-border text-slate-500 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <MI name="close" size={17} />
              </button>
            </>
          )}
        </div>

        {/* ── Bloco do usuário (só na gaveta) ── */}
        {drawer && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-slate-100 bg-brand-soft/40">
            <span className="flex items-center justify-center w-8 h-8 shrink-0 rounded-full bg-primary text-primary-foreground text-[11px] font-bold">
              {initials(userName)}
            </span>
            <div className="min-w-0">
              <p className="m-0 text-xs font-semibold text-slate-800 truncate">{userName}</p>
              <p className="m-0 text-[10px] text-slate-400 truncate">{user?.email}</p>
            </div>
          </div>
        )}

        {/* ── Busca ── */}
        {!compact && (
          <div className="px-3 pt-2.5 pb-2">
            <div className="relative">
              <MI name="search" size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { setQuery(""); return; }
                  if (e.key === "Enter") {
                    const first = filtered[0]?.items[0];
                    if (first) { navigate(first.path); closeMobile(); }
                  }
                }}
                aria-label="Buscar tela no menu"
                placeholder="Buscar tela…"
                className="w-full h-8 pl-[30px] pr-2.5 rounded-lg border border-border bg-background text-xs text-foreground box-border outline-none focus-visible:ring-2 focus-visible:ring-ring/40 placeholder:text-slate-400"
              />
            </div>
          </div>
        )}

        {/* ── Lista de telas ── */}
        <nav
          aria-label="Páginas"
          className={cn(
            "flex-1 overflow-y-auto overflow-x-hidden flex flex-col",
            compact ? "px-1.5 py-2 gap-2.5" : drawer ? "px-2 pb-2 gap-3" : "px-2 pb-2 gap-3.5",
          )}
        >
          {compact
            ? filtered.map(({ group, items }, gi) => (
              <div key={group.title} className="flex flex-col gap-0.5">
                {gi > 0 && <div aria-hidden="true" className="h-px bg-slate-100 mx-1.5 mb-1.5" />}
                {items.map((tab, ti) => {
                  const isActive = currentPath === tab.path;
                  const count = badgeOf(tab.id);
                  const { start, end } = subgroupEdges(group, items, ti);
                  return (
                    <div key={tab.id} className="contents">
                    {start && <div aria-hidden="true" className="h-px bg-slate-100 mx-1.5 my-1" />}
                    <Tooltip delayDuration={200}>
                      <TooltipTrigger asChild>
                        <Link
                          href={tab.path}
                          aria-current={isActive ? "page" : undefined}
                          aria-label={tab.label}
                          className={cn(
                            "relative flex items-center justify-center py-2 rounded-lg no-underline transition-colors",
                            "outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                            isActive ? "bg-brand-soft text-primary" : cn("bg-transparent hover:bg-brand-soft/60", iconClassFor(group, tab.id)),
                          )}
                        >
                          <MI name={tab.icon} filled size={18} />
                          <Badge count={count} floating />
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right" sideOffset={8}>
                        {tab.label}{count > 0 ? ` · ${count > 99 ? "99+" : count} pendente(s)` : ""}
                      </TooltipContent>
                    </Tooltip>
                    {end && <div aria-hidden="true" className="h-px bg-slate-100 mx-1.5 my-1" />}
                    </div>
                  );
                })}
              </div>
            ))
            : navContent}
        </nav>

        {/* ── Rodapé ── */}
        {compact ? (
          <div className="border-t border-slate-100 px-1.5 py-2 flex flex-col items-center gap-0.5">
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={setExpandido}
                  aria-label="Expandir o menu"
                  className="flex items-center justify-center w-[30px] h-[30px] rounded-lg border-0 bg-transparent text-slate-500 cursor-pointer transition-colors hover:bg-brand-soft hover:text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <MI name="left_panel_open" size={16} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>Expandir o menu (⌘\)</TooltipContent>
            </Tooltip>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={setOculto}
                  aria-label="Modo foco"
                  className="flex items-center justify-center w-[30px] h-[30px] rounded-lg border-0 bg-transparent text-slate-500 cursor-pointer transition-colors hover:bg-brand-soft hover:text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <MI name="grid_view" size={16} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>Modo foco (⌘.)</TooltipContent>
            </Tooltip>
          </div>
        ) : drawer ? (
          <div className="border-t border-slate-100 px-3 py-2.5">
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-2 h-[34px] px-2.5 rounded-lg border border-red-200 bg-card text-[13px] font-medium text-red-700 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <MI name="logout" size={16} />Sair
            </button>
          </div>
        ) : (
          <div className="border-t border-slate-100 px-2.5 py-2 flex items-center gap-1.5">
            <FooterBtn icon="left_panel_close" label="Compacto" title="Modo compacto (⌘\)" onClick={setCompacto} />
            <FooterBtn icon="grid_view" label="Foco" title="Modo foco — esconde o menu (⌘.)" onClick={setOculto} />
          </div>
        )}
      </aside>
    </>
  );
}
