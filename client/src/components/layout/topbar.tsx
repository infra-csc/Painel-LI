/**
 * BARRA DO TOPO (56px, sticky, com desfoque).
 *
 * Da esquerda para a direita: alternar menu · marca (quando o menu está oculto
 * ou no mobile) · trilha "Grupo › Subgrupo › Tela atual" derivada da rota ·
 * busca ⌘K · ajuda · sino de pendências · usuário.
 *
 * O botão de ajuda abre a lista de atalhos: NÃO existe manual/rota de ajuda no
 * app, e um "?" que não leva a lugar nenhum é pior que a ausência dele.
 *
 * 07/10: a busca do topo cortava o próprio rótulo em 1366 ("Buscar tela ou
 * e…") e o atalho aparecia como "CtrlK". Agora o campo cresce com a tela, o
 * rótulo curto entra quando falta espaço e as teclas são `<kbd>` separadas.
 */
import { useLocation } from "wouter";
import logoImg from "@assets/image_1776349526988.png";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { TOPBAR_H } from "@/contexts/sidebar-context";
import { cn } from "@/lib/utils";
import { X, Menu, PanelLeftClose, PanelLeftOpen, Search, CircleHelp, ChevronRight, Compass } from "lucide-react";
import { useShellMode } from "./use-shell-mode";
import { breadcrumbFor, type Breadcrumb } from "./nav-items";
import NotificationsMenu from "./notifications-menu";
import UserMenu from "./user-menu";
import { combo, teclas } from "./shortcuts";
import { Keys } from "./kbd";
import { TOPBAR_ICON_BTN } from "./shell-styles";

/**
 * Toda rota do app dentro da casca é item do menu (ou /pendencias); o que não
 * casa com nenhuma cai no 404 — o topo diz isso em vez de ficar em branco.
 */
const CRUMB_404: Breadcrumb = { trail: [], label: "Página não encontrada", icon: Compass };

export default function Topbar({ topOffset, onOpenPalette, onOpenShortcuts }: {
  topOffset: number;
  onOpenPalette: () => void;
  onOpenShortcuts: () => void;
}) {
  const [location] = useLocation();
  const { mode, hidden, isDesktop, isMobileOpen, toggleMobile, toggleMenu } = useShellMode();
  const crumb = breadcrumbFor(location) ?? (location.split("?")[0] !== "/" ? CRUMB_404 : null);
  const showBrand = !isDesktop || hidden;

  // Alternador de DUAS posições: aberto → recolhe; recolhido ou oculto → abre.
  // Esconder o menu (modo foco) é ação deliberada — fica no rodapé do menu e no ⌘.
  const isOpen = isDesktop ? mode === "expandido" : isMobileOpen;
  // No compacto o menu CONTINUA na tela (trilho de ícones navegável): dizer
  // aria-expanded="false" ali mentiria para o leitor de tela. Só o modo foco
  // (oculto) some de verdade.
  const isVisibleToAT = isDesktop ? mode !== "oculto" : isMobileOpen;
  // "Expandir o menu" é o mesmo nome do botão no rodapé do menu — dois rótulos
  // para o mesmo comando confundiam quem navega por voz.
  const toggleLabel = !isDesktop
    ? (isMobileOpen ? "Fechar menu" : "Abrir menu")
    : isOpen ? "Recolher o menu" : mode === "compacto" ? "Expandir o menu" : "Abrir o menu";
  const ToggleIcon = !isDesktop
    ? (isMobileOpen ? X : Menu)
    : isOpen ? PanelLeftClose : PanelLeftOpen;
  const buscaLabel = `Buscar tela ou evento (${combo("K")})`;

  return (
    <header
      className="sticky z-20 flex items-center gap-2 sm:gap-3 px-2 sm:px-4 lg:px-5 bg-card/85 backdrop-blur-xl backdrop-saturate-150 border-b border-border"
      style={{ height: TOPBAR_H, top: topOffset }}
    >
      <Tooltip delayDuration={400}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={isDesktop ? toggleMenu : toggleMobile}
            aria-label={toggleLabel}
            aria-expanded={isVisibleToAT}
            aria-controls="app-sidebar"
            className={cn(TOPBAR_ICON_BTN, "-ml-0.5")}
          >
            <ToggleIcon className="w-5 h-5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>{toggleLabel}{isDesktop ? ` (${combo("\\")})` : ""}</TooltipContent>
      </Tooltip>

      {showBrand && (
        <div className="flex items-center gap-2 shrink-0">
          <span className="flex items-center justify-center w-8 h-8 rounded-lg overflow-hidden bg-brand-soft ring-1 ring-inset ring-primary/10">
            <img src={logoImg} alt="Norte" className="w-5 h-5 object-contain" />
          </span>
          {/* No celular fica só o logotipo (25/09): com "Norte" escrito, o nome
              da tela na trilha sobrava em "E." */}
          <span className="hidden sm:inline text-sm font-bold text-primary tracking-tight">Norte</span>
          <span aria-hidden="true" className="hidden sm:block w-px h-5 bg-border ml-1" />
        </div>
      )}

      <nav aria-label="Onde você está" className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
        {crumb && (
          <>
            {/* Mesma cor do item ativo no menu. */}
            <span className="hidden sm:flex items-center justify-center w-7 h-7 shrink-0 rounded-md bg-brand-soft text-primary">
              <crumb.icon className="w-4 h-4" aria-hidden="true" />
            </span>
            <ol className="flex items-center gap-1 min-w-0 m-0 p-0 list-none">
              {crumb.trail.map((t) => (
                <li key={t} className="hidden md:flex items-center gap-1 shrink-0 text-[13px] text-muted-foreground">
                  {t}
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300" aria-hidden="true" />
                </li>
              ))}
              <li aria-current="page" className="min-w-0 truncate text-sm font-semibold text-foreground">{crumb.label}</li>
            </ol>
          </>
        )}
      </nav>

      {/* Busca ⌘K — campo de verdade no desktop, ícone abaixo de lg */}
      <Tooltip delayDuration={600}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onOpenPalette}
            aria-label={buscaLabel}
            className={cn(
              "hidden lg:flex items-center gap-2 h-9 shrink-0 pl-3 pr-1.5 rounded-lg border border-border bg-surface-muted text-muted-foreground cursor-pointer",
              "w-[200px] xl:w-[300px] transition-[border-color,background-color,box-shadow] duration-150",
              "hover:border-primary/30 hover:bg-card hover:shadow-1",
              "outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            )}
          >
            <Search className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 min-w-0 text-left text-[13px] truncate">
              <span className="xl:hidden">Buscar…</span>
              <span className="hidden xl:inline">Buscar tela ou evento</span>
            </span>
            <Keys parts={teclas("K")} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>{buscaLabel}</TooltipContent>
      </Tooltip>

      <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
        <Tooltip delayDuration={400}>
          <TooltipTrigger asChild>
            <button type="button" onClick={onOpenPalette} aria-label={buscaLabel} className={cn(TOPBAR_ICON_BTN, "lg:hidden")}>
              <Search className="w-[19px] h-[19px]" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>{buscaLabel}</TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={400}>
          <TooltipTrigger asChild>
            <button type="button" onClick={onOpenShortcuts} aria-label="Ajuda e atalhos do teclado" className={cn(TOPBAR_ICON_BTN, "hidden sm:flex")}>
              <CircleHelp className="w-[19px] h-[19px]" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>Ajuda e atalhos do teclado ({combo("/")})</TooltipContent>
        </Tooltip>

        <NotificationsMenu />
        <div aria-hidden="true" className="hidden sm:block w-px h-6 bg-border mx-1.5" />
        <UserMenu onOpenShortcuts={onOpenShortcuts} />
      </div>
    </header>
  );
}
