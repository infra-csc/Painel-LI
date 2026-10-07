/**
 * CARREGAMENTOS DA CASCA (07/10).
 *
 * • `TelaDeCarregamento`: enquanto a sessão é conferida (/api/auth/me) e
 *   enquanto uma rota pública baixa. Antes era a palavra "Carregando…" pulsando
 *   no meio de uma tela vazia — parecia travado. Agora: a marca, uma barra fina
 *   indeterminada e o texto para o leitor de tela.
 * • `CarregandoPagina`: dentro do MainLayout, enquanto o código da tela chega.
 *   Esqueleto com a mesma geometria do PageHeader (ícone + título + subtítulo),
 *   então a troca para a tela real não "pula".
 */
import { Skeleton } from "@/components/ui/skeleton";
import { MarcaNorte } from "./auth-layout";

export function TelaDeCarregamento({ texto = "Carregando o painel…" }: { texto?: string }) {
  return (
    <div role="status" aria-live="polite" className="min-h-dvh flex flex-col items-center justify-center gap-5 bg-background">
      <MarcaNorte tamanho={44} />
      <div className="casca-progresso w-28 h-[3px] rounded-full" aria-hidden="true" />
      <span className="text-xs text-muted-foreground">{texto}</span>
    </div>
  );
}

export function CarregandoPagina() {
  return (
    <div role="status" aria-live="polite" className="space-y-5">
      <span className="sr-only">Carregando a tela…</span>
      <div className="flex items-center gap-3" aria-hidden="true">
        <Skeleton className="w-8 h-8 rounded-lg bg-border/60" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-44 bg-border/60" />
          <Skeleton className="h-3 w-72 max-w-[60vw] bg-border/50" />
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden" aria-hidden="true">
        <div className="h-11 border-b border-border bg-surface-muted" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 h-14 border-b border-border last:border-b-0">
            <Skeleton className="h-3 w-10 bg-border/60" />
            <Skeleton className={i % 2 ? "h-3 w-1/3 bg-border/60" : "h-3 w-2/5 bg-border/60"} />
            <Skeleton className="h-3 w-24 ml-auto bg-border/50" />
          </div>
        ))}
      </div>
    </div>
  );
}
