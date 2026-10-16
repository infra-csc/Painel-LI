/**
 * Peças visuais do módulo Honorários da cenotécnica (16/10) — uma linguagem só
 * para as três telas (quem pede, o aprovador e o Financeiro):
 *
 *  - dinheiro sempre em `tabular-nums`, alinhado à direita, com o "por diária"
 *    embaixo em cinza (a coluna "cálculo unit aproximado" da planilha);
 *  - a etapa numa pílula do StatusBadge (cor = significado, nunca a tela);
 *  - a barra da verba: quanto do aprovado já foi liberado — o número que o
 *    Financeiro e a produção procuram primeiro.
 */
import type { ReactNode } from "react";
import { StatusBadge, type Tone } from "@/components/common/status-badge";
import { formatarMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  ETAPA_LABEL, POSICAO_CENO_LABEL, SETOR_CENO_LABEL, etapaDoHonorario, ehPosicaoCeno, ehSetorCeno, valorPorDiaria,
  type EtapaDoHonorario,
} from "@shared/honorarios-ceno";

export const brl = (c: number | null | undefined) => formatarMoeda(c ?? 0);

/** "R$ 1.200" quando não há centavos — a lista fica mais limpa; o detalhe mostra completo. */
export function brlCurto(c: number | null | undefined): string {
  const v = c ?? 0;
  if (v % 100 !== 0) return formatarMoeda(v);
  return formatarMoeda(v).replace(/,00$/, "");
}

export const setorLabel = (s: string | null | undefined) => (ehSetorCeno(s) ? SETOR_CENO_LABEL[s] : "Sem setor");
export const posicaoLabel = (p: string | null | undefined) => (ehPosicaoCeno(p) ? POSICAO_CENO_LABEL[p] : "Sem posição");

const fmtData = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const fmtDiaMes = (iso: string | null | undefined) => (iso ? iso.slice(5, 10).split("-").reverse().join("/") : "");
export const dataBr = fmtData;

/** "22/10 – 25/10" (ou "22/10" num dia só); sem datas → "Sem período". */
export function periodoCurto(inicio: string | null | undefined, fim: string | null | undefined): string {
  if (!inicio && !fim) return "Sem período";
  if (!fim || inicio === fim) return fmtDiaMes(inicio ?? fim);
  if (!inicio) return fmtDiaMes(fim);
  return `${fmtDiaMes(inicio)} – ${fmtDiaMes(fim)}`;
}

export const diariasTexto = (n: number | null | undefined) => (n ? `${n} ${n === 1 ? "diária" : "diárias"}` : "Sem diárias");

/** "há 3 h", "ontem", "há 4 dias". */
export function haQuanto(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const min = Math.floor((Date.now() - t) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

export type VisaoDaEtapa = "pedido" | "aprovacao" | "financeiro";

const TOM: Record<EtapaDoHonorario, Tone> = {
  rascunho: "neutral",
  aguardando: "warning",
  devolvido: "primary",
  a_liberar: "success",
  parcial: "info",
  liberada: "success",
};

/** Pílula da etapa. No Financeiro "a liberar" é trabalho pendente (âmbar). */
export function EtapaBadge({ h, visao = "pedido", className }: {
  h: { status: string; valorAprovado: number | null; liberado: number };
  visao?: VisaoDaEtapa;
  className?: string;
}) {
  const etapa = etapaDoHonorario(h);
  let rotulo = ETAPA_LABEL[etapa];
  let tom = TOM[etapa];
  if (etapa === "a_liberar") {
    rotulo = h.status === "aprovado_ajuste" ? "Aprovado c/ ajuste" : "Aprovado";
    if (visao === "financeiro") { rotulo = "A liberar"; tom = "warning"; }
  }
  return <StatusBadge tone={tom} dot className={className} data-testid="etapa-honorario">{rotulo}</StatusBadge>;
}

/** Valor em destaque + "R$ x/diária" embaixo. `riscado`: o pedido original quando houve ajuste. */
export function ValorComDiaria({ valor, diarias, riscado, alinhar = "direita", className }: {
  valor: number | null | undefined;
  diarias: number | null | undefined;
  riscado?: number | null;
  alinhar?: "direita" | "esquerda";
  className?: string;
}) {
  const porDia = valorPorDiaria(valor ?? null, diarias ?? null);
  return (
    <span className={cn("block tabular-nums", alinhar === "direita" ? "text-right" : "text-left", className)}>
      {riscado != null && riscado !== valor && (
        <span className="mr-1.5 text-2xs text-muted-foreground line-through decoration-muted-foreground/60" aria-label={`Pedido: ${brl(riscado)}`}>
          {brlCurto(riscado)}
        </span>
      )}
      <span className="text-sm font-semibold text-foreground">{valor ? brlCurto(valor) : "—"}</span>
      <span className="block text-2xs text-muted-foreground">{porDia != null ? `${brl(porDia)}/diária` : diariasTexto(diarias)}</span>
    </span>
  );
}

/**
 * Barra da verba: liberado sobre aprovado. Verde cheio = tudo liberado; o
 * trecho claro é o que falta. Sem aprovado, não desenha nada.
 */
export function BarraDaVerba({ aprovado, liberado, className, rotulo = true }: { aprovado: number; liberado: number; className?: string; rotulo?: boolean }) {
  if (aprovado <= 0) return null;
  const pct = Math.max(0, Math.min(100, Math.round((liberado / aprovado) * 100)));
  return (
    <span className={cn("block", className)}>
      <span
        className="relative block h-1.5 overflow-hidden rounded-full bg-success-soft ring-1 ring-inset ring-success/15"
        role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
        aria-label={`${pct}% da verba liberada`}
      >
        <span className="absolute inset-y-0 left-0 rounded-full bg-success-strong transition-[width] duration-500 ease-out motion-reduce:transition-none" style={{ width: `${pct}%` }} />
      </span>
      {rotulo && <span className="mt-1 block text-2xs tabular-nums text-muted-foreground">{pct === 100 ? "Tudo liberado" : `${pct}% liberado`}</span>}
    </span>
  );
}

/** Faixa de números do topo: um rótulo miúdo e o valor, separados por filetes. */
export function FaixaDeTotais({ itens, className, testId }: {
  itens: { rotulo: string; valor: ReactNode; detalhe?: ReactNode; destaque?: "warning" | "success" | "primary" }[];
  className?: string;
  testId?: string;
}) {
  return (
    <dl
      data-testid={testId}
      className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-1 sm:grid-cols-4", className)}
    >
      {itens.map((i) => (
        <div key={i.rotulo} className="bg-card px-4 py-3">
          <dt className="flex items-center gap-1.5 text-2xs font-medium text-muted-foreground">
            {i.destaque && <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", i.destaque === "warning" ? "bg-warning-strong" : i.destaque === "success" ? "bg-success-strong" : "bg-primary")} />}
            {i.rotulo}
          </dt>
          <dd className="mt-0.5 text-lg font-semibold leading-7 tracking-[-0.01em] tabular-nums text-foreground">{i.valor}</dd>
          {i.detalhe && <dd className="text-2xs text-muted-foreground">{i.detalhe}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** "Empreita · 3 pessoas" / "#1234 · Cenotécnica". */
export function OrigemDaLinha({ h }: { h: { tipo: string; pessoas: number | null; inclusionNumber: number | null; functionName: string | null } }) {
  if (h.tipo === "empreita") {
    return <span className="text-2xs text-muted-foreground">Empreita{h.pessoas ? ` · ${h.pessoas} ${h.pessoas === 1 ? "pessoa" : "pessoas"}` : ""}</span>;
  }
  return (
    <span className="text-2xs text-muted-foreground">
      {h.inclusionNumber != null && <span className="font-mono tabular-nums">#{h.inclusionNumber}</span>}
      {h.functionName && <> · {h.functionName}</>}
    </span>
  );
}
