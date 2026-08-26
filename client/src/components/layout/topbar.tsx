/**
 * BARRA DO TOPO (56px, sticky, com desfoque).
 *
 * Da esquerda para a direita: alternar menu · marca (quando o menu está oculto
 * ou no mobile) · trilha "Grupo / Subgrupo / Tela atual" derivada da rota ·
 * busca ⌘K · ajuda · sino de pendências · usuário.
 *
 * O botão de ajuda abre a lista de atalhos: NÃO existe manual/rota de ajuda no
 * app, e um "?" que não leva a lugar nenhum é pior que a ausência dele.
 */
import { useLocation } from "wouter";
import logoImg from "@assets/image_1776349526988.png";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { TOPBAR_H } from "@/contexts/sidebar-context";
import { MI } from "./mi";
import { useShellMode } from "./use-shell-mode";
import { breadcrumbFor } from "./nav-items";
import NotificationsMenu from "./notifications-menu";
import UserMenu from "./user-menu";
import { MOD } from "./shortcuts";

export default function Topbar({ topOffset, onOpenPalette, onOpenShortcuts }: {
  topOffset: number;
  onOpenPalette: () => void;
  onOpenShortcuts: () => void;
}) {
  const [location] = useLocation();
  const { mode, hidden, isDesktop, isMobileOpen, toggleMobile, cycle } = useShellMode();
  const crumb = breadcrumbFor(location);
  const showBrand = !isDesktop || hidden;

  const toggleLabel = !isDesktop
    ? (isMobileOpen ? "Fechar menu" : "Abrir menu")
    : mode === "expandido" ? "Recolher o menu" : mode === "compacto" ? "Esconder o menu" : "Mostrar o menu";

  return (
    <header
      className="sticky z-20 flex items-center gap-3 px-3 sm:px-4 bg-card/90 backdrop-blur-xl border-b border-border"
      style={{ height: TOPBAR_H, top: topOffset }}
    >
      <Tooltip delayDuration={400}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={isDesktop ? cycle : toggleMobile}
            aria-label={toggleLabel}
            aria-expanded={isDesktop ? !hidden : isMobileOpen}
            aria-controls="app-sidebar"
            className="flex items-center justify-center w-[34px] h-[34px] shrink-0 rounded-lg border-0 bg-transparent text-slate-600 cursor-pointer transition-colors hover:bg-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <MI name={!isDesktop ? (isMobileOpen ? "close" : "menu") : mode === "expandido" ? "menu_open" : "menu"} size={20} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>{toggleLabel}{isDesktop ? ` (${MOD}\\)` : ""}</TooltipContent>
      </Tooltip>

      {showBrand && (
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg overflow-hidden bg-brand-soft">
            <img src={logoImg} alt="Norte" className="w-5 h-5 object-contain" />
          </div>
          <span className="text-sm font-bold text-primary">Norte</span>
        </div>
      )}

      <nav aria-label="Onde você está" className="flex items-center gap-1.5 flex-1 min-w-0 overflow-hidden">
        {crumb && (
          <>
            <span className={cn("shrink-0", crumb.iconClass)}>
              <MI name={crumb.icon} filled size={16} />
            </span>
            {crumb.trail.length > 0 && (
              <span className="hidden md:inline min-w-0 truncate text-xs text-slate-400">
                {crumb.trail.join(" / ")} /
              </span>
            )}
            <span className="shrink truncate text-sm font-semibold text-slate-900 max-w-[260px]">{crumb.label}</span>
          </>
        )}
      </nav>

      {/* Busca ⌘K */}
      <Tooltip delayDuration={400}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onOpenPalette}
            aria-label={`Buscar tela ou evento (${MOD}K)`}
            className="hidden lg:flex items-center justify-center gap-2 w-[220px] h-[34px] shrink-0 px-2.5 rounded-lg border border-border bg-background text-slate-400 cursor-pointer overflow-hidden transition-colors hover:border-primary/30 hover:text-slate-500 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <MI name="search" size={16} className="shrink-0" />
            <span className="flex-1 min-w-0 text-left text-[13px] truncate">Buscar tela ou evento</span>
            <kbd className="shrink-0 border border-border bg-card rounded-md px-1.5 py-px font-mono text-[10px] text-slate-500">{MOD}K</kbd>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>Buscar tela ou evento ({MOD}K)</TooltipContent>
      </Tooltip>

      <div className="flex items-center gap-1 shrink-0">
        <Tooltip delayDuration={400}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onOpenPalette}
              aria-label={`Buscar tela ou evento (${MOD}K)`}
              className="flex lg:hidden items-center justify-center w-[34px] h-[34px] rounded-lg border-0 bg-transparent text-slate-600 cursor-pointer hover:bg-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <MI name="search" size={19} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>Buscar tela ou evento ({MOD}K)</TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={400}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onOpenShortcuts}
              aria-label="Ajuda e atalhos do teclado"
              className="hidden sm:flex items-center justify-center w-[34px] h-[34px] rounded-lg border-0 bg-transparent text-slate-500 cursor-pointer transition-colors hover:bg-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <MI name="help" size={19} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>Ajuda e atalhos do teclado ({MOD}/)</TooltipContent>
        </Tooltip>

        <NotificationsMenu />
        <div aria-hidden="true" className="w-px h-6 bg-border mx-1" />
        <UserMenu onOpenShortcuts={onOpenShortcuts} />
      </div>
    </header>
  );
}
