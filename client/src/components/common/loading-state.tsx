import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface LoadingStateProps {
  /** Quantidade de linhas (variant `rows`) ou cards (variant `cards`). Padrão: 5. */
  count?: number;
  /** `rows`: linhas de tabela/lista. `cards`: grade de cards. */
  variant?: "rows" | "cards";
  /** Texto para leitores de tela. */
  label?: string;
  className?: string;
}

/** Skeleton padrão de carregamento. Só tokens, sem hex. */
export function LoadingState({
  count = 5,
  variant = "rows",
  label = "Carregando…",
  className,
}: LoadingStateProps) {
  const items = Array.from({ length: count });

  if (variant === "cards") {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label={label}
        className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}
      >
        {items.map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-5/6" />
            <div className="flex gap-2 pt-1">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          </div>
        ))}
        <span className="sr-only">{label}</span>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn("rounded-xl border border-border bg-card divide-y divide-border", className)}
    >
      {items.map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export default LoadingState;
