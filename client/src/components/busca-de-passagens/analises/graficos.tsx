/**
 * Gráficos das abas de análise da Busca (etapa 2, 09/10), feitos sem
 * biblioteca e na linguagem da aba Análises de Passagens:
 *  - `LinhaDeIndice`: rótulo · barra DIVERGENTE (abaixo do típico à esquerda,
 *    acima à direita, a partir do centro) · % · média · quantidade. Cor com
 *    significado: verde = mais barato que o típico, vermelho = mais caro;
 *    os extremos ganham cor cheia e dizem em texto o que são;
 *  - `Serie`: a linha do menor preço visto por dia de consulta (SVG, com o
 *    menor e o último marcados);
 *  - `Realce`: destaca trechos de uma frase (o mais barato / o mais caro).
 */
import { Fragment, useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { GrupoDePreco } from "@shared/analise-da-busca";
import { moeda, plural } from "@/components/tickets/analises/formato";

export function BarraDivergente({ pct, escala, destaque, comparavel }: { pct: number | null; escala: number; destaque: GrupoDePreco["destaque"]; comparavel: boolean }) {
  const largura = pct === null || escala <= 0 ? 0 : Math.min(50, (Math.abs(pct) / escala) * 50);
  const lado = (pct ?? 0) < 0 ? "esq" : "dir";
  const cor = !comparavel ? "bg-slate-300"
    : destaque === "barato" ? "bg-success-strong"
    : destaque === "caro" ? "bg-danger-strong"
    : lado === "esq" ? "bg-success-strong/45" : "bg-danger-strong/45";
  return (
    <span aria-hidden="true" className="bpa-divergente">
      <span className={cn("bpa-divergente-barra", cor)} style={lado === "esq" ? { right: "50%", width: `${largura}%` } : { left: "50%", width: `${largura}%` }} />
    </span>
  );
}

/** Uma faixa / dia / período: "% contra o típico" é o número principal. */
export function LinhaDeIndice({ g, escala, unidade = "consulta", testid }: { g: GrupoDePreco; escala: number; unidade?: "consulta" | "passagem" | "opção"; testid?: string }) {
  const plurais = { consulta: "consultas", passagem: "passagens", "opção": "opções" } as const;
  const tom = g.destaque === "caro" ? "text-danger" : g.destaque === "barato" ? "text-success" : g.comparavel ? "text-foreground" : "text-muted-foreground";
  return (
    <li className="bpa-linha-indice" data-testid={testid} data-destaque={g.destaque ?? undefined}>
      <span className={cn("truncate text-[13px]", g.destaque ? `font-semibold ${tom}` : "text-slate-700")}>
        <span className="sm:hidden">{g.curto}</span><span className="hidden sm:inline">{g.rotulo}</span>
      </span>
      <BarraDivergente pct={g.pct} escala={escala} destaque={g.destaque} comparavel={g.comparavel} />
      <span className={cn("text-right text-[13px] font-semibold tabular-nums", tom)}>
        {g.pct === null ? (g.n ? "—" : "") : `${g.pct > 0 ? "+" : g.pct < 0 ? "−" : ""}${Math.abs(g.pct)}%`}
        {g.destaque && <span className="sr-only"> ({g.destaque === "caro" ? "mais caro" : "mais barato"})</span>}
      </span>
      <span className="bpa-linha-indice-media text-right text-xs tabular-nums text-slate-600">{g.media === null ? "—" : moeda(g.media)}</span>
      <span className="bpa-linha-indice-n whitespace-nowrap text-right text-2xs tabular-nums text-muted-foreground">{g.n ? plural(g.n, unidade, plurais[unidade]) : "sem dado"}</span>
    </li>
  );
}

export function ListaDeIndice({ grupos, rotulo, unidade, testid }: { grupos: GrupoDePreco[]; rotulo: string; unidade?: "consulta" | "passagem" | "opção"; testid?: string }) {
  const escala = Math.max(10, ...grupos.map((g) => Math.abs(g.pct ?? 0)));
  return (
    <>
      <div className="bpa-linha-indice bpa-linha-indice-cabeca" aria-hidden="true">
        <span />
        <span className="text-center text-2xs text-muted-foreground" title="À esquerda do centro, mais barato que o típico da rota; à direita, mais caro">típico</span>
        <span className="text-right text-2xs text-muted-foreground">vs típico</span>
        <span className="bpa-linha-indice-media text-right text-2xs text-muted-foreground">média</span>
        <span className="bpa-linha-indice-n" />
      </div>
      <ul className="m-0 list-none p-0" aria-label={rotulo} data-testid={testid}>
        {grupos.map((g) => <LinhaDeIndice key={g.chave} g={g} escala={escala} unidade={unidade} testid={testid ? `${testid}-${g.chave}` : undefined} />)}
      </ul>
    </>
  );
}

/** Legenda das cores (uma vez, embaixo). */
export function LegendaDoIndice({ minimo, mostrarFraco }: { minimo: number; mostrarFraco: boolean }) {
  return (
    <p className="m-0 mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-2xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-sm bg-success-strong" />mais barato</span>
      <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-sm bg-danger-strong" />mais caro</span>
      {mostrarFraco && <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-sm bg-slate-300" />menos de {minimo} preços, fica fora da comparação</span>}
    </p>
  );
}

/** Série do menor preço por dia de consulta (SVG responsivo). */
export function Serie({ pontos, altura = 56, rotulo }: { pontos: Array<{ dia: string; menor: number }>; altura?: number; rotulo: string }) {
  const id = useId();
  if (pontos.length < 2) {
    return <p className="m-0 text-2xs text-muted-foreground">{pontos.length === 1 ? "Uma consulta só — a linha aparece a partir da segunda." : "Sem consultas."}</p>;
  }
  const L = 300;
  const max = Math.max(...pontos.map((p) => p.menor)), min = Math.min(...pontos.map((p) => p.menor));
  const faixa = max - min || 1;
  const x = (i: number) => (i / (pontos.length - 1)) * (L - 8) + 4;
  const y = (v: number) => altura - 6 - ((v - min) / faixa) * (altura - 14);
  const d = pontos.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.menor).toFixed(1)}`).join(" ");
  const iMin = pontos.findIndex((p) => p.menor === min);
  const ult = pontos.length - 1;
  return (
    <svg viewBox={`0 0 ${L} ${altura}`} preserveAspectRatio="none" className="bpa-serie" role="img" aria-labelledby={id}>
      <title id={id}>{rotulo}</title>
      <path d={`${d} L${x(ult).toFixed(1)},${altura} L${x(0).toFixed(1)},${altura} Z`} className="bpa-serie-area" />
      <path d={d} className="bpa-serie-linha" vectorEffect="non-scaling-stroke" />
      <circle cx={x(iMin)} cy={y(min)} r={3} className="bpa-serie-menor" vectorEffect="non-scaling-stroke" />
      <circle cx={x(ult)} cy={y(pontos[ult].menor)} r={3} className="bpa-serie-ultimo" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Destaca trechos de uma frase: [["31 a 60 dias", "text-success"], …]. */
export function Realce({ texto, trechos }: { texto: string; trechos: Array<[string, string]> }) {
  const validos = trechos.filter(([t]) => t && texto.toLowerCase().includes(t.toLowerCase()));
  if (validos.length === 0) return <>{texto}</>;
  const re = new RegExp(`(${validos.map(([t]) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  const partes: ReactNode[] = texto.split(re).map((p, i) => {
    const achado = validos.find(([t]) => t.toLowerCase() === p.toLowerCase());
    return achado ? <strong key={i} className={cn("font-semibold", achado[1])}>{p}</strong> : <Fragment key={i}>{p}</Fragment>;
  });
  return <>{partes}</>;
}
