/**
 * Barra da Sugestão de escala (07/10 — redesenho premium).
 *
 * A mesma barra de 56px grudada no topo da Validação e da Aprovação: título,
 * os passos do módulo e, à direita, o ESTADO DO RASCUNHO — a única coisa que
 * muda sozinha nesta tela (o auto-save grava 1,5 s depois da última edição).
 * Antes o título abria a página com um parágrafo de duas linhas e os passos
 * embaixo, e tudo sumia ao rolar a grade; o "rascunho salvo" morava na barra de
 * envio, misturado com a contagem de vagas.
 */
import { Check, EyeOff, ListPlus, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ScalingModuleNav } from "@/components/scaling-validation/scaling-module-nav";

export interface SuggestionHeaderProps {
  eventId: string;
  readOnly: boolean;
  /** Envio em andamento (POST /bulk). */
  sending: boolean;
  /** Há o que guardar no rascunho deste evento (linhas ou recado editado). */
  hasContent: boolean;
  /** "HH:MM" da última gravação do rascunho; null = ainda não gravou nesta sessão. */
  draftSavedAt: string | null;
}

export function SuggestionHeader({ eventId, readOnly, sending, hasContent, draftSavedAt }: SuggestionHeaderProps) {
  return (
    <header className="sticky top-[var(--sticky-top)] z-30 -mx-[var(--page-gutter)] -mt-[var(--page-gutter)] grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-border bg-card px-[var(--page-gutter)] py-2 xl:flex xl:h-14 xl:gap-x-4 xl:py-0">
      <h1 className="flex min-w-0 items-center gap-2 text-base font-semibold tracking-[-0.01em] text-foreground">
        <ListPlus className="h-[18px] w-[18px] shrink-0 text-primary" aria-hidden="true" />
        <span className="truncate">Sugestão de escala</span>
      </h1>
      <div className="order-last col-span-2 min-w-0 xl:order-none">
        <ScalingModuleNav current="suggestion" eventId={eventId} />
      </div>
      <div className="flex justify-end xl:ml-auto">
        <EstadoDoRascunho eventId={eventId} readOnly={readOnly} sending={sending} hasContent={hasContent} draftSavedAt={draftSavedAt} />
      </div>
    </header>
  );
}

/**
 * Selo do rascunho: "Salvo 16:38" (verde), "Enviando…" ou "Modo leitura".
 * Sem evento ou sem nada na grade, não há rascunho — o selo nem aparece.
 */
function EstadoDoRascunho({ eventId, readOnly, sending, hasContent, draftSavedAt }: SuggestionHeaderProps) {
  const base = "sug-selo inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium";
  if (readOnly) {
    return (
      <span className={cn(base, "border-border bg-surface-muted text-slate-600")} data-testid="sug-selo-leitura">
        <EyeOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Modo leitura
      </span>
    );
  }
  if (sending) {
    return (
      <span className={cn(base, "border-primary/25 bg-brand-soft text-primary")} role="status">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Enviando…
      </span>
    );
  }
  if (!eventId || !hasContent) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          // A chave muda a cada gravação: o selo "acende" de novo (sug-salvo).
          key={draftSavedAt ?? "pendente"}
          className={cn(base, "cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            draftSavedAt ? "sug-salvo border-success/25 bg-success-soft text-success" : "border-border bg-card text-muted-foreground")}
          data-testid="sug-selo-rascunho"
        >
          {draftSavedAt ? (
            <>
              <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Rascunho salvo <span className="tabular-nums">{draftSavedAt}</span></span>
            </>
          ) : (
            <>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" aria-hidden="true" />
              Rascunho neste navegador
            </>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end" className="max-w-[260px] text-xs">
        A grade é salva sozinha neste navegador, separada por evento, e vale por 7 dias. Nada vai para as áreas antes de você enviar.
      </TooltipContent>
    </Tooltip>
  );
}
