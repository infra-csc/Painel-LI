/**
 * MENU LATERAL — quatro modos:
 *   • expandido (288px): busca, favoritos, grupos recolhíveis, passos do fluxo da Escala;
 *   • compacto (56px): só ícones, com tooltip e divisor entre grupos;
 *   • oculto (modo foco): some e deixa só a aba azul na borda esquerda;
 *   • gaveta (< lg): 288px sobre um véu escuro, com o usuário e "Sair" no rodapé.
 *
 * A lista de telas, os grupos e as permissões vivem em `nav-items.ts` — este
 * arquivo só desenha. Badges vêm de `use-shell-data.ts` (dado real ou nada).
 *
 * Redesenho de 07/10 (casca premium):
 *  • o cabeçalho tem 56px, a mesma altura da barra do topo — as duas linhas de
 *    borda agora se encontram em vez de ficarem 3px desencontradas;
 *  • o botão "Recolher" do cabeçalho saiu: era o 3º jeito de fazer a mesma
 *    coisa (topo + rodapé + cabeçalho). Ficam o botão do topo e o rodapé;
 *  • o fundo do item ativo/hover ocupa a linha inteira (a estrela não "come"
 *    mais o fim do destaque) e o marcador do ativo encosta na borda do menu;
 *  • contadores em âmbar (token `warning`): pela regra da casa pendente =
 *    atenção, não erro. O vermelho fica só no sino — um alarme por tela;
 *  • a gaveta do celular junta usuário + "Sair" no rodapé.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import logoImg from "@assets/image_1776349526988.png";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { SIDEBAR_W, SIDEBAR_COMPACT_W } from "@/contexts/sidebar-context";
import { SIMULATION_BANNER_H } from "./simulation-banner";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  Star, ChevronRight, ChevronDown, Search, SearchX, X, PanelLeftClose, PanelLeftOpen, Maximize2, LogOut, Lock, type LucideIcon,
} from "lucide-react";
import { initials } from "@/lib/format";
import { getRoleLabel, type UserRole } from "@/lib/role-utils";
import { useShellMode } from "./use-shell-mode";
import { useShellData } from "./use-shell-data";
import { visibleGroups, tabById, subgroupEdges, classeDeCorDaTela, type NavTab } from "./nav-items";
import { getFavorites, setFavorites, getClosedGroups, setClosedGroups, SHELL_PREFS_EVENT } from "./shell-prefs";
import { combo } from "./shortcuts";
import { FOCO } from "./shell-styles";

/** Largura da gaveta no mobile. */
const DRAWER_W = 288;

/** Busca sem acento e sem caixa — "calendario" acha "Calendário". */
const DIACRITICS = /[̀-ͯ]/g;
function normalize(s: string) {
  return s.normalize("NFD").replace(DIACRITICS, "").toLowerCase();
}

const fmt = (n: number) => (n > 99 ? "99+" : String(n));

/**
 * Contador de pendências do item. Âmbar = "espera ação" (token warning);
 * `floating` é o do trilho compacto, sobre o canto do ícone.
 */
function Badge({ count, floating }: { count: number; floating?: boolean }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "flex items-center justify-center shrink-0 rounded-full bg-warning-soft text-warning font-semibold leading-none tabular-nums",
        floating
          ? "absolute -top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 text-2xs ring-2 ring-card"
          : "min-w-[22px] h-5 px-1.5 text-2xs ring-1 ring-inset ring-warning/20",
      )}
    >
      {fmt(count)}<span className="sr-only"> pendente(s)</span>
    </span>
  );
}

/** Botão do rodapé do menu expandido ("Compacto" / "Foco"). */
function FooterBtn({ icon: Icon, label, title, onClick }: { icon: LucideIcon; label: string; title: string; onClick: () => void }) {
  return (
    <Tooltip delayDuration={400}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={cn(
            "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border-0 bg-transparent text-xs font-medium text-muted-foreground cursor-pointer",
            "transition-colors hover:bg-muted hover:text-foreground active:bg-border/60",
            FOCO,
          )}
        >
          <Icon className="w-[15px] h-[15px]" aria-hidden="true" />
          {label}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>{title}</TooltipContent>
    </Tooltip>
  );
}

/** Botão quadrado do trilho compacto. */
function RailBtn({ icon: Icon, label, tip, onClick }: { icon: LucideIcon; label: string; tip: string; onClick: () => void }) {
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className={cn(
            "flex items-center justify-center w-9 h-9 rounded-lg border-0 bg-transparent text-muted-foreground cursor-pointer",
            "transition-colors hover:bg-muted hover:text-foreground",
            FOCO,
          )}
        >
          <Icon className="w-4 h-4" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>{tip}</TooltipContent>
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
  const roleLabel = getRoleLabel((user?.role || "production") as UserRole);
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
  const filtered = useMemo(
    () => groups
      .map((g) => ({ ...g, items: g.items.filter((tab) => !q || normalize(tab.label).includes(q)) }))
      .filter((g) => g.items.length > 0),
    [groups, q],
  );
  const searching = q.length > 0;
  const nothingFound = searching && filtered.length === 0;
  const semTelas = groups.length === 0;

  const closeMobile = () => setMobileOpen(false);

  // Gaveta mobile como diálogo (24/09): Esc fecha, o foco entra no "Fechar
  // menu", fica preso dentro do <aside> (Tab/Shift+Tab circulam) e volta ao
  // botão que abriu quando fecha. O conteúdo por trás recebe `inert` no
  // MainLayout, então nem leitor de tela nem Tab alcançam a página.
  const asideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!isMobileOpen) return;
    const abriuDe = document.activeElement as HTMLElement | null;
    const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focaveis = () => Array.from(asideRef.current?.querySelectorAll<HTMLElement>(FOCAVEIS) ?? [])
      .filter((el) => el.offsetParent !== null);
    // Foco inicial: o botão "Fechar menu" (primeiro focável visível da gaveta).
    const t = window.setTimeout(() => {
      const [primeiro] = focaveis();
      (asideRef.current?.querySelector<HTMLElement>('[aria-label="Fechar menu"]') ?? primeiro)?.focus();
    }, 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setMobileOpen(false); return; }
      if (e.key !== "Tab") return;
      const lista = focaveis();
      if (lista.length === 0) return;
      const primeiro = lista[0], ultimo = lista[lista.length - 1];
      const ativo = document.activeElement as HTMLElement | null;
      const dentro = !!ativo && !!asideRef.current?.contains(ativo);
      if (e.shiftKey ? (ativo === primeiro || !dentro) : (ativo === ultimo || !dentro)) {
        e.preventDefault();
        (e.shiftKey ? ultimo : primeiro).focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      abriuDe?.focus?.();
    };
  }, [isMobileOpen, setMobileOpen]);

  // Trocar de tela fecha a gaveta e zera a busca do menu.
  useEffect(() => { setQuery(""); }, [currentPath]);

  const badgeOf = (id: string) => tabBadgeCount[id] ?? 0;

  /** Uma linha do menu (expandido ou gaveta). */
  const renderItem = (tab: NavTab, opts: { big?: boolean; showStar?: boolean }) => {
    const isActive = currentPath === tab.path;
    const count = badgeOf(tab.id);
    const fav = favorites.includes(tab.id);
    return (
      // O fundo (ativo/hover) é da LINHA, não do link: assim ele cobre também
      // a área da estrela e o destaque vai de ponta a ponta.
      <div
        key={tab.id}
        className={cn(
          "group relative flex items-center rounded-lg transition-colors duration-150",
          isActive ? "bg-brand-soft" : "hover:bg-muted",
        )}
      >
        {/* Marcador do ativo encostado na borda do menu (o <nav> tem px-2). */}
        {isActive && <span aria-hidden="true" className="absolute -left-2 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary" />}
        <Link
          href={tab.path}
          onClick={closeMobile}
          aria-current={isActive ? "page" : undefined}
          className={cn(
            "flex flex-1 min-w-0 items-center gap-2.5 rounded-lg no-underline",
            FOCO,
            opts.big ? "h-10 px-2.5" : "h-9 px-2.5",
            // Espaço da estrela só quando ela aparece (hover, foco ou favorita).
            opts.showStar && (fav ? "pr-8" : "group-hover:pr-8 group-focus-within:pr-8"),
          )}
        >
          {/* Cor por grupo (28/09 — dono: "sem cor está bem ruim"); ativo no azul de marca. */}
          <span className={cn("flex items-center justify-center w-5 h-5 shrink-0", isActive ? "text-primary" : classeDeCorDaTela(tab.id))}>
            <tab.icon className="w-[18px] h-[18px]" aria-hidden="true" strokeWidth={isActive ? 2.25 : 2} />
          </span>
          {/* Uma linha só (28/09); `truncate` + `title` é só rede. */}
          <span
            title={tab.label}
            className={cn(
              "flex-1 min-w-0 text-[13.5px] leading-snug truncate",
              isActive ? "font-semibold text-primary" : "font-medium text-slate-700 group-hover:text-foreground",
            )}
          >
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
                  "absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-6 h-6 border-0 bg-transparent p-0 cursor-pointer rounded-md",
                  "transition-[opacity,color,transform] duration-150 active:scale-90",
                  FOCO,
                  // Só aparece favoritada, no hover da linha ou no foco (28/09).
                  fav
                    ? "text-warning-strong"
                    : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-slate-400 hover:text-warning-strong",
                )}
              >
                <Star className="w-3.5 h-3.5" fill={fav ? "currentColor" : "none"} aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={6}>{fav ? "Remover dos favoritos" : "Fixar nos favoritos"}</TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  };

  /** Rótulo de seção (Favoritos, grupos) — mesmo recuo do ícone dos itens. */
  const rotulo = "text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground";

  // ── Conteúdo do menu (expandido e gaveta compartilham a lista) ──
  const navContent = (
    <>
      {/* Favoritos — só fora da busca, para não competir com o resultado */}
      {!searching && favorites.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 h-7 px-2.5">
            <span className={rotulo}>Favoritos</span>
            <Star className="w-3 h-3 text-warning-strong" fill="currentColor" aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-px">
            {favorites.map((id) => {
              const tab = tabById(id);
              if (!tab) return null;
              const acessivel = groups.some((g) => g.items.some((i) => i.id === id));
              if (!acessivel) return null; // favorito de uma tela que este papel não acessa
              return renderItem(tab, { big: drawer, showStar: !drawer });
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
              className={cn(
                "group/g flex items-center gap-1.5 w-full h-7 px-2.5 border-0 bg-transparent cursor-pointer rounded-md text-left",
                "transition-colors hover:bg-muted/70",
                FOCO,
              )}
            >
              <span className={cn(rotulo, "group-hover/g:text-foreground transition-colors")}>{group.title}</span>
              <span className="flex-1" />
              {isClosed && groupBadge > 0 && <Badge count={groupBadge} />}
              <ChevronDown
                className={cn(
                  "w-3.5 h-3.5 text-muted-foreground transition-[transform,opacity] duration-200",
                  isClosed ? "-rotate-90 opacity-100" : "opacity-0 group-hover/g:opacity-100 group-focus-visible/g:opacity-100",
                )}
                aria-hidden="true"
              />
            </button>
            {!isClosed && (
              <div className="flex flex-col gap-px mt-0.5">
                {items.map((tab, ti) => {
                  const row = renderItem(tab, { big: drawer, showStar: !drawer });
                  // Sub-rótulo discreto antes do 1º item do subgrupo (ex.: "Escala")
                  // e separador fino depois do último — sem numeração de etapa.
                  const { start, end } = subgroupEdges(group, items, ti);
                  if (!start && !end) return row;
                  return (
                    <div key={`${tab.id}-sub`} className="flex flex-col gap-px">
                      {start && (
                        <span className="flex items-center gap-2 h-6 pl-[42px] pr-2.5">
                          <span className="text-2xs font-medium text-muted-foreground">{group.subgroup!.label}</span>
                          <span aria-hidden="true" className="flex-1 h-px bg-border" />
                        </span>
                      )}
                      {row}
                      {end && <div aria-hidden="true" className="h-px bg-border ml-[42px] mr-2.5 my-1.5" />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {nothingFound && (
        <div role="status" className="casca-surgir flex flex-col items-center text-center gap-1 px-4 py-8">
          <SearchX className="w-5 h-5 text-muted-foreground mb-1" aria-hidden="true" />
          <p className="m-0 text-xs font-medium text-foreground">Nenhuma tela com “{query.trim()}”</p>
          <button
            type="button"
            onClick={() => { setQuery(""); searchRef.current?.focus(); }}
            className={cn("mt-1 border-0 bg-transparent p-0 text-xs font-medium text-primary cursor-pointer rounded hover:underline", FOCO)}
          >
            Limpar a busca
          </button>
        </div>
      )}

      {semTelas && (
        <div className="flex flex-col items-center text-center gap-1.5 px-5 py-10">
          <Lock className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
          <p className="m-0 text-xs text-muted-foreground leading-relaxed">Nenhuma tela liberada para a sua conta ainda.</p>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Véu da gaveta mobile */}
      {isMobileOpen && (
        <div className="lg:hidden fixed inset-0 bg-foreground/40 z-40 animate-in fade-in-0 duration-200 motion-reduce:animate-none" onClick={closeMobile} aria-hidden="true" />
      )}

      {/* Aba para reabrir o menu (modo foco / oculto) */}
      {hidden && (
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={cn(
                "hidden lg:flex fixed top-1/2 -translate-y-1/2 left-0 z-50 items-center justify-center w-5 h-12 border-0 bg-primary text-primary-foreground rounded-r-lg cursor-pointer shadow-2",
                "transition-[width] duration-150 hover:w-7 hover:bg-primary-hover",
                "outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2",
              )}
              onClick={setExpandido}
              aria-label="Mostrar o menu"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={6}>Mostrar o menu ({combo(".")})</TooltipContent>
        </Tooltip>
      )}

      <aside
        id="app-sidebar"
        ref={asideRef}
        aria-label="Menu principal"
        role={drawer && isMobileOpen ? "dialog" : undefined}
        aria-modal={drawer && isMobileOpen ? true : undefined}
        className={cn(
          "fixed left-0 top-0 h-dvh flex flex-col shrink-0 z-40 font-sans bg-card border-r border-border",
          "transition-[transform,width] duration-200 ease-out motion-reduce:transition-none",
          isMobileOpen ? "translate-x-0 shadow-3" : "-translate-x-full lg:translate-x-0",
          hidden && "lg:-translate-x-full",
        )}
        style={{
          width: asideWidth,
          ...(simActive ? { top: SIMULATION_BANNER_H, height: `calc(100dvh - ${SIMULATION_BANNER_H}px)` } : {}),
        }}
      >
        {/* ── Cabeçalho: 56px, alinhado com a barra do topo ── */}
        <div className={cn(
          "flex items-center h-14 shrink-0 border-b border-border",
          compact ? "justify-center" : "justify-between gap-2 px-4",
        )}>
          <Link
            href="/"
            onClick={closeMobile}
            aria-label="Norte — Logística Interna, página inicial"
            className={cn("flex items-center gap-2.5 min-w-0 rounded-lg no-underline", FOCO)}
          >
            <span className="flex items-center justify-center w-8 h-8 rounded-lg overflow-hidden bg-brand-soft ring-1 ring-inset ring-primary/10 shrink-0">
              <img src={logoImg} alt="" className="w-[22px] h-[22px] object-contain" />
            </span>
            {!compact && (
              <span className="flex flex-col leading-tight min-w-0">
                <span className="text-sm font-bold text-primary tracking-tight">Norte</span>
                <span className="text-2xs text-muted-foreground truncate">Logística Interna</span>
              </span>
            )}
          </Link>
          {drawer && (
            <button
              type="button"
              onClick={closeMobile}
              aria-label="Fechar menu"
              className={cn(
                "flex items-center justify-center w-9 h-9 shrink-0 rounded-lg border-0 bg-transparent text-muted-foreground cursor-pointer",
                "transition-colors hover:bg-muted hover:text-foreground",
                FOCO,
              )}
            >
              <X className="w-[18px] h-[18px]" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* ── Busca (filtra o menu; a busca geral é a do topo) ── */}
        {!compact && !semTelas && (
          <div className="px-3 pt-3 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-[15px] h-[15px] text-muted-foreground pointer-events-none" aria-hidden="true" />
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
                placeholder="Filtrar telas…"
                className={cn(
                  "w-full h-9 pl-8 pr-8 rounded-lg border border-transparent bg-surface-muted text-[13px] text-foreground box-border",
                  "transition-colors hover:border-border focus-visible:border-primary/40 focus-visible:bg-card",
                  "outline-none focus-visible:ring-2 focus-visible:ring-ring/20 placeholder:text-muted-foreground",
                  drawer && "h-10",
                )}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => { setQuery(""); searchRef.current?.focus(); }}
                  aria-label="Limpar a busca do menu"
                  className={cn("absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded-md border-0 bg-transparent text-muted-foreground cursor-pointer hover:bg-muted hover:text-foreground", FOCO)}
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Lista de telas ── */}
        <nav
          aria-label="Páginas"
          className={cn(
            "flex-1 overflow-y-auto overflow-x-hidden flex flex-col",
            // Barra de rolagem fina e discreta (28/09).
            "[scrollbar-width:thin] [scrollbar-color:var(--border)_transparent]",
            compact ? "px-2 py-3 gap-2" : "px-2 pt-1 pb-3 gap-4",
          )}
        >
          {compact
            ? filtered.map(({ group, items }, gi) => (
              <div key={group.title} className="flex flex-col gap-1">
                {gi > 0 && <div aria-hidden="true" className="h-px bg-border mx-2 mb-1" />}
                {items.map((tab, ti) => {
                  const isActive = currentPath === tab.path;
                  const count = badgeOf(tab.id);
                  const { start, end } = subgroupEdges(group, items, ti);
                  return (
                    <div key={tab.id} className="contents">
                    {start && <div aria-hidden="true" className="h-px bg-border/70 mx-3 my-0.5" />}
                    <Tooltip delayDuration={200}>
                      <TooltipTrigger asChild>
                        <Link
                          href={tab.path}
                          aria-current={isActive ? "page" : undefined}
                          aria-label={tab.label}
                          className={cn(
                            "relative flex items-center justify-center h-9 rounded-lg no-underline transition-colors duration-150",
                            FOCO,
                            // Mesma cor por grupo do menu expandido (28/09).
                            isActive ? "bg-brand-soft text-primary" : cn("bg-transparent hover:bg-muted", classeDeCorDaTela(tab.id)),
                          )}
                        >
                          {isActive && <span aria-hidden="true" className="absolute -left-2 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary" />}
                          <tab.icon className="w-[18px] h-[18px]" aria-hidden="true" strokeWidth={isActive ? 2.25 : 2} />
                          <Badge count={count} floating />
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right" sideOffset={10}>
                        {tab.label}{count > 0 ? ` · ${fmt(count)} pendente(s)` : ""}
                      </TooltipContent>
                    </Tooltip>
                    {end && <div aria-hidden="true" className="h-px bg-border/70 mx-3 my-0.5" />}
                    </div>
                  );
                })}
              </div>
            ))
            : navContent}
        </nav>

        {/* ── Rodapé ── */}
        {compact ? (
          <div className="border-t border-border px-2 py-2 flex flex-col items-center gap-1">
            <RailBtn icon={PanelLeftOpen} label="Expandir o menu" tip={`Expandir o menu (${combo("\\")})`} onClick={setExpandido} />
            <RailBtn icon={Maximize2} label="Modo foco" tip={`Modo foco (${combo(".")})`} onClick={setOculto} />
          </div>
        ) : drawer ? (
          <div className="border-t border-border px-3 py-3 flex items-center gap-2.5">
            <span className="flex items-center justify-center w-9 h-9 shrink-0 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
              {initials(userName)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[13px] font-semibold text-foreground truncate">{userName}</p>
              <p className="m-0 text-2xs text-muted-foreground truncate">{user?.email || roleLabel}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              className={cn(
                "inline-flex items-center gap-1.5 h-10 px-3 shrink-0 rounded-lg border-0 bg-transparent text-[13px] font-medium text-danger cursor-pointer",
                "transition-colors hover:bg-danger-soft",
                FOCO,
              )}
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />Sair
            </button>
          </div>
        ) : (
          <div className="border-t border-border h-12 px-2 flex items-center gap-1">
            <FooterBtn icon={PanelLeftClose} label="Compacto" title={`Só ícones (${combo("\\")})`} onClick={setCompacto} />
            <FooterBtn icon={Maximize2} label="Foco" title={`Esconde o menu (${combo(".")})`} onClick={setOculto} />
          </div>
        )}
      </aside>
    </>
  );
}
