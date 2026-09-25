/**
 * Peças pequenas da Validação (25/09 — extraídas da página): botão com dica que
 * funciona no teclado e o esqueleto com a forma da tela.
 */
import type { ReactElement, ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LoadingState } from "@/components/common/loading-state";
import { cn } from "@/lib/utils";

/**
 * Botão com dica que também funciona no teclado.
 *
 * Botão HABILITADO: o gatilho é o PRÓPRIO botão — a dica aparece no hover e no
 * foco. Botão DESABILITADO: elemento desabilitado não emite hover/focus, então
 * o gatilho passa a ser um `<span tabIndex={0}>` em volta (o padrão do resto do
 * app). Sem dica, devolve o botão puro.
 */
export function ActionWithHint({ hint, disabled, side = "top", wrapClassName, children }: {
  hint?: ReactNode; disabled?: boolean; side?: "top" | "bottom";
  /** Classes do `<span>` que envolve o botão DESABILITADO (ex.: `flex-1` na barra empilhada do celular). */
  wrapClassName?: string; children: ReactElement;
}) {
  if (!hint) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {disabled ? <span tabIndex={0} className={cn("inline-flex", wrapClassName)}>{children}</span> : children}
      </TooltipTrigger>
      <TooltipContent side={side} className="text-xs">{hint}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Esqueleto da tela (04/09) com a MESMA forma do que vai aparecer — faixa de
 * resumo, barra de filtros e linhas — para o conteúdo não "pular" quando os
 * dados chegam. O `LoadingState` genérico (só linhas) fazia a página crescer
 * 200px de uma vez.
 */
export function ValidationSkeleton({ label }: { label: string }) {
  // Só as partes decorativas ficam `aria-hidden`: o `LoadingState` no fim é
  // quem anuncia o carregamento (role="status") ao leitor de tela.
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-border bg-card" aria-hidden="true">
        <div className="h-10 border-b border-border bg-surface-muted/60" />
        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[58px] rounded-xl" />)}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5" aria-hidden="true">
        <Skeleton className="h-9 min-w-[240px] flex-1 rounded-lg" />
        <Skeleton className="h-9 w-[180px] rounded-lg" />
        <Skeleton className="h-9 w-[160px] rounded-lg" />
      </div>
      <LoadingState count={5} className="rounded-xl" label={label} />
    </div>
  );
}
