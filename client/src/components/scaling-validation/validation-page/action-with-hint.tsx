/**
 * Peças pequenas da Validação (25/09 — extraídas da página): botão com dica que
 * funciona no teclado e o esqueleto com a forma da tela.
 */
import type { ReactElement, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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

/** Larguras das "colunas" de cada osso — variam de linha a linha, como o texto real. */
const OSSOS = [
  ["58%", "70%", "64%"], ["72%", "52%", "48%"], ["50%", "66%", "70%"], ["66%", "44%", "58%"],
  ["62%", "60%", "52%"], ["54%", "48%", "66%"],
];

/**
 * Esqueleto da tela (04/09) com a MESMA forma do que vai aparecer — faixa de
 * resumo, abas, barra de filtros e linhas — para o conteúdo não "pular" quando
 * os dados chegam. 07/10: refeito na forma nova (faixa única, linhas com as
 * colunas da tabela; cartões abaixo de xl) e com brilho que passa (`val-osso`)
 * em vez de blocos piscando.
 */
export function ValidationSkeleton({ label }: { label: string }) {
  // Só as partes decorativas ficam `aria-hidden`: o `role="status"` no fim é
  // quem anuncia o carregamento ao leitor de tela.
  return (
    <div className="space-y-5" aria-busy="true" data-testid="esqueleto-validacao">
      <div className="space-y-2" aria-hidden="true">
        <div className="val-osso h-3.5 w-40" />
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={cn("space-y-2 bg-card px-4 py-3", i === 4 && "col-span-2 sm:col-span-4 xl:col-span-1")}>
              <div className="val-osso h-3 w-24" />
              <div className="val-osso h-6 w-10" />
              <div className="val-osso h-2.5 w-4/5" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3" aria-hidden="true">
        <div className="val-osso h-[34px] w-[240px] rounded-lg" />
        <div className="flex flex-wrap items-center gap-2">
          <div className="val-osso h-9 w-full rounded-lg sm:w-[340px]" />
          <div className="val-osso h-9 w-[210px] rounded-lg" />
          <div className="val-osso hidden h-9 w-[170px] rounded-lg sm:block" />
        </div>
        <div className="hidden overflow-hidden rounded-xl border border-border bg-card xl:block">
          <div className="h-10 border-b border-border bg-surface-muted" />
          {OSSOS.map(([a, b, c], i) => (
            <div key={i} className="flex h-[68px] items-start gap-4 border-b border-border px-4 pt-3.5 last:border-b-0">
              <div className="val-osso h-4 w-4 shrink-0 rounded" />
              <div className="min-w-0 flex-[1.3] space-y-1.5"><div className="val-osso h-3.5" style={{ width: a }} /><div className="val-osso h-2.5 w-2/5" /></div>
              <div className="w-[130px] space-y-1.5"><div className="val-osso h-3" style={{ width: b }} /><div className="val-osso h-2.5 w-14" /></div>
              <div className="flex flex-1 gap-1.5"><div className="val-osso h-5 w-20" /><div className="val-osso h-5 w-20" /></div>
              <div className="w-[230px]"><div className="val-osso h-5 rounded-full" style={{ width: c }} /></div>
              <div className="val-osso h-8 w-[84px] rounded-lg" />
            </div>
          ))}
        </div>
        <div className="grid gap-2.5 md:grid-cols-2 xl:hidden">
          {OSSOS.slice(0, 4).map(([a, b], i) => (
            <div key={i} className="space-y-2.5 rounded-xl border border-border bg-card p-4">
              <div className="val-osso h-4" style={{ width: a }} />
              <div className="val-osso h-2.5 w-1/3" />
              <div className="val-osso h-3" style={{ width: b }} />
              <div className="flex gap-1.5"><div className="val-osso h-5 w-20" /><div className="val-osso h-5 w-16" /></div>
            </div>
          ))}
        </div>
      </div>
      <p role="status" aria-live="polite" className="sr-only">{label}</p>
    </div>
  );
}
