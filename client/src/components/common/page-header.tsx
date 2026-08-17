import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  /** Ícone lucide exibido no quadrado `bg-brand-soft text-primary`. */
  icon?: LucideIcon;
  /** Título (h1) — deve bater com o label do item no sidebar. */
  title: React.ReactNode;
  /** Subtítulo curto (text-xs, slate-500). */
  subtitle?: React.ReactNode;
  /** Slot de ações à direita (botões, filtros). Quebra linha em telas estreitas. */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Cabeçalho padrão de página: ícone + título + subtítulo + ações.
 * Usa apenas tokens (sem hex).
 */
export function PageHeader({ icon: Icon, title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-soft text-primary shrink-0">
            <Icon className="w-4 h-4" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-[18px] font-bold leading-tight text-foreground truncate">{title}</h1>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}

export default PageHeader;
