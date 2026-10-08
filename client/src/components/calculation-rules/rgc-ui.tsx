/**
 * Peças de apresentação das Regras de cálculo (redesenho 08/10): seção de
 * documentação com âncora, selo da fonte do valor, tabela de referência que
 * vira cartão em largura útil estreita, valor monetário que mostra quando foi
 * alterado nos Valores Padrão e a lista de regras. Só apresentação.
 */
import type { ReactNode } from "react";
import { Link } from "wouter";
import { Link2, Lock, SlidersHorizontal, BookOpen } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatarMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";

export const fmt = formatarMoeda;

// ── Selo: de onde vem o valor ────────────────────────────────────────────────
export type FonteDoValor = "editavel" | "fixo" | "referencia";

const FONTE: Record<FonteDoValor, { rotulo: string; dica: string; icone: typeof Lock }> = {
  editavel: { rotulo: "Editável nos Valores Padrão", dica: "O cálculo usa o valor configurado nos Valores Padrão; o que está aqui já é o vigente.", icone: SlidersHorizontal },
  fixo: { rotulo: "Fixo no sistema", dica: "Valor definido no código do cálculo — não há campo para editá-lo nos Valores Padrão.", icone: Lock },
  referencia: { rotulo: "Só referência", dica: "Tabela do slide para consulta — o cálculo automático do Planejado não soma este valor.", icone: BookOpen },
};

export function SeloDaFonte({ fonte }: { fonte: FonteDoValor }) {
  const f = FONTE[fonte];
  const Icone = f.icone;
  const conteudo = (
    <>
      <Icone className="w-3 h-3" aria-hidden="true" />
      {f.rotulo}
    </>
  );
  const classe = cn(
    "rgc-selo inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-2xs font-medium whitespace-nowrap",
    fonte === "editavel" && "bg-brand-soft text-primary",
    fonte === "fixo" && "bg-muted text-muted-foreground",
    fonte === "referencia" && "bg-warning-soft text-warning",
  );
  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          {fonte === "editavel" ? (
            <Link href="/system-settings" className={cn(classe, "hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")} data-testid="rgc-selo-editavel">
              {conteudo}
            </Link>
          ) : (
            <span tabIndex={0} className={cn(classe, "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>{conteudo}</span>
          )}
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[280px] text-xs font-normal leading-relaxed">{f.dica}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── Seção da documentação ────────────────────────────────────────────────────
export function Secao({ id, grupo, titulo, lede, fonte, children }: {
  id: string;
  grupo: string;
  titulo: string;
  lede?: ReactNode;
  fonte?: FonteDoValor;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="rgc-secao" data-testid={`rgc-secao-${id}`}>
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="rgc-grupo m-0">{grupo}</p>
          <h2 id={`${id}-titulo`} tabIndex={-1} className="rgc-titulo m-0 mt-1 text-lg font-semibold leading-7 text-foreground outline-none">
            {titulo}
            <a
              href={`#${id}`}
              className="rgc-ancora ml-1.5 inline-flex items-center justify-center w-6 h-6 align-middle rounded-md text-muted-foreground hover:text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Link para a seção ${titulo}`}
            >
              <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          </h2>
        </div>
        {fonte && <div className="pt-0.5"><SeloDaFonte fonte={fonte} /></div>}
      </header>
      {lede && <p className="m-0 mt-2 max-w-[72ch] text-sm leading-6 text-muted-foreground">{lede}</p>}
      <div className="mt-5 flex flex-col gap-5">{children}</div>
    </section>
  );
}

/** Subtítulo dentro da seção ("Como o sistema aplica"). */
export function Subtitulo({ children }: { children: ReactNode }) {
  return <h3 className="m-0 text-sm font-semibold text-foreground">{children}</h3>;
}

// ── Valor monetário (marca o que foi alterado nos Valores Padrão) ────────────
export function Valor({ cents, padraoCents, forte }: { cents: number; padraoCents?: number; forte?: boolean }) {
  const alterado = padraoCents !== undefined && cents !== padraoCents;
  if (!alterado) {
    return <span className={cn("tabular-nums whitespace-nowrap", forte ? "font-semibold text-foreground" : "font-medium text-slate-700")}>{fmt(cents)}</span>;
  }
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            className="rgc-alterado inline-flex flex-col items-end leading-tight rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${fmt(cents)} — alterado nos Valores Padrão; o padrão do slide é ${fmt(padraoCents)}`}
            data-testid="rgc-valor-alterado"
          >
            <span className="tabular-nums whitespace-nowrap font-semibold text-warning">{fmt(cents)}</span>
            <span className="text-2xs font-normal tabular-nums text-muted-foreground line-through" aria-hidden="true">{fmt(padraoCents)}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs font-normal">
          Alterado nos Valores Padrão · padrão do slide: {fmt(padraoCents)}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── Tabela de referência ─────────────────────────────────────────────────────
/** `curto`: rótulo que aparece sobre o valor quando a linha vira cartão. */
export interface Coluna { rotulo: string; curto?: string; numero?: boolean; largura?: string }
export interface Linha { celulas: ReactNode[]; tipo?: "normal" | "grupo" | "total" | "total-forte"; chave?: string }

/**
 * Tabela limpa: cabeçalho em versalete, números alinhados à direita em
 * algarismos tabulares. Com `cartao`, abaixo de 560px úteis cada linha vira um
 * cartão (o rótulo da coluna aparece sobre o valor) — sem rolagem lateral.
 */
export function Tabela({ legenda, colunas, linhas, cartao, densa, testid }: {
  legenda: string;
  colunas: Coluna[];
  linhas: Linha[];
  /** `true`: cartão abaixo de 620px úteis; `"largo"`: já abaixo de 860px (tabelas de texto). */
  cartao?: boolean | "largo";
  /** Muitas colunas de número: respiro lateral menor. */
  densa?: boolean;
  testid?: string;
}) {
  return (
    <div className={cn("rgc-quadro", cartao && "rgc-com-cartao", cartao === "largo" && "rgc-cartao-largo", densa && "rgc-densa")} data-testid={testid}>
      <table className="rgc-tabela">
        <caption className="sr-only">{legenda}</caption>
        <colgroup>
          {colunas.map((c, i) => <col key={i} style={c.largura ? { width: c.largura } : undefined} />)}
        </colgroup>
        <thead>
          <tr>
            {colunas.map((c, i) => (
              <th key={i} scope="col" className={cn("rgc-th", c.numero && "rgc-th-num")}>{c.rotulo}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, li) => {
            if (l.tipo === "grupo") {
              return (
                <tr key={l.chave ?? li} className="rgc-grupo-linha">
                  <th scope="colgroup" colSpan={colunas.length}>{l.celulas[0]}</th>
                </tr>
              );
            }
            return (
              <tr key={l.chave ?? li} className={cn("rgc-linha", l.tipo === "total" && "rgc-total", l.tipo === "total-forte" && "rgc-total rgc-total-forte")}>
                {l.celulas.map((cel, ci) => {
                  const col = colunas[ci];
                  if (ci === 0) return <th key={ci} scope="row" className="rgc-td rgc-td-rotulo">{cel}</th>;
                  return (
                    <td key={ci} className={cn("rgc-td", col?.numero && "text-right")} data-rotulo={col?.curto ?? col?.rotulo}>{cel}</td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Lista de regras ──────────────────────────────────────────────────────────
export function Regras({ itens, testid }: { itens: { titulo: ReactNode; texto: ReactNode; chave: string }[]; testid?: string }) {
  return (
    <ul className="rgc-regras m-0 p-0 list-none" data-testid={testid}>
      {itens.map(i => (
        <li key={i.chave} className="rgc-regra">
          <span className="rgc-regra-titulo">{i.titulo}</span>
          <span className="rgc-regra-texto">{i.texto}</span>
        </li>
      ))}
    </ul>
  );
}

/** Nota curta ao pé de uma tabela/bloco. `aviso` só quando muda a leitura do número. */
export function Nota({ children, tom = "neutro", icone }: { children: ReactNode; tom?: "neutro" | "aviso" | "info"; icone?: ReactNode }) {
  return (
    <div className={cn(
      "rgc-nota flex items-start gap-2.5 rounded-lg px-3.5 py-2.5 text-xs leading-5",
      tom === "neutro" && "bg-surface-muted text-slate-600",
      tom === "aviso" && "bg-warning-soft text-warning",
      tom === "info" && "bg-brand-soft text-primary",
    )}>
      {icone && <span className="mt-0.5 shrink-0" aria-hidden="true">{icone}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
