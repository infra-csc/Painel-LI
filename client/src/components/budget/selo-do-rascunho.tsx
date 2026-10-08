/**
 * Selo do rascunho do Planejado (08/10) — a mesma linguagem do selo da
 * Sugestão de escala ("Rascunho salvo 17:20", verde, que acende a cada
 * gravação). O rascunho agora mora no servidor: o selo diz se o que está na
 * tela já foi gravado, se está gravando ou se ficou só neste navegador
 * (servidor fora). Sem ajuste nenhum não há rascunho — o selo nem aparece.
 */
import { Check, CloudOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { DraftStatus } from "@/hooks/use-budget-draft";

export const TEXTO_RASCUNHO_LOCAL = "Rascunho salvo só neste navegador — sem conexão com o servidor";

export function SeloDoRascunho({ status, savedAt, temAjuste, className }: {
  status: DraftStatus;
  savedAt: string | null;
  /** Há ajuste no rascunho (sem ajuste, não há o que mostrar). */
  temAjuste: boolean;
  className?: string;
}) {
  if (!temAjuste || status === "carregando") return null;
  const base = "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  let conteudo;
  let ajuda: string;
  if (status === "local") {
    conteudo = (
      <span tabIndex={0} className={cn(base, "border-warning/25 bg-warning-soft text-warning", className)} data-testid="planejado-selo-rascunho" data-status="local">
        <CloudOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Só neste navegador
      </span>
    );
    ajuda = `${TEXTO_RASCUNHO_LOCAL}. Os ajustes continuam aqui e sobem sozinhos na próxima gravação que der certo.`;
  } else if (status === "salvando" || !savedAt) {
    conteudo = (
      <span tabIndex={0} className={cn(base, "border-border bg-card text-muted-foreground", className)} data-testid="planejado-selo-rascunho" data-status="salvando">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" aria-hidden="true" />
        Salvando rascunho…
      </span>
    );
    ajuda = "Os ajustes estão sendo gravados no rascunho — ele fica salvo e aparece em qualquer computador.";
  } else {
    conteudo = (
      <span
        tabIndex={0}
        // A chave muda a cada gravação: o selo "acende" de novo (pla-salvo).
        key={savedAt}
        className={cn(base, "pla-salvo border-success/25 bg-success-soft text-success", className)}
        data-testid="planejado-selo-rascunho"
        data-status="salvo"
      >
        <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>Rascunho salvo <span className="tabular-nums">{savedAt}</span></span>
      </span>
    );
    ajuda = "O rascunho fica salvo e aparece em qualquer computador em que você entrar. Os ajustes só valem quando forem enviados ao Realizado.";
  }

  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>{conteudo}</TooltipTrigger>
        <TooltipContent side="bottom" align="end" className="max-w-[280px] text-xs">{ajuda}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default SeloDoRascunho;
