import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  /**
   * `default`: ícone + título (18px) + subtítulo + ações — telas de cadastro e
   * relatórios. `bar`: a barra de contexto de 56px que Passagens/Escalação usam,
   * fixa abaixo da barra do topo (`--sticky-top`), sangrando até as margens da
   * página (`--page-gutter`) — telas com grade larga ou seletor de evento.
   * Unificado em 23/09: a auditoria achou 6 padrões de cabeçalho.
   */
  variant?: "default" | "bar";
  /** Ícone lucide exibido no quadrado `bg-brand-soft text-primary` (só `default`). */
  icon?: LucideIcon;
  /** Título (h1) — deve bater com o label do item no sidebar, em caixa de frase. */
  title: React.ReactNode;
  /** Subtítulo curto (≤ 90 caracteres): o que a tela mostra, não um manual. */
  subtitle?: React.ReactNode;
  /** Slot de ações à direita (botões). Quebra linha em telas estreitas. */
  actions?: React.ReactNode;
  /** Contexto da tela (ex.: seletor de evento, navegação de mês). Fica junto do título. */
  context?: React.ReactNode;
  /** Abas/segmentos da tela. Na `bar` vão para a direita, antes das ações. */
  tabs?: React.ReactNode;
  className?: string;
}

/**
 * Cabeçalho padrão de página. Usa apenas tokens (sem hex).
 */
export function PageHeader({ variant = "default", icon: Icon, title, subtitle, actions, context, tabs, className }: PageHeaderProps) {
  if (variant === "bar") {
    return (
      <header
        className={cn(
          // Mesmo padrão de pages/tickets.tsx: margens pela variável do layout
          // (`-mx-6` fixo estourava em 375px) e `top` abaixo da barra do topo.
          "sticky top-[var(--sticky-top)] z-30 -mx-[var(--page-gutter)] -mt-[var(--page-gutter)] px-[var(--page-gutter)]",
          "flex flex-wrap items-center gap-x-4 gap-y-2 min-h-14 py-2 bg-card border-b border-border",
          className,
        )}
      >
        <h1 className="text-base font-semibold text-foreground whitespace-nowrap">{title}</h1>
        {subtitle && (
          <>
            <span aria-hidden="true" className="w-px h-5 bg-border shrink-0" />
            <p className="min-w-0 text-xs text-muted-foreground truncate" aria-live="polite">{subtitle}</p>
          </>
        )}
        {context && <div className="flex flex-wrap items-center gap-x-4 gap-y-2 min-w-0">{context}</div>}
        {(tabs || actions) && (
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:ml-auto">
            {tabs}
            {actions}
          </div>
        )}
      </header>
    );
  }

  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="flex flex-wrap items-center gap-3 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          {Icon && (
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-soft text-primary shrink-0">
              <Icon className="w-4 h-4" aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight text-foreground truncate">{title}</h1>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {context && <div className="flex flex-wrap items-center gap-2 min-w-0">{context}</div>}
      </div>
      {(tabs || actions) && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {tabs}
          {actions}
        </div>
      )}
    </header>
  );
}

export default PageHeader;
