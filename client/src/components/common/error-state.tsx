import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title: string;
  description?: string | null;
  /** Se informado, mostra o botão "Tentar novamente". */
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

/** Bloco de erro de carregamento (título + explicação + retry opcional). */
export function ErrorState({ title, description, onRetry, retryLabel = "Tentar novamente", className }: ErrorStateProps) {
  return (
    <div role="alert" className={cn("rounded-2xl border border-red-200 bg-white p-6 text-center", className)}>
      <AlertCircle className="w-5 h-5 text-red-500 mx-auto mb-2" aria-hidden="true" />
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {description && <p className="text-xs text-slate-500 mt-1">{description}</p>}
      {onRetry && (
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>{retryLabel}</Button>
      )}
    </div>
  );
}

export default ErrorState;
