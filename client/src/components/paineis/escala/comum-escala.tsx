/**
 * Peças visuais do Painel da escala: o cartão de seção, o número do topo e a
 * barra horizontal. Tokens do app (CSS vars são cores COMPLETAS — nunca
 * `hsl(var(--x))`).
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Secao({ titulo, descricao, acoes, children, className, testId }: {
  titulo: string; descricao?: ReactNode; acoes?: ReactNode; children: ReactNode; className?: string; testId?: string;
}) {
  return (
    <section aria-label={titulo} className={cn("min-w-0 overflow-hidden rounded-xl border border-border bg-card", className)} data-testid={testId}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1 basis-[260px]">
          <h2 className="text-sm font-semibold text-foreground">{titulo}</h2>
          {descricao && <p className="mt-0.5 text-xs text-muted-foreground">{descricao}</p>}
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>
      {children}
    </section>
  );
}

/** Um número do topo. Clicável quando leva a uma aba. */
export function NumeroDoTopo({ rotulo, valor, sub, tom = "neutro", onClick, testId }: {
  rotulo: string; valor: string; sub: string; tom?: "neutro" | "perigo" | "alerta" | "ok"; onClick?: () => void; testId?: string;
}) {
  const cor = tom === "perigo" ? "text-danger" : tom === "alerta" ? "text-warning" : tom === "ok" ? "text-success" : "text-foreground";
  const conteudo = (
    <>
      <span className="block truncate text-xs font-medium text-slate-600">{rotulo}</span>
      <span className={cn("mt-1.5 block truncate text-2xl font-semibold leading-none tabular-nums tracking-[-0.02em]", cor)} data-testid={testId ? `${testId}-valor` : undefined}>{valor}</span>
      <span className="mt-1.5 block truncate text-xs text-muted-foreground" title={sub}>{sub}</span>
    </>
  );
  const cls = "min-w-0 bg-card px-4 py-3.5 text-left";
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, "hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring")} data-testid={testId}>
      {conteudo}
    </button>
  ) : <div className={cls} data-testid={testId}>{conteudo}</div>;
}

/** Abas segmentadas — o mesmo desenho do "Quadro | Barras" das Análises. */
export function Segmentos<K extends string>({ opcoes, valor, onChange, rotulo, testId }: {
  opcoes: readonly (readonly [K, string])[]; valor: K; onChange: (k: K) => void; rotulo: string; testId?: string;
}) {
  return (
    <div role="tablist" aria-label={rotulo} className="inline-flex max-w-full rounded-lg border border-border bg-background p-0.5" data-testid={testId}>
      {opcoes.map(([k, texto]) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={valor === k}
          onClick={() => onChange(k)}
          className={cn(
            "h-7 whitespace-nowrap rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            valor === k ? "bg-card text-primary shadow-1" : "text-muted-foreground hover:text-slate-700",
          )}
          data-testid={testId ? `${testId}-${k}` : undefined}
        >
          {texto}
        </button>
      ))}
    </div>
  );
}

/**
 * Barra horizontal fina com pontas arredondadas, ancorada à esquerda. Os
 * segmentos têm 2px de folga entre si. `max` é o maior valor do gráfico.
 */
export function Barra({ segmentos, max, altura = "h-2", rotulo }: {
  segmentos: { valor: number; cor: string; titulo: string }[]; max: number; altura?: string; rotulo: string;
}) {
  const visiveis = segmentos.filter((s) => s.valor > 0);
  return (
    <span className={cn("flex min-w-0 flex-1 gap-[2px]", altura)} role="img" aria-label={rotulo}>
      {visiveis.map((s, i) => (
        <span
          key={i}
          title={s.titulo}
          className={cn("block h-full", i === 0 && "rounded-l-full", i === visiveis.length - 1 && "rounded-r-full")}
          style={{ width: `${max > 0 ? (s.valor / max) * 100 : 0}%`, background: s.cor, minWidth: 3 }}
        />
      ))}
    </span>
  );
}

export const BOTAO_PEQUENO = "inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-primary no-underline hover:border-primary hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50";
