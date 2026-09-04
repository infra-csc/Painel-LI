import type { LucideIcon } from "lucide-react";
import { Inbox, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  /** Ícone lucide. Padrão: Inbox (ou SearchX na variante `filtered`). */
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Ação opcional (ex.: botão "Novo evento"). */
  action?: React.ReactNode;
  /**
   * `filtered`: sem resultado por causa de filtros — mostra botão "Limpar filtros"
   * quando `onClearFilters` é informado.
   */
  variant?: "default" | "filtered";
  onClearFilters?: () => void;
  className?: string;
  /**
   * `role="status"` (região live) — padrão `true`. Passe `false` quando o vazio
   * mora DENTRO de uma área que já tem a própria região aria-live (ex.: a
   * contagem "N de M" das abas do Histórico): dois live regions anunciando ao
   * mesmo tempo se atropelam no leitor de tela.
   */
  live?: boolean;
}

/** Estado vazio padrão (lista sem itens / busca sem resultado). Só tokens, sem hex. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  variant = "default",
  onClearFilters,
  className,
  live = true,
}: EmptyStateProps) {
  const Icon = icon ?? (variant === "filtered" ? SearchX : Inbox);
  return (
    <div
      role={live ? "status" : undefined}
      className={cn(
        "flex flex-col items-center justify-center text-center rounded-xl border border-dashed border-border bg-card px-6 py-12",
        className,
      )}
    >
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted text-muted-foreground mb-3">
        <Icon className="w-6 h-6" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && (
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">{description}</p>
      )}
      {(action || (variant === "filtered" && onClearFilters)) && (
        <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
          {variant === "filtered" && onClearFilters && (
            <Button type="button" variant="outline" size="sm" onClick={onClearFilters}>
              Limpar filtros
            </Button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}

export default EmptyState;
