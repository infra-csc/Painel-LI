/**
 * Painéis (30/10) — peças visuais comuns às telas de painel: o cartão de cada
 * bloco, a pílula do prazo, o "atualizado há X" com o botão de atualizar e o
 * esqueleto. Só tokens (CSS vars são cores completas — nunca `hsl(var(--x))`).
 */
import type { ReactNode } from "react";
import { Link } from "wouter";
import { ArrowRight, RefreshCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { SituacaoDeAlerta } from "./paineis-dados";
import { textoAtualizado } from "./paineis-dados";
import { useAgora } from "./use-base-dos-paineis";

export type TomDoCartao = "danger" | "warning" | "primary" | "neutral" | "success";

const TOM_DO_ICONE: Record<TomDoCartao, string> = {
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  primary: "bg-brand-soft text-primary",
  neutral: "bg-muted text-muted-foreground",
  success: "bg-success-soft text-success",
};

/** Cartão de um bloco: ícone + título + subtítulo, contagem à direita e o corpo. */
export function CartaoDoPainel({ id, icone: Icone, tom = "primary", titulo, subtitulo, contagem, acao, children, className, testId }: {
  id?: string;
  icone: LucideIcon;
  tom?: TomDoCartao;
  titulo: string;
  subtitulo?: ReactNode;
  /** O número grande do bloco ("12 vagas"). */
  contagem?: ReactNode;
  /** Link no rodapé do cabeçalho (ex.: "Ver no Painel de passagens"). */
  acao?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-titulo` : undefined}
      className={cn("flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card scroll-mt-24", className)}
      data-testid={testId}
    >
      <header className="flex items-start gap-3 border-b border-border px-4 py-3">
        <span aria-hidden="true" className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", TOM_DO_ICONE[tom])}>
          <Icone className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={id ? `${id}-titulo` : undefined} className="text-sm font-semibold text-foreground">{titulo}</h2>
          {subtitulo && <p className="mt-0.5 text-xs text-muted-foreground">{subtitulo}</p>}
        </div>
        {contagem !== undefined && <div className="shrink-0 text-right">{contagem}</div>}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {acao && <div className="mt-auto border-t border-border bg-surface-muted/40 px-4 py-2">{acao}</div>}
    </section>
  );
}

/** "7 dias de atraso" (vermelho) / "vence em 2 dias" (âmbar). */
export function PilulaDoPrazo({ situacao, children, className }: { situacao: SituacaoDeAlerta; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-semibold tabular-nums",
        situacao === "atrasado" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Link de rodapé de bloco: "Abrir Passagens →". */
export function LinkDoRodape({ href, children, testId }: { href: string; children: ReactNode; testId?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-xs font-medium text-primary no-underline hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded"
      data-testid={testId}
    >
      {children}
      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );
}

/** "atualizado há 2 min" + botão Atualizar (gira enquanto busca). */
export function AtualizadoHa({ em, recarregando, onAtualizar, testId = "button-atualizar-painel" }: {
  em: number | null; recarregando: boolean; onAtualizar: () => void; testId?: string;
}) {
  const agora = useAgora();
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite" data-testid="texto-atualizado">
        {recarregando ? "atualizando…" : textoAtualizado(em, agora)}
      </span>
      <button
        type="button"
        onClick={onAtualizar}
        disabled={recarregando}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground hover:border-primary hover:text-primary disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        data-testid={testId}
      >
        <RefreshCw className={cn("h-3.5 w-3.5", recarregando && "animate-spin")} aria-hidden="true" />
        Atualizar
      </button>
    </div>
  );
}

/** Esqueleto de um cartão com N linhas. */
export function EsqueletoDoCartao({ linhas = 4 }: { linhas?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card" aria-hidden="true">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-40" /><Skeleton className="h-3 w-56 max-w-full" /></div>
      </div>
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
          <Skeleton className="h-3.5 flex-1" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Mensagem curta dentro de um bloco (vazio bom, indisponível…). */
export function AvisoDoBloco({ tom = "success", children, testId }: { tom?: "success" | "neutral"; children: ReactNode; testId?: string }) {
  return (
    <p className={cn("px-4 py-6 text-center text-sm", tom === "success" ? "text-success" : "text-muted-foreground")} data-testid={testId}>
      {children}
    </p>
  );
}
