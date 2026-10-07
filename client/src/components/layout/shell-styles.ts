/**
 * Classes repetidas da casca (07/10). Um lugar só para o anel de foco e o botão
 * de ícone do topo — antes cada componente tinha a sua variação (34px num,
 * 38px noutro, hover azul aqui e cinza ali).
 */
import { cn } from "@/lib/utils";

/** Anel de foco por teclado padrão da casca. */
export const FOCO = "outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

/** Botão de ícone da barra do topo: 36px, mesmo hover/foco em todos. */
export const TOPBAR_ICON_BTN = cn(
  "relative flex items-center justify-center w-9 h-9 shrink-0 rounded-lg border-0 bg-transparent text-slate-600 cursor-pointer",
  "transition-colors duration-150 hover:bg-muted hover:text-foreground active:bg-border/70",
  FOCO,
);

/** Superfície dos painéis que saem do topo (sino, usuário): mesma borda, raio e sombra. */
export const PAINEL_DO_TOPO = "p-0 rounded-xl border border-border bg-popover shadow-3 overflow-hidden";
