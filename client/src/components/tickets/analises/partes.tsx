/**
 * Peças da aba Análises de passagens — a mesma anatomia da aba Análises da
 * Escalação (scaling-analytics.tsx): cartão com cabeçalho de título +
 * pergunta, faixa de números com filete de 1px entre as células, barras
 * finas desenhadas em escala (largura proporcional ao maior valor).
 *
 * Cor só com significado: vermelho = mais caro, verde = mais barato, azul
 * claro = o resto, cinza = poucos dados (não entra na comparação).
 */
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Destaque } from "@shared/analise-de-passagens";

export function Painel({ titulo, pergunta, acao, resposta, rodape, children, testid, className, corpoRente }: {
  titulo: string;
  /** A pergunta que o painel responde — em texto de gente. */
  pergunta: string;
  /** Controle à direita do título (ex.: Ida | Volta). */
  acao?: ReactNode;
  /** A resposta em uma frase, antes do gráfico. */
  resposta?: ReactNode;
  rodape?: ReactNode;
  children: ReactNode;
  testid?: string;
  className?: string;
  /** Corpo sem recuo lateral — para listas cujas linhas vão de borda a borda. */
  corpoRente?: boolean;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn("flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card", className)} data-testid={testid}>
      <header className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1 basis-[220px]">
          <h2 id={id} className="m-0 text-sm font-semibold text-foreground">{titulo}</h2>
          <p className="m-0 mt-0.5 text-xs text-muted-foreground">{pergunta}</p>
        </div>
        {acao}
      </header>
      {resposta && <div className="px-4 pt-3 text-[13px] leading-5 text-slate-700" data-testid={testid ? `${testid}-resposta` : undefined}>{resposta}</div>}
      <div className={cn("flex-1 pb-4 pt-3", !corpoRente && "px-4")}>{children}</div>
      {rodape && (
        <footer className="border-t border-border bg-surface-muted px-4 py-2.5 text-2xs leading-4 text-muted-foreground">{rodape}</footer>
      )}
    </section>
  );
}

/** Seletor de 2–3 opções, o mesmo "Quadro | Barras" da Escalação. */
export function Segmentado<T extends string>({ valor, opcoes, onChange, rotulo, testid }: {
  valor: T;
  opcoes: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
  rotulo: string;
  testid: string;
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="inline-flex shrink-0 rounded-lg border border-border bg-background p-0.5">
      {opcoes.map(([k, nome]) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={valor === k}
          onClick={() => onChange(k)}
          className={cn(
            "h-7 rounded-md px-2.5 text-xs font-medium transition-[color,background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            valor === k ? "bg-card text-primary shadow-1" : "text-muted-foreground hover:text-foreground",
          )}
          data-testid={`${testid}-${k}`}
        >
          {nome}
        </button>
      ))}
    </div>
  );
}

const COR_DA_BARRA: Record<"normal" | "caro" | "barato" | "fraco", string> = {
  normal: "bg-primary/30",
  caro: "bg-danger-strong",
  barato: "bg-success-strong",
  fraco: "bg-slate-300",
};

/** Trilho + preenchimento. A largura anima ao trocar de filtro (sem biblioteca). */
export function Barra({ pct, tom = "normal", className }: { pct: number; tom?: keyof typeof COR_DA_BARRA; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("block h-2 min-w-0 overflow-hidden rounded-full bg-muted", className)}>
      <span
        className={cn("block h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none", COR_DA_BARRA[tom])}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

export const tomDoDestaque = (d: Destaque, comparavel: boolean) =>
  d === "caro" ? "caro" as const : d === "barato" ? "barato" as const : comparavel ? "normal" as const : "fraco" as const;

/**
 * Uma linha "rótulo · barra · valor · quantidade" (dia da semana, faixa de
 * antecedência, mês). O destaque pinta barra e valor e diz em texto o que é —
 * cor nunca é o único sinal.
 */
export function LinhaDeBarra({ rotulo, rotuloCurto, pct, valor, quantidade, destaque = null, comparavel = true, testid, title }: {
  rotulo: string;
  rotuloCurto?: string;
  pct: number;
  valor: string;
  quantidade: string;
  destaque?: Destaque;
  comparavel?: boolean;
  testid?: string;
  title?: string;
}) {
  const tom = tomDoDestaque(destaque, comparavel);
  return (
    <li
      className="grid grid-cols-[minmax(64px,auto)_minmax(0,1fr)_auto] items-center gap-x-3 py-[5px] sm:grid-cols-[112px_minmax(0,1fr)_76px_86px]"
      data-testid={testid}
      data-destaque={destaque ?? undefined}
      title={title}
    >
      <span className={cn("truncate text-[13px]", destaque === "caro" ? "font-semibold text-danger" : destaque === "barato" ? "font-semibold text-success" : "text-slate-700")}>
        {rotuloCurto ? (<><span className="sm:hidden">{rotuloCurto}</span><span className="hidden sm:inline">{rotulo}</span></>) : rotulo}
      </span>
      <Barra pct={pct} tom={tom} />
      <span className="text-right leading-tight">
        <span className={cn(
          "block text-[13px] font-semibold tabular-nums",
          destaque === "caro" ? "text-danger" : destaque === "barato" ? "text-success" : comparavel ? "text-foreground" : "text-muted-foreground",
        )}>
          {valor}
          {destaque && <span className="sr-only"> ({destaque === "caro" ? "mais caro" : "mais barato"})</span>}
        </span>
        {/* No celular a quantidade desce para baixo do valor. */}
        <span className="block text-2xs tabular-nums text-muted-foreground sm:hidden">{quantidade}</span>
      </span>
      <span className="hidden text-right text-2xs tabular-nums text-muted-foreground sm:block">{quantidade}</span>
    </li>
  );
}

/** Legenda das cores das barras — dita uma vez, embaixo do gráfico. */
export function LegendaDeDestaque({ minimo, mostrarFraco }: { minimo: number; mostrarFraco: boolean }) {
  return (
    <p className="m-0 mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-2xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-sm bg-danger-strong" />mais caro</span>
      <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-sm bg-success-strong" />mais barato</span>
      {mostrarFraco && (
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-sm bg-slate-300" />menos de {minimo} passagens, fica fora da comparação</span>
      )}
    </p>
  );
}

/** Célula da faixa de números do topo. */
export function Numero({ rotulo, valor, sub, tom, testid }: { rotulo: string; valor: string; sub: string; tom?: "alerta"; testid?: string }) {
  return (
    <div className="min-w-0 bg-card px-4 py-3.5" data-testid={testid}>
      <p className="m-0 truncate text-xs font-medium text-slate-600">{rotulo}</p>
      <p className={cn("m-0 mt-1.5 truncate text-2xl font-semibold leading-none tabular-nums tracking-[-0.02em]", tom === "alerta" ? "text-warning" : "text-foreground")}>{valor}</p>
      <p className="m-0 mt-1.5 line-clamp-2 text-xs leading-4 text-muted-foreground">{sub}</p>
    </div>
  );
}
